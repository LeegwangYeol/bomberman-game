# Dispatch: System, UI, Security, Bosses & Crises Remediation Worker (Replacement)

## Working Directory
`/Users/user/src/bomberman/.agents/worker_system_remediation_replace/`

## Context & Interruption Recovery
Your predecessor (`worker_system_remediation`) completed:
- [x] UI-03: NippleJS joystick diagonal dead zones (BombermanGame.tsx)
- [x] UI-04: Action button input drop during rapid tapping & pointer cancel (BombermanGame.tsx)
- [x] UI-05: Global key listener modal textarea/input guard (BombermanGame.tsx)
- [x] SEC-01: CircuitBreaker queued request deadlock on non-429 retries (CircuitBreaker.ts)
- [x] SEC-02: PerkTree prototype pollution crash on special property names (PerkTree.ts)
- [x] SEC-03: GameStatePersistence stale storage read after quota fallback (GameStatePersistence.ts)
- [x] SEC-04: GameStatePersistence save package schema sanitization (GameStatePersistence.ts)
- [x] ARCH-01: TelegraphEngine swap-and-pop corruption (TelegraphEngine.ts)

Predecessor was interrupted during:
- ARCH-02: BaseBoss post-combo i-frames & death animation (BaseBoss.ts)
- ARCH-03: QueenBeeBoss grounding/dive & HamsterBoss bounds clamp (QueenBeeBoss.ts, HamsterBoss.ts)
- ARCH-04: BaseCrisis reset() clearing subclass state (BaseCrisis.ts)
- ScalingEngine soft caps & NaN safety (ScalingEngine.ts)
- Defensive Unit & Integration Tests (bosses, persistence, hud, chaos)
- Final verification (`npm run test`, `npm run lint`)

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

Do NOT touch any files outside this list.

## Required Reading
- `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/COLLABORATION.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_ui/findings.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_security/findings.md`
- `/Users/user/src/bomberman/.agents/explorer_inspect_arch/findings.md`
- `/Users/user/src/bomberman/.agents/worker_system_remediation/progress.md`

## Mandate & Tasks
1. Verify state of predecessor's edits in `BombermanGame.tsx`, `CircuitBreaker.ts`, `PerkTree.ts`, `GameStatePersistence.ts`, `TelegraphEngine.ts`.
2. Implement remaining fixes:
   - **ARCH-02**: In `BaseBoss.ts`, ensure post-combo i-frames (1500ms) do not overlap or cancel tactical stun vulnerability windows; on boss defeat allow death animation / telemetry to finish cleanly before dismissal.
   - **ARCH-03**: In `QueenBeeBoss.ts` ensure proper grounding/dive triggers so Queen Bee is not permanently invincible in runtime. In `HamsterBoss.ts` clamp dash vectors within arena boundaries so it cannot dash outside the map.
   - **ARCH-04**: In `BaseCrisis.ts:114`, ensure `reset()` method clears all subclass state (`pendingCraters`, `voidCreepCount`, timers, etc.).
   - Ensure `ScalingEngine.ts` has soft caps and NaN safety guards.
3. Add permanent defensive tests in `tests/bosses.test.mjs`, `tests/persistence.test.mjs`, `tests/hud_inventory_expansion.test.mjs`, and `tests/chaos_resilience.test.mjs` verifying all fixed bugs.
4. Run `npm run test` and `npm run lint`. Ensure all tests pass with 0 errors!

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your completion handoff report to `/Users/user/src/bomberman/.agents/worker_system_remediation_replace/handoff.md` and report back via send_message to parent when complete.

## 2026-09-18T13:12:33Z
You are the System, UI, Security, Bosses & Crises Remediation Worker (Replacement) for the Bomberman Total Inspection ("총검사") milestone.
Working directory: /Users/user/src/bomberman/.agents/worker_system_remediation_replace/
Read your dispatch file at: /Users/user/src/bomberman/.agents/worker_system_remediation_replace/DISPATCH.md
MANDATORY: Read /Users/user/src/bomberman/ORIGINAL_REQUEST.md, /Users/user/src/bomberman/PROJECT.md, /Users/user/src/bomberman/COLLABORATION.md, and /Users/user/src/bomberman/.agents/worker_system_remediation/progress.md before starting work.

