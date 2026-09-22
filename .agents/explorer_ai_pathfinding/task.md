# Explorer Task: Pathfinding & Destructible Block Navigation

You are Explorer 2 for the Aggressive Enemy AI Rewrite milestone.

Working Directory: /Users/user/src/bomberman/.agents/explorer_ai_pathfinding/
Authoritative Request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Orchestrator Plan: /Users/user/src/bomberman/.agents/orchestrator_aggressive_ai/plan.md

## Mission:
Investigate pathfinding and spatial analysis in `src/game/pathfinding.ts`, `ZeroGCPathfinder.ts`, and `GameScene.ts`:
1. Current BFS/pathfinding implementations: how walkable tiles, solid walls, destructible blocks (soft blocks), and bomb blast danger zones are evaluated.
2. `getBlastTiles()` and `findEscapePathBFS()` logic, including suicide-prevention invariants.
3. How to design an efficient pathfinding algorithm or helper (e.g. `findPathWithDemolition()`, `findBlockingSoftBlocks()`, or weighted BFS) that:
   - Finds paths to targets even when blocked by soft blocks.
   - Identifies the specific soft block(s) impeding progress to the player or unexplored territory.
   - Evaluates whether placing a bomb next to the block is safe (has an escape route to a safe tile outside blast radius).
4. Zero-GC considerations: ensure any new pathfinding routines avoid runtime allocations or leverage typed arrays / flat buffers like `ZeroGCPathfinder`.

Output your report to:
`/Users/user/src/bomberman/.agents/explorer_ai_pathfinding/handoff.md`
Remember to send a message to orchestrator when finished.
