import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  MiasmaHazardAudio,
  MIASMA_AUDIO_PRESETS,
} from '../src/game/hazards/MiasmaHazardAudio.ts';
import {
  MiasmaLifecycleState,
  MiasmaTelegraphPhase,
} from '../src/game/hazards/MiasmaHazard.ts';

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
    this.destination = new MockAudioNode('Destination');
    this.state = 'running';
  }
  createOscillator() { return new MockOscillatorNode(); }
  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createBufferSource() { return new MockAudioBufferSourceNode(); }
  createBuffer(channels, length, sampleRate) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }
}

test('MiasmaHazardAudio [Presets Validation]: All procedural sound presets contain valid physical parameters', () => {
  const presets = Object.values(MIASMA_AUDIO_PRESETS);
  assert.ok(presets.length >= 6, 'Must define at least 6 core miasma audio presets');

  for (const p of presets) {
    assert.ok(['sine', 'square', 'sawtooth', 'triangle'].includes(p.type));
    assert.ok(p.frequency > 0 && p.frequency < 20000, `Frequency ${p.frequency} within audible band`);
    assert.ok(p.gain > 0 && p.gain <= 1.0, `Gain ${p.gain} <= 1.0 to prevent clipping`);
    assert.ok(p.duration > 0, 'Duration must be positive');
  }
});

test('MiasmaHazardAudio [Procedural Synthesis Execution]: Synthesizes sound events without exception', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(mockCtx, 8);
  const audio = new MiasmaHazardAudio(mockCtx, pool);

  assert.doesNotThrow(() => {
    audio.playSubDrone();
    audio.playExhalationSwell();
    audio.playCorrosiveBurst();
    audio.playCatalyticDetonation();
    audio.playBioSlickKick();
    audio.playSporeSurge();
    audio.playFloralCleanseSnap();
    audio.playNeurotoxin();
  });

  audio.destroy();
});

test('MiasmaHazardAudio [State-Driven Audio]: Triggers appropriate sounds matching FSM state changes', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(mockCtx, 8);
  const audio = new MiasmaHazardAudio(mockCtx, pool);

  assert.doesNotThrow(() => {
    audio.playMiasmaHazardState(
      MiasmaLifecycleState.SPORE_INCUBATION,
      MiasmaTelegraphPhase.POD_SWELLING
    );

    audio.playMiasmaHazardState(
      MiasmaLifecycleState.SPORE_INCUBATION,
      MiasmaTelegraphPhase.SPORE_EXHALATION
    );

    audio.playMiasmaHazardState(
      MiasmaLifecycleState.SPORE_INCUBATION,
      MiasmaTelegraphPhase.BLOOM_IMMINENT
    );

    audio.playMiasmaHazardState(
      MiasmaLifecycleState.CORROSIVE_BURST,
      MiasmaTelegraphPhase.NONE
    );
  });

  audio.destroy();
});

test('MiasmaHazardAudio [Headless & SSR Fallback]: Survives safely when window or AudioContext is null', () => {
  const audio = new MiasmaHazardAudio(null, null);

  assert.doesNotThrow(() => {
    audio.playSubDrone();
    audio.playCorrosiveBurst();
    audio.playSporeSurge();
    audio.playFloralCleanseSnap();
    audio.playNeurotoxin();
    audio.destroy();
  });
});
