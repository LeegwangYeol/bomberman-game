/**
 * ClockworkCrisisAudio.ts — Procedural Web Audio Synthesizer for Clockwork Toy Rebellion (Stellaris Crisis 2)
 *
 * Implements 100% Procedural Sound Synthesis for Clockwork Phenomena:
 * 1. Metronome Ticking Protocol: Mechanical brass and woodblock clockwork tick-tock,
 *    accelerating from 60 BPM to 120 BPM across the Whispers phase.
 * 2. Conveyor Belt & Gear Drone: Industrial 55Hz/90Hz mechanical drone, periodic
 *    gear teeth friction, and bandpassed steam pressure venting.
 * 3. EMP Capacitor Buildup & Pulse Surge: Exponential charging whine (300Hz -> 2400Hz over 2.5s),
 *    high-energy sub-bass electromagnetic discharge (80Hz -> 20Hz), and bomb disarm fizzle.
 * 4. Dynamo Conduit Resonance & Overload Cleanse: Ascending E-Major resonant bells (E5, G#5, B5, E6)
 *    scaling with 4-conduit hits, culminating in a triumphant 4-note industrial arpeggio,
 *    sub-harmonic power-down sweep (220Hz -> 35Hz), and snappy mechanical relay clack.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Pre-allocated immutable tone presets declared via deepFreezePresets.
 * - Static cached 500ms white noise buffer reused permanently without runtime heap allocation.
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
 * Pre-allocated immutable tone parameters for Zero-GC Clockwork Audio synthesis
 */
export const CLOCKWORK_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Metronome Ticking Protocol (60 BPM -> 120 BPM Mechanical Accel)
  // ============================================================================
  METRONOME_TICK_WOODBLOCK: {
    type: 'triangle',
    frequency: 1800.0,
    frequencyRamp: { target: 400.0, duration: 0.038, exponential: true },
    gain: 0.22,
    duration: 0.04,
    attackTime: 0.002,
    decayTime: 0.025,
    sustainLevel: 0.05,
    releaseTime: 0.013,
    filter: { type: 'bandpass', frequency: 1400, q: 3.5 },
  } as AudioVoiceToneParams,

  METRONOME_TOCK_BRASS: {
    type: 'triangle',
    frequency: 1200.0,
    frequencyRamp: { target: 250.0, duration: 0.045, exponential: true },
    gain: 0.20,
    duration: 0.05,
    attackTime: 0.003,
    decayTime: 0.035,
    sustainLevel: 0.05,
    releaseTime: 0.012,
    filter: { type: 'bandpass', frequency: 850, q: 3.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Conveyor Belt Hum & Industrial Steam Gear Drone
  // ============================================================================
  CONVEYOR_HUM_VOICE_A: {
    type: 'triangle',
    frequency: 90.0,
    frequencyRamp: { target: 94.0, duration: 0.60, exponential: true },
    gain: 0.25,
    duration: 1.40,
    attackTime: 0.15,
    decayTime: 0.35,
    sustainLevel: 0.50,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 240, q: 1.5 },
  } as AudioVoiceToneParams,

  CONVEYOR_HUM_VOICE_B: {
    type: 'sine',
    frequency: 55.0,
    frequencyRamp: { target: 52.0, duration: 0.80, exponential: true },
    gain: 0.30,
    duration: 1.40,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.55,
    releaseTime: 0.55,
    filter: { type: 'lowpass', frequency: 120, q: 2.0 },
  } as AudioVoiceToneParams,

  CONVEYOR_GEAR_TEETH: {
    type: 'triangle',
    frequency: 165.0,
    frequencyRamp: { target: 110.0, duration: 0.30, exponential: true },
    gain: 0.18,
    duration: 0.60,
    attackTime: 0.05,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.30,
    filter: { type: 'bandpass', frequency: 320, q: 3.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. EMP Capacitor Buildup & Pulse Surge
  // ============================================================================
  EMP_CAPACITOR_WHINE: {
    type: 'sine',
    frequency: 300.0,
    frequencyRamp: { target: 2400.0, duration: 2.40, exponential: true },
    gain: 0.30,
    duration: 2.50,
    attackTime: 0.10,
    decayTime: 0.80,
    sustainLevel: 0.60,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 1500, q: 3.0, rampTarget: 2600, rampDuration: 2.40 },
  } as AudioVoiceToneParams,

  EMP_DISCHARGE_SUB: {
    type: 'sine',
    frequency: 80.0,
    frequencyRamp: { target: 20.0, duration: 0.50, exponential: true },
    gain: 0.55,
    duration: 0.65,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 95, q: 2.0 },
  } as AudioVoiceToneParams,

  EMP_DISCHARGE_CRACK: {
    type: 'sawtooth',
    frequency: 440.0,
    frequencyRamp: { target: 40.0, duration: 0.25, exponential: true },
    gain: 0.40,
    duration: 0.35,
    attackTime: 0.002,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1800, q: 4.0, rampTarget: 150, rampDuration: 0.25 },
  } as AudioVoiceToneParams,

  EMP_BOMB_DISARM: {
    type: 'sawtooth',
    frequency: 600.0,
    frequencyRamp: { target: 100.0, duration: 0.35, exponential: true },
    gain: 0.28,
    duration: 0.40,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 800, q: 3.0, rampTarget: 200, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  EMP_BOMB_FORCE_DETONATE: {
    type: 'sine',
    frequency: 320.0,
    frequencyRamp: { target: 45.0, duration: 0.20, exponential: true },
    gain: 0.45,
    duration: 0.30,
    attackTime: 0.002,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 160, q: 2.2 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Dynamo Conduit Resonance & Overload Cleanse (E-Major Harmonic Quad)
  // ============================================================================
  // Conduit 1: E5 (659.25Hz)
  CONDUIT_CHIME_TIER1_E5: {
    type: 'sine',
    frequency: 659.25,
    frequencyRamp: { target: 740.0, duration: 0.30, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'highpass', frequency: 500, q: 2.5 },
  } as AudioVoiceToneParams,

  // Conduit 2: G#5 (830.61Hz)
  CONDUIT_CHIME_TIER2_GSHARP5: {
    type: 'sine',
    frequency: 830.61,
    frequencyRamp: { target: 932.0, duration: 0.35, exponential: true },
    gain: 0.30,
    duration: 0.50,
    attackTime: 0.003,
    decayTime: 0.15,
    sustainLevel: 0.28,
    releaseTime: 0.30,
    filter: { type: 'highpass', frequency: 700, q: 2.5 },
  } as AudioVoiceToneParams,

  // Conduit 3: B5 (987.77Hz)
  CONDUIT_CHIME_TIER3_B5: {
    type: 'sine',
    frequency: 987.77,
    frequencyRamp: { target: 1108.0, duration: 0.40, exponential: true },
    gain: 0.32,
    duration: 0.55,
    attackTime: 0.002,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'highpass', frequency: 850, q: 2.8 },
  } as AudioVoiceToneParams,

  // Conduit 4: E6 (1318.51Hz)
  CONDUIT_CHIME_TIER4_E6: {
    type: 'sine',
    frequency: 1318.51,
    frequencyRamp: { target: 1480.0, duration: 0.45, exponential: true },
    gain: 0.35,
    duration: 0.65,
    attackTime: 0.002,
    decayTime: 0.20,
    sustainLevel: 0.35,
    releaseTime: 0.40,
    filter: { type: 'highpass', frequency: 1100, q: 3.0 },
  } as AudioVoiceToneParams,

  // Overload Cleanse Chords & Stasis Breakdown
  CONDUIT_OVERLOAD_CHORD_E4: {
    type: 'triangle',
    frequency: 329.63,
    frequencyRamp: { target: 370.0, duration: 0.60, exponential: true },
    gain: 0.25,
    duration: 1.20,
    attackTime: 0.01,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 600, q: 2.0 },
  } as AudioVoiceToneParams,

  CONDUIT_OVERLOAD_CHORD_B4: {
    type: 'sine',
    frequency: 493.88,
    frequencyRamp: { target: 554.37, duration: 0.60, exponential: true },
    gain: 0.22,
    duration: 1.20,
    attackTime: 0.01,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.60,
    filter: { type: 'bandpass', frequency: 500, q: 2.5 },
  } as AudioVoiceToneParams,

  CONDUIT_OVERLOAD_CHORD_E5: {
    type: 'sine',
    frequency: 659.25,
    frequencyRamp: { target: 987.77, duration: 0.80, exponential: true },
    gain: 0.25,
    duration: 1.30,
    attackTime: 0.01,
    decayTime: 0.35,
    sustainLevel: 0.45,
    releaseTime: 0.70,
    filter: { type: 'bandpass', frequency: 900, q: 3.0 },
  } as AudioVoiceToneParams,

  CONDUIT_OVERLOAD_CHORD_GSHARP5: {
    type: 'sine',
    frequency: 830.61,
    frequencyRamp: { target: 1244.51, duration: 0.80, exponential: true },
    gain: 0.22,
    duration: 1.30,
    attackTime: 0.01,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.70,
    filter: { type: 'highpass', frequency: 800, q: 2.5 },
  } as AudioVoiceToneParams,

  CONDUIT_OVERLOAD_POWERDOWN_SUB: {
    type: 'sine',
    frequency: 220.0,
    frequencyRamp: { target: 35.0, duration: 0.80, exponential: true },
    gain: 0.55,
    duration: 0.95,
    attackTime: 0.005,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 120, q: 2.5 },
  } as AudioVoiceToneParams,

  CONDUIT_OVERLOAD_RELAY_CLACK: {
    type: 'sawtooth',
    frequency: 1200.0,
    frequencyRamp: { target: 80.0, duration: 0.04, exponential: true },
    gain: 0.38,
    duration: 0.06,
    attackTime: 0.001,
    decayTime: 0.03,
    sustainLevel: 0.10,
    releaseTime: 0.02,
    filter: { type: 'bandpass', frequency: 1400, q: 4.0 },
  } as AudioVoiceToneParams,

  CONDUIT_RESET_SIZZLE: {
    type: 'triangle',
    frequency: 350.0,
    frequencyRamp: { target: 80.0, duration: 0.30, exponential: true },
    gain: 0.20,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 600, q: 3.5 },
  } as AudioVoiceToneParams,

  // Mechanical Breakdown on Failure
  CLOCKWORK_BREAKDOWN_GRIND: {
    type: 'sawtooth',
    frequency: 180.0,
    frequencyRamp: { target: 30.0, duration: 0.60, exponential: true },
    gain: 0.45,
    duration: 0.75,
    attackTime: 0.01,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 220, q: 3.0 },
  } as AudioVoiceToneParams,
});

/**
 * ClockworkCrisisAudio — Singleton procedural Web Audio synthesizer for Clockwork Rebellion
 */
export class ClockworkCrisisAudio {
  private static instance: ClockworkCrisisAudio | null = null;
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  private ctx: AudioContext | null = null;
  private pool: AudioVoicePool | null = null;
  private ownsPool: boolean = false;

  private activeTransientNodes: Set<AudioNode> = new Set();
  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Dynamic Metronome State
  private lastTickMs: number = 0;
  private isNextTickWoodblock: boolean = true;

  // Rate Limiting Timestamps
  private lastConveyorHumMs: number = 0;
  private lastEmpWarningMs: number = 0;
  private lastEmpPulseMs: number = 0;
  private lastConduitHitMs: number = 0;
  private lastOverloadCleanseMs: number = 0;

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

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): ClockworkCrisisAudio {
    if (!ClockworkCrisisAudio.instance) {
      ClockworkCrisisAudio.instance = new ClockworkCrisisAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        ClockworkCrisisAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else if (!ClockworkCrisisAudio.instance.ctx) {
        ClockworkCrisisAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return ClockworkCrisisAudio.instance;
  }

  public static resetInstance(): void {
    if (ClockworkCrisisAudio.instance) {
      ClockworkCrisisAudio.instance.destroy();
      ClockworkCrisisAudio.instance = null;
    }
    ClockworkCrisisAudio.cachedNoiseBuffer = null;
    ClockworkCrisisAudio.cachedNoiseSampleRate = 0;
  }

  public resetInstance(): void {
    ClockworkCrisisAudio.resetInstance();
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

  // ============================================================================
  // 1. Signature Soundscape: Metronome Ticking Protocol
  // ============================================================================
  /**
   * Plays a dynamic mechanical tick-tock.
   * BPM maps 60 -> 120 based on progress ratio [0.0, 1.0].
   */
  public playMetronomeTick(progressRatio: number = 0.0, nowMs: number = Date.now()): void {
    const safeProgress = Math.min(1.0, Math.max(0.0, Number.isFinite(progressRatio) ? progressRatio : 0.0));
    // Interval: 60 BPM = 1000ms, 120 BPM = 500ms
    const intervalMs = 1000 - safeProgress * 500;

    if (nowMs - this.lastTickMs < intervalMs) return;
    this.lastTickMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    if (this.isNextTickWoodblock) {
      pool.playTone(CLOCKWORK_AUDIO_PRESETS.METRONOME_TICK_WOODBLOCK);
    } else {
      pool.playTone(CLOCKWORK_AUDIO_PRESETS.METRONOME_TOCK_BRASS);
    }
    this.isNextTickWoodblock = !this.isNextTickWoodblock;
  }

  // ============================================================================
  // 2. Signature Soundscape: Conveyor Belt & Steam Drone
  // ============================================================================
  public playConveyorDrone(intensity: number = 1.0, nowMs: number = Date.now()): void {
    if (nowMs - this.lastConveyorHumMs < 350) return;
    this.lastConveyorHumMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONVEYOR_HUM_VOICE_A);
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONVEYOR_HUM_VOICE_B);
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONVEYOR_GEAR_TEETH);

    // Filtered steam pressure hiss
    this.playFilteredNoiseBurst(0.25, 2200, 1400, 0.12 * Math.min(1.0, intensity), 1.8);
  }

  // ============================================================================
  // 3. Signature Soundscape: EMP Pulse & Capacitor Whine
  // ============================================================================
  public playEmpWarning(nowMs: number = Date.now()): void {
    if (nowMs - this.lastEmpWarningMs < 2000) return;
    this.lastEmpWarningMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(CLOCKWORK_AUDIO_PRESETS.EMP_CAPACITOR_WHINE);
  }

  public playEmpPulse(nowMs: number = Date.now()): void {
    if (nowMs - this.lastEmpPulseMs < 300) return;
    this.lastEmpPulseMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(CLOCKWORK_AUDIO_PRESETS.EMP_DISCHARGE_SUB);
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.EMP_DISCHARGE_CRACK);

    // Wideband electromagnetic noise burst
    this.playFilteredNoiseBurst(0.35, 6000, 200, 0.28, 5.0);
  }

  public playBombDisarm(nowMs: number = Date.now()): void {
    void nowMs;
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(CLOCKWORK_AUDIO_PRESETS.EMP_BOMB_DISARM);
    this.playFilteredNoiseBurst(0.15, 1200, 300, 0.10, 2.0);
  }

  public playBombForcedDetonate(nowMs: number = Date.now()): void {
    void nowMs;
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(CLOCKWORK_AUDIO_PRESETS.EMP_BOMB_FORCE_DETONATE);
  }

  // ============================================================================
  // 4. Signature Soundscape: Dynamo Conduit Overload & Resolution
  // ============================================================================
  public playConduitHit(activeHits: number, nowMs: number = Date.now()): void {
    if (nowMs - this.lastConduitHitMs < 100) return;
    this.lastConduitHitMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    const hits = Math.min(4, Math.max(1, activeHits));
    if (hits === 1) {
      pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER1_E5);
    } else if (hits === 2) {
      pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER2_GSHARP5);
    } else if (hits === 3) {
      pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER3_B5);
    } else {
      pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER4_E6);
    }
  }

  public playConduitReset(nowMs: number = Date.now()): void {
    void nowMs;
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_RESET_SIZZLE);
    this.playFilteredNoiseBurst(0.20, 1800, 400, 0.12, 3.0);
  }

  public playOverloadCleanse(nowMs: number = Date.now()): void {
    if (nowMs - this.lastOverloadCleanseMs < 1000) return;
    this.lastOverloadCleanseMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    // Full 4-note chord
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_CHORD_E4);
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_CHORD_B4);
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_CHORD_E5);
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_CHORD_GSHARP5);

    // Power-down sub sweep & relay clack
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_POWERDOWN_SUB);
    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_RELAY_CLACK);

    // Industrial steam purge
    this.playFilteredNoiseBurst(0.50, 4000, 500, 0.25, 2.0);
  }

  public playBreakdownGrind(nowMs: number = Date.now()): void {
    void nowMs;
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(CLOCKWORK_AUDIO_PRESETS.CLOCKWORK_BREAKDOWN_GRIND);
    this.playFilteredNoiseBurst(0.40, 1500, 120, 0.22, 2.5);
  }

  // ============================================================================
  // Central FSM Stage Orchestrator Dispatcher
  // ============================================================================
  public playCrisisState(
    stage: CrisisStage,
    progressOrThreat: number = 0,
    nowMs: number = Date.now()
  ): void {
    if (stage === CrisisStage.WHISPERS) {
      const progress = Math.min(1.0, Math.max(0.0, progressOrThreat / 100));
      this.playMetronomeTick(progress, nowMs);
    } else if (stage === CrisisStage.OUTBREAK) {
      this.playConveyorDrone(1.0, nowMs);
    } else if (stage === CrisisStage.CLIMAX) {
      this.playConveyorDrone(1.5, nowMs);
    } else if (stage === CrisisStage.RESOLVED) {
      this.playOverloadCleanse(nowMs);
    } else if (stage === CrisisStage.FAILED) {
      this.playBreakdownGrind(nowMs);
    }
  }

  public playClockworkCrisisState(
    stage: CrisisStage,
    progressOrThreat: number = 0,
    nowMs: number = Date.now()
  ): void {
    this.playCrisisState(stage, progressOrThreat, nowMs);
  }

  // ============================================================================
  // Zero-Leak Noise Burst Engine
  // ============================================================================
  public playFilteredNoiseBurst(
    duration: number = 0.20,
    startFilterFreq: number = 1800,
    endFilterFreq: number = 600,
    peakGain: number = 0.15,
    q: number = 2.5
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0.20;
      const safeStartFreq = Number.isFinite(startFilterFreq) ? startFilterFreq : 1800;
      const safeEndFreq = Number.isFinite(endFilterFreq) ? endFilterFreq : 600;
      const safePeakGain = Number.isFinite(peakGain) ? peakGain : 0.15;
      const safeQ = Number.isFinite(q) ? q : 2.5;

      const now = ctx.currentTime;
      const noiseBuffer = this.getSharedNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.max(20, safeStartFreq), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, safeEndFreq), now + safeDuration);
      filter.Q.setValueAtTime(safeQ, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.min(1.0, Math.max(0.001, safePeakGain)), now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + safeDuration);

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
      tid = this.safeTimeout(cleanup, Math.ceil((safeDuration + 0.05) * 1000));

      try {
        source.start(now);
        source.stop(now + safeDuration);
      } catch {
        cleanup();
      }
    } catch {}
  }

  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (
      ClockworkCrisisAudio.cachedNoiseBuffer &&
      ClockworkCrisisAudio.cachedNoiseSampleRate === ctx.sampleRate
    ) {
      return ClockworkCrisisAudio.cachedNoiseBuffer;
    }

    try {
      const length = Math.floor(ctx.sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      ClockworkCrisisAudio.cachedNoiseBuffer = buffer;
      ClockworkCrisisAudio.cachedNoiseSampleRate = ctx.sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  private safeTimeout(cb: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const tid = setTimeout(() => {
      this.activeTimeouts.delete(tid);
      cb();
    }, delayMs);
    this.activeTimeouts.add(tid);
    return tid;
  }

  public clearPendingNodes(): void {
    for (const tid of this.activeTimeouts) {
      try {
        clearTimeout(tid);
      } catch {}
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        if (node instanceof AudioBufferSourceNode || ('stop' in node && typeof (node as { stop?: unknown }).stop === 'function')) {
          (node as AudioBufferSourceNode).onended = null;
          try {
            (node as AudioBufferSourceNode).stop();
          } catch {}
        }
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  public stop(): void {
    this.clearPendingNodes();
    if (this.pool) {
      this.pool.stop();
    }
  }

  public reset(): void {
    this.stop();
    this.lastTickMs = 0;
    this.isNextTickWoodblock = true;
    this.lastConveyorHumMs = 0;
    this.lastEmpWarningMs = 0;
    this.lastEmpPulseMs = 0;
    this.lastConduitHitMs = 0;
    this.lastOverloadCleanseMs = 0;
  }

  public destroy(): void {
    this.stop();
    if (this.ownsPool && this.pool) {
      this.pool.destroy();
      this.pool = null;
    }
    this.ctx = null;
  }
}
