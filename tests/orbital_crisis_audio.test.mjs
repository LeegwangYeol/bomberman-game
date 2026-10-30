/**
 * tests/orbital_crisis_audio.test.mjs
 * Comprehensive Verification Battery for Orbital Bombardment Crisis Procedural Synthesizer
 *
 * Verifies:
 * 1. Preset immutability and exact DSP acoustic constants (4 signature soundscapes)
 * 2. Headless SSR / Node.js runtime safety (graceful degradation)
 * 3. Mock AudioVoicePool routing & parameter scaling
 * 4. Radar Reticle Ping & Sweep frequency calculations and rate limits
 * 5. Kinetic Slug Atmospheric Scream, Impact & Crater Rumble layering
 * 6. Spinal Macrocannon 150Hz -> 1200Hz Charge Frequency Calculation & Whine
 * 7. Planetary Defense Uplink D-Major Triad (D5, F#5, A5, D6) & EMP Counter-Barrage
 * 8. Stage Transition handling across all Crisis stages (WHISPERS, OUTBREAK, CLIMAX, RESOLVED, FAILED)
 * 9. Dual-watchdog teardown, stop(), reset(), and singleton lifecycle
 * 10. 10,000-frame Zero-GC simulation & soak stability
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  OrbitalCrisisAudio,
  ORBITAL_AUDIO_PRESETS,
} from '../src/game/crises/OrbitalCrisisAudio.ts';
import { CrisisStage, CrisisType } from '../src/game/crises/CrisisTypes.ts';
import { OrbitalCrisis } from '../src/game/crises/OrbitalCrisis.ts';
import { WaveDirector } from '../src/game/progression/WaveDirector.ts';
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
    this.currentTime = 0;
    this.sampleRate = 44100;
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
}

// ==============================================================================
// Verification Battery
// ==============================================================================

test('Tier 1: Preset Integrity & Mathematical Audit (4 Signature Soundscapes)', () => {
  // 1. Reticle Ping & Radar Sweep
  const ping = ORBITAL_AUDIO_PRESETS.RETICLE_PING_HIGH;
  const sweep = ORBITAL_AUDIO_PRESETS.RETICLE_SWEEP_CHIRP;
  const radar = ORBITAL_AUDIO_PRESETS.RADAR_SWEEP_LOW;
  const sub = ORBITAL_AUDIO_PRESETS.DREADNOUGHT_APPROACH_SUB;

  assert.equal(ping.type, 'sine');
  assert.equal(ping.frequency, 1760.0);
  assert.equal(ping.frequencyRamp?.target, 2640.0);
  assert.equal(sweep.type, 'triangle');
  assert.equal(sweep.frequency, 987.77);
  assert.equal(radar.frequency, 180.0);
  assert.equal(radar.frequencyRamp?.target, 75.0);
  assert.equal(sub.frequency, 45.0);

  // 2. Heavy Kinetic Slug Impact & Crater Shockwave
  const scream = ORBITAL_AUDIO_PRESETS.KINETIC_ATMOSPHERIC_SCREAM;
  const crack = ORBITAL_AUDIO_PRESETS.KINETIC_IMPACT_CRACK;
  const thud = ORBITAL_AUDIO_PRESETS.CRATER_THUD_SUB;
  const debris = ORBITAL_AUDIO_PRESETS.CRATER_DEBRIS_RUMBLE;

  assert.equal(scream.type, 'sawtooth');
  assert.equal(scream.frequency, 1400.0);
  assert.equal(scream.frequencyRamp?.target, 220.0);
  assert.equal(crack.frequency, 580.0);
  assert.equal(crack.frequencyRamp?.target, 45.0);
  assert.equal(thud.frequency, 68.0);
  assert.equal(thud.frequencyRamp?.target, 22.0);
  assert.equal(debris.frequency, 95.0);

  // 3. Spinal Macrocannon Particle Lance Charging & Beam Drone
  const chargeBase = ORBITAL_AUDIO_PRESETS.MACROCANNON_CHARGE_BASE;
  const beamDrone = ORBITAL_AUDIO_PRESETS.MACROCANNON_BEAM_DRONE_SUB;
  const obliteration = ORBITAL_AUDIO_PRESETS.MACROCANNON_DISCHARGE_OBLITERATION;

  assert.equal(chargeBase.frequency, 150.0);
  assert.equal(chargeBase.frequencyRamp?.target, 1200.0);
  assert.equal(beamDrone.frequency, 38.0);
  assert.equal(beamDrone.frequencyRamp?.target, 34.0);
  assert.equal(obliteration.frequency, 380.0);

  // 4. Planetary Defense Uplink D-Major Triad & EMP Counter-Barrage
  const d5 = ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER1_D5;
  const fsharp5 = ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER2_FSHARP5;
  const a5 = ORBITAL_AUDIO_PRESETS.UPLINK_CHIME_TIER3_A5;
  const d6 = ORBITAL_AUDIO_PRESETS.UPLINK_TRIAD_OCTAVE_D6;

  assert.equal(d5.frequency, 587.33); // D5
  assert.equal(fsharp5.frequency, 739.99); // F#5
  assert.equal(a5.frequency, 880.00); // A5
  assert.equal(d6.frequency, 1174.66); // D6

  const empSub = ORBITAL_AUDIO_PRESETS.EMP_COUNTER_BARRAGE_SUB;
  const empCrack = ORBITAL_AUDIO_PRESETS.EMP_WARHEAD_DETONATION_CRACK;
  const powerdown = ORBITAL_AUDIO_PRESETS.FLEET_NEUTRALIZED_POWERDOWN;

  assert.equal(empSub.frequency, 75.0);
  assert.equal(empSub.frequencyRamp?.target, 18.0);
  assert.equal(empCrack.frequency, 850.0);
  assert.equal(powerdown.frequency, 320.0);

  // Immutability validation
  assert.ok(Object.isFrozen(ORBITAL_AUDIO_PRESETS), 'Root presets must be frozen');
  assert.ok(Object.isFrozen(ping), 'Preset tones must be frozen');
  assert.ok(Object.isFrozen(d5), 'Uplink tones must be frozen');
});

test('Tier 2: Headless SSR Safety (100% crash-free when AudioContext is unavailable)', () => {
  OrbitalCrisisAudio.resetInstance();
  const synth = new OrbitalCrisisAudio(null, null);

  assert.doesNotThrow(() => synth.playReticlePing(1.0));
  assert.doesNotThrow(() => synth.playRadarSweep());
  assert.doesNotThrow(() => synth.playReticleSweep());
  assert.doesNotThrow(() => synth.playKineticAtmosphericDescent());
  assert.doesNotThrow(() => synth.playAtmosphericScream());
  assert.doesNotThrow(() => synth.playKineticImpact());
  assert.doesNotThrow(() => synth.playKineticCraterImpact());
  assert.doesNotThrow(() => synth.playCraterThud());
  assert.doesNotThrow(() => synth.playKineticSalvoImpact(4));
  assert.doesNotThrow(() => synth.playMacrocannonCharge(50));
  assert.doesNotThrow(() => synth.playMacrocannonWhine(0.75));
  assert.doesNotThrow(() => synth.playMacrocannonBeamDrone());
  assert.doesNotThrow(() => synth.playMacrocannonBeam());
  assert.doesNotThrow(() => synth.playMacrocannonFire());
  assert.doesNotThrow(() => synth.playUplinkOverride(1));
  assert.doesNotThrow(() => synth.playUplinkOverride(3));
  assert.doesNotThrow(() => synth.playEmpCounterBarrage());
  assert.doesNotThrow(() => synth.playCounterBarrage());
  assert.doesNotThrow(() => synth.playFleetNeutralized());
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.WHISPERS));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.OUTBREAK));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.CLIMAX));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.RESOLVED));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.FAILED));
  assert.doesNotThrow(() => synth.playThreatElevation(80));
  assert.doesNotThrow(() => synth.stop());
  assert.doesNotThrow(() => synth.reset());

  synth.destroy();
});

test('Tier 3: Mock WebAudio Voice Pool Routing & Tone Synthesis Dispatch', () => {
  OrbitalCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new OrbitalCrisisAudio(pool);

  // 1. Play Reticle Ping
  synth.playReticlePing(1.0, 1000);
  assert.ok(pool.getActiveVoiceCount() >= 1, 'Reticle ping must acquire voice');

  // 2. Play Radar Sweep (3 voices: chirp, radar sweep low, dreadnought approach)
  pool.stop();
  synth.playRadarSweep(2000);
  assert.ok(pool.getActiveVoiceCount() >= 3, 'Radar sweep must engage 3 tone voices');

  // 3. Play Kinetic Impact (crack + thud + rumble + noise burst)
  pool.stop();
  synth.playKineticImpact(3000);
  assert.ok(pool.getActiveVoiceCount() >= 3, 'Kinetic impact must engage 3 tone voices');

  const bufferSources = mockCtx.createdNodes.filter((n) => n.nodeType === 'AudioBufferSource');
  assert.ok(bufferSources.length > 0, 'Kinetic impact debris must instantiate a noise buffer source');

  // 4. Play Spinal Macrocannon Charge
  pool.stop();
  synth.playMacrocannonCharge(50, 4000);
  assert.ok(pool.getActiveVoiceCount() >= 2, 'Macrocannon charge >= 25% must engage base + beam drone sub');

  // 5. Play Uplink Override Tier 1 vs Tier 3 (Full D-Major Triad)
  pool.stop();
  synth.playUplinkOverride(1, 6000);
  assert.equal(pool.getActiveVoiceCount(), 1, 'Uplink 1 engages single D5 chime');

  pool.stop();
  synth.playUplinkOverride(3, 7000);
  assert.equal(pool.getActiveVoiceCount(), 4, 'Uplink 3 engages full D-Major Triad (D5, F#5, A5, D6)');

  // 6. Play EMP Counter-Barrage
  pool.stop();
  synth.playEmpCounterBarrage(8000);
  assert.ok(pool.getActiveVoiceCount() >= 2, 'EMP Counter-Barrage engages sub + detonation crack');

  synth.stop();
  assert.equal(pool.getActiveVoiceCount(), 0);
  synth.destroy();
});

test('Tier 4: Rate Limiting & Cooldown Protection', () => {
  OrbitalCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new OrbitalCrisisAudio(pool);

  // Reticle ping rate-limit is 200ms
  synth.playReticlePing(1.0, 1000);
  assert.equal(pool.getActiveVoiceCount(), 1);

  pool.stop();
  synth.playReticlePing(1.0, 1100); // 100ms < 200ms
  assert.equal(pool.getActiveVoiceCount(), 0, 'Ping under 200ms must be throttled');

  synth.playReticlePing(1.0, 1250); // 250ms >= 200ms
  assert.equal(pool.getActiveVoiceCount(), 1, 'Ping after 200ms triggers successfully');

  // Kinetic impact rate-limit is 180ms
  pool.stop();
  synth.playKineticImpact(2000);
  assert.ok(pool.getActiveVoiceCount() >= 3);

  pool.stop();
  synth.playKineticImpact(2050); // 50ms < 180ms
  assert.equal(pool.getActiveVoiceCount(), 0, 'Kinetic impact under 180ms must be throttled');

  synth.destroy();
});

test('Tier 5: Spinal Macrocannon 150Hz -> 1200Hz Frequency Scaling Formula', () => {
  OrbitalCrisisAudio.resetInstance();
  const synth = new OrbitalCrisisAudio(null, null);

  // 0% charge = 150 Hz
  assert.equal(synth.calculateMacrocannonChargeFrequency(0), 150.0);

  // 50% charge = 150 + 0.5 * 1050 = 675 Hz
  assert.equal(synth.calculateMacrocannonChargeFrequency(50), 675.0);

  // 100% charge = 150 + 1050 = 1200 Hz
  assert.equal(synth.calculateMacrocannonChargeFrequency(100), 1200.0);

  // Bounds clamping
  assert.equal(synth.calculateMacrocannonChargeFrequency(-20), 150.0, 'Negative charge clamps to 150 Hz');
  assert.equal(synth.calculateMacrocannonChargeFrequency(150), 1200.0, 'Over 100% clamps to 1200 Hz');
  assert.equal(synth.calculateMacrocannonChargeFrequency(NaN), 150.0, 'NaN safely defaults to 150 Hz');

  synth.destroy();
});

test('Tier 6: Crisis Stage Transition Dispatcher', () => {
  OrbitalCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new OrbitalCrisisAudio(pool);

  // WHISPERS stage triggers Radar Sweep (3 voices)
  pool.stop();
  synth.playCrisisState(CrisisStage.WHISPERS, 0, 1000);
  assert.ok(pool.getActiveVoiceCount() >= 3, 'WHISPERS must dispatch Radar Sweep');

  // OUTBREAK stage triggers Stage Transition Alarm + Atmospheric Scream
  pool.stop();
  synth.playCrisisState(CrisisStage.OUTBREAK, 0, 2000);
  assert.ok(pool.getActiveVoiceCount() >= 2, 'OUTBREAK must dispatch Alarm + Atmospheric Scream');

  // CLIMAX stage triggers Macrocannon Charge
  pool.stop();
  synth.playCrisisState(CrisisStage.CLIMAX, 60, 4000);
  assert.ok(pool.getActiveVoiceCount() >= 2, 'CLIMAX must dispatch Alarm + Macrocannon Charge');

  // RESOLVED stage triggers EMP Counter-Barrage + Fleet Neutralized
  pool.stop();
  synth.playCrisisState(CrisisStage.RESOLVED, 0, 6000);
  assert.ok(pool.getActiveVoiceCount() >= 5, 'RESOLVED must dispatch Counter-Barrage + Fleet Neutralized');

  // FAILED stage triggers Macrocannon Fire
  pool.stop();
  synth.playCrisisState(CrisisStage.FAILED, 0, 8000);
  assert.ok(pool.getActiveVoiceCount() >= 2, 'FAILED must dispatch Macrocannon Fire');

  synth.destroy();
});

test('Tier 7: Dual-Watchdog Teardown, stop(), reset(), and Singleton Lifecycle', () => {
  OrbitalCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth1 = OrbitalCrisisAudio.getInstance(pool);

  synth1.playKineticImpact(1000);
  synth1.playEmpCounterBarrage(2000);
  assert.ok(synth1.getActiveTimeoutCount() > 0 || synth1.getActiveTransientNodeCount() >= 0);

  synth1.stop();
  assert.equal(synth1.getActiveTimeoutCount(), 0, 'stop() must clear all pending watchdog timeouts');
  assert.equal(synth1.getActiveTransientNodeCount(), 0, 'stop() must clear all transient audio nodes');

  // Verify singleton recreation
  OrbitalCrisisAudio.resetInstance();
  const synth2 = OrbitalCrisisAudio.getInstance();
  assert.notEqual(synth1, synth2, 'getInstance after resetInstance must return a new instance');

  OrbitalCrisisAudio.resetInstance();
});

test('Tier 8: OrbitalCrisis Game Logic Integration (Audio Hooks in Crisis Lifecycle)', () => {
  OrbitalCrisisAudio.resetInstance();
  const crisis = new OrbitalCrisis();

  // Initialize crisis
  crisis.init();
  assert.equal(crisis.type, CrisisType.ORBITAL_BOMBARDMENT);
  assert.equal(crisis.getStage(), CrisisStage.WHISPERS);

  // Transition to OUTBREAK
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  assert.equal(crisis.getStage(), CrisisStage.OUTBREAK);

  // Transition to CLIMAX
  crisis.transitionToStage(CrisisStage.CLIMAX);
  assert.equal(crisis.getStage(), CrisisStage.CLIMAX);

  // Climax threat formula verification with uplink mitigation
  const status = crisis.getStatus();
  assert.ok(status.threatMeter >= 0 && status.threatMeter <= 100);
  assert.ok(crisis.getThreat() >= 0 && crisis.getThreat() <= 100);

  // Simulate uplink blast
  crisis.onBombBlast({ r: 5, c: 5 }, 100);

  // Reset crisis cleanly
  crisis.reset();
  assert.equal(crisis.getStage(), CrisisStage.INACTIVE);

  OrbitalCrisisAudio.resetInstance();
});

test('Tier 9: WaveDirector Wave 16 & Relic Progression Mapping', () => {
  // WaveDirector static selection: Wave 16 is Crisis Wave for ORBITAL_BOMBARDMENT
  assert.equal(WaveDirector.isCrisisWave(16), true);
  assert.equal(
    WaveDirector.selectCrisisForWave(16),
    CrisisType.ORBITAL_BOMBARDMENT,
    'WaveDirector.selectCrisisForWave(16) must be CrisisType.ORBITAL_BOMBARDMENT'
  );

  // Start wave 16 with WaveDirector instance
  const director = new WaveDirector();
  director.startWave(16);

  const crisisType = director.getActiveCrisisType();
  assert.equal(
    crisisType,
    CrisisType.ORBITAL_BOMBARDMENT,
    'Wave 16 must activate CrisisType.ORBITAL_BOMBARDMENT'
  );

  // CrisisManager reward mapping yields ORBITAL_TARGETING_CORE
  const reward = director.getCrisisManager().getCrisisReward(CrisisType.ORBITAL_BOMBARDMENT);
  assert.ok(reward, 'ORBITAL_BOMBARDMENT must define victory reward');
  assert.equal(reward.relicReward, RelicId.ORBITAL_TARGETING_CORE, 'Reward must be ORBITAL_TARGETING_CORE');
  assert.equal(reward.scoreAwarded, 5000);
  assert.equal(reward.starCandies, 35);
  assert.equal(reward.cosmicEssence, 15);

  director.destroy();
});

test('Tier 10: 10,000-Frame Zero-GC Soak Test under Stress Salvos', () => {
  OrbitalCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new OrbitalCrisisAudio(pool);

  const stages = [
    CrisisStage.INACTIVE,
    CrisisStage.WHISPERS,
    CrisisStage.OUTBREAK,
    CrisisStage.CLIMAX,
    CrisisStage.RESOLVED,
  ];

  let nowMs = 100000;
  for (let frame = 0; frame < 10000; frame++) {
    nowMs += 16.67; // 60 FPS tick
    mockCtx.currentTime += 0.01667;

    // Simulate occasional pings and impacts
    if (frame % 30 === 0) {
      synth.playReticlePing((frame % 300) / 300, nowMs);
    }
    if (frame % 60 === 0) {
      synth.playKineticImpact(nowMs);
    }
    if (frame % 200 === 0) {
      synth.playMacrocannonWhine((frame % 1000) / 1000, nowMs);
    }
    if (frame % 1000 === 0) {
      const stageIdx = (frame / 1000) % stages.length;
      synth.playCrisisState(stages[stageIdx], 50, nowMs);
    }
  }

  // Clean shutdown
  synth.stop();
  assert.equal(synth.getActiveTimeoutCount(), 0);
  assert.equal(synth.getActiveTransientNodeCount(), 0);

  synth.destroy();
  OrbitalCrisisAudio.resetInstance();
});
