import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  ROWS,
  COLS,
  TILE_SIZE,
  FlatHazardMask,
  ZeroGCPathfinder,
} from '../src/game/pathfinding.ts';
import { CameraTraumaSimulator, WebAudioSynth } from '../src/game/ultimate_skills.ts';
import { ObjectPool, POOL_PRESETS } from '../src/game/pooling/ObjectPool.ts';
import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import { BossAttackManager } from '../src/game/bosses/BossAttackManager.ts';
import { BossProjectileType } from '../src/game/bosses/BossTypes.ts';
import { FloatingTextManager, OverheadUIManager } from '../src/game/ui/index.ts';
import { APIQuotaCircuitBreaker, CircuitBreakerState } from '../src/game/persistence/index.ts';
import { GameStatePersistence } from '../src/game/persistence/GameStatePersistence.ts';
import { VoltHazardAudio } from '../src/game/hazards/VoltHazardAudio.ts';
import { DynamicHazardAudio } from '../src/game/hazards/DynamicHazardAudio.ts';
import { MagmaHazardAudio } from '../src/game/hazards/MagmaHazardAudio.ts';
import { MiasmaHazardAudio } from '../src/game/hazards/MiasmaHazardAudio.ts';
import { FrostHazardAudio } from '../src/game/hazards/FrostHazardAudio.ts';
import { ChronoHazardAudio } from '../src/game/hazards/ChronoHazardAudio.ts';

/* ==============================================================================
 * AUDIT CONSTANTS & PERFORMANCE BUDGETS
 * ============================================================================== */

const TOTAL_TILES = ROWS * COLS; // 13 x 15 = 195 tiles
const WARMUP_FRAMES = 1000;
const SOAK_FRAMES = 10000;
const TOTAL_SIMULATION_FRAMES = WARMUP_FRAMES + SOAK_FRAMES; // 11,000 frames total (> 10,000 frames)
const FRAME_DELTA_MS = 16.6667; // 60 FPS standard timestep
const HEAP_DRIFT_BUDGET_MB = 0.25; // Strict Zero-GC maximum allowable heap drift budget

/* ==============================================================================
 * GLOBAL TIMER TRACKER INTERCEPTOR
 * ============================================================================== */

export class GlobalTimerAuditHarness {
  constructor() {
    this.activeTimeouts = new Map();
    this.origSetTimeout = global.setTimeout;
    this.origClearTimeout = global.clearTimeout;
    this.intercepting = false;
  }

  start() {
    if (this.intercepting) return;
    this.intercepting = true;
    this.activeTimeouts.clear();

    global.setTimeout = (fn, ms, ...args) => {
      const stack = new Error().stack || '';
      const isInternal = stack.includes('gameplay_simulation_soak_audit');
      const tid = this.origSetTimeout((...cbArgs) => {
        if (isInternal) {
          this.activeTimeouts.delete(tid);
        }
        fn(...cbArgs);
      }, ms, ...args);
      if (isInternal) {
        this.activeTimeouts.set(tid, { ms, stack, created: Date.now() });
      }
      return tid;
    };

    global.clearTimeout = (tid) => {
      this.activeTimeouts.delete(tid);
      return this.origClearTimeout(tid);
    };
  }

  stop() {
    if (!this.intercepting) return;
    global.setTimeout = this.origSetTimeout;
    global.clearTimeout = this.origClearTimeout;
    this.intercepting = false;
  }

  getActiveCount() {
    return this.activeTimeouts.size;
  }

  getActiveDetails() {
    return Array.from(this.activeTimeouts.entries()).map(([tid, meta]) => ({
      tid: String(tid),
      ms: meta.ms,
      ageMs: Date.now() - meta.created,
    }));
  }

  clearAll() {
    for (const tid of this.activeTimeouts.keys()) {
      this.origClearTimeout(tid);
    }
    this.activeTimeouts.clear();
  }
}

/* ==============================================================================
 * FULL GAMEPLAY SYSTEM SIMULATION HARNESS (HEADLESS 10,000+ FRAMES)
 * ============================================================================== */

export class ComprehensiveGameplaySimulator {
  constructor() {
    this.rows = ROWS;
    this.cols = COLS;
    this.totalTiles = TOTAL_TILES;

    // 1. Arena Map Layout
    this.walls = new Uint8Array(TOTAL_TILES);
    this.blocks = new Uint8Array(TOTAL_TILES);
    this.hazardMask = new FlatHazardMask(TOTAL_TILES);
    this.pathBuffer = new Int16Array(TOTAL_TILES);
    this.walkableBitmask = new Uint8Array(TOTAL_TILES);
    this.initArena();

    // 2. Navigation & Camera
    this.pathfinder = new ZeroGCPathfinder(ROWS, COLS);
    this.cameraTrauma = new CameraTraumaSimulator();
    this.scratchVector = { x: 0, y: 0, angle: 0 };

    // 3. UI Managers
    this.overheadUI = new OverheadUIManager(true);
    this.floatingText = new FloatingTextManager();

    // 4. Production Object Pools
    this.bombPool = new ObjectPool({
      capacity: POOL_PRESETS.BOMBS, // 32
      factory: (i) => ({ id: i, r: 0, c: 0, fuseMs: 0, power: 2, owner: 'player' }),
      reset: (b) => { b.r = 0; b.c = 0; b.fuseMs = 0; b.power = 2; b.owner = 'player'; },
    });

    this.explosionPool = new ObjectPool({
      capacity: POOL_PRESETS.EXPLOSIONS, // 128
      factory: (i) => ({ id: i, tileIdx: 0, lifeMs: 0, isCenter: false }),
      reset: (e) => { e.tileIdx = 0; e.lifeMs = 0; e.isCenter = false; },
    });

    this.particlePool = new ObjectPool({
      capacity: POOL_PRESETS.PARTICLES, // 256
      factory: (i) => ({ id: i, x: 0, y: 0, vx: 0, vy: 0, life: 0 }),
      reset: (p) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 0; },
    });

    // 5. Boss Attack Subsystem (4 internal ObjectPools)
    this.bossAttacks = new BossAttackManager();

    // 6. Audio Subsystem
    this.voicePool = new AudioVoicePool(16);
    this.webAudioSynth = new WebAudioSynth();
    this.voltAudio = new VoltHazardAudio(this.voicePool);
    this.dynamicAudio = new DynamicHazardAudio(this.voicePool);
    this.magmaAudio = new MagmaHazardAudio(this.voicePool);
    this.miasmaAudio = MiasmaHazardAudio.getInstance();
    this.miasmaAudio.bindPool(this.voicePool);
    this.frostAudio = new FrostHazardAudio(this.voicePool);
    this.chronoAudio = ChronoHazardAudio.getInstance();
    this.chronoAudio.setVoicePool(this.voicePool);

    // 7. Persistence & Circuit Breaker
    this.circuitBreaker = new APIQuotaCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 150,
      initialBackoffMs: 20,
      maxBackoffMs: 100,
    });
    this.persistence = new GameStatePersistence(undefined, undefined, this.circuitBreaker);

    // 8. Entities (Player & 4 AI Enemies)
    this.player = {
      r: 1,
      c: 1,
      x: 60,
      y: 60,
      speed: 150,
      bombPower: 2,
      maxBombs: 3,
      cooldownMs: 0,
    };

    this.enemies = [
      { id: 1, type: 'CHASER', r: 1, c: 13, x: 540, y: 60, speed: 75, timer: 0 },
      { id: 2, type: 'BOMBER', r: 11, c: 1, x: 60, y: 460, speed: 70, timer: 0, bombTimer: 180 },
      { id: 3, type: 'TANK', r: 11, c: 13, x: 540, y: 460, speed: 50, timer: 0 },
      { id: 4, type: 'GHOST', r: 5, c: 7, x: 300, y: 220, speed: 60, timer: 0 },
    ];

    // 9. Simulation Telemetry
    this.metrics = {
      totalFrames: 0,
      bombsPlaced: 0,
      detonations: 0,
      particlesEmitted: 0,
      pathfindingQueries: 0,
      bossProjectilesSpawned: 0,
      bossShockwavesSpawned: 0,
      floatingTextsRegistered: 0,
      maxActiveBombs: 0,
      maxActiveExplosions: 0,
      maxActiveParticles: 0,
      maxActiveBossProjectiles: 0,
      maxActiveBossShockwaves: 0,
    };
  }

  initArena() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
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

  getWalkableBitmask(out) {
    for (let i = 0; i < this.totalTiles; i++) {
      out[i] = this.walls[i] === 0 && this.blocks[i] === 0 ? 1 : 0;
    }
    this.bombPool.forEachActive((b) => {
      const idx = b.r * this.cols + b.c;
      out[idx] = 0;
    });
  }

  step(deltaMs, frameNumber) {
    this.metrics.totalFrames++;
    const currentTimeMs = frameNumber * deltaMs;

    // --- Subsystem A: Flat Hazard Mask & Camera Trauma ---
    this.hazardMask.fill(0);
    this.cameraTrauma.update(deltaMs / 1000);
    this.cameraTrauma.getOffsets(currentTimeMs, this.scratchVector);

    // --- Subsystem B: Active Explosions ---
    const expiredExplosions = [];
    this.explosionPool.forEachActive((expl) => {
      expl.lifeMs -= deltaMs;
      if (expl.lifeMs <= 0) {
        expiredExplosions.push(expl);
      } else {
        this.hazardMask.setIdx(expl.tileIdx, 1);
      }
    });
    for (let i = 0; i < expiredExplosions.length; i++) {
      this.explosionPool.release(expiredExplosions[i]);
    }

    // --- Subsystem C: Active Particles ---
    const expiredParticles = [];
    this.particlePool.forEachActive((p) => {
      p.life -= 1;
      if (p.life <= 0) {
        expiredParticles.push(p);
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
    });
    for (let i = 0; i < expiredParticles.length; i++) {
      this.particlePool.release(expiredParticles[i]);
    }

    // --- Subsystem D: Active Bombs & Detonations ---
    const bombsToDetonate = [];
    this.bombPool.forEachActive((bomb) => {
      bomb.fuseMs += deltaMs;
      if (bomb.fuseMs >= 2000) {
        bombsToDetonate.push(bomb);
      }
    });
    for (let i = 0; i < bombsToDetonate.length; i++) {
      this.detonateBomb(bombsToDetonate[i]);
    }

    // --- Subsystem E: Player Action ---
    if (this.player.cooldownMs > 0) {
      this.player.cooldownMs = Math.max(0, this.player.cooldownMs - deltaMs);
    }
    if (frameNumber % 120 === 0 && this.bombPool.activeCount < this.player.maxBombs) {
      this.placeBomb(this.player.r, this.player.c, this.player.bombPower, 'player');
    }

    // --- Subsystem F: AI Pathfinding & Dynamic Hazards ---
    this.getWalkableBitmask(this.walkableBitmask);
    this.pathfinder.setObstacles(this.walkableBitmask);

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      enemy.timer -= deltaMs;
      if (enemy.timer <= 0) {
        enemy.timer = 300 + i * 50;
        const eIdx = enemy.r * this.cols + enemy.c;
        const pIdx = this.player.r * this.cols + this.player.c;
        this.pathfinder.findPath(eIdx, pIdx, this.pathBuffer);
        this.metrics.pathfindingQueries++;
      }
      if (enemy.type === 'BOMBER') {
        enemy.bombTimer = (enemy.bombTimer || 240) - 1;
        if (enemy.bombTimer <= 0) {
          enemy.bombTimer = 240;
          this.placeBomb(enemy.r, enemy.c, 1, 'enemy');
        }
      }
    }

    // --- Subsystem G: Boss Attack Patterns ---
    if (frameNumber % 150 === 0) {
      // Spawn Boss Gatling Projectile
      const proj = this.bossAttacks.spawnProjectile(
        BossProjectileType.GATLING_SEED,
        300,
        260,
        Math.cos(frameNumber) * 120,
        Math.sin(frameNumber) * 120,
        6,
        1800
      );
      if (proj) this.metrics.bossProjectilesSpawned++;

      // Trigger telegraph tile
      this.bossAttacks.addTelegraphTile(1 + (frameNumber % 11), 1 + (frameNumber % 13), 1200);
    }

    if (frameNumber % 450 === 0) {
      // Spawn Boss Shockwave
      const wave = this.bossAttacks.spawnShockwave(300, 260, 160, 220, 1);
      if (wave) this.metrics.bossShockwavesSpawned++;
    }

    this.bossAttacks.update(deltaMs);

    // --- Subsystem H: Floating Text Ring Buffer ---
    if (frameNumber % 60 === 0) {
      this.floatingText.registerSpawn(this.player.x, this.player.y, currentTimeMs);
      this.metrics.floatingTextsRegistered++;
    }

    // --- Subsystem I: Audio Voice Cycling & Procedural Synths ---
    if (frameNumber % 180 === 0) {
      this.voltAudio.playStaticSpark(currentTimeMs);
      this.dynamicAudio.playTelegraphPulse(currentTimeMs);
      this.magmaAudio.playMagmaUpwellingSizzle();
      this.miasmaAudio.playOrganicBubbling();
      this.frostAudio.playCrystallizationCrackle(currentTimeMs);
      this.chronoAudio.playTemporalRipple(currentTimeMs);
    }

    // Track peak hydration metrics
    if (this.bombPool.activeCount > this.metrics.maxActiveBombs) {
      this.metrics.maxActiveBombs = this.bombPool.activeCount;
    }
    if (this.explosionPool.activeCount > this.metrics.maxActiveExplosions) {
      this.metrics.maxActiveExplosions = this.explosionPool.activeCount;
    }
    if (this.particlePool.activeCount > this.metrics.maxActiveParticles) {
      this.metrics.maxActiveParticles = this.particlePool.activeCount;
    }
    if (this.bossAttacks.projectilePool.activeCount > this.metrics.maxActiveBossProjectiles) {
      this.metrics.maxActiveBossProjectiles = this.bossAttacks.projectilePool.activeCount;
    }
    if (this.bossAttacks.shockwavePool.activeCount > this.metrics.maxActiveBossShockwaves) {
      this.metrics.maxActiveBossShockwaves = this.bossAttacks.shockwavePool.activeCount;
    }
  }

  placeBomb(r, c, power, owner = 'player') {
    const bomb = this.bombPool.acquire();
    if (!bomb) return null;
    bomb.r = r;
    bomb.c = c;
    bomb.power = power;
    bomb.owner = owner;
    bomb.fuseMs = 0;
    this.metrics.bombsPlaced++;
    return bomb;
  }

  detonateBomb(bomb) {
    this.metrics.detonations++;
    this.cameraTrauma.addTrauma(0.15);

    const centerIdx = bomb.r * this.cols + bomb.c;
    const centerExpl = this.explosionPool.acquire();
    if (centerExpl) {
      centerExpl.tileIdx = centerIdx;
      centerExpl.lifeMs = 300;
      centerExpl.isCenter = true;
      this.hazardMask.setCoord(bomb.r, bomb.c, 1);
    }

    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (const dir of dirs) {
      for (let dist = 1; dist <= bomb.power; dist++) {
        const nr = bomb.r + dir.dr * dist;
        const nc = bomb.c + dir.dc * dist;
        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
        const nIdx = nr * this.cols + nc;
        if (this.walls[nIdx] === 1) break;

        if (this.blocks[nIdx] === 1) {
          this.blocks[nIdx] = 0;
          const expl = this.explosionPool.acquire();
          if (expl) {
            expl.tileIdx = nIdx;
            expl.lifeMs = 300;
            this.hazardMask.setCoord(nr, nc, 1);
          }
          this.emitParticles(nc * TILE_SIZE + 20, nr * TILE_SIZE + 20, 8);
          break;
        }

        const expl = this.explosionPool.acquire();
        if (expl) {
          expl.tileIdx = nIdx;
          expl.lifeMs = 300;
          this.hazardMask.setCoord(nr, nc, 1);
        }
        this.emitParticles(nc * TILE_SIZE + 20, nr * TILE_SIZE + 20, 3);
      }
    }

    this.bombPool.release(bomb);
  }

  emitParticles(x, y, count) {
    for (let i = 0; i < count; i++) {
      const p = this.particlePool.acquire();
      if (!p) break;
      p.x = x;
      p.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 2.5;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 15 + Math.floor(Math.random() * 15);
      this.metrics.particlesEmitted++;
    }
  }

  verifyAllPoolInvariants() {
    assert.ok(this.bombPool.verifyInvariants(), 'Bomb pool structural invariants violated');
    assert.strictEqual(this.bombPool.activeCount + this.bombPool.freeCount, POOL_PRESETS.BOMBS);

    assert.ok(this.explosionPool.verifyInvariants(), 'Explosion pool structural invariants violated');
    assert.strictEqual(this.explosionPool.activeCount + this.explosionPool.freeCount, POOL_PRESETS.EXPLOSIONS);

    assert.ok(this.particlePool.verifyInvariants(), 'Particle pool structural invariants violated');
    assert.strictEqual(this.particlePool.activeCount + this.particlePool.freeCount, POOL_PRESETS.PARTICLES);

    assert.ok(this.bossAttacks.projectilePool.verifyInvariants(), 'Boss projectile pool structural invariants violated');
    assert.strictEqual(this.bossAttacks.projectilePool.activeCount + this.bossAttacks.projectilePool.freeCount, 64);

    assert.ok(this.bossAttacks.shockwavePool.verifyInvariants(), 'Boss shockwave pool structural invariants violated');
    assert.strictEqual(this.bossAttacks.shockwavePool.activeCount + this.bossAttacks.shockwavePool.freeCount, 16);

    assert.ok(this.bossAttacks.minionPool.verifyInvariants(), 'Boss minion pool structural invariants violated');
    assert.strictEqual(this.bossAttacks.minionPool.activeCount + this.bossAttacks.minionPool.freeCount, 8);

    assert.ok(this.bossAttacks.telegraphPool.verifyInvariants(), 'Boss telegraph pool structural invariants violated');
    assert.strictEqual(this.bossAttacks.telegraphPool.activeCount + this.bossAttacks.telegraphPool.freeCount, 64);
  }

  destroy() {
    this.bombPool.destroy();
    this.explosionPool.destroy();
    this.particlePool.destroy();
    this.bossAttacks.destroy();
    this.floatingText.reset();
    this.voicePool.destroy();
    this.webAudioSynth.destroy();
    this.voltAudio.destroy();
    this.dynamicAudio.destroy();
    this.magmaAudio.destroy();
    this.miasmaAudio.destroy();
    this.frostAudio.destroy();
    FrostHazardAudio.resetInstance();
    this.chronoAudio.destroy();
    ChronoHazardAudio.resetInstance();
    this.persistence.destroy();
    this.circuitBreaker.destroy();
  }
}

/* ==============================================================================
 * TEST SUITE 1: 10,000+ FRAME FULL SIMULATION AUDIT & ZERO-GC VERIFICATION
 * ============================================================================== */

test('Simulation Audit: 10,000+ Frames Full Gameplay Simulation maintains Heap Drift <= 0.25 MB', (t) => {
  const isGcExposed = typeof global.gc === 'function';
  const timerAudit = new GlobalTimerAuditHarness();
  timerAudit.start();

  const simulator = new ComprehensiveGameplaySimulator();

  // 1. Warmup Phase (1,000 frames) for JIT compilation and pool hydration
  const tWarmupStart = performance.now();
  for (let f = 0; f < WARMUP_FRAMES; f++) {
    simulator.step(FRAME_DELTA_MS, f);
  }
  const warmupDurationMs = performance.now() - tWarmupStart;

  // Compaction & Baseline Capture
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const baselineMemory = process.memoryUsage();
  const baselineHeapUsed = baselineMemory.heapUsed;

  // 2. Continuous 10,000-Frame Soak Phase
  const checkpoints = [];
  const tSoakStart = performance.now();

  for (let f = WARMUP_FRAMES; f < TOTAL_SIMULATION_FRAMES; f++) {
    simulator.step(FRAME_DELTA_MS, f);

    // Verify pool invariants and record intermediate checkpoints
    if (f % 2500 === 0 || f === TOTAL_SIMULATION_FRAMES - 1) {
      simulator.verifyAllPoolInvariants();
      checkpoints.push({
        frame: f + 1,
        heapUsedMB: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(3),
        activeBombs: simulator.bombPool.activeCount,
        activeExplosions: simulator.explosionPool.activeCount,
        activeParticles: simulator.particlePool.activeCount,
        activeBossProjectiles: simulator.bossAttacks.projectilePool.activeCount,
        activeBossShockwaves: simulator.bossAttacks.shockwavePool.activeCount,
      });
    }
  }

  const soakDurationMs = performance.now() - tSoakStart;
  const avgFrameTimeMs = soakDurationMs / SOAK_FRAMES;

  // Compaction & Final Capture
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalMemory = process.memoryUsage();
  const finalHeapUsed = finalMemory.heapUsed;
  const heapDriftBytes = finalHeapUsed - baselineHeapUsed;
  const heapDriftMB = heapDriftBytes / (1024 * 1024);

  // Teardown Subsystems
  simulator.destroy();
  timerAudit.stop();

  // Telemetry Diagnostic Report
  t.diagnostic(`\n===============================================================`);
  t.diagnostic(`     10,000+ FRAME GAMEPLAY SIMULATION COMPREHENSIVE AUDIT     `);
  t.diagnostic(`===============================================================`);
  t.diagnostic(`Execution Mode:         ${isGcExposed ? 'V8 Explicit GC (--expose-gc)' : 'Ambient V8 GC'}`);
  t.diagnostic(`Total Frames Simulated: ${simulator.metrics.totalFrames} frames (1,000 warmup + 10,000 soak)`);
  t.diagnostic(`Warmup Execution:       ${warmupDurationMs.toFixed(2)} ms`);
  t.diagnostic(`Soak Execution:         ${soakDurationMs.toFixed(2)} ms`);
  t.diagnostic(`Average Frame Time:     ${avgFrameTimeMs.toFixed(4)} ms (${(avgFrameTimeMs * 1000).toFixed(1)} µs/frame)`);
  t.diagnostic(`Baseline Heap Used:     ${(baselineHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Final Heap Used:        ${(finalHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Net Heap Drift:         ${heapDriftMB.toFixed(4)} MB (${heapDriftBytes > 0 ? '+' : ''}${heapDriftBytes} bytes)`);
  t.diagnostic(`Heap Drift Budget:      <= ${HEAP_DRIFT_BUDGET_MB.toFixed(2)} MB`);
  t.diagnostic(`Total Bombs Placed:     ${simulator.metrics.bombsPlaced}`);
  t.diagnostic(`Total Detonations:      ${simulator.metrics.detonations}`);
  t.diagnostic(`Total Particles Fired:  ${simulator.metrics.particlesEmitted}`);
  t.diagnostic(`Pathfinding Queries:    ${simulator.metrics.pathfindingQueries}`);
  t.diagnostic(`Boss Projectiles:       ${simulator.metrics.bossProjectilesSpawned} (Peak: ${simulator.metrics.maxActiveBossProjectiles}/64)`);
  t.diagnostic(`Boss Shockwaves:        ${simulator.metrics.bossShockwavesSpawned} (Peak: ${simulator.metrics.maxActiveBossShockwaves}/16)`);
  t.diagnostic(`Floating Text Spawns:   ${simulator.metrics.floatingTextsRegistered}`);
  t.diagnostic(`---------------------------------------------------------------`);
  t.diagnostic(`Intermediate Checkpoints:`);
  for (const cp of checkpoints) {
    t.diagnostic(`  Frame ${cp.frame.toString().padStart(5, ' ')}: Heap ${cp.heapUsedMB} MB | Bombs: ${cp.activeBombs} | Expl: ${cp.activeExplosions} | Part: ${cp.activeParticles} | BossProj: ${cp.activeBossProjectiles}`);
  }
  t.diagnostic(`===============================================================\n`);

  // Assertions
  assert.strictEqual(simulator.metrics.totalFrames, TOTAL_SIMULATION_FRAMES, 'All 11,000 frames must be simulated');
  assert.ok(simulator.metrics.bombsPlaced > 80, 'Must simulate substantial bomb placements');
  assert.ok(simulator.metrics.detonations > 70, 'Must simulate substantial detonations');
  assert.ok(simulator.metrics.pathfindingQueries > 1000, 'Must execute high-throughput BFS queries');
  assert.ok(simulator.metrics.bossProjectilesSpawned > 40, 'Must simulate boss projectile lifecycle');
  assert.ok(avgFrameTimeMs < 0.5, `Average frame step time (${avgFrameTimeMs.toFixed(4)}ms) must be < 0.5ms`);

  if (isGcExposed) {
    assert.ok(
      heapDriftMB <= HEAP_DRIFT_BUDGET_MB,
      `Zero-GC Violation: Heap drift of ${heapDriftMB.toFixed(4)} MB exceeded budget of ${HEAP_DRIFT_BUDGET_MB} MB`
    );
  }
});

/* ==============================================================================
 * TEST SUITE 2: OBJECT POOL INVARIANT SIZES UNDER SATURATION & RECYCLING
 * ============================================================================== */

test('Pool Invariant Audit: Object pools maintain strict invariant sizes and zero corruption under saturation stress', () => {
  const capacities = [16, 32, 64, 128, 256];

  for (const cap of capacities) {
    const pool = new ObjectPool({
      capacity: cap,
      factory: (i) => ({ id: i, value: 0 }),
      reset: (item) => { item.value = 0; },
    });

    assert.strictEqual(pool.capacity, cap);
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.freeCount, cap);
    assert.ok(pool.verifyInvariants());

    // 1. Partial acquisition & verification
    const half = Math.floor(cap / 2);
    const acquired = [];
    for (let i = 0; i < half; i++) {
      const item = pool.acquire();
      assert.ok(item !== null);
      acquired.push(item);
    }
    assert.strictEqual(pool.activeCount, half);
    assert.strictEqual(pool.freeCount, cap - half);
    assert.strictEqual(pool.activeCount + pool.freeCount, cap);
    assert.ok(pool.verifyInvariants());

    // 2. Full saturation up to capacity
    while (!pool.isExhausted) {
      const item = pool.acquire();
      assert.ok(item !== null);
      acquired.push(item);
    }
    assert.strictEqual(pool.activeCount, cap);
    assert.strictEqual(pool.freeCount, 0);
    assert.ok(pool.isExhausted);
    assert.ok(pool.verifyInvariants());

    // 3. Overflow acquire rejection invariant (graceful null, no size expansion)
    const overflowItem = pool.acquire();
    assert.strictEqual(overflowItem, null, 'Exhausted pool must return null without expanding');
    assert.strictEqual(pool.capacity, cap, 'Capacity must remain strictly invariant');
    assert.strictEqual(pool.activeCount, cap);
    assert.ok(pool.verifyInvariants());

    // 4. Double-release immunity
    const first = acquired[0];
    const releasedFirst = pool.release(first);
    assert.strictEqual(releasedFirst, true);
    const doubleRelease = pool.release(first);
    assert.strictEqual(doubleRelease, false, 'Double release must be safely rejected');
    assert.strictEqual(pool.capacity, cap);
    assert.ok(pool.verifyInvariants());

    // 5. Release all remaining items
    for (let i = 1; i < acquired.length; i++) {
      pool.release(acquired[i]);
    }
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.freeCount, cap);
    assert.strictEqual(pool.activeCount + pool.freeCount, cap);
    assert.ok(pool.verifyInvariants());

    // 6. Reset & Destroy
    pool.reset();
    assert.strictEqual(pool.activeCount, 0);
    assert.strictEqual(pool.freeCount, cap);
    assert.ok(pool.verifyInvariants());

    pool.destroy();
  }
});

/* ==============================================================================
 * TEST SUITE 3: ZERO ORPHAN TIMERS AUDIT ACROSS ALL GAMEPLAY SUBSYSTEMS
 * ============================================================================== */

test('Timer Audit: Complete gameplay lifecycle teardown leaves 0 orphan timers in event loop', async (t) => {
  const timerAudit = new GlobalTimerAuditHarness();
  timerAudit.start();

  // Phase 1: Procedural Audio Synthesizers & Watchdogs
  const voicePool = new AudioVoicePool(16);
  const synth = new WebAudioSynth();
  const voltAudio = new VoltHazardAudio(voicePool);
  const dynamicAudio = new DynamicHazardAudio(voicePool);
  const magmaAudio = new MagmaHazardAudio(voicePool);
  const miasmaAudio = MiasmaHazardAudio.getInstance();
  miasmaAudio.bindPool(voicePool);
  const frostAudio = new FrostHazardAudio(voicePool);
  const chronoAudio = ChronoHazardAudio.getInstance();
  chronoAudio.setVoicePool(voicePool);

  // Trigger high-frequency events that arm internal timers
  for (let i = 0; i < 20; i++) {
    voltAudio.playStaticSpark(i * 100);
    voltAudio.playLightningBurst(i * 150);
    dynamicAudio.playTelegraphPulse(i * 100);
    magmaAudio.playMagmaUpwellingSizzle();
    magmaAudio.playPyroclasticBurst();
    miasmaAudio.playOrganicBubbling();
    miasmaAudio.playCorrosiveBurst();
    frostAudio.playCrystallizationCrackle(i * 100);
    frostAudio.playAbsoluteZeroBurst(i * 100);
    chronoAudio.playTemporalRipple();
    chronoAudio.playTimeCollapseImpact();
  }

  // Phase 2: Persistence Circuit Breaker & Timers
  const circuitBreaker = new APIQuotaCircuitBreaker({
    failureThreshold: 2,
    resetTimeoutMs: 100,
    initialBackoffMs: 20,
    maxBackoffMs: 80,
  });
  const persistence = new GameStatePersistence(undefined, undefined, circuitBreaker);

  // Trip circuit breaker to OPEN state (arms wakeup backoff timer)
  circuitBreaker.recordFailure({ status: 429, message: 'Rate limit' });
  circuitBreaker.recordFailure({ status: 429, message: 'Rate limit' });
  assert.strictEqual(circuitBreaker.getState(), CircuitBreakerState.OPEN);

  // Phase 3: Verify timers are currently active during simulation
  const activeDuringRun = timerAudit.getActiveCount();
  t.diagnostic(`Active timers during gameplay simulation: ${activeDuringRun}`);
  assert.ok(activeDuringRun > 0, 'Internal watchdog and wakeup timers must be active during gameplay');

  // Phase 4: Execute teardown on all subsystems
  synth.destroy();
  voltAudio.destroy();
  dynamicAudio.destroy();
  magmaAudio.destroy();
  miasmaAudio.destroy();
  MiasmaHazardAudio.resetInstance();
  frostAudio.destroy();
  FrostHazardAudio.resetInstance();
  chronoAudio.destroy();
  ChronoHazardAudio.resetInstance();
  voicePool.destroy();
  persistence.destroy();
  GameStatePersistence.resetInstance();
  circuitBreaker.destroy();

  // Phase 5: Verification of ZERO orphan timers
  const activeAfterTeardown = timerAudit.getActiveCount();
  t.diagnostic(`Active timers after full teardown: ${activeAfterTeardown}`);

  if (activeAfterTeardown > 0) {
    const details = timerAudit.getActiveDetails();
    t.diagnostic(`Orphan timer details: ${JSON.stringify(details)}`);
  }

  timerAudit.clearAll();
  timerAudit.stop();

  assert.strictEqual(
    activeAfterTeardown,
    0,
    `Orphan timer violation: ${activeAfterTeardown} orphan timers remained after teardown`
  );
});

/* ==============================================================================
 * TEST SUITE 4: HIGH-SATURATION STRESS SOAK (10,000 FRAMES UNDER PEAK POOL LOAD)
 * ============================================================================== */

test('Saturation Stress Soak: 10,000 Frames Under Full Pool Load Verifies Drift <= 0.25 MB & 0 Orphan Timers', (t) => {
  const isGcExposed = typeof global.gc === 'function';
  const timerAudit = new GlobalTimerAuditHarness();
  timerAudit.start();

  class HighSaturationSimulator extends ComprehensiveGameplaySimulator {
    stepAggressive(deltaMs, f) {
      const timeMs = f * deltaMs;

      // Aggressive bomb placement (every 8 frames)
      if (f % 8 === 0) {
        this.placeBomb(1 + (f % 11), 1 + (f % 13), 3, 'stress');
      }

      // Aggressive boss attack patterns
      if (f % 15 === 0) {
        this.bossAttacks.spawnProjectile(
          BossProjectileType.GATLING_SEED,
          300,
          260,
          Math.cos(f * 0.1) * 200,
          Math.sin(f * 0.1) * 200,
          6,
          800
        );
      }
      if (f % 60 === 0) {
        this.bossAttacks.spawnShockwave(300, 260, 200, 300, 2);
      }
      if (f % 30 === 0) {
        this.bossAttacks.addTelegraphTile(1 + (f % 11), 1 + (f % 13), 800);
      }
      if (f % 120 === 0 && this.bossAttacks.minionPool.activeCount < 4) {
        const m = this.bossAttacks.minionPool.acquire();
        if (m) {
          m.active = true;
          m.x = 300;
          m.y = 260;
        }
      }
      if (f % 240 === 0 && this.bossAttacks.minionPool.activeCount > 0) {
        let firstActive = null;
        this.bossAttacks.minionPool.forEachActive((item) => {
          if (!firstActive) firstActive = item;
        });
        if (firstActive) this.bossAttacks.minionPool.release(firstActive);
      }

      // Intensive pathfinding: 8 queries per frame
      for (let i = 0; i < 8; i++) {
        const start = (i * 23 + f) % this.totalTiles;
        const target = (i * 37 + f * 5) % this.totalTiles;
        this.pathfinder.findPath(start, target, this.pathBuffer);
        this.metrics.pathfindingQueries++;
      }

      // Floating text every 12 frames
      if (f % 12 === 0) {
        this.floatingText.registerSpawn(100 + (f % 400), 100 + (f % 300), timeMs);
      }

      super.step(deltaMs, f);
    }
  }

  const sim = new HighSaturationSimulator();

  // 1. Warmup (1,000 frames)
  for (let f = 0; f < 1000; f++) {
    sim.stepAggressive(FRAME_DELTA_MS, f);
  }

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const baselineHeap = process.memoryUsage().heapUsed;

  // 2. 10,000 Frames Aggressive Saturation
  const tStart = performance.now();
  for (let f = 1000; f < 11000; f++) {
    sim.stepAggressive(FRAME_DELTA_MS, f);

    if (f % 2000 === 0) {
      sim.verifyAllPoolInvariants();
    }
  }
  const durationMs = performance.now() - tStart;

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalHeap = process.memoryUsage().heapUsed;
  const driftMB = (finalHeap - baselineHeap) / (1024 * 1024);

  t.diagnostic(`Saturation Stress 10k: Duration ${durationMs.toFixed(1)}ms, Drift ${driftMB.toFixed(4)} MB, Bombs Placed: ${sim.metrics.bombsPlaced}, Queries: ${sim.metrics.pathfindingQueries}, Particles: ${sim.metrics.particlesEmitted}`);

  // Invariant assertions
  sim.verifyAllPoolInvariants();
  assert.ok(sim.metrics.bombsPlaced > 1200, 'Must simulate > 1,200 bombs under saturation');
  assert.ok(sim.metrics.particlesEmitted > 10000, 'Must emit > 10,000 particles');
  assert.ok(sim.metrics.pathfindingQueries > 80000, 'Must execute > 80,000 BFS queries');

  if (isGcExposed) {
    assert.ok(
      driftMB <= HEAP_DRIFT_BUDGET_MB,
      `Saturation drift of ${driftMB.toFixed(4)} MB exceeded budget of ${HEAP_DRIFT_BUDGET_MB} MB`
    );
  }

  // Teardown and timer audit
  sim.destroy();
  const orphanCount = timerAudit.getActiveCount();
  timerAudit.clearAll();
  timerAudit.stop();

  assert.strictEqual(orphanCount, 0, `Zero orphan timer violation: ${orphanCount} orphan timers found`);
});

/* ==============================================================================
 * TEST SUITE 5: EXTENDED 25,000-FRAME GRAND SOAK SIMULATION
 * (VERIFIES HEAP DRIFT <= 0.5 MB & ZERO ORPHANED TIMERS UNDER FULL SYSTEM LOAD)
 * ============================================================================== */

test('Long-Running Grand Soak: 25,000 Continuous Simulation Frames with Heap Drift <= 0.5 MB and Zero Orphaned Timers', (t) => {
  const isGcExposed = typeof global.gc === 'function';
  const timerAudit = new GlobalTimerAuditHarness();
  timerAudit.start();

  const GRAND_WARMUP_FRAMES = 1000;
  const GRAND_SOAK_FRAMES = 24000;
  const GRAND_TOTAL_FRAMES = GRAND_WARMUP_FRAMES + GRAND_SOAK_FRAMES; // 25,000 frames
  const HEAP_DRIFT_TARGET_MB = 0.50; // Required threshold: drift <= 0.5 MB

  class GrandSoakSimulator extends ComprehensiveGameplaySimulator {
    stepGrand(deltaMs, f) {
      const timeMs = f * deltaMs;

      // 1. High-frequency bomb mechanics (every 10 frames)
      if (f % 10 === 0) {
        this.placeBomb(1 + (f % 11), 1 + (f % 13), 3, 'grand_soak');
      }

      // 2. Boss attack subsystem stress
      if (f % 20 === 0) {
        this.bossAttacks.spawnProjectile(
          BossProjectileType.GATLING_SEED,
          300,
          260,
          Math.cos(f * 0.08) * 220,
          Math.sin(f * 0.08) * 220,
          8,
          900
        );
      }
      if (f % 80 === 0) {
        this.bossAttacks.spawnShockwave(300, 260, 220, 320, 2);
      }
      if (f % 40 === 0) {
        this.bossAttacks.addTelegraphTile(1 + (f % 11), 1 + (f % 13), 900);
      }
      if (f % 150 === 0 && this.bossAttacks.minionPool.activeCount < 4) {
        const m = this.bossAttacks.minionPool.acquire();
        if (m) {
          m.active = true;
          m.x = 300;
          m.y = 260;
        }
      }
      if (f % 300 === 0 && this.bossAttacks.minionPool.activeCount > 0) {
        let firstMinion = null;
        this.bossAttacks.minionPool.forEachActive((item) => {
          if (!firstMinion) firstMinion = item;
        });
        if (firstMinion) this.bossAttacks.minionPool.release(firstMinion);
      }

      // 3. Intensive Zero-GC pathfinding: 6 queries per frame
      for (let i = 0; i < 6; i++) {
        const start = (i * 17 + f) % this.totalTiles;
        const target = (i * 31 + f * 3) % this.totalTiles;
        this.pathfinder.findPath(start, target, this.pathBuffer);
        this.metrics.pathfindingQueries++;
      }

      // 4. Floating text HUD bursts (every 15 frames)
      if (f % 15 === 0) {
        this.floatingText.registerSpawn(120 + (f % 380), 120 + (f % 280), timeMs);
      }

      // 5. Periodic 429 quota rate-limit trip and auto-recovery
      if (f % 2000 === 0) {
        this.circuitBreaker.recordFailure({ status: 429, message: 'Simulated Rate Limit' });
      }

      super.step(deltaMs, f);
    }
  }

  const sim = new GrandSoakSimulator();

  // Phase 1: JIT & Pool Hydration Warmup (1,000 frames)
  const tWarmupStart = performance.now();
  for (let f = 0; f < GRAND_WARMUP_FRAMES; f++) {
    sim.stepGrand(FRAME_DELTA_MS, f);
  }
  const warmupDurationMs = performance.now() - tWarmupStart;

  // Compaction & Baseline Capture
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const baselineHeapUsed = process.memoryUsage().heapUsed;

  // Phase 2: 24,000 Continuous Soak Frames with Checkpoints
  const checkpoints = [];
  const tSoakStart = performance.now();

  for (let f = GRAND_WARMUP_FRAMES; f < GRAND_TOTAL_FRAMES; f++) {
    sim.stepGrand(FRAME_DELTA_MS, f);

    // Periodic pool invariant check
    if (f % 2000 === 0) {
      sim.verifyAllPoolInvariants();
    }

    // Checkpoints at 5k, 10k, 15k, 20k, 25k frames
    if (f === 5000 || f === 10000 || f === 15000 || f === 20000 || f === GRAND_TOTAL_FRAMES - 1) {
      checkpoints.push({
        frame: f + 1,
        heapMB: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(3),
        activeBombs: sim.bombPool.activeCount,
        activeExplosions: sim.explosionPool.activeCount,
        activeParticles: sim.particlePool.activeCount,
        activeBossProj: sim.bossAttacks.projectilePool.activeCount,
        activeTimers: timerAudit.getActiveCount(),
      });
    }
  }

  const soakDurationMs = performance.now() - tSoakStart;
  const avgFrameTimeMs = soakDurationMs / GRAND_SOAK_FRAMES;

  // Post-run GC Compaction & Final Capture
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalHeapUsed = process.memoryUsage().heapUsed;
  const netDriftBytes = finalHeapUsed - baselineHeapUsed;
  const netDriftMB = netDriftBytes / (1024 * 1024);

  // Active timers before teardown
  const activeTimersBeforeTeardown = timerAudit.getActiveCount();

  // Phase 3: Complete Teardown & Verification of Zero Orphan Timers
  sim.destroy();
  const orphanTimersAfterTeardown = timerAudit.getActiveCount();

  if (orphanTimersAfterTeardown > 0) {
    const details = timerAudit.getActiveDetails();
    t.diagnostic(`[CRITICAL] Orphan timer details: ${JSON.stringify(details)}`);
  }

  timerAudit.clearAll();
  timerAudit.stop();

  // Phase 4: Telemetry Diagnostics Reporting
  t.diagnostic(`\n===============================================================`);
  t.diagnostic(`     25,000-FRAME GRAND SOAK SIMULATION TELEMETRY REPORT       `);
  t.diagnostic(`===============================================================`);
  t.diagnostic(`Execution Mode:          ${isGcExposed ? 'V8 Explicit GC (--expose-gc)' : 'Ambient V8 GC'}`);
  t.diagnostic(`Total Frames Simulated:  ${GRAND_TOTAL_FRAMES} (1,000 warmup + 24,000 soak)`);
  t.diagnostic(`Warmup Execution Time:   ${warmupDurationMs.toFixed(2)} ms`);
  t.diagnostic(`Soak Execution Time:     ${soakDurationMs.toFixed(2)} ms`);
  t.diagnostic(`Average Frame Step Time: ${avgFrameTimeMs.toFixed(4)} ms (${(avgFrameTimeMs * 1000).toFixed(1)} µs/frame)`);
  t.diagnostic(`Baseline Heap Used:      ${(baselineHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Final Heap Used:         ${(finalHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Net Heap Drift:          ${netDriftMB.toFixed(4)} MB (${netDriftBytes > 0 ? '+' : ''}${netDriftBytes} bytes)`);
  t.diagnostic(`Heap Drift Budget:       <= ${HEAP_DRIFT_TARGET_MB.toFixed(2)} MB`);
  t.diagnostic(`Total Bombs Placed:      ${sim.metrics.bombsPlaced}`);
  t.diagnostic(`Total Detonations:       ${sim.metrics.detonations}`);
  t.diagnostic(`Total Particles Fired:   ${sim.metrics.particlesEmitted}`);
  t.diagnostic(`Pathfinding Queries:     ${sim.metrics.pathfindingQueries}`);
  t.diagnostic(`Boss Projectiles:        ${sim.metrics.bossProjectilesSpawned}`);
  t.diagnostic(`Boss Shockwaves:         ${sim.metrics.bossShockwavesSpawned}`);
  t.diagnostic(`Floating Text Spawns:    ${sim.metrics.floatingTextsRegistered}`);
  t.diagnostic(`Active Timers During Run:${activeTimersBeforeTeardown}`);
  t.diagnostic(`Orphan Timers Post-Exit: ${orphanTimersAfterTeardown}`);
  t.diagnostic(`---------------------------------------------------------------`);
  t.diagnostic(`Checkpoints:`);
  for (const cp of checkpoints) {
    t.diagnostic(`  Frame ${cp.frame.toString().padStart(5, ' ')}: Heap ${cp.heapMB} MB | Bombs: ${cp.activeBombs} | Expl: ${cp.activeExplosions} | Part: ${cp.activeParticles} | BossProj: ${cp.activeBossProj} | Timers: ${cp.activeTimers}`);
  }
  t.diagnostic(`===============================================================\n`);

  // Phase 5: Verification Assertions
  assert.strictEqual(sim.metrics.totalFrames, GRAND_TOTAL_FRAMES, 'All 25,000 frames must execute');
  assert.ok(sim.metrics.bombsPlaced > 2000, 'Must place > 2,000 bombs');
  assert.ok(sim.metrics.particlesEmitted > 15000, 'Must fire > 15,000 particles');
  assert.ok(sim.metrics.pathfindingQueries > 100000, 'Must execute > 100,000 BFS queries');
  assert.ok(avgFrameTimeMs < 0.50, `Average frame step time must be < 0.50ms (got ${avgFrameTimeMs.toFixed(4)}ms)`);

  // Verify Heap Drift <= 0.5 MB Invariant
  if (isGcExposed) {
    assert.ok(
      netDriftMB <= HEAP_DRIFT_TARGET_MB,
      `Heap drift violation: observed ${netDriftMB.toFixed(4)} MB > threshold of ${HEAP_DRIFT_TARGET_MB} MB`
    );
  }

  // Verify Zero Orphaned Timers Invariant
  assert.strictEqual(
    orphanTimersAfterTeardown,
    0,
    `Zero orphaned timer violation: ${orphanTimersAfterTeardown} orphan timers remained after teardown`
  );
});
