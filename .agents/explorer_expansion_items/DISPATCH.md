# Dispatch: Explorer Expansion Items & UI

## Objective
Survey and design the massive 20+ unique items and power-ups system, balanced drop tables, and in-game inventory/item description UI.

## 2026-09-15T07:11:47Z
You are an Explorer specializing in Items, Power-Ups, Drop Systems, and In-Game UI Architecture for Bomberman.
Working directory: /Users/user/src/bomberman/.agents/explorer_expansion_items/
Authoritative request path: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md (specifically '## Follow-up — 2026-09-15T07:08:09Z'). Read it before doing anything!
Also read /Users/user/src/bomberman/COLLABORATION.md and /Users/user/src/bomberman/PROJECT.md.
Read existing codebase files: `src/game/gameplay_mechanics.ts`, `src/game/GameScene.ts`, `src/components/BombermanGame.tsx`.

Your Mission:
1. Brainstorm and specify at least 20 distinct, creative, and balanced items/power-ups across categories:
   - Bomb variants (e.g., Piercing Bomb, Remote Control Bomb, Cluster Bomb, Landmine, Ice Bomb, Poison/Toxic Bomb, Bouncing Bomb)
   - Stat boosts (e.g., Speed Up, Mega Fire, Multi-Bomb, Armor Up, Blast Resistance)
   - Utilities & active gear (e.g., Invisibility Cloak, Clock / Time Freeze, Item Magnet, Treasure Compass, Heart / Extra Life, Spring Shoes / Wall Pass)
   - Tactical buffs (e.g., Shield Barrier, Blast Deflector, Vampiric Heal, Speed Surge)
2. For EACH of the 20+ items, define:
   - Item ID, Display Name, Category, Rarity / Drop Weight
   - Exact gameplay mechanic and stat/behavior modification logic
   - Visual icon representation (procedural canvas/SVG/Phaser graphics description)
   - Inventory description text (flavor + mechanics)
3. Design the Drop System & Balance:
   - Drop rates from destructible blocks, special chests/crates
   - Prevention of item duplication or runaway power creep
   - Retention of 600ms grace period protection from explosions
4. Design the In-Game UI / Inventory HUD:
   - How active items and collected inventory are rendered in the React HUD (`BombermanGame.tsx`) and/or canvas overlay
   - Item tooltips or description panel on hover/tap (crucial for mobile & PC)
   - Real-time stats synchronization via Phaser-React bridge
5. Write a comprehensive report to `/Users/user/src/bomberman/.agents/explorer_expansion_items/handoff.md`.
Communicate your completion back via send_message.
