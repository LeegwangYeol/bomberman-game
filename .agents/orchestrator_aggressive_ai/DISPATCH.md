## 2026-09-22T06:57:57Z

<USER_REQUEST>
You are the Project Orchestrator for the Aggressive Enemy AI rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/
Project Root: /Users/user/src/bomberman
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Context: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/context.md

Mission:
Rewrite the enemy AI in the Bomberman codebase to be highly aggressive. Enemies must actively destroy blocks to expand their territory and aggressively hunt, corner, and attack the player.

Requirements:
1. R1. Aggressive Territory Expansion: Modify core enemy AI (e.g., ChaserEnemy, BomberEnemy in src/game/entities/) so they no longer just wander randomly. They must actively identify destructible blocks blocking their path and strategically place bombs to destroy them and open up the map.
2. R2. Relentless Player Hunting & Attacking: Implement advanced hunting logic. Enemies should track player's position, attempt to corner them, and place bombs offensively to trap the player. Ensure they still possess self-preservation logic (running away from bomb blasts).

Acceptance Criteria:
- Enemy AI files (e.g., in src/game/entities/) updated with new aggressive block-destroying and pathfinding logic.
- Test suite tests/aggressive_ai.test.mjs added or updated, proving enemies actively place bombs to break blocks and reduce distance to the player over time.
- All tests pass (including existing and new test suites), game builds successfully (npm run build), and 0 lint errors exist (npm run lint).

Lifecycle & Tracking:
- Initialize your BRIEFING.md, plan.md, and progress.md in your working directory.
- Continually update progress.md and BRIEFING.md.
- Decompose the work, dispatch specialists (explorers, workers, reviewers, challengers) as needed.
- Maintain Zero-GC / pooling disciplines, collision safety, and robust architecture already in the repo.
- When done, run all tests, verify build and lint, and report back with a comprehensive victory report and verification evidence.
</USER_REQUEST>
