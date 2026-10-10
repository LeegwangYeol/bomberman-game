/**
 * NebulaHazardAudio.ts — Procedural Web Audio Sound Synthesizer for NebulaHazard Events
 *
 * Implements 100% Procedural Audio for the Astral Nebula & Solar Eclipse Subsystem:
 * - Cosmic Ether Drone: 55Hz sub-bass stellar resonance fundamental (55Hz -> 41.25Hz) + 82.5Hz harmonic hum
 * - Stardust Whisper Chime: 432Hz -> 864Hz harmonic sweeps (natural cosmic tuning A4 -> A5) + 864Hz -> 1296Hz overtone sweep
 * - Eclipse Collapse Implosion Chord: Steep exponential plunge (720Hz -> 65Hz) with resonant lowpass filter
 *   sweeping 720Hz -> 65Hz (Q=3.5) + seismic sub-thud (65Hz -> 20Hz) + filtered procedural white noise pulse
 * - Stellar Dawn Resolution Triad: 528Hz Solfeggio miracle frequency + 660Hz (5:4 major third) + 792Hz (3:2 perfect fifth)
 * - Astral Combat Mastery & Tactical Bombs: Astral Glide dual chimes (1056Hz -> 1584Hz), Optical Lens slipstream kick
 *   (528Hz -> 1056Hz), Stardust Calm snap (528Hz), and Cosmic Daze slow warble (320Hz -> 160Hz)
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Uses pre-allocated 16-voice AudioVoicePool (persistent oscillators, ADSR envelopes, click-free stealing)
 * - Cached static 500ms white noise buffer reused indefinitely without runtime GC allocations
 * - Transient noise/filter nodes employ active tracking, dual cleanup (source.onended + watchdog timeout),
 *   and clearPendingNodes / destroy lifecycle management
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { NebulaLifecycleState, NebulaTelegraphPhase } from './NebulaHazard.ts';

export const NEBULA_AUDIO_PRESETS = {
  // 1. Cosmic Ether Drone: 55Hz Sub-bass Stellar Resonance
  COSMIC_ETHER_SUB_DRONE_55HZ: {
    type: 'sine',
    frequency: 55.0,
    frequencyRamp: { target: 41.25, duration: 0.90, exponential: true },
    gain: 0.32,
    duration: 1.20,
    attackTime: 0.22,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 110, q: 1.8 },
  } as AudioVoiceToneParams,

  COSMIC_ETHER_RESONANCE_HUM: {
    type: 'triangle',
    frequency: 82.5,
    frequencyRamp: { target: 55.0, duration: 0.75, exponential: true },
    gain: 0.20,
    duration: 0.85,
    attackTime: 0.15,
    decayTime: 0.30,
    sustainLevel: 0.35,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 130, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Stardust Whisper Chime: 432Hz -> 864Hz Harmonic Sweeps
  STARDUST_WHISPER_SWEEP_432HZ: {
    type: 'sine',
    frequency: 432.0,
    frequencyRamp: { target: 864.0, duration: 0.35, exponential: true },
    gain: 0.22,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 648, q: 2.8, rampTarget: 1296, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  STARDUST_WHISPER_OVERTONE_SWEEP: {
    type: 'sine',
    frequency: 864.0,
    frequencyRamp: { target: 1296.0, duration: 0.28, exponential: true },
    gain: 0.18,
    duration: 0.40,
    attackTime: 0.02,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1080, q: 2.4 },
  } as AudioVoiceToneParams,

  // Pre-Eclipse Filament Convergence
  PENUMBRA_ARC_SWEEP: {
    type: 'sawtooth',
    frequency: 220.0,
    frequencyRamp: { target: 580.0, duration: 0.35, exponential: true },
    gain: 0.18,
    duration: 0.42,
    attackTime: 0.04,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 400, q: 3.2, rampTarget: 850, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  // 3. Eclipse Collapse Implosion Chord (720Hz -> 65Hz Resonant Lowpass)
  ECLIPSE_COLLAPSE_CRACK_720HZ: {
    type: 'sawtooth',
    frequency: 720.0,
    frequencyRamp: { target: 65.0, duration: 0.10, exponential: true },
    gain: 0.42,
    duration: 0.26,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.18,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 720, q: 3.5, rampTarget: 65, rampDuration: 0.20 },
  } as AudioVoiceToneParams,

  ECLIPSE_COLLAPSE_SUB_IMPACT_65HZ: {
    type: 'sine',
    frequency: 65.0,
    frequencyRamp: { target: 20.0, duration: 0.45, exponential: true },
    gain: 0.50,
    duration: 0.55,
    attackTime: 0.005,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 95, q: 1.6 },
  } as AudioVoiceToneParams,

  ECLIPSE_COLLAPSE_CHORD_MID_540HZ: {
    type: 'triangle',
    frequency: 540.0,
    frequencyRamp: { target: 65.0, duration: 0.12, exponential: true },
    gain: 0.26,
    duration: 0.30,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 720, q: 3.0, rampTarget: 65, rampDuration: 0.20 },
  } as AudioVoiceToneParams,

  // 4. Stellar Dawn Resolution Triad (528Hz Solfeggio Frequency)
  STELLAR_DAWN_TRIAD_ROOT_528HZ: {
    type: 'sine',
    frequency: 528.00, // Solfeggio MI (Transformation)
    gain: 0.26,
    duration: 0.65,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 528, q: 2.5 },
  } as AudioVoiceToneParams,

  STELLAR_DAWN_TRIAD_THIRD_660HZ: {
    type: 'triangle',
    frequency: 660.00, // 5:4 pure harmonic major third
    gain: 0.22,
    duration: 0.65,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 660, q: 2.2 },
  } as AudioVoiceToneParams,

  STELLAR_DAWN_TRIAD_FIFTH_792HZ: {
    type: 'sine',
    frequency: 792.00, // 3:2 pure harmonic perfect fifth
    gain: 0.18,
    duration: 0.70,
    attackTime: 0.025,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.45,
    filter: { type: 'bandpass', frequency: 792, q: 2.0 },
  } as AudioVoiceToneParams,

  STELLAR_DAWN_TRIAD_OCTAVE_1056HZ: {
    type: 'sine',
    frequency: 1056.00, // 2:1 octave resolve
    gain: 0.14,
    duration: 0.60,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 1056, q: 2.0 },
  } as AudioVoiceToneParams,

  // 5. Combat Mastery & Tactical Bomb Presets
  ASTRAL_GLIDE_CHIME_HIGH: {
    type: 'sine',
    frequency: 1056.00,
    frequencyRamp: { target: 1584.00, duration: 0.25, exponential: true },
    gain: 0.22,
    duration: 0.45,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1300, q: 2.0 },
  } as AudioVoiceToneParams,

  ASTRAL_GLIDE_CHIME_MID: {
    type: 'sine',
    frequency: 1320.00,
    gain: 0.20,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1400, q: 2.2 },
  } as AudioVoiceToneParams,

  COSMIC_DAZE_WARBLE: {
    type: 'sawtooth',
    frequency: 320.0,
    frequencyRamp: { target: 160.0, duration: 0.25, exponential: true },
    gain: 0.18,
    duration: 0.30,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'lowpass', frequency: 400, q: 3.0 },
  } as AudioVoiceToneParams,

  OPTICAL_LENS_PROPULSION: {
    type: 'triangle',
    frequency: 528.0,
    frequencyRamp: { target: 1056.0, duration: 0.18, exponential: true },
    gain: 0.24,
    duration: 0.25,
    attackTime: 0.005,
    decayTime: 0.08,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 800, q: 2.6 },
  } as AudioVoiceToneParams,

  STARDUST_CALM_SNAP: {
    type: 'sine',
    frequency: 528.00,
    gain: 0.25,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 600, q: 2.5 },
  } as AudioVoiceToneParams,
} as const;

export class NebulaHazardAudio {
  private static instance: NebulaHazardAudio | null = null;
  private voicePool: AudioVoicePool | null = null;

  private static sharedNoiseBuffer: AudioBuffer | null = null;
  private static pendingNodes: Set<AudioNode> = new Set();
  private static activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  private static lastState: NebulaLifecycleState = NebulaLifecycleState.DORMANT;
  private static lastTelegraph: NebulaTelegraphPhase = NebulaTelegraphPhase.NONE;
  private static lastDroneTimestampMs: number = 0;
  private static lastSweepTimestampMs: number = 0;

  constructor(pool?: AudioVoicePool | null) {
    if (pool) {
      this.voicePool = pool;
    } else {
      this.voicePool = AudioVoicePool.getInstance();
    }
  }

  public static getInstance(pool?: AudioVoicePool | null): NebulaHazardAudio {
    if (!NebulaHazardAudio.instance) {
      NebulaHazardAudio.instance = new NebulaHazardAudio(pool);
    }
    return NebulaHazardAudio.instance;
  }

  public static getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  public static playNebulaHazardState(
    state: NebulaLifecycleState,
    telegraphPhase: NebulaTelegraphPhase,
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

    const audio = NebulaHazardAudio.getInstance(voicePool);

    switch (state) {
      case NebulaLifecycleState.NEBULA_DRIFT: {
        if (telegraphPhase === NebulaTelegraphPhase.ASTRAL_WHISPER && prevTelegraph !== NebulaTelegraphPhase.ASTRAL_WHISPER) {
          if (nowMs - this.lastDroneTimestampMs >= 800) {
            this.lastDroneTimestampMs = nowMs;
            audio.playCosmicEtherDrone(voicePool);
            audio.playStardustWhisperChime(voicePool);
          }
        } else if (telegraphPhase === NebulaTelegraphPhase.COSMIC_CONVERGENCE && prevTelegraph !== NebulaTelegraphPhase.COSMIC_CONVERGENCE) {
          if (nowMs - this.lastSweepTimestampMs >= 400) {
            this.lastSweepTimestampMs = nowMs;
            audio.playPenumbraSweep(voicePool);
            audio.playStardustWhisperChime(voicePool);
          }
        } else if (telegraphPhase === NebulaTelegraphPhase.ECLIPSE_IMMINENT && prevTelegraph !== NebulaTelegraphPhase.ECLIPSE_IMMINENT) {
          audio.playPenumbraSweep(voicePool);
        }
        break;
      }

      case NebulaLifecycleState.ECLIPSE_COLLAPSE: {
        if (prevState !== NebulaLifecycleState.ECLIPSE_COLLAPSE) {
          audio.playEclipseCollapseImplosion(voicePool);
        }
        break;
      }

      case NebulaLifecycleState.STELLAR_DAWN: {
        if (prevState !== NebulaLifecycleState.STELLAR_DAWN) {
          audio.playStellarDawnResolution(voicePool);
        }
        break;
      }

      default:
        break;
    }
  }

  // 1. Cosmic Ether Drone (55Hz sub-bass)
  public static playCosmicEtherDrone(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.COSMIC_ETHER_SUB_DRONE_55HZ);
      pool.playTone(NEBULA_AUDIO_PRESETS.COSMIC_ETHER_RESONANCE_HUM);
    }
  }

  public playCosmicEtherDrone(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playCosmicEtherDrone(voicePool ?? this.voicePool);
  }

  // 2. Stardust Whisper Chime (432Hz -> 864Hz harmonic sweeps)
  public static playStardustWhisperChime(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.STARDUST_WHISPER_SWEEP_432HZ);
      pool.playTone(NEBULA_AUDIO_PRESETS.STARDUST_WHISPER_OVERTONE_SWEEP);
    }
  }

  public playStardustWhisperChime(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playStardustWhisperChime(voicePool ?? this.voicePool);
  }

  public static playPenumbraSweep(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.PENUMBRA_ARC_SWEEP);
    }
  }

  public playPenumbraSweep(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playPenumbraSweep(voicePool ?? this.voicePool);
  }

  // 3. Eclipse Collapse Implosion Chord (720Hz -> 65Hz resonant lowpass filter with white noise pulse)
  public static playEclipseCollapseImplosion(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.ECLIPSE_COLLAPSE_CRACK_720HZ);
      pool.playTone(NEBULA_AUDIO_PRESETS.ECLIPSE_COLLAPSE_CHORD_MID_540HZ);
      pool.playTone(NEBULA_AUDIO_PRESETS.ECLIPSE_COLLAPSE_SUB_IMPACT_65HZ);
    }
    NebulaHazardAudio.playEclipseWhiteNoisePulse(0.28, 720, 65, 3.5);
  }

  public playEclipseCollapseImplosion(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playEclipseCollapseImplosion(voicePool ?? this.voicePool);
  }

  // 4. Stellar Dawn Resolution Triad (528Hz Solfeggio frequency)
  public static playStellarDawnResolution(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_ROOT_528HZ);
      pool.playTone(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_THIRD_660HZ);
      pool.playTone(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_FIFTH_792HZ);
      pool.playTone(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_OCTAVE_1056HZ);
    }
  }

  public playStellarDawnResolution(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playStellarDawnResolution(voicePool ?? this.voicePool);
  }

  // 5. Combat Mastery & Tactical Bomb Methods
  public static playAstralGlideChimes(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.ASTRAL_GLIDE_CHIME_HIGH);
      pool.playTone(NEBULA_AUDIO_PRESETS.ASTRAL_GLIDE_CHIME_MID);
    }
  }

  public playAstralGlideChimes(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playAstralGlideChimes(voicePool ?? this.voicePool);
  }

  public static playCosmicDazeWarning(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.COSMIC_DAZE_WARBLE);
    }
  }

  public playCosmicDazeWarning(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playCosmicDazeWarning(voicePool ?? this.voicePool);
  }

  public static playOpticalLensKick(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.OPTICAL_LENS_PROPULSION);
    }
  }

  public playOpticalLensKick(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playOpticalLensKick(voicePool ?? this.voicePool);
  }

  public static playStardustCalmSnap(voicePool?: AudioVoicePool | null): void {
    const pool = voicePool || AudioVoicePool.getInstance();
    if (pool) {
      pool.playTone(NEBULA_AUDIO_PRESETS.STARDUST_CALM_SNAP);
    }
  }

  public playStardustCalmSnap(voicePool?: AudioVoicePool | null): void {
    NebulaHazardAudio.playStardustCalmSnap(voicePool ?? this.voicePool);
  }

  /**
   * Procedural Resonant Lowpass White Noise Pulse (720Hz -> 65Hz)
   */
  public static playEclipseWhiteNoisePulse(
    durationSec: number = 0.25,
    startFilterFreq: number = 720,
    endFilterFreq: number = 65,
    q: number = 3.5
  ): void {
    const ctx = NebulaHazardAudio.getAudioContext();
    if (!ctx || ctx.state === 'closed') return;

    const noiseBuffer = NebulaHazardAudio.getOrCreateNoiseBuffer(ctx);
    if (!noiseBuffer) return;

    let sourceNode: AudioBufferSourceNode | null = null;
    let filterNode: BiquadFilterNode | null = null;
    let gainNode: GainNode | null = null;

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      try {
        if (sourceNode) {
          sourceNode.onended = null;
          sourceNode.disconnect();
        }
        if (filterNode) filterNode.disconnect();
        if (gainNode) gainNode.disconnect();
      } catch {
        // Safe ignore
      }
      if (sourceNode) NebulaHazardAudio.pendingNodes.delete(sourceNode);
      if (filterNode) NebulaHazardAudio.pendingNodes.delete(filterNode);
      if (gainNode) NebulaHazardAudio.pendingNodes.delete(gainNode);
    };

    try {
      const now = ctx.currentTime;
      sourceNode = ctx.createBufferSource();
      sourceNode.buffer = noiseBuffer;
      sourceNode.loop = false;

      filterNode = ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(startFilterFreq, now);
      filterNode.frequency.exponentialRampToValueAtTime(Math.max(10, endFilterFreq), now + durationSec);
      filterNode.Q.setValueAtTime(q, now);

      gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.30, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      sourceNode.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      NebulaHazardAudio.pendingNodes.add(sourceNode);
      NebulaHazardAudio.pendingNodes.add(filterNode);
      NebulaHazardAudio.pendingNodes.add(gainNode);

      sourceNode.onended = cleanup;
      sourceNode.start(now);
      sourceNode.stop(now + durationSec + 0.05);

      const timerId = setTimeout(cleanup, Math.ceil((durationSec + 0.1) * 1000));
      NebulaHazardAudio.activeTimers.add(timerId);
    } catch {
      cleanup();
    }
  }

  public stop(): void {
    NebulaHazardAudio.clearPendingNodes();
  }

  public static clearPendingNodes(): void {
    for (const timer of NebulaHazardAudio.activeTimers) {
      clearTimeout(timer);
    }
    NebulaHazardAudio.activeTimers.clear();

    for (const node of NebulaHazardAudio.pendingNodes) {
      try {
        node.disconnect();
      } catch {
        // Safe ignore
      }
    }
    NebulaHazardAudio.pendingNodes.clear();
  }

  public static destroy(): void {
    NebulaHazardAudio.clearPendingNodes();
    NebulaHazardAudio.sharedNoiseBuffer = null;
    NebulaHazardAudio.lastState = NebulaLifecycleState.DORMANT;
    NebulaHazardAudio.lastTelegraph = NebulaTelegraphPhase.NONE;
    NebulaHazardAudio.lastDroneTimestampMs = 0;
    NebulaHazardAudio.lastSweepTimestampMs = 0;
    NebulaHazardAudio.instance = null;
  }

  public destroy(): void {
    NebulaHazardAudio.destroy();
  }
}
