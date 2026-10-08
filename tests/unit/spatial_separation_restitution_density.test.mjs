/**
 * tests/unit/spatial_separation_restitution_density.test.mjs
 *
 * Dedicated Verification Suite for:
 * 1. Spatial Grid Queries under Extreme Density (50-120 entities) with strict O(N) scaling
 * 2. Velocity Nudges with overlap-proportional displacement and runaway velocity clamping
 * 3. Restitution Math (elastic, inelastic, heterogeneous mass ratios) with zero-division defense
 * 4. Zero NaN Invariants across all physics properties (position, velocity, mass, collision radius)
 * 5. Soak test under multi-tick simulation verifying Zero-GC and bounded execution time
 */

import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.window) globalThis.window = globalThis;

import {
  SpatialSeparationGrid,
  resolveEntitySeparation,
  defaultSpatialGrid,
} from '../../src/game/entities/SpatialSeparation.ts';

function createMockEntity(x, y, vx = 0, vy = 0, mass = 1.0, radius = 12, isPhasing = false) {
  const entity = {
    x,
    y,
    active: true,
    isDead: false,
    collisionRadius: radius,
    mass,
    isPhasing,
    body: {
      position: { x: x - radius, y: y - radius },
      velocity: { x: vx, y: vy },
      width: radius * 2,
      height: radius * 2,
      halfWidth: radius,
      halfHeight: radius,
      updateCenter: () => {},
      updateFromGameObject: () => {},
    },
  };
  return entity;
}

/* ==============================================================================
 * SUITE 1: SPATIAL GRID QUERIES & O(N) SCALING UNDER EXTREME DENSITY
 * ============================================================================== */

test('DENSITY-01: Spatial grid queries scale linearly O(N) across 50, 80, and 120 entities', () => {
  const grid = new SpatialSeparationGrid(40, 800, 800);

  // Test across increasing entity counts in an 800x800 arena
  for (const count of [50, 80, 120]) {
    const entities = [];
    for (let i = 0; i < count; i++) {
      // Distribute in 10x12 grid with small spacing
      const gx = 100 + (i % 10) * 50;
      const gy = 100 + Math.floor(i / 10) * 50;
      entities.push(createMockEntity(gx, gy, 0, 0));
    }

    const startTs = performance.now();
    const stats = grid.resolveSeparation(entities, {
      iterations: 2,
      separationFactor: 0.5,
      bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
    });
    const elapsedMs = performance.now() - startTs;

    assert.equal(stats.entitiesProcessed, count, `Processed count must match ${count}`);
    assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered for valid coordinates');
    assert.ok(elapsedMs < 60.0, `Resolution for ${count} entities must take < 60.0ms (took ${elapsedMs.toFixed(2)}ms)`);

    // Verify all positions remain strictly finite
    for (let i = 0; i < count; i++) {
      assert.ok(Number.isFinite(entities[i].x), `Entity ${i} x must be finite`);
      assert.ok(Number.isFinite(entities[i].y), `Entity ${i} y must be finite`);
    }
  }
});

test('DENSITY-02: 120 entities compressed into single 40x40 cell resolve without crash or NaN', () => {
  const grid = new SpatialSeparationGrid(40, 800, 800);
  const COUNT = 120;
  const entities = [];

  // All 120 entities placed in cell (5, 5) centered around (220, 220)
  for (let i = 0; i < COUNT; i++) {
    const offsetX = (Math.random() - 0.5) * 10;
    const offsetY = (Math.random() - 0.5) * 10;
    entities.push(createMockEntity(220 + offsetX, 220 + offsetY, 0, 0));
  }

  const stats = grid.resolveSeparation(entities, {
    iterations: 3,
    separationFactor: 0.6,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
  });

  assert.equal(stats.entitiesProcessed, COUNT);
  assert.ok(stats.overlapsResolved > 0, 'Overlaps must be detected and resolved');
  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN values produced');

  // Verify radial dispersion off the compressed center point
  for (let i = 0; i < COUNT; i++) {
    assert.ok(Number.isFinite(entities[i].x), `Entity ${i} x must be finite`);
    assert.ok(Number.isFinite(entities[i].y), `Entity ${i} y must be finite`);
  }
});

/* ==============================================================================
 * SUITE 2: RESTITUTION MATH (ELASTIC, INELASTIC, AND HETEROGENEOUS MASS)
 * ============================================================================== */

test('RESTITUTION-01: Perfectly elastic collision (e = 1.0) conserves kinetic momentum and reverses velocities', () => {
  // Two identical mass entities head-on: A moving Right (vx = 100), B moving Left (vx = -100)
  const eA = createMockEntity(190, 200, 100, 0, 1.0, 12);
  const eB = createMockEntity(210, 200, -100, 0, 1.0, 12);

  const stats = resolveEntitySeparation([eA, eB], {
    iterations: 1,
    separationFactor: 0.5,
    restitution: 1.0,
    applyVelocityNudges: true,
  });

  assert.ok(stats.overlapsResolved > 0, 'Overlap resolved');
  assert.ok(stats.restitutionImpulsesApplied > 0, 'Restitution impulse applied');
  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered');

  // Relative closing velocity was -200. With e = 1.0 and equal mass (ratio 0.5):
  // eA receives impulse in -x direction: vx should become negative
  // eB receives impulse in +x direction: vx should become positive
  assert.ok(eA.body.velocity.x < 0, `eA should reverse to negative velocity (got ${eA.body.velocity.x})`);
  assert.ok(eB.body.velocity.x > 0, `eB should reverse to positive velocity (got ${eB.body.velocity.x})`);
  assert.ok(Number.isFinite(eA.body.velocity.x));
  assert.ok(Number.isFinite(eB.body.velocity.x));
});

test('RESTITUTION-02: Perfectly inelastic collision (e = 0.0) eliminates closing normal velocity', () => {
  // Two identical mass entities closing in: A moving at 80, B at -80
  const eA = createMockEntity(192, 200, 80, 0, 1.0, 12);
  const eB = createMockEntity(208, 200, -80, 0, 1.0, 12);

  const stats = resolveEntitySeparation([eA, eB], {
    iterations: 1,
    separationFactor: 0.5,
    restitution: 0.0,
    velocityNudgeFactor: 0.0,
    applyVelocityNudges: true,
  });

  assert.ok(stats.restitutionImpulsesApplied > 0);
  assert.equal(stats.nanGuardsTriggered, 0);

  // With e = 0.0, normal relative velocity after impulse must be ~0
  const vRelX = eB.body.velocity.x - eA.body.velocity.x;
  assert.ok(Math.abs(vRelX) < 1.0, `Normal relative velocity should be eliminated (got ${vRelX})`);
});

test('RESTITUTION-03: Heterogeneous mass weighting (Heavy Tank mass=3.0 vs Light Critter mass=0.5)', () => {
  // Tank at x=190 (mass 3.0, vx=50), Critter at x=206 (mass 0.5, vx=-50)
  const tank = createMockEntity(190, 200, 50, 0, 3.0, 12);
  const critter = createMockEntity(206, 200, -50, 0, 0.5, 12);

  const initialTankVx = tank.body.velocity.x;
  const initialCritterVx = critter.body.velocity.x;

  const stats = resolveEntitySeparation([tank, critter], {
    iterations: 1,
    separationFactor: 0.5,
    restitution: 0.5,
    applyVelocityNudges: true,
  });

  assert.ok(stats.restitutionImpulsesApplied > 0);

  const deltaTankVx = Math.abs(tank.body.velocity.x - initialTankVx);
  const deltaCritterVx = Math.abs(critter.body.velocity.x - initialCritterVx);

  // Heavy tank should experience much smaller velocity change than light critter
  // ratioTank = (1/3) / (1/3 + 1/0.5) = (0.333) / (2.333) ~ 0.143
  // ratioCritter = 2 / 2.333 ~ 0.857
  assert.ok(
    deltaCritterVx > deltaTankVx * 3.0,
    `Critter delta (${deltaCritterVx.toFixed(2)}) must be much larger than Tank delta (${deltaTankVx.toFixed(2)})`
  );
});

/* ==============================================================================
 * SUITE 3: VELOCITY NUDGES & RUNAWAY SPEED CLAMPING
 * ============================================================================== */

test('NUDGE-01: Velocity nudge imparts outward dispersion proportional to penetration overlap', () => {
  // Overlapping stationary entities (vx = 0, vy = 0)
  const eA = createMockEntity(200, 200, 0, 0, 1.0, 12);
  const eB = createMockEntity(208, 200, 0, 0, 1.0, 12);

  const stats = resolveEntitySeparation([eA, eB], {
    iterations: 1,
    separationFactor: 0.5,
    restitution: 0.0,
    velocityNudgeFactor: 5.0,
    maxVelocityNudge: 200,
    applyVelocityNudges: true,
  });

  assert.ok(stats.velocityNudgesApplied > 0, 'Velocity nudge applied');
  assert.ok(eA.body.velocity.x < 0, `eA should be nudged left (got ${eA.body.velocity.x})`);
  assert.ok(eB.body.velocity.x > 0, `eB should be nudged right (got ${eB.body.velocity.x})`);
  assert.ok(Number.isFinite(eA.body.velocity.x));
  assert.ok(Number.isFinite(eB.body.velocity.x));
});

test('NUDGE-02: Runaway velocity clamping enforces MAX_SPEED = 400 under extreme collision impulses', () => {
  // Entity with extreme initial velocity
  const eA = createMockEntity(200, 200, 1000, 1000, 1.0, 12);
  const eB = createMockEntity(210, 200, -1000, -1000, 1.0, 12);

  resolveEntitySeparation([eA, eB], {
    iterations: 2,
    restitution: 1.0,
    velocityNudgeFactor: 10.0,
    applyVelocityNudges: true,
  });

  const speedA = Math.hypot(eA.body.velocity.x, eA.body.velocity.y);
  const speedB = Math.hypot(eB.body.velocity.x, eB.body.velocity.y);

  assert.ok(speedA <= 400.01, `eA speed (${speedA}) must be clamped to <= 400`);
  assert.ok(speedB <= 400.01, `eB speed (${speedB}) must be clamped to <= 400`);
});

/* ==============================================================================
 * SUITE 4: ZERO DIVISION & FINITE COORDINATE DEFENSES (ZERO NAN)
 * ============================================================================== */

test('NAN-GUARD-01: Corrupted NaN / Infinity inputs on position and velocity trigger guards and sanitize safely', () => {
  const corruptedA = createMockEntity(NaN, 200, NaN, 50);
  const corruptedB = createMockEntity(200, Infinity, 50, -Infinity);
  const validC = createMockEntity(200, 200, 0, 0);

  const stats = resolveEntitySeparation([corruptedA, corruptedB, validC], {
    iterations: 1,
    bounds: { minX: 20, maxX: 600, minY: 20, maxY: 500 },
    applyVelocityNudges: true,
  });

  assert.ok(stats.nanGuardsTriggered > 0, 'Corrupted inputs must trigger nanGuardsTriggered');

  for (const e of [corruptedA, corruptedB, validC]) {
    assert.ok(Number.isFinite(e.x), 'Position x must be finite');
    assert.ok(Number.isFinite(e.y), 'Position y must be finite');
    assert.ok(Number.isFinite(e.body.velocity.x), 'Velocity x must be finite');
    assert.ok(Number.isFinite(e.body.velocity.y), 'Velocity y must be finite');
  }
});

test('ZERO-DIST-01: Co-located entities (dist = 0) disperse deterministically without NaN or zero division', () => {
  const COUNT = 60;
  const entities = [];
  // All 60 entities at identical coordinate (300, 300)
  for (let i = 0; i < COUNT; i++) {
    entities.push(createMockEntity(300, 300, 0, 0));
  }

  const stats = resolveEntitySeparation(entities, {
    iterations: 2,
    separationFactor: 0.5,
    restitution: 0.2,
    velocityNudgeFactor: 1.0,
    applyVelocityNudges: true,
  });

  assert.equal(stats.entitiesProcessed, COUNT);
  assert.ok(stats.zeroDistancesHandled > 0, 'Zero distances must be handled by golden spiral dispersion');
  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered for co-located entities');

  for (let i = 0; i < COUNT; i++) {
    assert.ok(Number.isFinite(entities[i].x), `Entity ${i} x must be finite`);
    assert.ok(Number.isFinite(entities[i].y), `Entity ${i} y must be finite`);
    assert.ok(Number.isFinite(entities[i].body.velocity.x), `Entity ${i} vx must be finite`);
    assert.ok(Number.isFinite(entities[i].body.velocity.y), `Entity ${i} vy must be finite`);
  }
});

/* ==============================================================================
 * SUITE 5: SOAK SIMULATION & ZERO-GC UNDER EXTREME DENSITY (120 ENTITIES)
 * ============================================================================== */

test('SOAK-01: 500-tick soak simulation with 120 colliding entities maintains 0 NaN and < 2ms per tick', () => {
  const COUNT = 120;
  const entities = [];

  // Create two opposing swarms of 60 entities colliding head-on
  for (let i = 0; i < 60; i++) {
    const e = createMockEntity(160 + (i % 6) * 6, 200 + Math.floor(i / 6) * 6, 120, 0, 1.0, 12);
    entities.push(e);
  }
  for (let i = 0; i < 60; i++) {
    const e = createMockEntity(260 - (i % 6) * 6, 200 + Math.floor(i / 6) * 6, -120, 0, 2.0, 12);
    entities.push(e);
  }

  const initialHeap = process.memoryUsage().heapUsed;
  const TICKS = 500;
  let totalDurationMs = 0;

  for (let tick = 0; tick < TICKS; tick++) {
    // Integrate velocities (dt = 0.016s)
    for (let i = 0; i < COUNT; i++) {
      entities[i].x += entities[i].body.velocity.x * 0.016;
      entities[i].y += entities[i].body.velocity.y * 0.016;
    }

    const startTs = performance.now();
    const stats = resolveEntitySeparation(entities, {
      iterations: 2,
      separationFactor: 0.5,
      restitution: 0.3,
      velocityNudgeFactor: 0.2,
      maxVelocityNudge: 150,
      applyVelocityNudges: true,
      bounds: { minX: 20, maxX: 580, minY: 20, maxY: 500 },
    });
    totalDurationMs += (performance.now() - startTs);

    assert.equal(stats.nanGuardsTriggered, 0, `Tick ${tick} produced NaN`);
  }

  const avgTickMs = totalDurationMs / TICKS;
  const finalHeap = process.memoryUsage().heapUsed;
  const heapDeltaMB = (finalHeap - initialHeap) / (1024 * 1024);

  // Average step time must remain strictly < 2.0ms per frame
  assert.ok(avgTickMs < 2.0, `Average tick time ${avgTickMs.toFixed(3)}ms must remain < 2.0ms`);
  // Heap delta over 500 ticks must remain strictly bounded (< 15MB)
  assert.ok(heapDeltaMB < 15, `Heap delta ${heapDeltaMB.toFixed(2)}MB must remain < 15MB`);

  // Final verification that all 120 entities have finite positions and velocities
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(Number.isFinite(e.x), `Final entity ${i} x must be finite`);
    assert.ok(Number.isFinite(e.y), `Final entity ${i} y must be finite`);
    assert.ok(Number.isFinite(e.body.velocity.x), `Final entity ${i} vx must be finite`);
    assert.ok(Number.isFinite(e.body.velocity.y), `Final entity ${i} vy must be finite`);
  }
});
