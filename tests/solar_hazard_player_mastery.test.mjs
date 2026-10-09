import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SolarHazard,
  SolarLifecycleState,
  SOLAR_SURF_INVULN_MS,
  SOLAR_SURF_SPEED_BURST_RATIO,
  SOLAR_SURF_COOLDOWN_MS,
  SUNSTROKE_SLOW_RATIO,
  SUNSTROKE_DURATION_MS,
  PLAYER_SUPERHEAT_DAMAGE,
  DURATION_SOLAR_CORONA_MS,
} from '../src/game/hazards/SolarHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('SolarHazard Player Mastery [Solar Surf]: Dashing on solar tiles grants invulnerability & speed burst', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const px = 7 * 40 + 20; // 300px
  const py = 6 * 40 + 20; // 260px

  // Player dashing inside solar corona zone
  const res = hazard.evaluatePlayer(px, py, true, false, 1000);
  assert.equal(res.solarSurfGranted, true);
  assert.equal(res.surfInvulnMs, SOLAR_SURF_INVULN_MS);
  assert.equal(res.surfSpeedBoost, SOLAR_SURF_SPEED_BURST_RATIO);
  assert.equal(res.hit, false);

  // Subsequent dash within 1500ms cooldown should not re-trigger surf
  const resCooldown = hazard.evaluatePlayer(px, py, true, false, 1000 + SOLAR_SURF_COOLDOWN_MS - 100);
  assert.equal(resCooldown.solarSurfGranted, false);

  // Subsequent dash after 1500ms cooldown re-triggers surf
  const resAfterCooldown = hazard.evaluatePlayer(px, py, true, false, 1000 + SOLAR_SURF_COOLDOWN_MS + 10);
  assert.equal(resAfterCooldown.solarSurfGranted, true);
});

test('SolarHazard Player Mastery [Sunstroke]: Walking on solar tiles inflicts slow debuff', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player walking (not dashing) inside solar corona zone
  const res = hazard.evaluatePlayer(px, py, false, false, 1000);
  assert.equal(res.sunstrokeInflicted, true);
  assert.equal(res.slowFactor, 1.0 - SUNSTROKE_SLOW_RATIO);
  assert.equal(res.slowDurationMs, SUNSTROKE_DURATION_MS);
  assert.equal(res.hit, false);
});

test('SolarHazard Player Damage [Superheat Flare]: Walking in flare deals superheat damage, shielded players absorb it', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to flare burst
  hazard.update(DURATION_SOLAR_CORONA_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player unshielded inside flare without dashing takes damage
  const resUnshielded = hazard.evaluatePlayer(px, py, false, false, 3000);
  assert.equal(resUnshielded.hit, true);
  assert.equal(resUnshielded.damage, PLAYER_SUPERHEAT_DAMAGE);

  // Player shielded inside flare absorbs damage
  const resShielded = hazard.evaluatePlayer(px, py, false, true, 3016);
  assert.equal(resShielded.hit, true);
  assert.equal(resShielded.damage, 0);
});

test('SolarHazard Speed Clamping [PlayerMovementPhysics]: Speed multiplier stacks and respects min/max clamps', () => {
  const baseSpeed = 150;

  // Solar surf speed boost (+40%)
  const boostedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + SOLAR_SURF_SPEED_BURST_RATIO,
  });
  assert.ok(boostedSpeed > baseSpeed);
  assert.equal(boostedSpeed, Math.round(baseSpeed * 1.40));

  // Sunstroke slow (-30%)
  const slowedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - SUNSTROKE_SLOW_RATIO,
  });
  assert.ok(slowedSpeed < baseSpeed);
  assert.equal(slowedSpeed, Math.round(baseSpeed * 0.70));
});
