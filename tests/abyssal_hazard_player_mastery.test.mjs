import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AbyssalHazard,
  AbyssalLifecycleState,
  ABYSSAL_GLIDE_INVULN_MS,
  ABYSSAL_GLIDE_SPEED_BURST_RATIO,
  ABYSSAL_GLIDE_COOLDOWN_MS,
  HYDROSTATIC_DRAG_SLOW_RATIO,
  HYDROSTATIC_DRAG_DURATION_MS,
  PLAYER_MAELSTROM_DAMAGE,
  DURATION_TIDAL_SURGE_MS,
} from '../src/game/hazards/AbyssalHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('AbyssalHazard Player Mastery [Abyssal Glide]: Dashing on abyssal tiles grants invulnerability & speed boost', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const px = 7 * 40 + 20; // 300px
  const py = 6 * 40 + 20; // 260px

  // Player dashing inside abyssal zone
  const res = hazard.evaluatePlayer(px, py, true, 1000);
  assert.equal(res.abyssalGlideGranted, true);
  assert.equal(res.glideInvulnMs, ABYSSAL_GLIDE_INVULN_MS);
  assert.equal(res.glideSpeedBoost, ABYSSAL_GLIDE_SPEED_BURST_RATIO);
  assert.equal(res.hit, false);

  // Subsequent dash within 1500ms cooldown should not re-trigger glide
  const resCooldown = hazard.evaluatePlayer(px, py, true, 1000 + ABYSSAL_GLIDE_COOLDOWN_MS - 100);
  assert.equal(resCooldown.abyssalGlideGranted, false);

  // Subsequent dash after 1500ms cooldown re-triggers glide
  const resAfterCooldown = hazard.evaluatePlayer(px, py, true, 1000 + ABYSSAL_GLIDE_COOLDOWN_MS + 10);
  assert.equal(resAfterCooldown.abyssalGlideGranted, true);
});

test('AbyssalHazard Player Mastery [Hydrostatic Drag]: Walking on abyssal tiles inflicts slow debuff', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player walking (not dashing) inside abyssal zone
  const res = hazard.evaluatePlayer(px, py, false, 1000);
  assert.equal(res.dazeInflicted, true);
  assert.equal(res.slowFactor, 1.0 - HYDROSTATIC_DRAG_SLOW_RATIO);
  assert.equal(res.slowDurationMs, HYDROSTATIC_DRAG_DURATION_MS);
  assert.equal(res.hit, false);
});

test('AbyssalHazard Player Damage [Abyssal Maelstrom]: Walking in maelstrom deals lethal damage', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to maelstrom burst
  hazard.update(DURATION_TIDAL_SURGE_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player inside maelstrom without dashing takes lethal damage
  const res = hazard.evaluatePlayer(px, py, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.damage, PLAYER_MAELSTROM_DAMAGE);
  assert.equal(res.isLethal, true);

  // Dashing players trigger Abyssal Glide instead of taking damage
  const resDashing = hazard.evaluatePlayer(px, py, true, 3000);
  assert.equal(resDashing.hit, false);
  assert.equal(resDashing.abyssalGlideGranted, true);
});

test('AbyssalHazard Speed Clamping [PlayerMovementPhysics]: Speed multiplier stacks and respects min/max clamps', () => {
  const baseSpeed = 150;

  // Abyssal glide speed boost (+40%)
  const boostedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + ABYSSAL_GLIDE_SPEED_BURST_RATIO,
  });
  assert.ok(boostedSpeed > baseSpeed);
  assert.equal(boostedSpeed, Math.round(baseSpeed * 1.40));

  // Hydrostatic drag slow (-30%)
  const slowedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - HYDROSTATIC_DRAG_SLOW_RATIO,
  });
  assert.ok(slowedSpeed < baseSpeed);
  assert.equal(slowedSpeed, Math.round(baseSpeed * 0.70));
});
