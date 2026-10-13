/**
 * VoidCrisisAudio.ts — Procedural Web Audio Synthesizer for Pastel Void Incursion (Stellaris Crisis 1)
 *
 * Implements 100% Procedural Sound Synthesis for Void Phenomena:
 * 1. Subspace Void Hum: Deep 36Hz / 48Hz gravitational drone with phase sweep,
 *    4:3 harmonic ratio, sub-bass anchor (24Hz), and resonant vacuum sweep.
 * 2. Prism Resonance Chime: Crystalline bell chimes scaling with prism charge (33%, 66%, 100%),
 *    ascending harmonic triads (C6, E6, G6, C7, E7) with high-Q crystal resonance.
 * 3. Supernova Cleanse: Celestial burst with wide harmonic expansion (D4, A4, D5, F#5, A5, D6),
 *    expansive white noise burst (3500Hz -> 400Hz) and sub-bass shockwave.
 * 4. Singularity Implosion Alert: Descending gravitational collapse warning (120Hz -> 28Hz plunge),
 *    distorted grav-siren, sub-bass implosion thud (38Hz -> 18Hz) and vacuum suck whoosh.
 *
 * Additional Combat & Atmosphere Signals:
 * - Avatar Shield Shatter, Avatar Hit & Defeat Chimes.
 * - Void Creep Whispers and Singularity Collapse.
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Reuses pre-allocated voices via AudioVoicePool (persistent oscillators, click-free stealing).
 * - Static cached 500ms white noise buffer reused permanently without runtime heap allocation.
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

function deepFreezePresets<T extends Record<string, AudioVoiceToneParams>>(presets: T): Readonly<{ [K in keyof T]: Readonly<T[K]> }> {
  for (const key of Object.keys(presets)) {
    const p = presets[key];
    if (p && typeof p === 'object') {
      freezeTonePreset(p);
    }
  }
  return Object.freeze(presets) as Readonly<{ [K in keyof T]: Readonly<T[K]> }>;
}

/**
 * Pre-allocated immutable tone parameters for Zero-GC Void Incursion Audio synthesis
 */
export const VOID_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Subspace Void Hum (Deep 36Hz / 48Hz Gravitational Drone with Phase Sweep)
  // ============================================================================
  SUBSPACE_VOID_VOICE_36HZ: {
    type: 'sine',
    frequency: 36.0,
    frequencyRamp: { target: 32.0, duration: 1.40, exponential: true },
    gain: 0.35,
    duration: 1.60,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.60,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 75, q: 2.0 },
  } as AudioVoiceToneParams,

  SUBSPACE_VOID_VOICE_48HZ: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 42.0, duration: 1.40, exponential: true },
    gain: 0.30,
    duration: 1.60,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.55,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 85, q: 2.0 },
  } as AudioVoiceToneParams,

  SUBSPACE_VOID_SUB_ANCHOR: {
    type: 'sine',
    frequency: 24.0,
    frequencyRamp: { target: 20.0, duration: 1.50, exponential: true },
    gain: 0.38,
    duration: 1.80,
    attackTime: 0.25,
    decayTime: 0.50,
    sustainLevel: 0.65,
    releaseTime: 0.65,
    filter: { type: 'lowpass', frequency: 50, q: 1.5 },
  } as AudioVoiceToneParams,

  SUBSPACE_VOID_WARP_SWEEP: {
    type: 'triangle',
    frequency: 96.0,
    frequencyRamp: { target: 144.0, duration: 0.90, exponential: true },
    gain: 0.18,
    duration: 1.10,
    attackTime: 0.10,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 140, q: 3.2, rampTarget: 260, rampDuration: 0.90 },
  } as AudioVoiceToneParams,

  SUBSPACE_VOID_SHIMMER: {
    type: 'sine',
    frequency: 320.0,
    frequencyRamp: { target: 480.0, duration: 0.70, exponential: true },
    gain: 0.12,
    duration: 0.90,
    attackTime: 0.05,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 600, q: 2.5 },
  } as AudioVoiceToneParams,

  // Teammate Variant: 52Hz/78Hz Rift Hum
  VOID_RIFT_SUB_DRONE_52HZ: {
    type: 'sine',
    frequency: 52.0,
    frequencyRamp: { target: 42.0, duration: 1.0, exponential: true },
    gain: 0.35,
    duration: 1.30,
    attackTime: 0.18,
    decayTime: 0.40,
    sustainLevel: 0.50,
    releaseTime: 0.45,
    filter: { type: 'lowpass', frequency: 105, q: 2.0 },
  } as AudioVoiceToneParams,

  VOID_RIFT_RESONANCE_HUM: {
    type: 'triangle',
    frequency: 78.0,
    frequencyRamp: { target: 52.0, duration: 0.85, exponential: true },
    gain: 0.22,
    duration: 1.10,
    attackTime: 0.15,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.40,
    filter: { type: 'lowpass', frequency: 130, q: 1.8 },
  } as AudioVoiceToneParams,

  VOID_WARP_WARBLE: {
    type: 'triangle',
    frequency: 195.0,
    frequencyRamp: { target: 390.0, duration: 0.65, exponential: true },
    gain: 0.20,
    duration: 0.85,
    attackTime: 0.08,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.30,
    filter: { type: 'bandpass', frequency: 420, q: 3.5, rampTarget: 840, rampDuration: 0.65 },
  } as AudioVoiceToneParams,

  VOID_COSMIC_SHIMMER: {
    type: 'sine',
    frequency: 920.0,
    frequencyRamp: { target: 1380.0, duration: 0.50, exponential: true },
    gain: 0.16,
    duration: 0.70,
    attackTime: 0.04,
    decayTime: 0.20,
    sustainLevel: 0.28,
    releaseTime: 0.35,
    filter: { type: 'highpass', frequency: 850, q: 2.2 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Prism Resonance Chime (Scaling with Prism Charge: 33%, 66%, 100%)
  // ============================================================================
  // Tier 1 (Charge ~33% / Hit 1)
  PRISM_CHIME_TIER1_C6: {
    type: 'sine',
    frequency: 1046.50, // C6
    frequencyRamp: { target: 1174.66, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'highpass', frequency: 900, q: 2.5 },
  } as AudioVoiceToneParams,

  PRISM_CHIME_TIER1_G6: {
    type: 'sine',
    frequency: 1567.98, // G6
    frequencyRamp: { target: 1760.00, duration: 0.20, exponential: true },
    gain: 0.18,
    duration: 0.40,
    attackTime: 0.002,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1800, q: 3.0 },
  } as AudioVoiceToneParams,

  // Tier 2 (Charge ~66% / Hit 2)
  PRISM_CHIME_TIER2_E6: {
    type: 'sine',
    frequency: 1318.51, // E6
    frequencyRamp: { target: 1567.98, duration: 0.30, exponential: true },
    gain: 0.30,
    duration: 0.55,
    attackTime: 0.003,
    decayTime: 0.15,
    sustainLevel: 0.28,
    releaseTime: 0.30,
    filter: { type: 'highpass', frequency: 1100, q: 2.5 },
  } as AudioVoiceToneParams,

  PRISM_CHIME_TIER2_B6: {
    type: 'sine',
    frequency: 1975.53, // B6
    frequencyRamp: { target: 2093.00, duration: 0.25, exponential: true },
    gain: 0.22,
    duration: 0.50,
    attackTime: 0.002,
    decayTime: 0.12,
    sustainLevel: 0.22,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 2200, q: 3.5 },
  } as AudioVoiceToneParams,

  // Tier 3 (Charge 100% / Fully Charged / Aura Active)
  PRISM_CHIME_TIER3_C7: {
    type: 'sine',
    frequency: 2093.00, // C7
    frequencyRamp: { target: 2637.02, duration: 0.40, exponential: true },
    gain: 0.32,
    duration: 0.70,
    attackTime: 0.002,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.40,
    filter: { type: 'highpass', frequency: 1600, q: 3.0 },
  } as AudioVoiceToneParams,

  PRISM_CHIME_TIER3_E7: {
    type: 'sine',
    frequency: 2637.02, // E7
    frequencyRamp: { target: 3135.96, duration: 0.35, exponential: true },
    gain: 0.24,
    duration: 0.65,
    attackTime: 0.002,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2800, q: 4.0 },
  } as AudioVoiceToneParams,

  PRISM_CHIME_TIER3_SWEEP: {
    type: 'triangle',
    frequency: 1046.50,
    frequencyRamp: { target: 2093.00, duration: 0.30, exponential: true },
    gain: 0.20,
    duration: 0.60,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.30,
    filter: { type: 'bandpass', frequency: 2000, q: 4.5 },
  } as AudioVoiceToneParams,

  // Prism charging hit & 528Hz Solfeggio presets
  PRISM_CHARGE_HIT_ROOT: {
    type: 'sine',
    frequency: 739.99, // F#5
    frequencyRamp: { target: 880.00, duration: 0.20, exponential: true },
    gain: 0.25,
    duration: 0.40,
    attackTime: 0.015,
    decayTime: 0.12,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 1100, q: 2.8 },
  } as AudioVoiceToneParams,

  PRISM_CHARGE_HIT_OVERTONE: {
    type: 'triangle',
    frequency: 1108.73, // C#6
    frequencyRamp: { target: 1318.51, duration: 0.22, exponential: true },
    gain: 0.20,
    duration: 0.42,
    attackTime: 0.02,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.22,
    filter: { type: 'bandpass', frequency: 1500, q: 2.5 },
  } as AudioVoiceToneParams,

  PRISM_FULLY_CHARGED_ROOT_528HZ: {
    type: 'sine',
    frequency: 528.00, // Solfeggio MI Miracle frequency
    gain: 0.28,
    duration: 0.80,
    attackTime: 0.02,
    decayTime: 0.20,
    sustainLevel: 0.40,
    releaseTime: 0.50,
    filter: { type: 'bandpass', frequency: 528, q: 2.4 },
  } as AudioVoiceToneParams,

  PRISM_FULLY_CHARGED_FIFTH_792HZ: {
    type: 'triangle',
    frequency: 792.00,
    gain: 0.22,
    duration: 0.80,
    attackTime: 0.025,
    decayTime: 0.20,
    sustainLevel: 0.35,
    releaseTime: 0.50,
    filter: { type: 'bandpass', frequency: 792, q: 2.2 },
  } as AudioVoiceToneParams,

  PRISM_FULLY_CHARGED_OCTAVE_1056HZ: {
    type: 'sine',
    frequency: 1056.00,
    gain: 0.18,
    duration: 0.75,
    attackTime: 0.03,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.45,
    filter: { type: 'highpass', frequency: 900, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Supernova Cleanse (Celestial Burst with Harmonic Expansion)
  // ============================================================================
  SUPERNOVA_CHORD_D4: {
    type: 'triangle',
    frequency: 293.66, // D4
    frequencyRamp: { target: 329.63, duration: 0.60, exponential: true },
    gain: 0.25,
    duration: 1.20,
    attackTime: 0.01,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 600, q: 2.0 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CHORD_A4: {
    type: 'sine',
    frequency: 440.00, // A4
    frequencyRamp: { target: 493.88, duration: 0.60, exponential: true },
    gain: 0.22,
    duration: 1.20,
    attackTime: 0.01,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.60,
    filter: { type: 'bandpass', frequency: 500, q: 2.5 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CHORD_D5: {
    type: 'sine',
    frequency: 587.33, // D5
    frequencyRamp: { target: 880.00, duration: 0.80, exponential: true },
    gain: 0.25,
    duration: 1.40,
    attackTime: 0.01,
    decayTime: 0.35,
    sustainLevel: 0.45,
    releaseTime: 0.70,
    filter: { type: 'bandpass', frequency: 900, q: 3.0 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CHORD_FSHARP5: {
    type: 'sine',
    frequency: 739.99, // F#5
    frequencyRamp: { target: 1108.73, duration: 0.80, exponential: true },
    gain: 0.20,
    duration: 1.40,
    attackTime: 0.01,
    decayTime: 0.35,
    sustainLevel: 0.40,
    releaseTime: 0.70,
    filter: { type: 'bandpass', frequency: 1200, q: 3.0 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CHORD_A5: {
    type: 'sine',
    frequency: 880.00, // A5
    frequencyRamp: { target: 1320.00, duration: 0.70, exponential: true },
    gain: 0.22,
    duration: 1.30,
    attackTime: 0.01,
    decayTime: 0.30,
    sustainLevel: 0.35,
    releaseTime: 0.65,
    filter: { type: 'bandpass', frequency: 1500, q: 3.0 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CHORD_D6: {
    type: 'sine',
    frequency: 1174.66, // D6
    frequencyRamp: { target: 1760.00, duration: 0.70, exponential: true },
    gain: 0.24,
    duration: 1.30,
    attackTime: 0.008,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.65,
    filter: { type: 'highpass', frequency: 1100, q: 2.5 },
  } as AudioVoiceToneParams,

  SUPERNOVA_SUB_BLAST: {
    type: 'sine',
    frequency: 64.0,
    frequencyRamp: { target: 24.0, duration: 0.70, exponential: true },
    gain: 0.55,
    duration: 1.00,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.35,
    releaseTime: 0.50,
    filter: { type: 'lowpass', frequency: 90, q: 2.2 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CLEANSE_SURGE: {
    type: 'sine',
    frequency: 1318.51, // E6
    frequencyRamp: { target: 1760.00, duration: 0.35, exponential: true },
    gain: 0.30,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 1600, q: 3.0 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CLEANSE_SUB_WAVE: {
    type: 'sine',
    frequency: 60.0,
    frequencyRamp: { target: 24.0, duration: 0.50, exponential: true },
    gain: 0.48,
    duration: 0.65,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 95, q: 1.6 },
  } as AudioVoiceToneParams,

  SUPERNOVA_CLEANSE_CHIME: {
    type: 'triangle',
    frequency: 1056.00,
    frequencyRamp: { target: 1584.00, duration: 0.40, exponential: true },
    gain: 0.22,
    duration: 0.60,
    attackTime: 0.015,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.30,
    filter: { type: 'highpass', frequency: 1000, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Singularity Implosion Alert (Descending Gravitational Collapse Warning)
  // ============================================================================
  SINGULARITY_PLUNGE: {
    type: 'sawtooth',
    frequency: 120.0,
    frequencyRamp: { target: 28.0, duration: 0.38, exponential: true },
    gain: 0.42,
    duration: 0.50,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 400, q: 3.8, rampTarget: 80, rampDuration: 0.38 },
  } as AudioVoiceToneParams,

  SINGULARITY_IMPLOSION_PULSE_B: {
    type: 'sawtooth',
    frequency: 120.0,
    frequencyRamp: { target: 30.0, duration: 0.38, exponential: true },
    gain: 0.42,
    duration: 0.50,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 400, q: 3.8, rampTarget: 80, rampDuration: 0.38 },
  } as AudioVoiceToneParams,

  SINGULARITY_GRAV_SIREN: {
    type: 'triangle',
    frequency: 240.0,
    frequencyRamp: { target: 45.0, duration: 0.45, exponential: true },
    gain: 0.32,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 600, q: 4.5, rampTarget: 120, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  SINGULARITY_SUB_IMPLOSION: {
    type: 'sine',
    frequency: 38.0,
    frequencyRamp: { target: 18.0, duration: 0.60, exponential: true },
    gain: 0.58,
    duration: 0.75,
    attackTime: 0.005,
    decayTime: 0.25,
    sustainLevel: 0.40,
    releaseTime: 0.35,
    filter: { type: 'lowpass', frequency: 65, q: 2.0 },
  } as AudioVoiceToneParams,

  SINGULARITY_GRAVITY_PULSE: {
    type: 'sine',
    frequency: 40.0,
    frequencyRamp: { target: 18.0, duration: 0.55, exponential: true },
    gain: 0.50,
    duration: 0.65,
    attackTime: 0.008,
    decayTime: 0.25,
    sustainLevel: 0.30,
    releaseTime: 0.30,
    filter: { type: 'lowpass', frequency: 75, q: 1.8 },
  } as AudioVoiceToneParams,

  SINGULARITY_COLLAPSE_CRACK: {
    type: 'sawtooth',
    frequency: 580.0,
    frequencyRamp: { target: 45.0, duration: 0.16, exponential: true },
    gain: 0.45,
    duration: 0.38,
    attackTime: 0.003,
    decayTime: 0.10,
    sustainLevel: 0.20,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 600, q: 3.2, rampTarget: 50, rampDuration: 0.22 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // Additional Combat & Atmosphere Presets
  // ============================================================================
  AVATAR_SHIELD_SHATTER: {
    type: 'sawtooth',
    frequency: 880.0,
    frequencyRamp: { target: 110.0, duration: 0.14, exponential: true },
    gain: 0.40,
    duration: 0.30,
    attackTime: 0.002,
    decayTime: 0.08,
    sustainLevel: 0.20,
    releaseTime: 0.12,
    filter: { type: 'bandpass', frequency: 2200, q: 3.5, rampTarget: 350, rampDuration: 0.18 },
  } as AudioVoiceToneParams,

  AVATAR_HIT_THUD: {
    type: 'sine',
    frequency: 70.0,
    frequencyRamp: { target: 30.0, duration: 0.25, exponential: true },
    gain: 0.45,
    duration: 0.35,
    attackTime: 0.005,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'lowpass', frequency: 110, q: 1.8 },
  } as AudioVoiceToneParams,

  AVATAR_DEFEAT_CHIME: {
    type: 'sine',
    frequency: 432.00,
    frequencyRamp: { target: 864.00, duration: 0.45, exponential: true },
    gain: 0.28,
    duration: 0.70,
    attackTime: 0.01,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 650, q: 2.2 },
  } as AudioVoiceToneParams,

  VOID_CREEP_WHISPER: {
    type: 'triangle',
    frequency: 240.0,
    frequencyRamp: { target: 160.0, duration: 0.30, exponential: true },
    gain: 0.16,
    duration: 0.40,
    attackTime: 0.05,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 400, q: 3.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // Harmonization Aliases (Cross-system compatibility)
  // ============================================================================
  SUBSPACE_VOID_HUM_VOICE_A: {
    type: 'sine',
    frequency: 36.0,
    frequencyRamp: { target: 32.0, duration: 1.40, exponential: true },
    gain: 0.35,
    duration: 1.60,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.60,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 75, q: 2.0 },
  } as AudioVoiceToneParams,

  SUBSPACE_VOID_HUM_VOICE_B: {
    type: 'sine',
    frequency: 48.0,
    frequencyRamp: { target: 42.0, duration: 1.40, exponential: true },
    gain: 0.30,
    duration: 1.60,
    attackTime: 0.20,
    decayTime: 0.40,
    sustainLevel: 0.55,
    releaseTime: 0.60,
    filter: { type: 'lowpass', frequency: 85, q: 2.0 },
  } as AudioVoiceToneParams,

  SUBSPACE_VOID_SUB_DRONE: {
    type: 'sine',
    frequency: 24.0,
    frequencyRamp: { target: 20.0, duration: 1.50, exponential: true },
    gain: 0.38,
    duration: 1.80,
    attackTime: 0.25,
    decayTime: 0.50,
    sustainLevel: 0.65,
    releaseTime: 0.65,
    filter: { type: 'lowpass', frequency: 50, q: 1.5 },
  } as AudioVoiceToneParams,

  SUBSPACE_VOID_WARP: {
    type: 'triangle',
    frequency: 96.0,
    frequencyRamp: { target: 144.0, duration: 0.90, exponential: true },
    gain: 0.18,
    duration: 1.10,
    attackTime: 0.10,
    decayTime: 0.30,
    sustainLevel: 0.40,
    releaseTime: 0.40,
    filter: { type: 'bandpass', frequency: 140, q: 3.2, rampTarget: 260, rampDuration: 0.90 },
  } as AudioVoiceToneParams,

  PRISM_CHIME_LOW: {
    type: 'sine',
    frequency: 1046.50,
    frequencyRamp: { target: 1174.66, duration: 0.25, exponential: true },
    gain: 0.28,
    duration: 0.45,
    attackTime: 0.003,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'highpass', frequency: 900, q: 2.5 },
  } as AudioVoiceToneParams,

  PRISM_CHIME_MID: {
    type: 'sine',
    frequency: 1318.51,
    frequencyRamp: { target: 1567.98, duration: 0.30, exponential: true },
    gain: 0.30,
    duration: 0.55,
    attackTime: 0.003,
    decayTime: 0.15,
    sustainLevel: 0.28,
    releaseTime: 0.30,
    filter: { type: 'highpass', frequency: 1100, q: 2.5 },
  } as AudioVoiceToneParams,

  PRISM_CHIME_HIGH: {
    type: 'sine',
    frequency: 2093.00,
    frequencyRamp: { target: 2637.02, duration: 0.40, exponential: true },
    gain: 0.32,
    duration: 0.70,
    attackTime: 0.002,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.40,
    filter: { type: 'highpass', frequency: 1600, q: 3.0 },
  } as AudioVoiceToneParams,

  PRISM_HARMONIC_SPARKLE: {
    type: 'sine',
    frequency: 2637.02,
    frequencyRamp: { target: 3135.96, duration: 0.35, exponential: true },
    gain: 0.24,
    duration: 0.65,
    attackTime: 0.002,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 2800, q: 4.0 },
  } as AudioVoiceToneParams,

  SUPERNOVA_HARMONIC_A: {
    type: 'sine',
    frequency: 1318.51,
    frequencyRamp: { target: 1760.00, duration: 0.35, exponential: true },
    gain: 0.30,
    duration: 0.65,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.35,
    releaseTime: 0.35,
    filter: { type: 'bandpass', frequency: 1600, q: 3.0 },
  } as AudioVoiceToneParams,

  SUPERNOVA_HARMONIC_B: {
    type: 'triangle',
    frequency: 1056.00,
    frequencyRamp: { target: 1584.00, duration: 0.40, exponential: true },
    gain: 0.22,
    duration: 0.60,
    attackTime: 0.015,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.30,
    filter: { type: 'highpass', frequency: 1000, q: 2.0 },
  } as AudioVoiceToneParams,


  SINGULARITY_ALARM_TONE: {
    type: 'sawtooth',
    frequency: 120.0,
    frequencyRamp: { target: 28.0, duration: 0.38, exponential: true },
    gain: 0.42,
    duration: 0.50,
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.30,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 400, q: 3.8, rampTarget: 80, rampDuration: 0.38 },
  } as AudioVoiceToneParams,

  SINGULARITY_RESONANCE: {
    type: 'triangle',
    frequency: 240.0,
    frequencyRamp: { target: 45.0, duration: 0.45, exponential: true },
    gain: 0.32,
    duration: 0.55,
    attackTime: 0.01,
    decayTime: 0.18,
    sustainLevel: 0.25,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 600, q: 4.5, rampTarget: 120, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  VOID_CREEP_SPREAD: {
    type: 'triangle',
    frequency: 240.0,
    frequencyRamp: { target: 160.0, duration: 0.30, exponential: true },
    gain: 0.16,
    duration: 0.40,
    attackTime: 0.05,
    decayTime: 0.15,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 400, q: 3.0 },
  } as AudioVoiceToneParams,
});

export class VoidCrisisAudio {
  private static instance: VoidCrisisAudio | null = null;

  private pool: AudioVoicePool | null = null;
  private ctx: AudioContext | null = null;
  private ownsPool: boolean = false;

  // Active tracking for Zero-Leak transient audio nodes and watchdog timeouts
  private readonly activeTransientNodes: Set<AudioNode> = new Set();
  private readonly activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Cached static 500ms white noise buffer (reused permanently without GC)
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  // Rate-limiting debounce timestamps (ms)
  private lastHumSoundMs: number = -Infinity;
  private lastRiftHumMs: number = -Infinity;
  private lastPrismChimeMs: number = -Infinity;
  private lastPrismHitMs: number = -Infinity;
  private lastPrismChargedMs: number = -Infinity;
  private lastSupernovaMs: number = -Infinity;
  private lastCleanseMs: number = -Infinity;
  private lastSingularityMs: number = -Infinity;
  private lastShatterMs: number = -Infinity;
  private lastAvatarHitMs: number = -Infinity;
  private lastCreepWhisperMs: number = -Infinity;

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

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): VoidCrisisAudio {
    if (!VoidCrisisAudio.instance) {
      VoidCrisisAudio.instance = new VoidCrisisAudio(poolOrCtx);
    } else if (poolOrCtx) {
      if (poolOrCtx instanceof AudioVoicePool || ('acquireVoice' in poolOrCtx && 'playTone' in poolOrCtx)) {
        VoidCrisisAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
      } else if (!VoidCrisisAudio.instance.ctx) {
        VoidCrisisAudio.instance.init(poolOrCtx as AudioContext);
      }
    }
    return VoidCrisisAudio.instance;
  }

  public static resetInstance(): void {
    if (VoidCrisisAudio.instance) {
      VoidCrisisAudio.instance.destroy();
      VoidCrisisAudio.instance = null;
    }
    VoidCrisisAudio.cachedNoiseBuffer = null;
    VoidCrisisAudio.cachedNoiseSampleRate = 0;
  }

  public resetInstance(): void {
    VoidCrisisAudio.resetInstance();
  }


  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.ctx = ctx;
    if (pool) {
      this.pool = pool;
      this.ownsPool = false;
    } else if (!this.pool) {
      this.pool = new AudioVoicePool(16);
      this.pool.init(ctx);
      this.ownsPool = true;
    } else {
      this.pool.init(ctx);
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    if (this.ownsPool && this.pool && this.pool !== pool) {
      this.pool.destroy();
    }
    this.pool = pool;
    this.ownsPool = false;
    this.ctx = pool.getAudioContext();
  }

  public getContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.pool) {
      const poolCtx = this.pool.getAudioContext();
      if (poolCtx) {
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
          return this.ctx;
        } catch {}
      }
    }
    return null;
  }

  public getPool(): AudioVoicePool | null {
    if (this.pool) return this.pool;
    try {
      this.pool = AudioVoicePool.getInstance(16);
      return this.pool;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // 1. Signature Soundscape: Subspace Void Hum
  // ============================================================================
  /**
   * Plays multi-layered subspace void hum with dual detuned 36Hz/48Hz gravitational oscillators,
   * 24Hz sub-bass anchor, resonant vacuum bandpass sweep, and cosmic void shimmer.
   */
  public playSubspaceVoidHum(intensity: number = 1.0, nowMs: number = Date.now()): void {
    if (nowMs - this.lastHumSoundMs < 350) return;
    this.lastHumSoundMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_36HZ);
    pool.playTone(VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_48HZ);
    pool.playTone(VOID_AUDIO_PRESETS.SUBSPACE_VOID_SUB_ANCHOR);
    pool.playTone(VOID_AUDIO_PRESETS.SUBSPACE_VOID_WARP_SWEEP);

    if (intensity > 0.4) {
      pool.playTone(VOID_AUDIO_PRESETS.SUBSPACE_VOID_SHIMMER);
    }
  }

  /**
   * Alias / Teammate variant: Void Rift Hum
   */
  public playVoidRiftHum(intensity: number = 1.0, nowMs: number = Date.now()): void {
    if (nowMs - this.lastRiftHumMs < 350) return;
    this.lastRiftHumMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.VOID_RIFT_SUB_DRONE_52HZ);
    pool.playTone(VOID_AUDIO_PRESETS.VOID_RIFT_RESONANCE_HUM);
    pool.playTone(VOID_AUDIO_PRESETS.VOID_WARP_WARBLE);
    if (intensity > 0.4) {
      pool.playTone(VOID_AUDIO_PRESETS.VOID_COSMIC_SHIMMER);
    }
  }

  public playVoidDrone(intensity: number = 1.0, nowMs: number = Date.now()): void {
    this.playSubspaceVoidHum(intensity, nowMs);
  }

  // ============================================================================
  // 2. Signature Soundscape: Prism Resonance Chime
  // ============================================================================
  /**
   * Plays crystalline bell chime soundscape scaling dynamically with prism charge (0 - 100).
   * - Tier 1 (Charge 1-49%): C6 + G6 bell chime with sparkling noise transient.
   * - Tier 2 (Charge 50-99%): E6 + B6 ascending harmony with crystal ping.
   * - Tier 3 (Charge 100%): C7 + E7 celestial triad with C6->C7 octave sweep & radiant burst.
   */
  public playPrismResonanceChime(charge: number = 34, nowMs: number = Date.now()): void {
    if (nowMs - this.lastPrismChimeMs < 100) return;
    this.lastPrismChimeMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    if (charge >= 100) {
      this.playPrismFullyCharged(nowMs);
      return;
    } else if (charge >= 50) {
      // Tier 2: ~66% Charge Dual Crystal Harmony
      pool.playTone(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER2_E6);
      pool.playTone(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER2_B6);
      this.playFilteredNoiseBurst(0.15, 2400, 900, 0.10, 3.0);
    } else {
      // Tier 1: ~33% Charge Fundamental Crystal Chime
      pool.playTone(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER1_C6);
      pool.playTone(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER1_G6);
      this.playFilteredNoiseBurst(0.10, 2000, 800, 0.08, 2.5);
    }
  }

  public playPrismChargeHit(_prismIndex: number = 0, nowMs: number = Date.now()): void {
    if (nowMs - this.lastPrismHitMs < 100) return;
    this.lastPrismHitMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.PRISM_CHARGE_HIT_ROOT);
    pool.playTone(VOID_AUDIO_PRESETS.PRISM_CHARGE_HIT_OVERTONE);
    this.playFilteredNoiseBurst(0.12, 1600, 800, 0.08, 3.0);
  }

  public playPrismFullyCharged(nowMs: number = Date.now()): void {
    if (nowMs - this.lastPrismChargedMs < 250) return;
    this.lastPrismChargedMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.PRISM_FULLY_CHARGED_ROOT_528HZ);
    pool.playTone(VOID_AUDIO_PRESETS.PRISM_FULLY_CHARGED_FIFTH_792HZ);
    pool.playTone(VOID_AUDIO_PRESETS.PRISM_FULLY_CHARGED_OCTAVE_1056HZ);
  }

  // ============================================================================
  // 3. Signature Soundscape: Supernova Cleanse
  // ============================================================================
  /**
   * Plays majestic Supernova Cleanse soundscape when prisms are fully charged
   * and the cosmos is purified: multi-octave radiant chord (D4, A4, D5, F#5, A5, D6),
   * deep sub-bass blast (64Hz -> 24Hz), and sweeping celestial noise burst.
   */
  public playSupernovaCleanse(nowMs: number = Date.now()): void {
    if (nowMs - this.lastSupernovaMs < 500) return;
    this.lastSupernovaMs = nowMs;
    this.lastCleanseMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D4);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_A4);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D5);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_FSHARP5);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_A5);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D6);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_SUB_BLAST);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CLEANSE_SURGE);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CLEANSE_CHIME);

    // Sweeping celestial noise burst (3500Hz -> 400Hz over 600ms)
    this.playFilteredNoiseBurst(0.60, 3500, 400, 0.28, 3.5);
  }

  // ============================================================================
  // 4. Signature Soundscape: Singularity Implosion Alert
  // ============================================================================
  /**
   * Plays ominous Singularity Implosion Alert when void creep approaches the collapse threshold:
   * rapid descending pitch plunge (120Hz -> 28Hz), distorted grav-siren (240Hz -> 45Hz),
   * sub-bass implosion thud (38Hz -> 18Hz), and vacuum suck noise whoosh.
   */
  public playSingularityImplosionAlert(nowMs: number = Date.now()): void {
    if (nowMs - this.lastSingularityMs < 400) return;
    this.lastSingularityMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.SINGULARITY_PLUNGE);
    pool.playTone(VOID_AUDIO_PRESETS.SINGULARITY_GRAV_SIREN);
    pool.playTone(VOID_AUDIO_PRESETS.SINGULARITY_SUB_IMPLOSION);

    // Spacetime vacuum suck (2200Hz -> 220Hz over 450ms)
    this.playFilteredNoiseBurst(0.45, 2200, 220, 0.24, 3.2);
  }

  public playSingularityPulse(nowMs: number = Date.now()): void {
    this.playSingularityImplosionAlert(nowMs);
  }

  public playSingularityCollapse(nowMs: number = Date.now()): void {
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.SINGULARITY_COLLAPSE_CRACK);
    pool.playTone(VOID_AUDIO_PRESETS.SINGULARITY_SUB_IMPLOSION);
    this.playFilteredNoiseBurst(0.50, 1400, 40, 0.35, 3.8);
  }

  // ============================================================================
  // Additional Combat & Atmosphere Methods
  // ============================================================================
  public playAvatarShieldShatter(nowMs: number = Date.now()): void {
    if (nowMs - this.lastShatterMs < 150) return;
    this.lastShatterMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.AVATAR_SHIELD_SHATTER);
    this.playFilteredNoiseBurst(0.22, 2800, 500, 0.20, 3.2);
  }

  public playAvatarHit(nowMs: number = Date.now()): void {
    if (nowMs - this.lastAvatarHitMs < 120) return;
    this.lastAvatarHitMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.AVATAR_HIT_THUD);
    this.playFilteredNoiseBurst(0.15, 1200, 400, 0.12, 2.5);
  }

  public playAvatarDefeat(nowMs: number = Date.now()): void {
    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.AVATAR_DEFEAT_CHIME);
    pool.playTone(VOID_AUDIO_PRESETS.SUPERNOVA_CLEANSE_CHIME);
    this.playFilteredNoiseBurst(0.35, 1800, 300, 0.18, 2.8);
  }

  public playVoidCreepSpread(nowMs: number = Date.now()): void {
    if (nowMs - this.lastCreepWhisperMs < 200) return;
    this.lastCreepWhisperMs = nowMs;

    const pool = this.getPool();
    if (!pool) return;

    pool.playTone(VOID_AUDIO_PRESETS.VOID_CREEP_WHISPER);
    this.playFilteredNoiseBurst(0.10, 1000, 300, 0.05, 2.0);
  }

  // ============================================================================
  // Central FSM Stage & Threat Orchestration Dispatcher
  // ============================================================================
  /**
   * Overloaded dispatcher matching CrisisStage progression:
   * Supports:
   * (stage, threatMeter?, nowMs?)
   * (stage, voidCreepCount, threatMeter, singularityThreshold, nowMs?)
   */
  public playVoidCrisisState(
    stage: CrisisStage,
    arg2: number = 0,
    arg3: number = 0,
    arg4: number = 72,
    arg5: number = Date.now()
  ): void {
    let voidCreepCount = 0;
    let threatMeter = 0;
    let singularityThreshold = 72;
    let nowMs = Date.now();

    if (arguments.length <= 3) {
      // Called as (stage, threatMeter, nowMs)
      threatMeter = arg2;
      nowMs = Number.isFinite(arg3) && arg3 > 0 ? arg3 : Date.now();
    } else {
      // Called as (stage, voidCreepCount, threatMeter, singularityThreshold, nowMs)
      voidCreepCount = arg2;
      threatMeter = arg3;
      singularityThreshold = arg4 > 0 ? arg4 : 72;
      nowMs = Number.isFinite(arg5) && arg5 > 0 ? arg5 : Date.now();
    }

    if (stage === CrisisStage.WHISPERS) {
      this.playSubspaceVoidHum(0.35, nowMs);
    } else if (stage === CrisisStage.OUTBREAK) {
      const intensity = 0.5 + Math.min(0.5, threatMeter / 100);
      this.playSubspaceVoidHum(intensity, nowMs);

      // Warning when approaching singularity collapse (>= 75% threshold)
      if (voidCreepCount >= singularityThreshold * 0.75 && voidCreepCount > 0) {
        this.playSingularityImplosionAlert(nowMs);
      }
    } else if (stage === CrisisStage.CLIMAX) {
      this.playSubspaceVoidHum(1.0, nowMs);
      if (voidCreepCount >= singularityThreshold * 0.70 && voidCreepCount > 0) {
        this.playSingularityImplosionAlert(nowMs);
      }
    } else if (stage === CrisisStage.RESOLVED) {
      this.playSupernovaCleanse(nowMs);
    } else if (stage === CrisisStage.FAILED) {
      this.playSingularityCollapse(nowMs);
    }
  }

  // ============================================================================
  // Zero-Leak Noise Burst Engine
  // ============================================================================
  /**
   * Synthesizes transient filtered white noise with guaranteed Dual Cleanup:
   * 1. source.onended event callback
   * 2. safeTimeout watchdog timer fallback
   */
  public playFilteredNoiseBurst(
    duration: number = 0.20,
    startFilterFreq: number = 1800,
    endFilterFreq: number = 600,
    peakGain: number = 0.15,
    q: number = 2.5
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0.20;
      const safeStartFreq = Number.isFinite(startFilterFreq) ? startFilterFreq : 1800;
      const safeEndFreq = Number.isFinite(endFilterFreq) ? endFilterFreq : 600;
      const safePeakGain = Number.isFinite(peakGain) ? peakGain : 0.15;
      const safeQ = Number.isFinite(q) ? q : 2.5;

      const now = ctx.currentTime;
      const noiseBuffer = this.getSharedNoiseBuffer(ctx);
      if (!noiseBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.max(20, safeStartFreq), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, safeEndFreq), now + safeDuration);
      filter.Q.setValueAtTime(safeQ, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.min(1.0, Math.max(0.001, safePeakGain)), now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + safeDuration);

      // Routing: source -> filter -> gain -> destination
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      this.activeTransientNodes.add(source);
      this.activeTransientNodes.add(filter);
      this.activeTransientNodes.add(gain);

      let tid: ReturnType<typeof setTimeout> | null = null;
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (tid !== null) {
          clearTimeout(tid);
          this.activeTimeouts.delete(tid);
          tid = null;
        }
        try {
          source.onended = null;
          try {
            if (typeof source.stop === 'function') source.stop();
          } catch {}
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {}
        this.activeTransientNodes.delete(source);
        this.activeTransientNodes.delete(filter);
        this.activeTransientNodes.delete(gain);
      };

      source.onended = cleanup;
      tid = this.safeTimeout(cleanup, Math.ceil((safeDuration + 0.05) * 1000));

      try {
        source.start(now);
        source.stop(now + safeDuration);
      } catch {
        cleanup();
      }
    } catch {}
  }

  public getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      if (
        VoidCrisisAudio.cachedNoiseBuffer &&
        VoidCrisisAudio.cachedNoiseSampleRate === ctx.sampleRate
      ) {
        return VoidCrisisAudio.cachedNoiseBuffer;
      }

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * 0.5); // 500ms
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      VoidCrisisAudio.cachedNoiseBuffer = buffer;
      VoidCrisisAudio.cachedNoiseSampleRate = sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  public getActiveTransientNodeCount(): number {
    return this.activeTransientNodes.size;
  }

  public getActiveTimeoutCount(): number {
    return this.activeTimeouts.size;
  }

  private safeTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.activeTimeouts.delete(timer);
      fn();
    }, delayMs);
    this.activeTimeouts.add(timer);
    return timer;
  }

  public clearPendingNodes(): void {
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
  }

  public stop(): void {
    this.clearPendingNodes();
    if (this.pool) {
      this.pool.stop();
    }
  }

  public reset(): void {
    this.stop();
    this.lastHumSoundMs = -Infinity;
    this.lastRiftHumMs = -Infinity;
    this.lastPrismChimeMs = -Infinity;
    this.lastPrismHitMs = -Infinity;
    this.lastPrismChargedMs = -Infinity;
    this.lastSupernovaMs = -Infinity;
    this.lastCleanseMs = -Infinity;
    this.lastSingularityMs = -Infinity;
    this.lastShatterMs = -Infinity;
    this.lastAvatarHitMs = -Infinity;
    this.lastCreepWhisperMs = -Infinity;
  }

  public destroy(): void {
    this.clearPendingNodes();
    if (this.ownsPool && this.pool) {
      this.pool.destroy();
      this.pool = null;
    }
    this.ctx = null;
    if (VoidCrisisAudio.instance === this) {
      VoidCrisisAudio.instance = null;
    }
  }
}

// Export singleton instance and resetInstance helper
export const voidCrisisAudio: VoidCrisisAudio = VoidCrisisAudio.getInstance();
export const resetInstance = VoidCrisisAudio.resetInstance.bind(VoidCrisisAudio);

