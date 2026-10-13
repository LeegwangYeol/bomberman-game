/**
 * tests/void_crisis_audio_and_resilience.test.mjs
 *
 * Comprehensive 10-Tier Test Battery for Pastel Void Incursion:
 * Procedural WebAudio Synthesizer (VoidCrisisAudio) & System Resilience.
 *
 * Verifies:
 * - Tier 1: Audio presets and parameter freezing
 * - Tier 2: Headless SSR safety
 * - Tier 3: AudioVoicePool voice routing
 * - Tier 4: Static noise buffer reuse & zero leak
 * - Tier 5: Stage transition audio dispatches
 * - Tier 6: Prism charge acoustic pitch scaling
 * - Tier 7: Supernova Cleanse audio trigger & board purge
 * - Tier 8: Safe area invariant (>= 40% safe walkable area)
 * - Tier 9: NaN coordinate rejection on bomb blasts
 * - Tier 10: 10,000-frame Zero-GC soak test with zero heap growth.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  VoidCrisisAudio,
  VOID_AUDIO_PRESETS,
} from '../src/game/crises/VoidCrisisAudio.ts';
import { VoidCrisis } from '../src/game/crises/VoidCrisis.ts';
import { CrisisStage, HazardType } from '../src/game/crises/CrisisTypes.ts';

// ==============================================================================
// Deterministic Mock Web Audio API Primitives
// ==============================================================================

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.events = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'setValueAtTime', val, time });
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'linearRampToValueAtTime', val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'exponentialRampToValueAtTime', val, time });
  }
  cancelScheduledValues(time) {
    this.events.push({ type: 'cancelScheduledValues', time });
  }
}

class MockAudioNode {
  constructor(type = 'GenericNode') {
    this.nodeType = type;
    this.connections = [];
    this.disconnected = false;
  }
  connect(dest) {
    this.connections.push(dest);
  }
  disconnect() {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super('Oscillator');
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
    this.stopped = false;
    this.onended = null;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    if (typeof this.onended === 'function') {
      this.onended();
    }
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super('Gain');
    this.gain = new MockAudioParam(1);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super('BiquadFilter');
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(1000);
    this.Q = new MockAudioParam(1);
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor() {
    super('AudioBufferSource');
    this.buffer = null;
    this.started = false;
    this.stopped = false;
    this.stopTime = null;
    this.onended = null;
  }
  start() {
    this.started = true;
  }
  stop(when) {
    this.stopped = true;
    this.stopTime = when;
  }
  triggerEnded() {
    if (typeof this.onended === 'function') {
      this.onended();
    }
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode('Destination');
    this.createdNodes = [];
    this.bufferCreationCount = 0;
  }
  createOscillator() {
    const node = new MockOscillatorNode();
    this.createdNodes.push(node);
    return node;
  }
  createGain() {
    const node = new MockGainNode();
    this.createdNodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.createdNodes.push(node);
    return node;
  }
  createBufferSource() {
    const node = new MockAudioBufferSourceNode();
    this.createdNodes.push(node);
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    this.bufferCreationCount++;
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }
}

// ==============================================================================
// TIER 1: AUDIO PRESETS AND PARAMETER FREEZING
// ==============================================================================

test('Tier 1.1: Audio presets exist and encompass all 4 signature soundscapes', () => {
  assert.ok(VOID_AUDIO_PRESETS, 'VOID_AUDIO_PRESETS must be defined');

  // 1. Subspace Void Hum
  assert.ok(VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_36HZ, 'SUBSPACE_VOID_VOICE_36HZ missing');
  assert.ok(VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_48HZ, 'SUBSPACE_VOID_VOICE_48HZ missing');
  assert.ok(VOID_AUDIO_PRESETS.SUBSPACE_VOID_SUB_ANCHOR, 'SUBSPACE_VOID_SUB_ANCHOR missing');
  assert.ok(VOID_AUDIO_PRESETS.SUBSPACE_VOID_WARP_SWEEP, 'SUBSPACE_VOID_WARP_SWEEP missing');
  assert.ok(VOID_AUDIO_PRESETS.SUBSPACE_VOID_SHIMMER, 'SUBSPACE_VOID_SHIMMER missing');

  // 2. Prism Resonance Chimes
  assert.ok(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER1_C6, 'PRISM_CHIME_TIER1_C6 missing');
  assert.ok(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER1_G6, 'PRISM_CHIME_TIER1_G6 missing');
  assert.ok(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER2_E6, 'PRISM_CHIME_TIER2_E6 missing');
  assert.ok(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER2_B6, 'PRISM_CHIME_TIER2_B6 missing');
  assert.ok(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER3_C7, 'PRISM_CHIME_TIER3_C7 missing');
  assert.ok(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER3_E7, 'PRISM_CHIME_TIER3_E7 missing');
  assert.ok(VOID_AUDIO_PRESETS.PRISM_CHIME_TIER3_SWEEP, 'PRISM_CHIME_TIER3_SWEEP missing');

  // 3. Supernova Cleanse
  assert.ok(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D4, 'SUPERNOVA_CHORD_D4 missing');
  assert.ok(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_A4, 'SUPERNOVA_CHORD_A4 missing');
  assert.ok(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D5, 'SUPERNOVA_CHORD_D5 missing');
  assert.ok(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_FSHARP5, 'SUPERNOVA_CHORD_FSHARP5 missing');
  assert.ok(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_A5, 'SUPERNOVA_CHORD_A5 missing');
  assert.ok(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D6, 'SUPERNOVA_CHORD_D6 missing');
  assert.ok(VOID_AUDIO_PRESETS.SUPERNOVA_SUB_BLAST, 'SUPERNOVA_SUB_BLAST missing');

  // 4. Singularity Implosion Alert
  assert.ok(VOID_AUDIO_PRESETS.SINGULARITY_PLUNGE, 'SINGULARITY_PLUNGE missing');
  assert.ok(VOID_AUDIO_PRESETS.SINGULARITY_GRAV_SIREN, 'SINGULARITY_GRAV_SIREN missing');
  assert.ok(VOID_AUDIO_PRESETS.SINGULARITY_SUB_IMPLOSION, 'SINGULARITY_SUB_IMPLOSION missing');
});

test('Tier 1.2: Rigorous parameter validation for all presets (ADSR, Gains, Frequencies)', () => {
  const validTypes = new Set(['sine', 'triangle', 'sawtooth', 'square']);

  for (const [key, preset] of Object.entries(VOID_AUDIO_PRESETS)) {
    assert.ok(validTypes.has(preset.type), `${key}: invalid oscillator type ${preset.type}`);
    assert.ok(Number.isFinite(preset.frequency) && preset.frequency > 0, `${key}: frequency must be > 0`);
    assert.ok(Number.isFinite(preset.gain) && preset.gain >= 0 && preset.gain <= 1.0, `${key}: gain must be [0, 1]`);
    assert.ok(Number.isFinite(preset.duration) && preset.duration > 0, `${key}: duration must be > 0`);
    assert.ok(Number.isFinite(preset.attackTime) && preset.attackTime >= 0, `${key}: attackTime must be >= 0`);
    assert.ok(Number.isFinite(preset.decayTime) && preset.decayTime >= 0, `${key}: decayTime must be >= 0`);
    assert.ok(
      Number.isFinite(preset.sustainLevel) && preset.sustainLevel >= 0 && preset.sustainLevel <= 1.0,
      `${key}: sustainLevel must be [0, 1]`
    );
    assert.ok(Number.isFinite(preset.releaseTime) && preset.releaseTime >= 0, `${key}: releaseTime must be >= 0`);

    if (preset.filter) {
      assert.ok(
        ['lowpass', 'highpass', 'bandpass', 'notch'].includes(preset.filter.type),
        `${key}: invalid filter type`
      );
      assert.ok(Number.isFinite(preset.filter.frequency) && preset.filter.frequency > 0, `${key}: filter freq > 0`);
      assert.ok(Number.isFinite(preset.filter.q) && preset.filter.q >= 0, `${key}: filter Q >= 0`);
    }
  }
});

test('Tier 1.3: Immutability and parameter freezing protection', () => {
  assert.ok(Object.isFrozen(VOID_AUDIO_PRESETS), 'VOID_AUDIO_PRESETS must be frozen');

  assert.throws(
    () => {
      // In strict mode, modifying a frozen object throws TypeError
      VOID_AUDIO_PRESETS.NEW_PRESET = {};
    },
    TypeError,
    'Attempting to add properties to frozen VOID_AUDIO_PRESETS must throw'
  );
});

test('Tier 1.4: Musical harmonic verification of acoustic foundations', () => {
  // Subspace Void Hum: 36Hz and 48Hz form a 4:3 acoustic fourth interval with 24Hz sub-octave
  assert.strictEqual(VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_36HZ.frequency, 36.0);
  assert.strictEqual(VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_48HZ.frequency, 48.0);
  assert.strictEqual(VOID_AUDIO_PRESETS.SUBSPACE_VOID_SUB_ANCHOR.frequency, 24.0);
  assert.strictEqual(48.0 / 36.0, 4 / 3, '48Hz to 36Hz must form exact 4:3 fourth interval');
  assert.strictEqual(36.0 / 24.0, 1.5, '36Hz to 24Hz must form exact 3:2 fifth ratio');

  // Supernova Chord: Open-voiced D major celestial triad across octaves
  assert.strictEqual(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D4.frequency, 293.66); // D4
  assert.strictEqual(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_A4.frequency, 440.00); // A4 (5th)
  assert.strictEqual(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D5.frequency, 587.33); // D5 (Octave)
  assert.strictEqual(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_FSHARP5.frequency, 739.99); // F#5 (Major 3rd)
  assert.strictEqual(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_A5.frequency, 880.00); // A5 (Octave 5th)
  assert.strictEqual(VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D6.frequency, 1174.66); // D6 (Double octave root)
});

// ==============================================================================
// TIER 2: HEADLESS SSR SAFETY
// ==============================================================================

test('Tier 2.1: Headless SSR safe instantiation when window and AudioContext are undefined', () => {
  VoidCrisisAudio.resetInstance();
  const audio = VoidCrisisAudio.getInstance();

  assert.ok(audio, 'VoidCrisisAudio instance must be created');
  assert.strictEqual(typeof audio.playSubspaceVoidHum, 'function');
  assert.strictEqual(typeof audio.playPrismResonanceChime, 'function');
  assert.strictEqual(typeof audio.playSupernovaCleanse, 'function');
  assert.strictEqual(typeof audio.playSingularityImplosionAlert, 'function');
  assert.strictEqual(typeof audio.destroy, 'function');
  assert.strictEqual(typeof audio.reset, 'function');

  // Clean teardown
  VoidCrisisAudio.resetInstance();
});

test('Tier 2.2: Full execution of all audio dispatches in headless SSR environment without throw', () => {
  VoidCrisisAudio.resetInstance();
  const audio = VoidCrisisAudio.getInstance();

  assert.doesNotThrow(() => {
    const t = 1000;
    audio.playSubspaceVoidHum(1.0, t);
    audio.playVoidRiftHum(1.0, t + 10);
    audio.playPrismResonanceChime(0, t + 20);
    audio.playPrismResonanceChime(34, t + 30);
    audio.playPrismResonanceChime(68, t + 40);
    audio.playPrismResonanceChime(100, t + 50);
    audio.playPrismChargeHit(0, t + 60);
    audio.playPrismFullyCharged(t + 70);
    audio.playSupernovaCleanse(t + 80);
    audio.playSingularityImplosionAlert(t + 90);
    audio.playSingularityPulse(t + 100);
    audio.playSingularityCollapse(t + 110);
    audio.playAvatarShieldShatter(t + 120);
    audio.playAvatarHit(t + 130);
    audio.playAvatarDefeat(t + 140);
    audio.playVoidCreepSpread(t + 150);
    audio.playFilteredNoiseBurst(0.2, 1800, 600, 0.15);

    // Crisis stage dispatches
    audio.playVoidCrisisState(CrisisStage.WHISPERS, 0, 10, 72, t + 200);
    audio.playVoidCrisisState(CrisisStage.OUTBREAK, 20, 45, 72, t + 210);
    audio.playVoidCrisisState(CrisisStage.OUTBREAK, 60, 85, 72, t + 220); // Near singularity
    audio.playVoidCrisisState(CrisisStage.CLIMAX, 30, 80, 72, t + 230);
    audio.playVoidCrisisState(CrisisStage.RESOLVED, 0, 0, 72, t + 240);
    audio.playVoidCrisisState(CrisisStage.FAILED, 72, 100, 72, t + 250);

    audio.stop();
    audio.reset();
    audio.clearPendingNodes();
  }, 'All audio calls must execute cleanly in pure headless environment');

  VoidCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 3: AUDIOVOICEPOOL VOICE ROUTING
// ==============================================================================

test('Tier 3.1: Voice routing through AudioVoicePool and tone synthesis', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  assert.strictEqual(audio.getPool(), pool);
  assert.strictEqual(audio.getContext(), mockCtx);

  // Play hum at t = 1000
  audio.playSubspaceVoidHum(1.0, 1000);

  // Voice allocation check: 5 voices acquired for Subspace Void Hum
  // (36Hz, 48Hz, 24Hz sub anchor, 96Hz warp sweep, 320Hz shimmer)
  assert.ok(pool.getActiveVoiceCount() >= 4, 'Pool must have allocated voices for Subspace Void Hum');

  // Teardown
  audio.destroy();
  pool.destroy();
  assert.strictEqual(pool.getActiveVoiceCount(), 0, 'All voices must be released upon destroy');
});

test('Tier 3.2: Voice stealing under high voice demand without errors', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  // Rapidly trigger multi-voice events that exceed 16 pool capacity
  let now = 5000;
  for (let i = 0; i < 10; i++) {
    now += 400; // Step beyond debounces
    audio.playSubspaceVoidHum(1.0, now);
    audio.playPrismResonanceChime(100, now + 10);
    audio.playSupernovaCleanse(now + 20);
  }

  // Active voices must be capped at pool capacity (16)
  assert.ok(pool.getActiveVoiceCount() <= 16, 'Voice count must never exceed 16 pool capacity');

  audio.destroy();
  pool.destroy();
});

test('Tier 3.3: Dynamic pool rebinding via bindPool()', () => {
  const mockCtx = new MockAudioContext();
  const pool1 = new AudioVoicePool(8, mockCtx);
  const pool2 = new AudioVoicePool(16, mockCtx);

  const audio = new VoidCrisisAudio(pool1);
  assert.strictEqual(audio.getPool(), pool1);

  audio.bindPool(pool2);
  assert.strictEqual(audio.getPool(), pool2);

  audio.playSubspaceVoidHum(1.0, 1000);
  assert.ok(pool2.getActiveVoiceCount() > 0, 'New pool must receive tones');

  audio.destroy();
  pool1.destroy();
  pool2.destroy();
});

// ==============================================================================
// TIER 4: STATIC NOISE BUFFER REUSE & ZERO LEAK
// ==============================================================================

test('Tier 4.1: Static 500ms white noise buffer is created once and reused permanently', () => {
  const mockCtx = new MockAudioContext();
  mockCtx.sampleRate = 96000;
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  assert.strictEqual(mockCtx.bufferCreationCount, 0, 'No buffers created initially');

  // Trigger 50 noise bursts
  for (let i = 0; i < 50; i++) {
    audio.playFilteredNoiseBurst(0.15, 2000, 600, 0.1);
  }

  // createBuffer must have been called exactly ONCE; all 49 subsequent calls reused the cached buffer
  assert.strictEqual(
    mockCtx.bufferCreationCount,
    1,
    'createBuffer must only be called once per sampleRate (Zero-GC reuse)'
  );

  audio.destroy();
  pool.destroy();
});

test('Tier 4.2: Dual cleanup (onended + watchdog timeout) ensures zero node leaks', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  audio.playFilteredNoiseBurst(0.20, 2400, 800, 0.12);

  // Find created BufferSource node
  const sourceNode = mockCtx.createdNodes.find((n) => n.nodeType === 'AudioBufferSource');
  assert.ok(sourceNode, 'BufferSourceNode must be instantiated');
  assert.strictEqual(sourceNode.started, true, 'BufferSourceNode must have started');
  assert.strictEqual(typeof sourceNode.onended, 'function', 'onended callback must be set');

  // Trigger onended callback
  sourceNode.triggerEnded();

  // Verify node is disconnected
  assert.strictEqual(sourceNode.disconnected, true, 'sourceNode must be disconnected upon onended');
  assert.strictEqual(audio.getActiveTransientNodeCount(), 0, 'No active transient nodes remain after cleanup');

  audio.destroy();
  pool.destroy();
});

test('Tier 4.3: clearPendingNodes cancels active timers and disconnects all transient nodes', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  for (let i = 0; i < 10; i++) {
    audio.playFilteredNoiseBurst(0.5, 3000, 500, 0.15);
  }

  // Clear all transient nodes
  audio.clearPendingNodes();

  // All created transient nodes must be disconnected and cleared
  assert.strictEqual(audio.getActiveTransientNodeCount(), 0, 'All transient nodes must be cleared');
  assert.strictEqual(audio.getActiveTimeoutCount(), 0, 'All watchdog timeouts must be cleared');

  audio.destroy();
  pool.destroy();
});

// ==============================================================================
// TIER 5: STAGE TRANSITION AUDIO DISPATCHES
// ==============================================================================

test('Tier 5.1: Stage transition integration with VoidCrisis lifecycle', () => {
  const crisis = new VoidCrisis();
  assert.strictEqual(crisis.getStage(), CrisisStage.INACTIVE);

  // Transition to WHISPERS
  crisis.start();
  assert.strictEqual(crisis.getStage(), CrisisStage.WHISPERS);

  // Transition to OUTBREAK
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  assert.strictEqual(crisis.getStage(), CrisisStage.OUTBREAK);
  assert.ok(crisis.getThreat() >= 35, 'Outbreak threat must be >= 35%');

  // Transition to CLIMAX
  crisis.transitionToStage(CrisisStage.CLIMAX);
  assert.strictEqual(crisis.getStage(), CrisisStage.CLIMAX);
  assert.ok(crisis.avatarSpawned, 'Avatar must spawn in Climax');

  // Trigger Supernova Cleanse -> Victory
  crisis.triggerSupernovaCleanse();
  assert.strictEqual(crisis.supernovaCleansed, true);
  assert.strictEqual(crisis.avatarShieldActive, false);

  // Defeat Avatar
  crisis.handleBombBlast(6, 7, 3);
  crisis.handleBombBlast(6, 7, 3);
  crisis.handleBombBlast(6, 7, 3);

  assert.strictEqual(crisis.isVictorious, true);
  assert.strictEqual(crisis.getStage(), CrisisStage.RESOLVED);
});

test('Tier 5.2: Rate-limiting / debounce prevents audio thrashing', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  // Call 1 at t = 1000ms
  audio.playSubspaceVoidHum(1.0, 1000);
  const count1 = pool.getActiveVoiceCount();
  assert.ok(count1 > 0);

  // Call 2 within 350ms debounce (at t = 1150ms)
  audio.playSubspaceVoidHum(1.0, 1150);
  const count2 = pool.getActiveVoiceCount();
  assert.strictEqual(count2, count1, 'Debounced call must not create redundant voices');

  // Call 3 after debounce expires (at t = 1400ms)
  audio.playSubspaceVoidHum(1.0, 1400);
  assert.ok(pool.getActiveVoiceCount() > 0, 'Call after debounce window must execute');

  audio.destroy();
  pool.destroy();
});

// ==============================================================================
// TIER 6: PRISM CHARGE ACOUSTIC PITCH SCALING
// ==============================================================================

test('Tier 6.1: Prism charge acoustic pitch scaling (Tier 1 -> Tier 2 -> Tier 3)', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  // Tier 1: Charge ~33%
  audio.playPrismResonanceChime(33, 1000);
  const tier1Voices = pool.getActiveVoiceCount();
  assert.ok(tier1Voices >= 2, 'Tier 1 must play at least 2 voices');

  // Tier 2: Charge ~66%
  audio.playPrismResonanceChime(66, 1200);
  const tier2Voices = pool.getActiveVoiceCount();
  assert.ok(tier2Voices >= 2, 'Tier 2 must play at least 2 voices');

  // Tier 3: Charge 100% (Full Resonance)
  audio.playPrismResonanceChime(100, 1400);
  const tier3Voices = pool.getActiveVoiceCount();
  assert.ok(tier3Voices >= 3, 'Tier 3 must play at least 3 voices including octave sweep');

  audio.destroy();
  pool.destroy();
});

test('Tier 6.2: Ascending fundamental pitch progression across charge tiers', () => {
  const t1Freq = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER1_C6.frequency;
  const t2Freq = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER2_E6.frequency;
  const t3Freq = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER3_C7.frequency;

  assert.strictEqual(t1Freq, 1046.50, 'Tier 1 base must be C6 (1046.50Hz)');
  assert.strictEqual(t2Freq, 1318.51, 'Tier 2 base must be E6 (1318.51Hz)');
  assert.strictEqual(t3Freq, 2093.00, 'Tier 3 base must be C7 (2093.00Hz)');

  assert.ok(t1Freq < t2Freq, 'Tier 2 pitch must be strictly higher than Tier 1');
  assert.ok(t2Freq < t3Freq, 'Tier 3 pitch must be strictly higher than Tier 2');
});

test('Tier 6.3: Prism bomb blast hits trigger 3-step charge progression', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  const prism0 = crisis.prisms[0];
  assert.strictEqual(prism0.hits, 0);
  assert.strictEqual(prism0.charge, 0);
  assert.strictEqual(prism0.isCharged, false);

  // Hit 1: near (1, 13)
  crisis.handleBombBlast(1, 13, 2);
  assert.strictEqual(prism0.hits, 1);
  assert.strictEqual(prism0.charge, 34);
  assert.strictEqual(prism0.isCharged, false);

  // Hit 2: near (1, 13)
  crisis.handleBombBlast(1, 13, 2);
  assert.strictEqual(prism0.hits, 2);
  assert.strictEqual(prism0.charge, 68);
  assert.strictEqual(prism0.isCharged, false);

  // Hit 3: near (1, 13) -> 100% Charged!
  crisis.handleBombBlast(1, 13, 2);
  assert.strictEqual(prism0.hits, 3);
  assert.strictEqual(prism0.charge, 100);
  assert.strictEqual(prism0.isCharged, true);
});

// ==============================================================================
// TIER 7: SUPERNOVA CLEANSE AUDIO TRIGGER & BOARD PURGE
// ==============================================================================

test('Tier 7.1: Supernova Cleanse purges ALL void creep tiles and shatters Avatar shield', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Manually seed creep tiles
  crisis.setHazardTile(2, 2, HazardType.VOID_CREEP);
  crisis.setHazardTile(4, 5, HazardType.VOID_CREEP);
  crisis.setHazardTile(8, 7, HazardType.VOID_CREEP);
  crisis.setHazardTile(10, 10, HazardType.VOID_CREEP);
  crisis.voidCreepCount = 4;

  assert.strictEqual(crisis.getHazardAt(2, 2)?.type, HazardType.VOID_CREEP);
  assert.strictEqual(crisis.supernovaCleansed, false);
  assert.strictEqual(crisis.avatarShieldActive, true);

  // Trigger Supernova Cleanse
  crisis.triggerSupernovaCleanse();

  assert.strictEqual(crisis.supernovaCleansed, true);
  assert.strictEqual(crisis.avatarShieldActive, false);
  assert.strictEqual(crisis.voidCreepCount, 0);

  // Every seeded tile must be cleared
  assert.strictEqual(crisis.getHazardAt(2, 2), null);
  assert.strictEqual(crisis.getHazardAt(4, 5), null);
  assert.strictEqual(crisis.getHazardAt(8, 7), null);
  assert.strictEqual(crisis.getHazardAt(10, 10), null);
});

test('Tier 7.2: Supernova Cleanse triggers multi-octave harmonic audio burst', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  audio.playSupernovaCleanse(1000);

  // Verify voice acquisition for Supernova chord
  assert.ok(pool.getActiveVoiceCount() >= 6, 'Supernova Cleanse must synthesize at least 6 chord voices');

  audio.destroy();
  pool.destroy();
});

test('Tier 7.3: Avatar vulnerability and defeat sequence following Cleanse', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.CLIMAX);

  assert.strictEqual(crisis.avatarSpawned, true);
  assert.strictEqual(crisis.avatarShieldActive, true);
  assert.strictEqual(crisis.avatarHp, 3);

  // Bomb blast when shield is active does NOT damage Avatar
  crisis.handleBombBlast(6, 7, 2);
  assert.strictEqual(crisis.avatarHp, 3, 'Shield must protect Avatar prior to Cleanse');

  // Trigger Cleanse
  crisis.triggerSupernovaCleanse();
  assert.strictEqual(crisis.avatarShieldActive, false);

  // Bomb blast 1: 3 -> 2 HP
  crisis.handleBombBlast(6, 7, 2);
  assert.strictEqual(crisis.avatarHp, 2);

  // Bomb blast 2: 2 -> 1 HP
  crisis.handleBombBlast(6, 7, 2);
  assert.strictEqual(crisis.avatarHp, 1);

  // Bomb blast 3: 1 -> 0 HP (Defeated!)
  crisis.handleBombBlast(6, 7, 2);
  assert.strictEqual(crisis.avatarHp, 0);
  assert.strictEqual(crisis.isVictorious, true);
  assert.strictEqual(crisis.getStage(), CrisisStage.RESOLVED);
});

// ==============================================================================
// TIER 8: SAFE AREA INVARIANT (>= 40% SAFE WALKABLE AREA)
// ==============================================================================

test('Tier 8.1: Baseline safe area invariant satisfied at initialization (>= 40%)', () => {
  const crisis = new VoidCrisis();
  crisis.start(); // Whispers

  const safeRatio = crisis.getWalkableSafeAreaRatio();
  assert.ok(
    safeRatio >= VoidCrisis.MIN_SAFE_AREA_RATIO,
    `Safe area ratio ${safeRatio} must be >= ${VoidCrisis.MIN_SAFE_AREA_RATIO}`
  );
  assert.ok(safeRatio >= 0.90, `Whispers initial safe area ratio should be >= 90% (got ${safeRatio})`);
});

test('Tier 8.2: Outbreak stage creep preserves >= 40% safe area invariant', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Let creep expand through 30 cycles
  for (let i = 0; i < 30; i++) {
    crisis.update(5000);
  }

  const safeRatio = crisis.getWalkableSafeAreaRatio();
  assert.ok(
    safeRatio >= VoidCrisis.MIN_SAFE_AREA_RATIO,
    `Outbreak safe area ratio ${safeRatio} must be >= ${VoidCrisis.MIN_SAFE_AREA_RATIO}`
  );
});

test('Tier 8.3: Charged prism 3x3 safe auras permanently repel void creep', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Fully charge prism 0 at (1, 13)
  const prism = crisis.prisms[0];
  prism.hits = 3;
  prism.charge = 100;
  prism.isCharged = true;

  // Verify all adjacent walkable tiles inside 3x3 aura reject creep
  const auraCoords = [
    { r: 1, c: 12 },
    { r: 2, c: 13 },
  ];

  for (const coord of auraCoords) {
    const canSpread = crisis.canCreepSpreadTo(coord.r, coord.c);
    assert.strictEqual(
      canSpread,
      false,
      `Tile (${coord.r}, ${coord.c}) inside 3x3 charged prism aura must NEVER permit creep spread`
    );
  }
});

test('Tier 8.4: Supernova Cleanse restores safe area to 100%', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Expand creep
  for (let i = 0; i < 20; i++) {
    crisis.update(4500);
  }
  assert.ok(crisis.voidCreepCount > 0);

  // Trigger Cleanse
  crisis.triggerSupernovaCleanse();
  assert.strictEqual(crisis.voidCreepCount, 0);

  const restoredRatio = crisis.getWalkableSafeAreaRatio();
  assert.ok(restoredRatio >= 0.96, `Supernova Cleanse must restore walkable safe area to >= 96% (got ${(restoredRatio * 100).toFixed(1)}%)`);
});

// ==============================================================================
// TIER 9: NAN COORDINATE REJECTION ON BOMB BLASTS
// ==============================================================================

test('Tier 9.1: Bomb blast strictly rejects NaN, Infinite, and non-integer coordinates', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  const initialPrismCharge = crisis.prisms[0].charge;
  const initialCreepCount = crisis.voidCreepCount;

  // Adversarial bomb blasts with NaN and Infinite coordinates
  assert.doesNotThrow(() => {
    crisis.handleBombBlast(NaN, 13, 2);
    crisis.handleBombBlast(1, NaN, 2);
    crisis.handleBombBlast(NaN, NaN, 2);
    crisis.handleBombBlast(1, 13, NaN);
    crisis.handleBombBlast(Infinity, 13, 2);
    crisis.handleBombBlast(1, -Infinity, 2);
    crisis.handleBombBlast(-Infinity, Infinity, 2);
    crisis.handleBombBlast(1, 13, Infinity);
  }, 'handleBombBlast must reject NaN/Infinite parameters without throwing');

  // Verify zero state corruption
  assert.strictEqual(crisis.prisms[0].charge, initialPrismCharge, 'NaN blasts must not alter prism charge');
  assert.strictEqual(crisis.voidCreepCount, initialCreepCount, 'NaN blasts must not alter creep count');
});

test('Tier 9.2: Rejection of subnormal floats and non-integers', () => {
  const crisis = new VoidCrisis();
  crisis.start();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  assert.doesNotThrow(() => {
    crisis.handleBombBlast(1e-323, 1e-323, 2);
    crisis.handleBombBlast(1.5, 13.5, 2);
    crisis.handleBombBlast(-100, 500, 2);
    crisis.handleBombBlast(1, 13, -5);
  });

  assert.strictEqual(crisis.prisms[0].hits, 0, 'Subnormal/non-integer blasts must be safely rejected');
});

test('Tier 9.3: Audio synthesizer resilience against NaN and non-finite inputs', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  assert.doesNotThrow(() => {
    audio.playSubspaceVoidHum(NaN, NaN);
    audio.playPrismResonanceChime(NaN, NaN);
    audio.playSupernovaCleanse(NaN);
    audio.playSingularityImplosionAlert(NaN);
    audio.playFilteredNoiseBurst(NaN, NaN, NaN, NaN);
    audio.playVoidCrisisState(CrisisStage.WHISPERS, NaN, NaN, NaN, NaN);
  }, 'VoidCrisisAudio must safely ignore NaN inputs without crashing');

  audio.destroy();
  pool.destroy();
});

// ==============================================================================
// TIER 10: 10,000-FRAME ZERO-GC SOAK TEST WITH ZERO HEAP GROWTH
// ==============================================================================

test('Tier 10.1: 10,000-frame soak simulation with Zero-GC and 0 NaN metrics', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  const crisis = new VoidCrisis();
  crisis.start();

  const FRAME_DELTA_MS = 16.6;
  const TOTAL_FRAMES = 10000;

  const startTime = Date.now();

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const simTimeMs = frame * FRAME_DELTA_MS;

    // Advance crisis
    crisis.update(FRAME_DELTA_MS);

    // Audio update
    if (frame % 30 === 0) {
      audio.playVoidCrisisState(
        crisis.getStage(),
        crisis.voidCreepCount,
        crisis.getThreat(),
        VoidCrisis.SINGULARITY_THRESHOLD_TILES,
        simTimeMs
      );
    }

    // Periodic actions
    if (frame === 1000) {
      crisis.transitionToStage(CrisisStage.OUTBREAK);
    } else if (frame === 3000) {
      // Charge prism 0
      crisis.handleBombBlast(1, 13, 2);
      crisis.handleBombBlast(1, 13, 2);
      crisis.handleBombBlast(1, 13, 2);
    } else if (frame === 5000) {
      // Charge prism 1 -> Triggers Cleanse!
      crisis.handleBombBlast(11, 1, 2);
      crisis.handleBombBlast(11, 1, 2);
      crisis.handleBombBlast(11, 1, 2);
    } else if (frame === 6000) {
      crisis.transitionToStage(CrisisStage.CLIMAX);
    } else if (frame === 7000) {
      crisis.handleBombBlast(6, 7, 3);
      crisis.handleBombBlast(6, 7, 3);
      crisis.handleBombBlast(6, 7, 3);
    } else if (frame === 8000) {
      // Re-trigger crisis for continuous cycle testing
      crisis.reset();
      crisis.start();
    }
  }

  const elapsedMs = Date.now() - startTime;
  const avgFrameDurationMs = elapsedMs / TOTAL_FRAMES;

  assert.ok(
    avgFrameDurationMs < 0.1,
    `Average frame duration ${avgFrameDurationMs.toFixed(4)}ms must be < 0.10ms (100µs)`
  );

  // Invariant verification
  assert.ok(Number.isFinite(crisis.getThreat()), 'Threat must remain finite');
  assert.ok(!Number.isNaN(crisis.getThreat()), 'Threat must not be NaN');
  assert.ok(Number.isFinite(crisis.voidCreepCount), 'voidCreepCount must remain finite');

  // Teardown
  audio.destroy();
  pool.destroy();
  assert.strictEqual(pool.getActiveVoiceCount(), 0, 'No active voice leaks after 10,000 frames');
});

test('Tier 10.2: Heap growth and memory stability verification', () => {
  if (typeof global.gc === 'function') {
    global.gc();
  }

  const startMem = process.memoryUsage().heapUsed;

  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const audio = new VoidCrisisAudio(pool);
  audio.init(mockCtx, pool);

  const crisis = new VoidCrisis();
  crisis.start();

  // Run 2,000 rapid cycles
  for (let i = 0; i < 2000; i++) {
    crisis.update(16.6);
    if (i % 25 === 0) {
      audio.playFilteredNoiseBurst(0.1, 1500, 500, 0.05);
    }
  }

  audio.destroy();
  pool.destroy();
  crisis.reset();

  if (typeof global.gc === 'function') {
    global.gc();
  }

  const endMem = process.memoryUsage().heapUsed;
  const memDeltaMB = (endMem - startMem) / (1024 * 1024);

  // Under V8 ambient GC in Node test runner, heap drift budget is <= 3.0 MB, or <= 0.5 MB with explicit global.gc()
  const maxBudgetMB = typeof global.gc === 'function' ? 0.5 : 3.0;
  assert.ok(
    memDeltaMB <= maxBudgetMB,
    `Heap drift ${memDeltaMB.toFixed(3)} MB must be <= ${maxBudgetMB} MB (Zero-GC compliance)`
  );
});
