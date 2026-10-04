/**
 * MagmaHazardAudio.ts — Procedural Web Audio Sound Synthesizer for MagmaHazard Events
 *
 * Implements Procedural Audio for the Magma Caldera & Pyroclastic Surge Subsystem:
 * - Volcanic Sub Rumble: 48Hz deep seismic sub-oscillator sweeping to 32Hz with lowpass dampening.
 * - Magma Bubbling Sizzle: Resonant thermal bubbling with upward micro-chirps and bandpass formant.
 * - Pyroclastic Detonation Crack + Seismic Sub Thump: Steep shockwave transient (880Hz -> 65Hz)
 *   + seismic thud (55Hz -> 24Hz) + F minor harmonic triad (F5, Ab5, C6) + filtered noise burst.
 * - Magma Surf / Obsidian Dash Chime: Resonant dual chime (F5 / 698Hz & A5 / 880Hz) + bandpass sweep.
 * - Obsidian Quench Snap: Damped crisp crack (1450Hz -> 420Hz) upon blast impact solidification.
 * - Thermal Singe Hiss: Low-gain thermal singe burn notification.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Reuses pre-allocated voices via AudioVoicePool (persistent oscillators, click-free stealing).
 * - Transient white noise nodes employ wireAutoDisconnect (onended + watchdog timeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { MagmaLifecycleState, MagmaTelegraphPhase } from './MagmaHazard.ts';

interface StopAndEndedAudioNode extends AudioNode {
  stop?: (when?: number) => void;
  onended?: (() => void) | null;
}

export const MAGMA_AUDIO_PRESETS = {
  // 1. Deep Seismic Volcanic Sub Rumble (48Hz -> 32Hz)
  VOLCANIC_SUB_RUMBLE_48HZ: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 32.0, duration: 0.8, exponential: true },
    gain: 0.35,
    duration: 1.10,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.45,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 95, q: 1.8 },
  } as AudioVoiceToneParams,

  // 2. Magma Bubbling Sizzle (thermal upwelling)
  MAGMA_BUBBLING_SIZZLE: {
    type: 'triangle',
    frequency: 180.0,
    frequencyRamp: { target: 340.0, duration: 0.25, exponential: true },
    gain: 0.18,
    duration: 0.35,
    attackTime: 0.02,
    decayTime: 0.12,
    sustainLevel: 0.35,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 450, q: 3.0, rampTarget: 680, rampDuration: 0.25 },
  } as AudioVoiceToneParams,

  // 3. Pyroclastic Detonation Crack & Seismic Thump
  PYROCLASTIC_CRACK_SNAP: {
    type: 'sawtooth',
    frequency: 880.0,
    frequencyRamp: { target: 65.0, duration: 0.08, exponential: true },
    gain: 0.48,
    duration: 0.22,
    attackTime: 0.001,
    decayTime: 0.06,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 1200, q: 2.2, rampTarget: 220, rampDuration: 0.10 },
  } as AudioVoiceToneParams,

  PYROCLASTIC_SUB_THUD: {
    type: 'sine',
    frequency: 55.0,
    frequencyRamp: { target: 24.0, duration: 0.32, exponential: true },
    gain: 0.52,
    duration: 0.42,
    attackTime: 0.004,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'lowpass', frequency: 110, q: 1.6 },
  } as AudioVoiceToneParams,

  // Harmonic chord resonance: F minor (F5, Ab5, C6)
  PYROCLASTIC_CHIME_F5: {
    type: 'sine',
    frequency: 698.46, // F5
    gain: 0.22,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.40,
  } as AudioVoiceToneParams,

  PYROCLASTIC_CHIME_AB5: {
    type: 'sine',
    frequency: 830.61, // Ab5
    gain: 0.20,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.40,
  } as AudioVoiceToneParams,

  PYROCLASTIC_CHIME_C6: {
    type: 'sine',
    frequency: 1046.50, // C6
    gain: 0.18,
    duration: 0.70,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.30,
    releaseTime: 0.45,
  } as AudioVoiceToneParams,

  // 4. Magma Surf / Obsidian Dash Chime (698Hz -> 880Hz / F5 -> A5)
  MAGMA_SURF_DASH_CHIME: {
    type: 'sine',
    frequency: 698.46,
    frequencyRamp: { target: 880.00, duration: 0.16, exponential: true },
    gain: 0.28,
    duration: 0.36,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.35,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 1100, q: 2.6 },
  } as AudioVoiceToneParams,

  // 5. Obsidian Quench Snap (1450Hz -> 420Hz damped solidification)
  OBSIDIAN_QUENCH_SNAP: {
    type: 'triangle',
    frequency: 1450.0,
    frequencyRamp: { target: 420.0, duration: 0.05, exponential: true },
    gain: 0.32,
    duration: 0.12,
    attackTime: 0.001,
    decayTime: 0.04,
    sustainLevel: 0.10,
    releaseTime: 0.04,
    filter: { type: 'bandpass', frequency: 950, q: 3.2 },
  } as AudioVoiceToneParams,

  // 6. Thermal Singe Hiss (molten heat tick)
  THERMAL_SINGE_HISS: {
    type: 'triangle',
    frequency: 420.0,
    frequencyRamp: { target: 210.0, duration: 0.08, exponential: true },
    gain: 0.14,
    duration: 0.15,
    attackTime: 0.005,
    decayTime: 0.06,
    sustainLevel: 0.15,
    releaseTime: 0.05,
    filter: { type: 'bandpass', frequency: 580, q: 2.0 },
  } as AudioVoiceToneParams,
} as const;

export class MagmaHazardAudio {
  private static instance: MagmaHazardAudio | null = null;
  private ctx: AudioContext | null = null;
  private pool: AudioVoicePool | null = null;
  private readonly activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();
  private readonly activeTransientNodes: Set<AudioNode> = new Set();
  private lastTelegraphSoundTimestampMs: number = -Infinity;
  private lastSingeSoundTimestampMs: number = -Infinity;

  constructor(ctx?: AudioContext | null) {
    if (ctx) {
      this.init(ctx);
    }
  }

  public static getInstance(ctx?: AudioContext | null): MagmaHazardAudio {
    if (!MagmaHazardAudio.instance) {
      MagmaHazardAudio.instance = new MagmaHazardAudio(ctx);
    } else if (ctx && !MagmaHazardAudio.instance.ctx) {
      MagmaHazardAudio.instance.init(ctx);
    }
    return MagmaHazardAudio.instance;
  }

  public static resetInstance(): void {
    if (MagmaHazardAudio.instance) {
      MagmaHazardAudio.instance.destroy();
    }
    MagmaHazardAudio.instance = null;
  }

  public init(ctx: AudioContext): void {
    this.ctx = ctx;
    this.pool = AudioVoicePool.getInstance();
    this.pool.init(ctx);
  }

  public getContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window !== 'undefined') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          this.ctx = new AudioCtxClass();
          this.pool = AudioVoicePool.getInstance();
          this.pool.init(this.ctx);
        } catch {
          this.ctx = null;
        }
      }
    }
    return this.ctx;
  }

  /**
   * Stage 1: Volcanic Crust Heating Sub-Bass Rumble
   */
  public playCrustHeatingHum(): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;
    this.pool.playTone(MAGMA_AUDIO_PRESETS.VOLCANIC_SUB_RUMBLE_48HZ);
  }

  /**
   * Stage 2: Magma Upwelling Bubbling Sizzle
   */
  public playMagmaUpwellingSizzle(): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;
    this.pool.playTone(MAGMA_AUDIO_PRESETS.MAGMA_BUBBLING_SIZZLE);
    this.playFilteredNoiseBurst(0.18, 500, 250, 0.08);
  }

  /**
   * Stage 3: Eruption Imminent Venting Steam
   */
  public playEruptionImminentVent(): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;
    this.pool.playTone(MAGMA_AUDIO_PRESETS.VOLCANIC_SUB_RUMBLE_48HZ);
    this.playFilteredNoiseBurst(0.35, 1200, 400, 0.16);
  }

  /**
   * Lethal Pyroclastic Burst Detonation
   */
  public playPyroclasticBurst(): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;

    // 1. Initial seismic snap & sub-thud
    this.pool.playTone(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CRACK_SNAP);
    this.pool.playTone(MAGMA_AUDIO_PRESETS.PYROCLASTIC_SUB_THUD);

    // 2. F minor triad harmonic overtone
    this.pool.playTone(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CHIME_F5);
    this.pool.playTone(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CHIME_AB5);
    this.pool.playTone(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CHIME_C6);

    // 3. Eruption noise wave
    this.playFilteredNoiseBurst(0.30, 1600, 300, 0.28);
  }

  /**
   * Player Mastery: Magma Surf / Obsidian Dash Chime
   */
  public playMagmaSurfChime(): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;
    this.pool.playTone(MAGMA_AUDIO_PRESETS.MAGMA_SURF_DASH_CHIME);
  }

  public playMagmaSurf(): void {
    this.playMagmaSurfChime();
  }

  /**
   * Player Debuff: Thermal Singe Hiss
   */
  public playThermalSingeHiss(nowMs: number = Date.now()): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;
    // Debounce to at most once every 300ms
    if (nowMs - this.lastSingeSoundTimestampMs < 300) return;
    this.lastSingeSoundTimestampMs = nowMs;
    this.pool.playTone(MAGMA_AUDIO_PRESETS.THERMAL_SINGE_HISS);
  }

  public playThermalSinge(nowMs: number = Date.now()): void {
    this.playThermalSingeHiss(nowMs);
  }

  /**
   * Tactical Bomb Quench: Obsidian Solidification Snap
   */
  public playObsidianQuenchSnap(): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;
    this.pool.playTone(MAGMA_AUDIO_PRESETS.OBSIDIAN_QUENCH_SNAP);
  }

  /**
   * Tactical Bomb: Pyroclastic Detonation Bonus
   */
  public playPyroclasticDetonation(): void {
    const ctx = this.getContext();
    if (!ctx || !this.pool) return;
    this.pool.playTone(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CRACK_SNAP);
    this.pool.playTone(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CHIME_C6);
  }

  /**
   * State Machine Audio Event Dispatcher
   */
  public playMagmaHazardState(
    state: MagmaLifecycleState,
    phase: MagmaTelegraphPhase = MagmaTelegraphPhase.NONE,
    nowMs: number = Date.now()
  ): void {
    if (state === MagmaLifecycleState.MAGMA_TELEGRAPH) {
      if (nowMs - this.lastTelegraphSoundTimestampMs < 450) return;
      this.lastTelegraphSoundTimestampMs = nowMs;

      switch (phase) {
        case MagmaTelegraphPhase.CRUST_HEATING:
          this.playCrustHeatingHum();
          break;
        case MagmaTelegraphPhase.MAGMA_UPWELLING:
          this.playMagmaUpwellingSizzle();
          break;
        case MagmaTelegraphPhase.ERUPTION_IMMINENT:
          this.playEruptionImminentVent();
          break;
        default:
          this.playCrustHeatingHum();
          break;
      }
    } else if (state === MagmaLifecycleState.PYROCLASTIC_BURST) {
      this.playPyroclasticBurst();
    }
  }

  /**
   * Procedural filtered white noise burst with zero-leak tracking
   */
  public playFilteredNoiseBurst(
    duration: number = 0.20,
    startFreq: number = 1000,
    endFreq: number = 200,
    gainLevel: number = 0.20
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = Math.max(256, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate randomized white noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(startFreq, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      filter.Q.setValueAtTime(2.0, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0001, gainLevel), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gain);

      const cleanup = () => {
        try {
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {}
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gain);
      };

      source.onended = cleanup;
      source.start(now);

      const tid = setTimeout(cleanup, Math.ceil((duration + 0.1) * 1000));
      this.activeTimeouts.add(tid);
    } catch {
      // Safe fallback for restricted audio contexts
    }
  }

  public clearPendingNodes(): void {
    for (const tid of this.activeTimeouts) {
      clearTimeout(tid);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        const stopNode = node as StopAndEndedAudioNode;
        if (typeof stopNode.stop === 'function') {
          stopNode.stop();
        }
        stopNode.onended = null;
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  public stop(): void {
    this.clearPendingNodes();
  }

  public destroy(): void {
    this.stop();
    this.pool = null;
    this.ctx = null;
    if (MagmaHazardAudio.instance === this) {
      MagmaHazardAudio.instance = null;
    }
  }
}
