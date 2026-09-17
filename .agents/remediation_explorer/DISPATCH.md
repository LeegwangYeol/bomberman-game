# Remediation Explorer: Boss Subsystem Integrity Fix Strategy

## Mission
You are the Remediation Explorer working in `/Users/user/src/bomberman/.agents/remediation_explorer/`.
You MUST read:
- `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/src/bomberman/PROJECT.md`
- `/Users/user/src/bomberman/TEST_INFRA.md`
- `/Users/user/src/bomberman/.agents/m6_auditor/handoff.md` (FULL AUDIT EVIDENCE REPORT)

## Full Forensic Auditor Evidence Report
```markdown
Verdict: INTEGRITY VIOLATION

1. Subsystem Import Execution Failure:
   Attempting to import src/game/bosses/*.ts directly with Node.js --experimental-strip-types resulted in fatal resolution errors across all files:
   Cannot find module '/Users/user/src/bomberman/src/game/bosses/BossTypes' imported from BaseBoss.ts
   Cannot find module '/Users/user/src/bomberman/src/game/pathfinding' imported from TelegraphEngine.ts
   Cannot find module '/Users/user/src/bomberman/src/game/bosses/BaseBoss' imported from GummyBearBoss.ts
   Cannot find module '/Users/user/src/bomberman/src/game/bosses/BaseBoss' imported from HamsterBoss.ts
   Cannot find module '/Users/user/src/bomberman/src/game/bosses/BaseBoss' imported from QueenBeeBoss.ts
   Cannot find module '/Users/user/src/bomberman/src/game/pooling/ObjectPool' imported from BossAttackManager.ts
   Cannot find module '/Users/user/src/bomberman/src/game/bosses/BossTypes' imported from BossHUD.ts

2. Test File Bypass in tests/bosses.test.mjs:
   tests/bosses.test.mjs does NOT import any file from src/game/bosses/. Instead, lines 35-460 declare in-file mock replicas (SimBaseBoss, TelegraphSimulator, GummyBearSim, HamsterSim, QueenBeeSim) and test those mocks, bypassing the deliverable code entirely.

3. Application Unlinking:
   src/game/bosses/ is never imported in src/game/GameScene.ts, src/components/BombermanGame.tsx, or any other application file.
```

## Objective
Investigate and formulate the exact remediation strategy:
1. Exact diffs for relative imports in all `src/game/bosses/*.ts` files to include `.ts` extensions (matching the pattern used successfully in `src/game/crises/` and `src/game/progression/`).
2. Exact refactoring strategy for `tests/bosses.test.mjs` to delete all in-file duplicate mock classes and import directly from `src/game/bosses/BaseBoss.ts`, `TelegraphEngine.ts`, `GummyBearBoss.ts`, `HamsterBoss.ts`, `QueenBeeBoss.ts`, `BossHUD.ts`.
3. Exact integration hooks for importing and attaching `src/game/bosses/` in `GameScene.ts` and `BombermanGame.tsx`.

Write your complete remediation plan to `report.md` and complete handoff in `handoff.md`.

## 2026-09-17T13:57:50Z
You are the Remediation Explorer working in directory /Users/user/src/bomberman/.agents/remediation_explorer/.
You MUST read:
- /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/bomberman/PROJECT.md
- /Users/user/src/bomberman/TEST_INFRA.md
- /Users/user/src/bomberman/.agents/m6_auditor/handoff.md (FULL AUDIT EVIDENCE REPORT)
- /Users/user/src/bomberman/.agents/remediation_explorer/DISPATCH.md

Investigate the exact codebase to produce a concrete, step-by-step remediation plan with exact diffs:
1. Relative imports in all files under src/game/bosses/*.ts:
   Add explicit `.ts` extensions (e.g. `import { ... } from './BossTypes.ts';`, `import { ... } from '../pathfinding.ts';`, `import { ObjectPool } from '../pooling/ObjectPool.ts';`).
   Verify every single import statement across `BaseBoss.ts`, `GummyBearBoss.ts`, `HamsterBoss.ts`, `QueenBeeBoss.ts`, `TelegraphEngine.ts`, `BossAttackManager.ts`, and `BossHUD.ts`.
2. Refactoring tests/bosses.test.mjs:
   Completely remove all in-file duplicate mock classes (SimBaseBoss, TelegraphSimulator, GummyBearSim, HamsterSim, QueenBeeSim).
   Directly import the real deliverable classes from `../src/game/bosses/BaseBoss.ts`, `../src/game/bosses/TelegraphEngine.ts`, `../src/game/bosses/GummyBearBoss.ts`, `../src/game/bosses/HamsterBoss.ts`, `../src/game/bosses/QueenBeeBoss.ts`, `../src/game/bosses/BossHUD.ts`, and `../src/game/bosses/BossTypes.ts`.
   Check if any methods or properties in the tests need minor adaptation to match the real implementation (e.g. constructor arguments, method names).
3. Application linking:
   Inspect `src/game/GameScene.ts` and `src/components/BombermanGame.tsx`.
   Formulate exact integration hooks:
   - In `GameScene.ts`, add Boss integration for Boss Rush & Endless Gauntlet modes (importing BaseBoss/GummyBearBoss/HamsterBoss/QueenBeeBoss, TelegraphEngine, updating and rendering boss & telegraphs).
   - In `BombermanGame.tsx`, wire BossHUD to display the boss health bar / enrage meter when an active boss is present.

Write your findings to /Users/user/src/bomberman/.agents/remediation_explorer/report.md and create a self-contained handoff.md in your working directory. Send a message to your parent when done.
