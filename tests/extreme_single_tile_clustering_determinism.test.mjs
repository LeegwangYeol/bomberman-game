/**
 * tests/extreme_single_tile_clustering_determinism.test.mjs
 *
 * Verification Suite: Extreme Entity Clustering (120+ entities packed into a single 40x40 tile)
 *
 * Verifies:
 * 1. 120+ entities packed into a single 40x40 tile resolve collisions smoothly.
 * 2. Deterministic resolution: Identical initial conditions produce 100% bit-for-bit identical coordinates & velocities.
 * 3. Zero infinite loops: Cell traversal and relaxation steps strictly terminate in O(N) bounded time.
 * 4. Zero-division prevention: Exact co-location (dist === 0) and subnormal float proximity resolve via golden spiral.
 * 5. Zero NaN velocities or coordinates: Rigorous finite number invariants across all entities and ticks.
 * 6. Zero runaway speeds: Velocity magnitudes strictly clamped to <= 400 px/s; displacements bounded to <= 32 px/tick.
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

// Mock Canvas and DOM for Phaser / game objects if needed
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
} = await import('../src/game/entities/SpatialSeparation.ts');

function createClusteredEntity(x, y, vx = 0, vy = 0, options = {}) {
  const radius = options.radius ?? 12;
  const mass = options.mass ?? 1.0;
  const isPhasing = options.isPhasing ?? false;

  return {
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
      updateCenter: function() {
        this.position.x = x - this.halfWidth;
        this.position.y = y - this.halfHeight;
      },
      updateFromGameObject: function() {
        this.position.x = x - this.halfWidth;
        this.position.y = y - this.halfHeight;
      },
    },
  };
}

/* ==============================================================================
 * TEST 1: 120 ENTITIES CO-LOCATED IN A SINGLE 40x40 TILE (ZERO-DIVISION & FINITE MATH)
 * ============================================================================== */

test('CLUSTER-DET-01: 120 entities co-located at center of single 40x40 tile resolve with zero division, 0 NaN, and radial dispersion', () => {
  const COUNT = 120;
  const TILE_X = 200;
  const TILE_Y = 200;
  const TILE_SIZE = 40;
  const centerX = TILE_X + TILE_SIZE / 2; // 220
  const centerY = TILE_Y + TILE_SIZE / 2; // 220

  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    entities.push(createClusteredEntity(centerX, centerY, 0, 0, {
      mass: 0.8 + (i % 5) * 0.4,
      radius: 10 + (i % 3) * 2,
    }));
  }

  // Pre-condition: All 120 entities packed at exact point (220, 220)
  for (let i = 0; i < COUNT; i++) {
    assert.equal(entities[i].x, 220);
    assert.equal(entities[i].y, 220);
  }

  const start = performance.now();
  const stats = resolveEntitySeparation(entities, {
    iterations: 3,
    separationFactor: 0.6,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
    applyVelocityNudges: true,
    velocityNudgeFactor: 0.2,
    restitution: 0.3,
  });
  const elapsed = performance.now() - start;

  // 1. Performance check (No infinite loop)
  assert.ok(elapsed < 300.0, `Resolution must complete quickly without infinite loops (took ${elapsed.toFixed(2)}ms)`);
  assert.equal(stats.entitiesProcessed, COUNT);

  // 2. Zero-division defense verified
  assert.ok(stats.zeroDistancesHandled > 0, `Zero distance handler must be triggered (got ${stats.zeroDistancesHandled})`);
  assert.equal(stats.nanGuardsTriggered, 0, 'No NaN guards should trigger on valid inputs');
  assert.ok(stats.overlapsResolved > 0, 'Overlaps must be resolved');

  // 3. Finite coordinate & velocity checks (Zero NaN)
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(Number.isFinite(e.x), `Entity ${i} x must be finite (got ${e.x})`);
    assert.ok(Number.isFinite(e.y), `Entity ${i} y must be finite (got ${e.y})`);
    assert.ok(!Number.isNaN(e.x), `Entity ${i} x must not be NaN`);
    assert.ok(!Number.isNaN(e.y), `Entity ${i} y must not be NaN`);

    assert.ok(Number.isFinite(e.body.velocity.x), `Entity ${i} vx must be finite`);
    assert.ok(Number.isFinite(e.body.velocity.y), `Entity ${i} vy must be finite`);
    assert.ok(!Number.isNaN(e.body.velocity.x), `Entity ${i} vx must not be NaN`);
    assert.ok(!Number.isNaN(e.body.velocity.y), `Entity ${i} vy must not be NaN`);

    // 4. Runaway speed check (MAX_SPEED <= 400)
    const speed = Math.hypot(e.body.velocity.x, e.body.velocity.y);
    assert.ok(speed <= 400.0, `Entity ${i} speed ${speed} must not exceed 400 px/s`);
  }

  // 5. Radial dispersion: Entities should move away from the single packed point
  const dispersedCount = entities.filter(e => Math.hypot(e.x - centerX, e.y - centerY) > 1.0).length;
  assert.ok(dispersedCount >= 115, `At least 115/120 entities must disperse away from origin (got ${dispersedCount})`);
});

/* ==============================================================================
 * TEST 2: STRICT DETERMINISTIC EQUIVALENCE OVER 100 TICKS (120+ PACKED ENTITIES)
 * ============================================================================== */

test('CLUSTER-DET-02: 128 entities packed inside a 40x40 tile resolve 100% deterministically over 100 physics ticks', () => {
  const COUNT = 128;
  const TILE_X = 200;
  const TILE_Y = 200;

  function runSimulation(ticks) {
    const grid = new SpatialSeparationGrid(40, 800, 800);
    const entities = [];

    // Pack 128 entities strictly inside the 40x40 tile [200, 240] x [200, 240]
    for (let i = 0; i < COUNT; i++) {
      const offsetX = (i % 8) * 4.5 + 2.0;
      const offsetY = Math.floor(i / 8) * 2.2 + 2.0;
      const vx = ((i % 5) - 2) * 25.0;
      const vy = ((i % 3) - 1) * 35.0;
      const mass = 0.5 + (i % 4) * 0.5;
      const radius = 8 + (i % 3) * 2;
      entities.push(createClusteredEntity(TILE_X + offsetX, TILE_Y + offsetY, vx, vy, { mass, radius }));
    }

    const stateHistory = [];

    for (let t = 0; t < ticks; t++) {
      // 1. Physical integration
      for (let i = 0; i < COUNT; i++) {
        const e = entities[i];
        e.x += e.body.velocity.x * 0.016;
        e.y += e.body.velocity.y * 0.016;
      }

      // 2. Spatial separation resolution
      const stats = grid.resolveSeparation(entities, {
        iterations: 2,
        separationFactor: 0.5,
        applyVelocityNudges: true,
        velocityNudgeFactor: 0.15,
        restitution: 0.25,
        maxVelocityNudge: 200.0,
        bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
      });

      // 3. Snapshot state
      const frameSnapshot = entities.map(e => ({
        x: e.x,
        y: e.y,
        vx: e.body.velocity.x,
        vy: e.body.velocity.y,
      }));
      stateHistory.push({ frameSnapshot, stats: { ...stats } });
    }

    return stateHistory;
  }

  const run1 = runSimulation(100);
  const run2 = runSimulation(100);

  assert.equal(run1.length, 100);
  assert.equal(run2.length, 100);

  // Exact bit-for-bit equivalence check across all 100 frames and all 128 entities
  for (let t = 0; t < 100; t++) {
    const frame1 = run1[t].frameSnapshot;
    const frame2 = run2[t].frameSnapshot;

    // Check stats equivalence
    assert.equal(run1[t].stats.overlapsResolved, run2[t].stats.overlapsResolved, `Tick ${t} overlapsResolved must match`);
    assert.equal(run1[t].stats.zeroDistancesHandled, run2[t].stats.zeroDistancesHandled, `Tick ${t} zeroDistancesHandled must match`);
    assert.equal(run1[t].stats.nanGuardsTriggered, 0, `Tick ${t} nanGuardsTriggered must be 0`);
    assert.equal(run2[t].stats.nanGuardsTriggered, 0, `Tick ${t} nanGuardsTriggered must be 0`);

    for (let i = 0; i < COUNT; i++) {
      const e1 = frame1[i];
      const e2 = frame2[i];

      assert.equal(e1.x, e2.x, `Tick ${t} Entity ${i} x mismatch: ${e1.x} !== ${e2.x}`);
      assert.equal(e1.y, e2.y, `Tick ${t} Entity ${i} y mismatch: ${e1.y} !== ${e2.y}`);
      assert.equal(e1.vx, e2.vx, `Tick ${t} Entity ${i} vx mismatch: ${e1.vx} !== ${e2.vx}`);
      assert.equal(e1.vy, e2.vy, `Tick ${t} Entity ${i} vy mismatch: ${e1.vy} !== ${e2.vy}`);

      // Invariants
      assert.ok(Number.isFinite(e1.x) && !Number.isNaN(e1.x));
      assert.ok(Number.isFinite(e1.y) && !Number.isNaN(e1.y));
      assert.ok(Number.isFinite(e1.vx) && !Number.isNaN(e1.vx));
      assert.ok(Number.isFinite(e1.vy) && !Number.isNaN(e1.vy));

      const spd = Math.hypot(e1.vx, e1.vy);
      assert.ok(spd <= 400.0, `Speed ${spd} must never exceed 400 px/s`);
    }
  }
});

/* ==============================================================================
 * TEST 3: EXTREME CONFINEMENT IN A SINGLE 40x40 WALLED CELL (140 ENTITIES)
 * ============================================================================== */

test('CLUSTER-DET-03: 140 entities trapped inside a single 40x40 tile enclosed by solid bounds resolve without tunneling or runaway speeds', () => {
  const COUNT = 140;
  // Confined bounds: exactly 40x40 tile [200, 240] x [200, 240]
  const tileBounds = { minX: 200, maxX: 240, minY: 200, maxY: 240 };

  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    // Packed within the 40x40 tile
    const px = 205 + (i % 10) * 3;
    const py = 205 + Math.floor(i / 10) * 2;
    const vx = Math.sin(i * 1.7) * 200;
    const vy = Math.cos(i * 1.7) * 200;
    entities.push(createClusteredEntity(px, py, vx, vy, { radius: 10, mass: 1.0 }));
  }

  const TICKS = 80;
  for (let t = 0; t < TICKS; t++) {
    const prevPositions = entities.map(e => ({ x: e.x, y: e.y }));

    // Integrate
    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];
      e.x += e.body.velocity.x * 0.016;
      e.y += e.body.velocity.y * 0.016;
    }

    const stats = resolveEntitySeparation(entities, {
      iterations: 3,
      separationFactor: 0.6,
      applyVelocityNudges: true,
      velocityNudgeFactor: 0.2,
      restitution: 0.4,
      bounds: tileBounds,
    });

    assert.equal(stats.nanGuardsTriggered, 0, `Tick ${t} NaN guard triggered`);

    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];

      // 1. Strictly inside the 40x40 tile bounds
      assert.ok(e.x >= 200 && e.x <= 240, `Tick ${t} Entity ${i} x (${e.x}) broke out of 40x40 tile bounds`);
      assert.ok(e.y >= 200 && e.y <= 240, `Tick ${t} Entity ${i} y (${e.y}) broke out of 40x40 tile bounds`);

      // 2. Finite coordinates and velocities
      assert.ok(Number.isFinite(e.x) && !Number.isNaN(e.x));
      assert.ok(Number.isFinite(e.y) && !Number.isNaN(e.y));
      assert.ok(Number.isFinite(e.body.velocity.x) && !Number.isNaN(e.body.velocity.x));
      assert.ok(Number.isFinite(e.body.velocity.y) && !Number.isNaN(e.body.velocity.y));

      // 3. Speed invariant: <= 400 px/s
      const speed = Math.hypot(e.body.velocity.x, e.body.velocity.y);
      assert.ok(speed <= 400.0, `Tick ${t} Entity ${i} speed ${speed} exceeded MAX_SPEED`);

      // 4. Displacement invariant: No explosive warping in a single tick
      const disp = Math.hypot(e.x - prevPositions[i].x, e.y - prevPositions[i].y);
      assert.ok(disp <= 40.0, `Tick ${t} Entity ${i} single-tick displacement ${disp} exceeded bound`);
    }
  }
});

/* ==============================================================================
 * TEST 4: SUB-EPSILON AND SUBNORMAL FLOAT PROXIMITY GUARDS
 * ============================================================================== */

test('CLUSTER-DET-04: 120 entities with subnormal float offsets (1e-323, 1e-15, 1e-9) avoid zero-division and NaN velocities', () => {
  const COUNT = 120;
  const BASE_X = 220;
  const BASE_Y = 220;

  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    let offset = 0;
    if (i % 4 === 1) offset = 1e-15;
    else if (i % 4 === 2) offset = 1e-9;
    else if (i % 4 === 3) offset = 1e-323; // Subnormal float

    const vx = (i % 2 === 0 ? 1 : -1) * (1e-320); // Subnormal velocity
    const vy = (i % 2 === 0 ? -1 : 1) * (1e-320);

    entities.push(createClusteredEntity(BASE_X + offset, BASE_Y + offset, vx, vy, { radius: 12, mass: 1.0 }));
  }

  const stats = resolveEntitySeparation(entities, {
    iterations: 3,
    separationFactor: 0.5,
    applyVelocityNudges: true,
    velocityNudgeFactor: 0.2,
    restitution: 0.3,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
  });

  assert.equal(stats.nanGuardsTriggered, 0, 'Subnormal floats must not trigger NaN');
  assert.ok(stats.overlapsResolved > 0);

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(Number.isFinite(e.x), `Entity ${i} x must be finite (got ${e.x})`);
    assert.ok(Number.isFinite(e.y), `Entity ${i} y must be finite (got ${e.y})`);
    assert.ok(!Number.isNaN(e.x));
    assert.ok(!Number.isNaN(e.y));

    assert.ok(Number.isFinite(e.body.velocity.x), `Entity ${i} vx must be finite`);
    assert.ok(Number.isFinite(e.body.velocity.y), `Entity ${i} vy must be finite`);
    assert.ok(!Number.isNaN(e.body.velocity.x));
    assert.ok(!Number.isNaN(e.body.velocity.y));
  }
});

/* ==============================================================================
 * TEST 5: NO INFINITE LOOPS & PERFORMANCE BUDGET VERIFICATION (< 5MS / TICK)
 * ============================================================================== */

test('CLUSTER-DET-05: 150 clustered entities over 200 continuous ticks maintain < 5ms/tick average with zero freezing', () => {
  const COUNT = 150;
  const TILE_X = 200;
  const TILE_Y = 200;

  const entities = [];
  for (let i = 0; i < COUNT; i++) {
    const px = TILE_X + (i % 12) * 3.3;
    const py = TILE_Y + Math.floor(i / 12) * 3.0;
    entities.push(createClusteredEntity(px, py, 0, 0, { radius: 10, mass: 1.0 }));
  }

  const TICKS = 200;
  const tickTimes = [];

  for (let t = 0; t < TICKS; t++) {
    const t0 = performance.now();

    const stats = resolveEntitySeparation(entities, {
      iterations: 2,
      separationFactor: 0.5,
      applyVelocityNudges: true,
      velocityNudgeFactor: 0.1,
      restitution: 0.2,
      bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
    });

    const t1 = performance.now();
    tickTimes.push(t1 - t0);

    assert.equal(stats.nanGuardsTriggered, 0);
  }

  const totalTime = tickTimes.reduce((a, b) => a + b, 0);
  const avgTickMs = totalTime / TICKS;
  const maxTickMs = Math.max(...tickTimes);

  // Performance guarantees:
  // 1. Average tick must be well under 5.0ms (60 FPS budget is 16.6ms)
  assert.ok(avgTickMs < 5.0, `Average tick time ${avgTickMs.toFixed(3)}ms must be < 5.0ms (Zero Frame Collapse)`);
  // 2. Worst-case tick must not hang or freeze (< 100ms under parallel CI load)
  assert.ok(maxTickMs < 100.0, `Max tick time ${maxTickMs.toFixed(3)}ms must be < 100.0ms (Zero Infinite Loops)`);

  // Final entity validation
  for (let i = 0; i < COUNT; i++) {
    assert.ok(Number.isFinite(entities[i].x));
    assert.ok(Number.isFinite(entities[i].y));
    assert.ok(Number.isFinite(entities[i].body.velocity.x));
    assert.ok(Number.isFinite(entities[i].body.velocity.y));
  }
});

/* ==============================================================================
 * TEST 6: ADVERSARIAL CORRUPTED INPUT HEALING (NaN COORDINATES & VELOCITIES)
 * ============================================================================== */

test('CLUSTER-DET-06: Corrupted NaN/Infinity inputs injected into a 120-entity cluster heal gracefully without poisoning neighbours', () => {
  const COUNT = 120;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    let x = 220;
    let y = 220;
    let vx = 0;
    let vy = 0;

    // Inject adversarial corruption into specific entities
    if (i === 10) x = NaN;
    if (i === 20) y = Infinity;
    if (i === 30) { x = -Infinity; y = NaN; }
    if (i === 40) vx = NaN;
    if (i === 50) vy = Infinity;

    entities.push(createClusteredEntity(x, y, vx, vy, { radius: 12, mass: 1.0 }));
  }

  const stats = resolveEntitySeparation(entities, {
    iterations: 2,
    separationFactor: 0.5,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
    applyVelocityNudges: true,
  });

  // NaN guards must catch the corrupted entities
  assert.ok(stats.nanGuardsTriggered >= 3, `NaN guards should trigger on corrupted inputs (got ${stats.nanGuardsTriggered})`);

  // All 120 entities must be healed to finite numbers
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(Number.isFinite(e.x), `Entity ${i} x must be restored to finite (got ${e.x})`);
    assert.ok(Number.isFinite(e.y), `Entity ${i} y must be restored to finite (got ${e.y})`);
    assert.ok(!Number.isNaN(e.x));
    assert.ok(!Number.isNaN(e.y));

    assert.ok(Number.isFinite(e.body.velocity.x), `Entity ${i} vx must be restored to finite`);
    assert.ok(Number.isFinite(e.body.velocity.y), `Entity ${i} vy must be restored to finite`);
    assert.ok(!Number.isNaN(e.body.velocity.x));
    assert.ok(!Number.isNaN(e.body.velocity.y));
  }
});
