# Scout & Context Division: Architecture & Codebase Target Map
**Daily Evolution Cycle**: 2026-11-08  
**Division**: Scout & Context Division (5 Subagents: Scout 1 to Scout 5)

## 1. Codebase Architecture Overview
- **Core Game Loop & Scene**: `src/game/GameScene.ts` coordinates all entities, multi-hazard layers, audio singletons, and progression directors.
- **Crises Subsystem (`src/game/crises/`)**: All 7 Stellaris planetary crises possess procedural audio engines (Void, Clockwork, Orbital, SolarFlare, Lava, Rift, Psychic).
- **Boss Subsystem (`src/game/bosses/`)**: All 5 bosses possess dedicated procedural audio synthesizers (SteamToyTitan, MutantFlora, QueenBee, GummyBear, HamsterBoss).
- **Hazards Subsystem (`src/game/hazards/`)**: 9 of 10 dynamic hazards possess procedural audio engines (Abyssal, Chrono, Dynamic, Frost, Magma, Miasma, Nebula, Solar, Volt).
  - **TACTICAL GAP DISCOVERED**: `GravityHazard` is the single remaining hazard without a dedicated procedural audio engine (`GravityHazardAudio.ts` does not exist).
- **Pooling & Voice Management (`src/game/pooling/`)**: `AudioVoicePool.ts` (16 persistent pre-connected voices with hybrid stealing) and `ObjectPool.ts`.

## 2. Key Discoveries & Tactical Targets for 2026-11-08
1. **Gravitational Singularity Procedural Audio Synthesizer (`GravityHazardAudio.ts`)**:
   - Deliver 100% Procedural Web Audio API sound synthesis for the Gravitational Singularity hazard engine:
     - Infrasound sub-bass accretion drone (38Hz -> 30Hz sine with 80Hz lowpass filter).
     - Relativistic Doppler accretion sweep (120Hz -> 480Hz saw with Q=3.5 bandpass filter).
     - Event horizon critical collapse shear (680Hz -> 45Hz saw with Q=4.5 lowpass plunge).
     - Singularity burst / vacuum implosion crack (55Hz -> 18Hz sub-bass + 960Hz vacuum crack + 2400Hz cosmic particle hiss).
     - Gravitational drag space-time dilation warble (60Hz -> 45Hz triangle).
     - Orbital slingshot escape velocity chime triad (440Hz -> 880Hz -> 1320Hz sine with 300ms debounce).
     - Cosmic fusion super-bomb coalescence & detonation boom (D3 146.83Hz + A3 220Hz + F#4 370Hz + 90Hz->30Hz sub-blast).
     - Minion spaghettification & boss stasis grounded acoustic feedback.
     - Event horizon calm & Solfeggio 528Hz Singularity Transformation Harmonic Quad (C4 261.63Hz, E4 329.63Hz, G4 392.00Hz, 528.00Hz).
2. **Hazard Subsystem Export Harmonization (`src/game/hazards/index.ts`)**:
   - Export `GravityHazardAudio` and `GRAVITY_AUDIO_PRESETS`.
3. **GameScene Symmetrical Lifecycle Harmonization (`src/game/GameScene.ts`)**:
   - Instantiate `public gravityHazardAudio: GravityHazardAudio = GravityHazardAudio.getInstance();`.
   - Wire state dispatching: `GravityHazardAudio.playGravityHazardState(state, phase)`.
   - Connect slingshot escape, cosmic bomb fusion, minion spaghettification, and boss stasis audio hooks.
   - Symmetrical teardown in `shutdown()` calling `destroy()` and `GravityHazardAudio.resetInstance()`.
4. **Universal Audio Lifecycle Warden Audit Expansion (`tests/unit/audio_lifecycle_warden_audit.test.mjs`)**:
   - Incorporate `GravityHazardAudio` across Req 1 (Buffer reuse), Req 2 (Dual watchdog & `clearPendingNodes`), and Req 3 (Headless SSR), expanding total audited synthesizers to 22.
5. **Dedicated 11-Tier Test Battery (`tests/gravity_hazard_audio.test.mjs`)**:
   - Complete 11 tiers covering presets, headless SSR, voice pool routing, static noise buffer reuse, Solfeggio 528Hz chords, dual-watchdog cleanup, adversarial fuzzing, FSM integration, boundary invariants, 10,000-frame soak, and singleton teardown.
