import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SolarHazard,
  SolarLifecycleState,
  SolarTelegraphPhase,
  SolarDangerValue,
  DURATION_SOLAR_WHISPER_MS,
  DURATION_CORONA_SURGE_MS,
  DURATION_SUPERHEAT_DISCHARGE_MS,
  DURATION_SOLAR_CORONA_MS,
  DURATION_SUPERHEAT_FLARE_MS,
  DEFAULT_SOLAR_COOLDOWN_MS,
  CLIMAX_SOLAR_COOLDOWN_MS,
  WHISPERS_SOLAR_COOLDOWN_MS,
  COLS,
} from '../src/game/hazards/SolarHazard.ts';

test('SolarHazard FSM [Lifecycle States]: Transitions correctly DORMANT -> SOLAR_CORONA -> SUPERHEAT_FLARE -> CORONA_RECOVERY', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  assert.equal(hazard.state, SolarLifecycleState.DORMANT);

  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.state, SolarLifecycleState.SOLAR_CORONA);

  // Advance through solar corona telegraph (2000ms)
  hazard.update(DURATION_SOLAR_CORONA_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);

  // Advance through superheat flare burst (350ms)
  hazard.update(DURATION_SUPERHEAT_FLARE_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.CORONA_RECOVERY);

  // Advance through corona recovery cooldown (5800ms default)
  hazard.update(DEFAULT_SOLAR_COOLDOWN_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SOLAR_CORONA);
});

test('SolarHazard Telegraph [3-Tier Sub-Phases]: Advances SOLAR_WHISPER -> CORONA_SURGE -> SUPERHEAT_DISCHARGE', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  assert.equal(hazard.getTelegraphPhase(), SolarTelegraphPhase.SOLAR_WHISPER);

  // Advance past SOLAR_WHISPER (1000ms)
  hazard.update(DURATION_SOLAR_WHISPER_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), SolarTelegraphPhase.CORONA_SURGE);

  // Advance past CORONA_SURGE (600ms)
  hazard.update(DURATION_CORONA_SURGE_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), SolarTelegraphPhase.SUPERHEAT_DISCHARGE);

  // In superheat flare, telegraph phase returns NONE
  hazard.update(DURATION_SUPERHEAT_DISCHARGE_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);
  assert.equal(hazard.getTelegraphPhase(), SolarTelegraphPhase.NONE);
});

test('SolarHazard Danger Mask [Discrete Codes]: dangerMask updates with correct values across states', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const centerIdx = 6 * COLS + 7;
  // In telegraph phase, active tiles have danger code CORONA (1)
  assert.equal(hazard.getDangerMask()[centerIdx], SolarDangerValue.CORONA);

  // Advance to superheat flare burst
  hazard.update(DURATION_SOLAR_CORONA_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);
  assert.equal(hazard.getDangerMask()[centerIdx], SolarDangerValue.FLARE);

  // Advance to recovery cooldown
  hazard.update(DURATION_SUPERHEAT_FLARE_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.CORONA_RECOVERY);
  assert.equal(hazard.getDangerMask()[centerIdx], SolarDangerValue.SAFE);
});

test('SolarHazard Cooldown Scaling [Dynamic Modes]: Adapts cooldown for NORMAL, CLIMAX, and WHISPERS', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);

  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), DEFAULT_SOLAR_COOLDOWN_MS);

  hazard.start('CLIMAX', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), CLIMAX_SOLAR_COOLDOWN_MS);

  hazard.start('WHISPERS', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), WHISPERS_SOLAR_COOLDOWN_MS);
});

test('SolarHazard Spatial Queries: isPointCorona, isPointLethal, and isTileCalm behave accurately', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const px = 7 * 40 + 20; // col 7
  const py = 6 * 40 + 20; // row 6

  // In telegraph phase
  assert.equal(hazard.isPointCorona(px, py), true);
  assert.equal(hazard.isPointLethal(px, py), false);

  // Advance to flare
  hazard.update(DURATION_SOLAR_CORONA_MS + 10);
  assert.equal(hazard.isPointCorona(px, py), false);
  assert.equal(hazard.isPointLethal(px, py), true);

  // Out of bounds / NaN queries return false
  assert.equal(hazard.isPointCorona(NaN, 100), false);
  assert.equal(hazard.isPointLethal(100, Infinity), false);
  assert.equal(hazard.isTileCalm(-1, 0), false);
});
