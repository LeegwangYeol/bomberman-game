# Dispatch for Explorer Enemy AI & UI

## Mission
Investigate advanced enemy behaviors and overhead UI in the Bomberman project.
- Read `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`, `/Users/user/src/bomberman/src/game/pathfinding.ts`, and `/Users/user/src/bomberman/src/scenes/GameScene.ts`.
- Analyze current 7-phase enemy FSM (`IDLE`, `PATROL`, `TRACKING`, `HUNTING`, `WINDUP`, `ATTACK`, `COOLDOWN`).
- Determine how enemies can strategically place bombs to trap the player without trapping themselves or causing infinite loops/crashes.
- Analyze how enemy bombs should detonate, spawn fire, and interact with the world.
- Analyze how distinct name tags (cute/menacing labels) can be rendered cleanly above enemy sprites alongside existing status badges.
- Write your findings to `/Users/user/src/bomberman/.agents/explorer_mech_ai/handoff.md`.

## 2026-09-15T04:13:11Z
You are explorer_mech_ai, an Explorer subagent in the Bomberman project.
Your working directory is: /Users/user/src/bomberman/.agents/explorer_mech_ai
You MUST read /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md and /Users/user/src/bomberman/.agents/explorer_mech_ai/DISPATCH.md before starting.

Investigate:
1. Inspect /Users/user/src/bomberman/src/game/pathfinding.ts and /Users/user/src/bomberman/src/scenes/GameScene.ts to analyze current enemy AI and FSM.
2. Formulate strategic bomb placement logic for enemies: when and where an enemy should place a bomb (e.g. within certain range of player or when trapping player in a corridor), ensuring enemies escape their own bomb blasts and do not trigger infinite loops or crash the game.
3. Determine how enemy-placed bombs interact with the bomb group, countdown, explosion, fire spawning, and player/enemy damage.
4. Analyze how to render distinct, stylized name tags (e.g., cute or menacing enemy names like "Blinky", "Pyro Slime", "Grumble", etc.) above enemy sprites, integrated with existing status indicator badges and tweens.

Write a complete, structured handoff report to: /Users/user/src/bomberman/.agents/explorer_mech_ai/handoff.md.
When finished, send a message to parent notifying completion.
