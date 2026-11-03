# Creative Expansion Division: Apex Crisis Boss "Verdant Terror" Audio Specification
**Daily Evolution Cycle**: 2026-11-04
**Division**: Creative Expansion Division (7 Subagents: Creative 1 to Creative 7)

## 1. Feature Conception: Procedural WebAudio Synthesizer for Mutant Flora Boss (`MutantFloraAudio.ts`)
`MutantFloraBoss` ("Verdant Terror") is the flagship Apex Crisis Boss of the game, featured dynamically on Wave 10 and Wave 20 (`CRISIS_BOSS` waves) alongside systemic crises like Psychic Invasion and Solar Flares. Previously, it had no dedicated procedural audio synthesizer.

`MutantFloraAudio.ts` delivers 100% procedural sound synthesis using the Web Audio API without pre-recorded audio assets or runtime GC allocations.

### 4 Signature Soundscapes:

1. **Subterranean Root Eruption & Earth Tremor**:
   - Fundamental sub-bass mantle thud: 38.0Hz sine wave descending exponentially to 24.0Hz (duration: 650ms, Q: 2.0).
   - Soil displacement resonant thrum: 82.0Hz triangle wave ramping to 46.0Hz (duration: 380ms, Q: 1.8).
   - Root wood fracturing snap: 220.0Hz -> 65.0Hz saw click (duration: 120ms, Q: 3.2).
   - Displaced loam procedural noise burst: 450Hz -> 180Hz bandpass sweep (400ms).

2. **Spore Pod Launch & Airborne Pollen Dispersion**:
   - Hydrostatic pod burst cavitation pop: 480.0Hz -> 160.0Hz exponential chirp (duration: 140ms, Q: 3.0).
   - Recoil sub-pop: 95.0Hz -> 40.0Hz sine wave (duration: 120ms).
   - Toxic aerosol particulate hiss: 2600Hz high-pass filtered white noise burst (450ms, sweeping down to 1900Hz).

3. **Carnivorous Vine Whip Crack & Radial Shockwave**:
   - Supersonic vine whip lash: 840.0Hz -> 110.0Hz exponential sawtooth sweep (duration: 160ms, Q: 3.5).
   - Kinetic shockwave detonation thump: 45.0Hz -> 22.0Hz sine burst (duration: 400ms, Q: 2.0).
   - Supersonic air tear transient noise snap: 35ms sharp high-pass burst at 3400Hz.

4. **Burrowing Drone & Photosynthetic Regrowth / Peace Bloom (Solfeggio 528Hz)**:
   - Subterranean churning drone: 52.0Hz triangle drone layered with detuned 56.2Hz sine producing 4.2Hz acoustic flutter.
   - Solfeggio 528Hz Transformation / Peace Bloom Quad:
     - C4 Sub-Octave Anchor: 264.00Hz (528 / 2) sine, duration 2.2s.
     - Solfeggio 528Hz Primary Bloom: 528.00Hz sine, duration 2.4s.
     - Canopy Fifth Harmony: 792.00Hz (528 * 1.5) sine, duration 2.2s.
     - Celestial Shimmer Octave: 1056.00Hz (528 * 2) sine, duration 2.5s.
   - Ethereal foliage dissipation rustle: 800ms soft bandpass noise sweep.

## 2. Zero-GC & Zero-Leak Architecture
- Pre-allocated immutable presets declared via `deepFreezePresets` (`FLORA_AUDIO_PRESETS`).
- Reusing pre-allocated 16-voice pool via `AudioVoicePool.ts`.
- Permanent reuse of static 500ms white noise buffer (`cachedNoiseBuffer`).
- Dual-watchdog cleanup (`source.onended` + `setTimeout` fallback).
- Clean lifecycle teardown via `stop()`, `reset()`, `destroy()`, and `resetInstance()`.
- Complete headless SSR safety in Node.js test environments.

## 3. Integration Points
- `src/game/bosses/MutantFloraBoss.ts`: Wires procedural audio into all attacks, state changes, and boss lifecycle.
- `src/game/GameScene.ts`: Registers `MutantFloraAudio.resetInstance()` into `shutdown()`.
- `src/game/bosses/index.ts`: Exports `MutantFloraAudio` and `FLORA_AUDIO_PRESETS`.
