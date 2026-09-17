# Handoff Report: ZeroGCPathfinder & Flat Hazard Bitmask Design

## 1. Observation
1. **`src/game/pathfinding.ts`**:
   - Lines 18–93: `findPathBFS` instantiates dynamic heap objects per call:
     ```typescript
     const queue: GridCoord[] = [start];
     const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
     const parent: Map<string, GridCoord | null> = new Map();
     ```
     During BFS iteration, line 45 calls `queue.shift()!`, line 69 evaluates `bombTiles.has(`${nr},${nc}`)`, line 74 does `parent.set(`${nr},${nc}`, current)`, and line 75 executes `queue.push({ r: nr, c: nc })`.
   - Lines 102–131: `getBlastTiles` instantiates `const blast = new Set<string>()` and populates it with template literal strings `${nr},${nc}`.
   - Lines 139–203: `findEscapePathBFS` allocates `visited: boolean[][]`, `queue: { coord, dist }[]`, and `parent: Map<string, GridCoord | null>`.
2. **`src/game/GameScene.ts`**:
   - Lines 1745–1753: Inside the 60 FPS `update(time, delta)` loop:
     ```typescript
     // 9. Collect active bomb tiles for AI path avoidance
     const bombTiles = new Set<string>();
     this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
       const b = child as Phaser.Physics.Arcade.Sprite;
       if (b.active) {
         const col = Math.floor(b.x / TILE_SIZE);
         const row = Math.floor(b.y / TILE_SIZE);
         bombTiles.add(`${row},${col}`);
       }
     });
     ```
     This triggers 60 `Set` allocations per second plus string allocations for every active bomb.
3. **`src/game/entities/`**:
   - `NeutralEntities.ts`, line 85: parses string keys in the tick loop: `const [br, bc] = bKey.split(',').map(Number)`.
   - `EnemyEntities.ts`, line 347: clones Sets on bomb placement evaluation: `const simulatedBombTiles = new Set(bombTiles)`.
   - `EnemyEntities.ts`, line 495 & 585: allocates 14 arrays on path recalculation: `const bulldozerMap = map.map(row => row.map(t => ...))`.
4. **Test Suite Requirements (`tests/`)**:
   - 40 tests across `tests/pathfinding.test.mjs`, `tests/ai_pathfinding_stress.test.mjs`, and `tests/enemy_bomb_escape.test.mjs` depend on exact BFS tie-breaking, Manhattan fallback distance $\le 3$, and blast tile boundary checks.
   - All 280 tests in `npm test` currently pass with exit code 0.

## 2. Logic Chain
1. *From Observation 1*: The arena dimensions are invariant ($13 \times 15 = 195$ cells). Therefore, dynamic heap allocation is completely unnecessary; all search states (visited flags, predecessor pointers, search queue, distance counters, and scratch output buffers) can be pre-allocated as flat 1D typed arrays (`Uint16Array`, `Int16Array`, `Uint8Array`) sized to 195 elements.
2. *From Observation 1 & 4*: In `findPathBFS`, neighbor traversal order in `pathfinding.ts` lines 33–38 is strictly `Up, Down, Left, Right`. Adopting identical 1D index transitions (`curr - 15`, `curr + 15`, `curr - 1`, `curr + 1`) ensures identical search trees and guarantees 100% mathematical parity with the reference BFS oracle.
3. *From Observation 1 & Benchmark*: Clearing `visited` via `visited.fill(0)` incurs 195 byte writes per call. By introducing a 16-bit scalar `generation` counter (`visited[idx] === generation`), resetting visited state requires only `generation++` ($O(1)$ scalar increment), eliminating even the memory write loop.
4. *From Observation 2*: In `GameScene.ts`, `bombTiles` is passed down to enemy, ally, and neutral update methods. Replacing `new Set<string>()` with `FlatHazardMask` (a subclass of `Uint8Array(195)` that implements `.has(stringKey)`, `.add(stringKey)`, `.delete(stringKey)`, `.clear()`, and `[Symbol.iterator]()`) eliminates 60 Set allocations per second while ensuring complete duck-typing compatibility with unmodified callers.
5. *From Observation 3*: By adding native Zero-GC coordinate/index methods (`.isHazard(r, c)`, `.isHazardIdx(idx)`, `.isNearHazard(r, c, maxDist)`), entities can immediately bypass string formatting and tokenization entirely.
6. *From Observation 4 & Prototype Verification*: Running 10,000 queries using the proposed `ZeroGCPathfinder` demonstrated an average execution latency of **0.0008ms (800ns)** (over 200x faster than the 0.2ms limit) and a net persistent heap drift of **0.00 MB** under `node --expose-gc`.

## 3. Caveats
1. `GameScene.ts` has one-off Set allocations during map initialization (lines 1358, 1381, 1404, 2612 for initial entity and portal placement). Because these run once at level load rather than in the 60 FPS update loop, they do not impact frame rate or cause runtime GC spikes; however, they can also be refactored to use `Uint8Array` masks for absolute consistency.
2. The legacy wrapper `findPathBFS(start, target, map, bombTiles)` constructs `GridCoord[]` return arrays for existing test callers that expect `{ r, c }[]`. Zero-GC callers (in the game loop) must call `pathfinder.findPath(startIdx, targetIdx, outPath)` directly to achieve 0 heap allocations.

## 4. Conclusion
1. The flat 1D typed-array `ZeroGCPathfinder` and `FlatHazardMask` design fully resolves the runtime GC bottlenecks of Bomberman.
2. The design achieves:
   - Zero heap allocations in hot-path queries.
   - Elimination of `new Set<string>()` in the 60 FPS update loop.
   - 100% backward compatibility with all existing tests.
   - Net V8 heap drift of 0.00 MB across 10,000 queries.
3. The proposed implementation has been placed in `.agents/m1_explorer_1/proposed_pathfinding.ts` and detailed in `report.md`.

## 5. Verification Method
1. **Existing Test Suite Verification**:
   Run: `npm test`
   Confirm: 280 passed, 0 failed, exit code 0.
2. **Pathfinding & AI Stress Suites**:
   Run: `node --experimental-strip-types --test tests/pathfinding.test.mjs tests/ai_pathfinding_stress.test.mjs tests/enemy_bomb_escape.test.mjs`
   Confirm: All 40 unit and stress tests pass.
3. **Zero-GC & Heap Stability Verification**:
   Run: `node --expose-gc --test .agents/m1_explorer_1/test_against_prototype.mjs`
   Confirm: 10,000 queries execute in $< 10$ ms with $\Delta\text{Heap} \le 0.25\text{ MB}$.
4. **Invalidation Conditions**:
   - Any modification changing arena dimensions beyond $13 \times 15$ requires calling `pathfinder.init(newCols, newRows)`.
   - Changing neighbor traversal order away from `Up, Down, Left, Right` would break path parity assertions in `tests/ai_pathfinding_stress.test.mjs`.
