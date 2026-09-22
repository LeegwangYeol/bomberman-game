# Review & Adversarial Challenge Report — Reviewer 2 (Gameplay Dynamics & Robustness)

**Agent**: Reviewer 2 (Gameplay Dynamics & Robustness Reviewer / Adversarial Critic)  
**Date**: 2026-09-22T16:22:30+09:00  
**Parent**: Orchestrator Aggressive AI (`d123b704-8637-4725-abed-c7e20ac924cd`)  
**Status**: Review Complete — **REQUEST_CHANGES**  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**  
**Overall Risk Assessment**: **CRITICAL**

While the pure algorithmic foundations in `src/game/pathfinding.ts` (soft-block-aware Dijkstra, heap-based zero-GC pathfinding, and static escape tile detection) are mathematically well-designed, critical runtime lifecycle bugs in `EnemyEntities.ts` and data structure oversights in `pathfinding.ts` cause enemies to commit suicide on 100% of demolition bomb drops under continuous real-time execution. Furthermore, this fatal flaw was masked in `tests/aggressive_ai.test.mjs` through simulation shortcuts (jumping time in Scenario A2) and omitted damage assertions (Scenario A3).

---

## Findings

### [Critical] Finding 1 (Tagged: INTEGRITY VIOLATION / CRITICAL DEFECT: Premature EVADING State Exit Causes 100% Suicide Rate During Demolition)

- **What**: When `ChaserEnemy` or `BomberEnemy` places a bomb to destroy a block, it enters `EnemyState.EVADING` and follows `this.escapePath` to a safe tile. However, the moment it steps onto the safe tile (`this.escapePath.length === 0`), `updateAI` immediately switches the entity back to `EnemyState.TRACKING` (or `HUNTING`/`ENRAGED`), while the bomb is still actively ticking (`this.activeBombs === 1`, remaining fuse 1500–2500ms). In `TRACKING` state, pathfinding recalculates the shortest path towards the player, which routes straight across the blast ray of its own bomb. The enemy walks directly back into the blast zone and dies upon detonation.
- **Where**:
  - `src/game/entities/EnemyEntities.ts`: Lines 174–181 (`ChaserEnemy.updateAI`):
    ```typescript
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
      this.escapePath.shift();
      if (this.escapePath.length === 0) {
        this.changeState(EnemyState.TRACKING); // <-- Premature exit while activeBombs > 0!
      }
    }
    } else {
      this.changeState(EnemyState.TRACKING);
    }
    ```
  - `src/game/entities/EnemyEntities.ts`: Lines 508–515 (`BomberEnemy.updateAI`):
    ```typescript
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
      this.escapePath.shift();
      if (this.escapePath.length === 0) {
        this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING); // <-- Premature exit!
      }
    }
    } else {
      this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING);
    }
    ```
- **Masked Verification / Shortcut in Test Suite**:
  - In `tests/aggressive_ai.test.mjs` Lines 328–337 (Scenario A2), the test executed steps *only* while `enemy.escapePath.length > 0`, and then immediately called `sim.update(2000)` in a single jump without running intermediate tick steps during the 2000ms fuse countdown.
  - In `tests/aggressive_ai.test.mjs` Lines 119–134 and 373–380 (Scenario A3), `AggressiveArenaSimulator.detonateBomb` contained no check or damage application to entities caught in bomb blast rays. When simulated with realistic tick execution, the enemy was hit by the blast in **3 out of 3 bomb detonations** (ticks 10, 24, and 38), yet the test passed because it only checked block clearance and final distance.
- **Empirical Proof**:
  Running a continuous tick simulation of Scenario A3 reveals:
  ```
  SUICIDE at tick 10: Enemy at (1,1) caught in blast of bomb at (1,2)!
  SUICIDE at tick 24: Enemy at (1,4) caught in blast of bomb at (1,5)!
  SUICIDE at tick 38: Enemy at (1,7) caught in blast of bomb at (1,8)!
  Total suicides in Scenario A3 simulation: 3
  ```
- **Suggested Fix**:
  In `EVADING` state, once `this.escapePath.length === 0`, the entity has reached the safe retreat tile. It must **remain** in `EnemyState.EVADING` with zero velocity (`this.setVelocity(0, 0)`) holding position on the safe tile until `onBombExploded()` is invoked by `GameScene.ts` (decrementing `activeBombs` to 0 and transitioning back to `TRACKING`/`HUNTING`), or until `evadeTimeoutMs <= 0` expires as a watchdog fallback.

---

### [Critical] Finding 2 (Hazard Mask Defect: `getSafeBombEscapePath` Ignores `FlatHazardMask`, Allowing Escape Paths to Step on Active Bombs in Production)

- **What**: In `src/game/pathfinding.ts` line 1114, `getSafeBombEscapePath` populates `simulatedBombs` to prevent the escape path from stepping onto existing active bombs. However, it only checks `if (existingBombs instanceof Set)`. In production (`GameScene.ts` lines 2002–2003), active bombs are passed via `this.persistentHazardMask` (`FlatHazardMask`). Since `FlatHazardMask instanceof Set` evaluates to `false`, existing bombs are never added to `simulatedBombs`.
- **Where**: `src/game/pathfinding.ts`: Lines 1113–1117:
  ```typescript
  const simulatedBombs = new Set<string>();
  if (existingBombs instanceof Set) {
    for (const s of existingBombs) simulatedBombs.add(s);
  }
  simulatedBombs.add(`${r},${c}`);
  ```
- **Empirical Proof**:
  Evaluating `getSafeBombEscapePath({ r: 1, c: 2 }, 2, map, mask, 4)` with a `FlatHazardMask` containing an active bomb at `(1, 4)` returns:
  `[ { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 2, c: 4 }, { r: 2, c: 5 } ]`
  The escape path steps directly onto `{ r: 1, c: 4 }` (the active ticking bomb).
- **Masked Verification**:
  In `tests/aggressive_ai.test.mjs` Scenario D3 (line 668), the test used `new Set(['1,4'])` instead of `FlatHazardMask`, masking this failure.
- **Suggested Fix**:
  Update lines 1113–1117 in `src/game/pathfinding.ts` to support `FlatHazardMask`:
  ```typescript
  const simulatedBombs = new Set<string>();
  if (existingBombs instanceof FlatHazardMask) {
    existingBombs.forEachHazard((br, bc) => {
      simulatedBombs.add(`${br},${bc}`);
    });
  } else if (existingBombs instanceof Set) {
    for (const s of existingBombs) simulatedBombs.add(s);
  }
  simulatedBombs.add(`${r},${c}`);
  ```

---

### [Major] Finding 3 (`BomberEnemy` Drops Cornering Bomb at Distance 3 Where Bomb Power 2 Fails to Reach Player)

- **What**: In `BomberEnemy.updateAI` (lines 535–539), the cornering condition is:
  ```typescript
  const isCornered = findCorneringBombTile({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles) !== null;
  if (this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs && (dist <= 2 || (dist <= 3 && isCornered)))
  ```
  If `dist === 3 && isCornered`, `BomberEnemy` drops a bomb at `{ er, ec }` (its current position). However, `BomberEnemy.bombPower === 2`. A bomb with power 2 placed at distance 3 covers only 2 tiles, falling 1 tile short of reaching the trapped player.
- **Where**: `src/game/entities/EnemyEntities.ts`: Lines 535–548.
- **Suggested Fix**:
  Align with `ChaserEnemy`: verify that the enemy is standing directly on the cornering trap tile (`if (trapTile && trapTile.r === er && trapTile.c === ec)`) before dropping, or restrict cornering drop distance to `dist <= this.bombPower`.

---

### [Major] Finding 4 (`onBombExploded()` State Transition Rendered Dead Code)

- **What**: `ChaserEnemy.onBombExploded()` and `BomberEnemy.onBombExploded()` contain logic to transition `aiState` from `EVADING` back to `TRACKING`/`HUNTING`:
  ```typescript
  public onBombExploded(): void {
    if (this.activeBombs > 0) {
      this.activeBombs--;
    }
    if (this.aiState === EnemyState.EVADING && this.activeBombs === 0) {
      this.escapePath = [];
      this.changeState(EnemyState.TRACKING);
    }
  }
  ```
  Because `updateAI` prematurely switches `aiState` to `TRACKING` the moment `escapePath` empties (as detailed in Finding 1), `this.aiState === EnemyState.EVADING` is already `false` when `onBombExploded()` is called upon detonation. This renders the state transition in `onBombExploded()` completely dead code.
- **Where**:
  - `src/game/entities/EnemyEntities.ts`: Lines 134–142 and Lines 445–453.

---

## Verified vs. Invalidated Claims

| Claim from Worker Handoff | Reviewer Verification Result | Notes |
|---|---|---|
| `node --experimental-strip-types --test tests/aggressive_ai.test.mjs` passes 11/11 | **VERIFIED** | Ran cleanly in 85ms |
| `npm test` passes 517/517 | **VERIFIED** | 30 test suites, 0 failures |
| `npm run lint` 0 errors | **VERIFIED** | 0 errors (39 pre-existing warnings in other files) |
| `npm run build` compiles cleanly | **VERIFIED** | Next.js / Turbopack build succeeds with code 0 |
| Soft-block-aware Dijkstra (`findTargetBlockBFS`, `findDemolitionPath`) | **VERIFIED** | Accurately identifies blocking blocks and approach tiles |
| Relentless hunting & distance reduction (Scenarios B1, B2) | **VERIFIED** | Statistically superior to random walk |
| Static suicide prevention (`canSafelyPlaceBomb`, Scenarios D1, D2, D4) | **VERIFIED** | Accurately rejects dead ends within 4 steps |
| Runtime suicide prevention during full demolition lifecycle | **INVALIDATED** | Under real tick simulation, enemies step off safe tile and suicide in 100% of demolition bomb drops |
| Multi-bomb hazard avoidance in production (`FlatHazardMask`) | **INVALIDATED** | `getSafeBombEscapePath` fails to copy `FlatHazardMask` coordinates, allowing paths through active bombs |

---

## 1. Observation

1. **Test Suite Execution**:
   - `node --experimental-strip-types --test tests/aggressive_ai.test.mjs` exits code 0 (11 passed, 0 failed).
   - `npm test` exits code 0 (517 passed, 0 failed).
   - `npm run lint` exits code 0 (0 errors, 39 warnings).
   - `npm run build` exits code 0.
2. **Behavioral Trace Analysis**:
   - In `tests/aggressive_ai.test.mjs` lines 328–337:
     ```javascript
     while (enemy.escapePath.length > 0) {
       enemy.step(sim, playerPos);
     }
     const blastBefore = getBlastTiles({ r: 1, c: 2 }, 2, sim.map);
     assert.ok(!blastBefore.has(`${enemy.r},${enemy.c}`));
     sim.update(2000);
     ```
     The test loops ONLY while `escapePath.length > 0` (which finishes in 2 steps / ~400ms). It immediately invokes `sim.update(2000)` without executing intermediate tick steps.
   - In `tests/aggressive_ai.test.mjs` lines 119–134 (`AggressiveArenaSimulator.detonateBomb`):
     No check exists for whether `blast.has(`${enemy.r},${enemy.c}`)`.
3. **Tick-by-Tick Simulation Results**:
   - Executing Scenario A3 with tick-by-tick stepping against bomb blast sets reveals:
     - Tick 10: Enemy at `(1, 1)` caught in blast of bomb at `(1, 2)`.
     - Tick 24: Enemy at `(1, 4)` caught in blast of bomb at `(1, 5)`.
     - Tick 38: Enemy at `(1, 7)` caught in blast of bomb at `(1, 8)`.
     Suicide rate: 3/3 (100%).
4. **FlatHazardMask Type Inspection**:
   - In `src/game/pathfinding.ts` line 1114, `existingBombs instanceof Set` evaluates to `false` when passed `FlatHazardMask`.
   - Running `getSafeBombEscapePath({ r: 1, c: 2 }, 2, map, mask, 4)` with `mask.setCoord(1, 4, 1)` produces an escape path stepping directly onto `(1, 4)`.

---

## 2. Logic Chain

1. Worker implemented `canSafelyPlaceBomb` to guarantee that a safe tile exists outside the bomb blast before dropping.
2. When placing a bomb, the enemy enters `EnemyState.EVADING` with an `escapePath` leading to this safe tile.
3. The enemy traverses `escapePath` to the safe tile in 200–500ms.
4. Upon reaching the safe tile, `escapePath.shift()` empties the array (`this.escapePath.length === 0`).
5. Lines 176 and 510 in `EnemyEntities.ts` immediately execute `this.changeState(EnemyState.TRACKING)` (or `HUNTING`).
6. Because the bomb fuse is 2000–2500ms, the bomb is still ticking on the grid for another 1500–2000ms.
7. In `TRACKING`/`HUNTING` state, the enemy recalculates its path to the player or approach tile.
8. Because `bombTiles` only marks the bomb's single placement tile (and not its danger blast rays), the enemy paths straight back into the blast zone.
9. When the bomb explodes, the enemy is inside the blast and takes lethal damage (suicide).
10. Furthermore, `getSafeBombEscapePath` line 1114 fails to incorporate `FlatHazardMask` into `simulatedBombs`, allowing escape routes to step directly onto existing ticking bombs in production.

---

## 3. Caveats

- The min-heap Dijkstra and pure pathfinding functions (`findTargetBlockBFS`, `findDemolitionPath`, `canSafelyPlaceBomb`) operate correctly in static analysis and are completely free of runtime allocations.
- If enemies hold position on the safe tile in `EVADING` state until `onBombExploded()` is called, the simulation completes with **0 suicides** and successfully traverses the corridor to reach the player.

---

## 4. Conclusion

The work cannot be approved in its current state because the core self-preservation invariant is broken during real-time execution: enemies commit suicide on 100% of demolition bomb placements, and production hazard masks are bypassed.

**Verdict**: **REQUEST_CHANGES**

---

## 5. Verification Method

To independently reproduce and verify the findings:

1. **Reproduce Suicide Invariance Failure (Tick-by-Tick Simulation)**:
   Run the following command in project root:
   ```bash
   node --input-type=module -e '
   import { ROWS, COLS, TILE_EMPTY, TILE_WALL, TILE_BLOCK, findPathBFS, getBlastTiles, findTargetBlockBFS, getSafeBombEscapePath } from "./src/game/pathfinding.ts";
   const map = [];
   for (let r = 0; r < ROWS; r++) {
     map[r] = [];
     for (let c = 0; c < COLS; c++) map[r][c] = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || r >= 2) ? TILE_WALL : TILE_EMPTY;
   }
   map[1][3] = TILE_BLOCK; map[1][6] = TILE_BLOCK; map[1][9] = TILE_BLOCK;
   map[2][1] = TILE_EMPTY; map[2][4] = TILE_EMPTY; map[2][7] = TILE_EMPTY;
   let enemy = { r: 1, c: 1, aiState: "HUNTING", activeBombs: 0, maxBombs: 1, bombCooldownTimer: 0, bombPower: 2, escapePath: [], evadeTimeoutMs: 0 };
   let bombs = [];
   const playerPos = { r: 1, c: 11 };
   function step() {
     if (enemy.bombCooldownTimer > 0) enemy.bombCooldownTimer -= 200;
     if (enemy.aiState === "EVADING") {
       enemy.evadeTimeoutMs -= 200;
       if (enemy.evadeTimeoutMs <= 0 || enemy.escapePath.length === 0) {
         enemy.escapePath = [];
         enemy.aiState = "HUNTING"; // Current implementation flaw
         return;
       }
       const next = enemy.escapePath.shift();
       enemy.r = next.r; enemy.c = next.c;
       if (enemy.escapePath.length === 0) enemy.aiState = "HUNTING";
       return;
     }
     const bombCoords = new Set(bombs.filter(b => b.active).map(b => `${b.r},${b.c}`));
     const direct = findPathBFS({ r: enemy.r, c: enemy.c }, playerPos, map, bombCoords);
     if (direct.length === 0 || direct[direct.length - 1].r !== playerPos.r) {
       const demo = findTargetBlockBFS({ r: enemy.r, c: enemy.c }, playerPos, map, bombCoords);
       if (demo && (enemy.r === demo.approachTile.r && enemy.c === demo.approachTile.c)) {
         const esc = getSafeBombEscapePath({ r: enemy.r, c: enemy.c }, enemy.bombPower, map, bombCoords, 4);
         if (esc) {
           bombs.push({ r: enemy.r, c: enemy.c, power: enemy.bombPower, timer: 0, fuse: 2000, active: true });
           enemy.activeBombs++;
           enemy.escapePath = [...esc];
           enemy.aiState = "EVADING";
           enemy.evadeTimeoutMs = 2500;
           return;
         }
       }
     }
     if (direct.length > 0) { enemy.r = direct[0].r; enemy.c = direct[0].c; }
   }
   let suicides = 0;
   for (let tick = 0; tick < 100; tick++) {
     step();
     for (const b of bombs) {
       if (b.active) {
         b.timer += 200;
         if (b.timer >= b.fuse) {
           b.active = false;
           enemy.activeBombs--;
           const blast = getBlastTiles({ r: b.r, c: b.c }, b.power, map);
           if (blast.has(`${enemy.r},${enemy.c}`)) suicides++;
           for (const k of blast) { const [r, c] = k.split(",").map(Number); if (map[r]?.[c] === TILE_BLOCK) map[r][c] = TILE_EMPTY; }
         }
       }
     }
   }
   console.log("Suicides observed:", suicides);
   '
   ```
   *Observed*: `Suicides observed: 3` (100% suicide rate on all placed bombs).

2. **Reproduce FlatHazardMask Escape Path Bypass**:
   Run:
   ```bash
   node --input-type=module -e '
   import { ROWS, COLS, TILE_EMPTY, TILE_WALL, FlatHazardMask, getSafeBombEscapePath } from "./src/game/pathfinding.ts";
   const map = [];
   for (let r = 0; r < ROWS; r++) {
     map[r] = [];
     for (let c = 0; c < COLS; c++) map[r][c] = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? TILE_WALL : TILE_EMPTY;
   }
   map[2][1] = TILE_WALL; map[2][2] = TILE_WALL; map[2][3] = TILE_WALL;
   const mask = new FlatHazardMask();
   mask.setCoord(1, 4, 1);
   const path = getSafeBombEscapePath({ r: 1, c: 2 }, 2, map, mask, 4);
   console.log("Escape path through active bomb:", path);
   '
   ```
   *Observed*: Path contains `{ r: 1, c: 4 }` (active bomb tile).
