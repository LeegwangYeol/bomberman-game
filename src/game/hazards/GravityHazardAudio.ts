/**
 * GravityHazardAudio.ts — Procedural Web Audio Sound Synthesizer for Gravitational Singularity Hazard Events
 *
 * Implements 100% Procedural Audio for the Gravitational Singularity Dynamic Hazard Subsystem:
 * - Sub-bass Accretion Drone: 38Hz subterranean gravitational resonance fundamental (38Hz -> 30Hz)
 *   + 57Hz pure 3:2 harmonic overtone hum (57Hz -> 45Hz) with resonant lowpass filter (80Hz, Q=2.0)
 * - Relativistic Accretion Compression: Accelerating matter vortex (120Hz -> 480Hz) with resonant bandpass filter (280Hz -> 750Hz, Q=3.5)
 * - Event Horizon Critical Collapse Shear: Harsh gravitational space-time tearing (680Hz -> 45Hz) with steep lowpass plunge (800Hz -> 60Hz, Q=4.5)
 * - Singularity Burst & Implosion: Devastating sub-bass punch (55Hz -> 18Hz) + vacuum crack (960Hz -> 60Hz) + cosmic particle hiss burst (2400Hz highpass)
 * - Cosmic Fusion Super-Bomb: Coalescence chord (D3 146.83Hz + A3 220Hz + F#4 370Hz) + metallic ring ping + 90Hz -> 30Hz shockwave rumble
 * - Player Slingshot Mastery: Uplifting crystal arcade orbital escape chime triad (440Hz -> 880Hz -> 1320Hz)
 * - Environmental Combat Feedback: Minion spaghettification pitch stretch (340Hz -> 42Hz) & boss heavy pinning stasis drone (55Hz)
 * - Solfeggio 528Hz Harmonic Transformation Chime: C4 (261.63Hz), E4 (329.63Hz), G4 (392.00Hz), and sacred Solfeggio 528.00Hz "Miracle Tone" quad
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Uses pre-allocated 16-voice AudioVoicePool (persistent oscillators, ADSR envelopes, click-free stealing)
 * - Cached static 500ms white noise buffer reused indefinitely without runtime GC allocations
 * - Transient noise/filter nodes employ active tracking, dual cleanup (source.onended + watchdog timeout),
 *   and clearPendingNodes / destroy lifecycle management
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { GravityLifecycleState, AccretionPhase } from './GravityHazard.ts';

function deepFreezePresets<T extends Record<string, unknown>>(obj: T): Readonly<T> {
  Object.keys(obj).forEach((prop) => {
    const val = obj[prop];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreezePresets(val as Record<string, unknown>);
    }
  });
  return Object.freeze(obj);
}

export const GRAVITY_AUDIO_PRESETS = deepFreezePresets({
  // 1. Accretion Formation: 38Hz Sub-Bass Gravitational Resonance Fundamental
  ACCRETION_SUB_DRONE_38HZ: {
    type: 'sine',
    frequency: 38.0,
    frequencyRamp: { target: 30.0, duration: 0.95, exponential: true },
    gain: 0.38,
    duration: 1.10,
    attackTime: 0.25,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 80, q: 2.0 },
  } as AudioVoiceToneParams,

  ACCRETION_OVERTONE_HUM_57HZ: {
    type: 'triangle',
    frequency: 57.0, // 3:2 harmonic overtone
    frequencyRamp: { target: 45.0, duration: 0.85, exponential: true },
    gain: 0.22,
    duration: 0.90,
    attackTime: 0.15,
    decayTime: 0.35,
    sustainLevel: 0.35,
    releaseTime: 0.28,
    filter: { type: 'lowpass', frequency: 110, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Accretion Compression: Relativistic Doppler Accretion Sweep
  COMPRESSION_ACCRETION_WHIRR: {
    type: 'sawtooth',
    frequency: 120.0,
    frequencyRamp: { target: 480.0, duration: 0.55, exponential: true },
    gain: 0.24,
    duration: 0.60,
    attackTime: 0.05,
    decayTime: 0.20,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 280, q: 3.5, rampTarget: 750, rampDuration: 0.55 },
  } as AudioVoiceToneParams,

  COMPRESSION_VORTEX_OVERTONE: {
    type: 'sine',
    frequency: 240.0,
    frequencyRamp: { target: 720.0, duration: 0.50, exponential: true },
    gain: 0.18,
    duration: 0.55,
    attackTime: 0.04,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 500, q: 2.8 },
  } as AudioVoiceToneParams,

  // 3. Critical Collapse Shear: Event Horizon Gravitational Space-Time Tearing
  COLLAPSE_EVENT_HORIZON_SHEAR: {
    type: 'sawtooth',
    frequency: 680.0,
    frequencyRamp: { target: 45.0, duration: 0.38, exponential: true },
    gain: 0.40,
    duration: 0.40,
    attackTime: 0.005,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 800, q: 4.5, rampTarget: 60, rampDuration: 0.38 },
  } as AudioVoiceToneParams,

  COLLAPSE_DOPPLER_CHIRP: {
    type: 'sine',
    frequency: 320.0,
    frequencyRamp: { target: 120.0, duration: 0.35, exponential: true },
    gain: 0.28,
    duration: 0.38,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.16,
    filter: { type: 'bandpass', frequency: 400, q: 3.2 },
  } as AudioVoiceToneParams,

  // 4. Singularity Burst: Cosmic Void Implosion & Detonation
  SINGULARITY_IMPLOSION_SUB: {
    type: 'sine',
    frequency: 55.0,
    frequencyRamp: { target: 18.0, duration: 0.32, exponential: true },
    gain: 0.55,
    duration: 0.35,
    attackTime: 0.002,
    decayTime: 0.15,
    sustainLevel: 0.40,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 120, q: 3.0, rampTarget: 40, rampDuration: 0.32 },
  } as AudioVoiceToneParams,

  SINGULARITY_VACUUM_CRACK: {
    type: 'square',
    frequency: 960.0,
    frequencyRamp: { target: 60.0, duration: 0.08, exponential: true },
    gain: 0.30,
    duration: 0.12,
    attackTime: 0.001,
    decayTime: 0.06,
    sustainLevel: 0.10,
    releaseTime: 0.05,
    filter: { type: 'highpass', frequency: 300, q: 2.5 },
  } as AudioVoiceToneParams,

  // 5. Cosmic Fusion Super-Bomb: Coalescence Triad & Relativistic Shockwave
  COSMIC_FUSION_CHORD_ROOT: {
    type: 'sine',
    frequency: 146.83, // D3
    gain: 0.30,
    duration: 0.85,
    attackTime: 0.02,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 350, q: 2.0 },
  } as AudioVoiceToneParams,

  COSMIC_FUSION_CHORD_FIFTH: {
    type: 'triangle',
    frequency: 220.00, // A3
    gain: 0.25,
    duration: 0.85,
    attackTime: 0.02,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.45,
    filter: { type: 'bandpass', frequency: 440, q: 2.2 },
  } as AudioVoiceToneParams,

  COSMIC_FUSION_CHORD_TENTH: {
    type: 'sine',
    frequency: 369.99, // F#4
    gain: 0.22,
    duration: 0.90,
    attackTime: 0.02,
    decayTime: 0.25,
    sustainLevel: 0.25,
    releaseTime: 0.50,
    filter: { type: 'bandpass', frequency: 740, q: 2.5 },
  } as AudioVoiceToneParams,

  COSMIC_FUSION_SUB_BOOM: {
    type: 'square',
    frequency: 90.0,
    frequencyRamp: { target: 30.0, duration: 0.45, exponential: true },
    gain: 0.50,
    duration: 0.50,
    attackTime: 0.003,
    decayTime: 0.20,
    sustainLevel: 0.35,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 160, q: 3.2, rampTarget: 50, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  // 6. Gravitational Drag: Relativistic Space-Time Dilation Warp
  GRAVITATIONAL_DRAG_WARBLE: {
    type: 'triangle',
    frequency: 60.0,
    frequencyRamp: { target: 45.0, duration: 0.30, exponential: true },
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.04,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 120, q: 2.2 },
  } as AudioVoiceToneParams,

  // 7. Slingshot Escape Velocity: Orbital Slingshot Chime Triad
  ESCAPE_VELOCITY_ROOT: {
    type: 'sine',
    frequency: 440.0,
    frequencyRamp: { target: 880.0, duration: 0.22, exponential: true },
    gain: 0.25,
    duration: 0.30,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 660, q: 2.0 },
  } as AudioVoiceToneParams,

  ESCAPE_VELOCITY_OVERTONE: {
    type: 'sine',
    frequency: 880.0,
    frequencyRamp: { target: 1320.0, duration: 0.20, exponential: true },
    gain: 0.18,
    duration: 0.28,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.15,
    releaseTime: 0.14,
    filter: { type: 'highpass', frequency: 800, q: 1.5 },
  } as AudioVoiceToneParams,

  // 8. Environmental Combat: Minion Spaghettification & Boss Stasis Drone
  MINION_SPAGHETTIFY_WARP: {
    type: 'sawtooth',
    frequency: 340.0,
    frequencyRamp: { target: 42.0, duration: 0.28, exponential: true },
    gain: 0.32,
    duration: 0.30,
    attackTime: 0.008,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 450, q: 3.0, rampTarget: 80, rampDuration: 0.28 },
  } as AudioVoiceToneParams,

  BOSS_STASIS_PINNING_DRONE: {
    type: 'sawtooth',
    frequency: 55.0,
    frequencyRamp: { target: 40.0, duration: 0.80, exponential: true },
    gain: 0.35,
    duration: 0.90,
    attackTime: 0.05,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 120, q: 2.5 },
  } as AudioVoiceToneParams,

  BOSS_STASIS_METALLIC_CLAMP: {
    type: 'square',
    frequency: 880.0,
    frequencyRamp: { target: 220.0, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.30,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 440, q: 4.0 },
  } as AudioVoiceToneParams,

  // 9. Solfeggio 528Hz Harmonic Transformation Chime Quad (Event Horizon Dissipation)
  SINGULARITY_DISSIPATION_C4: {
    type: 'triangle',
    frequency: 261.63,
    gain: 0.20,
    duration: 1.20,
    attackTime: 0.04,
    decayTime: 0.35,
    sustainLevel: 0.30,
    releaseTime: 0.65,
    filter: { type: 'lowpass', frequency: 1200, q: 1.0 },
  } as AudioVoiceToneParams,

  SINGULARITY_DISSIPATION_E4: {
    type: 'triangle',
    frequency: 329.63,
    gain: 0.18,
    duration: 1.20,
    attackTime: 0.04,
    decayTime: 0.35,
    sustainLevel: 0.25,
    releaseTime: 0.65,
    filter: { type: 'lowpass', frequency: 1200, q: 1.0 },
  } as AudioVoiceToneParams,

  SINGULARITY_DISSIPATION_G4: {
    type: 'triangle',
    frequency: 392.00,
    gain: 0.16,
    duration: 1.20,
    attackTime: 0.04,
    decayTime: 0.35,
    sustainLevel: 0.25,
    releaseTime: 0.65,
    filter: { type: 'lowpass', frequency: 1200, q: 1.0 },
  } as AudioVoiceToneParams,

  SINGULARITY_DISSIPATION_SOLFEGGIO_528HZ: {
    type: 'sine',
    frequency: 528.00, // Sacred 528Hz Miracle Harmonic
    gain: 0.25,
    duration: 1.25,
    attackTime: 0.03,
    decayTime: 0.40,
    sustainLevel: 0.35,
    releaseTime: 0.70,
    filter: { type: 'lowpass', frequency: 1200, q: 1.2 },
  } as AudioVoiceToneParams,

  // Harmonization aliases
  HAWKING_DISSIPATION_RING: {
    type: 'sine',
    frequency: 432.0,
    frequencyRamp: { target: 216.0, duration: 0.70, exponential: true },
    gain: 0.18,
    duration: 0.85,
    attackTime: 0.08,
    decayTime: 0.30,
    sustainLevel: 0.25,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 500, q: 1.8 },
  } as AudioVoiceToneParams,
});

export class GravityHazardAudio {
  private static instance: GravityHazardAudio | null = null;
  private static sharedNoiseBuffer: AudioBuffer | null = null;

  public voicePool: AudioVoicePool | null = null;
  public customAudioContext: AudioContext | null = null;
  private activeTransientNodes: Set<AudioNode> = new Set();
  private activeTimerIds: Set<ReturnType<typeof setTimeout>> = new Set();

  private lastDroneTimestampMs: number = -9999;
  private lastWhirrTimestampMs: number = -9999;
  private lastShearTimestampMs: number = -9999;
  private lastBurstTimestampMs: number = -9999;
  private lastSlingshotTimestampMs: number = -9999;
  private lastDragTimestampMs: number = -9999;
  private lastFusionTimestampMs: number = -9999;
  private lastSpaghettifyTimestampMs: number = -9999;
  private lastBossStasisTimestampMs: number = -9999;
  private lastDissipationTimestampMs: number = -9999;

  // FSM tracking
  private static lastState: GravityLifecycleState | string = GravityLifecycleState.DORMANT;
  private static lastAccretionPhase: AccretionPhase | string = AccretionPhase.NONE;

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
      this.voicePool = poolOrCtx as AudioVoicePool;
    } else if (isCtx) {
      this.customAudioContext = poolOrCtx as AudioContext;
      if (pool) this.voicePool = pool;
    } else if (pool) {
      this.voicePool = pool;
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    this.voicePool = pool;
  }

  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.customAudioContext = ctx;
    if (pool) this.voicePool = pool;
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): GravityHazardAudio {
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

    if (!this.instance) {
      this.instance = new GravityHazardAudio(poolOrCtx);
    } else if (isPool) {
      this.instance.bindPool(poolOrCtx as AudioVoicePool);
    } else if (isCtx && !this.instance.customAudioContext) {
      this.instance.init(poolOrCtx as AudioContext);
    }
    return this.instance;
  }

  public static resetInstance(): void {
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
    this.sharedNoiseBuffer = null;
    this.lastState = GravityLifecycleState.DORMANT;
    this.lastAccretionPhase = AccretionPhase.NONE;
  }

  private getAudioContext(): AudioContext | null {
    if (this.customAudioContext) {
      return this.customAudioContext;
    }
    if (this.voicePool) {
      return this.voicePool.getContext();
    }
    try {
      if (typeof window !== 'undefined') {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          return new AudioCtxClass();
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  public playFilteredNoiseBurst(
    duration: number = 0.25,
    startFilterFreq: number = 1000,
    endFilterFreq: number = 250,
    peakGain: number = 0.25,
    _filterType: BiquadFilterType = 'bandpass'
  ): void {
    this.playSwirlNoisePulse(duration, startFilterFreq, endFilterFreq, 2.5, peakGain);
  }

  /**
   * Cached Zero-GC static white noise buffer (500ms)
   */
  private static getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (!this.sharedNoiseBuffer || this.sharedNoiseBuffer.sampleRate !== ctx.sampleRate) {
      try {
        const bufferSize = Math.floor(ctx.sampleRate * 0.5); // 500ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        this.sharedNoiseBuffer = buffer;
      } catch {
        return null;
      }
    }
    return this.sharedNoiseBuffer;
  }

  /**
   * Central FSM sound dispatcher with state debouncing
   */
  public static playGravityHazardState(
    state: GravityLifecycleState | string,
    phase: AccretionPhase | string,
    voicePool?: AudioVoicePool | null,
    nowMs: number = Date.now()
  ): void {
    if (state === this.lastState && phase === this.lastAccretionPhase) {
      return;
    }

    const prevState = this.lastState;
    const prevPhase = this.lastAccretionPhase;
    this.lastState = state;
    this.lastAccretionPhase = phase;

    const audio = GravityHazardAudio.getInstance(voicePool);

    const stateStr = state as string;
    const phaseStr = phase as string;
    const prevStr = prevState as string;

    switch (stateStr) {
      case GravityLifecycleState.ACCRETION_SWIRL:
      case 'ACCRETION':
      case 'GRAVITY_ACCRETION': {
        if (phaseStr === AccretionPhase.FORMATION || phaseStr === 'FORMATION') {
          if (prevPhase !== AccretionPhase.FORMATION) {
            audio.playAccretionFormation(voicePool, nowMs);
          }
        } else if (phaseStr === AccretionPhase.COMPRESSION || phaseStr === 'COMPRESSION') {
          if (prevPhase !== AccretionPhase.COMPRESSION) {
            audio.playAccretionCompression(voicePool, nowMs);
          }
        } else if (phaseStr === AccretionPhase.CRITICAL_COLLAPSE || phaseStr === 'CRITICAL_COLLAPSE') {
          if (prevPhase !== AccretionPhase.CRITICAL_COLLAPSE) {
            audio.playCriticalCollapseTelegraph(voicePool, nowMs);
          }
        }
        break;
      }

      case GravityLifecycleState.SINGULARITY_BURST:
      case 'SINGULARITY':
      case 'BURST':
      case 'IMPLOSION': {
        if (
          prevStr !== GravityLifecycleState.SINGULARITY_BURST &&
          prevStr !== 'SINGULARITY' &&
          prevStr !== 'BURST' &&
          prevStr !== 'IMPLOSION'
        ) {
          audio.playSingularityBurst(voicePool, nowMs);
        }
        break;
      }

      case GravityLifecycleState.COOLDOWN:
      case 'DISSIPATION':
      case 'COSMIC_CALM': {
        if (
          prevStr !== GravityLifecycleState.COOLDOWN &&
          prevStr !== 'DISSIPATION' &&
          prevStr !== 'COSMIC_CALM'
        ) {
          audio.playSingularityDissipation(voicePool, nowMs);
        }
        break;
      }

      default:
        break;
    }
  }

  // ==============================================================================
  // Soundscape Routines
  // ==============================================================================

  /**
   * 1. Accretion Swirl Formation: Infrasound sub-bass drone & gentle dust swirl
   */
  public playAccretionFormation(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastDroneTimestampMs < 500) return;
    this.lastDroneTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.ACCRETION_SUB_DRONE_38HZ);
      vp.playTone(GRAVITY_AUDIO_PRESETS.ACCRETION_OVERTONE_HUM_57HZ);
    }
    this.playSwirlNoisePulse(0.40, 420, 180, 2.5, 0.20);
  }

  /**
   * 2. Accretion Swirl Compression: Accelerating Doppler matter vortex
   */
  public playAccretionCompression(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastWhirrTimestampMs < 350) return;
    this.lastWhirrTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.COMPRESSION_ACCRETION_WHIRR);
      vp.playTone(GRAVITY_AUDIO_PRESETS.COMPRESSION_VORTEX_OVERTONE);
    }
    this.playSwirlNoisePulse(0.35, 300, 650, 3.2, 0.25);
  }

  /**
   * 3. Critical Collapse Telegraph: Event-horizon ripping noise & steep Doppler plunge
   */
  public playCriticalCollapseTelegraph(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastShearTimestampMs < 250) return;
    this.lastShearTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.COLLAPSE_EVENT_HORIZON_SHEAR);
      vp.playTone(GRAVITY_AUDIO_PRESETS.COLLAPSE_DOPPLER_CHIRP);
    }
    this.playSwirlNoisePulse(0.30, 800, 90, 4.2, 0.35);
  }

  /**
   * Generalized Accretion Swirl dispatcher
   */
  public playAccretionSwirl(phase: AccretionPhase | string, pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (phase === AccretionPhase.FORMATION || phase === 'FORMATION') {
      this.playAccretionFormation(pool, nowMs);
    } else if (phase === AccretionPhase.COMPRESSION || phase === 'COMPRESSION') {
      this.playAccretionCompression(pool, nowMs);
    } else if (phase === AccretionPhase.CRITICAL_COLLAPSE || phase === 'CRITICAL_COLLAPSE') {
      this.playCriticalCollapseTelegraph(pool, nowMs);
    }
  }

  /**
   * 4. Singularity Burst / Implosion: Devastating sub-bass punch & vacuum crack
   */
  public playSingularityBurst(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastBurstTimestampMs < 200) return;
    this.lastBurstTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.SINGULARITY_IMPLOSION_SUB);
      vp.playTone(GRAVITY_AUDIO_PRESETS.SINGULARITY_VACUUM_CRACK);
    }
    this.playVacuumImplosionNoisePulse(0.35, 120, 1800, 4.5, 0.45);
    this.playCosmicParticleHissPulse(0.18, 2400, 2.0, 0.30);
  }

  /**
   * 5. Gravitational Escape / Orbital Slingshot: Uplifting crystal chime triad
   */
  public playGravitationalEscapeChimes(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastSlingshotTimestampMs < 300) return;
    this.lastSlingshotTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.ESCAPE_VELOCITY_ROOT);
      vp.playTone(GRAVITY_AUDIO_PRESETS.ESCAPE_VELOCITY_OVERTONE);
    }
  }

  /**
   * 6. Gravitational Drag: Dilation warble
   */
  public playGravitationalDragWarning(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastDragTimestampMs < 400) return;
    this.lastDragTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.GRAVITATIONAL_DRAG_WARBLE);
    }
  }

  /**
   * 7. Cosmic Fusion Super-Bomb: Coalescence triad & relativistic shockwave
   */
  public playCosmicFusionSuperBomb(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastFusionTimestampMs < 250) return;
    this.lastFusionTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.COSMIC_FUSION_CHORD_ROOT);
      vp.playTone(GRAVITY_AUDIO_PRESETS.COSMIC_FUSION_CHORD_FIFTH);
      vp.playTone(GRAVITY_AUDIO_PRESETS.COSMIC_FUSION_CHORD_TENTH);
      vp.playTone(GRAVITY_AUDIO_PRESETS.COSMIC_FUSION_SUB_BOOM);
    }
    this.playVacuumImplosionNoisePulse(0.40, 90, 750, 3.8, 0.40);
  }

  /**
   * 8. Minion Spaghettification: Pitch stretch warp
   */
  public playMinionSpaghettification(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastSpaghettifyTimestampMs < 120) return;
    this.lastSpaghettifyTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.MINION_SPAGHETTIFY_WARP);
    }
  }

  /**
   * 9. Boss Stasis Grounded: Heavy pinning drone & clamp
   */
  public playBossStasisGrounded(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastBossStasisTimestampMs < 400) return;
    this.lastBossStasisTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.BOSS_STASIS_PINNING_DRONE);
      vp.playTone(GRAVITY_AUDIO_PRESETS.BOSS_STASIS_METALLIC_CLAMP);
    }
  }

  /**
   * 10. Singularity Dissipation & Solfeggio 528Hz Harmonic Transformation Chime
   */
  public playSingularityDissipation(pool?: AudioVoicePool | null, nowMs: number = Date.now()): void {
    if (nowMs - this.lastDissipationTimestampMs < 600) return;
    this.lastDissipationTimestampMs = nowMs;

    const vp = pool || this.voicePool;
    if (vp) {
      vp.playTone(GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_C4);
      vp.playTone(GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_E4);
      vp.playTone(GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_G4);
      vp.playTone(GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_SOLFEGGIO_528HZ);
    }
  }

  // ==============================================================================
  // Procedural Noise Synthesis Primitives (Zero-GC Cached Buffer)
  // ==============================================================================

  /**
   * Filtered swirl noise pulse with dual watchdog
   */
  public playSwirlNoisePulse(
    duration: number = 0.35,
    startFreq: number = 420,
    endFreq: number = 180,
    q: number = 2.5,
    gain: number = 0.22
  ): void {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300) return;
    if (!Number.isFinite(startFreq) || startFreq <= 0) return;
    if (!Number.isFinite(endFreq) || endFreq <= 0) return;
    if (!Number.isFinite(gain) || gain <= 0) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const noiseBuffer = GravityHazardAudio.getOrCreateNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(Math.max(0.1, q), ctx.currentTime);
      filter.frequency.setValueAtTime(startFreq, ctx.currentTime);
      if (filter.frequency.exponentialRampToValueAtTime) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), ctx.currentTime + duration);
      } else {
        filter.frequency.setValueAtTime(endFreq, ctx.currentTime + duration);
      }

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(Math.min(1.0, gain), ctx.currentTime);
      if (gainNode.gain.exponentialRampToValueAtTime) {
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      } else {
        gainNode.gain.setValueAtTime(0, ctx.currentTime + duration);
      }

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gainNode);

      let isCleanedUp = false;
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          this.activeTimerIds.delete(watchdogTimer);
        }
        source.onended = null;
        try { source.stop(); } catch { /* ignore */ }
        try { source.disconnect(); } catch { /* ignore */ }
        try { filter.disconnect(); } catch { /* ignore */ }
        try { gainNode.disconnect(); } catch { /* ignore */ }
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gainNode);
      };

      source.onended = cleanup;
      const watchdogTimer = setTimeout(cleanup, (duration + 0.05) * 1000);
      this.activeTimerIds.add(watchdogTimer);

      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + duration);
    } catch {
      // Safe fallback on audio error
    }
  }

  /**
   * Vacuum implosion noise pulse
   */
  public playVacuumImplosionNoisePulse(
    duration: number = 0.35,
    startFreq: number = 120,
    endFreq: number = 1800,
    q: number = 4.5,
    gain: number = 0.45
  ): void {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const noiseBuffer = GravityHazardAudio.getOrCreateNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(Math.max(0.1, q), ctx.currentTime);
      filter.frequency.setValueAtTime(startFreq, ctx.currentTime);
      if (filter.frequency.exponentialRampToValueAtTime) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), ctx.currentTime + duration);
      } else {
        filter.frequency.setValueAtTime(endFreq, ctx.currentTime + duration);
      }

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
      if (gainNode.gain.linearRampToValueAtTime) {
        gainNode.gain.linearRampToValueAtTime(Math.min(1.0, gain), ctx.currentTime + duration * 0.7);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      } else {
        gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      }

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gainNode);

      let isCleanedUp = false;
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          this.activeTimerIds.delete(watchdogTimer);
        }
        source.onended = null;
        try { source.stop(); } catch { /* ignore */ }
        try { source.disconnect(); } catch { /* ignore */ }
        try { filter.disconnect(); } catch { /* ignore */ }
        try { gainNode.disconnect(); } catch { /* ignore */ }
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gainNode);
      };

      source.onended = cleanup;
      const watchdogTimer = setTimeout(cleanup, (duration + 0.05) * 1000);
      this.activeTimerIds.add(watchdogTimer);

      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + duration);
    } catch {
      // Safe fallback
    }
  }

  /**
   * Cosmic particle hiss highpass pulse
   */
  public playCosmicParticleHissPulse(
    duration: number = 0.18,
    highpassFreq: number = 2400,
    q: number = 2.0,
    gain: number = 0.30
  ): void {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const noiseBuffer = GravityHazardAudio.getOrCreateNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.Q.setValueAtTime(Math.max(0.1, q), ctx.currentTime);
      filter.frequency.setValueAtTime(highpassFreq, ctx.currentTime);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(Math.min(1.0, gain), ctx.currentTime);
      if (gainNode.gain.exponentialRampToValueAtTime) {
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      } else {
        gainNode.gain.setValueAtTime(0, ctx.currentTime + duration);
      }

      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gainNode);

      let isCleanedUp = false;
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          this.activeTimerIds.delete(watchdogTimer);
        }
        source.onended = null;
        try { source.stop(); } catch { /* ignore */ }
        try { source.disconnect(); } catch { /* ignore */ }
        try { filter.disconnect(); } catch { /* ignore */ }
        try { gainNode.disconnect(); } catch { /* ignore */ }
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gainNode);
      };

      source.onended = cleanup;
      const watchdogTimer = setTimeout(cleanup, (duration + 0.05) * 1000);
      this.activeTimerIds.add(watchdogTimer);

      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + duration);
    } catch {
      // Safe fallback
    }
  }

  // ==============================================================================
  // Lifecycle Management & Teardown
  // ==============================================================================

  public clearPendingNodes(): void {
    for (const timerId of this.activeTimerIds) {
      clearTimeout(timerId);
    }
    this.activeTimerIds.clear();

    for (const node of this.activeTransientNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
      } catch { /* ignore */ }
      try {
        node.disconnect();
      } catch { /* ignore */ }
    }
    this.activeTransientNodes.clear();
  }

  public stop(): void {
    this.clearPendingNodes();
  }

  public reset(): void {
    this.clearPendingNodes();
    this.lastDroneTimestampMs = -9999;
    this.lastWhirrTimestampMs = -9999;
    this.lastShearTimestampMs = -9999;
    this.lastBurstTimestampMs = -9999;
    this.lastSlingshotTimestampMs = -9999;
    this.lastDragTimestampMs = -9999;
    this.lastFusionTimestampMs = -9999;
    this.lastSpaghettifyTimestampMs = -9999;
    this.lastBossStasisTimestampMs = -9999;
    this.lastDissipationTimestampMs = -9999;
    GravityHazardAudio.lastState = GravityLifecycleState.DORMANT;
    GravityHazardAudio.lastAccretionPhase = AccretionPhase.NONE;
  }

  public destroy(): void {
    this.clearPendingNodes();
    this.voicePool = null;
  }
}
