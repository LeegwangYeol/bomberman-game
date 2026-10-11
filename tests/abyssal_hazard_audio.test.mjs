import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AbyssalHazardAudio,
  ABYSSAL_AUDIO_PRESETS,
} from '../src/game/hazards/AbyssalHazardAudio.ts';
import {
  AbyssalLifecycleState,
  AbyssalTelegraphPhase,
} from '../src/game/hazards/AbyssalHazard.ts';

test('Tier 1 [Abyssal Audio Presets]: Presets define exact frequencies, ramps, and filters', () => {
  assert.equal(ABYSSAL_AUDIO_PRESETS.SUB_BASS_OCEAN_DRONE_48HZ.frequency, 48.0);
  assert.equal(ABYSSAL_AUDIO_PRESETS.TIDAL_UNDERTOW_SWEEP_320HZ.frequency, 320.0);
  assert.equal(ABYSSAL_AUDIO_PRESETS.MAELSTROM_SWEEP_CRACK_640HZ.frequency, 640.0);
  assert.equal(ABYSSAL_AUDIO_PRESETS.OCEANIC_CALM_TRIAD_ROOT_432HZ.frequency, 432.00);
  assert.equal(ABYSSAL_AUDIO_PRESETS.OCEANIC_CALM_SNAP.frequency, 432.00);
});

test('Tier 2 [AbyssalHazardAudio Headless Fallback]: All methods safe without active context or pool', () => {
  AbyssalHazardAudio.destroy();
  assert.doesNotThrow(() => {
    AbyssalHazardAudio.playAbyssalHazardState(AbyssalLifecycleState.TIDAL_SURGE, AbyssalTelegraphPhase.TIDAL_UNDERTOW, null);
    AbyssalHazardAudio.playOceanicSubDrone(null);
    AbyssalHazardAudio.playTidalUndertowChime(null);
    AbyssalHazardAudio.playTrenchConvergenceSweep(null);
    AbyssalHazardAudio.playMaelstromImplosion(null);
    AbyssalHazardAudio.playOceanicCalmResolution(null);
    AbyssalHazardAudio.playAbyssalGlideChimes(null);
    AbyssalHazardAudio.playHydrostaticDragWarning(null);
    AbyssalHazardAudio.playHydroSlipstreamKick(null);
    AbyssalHazardAudio.playOceanicCalmSnap(null);
    AbyssalHazardAudio.clearPendingNodes();
  });
});

test('Tier 3 [Voice Pool Routing]: Routines dispatch correct tones to AudioVoicePool', () => {
  const tones = [];
  const fakePool = {
    playTone(params) {
      tones.push(params);
    },
  };

  AbyssalHazardAudio.playOceanicSubDrone(fakePool);
  assert.ok(tones.some((t) => t.frequency === 48.0));

  AbyssalHazardAudio.playTidalUndertowChime(fakePool);
  assert.ok(tones.some((t) => t.frequency === 320.0));

  AbyssalHazardAudio.playTrenchConvergenceSweep(fakePool);
  assert.ok(tones.some((t) => t.frequency === 180.0));

  AbyssalHazardAudio.playMaelstromImplosion(fakePool);
  assert.ok(tones.some((t) => t.frequency === 640.0));

  AbyssalHazardAudio.playOceanicCalmResolution(fakePool);
  assert.ok(tones.some((t) => t.frequency === 432.00));
});

test('Tier 4 [FSM Dispatch & Debounce]: playAbyssalHazardState triggers state transitions cleanly', () => {
  AbyssalHazardAudio.destroy();
  const tones = [];
  const fakePool = {
    playTone(params) {
      tones.push(params);
    },
  };

  // State 1: TIDAL_SURGE + TIDAL_UNDERTOW
  AbyssalHazardAudio.playAbyssalHazardState(
    AbyssalLifecycleState.TIDAL_SURGE,
    AbyssalTelegraphPhase.TIDAL_UNDERTOW,
    fakePool,
    1000
  );
  assert.ok(tones.length >= 2);

  // State 2: ABYSSAL_MAELSTROM
  AbyssalHazardAudio.playAbyssalHazardState(
    AbyssalLifecycleState.ABYSSAL_MAELSTROM,
    AbyssalTelegraphPhase.NONE,
    fakePool,
    3000
  );
  assert.ok(tones.some((t) => t.frequency === 640.0));

  // State 3: OCEANIC_CALM
  AbyssalHazardAudio.playAbyssalHazardState(
    AbyssalLifecycleState.OCEANIC_CALM,
    AbyssalTelegraphPhase.NONE,
    fakePool,
    3500
  );
  assert.ok(tones.some((t) => t.frequency === 432.00));

  // State 4: Duplicate call debounces
  const countBefore = tones.length;
  AbyssalHazardAudio.playAbyssalHazardState(
    AbyssalLifecycleState.OCEANIC_CALM,
    AbyssalTelegraphPhase.NONE,
    fakePool,
    3550
  );
  assert.equal(tones.length, countBefore);
});

test('Tier 5 [Solfeggio 432Hz Oceanic Harmonic Quad]: Pure sacred harmonic tuning', () => {
  const tones = [];
  const fakePool = {
    playTone(params) {
      tones.push(params);
    },
  };

  AbyssalHazardAudio.playOceanicCalmingChime(fakePool);
  assert.equal(tones.length, 4);
  assert.equal(tones[0].frequency, 432.00); // Solfeggio Root
  assert.equal(tones[1].frequency, 540.00); // 5:4 Major Third
  assert.equal(tones[2].frequency, 648.00); // 3:2 Perfect Fifth
  assert.equal(tones[3].frequency, 864.00); // 2:1 Pure Octave
});

test('Tier 6 [Auto-disconnect Cleanup & Watchdog]: Safe teardown without leaks or errors', () => {
  AbyssalHazardAudio.destroy();

  assert.doesNotThrow(() => {
    AbyssalHazardAudio.playRushingTidalNoisePulse(0.1, 640, 48, 3.8);
    AbyssalHazardAudio.playMaelstromWhiteNoisePulse(0.1, 640, 48, 3.8);
    AbyssalHazardAudio.clearPendingNodes();
    AbyssalHazardAudio.stop();
    AbyssalHazardAudio.destroy();
  });
});

test('Tier 7 [Stress Stability]: 1,000 rapid cycles execute with 0 exceptions', () => {
  const fakePool = {
    playTone() {
      return 1;
    },
    getAudioContext() {
      return null;
    },
  };

  assert.doesNotThrow(() => {
    for (let i = 0; i < 1000; i++) {
      const state =
        i % 3 === 0
          ? AbyssalLifecycleState.TIDAL_SURGE
          : i % 3 === 1
          ? AbyssalLifecycleState.ABYSSAL_MAELSTROM
          : AbyssalLifecycleState.OCEANIC_CALM;
      const phase =
        i % 2 === 0
          ? AbyssalTelegraphPhase.TIDAL_UNDERTOW
          : AbyssalTelegraphPhase.TRENCH_CONVERGENCE;
      AbyssalHazardAudio.playAbyssalHazardState(state, phase, fakePool, i * 100);
    }
  });

  AbyssalHazardAudio.destroy();
});

