import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MiasmaHazard,
  SPORE_SURGE_INVULN_MS,
  SPORE_SURGE_SPEED_BURST_RATIO,
  NEUROTOXIN_DURATION_MS,
  NEUROTOXIN_SLOW_RATIO,
  PLAYER_MIASMA_BURST_DAMAGE,
  DURATION_SPORE_INCUBATION_MS,
  FLOATING_TEXT_SPORE_SURGE,
  FLOATING_TEXT_NEUROTOXIN,
} from '../src/game/hazards/MiasmaHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('MiasmaHazard Player Mastery [Spore Surge]: Dashing through spore zones grants invulnerability & speed burst', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  // Epicenter center px: row 6 -> 260px, col 7 -> 300px
  const px = 300;
  const py = 260;

  // Dashing over incubating spore tile triggers Spore Surge
  const res = hazard.evaluatePlayer(px, py, true, 1000);
  assert.equal(res.sporeSurgeGranted, true);
  assert.equal(res.invulnerabilityGrantedMs, SPORE_SURGE_INVULN_MS);
  assert.equal(res.speedBoostGranted, true);
  assert.equal(res.speedBoostRatio, SPORE_SURGE_SPEED_BURST_RATIO);
  assert.equal(res.floatingText, FLOATING_TEXT_SPORE_SURGE);
});

test('MiasmaHazard Player Mastery [Neurotoxin]: Walking on incubating spore tiles inflicts slow debuff', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const px = 300;
  const py = 260;

  // Walking without dash inflicts Neurotoxin
  const res = hazard.evaluatePlayer(px, py, false, 1000);
  assert.equal(res.sporeSurgeGranted, false);
  assert.equal(res.neurotoxinInflicted, true);
  assert.equal(res.neurotoxinDurationMs, NEUROTOXIN_DURATION_MS);
  assert.equal(res.slowRatio, NEUROTOXIN_SLOW_RATIO);
  assert.equal(res.slowFactor, 1.0 - NEUROTOXIN_SLOW_RATIO);
  assert.equal(res.floatingText, FLOATING_TEXT_NEUROTOXIN);
});

test('MiasmaHazard Player Damage [Corrosive Burst]: Walking in burst deals lethal damage', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_SPORE_INCUBATION_MS + 10); // Enter burst

  const px = 300;
  const py = 260;

  // Walking in active burst deals lethal damage
  const res = hazard.evaluatePlayer(px, py, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.damage, PLAYER_MIASMA_BURST_DAMAGE);
  assert.equal(res.isLethal, true);
});

test('MiasmaHazard Speed Clamping [PlayerMovementPhysics]: Speed multiplier stacks and respects min/max clamps', () => {
  const baseSpeed = 150;

  // Neurotoxin slow (-25%)
  const slowedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - NEUROTOXIN_SLOW_RATIO, // 0.75
  });
  assert.equal(slowedSpeed, Math.round(150 * (1.0 - NEUROTOXIN_SLOW_RATIO)));

  // Spore Surge speed burst (+35%)
  const boostedSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + SPORE_SURGE_SPEED_BURST_RATIO, // 1.35
  });
  assert.equal(boostedSpeed, Math.round(150 * (1.0 + SPORE_SURGE_SPEED_BURST_RATIO)));

  // Heavy multi-hazard slow (clamped at MIN_PLAYER_SPEED = 50)
  const extremeSlowSpeed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 0.1,
  });
  assert.equal(extremeSlowSpeed, 50, 'Clamped at minimum allowed player speed');
});
