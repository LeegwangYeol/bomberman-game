# BRIEFING — 2026-09-15T10:28:00Z

## Mission
Implement modular entity architecture in `src/game/entities/` and integrate into `src/game/GameScene.ts` (5 Enemy archetypes, 2 Neutral NPCs, 3 AI Allies, 3-tier Overhead UI, collision/damage matrix).

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/bomberman/.agents/worker_expansion_m2_entities_replace
- Original parent: f6499d96-d3dc-44ee-b2ee-9207d8389e79
- Milestone: M2 (Diverse Entities, AI Variants & 3-Tier Overhead UI)

## 🔒 Key Constraints
- Pure genuine logic, zero hardcoding or test circumventing.
- 5 Enemy archetypes: Chaser, Bomber, Tank, Ghost, Splitter.
- 2 Neutral NPCs: Merchant, Critter.
- 3 AI Allies: Mini-Bomber, Pet Drone, Shield Guard.
- 3-tier Overhead UI: HP Bar (y-14), Name Tag (y-22), Intent Badge (y-34).
- Friendly-fire immunity: Player/Ally explosions never harm Player/Ally. Enemy explosions never harm Enemies.
- Multi-hit entities respect i-frame timers (800-1200ms) with visual sprite flashing.
- Clean garbage collection on entity death (`ui.destroy()`).
- All existing tests (241+) and linting/building must pass with 0 errors.

## Current Parent
- Conversation ID: f6499d96-d3dc-44ee-b2ee-9207d8389e79
- Updated: 2026-09-15T10:28:00Z

## Task Summary
- **What to build**: Modular entities under `src/game/entities/` (`types.ts`, `OverheadUI.ts`, `BaseEntity.ts`, `EnemyEntities.ts`, `NeutralEntities.ts`, `AllyEntities.ts`, `index.ts`), and integrate into `src/game/GameScene.ts`.
- **Success criteria**: All tests pass, build passes, lint passes, 0 regressions.
- **Interface contracts**: PROJECT.md, tests/entities_expansion.test.mjs
- **Code layout**: src/game/entities/ and src/game/GameScene.ts

## Key Decisions Made
- Implemented clean modular entity hierarchy under `src/game/entities/` with full TypeScript typing.
- `OverheadUI` provides 3-tier graphics (Tier 1 segmented HP bar at y-14, Tier 2 name tag at y-22, Tier 3 intent badge at y-34) with leak-free `destroy()`.
- Implemented genuine behaviors: Chaser pounce & stun, Bomber escape BFS & enraged mode, Tank block pulverization & stomp slow, Ghost block phasing & ether dash, Splitter mini division, Merchant trade cart & protected loot spill, Critter waddle & score reward, Mini-Bomber friendly-fire safety leash, Pet Drone item vacuum & stun bolt, Shield Guard vanguard & dome absorption.
- Integrated groups (`this.enemies`, `this.neutrals`, `this.allies`) into `GameScene.ts` with complete friendly-fire immunity and multi-hit i-frame checks.
- Connected `tests/entities_expansion.test.mjs` directly to the actual implementation.

## Artifact Index
- `.agents/worker_expansion_m2_entities_replace/DISPATCH.md` — Assignment prompt
- `.agents/worker_expansion_m2_entities_replace/BRIEFING.md` — Agent briefing & memory
- `.agents/worker_expansion_m2_entities_replace/progress.md` — Progress tracker
- `.agents/worker_expansion_m2_entities_replace/handoff.md` — Detailed handoff report

## Change Tracker
- **Files modified**:
  - `src/game/entities/types.ts` (created): Factions and archetype constants
  - `src/game/entities/OverheadUI.ts` (created): 3-tier overhead UI component
  - `src/game/entities/BaseEntity.ts` (created): Entity foundation with HP, i-frames, faction
  - `src/game/entities/EnemyEntities.ts` (created): Chaser, Bomber, Tank, Ghost, Splitter
  - `src/game/entities/NeutralEntities.ts` (created): Merchant, Critter
  - `src/game/entities/AllyEntities.ts` (created): Mini-Bomber, Pet Drone, Shield Guard
  - `src/game/entities/index.ts` (created): Exports and factory helpers
  - `src/game/GameScene.ts` (modified): Groups, collisions, spawning, updateAI, friendly fire immunity
  - `tests/entities_expansion.test.mjs` (modified): Wired directly to entity implementation
- **Build status**: PASS (Next.js Turbopack, exit 0)
- **Pending issues**: None

## Quality Status
- **Build/test result**: 241 passed / 0 failed
- **Lint status**: 0 errors
- **Tests added/modified**: `tests/entities_expansion.test.mjs` (19/19 passing)

## Loaded Skills
None
