/**
 * tests/gravity_hazard_audio.test.mjs — Comprehensive Unit Tests for Gravitational Singularity Procedural WebAudio
 *
 * Tiers:
 * 1. Immutable Presets & Solfeggio 528Hz Harmonic Verification
 * 2. Headless SSR Safety (zero crash when window/AudioContext undefined)
 * 3. AudioVoicePool Integration & 16-Voice Recycling & Debounce Windows
 * 4. Zero-GC Static Cached White Noise Buffer Reuse
 * 5. Solfeggio 528Hz Harmonic Transformation Chime Quad
 * 6. Dual-Watchdog Cleanup (onended + setTimeout + clearPendingNodes)
 * 7. Adversarial Fuzzing: NaN, Infinity, Subnormal Floats & Extreme Burst Spam
 * 8. GravityHazard FSM Audio Wiring Triggers & Accretion Sub-Phases
 * 9. Spatial & Boundary Invariants & Super-Bomb Cosmic Fusion Merger
 * 10. Zero-GC 10,000-Frame Soak Simulation
 * 11. Lifecycle Reset, Stop, Singleton Teardown & Post-Destroy Safety
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GravityHazardAudio,
  GRAVITY_AUDIO_PRESETS,
} from '../src/game/hazards/GravityHazardAudio.ts';
import {
  GravityHazard,
  GravityLifecycleState,
  AccretionPhase,
  COSMIC_SUPER_BOMB_TINT_CYAN,
} from '../src/game/hazards/index.ts';
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
}

// ==============================================================================
// Mock Voice Pool
// ==============================================================================

class MockAudioVoicePool {
  constructor() {
    this.tonesPlayed = [];
  }
  getContext() {
    return null;
  }
  playTone(params) {
    this.tonesPlayed.push(params);
    return true;
  }
  reset() {
    this.tonesPlayed.length = 0;
  }
  destroy() {
    this.tonesPlayed.length = 0;
  }
}

// ==============================================================================
// Tier 1: Immutable Presets & Solfeggio 528Hz Harmonic Verification
// ==============================================================================

test('Tier 1: Gravitational Singularity presets are frozen and mathematically valid', () => {
  assert.ok(Object.isFrozen(GRAVITY_AUDIO_PRESETS), 'GRAVITY_AUDIO_PRESETS must be deeply frozen');

  // Accretion Sub-bass Drone
  const drone = GRAVITY_AUDIO_PRESETS.ACCRETION_SUB_DRONE_38HZ;
  assert.strictEqual(drone.type, 'sine');
  assert.strictEqual(drone.frequency, 38.0);
  assert.strictEqual(drone.frequencyRamp?.target, 30.0);
  assert.strictEqual(drone.filter?.type, 'lowpass');

  // Accretion Compression Whirr
  const whirr = GRAVITY_AUDIO_PRESETS.COMPRESSION_ACCRETION_WHIRR;
  assert.strictEqual(whirr.type, 'sawtooth');
  assert.strictEqual(whirr.frequency, 120.0);
  assert.strictEqual(whirr.frequencyRamp?.target, 480.0);
  assert.strictEqual(whirr.filter?.type, 'bandpass');

  // Critical Collapse Shear
  const shear = GRAVITY_AUDIO_PRESETS.COLLAPSE_EVENT_HORIZON_SHEAR;
  assert.strictEqual(shear.type, 'sawtooth');
  assert.strictEqual(shear.frequency, 680.0);
  assert.strictEqual(shear.frequencyRamp?.target, 45.0);

  // Singularity Implosion Sub
  const implosion = GRAVITY_AUDIO_PRESETS.SINGULARITY_IMPLOSION_SUB;
  assert.strictEqual(implosion.type, 'sine');
  assert.strictEqual(implosion.frequency, 55.0);
  assert.strictEqual(implosion.frequencyRamp?.target, 18.0);

  // Solfeggio 528Hz Miracle Harmonic
  const solfeggio = GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_SOLFEGGIO_528HZ;
  assert.strictEqual(solfeggio.type, 'sine');
  assert.strictEqual(solfeggio.frequency, 528.00);

  // C4, E4, G4 major triad harmonics
  assert.strictEqual(GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_C4.frequency, 261.63);
  assert.strictEqual(GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_E4.frequency, 329.63);
  assert.strictEqual(GRAVITY_AUDIO_PRESETS.SINGULARITY_DISSIPATION_G4.frequency, 392.00);
});

// ==============================================================================
// Tier 2: Headless SSR Safety
// ==============================================================================

test('Tier 2: Headless SSR Safety (Node.js test environment with undefined window/AudioContext)', () => {
  GravityHazardAudio.resetInstance();
  const audio = GravityHazardAudio.getInstance();

  assert.doesNotThrow(() => {
    audio.playAccretionFormation();
    audio.playAccretionCompression();
    audio.playCriticalCollapseTelegraph();
    audio.playSingularityBurst();
    audio.playGravitationalEscapeChimes();
    audio.playGravitationalDragWarning();
    audio.playCosmicFusionSuperBomb();
    audio.playMinionSpaghettification();
    audio.playBossStasisGrounded();
    audio.playSingularityDissipation();
    audio.playFilteredNoiseBurst();
    audio.playSwirlNoisePulse();
    audio.playVacuumImplosionNoisePulse();
    audio.playCosmicParticleHissPulse();
  }, 'All sound methods must execute safely in headless SSR');

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 3: AudioVoicePool Integration & Debounce Windows
// ==============================================================================

test('Tier 3: AudioVoicePool tone routing and debounce rate-limiting', () => {
  GravityHazardAudio.resetInstance();
  const mockPool = new MockAudioVoicePool();
  const audio = GravityHazardAudio.getInstance(mockPool);

  const t0 = 10000;
  // 1. Formation trigger
  audio.playAccretionFormation(mockPool, t0);
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Formation plays sub-drone and overtone');

  // Debounced trigger within 500ms
  const tonesCountBefore = mockPool.tonesPlayed.length;
  audio.playAccretionFormation(mockPool, t0 + 200);
  assert.strictEqual(mockPool.tonesPlayed.length, tonesCountBefore, 'Debounce rejects call under 500ms');

  // Allowed trigger after 500ms
  audio.playAccretionFormation(mockPool, t0 + 600);
  assert.ok(mockPool.tonesPlayed.length > tonesCountBefore, 'Call after debounce interval succeeds');

  // 2. Gravitational Escape (Slingshot) debounce (300ms)
  mockPool.reset();
  audio.playGravitationalEscapeChimes(mockPool, t0);
  assert.strictEqual(mockPool.tonesPlayed.length, 2, 'Escape chimes trigger root & overtone');
  audio.playGravitationalEscapeChimes(mockPool, t0 + 100);
  assert.strictEqual(mockPool.tonesPlayed.length, 2, 'Debounced call ignored');
  audio.playGravitationalEscapeChimes(mockPool, t0 + 350);
  assert.strictEqual(mockPool.tonesPlayed.length, 4, 'Call after 350ms succeeds');

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 4: Zero-GC Static Cached White Noise Buffer Reuse
// ==============================================================================

test('Tier 4: Zero-GC Static Cached White Noise Buffer Reuse across repeated triggers', () => {
  GravityHazardAudio.resetInstance();
  const mockCtx = new MockAudioContext(44100);
  const audio = new GravityHazardAudio(mockCtx);

  const initialBuffers = mockCtx.buffersCreated;
  audio.playFilteredNoiseBurst(0.1, 800, 200, 0.2);
  const afterFirst = mockCtx.buffersCreated;
  assert.strictEqual(afterFirst - initialBuffers, 1, 'First trigger creates static 500ms buffer');

  // 30 subsequent rapid triggers
  for (let i = 0; i < 30; i++) {
    audio.playFilteredNoiseBurst(0.1, 800, 200, 0.2);
  }
  assert.strictEqual(mockCtx.buffersCreated, afterFirst, 'Zero new buffers created across 30 triggers');

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 5: Solfeggio 528Hz Harmonic Transformation Chime Quad
// ==============================================================================

test('Tier 5: Event Horizon Dissipation triggers Solfeggio 528Hz Miracle Harmonic Quad', () => {
  GravityHazardAudio.resetInstance();
  const mockPool = new MockAudioVoicePool();
  const audio = GravityHazardAudio.getInstance(mockPool);

  audio.playSingularityDissipation(mockPool, 5000);
  assert.strictEqual(mockPool.tonesPlayed.length, 4, 'Dissipation plays exact 4-voice harmonic quad');

  const freqs = mockPool.tonesPlayed.map((t) => t.frequency).sort((a, b) => a - b);
  assert.strictEqual(freqs[0], 261.63, 'C4 root');
  assert.strictEqual(freqs[1], 329.63, 'E4 major third');
  assert.strictEqual(freqs[2], 392.00, 'G4 perfect fifth');
  assert.strictEqual(freqs[3], 528.00, 'Solfeggio 528.00Hz Miracle Tone');

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 6: Dual-Watchdog Cleanup (onended + setTimeout + clearPendingNodes)
// ==============================================================================

test('Tier 6: Dual-Watchdog node cleanup and clearPendingNodes leak prevention', async () => {
  GravityHazardAudio.resetInstance();
  const mockCtx = new MockAudioContext(44100);
  const audio = new GravityHazardAudio(mockCtx);

  // Trigger noise pulse
  audio.playSwirlNoisePulse(0.01, 400, 100, 2.0, 0.2);

  const sources = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode);
  assert.strictEqual(sources.length, 1, 'One buffer source created');
  const source = sources[0];

  // 1. Normal onended path
  source.finishPlayback();
  assert.strictEqual(source.disconnected, true, 'Node disconnected on finishPlayback');

  // 2. Timeout watchdog path
  audio.playSwirlNoisePulse(0.01, 400, 100, 2.0, 0.2);
  const source2 = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode)[1];
  assert.strictEqual(source2.disconnected, false, 'Node active before watchdog');

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.strictEqual(source2.disconnected, true, 'Watchdog timer disconnected orphaned node');

  // 3. Forceful clearPendingNodes
  audio.playSwirlNoisePulse(0.2, 400, 100, 2.0, 0.2);
  const source3 = mockCtx.nodes.filter((n) => n instanceof MockBufferSourceNode)[2];
  assert.strictEqual(source3.disconnected, false);
  audio.clearPendingNodes();
  assert.strictEqual(source3.disconnected, true, 'clearPendingNodes forcefully disconnected node');

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 7: Adversarial Input Fuzzing
// ==============================================================================

test('Tier 7: Adversarial float injections (NaN, Infinity, subnormals, excessive duration)', () => {
  GravityHazardAudio.resetInstance();
  const mockCtx = new MockAudioContext(44100);
  const audio = new GravityHazardAudio(mockCtx);

  const badInputs = [
    NaN,
    Infinity,
    -Infinity,
    -999,
    1e-16,
    0,
    999999,
  ];

  for (const bad of badInputs) {
    assert.doesNotThrow(() => {
      audio.playSwirlNoisePulse(bad, bad, bad, bad, bad);
      audio.playVacuumImplosionNoisePulse(bad, bad, bad, bad, bad);
      audio.playCosmicParticleHissPulse(bad, bad, bad, bad);
    }, 'Adversarial inputs must not crash or leak unhandled exceptions');
  }

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 8: GravityHazard FSM Audio Wiring Triggers & Accretion Sub-Phases
// ==============================================================================

test('Tier 8: Central FSM dispatcher handles state and accretion phase transitions cleanly', () => {
  GravityHazardAudio.resetInstance();
  const mockPool = new MockAudioVoicePool();

  // DORMANT -> ACCRETION_SWIRL (FORMATION)
  GravityHazardAudio.playGravityHazardState(
    GravityLifecycleState.ACCRETION_SWIRL,
    AccretionPhase.FORMATION,
    mockPool,
    1000
  );
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Plays formation drone');

  // Advance to COMPRESSION
  mockPool.reset();
  GravityHazardAudio.playGravityHazardState(
    GravityLifecycleState.ACCRETION_SWIRL,
    AccretionPhase.COMPRESSION,
    mockPool,
    2000
  );
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Plays compression whirr');

  // Advance to CRITICAL_COLLAPSE
  mockPool.reset();
  GravityHazardAudio.playGravityHazardState(
    GravityLifecycleState.ACCRETION_SWIRL,
    AccretionPhase.CRITICAL_COLLAPSE,
    mockPool,
    3000
  );
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Plays critical collapse shear');

  // Advance to SINGULARITY_BURST
  mockPool.reset();
  GravityHazardAudio.playGravityHazardState(
    GravityLifecycleState.SINGULARITY_BURST,
    AccretionPhase.NONE,
    mockPool,
    4000
  );
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Plays singularity burst implosion');

  // Advance to COOLDOWN (Dissipation)
  mockPool.reset();
  GravityHazardAudio.playGravityHazardState(
    GravityLifecycleState.COOLDOWN,
    AccretionPhase.NONE,
    mockPool,
    5000
  );
  assert.strictEqual(mockPool.tonesPlayed.length, 4, 'Plays Solfeggio 528Hz calm quad');

  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 9: Spatial & Boundary Invariants & Super-Bomb Cosmic Fusion Merger
// ==============================================================================

test('Tier 9: GravityHazard core bomb fusion evaluates accurately and triggers audio presets', () => {
  GravityHazardAudio.resetInstance();
  const mockPool = new MockAudioVoicePool();
  const audio = GravityHazardAudio.getInstance(mockPool);

  const hazard = new GravityHazard();
  hazard.init(6, 7); // Center at (7, 6)
  hazard.setCenter(6, 7);
  hazard.start();

  // Advance state timer
  hazard.update(100);

  // Two bombs within core radius
  const cx = hazard.getCenterWorldX();
  const cy = hazard.getCenterWorldY();
  const bombs = [
    { x: cx, y: cy, power: 2, id: 'bomb-1' },
    { x: cx + 5, y: cy + 5, power: 3, id: 'bomb-2' },
  ];

  const fusionRes = hazard.evaluateBombFusion(bombs, 1000);
  assert.strictEqual(fusionRes.triggered, true, 'Bomb fusion triggers when 2 bombs inside core threshold');
  assert.strictEqual(fusionRes.tintCyan, COSMIC_SUPER_BOMB_TINT_CYAN);

  mockPool.reset();
  audio.playCosmicFusionSuperBomb(mockPool, 1000);
  assert.strictEqual(mockPool.tonesPlayed.length, 4, 'Cosmic fusion plays 4-part coalescence & sub boom chord');

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 10: Zero-GC 10,000-Frame Soak Simulation
// ==============================================================================

test('Tier 10: Zero-GC 10,000-Frame Soak Simulation under continuous hazard lifecycle updates', () => {
  GravityHazardAudio.resetInstance();
  const mockCtx = new MockAudioContext(44100);
  const audio = new GravityHazardAudio(mockCtx);

  const hazard = new GravityHazard();
  hazard.init(6, 7);

  const startBuffers = mockCtx.buffersCreated;
  audio.playFilteredNoiseBurst(0.01, 800, 200, 0.2);
  const activeBuffers = mockCtx.buffersCreated;
  assert.strictEqual(activeBuffers - startBuffers, 1, 'Initial static buffer creation');

  // Run 10,000 frames
  for (let frame = 0; frame < 10000; frame++) {
    hazard.update(16.6); // 60 FPS tick
    if (frame % 500 === 0) {
      audio.playFilteredNoiseBurst(0.01, 800, 200, 0.2);
    }
  }

  assert.strictEqual(mockCtx.buffersCreated, activeBuffers, 'Zero additional AudioBuffers allocated in 10,000 frames');

  audio.destroy();
  GravityHazardAudio.resetInstance();
});

// ==============================================================================
// Tier 11: Lifecycle Reset, Stop, Singleton Teardown & Post-Destroy Safety
// ==============================================================================

test('Tier 11: Singleton teardown, reset, stop, and post-destroy safety', () => {
  GravityHazardAudio.resetInstance();
  const audio1 = GravityHazardAudio.getInstance();
  const audio2 = GravityHazardAudio.getInstance();
  assert.strictEqual(audio1, audio2, 'Singleton identity guaranteed');

  audio1.reset();
  audio1.stop();
  audio1.destroy();

  // Post-destroy calls do not throw
  assert.doesNotThrow(() => {
    audio1.playSingularityBurst();
    audio1.clearPendingNodes();
  }, 'Post-destroy calls must be completely safe');

  GravityHazardAudio.resetInstance();
});
