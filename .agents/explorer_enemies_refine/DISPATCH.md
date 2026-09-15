# Dispatch: explorer_enemies_refine

## Objective
Thoroughly inspect and analyze the enemy AI, state management, visual representations, animations, and intent indicators in the Bomberman prototype to make enemies lively, dynamic, and visually distinct across their states.

## Mandatory Reading
- Original Request: `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- Collaboration Guide: `/Users/user/src/bomberman/COLLABORATION.md`
- Code files: `src/game/GameScene.ts`, `src/game/pathfinding.ts`, `src/game/types.ts` (if exists), `tests/`

## Specific Questions to Investigate
1. How are enemies currently created and tracked in `GameScene.ts`?
2. What are the current AI states or logic (e.g. patrol, chase/hunt, attack, idle)?
3. How are enemies currently rendered? Are they Phaser Sprites, Images, or Containers? What assets or textures are used?
4. How can distinct AI states (idle, moving/patrolling, hunting/chasing) be clearly distinguished visually?
   - Dynamic scaling / squash & stretch / bounce tweens
   - Visual intent indicators (e.g., floating exclamation mark '!', targeting tint/glow, colored outline, eye direction, or state indicator text/icon)
   - Particle effects or walking wobble/waddle animations
5. How can state transitions trigger corresponding visual feedback cleanly without leaking memory or breaking tweens on enemy death/reuse?
6. Are there existing unit/E2E tests for enemy behavior? How can the new visual changes be tested?

## Deliverables
Produce a comprehensive handoff report at `/Users/user/src/bomberman/.agents/explorer_enemies_refine/handoff.md` with:
- Observation: exact lines in `GameScene.ts` and related files
- Logic Chain: state machine design and visual mapping for each state
- Caveats & Risks: performance impact of multiple enemy tweens/particles, cleanup on death
- Recommendation: exact implementation plan with concrete code structures for Workers to apply
- Verification Method: test strategies for verifying state transitions and visual indicators

## 2026-09-15T01:23:25Z
You are explorer_enemies_refine. Your working directory is `/Users/user/src/bomberman/.agents/explorer_enemies_refine`.
MANDATORY FIRST STEP: Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`. Subagents MUST read it before starting work.
Also read `/Users/user/src/bomberman/.agents/explorer_enemies_refine/DISPATCH.md`.

Your task:
Analyze enemy AI states, pathfinding, visual representations, animations, and intent indicators in `src/game/GameScene.ts`, `src/game/pathfinding.ts`, and related files.
Design a system for lively enemies with distinct visual states (idle, moving, hunting) with dynamic animations, scaling, particle effects, or intent indicators.
Write your findings and recommendation to `/Users/user/src/bomberman/.agents/explorer_enemies_refine/handoff.md`.
Remember to update `progress.md` with your status.
When finished, send a message to parent (ID: 5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec).
