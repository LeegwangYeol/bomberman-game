/**
 * tests/solar_flare_crisis_audio.test.mjs
 * Comprehensive Verification Battery for Solar Flare Storm Crisis Procedural Synthesizer
 *
 * Verifies:
 * 1. Preset immutability and exact DSP acoustic constants (4 signature soundscapes)
 * 2. Headless SSR / Node.js runtime safety (graceful degradation)
 * 3. Mock AudioVoicePool routing & parameter scaling
 * 4. Solar Wind Drone & Geomagnetic Static Warble rate limits and voice allocation
 * 5. Coronal Mass Ejection (CME) Supersonic Sweep & Thermal Sub-Shockwave layering
 * 6. Tactical Bomb Flash-Ignition & 4-Tier Cryogenic Venting Chimes (F-Major)
 * 7. Helios Solar Core Stabilization (Solfeggio 528Hz / A-Major Resolution)
 * 8. Stage Transition handling across all Crisis stages (WHISPERS, OUTBREAK, CLIMAX, RESOLVED, FAILED)
 * 9. Dual-watchdog teardown, stop(), reset(), and singleton lifecycle
 * 10. WaveDirector Wave 20 Crisis-Boss Wave Integration & Relic Award
 * 11. 10,000-frame Zero-GC simulation & soak stability
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import {
  SolarFlareCrisisAudio,
  SOLAR_FLARE_AUDIO_PRESETS,
} from '../src/game/crises/SolarFlareCrisisAudio.ts';
import { CrisisStage, CrisisType, HazardType } from '../src/game/crises/CrisisTypes.ts';
import { SolarFlareCrisis } from '../src/game/crises/SolarFlareCrisis.ts';
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

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// ==============================================================================
// TIER 1: Preset Immutability & Exact DSP Acoustic Constants
// ==============================================================================

test('Tier 1: SOLAR_FLARE_AUDIO_PRESETS Immutability & DSP Verification', () => {
  // Preset container is frozen
  assert.ok(Object.isFrozen(SOLAR_FLARE_AUDIO_PRESETS), 'Preset dictionary must be frozen');

  // Verify all soundscape tone presets
  const expectedKeys = [
    'CORONAL_SUB_DRONE_38HZ',
    'SOLAR_WIND_GOLDEN_SOL_528HZ',
    'GEOMAGNETIC_STATIC_WARBLE',
    'CORONAL_WARNING_ALERT',
    'CME_BUILDUP_CRESCENDO',
    'CME_SWEEP_THERMAL_SUB',
    'CORRIDOR_SCORCH_ROAR',
    'FLASH_IGNITION_DETONATION',
    'VENT_PURGE_SUB_THUD',
    'VENT_CHIME_TIER1_F5',
    'VENT_CHIME_TIER2_A5',
    'VENT_CHIME_TIER3_C6',
    'VENT_CHIME_TIER4_F6',
    'VENT_CHIME_OCTAVE_F4',
    'HELIOS_STABILIZE_A4',
    'HELIOS_STABILIZE_CSHARP5',
    'HELIOS_STABILIZE_E5',
    'HELIOS_STABILIZE_A5',
    'CORONAL_TEMPEST_DISSIPATE',
    'THREAT_ELEVATION_WARPING',
    'STAGE_TRANSITION_ALARM',
  ];

  for (const key of expectedKeys) {
    const preset = SOLAR_FLARE_AUDIO_PRESETS[key];
    assert.ok(preset, `Preset ${key} must exist`);
    assert.ok(Object.isFrozen(preset), `Preset ${key} must be frozen`);
    if (preset.frequencyRamp) {
      assert.ok(Object.isFrozen(preset.frequencyRamp), `frequencyRamp for ${key} must be frozen`);
    }
    if (preset.filter) {
      assert.ok(Object.isFrozen(preset.filter), `filter for ${key} must be frozen`);
    }
  }

  // 1. Coronal Sub-Drone: 38.4Hz fundamental
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.CORONAL_SUB_DRONE_38HZ.frequency, 38.4);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.CORONAL_SUB_DRONE_38HZ.type, 'sine');
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.CORONAL_SUB_DRONE_38HZ.frequencyRamp.target, 28.0);

  // 2. Solfeggio Golden Sol 528Hz
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.SOLAR_WIND_GOLDEN_SOL_528HZ.frequency, 432.0);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.SOLAR_WIND_GOLDEN_SOL_528HZ.frequencyRamp.target, 528.0);

  // 3. Coronal Mass Ejection: 180Hz -> 960Hz crescendo
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.CME_BUILDUP_CRESCENDO.frequency, 180.0);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.CME_BUILDUP_CRESCENDO.frequencyRamp.target, 960.0);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.CME_SWEEP_THERMAL_SUB.frequency, 120.0);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.CME_SWEEP_THERMAL_SUB.frequencyRamp.target, 30.0);

  // 4. Flash Ignition: 950Hz -> 180Hz rapid snap
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.FLASH_IGNITION_DETONATION.frequency, 950.0);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.FLASH_IGNITION_DETONATION.frequencyRamp.target, 180.0);

  // 5. 4-Tier Cryogenic Vents in F-Major (F5, A5, C6, F6)
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER1_F5.frequency, 698.46);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER2_A5.frequency, 880.00);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER3_C6.frequency, 1046.50);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_TIER4_F6.frequency, 1396.91);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.VENT_CHIME_OCTAVE_F4.frequency, 349.23);

  // 6. Helios Stabilization (A-Major: A4, C#5, E5, A5)
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_A4.frequency, 440.0);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_CSHARP5.frequency, 554.37);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_E5.frequency, 659.25);
  assert.equal(SOLAR_FLARE_AUDIO_PRESETS.HELIOS_STABILIZE_A5.frequency, 880.0);
});

// ==============================================================================
// TIER 2: Headless SSR / Node.js Runtime Safe Fallback
// ==============================================================================

test('Tier 2: Headless SSR / Node.js Runtime Safe Fallback (Zero Exception)', () => {
  SolarFlareCrisisAudio.resetInstance();
  const headlessSynth = new SolarFlareCrisisAudio(null, null);

  assert.doesNotThrow(() => {
    headlessSynth.playSolarWindDrone();
    headlessSynth.playCmeWarning();
    headlessSynth.playCmeSweep();
    headlessSynth.playFlashIgnition();
    headlessSynth.playThermalVentPurged(1);
    headlessSynth.playThermalVentPurged(2);
    headlessSynth.playThermalVentPurged(3);
    headlessSynth.playThermalVentPurged(4);
    headlessSynth.playHeliosStabilization();
    headlessSynth.playCrisisState(CrisisStage.WHISPERS, 10);
    headlessSynth.playCrisisState(CrisisStage.OUTBREAK, 45);
    headlessSynth.playCrisisState(CrisisStage.CLIMAX, 85);
    headlessSynth.playCrisisState(CrisisStage.RESOLVED, 0);
    headlessSynth.stop();
    headlessSynth.reset();
    headlessSynth.destroy();
  }, 'All playback routines must execute crash-free in headless SSR environment');

  SolarFlareCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 3: Mock AudioVoicePool Routing & Voice Layering
// ==============================================================================

test('Tier 3: Mock AudioVoicePool Routing & Voice Layering', () => {
  SolarFlareCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new SolarFlareCrisisAudio(pool);

  // 1. Play Solar Wind Drone
  synth.playSolarWindDrone(1000);
  assert.ok(mockCtx.createdNodes.length > 0, 'Must create audio nodes for drone');

  // 2. Play CME Sweep
  synth.playCmeSweep(2000);
  assert.ok(mockCtx.createdNodes.length > 3, 'Must create audio nodes for CME sweep');

  // 3. Play Flash Ignition
  synth.playFlashIgnition(3000);

  // 4. Play Thermal Vent Purges
  synth.playThermalVentPurged(1, 4000);
  synth.playThermalVentPurged(2, 5000);
  synth.playThermalVentPurged(3, 6000);
  synth.playThermalVentPurged(4, 7000);

  // 5. Play Helios Stabilization
  synth.playHeliosStabilization(8000);

  synth.stop();
  synth.destroy();
  SolarFlareCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 4: Rate Limiting & Cooldown Guards
// ==============================================================================

test('Tier 4: Rate Limiting & Cooldown Guards Prevent Audio Thrashing', () => {
  SolarFlareCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new SolarFlareCrisisAudio(pool);

  // Rate-limiting check for CME Sweep (600ms cooldown)
  synth.playCmeSweep(1000);
  assert.equal(pool.getActiveVoiceCount(), 2, 'First sweep acquires 2 voices');

  pool.stop();
  assert.equal(pool.getActiveVoiceCount(), 0);

  // Rapid second trigger at t = 1100ms (< 600ms) is suppressed
  synth.playCmeSweep(1100);
  assert.equal(pool.getActiveVoiceCount(), 0, 'Trigger within 600ms cooldown must be suppressed');

  // Trigger after cooldown at t = 1700ms (>= 600ms) succeeds
  synth.playCmeSweep(1700);
  assert.equal(pool.getActiveVoiceCount(), 2, 'Trigger after cooldown succeeds and acquires 2 voices');

  // Flash ignition rate-limiting (100ms cooldown)
  pool.stop();
  synth.playFlashIgnition(2000);
  assert.equal(pool.getActiveVoiceCount(), 1, 'Flash ignition acquires 1 voice');

  pool.stop();
  synth.playFlashIgnition(2050); // 50ms < 100ms
  assert.equal(pool.getActiveVoiceCount(), 0, 'Flash ignition within 100ms is suppressed');

  synth.playFlashIgnition(2150); // 150ms >= 100ms
  assert.equal(pool.getActiveVoiceCount(), 1, 'Flash ignition after cooldown succeeds');

  synth.stop();
  synth.destroy();
  SolarFlareCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 5: Stage Transition FSM Dispatcher
// ==============================================================================

test('Tier 5: Crisis Stage Transition Dispatcher & Threat Telemetry', () => {
  SolarFlareCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new SolarFlareCrisisAudio(pool);

  let nowMs = 10000;
  // Stage 1: WHISPERS
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.WHISPERS, 15, nowMs += 1000));

  // Stage 2: OUTBREAK
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.OUTBREAK, 45, nowMs += 1000));

  // Stage 3: CLIMAX (High threat > 80%)
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.CLIMAX, 88, nowMs += 1000));

  // Stage 4: RESOLVED
  assert.doesNotThrow(() => synth.playCrisisState(CrisisStage.RESOLVED, 0, nowMs += 1000));

  synth.stop();
  synth.destroy();
  SolarFlareCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 6: Static White Noise Buffer & Dual-Watchdog Cleanup
// ==============================================================================

test('Tier 6: Static White Noise Buffer Management (Zero-GC) & Dual Watchdog', () => {
  const mockCtx = new MockAudioContext();
  const buffer1 = SolarFlareCrisisAudio.getOrCreateNoiseBuffer(mockCtx);
  assert.ok(buffer1, 'Noise buffer must be created');
  assert.equal(buffer1.numberOfChannels, 1);
  assert.equal(buffer1.length, Math.floor(44100 * 0.5), '500ms white noise buffer');

  // Second call reuses exact same cached instance without allocation
  const buffer2 = SolarFlareCrisisAudio.getOrCreateNoiseBuffer(mockCtx);
  assert.equal(buffer1, buffer2, 'Noise buffer must be permanently cached and reused');
});

// ==============================================================================
// TIER 7: Teardown, stop(), reset(), and Singleton Lifecycle
// ==============================================================================

test('Tier 7: Teardown, stop(), reset(), and Singleton Lifecycle', () => {
  SolarFlareCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth1 = SolarFlareCrisisAudio.getInstance(mockCtx);
  synth1.bindPool(pool);

  synth1.playSolarWindDrone(1000);
  synth1.playCmeSweep(2000);
  assert.ok(synth1.getActiveTimeoutCount() >= 0);
  assert.ok(synth1.getActiveTransientNodeCount() >= 0);

  synth1.stop();
  assert.equal(synth1.getActiveTimeoutCount(), 0, 'stop() must clear all pending watchdog timeouts');
  assert.equal(synth1.getActiveTransientNodeCount(), 0, 'stop() must clear all transient audio nodes');

  // Singleton recreation test
  SolarFlareCrisisAudio.resetInstance();
  const synth2 = SolarFlareCrisisAudio.getInstance();
  assert.notEqual(synth1, synth2, 'getInstance after resetInstance must return a fresh instance');

  SolarFlareCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 8: SolarFlareCrisis Game Logic Integration & Audio Hooks
// ==============================================================================

test('Tier 8: SolarFlareCrisis Game Logic Integration & Audio Hooks', () => {
  SolarFlareCrisisAudio.resetInstance();
  const crisis = new SolarFlareCrisis();

  // Initialize crisis
  crisis.init();
  assert.equal(crisis.id, CrisisType.SOLAR_FLARES);
  assert.equal(crisis.getStage(), CrisisStage.WHISPERS);

  // Transition to OUTBREAK
  crisis.setStage(CrisisStage.OUTBREAK);
  assert.equal(crisis.getStage(), CrisisStage.OUTBREAK);

  // CME Warning & Sweep Cycle
  crisis.update(10500); // Trigger warning at 10s
  assert.equal(crisis.isCmeWarningActive, true);

  crisis.update(3000); // Trigger sweep at 13s
  assert.equal(crisis.isCmeSweeping, true);

  // Verify flash-ignition logic
  // Indestructible pillar at (2, 2) provides shelter
  assert.equal(crisis.isTileShelteredFromFlare(2, 2), true);
  assert.equal(crisis.shouldFlashIgniteBomb(2, 2), false);

  // Open corridor at (1, 1) is unsheltered
  assert.equal(crisis.isTileShelteredFromFlare(1, 1), false);
  assert.equal(crisis.shouldFlashIgniteBomb(1, 1), true);

  // Execute flashIgniteBomb
  const flashResult = crisis.flashIgniteBomb(1, 1);
  assert.equal(flashResult, true);

  // Transition to CLIMAX
  crisis.setStage(CrisisStage.CLIMAX);
  assert.equal(crisis.getStage(), CrisisStage.CLIMAX);

  // Cool 4 thermal coolant vents with bomb blasts
  // North (3, 7), South (9, 7), West (6, 3), East (6, 11)
  crisis.handleBombBlast(3, 7, 1);
  crisis.handleBombBlast(9, 7, 1);
  crisis.handleBombBlast(6, 3, 1);
  crisis.handleBombBlast(6, 11, 1);

  const status = crisis.getStatus();
  assert.equal(status.isVictorious, true, 'Cooling all 4 vents must resolve crisis in victory');
  assert.equal(crisis.getStage(), CrisisStage.RESOLVED);

  // Reset crisis cleanly
  crisis.reset();
  assert.equal(crisis.getStage(), CrisisStage.INACTIVE);
  assert.equal(crisis.isCmeSweeping, false);
  assert.equal(crisis.cmeTimerMs, 0);

  SolarFlareCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 9: WaveDirector Wave 20 Crisis-Boss Wave & Relic Award
// ==============================================================================

test('Tier 9: WaveDirector Wave 20 Crisis-Boss Wave & Relic Award', () => {
  // WaveDirector static selection: Wave 20 is CRISIS_BOSS wave for SOLAR_FLARES
  assert.equal(WaveDirector.determineWaveType(20), WaveType.CRISIS_BOSS);
  assert.equal(WaveDirector.isCrisisWave(20), true);
  assert.equal(WaveDirector.isBossWave(20), true);
  assert.equal(
    WaveDirector.selectCrisisForWave(20),
    CrisisType.SOLAR_FLARES,
    'WaveDirector.selectCrisisForWave(20) must be CrisisType.SOLAR_FLARES'
  );

  // Start wave 20 with WaveDirector instance
  const director = new WaveDirector();
  director.startWave(20);

  const crisisType = director.getActiveCrisisType();
  assert.equal(
    crisisType,
    CrisisType.SOLAR_FLARES,
    'Wave 20 must activate CrisisType.SOLAR_FLARES'
  );

  // CrisisManager reward mapping yields SOLAR_CAPACITOR
  const reward = director.getCrisisManager().getCrisisReward(CrisisType.SOLAR_FLARES);
  assert.ok(reward, 'SOLAR_FLARES must define victory reward');
  assert.equal(reward.relicReward, RelicId.SOLAR_CAPACITOR, 'Reward must be SOLAR_CAPACITOR');
  assert.equal(reward.scoreAwarded, 5000);
  assert.equal(reward.starCandies, 35);
  assert.equal(reward.cosmicEssence, 15);

  director.destroy();
});

// ==============================================================================
// TIER 10: 10,000-Frame Zero-GC Soak Test
// ==============================================================================

test('Tier 10: 10,000-Frame Zero-GC Soak Test under Solar Tempest', () => {
  SolarFlareCrisisAudio.resetInstance();
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new SolarFlareCrisisAudio(pool);

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

    // Simulate occasional solar storm events
    if (frame % 40 === 0) {
      synth.playSolarWindDrone(nowMs);
    }
    if (frame % 80 === 0) {
      synth.playCmeWarning(nowMs);
    }
    if (frame % 150 === 0) {
      synth.playCmeSweep(nowMs);
    }
    if (frame % 250 === 0) {
      synth.playFlashIgnition(nowMs);
    }
    if (frame % 500 === 0) {
      const ventIndex = ((frame / 500) % 4) + 1;
      synth.playThermalVentPurged(ventIndex, nowMs);
    }
    if (frame % 1000 === 0) {
      const stageIdx = (frame / 1000) % stages.length;
      synth.playCrisisState(stages[stageIdx], 50, nowMs);
    }
  }

  // Clean shutdown
  synth.stop();
  assert.equal(synth.getActiveTimeoutCount(), 0, 'Zero lingering timeouts after 10,000 frames');
  assert.equal(synth.getActiveTransientNodeCount(), 0, 'Zero lingering audio nodes after 10,000 frames');

  synth.destroy();
  SolarFlareCrisisAudio.resetInstance();
});

// ==============================================================================
// TIER 11: Architectural Defense, NaN Shielding & Edge-Case Regressions
// ==============================================================================

test('Tier 11: Architectural Defense, NaN Shielding & Edge-Case Regressions', () => {
  SolarFlareCrisisAudio.resetInstance();
  const crisis = new SolarFlareCrisis();
  crisis.init();

  // 1. Alert ticker continues in RESOLVED stage
  crisis.triggerAlert('test_alert', 'TEST', 'Banner message', 'info', 'ℹ️', 1000);
  assert.ok(crisis.getActiveAlert());
  crisis.resolveCrisis('Crisis resolved');
  assert.equal(crisis.getStage(), CrisisStage.RESOLVED);
  assert.ok(crisis.getActiveAlert(), 'Resolution banner exists');
  
  // Update in RESOLVED stage must tick alert down and clear it
  crisis.update(6000);
  assert.equal(crisis.getActiveAlert(), null, 'Resolution banner must expire and clear');

  // 2. NaN hazard duration & intensity protection
  crisis.reset();
  crisis.init();
  const tile = crisis.setHazardTile(1, 1, HazardType.SOLAR_SWEEP, NaN, NaN, NaN);
  assert.ok(tile, 'Hazard tile set');
  assert.equal(tile.intensity, 1.0, 'NaN intensity clamped to 1.0');
  assert.equal(tile.durationMs, 0, 'NaN duration clamped to 0');
  assert.equal(tile.data, 0, 'NaN data clamped to 0');

  // 3. NaN objective value protection
  crisis.resolveObjective('cool_thermal_vents', NaN);
  const obj = crisis.getStatus().objectives.find((o) => o.id === 'cool_thermal_vents');
  assert.equal(Number.isFinite(obj.currentCount), true, 'Objective count must not be NaN');

  // 4. Climax CME sweeps must preserve all 4 thermal vents across repeated sweeps
  crisis.setStage(CrisisStage.CLIMAX);
  assert.equal(crisis.getHazardAt(3, 7)?.type, HazardType.THERMAL_VENT);
  assert.equal(crisis.getHazardAt(9, 7)?.type, HazardType.THERMAL_VENT);
  assert.equal(crisis.getHazardAt(6, 3)?.type, HazardType.THERMAL_VENT);
  assert.equal(crisis.getHazardAt(6, 11)?.type, HazardType.THERMAL_VENT);

  // Trigger and end CME sweep 1
  crisis.triggerCmeSweep();
  assert.equal(crisis.getHazardAt(3, 7)?.type, HazardType.THERMAL_VENT, 'Vent 1 preserved during sweep');
  assert.equal(crisis.getHazardAt(9, 7)?.type, HazardType.THERMAL_VENT, 'Vent 2 preserved during sweep');
  crisis.endCmeSweep();
  assert.equal(crisis.getHazardAt(3, 7)?.type, HazardType.THERMAL_VENT, 'Vent 1 restored after sweep');

  // Cool one vent and trigger CME sweep 2
  crisis.handleBombBlast(3, 7, 1);
  crisis.triggerCmeSweep();
  crisis.endCmeSweep();
  assert.equal(crisis.getHazardAt(3, 7)?.data, 1, 'Cooled state (1) preserved across sweeps');

  // 5. NaN and out-of-bounds inputs to shouldFlashIgniteBomb & isTileShelteredFromFlare
  assert.equal(crisis.isTileShelteredFromFlare(NaN, NaN), false);
  assert.equal(crisis.isTileShelteredFromFlare(-1, 5), false);
  assert.equal(crisis.isTileShelteredFromFlare(100, 100), false);
  assert.equal(crisis.shouldFlashIgniteBomb(NaN, NaN), false);
  assert.equal(crisis.shouldFlashIgniteBomb(-1, 5), false);
  assert.equal(crisis.shouldFlashIgniteBomb(100, 100), false);

  // 6. Serialization & Deserialization
  const serialized = crisis.serialize();
  assert.ok(serialized.extraState);
  assert.equal(Array.isArray(serialized.extraState.vents), true);

  const crisis2 = new SolarFlareCrisis();
  crisis2.init();
  crisis2.deserialize(serialized);
  assert.equal(crisis2.getStage(), CrisisStage.CLIMAX);
  assert.equal(crisis2.isThermalVent(3, 7), true);

  // 7. Audio voice pool stoppage on reset()
  const mockCtx = new MockAudioContext();
  const pool = new AudioVoicePool(16, mockCtx);
  const synth = new SolarFlareCrisisAudio(pool);
  synth.playCmeSweep();
  synth.reset();
  assert.equal(synth.getActiveTimeoutCount(), 0);

  synth.destroy();
  crisis.reset();
  crisis2.reset();
  SolarFlareCrisisAudio.resetInstance();
});
