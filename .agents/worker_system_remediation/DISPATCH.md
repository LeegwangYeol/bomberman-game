# Dispatch: System, UI, Security, Bosses & Crises Remediation Worker

## Working Directory
`/Users/user/src/bomberman/.agents/worker_system_remediation/`

## Exclusive File Ownership
You exclusively own and may edit ONLY these files:
- `src/game/bosses/TelegraphEngine.ts`
- `src/game/bosses/BaseBoss.ts`
- `src/game/bosses/HamsterBoss.ts`
- `src/game/bosses/QueenBeeBoss.ts`
- `src/game/crises/BaseCrisis.ts`
- `src/game/progression/PerkTree.ts`
- `src/game/progression/ScalingEngine.ts`
- `src/game/persistence/CircuitBreaker.ts`
- `src/game/persistence/GameStatePersistence.ts`
- `src/components/BombermanGame.tsx`
- `tests/bosses.test.mjs`
- `tests/persistence.test.mjs`
- `tests/hud_inventory_expansion.test.mjs`
- `tests/chaos_resilience.test.mjs`

Do NOT touch any files outside this list (Worker 1 owns GameScene, entities, pathfinding, AudioVoicePool, and movement/ai tests).

## Required Reading
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_ui/findings.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_security/findings.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_arch/findings.md`

## Mandate & Tasks (Milestones M8 & M9)
1. **UI-03**: Fix NippleJS joystick diagonal dead zones in `src/components/BombermanGame.tsx:498-501`: at angles around 135° and 225°, ensure multi-directional angle partitioning handles exact sector boundaries so directional intent is never lost.
2. **UI-04**: Fix Action button input drop during rapid tapping in `src/components/BombermanGame.tsx:514-550`: replace fragile `setTimeout` clearing with frame-synchronized or pointer-up/pointer-cancel state clearing, and add `onPointerCancel` handlers to prevent stuck buttons.
3. **UI-05**: Fix Global key listener trapping typing in Backup modal `<textarea>` in `src/components/BombermanGame.tsx:381`: check `(e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT'` and do NOT call `preventDefault()` or intercept game shortcuts when typing in form inputs.
4. **SEC-01**: Fix `CircuitBreaker.ts:286-306` queued request deadlock: when a queued request fails with a non-429 error and is re-queued with `retries <= 3`, do not stall indefinitely in `CLOSED` state; schedule an immediate or backoff retry.
5. **SEC-02**: Fix `PerkTree.ts:238-248` prototype pollution crash: replace direct property lookups on `CONFECTIONERY_PERKS` with `Object.prototype.hasOwnProperty.call(...)` or `perkId in ...` checks to prevent crashes when queries like `"toString"` or `"constructor"` are queried.
6. **SEC-03**: Fix `GameStatePersistence.ts:72-95` stale storage read after quota fallback: when `WebStorageAdapter` catches `QuotaExceededError` on `setItem` and switches to memory fallback, ensure subsequent `getItem` reads from the memory fallback rather than stale localStorage.
7. **SEC-04**: Fix `GameStatePersistence.ts:566` save package schema sanitization: validate imported data for negative values, NaN, or corrupted perk levels before computing remaining essence.
8. **ARCH-01**: Fix `TelegraphEngine.ts:312, 360` swap-and-pop corruption in `cancelAttack()` and `update()`: ensure active attack slot management properly handles in-place slot reallocation without data misalignment.
9. **ARCH-02**: Fix `BaseBoss.ts:218-225`: ensure post-combo i-frames do not negate tactical stun vulnerability windows, and on boss defeat allow death animation / telemetry to finish cleanly before dismissal.
10. **ARCH-03**: Fix `QueenBeeBoss.ts` & `HamsterBoss.ts`: ensure Queen Bee has proper grounding/dive triggers so it is not permanently invincible in runtime, and clamp Hamster dash vectors within arena boundaries so it cannot dash outside the map.
11. **ARCH-04**: Fix `BaseCrisis.ts:114`: ensure `reset()` method clears all subclass state (`pendingCraters`, `voidCreepCount`, timers, etc.).
12. **Defensive Tests**: Add permanent defensive tests in `tests/bosses.test.mjs`, `tests/persistence.test.mjs`, `tests/hud_inventory_expansion.test.mjs`, and `tests/chaos_resilience.test.mjs` verifying all fixed bugs.
13. **Verification**: Run `npm run test` and `npm run lint`. Ensure all tests pass with 0 errors!

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your report to `/Users/user/src/bomberman/.agents/worker_system_remediation/handoff.md` and report back via send_message to parent when complete.

## 2026-09-18T18:57:50Z
You are the System, UI, Security, Bosses & Crises Remediation Worker for the Bomberman Total Inspection ("총검사") milestone.
Working directory: /Users/user/src/bomberman/.agents/worker_system_remediation/
Exclusive File Ownership:
- src/game/bosses/TelegraphEngine.ts
- src/game/bosses/BaseBoss.ts
- src/game/bosses/HamsterBoss.ts
- src/game/bosses/QueenBeeBoss.ts
- src/game/crises/BaseCrisis.ts
- src/game/progression/PerkTree.ts
- src/game/progression/ScalingEngine.ts
- src/game/persistence/CircuitBreaker.ts
- src/game/persistence/GameStatePersistence.ts
- src/components/BombermanGame.tsx
- tests/bosses.test.mjs
- tests/persistence.test.mjs
- tests/hud_inventory_expansion.test.mjs
- tests/chaos_resilience.test.mjs

## 2026-09-18T10:20:52Z
**Context**: Orchestrator heartbeat and liveness monitoring for Milestones M8 & M9.
**Content**: It has been 20 minutes since dispatch. Please provide a brief status update on your implementation progress across your assigned files and update your progress.md with your latest timestamp and completed tasks.
**Action**: Update progress.md with your current checklist status and reply with your progress summary.
