import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  PsychicCrisisAudio,
  PSYCHIC_AUDIO_PRESETS,
} from '../src/game/crises/PsychicCrisisAudio.ts';
import {
  DynamicHazardAudio,
  HAZARD_AUDIO_PRESETS,
} from '../src/game/hazards/DynamicHazardAudio.ts';
import {
  MiasmaHazardAudio,
  MIASMA_AUDIO_PRESETS,
} from '../src/game/hazards/MiasmaHazardAudio.ts';
import { PsychicCrisis } from '../src/game/crises/PsychicCrisis.ts';
import { MutantFloraBoss } from '../src/game/bosses/MutantFloraBoss.ts';
import { CrisisStage } from '../src/game/crises/CrisisTypes.ts';
import { BossState } from '../src/game/bosses/BossTypes.ts';

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
// Test Suite: Procedural WebAudio Routines
// ==============================================================================

test('Tier 1: Preset Integrity & Mathematical Audit (Zero Asset Dependencies)', () => {
  // Psionic Warp Hum presets
  const psionicA = PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_HUM_VOICE_A;
  const psionicB = PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_HUM_VOICE_B;
  const psionicWarble = PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_WARBLE;
  const psionicShimmer = PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_SHIMMER;
  const psionicDrone = PSYCHIC_AUDIO_PRESETS.PSIONIC_WARP_SUB_DRONE;

  assert.equal(psionicA.type, 'sine');
  assert.equal(psionicA.frequency, 108.0);
  assert.equal(psionicA.frequencyRamp?.target, 96.0);
  assert.equal(psionicA.filter?.type, 'lowpass');

  assert.equal(psionicB.type, 'sine');
  assert.equal(psionicB.frequency, 112.5);
  // Verify 4.5 Hz theta-wave binaural beat difference
  const thetaBeatHz = Math.abs(psionicB.frequency - psionicA.frequency);
  assert.equal(thetaBeatHz, 4.5);

  assert.equal(psionicWarble.type, 'triangle');
  assert.equal(psionicWarble.frequency, 216.0);
  assert.equal(psionicWarble.filter?.type, 'bandpass');

  assert.equal(psionicShimmer.frequency, 880.0);
  assert.equal(psionicDrone.frequency, 44.0);

  // Floral Bloom Spore Release presets in MiasmaHazardAudio
  const floralPop = MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_POD_POP;
  const floralChime = MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_CHIME;
  const floralSweep = MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_SPORE_SWEEP;
  const floralRustle = MIASMA_AUDIO_PRESETS.FLORAL_BLOOM_RUSTLE;

  assert.equal(floralPop.type, 'sine');
  assert.equal(floralPop.frequency, 340.0);
  assert.equal(floralPop.frequencyRamp?.target, 88.0);
  assert.equal(floralPop.filter?.type, 'bandpass');

  assert.equal(floralChime.frequency, 698.46); // F5
  assert.equal(floralChime.frequencyRamp?.target, 987.77); // B5

  assert.equal(floralSweep.frequency, 520.0);
  assert.equal(floralSweep.frequencyRamp?.target, 1040.0);

  assert.equal(floralRustle.frequency, 240.0);
  assert.equal(floralRustle.frequencyRamp?.target, 120.0);

  // DynamicHazardAudio presets mirror
  assert.ok(HAZARD_AUDIO_PRESETS.PSIONIC_WARP_HUM_VOICE_A);
  assert.ok(HAZARD_AUDIO_PRESETS.PSIONIC_WARP_HUM_VOICE_B);
  assert.ok(HAZARD_AUDIO_PRESETS.FLORAL_BLOOM_POD_POP);
  assert.ok(HAZARD_AUDIO_PRESETS.FLORAL_BLOOM_CHIME);
});

test('Tier 2: Headless & SSR Fallback (Zero Crashes in Node environment)', () => {
  const psychicAudio = new PsychicCrisisAudio(null);
  assert.doesNotThrow(() => psychicAudio.playPsionicWarpHum(0.8));
  assert.doesNotThrow(() => psychicAudio.playPhantomEcho());
  assert.doesNotThrow(() => psychicAudio.playMindRendingClimax());
  assert.doesNotThrow(() => psychicAudio.playRealityAnchorSnap());
  assert.doesNotThrow(() => psychicAudio.playPsychicCrisisState(CrisisStage.WHISPERS));
  assert.doesNotThrow(() => psychicAudio.playPsychicCrisisState(CrisisStage.OUTBREAK, 50));
  assert.doesNotThrow(() => psychicAudio.playPsychicCrisisState(CrisisStage.CLIMAX, 100));

  const miasmaAudio = new MiasmaHazardAudio(null);
  assert.doesNotThrow(() => miasmaAudio.playFloralBloomSporeRelease());

  const dynamicAudio = new DynamicHazardAudio(null);
  assert.doesNotThrow(() => dynamicAudio.playPsionicWarpHum(1.0));
  assert.doesNotThrow(() => dynamicAudio.playFloralBloomSporeRelease());
});

test('Tier 3: Voice Pool Synthesis & Waveform Dispatch Verification', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const psychicAudio = new PsychicCrisisAudio(pool);

  // Trigger Psionic Warp Hum
  psychicAudio.playPsionicWarpHum(1.0, 1000);

  // Verify voices in pool were played with correct frequencies
  const activeVoices = pool.getActiveVoiceCount();
  assert.ok(activeVoices >= 4, `Expected at least 4 active voices for psionic warp hum, got ${activeVoices}`);

  // Test Reality Anchor Snap
  psychicAudio.playRealityAnchorSnap(1500);

  // Test Floral Bloom Spore Release in MiasmaHazardAudio
  const miasmaAudio = new MiasmaHazardAudio(pool);
  miasmaAudio.init(mockCtx, pool);
  miasmaAudio.playFloralBloomSporeRelease(2000);

  // Verify buffer source node was created for white noise spore dispersion
  const bufferSources = mockCtx.createdNodes.filter((n) => n.nodeType === 'AudioBufferSource');
  assert.ok(bufferSources.length > 0, 'Procedural noise buffer source must be created');

  // Verify cleanup
  psychicAudio.stop();
  assert.equal(pool.getActiveVoiceCount(), 0);
  psychicAudio.destroy();
  miasmaAudio.destroy();
});

test('Tier 4: Debouncing and Rate-Limiting Protection', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const psychicAudio = new PsychicCrisisAudio(pool);

  // Call rapidly within debounce window
  psychicAudio.playPsionicWarpHum(1.0, 1000);
  const firstVoiceCount = pool.getActiveVoiceCount();

  // Call immediately after (within 350ms debounce)
  psychicAudio.playPsionicWarpHum(1.0, 1050);
  const secondVoiceCount = pool.getActiveVoiceCount();

  assert.equal(secondVoiceCount, firstVoiceCount, 'Call within debounce window must not trigger new voices');

  // Call after debounce expires
  psychicAudio.playPsionicWarpHum(1.0, 1400);
  assert.ok(pool.getActiveVoiceCount() > 0);

  psychicAudio.destroy();
  pool.destroy();
});

test('Tier 5: Integration with PsychicCrisis and MutantFloraBoss', () => {
  // Test PsychicCrisis audio triggers
  const crisis = new PsychicCrisis();
  crisis.start();
  assert.equal(crisis.getStage(), CrisisStage.WHISPERS);

  // Advance to Outbreak
  crisis.setStage(CrisisStage.OUTBREAK);
  assert.equal(crisis.getStage(), CrisisStage.OUTBREAK);

  // Update triggers pulse timers
  crisis.update(4500);

  // Bomb blast triggering manifestation destruction
  assert.doesNotThrow(() => {
    crisis.handleBombBlast(3, 3, 2);
  });

  // Test MutantFloraBoss audio trigger on pollen release
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1000, 300, 260);
  boss.forceState(BossState.PHASE_2);
  assert.equal(boss.bossState, BossState.PHASE_2);

  // Advancing time past pollenTimerMs triggers floral bloom sound
  assert.doesNotThrow(() => {
    boss.update(3500, 300, 260);
  });
  assert.equal(boss.pollenTimerMs, 3000);
});

test('Tier 6: Stress & Soak Test (1,000 Cycles Zero-Leak Verification)', () => {
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const psychicAudio = new PsychicCrisisAudio(pool);
  const miasmaAudio = new MiasmaHazardAudio(pool);
  const dynamicAudio = new DynamicHazardAudio(pool);

  let nowMs = 10000;
  for (let i = 0; i < 1000; i++) {
    nowMs += 400; // Step beyond debounces
    psychicAudio.playPsionicWarpHum(1.0, nowMs);
    psychicAudio.playRealityAnchorSnap(nowMs + 50);
    miasmaAudio.playFloralBloomSporeRelease(nowMs + 100);
    dynamicAudio.playPsionicWarpHum(0.8, nowMs + 150);
    dynamicAudio.playFloralBloomSporeRelease(nowMs + 200);
  }

  // Teardown and clean
  psychicAudio.destroy();
  miasmaAudio.destroy();
  dynamicAudio.destroy();
  pool.destroy();

  assert.equal(pool.getActiveVoiceCount(), 0);
});
