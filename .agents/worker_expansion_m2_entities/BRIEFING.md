# BRIEFING — 2026-09-15T09:29:10Z

## Mission
Implement modular entity architecture in `src/game/entities/` (Enemies, Neutrals, Allies, 3-Tier Overhead UI) and integrate into `src/game/GameScene.ts` with clean lifecycle, friendly-fire immunity, and multi-hit i-frames.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: /Users/user/src/bomberman/.agents/worker_expansion_m2_entities
- Original parent: f6499d96-d3dc-44ee-b2ee-9207d8389e79
- Milestone: M2 (Diverse Entities, AI Variants & 3-Tier Overhead UI)

## 🔒 Key Constraints
- DO NOT CHEAT: Genuine implementation, no hardcoded tests/facades.
- Modular architecture under `src/game/entities/`: `OverheadUI.ts`, `types.ts`, `BaseEntity.ts`, `EnemyEntities.ts`, `NeutralEntities.ts`, `AllyEntities.ts`, `index.ts`.
- 3-Tier Overhead UI with exact offsets (Tier 1: HP bar at y - 14; Tier 2: Name tag at y - 22; Tier 3: Intent badge at y - 34).
- 5 Enemy archetypes: Chaser, Bomber, Tank, Ghost, Splitter.
- 2 Neutral archetypes: Merchant, Critter.
- 3 Ally archetypes: Mini-Bomber, Pet Drone, Shield Guard.
- Friendly-fire safety: Player/Ally bombs deal 0 damage to Player or Allies. Enemy bombs deal 0 damage to Enemies.
- Multi-hit entities respect i-frame timers (e.g. 800-1200ms) with visual sprite flashing.
- Clean garbage collection on entity death (`ui.destroy()`, physics body cleanup).
- All tests must pass: `node --test tests/entities_expansion.test.mjs` and `npm test` (all 241+ tests with 0 failures).
- Clean `npm run lint` and `npm run build`.

## Current Parent
- Conversation ID: f6499d96-d3dc-44ee-b2ee-9207d8389e79
- Updated: not yet

## Task Summary
- **What to build**: Modular entities system under `src/game/entities/`, OverheadUI component, Faction damage matrix, integrate into `GameScene.ts`.
- **Success criteria**: All entity archetypes functional with behaviors, 3-tier UI rendered, collision matrix working, all unit tests passing, clean lint and build.
- **Interface contracts**: `PROJECT.md`, `tests/entities_expansion.test.mjs`, `handoff.md`.
- **Code layout**: `src/game/entities/` and `src/game/GameScene.ts`.

## Key Decisions Made
- Follow exact constants in `tests/entities_expansion.test.mjs` (`ENEMY_ARCHETYPES`, `NEUTRAL_ARCHETYPES`, `ALLY_ARCHETYPES`, `FACTIONS`) in `types.ts`.
- Build `OverheadUI` compatible with Phaser GameObjects and standalone mockable/unit-testable where needed.

## Artifact Index
- `.agents/worker_expansion_m2_entities/DISPATCH.md` — Assignment instructions
- `.agents/worker_expansion_m2_entities/BRIEFING.md` — Agent memory
- `.agents/worker_expansion_m2_entities/progress.md` — Liveness & progress tracker
- `.agents/worker_expansion_m2_entities/handoff.md` — Final handoff report

## Change Tracker
- **Files modified**: [TBD]
- **Build status**: [TBD]
- **Pending issues**: [TBD]

## Quality Status
- **Build/test result**: Baseline passes (241/241)
- **Lint status**: Clean
- **Tests added/modified**: [TBD]
