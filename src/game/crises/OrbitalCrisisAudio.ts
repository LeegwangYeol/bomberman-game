/**
 * OrbitalCrisisAudio.ts — Procedural Web Audio Synthesizer for Orbital Bombardment (Stellaris Crisis 3)
 *
 * Implements 100% Procedural Sound Synthesis for Orbital Bombardment Phenomena:
 * 1. Reticle Ping & Radar Sweep: Electronic target lock pings (1760Hz -> 2640Hz), frequency-sweeping
 *    chirps (987Hz -> 1975Hz), radar sweeps (180Hz -> 75Hz) and deep sub-space approach drone (45Hz).
 * 2. Heavy Kinetic Slug Impact & Crater Thud: Hypersonic atmospheric entry screams (1400Hz -> 220Hz),
 *    supersonic impact cracks (580Hz -> 45Hz), deep seismic crater sub-thuds (68Hz -> 22Hz), and debris bursts.
 * 3. Spinal Macrocannon Charging & Beam Drone: Scaling dreadnought capacitor whine (150Hz -> 1200Hz+),
 *    monolithic 38Hz sub-harmonic reactor core drone, and catastrophic obliteration discharge (380Hz -> 28Hz).
 * 4. Planetary Defense Uplinks & EMP Counter-Barrage: Harmonic D-Major Planetary Defense Triad
 *    (D5 587Hz, F#5 740Hz, A5 880Hz, D6 1175Hz) and F-Major counter-barrage chimes, high-energy EMP pulse
 *    (75Hz -> 18Hz), and fleet powerdown sweep.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Pre-allocated immutable tone presets declared via deepFreezePresets.
 * - Permanent reuse of a static 500ms white noise buffer (cachedNoiseBuffer) per sample rate.
 * - All transient nodes employ dual cleanup (source.onended + watchdog timeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { CrisisStage } from './CrisisTypes.ts';

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
 * Pre-allocated immutable tone parameters for Zero-GC Orbital Audio synthesis
 */
export const ORBITAL_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Reticle Ping & Radar Sweep
  // ============================================================================
  RETICLE_PING_HIGH: {
    type: 'sine',
    frequency: 1760.0,
    frequencyRamp: { target: 2640.0, duration: 0.045, exponential: true },
    gain: 0.22,
    duration: 0.05,
    attackTime: 0.002,
    decayTime: 0.025,
    sustainLevel: 0.05,
    releaseTime: 0.018,
    filter: { type: 'bandpass', frequency: 2200, q: 4.5 },
  } as AudioVoiceToneParams,

  RETICLE_SWEEP_CHIRP: {
    type: 'triangle',
    frequency: 987.77,
    frequencyRamp: { target: 1975.53, duration: 0.06, exponential: true },
    gain: 0.18,
    duration: 0.07,
    attackTime: 0.003,
    decayTime: 0.04,
    sustainLevel: 0.10,
    releaseTime: 0.02,
    filter: { type: 'bandpass', frequency: 1500, q: 3.5 },
  } as AudioVoiceToneParams,

  RADAR_SWEEP_LOW: {
    type: 'sine',
    frequency: 180.0,
    frequencyRamp: { target: 75.0, duration: 0.35, exponential: true },
    gain: 0.25,
    duration: 0.40,
    attackTime: 0.02,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 250, q: 2.0 },
  } as AudioVoiceToneParams,

  DREADNOUGHT_APPROACH_SUB: {
    type: 'sine',
    frequency: 45.0,
    frequencyRamp: { target: 40.0, duration: 1.20, exponential: true },
    gain: 0.32,
    duration: 1.50,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.60,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 90, q: 1.8 },
  } as AudioVoiceToneParams,

  RETICLE_PING_PRIMARY: {
    type: 'sine',
    frequency: 2400.0,
    frequencyRamp: { target: 3600.0, duration: 0.045, exponential: true },
    gain: 0.24,
    duration: 0.06,
    attackTime: 0.002,
    decayTime: 0.035,
    sustainLevel: 0.05,
    releaseTime: 0.023,
    filter: { type: 'bandpass', frequency: 3000, q: 4.0 },
  } as AudioVoiceToneParams,

  RETICLE_SWEEP_BEACON: {
    type: 'triangle',
    frequency: 1800.0,
    frequencyRamp: { target: 2800.0, duration: 0.055, exponential: true },
    gain: 0.20,
    duration: 0.08,
    attackTime: 0.003,
    decayTime: 0.045,
    sustainLevel: 0.05,
    releaseTime: 0.032,
    filter: { type: 'bandpass', frequency: 2200, q: 3.5 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Kinetic Slugs & Craters
  // ============================================================================
  KINETIC_ATMOSPHERIC_SCREAM: {
    type: 'sawtooth',
    frequency: 1400.0,
    frequencyRamp: { target: 220.0, duration: 0.45, exponential: true },
    gain: 0.28,
    duration: 0.50,
    attackTime: 0.02,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 800, q: 3.0, rampTarget: 300, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  KINETIC_IMPACT_CRACK: {
    type: 'sawtooth',
    frequency: 580.0,
    frequencyRamp: { target: 45.0, duration: 0.18, exponential: true },
    gain: 0.48,
    duration: 0.22,
    attackTime: 0.002,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'lowpass', frequency: 650, q: 2.2 },
  } as AudioVoiceToneParams,

  CRATER_THUD_SUB: {
    type: 'sine',
    frequency: 68.0,
    frequencyRamp: { target: 22.0, duration: 0.55, exponential: true },
    gain: 0.55,
    duration: 0.65,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 85, q: 2.5 },
  } as AudioVoiceToneParams,

  CRATER_DEBRIS_RUMBLE: {
    type: 'triangle',
    frequency: 95.0,
    frequencyRamp: { target: 35.0, duration: 0.40, exponential: true },
    gain: 0.22,
    duration: 0.45,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'lowpass', frequency: 140, q: 1.5 },
  } as AudioVoiceToneParams,

  KINETIC_CRATER_IMPACT_SUB: {
    type: 'sine',
    frequency: 65.0,
    frequencyRamp: { target: 25.0, duration: 0.60, exponential: true },
    gain: 0.58,
    duration: 0.70,
    attackTime: 0.004,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.446,
    filter: { type: 'lowpass', frequency: 85, q: 2.2 },
  } as AudioVoiceToneParams,

  KINETIC_CRATER_CRACK: {
    type: 'sawtooth',
    frequency: 360.0,
    frequencyRamp: { target: 45.0, duration: 0.25, exponential: true },
    gain: 0.38,
    duration: 0.32,
    attackTime: 0.002,
    decayTime: 0.10,
    sustainLevel: 0.18,
    releaseTime: 0.218,
    filter: { type: 'bandpass', frequency: 1200, q: 3.0, rampTarget: 140, rampDuration: 0.25 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Spinal Macrocannon
  // ============================================================================
  MACROCANNON_CHARGE_BASE: {
    type: 'sine',
    frequency: 150.0,
    frequencyRamp: { target: 1200.0, duration: 2.0, exponential: true },
    gain: 0.30,
    duration: 2.2,
    attackTime: 0.10,
    decayTime: 0.70,
    sustainLevel: 0.50,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 800, q: 4.0, rampTarget: 2200, rampDuration: 2.0 },
  } as AudioVoiceToneParams,

  MACROCANNON_BEAM_DRONE_SUB: {
    type: 'sine',
    frequency: 38.0,
    frequencyRamp: { target: 34.0, duration: 1.0, exponential: true },
    gain: 0.35,
    duration: 1.2,
    attackTime: 0.15,
    decayTime: 0.35,
    sustainLevel: 0.60,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 75, q: 2.0 },
  } as AudioVoiceToneParams,

  MACROCANNON_BEAM_RESONANCE: {
    type: 'sawtooth',
    frequency: 190.0,
    frequencyRamp: { target: 285.0, duration: 0.8, exponential: true },
    gain: 0.20,
    duration: 0.9,
    attackTime: 0.08,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 450, q: 3.5 },
  } as AudioVoiceToneParams,

  MACROCANNON_DISCHARGE_OBLITERATION: {
    type: 'sawtooth',
    frequency: 380.0,
    frequencyRamp: { target: 28.0, duration: 0.6, exponential: true },
    gain: 0.65,
    duration: 0.75,
    attackTime: 0.005,
    decayTime: 0.30,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'lowpass', frequency: 300, q: 3.0 },
  } as AudioVoiceToneParams,

  MACROCANNON_CHARGE_WHINE: {
    type: 'sine',
    frequency: 100.0,
    frequencyRamp: { target: 750.0, duration: 2.20, exponential: true },
    gain: 0.35,
    duration: 2.30,
    attackTime: 0.08,
    decayTime: 0.70,
    sustainLevel: 0.65,
    releaseTime: 0.45,
    filter: { type: 'bandpass', frequency: 800, q: 3.2, rampTarget: 1800, rampDuration: 2.20 },
  } as AudioVoiceToneParams,

  MACROCANNON_BEAM_DRONE_A: {
    type: 'triangle',
    frequency: 42.0,
    frequencyRamp: { target: 46.0, duration: 0.90, exponential: true },
    gain: 0.28,
    duration: 1.50,
    attackTime: 0.12,
    decayTime: 0.38,
    sustainLevel: 0.55,
    releaseTime: 0.55,
    filter: { type: 'lowpass', frequency: 140, q: 2.0 },
  } as AudioVoiceToneParams,

  MACROCANNON_BEAM_DRONE_B: {
    type: 'sine',
    frequency: 28.0,
    frequencyRamp: { target: 26.0, duration: 1.00, exponential: true },
    gain: 0.34,
    duration: 1.50,
    attackTime: 0.15,
    decayTime: 0.40,
    sustainLevel: 0.60,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 90, q: 2.5 },
  } as AudioVoiceToneParams,

  MACROCANNON_DISCHARGE_LANCE: {
    type: 'sawtooth',
    frequency: 520.0,
    frequencyRamp: { target: 35.0, duration: 0.75, exponential: true },
    gain: 0.62,
    duration: 0.85,
    attackTime: 0.003,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.547,
    filter: { type: 'lowpass', frequency: 260, q: 2.8, rampTarget: 50, rampDuration: 0.75 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Planetary Defense Uplinks & EMP Counter-Barrage
  // ============================================================================
  // D-Major Planetary Defense Triad
  UPLINK_CHIME_TIER1_D5: {
    type: 'sine',
    frequency: 587.33,
    frequencyRamp: { target: 880.0, duration: 0.22, exponential: true },
    gain: 0.25,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1200, q: 3.0 },
  } as AudioVoiceToneParams,

  UPLINK_CHIME_TIER2_FSHARP5: {
    type: 'sine',
    frequency: 739.99,
    frequencyRamp: { target: 1108.73, duration: 0.22, exponential: true },
    gain: 0.25,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1450, q: 3.0 },
  } as AudioVoiceToneParams,

  UPLINK_CHIME_TIER3_A5: {
    type: 'sine',
    frequency: 880.00,
    frequencyRamp: { target: 1760.00, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.50,
    attackTime: 0.005,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.28,
    filter: { type: 'bandpass', frequency: 1800, q: 3.5 },
  } as AudioVoiceToneParams,

  UPLINK_TRIAD_OCTAVE_D6: {
    type: 'sine',
    frequency: 1174.66,
    gain: 0.20,
    duration: 0.60,
    attackTime: 0.005,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2400, q: 3.0 },
  } as AudioVoiceToneParams,

  EMP_COUNTER_BARRAGE_SUB: {
    type: 'sine',
    frequency: 75.0,
    frequencyRamp: { target: 18.0, duration: 0.70, exponential: true },
    gain: 0.60,
    duration: 0.85,
    attackTime: 0.005,
    decayTime: 0.35,
    sustainLevel: 0.35,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 90, q: 2.2 },
  } as AudioVoiceToneParams,

  EMP_WARHEAD_DETONATION_CRACK: {
    type: 'sawtooth',
    frequency: 850.0,
    frequencyRamp: { target: 110.0, duration: 0.20, exponential: true },
    gain: 0.42,
    duration: 0.25,
    attackTime: 0.002,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.10,
    filter: { type: 'lowpass', frequency: 950, q: 2.5 },
  } as AudioVoiceToneParams,

  FLEET_NEUTRALIZED_POWERDOWN: {
    type: 'triangle',
    frequency: 320.0,
    frequencyRamp: { target: 45.0, duration: 0.80, exponential: true },
    gain: 0.25,
    duration: 0.90,
    attackTime: 0.05,
    decayTime: 0.40,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'lowpass', frequency: 380, q: 1.8 },
  } as AudioVoiceToneParams,

  // F-Major Variant Presets for Dual Compatibility
  UPLINK_CHIME_TIER1_F5: {
    type: 'sine',
    frequency: 698.46,
    frequencyRamp: { target: 783.99, duration: 0.30, exponential: true },
    gain: 0.30,
    duration: 0.45,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'highpass', frequency: 520, q: 2.5 },
  } as AudioVoiceToneParams,

  UPLINK_CHIME_TIER2_A5: {
    type: 'sine',
    frequency: 880.0,
    frequencyRamp: { target: 987.77, duration: 0.35, exponential: true },
    gain: 0.32,
    duration: 0.50,
    attackTime: 0.003,
    decayTime: 0.15,
    sustainLevel: 0.28,
    releaseTime: 0.30,
    filter: { type: 'highpass', frequency: 720, q: 2.5 },
  } as AudioVoiceToneParams,

  UPLINK_CHIME_TIER3_C6: {
    type: 'sine',
    frequency: 1046.5,
    frequencyRamp: { target: 1174.66, duration: 0.40, exponential: true },
    gain: 0.35,
    duration: 0.55,
    attackTime: 0.003,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'highpass', frequency: 880, q: 2.8 },
  } as AudioVoiceToneParams,

  COUNTER_BARRAGE_CHIME_F6: {
    type: 'sine',
    frequency: 1396.91,
    frequencyRamp: { target: 1567.98, duration: 0.45, exponential: true },
    gain: 0.36,
    duration: 0.65,
    attackTime: 0.002,
    decayTime: 0.20,
    sustainLevel: 0.32,
    releaseTime: 0.40,
    filter: { type: 'highpass', frequency: 1100, q: 3.0 },
  } as AudioVoiceToneParams,

  COUNTER_BARRAGE_DISCHARGE_SUB: {
    type: 'sine',
    frequency: 60.0,
    frequencyRamp: { target: 18.0, duration: 0.65, exponential: true },
    gain: 0.60,
    duration: 0.80,
    attackTime: 0.005,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.495,
    filter: { type: 'lowpass', frequency: 75, q: 2.4 },
  } as AudioVoiceToneParams,

  COUNTER_BARRAGE_PULSE_SNAP: {
    type: 'sawtooth',
    frequency: 480.0,
    frequencyRamp: { target: 30.0, duration: 0.28, exponential: true },
    gain: 0.42,
    duration: 0.35,
    attackTime: 0.002,
    decayTime: 0.12,
    sustainLevel: 0.22,
    releaseTime: 0.228,
    filter: { type: 'bandpass', frequency: 1600, q: 3.5, rampTarget: 100, rampDuration: 0.28 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 5. Threat & Transition Accents
  // ============================================================================
  THREAT_ELEVATION_WARPING: {
    type: 'sine',
    frequency: 150.0,
    frequencyRamp: { target: 380.0, duration: 0.30, exponential: true },
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.24,
    filter: { type: 'lowpass', frequency: 450, q: 2.0 },
  } as AudioVoiceToneParams,

  STAGE_TRANSITION_ALARM: {
    type: 'sawtooth',
    frequency: 660.0,
    frequencyRamp: { target: 220.0, duration: 0.40, exponential: true },
    gain: 0.26,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.295,
    filter: { type: 'bandpass', frequency: 800, q: 3.0 },
  } as AudioVoiceToneParams,
});

/**
 * OrbitalCrisisAudio — Singleton procedural Web Audio synthesizer for Orbital Bombardment
 */
export class OrbitalCrisisAudio {
  private static instance: OrbitalCrisisAudio | null = null;
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  private ctx: AudioContext | null = null;
  private pool: AudioVoicePool | null = null;
  private ownsPool: boolean = false;

  private activeTransientNodes: Set<AudioNode> = new Set();
  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Rate Limiting Timestamps
  private lastReticlePingMs: number = 0;
  private lastRadarSweepMs: number = 0;
  private lastAtmosphericScreamMs: number = 0;
  private lastKineticImpactMs: number = 0;
  private lastSalvoImpactMs: number = 0;
  private lastMacrocannonWhineMs: number = 0;
  private lastMacrocannonBeamMs: number = 0;
  private lastUplinkChimeMs: number = 0;
  private lastCounterBarrageMs: number = 0;

  constructor(poolOrCtx?: AudioVoicePool | AudioContext | null, pool?: AudioVoicePool | null) {
    if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        this.bindPool(poolOrCtx as AudioVoicePool);
      } else {
        this.init(poolOrCtx as AudioContext, pool || undefined);
      }
    } else if (pool) {
      this.bindPool(pool);
    } else {
      this.pool = AudioVoicePool.getInstance(16);
    }
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): OrbitalCrisisAudio {
    if (!OrbitalCrisisAudio.instance) {
      OrbitalCrisisAudio.instance = new OrbitalCrisisAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        OrbitalCrisisAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else if (!OrbitalCrisisAudio.instance.ctx) {
        OrbitalCrisisAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return OrbitalCrisisAudio.instance;
  }

  public static resetInstance(): void {
    if (OrbitalCrisisAudio.instance) {
      OrbitalCrisisAudio.instance.destroy();
      OrbitalCrisisAudio.instance = null;
    }
    OrbitalCrisisAudio.cachedNoiseBuffer = null;
    OrbitalCrisisAudio.cachedNoiseSampleRate = 0;
  }

  public resetInstance(): void {
    OrbitalCrisisAudio.resetInstance();
  }

  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.ctx = ctx;
    if (pool) {
      this.pool = pool;
      this.ownsPool = false;
    } else if (!this.pool) {
      this.pool = new AudioVoicePool(16);
      this.pool.init(ctx);
      this.ownsPool = true;
    } else {
      this.pool.init(ctx);
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    if (this.ownsPool && this.pool && this.pool !== pool) {
      this.pool.destroy();
    }
    this.pool = pool;
    this.ownsPool = false;
    this.ctx = pool.getAudioContext();
  }

  public getContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.pool) {
      const poolCtx = this.pool.getAudioContext();
      if (poolCtx) {
        this.ctx = poolCtx;
        return this.ctx;
      }
    }
    if (typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
          return this.ctx;
        } catch {}
      }
    }
    return null;
  }

  public getPool(): AudioVoicePool | null {
    if (this.pool) return this.pool;
    try {
      this.pool = AudioVoicePool.getInstance(16);
      return this.pool;
    } catch {
      return null;
    }
  }

  public getActiveTransientNodeCount(): number {
    return this.activeTransientNodes.size;
  }

  public getActiveTimeoutCount(): number {
    return this.activeTimeouts.size;
  }

  // ============================================================================
  // 1. Signature Soundscape: Sweeping Targeting Reticle Ping & Radar Sweep
  // ============================================================================
  public playReticlePing(intensity: number = 1.0, nowMs: number = Date.now()): void {
    void intensity;
    if (nowMs - this.lastReticlePingMs < 200) return;
    this.lastReticlePingMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.RETICLE_PING_HIGH);
  }

  public playRadarSweep(nowMs: number = Date.now()): void {
    if (nowMs - this.lastRadarSweepMs < 350) return;
    this.lastRadarSweepMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.RETICLE_SWEEP_CHIRP);
    pool.playTone(ORBITAL_AUDIO_PRESETS.RADAR_SWEEP_LOW);
    pool.playTone(ORBITAL_AUDIO_PRESETS.DREADNOUGHT_APPROACH_SUB);
  }

  public playReticleSweep(nowMs: number = Date.now()): void {
    this.playRadarSweep(nowMs);
  }

  // ============================================================================
  // 2. Signature Soundscape: Heavy Kinetic Slug Impact & Crater Shockwave
  // ============================================================================
  public playKineticAtmosphericDescent(nowMs: number = Date.now()): void {
    if (nowMs - this.lastAtmosphericScreamMs < 300) return;
    this.lastAtmosphericScreamMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.KINETIC_ATMOSPHERIC_SCREAM);
  }

  public playAtmosphericScream(nowMs: number = Date.now()): void {
    this.playKineticAtmosphericDescent(nowMs);
  }

  public playKineticImpact(nowMs: number = Date.now()): void {
    if (nowMs - this.lastKineticImpactMs < 180) return;
    this.lastKineticImpactMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.KINETIC_IMPACT_CRACK);
    pool.playTone(ORBITAL_AUDIO_PRESETS.CRATER_THUD_SUB);
    pool.playTone(ORBITAL_AUDIO_PRESETS.CRATER_DEBRIS_RUMBLE);

    this.playFilteredNoiseBurst(0.25, 1200, 2.0, 0.22);
  }

  public playKineticCraterImpact(nowMs: number = Date.now()): void {
    this.playKineticImpact(nowMs);
  }

  public playCraterThud(nowMs: number = Date.now()): void {
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.CRATER_THUD_SUB);
  }

  public playKineticSalvoImpact(salvoCount: number = 4, nowMs: number = Date.now()): void {
    void salvoCount;
    if (nowMs - this.lastSalvoImpactMs < 250) return;
    this.lastSalvoImpactMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.KINETIC_IMPACT_CRACK);
    pool.playTone(ORBITAL_AUDIO_PRESETS.CRATER_THUD_SUB);
    pool.playTone(ORBITAL_AUDIO_PRESETS.CRATER_DEBRIS_RUMBLE);

    this.playFilteredNoiseBurst(0.35, 1600, 2.2, 0.28);
  }

  // ============================================================================
  // 3. Signature Soundscape: Spinal Macrocannon Particle Lance Charging & Beam
  // ============================================================================
  public calculateMacrocannonChargeFrequency(percent: number): number {
    const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    // 150Hz at 0% scaling up to 1200Hz+ at 100%
    return 150.0 + (safePercent / 100.0) * 1050.0;
  }

  public playMacrocannonCharge(chargePercent: number = 0, nowMs: number = Date.now()): void {
    if (nowMs - this.lastMacrocannonWhineMs < 1200) return;
    this.lastMacrocannonWhineMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.MACROCANNON_CHARGE_BASE);

    const safePercent = Math.max(0, Math.min(100, Number.isFinite(chargePercent) ? chargePercent : 0));
    if (safePercent >= 25) {
      pool.playTone(ORBITAL_AUDIO_PRESETS.MACROCANNON_BEAM_DRONE_SUB);
    }
  }

  public playMacrocannonWhine(progressRatio: number = 0.0, nowMs: number = Date.now()): void {
    const percent = Math.max(0, Math.min(100, (Number.isFinite(progressRatio) ? progressRatio : 0) * 100));
    this.playMacrocannonCharge(percent, nowMs);
  }

  public playMacrocannonBeamDrone(nowMs: number = Date.now()): void {
    if (nowMs - this.lastMacrocannonBeamMs < 400) return;
    this.lastMacrocannonBeamMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.MACROCANNON_BEAM_DRONE_SUB);
    pool.playTone(ORBITAL_AUDIO_PRESETS.MACROCANNON_BEAM_RESONANCE);
  }

  public playMacrocannonBeam(nowMs: number = Date.now()): void {
    this.playMacrocannonBeamDrone(nowMs);
  }

  public playMacrocannonFire(nowMs: number = Date.now()): void {
    void nowMs;
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.MACROCANNON_DISCHARGE_OBLITERATION);
    pool.playTone(ORBITAL_AUDIO_PRESETS.CRATER_THUD_SUB);

    this.playFilteredNoiseBurst(0.60, 4500, 2.5, 0.40);
  }

  // ============================================================================
  // 4. Signature Soundscape: Planetary Defense Uplink EMP Counter-Barrage
  // ============================================================================
  public playUplinkOverride(overriddenCount: number = 1, nowMs: number = Date.now()): void {
    if (nowMs - this.lastUplinkChimeMs < 120) return;
    this.lastUplinkChimeMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    const count = Math.max(1, Math.min(3, Number.isFinite(overriddenCount) ? Math.floor(overriddenCount) : 1));

    if (count === 1) {
      pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER1_D5);
    } else if (count === 2) {
      pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER2_FSHARP5);
    } else {
      // Full D-Major Triad (D5 + F#5 + A5 + D6)
      pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER1_D5);
      pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER2_FSHARP5);
      pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER3_A5);
      pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_TRIAD_OCTAVE_D6);
    }
  }

  public playUplinkSecured(uplinkCount: number = 1, nowMs: number = Date.now()): void {
    this.playUplinkOverride(uplinkCount, nowMs);
  }

  public playEmpCounterBarrage(nowMs: number = Date.now()): void {
    if (nowMs - this.lastCounterBarrageMs < 800) return;
    this.lastCounterBarrageMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.EMP_COUNTER_BARRAGE_SUB);
    pool.playTone(ORBITAL_AUDIO_PRESETS.EMP_WARHEAD_DETONATION_CRACK);

    const timer = setTimeout(() => {
      this.playFilteredNoiseBurst(0.45, 5000, 3.0, 0.35);
      this.activeTimeouts.delete(timer);
    }, 180);
    this.activeTimeouts.add(timer);
  }

  public playCounterBarrage(nowMs: number = Date.now()): void {
    this.playEmpCounterBarrage(nowMs);
  }

  public playGlobalEmpCounterBarrage(nowMs: number = Date.now()): void {
    this.playEmpCounterBarrage(nowMs);
  }

  public playFleetNeutralized(nowMs: number = Date.now()): void {
    void nowMs;
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER3_A5);
    pool.playTone(ORBITAL_AUDIO_PRESETS.UPLINK_TRIAD_OCTAVE_D6);
    pool.playTone(ORBITAL_AUDIO_PRESETS.FLEET_NEUTRALIZED_POWERDOWN);
  }

  // ============================================================================
  // 5. Threat & Transition Accents
  // ============================================================================
  public playCrisisState(stage: CrisisStage, threatOrCharge: number = 0, nowMs: number = Date.now()): void {
    const pool = this.getPool();
    if (!pool) return;

    if (stage === CrisisStage.WHISPERS) {
      this.playRadarSweep(nowMs);
    } else if (stage === CrisisStage.OUTBREAK) {
      pool.playTone(ORBITAL_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      this.playKineticAtmosphericDescent(nowMs);
    } else if (stage === CrisisStage.CLIMAX) {
      pool.playTone(ORBITAL_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      this.playMacrocannonCharge(threatOrCharge, nowMs);
    } else if (stage === CrisisStage.RESOLVED) {
      this.playEmpCounterBarrage(nowMs);
      this.playFleetNeutralized(nowMs);
    } else if (stage === CrisisStage.FAILED) {
      this.playMacrocannonFire(nowMs);
    }
  }

  public playThreatElevation(threat: number): void {
    const pool = this.getPool();
    if (!pool) return;

    if (threat >= 70) {
      pool.playTone(ORBITAL_AUDIO_PRESETS.THREAT_ELEVATION_WARPING);
    }
  }

  // ============================================================================
  // Internal Helpers: Timed Voice Routing & Procedural Noise
  // ============================================================================
  public playFilteredNoiseBurst(
    duration: number = 0.2,
    freqOrStartFreq: number = 1600,
    qOrEndFreq: number = 2.0,
    gain: number = 0.25
  ): void {
    if (typeof duration !== 'number' || Number.isNaN(duration) || duration <= 0) return;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
      const buffer = this.getOrCreateNoiseBuffer(ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = Math.max(0.1, Number.isFinite(qOrEndFreq) ? qOrEndFreq : 2.0);
      filter.frequency.setValueAtTime(
        Math.max(20, Number.isFinite(freqOrStartFreq) ? freqOrStartFreq : 1600),
        ctx.currentTime
      );

      const gainNode = ctx.createGain();
      const safeGain = Math.max(0.001, Number.isFinite(gain) ? gain : 0.25);
      gainNode.gain.setValueAtTime(safeGain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gainNode);

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
          source.disconnect();
          filter.disconnect();
          gainNode.disconnect();
        } catch {}
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gainNode);
      };

      source.onended = cleanup;
      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + duration);

      const timeoutId = setTimeout(cleanup, Math.ceil(duration * 1000) + 100);
      this.activeTimeouts.add(timeoutId);
    } catch {}
  }

  private getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (
      OrbitalCrisisAudio.cachedNoiseBuffer &&
      OrbitalCrisisAudio.cachedNoiseSampleRate === ctx.sampleRate
    ) {
      return OrbitalCrisisAudio.cachedNoiseBuffer;
    }

    const length = Math.floor(ctx.sampleRate * 0.5); // 500ms
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2.0 - 1.0;
    }

    OrbitalCrisisAudio.cachedNoiseBuffer = buffer;
    OrbitalCrisisAudio.cachedNoiseSampleRate = ctx.sampleRate;
    return buffer;
  }

  // ============================================================================
  // Lifecycle & Zero-Leak Cleanup
  // ============================================================================
  public clearPendingNodes(): void {
    for (const timeoutId of this.activeTimeouts) {
      clearTimeout(timeoutId);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        const sourceNode = node as unknown as { onended?: unknown; stop?: () => void };
        if ('onended' in sourceNode) {
          sourceNode.onended = null;
        }
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

  public stop(): void {
    this.clearPendingNodes();

    if (this.pool && typeof this.pool.reset === 'function') {
      try {
        this.pool.reset();
      } catch {}
    }
  }

  public reset(): void {
    this.stop();
    this.lastReticlePingMs = 0;
    this.lastRadarSweepMs = 0;
    this.lastAtmosphericScreamMs = 0;
    this.lastKineticImpactMs = 0;
    this.lastSalvoImpactMs = 0;
    this.lastMacrocannonWhineMs = 0;
    this.lastMacrocannonBeamMs = 0;
    this.lastUplinkChimeMs = 0;
    this.lastCounterBarrageMs = 0;
  }

  public destroy(): void {
    this.stop();
    this.reset();
    if (this.ownsPool && this.pool) {
      this.pool.destroy();
      this.pool = null;
    }
    if (OrbitalCrisisAudio.instance === this) {
      OrbitalCrisisAudio.instance = null;
    }
    this.ctx = null;
  }
}
