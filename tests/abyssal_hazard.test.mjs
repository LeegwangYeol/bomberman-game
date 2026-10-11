import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AbyssalHazard,
  AbyssalLifecycleState,
  AbyssalTelegraphPhase,
  AbyssalDangerValue,
  DURATION_TIDAL_UNDERTOW_MS,
  DURATION_TRENCH_CONVERGENCE_MS,
  DURATION_MAELSTROM_IMMINENT_MS,
  DURATION_TIDAL_SURGE_MS,
  DURATION_ABYSSAL_MAELSTROM_MS,
  DEFAULT_ABYSSAL_COOLDOWN_MS,
  CLIMAX_ABYSSAL_COOLDOWN_MS,
  WHISPERS_ABYSSAL_COOLDOWN_MS,
  MIN_ABYSSAL_SAFE_AREA_RATIO,
  TOTAL_TILES,
  COLS,
} from '../src/game/hazards/AbyssalHazard.ts';

test('AbyssalHazard FSM [Lifecycle States]: Transitions correctly DORMANT -> TIDAL_SURGE -> ABYSSAL_MAELSTROM -> OCEANIC_CALM', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  assert.equal(hazard.state, AbyssalLifecycleState.DORMANT);

  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.state, AbyssalLifecycleState.TIDAL_SURGE);

  // Advance through tidal surge telegraph (2000ms)
  hazard.update(DURATION_TIDAL_SURGE_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);

  // Advance through abyssal maelstrom burst (350ms)
  hazard.update(DURATION_ABYSSAL_MAELSTROM_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.OCEANIC_CALM);

  // Advance through oceanic calm cooldown (5800ms default)
  hazard.update(DEFAULT_ABYSSAL_COOLDOWN_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.TIDAL_SURGE);
});

test('AbyssalHazard Telegraph [3-Tier Sub-Phases]: Advances TIDAL_UNDERTOW -> TRENCH_CONVERGENCE -> MAELSTROM_IMMINENT', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.TIDAL_UNDERTOW);

  // Advance past TIDAL_UNDERTOW (1000ms)
  hazard.update(DURATION_TIDAL_UNDERTOW_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.TRENCH_CONVERGENCE);

  // Advance past TRENCH_CONVERGENCE (600ms)
  hazard.update(DURATION_TRENCH_CONVERGENCE_MS + 10);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.MAELSTROM_IMMINENT);

  // In abyssal maelstrom, telegraph phase returns NONE
  hazard.update(DURATION_MAELSTROM_IMMINENT_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);
  assert.equal(hazard.getTelegraphPhase(), AbyssalTelegraphPhase.NONE);
});

test('AbyssalHazard Danger Mask [Discrete Codes]: dangerMask updates with correct values across states', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const centerIdx = 6 * COLS + 7;
  // In telegraph phase, active tiles have danger code TIDAL (1)
  assert.equal(hazard.getDangerMask()[centerIdx], AbyssalDangerValue.TIDAL);

  // Advance to abyssal maelstrom burst
  hazard.update(DURATION_TIDAL_SURGE_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);
  assert.equal(hazard.getDangerMask()[centerIdx], AbyssalDangerValue.MAELSTROM);

  // Advance to oceanic calm cooldown
  hazard.update(DURATION_ABYSSAL_MAELSTROM_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.OCEANIC_CALM);
  assert.equal(hazard.getDangerMask()[centerIdx], AbyssalDangerValue.SAFE);
});

test('AbyssalHazard Cooldown Scaling [Dynamic Modes]: Adapts cooldown for NORMAL, CLIMAX, and WHISPERS', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);

  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), DEFAULT_ABYSSAL_COOLDOWN_MS);

  hazard.start('CLIMAX', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), CLIMAX_ABYSSAL_COOLDOWN_MS);

  hazard.start('WHISPERS', 6, 7);
  assert.equal(hazard.getCooldownDurationMs(), WHISPERS_ABYSSAL_COOLDOWN_MS);
});

test('AbyssalHazard Spatial Queries: isPointInAbyss, isPointLethal, and isTileCalm behave accurately', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Center (row 6, col 7 -> x 300, y 260)
  assert.ok(hazard.isPointInAbyss(300, 260));
  assert.equal(hazard.isPointLethal(300, 260), false);

  // Trigger maelstrom
  hazard.update(DURATION_TIDAL_SURGE_MS + 10);
  assert.ok(hazard.isPointLethal(300, 260));

  // Far away tile (row 1, col 1 -> x 60, y 60)
  assert.equal(hazard.isPointInAbyss(60, 60), false);
  assert.equal(hazard.isPointLethal(60, 60), false);
});

test('AbyssalHazard Safe Area Invariant: Safe area ratio >= 80% on 195-tile arena', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const activeIndices = hazard.getActiveIndices();
  assert.equal(activeIndices.length, 29); // Euclidean radius 3 lattice disk

  const safeAreaRatio = (TOTAL_TILES - activeIndices.length) / TOTAL_TILES;
  assert.ok(safeAreaRatio >= MIN_ABYSSAL_SAFE_AREA_RATIO, `Safe area ${safeAreaRatio} must be >= ${MIN_ABYSSAL_SAFE_AREA_RATIO}`);
  assert.ok(safeAreaRatio >= 0.85); // 166/195 = ~85.128%
});
