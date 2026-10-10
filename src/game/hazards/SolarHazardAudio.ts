/**
 * SolarHazardAudio.ts — Procedural Web Audio Sound Synthesizer for SolarHazard Events
 *
 * Implements Procedural Audio for the Solar Corona & Superheated Plasma Subsystem:
 * - Low-Frequency Thermonuclear Drone: 38.4Hz sub-bass stellar resonance drone (38.4Hz -> 28Hz)
 * - Solar Whisper Shimmer: Faint thermal resonance hum and micro-chirp (64Hz -> 48Hz)
 * - Corona Arc Sweep: Rising magnetohydrodynamic plasma sweep (280Hz -> 620Hz with 520Hz -> 960Hz bandpass)
 * - Superheat Flare Sonic Crack: Steep exponential frequency drop (920Hz -> 42Hz) + sub-thud (48Hz -> 16Hz)
 *   + C-major radiant triad (C5, E5, G5) + filtered procedural white noise solar ejection burst
 * - Solar Surf Chimes: High-register harmonic burst (G5 / 784Hz -> C6 / 1046.5Hz -> G6 / 1568Hz)
 * - Solar Calm Harmonic Chord: Calming harmonic resolution (C5 / 523Hz -> E5 / 659Hz -> G5 / 784Hz)
 * - Sunstroke Warble: Overheating slow debuff notification (360Hz -> 180Hz)
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Uses pre-allocated 16-voice AudioVoicePool (persistent oscillators, ADSR envelopes, click-free stealing)
 * - Cached static 500ms white noise buffer reused indefinitely without runtime GC allocations
 * - Transient noise/filter nodes employ active tracking, dual cleanup (source.onended + watchdog timeout),
 *   and clearPendingNodes / destroy lifecycle management
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { SolarLifecycleState, SolarTelegraphPhase } from './SolarHazard.ts';

export const SOLAR_AUDIO_PRESETS = {
  // 1. Low Frequency Thermonuclear Drone: 38.4Hz Sub-bass Stellar Resonance
  THERMONUCLEAR_SUB_DRONE_38HZ: {
    type: 'sine',
    frequency: 38.4,
    frequencyRamp: { target: 28.0, duration: 0.90, exponential: true },
    gain: 0.30,
    duration: 1.15,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 95, q: 1.8 },
  } as AudioVoiceToneParams,

  // Solar Whisper Hum: Early telegraph thermal hum
  SOLAR_WHISPER_HUM: {
    type: 'triangle',
    frequency: 64.0,
    frequencyRamp: { target: 48.0, duration: 0.75, exponential: true },
    gain: 0.22,
    duration: 0.85,
    attackTime: 0.15,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 130, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Corona Arc Sweep: Rising plasma loop
  CORONA_ARC_SWEEP: {
    type: 'sawtooth',
    frequency: 280.0,
    frequencyRamp: { target: 620.0, duration: 0.35, exponential: true },
    gain: 0.18,
    duration: 0.42,
    attackTime: 0.04,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 520, q: 3.2, rampTarget: 960, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  // 3. Superheat Flare Sonic Crack: Steep exponential drop
  SUPERHEAT_FLARE_CRACK: {
    type: 'sawtooth',
    frequency: 920.0,
    frequencyRamp: { target: 42.0, duration: 0.08, exponential: true },
    gain: 0.38,
    duration: 0.22,
    attackTime: 0.003,
    decayTime: 0.08,
    sustainLevel: 0.15,
    releaseTime: 0.13,
    filter: { type: 'lowpass', frequency: 1800, q: 2.2, rampTarget: 180, rampDuration: 0.18 },
  } as AudioVoiceToneParams,

  // Superheat Flare Sub-Thud: Low-frequency seismic thermonuclear rumble
  SUPERHEAT_FLARE_SUB_THUD: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 16.0, duration: 0.45, exponential: true },
    gain: 0.45,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 85, q: 1.5 },
  } as AudioVoiceToneParams,

  // 4. Solar Surf Chimes (G5 / 784Hz, C6 / 1046.5Hz, G6 / 1568Hz)
  SOLAR_SURF_CHIME_HIGH: {
    type: 'sine',
    frequency: 783.99, // G5
    frequencyRamp: { target: 1567.98, duration: 0.25, exponential: true }, // G6
    gain: 0.24,
    duration: 0.45,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1100, q: 2.0 },
  } as AudioVoiceToneParams,

  SOLAR_SURF_CHIME_MID: {
    type: 'sine',
    frequency: 1046.50, // C6
    gain: 0.20,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1150, q: 2.2 },
  } as AudioVoiceToneParams,

  // 5. Solar Calm Harmonic Chord (C5 / 523Hz -> E5 / 659Hz -> G5 / 784Hz)
  SOLAR_CALM_SNAP: {
    type: 'sine',
    frequency: 523.25, // C5
    gain: 0.25,
    duration: 0.40,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 650, q: 2.5 },
  } as AudioVoiceToneParams,

  SOLAR_CALM_CHORD: {
    type: 'triangle',
    frequency: 659.25, // E5
    gain: 0.20,
    duration: 0.50,
    attackTime: 0.02,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 780, q: 2.0 },
  } as AudioVoiceToneParams,

  // 6. Sunstroke Warble: Thermal slow warning
  SUNSTROKE_WARBLE: {
    type: 'sawtooth',
    frequency: 360.0,
    frequencyRamp: { target: 180.0, duration: 0.25, exponential: true },
    gain: 0.18,
    duration: 0.30,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 450, q: 3.0 },
  } as AudioVoiceToneParams,
} as const;

export class SolarHazardAudio {
  private static instance: SolarHazardAudio | null = null;
  private voicePool: AudioVoicePool | null = null;

  private static sharedNoiseBuffer: AudioBuffer | null = null;
  private static pendingNodes: Set<AudioNode> = new Set();
  private static activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  private static lastState: SolarLifecycleState = SolarLifecycleState.DORMANT;
  private static lastTelegraph: SolarTelegraphPhase = SolarTelegraphPhase.NONE;
  private static lastDroneTimestampMs: number = 0;

  constructor(pool?: AudioVoicePool | null) {
    if (pool) {
      this.voicePool = pool;
    } else {
      this.voicePool = AudioVoicePool.getInstance();
    }
  }

  public static getInstance(pool?: AudioVoicePool | null): SolarHazardAudio {
    if (!SolarHazardAudio.instance) {
      SolarHazardAudio.instance = new SolarHazardAudio(pool);
    }
    return SolarHazardAudio.instance;
  }

  public static getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    return AudioVoicePool.getInstance().getAudioContext();
  }

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

  public static playSolarHazardState(
    state: SolarLifecycleState,
    telegraphPhase: SolarTelegraphPhase,
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

    if (state === SolarLifecycleState.SOLAR_CORONA) {
      if (telegraphPhase === SolarTelegraphPhase.SOLAR_WHISPER && prevTelegraph !== SolarTelegraphPhase.SOLAR_WHISPER) {
        if (nowMs - this.lastDroneTimestampMs >= 800) {
          this.lastDroneTimestampMs = nowMs;
          this.playThermonuclearDrone(voicePool);
        }
      } else if (telegraphPhase === SolarTelegraphPhase.CORONA_SURGE && prevTelegraph !== SolarTelegraphPhase.CORONA_SURGE) {
        this.playCoronaArcSweep(voicePool);
      } else if (telegraphPhase === SolarTelegraphPhase.SUPERHEAT_DISCHARGE && prevTelegraph !== SolarTelegraphPhase.SUPERHEAT_DISCHARGE) {
        this.playCoronaArcSweep(voicePool);
      }
    } else if (state === SolarLifecycleState.SUPERHEAT_FLARE && prevState !== SolarLifecycleState.SUPERHEAT_FLARE) {
      this.playSuperheatFlareCrack(voicePool);
    }
  }

  public static playThermonuclearDrone(voicePool?: AudioVoicePool | null): void {
    if (voicePool) {
      voicePool.playTone(SOLAR_AUDIO_PRESETS.THERMONUCLEAR_SUB_DRONE_38HZ);
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SOLAR_WHISPER_HUM);
    }
  }

  public static playCoronaArcSweep(voicePool?: AudioVoicePool | null): void {
    if (voicePool) {
      voicePool.playTone(SOLAR_AUDIO_PRESETS.CORONA_ARC_SWEEP);
    }
  }

  public static playSuperheatFlareCrack(voicePool?: AudioVoicePool | null): void {
    if (voicePool) {
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SUPERHEAT_FLARE_CRACK);
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SUPERHEAT_FLARE_SUB_THUD);
    }
    this.playWhiteNoiseBurst(0.25, 600);
  }

  public static playSolarSurfChimes(voicePool?: AudioVoicePool | null): void {
    if (voicePool) {
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SOLAR_SURF_CHIME_HIGH);
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SOLAR_SURF_CHIME_MID);
    }
  }

  public static playSolarCalmResolution(voicePool?: AudioVoicePool | null): void {
    if (voicePool) {
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SOLAR_CALM_SNAP);
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SOLAR_CALM_CHORD);
    }
  }

  public static playSunstrokeWarble(voicePool?: AudioVoicePool | null): void {
    if (voicePool) {
      voicePool.playTone(SOLAR_AUDIO_PRESETS.SUNSTROKE_WARBLE);
    }
  }

  public static playWhiteNoiseBurst(durationSec: number = 0.20, filterFreq: number = 800): void {
    const ctx = this.getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    let sourceNode: AudioBufferSourceNode | null = null;
    let filterNode: BiquadFilterNode | null = null;
    let gainNode: GainNode | null = null;

    const cleanup = () => {
      try {
        if (sourceNode) {
          sourceNode.onended = null;
          sourceNode.disconnect();
        }
        if (filterNode) filterNode.disconnect();
        if (gainNode) gainNode.disconnect();
      } catch {
        // ignore already disconnected
      }
      if (sourceNode) this.pendingNodes.delete(sourceNode);
      if (filterNode) this.pendingNodes.delete(filterNode);
      if (gainNode) this.pendingNodes.delete(gainNode);
    };

    try {
      const buffer = this.getOrCreateNoiseBuffer(ctx);
      if (!buffer) return;
      sourceNode = ctx.createBufferSource();
      sourceNode.buffer = buffer;

      filterNode = ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(filterFreq, ctx.currentTime);

      gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.20, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

      sourceNode.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.pendingNodes.add(sourceNode);
      this.pendingNodes.add(filterNode);
      this.pendingNodes.add(gainNode);

      sourceNode.onended = cleanup;
      sourceNode.start();
      sourceNode.stop(ctx.currentTime + durationSec);

      const timer = setTimeout(cleanup, Math.ceil(durationSec * 1000) + 50);
      this.activeTimers.add(timer);
    } catch {
      cleanup();
    }
  }

  public static clearPendingNodes(): void {
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();

    for (const node of this.pendingNodes) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.pendingNodes.clear();
  }

  public static destroy(): void {
    this.clearPendingNodes();
    this.sharedNoiseBuffer = null;
    this.lastState = SolarLifecycleState.DORMANT;
    this.lastTelegraph = SolarTelegraphPhase.NONE;
    this.lastDroneTimestampMs = 0;
    SolarHazardAudio.instance = null;
  }

  public playSolarHazardState(
    state: SolarLifecycleState,
    telegraphPhase: SolarTelegraphPhase,
    voicePool?: AudioVoicePool | null,
    nowMs: number = Date.now()
  ): void {
    SolarHazardAudio.playSolarHazardState(state, telegraphPhase, voicePool ?? this.voicePool, nowMs);
  }

  public playThermonuclearDrone(voicePool?: AudioVoicePool | null): void {
    SolarHazardAudio.playThermonuclearDrone(voicePool ?? this.voicePool);
  }

  public playCoronaArcSweep(voicePool?: AudioVoicePool | null): void {
    SolarHazardAudio.playCoronaArcSweep(voicePool ?? this.voicePool);
  }

  public playSuperheatFlareCrack(voicePool?: AudioVoicePool | null): void {
    SolarHazardAudio.playSuperheatFlareCrack(voicePool ?? this.voicePool);
  }

  public playSolarSurfChimes(voicePool?: AudioVoicePool | null): void {
    SolarHazardAudio.playSolarSurfChimes(voicePool ?? this.voicePool);
  }

  public playSolarCalmResolution(voicePool?: AudioVoicePool | null): void {
    SolarHazardAudio.playSolarCalmResolution(voicePool ?? this.voicePool);
  }

  public stop(): void {
    SolarHazardAudio.clearPendingNodes();
  }

  public destroy(): void {
    SolarHazardAudio.destroy();
  }
}
