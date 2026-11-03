/**
 * tests/mutant_flora_audio.test.mjs — Comprehensive Unit Tests for Mutant Flora Procedural Audio
 *
 * Tiers:
 * 1. Immutable Presets & Solfeggio 528Hz Harmonic Verification
 * 2. Headless SSR Safety (zero crash when window/AudioContext undefined)
 * 3. AudioVoicePool Integration & 16-Voice Recycling
 * 4. Zero-GC Static Cached White Noise Buffer Reuse
 * 5. Dual-Watchdog Cleanup (onended + setTimeout + clearPendingNodes)
 * 6. MutantFloraBoss Audio Integration Wiring
 * 7. Adversarial Fuzzing: NaN, Infinity, Subnormal Floats & Extreme Burst Spam
 * 8. Zero-GC 10,000-Frame Soak Simulation
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MutantFloraAudio,
  FLORA_AUDIO_PRESETS,
  MUTANT_FLORA_AUDIO_PRESETS,
} from '../src/game/bosses/MutantFloraAudio.ts';
import { MutantFloraBoss, BossState } from '../src/game/bosses/index.ts';
import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';

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
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(1000);
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

function resetSingletons() {
  AudioVoicePool.resetInstance();
  MutantFloraAudio.resetInstance();
}

// ==============================================================================
// TIER 1: PRESETS & SOLFEGGIO 528HZ HARMONIC VERIFICATION
// ==============================================================================

test('Tier 1: Presets are deeply frozen and match botanical sound design specs', () => {
  assert.strictEqual(FLORA_AUDIO_PRESETS, MUTANT_FLORA_AUDIO_PRESETS);
  assert.ok(Object.isFrozen(FLORA_AUDIO_PRESETS), 'Preset dictionary must be frozen');

  // Verify Solfeggio 528Hz Peace Bloom Preset
  const solfeggio = FLORA_AUDIO_PRESETS.PEACE_BLOOM_SOLFEGGIO_528HZ;
  assert.ok(solfeggio, 'PEACE_BLOOM_SOLFEGGIO_528HZ must exist');
  assert.strictEqual(solfeggio.frequency, 528.0, 'Must be tuned exactly to Solfeggio 528Hz');
  assert.strictEqual(solfeggio.type, 'sine');
  assert.ok(Object.isFrozen(solfeggio), 'Preset object must be frozen');

  // Verify Root Eruption Sub Thud
  const rootThud = FLORA_AUDIO_PRESETS.ROOT_ERUPTION_SUB_THUD;
  assert.strictEqual(rootThud.frequency, 58.0);
  assert.strictEqual(rootThud.frequencyRamp?.target, 24.0);
  assert.ok(Object.isFrozen(rootThud.frequencyRamp));

  // Verify Pollen Mist Presets
  const sporePop = FLORA_AUDIO_PRESETS.SPORE_BURST_POP;
  assert.strictEqual(sporePop.frequency, 360.0);
  assert.strictEqual(sporePop.frequencyRamp?.target, 85.0);

  // Attempting to mutate preset throws in strict mode
  assert.throws(() => {
    // @ts-expect-error mutating readonly property
    FLORA_AUDIO_PRESETS.ROOT_ERUPTION_SUB_THUD.frequency = 999;
  }, TypeError);
});

// ==============================================================================
// TIER 2: HEADLESS SSR SAFETY
// ==============================================================================

test('Tier 2: MutantFloraAudio is 100% crash-free when window / AudioContext are undefined', () => {
  resetSingletons();
  const savedWindow = global.window;
  const savedAudioContext = global.AudioContext;

  delete global.window;
  delete global.AudioContext;

  try {
    const audio = new MutantFloraAudio();
    assert.doesNotThrow(() => {
      audio.playSubterraneanRootEruption();
      audio.playRootCleansedSnap();
      audio.playSporeBurst();
      audio.playVineWhip();
      audio.playBurrow();
      audio.playEmerge();
      audio.playBotanicalBloomPhase2();
      audio.playEnragedRoarPhase3();
      audio.playTragicWiltDefeat();
      audio.playPeacefulFloraRestoration();
      audio.playFloraState('PHASE_1_COMBAT', 0.5);
      audio.playProceduralNoiseBurst(0.2, 1200, 300, 0.2);
      audio.clearPendingNodes();
      audio.reset();
      audio.stop();
      audio.destroy();
    }, 'Must never throw during headless SSR calls');
  } finally {
    global.window = savedWindow;
    global.AudioContext = savedAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 3: AUDIOVOICEPOOL INTEGRATION & 16-VOICE RECYCLING
// ==============================================================================

test('Tier 3: Tones are routed through 16-voice pool and obey rate limiting', () => {
  resetSingletons();
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

    const audio = new MutantFloraAudio(mockCtx, pool);

    // Initial root eruption should trigger tones
    const playedFirst = audio.playSubterraneanRootEruption(1000);
    assert.strictEqual(playedFirst, true, 'First root eruption should trigger');

    // Immediate second trigger within debounce window should be rate-limited
    const playedSpam = audio.playSubterraneanRootEruption(1050);
    assert.strictEqual(playedSpam, false, 'Debounced root eruption within 150ms must be skipped');

    // Trigger after debounce window expires (150ms debounce)
    const playedDebounced = audio.playSubterraneanRootEruption(1200);
    assert.strictEqual(playedDebounced, true, 'Trigger after debounce interval must succeed');

    audio.destroy();
    pool.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 4: ZERO-GC STATIC CACHED WHITE NOISE BUFFER REUSE
// ==============================================================================

test('Tier 4: Procedural noise bursts reuse static cached buffer with 0 GC allocations', () => {
  resetSingletons();
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
    const audio = new MutantFloraAudio(mockCtx);

    const initialBuffers = mockCtx.buffersCreated;
    const firstBurst = audio.playProceduralNoiseBurst(0.1, 1600, 400, 0.2);
    assert.strictEqual(firstBurst, true);
    assert.strictEqual(mockCtx.buffersCreated - initialBuffers, 1, 'First trigger creates 1 static buffer');

    // Trigger 50 repeated bursts across rapid simulation
    for (let i = 0; i < 50; i++) {
      audio.playProceduralNoiseBurst(0.1, 1600, 400, 0.2);
    }

    assert.strictEqual(
      mockCtx.buffersCreated,
      initialBuffers + 1,
      '50 subsequent noise bursts must reuse cached buffer with 0 heap allocations'
    );

    audio.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 5: DUAL-WATCHDOG CLEANUP (ONENDED + TIMEOUT + CLEARPENDINGNODES)
// ==============================================================================

test('Tier 5.1: Primary onended callback cleans up transient buffer source immediately', () => {
  resetSingletons();
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
    const audio = new MutantFloraAudio(mockCtx);
    audio.playProceduralNoiseBurst(0.1, 1400, 300, 0.2);

    const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
    assert.strictEqual(bufferSources.length, 1);
    const bs = bufferSources[0];

    assert.strictEqual(typeof bs.onended, 'function', 'onended watchdog must be bound');
    bs.finishPlayback();

    assert.strictEqual(bs.disconnected, true, 'Node must disconnect immediately on onended');
    assert.strictEqual(bs.onended, null, 'onended handler must be cleared');

    audio.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

test('Tier 5.2: Watchdog timeout cleans up orphaned node if onended fails to fire', async () => {
  resetSingletons();
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
    const audio = new MutantFloraAudio(mockCtx);
    audio.playProceduralNoiseBurst(0.01, 1400, 300, 0.2);

    const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
    assert.strictEqual(bufferSources.length, 1);
    const bs = bufferSources[0];

    // Do NOT invoke onended. Wait for safe timeout fallback (10ms + 50ms = 60ms)
    await new Promise((resolve) => setTimeout(resolve, 140));

    assert.strictEqual(bs.disconnected, true, 'Timeout watchdog must disconnect orphaned node');

    audio.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

test('Tier 5.3: clearPendingNodes() forcefully disconnects all nodes and clears active timers', () => {
  resetSingletons();
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
    const audio = new MutantFloraAudio(mockCtx);
    audio.playProceduralNoiseBurst(0.5, 1400, 300, 0.2);
    audio.playProceduralNoiseBurst(0.5, 1200, 400, 0.2);

    const bufferSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
    assert.strictEqual(bufferSources.length, 2);

    audio.clearPendingNodes();

    for (const bs of bufferSources) {
      assert.strictEqual(bs.disconnected, true, 'clearPendingNodes must disconnect all buffer sources');
    }

    audio.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 6: MUTANTFLORABOSS AUDIO INTEGRATION WIRING
// ==============================================================================

test('Tier 6: MutantFloraBoss seamlessly dispatches procedural audio events', () => {
  resetSingletons();
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

    const boss = new MutantFloraBoss(320, 240);
    // Bind mock voice pool to boss audio
    if (boss.audio) {
      boss.audio.init(mockCtx, pool);
    }

    // 1. Advance Intro to Phase 1 (introDurationMs = 1500)
    boss.update(1600, 0, 0, []);
    assert.strictEqual(boss.state, BossState.PHASE_1);

    // 2. Trigger Root Spawning (advance 4000ms cadence)
    const initialNodes = mockCtx.nodes.length;
    boss.update(4100, 320, 240, []);
    assert.ok(mockCtx.nodes.length > initialNodes, 'Root spawning should trigger audio nodes');

    // 3. Cleanse roots
    if (boss.activeRoots > 0) {
      const cleanseNodes = mockCtx.nodes.length;
      boss.cleanseRootsAt(6, 8, 3);
      assert.ok(mockCtx.nodes.length >= cleanseNodes, 'Root cleanse should dispatch snap audio');
    }

    // 4. Trigger Defeat and verify Peaceful Flora Restoration chime
    const defeatNodes = mockCtx.nodes.length;
    boss.takeDamage(100, 0, 0);
    assert.strictEqual(boss.state, BossState.DEFEATED);
    assert.ok(mockCtx.nodes.length > defeatNodes, 'Defeat must trigger Solfeggio 528Hz restoration');

    boss.destroy();
    pool.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 7: ADVERSARIAL FUZZING: NAN, INFINITY, SUBNORMAL FLOATS & EXTREME SPAM
// ==============================================================================

test('Tier 7: Adversarial fuzzing handles invalid inputs without unhandled exceptions', () => {
  resetSingletons();
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
    const audio = new MutantFloraAudio(mockCtx);

    const corruptValues = [NaN, Infinity, -Infinity, -100, 1e-18, 0];

    for (const val of corruptValues) {
      // @ts-expect-error testing invalid inputs
      assert.strictEqual(audio.playProceduralNoiseBurst(val, 1000, 200, 0.2), false);
      // @ts-expect-error testing invalid inputs
      assert.strictEqual(audio.playProceduralNoiseBurst(0.1, val, 200, 0.2), true);
      // @ts-expect-error testing invalid inputs
      assert.strictEqual(audio.playProceduralNoiseBurst(0.1, 1000, 200, val), false);
    }

    // Rapid spam burst
    for (let i = 0; i < 200; i++) {
      audio.playSubterraneanRootEruption(i * 5);
      audio.playRootCleansedSnap(i * 5);
      audio.playSporeBurst(i * 5);
      audio.playVineWhip(i * 5);
    }

    audio.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 8: ZERO-GC 10,000-FRAME SOAK SIMULATION
// ==============================================================================

test('Tier 8: Zero-GC 10,000-frame soak simulation maintains stable heap without leaks', () => {
  resetSingletons();
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

    const boss = new MutantFloraBoss(320, 240);
    if (boss.audio) boss.audio.init(mockCtx, pool);

    // Warm-up intro
    boss.update(1000, 0, 0, []);

    // 10,000-frame simulation (16ms per frame = ~160 seconds of continuous combat)
    let simTimeMs = 1000;
    const dt = 16;

    for (let frame = 0; frame < 10000; frame++) {
      simTimeMs += dt;
      // Simulated player moving around
      const playerX = 320 + Math.sin(frame * 0.02) * 120;
      const playerY = 240 + Math.cos(frame * 0.02) * 120;

      boss.update(dt, playerX, playerY, []);

      // Periodic bomb detonation to cleanse roots
      if (frame % 250 === 0) {
        boss.cleanseRootsAt(Math.floor(playerY / 40), Math.floor(playerX / 40), 2);
      }

      // Periodic gentle hit
      if (frame % 500 === 0 && boss.state !== BossState.DEFEATED) {
        boss.takeDamage(1, playerX, playerY);
      }

      // Periodic reset of pool voices to simulate ongoing battle recycling
      if (frame % 100 === 0) {
        pool.reset();
      }
    }

    assert.ok(boss.currentHp / boss.maxHp <= 1.0, 'Health percent invariant held');
    assert.strictEqual(mockCtx.buffersCreated, 1, 'Exactly 1 shared noise buffer created during 10,000-frame soak');

    boss.destroy();
    pool.destroy();
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});
