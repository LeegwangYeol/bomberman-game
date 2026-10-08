/**
 * MiasmaHazardAudio.ts — Procedural Web Audio Sound Synthesizer for MiasmaHazard Events
 *
 * Implements Procedural Audio for the Toxic Miasma & Spore Bloom Subsystem:
 * - Low-Frequency Hum: Fungal sub-bass respiration drone (52Hz -> 36Hz) and pod incubation hum (65Hz -> 48Hz).
 * - Bubbling / Rustling Filter Sweeps: Organic exhalation swell (220Hz -> 440Hz with 520Hz -> 760Hz bandpass ascent),
 *   vegetative rustle sweeps (280Hz -> 140Hz with 850Hz -> 1600Hz resonant bandpass), and micro-bubble chirps.
 * - Burst Crack: Steep corrosive bio-burst detonation crack (760Hz -> 55Hz) + seismic sub-thud (52Hz -> 22Hz)
 *   + D-major emerald harmonic triad (D5, F#5, A5) + filtered procedural white noise explosion.
 * - Dash Chimes: Spore Surge / Photosynthetic Dash dual chimes (D5 / 587Hz -> G5 / 784Hz -> C6 / 1046Hz) + air sweep.
 * - Cleansing Snaps: Floral cleansing snap (1200Hz -> 320Hz crisp transient) + fertile soil bloom chime.
 * - Neurotoxin Spore Wobble: Acidic low-gain debuff notification (380Hz -> 190Hz).
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Uses pre-allocated 16-voice AudioVoicePool (persistent oscillators, ADSR envelopes, click-free stealing).
 * - Cached static 500ms white noise buffer reused indefinitely without runtime GC allocations.
 * - Transient noise/filter nodes employ active tracking, dual cleanup (source.onended + watchdog timeout),
 *   and clearPendingNodes / destroy lifecycle management.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { MiasmaLifecycleState, MiasmaTelegraphPhase } from './MiasmaHazard.ts';

export const MIASMA_AUDIO_PRESETS = {
  // 1. Low Frequency Hum: Deep Fungal Respiration Sub Drone (52Hz -> 36Hz)
  FUNGAL_SUB_DRONE_52HZ: {
    type: 'sine',
    frequency: 52.0,
    frequencyRamp: { target: 36.0, duration: 0.85, exponential: true },
    gain: 0.32,
    duration: 1.10,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 105, q: 1.6 },
  } as AudioVoiceToneParams,

  // Pod Incubation Hum: Low resonant drone during early telegraph
  POD_INCUBATION_HUM: {
    type: 'triangle',
    frequency: 65.0,
    frequencyRamp: { target: 48.0, duration: 0.70, exponential: true },
    gain: 0.22,
    duration: 0.85,
    attackTime: 0.15,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 120, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Bubbling / Rustling Filter Sweeps: Spore Exhalation Swell
  SPORE_EXHALATION_SWELL: {
    type: 'triangle',
    frequency: 220.0,
    frequencyRamp: { target: 440.0, duration: 0.30, exponential: true },
    gain: 0.18,
    duration: 0.40,
    attackTime: 0.04,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 520, q: 2.8, rampTarget: 760, rampDuration: 0.30 },
  } as AudioVoiceToneParams,

  // Organic Bubbling Micro-Chirp: Resonant thermal/biological bubble pop
  ORGANIC_BUBBLING_CHIRP: {
    type: 'sine',
    frequency: 180.0,
    frequencyRamp: { target: 360.0, duration: 0.18, exponential: true },
    gain: 0.16,
    duration: 0.25,
    attackTime: 0.02,
    decayTime: 0.08,
    sustainLevel: 0.25,
    releaseTime: 0.10,
    filter: { type: 'bandpass', frequency: 450, q: 3.2, rampTarget: 820, rampDuration: 0.18 },
  } as AudioVoiceToneParams,

  // Vegetative Rustle Sweep: Modulated bandpass sweep for foliage / spore cloud rustle
  VEGETATIVE_RUSTLE_SWEEP: {
    type: 'sawtooth',
    frequency: 280.0,
    frequencyRamp: { target: 140.0, duration: 0.35, exponential: false },
    gain: 0.16,
    duration: 0.40,
    attackTime: 0.05,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 850, q: 3.5, rampTarget: 1600, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  // 3. Burst Crack: Corrosive Bio-Burst Detonation Crack & Sub Shock
  CORROSIVE_BURST_CRACK: {
    type: 'sawtooth',
    frequency: 760.0,
    frequencyRamp: { target: 55.0, duration: 0.08, exponential: true },
    gain: 0.45,
    duration: 0.20,
    attackTime: 0.001,
    decayTime: 0.05,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 1400, q: 2.4, rampTarget: 260, rampDuration: 0.10 },
  } as AudioVoiceToneParams,

  CORROSIVE_SUB_THUD: {
    type: 'sine',
    frequency: 52.0,
    frequencyRamp: { target: 22.0, duration: 0.35, exponential: true },
    gain: 0.50,
    duration: 0.45,
    attackTime: 0.004,
    decayTime: 0.15,
    sustainLevel: 0.28,
    releaseTime: 0.22,
    filter: { type: 'lowpass', frequency: 115, q: 1.5 },
  } as AudioVoiceToneParams,

  // D Major Harmonic Emerald Triad (D5, F#5, A5)
  CORROSIVE_CHIME_D5: {
    type: 'sine',
    frequency: 587.33, // D5
    gain: 0.22,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.40,
  } as AudioVoiceToneParams,

  CORROSIVE_CHIME_FSHARP5: {
    type: 'sine',
    frequency: 739.99, // F#5
    gain: 0.20,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.40,
  } as AudioVoiceToneParams,

  CORROSIVE_CHIME_A5: {
    type: 'sine',
    frequency: 880.00, // A5
    gain: 0.18,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.40,
  } as AudioVoiceToneParams,

  // 4. Dash Chimes: Spore Surge / Photosynthetic Dash
  SPORE_SURGE_CHIME_D5: {
    type: 'sine',
    frequency: 587.33,
    frequencyRamp: { target: 783.99, duration: 0.12, exponential: true },
    gain: 0.26,
    duration: 0.32,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.40,
    releaseTime: 0.15,
  } as AudioVoiceToneParams,

  SPORE_SURGE_CHIME_G5: {
    type: 'sine',
    frequency: 783.99,
    frequencyRamp: { target: 1046.50, duration: 0.14, exponential: true },
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.35,
    releaseTime: 0.16,
  } as AudioVoiceToneParams,

  SPORE_SURGE_AIR_SWEEP: {
    type: 'triangle',
    frequency: 880.0,
    frequencyRamp: { target: 1320.0, duration: 0.15, exponential: true },
    gain: 0.15,
    duration: 0.25,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.25,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 1200, q: 2.6 },
  } as AudioVoiceToneParams,

  // 5. Cleansing Snaps: Floral Cleansing Snap on Neutralization
  FLORAL_CLEANSE_SNAP: {
    type: 'triangle',
    frequency: 1200.0,
    frequencyRamp: { target: 320.0, duration: 0.06, exponential: true },
    gain: 0.32,
    duration: 0.15,
    attackTime: 0.001,
    decayTime: 0.04,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 1800, q: 3.5, rampTarget: 400, rampDuration: 0.07 },
  } as AudioVoiceToneParams,

  FERTILE_SOIL_BLOOM_CHIME: {
    type: 'sine',
    frequency: 1046.50, // C6
    frequencyRamp: { target: 1318.51, duration: 0.18, exponential: true }, // C6 -> E6
    gain: 0.20,
    duration: 0.28,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.30,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 1200, q: 2.0 },
  } as AudioVoiceToneParams,

  // 6. Neurotoxin Spore Wobble
  NEUROTOXIN_WOBBLE: {
    type: 'sawtooth',
    frequency: 380.0,
    frequencyRamp: { target: 190.0, duration: 0.14, exponential: true },
    gain: 0.14,
    duration: 0.20,
    attackTime: 0.01,
    decayTime: 0.06,
    sustainLevel: 0.25,
    releaseTime: 0.10,
    filter: { type: 'bandpass', frequency: 600, q: 3.0, rampTarget: 250, rampDuration: 0.12 },
  } as AudioVoiceToneParams,

  // 7. Catalytic Detonation Bonus
  CATALYTIC_DETONATION_BURST: {
    type: 'sawtooth',
    frequency: 680.0,
    frequencyRamp: { target: 80.0, duration: 0.07, exponential: true },
    gain: 0.42,
    duration: 0.18,
    attackTime: 0.002,
    decayTime: 0.05,
    sustainLevel: 0.18,
    releaseTime: 0.06,
    filter: { type: 'bandpass', frequency: 1600, q: 2.5, rampTarget: 350, rampDuration: 0.09 },
  } as AudioVoiceToneParams,

  // 8. Floral Bloom Spore Release: Botanical blossom rupture + ascending harmonic chime + spore dispersion sweep
  FLORAL_BLOOM_POD_POP: {
    type: 'sine',
    frequency: 340.0,
    frequencyRamp: { target: 88.0, duration: 0.06, exponential: true },
    gain: 0.36,
    duration: 0.12,
    attackTime: 0.002,
    decayTime: 0.04,
    sustainLevel: 0.15,
    releaseTime: 0.06,
    filter: { type: 'bandpass', frequency: 720, q: 3.2, rampTarget: 260, rampDuration: 0.07 },
  } as AudioVoiceToneParams,

  FLORAL_BLOOM_CHIME: {
    type: 'triangle',
    frequency: 698.46, // F5
    frequencyRamp: { target: 987.77, duration: 0.22, exponential: true }, // F5 -> B5 botanical bloom
    gain: 0.24,
    duration: 0.45,
    attackTime: 0.012,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.22,
    filter: { type: 'bandpass', frequency: 1250, q: 2.8, rampTarget: 1800, rampDuration: 0.25 },
  } as AudioVoiceToneParams,

  FLORAL_BLOOM_SPORE_SWEEP: {
    type: 'sine',
    frequency: 520.0,
    frequencyRamp: { target: 1040.0, duration: 0.20, exponential: true },
    gain: 0.20,
    duration: 0.38,
    attackTime: 0.02,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1400, q: 2.4, rampTarget: 750, rampDuration: 0.25 },
  } as AudioVoiceToneParams,

  FLORAL_BLOOM_RUSTLE: {
    type: 'sawtooth',
    frequency: 240.0,
    frequencyRamp: { target: 120.0, duration: 0.25, exponential: false },
    gain: 0.14,
    duration: 0.32,
    attackTime: 0.03,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 950, q: 3.2, rampTarget: 1600, rampDuration: 0.25 },
  } as AudioVoiceToneParams,
} as const;

export class MiasmaHazardAudio {
  private static instance: MiasmaHazardAudio | null = null;

  private pool: AudioVoicePool | null = null;
  private ctx: AudioContext | null = null;
  private ownsPool: boolean = false;

  // Active tracking for Zero-Leak transient audio nodes and watchdog timeouts
  private readonly activeTransientNodes: Set<AudioNode> = new Set();
  private readonly activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Cached static 500ms white noise buffer (reused permanently without GC)
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  // Rate-limiting debounce timestamps (ms)
  private lastTelegraphSoundMs: number = -Infinity;
  private lastBurstSoundMs: number = -Infinity;
  private lastNeurotoxinSoundMs: number = -Infinity;
  private lastRustleSoundMs: number = -Infinity;
  private lastCleanseSoundMs: number = -Infinity;
  private lastFloralBloomSoundMs: number = -Infinity;

  constructor(poolOrCtx?: AudioVoicePool | AudioContext | null, pool?: AudioVoicePool | null) {
    if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        this.bindPool(poolOrCtx as AudioVoicePool);
      } else {
        this.init(poolOrCtx as AudioContext, pool || undefined);
      }
    } else if (pool) {
      this.bindPool(pool);
    } else if (poolOrCtx === null) {
      this.pool = null;
    } else {
      this.pool = AudioVoicePool.getInstance(16);
    }
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): MiasmaHazardAudio {
    if (!MiasmaHazardAudio.instance) {
      MiasmaHazardAudio.instance = new MiasmaHazardAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        MiasmaHazardAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else if (!MiasmaHazardAudio.instance.ctx) {
        MiasmaHazardAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return MiasmaHazardAudio.instance;
  }

  public static resetInstance(): void {
    if (MiasmaHazardAudio.instance) {
      MiasmaHazardAudio.instance.destroy();
      MiasmaHazardAudio.instance = null;
    }
  }

  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.ctx = ctx;
    if (pool) {
      this.bindPool(pool);
      if (!pool.getAudioContext()) {
        pool.init(ctx);
      }
      this.ownsPool = false;
    } else if (!this.pool) {
      this.pool = new AudioVoicePool(16);
      this.pool.init(ctx);
      this.ownsPool = true;
    } else {
      this.pool.init(ctx);
    }

    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    if (this.ownsPool && this.pool && this.pool !== pool) {
      this.pool.destroy();
    }
    this.pool = pool;
    if (!this.ctx) {
      this.ctx = pool.getAudioContext();
    }
    this.ownsPool = false;
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
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          this.ctx = new AudioCtxClass();
          if (!this.pool) {
            this.pool = AudioVoicePool.getInstance(16);
          }
          this.pool.init(this.ctx);
        } catch {
          const closeable = this.ctx as unknown as { close?: () => Promise<void> } | null;
          if (closeable && typeof closeable.close === 'function') {
            try { void closeable.close().catch(() => {}); } catch {}
          }
          this.ctx = null;
        }
      }
    }
    return this.ctx;
  }

  public getPool(): AudioVoicePool | null {
    if (!this.pool) {
      this.pool = AudioVoicePool.getInstance(16);
      const ctx = this.getContext();
      if (ctx) {
        this.pool.init(ctx);
      }
    }
    return this.pool;
  }

  /**
   * 1. Low Frequency Hum: Deep fungal respiration drone (52Hz -> 36Hz)
   */
  public playSubDrone(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.FUNGAL_SUB_DRONE_52HZ);
  }

  public playLowFrequencyHum(): void {
    this.playSubDrone();
  }

  public playSubHum(): void {
    this.playSubDrone();
  }

  public playSporeHum(): void {
    this.playSubDrone();
  }

  public playPodSwellingHum(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.POD_INCUBATION_HUM);
    pool.playTone(MIASMA_AUDIO_PRESETS.FUNGAL_SUB_DRONE_52HZ);
  }

  /**
   * 2. Bubbling / Rustling Filter Sweeps: Spore exhalation swell & organic sweeps
   */
  public playExhalationSwell(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_EXHALATION_SWELL);
  }

  public playBubblingRustle(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_EXHALATION_SWELL);
    pool.playTone(MIASMA_AUDIO_PRESETS.ORGANIC_BUBBLING_CHIRP);
    this.playFilteredNoiseBurst(0.20, 650, 280, 0.09);
  }

  public playVegetativeRustle(
    duration: number = 0.25,
    cutoffHz: number = 850
  ): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.VEGETATIVE_RUSTLE_SWEEP);
    this.playFilteredNoiseBurst(duration, cutoffHz, 300, 0.08);
  }

  public playOrganicBubbling(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.ORGANIC_BUBBLING_CHIRP);
  }

  public playBloomImminentPulse(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.POD_INCUBATION_HUM);
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_EXHALATION_SWELL);
    this.playFilteredNoiseBurst(0.30, 1100, 400, 0.14);
  }

  /**
   * 3. Burst Crack: Corrosive bio-burst detonation crack + sub-thud + harmonic chord
   */
  public playBurstCrack(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_BURST_CRACK);
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_SUB_THUD);
  }

  public playCorrosiveBurst(): void {
    const pool = this.getPool();
    if (!pool) return;
    // 1. Transient burst crack + sub thud
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_BURST_CRACK);
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_SUB_THUD);

    // 2. D major emerald harmonic triad
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_CHIME_D5);
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_CHIME_FSHARP5);
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_CHIME_A5);

    // 3. Procedural chemical spore burst noise
    this.playFilteredNoiseBurst(0.22, 2200, 350, 0.22);
  }

  public playCatalyticDetonation(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.CATALYTIC_DETONATION_BURST);
    pool.playTone(MIASMA_AUDIO_PRESETS.CORROSIVE_CHIME_A5);
  }

  public playBioSlickKick(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_SURGE_AIR_SWEEP);
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_SURGE_CHIME_G5);
  }

  /**
   * 4. Dash Chimes: Spore Surge / Photosynthetic Dash
   */
  public playDashChimes(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_SURGE_CHIME_D5);
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_SURGE_CHIME_G5);
    pool.playTone(MIASMA_AUDIO_PRESETS.SPORE_SURGE_AIR_SWEEP);
  }

  public playSporeSurgeChime(): void {
    this.playDashChimes();
  }

  public playSporeSurge(): void {
    this.playDashChimes();
  }

  /**
   * 5. Cleansing Snaps: Floral Cleansing Snap on Neutralization
   */
  public playCleansingSnap(nowMs: number = Date.now()): void {
    if (nowMs - this.lastCleanseSoundMs < 120) return;
    this.lastCleanseSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.FLORAL_CLEANSE_SNAP);
    pool.playTone(MIASMA_AUDIO_PRESETS.FERTILE_SOIL_BLOOM_CHIME);
  }

  public playFloralCleanseSnap(nowMs: number = Date.now()): void {
    this.playCleansingSnap(nowMs);
  }

  /**
   * 6. Debuff: Neurotoxin Spore Wobble
   */
  public playNeurotoxin(nowMs: number = Date.now()): void {
    if (nowMs - this.lastNeurotoxinSoundMs < 400) return;
    this.lastNeurotoxinSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(MIASMA_AUDIO_PRESETS.NEUROTOXIN_WOBBLE);
  }

  public playNeurotoxinWobble(nowMs: number = Date.now()): void {
    this.playNeurotoxin(nowMs);
  }

  /**
   * 7. Floral Bloom Spore Release:
   * Plays composite botanical rupture:
   * 1. Organic pod cavitation pop (340 Hz -> 88 Hz)
   * 2. Resonant botanical blossom chime (F5 -> B5)
   * 3. Spore dispersion sweep (520 Hz -> 1040 Hz)
   * 4. Vegetative foliage rustle (240 Hz -> 120 Hz)
   * 5. Filtered procedural white noise puff of microscopic spore diffusion (1600 Hz -> 650 Hz bandpass)
   * Zero-GC, zero-leak, zero audio asset dependencies.
   */
  public playFloralBloomSporeRelease(nowMs: number = Date.now()): void {
    if (nowMs - this.lastFloralBloomSoundMs < 200) return;
    this.lastFloralBloomSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_POD_POP);
    pool.playTone(MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_CHIME);
    pool.playTone(MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_SPORE_SWEEP);
    pool.playTone(MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_RUSTLE);

    // Procedural spore diffusion cloud noise burst
    this.playFilteredNoiseBurst(0.28, 1600, 650, 0.16);
  }

  /**
   * State Machine Audio Event Dispatcher
   */
  public playMiasmaHazardState(
    state: MiasmaLifecycleState,
    telegraphPhase: MiasmaTelegraphPhase = MiasmaTelegraphPhase.NONE,
    nowMs: number = Date.now()
  ): void {
    if (state === MiasmaLifecycleState.SPORE_INCUBATION) {
      if (telegraphPhase === MiasmaTelegraphPhase.POD_SWELLING) {
        if (nowMs - this.lastTelegraphSoundMs >= 500) {
          this.lastTelegraphSoundMs = nowMs;
          this.playPodSwellingHum();
        }
      } else if (telegraphPhase === MiasmaTelegraphPhase.SPORE_EXHALATION) {
        if (nowMs - this.lastTelegraphSoundMs >= 350) {
          this.lastTelegraphSoundMs = nowMs;
          this.playBubblingRustle();
        }
      } else if (telegraphPhase === MiasmaTelegraphPhase.BLOOM_IMMINENT) {
        if (nowMs - this.lastTelegraphSoundMs >= 300) {
          this.lastTelegraphSoundMs = nowMs;
          this.playBloomImminentPulse();
        }
      } else {
        if (nowMs - this.lastTelegraphSoundMs >= 500) {
          this.lastTelegraphSoundMs = nowMs;
          this.playSubDrone();
        }
      }
    } else if (state === MiasmaLifecycleState.CORROSIVE_BURST) {
      if (nowMs - this.lastBurstSoundMs >= 400) {
        this.lastBurstSoundMs = nowMs;
        this.playCorrosiveBurst();
      }
    }
  }

  /**
   * Reusable static 500ms white noise buffer (reused without runtime GC)
   */
  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (
      MiasmaHazardAudio.cachedNoiseBuffer &&
      MiasmaHazardAudio.cachedNoiseSampleRate === ctx.sampleRate
    ) {
      return MiasmaHazardAudio.cachedNoiseBuffer;
    }

    try {
      const sampleRate = ctx.sampleRate || 44100;
      const length = Math.max(256, Math.floor(sampleRate * 0.5));
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      MiasmaHazardAudio.cachedNoiseBuffer = buffer;
      MiasmaHazardAudio.cachedNoiseSampleRate = sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  /**
   * Procedural filtered white noise burst with zero-leak active tracking
   */
  public playFilteredNoiseBurst(
    duration: number = 0.20,
    startFreq: number = 1000,
    endFreq: number = 200,
    gainLevel: number = 0.15
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const buffer = this.getSharedNoiseBuffer(ctx);
      if (!buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.max(20, startFreq), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      filter.Q.setValueAtTime(2.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0001, gainLevel), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gain);

      this.wireAutoDisconnect(source, filter, gain, duration);
      try {
        source.start(now);
        source.stop(now + duration);
      } catch {
        try {
          source.onended = null;
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {}
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gain);
      }
    } catch {
      // Safe fallback for restricted audio contexts or headless environments
    }
  }

  private wireAutoDisconnect(
    source: AudioScheduledSourceNode,
    filter: BiquadFilterNode,
    gain: GainNode,
    durationSec: number
  ): void {
    let disconnected = false;
    let tid: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (disconnected) return;
      disconnected = true;

      if (tid !== null) {
        clearTimeout(tid);
        this.activeTimeouts.delete(tid);
      }

      try {
        source.onended = null;
      } catch {}
      try {
        source.disconnect();
      } catch {}
      try {
        filter.disconnect();
      } catch {}
      try {
        gain.disconnect();
      } catch {}

      this.activeTransientNodes.delete(source);
      this.activeTransientNodes.delete(filter);
      this.activeTransientNodes.delete(gain);
    };

    source.onended = cleanup;
    tid = setTimeout(cleanup, Math.ceil((durationSec + 0.1) * 1000));
    this.activeTimeouts.add(tid);
  }

  public clearPendingNodes(): void {
    for (const tid of this.activeTimeouts) {
      clearTimeout(tid);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        const stopNode = node as AudioScheduledSourceNode;
        if ('onended' in stopNode) {
          stopNode.onended = null;
        }
        if (typeof stopNode.stop === 'function') {
          try {
            stopNode.stop();
          } catch {}
        }
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  public reset(): void {
    if (this.pool) {
      this.pool.reset();
    }
    this.clearPendingNodes();
    this.lastTelegraphSoundMs = -Infinity;
    this.lastBurstSoundMs = -Infinity;
    this.lastNeurotoxinSoundMs = -Infinity;
    this.lastRustleSoundMs = -Infinity;
    this.lastCleanseSoundMs = -Infinity;
  }

  public stop(): void {
    this.reset();
  }

  public disconnect(): void {
    this.destroy();
  }

  public destroy(): void {
    this.stop();
    if (this.pool) {
      if (this.ownsPool) {
        this.pool.destroy();
      } else {
        this.pool.reset();
      }
      this.pool = null;
    }
    const closeable = this.ctx as unknown as { close?: () => Promise<void> } | null;
    if (closeable && typeof closeable.close === 'function') {
      try { void closeable.close().catch(() => {}); } catch {}
    }
    this.ctx = null;
    if (MiasmaHazardAudio.instance === this) {
      MiasmaHazardAudio.instance = null;
    }
  }
}
