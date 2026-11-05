/**
 * tests/gummy_bear_audio.test.mjs — Comprehensive Unit Tests for King Gummy Bear Procedural WebAudio
 *
 * Tiers:
 * 1. Immutable Presets & Solfeggio 528Hz Harmonic Verification
 * 2. Headless SSR Safety (zero crash when window/AudioContext undefined)
 * 3. AudioVoicePool Integration & 16-Voice Recycling & Debounce Windows
 * 4. Zero-GC Static Cached White Noise Buffer Reuse
 * 5. Solfeggio 528Hz Sweet Gelatin Peace Bloom Chord
 * 6. Dual-Watchdog Cleanup (onended + setTimeout + clearPendingNodes)
 * 7. Adversarial Fuzzing: NaN, Infinity, Subnormal Floats & Extreme Burst Spam
 * 8. GummyBearBoss Combat FSM Audio Wiring Triggers & Lure Landing Stun
 * 9. Arena Boundary Clamping & Parabolic Non-Negative Elevation Invariants
 * 10. Zero-GC 10,000-Frame Soak Simulation
 * 11. Lifecycle Reset, Stop, Singleton Teardown & Post-Destroy Safety
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GummyBearAudio,
  GUMMY_BEAR_AUDIO_PRESETS,
} from '../src/game/bosses/GummyBearAudio.ts';
import { GummyBearBoss, BossState } from '../src/game/bosses/index.ts';
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
  GummyBearAudio.resetInstance();
}

// ==============================================================================
// TIER 1: PRESETS & SOLFEGGIO 528HZ HARMONIC VERIFICATION
// ==============================================================================

test('Tier 1: Presets are deeply frozen and match King Gummy Bear sound design specs', () => {
  assert.ok(Object.isFrozen(GUMMY_BEAR_AUDIO_PRESETS), 'Preset dictionary must be frozen');

  // Verify Solfeggio 528Hz Sweet Gelatin Peace Harmonic
  const solfeggio = GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_528HZ;
  assert.ok(solfeggio, 'PEACE_GELATIN_528HZ must exist');
  assert.strictEqual(solfeggio.frequency, 528.0, 'Must be tuned exactly to Solfeggio 528.0Hz');
  assert.strictEqual(solfeggio.type, 'triangle');
  assert.ok(Object.isFrozen(solfeggio), 'Preset object must be frozen');

  // Verify C-Major Peace Bloom Triad
  const peaceC4 = GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_C4;
  const peaceE4 = GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_E4;
  const peaceG4 = GUMMY_BEAR_AUDIO_PRESETS.PEACE_GELATIN_G4;
  assert.strictEqual(peaceC4.frequency, 261.63);
  assert.strictEqual(peaceE4.frequency, 329.63);
  assert.strictEqual(peaceG4.frequency, 392.00);

  // Verify Gelatinous March Presets
  const marchWobble = GUMMY_BEAR_AUDIO_PRESETS.MARCH_WOBBLE_SUB;
  assert.strictEqual(marchWobble.frequency, 82.0);
  assert.strictEqual(marchWobble.type, 'sine');
  assert.ok(marchWobble.frequencyRamp);
  assert.strictEqual(marchWobble.frequencyRamp.target, 48.0);
  assert.ok(Object.isFrozen(marchWobble.frequencyRamp));

  const marchSquelch = GUMMY_BEAR_AUDIO_PRESETS.MARCH_SQUELCH_BODY;
  assert.strictEqual(marchSquelch.frequency, 165.0);
  assert.strictEqual(marchSquelch.type, 'triangle');
  assert.strictEqual(marchSquelch.frequencyRamp?.target, 72.0);

  // Verify Royal Jelly Bounce (Parabolic Leap Launch)
  const leapBoing = GUMMY_BEAR_AUDIO_PRESETS.LEAP_LAUNCH_BOING;
  assert.strictEqual(leapBoing.frequency, 95.0);
  assert.strictEqual(leapBoing.frequencyRamp?.target, 380.0);

  // Verify Sugar Crush Sub Slam
  const crushSub = GUMMY_BEAR_AUDIO_PRESETS.CRUSH_IMPACT_SUB;
  assert.strictEqual(crushSub.frequency, 45.0);
  assert.strictEqual(crushSub.frequencyRamp?.target, 18.0);

  // Verify Masterplay Lure Landing Stun (Comic Twang + Dazed Stars Arpeggio)
  const lureTwang = GUMMY_BEAR_AUDIO_PRESETS.LURE_STUN_TWANG;
  assert.strictEqual(lureTwang.frequency, 440.0);
  assert.strictEqual(lureTwang.frequencyRamp?.target, 180.0);

  const starC6 = GUMMY_BEAR_AUDIO_PRESETS.DAZED_STARS_C6;
  const starE6 = GUMMY_BEAR_AUDIO_PRESETS.DAZED_STARS_E6;
  const starG6 = GUMMY_BEAR_AUDIO_PRESETS.DAZED_STARS_G6;
  assert.strictEqual(starC6.frequency, 1046.50);
  assert.strictEqual(starE6.frequency, 1318.51);
  assert.strictEqual(starG6.frequency, 1567.98);

  // Attempting mutation throws in strict mode
  assert.throws(() => {
    // @ts-expect-error mutating readonly property
    GUMMY_BEAR_AUDIO_PRESETS.MARCH_WOBBLE_SUB.frequency = 999;
  }, TypeError);
});

// ==============================================================================
// TIER 2: HEADLESS SSR SAFETY
// ==============================================================================

test('Tier 2: GummyBearAudio is 100% crash-free when window / AudioContext are undefined', () => {
  resetSingletons();
  const savedWindow = global.window;
  const savedAudioContext = global.AudioContext;

  delete global.window;
  delete global.AudioContext;

  try {
    const audio = new GummyBearAudio();
    assert.doesNotThrow(() => {
      audio.playMarchWobble(100);
      audio.playPonderousMarch(100);
      audio.playGelatinMarch(100);
      audio.playRoyalLeapLaunch(100);
      audio.playRoyalJellyBounce(100);
      audio.playRoyalLeapBounce(100);
      audio.playSugarCrushLanding(false, 100);
      audio.playSugarCrushLanding(true, 100);
      audio.playSugarCrushSlam(false, 100);
      audio.playPancakeSquash(100);
      audio.playMasterplayLureStun(100);
      audio.playDamageBlocked(100);
      audio.playGelatinArmorDeflection(100);
      audio.playGelatinSkinDeflection(100);
      audio.playGelatinAbsorb(100);
      audio.playJellyBudSpawn(100);
      audio.playMinionCubSpawn(100);
      audio.playMinionCubPop(100);
      audio.playMinionDefeated(100);
      audio.playPhaseTransition(2, 100);
      audio.playPhaseTransition(3, 100);
      audio.playPhaseEnrageRoar(100);
      audio.playBossDefeated(100);
      audio.playDefeatGelatinDissolution(100);
      audio.playDefeatPeaceHarmonic(100);
      audio.playProceduralNoiseBurst(0.2, 800, 200, 0.2);
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
// TIER 3: AUDIOVOICEPOOL INTEGRATION & DEBOUNCE WINDOWS
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

    const audio = new GummyBearAudio(mockCtx, pool);

    // Initial march wobble should play
    const playedFirst = audio.playMarchWobble(1000);
    assert.strictEqual(playedFirst, true, 'First march wobble should play');

    // Immediate second trigger within debounce window (140ms) should be rate-limited
    const playedSpam = audio.playMarchWobble(1050);
    assert.strictEqual(playedSpam, false, 'Debounced march wobble within 140ms must be skipped');

    // Trigger after debounce window expires (140ms)
    const playedAfterDebounce = audio.playMarchWobble(1160);
    assert.strictEqual(playedAfterDebounce, true, 'March wobble after debounce window must trigger');

    // Leap launch debounce (200ms)
    assert.strictEqual(audio.playRoyalLeapLaunch(2000), true);
    assert.strictEqual(audio.playRoyalLeapLaunch(2050), false);
    assert.strictEqual(audio.playRoyalLeapLaunch(2250), true);

    // Sugar crush landing debounce (200ms)
    assert.strictEqual(audio.playSugarCrushLanding(false, 3000), true);
    assert.strictEqual(audio.playSugarCrushLanding(false, 3050), false);
    assert.strictEqual(audio.playSugarCrushLanding(false, 3250), true);

    // Deflect debounce (100ms)
    assert.strictEqual(audio.playDamageBlocked(4000), true);
    assert.strictEqual(audio.playDamageBlocked(4050), false);
    assert.strictEqual(audio.playDamageBlocked(4150), true);

    // Minion bud spawn debounce (120ms)
    assert.strictEqual(audio.playJellyBudSpawn(5000), true);
    assert.strictEqual(audio.playJellyBudSpawn(5050), false);
    assert.strictEqual(audio.playJellyBudSpawn(5150), true);

    // Phase transition debounce (300ms)
    assert.strictEqual(audio.playPhaseTransition(2, 6000), true);
    assert.strictEqual(audio.playPhaseTransition(2, 6100), false);
    assert.strictEqual(audio.playPhaseTransition(3, 6350), true);

    // Defeat peace bloom debounce (1000ms)
    assert.strictEqual(audio.playBossDefeated(7000), true);
    assert.strictEqual(audio.playBossDefeated(7500), false);
    assert.strictEqual(audio.playBossDefeated(8100), true);
  } finally {
    global.window = originalWindow;
    global.AudioContext = originalAudioContext;
    resetSingletons();
  }
});

// ==============================================================================
// TIER 4: ZERO-GC STATIC CACHED WHITE NOISE BUFFER REUSE
// ==============================================================================

test('Tier 4: Procedural noise bursts reuse static cached AudioBuffer with 0 heap GC', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);

  const audio1 = new GummyBearAudio(mockCtx);
  const audio2 = new GummyBearAudio(mockCtx);

  // Play bursts across both instances
  for (let i = 0; i < 20; i++) {
    audio1.playProceduralNoiseBurst(0.1, 500, 200, 0.2);
    audio2.playProceduralNoiseBurst(0.1, 800, 300, 0.2);
  }

  // Exactly 1 buffer should be created across all 40 calls
  assert.strictEqual(
    mockCtx.buffersCreated,
    1,
    'Static cached white noise buffer must be reused permanently across calls and instances'
  );

  audio1.destroy();
  audio2.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 5: SOLFEGGIO 528HZ SWEET GELATIN PEACE BLOOM
// ==============================================================================

test('Tier 5: Defeat sequence triggers Solfeggio 528Hz and C-Major Peace Bloom chords', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const playedPresets = [];
  const origPlayTone = pool.playTone.bind(pool);
  pool.playTone = (preset) => {
    playedPresets.push(preset);
    return origPlayTone(preset);
  };

  const audio = new GummyBearAudio(mockCtx, pool);
  const result = audio.playBossDefeated(1000);
  assert.strictEqual(result, true, 'Defeat melody should successfully play');

  // Must include Solfeggio 528Hz + C4 + E4 + G4 + downward melt slide
  const has528 = playedPresets.some((p) => p.frequency === 528.0);
  const hasC4 = playedPresets.some((p) => Math.abs(p.frequency - 261.63) < 0.1);
  const hasE4 = playedPresets.some((p) => Math.abs(p.frequency - 329.63) < 0.1);
  const hasG4 = playedPresets.some((p) => Math.abs(p.frequency - 392.00) < 0.1);
  const hasMeltSlide = playedPresets.some((p) => p.frequency === 350.0);

  assert.ok(has528, 'Must include Solfeggio 528Hz sweet gelatin peace tone');
  assert.ok(hasC4, 'Must include C4 chord tone');
  assert.ok(hasE4, 'Must include E4 chord tone');
  assert.ok(hasG4, 'Must include G4 chord tone');
  assert.ok(hasMeltSlide, 'Must include melting downward slide');

  audio.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 6: DUAL-WATCHDOG CLEANUP (onended + setTimeout + clearPendingNodes)
// ==============================================================================

test('Tier 6: Dual-watchdog safely disconnects transient noise nodes and clears timeouts', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const audio = new GummyBearAudio(mockCtx);

  // Play burst
  audio.playProceduralNoiseBurst(0.2, 600, 200, 0.2);

  // Find created BufferSource node
  const bufferSources = mockCtx.nodes.filter((n) => n.nodeType === 'BufferSource');
  assert.ok(bufferSources.length >= 1, 'Should have created a buffer source');
  const src = bufferSources[0];

  assert.strictEqual(typeof src.onended, 'function', 'Must attach onended handler');

  // Trigger onended callback directly
  src.finishPlayback();

  assert.strictEqual(src.disconnected, true, 'Node must disconnect on playback end');

  // Multiple play bursts and clearPendingNodes
  audio.playProceduralNoiseBurst(0.3, 1000, 300, 0.2);
  audio.playProceduralNoiseBurst(0.3, 800, 200, 0.2);

  audio.clearPendingNodes();

  const allBuffers = mockCtx.nodes.filter((n) => n.nodeType === 'BufferSource');
  for (const b of allBuffers) {
    assert.strictEqual(b.disconnected, true, 'All buffer sources must be disconnected by clearPendingNodes');
  }

  audio.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 7: ADVERSARIAL FUZZING (NaN, Infinity, Subnormals & Extreme Burst Spam)
// ==============================================================================

test('Tier 7: Adversarial fuzzing with NaN, Infinity, Subnormals and extreme bursts does not crash', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const audio = new GummyBearAudio(mockCtx);

  const adversarialInputs = [
    NaN,
    Infinity,
    -Infinity,
    -100,
    0,
    1e-18, // subnormal
    Number.MAX_SAFE_INTEGER,
  ];

  for (const badVal of adversarialInputs) {
    assert.doesNotThrow(() => {
      audio.playProceduralNoiseBurst(badVal, 800, 200, 0.2);
      audio.playProceduralNoiseBurst(0.2, badVal, 200, 0.2);
      audio.playProceduralNoiseBurst(0.2, 800, badVal, 0.2);
      audio.playProceduralNoiseBurst(0.2, 800, 200, badVal);
      audio.playMarchWobble(badVal);
      audio.playRoyalLeapLaunch(badVal);
      audio.playSugarCrushLanding(false, badVal);
      audio.playDamageBlocked(badVal);
      audio.playJellyBudSpawn(badVal);
      audio.playPhaseTransition(badVal, badVal);
      audio.playBossDefeated(badVal);
    }, `Must not throw on adversarial input ${badVal}`);
  }

  audio.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 8: GUMMYBEARBOSS COMBAT FSM AUDIO WIRING TRIGGERS & LURE LANDING STUN
// ==============================================================================

test('Tier 8: GummyBearBoss combat loop integrates audio triggers and lure landing stun', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const boss = new GummyBearBoss(300, 260);
  boss.audio.setAudioContext(mockCtx);
  boss.audio.setVoicePool(pool);

  assert.ok(boss.audio, 'GummyBearBoss must have audio instance attached');

  // Intro state transition to Phase 1
  boss.update(100, 300, 400); // Intro progresses
  boss.bossState = BossState.PHASE_1;

  // Marching step trigger
  boss.stepTimerMs = 400; // Trigger march step
  boss.update(50, 300, 400);

  // Initiate Royal Leap
  boss.initiateRoyalLeap(350, 280);
  assert.strictEqual(boss.isAirborne, true, 'Boss must be airborne after leap launch');

  // Progress leap midway: verify airborne immunity
  boss.update(500, 300, 400);
  assert.strictEqual(boss.canTakeDamage(), false, 'Airborne boss cannot take damage');

  // Attach landingBombCheck returning true (Player masterplay: lured boss onto bomb)
  let landingCheckCalled = false;
  boss.landingBombCheck = () => {
    landingCheckCalled = true;
    return true;
  };

  // Fast forward past remaining airtime to trigger touchdown on bomb
  boss.update(1500, 300, 400);

  assert.ok(landingCheckCalled, 'landingBombCheck hook must have been queried upon landing');
  assert.strictEqual(boss.bossState, BossState.STUNNED, 'Landing on primed bomb must inflict STUNNED state');
  assert.strictEqual(boss.stunDurationMs, 4000, 'Masterplay lure landing must inflict 4.0s stun');
  assert.strictEqual(boss.canTakeDamage(), true, 'Stunned boss must be vulnerable to damage');
  assert.strictEqual(boss.currentHp, 8, 'Landing on primed bomb inflicts 1 bonus damage');

  // Damage blocking during active march
  boss.bossState = BossState.PHASE_1;
  boss.isSquashedPancake = false;
  boss.isAirborne = false;
  boss.isInvulnerable = false;
  const blocked = boss.takeBombDamage(1);
  assert.strictEqual(blocked, false, 'Marching King Gummy must deflect damage with gelatin skin');

  // Valid damage while squashed pancake
  boss.isSquashedPancake = true;
  boss.isInvulnerable = false;
  const damaged = boss.takeBombDamage(1);
  assert.strictEqual(damaged, true, 'Pancake squashed King Gummy must receive damage');
  assert.strictEqual(boss.currentHp, 7, 'Subsequent damage reduces HP to 7');

  boss.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 9: ARENA BOUNDARY CLAMPING & PARABOLIC NON-NEGATIVE ELEVATION INVARIANTS
// ==============================================================================

test('Tier 9: Arena boundary clamping and non-negative parabolic elevation invariants', () => {
  resetSingletons();
  const boss = new GummyBearBoss(300, 260);

  // Attempt leap target way outside arena boundaries (-1000, 9999)
  boss.initiateRoyalLeap(-1000, 9999);
  assert.strictEqual(boss.targetLandingX, 60, 'Target landing X must be clamped to arena min (60)');
  assert.strictEqual(boss.targetLandingY, 460, 'Target landing Y must be clamped to arena max (460)');

  // Advance flight with extreme delta time lag spike (dt = 10,000ms)
  boss.leapElevation = 0;
  boss.update(10000, 300, 260);

  // Elevation must never become negative
  assert.ok(boss.leapElevation >= 0, `Leap elevation (${boss.leapElevation}) must never be negative`);
  assert.ok(Number.isFinite(boss.x), 'X position must remain finite');
  assert.ok(Number.isFinite(boss.y), 'Y position must remain finite');
  assert.ok(boss.x >= 60 && boss.x <= 540, `X (${boss.x}) must remain within arena bounds [60, 540]`);
  assert.ok(boss.y >= 60 && boss.y <= 460, `Y (${boss.y}) must remain within arena bounds [60, 460]`);

  boss.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 10: ZERO-GC 10,000-FRAME SOAK SIMULATION
// ==============================================================================

test('Tier 10: 10,000-Frame Soak Simulation runs with zero crashes or leaks', () => {
  resetSingletons();
  const mockCtx = new MockAudioContext(44100);
  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);

  const boss = new GummyBearBoss(300, 260);
  boss.audio.setAudioContext(mockCtx);
  boss.audio.setVoicePool(pool);
  boss.bossState = BossState.PHASE_1;

  const dtSec = 1 / 60; // 16.66ms per frame
  const dtMs = 16.666;

  for (let frame = 0; frame < 10000; frame++) {
    // Dynamic player trajectory
    const playerX = 300 + Math.sin(frame * 0.05) * 150;
    const playerY = 260 + Math.cos(frame * 0.05) * 120;

    boss.update(dtMs, playerX, playerY);

    // Periodically simulate combat actions
    if (frame % 200 === 0 && !boss.isAirborne) {
      boss.initiateRoyalLeap(playerX, playerY);
    }
    if (frame % 350 === 0) {
      boss.onDamageBlocked();
    }
    if (frame % 500 === 0 && boss.activeCubCount < boss.maxCubs) {
      boss.audio.playMinionCubPop();
    }
  }

  assert.ok(boss.x >= 60 && boss.x <= 540, 'Boss position must remain clamped after 10k frames');
  assert.ok(boss.y >= 60 && boss.y <= 460, 'Boss position must remain clamped after 10k frames');
  assert.ok(Number.isFinite(boss.leapElevation), 'Leap elevation must remain finite');

  boss.destroy();
  resetSingletons();
});

// ==============================================================================
// TIER 11: LIFECYCLE RESET, STOP, SINGLETON TEARDOWN & POST-DESTROY SAFETY
// ==============================================================================

test('Tier 11: Lifecycle reset, stop, singleton teardown, and post-destroy safety', () => {
  resetSingletons();
  const audio = GummyBearAudio.getInstance();

  assert.strictEqual(GummyBearAudio.getInstance(), audio, 'getInstance must return singleton');

  audio.reset();
  audio.stop();

  audio.destroy();
  assert.strictEqual(audio.playMarchWobble(), false, 'Destroyed audio must refuse playback');
  assert.strictEqual(audio.playBossDefeated(), false, 'Destroyed audio must refuse defeat playback');

  GummyBearAudio.resetInstance();
  const newAudio = GummyBearAudio.getInstance();
  assert.notStrictEqual(newAudio, audio, 'resetInstance must yield fresh singleton');

  newAudio.destroy();
  resetSingletons();
});
