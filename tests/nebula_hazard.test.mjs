import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NebulaHazard,
  NebulaLifecycleState,
  NebulaTelegraphPhase,
  NebulaDangerValue,
  DURATION_ASTRAL_WHISPER_MS,
  DURATION_COSMIC_CONVERGENCE_MS,
  DURATION_ECLIPSE_IMMINENT_MS,
  DURATION_NEBULA_DRIFT_MS,
  DURATION_ECLIPSE_COLLAPSE_MS,
  DEFAULT_NEBULA_COOLDOWN_MS,
  CLIMAX_NEBULA_COOLDOWN_MS,
  WHISPERS_NEBULA_COOLDOWN_MS,
  MIN_NEBULA_SAFE_AREA_RATIO,
  TOTAL_TILES,
  COLS,
} from '../src/game/hazards/NebulaHazard.ts';

test('NebulaHazard FSM [Lifecycle States]: Transitions correctly DORMANT -> NEBULA_DRIFT -> ECLIPSE_COLLAPSE -> STELLAR_DAWN', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  assert.equal(hazard.state, NebulaLifecycleState.DORMANT);

  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.state, NebulaLifecycleState.NEBULA_DRIFT);

  // Advance through nebula drift telegraph (2000ms)
  hazard.update(DURATION_NEBULA_DRIFT_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);

  // Advance through eclipse collapse burst (350ms)
  hazard.update(DURATION_ECLIPSE_COLLAPSE_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.STELLAR_DAWN);

  // Advance through stellar dawn cooldown (5800ms default)
  hazard.update(DEFAULT_NEBULA_COOLDOWN_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.NEBULA_DRIFT);
});

test('NebulaHazard Telegraph [3-Tier Sub-Phases]: Advances ASTRAL_WHISPER -> COSMIC_CONVERGENCE -> ECLIPSE_IMMINENT', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  assert.equal(hazard.getTelegraphPhase(), NebulaTelegraphPhase.ASTRAL_WHISPER);

  // Advance past ASTRAL_WHISPER (1000ms)
  hazard.update(DURATION_ASTRAL_WHISPER_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), NebulaTelegraphPhase.COSMIC_CONVERGENCE);

  // Advance past COSMIC_CONVERGENCE (600ms)
  hazard.update(DURATION_COSMIC_CONVERGENCE_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), NebulaTelegraphPhase.ECLIPSE_IMMINENT);

  // In eclipse collapse, telegraph phase returns NONE
  hazard.update(DURATION_ECLIPSE_IMMINENT_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);
  assert.equal(hazard.getTelegraphPhase(), NebulaTelegraphPhase.NONE);
});

test('NebulaHazard Danger Mask [Discrete Codes]: dangerMask updates with correct values across states', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const centerIdx = 6 * COLS + 7;
  // In telegraph phase, active tiles have danger code NEBULA (1)
  assert.equal(hazard.getDangerMask()[centerIdx], NebulaDangerValue.NEBULA);

  // Advance to eclipse collapse burst
  hazard.update(DURATION_NEBULA_DRIFT_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);
  assert.equal(hazard.getDangerMask()[centerIdx], NebulaDangerValue.COLLAPSE);

  // Advance to stellar dawn cooldown
  hazard.update(DURATION_ECLIPSE_COLLAPSE_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.STELLAR_DAWN);
  assert.equal(hazard.getDangerMask()[centerIdx], NebulaDangerValue.SAFE);
});

test('NebulaHazard Cooldown Scaling [Dynamic Modes]: Adapts cooldown for NORMAL, CLIMAX, and WHISPERS', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);

  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), DEFAULT_NEBULA_COOLDOWN_MS);

  hazard.start('CLIMAX', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), CLIMAX_NEBULA_COOLDOWN_MS);

  hazard.start('WHISPERS', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), WHISPERS_NEBULA_COOLDOWN_MS);
});

test('NebulaHazard Spatial Queries: isPointInNebula, isPointLethal, and isTileCalm behave accurately', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Center (row 6, col 7 -> x 300, y 260)
  assert.ok(hazard.isPointInNebula(300, 260));
  assert.equal(hazard.isPointLethal(300, 260), false);

  // Trigger collapse
  hazard.update(DURATION_NEBULA_DRIFT_MS + 10);
  assert.ok(hazard.isPointLethal(300, 260));

  // Far away tile (row 1, col 1 -> x 60, y 60)
  assert.equal(hazard.isPointInNebula(60, 60), false);
  assert.equal(hazard.isPointLethal(60, 60), false);
});

test('NebulaHazard Safe Area Invariant: Safe area ratio >= 80% on 195-tile arena', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const activeIndices = hazard.getActiveIndices();
  assert.equal(activeIndices.length, 29); // Euclidean radius 3 lattice disk

  const safeAreaRatio = (TOTAL_TILES - activeIndices.length) / TOTAL_TILES;
  assert.ok(safeAreaRatio >= MIN_NEBULA_SAFE_AREA_RATIO, `Safe area ${safeAreaRatio} must be >= ${MIN_NEBULA_SAFE_AREA_RATIO}`);
  assert.ok(safeAreaRatio >= 0.85); // 166/195 = ~85.128%
});
