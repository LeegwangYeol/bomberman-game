import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NebulaHazardAudio,
  NEBULA_AUDIO_PRESETS,
} from '../src/game/hazards/NebulaHazardAudio.ts';
import {
  NebulaLifecycleState,
  NebulaTelegraphPhase,
} from '../src/game/hazards/NebulaHazard.ts';

test('Tier 1 [Nebula Audio Presets]: Presets define exact frequencies, Solfeggio tuning, and harmonic ramps', () => {
  assert.ok(NEBULA_AUDIO_PRESETS.COSMIC_ETHER_SUB_DRONE_55HZ);
  assert.equal(NEBULA_AUDIO_PRESETS.COSMIC_ETHER_SUB_DRONE_55HZ.type, 'sine');
  assert.equal(NEBULA_AUDIO_PRESETS.COSMIC_ETHER_SUB_DRONE_55HZ.frequency, 55.0);
  assert.equal(NEBULA_AUDIO_PRESETS.COSMIC_ETHER_SUB_DRONE_55HZ.frequencyRamp?.target, 41.25);

  assert.ok(NEBULA_AUDIO_PRESETS.STARDUST_WHISPER_SWEEP_432HZ);
  assert.equal(NEBULA_AUDIO_PRESETS.STARDUST_WHISPER_SWEEP_432HZ.type, 'sine');
  assert.equal(NEBULA_AUDIO_PRESETS.STARDUST_WHISPER_SWEEP_432HZ.frequency, 432.0);
  assert.equal(NEBULA_AUDIO_PRESETS.STARDUST_WHISPER_SWEEP_432HZ.frequencyRamp?.target, 864.0);

  assert.ok(NEBULA_AUDIO_PRESETS.PENUMBRA_ARC_SWEEP);
  assert.equal(NEBULA_AUDIO_PRESETS.PENUMBRA_ARC_SWEEP.type, 'sawtooth');
  assert.equal(NEBULA_AUDIO_PRESETS.PENUMBRA_ARC_SWEEP.frequency, 220.0);

  assert.ok(NEBULA_AUDIO_PRESETS.ECLIPSE_COLLAPSE_CRACK_720HZ);
  assert.equal(NEBULA_AUDIO_PRESETS.ECLIPSE_COLLAPSE_CRACK_720HZ.type, 'sawtooth');
  assert.equal(NEBULA_AUDIO_PRESETS.ECLIPSE_COLLAPSE_CRACK_720HZ.frequency, 720.0);
  assert.equal(NEBULA_AUDIO_PRESETS.ECLIPSE_COLLAPSE_CRACK_720HZ.frequencyRamp?.target, 65.0);

  assert.ok(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_ROOT_528HZ);
  assert.equal(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_ROOT_528HZ.frequency, 528.00);
  assert.equal(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_THIRD_660HZ.frequency, 660.00);
  assert.equal(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_FIFTH_792HZ.frequency, 792.00);
  assert.equal(NEBULA_AUDIO_PRESETS.STELLAR_DAWN_TRIAD_OCTAVE_1056HZ.frequency, 1056.00);
});

test('Tier 2 [NebulaHazardAudio Headless Fallback]: All methods safe without active context or pool', () => {
  NebulaHazardAudio.destroy();

  // Passing null voicePool should never throw in headless environment
  assert.doesNotThrow(() => {
    NebulaHazardAudio.playNebulaHazardState(NebulaLifecycleState.NEBULA_DRIFT, NebulaTelegraphPhase.ASTRAL_WHISPER, null);
    NebulaHazardAudio.playCosmicEtherDrone(null);
    NebulaHazardAudio.playStardustWhisperChime(null);
    NebulaHazardAudio.playPenumbraSweep(null);
    NebulaHazardAudio.playEclipseCollapseImplosion(null);
    NebulaHazardAudio.playStellarDawnResolution(null);
    NebulaHazardAudio.playAstralGlideChimes(null);
    NebulaHazardAudio.playCosmicDazeWarning(null);
    NebulaHazardAudio.playOpticalLensKick(null);
    NebulaHazardAudio.playStardustCalmSnap(null);
    NebulaHazardAudio.clearPendingNodes();
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

  NebulaHazardAudio.playCosmicEtherDrone(fakePool);
  assert.equal(tonesPlayed.length, 2);
  assert.equal(tonesPlayed[0].frequency, 55.0);
  assert.equal(tonesPlayed[1].frequency, 82.5);

  tonesPlayed.length = 0;
  NebulaHazardAudio.playStardustWhisperChime(fakePool);
  assert.equal(tonesPlayed.length, 2);
  assert.equal(tonesPlayed[0].frequency, 432.0);
  assert.equal(tonesPlayed[1].frequency, 864.0);

  tonesPlayed.length = 0;
  NebulaHazardAudio.playPenumbraSweep(fakePool);
  assert.equal(tonesPlayed.length, 1);
  assert.equal(tonesPlayed[0].frequency, 220.0);

  tonesPlayed.length = 0;
  NebulaHazardAudio.playEclipseCollapseImplosion(fakePool);
  assert.equal(tonesPlayed.length, 3);
  assert.equal(tonesPlayed[0].frequency, 720.0);
  assert.equal(tonesPlayed[1].frequency, 540.0);
  assert.equal(tonesPlayed[2].frequency, 65.0);

  tonesPlayed.length = 0;
  NebulaHazardAudio.playStellarDawnResolution(fakePool);
  assert.equal(tonesPlayed.length, 4);
  assert.equal(tonesPlayed[0].frequency, 528.00); // 528 Solfeggio Root
  assert.equal(tonesPlayed[1].frequency, 660.00); // 660 Third
  assert.equal(tonesPlayed[2].frequency, 792.00); // 792 Fifth
  assert.equal(tonesPlayed[3].frequency, 1056.00); // 1056 Octave
});

test('Tier 4 [FSM Dispatch & Debounce]: playNebulaHazardState triggers state transitions cleanly', () => {
  const tonesPlayed = [];
  const fakePool = {
    playTone(params) {
      tonesPlayed.push(params);
      return 1;
    },
    getAudioContext() { return null; },
  };

  NebulaHazardAudio.destroy();

  // Initial transition into NEBULA_DRIFT (ASTRAL_WHISPER)
  NebulaHazardAudio.playNebulaHazardState(
    NebulaLifecycleState.NEBULA_DRIFT,
    NebulaTelegraphPhase.ASTRAL_WHISPER,
    fakePool,
    1000
  );
  assert.ok(tonesPlayed.length >= 2);

  // Redundant call with same state & phase is debounced
  const beforeCount = tonesPlayed.length;
  NebulaHazardAudio.playNebulaHazardState(
    NebulaLifecycleState.NEBULA_DRIFT,
    NebulaTelegraphPhase.ASTRAL_WHISPER,
    fakePool,
    1050
  );
  assert.equal(tonesPlayed.length, beforeCount);

  // Transition into ECLIPSE_COLLAPSE triggers implosion chord
  tonesPlayed.length = 0;
  NebulaHazardAudio.playNebulaHazardState(
    NebulaLifecycleState.ECLIPSE_COLLAPSE,
    NebulaTelegraphPhase.NONE,
    fakePool,
    3000
  );
  assert.equal(tonesPlayed.length, 3);

  // Transition into STELLAR_DAWN triggers Solfeggio 528Hz resolution
  tonesPlayed.length = 0;
  NebulaHazardAudio.playNebulaHazardState(
    NebulaLifecycleState.STELLAR_DAWN,
    NebulaTelegraphPhase.NONE,
    fakePool,
    3500
  );
  assert.equal(tonesPlayed.length, 4);
});
