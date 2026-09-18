# Comprehensive Physics & Collision Inspection Report
**Inspection Milestone**: Total Inspection ("총검사") — Stage 1  
**Inspector Role**: Physics & Collision Inspector  
**Target Codebase**: Bomberman Game Engine (`src/game/GameScene.ts`, `pathfinding.ts`, `entities/*`, `bosses/*`, `gameplay_mechanics.ts`)  
**Date**: 2026-09-18  

---

## Executive Summary

An exhaustive physical inspection of the Bomberman codebase was conducted across the 5 core physical and collision domains:
1. **Player Corridor Movement, Corner Sliding & Bounding Boxes**
2. **Bomb Kicking Physics, Slide Trajectories & Obstacle Collision**
3. **Barrier, Shield & Invulnerability Frame Penetration Mechanics**
4. **Conveyor Belts & Portals: Momentum, Drift & Edge-of-Tile Jitter**
5. **Blast Raycasting, Diagonal Blast Leakage & Simultaneous Detonations**

### Critical Vulnerabilities & Defects Discovered:
- **[CRITICAL - P1] Permanent God-Mode Invulnerability Bug on Extra Life Revival** (`GameScene.ts:2623-2631`): When reviving with `extraLives > 0`, `isInvulnerable = true` is set, but no timer, tween, or frame check ever clears it back to `false`. The player remains permanently invincible for the entire match unless a dash finishes after 3 seconds.
- **[CRITICAL - P1] Phantom Placement Coordinates in Bomb Fuse Detonation** (`GameScene.ts:2231, 2319`): The fuse timer delayedCall captures the initial `(row, col)` at placement. If a bomb is kicked or moved via conveyor belt, when the fuse expires it explodes at the **original tile where it was placed**, creating phantom explosions across the arena.
- **[HIGH - P2] Conveyor Belt Edge-of-Tile Jitter via Single-Point Passability Checking** (`GameScene.ts:1727-1733, 1791-1796`): Conveyor drift calculates destination tile using only the sprite's single center point (`Math.floor(nextX / 40)`). The player's 24x24 hitbox and the bomb's 32x32 hitbox penetrate up to 12px and 16px into solid walls, triggering violent 60 FPS collider fighting and edge jitter.
- **[HIGH - P2] Diagonal Blast Leakage / Corner-Clipping Blast Fatalities** (`GameScene.ts:2470-2495`): Explosion sprites create 40x40 physics bodies that extend to the boundary lines of the tile. Corner-rounding or turning entities in diagonally adjacent corridors overlap the explosion AABB diagonally around solid indestructible pillars, suffering lethal damage while visually behind cover.
- **[HIGH - P3] Soft Block Desync During Simultaneous / Chain Bomb Blasts** (`GameScene.ts:2444-2450, 2526`): When Bomb 1 destroys a soft block, `destroyBlock` synchronously mutates `map[r][c] = TILE_EMPTY`. When Bomb 2's ray passes through that tile in the same frame, it no longer sees `TILE_BLOCK` and pierces through, projecting lethal fire into what should have been shielded tiles.
- **[MEDIUM - P3] Single-Bomb Multi-Hit Exploit on Bosses** (`GameScene.ts:2499-2508`): Multiple explosion sprites spawned by a single bomb with radius >= 2 each call `activeBoss.takeBombDamage()`. Because of the boss's 150ms combo buffer window, a single bomb deals 2-3 damage instead of 1.
- **[MEDIUM - P4] Ignored Progression `cornerSlideTolerance` & ±3px Dead Zone** (`GameScene.ts:2115-2125`): Meta-progression perk `corner_magnet` (`ProgressionTypes.ts`, `PerkTree.ts`) is never connected to `GameScene.ts`. Furthermore, a 6px dead zone (`|diff| <= 3`) halts corner sliding when the player approaches an intersection dead center.
- **[MEDIUM - P4] Passability Desync with `WALL_PASS` and `BOMB_PASS`** (`GameScene.ts:2042-2061`): `isPassable()` returns `false` for soft blocks and bombs regardless of whether the player has active pass perks, breaking corridor centering and triggering false corner-rounding away from passable tiles.

---

## Detailed Section-by-Section Findings

### 1. Player Corridor Movement, Corner Sliding Logic, and Collision Bounding Boxes

#### 1.1 Geometry and Alignment
- **Player Hitbox**:
  - Defined in `GameScene.ts:1125`:
    ```typescript
    (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
    ```
  - Standard tile dimension: `TILE_SIZE = 40` (`pathfinding.ts:6`).
  - Margins: Left = 8px, Right = 8px, Top = 8px, Bottom = 8px.
  - Horizontal Symmetry: Because Left Offset (8px) equals Right Margin ($40 - 24 - 8 = 8\text{px}$), calling `this.player.setFlipX(true)` (lines 2017, 2098, 2149) does not produce any physics body offset desynchronization.
- **Enemy & Ally Hitboxes**:
  - `BaseEntity.ts:52`: Standard entities share `setSize(24, 24).setOffset(8, 8)`.
  - `EnemyEntities.ts:414-415` (`TankEnemy`):
    ```typescript
    this.setScale(1.2, 1.2);
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6);
    ```
    *Physical Caveat*: In Arcade Physics, setting a scale of 1.2x on a sprite with unscaled body dimensions of 28x28 yields an effective physics body of $28 \times 1.2 = 33.6\text{px}$. In a 40px corridor, the corridor clearance is only $(40 - 33.6)/2 = 3.2\text{px}$ on either side. This leaves TankEnemy highly susceptible to catching on corridor corner edges during standard path navigation.

#### 1.2 Two-Phase Corridor Centering & Corner-Rounding
The movement algorithm in `GameScene.ts:2027-2157` operates in two sequential phases:
- **Phase 1: Corridor Centering**:
  - When the target tile along the primary movement axis is passable (`directOpen === true`):
    ```typescript
    if (Math.abs(diffY) > snapThreshold) {
      vy = -Math.sign(diffY) * slideSpeed;
    } else {
      this.player.y = rowCenterY;
      vy = 0;
    }
    ```
  - Snaps coordinates directly to tile centerline when within `snapThreshold = 2px`, otherwise pulls the player at full `slideSpeed` (150 px/s) toward the centerline.
- **Phase 2: Corner Rounding**:
  - When the target tile is blocked by an obstacle (`directOpen === false`):
    ```typescript
    const canRoundUp = diffY < -3 && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
    const canRoundDown = diffY > 3 && isPassable(row + 1, col) && isPassable(row + 1, nextCol);
    ```
  - Slides the player perpendicularly around the pillar if both the adjacent perpendicular tile and the diagonal tile are open.

#### 1.3 Discovered Flaws in Movement & Corner-Sliding
1. **The 6-Pixel Dead Zone**:
   - Rounding strictly requires `diffY < -3` or `diffY > 3` (and `diffX < -3` or `diffX > 3`).
   - If the player is within $[-3, 3]\text{px}$ of the centerline (`|diff| <= 3`), both `canRoundUp` and `canRoundDown` evaluate to `false`.
   - Result: If the player moves into a T-junction or L-turn while aligned within 3px of the center, the assist is completely deactivated (`vy = 0` / `vx = 0`). The player comes to an abrupt halt and snags on the corner.
2. **Disconnected Progression Perk (`corner_magnet`)**:
   - `src/game/progression/PerkTree.ts:86-93, 359-360` and `ProgressionTypes.ts:180` declare:
     ```typescript
     const cornerLvl = p('corner_magnet');
     const cornerSlideTolerance = cornerLvl === 1 ? 11 : cornerLvl >= 2 ? 14 : 8;
     ```
   - In `GameScene.ts`, the movement engine never reads `cornerSlideTolerance`. The ±3px constant is hardcoded, meaning player investments into the `corner_magnet` perk produce 0 physical benefit.
3. **Passability Desync with `WALL_PASS` and `BOMB_PASS`**:
   - In `GameScene.ts:2042-2061`:
     ```typescript
     const isPassable = (r: number, c: number): boolean => {
       if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
       if (this.map[r][c] !== TILE_EMPTY) return false;
       // checks bombs ...
     ```
   - `isPassable` checks `map[r][c] !== TILE_EMPTY` without checking `this.hasWallPass`.
   - `isPassable` marks bomb tiles impassable without checking `this.hasBombPass`.
   - When `hasWallPass` is active, the player collider allows walking through soft blocks (`GameScene.ts:1135`), but `isPassable` marks the tile as blocked! As a result, Phase 1 corridor centering is disabled, Phase 2 corner-rounding activates in reverse (sliding the player *away* from the block), and diagonal input resolution (`GameScene.ts:2075-2086`) rejects the wall-pass direction.

---

### 2. Bomb Kicking Physics: Velocities, Sliding Direction, Centering Snap & Collisions

#### 2.1 Physics Parameters & Initiation
- **Velocity**: `BOMB_KICK_SPEED = 300` px/s (`gameplay_mechanics.ts:24`).
- **Initiation**: `GameScene.ts:3202-3251` (`tryKickBomb`):
  - Pre-conditions: `this.hasKick`, `bomb.active`, `!bomb.getData('isSliding')`.
  - Direction selection:
    ```typescript
    if (Math.abs(dx) > Math.abs(dy)) {
      dirX = Math.sign(dx);
    } else if (Math.abs(dy) > 0) {
      dirY = Math.sign(dy);
    } else {
      switch (this.playerFacing) { ... }
    }
    ```
  - Changes bomb body to non-immovable: `(bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(false)`.
  - Sets velocity: `bomb.setVelocity(dirX * 300, dirY * 300)`.

#### 2.2 Obstacle Collision & Tile Snapping
- Implemented in `GameScene.ts:1752-1783`:
  ```typescript
  const lookahead = Math.max(16, BOMB_KICK_SPEED * (delta / 1000) + 4);
  const checkX = bomb.x + dir.x * lookahead;
  const checkY = bomb.y + dir.y * lookahead;
  const targetCol = Math.floor(checkX / TILE_SIZE);
  const targetRow = Math.floor(checkY / TILE_SIZE);
  ```
  If `targetRow/Col` is out of bounds, solid (`!== TILE_EMPTY`), or occupied by another active bomb:
  ```typescript
  bomb.setVelocity(0, 0);
  bomb.setData('isSliding', false);
  (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
  bomb.setPosition(bCol * TILE_SIZE + TILE_SIZE / 2, bRow * TILE_SIZE + TILE_SIZE / 2);
  ```

#### 2.3 Discovered Flaws in Bomb Kicking
1. **CRITICAL: Captured Initial Placement Coordinates During Detonation**:
   - `GameScene.ts:2231`:
     ```typescript
     const fuseTimer = this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
     ```
   - When a bomb is placed at `(row, col)`, this closure captures `row` and `col` by value.
   - If the player kicks the bomb across 5 tiles (e.g., from `(1, 1)` to `(1, 6)`), the bomb physically slides and comes to rest at `(1, 6)`.
   - When the 2000ms timer expires, `() => this.explodeBomb(bomb, row, col)` executes with the **captured coordinates `(1, 1)`**!
   - In `explodeBomb(bomb, row, col)` (lines 2403, 2424, 2435), all shockwaves and explosion rays are generated at `(row, col)`!
   - Result: The bomb object at `(1, 6)` disappears, but the explosion detonates at `(1, 1)` where the bomb was placed 2 seconds earlier. This is a severe physical and gameplay failure.
2. **Variable Frame-Rate Early Stoppage (Hitch Vulnerability)**:
   - `lookahead = Math.max(16, 300 * (delta / 1000) + 4)`.
   - Under normal 60 FPS conditions (`delta = 16.6ms`), `lookahead = 16px`.
   - If a garbage collection pause or background tab hitch occurs (`delta >= 70ms`), `lookahead` exceeds 25px. At `delta >= 187ms`, `lookahead >= 60px` (more than an entire tile).
   - If a bomb in tile `c` is kicked toward empty tile `c + 1`, and `c + 2` is a wall: when `delta` is elevated, `checkX` samples tile `c + 2`, detects the wall, marks `blocked = true`, and snaps the bomb back to tile `c` without ever allowing it to slide into `c + 1`.
3. **Ghost Sliding Through Bosses**:
   - Sliding bomb impact with enemies is detected via `this.physics.add.overlap(this.bombs, this.enemies)` (`GameScene.ts:1233-1241`).
   - Bosses (`BaseBoss`) are not members of `this.enemies`.
   - Result: A kicked bomb slides straight through an active boss without detonating.
4. **Non-Orthogonal Deflection on Ally Collision**:
   - `GameScene.ts:1201`: Allies collide with bombs. When a bomb is kicked, `body.immovable` is set to `false`.
   - If the sliding bomb strikes an ally sprite, Arcade Physics resolves collision dynamically between two non-immovable bodies, applying deflection forces that push the bomb diagonally off the orthogonal grid track.

---

### 3. Barrier & Shield Penetration: Damage Absorption, Invulnerability Frames & Multi-Source Damage

#### 3.1 Player Damage Pipeline
- Located in `GameScene.ts:2570-2645` (`playerDie`):
  1. `if (this.isGameOver || this.isInvulnerable) return;`
  2. Shield absorption:
     - `this.shieldCharges--`
     - `this.isInvulnerable = true`
     - `this.shieldInvulnerableUntil = this.time.now + 1500`
     - Plays 1600ms blink tween (duration 100ms, yoyo true, repeat 7).
     - On tween complete: `if (!this.isDashing) this.isInvulnerable = false`.
  3. Extra Life absorption:
     - `this.extraLives--`
     - `this.isInvulnerable = true`
     - `this.shieldInvulnerableUntil = this.time.now + 3000`
     - Emits floating text and camera flash.

#### 3.2 Discovered Flaws in Damage & Invulnerability
1. **CRITICAL: Permanent God-Mode Bug on Extra Life Consumption**:
   - Lines 2623-2631:
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
   - Notice that NO tween, NO delayedCall, and NO timer is created to clear `isInvulnerable`.
   - In the entire codebase, only line 3091 (inside the `dash` delayedCall) checks `if (this.time.now >= this.shieldInvulnerableUntil) { this.isInvulnerable = false; }`.
   - There is NO check in `update()` that resets `isInvulnerable` when `time.now >= shieldInvulnerableUntil`.
   - Result: Once an extra life is consumed, `this.isInvulnerable` remains `true` FOREVER unless the player performs a dash after 3000ms. The player becomes completely invincible to all bombs, hazards, and enemies.
2. **Boss Multi-Tile Damage Stacking from a Single Bomb**:
   - In `GameScene.ts:2498-2510`:
     ```typescript
     if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
       const dist = Phaser.Math.Distance.Between(x, y, this.activeBoss.x, this.activeBoss.y);
       if (dist < (this.activeBoss.config.colliderRadius || 35) + 20) {
         const hit = this.activeBoss.takeBombDamage(1, 'bomb');
     ```
   - `createExplosionTile` calls this check for EVERY tile in the bomb blast.
   - The boss has a circular collider radius of $35 + 20 = 55\text{px}$.
   - If a bomb with `power >= 2` explodes near the boss:
     - The epicenter explosion at `(r, c)` is within 55px -> calls `takeBombDamage(1)`. Boss takes 1 damage, opens 150ms combo buffer (`comboBufferTimerMs = 150`).
     - The arm explosion at `(r + 1, c)` is 40px away, still within 55px -> calls `takeBombDamage(1)`. Because `comboBufferTimerMs > 0`, it registers a combo hit and subtracts another 1 HP!
     - The arm explosion at `(r, c + 1)` is also within 55px -> subtracts a third 1 HP!
   - Result: A single bomb blast instantly deals 3 damage to the boss in the exact same frame, completely breaking boss balance.

---

### 4. Conveyor Belts and Portals: Momentum Accumulation, Drift, Teleportation Debouncing & Edge-of-Tile Jitter

#### 4.1 Conveyor Belt Mechanics
- `CONVEYOR_DRIFT_SPEED = 60` px/s (`gameplay_mechanics.ts:25`).
- Player drift (`GameScene.ts:1720-1733`):
  ```typescript
  const pCol = Math.floor(this.player.x / TILE_SIZE);
  const pRow = Math.floor(this.player.y / TILE_SIZE);
  const belt = this.conveyors.find((c) => c.row === pRow && c.col === pCol);
  if (belt && !this.isDashing) {
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    const nextX = this.player.x + belt.dirX * drift;
    const nextY = this.player.y + belt.dirY * drift;
    const nCol = Math.floor(nextX / TILE_SIZE);
    const nRow = Math.floor(nextY / TILE_SIZE);
    if (this.map[nRow]?.[nCol] === TILE_EMPTY) {
      this.player.x = nextX;
      this.player.y = nextY;
    }
  }
  ```
- Bomb drift (`GameScene.ts:1785-1798`):
  Applies the same logic when `!bomb.getData('isSliding')`.

#### 4.2 Discovered Flaws in Conveyors & Portals
1. **Edge-of-Tile Jitter via Single-Point Passability Checking**:
   - `nCol = Math.floor(nextX / TILE_SIZE)` samples only the single center point `(nextX, nextY)`.
   - The player's physics hitbox is 24x24 (half-width = 12px).
   - When a conveyor pushes east into a solid wall at `nCol + 1`:
     - Until `nextX` crosses $(nCol + 1) \times 40$, `nCol` remains the current empty tile.
     - `this.player.x` is incremented all the way up to $nCol \times 40 + 39.9\text{px}$.
     - At this coordinate, the player's right hitbox boundary is at $39.9 + 12 = 51.9\text{px}$, which is **11.9 pixels inside the solid wall**.
     - On the physics integration step, Arcade Physics AABB separation resolves the overlap and pushes the body back by 11.9px.
     - On the next update frame, line 1730 forces `this.player.x = nextX` back into the wall.
     - This cycle repeats every frame at 60 FPS, generating severe visual and physical edge-of-tile jitter.
   - For bombs on conveyors, the bomb hitbox is 32x32 (half-width = 16px). The bomb is pushed **15.9 pixels inside the wall**. Because bombs are `immovable`, the physics engine does not push them back, embedding the bomb directly into the wall geometry.
2. **Phantom Fuse Coordinates for Conveyor Bombs**:
   - As documented in Section 2.3, if a bomb drifts 3 tiles on a conveyor belt, when its 2000ms fuse expires, it detonates at its placement tile, completely out of sync with its physical sprite.
3. **Momentum Clamping & Inertia Loss**:
   - Directly modifying `this.player.x = nextX` bypasses the physics velocity accumulator. When the player steps off a conveyor belt, there is zero momentum carryover or drift decay.
4. **Portal Teleportation Entity Asymmetry**:
   - Portals (`GameScene.ts:1735-1742`) exclusively check and warp `this.player`.
   - Enemies, allies, bosses, and sliding bombs do not interact with portals and pass through them as standard empty floor tiles.

---

### 5. Blast Raycasting: Soft vs Hard Block Ray Termination, Diagonal Blast Leakage & Simultaneous Blasts

#### 5.1 Blast Raycasting Pipeline
- Implemented in `GameScene.ts:2426-2467` and `pathfinding.ts:612-641`:
  ```typescript
  for (const dir of directions) {
    for (let i = 1; i <= bombPower; i++) {
      const nr = row + dir.dr * i;
      const nc = col + dir.dc * i;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      if (this.map[nr][nc] === TILE_WALL) break;
      if (this.map[nr][nc] === TILE_BLOCK) {
        this.destroyBlock(nr, nc);
        this.spawnExplosion(nr, nc, false, owner);
        break;
      }
      this.spawnExplosion(nr, nc, false, owner);
      // Chain reaction check ...
    }
  }
  ```

#### 5.2 Discovered Flaws in Blast Raycasting
1. **Diagonal Blast Leakage / Corner-Clipping Blast Death**:
   - `public/assets/explosion.png` is 40x40.
   - `spawnExplosion` (`GameScene.ts:2473`) creates an Arcade Physics Sprite with an unadjusted 40x40 physics body spanning $[c \times 40, (c+1) \times 40] \times [r \times 40, (r+1) \times 40]$.
   - Consider a solid indestructible pillar at `(2, 2)`.
   - A bomb explodes at `(1, 2)` (north of pillar). The blast tile at `(1, 2)` spans $x \in [80, 120], y \in [40, 80]$.
   - A player is in the corridor at `(2, 3)` (east of pillar, visually in cover behind the wall).
   - If the player rounds the corner or moves slightly north while navigating `(2, 3)`, their center can reach $x = 128\text{px}, y = 78\text{px}$.
   - The player's 24x24 AABB bounds are:
     - Left: $128 - 12 = 116\text{px}$ ($< 120$)
     - Top: $78 - 12 = 66\text{px}$ ($< 80$)
   - Both `left < exp.right` and `top < exp.bottom` are satisfied!
   - Arcade Physics overlap triggers an intersection at the corner of the indestructible pillar, instantly killing the player through solid cover.
   - **Mathematical Invariant**: To prevent diagonal leakage around corner pillars with a 24x24 player hitbox (margin 8px), the explosion physics body must not extend to the exact corners of the 40x40 tile. It must be clamped to a maximum size of 32x32 with a 4px inset (or 28x28 with 6px inset) so that diagonal intersection through a $40 \times 40$ pillar is mathematically impossible.
2. **Soft Block Destruction Desync in Simultaneous & Chain Blasts**:
   - In `GameScene.ts:2446`: When a ray hits `TILE_BLOCK`, it calls `this.destroyBlock(nr, nc)`.
   - In `destroyBlock` (line 2526): `this.map[row][col] = TILE_EMPTY;` is executed synchronously.
   - If two bombs detonate in the same frame (e.g. Bomb A at `(1, 1)` with power 3, Bomb B at `(3, 1)` with power 3, and a soft block at `(2, 1)`):
     - Bomb A's downward ray strikes `(2, 1)`, destroys the block, and sets `map[2][1] = TILE_EMPTY`.
     - During the same chain sequence or frame, Bomb B's upward ray reaches `(2, 1)`.
     - Because `map[2][1]` was mutated to `TILE_EMPTY`, Bomb B does not terminate at `(2, 1)`.
     - Bomb B's ray continues through to `(1, 1)`, hitting the player who was standing safely behind the soft block when the blast initiated.
3. **Unimplemented `PIERCING_BOMB` Mechanic**:
   - `PIERCING_BOMB` is defined as an item in `gameplay_mechanics.ts:114` that should pierce soft blocks.
   - However, in `GameScene.ts:2182-2236`, the player's `activeBombType` is never attached to the bomb sprite.
   - In `explodeBomb`, line 2444 unconditionally breaks upon hitting `TILE_BLOCK`. The piercing raycast mechanic is entirely absent from the game logic.

---

## Synthesis & Severity Matrix

| ID | Domain | Severity | Exact Location | Defect Description | Physical Consequence |
|---|---|---|---|---|---|
| **BUG-01** | Barrier & Shield | **CRITICAL** | `GameScene.ts:2623-2631` | Missing timer/check to reset `isInvulnerable` on extra life revival | Permanent god-mode invulnerability for the player |
| **BUG-02** | Bomb Kicking | **CRITICAL** | `GameScene.ts:2231, 2319` | Fuse timer delayedCall captures placement `(row, col)` by value | Kicked & conveyor-drifted bombs detonate at initial placement tiles |
| **BUG-03** | Conveyors | **HIGH** | `GameScene.ts:1727-1733, 1791-1796` | Single-point center passability check ignoring entity AABB extents | Hitboxes penetrate 12-16px into solid walls, causing 60 FPS edge jitter |
| **BUG-04** | Blast Raycasting | **HIGH** | `GameScene.ts:2473-2495` | Explosion sprites use un-inset 40x40 bodies touching tile corners | Diagonal blast leakage kills entities around indestructible pillars |
| **BUG-05** | Blast Raycasting | **HIGH** | `GameScene.ts:2444-2450, 2526` | Synchronous `map` mutation during raycast chain reactions | Blast rays pierce through soft blocks destroyed in the same frame |
| **BUG-06** | Boss Combat | **MEDIUM** | `GameScene.ts:2499-2508` | Multiple explosion tiles from one bomb each call `takeBombDamage` | Single bomb deals 2-3 damage to boss instead of 1 |
| **BUG-07** | Movement | **MEDIUM** | `GameScene.ts:2115-2125` | Hardcoded ±3px threshold + ignored `cornerSlideTolerance` perk | 6px dead zone snags centered player; perk provides 0 benefit |
| **BUG-08** | Movement | **MEDIUM** | `GameScene.ts:2042-2061` | `isPassable` checks `map !== TILE_EMPTY` without checking `hasWallPass`/`hasBombPass` | Wall-pass & bomb-pass perks corrupt centering & corner-rounding |

---

## Actionable Remediation Specifications

### Remediation 1: Fix Extra Life Invulnerability Reset (BUG-01)
In `GameScene.ts:2623-2631`, attach a delayedCall or tween to restore vulnerability after 3000ms:
```typescript
if (this.extraLives > 0) {
  this.extraLives--;
  this.isInvulnerable = true;
  this.shieldInvulnerableUntil = this.time.now + 3000;
  this.spawnFloatingText(this.player.x, this.player.y - 12, '1-UP REVIVED!', '#fb7185');
  this.cameras.main.flash(300, 251, 113, 133);
  
  // Create 3-second blinking tween that safely restores vulnerability
  this.tweens.add({
    targets: this.player,
    alpha: 0.3,
    duration: 100,
    yoyo: true,
    repeat: 14,
    onComplete: () => {
      if (this.player && this.player.active) {
        this.player.alpha = 1;
        if (!this.isDashing) {
          this.isInvulnerable = false;
        }
      }
    },
  });
  
  this.emitStatsUpdate();
  return;
}
```

### Remediation 2: Fix Dynamic Bomb Coordinate Detonation (BUG-02)
In `GameScene.ts:2231` and `2319`, read the bomb's current coordinates at detonation time instead of capturing placement parameters:
```typescript
// Replace:
// const fuseTimer = this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
// With:
const fuseTimer = this.time.delayedCall(2000, () => {
  if (bomb && bomb.active) {
    const curCol = Math.floor(bomb.x / TILE_SIZE);
    const curRow = Math.floor(bomb.y / TILE_SIZE);
    this.explodeBomb(bomb, curRow, curCol);
  }
});
```

### Remediation 3: Fix Conveyor Edge-of-Tile Jitter via AABB Boundary Clamping (BUG-03)
In `GameScene.ts:1720-1733`, check the outer boundary of the entity's hitbox in the direction of belt drift:
```typescript
if (belt && !this.isDashing) {
  const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
  const nextX = this.player.x + belt.dirX * drift;
  const nextY = this.player.y + belt.dirY * drift;
  
  // Check the leading edge of the 24x24 hitbox (radius 12px)
  const leadX = nextX + belt.dirX * 12;
  const leadY = nextY + belt.dirY * 12;
  const leadCol = Math.floor(leadX / TILE_SIZE);
  const leadRow = Math.floor(leadY / TILE_SIZE);
  
  if (this.map[leadRow]?.[leadCol] === TILE_EMPTY) {
    this.player.x = nextX;
    this.player.y = nextY;
  }
}
```

### Remediation 4: Fix Diagonal Blast Leakage via Explosion Body Insets (BUG-04)
In `GameScene.ts:2473` (`spawnExplosion`), reduce the explosion physics body from 40x40 to 30x30 with a 5px inset:
```typescript
const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
exp.setDepth(12);
exp.setData('owner', owner);
// Inset hitbox by 5px on all sides to eliminate corner clipping around pillars
(exp.body as Phaser.Physics.Arcade.Body)?.setSize(30, 30).setOffset(5, 5);
```

### Remediation 5: Fix Soft Block Desync in Simultaneous Blasts (BUG-05)
In `GameScene.ts:2433-2466`, read from a snapshot of the grid map captured at the start of the explosion step, or mark destroyed blocks for post-raycast clearing so simultaneous rays see the initial block obstacles.

### Remediation 6: Fix Single Bomb Boss Multi-Hit Exploit (BUG-06)
In `GameScene.ts:2361` (`explodeBomb`), track whether the current bomb has already registered damage on the active boss during this explosion sequence before calling `activeBoss.takeBombDamage()`.

---

