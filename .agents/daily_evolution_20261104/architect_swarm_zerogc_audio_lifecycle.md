# Architect & Zero-GC Division: Technical Hardening & Lifecycle Specifications
**Daily Evolution Cycle**: 2026-11-04
**Division**: Architect & Zero-GC Division (5 Subagents: Architect 1 to Architect 5)

## 1. Zero-GC Audio Synthesizer Invariants (`MutantFloraAudio.ts`)
- **Immutable Presets**:
  - All tone parameters defined in `FLORA_AUDIO_PRESETS` and frozen with `deepFreezePresets()` and `freezeTonePreset()`.
  - Zero dynamic tone allocations or closure recreation in audio dispatch hot paths.
- **Shared AudioVoicePool Allocation**:
  - Routing tone events strictly through pre-allocated `AudioVoicePool` (16 voices with click-free preemption and de-zippering).
- **Reusable Noise Buffer**:
  - Reusing a static 500ms white noise buffer (`cachedNoiseBuffer`) per sample rate for spore aerosol, soil tear, and whip whoosh effects.
- **Safe SSR & Headless Degradation**:
  - 100% crash-free execution in headless SSR environments when `window` or `AudioContext` is undefined.

## 2. Double-Watchdog Teardown & Lifecycle Sanitation
- **Active Node & Timer Tracking**:
  - Maintain `activeTransientNodes: Set<AudioNode>` for all transient noise buffer sources, gain nodes, and biquad filters.
  - Maintain `activeTimeouts: Set<ReturnType<typeof setTimeout>>` for all scheduled parameter ramps and fallback disconnects.
- **Dual Cleanup Contract**:
  - Each buffer source attaches `source.onended = cleanup` AND registers a watchdog timeout fallback `setTimeout(cleanup, durationMs + 80)`.
- **Teardown & Reset**:
  - Implement `stop()`, `reset()`, `destroy()`, and `resetInstance()`.
  - When `reset()` or `destroy()` is called, immediately clear all active timers and forcefully disconnect all transient nodes via `clearPendingNodes()`.

## 3. Boss Subsystem & Scene Synchronization
- **`MutantFloraBoss.ts` Integration**:
  - Property: `public audio: MutantFloraAudio = MutantFloraAudio.getInstance();`
  - Audio triggers wired into `spawnSubterraneanRoot()`, `cleanseRootsAt()`, `emitPollenCloud()`, `executeVineWhip()`, `burrowUnderground()`, `emergeFromUnderground()`, `onHitReceived()`, `onDamageBlocked()`, `applyStun()`, `onStateChanged()`, and `onDefeated()`.
  - In `destroy()`: invoke `this.audio.reset()`.
- **`GameScene.ts` Teardown Synchronization**:
  - Register `MutantFloraAudio.resetInstance()` into `GameScene.shutdown()` alongside `SteamToyTitanAudio.resetInstance()` and crisis audio singletons.
- **Export Uniformity**:
  - Export `MutantFloraAudio` and `FLORA_AUDIO_PRESETS` via `src/game/bosses/index.ts`.

## 4. Universal Audio Warden Test Expansion
- Add `ClockworkCrisisAudio`, `OrbitalCrisisAudio`, `SolarFlareCrisisAudio`, and `MutantFloraAudio` to `tests/unit/audio_lifecycle_warden_audit.test.mjs`.
- Test static buffer reuse, dual watchdog cleanup, and headless SSR safety across all synthesizers.
