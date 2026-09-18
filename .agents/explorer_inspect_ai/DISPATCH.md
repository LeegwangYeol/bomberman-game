# Dispatch: AI & Pathfinding Inspector

## Working Directory
`/Users/user/src/bomberman/.agents/explorer_inspect_ai/`

## Instructions
You are an expert AI & Pathfinding Inspector for the Bomberman codebase Total Inspection ("총검사") milestone.
Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`.

Thoroughly inspect all source files related to AI, pathfinding, and entity logic:
- `src/game/pathfinding.ts`
- `src/game/ZeroGCPathfinder.ts` (or equivalent)
- `src/game/entities/` (all enemies, neutrals, allies, bosses)
- `src/game/GameScene.ts`

Examine:
1. `ZeroGCPathfinder`: coordinate conversion, flat 1D array indexing, bounds checking, memory safety, potential out-of-bounds array reads.
2. FSM transitions across all enemy types (`CHASER`, `BOMBER`, `TANK`, `GHOST`, `SPLITTER`, `BaseBoss`, etc.): stuck states, invalid state transitions, frame-rate dependent timers.
3. Ghost phasing & rematerialization: can ghost rematerialize inside solid walls or bombs?
4. Suicide-prevention invariant: does `findEscapePathBFS()` correctly handle tight corridors, dead ends, or moving hazards?
5. Ally behavior (`MINI_BOMBER`, `PET_DRONE`, `SHIELD_GUARD`): friendly fire avoidance, vacuum item logic, collision layers.

Write your comprehensive findings to `/Users/user/src/bomberman/.agents/explorer_inspect_ai/findings.md` and write your completion handoff report to `/Users/user/src/bomberman/.agents/explorer_inspect_ai/handoff.md`.
Report back when finished.

## 2026-09-18T09:17:53Z
Expert AI & Pathfinding Inspector dispatched for Total Inspection ("총검사"). Focus areas:
1. ZeroGCPathfinder: coordinate conversion, flat 1D array indexing, bounds checking, memory safety, out-of-bounds array reads.
2. FSM transitions across all enemy types (CHASER, BOMBER, TANK, GHOST, SPLITTER, BaseBoss, etc.): stuck states, invalid state transitions, frame-rate dependent timers.
3. Ghost phasing & rematerialization: solid walls or bomb overlap.
4. Suicide-prevention invariant: findEscapePathBFS() handling of corridors, dead ends, moving hazards.
5. Ally behavior (MINI_BOMBER, PET_DRONE, SHIELD_GUARD): friendly fire avoidance, vacuum item logic, collision layers.

## 2026-09-18T09:32:53Z
Message from parent (aa0b6d8f-15cd-47a9-98b9-32048d20bdc6):
**Context**: Total Inspection Stage 1 — AI & Pathfinding Inspection
**Content**: Checking in on inspection status.
**Action**: Please update progress.md with your latest findings and deliver your completion report to findings.md and handoff.md when finished.
