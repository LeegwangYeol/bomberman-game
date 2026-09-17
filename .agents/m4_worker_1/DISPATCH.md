## 2026-09-17T13:31:46Z

You are M4 Worker 1 working in directory /Users/user/src/bomberman/.agents/m4_worker_1/.
You MUST read /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md first.
Also read /Users/user/src/bomberman/PROJECT.md, /Users/user/src/bomberman/TEST_INFRA.md, and /Users/user/src/bomberman/.agents/explorer_survey_1/report.md (Sections 3 & 4: Infinite Scaling, Game Modes, Meta-Progression & Relics, lines 900-1250).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Implement src/game/progression/ProgressionTypes.ts.
2. Implement src/game/progression/ScalingEngine.ts (speed scaling with 2.2x soft cap, density cap 14, boss HP, bomb fuse).
3. Implement src/game/progression/GameModes.ts (Standard, Crisis Survival, Boss Rush, Endless Gauntlet).
4. Implement src/game/progression/PerkTree.ts (16-node Confectionery Perk Tree across Baking, Sugar Rush, Resilience, Alchemy; Star Candies & Cosmic Sugar Essence).
5. Implement src/game/progression/RelicSystem.ts (passive relics, synergies, drops).
6. Integrate Game Mode selector and progression status into src/components/BombermanGame.tsx.
7. Implement tests/progression.test.mjs covering all scaling formulas, modes, perk tree nodes, and relics.
8. Run all verifications:
   - node --experimental-strip-types --test tests/progression.test.mjs
   - npm test
   - node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs
   - npm run lint
   - npm run build
Write a complete handoff.md and report to parent when done.
