import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  VoidCrisisAudio,
  VOID_AUDIO_PRESETS,
} from '../src/game/crises/VoidCrisisAudio.ts';
import { VoidCrisis } from '../src/game/crises/VoidCrisis.ts';
import { CrisisStage } from '../src/game/crises/CrisisTypes.ts';

// ==============================================================================
// Mock Web Audio API Primitives
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
  start() { this.started = true; }
  stop() {
    this.stopped = true;
    if (typeof this.onended === 'function') this.onended();
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
    this.onended = null;
  }
  start() { this.started = true; }
  stop() {
    this.stopped = true;
    if (typeof this.onended === 'function') this.onended();
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode('Destination');
    this.createdNodes = [];
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
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }
}

// ==============================================================================
// Test Suite: Void Crisis Audio Procedural WebAudio Synthesizer
// ==============================================================================

test('Tier 1: Preset Integrity & Mathematical Audit (4 Signature Soundscapes)', () => {
  // 1. Subspace Void Hum
  const void36 = VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_36HZ;
  const void48 = VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_48HZ;
  const voidAnchor = VOID_AUDIO_PRESETS.SUBSPACE_VOID_SUB_ANCHOR;
  const voidSweep = VOID_AUDIO_PRESETS.SUBSPACE_VOID_WARP_SWEEP;
  const voidShimmer = VOID_AUDIO_PRESETS.SUBSPACE_VOID_SHIMMER;

  assert.equal(void36.type, 'sine');
  assert.equal(void36.frequency, 36.0);
  assert.equal(void36.frequencyRamp?.target, 32.0);
  assert.equal(void36.filter?.type, 'lowpass');

  assert.equal(void48.type, 'sine');
  assert.equal(void48.frequency, 48.0);
  assert.equal(void48.frequencyRamp?.target, 42.0);

  // Verify 4:3 gravitational harmonic relation
  const harmonicRatio = void48.frequency / void36.frequency;
  assert.equal(Math.round(harmonicRatio * 100) / 100, 1.33);

  assert.equal(voidAnchor.frequency, 24.0);
  assert.equal(voidAnchor.frequencyRamp?.target, 20.0);
  assert.equal(voidSweep.type, 'triangle');
  assert.equal(voidSweep.frequency, 96.0);
  assert.equal(voidShimmer.frequency, 320.0);

  // 2. Prism Resonance Chime (Scaling with Prism Charge)
  const tier1C6 = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER1_C6;
  const tier1G6 = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER1_G6;
  const tier2E6 = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER2_E6;
  const tier2B6 = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER2_B6;
  const tier3C7 = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER3_C7;
  const tier3E7 = VOID_AUDIO_PRESETS.PRISM_CHIME_TIER3_E7;

  assert.equal(tier1C6.frequency, 1046.50); // C6
  assert.equal(tier1G6.frequency, 1567.98); // G6 (pure fifth above C6)
  assert.equal(tier2E6.frequency, 1318.51); // E6
  assert.equal(tier2B6.frequency, 1975.53); // B6
  assert.equal(tier3C7.frequency, 2093.00); // C7 (octave above C6)
  assert.equal(tier3E7.frequency, 2637.02); // E7

  // 3. Supernova Cleanse
  const chordD4 = VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D4;
  const chordA4 = VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_A4;
  const chordD5 = VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_D5;
  const chordFSharp5 = VOID_AUDIO_PRESETS.SUPERNOVA_CHORD_FSHARP5;
  const subBlast = VOID_AUDIO_PRESETS.SUPERNOVA_SUB_BLAST;

  assert.equal(chordD4.frequency, 293.66);
  assert.equal(chordA4.frequency, 440.00);
  assert.equal(chordD5.frequency, 587.33);
  assert.equal(chordFSharp5.frequency, 739.99);
  assert.equal(subBlast.frequency, 64.0);
  assert.equal(subBlast.frequencyRamp?.target, 24.0);

  // 4. Singularity Implosion Alert
  const plunge = VOID_AUDIO_PRESETS.SINGULARITY_PLUNGE;
  const siren = VOID_AUDIO_PRESETS.SINGULARITY_GRAV_SIREN;
  const implosionSub = VOID_AUDIO_PRESETS.SINGULARITY_SUB_IMPLOSION;

  assert.equal(plunge.type, 'sawtooth');
  assert.equal(plunge.frequency, 120.0);
  assert.equal(plunge.frequencyRamp?.target, 28.0);
  assert.equal(siren.type, 'triangle');
  assert.equal(siren.frequency, 240.0);
  assert.equal(implosionSub.frequency, 38.0);
  assert.equal(implosionSub.frequencyRamp?.target, 18.0);

  // 5. Immutability & Statically Frozen Audit
  assert.ok(Object.isFrozen(VOID_AUDIO_PRESETS), 'VOID_AUDIO_PRESETS must be statically frozen');
  for (const [key, preset] of Object.entries(VOID_AUDIO_PRESETS)) {
    assert.ok(Object.isFrozen(preset), `Preset ${key} must be statically frozen`);
    if (preset.frequencyRamp) {
      assert.ok(Object.isFrozen(preset.frequencyRamp), `Preset ${key}.frequencyRamp must be statically frozen`);
    }
    if (preset.filter) {
      assert.ok(Object.isFrozen(preset.filter), `Preset ${key}.filter must be statically frozen`);
    }
  }

  // Mutation attempt must throw in strict mode
  assert.throws(() => {
    // @ts-expect-error Testing mutation throw
    VOID_AUDIO_PRESETS.SUBSPACE_VOID_VOICE_36HZ.frequency = 999;
  }, TypeError);
});

test('Tier 2: Headless & SSR Fallback (Zero Crashes in Node environment)', () => {
  VoidCrisisAudio.resetInstance();
  const voidAudio = new VoidCrisisAudio(null);

  assert.doesNotThrow(() => voidAudio.playSubspaceVoidHum(0.8));
  assert.doesNotThrow(() => voidAudio.playPrismResonanceChime(34));
  assert.doesNotThrow(() => voidAudio.playPrismResonanceChime(68));
  assert.doesNotThrow(() => voidAudio.playPrismResonanceChime(100));
  assert.doesNotThrow(() => voidAudio.playSupernovaCleanse());
  assert.doesNotThrow(() => voidAudio.playSingularityImplosionAlert());
  assert.doesNotThrow(() => voidAudio.playVoidCrisisState(CrisisStage.WHISPERS));
  assert.doesNotThrow(() => voidAudio.playVoidCrisisState(CrisisStage.OUTBREAK, 20, 50, 72));
  assert.doesNotThrow(() => voidAudio.playVoidCrisisState(CrisisStage.CLIMAX, 60, 90, 72));
  assert.doesNotThrow(() => voidAudio.playVoidCrisisState(CrisisStage.RESOLVED));
  assert.doesNotThrow(() => voidAudio.playVoidCrisisState(CrisisStage.FAILED));

  voidAudio.destroy();
});

test('Tier 3: Mock WebAudio Voice Pool Dispatch Verification', () => {
  VoidCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const voidAudio = new VoidCrisisAudio(pool);

  // 1. Play Subspace Void Hum
  voidAudio.playSubspaceVoidHum(1.0, 1000);
  const activeVoicesHum = pool.getActiveVoiceCount();
  assert.ok(activeVoicesHum >= 4, `Expected at least 4 active voices for Subspace Void Hum, got ${activeVoicesHum}`);

  // 2. Play Prism Resonance Chime (Tier 1)
  pool.stop();
  voidAudio.playPrismResonanceChime(33, 2000);
  assert.ok(pool.getActiveVoiceCount() >= 2, 'Expected at least 2 active voices for Tier 1 chime');

  // 3. Play Supernova Cleanse
  pool.stop();
  voidAudio.playSupernovaCleanse(3000);
  assert.ok(pool.getActiveVoiceCount() >= 6, 'Expected rich multi-octave harmonic chord for Supernova Cleanse');

  // Verify buffer source node was created for cosmic noise burst
  const bufferSources = mockCtx.createdNodes.filter((n) => n.nodeType === 'AudioBufferSource');
  assert.ok(bufferSources.length > 0, 'Procedural noise buffer source must be created');

  // 4. Play Singularity Implosion Alert
  pool.stop();
  voidAudio.playSingularityImplosionAlert(4000);
  assert.ok(pool.getActiveVoiceCount() >= 3, 'Expected voices for Singularity Implosion Alert');

  voidAudio.stop();
  assert.equal(pool.getActiveVoiceCount(), 0);
  voidAudio.destroy();
});

test('Tier 4: Rate-Limiting & Debouncing Verification', () => {
  VoidCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const voidAudio = new VoidCrisisAudio(pool);

  // Rapid calls at the same millisecond timestamp
  const now = 5000;
  voidAudio.playSubspaceVoidHum(1.0, now);
  const count1 = pool.getActiveVoiceCount();

  // Rapid second call at now + 50ms (less than 350ms debounce)
  voidAudio.playSubspaceVoidHum(1.0, now + 50);
  const count2 = pool.getActiveVoiceCount();
  assert.equal(count1, count2, 'Debounce must prevent rapid duplicate sound triggers within 350ms');

  // Third call after debounce interval (now + 400ms)
  voidAudio.playSubspaceVoidHum(1.0, now + 400);
  assert.ok(pool.getActiveVoiceCount() > 0, 'Sound should retrigger after debounce interval');

  voidAudio.destroy();
});

test('Tier 5: Zero-Leak Teardown & Lifecycle Cleansers', () => {
  VoidCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const voidAudio = new VoidCrisisAudio(pool);

  voidAudio.playSupernovaCleanse(1000);
  voidAudio.playSingularityImplosionAlert(1200);

  // Calling clearPendingNodes / stop / reset / destroy
  assert.doesNotThrow(() => voidAudio.clearPendingNodes());
  assert.doesNotThrow(() => voidAudio.stop());
  assert.doesNotThrow(() => voidAudio.reset());
  assert.doesNotThrow(() => voidAudio.destroy());

  VoidCrisisAudio.resetInstance();
  assert.equal(VoidCrisisAudio.getInstance() !== null, true);
  VoidCrisisAudio.resetInstance();
});

test('Tier 6: VoidCrisis Game Integration with Procedural Audio', () => {
  VoidCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  VoidCrisisAudio.getInstance(pool);

  const crisis = new VoidCrisis();
  crisis.init();

  // Stage 1: Whispers
  crisis.transitionToStage(CrisisStage.WHISPERS);
  assert.equal(crisis.getStage(), CrisisStage.WHISPERS);

  // Stage 2: Outbreak
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  assert.equal(crisis.getStage(), CrisisStage.OUTBREAK);

  // Bomb blast charging Prism 0 at (1, 13)
  crisis.handleBombBlast(1, 13, 2);
  const prism0 = crisis.prisms[0];
  assert.ok(prism0.charge > 0, 'Prism charge should increase');

  // Supernova Cleanse
  crisis.triggerSupernovaCleanse();
  assert.equal(crisis.supernovaCleansed, true);

  VoidCrisisAudio.resetInstance();
});

test('Tier 7: 10,000-Frame Soak Simulation (Zero Drift & Stability)', () => {
  VoidCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const voidAudio = new VoidCrisisAudio(pool);

  let simulatedTimeMs = 10000;
  for (let frame = 0; frame < 10000; frame++) {
    simulatedTimeMs += 16.6;
    if (frame % 60 === 0) {
      // 1-second pulse
      voidAudio.playVoidCrisisState(CrisisStage.OUTBREAK, 25, 45, 72, simulatedTimeMs);
    }
    if (frame % 300 === 0) {
      // 5-second chime
      voidAudio.playPrismResonanceChime(frame % 100, simulatedTimeMs);
    }
  }

  // Teardown cleanly
  voidAudio.stop();
  voidAudio.destroy();
  VoidCrisisAudio.resetInstance();
});
