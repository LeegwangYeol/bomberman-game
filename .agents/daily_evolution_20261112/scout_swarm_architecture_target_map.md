# Scout & Context Division: Architecture & Target Map
**Date:** 2026-11-12  
**Division:** Scout & Context Division (5 Subagents: Scout 1 to Scout 5)

## 1. Codebase Architecture Overview
- **Progression Subsystem (`src/game/progression/`)**:
  - `RelicSystem.ts` & `ProgressionTypes.ts`: 12 relics, 8 active synergies out of 66 possible pairs.
  - Tactical opportunity identified: Addition of the 13th Epic Relic `TESLA_OVERCHARGE_COIL` and 9th Synergy `Electro-Cryo Superconductor` ($13 \times 12 / 2 = 78$ pairs).
- **Entities Subsystem (`src/game/entities/`)**:
  - `NeutralEntities.ts`: In `MerchantNPC.updateAI()`, iterating over `bombTiles instanceof Set<string>` performed `bKey.slice(...)` and `Number(...)`, creating transient substring allocations per frame.
  - `BaseEntity.ts`: In `updateEntity()`, `isMoving` evaluated purely based on `> 1 px/s` without velocity hysteresis, risking single-frame animation fluttering when decelerating.
- **Physics & Snapping (`src/game/GameScene.ts`)**:
  - `tryKickBomb()`: Exact 45° diagonal collision angle previously defaulted to vertical priority without checking player facing intent.
- **Input & Touch Resilience (`src/game/input_state.ts`)**:
  - Found missing unit test coverage for `actionEpochs` token mismatch, stale double-RAF closure aborts, and rapid pointer ID target migration.
