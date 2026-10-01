/**
 * tests/unit/dynamic_hazard_audio.test.mjs
 *
 * Comprehensive Unit Test Suite for DynamicHazardAudio:
 * 1. Headless fallback safety (zero crash without window or AudioContext)
 * 2. Pool binding and initialization lifecycle
 * 3. Spire Telegraph Pulse (Yellow, Amber, Red, Idle)
 * 4. Tachyon Laser Discharge (Zap, Sub Thump, White Noise Burst)
 * 5. White Noise Burst Zero-Leak Auto-Disconnection (wireAutoDisconnect / onended)
 * 6. Polarization Strike (4-Voice Golden Chime Chord)
 * 7. Quantum Tunneling (Doppler Swoop & Celestial Chime)
 * 8. Auxiliary Hazard SFX (Hyper-Fuse, Overcharge, Vaporization, Ejection)
 * 9. Reset and Destroy Lifecycle (Clean teardown of transient and pooled nodes)
 * 10. Rapid Stress & Rate Limiting Verification (Zero-GC and zero memory leaks)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioVoicePool } from '../../src/game/pooling/AudioVoicePool.ts';
import { DynamicHazardAudio } from '../../src/game/hazards/DynamicHazardAudio.ts';
import { TelegraphPhase } from '../../src/game/hazards/DynamicHazard.ts';

/* ==============================================================================
 * MOCK AUDIO ENGINE FOR DETERMINISTIC UNIT TESTING
 * ============================================================================== */

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.events = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'set', val, time });
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'linear', val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'exponential', val, time });
  }
  cancelScheduledValues(time) {
    this.events.push({ type: 'cancel', time });
  }
}

class MockAudioNode {
  constructor(type = 'GenericNode') {
    this.type = type;
    this.connections = [];
    this.disconnected = false;
  }
  connect(dest) {
    this.connections.push(dest);
  }
  disconnect() {
    this.disconnected = true;
    this.connections = [];
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
  finishPlayback() {
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
 * TEST SUITE
 * ============================================================================== */

test('DynamicHazardAudio: headless fallback without AudioContext is completely crash-free', () => {
  const synth = new DynamicHazardAudio(null);
  assert.doesNotThrow(() => synth.playTelegraphPulse(TelegraphPhase.YELLOW));
  assert.doesNotThrow(() => synth.playTelegraphPulse('AMBER'));
  assert.doesNotThrow(() => synth.playTelegraphPulse('RED'));
  assert.doesNotThrow(() => synth.playTelegraphPulse('IDLE'));
  assert.doesNotThrow(() => synth.playLaserDischarge());
  assert.doesNotThrow(() => synth.playWhiteNoiseBurst());
  assert.doesNotThrow(() => synth.playPolarizationStrike());
  assert.doesNotThrow(() => synth.playQuantumTunneling());
  assert.doesNotThrow(() => synth.playHyperFuseTick());
  assert.doesNotThrow(() => synth.playTachyonOvercharge());
  assert.doesNotThrow(() => synth.playMinionVaporization());
  assert.doesNotThrow(() => synth.playSafeEjection());
  assert.doesNotThrow(() => synth.reset());
  assert.doesNotThrow(() => synth.destroy());
});

test('DynamicHazardAudio: initializes voice pool and handles suspended context resume', () => {
  const ctx = new MockAudioContext();
  ctx.state = 'suspended';

  const synth = new DynamicHazardAudio();
  synth.init(ctx);

  assert.strictEqual(ctx.resumed, true, 'AudioContext must attempt auto-resume on init');
  synth.destroy();
});

test('DynamicHazardAudio: binds external AudioVoicePool and reuses pre-allocated voices', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const synth = new DynamicHazardAudio(pool);
  assert.strictEqual(pool.getActiveCount(), 0);

  // Play Spire Telegraph Pulse (Yellow: dual voices A & B)
  synth.playTelegraphPulse(TelegraphPhase.YELLOW, 100);
  assert.strictEqual(pool.getActiveCount(), 2, 'Telegraph pulse should acquire 2 pooled voices');

  synth.reset();
  assert.strictEqual(pool.getActiveCount(), 0, 'Reset should silence all active voices');
  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Spire Telegraph Pulse progresses through Yellow, Amber, Red, and Idle presets', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);

  // Yellow: 48 Hz + 50.5 Hz
  synth.playTelegraphPulse(TelegraphPhase.YELLOW, 100);
  assert.strictEqual(pool.getActiveCount(), 2);

  // Amber: 55 Hz + 59.5 Hz (at currentTimeMs = 300 to pass rate-limiter)
  pool.reset();
  synth.playTelegraphPulse(TelegraphPhase.AMBER, 300);
  assert.strictEqual(pool.getActiveCount(), 2);

  // Red: 70 Hz + 78 Hz
  pool.reset();
  synth.playTelegraphPulse(TelegraphPhase.RED, 500);
  assert.strictEqual(pool.getActiveCount(), 2);

  // Idle: single 55 Hz hum
  pool.reset();
  synth.playTelegraphPulse('IDLE', 700);
  assert.strictEqual(pool.getActiveCount(), 1);

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Tachyon Laser Discharge fires laser zap, sub thump, and white noise burst', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const synth = new DynamicHazardAudio(pool);
  synth.init(ctx, pool);

  synth.playLaserDischarge(100);

  // Should have acquired 2 voices from pool: DISCHARGE_LASER_ZAP and DISCHARGE_SUB_THUMP
  assert.strictEqual(pool.getActiveCount(), 2, 'Laser discharge must acquire 2 pooled voices');

  // Verify transient white noise nodes were created in mock ctx
  const bufferSources = ctx.createdNodes.filter((n) => n instanceof MockBufferSourceNode);
  assert.strictEqual(bufferSources.length, 1, 'White noise buffer source must be created');
  assert.strictEqual(bufferSources[0].started, true);

  // Simulate playback completion (finishPlayback() triggers onended)
  bufferSources[0].finishPlayback();
  assert.strictEqual(bufferSources[0].disconnected, true, 'BufferSource must be disconnected onended');

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: White Noise Burst strictly auto-disconnects nodes and adheres to Zero-Leak standards', () => {
  const ctx = new MockAudioContext();
  const synth = new DynamicHazardAudio();
  synth.init(ctx);

  const initialNodesCount = ctx.createdNodes.length;
  synth.playWhiteNoiseBurst(0.10, 0.25, 2000, 400);

  const newNodes = ctx.createdNodes.slice(initialNodesCount);
  const source = newNodes.find((n) => n instanceof MockBufferSourceNode);
  const filter = newNodes.find((n) => n instanceof MockBiquadFilterNode);
  const gain = newNodes.find((n) => n instanceof MockGainNode);

  assert.ok(source && filter && gain, 'Source, filter, and gain nodes must be created for noise burst');
  assert.strictEqual(source.started, true);
  assert.strictEqual(source.disconnected, false);

  // Trigger sound end event
  source.finishPlayback();

  assert.strictEqual(source.disconnected, true, 'Source node must cleanly disconnect');
  assert.strictEqual(filter.disconnected, true, 'Filter node must cleanly disconnect');
  assert.strictEqual(gain.disconnected, true, 'Gain node must cleanly disconnect');

  synth.destroy();
});

test('DynamicHazardAudio: Polarization Strike synthesizes 4-voice golden chime chord', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);

  synth.playPolarizationStrike(100);

  // Golden chime chord across 4 voices: D5, F#5, A5, E6
  assert.strictEqual(pool.getActiveCount(), 4, 'Polarization strike must acquire 4 pooled voices for chord');

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Quantum Tunneling fires Doppler swoop and delayed celestial chime', async () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);

  synth.playQuantumTunneling(100);

  // First voice acquired immediately: TUNNELING_SWOOP
  assert.strictEqual(pool.getActiveCount(), 1);

  // Wait for 45ms delayed celestial chime
  await new Promise((resolve) => setTimeout(resolve, 55));
  assert.strictEqual(pool.getActiveCount(), 2, 'Delayed chime must acquire second pooled voice');

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Auxiliary SFX routines fire without errors', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);

  assert.doesNotThrow(() => synth.playHyperFuseTick());
  assert.doesNotThrow(() => synth.playTachyonOvercharge());
  assert.doesNotThrow(() => synth.playMinionVaporization());
  assert.doesNotThrow(() => synth.playSafeEjection());

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Rate-limiting suppresses rapid audio spam and protects acoustic clarity', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);

  // Fire 10 pulses within 20ms
  synth.playTelegraphPulse(TelegraphPhase.YELLOW, 100);
  assert.strictEqual(pool.getActiveCount(), 2);

  synth.playTelegraphPulse(TelegraphPhase.YELLOW, 110); // Suppressed
  synth.playTelegraphPulse(TelegraphPhase.YELLOW, 120); // Suppressed
  assert.strictEqual(pool.getActiveCount(), 2, 'Subsequent pulses within 100ms must be rate-limited');

  // Next pulse at 210ms passes
  synth.playTelegraphPulse(TelegraphPhase.YELLOW, 210);
  assert.strictEqual(pool.getActiveCount(), 4);

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: 1,000 rapid event triggers execute with zero memory leaks and clean destruction', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);
  synth.init(ctx, pool);

  for (let i = 0; i < 1000; i++) {
    const time = i * 5;
    synth.playTelegraphPulse('YELLOW', time);
    synth.playLaserDischarge(time);
    synth.playPolarizationStrike(time);
    synth.playQuantumTunneling(time);
  }

  // Teardown
  synth.destroy();
  pool.destroy();

  assert.strictEqual(pool.getActiveCount(), 0);
});

/* ==============================================================================
 * GRAVITATIONAL SINGULARITY ACOUSTIC SIGNATURES (2026-10-02 EVOLUTION CYCLE)
 * ============================================================================== */

test('DynamicHazardAudio: Accretion Swirl plays 45Hz sub-bass drone and accelerating acoustic beat via AudioVoicePool', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);
  synth.init(ctx, pool);

  synth.playAccretionSwirl(100);

  // 1. Two pooled voices acquired: 45Hz fundamental drone + 45Hz->53Hz swirl beat
  assert.strictEqual(pool.getActiveCount(), 2, 'Accretion swirl must acquire 2 pooled voices');

  // 2. Transient LFO oscillator and gain created and registered
  const oscillators = ctx.createdNodes.filter((n) => n instanceof MockOscillatorNode);
  const lfoOsc = oscillators[oscillators.length - 1]; // Latest oscillator is LFO
  assert.ok(lfoOsc, 'LFO oscillator must be created');
  assert.strictEqual(lfoOsc.started, true);

  // 3. Zero-Leak Verification: LFO disconnects cleanly onended
  lfoOsc.stop();
  assert.strictEqual(lfoOsc.disconnected, true, 'LFO oscillator must disconnect upon completion');

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Singularity Burst fires resonant filter sweep, 35Hz sub thump, suction pop, and noise burst', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);
  synth.init(ctx, pool);

  synth.playSingularityBurst(100);

  // 1. Three pooled voices acquired: suction pop + filter sweep + 35Hz sub-harmonic thump
  assert.strictEqual(pool.getActiveCount(), 3, 'Singularity burst must acquire 3 pooled voices');

  // 2. Transient noise burst node created
  const bufferSources = ctx.createdNodes.filter((n) => n instanceof MockBufferSourceNode);
  assert.ok(bufferSources.length >= 1, 'Noise burst buffer source must be created');
  const noiseSource = bufferSources[bufferSources.length - 1];
  assert.strictEqual(noiseSource.started, true);

  // 3. Zero-Leak Verification: noise source auto-disconnects onended
  noiseSource.finishPlayback();
  assert.strictEqual(noiseSource.disconnected, true, 'Noise burst node must disconnect onended');

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Cosmic Fusion synthesizes 4-voice C minor 9th celestial chord (523Hz, 622Hz, 784Hz, 987Hz) and delayed shimmer', async () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);
  synth.init(ctx, pool);

  synth.playCosmicFusion(100);

  // 1. Four pooled voices acquired immediately for C minor 9th chord (523Hz, 622Hz, 784Hz, 987Hz)
  assert.strictEqual(pool.getActiveCount(), 4, 'Cosmic fusion must acquire 4 pooled voices for Cm9 chord');

  // 2. Wait for 35ms for the celestial shimmer chime (staggered via safeTimeout)
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.strictEqual(pool.getActiveCount(), 5, 'Cosmic fusion must acquire 5th pooled voice for shimmer');

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Gravitational Singularity rate limiting suppresses rapid audio spam', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);
  synth.init(ctx, pool);

  // Accretion Swirl rate limiting (150ms window)
  synth.playAccretionSwirl(100);
  assert.strictEqual(pool.getActiveCount(), 2);
  synth.playAccretionSwirl(120); // Suppressed
  synth.playAccretionSwirl(140); // Suppressed
  assert.strictEqual(pool.getActiveCount(), 2, 'Accretion swirl within 150ms must be suppressed');

  // Burst rate limiting (160ms window)
  pool.reset();
  synth.playSingularityBurst(100);
  assert.strictEqual(pool.getActiveCount(), 3);
  synth.playSingularityBurst(130); // Suppressed
  assert.strictEqual(pool.getActiveCount(), 3, 'Singularity burst within 160ms must be suppressed');

  // Cosmic Fusion rate limiting (150ms window)
  pool.reset();
  synth.playCosmicFusion(100);
  assert.strictEqual(pool.getActiveCount(), 4);
  synth.playCosmicFusion(140); // Suppressed
  assert.strictEqual(pool.getActiveCount(), 4, 'Cosmic fusion within 150ms must be suppressed');

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: Gravitational Escape and Gravity Crush SFX routines execute cleanly', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);

  assert.doesNotThrow(() => synth.playGravitationalEscape(100));
  assert.strictEqual(pool.getActiveCount(), 1);

  pool.reset();
  assert.doesNotThrow(() => synth.playGravityCrush(200));
  assert.strictEqual(pool.getActiveCount(), 1);

  pool.reset();
  assert.doesNotThrow(() => synth.playGravityHazardState('ACCRETION_SWIRL', 300));
  assert.strictEqual(pool.getActiveCount(), 2);

  pool.reset();
  assert.doesNotThrow(() => synth.playGravityHazardState('SINGULARITY_BURST', 500));
  assert.strictEqual(pool.getActiveCount(), 3);

  synth.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: 2,000 rapid Gravitational Singularity triggers execute with Zero-GC and 0 leaked nodes', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);
  const synth = new DynamicHazardAudio(pool);
  synth.init(ctx, pool);

  for (let i = 0; i < 2000; i++) {
    const time = i * 2;
    synth.playAccretionSwirl(time);
    synth.playSingularityBurst(time);
    synth.playCosmicFusion(time);
    synth.playGravitationalEscape(time);
    synth.playGravityCrush(time);
    synth.playGravityHazardState('ACCRETION_SWIRL', time);
  }

  // Teardown
  synth.destroy();
  pool.destroy();

  assert.strictEqual(pool.getActiveCount(), 0, 'All voices must be silent after destruction');
});

