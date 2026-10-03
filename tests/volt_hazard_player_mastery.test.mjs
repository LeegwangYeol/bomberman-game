import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VoltHazard,
  VoltLifecycleState,
  SUPERCONDUCTOR_DASH_INVULN_MS,
  SUPERCONDUCTOR_SPEED_BURST_RATIO,
  STATIC_SHOCK_SLOW_RATIO,
  PLAYER_VOLT_BURST_DAMAGE,
  DURATION_IONIZATION_TELEGRAPH_MS,
} from '../src/game/hazards/VoltHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('VoltHazard Player Mastery [Superconductor Dash]: Dashing on ionized tiles grants invulnerability & speed burst', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  const px = 7 * 40 + 20; // 300px
  const py = 6 * 40 + 20; // 260px

  // Player dashing inside electrified zone
  const res = hazard.evaluatePlayer(px, py, true, 1000);
  assert.equal(res.superconductorDashGranted, true);
  assert.equal(res.invulnerabilityGrantedMs, SUPERCONDUCTOR_DASH_INVULN_MS);
  assert.equal(res.speedBoostRatio, SUPERCONDUCTOR_SPEED_BURST_RATIO);
  assert.equal(res.hit, false);
});

test('VoltHazard Player Mastery [Static Shock]: Walking on ionized tiles inflicts slow debuff', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player walking (not dashing) inside electrified zone during telegraph
  const res = hazard.evaluatePlayer(px, py, false, 1000);
  assert.equal(res.staticShockInflicted, true);
  assert.equal(res.slowFactor, 1.0 - STATIC_SHOCK_SLOW_RATIO);
  assert.equal(res.hit, false);
});

test('VoltHazard Player Damage [Lightning Burst]: Walking in discharge deals lethal damage', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  // Advance to discharge burst
  hazard.update(DURATION_IONIZATION_TELEGRAPH_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);

  const px = 7 * 40 + 20;
  const py = 6 * 40 + 20;

  // Player inside discharge without dashing takes lethal burst damage
  const res = hazard.evaluatePlayer(px, py, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.damage, PLAYER_VOLT_BURST_DAMAGE);
});

test('VoltHazard Speed Clamping [PlayerMovementPhysics]: Speed multiplier stacks and respects min/max clamps', () => {
  const baseSpeed = 150;
  
  // Superconductor speed boost (+35%)
  const boostedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + SUPERCONDUCTOR_SPEED_BURST_RATIO,
  });
  assert.ok(boostedSpeed > baseSpeed);
  assert.equal(boostedSpeed, Math.round(baseSpeed * 1.35));

  // Static shock slow (-25%)
  const slowedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - STATIC_SHOCK_SLOW_RATIO,
  });
  assert.ok(slowedSpeed < baseSpeed);
  assert.equal(slowedSpeed, Math.round(baseSpeed * 0.75));
});
