# Handoff Report: AI & Pathfinding Inspection ("총검사")

## 1. Observation
Direct forensic observations from the Bomberman codebase:

1. **ZeroGCPathfinder Parameter Inversion**:
   - `src/game/pathfinding.ts:272`: `constructor(rows: number = ROWS, cols: number = COLS)`
   - `src/game/pathfinding.ts:286`: `public init(cols: number, rows: number): void`
   - Observation: Inverted parameter order flips rows and columns if called symmetrically.

2. **Unchecked Coordinate Bounds in `isTileInBlastRange`**:
   - `src/game/pathfinding.ts:711`: `const tileVal = Array.isArray(map) ? map[r][c] : map[r * COLS + c];`
   - `src/game/pathfinding.ts:716`: `const destVal = Array.isArray(map) ? map[tr][tc] : map[tr * COLS + tc];`
   - Observation: When `r < 0` or `r >= ROWS`, `map[r]` is `undefined`, causing `TypeError: Cannot read properties of undefined (reading 'c')`.

3. **ChaserEnemy Double-Stun Race**:
   - `src/game/entities/BaseEntity.ts:162-165`:
     ```ts
     if (this.isStunned && currentTime >= this.stunUntil) {
       this.isStunned = false;
       this.overheadUI.setIntent('', false);
     }
     ```
   - `src/game/entities/EnemyEntities.ts:112-120`:
     ```ts
     this.updateEntity(delta, currentTime);
     if (this.isStunned) {
       if (currentTime >= this.stunUntil) {
         this.isStunned = false;
         this.changeState(EnemyState.TRACKING);
       }
       return;
     }
     ```
   - `src/game/entities/EnemyEntities.ts:195-200`:
     ```ts
     case EnemyState.COOLDOWN:
       this.stateTimer -= delta;
       if (this.stateTimer <= 0) {
         this.changeState(EnemyState.TRACKING);
       }
       break;
     ```
   - Observation: `BaseEntity.updateEntity` resets `isStunned` on line 112, skipping line 114, falling into `COOLDOWN` which counts down an unreduced 900ms `stateTimer` (total 1800ms stun).

4. **BomberEnemy Evasion Deadlock & Missing Callback**:
   - `src/game/entities/EnemyEntities.ts:316-342`: In `EnemyState.EVADING`, movement along `escapePath` executes `return;` every frame without a timeout timer.
   - `src/game/entities/EnemyEntities.ts:228-387`: `BomberEnemy` class does not implement `onBombExploded()`, whereas `GameScene.ts:2381` and unit test `MockEnemyModel` expect `enemy.onBombExploded()` to release evasion.

5. **Ghost Ether Dash 1-Frame Cancellation**:
   - `src/game/entities/EnemyEntities.ts:591-605`: Sets `this.setVelocity(Math.sign(dx) * 260, 0)` and `this.isMaterialized = true`.
   - `src/game/entities/EnemyEntities.ts:608-621`: Next frame, line 608 checks `if (this.currentPath.length > 0)`, immediately resetting velocity to `45.5 px/s` (`phaseSpeed * 0.7`). Dash lasts only 1 frame (16.6ms).

6. **MerchantNPC Flee Logic Flaw**:
   - `src/game/entities/NeutralEntities.ts:95`:
     ```ts
     const escape = findEscapePathBFS({ r: mr, c: mc }, bombTiles, map, bombTiles, 4);
     ```
   - Observation: Passes single bomb coordinate `bombTiles` as `dangerTiles` instead of blast raycast tiles. `findSafeTile` sees `dangerMask[startIdx] === 0` and returns `[]`. Merchant never moves away from the explosion.

7. **PetDrone Ally Frame-Rate Dependence**:
   - `src/game/entities/AllyEntities.ts:214-215`:
     ```ts
     closestItem.x += Math.cos(angle) * 2.5;
     closestItem.y += Math.sin(angle) * 2.5;
     ```
   - Observation: Fixed 2.5 px increment without `delta` scaling yields 75 px/s at 30 FPS vs 300 px/s at 120 FPS.

8. **Boss Invariants (Hamster Boundary & Queen Bee Grounding)**:
   - `src/game/bosses/HamsterBoss.ts:86-90`: Updates `this.x` directly during dash with no boundary clamp, and `onWallImpact()` is never called in `src/game/GameScene.ts`.
   - `src/game/bosses/QueenBeeBoss.ts:62-64`: Requires `this.isGrounded && this.bossState === BossState.STUNNED` to take damage, but dive attacks, snipes, and shield popping are never triggered in runtime gameplay.

---

## 2. Logic Chain
1. **From Observation 1**: Because `ZeroGCPathfinder.constructor` has `(rows, cols)` while `init` has `(cols, rows)`, any caller passing arguments symmetrically in `(rows, cols)` format will unintentionally set `this.cols = 13` and `this.rows = 15`. This shears the 1D index formula `r * cols + c`, producing incorrect neighbor lookups.
2. **From Observation 2**: Because `isTileInBlastRange` loops from `cr` to `tr` without boundary guards, evaluating off-grid targets (e.g. negative coords) results in evaluating `map[-1][tc]`, triggering an immediate fatal `TypeError`.
3. **From Observation 3**: Because `BaseEntity.updateEntity` is called at line 112, the condition `currentTime >= this.stunUntil` sets `this.isStunned = false` before line 114 is evaluated. Consequently, the early exit and transition to `TRACKING` at line 116 are skipped. The state machine drops through to line 195 with `aiState === 'COOLDOWN'`. Because `this.stateTimer` was frozen during the stun, it counts down another 900ms, strictly doubling the enemy's recovery latency to 1800ms.
4. **From Observation 4**: In `EnemyState.EVADING`, the enemy continuously returns early without recalculating or timing out. If an obstacle blocks path step 0, the enemy never transitions out of `EVADING`. Because `BomberEnemy` lacks `onBombExploded()`, bomb detonation does not clear evasion. The enemy is permanently softlocked.
5. **From Observation 5**: Because `GhostEnemy` does not enter a dedicated `DASHING` state or gate its path-following block with a timer, on the very next frame after triggering an Ether Dash, `currentPath` resets velocity to 45.5 px/s, cutting off the 260 px/s dash in ~16ms.
6. **From Observation 6**: In `NeutralEntities.ts`, `findEscapePathBFS` expects `dangerTiles` to cover the entire explosion radius. By passing `bombTiles` (which contains only the bomb's epicenter), the Merchant's current location is evaluated as safe (`len = 0`), returning an empty escape path. The Merchant remains stationary and dies.
7. **From Observation 7**: Hardcoding pixel movement per frame without `(delta / 1000)` causes physics movement rates to tie directly to monitor refresh rate.
8. **From Observation 8**: In `QueenBeeBoss`, the boss cannot take damage while flying (`isGrounded === false`). Because no mechanism in `GameScene.ts` or `QueenBeeBoss.update` transitions `isGrounded` to `true`, the boss is mathematically impossible to damage. In `HamsterBoss`, dashes proceed without boundary limits or wall impact handlers, sending the boss off-screen.

---

## 3. Caveats
- **Headless Tests vs Runtime Scene**: Unit test suites (`tests/entities_expansion.test.mjs`, `tests/bosses.test.mjs`) use custom simulator mocks (`EntitySimulator`, `MockEnemyModel`) that bypassed several of the discovered production bugs (e.g. `MockEnemyModel` implemented `onBombExploded()` while `BomberEnemy` did not).
- **Phaser Arcade Physics Separation**: Actual wall clipping for `SplitterEnemy` mini-slimes depends on whether the adjacent wall is a static body or tilemap layer. In Phaser Arcade Physics, spawning directly inside a static body produces non-deterministic velocity repulsion.
- **No Caveats** on pathfinding math, flat 1D array indexing, FSM transitions, and timer logic; all were verified directly against source code lines.

---

## 4. Conclusion
The AI, pathfinding, and boss architectures exhibit high structural ambition (Zero-GC pooling, multi-tier overhead UI, complex FSMs), but suffer from critical implementation disconnects between test simulators and production code. Specifically:
- `BomberEnemy` is vulnerable to permanent evasion freeze.
- `QueenBeeBoss` is completely invincible in normal gameplay.
- `HamsterBoss` can dash outside map boundaries.
- `GhostEnemy` has a broken 1-frame dash animation.
- `MerchantNPC` fails to flee bombs due to an invalid danger mask parameter.
- `ZeroGCPathfinder.init` has reversed arguments.

Remediation of these defects is essential to achieve the zero-defect standard of the Total Inspection ("총검사") milestone.

---

## 5. Verification Method
1. **Unit Test Command**:
   ```bash
   npm test
   ```
   Ensures the existing 422 test cases continue to pass.
2. **Dedicated Invariant Regression Verification**:
   Inspect the following files and lines:
   - `src/game/pathfinding.ts:286`: Verify `init(rows, cols)` matches `constructor(rows, cols)`.
   - `src/game/pathfinding.ts:708`: Verify bounds check on `isTileInBlastRange`.
   - `src/game/entities/EnemyEntities.ts:114`: Verify `ChaserEnemy` recovers in exactly 900ms.
   - `src/game/entities/EnemyEntities.ts:316`: Verify `BomberEnemy` has `onBombExploded()` and evasion timeout.
   - `src/game/entities/EnemyEntities.ts:591`: Verify `GhostEnemy` dash maintains velocity for full dash duration.
   - `src/game/entities/NeutralEntities.ts:95`: Verify `MerchantNPC` computes blast raycast before calling `findEscapePathBFS`.
   - `src/game/bosses/QueenBeeBoss.ts:62` & `HamsterBoss.ts:154`: Verify grounding and wall bounce triggers are wired into `GameScene.ts`.
3. **Build Command**:
   ```bash
   npm run build
   ```
   Verifies full TypeScript type check and Next.js static generation exit with code 0.
