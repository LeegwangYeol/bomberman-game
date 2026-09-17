# Challenger 1 Gate Report: Empirical Stress Testing of ZeroGCPathfinder & ObjectPool

**Agent:** M1 Challenger 1  
**Working Directory:** `/Users/user/src/bomberman/.agents/m1_challenger_1/`  
**Parent Conversation ID:** `ab854808-7888-423e-8abb-01693016a769`  
**Date:** 2026-09-17  
**Gate Verdict:** `REQUEST_CHANGES`

---

## 1. Observation

1. **Test Suite Execution & Results:**
   - Command: `node --experimental-strip-types --test tests/m1_challenger_pathfinder_pool_stress.test.mjs`
   - Output summary:
     ```
     ✔ Challenger 1.1: ZeroGCPathfinder — 100,000 randomized queries maintain 100% path validity and survive generational rollover (80.7ms)
     ✔ Challenger 1.2: ZeroGCPathfinder — Unreachable targets, dense bomb mazes, boundary & corner tiles (0.3ms)
     ✔ Challenger 1.3: ObjectPool<T> — 100,000 rapid cycles, starvation attack, and invariant integrity (12.1ms)
     ✔ Challenger 1.4: ObjectPool<T> — Double-release attacks, foreign object rejection, and flapping (2.4ms)
     ✖ Challenger 1.5: FlatHazardMask — 10,000 adversarial operations, coordinate overflows, and duck-typing (0.57ms)
     ✖ Challenger 1.6: ZeroGCPathfinder — Coordinate overflow bounds rejection on startIdx and targetIdx (0.13ms)
     ✖ Challenger 1.7: ZeroGCPathfinder — Non-integer and NaN infinite loop hang prevention (404.2ms)
     ```
   - Total tests: 7. Passed: 4. Failed: 3.

2. **Vulnerability 1: Infinite Loop on NaN / Float / Non-Integer `startIdx` (`src/game/pathfinding.ts:303-397` & `403-484`):**
   - Execution of `pf.findPath(NaN, 17, out)` in a child process timed out after 400ms (`res.error.code === 'ETIMEDOUT'`).
   - Execution of `pf.findPath(1.5, 17, out)` in a child process timed out after 400ms (`res.error.code === 'ETIMEDOUT'`).
   - Execution of `pf.findSafeTile(NaN, danger, ...)` in a child process timed out after 400ms (`res.error.code === 'ETIMEDOUT'`).
   - Assertion failure:
     ```
     AssertionError [ERR_ASSERTION]: findPath(NaN, 17) must not enter an infinite loop (process timed out after 400ms)
     true !== false
     ```

3. **Vulnerability 2: Coordinate Overflows Return Phantom Off-Grid Paths (`src/game/pathfinding.ts:310-396`):**
   - Direct invocation `pf.findPath(-1, 17, out)` returned `4`, with `outPath = [0, 15, 16, 17]`.
   - Direct invocation `pf.findPath(195, 17, out)` returned `14`, with `outPath = [180, 165, ...]`.
   - Assertion failure:
     ```
     AssertionError [ERR_ASSERTION]: findPath(-1, 17) must return 0 for negative startIdx, got 4
     4 !== 0
     ```

4. **Vulnerability 3: `FlatHazardMask.has()`, `isHazard()`, and `getCoord()` False Positives on `NaN` (`src/game/pathfinding.ts:60-70`, `170-173`, `193-196`):**
   - On an empty `mask` (`mask.size === 0`):
     - `mask.has("NaN,NaN")` returns `true`.
     - `mask.has(",")` returns `true`.
     - `mask.has("abc,def")` returns `true`.
     - `mask.isHazard(NaN, NaN)` returns `true`.
     - `mask.getCoord(NaN, NaN)` returns `undefined` (violating `number` return signature).
   - Assertion failure:
     ```
     AssertionError [ERR_ASSERTION]: mask.has(NaN,NaN) must return false for invalid keys
     true !== false
     ```

5. **Confirmed Robust Behaviors (`ObjectPool<T>` and In-Bounds `ZeroGCPathfinder`):**
   - `ObjectPool<T>` sustained 100,000 rapid acquire/release cycles across capacities 8, 32, 64, 256 in 12.1ms with 0 invariant violations (`activeCount + freeCount === capacity` held on all cycles).
   - 10,000 consecutive `acquire()` calls on an exhausted pool returned `null` without memory growth or counter corruption.
   - 50,000 consecutive double-release attempts on the same item safely returned `false`; `freeCount` strictly stayed at `capacity` (did not overflow free stack).
   - Foreign object injection (`null`, `undefined`, alien pool objects, primitives, `{}`) returned `false` without crashing.
   - 100,000 randomized in-bounds BFS queries on `ZeroGCPathfinder` completed in 80.7ms with 100% path validity, 0 wall/block collisions, and seamless generational rollover across 65,530 generations.

---

## 2. Logic Chain

1. *From Observation 2*: In `ZeroGCPathfinder.findPath` and `findSafeTile`, `this.visited` is a `Uint16Array(195)` and `this.queue` is an `Int16Array(195)`.
   - When `startIdx` is `NaN` (or float `1.5`):
     - In JavaScript, `this.visited[NaN] = gen` is ignored because TypedArrays only support non-negative integer indices.
     - However, `this.queue[tail++] = startIdx` coerces `NaN` to `0` (or `1.5` to `1`) in `Int16Array`.
     - Consequently, index `0` is placed on the queue, but `this.visited[0]` is NOT marked as visited (`visited[0] === 0`).
     - As BFS expands, tile `1` (orthogonal neighbor of `0`) explores tile `0`. Because `visited[0] !== gen`, tile `0` is re-enqueued, and `parent[0]` is assigned `1` while `parent[1]` was assigned `0`.
     - This creates a circular reference `0 <-> 1` in the `parent` array.
     - During path reconstruction, `while (curr !== startIdx && curr >= 0)` is evaluated.
     - Because `startIdx` is `NaN`, `curr !== NaN` is ALWAYS `true`.
     - Because `curr` oscillates between non-negative indices `0` and `1`, `curr >= 0` is ALWAYS `true`.
     - The loop runs forever, executing `this.tempPath[stepCount++] = curr` past buffer limits and hanging the JavaScript single thread at 100% CPU lockup.
2. *From Observation 3*: `ZeroGCPathfinder` performs no bounds checking on `startIdx` or `targetIdx` against `[0, this.totalTiles - 1]`.
   - For `startIdx = -1`: `startR = (-1 / 15) | 0 = 0`, `startC = -1 % 15 = -1`. Moving right (`dir = 3`) sets `nc = 0`, yielding valid grid tile `nIdx = 0`.
   - The pathfinder reports finding a valid path of length 4 beginning at tile `0`, falsely routing an entity from an invalid negative position outside the map.
3. *From Observation 4*: In `FlatHazardMask.has()`, `isHazard()`, and `getCoord()`, the boundary guard is written as:
   ```ts
   if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
   return this.mask[r * COLS + c] !== 0;
   ```
   - When `key` contains non-numeric strings (e.g. `"abc,def"`, `","`, `"NaN,NaN"`), `parseInt` yields `NaN`.
   - In IEEE-754 arithmetic, all relational comparisons with `NaN` evaluate to `false` (`NaN < 0 === false`, `NaN >= ROWS === false`).
   - The guard fails to trigger, and `this.mask[NaN]` is accessed.
   - On a `Uint8Array`, accessing index `"NaN"` returns `undefined`.
   - The expression `undefined !== 0` evaluates to `true`, causing `has()` and `isHazard()` to return `true` on an empty hazard mask.

---

## 3. Caveats

1. **Production Game Loop Resilience**: In normal gameplay where coordinates are strictly clamped by physics before calling `findPathBFS`, these bugs do not manifest during standard movement. However, during knockback, chaos bot attacks, or physics desync where floating-point or NaN coordinates occur, this causes an unrecoverable main thread freeze.
2. **ObjectPool Implementation**: `ObjectPool<T>` passed all 100,000 adversarial cycles, starvation attacks, and double-release fuzzing without any flaws.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

While `ObjectPool<T>` and in-bounds `ZeroGCPathfinder` execution are mathematically sound and exceptionally fast (~80ms for 100,000 queries), Milestone 1 cannot be approved due to 1 critical freeze vulnerability and 2 high-severity boundary bugs:

1. **Critical:** `ZeroGCPathfinder.findPath` and `findSafeTile` enter an infinite loop when `startIdx` is `NaN`, `null`, `undefined`, or a float (`1.5`).
2. **High:** `ZeroGCPathfinder` returns off-grid paths instead of `0` when `startIdx` or `targetIdx` is outside `[0, totalTiles - 1]`.
3. **High:** `FlatHazardMask.has()`, `isHazard()`, and `getCoord()` falsely return positive / undefined on `NaN` and malformed coordinate keys.

### Concrete Remediation Required from M1 Worker:

1. **In `src/game/pathfinding.ts` (`ZeroGCPathfinder.findPath`):**
   Add input validation and loop guard:
   ```ts
   if (!Number.isInteger(startIdx) || startIdx < 0 || startIdx >= this.totalTiles ||
       !Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= this.totalTiles) {
     return 0;
   }
   ```
   In the path reconstruction while-loop, add a safety bound:
   ```ts
   while (curr !== startIdx && curr >= 0 && stepCount < this.totalTiles)
   ```

2. **In `src/game/pathfinding.ts` (`ZeroGCPathfinder.findSafeTile`):**
   ```ts
   if (!Number.isInteger(startIdx) || startIdx < 0 || startIdx >= this.totalTiles) {
     return -1;
   }
   ```
   And add `stepCount < this.totalTiles` guard to path reconstruction.

3. **In `src/game/pathfinding.ts` (`FlatHazardMask`):**
   Fix NaN relational comparisons in `has`, `isHazard`, and `getCoord`:
   ```ts
   if (Number.isNaN(r) || Number.isNaN(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS) {
     return false; // or 0 for getCoord
   }
   ```

---

## 5. Verification Method

To independently verify the failure modes and test the eventual fix:

1. **Run Challenger Stress Harness:**
   ```bash
   node --experimental-strip-types --test tests/m1_challenger_pathfinder_pool_stress.test.mjs
   ```
   - Current state: 4 pass, 3 fail (isolating the 3 vulnerabilities).
   - Expected after remediation: 7 pass, 0 fail.

2. **Run Full Project Test Suite:**
   ```bash
   npm test
   ```
