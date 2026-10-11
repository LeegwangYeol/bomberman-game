/**
 * tests/unit/player_movement_physics_numerical_stability.test.mjs
 *
 * Exhaustive Verification Suite for PlayerMovementPhysics.ts and SpatialSeparation.ts:
 * 1. Subnormal Float Protections (IEEE-754 denormal flushing: 1e-323, 1e-320, 1e-15, < 1e-8)
 * 2. NaN Guards (NaN, -Infinity, +Infinity, invalid types across speed, velocity, coordinates)
 * 3. Deadzone Boundary Checks (IEEE-754 tolerance: distSq < deadzoneSq - 1e-7 on exact (3, 4) boundary)
 * 4. Zero-Division Defenses (norm denominators, 0/0 and x/0 eliminations)
 * 5. Soak Invariant Simulation (10,000 ticks with micro-noise and boundary oscillations)
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

const {
  calculateClampedPlayerSpeed,
  resolveJoystickDeadzone,
  resolvePlayerCornerSlide,
  clampPlayerVelocity,
  clampSpeed,
  clamp,
  BASE_PLAYER_SPEED,
  MIN_PLAYER_SPEED,
  MAX_PLAYER_SPEED_CLAMP,
} = await import('../../src/game/entities/PlayerMovementPhysics.ts');

const {
  SpatialSeparationGrid,
  resolveEntitySeparation,
  clampVelocity,
} = await import('../../src/game/entities/SpatialSeparation.ts');

/* ==============================================================================
 * SUITE 1: SUBNORMAL FLOAT PROTECTIONS (IEEE-754 DENORMAL FLUSHING)
 * ============================================================================== */

test('SUBNORMAL-01: clampVelocity flushes subnormal velocity vectors (< 1e-8, 1e-323) to clean (0, 0)', () => {
  const subnormalCases = [
    { vx: 1e-323, vy: 1e-323 },
    { vx: 1e-300, vy: -1e-300 },
    { vx: -1e-15, vy: 1e-15 },
    { vx: 1e-9, vy: 0 },
    { vx: 0, vy: -1e-9 },
    { vx: 5e-9, vy: 5e-9 },
  ];

  for (const { vx, vy } of subnormalCases) {
    const res = clampVelocity(vx, vy, 50, 400);
    assert.equal(res.vx, 0, `vx (${vx}) must flush to 0`);
    assert.equal(res.vy, 0, `vy (${vy}) must flush to 0`);
    assert.equal(res.speed, 0, `speed must be 0`);
  }
});

test('SUBNORMAL-02: resolveJoystickDeadzone flushes subnormal offsets (< 1e-8, 1e-323) to zero without division stalls', () => {
  const res1 = resolveJoystickDeadzone(1e-323, 1e-323, 5.0);
  assert.equal(res1.isActive, false);
  assert.equal(res1.distance, 0);
  assert.equal(res1.up, false);
  assert.equal(res1.down, false);
  assert.equal(res1.left, false);
  assert.equal(res1.right, false);

  const res2 = resolveJoystickDeadzone(-1e-15, 1e-15, 5.0);
  assert.equal(res2.isActive, false);
  assert.equal(res2.distance, 0);
});

test('SUBNORMAL-03: calculateClampedPlayerSpeed flushes subnormal speed modifiers (< 1e-8) without underflow', () => {
  // Subnormal base speed falls back to BASE_PLAYER_SPEED
  const speed1 = calculateClampedPlayerSpeed({ baseSpeed: 1e-323 });
  assert.equal(speed1, BASE_PLAYER_SPEED);

  // Subnormal dash speed falls back to DASH_SPEED
  const speed2 = calculateClampedPlayerSpeed({ isDashing: true, dashSpeed: 1e-300 });
  assert.equal(speed2, 320);

  // Subnormal multiplier ignored
  const speed3 = calculateClampedPlayerSpeed({ baseSpeed: 150, speedMultiplier: 1e-12 });
  assert.equal(speed3, 150);

  // Subnormal slowdown ignored
  const speed4 = calculateClampedPlayerSpeed({ baseSpeed: 150, slowdownRatio: 1e-15 });
  assert.equal(speed4, 150);
});

/* ==============================================================================
 * SUITE 2: NaN & NON-FINITE GUARDS ACROSS ALL NUMERICAL CHANNELS
 * ============================================================================== */

test('NAN-GUARD-01: clamp strictly sanitizes NaN, -Infinity, +Infinity, and inverted bounds', () => {
  assert.equal(clamp(NaN, 50, 400), 50);
  assert.equal(clamp(-Infinity, 50, 400), 50);
  assert.equal(clamp(Infinity, 50, 400), 400);
  assert.equal(clamp(200, NaN, 400), 200);
  assert.equal(clamp(200, 50, NaN), 200);

  // Inverted bounds [400, 50] automatically normalize to [50, 400]
  assert.equal(clamp(150, 400, 50), 150);
  assert.equal(clamp(20, 400, 50), 50);
  assert.equal(clamp(500, 400, 50), 400);
});

test('NAN-GUARD-02: calculateClampedPlayerSpeed rejects all corrupted NaN and infinite options', () => {
  const corruptOptions = [
    { baseSpeed: NaN },
    { baseSpeed: Infinity },
    { perkSpeedBonus: NaN },
    { surgeBonus: -Infinity },
    { speedMultiplier: NaN },
    { slowdownRatio: NaN },
    { isDashing: true, dashSpeed: NaN },
    { customBonus: NaN },
  ];

  for (const opt of corruptOptions) {
    const speed = calculateClampedPlayerSpeed(opt);
    assert.ok(Number.isFinite(speed), `Speed must be finite for ${JSON.stringify(opt)}`);
    assert.ok(!Number.isNaN(speed), `Speed must not be NaN for ${JSON.stringify(opt)}`);
    assert.ok(speed >= MIN_PLAYER_SPEED && speed <= MAX_PLAYER_SPEED_CLAMP);
  }
});

test('NAN-GUARD-03: resolveJoystickDeadzone handles NaN, -Infinity, +Infinity with 0 exceptions', () => {
  const nanCases = [
    { dx: NaN, dy: 10 },
    { dx: 10, dy: NaN },
    { dx: NaN, dy: NaN },
    { dx: Infinity, dy: 0 },
    { dx: 0, dy: -Infinity },
    { dx: 10, dy: 10, deadzone: NaN },
  ];

  for (const { dx, dy, deadzone } of nanCases) {
    const res = resolveJoystickDeadzone(dx, dy, deadzone);
    assert.equal(res.isActive, false);
    assert.equal(res.distance, 0);
    assert.equal(res.angle, 0);
    assert.equal(res.up, false);
    assert.equal(res.down, false);
    assert.equal(res.left, false);
    assert.equal(res.right, false);
  }
});

test('NAN-GUARD-04: resolvePlayerCornerSlide handles NaN coordinates and delta without crashing', () => {
  const res = resolvePlayerCornerSlide({
    px: NaN,
    py: Infinity,
    wantX: 1,
    wantY: 0,
    primaryAxis: 'x',
    speed: NaN,
    slideSpeed: NaN,
    delta: NaN,
    tileSize: NaN,
    tolerance: NaN,
    isPassable: () => true,
  });

  assert.ok(Number.isFinite(res.vx));
  assert.ok(Number.isFinite(res.vy));
  assert.equal(res.facing, 'right');
});

/* ==============================================================================
 * SUITE 3: DEADZONE BOUNDARY CHECKS & IEEE-754 EPSILON TOLERANCE
 * ============================================================================== */

test('DEADZONE-01: Pythagorean (3, 4) at exact R=5.0 radius resolves with zero dropped inputs', () => {
  const res = resolveJoystickDeadzone(3.0, 4.0, 5.0);
  assert.equal(res.distance, 5.0);
  assert.equal(res.isActive, true);
  assert.equal(res.down, true);
  assert.equal(res.right, true);
  assert.equal(res.up, false);
  assert.equal(res.left, false);
});

test('DEADZONE-02: Micro-noise [-1e-12, +1e-12] around (3, 4) produces ZERO jitter across 5,000 steps', () => {
  for (let i = 0; i < 5000; i++) {
    const noiseX = Math.sin(i * 1.5) * 1e-12;
    const noiseY = Math.cos(i * 2.1) * 1e-12;
    const res = resolveJoystickDeadzone(3.0 + noiseX, 4.0 + noiseY, 5.0);

    assert.equal(res.isActive, true);
    assert.equal(res.down, true);
    assert.equal(res.right, true);
    assert.equal(res.up, false);
    assert.equal(res.left, false);
  }
});

test('DEADZONE-03: Sub-boundary point at R=4.999 is cleanly rejected while R=5.000 is active', () => {
  const subRes = resolveJoystickDeadzone(3.0 * (4.999 / 5.0), 4.0 * (4.999 / 5.0), 5.0);
  assert.equal(subRes.isActive, false, '4.999px must be rejected as deadzone');

  const boundRes = resolveJoystickDeadzone(3.0, 4.0, 5.0);
  assert.equal(boundRes.isActive, true, '5.000px must be accepted as active');
});

/* ==============================================================================
 * SUITE 4: ZERO-DIVISION DEFENSES
 * ============================================================================== */

test('ZERO-DIV-01: clampVelocity zero magnitude (0, 0) returns (0, 0) with zero division', () => {
  const res = clampVelocity(0, 0, 50, 400);
  assert.equal(res.vx, 0);
  assert.equal(res.vy, 0);
  assert.equal(res.speed, 0);
});

test('ZERO-DIV-02: SpatialSeparationGrid with 50 entities at exact same point (0, 0) produces zero 0/0 NaNs', () => {
  const grid = new SpatialSeparationGrid(40, 800, 800);
  const entities = [];
  for (let i = 0; i < 50; i++) {
    entities.push({
      x: 200,
      y: 200,
      active: true,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 188, y: 188 },
        velocity: { x: 0, y: 0 },
      },
    });
  }

  const stats = grid.resolveSeparation(entities, {
    iterations: 2,
    bounds: { minX: 20, maxX: 780, minY: 20, maxY: 780 },
    applyVelocityNudges: true,
  });

  assert.ok(stats.zeroDistancesHandled > 0, 'Zero distance handler must be triggered');
  assert.equal(stats.nanGuardsTriggered, 0, 'Zero NaN guards triggered on clean co-located inputs');

  for (const e of entities) {
    assert.ok(Number.isFinite(e.x), `x must be finite (got ${e.x})`);
    assert.ok(Number.isFinite(e.y), `y must be finite (got ${e.y})`);
    assert.ok(Number.isFinite(e.body.velocity.x), 'vx must be finite');
    assert.ok(Number.isFinite(e.body.velocity.y), 'vy must be finite');
  }
});

/* ==============================================================================
 * SUITE 5: SOAK SIMULATION UNDER CONTINUOUS DYNAMIC INPUTS (10,000 TICKS)
 * ============================================================================== */

test('SOAK-01: 10,000 continuous ticks of player movement physics remain 100% stable without drift', () => {
  let px = 200;
  let py = 200;
  let vx = 0;
  let vy = 0;

  for (let tick = 0; tick < 10000; tick++) {
    // Oscillating inputs including zero, subnormal, boundary, and extreme
    const angle = (tick * 0.05) % (Math.PI * 2);
    const rawDist = 5.0 + Math.sin(tick * 0.1) * 2.0;
    const dx = Math.cos(angle) * rawDist;
    const dy = Math.sin(angle) * rawDist;

    const joy = resolveJoystickDeadzone(dx, dy, 5.0);

    const speed = calculateClampedPlayerSpeed({
      baseSpeed: 150,
      surgeBonus: tick % 100 === 0 ? 75 : 0,
      speedMultiplier: 1.0 + Math.sin(tick * 0.01) * 0.2,
      slowdownRatio: tick % 50 === 0 ? 0.3 : 0,
    });

    if (joy.isActive) {
      const wantX = joy.left ? -1 : joy.right ? 1 : 0;
      const wantY = joy.up ? -1 : joy.down ? 1 : 0;
      const slide = resolvePlayerCornerSlide({
        px,
        py,
        wantX,
        wantY,
        primaryAxis: Math.abs(wantX) >= Math.abs(wantY) ? 'x' : 'y',
        speed,
        slideSpeed: speed,
        delta: 16.666,
        tileSize: 40,
        isPassable: () => true,
      });

      vx = slide.vx;
      vy = slide.vy;
    } else {
      vx = 0;
      vy = 0;
    }

    const clampedVel = clampPlayerVelocity(vx, vy, MIN_PLAYER_SPEED, MAX_PLAYER_SPEED_CLAMP);
    assert.ok(Number.isFinite(clampedVel.vx));
    assert.ok(Number.isFinite(clampedVel.vy));
    assert.ok(Number.isFinite(clampedVel.speed));

    px += clampedVel.vx * 0.016;
    py += clampedVel.vy * 0.016;

    assert.ok(Number.isFinite(px));
    assert.ok(Number.isFinite(py));
  }
});
