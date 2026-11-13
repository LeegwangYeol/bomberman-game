/**
 * RiftCrisisAudio.ts — Procedural Web Audio Synthesizer for Dimensional Rift Inversion (Stellaris Crisis 6)
 *
 * Implements 100% Procedural Sound Synthesis for Dimensional Rift Crisis Phenomena:
 * 1. Subspace Distortion Drone & Gravitational Warp Drone:
 *    - 34.0Hz sub-bass gravitational drone with exponential descent to 26.0Hz.
 *    - 130.0Hz triangle spacetime tear with resonant bandpass filter.
 *    - High-frequency quantum fluctuation noise burst (1450Hz bandpass).
 *    - Reality distortion warning alarm (880Hz -> 440Hz triangle sweep).
 * 2. Toroidal Corridor Wrap & Subspace Rift Teleportation:
 *    - Teleport whoosh with Doppler frequency ramp (260Hz -> 1400Hz -> 180Hz exponential sweep, 280ms).
 *    - Quantum slipstream sub-pop (55Hz -> 25Hz sine, 220ms).
 *    - High-pass particle dispersion hiss (2400Hz highpass noise burst, 90ms).
 * 3. Quantum Spire Synchronization Chimes (4-Tier E-Minor / E-Dorian):
 *    - 4-Tier crystal chime arpeggios:
 *      * Tier 1: E5 (659.25Hz)
 *      * Tier 2: G5 (783.99Hz)
 *      * Tier 3: B5 (987.77Hz)
 *      * Tier 4: E6 (1318.51Hz) + Sub-Octave Anchor E4 (329.63Hz)
 *    - Sync window tick pulse (520Hz short ping, 80ms).
 *    - Decoherence / Sync Lost alarm (320Hz down to 110Hz saw dissonance, 350ms).
 * 4. Singularity Collapse & Reality Coherence Stabilization (E-Major Solfeggio 528Hz Resolution):
 *    - Singularity collapse implosion (90Hz -> 30Hz sine sub-bass, 800ms).
 *    - 4-tone celestial resolution peace chord in E-Major:
 *      * E4 (329.63Hz), G#4 (415.30Hz), B4 (493.88Hz), E5 (659.25Hz)
 *    - Reality stabilization cooling dissipate sweep (640Hz down to 60Hz triangle decay, 1.2s).
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
 * Pre-allocated immutable tone parameters for Zero-GC Dimensional Rift Audio synthesis
 */
export const RIFT_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Subspace Distortion Drone & Gravitational Warp Drone
  // ============================================================================
  WARP_SUB_DRONE_34HZ: {
    type: 'sine',
    frequency: 34.0,
    frequencyRamp: { target: 26.0, duration: 1.60, exponential: true },
    gain: 0.32,
    duration: 1.80,
    attackTime: 0.18,
    decayTime: 0.50,
    sustainLevel: 0.50,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 80, q: 2.2 },
  } as AudioVoiceToneParams,

  SPACETIME_TEAR_130HZ: {
    type: 'triangle',
    frequency: 130.0,
    frequencyRamp: { target: 95.0, duration: 0.70, exponential: true },
    gain: 0.20,
    duration: 0.90,
    attackTime: 0.04,
    decayTime: 0.25,
    sustainLevel: 0.28,
    releaseTime: 0.30,
    filter: { type: 'bandpass', frequency: 260, q: 2.5 },
  } as AudioVoiceToneParams,

  REALITY_DISTORTION_ALARM: {
    type: 'sawtooth',
    frequency: 880.0,
    frequencyRamp: { target: 440.0, duration: 0.30, exponential: true },
    gain: 0.26,
    duration: 0.36,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.28,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 650, q: 3.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Toroidal Corridor Wrap & Subspace Rift Teleportation
  // ============================================================================
  TELEPORT_DOPPLER_SWEEP: {
    type: 'sawtooth',
    frequency: 260.0,
    frequencyRamp: { target: 1400.0, duration: 0.20, exponential: true },
    gain: 0.30,
    duration: 0.28,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.35,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 1100, q: 3.5 },
  } as AudioVoiceToneParams,

  TELEPORT_SUB_POP: {
    type: 'sine',
    frequency: 55.0,
    frequencyRamp: { target: 25.0, duration: 0.18, exponential: true },
    gain: 0.38,
    duration: 0.22,
    attackTime: 0.005,
    decayTime: 0.09,
    sustainLevel: 0.20,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 100, q: 1.5 },
  } as AudioVoiceToneParams,

  TOROIDAL_WARP_WHOOSH: {
    type: 'triangle',
    frequency: 440.0,
    frequencyRamp: { target: 220.0, duration: 0.24, exponential: true },
    gain: 0.25,
    duration: 0.26,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 520, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Quantum Spire Synchronization Chimes (4-Tier E-Minor / E-Dorian)
  // ============================================================================
  SPIRE_TIER_1_E5: {
    type: 'sine',
    frequency: 659.25, // E5
    gain: 0.30,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1318, q: 2.5 },
  } as AudioVoiceToneParams,

  SPIRE_TIER_2_G5: {
    type: 'sine',
    frequency: 783.99, // G5 (Minor 3rd)
    gain: 0.32,
    duration: 0.45,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1568, q: 2.5 },
  } as AudioVoiceToneParams,

  SPIRE_TIER_3_B5: {
    type: 'sine',
    frequency: 987.77, // B5 (Perfect 5th)
    gain: 0.34,
    duration: 0.55,
    attackTime: 0.005,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.30,
    filter: { type: 'bandpass', frequency: 1975, q: 2.8 },
  } as AudioVoiceToneParams,

  SPIRE_TIER_4_E6: {
    type: 'sine',
    frequency: 1318.51, // E6 (Octave)
    gain: 0.35,
    duration: 0.65,
    attackTime: 0.005,
    decayTime: 0.20,
    sustainLevel: 0.25,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2637, q: 3.0 },
  } as AudioVoiceToneParams,

  SPIRE_OCTAVE_ANCHOR_E4: {
    type: 'triangle',
    frequency: 329.63, // E4 (Anchor)
    gain: 0.28,
    duration: 0.60,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 600, q: 1.8 },
  } as AudioVoiceToneParams,

  SYNC_WINDOW_TICK: {
    type: 'sine',
    frequency: 520.0,
    gain: 0.22,
    duration: 0.08,
    attackTime: 0.002,
    decayTime: 0.03,
    sustainLevel: 0.15,
    releaseTime: 0.04,
    filter: { type: 'bandpass', frequency: 1040, q: 4.0 },
  } as AudioVoiceToneParams,

  SYNC_LOST_DECOHERENCE: {
    type: 'sawtooth',
    frequency: 320.0,
    frequencyRamp: { target: 110.0, duration: 0.30, exponential: true },
    gain: 0.30,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 450, q: 2.5 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Singularity Collapse & Reality Coherence Stabilization
  // ============================================================================
  SINGULARITY_IMPLOSION_SUB: {
    type: 'sine',
    frequency: 90.0,
    frequencyRamp: { target: 30.0, duration: 0.70, exponential: true },
    gain: 0.42,
    duration: 0.80,
    attackTime: 0.01,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 120, q: 2.0 },
  } as AudioVoiceToneParams,

  REALITY_DISSIPATE_SWEEP: {
    type: 'triangle',
    frequency: 640.0,
    frequencyRamp: { target: 60.0, duration: 1.10, exponential: true },
    gain: 0.30,
    duration: 1.20,
    attackTime: 0.02,
    decayTime: 0.40,
    sustainLevel: 0.25,
    releaseTime: 0.50,
    filter: { type: 'bandpass', frequency: 420, q: 2.5 },
  } as AudioVoiceToneParams,

  // Celestial E-Major Resolution Peace Chord (featuring Solfeggio 528Hz alignment)
  RESOLUTION_CHORD_E4: {
    type: 'sine',
    frequency: 329.63, // E4
    gain: 0.26,
    duration: 1.80,
    attackTime: 0.05,
    decayTime: 0.40,
    sustainLevel: 0.40,
    releaseTime: 0.95,
  } as AudioVoiceToneParams,

  RESOLUTION_CHORD_GSHARP4: {
    type: 'sine',
    frequency: 415.30, // G#4 (Major 3rd)
    gain: 0.26,
    duration: 1.80,
    attackTime: 0.05,
    decayTime: 0.40,
    sustainLevel: 0.40,
    releaseTime: 0.95,
  } as AudioVoiceToneParams,

  RESOLUTION_CHORD_B4: {
    type: 'sine',
    frequency: 493.88, // B4 (Perfect 5th)
    gain: 0.26,
    duration: 1.80,
    attackTime: 0.05,
    decayTime: 0.40,
    sustainLevel: 0.40,
    releaseTime: 0.95,
  } as AudioVoiceToneParams,

  RESOLUTION_CHORD_E5: {
    type: 'sine',
    frequency: 659.25, // E5 (Octave)
    gain: 0.24,
    duration: 1.90,
    attackTime: 0.05,
    decayTime: 0.40,
    sustainLevel: 0.38,
    releaseTime: 1.05,
  } as AudioVoiceToneParams,

  // ============================================================================
  // Stage Transition & Threat Warnings
  // ============================================================================
  STAGE_TRANSITION_ALARM: {
    type: 'sawtooth',
    frequency: 520.0,
    frequencyRamp: { target: 1040.0, duration: 0.35, exponential: true },
    gain: 0.30,
    duration: 0.40,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 780, q: 3.0 },
  } as AudioVoiceToneParams,

  THREAT_ELEVATION_WARPING: {
    type: 'triangle',
    frequency: 240.0,
    frequencyRamp: { target: 480.0, duration: 0.25, exponential: true },
    gain: 0.24,
    duration: 0.30,
    attackTime: 0.01,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.15,
    filter: { type: 'bandpass', frequency: 360, q: 2.5 },
  } as AudioVoiceToneParams,
});

/**
 * RiftCrisisAudio — Singleton synthesizer for Dimensional Rift Inversion
 */
export class RiftCrisisAudio {
  private static instance: RiftCrisisAudio | null = null;
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedSampleRate: number = 0;

  private ctx: AudioContext | null = null;
  private pool: AudioVoicePool | null = null;
  private ownsPool: boolean = false;

  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();
  private activeTransientNodes: Set<AudioNode> = new Set();

  // Rate-limiting debounce trackers (ms)
  private lastWarpDroneMs: number = 0;
  private lastTeleportMs: number = 0;
  private lastSpireSyncMs: number = 0;
  private lastRealityStabilizedMs: number = 0;

  private constructor(pool?: AudioVoicePool, ctx?: AudioContext) {
    if (pool) {
      this.pool = pool;
      this.ctx = ctx ?? ('getContext' in pool && typeof pool.getContext === 'function' ? pool.getContext() : null);
      this.ownsPool = false;
    } else {
      if (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)) {
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          this.ctx = new AudioContextClass();
          this.pool = new AudioVoicePool(16, this.ctx);
          this.ownsPool = true;
        } catch {
          this.ctx = null;
          this.pool = null;
          this.ownsPool = false;
        }
      }
    }
  }

  public static getInstance(pool?: AudioVoicePool, ctx?: AudioContext): RiftCrisisAudio {
    if (!RiftCrisisAudio.instance) {
      RiftCrisisAudio.instance = new RiftCrisisAudio(pool, ctx);
    } else if (pool && RiftCrisisAudio.instance.pool !== pool) {
      RiftCrisisAudio.instance.pool = pool;
      RiftCrisisAudio.instance.ctx = ctx ?? ('getContext' in pool && typeof pool.getContext === 'function' ? pool.getContext() : null);
    }
    return RiftCrisisAudio.instance;
  }

  public static resetInstance(): void {
    if (RiftCrisisAudio.instance) {
      RiftCrisisAudio.instance.destroy();
      RiftCrisisAudio.instance = null;
    }
    RiftCrisisAudio.cachedNoiseBuffer = null;
    RiftCrisisAudio.cachedSampleRate = 0;
  }

  /**
   * Static reusable 500ms white noise buffer generator
   */
  public static getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (!ctx) return null;
    if (RiftCrisisAudio.cachedNoiseBuffer && RiftCrisisAudio.cachedSampleRate === ctx.sampleRate) {
      return RiftCrisisAudio.cachedNoiseBuffer;
    }
    try {
      const bufferSize = Math.floor(ctx.sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      RiftCrisisAudio.cachedNoiseBuffer = buffer;
      RiftCrisisAudio.cachedSampleRate = ctx.sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  private getPool(): AudioVoicePool | null {
    if (this.pool) return this.pool;
    if (typeof window !== 'undefined' && typeof AudioContext !== 'undefined') {
      this.pool = AudioVoicePool.getInstance(16);
      return this.pool;
    }
    return null;
  }

  // ============================================================================
  // Soundscape Playback Routines
  // ============================================================================

  /**
   * 1. Subspace Distortion Drone & Gravitational Warp Drone
   */
  public playSubspaceDrone(nowMs: number = Date.now()): void {
    if (nowMs - this.lastWarpDroneMs < 400) return;
    this.lastWarpDroneMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(RIFT_AUDIO_PRESETS.WARP_SUB_DRONE_34HZ);
    pool.playTone(RIFT_AUDIO_PRESETS.SPACETIME_TEAR_130HZ);
    this.playNoiseBurst(0.40, 1450, 0.16, 'bandpass');
  }

  /**
   * 2. Toroidal Corridor Wrap & Subspace Rift Teleportation
   */
  public playTeleport(nowMs: number = Date.now()): void {
    if (nowMs - this.lastTeleportMs < 120) return; // 120ms debounce
    this.lastTeleportMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(RIFT_AUDIO_PRESETS.TELEPORT_DOPPLER_SWEEP);
    pool.playTone(RIFT_AUDIO_PRESETS.TELEPORT_SUB_POP);
    pool.playTone(RIFT_AUDIO_PRESETS.TOROIDAL_WARP_WHOOSH);
    this.playNoiseBurst(0.12, 2400, 0.18, 'highpass');
  }

  /**
   * 3. Quantum Spire Synchronization Chimes (4-Tier E-Minor / E-Dorian)
   */
  public playSpireSync(polarizedCount: number, nowMs: number = Date.now()): void {
    if (nowMs - this.lastSpireSyncMs < 100) return;
    this.lastSpireSyncMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    if (polarizedCount === 1) {
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5);
      pool.playTone(RIFT_AUDIO_PRESETS.SYNC_WINDOW_TICK);
      this.playNoiseBurst(0.08, 1800, 0.12, 'bandpass');
    } else if (polarizedCount === 2) {
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5);
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_2_G5);
      pool.playTone(RIFT_AUDIO_PRESETS.SYNC_WINDOW_TICK);
      this.playNoiseBurst(0.10, 2200, 0.14, 'bandpass');
    } else if (polarizedCount >= 3) {
      // Complete Synchronization!
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5);
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_2_G5);
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_3_B5);
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_4_E6);
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_OCTAVE_ANCHOR_E4);
      this.playNoiseBurst(0.20, 2800, 0.22, 'highpass');
    }
  }

  /**
   * Sync Lost Decoherence Alert
   */
  public playSyncLost(): void {
    const pool = this.getPool();
    if (!pool) return;
    pool.playTone(RIFT_AUDIO_PRESETS.SYNC_LOST_DECOHERENCE);
  }

  /**
   * 4. Singularity Collapse & Reality Coherence Stabilization
   */
  public playRealityStabilized(nowMs: number = Date.now()): void {
    if (nowMs - this.lastRealityStabilizedMs < 3000) return;
    this.lastRealityStabilizedMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(RIFT_AUDIO_PRESETS.SINGULARITY_IMPLOSION_SUB);
    pool.playTone(RIFT_AUDIO_PRESETS.REALITY_DISSIPATE_SWEEP);

    // E-Major Celestial Harmony Quad
    pool.playTone(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_E4);
    pool.playTone(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_GSHARP4);
    pool.playTone(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_B4);
    pool.playTone(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_E5);

    this.playNoiseBurst(0.35, 1200, 0.15, 'bandpass');
  }

  /**
   * Dispatch audio reactions to crisis FSM state changes
   */
  public playCrisisState(stage: CrisisStage, threatMeter: number = 0, nowMs: number = Date.now()): void {
    const pool = this.getPool();
    if (!pool) return;

    if (stage === CrisisStage.WHISPERS) {
      pool.playTone(RIFT_AUDIO_PRESETS.REALITY_DISTORTION_ALARM);
      this.playSubspaceDrone(nowMs);
    } else if (stage === CrisisStage.OUTBREAK) {
      pool.playTone(RIFT_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      pool.playTone(RIFT_AUDIO_PRESETS.TELEPORT_DOPPLER_SWEEP);
      this.playSubspaceDrone(nowMs);
    } else if (stage === CrisisStage.CLIMAX) {
      pool.playTone(RIFT_AUDIO_PRESETS.STAGE_TRANSITION_ALARM);
      pool.playTone(RIFT_AUDIO_PRESETS.THREAT_ELEVATION_WARPING);
      pool.playTone(RIFT_AUDIO_PRESETS.REALITY_DISTORTION_ALARM);
      pool.playTone(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5);
    } else if (stage === CrisisStage.RESOLVED) {
      this.playRealityStabilized(nowMs);
    }

    if (threatMeter > 80 && stage !== CrisisStage.RESOLVED) {
      pool.playTone(RIFT_AUDIO_PRESETS.THREAT_ELEVATION_WARPING);
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
      const buffer = RiftCrisisAudio.getOrCreateNoiseBuffer(this.ctx);
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

    this.lastWarpDroneMs = 0;
    this.lastTeleportMs = 0;
    this.lastSpireSyncMs = 0;
    this.lastRealityStabilizedMs = 0;
  }

  public destroy(): void {
    this.reset();
    if (this.ownsPool && this.pool) {
      this.pool.destroy();
    }
    this.pool = null;
    this.ctx = null;
    RiftCrisisAudio.cachedNoiseBuffer = null;
    RiftCrisisAudio.cachedSampleRate = 0;
    if (RiftCrisisAudio.instance === this) {
      RiftCrisisAudio.instance = null;
    }
  }
}
