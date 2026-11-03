# Scout & Context Division: Architecture & Codebase Target Map
**Daily Evolution Cycle**: 2026-11-04
**Division**: Scout & Context Division (5 Subagents: Scout 1 to Scout 5)

## 1. Codebase Architecture Overview
- **Core Game Loop & Scene**: `src/game/GameScene.ts` coordinates all entities, multi-hazard layers, audio singletons, and progression directors.
- **Crises Subsystem (`src/game/crises/`)**: All 7 Stellaris planetary crises now possess procedural audio engines:
  - Stellaris Crisis 1: `VoidCrisis.ts` (`VoidCrisisAudio.ts`, Wave 8)
  - Stellaris Crisis 2: `ClockworkCrisis.ts` (`ClockworkCrisisAudio.ts`, Wave 12)
  - Stellaris Crisis 3: `OrbitalCrisis.ts` (`OrbitalCrisisAudio.ts`, Wave 16)
  - Stellaris Crisis 4: `SolarFlareCrisis.ts` (`SolarFlareCrisisAudio.ts`, Wave 20)
  - Stellaris Crisis 5: `LavaCrisis.ts` (`LavaCrisisAudio.ts`, Wave 24)
  - Stellaris Crisis 6: `RiftCrisis.ts` (`RiftCrisisAudio.ts`, Wave 28)
  - Stellaris Crisis 7: `PsychicCrisis.ts` (`PsychicCrisisAudio.ts`, Wave 4 & 10)
- **Boss Subsystem (`src/game/bosses/`)**:
  - `BaseBoss.ts`, `BossAttackManager.ts`, `TelegraphEngine.ts`, `BossHUD.ts`.
  - Boss Roster: `MutantFloraBoss`, `GummyBearBoss`, `HamsterBoss`, `QueenBeeBoss`, `SteamToyTitanBoss`.
  - **Audio Coverage Gap**: Only `SteamToyTitanBoss` possessed dedicated procedural audio (`SteamToyTitanAudio.ts`). The flagship apex crisis boss `MutantFloraBoss` ("Verdant Terror", featured in Wave 10, 20, 40...) lacked procedural sound synthesis.
- **Hazards Subsystem (`src/game/hazards/`)**: 9 hazards all have procedural audio engines (Abyssal, Chrono, Dynamic, Frost, Magma, Miasma, Nebula, Solar, Volt).
- **Pooling & Voice Management (`src/game/pooling/`)**: `AudioVoicePool.ts` (16 persistent pre-connected voices with hybrid stealing) and `ObjectPool.ts`.

## 2. Key Discoveries & Tactical Targets for 2026-11-04
1. **Flagship Apex Boss Procedural Audio Synthesizer (`MutantFloraAudio.ts`)**:
   - Deliver 100% Procedural Web Audio API sound synthesis for Verdant Terror:
     - Subterranean Root Eruption & Earth Tremor (38Hz mantle sub-bass rumble, 82Hz soil displacement, 220Hz wood snap).
     - Spore Pod Launch & Airborne Pollen Dispersion (480Hz -> 160Hz organic pop, 2600Hz high-pass particulate hiss).
     - Carnivorous Vine Whip Crack & Radial Shockwave (840Hz -> 110Hz supersonic lash sweep, 45Hz shockwave thump).
     - Burrowing Drone & Photosynthetic Regrowth / Peace Bloom (Solfeggio 528Hz healing resonance quad on defeat/cleanse).
2. **Audio Lifecycle Warden Test Expansion (`tests/unit/audio_lifecycle_warden_audit.test.mjs`)**:
   - `ClockworkCrisisAudio`, `OrbitalCrisisAudio`, and `SolarFlareCrisisAudio` were previously missing from the lifecycle audit test suite.
   - Expand the audit to cover all crises plus new `MutantFloraAudio` across Buffer Reuse (Req 1), Dual Watchdog Cleanup (Req 2), and Headless SSR Safety (Req 3).
3. **Boss Resilience & Boundary Hardening (`MutantFloraBoss.ts`)**:
   - Ensure `cleanseRootsAt()` handles non-finite / subnormal coordinates and radii gracefully.
   - Verify `emitPollenCloud()` defensive velocity guard when player and boss coordinates coincide.
   - Synchronize `MutantFloraAudio.resetInstance()` into `GameScene.shutdown()` and `MutantFloraBoss.destroy()`.
