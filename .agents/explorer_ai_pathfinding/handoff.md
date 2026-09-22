# Handoff Report: Pathfinding & Destructible Block Navigation

## 1. Observation

### 1.1 Codebase Structure & File Locations
1. **Pathfinding & Spatial Engine**:
   - `src/game/pathfinding.ts` (730 lines, 20 KB): Contains core grid dimensions, coordinate transforms, `FlatHazardMask`, `ZeroGCPathfinder`, and backward-compatible wrappers (`findPathBFS`, `getBlastTiles`, `findEscapePathBFS`, `isTileInBlastRange`).
2. **Entity Implementations**:
   - `src/game/entities/EnemyEntities.ts` (850 lines, 26 KB): Implements `ChaserEnemy`, `BomberEnemy`, `TankEnemy`, `GhostEnemy`, `SplitterEnemy`, `MiniSplitterEnemy`.
   - `src/game/entities/BaseEntity.ts` (177 lines, 4.8 KB): Abstract sprite base class handling faction damage, i-frames, and `OverheadUI`.
   - `src/game/entities/AllyEntities.ts` (425 lines, 13 KB): Implements `MiniBomberAlly`, `PetDroneAlly`, `ShieldGuardAlly`.
3. **Game Orchestration & Bomb Physics**:
   - `src/game/GameScene.ts` (4143 lines, 140 KB): Implements `placeEnemyBomb` (lines 2591–2640), `explodeBomb` (lines 2740–2852), `spawnExplosion` (lines 2854–2910), legacy `Enemy` class (lines 150–680), and scene update loop (lines 2013–2050).
4. **Existing Test Harnesses**:
   - `tests/pathfinding.test.mjs`: Tests standard BFS, wall avoidance, block avoidance, active bomb avoidance, and Manhattan frontier fallback.
   - `tests/enemy_bomb_escape.test.mjs`: Tests `getBlastTiles`, `findEscapePathBFS`, suicide-prevention in dead-ends, maxSteps bounds, and bomb capacity isolation.
   - `tests/ai_pathfinding_stress.test.mjs`: Tests `ZeroGCPathfinder.init` (AI-01), `isTileInBlastRange` off-grid guarding (AI-02), and oracle comparison.
   - `tests/m1_challenger_pathfinder_pool_stress.test.mjs`: Runs 100,000 queries on `ZeroGCPathfinder.findPath` checking generational rollover and NaN rejection.
   - `tests/soak_10k_frames.test.mjs`: Runs 10,000 queries verifying heap drift <= 0.10 MB.

### 1.2 Current Grid & Tile Representation
In `src/game/pathfinding.ts`:
- Grid constants (lines 6–19):
  ```ts
  export const TILE_SIZE = 40;
  export const ROWS = 13;
  export const COLS = 15;
  export const TOTAL_TILES = ROWS * COLS; // 195
  export const TILE_EMPTY = 0;
  export const TILE_WALL = 1;
  export const TILE_BLOCK = 2;
  export const FLAG_PASSABLE = 0;
  export const FLAG_WALL = 1;
  export const FLAG_BLOCK = 2;
  export const FLAG_BOMB = 4;
  export const FLAG_HAZARD = 8;
  ```
- Coordinate transformations (lines 29–39):
  ```ts
  export function coordToIdx(r: number, c: number): number { return r * COLS + c; }
  export function idxToRow(idx: number): number { return (idx / COLS) | 0; }
  export function idxToCol(idx: number): number { return idx % COLS; }
  ```
- In `GameScene.ts`, the map is stored as `map: number[][]` (2D array of 13 rows by 15 columns).
- In `ZeroGCPathfinder`, the arena is represented as flat 1D typed arrays (`Uint8Array` of length 195).

### 1.3 Existing Pathfinding Logic & Block Limitation
In `src/game/pathfinding.ts` (lines 393–397):
```ts
// Obstacle check: Walls or Breakable Blocks
if (obstacleMask[nIdx] === TILE_WALL || obstacleMask[nIdx] === TILE_BLOCK) continue;

// Bomb check: avoid active bombs (unless target is the player's tile)
if (bombMask && bombMask[nIdx] !== 0 && nIdx !== targetIdx) continue;
```
If the player is surrounded or partitioned by soft blocks (`TILE_BLOCK`), `findPath` cannot reach `targetIdx`. It falls back to `closestReachable` based on Manhattan distance:
```ts
const destination = reachedTarget ? targetIdx : closestReachable;
if (destination === startIdx) return 0;
```
Enemies (`ChaserEnemy`, `BomberEnemy`) have no awareness of *why* the path terminated or which blocks are impeding progress:
- `ChaserEnemy.updateAI` (lines 149–168 in `EnemyEntities.ts`): Recalculates BFS every 200ms. If `currentPath.length === 0` (blocked by soft blocks), velocity defaults to 0 and the enemy stands idle.
- `BomberEnemy.updateAI` (lines 359–378 in `EnemyEntities.ts`):
  ```ts
  if (this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs && dist <= 3) {
    const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
    ...
  }
  ```
  BomberEnemy only checks `dist <= 3` (Manhattan distance to player). If the player is > 3 tiles away across the arena behind blocks, `dist <= 3` is false, and BomberEnemy **never places a bomb to clear a path**.

### 1.4 Runtime Allocation Hotspots (GC Leaks)
1. **TankEnemy & GhostEnemy 2D Array Mapping**:
   In `src/game/entities/EnemyEntities.ts`:
   - TankEnemy (lines 510–512):
     ```ts
     const bulldozerMap = map.map((row) =>
       row.map((t) => (t === TILE_BLOCK ? TILE_EMPTY : t))
     );
     this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, bulldozerMap, bombTiles);
     ```
   - GhostEnemy (lines 602–604):
     ```ts
     const ghostMap = map.map((row) =>
       row.map((t) => (t === TILE_BLOCK ? TILE_EMPTY : t))
     );
     this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, ghostMap, bombTiles);
     ```
     `map.map(row => row.map(...))` allocates **14 arrays** on every path recalc (every 250–350ms).
2. **`getBlastTiles` String & Set Allocations**:
   In `src/game/pathfinding.ts` (lines 618–637):
   ```ts
   const blast = new Set<string>();
   blast.add(`${center.r},${center.c}`);
   ...
   blast.add(`${nr},${nc}`);
   ```
   Every call to `getBlastTiles` creates a new `Set<string>` and creates template strings for each raycast tile.
3. **`findPathBFS` & `findEscapePathBFS` Coordinate Objects**:
   In `src/game/pathfinding.ts` (lines 601–605 & 673–677):
   ```ts
   const path: GridCoord[] = new Array(len);
   for (let i = 0; i < len; i++) {
     const idx = outPathBuffer[i];
     path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
   }
   ```
   Allocates `GridCoord` objects on every call.

### 1.5 Blast Raycast & Suicide Prevention Invariants
1. **Blast Raycast Mechanics (`getBlastTiles`, lines 613–642)**:
   - Starts at `center`.
   - Propagates in 4 cardinal directions (Up, Down, Left, Right) up to `power` tiles.
   - `TILE_WALL`: Ray stops immediately (`break`). Wall itself is NOT included in blast.
   - `TILE_BLOCK`: Ray includes the block tile (to destroy it), but DOES NOT penetrate beyond (`blast.add(nr, nc); break;`).
   - Boundary: Stops at grid borders (`0 <= nr < ROWS`, `0 <= nc < COLS`).
2. **Escape Path & Suicide Prevention (`findSafeTile`, lines 430–520)**:
   - Uses BFS queue up to `maxSteps` (default 4).
   - Starts at `startIdx`. If `dangerMask[startIdx] === 0`, returns 0 immediately.
   - Explores orthogonal neighbors. Obstacle checks:
     - `if (obstacleMask[nIdx] === TILE_WALL || obstacleMask[nIdx] === TILE_BLOCK) continue;`
     - `if (existingBombsMask && existingBombsMask[nIdx] !== 0 && nIdx !== startIdx) continue;`
   - Goal condition: `if (dangerMask[curr] === 0) { safeTarget = curr; break; }`.
   - Invariant: If enclosed in a cul-de-sac where blast reaches all exits, `findSafeTile` returns `-1`. The calling entity MUST NOT place the bomb.
3. **Arena Bomb Limit & Ownership Isolation**:
   - `GameScene.ts` (lines 2608): Enforces a global cap of max 2 active enemy bombs.
   - Individual enemy models track `activeBombs < maxBombs` (default 1).

---

## 2. Logic Chain

1. **Root Cause of AI Passivity**:
   - From Observation 1.3, standard `findPath` treats `TILE_BLOCK` as an impassable obstacle identical to `TILE_WALL`.
   - In standard Bomberman arenas, players and enemies spawn separated by soft blocks.
   - When the direct path is blocked, enemies fall back to the closest Manhattan tile on their side of the wall.
   - Because `BomberEnemy` checks `dist <= 3` to the player before attempting bomb placement, enemies on the far side of a soft-block partition never trigger bomb placement.
   - `ChaserEnemy` possesses no bomb-placing logic whatsoever.

2. **Requirements for Soft-Block-Aware Pathfinding**:
   - To aggressively expand territory and hunt the player, enemies must find a path from their position to the target *through* destructible blocks.
   - Indestructible walls (`TILE_WALL`) can never be destroyed, so they must remain strictly impassable (`weight = Infinity`).
   - Destructible blocks (`TILE_BLOCK`) can be destroyed with a bomb, but placing a bomb, waiting for the fuse (1.2s to 3.0s), and evading carries a significant time penalty compared to walking through an open corridor.
   - Therefore, edge traversal through `TILE_BLOCK` should carry a penalty weight:
     `weight = 1 (step) + blockPenalty (e.g. 8 steps)`.
   - With this weighting:
     - Short open corridors (e.g., detour of 4–6 steps) are preferred over destroying a block.
     - Long detours (e.g., walking 15+ steps around the perimeter) are rejected in favor of blowing up a blocking soft block.
     - If the player is completely enclosed, the pathfinder finds the path requiring the minimal number of block demolitions.

3. **Identifying Blocking Soft Blocks & Staging Tiles**:
   - Once the demolition path is computed, it forms a sequence of tiles from start to target:
     `[startIdx, step_1, step_2, ..., stagingTile, firstBlock, ..., targetIdx]`.
   - By iterating forward along `outPath`:
     - If all steps have `obstacleMask[step] === TILE_EMPTY`, `hasDirectPath = true`. No demolition is required; the enemy moves directly.
     - If a step has `obstacleMask[step] === TILE_BLOCK`, that tile is the `firstBlockingBlock`.
     - The tile immediately preceding `firstBlockingBlock` is the `stagingTile`.
     - Crucially, all tiles from `startIdx` to `stagingTile` are guaranteed to be `TILE_EMPTY`.
     - If `startIdx !== stagingTile`: The enemy simply follows the open prefix steps to walk to `stagingTile`.
     - If `startIdx === stagingTile`: The enemy is already standing adjacent to the block and is ready to evaluate bomb placement!

4. **Safe Demolition & Suicide Prevention Invariant**:
   - Dropping a bomb at `stagingTile` is only permitted if:
     1. `enemy.activeBombs < enemy.maxBombs` and `bombCooldownTimer <= 0`.
     2. A hypothetical blast from `stagingTile` is computed.
     3. An escape path exists from `stagingTile` to a tile outside both this hypothetical blast and all other active bomb blasts within `maxSteps <= 4`.
   - If `escapePath` exists:
     - Enemy places bomb at `stagingTile`.
     - Enemy switches state to `EVADING`.
     - Enemy follows `escapePath` to safety and waits for detonation.
     - Detonation clears the block into `TILE_EMPTY`.
     - Next frame: The path through the destroyed block is now open.
   - If `escapePath === null` (staging tile is in a dead-end):
     - Suicide-prevention triggers: Bomb is NOT placed.
     - Enemy inspects other empty neighbors of `firstBlockingBlock`. If another neighbor offers a safe escape, enemy reroutes there; otherwise, it seeks an alternative route.

5. **Zero-GC Implementation Feasibility**:
   - From Observation 1.1, the total tile count is fixed at `TOTAL_TILES = 195` (13x15).
   - In a 195-tile graph, a Flat Binary Min-Heap (`heap: Int16Array(256)`, `dist: Int16Array(195)`, `parent: Int16Array(195)`) requires zero heap allocations.
   - A single Dijkstra search over 195 nodes takes at most 195 pops and ~780 pushes, executing in < 0.02ms.
   - By pre-allocating scratch arrays on `ZeroGCPathfinder`, runtime heap allocation is exactly **0 bytes**.
   - Tank and Ghost GC leaks (Observation 1.4) can be eliminated by adding an `ignoreBlocks` flag to `ZeroGCPathfinder.findPath`.

---

## 3. Caveats

1. **Global Enemy Bomb Cap (GameScene:2608)**:
   - `GameScene.ts` enforces a strict cap: at most 2 active enemy bombs simultaneously across the entire arena.
   - If two other enemies already placed bombs, `placeEnemyBomb` returns `false`.
   - Enemies must handle this gracefully: if `placeEnemyBomb` fails, they should not get stuck in an evasion loop; they should remain in tracking/hunting state and retry once an active bomb detonates.
2. **Dynamic World State During Bomb Fuse**:
   - Between placing a bomb (t=0) and explosion (t=2000ms), other entities (player, allies, other enemies) may move.
   - The enemy must remain safely in `EVADING` state until `onBombExploded()` is called or the 2500ms watchdog (`AI-04`) expires.
3. **Friendly Fire vs Destructible Block Demolition**:
   - Enemies have friendly-fire immunity from other enemy bombs (BaseEntity:76), but enemies CAN be damaged by player bombs or self-detonation if they fail to evade. Maintaining the 4-step escape invariant is critical.
4. **Tank and Ghost Archetype Specials**:
   - `TankEnemy` already destroys blocks upon contact (`distPx < 28`, line 467). TankEnemy does not need to place bombs to clear blocks; it only needs zero-GC pathfinding that treats blocks as passable.
   - `GhostEnemy` phases through blocks and should not drop bombs to destroy them.

---

## 4. Conclusion & Recommendations

### 4.1 Recommended Algorithm 1: `findPathWithDemolition` on `ZeroGCPathfinder`
Add a high-performance Zero-GC method to `ZeroGCPathfinder` that searches for the optimal corridor using a pre-allocated flat binary min-heap:

```ts
export interface DemolitionPathResult {
  pathLength: number;         // Total tiles in path
  openStepCount: number;      // Steps along open tiles before the first block
  hasDirectPath: boolean;     // True if path contains 0 blocks
  blockingBlockIdx: number;   // Flat index of first soft block, or -1 if none
  stagingTileIdx: number;     // Flat index of tile before first block, or -1
  blockCount: number;         // Total blocks along path
}
```

#### Zero-GC Class Additions to `ZeroGCPathfinder`:
- Pre-allocated flat heap:
  ```ts
  private heap: Int16Array = new Int16Array(256);
  private heapSize: number = 0;
  private demolitionResult: DemolitionPathResult = {
    pathLength: 0,
    openStepCount: 0,
    hasDirectPath: true,
    blockingBlockIdx: -1,
    stagingTileIdx: -1,
    blockCount: 0,
  };
  ```
- Method implementation details:
  1. `dist.fill(30000)` and `resetVisited()`.
  2. Edge cost:
     - `TILE_WALL`: Impassable (skipped).
     - `TILE_EMPTY`: Cost = 1.
     - `TILE_BLOCK`: Cost = `1 + blockPenalty` (default `blockPenalty = 8`).
     - Active bombs: Skipped unless `nIdx === targetIdx`.
  3. Reconstruct path into `tempPath` and write to `outPath`.
  4. Scan `outPath` from index 0 to `pathLength - 1`:
     - The first tile with `obstacleMask[outPath[i]] === TILE_BLOCK` gives `blockingBlockIdx`.
     - The staging tile is `i === 0 ? startIdx : outPath[i - 1]`.
     - `openStepCount = i`.
     - If no block found: `hasDirectPath = true`, `blockingBlockIdx = -1`, `stagingTileIdx = -1`.

### 4.2 Recommended Algorithm 2: Safe Bomb Demolition Evaluation (`evaluateSafeBombPlacement`)
Provide a zero-allocation helper to verify whether dropping a bomb at a staging tile is safe:

```ts
public evaluateSafeBombPlacement(
  bombIdx: number,
  bombPower: number,
  obstacleMask: Uint8Array,
  existingBombsMask: Uint8Array | null,
  maxEscapeSteps: number,
  outEscapePath: Int16Array
): number // Returns escape path step count, or -1 if unsafe (suicide prevention)
```
Steps:
1. Populate hypothetical danger mask with blast rays of the proposed bomb using `computeBlastMask`.
2. OR in blast rays of all existing ticking bombs.
3. Call `findSafeTile(bombIdx, dangerMask, obstacleMask, existingBombsMask, maxEscapeSteps, outEscapePath)`.
4. If a safe tile is reachable within `maxEscapeSteps` (default 4), return the step count. Otherwise return `-1` to strictly forbid bomb placement.

### 4.3 Recommended Algorithm 3: Zero-GC Blast Calculation (`computeBlastMask`)
Replace per-frame `new Set<string>()` with typed array mask:
```ts
public computeBlast(
  centerIdx: number,
  power: number,
  obstacleMask: Uint8Array,
  outMask: Uint8Array,
  clearFirst: boolean = false
): void {
  if (clearFirst) outMask.fill(0);
  if (centerIdx < 0 || centerIdx >= this.totalTiles) return;

  outMask[centerIdx] = 1;
  const cr = (centerIdx / this.cols) | 0;
  const cc = centerIdx % this.cols;

  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const d of dirs) {
    for (let i = 1; i <= power; i++) {
      const nr = cr + d.dr * i;
      const nc = cc + d.dc * i;
      if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
      const nIdx = nr * this.cols + nc;
      if (obstacleMask[nIdx] === TILE_WALL) break;
      outMask[nIdx] = 1;
      if (obstacleMask[nIdx] === TILE_BLOCK) break;
    }
  }
}
```

### 4.4 Recommended Remediation for Tank & Ghost Enemies
Update `findPath` with an optional `ignoreBlocks: boolean = false` parameter:
```ts
public findPath(
  startIdx: number,
  targetIdx: number,
  outPath: Int16Array,
  obstacleMask: Uint8Array = this.obstacleMask,
  bombMask: Uint8Array | null = null,
  ignoreBlocks: boolean = false
): number
```
In `TankEnemy.updateAI` and `GhostEnemy.updateAI`:
Replace `map.map(row => row.map(...))` with `findPath(..., ignoreBlocks = true)`. This eliminates **14 heap array allocations per query**.

### 4.5 AI Decision Matrix for Aggressive Hunting & Demolition
For `ChaserEnemy` and `BomberEnemy`:
1. Compute `findPathWithDemolition` towards player.
2. If `hasDirectPath`:
   - Follow direct path to player.
   - If in attack range (`dist <= 3` or line of sight):
     - `BomberEnemy`: Evaluate offensive bomb placement to trap player with escape path.
     - `ChaserEnemy`: Execute 350ms windup and 240 px/s corridor charge!
3. If `!hasDirectPath`:
   - If enemy is at `stagingTileIdx`:
     - If `canDropBombs` and `activeBombs < maxBombs` and `cooldown <= 0`:
       - Evaluate `evaluateSafeBombPlacement`.
       - If safe: Place bomb, set `currentPath = escapePath`, switch to `EVADING`.
       - If unsafe: Stand ground or look for alternative staging neighbor.
   - If enemy is NOT at `stagingTileIdx`:
     - Move along open prefix steps towards `stagingTileIdx`.

---

## 5. Verification Method

### 5.1 Test Commands
1. Run existing regression test suite to ensure no breakage:
   ```bash
   npm test
   ```
   Must pass all 506 existing tests.
2. Run pathfinding and escape stress tests specifically:
   ```bash
   node --test tests/pathfinding.test.mjs
   node --test tests/enemy_bomb_escape.test.mjs
   node --test tests/ai_pathfinding_stress.test.mjs
   node --test tests/m1_challenger_pathfinder_pool_stress.test.mjs
   node --test tests/soak_10k_frames.test.mjs
   ```
3. Verify zero heap drift on 10,000 queries of `findPathWithDemolition`:
   Add a unit test in `tests/soak_10k_frames.test.mjs` verifying drift <= 0.10 MB.
4. Verify code cleanliness and typecheck:
   ```bash
   npm run lint
   npm run build
   ```

### 5.2 Concrete Invalidation Conditions
The design is invalidated if:
1. `findPathWithDemolition` traverses through `TILE_WALL` (indestructible outer boundary or inner pillars).
2. An enemy places a bomb in a cul-de-sac or dead-end where it cannot escape outside the blast radius, violating the suicide-prevention invariant.
3. Heap allocations occur during `findPathWithDemolition` or `computeBlast` (violating Zero-GC mandate).
4. `findPath` signature changes break existing tests in `tests/m1_challenger_pathfinder_pool_stress.test.mjs`.
