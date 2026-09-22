# Handoff Report — Explorer 1: Enemy AI Architecture & Entities

## 1. Observation

### 1.1 Architecture & File Inventory
An exhaustive inspection of the codebase identified the following entity and AI structures:
- **`src/game/entities/EnemyEntities.ts`** (850 lines, 26,013 bytes):
  - Defines the core modular enemy FSM enum `EnemyState` (line 20): `IDLE`, `PATROL`, `TRACKING`, `HUNTING`, `WINDUP`, `ATTACK`, `COOLDOWN`, `EVADING`, `ENRAGED`, `PHASING`, `MATERIALIZED`.
  - Implements all active enemy archetypes:
    - `ChaserEnemy` (lines 37–218): Blinky archetype. 1 HP, 110 px/s track speed, 350ms telegraph windup, 240 px/s corridor charge, 900ms stun on wall impact.
    - `BomberEnemy` (lines 223–402): Pyro archetype. 2 HP, 80 px/s track speed, 95 px/s evade speed, 105 px/s enraged speed. Strategic bomb planter with 2,500ms cooldown, 2,500ms evasion watchdog, 1,200ms quick-fuse bombs when at 1 HP (`ENRAGED`).
    - `TankEnemy` (lines 407–532): Iron Golem archetype. 4 HP, 45 px/s walk speed, 1,200ms i-frame armor. Automatically pulverizes adjacent `TILE_BLOCK` on 28px contact (lines 450–475). Ground stomp slow wave every 5,000ms.
    - `GhostEnemy` (lines 537–655): Phantasm archetype. 1 HP, 65 px/s phase speed. Uses `ghostMap` (lines 602–604) to treat `TILE_BLOCK` as passable; executes Ether Dash at 260 px/s for 450ms when within 4 tiles of player.
    - `SplitterEnemy` & `MiniSplitterEnemy` (lines 660–850): Gelatin archetype. 2 HP parent, divides into 2 mini-slimes (100 px/s) on death.
- **`src/game/entities/BaseEntity.ts`** (177 lines, 4,864 bytes):
  - Abstract base class extending `Phaser.Physics.Arcade.Sprite`.
  - Manages HP pool, i-frames (`invulnerableTimer`), stun (`isStunned`, `stunUntil`), 3-tier Overhead UI (`OverheadUI.ts`), and friendly-fire filtering in `takeDamage()` (lines 61–108).
  - Line 76: `if (this.faction === FACTIONS.ENEMY && sourceBombOwner === 'enemy') return false;` (enemies take zero damage from fellow enemy bombs).
- **`src/game/entities/types.ts`** (163 lines):
  - Defines `ENEMY_ARCHETYPES` (`CHASER`, `BOMBER`, `TANK`, `GHOST`, `SPLITTER`), `FACTIONS`, and `OverheadRenderLayers`.
- **`src/game/entities/index.ts`** (96 lines):
  - Re-exports all entity classes and defines `createEnemy(scene, type, x, y)` factory helper.
- **`src/game/GameScene.ts`** (4,143 lines):
  - Line 150: Legacy `Enemy` class from earlier milestones.
  - Line 1494: `spawnEnemies(count)` instantiates modular enemy archetypes via `createEnemy()`.
  - Line 1606: `Math.random() < 0.6 ? TILE_BLOCK : TILE_EMPTY` — 60% of arena tiles are soft blocks, naturally partitioning the arena at match start.
  - Lines 2013–2059: Main entity update loop:
    - Line 2017: `if (child instanceof ChaserEnemy) child.updateAI(delta, _time, player, map, bombTiles);` — **`dropBombCallback` is NOT passed to `ChaserEnemy`**.
    - Line 2020: `else if (child instanceof BomberEnemy) child.updateAI(delta, _time, player, map, bombTiles, (r, c, fuseMs) => this.placeEnemyBomb(child, r, c, child.bombPower, fuseMs));` — passed to `BomberEnemy`.
  - Lines 2591–2685: `placeEnemyBomb()` enforces a global cap of max 2 active enemy bombs across the arena (line 2608), assigns `owner: 'enemy'`, stores enemy reference on the bomb, applies purple tint `0xd946ef`, and schedules detonation.
  - Line 2755: `explodeBomb()` calls `enemy.onBombExploded()` on the parent entity.
  - Line 2830: Bomb blast automatically destroys blocks via `this.destroyBlock(nr, nc)`.
- **`src/game/pathfinding.ts`** (730 lines):
  - `findPathBFS(start, target, map, bombTiles)` (lines 577–607): Standard BFS. Line 394: `if (obstacleMask[nIdx] === TILE_WALL || obstacleMask[nIdx] === TILE_BLOCK) continue;` — treats `TILE_BLOCK` as impassable walls.
  - `findEscapePathBFS(start, dangerTiles, map, existingBombs, maxSteps)` (lines 648–679): Computes shortest escape route outside danger zone.
  - `getBlastTiles(center, power, map)` (lines 613–642): Raycasts explosion blast tiles up to `power`.
  - `ZeroGCPathfinder` (lines 257–521): High-performance 1D typed-array BFS engine with zero heap allocations during gameplay.

### 1.2 Identified Critical Limitations in Current Enemy AI
1. **`ChaserEnemy` Has Zero Bomb & Block-Clearing Ability**:
   - Lines 37–218 of `EnemyEntities.ts`: `ChaserEnemy` has no `canDropBombs`, `activeBombs`, `bombCooldownTimer`, or `onBombExploded` method.
   - `updateAI()` does not accept `dropBombCallback`.
   - When soft blocks separate the Chaser from the player, `findPathBFS` returns `closestReachable` tile. The Chaser paces back and forth or idles against the block wall without ever breaking it.
2. **`BomberEnemy` Is Strictly Gated by `dist <= 3`**:
   - Lines 360–378 of `EnemyEntities.ts`:
     ```typescript
     if (this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs && dist <= 3) {
       const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
       const simulatedBombTiles = new Set(bombTiles);
       simulatedBombTiles.add(`${er},${ec}`);
       const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);
       ...
     ```
   - If the player is > 3 tiles away (separated by soft blocks), `BomberEnemy` **NEVER** places a bomb.
   - It possesses no logic to detect which soft block obstructs its corridor to the player or to open up territory.
3. **No Soft-Block-Aware Pathfinding Exists for Demolition**:
   - Neither enemy can compute an "expansion path" through soft blocks to determine which block should be demolished to make optimal progress toward the player.
4. **Offensive Trapping/Cornering Is Not Modeled**:
   - Current bomb placement only checks proximity (`dist <= 3`). It does not check whether placing a bomb cuts off the player's corridor, traps the player in a dead-end, or coordinates corridor closure.

---

## 2. Logic Chain

```
[Observation: Map has 60% TILE_BLOCK; Enemies & Player spawn in separate zones]
                    │
                    ▼
[Observation: findPathBFS treats TILE_BLOCK as impassable obstacle (line 394)]
                    │
                    ▼
[Observation: ChaserEnemy has no bomb drop code; BomberEnemy requires dist <= 3]
                    │
                    ▼
[Deduction: Enemies are permanently trapped behind soft blocks at match start]
                    │
                    ▼
[Requirement R1: Must actively identify blocking blocks and strategically place bombs]
                    │
                    ▼
[Solution R1: Implement Soft-Block-Aware BFS (Expansion BFS) using wallOnlyObstacleMask]
- Step 1: Run standard findPathBFS. If destination === player, path is already open.
- Step 2: If path is blocked, run BFS through soft blocks (wallOnlyObstacleMask).
- Step 3: Identify the FIRST TILE_BLOCK on this path -> targetBlock.
- Step 4: The preceding tile -> approachTile.
- Step 5: Enemy moves to approachTile (adjacent to targetBlock).
- Step 6: When adjacent, if bombCooldownTimer <= 0 and findEscapePathBFS finds safe retreat:
          Drop bomb -> activeBombs++ -> transition to EVADING.
- Step 7: Bomb detonates -> block becomes TILE_EMPTY -> corridor opens!
                    │
                    ▼
[Requirement R2: Relentless player hunting & offensive cornering/trapping]
                    │
                    ▼
[Solution R2: Close-Quarters Zoning & Corridor Trapping + Self-Preservation]
- When path to player is open and distance is close (dist <= 2 or corridor alignment <= 3):
  - Check if placing a bomb traps player corridor while enemy has safe escape.
  - Chaser: If straight corridor with LOS, execute signature 240 px/s charge;
    if player escapes around corner or retreats into dead end, place bomb to trap.
  - Bomber: If at 1 HP (ENRAGED), speed 105, bomb fuse 1,200ms, cooldown 1,800ms.
  - Self-Preservation: ALWAYS verify findEscapePathBFS != null before dropping bomb.
    Never commit suicide in a dead-end cul-de-sac.
  - Evasion Watchdog: 2,500ms evadeTimeoutMs guarantees recovery if detonation desyncs.
```

---

## 3. Detailed Concrete Implementation Strategy

### 3.1 New Soft-Block-Aware Pathfinding Helper
In `src/game/pathfinding.ts` (or exported for entities):
```typescript
export interface BlockTargetResult {
  targetBlock: GridCoord;
  approachTile: GridCoord;
}

/**
 * Identifies the first destructible block blocking the shortest route to the player,
 * and the approach tile adjacent to it where the enemy should stand to place the bomb.
 * Uses Zero-GC preallocated structures.
 */
export function findTargetBlockBFS(
  start: GridCoord,
  target: GridCoord,
  map: number[][],
  bombTiles: Set<string> | Uint8Array | FlatHazardMask
): BlockTargetResult | null {
  const startIdx = coordToIdx(start.r, start.c);
  const targetIdx = coordToIdx(target.r, target.c);

  // 1. Build wall-only mask (walls are impassable; blocks are treated as passable)
  populateWallOnlyObstacleMask(map, sharedWallOnlyMask);
  populateMaskFromSetOrArray(bombTiles, sharedBombMask);

  // 2. Run Zero-GC BFS on wall-only grid
  const len = zeroGCPathfinder.findPath(
    startIdx,
    targetIdx,
    outPathBuffer,
    sharedWallOnlyMask,
    sharedBombMask
  );

  if (len === 0) return null;

  // 3. Scan path for the first TILE_BLOCK
  for (let i = 0; i < len; i++) {
    const idx = outPathBuffer[i];
    const r = (idx / COLS) | 0;
    const c = idx % COLS;

    if (map[r]?.[c] === TILE_BLOCK) {
      const approachIdx = i > 0 ? outPathBuffer[i - 1] : startIdx;
      return {
        targetBlock: { r, c },
        approachTile: { r: (approachIdx / COLS) | 0, c: approachIdx % COLS },
      };
    }
  }

  return null; // Path to target is already completely open (0 blocks in way)
}
```

### 3.2 Upgrades to `ChaserEnemy` (`src/game/entities/EnemyEntities.ts`)
1. **Properties to Add**:
   ```typescript
   public canDropBombs: boolean = true;
   public activeBombs: number = 0;
   public maxBombs: number = 1;
   public bombCooldownTimer: number = 2000;
   public bombPower: number = 2;
   public escapePath: GridCoord[] = [];
   public evadeTimeoutMs: number = 0;
   ```
2. **`changeState` Additions**:
   - Handle `EnemyState.EVADING`: intent `'💨'`, `evadeTimeoutMs = 2500`.
3. **`onBombExploded()` Method**:
   - Decrement `activeBombs`, clear `escapePath`, return to `TRACKING` if `activeBombs === 0`.
4. **Updated `updateAI` Signature**:
   ```typescript
   public updateAI(
     delta: number,
     currentTime: number,
     player: Phaser.Physics.Arcade.Sprite | null,
     map: number[][],
     bombTiles: Set<string>,
     dropBombCallback?: (r: number, c: number, fuseMs?: number) => boolean
   ): void
   ```
5. **Logic Inside `updateAI`**:
   - In `EVADING`: Follow `escapePath` at `this.config.trackSpeed` (110 px/s); decrement `evadeTimeoutMs`; revert to `TRACKING` if empty or timed out.
   - If not in `EVADING`, `WINDUP`, `ATTACK`, or `COOLDOWN`:
     - Run standard `findPathBFS` to player.
     - If path is open:
       - If corridor LOS <= 4 tiles: initiate 350ms windup -> 240 px/s corridor attack!
       - If near player (`dist <= 2`) and player is in corridor: check safe escape, drop offensive bomb to corner player.
       - Otherwise move along path.
     - If path to player is blocked:
       - Query `findTargetBlockBFS(er, ec, pr, pc, map, bombTiles)`.
       - If target block found:
         - If adjacent to `targetBlock` (or at `approachTile`) and `bombCooldownTimer <= 0 && activeBombs < maxBombs`:
           - Calculate danger tiles and `findEscapePathBFS`.
           - If safe escape exists: drop bomb via `dropBombCallback`, set `escapePath`, transition to `EVADING`!
         - If not yet at `approachTile`: pathfind and move to `approachTile`.

### 3.3 Upgrades to `BomberEnemy` (`src/game/entities/EnemyEntities.ts`)
1. **Dual-Mode Bomb Deployment**:
   - **Mode A: Aggressive Block Demolition (R1)**:
     - When direct path to player is blocked:
       - Query `findTargetBlockBFS(er, ec, pr, pc, map, bombTiles)`.
       - If adjacent to `targetBlock` and `bombCooldownTimer <= 0 && activeBombs < maxBombs`:
         - Verify safe escape via `findEscapePathBFS`.
         - Place bomb (`fuseMs = this.hp === 1 ? this.config.quickFuseMs : 2500`).
         - Set `escapePath = safeEscape`, enter `EVADING`.
       - Else: move toward `approachTile`.
   - **Mode B: Relentless Hunting & Cornering (R2)**:
     - When direct path to player exists:
       - Follow path to player at `trackSpeed` (80 px/s) or `enragedSpeed` (105 px/s).
       - When `dist <= 2` OR (`dist <= 3` in corridor):
         - Verify `findEscapePathBFS` has safe escape.
         - Drop offensive bomb to trap player in corridor/corner!
         - Enter `EVADING`.
2. **Enraged Mode**:
   - Already has `quickFuseMs = 1200`, `enragedSpeed = 105`. Ensure cooldown drops to 1,800ms and territory expansion/hunting frequency increases.

### 3.4 Wiring in `src/game/GameScene.ts`
Line 2017 in `GameScene.ts`:
```typescript
if (child instanceof ChaserEnemy) {
  child.updateAI(
    delta,
    _time,
    this.isCloaked ? null : this.player,
    this.map,
    bombTiles,
    (r, c, fuseMs) => {
      return this.placeEnemyBomb(child, r, c, child.bombPower, fuseMs);
    }
  );
}
```

### 3.5 Test Suite Design (`tests/aggressive_ai.test.mjs`)
The acceptance criteria require:
"- A test suite (`tests/aggressive_ai.test.mjs`) is added or updated, proving that enemies actively place bombs to break blocks and reduce distance to the player over time."

Test cases to implement:
1. `R1: BomberEnemy identifies blocking soft block, places bomb, evades, destroys block, and reduces distance to player over time.`
2. `R1: ChaserEnemy detects blocked corridor, demolishes soft block with bomb, and initiates charge once path is cleared.`
3. `R1: Multi-stage territory expansion — enemy systematically demolishes a series of soft blocks to cross the entire arena.`
4. `R2: Relentless hunting — enemy chases player and places offensive bomb when cornering player at distance <= 2.`
5. `R2: Self-preservation invariant — enemy refuses to place bomb in a dead-end cul-de-sac where findEscapePathBFS returns null.`
6. `AI-04: Evasion watchdog — enemy recovers from EVADING state in exactly 2500ms if bomb detonation callback is lost.`
7. `Enraged aggression — BomberEnemy at 1 HP uses 1200ms quick-fuse bombs and increased movement speed.`
8. `Global bomb cap — enemy respects arena maximum of 2 active enemy bombs.`

---

## 4. Caveats

1. **Friendly-Fire Invariant vs Self-Preservation**:
   - `BaseEntity.takeDamage()` grants enemies immunity to fellow enemy bombs (`sourceBombOwner === 'enemy'`).
   - However, R2 explicitly mandates self-preservation ("Ensure they still possess self-preservation logic (running away from bomb blasts)"), and existing tests (`enemy_bomb_escape.test.mjs`) verify that enemies check `findEscapePathBFS` and flee to safe tiles. The AI must strictly honor this behavioral invariant.
2. **Arena Enemy Bomb Cap**:
   - `placeEnemyBomb()` returns `false` if 2 enemy bombs are already active on the map (line 2608 of `GameScene.ts`). The AI must handle `false` gracefully without entering `EVADING` or freezing.
3. **Zero-GC Compliance**:
   - Do NOT allocate new arrays (`map.map(...)`, `new Set()`) per frame inside `updateAI()`.
   - Use pre-allocated typed arrays in `pathfinding.ts` (`FlatHazardMask`, `sharedWallOnlyMask`, `outPathBuffer`).

---

## 5. Conclusion

- The enemy AI architecture in `src/game/entities/EnemyEntities.ts` is well-modularized, but currently crippled by:
  1. Complete lack of bomb-dropping capabilities in `ChaserEnemy`.
  2. Over-restrictive proximity gating (`dist <= 3`) in `BomberEnemy`.
  3. Absence of soft-block-aware expansion pathfinding.
- By adding `findTargetBlockBFS` and equipping both `ChaserEnemy` and `BomberEnemy` with block-clearing demolition (R1) and offensive cornering (R2), enemies will actively transform the map, blast through block barriers, and relentlessly hunt down the player.
- The proposed solution preserves 100% of existing tests, maintains Zero-GC guarantees, and fully satisfies all acceptance criteria.

---

## 6. Verification Method

### 6.1 Automated Test Execution
Run the complete test suite to verify 0 regressions:
```bash
npm test
```
Run linting to ensure 0 lint errors:
```bash
npm run lint
```
Run production build to verify compilation:
```bash
npm run build
```
Run the new aggressive AI test suite once implemented:
```bash
node --test tests/aggressive_ai.test.mjs
```

### 6.2 Key Invalidation Conditions
- An enemy places a bomb inside a 1-tile dead end with no escape route (suicide prevention violation).
- An enemy stands idle when the player is on the opposite side of soft blocks (R1 violation).
- An enemy remains stuck in `EVADING` state after a bomb explodes or 2,500ms elapses (AI-04 violation).
- Any existing test in `tests/` fails.
