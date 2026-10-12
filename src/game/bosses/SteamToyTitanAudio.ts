/**
 * SteamToyTitanAudio.ts — Procedural Web Audio Sound Synthesizer for Steam Toy Titan
 *
 * Implements 100% Procedural Sound Synthesis for the Clockwork Arch-Inventor:
 * - Brass Gear Hums (80Hz to 160Hz): Dual detuned oscillators (80Hz + 83.5Hz -> 3.5Hz mechanical flutter),
 *   160Hz harmonic brass overtone, and exponential acceleration windups (80Hz -> 160Hz/240Hz).
 * - Steam Hiss Bursts (Zero-GC White Noise): Static cached 500ms AudioBuffer with sweeping bandpass filters
 *   simulating high-pressure pneumatic valve releases.
 * - Heavy Mallet Clank Impact: 4-layer physical synthesis:
 *   1) Punchy low-mid sweep (220Hz -> 42Hz)
 *   2) Sub-bass seismic thud (58Hz -> 24Hz)
 *   3) Inharmonic brass & metal ring (880Hz + 1760Hz overtone sheen)
 *   4) 35ms transient noise impact crack.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Tonal sound events routed strictly through pre-allocated AudioVoicePool (16 voices).
 * - Static shared AudioBuffer for white noise permanently avoids heap allocations.
 * - Transient noise nodes employ dual cleanup (source.onended + watchdog safeTimeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';

export const STEAM_TITAN_AUDIO_PRESETS = {
  // 1. Brass Gear Hums (80Hz to 160Hz)
  BRASS_GEAR_HUM_80HZ: {
    type: 'sawtooth',
    frequency: 80.0,
    gain: 0.16,
    duration: 0.80,
    attackTime: 0.08,
    decayTime: 0.25,
    sustainLevel: 0.50,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 220, q: 2.2 },
  } as AudioVoiceToneParams,

  BRASS_GEAR_DETUNE_83HZ: {
    type: 'sine',
    frequency: 83.5, // 3.5Hz mechanical cog-meshing flutter against 80.0Hz
    gain: 0.14,
    duration: 0.80,
    attackTime: 0.08,
    decayTime: 0.25,
    sustainLevel: 0.50,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 200, q: 1.8 },
  } as AudioVoiceToneParams,

  BRASS_GEAR_OVERTONE_160HZ: {
    type: 'square',
    frequency: 160.0,
    gain: 0.10,
    duration: 0.70,
    attackTime: 0.06,
    decayTime: 0.20,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 320, q: 3.0 },
  } as AudioVoiceToneParams,

  // Mallet Windup Acceleration (80Hz -> 160Hz exponential ramp)
  MALLET_WINDUP: {
    type: 'sawtooth',
    frequency: 80.0,
    frequencyRamp: { target: 160.0, duration: 0.65, exponential: true },
    gain: 0.24,
    duration: 0.70,
    attackTime: 0.04,
    decayTime: 0.20,
    sustainLevel: 0.60,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 280, q: 2.8, rampTarget: 480, rampDuration: 0.65 },
  } as AudioVoiceToneParams,

  OVERCLOCK_GEAR_WHINE: {
    type: 'sawtooth',
    frequency: 160.0,
    frequencyRamp: { target: 240.0, duration: 0.50, exponential: true },
    gain: 0.26,
    duration: 0.55,
    attackTime: 0.03,
    decayTime: 0.18,
    sustainLevel: 0.55,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 450, q: 3.2 },
  } as AudioVoiceToneParams,

  // 2. Heavy Mallet Clank Impact Tonal Layers
  MALLET_IMPACT_LOWMID_SWEEP: {
    type: 'sawtooth',
    frequency: 220.0,
    frequencyRamp: { target: 42.0, duration: 0.08, exponential: true },
    gain: 0.42,
    duration: 0.16,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.15,
    releaseTime: 0.06,
    filter: { type: 'lowpass', frequency: 380, q: 2.4, rampTarget: 90, rampDuration: 0.12 },
  } as AudioVoiceToneParams,

  MALLET_IMPACT_SUB_THUD: {
    type: 'sine',
    frequency: 58.0,
    frequencyRamp: { target: 24.0, duration: 0.32, exponential: true },
    gain: 0.48,
    duration: 0.42,
    attackTime: 0.005,
    decayTime: 0.16,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'lowpass', frequency: 110, q: 1.6 },
  } as AudioVoiceToneParams,

  MALLET_IMPACT_BRASS_RING: {
    type: 'triangle',
    frequency: 880.0,
    frequencyRamp: { target: 820.0, duration: 0.35, exponential: true },
    gain: 0.30,
    duration: 0.45,
    attackTime: 0.003,
    decayTime: 0.14,
    sustainLevel: 0.20,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 880, q: 4.8 },
  } as AudioVoiceToneParams,

  MALLET_IMPACT_HIGH_SHEEN: {
    type: 'sine',
    frequency: 1760.0,
    frequencyRamp: { target: 1680.0, duration: 0.25, exponential: true },
    gain: 0.18,
    duration: 0.35,
    attackTime: 0.002,
    decayTime: 0.10,
    sustainLevel: 0.15,
    releaseTime: 0.20,
    filter: { type: 'highpass', frequency: 1200, q: 2.5 },
  } as AudioVoiceToneParams,

  // 3. Stun Depressurization & Defeat Unwind
  STUN_DEPRESSURIZATION_WHISTLE: {
    type: 'triangle',
    frequency: 640.0,
    frequencyRamp: { target: 120.0, duration: 0.60, exponential: true },
    gain: 0.20,
    duration: 0.70,
    attackTime: 0.02,
    decayTime: 0.30,
    sustainLevel: 0.30,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 500, q: 2.0 },
  } as AudioVoiceToneParams,

  DEFEAT_CLOCKWORK_UNWIND: {
    type: 'sawtooth',
    frequency: 320.0,
    frequencyRamp: { target: 40.0, duration: 1.20, exponential: true },
    gain: 0.35,
    duration: 1.40,
    attackTime: 0.05,
    decayTime: 0.50,
    sustainLevel: 0.40,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 400, q: 3.0 },
  } as AudioVoiceToneParams,
} as const;

export class SteamToyTitanAudio {
  private static instance: SteamToyTitanAudio | null = null;

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
  private lastGearSoundMs: number = -Infinity;
  private lastMalletWindupMs: number = -Infinity;
  private lastMalletImpactMs: number = -Infinity;
  private lastSteamSoundMs: number = -Infinity;
  private lastStunDepressurizeMs: number = -Infinity;

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
      try {
        this.voicePool = AudioVoicePool.getInstance(16);
      } catch {
        this.voicePool = null;
      }
    }
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): SteamToyTitanAudio {
    if (!SteamToyTitanAudio.instance) {
      SteamToyTitanAudio.instance = new SteamToyTitanAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        SteamToyTitanAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else if (!SteamToyTitanAudio.instance.audioContext) {
        SteamToyTitanAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return SteamToyTitanAudio.instance;
  }

  public static resetInstance(): void {
    if (SteamToyTitanAudio.instance) {
      SteamToyTitanAudio.instance.destroy();
      SteamToyTitanAudio.instance = null;
    }
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
  }

  public bindPool(pool: AudioVoicePool): void {
    if (this.ownsPool && this.voicePool && this.voicePool !== pool) {
      this.voicePool.destroy();
    }
    this.voicePool = pool;
    this.ownsPool = false;
    this.audioContext = pool.getAudioContext();
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

  /* ==============================================================================
   * PROCEDURAL SOUND ROUTINES
   * ============================================================================== */

  /**
   * 1. Brass Gear Hum (80Hz to 160Hz)
   * Dispatches dual detuned brass teeth oscillators + 160Hz overtone to recreate
   * physical mechanical cog meshing and rotational resonance.
   */
  public playBrassGearHum(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (nowMs - this.lastGearSoundMs < 180) return false;
    this.lastGearSoundMs = nowMs;

    const pool = this.getVoicePool();
    if (!pool) return false;

    pool.playTone(STEAM_TITAN_AUDIO_PRESETS.BRASS_GEAR_HUM_80HZ);
    pool.playTone(STEAM_TITAN_AUDIO_PRESETS.BRASS_GEAR_DETUNE_83HZ);
    pool.playTone(STEAM_TITAN_AUDIO_PRESETS.BRASS_GEAR_OVERTONE_160HZ);
    return true;
  }

  /** Backward-compatible alias for boss update routines */
  public playGearWhine(nowMs: number = Date.now()): boolean {
    return this.playBrassGearHum(nowMs);
  }

  /**
   * 2. Mallet Windup Acceleration
   * 80Hz -> 160Hz exponential pitch ramp portraying accelerating clockwork tension.
   */
  public playMalletWindup(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (nowMs - this.lastMalletWindupMs < 200) return false;
    this.lastMalletWindupMs = nowMs;

    const pool = this.getVoicePool();
    if (!pool) return false;

    pool.playTone(STEAM_TITAN_AUDIO_PRESETS.MALLET_WINDUP);
    this.playSteamPuff(nowMs);
    return true;
  }

  /**
   * 3. Heavy Mallet Clank Impact
   * Layered synthesis: Punchy low-mid sweep + seismic sub thud + brass ring + sheen + impact snap.
   */
  public playMalletImpact(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (nowMs - this.lastMalletImpactMs < 250) return false;
    this.lastMalletImpactMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(STEAM_TITAN_AUDIO_PRESETS.MALLET_IMPACT_LOWMID_SWEEP);
      pool.playTone(STEAM_TITAN_AUDIO_PRESETS.MALLET_IMPACT_SUB_THUD);
      pool.playTone(STEAM_TITAN_AUDIO_PRESETS.MALLET_IMPACT_BRASS_RING);
      pool.playTone(STEAM_TITAN_AUDIO_PRESETS.MALLET_IMPACT_HIGH_SHEEN);
    }

    // Highpass transient noise crack + pressure shockwave
    this.playProceduralNoiseBurst(0.035, 3200, 1600, 0.28, 'highpass');
    this.playSteamVent(nowMs);
    return true;
  }

  /**
   * 4. Overclocked Gear Hum (Enraged Phase)
   */
  public playOverclockGearHum(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (nowMs - this.lastGearSoundMs < 150) return false;
    this.lastGearSoundMs = nowMs;

    const pool = this.getVoicePool();
    if (!pool) return false;

    pool.playTone(STEAM_TITAN_AUDIO_PRESETS.OVERCLOCK_GEAR_WHINE);
    return true;
  }

  /**
   * 5. Steam Vent Pressure Release (Standard 450ms hiss)
   */
  public playSteamVent(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (nowMs - this.lastSteamSoundMs < 150) return false;
    this.lastSteamSoundMs = nowMs;

    return this.playProceduralNoiseBurst(0.45, 1800, 3200, 0.24, 'bandpass');
  }

  /** Short 120ms piston exhaust puff */
  public playSteamPuff(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    return this.playProceduralNoiseBurst(0.12, 2800, 2000, 0.16, 'highpass');
  }

  /** 550ms broad exhaust blast */
  public playSteamOverheatBlast(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    return this.playProceduralNoiseBurst(0.55, 1400, 4200, 0.30, 'bandpass');
  }

  /**
   * 6. Stun Depressurization Sound
   */
  public playStunDepressurization(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (nowMs - this.lastStunDepressurizeMs < 400) return false;
    this.lastStunDepressurizeMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(STEAM_TITAN_AUDIO_PRESETS.STUN_DEPRESSURIZATION_WHISTLE);
    }
    this.playSteamOverheatBlast(nowMs);
    return true;
  }

  /**
   * 7. Defeat Clockwork Unwind Sound
   */
  public playDefeatClockworkUnwind(): boolean {
    if (this.isDestroyed) return false;
    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(STEAM_TITAN_AUDIO_PRESETS.DEFEAT_CLOCKWORK_UNWIND);
    }
    this.playProceduralNoiseBurst(0.90, 2200, 400, 0.32, 'bandpass');
    return true;
  }

  /* ==============================================================================
   * ZERO-LEAK PROCEDURAL WHITE NOISE ENGINE
   * ============================================================================== */

  public playProceduralNoiseBurst(
    duration: number = 0.45,
    startFilterFreq: number = 1800,
    endFilterFreq: number = 3200,
    peakGain: number = 0.24,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    const ctx = this.getAudioContext();
    if (!ctx || ctx.state === 'suspended' || typeof ctx.createBuffer !== 'function') {
      return false;
    }

    try {
      const now = ctx.currentTime;
      const noiseBuffer = this.getSharedNoiseBuffer(ctx);
      if (!noiseBuffer) return false;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(20, startFilterFreq), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFilterFreq), now + duration);
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
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      if (
        SteamToyTitanAudio.cachedNoiseBuffer &&
        SteamToyTitanAudio.cachedNoiseSampleRate === ctx.sampleRate
      ) {
        return SteamToyTitanAudio.cachedNoiseBuffer;
      }

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * 0.50); // 500ms permanent shared buffer
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }

      SteamToyTitanAudio.cachedNoiseBuffer = buffer;
      SteamToyTitanAudio.cachedNoiseSampleRate = sampleRate;
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
        if ('stop' in node && typeof (node as unknown as { stop: () => void }).stop === 'function') {
          (node as unknown as { stop: () => void }).stop();
        }
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  public reset(): void {
    this.clearPendingNodes();
    this.lastGearSoundMs = -Infinity;
    this.lastMalletWindupMs = -Infinity;
    this.lastMalletImpactMs = -Infinity;
    this.lastSteamSoundMs = -Infinity;
    this.lastStunDepressurizeMs = -Infinity;
  }

  public stop(): void {
    this.reset();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearPendingNodes();
    if (this.ownsPool && this.voicePool) {
      this.voicePool.destroy();
    }
    this.voicePool = null;
    this.audioContext = null;
    if (SteamToyTitanAudio.instance === this) {
      SteamToyTitanAudio.instance = null;
    }
  }
}
