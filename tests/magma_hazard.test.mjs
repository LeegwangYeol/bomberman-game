import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MagmaHazard,
  MagmaLifecycleState,
  MagmaTelegraphPhase,
  MagmaDangerValue,
  DURATION_MAGMA_TELEGRAPH_MS,
  DURATION_PYROCLASTIC_BURST_MS,
  DEFAULT_MAGMA_COOLDOWN_MS,
  CLIMAX_MAGMA_COOLDOWN_MS,
  WHISPERS_MAGMA_COOLDOWN_MS,
  COLS,
} from '../src/game/hazards/MagmaHazard.ts';

test('MagmaHazard FSM [Lifecycle States]: Transitions correctly DORMANT -> MAGMA_TELEGRAPH -> PYROCLASTIC_BURST -> OBSIDIAN_COOLDOWN', () => {
  const hazard = new MagmaHazard();
  assert.equal(hazard.getState(), MagmaLifecycleState.DORMANT);

  hazard.start();
  assert.equal(hazard.getState(), MagmaLifecycleState.MAGMA_TELEGRAPH);

  // Step 1900ms (still telegraph)
  hazard.update(1900);
  assert.equal(hazard.getState(), MagmaLifecycleState.MAGMA_TELEGRAPH);

  // Cross telegraph threshold -> PYROCLASTIC_BURST
  hazard.update(150);
  assert.equal(hazard.getState(), MagmaLifecycleState.PYROCLASTIC_BURST);

  // Step burst duration -> OBSIDIAN_COOLDOWN
  hazard.update(DURATION_PYROCLASTIC_BURST_MS + 10);
  assert.equal(hazard.getState(), MagmaLifecycleState.OBSIDIAN_COOLDOWN);

  // Step cooldown duration -> cycles back to MAGMA_TELEGRAPH
  hazard.update(DEFAULT_MAGMA_COOLDOWN_MS + 50);
  assert.equal(hazard.getState(), MagmaLifecycleState.MAGMA_TELEGRAPH);
});

test('MagmaHazard Telegraph [3-Tier Sub-Phases]: Advances CRUST_HEATING -> MAGMA_UPWELLING -> ERUPTION_IMMINENT', () => {
  const hazard = new MagmaHazard();
  hazard.start();

  assert.equal(hazard.getTelegraphPhase(), MagmaTelegraphPhase.CRUST_HEATING);

  // Advance 900ms -> still CRUST_HEATING
  hazard.update(900);
  assert.equal(hazard.getTelegraphPhase(), MagmaTelegraphPhase.CRUST_HEATING);

  // Advance 200ms -> MAGMA_UPWELLING (1000-1600ms)
  hazard.update(200);
  assert.equal(hazard.getTelegraphPhase(), MagmaTelegraphPhase.MAGMA_UPWELLING);

  // Advance 550ms -> ERUPTION_IMMINENT (1600-2000ms)
  hazard.update(550);
  assert.equal(hazard.getTelegraphPhase(), MagmaTelegraphPhase.ERUPTION_IMMINENT);
});

test('MagmaHazard Danger Mask [Discrete Codes]: dangerMask updates with correct values across states', () => {
  const hazard = new MagmaHazard();
  const epicIdx = 6 * COLS + 7;

  // DORMANT: Safe
  assert.equal(hazard.dangerMask[epicIdx], MagmaDangerValue.SAFE);

  // MAGMA_TELEGRAPH: HEATING
  hazard.start();
  assert.equal(hazard.dangerMask[epicIdx], MagmaDangerValue.HEATING);

  // Advance to burst: BURST (2)
  hazard.update(DURATION_MAGMA_TELEGRAPH_MS + 10);
  assert.equal(hazard.dangerMask[epicIdx], MagmaDangerValue.BURST);

  // Advance to cooldown
  hazard.update(DURATION_PYROCLASTIC_BURST_MS + 10);
  assert.equal(hazard.state, MagmaLifecycleState.OBSIDIAN_COOLDOWN);

  // Advance past initial 1500ms heat dissipation -> SAFE (0)
  hazard.update(2000);
  assert.equal(hazard.dangerMask[epicIdx], MagmaDangerValue.SAFE);
});

test('MagmaHazard Cooldown Scaling [Dynamic Modes]: Adapts cooldown for NORMAL, CLIMAX, and WHISPERS', () => {
  const hazard = new MagmaHazard();

  hazard.start('NORMAL');
  assert.equal(hazard.getCooldownDurationMs(), DEFAULT_MAGMA_COOLDOWN_MS);

  hazard.start('CLIMAX');
  assert.equal(hazard.getCooldownDurationMs(), CLIMAX_MAGMA_COOLDOWN_MS);

  hazard.start('WHISPERS');
  assert.equal(hazard.getCooldownDurationMs(), WHISPERS_MAGMA_COOLDOWN_MS);
});
