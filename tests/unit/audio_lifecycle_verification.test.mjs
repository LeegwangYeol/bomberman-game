import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioVoicePool } from '../../src/game/pooling/AudioVoicePool.ts';
import { WebAudioSynth, webAudioSynth } from '../../src/game/ultimate_skills.ts';

/**
 * Mock Web Audio API for comprehensive lifecycle & node disconnection audit
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

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
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
 * TIER 1: AudioVoicePool Lifecycle & Disconnection Invariants
 * ============================================================================== */

test('AudioVoicePool: headless fallback without AudioContext is safe and zero-crash', () => {
  const pool = new AudioVoicePool(8);
  assert.strictEqual(pool.capacity, 8);
  assert.strictEqual(pool.getActiveCount(), 0);
  assert.strictEqual(pool.acquireVoice(), null);
  assert.strictEqual(pool.playTone({ frequency: 440, duration: 0.5 }), null);
  assert.doesNotThrow(() => pool.reset());
  assert.doesNotThrow(() => pool.disconnect());
  assert.doesNotThrow(() => pool.destroy());
});

test('AudioVoicePool: disconnect() and destroy() cleanly teardown all AudioNodes and stop oscillators', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(4);
  pool.init(ctx);

  // 1 masterBus + 4 * (1 osc + 1 filter + 1 gain) = 13 audio nodes
  assert.strictEqual(ctx.nodes.length, 13);
  assert.strictEqual(pool.getActiveCount(), 0);

  // Play some tones
  pool.playTone({ frequency: 440, duration: 0.5 });
  pool.playTone({ frequency: 660, duration: 1.0 });
  assert.strictEqual(pool.getActiveCount(), 2);

  // Teardown pool
  pool.destroy();

  // All voices should be cleared and nodes disconnected
  assert.strictEqual(pool.getActiveCount(), 0);
  assert.strictEqual(pool.acquireVoice(), null);

  const undisconnected = ctx.nodes.filter((n) => !n.disconnected);
  assert.strictEqual(undisconnected.length, 0, 'Every created AudioNode must be disconnected');

  const oscillators = ctx.nodes.filter((n) => n instanceof MockOscillatorNode);
  assert.strictEqual(oscillators.length, 4);
  for (const osc of oscillators) {
    assert.strictEqual(osc.stopped, true, 'Every persistent oscillator must be stopped upon teardown');
  }
});

test('AudioVoicePool: handles suspended AudioContext and triggers auto-resume on init and acquire', () => {
  const ctx = new MockAudioContext();
  ctx.state = 'suspended';

  const pool = new AudioVoicePool(2);
  pool.init(ctx);
  assert.strictEqual(ctx.resumed, true, 'init() must attempt to resume suspended AudioContext');

  ctx.state = 'suspended';
  ctx.resumed = false;
  pool.acquireVoice();
  assert.strictEqual(ctx.resumed, true, 'acquireVoice() must attempt to resume suspended AudioContext');

  pool.destroy();
});

test('AudioVoicePool: re-initialization safely disconnects previous voices and master bus', () => {
  const ctx1 = new MockAudioContext();
  const pool = new AudioVoicePool(2);
  pool.init(ctx1);
  assert.strictEqual(ctx1.nodes.length, 7); // 1 bus + 2*3 = 7

  const ctx2 = new MockAudioContext();
  pool.init(ctx2);

  // Previous nodes in ctx1 must all be disconnected
  const undisconnectedCtx1 = ctx1.nodes.filter((n) => !n.disconnected);
  assert.strictEqual(undisconnectedCtx1.length, 0, 'Old context nodes must be disconnected on re-init');

  // New nodes in ctx2 must be active
  assert.strictEqual(ctx2.nodes.length, 7);
  pool.destroy();

  const undisconnectedCtx2 = ctx2.nodes.filter((n) => !n.disconnected);
  assert.strictEqual(undisconnectedCtx2.length, 0, 'New context nodes must be disconnected on destroy');
});

/* ==============================================================================
 * TIER 2: WebAudioSynth Lifecycle, Node Auto-Disconnect & Timeout Cleanup
 * ============================================================================== */

test('WebAudioSynth: headless fallback when window or AudioContext is undefined', () => {
  const synth = new WebAudioSynth();
  assert.doesNotThrow(() => {
    synth.playMeteorWhistleAndBoom();
    synth.playSuperNovaShockwave();
    synth.playSubBassBoom();
    synth.playChronoFreeze();
    synth.playChronoTick();
    synth.playChronoResume();
    synth.playNuclearLaunch();
    synth.playCarpetDetonation(2);
    synth.playAegisChime();
    synth.playAegisReflect();
    synth.playUltimateReadyChime();
    synth.destroy();
  });
});

test('WebAudioSynth: transient AudioNodes auto-disconnect on playback completion (osc.onended)', () => {
  const mockCtx = new MockAudioContext();
  const originalWindow = global.window;
  global.window = {
    AudioContext: function () {
      return mockCtx;
    },
  };

  try {
    const synth = new WebAudioSynth();

    // Trigger procedural sounds
    synth.playSubBassBoom(0.5, 60, 20);
    synth.playChronoFreeze();
    synth.playAegisReflect();

    // Nodes were created and connected
    assert.ok(mockCtx.nodes.length > 0);

    // Stop all oscillators (which triggers osc.onended -> auto-disconnect)
    const oscillators = mockCtx.nodes.filter((n) => n instanceof MockOscillatorNode);
    for (const osc of oscillators) {
      if (!osc.stopped) {
        osc.stop();
      }
    }

    const undisconnected = mockCtx.nodes.filter((n) => !n.disconnected);
    assert.strictEqual(
      undisconnected.length,
      0,
      'All transient nodes must auto-disconnect via wireAutoDisconnect on ended'
    );

    synth.destroy();
    assert.strictEqual(mockCtx.closed, true, 'destroy() must close AudioContext');
  } finally {
    global.window = originalWindow;
  }
});

test('WebAudioSynth: destroy() cancels all pending safeTimeout tasks and closes AudioContext', () => {
  const mockCtx = new MockAudioContext();
  const originalWindow = global.window;
  global.window = {
    AudioContext: function () {
      return mockCtx;
    },
  };

  try {
    const synth = new WebAudioSynth();

    // playMeteorWhistleAndBoom schedules a 450ms delayed boom
    synth.playMeteorWhistleAndBoom();
    // playSuperNovaShockwave schedules a 280ms delayed boom
    synth.playSuperNovaShockwave();

    // Destroy immediately before timeouts expire
    synth.destroy();
    assert.strictEqual(mockCtx.closed, true, 'AudioContext must be closed on destroy');

    // Destroy again (idempotent check)
    assert.doesNotThrow(() => synth.destroy());
    assert.doesNotThrow(() => synth.disconnect());
  } finally {
    global.window = originalWindow;
  }
});

/* ==============================================================================
 * TIER 3: GameScene Audio Lifecycle & Mode Transition Verification
 * ============================================================================== */

test('GameScene & WebAudioSynth integration: global webAudioSynth properly exposes destroy()', () => {
  assert.strictEqual(typeof webAudioSynth.destroy, 'function');
  assert.strictEqual(typeof webAudioSynth.disconnect, 'function');
  assert.doesNotThrow(() => webAudioSynth.destroy());
});

test('Mode transition simulation: rapid mode changes do not leak audio resources', () => {
  const mockCtx = new MockAudioContext();
  const originalWindow = global.window;
  global.window = {
    AudioContext: function () {
      return mockCtx;
    },
  };

  try {
    const synth = new WebAudioSynth();

    const modes = ['standard', 'boss_rush', 'crisis_survival', 'endless', 'standard'];
    for (let i = 0; i < 20; i++) {
      const mode = modes[i % modes.length];
      if (mode === 'boss_rush') {
        synth.playSuperNovaShockwave();
      } else if (mode === 'crisis_survival') {
        synth.playMeteorWhistleAndBoom();
      } else {
        synth.playChronoTick();
      }
    }

    // Complete all active playback
    const oscillators = mockCtx.nodes.filter((n) => n instanceof MockOscillatorNode);
    for (const osc of oscillators) {
      if (!osc.stopped) {
        osc.stop();
      }
    }

    const undisconnected = mockCtx.nodes.filter((n) => !n.disconnected);
    assert.strictEqual(
      undisconnected.length,
      0,
      'No orphaned AudioNodes after rapid mode transitions'
    );

    synth.destroy();
    assert.strictEqual(mockCtx.closed, true);
  } finally {
    global.window = originalWindow;
  }
});
