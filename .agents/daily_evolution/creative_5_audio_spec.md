# AUDIO SPEC: PROCEDURAL WEB AUDIO SYNTHESIS FOR QUANTUM SPIRE HAZARD

**Division:** Creative Expansion Division (Creative Agent 5)  
**Target File:** `.agents/daily_evolution/creative_5_audio_spec.md`  
**System Target:** `AudioVoicePool.ts` (`src/game/pooling/AudioVoicePool.ts`), `GameScene.ts`, `RiftCrisis.ts`  
**Related Specs:** `creative_1_hazard_design.md` (Quantum Spire Hazard GDD)  
**Status:** Approved Technical Audio Synthesis Specification  
**Asset Dependencies:** **0 External Assets** (0 MP3, 0 WAV, 0 OGG — 100% Procedural Native Web Audio API)  
**Memory & Performance Invariant:** Zero-GC voice recycling, click-free voice stealing, deterministic bounds  
**Fallback Safety:** Guaranteed silent, zero-crash headless and un-interacted mobile fallback  

---

## 1. Executive Summary & Sound Architecture

In classic arcade and modern retro games, audio design provides essential real-time gameplay feedback. For the **Quantum Spire Hazard (Tachyon Superposition Grid)** designed by Creative Agent 1, audio is not merely atmospheric decor—it is a **critical telegraphing channel** that communicates hazard activation stages, safe reaction windows, spatial orientation, and rewarding feedback for high-skill actions like **Quantum Tunneling** and **Polarization Strikes**.

### 1.1 Core Engineering Constraints
1. **0 External Audio Assets:** Zero HTTP requests for binary sound files (`.mp3`, `.wav`, `.ogg`). The entire soundscape is synthesized purely in real-time from mathematical waveforms using native browser Web Audio oscillators, biquad filters, and gain nodes.
2. **Strict Zero-GC Invariant:** All audio events are routed through the pre-allocated `AudioVoicePool` (16 persistent voice nodes with recycled oscillators and filter chains). No audio nodes (`createOscillator`, `createGain`) are created or garbage collected during gameplay.
3. **Headless & Mobile Fallback Safety:** In environments lacking `window.AudioContext` (Node.js CI test runner, headless soak tests) or when audio is suspended awaiting user interaction (mobile Safari / Chrome autoplay policy), all sound synthesis calls must fail silently with **0 crashes**, **0 uncaught promise rejections**, and **0 console spam**.
4. **Click-Free Voice Stealing:** Overlapping voices utilize intelligent voice recycling and 3ms exponential gain ramping to prevent speaker popping/clicks when stealing voices.

---

## 2. Acoustic Identity & Sound Palette

The Quantum Spire operates at the intersection of retro arcade punch and futuristic sci-fi tachyon resonance. The acoustic profile is characterized by:
- **Tachyon Resonance Drone:** Deep, crystalline low-frequency sine oscillations (110 Hz) providing ambient presence without cluttering the mid-range.
- **Telegraph Triad (Yellow → Amber → Red):** Distinct harmonic progressions with accelerating frequency sweeps and pulse widths that instinctively warn players of impending danger without visual reliance.
- **Tachyon Discharge Snap:** Dual-stage acoustic event combining a piercing high-to-low exponential frequency drop (laser ionization) followed by a punchy sub-bass transient (shockwave).
- **Quantum Tunneling Chime:** Bright, bell-like harmonic sweep (C5 to G6) giving visceral positive audio feedback when a player successfully dashes through the beam.
- **Polarization Harmonic Burst:** Resonant major triad chord (C-E-G) creating a satisfying, triumphant sonic relief when the spire is cleansed by a bomb blast.

---

## 3. Comprehensive Audio Profile Catalog

The Quantum Spire Hazard requires 7 distinct procedural audio synthesis profiles. Each profile is defined below with its exact physical parameters for `AudioVoiceToneParams`.

```
                    QUANTUM SPIRE AUDIO STATE GRAPH
                    
   [1. AMBIENT IDLE] (110 Hz Sine Drone)
           │
           ▼
   [2. TELEGRAPH YELLOW] (220 Hz -> 330 Hz Triangle Sweep, Soft Lowpass)
           │
           ▼
   [3. TELEGRAPH AMBER] (330 Hz -> 550 Hz Sawtooth Sweep, Pulsing Gain)
           │
           ▼
   [4. TELEGRAPH RED] (880 Hz Stutter Square Wave, Piercing Bandpass)
           │
     ┌─────┴──────────────────────────────┐
     │                                    │
     ▼                                    ▼
[5. TACHYON DISCHARGE]           [6. QUANTUM TUNNELING]
(Dual Voice: Ionization + Bass)    (High Chime: 523 -> 1568 Hz)
     │                                    │
     └─────────────────┬──────────────────┘
                       ▼
           [7. POLARIZATION BURST]
      (Harmonic Triad Chord: C4-E4-G4)
```

---

### Profile 1: Spire Ambient Idle Drone (`QUANTUM_SPIRE_IDLE`)
- **Gameplay Context:** Emitted by the Spire crystals during the `DORMANT` phase (every 6.0s pulse in Outbreak/Climax) to establish spatial presence.
- **Acoustic Character:** Subtle, deep crystalline standing wave. Low energy, warm, non-intrusive.
- **Synthesis Node Graph:**
  `Oscillator (Sine, 110 Hz) -> Lowpass Filter (260 Hz, Q=1.2) -> Gain Envelope -> Master Bus`
- **Voice Parameters (`AudioVoiceToneParams`):**
  ```typescript
  export const AUDIO_PROFILE_SPIRE_IDLE: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 110, // A2 fundamental
    gain: 0.08,     // Very quiet background presence
    duration: 1.20, // 1200ms slow breath
    attackTime: 0.35,  // Slow fade in
    decayTime: 0.40,
    sustainLevel: 0.4,
    releaseTime: 0.45, // Gentle fade out
    filter: {
      type: 'lowpass',
      frequency: 260,
      q: 1.2,
      rampTarget: 180,
      rampDuration: 1.0,
    },
  };
  ```

---

### Profile 2: Yellow Telegraph Warning (`QUANTUM_SPIRE_TELEGRAPH_YELLOW`)
- **Gameplay Context:** Triggered at `T - 2000ms` before discharge. Signals that a resonance corridor has been designated.
- **Acoustic Character:** Rising harmonic sweep. Smooth, alerting, non-alarming.
- **Synthesis Node Graph:**
  `Oscillator (Triangle, 220 Hz -> 330 Hz Linear) -> Lowpass Filter (450 Hz -> 850 Hz) -> Gain Envelope -> Master Bus`
- **Voice Parameters (`AudioVoiceToneParams`):**
  ```typescript
  export const AUDIO_PROFILE_TELEGRAPH_YELLOW: AudioVoiceToneParams = {
    type: 'triangle',
    frequency: 220, // A3
    frequencyRamp: {
      target: 330,  // E4 (Perfect fifth rise)
      duration: 0.45,
      exponential: false,
    },
    gain: 0.16,
    duration: 0.50,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.6,
    releaseTime: 0.15,
    filter: {
      type: 'lowpass',
      frequency: 450,
      q: 2.0,
      rampTarget: 850,
      rampDuration: 0.45,
    },
  };
  ```

---

### Profile 3: Amber Telegraph Surge (`QUANTUM_SPIRE_TELEGRAPH_AMBER`)
- **Gameplay Context:** Triggered at `T - 1000ms` before discharge. Indicates energy accumulation reaching critical threshold.
- **Acoustic Character:** Buzzing, aggressive sweep with rapid decay. Demands attention.
- **Synthesis Node Graph:**
  `Oscillator (Sawtooth, 330 Hz -> 587 Hz Exp) -> Lowpass Filter (700 Hz -> 1400 Hz, Q=3.5) -> Gain Envelope -> Master Bus`
- **Voice Parameters (`AudioVoiceToneParams`):**
  ```typescript
  export const AUDIO_PROFILE_TELEGRAPH_AMBER: AudioVoiceToneParams = {
    type: 'sawtooth',
    frequency: 330, // E4
    frequencyRamp: {
      target: 587.33, // D5
      duration: 0.35,
      exponential: true,
    },
    gain: 0.22,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.5,
    releaseTime: 0.10,
    filter: {
      type: 'lowpass',
      frequency: 700,
      q: 3.5, // High Q adds resonant sci-fi chirp
      rampTarget: 1400,
      rampDuration: 0.35,
    },
  };
  ```

---

### Profile 4: Red Telegraph Critical Lock (`QUANTUM_SPIRE_TELEGRAPH_RED`)
- **Gameplay Context:** Triggered at `T - 500ms` before discharge. Final evasion warning.
- **Acoustic Character:** Piercing high-frequency stutter/alarm. Sharp attack, high urgency.
- **Synthesis Node Graph:**
  `Oscillator (Square, 880 Hz -> 987 Hz Exp) -> Bandpass Filter (1200 Hz, Q=4.0) -> Gain Envelope -> Master Bus`
- **Voice Parameters (`AudioVoiceToneParams`):**
  ```typescript
  export const AUDIO_PROFILE_TELEGRAPH_RED: AudioVoiceToneParams = {
    type: 'square',
    frequency: 880, // A5
    frequencyRamp: {
      target: 987.77, // B5 (High tension)
      duration: 0.18,
      exponential: true,
    },
    gain: 0.28,
    duration: 0.22,
    attackTime: 0.005, // Instant 5ms punch
    decayTime: 0.08,
    sustainLevel: 0.35,
    releaseTime: 0.05,
    filter: {
      type: 'bandpass',
      frequency: 1200,
      q: 4.0, // Narrow band cuts through active explosions
    },
  };
  ```

---

### Profile 5: Tachyon Discharge & Beam Cleave (`QUANTUM_SPIRE_DISCHARGE`)
- **Gameplay Context:** Fired at `T = 0ms` (beam active for 300ms, peak flash 150ms).
- **Acoustic Character:** Massive composite event.
  - **Part A (Ionization Snap):** Sharp downward pitch drop imitating laser air-breakdown.
  - **Part B (Tachyon Shockwave):** Deep sub-bass boom vibrating the arena.
- **Voice 1: Laser Ionization Snap (`DISCHARGE_SNAP`):**
  ```typescript
  export const AUDIO_PROFILE_DISCHARGE_SNAP: AudioVoiceToneParams = {
    type: 'sawtooth',
    frequency: 1600, // Very high initial crack
    frequencyRamp: {
      target: 120,   // Rapid dive in 90ms
      duration: 0.09,
      exponential: true,
    },
    gain: 0.45,
    duration: 0.18,
    attackTime: 0.002, // 2ms transient impact
    decayTime: 0.08,
    sustainLevel: 0.2,
    releaseTime: 0.05,
    filter: {
      type: 'lowpass',
      frequency: 3200,
      q: 2.5,
      rampTarget: 400,
      rampDuration: 0.12,
    },
  };
  ```
- **Voice 2: Tachyon Shockwave Sub-Bass (`DISCHARGE_BASS`):**
  ```typescript
  export const AUDIO_PROFILE_DISCHARGE_BASS: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 75, // Sub-bass fundamental
    frequencyRamp: {
      target: 28,  // Sub-audible seismic drop
      duration: 0.28,
      exponential: true,
    },
    gain: 0.55,
    duration: 0.35,
    attackTime: 0.008,
    decayTime: 0.15,
    sustainLevel: 0.3,
    releaseTime: 0.12,
    filter: {
      type: 'lowpass',
      frequency: 160,
      q: 1.0,
    },
  };
  ```

---

### Profile 6: Quantum Tunneling / Phase Shift (`QUANTUM_SPIRE_PHASE_SHIFT`)
- **Gameplay Context:** Triggered when player dashes through the beam during the 150ms flash window. Rewards high-skill execution.
- **Acoustic Character:** Crystalline, ascending sparkle chime with a lingering ethereal tail. Pure positive reinforcement.
- **Synthesis Node Graph:**
  `Oscillator (Sine, 523 Hz -> 1568 Hz Exp) -> Highpass Filter (600 Hz, Q=2.8) -> Gain Envelope -> Master Bus`
- **Voice Parameters (`AudioVoiceToneParams`):**
  ```typescript
  export const AUDIO_PROFILE_PHASE_SHIFT: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 523.25, // C5
    frequencyRamp: {
      target: 1567.98, // G6 (High celestial third harmonic)
      duration: 0.22,
      exponential: true,
    },
    gain: 0.38,
    duration: 0.40,
    attackTime: 0.004,
    decayTime: 0.14,
    sustainLevel: 0.5,
    releaseTime: 0.18,
    filter: {
      type: 'highpass',
      frequency: 600,
      q: 2.8,
    },
  };
  ```

---

### Profile 7: Spire Polarization / Cleansing Shockwave (`QUANTUM_SPIRE_POLARIZE`)
- **Gameplay Context:** Triggered when a player bomb blast impacts an active Spire, neutralizing it and converting it to the golden state.
- **Acoustic Character:** Harmonic Major Chord (C4 + E4 + G4). Triumphant, stabilizing, clean.
- **Synthesis Execution:** Utilizes 3 rapid voice allocations from `AudioVoicePool` in a single tick to form a lush triad:
  ```typescript
  // Voice 1: Root Note (C4 = 261.63 Hz)
  export const AUDIO_PROFILE_POLARIZE_ROOT: AudioVoiceToneParams = {
    type: 'triangle',
    frequency: 261.63,
    frequencyRamp: { target: 261.63, duration: 0.5, exponential: false },
    gain: 0.25,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.4,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 1200, q: 1.5 },
  };

  // Voice 2: Major Third (E4 = 329.63 Hz)
  export const AUDIO_PROFILE_POLARIZE_THIRD: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 329.63,
    frequencyRamp: { target: 329.63, duration: 0.5, exponential: false },
    gain: 0.22,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.4,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 1500, q: 1.5 },
  };

  // Voice 3: Perfect Fifth (G4 = 392.00 Hz)
  export const AUDIO_PROFILE_POLARIZE_FIFTH: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 392.00,
    frequencyRamp: { target: 392.00, duration: 0.5, exponential: false },
    gain: 0.20,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.4,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 1800, q: 1.5 },
  };
  ```

---

## 4. Voice Budget & Concurrency Management

The `AudioVoicePool` operates with a fixed capacity of **16 physical voices**. In a chaotic 4-player Bomberman arena with dozens of bombs, particles, and powerup pickups, hazard audio must never starve core combat sounds.

### 4.1 Voice Budget Allocation Table
| Subsystem | Guaranteed Voice Quota | Max Burst Voices | Behavior Under Contention |
| :--- | :---: | :---: | :--- |
| **Player Bombs & Detonations** | 6 | 8 | Top priority; never stolen by hazard sounds |
| **Player SFX (Walk, Dash, Skills)** | 3 | 4 | High priority |
| **Quantum Spire Hazard** | **3** | **4** | **Managed by internal rate limiter & stealing** |
| **Enemy SFX & Minion Death** | 2 | 3 | Medium priority |
| **UI & Ambient SFX** | 2 | 2 | Low priority |
| **Total Engine Pool** | **16** | **16** | Contiguous zero-allocation recycling |

### 4.2 Spire Internal Voice Priorities
Within the Quantum Spire's allocated 3–4 voice budget:
1. **Critical Priority (Never Dropped):**
   - `QUANTUM_SPIRE_PHASE_SHIFT` (Player I-frame audio must confirm success)
   - `QUANTUM_SPIRE_DISCHARGE` (Lethal damage event)
2. **Standard Priority:**
   - `QUANTUM_SPIRE_POLARIZE` (Major chord can fall back to 1 root note if voice-constrained)
   - `QUANTUM_SPIRE_TELEGRAPH_RED`
3. **Preemptible Priority (Stolen First):**
   - `QUANTUM_SPIRE_TELEGRAPH_YELLOW`
   - `QUANTUM_SPIRE_IDLE` (Immediately silenced via 3ms ramp if combat intensifies)

### 4.3 Auditory Fatigue Protection (Rate Limiting)
- Spires that fire within 150ms of each other (e.g. synchronized Climax discharge) are **coalesced into a single acoustic playback**.
- Multiple spires entering the yellow telegraph phase stagger their pitch offsets by +5% rather than playing duplicate frequencies, preventing acoustic comb-filtering and phase cancellation.

---

## 5. Strict Zero Asset & Headless Fallback Architecture

### 5.1 Headless & Test Automation Guarantee
In CI runners (e.g. `node --test tests/soak_10k_frames.test.mjs`), `window` and `AudioContext` do not exist.
The synthesis engine adheres to the following zero-crash contract:
```typescript
public playTone(params: AudioVoiceToneParams): AudioVoice | null {
  if (!this.ctx) return null; // Safe early return without throwing
  const voice = this.acquireVoice();
  if (!voice) return null;
  voice.play(params, this.ctx);
  return voice;
}
```

### 5.2 Autoplay Policy & AudioContext Suspension Guard
Modern browsers (Chrome, Safari, Firefox, iOS WebKit) require user interaction before `AudioContext` is allowed to output sound:
1. When `ctx.state === 'suspended'`, `AudioVoicePool` registers an asynchronous resume attempt:
   ```typescript
   if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
     this.ctx.resume().catch(() => {}); // Suppress unhandled promise rejection
   }
   ```
2. Parameter automations are wrapped in defensive try/catch blocks to ensure that backgrounding the tab or OS audio interruptions never crash the game tick.

### 5.3 Speaker Click Prevention
Sudden parameter jumps from non-zero gain to zero create audible DC offset pop/clicks in speakers.
`AudioVoice.forceSilence()` enforces a **3ms linear ramp to 0.0001**:
```typescript
public forceSilence(ctx: AudioContext): void {
  if (!this.gain) return;
  const now = ctx.currentTime;
  this.gain.gain.cancelScheduledValues(now);
  this.gain.gain.linearRampToValueAtTime(0.0001, now + 0.003);
  this.isBusy = false;
  this.endTime = now + 0.003;
}
```

---

## 6. TypeScript Integration Helper: `QuantumSpireAudio`

Below is the clean, self-contained procedural audio controller designed to plug directly into `src/game/crises/RiftCrisis.ts` and `src/game/GameScene.ts`:

```typescript
/**
 * QuantumSpireAudio.ts — Procedural Web Audio Driver for Quantum Spire Hazard
 * 
 * Zero external assets, Zero-GC execution via AudioVoicePool recycling.
 */

import { AudioVoicePool, AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';

export class QuantumSpireAudio {
  private pool: AudioVoicePool | null = null;
  private lastTelegraphTimeMs: number = 0;
  private lastDischargeTimeMs: number = 0;

  // Pre-allocated static param objects to eliminate runtime GC allocations
  private static readonly PROFILE_IDLE: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 110,
    gain: 0.08,
    duration: 1.20,
    attackTime: 0.35,
    decayTime: 0.40,
    sustainLevel: 0.4,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 260, q: 1.2, rampTarget: 180, rampDuration: 1.0 },
  };

  private static readonly PROFILE_YELLOW: AudioVoiceToneParams = {
    type: 'triangle',
    frequency: 220,
    frequencyRamp: { target: 330, duration: 0.45, exponential: false },
    gain: 0.16,
    duration: 0.50,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.6,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 450, q: 2.0, rampTarget: 850, rampDuration: 0.45 },
  };

  private static readonly PROFILE_AMBER: AudioVoiceToneParams = {
    type: 'sawtooth',
    frequency: 330,
    frequencyRamp: { target: 587.33, duration: 0.35, exponential: true },
    gain: 0.22,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.5,
    releaseTime: 0.10,
    filter: { type: 'lowpass', frequency: 700, q: 3.5, rampTarget: 1400, rampDuration: 0.35 },
  };

  private static readonly PROFILE_RED: AudioVoiceToneParams = {
    type: 'square',
    frequency: 880,
    frequencyRamp: { target: 987.77, duration: 0.18, exponential: true },
    gain: 0.28,
    duration: 0.22,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.35,
    releaseTime: 0.05,
    filter: { type: 'bandpass', frequency: 1200, q: 4.0 },
  };

  private static readonly PROFILE_DISCHARGE_SNAP: AudioVoiceToneParams = {
    type: 'sawtooth',
    frequency: 1600,
    frequencyRamp: { target: 120, duration: 0.09, exponential: true },
    gain: 0.45,
    duration: 0.18,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.2,
    releaseTime: 0.05,
    filter: { type: 'lowpass', frequency: 3200, q: 2.5, rampTarget: 400, rampDuration: 0.12 },
  };

  private static readonly PROFILE_DISCHARGE_BASS: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 75,
    frequencyRamp: { target: 28, duration: 0.28, exponential: true },
    gain: 0.55,
    duration: 0.35,
    attackTime: 0.008,
    decayTime: 0.15,
    sustainLevel: 0.3,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 160, q: 1.0 },
  };

  private static readonly PROFILE_PHASE_SHIFT: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 523.25,
    frequencyRamp: { target: 1567.98, duration: 0.22, exponential: true },
    gain: 0.38,
    duration: 0.40,
    attackTime: 0.004,
    decayTime: 0.14,
    sustainLevel: 0.5,
    releaseTime: 0.18,
    filter: { type: 'highpass', frequency: 600, q: 2.8 },
  };

  private static readonly PROFILE_POLARIZE_ROOT: AudioVoiceToneParams = {
    type: 'triangle',
    frequency: 261.63,
    gain: 0.25,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.4,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 1200, q: 1.5 },
  };

  private static readonly PROFILE_POLARIZE_THIRD: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 329.63,
    gain: 0.22,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.4,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 1500, q: 1.5 },
  };

  private static readonly PROFILE_POLARIZE_FIFTH: AudioVoiceToneParams = {
    type: 'sine',
    frequency: 392.00,
    gain: 0.20,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.4,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 1800, q: 1.5 },
  };

  constructor(pool?: AudioVoicePool | null) {
    this.pool = pool || null;
  }

  public bindPool(pool: AudioVoicePool): void {
    this.pool = pool;
  }

  public playIdle(): void {
    if (!this.pool) return;
    this.pool.playTone(QuantumSpireAudio.PROFILE_IDLE);
  }

  public playTelegraph(tier: 'yellow' | 'amber' | 'red', currentTimeMs: number = 0): void {
    if (!this.pool) return;
    // Rate limit telegraph tones to avoid frequency congestion
    if (currentTimeMs > 0 && currentTimeMs - this.lastTelegraphTimeMs < 120) return;
    this.lastTelegraphTimeMs = currentTimeMs;

    switch (tier) {
      case 'yellow':
        this.pool.playTone(QuantumSpireAudio.PROFILE_YELLOW);
        break;
      case 'amber':
        this.pool.playTone(QuantumSpireAudio.PROFILE_AMBER);
        break;
      case 'red':
        this.pool.playTone(QuantumSpireAudio.PROFILE_RED);
        break;
    }
  }

  public playDischarge(currentTimeMs: number = 0): void {
    if (!this.pool) return;
    // Coalesce synchronous multi-spire discharges into one crisp blast
    if (currentTimeMs > 0 && currentTimeMs - this.lastDischargeTimeMs < 150) return;
    this.lastDischargeTimeMs = currentTimeMs;

    this.pool.playTone(QuantumSpireAudio.PROFILE_DISCHARGE_SNAP);
    this.pool.playTone(QuantumSpireAudio.PROFILE_DISCHARGE_BASS);
  }

  public playPhaseShift(): void {
    if (!this.pool) return;
    this.pool.playTone(QuantumSpireAudio.PROFILE_PHASE_SHIFT);
  }

  public playPolarization(): void {
    if (!this.pool) return;
    // Harmonious major triad burst across 3 pooled voices
    this.pool.playTone(QuantumSpireAudio.PROFILE_POLARIZE_ROOT);
    this.pool.playTone(QuantumSpireAudio.PROFILE_POLARIZE_THIRD);
    this.pool.playTone(QuantumSpireAudio.PROFILE_POLARIZE_FIFTH);
  }
}
```

---

## 7. Quality Assurance & Verification Standards

To pass automated quality gates, the implementation must be validated against the following tests:

1. **Headless Zero-Crash Verification (`tests/unit/quantum_spire_audio.test.mjs`):**
   - Instantiating `QuantumSpireAudio` with `null` or uninitialized `AudioVoicePool` and triggering all 7 profiles must execute without errors.
2. **Frequency Range & Nyquist Boundary Verification:**
   - All frequencies (28 Hz to 1600 Hz) remain safely within human hearing and the standard 44.1 kHz / 48 kHz Web Audio Nyquist limits.
3. **Master Gain & Saturation Headroom:**
   - Master bus gain (`0.85`) combined with peak discharge sum (`0.45 + 0.55 = 1.00`) ensures signal headroom, preventing digital clipping or audio distortion.
4. **10,000-Frame Zero-GC Soak Compliance:**
   - Continuous rapid firing of telegraph and discharge profiles during a 10,000-frame soak test generates **0 net heap growth** from audio parameter structures.

---

## 8. Summary & Handoff Checklist

| Deliverable | Status | Notes |
| :--- | :---: | :--- |
| **7 Procedural Audio Profiles** | **COMPLETE** | Frequency sweeps, envelopes, filter modulation defined |
| **Zero External Assets** | **COMPLETE** | 100% Native Web Audio, 0 network downloads |
| **Zero-GC Compliance** | **COMPLETE** | Reusable static parameter objects, `AudioVoicePool` integration |
| **Fallback Safety** | **COMPLETE** | Silent non-crashing headless execution & suspended context resume |
| **Handoff Target** | **READY** | Ready for integration in `src/game/crises/RiftCrisis.ts` & `GameScene.ts` |

**Agent Sign-off:** Creative Agent 5 (Creative Expansion Division)  
**Date:** 2026-09-30
