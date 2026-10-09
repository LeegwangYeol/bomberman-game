import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SolarHazardAudio,
  SOLAR_AUDIO_PRESETS,
} from '../src/game/hazards/SolarHazardAudio.ts';
import {
  SolarLifecycleState,
  SolarTelegraphPhase,
} from '../src/game/hazards/SolarHazard.ts';

test('Tier 1 [Solar Audio Presets]: Presets define exact frequencies, ramps, and filters', () => {
  assert.ok(SOLAR_AUDIO_PRESETS.THERMONUCLEAR_SUB_DRONE_38HZ);
  assert.equal(SOLAR_AUDIO_PRESETS.THERMONUCLEAR_SUB_DRONE_38HZ.type, 'sine');
  assert.equal(SOLAR_AUDIO_PRESETS.THERMONUCLEAR_SUB_DRONE_38HZ.frequency, 38.4);
  assert.equal(SOLAR_AUDIO_PRESETS.THERMONUCLEAR_SUB_DRONE_38HZ.frequencyRamp?.target, 28.0);

  assert.ok(SOLAR_AUDIO_PRESETS.CORONA_ARC_SWEEP);
  assert.equal(SOLAR_AUDIO_PRESETS.CORONA_ARC_SWEEP.type, 'sawtooth');
  assert.equal(SOLAR_AUDIO_PRESETS.CORONA_ARC_SWEEP.frequency, 280.0);
  assert.equal(SOLAR_AUDIO_PRESETS.CORONA_ARC_SWEEP.frequencyRamp?.target, 620.0);

  assert.ok(SOLAR_AUDIO_PRESETS.SUPERHEAT_FLARE_CRACK);
  assert.equal(SOLAR_AUDIO_PRESETS.SUPERHEAT_FLARE_CRACK.type, 'sawtooth');
  assert.equal(SOLAR_AUDIO_PRESETS.SUPERHEAT_FLARE_CRACK.frequency, 920.0);
  assert.equal(SOLAR_AUDIO_PRESETS.SUPERHEAT_FLARE_CRACK.frequencyRamp?.target, 42.0);

  assert.ok(SOLAR_AUDIO_PRESETS.SOLAR_SURF_CHIME_HIGH);
  assert.equal(SOLAR_AUDIO_PRESETS.SOLAR_SURF_CHIME_HIGH.type, 'sine');
  assert.equal(SOLAR_AUDIO_PRESETS.SOLAR_SURF_CHIME_HIGH.frequency, 783.99);

  assert.ok(SOLAR_AUDIO_PRESETS.SUNSTROKE_WARBLE);
  assert.equal(SOLAR_AUDIO_PRESETS.SUNSTROKE_WARBLE.type, 'sawtooth');
  assert.equal(SOLAR_AUDIO_PRESETS.SUNSTROKE_WARBLE.frequency, 360.0);
});

test('Tier 2 [SolarHazardAudio Headless Fallback]: All methods safe without active context or pool', () => {
  SolarHazardAudio.destroy();

  // Passing null voicePool should never throw in headless environment
  assert.doesNotThrow(() => {
    SolarHazardAudio.playSolarHazardState(SolarLifecycleState.SOLAR_CORONA, SolarTelegraphPhase.SOLAR_WHISPER, null);
    SolarHazardAudio.playThermonuclearDrone(null);
    SolarHazardAudio.playCoronaArcSweep(null);
    SolarHazardAudio.playSuperheatFlareCrack(null);
    SolarHazardAudio.playSolarSurfChimes(null);
    SolarHazardAudio.playSolarCalmResolution(null);
    SolarHazardAudio.playSunstrokeWarble(null);
    SolarHazardAudio.clearPendingNodes();
  });
});

test('Tier 3 [Voice Pool Routing]: Routines dispatch correct tones to AudioVoicePool', () => {
  const tonesPlayed = [];
  const fakePool = {
    playTone(params) {
      tonesPlayed.push(params);
      return 1;
    },
    getAudioContext() { return null; },
  };

  SolarHazardAudio.playThermonuclearDrone(fakePool);
  assert.equal(tonesPlayed.length, 2);
  assert.equal(tonesPlayed[0].frequency, 38.4);
  assert.equal(tonesPlayed[1].frequency, 64.0);

  tonesPlayed.length = 0;
  SolarHazardAudio.playCoronaArcSweep(fakePool);
  assert.equal(tonesPlayed.length, 1);
  assert.equal(tonesPlayed[0].frequency, 280.0);

  tonesPlayed.length = 0;
  SolarHazardAudio.playSuperheatFlareCrack(fakePool);
  assert.equal(tonesPlayed.length, 2);
  assert.equal(tonesPlayed[0].frequency, 920.0);
  assert.equal(tonesPlayed[1].frequency, 48.0);

  tonesPlayed.length = 0;
  SolarHazardAudio.playSolarSurfChimes(fakePool);
  assert.equal(tonesPlayed.length, 2);
  assert.equal(tonesPlayed[0].frequency, 783.99);

  tonesPlayed.length = 0;
  SolarHazardAudio.playSunstrokeWarble(fakePool);
  assert.equal(tonesPlayed.length, 1);
  assert.equal(tonesPlayed[0].frequency, 360.0);
});

test('Tier 4 [FSM Dispatch & Debounce]: playSolarHazardState triggers state transitions cleanly', () => {
  const tonesPlayed = [];
  const fakePool = {
    playTone(params) {
      tonesPlayed.push(params);
      return 1;
    },
    getAudioContext() { return null; },
  };

  SolarHazardAudio.destroy();

  // First call in WHISPER
  SolarHazardAudio.playSolarHazardState(
    SolarLifecycleState.SOLAR_CORONA,
    SolarTelegraphPhase.SOLAR_WHISPER,
    fakePool,
    1000
  );
  assert.ok(tonesPlayed.length >= 1);

  // Same state & phase: suppressed by deduplication
  const countBefore = tonesPlayed.length;
  SolarHazardAudio.playSolarHazardState(
    SolarLifecycleState.SOLAR_CORONA,
    SolarTelegraphPhase.SOLAR_WHISPER,
    fakePool,
    1016
  );
  assert.equal(tonesPlayed.length, countBefore);

  // Transition to CORONA_SURGE
  SolarHazardAudio.playSolarHazardState(
    SolarLifecycleState.SOLAR_CORONA,
    SolarTelegraphPhase.CORONA_SURGE,
    fakePool,
    1600
  );
  assert.ok(tonesPlayed.length > countBefore);

  // Transition to SUPERHEAT_FLARE
  const countBeforeFlare = tonesPlayed.length;
  SolarHazardAudio.playSolarHazardState(
    SolarLifecycleState.SUPERHEAT_FLARE,
    SolarTelegraphPhase.NONE,
    fakePool,
    2000
  );
  assert.ok(tonesPlayed.length > countBeforeFlare);
});

test('Tier 5 [Stress Stability]: 1,000 rapid cycles execute with 0 exceptions', () => {
  const fakePool = {
    playTone() { return 1; },
    getAudioContext() { return null; },
  };

  assert.doesNotThrow(() => {
    for (let i = 0; i < 1000; i++) {
      SolarHazardAudio.playSolarHazardState(
        i % 2 === 0 ? SolarLifecycleState.SOLAR_CORONA : SolarLifecycleState.SUPERHEAT_FLARE,
        i % 2 === 0 ? SolarTelegraphPhase.CORONA_SURGE : SolarTelegraphPhase.NONE,
        fakePool,
        i * 16
      );
    }
  });

  SolarHazardAudio.destroy();
});
