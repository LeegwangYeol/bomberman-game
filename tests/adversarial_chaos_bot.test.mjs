/**
 * adversarial_chaos_bot.test.mjs
 *
 * 50,000-Action Adversarial Chaos Bot & Game State Invariant Verification Suite
 *
 * Comprehensive stress and fuzz testing against Bomberman game state:
 * 1. 50,000-Action Grand Adversarial Chaos Simulation (Full State Invariants)
 * 2. Multi-Touch Spam, Polar Joysticks & Rapid Opposing Direction Inversion (10,000 Actions)
 * 3. Extreme Stat Mutations, Corrupted Perks & Buff Stacking Clamping Invariants (10,000 Actions)
 * 4. Edge-Case Boundary Conditions, High-Velocity Subpixel Corner Sliding & Portal Warps (10,000 Actions)
 * 5. Dynamic Dual-Hazard Chaos (Quantum Spire + Gravitational Singularity) Under Malformed Deltas (10,000 Actions)
 * 6. Zero-GC Memory Soak & Heap Drift Invariant Across 50,000 Continuous Actions (< 0.25 MB drift)
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

import {
  ROWS,
  COLS,
  TILE_SIZE,
  TOTAL_TILES,
  FlatHazardMask,
  ZeroGCPathfinder,
  coordToIdx,
} from '../src/game/pathfinding.ts';

import {
  calculateClampedPlayerSpeed,
  calculateSpeedLevel,
  BASE_PLAYER_SPEED,
  DASH_SPEED,
  MIN_PLAYER_SPEED,
  MAX_PLAYER_SPEED_CLAMP,
  CONVEYOR_DRIFT_SPEED,
  PORTAL_COOLDOWN_MS,
  MAX_BOMBS_CAP,
  MAX_BOMB_POWER_CAP,
} from '../src/game/gameplay_mechanics.ts';

import {
  UltimateEngineSimulator,
  CameraTraumaSimulator,
} from '../src/game/ultimate_skills.ts';

import {
  DynamicHazard,
  HazardLifecycleState,
  GravityHazard,
  GravityLifecycleState,
} from '../src/game/hazards/index.ts';

import {
  PerkTreeManager,
  ScalingEngine,
} from '../src/game/progression/index.ts';

import {
  APIQuotaCircuitBreaker,
  GameStatePersistence,
  MemoryStorageAdapter,
} from '../src/game/persistence/index.ts';

import { ObjectPool } from '../src/game/pooling/ObjectPool.ts';

/* ==============================================================================
 * ARENA CONSTANTS & INVARIANT THRESHOLDS
 * ============================================================================== */

const BOARD_WIDTH = COLS * TILE_SIZE; // 15 * 40 = 600px
const BOARD_HEIGHT = ROWS * TILE_SIZE; // 13 * 40 = 520px
const MIN_BOUND_X = 20; // 24x24 hitbox radius margin inside perimeter wall
const MAX_BOUND_X = BOARD_WIDTH - 20; // 580px
const MIN_BOUND_Y = 20;
const MAX_BOUND_Y = BOARD_HEIGHT - 20; // 500px

/* ==============================================================================
 * ADVERSARIAL CHAOS SIMULATION HARNESS
 * ============================================================================== */

export class AdversarialChaosEngine {
  constructor() {
    this.rows = ROWS;
    this.cols = COLS;
    this.totalTiles = TOTAL_TILES;
    this.tileSize = TILE_SIZE;

    // 1. Grid structures
    this.walls = new Uint8Array(this.totalTiles);
    this.blocks = new Uint8Array(this.totalTiles);
    this.hazardMask = new FlatHazardMask(this.totalTiles);
    this.initMap();

    // 2. Spatial Gimmicks (Portals & Conveyors)
    this.portalA = { r: 1, c: 13, targetR: 11, targetC: 1, cooldownMs: 0 };
    this.portalB = { r: 11, c: 1, targetR: 1, targetC: 13, cooldownMs: 0 };
    this.conveyor = { r: 7, c: 7, dirX: 1, dirY: 0, speed: CONVEYOR_DRIFT_SPEED };

    // 3. Subsystems
    this.pathfinder = new ZeroGCPathfinder(this.rows, this.cols);
    this.ultimateEngine = new UltimateEngineSimulator();
    this.traumaEngine = new CameraTraumaSimulator();
    this.dynamicHazard = new DynamicHazard();
    this.dynamicHazard.init();
    this.dynamicHazard.start('CLIMAX');

    this.gravityHazard = new GravityHazard();
    this.gravityHazard.init(6, 7);
    this.gravityHazard.start('CLIMAX');

    this.circuitBreaker = new APIQuotaCircuitBreaker({
      failureThreshold: 3,
      initialBackoffMs: 25,
      resetTimeoutMs: 100,
    });
    this.persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());

    // 4. Object Pools
    this.bombPool = new ObjectPool({
      capacity: 32,
      factory: (i) => ({
        id: i,
        r: 0,
        c: 0,
        x: 0,
        y: 0,
        fuseMs: 2000,
        power: 2,
        owner: 'player',
        type: 'REGULAR',
      }),
      reset: (b) => {
        b.r = 0;
        b.c = 0;
        b.x = 0;
        b.y = 0;
        b.fuseMs = 2000;
        b.power = 2;
        b.owner = 'player';
        b.type = 'REGULAR';
      },
    });

    this.explosionPool = new ObjectPool({
      capacity: 128,
      factory: (i) => ({ id: i, tileIdx: 0, r: 0, c: 0, remainingMs: 320 }),
      reset: (e) => {
        e.tileIdx = 0;
        e.r = 0;
        e.c = 0;
        e.remainingMs = 320;
      },
    });

    // 5. Pre-allocated scratch containers for strict Zero-GC operation
    this.playerPosScratch = { r: 1, c: 1, x: 60, y: 60 };
    this.scratchActiveBombs = new Array(32);
    this.scratchFusionPayload = Array.from({ length: 32 }, () => ({ id: 0, r: 0, c: 0, power: 2 }));

    // 6. Player Entity & Mutable Stats
    this.player = {
      x: 60,
      y: 60,
      r: 1,
      c: 1,
      speed: BASE_PLAYER_SPEED,
      speedLevel: 1,
      maxBombs: 3,
      activeBombs: 0,
      bombPower: 2,
      hp: 3,
      maxHp: 3,
      shields: 0,
      maxShields: 1,
      isDashing: false,
      dashRemainingMs: 0,
      dashCooldownMs: 0,
      invulnerableUntil: 0,
      phaseJitterRemaining: 0,
      hasKick: false,
      hasWallPass: false,
      hasBombPass: false,
      portalCooldownMs: 0,
    };

    // 7. Input State
    this.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false,
      dash: false,
      ultimate: false,
    };

    // 8. Telemetry & Accounting
    this.isPaused = false;
    this.currentTimeMs = 10000;
    this.totalActionsProcessed = 0;
    this.totalBombsPlaced = 0;
    this.totalDetonations = 0;
    this.totalFusions = 0;
    this.multiTouchEvents = 0;
    this.statMutationEvents = 0;
    this.boundaryPinningEvents = 0;
    this.hazardEvents = 0;
  }

  initMap() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = coordToIdx(r, c);
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
          this.walls[idx] = 1;
        } else if (r % 2 === 0 && c % 2 === 0) {
          this.walls[idx] = 1;
        } else if ((r > 2 || c > 2) && (r < 10 || c < 12) && (r + c) % 3 === 0) {
          this.blocks[idx] = 1;
        }
      }
    }
  }

  isWalkable(x, y) {
    const r = Math.floor(y / this.tileSize);
    const c = Math.floor(x / this.tileSize);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    const idx = coordToIdx(r, c);
    if (this.walls[idx] === 1) return false;
    if (this.blocks[idx] === 1 && !this.player.hasWallPass) return false;
    return true;
  }

  /**
   * Injects adversarial input with strict prototype pollution & type safety checks
   */
  injectInput(key, rawValue) {
    if (Object.prototype.hasOwnProperty.call(this.input, key)) {
      this.input[key] = Boolean(rawValue);
    }
  }

  /**
   * Applies an extreme stat mutation payload to test clamping & resilience
   */
  mutatePlayerStats(statKey, rawValue) {
    this.statMutationEvents++;

    switch (statKey) {
      case 'speed': {
        const clamped = calculateClampedPlayerSpeed({
          baseSpeed: rawValue,
          isDashing: this.player.isDashing,
          phaseJitterActive: this.player.phaseJitterRemaining > 0,
        });
        this.player.speed = clamped;
        this.player.speedLevel = calculateSpeedLevel(clamped);
        break;
      }
      case 'maxBombs': {
        const num = Number(rawValue);
        this.player.maxBombs = Number.isFinite(num) ? Math.max(1, Math.min(MAX_BOMBS_CAP, num)) : 1;
        break;
      }
      case 'bombPower': {
        const num = Number(rawValue);
        this.player.bombPower = Number.isFinite(num) ? Math.max(1, Math.min(MAX_BOMB_POWER_CAP, num)) : 2;
        break;
      }
      case 'hp': {
        const num = Number(rawValue);
        this.player.hp = Number.isFinite(num) ? Math.max(0, Math.min(this.player.maxHp, num)) : 3;
        break;
      }
      case 'shields': {
        const num = Number(rawValue);
        this.player.shields = Number.isFinite(num) ? Math.max(0, Math.min(this.player.maxShields, num)) : 0;
        break;
      }
      case 'ultimateGauge': {
        this.ultimateEngine.addCharge(rawValue);
        break;
      }
    }
  }

  /**
   * Attempts placing a bomb under adversarial conditions
   */
  tryPlaceBomb() {
    if (this.isPaused) return false;
    if (this.bombPool.activeCount >= this.player.maxBombs) return false;

    const r = Math.floor(this.player.y / this.tileSize);
    const c = Math.floor(this.player.x / this.tileSize);
    const idx = coordToIdx(r, c);
    if (this.walls[idx] === 1) return false;

    const bomb = this.bombPool.acquire();
    if (!bomb) return false;

    bomb.id = ++this.totalBombsPlaced;
    bomb.r = r;
    bomb.c = c;
    bomb.x = c * this.tileSize + 20;
    bomb.y = r * this.tileSize + 20;
    bomb.fuseMs = 2000;
    bomb.power = this.player.bombPower;
    bomb.owner = 'player';
    this.player.activeBombs = this.bombPool.activeCount;

    // Notify dynamic hazards
    this.dynamicHazard.onBombPlaced(bomb.id, r, c);
    this.gravityHazard.recordBombCoreArrival(bomb.id, r, c, this.currentTimeMs);

    return true;
  }

  /**
   * Core simulation step under adversarial deltas
   */
  step(rawDeltaMs) {
    let deltaMs = Number(rawDeltaMs);
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      deltaMs = 0;
    }
    deltaMs = Math.min(100, deltaMs); // Cap to 100ms per step

    this.currentTimeMs += deltaMs;

    if (this.isPaused) {
      return; // Simulation stasis
    }

    const dt = deltaMs / 1000;

    // 1. Update Subsystems (Zero-GC scratch reused)
    this.playerPosScratch.r = this.player.r;
    this.playerPosScratch.c = this.player.c;
    this.playerPosScratch.x = this.player.x;
    this.playerPosScratch.y = this.player.y;

    this.ultimateEngine.update(deltaMs);
    this.traumaEngine.update(dt);
    this.dynamicHazard.update(deltaMs, this.playerPosScratch);
    this.gravityHazard.update(deltaMs);

    // 2. Dash & Status Timers
    if (this.player.dashCooldownMs > 0) {
      this.player.dashCooldownMs = Math.max(0, this.player.dashCooldownMs - deltaMs);
    }
    if (this.player.portalCooldownMs > 0) {
      this.player.portalCooldownMs = Math.max(0, this.player.portalCooldownMs - deltaMs);
    }
    if (this.player.phaseJitterRemaining > 0) {
      this.player.phaseJitterRemaining = Math.max(0, this.player.phaseJitterRemaining - deltaMs);
    }

    if (this.input.dash && this.player.dashCooldownMs === 0 && !this.player.isDashing && this.player.phaseJitterRemaining === 0) {
      this.player.isDashing = true;
      this.player.dashRemainingMs = 140;
      this.player.dashCooldownMs = 3500;
      this.player.invulnerableUntil = this.currentTimeMs + 140;
    }

    if (this.player.isDashing) {
      this.player.dashRemainingMs = Math.max(0, this.player.dashRemainingMs - deltaMs);
      if (this.player.dashRemainingMs === 0) {
        this.player.isDashing = false;
      }
    }

    // 3. Movement Direction & Subpixel Corner Sliding
    let dirX = 0;
    let dirY = 0;
    if (this.input.left && !this.input.right) dirX = -1;
    if (this.input.right && !this.input.left) dirX = 1;
    if (this.input.up && !this.input.down) dirY = -1;
    if (this.input.down && !this.input.up) dirY = 1;

    if (dirX !== 0 && dirY !== 0) {
      dirX *= 0.70710678;
      dirY *= 0.70710678;
    }

    // Effective speed with clamps
    const currentSpeed = calculateClampedPlayerSpeed({
      baseSpeed: this.player.speed,
      isDashing: this.player.isDashing,
      phaseJitterActive: this.player.phaseJitterRemaining > 0,
    });

    let moveX = dirX * currentSpeed * dt;
    let moveY = dirY * currentSpeed * dt;

    // Gravity Hazard Pull Integration
    const pull = this.gravityHazard.evaluatePull(this.player.x, this.player.y);
    if (pull.inAccretionField && pull.intensity > 0) {
      moveX += pull.pullVx * dt;
      moveY += pull.pullVy * dt;
    }

    // Conveyor drift integration
    const pr = Math.floor(this.player.y / this.tileSize);
    const pc = Math.floor(this.player.x / this.tileSize);
    if (pr === this.conveyor.r && pc === this.conveyor.c) {
      moveX += this.conveyor.dirX * this.conveyor.speed * dt;
      moveY += this.conveyor.dirY * this.conveyor.speed * dt;
    }

    // Continuous Collision Detection & Corner Sliding
    const targetX = this.player.x + moveX;
    const targetY = this.player.y + moveY;

    if (this.isWalkable(targetX, this.player.y)) {
      this.player.x = targetX;
    } else {
      const tileCenterY = Math.floor(this.player.y / this.tileSize) * this.tileSize + 20;
      const distY = tileCenterY - this.player.y;
      if (Math.abs(distY) > 2 && Math.abs(distY) <= 12) {
        this.player.y += Math.sign(distY) * Math.min(Math.abs(distY), 80 * dt);
      }
    }

    if (this.isWalkable(this.player.x, targetY)) {
      this.player.y = targetY;
    } else {
      const tileCenterX = Math.floor(this.player.x / this.tileSize) * this.tileSize + 20;
      const distX = tileCenterX - this.player.x;
      if (Math.abs(distX) > 2 && Math.abs(distX) <= 12) {
        this.player.x += Math.sign(distX) * Math.min(Math.abs(distX), 80 * dt);
      }
    }

    // Portal Warp Mechanics
    if (this.player.portalCooldownMs === 0) {
      if (pr === this.portalA.r && pc === this.portalA.c) {
        this.player.x = this.portalA.targetC * this.tileSize + 20;
        this.player.y = this.portalA.targetR * this.tileSize + 20;
        this.player.portalCooldownMs = PORTAL_COOLDOWN_MS;
      } else if (pr === this.portalB.r && pc === this.portalB.c) {
        this.player.x = this.portalB.targetC * this.tileSize + 20;
        this.player.y = this.portalB.targetR * this.tileSize + 20;
        this.player.portalCooldownMs = PORTAL_COOLDOWN_MS;
      }
    }

    // Strict Physical Boundary Clamping
    this.player.x = Math.max(MIN_BOUND_X, Math.min(MAX_BOUND_X, this.player.x));
    this.player.y = Math.max(MIN_BOUND_Y, Math.min(MAX_BOUND_Y, this.player.y));
    this.player.r = Math.floor(this.player.y / this.tileSize);
    this.player.c = Math.floor(this.player.x / this.tileSize);

    // 4. Hazard Interactions & Defenses
    if (this.dynamicHazard.getState() === HazardLifecycleState.ACTIVE) {
      const collision = this.dynamicHazard.checkPlayerCollision(
        this.player.r,
        this.player.c,
        this.player.isDashing,
        140 - this.player.dashRemainingMs,
        this.currentTimeMs
      );
      if (collision.hit) {
        this.hazardEvents++;
        if (collision.phaseJitterTriggered) {
          this.player.phaseJitterRemaining = 2000;
        }
      }
    }

    // 5. Bomb Spawning, Fusion & Detonations (Zero-GC scratch reused)
    if (this.input.bomb) {
      this.tryPlaceBomb();
    }

    let activeCount = 0;
    this.bombPool.forEachActive((bomb) => {
      bomb.fuseMs -= deltaMs;
      this.scratchActiveBombs[activeCount++] = bomb;
    });

    // Singularity Bomb Fusion Check
    if (activeCount >= 2 && this.gravityHazard.state === GravityLifecycleState.SINGULARITY_BURST) {
      for (let i = 0; i < activeCount; i++) {
        const b = this.scratchActiveBombs[i];
        const s = this.scratchFusionPayload[i];
        s.id = b.id;
        s.r = b.r;
        s.c = b.c;
        s.power = b.power;
      }
      const fusion = this.gravityHazard.evaluateBombFusion(
        this.scratchFusionPayload.slice(0, activeCount),
        this.currentTimeMs
      );
      if (fusion.triggered) {
        this.totalFusions++;
      }
    }

    // Detonate expired bombs
    for (let i = 0; i < activeCount; i++) {
      const bomb = this.scratchActiveBombs[i];
      if (bomb.fuseMs <= 0) {
        this.totalDetonations++;
        this.bombPool.release(bomb);
        this.gravityHazard.clearBombCoreArrival(bomb.id);
      }
    }
    this.player.activeBombs = this.bombPool.activeCount;

    // 6. Ultimate Skill Activation
    if (this.input.ultimate && this.ultimateEngine.isReady()) {
      this.ultimateEngine.trigger('SUPER_NOVA');
    }

    // Assert invariants on every single step
    this.assertGameStateInvariants();
  }

  assertGameStateInvariants() {
    const p = this.player;

    // Coordinate invariants
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Number.isNaN(p.x) || Number.isNaN(p.y)) {
      throw new Error(`Corrupted non-finite player coordinates: (${p.x}, ${p.y})`);
    }

    if (p.x < MIN_BOUND_X || p.x > MAX_BOUND_X) {
      throw new Error(`Horizontal boundary breach: x = ${p.x} [${MIN_BOUND_X}, ${MAX_BOUND_X}]`);
    }

    if (p.y < MIN_BOUND_Y || p.y > MAX_BOUND_Y) {
      throw new Error(`Vertical boundary breach: y = ${p.y} [${MIN_BOUND_Y}, ${MAX_BOUND_Y}]`);
    }

    // Speed invariants
    if (!Number.isFinite(p.speed) || p.speed < MIN_PLAYER_SPEED || p.speed > MAX_PLAYER_SPEED_CLAMP) {
      throw new Error(`Speed clamp invariant breached: ${p.speed} [${MIN_PLAYER_SPEED}, ${MAX_PLAYER_SPEED_CLAMP}]`);
    }

    // Ultimate Gauge invariants
    const u = this.ultimateEngine;
    if (!Number.isFinite(u.gauge) || u.gauge < 0 || u.gauge > 100) {
      throw new Error(`Ultimate gauge out of range [0, 100]: ${u.gauge}`);
    }
    if (u.lockoutRemainingMs < 0) {
      throw new Error(`Lockout remaining negative: ${u.lockoutRemainingMs}`);
    }

    // Bomb pool capacity invariants
    if (this.bombPool.activeCount < 0 || this.bombPool.activeCount > this.bombPool.capacity) {
      throw new Error(`Bomb pool active count corrupted: ${this.bombPool.activeCount}`);
    }
  }
}

/* ==============================================================================
 * TEST SUITE 1: 50,000-ACTION GRAND ADVERSARIAL CHAOS BOT HARNESS
 * ============================================================================== */

test('Grand Chaos Bot: 50,000 Adversarial Actions Under Extreme Stress', () => {
  const engine = new AdversarialChaosEngine();
  const startTime = Date.now();

  const keys = ['up', 'down', 'left', 'right', 'bomb', 'dash', 'ultimate'];
  const maliciousDeltas = [16.66, 0, -50, 100, 33.33, NaN, Infinity, -Infinity];

  const statKeys = ['speed', 'maxBombs', 'bombPower', 'hp', 'shields', 'ultimateGauge'];
  const extremeValues = [
    -999999, 1e12, -1e12, NaN, Infinity, -Infinity, 'invalid', null, undefined, 0, 500,
  ];

  for (let action = 1; action <= 50000; action++) {
    engine.totalActionsProcessed++;
    const actionCategory = action % 6;

    switch (actionCategory) {
      case 0: {
        // Multi-touch directional inputs & opposing vector bursts
        const k1 = keys[action % keys.length];
        const k2 = keys[(action * 3) % keys.length];
        engine.injectInput(k1, (action & 1) === 1);
        engine.injectInput(k2, (action & 2) === 2);
        engine.multiTouchEvents += 2;

        if (action % 25 === 0) {
          // Simultaneous opposite cardinal spam
          engine.injectInput('up', true);
          engine.injectInput('down', true);
          engine.injectInput('left', true);
          engine.injectInput('right', true);
          engine.multiTouchEvents += 4;
        }
        break;
      }
      case 1: {
        // Extreme Stat Mutation Injection
        const statKey = statKeys[action % statKeys.length];
        const val = extremeValues[(action * 7) % extremeValues.length];
        engine.mutatePlayerStats(statKey, val);
        break;
      }
      case 2: {
        // Rapid Pause State Oscillation
        engine.isPaused = (action % 100) < 5;
        break;
      }
      case 3: {
        // Bomb placement & cascade triggers
        engine.tryPlaceBomb();
        break;
      }
      case 4: {
        // Edge-case boundary pinning & portal ping-pong
        if (action % 250 === 0) {
          engine.player.x = engine.portalA.c * engine.tileSize + 20;
          engine.player.y = engine.portalA.r * engine.tileSize + 20;
        } else if (action % 500 === 0) {
          engine.player.x = MAX_BOUND_X;
          engine.player.y = MAX_BOUND_Y;
          engine.boundaryPinningEvents++;
        }
        break;
      }
      case 5: {
        // Ultimate skill trigger attempt
        engine.ultimateEngine.addCharge((action % 7 === 0) ? 1e6 : (action % 3 === 0) ? -500 : 25);
        if (engine.ultimateEngine.isReady()) {
          engine.ultimateEngine.trigger('SUPER_NOVA');
        }
        break;
      }
    }

    // Step simulation with randomized/malicious delta times
    const delta = maliciousDeltas[action % maliciousDeltas.length];
    engine.step(delta);
  }

  const elapsedMs = Date.now() - startTime;

  // Final Invariant Verifications
  assert.ok(engine.totalActionsProcessed >= 50000, `Processed ${engine.totalActionsProcessed} actions`);
  assert.ok(Number.isFinite(engine.player.x));
  assert.ok(Number.isFinite(engine.player.y));
  assert.ok(engine.player.x >= MIN_BOUND_X && engine.player.x <= MAX_BOUND_X);
  assert.ok(engine.player.y >= MIN_BOUND_Y && engine.player.y <= MAX_BOUND_Y);
  assert.ok(engine.player.speed >= MIN_PLAYER_SPEED && engine.player.speed <= MAX_PLAYER_SPEED_CLAMP);
  assert.ok(engine.ultimateEngine.gauge >= 0 && engine.ultimateEngine.gauge <= 100);

  // Print Telemetry Report
  console.log(`\n===============================================================`);
  console.log(`       50,000-ACTION ADVERSARIAL CHAOS BOT TELEMETRY           `);
  console.log(`===============================================================`);
  console.log(` Total Actions Executed:     50,000`);
  console.log(` Total Execution Time:       ${elapsedMs} ms (${(50000 / (elapsedMs / 1000)).toFixed(0)} actions/sec)`);
  console.log(` Multi-Touch Spam Events:    ${engine.multiTouchEvents}`);
  console.log(` Stat Mutation Injections:   ${engine.statMutationEvents}`);
  console.log(` Boundary Pinning Events:    ${engine.boundaryPinningEvents}`);
  console.log(` Dual-Hazard Hit Events:     ${engine.hazardEvents}`);
  console.log(` Cosmic Bomb Fusions:        ${engine.totalFusions}`);
  console.log(` Bombs Placed & Tracked:     ${engine.totalBombsPlaced}`);
  console.log(` Detonations Processed:      ${engine.totalDetonations}`);
  console.log(` Coordinate NaNs / Bounds:   0 Breaches`);
  console.log(` Invariant Violations:       0 Violations`);
  console.log(`===============================================================\n`);
});

/* ==============================================================================
 * TEST SUITE 2: RANDOM INPUT FUZZING & MULTI-TOUCH OPPOSING INVARIANTS
 * ============================================================================== */

test('Adversarial Chaos: 10,000 Multi-Touch Opposing Inputs & Polar Joysticks', () => {
  const engine = new AdversarialChaosEngine();
  const keys = ['up', 'down', 'left', 'right', 'bomb', 'dash', 'ultimate'];

  for (let i = 0; i < 10000; i++) {
    // 1. Random key toggles
    const k = keys[i % keys.length];
    engine.injectInput(k, Math.random() > 0.5);

    // 2. Continuous opposing directions
    if (i % 3 === 0) {
      engine.injectInput('up', true);
      engine.injectInput('down', true);
    }
    if (i % 4 === 0) {
      engine.injectInput('left', true);
      engine.injectInput('right', true);
    }

    // 3. Step
    engine.step(16.66);

    assert.ok(Number.isFinite(engine.player.x));
    assert.ok(Number.isFinite(engine.player.y));
    assert.ok(engine.player.x >= MIN_BOUND_X && engine.player.x <= MAX_BOUND_X);
    assert.ok(engine.player.y >= MIN_BOUND_Y && engine.player.y <= MAX_BOUND_Y);
  }
});

/* ==============================================================================
 * TEST SUITE 3: EXTREME STAT MUTATIONS & PERK/BUFF STACKING CLAMPING INVARIANTS
 * ============================================================================== */

test('Adversarial Chaos: 10,000 Extreme Stat Mutations, Corrupted Perks & Buffs', () => {
  const engine = new AdversarialChaosEngine();

  const malformedValues = [
    -1e9, 1e12, NaN, Infinity, -Infinity, 'corrupt', null, undefined, {}, [],
  ];

  for (let i = 0; i < 10000; i++) {
    const rawVal = malformedValues[i % malformedValues.length];
    engine.mutatePlayerStats('speed', rawVal);

    // Fuzz Speed
    const clampedSpeed = calculateClampedPlayerSpeed({
      baseSpeed: rawVal,
      itemSpeed: malformedValues[(i + 1) % malformedValues.length],
      perkSpeedBonus: malformedValues[(i + 2) % malformedValues.length],
      surgeBonus: malformedValues[(i + 3) % malformedValues.length],
      slowdownRatio: malformedValues[(i + 4) % malformedValues.length],
    });
    assert.ok(Number.isFinite(clampedSpeed));
    assert.ok(clampedSpeed >= MIN_PLAYER_SPEED && clampedSpeed <= MAX_PLAYER_SPEED_CLAMP);

    // Fuzz Perks
    const perkBonuses = PerkTreeManager.calculateAppliedBonuses({
      sugar_spark: rawVal,
      quick_wick: rawVal,
      chain_reaction: rawVal,
      titan_heart: rawVal,
      __proto__: { evil: 123 },
    });
    assert.ok(perkBonuses && typeof perkBonuses === 'object');
    assert.ok(Number.isFinite(perkBonuses.startingBlastRadiusBonus));
    assert.ok(Number.isFinite(perkBonuses.baseSpeedBonus));
    assert.ok(perkBonuses.startingBlastRadiusBonus >= 0);

    // Fuzz Scaling Engine Mutators
    const mutators = ScalingEngine.generateWaveMutators(i);
    assert.ok(Array.isArray(mutators));
    assert.ok(mutators.length <= 2);
  }
});

/* ==============================================================================
 * TEST SUITE 4: EDGE-CASE PHYSICAL BOUNDARY CLAMPING & CORNER SLIDING
 * ============================================================================== */

test('Adversarial Chaos: 10,000 High-Velocity Boundary & Corner Pinning Actions', () => {
  const engine = new AdversarialChaosEngine();

  // Attack 1: Driving into top-left border for 5,000 frames at Dash Speed
  engine.player.speed = DASH_SPEED;
  engine.player.isDashing = true;
  engine.injectInput('up', true);
  engine.injectInput('left', true);

  for (let i = 0; i < 5000; i++) {
    engine.step(16.66);
    assert.ok(engine.player.x >= MIN_BOUND_X, `Breached left border: ${engine.player.x}`);
    assert.ok(engine.player.y >= MIN_BOUND_Y, `Breached top border: ${engine.player.y}`);
    assert.ok(Number.isFinite(engine.player.x));
    assert.ok(Number.isFinite(engine.player.y));
  }

  // Attack 2: Driving into bottom-right border for 5,000 frames
  engine.injectInput('up', false);
  engine.injectInput('left', false);
  engine.injectInput('down', true);
  engine.injectInput('right', true);

  for (let i = 0; i < 5000; i++) {
    engine.step(16.66);
    assert.ok(engine.player.x <= MAX_BOUND_X, `Breached right border: ${engine.player.x}`);
    assert.ok(engine.player.y <= MAX_BOUND_Y, `Breached bottom border: ${engine.player.y}`);
    assert.ok(Number.isFinite(engine.player.x));
    assert.ok(Number.isFinite(engine.player.y));
  }
});

/* ==============================================================================
 * TEST SUITE 5: DUAL HAZARD CHAOS UNDER MALFORMED DELTAS
 * ============================================================================== */

test('Adversarial Chaos: 10,000 Dual Hazard Invocations Under Corrupt Deltas', () => {
  const dynHazard = new DynamicHazard();
  dynHazard.init();
  dynHazard.start('CLIMAX');

  const gravHazard = new GravityHazard();
  gravHazard.init(6, 7);
  gravHazard.start('CLIMAX');

  const corruptDeltas = [-500, 0, 16.66, 1000, NaN, Infinity, -Infinity];

  for (let i = 0; i < 10000; i++) {
    const delta = corruptDeltas[i % corruptDeltas.length];

    dynHazard.update(delta, { r: 6, c: 7, x: 280, y: 240 });
    gravHazard.update(delta);

    // Hazard Invariants
    const safeRatioDyn = dynHazard.getSafeAreaRatio();
    const safeRatioGrav = gravHazard.getSafeAreaRatio();

    assert.ok(Number.isFinite(safeRatioDyn));
    assert.ok(safeRatioDyn >= 0.40 && safeRatioDyn <= 1.0);

    assert.ok(Number.isFinite(safeRatioGrav));
    assert.ok(safeRatioGrav >= 0.40 && safeRatioGrav <= 1.0);

    // Pull field finite invariant
    const pull = gravHazard.evaluatePull(280 + (i % 20), 240 + (i % 20));
    assert.ok(Number.isFinite(pull.pullVx));
    assert.ok(Number.isFinite(pull.pullVy));
    assert.ok(Number.isFinite(pull.intensity));
  }
});

/* ==============================================================================
 * TEST SUITE 6: ZERO-GC MEMORY DRIFT ACROSS 50,000 ACTIONS (< 0.25 MB)
 * ============================================================================== */

test('Adversarial Chaos: Zero-GC Memory Soak Invariant (< 0.25 MB Drift)', () => {
  const engine = new AdversarialChaosEngine();

  // Warmup run
  for (let i = 0; i < 1000; i++) {
    engine.step(16.66);
  }

  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }

  const initialHeap = process.memoryUsage().heapUsed;

  // 50,000 continuous action simulation
  for (let action = 1; action <= 50000; action++) {
    if (action % 5 === 0) engine.injectInput('up', (action & 1) === 1);
    if (action % 7 === 0) engine.injectInput('right', (action & 2) === 2);
    if (action % 20 === 0) engine.tryPlaceBomb();
    engine.step(16.66);
  }

  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const driftMb = (finalHeap - initialHeap) / (1024 * 1024);

  console.log(`Zero-GC 50,000-Action Heap Drift: ${driftMb.toFixed(4)} MB (Threshold: <= 0.25 MB with GC, < 5.0 MB uncollected)`);
  if (typeof global.gc === 'function') {
    assert.ok(driftMb < 0.25, `Heap drift exceeded 0.25 MB threshold: ${driftMb} MB`);
  } else {
    assert.ok(driftMb < 5.0, `Heap drift exceeded non-GC threshold: ${driftMb} MB`);
  }
});
