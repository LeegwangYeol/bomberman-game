/**
 * tests/creative_5_slingshot_dash.test.mjs
 *
 * Verification Suite for Creative Agent 5:
 * Gravitational Escape Velocity & Slingshot Dash Mechanics
 *
 * Test Coverage:
 * - Tier 1: Kinetic Vector Equations & Directional Navigation (+20% toward, -25% away)
 * - Tier 2: Gravitational Escape Velocity upon Dash (1200ms invuln, +35% speed burst, floating text)
 * - Tier 3: Clamp Invariants & Anti-Tunneling Proofs [50, 350] px/s
 * - Tier 4: Edge Cases, Cooldown Throttling & Invariant Preservation
 * - Tier 5: High-Throughput Zero-GC 10,000-Iteration Soak Verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GravityHazard,
  GravityLifecycleState,
  PLAYER_GRAVITY_PULL_RATIO,
  PLAYER_GRAVITY_DRAG_RATIO,
  ESCAPE_VELOCITY_INVULN_MS,
  ESCAPE_VELOCITY_SPEED_BURST_RATIO,
  FLOATING_TEXT_GRAVITATIONAL_ESCAPE,
  SINGULARITY_BURST_PLAYER_DMG,
} from '../src/game/hazards/GravityHazard.ts';

import {
  calculateClampedPlayerSpeed,
  MIN_PLAYER_SPEED,
  MAX_PLAYER_SPEED_CLAMP,
  BASE_PLAYER_SPEED,
} from '../src/game/gameplay_mechanics.ts';

import { TILE_SIZE } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * TIER 1: KINETIC VECTOR EQUATIONS & DIRECTIONAL NAVIGATION
 * ============================================================================== */

test('Tier 1 [Kinetic Equations]: Moving towards singularity core receives +20% pull acceleration', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2; // 300px
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2; // 260px

  // 1. Player East of core (360px), moving West (-1, 0) towards core
  const resWest = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000, -1, 0);
  assert.equal(resWest.damage, 0);
  assert.equal(resWest.slowFactor, 1.0 + PLAYER_GRAVITY_PULL_RATIO, 'Moving towards core must grant +20% pull acceleration (1.20)');
  assert.equal(resWest.slowFactor, 1.20);
  assert.equal(resWest.isEscaping, false);

  // 2. Player North of core (200px), moving South (0, 1) towards core
  const resSouth = hazard.evaluatePlayer(corePxX, corePxY - 60, false, 1000, 0, 1);
  assert.equal(resSouth.slowFactor, 1.20, 'Moving South towards core must grant +20% pull acceleration');

  // 3. Player West of core (240px), moving East (1, 0) towards core
  const resEast = hazard.evaluatePlayer(corePxX - 60, corePxY, false, 1000, 1, 0);
  assert.equal(resEast.slowFactor, 1.20, 'Moving East towards core must grant +20% pull acceleration');

  // 4. Player South of core (320px), moving North (0, -1) towards core
  const resNorth = hazard.evaluatePlayer(corePxX, corePxY + 60, false, 1000, 0, -1);
  assert.equal(resNorth.slowFactor, 1.20, 'Moving North towards core must grant +20% pull acceleration');

  // 5. Diagonal movement towards core: Player at (+40, +40), moving (-1, -1)
  const resDiagIn = hazard.evaluatePlayer(corePxX + 40, corePxY + 40, false, 1000, -1, -1);
  assert.equal(resDiagIn.slowFactor, 1.20, 'Diagonal inward movement must grant +20% pull acceleration');
});

test('Tier 1 [Kinetic Equations]: Moving away from singularity core experiences -25% gravitational drag', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. Player East of core (360px), moving East (+1, 0) away from core
  const resEast = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000, 1, 0);
  assert.equal(resEast.damage, 0);
  assert.equal(resEast.slowFactor, 1.0 - PLAYER_GRAVITY_DRAG_RATIO, 'Moving away from core must inflict -25% drag (0.75)');
  assert.equal(resEast.slowFactor, 0.75);

  // 2. Player North of core (200px), moving North (0, -1) away from core
  const resNorth = hazard.evaluatePlayer(corePxX, corePxY - 60, false, 1000, 0, -1);
  assert.equal(resNorth.slowFactor, 0.75, 'Moving North away from core must inflict -25% drag');

  // 3. Player West of core (240px), moving West (-1, 0) away from core
  const resWest = hazard.evaluatePlayer(corePxX - 60, corePxY, false, 1000, -1, 0);
  assert.equal(resWest.slowFactor, 0.75, 'Moving West away from core must inflict -25% drag');

  // 4. Player South of core (320px), moving South (0, 1) away from core
  const resSouth = hazard.evaluatePlayer(corePxX, corePxY + 60, false, 1000, 0, 1);
  assert.equal(resSouth.slowFactor, 0.75, 'Moving South away from core must inflict -25% drag');

  // 5. Diagonal movement away from core: Player at (+40, +40), moving (+1, +1)
  const resDiagOut = hazard.evaluatePlayer(corePxX + 40, corePxY + 40, false, 1000, 1, 1);
  assert.equal(resDiagOut.slowFactor, 0.75, 'Diagonal outward movement must inflict -25% drag');
});

test('Tier 1 [Kinetic Equations]: Tangential and stationary states behave with deterministic physics', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. Tangential movement: Player East of core moving North (0, -1) (orthogonal to radial vector)
  const resTangent = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000, 0, -1);
  assert.equal(resTangent.slowFactor, 1.0, 'Pure tangential movement must have neutral modifier (1.0)');

  // 2. Stationary resistance: Player East of core with zero input (0, 0)
  const resStationary = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000, 0, 0);
  assert.equal(resStationary.slowFactor, 0.75, 'Stationary resistance in accretion field receives default drag (0.75)');

  // 3. Player completely outside pull field (> 120px away)
  const resOutside = hazard.evaluatePlayer(corePxX + 160, corePxY, false, 1000, 1, 0);
  assert.equal(resOutside.slowFactor, 1.0, 'Player outside pull field receives 1.0 modifier');
  assert.equal(resOutside.pullVx, 0);
  assert.equal(resOutside.pullVy, 0);
});

/* ==============================================================================
 * TIER 2: GRAVITATIONAL ESCAPE VELOCITY & SLINGSHOT DASH
 * ============================================================================== */

test('Tier 2 [Gravitational Escape]: Dashing inside pull field breaks escape velocity with complete rewards', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Player dashing inside accretion field
  const resDash = hazard.evaluatePlayer(corePxX + 60, corePxY, true, 2000, -1, 0);
  assert.equal(resDash.isEscaping, true, 'Dashing player must break escape velocity');
  assert.equal(resDash.slingshotGranted, true, 'Slingshot granted must be true');
  assert.equal(resDash.slingshotDurationMs, ESCAPE_VELOCITY_INVULN_MS, 'Must grant exactly 1200ms invulnerability');
  assert.equal(resDash.slingshotDurationMs, 1200);
  assert.equal(resDash.speedBoostRatio, ESCAPE_VELOCITY_SPEED_BURST_RATIO, 'Must grant exactly +35% speed burst ratio');
  assert.equal(resDash.speedBoostRatio, 0.35);
  assert.equal(resDash.slowFactor, 1.35, 'SlowFactor must reflect +35% speed boost (1.35)');
  assert.equal(resDash.floatingText, FLOATING_TEXT_GRAVITATIONAL_ESCAPE, 'Floating text must be ✦ GRAVITATIONAL ESCAPE!');
  assert.equal(resDash.damage, 0);
  assert.equal(resDash.isCrushed, false);
});

test('Tier 2 [Singularity Burst Invariance]: Dashing player survives lethal singularity core event horizon', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Advance to SINGULARITY_BURST state
  hazard.update(2001);
  assert.equal(hazard.state, GravityLifecycleState.SINGULARITY_BURST);

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. Non-dashing player at core: takes 30 crushing damage
  const resNonDashing = hazard.evaluatePlayer(corePxX + 5, corePxY + 5, false, 2500, 0, 0);
  assert.equal(resNonDashing.hit, true);
  assert.equal(resNonDashing.damage, SINGULARITY_BURST_PLAYER_DMG);
  assert.equal(resNonDashing.damage, 30);
  assert.equal(resNonDashing.isCrushed, true);

  // 2. Dashing player at core: breaks escape velocity, suffers 0 damage
  const resDashing = hazard.evaluatePlayer(corePxX + 5, corePxY + 5, true, 4500, -1, 0);
  assert.equal(resDashing.hit, false, 'Dashing player must NOT be hit');
  assert.equal(resDashing.damage, 0, 'Dashing player takes 0 damage in core');
  assert.equal(resDashing.isCrushed, false);
  assert.equal(resDashing.isEscaping, true);
  assert.equal(resDashing.slingshotGranted, true);
  assert.equal(resDashing.slingshotDurationMs, 1200);
  assert.equal(resDashing.speedBoostRatio, 0.35);
  assert.equal(resDashing.floatingText, FLOATING_TEXT_GRAVITATIONAL_ESCAPE);
});

/* ==============================================================================
 * TIER 3: CLAMP INVARIANTS & VELOCITY BOUNDARY PROOFS [50, 350] PX/S
 * ============================================================================== */

test('Tier 3 [Max Velocity Clamp]: Even with maximum buffs, speed never exceeds 350 px/s clamp', () => {
  // Extreme Stacking Scenario:
  // Base Speed: 150 px/s
  // Perk Bonus: +40 px/s
  // Speed Surge: +75 px/s
  // Custom Bonus: +50 px/s
  // Speed Multiplier: 1.20 (+20% pull acceleration) * 1.35 (+35% escape burst) = 1.62x
  // Raw unconstrained speed = (150 + 40 + 75 + 50) * 1.62 = 508.68 px/s
  const speed = calculateClampedPlayerSpeed({
    baseSpeed: BASE_PLAYER_SPEED, // 150
    perkSpeedBonus: 40,
    surgeBonus: 75,
    customBonus: 50,
    speedMultiplier: 1.20 * 1.35,
  });

  assert.equal(speed, MAX_PLAYER_SPEED_CLAMP, `Speed must be strictly clamped to MAX_PLAYER_SPEED_CLAMP (350), got ${speed}`);
  assert.equal(speed, 350);

  // Verify anti-tunneling displacement invariant at 60 FPS (dt = 16.67ms)
  const maxDisplacementPerFrame = speed * (1 / 60);
  assert.ok(
    maxDisplacementPerFrame < TILE_SIZE / 4,
    `Max displacement per frame ${maxDisplacementPerFrame.toFixed(2)}px must be < 10px (Tile Size / 4 = 10px) to prevent collider tunneling`
  );
});

test('Tier 3 [Min Velocity Floor Clamp]: Even with maximum debuffs, speed never drops below 50 px/s floor', () => {
  // Extreme Debuff Scenario:
  // Base Speed: 150 px/s
  // Phase Jitter active: -25% (0.75x)
  // Gravitational Drag: -25% (0.75x)
  // Floor Hazard Slowdown: 90% (0.10x)
  // Raw unconstrained speed = 150 * 0.75 * 0.75 * 0.10 = 8.4375 px/s
  const speed = calculateClampedPlayerSpeed({
    baseSpeed: BASE_PLAYER_SPEED, // 150
    phaseJitterActive: true,
    speedMultiplier: 0.75, // Gravitational drag
    slowdownRatio: 0.90,    // Heavy floor hazard
  });

  assert.equal(speed, MIN_PLAYER_SPEED, `Speed must be strictly clamped to MIN_PLAYER_SPEED (50), got ${speed}`);
  assert.equal(speed, 50);
});

test('Tier 3 [Input Sanitization]: calculateClampedPlayerSpeed rejects corrupt inputs safely', () => {
  assert.equal(calculateClampedPlayerSpeed(null), BASE_PLAYER_SPEED);
  assert.equal(calculateClampedPlayerSpeed(undefined), BASE_PLAYER_SPEED);
  assert.equal(calculateClampedPlayerSpeed({ baseSpeed: NaN }), BASE_PLAYER_SPEED);
  assert.equal(calculateClampedPlayerSpeed({ baseSpeed: -999 }), MIN_PLAYER_SPEED);
  assert.equal(calculateClampedPlayerSpeed({ baseSpeed: Infinity }), BASE_PLAYER_SPEED);
  assert.equal(calculateClampedPlayerSpeed({ speedMultiplier: NaN }), BASE_PLAYER_SPEED);
});

/* ==============================================================================
 * TIER 4: COOLDOWN THROTTLING & RE-ENTRANCY SAFETY
 * ============================================================================== */

test('Tier 4 [Cooldown Throttling]: Gravitational Escape cannot trigger repeatedly within 1500ms cooldown window', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. First Dash at T = 1000ms: Triggers escape
  const res1 = hazard.evaluatePlayer(corePxX + 60, corePxY, true, 1000, -1, 0);
  assert.equal(res1.isEscaping, true);
  assert.equal(res1.floatingText, FLOATING_TEXT_GRAVITATIONAL_ESCAPE);

  // 2. Second Dash at T = 1500ms (500ms later < 1500ms cooldown): Does NOT re-trigger escape
  const res2 = hazard.evaluatePlayer(corePxX + 60, corePxY, true, 1500, -1, 0);
  assert.equal(res2.isEscaping, false, 'Must not re-trigger escape within cooldown window');

  // 3. Third Dash at T = 2600ms (1600ms later >= 1500ms cooldown): Successfully triggers escape again
  const res3 = hazard.evaluatePlayer(corePxX + 60, corePxY, true, 2600, -1, 0);
  assert.equal(res3.isEscaping, true, 'Must re-trigger escape after cooldown expires');
});

test('Tier 4 [Lifecycle Suppression]: DORMANT and COOLDOWN states apply zero pull and zero drag', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. DORMANT state
  assert.equal(hazard.state, GravityLifecycleState.DORMANT);
  const resDormant = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000, 1, 0);
  assert.equal(resDormant.slowFactor, 1.0, 'DORMANT hazard must apply 1.0 modifier');
  assert.equal(resDormant.pullVx, 0);
  assert.equal(resDormant.pullVy, 0);

  // 2. COOLDOWN state
  hazard.start('OUTBREAK');
  hazard.update(2000); // Advance to SINGULARITY_BURST
  hazard.update(350);  // Advance into COOLDOWN
  assert.equal(hazard.state, GravityLifecycleState.COOLDOWN);
  const resCooldown = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 5000, 1, 0);
  assert.equal(resCooldown.slowFactor, 1.0, 'COOLDOWN hazard must apply 1.0 modifier');
  assert.equal(resCooldown.pullVx, 0);
  assert.equal(resCooldown.pullVy, 0);
});

/* ==============================================================================
 * TIER 5: ZERO-GC 10,000-ITERATION SOAK STRESS
 * ============================================================================== */

test('Tier 5 [Zero-GC Soak Stress]: 10,000 player navigation iterations execute with zero heap drift', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const ITERATIONS = 10000;
  for (let i = 0; i < ITERATIONS; i++) {
    // Alternate movement directions
    const dirX = (i % 3 === 0) ? -1 : (i % 3 === 1) ? 1 : 0;
    const dirY = (i % 4 === 0) ? -1 : (i % 4 === 1) ? 1 : 0;
    const isDashing = (i % 20 === 0);
    const nowMs = i * 16;

    hazard.evaluatePlayer(
      corePxX + (i % 60) - 30,
      corePxY + (i % 60) - 30,
      isDashing,
      nowMs,
      dirX,
      dirY
    );
  }

  const durationMs = performance.now() - t0;
  if (isGcExposed) global.gc();
  const memAfter = process.memoryUsage().heapUsed;

  const heapDriftMB = (memAfter - memBefore) / (1024 * 1024);
  if (isGcExposed) {
    assert.ok(
      heapDriftMB < 0.25,
      `Zero-GC heap drift ${heapDriftMB.toFixed(4)} MB must be strictly < 0.25 MB`
    );
  } else {
    assert.ok(
      heapDriftMB < 5.0,
      `Ambient heap drift ${heapDriftMB.toFixed(4)} MB must remain tightly bounded`
    );
  }

  assert.ok(
    durationMs < 100,
    `10,000 navigation evaluations must complete in < 100ms (took ${durationMs.toFixed(2)}ms)`
  );
});
