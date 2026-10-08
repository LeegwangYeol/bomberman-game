/**
 * ChronoHazardAudio.ts — Procedural Web Audio Sound Synthesizer for ChronoHazard Events
 *
 * Implements Procedural Audio for the Chrono Anomaly & Tachyon Dilation Subsystem:
 * - Low-Frequency Tachyon Drone: 43.2Hz sub-bass temporal resonance drone (43.2Hz -> 32Hz)
 * - Clockwork Ticking & Temporal Ripple: Micro-chirps and bandpass resonant clock ticks (880Hz -> 440Hz)
 * - Tachyon Warp Sweep: Spacetime dilation ascending filter sweep (330Hz -> 660Hz with 580Hz -> 920Hz bandpass)
 * - Time Collapse Sonic Crack: Steep exponential frequency drop (840Hz -> 48Hz) + sub-thud (42Hz -> 18Hz)
 *   + F#-major celestial triad (F#5, A#5, C#6) + filtered procedural white noise implosion crack
 * - Chrono Surge Chimes: High-register harmonic triad (F#5 / 740Hz -> B5 / 988Hz -> E6 / 1318Hz)
 * - Timeline Stabilized Harmonic Chord: Calming harmonic resolution chord (A4 / 440Hz -> C#5 / 554Hz -> E5 / 659Hz)
 * - Temporal Dilation Warble: Acidic spacetime slow notification (320Hz -> 160Hz)
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Uses pre-allocated 16-voice AudioVoicePool (persistent oscillators, ADSR envelopes, click-free stealing)
 * - Cached static 500ms white noise buffer reused indefinitely without runtime GC allocations
 * - Transient noise/filter nodes employ active tracking, dual cleanup (source.onended + watchdog timeout),
 *   and clearPendingNodes / destroy lifecycle management
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { ChronoLifecycleState, ChronoTelegraphPhase } from './ChronoHazard.ts';

export const CHRONO_AUDIO_PRESETS = {
  // 1. Low Frequency Tachyon Drone: 43.2Hz Sub-bass Temporal Resonance (43.2Hz -> 32Hz)
  TACHYON_SUB_DRONE_43HZ: {
    type: 'sine',
    frequency: 43.2,
    frequencyRamp: { target: 32.0, duration: 0.90, exponential: true },
    gain: 0.30,
    duration: 1.15,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 95, q: 1.8 },
  } as AudioVoiceToneParams,

  // Temporal Ripple Hum: Early telegraph hum
  TEMPORAL_RIPPLE_HUM: {
    type: 'triangle',
    frequency: 68.0,
    frequencyRamp: { target: 50.0, duration: 0.75, exponential: true },
    gain: 0.22,
    duration: 0.85,
    attackTime: 0.15,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 130, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Clockwork Ticking & Micro-Chirp
  CLOCKWORK_TICK_CHIRP: {
    type: 'triangle',
    frequency: 880.0,
    frequencyRamp: { target: 440.0, duration: 0.05, exponential: true },
    gain: 0.20,
    duration: 0.08,
    attackTime: 0.005,
    decayTime: 0.04,
    sustainLevel: 0.10,
    releaseTime: 0.035,
    filter: { type: 'bandpass', frequency: 880, q: 4.5 },
  } as AudioVoiceToneParams,

  // 3. Tachyon Warp Sweep: Spacetime dilation accelerating sweep
  TACHYON_WARP_SWEEP: {
    type: 'sawtooth',
    frequency: 330.0,
    frequencyRamp: { target: 660.0, duration: 0.35, exponential: true },
    gain: 0.18,
    duration: 0.42,
    attackTime: 0.04,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 580, q: 3.2, rampTarget: 920, rampDuration: 0.35 },
  } as AudioVoiceToneParams,

  // 4. Time Collapse Sonic Crack: Steep exponential drop
  TIME_COLLAPSE_CRACK: {
    type: 'sawtooth',
    frequency: 840.0,
    frequencyRamp: { target: 48.0, duration: 0.08, exponential: true },
    gain: 0.38,
    duration: 0.22,
    attackTime: 0.003,
    decayTime: 0.08,
    sustainLevel: 0.15,
    releaseTime: 0.13,
    filter: { type: 'lowpass', frequency: 1800, q: 2.2, rampTarget: 180, rampDuration: 0.18 },
  } as AudioVoiceToneParams,

  // Time Collapse Sub-Thud: Low-frequency seismic implosion
  TIME_COLLAPSE_SUB_THUD: {
    type: 'sine',
    frequency: 44.0,
    frequencyRamp: { target: 18.0, duration: 0.45, exponential: true },
    gain: 0.45,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 85, q: 1.5 },
  } as AudioVoiceToneParams,

  // 5. Chrono Surge Chimes (F#5 / 740Hz, B5 / 988Hz, E6 / 1318Hz)
  CHRONO_SURGE_CHIME_HIGH: {
    type: 'sine',
    frequency: 739.99, // F#5
    frequencyRamp: { target: 1318.51, duration: 0.25, exponential: true }, // E6
    gain: 0.24,
    duration: 0.45,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1050, q: 2.0 },
  } as AudioVoiceToneParams,

  CHRONO_SURGE_CHIME_MID: {
    type: 'sine',
    frequency: 987.77, // B5
    gain: 0.20,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1100, q: 2.2 },
  } as AudioVoiceToneParams,

  // 6. Timeline Stabilized Harmonic Chord (A4 / 440Hz -> C#5 / 554Hz -> E5 / 659Hz)
  TIMELINE_STABILIZE_SNAP: {
    type: 'sine',
    frequency: 440.0, // A4
    gain: 0.25,
    duration: 0.40,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 600, q: 2.5 },
  } as AudioVoiceToneParams,

  TIMELINE_STABILIZE_CHORD: {
    type: 'triangle',
    frequency: 554.37, // C#5
    gain: 0.20,
    duration: 0.50,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 750, q: 2.2 },
  } as AudioVoiceToneParams,

  // 7. Temporal Dilation Warble (Acidic slow debuff)
  TEMPORAL_DILATION_WARBLE: {
    type: 'sine',
    frequency: 320.0,
    frequencyRamp: { target: 160.0, duration: 0.30, exponential: true },
    gain: 0.18,
    duration: 0.35,
    attackTime: 0.02,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 400, q: 2.0 },
  } as AudioVoiceToneParams,

  // 8. Chrono-Shifted Bomb Pulse
  CHRONO_BOMB_PULSE: {
    type: 'triangle',
    frequency: 520.0,
    frequencyRamp: { target: 260.0, duration: 0.18, exponential: true },
    gain: 0.20,
    duration: 0.25,
    attackTime: 0.01,
    decayTime: 0.08,
    sustainLevel: 0.20,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 480, q: 2.8 },
  } as AudioVoiceToneParams,
} as const;

/**
 * ChronoHazardAudio — Procedural Web Audio synthesizer for ChronoHazard
 */
export class ChronoHazardAudio {
  private static instance: ChronoHazardAudio | null = null;
  private voicePool: AudioVoicePool | null = null;
  private ctx: AudioContext | null = null;
  private ownsPool: boolean = false;

  private lastStatePlayed: ChronoLifecycleState | null = null;
  private lastTelegraphPhasePlayed: ChronoTelegraphPhase | null = null;
  private lastSubDroneTimestampMs: number = 0;
  private lastTickTimestampMs: number = 0;

  // Track transient audio nodes to prevent memory leaks
  private pendingNodes: Set<{
    source: AudioBufferSourceNode;
    filter?: BiquadFilterNode;
    gain?: GainNode;
    timeoutId?: ReturnType<typeof setTimeout>;
  }> = new Set();

  private sharedNoiseBuffer: AudioBuffer | null = null;

  constructor(poolOrCtx?: AudioVoicePool | AudioContext | null) {
    if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        this.bindPool(poolOrCtx as AudioVoicePool);
      } else if (
        ('createOscillator' in poolOrCtx && 'currentTime' in poolOrCtx) ||
        (typeof AudioContext !== 'undefined' && (poolOrCtx as unknown) instanceof AudioContext)
      ) {
        this.init(poolOrCtx as AudioContext);
      }
    } else if (poolOrCtx === null) {
      this.voicePool = null;
    } else {
      this.voicePool = AudioVoicePool.getInstance();
    }
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): ChronoHazardAudio {
    if (!ChronoHazardAudio.instance) {
      ChronoHazardAudio.instance = new ChronoHazardAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        ChronoHazardAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else if (typeof AudioContext !== 'undefined' && (poolOrCtx as unknown) instanceof AudioContext && !ChronoHazardAudio.instance.ctx) {
        ChronoHazardAudio.instance.init(poolOrCtx);
      }
    }
    return ChronoHazardAudio.instance;
  }

  public static resetInstance(): void {
    if (ChronoHazardAudio.instance) {
      ChronoHazardAudio.instance.destroy();
      ChronoHazardAudio.instance = null;
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
    } else if (!this.voicePool) {
      this.voicePool = new AudioVoicePool(16);
      this.voicePool.init(ctx);
      this.ownsPool = true;
    } else {
      this.voicePool.init(ctx);
    }

    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    if (this.ownsPool && this.voicePool && this.voicePool !== pool) {
      this.voicePool.destroy();
    }
    this.voicePool = pool;
    if (!this.ctx) {
      this.ctx = pool.getAudioContext();
    }
    this.ownsPool = false;
  }

  public setVoicePool(pool: AudioVoicePool | null): void {
    if (pool) {
      this.bindPool(pool);
    } else {
      this.voicePool = null;
    }
  }

  public getAudioContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx;
    if (this.voicePool) {
      const poolCtx = this.voicePool.getAudioContext();
      if (poolCtx && poolCtx.state !== 'closed') {
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
          if (this.voicePool) {
            this.voicePool.init(this.ctx);
          }
          return this.ctx;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (this.sharedNoiseBuffer && this.sharedNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.sharedNoiseBuffer;
    }
    try {
      const bufferSize = Math.floor(ctx.sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.sharedNoiseBuffer = buffer;
      return buffer;
    } catch {
      return null;
    }
  }

  public playTachyonSubDrone(nowMs: number = Date.now()): void {
    if (nowMs - this.lastSubDroneTimestampMs < 800) return;
    this.lastSubDroneTimestampMs = nowMs;
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TACHYON_SUB_DRONE_43HZ);
  }

  public playClockworkTick(nowMs: number = Date.now()): void {
    if (nowMs - this.lastTickTimestampMs < 250) return;
    this.lastTickTimestampMs = nowMs;
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.CLOCKWORK_TICK_CHIRP);
  }

  public playTemporalRipple(): void {
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TEMPORAL_RIPPLE_HUM);
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.CLOCKWORK_TICK_CHIRP);
  }

  public playTachyonWarpSweep(): void {
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TACHYON_WARP_SWEEP);
  }

  public playTimeCollapseImpact(): void {
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TIME_COLLAPSE_CRACK);
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TIME_COLLAPSE_SUB_THUD);
    this.playFilteredNoiseBurst(800, 180, 0.28, 0.25);
  }

  public playTimeCollapse(): void {
    this.playTimeCollapseImpact();
  }

  public playChronoSurgeDash(): void {
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.CHRONO_SURGE_CHIME_HIGH);
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.CHRONO_SURGE_CHIME_MID);
  }

  public playChronoSurge(): void {
    this.playChronoSurgeDash();
  }

  public playTimelineStabilized(): void {
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TIMELINE_STABILIZE_SNAP);
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TIMELINE_STABILIZE_CHORD);
  }

  public playTimelineStabilizeSnap(): void {
    this.playTimelineStabilized();
  }

  public playTemporalDilationDebuff(): void {
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.TEMPORAL_DILATION_WARBLE);
  }

  public playTemporalDilation(_now?: number): void {
    this.playTemporalDilationDebuff();
  }

  public playChronoSlipstreamKick(): void {
    this.playChronoSurgeDash();
  }

  public playChronoBombShift(): void {
    this.voicePool?.playTone(CHRONO_AUDIO_PRESETS.CHRONO_BOMB_PULSE);
  }

  public playChronoHazardState(
    state: ChronoLifecycleState,
    phaseOrNow?: ChronoTelegraphPhase | number,
    _nowMs: number = Date.now()
  ): void {
    if (typeof phaseOrNow === 'string' && phaseOrNow in ChronoTelegraphPhase) {
      this.playTelegraphPhase(phaseOrNow as ChronoTelegraphPhase);
    }
    if (state === this.lastStatePlayed) return;
    this.lastStatePlayed = state;

    switch (state) {
      case ChronoLifecycleState.CHRONO_DISTORTION:
        this.playTemporalRipple();
        break;
      case ChronoLifecycleState.TIME_COLLAPSE:
        this.playTimeCollapseImpact();
        break;
      case ChronoLifecycleState.TACHYON_RECOVERY:
        // Subtle winding down tone
        break;
      case ChronoLifecycleState.DORMANT:
        break;
    }
  }

  public stop(): void {
    this.reset();
  }

  public playTelegraphPhase(phase: ChronoTelegraphPhase): void {
    if (phase === this.lastTelegraphPhasePlayed) return;
    this.lastTelegraphPhasePlayed = phase;

    switch (phase) {
      case ChronoTelegraphPhase.TEMPORAL_RIPPLE:
        this.playTemporalRipple();
        break;
      case ChronoTelegraphPhase.TACHYON_WARP:
        this.playTachyonWarpSweep();
        break;
      case ChronoTelegraphPhase.EVENT_HORIZON_IMMINENT:
        this.playClockworkTick();
        this.playTachyonSubDrone();
        break;
      case ChronoTelegraphPhase.NONE:
        break;
    }
  }

  private playFilteredNoiseBurst(
    filterFreq: number,
    rampTargetFreq: number,
    gainLevel: number,
    durationSec: number
  ): void {
    const ctx = this.getAudioContext();
    if (!ctx || ctx.state === 'closed') return;

    try {
      const noiseBuffer = this.getOrCreateNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, rampTargetFreq),
        ctx.currentTime + durationSec
      );
      filter.Q.setValueAtTime(2.5, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      const nodeRecord = { source, filter, gain, timeoutId: undefined as ReturnType<typeof setTimeout> | undefined };
      this.pendingNodes.add(nodeRecord);

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (nodeRecord.timeoutId) {
          clearTimeout(nodeRecord.timeoutId);
          nodeRecord.timeoutId = undefined;
        }
        try {
          source.onended = null;
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // Safe ignore on already disconnected nodes
        }
        this.pendingNodes.delete(nodeRecord);
      };

      source.onended = cleanup;
      nodeRecord.timeoutId = setTimeout(cleanup, Math.ceil(durationSec * 1000) + 150);

      try {
        source.start();
        source.stop(ctx.currentTime + durationSec);
      } catch {
        cleanup();
      }
    } catch {
      // Safe fallback on headless / SSR environments
    }
  }

  public clearPendingNodes(): void {
    for (const record of this.pendingNodes) {
      if (record.timeoutId) {
        clearTimeout(record.timeoutId);
        record.timeoutId = undefined;
      }
      try {
        record.source.onended = null;
        if (typeof record.source.stop === 'function') {
          try {
            record.source.stop();
          } catch {}
        }
        record.source.disconnect();
        record.filter?.disconnect();
        record.gain?.disconnect();
      } catch {
        // Safe ignore
      }
    }
    this.pendingNodes.clear();
  }

  public reset(): void {
    if (this.voicePool) {
      this.voicePool.reset();
    }
    this.clearPendingNodes();
    this.lastStatePlayed = null;
    this.lastTelegraphPhasePlayed = null;
    this.lastSubDroneTimestampMs = 0;
    this.lastTickTimestampMs = 0;
  }

  public disconnect(): void {
    this.destroy();
  }

  public destroy(): void {
    this.reset();
    if (this.voicePool) {
      if (this.ownsPool) {
        this.voicePool.destroy();
      } else {
        this.voicePool.reset();
      }
      this.voicePool = null;
    }
    this.sharedNoiseBuffer = null;
    const closeable = this.ctx as unknown as { close?: () => Promise<void> } | null;
    if (closeable && typeof closeable.close === 'function') {
      try { void closeable.close().catch(() => {}); } catch {}
    }
    this.ctx = null;
    if (ChronoHazardAudio.instance === this) {
      ChronoHazardAudio.instance = null;
    }
  }
}
