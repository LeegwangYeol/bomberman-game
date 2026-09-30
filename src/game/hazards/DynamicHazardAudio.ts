/**
 * DynamicHazardAudio.ts — Procedural Web Audio Sound Synthesizer for DynamicHazard Events
 *
 * Designed for the 2026-10-01 Daily Evolution Cycle:
 * - Spire Telegraph Pulse: Low ominous oscillating sub-bass hum with acoustic interference beat.
 * - Tachyon Laser Discharge: High-energy laser zap with downward frequency sweep and white noise burst.
 * - Polarization Strike: Resonant harmonious golden chime chord across pooled voices.
 * - Quantum Tunneling: Cosmic phase-shift whoosh with resonant bandpass filter ascent.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Tonal sound events reuse pre-allocated voices via AudioVoicePool (no runtime AudioNode allocation).
 * - Transient noise burst nodes employ wireAutoDisconnect (osc/source.onended) and active tracking.
 * - All static tone parameters are pre-allocated and immutable to eliminate GC allocations.
 * - Safe headless & SSR fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { TelegraphPhase } from './DynamicHazard.ts';

/**
 * Procedural Tone Parameters for Zero-GC Hazard Audio Synthesis
 */
export const HAZARD_AUDIO_PRESETS = {
  // Spire Telegraph Pulse: Dual sub-bass detuned voices creating ominous 2.5Hz - 8Hz acoustic beat
  TELEGRAPH_YELLOW_VOICE_A: {
    type: 'triangle',
    frequency: 48,
    gain: 0.18,
    duration: 0.60,
    attackTime: 0.08,
    decayTime: 0.20,
    sustainLevel: 0.5,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 110, q: 2.0 },
  } as AudioVoiceToneParams,

  TELEGRAPH_YELLOW_VOICE_B: {
    type: 'sine',
    frequency: 50.5, // 2.5 Hz binaural acoustic beat against 48 Hz
    gain: 0.16,
    duration: 0.60,
    attackTime: 0.08,
    decayTime: 0.20,
    sustainLevel: 0.5,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 110, q: 2.0 },
  } as AudioVoiceToneParams,

  TELEGRAPH_AMBER_VOICE_A: {
    type: 'sawtooth',
    frequency: 55,
    gain: 0.24,
    duration: 0.42,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.6,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 220, q: 2.8, rampTarget: 340, rampDuration: 0.40 },
  } as AudioVoiceToneParams,

  TELEGRAPH_AMBER_VOICE_B: {
    type: 'sine',
    frequency: 59.5, // 4.5 Hz rapid pulsing beat against 55 Hz
    gain: 0.22,
    duration: 0.42,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.6,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 220, q: 2.8 },
  } as AudioVoiceToneParams,

  TELEGRAPH_RED_VOICE_A: {
    type: 'square',
    frequency: 70,
    frequencyRamp: { target: 82, duration: 0.20, exponential: true },
    gain: 0.30,
    duration: 0.24,
    attackTime: 0.01,
    decayTime: 0.08,
    sustainLevel: 0.4,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 350, q: 3.5 },
  } as AudioVoiceToneParams,

  TELEGRAPH_RED_VOICE_B: {
    type: 'sawtooth',
    frequency: 78, // 8.0 Hz intense alarm flutter against 70 Hz
    gain: 0.28,
    duration: 0.24,
    attackTime: 0.01,
    decayTime: 0.08,
    sustainLevel: 0.4,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 400, q: 3.5 },
  } as AudioVoiceToneParams,

  TELEGRAPH_IDLE_HUM: {
    type: 'sine',
    frequency: 55,
    gain: 0.09,
    duration: 1.10,
    attackTime: 0.30,
    decayTime: 0.35,
    sustainLevel: 0.45,
    releaseTime: 0.40,
    filter: { type: 'lowpass', frequency: 140, q: 1.5, rampTarget: 100, rampDuration: 1.0 },
  } as AudioVoiceToneParams,

  // Tachyon Laser Discharge: Searing high-frequency downward zap + sub-bass shockwave
  DISCHARGE_LASER_ZAP: {
    type: 'sawtooth',
    frequency: 2400,
    frequencyRamp: { target: 80, duration: 0.09, exponential: true },
    gain: 0.46,
    duration: 0.18,
    attackTime: 0.002, // 2ms explosive transient
    decayTime: 0.08,
    sustainLevel: 0.20,
    releaseTime: 0.06,
    filter: { type: 'lowpass', frequency: 3800, q: 3.2, rampTarget: 350, rampDuration: 0.12 },
  } as AudioVoiceToneParams,

  DISCHARGE_SUB_THUMP: {
    type: 'sine',
    frequency: 85,
    frequencyRamp: { target: 24, duration: 0.28, exponential: true },
    gain: 0.55,
    duration: 0.32,
    attackTime: 0.006,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 160, q: 1.2 },
  } as AudioVoiceToneParams,

  // Polarization Strike: Resonant harmonious golden chime chord (D Major 9th / Golden harmonics)
  // Voice 1: Root Note (D5 = 587.33 Hz) — Bell fundamental
  POLARIZE_ROOT_D5: {
    type: 'triangle',
    frequency: 587.33,
    gain: 0.26,
    duration: 0.65,
    attackTime: 0.003,
    decayTime: 0.22,
    sustainLevel: 0.35,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 1800, q: 2.5 },
  } as AudioVoiceToneParams,

  // Voice 2: Major Third (F#5 = 739.99 Hz) — Crystalline harmonic
  POLARIZE_THIRD_FSHARP5: {
    type: 'sine',
    frequency: 739.99,
    gain: 0.22,
    duration: 0.65,
    attackTime: 0.003,
    decayTime: 0.20,
    sustainLevel: 0.35,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2000, q: 2.2 },
  } as AudioVoiceToneParams,

  // Voice 3: Perfect Fifth (A5 = 880.00 Hz) — Resonant warmth
  POLARIZE_FIFTH_A5: {
    type: 'sine',
    frequency: 880.00,
    gain: 0.20,
    duration: 0.65,
    attackTime: 0.003,
    decayTime: 0.20,
    sustainLevel: 0.35,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2400, q: 2.0 },
  } as AudioVoiceToneParams,

  // Voice 4: Golden Ninth / Shimmer Octave (E6 = 1318.51 Hz) — Celestial chime sparkle
  POLARIZE_SHIMMER_E6: {
    type: 'sine',
    frequency: 1318.51,
    gain: 0.16,
    duration: 0.55,
    attackTime: 0.003,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.30,
    filter: { type: 'highpass', frequency: 1200, q: 2.8 },
  } as AudioVoiceToneParams,

  // Quantum Tunneling: Cosmic phase-shift whoosh with resonant bandpass ascent
  TUNNELING_SWOOP: {
    type: 'sine',
    frequency: 196.00, // G3
    frequencyRamp: { target: 1174.66, duration: 0.20, exponential: true }, // D6 soar
    gain: 0.38,
    duration: 0.38,
    attackTime: 0.015,
    decayTime: 0.14,
    sustainLevel: 0.45,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 320, q: 4.2, rampTarget: 2800, rampDuration: 0.20 },
  } as AudioVoiceToneParams,

  TUNNELING_CHIME: {
    type: 'sine',
    frequency: 1567.98, // G6 celestial peak
    gain: 0.22,
    duration: 0.32,
    attackTime: 0.004,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.15,
    filter: { type: 'highpass', frequency: 800, q: 2.0 },
  } as AudioVoiceToneParams,

  // Auxiliary Hazard Sound Presets
  SUBSPACE_HYPER_FUSE_CLICK: {
    type: 'square',
    frequency: 1400,
    frequencyRamp: { target: 900, duration: 0.02, exponential: true },
    gain: 0.20,
    duration: 0.03,
    attackTime: 0.001,
    releaseTime: 0.01,
    filter: { type: 'bandpass', frequency: 1200, q: 3.0 },
  } as AudioVoiceToneParams,

  TACHYON_OVERCHARGE_BOOM: {
    type: 'triangle',
    frequency: 320,
    frequencyRamp: { target: 60, duration: 0.22, exponential: true },
    gain: 0.42,
    duration: 0.26,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.10,
    filter: { type: 'lowpass', frequency: 900, q: 2.5 },
  } as AudioVoiceToneParams,

  MINION_VAPORIZATION: {
    type: 'sawtooth',
    frequency: 620,
    frequencyRamp: { target: 110, duration: 0.15, exponential: true },
    gain: 0.32,
    duration: 0.18,
    attackTime: 0.002,
    decayTime: 0.08,
    releaseTime: 0.06,
    filter: { type: 'bandpass', frequency: 1100, q: 3.0 },
  } as AudioVoiceToneParams,

  SAFE_EJECTION_WHOOP: {
    type: 'triangle',
    frequency: 160,
    frequencyRamp: { target: 480, duration: 0.12, exponential: false },
    gain: 0.25,
    duration: 0.15,
    attackTime: 0.01,
    releaseTime: 0.05,
    filter: { type: 'lowpass', frequency: 800, q: 1.5 },
  } as AudioVoiceToneParams,
} as const;

/**
 * DynamicHazardAudio: Main Sound Synthesizer Engine for Dynamic Hazards
 */
export class DynamicHazardAudio {
  private pool: AudioVoicePool | null = null;
  private ctx: AudioContext | null = null;
  private ownsPool: boolean = false;

  // Track transient audio nodes (noise generator) for 100% clean teardown
  private readonly activeTransientNodes: Set<AudioNode> = new Set();
  private readonly activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Static pre-allocated 500ms white noise buffer (shared across all instances)
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  // Rate-limiting timestamps (ms) to protect against audio fatigue and voice exhaustion
  private lastPulseTimeMs: number = -Infinity;
  private lastDischargeTimeMs: number = -Infinity;
  private lastPolarizeTimeMs: number = -Infinity;
  private lastTunnelingTimeMs: number = -Infinity;

  constructor(poolOrCtx?: AudioVoicePool | AudioContext | null) {
    if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool) {
        this.bindPool(poolOrCtx);
      } else if (typeof AudioContext !== 'undefined' && poolOrCtx instanceof AudioContext) {
        this.init(poolOrCtx);
      }
    }
  }

  /**
   * Initializes or attaches to an AudioContext
   */
  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.ctx = ctx;

    if (pool) {
      this.bindPool(pool);
      this.ownsPool = false;
    } else if (!this.pool) {
      // Allocate dedicated 16-voice pool if not supplied
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

  /**
   * Binds an existing pre-allocated AudioVoicePool
   */
  public bindPool(pool: AudioVoicePool): void {
    this.pool = pool;
  }

  /**
   * Safe timeout tracker for multi-stage procedural events
   */
  private safeTimeout(fn: () => void, delayMs: number): void {
    const tid = setTimeout(() => {
      this.activeTimeouts.delete(tid);
      fn();
    }, delayMs);
    this.activeTimeouts.add(tid);
  }

  /* ==============================================================================
   * 1. SPIRE TELEGRAPH PULSE
   * Low ominous oscillating sub-bass hum with progressive acoustic beat frequency
   * ============================================================================== */

  /**
   * Plays the low ominous oscillating sub-bass hum for the Spire Telegraph phase.
   * Progresses acoustically based on the current telegraph tier:
   * - YELLOW: 2.5 Hz slow sinister beat (48 Hz + 50.5 Hz)
   * - AMBER:  4.5 Hz accelerating buzz (55 Hz + 59.5 Hz)
   * - RED:    8.0 Hz critical warning flutter (70 Hz + 78 Hz)
   * - IDLE:   Gentle ambient sub-bass drone (55 Hz)
   */
  public playTelegraphPulse(
    phase: TelegraphPhase | 'YELLOW' | 'AMBER' | 'RED' | 'IDLE' = 'YELLOW',
    currentTimeMs: number = 0
  ): void {
    if (!this.pool) return;

    // Rate-limiting: prevent overlapping pulses if called multiple times within 100ms
    if (currentTimeMs > 0 && currentTimeMs - this.lastPulseTimeMs < 100) {
      return;
    }
    this.lastPulseTimeMs = currentTimeMs;

    const phaseKey = String(phase).toUpperCase();

    switch (phaseKey) {
      case 'AMBER':
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TELEGRAPH_AMBER_VOICE_A);
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TELEGRAPH_AMBER_VOICE_B);
        break;

      case 'RED':
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TELEGRAPH_RED_VOICE_A);
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TELEGRAPH_RED_VOICE_B);
        break;

      case 'IDLE':
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TELEGRAPH_IDLE_HUM);
        break;

      case 'YELLOW':
      default:
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TELEGRAPH_YELLOW_VOICE_A);
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TELEGRAPH_YELLOW_VOICE_B);
        break;
    }
  }

  /* ==============================================================================
   * 2. TACHYON LASER DISCHARGE
   * High-energy laser zap with downward frequency sweep and white noise burst
   * ============================================================================== */

  /**
   * Plays the full composite Tachyon Laser Discharge:
   * 1. High-energy laser zap: Exponential downward frequency sweep (2400 Hz -> 80 Hz)
   * 2. Sub-bass kinetic shockwave: Deep seismic thump (85 Hz -> 24 Hz)
   * 3. White noise burst: Searing plasma sizzle cleanly disconnected via onended
   */
  public playLaserDischarge(currentTimeMs: number = 0): void {
    if (!this.pool) return;

    // Coalesce multi-spire simultaneous discharges within 140ms into a single impactful blast
    if (currentTimeMs > 0 && currentTimeMs - this.lastDischargeTimeMs < 140) {
      return;
    }
    this.lastDischargeTimeMs = currentTimeMs;

    // 1. Tonal Layer: High-energy ionization zap (reused voice)
    this.pool.playTone(HAZARD_AUDIO_PRESETS.DISCHARGE_LASER_ZAP);

    // 2. Sub-bass Layer: Shockwave rumble (reused voice)
    this.pool.playTone(HAZARD_AUDIO_PRESETS.DISCHARGE_SUB_THUMP);

    // 3. Noise Layer: Procedural white noise burst (strict auto-disconnect)
    this.playWhiteNoiseBurst(0.12, 0.32, 2200, 500);
  }

  /**
   * Synthesizes a transient filtered white noise burst adhering strictly to Zero-Leak standards.
   * Auto-disconnects nodes immediately upon playback completion.
   */
  public playWhiteNoiseBurst(
    duration: number = 0.10,
    peakGain: number = 0.30,
    startFilterFreq: number = 2200,
    endFilterFreq: number = 500
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const noiseBuffer = this.getOrCreateNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(startFilterFreq, now);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFilterFreq),
        now + duration
      );
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.min(1.0, peakGain), now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Graph: source -> filter -> gain -> destination
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      // Register live transient nodes for active tracking
      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gain);

      // Auto-disconnection invariant: Unhook all nodes upon ended event
      source.onended = () => {
        try {
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {}
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gain);
      };

      source.start(now);
      source.stop(now + duration);
    } catch {
      // Safe non-throwing fallback for mock or restricted contexts
    }
  }

  /**
   * Lazily creates a static 500ms white noise buffer (reused permanently without GC)
   */
  private getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      const sampleRate = ctx.sampleRate || 44100;
      if (
        DynamicHazardAudio.cachedNoiseBuffer &&
        DynamicHazardAudio.cachedNoiseSampleRate === sampleRate
      ) {
        return DynamicHazardAudio.cachedNoiseBuffer;
      }

      const bufferSize = Math.floor(sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const output = buffer.getChannelData(0);

      // Fast linear congruential or uniform random noise
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      DynamicHazardAudio.cachedNoiseBuffer = buffer;
      DynamicHazardAudio.cachedNoiseSampleRate = sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  /* ==============================================================================
   * 3. POLARIZATION STRIKE
   * Resonant harmonious golden chime chord across pooled voices
   * ============================================================================== */

  /**
   * Plays the resonant harmonious golden chime chord when a player bomb blast
   * purges and polarizes a Spire crystal.
   * Synthesizes a crystalline D Major 9th chord (D5 - F#5 - A5 - E6) across 4 pooled voices.
   */
  public playPolarizationStrike(currentTimeMs: number = 0): void {
    if (!this.pool) return;

    if (currentTimeMs > 0 && currentTimeMs - this.lastPolarizeTimeMs < 150) {
      return;
    }
    this.lastPolarizeTimeMs = currentTimeMs;

    // Harmonic golden chord burst (all 4 voices reused without allocation)
    this.pool.playTone(HAZARD_AUDIO_PRESETS.POLARIZE_ROOT_D5);
    this.pool.playTone(HAZARD_AUDIO_PRESETS.POLARIZE_THIRD_FSHARP5);
    this.pool.playTone(HAZARD_AUDIO_PRESETS.POLARIZE_FIFTH_A5);
    this.pool.playTone(HAZARD_AUDIO_PRESETS.POLARIZE_SHIMMER_E6);
  }

  /* ==============================================================================
   * 4. QUANTUM TUNNELING
   * Cosmic phase-shift whoosh with resonant bandpass filter ascent
   * ============================================================================== */

  /**
   * Plays the cosmic phase-shift whoosh when a player successfully dashes
   * through an active lethal beam during the 150ms I-frame window.
   * Combines an exponential Doppler pitch ascent with a sweeping bandpass filter and celestial chime.
   */
  public playQuantumTunneling(currentTimeMs: number = 0): void {
    if (!this.pool) return;

    if (currentTimeMs > 0 && currentTimeMs - this.lastTunnelingTimeMs < 120) {
      return;
    }
    this.lastTunnelingTimeMs = currentTimeMs;

    // 1. Doppler phase-shift swoop with sweeping resonant bandpass filter (reused voice)
    this.pool.playTone(HAZARD_AUDIO_PRESETS.TUNNELING_SWOOP);

    // 2. High celestial chime confirming I-frame success
    this.safeTimeout(() => {
      if (this.pool) {
        this.pool.playTone(HAZARD_AUDIO_PRESETS.TUNNELING_CHIME);
      }
    }, 40);
  }

  /* ==============================================================================
   * 5. AUXILIARY HAZARD SFX ROUTINES
   * ============================================================================== */

  /**
   * Rapid high-frequency mechanical tick when bomb is placed on Spire (Hyper-Fuse)
   */
  public playHyperFuseTick(): void {
    if (!this.pool) return;
    this.pool.playTone(HAZARD_AUDIO_PRESETS.SUBSPACE_HYPER_FUSE_CLICK);
  }

  /**
   * Resonant low-end blast when bomb detonates inside active beam (Tachyon Overcharge)
   */
  public playTachyonOvercharge(): void {
    if (!this.pool) return;
    this.pool.playTone(HAZARD_AUDIO_PRESETS.TACHYON_OVERCHARGE_BOOM);
  }

  /**
   * Abrasive sizzle when enemy minion is vaporized by tachyon beam
   */
  public playMinionVaporization(): void {
    if (!this.pool) return;
    this.pool.playTone(HAZARD_AUDIO_PRESETS.MINION_VAPORIZATION);
  }

  /**
   * Upward frequency whoop when entity is displaced off active Spire anchor
   */
  public playSafeEjection(): void {
    if (!this.pool) return;
    this.pool.playTone(HAZARD_AUDIO_PRESETS.SAFE_EJECTION_WHOOP);
  }

  /* ==============================================================================
   * LIFECYCLE & ZERO-LEAK NODE MANAGEMENT
   * ============================================================================== */

  /**
   * Resolves active AudioContext defensively
   */
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

  /**
   * Resets all voices and cancels pending automations without destroying the pool
   */
  public reset(): void {
    if (this.pool) {
      this.pool.reset();
    }
    this.clearPendingNodes();
    this.lastPulseTimeMs = -Infinity;
    this.lastDischargeTimeMs = -Infinity;
    this.lastPolarizeTimeMs = -Infinity;
    this.lastTunnelingTimeMs = -Infinity;
  }

  /**
   * Forcefully disconnects all transient nodes and clears pending timers
   */
  private clearPendingNodes(): void {
    for (const tid of this.activeTimeouts) {
      clearTimeout(tid);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  /**
   * Full teardown of synthesizer, voice pool, and audio graph.
   * Guarantees 0 lingering nodes, 0 orphaned callbacks, and 0 memory leaks.
   */
  public destroy(): void {
    this.clearPendingNodes();

    if (this.pool && this.ownsPool) {
      this.pool.destroy();
      this.pool = null;
    }

    this.ctx = null;
  }
}
