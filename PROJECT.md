# Project: Bomberman Infinite Evolution & Massive Expansion

## Architecture
- **Engine Core**: Phaser 3 (HTML5 Canvas 2D procedural rendering) decoupled from pure simulation models in TypeScript (`src/game/`).
- **Zero-GC Subsystem** (COMPLETED):
  - `ZeroGCPathfinder`: 1D typed arrays (`Uint16Array`, `Int16Array`, `Uint8Array`, 195 cells) with generational counter, eliminating BFS heap allocations.
  - `ObjectPool<T>`: Contiguous pre-allocated pools for Bombs (32), Explosions (128), Particles (256), Item Drops (48), Floating Text (32) with $O(1)$ swap-and-pop release and dense active traversal.
  - `AudioVoicePool`: Recycled native Web Audio nodes with ADSR envelopes and click-free voice stealing.
  - `FlatHazardMask`: 195-byte duck-typed bitmask eliminating per-frame Set allocations in 60 FPS update loop.
  - Single persistent graphics batching for floor telegraphs, shockwaves, and crisis hazards.
- **Boss Subsystem** (COMPLETED):
  - `BaseBoss`: 7-state finite state machine (`INTRO`, `PHASE_1`, `INTERMISSION`, `PHASE_2`, `ENRAGED`, `STUNNED`, `DEFEATED`), 150ms combo hit buffer window, 3-tier floor tile telegraphing.
  - Boss entities: King Gummy Bear, Mecha Hamster Captain Nibbles, Queen Bee Cupcake.
  - `TelegraphEngine`: 3-tier floor danger warning with >=40% safe area invariant.
  - `BossHUD`: Segmented HP bars, enrage gauge, and React bridge.
- **Crises Subsystem** (COMPLETED):
  - `CrisisManager`: 3-stage escalation (`WHISPERS`, `OUTBREAK`, `CLIMAX`), threat meters, 6 distinct crisis types (Pastel Void, Clockwork Rebellion, Orbital Bombardment, Solar Flares, Creeping Lava, Dimensional Rifts).
  - `SituationLog`: Situation Log HUD state controller and React HUD overlay.
- **Game Modes & Scaling Subsystem** (COMPLETED):
  - `ScalingEngine`: Continuous deterministic math formulas for speed (2.2x soft cap), density (max 14), HP, and fuses.
  - Game Modes: Standard, Crisis Survival (60s waves, drop pods), Boss Rush (5-boss gauntlet, medals), Endless Gauntlet (procedural chambers, 3-card boon drafting).
  - `PerkTree`: 16-node Confectionery Perk Tree (Baking, Sugar Rush, Resilience, Alchemy) with dual currencies (Star Candies 🍬, Cosmic Sugar Essence ✨) and Second Wind lethal damage immunity.
  - `RelicSystem`: 8 equippable relics, 4 synergies, 500ms ICD proc loops protection.
- **State Persistence & 429 Recovery** (COMPLETED):
  - `GameStatePersistence`: SessionStorage active run snapshots + LocalStorage meta-progression, RLE compression, 24-hex canonical checksums, export/import JSON packages.
  - `CircuitBreaker`: API 429 exponential backoff with jitter, offline queueing, emergency state save callback.
  - Chaos Bots testing harness (50,000 adversarial inputs passing with zero crashes or invariant breaches).
- **Final Integration & Hardening** (IN PROGRESS):
  - Milestone 6: Full verification of all 422 tests, 10,000-frame soak test under explicit V8 GC, 50,000-action chaos bots, 0 lint errors, and Turbopack production build.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 1D Typed Array ZeroGCPathfinder | Flat Uint8Array/Int16Array 195-tile BFS pathfinder eliminating all runtime Map/Array allocations | M1 | survey |
| 2 | Contiguous ObjectPool Engine | Generic object pool for Bombs, Explosions, Particles, Item Drops, and Floating Text | M1 | survey |
| 3 | Camera Shake Scratch Vectors | Mutable scratch vector pool in CameraTraumaSimulator eliminating per-frame getOffsets() objects | M1 | survey |
| 4 | Flat Hazard Tile Bitmask | Elimination of per-frame `new Set<string>()` in 60 FPS update loop | M1 | survey |
| 5 | Web Audio AudioVoicePool | Reusable oscillator and gain node pool for zero-allocation audio synthesis | M1 | survey |
| 6 | 10k-Frame Soak Test Harness | Headless 10,000-frame continuous game loop test tracking V8 heap drift (delta <= 0.25 MB) | M1 | survey |
| 7 | BaseBoss State Machine | 7-state FSM with intro, phases, intermission, enrage, stun, and 150ms combo damage buffer | M2 | survey |
| 8 | 3-Tier Tile Telegraph Engine | Yellow (2.0s) -> Amber (1.0s) -> Flashing Red (0.5s) attack corridor floor telegraphing | M2 | survey |
| 9 | King Gummy Bear Boss | Royal Jelly Bounce, Sugar Crush, Gummy Minion Spawns, and landing stun windows | M2 | survey |
| 10 | Mecha Hamster Captain Nibbles | Sunflower Gatling, Wheel Charge, EMP Minefield, and collision stun mechanics | M2 | survey |
| 11 | Queen Bee Cupcake Boss | Pollen Storm, Royal Guard Swarm, Honey Trap Barrage, and enrage phase | M2 | survey |
| 12 | Boss HUD & Health Bar | Boss nameplate, multi-phase segment bars, enrage gauge, and telegraph indicators | M2 | survey |
| 13 | Crisis Manager FSM | 3-stage crisis escalation (Whispers, Outbreak, Climax) with threat meters | M3 | survey |
| 14 | Pastel Void Incursion | Creeping void tiles, Purification Prisms with safe auras, and void destabilization | M3 | survey |
| 15 | Clockwork Toy Rebellion | Iron cog obstacles, conveyor belt floor tiles, EMP pulse chimes, Dynamo Overload | M3 | survey |
| 16 | Orbital Bombardment Crisis | Targeted kinetic slug salvos, laser crosshair telegraphs, planetary uplink override | M3 | survey |
| 17 | Solar Flare Crisis | Coronal mass ejection sweeping corridors, instant bomb flash-ignition, pillar shadows | M3 | survey |
| 18 | Creeping Lava Crisis | Mantle rupture, advancing magma fissures, ice cooling mechanics | M3 | survey |
| 19 | Dimensional Rift Crisis | Subspace tears, toroidal wrap-around corridors, quantum synchronization | M3 | survey |
| 20 | Situation Log HUD | Active crisis alerts, threat progress bar, stabilization objectives, and timer display | M3 | survey |
| 21 | Infinite Scaling Difficulty Engine | Continuous deterministic formulas for speed, density, HP, and fuses with mobile soft caps | M4 | survey |
| 22 | Crisis Survival Game Mode | Count-up survival timer with periodic escalating crises every 60 seconds | M4 | survey |
| 23 | Boss Rush Game Mode | Consecutive boss gauntlet with persistent health, rest stops, and time attack | M4 | survey |
| 24 | Endless Gauntlet Game Mode | Procedural chambers with roguelite draft boons and escalating modifiers | M4 | survey |
| 25 | Dual-Currency Economy | Star Candies (in-run drops) and Cosmic Sugar Essence (permanent meta-currency) | M4 | survey |
| 26 | Confectionery Perk Tree | 16-node perk tree across Baking, Sugar Rush, Resilience, and Alchemy | M4 | survey |
| 27 | Relics & Artifacts System | Passive run-altering relics discovered in boss chambers and crisis events | M4 | survey |
| 28 | Persistent Score & Trophy Unlocks | High scores, achievements, and persistent trophy shelf stored in meta-profile | M4 | survey |
| 29 | Match Session Persistence | SessionStorage serialization allowing seamless resume on reload or tab switch | M5 | survey |
| 30 | Meta-Profile LocalStorage Persistence | LocalStorage profile with checksum validation for perks, relics, and unlocks | M5 | survey |
| 31 | Export / Import Save State | JSON state export and import functionality for backup and cross-device transfer | M5 | survey |
| 32 | API 429 Quota Recovery Circuit Breaker | Exponential backoff circuit breaker with graceful offline queuing for API calls | M5 | survey |
| 33 | Chaos Bot Multi-Touch Spam Test | Adversarial simulation of rapid multi-touch and simultaneous directional inputs | M5 | survey |
| 34 | Chaos Bot Boundary & Gauge Attack | Stress testing physical boundary clipping, tile penetration, and gauge overflows | M5 | survey |
| 35 | Chaos Bot Fast Pause/Resume Stress | Rapid state toggle attack testing event listeners and audio context resilience | M5 | survey |
| 36 | 100% E2E Test Suite Pass | Complete verification of Tiers 1-4 comprehensive opaque-box test suite | M6 | survey |
| 37 | Tier 5 Adversarial Coverage Hardening | White-box stress testing and test-coverage-audit validation | M6 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Zero-GC Pooling & 10k Soak Test Infra | Features 1-6 (ZeroGCPathfinder, ObjectPool, scratch vectors, AudioVoicePool, 10k soak test) | none | DONE |
| M2 | Multi-Phase Epic Bosses & Telegraphs | Features 7-12 (BaseBoss, 3 Bosses, 3-tier floor telegraphs, Boss HUD) | M1 | DONE |
| M3 | Dynamic Stellaris-Style Map Crises | Features 13-20 (CrisisManager, 6 Crises, Situation Log HUD) | M1 | DONE |
| M4 | Infinite Scaling, Modes & Meta-Progression | Features 21-28 (ScalingEngine, 3 New Modes, Perk Tree, Relics) | M2, M3 | DONE |
| M5 | State-Saving, 429 Recovery & Chaos Bots | Features 29-35 (GameStatePersistence, 429 Circuit Breaker, Chaos Bots, Invariant Tests) | M1, M4 | DONE |
| M6 | Final 100% E2E Pass, 10k Soak & Build | Features 36-37 (Full test suite pass, 10k soak verification, lint, clean build) | M1-M5 | IN_PROGRESS |

## Interface Contracts
### ZeroGCPathfinder ↔ GameScene / Entities
- `init(cols: number, rows: number): void`
- `setObstacles(walkableBitmask: Uint8Array): void`
- `findPath(startIdx: number, targetIdx: number, outPath: Int16Array): number` (returns pathLength, zero heap allocations)

### ObjectPool<T> ↔ Entities / VFX
- `acquire(): T | null`
- `release(item: T): void`
- `forEachActive(callback: (item: T) => void): void`
- `reset(): void`

### BaseBoss ↔ GameScene / HUD
- `update(time: number, delta: number, playerPos: { x: number; y: number }): void`
- `takeDamage(amount: number, source: 'bomb' | 'skill'): boolean` (respects 150ms buffer window)
- `getState(): BossState`
- `getActiveTelegraphs(): TelegraphTile[]`

### CrisisManager ↔ GameScene / HUD
- `triggerCrisis(type: CrisisType): void`
- `update(delta: number): CrisisStatus`
- `resolveObjective(objectiveId: string): void`
- `getActiveHazardTiles(): HazardTile[]`

### GameStatePersistence ↔ React / Engine
- `saveRunState(state: SerializedRunState): void`
- `loadRunState(): SerializedRunState | null`
- `saveMetaProfile(profile: MetaProfile): void`
- `loadMetaProfile(): MetaProfile`
- `handleApiError(error: { status: number }): Promise<void>` (implements 429 backoff)

## Code Layout
- `src/game/pooling/`: Zero-GC generic pools, typed-array buffers, audio voice pools.
- `src/game/bosses/`: `BaseBoss.ts`, `GummyBearBoss.ts`, `HamsterBoss.ts`, `QueenBeeBoss.ts`, `TelegraphEngine.ts`, `BossHUD.ts`.
- `src/game/crises/`: `CrisisManager.ts`, `BaseCrisis.ts`, `VoidCrisis.ts`, `ClockworkCrisis.ts`, `OrbitalCrisis.ts`, `SolarFlareCrisis.ts`, `LavaCrisis.ts`, `RiftCrisis.ts`, `SituationLog.ts`.
- `src/game/progression/`: `ScalingEngine.ts`, `PerkTree.ts`, `RelicSystem.ts`, `GameModes.ts`.
- `src/game/persistence/`: `GameStatePersistence.ts`, `CircuitBreaker.ts`.
- `tests/`: `soak_10k_frames.test.mjs`, `chaos_resilience.test.mjs`, `bosses.test.mjs`, `crises.test.mjs`, `progression.test.mjs`, `persistence.test.mjs`.
