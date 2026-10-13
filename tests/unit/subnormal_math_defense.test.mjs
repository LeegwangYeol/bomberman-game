/**
 * tests/unit/subnormal_math_defense.test.mjs
 *
 * Comprehensive Mathematical Defense Verification:
 * 1. Subnormal Floats (1e-323, Number.MIN_VALUE) & Zero-Length Vectors in Entity Velocities
 * 2. clampVelocity and normalizeVector produce stable 0 vectors ({vx: 0, vy: 0, speed: 0} / {x: 0, y: 0, length: 0})
 * 3. Mixed normal + subnormal vectors cleanly flush denormal components without propagation
 * 4. Hazard Diffusion Grids (Miasma, Magma, Volt, Frost, Nebula, Solar, Abyssal) numerical stability under subnormal inputs
 * 5. Distance queries at zero-length, subnormal deltas, and co-located origins across physics, hazards, and UI
 * 6. Physics Catastrophic Cancellation Defense: Pairwise coordinate delta subtraction, deadzones, and corner slide
 * 7. Audio Voice Pool & Procedural Sound Synthesis: Subnormal float (1e-323) flushing and time addition catastrophic cancellation guards
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

import {
  resolveJoystickDeadzone,
  calculateClampedPlayerSpeed,
  resolvePlayerCornerSlide,
  FLOAT_EPSILON,
  DEADZONE_EPSILON,
} from '../../src/game/entities/PlayerMovementPhysics.ts';

import {
  AudioVoice,
  AudioVoicePool,
} from '../../src/game/pooling/AudioVoicePool.ts';

import { DynamicHazardAudio } from '../../src/game/hazards/DynamicHazardAudio.ts';
import { VoltHazardAudio } from '../../src/game/hazards/VoltHazardAudio.ts';
import { MagmaHazardAudio } from '../../src/game/hazards/MagmaHazardAudio.ts';
import { MiasmaHazardAudio } from '../../src/game/hazards/MiasmaHazardAudio.ts';
import { SolarHazardAudio } from '../../src/game/hazards/SolarHazardAudio.ts';
import { NebulaHazardAudio } from '../../src/game/hazards/NebulaHazardAudio.ts';
import { AbyssalHazardAudio } from '../../src/game/hazards/AbyssalHazardAudio.ts';
import { webAudioSynth } from '../../src/game/ultimate_skills.ts';

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

/* ==============================================================================
 * MOCK WEB AUDIO INFRASTRUCTURE FOR HEADLESS SUBNORMAL AUDIO FUZZING
 * ============================================================================== */

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this.events = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'setValueAtTime', val, time });
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'linearRampToValueAtTime', val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.events.push({ type: 'exponentialRampToValueAtTime', val, time });
  }
  cancelScheduledValues(time) {
    this.events.push({ type: 'cancelScheduledValues', time });
  }
}

class MockAudioNode {
  constructor() {
    this.connectedTo = [];
    this.disconnected = false;
  }
  connect(dest) {
    this.connectedTo.push(dest);
    this.disconnected = false;
  }
  disconnect() {
    this.connectedTo = [];
    this.disconnected = true;
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.started = false;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.Q = new MockAudioParam(1);
  }
}

class MockBufferSourceNode extends MockAudioNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.onended = null;
  }
  start() {}
  stop() {}
}

class MockAudioBuffer {
  constructor(length = 1024, sampleRate = 44100) {
    this.length = length;
    this.sampleRate = sampleRate;
    this._data = new Float32Array(length);
  }
  getChannelData() {
    return this._data;
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new MockAudioNode();
  }
  createOscillator() {
    return new MockOscillatorNode();
  }
  createGain() {
    return new MockGainNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createBuffer(channels, length, sampleRate) {
    return new MockAudioBuffer(length, sampleRate);
  }
  createBufferSource() {
    return new MockBufferSourceNode();
  }
  async resume() {
    this.state = 'running';
  }
}

/* ==============================================================================
 * SUITE 4: PHYSICS CATASTROPHIC CANCELLATION & EXTREME PRECISION UNDERFLOW
 * ============================================================================== */

test('PHYS-CANCEL-01: Pairwise delta subtraction on near-identical coordinates avoids catastrophic cancellation and zero division', () => {
  const grid = new SpatialSeparationGrid(40, 1000, 1000);

  // 1. Entities positioned with difference dx = 1e-16 (near machine epsilon for double)
  // dx * dx = 1e-32, below 1e-8 threshold -> must trigger zero division defense cleanly
  const entities1 = [
    {
      x: 500.0000000000001,
      y: 500.0000000000001,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 488, y: 488 },
        velocity: { x: 100.00000000000001, y: 50 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
    {
      x: 500.0000000000002,
      y: 500.0000000000002,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 488, y: 488 },
        velocity: { x: 100.00000000000003, y: 50 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
  ];

  const stats1 = grid.resolveSeparation(entities1, {
    iterations: 2,
    separationFactor: 0.5,
    applyVelocityNudges: true,
  });

  assert.equal(stats1.nanGuardsTriggered, 0, 'No NaNs triggered during near-identical coordinate resolution');
  assert.ok(stats1.zeroDistancesHandled > 0, 'Zero-distance defense triggered for near-epsilon delta');
  assert.ok(Number.isFinite(entities1[0].x));
  assert.ok(Number.isFinite(entities1[0].y));
  assert.ok(Number.isFinite(entities1[1].x));
  assert.ok(Number.isFinite(entities1[1].y));
  assert.ok(Number.isFinite(entities1[0].body.velocity.x));
  assert.ok(Number.isFinite(entities1[0].body.velocity.y));
  assert.ok(Number.isFinite(entities1[1].body.velocity.x));
  assert.ok(Number.isFinite(entities1[1].body.velocity.y));

  // 2. Pair with subnormal coordinate difference: 1e-323
  const entities2 = [
    {
      x: 300,
      y: 300,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 288, y: 288 },
        velocity: { x: 0, y: 0 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
    {
      x: 300 + 1e-323,
      y: 300 - 1e-323,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 288, y: 288 },
        velocity: { x: 1e-323, y: -1e-323 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
  ];

  const stats2 = grid.resolveSeparation(entities2, {
    iterations: 2,
    separationFactor: 0.5,
    applyVelocityNudges: true,
  });

  assert.equal(stats2.nanGuardsTriggered, 0);
  assert.ok(Number.isFinite(entities2[0].x));
  assert.ok(Number.isFinite(entities2[1].x));
  assert.ok(Number.isFinite(entities2[0].body.velocity.x));
  assert.ok(Number.isFinite(entities2[0].body.velocity.y));
  assert.ok(Number.isFinite(entities2[1].body.velocity.x));
  assert.ok(Number.isFinite(entities2[1].body.velocity.y));

  // 3. Subnormal velocities without displacement nudges must flush cleanly to 0
  const entities3 = [
    {
      x: 100,
      y: 100,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 88, y: 88 },
        velocity: { x: 1e-323, y: -1e-323 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
    {
      x: 500, // Non-overlapping
      y: 500,
      active: true,
      isDead: false,
      collisionRadius: 12,
      mass: 1.0,
      body: {
        position: { x: 488, y: 488 },
        velocity: { x: 1e-323, y: -1e-323 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: () => {},
        updateFromGameObject: () => {},
      },
    },
  ];

  grid.resolveSeparation(entities3, {
    iterations: 1,
    separationFactor: 0.5,
    applyVelocityNudges: false,
  });

  assert.equal(entities3[0].body.velocity.x, 0, 'Subnormal vx must be flushed to 0');
  assert.equal(entities3[0].body.velocity.y, 0, 'Subnormal vy must be flushed to 0');
  assert.equal(entities3[1].body.velocity.x, 0, 'Subnormal vx must be flushed to 0');
  assert.equal(entities3[1].body.velocity.y, 0, 'Subnormal vy must be flushed to 0');
});

test('PHYS-CANCEL-02: Player movement physics handles subnormal inputs and boundary values without catastrophic cancellation', () => {
  // 1. resolveJoystickDeadzone with subnormal floats (1e-323)
  const j1 = resolveJoystickDeadzone(1e-323, 1e-323, 5);
  assert.equal(j1.isActive, false);
  assert.equal(j1.distance, 0);
  assert.equal(j1.up, false);
  assert.equal(j1.down, false);
  assert.equal(j1.left, false);
  assert.equal(j1.right, false);
  assert.equal(j1.angle, 0);

  // 2. Exact boundary Pythagorean (3, 4) at deadzone = 5.0
  // distSq = 3^2 + 4^2 = 25. DEADZONE_EPSILON prevents precision dropouts.
  const j2 = resolveJoystickDeadzone(3, 4, 5);
  assert.equal(j2.isActive, true);
  assert.equal(j2.distance, 5);
  assert.equal(j2.down, true);
  assert.equal(j2.right, true);

  // 3. calculateClampedPlayerSpeed with subnormal inputs (1e-323)
  const s1 = calculateClampedPlayerSpeed({
    baseSpeed: 1e-323,
    perkSpeedBonus: 1e-323,
    surgeBonus: 1e-323,
    speedMultiplier: 1e-323,
    slowdownRatio: 1e-323,
  });
  assert.equal(s1, 150, 'Subnormal baseSpeed and modifiers flush to BASE_PLAYER_SPEED');

  // 4. resolvePlayerCornerSlide under subnormal position delta and delta time
  const slide = resolvePlayerCornerSlide({
    px: 200 + 1e-323,
    py: 200 + 1e-323,
    wantX: 1,
    wantY: 0,
    primaryAxis: 'x',
    speed: 150,
    slideSpeed: 150,
    delta: 1e-323,
    tileSize: 40,
    tolerance: 8,
    isPassable: () => true,
  });
  assert.ok(Number.isFinite(slide.vx));
  assert.ok(Number.isFinite(slide.vy));
  assert.equal(slide.facing, 'right');
});

/* ==============================================================================
 * SUITE 5: AUDIO VOICE POOL & SYNTHESIS SUBNORMAL FLOAT FLUSHING & DEFENSE
 * ============================================================================== */

test('AUDIO-DEFENSE-01: AudioVoice.play flushes subnormal gain (1e-323) to 0 and silences voice', () => {
  const mockCtx = new MockAudioContext();
  const voice = new AudioVoice(1, mockCtx);

  // 1. Play tone with subnormal gain (1e-323)
  voice.play(
    {
      frequency: 440,
      duration: 0.1,
      gain: 1e-323,
    },
    mockCtx
  );

  // Voice must immediately be forced silent and not remain busy
  assert.equal(voice.isBusy, false, 'Voice must be silenced for subnormal gain');

  // 2. AudioVoicePool.playTone with subnormal gain returns null and consumes 0 voices
  const pool = new AudioVoicePool(4, mockCtx);
  const subnormalGains = [1e-323, -1e-323, Number.MIN_VALUE, -Number.MIN_VALUE, 1e-16];
  for (const g of subnormalGains) {
    const toneVoice = pool.playTone({
      frequency: 440,
      duration: 0.1,
      gain: g,
    });
    assert.equal(toneVoice, null, `playTone with gain ${g} must return null`);
    assert.equal(pool.getActiveCount(), 0, 'Active voice count must remain 0');
  }

  pool.destroy();
});

test('AUDIO-DEFENSE-02: Frequency and filter ramps avoid catastrophic cancellation under subnormal durations (< 1e-4s, 1e-323)', () => {
  const mockCtx = new MockAudioContext();
  mockCtx.currentTime = 5.0; // Non-zero base time
  const voice = new AudioVoice(1, mockCtx);

  // In IEEE-754 double precision: 5.0 + 1e-323 === 5.0 (catastrophic cancellation).
  // AudioVoice must guard against this by setting value immediately at now instead of ramp.
  voice.play(
    {
      frequency: 440,
      duration: 0.2,
      gain: 0.25,
      frequencyRamp: {
        target: 880,
        duration: 1e-323,
      },
      filter: {
        type: 'lowpass',
        frequency: 1000,
        rampTarget: 200,
        rampDuration: 1e-323,
      },
    },
    mockCtx
  );

  // Verify frequency automation: immediate setValueAtTime used instead of ramp at identical timestamp
  const freqEvents = voice.osc.frequency.events;
  const setTargetEvent = freqEvents.find((e) => e.type === 'setValueAtTime' && e.val === 880);
  assert.ok(setTargetEvent, 'Frequency ramp duration <= 1e-4s must flush to immediate setValueAtTime');

  const rampFreqEvent = freqEvents.find((e) => e.type === 'linearRampToValueAtTime' || e.type === 'exponentialRampToValueAtTime');
  assert.equal(rampFreqEvent, undefined, 'No ramp event scheduled for subnormal duration');

  // Verify filter frequency automation: immediate setValueAtTime used
  const filterEvents = voice.filter.frequency.events;
  const setFilterEvent = filterEvents.find((e) => e.type === 'setValueAtTime' && e.val === 200);
  assert.ok(setFilterEvent, 'Filter ramp duration <= 1e-4s must flush to immediate setValueAtTime');

  voice.disconnect();
});

test('AUDIO-DEFENSE-03: AudioVoicePool voice stealing remaining duration flushes subnormal time deltas (1e-323)', () => {
  const mockCtx = new MockAudioContext();
  mockCtx.currentTime = 10.0;
  const pool = new AudioVoicePool(2, mockCtx);

  // Acquire both voices and set initial busy endTimes
  const v0 = pool.acquireVoice();
  v0.endTime = 15.0;
  const v1 = pool.acquireVoice();
  v1.endTime = 20.0;
  assert.ok(v0 && v1);

  // Set voice 0 to expire with a subnormal float delta (10.0 + 1e-323)
  v0.endTime = 10.0 + 1e-323;
  // Set voice 1 to expire in the future (20.0s)
  v1.endTime = 20.0;

  // When acquiring a voice under capacity exhaustion, remaining duration for v0 flushes to 0
  const stolen = pool.acquireVoice();
  assert.ok(stolen !== null);
  assert.equal(stolen.id, 0, 'Voice with subnormal remaining delta must be chosen for stealing');
  assert.equal(stolen.isBusy, true);

  pool.destroy();
});

test('AUDIO-DEFENSE-04: Procedural hazard audio synthesizers and WebAudioSynth reject subnormal durations and gains', () => {
  const mockCtx = new MockAudioContext();

  // 1. DynamicHazardAudio
  const dynAudio = new DynamicHazardAudio(mockCtx);
  assert.doesNotThrow(() => dynAudio.playWhiteNoiseBurst(1e-323, 1e-323));
  assert.equal(dynAudio.activeTransientNodes.size, 0, 'DynamicHazardAudio creates 0 nodes for subnormal burst');

  // 2. VoltHazardAudio
  const voltAudio = new VoltHazardAudio(mockCtx);
  const vRes = voltAudio.playWhiteNoiseBurst(0, 1e-323, 1e-323);
  assert.equal(vRes, false, 'VoltHazardAudio rejects subnormal burst');
  assert.equal(voltAudio.activeTransientNodes.size, 0);

  // 3. MagmaHazardAudio
  const magmaAudio = new MagmaHazardAudio(mockCtx);
  const mRes = magmaAudio.playFilteredNoiseBurst(1e-323, 1000, 200, 1e-323);
  assert.equal(mRes, false, 'MagmaHazardAudio rejects subnormal burst');
  assert.equal(magmaAudio.activeTransientNodes.size, 0);

  // 4. MiasmaHazardAudio
  const miasmaAudio = new MiasmaHazardAudio(mockCtx);
  assert.doesNotThrow(() => miasmaAudio.playFilteredNoiseBurst(1e-323, 1000, 200, 1e-323));
  assert.equal(miasmaAudio.activeTransientNodes.size, 0);

  // 5. SolarHazardAudio
  assert.doesNotThrow(() => SolarHazardAudio.playWhiteNoiseBurst(1e-323));

  // 6. NebulaHazardAudio
  assert.doesNotThrow(() => NebulaHazardAudio.playEclipseWhiteNoisePulse(1e-323));

  // 7. AbyssalHazardAudio
  assert.doesNotThrow(() => AbyssalHazardAudio.playRushingTidalNoisePulse(1e-323));

  // 8. WebAudioSynth
  assert.doesNotThrow(() => webAudioSynth.playSubBassBoom(1e-323, 1e-323, 1e-323));

  dynAudio.destroy();
  voltAudio.destroy();
  magmaAudio.destroy();
  miasmaAudio.destroy();
});
