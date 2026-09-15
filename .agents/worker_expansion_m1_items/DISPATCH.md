# Dispatch: Worker M1 (24 Items, Drop System & Inventory HUD)

## Objective
Implement all 24 items in `src/game/gameplay_mechanics.ts`, procedural canvas textures and drop/collection logic in `src/game/GameScene.ts`, and the desktop hover tooltips + mobile expandable drawer in `src/components/BombermanGame.tsx`.

## 2026-09-15T07:49:28Z
You are a Worker implementing Milestone 1: 24 Items, Drop Balance & In-Game Inventory HUD for Bomberman.
Working directory: /Users/user/src/bomberman/.agents/worker_expansion_m1_items/
Authoritative request path: /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md (specifically '## Follow-up — 2026-09-15T07:08:09Z'). Read it before doing anything!
Also read /Users/user/src/bomberman/COLLABORATION.md and /Users/user/src/bomberman/PROJECT.md.
Crucial Design Source: Read /Users/user/src/bomberman/.agents/explorer_expansion_items/handoff.md thoroughly for all 24 item definitions, drop tables, procedural Canvas texture generation code, stat mutator functions, and React HUD component design!

Exclusive Write Ownership:
- `src/game/gameplay_mechanics.ts`
- `src/components/BombermanGame.tsx`
- Relevant item drop/collection & texture functions in `src/game/GameScene.ts`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. In `src/game/gameplay_mechanics.ts`:
   - Expand `ItemType` union to all 24 items (`PIERCING_BOMB`, `REMOTE_BOMB`, `CLUSTER_BOMB`, `LANDMINE`, `ICE_BOMB`, `RICOCHET_BOMB`, `SPEED_UP`, `BOMB_UP`, `FIRE_UP`, `MEGA_FIRE`, `ARMOR_UP`, `BLAST_RESIST`, `KICK`, `WALL_PASS`, `BOMB_PASS`, `TIME_FREEZE`, `MAGNET`, `EXTRA_LIFE`, `SHIELD`, `CLOAK`, `DEFLECTOR`, `SPEED_SURGE`, `VAMPIRIC`, `POISON_MIST`).
   - Define `ITEM_DEFINITIONS` containing id, name, category, rarity, iconKey, description, and stat/buff effect parameters.
   - Update `PlayerStats` to include inventory tracking `inventory: Record<ItemType, number>`, active buffs, and ultimate gauge fields.
   - Implement `rollItemDrop(rng, playerStats, blockType)` with tiered weights (Common 60%, Uncommon 22%, Rare 13%, Epic 5%), golden chest guaranteed rare drops, and dynamic cap redirection when stats reach max caps (Speed 250, Bombs 8, Fire 8).
   - Implement `applyItemEffect(itemType, stats, scene)` with genuine logic for every item.
   - Retain 600ms grace period protection (`isItemProtectedFromExplosion`).
2. In `src/game/GameScene.ts`:
   - Expand `generateItemTextures()` to procedurally generate 32x32 HTML5 Canvas textures for all 24 items with distinctive color palettes, badges, and glyphs (0 missing asset errors).
   - Integrate item spawning from destroyed blocks/chests with the 600ms blast protection and pulsing golden glow.
   - Connect item pickup overlap to `applyItemEffect`, score increments, and emit updated stats to `stats-update`.
3. In `src/components/BombermanGame.tsx`:
   - Build a stylish, retro arcade inventory UI:
     - Desktop: Glassmorphic inventory shelf with hover tooltips displaying item name, rarity badge, stat deltas, and description.
     - Mobile: Responsive collapsible bottom drawer (`🎒 INVENTORY`) with 48px touch targets and tap-to-inspect detail sheet.
     - Emit and receive real-time stats updates via the Phaser bridge.
4. Run builds and tests (`npm test`, `npm run build`) and fix any compiler or lint issues until clean.
5. Author a detailed report at `/Users/user/src/bomberman/.agents/worker_expansion_m1_items/handoff.md` and communicate your completion back via send_message.

## 2026-09-15T08:42:33Z
**Context**: Milestone 1 Implementation (24 Items, Drop Balance & Inventory HUD).
**Content**: Checking in on status. `gameplay_mechanics.ts` and `GameScene.ts` updates are visible. How is progress on `BombermanGame.tsx` and final verification?
**Action**: Please report current status and ETA for completion.

