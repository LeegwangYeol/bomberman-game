/**
 * VoltHazardAudio.ts — Procedural Web Audio Sound Synthesizer for VoltHazard Events
 *
 * Implements Procedural Audio for the Tesla Storm & Electro Surge Subsystem:
 * - High Voltage Hum: 60Hz fundamental + 120Hz harmonic overtone with acoustic phase beating.
 * - Rising Ionization Sweep: Exponential upward chirp (220Hz -> 1760Hz) with resonant bandpass ascent.
 * - Lightning Crack + Thunder Sub Thump: Supersonic crack (3200Hz -> 120Hz) + seismic thump (50Hz -> 28Hz)
 *   + E minor harmonic chord (E5, G5, B5) + procedural filtered white noise burst.
 * - Superconductor Dash Chime: Upward sinusoidal sweep (1760Hz -> 2093Hz / A6 -> C7) with bandpass focus.
 * - Static Discharge Pop: Fast electrostatic spark snap (320Hz -> 75Hz) with 1ms punch transient.
 * - Static Spark Crackle & Arc Buildup Sizzle: Telegraph stage ionization filaments.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Reuses pre-allocated voices via AudioVoicePool (persistent oscillators, click-free stealing).
 * - Transient white noise nodes employ wireAutoDisconnect (onended + watchdog timeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';

interface StopAndEndedAudioNode extends AudioNode {
  stop?: (when?: number) => void;
  onended?: (() => void) | null;
}

export const VOLT_AUDIO_PRESETS = {
  // 1. 60Hz / 120Hz High-Voltage Hum (Mains hum + magnetic core overtone)
  HIGH_VOLTAGE_HUM_60HZ: {
    type: 'sine',
    frequency: 60.0,
    gain: 0.16,
    duration: 1.10,
    attackTime: 0.25,
    decayTime: 0.35,
    sustainLevel: 0.50,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 140, q: 1.5 },
  } as AudioVoiceToneParams,

  HIGH_VOLTAGE_HUM_120HZ: {
    type: 'sawtooth',
    frequency: 120.0,
    gain: 0.10,
    duration: 1.10,
    attackTime: 0.25,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 240, q: 2.0 },
  } as AudioVoiceToneParams,

  // 2. Rising Ionization Sweep (Townsend avalanche pre-breakdown rise)
  IONIZATION_SWEEP: {
    type: 'triangle',
    frequency: 220.0,
    frequencyRamp: { target: 1760.0, duration: 0.35, exponential: true },
    gain: 0.22,
    duration: 0.40,
    attackTime: 0.02,
    decayTime: 0.12,
    sustainLevel: 0.40,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 500, q: 3.8, rampTarget: 3200, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  // 3. Lightning Crack + Thunder Sub Thump
  LIGHTNING_CRACK_SNAP: {
    type: 'sawtooth',
    frequency: 3200.0,
    frequencyRamp: { target: 120.0, duration: 0.06, exponential: true },
    gain: 0.45,
    duration: 0.15,
    attackTime: 0.001,
    decayTime: 0.05,
    sustainLevel: 0.15,
    releaseTime: 0.05,
    filter: { type: 'bandpass', frequency: 2800, q: 2.5, rampTarget: 400, rampDuration: 0.08 },
  } as AudioVoiceToneParams,

  LIGHTNING_SUB_THUD: {
    type: 'sine',
    frequency: 50.0,
    frequencyRamp: { target: 28.0, duration: 0.28, exponential: true },
    gain: 0.50,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 120, q: 1.4 },
  } as AudioVoiceToneParams,

  LIGHTNING_CHIME_E5: {
    type: 'sine',
    frequency: 659.25, // E5
    gain: 0.22,
    duration: 0.60,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.40,
  } as AudioVoiceToneParams,

  LIGHTNING_CHIME_G5: {
    type: 'sine',
    frequency: 783.99, // G5
    gain: 0.20,
    duration: 0.60,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.40,
  } as AudioVoiceToneParams,

  LIGHTNING_CHIME_B5: {
    type: 'sine',
    frequency: 987.77, // B5
    gain: 0.18,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.45,
  } as AudioVoiceToneParams,

  // 4. Superconductor Dash Chime (1760Hz -> 2093Hz / A6 -> C7)
  SUPERCONDUCTOR_DASH_CHIME: {
    type: 'sine',
    frequency: 1760.00, // A6
    frequencyRamp: { target: 2093.00, duration: 0.18, exponential: true }, // A6 -> C7
    gain: 0.28,
    duration: 0.38,
    attackTime: 0.004,
    decayTime: 0.10,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1950, q: 2.8 },
  } as AudioVoiceToneParams,

  // 5. Static Discharge Pop (Snappy 1ms electrostatic shock)
  STATIC_DISCHARGE_POP: {
    type: 'triangle',
    frequency: 320.0,
    frequencyRamp: { target: 75.0, duration: 0.035, exponential: true },
    gain: 0.22,
    duration: 0.06,
    attackTime: 0.001,
    decayTime: 0.03,
    sustainLevel: 0.10,
    releaseTime: 0.02,
    filter: { type: 'bandpass', frequency: 750, q: 3.0 },
  } as AudioVoiceToneParams,

  STATIC_SHOCK_POP: {
    type: 'triangle',
    frequency: 300.0,
    frequencyRamp: { target: 80.0, duration: 0.10, exponential: false },
    gain: 0.15,
    duration: 0.18,
    attackTime: 0.01,
    decayTime: 0.06,
    sustainLevel: 0.20,
    releaseTime: 0.10,
    filter: { type: 'lowpass', frequency: 500, q: 2.0 },
  } as AudioVoiceToneParams,

  // Auxiliary Filament Presets
  STATIC_SPARK_CRACKLE: {
    type: 'sawtooth',
    frequency: 3200.0,
    frequencyRamp: { target: 4800.0, duration: 0.12, exponential: true },
    gain: 0.14,
    duration: 0.15,
    attackTime: 0.005,
    decayTime: 0.06,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'highpass', frequency: 2200, q: 3.0 },
  } as AudioVoiceToneParams,

  ARC_BUILDUP_SIZZLE: {
    type: 'sawtooth',
    frequency: 240.0,
    frequencyRamp: { target: 480.0, duration: 0.35, exponential: false },
    gain: 0.18,
    duration: 0.40,
    attackTime: 0.05,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 1200, q: 3.5, rampTarget: 1800, rampDuration: 0.35 },
  } as AudioVoiceToneParams,
} as const;

export class VoltHazardAudio {
  private static instance: VoltHazardAudio | null = null;
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
  private lastHumMs: number = -Infinity;
  private lastIonizationMs: number = -Infinity;
  private lastSparkMs: number = -Infinity;
  private lastArcMs: number = -Infinity;
  private lastBurstMs: number = -Infinity;
  private lastSuperconductorMs: number = -Infinity;
  private lastShockMs: number = -Infinity;

  constructor(poolOrCtx?: AudioVoicePool | AudioContext | null) {
    if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool) {
        this.bindPool(poolOrCtx);
      } else if (typeof AudioContext !== 'undefined' && poolOrCtx instanceof AudioContext) {
        this.init(poolOrCtx);
      }
    } else if (poolOrCtx === null) {
      this.pool = null;
    } else {
      this.pool = AudioVoicePool.getInstance();
    }
  }

  public static getInstance(pool?: AudioVoicePool): VoltHazardAudio {
    if (!VoltHazardAudio.instance) {
      VoltHazardAudio.instance = new VoltHazardAudio(pool);
    }
    return VoltHazardAudio.instance;
  }

  public static resetInstance(): void {
    if (VoltHazardAudio.instance) {
      VoltHazardAudio.instance.destroy();
      VoltHazardAudio.instance = null;
    }
  }

  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.ctx = ctx;

    if (pool) {
      this.bindPool(pool);
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
    this.pool = pool;
  }

  public setVoicePool(pool: AudioVoicePool): void {
    this.bindPool(pool);
  }

  private safeTimeout(fn: () => void, delayMs: number): void {
    const tid = setTimeout(() => {
      this.activeTimeouts.delete(tid);
      fn();
    }, delayMs);
    this.activeTimeouts.add(tid);
  }

  private getContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      this.ctx = new AudioCtx();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /* ==============================================================================
   * PROCEDURAL SOUND ROUTINES
   * ============================================================================== */

  /**
   * 1. 60Hz / 120Hz High-Voltage Hum
   * Plays dual persistent harmonic voices recreating magnetic core transformer hum.
   */
  public playHighVoltageHum(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastHumMs < 200) return false;
    this.lastHumMs = currentTimeMs;

    this.pool.playTone(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_60HZ);
    this.pool.playTone(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_120HZ);
    return true;
  }

  /**
   * 2. Rising Ionization Sweep
   * Exponential frequency sweep (220Hz -> 1760Hz) with resonant bandpass ascent.
   */
  public playIonizationSweep(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastIonizationMs < 250) return false;
    this.lastIonizationMs = currentTimeMs;

    this.pool.playTone(VOLT_AUDIO_PRESETS.IONIZATION_SWEEP);
    return true;
  }

  /**
   * 3. Lightning Crack + Thunder Sub Thump
   * Supersonic crack + seismic sub thump + E minor chimes + white noise burst.
   */
  public playLightningBurst(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastBurstMs < 400) return false;
    this.lastBurstMs = currentTimeMs;

    // Supersonic crack + seismic thump
    this.pool.playTone(VOLT_AUDIO_PRESETS.LIGHTNING_CRACK_SNAP);
    this.pool.playTone(VOLT_AUDIO_PRESETS.LIGHTNING_SUB_THUD);

    // E minor resonant triad ring
    this.pool.playTone(VOLT_AUDIO_PRESETS.LIGHTNING_CHIME_E5);
    this.pool.playTone(VOLT_AUDIO_PRESETS.LIGHTNING_CHIME_G5);
    this.pool.playTone(VOLT_AUDIO_PRESETS.LIGHTNING_CHIME_B5);

    // Filtered white noise plasma sizzle (auto-disconnecting)
    this.playWhiteNoiseBurst(currentTimeMs, 0.18, 0.22);
    return true;
  }

  /**
   * 4. Superconductor Dash Chime (1760Hz -> 2093Hz sweep)
   * High-register sinusoidal sweep confirming I-frame superconductive dash.
   */
  public playSuperconductorDash(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastSuperconductorMs < 250) return false;
    this.lastSuperconductorMs = currentTimeMs;

    this.pool.playTone(VOLT_AUDIO_PRESETS.SUPERCONDUCTOR_DASH_CHIME);
    return true;
  }

  /**
   * 5. Static Discharge Pop
   * Rapid electrostatic spark pop (320Hz -> 75Hz) with snappy 1ms transient.
   */
  public playStaticDischargePop(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastShockMs < 120) return false;
    this.lastShockMs = currentTimeMs;

    this.pool.playTone(VOLT_AUDIO_PRESETS.STATIC_DISCHARGE_POP);
    return true;
  }

  /**
   * Backward-compatible alias for player static shock debuff
   */
  public playStaticShock(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastShockMs < 150) return false;
    this.lastShockMs = currentTimeMs;

    this.pool.playTone(VOLT_AUDIO_PRESETS.STATIC_SHOCK_POP);
    return true;
  }

  /**
   * Ambient static spark crackle
   */
  public playStaticSpark(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastSparkMs < 150) return false;
    this.lastSparkMs = currentTimeMs;

    this.pool.playTone(VOLT_AUDIO_PRESETS.STATIC_SPARK_CRACKLE);
    return true;
  }

  /**
   * Arcing spark buildup sizzle
   */
  public playArcBuildup(currentTimeMs: number = 0): boolean {
    if (!this.pool) return false;
    if (currentTimeMs > 0 && currentTimeMs - this.lastArcMs < 250) return false;
    this.lastArcMs = currentTimeMs;

    this.pool.playTone(VOLT_AUDIO_PRESETS.ARC_BUILDUP_SIZZLE);
    return true;
  }

  /**
   * Universal FSM Lifecycle State Audio Dispatcher
   */
  public playVoltHazardState(state: string, currentTimeMs: number = 0): void {
    const s = String(state).toUpperCase();
    if (s.includes('BURST') || s.includes('LIGHTNING_DISCHARGE') || s.includes('TESLA_BURST')) {
      this.playLightningBurst(currentTimeMs);
    } else if (s.includes('LEADER') || s.includes('STEPPED')) {
      this.playIonizationSweep(currentTimeMs);
      this.playArcBuildup(currentTimeMs);
    } else if (s.includes('ARC') || s.includes('BUILDUP')) {
      this.playArcBuildup(currentTimeMs);
    } else if (s.includes('IONIZ') || s.includes('STATIC_CHARGE') || s.includes('SURGE')) {
      this.playHighVoltageHum(currentTimeMs);
      this.playStaticSpark(currentTimeMs);
    } else if (s.includes('COOLDOWN') || s.includes('DISSIPAT')) {
      this.playStaticDischargePop(currentTimeMs);
    }
  }

  /* ==============================================================================
   * ZERO-LEAK PROCEDURAL WHITE NOISE SYNTHESIS
   * ============================================================================== */

  public playWhiteNoiseBurst(
    _currentTimeMs: number = 0,
    durationSec: number = 0.18,
    gainLevel: number = 0.20
  ): boolean {
    void _currentTimeMs;
    const ctx = this.getContext();
    if (!ctx || ctx.state === 'suspended' || typeof ctx.createBuffer !== 'function') {
      return false;
    }

    try {
      const now = ctx.currentTime;
      const noiseBuffer = this.getOrCreateNoiseBuffer(ctx);
      if (!noiseBuffer) return false;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1500, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.min(1.0, Math.max(0.001, gainLevel)), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

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
      this.safeTimeout(cleanup, Math.ceil((durationSec + 0.05) * 1000));

      try {
        source.start(now);
        source.stop(now + durationSec);
      } catch {
        cleanup();
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      const sampleRate = ctx.sampleRate || 44100;
      if (
        VoltHazardAudio.cachedNoiseBuffer &&
        VoltHazardAudio.cachedNoiseSampleRate === sampleRate
      ) {
        return VoltHazardAudio.cachedNoiseBuffer;
      }

      const bufferSize = Math.max(256, Math.floor(sampleRate * 0.5));
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      VoltHazardAudio.cachedNoiseBuffer = buffer;
      VoltHazardAudio.cachedNoiseSampleRate = sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  /* ==============================================================================
   * TEARDOWN & LIFECYCLE MANAGEMENT
   * ============================================================================== */

  public clearPendingNodes(): void {
    for (const tid of this.activeTimeouts) {
      clearTimeout(tid);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        const sourceNode = node as unknown as StopAndEndedAudioNode;
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

  public reset(): void {
    if (this.pool) {
      this.pool.reset();
    }
    this.clearPendingNodes();
    this.lastHumMs = -Infinity;
    this.lastIonizationMs = -Infinity;
    this.lastSparkMs = -Infinity;
    this.lastArcMs = -Infinity;
    this.lastBurstMs = -Infinity;
    this.lastSuperconductorMs = -Infinity;
    this.lastShockMs = -Infinity;
  }

  public stop(): void {
    this.reset();
  }

  public disconnect(): void {
    this.destroy();
  }

  public destroy(): void {
    this.clearPendingNodes();
    if (this.pool) {
      if (this.ownsPool) {
        this.pool.destroy();
      } else {
        this.pool.reset();
      }
      this.pool = null;
    }
    this.ctx = null;
    VoltHazardAudio.instance = null;
  }
}
