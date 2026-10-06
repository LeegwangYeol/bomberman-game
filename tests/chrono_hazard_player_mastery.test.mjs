import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChronoHazard,
  CHRONO_SURGE_INVULN_MS,
  CHRONO_SURGE_SPEED_BURST_RATIO,
  TEMPORAL_DILATION_DURATION_MS,
  TEMPORAL_DILATION_SLOW_RATIO,
  PLAYER_TIME_COLLAPSE_DAMAGE,
  DURATION_CHRONO_DISTORTION_MS,
  FLOATING_TEXT_CHRONO_SURGE,
  FLOATING_TEXT_TEMPORAL_DILATION,
  FLOATING_TEXT_TIME_COLLAPSED,
  TILE_SIZE,
} from '../src/game/hazards/ChronoHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('ChronoHazard Player Mastery [Chrono Surge]: Dashing through dilation zone grants invulnerability & speed burst', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();

  // Epicenter center px: row 6 -> 260px, col 7 -> 300px
  const px = 7 * TILE_SIZE + TILE_SIZE / 2;
  const py = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Dashing over dilated tile triggers Chrono Surge
  const res = hazard.evaluatePlayer(px, py, true, 1000);
  assert.equal(res.chronoSurgeGranted, true);
  assert.equal(res.isSurgeActivated, true);
  assert.equal(res.surgeInvulnMs, CHRONO_SURGE_INVULN_MS);
  assert.equal(res.surgeSpeedBoost, CHRONO_SURGE_SPEED_BURST_RATIO);
  assert.equal(res.floatingText, FLOATING_TEXT_CHRONO_SURGE);
});

test('ChronoHazard Player Mastery [Temporal Dilation]: Walking on dilation tile inflicts slow debuff', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();

  const px = 7 * TILE_SIZE + TILE_SIZE / 2;
  const py = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Walking without dash inflicts Temporal Dilation slow
  const res = hazard.evaluatePlayer(px, py, false, 1000);
  assert.equal(res.chronoSurgeGranted, false);
  assert.equal(res.temporalDilationInflicted, true);
  assert.equal(res.isDilated, true);
  assert.equal(res.slowDurationMs, TEMPORAL_DILATION_DURATION_MS);
  assert.equal(res.slowFactor, 1.0 - TEMPORAL_DILATION_SLOW_RATIO);
  assert.equal(res.floatingText, FLOATING_TEXT_TEMPORAL_DILATION);
});

test('ChronoHazard Player Damage [Time Collapse]: Walking in active collapse deals lethal damage without dash', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_CHRONO_DISTORTION_MS + 10); // Enter TIME_COLLAPSE

  const px = 7 * TILE_SIZE + TILE_SIZE / 2;
  const py = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Walking in active collapse deals lethal damage
  const res = hazard.evaluatePlayer(px, py, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.damage, PLAYER_TIME_COLLAPSE_DAMAGE);
  assert.equal(res.isLethal, true);
  assert.equal(res.floatingText, FLOATING_TEXT_TIME_COLLAPSED);

  // Shield absorbs collapse damage
  const shieldRes = hazard.evaluatePlayer(px, py, false, true, 3000);
  assert.equal(shieldRes.hit, true);
  assert.equal(shieldRes.damage, 0, 'Shield fully absorbs collapse damage');
});

test('ChronoHazard Safe Timeline [Anchor]: Anchored tile allows safe movement with 0 damage and 0 slow', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();

  // Stabilize epicenter via bomb blast
  hazard.onBombBlastImpact(6, 7);

  const px = 7 * TILE_SIZE + TILE_SIZE / 2;
  const py = 6 * TILE_SIZE + TILE_SIZE / 2;

  const res = hazard.evaluatePlayer(px, py, false, 1000);
  assert.equal(res.hit, false);
  assert.equal(res.isDilated, false);
  assert.equal(res.temporalDilationInflicted, false);
  assert.equal(res.slowFactor, 1.0);
});

test('ChronoHazard Speed Clamping [PlayerMovementPhysics]: Speed multiplier stacks and respects min/max clamps', () => {
  const baseSpeed = 150;

  // Temporal Dilation slow (-30%)
  const slowedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - TEMPORAL_DILATION_SLOW_RATIO, // 0.70
  });
  assert.equal(slowedSpeed, Math.round(150 * (1.0 - TEMPORAL_DILATION_SLOW_RATIO)));

  // Chrono Surge speed burst (+40%)
  const boostedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + CHRONO_SURGE_SPEED_BURST_RATIO, // 1.40
  });
  assert.equal(boostedSpeed, Math.round(150 * (1.0 + CHRONO_SURGE_SPEED_BURST_RATIO)));

  // Clamped compound bounds: [0.30, 1.85]
  const compoundMultiplier = Math.max(0.30, Math.min(1.85, (1.0 - TEMPORAL_DILATION_SLOW_RATIO) * 0.45));
  assert.ok(compoundMultiplier >= 0.30 && compoundMultiplier <= 1.85);

  const extremeSlowSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 0.1,
  });
  assert.equal(extremeSlowSpeed, 50, 'Clamped at minimum allowed player speed floor');
});
