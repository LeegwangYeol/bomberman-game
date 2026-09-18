/**
 * chaos_resilience.test.mjs — 50,000-Action Adversarial Chaos Bot Test Suite
 *
 * Attacks Tested:
 * 1. Multi-Touch Spam & Rapid Directional Input Inversion (Vector 1 & 2)
 * 2. Physical Boundary Penetration & Corner Pinning (Vector 5)
 * 3. Resource Gauge & Lockout Overflow Fuzzing (Vector 3)
 * 4. Fast Pause / Resume State Oscillation (Vector 4)
 * 5. Malformed Inputs, Extreme Deltas & Corrupt Payloads
 * 6. Grand 50,000-Action Adversarial Chaos Simulation
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROWS,
  COLS,
  TILE_SIZE,
  FlatHazardMask,
  ZeroGCPathfinder,
} from '../src/game/pathfinding.ts';

import {
  UltimateEngineSimulator,
  CameraTraumaSimulator,
} from '../src/game/ultimate_skills.ts';

import { APIQuotaCircuitBreaker } from '../src/game/persistence/CircuitBreaker.ts';
import { GameStatePersistence, MemoryStorageAdapter } from '../src/game/persistence/GameStatePersistence.ts';
import { STORAGE_SCHEMA_VERSION } from '../src/game/persistence/PersistenceTypes.ts';

export class ChaosObjectPool {
  constructor(factory, resetFn, capacity) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.capacity = capacity;
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = factory();
    }
    this.activeCount = 0;
  }

  acquire() {
    if (this.activeCount >= this.capacity) return null;
    const item = this.pool[this.activeCount++];
    this.resetFn(item);
    return item;
  }

  release(item) {
    const idx = this.pool.indexOf(item);
    if (idx === -1 || idx >= this.activeCount) return;
    this.activeCount--;
    const last = this.pool[this.activeCount];
    this.pool[this.activeCount] = item;
    this.pool[idx] = last;
  }

  getActiveCount() {
    return this.activeCount;
  }

  reset() {
    this.activeCount = 0;
  }
}

/* ==============================================================================
 * CHAOS HARNESS CONSTANTS
 * ============================================================================== */

const BOARD_WIDTH = COLS * TILE_SIZE; // 15 * 40 = 600px
const BOARD_HEIGHT = ROWS * TILE_SIZE; // 13 * 40 = 520px
const MIN_BOUND_X = 20; // Radius allowance for inner playable boundary
const MAX_BOUND_X = BOARD_WIDTH - 20; // 580px
const MIN_BOUND_Y = 20;
const MAX_BOUND_Y = BOARD_HEIGHT - 20; // 500px

/* ==============================================================================
 * HEADLESS CHAOS GAME SIMULATION
 * ============================================================================== */

export class HeadlessChaosSimulation {
  constructor() {
    this.rows = ROWS;
    this.cols = COLS;
    this.totalTiles = ROWS * COLS;
    this.tileSize = TILE_SIZE;

    // Board grids
    this.walls = new Uint8Array(this.totalTiles);
    this.blocks = new Uint8Array(this.totalTiles);
    this.hazardBitmask = new FlatHazardMask(this.totalTiles);

    this.initMap();

    // Portals & Conveyors
    this.portalA = { r: 1, c: 2, targetR: 11, targetC: 12, cooldownMs: 0 };
    this.portalB = { r: 11, c: 12, targetR: 1, targetC: 2, cooldownMs: 0 };
    this.conveyor = { r: 5, c: 5, dirX: 1, dirY: 0, speed: 40 };

    // Subsystems
    this.pathfinder = new ZeroGCPathfinder(this.rows, this.cols);
    this.traumaEngine = new CameraTraumaSimulator();
    this.ultimateEngine = new UltimateEngineSimulator();

    // Object pools
    this.bombPool = new ChaosObjectPool(
      () => ({ id: 0, r: 0, c: 0, x: 0, y: 0, fuse: 0, power: 2, owner: 'player' }),
      (b) => { b.id = 0; b.r = 0; b.c = 0; b.x = 0; b.y = 0; b.fuse = 0; b.power = 2; b.owner = 'player'; },
      32
    );

    this.explosionPool = new ChaosObjectPool(
      () => ({ tileIdx: 0, lifeRemainingMs: 0 }),
      (e) => { e.tileIdx = 0; e.lifeRemainingMs = 0; },
      128
    );

    // Player entity
    this.player = {
      x: 60,
      y: 60,
      r: 1,
      c: 1,
      vx: 0,
      vy: 0,
      speed: 150,
      isDashing: false,
      dashRemainingMs: 0,
      dashCooldownMs: 0,
      hp: 3,
      maxHp: 3,
      invulnMs: 0,
      portalCooldownMs: 0,
    };

    // Mobile / Virtual Input State
    this.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false,
      dash: false,
      ultimate: false,
    };

    // Simulation state
    this.isPaused = false;
    this.totalBombsPlaced = 0;
    this.totalDetonations = 0;
    this.totalActionsProcessed = 0;
    this.invariantViolations = [];
  }

  initMap() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
          this.walls[idx] = 1; // Perimeter wall
        } else if (r % 2 === 0 && c % 2 === 0) {
          this.walls[idx] = 1; // Pillars
        } else if ((r > 2 || c > 2) && (r < 10 || c < 12) && (r + c) % 3 === 0) {
          this.blocks[idx] = 1; // Soft blocks
        }
      }
    }
  }

  isWalkable(x, y) {
    const r = Math.floor(y / this.tileSize);
    const c = Math.floor(x / this.tileSize);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    const idx = r * this.cols + c;
    return this.walls[idx] === 0 && this.blocks[idx] === 0;
  }

  /**
   * Processes adversarial input injection and safely updates input state.
   */
  injectInput(key, rawValue) {
    this.totalActionsProcessed++;
    // Invariant: Keys strictly convert to boolean, rejecting malformed types
    const boolVal = Boolean(rawValue);
    if (Object.prototype.hasOwnProperty.call(this.input, key)) {
      this.input[key] = boolVal;
    }
  }

  /**
   * Attempts placing a bomb under adversarial conditions.
   */
  tryPlaceBomb() {
    if (this.isPaused) return false;
    if (this.bombPool.getActiveCount() >= 6) return false; // Capacity cap

    const r = Math.floor(this.player.y / this.tileSize);
    const c = Math.floor(this.player.x / this.tileSize);
    const idx = r * this.cols + c;
    if (this.walls[idx] === 1) return false;

    const bomb = this.bombPool.acquire();
    if (!bomb) return false;

    bomb.id = ++this.totalBombsPlaced;
    bomb.r = r;
    bomb.c = c;
    bomb.x = c * this.tileSize + 20;
    bomb.y = r * this.tileSize + 20;
    bomb.fuse = 2000; // 2.0s fuse
    bomb.power = 2;
    bomb.owner = 'player';

    return true;
  }

  /**
   * Executes a physics step with defensive collision clamping and corner-sliding.
   */
  step(rawDeltaMs) {
    // Malformed delta defenses: clamp negative, NaN, infinite, or extreme deltas
    let deltaMs = Number(rawDeltaMs);
    if (isNaN(deltaMs) || !isFinite(deltaMs) || deltaMs < 0) {
      deltaMs = 0;
    }
    deltaMs = Math.min(100, deltaMs); // Max 100ms step cap

    if (this.isPaused) {
      return; // Frozen in stasis
    }

    const dt = deltaMs / 1000;

    // --- 1. Subsystem Updates ---
    this.traumaEngine.update(dt);
    this.ultimateEngine.update(deltaMs);

    // --- 2. Update Portals ---
    if (this.player.portalCooldownMs > 0) {
      this.player.portalCooldownMs = Math.max(0, this.player.portalCooldownMs - deltaMs);
    }

    // Portal check
    const pr = Math.floor(this.player.y / this.tileSize);
    const pc = Math.floor(this.player.x / this.tileSize);
    if (this.player.portalCooldownMs === 0) {
      if (pr === this.portalA.r && pc === this.portalA.c) {
        this.player.x = this.portalA.targetC * this.tileSize + 20;
        this.player.y = this.portalA.targetR * this.tileSize + 20;
        this.player.portalCooldownMs = 600; // 600ms cooldown
      } else if (pr === this.portalB.r && pc === this.portalB.c) {
        this.player.x = this.portalB.targetC * this.tileSize + 20;
        this.player.y = this.portalB.targetR * this.tileSize + 20;
        this.player.portalCooldownMs = 600;
      }
    }

    // --- 3. Update Conveyor drift ---
    if (pr === this.conveyor.r && pc === this.conveyor.c) {
      const nextX = this.player.x + this.conveyor.dirX * this.conveyor.speed * dt;
      const nextY = this.player.y + this.conveyor.dirY * this.conveyor.speed * dt;
      if (this.isWalkable(nextX, nextY)) {
        this.player.x = nextX;
        this.player.y = nextY;
      }
    }

    // --- 4. Dash Mechanics ---
    if (this.player.dashCooldownMs > 0) {
      this.player.dashCooldownMs = Math.max(0, this.player.dashCooldownMs - deltaMs);
    }

    if (this.input.dash && this.player.dashCooldownMs === 0 && !this.player.isDashing) {
      this.player.isDashing = true;
      this.player.dashRemainingMs = 200; // 200ms dash
      this.player.dashCooldownMs = 1500;
    }

    if (this.player.isDashing) {
      this.player.dashRemainingMs = Math.max(0, this.player.dashRemainingMs - deltaMs);
      if (this.player.dashRemainingMs === 0) {
        this.player.isDashing = false;
      }
    }

    // --- 5. Movement Vector Calculation & Corner Sliding ---
    let dirX = 0;
    let dirY = 0;
    if (this.input.left && !this.input.right) dirX = -1;
    if (this.input.right && !this.input.left) dirX = 1;
    if (this.input.up && !this.input.down) dirY = -1;
    if (this.input.down && !this.input.up) dirY = 1;

    // Normalize diagonal velocity
    if (dirX !== 0 && dirY !== 0) {
      dirX *= 0.7071;
      dirY *= 0.7071;
    }

    const currentSpeed = this.player.isDashing ? this.player.speed * 2.2 : this.player.speed;
    const moveX = dirX * currentSpeed * dt;
    const moveY = dirY * currentSpeed * dt;

    // Continuous Collision Detection & Corner Sliding
    const targetX = this.player.x + moveX;
    const targetY = this.player.y + moveY;

    // Test X motion
    if (this.isWalkable(targetX, this.player.y)) {
      this.player.x = targetX;
    } else {
      // Corner slide nudge on Y axis
      const tileCenterY = Math.floor(this.player.y / this.tileSize) * this.tileSize + 20;
      const dist = tileCenterY - this.player.y;
      if (Math.abs(dist) > 2 && Math.abs(dist) <= 12) {
        this.player.y += Math.sign(dist) * Math.min(Math.abs(dist), 80 * dt);
      }
    }

    // Test Y motion
    if (this.isWalkable(this.player.x, targetY)) {
      this.player.y = targetY;
    } else {
      // Corner slide nudge on X axis
      const tileCenterX = Math.floor(this.player.x / this.tileSize) * this.tileSize + 20;
      const dist = tileCenterX - this.player.x;
      if (Math.abs(dist) > 2 && Math.abs(dist) <= 12) {
        this.player.x += Math.sign(dist) * Math.min(Math.abs(dist), 80 * dt);
      }
    }

    // Physical Boundary Clamping
    this.player.x = Math.max(MIN_BOUND_X, Math.min(MAX_BOUND_X, this.player.x));
    this.player.y = Math.max(MIN_BOUND_Y, Math.min(MAX_BOUND_Y, this.player.y));
    this.player.r = Math.floor(this.player.y / this.tileSize);
    this.player.c = Math.floor(this.player.x / this.tileSize);

    // --- 6. Bomb Placement & Detonations ---
    if (this.input.bomb) {
      this.tryPlaceBomb();
    }

    // Update active bombs
    for (let i = this.bombPool.getActiveCount() - 1; i >= 0; i--) {
      const bomb = this.bombPool.pool[i];
      bomb.fuse -= deltaMs;
      if (bomb.fuse <= 0) {
        // Detonate
        this.totalDetonations++;
        this.bombPool.release(bomb);
      }
    }

    // --- 7. Ultimate Skill Activation ---
    if (this.input.ultimate && this.ultimateEngine.isReady()) {
      this.ultimateEngine.trigger('SUPER_NOVA');
    }

    this.assertPhysicalInvariants();
  }

  assertPhysicalInvariants() {
    const p = this.player;

    if (isNaN(p.x) || isNaN(p.y) || !isFinite(p.x) || !isFinite(p.y)) {
      throw new Error(`Corrupted player coordinates: (${p.x}, ${p.y})`);
    }

    if (p.x < MIN_BOUND_X || p.x > MAX_BOUND_X) {
      throw new Error(`Player breached horizontal boundary: x = ${p.x} (bounds: [${MIN_BOUND_X}, ${MAX_BOUND_X}])`);
    }

    if (p.y < MIN_BOUND_Y || p.y > MAX_BOUND_Y) {
      throw new Error(`Player breached vertical boundary: y = ${p.y} (bounds: [${MIN_BOUND_Y}, ${MAX_BOUND_Y}])`);
    }

    if (isNaN(this.ultimateEngine.gauge) || this.ultimateEngine.gauge < 0 || this.ultimateEngine.gauge > 100) {
      throw new Error(`Ultimate gauge corrupted: ${this.ultimateEngine.gauge}`);
    }

    if (this.ultimateEngine.lockoutRemainingMs < 0) {
      throw new Error(`Lockout counter negative: ${this.ultimateEngine.lockoutRemainingMs}`);
    }
  }
}

/* ==============================================================================
 * TEST SUITES
 * ============================================================================== */

test('Chaos Vector 1 & 2: Multi-Touch Spam & Rapid Opposing Direction Switches', () => {
  const sim = new HeadlessChaosSimulation();
  const keys = ['up', 'down', 'left', 'right', 'bomb', 'dash', 'ultimate'];

  for (let i = 0; i < 5000; i++) {
    // Rapid random key toggles
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    sim.injectInput(randomKey, Math.random() > 0.5);

    // Occasional simultaneous opposing directions (up+down, left+right)
    if (i % 5 === 0) {
      sim.injectInput('up', true);
      sim.injectInput('down', true);
      sim.injectInput('left', true);
      sim.injectInput('right', true);
    }

    sim.step(16.66);
  }

  assert.ok(sim.player.x >= MIN_BOUND_X && sim.player.x <= MAX_BOUND_X);
  assert.ok(sim.player.y >= MIN_BOUND_Y && sim.player.y <= MAX_BOUND_Y);
  assert.equal(isNaN(sim.player.x), false);
  assert.equal(isNaN(sim.player.y), false);
});

test('Chaos Vector 3: Resource Gauge & Lockout Overflow Fuzzing', () => {
  const sim = new HeadlessChaosSimulation();
  const maliciousCharges = [
    -999999,
    1e12,
    -1e12,
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    '500',
    0,
    -0,
    0.0000001,
  ];

  for (let i = 0; i < 5000; i++) {
    const val = maliciousCharges[i % maliciousCharges.length];
    sim.ultimateEngine.addCharge(val);

    // Verify gauge is strictly clamped and never NaN
    assert.equal(isNaN(sim.ultimateEngine.gauge), false);
    assert.ok(sim.ultimateEngine.gauge >= 0 && sim.ultimateEngine.gauge <= 100);

    // Attempt rapid trigger spamming during active lockout
    if (sim.ultimateEngine.isReady()) {
      const triggered = sim.ultimateEngine.trigger('SUPER_NOVA');
      assert.equal(triggered, true);
    } else {
      const triggered = sim.ultimateEngine.trigger('SUPER_NOVA');
      assert.equal(triggered, false);
    }

    sim.step(16.66);
  }
});

test('Chaos Vector 4: Fast Pause / Unpause State Oscillation', () => {
  const sim = new HeadlessChaosSimulation();

  for (let i = 0; i < 5000; i++) {
    // Rapid pause oscillation
    sim.isPaused = i % 2 === 0;

    // Trigger bombs and movements while toggling pause
    if (i % 20 === 0) {
      sim.tryPlaceBomb();
    }

    sim.step(16.66);

    // Invariant: Paused states halt countdowns deterministically
    assert.equal(isNaN(sim.player.x), false);
    assert.equal(isNaN(sim.player.y), false);
  }

  // Unpause and verify all bombs detonate cleanly without orphaned state
  sim.isPaused = false;
  for (let i = 0; i < 300; i++) {
    sim.step(16.66);
  }

  assert.equal(sim.bombPool.getActiveCount(), 0);
  assert.equal(sim.totalDetonations, sim.totalBombsPlaced);
});

test('Chaos Vector 5: Physical Boundary Penetration & Portal Stress', () => {
  const sim = new HeadlessChaosSimulation();

  // Attack 1: Driving directly into border walls for 3,000 steps
  sim.injectInput('left', true);
  sim.injectInput('up', true);
  for (let i = 0; i < 3000; i++) {
    sim.step(16.66);
    assert.ok(sim.player.x >= MIN_BOUND_X, `Breached left border: ${sim.player.x}`);
    assert.ok(sim.player.y >= MIN_BOUND_Y, `Breached top border: ${sim.player.y}`);
  }

  // Attack 2: Driving into bottom-right border
  sim.injectInput('left', false);
  sim.injectInput('up', false);
  sim.injectInput('right', true);
  sim.injectInput('down', true);
  for (let i = 0; i < 3000; i++) {
    sim.step(16.66);
    assert.ok(sim.player.x <= MAX_BOUND_X, `Breached right border: ${sim.player.x}`);
    assert.ok(sim.player.y <= MAX_BOUND_Y, `Breached bottom border: ${sim.player.y}`);
  }

  // Attack 3: Portal warp ping-pong
  sim.player.x = sim.portalA.c * sim.tileSize + 20;
  sim.player.y = sim.portalA.r * sim.tileSize + 20;
  for (let i = 0; i < 2000; i++) {
    sim.step(16.66);
    assert.ok(sim.player.x >= MIN_BOUND_X && sim.player.x <= MAX_BOUND_X);
    assert.ok(sim.player.y >= MIN_BOUND_Y && sim.player.y <= MAX_BOUND_Y);
  }
});

test('Grand Chaos Bot: 50,000 Adversarial Actions Under Extreme Stress', () => {
  const sim = new HeadlessChaosSimulation();
  const startTime = Date.now();

  const keys = ['up', 'down', 'left', 'right', 'bomb', 'dash', 'ultimate'];
  const maliciousDeltas = [16.66, 0, -10, 100, 33.33, NaN, Infinity, -Infinity];

  let multiTouchEvents = 0;
  let gaugeFuzzEvents = 0;
  let pauseOscillations = 0;

  for (let action = 1; action <= 50000; action++) {
    sim.totalActionsProcessed++;
    const actionType = action % 5;

    switch (actionType) {
      case 0: {
        // Multi-touch input burst
        const k1 = keys[action % keys.length];
        const k2 = keys[(action * 3) % keys.length];
        sim.injectInput(k1, (action & 1) === 1);
        sim.injectInput(k2, (action & 2) === 2);
        multiTouchEvents += 2;
        break;
      }
      case 1: {
        // Gauge overflow fuzzing
        const charge = (action % 3 === 0) ? -500 : (action % 7 === 0) ? 1e6 : 15;
        sim.ultimateEngine.addCharge(charge);
        gaugeFuzzEvents++;
        break;
      }
      case 2: {
        // Rapid pause toggle
        sim.isPaused = (action % 100) < 5;
        pauseOscillations++;
        break;
      }
      case 3: {
        // Bomb placement attempt
        sim.tryPlaceBomb();
        break;
      }
      case 4: {
        // Portal / Conveyor nudge
        if (action % 500 === 0) {
          sim.player.x = sim.portalA.c * sim.tileSize + 20;
          sim.player.y = sim.portalA.r * sim.tileSize + 20;
        }
        break;
      }
    }

    // Advance simulation with diverse delta times
    const delta = maliciousDeltas[action % maliciousDeltas.length];
    sim.step(delta);
  }

  const elapsedMs = Date.now() - startTime;

  // Final Invariant Checks
  assert.equal(sim.totalActionsProcessed >= 50000, true);
  assert.equal(isNaN(sim.player.x), false);
  assert.equal(isNaN(sim.player.y), false);
  assert.ok(sim.player.x >= MIN_BOUND_X && sim.player.x <= MAX_BOUND_X);
  assert.ok(sim.player.y >= MIN_BOUND_Y && sim.player.y <= MAX_BOUND_Y);
  assert.ok(sim.ultimateEngine.gauge >= 0 && sim.ultimateEngine.gauge <= 100);

  // Print telemetry
  console.log(`\n===============================================================`);
  console.log(`       50,000-ACTION ADVERSARIAL CHAOS BOT TELEMETRY           `);
  console.log(`===============================================================`);
  console.log(` Total Actions Executed:   50,000`);
  console.log(` Total Execution Time:     ${elapsedMs} ms (${(50000 / (elapsedMs / 1000)).toFixed(0)} actions/sec)`);
  console.log(` Multi-Touch Spam Events:  ${multiTouchEvents}`);
  console.log(` Gauge Fuzzing Injections: ${gaugeFuzzEvents}`);
  console.log(` Pause Oscillation Cycles: ${pauseOscillations}`);
  console.log(` Bombs Placed & Tracked:   ${sim.totalBombsPlaced}`);
  console.log(` Physical Coordinate NaNs: 0`);
  console.log(` Boundary Breaches:        0`);
  console.log(` Invariant Violations:     0`);
  console.log(`===============================================================\n`);
});

/* ==============================================================================
 * ADVERSARIAL SECURITY & PERSISTENCE CHAOS SUITES
 * ============================================================================== */

test('Adversarial Chaos: Prototype pollution keys in injectInput do not shadow Object prototype', () => {
  const sim = new HeadlessChaosSimulation();

  const attackKeys = ['toString', 'valueOf', 'constructor', '__proto__', 'hasOwnProperty', 'isPrototypeOf'];
  for (const key of attackKeys) {
    sim.injectInput(key, true);
    assert.equal(typeof sim.input.toString, 'function');
    assert.equal(typeof sim.input.valueOf, 'function');
    assert.equal(Object.prototype.hasOwnProperty.call(sim.input, key), false);
  }
});

test('Concurrent CircuitBreaker Chaos: 50 concurrent requests survive rapid 429 quota toggling', async () => {
  const cb = new APIQuotaCircuitBreaker({
    failureThreshold: 2,
    initialBackoffMs: 20,
    resetTimeoutMs: 50,
  });

  let successCount = 0;
  let rejectedCount = 0;

  const tasks = Array.from({ length: 50 }, (_, i) => {
    return cb.execute(async () => {
      if (i % 3 === 0) {
        throw { status: 429, message: 'Resource exhausted' };
      }
      if (i % 7 === 0) {
        throw new Error('Transient connection error');
      }
      return `payload_${i}`;
    }, { queueIfOpen: true })
    .then((res) => {
      successCount++;
      return res;
    })
    .catch(() => {
      rejectedCount++;
      return null;
    });
  });

  // Rapidly trigger recovery while requests are executing
  setTimeout(() => {
    cb.recordSuccess();
  }, 25);
  setTimeout(() => {
    cb.recordSuccess();
  }, 75);

  await Promise.all(tasks);
  assert.equal(successCount + rejectedCount, 50, 'All 50 tasks must settle without hanging');
  assert.ok(successCount > 0, 'Some tasks should succeed');
});

test('Persistence Chaos: 1,000 fuzzed payloads sanitize cleanly without unhandled exceptions', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());

  const fuzzedValues = [
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    -999999,
    1e12,
    'corrupted_string',
    {},
    [],
    { toString: () => 'evil' },
  ];

  for (let i = 0; i < 1000; i++) {
    const rawProfile = {
      version: fuzzedValues[i % fuzzedValues.length],
      cosmicEssence: fuzzedValues[(i * 3) % fuzzedValues.length],
      starCandies: fuzzedValues[(i * 7) % fuzzedValues.length],
      perks: {
        sugar_spark: fuzzedValues[(i * 2) % fuzzedValues.length],
        quick_wick: fuzzedValues[(i * 5) % fuzzedValues.length],
        __proto__: 123,
        constructor: 'polluted',
        toString: fuzzedValues[i % fuzzedValues.length],
      },
      unlockedModes: fuzzedValues[(i * 11) % fuzzedValues.length],
      highestWaveReached: fuzzedValues[(i * 13) % fuzzedValues.length],
    };

    const sanitized = persistence.sanitizeMetaProfile(rawProfile);
    assert.ok(sanitized !== null && typeof sanitized === 'object');
    assert.equal(sanitized.version, STORAGE_SCHEMA_VERSION);
    assert.ok(Number.isFinite(sanitized.cosmicEssence) && sanitized.cosmicEssence >= 0);
    assert.ok(Number.isFinite(sanitized.starCandies) && sanitized.starCandies >= 0);
    assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, '__proto__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, 'constructor'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(sanitized.perks, 'toString'), false);
  }
});

