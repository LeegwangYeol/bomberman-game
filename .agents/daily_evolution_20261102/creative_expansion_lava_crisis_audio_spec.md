# Creative Expansion Division: LavaCrisisAudio Specification
**Daily Evolution Cycle**: 2026-11-02
**Division**: Creative Expansion Division (7 Subagents: Creative 1 to Creative 7)

## 1. 4 Signature Soundscapes
1. **Subterranean Magma Rumble & Tectonic Static Drone**:
   - `MAGMA_SUB_DRONE_32HZ`: 32.4Hz sine sub-bass with exponential descent to 24.0Hz.
   - `TECTONIC_PULSE_110HZ`: 110.0Hz triangle pulse with bandpass filter at 220Hz.
   - `MAGMA_BOILING_STATIC`: 160.0Hz triangle hiss with bandpass filter at 280Hz.
   - `SEISMIC_WARNING_ALERT`: 780.0Hz -> 390.0Hz sawtooth sweep.

2. **Molten Lava Creep & Perimeter Rupture Roar**:
   - `LAVA_RUPTURE_CRESCENDO`: 140.0Hz -> 820.0Hz sawtooth ramp with rising filter.
   - `MOLTEN_SURGE_SUB_THUD`: 160.0Hz -> 45.0Hz sub-bass shockwave.
   - `CORRIDOR_SCORCH_ROAR`: 220.0Hz -> 55.0Hz sawtooth wash.

3. **Obsidian Solidification & Steam Quench Chimes (D-Minor / D-Dorian)**:
   - `STEAM_QUENCH_SNAP`: 920.0Hz -> 160.0Hz sawtooth quench spike.
   - `QUENCH_SUB_THUD`: 45.0Hz -> 20.0Hz sine thud.
   - 4-Tier Obsidian Chime Arpeggio:
     - Tier 1: D5 (587.33Hz)
     - Tier 2: F5 (698.46Hz)
     - Tier 3: A5 (880.00Hz)
     - Tier 4: D6 (1174.66Hz) + Octave Anchor D4 (293.66Hz)

4. **Caldera Pressure Valve Sealed & Tectonic Calm Resolution (D-Major Solfeggio 528Hz)**:
   - D-Major 4-Tone Peace Chord:
     - D4 (293.66Hz), F#4 (369.99Hz), A4 (440.00Hz), D5 (587.33Hz)
   - `COOLING_DISSIPATE_SWEEP`: 480.0Hz down to 50.0Hz gentle triangle decay.

## 2. Wave 24 Mapping & Relic Progression
- `WaveDirector.selectCrisisForWave(24)` mapped to `CrisisType.CREEPING_LAVA`.
- `CrisisManager.getCrisisReward(CrisisType.CREEPING_LAVA)` awards `RelicId.PYROCLASTIC_PRISM`.
