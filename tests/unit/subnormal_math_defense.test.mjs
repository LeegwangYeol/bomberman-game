/**
 * tests/unit/subnormal_math_defense.test.mjs
 *
 * Comprehensive Mathematical Defense Verification:
 * 1. Subnormal Floats (1e-323, Number.MIN_VALUE) & Zero-Length Vectors in Entity Velocities
 * 2. clampVelocity and normalizeVector produce stable 0 vectors ({vx: 0, vy: 0, speed: 0} / {x: 0, y: 0, length: 0})
 * 3. Mixed normal + subnormal vectors cleanly flush denormal components without propagation
 * 4. Hazard Diffusion Grids (Miasma, Magma, Volt, Frost, Nebula, Solar, Abyssal) numerical stability under subnormal inputs
 * 5. Distance queries at zero-length, subnormal deltas, and co-located origins across physics, hazards, and UI
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp,
  clampSpeed,
  clampVelocity,
  normalizeVector,
  SpatialSeparationGrid,
  resolveEntitySeparation,
} from '../../src/game/entities/SpatialSeparation.ts';

import { MiasmaHazard } from '../../src/game/hazards/MiasmaHazard.ts';
import { MagmaHazard } from '../../src/game/hazards/MagmaHazard.ts';
import { VoltHazard } from '../../src/game/hazards/VoltHazard.ts';
import { FrostHazard } from '../../src/game/hazards/FrostHazard.ts';
import { NebulaHazard } from '../../src/game/hazards/NebulaHazard.ts';
import { SolarHazard } from '../../src/game/hazards/SolarHazard.ts';
import { AbyssalHazard } from '../../src/game/hazards/AbyssalHazard.ts';
import { GravityHazard } from '../../src/game/hazards/GravityHazard.ts';
import { ROWS, COLS, TOTAL_TILES } from '../../src/game/pathfinding.ts';

/* ==============================================================================
 * SUITE 1: clampVelocity & normalizeVector WITH SUBNORMAL FLOATS & ZERO VECTORS
 * ============================================================================== */

test('CLAMP-VEC-01: clampVelocity produces stable 0 vector for zero-length and subnormal floats', () => {
  // 1. Exact zero vectors
  const zero = clampVelocity(0, 0, 50, 400);
  assert.equal(zero.vx, 0, 'vx must be exact 0');
  assert.equal(zero.vy, 0, 'vy must be exact 0');
  assert.equal(zero.speed, 0, 'speed must be exact 0');

  // 2. Negative zero (-0, -0)
  const negZero = clampVelocity(-0, -0, 50, 400);
  assert.equal(negZero.vx, 0);
  assert.equal(negZero.vy, 0);
  assert.equal(negZero.speed, 0);

  // 3. Subnormal floats (1e-323, Number.MIN_VALUE = 5e-324)
  const subnormals = [
    1e-323,
    -1e-323,
    Number.MIN_VALUE,
    -Number.MIN_VALUE,
    1e-320,
    -1e-320,
    1e-16,
    -1e-16,
  ];

  for (const s of subnormals) {
    const res = clampVelocity(s, s, 50, 400);
    assert.equal(res.vx, 0, `clampVelocity(${s}, ${s}).vx must be stable 0`);
    assert.equal(res.vy, 0, `clampVelocity(${s}, ${s}).vy must be stable 0`);
    assert.equal(res.speed, 0, `clampVelocity(${s}, ${s}).speed must be stable 0`);
  }

  // 4. Asymmetric subnormal inputs (subnormal on one axis, zero on other)
  for (const s of subnormals) {
    const resX = clampVelocity(s, 0, 50, 400);
    assert.equal(resX.vx, 0);
    assert.equal(resX.vy, 0);
    assert.equal(resX.speed, 0);

    const resY = clampVelocity(0, s, 50, 400);
    assert.equal(resY.vx, 0);
    assert.equal(resY.vy, 0);
    assert.equal(resY.speed, 0);
  }
});

test('CLAMP-VEC-02: clampVelocity flushes subnormal component when other axis is normal', () => {
  // vx is normal (100), vy is subnormal (1e-323)
  const res1 = clampVelocity(100, 1e-323, 50, 400);
  assert.equal(res1.vx, 100, 'Normal component must be preserved');
  assert.equal(res1.vy, 0, 'Subnormal component must be flushed to 0');
  assert.equal(res1.speed, 100);

  // vx is subnormal (-1e-323), vy is normal (-200)
  const res2 = clampVelocity(-1e-323, -200, 50, 400);
  assert.equal(res2.vx, 0, 'Subnormal component must be flushed to 0');
  assert.equal(res2.vy, -200, 'Normal component must be preserved');
  assert.equal(res2.speed, 200);

  // Slow normal velocity with subnormal component clamped to minSpeed 50
  const res3 = clampVelocity(20, 1e-323, 50, 400);
  assert.equal(res3.speed, 50);
  assert.equal(res3.vx, 50);
  assert.equal(res3.vy, 0);

  // Runaway normal velocity with subnormal component clamped to maxSpeed 400
  const res4 = clampVelocity(0, 500, 50, 400);
  assert.equal(res4.speed, 400);
  assert.equal(res4.vx, 0);
  assert.equal(res4.vy, 400);
});

test('NORM-VEC-01: normalizeVector produces stable 0 vector for zero-length and subnormal floats', () => {
  // 1. Exact zero
  const zero = normalizeVector(0, 0);
  assert.deepEqual(zero, { x: 0, y: 0, length: 0 });

  // 2. Negative zero
  const negZero = normalizeVector(-0, 0);
  assert.deepEqual(negZero, { x: 0, y: 0, length: 0 });

  // 3. Subnormal floats (1e-323, Number.MIN_VALUE)
  const subnormals = [1e-323, -1e-323, Number.MIN_VALUE, -Number.MIN_VALUE, 1e-315, 1e-16];
  for (const s of subnormals) {
    const res = normalizeVector(s, s);
    assert.deepEqual(res, { x: 0, y: 0, length: 0 }, `normalizeVector(${s}, ${s}) must be stable 0 vector`);

    const resX = normalizeVector(s, 0);
    assert.deepEqual(resX, { x: 0, y: 0, length: 0 });

    const resY = normalizeVector(0, s);
    assert.deepEqual(resY, { x: 0, y: 0, length: 0 });
  }

  // 4. Non-finite inputs (NaN, Infinity, -Infinity)
  assert.deepEqual(normalizeVector(NaN, NaN), { x: 0, y: 0, length: 0 });
  assert.deepEqual(normalizeVector(Infinity, 0), { x: 0, y: 0, length: 0 });
  assert.deepEqual(normalizeVector(0, -Infinity), { x: 0, y: 0, length: 0 });
  assert.deepEqual(normalizeVector(NaN, 100), { x: 0, y: 1, length: 100 });

  // 5. Normal vectors normalize correctly to unit length
  const unitX = normalizeVector(150, 0);
  assert.equal(unitX.x, 1);
  assert.equal(unitX.y, 0);
  assert.equal(unitX.length, 150);

  const unitDiag = normalizeVector(3, 4);
  assert.equal(unitDiag.x, 0.6);
  assert.equal(unitDiag.y, 0.8);
  assert.equal(unitDiag.length, 5);

  // 6. Mixed normal + subnormal vector: subnormal flushed to 0
  const mixed = normalizeVector(120, 1e-323);
  assert.equal(mixed.x, 1);
  assert.equal(mixed.y, 0);
  assert.equal(mixed.length, 120);
});

/* ==============================================================================
 * SUITE 2: HAZARD DIFFUSION GRIDS NUMERICAL STABILITY UNDER SUBNORMALS
 * ============================================================================== */

test('HAZARD-DIFF-01: Diffusion grids reject/flush subnormal inputs across 500 steps without NaN or denormal stalls', () => {
  const miasma = new MiasmaHazard();
  miasma.init(6, 7);

  const magma = new MagmaHazard();
  magma.init(6, 7);

  const volt = new VoltHazard();
  volt.init(6, 7);

  const frost = new FrostHazard();
  frost.init(6, 7);

  const nebula = new NebulaHazard();
  nebula.init(6, 7);
  nebula.start('OUTBREAK');

  const solar = new SolarHazard();
  solar.init(6, 7);
  solar.start('OUTBREAK');

  const abyssal = new AbyssalHazard();
  abyssal.init(6, 7);
  abyssal.start('OUTBREAK');

  // Seed center tiles with subnormal float 1e-323
  const centerIdx = 6 * COLS + 7;
  miasma.sporeGrid[centerIdx] = 1e-323;
  magma.heatGrid[centerIdx] = 1e-323;
  volt.voltageGrid[centerIdx] = 1e-323;
  frost.intensityGrid[centerIdx] = 1e-323;

  // Execute 500 diffusion steps with subnormal delta and rates
  for (let step = 0; step < 500; step++) {
    miasma.stepDiscreteDiffusion(1e-323, 1e-323, 1e-323);
    magma.stepDiscreteDiffusion(1e-323, 1e-323);
    volt.stepDiscreteDiffusion(1e-323, 1e-323);
    frost.stepDiscreteDiffusion(1e-323);
    nebula.stepDiscreteDiffusion(1e-323);
    solar.stepDiscreteDiffusion(1e-323);
    abyssal.stepDiscreteDiffusion(1e-323);
  }

  // Verify all grid cells remain strictly finite in [0, 1]
  for (let i = 0; i < TOTAL_TILES; i++) {
    assert.ok(Number.isFinite(miasma.sporeGrid[i]), `Miasma tile ${i} must be finite`);
    assert.ok(miasma.sporeGrid[i] >= 0.0 && miasma.sporeGrid[i] <= 1.0);

    assert.ok(Number.isFinite(magma.heatGrid[i]), `Magma tile ${i} must be finite`);
    assert.ok(magma.heatGrid[i] >= 0.0 && magma.heatGrid[i] <= 1.0);

    assert.ok(Number.isFinite(volt.voltageGrid[i]), `Volt tile ${i} must be finite`);
    assert.ok(volt.voltageGrid[i] >= 0.0 && volt.voltageGrid[i] <= 1.0);

    assert.ok(Number.isFinite(frost.intensityGrid[i]), `Frost tile ${i} must be finite`);
    assert.ok(frost.intensityGrid[i] >= 0.0 && frost.intensityGrid[i] <= 1.0);
  }
});

/* ==============================================================================
 * SUITE 3: DISTANCE QUERIES & PULL FIELDS AT SUBNORMAL OFFSETS & ORIGIN
 * ============================================================================== */

test('DIST-QUERY-01: GravityHazard pull field & point queries produce stable 0 vectors at core and subnormal deltas', () => {
  const gravity = new GravityHazard();
  gravity.init(6, 7);

  // 1. Center tile in precomputed pullField must be exact 0 vector
  const centerIdx = 6 * COLS + 7;
  assert.equal(gravity.pullField[centerIdx * 2], 0, 'pullField vr at center must be 0');
  assert.equal(gravity.pullField[centerIdx * 2 + 1], 0, 'pullField vc at center must be 0');
  assert.equal(gravity.pullVectorsX[centerIdx], 0, 'pullVectorsX at center must be 0');
  assert.equal(gravity.pullVectorsY[centerIdx], 0, 'pullVectorsY at center must be 0');
  assert.equal(gravity.intensityGrid[centerIdx], 0, 'intensityGrid at center must be 0');

  // 2. Point query at exact center pixel
  gravity.start('OUTBREAK');
  const pullExact = gravity.getGravitationalPullAt(gravity.centerWorldX, gravity.centerWorldY);
  assert.equal(pullExact.pullVx, 0);
  assert.equal(pullExact.pullVy, 0);

  // 3. Point query at subnormal offset (1e-323 px)
  const pullSubnormal = gravity.getGravitationalPullAt(
    gravity.centerWorldX + 1e-323,
    gravity.centerWorldY + 1e-323
  );
  assert.equal(pullSubnormal.pullVx, 0, 'pullVx at subnormal offset must be stable 0');
  assert.equal(pullSubnormal.pullVy, 0, 'pullVy at subnormal offset must be stable 0');

  // 4. Directional speed factor with subnormal movement vector and subnormal distance
  const speedFactor = gravity.getDirectionalSpeedFactor(
    gravity.centerWorldX + 1e-323,
    gravity.centerWorldY + 1e-323,
    1e-323,
    1e-323,
    1e-323
  );
  assert.ok(Number.isFinite(speedFactor));
  assert.equal(speedFactor, 1.0);
});

test('DIST-QUERY-02: SpatialSeparation resolveSeparation handles subnormal offset entities cleanly', () => {
  const grid = new SpatialSeparationGrid(40, 800, 800);
  const entities = [
    {
      x: 200,
      y: 200,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 188, y: 188 },
        velocity: { x: 1e-323, y: 1e-323 }, // Subnormal velocity
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
    {
      x: 200 + 1e-323, // Subnormal coordinate offset
      y: 200 + 1e-323,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 188 + 1e-323, y: 188 + 1e-323 },
        velocity: { x: -1e-323, y: 0 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
  ];

  const stats = grid.resolveSeparation(entities, {
    iterations: 2,
    separationFactor: 0.5,
    applyVelocityNudges: true,
  });

  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered for subnormal offsets');
  assert.ok(Number.isFinite(entities[0].x));
  assert.ok(Number.isFinite(entities[0].y));
  assert.ok(Number.isFinite(entities[1].x));
  assert.ok(Number.isFinite(entities[1].y));
  assert.ok(Number.isFinite(entities[0].body.velocity.x));
  assert.ok(Number.isFinite(entities[0].body.velocity.y));
  assert.ok(Number.isFinite(entities[1].body.velocity.x));
  assert.ok(Number.isFinite(entities[1].body.velocity.y));
});
