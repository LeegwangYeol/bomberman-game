import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioVoicePool } from '../../src/game/pooling/AudioVoicePool.ts';

/**
 * Headless Web Audio API Mock for zero-dependency node testing
 */
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
  constructor() {
    this.connectedTo = [];
  }
  connect(dest) {
    this.connectedTo.push(dest);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = new MockAudioNode();
  }
  createOscillator() {
    return new MockOscillatorNode();
  }
  createGain() {
    return new MockGainNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
}

test('AudioVoicePool: headless fallback without AudioContext is zero-crash', () => {
  const pool = new AudioVoicePool(8);
  assert.strictEqual(pool.capacity, 8);
  assert.strictEqual(pool.getActiveCount(), 0);
  assert.strictEqual(pool.acquireVoice(), null);
  assert.strictEqual(pool.playTone({ frequency: 440, duration: 0.5 }), null);
  assert.doesNotThrow(() => pool.reset());
});

test('AudioVoicePool: initializes fixed capacity voices with persistent running oscillators', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  assert.strictEqual(pool.capacity, 16);
  assert.strictEqual(pool.getActiveCount(), 0);

  // Acquire first voice
  const voice = pool.acquireVoice();
  assert.ok(voice !== null);
  assert.strictEqual(voice.id, 0);
  assert.strictEqual(voice.isBusy, true);
  assert.ok(voice.osc.started, 'Persistent oscillator must have started during init');
});

test('AudioVoicePool: plays tone and configures envelope, waveform, and filter parameters', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 10.0;
  const pool = new AudioVoicePool(4);
  pool.init(ctx);

  const voice = pool.playTone({
    type: 'sawtooth',
    frequency: 800,
    frequencyRamp: { target: 200, duration: 0.3, exponential: true },
    gain: 0.5,
    duration: 0.4,
    attackTime: 0.01,
    filter: {
      type: 'lowpass',
      frequency: 1000,
      q: 2,
    },
  });

  assert.ok(voice !== null);
  assert.strictEqual(voice.osc.type, 'sawtooth');
  assert.strictEqual(voice.startTime, 10.0);
  assert.strictEqual(voice.endTime, 10.4);
  assert.strictEqual(voice.filter.type, 'lowpass');
  assert.strictEqual(pool.getActiveCount(), 1);

  // Advance time past endTime
  ctx.currentTime = 10.5;
  assert.strictEqual(pool.getActiveCount(), 0);
});

test('AudioVoicePool: recycles expired voices before stealing active voices', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 0;
  const pool = new AudioVoicePool(2);
  pool.init(ctx);

  // Play voice 1 for 0.5s
  const v1 = pool.playTone({ frequency: 440, duration: 0.5 });
  assert.strictEqual(v1.id, 0);

  // Play voice 2 for 1.0s
  const v2 = pool.playTone({ frequency: 880, duration: 1.0 });
  assert.strictEqual(v2.id, 1);

  // Advance clock to 0.6s (v1 expired, v2 still active)
  ctx.currentTime = 0.6;
  assert.strictEqual(pool.getActiveCount(), 1);

  // Requesting new tone must recycle v1 without voice stealing
  const v3 = pool.playTone({ frequency: 220, duration: 0.5 });
  assert.strictEqual(v3.id, 0);
  assert.strictEqual(pool.getActiveCount(), 2);
});

test('AudioVoicePool: intelligent voice stealing reclaims voice nearest to completion when capacity exhausted', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 1.0;
  const pool = new AudioVoicePool(3);
  pool.init(ctx);

  // Voice 0 ends at 1.0 + 0.8 = 1.8s
  pool.playTone({ frequency: 300, duration: 0.8 });
  // Voice 1 ends at 1.0 + 0.3 = 1.3s (finishes earliest!)
  pool.playTone({ frequency: 400, duration: 0.3 });
  // Voice 2 ends at 1.0 + 0.9 = 1.9s
  pool.playTone({ frequency: 500, duration: 0.9 });

  assert.strictEqual(pool.getActiveCount(), 3);

  // Pool is now 100% full. Playing another tone triggers voice stealing
  // Voice 1 has least remaining duration (0.3s remaining), so it should be stolen!
  const stolenVoice = pool.playTone({ frequency: 1200, duration: 0.4 });
  assert.strictEqual(stolenVoice.id, 1, 'Voice with smallest remaining duration must be stolen');
  assert.strictEqual(stolenVoice.endTime, 1.4);
});

test('AudioVoicePool: reset forces silence on all voices', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 5.0;
  const pool = new AudioVoicePool(4);
  pool.init(ctx);

  pool.playTone({ frequency: 440, duration: 1.0 });
  pool.playTone({ frequency: 550, duration: 1.0 });
  assert.strictEqual(pool.getActiveCount(), 2);

  pool.reset();
  // After reset and 3ms fade window
  ctx.currentTime = 5.004;
  assert.strictEqual(pool.getActiveCount(), 0);
});
