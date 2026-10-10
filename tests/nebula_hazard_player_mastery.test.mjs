import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NebulaHazard,
  NebulaLifecycleState,
  ASTRAL_GLIDE_INVULN_MS,
  ASTRAL_GLIDE_SPEED_BURST_RATIO,
  ASTRAL_GLIDE_COOLDOWN_MS,
  COSMIC_DAZE_SLOW_RATIO,
  COSMIC_DAZE_DURATION_MS,
  PLAYER_COLLAPSE_DAMAGE,
  DURATION_NEBULA_DRIFT_MS,
} from '../src/game/hazards/NebulaHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('NebulaHazard Player Mastery [Astral Glide]: Dashing on nebula tiles grants invulnerability & speed boost', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const px = 7 * 40 + 20; // 300px
  const py = 6 * 40 + 20; // 260px

  // Player dashing inside nebula zone
  const res = hazard.evaluatePlayer(px, py, true, 1000);
  assert.equal(res.astralGlideGranted, true);
  assert.equal(res.glideInvulnMs, ASTRAL_GLIDE_INVULN_MS);
  assert.equal(res.glideSpeedBoost, ASTRAL_GLIDE_SPEED_BURST_RATIO);
  assert.equal(res.hit, false);

  // Subsequent dash within 1500ms cooldown should not re-trigger glide
  const resCooldown = hazard.evaluatePlayer(px, py, true, 1000 + ASTRAL_GLIDE_COOLDOWN_MS - 100);
  assert.equal(resCooldown.astralGlideGranted, false);

  // Subsequent dash after 1500ms cooldown re-triggers glide
  const resAfterCooldown = hazard.evaluatePlayer(px, py, true, 1000 + ASTRAL_GLIDE_COOLDOWN_MS + 10);
  assert.equal(resAfterCooldown.astralGlideGranted, true);
});

test('NebulaHazard Player Mastery [Cosmic Daze]: Walking on nebula tiles inflicts slow debuff', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player walking (not dashing) inside nebula zone
  const res = hazard.evaluatePlayer(px, py, false, 1000);
  assert.equal(res.dazeInflicted, true);
  assert.equal(res.slowFactor, 1.0 - COSMIC_DAZE_SLOW_RATIO);
  assert.equal(res.slowDurationMs, COSMIC_DAZE_DURATION_MS);
  assert.equal(res.hit, false);
});

test('NebulaHazard Player Damage [Eclipse Collapse]: Walking in collapse deals lethal collapse damage', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to collapse burst
  hazard.update(DURATION_NEBULA_DRIFT_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player inside collapse without dashing takes lethal damage
  const res = hazard.evaluatePlayer(px, py, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.damage, PLAYER_COLLAPSE_DAMAGE);
  assert.equal(res.isLethal, true);

  // Dashing players trigger Astral Glide instead of taking damage
  const resDashing = hazard.evaluatePlayer(px, py, true, 3000);
  assert.equal(resDashing.hit, false);
  assert.equal(resDashing.astralGlideGranted, true);
});

test('NebulaHazard Speed Clamping [PlayerMovementPhysics]: Speed multiplier stacks and respects min/max clamps', () => {
  const baseSpeed = 150;

  // Astral glide speed boost (+40%)
  const boostedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + ASTRAL_GLIDE_SPEED_BURST_RATIO,
  });
  assert.ok(boostedSpeed > baseSpeed);
  assert.equal(boostedSpeed, Math.round(baseSpeed * 1.40));

  // Cosmic daze slow (-30%)
  const slowedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - COSMIC_DAZE_SLOW_RATIO,
  });
  assert.ok(slowedSpeed < baseSpeed);
  assert.equal(slowedSpeed, Math.round(baseSpeed * 0.70));
});
