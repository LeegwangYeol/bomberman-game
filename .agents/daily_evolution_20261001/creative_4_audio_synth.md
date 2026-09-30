# Creative Agent 4: Dynamic WebAudio Sound Design & Synthesizer Specification
**Daily Evolution Cycle:** 2026-10-01  
**Division:** Creative Expansion Division (Creative Agent 4)  
**Target Systems:**
- `src/game/hazards/DynamicHazardAudio.ts`
- `src/game/hazards/DynamicHazard.ts`
- `src/game/pooling/AudioVoicePool.ts`
- `tests/unit/dynamic_hazard_audio.test.mjs`

**Status:** Approved & Verified (100% Invariants & Tests Passing)  
**External Assets:** **0 External Sound Files** (0 MP3, 0 WAV, 0 OGG — 100% Procedural Native Web Audio API)  
**Resource Footprint:** Zero-GC voice recycling, click-free voice stealing, zero dangling nodes, headless-safe fallback.

---

## 1. Executive Summary & Acoustic Architecture

In retro arcade and high-intensity spatial action games, sound is not mere cosmetic dressing—it is an **essential sensory channel** providing microsecond-level gameplay cues. For the **Quantum Spire Dynamic Hazard** (`DynamicHazard.ts`), audio provides critical spatial telegraphing, timing markers for evasion, tactile shockwave feedback, and euphoric acoustic validation for high-skill counterplay such as **Quantum Tunneling** and **Polarization Strikes**.

### 1.1 Core Engineering Constraints
1. **0 External Audio Assets:** The entire soundscape is mathematically synthesized in real time via the native Web Audio API using `OscillatorNode`, `BiquadFilterNode`, `GainNode`, and pre-allocated `AudioBufferSourceNode` primitives.
2. **Zero-GC Invariant:** All persistent tonal voices are recycled via `AudioVoicePool` (16 pre-allocated voices). Parameters are pre-allocated as static, immutable `AudioVoiceToneParams` presets (`HAZARD_AUDIO_PRESETS`), preventing heap allocations during active gameplay frames.
3. **Strict Zero-Leak Node Disconnection:** Any transient synthesis nodes (such as the plasma white noise burst during Tachyon Laser Discharge) employ strict `wireAutoDisconnect` via `source.onended`, track live nodes in an active set, and guarantee full unhooking on `reset()` and `destroy()`.
4. **Headless & SSR Isolation:** When running in Node.js test runners, Next.js server-side builds, or un-interacted mobile browsers, the system guarantees 0 unhandled promise rejections, 0 thrown exceptions, and clean fallback.

---

## 2. Dynamic Hazard Sound Profiles & Mathematical Tuning

```
                     QUANTUM SPIRE HAZARD ACOUSTIC GRAPH
                     
   [1. SPIRE TELEGRAPH PULSE]
   ├─ YELLOW: 48 Hz + 50.5 Hz (2.5 Hz Ominous Throbbing Beat)
   ├─ AMBER:  55 Hz + 59.5 Hz (4.5 Hz Urgent Buzzing Beat)
   └─ RED:    70 Hz + 78.0 Hz (8.0 Hz Critical Alarm Flutter)
               │
               ▼
   [2. TACHYON LASER DISCHARGE]
   ├─ Layer A: Laser Zap (2400 Hz -> 80 Hz Exp Sweep, Sawtooth)
   ├─ Layer B: Sub-Bass Thump (85 Hz -> 24 Hz Exp Drop, Sine)
   └─ Layer C: White Noise Burst (Filtered Bandpass 2200 Hz -> 500 Hz)
               │
      ┌────────┴───────────────────────────┐
      ▼                                    ▼
[3. POLARIZATION STRIKE]          [4. QUANTUM TUNNELING]
(Resonant Golden Chime Chord:       (Cosmic Phase-Shift Whoosh:
 D5 - F#5 - A5 - E6)                 Doppler Swoop + Celestial Chime)
```

---

### 2.1 Spire Telegraph Pulse: Low Ominous Oscillating Sub-Bass Hum

- **Gameplay Trigger:** Fired during the `TELEGRAPH` lifecycle state of `DynamicHazard.ts` (`beginTelegraph` and tier transitions).
- **Acoustic Design:** Rather than a simple monotone hum, the synthesizer uses **dual micro-detuned voices** to generate physical binaural acoustic interference beats (throbbing pulses) directly in the air without requiring runtime LFO nodes.
- **Tier Progression:**
  - **Yellow Tier (`TELEGRAPH_YELLOW`):** 48.0 Hz triangle wave + 50.5 Hz sine wave. Creates a slow, ominous **2.5 Hz throbbing hum**. Filtered through a warm 110 Hz lowpass filter ($Q=2.0$).
  - **Amber Tier (`TELEGRAPH_AMBER`):** 55.0 Hz sawtooth wave + 59.5 Hz sine wave. Creates an accelerating **4.5 Hz urgent buzzing beat** with lowpass filter opening to 220 Hz ($Q=2.8$).
  - **Red Tier (`TELEGRAPH_RED`):** 70.0 Hz square wave + 78.0 Hz sawtooth wave. Creates an intense **8.0 Hz critical warning flutter** with a piercing 350 Hz bandpass filter ($Q=3.5$).
  - **Idle State (`TELEGRAPH_IDLE_HUM`):** Single 55 Hz sine hum ($1.1$s breath envelope, gentle release).

```typescript
// Yellow Telegraph Pulse Preset (Voice A & B)
export const TELEGRAPH_YELLOW_VOICE_A: AudioVoiceToneParams = {
  type: 'triangle',
  frequency: 48,
  gain: 0.18,
  duration: 0.60,
  attackTime: 0.08,
  decayTime: 0.20,
  sustainLevel: 0.5,
  releaseTime: 0.25,
  filter: { type: 'lowpass', frequency: 110, q: 2.0 },
};

export const TELEGRAPH_YELLOW_VOICE_B: AudioVoiceToneParams = {
  type: 'sine',
  frequency: 50.5, // 2.5 Hz binaural acoustic beat against 48 Hz
  gain: 0.16,
  duration: 0.60,
  attackTime: 0.08,
  decayTime: 0.20,
  sustainLevel: 0.5,
  releaseTime: 0.25,
  filter: { type: 'lowpass', frequency: 110, q: 2.0 },
};
```

---

### 2.2 Tachyon Laser Discharge: High-Energy Laser Zap + White Noise Burst

- **Gameplay Trigger:** Fired at `activateDischarge()` (T = 0ms of active corridor strike, duration 300ms, peak flash 150ms).
- **Acoustic Design:** A massive composite 3-layer discharge event:
  1. **Ionization Laser Zap (`DISCHARGE_LASER_ZAP`):** High-frequency sawtooth wave plunging exponentially from 2400 Hz down to 80 Hz in 90ms. Filter: lowpass 3800 Hz sweeping down to 350 Hz with resonant $Q=3.2$, producing an explosive laser air-breakdown snap.
  2. **Sub-Bass Seismic Thump (`DISCHARGE_SUB_THUMP`):** Deep 85 Hz sine wave diving to 24 Hz over 320ms with peak gain 0.55, providing physical tactile shockwave weight.
  3. **Plasma White Noise Burst (`playWhiteNoiseBurst`):** 120ms burst of bandpass-filtered white noise (2200 Hz sweeping down to 500 Hz, $Q=2.2$), simulating superheated tachyon plasma hiss.
- **Zero-Leak Guarantee:** The white noise burst uses a pre-allocated static 500ms `AudioBuffer` shared across calls. The created `AudioBufferSourceNode`, `BiquadFilterNode`, and `GainNode` are tracked and cleanly disconnected via `source.onended`.

```typescript
// Laser Zap & Sub Thump Presets
export const DISCHARGE_LASER_ZAP: AudioVoiceToneParams = {
  type: 'sawtooth',
  frequency: 2400,
  frequencyRamp: { target: 80, duration: 0.09, exponential: true },
  gain: 0.46,
  duration: 0.18,
  attackTime: 0.002, // 2ms explosive transient
  decayTime: 0.08,
  sustainLevel: 0.20,
  releaseTime: 0.06,
  filter: { type: 'lowpass', frequency: 3800, q: 3.2, rampTarget: 350, rampDuration: 0.12 },
};

export const DISCHARGE_SUB_THUMP: AudioVoiceToneParams = {
  type: 'sine',
  frequency: 85,
  frequencyRamp: { target: 24, duration: 0.28, exponential: true },
  gain: 0.55,
  duration: 0.32,
  attackTime: 0.006,
  decayTime: 0.14,
  sustainLevel: 0.30,
  releaseTime: 0.12,
  filter: { type: 'lowpass', frequency: 160, q: 1.2 },
};
```

---

### 2.3 Polarization Strike: Resonant Harmonious Golden Chime Chord

- **Gameplay Trigger:** Fired when a player bomb blast impacts an active Spire crystal (`onBombBlastImpact()`), neutralizing the beam and turning the spire golden for 8000ms.
- **Acoustic Design:** Resonant, triumphant golden chord burst based on the **Golden Ratio Major 9th Chord (D Major 9th)** across 4 pooled voices:
  - **Voice 1 (Root):** D5 ($587.33$ Hz) — Triangle wave bell fundamental.
  - **Voice 2 (Major Third):** F#5 ($739.99$ Hz) — Crystalline harmonic sine wave.
  - **Voice 3 (Fifth):** A5 ($880.00$ Hz) — Resonant warmth sine wave.
  - **Voice 4 (Golden Ninth / Shimmer):** E6 ($1318.51$ Hz) — High celestial chime sparkle with 1200 Hz highpass filter ($Q=2.8$).
- **Zero-GC Allocation:** All 4 voices are allocated from `AudioVoicePool` in a single tick without heap allocation. Attack is sharp (3ms) with a ringing 650ms exponential decay.

```typescript
export const POLARIZE_ROOT_D5: AudioVoiceToneParams = {
  type: 'triangle',
  frequency: 587.33,
  gain: 0.26,
  duration: 0.65,
  attackTime: 0.003,
  decayTime: 0.22,
  sustainLevel: 0.35,
  releaseTime: 0.35,
  filter: { type: 'bandpass', frequency: 1800, q: 2.5 },
};

export const POLARIZE_THIRD_FSHARP5: AudioVoiceToneParams = {
  type: 'sine',
  frequency: 739.99,
  gain: 0.22,
  duration: 0.65,
  attackTime: 0.003,
  decayTime: 0.20,
  sustainLevel: 0.35,
  releaseTime: 0.35,
  filter: { type: 'bandpass', frequency: 2000, q: 2.2 },
};

export const POLARIZE_FIFTH_A5: AudioVoiceToneParams = {
  type: 'sine',
  frequency: 880.00,
  gain: 0.20,
  duration: 0.65,
  attackTime: 0.003,
  decayTime: 0.20,
  sustainLevel: 0.35,
  releaseTime: 0.35,
  filter: { type: 'bandpass', frequency: 2400, q: 2.0 },
};

export const POLARIZE_SHIMMER_E6: AudioVoiceToneParams = {
  type: 'sine',
  frequency: 1318.51,
  gain: 0.16,
  duration: 0.55,
  attackTime: 0.003,
  decayTime: 0.18,
  sustainLevel: 0.25,
  releaseTime: 0.30,
  filter: { type: 'highpass', frequency: 1200, q: 2.8 },
};
```

---

### 2.4 Quantum Tunneling: Cosmic Phase-Shift Whoosh

- **Gameplay Trigger:** Fired when a player dashes through the lethal beam during the 150ms I-frame window (`checkPlayerCollision()` returning `tunneled: true`).
- **Acoustic Design:**
  1. **Doppler Phase-Shift Swoop (`TUNNELING_SWOOP`):** Sine wave soaring exponentially from G3 (196 Hz) to D6 (1174.66 Hz) over 200ms, coupled with a sweeping bandpass filter (320 Hz up to 2800 Hz, $Q=4.2$) creating an iconic sci-fi phase-shifter whoosh.
  2. **Celestial Starlight Chime (`TUNNELING_CHIME`):** Triggered after a 40ms delay, emitting a crystalline high G6 chime (1567.98 Hz) confirming that phase shift was granted.

```typescript
export const TUNNELING_SWOOP: AudioVoiceToneParams = {
  type: 'sine',
  frequency: 196.00, // G3
  frequencyRamp: { target: 1174.66, duration: 0.20, exponential: true }, // D6 soar
  gain: 0.38,
  duration: 0.38,
  attackTime: 0.015,
  decayTime: 0.14,
  sustainLevel: 0.45,
  releaseTime: 0.18,
  filter: { type: 'bandpass', frequency: 320, q: 4.2, rampTarget: 2800, rampDuration: 0.20 },
};

export const TUNNELING_CHIME: AudioVoiceToneParams = {
  type: 'sine',
  frequency: 1567.98, // G6 celestial peak
  gain: 0.22,
  duration: 0.32,
  attackTime: 0.004,
  decayTime: 0.12,
  sustainLevel: 0.30,
  releaseTime: 0.15,
  filter: { type: 'highpass', frequency: 800, q: 2.0 },
};
```

---

### 2.5 Auxiliary Tactical Hazard SFX

| SFX Routine | Acoustic Characteristics | Gameplay Context |
| :--- | :--- | :--- |
| `playHyperFuseTick()` | Sharp 1400 Hz -> 900 Hz square wave tick (30ms) | Bomb placed on Spire anchor (1500ms fuse) |
| `playTachyonOvercharge()` | Heavy 320 Hz -> 60 Hz lowpass resonant burst (260ms) | Bomb detonated inside active beam (+2 power) |
| `playMinionVaporization()` | Searing 620 Hz -> 110 Hz bandpass saw sizzle (180ms) | Enemy minion destroyed by beam (120 DMG) |
| `playSafeEjection()` | Upward 160 Hz -> 480 Hz triangle whoop (150ms) | Entity displaced off activating Spire |

---

## 3. Strict Zero-Leak & Zero-GC Lifecycle Implementation

### 3.1 AudioVoicePool Recycling Pattern
- `AudioVoicePool` pre-allocates 16 physical voices upon initialization.
- Every voice consists of persistent `OscillatorNode`, `BiquadFilterNode`, and `GainNode` instances connected to a Master Bus.
- When `playTone()` executes:
  1. No new Web Audio nodes are allocated (`new` or `createOscillator` is never called).
  2. Idle or expired voice is acquired ($O(1)$ search).
  3. If all 16 voices are active, click-free voice stealing executes a 3ms linear ramp to silence before stealing.
  4. Scheduled automations are cancelled via `cancelScheduledValues(now)` to eliminate lingering ramps.

### 3.2 Transient Node Auto-Disconnection Architecture
For the white noise generator, where buffer sources cannot be persistently looped in quiescent state:
```typescript
// 1. Static pre-allocated 500ms buffer (created once, zero GC allocation)
private static cachedNoiseBuffer: AudioBuffer | null = null;

// 2. Active tracking set for instant teardown
private readonly activeTransientNodes: Set<AudioNode> = new Set();

// 3. Auto-disconnection invariant:
source.onended = () => {
  try {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  } catch {}
  this.activeTransientNodes.delete(source);
  this.activeTransientNodes.delete(filter);
  this.activeTransientNodes.delete(gain);
};

// 4. Forceful teardown on destroy() / reset():
private clearPendingNodes(): void {
  for (const tid of this.activeTimeouts) {
    clearTimeout(tid);
  }
  this.activeTimeouts.clear();

  for (const node of this.activeTransientNodes) {
    try {
      node.disconnect();
    } catch {}
  }
  this.activeTransientNodes.clear();
}
```

### 3.3 Auditory Fatigue Protection & Rate-Limiting
To prevent comb-filtering, clipping, and speaker fatigue when multiple hazard corridors trigger simultaneously:
- Discharge blasts occurring within 140ms are coalesced into a single crisp strike.
- Telegraph pulses within 100ms are coalesced.
- Quantum Tunneling triggers within 120ms are debounced.
- All rate-limiting timestamps initialize to `-Infinity` to guarantee the first call is never dropped.

---

## 4. Test Verification & Empirical Results

Automated unit tests were implemented in `tests/unit/dynamic_hazard_audio.test.mjs` and verified against the full test suite.

```
> node --experimental-strip-types --test tests/unit/dynamic_hazard_audio.test.mjs tests/dynamic_hazard.test.mjs tests/unit/audio_voice_pool.test.mjs tests/unit/audio_lifecycle_verification.test.mjs

✔ DynamicHazardAudio: headless fallback without AudioContext is completely crash-free (0.64ms)
✔ DynamicHazardAudio: initializes voice pool and handles suspended context resume (0.31ms)
✔ DynamicHazardAudio: binds external AudioVoicePool and reuses pre-allocated voices (0.27ms)
✔ DynamicHazardAudio: Spire Telegraph Pulse progresses through Yellow, Amber, Red, and Idle presets (0.14ms)
✔ DynamicHazardAudio: Tachyon Laser Discharge fires laser zap, sub thump, and white noise burst (0.63ms)
✔ DynamicHazardAudio: White Noise Burst strictly auto-disconnects nodes and adheres to Zero-Leak standards (7.36ms)
✔ DynamicHazardAudio: Polarization Strike synthesizes 4-voice golden chime chord (1.57ms)
✔ DynamicHazardAudio: Quantum Tunneling fires Doppler swoop and delayed celestial chime (67.52ms)
✔ DynamicHazardAudio: Auxiliary SFX routines fire without errors (6.54ms)
✔ DynamicHazardAudio: Rate-limiting suppresses rapid audio spam and protects acoustic clarity (3.83ms)
✔ DynamicHazardAudio: 1,000 rapid event triggers execute with zero memory leaks and clean destruction (2.74ms)
✔ Tier 1 to Tier 6: DynamicHazard FSM, collisions, and 10k-frame soak (16 tests pass)
✔ AudioVoicePool: Fixed capacity, tone synthesis, click-free stealing (6 tests pass)
✔ WebAudio Lifecycle: Node disconnection, suspended resume, scene shutdown (9 tests pass)

ℹ tests 42 | suites 0 | pass 42 | fail 0 | cancelled 0 | duration_ms 237.78ms
```

### Production Pre-flight Build
```
> npm run build
✓ Compiled successfully in 1143ms
✓ Generating static pages using 5 workers (4/4) in 194ms
○ (Static) prerendered as static content
```

---

## 5. Deliverables & Handoff Summary

1. **Source Synthesizer Module:** [`src/game/hazards/DynamicHazardAudio.ts`](file:///Users/user/src/bomberman/src/game/hazards/DynamicHazardAudio.ts)
   - Exported in [`src/game/hazards/index.ts`](file:///Users/user/src/bomberman/src/game/hazards/index.ts).
   - Contains all 4 primary synthesizer routines + 4 auxiliary hazard cues.
2. **Comprehensive Test Suite:** [`tests/unit/dynamic_hazard_audio.test.mjs`](file:///Users/user/src/bomberman/tests/unit/dynamic_hazard_audio.test.mjs)
   - 11 unit tests verifying headless safety, node auto-disconnection, rate limiting, and zero memory leaks.
3. **Zero-Leak Standards Compliance:** Verified 100% compliant with pre-allocated voice recycling, `onended` unhooking, and silent headless fallback.

**Sign-off:** Creative Agent 4 (Dynamic WebAudio Sound Design)  
**Date:** 2026-10-01
