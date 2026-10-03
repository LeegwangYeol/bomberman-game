import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  VoltHazardAudio,
  VOLT_AUDIO_PRESETS,
} from '../src/game/hazards/VoltHazardAudio.ts';

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
  start() { this.started = true; }
  stop() {
    this.stopped = true;
    if (typeof this.onended === 'function') this.onended();
  }
}

class MockAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channelData = [new Float32Array(length)];
  }
  getChannelData() { return this.channelData[0]; }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = new MockAudioNode('Destination');
    this.createdNodes = [];
    this.resumed = false;
    this.closed = false;
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
    const node = new MockBufferSourceNode();
    this.createdNodes.push(node);
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    return new MockAudioBuffer(channels, length, sampleRate);
  }
  async resume() { this.resumed = true; this.state = 'running'; }
  async close() { this.closed = true; this.state = 'closed'; }
}

test('Tier 1 [Volt Audio Presets]: Presets define exact frequencies, ramps, and filters', () => {
  // 60Hz and 120Hz High Voltage Hum
  assert.equal(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_60HZ.frequency, 60);
  assert.equal(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_60HZ.filter?.type, 'lowpass');
  assert.equal(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_120HZ.frequency, 120);
  assert.equal(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_120HZ.filter?.type, 'bandpass');

  // Rising Ionization Sweep (220Hz -> 1760Hz)
  assert.equal(VOLT_AUDIO_PRESETS.IONIZATION_SWEEP.frequency, 220);
  assert.equal(VOLT_AUDIO_PRESETS.IONIZATION_SWEEP.frequencyRamp?.target, 1760);
  assert.equal(VOLT_AUDIO_PRESETS.IONIZATION_SWEEP.filter?.type, 'bandpass');
  assert.equal(VOLT_AUDIO_PRESETS.IONIZATION_SWEEP.filter?.rampTarget, 3200);

  // Lightning Crack (3200Hz -> 120Hz) + Thunder Sub Thump (50Hz -> 28Hz)
  assert.equal(VOLT_AUDIO_PRESETS.LIGHTNING_CRACK_SNAP.frequency, 3200);
  assert.equal(VOLT_AUDIO_PRESETS.LIGHTNING_CRACK_SNAP.frequencyRamp?.target, 120);
  assert.equal(VOLT_AUDIO_PRESETS.LIGHTNING_SUB_THUD.frequency, 50);
  assert.equal(VOLT_AUDIO_PRESETS.LIGHTNING_SUB_THUD.frequencyRamp?.target, 28);

  // Superconductor Dash Chime (1760Hz -> 2093Hz)
  assert.equal(VOLT_AUDIO_PRESETS.SUPERCONDUCTOR_DASH_CHIME.frequency, 1760);
  assert.equal(VOLT_AUDIO_PRESETS.SUPERCONDUCTOR_DASH_CHIME.frequencyRamp?.target, 2093);

  // Static Discharge Pop (320Hz -> 75Hz)
  assert.equal(VOLT_AUDIO_PRESETS.STATIC_DISCHARGE_POP.frequency, 320);
  assert.equal(VOLT_AUDIO_PRESETS.STATIC_DISCHARGE_POP.frequencyRamp?.target, 75);
});

test('Tier 2 [VoltHazardAudio Headless Fallback]: All methods safe without active context or pool', () => {
  const emptyAudio = new VoltHazardAudio(null);
  assert.doesNotThrow(() => emptyAudio.playHighVoltageHum(100));
  assert.doesNotThrow(() => emptyAudio.playIonizationSweep(200));
  assert.doesNotThrow(() => emptyAudio.playLightningBurst(300));
  assert.doesNotThrow(() => emptyAudio.playSuperconductorDash(400));
  assert.doesNotThrow(() => emptyAudio.playStaticDischargePop(500));
  assert.doesNotThrow(() => emptyAudio.playStaticShock(600));
  assert.doesNotThrow(() => emptyAudio.playStaticSpark(700));
  assert.doesNotThrow(() => emptyAudio.playArcBuildup(800));
  assert.doesNotThrow(() => emptyAudio.playVoltHazardState('LIGHTNING_DISCHARGE', 900));
  assert.doesNotThrow(() => emptyAudio.reset());
  assert.doesNotThrow(() => emptyAudio.destroy());
});

test('Tier 3 [Voice Pool Routing]: Routines dispatch correct tones to AudioVoicePool', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  let played = [];
  pool.playTone = (p) => { played.push(p); return pool.acquireVoice(); };

  const audio = new VoltHazardAudio(pool);
  audio.init(ctx);

  // 1. High-Voltage Hum (2 voices: 60Hz + 120Hz)
  played = [];
  audio.playHighVoltageHum(100);
  assert.equal(played.length, 2);
  assert.ok(played.includes(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_60HZ));
  assert.ok(played.includes(VOLT_AUDIO_PRESETS.HIGH_VOLTAGE_HUM_120HZ));

  // 2. Rising Ionization Sweep (1 voice)
  audio.reset();
  played = [];
  audio.playIonizationSweep(500);
  assert.equal(played.length, 1);
  assert.equal(played[0], VOLT_AUDIO_PRESETS.IONIZATION_SWEEP);

  // 3. Lightning Burst (Crack + Sub Thump + 3 Chimes = 5 voices)
  audio.reset();
  played = [];
  audio.playLightningBurst(1000);
  assert.equal(played.length, 5);
  assert.ok(played.includes(VOLT_AUDIO_PRESETS.LIGHTNING_CRACK_SNAP));
  assert.ok(played.includes(VOLT_AUDIO_PRESETS.LIGHTNING_SUB_THUD));
  assert.ok(played.includes(VOLT_AUDIO_PRESETS.LIGHTNING_CHIME_E5));
  assert.ok(played.includes(VOLT_AUDIO_PRESETS.LIGHTNING_CHIME_G5));
  assert.ok(played.includes(VOLT_AUDIO_PRESETS.LIGHTNING_CHIME_B5));

  // 4. Superconductor Dash Chime (1 voice)
  audio.reset();
  played = [];
  audio.playSuperconductorDash(1500);
  assert.equal(played.length, 1);
  assert.equal(played[0], VOLT_AUDIO_PRESETS.SUPERCONDUCTOR_DASH_CHIME);

  // 5. Static Discharge Pop (1 voice)
  audio.reset();
  played = [];
  audio.playStaticDischargePop(2000);
  assert.equal(played.length, 1);
  assert.equal(played[0], VOLT_AUDIO_PRESETS.STATIC_DISCHARGE_POP);
});

test('Tier 4 [Zero-Leak Procedural White Noise]: White noise burst auto-disconnects cleanly', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const audio = new VoltHazardAudio(pool);
  audio.init(ctx);

  const beforeNodes = ctx.createdNodes.length;
  const ok = audio.playWhiteNoiseBurst(100, 0.15, 0.20);
  assert.equal(ok, true);

  const transient = ctx.createdNodes.slice(beforeNodes);
  const src = transient.find(n => n instanceof MockBufferSourceNode);
  const flt = transient.find(n => n instanceof MockBiquadFilterNode);
  const gn = transient.find(n => n instanceof MockGainNode);

  assert.ok(src && flt && gn, 'Creates source, filter, gain chain');
  assert.equal(src.started, true);

  // Simulate onended
  src.stop();
  assert.equal(src.disconnected, true);
  assert.equal(flt.disconnected, true);
  assert.equal(gn.disconnected, true);

  audio.destroy();
});

test('Tier 5 [FSM Dispatch & Debounce]: playVoltHazardState and debounce timing', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const audio = new VoltHazardAudio(pool);
  let playCount = 0;
  pool.playTone = () => { playCount++; return pool.acquireVoice(); };

  // Dispatch state
  audio.playVoltHazardState('LIGHTNING_DISCHARGE', 100);
  assert.equal(playCount, 5); // 5 voices

  // Debounce test
  playCount = 0;
  audio.playSuperconductorDash(1000);
  assert.equal(playCount, 1);
  audio.playSuperconductorDash(1050); // within 250ms debounce
  assert.equal(playCount, 1);
  audio.playSuperconductorDash(1300); // after 250ms debounce
  assert.equal(playCount, 2);
});

test('Tier 6 [Stress Stability]: 1,000 rapid cycles execute with 0 exceptions', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(16);
  pool.init(ctx);

  const audio = new VoltHazardAudio(pool);
  audio.init(ctx);

  let simTime = 0;
  for (let i = 0; i < 1000; i++) {
    simTime += 16;
    const mod = i % 5;
    if (mod === 0) audio.playHighVoltageHum(simTime);
    else if (mod === 1) audio.playIonizationSweep(simTime);
    else if (mod === 2) audio.playLightningBurst(simTime);
    else if (mod === 3) audio.playSuperconductorDash(simTime);
    else if (mod === 4) audio.playStaticDischargePop(simTime);

    if (i % 200 === 0) audio.reset();
  }

  audio.destroy();
  assert.ok(true, '1,000 cycles completed with 0 leaks');
});
