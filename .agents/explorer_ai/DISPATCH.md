# Dispatch: Enemy AI & GameScene Architecture Explorer

## Mission
Survey the enemy logic in `src/game/GameScene.ts` and design the advanced tracking and attack AI architecture.

## Authoritative Inputs
- ORIGINAL_REQUEST: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- Collaboration Guide: /Users/user/src/bomberman/COLLABORATION.md

## Scope & Instructions
1. Inspect `src/game/GameScene.ts` to examine current enemy spawning, update loops, movement, collision detection, and player interactions.
2. Design the tracking AI algorithm:
   - Grid-based pathfinding (e.g. BFS / Dijkstra or line-of-sight tracking on tile grid) navigating around unbreakable walls and destructible blocks.
   - Attack state machine: Tracking state (moving towards player), Attack state (executing an attack when within range or line of sight, such as dash/charge or placing a hazard/contact strike), and Recovery/Cooldown state.
3. Check how this integrates cleanly with Phaser physics, delta time in `update(time, delta)`, and player death/respawn.
4. Write your comprehensive exploration report to `/Users/user/src/bomberman/.agents/explorer_ai/report.md` and handoff to `/Users/user/src/bomberman/.agents/explorer_ai/handoff.md`.

## 2026-09-14T10:29:51Z
You are the Enemy AI & GameScene Architecture Explorer for the Bomberman prototype implementation.
Working directory: /Users/user/src/bomberman/.agents/explorer_ai
Identity & Dispatch instructions: /Users/user/src/bomberman/.agents/explorer_ai/DISPATCH.md
Authoritative request: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
Collaboration guide: /Users/user/src/bomberman/COLLABORATION.md

Investigate:
1. Inspect `src/game/GameScene.ts` to examine current enemy movement and player collision logic.
2. Design the tracking pathfinding algorithm (e.g., BFS or grid-based tracking avoiding walls/blocks) and attack state machine (tracking, charging/attacking, cooldown).
3. Ensure the design satisfies: "Enemy update logic must include tracking the player's position and executing an attack."
4. Write your detailed exploration report to `/Users/user/src/bomberman/.agents/explorer_ai/report.md` and your handoff to `/Users/user/src/bomberman/.agents/explorer_ai/handoff.md`.
Communicate your completion back to the orchestrator via send_message.

