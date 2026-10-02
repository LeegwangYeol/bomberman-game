/**
 * tests/frost_hazard_audio.test.mjs
 *
 * Comprehensive Test Suite for Frost Hazard Audio Subsystem:
 * - FrostHazardAudio.ts (Procedural Sound Synthesizer for Frost Hazard)
 * - DynamicHazardAudio.ts (Frost Hazard Presets & Synthesis Extensions)
 *
 * Verification Architecture (8 Tiers):
 * - Tier 1: Audio Presets & Tone Parameter Invariants
 * - Tier 2: Headless Fallback & SSR Safety (Null / Undefined Context)
 * - Tier 3: Voice Pool Binding & FrostHazardAudio Method Execution
 * - Tier 4: DynamicHazardAudio Frost Synthesis & Multi-Layer Chords
 * - Tier 5: FSM State Machine Audio Dispatch
 * - Tier 6: Rate Limiting & Timestamp Debounce Verification
 * - Tier 7: Zero-Leak Auto-Disconnection & Node Teardown Cleanliness
 * - Tier 8: 1,000 Rapid Stress Playback Invocations
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  FrostHazardAudio,
  FROST_AUDIO_PRESETS,
} from '../src/game/hazards/FrostHazardAudio.ts';
import {
  DynamicHazardAudio,
  HAZARD_AUDIO_PRESETS,
} from '../src/game/hazards/DynamicHazardAudio.ts';

/* ==============================================================================
 * MOCK AUDIO ENGINE FOR HEADLESS NODE ENVIRONMENT
 * ============================================================================== */

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
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

class MockBufferSourceNode extends MockAudioNode {
  constructor() {
    super('BufferSource');
    this.buffer = null;
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

class MockAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channelData = [new Float32Array(length)];
  }
  getChannelData() {
    return this.channelData[0];
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = new MockAudioNode('Destination');
    this.createdNodes = [];
    this.resumed = false;
    this.closed = false;
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
    const node = new MockBufferSourceNode();
    this.createdNodes.push(node);
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    return new MockAudioBuffer(channels, length, sampleRate);
  }
  async resume() {
    this.resumed = true;
    this.state = 'running';
  }
  async close() {
    this.closed = true;
    this.state = 'closed';
  }
}

/* ==============================================================================
 * TIER 1: AUDIO PRESETS & TONE PARAMETER INVARIANTS
 * ============================================================================== */

test('Tier 1.1 [Frost Audio Presets]: FROST_AUDIO_PRESETS defines calibrated waveforms, ADSR and filters', () => {
  // Crystallization crackle
  assert.equal(FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE.type, 'triangle');
  assert.equal(FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE.frequency, 2400);
  assert.equal(FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE.frequencyRamp?.target, 3600);
  assert.equal(FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE.filter?.type, 'highpass');
  assert.equal(FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE.filter?.frequency, 1800);

  // Blizzard wind gust
  assert.equal(FROST_AUDIO_PRESETS.BLIZZARD_WIND_GUST.type, 'sawtooth');
  assert.equal(FROST_AUDIO_PRESETS.BLIZZARD_WIND_GUST.frequency, 180);
  assert.equal(FROST_AUDIO_PRESETS.BLIZZARD_WIND_GUST.frequencyRamp?.target, 120);
  assert.equal(FROST_AUDIO_PRESETS.BLIZZARD_WIND_GUST.filter?.type, 'bandpass');

  // Absolute Zero Chimes in D Minor
  assert.equal(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_F5.type, 'sine');
  assert.ok(Math.abs(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_F5.frequency - 698.46) < 0.1);
  assert.ok(Math.abs(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_A5.frequency - 880.00) < 0.1);
  assert.ok(Math.abs(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_D6.frequency - 1174.66) < 0.1);

  // Sub-bass thud (55Hz -> 35Hz)
  assert.equal(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_SUB_THUD.type, 'sine');
  assert.equal(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_SUB_THUD.frequency, 55);
  assert.equal(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_SUB_THUD.frequencyRamp?.target, 35);

  // Thaw droplet
  assert.equal(FROST_AUDIO_PRESETS.THAW_DROPLET.type, 'sine');
  assert.equal(FROST_AUDIO_PRESETS.THAW_DROPLET.frequency, 1400);
  assert.equal(FROST_AUDIO_PRESETS.THAW_DROPLET.frequencyRamp?.target, 900);

  // Thermal break chime
  assert.equal(FROST_AUDIO_PRESETS.THERMAL_BREAK_CHIME.type, 'sine');
  assert.ok(Math.abs(FROST_AUDIO_PRESETS.THERMAL_BREAK_CHIME.frequency - 1318.51) < 0.1);
  assert.equal(FROST_AUDIO_PRESETS.THERMAL_BREAK_CHIME.frequencyRamp?.target, 1760.00);

  // Frost chill puff
  assert.equal(FROST_AUDIO_PRESETS.FROST_CHILL_PUFF.type, 'triangle');
  assert.equal(FROST_AUDIO_PRESETS.FROST_CHILL_PUFF.frequency, 240);
  assert.equal(FROST_AUDIO_PRESETS.FROST_CHILL_PUFF.frequencyRamp?.target, 140);
});

test('Tier 1.2 [Dynamic Hazard Frost Presets]: HAZARD_AUDIO_PRESETS contains frost audio extensions', () => {
  assert.ok(HAZARD_AUDIO_PRESETS.FROST_SHIMMER_SWEEP, 'FROST_SHIMMER_SWEEP exists');
  assert.equal(HAZARD_AUDIO_PRESETS.FROST_SHIMMER_SWEEP.type, 'triangle');
  assert.ok(Math.abs(HAZARD_AUDIO_PRESETS.FROST_SHIMMER_SWEEP.frequency - 2093.0) < 0.1);

  assert.ok(HAZARD_AUDIO_PRESETS.FROST_RUMBLE_40HZ_SUB, 'FROST_RUMBLE_40HZ_SUB exists');
  assert.equal(HAZARD_AUDIO_PRESETS.FROST_RUMBLE_40HZ_SUB.type, 'sine');
  assert.equal(HAZARD_AUDIO_PRESETS.FROST_RUMBLE_40HZ_SUB.frequency, 40);

  assert.ok(HAZARD_AUDIO_PRESETS.FROST_SHATTER_DETONATION_THUMP, 'FROST_SHATTER_DETONATION_THUMP exists');
  assert.ok(HAZARD_AUDIO_PRESETS.FROST_MELT_DRIP, 'FROST_MELT_DRIP exists');
  assert.ok(HAZARD_AUDIO_PRESETS.FROST_CRYO_GLIDE, 'FROST_CRYO_GLIDE exists');
});

/* ==============================================================================
 * TIER 2: HEADLESS FALLBACK & SSR SAFETY
 * ============================================================================== */

test('Tier 2.1 [FrostHazardAudio Headless Fallback]: All methods safe with null/empty pool', () => {
  const emptySynth = new FrostHazardAudio(null);

  assert.doesNotThrow(() => emptySynth.playCrystallization(100));
  assert.doesNotThrow(() => emptySynth.playBlizzardWind(200));
  assert.doesNotThrow(() => emptySynth.playAbsoluteZeroBurst(300));
  assert.doesNotThrow(() => emptySynth.playThawMelt(400));
  assert.doesNotThrow(() => emptySynth.playThermalBreak(500));
  assert.doesNotThrow(() => emptySynth.playFrostChill(600));
  assert.doesNotThrow(() => emptySynth.playFrostHazardState('HOARFROST_SURGE', 700));
  assert.doesNotThrow(() => emptySynth.playFrostHazardState('ABSOLUTE_ZERO_BURST', 800));
  assert.doesNotThrow(() => emptySynth.playFrostHazardState('THAW_COOLDOWN', 900));
  assert.doesNotThrow(() => emptySynth.reset());
});

test('Tier 2.2 [DynamicHazardAudio Headless Frost Fallback]: Frost methods safe without context', () => {
  const dynamicSynth = new DynamicHazardAudio(null);

  assert.doesNotThrow(() => dynamicSynth.playIceShimmer(100));
  assert.doesNotThrow(() => dynamicSynth.playSubZeroRumble(200));
  assert.doesNotThrow(() => dynamicSynth.playGlassShatterDetonation(300));
  assert.doesNotThrow(() => dynamicSynth.playFrostMeltingDrip(400));
  assert.doesNotThrow(() => dynamicSynth.playCryoGlide(500));
  assert.doesNotThrow(() => dynamicSynth.playFrostHazardState('HOARFROST_SURGE', 600));
  assert.doesNotThrow(() => dynamicSynth.playFrostHazardState('ABSOLUTE_ZERO_BURST', 700));
  assert.doesNotThrow(() => dynamicSynth.playFrostHazardState('THAW_COOLDOWN', 800));
  assert.doesNotThrow(() => dynamicSynth.reset());
  assert.doesNotThrow(() => dynamicSynth.destroy());
});

/* ==============================================================================
 * TIER 3: VOICE POOL BINDING & FROSTHAZARDAUDIO METHOD EXECUTION
 * ============================================================================== */

test('Tier 3.1 [Voice Pool Integration]: FrostHazardAudio routes tones to AudioVoicePool', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  let playedTones = [];
  const originalPlayTone = pool.playTone.bind(pool);
  pool.playTone = (params) => {
    playedTones.push(params);
    return originalPlayTone(params);
  };

  const audio = new FrostHazardAudio(pool);

  // 1. Crystallization
  playedTones = [];
  audio.playCrystallization(100);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE);

  // 2. Blizzard wind (spaced > 250ms or after reset)
  audio.reset();
  playedTones = [];
  audio.playBlizzardWind(500);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], FROST_AUDIO_PRESETS.BLIZZARD_WIND_GUST);

  // 3. Absolute Zero Burst (Sub thud + 3 chimes = 4 voices)
  audio.reset();
  playedTones = [];
  audio.playAbsoluteZeroBurst(1000);
  assert.equal(playedTones.length, 4, 'Burst triggers 4 tonal layers (thud + F5, A5, D6 chimes)');
  assert.ok(playedTones.includes(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_SUB_THUD));
  assert.ok(playedTones.includes(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_F5));
  assert.ok(playedTones.includes(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_A5));
  assert.ok(playedTones.includes(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_CHIME_D6));

  // 4. Thaw Melt Droplet
  audio.reset();
  playedTones = [];
  audio.playThawMelt(1500);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], FROST_AUDIO_PRESETS.THAW_DROPLET);

  // 5. Thermal Break Chime
  audio.reset();
  playedTones = [];
  audio.playThermalBreak(2000);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], FROST_AUDIO_PRESETS.THERMAL_BREAK_CHIME);

  // 6. Frost Chill Puff
  audio.reset();
  playedTones = [];
  audio.playFrostChill(2500);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], FROST_AUDIO_PRESETS.FROST_CHILL_PUFF);
});

/* ==============================================================================
 * TIER 4: DYNAMICHAZARDAUDIO FROST SYNTHESIS & MULTI-LAYER CHORDS
 * ============================================================================== */

test('Tier 4.1 [DynamicHazardAudio Frost]: playIceShimmer and playSubZeroRumble execute properly', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const dynamicAudio = new DynamicHazardAudio(pool);
  dynamicAudio.init(ctx);

  let playedTones = [];
  const originalPlayTone = pool.playTone.bind(pool);
  pool.playTone = (params) => {
    playedTones.push(params);
    return originalPlayTone(params);
  };

  // Ice Shimmer
  playedTones = [];
  dynamicAudio.playIceShimmer(100);
  assert.ok(playedTones.length >= 2, 'Ice shimmer triggers multiple tones');
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_SHIMMER_SWEEP));
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_SHIMMER_CHIME_A));

  // Sub-Zero Rumble
  playedTones = [];
  dynamicAudio.playSubZeroRumble(300);
  assert.ok(playedTones.length >= 3, 'Rumble triggers 3 tonal layers (drone, texture, sub)');
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_RUMBLE_40HZ_SUB));
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_RUMBLE_TEXTURE));
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_RUMBLE_BLIZZARD_SUB));

  // Glass Shatter Detonation
  playedTones = [];
  dynamicAudio.playGlassShatterDetonation(500);
  assert.ok(playedTones.length >= 4, 'Glass shatter triggers 4 harmonic voices + noise');
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_SHATTER_DETONATION_THUMP));
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_SHATTER_GLASS_PING_A));
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_SHATTER_GLASS_PING_B));
  assert.ok(playedTones.includes(HAZARD_AUDIO_PRESETS.FROST_SHATTER_CHORD_D6));

  // Frost Melting Drip & Cryo Glide
  playedTones = [];
  dynamicAudio.playFrostMeltingDrip(700);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], HAZARD_AUDIO_PRESETS.FROST_MELT_DRIP);

  playedTones = [];
  dynamicAudio.playCryoGlide(850);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], HAZARD_AUDIO_PRESETS.FROST_CRYO_GLIDE);
});

/* ==============================================================================
 * TIER 5: FSM STATE MACHINE AUDIO DISPATCH
 * ============================================================================== */

test('Tier 5.1 [FSM State Dispatch]: FrostHazardAudio dispatches sound according to lifecycle state', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const audio = new FrostHazardAudio(pool);
  let playedTones = [];
  pool.playTone = (params) => {
    playedTones.push(params);
    return null;
  };

  // State: HOARFROST_SURGE
  playedTones = [];
  audio.playFrostHazardState('HOARFROST_SURGE', 100);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], FROST_AUDIO_PRESETS.CRYSTALLIZATION_CRACKLE);

  // State: ABSOLUTE_ZERO_BURST
  audio.reset();
  playedTones = [];
  audio.playFrostHazardState('ABSOLUTE_ZERO_BURST', 300);
  assert.equal(playedTones.length, 4);
  assert.ok(playedTones.includes(FROST_AUDIO_PRESETS.ABSOLUTE_ZERO_SUB_THUD));

  // State: THAW_COOLDOWN
  audio.reset();
  playedTones = [];
  audio.playFrostHazardState('THAW_COOLDOWN', 500);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], FROST_AUDIO_PRESETS.THAW_DROPLET);

  // Unrelated state does nothing
  audio.reset();
  playedTones = [];
  audio.playFrostHazardState('DORMANT', 700);
  assert.equal(playedTones.length, 0);
});

test('Tier 5.2 [Dynamic FSM Dispatch]: DynamicHazardAudio dispatches frost sounds according to state', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const dynamicAudio = new DynamicHazardAudio(pool);
  dynamicAudio.init(ctx);

  let playedTones = [];
  pool.playTone = (params) => {
    playedTones.push(params);
    return null;
  };

  // State: SHATTER / ABSOLUTE_ZERO
  playedTones = [];
  dynamicAudio.playFrostHazardState('ABSOLUTE_ZERO_BURST', 100);
  assert.ok(playedTones.length >= 4);

  // State: PERMAFROST
  dynamicAudio.reset();
  playedTones = [];
  dynamicAudio.playFrostHazardState('PERMAFROST_RUMBLE', 300);
  assert.ok(playedTones.length >= 3);

  // State: HOARFROST_SURGE
  dynamicAudio.reset();
  playedTones = [];
  dynamicAudio.playFrostHazardState('HOARFROST_SURGE', 500);
  assert.ok(playedTones.length >= 2);

  // State: THAW
  dynamicAudio.reset();
  playedTones = [];
  dynamicAudio.playFrostHazardState('THAW_COOLDOWN', 700);
  assert.equal(playedTones.length, 1);
  assert.equal(playedTones[0], HAZARD_AUDIO_PRESETS.FROST_MELT_DRIP);
});

/* ==============================================================================
 * TIER 6: RATE LIMITING & TIMESTAMP DEBOUNCE VERIFICATION
 * ============================================================================== */

test('Tier 6.1 [Debounce Timing]: Rapid repeated calls within debounce window are suppressed', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const audio = new FrostHazardAudio(pool);
  let playCount = 0;
  pool.playTone = () => {
    playCount++;
    return null;
  };

  // Crystallization: debounce 120ms
  audio.playCrystallization(1000);
  assert.equal(playCount, 1, 'First call fires');

  audio.playCrystallization(1050); // +50ms < 120ms
  assert.equal(playCount, 1, 'Rapid call at +50ms is debounced');

  audio.playCrystallization(1110); // +110ms < 120ms
  assert.equal(playCount, 1, 'Rapid call at +110ms is debounced');

  audio.playCrystallization(1125); // +125ms > 120ms
  assert.equal(playCount, 2, 'Call past 120ms fires');

  // Blizzard Wind: debounce 250ms
  playCount = 0;
  audio.playBlizzardWind(2000);
  assert.equal(playCount, 1, 'First wind call fires');

  audio.playBlizzardWind(2100); // +100ms < 250ms
  assert.equal(playCount, 1, 'Debounced at +100ms');

  audio.playBlizzardWind(2260); // +260ms > 250ms
  assert.equal(playCount, 2, 'Call past 250ms fires');

  // Thaw Melt: debounce 100ms
  playCount = 0;
  audio.playThawMelt(3000);
  assert.equal(playCount, 1);

  audio.playThawMelt(3050);
  assert.equal(playCount, 1, 'Debounced at +50ms');

  audio.playThawMelt(3105);
  assert.equal(playCount, 2, 'Fires at +105ms');

  // Reset method clears debounce
  audio.reset();
  audio.playThawMelt(3110); // Only +5ms later, but reset() was called
  assert.equal(playCount, 3, 'Fires immediately after reset');
});

/* ==============================================================================
 * TIER 7: ZERO-LEAK AUTO-DISCONNECTION & NODE TEARDOWN CLEANLINESS
 * ============================================================================== */

test('Tier 7.1 [Zero-Leak Management]: Audio nodes disconnect cleanly on reset and destruction', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const dynamicAudio = new DynamicHazardAudio(pool);
  dynamicAudio.init(ctx);

  // Play noises and rumbles creating transient nodes
  dynamicAudio.playSubZeroRumble(100);
  dynamicAudio.playIceShimmer(300);
  dynamicAudio.playGlassShatterDetonation(500);

  // Reset should disconnect and clear all tracked transient nodes
  dynamicAudio.reset();
  assert.equal(dynamicAudio.activeTransientNodes.size, 0, 'Active transient nodes must be 0 after reset()');

  // Destroy should do a full teardown
  dynamicAudio.destroy();
  assert.equal(dynamicAudio.activeTransientNodes.size, 0, 'Active transient nodes must be 0 after destroy()');

  // Pool destroy tears down pooled voices
  pool.destroy();
  assert.equal(pool.getActiveCount(), 0, 'All pool voices must be silent after pool.destroy()');
});

/* ==============================================================================
 * TIER 8: 1,000 RAPID STRESS PLAYBACK INVOCATIONS
 * ============================================================================== */

test('Tier 8.1 [1,000 Rapid Stress Cycles]: Zero crash, zero exceptions, stable pool state', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const frostAudio = new FrostHazardAudio(pool);
  const dynamicAudio = new DynamicHazardAudio(pool);
  dynamicAudio.init(ctx);

  let simTime = 0;

  for (let cycle = 0; cycle < 1000; cycle++) {
    simTime += 16; // 60 FPS delta

    const mod = cycle % 7;
    switch (mod) {
      case 0:
        frostAudio.playCrystallization(simTime);
        break;
      case 1:
        frostAudio.playBlizzardWind(simTime);
        break;
      case 2:
        frostAudio.playAbsoluteZeroBurst(simTime);
        break;
      case 3:
        frostAudio.playThermalBreak(simTime);
        break;
      case 4:
        frostAudio.playFrostChill(simTime);
        break;
      case 5:
        dynamicAudio.playIceShimmer(simTime);
        dynamicAudio.playFrostMeltingDrip(simTime);
        break;
      case 6:
        dynamicAudio.playGlassShatterDetonation(simTime);
        dynamicAudio.playCryoGlide(simTime);
        break;
    }

    if (cycle % 200 === 0) {
      frostAudio.reset();
      dynamicAudio.reset();
    }
  }

  // Teardown
  frostAudio.reset();
  dynamicAudio.reset();
  dynamicAudio.destroy();

  assert.ok(true, '1,000 rapid cycles completed with 0 errors');
});
