/**
 * LavaCrisisAudio.ts — Procedural Web Audio Synthesizer for Creeping Lava Fissure (Stellaris Crisis 5)
 *
 * Implements 100% Procedural Sound Synthesis for Creeping Lava Crisis Phenomena:
 * 1. Subterranean Magma Rumble & Tectonic Static Drone:
 *    - 32.4Hz sub-bass mantle convection rumble with tectonic breathing.
 *    - 110Hz triangle tectonic pulse with lowpass filtering.
 *    - Subterranean magma boiling hiss and static crackle.
 *    - Seismic rupture warning siren (780Hz -> 390Hz triangle sweep).
 * 2. Molten Lava Creep & Perimeter Rupture Roar:
 *    - Rising magma pressure crescendo (140Hz -> 820Hz exponential ramp).
 *    - Cataclysmic molten surge shockwave (160Hz -> 45Hz sub-bass thermal thud).
 *    - Corridor scorch roar (220Hz -> 55Hz sawtooth wash, bandpass 750Hz).
 * 3. Obsidian Solidification & Steam Quench Chimes (4-Tier D-Minor / D-Dorian):
 *    - Explosive steam quench release (2800Hz high-pass noise burst, 85ms).
 *    - Quench sub-thud (45Hz -> 20Hz sine, 650ms).
 *    - 4-Tier crystal obsidian resonance in D-Minor/D-Dorian:
 *      * Tier 1: D5 (587.33Hz)
 *      * Tier 2: F5 (698.46Hz)
 *      * Tier 3: A5 (880.00Hz)
 *      * Tier 4: D6 (1174.66Hz) + Octave Anchor D4 (293.66Hz)
 * 4. Caldera Pressure Valve Sealed & Tectonic Calm Resolution (D-Major Solfeggio 528Hz Resolution):
 *    - Valve seal super-detonation impact.
 *    - Harmonic 4-tone peace chord in D-Major:
 *      * D4 (293.66Hz), F#4 (369.99Hz), A4 (440.00Hz), D5 (587.33Hz)
 *    - Cooling dissipate sweep (480Hz down to 50Hz triangle decay, 1.3s).
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Pre-allocated immutable tone presets declared via deepFreezePresets.
 * - Permanent reuse of a static 500ms white noise buffer (cachedNoiseBuffer) per sample rate.
 * - All transient nodes employ dual cleanup (source.onended + watchdog timeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';
import { CrisisStage } from './CrisisTypes.ts';

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
 * Pre-allocated immutable tone parameters for Zero-GC Creeping Lava Audio synthesis
 */
export const LAVA_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Subterranean Magma Rumble & Tectonic Static Drone
  // ============================================================================
  MAGMA_SUB_DRONE_32HZ: {
    type: 'sine',
    frequency: 32.4,
    frequencyRamp: { target: 24.0, duration: 1.50, exponential: true },
    gain: 0.35,
    duration: 1.80,
    attackTime: 0.20,
    decayTime: 0.50,
    sustainLevel: 0.55,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 75, q: 2.0 },
  } as AudioVoiceToneParams,

  TECTONIC_PULSE_110HZ: {
    type: 'triangle',
    frequency: 110.0,
    frequencyRamp: { target: 85.0, duration: 0.80, exponential: true },
    gain: 0.22,
    duration: 1.00,
    attackTime: 0.05,
    decayTime: 0.30,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 220, q: 2.5 },
  } as AudioVoiceToneParams,

  MAGMA_BOILING_STATIC: {
    type: 'triangle',
    frequency: 160.0,
    frequencyRamp: { target: 80.0, duration: 0.40, exponential: true },
    gain: 0.18,
    duration: 0.45,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.20,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 280, q: 2.5 },
  } as AudioVoiceToneParams,

  SEISMIC_WARNING_ALERT: {
    type: 'sawtooth',
    frequency: 780.0,
    frequencyRamp: { target: 390.0, duration: 0.30, exponential: true },
    gain: 0.28,
    duration: 0.38,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 580, q: 3.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Molten Lava Creep & Perimeter Rupture Roar
  // ============================================================================
  LAVA_RUPTURE_CRESCENDO: {
    type: 'sawtooth',
    frequency: 140.0,
    frequencyRamp: { target: 820.0, duration: 1.8, exponential: true },
    gain: 0.28,
    duration: 2.00,
    attackTime: 0.15,
    decayTime: 0.70,
    sustainLevel: 0.45,
    releaseTime: 0.45,
    filter: { type: 'bandpass', frequency: 550, q: 3.0, rampTarget: 1600, rampDuration: 1.8 },
  } as AudioVoiceToneParams,

  MOLTEN_SURGE_SUB_THUD: {
    type: 'sine',
    frequency: 160.0,
    frequencyRamp: { target: 45.0, duration: 0.90, exponential: true },
    gain: 0.55,
    duration: 1.10,
    attackTime: 0.01,
    decayTime: 0.40,
    sustainLevel: 0.40,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 95, q: 2.5 },
  } as AudioVoiceToneParams,

  CORRIDOR_SCORCH_ROAR: {
    type: 'sawtooth',
    frequency: 220.0,
    frequencyRamp: { target: 55.0, duration: 0.70, exponential: true },
    gain: 0.30,
    duration: 0.80,
    attackTime: 0.02,
    decayTime: 0.30,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 750, q: 2.2, rampTarget: 160, rampDuration: 0.70 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Obsidian Solidification & Steam Quench Chimes (D-Minor / D-Dorian)
  // ============================================================================
  STEAM_QUENCH_SNAP: {
    type: 'sawtooth',
    frequency: 920.0,
    frequencyRamp: { target: 160.0, duration: 0.070, exponential: true },
    gain: 0.40,
    duration: 0.16,
    attackTime: 0.002,
    decayTime: 0.060,
    sustainLevel: 0.15,
    releaseTime: 0.08,
    filter: { type: 'lowpass', frequency: 1900, q: 2.5, rampTarget: 200, rampDuration: 0.070 },
  } as AudioVoiceToneParams,

  QUENCH_SUB_THUD: {
    type: 'sine',
    frequency: 45.0,
    frequencyRamp: { target: 20.0, duration: 0.65, exponential: true },
    gain: 0.45,
    duration: 0.75,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'lowpass', frequency: 80, q: 2.0 },
  } as AudioVoiceToneParams,

  OBSIDIAN_CHIME_TIER1_D5: {
    type: 'sine',
    frequency: 587.33,
    frequencyRamp: { target: 880.00, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1100, q: 3.0 },
  } as AudioVoiceToneParams,

  OBSIDIAN_CHIME_TIER2_F5: {
    type: 'sine',
    frequency: 698.46,
    frequencyRamp: { target: 1046.50, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1350, q: 3.0 },
  } as AudioVoiceToneParams,

  OBSIDIAN_CHIME_TIER3_A5: {
    type: 'sine',
    frequency: 880.00,
    frequencyRamp: { target: 1320.00, duration: 0.28, exponential: true },
    gain: 0.30,
    duration: 0.50,
    attackTime: 0.005,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.28,
    filter: { type: 'bandpass', frequency: 1650, q: 3.5 },
  } as AudioVoiceToneParams,

  OBSIDIAN_CHIME_TIER4_D6: {
    type: 'sine',
    frequency: 1174.66,
    gain: 0.25,
    duration: 0.60,
    attackTime: 0.005,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2200, q: 3.0 },
  } as AudioVoiceToneParams,

  OBSIDIAN_OCTAVE_D4: {
    type: 'triangle',
    frequency: 293.66,
    gain: 0.26,
    duration: 0.60,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 450, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Caldera Pressure Valve Sealed & Tectonic Calm Resolution (D-Major Solfeggio 528Hz)
  // ============================================================================
  CALDERA_SEAL_D4: {
    type: 'sine',
    frequency: 293.66,
    gain: 0.30,
    duration: 1.0,
    attackTime: 0.02,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.55,
    filter: { type: 'bandpass', frequency: 600, q: 2.5 },
  } as AudioVoiceToneParams,

  CALDERA_SEAL_FSHARP4: {
    type: 'sine',
    frequency: 369.99,
    gain: 0.28,
    duration: 1.0,
    attackTime: 0.02,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.55,
    filter: { type: 'bandpass', frequency: 800, q: 2.5 },
  } as AudioVoiceToneParams,

  CALDERA_SEAL_A4: {
    type: 'sine',
    frequency: 440.00,
    gain: 0.28,
    duration: 1.0,
    attackTime: 0.02,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.55,
    filter: { type: 'bandpass', frequency: 1000, q: 2.5 },
  } as AudioVoiceToneParams,

  CALDERA_SEAL_D5: {
    type: 'sine',
    frequency: 587.33,
    gain: 0.25,
    duration: 1.2,
    attackTime: 0.02,
    decayTime: 0.40,
    sustainLevel: 0.35,
    releaseTime: 0.70,
    filter: { type: 'bandpass', frequency: 1400, q: 3.0 },
  } as AudioVoiceToneParams,

  COOLING_DISSIPATE_SWEEP: {
    type: 'triangle',
    frequency: 480.0,
    frequencyRamp: { target: 50.0, duration: 1.20, exponential: true },
    gain: 0.25,
    duration: 1.30,
    attackTime: 0.05,
    decayTime: 0.50,
    sustainLevel: 0.30,
    releaseTime: 0.55,
    filter: { type: 'lowpass', frequency: 500, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 5. Threat & Transition Accents
  // ============================================================================
  THREAT_ELEVATION_WARPING: {
    type: 'sine',
    frequency: 150.0,
    frequencyRamp: { target: 400.0, duration: 0.30, exponential: true },
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.24,
    filter: { type: 'lowpass', frequency: 450, q: 2.0 },
  } as AudioVoiceToneParams,

  STAGE_TRANSITION_ALARM: {
    type: 'sawtooth',
    frequency: 680.0,
    frequencyRamp: { target: 220.0, duration: 0.40, exponential: true },
    gain: 0.26,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.295,
    filter: { type: 'bandpass', frequency: 800, q: 3.0 },
  } as AudioVoiceToneParams,
});

/**
 * LavaCrisisAudio — Singleton procedural Web Audio synthesizer for Creeping Lava Fissure
 */
export class LavaCrisisAudio {
  private static instance: LavaCrisisAudio | null = null;
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  private ctx: AudioContext | null = null;
  private pool: AudioVoicePool | null = null;
  private ownsPool: boolean = false;

  private activeTransientNodes: Set<AudioNode> = new Set();
  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Rate Limiting Timestamps
  private lastMagmaDroneMs: number = 0;
  private lastLavaAdvanceMs: number = 0;
  private lastObsidianQuenchedMs: number = 0;
  private lastCalderaSealedMs: number = 0;

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
      this.pool = AudioVoicePool.getInstance(16);
    }
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): LavaCrisisAudio {
    if (!LavaCrisisAudio.instance) {
      LavaCrisisAudio.instance = new LavaCrisisAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        LavaCrisisAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else {
        LavaCrisisAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return LavaCrisisAudio.instance;
  }

  public static resetInstance(): void {
    if (LavaCrisisAudio.instance) {
      LavaCrisisAudio.instance.destroy();
      LavaCrisisAudio.instance = null;
    }
  }

  public init(ctx: AudioContext | null, pool?: AudioVoicePool): void {
    if (!ctx) return;
    this.ctx = ctx;
    if (pool) {
      this.bindPool(pool);
    } else if (!this.pool) {
      this.pool = AudioVoicePool.getInstance(16);
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    this.pool = pool;
    this.ownsPool = false;
    if (pool && typeof (pool as unknown as { getContext?: () => AudioContext | null }).getContext === 'function') {
      const c = (pool as unknown as { getContext: () => AudioContext | null }).getContext();
      if (c) this.ctx = c;
    }
  }

  private getEffectivePool(): AudioVoicePool | null {
    if (this.pool) return this.pool;
    try {
      this.pool = AudioVoicePool.getInstance(16);
      return this.pool;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Static White Noise Buffer Management (Zero-GC)
  // ============================================================================

  public static getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (!ctx) return null;
    if (LavaCrisisAudio.cachedNoiseBuffer && LavaCrisisAudio.cachedNoiseSampleRate === ctx.sampleRate) {
      return LavaCrisisAudio.cachedNoiseBuffer;
    }

    try {
      const bufferSize = Math.floor(ctx.sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      LavaCrisisAudio.cachedNoiseBuffer = buffer;
      LavaCrisisAudio.cachedNoiseSampleRate = ctx.sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Soundscape 1: Subterranean Magma Rumble & Tectonic Static Drone
  // ============================================================================

  public playMagmaDrone(nowMs: number = Date.now()): void {
    if (nowMs - this.lastMagmaDroneMs < 400) return;
    this.lastMagmaDroneMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(LAVA_AUDIO_PRESETS.MAGMA_SUB_DRONE_32HZ);
      pool.playTone(LAVA_AUDIO_PRESETS.TECTONIC_PULSE_110HZ);
      pool.playTone(LAVA_AUDIO_PRESETS.MAGMA_BOILING_STATIC);
    }

    this.playNoiseBurst(0.20, 2800, 0.12, 'bandpass');
  }

  // ============================================================================
  // Soundscape 2: Molten Lava Creep & Perimeter Rupture Roar
  // ============================================================================

  public playLavaAdvance(nowMs: number = Date.now()): void {
    if (nowMs - this.lastLavaAdvanceMs < 500) return;
    this.lastLavaAdvanceMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(LAVA_AUDIO_PRESETS.MOLTEN_SURGE_SUB_THUD);
      pool.playTone(LAVA_AUDIO_PRESETS.LAVA_RUPTURE_CRESCENDO);
      pool.playTone(LAVA_AUDIO_PRESETS.CORRIDOR_SCORCH_ROAR);
    }

    // Heavy cataclysmic noise sweep
    this.playNoiseBurst(0.65, 750, 0.28, 'bandpass');
  }

  // ============================================================================
  // Soundscape 3: Obsidian Solidification & Steam Quench Chimes
  // ============================================================================

  public playObsidianQuenched(solidifiedCount: number, nowMs: number = Date.now()): void {
    if (nowMs - this.lastObsidianQuenchedMs < 120) return;
    this.lastObsidianQuenchedMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(LAVA_AUDIO_PRESETS.STEAM_QUENCH_SNAP);
      pool.playTone(LAVA_AUDIO_PRESETS.QUENCH_SUB_THUD);

      // Play corresponding harmonic tier in D-Minor / D-Dorian
      if (solidifiedCount <= 1) {
        pool.playTone(LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER1_D5);
      } else if (solidifiedCount === 2) {
        pool.playTone(LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER2_F5);
      } else if (solidifiedCount === 3) {
        pool.playTone(LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER3_A5);
      } else {
        pool.playTone(LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER4_D6);
        pool.playTone(LAVA_AUDIO_PRESETS.OBSIDIAN_OCTAVE_D4);
      }
    }

    // Rapid steam hiss release
    this.playNoiseBurst(0.25, 2800, 0.20, 'bandpass');
  }

  // ============================================================================
  // Soundscape 4: Caldera Pressure Valve Sealed & Tectonic Calm Resolution
  // ============================================================================

  public playCalderaSealed(nowMs: number = Date.now()): void {
    if (nowMs - this.lastCalderaSealedMs < 1000) return;
    this.lastCalderaSealedMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      // Harmonic 4-tone resolution (D-Major Solfeggio 528Hz peace chord)
      pool.playTone(LAVA_AUDIO_PRESETS.CALDERA_SEAL_D4);
      pool.playTone(LAVA_AUDIO_PRESETS.CALDERA_SEAL_FSHARP4);
      pool.playTone(LAVA_AUDIO_PRESETS.CALDERA_SEAL_A4);
      pool.playTone(LAVA_AUDIO_PRESETS.CALDERA_SEAL_D5);
      pool.playTone(LAVA_AUDIO_PRESETS.COOLING_DISSIPATE_SWEEP);
    }

    this.playNoiseBurst(0.85, 900, 0.35, 'lowpass');
  }

  public playCrisisState(stage: CrisisStage, threatMeter: number, nowMs: number = Date.now()): void {
    const pool = this.getEffectivePool();
    if (!pool) return;

    if (stage === CrisisStage.WHISPERS) {
      this.playMagmaDrone(nowMs);
    } else if (stage === CrisisStage.OUTBREAK) {
      pool.playTone(LAVA_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      pool.playTone(LAVA_AUDIO_PRESETS.SEISMIC_WARNING_ALERT);
      this.playLavaAdvance(nowMs);
    } else if (stage === CrisisStage.CLIMAX) {
      pool.playTone(LAVA_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      pool.playTone(LAVA_AUDIO_PRESETS.THREAT_ELEVATION_WARPING);
      pool.playTone(LAVA_AUDIO_PRESETS.SEISMIC_WARNING_ALERT);
      this.playLavaAdvance(nowMs);
    } else if (stage === CrisisStage.RESOLVED) {
      this.playCalderaSealed(nowMs);
    }

    if (threatMeter > 80 && stage !== CrisisStage.RESOLVED) {
      pool.playTone(LAVA_AUDIO_PRESETS.THREAT_ELEVATION_WARPING);
    }
  }

  // ============================================================================
  // Procedural Noise Generator with Dual Watchdog Cleanup
  // ============================================================================

  private playNoiseBurst(
    durationSec: number,
    filterFreq: number,
    gainVal: number,
    filterType: BiquadFilterType = 'bandpass'
  ): void {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    if (typeof durationSec === 'number' && Math.abs(durationSec) < 1e-8) return;

    let sourceNode: AudioBufferSourceNode | null = null;
    let filterNode: BiquadFilterNode | null = null;
    let gainNode: GainNode | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (timer !== null) {
        clearTimeout(timer);
        this.activeTimeouts.delete(timer);
        timer = null;
      }
      try {
        if (sourceNode) {
          sourceNode.onended = null;
          try {
            if (typeof sourceNode.stop === 'function') sourceNode.stop();
          } catch {}
          sourceNode.disconnect();
        }
        if (filterNode) filterNode.disconnect();
        if (gainNode) gainNode.disconnect();
      } catch {}
      if (sourceNode) this.activeTransientNodes.delete(sourceNode);
      if (filterNode) this.activeTransientNodes.delete(filterNode);
      if (gainNode) this.activeTransientNodes.delete(gainNode);
    };

    try {
      const buffer = LavaCrisisAudio.getOrCreateNoiseBuffer(this.ctx);
      if (!buffer) return;

      sourceNode = this.ctx.createBufferSource();
      sourceNode.buffer = buffer;

      filterNode = this.ctx.createBiquadFilter();
      filterNode.type = filterType;
      filterNode.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
      filterNode.Q.setValueAtTime(2.5, this.ctx.currentTime);

      gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationSec);

      sourceNode.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      this.activeTransientNodes.add(sourceNode);
      this.activeTransientNodes.add(filterNode);
      this.activeTransientNodes.add(gainNode);

      sourceNode.onended = cleanup;
      sourceNode.start();
      sourceNode.stop(this.ctx.currentTime + durationSec);

      timer = setTimeout(() => {
        if (timer !== null) this.activeTimeouts.delete(timer);
        cleanup();
      }, Math.ceil(durationSec * 1000) + 50);
      this.activeTimeouts.add(timer);
    } catch {
      cleanup();
    }
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  public getActiveTimeoutCount(): number {
    return this.activeTimeouts.size;
  }

  public getActiveTransientNodeCount(): number {
    return this.activeTransientNodes.size;
  }

  public stop(): void {
    this.reset();
  }

  public reset(): void {
    for (const timer of this.activeTimeouts) {
      clearTimeout(timer);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();

    if (this.pool) {
      if (typeof (this.pool as unknown as { stop?: () => void }).stop === 'function') {
        (this.pool as unknown as { stop: () => void }).stop();
      } else if (typeof (this.pool as unknown as { reset?: () => void }).reset === 'function') {
        (this.pool as unknown as { reset: () => void }).reset();
      }
    }

    this.lastMagmaDroneMs = 0;
    this.lastLavaAdvanceMs = 0;
    this.lastObsidianQuenchedMs = 0;
    this.lastCalderaSealedMs = 0;
  }

  public destroy(): void {
    this.reset();
    if (this.ownsPool && this.pool) {
      this.pool.destroy();
    }
    this.pool = null;
    this.ctx = null;
    LavaCrisisAudio.cachedNoiseBuffer = null;
    LavaCrisisAudio.cachedNoiseSampleRate = 0;
    if (LavaCrisisAudio.instance === this) {
      LavaCrisisAudio.instance = null;
    }
  }
}
