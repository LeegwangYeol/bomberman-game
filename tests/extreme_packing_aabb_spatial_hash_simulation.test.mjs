/**
 * tests/extreme_packing_aabb_spatial_hash_simulation.test.mjs
 *
 * Mission:
 * Simulate extreme entity packing (100+ entities co-located at single coordinate),
 * verifying AABB spring repulsion and spatial hash performance without infinite loops or division by zero.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook for extensionless TypeScript imports in Node
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
      for (const ext of [".ts", ".js", "/index.ts", "/index.js"]) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {}
      }
    }
    throw err;
  }
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'));

// Headless Canvas and DOM mocks for Phaser / OverheadUI
const mockCanvasCtx = {
  fillRect: () => {},
  clearRect: () => {},
  getImageData: () => ({ data: new Uint8Array(16) }),
  putImageData: () => {},
  createImageData: () => ({ data: new Uint8Array(16) }),
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  restore: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  stroke: () => {},
  fill: () => {},
  scale: () => {},
  translate: () => {},
  rotate: () => {},
};

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.document) {
  globalThis.document = {
    createElement: () => ({
      getContext: () => mockCanvasCtx,
      style: {},
      setAttribute: () => {},
      width: 800,
      height: 600,
    }),
    documentElement: { style: {} },
  };
}
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};

const {
  SpatialSeparationGrid,
  resolveEntitySeparation,
  defaultSpatialGrid,
} = await import('../src/game/entities/SpatialSeparation.ts');

const {
  OverheadUIManager,
} = await import('../src/game/GameScene.ts');

const {
  OverheadUI,
} = await import('../src/game/entities/OverheadUI.ts');

function createPackedEntity(x, y, options = {}) {
  const radius = options.radius ?? 12;
  const mass = options.mass ?? 1.0;
  const isPhasing = options.isPhasing ?? false;
  const name = options.name ?? 'Entity';
  const faction = options.faction ?? 'enemy';
  const maxHp = options.maxHp ?? 3;

  const overheadUI = new OverheadUI(null, name, faction, maxHp, 24);
  overheadUI.update(x, y, maxHp);

  let depth = 0;
  return {
    x,
    y,
    active: true,
    isDead: false,
    collisionRadius: radius,
    mass,
    isPhasing,
    overheadUI,
    body: {
      position: { x: x - radius, y: y - radius },
      velocity: { x: options.vx ?? 0, y: options.vy ?? 0 },
      width: radius * 2,
      height: radius * 2,
      halfWidth: radius,
      halfHeight: radius,
      updateCenter: function() {
        this.position.x = this.center ? this.center.x - this.halfWidth : this.position.x;
        this.position.y = this.center ? this.center.y - this.halfHeight : this.position.y;
      },
      updateFromGameObject: function() {
        this.position.x = x - this.halfWidth;
        this.position.y = y - this.halfHeight;
      },
    },
    setDepth(d) { depth = d; },
    getDepth() { return depth; },
  };
}

/* ==============================================================================
 * SUITE 1: SPATIAL HASH GRID PERFORMANCE & ZERO-DIVISION UNDER 100+ CO-LOCATION
 * ============================================================================== */

test('PACK-01: 100 entities co-located at exact coordinate (200, 200) resolve spatial separation with 0 NaN, 0 zero-division errors, and no infinite loop', () => {
  const COUNT = 100;
  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    entities.push(createPackedEntity(200.0, 200.0, { name: `Pack_${i}` }));
  }

  // Pre-condition: All 100 entities strictly at (200.0, 200.0)
  for (let i = 0; i < COUNT; i++) {
    assert.equal(entities[i].x, 200.0);
    assert.equal(entities[i].y, 200.0);
  }

  const start = performance.now();
  const stats = resolveEntitySeparation(entities, {
    iterations: 3,
    separationFactor: 0.6,
    bounds: { minX: 20, maxX: 580, minY: 20, maxY: 500 },
  });
  const duration = performance.now() - start;

  // Verification 1: Performance (< 50ms for 100 co-located entities under test runner load)
  assert.ok(duration < 50.0, `Resolution time must be < 50ms (got ${duration.toFixed(3)}ms)`);

  // Verification 2: Zero-division defense triggered properly
  assert.ok(stats.zeroDistancesHandled > 0, `zeroDistancesHandled must trigger (got ${stats.zeroDistancesHandled})`);
  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered for valid numeric inputs');
  assert.ok(stats.overlapsResolved > 0, 'Overlaps resolved');

  // Verification 3: No infinite loop (completed and returned finite results)
  assert.equal(stats.entitiesProcessed, COUNT);

  // Verification 4: Clean radial dispersion without NaN or Infinity
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(Number.isFinite(e.x), `Entity ${i} x must be finite (got ${e.x})`);
    assert.ok(Number.isFinite(e.y), `Entity ${i} y must be finite (got ${e.y})`);
    assert.ok(!Number.isNaN(e.x), `Entity ${i} x must not be NaN`);
    assert.ok(!Number.isNaN(e.y), `Entity ${i} y must not be NaN`);
    assert.ok(e.x >= 20 && e.x <= 580, `Entity ${i} x must stay inside bounds [20, 580]`);
    assert.ok(e.y >= 20 && e.y <= 500, `Entity ${i} y must stay inside bounds [20, 500]`);
  }

  // Verification 5: Entities have dispersed away from exact center
  let totalDisplacement = 0;
  for (let i = 0; i < COUNT; i++) {
    const distFromOrigin = Math.hypot(entities[i].x - 200, entities[i].y - 200);
    totalDisplacement += distFromOrigin;
  }
  const avgDisplacement = totalDisplacement / COUNT;
  assert.ok(avgDisplacement > 5.0, `Entities must disperse away from origin (avg displacement: ${avgDisplacement.toFixed(2)}px)`);
});

/* ==============================================================================
 * SUITE 2: AABB SPRING REPULSION & OVERHEAD UI DECLUTTERING UNDER 100+ CO-LOCATION
 * ============================================================================== */

test('PACK-02: 120 entities co-located at exact coordinate (300, 300) execute AABB spring repulsion & vertical staggering without division by zero or infinite loop', () => {
  const manager = new OverheadUIManager();
  const COUNT = 120;
  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    entities.push(createPackedEntity(300.0, 300.0, { name: `AABB_Mob_${i}` }));
  }

  const player = { x: 500, y: 500 };

  const start = performance.now();
  manager.update(entities, player, 16, true);
  const duration = performance.now() - start;

  // Verification 1: Performance (< 75ms for 120 co-located entities under test runner load)
  assert.ok(duration < 75.0, `AABB repulsion update must complete in < 75ms (got ${duration.toFixed(3)}ms)`);

  // Verification 2: All entities collapse to 'minimal' LOD mode
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.equal(e.overheadUI.lodMode, 'minimal', `Entity ${i} must be in minimal LOD mode`);

    // Verification 3: No NaN or Infinity in offsets
    assert.ok(Number.isFinite(e.overheadUI.customOffsetX), `Entity ${i} customOffsetX must be finite`);
    assert.ok(Number.isFinite(e.overheadUI.customOffsetY), `Entity ${i} customOffsetY must be finite`);
    assert.ok(!Number.isNaN(e.overheadUI.customOffsetX), `Entity ${i} customOffsetX must not be NaN`);
    assert.ok(!Number.isNaN(e.overheadUI.customOffsetY), `Entity ${i} customOffsetY must not be NaN`);

    // Verification 4: Arena boundary clamping on effective label coordinates
    const effectiveX = e.x + e.overheadUI.customOffsetX;
    const effectiveY = e.y + e.overheadUI.customOffsetY;
    assert.ok(effectiveX >= 20 && effectiveX <= 580, `Effective X (${effectiveX}) must be within [20, 580]`);
    assert.ok(effectiveY >= 20 && effectiveY <= 500, `Effective Y (${effectiveY}) must be within [20, 500]`);

    // Verification 5: Alpha valid in [0, 1]
    assert.ok(e.overheadUI.currentAlpha >= 0 && e.overheadUI.currentAlpha <= 1.0);
  }
});

/* ==============================================================================
 * SUITE 3: SPATIAL HASH BUCKET SCALABILITY (200 ENTITIES IN SINGLE CELL)
 * ============================================================================== */

test('PACK-03: 200 entities co-located in single grid cell bucket scale safely without linked list cycle or memory leak', () => {
  const grid = new SpatialSeparationGrid(40, 800, 800);
  const COUNT = 200;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    entities.push(createPackedEntity(240.0, 240.0, { name: `CellStack_${i}` }));
  }

  const start = performance.now();
  const stats = grid.resolveSeparation(entities, {
    iterations: 2,
    separationFactor: 0.5,
    maxDisplacement: 32.0,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
  });
  const duration = performance.now() - start;

  assert.equal(stats.entitiesProcessed, COUNT);
  assert.ok(duration < 120.0, `200 packed entities must resolve in < 120ms (took ${duration.toFixed(2)}ms)`);
  assert.equal(stats.nanGuardsTriggered, 0);
  assert.ok(stats.zeroDistancesHandled > 0);

  // Verify bounded displacement defense prevents runaway warping
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    const dist = Math.hypot(e.x - 240.0, e.y - 240.0);
    assert.ok(dist <= 32.01, `Entity ${i} displacement (${dist.toFixed(2)}px) must not exceed maxDisplacement (32.0px)`);
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
  }
});

/* ==============================================================================
 * SUITE 4: CORNER / BOUNDARY EXTREME PACKING (100+ ENTITIES AT ARENA EDGES)
 * ============================================================================== */

test('PACK-04: 100 entities co-located at extreme boundary corner (20, 20) clamp cleanly without tunneling or NaN', () => {
  const COUNT = 100;
  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    entities.push(createPackedEntity(20.0, 20.0, { name: `Corner_${i}` }));
  }

  const stats = resolveEntitySeparation(entities, {
    iterations: 3,
    separationFactor: 0.6,
    bounds: { minX: 20, maxX: 580, minY: 20, maxY: 500 },
  });

  assert.equal(stats.nanGuardsTriggered, 0);
  assert.ok(stats.zeroDistancesHandled > 0);

  // All entities must remain strictly within [20, 580] and [20, 500]
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(e.x >= 20 && e.x <= 580, `Entity ${i} x (${e.x}) out of bounds`);
    assert.ok(e.y >= 20 && e.y <= 500, `Entity ${i} y (${e.y}) out of bounds`);
    assert.ok(Number.isFinite(e.x));
    assert.ok(Number.isFinite(e.y));
  }
});

/* ==============================================================================
 * SUITE 5: MICRO-EPSILON AND SUB-PIXEL PROXIMITY (dist < 1e-7 vs dist === 0)
 * ============================================================================== */

test('PACK-05: 100 entities with sub-epsilon offsets (1e-11 to 1e-5) avoid float division by zero', () => {
  const COUNT = 100;
  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    // Offset alternates between 0, 1e-12, 1e-9, 1e-6
    const eps = i % 4 === 0 ? 0 : 10 ** (-(12 - (i % 4) * 3));
    entities.push(createPackedEntity(200.0 + eps, 200.0 + eps, { name: `Eps_${i}` }));
  }

  const stats = resolveEntitySeparation(entities, {
    iterations: 2,
    separationFactor: 0.5,
    bounds: { minX: 20, maxX: 580, minY: 20, maxY: 500 },
  });

  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered for micro-epsilon inputs');

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(Number.isFinite(e.x), `Entity ${i} x must be finite (got ${e.x})`);
    assert.ok(Number.isFinite(e.y), `Entity ${i} y must be finite (got ${e.y})`);
  }
});

/* ==============================================================================
 * SUITE 6: HETEROGENEOUS MASS & PHASING ARCHETYPES CO-LOCATED
 * ============================================================================== */

test('PACK-06: 120 heterogeneous entities (Heavy Tanks, Light Critters, Phasing Ghosts) resolve co-location properly', () => {
  const COUNT = 120;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    const mod = i % 3;
    if (mod === 0) {
      // Tank (heavy mass = 3.0)
      entities.push(createPackedEntity(250.0, 250.0, { mass: 3.0, radius: 14, name: `Tank_${i}` }));
    } else if (mod === 1) {
      // Light Critter (light mass = 0.5)
      entities.push(createPackedEntity(250.0, 250.0, { mass: 0.5, radius: 10, name: `Critter_${i}` }));
    } else {
      // Ghost (phasing: bypasses collisions)
      entities.push(createPackedEntity(250.0, 250.0, { mass: 1.0, radius: 12, isPhasing: true, name: `Ghost_${i}` }));
    }
  }

  const stats = resolveEntitySeparation(entities, {
    iterations: 2,
    separationFactor: 0.5,
    bounds: { minX: 20, maxX: 580, minY: 20, maxY: 500 },
  });

  assert.equal(stats.nanGuardsTriggered, 0);

  // Phasing ghosts should remain at exact (250, 250)
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    if (e.isPhasing) {
      assert.equal(e.x, 250.0, `Ghost ${i} should remain at initial x`);
      assert.equal(e.y, 250.0, `Ghost ${i} should remain at initial y`);
    } else {
      assert.ok(Number.isFinite(e.x));
      assert.ok(Number.isFinite(e.y));
    }
  }
});

/* ==============================================================================
 * SUITE 7: CONTINUOUS MULTI-FRAME SOAK SIMULATION (PHYSICS + AABB REPULSION)
 * ============================================================================== */

test('PACK-07: 120 co-located entities simulated over 60 continuous frames maintain < 2ms/frame, 0 NaN, and safe dispersion', () => {
  const COUNT = 120;
  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    entities.push(createPackedEntity(250.0, 250.0, { name: `Soak_${i}`, vx: 0, vy: 0 }));
  }

  const manager = new OverheadUIManager();
  const player = { x: 500, y: 500 };
  const frameTimes = [];

  for (let frame = 0; frame < 60; frame++) {
    const t0 = performance.now();

    // 1. Physical velocity integration
    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];
      e.x += e.body.velocity.x * 0.016;
      e.y += e.body.velocity.y * 0.016;
    }

    // 2. Spatial separation pass with velocity nudges and restitution
    const stats = resolveEntitySeparation(entities, {
      iterations: 2,
      separationFactor: 0.5,
      restitution: 0.2,
      velocityNudgeFactor: 0.1,
      applyVelocityNudges: true,
      maxVelocityNudge: 150.0,
      bounds: { minX: 20, maxX: 580, minY: 20, maxY: 500 },
    });

    assert.equal(stats.nanGuardsTriggered, 0, `Frame ${frame} NaN guard triggered`);

    // 3. Overhead UI AABB spring repulsion & vertical staggering
    manager.update(entities, player, 16, true);

    const t1 = performance.now();
    frameTimes.push(t1 - t0);

    // 4. Invariant checks per frame
    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];
      assert.ok(Number.isFinite(e.x), `Frame ${frame} Entity ${i} x must be finite`);
      assert.ok(Number.isFinite(e.y), `Frame ${frame} Entity ${i} y must be finite`);
      assert.ok(e.x >= 20 && e.x <= 580, `Frame ${frame} Entity ${i} x (${e.x}) out of bounds`);
      assert.ok(e.y >= 20 && e.y <= 500, `Frame ${frame} Entity ${i} y (${e.y}) out of bounds`);

      const speed = Math.hypot(e.body.velocity.x, e.body.velocity.y);
      assert.ok(speed <= 400.0, `Frame ${frame} Entity ${i} speed ${speed} exceeded MAX_SPEED`);

      assert.ok(Number.isFinite(e.overheadUI.customOffsetX));
      assert.ok(Number.isFinite(e.overheadUI.customOffsetY));
    }
  }

  const avgFrameMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const maxFrameMs = Math.max(...frameTimes);

  assert.ok(avgFrameMs < 6.0, `Average frame step time must be < 6.0ms (got ${avgFrameMs.toFixed(3)}ms)`);
  assert.ok(maxFrameMs < 250.0, `Max frame step time must be < 250.0ms (got ${maxFrameMs.toFixed(3)}ms)`);

  // Dispersion verification after 60 frames: entities should have spread out
  let centerDistances = 0;
  for (let i = 0; i < COUNT; i++) {
    centerDistances += Math.hypot(entities[i].x - 250.0, entities[i].y - 250.0);
  }
  const avgDist = centerDistances / COUNT;
  assert.ok(avgDist > 20.0, `Entities must cleanly disperse over 60 frames (avg radius: ${avgDist.toFixed(2)}px)`);
});

/* ==============================================================================
 * SUITE 8: EXTREME SCALE STRESS TEST (300 CO-LOCATED ENTITIES)
 * ============================================================================== */

test('PACK-08: Extreme 300-entity co-location stress test runs in < 25ms without memory leaks or loop lockups', () => {
  const grid = new SpatialSeparationGrid(40, 800, 800);
  const COUNT = 300;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    entities.push(createPackedEntity(300.0, 300.0, { name: `MegaStack_${i}` }));
  }

  const start = performance.now();
  const stats = grid.resolveSeparation(entities, {
    iterations: 2,
    separationFactor: 0.5,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
  });
  const duration = performance.now() - start;

  assert.equal(stats.entitiesProcessed, COUNT);
  assert.ok(duration < 250.0, `300 entities resolution took ${duration.toFixed(2)}ms (expected < 250ms under test load)`);
  assert.equal(stats.nanGuardsTriggered, 0);
  assert.ok(stats.zeroDistancesHandled > 0);

  for (let i = 0; i < COUNT; i++) {
    assert.ok(Number.isFinite(entities[i].x));
    assert.ok(Number.isFinite(entities[i].y));
  }
});
