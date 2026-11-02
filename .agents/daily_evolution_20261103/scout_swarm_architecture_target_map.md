# Scout & Context Division: Architecture & Codebase Target Map
**Daily Evolution Cycle**: 2026-11-03
**Division**: Scout & Context Division (5 Subagents: Scout 1 to Scout 5)

## 1. Codebase Architecture Overview
- **Core Game Loop & Scene**: `src/game/GameScene.ts` coordinates entities, hazard layers, audio singletons, and progression directors.
- **Crises Subsystem**: `src/game/crises/` contains the 7 Stellaris-inspired planetary crises:
  - Stellaris Crisis 1: `VoidCrisis.ts` (`VoidCrisisAudio.ts`, Wave 8)
  - Stellaris Crisis 2: `ClockworkCrisis.ts` (`ClockworkCrisisAudio.ts`, Wave 12)
  - Stellaris Crisis 3: `OrbitalCrisis.ts` (`OrbitalCrisisAudio.ts`, Wave 16)
  - Stellaris Crisis 4: `SolarFlareCrisis.ts` (`SolarFlareCrisisAudio.ts`, Wave 20)
  - Stellaris Crisis 5: `LavaCrisis.ts` (`LavaCrisisAudio.ts`, Wave 24)
  - Stellaris Crisis 6: `RiftCrisis.ts` (Target: Missing `RiftCrisisAudio.ts`, Wave 28)
  - Stellaris Crisis 7: `PsychicCrisis.ts` (`PsychicCrisisAudio.ts`, Wave 4 & 10)
- **Progression Subsystem**: `src/game/progression/WaveDirector.ts` manages wave sequencing and crisis/boss rotations.
- **Audio & Pooling Infrastructure**: `src/game/pooling/AudioVoicePool.ts` (16 persistent voices) and `ObjectPool.ts`.

## 2. Key Discoveries & Tactical Targets for 2026-11-03
1. **Critical Audio Gap in Stellaris Crisis 6 (`RiftCrisisAudio.ts`)**:
   - `RiftCrisis.ts` is the sole remaining crisis without its own procedural Web Audio synthesizer.
   - Requires procedural synthesis:
     - Subspace Distortion Drone & Gravitational Warp Drone (34Hz sub-bass, 130Hz triangle spacetime tear, quantum noise).
     - Toroidal Corridor Wrap & Subspace Rift Teleportation Whoosh (260Hz -> 1400Hz -> 180Hz Doppler shift, 55Hz sub-pop).
     - Quantum Spire Synchronization Chimes (4-Tier E-Minor/E-Dorian: E5 659.25Hz, G5 783.99Hz, B5 987.77Hz, E6 1318.51Hz + Anchor E4 329.63Hz).
     - Singularity Collapse & Reality Coherence Stabilization (E-Major Solfeggio 528Hz resolution peace chord + decay).
2. **State Serialization Defect in `RiftCrisis.ts`**:
   - `RiftCrisis.ts` lacks `getExtraSerializedState()` and `applyExtraSerializedState()`, leading to total loss of quantum sync timer, spire polarization states, and warp counts across save/load cycles.
3. **Wave 28 Crisis Designation in `WaveDirector.ts`**:
   - Wave 28 is classified as `CRISIS` (`28 % 4 === 0`), but must be explicitly mapped to `CrisisType.DIMENSIONAL_RIFTS` in `WaveDirector.selectCrisisForWave()`.
4. **Crisis Resolution Reward Pipeline (`CrisisManager.ts`)**:
   - `CrisisManager.getCrisisReward(CrisisType.DIMENSIONAL_RIFTS)` must explicitly map to `RelicId.VOID_SINGULARITY_LENS` (or designated relic), 5000 score, 35 Star Candies, and 15 Cosmic Essence.
5. **Teardown Lifecycle Synchronization (`GameScene.ts`)**:
   - `RiftCrisisAudio.resetInstance()` must be invoked during `GameScene.shutdown()` to eliminate audio node retention.
