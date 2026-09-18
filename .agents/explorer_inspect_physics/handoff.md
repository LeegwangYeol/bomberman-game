# Handoff Report: Physics & Collision Inspection

**Agent**: Physics & Collision Inspector (`explorer_inspect_physics`)  
**Milestone**: Total Inspection ("총검사") — Stage 1  
**Recipient**: Parent Orchestrator (`aa0b6d8f-15cd-47a9-98b9-32048d20bdc6`)  
**Working Directory**: `/Users/user/src/bomberman/.agents/explorer_inspect_physics/`  
**Reference Findings**: `/Users/user/src/bomberman/.agents/explorer_inspect_physics/findings.md`  

---

## 1. Observation

Direct observations from source code inspection:

### 1.1 Extra Life Invulnerability Reset Missing
- **File**: `src/game/GameScene.ts:2623-2631`
- **Verbatim Code**:
  ```typescript
  if (this.extraLives > 0) {
    this.extraLives--;
    this.isInvulnerable = true;
    this.shieldInvulnerableUntil = this.time.now + 3000;
    this.spawnFloatingText(this.player.x, this.player.y - 12, '1-UP REVIVED!', '#fb7185');
    this.cameras.main.flash(300, 251, 113, 133);
    this.emitStatsUpdate();
    return;
  }
  ```
- **Codebase Search**: Grepping for `this.isInvulnerable = false` in `src/game/GameScene.ts` yields exactly 4 occurrences:
  - Line 1037: `this.isInvulnerable = false;` (initialization in `create()`)
  - Line 1622: `this.isInvulnerable = false;` (in `update()` when `aegisDurationMs <= 0`)
  - Line 2613: `this.isInvulnerable = false;` (in shield i-frame tween `onComplete`)
  - Line 3091: `if (this.time.now >= this.shieldInvulnerableUntil) { this.isInvulnerable = false; }` (in `dash` delayedCall `onComplete`)
- **Direct Fact**: No tween, delayedCall, or update-loop check resets `this.isInvulnerable = false` following an extra-life revival.

### 1.2 Bomb Detonation Coordinate Capture in Closure
- **File**: `src/game/GameScene.ts:2231` (and `2319` for enemy bombs)
- **Verbatim Code**:
  ```typescript
  // In placeBomb():
  const col = Math.floor(this.player.x / TILE_SIZE);
  const row = Math.floor(this.player.y / TILE_SIZE);
  // ...
  const fuseTimer = this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
  ```
- **File**: `src/game/GameScene.ts:2361, 2403-2404, 2424`
- **Verbatim Code**:
  ```typescript
  explodeBomb(bomb: Phaser.Physics.Arcade.Sprite, row: number, col: number) {
    // ...
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;
    // ...
    this.spawnExplosion(row, col, true, owner);
  ```
- **Direct Fact**: `explodeBomb` consumes the captured primitive parameters `row` and `col` rather than querying `Math.floor(bomb.x / TILE_SIZE)` and `Math.floor(bomb.y / TILE_SIZE)`.

### 1.3 Conveyor Belt Single-Point Passability Check
- **File**: `src/game/GameScene.ts:1724-1732`
- **Verbatim Code**:
  ```typescript
  const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
  const nextX = this.player.x + belt.dirX * drift;
  const nextY = this.player.y + belt.dirY * drift;
  const nCol = Math.floor(nextX / TILE_SIZE);
  const nRow = Math.floor(nextY / TILE_SIZE);
  if (this.map[nRow]?.[nCol] === TILE_EMPTY) {
    this.player.x = nextX;
    this.player.y = nextY;
  }
  ```
- **File**: `src/game/GameScene.ts:1125`
  ```typescript
  (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
  ```
- **Direct Fact**: `nCol` and `nRow` represent the tile index of the center point `(nextX, nextY)`. The player's hitbox radius is 12px. Until `nextX` crosses $(nCol + 1) \times 40$, `this.map[nRow]?.[nCol]` is `TILE_EMPTY`, permitting `this.player.x` to advance up to $nCol \times 40 + 39.9\text{px}$, which projects the right boundary $12\text{px}$ into the adjacent solid tile.

### 1.4 Explosion Sprite Body Size & Diagonal Overlap
- **File**: `public/assets/explosion.png`
  - Command: `file public/assets/explosion.png`
  - Output: `PNG image data, 40 x 40, 8-bit/color RGBA, non-interlaced`
- **File**: `src/game/GameScene.ts:2473`
- **Verbatim Code**:
  ```typescript
  const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
  exp.setDepth(12);
  exp.setData('owner', owner);
  ```
- **Direct Fact**: `exp` is never given an explicit body size or offset; it defaults to a 40x40 body occupying the entire tile.

### 1.5 Soft Block Destruction Mutation in Raycast Loop
- **File**: `src/game/GameScene.ts:2444-2450, 2526`
- **Verbatim Code**:
  ```typescript
  if (this.map[nr][nc] === TILE_BLOCK) {
    this.destroyBlock(nr, nc);
    this.spawnExplosion(nr, nc, false, owner);
    break;
  }
  // in destroyBlock():
  this.map[row][col] = TILE_EMPTY;
  ```
- **Direct Fact**: `this.map[row][col]` is mutated to `TILE_EMPTY` synchronously during ray propagation.

---

## 2. Logic Chain

1. **Extra Life Invulnerability (BUG-01)**:
   - Observation 1.1 shows that triggering an extra life revival sets `this.isInvulnerable = true` and `this.shieldInvulnerableUntil = this.time.now + 3000`.
   - The only logic resetting `this.isInvulnerable = false` based on `shieldInvulnerableUntil` resides inside the completion callback of `dash` (line 3091).
   - If the player does not initiate and complete a dash after 3000ms, `this.isInvulnerable` is never set back to `false`.
   - *Inference*: Any player who consumes an extra life becomes permanently invulnerable to all explosion and enemy damage for the remainder of the session unless they execute a dash.

2. **Phantom Bomb Detonations (BUG-02)**:
   - Observation 1.2 shows that `fuseTimer` captures the placement tile coordinates `(row, col)` at the moment `placeBomb()` is called.
   - When a bomb is kicked via `tryKickBomb` (`BOMB_KICK_SPEED = 300` px/s) or pushed by a conveyor belt (`CONVEYOR_DRIFT_SPEED = 60` px/s), its sprite and physics body move to a new tile $(row', col')$.
   - When the 2000ms fuse timer fires, it invokes `explodeBomb(bomb, row, col)` passing the captured placement coordinates $(row, col)$.
   - *Inference*: Kicked or drifted bombs detonate at their original placement tile, creating ghost explosions where the bomb used to be and leaving the target tile unexploded.

3. **Conveyor Edge Jitter (BUG-03)**:
   - Observation 1.3 shows that conveyor drift checks passability solely by `Math.floor(nextX / TILE_SIZE)`.
   - A player with a 24x24 AABB has half-extents of 12px.
   - When pushed towards a wall, `this.player.x` is updated to coordinates where the 12px leading edge penetrates up to 11.9px into the solid tile before `Math.floor` flips to the wall tile.
   - On the physics step, Phaser Arcade Physics collider separates the player from the wall, pushing the body back.
   - On the next update frame, conveyor drift teleports the player forward into the wall again.
   - *Inference*: This generates an alternating 60 FPS penetration-separation cycle, resulting in visible edge-of-tile jitter.

4. **Diagonal Blast Leakage (BUG-04)**:
   - Observation 1.4 shows that explosion sprites instantiate 40x40 physics bodies with 0px margin.
   - When an explosion occupies tile `(r, c)`, its body spans up to corner coordinate $((c+1) \times 40, (r+1) \times 40)$.
   - A solid indestructible pillar exists at `(r+1, c)`.
   - An entity moving through corridor `(r+1, c+1)` rounding near the pillar has its 24x24 hitbox extend into the corner quadrant where `x < (c+1) * 40` and `y < (r+1) * 40`.
   - Because both AABB overlap conditions are satisfied across the diagonal vertex, Arcade Physics detects an intersection.
   - *Inference*: Entities standing behind solid indestructible pillars are struck and killed diagonally by blasts around the corner.

5. **Simultaneous Raycast Desync (BUG-05)**:
   - Observation 1.5 shows that destroying a soft block immediately sets `map[row][col] = TILE_EMPTY`.
   - When two bombs explode simultaneously (or in immediate chain reaction), Bomb 1's ray clears the soft block.
   - When Bomb 2's ray reaches that same tile within the same frame, `this.map[nr][nc] === TILE_BLOCK` evaluates to `false`.
   - *Inference*: Bomb 2's ray does not terminate; it pierces straight through the destroyed block, hitting entities that were shielded when the detonation commenced.

---

## 3. Caveats

- **Scope Boundary**: This investigation was strictly read-only per Teamwork explorer constraints. No source files under `src/game/` were modified.
- **Phaser Arcade Physics Internal Invariants**: The behavior of Arcade Physics body scaling under tween scale modifications is known to leave `body.width` unchanged unless `body.syncBounds` is enabled; our analysis accounts for this default behavior.
- **Web Audio Synthesis**: Audio voice synthesis during explosions and impacts was audited for physical memory leaks, but acoustic tone fidelity was not within scope.

---

## 4. Conclusion

The Bomberman physics, movement, and collision subsystem has sound foundational mechanics (2-phase corridor centering, 24x24 symmetric hitboxes, and isolated bomb groups), but harbors **two critical defects** (BUG-01 permanent god-mode upon extra-life revival; BUG-02 phantom blast coordinates on kicked/conveyor bombs) along with **three high-severity defects** (BUG-03 conveyor wall penetration jitter; BUG-04 diagonal blast corner-leakage; BUG-05 simultaneous soft-block ray piercing).

All five defects are fully documented with mathematical models, line-by-line evidence chains, and concrete remediation code in `findings.md`.

---

## 5. Verification Method

To independently reproduce, inspect, and verify the findings:

### 5.1 Verification Commands
1. **Existing Baseline Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: All 422 tests currently pass, confirming that existing suites do not test for these specific edge cases (e.g. extra life invulnerability expiry, kicked bomb detonation coordinates, or diagonal explosion AABB leakage).

2. **Linter & Compiler Integrity**:
   ```bash
   npm run lint
   npm run build
   ```
   *Expected Result*: 0 errors.

### 5.2 Inspection Locations
- Inspect `src/game/GameScene.ts:2623-2631`: Verify absence of `this.isInvulnerable = false` restoration for `extraLives`.
- Inspect `src/game/GameScene.ts:2231`: Verify `fuseTimer` closure binds `row, col` at placement time.
- Inspect `src/game/GameScene.ts:1724-1732`: Verify conveyor passability relies solely on `Math.floor(nextX / TILE_SIZE)`.
- Inspect `src/game/GameScene.ts:2473`: Verify `this.explosions.create` does not call `setSize()` or `setOffset()`.

### 5.3 Invalidation Conditions
- **BUG-01 is invalidated if**: An external manager or update routine regularly checks `this.time.now >= this.shieldInvulnerableUntil` and clears `this.isInvulnerable`. (Code search confirmed this only exists on line 3091 inside dash completion).
- **BUG-02 is invalidated if**: `explodeBomb` ignores its arguments and reads `bomb.x` and `bomb.y`. (Lines 2403-2404 and 2435 prove it uses the passed `row, col`).
