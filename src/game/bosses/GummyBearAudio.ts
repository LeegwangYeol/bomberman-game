/**
 * GummyBearAudio.ts — Procedural Web Audio Sound Synthesizer for King Gummy Bear (Colossus of Gelatin)
 *
 * Implements 100% Procedural Sound Synthesis for the Confectionary Arena Sovereign:
 * - Gelatinous March & Ponderous Wobble: Low-frequency rubbery wobble (82Hz -> 48Hz) & liquid footstep squelch
 *   (165Hz -> 72Hz triangle with 380Hz bandpass) paired with lowpass squelch noise.
 * - Royal Jelly Bounce (Parabolic Leap Launch): Springy upward rubber boing (95Hz -> 380Hz exponential pitch ascent)
 *   and highpass air elasticity whoosh (800Hz -> 1600Hz).
 * - Sugar Crush Touchdown & Pancake Squash: Seismic ground shockwave (45Hz -> 18Hz) & viscous pancake splatter
 *   (260Hz -> 45Hz saw) with confectionary crater crunch noise burst.
 * - Masterplay Lure Landing Stun (Landing on Primed Bomb): Comic rubber twang (440Hz -> 180Hz) + dazed stars
 *   cartoon wobble arpeggio (C6 1046.5Hz, E6 1318.5Hz, G6 1567.98Hz).
 * - Thick Gelatin Blast Deflection: Rubbery absorption pop (320Hz -> 160Hz) with resonant bandpass filter.
 * - Jelly Budding / Minion Cub Spawns: High-viscosity mitotic bubble chirps (280Hz -> 560Hz sine & 440Hz -> 880Hz triangle).
 * - Phase Transitions: Phase 2 Sugar Rush C-Major triad (C4 261.63Hz, E4 329.63Hz, G4 392.00Hz),
 *   Phase 3 Berserk Frenzy gummy roar (98Hz -> 196Hz saw + 196Hz -> 392Hz square).
 * - Defeat Gelatin Dissolution & Solfeggio 528Hz Peace Bloom: Tragic gelatin melting/deflating downward slide
 *   (350Hz -> 32Hz over 1.6s) resolving into the sacred Solfeggio 528Hz Sweet Gelatin Peace Bloom (C4, E4, G4, 528.00Hz).
 *
 * Strict Zero-Leak & Zero-GC Guarantees:
 * - Tone events routed strictly through pre-allocated 16-voice AudioVoicePool.
 * - Static shared 500ms AudioBuffer for white noise permanently avoids heap GC allocations.
 * - Transient noise nodes employ dual cleanup (source.onended + watchdog safeTimeout) and active tracking.
 * - Full SSR & Headless fallback: 100% crash-free when window or AudioContext is undefined.
 * - Subnormal float protection: prevents DSP stalls on float denormals (< 1e-15).
 */

import { AudioVoicePool, type AudioVoiceToneParams } from '../pooling/AudioVoicePool.ts';

// Deep-freeze helper for immutable preset dictionaries
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
 * Immutable frozen preset dictionary for King Gummy Bear audio synthesis
 */
export const GUMMY_BEAR_AUDIO_PRESETS = deepFreezePresets({
  // ============================================================================
  // 1. Gelatinous March & Ponderous Wobble
  // ============================================================================
  MARCH_WOBBLE_SUB: {
    type: 'sine',
    frequency: 82.0,
    frequencyRamp: { target: 48.0, duration: 0.22, exponential: true },
    gain: 0.32,
    duration: 0.26,
    attackTime: 0.02,
    decayTime: 0.10,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 140, q: 2.0 },
  } as AudioVoiceToneParams,

  MARCH_SQUELCH_BODY: {
    type: 'triangle',
    frequency: 165.0,
    frequencyRamp: { target: 72.0, duration: 0.12, exponential: true },
    gain: 0.26,
    duration: 0.18,
    attackTime: 0.005,
    decayTime: 0.07,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 380, q: 2.5 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 2. Royal Jelly Bounce (Parabolic Leap Launch)
  // ============================================================================
  LEAP_LAUNCH_BOING: {
    type: 'sine',
    frequency: 95.0,
    frequencyRamp: { target: 380.0, duration: 0.28, exponential: true },
    gain: 0.42,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.40,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 520, q: 3.0 },
  } as AudioVoiceToneParams,

  LEAP_AIR_WHOOSH: {
    type: 'sawtooth',
    frequency: 520.0,
    frequencyRamp: { target: 110.0, duration: 0.38, exponential: true },
    gain: 0.30,
    duration: 0.45,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.22,
    filter: { type: 'lowpass', frequency: 650, q: 2.2, rampTarget: 180, rampDuration: 0.38 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 3. Sugar Crush Touchdown & Pancake Squash
  // ============================================================================
  CRUSH_IMPACT_SUB: {
    type: 'sine',
    frequency: 45.0,
    frequencyRamp: { target: 18.0, duration: 0.45, exponential: true },
    gain: 0.50,
    duration: 0.55,
    attackTime: 0.003,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.28,
    filter: { type: 'lowpass', frequency: 90, q: 1.8 },
  } as AudioVoiceToneParams,

  PANCAKE_SPLAT_BODY: {
    type: 'sawtooth',
    frequency: 260.0,
    frequencyRamp: { target: 45.0, duration: 0.20, exponential: true },
    gain: 0.44,
    duration: 0.30,
    attackTime: 0.004,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.14,
    filter: { type: 'bandpass', frequency: 420, q: 2.8, rampTarget: 110, rampDuration: 0.20 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 4. Masterplay Lure Landing Stun (Landing on Primed Bomb)
  // ============================================================================
  LURE_STUN_TWANG: {
    type: 'triangle',
    frequency: 440.0,
    frequencyRamp: { target: 180.0, duration: 0.25, exponential: true },
    gain: 0.45,
    duration: 0.35,
    attackTime: 0.002,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 880, q: 4.2 },
  } as AudioVoiceToneParams,

  DAZED_STARS_C6: {
    type: 'sine',
    frequency: 1046.50, // C6
    gain: 0.24,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
  } as AudioVoiceToneParams,

  DAZED_STARS_E6: {
    type: 'sine',
    frequency: 1318.51, // E6
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
  } as AudioVoiceToneParams,

  DAZED_STARS_G6: {
    type: 'triangle',
    frequency: 1567.98, // G6
    gain: 0.20,
    duration: 0.40,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  // ============================================================================
  // 5. Blast Absorbed / Deflected (Thick Gelatin Skin)
  // ============================================================================
  GELATIN_DEFLECT_POP: {
    type: 'triangle',
    frequency: 320.0,
    frequencyRamp: { target: 160.0, duration: 0.09, exponential: true },
    gain: 0.38,
    duration: 0.15,
    attackTime: 0.002,
    decayTime: 0.06,
    sustainLevel: 0.20,
    releaseTime: 0.07,
    filter: { type: 'bandpass', frequency: 640, q: 3.2 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 6. Jelly Budding / Minion Cub Spawns
  // ============================================================================
  MINION_BUD_POP_LOW: {
    type: 'sine',
    frequency: 280.0,
    frequencyRamp: { target: 560.0, duration: 0.10, exponential: true },
    gain: 0.30,
    duration: 0.16,
    attackTime: 0.005,
    decayTime: 0.06,
    sustainLevel: 0.25,
    releaseTime: 0.08,
  } as AudioVoiceToneParams,

  MINION_BUD_POP_HIGH: {
    type: 'triangle',
    frequency: 440.0,
    frequencyRamp: { target: 880.0, duration: 0.12, exponential: true },
    gain: 0.22,
    duration: 0.18,
    attackTime: 0.005,
    decayTime: 0.07,
    sustainLevel: 0.20,
    releaseTime: 0.09,
    filter: { type: 'bandpass', frequency: 1200, q: 2.8 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 7. Phase Transitions
  // ============================================================================
  PHASE2_SUGAR_RUSH_C4: {
    type: 'triangle',
    frequency: 261.63, // C4
    frequencyRamp: { target: 523.25, duration: 0.32, exponential: true },
    gain: 0.26,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 600, q: 2.4 },
  } as AudioVoiceToneParams,

  PHASE2_SUGAR_RUSH_E4: {
    type: 'sine',
    frequency: 329.63, // E4
    frequencyRamp: { target: 659.25, duration: 0.32, exponential: true },
    gain: 0.24,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE2_SUGAR_RUSH_G4: {
    type: 'sine',
    frequency: 392.00, // G4
    gain: 0.22,
    duration: 0.42,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_GUMMY_LOW: {
    type: 'sawtooth',
    frequency: 98.0,
    frequencyRamp: { target: 196.0, duration: 0.45, exponential: true },
    gain: 0.40,
    duration: 0.55,
    attackTime: 0.02,
    decayTime: 0.20,
    sustainLevel: 0.50,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 320, q: 3.5, rampTarget: 640, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_GUMMY_HIGH: {
    type: 'square',
    frequency: 196.0,
    frequencyRamp: { target: 392.0, duration: 0.40, exponential: true },
    gain: 0.20,
    duration: 0.50,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 750, q: 2.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // 8. Boss Defeated & Solfeggio 528Hz Peace Bloom
  // ============================================================================
  DEFEAT_MELTING_SLIDE: {
    type: 'sine',
    frequency: 350.0,
    frequencyRamp: { target: 32.0, duration: 1.6, exponential: true },
    gain: 0.35,
    duration: 1.8,
    attackTime: 0.05,
    decayTime: 0.50,
    sustainLevel: 0.35,
    releaseTime: 0.70,
    filter: { type: 'lowpass', frequency: 450, q: 2.2, rampTarget: 60, rampDuration: 1.6 },
  } as AudioVoiceToneParams,

  PEACE_GELATIN_C4: {
    type: 'triangle',
    frequency: 261.63, // C4 root
    gain: 0.22,
    duration: 2.2,
    attackTime: 0.08,
    decayTime: 0.45,
    sustainLevel: 0.55,
    releaseTime: 0.80,
    filter: { type: 'lowpass', frequency: 800, q: 1.8 },
  } as AudioVoiceToneParams,

  PEACE_GELATIN_E4: {
    type: 'sine',
    frequency: 329.63, // E4 major 3rd
    gain: 0.20,
    duration: 2.2,
    attackTime: 0.10,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  PEACE_GELATIN_G4: {
    type: 'sine',
    frequency: 392.00, // G4 perfect 5th
    gain: 0.18,
    duration: 2.2,
    attackTime: 0.12,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  PEACE_GELATIN_528HZ: {
    type: 'triangle',
    frequency: 528.00, // Solfeggio 528Hz Transformation / Miracles Harmony
    gain: 0.28,
    duration: 2.5,
    attackTime: 0.10,
    decayTime: 0.55,
    sustainLevel: 0.60,
    releaseTime: 1.00,
    filter: { type: 'bandpass', frequency: 528, q: 4.0 },
  } as AudioVoiceToneParams,

  // ============================================================================
  // Canonical Aliases for Comprehensive Test Battery
  // ============================================================================
  MARCH_WOBBLE_LOW: {
    type: 'sine',
    frequency: 82.0,
    frequencyRamp: { target: 48.0, duration: 0.22, exponential: true },
    gain: 0.32,
    duration: 0.26,
    attackTime: 0.02,
    decayTime: 0.10,
    sustainLevel: 0.30,
    releaseTime: 0.12,
    filter: { type: 'lowpass', frequency: 140, q: 2.0 },
  } as AudioVoiceToneParams,

  MARCH_SQUELCH_STEP: {
    type: 'triangle',
    frequency: 165.0,
    frequencyRamp: { target: 72.0, duration: 0.12, exponential: true },
    gain: 0.26,
    duration: 0.18,
    attackTime: 0.005,
    decayTime: 0.07,
    sustainLevel: 0.20,
    releaseTime: 0.08,
    filter: { type: 'bandpass', frequency: 380, q: 2.5 },
  } as AudioVoiceToneParams,

  ROYAL_JELLY_LEAP_LAUNCH: {
    type: 'sine',
    frequency: 95.0,
    frequencyRamp: { target: 380.0, duration: 0.28, exponential: true },
    gain: 0.42,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.40,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 520, q: 3.0 },
  } as AudioVoiceToneParams,

  ROYAL_JELLY_AIR_WHISTLE: {
    type: 'sawtooth',
    frequency: 520.0,
    frequencyRamp: { target: 110.0, duration: 0.38, exponential: true },
    gain: 0.30,
    duration: 0.45,
    attackTime: 0.03,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.22,
    filter: { type: 'lowpass', frequency: 650, q: 2.2, rampTarget: 180, rampDuration: 0.38 },
  } as AudioVoiceToneParams,

  SUGAR_CRUSH_SUB_SLAM: {
    type: 'sine',
    frequency: 45.0,
    frequencyRamp: { target: 18.0, duration: 0.45, exponential: true },
    gain: 0.50,
    duration: 0.55,
    attackTime: 0.003,
    decayTime: 0.20,
    sustainLevel: 0.30,
    releaseTime: 0.28,
    filter: { type: 'lowpass', frequency: 90, q: 1.8 },
  } as AudioVoiceToneParams,

  PANCAKE_SQUASH_SPLASH: {
    type: 'sawtooth',
    frequency: 260.0,
    frequencyRamp: { target: 45.0, duration: 0.20, exponential: true },
    gain: 0.44,
    duration: 0.30,
    attackTime: 0.004,
    decayTime: 0.10,
    sustainLevel: 0.25,
    releaseTime: 0.14,
    filter: { type: 'bandpass', frequency: 420, q: 2.8, rampTarget: 110, rampDuration: 0.20 },
  } as AudioVoiceToneParams,

  LURE_LANDING_DEFLECT: {
    type: 'triangle',
    frequency: 440.0,
    frequencyRamp: { target: 180.0, duration: 0.25, exponential: true },
    gain: 0.45,
    duration: 0.35,
    attackTime: 0.002,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
    filter: { type: 'bandpass', frequency: 880, q: 4.2 },
  } as AudioVoiceToneParams,

  DAZED_GELATIN_C6: {
    type: 'sine',
    frequency: 1046.50,
    gain: 0.24,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
  } as AudioVoiceToneParams,

  DAZED_GELATIN_E6: {
    type: 'sine',
    frequency: 1318.51,
    gain: 0.22,
    duration: 0.35,
    attackTime: 0.01,
    decayTime: 0.12,
    sustainLevel: 0.25,
    releaseTime: 0.18,
  } as AudioVoiceToneParams,

  DAZED_GELATIN_G6: {
    type: 'triangle',
    frequency: 1567.98,
    gain: 0.20,
    duration: 0.40,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  GELATIN_ABSORB_POP: {
    type: 'triangle',
    frequency: 320.0,
    frequencyRamp: { target: 160.0, duration: 0.09, exponential: true },
    gain: 0.38,
    duration: 0.15,
    attackTime: 0.002,
    decayTime: 0.06,
    sustainLevel: 0.20,
    releaseTime: 0.07,
    filter: { type: 'bandpass', frequency: 640, q: 3.2 },
  } as AudioVoiceToneParams,

  MINION_CUB_POP: {
    type: 'sine',
    frequency: 280.0,
    frequencyRamp: { target: 560.0, duration: 0.10, exponential: true },
    gain: 0.30,
    duration: 0.16,
    attackTime: 0.005,
    decayTime: 0.06,
    sustainLevel: 0.25,
    releaseTime: 0.08,
  } as AudioVoiceToneParams,

  PHASE2_SUGAR_SURGE_C4: {
    type: 'triangle',
    frequency: 261.63,
    frequencyRamp: { target: 523.25, duration: 0.32, exponential: true },
    gain: 0.26,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
    filter: { type: 'bandpass', frequency: 600, q: 2.4 },
  } as AudioVoiceToneParams,

  PHASE2_SUGAR_SURGE_E4: {
    type: 'sine',
    frequency: 329.63,
    frequencyRamp: { target: 659.25, duration: 0.32, exponential: true },
    gain: 0.24,
    duration: 0.45,
    attackTime: 0.015,
    decayTime: 0.15,
    sustainLevel: 0.35,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE2_SUGAR_SURGE_G4: {
    type: 'sine',
    frequency: 392.00,
    gain: 0.22,
    duration: 0.42,
    attackTime: 0.01,
    decayTime: 0.14,
    sustainLevel: 0.30,
    releaseTime: 0.20,
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_JELLY_LOW: {
    type: 'sawtooth',
    frequency: 98.0,
    frequencyRamp: { target: 196.0, duration: 0.45, exponential: true },
    gain: 0.40,
    duration: 0.55,
    attackTime: 0.02,
    decayTime: 0.20,
    sustainLevel: 0.50,
    releaseTime: 0.25,
    filter: { type: 'bandpass', frequency: 320, q: 3.5, rampTarget: 640, rampDuration: 0.45 },
  } as AudioVoiceToneParams,

  PHASE3_BERSERK_JELLY_HIGH: {
    type: 'square',
    frequency: 196.0,
    frequencyRamp: { target: 392.0, duration: 0.40, exponential: true },
    gain: 0.20,
    duration: 0.50,
    attackTime: 0.02,
    decayTime: 0.18,
    sustainLevel: 0.40,
    releaseTime: 0.25,
    filter: { type: 'lowpass', frequency: 750, q: 2.0 },
  } as AudioVoiceToneParams,

  DEFEAT_MELT_SLIDE: {
    type: 'sine',
    frequency: 350.0,
    frequencyRamp: { target: 32.0, duration: 1.6, exponential: true },
    gain: 0.35,
    duration: 1.8,
    attackTime: 0.05,
    decayTime: 0.50,
    sustainLevel: 0.35,
    releaseTime: 0.70,
    filter: { type: 'lowpass', frequency: 450, q: 2.2, rampTarget: 60, rampDuration: 1.6 },
  } as AudioVoiceToneParams,

  GELATIN_PEACE_C4: {
    type: 'triangle',
    frequency: 261.63,
    gain: 0.22,
    duration: 2.2,
    attackTime: 0.08,
    decayTime: 0.45,
    sustainLevel: 0.55,
    releaseTime: 0.80,
    filter: { type: 'lowpass', frequency: 800, q: 1.8 },
  } as AudioVoiceToneParams,

  GELATIN_PEACE_E4: {
    type: 'sine',
    frequency: 329.63,
    gain: 0.20,
    duration: 2.2,
    attackTime: 0.10,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  GELATIN_PEACE_G4: {
    type: 'sine',
    frequency: 392.00,
    gain: 0.18,
    duration: 2.2,
    attackTime: 0.12,
    decayTime: 0.45,
    sustainLevel: 0.50,
    releaseTime: 0.80,
  } as AudioVoiceToneParams,

  GELATIN_PEACE_528HZ: {
    type: 'triangle',
    frequency: 528.00,
    gain: 0.28,
    duration: 2.5,
    attackTime: 0.10,
    decayTime: 0.55,
    sustainLevel: 0.60,
    releaseTime: 1.00,
    filter: { type: 'bandpass', frequency: 528, q: 4.0 },
  } as AudioVoiceToneParams,
});

export class GummyBearAudio {
  private static instance: GummyBearAudio | null = null;

  private voicePool: AudioVoicePool | null = null;
  private audioContext: AudioContext | null = null;
  private ownsPool: boolean = false;
  private isDestroyed: boolean = false;

  // Static cached white noise buffer for Zero-GC procedural synthesis
  private static cachedNoiseBuffer: AudioBuffer | null = null;
  private static cachedNoiseSampleRate: number = 0;

  // Active tracking for Zero-Leak transient audio nodes and watchdog timeouts
  private readonly activeTransientNodes: Set<AudioNode> = new Set();
  private readonly activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  // Rate-limiting debounce timestamps (ms)
  private lastMarchMs: number = 0;
  private lastLeapMs: number = 0;
  private lastLandingMs: number = 0;
  private lastDeflectMs: number = 0;
  private lastBudSpawnMs: number = 0;
  private lastPhaseTransitionMs: number = 0;
  private lastPeaceBloomMs: number = 0;

  constructor(poolOrCtx?: AudioVoicePool | AudioContext | null, pool?: AudioVoicePool | null) {
    const isPool = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      'playTone' in poolOrCtx &&
      typeof (poolOrCtx as { playTone?: unknown }).playTone === 'function'
    );
    const isCtx = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      ('createOscillator' in poolOrCtx || 'currentTime' in poolOrCtx || 'destination' in poolOrCtx)
    );

    if (isPool) {
      this.bindPool(poolOrCtx as AudioVoicePool);
    } else if (isCtx) {
      this.init(poolOrCtx as AudioContext, pool || undefined);
    } else if (pool) {
      this.bindPool(pool);
    } else {
      try {
        this.voicePool = AudioVoicePool.getInstance(16);
      } catch {
        this.voicePool = null;
      }
    }
  }

  public static getInstance(poolOrCtx?: AudioVoicePool | AudioContext | null): GummyBearAudio {
    const isPool = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      'playTone' in poolOrCtx &&
      typeof (poolOrCtx as { playTone?: unknown }).playTone === 'function'
    );
    const isCtx = Boolean(
      poolOrCtx &&
      typeof poolOrCtx === 'object' &&
      ('createOscillator' in poolOrCtx || 'currentTime' in poolOrCtx || 'destination' in poolOrCtx)
    );

    if (!GummyBearAudio.instance) {
      GummyBearAudio.instance = new GummyBearAudio(poolOrCtx);
    } else if (isPool) {
      GummyBearAudio.instance.bindPool(poolOrCtx as AudioVoicePool);
    } else if (isCtx && !GummyBearAudio.instance.audioContext) {
      GummyBearAudio.instance.init(poolOrCtx as AudioContext);
    }
    return GummyBearAudio.instance;
  }

  public static resetInstance(): void {
    if (GummyBearAudio.instance) {
      GummyBearAudio.instance.destroy();
      GummyBearAudio.instance = null;
    }
    GummyBearAudio.cachedNoiseBuffer = null;
    GummyBearAudio.cachedNoiseSampleRate = 0;
  }

  public init(ctx: AudioContext, pool?: AudioVoicePool): void {
    this.audioContext = ctx;
    if (pool) {
      this.voicePool = pool;
      this.ownsPool = false;
    } else if (!this.voicePool) {
      this.voicePool = new AudioVoicePool(16);
      this.voicePool.init(ctx);
      this.ownsPool = true;
    } else {
      this.voicePool.init(ctx);
    }

    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {}
    }
  }

  public bindPool(pool: AudioVoicePool): void {
    if (this.ownsPool && this.voicePool && this.voicePool !== pool && typeof this.voicePool.destroy === 'function') {
      this.voicePool.destroy();
    }
    this.voicePool = pool;
    this.ownsPool = false;
    if (typeof pool.getAudioContext === 'function') {
      this.audioContext = pool.getAudioContext();
    } else if (typeof (pool as unknown as { getContext?: () => AudioContext | null }).getContext === 'function') {
      this.audioContext = (pool as unknown as { getContext: () => AudioContext | null }).getContext();
    }
  }

  public setVoicePool(pool: AudioVoicePool | null): void {
    if (pool) {
      this.bindPool(pool);
    } else {
      this.voicePool = null;
    }
  }

  public setAudioContext(ctx: AudioContext | null): void {
    this.audioContext = ctx;
  }

  public getVoicePool(): AudioVoicePool | null {
    if (this.voicePool) return this.voicePool;
    try {
      this.voicePool = AudioVoicePool.getInstance(16);
      return this.voicePool;
    } catch {
      return null;
    }
  }

  public getAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    if (this.voicePool) {
      const poolCtx = this.voicePool.getAudioContext();
      if (poolCtx) {
        this.audioContext = poolCtx;
        return this.audioContext;
      }
    }
    if (typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
          return this.audioContext;
        } catch {}
      }
    }
    return null;
  }

  // ============================================================================
  // PROCEDURAL SOUND ROUTINES
  // ============================================================================

  public playMarchWobble(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastMarchMs > 0 && nowMs - this.lastMarchMs < 140) return false;
    this.lastMarchMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.MARCH_WOBBLE_SUB);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.MARCH_SQUELCH_BODY);
    }
    this.playProceduralNoiseBurst(0.12, 450, 150, 0.14, 'lowpass');
    return true;
  }

  public playPonderousMarch(nowMs: number = Date.now()): boolean {
    return this.playMarchWobble(nowMs);
  }

  public playGelatinMarch(nowMs: number = Date.now()): boolean {
    return this.playMarchWobble(nowMs);
  }

  public playRoyalLeapLaunch(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastLeapMs > 0 && nowMs - this.lastLeapMs < 200) return false;
    this.lastLeapMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.LEAP_LAUNCH_BOING);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.LEAP_AIR_WHOOSH);
    }
    this.playProceduralNoiseBurst(0.28, 800, 1600, 0.18, 'bandpass');
    return true;
  }

  public playRoyalJellyBounce(nowMs: number = Date.now()): boolean {
    return this.playRoyalLeapLaunch(nowMs);
  }

  public playRoyalLeapBounce(nowMs: number = Date.now()): boolean {
    return this.playRoyalLeapLaunch(nowMs);
  }

  public playSugarCrushLanding(hasBombOnLandingTile: boolean = false, nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastLandingMs > 0 && nowMs - this.lastLandingMs < 200) return false;
    this.lastLandingMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.CRUSH_IMPACT_SUB);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PANCAKE_SPLAT_BODY);

      if (hasBombOnLandingTile) {
        // Masterplay Lure Landing: Twang + comic stars arpeggio
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.LURE_STUN_TWANG);
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.DAZED_STARS_C6);
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.DAZED_STARS_E6);
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.DAZED_STARS_G6);
      }
    }

    const noiseDur = hasBombOnLandingTile ? 0.40 : 0.28;
    const peakGain = hasBombOnLandingTile ? 0.32 : 0.24;
    this.playProceduralNoiseBurst(noiseDur, 650, 120, peakGain, 'lowpass');
    return true;
  }

  public playSugarCrushSlam(hasBombOnLandingTile: boolean = false, nowMs: number = Date.now()): boolean {
    return this.playSugarCrushLanding(hasBombOnLandingTile, nowMs);
  }

  public playPancakeSquash(nowMs: number = Date.now()): boolean {
    return this.playSugarCrushLanding(false, nowMs);
  }

  public playMasterplayLureStun(nowMs: number = Date.now()): boolean {
    return this.playSugarCrushLanding(true, nowMs);
  }

  public playDamageBlocked(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastDeflectMs > 0 && nowMs - this.lastDeflectMs < 100) return false;
    this.lastDeflectMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.GELATIN_DEFLECT_POP);
    }
    this.playProceduralNoiseBurst(0.08, 1200, 300, 0.15, 'bandpass');
    return true;
  }

  public playGelatinArmorDeflection(nowMs: number = Date.now()): boolean {
    return this.playDamageBlocked(nowMs);
  }

  public playGelatinSkinDeflection(nowMs: number = Date.now()): boolean {
    return this.playDamageBlocked(nowMs);
  }

  public playGelatinAbsorb(nowMs: number = Date.now()): boolean {
    return this.playDamageBlocked(nowMs);
  }

  public playJellyBudSpawn(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastBudSpawnMs > 0 && nowMs - this.lastBudSpawnMs < 120) return false;
    this.lastBudSpawnMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.MINION_BUD_POP_LOW);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.MINION_BUD_POP_HIGH);
    }
    this.playProceduralNoiseBurst(0.12, 1400, 400, 0.16, 'bandpass');
    return true;
  }

  public playMinionCubSpawn(nowMs: number = Date.now()): boolean {
    return this.playJellyBudSpawn(nowMs);
  }

  public playMinionCubPop(nowMs: number = Date.now()): boolean {
    return this.playJellyBudSpawn(nowMs);
  }

  public playMinionDefeated(nowMs: number = Date.now()): boolean {
    return this.playJellyBudSpawn(nowMs);
  }

  public playPhaseTransition(phase: number = 2, nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastPhaseTransitionMs > 0 && nowMs - this.lastPhaseTransitionMs < 300) return false;
    this.lastPhaseTransitionMs = nowMs;

    const pool = this.getVoicePool();
    if (phase === 2) {
      if (pool) {
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PHASE2_SUGAR_RUSH_C4);
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PHASE2_SUGAR_RUSH_E4);
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PHASE2_SUGAR_RUSH_G4);
      }
      this.playProceduralNoiseBurst(0.35, 900, 1800, 0.22, 'bandpass');
      return true;
    } else {
      if (pool) {
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PHASE3_BERSERK_GUMMY_LOW);
        pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PHASE3_BERSERK_GUMMY_HIGH);
      }
      this.playProceduralNoiseBurst(0.50, 500, 1200, 0.30, 'bandpass');
      return true;
    }
  }

  public playPhaseEnrageRoar(nowMs: number = Date.now()): boolean {
    return this.playPhaseTransition(3, nowMs);
  }

  public playBossDefeated(nowMs: number = Date.now()): boolean {
    if (this.isDestroyed) return false;
    if (this.lastPeaceBloomMs > 0 && nowMs - this.lastPeaceBloomMs < 1000) return false;
    this.lastPeaceBloomMs = nowMs;

    const pool = this.getVoicePool();
    if (pool) {
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.DEFEAT_MELTING_SLIDE);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_C4);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_E4);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_G4);
      pool.playTone(GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_528HZ);
    }
    this.playProceduralNoiseBurst(1.0, 800, 100, 0.20, 'lowpass');
    return true;
  }

  public playDefeatGelatinDissolution(nowMs: number = Date.now()): boolean {
    return this.playBossDefeated(nowMs);
  }

  public playDefeatPeaceHarmonic(nowMs: number = Date.now()): boolean {
    return this.playBossDefeated(nowMs);
  }

  // ============================================================================
  // ZERO-GC PROCEDURAL NOISE BURST WITH DUAL WATCHDOG
  // ============================================================================

  public playProceduralNoiseBurst(
    duration: number = 0.25,
    startFilterFreq: number = 1000,
    endFilterFreq: number = 250,
    peakGain: number = 0.25,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    if (this.isDestroyed) return false;
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 1e-6 ||
      duration > 300 ||
      typeof peakGain !== 'number' ||
      !Number.isFinite(peakGain) ||
      peakGain <= 1e-15
    ) {
      return false;
    }

    const ctx = this.getAudioContext();
    if (!ctx || typeof ctx.createBufferSource !== 'function') return false;

    try {
      const now = ctx.currentTime || 0;
      const noiseBuffer = this.getSharedNoiseBuffer(ctx);
      if (!noiseBuffer) return false;

      const safeStartFreq = Number.isFinite(startFilterFreq) ? startFilterFreq : 1000;
      const safeEndFreq = Number.isFinite(endFilterFreq) ? endFilterFreq : 250;

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(20, safeStartFreq), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, safeEndFreq), now + duration);
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.min(1.0, peakGain), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

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
      tid = this.safeTimeout(cleanup, Math.ceil((duration + 0.05) * 1000));

      try {
        source.start(now);
        source.stop(now + duration);
      } catch {
        cleanup();
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public playFilteredNoiseBurst(
    duration: number = 0.25,
    startFilterFreq: number = 1000,
    endFilterFreq: number = 250,
    peakGain: number = 0.25,
    filterType: BiquadFilterType = 'bandpass'
  ): boolean {
    return this.playProceduralNoiseBurst(
      duration,
      startFilterFreq,
      endFilterFreq,
      peakGain,
      filterType
    );
  }

  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      if (
        GummyBearAudio.cachedNoiseBuffer &&
        GummyBearAudio.cachedNoiseSampleRate === ctx.sampleRate
      ) {
        return GummyBearAudio.cachedNoiseBuffer;
      }

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * 0.50);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }

      GummyBearAudio.cachedNoiseBuffer = buffer;
      GummyBearAudio.cachedNoiseSampleRate = sampleRate;
      return buffer;
    } catch {
      return null;
    }
  }

  private safeTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const tid = setTimeout(() => {
      this.activeTimeouts.delete(tid);
      fn();
    }, delayMs);
    this.activeTimeouts.add(tid);
    return tid;
  }

  public clearPendingNodes(): void {
    for (const tid of this.activeTimeouts) {
      clearTimeout(tid);
    }
    this.activeTimeouts.clear();

    for (const node of this.activeTransientNodes) {
      try {
        const sourceNode = node as unknown as { onended?: unknown; stop?: () => void };
        if ('onended' in sourceNode) sourceNode.onended = null;
        if (typeof sourceNode.stop === 'function') {
          try {
            sourceNode.stop();
          } catch {}
        }
        node.disconnect();
      } catch {}
    }
    this.activeTransientNodes.clear();
  }

  public reset(): void {
    this.clearPendingNodes();
    this.lastMarchMs = 0;
    this.lastLeapMs = 0;
    this.lastLandingMs = 0;
    this.lastDeflectMs = 0;
    this.lastBudSpawnMs = 0;
    this.lastPhaseTransitionMs = 0;
    this.lastPeaceBloomMs = 0;
  }

  public stop(): void {
    this.reset();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearPendingNodes();
    GummyBearAudio.cachedNoiseBuffer = null;
    GummyBearAudio.cachedNoiseSampleRate = 0;
    if (this.ownsPool && this.voicePool) {
      this.voicePool.destroy();
    }
    this.voicePool = null;
    this.audioContext = null;
    if (GummyBearAudio.instance === this) {
      GummyBearAudio.instance = null;
    }
  }

  public dispose(): void {
    this.destroy();
  }
}
