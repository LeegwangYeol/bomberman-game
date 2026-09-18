# Project: Bomberman Infinite Evolution & Massive Expansion

## Architecture
- **Engine Core**: Phaser 3 (HTML5 Canvas 2D procedural rendering) decoupled from pure simulation models in TypeScript (`src/game/`).
- **Zero-GC Subsystem** (COMPLETED & AUDITED):
  - `ZeroGCPathfinder`: 1D typed arrays (`Uint16Array`, `Int16Array`, `Uint8Array`, 195 cells) with generational counter, eliminating BFS heap allocations.
  - `ObjectPool<T>`: Contiguous pre-allocated pools for Bombs (32), Explosions (128), Particles (256), Item Drops (48), Floating Text (32) with $O(1)$ swap-and-pop release and dense active traversal.
  - `AudioVoicePool`: Recycled native Web Audio nodes with ADSR envelopes and click-free voice stealing.
  - `FlatHazardMask`: 195-byte duck-typed bitmask eliminating per-frame Set allocations in 60 FPS update loop.
  - Single persistent graphics batching for floor telegraphs, shockwaves, and crisis hazards.
- **Boss Subsystem** (COMPLETED & AUDITED):
  - `BaseBoss`: 7-state finite state machine (`INTRO`, `PHASE_1`, `INTERMISSION`, `PHASE_2`, `ENRAGED`, `STUNNED`, `DEFEATED`), 150ms combo hit buffer window, 3-tier floor tile telegraphing.
  - Boss entities: King Gummy Bear, Mecha Hamster Captain Nibbles, Queen Bee Cupcake.
  - `TelegraphEngine`: 3-tier floor danger warning with >=40% safe area invariant.
  - `BossHUD`: Segmented HP bars, enrage gauge, and React bridge.
- **Crises Subsystem** (COMPLETED & AUDITED):
  - `CrisisManager`: 3-stage escalation (`WHISPERS`, `OUTBREAK`, `CLIMAX`), threat meters, 6 distinct crisis types (Pastel Void, Clockwork Rebellion, Orbital Bombardment, Solar Flares, Creeping Lava, Dimensional Rifts).
  - `SituationLog`: Situation Log HUD state controller and React HUD overlay.
- **Game Modes & Scaling Subsystem** (COMPLETED & AUDITED):
  - `ScalingEngine`: Continuous deterministic math formulas for speed (2.2x soft cap), density (max 14), HP, and fuses.
  - Game Modes: Standard, Crisis Survival (60s waves, drop pods), Boss Rush (5-boss gauntlet, medals), Endless Gauntlet (procedural chambers, 3-card boon drafting).
  - `PerkTree`: 16-node Confectionery Perk Tree (Baking, Sugar Rush, Resilience, Alchemy) with dual currencies (Star Candies 🍬, Cosmic Sugar Essence ✨) and Second Wind lethal damage immunity.
  - `RelicSystem`: 8 equippable relics, 4 synergies, 500ms ICD proc loops protection.
- **State Persistence & 429 Recovery** (COMPLETED & AUDITED):
  - `GameStatePersistence`: SessionStorage active run snapshots + LocalStorage meta-progression, RLE compression, 24-hex canonical checksums, export/import JSON packages.
  - `CircuitBreaker`: API 429 exponential backoff with jitter, offline queueing, emergency state save callback.
  - Chaos Bots testing harness (50,000 adversarial inputs passing with zero crashes or invariant breaches).
- **Total Inspection ("총검사") & Zero-Defect Hardening** (COMPLETED & AUDITED):
  - Exhaustive 6-domain audit completed: Physics, AI, Memory, UI, Security, Architecture.
  - Defect inventory established covering 30+ physical, logical, visual, and architectural issues (PHYS-01..07, AI-01..08, MEM-01..03, UI-01..06, SEC-01..04, ARCH-01..04).
  - Autonomous remediation across GameScene, pathfinding, entities, bosses, persistence, and React bridge.
  - Permanent defensive regression tests and 100% test pass (`npm run test`), lint clean (`npm run lint`), build success (`npm run build`).

## Feature Inventory & Inspection Defects
| # | Feature / Defect | Description | Milestone | Source |
|---|------------------|-------------|-----------|--------|
| 1 | PHYS-01 | Permanent God-Mode on Extra Life: restore `isInvulnerable = false` after 3s | M7 | inspection |
| 2 | PHYS-02 | Kicked/Conveyor Bombs: read live `bomb.x, bomb.y` in `explodeBomb` rather than placement closure | M7 | inspection |
| 3 | PHYS-03 | Conveyor Edge Jitter: AABB bounds checking during conveyor push to prevent wall penetration | M7 | inspection |
| 4 | PHYS-04 | Diagonal Blast Leakage: explosion sprite physics body padding to prevent pillar clipping | M7 | inspection |
| 5 | PHYS-05 | Soft Block Desync in Simultaneous Blasts: atomic raycast hit handling | M7 | inspection |
| 6 | PHYS-06 | Single-Bomb Multi-Hit on Bosses: guard boss damage to 1 hit per bomb id | M7 | inspection |
| 7 | PHYS-07 | Passability & Corner Perks: wire `corner_magnet` tolerance and passability perks | M7 | inspection |
| 8 | AI-01 | ZeroGCPathfinder init order: fix parameter order `init(rows, cols)` to match constructor | M7 | inspection |
| 9 | AI-02 | isTileInBlastRange bounds: add `0 <= r < ROWS && 0 <= c < COLS` check | M7 | inspection |
| 10 | AI-03 | ChaserEnemy double stun: synchronize stun state reset with FSM state transition | M7 | inspection |
| 11 | AI-04 | BomberEnemy evasion freeze: add timeout watchdog and implement `onBombExploded` | M7 | inspection |
| 12 | AI-05 | GhostEnemy Ether Dash: preserve 260 px/s velocity across full dash duration | M7 | inspection |
| 13 | AI-06 | MerchantNPC escape mask: pass full blast raycast tiles to `findEscapePathBFS` | M7 | inspection |
| 14 | AI-07 | PetDrone delta scaling: apply `(delta / 1000)` to tractor beam item pull | M7 | inspection |
| 15 | AI-08 | Splitter mini-slime spawn bounds: check tile emptiness before placing mini-slimes | M7 | inspection |
| 16 | MEM-01 | Scene restart mode-changed leak: add `shutdown()` to remove `mode-changed` listener | M7 | inspection |
| 17 | MEM-02 | Web Audio node leaks: add disconnect() calls and unmount cleanup to WebAudioSynth | M7 | inspection |
| 18 | MEM-03 | AudioVoicePool lifecycle: add `destroy()` / `disconnect()` and suspended context handling | M7 | inspection |
| 19 | UI-01 | React HUD timer freezing: emit periodic stats updates during cooldown and buff decay | M8 | inspection |
| 20 | UI-02 | Boss HUD stun timer freezing: invoke `this.bossHUD.update(delta)` in `GameScene:update` | M8 | inspection |
| 21 | UI-03 | NippleJS joystick dead zones: fix 135° and 225° partition comparisons (`>=` / `<=`) | M8 | inspection |
| 22 | UI-04 | Mobile buttons touchcancel: add `onPointerCancel` and pointer capture | M8 | inspection |
| 23 | UI-05 | Global key interception in modals: bypass hotkeys when typing in `<textarea>` / inputs | M8 | inspection |
| 24 | UI-06 | Wire React events in GameScene: register listeners for `perks-updated`, `relics-updated`, `resume-run-state` | M8 | inspection |
| 25 | SEC-01 | CircuitBreaker queue stall: schedule retry when re-queuing under CLOSED state | M8 | inspection |
| 26 | SEC-02 | PerkTreeManager prototype crash: use `hasOwnProperty` in `canUpgradePerk` | M8 | inspection |
| 27 | SEC-03 | WebStorageAdapter quota desync: disable `this.storage` on `QuotaExceededError` | M8 | inspection |
| 28 | SEC-04 | Save package input sanitization: clamp currencies and reject negative perk levels | M8 | inspection |
| 29 | ARCH-01 | TelegraphEngine swap-and-pop corruption: fix slot index tracking in `cancelAttack` & `update` | M8 | inspection |
| 30 | ARCH-02 | Boss invulnerability & triggers: fix post-combo i-frames overlapping stun, wire grounding & dive triggers | M8 | inspection |
| 31 | ARCH-03 | BaseCrisis subclass state reset: clear pending craters, charges, and conduits in `reset()` | M8 | inspection |
| 32 | ARCH-04 | ScalingEngine soft caps: add safety clamps on wave scaling | M8 | inspection |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Zero-GC Pooling & 10k Soak Test Infra | Features 1-6 (ZeroGCPathfinder, ObjectPool, scratch vectors, AudioVoicePool, 10k soak test) | none | DONE |
| M2 | Multi-Phase Epic Bosses & Telegraphs | Features 7-12 (BaseBoss, 3 Bosses, 3-tier floor telegraphs, Boss HUD) | M1 | DONE |
| M3 | Dynamic Stellaris-Style Map Crises | Features 13-20 (CrisisManager, 6 Crises, Situation Log HUD) | M1 | DONE |
| M4 | Infinite Scaling, Modes & Meta-Progression | Features 21-28 (ScalingEngine, 3 New Modes, Perk Tree, Relics) | M2, M3 | DONE |
| M5 | State-Saving, 429 Recovery & Chaos Bots | Features 29-35 (GameStatePersistence, 429 Circuit Breaker, Chaos Bots, Invariant Tests) | M1, M4 | DONE |
| M6 | Total Inspection (총검사) Survey & Audit | Exhaustive 6-domain inspection via 6 specialized Explorers | M1-M5 | DONE |
| M7 | Core Engine, Physics & AI Remediation | Remediation of PHYS-01..07, AI-01..08, MEM-01..03 via Worker 1 | M6 | DONE |
| M8 | Systems, UI, Bosses & Security Remediation | Remediation of UI-01..06, SEC-01..04, ARCH-01..04 via Worker 2 | M6 | DONE |
| M9 | Adversarial Verification & Integrity Audit | 2 Reviewers, 2 Challengers, 1 Forensic Auditor gate check | M7, M8 | DONE |
| M10| Full Regression, Build & Main Integration | npm run test (100%), npm run lint, npm run build, git commit & push | M9 | DONE |

## Interface Contracts
### GameScene ↔ Entities & Bombs
- Bomb detonation reads live `bomb.x, bomb.y` coordinates converted to grid rows/cols.
- Conveyor push performs full 24x24 AABB bounds check against wall tiles before position mutation.
- Extra-life revival sets `this.isInvulnerable = true` with a guaranteed timed reset to `false` after 3000ms.

### ZeroGCPathfinder ↔ Entities
- `init(rows: number, cols: number): void` matching constructor signature.
- `isTileInBlastRange(r: number, c: number, ...): boolean` guarantees 0 error on out-of-bounds coordinates.

### React HUD ↔ GameScene
- Event `stats-update` emitted periodically during active countdowns and buff durations.
- Event `mode-changed` listener deregistered upon scene shutdown to prevent memory leaks.
- Event `boss-hud-update` ticked per frame via `bossHUD.update(delta)`.
