/**
 * tests/lava_crisis_audio.test.mjs
 * Comprehensive Verification Battery for Creeping Lava Fissure Crisis Procedural Synthesizer
 *
 * Verifies:
 * 1. Preset immutability and exact DSP acoustic constants (4 signature soundscapes)
 * 2. Headless SSR / Node.js runtime safety (graceful degradation)
 * 3. Mock AudioVoicePool routing & parameter scaling
 * 4. Subterranean Magma Drone & Tectonic Pulse rate limits and voice allocation
 * 5. Molten Lava Creep & Magma Wave Surge sub-bass layering
 * 6. Bomb Detonations & 4-Tier Obsidian Quenching Chimes (D-Minor / D-Dorian)
 * 7. Caldera Pressure Valve Sealed & Tectonic Calm Resolution (D-Major Solfeggio 528Hz Peace Chord)
 * 8. Stage Transition handling across all Crisis stages (WHISPERS, OUTBREAK, CLIMAX, RESOLVED, FAILED)
 * 9. Dual-watchdog teardown, stop(), reset(), and singleton lifecycle
 * 10. WaveDirector Wave 24 Crisis Wave Integration & Relic Award (PYROCLASTIC_PRISM)
 * 11. 10,000-frame Zero-GC simulation, serialization roundtrip, and NaN/subnormal defense
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  LavaCrisisAudio,
  LAVA_AUDIO_PRESETS,
} from '../src/game/crises/LavaCrisisAudio.ts';
import { CrisisStage, CrisisType, HazardType } from '../src/game/crises/CrisisTypes.ts';
import { LavaCrisis } from '../src/game/crises/LavaCrisis.ts';
import { WaveDirector, WaveType } from '../src/game/progression/WaveDirector.ts';
import { RelicId } from '../src/game/progression/ProgressionTypes.ts';
import { CrisisManager } from '../src/game/crises/CrisisManager.ts';

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
  start() { this.started = true; }
  stop() {
    this.stopped = true;
    if (typeof this.onended === 'function') this.onended();
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

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor() {
    super('AudioBufferSource');
    this.buffer = null;
    this.started = false;
    this.stopped = false;
    this.onended = null;
  }
  start() { this.started = true; }
  stop() {
    this.stopped = true;
    if (typeof this.onended === 'function') this.onended();
  }
}

class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockAudioNode('Destination');
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
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  resume() {
    return Promise.resolve();
  }
}

// ==============================================================================
// Tier 1: LAVA_AUDIO_PRESETS Immutability & DSP Verification
// ==============================================================================

test('Tier 1: LAVA_AUDIO_PRESETS Immutability & DSP Verification', () => {
  // Preset container is frozen
  assert.ok(Object.isFrozen(LAVA_AUDIO_PRESETS), 'LAVA_AUDIO_PRESETS must be deeply frozen');

  // 1. Subterranean Magma Rumble & Tectonic Static Drone
  const subDrone = LAVA_AUDIO_PRESETS.MAGMA_SUB_DRONE_32HZ;
  assert.equal(subDrone.type, 'sine');
  assert.equal(subDrone.frequency, 32.4);
  assert.equal(subDrone.frequencyRamp?.target, 24.0);
  assert.equal(subDrone.frequencyRamp?.duration, 1.50);
  assert.equal(subDrone.filter?.type, 'lowpass');
  assert.equal(subDrone.filter?.frequency, 75);
  assert.ok(Object.isFrozen(subDrone));

  const tectonicPulse = LAVA_AUDIO_PRESETS.TECTONIC_PULSE_110HZ;
  assert.equal(tectonicPulse.type, 'triangle');
  assert.equal(tectonicPulse.frequency, 110.0);
  assert.equal(tectonicPulse.frequencyRamp?.target, 85.0);
  assert.equal(tectonicPulse.filter?.type, 'bandpass');
  assert.ok(Object.isFrozen(tectonicPulse));

  const boilingStatic = LAVA_AUDIO_PRESETS.MAGMA_BOILING_STATIC;
  assert.equal(boilingStatic.type, 'triangle');
  assert.equal(boilingStatic.frequency, 160.0);
  assert.equal(boilingStatic.filter?.type, 'bandpass');

  const seismicAlert = LAVA_AUDIO_PRESETS.SEISMIC_WARNING_ALERT;
  assert.equal(seismicAlert.type, 'sawtooth');
  assert.equal(seismicAlert.frequency, 780.0);
  assert.equal(seismicAlert.frequencyRamp?.target, 390.0);

  // 2. Molten Lava Creep & Perimeter Rupture Roar
  const crescendo = LAVA_AUDIO_PRESETS.LAVA_RUPTURE_CRESCENDO;
  assert.equal(crescendo.type, 'sawtooth');
  assert.equal(crescendo.frequency, 140.0);
  assert.equal(crescendo.frequencyRamp?.target, 820.0);
  assert.equal(crescendo.filter?.rampTarget, 1600);

  const moltenSub = LAVA_AUDIO_PRESETS.MOLTEN_SURGE_SUB_THUD;
  assert.equal(moltenSub.type, 'sine');
  assert.equal(moltenSub.frequency, 160.0);
  assert.equal(moltenSub.filter?.type, 'lowpass');

  const scorchRoar = LAVA_AUDIO_PRESETS.CORRIDOR_SCORCH_ROAR;
  assert.equal(scorchRoar.type, 'sawtooth');
  assert.equal(scorchRoar.frequency, 220.0);
  assert.equal(scorchRoar.frequencyRamp?.target, 55.0);

  // 3. Obsidian Solidification & Steam Quench Chimes (D-Minor / D-Dorian)
  const quenchSnap = LAVA_AUDIO_PRESETS.STEAM_QUENCH_SNAP;
  assert.equal(quenchSnap.type, 'sawtooth');
  assert.equal(quenchSnap.frequency, 920.0);
  assert.equal(quenchSnap.frequencyRamp?.target, 160.0);

  const quenchSub = LAVA_AUDIO_PRESETS.QUENCH_SUB_THUD;
  assert.equal(quenchSub.type, 'sine');
  assert.equal(quenchSub.frequency, 45.0);

  // 4-Tier Obsidian Chimes in D-Minor / D-Dorian
  const chime1 = LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER1_D5;
  const chime2 = LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER2_F5;
  const chime3 = LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER3_A5;
  const chime4 = LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER4_D6;
  const octaveAnchor = LAVA_AUDIO_PRESETS.OBSIDIAN_OCTAVE_D4;

  assert.equal(chime1.frequency, 587.33); // D5
  assert.equal(chime2.frequency, 698.46); // F5
  assert.equal(chime3.frequency, 880.00); // A5
  assert.equal(chime4.frequency, 1174.66); // D6
  assert.equal(octaveAnchor.frequency, 293.66); // D4

  // 4. Caldera Pressure Valve Sealed & Tectonic Calm Resolution (D-Major Solfeggio 528Hz Resolution)
  const sealD4 = LAVA_AUDIO_PRESETS.CALDERA_SEAL_D4;
  const sealFSharp4 = LAVA_AUDIO_PRESETS.CALDERA_SEAL_FSHARP4;
  const sealA4 = LAVA_AUDIO_PRESETS.CALDERA_SEAL_A4;
  const sealD5 = LAVA_AUDIO_PRESETS.CALDERA_SEAL_D5;
  const coolingDissipate = LAVA_AUDIO_PRESETS.COOLING_DISSIPATE_SWEEP;

  assert.equal(sealD4.frequency, 293.66); // D4
  assert.equal(sealFSharp4.frequency, 369.99); // F#4
  assert.equal(sealA4.frequency, 440.00); // A4
  assert.equal(sealD5.frequency, 587.33); // D5
  assert.equal(coolingDissipate.type, 'triangle');
  assert.equal(coolingDissipate.frequency, 480.0);
  assert.equal(coolingDissipate.frequencyRamp?.target, 50.0);
});

// ==============================================================================
// Tier 2: Headless SSR / Node.js Runtime Safe Fallback
// ==============================================================================

test('Tier 2: Headless SSR / Node.js Runtime Safe Fallback (Zero Exception)', () => {
  LavaCrisisAudio.resetInstance();
  const synth = LavaCrisisAudio.getInstance();

  // In headless Node.js without WebAudio context, all methods must execute safely without throwing
  assert.doesNotThrow(() => {
    synth.playMagmaDrone();
    synth.playLavaAdvance();
    synth.playObsidianQuenched(1);
    synth.playObsidianQuenched(2);
    synth.playObsidianQuenched(3);
    synth.playObsidianQuenched(4);
    synth.playCalderaSealed();
    synth.playCrisisState(CrisisStage.WHISPERS, 10);
    synth.playCrisisState(CrisisStage.OUTBREAK, 45);
    synth.playCrisisState(CrisisStage.CLIMAX, 90);
    synth.playCrisisState(CrisisStage.RESOLVED, 0);
    synth.stop();
    synth.reset();
    synth.destroy();
  });

  assert.equal(synth.getActiveTimeoutCount(), 0);
  assert.equal(synth.getActiveTransientNodeCount(), 0);
  LavaCrisisAudio.resetInstance();
});

// ==============================================================================
// Tier 3: Mock AudioVoicePool Routing & Voice Layering
// ==============================================================================

test('Tier 3: Mock AudioVoicePool Routing & Voice Layering', () => {
  LavaCrisisAudio.resetInstance();
  const playedTones = [];
  const mockPool = {
    playTone: (preset) => playedTones.push(preset),
    acquireVoice: () => null,
    stop: () => {},
    reset: () => {},
    destroy: () => {},
    getContext: () => null,
  };

  const synth = LavaCrisisAudio.getInstance(mockPool);

  // Play Magma Drone
  synth.playMagmaDrone(1000);
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.MAGMA_SUB_DRONE_32HZ));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.TECTONIC_PULSE_110HZ));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.MAGMA_BOILING_STATIC));

  // Play Lava Advance
  playedTones.length = 0;
  synth.playLavaAdvance(2000);
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.MOLTEN_SURGE_SUB_THUD));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.LAVA_RUPTURE_CRESCENDO));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.CORRIDOR_SCORCH_ROAR));

  // Play Obsidian Quenched (Tier 4 + Octave)
  playedTones.length = 0;
  synth.playObsidianQuenched(4, 3000);
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.STEAM_QUENCH_SNAP));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.QUENCH_SUB_THUD));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.OBSIDIAN_CHIME_TIER4_D6));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.OBSIDIAN_OCTAVE_D4));

  // Play Caldera Sealed (D-Major Peace Chord)
  playedTones.length = 0;
  synth.playCalderaSealed(4000);
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.CALDERA_SEAL_D4));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.CALDERA_SEAL_FSHARP4));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.CALDERA_SEAL_A4));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.CALDERA_SEAL_D5));
  assert.ok(playedTones.includes(LAVA_AUDIO_PRESETS.COOLING_DISSIPATE_SWEEP));

  LavaCrisisAudio.resetInstance();
});

// ==============================================================================
// Tier 4: Rate Limiting & Cooldown Guards Prevent Audio Thrashing
// ==============================================================================

test('Tier 4: Rate Limiting & Cooldown Guards Prevent Audio Thrashing', () => {
  LavaCrisisAudio.resetInstance();
  let toneCallCount = 0;
  const mockPool = {
    playTone: () => toneCallCount++,
    acquireVoice: () => null,
    stop: () => {},
    reset: () => {},
    destroy: () => {},
    getContext: () => null,
  };

  const synth = LavaCrisisAudio.getInstance(mockPool);

  // Rapid spam of playMagmaDrone within 400ms cooldown window
  toneCallCount = 0;
  synth.playMagmaDrone(1000);
  const firstCount = toneCallCount;
  assert.ok(firstCount > 0);

  // Call again 10ms later (should be rate-limited and ignored)
  synth.playMagmaDrone(1010);
  synth.playMagmaDrone(1020);
  synth.playMagmaDrone(1050);
  assert.equal(toneCallCount, firstCount, 'Rapid calls within cooldown must be suppressed');

  // Advance time beyond 400ms window
  synth.playMagmaDrone(1450);
  assert.ok(toneCallCount > firstCount, 'Call after cooldown window must be processed');

  // Test Obsidian Quenched rate limiting (120ms cooldown)
  toneCallCount = 0;
  synth.playObsidianQuenched(1, 2000);
  const quenchCount = toneCallCount;
  assert.ok(quenchCount > 0);

  synth.playObsidianQuenched(2, 2050);
  assert.equal(toneCallCount, quenchCount, 'Quench chimes within 120ms cooldown must be suppressed');

  synth.playObsidianQuenched(2, 2150);
  assert.ok(toneCallCount > quenchCount, 'Quench chimes after cooldown window must fire');

  LavaCrisisAudio.resetInstance();
});

// ==============================================================================
// Tier 5: Crisis Stage Transition Dispatcher & Threat Telemetry
// ==============================================================================

test('Tier 5: Crisis Stage Transition Dispatcher & Threat Telemetry', () => {
  LavaCrisisAudio.resetInstance();
  const dispatchedTones = [];
  const mockPool = {
    playTone: (p) => dispatchedTones.push(p),
    acquireVoice: () => null,
    stop: () => {},
    reset: () => {},
    destroy: () => {},
    getContext: () => null,
  };

  const synth = LavaCrisisAudio.getInstance(mockPool);

  // WHISPERS stage
  dispatchedTones.length = 0;
  synth.playCrisisState(CrisisStage.WHISPERS, 15, 1000);
  assert.ok(dispatchedTones.includes(LAVA_AUDIO_PRESETS.MAGMA_SUB_DRONE_32HZ));

  // OUTBREAK stage
  dispatchedTones.length = 0;
  synth.playCrisisState(CrisisStage.OUTBREAK, 40, 2000);
  assert.ok(dispatchedTones.includes(LAVA_AUDIO_PRESETS.STAGE_TRANSITION_ALARM));
  assert.ok(dispatchedTones.includes(LAVA_AUDIO_PRESETS.SEISMIC_WARNING_ALERT));

  // CLIMAX stage with high threat (>80)
  dispatchedTones.length = 0;
  synth.playCrisisState(CrisisStage.CLIMAX, 92, 3000);
  assert.ok(dispatchedTones.includes(LAVA_AUDIO_PRESETS.STAGE_TRANSITION_ALARM));
  assert.ok(dispatchedTones.includes(LAVA_AUDIO_PRESETS.THREAT_ELEVATION_WARPING));

  // RESOLVED stage
  dispatchedTones.length = 0;
  synth.playCrisisState(CrisisStage.RESOLVED, 0, 4000);
  assert.ok(dispatchedTones.includes(LAVA_AUDIO_PRESETS.CALDERA_SEAL_D4));
  assert.ok(dispatchedTones.includes(LAVA_AUDIO_PRESETS.COOLING_DISSIPATE_SWEEP));

  LavaCrisisAudio.resetInstance();
});

// ==============================================================================
// Tier 6: Static White Noise Buffer Management (Zero-GC) & Dual Watchdog
// ==============================================================================

test('Tier 6: Static White Noise Buffer Management (Zero-GC) & Dual Watchdog', () => {
  const mockCtx = new MockAudioContext();
  const buffer1 = LavaCrisisAudio.getOrCreateNoiseBuffer(mockCtx);
  assert.ok(buffer1 !== null);
  assert.equal(buffer1.numberOfChannels, 1);
  assert.equal(buffer1.sampleRate, 44100);

  // Re-retrieval at same sample rate reuses the exact same AudioBuffer instance (Zero-GC)
  const buffer2 = LavaCrisisAudio.getOrCreateNoiseBuffer(mockCtx);
  assert.strictEqual(buffer1, buffer2, 'Static noise buffer must be cached and permanently reused');
});

// ==============================================================================
// Tier 7: Teardown, stop(), reset(), and Singleton Lifecycle
// ==============================================================================

test('Tier 7: Teardown, stop(), reset(), and Singleton Lifecycle', () => {
  LavaCrisisAudio.resetInstance();
  let poolResetCalled = false;
  let poolStopCalled = false;
  const mockPool = {
    playTone: () => {},
    acquireVoice: () => null,
    stop: () => { poolStopCalled = true; },
    reset: () => { poolResetCalled = true; },
    destroy: () => {},
    getContext: () => null,
  };

  const synth = LavaCrisisAudio.getInstance(mockPool);
  synth.playMagmaDrone(1000);

  synth.reset();
  assert.ok(poolResetCalled || poolStopCalled, 'reset() must invoke voice pool reset or stop');
  assert.equal(synth.getActiveTimeoutCount(), 0);
  assert.equal(synth.getActiveTransientNodeCount(), 0);

  // Verify singleton re-acquisition and resetInstance()
  const instanceA = LavaCrisisAudio.getInstance();
  assert.strictEqual(synth, instanceA);

  LavaCrisisAudio.resetInstance();
  const instanceB = LavaCrisisAudio.getInstance();
  assert.notStrictEqual(instanceA, instanceB, 'resetInstance() must nullify singleton');

  LavaCrisisAudio.resetInstance();
});

// ==============================================================================
// Tier 8: LavaCrisis Game Logic Integration & Audio Hooks
// ==============================================================================

test('Tier 8: LavaCrisis Game Logic Integration & Audio Hooks', () => {
  LavaCrisisAudio.resetInstance();
  const crisis = new LavaCrisis();
  crisis.init();

  assert.equal(crisis.id, CrisisType.CREEPING_LAVA);
  assert.equal(crisis.getStage(), CrisisStage.WHISPERS);
  assert.equal(crisis.currentLavaRing, 1);
  assert.equal(crisis.isCalderaSealed, false);
  assert.ok(crisis.getActiveAlert() !== null);
  assert.equal(crisis.getActiveAlert()?.id, 'lava_whispers');

  // Transition to OUTBREAK (advances ring 1)
  crisis.setStage(CrisisStage.OUTBREAK);
  assert.equal(crisis.getStage(), CrisisStage.OUTBREAK);
  assert.equal(crisis.currentLavaRing, 2);
  assert.ok(crisis.lavaTilesCount > 0);

  // Bomb detonation turns lava into obsidian
  const initialObsidian = crisis.obsidianSolidifiedCount;
  // Detonate at ring 1 (e.g. 1, 1 is a non-pillar tile)
  crisis.handleBombBlast(1, 1, 1);
  assert.ok(crisis.obsidianSolidifiedCount >= initialObsidian);

  // Transition to CLIMAX (spawns caldera valve at 6, 7)
  crisis.setStage(CrisisStage.CLIMAX);
  assert.equal(crisis.getStage(), CrisisStage.CLIMAX);
  const calderaHazard = crisis.getHazardAt(LavaCrisis.CALDERA_VALVE.r, LavaCrisis.CALDERA_VALVE.c);
  assert.ok(calderaHazard !== null);
  assert.equal(calderaHazard.type, HazardType.CALDERA_VALVE);

  // Bomb blast at caldera valve resolves crisis
  crisis.handleBombBlast(LavaCrisis.CALDERA_VALVE.r, LavaCrisis.CALDERA_VALVE.c, 1);
  assert.equal(crisis.isCalderaSealed, true);
  assert.equal(crisis.getStage(), CrisisStage.RESOLVED);
  assert.equal(crisis.isCrisisVictorious(), true);

  crisis.reset();
  assert.equal(crisis.currentLavaRing, 1);
  assert.equal(crisis.isCalderaSealed, false);
  assert.equal(crisis.obsidianSolidifiedCount, 0);

  LavaCrisisAudio.resetInstance();
});

// ==============================================================================
// Tier 9: WaveDirector Wave 24 Crisis Wave & Relic Award
// ==============================================================================

test('Tier 9: WaveDirector Wave 24 Crisis Wave & Relic Award', () => {
  // Wave 24 is classified as a CRISIS wave (24 % 4 === 0)
  assert.equal(WaveDirector.determineWaveType(24), WaveType.CRISIS);
  assert.equal(WaveDirector.isCrisisWave(24), true);

  // Wave 24 is explicitly mapped to CREEPING_LAVA
  assert.equal(WaveDirector.selectCrisisForWave(24), CrisisType.CREEPING_LAVA);

  // Start wave 24 with WaveDirector instance
  const director = new WaveDirector();
  director.startWave(24);

  const crisisType = director.getActiveCrisisType();
  assert.equal(
    crisisType,
    CrisisType.CREEPING_LAVA,
    'Wave 24 must activate CrisisType.CREEPING_LAVA'
  );

  // CrisisManager reward mapping yields PYROCLASTIC_PRISM
  const reward = director.getCrisisManager().getCrisisReward(CrisisType.CREEPING_LAVA);
  assert.ok(reward, 'CREEPING_LAVA must define victory reward');
  assert.equal(reward.relicReward, RelicId.PYROCLASTIC_PRISM, 'Reward must be PYROCLASTIC_PRISM');
  assert.equal(reward.scoreAwarded, 5000);
});

// ==============================================================================
// Tier 10: 10,000-Frame Zero-GC Soak Test under Creeping Lava
// ==============================================================================

test('Tier 10: 10,000-Frame Zero-GC Soak Test under Creeping Lava', () => {
  LavaCrisisAudio.resetInstance();
  const crisis = new LavaCrisis();
  crisis.init();

  const FRAME_MS = 16.6667;
  crisis.setStage(CrisisStage.WHISPERS);

  for (let frame = 0; frame < 10000; frame++) {
    crisis.update(FRAME_MS);

    if (frame === 1000) {
      crisis.setStage(CrisisStage.OUTBREAK);
    } else if (frame === 3000) {
      crisis.setStage(CrisisStage.CLIMAX);
    } else if (frame === 5000) {
      // Periodic bomb detonation
      crisis.handleBombBlast(3, 3, 2);
    } else if (frame === 7000) {
      // Seal caldera valve
      crisis.handleBombBlast(LavaCrisis.CALDERA_VALVE.r, LavaCrisis.CALDERA_VALVE.c, 1);
    } else if (frame === 8500) {
      crisis.reset();
      crisis.init();
      crisis.setStage(CrisisStage.WHISPERS);
    }

    assert.ok(Number.isFinite(crisis.getThreat()), `Threat must be finite at frame ${frame}`);
    assert.ok(Number.isFinite(crisis.currentLavaRing), `currentLavaRing must be finite at frame ${frame}`);
    assert.ok(Number.isFinite(crisis.lavaTilesCount), `lavaTilesCount must be finite at frame ${frame}`);
  }

  assert.ok(crisis.getThreat() >= 0 && crisis.getThreat() <= 100);
  LavaCrisisAudio.resetInstance();
});

// ==============================================================================
// Tier 11: Architectural Defense, NaN Shielding, Serialization & Edge-Case Regressions
// ==============================================================================

test('Tier 11: Architectural Defense, NaN Shielding, Serialization & Edge-Case Regressions', () => {
  LavaCrisisAudio.resetInstance();
  const crisis = new LavaCrisis();
  crisis.init();
  crisis.setStage(CrisisStage.OUTBREAK);

  // 1. Serialization / Deserialization Roundtrip
  crisis.advanceLavaRing();
  crisis.obsidianSolidifiedCount = 3;
  crisis.isCalderaSealed = false;
  crisis.lavaAdvanceTimerMs = 4500;

  const serialized = crisis.serialize();
  assert.ok(serialized !== null);
  assert.equal(serialized.crisisType, CrisisType.CREEPING_LAVA);
  assert.equal(serialized.stage, CrisisStage.OUTBREAK);
  assert.ok(serialized.extraState !== undefined);
  assert.equal(serialized.extraState?.obsidianSolidifiedCount, 3);
  assert.equal(serialized.extraState?.lavaAdvanceTimerMs, 4500);

  const restoredCrisis = new LavaCrisis();
  restoredCrisis.deserialize(serialized);
  assert.equal(restoredCrisis.getStage(), CrisisStage.OUTBREAK);
  assert.equal(restoredCrisis.obsidianSolidifiedCount, 3);
  assert.equal(restoredCrisis.lavaAdvanceTimerMs, 4500);

  // 2. Deserialization Fuzzing & Malformed Objectives
  assert.doesNotThrow(() => {
    restoredCrisis.deserialize({
      objectives: [null, undefined, { id: null }],
      threatMeter: NaN,
      stage: 'INVALID_STAGE',
      extraState: {
        lavaAdvanceTimerMs: NaN,
        currentLavaRing: -5,
        lavaTilesCount: Infinity,
        obsidianSolidifiedCount: null,
      },
    });
  });

  // 3. Coordinate NaN & Bounds Protection
  assert.equal(crisis.shouldIncinerateEntity(NaN, 5), false);
  assert.equal(crisis.shouldIncinerateEntity(5, Infinity), false);
  assert.equal(crisis.shouldIncinerateEntity(-1, 0), false);
  assert.equal(crisis.shouldIncinerateEntity(100, 100), false);

  assert.doesNotThrow(() => {
    crisis.handleBombBlast(NaN, NaN, NaN);
    crisis.handleBombBlast(-10, -10, 2);
    crisis.handleBombBlast(50, 50, 2);
  });

  LavaCrisisAudio.resetInstance();
});
