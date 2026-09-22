# Task Assignment: Explorer 3 (Juice & Animation Upgrade)

## Context
Read `/Users/user/src/bomberman/ORIGINAL_REQUEST.md` and `/Users/user/src/bomberman/COLLABORATION.md`.

## Mission
Investigate the game feel ("juice") and animation architecture:
1. Examine character/enemy movement and animation systems in `GameScene.ts` and `src/game/entities/`.
   - How can squash-and-stretch or bobbing tweens be smoothly layered onto player and enemy movement without desyncing physics bounding boxes or collision logic?
2. Examine bomb animations:
   - Current bomb ticking/pulsing tweens and how to make them feel impactful and punchy.
3. Examine explosion impact:
   - Camera screen shake (trauma/shake system) and hit-stop / frame freeze mechanisms during bomb explosions.
4. Examine particle effects:
   - Dust puffs when walking, sparks on bombs, debris fragments when soft blocks are destroyed.
5. Examine drop shadows:
   - Dynamic drop shadows under player, enemies, blocks, and items.
6. Provide concrete design, Phaser 3 APIs to use, and step-by-step implementation recommendations.
7. Write your complete analysis and recommendations to `.agents/explorer_juice_1/handoff.md`.

## 2026-09-22T07:57:11Z
You are Explorer 3. Your working directory is /Users/user/src/bomberman/.agents/explorer_juice_1.
Read /Users/user/src/bomberman/ORIGINAL_REQUEST.md, /Users/user/src/bomberman/COLLABORATION.md, and /Users/user/src/bomberman/.agents/explorer_juice_1/DISPATCH.md.
Investigate game feel ("juice") and animation architecture:
1. Squash-and-stretch / bobbing tweens for player and enemy movement.
2. Punchy bomb pulsing animations.
3. Screen shake (trauma system) and hit-stop (frame freeze) on bomb explosions.
4. Particle emitters (walking dust, bomb sparks, block destruction debris).
5. Dynamic drop shadows under entities, blocks, and items.
Write your findings and recommendations to /Users/user/src/bomberman/.agents/explorer_juice_1/handoff.md.
When finished, send a message to parent with a summary and the handoff path.
