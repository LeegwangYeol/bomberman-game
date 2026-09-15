# Dispatch: explorer_movement_refine

## Objective
Thoroughly inspect and analyze the player movement, collision detection, physics body configuration, and corridor navigation in the Bomberman prototype to solve wall snagging and implement smooth corner sliding.

## Mandatory Reading
- Original Request: `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- Collaboration Guide: `/Users/user/src/bomberman/COLLABORATION.md`
- Code files: `src/game/GameScene.ts`, `src/game/BombermanGame.tsx`, `src/game/pathfinding.ts`, `tests/`

## Specific Questions to Investigate
1. What physics engine is used (Phaser Arcade Physics, Matter, or custom)?
2. How is the player sprite and physics body initialized? What are the exact dimensions (width, height, offset) of the player's hitbox vs the tile size (e.g. 32x32, 48x48)?
3. Why does the player snag or get stuck on walls when moving vertically or turning corners?
4. How can corner sliding (also known as corner-rounding or grid alignment assist) be cleanly implemented in `GameScene.ts`?
   - For example: If player presses UP but is slightly misaligned with an open corridor, adjust X velocity or position slightly toward the corridor center so the player slides around the corner instead of stopping dead.
   - What tile/grid checks or raycasts/overlaps can detect adjacent open tiles?
   - Should the physics body size/offsets also be adjusted to provide a small buffer (e.g., 20x20 or 24x24 centered in a 32x32/48x48 sprite)?
5. What edge cases exist (e.g. moving between two walls, sliding into bombs, velocity calculations, delta time)?

## Deliverables
Produce a comprehensive handoff report at `/Users/user/src/bomberman/.agents/explorer_movement_refine/handoff.md` with:
- Observation: exact lines in `GameScene.ts` and related files
- Logic Chain: mathematical and architectural analysis of the snagging issue and corner sliding algorithm
- Caveats & Risks: any side effects on bomb placement, collision with enemies, or item pickup
- Recommendation: concrete implementation strategy and code snippets ready for Workers to apply
- Verification Method: how to verify and test corner sliding

## 2026-09-15T01:23:25Z
You are explorer_movement_refine. Your working directory is `/Users/user/src/bomberman/.agents/explorer_movement_refine`.

MANDATORY FIRST STEP: Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`. Subagents MUST read it before starting work.
Also read `/Users/user/src/bomberman/.agents/explorer_movement_refine/DISPATCH.md`.

Your task:
Analyze player movement, physics body sizes, collision detection, and corridor navigation in `src/game/GameScene.ts`, `src/game/BombermanGame.tsx`, and related files.
Determine why the player snags on walls and design a robust corner-sliding and hitbox adjustment solution.
Write your findings and recommendation to `/Users/user/src/bomberman/.agents/explorer_movement_refine/handoff.md`.
Remember to update `progress.md` with your status.
When finished, send a message to parent (ID: 5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec).
