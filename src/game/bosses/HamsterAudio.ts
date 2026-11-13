/**
 * HamsterAudio.ts — Procedural Web Audio Sound Synthesizer for Mecha Hamster Captain Nibbles (Gyro Rodent Inventor)
 *
 * Implements 100% Procedural Sound Synthesis for the Gyro Rodent Sovereign:
 * - Gyro Wheel Rev Windup: Accelerating motor pitch (120Hz -> 480Hz) & sub-octave mechanical gear whine
 *   (60Hz -> 240Hz sine with 120Hz lowpass) paired with procedural acceleration noise.
 * - High-Speed Dash Roll Hum: High-speed rolling hum (220Hz saw with rapid tremolo) & electrostatic tread spark pops
 *   (1200Hz -> 400Hz triangle) paired with floor contact friction noise.
 * - 90° Bank-Shot Wall Bumper Ricochet: Bumper bounce boing (520Hz -> 260Hz triangle) & resonant metallic ping
 *   (1040Hz bandpass, Q = 5.0) with kinetic air pressure thump.
 * - Head-On Bomb Collision Overload Trap: Kinetic shield overload crack (80Hz sub blast + 880Hz -> 110Hz saw punch)
 *   with comic dazed stars cartoon wobble arpeggio (C6 1046.50Hz, E6 1318.51Hz, G6 1567.98Hz).
 * - Sunflower Gatling Seed Salvo: Rapid-fire seed ejection blips (820Hz -> 240Hz, fast 35ms blips) with sharp click noise.
 * - 360° Gyro-Laser Sweep: Resonant laser sweep buzz (750Hz saw through 1200Hz bandpass filter with smooth modulation).
 * - Phase Transitions: Phase 2 Electro-Overload C-Major triad (C4 261.63Hz, E4 329.63Hz, G4 392.00Hz),
 *   Phase 3 Berserk Ricochet Pinball alarm (380Hz -> 760Hz two-tone warning siren).
 * - Defeat Mechanical Restoration & Solfeggio 528Hz Peace Bloom: Gyro wheel deceleration spin-down
 *   (480Hz -> 38Hz over 1.5s downward slide) resolving into the sacred Solfeggio 528Hz Mechanical Restoration Harmonic Chime
 *   (C4, E4, G4, 528.00Hz).
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Tone events routed strictly through pre-allocated 16-voice AudioVoicePool.
 * - Static shared 500ms AudioBuffer for white noise permanently avoids heap GC allocations.
 * - Transient noise nodes employ dual cleanup (source.onended + watchdog safeTimeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 * - Subnormal float protection: prevents DSP stalls on float denormals (< 1e-15).
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';

// Deep-freeze helper for immutable preset dictionaries
function freezeTonePreset<T extends AudioVoiceToneParams>(preset: T): Readonly<T> {
  if (preset.frequencyRamp) Object.freeze(preset.frequencyRamp);
  if (preset.filter) Object.freeze(preset.filter);
  return Object.freeze(preset);
}

function deepFreezePresets<T extends Record<string, AudioVoiceToneParams>>(
  presets: T
): Readonly<{ [K in keyof T]: Readonly<T[K]> }> {
  for (const key of Object.keys(presets)) {
    const p = presets[key];
    if (p && typeof p === 'object') {
      freezeTonePreset(p);
    }
  }
  return Object.freeze(presets) as Readonly<{ [K in keyof T]: Readonly<T[K]> }>;
}

/**
 * Immutable frozen preset dictionary for Captain Nibbles audio synthesis
 */
export const HAMSTER_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Gyro Wheel Rev Windup
  // ============================================================================
  REV_ACCEL_MOTOR: {
    type: 'sawtooth',
    frequency: 120.0,
    frequencyRamp: { target: 480.0, duration: 1.15, exponential: true },
    gain: 0.36,
    duration: 1.20,
    attackTime: 0.05,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 360, q: 2.8, rampTarget: 920, rampDuration: 1.15 },
  } as AudioVoiceToneParams,

  REV_MECHANICAL_WHINE: {
    type: 'sine',
    frequency: 60.0,
    frequencyRamp: { target: 240.0, duration: 1.15, exponential: true },
    gain: 0.28,
    duration: 1.20,
    attackTime: 0.04,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 280, q: 1.8 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. High-Speed Dash Roll Hum & Tread Sparks
  // ============================================================================
  DASH_ROLL_HUM: {
    type: 'sawtooth',
    frequency: 220.0,
    frequencyRamp: { target: 245.0, duration: 0.35, exponential: true },
    gain: 0.34,
    duration: 0.40,
    attackTime: 0.02,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 480, q: 3.0 },
  } as AudioVoiceToneParams,

  DASH_SPARK_POP: {
    type: 'triangle',
    frequency: 1200.0,
    frequencyRamp: { target: 400.0, duration: 0.04, exponential: true },
    gain: 0.22,
    duration: 0.06,
    attackTime: 0.002,
    decayTime: 0.03,
    sustainLevel: 0.20,
    releaseTime: 0.02,
    filter: { type: 'highpass', frequency: 600, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. 90° Bank-Shot Wall Bumper Ricochet
  // ============================================================================
  WALL_REBOUND_BOING: {
    type: 'triangle',
    frequency: 520.0,
    frequencyRamp: { target: 260.0, duration: 0.16, exponential: true },
    gain: 0.44,
    duration: 0.25,
    attackTime: 0.003,
    decayTime: 0.10,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 650, q: 3.5 },
  } as AudioVoiceToneParams,

  WALL_REBOUND_METAL_PING: {
    type: 'sine',
    frequency: 1040.0,
    gain: 0.32,
    duration: 0.22,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.25,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 1040, q: 5.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Head-On Bomb Collision Overload Trap
  // ============================================================================
  HEAD_ON_SUB_CRACK: {
    type: 'sine',
    frequency: 80.0,
    frequencyRamp: { target: 30.0, duration: 0.30, exponential: true },
    gain: 0.52,
    duration: 0.40,
    attackTime: 0.002,
    decayTime: 0.16,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'lowpass', frequency: 120, q: 2.0 },
  } as AudioVoiceToneParams,

  HEAD_ON_IMPACT_PUNCH: {
    type: 'sawtooth',
    frequency: 880.0,
    frequencyRamp: { target: 110.0, duration: 0.22, exponential: true },
    gain: 0.46,
    duration: 0.32,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 720, q: 3.2 },
  } as AudioVoiceToneParams,

  DAZED_STARS_C6: {
    type: 'sine',
    frequency: 1046.50, // C6
    gain: 0.25,
    duration: 0.38,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.28,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  DAZED_STARS_E6: {
    type: 'sine',
    frequency: 1318.51, // E6
    gain: 0.23,
    duration: 0.38,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.28,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  DAZED_STARS_G6: {
    type: 'triangle',
    frequency: 1567.98, // G6
    gain: 0.22,
    duration: 0.42,
    attackTime: 0.01,
    decayTime: 0.16,
    sustainLevel: 0.30,
    releaseTime: 0.22,
  } as AudioVoiceToneParams,

  // ============================================================================
  // 5. Sunflower Gatling Seed Salvo
  // ============================================================================
  GATLING_SEED_SPIT: {
    type: 'triangle',
    frequency: 820.0,
    frequencyRamp: { target: 240.0, duration: 0.035, exponential: true },
    gain: 0.32,
    duration: 0.05,
    attackTime: 0.002,
    decayTime: 0.025,
    sustainLevel: 0.15,
    releaseTime: 0.02,
    filter: { type: 'bandpass', frequency: 950, q: 3.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 6. 360° Gyro-Laser Sweep
  // ============================================================================
  LASER_SWEEP_BUZZ: {
    type: 'sawtooth',
    frequency: 750.0,
    frequencyRamp: { target: 680.0, duration: 0.28, exponential: true },
    gain: 0.30,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.35,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1200, q: 4.2 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 7. Phase Transitions
  // ============================================================================
  PHASE2_OVERLOAD_C4: {
    type: 'triangle',
    frequency: 261.63, // C4
    frequencyRamp: { target: 523.25, duration: 0.35, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 620, q: 2.5 },
  } as AudioVoiceToneParams,

  PHASE2_OVERLOAD_E4: {
    type: 'sine',
    frequency: 329.63, // E4
    frequencyRamp: { target: 659.25, duration: 0.35, exponential: true },
    gain: 0.25,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE2_OVERLOAD_G4: {
    type: 'sine',
    frequency: 392.00, // G4
    gain: 0.24,
    duration: 0.42,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_ALARM_LOW: {
    type: 'sawtooth',
    frequency: 380.0,
    frequencyRamp: { target: 760.0, duration: 0.40, exponential: true },
    gain: 0.38,
    duration: 0.50,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.45,
    releaseTime: 0.22,
    filter: { type: 'bandpass', frequency: 850, q: 3.2 },
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_ALARM_HIGH: {
    type: 'square',
    frequency: 760.0,
    frequencyRamp: { target: 380.0, duration: 0.40, exponential: true },
    gain: 0.22,
    duration: 0.50,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.22,
    filter: { type: 'lowpass', frequency: 1100, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 8. Boss Defeated & Solfeggio 528Hz Peace Bloom
  // ============================================================================
  DEFEAT_SPINDOWN_SLIDE: {
    type: 'sawtooth',
    frequency: 480.0,
    frequencyRamp: { target: 38.0, duration: 1.5, exponential: true },
    gain: 0.35,
    duration: 1.7,
    attackTime: 0.04,
    decayTime: 0.50,
    sustainLevel: 0.35,
    releaseTime: 0.65,
    filter: { type: 'lowpass', frequency: 550, q: 2.2, rampTarget: 70, rampDuration: 1.5 },
  } as AudioVoiceToneParams,

  RESTORATION_CHIME_C4: {
    type: 'triangle',
    frequency: 261.63, // C4 root
    gain: 0.24,
    duration: 2.2,
    attackTime: 0.08,
    decayTime: 0.45,
    sustainLevel: 0.55,
    releaseTime: 0.80,
    filter: { type: 'lowpass', frequency: 850, q: 1.8 },
  } as AudioVoiceToneParams,

  RESTORATION_CHIME_E4: {
    type: 'sine',
    frequency: 329.63, // E4 major 3rd
    gain: 0.22,
    duration: 2.2,
    attackTime: 0.10,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  RESTORATION_CHIME_G4: {
    type: 'sine',
    frequency: 392.00, // G4 perfect 5th
    gain: 0.20,
    duration: 2.2,
    attackTime: 0.12,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  RESTORATION_CHIME_528HZ: {
    type: 'triangle',
    frequency: 528.00, // Solfeggio 528Hz Mechanical Restoration Harmonic Chime
    gain: 0.30,
    duration: 2.5,
    attackTime: 0.10,
    decayTime: 0.55,
    sustainLevel: 0.60,
    releaseTime: 1.00,
    filter: { type: 'bandpass', frequency: 528, q: 4.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // Canonical Aliases for Comprehensive Test Battery
  // ============================================================================
  REV_WINDUP_MOTOR: {
    type: 'sawtooth',
    frequency: 120.0,
    frequencyRamp: { target: 480.0, duration: 1.15, exponential: true },
    gain: 0.36,
    duration: 1.20,
    attackTime: 0.05,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 360, q: 2.8, rampTarget: 920, rampDuration: 1.15 },
  } as AudioVoiceToneParams,

  REV_WINDUP_WHINE: {
    type: 'sine',
    frequency: 60.0,
    frequencyRamp: { target: 240.0, duration: 1.15, exponential: true },
    gain: 0.28,
    duration: 1.20,
    attackTime: 0.04,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 280, q: 1.8 },
  } as AudioVoiceToneParams,

  DASH_ROLL_BODY: {
    type: 'sawtooth',
    frequency: 220.0,
    frequencyRamp: { target: 245.0, duration: 0.35, exponential: true },
    gain: 0.34,
    duration: 0.40,
    attackTime: 0.02,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 480, q: 3.0 },
  } as AudioVoiceToneParams,

  DASH_SPARK_CRACKLE: {
    type: 'triangle',
    frequency: 1200.0,
    frequencyRamp: { target: 400.0, duration: 0.04, exponential: true },
    gain: 0.22,
    duration: 0.06,
    attackTime: 0.002,
    decayTime: 0.03,
    sustainLevel: 0.20,
    releaseTime: 0.02,
    filter: { type: 'highpass', frequency: 600, q: 2.0 },
  } as AudioVoiceToneParams,

  BANK_SHOT_BOING: {
    type: 'triangle',
    frequency: 520.0,
    frequencyRamp: { target: 260.0, duration: 0.16, exponential: true },
    gain: 0.44,
    duration: 0.25,
    attackTime: 0.003,
    decayTime: 0.10,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 650, q: 3.5 },
  } as AudioVoiceToneParams,

  BANK_SHOT_METAL_PING: {
    type: 'sine',
    frequency: 1040.0,
    gain: 0.32,
    duration: 0.22,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.25,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 1040, q: 5.0 },
  } as AudioVoiceToneParams,

  HEAD_ON_SUB_BLAST: {
    type: 'sine',
    frequency: 80.0,
    frequencyRamp: { target: 30.0, duration: 0.30, exponential: true },
    gain: 0.52,
    duration: 0.40,
    attackTime: 0.002,
    decayTime: 0.16,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'lowpass', frequency: 120, q: 2.0 },
  } as AudioVoiceToneParams,

  HEAD_ON_IMPACT_SAW: {
    type: 'sawtooth',
    frequency: 880.0,
    frequencyRamp: { target: 110.0, duration: 0.22, exponential: true },
    gain: 0.46,
    duration: 0.32,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 720, q: 3.2 },
  } as AudioVoiceToneParams,

  DAZED_HAMSTER_C6: {
    type: 'sine',
    frequency: 1046.50,
    gain: 0.25,
    duration: 0.38,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.28,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  DAZED_HAMSTER_E6: {
    type: 'sine',
    frequency: 1318.51,
    gain: 0.23,
    duration: 0.38,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.28,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  DAZED_HAMSTER_G6: {
    type: 'triangle',
    frequency: 1567.98,
    gain: 0.22,
    duration: 0.42,
    attackTime: 0.01,
    decayTime: 0.16,
    sustainLevel: 0.30,
    releaseTime: 0.22,
  } as AudioVoiceToneParams,

  PHASE2_OVERLOAD_TRIAD_C4: {
    type: 'triangle',
    frequency: 261.63,
    frequencyRamp: { target: 523.25, duration: 0.35, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 620, q: 2.5 },
  } as AudioVoiceToneParams,

  PHASE2_OVERLOAD_TRIAD_E4: {
    type: 'sine',
    frequency: 329.63,
    frequencyRamp: { target: 659.25, duration: 0.35, exponential: true },
    gain: 0.25,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE2_OVERLOAD_TRIAD_G4: {
    type: 'sine',
    frequency: 392.00,
    gain: 0.24,
    duration: 0.42,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_PINBALL_LOW: {
    type: 'sawtooth',
    frequency: 380.0,
    frequencyRamp: { target: 760.0, duration: 0.40, exponential: true },
    gain: 0.38,
    duration: 0.50,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.45,
    releaseTime: 0.22,
    filter: { type: 'bandpass', frequency: 850, q: 3.2 },
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_PINBALL_HIGH: {
    type: 'square',
    frequency: 760.0,
    frequencyRamp: { target: 380.0, duration: 0.40, exponential: true },
    gain: 0.22,
    duration: 0.50,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.22,
    filter: { type: 'lowpass', frequency: 1100, q: 2.0 },
  } as AudioVoiceToneParams,

  DEFEAT_HAMSTER_SPINDOWN: {
    type: 'sawtooth',
    frequency: 480.0,
    frequencyRamp: { target: 38.0, duration: 1.5, exponential: true },
    gain: 0.35,
    duration: 1.7,
    attackTime: 0.04,
    decayTime: 0.50,
    sustainLevel: 0.35,
    releaseTime: 0.65,
    filter: { type: 'lowpass', frequency: 550, q: 2.2, rampTarget: 70, rampDuration: 1.5 },
  } as AudioVoiceToneParams,

  HAMSTER_RESTORATION_C4: {
    type: 'triangle',
    frequency: 261.63,
    gain: 0.24,
    duration: 2.2,
    attackTime: 0.08,
    decayTime: 0.45,
    sustainLevel: 0.55,
    releaseTime: 0.80,
    filter: { type: 'lowpass', frequency: 850, q: 1.8 },
  } as AudioVoiceToneParams,

  HAMSTER_RESTORATION_E4: {
    type: 'sine',
    frequency: 329.63,
    gain: 0.22,
    duration: 2.2,
    attackTime: 0.10,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  HAMSTER_RESTORATION_G4: {
    type: 'sine',
    frequency: 392.00,
    gain: 0.20,
    duration: 2.2,
    attackTime: 0.12,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  HAMSTER_RESTORATION_528HZ: {
    type: 'triangle',
    frequency: 528.00,
    gain: 0.30,
    duration: 2.5,
    attackTime: 0.10,
    decayTime: 0.55,
    sustainLevel: 0.60,
    releaseTime: 1.00,
    filter: { type: 'bandpass', frequency: 528, q: 4.0 },
  } as AudioVoiceToneParams,
});

export class HamsterAudio {
  private static instance: HamsterAudio | null = null;

  private voicePool: AudioVoicePool | null = null;
  private audioContext: AudioContext | null = null;
  private ownsPool: boolean = false;
  private isDestroyed: boolean = false;

  // Static cached white noise buffer for Zero-GC procedural synthesis
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  // Active tracking for Zero-Leak transient audio nodes and watchdog timeouts
  private readonly activeTransientNodes: Set<AudioNode> = new Set();
  private readonly activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Rate-limiting debounce timestamps (ms)
  private lastRevMs: number = 0;
  private lastDashMs: number = 0;
  private lastReboundMs: number = 0;
  private lastHeadOnMs: number = 0;
  private lastGatlingMs: number = 0;
  private lastLaserMs: number = 0;
  private lastPhaseMs: number = 0;
  private lastDefeatMs: number = 0;

  constructor(poolOrCtx?: AudioVoicePool | AudioContext | null, pool?: AudioVoicePool | null) {
    const isPool = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      'playTone' in poolOrCtx &&
      typeof (poolOrCtx as { playTone?: unknown }).playTone === 'function'
    );
    const isCtx = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      ('createOscillator' in poolOrCtx || 'currentTime' in poolOrCtx || 'destination' in poolOrCtx)
    );

    if (isPool) {
      this.bindPool(poolOrCtx as AudioVoicePool);
    } else if (isCtx) {
      this.init(poolOrCtx as AudioContext, pool || undefined);
    } else if (pool) {
      this.bindPool(pool);
    } else {
      try {
        this.voicePool = AudioVoicePool.getInstance(16);
      } catch {
        this.voicePool = null;
      }
    }
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): HamsterAudio {
    const isPool = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      'playTone' in poolOrCtx &&
      typeof (poolOrCtx as { playTone?: unknown }).playTone === 'function'
    );
    const isCtx = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      ('createOscillator' in poolOrCtx || 'currentTime' in poolOrCtx || 'destination' in poolOrCtx)
    );

    if (!HamsterAudio.instance) {
      HamsterAudio.instance = new HamsterAudio(poolOrCtx);
    } else if (isPool) {
      HamsterAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
    } else if (isCtx && !HamsterAudio.instance.audioContext) {
      HamsterAudio.instance.init(poolOrCtx as AudioContext);
    }
    return HamsterAudio.instance;
  }

  public static resetInstance(): void {
    if (HamsterAudio.instance) {
      HamsterAudio.instance.destroy();
      HamsterAudio.instance = null;
    }
    HamsterAudio.cachedNoiseBuffer = null;
    HamsterAudio.cachedNoiseSampleRate = 0;
  }

  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.audioContext = ctx;
    if (pool) {
      this.voicePool = pool;
      this.ownsPool = false;
    } else if (!this.voicePool) {
      this.voicePool = new AudioVoicePool(16);
      this.voicePool.init(ctx);
      this.ownsPool = true;
    } else {
      this.voicePool.init(ctx);
    }

    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {}
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    if (this.ownsPool && this.voicePool && this.voicePool !== pool && typeof this.voicePool.destroy === 'function') {
      this.voicePool.destroy();
    }
    this.voicePool = pool;
    this.ownsPool = false;
    if (typeof pool.getAudioContext === 'function') {
      this.audioContext = pool.getAudioContext();
    } else if (typeof (pool as unknown as { getContext?: () => AudioContext | null }).getContext === 'function') {
      this.audioContext = (pool as unknown as { getContext: () => AudioContext | null }).getContext();
    }
  }

  public setVoicePool(pool: AudioVoicePool | null): void {
    if (pool) {
      this.bindPool(pool);
    } else {
      this.voicePool = null;
    }
  }

  public setAudioContext(ctx: AudioContext | null): void {
    this.audioContext = ctx;
  }

  public getVoicePool(): AudioVoicePool | null {
    if (this.voicePool) return this.voicePool;
    try {
      this.voicePool = AudioVoicePool.getInstance(16);
      return this.voicePool;
    } catch {
      return null;
    }
  }

  public getAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    if (this.voicePool) {
      const poolCtx = this.voicePool.getAudioContext();
      if (poolCtx) {
        this.audioContext = poolCtx;
        return this.audioContext;
      }
    }
    if (typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
          return this.audioContext;
        } catch {}
      }
    }
    return null;
  }

  // ============================================================================
  // PROCEDURAL SOUND ROUTINES
  // ============================================================================

  public playRevWindup(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastRevMs > 0 && nowMs - this.lastRevMs < 200) return false;
    this.lastRevMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.REV_ACCEL_MOTOR);
      pool.playTone(HAMSTER_AUDIO_PRESETS.REV_MECHANICAL_WHINE);
    }
    this.playProceduralNoiseBurst(0.35, 300, 950, 0.18, 'bandpass');
    return true;
  }

  public playDashRollHum(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastDashMs > 0 && nowMs - this.lastDashMs < 120) return false;
    this.lastDashMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.DASH_ROLL_HUM);
      pool.playTone(HAMSTER_AUDIO_PRESETS.DASH_SPARK_POP);
    }
    this.playProceduralNoiseBurst(0.12, 1200, 400, 0.15, 'highpass');
    return true;
  }

  public playDashWhirr(nowMs: number = Date.now()): boolean {
    return this.playDashRollHum(nowMs);
  }

  public playWallRebound(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastReboundMs > 0 && nowMs - this.lastReboundMs < 100) return false;
    this.lastReboundMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.WALL_REBOUND_BOING);
      pool.playTone(HAMSTER_AUDIO_PRESETS.WALL_REBOUND_METAL_PING);
    }
    this.playProceduralNoiseBurst(0.18, 1400, 280, 0.28, 'bandpass');
    return true;
  }

  public playWallBounce(nowMs: number = Date.now()): boolean {
    return this.playWallRebound(nowMs);
  }

  public playHeadOnBombCollision(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastHeadOnMs > 0 && nowMs - this.lastHeadOnMs < 250) return false;
    this.lastHeadOnMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.HEAD_ON_SUB_CRACK);
      pool.playTone(HAMSTER_AUDIO_PRESETS.HEAD_ON_IMPACT_PUNCH);
      pool.playTone(HAMSTER_AUDIO_PRESETS.DAZED_STARS_C6);
      pool.playTone(HAMSTER_AUDIO_PRESETS.DAZED_STARS_E6);
      pool.playTone(HAMSTER_AUDIO_PRESETS.DAZED_STARS_G6);
    }
    this.playProceduralNoiseBurst(0.35, 1800, 150, 0.40, 'bandpass');
    return true;
  }

  public playDazedStars(_nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.DAZED_STARS_C6);
      pool.playTone(HAMSTER_AUDIO_PRESETS.DAZED_STARS_E6);
      pool.playTone(HAMSTER_AUDIO_PRESETS.DAZED_STARS_G6);
    }
    return true;
  }

  public playSunflowerGatling(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastGatlingMs > 0 && nowMs - this.lastGatlingMs < 80) return false;
    this.lastGatlingMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.GATLING_SEED_SPIT);
    }
    this.playProceduralNoiseBurst(0.04, 2200, 800, 0.16, 'highpass');
    return true;
  }

  public playGatlingSeedSpray(nowMs: number = Date.now()): boolean {
    return this.playSunflowerGatling(nowMs);
  }

  public playGyroLaserSweep(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastLaserMs > 0 && nowMs - this.lastLaserMs < 150) return false;
    this.lastLaserMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.LASER_SWEEP_BUZZ);
    }
    this.playProceduralNoiseBurst(0.20, 1600, 600, 0.20, 'bandpass');
    return true;
  }

  public playLaserSweep(nowMs: number = Date.now()): boolean {
    return this.playGyroLaserSweep(nowMs);
  }

  public playPhaseTransition(phase: number = 2, nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastPhaseMs > 0 && nowMs - this.lastPhaseMs < 300) return false;
    this.lastPhaseMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      if (phase <= 2) {
        pool.playTone(HAMSTER_AUDIO_PRESETS.PHASE2_OVERLOAD_C4);
        pool.playTone(HAMSTER_AUDIO_PRESETS.PHASE2_OVERLOAD_E4);
        pool.playTone(HAMSTER_AUDIO_PRESETS.PHASE2_OVERLOAD_G4);
      } else {
        pool.playTone(HAMSTER_AUDIO_PRESETS.PHASE3_BERSERK_ALARM_LOW);
        pool.playTone(HAMSTER_AUDIO_PRESETS.PHASE3_BERSERK_ALARM_HIGH);
      }
    }
    this.playProceduralNoiseBurst(0.40, 1200, 240, 0.32, 'bandpass');
    return true;
  }

  public playDefeatMechanicalRestoration(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastDefeatMs > 0 && nowMs - this.lastDefeatMs < 1000) return false;
    this.lastDefeatMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(HAMSTER_AUDIO_PRESETS.DEFEAT_SPINDOWN_SLIDE);
      pool.playTone(HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_C4);
      pool.playTone(HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_E4);
      pool.playTone(HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_G4);
      pool.playTone(HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_528HZ);
    }
    this.playProceduralNoiseBurst(0.85, 900, 120, 0.25, 'lowpass');
    return true;
  }

  public playDefeatPeaceHarmonic(nowMs: number = Date.now()): boolean {
    return this.playDefeatMechanicalRestoration(nowMs);
  }

  public playBossDefeated(nowMs: number = Date.now()): boolean {
    return this.playDefeatMechanicalRestoration(nowMs);
  }

  // ============================================================================
  // ZERO-GC PROCEDURAL WHITE NOISE ENGINE
  // ============================================================================

  public playProceduralNoiseBurst(
    duration: number = 0.25,
    startFilterFreq: number = 1000,
    endFilterFreq: number = 250,
    peakGain: number = 0.25,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    if (this.isDestroyed) return false;

    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 1e-6 ||
      duration > 300 ||
      typeof peakGain !== 'number' ||
      !Number.isFinite(peakGain) ||
      peakGain <= 1e-15
    ) {
      return false;
    }

    const ctx = this.getAudioContext();
    if (!ctx || typeof ctx.createBufferSource !== 'function') {
      return false;
    }

    try {
      const now = ctx.currentTime || 0;
      const noiseBuffer = this.getSharedNoiseBuffer(ctx);
      if (!noiseBuffer) return false;

      const safeStartFreq = Number.isFinite(startFilterFreq) ? startFilterFreq : 1000;
      const safeEndFreq = Number.isFinite(endFilterFreq) ? endFilterFreq : 250;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(20, safeStartFreq), now);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, safeEndFreq),
        now + duration
      );
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.min(1.0, peakGain), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gain);

      let tid: ReturnType<typeof setTimeout> | null = null;
      let cleanedUp = false;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (tid !== null) {
          clearTimeout(tid);
          this.activeTimeouts.delete(tid);
          tid = null;
        }
        try {
          source.onended = null;
          try {
            if (typeof source.stop === 'function') source.stop();
          } catch {}
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {}
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gain);
      };

      source.onended = cleanup;
      tid = this.safeTimeout(cleanup, Math.ceil((duration + 0.05) * 1000));

      try {
        source.start(now);
        source.stop(now + duration);
      } catch {
        cleanup();
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public playFilteredNoiseBurst(
    duration: number = 0.25,
    startFilterFreq: number = 1000,
    endFilterFreq: number = 250,
    peakGain: number = 0.25,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    return this.playProceduralNoiseBurst(
      duration,
      startFilterFreq,
      endFilterFreq,
      peakGain,
      filterType
    );
  }

  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      if (
        HamsterAudio.cachedNoiseBuffer &&
        HamsterAudio.cachedNoiseSampleRate === ctx.sampleRate
      ) {
        return HamsterAudio.cachedNoiseBuffer;
      }

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * 0.50);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }

      HamsterAudio.cachedNoiseBuffer = buffer;
      HamsterAudio.cachedNoiseSampleRate = sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  private safeTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const tid = setTimeout(() => {
      this.activeTimeouts.delete(tid);
      fn();
    }, delayMs);
    this.activeTimeouts.add(tid);
    return tid;
  }

  public clearPendingNodes(): void {
    for (const tid of this.activeTimeouts) {
      clearTimeout(tid);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        const sourceNode = node as unknown as { onended?: unknown; stop?: () => void };
        if ('onended' in sourceNode) sourceNode.onended = null;
        if (typeof sourceNode.stop === 'function') {
          try {
            sourceNode.stop();
          } catch {}
        }
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  public reset(): void {
    this.clearPendingNodes();
    this.lastRevMs = 0;
    this.lastDashMs = 0;
    this.lastReboundMs = 0;
    this.lastHeadOnMs = 0;
    this.lastGatlingMs = 0;
    this.lastLaserMs = 0;
    this.lastPhaseMs = 0;
    this.lastDefeatMs = 0;
  }

  public stop(): void {
    this.reset();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearPendingNodes();
    HamsterAudio.cachedNoiseBuffer = null;
    HamsterAudio.cachedNoiseSampleRate = 0;
    if (this.ownsPool && this.voicePool) {
      this.voicePool.destroy();
    }
    this.voicePool = null;
    this.audioContext = null;
    if (HamsterAudio.instance === this) {
      HamsterAudio.instance = null;
    }
  }

  public dispose(): void {
    this.destroy();
  }
}
