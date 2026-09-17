# Remediation Worker Dispatch — Boss Subsystem Integrity Fix & Application Integration

## Mission
You are the Remediation Worker working in `/Users/user/src/bomberman/.agents/remediation_worker/`.
You MUST read:
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/TEST_INFRA.md`
- `/Users/user/src/bomberman/.agents/m6_auditor/handoff.md` (AUDIT VIOLATION EVIDENCE)
- `/Users/user/src/bomberman/.agents/remediation_explorer/report.md` (EXACT DIFFS AND REMEDIATION SPEC)
- `/Users/user/src/bomberman/.agents/remediation_explorer/handoff.md`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Tasks
1. Apply the exact import diffs and getters to all files in `src/game/bosses/*.ts`:
   - `src/game/bosses/types.ts`: update import to `'./BossTypes.ts'`
   - `src/game/bosses/BaseBoss.ts`: update imports to `'./BossTypes.ts'`, add `stunDurationMs`, `getState()`, `state`, `isComboActive`, `isStunned`, `stunRemainingMs`
   - `src/game/bosses/TelegraphEngine.ts`: update imports to `'../pathfinding.ts'`
   - `src/game/bosses/GummyBearBoss.ts`: update imports to `'./BaseBoss.ts'`, `'./BossTypes.ts'`
   - `src/game/bosses/HamsterBoss.ts`: update imports to `'./BaseBoss.ts'`, `'./BossTypes.ts'`
   - `src/game/bosses/QueenBeeBoss.ts`: update imports to `'./BaseBoss.ts'`, `'./BossTypes.ts'`
   - `src/game/bosses/BossAttackManager.ts`: update imports to `'../pooling/ObjectPool.ts'`, `'./BossTypes.ts'`
   - `src/game/bosses/BossHUD.ts`: update imports to `'./BossTypes.ts'`
   - `src/game/bosses/index.ts`: create barrel export exporting all boss classes, types, and engines
2. Rewrite `tests/bosses.test.mjs` according to Section 2 of `remediation_explorer/report.md`:
   - Eliminate all in-file duplicate mock classes (`SimBaseBoss`, `TelegraphSimulator`, `GummyBearSim`, `HamsterSim`, `QueenBeeSim`).
   - Directly import from `../src/game/bosses/index.ts`.
   - Ensure all 7 test suites execute and test the deliverable classes directly.
3. Integrate Boss Subsystem and Boss HUD into the live game:
   - In `src/game/GameScene.ts`: integrate boss encounter lifecycle, telegraph rendering, and bomb collision according to Section 3.1 of `remediation_explorer/report.md`.
   - In `src/components/BombermanGame.tsx`: integrate BossHUDState subscription and HUD bar overlay according to Section 3.2 of `remediation_explorer/report.md`.
4. Run all verification checks:
   - `node --experimental-strip-types -e "import('./src/game/bosses/index.ts').then(() => console.log('PASS'))"`
   - `node --experimental-strip-types --test tests/bosses.test.mjs`
   - `npm test`
   - `node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs`
   - `node --experimental-strip-types --test tests/chaos_resilience.test.mjs`
   - `npm run lint`
   - `npm run build`
5. Write your complete handoff in `handoff.md` and report back to parent.

## 2026-09-17T14:03:01Z
You are the Remediation Worker working in directory /Users/user/src/bomberman/.agents/remediation_worker/.
You MUST read:
- /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/bomberman/PROJECT.md
- /Users/user/src/bomberman/TEST_INFRA.md
- /Users/user/src/bomberman/.agents/m6_auditor/handoff.md
- /Users/user/src/bomberman/.agents/remediation_explorer/report.md
- /Users/user/src/bomberman/.agents/remediation_explorer/handoff.md
- /Users/user/src/bomberman/.agents/remediation_worker/DISPATCH.md

Tasks:
1. Apply the exact import diffs (.ts extensions) and getters to all files in src/game/bosses/*.ts:
   - types.ts, BaseBoss.ts, TelegraphEngine.ts, GummyBearBoss.ts, HamsterBoss.ts, QueenBeeBoss.ts, BossAttackManager.ts, BossHUD.ts, and create src/game/bosses/index.ts.
2. Rewrite tests/bosses.test.mjs according to Section 2 of remediation_explorer/report.md:
   - Eliminate all in-file duplicate mock classes (SimBaseBoss, TelegraphSimulator, GummyBearSim, HamsterSim, QueenBeeSim).
   - Directly import from ../src/game/bosses/index.ts.
   - Verify all 7 test suites pass against the genuine deliverable classes.
3. Integrate Boss Subsystem and Boss HUD into the live game:
   - In src/game/GameScene.ts: integrate boss encounter lifecycle, telegraph rendering, and bomb collision according to Section 3.1 of remediation_explorer/report.md.
   - In src/components/BombermanGame.tsx: integrate BossHUDState subscription and HUD bar overlay according to Section 3.2 of remediation_explorer/report.md.
4. Run all verification checks:
   - node --experimental-strip-types -e "import('./src/game/bosses/index.ts').then(() => console.log('PASS'))"
   - node --experimental-strip-types --test tests/bosses.test.mjs
   - npm test
   - node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs
   - node --experimental-strip-types --test tests/chaos_resilience.test.mjs
   - npm run lint
   - npm run build
5. Write your complete handoff in handoff.md and send a message to parent when done.
