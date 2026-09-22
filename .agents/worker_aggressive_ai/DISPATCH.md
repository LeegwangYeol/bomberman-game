## 2026-09-22T07:05:56Z

You are Worker 1 (Aggressive AI Implementation Worker).
Your working directory: /Users/user/src/bomberman/.agents/worker_aggressive_ai/
Task file: /Users/user/src/bomberman/.agents/worker_aggressive_ai/task.md
Authoritative request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Scope specification: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/SCOPE.md

Please read your task file and the 3 Explorer handoff reports:
- /Users/user/src/bomberman/.agents/explorer_ai_entities/handoff.md
- /Users/user/src/bomberman/.agents/explorer_ai_pathfinding/handoff.md
- /Users/user/src/bomberman/.agents/explorer_ai_tests/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement the aggressive enemy AI features:
1. `src/game/pathfinding.ts` (demolition pathfinding, safe bomb placement evaluation, cornering trap helpers).
2. `src/game/entities/EnemyEntities.ts` (ChaserEnemy & BomberEnemy aggressive block destruction, hunting/cornering, suicide prevention, TS strip-types friendly EnemyState).
3. `src/game/GameScene.ts` (wire ChaserEnemy updateAI to pass placeEnemyBomb callback).
4. `tests/aggressive_ai.test.mjs` (Scenarios A, B, C, D tests).

Run verification commands (`npm test`, `npm run lint`, `npm run build`), document results, and write your handoff report to:
`/Users/user/src/bomberman/.agents/worker_aggressive_ai/handoff.md`

When done, send a message to orchestrator.
