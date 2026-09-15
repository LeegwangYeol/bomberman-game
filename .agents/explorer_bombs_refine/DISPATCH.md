# Dispatch: explorer_bombs_refine

## Objective
Thoroughly inspect and analyze bomb creation, ticking timers, animations/tweens, explosion visual impacts, and existing test suites in the Bomberman prototype to make bombs pulse/scale dynamically and explode with punchy visual impact.

## Mandatory Reading
- Original Request: `/Users/user/src/bomberman/ORIGINAL_REQUEST.md`
- Collaboration Guide: `/Users/user/src/bomberman/COLLABORATION.md`
- Code files: `src/game/GameScene.ts`, `tests/`

## Specific Questions to Investigate
1. How are bombs currently created, tracked, and detonated in `GameScene.ts`?
2. What is the current bomb fuse duration and visual presentation? Is there any current tween or animation?
3. How can a pulsing/scaling "ticking" tween be implemented on the bomb sprite?
   - What easing, duration, and scale factors should be used (e.g., scale 1.0 -> 1.25 -> 1.0)?
   - Can the ticking frequency increase as the detonation time nears (e.g. accelerating pulse or tint shifting to red)?
4. How is the explosion currently visualized (fire tiles, sprites, particles)? How can the visual impact of the explosion be significantly upgraded (e.g., flash, camera shake, particle burst, expanding blast shockwave)?
5. What tests currently exist in `tests/`? How do they test bombs, player movement, and enemies?
6. What test tools (Jest, Vitest, etc.) and mocking strategies are used? How can we write comprehensive tests for bomb tweens and explosion events?

## Deliverables
Produce a comprehensive handoff report at `/Users/user/src/bomberman/.agents/explorer_bombs_refine/handoff.md` with:
- Observation: exact lines in `GameScene.ts` and `tests/`
- Logic Chain: bomb lifecycle, tween configuration, explosion enhancement design
- Caveats & Risks: tween cleanup when bomb is detonated early (e.g. chain reactions), camera shake intensity
- Recommendation: exact implementation plan for Workers and test plan for Challengers
- Verification Method: automated test verification commands and manual verification criteria

## 2026-09-15T01:23:25Z
You are explorer_bombs_refine. Your working directory is `/Users/user/src/bomberman/.agents/explorer_bombs_refine`.

MANDATORY FIRST STEP: Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`. Subagents MUST read it before starting work.
Also read `/Users/user/src/bomberman/.agents/explorer_bombs_refine/DISPATCH.md`.

Your task:
Analyze bomb creation, fuse timers, ticking animations/tweens, explosion visual effects, and test infrastructure in `src/game/GameScene.ts` and `tests/`.
Design dynamic pulsing/scaling ticking tweens for bombs and high-impact explosion visual effects, and document how existing test suites can be extended.
Write your findings and recommendation to `/Users/user/src/bomberman/.agents/explorer_bombs_refine/handoff.md`.
Remember to update `progress.md` with your status.
When finished, send a message to parent (ID: 5ba8d8e8-7e3d-47e7-b8f4-049c5ea9cdec).
