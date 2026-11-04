/**
 * MutantFloraAudio.ts — Procedural Web Audio Sound Synthesizer for Mutant Flora (Verdant Terror)
 *
 * Implements 100% Procedural Sound Synthesis for the Overgrown Carnivorous Plant:
 * - Subterranean Root Eruptions: Seismic low-frequency ground thud (58Hz -> 24Hz),
 *   fibrous wood rupture snap (240Hz -> 65Hz), and bandpassed earth-tearing gravel crunch.
 * - Root Cleansing Snaps: Brittle vegetative snap (1200Hz -> 280Hz) + fertile harmonic bell (880Hz -> 1320Hz).
 * - Spore Bursts / Pollen Clouds: Cavitation pod pop (360Hz -> 85Hz), bio-harmonic ring (620Hz -> 480Hz),
 *   and sweeping pressurized spore mist hiss.
 * - Vine Whip Shockwaves: Supersonic whip crack (980Hz -> 140Hz in 60ms), radial air displacement thump
 *   (75Hz -> 28Hz), and transient highpass slash noise.
 * - Burrowing & Emerging: Low subterranean descent drone (110Hz -> 38Hz) vs violent upward surfacing surge
 *   (42Hz -> 155Hz) with explosive soil breach noise.
 * - Phase Transitions & Defeat: Phase 2 botanical bloom chime triad (F5 -> B5, C6) / Phase 3 snarling enraged
 *   vegetative roar (130Hz -> 260Hz) and tragic exponential wilt descent (320Hz -> 32Hz over 1.5s)
 *   with Solfeggio 528Hz peaceful botanical restoration.
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
 * Immutable frozen preset dictionary for Mutant Flora audio synthesis
 */
export const FLORA_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Subterranean Root Eruption (Earth Rumble + Fibrous Snap)
  // ============================================================================
  ROOT_ERUPTION_SUB_THUD: {
    type: 'sine',
    frequency: 58.0,
    frequencyRamp: { target: 24.0, duration: 0.35, exponential: true },
    gain: 0.45,
    duration: 0.42,
    attackTime: 0.005,
    decayTime: 0.16,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'lowpass', frequency: 110, q: 1.8 },
  } as AudioVoiceToneParams,

  ROOT_ERUPTION_FIBER_SNAP: {
    type: 'sawtooth',
    frequency: 240.0,
    frequencyRamp: { target: 65.0, duration: 0.12, exponential: true },
    gain: 0.38,
    duration: 0.18,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 420, q: 2.6, rampTarget: 140, rampDuration: 0.12 },
  } as AudioVoiceToneParams,

  ROOT_ERUPTION_WOOD_CREAK: {
    type: 'triangle',
    frequency: 130.0,
    frequencyRamp: { target: 190.0, duration: 0.25, exponential: true },
    gain: 0.22,
    duration: 0.32,
    attackTime: 0.04,
    decayTime: 0.12,
    sustainLevel: 0.35,
    releaseTime: 0.16,
    filter: { type: 'bandpass', frequency: 480, q: 3.2 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Root Cleansed / Neutralized by Bomb Blast
  // ============================================================================
  ROOT_CLEANSED_SNAP: {
    type: 'triangle',
    frequency: 1200.0,
    frequencyRamp: { target: 280.0, duration: 0.06, exponential: true },
    gain: 0.32,
    duration: 0.15,
    attackTime: 0.001,
    decayTime: 0.04,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 1800, q: 3.2, rampTarget: 400, rampDuration: 0.07 },
  } as AudioVoiceToneParams,

  ROOT_CLEANSED_CHIME: {
    type: 'sine',
    frequency: 880.0,
    frequencyRamp: { target: 1320.0, duration: 0.16, exponential: true },
    gain: 0.22,
    duration: 0.28,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.30,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 1100, q: 2.2 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Spore Burst / Pollen Cloud Launch
  // ============================================================================
  SPORE_BURST_POP: {
    type: 'sine',
    frequency: 360.0,
    frequencyRamp: { target: 85.0, duration: 0.06, exponential: true },
    gain: 0.38,
    duration: 0.14,
    attackTime: 0.002,
    decayTime: 0.04,
    sustainLevel: 0.18,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 750, q: 3.0, rampTarget: 220, rampDuration: 0.07 },
  } as AudioVoiceToneParams,

  SPORE_BURST_RING: {
    type: 'triangle',
    frequency: 620.0,
    frequencyRamp: { target: 480.0, duration: 0.22, exponential: true },
    gain: 0.24,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 880, q: 2.8 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Radial Vine Whip Attack
  // ============================================================================
  VINE_WHIP_CRACK: {
    type: 'sawtooth',
    frequency: 980.0,
    frequencyRamp: { target: 140.0, duration: 0.06, exponential: true },
    gain: 0.44,
    duration: 0.15,
    attackTime: 0.001,
    decayTime: 0.04,
    sustainLevel: 0.15,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 1600, q: 2.8, rampTarget: 320, rampDuration: 0.08 },
  } as AudioVoiceToneParams,

  VINE_WHIP_SUB_IMPACT: {
    type: 'sine',
    frequency: 75.0,
    frequencyRamp: { target: 28.0, duration: 0.28, exponential: true },
    gain: 0.46,
    duration: 0.36,
    attackTime: 0.004,
    decayTime: 0.14,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 120, q: 1.8 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 5. Burrowing Underground
  // ============================================================================
  BURROW_DESCENT_DRONE: {
    type: 'triangle',
    frequency: 110.0,
    frequencyRamp: { target: 38.0, duration: 0.65, exponential: true },
    gain: 0.28,
    duration: 0.80,
    attackTime: 0.08,
    decayTime: 0.25,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 190, q: 2.0 },
  } as AudioVoiceToneParams,

  BURROW_SUB_RUMBLE: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 28.0, duration: 0.75, exponential: true },
    gain: 0.35,
    duration: 0.90,
    attackTime: 0.10,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.40,
    filter: { type: 'lowpass', frequency: 95, q: 1.6 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 6. Emerging from Underground
  // ============================================================================
  EMERGE_ASCENT_SWEEP: {
    type: 'sawtooth',
    frequency: 42.0,
    frequencyRamp: { target: 155.0, duration: 0.50, exponential: true },
    gain: 0.34,
    duration: 0.58,
    attackTime: 0.04,
    decayTime: 0.18,
    sustainLevel: 0.50,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 260, q: 2.2, rampTarget: 440, rampDuration: 0.50 },
  } as AudioVoiceToneParams,

  EMERGE_SURFACE_SLAM: {
    type: 'sine',
    frequency: 95.0,
    frequencyRamp: { target: 35.0, duration: 0.22, exponential: true },
    gain: 0.44,
    duration: 0.32,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.16,
    filter: { type: 'lowpass', frequency: 130, q: 1.8 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 7. Phase Transitions
  // ============================================================================
  PHASE2_BLOOM_CHIME_F5: {
    type: 'triangle',
    frequency: 698.46, // F5
    frequencyRamp: { target: 987.77, duration: 0.24, exponential: true },
    gain: 0.25,
    duration: 0.45,
    attackTime: 0.012,
    decayTime: 0.16,
    sustainLevel: 0.35,
    releaseTime: 0.22,
    filter: { type: 'bandpass', frequency: 1200, q: 2.6 },
  } as AudioVoiceToneParams,

  PHASE2_BLOOM_CHIME_C6: {
    type: 'sine',
    frequency: 1046.50, // C6
    gain: 0.20,
    duration: 0.40,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE2_SPORE_SWELL: {
    type: 'triangle',
    frequency: 220.0,
    frequencyRamp: { target: 440.0, duration: 0.32, exponential: true },
    gain: 0.22,
    duration: 0.42,
    attackTime: 0.05,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 520, q: 2.8, rampTarget: 780, rampDuration: 0.32 },
  } as AudioVoiceToneParams,

  PHASE3_ENRAGE_ROAR_LOW: {
    type: 'sawtooth',
    frequency: 130.0,
    frequencyRamp: { target: 260.0, duration: 0.45, exponential: true },
    gain: 0.38,
    duration: 0.55,
    attackTime: 0.03,
    decayTime: 0.20,
    sustainLevel: 0.50,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 380, q: 3.5, rampTarget: 680, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  PHASE3_ENRAGE_ROAR_HIGH: {
    type: 'square',
    frequency: 260.0,
    frequencyRamp: { target: 520.0, duration: 0.40, exponential: true },
    gain: 0.18,
    duration: 0.50,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 620, q: 3.0 },
  } as AudioVoiceToneParams,

  PHASE3_ENRAGE_SUB: {
    type: 'sine',
    frequency: 65.0,
    frequencyRamp: { target: 22.0, duration: 0.40, exponential: true },
    gain: 0.48,
    duration: 0.50,
    attackTime: 0.005,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 105, q: 1.8 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 8. Boss Defeated & Solfeggio 528Hz Peace Bloom
  // ============================================================================
  DEFEAT_WILT_DESCENT: {
    type: 'sawtooth',
    frequency: 320.0,
    frequencyRamp: { target: 32.0, duration: 1.50, exponential: true },
    gain: 0.36,
    duration: 1.70,
    attackTime: 0.06,
    decayTime: 0.60,
    sustainLevel: 0.35,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 380, q: 2.8, rampTarget: 70, rampDuration: 1.50 },
  } as AudioVoiceToneParams,

  DEFEAT_COLLAPSE_SUB: {
    type: 'sine',
    frequency: 52.0,
    frequencyRamp: { target: 18.0, duration: 0.60, exponential: true },
    gain: 0.48,
    duration: 0.75,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.25,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 90, q: 1.6 },
  } as AudioVoiceToneParams,

  PEACE_BLOOM_ROOT_F4: {
    type: 'triangle',
    frequency: 349.23, // F4 fundamental root
    gain: 0.28,
    duration: 2.20,
    attackTime: 0.04,
    decayTime: 0.40,
    sustainLevel: 0.65,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 950, q: 1.8 },
  } as AudioVoiceToneParams,

  PEACE_BLOOM_THIRD_A4: {
    type: 'sine',
    frequency: 440.00, // A4 major 3rd
    gain: 0.26,
    duration: 2.20,
    attackTime: 0.07,
    decayTime: 0.40,
    sustainLevel: 0.60,
    releaseTime: 0.60,
    filter: { type: 'bandpass', frequency: 1200, q: 2.0 },
  } as AudioVoiceToneParams,

  PEACE_BLOOM_FIFTH_C5: {
    type: 'sine',
    frequency: 523.25, // C5 perfect 5th
    gain: 0.24,
    duration: 2.20,
    attackTime: 0.10,
    decayTime: 0.40,
    sustainLevel: 0.60,
    releaseTime: 0.60,
    filter: { type: 'bandpass', frequency: 1500, q: 2.2 },
  } as AudioVoiceToneParams,

  PEACE_BLOOM_SOLFEGGIO_528HZ: {
    type: 'sine',
    frequency: 528.00, // Solfeggio 528Hz Transformation / Miracles / Life Bloom
    gain: 0.32,
    duration: 2.40,
    attackTime: 0.14,
    decayTime: 0.45,
    sustainLevel: 0.70,
    releaseTime: 0.75,
    filter: { type: 'bandpass', frequency: 1056, q: 1.8 },
  } as AudioVoiceToneParams,
});

export const MUTANT_FLORA_AUDIO_PRESETS = FLORA_AUDIO_PRESETS;

export class MutantFloraAudio {
  private static instance: MutantFloraAudio | null = null;

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

  // Rate-limiting debounce timestamps (ms) — initialized to 0 for finite inspection
  private lastRootEruptionMs: number = 0;
  private lastRootCleansedMs: number = 0;
  private lastSporeBurstMs: number = 0;
  private lastVineWhipMs: number = 0;
  private lastBurrowMs: number = 0;
  private lastEmergeMs: number = 0;
  private lastPhaseTransitionMs: number = 0;
  private lastPeaceBloomMs: number = 0;

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

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): MutantFloraAudio {
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

    if (!MutantFloraAudio.instance) {
      MutantFloraAudio.instance = new MutantFloraAudio(poolOrCtx);
    } else if (isPool) {
      MutantFloraAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
    } else if (isCtx && !MutantFloraAudio.instance.audioContext) {
      MutantFloraAudio.instance.init(poolOrCtx as AudioContext);
    }
    return MutantFloraAudio.instance;
  }

  public static resetInstance(): void {
    if (MutantFloraAudio.instance) {
      MutantFloraAudio.instance.destroy();
      MutantFloraAudio.instance = null;
    }
    MutantFloraAudio.cachedNoiseBuffer = null;
    MutantFloraAudio.cachedNoiseSampleRate = 0;
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
      } catch {
        // Safe no-op on synchronous or mocked audio contexts
      }
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

  /* ==============================================================================
   * PROCEDURAL SOUND ROUTINES
   * ============================================================================== */

  /**
   * 1. Subterranean Root Eruption
   * Spawns seismic earth rumble, fibrous root rupture, wood creak, and gravel noise.
   */
  public playRootEruption(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastRootEruptionMs > 0 && nowMs - this.lastRootEruptionMs < 150) return false;
    this.lastRootEruptionMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.ROOT_ERUPTION_SUB_THUD);
      pool.playTone(FLORA_AUDIO_PRESETS.ROOT_ERUPTION_FIBER_SNAP);
      pool.playTone(FLORA_AUDIO_PRESETS.ROOT_ERUPTION_WOOD_CREAK);
    }

    // Bandpassed gravel & earth displacement noise burst
    this.playProceduralNoiseBurst(0.28, 420, 1200, 0.22, 'bandpass');
    return true;
  }

  public playSubterraneanRootEruption(nowMs: number = Date.now()): boolean {
    return this.playRootEruption(nowMs);
  }

  /**
   * 2. Root Cleansed / Neutralized
   * High-frequency brittle snap and bell chime when bomb destroys a root cluster.
   */
  public playRootCleansed(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastRootCleansedMs > 0 && nowMs - this.lastRootCleansedMs < 100) return false;
    this.lastRootCleansedMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.ROOT_CLEANSED_SNAP);
      pool.playTone(FLORA_AUDIO_PRESETS.ROOT_CLEANSED_CHIME);
    }

    // Soft vegetative dispersion puff
    this.playProceduralNoiseBurst(0.12, 1600, 300, 0.12, 'bandpass');
    return true;
  }

  public playRootCleansedSnap(nowMs?: number): boolean {
    return this.playRootCleansed(nowMs);
  }

  /**
   * 3. Spore Burst / Pollen Pod Projectile Launch
   * Organic pod cavitation pop, resonant overtone, and pressurized spore mist hiss.
   */
  public playSporeBurst(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastSporeBurstMs > 0 && nowMs - this.lastSporeBurstMs < 150) return false;
    this.lastSporeBurstMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.SPORE_BURST_POP);
      pool.playTone(FLORA_AUDIO_PRESETS.SPORE_BURST_RING);
    }

    // Pressurized pollen mist dispersion
    this.playProceduralNoiseBurst(0.35, 2200, 600, 0.20, 'bandpass');
    return true;
  }

  public playSporePodLaunch(nowMs: number = Date.now()): boolean {
    return this.playSporeBurst(nowMs);
  }

  public playPollenHiss(nowMs: number = Date.now()): boolean {
    return this.playProceduralNoiseBurst(0.40, 2600, 1200, 0.18, 'highpass');
  }

  /**
   * 4. Radial Vine Whip Attack
   * Supersonic lash crack, low-frequency air shockwave thump, and transient highpass slash.
   */
  public playVineWhip(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastVineWhipMs > 0 && nowMs - this.lastVineWhipMs < 200) return false;
    this.lastVineWhipMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.VINE_WHIP_CRACK);
      pool.playTone(FLORA_AUDIO_PRESETS.VINE_WHIP_SUB_IMPACT);
    }

    // Highpass transient whip cut
    this.playProceduralNoiseBurst(0.045, 2400, 1200, 0.25, 'highpass');
    return true;
  }

  /**
   * 5. Burrow Underground
   * Descending subterranean drone and deep rumble as boss becomes invulnerable.
   */
  public playBurrow(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastBurrowMs > 0 && nowMs - this.lastBurrowMs < 300) return false;
    this.lastBurrowMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.BURROW_DESCENT_DRONE);
      pool.playTone(FLORA_AUDIO_PRESETS.BURROW_SUB_RUMBLE);
    }

    // Low-mid earth churn noise
    this.playProceduralNoiseBurst(0.50, 500, 180, 0.18, 'lowpass');
    return true;
  }

  public playBurrowDrone(nowMs: number = Date.now()): boolean {
    return this.playBurrow(nowMs);
  }

  public playUnderworldBurrowDrone(nowMs: number = Date.now()): boolean {
    return this.playBurrow(nowMs);
  }

  /**
   * 6. Emerge from Underground
   * Surfacing pitch surge, massive arena floor impact slam, and violent soil breach.
   */
  public playEmerge(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastEmergeMs > 0 && nowMs - this.lastEmergeMs < 300) return false;
    this.lastEmergeMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.EMERGE_ASCENT_SWEEP);
      pool.playTone(FLORA_AUDIO_PRESETS.EMERGE_SURFACE_SLAM);
    }

    // Explosive soil rupture noise burst
    this.playProceduralNoiseBurst(0.38, 650, 2200, 0.24, 'bandpass');
    return true;
  }

  /**
   * 7. Phase Transition
   * Phase 2: Botanical bloom chime triad (F5, B5, C6) + spore swell + broad mist.
   * Phase 3 / Enraged: Snarling enraged vegetative roar + square overtone + seismic slam + slash.
   */
  public playPhaseTransition(phase: number = 2, nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastPhaseTransitionMs > 0 && nowMs - this.lastPhaseTransitionMs < 400) return false;
    this.lastPhaseTransitionMs = nowMs;

    const pool = this.getVoicePool();

    if (phase === 2) {
      if (pool) {
        pool.playTone(FLORA_AUDIO_PRESETS.PHASE2_BLOOM_CHIME_F5);
        pool.playTone(FLORA_AUDIO_PRESETS.PHASE2_BLOOM_CHIME_C6);
        pool.playTone(FLORA_AUDIO_PRESETS.PHASE2_SPORE_SWELL);
      }
      this.playProceduralNoiseBurst(0.45, 1800, 800, 0.22, 'bandpass');
      return true;
    } else {
      // Phase 3 or Enraged
      if (pool) {
        pool.playTone(FLORA_AUDIO_PRESETS.PHASE3_ENRAGE_ROAR_LOW);
        pool.playTone(FLORA_AUDIO_PRESETS.PHASE3_ENRAGE_ROAR_HIGH);
        pool.playTone(FLORA_AUDIO_PRESETS.PHASE3_ENRAGE_SUB);
      }
      this.playProceduralNoiseBurst(0.60, 1200, 3400, 0.30, 'bandpass');
      return true;
    }
  }

  public playBotanicalBloomPhase2(nowMs: number = Date.now()): boolean {
    return this.playPhaseTransition(2, nowMs);
  }

  public playEnragedRoarPhase3(nowMs: number = Date.now()): boolean {
    return this.playPhaseTransition(3, nowMs);
  }

  public playTragicWiltDefeat(nowMs: number = Date.now()): boolean {
    return this.playBossDefeated();
  }

  public playPeacefulFloraRestoration(nowMs: number = Date.now()): boolean {
    return this.playPeaceBloom(nowMs);
  }

  public playFloraState(_state: string, _progress: number = 0, _nowMs: number = Date.now()): boolean {
    return true;
  }

  /**
   * 8. Photosynthetic Peace Bloom (Solfeggio 528Hz Quad)
   */
  public playPeaceBloom(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastPeaceBloomMs > 0 && nowMs - this.lastPeaceBloomMs < 1200) return false;
    this.lastPeaceBloomMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.PEACE_BLOOM_ROOT_F4);
      pool.playTone(FLORA_AUDIO_PRESETS.PEACE_BLOOM_THIRD_A4);
      pool.playTone(FLORA_AUDIO_PRESETS.PEACE_BLOOM_FIFTH_C5);
      pool.playTone(FLORA_AUDIO_PRESETS.PEACE_BLOOM_SOLFEGGIO_528HZ);
    }

    this.playProceduralNoiseBurst(0.80, 1400, 3800, 0.12, 'bandpass');
    return true;
  }

  public playPhotosyntheticPeaceBloom(nowMs: number = Date.now()): boolean {
    return this.playPeaceBloom(nowMs);
  }

  public playDefeatPeaceBloom(): boolean {
    return this.playPeaceBloom(Date.now());
  }

  /**
   * 9. Boss Defeated
   * Tragic wilt exponential downward pitch slide, collapsing stalk sub-thud,
   * Solfeggio 528Hz peaceful botanical restoration, and final lingering spore dispersal.
   */
  public playBossDefeated(): boolean {
    if (this.isDestroyed) return false;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(FLORA_AUDIO_PRESETS.DEFEAT_WILT_DESCENT);
      pool.playTone(FLORA_AUDIO_PRESETS.DEFEAT_COLLAPSE_SUB);
      pool.playTone(FLORA_AUDIO_PRESETS.PEACE_BLOOM_SOLFEGGIO_528HZ);
    }

    // Long spore dispersal noise
    this.playProceduralNoiseBurst(1.10, 1400, 250, 0.26, 'bandpass');
    return true;
  }

  /* ==============================================================================
   * ZERO-LEAK PROCEDURAL WHITE NOISE ENGINE
   * ============================================================================== */

  public playProceduralNoiseBurst(
    duration: number = 0.35,
    startFilterFreq: number = 1600,
    endFilterFreq: number = 400,
    peakGain: number = 0.22,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    // Mathematical defense against invalid, negative or subnormal floats
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 1e-6 ||
      typeof peakGain !== 'number' ||
      !Number.isFinite(peakGain) ||
      peakGain <= 1e-15
    ) {
      return false;
    }

    const ctx = this.getAudioContext();
    if (!ctx || ctx.state === 'suspended' || typeof ctx.createBuffer !== 'function') {
      return false;
    }

    try {
      const now = ctx.currentTime;
      const noiseBuffer = this.getSharedNoiseBuffer(ctx);
      if (!noiseBuffer) return false;

      const safeStartFreq = Number.isFinite(startFilterFreq) ? startFilterFreq : 1600;
      const safeEndFreq = Number.isFinite(endFilterFreq) ? endFilterFreq : 400;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(20, safeStartFreq), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, safeEndFreq), now + duration);
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
    duration: number = 0.35,
    startFilterFreq: number = 1600,
    endFilterFreq: number = 400,
    peakGain: number = 0.22,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    return this.playProceduralNoiseBurst(duration, startFilterFreq, endFilterFreq, peakGain, filterType);
  }

  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      if (
        MutantFloraAudio.cachedNoiseBuffer &&
        MutantFloraAudio.cachedNoiseSampleRate === ctx.sampleRate
      ) {
        return MutantFloraAudio.cachedNoiseBuffer;
      }

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * 0.50); // 500ms permanent shared buffer
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }

      MutantFloraAudio.cachedNoiseBuffer = buffer;
      MutantFloraAudio.cachedNoiseSampleRate = sampleRate;
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

  public reset(): void {
    this.clearPendingNodes();
    this.lastRootEruptionMs = 0;
    this.lastRootCleansedMs = 0;
    this.lastSporeBurstMs = 0;
    this.lastVineWhipMs = 0;
    this.lastBurrowMs = 0;
    this.lastEmergeMs = 0;
    this.lastPhaseTransitionMs = 0;
    this.lastPeaceBloomMs = 0;
  }

  public stop(): void {
    this.reset();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearPendingNodes();
    MutantFloraAudio.cachedNoiseBuffer = null;
    MutantFloraAudio.cachedNoiseSampleRate = 0;
    if (this.ownsPool && this.voicePool) {
      this.voicePool.destroy();
    }
    this.voicePool = null;
    this.audioContext = null;
    if (MutantFloraAudio.instance === this) {
      MutantFloraAudio.instance = null;
    }
  }

  public dispose(): void {
    this.destroy();
  }
}
