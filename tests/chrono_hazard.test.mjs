import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChronoHazard,
  ChronoLifecycleState,
  ChronoTelegraphPhase,
  ChronoDangerValue,
  DURATION_CHRONO_DISTORTION_MS,
  DURATION_TIME_COLLAPSE_MS,
  DURATION_TEMPORAL_RIPPLE_MS,
  DURATION_TACHYON_WARP_MS,
  DEFAULT_CHRONO_COOLDOWN_MS,
  CLIMAX_CHRONO_COOLDOWN_MS,
  WHISPERS_CHRONO_COOLDOWN_MS,
  COLS,
  TILE_SIZE,
} from '../src/game/hazards/ChronoHazard.ts';

test('ChronoHazard FSM [Lifecycle States]: Transitions correctly DORMANT -> CHRONO_DISTORTION -> TIME_COLLAPSE -> TACHYON_RECOVERY', () => {
  const hazard = new ChronoHazard();
  assert.equal(hazard.getState(), ChronoLifecycleState.DORMANT);

  hazard.start();
  assert.equal(hazard.getState(), ChronoLifecycleState.CHRONO_DISTORTION);

  // Step 1900ms (still distortion telegraph)
  hazard.update(1900);
  assert.equal(hazard.getState(), ChronoLifecycleState.CHRONO_DISTORTION);

  // Cross telegraph threshold (2000ms) -> TIME_COLLAPSE
  hazard.update(150);
  assert.equal(hazard.getState(), ChronoLifecycleState.TIME_COLLAPSE);

  // Step burst duration (350ms) -> TACHYON_RECOVERY (cooldown)
  hazard.update(DURATION_TIME_COLLAPSE_MS + 10);
  assert.equal(hazard.getState(), ChronoLifecycleState.TACHYON_RECOVERY);

  // Step cooldown duration (5800ms) -> cycles back to CHRONO_DISTORTION
  hazard.update(DEFAULT_CHRONO_COOLDOWN_MS + 50);
  assert.equal(hazard.getState(), ChronoLifecycleState.CHRONO_DISTORTION);
});

test('ChronoHazard Telegraph [3-Tier Sub-Phases]: Advances TEMPORAL_RIPPLE -> TACHYON_WARP -> EVENT_HORIZON_IMMINENT', () => {
  const hazard = new ChronoHazard();
  hazard.start();

  assert.equal(hazard.getTelegraphPhase(), ChronoTelegraphPhase.TEMPORAL_RIPPLE);

  // Advance 900ms -> still TEMPORAL_RIPPLE (0-1000ms)
  hazard.update(900);
  assert.equal(hazard.getTelegraphPhase(), ChronoTelegraphPhase.TEMPORAL_RIPPLE);

  // Advance 200ms -> TACHYON_WARP (1000-1600ms)
  hazard.update(200);
  assert.equal(hazard.getTelegraphPhase(), ChronoTelegraphPhase.TACHYON_WARP);

  // Advance 550ms -> EVENT_HORIZON_IMMINENT (1600-2000ms)
  hazard.update(550);
  assert.equal(hazard.getTelegraphPhase(), ChronoTelegraphPhase.EVENT_HORIZON_IMMINENT);

  // Advance past 2000ms -> into TIME_COLLAPSE, telegraph phase becomes NONE
  hazard.update(400);
  assert.equal(hazard.getState(), ChronoLifecycleState.TIME_COLLAPSE);
  assert.equal(hazard.getTelegraphPhase(), ChronoTelegraphPhase.NONE);
});

test('ChronoHazard Danger Mask [Discrete Codes]: dangerMask updates correctly across states', () => {
  const hazard = new ChronoHazard();
  const epicIdx = 6 * COLS + 7;

  // DORMANT: Safe
  assert.equal(hazard.getDangerMask()[epicIdx], ChronoDangerValue.SAFE);

  // CHRONO_DISTORTION: DILATION (1)
  hazard.start('NORMAL', 6, 7);
  assert.equal(hazard.getDangerMask()[epicIdx], ChronoDangerValue.DILATION);
  assert.ok(hazard.getDilationGrid()[epicIdx] > 0, 'Dilation factor strictly positive');

  // Advance to TIME_COLLAPSE: COLLAPSE (2)
  hazard.update(DURATION_CHRONO_DISTORTION_MS + 10);
  assert.equal(hazard.getDangerMask()[epicIdx], ChronoDangerValue.COLLAPSE);
  assert.equal(hazard.getDilationGrid()[epicIdx], 1.0, 'Full dilation at collapse');

  // Advance to TACHYON_RECOVERY: SAFE (0)
  hazard.update(DURATION_TIME_COLLAPSE_MS + 10);
  assert.equal(hazard.getState(), ChronoLifecycleState.TACHYON_RECOVERY);
  assert.equal(hazard.getDangerMask()[epicIdx], ChronoDangerValue.SAFE);
});

test('ChronoHazard Cooldown Scaling [Dynamic Modes]: Adapts cooldown for NORMAL, CLIMAX, and WHISPERS', () => {
  const hazard = new ChronoHazard();

  hazard.start('NORMAL');
  assert.equal(hazard.getCooldownDurationMs(), DEFAULT_CHRONO_COOLDOWN_MS);

  hazard.start('CLIMAX');
  assert.equal(hazard.getCooldownDurationMs(), CLIMAX_CHRONO_COOLDOWN_MS);

  hazard.start('WHISPERS');
  assert.equal(hazard.getCooldownDurationMs(), WHISPERS_CHRONO_COOLDOWN_MS);
});

test('ChronoHazard Point Queries [Collision & Safety Checks]: Correctly queries dilation, lethality, and anchors', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const centerX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const centerY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // During distortion: point is in dilation, but not lethal
  assert.equal(hazard.isPointDilation(centerX, centerY), true);
  assert.equal(hazard.isPointLethal(centerX, centerY), false);

  // Far corner point is safe
  assert.equal(hazard.isPointDilation(0, 0), false);
  assert.equal(hazard.isPointLethal(0, 0), false);

  // Advance to collapse
  hazard.update(DURATION_CHRONO_DISTORTION_MS + 10);
  assert.equal(hazard.isPointDilation(centerX, centerY), false);
  assert.equal(hazard.isPointLethal(centerX, centerY), true);

  // Stabilize tile via blast impact
  hazard.onBombBlastImpact(6, 7);
  assert.equal(hazard.isTileStabilized(6, 7), true);
  assert.equal(hazard.isPointLethal(centerX, centerY), false);
});
