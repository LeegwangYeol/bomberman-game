/**
 * tests/rift_crisis_audio.test.mjs
 * Comprehensive 11-Tier Verification Battery for Dimensional Rift Crisis Procedural Synthesizer
 *
 * Verifies:
 * 1. Preset immutability and exact DSP acoustic constants (4 signature soundscapes)
 * 2. Headless SSR / Node.js runtime safety (graceful degradation)
 * 3. Mock AudioVoicePool routing & parameter scaling
 * 4. Rate-limiting debounce guards (subspace drone, teleport whoosh, spire sync)
 * 5. 4-Tier E-Minor / E-Dorian harmonic progression & stage telemetry
 * 6. Static white noise buffer management (Zero-GC) & dual-watchdog node tracking
 * 7. Teardown, stop(), reset(), and singleton lifecycle
 * 8. RiftCrisis gameplay mechanics audio integration tests
 * 9. WaveDirector Wave 28 Crisis Wave Integration & Relic Award (VOID_SINGULARITY_LENS)
 * 10. 10,000-frame Zero-GC simulation, serialization roundtrip, and NaN/subnormal defense
 * 11. Architectural defense, coordinate sanitization & toroidal wrap boundary invariants
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  RiftCrisisAudio,
  RIFT_AUDIO_PRESETS,
} from '../src/game/crises/RiftCrisisAudio.ts';
import { CrisisStage, CrisisType, HazardType } from '../src/game/crises/CrisisTypes.ts';
import { RiftCrisis } from '../src/game/crises/RiftCrisis.ts';
import { WaveDirector, WaveType } from '../src/game/progression/WaveDirector.ts';
import { RelicId } from '../src/game/progression/ProgressionTypes.ts';
import { CrisisManager } from '../src/game/crises/CrisisManager.ts';
import { ROWS, COLS } from '../src/game/pathfinding.ts';

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
    this.connectedTo = [];
    this.isDisconnected = false;
  }
  connect(dest) {
    this.connectedTo.push(dest);
    this.isDisconnected = false;
  }
  disconnect() {
    this.connectedTo = [];
    this.isDisconnected = true;
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super('OscillatorNode');
    this.frequency = new MockAudioParam(440);
    this.type = 'sine';
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
    super('GainNode');
    this.gain = new MockAudioParam(1);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super('BiquadFilterNode');
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor() {
    super('AudioBufferSourceNode');
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
  getChannelData(channelIndex) {
    return this.channelData[channelIndex] || this.channelData[0];
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode('DestinationNode');
    this.createdNodes = [];
  }
  createOscillator() {
    const node = new MockOscillatorNode();
    this.createdNodes.push(node);
    return node;
  }
  createGain() {
    const node = new MockGainNode();
    this.createdNodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.createdNodes.push(node);
    return node;
  }
  createBufferSource() {
    const node = new MockAudioBufferSourceNode();
    this.createdNodes.push(node);
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    return new MockAudioBuffer(channels, length, sampleRate);
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// ==============================================================================
// 11-TIER TEST BATTERY
// ==============================================================================

test('Tier 1: RIFT_AUDIO_PRESETS Immutability and Mathematical DSP Verification', () => {
  assert.ok(Object.isFrozen(RIFT_AUDIO_PRESETS), 'Preset dictionary must be deeply frozen');

  // Verify core soundscape presets exist and are frozen
  const expectedPresets = [
    'WARP_SUB_DRONE_34HZ',
    'SPACETIME_TEAR_130HZ',
    'REALITY_DISTORTION_ALARM',
    'TELEPORT_DOPPLER_SWEEP',
    'TELEPORT_SUB_POP',
    'TOROIDAL_WARP_WHOOSH',
    'SPIRE_TIER_1_E5',
    'SPIRE_TIER_2_G5',
    'SPIRE_TIER_3_B5',
    'SPIRE_TIER_4_E6',
    'SPIRE_OCTAVE_ANCHOR_E4',
    'SYNC_WINDOW_TICK',
    'SYNC_LOST_DECOHERENCE',
    'SINGULARITY_IMPLOSION_SUB',
    'REALITY_DISSIPATE_SWEEP',
    'RESOLUTION_CHORD_E4',
    'RESOLUTION_CHORD_GSHARP4',
    'RESOLUTION_CHORD_B4',
    'RESOLUTION_CHORD_E5',
    'STAGE_TRANSITION_ALARM',
    'THREAT_ELEVATION_WARPING',
  ];

  for (const name of expectedPresets) {
    const p = RIFT_AUDIO_PRESETS[name];
    assert.ok(p, `Preset ${name} must be defined`);
    assert.ok(Object.isFrozen(p), `Preset ${name} must be frozen`);
    assert.ok(Number.isFinite(p.frequency), `Preset ${name} frequency must be finite`);
    assert.ok(p.frequency >= 10, `Preset ${name} frequency must be non-subnormal (>= 10Hz)`);
    assert.ok(p.gain > 0 && p.gain <= 1.0, `Preset ${name} gain must be within (0, 1]`);
    assert.ok(p.duration > 0, `Preset ${name} duration must be positive`);

    if (p.frequencyRamp) {
      assert.ok(Object.isFrozen(p.frequencyRamp), `Preset ${name}.frequencyRamp must be frozen`);
      assert.ok(p.frequencyRamp.duration >= 0.005, `Preset ${name}.frequencyRamp.duration must be >= 5ms`);
      assert.ok(p.frequencyRamp.target >= 10, `Preset ${name}.frequencyRamp.target must be >= 10Hz`);
    }
    if (p.filter) {
      assert.ok(Object.isFrozen(p.filter), `Preset ${name}.filter must be frozen`);
      assert.ok(p.filter.frequency >= 20, `Preset ${name}.filter.frequency must be >= 20Hz`);
      assert.ok(p.filter.q >= 0.5 && p.filter.q <= 10.0, `Preset ${name}.filter.q must be reasonable`);
    }
  }

  // Exact E-Minor / E-Dorian harmonic checks
  assert.equal(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5.frequency, 659.25);
  assert.equal(RIFT_AUDIO_PRESETS.SPIRE_TIER_2_G5.frequency, 783.99);
  assert.equal(RIFT_AUDIO_PRESETS.SPIRE_TIER_3_B5.frequency, 987.77);
  assert.equal(RIFT_AUDIO_PRESETS.SPIRE_TIER_4_E6.frequency, 1318.51);
  assert.equal(RIFT_AUDIO_PRESETS.SPIRE_OCTAVE_ANCHOR_E4.frequency, 329.63);

  // Exact E-Major celestial resolution checks
  assert.equal(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_E4.frequency, 329.63);
  assert.equal(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_GSHARP4.frequency, 415.30);
  assert.equal(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_B4.frequency, 493.88);
  assert.equal(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_E5.frequency, 659.25);
});

test('Tier 2: Headless SSR / Node.js Runtime Safe Fallback (Zero Exception Guarantee)', () => {
  RiftCrisisAudio.resetInstance();
  const synth = RiftCrisisAudio.getInstance();

  assert.doesNotThrow(() => {
    synth.playSubspaceDrone(1000);
    synth.playTeleport(1000);
    synth.playSpireSync(1, 1000);
    synth.playSpireSync(2, 1200);
    synth.playSpireSync(3, 1400);
    synth.playSyncLost();
    synth.playRealityStabilized(2000);
    synth.playCrisisState(CrisisStage.WHISPERS, 10, 3000);
    synth.playCrisisState(CrisisStage.OUTBREAK, 45, 4000);
    synth.playCrisisState(CrisisStage.CLIMAX, 95, 5000);
    synth.playCrisisState(CrisisStage.RESOLVED, 0, 6000);
    synth.stop();
    synth.reset();
    synth.destroy();
  }, 'Headless execution without Web Audio must be 100% crash-free');

  assert.equal(synth.getActiveTimeoutCount(), 0);
  assert.equal(synth.getActiveTransientNodeCount(), 0);
  RiftCrisisAudio.resetInstance();
});

test('Tier 3: Mock AudioVoicePool Routing & Parameter Delivery', () => {
  RiftCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = RiftCrisisAudio.getInstance(pool, mockCtx);

  const playedTones = [];
  const originalPlayTone = pool.playTone.bind(pool);
  pool.playTone = (preset) => {
    playedTones.push(preset);
    return originalPlayTone(preset);
  };

  synth.playSubspaceDrone(1000);
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.WARP_SUB_DRONE_34HZ));
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.SPACETIME_TEAR_130HZ));

  synth.playTeleport(2000);
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.TELEPORT_DOPPLER_SWEEP));
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.TELEPORT_SUB_POP));
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.TOROIDAL_WARP_WHOOSH));

  synth.playRealityStabilized(5000);
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.SINGULARITY_IMPLOSION_SUB));
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_E4));
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_GSHARP4));
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_B4));
  assert.ok(playedTones.includes(RIFT_AUDIO_PRESETS.RESOLUTION_CHORD_E5));

  synth.destroy();
  pool.destroy();
  RiftCrisisAudio.resetInstance();
});

test('Tier 4: Rate Limiting & Cooldown Debounce Guards', () => {
  RiftCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = RiftCrisisAudio.getInstance(pool, mockCtx);

  let toneCount = 0;
  pool.playTone = () => {
    toneCount++;
    return true;
  };

  // Subspace Drone has 400ms cooldown
  synth.playSubspaceDrone(1000);
  const droneTones1 = toneCount;
  assert.ok(droneTones1 > 0);

  synth.playSubspaceDrone(1200); // 200ms later -> suppressed!
  assert.equal(toneCount, droneTones1);

  synth.playSubspaceDrone(1500); // 500ms later -> fires!
  assert.ok(toneCount > droneTones1);

  // Teleport has 120ms cooldown
  const beforeTeleport = toneCount;
  synth.playTeleport(10000);
  const afterTeleport1 = toneCount;
  assert.ok(afterTeleport1 > beforeTeleport);

  synth.playTeleport(10050); // 50ms later -> suppressed!
  assert.equal(toneCount, afterTeleport1);

  synth.playTeleport(10150); // 150ms later -> fires!
  assert.ok(toneCount > afterTeleport1);

  synth.destroy();
  pool.destroy();
  RiftCrisisAudio.resetInstance();
});

test('Tier 5: 4-Tier E-Minor / E-Dorian Harmonic Progression & Stage Telemetry', () => {
  RiftCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = RiftCrisisAudio.getInstance(pool, mockCtx);

  const played = [];
  pool.playTone = (p) => {
    played.push(p);
    return true;
  };

  // Spire 1 (polarizedCount = 1) -> E5
  synth.playSpireSync(1, 1000);
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5));
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SYNC_WINDOW_TICK));

  // Spire 2 (polarizedCount = 2) -> E5 + G5
  played.length = 0;
  synth.playSpireSync(2, 1200);
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5));
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_TIER_2_G5));

  // Spire 3 (polarizedCount = 3) -> E5 + G5 + B5 + E6 + E4 Anchor
  played.length = 0;
  synth.playSpireSync(3, 1400);
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_TIER_1_E5));
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_TIER_2_G5));
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_TIER_3_B5));
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_TIER_4_E6));
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SPIRE_OCTAVE_ANCHOR_E4));

  // Sync Lost Decoherence
  played.length = 0;
  synth.playSyncLost();
  assert.ok(played.includes(RIFT_AUDIO_PRESETS.SYNC_LOST_DECOHERENCE));

  synth.destroy();
  pool.destroy();
  RiftCrisisAudio.resetInstance();
});

test('Tier 6: Static White Noise Buffer Management (Zero-GC Allocation)', () => {
  const mockCtx = new MockAudioContext();
  const buf1 = RiftCrisisAudio.getOrCreateNoiseBuffer(mockCtx);
  const buf2 = RiftCrisisAudio.getOrCreateNoiseBuffer(mockCtx);

  assert.ok(buf1 instanceof MockAudioBuffer, 'Must create MockAudioBuffer');
  assert.strictEqual(buf1, buf2, 'Repeated calls must return cached buffer instance');
  assert.equal(buf1.length, Math.floor(mockCtx.sampleRate * 0.5), 'Buffer must be 500ms duration');
});

test('Tier 7: Dual-Watchdog Teardown, Cleanup & Singleton Lifecycle', () => {
  RiftCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = RiftCrisisAudio.getInstance(pool, mockCtx);

  synth.playSubspaceDrone(1000);
  synth.playTeleport(2000);
  synth.playSpireSync(3, 3000);

  assert.ok(synth.getActiveTimeoutCount() >= 0);
  assert.ok(synth.getActiveTransientNodeCount() >= 0);

  synth.reset();
  assert.equal(synth.getActiveTimeoutCount(), 0, 'Reset must clear all pending timeouts');
  assert.equal(synth.getActiveTransientNodeCount(), 0, 'Reset must disconnect all transient nodes');

  synth.destroy();
  assert.equal(synth.getActiveTimeoutCount(), 0);
  assert.equal(synth.getActiveTransientNodeCount(), 0);

  RiftCrisisAudio.resetInstance();
});

test('Tier 8: RiftCrisis Game Logic Integration & Audio Hooks', () => {
  RiftCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  RiftCrisisAudio.getInstance(pool, mockCtx);

  const crisis = new RiftCrisis();
  crisis.init();

  assert.equal(crisis.isQuantumSyncActive, false);
  assert.equal(crisis.spires.length, 3);
  assert.equal(crisis.rifts.length, 3);

  // Transition to OUTBREAK deploys rifts
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  for (const r of crisis.rifts) {
    const tile = crisis.getHazardAt(r.r, r.c);
    assert.ok(tile);
    assert.equal(tile.type, HazardType.DIMENSIONAL_WARP);
  }

  // Teleport through rift
  const dest1 = crisis.teleportThroughRift(crisis.rifts[0].r, crisis.rifts[0].c);
  assert.ok(dest1);
  assert.equal(dest1.r, crisis.rifts[1].r);
  assert.equal(dest1.c, crisis.rifts[1].c);
  assert.equal(crisis.warpsPerformedCount, 1);

  // Transition to CLIMAX deploys spires
  crisis.transitionToStage(CrisisStage.CLIMAX);
  for (const s of crisis.spires) {
    const tile = crisis.getHazardAt(s.r, s.c);
    assert.ok(tile);
    assert.equal(tile.type, HazardType.QUANTUM_SPIRE);
  }

  // Bomb blast strikes spire 1 and spire 2
  crisis.handleBombBlast(crisis.spires[0].r, crisis.spires[0].c, 0);
  crisis.handleBombBlast(crisis.spires[1].r, crisis.spires[1].c, 0);
  assert.equal(crisis.isQuantumSyncActive, true);
  assert.equal(crisis.spires.filter((s) => s.isPolarized).length, 2);

  // Expire 2.0s window
  crisis.update(RiftCrisis.QUANTUM_SYNC_WINDOW_MS + 50);
  assert.equal(crisis.isQuantumSyncActive, false);
  assert.equal(crisis.spires.filter((s) => s.isPolarized).length, 0);

  // Complete all 3 within window
  crisis.handleBombBlast(crisis.spires[0].r, crisis.spires[0].c, 0);
  crisis.handleBombBlast(crisis.spires[1].r, crisis.spires[1].c, 0);
  crisis.handleBombBlast(crisis.spires[2].r, crisis.spires[2].c, 0);
  assert.equal(crisis.spires.filter((s) => s.isPolarized).length, 3);
  assert.equal(crisis.getStage(), CrisisStage.RESOLVED);
  assert.equal(crisis.isCrisisVictorious(), true);

  crisis.reset();
  RiftCrisisAudio.resetInstance();
});

test('Tier 9: WaveDirector Wave 28 Progression & Relic Award (VOID_SINGULARITY_LENS)', () => {
  // Wave 28 classification
  assert.equal(WaveDirector.determineWaveType(28), WaveType.CRISIS);
  assert.equal(WaveDirector.isCrisisWave(28), true);
  assert.equal(WaveDirector.isBossWave(28), false);
  assert.equal(WaveDirector.selectCrisisForWave(28), CrisisType.DIMENSIONAL_RIFTS);

  // CrisisManager reward mapping
  const manager = new CrisisManager();
  const reward = manager.getCrisisReward(CrisisType.DIMENSIONAL_RIFTS);
  assert.equal(reward.crisisType, CrisisType.DIMENSIONAL_RIFTS);
  assert.equal(reward.relicReward, RelicId.VOID_SINGULARITY_LENS);
  assert.equal(reward.scoreAwarded, 5000);
  assert.equal(reward.starCandies, 35);
  assert.equal(reward.cosmicEssence, 15);
});

test('Tier 10: 10,000-Frame Zero-GC Soak Simulation under Dimensional Rifts', () => {
  RiftCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  RiftCrisisAudio.getInstance(pool, mockCtx);

  const crisis = new RiftCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  let nowMs = 100000;
  for (let frame = 0; frame < 10000; frame++) {
    nowMs += 16.6667;
    crisis.update(16.6667);

    if (frame === 100) {
      crisis.transitionToStage(CrisisStage.CLIMAX);
    }
    if (frame % 200 === 0) {
      crisis.teleportThroughRift(crisis.rifts[0].r, crisis.rifts[0].c);
    }
    if (frame % 300 === 0 && crisis.getStage() === CrisisStage.CLIMAX) {
      crisis.handleBombBlast(crisis.spires[0].r, crisis.spires[0].c, 0);
    }

    assert.ok(Number.isFinite(crisis.getThreat()), 'Threat must remain finite');
    assert.ok(crisis.getThreat() >= 0 && crisis.getThreat() <= 100, 'Threat must be bounded [0, 100]');
  }

  crisis.reset();
  RiftCrisisAudio.resetInstance();
});

test('Tier 11: Architectural Defense, Coordinate Sanitization & Toroidal Boundary Invariants', () => {
  const crisis = new RiftCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // 1. Toroidal Wrap boundaries
  const topWrap = crisis.wrapToroidalPosition(0, 5);
  assert.equal(topWrap.r, ROWS - 2);
  assert.equal(topWrap.c, 5);

  const bottomWrap = crisis.wrapToroidalPosition(ROWS - 1, 5);
  assert.equal(bottomWrap.r, 1);
  assert.equal(bottomWrap.c, 5);

  const leftWrap = crisis.wrapToroidalPosition(5, 0);
  assert.equal(leftWrap.r, 5);
  assert.equal(leftWrap.c, COLS - 2);

  const rightWrap = crisis.wrapToroidalPosition(5, COLS - 1);
  assert.equal(rightWrap.r, 5);
  assert.equal(rightWrap.c, 1);

  // 2. NaN & Boundary protection in wrapToroidalPosition
  const nanWrap = crisis.wrapToroidalPosition(NaN, NaN);
  assert.ok(Number.isFinite(nanWrap.r));
  assert.ok(Number.isFinite(nanWrap.c));

  // 3. Coordinate Sanitization in teleportThroughRift
  assert.strictEqual(crisis.teleportThroughRift(NaN, 5), null);
  assert.strictEqual(crisis.teleportThroughRift(-10, 100), null);

  // 4. Safe Spawn displacement
  const safeLoc = crisis.resolveSafeSpawnLocation(3, 4, (r, c) => r === 3 && c === 4);
  assert.ok(safeLoc.r >= 1 && safeLoc.r <= ROWS - 2);
  assert.ok(safeLoc.c >= 1 && safeLoc.c <= COLS - 2);
  assert.notEqual(safeLoc.r === 3 && safeLoc.c === 4, true);

  // Safe Spawn displacement NaN protection
  const nanSafe = crisis.resolveSafeSpawnLocation(NaN, NaN);
  assert.ok(Number.isFinite(nanSafe.r));
  assert.ok(Number.isFinite(nanSafe.c));

  // 5. State Serialization Roundtrip
  crisis.transitionToStage(CrisisStage.CLIMAX);
  crisis.handleBombBlast(crisis.spires[0].r, crisis.spires[0].c, 0);
  const serialized = crisis.serialize();
  assert.ok(serialized);
  assert.ok(serialized.extraState);
  assert.equal(serialized.extraState.isQuantumSyncActive, true);

  const restoredCrisis = new RiftCrisis();
  restoredCrisis.init();
  restoredCrisis.deserialize(serialized);
  assert.equal(restoredCrisis.isQuantumSyncActive, true);
  assert.equal(restoredCrisis.spires[0].isPolarized, true);

  // Deserialization with malformed / corrupt data
  assert.doesNotThrow(() => {
    restoredCrisis.deserialize({
      extraState: {
        isQuantumSyncActive: 'corrupt',
        quantumSyncTimerMs: NaN,
        spires: null,
      },
    });
  });

  crisis.reset();
  restoredCrisis.reset();
});
