import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  ChronoHazardAudio,
  CHRONO_AUDIO_PRESETS,
} from '../src/game/hazards/ChronoHazardAudio.ts';
import {
  ChronoLifecycleState,
  ChronoTelegraphPhase,
} from '../src/game/hazards/ChronoHazard.ts';

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

test('ChronoHazardAudio [Presets Validation]: All procedural sound presets contain valid physical parameters', () => {
  const presets = Object.values(CHRONO_AUDIO_PRESETS);
  assert.ok(presets.length >= 8, 'Must define at least 8 core chrono audio presets');

  for (const p of presets) {
    assert.ok(['sine', 'square', 'sawtooth', 'triangle'].includes(p.type));
    assert.ok(p.frequency > 0 && p.frequency < 20000, `Frequency ${p.frequency} within audible band`);
    assert.ok(p.gain > 0 && p.gain <= 1.0, `Gain ${p.gain} <= 1.0 to prevent clipping`);
    assert.ok(p.duration > 0, 'Duration must be positive');
  }
});

test('ChronoHazardAudio [Procedural Synthesis Execution]: Synthesizes sound events without exception', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(mockCtx, 8);
  const audio = ChronoHazardAudio.getInstance();
  audio.setVoicePool(pool);

  assert.doesNotThrow(() => {
    audio.playTachyonSubDrone(1000);
    audio.playClockworkTick(1000);
    audio.playTemporalRipple();
    audio.playTachyonWarpSweep();
    audio.playTimeCollapseImpact();
    audio.playChronoSurgeDash();
    audio.playChronoSurge();
    audio.playTimelineStabilized();
    audio.playTimelineStabilizeSnap();
    audio.playTemporalDilationDebuff();
    audio.playTemporalDilation();
    audio.playChronoSlipstreamKick();
    audio.playChronoBombShift();
  });

  audio.destroy();
});

test('ChronoHazardAudio [State-Driven Audio]: Triggers appropriate sounds matching FSM state changes', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(mockCtx, 8);
  const audio = ChronoHazardAudio.getInstance();
  audio.setVoicePool(pool);

  assert.doesNotThrow(() => {
    audio.playChronoHazardState(
      ChronoLifecycleState.CHRONO_DISTORTION,
      ChronoTelegraphPhase.TEMPORAL_RIPPLE
    );

    audio.playChronoHazardState(
      ChronoLifecycleState.CHRONO_DISTORTION,
      ChronoTelegraphPhase.TACHYON_WARP
    );

    audio.playChronoHazardState(
      ChronoLifecycleState.CHRONO_DISTORTION,
      ChronoTelegraphPhase.EVENT_HORIZON_IMMINENT
    );

    audio.playChronoHazardState(
      ChronoLifecycleState.TIME_COLLAPSE,
      ChronoTelegraphPhase.NONE
    );

    audio.playChronoHazardState(
      ChronoLifecycleState.TACHYON_RECOVERY,
      ChronoTelegraphPhase.NONE
    );
  });

  audio.destroy();
});

test('ChronoHazardAudio [Headless & SSR Fallback]: Survives safely when window or AudioContext is null', () => {
  const audio = ChronoHazardAudio.getInstance();
  audio.setVoicePool(null);

  assert.doesNotThrow(() => {
    audio.playTachyonSubDrone(1000);
    audio.playClockworkTick(1000);
    audio.playTemporalRipple();
    audio.playTachyonWarpSweep();
    audio.playTimeCollapseImpact();
    audio.playChronoSurgeDash();
    audio.playTimelineStabilized();
    audio.playTemporalDilation();
    audio.playChronoSlipstreamKick();
    audio.destroy();
  });
});
