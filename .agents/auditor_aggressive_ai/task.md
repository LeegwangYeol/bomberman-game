# Forensic Auditor Task: Integrity Verification

You are the Forensic Auditor for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/auditor_aggressive_ai/
Project Root: /Users/user/src/bomberman
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Worker Handoff: /Users/user/src/bomberman/.agents/worker_aggressive_ai/handoff.md
Scope: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/SCOPE.md

## Mission:
Conduct an independent forensic integrity audit of the Aggressive Enemy AI rewrite:
1. Integrity Checks:
   - Check if any test in `tests/aggressive_ai.test.mjs` or other test files is hardcoded, cheated, mocked to return static pass without running logic, or bypassing actual algorithms.
   - Check if `src/game/pathfinding.ts`, `src/game/entities/EnemyEntities.ts`, and `src/game/GameScene.ts` implement genuine, working algorithms for:
     - Soft-block demolition pathfinding (`findPathWithDemolition`, `findTargetBlockBFS`)
     - Safe bomb placement & escape evaluation (`canSafelyPlaceBomb`, `getSafeBombEscapePath`)
     - Offensive cornering & trap bombing (`findCorneringBombTile`)
     - Suicide-prevention guarantees
   - Verify that there are no facade implementations, dummy stubs, or mock overrides in production source code.
   - Verify git diff / changes to confirm only legitimate production code was added.
2. Formulate an explicit binary verdict: `CLEAN` or `INTEGRITY VIOLATION`.

Write your full audit report to:
`/Users/user/src/bomberman/.agents/auditor_aggressive_ai/handoff.md`
Remember to send a message to orchestrator when finished.
