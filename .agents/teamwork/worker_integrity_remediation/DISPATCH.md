## 2026-09-29T17:02:52Z
<USER_REQUEST>
You are the Quality Gates & Anti-Cheat Remediation Worker for Milestone 17 Iteration 2.

## Your Identity & Environment
- **Role**: Quality Gates & Anti-Cheat Remediation Worker
- **Working Directory**: `/Users/user/src/bomberman/.agents/teamwork/worker_integrity_remediation`
- **Project Root**: `/Users/user/src/bomberman`

## File Ownership (STRICT EXCLUSIVITY)
You exclusively own and may edit ONLY the following files:
1. `src/components/BombermanGame.tsx`
2. `src/game/persistence/GameStatePersistence.ts`
3. `tests/persistence.test.mjs`

DO NOT modify any other files in the repository.

## Authoritative Inputs (Read First! MUST read before starting)
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- Explorer 1 Report: `/Users/user/src/bomberman/.agents/teamwork/explorer_audit_remediation_1/handoff.md`
- Explorer 2 Report: `/Users/user/src/bomberman/.agents/teamwork/explorer_audit_remediation_2/handoff.md`
- Explorer 3 Report: `/Users/user/src/bomberman/.agents/teamwork/explorer_audit_remediation_3/handoff.md`
- Forensic Audit Report: `/Users/user/src/bomberman/.agents/teamwork/auditor_total_inspection_1/handoff.md`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Tasks to Implement

### Task 1: Fix React Ref Mutation during Render in `src/components/BombermanGame.tsx`
- In `src/components/BombermanGame.tsx`, locate lines 103-121:
  Remove `isAnyModalOpenRef.current = isAnyModalOpen;` from line 105 (component render body).
  Insert `isAnyModalOpenRef.current = isAnyModalOpen;` as the first statement inside the `useEffect(() => { ... }, [isAnyModalOpen])` hook on line 107.
- This resolves `react-hooks/refs` ("Cannot update ref during render") and eliminates the 1 error blocking `npm run lint`.

### Task 2: Purge Test-Sniffing Bypasses in `src/game/persistence/GameStatePersistence.ts`
- In `src/game/persistence/GameStatePersistence.ts`, locate lines 525-568:
  1. Remove `const isLegacyPerk = key === 'BAKE_1' || key === 'SPEED_1';` and remove `!isLegacyPerk` from the loop guard. Validate perk keys purely using `const node = Object.prototype.hasOwnProperty.call(CONFECTIONERY_PERKS, key) ? CONFECTIONERY_PERKS[key] : null; if (!node) continue; const maxLevel = node.maxLevel;`.
  2. Delete `const isLegacyProtoTest = ...` entirely.
  3. Ensure `sanitizedUnlockedModes` strictly filters using `typeof m === 'string' && validGameModes.has(m)`. No exceptions or test-sniffing heuristics.

### Task 3: Update Outdated Assertions in `tests/persistence.test.mjs`
- In `tests/persistence.test.mjs`:
  1. Lines 321-337: Update the test fixture from `perks: { BAKE_1: 2, SPEED_1: 1 }` to canonical perks `perks: { sugar_spark: 2, quick_wick: 1 }` and update `assert.equal(loaded.perks.sugar_spark, 2);`.
  2. Line 772: Update the assertion from `assert.deepEqual(sanitized.unlockedModes, ['boss_rush', '__proto__']);` to `assert.deepEqual(sanitized.unlockedModes, ['boss_rush']);` because `'__proto__'` is an attack vector and must be purged by mode whitelisting.

## Verification Requirements
Run the following commands using your tool suite:
1. `npm run lint` -> MUST exit with code 0 and report 0 errors.
2. `npm test` -> MUST pass 700/700 tests (100%).
3. `npm run build` -> MUST compile successfully with Next.js Turbopack and exit code 0.
4. `git grep "isLegacyProtoTest"` and `git grep "isLegacyPerk"` -> MUST yield 0 matches.

Write your handoff report to `/Users/user/src/bomberman/.agents/teamwork/worker_integrity_remediation/handoff.md` and send a message back with your execution results.
</USER_REQUEST>
