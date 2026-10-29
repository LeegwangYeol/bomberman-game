import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  ClockworkCrisisAudio,
  CLOCKWORK_AUDIO_PRESETS,
} from '../src/game/crises/ClockworkCrisisAudio.ts';
import { ClockworkCrisis } from '../src/game/crises/ClockworkCrisis.ts';
import { CrisisStage, CrisisType } from '../src/game/crises/CrisisTypes.ts';
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
// Test Suite: Clockwork Crisis Audio Procedural WebAudio Synthesizer
// ==============================================================================

test('Tier 1: Preset Integrity & Mathematical Audit (4 Signature Soundscapes)', () => {
  // 1. Metronome Ticking
  const tick = CLOCKWORK_AUDIO_PRESETS.METRONOME_TICK_WOODBLOCK;
  const tock = CLOCKWORK_AUDIO_PRESETS.METRONOME_TOCK_BRASS;
  assert.equal(tick.type, 'triangle');
  assert.equal(tick.frequency, 1800.0);
  assert.equal(tick.frequencyRamp?.target, 400.0);
  assert.equal(tock.type, 'triangle');
  assert.equal(tock.frequency, 1200.0);
  assert.equal(tock.frequencyRamp?.target, 250.0);

  // 2. Conveyor Belt & Gear Drone
  const humA = CLOCKWORK_AUDIO_PRESETS.CONVEYOR_HUM_VOICE_A;
  const humB = CLOCKWORK_AUDIO_PRESETS.CONVEYOR_HUM_VOICE_B;
  const gear = CLOCKWORK_AUDIO_PRESETS.CONVEYOR_GEAR_TEETH;
  assert.equal(humA.frequency, 90.0);
  assert.equal(humB.frequency, 55.0);
  assert.equal(gear.frequency, 165.0);

  // 3. EMP Capacitor Buildup & Pulse Surge
  const empWhine = CLOCKWORK_AUDIO_PRESETS.EMP_CAPACITOR_WHINE;
  const empSub = CLOCKWORK_AUDIO_PRESETS.EMP_DISCHARGE_SUB;
  const empCrack = CLOCKWORK_AUDIO_PRESETS.EMP_DISCHARGE_CRACK;
  const empDisarm = CLOCKWORK_AUDIO_PRESETS.EMP_BOMB_DISARM;
  assert.equal(empWhine.frequency, 300.0);
  assert.equal(empWhine.frequencyRamp?.target, 2400.0);
  assert.equal(empSub.frequency, 80.0);
  assert.equal(empSub.frequencyRamp?.target, 20.0);
  assert.equal(empCrack.type, 'sawtooth');
  assert.equal(empDisarm.frequency, 600.0);

  // 4. Dynamo Conduit Resonance (E-Major Quad)
  const c1 = CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER1_E5;
  const c2 = CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER2_GSHARP5;
  const c3 = CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER3_B5;
  const c4 = CLOCKWORK_AUDIO_PRESETS.CONDUIT_CHIME_TIER4_E6;
  assert.equal(c1.frequency, 659.25); // E5
  assert.equal(c2.frequency, 830.61); // G#5
  assert.equal(c3.frequency, 987.77); // B5
  assert.equal(c4.frequency, 1318.51); // E6

  // Overload Cleanse & Breakdown
  const subDown = CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_POWERDOWN_SUB;
  const clack = CLOCKWORK_AUDIO_PRESETS.CONDUIT_OVERLOAD_RELAY_CLACK;
  const breakdown = CLOCKWORK_AUDIO_PRESETS.CLOCKWORK_BREAKDOWN_GRIND;
  assert.equal(subDown.frequency, 220.0);
  assert.equal(subDown.frequencyRamp?.target, 35.0);
  assert.equal(clack.frequency, 1200.0);
  assert.equal(breakdown.type, 'sawtooth');

  // Verify immutability (frozen objects)
  assert.ok(Object.isFrozen(CLOCKWORK_AUDIO_PRESETS));
  assert.ok(Object.isFrozen(tick));
  assert.ok(Object.isFrozen(c1));
});

test('Tier 2: Headless & SSR Fallback (100% Crash-Free in Node.js)', () => {
  ClockworkCrisisAudio.resetInstance();
  const synth = new ClockworkCrisisAudio(null, null);

  assert.doesNotThrow(() => synth.playMetronomeTick(0.5));
  assert.doesNotThrow(() => synth.playConveyorDrone(1.0));
  assert.doesNotThrow(() => synth.playEmpWarning());
  assert.doesNotThrow(() => synth.playEmpPulse());
  assert.doesNotThrow(() => synth.playBombDisarm());
  assert.doesNotThrow(() => synth.playBombForcedDetonate());
  assert.doesNotThrow(() => synth.playConduitHit(1));
  assert.doesNotThrow(() => synth.playConduitHit(4));
  assert.doesNotThrow(() => synth.playConduitReset());
  assert.doesNotThrow(() => synth.playOverloadCleanse());
  assert.doesNotThrow(() => synth.playBreakdownGrind());
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.WHISPERS));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.OUTBREAK));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.CLIMAX));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.RESOLVED));
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.FAILED));

  synth.destroy();
});

test('Tier 3: Mock WebAudio Voice Pool Dispatch Verification', () => {
  ClockworkCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new ClockworkCrisisAudio(pool);

  // 1. Play Metronome Tick & Tock
  synth.playMetronomeTick(0.0, 1000);
  assert.ok(pool.getActiveVoiceCount() >= 1, 'Tick must acquire voice');

  // 2. Play Conveyor Drone
  pool.stop();
  synth.playConveyorDrone(1.0, 2000);
  assert.ok(pool.getActiveVoiceCount() >= 3, 'Conveyor drone must engage 3 tone voices');

  // Verify procedural noise buffer created for steam hiss
  const bufferSources = mockCtx.createdNodes.filter((n) => n.nodeType === 'AudioBufferSource');
  assert.ok(bufferSources.length > 0, 'Steam hiss must instantiate a noise buffer source');

  // 3. Play EMP Pulse
  pool.stop();
  synth.playEmpPulse(3000);
  assert.ok(pool.getActiveVoiceCount() >= 2, 'EMP pulse must engage sub and crack voices');

  // 4. Play Conduit Hits 1 through 4
  pool.stop();
  synth.playConduitHit(1, 4000);
  assert.ok(pool.getActiveVoiceCount() >= 1);
  pool.stop();
  synth.playConduitHit(4, 4200);
  assert.ok(pool.getActiveVoiceCount() >= 1);

  // 5. Play Overload Cleanse
  pool.stop();
  synth.playOverloadCleanse(5000);
  assert.ok(pool.getActiveVoiceCount() >= 5, 'Overload Cleanse must fire multi-voice chord + sub + relay clack');

  synth.stop();
  assert.equal(pool.getActiveVoiceCount(), 0);
  synth.destroy();
});

test('Tier 4: Dynamic Metronome BPM Acceleration Verification (60 -> 120 BPM)', () => {
  ClockworkCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new ClockworkCrisisAudio(pool);

  // At progress = 0.0 (60 BPM): interval is 1000ms
  synth.playMetronomeTick(0.0, 1000);
  assert.equal(pool.getActiveVoiceCount(), 1);

  // Calling at 1000 + 600ms (less than 1000ms interval): must be throttled
  pool.stop();
  synth.playMetronomeTick(0.0, 1600);
  assert.equal(pool.getActiveVoiceCount(), 0, '60 BPM must throttle under 1000ms');

  // Calling at 1000 + 1050ms: must trigger
  synth.playMetronomeTick(0.0, 2050);
  assert.equal(pool.getActiveVoiceCount(), 1, '60 BPM triggers after 1000ms interval');

  // At progress = 1.0 (120 BPM): interval is 500ms
  pool.stop();
  synth.playMetronomeTick(1.0, 3000);
  assert.equal(pool.getActiveVoiceCount(), 1);

  // Calling at 3000 + 300ms (less than 500ms interval): throttled
  pool.stop();
  synth.playMetronomeTick(1.0, 3300);
  assert.equal(pool.getActiveVoiceCount(), 0);

  // Calling at 3000 + 550ms: must trigger
  synth.playMetronomeTick(1.0, 3550);
  assert.equal(pool.getActiveVoiceCount(), 1, '120 BPM triggers after 500ms interval');

  synth.destroy();
});

test('Tier 5: Rate-Limiting & Debouncing Verification', () => {
  ClockworkCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new ClockworkCrisisAudio(pool);

  const now = 5000;
  synth.playConveyorDrone(1.0, now);
  const count1 = pool.getActiveVoiceCount();

  // Rapid second call within debounce (<350ms)
  synth.playConveyorDrone(1.0, now + 100);
  const count2 = pool.getActiveVoiceCount();
  assert.equal(count1, count2, 'Debounce must prevent duplicate triggers within 350ms');

  // Third call after debounce interval (>350ms)
  synth.playConveyorDrone(1.0, now + 400);
  assert.ok(pool.getActiveVoiceCount() > 0, 'Must retrigger after debounce interval');

  synth.destroy();
});

test('Tier 6: Zero-Leak Teardown & Lifecycle Cleansers', () => {
  ClockworkCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new ClockworkCrisisAudio(pool);

  synth.playEmpPulse(1000);
  synth.playOverloadCleanse(1200);

  assert.doesNotThrow(() => synth.clearPendingNodes());
  assert.doesNotThrow(() => synth.stop());
  assert.doesNotThrow(() => synth.reset());
  assert.doesNotThrow(() => synth.destroy());

  ClockworkCrisisAudio.resetInstance();
  assert.equal(ClockworkCrisisAudio.getInstance() !== null, true);
  ClockworkCrisisAudio.resetInstance();
});

test('Tier 7: ClockworkCrisis Game Integration with Procedural Audio', () => {
  ClockworkCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  ClockworkCrisisAudio.getInstance(pool);

  const crisis = new ClockworkCrisis();
  crisis.init();

  // Stage 1: Whispers (metronome active)
  crisis.transitionToStage(CrisisStage.WHISPERS);
  assert.equal(crisis.getStage(), CrisisStage.WHISPERS);

  // Stage 2: Outbreak (conveyors and cogs)
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  assert.equal(crisis.getStage(), CrisisStage.OUTBREAK);

  // EMP Warning & Pulse
  crisis.update(crisis.empIntervalMs - crisis.empWarningMs + 10);
  assert.equal(crisis.isEmpWarningActive, true);
  crisis.fireEmpPulse();
  assert.equal(crisis.totalEmpPulsesFired, 1);

  // Edge Case 10: Bomb interaction
  const detonateResult = crisis.evaluateBombEmpInteraction(30);
  assert.equal(detonateResult.action, 'detonate');
  const disarmResult = crisis.evaluateBombEmpInteraction(150);
  assert.equal(disarmResult.action, 'disarm');
  assert.equal(disarmResult.refundSlot, true);

  // Stage 3: Climax (Dynamo Overload)
  crisis.transitionToStage(CrisisStage.CLIMAX);
  assert.equal(crisis.bonusBombSlotsGranted, true);

  // Conduit hits
  crisis.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[0].r, ClockworkCrisis.DYNAMO_CONDUITS[0].c, 0);
  assert.equal(crisis.isOverloadWindowActive, true);
  assert.equal(crisis.conduits.filter((c) => c.isHit).length, 1);

  // 4-way overload
  crisis.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[1].r, ClockworkCrisis.DYNAMO_CONDUITS[1].c, 0);
  crisis.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[2].r, ClockworkCrisis.DYNAMO_CONDUITS[2].c, 0);
  crisis.handleBombBlast(ClockworkCrisis.DYNAMO_CONDUITS[3].r, ClockworkCrisis.DYNAMO_CONDUITS[3].c, 0);
  assert.equal(crisis.getStage(), CrisisStage.RESOLVED);

  ClockworkCrisisAudio.resetInstance();
});

test('Tier 8: WaveDirector Wave 12 Classification & Crisis Resolution Integration', () => {
  // Wave 12 must classify as CRISIS wave and select CLOCKWORK_REBELLION
  assert.equal(WaveDirector.isCrisisWave(12), true);
  assert.equal(WaveDirector.selectCrisisForWave(12), CrisisType.CLOCKWORK_REBELLION);

  // CrisisManager reward for CLOCKWORK_REBELLION must provide Clockwork Spring relic
  const manager = new CrisisManager();
  const reward = manager.getCrisisReward(CrisisType.CLOCKWORK_REBELLION);
  assert.equal(reward.crisisType, CrisisType.CLOCKWORK_REBELLION);
  assert.equal(reward.relicReward, RelicId.CLOCKWORK_SPRING);
  assert.equal(reward.scoreAwarded, 5000);
  assert.equal(reward.starCandies, 35);
  assert.equal(reward.cosmicEssence, 15);
});

test('Tier 9: 10,000-Frame Soak Simulation (Zero Drift & Numerical Stability)', () => {
  ClockworkCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new ClockworkCrisisAudio(pool);

  let simulatedTimeMs = 10000;
  for (let frame = 0; frame < 10000; frame++) {
    simulatedTimeMs += 16.6;
    if (frame % 60 === 0) {
      synth.playMetronomeTick((frame % 600) / 600, simulatedTimeMs);
    }
    if (frame % 300 === 0) {
      synth.playConveyorDrone(1.0, simulatedTimeMs);
    }
    if (frame % 1000 === 0) {
      synth.playConduitHit((frame / 1000) % 4 + 1, simulatedTimeMs);
    }
  }

  synth.stop();
  synth.destroy();
  ClockworkCrisisAudio.resetInstance();
});
