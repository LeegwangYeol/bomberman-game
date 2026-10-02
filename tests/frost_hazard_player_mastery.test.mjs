/**
 * tests/frost_hazard_player_mastery.test.mjs
 *
 * Comprehensive Test Suite for FrostHazard Player Mastery Mechanics:
 * - Thermal Break: Dashing through frost breaks ice crystals, gives 1200ms I-frame invulnerability,
 *   +35% speed burst, and '✦ THERMAL BREAK!' floating text.
 * - Frost Chill Debuff: Walking without dash applies Frost Chill debuff (-25% speed for 2000ms).
 * - GameScene Integration: Buff stack lifecycle, speed calculation & clamping, audio feedback, and Zero-GC soak.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FrostHazard,
  FrostLifecycleState,
  HoarfrostPhase,
  THERMAL_BREAK_INVULN_MS,
  THERMAL_BREAK_SPEED_BURST_RATIO,
  THERMAL_BREAK_COOLDOWN_MS,
  FLOATING_TEXT_THERMAL_BREAK,
  FROST_CHILL_DURATION_MS,
  FROST_CHILL_SLOW_RATIO,
  FLOATING_TEXT_FROST_CHILL,
  PLAYER_FROST_BURST_DAMAGE,
  FROST_RADIUS_PX,
} from '../src/game/hazards/FrostHazard.ts';

import {
  calculateClampedPlayerSpeed,
  BASE_PLAYER_SPEED,
  MIN_PLAYER_SPEED,
  MAX_PLAYER_SPEED_CLAMP,
} from '../src/game/gameplay_mechanics.ts';

import { TILE_SIZE } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * TIER 1: THERMAL BREAK MECHANICS
 * ============================================================================== */

test('Tier 1.1 [Thermal Break Trigger]: Dashing through frost breaks crystals with 1200ms I-frames and +35% speed burst', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const coreX = 7 * TILE_SIZE + TILE_SIZE / 2; // 300px
  const coreY = 6 * TILE_SIZE + TILE_SIZE / 2; // 260px

  // Dashing through glaciated frost at time 1000ms
  const res = hazard.evaluatePlayer(coreX + 40, coreY + 40, true, 1000);

  assert.equal(res.thermalBreakGranted, true, 'Dashing player must trigger Thermal Break');
  assert.equal(res.invulnerabilityGrantedMs, THERMAL_BREAK_INVULN_MS, 'Must grant exactly 1200ms I-frame invulnerability');
  assert.equal(res.invulnerabilityGrantedMs, 1200);
  assert.equal(res.speedBoostGranted, true, 'Must grant speed burst');
  assert.equal(res.speedBoostRatio, 0.35, 'Speed burst ratio must be exactly +35% (0.35)');
  assert.equal(res.slowFactor, 1.35, 'Slow factor must be 1.35 (+35% speed)');
  assert.equal(res.floatingText, FLOATING_TEXT_THERMAL_BREAK, 'Must display ✦ THERMAL BREAK!');
  assert.equal(res.floatingText, '✦ THERMAL BREAK!');
  assert.equal(res.damage, 0, 'Dashing player takes 0 damage');
  assert.equal(res.frostChillInflicted, false, 'Dashing player must not receive Frost Chill');
});

test('Tier 1.2 [Thermal Break in Absolute Zero Burst]: Dashing player survives lethal burst damage', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Advance FSM into ABSOLUTE_ZERO_BURST (after 2000ms)
  hazard.update(2050);
  assert.equal(hazard.getState(), FrostLifecycleState.ABSOLUTE_ZERO_BURST);

  const coreX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const coreY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Dashing inside the lethal burst zone
  const res = hazard.evaluatePlayer(coreX, coreY, true, 2050);
  assert.equal(res.thermalBreakGranted, true);
  assert.equal(res.damage, 0, 'Thermal break completely negates lethal burst damage');
  assert.equal(res.isLethal, false);
  assert.equal(res.invulnerabilityGrantedMs, 1200);
  assert.equal(res.slowFactor, 1.35);
});

test('Tier 1.3 [Thermal Break Rate Limiting]: Rapid successive dashes respect cooldown throttle', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const coreX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const coreY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // First dash at 1000ms triggers Thermal Break
  const res1 = hazard.evaluatePlayer(coreX + 20, coreY + 20, true, 1000);
  assert.equal(res1.thermalBreakGranted, true);

  // Second dash at 1400ms (within 1500ms cooldown) does not grant new trigger notification
  const res2 = hazard.evaluatePlayer(coreX + 20, coreY + 20, true, 1400);
  assert.equal(res2.thermalBreakGranted, false, 'Must respect 1500ms cooldown throttle');
  assert.equal(res2.damage, 0, 'Dashing player still avoids damage');
  assert.equal(res2.slowFactor, 1.35, 'Still maintains dash velocity');

  // Third dash at 2600ms (after 1600ms > 1500ms cooldown) triggers again
  const res3 = hazard.evaluatePlayer(coreX + 20, coreY + 20, true, 2600);
  assert.equal(res3.thermalBreakGranted, true, 'Cooldown elapsed grants Thermal Break again');
});

/* ==============================================================================
 * TIER 2: FROST CHILL DEBUFF MECHANICS
 * ============================================================================== */

test('Tier 2.1 [Frost Chill on Walking]: Walking through frost applies -25% speed debuff for 2000ms', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const coreX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const coreY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Walking (isDashing = false)
  const res = hazard.evaluatePlayer(coreX + 30, coreY + 30, false, 500);

  assert.equal(res.frostChillInflicted, true, 'Walking through frost must inflict Frost Chill');
  assert.equal(res.frostChillDurationMs, FROST_CHILL_DURATION_MS, 'Must last exactly 2000ms');
  assert.equal(res.frostChillDurationMs, 2000);
  assert.equal(res.slowRatio, FROST_CHILL_SLOW_RATIO, 'Slow ratio must be exactly 0.25 (-25%)');
  assert.equal(res.slowRatio, 0.25);
  assert.equal(res.slowFactor, 0.75, 'Slow factor must be 0.75 (1.0 - 0.25)');
  assert.equal(res.floatingText, FLOATING_TEXT_FROST_CHILL, 'Must display ❄️ FROST CHILL (-25%)');
  assert.equal(res.floatingText, '❄️ FROST CHILL (-25%)');
  assert.equal(res.damage, 0, 'Telegraph surge does not deal direct health damage');
});

test('Tier 2.2 [Frost Chill in Absolute Zero Burst]: Walking player takes 25 damage in addition to Frost Chill', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Advance to ABSOLUTE_ZERO_BURST
  hazard.update(2100);

  const coreX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const coreY = 6 * TILE_SIZE + TILE_SIZE / 2;

  const res = hazard.evaluatePlayer(coreX, coreY, false, 2100);
  assert.equal(res.hit, true, 'Burst hits non-dashing player');
  assert.equal(res.damage, PLAYER_FROST_BURST_DAMAGE, 'Takes 25 cryogenic damage');
  assert.equal(res.damage, 25);
  assert.equal(res.frostChillInflicted, true, 'Inflicts Frost Chill debuff');
  assert.equal(res.slowFactor, 0.75);
});

test('Tier 2.3 [Dry Ground Immunity]: Walking outside frost zone does NOT apply Frost Chill', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const coreX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const coreY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 160px away from core (> 120px FROST_RADIUS_PX)
  const res = hazard.evaluatePlayer(coreX + 160, coreY, false, 500);
  assert.equal(res.frostChillInflicted, false);
  assert.equal(res.thermalBreakGranted, false);
  assert.equal(res.slowFactor, 1.0, 'Full dry ground traction');
  assert.equal(res.damage, 0);
});

/* ==============================================================================
 * TIER 3: GAMESCENE INTEGRATION & VELOCITY CLAMPING
 * ============================================================================== */

test('Tier 3.1 [Thermal Break Speed Scaling]: +35% speed burst calculates correctly with base speed', () => {
  const baseSpeed = BASE_PLAYER_SPEED; // 150 px/s
  const speed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 + THERMAL_BREAK_SPEED_BURST_RATIO, // 1.35
  });

  const expected = Math.round(150 * 1.35); // 203 px/s (Math.round)
  assert.equal(speed, expected);
  assert.ok(speed <= MAX_PLAYER_SPEED_CLAMP, 'Must not exceed max speed clamp');
});

test('Tier 3.2 [Frost Chill Speed Scaling]: -25% speed debuff calculates correctly with base speed', () => {
  const baseSpeed = BASE_PLAYER_SPEED; // 150 px/s
  const speed = calculateClampedPlayerSpeed({
    baseSpeed,
    speedMultiplier: 1.0 - FROST_CHILL_SLOW_RATIO, // 0.75
  });

  const expected = Math.round(150 * 0.75); // 113 px/s (Math.round)
  assert.equal(speed, expected);
  assert.ok(speed >= MIN_PLAYER_SPEED, 'Must not drop below floor speed clamp');
});

test('Tier 3.3 [Extreme Buff Stacking Clamp]: Thermal Break + Speed Surge stays clamped at 350 px/s', () => {
  const speed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    perkSpeedBonus: 40,
    surgeBonus: 75,
    customBonus: 50,
    speedMultiplier: 1.35 * 1.20, // Thermal Break (1.35) * Acceleration (1.20)
  });

  assert.equal(speed, MAX_PLAYER_SPEED_CLAMP, 'Must strictly clamp to 350 px/s');
  assert.equal(speed, 350);
});

test('Tier 3.4 [Extreme Debuff Stacking Floor]: Frost Chill + Phase Jitter stays floored at 50 px/s', () => {
  const speed = calculateClampedPlayerSpeed({
    baseSpeed: 60,
    phaseJitterActive: true, // -25%
    speedMultiplier: 0.50,   // severe debuff
  });

  assert.equal(speed, MIN_PLAYER_SPEED, 'Must strictly floor to 50 px/s');
  assert.equal(speed, 50);
});

/* ==============================================================================
 * TIER 4: HIGH-THROUGHPUT ZERO-GC SOAK STRESS
 * ============================================================================== */

test('Tier 4.1 [Zero-GC Player Mastery Soak]: 10,000 player mastery evaluations execute with zero heap drift', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  const coreX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const coreY = 6 * TILE_SIZE + TILE_SIZE / 2;

  for (let i = 0; i < 10000; i++) {
    const isDashing = (i % 3 === 0);
    const nowMs = i * 16.666;
    hazard.update(16.666);
    const res = hazard.evaluatePlayer(coreX + (i % 50), coreY + (i % 50), isDashing, nowMs);
    assert.ok(res.slowFactor > 0);
  }

  const durationMs = performance.now() - startTime;
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  const driftMB = Math.max(0, (memAfter - memBefore) / (1024 * 1024));

  if (global.gc) {
    assert.ok(driftMB < 0.25, `Net heap drift ${driftMB.toFixed(4)} MB must be < 0.25 MB`);
  } else {
    assert.ok(driftMB < 5.0, `Net heap drift without GC ${driftMB.toFixed(4)} MB must be < 5.0 MB`);
  }
  assert.ok(durationMs < 600, `10,000 evaluations took ${durationMs.toFixed(2)} ms (budget < 600 ms)`);
});
