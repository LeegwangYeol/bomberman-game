# Scout & Context Division: Architecture & Codebase Target Map
**Daily Evolution Cycle**: 2026-11-07
**Division**: Scout & Context Division (5 Subagents: Scout 1 to Scout 5)

## 1. Codebase Architecture Overview
- **Core Game Loop & Scene**: `src/game/GameScene.ts` coordinates all entities, multi-hazard layers, audio singletons, and progression directors.
- **Crises Subsystem (`src/game/crises/`)**: All 7 Stellaris planetary crises possess procedural audio engines:
  - Stellaris Crisis 1: `VoidCrisis.ts` (`VoidCrisisAudio.ts`, Wave 8)
  - Stellaris Crisis 2: `ClockworkCrisis.ts` (`ClockworkCrisisAudio.ts`, Wave 12)
  - Stellaris Crisis 3: `OrbitalCrisis.ts` (`OrbitalCrisisAudio.ts`, Wave 16)
  - Stellaris Crisis 4: `SolarFlareCrisis.ts` (`SolarFlareCrisisAudio.ts`, Wave 20)
  - Stellaris Crisis 5: `LavaCrisis.ts` (`LavaCrisisAudio.ts`, Wave 24)
  - Stellaris Crisis 6: `RiftCrisis.ts` (`RiftCrisisAudio.ts`, Wave 28)
  - Stellaris Crisis 7: `PsychicCrisis.ts` (`PsychicCrisisAudio.ts`, Wave 4 & 10)
- **Boss Subsystem (`src/game/bosses/`)**:
  - `BaseBoss.ts`, `BossAttackManager.ts`, `TelegraphEngine.ts`, `BossHUD.ts`.
  - Boss Roster:
    1. `SteamToyTitanBoss` -> `SteamToyTitanAudio.ts` (Complete)
    2. `MutantFloraBoss` -> `MutantFloraAudio.ts` (Complete)
    3. `QueenBeeBoss` -> `QueenBeeAudio.ts` (Complete)
    4. `GummyBearBoss` -> `GummyBearAudio.ts` (Complete)
    5. `HamsterBoss` -> **MISSING PROCEDURAL AUDIO SYNTHESIZER (`HamsterAudio.ts`)!**
- **Hazards Subsystem (`src/game/hazards/`)**: 9 hazards all have procedural audio engines (Abyssal, Chrono, Dynamic, Frost, Magma, Miasma, Nebula, Solar, Volt).
- **Pooling & Voice Management (`src/game/pooling/`)**: `AudioVoicePool.ts` (16 persistent pre-connected voices with hybrid stealing) and `ObjectPool.ts`.

## 2. Key Discoveries & Tactical Targets for 2026-11-07
1. **Flagship Rodent Gyro Inventor Boss Procedural Audio Synthesizer (`HamsterAudio.ts`)**:
   - Deliver 100% Procedural Web Audio API sound synthesis for Captain Nibbles:
     - Gyro Wheel Rev Windup (120Hz -> 480Hz accelerating motor pitch with mechanical whine).
     - High-Speed Dash Roll Hum (220Hz saw with fast tremolo and electrostatic spark pops).
     - 90° Bank-Shot Wall Bumper Ricochet (520Hz -> 260Hz triangle with resonant metal ping at 1040Hz).
     - Head-On Bomb Collision Overload Crack (80Hz sub blast + 880Hz -> 110Hz saw impact punch).
     - Comic Dazed Stars Arpeggio (C6 1046.50Hz, E6 1318.51Hz, G6 1567.98Hz sine tones).
     - Sunflower Gatling Seed Salvo (820Hz -> 240Hz rapid seed ejections).
     - 360° Gyro-Laser Sweep Buzz (750Hz resonant saw with 1200Hz bandpass filter).
     - Phase Transitions (Phase 2 Electro-Overload triad / Phase 3 Berserk Ricochet Pinball alarm).
     - Sphere Deceleration Spin-Down & Solfeggio 528Hz Mechanical Restoration Harmonic Chime (C4, E4, G4, 528.00Hz).
2. **Boss Resilience & Boundary Hardening (`HamsterBoss.ts`)**:
   - Enforce `Number.isFinite(dt)` and subnormal float protection.
   - Enforce `this.clampPosition()` across all positions, recoil paths, and wall rebound vectors.
   - Guard `canTakeDamage()` against illegal transitions during `INTRO`, `INTERMISSION`, and `DEFEATED`.
   - Wire `headOnBombCheck` hook and audio event dispatches into `HamsterBoss`.
   - Implement `destroy()` override for clean lifecycle disposal.
3. **Audio Lifecycle Warden Audit Expansion (`tests/unit/audio_lifecycle_warden_audit.test.mjs`)**:
   - Expand audit coverage to all 19 audio synthesizers (including `HamsterAudio`), verifying Req 1 (Buffer reuse), Req 2 (Dual watchdog & `clearPendingNodes`), and Req 3 (Headless SSR).
4. **GameScene Lifecycle Teardown Symmetry (`src/game/GameScene.ts`)**:
   - Register `HamsterAudio.resetInstance()` in `GameScene.shutdown()` to eliminate static buffer/graph retention.
