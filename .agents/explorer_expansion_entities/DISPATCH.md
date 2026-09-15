# Dispatch: Explorer Expansion Entities & AI

## Objective
Survey and design the diverse entity ecosystem: multiple enemy types with distinct AI and health bars, wandering neutral NPCs, and AI-controlled allies with health bars and assist behaviors.

## 2026-09-15T07:11:47Z
You are an Explorer specializing in Game Entities, Enemy AI variants, Neutral NPCs, and Ally AI Architecture for Bomberman.
Working directory: /Users/user/src/bomberman/.agents/explorer_expansion_entities/
Authoritative request path: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md (specifically '## Follow-up — 2026-09-15T07:08:09Z'). Read it before doing anything!
Also read /Users/user/src/bomberman/COLLABORATION.md and /Users/user/src/bomberman/PROJECT.md.
Read existing codebase files: `src/game/pathfinding.ts`, `src/game/GameScene.ts`.

Your Mission:
1. Brainstorm and specify multiple distinct Enemy Types:
   - Chaser (fast, aggressive BFS tracking)
   - Bomber (strategic bomb placer with suicide prevention escape BFS)
   - Tank (high HP, slower, destroys obstacles or resists blast)
   - Ghost / Dasher (can phase through soft blocks or burst dash)
   - Splitter (divides into smaller mini-slimes upon defeat)
   - Specify for each: Max HP, Speed, FSM States, Attack behaviors, visual tint / sprite features, overhead UI (HP bar + name tag + intent icon)
2. Brainstorm and specify Neutral NPCs:
   - Wandering Merchant / Vendor (trades items or drops goods if protected)
   - Wandering Critters / Slimes (peaceful, wander randomly, don't harm player unless provoked, add lively ambiance)
   - Specify their movement rules, interaction models, and overhead indicators
3. Brainstorm and specify AI-Controlled Allies:
   - Mini-Bomber Buddy (follows player, targets enemies with bombs safely, avoids friendly fire)
   - Pet Drone (shoots mini-projectiles or collects items for player)
   - Shield Guard (draws enemy aggro or projects protective aura)
   - Specify AI logic, health pools, respawn/duration, UI indicators/health bars (colored differently, e.g., green/cyan for allies vs red for enemies)
4. Design clean architectural separation in `src/game/`:
   - Entity class hierarchy or entity manager
   - Health bar rendering component (overhead 3-tier: HP Bar, Name Tag, Intent Badge)
   - Safe collision handling (player vs enemy, player vs ally, ally vs enemy, bomb vs all)
5. Write a comprehensive report to `/Users/user/src/bomberman/.agents/explorer_expansion_entities/handoff.md`.
Communicate your completion back via send_message.
