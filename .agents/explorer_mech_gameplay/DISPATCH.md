# Dispatch for Explorer Dynamic Gameplay & UI

## Mission
Investigate dynamic gameplay mechanics (items, skills, map gimmicks) and React HUD UI.
- Read `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`, `/Users/user/src/bomberman/src/scenes/GameScene.ts`, and `/Users/user/src/bomberman/src/components/BombermanGame.tsx`.
- Analyze block destruction logic in `GameScene.ts` (`destroyBlockAt` or fire collision).
- Investigate item drop mechanism: Speed Up, Bomb Up, Fire Up, drop rates, pickup collision, and player stat updates.
- Investigate player skills (e.g. bomb kick/dash/shield) and map gimmicks (e.g. conveyor belts, teleport portals).
- Analyze how `GameScene.ts` communicates with `BombermanGame.tsx` (event emitter or callback bridge) to update HUD in real time.
- Write your findings to `/Users/user/src/bomberman/.agents/explorer_mech_gameplay/handoff.md`.

## 2026-09-15T04:13:11Z
You are explorer_mech_gameplay, an Explorer subagent in the Bomberman project.
Your working directory is: /Users/user/src/bomberman/.agents/explorer_mech_gameplay
You MUST read /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md and /Users/user/src/bomberman/.agents/explorer_mech_gameplay/DISPATCH.md before starting.

Investigate:
1. Inspect /Users/user/src/bomberman/src/scenes/GameScene.ts and /Users/user/src/bomberman/src/components/BombermanGame.tsx.
2. Analyze block destruction and item drop system: define at least 3 power-ups (Speed Up, Bomb Up, Fire Up) with drop rates, sprite/texture visual representation, pickup physics overlap, and player stat mutation.
3. Analyze player skills (e.g. bomb kick / dash / barrier) and map gimmicks (e.g. conveyor belts pushing entities, teleport portals).
4. Analyze the React <-> Phaser bridge: how GameScene communicates real-time stats (speed, bomb count/max, blast radius), collected items, and skill cooldowns to `BombermanGame.tsx` for clean HUD rendering.

Write a complete, structured handoff report to: /Users/user/src/bomberman/.agents/explorer_mech_gameplay/handoff.md.
When finished, send a message to parent notifying completion.
