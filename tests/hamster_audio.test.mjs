/**
 * tests/hamster_audio.test.mjs — Comprehensive Unit Tests for Mecha Hamster Captain Nibbles Procedural WebAudio
 *
 * Tiers:
 * 1. Immutable Presets & Solfeggio 528Hz Harmonic Verification
 * 2. Headless SSR Safety (zero crash when window/AudioContext undefined)
 * 3. AudioVoicePool Integration & 16-Voice Recycling & Debounce Windows
 * 4. Zero-GC Static Cached White Noise Buffer Reuse
 * 5. Solfeggio 528Hz Mechanical Restoration Harmonic Chime
 * 6. Dual-Watchdog Cleanup (onended + setTimeout + clearPendingNodes)
 * 7. Adversarial Fuzzing: NaN, Infinity, Subnormal Floats & Extreme Burst Spam
 * 8. HamsterBoss Combat FSM Audio Wiring Triggers & Head-On Collision Trap
 * 9. Arena Boundary Clamping & 90° Bank Shot 2px Inward Separation Invariants
 * 10. Zero-GC 10,000-Frame Soak Simulation
 * 11. Lifecycle Reset, Stop, Singleton Teardown & Post-Destroy Safety
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HamsterAudio,
  HAMSTER_AUDIO_PRESETS,
} from '../src/game/bosses/HamsterAudio.ts';
import { HamsterBoss, BossState } from '../src/game/bosses/index.ts';
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
  HamsterAudio.resetInstance();
}

// ==============================================================================
// TIER 1: PRESETS & SOLFEGGIO 528HZ HARMONIC VERIFICATION
// ==============================================================================

test('Tier 1: Presets are deeply frozen and match Captain Nibbles sound design specs', () => {
  assert.ok(Object.isFrozen(HAMSTER_AUDIO_PRESETS), 'Preset dictionary must be frozen');

  // Verify Solfeggio 528Hz Mechanical Restoration Harmonic Chime
  const solfeggio = HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_528HZ;
  assert.ok(solfeggio, 'RESTORATION_CHIME_528HZ must exist');
  assert.strictEqual(solfeggio.frequency, 528.0, 'Must be tuned exactly to Solfeggio 528.0Hz');
  assert.strictEqual(solfeggio.type, 'triangle');
  assert.ok(Object.isFrozen(solfeggio), 'Preset object must be frozen');

  // Verify C-Major Restoration Triad
  const chimeC4 = HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_C4;
  const chimeE4 = HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_E4;
  const chimeG4 = HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_G4;
  assert.strictEqual(chimeC4.frequency, 261.63);
  assert.strictEqual(chimeE4.frequency, 329.63);
  assert.strictEqual(chimeG4.frequency, 392.00);

  // Verify Rev Windup acceleration preset
  const revMotor = HAMSTER_AUDIO_PRESETS.REV_ACCEL_MOTOR;
  assert.strictEqual(revMotor.frequency, 120.0);
  assert.strictEqual(revMotor.frequencyRamp?.target, 480.0);
  assert.strictEqual(revMotor.type, 'sawtooth');

  // Verify Bank-Shot Wall Rebound preset
  const reboundBoing = HAMSTER_AUDIO_PRESETS.WALL_REBOUND_BOING;
  assert.strictEqual(reboundBoing.frequency, 520.0);
  assert.strictEqual(reboundBoing.frequencyRamp?.target, 260.0);

  // Verify Head-On Bomb Overload punch preset
  const headOnSub = HAMSTER_AUDIO_PRESETS.HEAD_ON_SUB_CRACK;
  assert.strictEqual(headOnSub.frequency, 80.0);
  assert.strictEqual(headOnSub.frequencyRamp?.target, 30.0);

  // Mutation immutability in strict mode
  assert.throws(() => {
    // @ts-expect-error test mutation rejection
    HAMSTER_AUDIO_PRESETS.RESTORATION_CHIME_528HZ.frequency = 999;
  }, TypeError);
});

// ==============================================================================
// TIER 2: HEADLESS SSR SAFETY (ZERO CRASH WHEN WINDOW UNDEFINED)
// ==============================================================================

test('Tier 2: Headless SSR safety guarantees 100% crash-free execution without window', () => {
  resetSingletons();
  const savedWindow = global.window;
  const savedAudioContext = global.AudioContext;

  delete global.window;
  delete global.AudioContext;

  try {
    assert.doesNotThrow(() => {
      const audio = new HamsterAudio();
      assert.strictEqual(audio.getAudioContext(), null);

      // Execute all public routines in pure SSR
      audio.playRevWindup();
      audio.playDashRollHum();
      audio.playDashWhirr();
      audio.playWallRebound();
      audio.playWallBounce();
      audio.playHeadOnBombCollision();
      audio.playDazedStars();
      audio.playSunflowerGatling();
      audio.playGatlingSeedSpray();
      audio.playGyroLaserSweep();
      audio.playLaserSweep();
      audio.playPhaseTransition(2);
      audio.playPhaseTransition(3);
      audio.playDefeatMechanicalRestoration();
      audio.playDefeatPeaceHarmonic();
      audio.playBossDefeated();
      audio.playProceduralNoiseBurst(0.1, 1000, 200, 0.2);
      audio.playFilteredNoiseBurst(0.1, 1000, 200, 0.2);

      audio.clearPendingNodes();
      audio.reset();
      audio.stop();
      audio.destroy();
    }, 'All HamsterAudio routines must execute safely in headless SSR');
  } finally {
    global.window = savedWindow;
    global.AudioContext = savedAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 3: AUDIO VOICE POOL ROUTING & DEBOUNCE WINDOWS
// ==============================================================================

test('Tier 3: Musical tones route to voice pool with strict rate-limiting debounce windows', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const audio = new HamsterAudio(mockCtx, pool);

  // 1. Rev windup debounce (200ms)
  const t0 = 1000;
  assert.strictEqual(audio.playRevWindup(t0), true);
  assert.strictEqual(audio.playRevWindup(t0 + 50), false, 'Debounced within 200ms');
  assert.strictEqual(audio.playRevWindup(t0 + 210), true, 'Allowed after 200ms');

  // 2. Dash roll hum debounce (120ms)
  assert.strictEqual(audio.playDashRollHum(t0), true);
  assert.strictEqual(audio.playDashRollHum(t0 + 50), false, 'Debounced within 120ms');
  assert.strictEqual(audio.playDashRollHum(t0 + 130), true, 'Allowed after 120ms');

  // 3. Wall rebound debounce (100ms)
  assert.strictEqual(audio.playWallRebound(t0), true);
  assert.strictEqual(audio.playWallRebound(t0 + 40), false, 'Debounced within 100ms');
  assert.strictEqual(audio.playWallRebound(t0 + 110), true, 'Allowed after 100ms');

  // 4. Head-on collision debounce (250ms)
  assert.strictEqual(audio.playHeadOnBombCollision(t0), true);
  assert.strictEqual(audio.playHeadOnBombCollision(t0 + 100), false, 'Debounced within 250ms');
  assert.strictEqual(audio.playHeadOnBombCollision(t0 + 260), true, 'Allowed after 250ms');

  // 5. Gatling seed spray debounce (80ms)
  assert.strictEqual(audio.playSunflowerGatling(t0), true);
  assert.strictEqual(audio.playSunflowerGatling(t0 + 30), false, 'Debounced within 80ms');
  assert.strictEqual(audio.playSunflowerGatling(t0 + 90), true, 'Allowed after 80ms');

  // 6. Laser sweep debounce (150ms)
  assert.strictEqual(audio.playGyroLaserSweep(t0), true);
  assert.strictEqual(audio.playGyroLaserSweep(t0 + 50), false, 'Debounced within 150ms');
  assert.strictEqual(audio.playGyroLaserSweep(t0 + 160), true, 'Allowed after 150ms');

  // 7. Phase transition debounce (300ms)
  assert.strictEqual(audio.playPhaseTransition(2, t0), true);
  assert.strictEqual(audio.playPhaseTransition(2, t0 + 100), false, 'Debounced within 300ms');
  assert.strictEqual(audio.playPhaseTransition(2, t0 + 310), true, 'Allowed after 300ms');

  // 8. Defeat restoration debounce (1000ms)
  assert.strictEqual(audio.playDefeatMechanicalRestoration(t0), true);
  assert.strictEqual(audio.playDefeatMechanicalRestoration(t0 + 500), false, 'Debounced within 1000ms');
  assert.strictEqual(audio.playDefeatMechanicalRestoration(t0 + 1010), true, 'Allowed after 1000ms');

  audio.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 4: ZERO-GC STATIC CACHED WHITE NOISE BUFFER REUSE
// ==============================================================================

test('Tier 4: White noise bursts permanently reuse a static 500ms AudioBuffer with zero GC allocations', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const audio1 = new HamsterAudio(mockCtx, pool);
  const audio2 = new HamsterAudio(mockCtx, pool);

  const startBuffers = mockCtx.buffersCreated;
  audio1.playProceduralNoiseBurst(0.1, 1000, 200, 0.2);
  const afterFirst = mockCtx.buffersCreated;

  assert.strictEqual(afterFirst - startBuffers, 1, 'Exactly one static buffer allocated on first use');

  // Fire 40 bursts alternating across both instances
  for (let i = 0; i < 40; i++) {
    const target = i % 2 === 0 ? audio1 : audio2;
    target.playProceduralNoiseBurst(0.1, 1200, 300, 0.2);
  }

  assert.strictEqual(
    mockCtx.buffersCreated,
    afterFirst,
    'Static buffer is permanently reused across all triggers (Zero-GC guarantee)'
  );

  audio1.destroy();
  audio2.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 5: SOLFEGGIO 528HZ MECHANICAL RESTORATION CHORD RESOLUTION
// ==============================================================================

test('Tier 5: Defeat sequence triggers Solfeggio 528Hz and Mechanical Restoration Harmonic Chime', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const playedPresets = [];
  const originalPlayTone = pool.playTone.bind(pool);
  pool.playTone = (preset) => {
    playedPresets.push(preset);
    return originalPlayTone(preset);
  };

  const audio = new HamsterAudio(mockCtx, pool);
  audio.playDefeatMechanicalRestoration(5000);

  const frequencies = playedPresets.map((p) => p.frequency);

  // Assert presence of 528Hz Solfeggio restoration harmonic
  assert.ok(frequencies.includes(528.0), 'Must include Solfeggio 528.0Hz tone');
  // Assert presence of C-Major Triad (261.63Hz, 329.63Hz, 392.00Hz)
  assert.ok(frequencies.includes(261.63), 'Must include C4 (261.63Hz)');
  assert.ok(frequencies.includes(329.63), 'Must include E4 (329.63Hz)');
  assert.ok(frequencies.includes(392.00), 'Must include G4 (392.00Hz)');
  // Assert presence of downward spin-down slide
  assert.ok(frequencies.includes(480.0), 'Must include downward spin-down slide starting at 480Hz');

  audio.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 6: DUAL-WATCHDOG CLEANUP & NODE DISCONNECTION
// ==============================================================================

test('Tier 6: Dual-watchdog cleanup unplugs nodes via primary onended and fallback timeout', async () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const audio = new HamsterAudio(mockCtx, pool);

  // 1. Primary watchdog: onended simulation
  audio.playProceduralNoiseBurst(0.1, 1000, 200, 0.2);
  const sources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  const latestSource = sources[sources.length - 1];

  assert.strictEqual(typeof latestSource.onended, 'function', 'Primary onended callback registered');
  latestSource.finishPlayback();
  assert.strictEqual(latestSource.disconnected, true, 'Node disconnected on finishPlayback');
  assert.strictEqual(latestSource.onended, null, 'onended nullified after cleanup');

  // 2. Fallback watchdog: timeout fires when onended never triggers
  audio.playProceduralNoiseBurst(0.01, 1200, 300, 0.2);
  const timeoutSource = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode).pop();
  assert.strictEqual(timeoutSource.disconnected, false, 'Not disconnected yet');

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.strictEqual(timeoutSource.disconnected, true, 'Watchdog timeout disconnected orphaned node');

  // 3. Forced clear: clearPendingNodes disconnects immediate nodes
  audio.playProceduralNoiseBurst(0.3, 1200, 300, 0.2);
  const activeSources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode && !n.disconnected);
  assert.ok(activeSources.length > 0, 'Active source exists before clear');

  audio.clearPendingNodes();
  for (const s of activeSources) {
    assert.strictEqual(s.disconnected, true, 'Node disconnected by clearPendingNodes');
  }

  audio.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 7: ADVERSARIAL INPUT FUZZING
// ==============================================================================

test('Tier 7: Adversarial fuzzing with NaNs, infinities, and subnormal floats never crashes', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const audio = new HamsterAudio(mockCtx, pool);

  const adversarialValues = [
    NaN,
    Infinity,
    -Infinity,
    -100,
    0,
    1e-18, // subnormal denormal float
    1e30,
    Number.MAX_SAFE_INTEGER,
  ];

  for (const val of adversarialValues) {
    assert.doesNotThrow(() => {
      // Noise burst input fuzzing
      const result = audio.playProceduralNoiseBurst(val, val, val, val);
      assert.strictEqual(result, false, 'Non-positive or extreme inputs must return false cleanly');

      // Routines with invalid timestamps
      audio.playRevWindup(val);
      audio.playDashRollHum(val);
      audio.playWallRebound(val);
      audio.playHeadOnBombCollision(val);
      audio.playPhaseTransition(val, val);
      audio.playDefeatMechanicalRestoration(val);
    }, `Fuzzing with value ${val} must never throw`);
  }

  audio.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 8: HAMSTERBOSS COMBAT FSM AUDIO WIRING TRIGGERS
// ==============================================================================

test('Tier 8: HamsterBoss state transitions and combat events dispatch audio routines', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const boss = new HamsterBoss(300, 260);
  boss.audio.init(mockCtx, pool);

  // Transition past INTRO to PHASE_1
  boss.bossState = BossState.PHASE_1;

  // 1. Start dash windup dispatches rev windup audio
  let revTriggered = false;
  boss.audio.playRevWindup = () => {
    revTriggered = true;
    return true;
  };
  boss.startDashWindup(100, 0);
  assert.strictEqual(revTriggered, true, 'startDashWindup dispatches playRevWindup');
  assert.strictEqual(boss.isReving, true);

  // 2. Rev timer completes, triggering dash launch
  let dashLaunchTriggered = false;
  boss.audio.playDashWhirr = () => {
    dashLaunchTriggered = true;
    return true;
  };
  boss.update(1300, 400, 260);
  assert.strictEqual(boss.isDashing, true);
  assert.strictEqual(dashLaunchTriggered, true, 'Dash start dispatches playDashWhirr');

  // 3. Wall impact dispatches wall rebound boing
  let reboundTriggered = false;
  boss.audio.playWallRebound = () => {
    reboundTriggered = true;
    return true;
  };
  boss.onWallImpact();
  assert.strictEqual(reboundTriggered, true, 'onWallImpact dispatches playWallRebound');

  // 4. Head-on bomb collision dispatches overload punch and inflicts 3.0s stun
  boss.startDash({ x: 1, y: 0 });
  let headOnTriggered = false;
  boss.audio.playHeadOnBombCollision = () => {
    headOnTriggered = true;
    return true;
  };
  boss.onHeadOnBombCollision();
  assert.strictEqual(headOnTriggered, true, 'onHeadOnBombCollision dispatches playHeadOnBombCollision');
  assert.strictEqual(boss.bossState, BossState.STUNNED);
  assert.strictEqual(boss.currentHp, 9); // 10 -> 9 HP

  // 5. Defeat dispatches mechanical restoration
  let defeatTriggered = false;
  boss.audio.playDefeatMechanicalRestoration = () => {
    defeatTriggered = true;
    return true;
  };
  boss.takeBombDamage(10, 'bomb');
  assert.strictEqual(defeatTriggered, true, 'Defeat dispatches playDefeatMechanicalRestoration');
  assert.strictEqual(boss.bossState, BossState.DEFEATED);

  boss.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 9: ARENA BOUNDARY CLAMPING & 90° BANK SHOT 2PX INWARD SEPARATION
// ==============================================================================

test('Tier 9: Bank shots offset 2px inward preventing 1-frame premature rebound cancellations', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const boss = new HamsterBoss(535, 260);
  boss.audio.init(mockCtx, pool);
  boss.bossState = BossState.PHASE_1;

  // Start dashing right towards right boundary (x = 540)
  boss.startDash({ x: 1, y: 0 });
  boss.remainingRebounds = 1;

  // Move 10px right -> strikes maxArenaX (540)
  boss.update(100, 540, 260);

  // Bank shot occurred:
  assert.strictEqual(boss.remainingRebounds, 0, 'Rebound count decremented');
  assert.strictEqual(boss.dashDirection.x, 0, 'Horizontal movement stopped');
  assert.ok(boss.dashDirection.y === 1 || boss.dashDirection.y === -1, 'Vertical movement started');
  assert.strictEqual(boss.x, 538, 'Boss was offset 2px inward from 540 boundary');
  assert.strictEqual(boss.isDashing, true, 'Boss continues dashing on vertical corridor');

  // Verify head-on bomb collision recoil clamps within boundaries
  boss.x = 70;
  boss.y = 260;
  boss.startDash({ x: 1, y: 0 }); // Recoil would normally move to 70 - 40 = 30px (< 60 minArenaX)
  boss.onHeadOnBombCollision();

  assert.strictEqual(boss.x, 60, 'Recoil position is safely clamped to minArenaX (60px)');

  boss.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 10: ZERO-GC 10,000-FRAME SOAK SIMULATION
// ==============================================================================

test('Tier 10: Zero-GC 10,000-frame soak simulation runs with zero crashes or leaks', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const boss = new HamsterBoss(300, 260);
  boss.audio.setAudioContext(mockCtx);
  boss.audio.setVoicePool(pool);
  boss.bossState = BossState.PHASE_1;

  const dtMs = 16.666; // 60 FPS

  for (let frame = 0; frame < 10000; frame++) {
    // 1. Dynamic player trajectory
    const playerX = 300 + Math.sin(frame * 0.05) * 150;
    const playerY = 260 + Math.cos(frame * 0.05) * 120;

    // 2. Boss frame tick
    boss.update(dtMs, playerX, playerY);

    // 3. Periodic combat action simulation
    if (frame % 200 === 0 && !boss.isDashing && !boss.isReving) {
      boss.startDashWindup(playerX - boss.x, playerY - boss.y);
    }
    if (frame % 350 === 0) {
      boss.onDamageBlocked();
    }
    if (frame % 400 === 0) {
      boss.fireSunflowerGatling();
    }
    if (frame % 600 === 0) {
      boss.executeGyroLaserSweep();
    }
    // 4. Periodic voice pool recycling
    if (frame % 100 === 0) {
      pool.reset();
    }
  }

  // Mandatory Invariant Assertions:
  assert.strictEqual(
    mockCtx.buffersCreated,
    1,
    'Exactly 1 shared noise buffer created during 10,000-frame soak (Zero-GC guarantee)'
  );
  assert.ok(boss.x >= 60 && boss.x <= 540, 'Boss X position remains clamped in arena bounds');
  assert.ok(boss.y >= 60 && boss.y <= 460, 'Boss Y position remains clamped in arena bounds');
  assert.ok(Number.isFinite(boss.x) && Number.isFinite(boss.y), 'Positions remain strictly finite');
  assert.ok(boss.currentHp / boss.maxHp <= 1.0, 'Health invariant held');

  boss.destroy();
  pool.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 11: LIFECYCLE RESET, STOP, SINGLETON TEARDOWN & POST-DESTROY SAFETY
// ==============================================================================

test('Tier 11: Singleton lifecycle management, reset, and post-destroy safety', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  // 1. Singleton returns identical instance
  const inst1 = HamsterAudio.getInstance(mockCtx);
  const inst2 = HamsterAudio.getInstance();
  assert.strictEqual(inst1, inst2, 'getInstance returns identical singleton');

  // 2. Reset and stop clear state without destroying
  inst1.playRevWindup(1000);
  inst1.reset();
  assert.strictEqual(inst1.playRevWindup(1050), true, 'Debounce cleared by reset()');

  // 3. Destroy sets isDestroyed and rejects subsequent playback gracefully
  inst1.destroy();
  assert.strictEqual(inst1.playRevWindup(2000), false, 'Destroyed instance returns false');
  assert.strictEqual(inst1.playProceduralNoiseBurst(0.1, 1000, 200, 0.2), false, 'Noise burst rejected when destroyed');

  // 4. resetInstance creates clean new singleton
  HamsterAudio.resetInstance();
  const inst3 = HamsterAudio.getInstance(mockCtx);
  assert.notStrictEqual(inst3, inst1, 'resetInstance creates fresh instance');

  inst3.destroy();
  pool.destroy();
  resetSingletons();
});
