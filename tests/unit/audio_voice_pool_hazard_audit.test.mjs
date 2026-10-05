import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioVoicePool } from '../../src/game/pooling/AudioVoicePool.ts';
import { DynamicHazardAudio } from '../../src/game/hazards/DynamicHazardAudio.ts';
import { FrostHazardAudio } from '../../src/game/hazards/FrostHazardAudio.ts';
import { VoltHazardAudio } from '../../src/game/hazards/VoltHazardAudio.ts';
import { MagmaHazardAudio } from '../../src/game/hazards/MagmaHazardAudio.ts';

/**
 * Mock Web Audio API for comprehensive audit verification
 */
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
  constructor(nodeType) {
    this.nodeType = nodeType;
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
    this.nodes = [];
    this.closed = false;
    this.resumed = false;
  }
  createOscillator() {
    const node = new MockOscillatorNode();
    this.nodes.push(node);
    return node;
  }
  createGain() {
    const node = new MockGainNode();
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.nodes.push(node);
    return node;
  }
  createBufferSource() {
    const node = new MockBufferSourceNode();
    this.nodes.push(node);
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
 * AUDIT OBJECTIVE 1: Zero Audio Node Leaks across AudioVoicePool and Synthesizers
 * ============================================================================== */

test('AUDIT 1.1: AudioVoicePool pre-allocates fixed nodes and creates 0 runtime nodes during playTone', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(8);
  pool.init(ctx);

  // 1 masterBus + 8 * (1 osc + 1 filter + 1 gain) = 25 nodes
  const initialNodeCount = ctx.nodes.length;
  assert.strictEqual(initialNodeCount, 25);

  // 500 rapid tone calls should not allocate any new nodes
  for (let i = 0; i < 500; i++) {
    pool.playTone({
      type: 'sawtooth',
      frequency: 220 + (i % 8) * 110,
      duration: 0.1,
      gain: 0.2,
    });
  }

  assert.strictEqual(ctx.nodes.length, initialNodeCount, 'playTone must be 100% Zero-GC without new node allocations');

  pool.destroy();
  const undisconnected = ctx.nodes.filter((n) => !n.disconnected);
  assert.strictEqual(undisconnected.length, 0, 'Every node must be disconnected upon pool.destroy()');
});

test('AUDIT 1.2: Procedural white noise bursts across Dynamic, Volt, and Magma strictly disconnect all transient nodes', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const dynamicAudio = new DynamicHazardAudio(pool);
  dynamicAudio.init(ctx, pool);

  const voltAudio = new VoltHazardAudio(pool);
  voltAudio.init(ctx, pool);

  const magmaAudio = new MagmaHazardAudio(pool);
  magmaAudio.init(ctx, pool);

  // 1. DynamicHazardAudio white noise burst
  dynamicAudio.playWhiteNoiseBurst(0.1, 0.3, 2000, 400);
  // 2. VoltHazardAudio white noise burst
  voltAudio.playWhiteNoiseBurst(0, 0.1, 0.3);
  // 3. MagmaHazardAudio filtered noise burst
  magmaAudio.playFilteredNoiseBurst(0.1, 1000, 200, 0.3);

  // BufferSource, BiquadFilter, Gain created for each
  const bufferSources = ctx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  assert.strictEqual(bufferSources.length, 3, 'Exactly 3 buffer sources created');

  for (const bs of bufferSources) {
    assert.strictEqual(bs.started, true, 'Every buffer source must be started');
    assert.strictEqual(bs.stopped, true, 'Every buffer source must have stop() scheduled');
    // Simulate audio playback end
    bs.finishPlayback();
    assert.strictEqual(bs.disconnected, true, 'Buffer source must be disconnected onended');
  }

  // Teardown all
  dynamicAudio.destroy();
  voltAudio.destroy();
  magmaAudio.destroy();
  pool.destroy();

  const undisconnected = ctx.nodes.filter((n) => !n.disconnected);
  assert.strictEqual(undisconnected.length, 0, 'Zero orphaned nodes after teardown');
});

/* ==============================================================================
 * AUDIT OBJECTIVE 2: Automatic Disconnect on Sound Completion
 * ============================================================================== */

test('AUDIT 2.1: Watchdog safeTimeout disconnects nodes even if onended is delayed or suppressed', async () => {
  const ctx = new MockAudioContext();
  const dynamicAudio = new DynamicHazardAudio();
  dynamicAudio.init(ctx);

  const beforeNodes = ctx.nodes.length;
  dynamicAudio.playWhiteNoiseBurst(0.02, 0.2, 1800, 300);

  const transient = ctx.nodes.slice(beforeNodes);
  const src = transient.find((n) => n instanceof MockBufferSourceNode);
  const flt = transient.find((n) => n instanceof MockBiquadFilterNode);
  const gn = transient.find((n) => n instanceof MockGainNode);

  assert.ok(src && flt && gn);
  assert.strictEqual(src.disconnected, false);

  // Wait for watchdog timer (20ms duration + 50ms buffer = 70ms)
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.strictEqual(src.disconnected, true, 'Watchdog timer must disconnect source');
  assert.strictEqual(flt.disconnected, true, 'Watchdog timer must disconnect filter');
  assert.strictEqual(gn.disconnected, true, 'Watchdog timer must disconnect gain');

  dynamicAudio.destroy();
});

test('AUDIT 2.2: MagmaHazardAudio cached noise buffer eliminates per-burst GC allocations', () => {
  const ctx = new MockAudioContext();
  const magmaAudio = new MagmaHazardAudio(ctx);

  // Trigger multiple filtered noise bursts
  magmaAudio.playFilteredNoiseBurst(0.1, 1000, 200, 0.2);
  const buffer1 = ctx.nodes.find((n) => n instanceof MockBufferSourceNode)?.buffer;

  magmaAudio.playFilteredNoiseBurst(0.1, 800, 150, 0.2);
  const bufferSources = ctx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  const buffer2 = bufferSources[1]?.buffer;

  assert.ok(buffer1 !== null);
  assert.strictEqual(buffer1, buffer2, 'Subsequent noise bursts must reuse cached static AudioBuffer');

  magmaAudio.destroy();
});

/* ==============================================================================
 * AUDIT OBJECTIVE 3: Click-Free Crossfading & Envelope Shaping
 * ============================================================================== */

test('AUDIT 3.1: AudioVoice preemption anchors current gain with setValueAtTime before ramping down', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 10.0;
  const pool = new AudioVoicePool(1);
  pool.init(ctx);

  // Play initial tone and capture active voice
  const voice = pool.playTone({
    type: 'sine',
    frequency: 440,
    duration: 1.0,
    gain: 0.8,
  });
  assert.ok(voice !== null);
  assert.ok(voice.gain !== null);

  // Simulate non-zero running gain (e.g. 0.42)
  voice.gain.gain.value = 0.42;

  // Advance time to 10.2 (while still actively playing until 11.0) and play second tone on the same voice
  ctx.currentTime = 10.2;
  voice.play(
    {
      type: 'triangle',
      frequency: 880,
      duration: 0.5,
      gain: 0.5,
    },
    ctx
  );

  const gainEvents = voice.gain.gain.events;
  const setValueEventsAtPreempt = gainEvents.filter(
    (e) => e.type === 'setValueAtTime' && e.time === 10.2 && e.val === 0.42
  );
  assert.strictEqual(
    setValueEventsAtPreempt.length,
    1,
    'Must anchor current gain at preemption time before scheduling linear ramp'
  );

  const linearRampEvents = gainEvents.filter(
    (e) => e.type === 'linearRampToValueAtTime' && e.time === 10.202 && e.val === 0.0001
  );
  assert.strictEqual(
    linearRampEvents.length,
    1,
    'Must smoothly linear ramp down to 0.0001 over 2ms to prevent speaker click'
  );

  pool.destroy();
});

test('AUDIT 3.2: forceSilence anchors current gain and executes smooth 3ms fade down', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 5.0;
  const pool = new AudioVoicePool(1);
  pool.init(ctx);

  pool.playTone({
    type: 'sawtooth',
    frequency: 330,
    duration: 2.0,
    gain: 0.6,
  });

  const voice = pool.acquireVoice();
  assert.ok(voice !== null && voice.gain !== null);
  voice.gain.gain.value = 0.35;

  ctx.currentTime = 5.5;
  voice.forceSilence(ctx);

  const gainEvents = voice.gain.gain.events;
  const anchorEvent = gainEvents.find(
    (e) => e.type === 'setValueAtTime' && e.time === 5.5 && e.val === 0.35
  );
  assert.ok(anchorEvent, 'forceSilence must anchor running gain value');

  const fadeEvent = gainEvents.find(
    (e) => e.type === 'linearRampToValueAtTime' && e.time === 5.503 && e.val === 0.0001
  );
  assert.ok(fadeEvent, 'forceSilence must linear ramp to 0.0001 over 3ms');

  pool.destroy();
});

/* ==============================================================================
 * AUDIT OBJECTIVE 4: SSR / Headless Safety across All Modules
 * ============================================================================== */

test('AUDIT 4.1: AudioVoicePool is 100% crash-free in headless/SSR environments without AudioContext', () => {
  const pool = new AudioVoicePool(4);

  assert.strictEqual(pool.getAudioContext(), null);
  assert.strictEqual(pool.getActiveCount(), 0);
  assert.strictEqual(pool.acquireVoice(), null);
  assert.strictEqual(pool.playTone({ frequency: 440, duration: 0.2 }), null);

  assert.doesNotThrow(() => pool.reset());
  assert.doesNotThrow(() => pool.stop());
  assert.doesNotThrow(() => pool.disconnect());
  assert.doesNotThrow(() => pool.destroy());
});

test('AUDIT 4.2: DynamicHazardAudio is 100% crash-free when initialized with null or headless environment', () => {
  const dynamicAudio = new DynamicHazardAudio(null);

  assert.doesNotThrow(() => dynamicAudio.playTelegraphPulse('YELLOW', 100));
  assert.doesNotThrow(() => dynamicAudio.playLaserDischarge(200));
  assert.doesNotThrow(() => dynamicAudio.playPolarizationStrike(300));
  assert.doesNotThrow(() => dynamicAudio.playQuantumTunneling(400));
  assert.doesNotThrow(() => dynamicAudio.playAccretionSwirl(500));
  assert.doesNotThrow(() => dynamicAudio.playSingularityBurst(600));
  assert.doesNotThrow(() => dynamicAudio.playCosmicFusion(700));
  assert.doesNotThrow(() => dynamicAudio.playIceShimmer(800));
  assert.doesNotThrow(() => dynamicAudio.playSubZeroRumble(900));
  assert.doesNotThrow(() => dynamicAudio.playGlassShatterDetonation(1000));
  assert.doesNotThrow(() => dynamicAudio.playWhiteNoiseBurst(0.1, 0.2, 1000, 200));
  assert.doesNotThrow(() => dynamicAudio.reset());
  assert.doesNotThrow(() => dynamicAudio.stop());
  assert.doesNotThrow(() => dynamicAudio.disconnect());
  assert.doesNotThrow(() => dynamicAudio.destroy());
});

test('AUDIT 4.3: FrostHazardAudio supports full lifecycle methods and is crash-free with null pool', () => {
  const frostAudio = new FrostHazardAudio(null);

  assert.strictEqual(typeof frostAudio.stop, 'function');
  assert.strictEqual(typeof frostAudio.disconnect, 'function');
  assert.strictEqual(typeof frostAudio.reset, 'function');
  assert.strictEqual(typeof frostAudio.destroy, 'function');
  assert.strictEqual(typeof frostAudio.init, 'function');
  assert.strictEqual(typeof frostAudio.bindPool, 'function');

  assert.doesNotThrow(() => frostAudio.playCrystallization(100));
  assert.doesNotThrow(() => frostAudio.playBlizzardWind(200));
  assert.doesNotThrow(() => frostAudio.playAbsoluteZeroBurst(300));
  assert.doesNotThrow(() => frostAudio.playThawMelt(400));
  assert.doesNotThrow(() => frostAudio.playThermalBreak(500));
  assert.doesNotThrow(() => frostAudio.playFrostChill(600));
  assert.doesNotThrow(() => frostAudio.playFrostHazardState('ABSOLUTE_ZERO_BURST', 700));

  assert.doesNotThrow(() => frostAudio.reset());
  assert.doesNotThrow(() => frostAudio.stop());
  assert.doesNotThrow(() => frostAudio.disconnect());
  assert.doesNotThrow(() => frostAudio.destroy());
});

test('AUDIT 4.4: VoltHazardAudio is crash-free with null pool and supports clean resetInstance', () => {
  const voltAudio = new VoltHazardAudio(null);

  assert.doesNotThrow(() => voltAudio.playHighVoltageHum(100));
  assert.doesNotThrow(() => voltAudio.playIonizationSweep(200));
  assert.doesNotThrow(() => voltAudio.playLightningBurst(300));
  assert.doesNotThrow(() => voltAudio.playSuperconductorDash(400));
  assert.doesNotThrow(() => voltAudio.playStaticDischargePop(500));
  assert.doesNotThrow(() => voltAudio.playWhiteNoiseBurst(600, 0.1, 0.2));
  assert.doesNotThrow(() => voltAudio.reset());
  assert.doesNotThrow(() => voltAudio.stop());
  assert.doesNotThrow(() => voltAudio.disconnect());
  assert.doesNotThrow(() => voltAudio.destroy());
  assert.doesNotThrow(() => VoltHazardAudio.resetInstance());
});

test('AUDIT 4.5: MagmaHazardAudio is crash-free with null pool/context and supports full lifecycle', () => {
  const magmaAudio = new MagmaHazardAudio(null);

  assert.strictEqual(typeof magmaAudio.stop, 'function');
  assert.strictEqual(typeof magmaAudio.disconnect, 'function');
  assert.strictEqual(typeof magmaAudio.reset, 'function');
  assert.strictEqual(typeof magmaAudio.destroy, 'function');
  assert.strictEqual(typeof magmaAudio.init, 'function');
  assert.strictEqual(typeof magmaAudio.bindPool, 'function');

  assert.doesNotThrow(() => magmaAudio.playCrustHeatingHum());
  assert.doesNotThrow(() => magmaAudio.playMagmaUpwellingSizzle());
  assert.doesNotThrow(() => magmaAudio.playEruptionImminentVent());
  assert.doesNotThrow(() => magmaAudio.playPyroclasticBurst());
  assert.doesNotThrow(() => magmaAudio.playMagmaSurf());
  assert.doesNotThrow(() => magmaAudio.playThermalSinge(100));
  assert.doesNotThrow(() => magmaAudio.playObsidianQuenchSnap());
  assert.doesNotThrow(() => magmaAudio.playFilteredNoiseBurst(0.1, 800, 200, 0.2));

  assert.doesNotThrow(() => magmaAudio.reset());
  assert.doesNotThrow(() => magmaAudio.stop());
  assert.doesNotThrow(() => magmaAudio.disconnect());
  assert.doesNotThrow(() => magmaAudio.destroy());
  assert.doesNotThrow(() => MagmaHazardAudio.resetInstance());
});
