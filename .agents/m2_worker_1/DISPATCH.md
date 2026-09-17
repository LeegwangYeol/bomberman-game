# M2 Worker 1: Epic Boss Subsystem & Input Hardening Implementation

## Mission
You are M2 Worker 1 working in `/Users/user/src/bomberman/.agents/m2_worker_1/`.
You MUST read:
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/TEST_INFRA.md`
- Explorer deliverables:
  - `/Users/user/src/bomberman/.agents/m2_explorer_1/report.md` (BaseBoss, 3 Bosses, BossAttackManager)
  - `/Users/user/src/bomberman/.agents/m2_explorer_2/report.md` (TelegraphEngine)
  - `/Users/user/src/bomberman/.agents/m2_explorer_3/report.md` (BossHUD, React Bridge, tests/bosses.test.mjs, and pathfinding hardening diffs)

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks & File Ownership
You exclusively own and must implement:
1. `src/game/pathfinding.ts`: Apply the input validation and NaN/boundary hardening diffs from `m2_explorer_3/report.md`. Ensure `node --experimental-strip-types --test tests/m1_challenger_pathfinder_pool_stress.test.mjs` passes all 7 tests.
2. `src/game/bosses/TelegraphEngine.ts`: Implement the 3-tier floor telegraphing engine (Yellow 2.0s -> Amber 1.0s -> Red Flash 0.5s, >=40% safe area, single persistent Graphics batching).
3. `src/game/bosses/BaseBoss.ts`: Implement the 7-state FSM (`INTRO`, `PHASE_1`, `INTERMISSION`, `PHASE_2`, `ENRAGED`, `STUNNED`, `DEFEATED`), 150ms multi-bomb combo hit buffer (scaled stun up to 4.5s), enrage gauge (0-100%), and landing stun.
4. `src/game/bosses/GummyBearBoss.ts`: King Gummy Bear (Royal Jelly Bounce, Sugar Crush shockwaves, Gummy Cub minions, 2.2s landing pancake stun, 4.0s primed bomb stun).
5. `src/game/bosses/HamsterBoss.ts`: Mecha Hamster Captain Nibbles (Wheel Charge with 90° bank shots, head-on bomb collision 3.0s dizzy stun, Sunflower Gatling, EMP minefield).
6. `src/game/bosses/QueenBeeBoss.ts`: Queen Bee Cupcake (Aerial flight immunity to floor bomb flames, 4 rotating shields, worker bee bomb thieves, honey carpet, corner launcher anti-air sniping 3.0s stun, supersonic dive 2.5s coma).
7. `src/game/bosses/BossAttackManager.ts`: Zero-GC pooled attack manager.
8. `src/game/bosses/BossHUD.ts`: Boss HUD state manager and event emitter.
9. `src/components/BombermanGame.tsx`: Mount Boss HUD React component.
10. `tests/bosses.test.mjs`: Create the 7-suite headless boss simulation test harness from `m2_explorer_3/report.md`.

## Verification Commands
1. `node --experimental-strip-types --test tests/m1_challenger_pathfinder_pool_stress.test.mjs` (All 7 pass)
2. `node --experimental-strip-types --test tests/bosses.test.mjs` (All 7 suites pass)
3. `npm test` (all tests pass, 0 failures)
4. `node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs` (drift <= 0.25 MB)
5. `npm run lint` (0 errors)
6. `npm run build` (exit code 0)

Document all commands and verification results in `handoff.md`.
