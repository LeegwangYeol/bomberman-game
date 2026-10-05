import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MiasmaHazard,
  MiasmaLifecycleState,
  MiasmaTelegraphPhase,
  MiasmaDangerValue,
  DURATION_SPORE_INCUBATION_MS,
  DURATION_CORROSIVE_BURST_MS,
  DEFAULT_MIASMA_COOLDOWN_MS,
  CLIMAX_MIASMA_COOLDOWN_MS,
  WHISPERS_MIASMA_COOLDOWN_MS,
  COLS,
} from '../src/game/hazards/MiasmaHazard.ts';

test('MiasmaHazard FSM [Lifecycle States]: Transitions correctly DORMANT -> SPORE_INCUBATION -> CORROSIVE_BURST -> SPORE_DISSIPATION', () => {
  const hazard = new MiasmaHazard();
  assert.equal(hazard.getState(), MiasmaLifecycleState.DORMANT);

  hazard.start();
  assert.equal(hazard.getState(), MiasmaLifecycleState.SPORE_INCUBATION);

  // Step 1900ms (still incubation telegraph)
  hazard.update(1900);
  assert.equal(hazard.getState(), MiasmaLifecycleState.SPORE_INCUBATION);

  // Cross telegraph threshold -> CORROSIVE_BURST
  hazard.update(150);
  assert.equal(hazard.getState(), MiasmaLifecycleState.CORROSIVE_BURST);

  // Step burst duration -> SPORE_DISSIPATION (cooldown)
  hazard.update(DURATION_CORROSIVE_BURST_MS + 10);
  assert.equal(hazard.getState(), MiasmaLifecycleState.SPORE_DISSIPATION);

  // Step cooldown duration -> cycles back to SPORE_INCUBATION
  hazard.update(DEFAULT_MIASMA_COOLDOWN_MS + 50);
  assert.equal(hazard.getState(), MiasmaLifecycleState.SPORE_INCUBATION);
});

test('MiasmaHazard Telegraph [3-Tier Sub-Phases]: Advances POD_SWELLING -> SPORE_EXHALATION -> BLOOM_IMMINENT', () => {
  const hazard = new MiasmaHazard();
  hazard.start();

  assert.equal(hazard.getTelegraphPhase(), MiasmaTelegraphPhase.POD_SWELLING);

  // Advance 900ms -> still POD_SWELLING
  hazard.update(900);
  assert.equal(hazard.getTelegraphPhase(), MiasmaTelegraphPhase.POD_SWELLING);

  // Advance 200ms -> SPORE_EXHALATION (1000-1600ms)
  hazard.update(200);
  assert.equal(hazard.getTelegraphPhase(), MiasmaTelegraphPhase.SPORE_EXHALATION);

  // Advance 550ms -> BLOOM_IMMINENT (1600-2000ms)
  hazard.update(550);
  assert.equal(hazard.getTelegraphPhase(), MiasmaTelegraphPhase.BLOOM_IMMINENT);
});

test('MiasmaHazard Danger Mask [Discrete Codes]: dangerMask updates with correct values across states', () => {
  const hazard = new MiasmaHazard();
  const epicIdx = 6 * COLS + 7;

  // DORMANT: Safe
  assert.equal(hazard.dangerMask[epicIdx], MiasmaDangerValue.SAFE);

  // SPORE_INCUBATION: INCUBATING (1)
  hazard.start();
  assert.equal(hazard.dangerMask[epicIdx], MiasmaDangerValue.INCUBATING);

  // Advance to burst: BURST (2)
  hazard.update(DURATION_SPORE_INCUBATION_MS + 10);
  assert.equal(hazard.dangerMask[epicIdx], MiasmaDangerValue.BURST);

  // Advance to cooldown
  hazard.update(DURATION_CORROSIVE_BURST_MS + 10);
  assert.equal(hazard.state, MiasmaLifecycleState.SPORE_DISSIPATION);

  // Advance past initial dissipation -> SAFE (0)
  hazard.update(2000);
  assert.equal(hazard.dangerMask[epicIdx], MiasmaDangerValue.SAFE);
});

test('MiasmaHazard Cooldown Scaling [Dynamic Modes]: Adapts cooldown for NORMAL, CLIMAX, and WHISPERS', () => {
  const hazard = new MiasmaHazard();

  hazard.start('NORMAL');
  assert.equal(hazard.getCooldownDurationMs(), DEFAULT_MIASMA_COOLDOWN_MS);

  hazard.start('CLIMAX');
  assert.equal(hazard.getCooldownDurationMs(), CLIMAX_MIASMA_COOLDOWN_MS);

  hazard.start('WHISPERS');
  assert.equal(hazard.getCooldownDurationMs(), WHISPERS_MIASMA_COOLDOWN_MS);
});
