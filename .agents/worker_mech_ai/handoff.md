# Handoff Report: Milestone 2 — Strategic Enemy Bomb Placement, Escape Pathfinding & Overhead Name Tags

## 1. Observation

### 1.1 Source Code Implementation
1. **`src/game/pathfinding.ts`**:
   - Lines 95-132: Implemented and exported `getBlastTiles(center: GridCoord, power: number, map: number[][]): Set<string>`:
     - Computes all grid tiles engulfed by an explosion at `center` with radius `power`.
     - Raycasts in 4 cardinal directions, stopping at `TILE_WALL` and engulfing `TILE_BLOCK` before breaking.
   - Lines 134-205: Implemented and exported `findEscapePathBFS(start: GridCoord, dangerTiles: Set<string>, map: number[][], existingBombs: Set<string>, maxSteps: number = 4): GridCoord[] | null`:
     - Returns `[]` if start tile is already outside `dangerTiles`.
     - Explores up to `maxSteps` steps via BFS queue, avoiding walls, blocks, and active bombs.
     - Reconstructs and returns the shortest path from start to the nearest safe tile, or `null` if no safe tile exists within `maxSteps`.

2. **`src/game/GameScene.ts`**:
   - Lines 11-19: Imported `getBlastTiles` and `findEscapePathBFS` and re-exported them.
   - Lines 25-34: Added `EnemyState.EVADING = 'EVADING'` to the `EnemyState` enum.
   - Lines 53-62: Added `enemyName`, `nameTag`, `canDropBombs`, `activeBombs`, `maxBombs`, `bombCooldownTimer`, and `bombPower` properties to the `Enemy` class.
   - Lines 73-104: In `Enemy` constructor:
     - Assigned persona names from archetypal pools: `['Blinky', 'Pyro Slime', 'Ignis', 'Stalker', 'Shadow']` for trackers, and `['Grumble', 'Puffball', 'Blobby', 'Spook', 'Waddler']` for normal enemies.
     - Created Tier 1 `nameTag` at `(x, y - 19)` with dark slate pill background `rgba(15, 23, 42, 0.85)`, bold 10px monospace font, and depth 16.
     - Created Tier 2 `indicator` at `(x, y - 33)` with depth 17, providing 14px vertical clearance without overlap.
   - Lines 259-276: Added `EnemyState.EVADING` visual handler in `applyStateVisuals` with plum tint `0xdda0dd`, `'💨'` indicator text, and hurried waddle tween.
   - Lines 312-321: In `updateAI`:
     - Synchronized `nameTag` position to `(this.x, this.y - 19)`.
     - Synchronized `indicator` position to `(this.x, this.y - 33)`.
     - Decremented `this.bombCooldownTimer -= delta`.
     - Added `case EnemyState.EVADING: this.handleEvading(...)`.
   - Lines 500-547: In `handleTracking`:
     - Pre-placement suicide-prevention invariant: If within Manhattan distance <= 3 or adjacent to breakable block, and current tile has no bomb, calculated combined danger tiles from hypothetical bomb and active arena bombs.
     - Called `findEscapePathBFS(...)`. Only dropped bomb if `escapePath && escapePath.length > 0`.
     - Placed bomb via `scene.placeEnemyBomb(...)`, transitioned to `EnemyState.EVADING`, and assigned `currentPath = escapePath`.
   - Lines 711-778: Added helper methods `isNearBreakableBlock`, `handleEvading` (85 px/s evasion navigation with corridor snapping), and `onBombExploded`.
   - Lines 799-808: In `destroy()`, safely destroyed `this.nameTag` alongside `this.indicator`.
   - Lines 818-820: Exposed `public bombs`, `public explosions`, and `public enemies` on `GameScene`.
   - Lines 915-937: Enhanced bomb colliders for player and enemies with `processCallback` allowing seamless stepping off newly placed bombs on the current tile.
   - Lines 1314-1316: Tagged player bombs with `owner: 'player'` and `power: this.bombPower`.
   - Lines 1319-1406: Implemented `placeEnemyBomb(enemy: Enemy, row: number, col: number, power: number): boolean`:
     - Enforced global arena limit of max 2 active enemy bombs.
     - Tagged bomb with `owner: 'enemy'`, `enemy: enemy`, and `power: power`.
     - Applied distinct purple/amethyst tint (`0xd946ef`), warning tint (`0xc084fc`), critical violet tint (`0xa855f7`), and 2000ms fuse timer.
   - Lines 1424-1438: In `explodeBomb`:
     - Decremented player `activeBombs` ONLY if `owner === 'player'`.
     - Decremented enemy active count via `enemy.onBombExploded()` if `owner === 'enemy'`.
     - Used individual bomb's `power` metadata for blast raycasting and chain reactions.

3. **`tests/enemy_bomb_escape.test.mjs`**:
   - Implemented 19 comprehensive tests across 4 suites:
     - Suite 1: Blast Raycast Calculation (`getBlastTiles`) — open space, wall halting, block destruction/halting, power 0, boundary safety.
     - Suite 2: Escape Route Pathfinding (`findEscapePathBFS`) — safe start empty path, open corridor escape, cul-de-sac refusal (suicide prevention), maxSteps cutoff, and active bomb avoidance.
     - Suite 3: Bomb Capacity Isolation & Ownership Lifecycle — player and enemy count independence, independent detonation decrements, chain reactions, and global arena cap of 2 enemy bombs.
     - Suite 4: 2-Tier Overhead UI & Lifecycle Safety — vertical offset verification (y-19 vs y-33, 14px clearance), layer depth stacking, persona name catalogs, clean entity destruction, and EVADING state transitions.

### 1.2 Verification Outputs
1. **`npm test`**:
   - Total tests executed: 96
   - Pass: 96
   - Fail: 0
   - Duration: 94.38ms
2. **`npm run build`**:
   - Next.js 16.3.5 Turbopack production build: compiled in 308ms.
   - TypeScript compilation: finished in 685ms with 0 errors.
   - Exit code: 0.

---

## 2. Logic Chain

1. **Suicide Prevention**:
   - If an enemy places a bomb in an enclosed space without a verified escape route, the 2000ms fuse will detonate before the enemy can escape, causing self-destruction.
   - By calculating `combinedDanger = getBlastTiles(...)` and verifying `findEscapePathBFS(...)` before calling `placeEnemyBomb`, the enemy guarantees that an escape path of $\le 4$ steps to an uncompromised tile exists. If no path exists (such as in a cul-de-sac or corridor enclosed by blocks/bombs), the placement check aborts, fulfilling the suicide prevention invariant.
2. **Bomb Count and Capacity Isolation**:
   - If enemy bombs shared the player's `this.activeBombs` counter, an enemy dropping a bomb would lock the player from dropping bombs, or detonating an enemy bomb would prematurely reset the player's capacity.
   - By storing `owner: 'enemy'` vs `owner: 'player'` on each bomb sprite and checking ownership in `explodeBomb`, the player's `activeBombs` HUD counter remains completely unaffected by enemy actions.
3. **2-Tier Overhead UI Hierarchy**:
   - Positioning the name tag at `y - 19` (hovering 3px above the 32px tall sprite top edge) and the status indicator at `y - 33` creates exactly 14px of vertical separation, preventing text collisions while maintaining legible visual hierarchy.
   - Both GameObjects are synchronized every frame in `updateAI` and cleanly destroyed in `destroy()`, preventing orphaned render objects.

---

## 3. Caveats

- No caveats. All requirements from DISPATCH.md and ORIGINAL_REQUEST.md have been genuinely implemented and tested with 0 regressions.

---

## 4. Conclusion

Milestone 2 is complete and production-ready:
1. `getBlastTiles` and `findEscapePathBFS` are exported and tested.
2. `EnemyState.EVADING` is integrated into the enemy FSM with visual feedback.
3. Enemies strategically place bombs with suicide prevention and evade along computed safe paths.
4. Enemy bombs are visually distinct (purple tint `0xd946ef`) and isolated from player bomb capacity.
5. 2-tier overhead name tags are displayed with clean layer stacking and zero overlap.
6. All 96 tests pass and the production build compiles cleanly.

---

## 5. Verification Method

To independently verify this milestone:
1. Run all tests:
   ```bash
   npm test
   ```
   Verify 96 tests pass with 0 failures.
2. Run production build:
   ```bash
   npm run build
   ```
   Verify Next.js Turbopack build succeeds with exit code 0.
3. Inspect code changes:
   - `src/game/pathfinding.ts`
   - `src/game/GameScene.ts`
   - `tests/enemy_bomb_escape.test.mjs`
