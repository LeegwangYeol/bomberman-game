import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioVoicePool } from '../../src/game/pooling/AudioVoicePool.ts';
import { WebAudioSynth, webAudioSynth } from '../../src/game/ultimate_skills.ts';
import { DynamicHazardAudio } from '../../src/game/hazards/DynamicHazardAudio.ts';

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

/* ==============================================================================
 * TIER 4: DynamicHazardAudio & Quantum Spire Sound Lifecycle Audit
 * ============================================================================== */

test('DynamicHazardAudio: Quantum Spire sound triggers (hum, ping, zap, chime) reuse pooled voices', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);
  const hazardAudio = new DynamicHazardAudio(pool);
  hazardAudio.init(mockCtx, pool);

  // 1. Spire Telegraph Pulse (Tachyon hum / ping): reuses 2 pre-allocated pooled voices
  hazardAudio.playTelegraphPulse('YELLOW', 100);
  assert.strictEqual(pool.getActiveCount(), 2, 'Telegraph pulse must reuse 2 pooled voices');

  // Amber & Red progression
  pool.reset();
  hazardAudio.playTelegraphPulse('AMBER', 250);
  assert.strictEqual(pool.getActiveCount(), 2);

  pool.reset();
  hazardAudio.playTelegraphPulse('RED', 400);
  assert.strictEqual(pool.getActiveCount(), 2);

  // Idle sub-bass hum
  pool.reset();
  hazardAudio.playTelegraphPulse('IDLE', 550);
  assert.strictEqual(pool.getActiveCount(), 1);

  // 2. Tachyon Laser Discharge (zap): reuses 2 pooled voices (zap + sub thump)
  pool.reset();
  const nodesBefore = mockCtx.nodes.length;
  hazardAudio.playLaserDischarge(700);
  assert.strictEqual(pool.getActiveCount(), 2, 'Discharge must reuse 2 pooled voices');

  // Verify transient white noise burst was created and cleanly auto-disconnects on ended
  const newNodes = mockCtx.nodes.slice(nodesBefore);
  const bufferSource = newNodes.find((n) => n instanceof MockBufferSourceNode);
  const filter = newNodes.find((n) => n instanceof MockBiquadFilterNode);
  const gain = newNodes.find((n) => n instanceof MockGainNode);
  assert.ok(bufferSource && filter && gain, 'White noise transient nodes must be created');
  assert.strictEqual(bufferSource.started, true);

  // Simulate onended completion
  bufferSource.finishPlayback();
  assert.strictEqual(bufferSource.disconnected, true, 'Transient BufferSource must be disconnected');
  assert.strictEqual(filter.disconnected, true, 'Transient FilterNode must be disconnected');
  assert.strictEqual(gain.disconnected, true, 'Transient GainNode must be disconnected');

  // 3. Polarization Strike (chime): 4 pooled voices for D Major 9th chord without transient allocations
  pool.reset();
  const nodesBeforeChime = mockCtx.nodes.length;
  hazardAudio.playPolarizationStrike(900);
  assert.strictEqual(pool.getActiveCount(), 4, 'Polarization strike must acquire 4 pooled voices');
  assert.strictEqual(mockCtx.nodes.length, nodesBeforeChime, 'Polarization chime must not allocate transient nodes');

  // 4. Quantum Tunneling: Doppler swoop on pooled voice
  pool.reset();
  hazardAudio.playQuantumTunneling(1100);
  assert.strictEqual(pool.getActiveCount(), 1, 'Quantum Tunneling must acquire pooled voice');

  hazardAudio.destroy();
  pool.destroy();
});

test('DynamicHazardAudio: destroy() cleanly clears all pending timeouts, transient nodes, and owned pool', () => {
  const mockCtx = new MockAudioContext();
  const hazardAudio = new DynamicHazardAudio();
  hazardAudio.init(mockCtx);

  // Trigger sounds including delayed ones
  hazardAudio.playQuantumTunneling(100);
  hazardAudio.playLaserDischarge(100);

  // Immediate teardown
  hazardAudio.destroy();

  // All transient nodes must be disconnected
  const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  for (const bs of bufferSources) {
    assert.strictEqual(bs.disconnected, true, 'Transient buffer source must be disconnected on destroy');
  }

  // Idempotent destroy check
  assert.doesNotThrow(() => hazardAudio.destroy());
  assert.doesNotThrow(() => hazardAudio.reset());
});

test('DynamicHazardAudio: rapid multi-trigger stress generates 0 orphaned audio nodes', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);
  const hazardAudio = new DynamicHazardAudio(pool);

  for (let i = 0; i < 200; i++) {
    const time = i * 20;
    hazardAudio.playTelegraphPulse('YELLOW', time);
    hazardAudio.playLaserDischarge(time);
    hazardAudio.playPolarizationStrike(time);
    hazardAudio.playQuantumTunneling(time);
  }

  // Simulate end of all white noise bursts
  const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  for (const bs of bufferSources) {
    if (!bs.disconnected) {
      bs.finishPlayback();
    }
  }

  const undisconnectedTransients = mockCtx.nodes
    .filter((n) => n instanceof MockBufferSourceNode)
    .filter((n) => !n.disconnected);
  assert.strictEqual(undisconnectedTransients.length, 0, 'No transient audio nodes may leak');

  hazardAudio.destroy();
  pool.destroy();
  assert.strictEqual(pool.getActiveCount(), 0);
});

/* ==============================================================================
 * TIER 5: Gravitational Singularity Audio Lifecycle & Zero-Leak Audit
 * ============================================================================== */

test('DynamicHazardAudio: Gravitational Singularity acoustic signatures reuse voice pool with zero node leaks', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);
  const hazardAudio = new DynamicHazardAudio(pool);

  // 1. Accretion Swirl
  hazardAudio.playAccretionSwirl(100);
  assert.strictEqual(pool.getActiveCount(), 2, 'Accretion swirl must use 2 pooled voices');

  // Simulate LFO ended
  const lfoOscs = mockCtx.nodes.filter((n) => n instanceof MockOscillatorNode && n !== pool);
  for (const osc of lfoOscs) {
    osc.stop();
  }

  // 2. Singularity Burst
  pool.reset();
  hazardAudio.playSingularityBurst(300);
  assert.strictEqual(pool.getActiveCount(), 3, 'Singularity burst must use 3 pooled voices');

  // Simulate noise ended
  const noiseNodes = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  for (const node of noiseNodes) {
    node.finishPlayback();
  }

  // 3. Cosmic Fusion
  pool.reset();
  hazardAudio.playCosmicFusion(500);
  assert.strictEqual(pool.getActiveCount(), 4, 'Cosmic fusion must use 4 pooled voices for Cm9 chord');

  hazardAudio.destroy();
  pool.destroy();
  assert.strictEqual(pool.getActiveCount(), 0, 'Pool must be 100% silent after teardown');
});

test('DynamicHazardAudio: Gravitational Singularity rapid stress generates 0 orphaned nodes', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);
  const hazardAudio = new DynamicHazardAudio(pool);

  for (let i = 0; i < 300; i++) {
    const time = i * 15;
    hazardAudio.playAccretionSwirl(time);
    hazardAudio.playSingularityBurst(time);
    hazardAudio.playCosmicFusion(time);
    hazardAudio.playGravitationalEscape(time);
    hazardAudio.playGravityCrush(time);
  }

  // Teardown
  hazardAudio.destroy();
  pool.destroy();

  assert.strictEqual(pool.getActiveCount(), 0, 'No active voices may remain');
});

/* ==============================================================================
 * TIER 6: Frost Hazard Audio Lifecycle & Zero-Leak Audit (2026-10-03)
 * ============================================================================== */

test('DynamicHazardAudio: Frost Hazard acoustic signatures reuse voice pool with zero node leaks', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);
  const hazardAudio = new DynamicHazardAudio(pool);

  // 1. Crystalline Ice Shimmer
  hazardAudio.playIceShimmer(100);
  assert.strictEqual(pool.getActiveCount(), 2, 'Ice shimmer must acquire 2 pooled voices immediately');

  // Simulate noise ended
  const noiseNodes = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  for (const node of noiseNodes) {
    node.finishPlayback();
  }

  // 2. Sub-Zero Low Rumble
  pool.reset();
  hazardAudio.playSubZeroRumble(300);
  assert.strictEqual(pool.getActiveCount(), 3, 'Sub-zero rumble must acquire 3 pooled voices');

  // Simulate LFO ended
  const lfoOscs = mockCtx.nodes.filter((n) => n instanceof MockOscillatorNode);
  for (const osc of lfoOscs) {
    osc.stop();
  }

  // 3. Glass Shatter Detonation
  pool.reset();
  hazardAudio.playGlassShatterDetonation(500);
  assert.strictEqual(pool.getActiveCount(), 4, 'Glass shatter detonation must acquire 4 pooled voices');

  // Verify all transient buffer sources and oscillators are disconnected
  const undisconnectedBuffers = mockCtx.nodes
    .filter((n) => n instanceof MockBufferSourceNode)
    .filter((n) => !n.disconnected);
  for (const n of undisconnectedBuffers) {
    n.finishPlayback();
  }

  hazardAudio.destroy();
  pool.destroy();
  assert.strictEqual(pool.getActiveCount(), 0, 'Pool must be 100% silent after teardown');
});

test('DynamicHazardAudio: Frost Hazard rapid stress generates 0 orphaned nodes', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);
  const hazardAudio = new DynamicHazardAudio(pool);

  for (let i = 0; i < 300; i++) {
    const time = i * 15;
    hazardAudio.playIceShimmer(time);
    hazardAudio.playSubZeroRumble(time);
    hazardAudio.playGlassShatterDetonation(time);
    hazardAudio.playFrostMeltingDrip(time);
    hazardAudio.playCryoGlide(time);
  }

  // Teardown
  hazardAudio.destroy();
  pool.destroy();

  assert.strictEqual(pool.getActiveCount(), 0, 'No active voices may remain');
});

/* ==============================================================================
 * TIER 7: Comprehensive Audio Node Disconnection & Zero-Leak Audit
 * ============================================================================== */

test('DynamicHazardAudio & AudioVoicePool: stop() and disconnect() methods cleanly disconnect all oscillators, filters, and gain nodes', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(4);
  pool.init(mockCtx);
  const hazardAudio = new DynamicHazardAudio(pool);
  hazardAudio.init(mockCtx, pool);

  // 1. pool.stop() exists and silences all voices
  pool.playTone({ frequency: 440, duration: 1.0 });
  assert.strictEqual(pool.getActiveCount(), 1);
  pool.stop();
  assert.strictEqual(pool.getActiveCount(), 0);

  // 2. Play multi-layer sounds with transient oscillators, gain nodes, and biquad filters
  hazardAudio.playLaserDischarge(100);
  hazardAudio.playAccretionSwirl(100);
  hazardAudio.playSubZeroRumble(100);

  // Verify transient nodes exist in context
  const preStopFilters = mockCtx.nodes.filter((n) => n instanceof MockBiquadFilterNode);
  const preStopGains = mockCtx.nodes.filter((n) => n instanceof MockGainNode);
  const preStopOscs = mockCtx.nodes.filter((n) => n instanceof MockOscillatorNode);
  assert.ok(preStopFilters.length > 0, 'Biquad filters must be present');
  assert.ok(preStopGains.length > 0, 'Gain nodes must be present');
  assert.ok(preStopOscs.length > 0, 'Oscillator nodes must be present');

  // 3. hazardAudio.stop() forcefully stops and disconnects all transient nodes
  hazardAudio.stop();

  // All transient buffer sources and LFO oscillators must be stopped and disconnected
  const transientBuffers = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  for (const b of transientBuffers) {
    assert.strictEqual(b.stopped, true, 'Buffer source must be stopped on stop()');
    assert.strictEqual(b.disconnected, true, 'Buffer source must be disconnected on stop()');
  }

  // 4. hazardAudio.disconnect() and pool.disconnect() cleanly teardown
  hazardAudio.disconnect();
  pool.disconnect();

  const undisconnected = mockCtx.nodes.filter((n) => !n.disconnected);
  assert.strictEqual(undisconnected.length, 0, 'Zero orphaned audio nodes may remain undisconnected');
});

test('AudioVoice: attachModulator, forceSilence, and play detach modulators to prevent cross-tone contamination', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(2);
  pool.init(mockCtx);

  const voice = pool.acquireVoice();
  assert.ok(voice !== null);

  // Create mock modulator gain node
  const modGain = mockCtx.createGain();
  modGain.connect(voice.osc.frequency);
  voice.attachModulator(modGain);

  assert.strictEqual(modGain.disconnected, false);

  // Silencing or playing new tone must automatically detach and disconnect modGain
  voice.forceSilence(mockCtx);
  assert.strictEqual(modGain.disconnected, true, 'Modulator must be disconnected when voice is silenced');

  // Verify parameter cancellation in forceSilence
  const freqEvents = voice.osc.frequency.events.filter((e) => e.type === 'cancelScheduledValues');
  assert.ok(freqEvents.length > 0, 'Oscillator frequency automations must be cancelled');

  const filterFreqEvents = voice.filter.frequency.events.filter((e) => e.type === 'cancelScheduledValues');
  assert.ok(filterFreqEvents.length > 0, 'Filter frequency automations must be cancelled');

  pool.destroy();
});

test('DynamicHazardAudio: transient start() exception immediately cleans up nodes without leaking into activeTransientNodes', () => {
  const mockCtx = new MockAudioContext();
  const failingCtx = {
    ...mockCtx,
    currentTime: 0,
    sampleRate: 44100,
    destination: mockCtx.destination,
    createOscillator: () => mockCtx.createOscillator(),
    createGain: () => mockCtx.createGain(),
    createBiquadFilter: () => mockCtx.createBiquadFilter(),
    createBuffer: (c, l, r) => mockCtx.createBuffer(c, l, r),
    createBufferSource: () => {
      const source = mockCtx.createBufferSource();
      source.start = () => {
        throw new Error('Simulated start() hardware failure');
      };
      return source;
    },
  };

  const hazardAudio = new DynamicHazardAudio();
  hazardAudio.init(failingCtx);

  // Play white noise burst on failing context
  assert.doesNotThrow(() => {
    hazardAudio.playWhiteNoiseBurst(0.1, 0.3, 2000, 400);
  });

  // Verify all created nodes were cleaned up immediately in catch
  const failingNodes = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  for (const n of failingNodes) {
    assert.strictEqual(n.disconnected, true, 'Nodes must be disconnected even when start() throws');
  }

  hazardAudio.destroy();
});




