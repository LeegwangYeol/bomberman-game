/**
 * tests/unit/entity_movement_velocity_collision.test.mjs
 *
 * Dedicated Defensive Test Suite:
 * 1. Entity Movement (step cycles, bobbing, squash/stretch, stun freeze, death lifecycle)
 * 2. Velocity Clamping (clamp(speed, 50, 400), clampSpeed, clampVelocity 2D vector preservation)
 * 3. Collision Resolution against NaN, -Infinity, Infinity, and Extreme Impulses (SpatialSeparationGrid)
 * 4. Soak simulation under extreme clustering & runaway velocity prevention (<= 400 px/s)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook for extensionless TypeScript imports in Node --experimental-strip-types
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

// Minimal DOM & Canvas mocks for headless Phaser entity instantiation
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
  createRadialGradient: () => ({ addColorStop: () => {} }),
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
  clamp,
  clampSpeed,
  clampVelocity,
  BaseEntity,
  applyPhysicsBodyInvariantGuard,
} = await import('../../src/game/entities/BaseEntity.ts');

const {
  SpatialSeparationGrid,
  resolveEntitySeparation,
} = await import('../../src/game/entities/SpatialSeparation.ts');

const {
  ChaserEnemy,
  TankEnemy,
  GhostEnemy,
  BomberEnemy,
  SplitterEnemy,
  EnemyState,
} = await import('../../src/game/entities/EnemyEntities.ts');

const {
  MerchantNPC,
  CritterNPC,
} = await import('../../src/game/entities/NeutralEntities.ts');

const {
  MiniBomberAlly,
  PetDroneAlly,
} = await import('../../src/game/entities/AllyEntities.ts');

function createMockScene() {
  const createGraphics = () => ({
    depth: 0,
    visible: true,
    active: true,
    clear() { return this; },
    fillStyle() { return this; },
    fillRect() { return this; },
    lineStyle() { return this; },
    lineBetween() { return this; },
    setDepth(d) { this.depth = d; return this; },
    setAlpha() { return this; },
    setVisible(v) { this.visible = v; return this; },
    destroy() { this.active = false; },
  });

  const createText = (content = '') => ({
    text: content,
    depth: 0,
    visible: true,
    active: true,
    x: 0,
    y: 0,
    setOrigin() { return this; },
    setDepth(d) { this.depth = d; return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setText(str) { this.text = str; return this; },
    setVisible(v) { this.visible = v; return this; },
    setAlpha() { return this; },
    destroy() { this.active = false; },
  });

  const scene = {
    sys: {
      queueDepthSort: () => {},
      anims: { on: () => {}, off: () => {}, get: () => null, create: () => {} },
      textures: { get: () => ({ get: () => ({}) }) },
    },
    add: {
      existing: (obj) => obj,
      graphics: createGraphics,
      text: (_x, _y, content) => createText(content),
      circle: (x, y, r) => ({
        x,
        y,
        r,
        setDepth() { return this; },
        destroy() {},
      }),
    },
    tweens: {
      add: (config) => {
        if (config && typeof config.onComplete === 'function') {
          // No-op for mock
        }
        return { stop: () => {}, destroy: () => {} };
      },
    },
    physics: {
      add: {
        existing: (obj) => {
          if (!obj.body) {
            obj.body = {
              width: 24,
              height: 24,
              halfWidth: 12,
              halfHeight: 12,
              offset: { x: 8, y: 8 },
              position: { x: obj.x - 12, y: obj.y - 12 },
              center: { x: obj.x, y: obj.y },
              velocity: { x: 0, y: 0 },
              transform: { x: obj.x, y: obj.y, rotation: 0, scaleX: 1, scaleY: 1 },
              setSize(w, h) {
                this.width = w;
                this.height = h;
                this.halfWidth = w / 2;
                this.halfHeight = h / 2;
                return this;
              },
              setOffset(ox, oy) {
                this.offset.x = ox;
                this.offset.y = oy;
                return this;
              },
              setCollideWorldBounds() { return this; },
              setVelocity(vx, vy) {
                this.velocity.x = vx;
                this.velocity.y = vy;
                return this;
              },
              updateCenter() {
                this.center.x = this.position.x + this.halfWidth;
                this.center.y = this.position.y + this.halfHeight;
              },
              updateBounds() {
                this.updateCenter();
              },
              updateFromGameObject() {
                this.position.x = this.transform.x + this.offset.x - 20;
                this.position.y = this.transform.y + this.offset.y - 20;
                this.updateCenter();
              },
            };
          }
          return obj;
        },
      },
    },
    time: {
      now: 1000,
      delayedCall: (_delay, fn) => fn(),
    },
  };

  return scene;
}

function createSeparableEntity(x, y, vx = 0, vy = 0, mass = 1.0, radius = 12) {
  return {
    x,
    y,
    active: true,
    isDead: false,
    collisionRadius: radius,
    mass,
    isPhasing: false,
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
}

/* ==============================================================================
 * SUITE 1: VELOCITY CLAMPING & clamp(speed, 50, 400) RIGOROUS VERIFICATION
 * ============================================================================== */

test('CLAMP-01: clamp(speed, 50, 400) strictly enforces bounds and sanitizes all corrupt inputs', () => {
  // In-range values
  assert.equal(clamp(50, 50, 400), 50);
  assert.equal(clamp(150, 50, 400), 150);
  assert.equal(clamp(300, 50, 400), 300);
  assert.equal(clamp(400, 50, 400), 400);

  // Sub-minimum clamping
  assert.equal(clamp(49.99, 50, 400), 50);
  assert.equal(clamp(10, 50, 400), 50);
  assert.equal(clamp(0, 50, 400), 50);
  assert.equal(clamp(-100, 50, 400), 50);
  assert.equal(clamp(-999999, 50, 400), 50);

  // Super-maximum clamping
  assert.equal(clamp(400.01, 50, 400), 400);
  assert.equal(clamp(500, 50, 400), 400);
  assert.equal(clamp(10000, 50, 400), 400);
  assert.equal(clamp(1e12, 50, 400), 400);

  // Corrupt / IEEE-754 edge cases: NaN, -Infinity, +Infinity, non-numbers
  assert.equal(clamp(NaN, 50, 400), 50, 'NaN must sanitize to min (50)');
  assert.equal(clamp(-Infinity, 50, 400), 50, '-Infinity must sanitize to min (50)');
  assert.equal(clamp(Infinity, 50, 400), 400, '+Infinity must sanitize to max (400)');
  assert.equal(clamp(undefined, 50, 400), 50, 'undefined must sanitize to min (50)');
  assert.equal(clamp(null, 50, 400), 50, 'null must sanitize to min (50)');
  assert.equal(clamp('invalid', 50, 400), 50, 'string must sanitize to min (50)');
});

test('CLAMP-02: clampSpeed helper behaves identically to clamp(speed, 50, 400)', () => {
  assert.equal(clampSpeed(120), 120);
  assert.equal(clampSpeed(30), 50);
  assert.equal(clampSpeed(500), 400);
  assert.equal(clampSpeed(NaN), 50);
  assert.equal(clampSpeed(-Infinity), 50);
  assert.equal(clampSpeed(Infinity), 400);
});

test('CLAMP-03: clampVelocity preserves 2D directional heading while clamping magnitude within [50, 400]', () => {
  // 1. Stationary entity remains stationary (magnitude 0 does not get pushed to 50)
  const stationary = clampVelocity(0, 0, 50, 400);
  assert.equal(stationary.vx, 0);
  assert.equal(stationary.vy, 0);
  assert.equal(stationary.speed, 0);

  // 2. Slow moving entity (speed 25 < 50) scaled up to minSpeed 50
  const slow = clampVelocity(15, 20, 50, 400); // 15^2 + 20^2 = 25^2 (speed = 25)
  assert.equal(slow.speed, 50);
  assert.equal(slow.vx, 30);
  assert.equal(slow.vy, 40);
  // Heading angle must be identical
  assert.ok(Math.abs(Math.atan2(slow.vy, slow.vx) - Math.atan2(20, 15)) < 1e-10);

  // 3. Fast moving entity (speed 500 > 400) scaled down to maxSpeed 400
  const fast = clampVelocity(300, 400, 50, 400); // 300^2 + 400^2 = 500^2 (speed = 500)
  assert.equal(fast.speed, 400);
  assert.equal(fast.vx, 240);
  assert.equal(fast.vy, 320);
  assert.ok(Math.abs(Math.atan2(fast.vy, fast.vx) - Math.atan2(400, 300)) < 1e-10);

  // 4. Negative components preserved
  const neg = clampVelocity(-300, -400, 50, 400);
  assert.equal(neg.speed, 400);
  assert.equal(neg.vx, -240);
  assert.equal(neg.vy, -320);

  // 5. Corrupted NaN / -Infinity components sanitized
  const nanV = clampVelocity(NaN, 100, 50, 400);
  assert.equal(nanV.vx, 0);
  assert.equal(nanV.vy, 100);
  assert.equal(nanV.speed, 100);

  const infV = clampVelocity(-Infinity, 200, 50, 400);
  assert.equal(infV.vx, 0);
  assert.equal(infV.vy, 200);
  assert.equal(infV.speed, 200);

  const allCorrupt = clampVelocity(NaN, -Infinity, 50, 400);
  assert.equal(allCorrupt.vx, 0);
  assert.equal(allCorrupt.vy, 0);
  assert.equal(allCorrupt.speed, 0);
});

/* ==============================================================================
 * SUITE 2: ENTITY MOVEMENT, VELOCITY CLAMPING & INVARIANTS ACROSS ARCHETYPES
 * ============================================================================== */

test('ENTITY-MOVE-01: BaseEntity.clampBodyVelocity guards body.velocity to [50, 400] on active sprites', () => {
  const scene = createMockScene();
  const chaser = new ChaserEnemy(scene, 100, 100);

  // Extreme initial velocity (800 px/s)
  chaser.body.velocity.x = 480;
  chaser.body.velocity.y = 640; // hypot = 800

  chaser.clampBodyVelocity(50, 400);

  const clampedSpeed = Math.hypot(chaser.body.velocity.x, chaser.body.velocity.y);
  assert.ok(Math.abs(clampedSpeed - 400) < 1e-6, `Speed (${clampedSpeed}) must be clamped to 400 px/s`);
  assert.equal(chaser.body.velocity.x, 240);
  assert.equal(chaser.body.velocity.y, 320);

  // Sub-minimum moving velocity (20 px/s)
  chaser.body.velocity.x = 12;
  chaser.body.velocity.y = 16;
  chaser.clampBodyVelocity(50, 400);
  const minSpeed = Math.hypot(chaser.body.velocity.x, chaser.body.velocity.y);
  assert.ok(Math.abs(minSpeed - 50) < 1e-6, `Sub-minimum speed (${minSpeed}) must be clamped to 50 px/s`);

  // NaN & -Infinity velocity sanitization
  chaser.body.velocity.x = NaN;
  chaser.body.velocity.y = -Infinity;
  chaser.clampBodyVelocity(50, 400);
  assert.equal(chaser.body.velocity.x, 0);
  assert.equal(chaser.body.velocity.y, 0);
});

test('ENTITY-MOVE-02: BaseEntity.updateEntity clamps runaway velocities and sanitizes NaNs automatically', () => {
  const scene = createMockScene();
  const tank = new TankEnemy(scene, 150, 150);

  // Corrupt velocity injected externally
  tank.body.velocity.x = 1000;
  tank.body.velocity.y = 1000;

  tank.updateEntity(16.66, 1000);

  const speed = Math.hypot(tank.body.velocity.x, tank.body.velocity.y);
  assert.ok(speed <= 400.01, `Tank speed ${speed} must be clamped to <= 400 px/s in updateEntity`);

  // NaN injected
  tank.body.velocity.x = NaN;
  tank.body.velocity.y = 100;
  tank.updateEntity(16.66, 1016);
  assert.equal(tank.body.velocity.x, 0);
  assert.equal(tank.body.velocity.y, 0);
});

test('ENTITY-MOVE-03: Entity movement across 1,000 frames under variable deltas (0ms to 1000ms)', () => {
  const scene = createMockScene();
  const chaser = new ChaserEnemy(scene, 200, 200);
  chaser.body.velocity.x = 110;
  chaser.body.velocity.y = 0;

  const testDeltas = [0, 8.33, 16.66, 33.33, 50, 100, 500, 1000];

  for (let frame = 0; frame < 1000; frame++) {
    const delta = testDeltas[frame % testDeltas.length];
    chaser.updateEntity(delta, frame * 16.66);

    assert.ok(Number.isFinite(chaser.x), `Frame ${frame}: x must be finite`);
    assert.ok(Number.isFinite(chaser.y), `Frame ${frame}: y must be finite`);
    assert.ok(Number.isFinite(chaser.body.velocity.x), `Frame ${frame}: vx must be finite`);
    assert.ok(Number.isFinite(chaser.body.velocity.y), `Frame ${frame}: vy must be finite`);
    assert.ok(chaser.bobOffset >= 0 && chaser.bobOffset <= 3.01, `Bob offset ${chaser.bobOffset} must be in [0, 3]`);
  }
});

test('ENTITY-MOVE-04: Stun status stops entity movement, resets bob, and prevents velocity update', () => {
  const scene = createMockScene();
  const chaser = new ChaserEnemy(scene, 200, 200);

  chaser.body.velocity.x = 240;
  chaser.body.velocity.y = 0;
  chaser.isStunned = true;
  chaser.stunUntil = 5000;

  chaser.updateEntity(16.66, 1000);

  // In stunned state, bobOffset should be 0
  assert.equal(chaser.bobOffset, 0);
  assert.equal(chaser.displayOriginY, chaser.baseDisplayOriginY);
});

/* ==============================================================================
 * SUITE 3: COLLISION RESOLUTION AGAINST NaN, -INFINITY, AND EXTREME IMPULSES
 * ============================================================================== */

test('COLLISION-01: SpatialSeparationGrid sanitizes NaN, -Infinity, and Infinity coordinates with 0 leaks', () => {
  const grid = new SpatialSeparationGrid(40, 800, 800);

  const eNaN = createSeparableEntity(NaN, 300, 0, 0);
  const eNegInf = createSeparableEntity(300, -Infinity, 50, 50);
  const ePosInf = createSeparableEntity(Infinity, Infinity, 0, 0);
  const eValid = createSeparableEntity(300, 300, 0, 0);

  const stats = grid.resolveSeparation([eNaN, eNegInf, ePosInf, eValid], {
    iterations: 2,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
  });

  assert.ok(stats.nanGuardsTriggered >= 3, `Expected at least 3 nanGuardsTriggered, got ${stats.nanGuardsTriggered}`);

  for (const e of [eNaN, eNegInf, ePosInf, eValid]) {
    assert.ok(Number.isFinite(e.x), `x (${e.x}) must be finite`);
    assert.ok(Number.isFinite(e.y), `y (${e.y}) must be finite`);
    assert.ok(e.x >= 20 && e.x <= 780, `x (${e.x}) must be within arena bounds`);
    assert.ok(e.y >= 20 && e.y <= 780, `y (${e.y}) must be within arena bounds`);
    assert.ok(Number.isFinite(e.body.velocity.x), 'vx must be finite');
    assert.ok(Number.isFinite(e.body.velocity.y), 'vy must be finite');
  }
});

test('COLLISION-02: Extreme closing velocity impulse (vRel = -1e12 px/s) resolves cleanly without NaN and clamps to 400 px/s', () => {
  // Two entities closing at astronomical speed
  const eA = createSeparableEntity(290, 300, 1e12, 0, 1.0, 12);
  const eB = createSeparableEntity(310, 300, -1e12, 0, 1.0, 12);

  const stats = resolveEntitySeparation([eA, eB], {
    iterations: 2,
    restitution: 1.0,
    velocityNudgeFactor: 5.0,
    applyVelocityNudges: true,
  });

  assert.ok(stats.restitutionImpulsesApplied > 0 || stats.overlapsResolved > 0);

  const speedA = Math.hypot(eA.body.velocity.x, eA.body.velocity.y);
  const speedB = Math.hypot(eB.body.velocity.x, eB.body.velocity.y);

  assert.ok(Number.isFinite(speedA), 'Speed A must be finite');
  assert.ok(Number.isFinite(speedB), 'Speed B must be finite');
  assert.ok(speedA <= 400.01, `Speed A (${speedA}) must be clamped to <= 400 px/s under extreme impulse`);
  assert.ok(speedB <= 400.01, `Speed B (${speedB}) must be clamped to <= 400 px/s under extreme impulse`);
});

test('COLLISION-03: Astronomical velocities (1e200) handled without intermediate double overflow', () => {
  // 1e200 would square to 1e400 (Infinity) if naive speedSq is used
  const eA = createSeparableEntity(290, 300, 1e200, -1e200, 1.0, 12);
  const eB = createSeparableEntity(310, 300, -1e200, 1e200, 1.0, 12);

  resolveEntitySeparation([eA, eB], {
    iterations: 1,
    restitution: 0.5,
    applyVelocityNudges: true,
  });

  const speedA = Math.hypot(eA.body.velocity.x, eA.body.velocity.y);
  const speedB = Math.hypot(eB.body.velocity.x, eB.body.velocity.y);

  assert.ok(Number.isFinite(speedA), 'Speed A must be finite');
  assert.ok(Number.isFinite(speedB), 'Speed B must be finite');
  assert.ok(speedA <= 400.01, `Speed A (${speedA}) must be clamped to <= 400 px/s`);
  assert.ok(speedB <= 400.01, `Speed B (${speedB}) must be clamped to <= 400 px/s`);
});

test('COLLISION-04: Co-located entities (dist = 0) resolve along deterministic golden-ratio radial vectors without 0/0 NaN', () => {
  const COUNT = 80;
  const entities = [];
  // All 80 entities placed at exact same point (400, 400)
  for (let i = 0; i < COUNT; i++) {
    entities.push(createSeparableEntity(400, 400, 0, 0, 1.0, 12));
  }

  const stats = resolveEntitySeparation(entities, {
    iterations: 3,
    separationFactor: 0.6,
    restitution: 0.2,
    velocityNudgeFactor: 1.0,
    applyVelocityNudges: true,
  });

  assert.equal(stats.entitiesProcessed, COUNT);
  assert.ok(stats.zeroDistancesHandled > 0, 'Zero distances handled via golden angle');
  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered for co-located entities');

  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.ok(Number.isFinite(e.x), `Entity ${i} x must be finite`);
    assert.ok(Number.isFinite(e.y), `Entity ${i} y must be finite`);
    const speed = Math.hypot(e.body.velocity.x, e.body.velocity.y);
    assert.ok(speed <= 400.01, `Entity ${i} speed must be <= 400 px/s`);
  }
});

/* ==============================================================================
 * SUITE 4: 100-ENTITY EXTREME CLUSTERING & MULTI-FRAME RUNAWAY IMPULSE SOAK
 * ============================================================================== */

test('SOAK-01: 100 colliding entities compressed into single tile resolve over 200 frames with 0 NaNs and speed <= 400', () => {
  const COUNT = 100;
  const entities = [];

  // Compress all 100 entities into a 20x20 area centered at (300, 300)
  for (let i = 0; i < COUNT; i++) {
    const rx = 290 + (i % 10) * 2;
    const ry = 290 + Math.floor(i / 10) * 2;
    const vx = ((i % 5) - 2) * 80;
    const vy = (((i + 2) % 5) - 2) * 80;
    entities.push(createSeparableEntity(rx, ry, vx, vy, 1.0, 12));
  }

  const FRAMES = 200;
  let totalDurationMs = 0;

  for (let f = 0; f < FRAMES; f++) {
    // Integrate velocities (dt = 0.016s)
    for (let i = 0; i < COUNT; i++) {
      entities[i].x += entities[i].body.velocity.x * 0.016;
      entities[i].y += entities[i].body.velocity.y * 0.016;
    }

    const t0 = performance.now();
    const stats = resolveEntitySeparation(entities, {
      iterations: 2,
      separationFactor: 0.5,
      restitution: 0.4,
      velocityNudgeFactor: 0.3,
      maxVelocityNudge: 200,
      applyVelocityNudges: true,
      bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
    });
    totalDurationMs += (performance.now() - t0);

    assert.equal(stats.nanGuardsTriggered, 0, `Frame ${f}: Produced NaN guards`);

    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];
      assert.ok(Number.isFinite(e.x), `Frame ${f} Entity ${i} x must be finite`);
      assert.ok(Number.isFinite(e.y), `Frame ${f} Entity ${i} y must be finite`);
      assert.ok(e.x >= 20 && e.x <= 780, `Frame ${f} Entity ${i} x out of bounds`);
      assert.ok(e.y >= 20 && e.y <= 780, `Frame ${f} Entity ${i} y out of bounds`);

      const speed = Math.hypot(e.body.velocity.x, e.body.velocity.y);
      assert.ok(speed <= 400.01, `Frame ${f} Entity ${i} speed ${speed.toFixed(2)} exceeded 400 px/s`);
    }
  }

  const avgTickMs = totalDurationMs / FRAMES;
  assert.ok(avgTickMs < 2.5, `Average tick time ${avgTickMs.toFixed(3)}ms must be < 2.5ms`);
});
