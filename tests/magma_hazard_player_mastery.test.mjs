import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MagmaHazard,
  MAGMA_SURF_INVULN_MS,
  MAGMA_SURF_SPEED_BURST_RATIO,
  THERMAL_SINGE_DURATION_MS,
  THERMAL_SINGE_SLOW_RATIO,
  PLAYER_MAGMA_BURST_DAMAGE,
  DURATION_MAGMA_TELEGRAPH_MS,
  FLOATING_TEXT_MAGMA_SURF,
  FLOATING_TEXT_THERMAL_SINGE,
} from '../src/game/hazards/MagmaHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('MagmaHazard Player Mastery [Magma Surf]: Dashing on molten tiles grants invulnerability & speed burst', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();

  // Epicenter center px: row 6 -> 260px, col 7 -> 300px
  const px = 300;
  const py = 260;

  // Dashing over heating magma tile triggers Magma Surf
  const res = hazard.evaluatePlayer(px, py, true, 1000);
  assert.equal(res.magmaSurfGranted, true);
  assert.equal(res.invulnerabilityGrantedMs, MAGMA_SURF_INVULN_MS);
  assert.equal(res.speedBoostGranted, true);
  assert.equal(res.speedBoostRatio, MAGMA_SURF_SPEED_BURST_RATIO);
  assert.equal(res.floatingText, FLOATING_TEXT_MAGMA_SURF);
});

test('MagmaHazard Player Mastery [Thermal Singe]: Walking on heating tiles inflicts slow debuff', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const px = 300;
  const py = 260;

  // Walking without dash inflicts Thermal Singe
  const res = hazard.evaluatePlayer(px, py, false, 1000);
  assert.equal(res.magmaSurfGranted, false);
  assert.equal(res.thermalSingeInflicted, true);
  assert.equal(res.thermalSingeDurationMs, THERMAL_SINGE_DURATION_MS);
  assert.equal(res.slowRatio, THERMAL_SINGE_SLOW_RATIO);
  assert.equal(res.slowFactor, 1.0 - THERMAL_SINGE_SLOW_RATIO);
  assert.equal(res.floatingText, FLOATING_TEXT_THERMAL_SINGE);
});

test('MagmaHazard Player Damage [Pyroclastic Burst]: Walking in burst deals lethal damage', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_MAGMA_TELEGRAPH_MS + 10); // Enter burst

  const px = 300;
  const py = 260;

  // Walking in active burst deals lethal damage
  const res = hazard.evaluatePlayer(px, py, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.damage, PLAYER_MAGMA_BURST_DAMAGE);
  assert.equal(res.isLethal, true);
});

test('MagmaHazard Speed Clamping [PlayerMovementPhysics]: Speed multiplier stacks and respects min/max clamps', () => {
  const baseSpeed = 150;

  // Thermal Singe slow
  const slowedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - THERMAL_SINGE_SLOW_RATIO, // 0.75
  });
  assert.equal(slowedSpeed, Math.round(150 * (1.0 - THERMAL_SINGE_SLOW_RATIO)));

  // Magma Surf speed burst
  const boostedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + MAGMA_SURF_SPEED_BURST_RATIO, // 1.35
  });
  assert.equal(boostedSpeed, Math.round(150 * (1.0 + MAGMA_SURF_SPEED_BURST_RATIO)));

  // Heavy multi-hazard slow (clamped at MIN_PLAYER_SPEED = 50)
  const extremeSlowSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 0.1, // would be 15
  });
  assert.equal(extremeSlowSpeed, 50, 'Clamped at minimum allowed player speed');
});
