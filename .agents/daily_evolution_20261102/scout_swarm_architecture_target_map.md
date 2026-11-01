# Scout & Context Division: Architecture & Codebase Target Map
**Daily Evolution Cycle**: 2026-11-02
**Division**: Scout & Context Division (5 Subagents: Scout 1 to Scout 5)

## 1. Codebase Architecture Overview
- **Core Engine**: `src/game/GameScene.ts` coordinates entities, hazard layers, audio singletons, and progression directors.
- **Crises Subsystem**: `src/game/crises/` contains 7 Stellaris-inspired planetary crises:
  - Stellaris Crisis 1: `VoidCrisis.ts` (`VoidCrisisAudio.ts`)
  - Stellaris Crisis 2: `ClockworkCrisis.ts` (`ClockworkCrisisAudio.ts`)
  - Stellaris Crisis 3: `OrbitalCrisis.ts` (`OrbitalCrisisAudio.ts`)
  - Stellaris Crisis 4: `SolarFlareCrisis.ts` (`SolarFlareCrisisAudio.ts`)
  - Stellaris Crisis 5: `LavaCrisis.ts` (Target: `LavaCrisisAudio.ts`)
  - Stellaris Crisis 6: `RiftCrisis.ts`
  - Stellaris Crisis 7: `PsychicCrisis.ts` (`PsychicCrisisAudio.ts`)
- **Progression Subsystem**: `src/game/progression/WaveDirector.ts` orchestrates wave classifications (CRISIS, BOSS, CRISIS_BOSS).
- **Pooling & Performance**: `src/game/pooling/AudioVoicePool.ts` (16 persistent voices) and `ObjectPool.ts`.

## 2. Key Discoveries & Targets
1. **LavaCrisis Gap**: `LavaCrisis.ts` (Stellaris Crisis 5) lacked a dedicated procedural WebAudio synthesizer, had no serialization hooks (`getExtraSerializedState`), and omitted coordinate bounds defense.
2. **Wave 24 Progression**: Wave 24 is classified as `CRISIS` (`24 % 4 === 0`), but was not explicitly mapped to `CrisisType.CREEPING_LAVA` in `WaveDirector.selectCrisisForWave()`.
3. **Reward Pipeline**: `CrisisManager.getCrisisReward(CrisisType.CREEPING_LAVA)` is wired to award `RelicId.PYROCLASTIC_PRISM`.
