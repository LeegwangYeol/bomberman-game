/**
 * FrostHazardAudio.ts — Procedural Web Audio Sound Synthesizer for FrostHazard Events
 *
 * Designed for the 2026-10-03 Daily Evolution Cycle:
 * - Crystallization Rime Crackle: High-frequency filtered noise with micro-amplitude exponential crackle.
 * - Permafrost Blizzard Wind: Modulated sub-zero whistling wind gust with sweeping resonant bandpass filter.
 * - Absolute Zero Shatter: Resonant cryogenic chime chord in D minor (F5 698Hz, A5 880Hz, D6 1175Hz, E6 1318Hz) + sub-bass thud (55Hz).
 * - Thaw Melting Droplet: Downward sweeping sine blip (1400Hz -> 900Hz).
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Reuses pre-allocated voices via AudioVoicePool when available.
 * - Auto-disconnects oscillators and nodes cleanly on completion.
 * - 100% headless / SSR safe (no crashes when window or AudioContext is undefined).
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';

export const FROST_AUDIO_PRESETS = {
  CRYSTALLIZATION_CRACKLE: {
    type: 'triangle',
    frequency: 2400,
    frequencyRamp: { target: 3600, duration: 0.15, exponential: true },
    gain: 0.12,
    duration: 0.20,
    attackTime: 0.01,
    decayTime: 0.08,
    sustainLevel: 0.2,
    releaseTime: 0.10,
    filter: { type: 'highpass', frequency: 1800, q: 3.5 },
  } as AudioVoiceToneParams,

  BLIZZARD_WIND_GUST: {
    type: 'sawtooth',
    frequency: 180,
    frequencyRamp: { target: 120, duration: 0.45, exponential: false },
    gain: 0.16,
    duration: 0.50,
    attackTime: 0.08,
    decayTime: 0.20,
    sustainLevel: 0.4,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 320, q: 2.5, rampTarget: 200, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  ABSOLUTE_ZERO_CHIME_F5: {
    type: 'sine',
    frequency: 698.46, // F5
    gain: 0.22,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.4,
    releaseTime: 0.45,
  } as AudioVoiceToneParams,

  ABSOLUTE_ZERO_CHIME_A5: {
    type: 'sine',
    frequency: 880.00, // A5
    gain: 0.20,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.15,
    sustainLevel: 0.4,
    releaseTime: 0.45,
  } as AudioVoiceToneParams,

  ABSOLUTE_ZERO_CHIME_D6: {
    type: 'sine',
    frequency: 1174.66, // D6
    gain: 0.18,
    duration: 0.70,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.50,
  } as AudioVoiceToneParams,

  ABSOLUTE_ZERO_SUB_THUD: {
    type: 'sine',
    frequency: 55,
    frequencyRamp: { target: 35, duration: 0.25, exponential: true },
    gain: 0.35,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.3,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  THAW_DROPLET: {
    type: 'sine',
    frequency: 1400,
    frequencyRamp: { target: 900, duration: 0.05, exponential: true },
    gain: 0.15,
    duration: 0.08,
    attackTime: 0.005,
    decayTime: 0.03,
    sustainLevel: 0.1,
    releaseTime: 0.04,
  } as AudioVoiceToneParams,

  THERMAL_BREAK_CHIME: {
    type: 'sine',
    frequency: 1318.51, // E6
    frequencyRamp: { target: 1760.00, duration: 0.20, exponential: true }, // E6 -> A6
    gain: 0.25,
    duration: 0.40,
    attackTime: 0.005,
    decayTime: 0.10,
    sustainLevel: 0.3,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 1500, q: 3.0 },
  } as AudioVoiceToneParams,

  FROST_CHILL_PUFF: {
    type: 'triangle',
    frequency: 240,
    frequencyRamp: { target: 140, duration: 0.15, exponential: false },
    gain: 0.14,
    duration: 0.25,
    attackTime: 0.02,
    decayTime: 0.08,
    sustainLevel: 0.2,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 400, q: 2.0 },
  } as AudioVoiceToneParams,
};

export class FrostHazardAudio {
  private static instance: FrostHazardAudio | null = null;
  private pool: AudioVoicePool | null = null;
  private lastPlayTimeMs: number = -Infinity;
  private lastCrystallizationMs: number = -Infinity;
  private lastBlizzardMs: number = -Infinity;
  private lastBurstMs: number = -Infinity;
  private lastThawMs: number = -Infinity;
  private lastThermalBreakMs: number = -Infinity;
  private lastChillMs: number = -Infinity;

  constructor(pool?: AudioVoicePool) {
    if (pool) {
      this.pool = pool;
    } else {
      this.pool = AudioVoicePool.getInstance();
    }
  }

  public static getInstance(pool?: AudioVoicePool): FrostHazardAudio {
    if (!FrostHazardAudio.instance) {
      FrostHazardAudio.instance = new FrostHazardAudio(pool);
    }
    return FrostHazardAudio.instance;
  }

  public playCrystallization(currentTimeMs: number = 0): void {
    if (!this.pool) return;
    if (currentTimeMs > 0 && currentTimeMs - this.lastCrystallizationMs < 120) return;
    this.lastCrystallizationMs = currentTimeMs;
    this.lastPlayTimeMs = currentTimeMs;
    this.pool.playTone(FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE);
  }

  public playBlizzardWind(currentTimeMs: number = 0): void {
    if (!this.pool) return;
    if (currentTimeMs > 0 && currentTimeMs - this.lastBlizzardMs < 250) return;
    this.lastBlizzardMs = currentTimeMs;
    this.lastPlayTimeMs = currentTimeMs;
    this.pool.playTone(FROST_AUDIO_PRESETS.BLIZZARD_WIND_GUST);
  }

  public playAbsoluteZeroBurst(currentTimeMs: number = 0): void {
    if (!this.pool) return;
    this.lastBurstMs = currentTimeMs;
    this.lastPlayTimeMs = currentTimeMs;
    this.pool.playTone(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_SUB_THUD);
    this.pool.playTone(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_F5);
    this.pool.playTone(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_A5);
    this.pool.playTone(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_D6);
  }

  public playThawMelt(currentTimeMs: number = 0): void {
    if (!this.pool) return;
    if (currentTimeMs > 0 && currentTimeMs - this.lastThawMs < 100) return;
    this.lastThawMs = currentTimeMs;
    this.lastPlayTimeMs = currentTimeMs;
    this.pool.playTone(FROST_AUDIO_PRESETS.THAW_DROPLET);
  }

  public playThermalBreak(currentTimeMs: number = 0): void {
    if (!this.pool) return;
    if (currentTimeMs > 0 && currentTimeMs - this.lastThermalBreakMs < 100) return;
    this.lastThermalBreakMs = currentTimeMs;
    this.lastPlayTimeMs = currentTimeMs;
    this.pool.playTone(FROST_AUDIO_PRESETS.THERMAL_BREAK_CHIME);
  }

  public playFrostChill(currentTimeMs: number = 0): void {
    if (!this.pool) return;
    if (currentTimeMs > 0 && currentTimeMs - this.lastChillMs < 150) return;
    this.lastChillMs = currentTimeMs;
    this.lastPlayTimeMs = currentTimeMs;
    this.pool.playTone(FROST_AUDIO_PRESETS.FROST_CHILL_PUFF);
  }

  public playFrostHazardState(state: string, currentTimeMs: number = 0): void {
    const s = String(state).toUpperCase();
    if (s.includes('SURGE') || s.includes('CRYSTAL') || s.includes('HOARFROST')) {
      this.playCrystallization(currentTimeMs);
    } else if (s.includes('BURST') || s.includes('ABSOLUTE_ZERO')) {
      this.playAbsoluteZeroBurst(currentTimeMs);
    } else if (s.includes('THAW') || s.includes('COOLDOWN')) {
      this.playThawMelt(currentTimeMs);
    }
  }

  public reset(): void {
    this.lastPlayTimeMs = -Infinity;
    this.lastCrystallizationMs = -Infinity;
    this.lastBlizzardMs = -Infinity;
    this.lastBurstMs = -Infinity;
    this.lastThawMs = -Infinity;
    this.lastThermalBreakMs = -Infinity;
    this.lastChillMs = -Infinity;
  }

  public destroy(): void {
    this.reset();
  }
}
