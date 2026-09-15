# Project: Bomberman Massive Scale Expansion (Items, Entities & Ultimate Skills)

## Architecture
- **Engine**: Phaser 3 (Arcade Physics) + Next.js (React 19 + TypeScript).
- **Scene**: `src/game/GameScene.ts` managing entities, animations, tilemaps, physics, and event dispatch.
- **AI & Pathfinding**: `src/game/pathfinding.ts` discrete BFS grid navigation, blast raycasting, entity targeting, and escape route calculation.
- **Dynamic Gameplay & Items**: `src/game/gameplay_mechanics.ts` 24 distinct items, drop tables, stat mutators, grace window, slide physics.
- **Entity Ecosystem**: `src/game/GameScene.ts` & entity managers: 5 Enemy archetypes (Chaser, Bomber, Tank, Ghost, Splitter), Neutral NPCs (Merchant, Critters), AI Allies (Mini-Bomber, Drone, Shield Guard) with 3-tier overhead UI (HP Bar, Name Tag, Intent Badge).
- **Ultimate Skills (필살기)**: `src/game/gameplay_mechanics.ts` & `GameScene.ts`: 100-pt energy gauge, 5 skills (Meteor Strike, Super Nova, Chrono Freeze, Nuclear Barrage, Aegis Overdrive), screen trauma VFX, Web Audio synthesis.
- **UI & HUD**: `src/components/BombermanGame.tsx` retro arcade cabinet layout, responsive virtual controls (`[BOMB]`, `[DASH]`, `[ULT]`), real-time inventory drawer/tooltips, and decoupled event bridge.
- **Assets**: `public/assets/` SVG-to-PNG procedural generation pipeline in `scripts/generate-assets.sh` + runtime 32x32 HTML5 Canvas procedural item textures.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 24 Distinct Items & Taxonomy | 6 Bomb variants, 6 Stat boosts, 6 Utilities, 6 Tactical buffs | M1 | Survey |
| 2 | Tiered Drop System & Gilded Chests | 60% Common, 22% Uncomm, 13% Rare, 5% Epic + Gilded Chests (100% Rare+) | M1 | Survey |
| 3 | Anti-Snowball & Cap Redirection | Prevents dead drops when player hits speed/bomb/fire caps | M1 | Survey |
| 4 | Procedural Item Textures & Icons | 32x32 HTML5 Canvas procedural generation for all 24 items | M1 | Survey |
| 5 | Cross-Platform Inventory HUD | Desktop hover tooltip cards & Mobile expandable drawer (`🎒 INVENTORY`) | M1 | Survey |
| 6 | 5 Enemy Archetypes | Chaser, Bomber, Tank, Ghost, Splitter with unique AI & attack behaviors | M2 | Survey |
| 7 | Neutral NPCs | Wandering Merchant (`[E] Trade`), Wandering Critters (ambient life) | M2 | Survey |
| 8 | AI-Controlled Allies | Mini-Bomber Buddy (safe demolition), Pet Drone, Shield Guard | M2 | Survey |
| 9 | 3-Tier Overhead UI Component | Segmented HP Bar (Tier 1), Faction Name Tag (Tier 2), Intent Badge (Tier 3) | M2 | Survey |
| 10 | 5 Ultimate Skills (필살기) | Meteor Strike, Super Nova, Chrono Freeze, Nuclear Barrage, Aegis Overdrive | M3 | Survey |
| 11 | 100-Point Resource Gauge & Lockout | Charging via blocks (+2), enemies (+15/+25), energy sparks (+10) + 6s cooldown | M3 | Survey |
| 12 | Screen Trauma & High-Impact VFX | Square-law camera shake, shockwave rings, hit-stop, canvas color matrix stasis | M3 | Survey |
| 13 | Procedural Web Audio FX | Zero-dependency synth for meteors, shockwaves, time stasis, chimes | M3 | Survey |
| 14 | Responsive Controls Bridge | Keyboard hotkeys ('R'/'Q') + 64px crown mobile `[ULT]` touch button | M3 | Survey |
| 15 | Comprehensive Unit & Integration Tests | Tests covering items, drop weights, AI FSMs, skills, HUD bridge | M4 | Survey |
| 16 | Adversarial Stress Testing & Audit | Reviewers, Challengers, Forensic Integrity Audit (CLEAN) | M5 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 24 Items, Drop Tables & Inventory HUD | `gameplay_mechanics.ts`, `GameScene.ts` item generation/drops, `BombermanGame.tsx` inventory UI | Survey done | DONE |
| M2 | Diverse Entities (Enemies, Neutrals, Allies) | `GameScene.ts`, `pathfinding.ts`, 3-tier overhead UI, collision/damage matrix | M1 interface | IN_PROGRESS |
| M3 | Ultimate Skills (필살기) & High-Impact VFX | `gameplay_mechanics.ts`, `GameScene.ts` ultimate skills, VFX, `BombermanGame.tsx` HUD [ULT] | M1, M2 | PLANNED |
| M4 | Comprehensive Automated E2E Test Suite | `tests/*.test.mjs` unit/integration suites (Tiers 1-4) | M1, M2, M3 | DONE |
| M5 | Adversarial Coverage Hardening & Forensic Audit | Reviewers (APPROVE), Challengers (APPROVE), Forensic Auditor (CLEAN) | M4 | PLANNED |

## Interface Contracts
### `GameScene.ts` ↔ `gameplay_mechanics.ts`
- Item definitions: `ItemType`, `ITEM_DEFINITIONS`, `rollItemDrop(rng, playerStats, blockType)`
- Item effects: `applyItemEffect(type: ItemType, stats: PlayerStats, scene: GameScene)`
- Grace protection: `isItemProtectedFromExplosion(spawnTime: number, explosionTime: number): boolean`
- Ultimate Skills: `UltimateSkillType`, `PlayerStats.ultimateGauge`, `PlayerStats.isUltimateReady`, `triggerUltimateSkill(skill: UltimateSkillType, scene: GameScene)`

### `GameScene.ts` ↔ `BombermanGame.tsx`
- Event: `'stats-update'`
- Payload: `PlayerStats` (including `inventory: Record<ItemType, number>`, `ultimateGauge`, `ultimateMax`, `isUltimateReady`, `activeUltimate`, etc.)
- Event: `'item-collected'`
- Payload: `{ item: ItemDefinition, x: number, y: number }` (for toast/notification)
- Mobile Input state: `window.mobileInput` (`up, down, left, right, bomb, dash, ultimate, interact`)

