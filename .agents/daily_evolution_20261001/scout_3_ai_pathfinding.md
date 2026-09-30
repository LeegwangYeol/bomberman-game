# Scout 3: AI Pathfinding & Combat FSM Architecture Report
**Cycle**: 2026-10-01 Daily Evolution & Resilience Cycle  
**Scout**: Scout 3 (AI Pathfinding & Combat FSM Scout)  
**Target Files Inspected**:
- `src/game/pathfinding.ts` (1,662 lines)
- `src/game/entities/EnemyEntities.ts` (1,247 lines)
- `src/game/entities/AllyEntities.ts` (453 lines)
- `src/game/hazards/DynamicHazard.ts` (862 lines)
- `src/game/GameScene.ts` (4,649 lines)
- `tests/pathfinding.test.mjs`, `tests/aggressive_ai.test.mjs`, `tests/adversarial_suicide_zerogc.test.mjs`, `tests/adversarial_ai_demolition_100_layouts.test.mjs`, `tests/m1_challenger_pathfinder_pool_stress.test.mjs`

---

## 1. Executive Summary & Verdict

Scout 3 conducted a line-by-line inspection of the pathfinding subsystem, enemy combat finite-state machines (FSM), suicide prevention safeguards, demolition routing, and hazard interaction layers.

### Key Takeaways:
1. **Algorithmic Strength of Core Engine**: The 1D TypedArray BFS and min-heap Dijkstra engine in `ZeroGCPathfinder` is exceptionally fast (~1.5 µs per query; passes 100,000 randomized queries and 10,000 cul-de-sac fuzzing tests with a verified **0% suicide rate**). Generational rollover (65,530 resets) prevents array reallocation.
2. **Critical Blindness to Bomb Blast Corridors**: In `GameScene.ts` (lines 2058–2068), `persistentHazardMask` collects **only the single epicenter tile** where a bomb sits (`Math.floor(b.x / 40), Math.floor(b.y / 40)`). The projected 4-directional explosion lines are **not** populated in `bombTiles`. Moving enemies will happily path directly into ticking bomb blast corridors.
3. **Total Disconnect from Dynamic Hazard (`DynamicHazard.ts`)**: `DynamicHazard.ts` defines a 4-stage Quantum Spire Hazard with 120-damage lethal beams and 3-tier telegraphs (Yellow/Amber/Red). However, `DynamicHazard` is **not connected to the enemy AI update loop** in `GameScene.ts`. Enemy entities possess zero awareness of Spire beams and will walk straight into active hazard beams.
4. **No Reactive Threat Evasion (One-Way FSM)**: Enemies enter `EnemyState.EVADING` **exclusively** after dropping their own bomb. If the player drops a bomb next to an enemy, the enemy never triggers evasion; it stays in `TRACKING` or `HUNTING` and walks towards the player, ignoring the ticking explosive.
5. **GC Allocation Leak in Backward-Compatible Wrapper Layer**: While `ZeroGCPathfinder` itself uses pre-allocated TypedArrays, the functions consumed by `EnemyEntities.ts` and `AllyEntities.ts` (`findPathBFS`, `getBlastTiles`, `cloneBombTilesAsSet`, `findEscapePathBFS`) constantly instantiate `new Array(len)`, `new Set<string>()`, string interpolation (`${r},${c}`), and object literals `{ r, c }`.
6. **Zero Path Caching**: Neither `ZeroGCPathfinder` nor `EnemyEntities.ts` implements path caching. When 5–15 enemies chase the player, each independently executes a full BFS pass every 180–350 ms, resulting in redundant searches for identical targets.

---

## 2. Demolition Pathfinding Analysis

### 2.1 Implementation Mechanics (`findPathWithDemolition`)
`ZeroGCPathfinder.findPathWithDemolition` (lines 658–838) uses a pre-allocated min-heap Dijkstra (1,024 elements) over the 195-tile grid:
- **Cost Function**:
  - Empty passable tile (`TILE_EMPTY`): Cost = $1$
  - Breakable block (`TILE_BLOCK`): Cost = $1 + \text{blockPenalty}$ (default $1 + 8 = 9$)
  - Fixed walls (`TILE_WALL`) & active bombs: Impassable ($\infty$)
- **Output (`DemolitionPathResult`)**:
  - `blockingBlockIdx`: Flat index of the first soft block requiring demolition.
  - `stagingTileIdx`: The open tile immediately preceding `blockingBlockIdx` where the entity must stand to place the demolition bomb.
  - `openStepCount`: Steps along open tiles prior to the block.
  - `hasDirectPath`: True if block count is 0 and target is reached.

### 2.2 Multi-Angle Demolition Approaches (`getSafeDemolitionApproaches`)
In `pathfinding.ts` (lines 1304–1329), `getSafeDemolitionApproaches` evaluates all 4 orthogonal tiles around `targetBlock`:
```typescript
for (const d of dirs) {
  const r = targetBlock.r + d.dr;
  const c = targetBlock.c + d.dc;
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS && map[r][c] === TILE_EMPTY) {
    const isBomb = isTileInHazardMask(bombTiles, r, c);
    if (!isBomb && canSafelyPlaceBomb({ r, c }, bombPower, map, bombTiles, maxEscapeSteps)) {
      safe.push({ r, c });
    }
  }
}
```
If an enemy's initial approach tile is trapped in a cul-de-sac, `ChaserEnemy` and `BomberEnemy` inspect these alternate approaches and re-route rather than committing suicide.

### 2.3 Bottlenecks & Flaws in Demolition Routing
1. **Dijkstra Heap Duplicate Node Sifting**:
   In `findPathWithDemolition` (lines 774–793), when a shorter path to an already-enqueued node is found (`alt < dist[nIdx]`), it pushes a duplicate `nIdx` onto `this.heap`. When nodes pop (lines 720–740), there is **no check** (`if (currDist > dist[curr]) continue;` or `finalized` mask). Stale entries will pop and re-evaluate their 4 neighbors unnecessarily.
2. **Singleton Mutability Concurrency Risk**:
   `findTargetBlockBFS` writes into `sharedBlockTargetResult` and returns the reference. If a caller stores or shares this reference across asynchronous or delayed callbacks, it will be silently mutated by the next demolition query.
3. **Heavy Heap Churn in `findDemolitionPath`**:
   `findDemolitionPath` (lines 1334–1373) instantiates a `new Array(res.pathLength)` and `{ r, c }` coordinates every call. While `EnemyEntities.ts` currently calls `findTargetBlockBFS`, any subsystem using `findDemolitionPath` breaks Zero-GC contracts.

---

## 3. BFS Escape Path Generation & Suicide Prevention

### 3.1 Suicide Prevention Contract (`canSafelyPlaceBomb` & `hasSafeTile`)
`canSafelyPlaceBomb` (lines 1487–1566) guarantees that an entity will never drop a bomb if it cannot escape:
- Simulates the hypothetical bomb at `{ r, c }`.
- Computes `sharedDangerMask` incorporating the hypothetical blast plus any existing bomb epicenters.
- Calls `zeroGCPathfinder.hasSafeTile(startIdx, sharedDangerMask, sharedObstacleMask, sharedBombMask, maxEscapeSteps)`.
- **Early-Exit Zero-GC**: `hasSafeTile` exits immediately on the first reachable tile with `dangerMask[curr] === 0`, performing zero path reconstruction or array allocation.
- **Empirical Validation**: 10,000 Monte Carlo cul-de-sac scenarios in `tests/adversarial_suicide_zerogc.test.mjs` verify **0 false approvals** in lethal traps.

### 3.2 Anti-Freeze Fallback Patrol
When an enemy is adjacent to a soft block or player but `canSafelyPlaceBomb` returns `false` (e.g. trapped in a 1-tile dead end or blocked corridor):
- The AI does **not** freeze with velocity $(0, 0)$.
- In `ChaserEnemy` (lines 371–402) and `BomberEnemy` (lines 744–776), the entity iterates over `patrolDirs` and moves to an adjacent open tile outside bomb tiles.
- Over 120 adversarial layouts in `tests/adversarial_ai_demolition_100_layouts.test.mjs`, total indefinite freezes remained strictly **0**.

### 3.3 Critical Implementation Discrepancy in `EnemyEntities.ts`
Despite the existence of `canSafelyPlaceBomb` and `getSafeBombEscapePath` in `pathfinding.ts`, `ChaserEnemy` (lines 258, 302) and `BomberEnemy` (lines 622, 670) execute their own inline logic:
```typescript
const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
const simulatedBombTiles = cloneBombTilesAsSet(bombTiles);
simulatedBombTiles.add(`${er},${ec}`);
const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 8);
```
**Defects of this inline logic**:
1. `getBlastTiles({ r: er, c: ec }, ...)` evaluates **only the newly dropped bomb's blast**, completely ignoring any other active bombs on the arena!
2. If another bomb is ticking 2 tiles away, `dangerTiles` does not mark that blast zone. The calculated `safeEscape` path may lead the enemy straight into the second bomb's explosion!
3. Multiple heap allocations per frame: `getBlastTiles` allocates `new Set()`, `cloneBombTilesAsSet` allocates `new Set()`, and `findEscapePathBFS` allocates `new Array()`.

---

## 4. Cornering & Offensive Bombing Logic

### 4.1 Implementation (`findCorneringBombTile`)
In `pathfinding.ts` (lines 1573–1648):
1. Checks bounds for both enemy and player.
2. Identifies player confinement: counts open walkable neighbors (`playerNeighbors`).
   - If `playerNeighbors.length > 2` and `!allowOpenPursuit`, the player is in an open field; cornering is aborted.
   - If `playerNeighbors.length <= 2`, player is in a corridor, corner, or dead-end cul-de-sac.
   - If `allowOpenPursuit` is `true` (`findOffensiveBombTile`), aggressive bombing is allowed when Manhattan distance $\le 2$.
3. Evaluates choke point candidates:
   - Candidate 1: `enemyPos` (standing where dropping a bomb hits the player or covers their sole exit).
   - Candidate 2: `playerNeighbors[0]` (player's sole exit tile in a dead-end).
   - Candidate 3: Intermediate steps along the BFS path from enemy to player.
4. Verifies safety: For each candidate, computes `blast = getBlastTiles(cand, 2, map)`. If it covers player or exit, it calls `canSafelyPlaceBomb(cand, 2, map, bombTiles, 8)`.

### 4.2 Deficiencies in Cornering Implementation
- **Allocation Overhead**: Instantiates `playerNeighbors` array, `candidates` array, `new Set<string>()` per candidate in `getBlastTiles`, and calls `findPathBFS`.
- **Re-entrancy / Buffer Overwrite**: `findCorneringBombTile` calls `findPathBFS` (which populates `sharedBombMask`), then calls `canSafelyPlaceBomb` in a loop (which overwrites `sharedBombMask` and `sharedDangerMask`). While currently serialized, this pattern is brittle.

---

## 5. ZeroGCPathfinder Caching & Memory Profile

### 5.1 Architecture of `ZeroGCPathfinder`
- **Internal Arrays**:
  - `visited: Uint16Array(195)` with generation counter ($1 \le \text{gen} \le 65,530$).
  - `queue: Int16Array(195)`
  - `parent: Int16Array(195)`
  - `dist: Int16Array(195)`
  - `tempPath: Int16Array(195)`
  - `heap: Int16Array(1024)`
  - `obstacleMask: Uint8Array(195)`
  - `hazardMask: Uint8Array(195)`
- **Garbage Collection Profile**:
  - When called via `zeroGCPathfinder.findPath(startIdx, targetIdx, outPath, ...)`, it executes with **0 bytes of heap allocation**.
  - A 15,000-call soak test verifies total heap drift $\le 0.25\text{ MB}$.

### 5.2 Missing Features & Bottlenecks
1. **Absence of Query Caching**:
   - There is **no path cache** or flowfield representation.
   - In a wave with 10 enemies pursuing the player, if the player stands still or moves within a single tile, 10 distinct BFS searches are executed every few hundred milliseconds.
2. **Heavy Allocation Churn in Consumer Code**:
   `EnemyEntities.ts` and `AllyEntities.ts` do not pass TypedArrays; they invoke the wrapper functions.
   - In `ChaserEnemy.updateAI`:
     `this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);`
     Returns `GridCoord[]` (allocates an Array of objects).
   - In `MiniSplitterEnemy` (recalculating every 180 ms):
     If 4 mini-splitters are alive, they generate ~22 array allocations per second.

---

## 6. Hazard Interaction: Bomb Blast Danger Tiles & Dynamic Hazards

### 6.1 Bomb Blast Danger Tiles in `GameScene.ts`
Look at lines 2058–2068 in `GameScene.ts`:
```typescript
// 9. Collect active bomb tiles for AI path avoidance (Zero-GC persistent FlatHazardMask)
this.persistentHazardMask.clear();
const bombTiles = this.persistentHazardMask as unknown as Set<string>;
this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
  const b = child as Phaser.Physics.Arcade.Sprite;
  if (b.active) {
    const col = Math.floor(b.x / TILE_SIZE);
    const row = Math.floor(b.y / TILE_SIZE);
    this.persistentHazardMask.setCoord(row, col, 1);
  }
});
```
#### Impact:
- Only the single center tile `(row, col)` of each active bomb is registered.
- The **blast lines** (cross pattern of length $1 + 2 \times \text{power}$) are **omitted**.
- When enemies call `findPathBFS`:
  `if (bombMask && bombMask[nIdx] !== 0 && nIdx !== targetIdx) continue;`
  Enemies will steer around the bomb sprite itself, but will freely march down the corridor into the bomb's lethal blast line!

### 6.2 Disconnect with `DynamicHazard.ts` (Quantum Spire Hazard System)
`DynamicHazard.ts` defines:
- Spire Anchors (S0–S3) and Nexus (S4).
- 4-stage lifecycle: `INACTIVE -> TELEGRAPH -> ACTIVE -> COOLDOWN`.
- 3-tier telegraph progression: Yellow (1,000 ms) $\rightarrow$ Amber (500 ms) $\rightarrow$ Red (500 ms).
- `dangerMask: Uint8Array(195)`:
  - `0`: Safe
  - `1`: Telegraphed Danger
  - `2`: Lethal Active Beam (120 DMG to enemies, 25 DMG to player)
  - `3`: Polarized Safe Beam
- Methods: `isTileLethal(r, c)`, `isTileTelegraphed(r, c)`, `checkEnemyCollision(...)`.

#### Current Status in AI:
- `DynamicHazard` is **not passed** to `updateAI`.
- The signature of `updateAI` in `EnemyEntities.ts` is:
  `updateAI(delta, currentTime, player, map, bombTiles, ...)`
  It has no argument for dynamic hazard masks.
- Enemies have no concept of Telegraphed or Active Spire beams. When a Spire charges an Amber/Red beam across row 6, enemies will path directly across row 6 and be vaporized upon discharge.

### 6.3 Missing Reactive Combat FSM States
`EnemyEntities.ts` implements the following states:
`IDLE`, `PATROL`, `TRACKING`, `HUNTING`, `WINDUP`, `ATTACK`, `COOLDOWN`, `EVADING`, `ENRAGED`, `PHASING`, `MATERIALIZED`, `STUNNED`.

However:
- There is **no `DODGE` or `FLEE_THREAT` state**.
- `EVADING` is strictly a post-bomb-drop state triggered by the enemy's own actions.
- If the player places a bomb directly adjacent to an enemy, the enemy's FSM does not react; it continues tracking the player.
- If a dynamic hazard beam starts telegraphing on the enemy's tile, the enemy will not step off the beam.

---

## 7. Comprehensive Bottleneck Summary Matrix

| Subsystem | File & Lines | Current Behavior | Bottleneck / Risk Level | Recommended Fix |
| :--- | :--- | :--- | :--- | :--- |
| **Bomb Blast Danger Mask** | `GameScene.ts:2058-2068` | Populates only bomb epicenter tile into `persistentHazardMask`. | **CRITICAL**: Enemies walk into ticking blast corridors. | Populate full blast projections into `persistentHazardMask` using `zeroGCPathfinder.computeBlast`. |
| **Dynamic Hazard Integration** | `DynamicHazard.ts` & `GameScene.ts:2075+` | `DynamicHazard` not wired to AI `updateAI`. | **CRITICAL**: Enemies oblivious to 120-DMG Spire beams. | Merge `DynamicHazard.getDangerMask()` into global pathfinding hazard mask. |
| **Reactive Threat Evasion** | `EnemyEntities.ts:176, 563` | `EVADING` triggered only after self bomb-drop. | **HIGH**: Enemies do not react to player bombs or active hazards. | Add reactive threat check in `TRACKING`/`HUNTING`: if current tile is in hazard/blast, switch to `EVADING`. |
| **Inline Bomb Escape Logic** | `EnemyEntities.ts:258, 622` | Calls `getBlastTiles` for own bomb only; ignores existing bombs. | **HIGH**: Enemy escape path can lead into concurrent bomb explosions. | Replace inline logic with `canSafelyPlaceBomb` + `zeroGCPathfinder.findSafeTile`. |
| **Wrapper Allocation Churn** | `pathfinding.ts:931, 1049, 1417` | `findPathBFS`, `findEscapePathBFS`, `getSafeBombEscapePath` allocate arrays & objects. | **MEDIUM**: Minor GC pressure during large enemy waves (10–20 entities). | Migrate `EnemyEntities` to reusable flat `Int16Array` paths or pre-allocated RingBuffers. |
| **Dijkstra Heap Stale Pops** | `pathfinding.ts:720-792` | Min-heap pushes duplicate nodes without stale pop checks. | **LOW-MEDIUM**: Redundant expansions on soft block paths. | Add stale pop guard: `if (currDist > dist[curr]) continue;`. |
| **Path Caching** | `pathfinding.ts:297+` | Zero query caching; every entity recalculates independently. | **LOW-MEDIUM**: Redundant BFS queries targeting the player. | Add a single-frame Flowfield or Reverse BFS from the player position. |

---

## 8. Actionable Recommendations for Division Teams

### 8.1 For Architect & Zero-GC Division:
1. **Unify Arena Hazards in `GameScene.ts`**:
   In `GameScene.ts` Step 9, create a unified `globalHazardMask` (FlatHazardMask). Populate it with:
   - Epicenters of all active bombs.
   - Projected blast lines of all active bombs (via `zeroGCPathfinder.computeBlast`).
   - Telegraphed and active beams from `DynamicHazard` (when enabled).
   - Hazard tiles from `crisisManager.getActiveHazardTiles()`.
   Pass this unified mask into `child.updateAI(...)` as the hazard parameter.

2. **Refactor `EnemyEntities.ts` to Eliminate Wrapper Allocations**:
   - Provide each enemy entity with a pre-allocated `pathBuffer: Int16Array(ROWS * COLS)` and `pathLength: number`.
   - Call `zeroGCPathfinder.findPath(...)` directly, bypassing `findPathBFS` object array instantiation.

### 8.2 For Creative Expansion Division:
1. **Connect `DynamicHazard` to Enemy Decision Loop**:
   - In `DynamicHazard.ts`, expose `getDangerMask(): Uint8Array`.
   - When Spire beams enter `TELEGRAPH` (Yellow/Amber/Red) or `ACTIVE`, ensure tiles with value `1` or `2` are marked in the AI's hazard avoidance mask.
   - Implement tactical trickery: Allow clever players to lure enemies onto telegraphed Spire lines just before discharge for environmental kills ("Tachyon Vaporization").

### 8.3 For Chaos QA & Resilience Division:
1. **Construct New Defensive Regression Tests**:
   - Test A: Verify that an enemy standing in an active bomb's projected blast corridor reactively steps to safety before detonation.
   - Test B: Verify that enemies path around telegraphed DynamicHazard Spire beams and do not cross active beams.
   - Test C: Verify that concurrent multi-bomb placements by player and allies do not corrupt enemy escape path calculations.

---

## 9. Conclusion & Status Report
Scout 3's comprehensive audit of AI pathfinding and combat FSM is complete. The pathfinding mathematical foundation is robust and strictly zero-suicide compliant, but suffers from significant real-time perception gaps (blindness to blast lines and dynamic hazards) and GC overhead in the wrapper abstraction layer. All findings and recommended architectural fixes are documented and ready for execution.
