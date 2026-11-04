/**
 * QueenBeeAudio.ts — Procedural Web Audio Sound Synthesizer for Queen Mellifera (Queen Bee Cupcake)
 *
 * Implements 100% Procedural Sound Synthesis for the Aerial Sovereign of the Sugar Hive Bakery:
 * - Sovereign Aerial Flight Buzz: F#4 (369.99Hz) micro-vibrato flight hum with 45Hz sub-octave motor flutter
 *   and bandpassed wingbeat air turbulence.
 * - Rotating Sugar Shield Resonance & Shatter: Tier 1-4 crystalline chimes (F#5, A#5, C#6, F#6),
 *   shield deflection pop, and explosive sugar shatter crunch (1600Hz -> 220Hz + highpass noise burst).
 * - Royal Honey Caramelization & Viscous Splash: Gooey bubbling thuds (180Hz -> 55Hz exponential drop),
 *   liquid surface tension pop, and bandpassed 650Hz sticky squelch noise burst.
 * - Stinger Salvo & Supersonic Needle Whistle: 1450Hz -> 220Hz high-frequency piercing needle dart whistle
 *   with 85ms rapid decay and highpass needle hiss.
 * - Supersonic Royal Dive & Crater Slam ("Sugar Coma"): 950Hz -> 85Hz supersonic dive whoosh,
 *   48Hz -> 18Hz sub-bass ground crater shockwave, and dazed stars comic chime (C6/E6/G6 arpeggio).
 * - Phase Transitions & Solfeggio 528Hz Sweet Nectar Bloom: Phase 2 Royal Honey Surge triad (F#4, A#4, C#5),
 *   Phase 3 Berserk Swarm Frenzy saw buzz (185Hz -> 370Hz), and Defeat tragic wilt slide (440Hz -> 55Hz)
 *   paired with F# Major Solfeggio 528Hz sweet nectar peace restoration quad (F#4, A#4, C#5, 528Hz).
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
 * Immutable frozen preset dictionary for Queen Mellifera audio synthesis
 */
export const QUEEN_BEE_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Sovereign Aerial Flight Buzz & Wing Flutter
  // ============================================================================
  FLIGHT_BUZZ_LEAD: {
    type: 'sawtooth',
    frequency: 369.99, // F#4
    frequencyRamp: { target: 375.0, duration: 0.18, exponential: false },
    gain: 0.22,
    duration: 0.28,
    attackTime: 0.02,
    decayTime: 0.08,
    sustainLevel: 0.35,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 740, q: 2.8 },
  } as AudioVoiceToneParams,

  FLIGHT_SUB_MOTOR: {
    type: 'triangle',
    frequency: 45.0,
    frequencyRamp: { target: 42.0, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.30,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.40,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 90, q: 1.5 },
  } as AudioVoiceToneParams,

  FLIGHT_VIBRATO_HARMONIC: {
    type: 'sine',
    frequency: 739.99, // F#5
    frequencyRamp: { target: 745.0, duration: 0.15, exponential: false },
    gain: 0.14,
    duration: 0.24,
    attackTime: 0.02,
    decayTime: 0.08,
    sustainLevel: 0.25,
    releaseTime: 0.10,
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Rotating Sugar Shield Resonance & Crystalline Shatter
  // ============================================================================
  SHIELD_TIER1_CHIME: {
    type: 'sine',
    frequency: 739.99, // F#5
    gain: 0.28,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1480, q: 3.2 },
  } as AudioVoiceToneParams,

  SHIELD_TIER2_CHIME: {
    type: 'sine',
    frequency: 932.33, // A#5
    gain: 0.28,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1860, q: 3.2 },
  } as AudioVoiceToneParams,

  SHIELD_TIER3_CHIME: {
    type: 'sine',
    frequency: 1108.73, // C#6
    gain: 0.28,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 2210, q: 3.2 },
  } as AudioVoiceToneParams,

  SHIELD_TIER4_CHIME: {
    type: 'triangle',
    frequency: 1479.98, // F#6
    gain: 0.30,
    duration: 0.40,
    attackTime: 0.004,
    decayTime: 0.14,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 2960, q: 3.5 },
  } as AudioVoiceToneParams,

  SHIELD_DEFLECT_POP: {
    type: 'triangle',
    frequency: 880.0,
    frequencyRamp: { target: 440.0, duration: 0.08, exponential: true },
    gain: 0.32,
    duration: 0.12,
    attackTime: 0.002,
    decayTime: 0.05,
    sustainLevel: 0.15,
    releaseTime: 0.05,
  } as AudioVoiceToneParams,

  SHIELD_SHATTER_CRUNCH: {
    type: 'sawtooth',
    frequency: 1600.0,
    frequencyRamp: { target: 220.0, duration: 0.22, exponential: true },
    gain: 0.42,
    duration: 0.30,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.14,
    filter: { type: 'bandpass', frequency: 1800, q: 2.2, rampTarget: 350, rampDuration: 0.22 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Royal Honey Caramelization & Viscous Splash
  // ============================================================================
  HONEY_BUBBLE_LOW: {
    type: 'sine',
    frequency: 180.0,
    frequencyRamp: { target: 55.0, duration: 0.20, exponential: true },
    gain: 0.40,
    duration: 0.26,
    attackTime: 0.008,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 320, q: 2.0 },
  } as AudioVoiceToneParams,

  HONEY_SURFACE_POP: {
    type: 'triangle',
    frequency: 320.0,
    frequencyRamp: { target: 110.0, duration: 0.10, exponential: true },
    gain: 0.30,
    duration: 0.15,
    attackTime: 0.003,
    decayTime: 0.06,
    sustainLevel: 0.20,
    releaseTime: 0.06,
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Stinger Salvo & Supersonic Needle Whistle
  // ============================================================================
  STINGER_NEEDLE_WHISTLE: {
    type: 'sawtooth',
    frequency: 1450.0,
    frequencyRamp: { target: 220.0, duration: 0.085, exponential: true },
    gain: 0.36,
    duration: 0.12,
    attackTime: 0.002,
    decayTime: 0.05,
    sustainLevel: 0.15,
    releaseTime: 0.06,
    filter: { type: 'bandpass', frequency: 1600, q: 3.5, rampTarget: 400, rampDuration: 0.085 },
  } as AudioVoiceToneParams,

  STINGER_AIR_POP: {
    type: 'sine',
    frequency: 420.0,
    frequencyRamp: { target: 95.0, duration: 0.07, exponential: true },
    gain: 0.28,
    duration: 0.09,
    attackTime: 0.002,
    decayTime: 0.04,
    sustainLevel: 0.10,
    releaseTime: 0.04,
  } as AudioVoiceToneParams,

  // ============================================================================
  // 5. Supersonic Royal Dive & Crater Slam ("Sugar Coma")
  // ============================================================================
  ROYAL_DIVE_WHOOSH: {
    type: 'sawtooth',
    frequency: 950.0,
    frequencyRamp: { target: 85.0, duration: 0.42, exponential: true },
    gain: 0.38,
    duration: 0.48,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.40,
    releaseTime: 0.20,
    filter: { type: 'lowpass', frequency: 1200, q: 2.4, rampTarget: 180, rampDuration: 0.42 },
  } as AudioVoiceToneParams,

  CRATER_IMPACT_SUB: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 18.0, duration: 0.40, exponential: true },
    gain: 0.50,
    duration: 0.50,
    attackTime: 0.003,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 95, q: 2.0 },
  } as AudioVoiceToneParams,

  CRATER_SURFACE_THUD: {
    type: 'triangle',
    frequency: 110.0,
    frequencyRamp: { target: 35.0, duration: 0.24, exponential: true },
    gain: 0.44,
    duration: 0.30,
    attackTime: 0.004,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.14,
    filter: { type: 'lowpass', frequency: 160, q: 1.8 },
  } as AudioVoiceToneParams,

  DAZED_STARS_C6: {
    type: 'sine',
    frequency: 1046.50, // C6
    gain: 0.24,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
  } as AudioVoiceToneParams,

  DAZED_STARS_E6: {
    type: 'sine',
    frequency: 1318.51, // E6
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
  } as AudioVoiceToneParams,

  DAZED_STARS_G6: {
    type: 'triangle',
    frequency: 1567.98, // G6
    gain: 0.20,
    duration: 0.40,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  // ============================================================================
  // 6. Phase Transitions & Solfeggio 528Hz Sweet Nectar Bloom
  // ============================================================================
  PHASE2_HONEY_SURGE_FS4: {
    type: 'triangle',
    frequency: 369.99, // F#4
    frequencyRamp: { target: 554.37, duration: 0.30, exponential: true },
    gain: 0.26,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 780, q: 2.5 },
  } as AudioVoiceToneParams,

  PHASE2_HONEY_SURGE_AS4: {
    type: 'sine',
    frequency: 466.16, // A#4
    frequencyRamp: { target: 698.46, duration: 0.30, exponential: true },
    gain: 0.24,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE2_HONEY_SURGE_CS5: {
    type: 'sine',
    frequency: 554.37, // C#5
    gain: 0.22,
    duration: 0.42,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_BUZZ_LOW: {
    type: 'sawtooth',
    frequency: 185.0,
    frequencyRamp: { target: 370.0, duration: 0.45, exponential: true },
    gain: 0.38,
    duration: 0.55,
    attackTime: 0.02,
    decayTime: 0.20,
    sustainLevel: 0.50,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 440, q: 3.5, rampTarget: 880, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_BUZZ_HIGH: {
    type: 'square',
    frequency: 370.0,
    frequencyRamp: { target: 740.0, duration: 0.40, exponential: true },
    gain: 0.20,
    duration: 0.50,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 950, q: 2.2 },
  } as AudioVoiceToneParams,

  DEFEAT_WILT_SLIDE: {
    type: 'sine',
    frequency: 440.0,
    frequencyRamp: { target: 55.0, duration: 1.2, exponential: true },
    gain: 0.32,
    duration: 1.4,
    attackTime: 0.04,
    decayTime: 0.40,
    sustainLevel: 0.35,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 600, q: 2.0, rampTarget: 90, rampDuration: 1.2 },
  } as AudioVoiceToneParams,

  // Solfeggio 528Hz Sweet Nectar Harmony Quad (F#4, A#4, C#5, 528.00Hz)
  NECTAR_HARMONY_FS4: {
    type: 'sine',
    frequency: 369.99, // F#4
    gain: 0.20,
    duration: 1.8,
    attackTime: 0.12,
    decayTime: 0.50,
    sustainLevel: 0.45,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  NECTAR_HARMONY_AS4: {
    type: 'sine',
    frequency: 466.16, // A#4
    gain: 0.20,
    duration: 1.8,
    attackTime: 0.14,
    decayTime: 0.50,
    sustainLevel: 0.45,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  NECTAR_HARMONY_CS5: {
    type: 'sine',
    frequency: 554.37, // C#5
    gain: 0.18,
    duration: 1.8,
    attackTime: 0.16,
    decayTime: 0.50,
    sustainLevel: 0.45,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  NECTAR_HARMONY_528HZ: {
    type: 'triangle',
    frequency: 528.00, // Sacred Solfeggio Transformation & Miracles Frequency
    gain: 0.24,
    duration: 2.2,
    attackTime: 0.10,
    decayTime: 0.60,
    sustainLevel: 0.50,
    releaseTime: 1.00,
    filter: { type: 'bandpass', frequency: 528, q: 4.5 },
  } as AudioVoiceToneParams,
});

/**
 * QueenBeeAudio — Universal 100% Procedural Synthesizer for Queen Mellifera
 */
export class QueenBeeAudio {
  private static instance: QueenBeeAudio | null = null;

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
  private lastFlightBuzzMs: number = 0;
  private lastShieldChimeMs: number = 0;
  private lastShieldShatterMs: number = 0;
  private lastHoneySplashMs: number = 0;
  private lastStingerSalvoMs: number = 0;
  private lastRoyalDiveMs: number = 0;
  private lastCraterImpactMs: number = 0;
  private lastDazedStarsMs: number = 0;
  private lastPhaseTransitionMs: number = 0;
  private lastSweetNectarMs: number = 0;

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

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): QueenBeeAudio {
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

    if (!QueenBeeAudio.instance) {
      QueenBeeAudio.instance = new QueenBeeAudio(poolOrCtx);
    } else if (isPool) {
      QueenBeeAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
    } else if (isCtx && !QueenBeeAudio.instance.audioContext) {
      QueenBeeAudio.instance.init(poolOrCtx as AudioContext);
    }
    return QueenBeeAudio.instance;
  }

  public static resetInstance(): void {
    if (QueenBeeAudio.instance) {
      QueenBeeAudio.instance.destroy();
      QueenBeeAudio.instance = null;
    }
    QueenBeeAudio.cachedNoiseBuffer = null;
    QueenBeeAudio.cachedNoiseSampleRate = 0;
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
   * 1. Sovereign Aerial Flight Buzz & Humming Flutter
   */
  public playFlightBuzz(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastFlightBuzzMs > 0 && nowMs - this.lastFlightBuzzMs < 120) return false;
    this.lastFlightBuzzMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.FLIGHT_BUZZ_LEAD);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.FLIGHT_SUB_MOTOR);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.FLIGHT_VIBRATO_HARMONIC);
    }

    // Bandpassed wing flutter noise burst
    this.playProceduralNoiseBurst(0.18, 550, 850, 0.16, 'bandpass');
    return true;
  }

  public playFlightHum(nowMs: number = Date.now()): boolean {
    return this.playFlightBuzz(nowMs);
  }

  /**
   * 2. Rotating Sugar Shield Chime Resonance
   * @param tier 1 to 4 indicating remaining shield index
   */
  public playShieldChime(tier: number = 4, nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastShieldChimeMs > 0 && nowMs - this.lastShieldChimeMs < 80) return false;
    this.lastShieldChimeMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      switch (tier) {
        case 1:
          pool.playTone(QUEEN_BEE_AUDIO_PRESETS.SHIELD_TIER1_CHIME);
          break;
        case 2:
          pool.playTone(QUEEN_BEE_AUDIO_PRESETS.SHIELD_TIER2_CHIME);
          break;
        case 3:
          pool.playTone(QUEEN_BEE_AUDIO_PRESETS.SHIELD_TIER3_CHIME);
          break;
        case 4:
        default:
          pool.playTone(QUEEN_BEE_AUDIO_PRESETS.SHIELD_TIER4_CHIME);
          break;
      }
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.SHIELD_DEFLECT_POP);
    }

    this.playProceduralNoiseBurst(0.08, 2200, 1600, 0.12, 'highpass');
    return true;
  }

  /**
   * 2b. Shield Deflect Pop Shortcut
   */
  public playShieldDeflect(nowMs: number = Date.now()): boolean {
    return this.playShieldChime(1, nowMs);
  }

  /**
   * 3. Rotating Sugar Shield Shatter Crunch
   */
  public playShieldShatter(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastShieldShatterMs > 0 && nowMs - this.lastShieldShatterMs < 100) return false;
    this.lastShieldShatterMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.SHIELD_SHATTER_CRUNCH);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.SHIELD_TIER1_CHIME);
    }

    this.playProceduralNoiseBurst(0.24, 2800, 400, 0.28, 'bandpass');
    return true;
  }

  /**
   * 4. Royal Honey Caramelization & Viscous Splash
   */
  public playHoneySplash(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastHoneySplashMs > 0 && nowMs - this.lastHoneySplashMs < 100) return false;
    this.lastHoneySplashMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.HONEY_BUBBLE_LOW);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.HONEY_SURFACE_POP);
    }

    this.playProceduralNoiseBurst(0.20, 480, 120, 0.20, 'lowpass');
    return true;
  }

  public playHoneyCaramelization(nowMs: number = Date.now()): boolean {
    return this.playHoneySplash(nowMs);
  }

  /**
   * 5. Stinger Salvo / Needle Dart Projectile Launch
   */
  public playStingerSalvo(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastStingerSalvoMs > 0 && nowMs - this.lastStingerSalvoMs < 90) return false;
    this.lastStingerSalvoMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.STINGER_NEEDLE_WHISTLE);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.STINGER_AIR_POP);
    }

    this.playProceduralNoiseBurst(0.10, 3200, 1200, 0.18, 'highpass');
    return true;
  }

  /**
   * 6. Supersonic Royal Dive Whoosh
   */
  public playRoyalDiveWhoosh(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastRoyalDiveMs > 0 && nowMs - this.lastRoyalDiveMs < 250) return false;
    this.lastRoyalDiveMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.ROYAL_DIVE_WHOOSH);
    }

    this.playProceduralNoiseBurst(0.38, 1400, 200, 0.28, 'bandpass');
    return true;
  }

  /**
   * 7. Crater Ground Slam Shockwave
   */
  public playCraterImpact(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastCraterImpactMs > 0 && nowMs - this.lastCraterImpactMs < 200) return false;
    this.lastCraterImpactMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.CRATER_IMPACT_SUB);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.CRATER_SURFACE_THUD);
    }

    this.playProceduralNoiseBurst(0.32, 280, 40, 0.35, 'lowpass');
    return true;
  }

  /**
   * 8. Dazed Comic Stars Chime (Sugar Coma Stun)
   */
  public playDazedStars(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastDazedStarsMs > 0 && nowMs - this.lastDazedStarsMs < 200) return false;
    this.lastDazedStarsMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.DAZED_STARS_C6);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.DAZED_STARS_E6);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.DAZED_STARS_G6);
    }
    return true;
  }

  /**
   * 9. Phase Transitions
   */
  public playPhaseTransition(nextState: string, nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastPhaseTransitionMs > 0 && nowMs - this.lastPhaseTransitionMs < 300) return false;
    this.lastPhaseTransitionMs = nowMs;

    const pool = this.getVoicePool();
    if (nextState === 'PHASE_2') {
      if (pool) {
        pool.playTone(QUEEN_BEE_AUDIO_PRESETS.PHASE2_HONEY_SURGE_FS4);
        pool.playTone(QUEEN_BEE_AUDIO_PRESETS.PHASE2_HONEY_SURGE_AS4);
        pool.playTone(QUEEN_BEE_AUDIO_PRESETS.PHASE2_HONEY_SURGE_CS5);
      }
      this.playProceduralNoiseBurst(0.30, 800, 1600, 0.22, 'bandpass');
      return true;
    } else if (nextState === 'ENRAGED' || nextState === 'PHASE_3') {
      if (pool) {
        pool.playTone(QUEEN_BEE_AUDIO_PRESETS.PHASE3_BERSERK_BUZZ_LOW);
        pool.playTone(QUEEN_BEE_AUDIO_PRESETS.PHASE3_BERSERK_BUZZ_HIGH);
      }
      this.playProceduralNoiseBurst(0.40, 400, 900, 0.32, 'bandpass');
      return true;
    }
    return false;
  }

  /**
   * 10. Boss Defeated & Solfeggio 528Hz Sweet Nectar Peace Harmony
   */
  public playDefeatSweetNectar(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastSweetNectarMs > 0 && nowMs - this.lastSweetNectarMs < 400) return false;
    this.lastSweetNectarMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.DEFEAT_WILT_SLIDE);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.NECTAR_HARMONY_FS4);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.NECTAR_HARMONY_AS4);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.NECTAR_HARMONY_CS5);
      pool.playTone(QUEEN_BEE_AUDIO_PRESETS.NECTAR_HARMONY_528HZ);
    }

    this.playProceduralNoiseBurst(0.85, 950, 80, 0.22, 'lowpass');
    return true;
  }

  public playDefeatPeaceNectar(nowMs: number = Date.now()): boolean {
    return this.playDefeatSweetNectar(nowMs);
  }

  /* ==============================================================================
   * ZERO-GC PROCEDURAL NOISE SYNTHESIS WITH DUAL WATCHDOG
   * ============================================================================== */

  public playProceduralNoiseBurst(
    duration: number = 0.25,
    startFilterFreq: number = 1000,
    endFilterFreq: number = 250,
    peakGain: number = 0.25,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    if (this.isDestroyed) return false;

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
    if (!ctx) return false;

    // Headless / SSR safety check
    if (typeof ctx.createBufferSource !== 'function') return false;

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
        QueenBeeAudio.cachedNoiseBuffer &&
        QueenBeeAudio.cachedNoiseSampleRate === ctx.sampleRate
      ) {
        return QueenBeeAudio.cachedNoiseBuffer;
      }

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * 0.50); // 500ms permanent shared buffer
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }

      QueenBeeAudio.cachedNoiseBuffer = buffer;
      QueenBeeAudio.cachedNoiseSampleRate = sampleRate;
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
    this.lastFlightBuzzMs = 0;
    this.lastShieldChimeMs = 0;
    this.lastShieldShatterMs = 0;
    this.lastHoneySplashMs = 0;
    this.lastStingerSalvoMs = 0;
    this.lastRoyalDiveMs = 0;
    this.lastCraterImpactMs = 0;
    this.lastDazedStarsMs = 0;
    this.lastPhaseTransitionMs = 0;
    this.lastSweetNectarMs = 0;
  }

  public stop(): void {
    this.reset();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearPendingNodes();
    QueenBeeAudio.cachedNoiseBuffer = null;
    QueenBeeAudio.cachedNoiseSampleRate = 0;
    if (this.ownsPool && this.voicePool) {
      this.voicePool.destroy();
    }
    this.voicePool = null;
    this.audioContext = null;
    if (QueenBeeAudio.instance === this) {
      QueenBeeAudio.instance = null;
    }
  }

  public dispose(): void {
    this.destroy();
  }
}
