# Worker Remediation Task: Fix Suicide Lifecycle, Hazard Masks & Boundary Bugs

You are Worker 2 (Remediation Worker) for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/worker_remediation/
Project Root: /Users/user/src/bomberman
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Gate Feedback: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/GATE_STATUS.md

## Reviews & Challenger Reports to Read:
- `/Users/user/src/bomberman/.agents/reviewer_aggressive_ai_2/handoff.md` (Suicide lifecycle & FlatHazardMask)
- `/Users/user/src/bomberman/.agents/challenger_aggressive_ai_1/handoff.md` (hasDirectPath on unreachable targets)
- `/Users/user/src/bomberman/.agents/challenger_aggressive_ai_2/handoff.md` (NaN infinite loop & wall guards)

## MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Remediation Tasks:
1. **`src/game/entities/EnemyEntities.ts`**:
   - In `ChaserEnemy.updateAI` (lines 173–182): when `this.escapePath.length === 0`, do NOT transition state to `TRACKING`. Instead, set velocity `this.setVelocity(0, 0)` and remain in `EnemyState.EVADING` holding the safe retreat tile until `onBombExploded()` is called (which transitions state back to `TRACKING` when `activeBombs === 0`). Keep the `evadeTimeoutMs <= 0` watchdog fallback.
   - In `BomberEnemy.updateAI` (lines 507–516): when `this.escapePath.length === 0`, do NOT transition state to `HUNTING`/`ENRAGED`. Instead, set velocity `this.setVelocity(0, 0)` and remain in `EnemyState.EVADING` holding the safe retreat tile until `onBombExploded()` is called (or `evadeTimeoutMs <= 0` watchdog).
   - In `BomberEnemy.updateAI` cornering check (lines 535–548): drop cornering bomb only when enemy is on the trap tile or `dist <= this.bombPower`.
2. **`src/game/pathfinding.ts`**:
   - In `isTileInBlastRange` (line 953): add `!Number.isInteger(tr) || !Number.isInteger(tc) || !Number.isInteger(cr) || !Number.isInteger(cc)` to boundary guard to prevent infinite while-loop CPU hang on `NaN`.
   - In `getSafeBombEscapePath` (line 1086): add `!Number.isInteger(r) || !Number.isInteger(c)` and wall pre-check `if (startTileVal === TILE_WALL || startTileVal === TILE_BLOCK) return null;`.
   - In `getSafeBombEscapePath` (line 1114): support `FlatHazardMask`:
     ```typescript
     if (existingBombs instanceof FlatHazardMask) {
       existingBombs.forEachHazard((br, bc) => simulatedBombs.add(`${br},${bc}`));
     } else if (existingBombs instanceof Set) {
       for (const s of existingBombs) simulatedBombs.add(s);
     }
     ```
   - In `ZeroGCPathfinder.findPathWithDemolition` (lines 576 & 700): if `!reachedTarget`, set `res.hasDirectPath = false;`.
   - In `findDemolitionPath` (lines 1040–1050): return `null` if `res.pathLength === 0 || (!reachedTarget && res.blockingBlockIdx === -1)`.
   - Add top-level export for `findPathWithDemolition` as convenience wrapper around `zeroGCPathfinder.findPathWithDemolition`.
3. **`tests/aggressive_ai.test.mjs`**:
   - In Scenario A2 and A3, update simulation to verify that the enemy takes 0 damage and does not get caught in any blast during continuous ticking.
4. **Verification**:
   - `node --experimental-strip-types --test tests/aggressive_ai.test.mjs`
   - `node --experimental-strip-types --test tests/adversarial_demolition_hunting.test.mjs`
   - `node --experimental-strip-types --test tests/adversarial_suicide_zerogc.test.mjs`
   - `npm test` (all 31+ test files, 100% pass)
   - `npm run lint` (0 errors)
   - `npm run build` (Next.js build succeeds)
   - Write handoff report to: `/Users/user/src/bomberman/.agents/worker_remediation/handoff.md`.
