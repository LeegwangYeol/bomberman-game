/**
 * AbyssalHazardAudio.ts — Procedural Web Audio Sound Synthesizer for AbyssalHazard Events
 *
 * Implements 100% Procedural Audio for the Abyssal Trench & Oceanic Maelstrom Subsystem:
 * - Sub-bass Ocean Drone: 48Hz oceanic sub-bass fundamental resonance (48Hz -> 36Hz)
 *   + 72Hz pure 3:2 harmonic overtone hum (72Hz -> 48Hz) with resonant lowpass filter (96Hz, Q=1.8)
 * - Resonant Low-pass Maelstrom Sweep: Steep vortex plunge (640Hz -> 48Hz) with resonant lowpass filter
 *   sweeping 640Hz -> 48Hz (Q=3.8) + seismic sub-vortex impact (48Hz -> 16Hz) + mid vortex chord (360Hz -> 48Hz)
 * - Rushing Tidal White Noise Pulse: Procedural rushing tidal water surge with sweeping resonant lowpass filter
 *   (640Hz -> 48Hz, Q=3.8) and exponential gain decay
 * - Solfeggio 432Hz Oceanic Calming Chime: Solfeggio / Verdi oceanic harmonic quad
 *   (432Hz Root, 540Hz Major Third, 648Hz Perfect Fifth, 864Hz Octave)
 * - Combat Mastery & Tactical Presets: Aqua / Abyssal Glide dual chimes (864Hz -> 1296Hz), Hydrostatic Drag / Abyssal Pressure
 *   warble (280Hz -> 140Hz), Oceanic Slipstream propulsion (432Hz -> 864Hz), and Abyssal Anchor calming snap (432Hz)
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Uses pre-allocated 16-voice AudioVoicePool (persistent oscillators, ADSR envelopes, click-free stealing)
 * - Cached static 500ms white noise buffer reused indefinitely without runtime GC allocations
 * - Transient noise/filter nodes employ active tracking, dual cleanup (source.onended + watchdog timeout),
 *   and clearPendingNodes / destroy lifecycle management
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { AbyssalLifecycleState, AbyssalTelegraphPhase } from './AbyssalHazard.ts';

export const ABYSSAL_AUDIO_PRESETS = {
  // 1. Sub-bass Ocean Drone: 48Hz Sub-bass Trench Resonance Fundamental
  SUB_BASS_OCEAN_DRONE_48HZ: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 36.0, duration: 0.95, exponential: true },
    gain: 0.35,
    duration: 1.25,
    attackTime: 0.22,
    decayTime: 0.45,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 96, q: 1.8 },
  } as AudioVoiceToneParams,

  // Harmonization alias
  OCEANIC_SUB_DRONE_44HZ: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 36.0, duration: 0.95, exponential: true },
    gain: 0.35,
    duration: 1.25,
    attackTime: 0.22,
    decayTime: 0.45,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 96, q: 1.8 },
  } as AudioVoiceToneParams,

  ABYSSAL_TRENCH_RESONANCE_HUM: {
    type: 'triangle',
    frequency: 72.0, // 3:2 harmonic overtone
    frequencyRamp: { target: 48.0, duration: 0.80, exponential: true },
    gain: 0.20,
    duration: 0.90,
    attackTime: 0.15,
    decayTime: 0.32,
    sustainLevel: 0.35,
    releaseTime: 0.28,
    filter: { type: 'lowpass', frequency: 120, q: 1.8 },
  } as AudioVoiceToneParams,

  // Harmonization alias
  OCEANIC_RESONANCE_HUM: {
    type: 'triangle',
    frequency: 72.0,
    frequencyRamp: { target: 48.0, duration: 0.80, exponential: true },
    gain: 0.20,
    duration: 0.90,
    attackTime: 0.15,
    decayTime: 0.32,
    sustainLevel: 0.35,
    releaseTime: 0.28,
    filter: { type: 'lowpass', frequency: 120, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Tidal Undertow & Convergence Liquid Sweeps
  TIDAL_UNDERTOW_SWEEP_320HZ: {
    type: 'sine',
    frequency: 320.0,
    frequencyRamp: { target: 640.0, duration: 0.35, exponential: true },
    gain: 0.22,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 480, q: 2.8, rampTarget: 960, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  TIDAL_UNDERTOW_OVERTONE_SWEEP: {
    type: 'sine',
    frequency: 640.0,
    frequencyRamp: { target: 960.0, duration: 0.28, exponential: true },
    gain: 0.18,
    duration: 0.40,
    attackTime: 0.02,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 800, q: 2.4 },
  } as AudioVoiceToneParams,

  TRENCH_CONVERGENCE_SURGE: {
    type: 'sawtooth',
    frequency: 180.0,
    frequencyRamp: { target: 480.0, duration: 0.35, exponential: true },
    gain: 0.18,
    duration: 0.42,
    attackTime: 0.04,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 320, q: 3.2, rampTarget: 700, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  TIDAL_VORTEX_CONVERGENCE_SWEEP: {
    type: 'sawtooth',
    frequency: 180.0,
    frequencyRamp: { target: 540.0, duration: 0.36, exponential: true },
    gain: 0.18,
    duration: 0.42,
    attackTime: 0.04,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 360, q: 3.2, rampTarget: 780, rampDuration: 0.36 },
  } as AudioVoiceToneParams,

  // 3. Resonant Low-pass Maelstrom Sweep Presets
  MAELSTROM_SWEEP_CRACK_640HZ: {
    type: 'sawtooth',
    frequency: 640.0,
    frequencyRamp: { target: 48.0, duration: 0.12, exponential: true },
    gain: 0.42,
    duration: 0.28,
    attackTime: 0.003,
    decayTime: 0.09,
    sustainLevel: 0.20,
    releaseTime: 0.14,
    filter: { type: 'lowpass', frequency: 640, q: 3.8, rampTarget: 48, rampDuration: 0.22 },
  } as AudioVoiceToneParams,

  MAELSTROM_CRACK_680HZ: {
    type: 'sawtooth',
    frequency: 640.0,
    frequencyRamp: { target: 48.0, duration: 0.12, exponential: true },
    gain: 0.42,
    duration: 0.28,
    attackTime: 0.003,
    decayTime: 0.09,
    sustainLevel: 0.20,
    releaseTime: 0.14,
    filter: { type: 'lowpass', frequency: 640, q: 3.8, rampTarget: 48, rampDuration: 0.22 },
  } as AudioVoiceToneParams,

  MAELSTROM_SUB_VORTEX_IMPACT_48HZ: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 16.0, duration: 0.48, exponential: true },
    gain: 0.50,
    duration: 0.58,
    attackTime: 0.005,
    decayTime: 0.22,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 80, q: 1.6 },
  } as AudioVoiceToneParams,

  MAELSTROM_SUB_IMPACT_48HZ: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 16.0, duration: 0.48, exponential: true },
    gain: 0.50,
    duration: 0.58,
    attackTime: 0.005,
    decayTime: 0.22,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 80, q: 1.6 },
  } as AudioVoiceToneParams,

  MAELSTROM_CHORD_MID_360HZ: {
    type: 'triangle',
    frequency: 360.0,
    frequencyRamp: { target: 48.0, duration: 0.15, exponential: true },
    gain: 0.25,
    duration: 0.32,
    attackTime: 0.006,
    decayTime: 0.11,
    sustainLevel: 0.20,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 540, q: 3.2, rampTarget: 48, rampDuration: 0.22 },
  } as AudioVoiceToneParams,

  MAELSTROM_CHORD_MID_420HZ: {
    type: 'triangle',
    frequency: 360.0,
    frequencyRamp: { target: 48.0, duration: 0.15, exponential: true },
    gain: 0.25,
    duration: 0.32,
    attackTime: 0.006,
    decayTime: 0.11,
    sustainLevel: 0.20,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 540, q: 3.2, rampTarget: 48, rampDuration: 0.22 },
  } as AudioVoiceToneParams,

  // 4. Solfeggio 432Hz Oceanic Calming Chime Quad (Verdi / Oceanic Harmonic Alignment)
  OCEANIC_CALM_ROOT_432HZ: {
    type: 'sine',
    frequency: 432.00, // Solfeggio / Verdi water resonance
    gain: 0.26,
    duration: 0.65,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 432, q: 2.5 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_TRIAD_ROOT_432HZ: {
    type: 'sine',
    frequency: 432.00,
    gain: 0.26,
    duration: 0.65,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 432, q: 2.5 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_THIRD_540HZ: {
    type: 'triangle',
    frequency: 540.00, // 5:4 pure harmonic major third
    gain: 0.20,
    duration: 0.65,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 540, q: 2.2 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_TRIAD_THIRD_540HZ: {
    type: 'triangle',
    frequency: 540.00,
    gain: 0.20,
    duration: 0.65,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 540, q: 2.2 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_FIFTH_648HZ: {
    type: 'sine',
    frequency: 648.00, // 3:2 pure harmonic perfect fifth
    gain: 0.18,
    duration: 0.70,
    attackTime: 0.025,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.45,
    filter: { type: 'bandpass', frequency: 648, q: 2.0 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_TRIAD_FIFTH_648HZ: {
    type: 'sine',
    frequency: 648.00,
    gain: 0.18,
    duration: 0.70,
    attackTime: 0.025,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.45,
    filter: { type: 'bandpass', frequency: 648, q: 2.0 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_OCTAVE_864HZ: {
    type: 'sine',
    frequency: 864.00, // 2:1 pure octave resolve
    gain: 0.14,
    duration: 0.60,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 864, q: 2.0 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_TRIAD_OCTAVE_864HZ: {
    type: 'sine',
    frequency: 864.00,
    gain: 0.14,
    duration: 0.60,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 864, q: 2.0 },
  } as AudioVoiceToneParams,

  // 5. Combat Mastery & Tactical Presets
  AQUA_GLIDE_CHIME_HIGH: {
    type: 'sine',
    frequency: 864.00,
    frequencyRamp: { target: 1296.00, duration: 0.25, exponential: true },
    gain: 0.22,
    duration: 0.45,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1100, q: 2.0 },
  } as AudioVoiceToneParams,

  ABYSSAL_GLIDE_CHIME_HIGH: {
    type: 'sine',
    frequency: 864.00,
    frequencyRamp: { target: 1296.00, duration: 0.25, exponential: true },
    gain: 0.22,
    duration: 0.45,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1100, q: 2.0 },
  } as AudioVoiceToneParams,

  AQUA_GLIDE_CHIME_MID: {
    type: 'sine',
    frequency: 1080.00,
    gain: 0.20,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1200, q: 2.2 },
  } as AudioVoiceToneParams,

  ABYSSAL_GLIDE_CHIME_MID: {
    type: 'sine',
    frequency: 1080.00,
    gain: 0.20,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1200, q: 2.2 },
  } as AudioVoiceToneParams,

  ABYSSAL_PRESSURE_WARBLE: {
    type: 'sawtooth',
    frequency: 280.0,
    frequencyRamp: { target: 140.0, duration: 0.25, exponential: true },
    gain: 0.18,
    duration: 0.30,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 350, q: 3.0 },
  } as AudioVoiceToneParams,

  HYDROSTATIC_DRAG_WARBLE: {
    type: 'sawtooth',
    frequency: 280.0,
    frequencyRamp: { target: 140.0, duration: 0.25, exponential: true },
    gain: 0.18,
    duration: 0.30,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 350, q: 3.0 },
  } as AudioVoiceToneParams,

  OCEANIC_SLIPSTREAM_KICK: {
    type: 'triangle',
    frequency: 432.0,
    frequencyRamp: { target: 864.0, duration: 0.18, exponential: true },
    gain: 0.24,
    duration: 0.25,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 650, q: 2.6 },
  } as AudioVoiceToneParams,

  HYDRO_SLIPSTREAM_PROPULSION: {
    type: 'triangle',
    frequency: 432.0,
    frequencyRamp: { target: 864.0, duration: 0.18, exponential: true },
    gain: 0.24,
    duration: 0.25,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 650, q: 2.6 },
  } as AudioVoiceToneParams,

  ABYSSAL_ANCHOR_SNAP: {
    type: 'sine',
    frequency: 432.00,
    gain: 0.25,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 500, q: 2.5 },
  } as AudioVoiceToneParams,

  OCEANIC_CALM_SNAP: {
    type: 'sine',
    frequency: 432.00,
    gain: 0.25,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 500, q: 2.5 },
  } as AudioVoiceToneParams,
} as const;

export class AbyssalHazardAudio {
  private static instance: AbyssalHazardAudio | null = null;
  private voicePool: AudioVoicePool | null = null;

  private static sharedNoiseBuffer: AudioBuffer | null = null;
  private static pendingNodes: Set<AudioNode> = new Set();
  private static activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  private static lastState: AbyssalLifecycleState | string = AbyssalLifecycleState.DORMANT;
  private static lastTelegraph: AbyssalTelegraphPhase | string = AbyssalTelegraphPhase.NONE;
  private static lastDroneTimestampMs: number = 0;
  private static lastSweepTimestampMs: number = 0;

  constructor(pool?: AudioVoicePool | null) {
    if (pool) {
      this.voicePool = pool;
    } else {
      this.voicePool = AudioVoicePool.getInstance();
    }
  }

  public static getInstance(pool?: AudioVoicePool | null): AbyssalHazardAudio {
    if (!AbyssalHazardAudio.instance) {
      AbyssalHazardAudio.instance = new AbyssalHazardAudio(pool);
    }
    return AbyssalHazardAudio.instance;
  }

  /**
   * Safe AudioContext accessor with Headless SSR resilience
   */
  public static getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      return AudioVoicePool.getInstance().getAudioContext();
    } catch {
      return null;
    }
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
  public static playAbyssalHazardState(
    state: AbyssalLifecycleState | string,
    telegraphPhase: AbyssalTelegraphPhase | string,
    voicePool?: AudioVoicePool | null,
    nowMs: number = Date.now()
  ): void {
    if (state === this.lastState && telegraphPhase === this.lastTelegraph) {
      return;
    }

    const prevState = this.lastState;
    const prevTelegraph = this.lastTelegraph;
    this.lastState = state;
    this.lastTelegraph = telegraphPhase;

    const audio = AbyssalHazardAudio.getInstance(voicePool);

    const stateStr = state as string;
    const teleStr = telegraphPhase as string;
    const prevStr = prevState as string;

    switch (stateStr) {
      case AbyssalLifecycleState.TIDAL_SURGE:
      case 'ABYSSAL_TIDE':
      case 'MAELSTROM_SURGE':
      case 'VORTEX_BUILDUP': {
        if (
          (teleStr === AbyssalTelegraphPhase.TIDAL_UNDERTOW ||
            teleStr === 'TRENCH_MURMUR' ||
            teleStr === 'ABYSSAL_MURMUR') &&
          prevTelegraph !== AbyssalTelegraphPhase.TIDAL_UNDERTOW
        ) {
          if (nowMs - this.lastDroneTimestampMs >= 800) {
            this.lastDroneTimestampMs = nowMs;
            audio.playSubBassOceanDrone(voicePool);
            audio.playTidalUndertowChime(voicePool);
          }
        } else if (
          (teleStr === AbyssalTelegraphPhase.TRENCH_CONVERGENCE ||
            teleStr === 'MAELSTROM_SWIRL' ||
            teleStr === 'CONVERGENCE_PHASE') &&
          prevTelegraph !== AbyssalTelegraphPhase.TRENCH_CONVERGENCE
        ) {
          if (nowMs - this.lastSweepTimestampMs >= 400) {
            this.lastSweepTimestampMs = nowMs;
            audio.playTidalConvergenceSweep(voicePool);
          }
        } else if (
          (teleStr === AbyssalTelegraphPhase.MAELSTROM_IMMINENT ||
            teleStr === 'TIDAL_IMMINENT' ||
            teleStr === 'BURST_IMMINENT') &&
          prevTelegraph !== AbyssalTelegraphPhase.MAELSTROM_IMMINENT
        ) {
          audio.playTidalConvergenceSweep(voicePool);
          audio.playRushingTidalNoisePulse(0.25, 480, 80, 2.8);
        }
        break;
      }

      case AbyssalLifecycleState.ABYSSAL_MAELSTROM:
      case 'MAELSTROM_BURST':
      case 'ABYSSAL_BURST':
      case 'MAELSTROM_COLLAPSE':
      case 'TIDAL_BURST':
      case 'OCEAN_DELUGE': {
        if (
          prevStr !== AbyssalLifecycleState.ABYSSAL_MAELSTROM &&
          prevStr !== 'MAELSTROM_BURST' &&
          prevStr !== 'ABYSSAL_BURST' &&
          prevStr !== 'MAELSTROM_COLLAPSE' &&
          prevStr !== 'TIDAL_BURST'
        ) {
          audio.playMaelstromBurst(voicePool);
        }
        break;
      }

      case AbyssalLifecycleState.OCEANIC_CALM:
      case 'COOLDOWN':
      case 'ABYSSAL_COOLDOWN':
      case 'RECOVERY': {
        if (
          prevStr !== AbyssalLifecycleState.OCEANIC_CALM &&
          prevStr !== 'COOLDOWN' &&
          prevStr !== 'ABYSSAL_COOLDOWN'
        ) {
          audio.playOceanicCalmingChime(voicePool);
        }
        break;
      }

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Sub-bass Ocean Drone (48Hz)
  // ---------------------------------------------------------------------------
  public static playSubBassOceanDrone(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.SUB_BASS_OCEAN_DRONE_48HZ);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.ABYSSAL_TRENCH_RESONANCE_HUM);
    }
  }

  public playSubBassOceanDrone(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playSubBassOceanDrone(voicePool ?? this.voicePool);
  }

  public static playOceanicSubDrone(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playSubBassOceanDrone(voicePool);
  }

  public playOceanicSubDrone(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playSubBassOceanDrone(voicePool ?? this.voicePool);
  }

  // ---------------------------------------------------------------------------
  // 2. Tidal Convergence & Undertow Sweeps
  // ---------------------------------------------------------------------------
  public static playTidalConvergenceSweep(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.TRENCH_CONVERGENCE_SURGE);
    }
  }

  public playTidalConvergenceSweep(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playTidalConvergenceSweep(voicePool ?? this.voicePool);
  }

  public static playTrenchConvergenceSweep(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playTidalConvergenceSweep(voicePool);
  }

  public playTrenchConvergenceSweep(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playTidalConvergenceSweep(voicePool ?? this.voicePool);
  }

  public static playTidalUndertowChime(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.TIDAL_UNDERTOW_SWEEP_320HZ);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.TIDAL_UNDERTOW_OVERTONE_SWEEP);
    }
  }

  public playTidalUndertowChime(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playTidalUndertowChime(voicePool ?? this.voicePool);
  }

  // ---------------------------------------------------------------------------
  // 3. Resonant Low-pass Maelstrom Sweep & Burst
  // ---------------------------------------------------------------------------
  public static playMaelstromSweep(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.MAELSTROM_SWEEP_CRACK_640HZ);
    }
  }

  public playMaelstromSweep(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playMaelstromSweep(voicePool ?? this.voicePool);
  }

  public static playMaelstromBurst(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.MAELSTROM_SWEEP_CRACK_640HZ);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.MAELSTROM_CHORD_MID_360HZ);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.MAELSTROM_SUB_VORTEX_IMPACT_48HZ);
    }
    AbyssalHazardAudio.playRushingTidalNoisePulse(0.35, 640, 48, 3.8);
  }

  public playMaelstromBurst(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playMaelstromBurst(voicePool ?? this.voicePool);
  }

  public static playMaelstromImplosion(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playMaelstromBurst(voicePool);
  }

  public playMaelstromImplosion(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playMaelstromBurst(voicePool ?? this.voicePool);
  }

  // ---------------------------------------------------------------------------
  // 4. Procedural Rushing Tidal White Noise Pulse with Auto-disconnect
  // ---------------------------------------------------------------------------
  public static playRushingTidalNoisePulse(
    durationSec: number = 0.35,
    startFilterFreq: number = 640,
    endFilterFreq: number = 48,
    q: number = 3.8
  ): void {
    // Mathematical defense against subnormal floats (1e-323): flush to zero & early return
    if (typeof durationSec === 'number' && Math.abs(durationSec) < 1e-8) return;
    const ctx = AbyssalHazardAudio.getAudioContext();
    if (!ctx || ctx.state === 'closed') return;

    const noiseBuffer = AbyssalHazardAudio.getOrCreateNoiseBuffer(ctx);
    if (!noiseBuffer) return;

    let sourceNode: AudioBufferSourceNode | null = null;
    let filterNode: BiquadFilterNode | null = null;
    let gainNode: GainNode | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        AbyssalHazardAudio.activeTimers.delete(timerId);
        timerId = null;
      }
      try {
        if (sourceNode) {
          sourceNode.onended = null;
          try { sourceNode.stop(); } catch { /* Safe ignore */ }
          sourceNode.disconnect();
        }
        if (filterNode) filterNode.disconnect();
        if (gainNode) gainNode.disconnect();
      } catch {
        // Safe ignore
      }
      if (sourceNode) AbyssalHazardAudio.pendingNodes.delete(sourceNode);
      if (filterNode) AbyssalHazardAudio.pendingNodes.delete(filterNode);
      if (gainNode) AbyssalHazardAudio.pendingNodes.delete(gainNode);
    };

    try {
      const now = ctx.currentTime;
      sourceNode = ctx.createBufferSource();
      sourceNode.buffer = noiseBuffer;
      sourceNode.loop = false;

      filterNode = ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(startFilterFreq, now);
      filterNode.frequency.exponentialRampToValueAtTime(
        Math.max(10, endFilterFreq),
        now + durationSec
      );
      filterNode.Q.setValueAtTime(q, now);

      gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.35, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      sourceNode.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      AbyssalHazardAudio.pendingNodes.add(sourceNode);
      AbyssalHazardAudio.pendingNodes.add(filterNode);
      AbyssalHazardAudio.pendingNodes.add(gainNode);

      sourceNode.onended = cleanup;
      sourceNode.start(now);
      sourceNode.stop(now + durationSec + 0.05);

      timerId = setTimeout(() => {
        if (timerId !== null) AbyssalHazardAudio.activeTimers.delete(timerId);
        cleanup();
      }, Math.ceil((durationSec + 0.1) * 1000));
      AbyssalHazardAudio.activeTimers.add(timerId);
    } catch {
      cleanup();
    }
  }

  public playRushingTidalNoisePulse(
    durationSec: number = 0.35,
    startFilterFreq: number = 640,
    endFilterFreq: number = 48,
    q: number = 3.8
  ): void {
    AbyssalHazardAudio.playRushingTidalNoisePulse(
      durationSec,
      startFilterFreq,
      endFilterFreq,
      q
    );
  }

  public static playMaelstromWhiteNoisePulse(
    durationSec: number = 0.28,
    startCutoff: number = 680,
    endCutoff: number = 48,
    qVal: number = 3.8
  ): void {
    AbyssalHazardAudio.playRushingTidalNoisePulse(durationSec, startCutoff, endCutoff, qVal);
  }

  public playMaelstromWhiteNoisePulse(
    durationSec: number = 0.28,
    startCutoff: number = 680,
    endCutoff: number = 48,
    qVal: number = 3.8
  ): void {
    AbyssalHazardAudio.playRushingTidalNoisePulse(durationSec, startCutoff, endCutoff, qVal);
  }

  // ---------------------------------------------------------------------------
  // 5. Solfeggio 432Hz Oceanic Calming Chime
  // ---------------------------------------------------------------------------
  public static playOceanicCalmingChime(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.OCEANIC_CALM_ROOT_432HZ);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.OCEANIC_CALM_THIRD_540HZ);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.OCEANIC_CALM_FIFTH_648HZ);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.OCEANIC_CALM_OCTAVE_864HZ);
    }
  }

  public playOceanicCalmingChime(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playOceanicCalmingChime(voicePool ?? this.voicePool);
  }

  public static playOceanicCalmResolution(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playOceanicCalmingChime(voicePool);
  }

  public playOceanicCalmResolution(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playOceanicCalmingChime(voicePool ?? this.voicePool);
  }

  // ---------------------------------------------------------------------------
  // 6. Combat Mastery & Tactical Presets
  // ---------------------------------------------------------------------------
  public static playAquaGlideChimes(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.AQUA_GLIDE_CHIME_HIGH);
      pool.playTone(ABYSSAL_AUDIO_PRESETS.AQUA_GLIDE_CHIME_MID);
    }
  }

  public playAquaGlideChimes(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAquaGlideChimes(voicePool ?? this.voicePool);
  }

  public static playAbyssalGlideChimes(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAquaGlideChimes(voicePool);
  }

  public playAbyssalGlideChimes(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAquaGlideChimes(voicePool ?? this.voicePool);
  }

  public static playAbyssalPressureWarning(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.ABYSSAL_PRESSURE_WARBLE);
    }
  }

  public playAbyssalPressureWarning(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAbyssalPressureWarning(voicePool ?? this.voicePool);
  }

  public static playHydrostaticDragWarning(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAbyssalPressureWarning(voicePool);
  }

  public playHydrostaticDragWarning(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAbyssalPressureWarning(voicePool ?? this.voicePool);
  }

  public static playOceanSlipstreamKick(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.OCEANIC_SLIPSTREAM_KICK);
    }
  }

  public playOceanSlipstreamKick(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playOceanSlipstreamKick(voicePool ?? this.voicePool);
  }

  public static playHydroSlipstreamKick(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playOceanSlipstreamKick(voicePool);
  }

  public playHydroSlipstreamKick(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playOceanSlipstreamKick(voicePool ?? this.voicePool);
  }

  public static playAbyssalAnchorSnap(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(ABYSSAL_AUDIO_PRESETS.ABYSSAL_ANCHOR_SNAP);
    }
  }

  public playAbyssalAnchorSnap(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAbyssalAnchorSnap(voicePool ?? this.voicePool);
  }

  public static playOceanicCalmSnap(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAbyssalAnchorSnap(voicePool);
  }

  public playOceanicCalmSnap(voicePool?: AudioVoicePool | null): void {
    AbyssalHazardAudio.playAbyssalAnchorSnap(voicePool ?? this.voicePool);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle & Auto-disconnect Cleanup
  // ---------------------------------------------------------------------------
  public static stop(): void {
    AbyssalHazardAudio.clearPendingNodes();
  }

  public stop(): void {
    AbyssalHazardAudio.stop();
  }

  public static clearPendingNodes(): void {
    for (const timer of AbyssalHazardAudio.activeTimers) {
      clearTimeout(timer);
    }
    AbyssalHazardAudio.activeTimers.clear();

    for (const node of AbyssalHazardAudio.pendingNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // Safe ignore
      }
    }
    AbyssalHazardAudio.pendingNodes.clear();
  }

  public static destroy(): void {
    AbyssalHazardAudio.clearPendingNodes();
    AbyssalHazardAudio.sharedNoiseBuffer = null;
    AbyssalHazardAudio.lastState = AbyssalLifecycleState.DORMANT;
    AbyssalHazardAudio.lastTelegraph = AbyssalTelegraphPhase.NONE;
    AbyssalHazardAudio.lastDroneTimestampMs = 0;
    AbyssalHazardAudio.lastSweepTimestampMs = 0;
    AbyssalHazardAudio.instance = null;
  }

  public destroy(): void {
    AbyssalHazardAudio.destroy();
  }
}
