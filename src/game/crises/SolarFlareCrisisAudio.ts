/**
 * SolarFlareCrisisAudio.ts — Procedural Web Audio Synthesizer for Solar Flare Storm (Stellaris Crisis 4)
 *
 * Implements 100% Procedural Sound Synthesis for Solar Flare Crisis Phenomena:
 * 1. Solar Wind & Geomagnetic Static Drone:
 *    - 38.4Hz sub-bass coronal convection drone with geomagnetic breathing.
 *    - High-magnetic static crackle and solar wind hiss.
 *    - Whispering solar wind harmonic sweep (432Hz -> 528Hz Solfeggio Golden Sol frequency).
 *    - Coronal warning alert siren (880Hz -> 440Hz triangle sweep).
 * 2. Coronal Mass Ejection (CME) Supersonic Sweep:
 *    - 3-second buildup crescendo hiss & rising coronal charge (180Hz -> 960Hz exponential ramp).
 *    - Cataclysmic CME coronal sweep rush (700ms sweeping noise + 120Hz -> 30Hz sub-bass thermal shockwave).
 *    - Radiant corridor scorch roar (240Hz -> 60Hz sawtooth wash, bandpass 800Hz).
 * 3. Tactical Bomb Flash-Ignition & Thermal Vent Purging:
 *    - Instant flash-ignition detonation snap (950Hz -> 180Hz sawtooth spike, 65ms).
 *    - 4-Tier cryogenic venting resonance in F-Major (F5 698Hz, A5 880Hz, C6 1046Hz, F6 1397Hz + F4 349Hz).
 *    - Thermal coolant vent pressure release (40Hz sub-bass + filtered noise burst).
 * 4. Helios Solar Core Stabilization:
 *    - Super-flare neutralization chord (A-Major / Solfeggio 528Hz resolution: A4 440Hz, C#5 554Hz, E5 659Hz, A5 880Hz).
 *    - Coronal tempest dissipate sweep (520Hz down to 60Hz gentle triangle decay, 1.2s).
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
 * Pre-allocated immutable tone parameters for Zero-GC Solar Flare Audio synthesis
 */
export const SOLAR_FLARE_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Solar Wind & Geomagnetic Static Drone
  // ============================================================================
  CORONAL_SUB_DRONE_38HZ: {
    type: 'sine',
    frequency: 38.4,
    frequencyRamp: { target: 28.0, duration: 1.20, exponential: true },
    gain: 0.32,
    duration: 1.50,
    attackTime: 0.20,
    decayTime: 0.45,
    sustainLevel: 0.55,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 80, q: 2.0 },
  } as AudioVoiceToneParams,

  SOLAR_WIND_GOLDEN_SOL_528HZ: {
    type: 'sine',
    frequency: 432.0,
    frequencyRamp: { target: 528.0, duration: 0.45, exponential: true },
    gain: 0.20,
    duration: 0.55,
    attackTime: 0.04,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 528, q: 3.5 },
  } as AudioVoiceToneParams,

  GEOMAGNETIC_STATIC_WARBLE: {
    type: 'triangle',
    frequency: 180.0,
    frequencyRamp: { target: 95.0, duration: 0.35, exponential: true },
    gain: 0.18,
    duration: 0.40,
    attackTime: 0.02,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 320, q: 2.5 },
  } as AudioVoiceToneParams,

  CORONAL_WARNING_ALERT: {
    type: 'sawtooth',
    frequency: 880.0,
    frequencyRamp: { target: 440.0, duration: 0.30, exponential: true },
    gain: 0.28,
    duration: 0.38,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 660, q: 3.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Coronal Mass Ejection (CME) Supersonic Sweep
  // ============================================================================
  CME_BUILDUP_CRESCENDO: {
    type: 'sawtooth',
    frequency: 180.0,
    frequencyRamp: { target: 960.0, duration: 2.0, exponential: true },
    gain: 0.28,
    duration: 2.20,
    attackTime: 0.15,
    decayTime: 0.80,
    sustainLevel: 0.45,
    releaseTime: 0.45,
    filter: { type: 'bandpass', frequency: 600, q: 3.2, rampTarget: 1800, rampDuration: 2.0 },
  } as AudioVoiceToneParams,

  CME_SWEEP_THERMAL_SUB: {
    type: 'sine',
    frequency: 120.0,
    frequencyRamp: { target: 30.0, duration: 0.80, exponential: true },
    gain: 0.55,
    duration: 0.95,
    attackTime: 0.01,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 95, q: 2.5 },
  } as AudioVoiceToneParams,

  CORRIDOR_SCORCH_ROAR: {
    type: 'sawtooth',
    frequency: 240.0,
    frequencyRamp: { target: 60.0, duration: 0.65, exponential: true },
    gain: 0.32,
    duration: 0.75,
    attackTime: 0.02,
    decayTime: 0.28,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 800, q: 2.2, rampTarget: 180, rampDuration: 0.65 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Tactical Bomb Flash-Ignition & Thermal Vent Purging
  // ============================================================================
  FLASH_IGNITION_DETONATION: {
    type: 'sawtooth',
    frequency: 950.0,
    frequencyRamp: { target: 180.0, duration: 0.065, exponential: true },
    gain: 0.42,
    duration: 0.15,
    attackTime: 0.002,
    decayTime: 0.055,
    sustainLevel: 0.15,
    releaseTime: 0.08,
    filter: { type: 'lowpass', frequency: 1800, q: 2.5, rampTarget: 220, rampDuration: 0.065 },
  } as AudioVoiceToneParams,

  VENT_PURGE_SUB_THUD: {
    type: 'sine',
    frequency: 40.0,
    frequencyRamp: { target: 18.0, duration: 0.60, exponential: true },
    gain: 0.45,
    duration: 0.70,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 75, q: 2.0 },
  } as AudioVoiceToneParams,

  // 4-Tier Cryogenic Venting Chimes (F-Major Harmonization)
  VENT_CHIME_TIER1_F5: {
    type: 'sine',
    frequency: 698.46,
    frequencyRamp: { target: 1046.50, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1200, q: 3.0 },
  } as AudioVoiceToneParams,

  VENT_CHIME_TIER2_A5: {
    type: 'sine',
    frequency: 880.00,
    frequencyRamp: { target: 1320.00, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1450, q: 3.0 },
  } as AudioVoiceToneParams,

  VENT_CHIME_TIER3_C6: {
    type: 'sine',
    frequency: 1046.50,
    frequencyRamp: { target: 1567.98, duration: 0.28, exponential: true },
    gain: 0.30,
    duration: 0.50,
    attackTime: 0.005,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.28,
    filter: { type: 'bandpass', frequency: 1800, q: 3.5 },
  } as AudioVoiceToneParams,

  VENT_CHIME_TIER4_F6: {
    type: 'sine',
    frequency: 1396.91,
    gain: 0.25,
    duration: 0.60,
    attackTime: 0.005,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2400, q: 3.0 },
  } as AudioVoiceToneParams,

  VENT_CHIME_OCTAVE_F4: {
    type: 'triangle',
    frequency: 349.23,
    gain: 0.24,
    duration: 0.60,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 500, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Helios Solar Core Stabilization (Solfeggio 528Hz / A-Major Resolution)
  // ============================================================================
  HELIOS_STABILIZE_A4: {
    type: 'sine',
    frequency: 440.0,
    gain: 0.30,
    duration: 1.0,
    attackTime: 0.02,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.55,
    filter: { type: 'bandpass', frequency: 800, q: 2.5 },
  } as AudioVoiceToneParams,

  HELIOS_STABILIZE_CSHARP5: {
    type: 'sine',
    frequency: 554.37,
    gain: 0.28,
    duration: 1.0,
    attackTime: 0.02,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.55,
    filter: { type: 'bandpass', frequency: 1000, q: 2.5 },
  } as AudioVoiceToneParams,

  HELIOS_STABILIZE_E5: {
    type: 'sine',
    frequency: 659.25,
    gain: 0.26,
    duration: 1.0,
    attackTime: 0.02,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.55,
    filter: { type: 'bandpass', frequency: 1200, q: 2.5 },
  } as AudioVoiceToneParams,

  HELIOS_STABILIZE_A5: {
    type: 'sine',
    frequency: 880.0,
    gain: 0.24,
    duration: 1.2,
    attackTime: 0.02,
    decayTime: 0.40,
    sustainLevel: 0.35,
    releaseTime: 0.70,
    filter: { type: 'bandpass', frequency: 1600, q: 3.0 },
  } as AudioVoiceToneParams,

  CORONAL_TEMPEST_DISSIPATE: {
    type: 'triangle',
    frequency: 520.0,
    frequencyRamp: { target: 60.0, duration: 1.10, exponential: true },
    gain: 0.25,
    duration: 1.20,
    attackTime: 0.05,
    decayTime: 0.50,
    sustainLevel: 0.30,
    releaseTime: 0.55,
    filter: { type: 'lowpass', frequency: 450, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 5. Threat & Transition Accents
  // ============================================================================
  THREAT_ELEVATION_WARPING: {
    type: 'sine',
    frequency: 160.0,
    frequencyRamp: { target: 420.0, duration: 0.30, exponential: true },
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.24,
    filter: { type: 'lowpass', frequency: 480, q: 2.0 },
  } as AudioVoiceToneParams,

  STAGE_TRANSITION_ALARM: {
    type: 'sawtooth',
    frequency: 720.0,
    frequencyRamp: { target: 240.0, duration: 0.40, exponential: true },
    gain: 0.26,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.20,
    releaseTime: 0.295,
    filter: { type: 'bandpass', frequency: 850, q: 3.0 },
  } as AudioVoiceToneParams,
});

/**
 * SolarFlareCrisisAudio — Singleton procedural Web Audio synthesizer for Solar Flare Storm
 */
export class SolarFlareCrisisAudio {
  private static instance: SolarFlareCrisisAudio | null = null;
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  private ctx: AudioContext | null = null;
  private pool: AudioVoicePool | null = null;
  private ownsPool: boolean = false;

  private activeTransientNodes: Set<AudioNode> = new Set();
  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Rate Limiting Timestamps
  private lastSolarWindDroneMs: number = 0;
  private lastCmeWarningMs: number = 0;
  private lastCmeSweepMs: number = 0;
  private lastFlashIgnitionMs: number = 0;
  private lastVentPurgedMs: number = 0;
  private lastHeliosStabilizationMs: number = 0;

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

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): SolarFlareCrisisAudio {
    if (!SolarFlareCrisisAudio.instance) {
      SolarFlareCrisisAudio.instance = new SolarFlareCrisisAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        SolarFlareCrisisAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else {
        SolarFlareCrisisAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return SolarFlareCrisisAudio.instance;
  }

  public static resetInstance(): void {
    if (SolarFlareCrisisAudio.instance) {
      SolarFlareCrisisAudio.instance.destroy();
      SolarFlareCrisisAudio.instance = null;
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
    if (SolarFlareCrisisAudio.cachedNoiseBuffer && SolarFlareCrisisAudio.cachedNoiseSampleRate === ctx.sampleRate) {
      return SolarFlareCrisisAudio.cachedNoiseBuffer;
    }

    try {
      const bufferSize = Math.floor(ctx.sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      SolarFlareCrisisAudio.cachedNoiseBuffer = buffer;
      SolarFlareCrisisAudio.cachedNoiseSampleRate = ctx.sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Soundscape 1: Solar Wind & Geomagnetic Static Drone
  // ============================================================================

  public playSolarWindDrone(nowMs: number = Date.now()): void {
    if (nowMs - this.lastSolarWindDroneMs < 400) return;
    this.lastSolarWindDroneMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.CORONAL_SUB_DRONE_38HZ);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.SOLAR_WIND_GOLDEN_SOL_528HZ);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.GEOMAGNETIC_STATIC_WARBLE);
    }

    this.playNoiseBurst(0.20, 3200, 0.12);
  }

  public playCmeWarning(nowMs: number = Date.now()): void {
    if (nowMs - this.lastCmeWarningMs < 500) return;
    this.lastCmeWarningMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.CORONAL_WARNING_ALERT);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.CME_BUILDUP_CRESCENDO);
    }

    this.playNoiseBurst(0.35, 1400, 0.15);
  }

  // ============================================================================
  // Soundscape 2: Coronal Mass Ejection (CME) Supersonic Sweep
  // ============================================================================

  public playCmeSweep(nowMs: number = Date.now()): void {
    if (nowMs - this.lastCmeSweepMs < 600) return;
    this.lastCmeSweepMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.CME_SWEEP_THERMAL_SUB);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.CORRIDOR_SCORCH_ROAR);
    }

    // Heavy cataclysmic noise sweep
    this.playNoiseBurst(0.70, 800, 0.28);
  }

  // ============================================================================
  // Soundscape 3: Tactical Bomb Flash-Ignition & Thermal Vent Purging
  // ============================================================================

  public playFlashIgnition(nowMs: number = Date.now()): void {
    if (nowMs - this.lastFlashIgnitionMs < 100) return;
    this.lastFlashIgnitionMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.FLASH_IGNITION_DETONATION);
    }

    this.playNoiseBurst(0.12, 4500, 0.18);
  }

  public playThermalVentPurged(cooledCount: number, nowMs: number = Date.now()): void {
    if (nowMs - this.lastVentPurgedMs < 200) return;
    this.lastVentPurgedMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.VENT_PURGE_SUB_THUD);

      // Play corresponding harmonic tier in F-Major
      if (cooledCount <= 1) {
        pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER1_F5);
      } else if (cooledCount === 2) {
        pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER2_A5);
      } else if (cooledCount === 3) {
        pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER3_C6);
      } else {
        pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER4_F6);
        pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_OCTAVE_F4);
      }
    }

    this.playNoiseBurst(0.25, 2200, 0.15);
  }

  // ============================================================================
  // Soundscape 4: Helios Solar Core Stabilization & Stage Progression
  // ============================================================================

  public playHeliosStabilization(nowMs: number = Date.now()): void {
    if (nowMs - this.lastHeliosStabilizationMs < 1000) return;
    this.lastHeliosStabilizationMs = nowMs;

    const pool = this.getEffectivePool();
    if (pool) {
      // Harmonic 4-tone resolution (A-Major Solfeggio 528Hz)
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_A4);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_CSHARP5);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_E5);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_A5);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.CORONAL_TEMPEST_DISSIPATE);
    }
  }

  public playCrisisState(stage: CrisisStage, threatMeter: number, nowMs: number = Date.now()): void {
    const pool = this.getEffectivePool();
    if (!pool) return;

    if (stage === CrisisStage.WHISPERS) {
      this.playSolarWindDrone(nowMs);
    } else if (stage === CrisisStage.OUTBREAK) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      this.playCmeWarning(nowMs);
    } else if (stage === CrisisStage.CLIMAX) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.THREAT_ELEVATION_WARPING);
      this.playCmeSweep(nowMs);
    } else if (stage === CrisisStage.RESOLVED) {
      this.playHeliosStabilization(nowMs);
    }

    if (threatMeter > 80 && stage !== CrisisStage.RESOLVED) {
      pool.playTone(SOLAR_FLARE_AUDIO_PRESETS.THREAT_ELEVATION_WARPING);
    }
  }

  // ============================================================================
  // Procedural Noise Generator with Dual Watchdog Cleanup
  // ============================================================================

  private playNoiseBurst(durationSec: number, filterFreq: number, gainVal: number): void {
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
      const buffer = SolarFlareCrisisAudio.getOrCreateNoiseBuffer(this.ctx);
      if (!buffer) return;

      sourceNode = this.ctx.createBufferSource();
      sourceNode.buffer = buffer;

      filterNode = this.ctx.createBiquadFilter();
      filterNode.type = 'bandpass';
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

  public clearPendingNodes(): void {
    for (const timer of this.activeTimeouts) {
      clearTimeout(timer);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        if ('onended' in (node as unknown as { onended?: unknown })) {
          (node as unknown as { onended?: unknown }).onended = null;
        }
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  public playFilteredNoiseBurst(
    duration: number = 0.20,
    startFilterFreq: number = 1800,
    _endFilterFreq?: number,
    peakGain?: number
  ): void {
    this.playNoiseBurst(duration, startFilterFreq, peakGain ?? 0.20);
  }

  public stop(): void {
    this.reset();
  }

  public reset(): void {
    this.clearPendingNodes();

    if (this.pool) {
      if (typeof (this.pool as unknown as { stop?: () => void }).stop === 'function') {
        (this.pool as unknown as { stop: () => void }).stop();
      } else if (typeof (this.pool as unknown as { reset?: () => void }).reset === 'function') {
        (this.pool as unknown as { reset: () => void }).reset();
      }
    }

    this.lastSolarWindDroneMs = 0;
    this.lastCmeWarningMs = 0;
    this.lastCmeSweepMs = 0;
    this.lastFlashIgnitionMs = 0;
    this.lastVentPurgedMs = 0;
    this.lastHeliosStabilizationMs = 0;
  }

  public destroy(): void {
    this.reset();
    if (this.ownsPool && this.pool) {
      this.pool.destroy();
    }
    this.pool = null;
    this.ctx = null;
    SolarFlareCrisisAudio.cachedNoiseBuffer = null;
    SolarFlareCrisisAudio.cachedNoiseSampleRate = 0;
    if (SolarFlareCrisisAudio.instance === this) {
      SolarFlareCrisisAudio.instance = null;
    }
  }
}
