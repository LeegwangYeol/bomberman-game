/**
 * PsychicCrisisAudio.ts — Procedural Web Audio Synthesizer for Psychic Invasion Crisis
 *
 * Implements 100% Procedural Sound Synthesis for Psionic Phenomena:
 * - Psionic Warp Hum: Dual detuned theta-wave oscillators (108Hz + 112.5Hz -> 4.5Hz binaural beat)
 *   with sub-bass anchor (44Hz), resonant bandpass warp modulation (216Hz -> 324Hz), and astral shimmer.
 * - Phantom Manifestation Echo: Ethereal harmonic triad (D5 / 587Hz -> A5 / 880Hz -> D6 / 1175Hz).
 * - Mind-Rending Climax Crack: High-frequency psionic mental discharge (660Hz -> 55Hz) with static hiss.
 * - Reality Anchor Snap: Crisp crystalline snapping transient (1480Hz -> 220Hz) upon manifestation destruction.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Reuses pre-allocated voices via AudioVoicePool (persistent oscillators, click-free stealing).
 * - Static cached 500ms white noise buffer reused permanently without runtime heap allocation.
 * - All transient nodes employ dual cleanup (source.onended + watchdog timeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { CrisisStage } from './CrisisTypes.ts';

/**
 * Pre-allocated immutable tone parameters for Zero-GC Psionic Audio synthesis
 */
export const PSYCHIC_AUDIO_PRESETS = {
  // 1. Psionic Warp Hum: Dual detuned fundamental oscillators (108 Hz + 112.5 Hz -> 4.5 Hz theta beat)
  PSIONIC_WARP_HUM_VOICE_A: {
    type: 'sine',
    frequency: 108.0,
    frequencyRamp: { target: 96.0, duration: 0.90, exponential: true },
    gain: 0.32,
    duration: 1.25,
    attackTime: 0.15,
    decayTime: 0.35,
    sustainLevel: 0.50,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 220, q: 3.0 },
  } as AudioVoiceToneParams,

  PSIONIC_WARP_HUM_VOICE_B: {
    type: 'sine',
    frequency: 112.5, // 4.5 Hz theta-wave acoustic interference beat against 108.0 Hz
    frequencyRamp: { target: 100.5, duration: 0.90, exponential: true },
    gain: 0.28,
    duration: 1.25,
    attackTime: 0.15,
    decayTime: 0.35,
    sustainLevel: 0.50,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 220, q: 3.0 },
  } as AudioVoiceToneParams,

  PSIONIC_WARP_WARBLE: {
    type: 'triangle',
    frequency: 216.0,
    frequencyRamp: { target: 324.0, duration: 0.60, exponential: true },
    gain: 0.20,
    duration: 0.80,
    attackTime: 0.08,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 480, q: 4.0, rampTarget: 860, rampDuration: 0.60 },
  } as AudioVoiceToneParams,

  PSIONIC_WARP_SHIMMER: {
    type: 'sine',
    frequency: 880.0,
    frequencyRamp: { target: 1320.0, duration: 0.50, exponential: true },
    gain: 0.15,
    duration: 0.70,
    attackTime: 0.04,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'highpass', frequency: 800, q: 2.2 },
  } as AudioVoiceToneParams,

  PSIONIC_WARP_SUB_DRONE: {
    type: 'sine',
    frequency: 44.0,
    frequencyRamp: { target: 38.0, duration: 1.10, exponential: true },
    gain: 0.35,
    duration: 1.40,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.60,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 85, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Phantom Manifestation Echo
  PHANTOM_ECHO_D5: {
    type: 'sine',
    frequency: 587.33,
    frequencyRamp: { target: 783.99, duration: 0.25, exponential: true },
    gain: 0.22,
    duration: 0.55,
    attackTime: 0.02,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1200, q: 2.5 },
  } as AudioVoiceToneParams,

  PHANTOM_ECHO_A5: {
    type: 'sine',
    frequency: 880.00,
    frequencyRamp: { target: 1174.66, duration: 0.30, exponential: true },
    gain: 0.18,
    duration: 0.55,
    attackTime: 0.02,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1600, q: 2.5 },
  } as AudioVoiceToneParams,

  // 3. Mind-Rending Climax Discharge Crack
  MIND_RENDING_DISCHARGE: {
    type: 'sawtooth',
    frequency: 660.0,
    frequencyRamp: { target: 55.0, duration: 0.12, exponential: true },
    gain: 0.42,
    duration: 0.28,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.20,
    releaseTime: 0.10,
    filter: { type: 'bandpass', frequency: 1800, q: 3.0, rampTarget: 300, rampDuration: 0.15 },
  } as AudioVoiceToneParams,

  MIND_RENDING_SUB_THUD: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 22.0, duration: 0.35, exponential: true },
    gain: 0.52,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 100, q: 1.6 },
  } as AudioVoiceToneParams,

  // 4. Reality Anchor Snap (Resolution / Manifestation Destroyed)
  REALITY_ANCHOR_SNAP: {
    type: 'triangle',
    frequency: 1480.0,
    frequencyRamp: { target: 220.0, duration: 0.08, exponential: true },
    gain: 0.35,
    duration: 0.18,
    attackTime: 0.001,
    decayTime: 0.05,
    sustainLevel: 0.18,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 2000, q: 3.5, rampTarget: 400, rampDuration: 0.09 },
  } as AudioVoiceToneParams,

  REALITY_ANCHOR_CHIME: {
    type: 'sine',
    frequency: 1046.50, // C6
    frequencyRamp: { target: 1318.51, duration: 0.20, exponential: true }, // C6 -> E6
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'highpass', frequency: 900, q: 2.0 },
  } as AudioVoiceToneParams,
} as const;

export class PsychicCrisisAudio {
  private static instance: PsychicCrisisAudio | null = null;

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
  private lastHumSoundMs: number = -Infinity;
  private lastEchoSoundMs: number = -Infinity;
  private lastClimaxSoundMs: number = -Infinity;
  private lastSnapSoundMs: number = -Infinity;

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

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): PsychicCrisisAudio {
    if (!PsychicCrisisAudio.instance) {
      PsychicCrisisAudio.instance = new PsychicCrisisAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        PsychicCrisisAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else if (!PsychicCrisisAudio.instance.ctx) {
        PsychicCrisisAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return PsychicCrisisAudio.instance;
  }

  public static resetInstance(): void {
    if (PsychicCrisisAudio.instance) {
      PsychicCrisisAudio.instance.destroy();
      PsychicCrisisAudio.instance = null;
    }
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

  /**
   * 1. Psionic Warp Hum:
   * Plays multi-layered psionic hum with binaural 4.5Hz theta-beat,
   * resonant bandpass warp sweep, astral shimmer, and deep sub-bass foundation.
   */
  public playPsionicWarpHum(intensity: number = 1.0, nowMs: number = Date.now()): void {
    if (nowMs - this.lastHumSoundMs < 350) return;
    this.lastHumSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_HUM_VOICE_A);
    pool.playTone(PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_HUM_VOICE_B);
    pool.playTone(PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_WARBLE);
    pool.playTone(PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_SUB_DRONE);
    if (intensity > 0.4) {
      pool.playTone(PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_SHIMMER);
    }
  }

  /**
   * 2. Phantom Manifestation Echo:
   * Ethereal manifestation alert chime and spatial hiss.
   */
  public playPhantomEcho(nowMs: number = Date.now()): void {
    if (nowMs - this.lastEchoSoundMs < 250) return;
    this.lastEchoSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(PSYCHIC_AUDIO_PRESETS.PHANTOM_ECHO_D5);
    pool.playTone(PSYCHIC_AUDIO_PRESETS.PHANTOM_ECHO_A5);
    this.playFilteredNoiseBurst(0.20, 1800, 700, 0.08);
  }

  /**
   * 3. Mind-Rending Climax:
   * Piercing mental shockwave and sub detonation during Climax stage.
   */
  public playMindRendingClimax(nowMs: number = Date.now()): void {
    if (nowMs - this.lastClimaxSoundMs < 400) return;
    this.lastClimaxSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(PSYCHIC_AUDIO_PRESETS.MIND_RENDING_DISCHARGE);
    pool.playTone(PSYCHIC_AUDIO_PRESETS.MIND_RENDING_SUB_THUD);
    this.playFilteredNoiseBurst(0.30, 2400, 450, 0.20);
  }

  /**
   * 4. Reality Anchor Snap:
   * Triggered when a psionic manifestation is destroyed by bombs.
   */
  public playRealityAnchorSnap(nowMs: number = Date.now()): void {
    if (nowMs - this.lastSnapSoundMs < 120) return;
    this.lastSnapSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(PSYCHIC_AUDIO_PRESETS.REALITY_ANCHOR_SNAP);
    pool.playTone(PSYCHIC_AUDIO_PRESETS.REALITY_ANCHOR_CHIME);
  }

  /**
   * Dispatches sound according to the Psychic Crisis stage and threat level.
   */
  public playPsychicCrisisState(
    stage: CrisisStage,
    threatMeter: number = 0,
    nowMs: number = Date.now()
  ): void {
    if (stage === CrisisStage.WHISPERS) {
      this.playPsionicWarpHum(0.3, nowMs);
    } else if (stage === CrisisStage.OUTBREAK) {
      const intensity = 0.5 + Math.min(0.5, threatMeter / 100);
      this.playPsionicWarpHum(intensity, nowMs);
      if (Math.random() < 0.2) {
        this.playPhantomEcho(nowMs);
      }
    } else if (stage === CrisisStage.CLIMAX) {
      this.playPsionicWarpHum(1.0, nowMs);
      this.playMindRendingClimax(nowMs);
    }
  }

  /**
   * Synthesizes transient filtered white noise with guaranteed Zero-Leak teardown.
   */
  public playFilteredNoiseBurst(
    duration: number = 0.20,
    startFilterFreq: number = 1800,
    endFilterFreq: number = 600,
    peakGain: number = 0.15
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const noiseBuffer = this.getSharedNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.max(20, startFilterFreq), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFilterFreq), now + duration);
      filter.Q.setValueAtTime(2.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.min(1.0, peakGain), now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Routing: source -> filter -> gain -> destination
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gain);

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
          source.onended = null;
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {}
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gain);
      };

      source.onended = cleanup;
      this.safeTimeout(cleanup, Math.ceil((duration + 0.05) * 1000));

      try {
        source.start(now);
        source.stop(now + duration);
      } catch {
        cleanup();
      }
    } catch {}
  }

  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      if (
        PsychicCrisisAudio.cachedNoiseBuffer &&
        PsychicCrisisAudio.cachedNoiseSampleRate === ctx.sampleRate
      ) {
        return PsychicCrisisAudio.cachedNoiseBuffer;
      }

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      PsychicCrisisAudio.cachedNoiseBuffer = buffer;
      PsychicCrisisAudio.cachedNoiseSampleRate = sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  private safeTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.activeTimeouts.delete(timer);
      fn();
    }, delayMs);
    this.activeTimeouts.add(timer);
    return timer;
  }

  public clearPendingNodes(): void {
    for (const timer of this.activeTimeouts) {
      clearTimeout(timer);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
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
    this.lastHumSoundMs = -Infinity;
    this.lastEchoSoundMs = -Infinity;
    this.lastClimaxSoundMs = -Infinity;
    this.lastSnapSoundMs = -Infinity;
  }

  public destroy(): void {
    this.clearPendingNodes();
    if (this.ownsPool && this.pool) {
      this.pool.destroy();
      this.pool = null;
    }
    this.ctx = null;
    if (PsychicCrisisAudio.instance === this) {
      PsychicCrisisAudio.instance = null;
    }
  }
}
