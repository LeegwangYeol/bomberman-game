# Explorer Task: Core Enemy AI & Entities

You are Explorer 1 for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/explorer_ai_entities/
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Orchestrator Plan: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/plan.md

## Mission:
Investigate all enemy entities in `src/game/entities/`, focusing on:
1. `Enemy.ts`, `ChaserEnemy.ts`, `BomberEnemy.ts`, and other enemy subclasses.
2. Current FSM states, movement speed, update loops, and player tracking mechanisms.
3. How bombs are placed by enemies (e.g., in `BomberEnemy`), how bomb ownership and cooldowns are handled, and how `findEscapePathBFS()` is called.
4. Identify how to implement:
   - R1: Aggressive Territory Expansion — active identification of destructible blocks blocking paths and placing bombs to destroy them.
   - R2: Relentless Player Hunting & Cornering — offensive tracking and cornering/trapping with bombs, while preserving self-preservation/escape logic.
5. Provide a detailed concrete implementation strategy and interface recommendations.

Output your report to:
`/Users/user/src/bomberman/.agents/explorer_ai_entities/handoff.md`
Remember to send a message to orchestrator when finished.
