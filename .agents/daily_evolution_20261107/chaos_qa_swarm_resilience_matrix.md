# Chaos QA & Resilience Division: Test Strategy & Resilience Matrix
**Daily Evolution Cycle**: 2026-11-07
**Division**: Chaos QA & Resilience Division (10 Subagents: Chaos 1 to Chaos 10)

## 1. Adversarial Fuzzing & Resilience Directives
- **Subnormal & Float Fuzzing**: Test all mathematical inputs with non-finite values (`NaN`, `Infinity`, `-Infinity`, `-100`, subnormal floats `< 1e-15`, and excessive durations `> 300s`). Ensure zero unhandled exceptions and zero audio pipeline stalls.
- **Extreme Timestep & Boundary Clamping**: Subject boss physics to extreme timesteps ($dt = 10,000\text{ ms}$ lag spikes) and continuous corner-bomb collisions. Confirm coordinates remain strictly confined to $[60, 540] \times [60, 460]$.
- **Head-On Collision Traps**: Verify Captain Nibbles triggers 3.0s dizzy stun and takes 1 bomb damage upon head-on bomb collisions, correctly pushing back 2 tiles without clipping through arena boundaries.
- **Voice Pool Recycling & Stealing**: Bombard `HamsterAudio` with 1,000 rapid calls within a single tick to verify voice stealing logic, debounce windows, and zero dropouts.
- **10,000-Frame Continuous Soak Simulation**: Run 10,000 uninterrupted frames simulating active boss combat, verify exact static buffer reuse (`buffersCreated === 1`), zero memory leaks, and 100% numerical stability.

## 2. Dedicated 11-Tier Test Suite Specification (`tests/hamster_audio.test.mjs`)
1. **Tier 1: Hamster Audio Presets**: Verify frozen dictionaries, mathematical frequencies, ramps, and filters.
2. **Tier 2: Headless SSR Safety**: All methods execute safely without window or AudioContext.
3. **Tier 3: Voice Pool Routing & Debouncing**: Dispatches tones to AudioVoicePool with strict rate-limiting.
4. **Tier 4: Zero-GC Static White Noise Buffer**: Verify static 500ms buffer reuse across 40+ triggers.
5. **Tier 5: Signature Soundscapes & Solfeggio 528Hz**: Sacred harmonic restoration quad on defeat.
6. **Tier 6: Dual-Watchdog Cleanup & Node Disconnection**: `source.onended` + fallback `setTimeout` + `clearPendingNodes()`.
7. **Tier 7: Adversarial Input Fuzzing**: Immune to NaNs, infinities, and subnormal floats.
8. **Tier 8: Boss Combat FSM Integration**: Rev windup, dash roll, wall bank shot, head-on collision, and defeat hooks.
9. **Tier 9: Spatial & Boundary Invariants**: Complete arena clamping under all collision angles.
10. **Tier 10: 10,000-Frame Soak Endurance**: 10,000 consecutive frames with 0 leaks and static buffer preservation.
11. **Tier 11: Singleton Lifecycle Teardown**: `getInstance()`, `reset()`, `stop()`, `destroy()`, and `resetInstance()`.
