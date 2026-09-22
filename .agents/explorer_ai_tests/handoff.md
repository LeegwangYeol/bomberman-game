# Handoff Report — Test Infrastructure & Aggressive AI Test Suite Design

## 1. Observation

### 1.1 Test Runner & Environment Constraints
- **Test execution command** (`package.json:10`):
  ```json
  "test": "node --experimental-strip-types --test tests/*.test.mjs tests/unit/*.test.mjs"
  ```
  All 29 existing test files (506 tests) execute via Node's native test runner (`node:test` + `node:assert/strict`) with TypeScript type stripping in ~1.44 seconds.
- **Node.js `--experimental-strip-types` Restrictions**:
  Running `node --experimental-strip-types -e "import('./src/game/entities/EnemyEntities.ts')"` yields:
  ```
  CAUGHT: TypeScript enum is not supported in strip-only mode
  ```
  `src/game/entities/EnemyEntities.ts:20` exports `export enum EnemyState { ... }`. Node 22/23 type stripping does not support TypeScript `enum` constructs.
- **Headless Phaser Import Restrictions**:
  Running `node -e "import('phaser')"` yields:
  ```
  phaser ERROR: window is not defined
  ```
  Phaser 4 requires browser DOM primitives (`window`, `document`, `HTMLCanvasElement`, touch events, Web Audio). None of the 29 test files in `tests/` import `phaser` directly.
- **Decoupled Pure Modules in `src/game/`**:
  `node --experimental-strip-types -e "import('./src/game/pathfinding.ts')"` succeeds without error:
  ```
  Pathfinding imported OK
  ```
  Modules like `src/game/pathfinding.ts`, `src/game/pooling/ObjectPool.ts`, and `src/game/bosses/BaseBoss.ts` are pure simulation/logic modules completely decoupled from Phaser DOM globals, making them 100% testable in headless Node.js.

### 1.2 Existing Enemy & Bomb Test Architectures
- **`tests/enemy_bomb_escape.test.mjs` (lines 224-308)**:
  Uses `MockSceneForBombTest` and `MockEnemyModel` to test bomb placement quotas (max 2 enemy bombs in arena), ownership isolation (`owner: 'enemy'` vs `owner: 'player'`), and blast propagation.
  ```js
  class MockSceneForBombTest {
    constructor() {
      this.map = createStandardMap();
      this.bombs = [];
      this.explosions = [];
    }
    placeEnemyBomb(enemy, row, col, power) { ... }
    explodeBomb(bomb) { ... }
  }
  ```
- **`tests/bomb_lifecycle.test.mjs` (lines 31-152)**:
  Implements `BombLifecycleSimulator(map, maxBombs, bombPower)` which simulates multi-stage ticking (`stage 1` -> `stage 2` -> `stage 3` -> detonation at 2000ms), blast raycasts, and direct block destruction:
  ```js
  if (this.map[nr][nc] === TILE_BLOCK) {
    this.map[nr][nc] = TILE_EMPTY;
    this.destroyedBlocks.push({ row: nr, col: nc });
    break;
  }
  ```
- **`tests/enemy_and_bomb_refine_stress.test.mjs` (lines 88-250)**:
  Defines `EnemyModel(x, y, isTracker)` simulating 7 FSM states (`IDLE`, `PATROL`, `TRACKING`, `HUNTING`, `WINDUP`, `ATTACK`, `COOLDOWN`), line-of-sight checks, and BFS tracking.
- **`tests/m1_challenger_pathfinder_pool_stress.test.mjs` (lines 54-120)**:
  Executes 100,000 randomized queries on `ZeroGCPathfinder` validating path continuity, generational rollover, and obstacle avoidance.

### 1.3 Current Enemy AI Status & Limitations
- **`src/game/entities/EnemyEntities.ts:360` (`BomberEnemy`)**:
  ```ts
  if (this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs && dist <= 3)
  ```
  `BomberEnemy` only checks proximity to the player (`dist <= 3`). It does NOT identify soft blocks blocking its path, nor does it drop bombs to expand territory or clear corridors.
- **`src/game/entities/EnemyEntities.ts:37` (`ChaserEnemy`)**:
  Does not have bomb placement logic (`canDropBombs` is absent or unused).
- **`src/game/GameScene.ts:2017-2029`**:
  `ChaserEnemy.updateAI` is called without a bomb drop callback. `BomberEnemy.updateAI` receives `(r, c, fuseMs) => this.placeEnemyBomb(child, r, c, child.bombPower, fuseMs)`.
- **`src/game/pathfinding.ts:394` (`ZeroGCPathfinder.findPath`)**:
  ```ts
  if (obstacleMask[nIdx] === TILE_WALL || obstacleMask[nIdx] === TILE_BLOCK) continue;
  ```
  Standard pathfinding treats `TILE_BLOCK` identically to `TILE_WALL`. When the player is behind soft blocks, BFS fails to find a route to the player and falls back to Manhattan frontier, leaving the enemy stuck.

---

## 2. Logic Chain

1. **Test Environment Compatibility**:
   - `npm test` runs with `--experimental-strip-types`.
   - Importing `Phaser` or TS `enum` fails in the test runner.
   - Therefore, to ensure `tests/aggressive_ai.test.mjs` is completely testable, fast, and regression-free, the core algorithmic aggressive AI functions must be implemented in `src/game/pathfinding.ts` (which is already pure TypeScript without enums or DOM dependencies).
   - If `EnemyEntities.ts` is updated, `export enum EnemyState` should be converted to `export const EnemyState = { ... } as const;` to avoid strip-only syntax errors.

2. **Algorithmic Requirements for Aggressive AI**:
   - **R1: Block Demolition / Territory Expansion**:
     When the player is unreachable via open tiles (or when a path through soft blocks is much shorter), the enemy needs a pathfinding routine that considers soft blocks as breakable.
     Algorithm: **Breakable BFS (`findDemolitionPath` or `findAggressivePathBFS`)**:
     - Traverse the grid where `TILE_WALL` is impassable, but `TILE_BLOCK` can be traversed with an added step penalty.
     - Identify the first `TILE_BLOCK` on the optimal path.
     - Select the adjacent open tile from which to bomb that soft block.
     - Verify a safe escape route before dropping the bomb (`canSafelyPlaceBomb`).
     - Drop bomb, retreat to safe tile, wait for detonation, destroy block (`map[r][c] = TILE_EMPTY`), then proceed through the cleared corridor.
   - **R2: Relentless Hunting**:
     - Dynamic BFS recalculation towards the player's current tile.
     - Moving towards player every tick.
     - Distance metric $|r_e - r_p| + |c_e - c_p|$ decreases monotonically when open path exists.
   - **R3: Cornering & Trap Bombing**:
     - When player is in a corridor or corner (open adjacent tiles $\le 2$), enemy identifies the choke point tile.
     - Enemy places bomb at choke point to trap player if enemy has safe escape.
   - **R4: Suicide Prevention (Zero Suicide Invariant)**:
     - Under no circumstances does an enemy drop a bomb if `findEscapePathBFS` returns null or an empty path.
     - Tested rigorously in cul-de-sacs, dead-end pockets, and multi-bomb overlaps.

3. **Test Suite Architecture**:
   - `tests/aggressive_ai.test.mjs` should contain:
     - Unit-level tests exercising the pure algorithms in `src/game/pathfinding.ts` (`findDemolitionPath`, `findCorneringBombTile`, `canSafelyPlaceBomb`).
     - Full simulation tests using an `AggressiveArenaSimulator` that manages a 13x15 grid, active bombs, fuse timers, block destruction callbacks, enemy FSM states, and player movement.
     - Concrete test suites for Scenarios A, B, C, and D.

---

## 3. Detailed Design of `tests/aggressive_ai.test.mjs`

### 3.1 Test Architecture & Harness (`AggressiveArenaSimulator`)
The test file will define a headless simulator:
```js
class AggressiveArenaSimulator {
  constructor(customMap = null) {
    this.map = customMap ? customMap.map(r => [...r]) : createStandardMap();
    this.bombs = []; // { id, row, col, timerMs, fuseMs, power, owner, active }
    this.explosions = [];
    this.destroyedBlocks = [];
    this.currentTime = 0;
    this.nextBombId = 1;
  }

  placeEnemyBomb(enemy, row, col, power = 2, fuseMs = 2000) {
    // Zero-suicide safety check
    const danger = getBlastTiles({ r: row, c: col }, power, this.map);
    const existingBombCoords = new Set(this.bombs.filter(b => b.active).map(b => `${b.row},${b.col}`));
    existingBombCoords.add(`${row},${col}`);
    const escapePath = findEscapePathBFS({ r: row, c: col }, danger, this.map, existingBombCoords, 4);

    if (!escapePath || escapePath.length === 0) {
      return false; // Rejected: no safe escape
    }

    const bomb = {
      id: this.nextBombId++,
      row,
      col,
      timerMs: 0,
      fuseMs,
      power,
      owner: 'enemy',
      enemy,
      active: true,
    };
    this.bombs.push(bomb);
    enemy.activeBombs++;
    return true;
  }

  update(deltaMs) {
    this.currentTime += deltaMs;
    // Advance bomb fuses
    for (const bomb of this.bombs) {
      if (!bomb.active) continue;
      bomb.timerMs += deltaMs;
      if (bomb.timerMs >= bomb.fuseMs) {
        this.detonateBomb(bomb);
      }
    }
  }

  detonateBomb(bomb) {
    bomb.active = false;
    if (bomb.enemy) {
      bomb.enemy.onBombExploded();
    }
    const blast = getBlastTiles({ r: bomb.row, c: bomb.col }, bomb.power, this.map);
    for (const key of blast) {
      const [r, c] = key.split(',').map(Number);
      if (this.map[r][c] === TILE_BLOCK) {
        this.map[r][c] = TILE_EMPTY;
        this.destroyedBlocks.push({ r, c });
      }
    }
  }
}
```

### 3.2 Concrete Test Scenarios

#### Scenario A: Block Demolition / Territory Expansion
- **Test A1: Identify blocking soft block on path to player**:
  - Grid: Row 1 has walls at border, enemy at (1, 1), soft block at (1, 3), player at (1, 5).
  - Open corridor along row 1 except (1, 3).
  - Call `findDemolitionTarget({ r: 1, c: 1 }, { r: 1, c: 5 }, map)`.
  - Assert target block is exactly `{ r: 1, c: 3 }` and placement tile is `{ r: 1, c: 2 }`.
- **Test A2: Full demolition lifecycle & corridor traversal**:
  - Enemy starts at (1, 1). Player is at (1, 5).
  - Step 1: Enemy navigates from (1, 1) to (1, 2) (adjacent to block at (1, 3)).
  - Step 2: Enemy places bomb at (1, 2). Bomb is registered in simulator.
  - Step 3: Enemy transitions to `EVADING` and retreats along escape path to (1, 1) or (2, 1).
  - Step 4: Advance simulator time by fuse duration (`sim.update(2000)`).
  - Step 5: Bomb explodes. Block at (1, 3) becomes `TILE_EMPTY`.
  - Step 6: Enemy transitions to `HUNTING`, computes new path to player `{ r: 1, c: 5 }`.
  - Step 7: Path now passes through `{ r: 1, c: 3 }` -> `{ r: 1, c: 4 }` -> `{ r: 1, c: 5 }`.
  - Step 8: Enemy moves forward through the newly opened corridor to reach the player.
  - Assert: `map[1][3] === TILE_EMPTY`, enemy reached player at (1, 5) or adjacent, enemy took 0 damage.

#### Scenario B: Relentless Hunting & Distance Reduction
- **Test B1: Monotonic distance reduction on open grid**:
  - Enemy at (1, 1), static player at (9, 11).
  - Over 40 simulation steps, assert `dist(enemy, player)` is monotonically non-increasing and reaches $\le 1$.
- **Test B2: Statistical comparison vs Random Wandering across 20 varied grid layouts**:
  - Run 20 distinct arena configurations:
    - 5 open arenas.
    - 5 standard pillar arenas with sparse blocks.
    - 5 dense maze-like corridors.
    - 5 dynamic player paths (player moving 1 tile every 4 frames).
  - Measure:
    - Average distance over 200 ticks: $\bar{D}_{\text{aggressive}}$ vs $\bar{D}_{\text{random}}$.
    - Intercept rate (reaching distance $\le 1$).
  - Assertions:
    - $\bar{D}_{\text{aggressive}} < 0.5 \times \bar{D}_{\text{random}}$ across all layouts.
    - Aggressive AI intercept rate $\ge 90\%$, while random walk intercept rate $< 15\%$.

#### Scenario C: Cornering & Trap Bombing
- **Test C1: Choke point detection for player trapped in dead end**:
  - Player at (1, 1) (corner: walls at (0, 1), (1, 0), and (2, 1) is blocked).
  - The only exit for the player is tile (1, 2).
  - Enemy approaches along row 1 from (1, 4) to (1, 3).
  - Call `findCorneringBombTile(enemyPos, playerPos, map)`:
    - Identifies (1, 2) or (1, 3) as the critical choke point.
- **Test C2: Offensive trap bomb placement with enemy retreat**:
  - Enemy drops bomb at choke point (1, 3).
  - Blast radius of 2 engulfs player at (1, 1) and (1, 2).
  - Enemy retreats east towards (1, 5) (safe tile).
  - Assert:
    - Bomb successfully placed (`placed === true`).
    - Player has 0 unblocked safe paths (`findPathBFS` or `findEscapePathBFS` from (1, 1) is blocked by blast/bomb).
    - Enemy is on safe tile outside blast radius at detonation.

#### Scenario D: Suicide Prevention Invariant (Zero Suicide)
- **Test D1: Single-tile dead-end cul-de-sac**:
  - Enemy is at (1, 1). Three walls surround it ((0, 1), (1, 0), (2, 1)).
  - Tile (1, 2) is blocked by a wall or bomb.
  - Enemy attempts to place bomb.
  - Assert: `placeEnemyBomb` returns `false`. `activeBombs` remains 0.
- **Test D2: 2-tile and 3-tile dead-end cul-de-sacs with insufficient escape speed**:
  - Enemy is at (1, 1). Corridor runs to (1, 2) then dead ends.
  - Bomb power is 2. Entire corridor is engulfed by blast.
  - Assert: bomb placement is rejected.
- **Test D3: Multi-bomb overlapping hazard trap**:
  - Active bomb exists at (1, 4).
  - Enemy at (1, 2) considers dropping a bomb. Combined blasts would leave no safe tiles within 4 steps.
  - Assert: bomb placement is rejected.
- **Test D4: 1,000-scenario adversarial fuzzing**:
  - Generate 1,000 randomized dead ends and trap configurations.
  - Assert 0% false positives for safe escape (zero suicide invariant maintained 1,000/1,000 times).

---

## 4. Caveats

- **Read-Only Scope**: This investigation is strictly read-only; no code files were modified.
- **Phaser Decoupling**: Direct unit testing of Phaser GameObjects in Node.js is not possible due to `window is not defined`. Therefore, production code must keep the decision algorithms pure and decoupled in `src/game/pathfinding.ts`, allowing both `EnemyEntities.ts` and `tests/aggressive_ai.test.mjs` to execute identical logic.
- **TypeScript Enums**: If the Worker touches `EnemyEntities.ts`, remember that `export enum EnemyState` must not be imported directly by `--experimental-strip-types` test files. Changing to `export const EnemyState = { ... } as const;` avoids this limitation.

---

## 5. Conclusion

1. **Test Infrastructure Ready**:
   The test runner `node --experimental-strip-types --test tests/*.test.mjs` can run `tests/aggressive_ai.test.mjs` with zero extra dependencies if designed using pure algorithms and a deterministic headless arena simulator.
2. **Recommended Worker Implementation Scope**:
   - **`src/game/pathfinding.ts`**:
     Add pure helper functions:
     - `findDemolitionPath(start, target, map, bombTiles)`
     - `findCorneringBombTile(enemyPos, playerPos, map, bombTiles)`
     - `canSafelyPlaceBomb(pos, power, map, existingBombs, maxEscapeSteps)`
   - **`src/game/entities/EnemyEntities.ts`**:
     - Update `ChaserEnemy.updateAI` and `BomberEnemy.updateAI` to utilize these helpers.
     - Integrate block demolition: when blocked from player, target the blocking soft block, move adjacent, place bomb with safe escape, evade until detonation, and proceed.
     - Add offensive cornering bomb placement when player is in dead ends.
     - Guard all bomb placements with `canSafelyPlaceBomb`.
   - **`src/game/GameScene.ts`**:
     - Pass `dropBombCallback` to `ChaserEnemy` as well as `BomberEnemy`.
   - **`tests/aggressive_ai.test.mjs`**:
     - Add comprehensive test suite containing Scenarios A, B, C, and D as detailed above.

---

## 6. Verification Method

To independently verify the test infrastructure and suite:

1. **Run Current Test Suite**:
   ```bash
   npm test
   ```
   Must pass all 506 existing tests.

2. **Verify Importability of Pathfinding**:
   ```bash
   node --experimental-strip-types -e "import('./src/game/pathfinding.ts').then(() => console.log('OK'))"
   ```

3. **Verify Aggressive AI Test Suite (once written by Worker)**:
   ```bash
   node --experimental-strip-types --test tests/aggressive_ai.test.mjs
   npm test
   npm run lint
   npm run build
   ```

4. **Invalidation Conditions**:
   - Any suicide by enemy in dead-end tests.
   - Failure of enemy to demolish soft block when path is blocked.
   - Aggressive AI failing to reduce distance to player over time compared to baseline.
   - Any runtime errors regarding `window` or `enum` in Node.js test runs.
