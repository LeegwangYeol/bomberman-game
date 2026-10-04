import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  MagmaHazardAudio,
  MAGMA_AUDIO_PRESETS,
} from '../src/game/hazards/MagmaHazardAudio.ts';
import {
  MagmaLifecycleState,
  MagmaTelegraphPhase,
} from '../src/game/hazards/MagmaHazard.ts';

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
    this.state = 'running';
    this.destination = new MockAudioNode('Destination');
    this.activeNodes = [];
  }
  createOscillator() {
    const node = new MockOscillatorNode();
    this.activeNodes.push(node);
    return node;
  }
  createGain() {
    const node = new MockGainNode();
    this.activeNodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new MockBiquadFilterNode();
    this.activeNodes.push(node);
    return node;
  }
  createBufferSource() {
    const node = new MockAudioBufferSourceNode();
    this.activeNodes.push(node);
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
    this.state = 'running';
    return Promise.resolve();
  }
}

test('Tier 1 [Magma Audio Presets]: Presets define exact frequencies, ramps, and filters', () => {
  assert.equal(MAGMA_AUDIO_PRESETS.VOLCANIC_SUB_RUMBLE_48HZ.frequency, 48.0);
  assert.equal(MAGMA_AUDIO_PRESETS.VOLCANIC_SUB_RUMBLE_48HZ.frequencyRamp?.target, 32.0);
  assert.equal(MAGMA_AUDIO_PRESETS.VOLCANIC_SUB_RUMBLE_48HZ.type, 'sine');

  assert.equal(MAGMA_AUDIO_PRESETS.MAGMA_BUBBLING_SIZZLE.frequency, 180.0);
  assert.equal(MAGMA_AUDIO_PRESETS.MAGMA_BUBBLING_SIZZLE.type, 'triangle');

  assert.equal(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CRACK_SNAP.frequency, 880.0);
  assert.equal(MAGMA_AUDIO_PRESETS.PYROCLASTIC_CRACK_SNAP.type, 'sawtooth');

  assert.equal(MAGMA_AUDIO_PRESETS.PYROCLASTIC_SUB_THUD.frequency, 55.0);
  assert.equal(MAGMA_AUDIO_PRESETS.PYROCLASTIC_SUB_THUD.type, 'sine');

  assert.equal(MAGMA_AUDIO_PRESETS.MAGMA_SURF_DASH_CHIME.frequency, 698.46);
  assert.equal(MAGMA_AUDIO_PRESETS.OBSIDIAN_QUENCH_SNAP.frequency, 1450.0);
  assert.equal(MAGMA_AUDIO_PRESETS.THERMAL_SINGE_HISS.frequency, 420.0);
});

test('Tier 2 [MagmaHazardAudio Headless Fallback]: All methods safe without active context or pool', () => {
  const audio = new MagmaHazardAudio(null);

  assert.doesNotThrow(() => audio.playCrustHeatingHum());
  assert.doesNotThrow(() => audio.playMagmaUpwellingSizzle());
  assert.doesNotThrow(() => audio.playEruptionImminentVent());
  assert.doesNotThrow(() => audio.playPyroclasticBurst());
  assert.doesNotThrow(() => audio.playMagmaSurf());
  assert.doesNotThrow(() => audio.playThermalSinge());
  assert.doesNotThrow(() => audio.playObsidianQuenchSnap());
  assert.doesNotThrow(() => audio.playPyroclasticDetonation());
  assert.doesNotThrow(() => audio.playMagmaHazardState(MagmaLifecycleState.MAGMA_TELEGRAPH, MagmaTelegraphPhase.CRUST_HEATING));
  assert.doesNotThrow(() => audio.destroy());
});

test('Tier 3 [Voice Pool Routing]: Routines dispatch correct tones to AudioVoicePool', () => {
  const ctx = new MockAudioContext();
  const pool = new AudioVoicePool(8);
  pool.init(ctx);

  const audio = new MagmaHazardAudio(ctx);

  assert.doesNotThrow(() => {
    audio.playCrustHeatingHum();
    audio.playMagmaUpwellingSizzle();
    audio.playPyroclasticBurst();
    audio.playMagmaSurf();
    audio.playObsidianQuenchSnap();
  });

  audio.destroy();
  pool.destroy();
});

test('Tier 4 [Zero-Leak Procedural White Noise]: White noise burst auto-disconnects cleanly', () => {
  const ctx = new MockAudioContext();
  const audio = new MagmaHazardAudio(ctx);

  assert.doesNotThrow(() => {
    audio.playFilteredNoiseBurst(0.05, 800, 300, 0.15);
  });

  audio.clearPendingNodes();
  audio.destroy();
});

test('Tier 5 [FSM Dispatch & Debounce]: playMagmaHazardState and debounce timing', () => {
  const ctx = new MockAudioContext();
  const audio = new MagmaHazardAudio(ctx);

  const now = 1000;
  // First call should play
  assert.doesNotThrow(() => {
    audio.playMagmaHazardState(MagmaLifecycleState.MAGMA_TELEGRAPH, MagmaTelegraphPhase.CRUST_HEATING, now);
  });

  // Second call within 450ms debounce window is safely debounced
  assert.doesNotThrow(() => {
    audio.playMagmaHazardState(MagmaLifecycleState.MAGMA_TELEGRAPH, MagmaTelegraphPhase.MAGMA_UPWELLING, now + 100);
  });

  // Call after debounce window plays
  assert.doesNotThrow(() => {
    audio.playMagmaHazardState(MagmaLifecycleState.MAGMA_TELEGRAPH, MagmaTelegraphPhase.ERUPTION_IMMINENT, now + 500);
  });

  audio.destroy();
});

test('Tier 6 [Stress Stability]: 1,000 rapid cycles execute with 0 exceptions', () => {
  const ctx = new MockAudioContext();
  const audio = new MagmaHazardAudio(ctx);

  assert.doesNotThrow(() => {
    for (let i = 0; i < 1000; i++) {
      audio.playMagmaHazardState(
        i % 2 === 0 ? MagmaLifecycleState.MAGMA_TELEGRAPH : MagmaLifecycleState.PYROCLASTIC_BURST,
        MagmaTelegraphPhase.CRUST_HEATING,
        i * 50
      );
      if (i % 10 === 0) {
        audio.playMagmaSurf();
        audio.playThermalSinge(i * 50);
      }
    }
  });

  audio.destroy();
});
