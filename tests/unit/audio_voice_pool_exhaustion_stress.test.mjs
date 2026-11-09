import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioVoicePool, AudioVoice } from '../../src/game/pooling/AudioVoicePool.ts';

/**
 * Headless Web Audio API Mock designed for high-stress audio testing
 */
class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.events = [];
  }
  setValueAtTime(val, time) {
    if (!Number.isFinite(val) || !Number.isFinite(time)) {
      throw new TypeError(`setValueAtTime received non-finite values: val=${val}, time=${time}`);
    }
    this.value = val;
    this.events.push({ type: 'setValueAtTime', val, time });
  }
  linearRampToValueAtTime(val, time) {
    if (!Number.isFinite(val) || !Number.isFinite(time)) {
      throw new TypeError(`linearRampToValueAtTime received non-finite values: val=${val}, time=${time}`);
    }
    this.value = val;
    this.events.push({ type: 'linearRampToValueAtTime', val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    if (!Number.isFinite(val) || !Number.isFinite(time) || val <= 0) {
      throw new RangeError(`exponentialRampToValueAtTime received non-positive or non-finite val: val=${val}, time=${time}`);
    }
    this.value = val;
    this.events.push({ type: 'exponentialRampToValueAtTime', val, time });
  }
  cancelScheduledValues(time) {
    if (!Number.isFinite(time)) {
      throw new TypeError(`cancelScheduledValues received non-finite time: ${time}`);
    }
    this.events.push({ type: 'cancelScheduledValues', time });
  }
}

class MockAudioNode {
  constructor(type = 'Node') {
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
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
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
    this.type = 'allpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 1.0;
    this.destination = new MockAudioNode('Destination');
    this.state = 'running';
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
  async resume() {
    this.state = 'running';
  }
}

test('AudioVoicePool: 500 simultaneous sound triggers simulate voice exhaustion without throwing audio exceptions', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 5.0;
  const capacity = 16;
  const pool = new AudioVoicePool(capacity);
  pool.init(ctx);

  assert.strictEqual(pool.capacity, 16);
  assert.strictEqual(pool.getActiveCount(), 0);

  let successCount = 0;
  let exceptionCount = 0;

  // Trigger 500 simultaneous sounds in the exact same millisecond window
  assert.doesNotThrow(() => {
    for (let i = 0; i < 500; i++) {
      try {
        const priority = (i % 5) * 2; // Priorities: 0, 2, 4, 6, 8
        const voice = pool.playTone({
          type: (i % 2 === 0) ? 'sine' : 'sawtooth',
          frequency: 200 + (i * 3) % 800,
          gain: 0.3,
          duration: 0.5 + ((i % 10) * 0.1),
          priority,
        });
        if (voice) {
          successCount++;
        }
      } catch (err) {
        exceptionCount++;
      }
    }
  }, 'AudioVoicePool must never throw exceptions during 500 simultaneous triggers');

  assert.strictEqual(exceptionCount, 0, 'Zero audio exceptions must occur across 500 triggers');
  assert.ok(successCount > 0, 'Successful tone play calls must be recorded');
  assert.strictEqual(pool.getActiveCount(), capacity, 'Active voices must be fully utilized at capacity');

  pool.destroy();
});

test('AudioVoicePool: priority preemption gracefully recycles lowest-priority channels under exhaustion', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 10.0;
  const pool = new AudioVoicePool(4); // Compact 4-voice pool
  pool.init(ctx);

  // Fill pool with 2 low-priority voices (priority 1) and 2 medium-priority voices (priority 5)
  const v0 = pool.playTone({ frequency: 200, duration: 2.0, priority: 1 });
  const v1 = pool.playTone({ frequency: 220, duration: 2.0, priority: 1 });
  const v2 = pool.playTone({ frequency: 300, duration: 2.0, priority: 5 });
  const v3 = pool.playTone({ frequency: 320, duration: 2.0, priority: 5 });

  assert.strictEqual(pool.getActiveCount(), 4);
  assert.strictEqual(v0.priority, 1);
  assert.strictEqual(v1.priority, 1);
  assert.strictEqual(v2.priority, 5);
  assert.strictEqual(v3.priority, 5);

  // Trigger an ultra-low priority sound (priority 0).
  // All channels currently have priority >= 1, so priority 0 must be gracefully dropped without stealing or throwing!
  const droppedVoice = pool.playTone({ frequency: 100, duration: 1.0, priority: 0 });
  assert.strictEqual(droppedVoice, null, 'Sound with priority strictly lower than active voices must return null');
  assert.strictEqual(pool.getActiveCount(), 4);

  // Now trigger high-priority sound (priority 10). It MUST preempt one of the priority 1 voices!
  const preempted1 = pool.playTone({ frequency: 880, duration: 1.5, priority: 10 });
  assert.ok(preempted1 !== null, 'High priority tone must successfully acquire a voice');
  assert.strictEqual(preempted1.priority, 10);
  assert.ok(preempted1.id === 0 || preempted1.id === 1, 'Preemption must target priority 1 channels, not priority 5');

  // Trigger another high-priority sound (priority 10). It MUST preempt the other priority 1 voice!
  const preempted2 = pool.playTone({ frequency: 990, duration: 1.5, priority: 10 });
  assert.ok(preempted2 !== null);
  assert.strictEqual(preempted2.priority, 10);
  assert.ok(preempted2.id === 0 || preempted2.id === 1, 'Both priority 1 channels should be recycled');
  assert.notStrictEqual(preempted1.id, preempted2.id, 'Both low priority channels should be recycled individually');

  // Now active voices consist of: 2 voices of priority 5, and 2 voices of priority 10.
  // Triggering priority 10 again should now preempt one of the priority 5 channels!
  const preempted3 = pool.playTone({ frequency: 1200, duration: 1.5, priority: 10 });
  assert.ok(preempted3 !== null);
  assert.strictEqual(preempted3.priority, 10);
  assert.ok(preempted3.id === 2 || preempted3.id === 3, 'Preemption must now recycle priority 5 channels');

  pool.destroy();
});

test('AudioVoicePool: 500-trigger fuzz test with random priorities never violates parameter constraints', () => {
  const ctx = new MockAudioContext();
  ctx.currentTime = 20.0;
  const pool = new AudioVoicePool(8);
  pool.init(ctx);

  let exceptions = 0;
  for (let i = 0; i < 500; i++) {
    try {
      const priority = Math.floor(Math.sin(i) * 10) + 10; // priority in [0, 20]
      const duration = 0.05 + ((i % 15) * 0.02);
      const gain = (i % 20 === 0) ? 0 : 0.2 + (i % 5) * 0.1;
      pool.playTone({
        type: 'triangle',
        frequency: 100 + (i * 7) % 1500,
        frequencyRamp: {
          target: 50 + (i * 3) % 400,
          duration: 0.02,
          exponential: true,
        },
        gain,
        duration,
        attackTime: 0.005,
        priority,
      });
    } catch (e) {
      exceptions++;
    }
  }

  assert.strictEqual(exceptions, 0, 'Zero exceptions during 500 random priority triggers');
  assert.strictEqual(pool.getActiveCount(), 8);

  // Advance time past all durations and verify complete reclamation
  ctx.currentTime = 25.0;
  assert.strictEqual(pool.getActiveCount(), 0, 'All voices must be reclaimed after duration expires');

  pool.destroy();
});

test('AudioVoicePool: 500 triggers in headless SSR environment without AudioContext is 100% crash-free', () => {
  const pool = new AudioVoicePool(16);
  assert.strictEqual(pool.getContext(), null);

  let exceptions = 0;
  for (let i = 0; i < 500; i++) {
    try {
      const v = pool.playTone({
        frequency: 440 + i,
        duration: 0.2,
        priority: i % 10,
      });
      assert.strictEqual(v, null);
    } catch {
      exceptions++;
    }
  }

  assert.strictEqual(exceptions, 0);
  assert.strictEqual(pool.getActiveCount(), 0);
  assert.doesNotThrow(() => pool.reset());
  assert.doesNotThrow(() => pool.destroy());
});
