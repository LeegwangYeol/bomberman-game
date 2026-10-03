import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VoltHazard,
  VoltLifecycleState,
  VoltTelegraphPhase,
  VoltDangerValue,
  DURATION_STATIC_CHARGE_MS,
  DURATION_ARC_BUILDUP_MS,
  DURATION_STEPPED_LEADER_MS,
  DURATION_IONIZATION_TELEGRAPH_MS,
  DURATION_LIGHTNING_DISCHARGE_MS,
  DEFAULT_VOLT_COOLDOWN_MS,
  CLIMAX_VOLT_COOLDOWN_MS,
  WHISPERS_VOLT_COOLDOWN_MS,
  COLS,
} from '../src/game/hazards/VoltHazard.ts';

test('VoltHazard FSM [Lifecycle States]: Transitions correctly DORMANT -> IONIZATION -> DISCHARGE -> COOLDOWN', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  assert.equal(hazard.state, VoltLifecycleState.DORMANT);

  hazard.start();
  assert.equal(hazard.state, VoltLifecycleState.IONIZATION_TELEGRAPH);

  // Advance through ionization telegraph (2000ms)
  hazard.update(DURATION_IONIZATION_TELEGRAPH_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);

  // Advance through lightning discharge burst (500ms)
  hazard.update(DURATION_LIGHTNING_DISCHARGE_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.DISCHARGE_COOLDOWN);

  // Advance through discharge cooldown (18000ms default)
  hazard.update(DEFAULT_VOLT_COOLDOWN_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.IONIZATION_TELEGRAPH);
});

test('VoltHazard Telegraph [3-Tier Sub-Phases]: Advances STATIC_CHARGE -> ARC_BUILDUP -> STEPPED_LEADER', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  assert.equal(hazard.getTelegraphPhase(), VoltTelegraphPhase.STATIC_CHARGE);

  // Advance past STATIC_CHARGE (700ms)
  hazard.update(DURATION_STATIC_CHARGE_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), VoltTelegraphPhase.ARC_BUILDUP);

  // Advance past ARC_BUILDUP (800ms)
  hazard.update(DURATION_ARC_BUILDUP_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), VoltTelegraphPhase.STEPPED_LEADER);

  // In discharge, telegraph phase returns NONE
  hazard.update(DURATION_STEPPED_LEADER_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);
  assert.equal(hazard.getTelegraphPhase(), VoltTelegraphPhase.NONE);
});

test('VoltHazard Danger Mask [Discrete Codes]: dangerMask updates with correct values across states', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  const centerIdx = 6 * COLS + 7;
  // In telegraph phase, active tiles have danger code IONIZED (1)
  assert.equal(hazard.dangerMask[centerIdx], VoltDangerValue.IONIZED);

  // Advance to lightning discharge burst
  hazard.update(DURATION_IONIZATION_TELEGRAPH_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);
  assert.equal(hazard.dangerMask[centerIdx], VoltDangerValue.LIGHTNING_DISCHARGE);

  // Advance to cooldown
  hazard.update(DURATION_LIGHTNING_DISCHARGE_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.DISCHARGE_COOLDOWN);
  assert.equal(hazard.dangerMask[centerIdx], VoltDangerValue.DISSIPATING);

  // Advance past initial dissipation decay (1500ms)
  hazard.update(2000);
  assert.equal(hazard.dangerMask[centerIdx], VoltDangerValue.SAFE);
});

test('VoltHazard Cooldown Scaling [Dynamic Modes]: Adapts cooldown for NORMAL, CLIMAX, and WHISPERS', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);

  hazard.start('NORMAL');
  assert.equal(hazard.getCooldownDurationMs(), DEFAULT_VOLT_COOLDOWN_MS);

  hazard.start('CLIMAX');
  assert.equal(hazard.getCooldownDurationMs(), CLIMAX_VOLT_COOLDOWN_MS);

  hazard.start('WHISPERS');
  assert.equal(hazard.getCooldownDurationMs(), WHISPERS_VOLT_COOLDOWN_MS);
});
