import test from 'node:test';
import assert from 'node:assert/strict';

// Audio Synthesizers under audit
import { AbyssalHazardAudio } from '../../src/game/hazards/AbyssalHazardAudio.ts';
import { ChronoHazardAudio } from '../../src/game/hazards/ChronoHazardAudio.ts';
import { DynamicHazardAudio } from '../../src/game/hazards/DynamicHazardAudio.ts';
import { FrostHazardAudio } from '../../src/game/hazards/FrostHazardAudio.ts';
import { MagmaHazardAudio } from '../../src/game/hazards/MagmaHazardAudio.ts';
import { MiasmaHazardAudio } from '../../src/game/hazards/MiasmaHazardAudio.ts';
import { NebulaHazardAudio } from '../../src/game/hazards/NebulaHazardAudio.ts';
import { SolarHazardAudio } from '../../src/game/hazards/SolarHazardAudio.ts';
import { VoltHazardAudio } from '../../src/game/hazards/VoltHazardAudio.ts';
import { SteamToyTitanAudio } from '../../src/game/bosses/SteamToyTitanAudio.ts';
import { PsychicCrisisAudio } from '../../src/game/crises/PsychicCrisisAudio.ts';
import { VoidCrisisAudio } from '../../src/game/crises/VoidCrisisAudio.ts';
import { AudioVoicePool } from '../../src/game/pooling/AudioVoicePool.ts';

/**
 * Mock Web Audio API for complete node disconnection & buffer reuse auditing
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
    this.onended = null;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
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
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockAudioNode('Destination');
    this.nodes = [];
    this.buffersCreated = 0;
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
    this.buffersCreated++;
    return new MockAudioBuffer(channels, length, sampleRate);
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}

function resetAllSingletons() {
  AudioVoicePool.resetInstance();
  if (typeof AbyssalHazardAudio.destroy === 'function') AbyssalHazardAudio.destroy();
  if (typeof ChronoHazardAudio.resetInstance === 'function') ChronoHazardAudio.resetInstance();
  if (typeof FrostHazardAudio.resetInstance === 'function') FrostHazardAudio.resetInstance();
  if (typeof MagmaHazardAudio.resetInstance === 'function') MagmaHazardAudio.resetInstance();
  if (typeof MiasmaHazardAudio.resetInstance === 'function') MiasmaHazardAudio.resetInstance();
  if (typeof NebulaHazardAudio.destroy === 'function') NebulaHazardAudio.destroy();
  if (typeof SolarHazardAudio.destroy === 'function') SolarHazardAudio.destroy();
  if (typeof VoltHazardAudio.resetInstance === 'function') VoltHazardAudio.resetInstance();
  if (typeof SteamToyTitanAudio.resetInstance === 'function') SteamToyTitanAudio.resetInstance();
  if (typeof PsychicCrisisAudio.resetInstance === 'function') PsychicCrisisAudio.resetInstance();
  if (typeof VoidCrisisAudio.resetInstance === 'function') VoidCrisisAudio.resetInstance();
}

// ============================================================================
// Requirement 1: Static Cached White Noise Audio Buffer Reuse
// ============================================================================

test('Req 1: Static cached white noise audio buffer reuse across repeated triggers', () => {
  resetAllSingletons();
  const mockCtx = new MockAudioContext(44100);
  const originalWindow = global.window;
  const originalAudioContext = global.AudioContext;

  global.window = {
    AudioContext: class {
      constructor() {
        return mockCtx;
      }
    },
  };
  global.AudioContext = global.window.AudioContext;

  try {
    const pool = new AudioVoicePool(16);
    pool.init(mockCtx);

    // 1. DynamicHazardAudio - multiple triggers
    const dynamic = new DynamicHazardAudio(mockCtx);
    const initialBuffers = mockCtx.buffersCreated;
    dynamic.playFilteredNoiseBurst(0.1, 800, 200, 0.2);
    const afterFirst = mockCtx.buffersCreated;
    assert.strictEqual(afterFirst - initialBuffers, 1, 'First trigger should allocate static cached buffer');
    for (let i = 0; i < 20; i++) {
      dynamic.playFilteredNoiseBurst(0.1, 800, 200, 0.2);
    }
    assert.strictEqual(mockCtx.buffersCreated, afterFirst, 'Subsequent 20 triggers must reuse static buffer (0 GC allocations)');

    // 2. VoltHazardAudio
    const volt = new VoltHazardAudio(mockCtx);
    const voltStartBuffers = mockCtx.buffersCreated;
    volt.playFilteredNoiseBurst(0.1, 1500, 300, 0.2);
    const voltAfterFirst = mockCtx.buffersCreated;
    assert.strictEqual(voltAfterFirst - voltStartBuffers, 1, 'VoltAudio allocates static buffer on first trigger');
    for (let i = 0; i < 20; i++) {
      volt.playFilteredNoiseBurst(0.1, 1500, 300, 0.2);
    }
    assert.strictEqual(mockCtx.buffersCreated, voltAfterFirst, 'VoltAudio reuses static buffer permanently');

    // 3. MagmaHazardAudio
    const magma = new MagmaHazardAudio(mockCtx);
    const magmaStartBuffers = mockCtx.buffersCreated;
    magma.playFilteredNoiseBurst(0.1, 1000, 200, 0.2);
    const magmaAfterFirst = mockCtx.buffersCreated;
    assert.strictEqual(magmaAfterFirst - magmaStartBuffers, 1, 'MagmaAudio allocates static buffer on first trigger');
    for (let i = 0; i < 20; i++) {
      magma.playFilteredNoiseBurst(0.1, 1000, 200, 0.2);
    }
    assert.strictEqual(mockCtx.buffersCreated, magmaAfterFirst, 'MagmaAudio reuses static buffer permanently');

    // 4. MiasmaHazardAudio
    const miasma = new MiasmaHazardAudio(mockCtx);
    const miasmaStartBuffers = mockCtx.buffersCreated;
    miasma.playFilteredNoiseBurst(0.1, 1000, 200, 0.15);
    const miasmaAfterFirst = mockCtx.buffersCreated;
    assert.strictEqual(miasmaAfterFirst - miasmaStartBuffers, 1, 'MiasmaAudio allocates static buffer on first trigger');
    for (let i = 0; i < 20; i++) {
      miasma.playFilteredNoiseBurst(0.1, 1000, 200, 0.15);
    }
    assert.strictEqual(mockCtx.buffersCreated, miasmaAfterFirst, 'MiasmaAudio reuses static buffer permanently');

    // 5. ChronoHazardAudio
    const chrono = new ChronoHazardAudio(mockCtx);
    const chronoStartBuffers = mockCtx.buffersCreated;
    chrono.playTimeCollapseImpact();
    const chronoAfterFirst = mockCtx.buffersCreated;
    assert.strictEqual(chronoAfterFirst - chronoStartBuffers, 1, 'ChronoAudio allocates static buffer on first trigger');
    for (let i = 0; i < 20; i++) {
      chrono.playTimeCollapseImpact();
    }
    assert.strictEqual(mockCtx.buffersCreated, chronoAfterFirst, 'ChronoAudio reuses static buffer permanently across triggers');

    // 6. SteamToyTitanAudio
    const titan = new SteamToyTitanAudio(mockCtx, pool);
    const titanStartBuffers = mockCtx.buffersCreated;
    titan.playProceduralNoiseBurst(0.1, 1800, 3200, 0.2);
    const titanAfterFirst = mockCtx.buffersCreated;
    assert.strictEqual(titanAfterFirst - titanStartBuffers, 1, 'SteamTitan allocates static buffer on first trigger');
    for (let i = 0; i < 20; i++) {
      titan.playProceduralNoiseBurst(0.1, 1800, 3200, 0.2);
    }
    assert.strictEqual(mockCtx.buffersCreated, titanAfterFirst, 'SteamTitan reuses static buffer permanently');

    // 7. PsychicCrisisAudio
    const psychic = new PsychicCrisisAudio(mockCtx, pool);
    const psychicStartBuffers = mockCtx.buffersCreated;
    psychic.playFilteredNoiseBurst(0.1, 1800, 600, 0.15);
    const psychicAfterFirst = mockCtx.buffersCreated;
    assert.strictEqual(psychicAfterFirst - psychicStartBuffers, 1, 'PsychicCrisis allocates static buffer on first trigger');
    for (let i = 0; i < 20; i++) {
      psychic.playFilteredNoiseBurst(0.1, 1800, 600, 0.15);
    }
    assert.strictEqual(mockCtx.buffersCreated, psychicAfterFirst, 'PsychicCrisis reuses static buffer permanently');

    // 8. VoidCrisisAudio
    const voidAudio = new VoidCrisisAudio(mockCtx, pool);
    const voidStartBuffers = mockCtx.buffersCreated;
    voidAudio.playFilteredNoiseBurst(0.1, 1800, 600, 0.15);
    const voidAfterFirst = mockCtx.buffersCreated;
    assert.strictEqual(voidAfterFirst - voidStartBuffers, 1, 'VoidCrisis allocates static buffer on first trigger');
    for (let i = 0; i < 20; i++) {
      voidAudio.playFilteredNoiseBurst(0.1, 1800, 600, 0.15);
    }
    assert.strictEqual(mockCtx.buffersCreated, voidAfterFirst, 'VoidCrisis reuses static buffer permanently');

    // Teardown
    dynamic.destroy();
    volt.destroy();
    magma.destroy();
    miasma.destroy();
    chrono.destroy();
    titan.destroy();
    psychic.destroy();
    voidAudio.destroy();
    pool.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetAllSingletons();
  }
});

// ============================================================================
// Requirement 2: Dual-Watchdog Cleanup (onended + setTimeout)
// ============================================================================

test('Req 2: Dual-watchdog cleanup on primary playback end (onended)', () => {
  resetAllSingletons();
  const mockCtx = new MockAudioContext(44100);
  const originalWindow = global.window;
  const originalAudioContext = global.AudioContext;

  global.window = {
    AudioContext: class {
      constructor() {
        return mockCtx;
      }
    },
  };
  global.AudioContext = global.window.AudioContext;

  try {
    const pool = new AudioVoicePool(16);
    pool.init(mockCtx);

    const instances = [
      new DynamicHazardAudio(mockCtx),
      new VoltHazardAudio(mockCtx),
      new MagmaHazardAudio(mockCtx),
      new MiasmaHazardAudio(mockCtx),
      new ChronoHazardAudio(mockCtx),
      new SteamToyTitanAudio(mockCtx, pool),
      new PsychicCrisisAudio(mockCtx, pool),
      new VoidCrisisAudio(mockCtx, pool),
    ];

    // Trigger noise bursts
    instances[0].playFilteredNoiseBurst(0.1, 800, 200, 0.2);
    instances[1].playFilteredNoiseBurst(0.1, 1500, 300, 0.2);
    instances[2].playFilteredNoiseBurst(0.1, 1000, 200, 0.2);
    instances[3].playFilteredNoiseBurst(0.1, 1000, 200, 0.15);
    instances[4].playTimeCollapseImpact();
    instances[5].playProceduralNoiseBurst(0.1, 1800, 3200, 0.2);
    instances[6].playFilteredNoiseBurst(0.1, 1800, 600, 0.15);
    instances[7].playFilteredNoiseBurst(0.1, 1800, 600, 0.15);

    const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
    assert.ok(bufferSources.length >= 8, 'Expected at least 8 BufferSources created');

    // Simulate normal onended playback completion
    for (const bs of bufferSources) {
      assert.strictEqual(typeof bs.onended, 'function', 'source.onended must be set as primary watchdog');
      bs.finishPlayback();
      assert.strictEqual(bs.disconnected, true, 'Node must disconnect immediately on finishPlayback');
      assert.strictEqual(bs.onended, null, 'source.onended must be nullified to prevent repeat execution');
    }

    // Teardown
    for (const inst of instances) inst.destroy();
    pool.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetAllSingletons();
  }
});

test('Req 2: Dual-watchdog cleanup on timeout fallback when onended fails/never fires', async () => {
  resetAllSingletons();
  const mockCtx = new MockAudioContext(44100);
  const originalWindow = global.window;
  const originalAudioContext = global.AudioContext;

  global.window = {
    AudioContext: class {
      constructor() {
        return mockCtx;
      }
    },
  };
  global.AudioContext = global.window.AudioContext;

  try {
    const pool = new AudioVoicePool(16);
    pool.init(mockCtx);

    const dynamic = new DynamicHazardAudio(mockCtx);
    const volt = new VoltHazardAudio(mockCtx);
    const magma = new MagmaHazardAudio(mockCtx);
    const miasma = new MiasmaHazardAudio(mockCtx);
    const titan = new SteamToyTitanAudio(mockCtx, pool);
    const psychic = new PsychicCrisisAudio(mockCtx, pool);
    const voidAudio = new VoidCrisisAudio(mockCtx, pool);

    // Trigger sounds with very short duration (10ms)
    dynamic.playFilteredNoiseBurst(0.01, 800, 200, 0.2);
    volt.playFilteredNoiseBurst(0.01, 1500, 300, 0.2);
    magma.playFilteredNoiseBurst(0.01, 1000, 200, 0.2);
    miasma.playFilteredNoiseBurst(0.01, 1000, 200, 0.15);
    titan.playProceduralNoiseBurst(0.01, 1800, 3200, 0.2);
    psychic.playFilteredNoiseBurst(0.01, 1800, 600, 0.15);
    voidAudio.playFilteredNoiseBurst(0.01, 1800, 600, 0.15);

    // Do NOT trigger onended! Wait for setTimeout watchdog (10ms + 50ms buffer = ~60ms)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify all transient buffer sources were disconnected by the watchdog timeout
    const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
    for (const bs of bufferSources) {
      assert.strictEqual(
        bs.disconnected,
        true,
        'Watchdog timeout must disconnect orphaned node if onended never fires'
      );
    }

    dynamic.destroy();
    volt.destroy();
    magma.destroy();
    miasma.destroy();
    titan.destroy();
    psychic.destroy();
    voidAudio.destroy();
    pool.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetAllSingletons();
  }
});

test('Req 2: clearPendingNodes() and destroy() forcefully disconnect transient nodes and clear timers', () => {
  resetAllSingletons();
  const mockCtx = new MockAudioContext(44100);
  const originalWindow = global.window;
  const originalAudioContext = global.AudioContext;

  global.window = {
    AudioContext: class {
      constructor() {
        return mockCtx;
      }
    },
  };
  global.AudioContext = global.window.AudioContext;

  try {
    const volt = new VoltHazardAudio(mockCtx);
    const magma = new MagmaHazardAudio(mockCtx);
    const dynamic = new DynamicHazardAudio(mockCtx);
    const miasma = new MiasmaHazardAudio(mockCtx);

    volt.playFilteredNoiseBurst(0.2, 1500, 300, 0.2);
    magma.playFilteredNoiseBurst(0.2, 1000, 200, 0.2);
    dynamic.playFilteredNoiseBurst(0.2, 800, 200, 0.2);
    miasma.playFilteredNoiseBurst(0.2, 1000, 200, 0.15);

    const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
    assert.strictEqual(bufferSources.length, 4, '4 transient buffer sources scheduled');

    // Force clear without waiting for onended or timeout
    volt.clearPendingNodes();
    magma.clearPendingNodes();
    dynamic.clearPendingNodes();
    miasma.clearPendingNodes();

    for (const bs of bufferSources) {
      assert.strictEqual(bs.disconnected, true, 'All buffer sources must be disconnected by clearPendingNodes');
    }

    volt.destroy();
    magma.destroy();
    dynamic.destroy();
    miasma.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetAllSingletons();
  }
});

// ============================================================================
// Requirement 3: Headless SSR Safety (zero crash when window/AudioContext undefined)
// ============================================================================

test('Req 3: Zero crash when window is undefined (pure Node.js SSR)', () => {
  resetAllSingletons();
  const savedWindow = global.window;
  const savedAudioContext = global.AudioContext;

  delete global.window;
  delete global.AudioContext;

  try {
    // 1. AudioVoicePool in pure SSR
    const pool = AudioVoicePool.getInstance();
    assert.ok(pool !== null, 'AudioVoicePool.getInstance() must succeed in SSR');
    assert.strictEqual(pool.acquireVoice(), null, 'acquireVoice() returns null safely in headless SSR');
    assert.strictEqual(pool.playTone({ frequency: 440, duration: 0.1 }), null, 'playTone returns null safely');
    pool.reset();
    pool.destroy();

    // 2. All 12 Audio Synthesizers in pure SSR
    const synthConstructors = [
      () => new AbyssalHazardAudio(),
      () => new ChronoHazardAudio(),
      () => new DynamicHazardAudio(),
      () => new FrostHazardAudio(),
      () => new MagmaHazardAudio(),
      () => new MiasmaHazardAudio(),
      () => new NebulaHazardAudio(),
      () => new SolarHazardAudio(),
      () => new VoltHazardAudio(),
      () => new SteamToyTitanAudio(),
      () => new PsychicCrisisAudio(),
      () => new VoidCrisisAudio(),
    ];

    for (const ctor of synthConstructors) {
      assert.doesNotThrow(() => {
        const inst = ctor();
        if (typeof inst.playAbyssalHazardState === 'function') inst.playAbyssalHazardState('DORMANT', 'NONE');
        if (typeof inst.playChronoHazardState === 'function') inst.playChronoHazardState(0);
        if (typeof inst.playDynamicHazardState === 'function') inst.playDynamicHazardState('IDLE');
        if (typeof inst.playFrostHazardState === 'function') inst.playFrostHazardState('IDLE');
        if (typeof inst.playMagmaHazardState === 'function') inst.playMagmaHazardState('IDLE');
        if (typeof inst.playMiasmaHazardState === 'function') inst.playMiasmaHazardState('IDLE');
        if (typeof inst.playNebulaHazardState === 'function') inst.playNebulaHazardState(0, 0);
        if (typeof inst.playSolarHazardState === 'function') inst.playSolarHazardState(0, 0);
        if (typeof inst.playVoltHazardState === 'function') inst.playVoltHazardState('IDLE');
        if (typeof inst.playGearWhine === 'function') inst.playGearWhine();
        if (typeof inst.playPsychicCrisisState === 'function') inst.playPsychicCrisisState(0, 0);
        if (typeof inst.playVoidCrisisState === 'function') inst.playVoidCrisisState(0, 0);

        if (typeof inst.stop === 'function') inst.stop();
        if (typeof inst.reset === 'function') inst.reset();
        if (typeof inst.destroy === 'function') inst.destroy();
      }, 'Synthesizer operations must be 100% crash-free in pure headless SSR');
    }
  } finally {
    global.window = savedWindow;
    global.AudioContext = savedAudioContext;
    resetAllSingletons();
  }
});
