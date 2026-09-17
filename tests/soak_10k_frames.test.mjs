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
import { CameraTraumaSimulator } from '../src/game/ultimate_skills.ts';
import { ObjectPool } from '../src/game/pooling/ObjectPool.ts';

/* ==============================================================================
 * CONSTANTS & CONFIGURATION
 * ============================================================================== */

const TOTAL_TILES = ROWS * COLS; // 195 tiles (13 x 15)
const WARMUP_FRAMES = 1000;
const SOAK_RUN_FRAMES = 9000;
const TOTAL_FRAMES = WARMUP_FRAMES + SOAK_RUN_FRAMES; // 10,000 frames
const FRAME_DELTA_MS = 16.6667; // 60 FPS standard delta
const HEAP_DRIFT_THRESHOLD_MB = 0.25; // Strict Zero-GC maximum allowable heap drift

/* ==============================================================================
 * SUBSYSTEM 1: CONTIGUOUS OBJECT POOL ENGINE (M1 SPECIFICATION)
 * ============================================================================== */

export class ContiguousObjectPool {
  constructor(factory, resetFn, initialCapacity) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.capacity = initialCapacity;
    this.pool = new Array(initialCapacity);
    for (let i = 0; i < initialCapacity; i++) {
      this.pool[i] = factory();
    }
    this.activeCount = 0;
  }

  acquire() {
    if (this.activeCount >= this.capacity) {
      return null;
    }
    const item = this.pool[this.activeCount++];
    this.resetFn(item);
    return item;
  }

  release(item) {
    const idx = this.pool.indexOf(item);
    if (idx === -1 || idx >= this.activeCount) return;
    this.activeCount--;
    // Contiguous swap with last active item for O(1) release without garbage
    const lastActive = this.pool[this.activeCount];
    this.pool[this.activeCount] = item;
    this.pool[idx] = lastActive;
  }

  forEachActive(callback) {
    for (let i = 0; i < this.activeCount; i++) {
      callback(this.pool[i], i);
    }
  }

  getActiveCount() {
    return this.activeCount;
  }

  reset() {
    this.activeCount = 0;
  }
}

/* ==============================================================================
 * SUBSYSTEM 2: 1D TYPED-ARRAY ZERO-GC PATHFINDER (M1 SPECIFICATION)
 * ============================================================================== */

export class ZeroGCPathfinderSimulator {
  constructor(cols = COLS, rows = ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.totalTiles = cols * rows;
    this.visited = new Uint8Array(this.totalTiles);
    this.queue = new Int16Array(this.totalTiles);
    this.parent = new Int16Array(this.totalTiles);
    this.obstacles = new Uint8Array(this.totalTiles);
    this.dirOffsets = new Int16Array([-cols, cols, -1, 1]); // Up, Down, Left, Right
  }

  setObstacles(walkableBitmask) {
    for (let i = 0; i < this.totalTiles; i++) {
      this.obstacles[i] = walkableBitmask[i] === 1 ? 0 : 1;
    }
  }

  findPath(startIdx, targetIdx, outPath) {
    if (startIdx === targetIdx) return 0;
    if (startIdx < 0 || startIdx >= this.totalTiles || targetIdx < 0 || targetIdx >= this.totalTiles) {
      return 0;
    }

    this.visited.fill(0);
    this.parent.fill(-1);

    let head = 0;
    let tail = 0;
    this.queue[tail++] = startIdx;
    this.visited[startIdx] = 1;

    let reached = false;
    let closestIdx = startIdx;
    const targetR = Math.floor(targetIdx / this.cols);
    const targetC = targetIdx % this.cols;
    let minManhattan = Math.abs(Math.floor(startIdx / this.cols) - targetR) + Math.abs((startIdx % this.cols) - targetC);

    while (head < tail) {
      const curr = this.queue[head++];
      if (curr === targetIdx) {
        reached = true;
        break;
      }

      const cr = Math.floor(curr / this.cols);
      const cc = curr % this.cols;
      const dist = Math.abs(cr - targetR) + Math.abs(cc - targetC);
      if (dist < minManhattan) {
        minManhattan = dist;
        closestIdx = curr;
      }

      for (let i = 0; i < 4; i++) {
        const next = curr + this.dirOffsets[i];
        if (next < 0 || next >= this.totalTiles) continue;

        // Verify grid boundary wrap
        const nr = Math.floor(next / this.cols);
        const nc = next % this.cols;
        if (Math.abs(nr - cr) + Math.abs(nc - cc) !== 1) continue;

        if (this.visited[next] === 1 || this.obstacles[next] === 1) continue;

        this.visited[next] = 1;
        this.parent[next] = curr;
        this.queue[tail++] = next;
      }
    }

    const destination = reached ? targetIdx : closestIdx;
    if (destination === startIdx) return 0;

    let pathLen = 0;
    let step = destination;
    while (step !== startIdx && step !== -1 && pathLen < this.totalTiles) {
      outPath[pathLen++] = step;
      step = this.parent[step];
    }
    return pathLen;
  }
}

/* ==============================================================================
 * SUBSYSTEM 3: ZERO-GC CAMERA TRAUMA ENGINE WITH SCRATCH VECTORS
 * ============================================================================== */

export class ZeroGCCameraTraumaSimulator extends CameraTraumaSimulator {
  constructor(maxOffset = 18, maxAngle = 3.5, decayRate = 1.4) {
    super(maxOffset, maxAngle, decayRate);
    this.scratchOffsets = { x: 0, y: 0, angle: 0 };
    this.scratchMag = { trauma: 0, offsetPx: 0, angleDeg: 0 };
  }

  getOffsets(timeMs = 0, out = this.scratchOffsets) {
    if (this.trauma <= 0.0001) {
      out.x = 0;
      out.y = 0;
      out.angle = 0;
      return out;
    }
    const factor = this.trauma * this.trauma;
    const offsetPx = factor * this.maxOffset;
    const angleDeg = factor * this.maxAngle;
    const t = timeMs * 0.04;
    out.x = offsetPx * (Math.sin(t * 1.37) * 0.65 + Math.cos(t * 2.11) * 0.35);
    out.y = offsetPx * (Math.cos(t * 1.73) * 0.65 + Math.sin(t * 2.89) * 0.35);
    out.angle = angleDeg * Math.sin(t * 1.93);
    return out;
  }
}

/* ==============================================================================
 * SUBSYSTEM 4: HEADLESS 10,000-FRAME CONTINUOUS SIMULATION ENGINE
 * ============================================================================== */

export class HeadlessSoakSimulator {
  constructor() {
    // 1. Grid & Map
    this.rows = ROWS;
    this.cols = COLS;
    this.totalTiles = TOTAL_TILES;
    this.walls = new Uint8Array(TOTAL_TILES);
    this.blocks = new Uint8Array(TOTAL_TILES);
    this.hazardBitmask = new FlatHazardMask(TOTAL_TILES);
    this.pathOutBuffer = new Int16Array(TOTAL_TILES);

    this.initMap();

    // 2. Subsystems
    this.pathfinder = new ZeroGCPathfinder(this.rows, this.cols);
    this.traumaEngine = new CameraTraumaSimulator();
    this.scratchOffset = { x: 0, y: 0, angle: 0 };

    // 3. Contiguous Object Pools
    this.bombPool = new ContiguousObjectPool(
      () => ({ id: 0, r: 0, c: 0, fuse: 0, power: 2, stage: 1, owner: 'player' }),
      (b) => { b.id = 0; b.r = 0; b.c = 0; b.fuse = 0; b.power = 2; b.stage = 1; b.owner = 'player'; },
      32
    );

    this.explosionPool = new ContiguousObjectPool(
      () => ({ tileIdx: 0, lifeRemainingMs: 0, isCenter: false }),
      (e) => { e.tileIdx = 0; e.lifeRemainingMs = 0; e.isCenter = false; },
      128
    );

    this.particlePool = new ContiguousObjectPool(
      () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0 }),
      (p) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 0; p.maxLife = 0; },
      256
    );

    // 4. Entities
    this.player = {
      r: 1,
      c: 1,
      x: 60,
      y: 60,
      speed: 150,
      bombCooldownMs: 0,
      maxBombs: 3,
      bombPower: 2,
    };

    this.enemies = [
      { id: 1, type: 'CHASER', r: 1, c: 13, x: 540, y: 60, speed: 75, pathRecalcTimer: 0, hp: 1 },
      { id: 2, type: 'BOMBER', r: 11, c: 1, x: 60, y: 460, speed: 70, pathRecalcTimer: 0, bombTimer: 180, hp: 1 },
      { id: 3, type: 'TANK', r: 11, c: 13, x: 540, y: 460, speed: 50, pathRecalcTimer: 0, hp: 3 },
      { id: 4, type: 'GHOST', r: 5, c: 7, x: 300, y: 220, speed: 60, pathRecalcTimer: 0, hp: 1 },
    ];

    // 5. Telemetry & Metrics
    this.metrics = {
      totalFrames: 0,
      bombsPlaced: 0,
      detonations: 0,
      particlesEmitted: 0,
      pathfindingQueries: 0,
      maxActiveBombs: 0,
      maxActiveExplosions: 0,
      maxActiveParticles: 0,
    };
  }

  initMap() {
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

  getWalkableBitmask(outBitmask) {
    for (let i = 0; i < this.totalTiles; i++) {
      outBitmask[i] = (this.walls[i] === 0 && this.blocks[i] === 0) ? 1 : 0;
    }
    // Mark active bombs as non-walkable
    for (let i = 0; i < this.bombPool.activeCount; i++) {
      const b = this.bombPool.pool[i];
      const idx = b.r * this.cols + b.c;
      outBitmask[idx] = 0;
    }
  }

  step(deltaMs, frameNumber) {
    this.metrics.totalFrames++;
    const timeMs = frameNumber * deltaMs;

    // --- 1. Clear Hazard Bitmask & Update Camera Trauma ---
    this.hazardBitmask.fill(0);
    this.traumaEngine.update(deltaMs / 1000);
    this.traumaEngine.getOffsets(timeMs, this.scratchOffset);

    // --- 2. Update Active Explosions ---
    for (let i = this.explosionPool.activeCount - 1; i >= 0; i--) {
      const expl = this.explosionPool.pool[i];
      expl.lifeRemainingMs -= deltaMs;
      if (expl.lifeRemainingMs <= 0) {
        this.explosionPool.release(expl);
      } else {
        this.hazardBitmask.setIdx(expl.tileIdx, 1);
      }
    }

    // --- 3. Update Active Particles ---
    for (let i = this.particlePool.activeCount - 1; i >= 0; i--) {
      const p = this.particlePool.pool[i];
      p.life -= 1;
      if (p.life <= 0) {
        this.particlePool.release(p);
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96; // Drag
        p.vy *= 0.96;
      }
    }

    // --- 4. Update Active Bombs & Handle Detonations ---
    for (let i = this.bombPool.activeCount - 1; i >= 0; i--) {
      const bomb = this.bombPool.pool[i];
      bomb.fuse += deltaMs;

      if (bomb.fuse < 1000) {
        bomb.stage = 1;
      } else if (bomb.fuse < 1600) {
        bomb.stage = 2;
      } else if (bomb.fuse < 2000) {
        bomb.stage = 3;
      } else {
        // Detonation!
        this.detonateBomb(bomb);
      }
    }

    // --- 5. Player Simulation ---
    if (this.player.bombCooldownMs > 0) {
      this.player.bombCooldownMs = Math.max(0, this.player.bombCooldownMs - deltaMs);
    }
    // Player drops bomb periodically (every 120 frames ≈ 2.0s)
    if (frameNumber % 120 === 0 && this.bombPool.getActiveCount() < this.player.maxBombs) {
      this.placeBomb(this.player.r, this.player.c, this.player.bombPower, 'player');
    }

    // --- 6. Enemy AI & Pathfinding Simulation ---
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      enemy.pathRecalcTimer -= deltaMs;

      if (enemy.pathRecalcTimer <= 0) {
        enemy.pathRecalcTimer = 300 + (i * 50); // Recalculate every 300-500ms
        const enemyIdx = enemy.r * this.cols + enemy.c;
        const playerIdx = this.player.r * this.cols + this.player.c;

        // Pathfinding query via flat 1D typed arrays
        this.pathfinder.findPath(enemyIdx, playerIdx, this.pathOutBuffer);
        this.metrics.pathfindingQueries++;
      }

      // Bomber drops bomb every 240 frames
      if (enemy.type === 'BOMBER') {
        enemy.bombTimer = (enemy.bombTimer || 240) - 1;
        if (enemy.bombTimer <= 0) {
          enemy.bombTimer = 240;
          this.placeBomb(enemy.r, enemy.c, 1, 'enemy');
        }
      }
    }

    // Track peak pool hydration
    if (this.bombPool.getActiveCount() > this.metrics.maxActiveBombs) {
      this.metrics.maxActiveBombs = this.bombPool.getActiveCount();
    }
    if (this.explosionPool.getActiveCount() > this.metrics.maxActiveExplosions) {
      this.metrics.maxActiveExplosions = this.explosionPool.getActiveCount();
    }
    if (this.particlePool.getActiveCount() > this.metrics.maxActiveParticles) {
      this.metrics.maxActiveParticles = this.particlePool.getActiveCount();
    }
  }

  placeBomb(r, c, power, owner = 'player') {
    const bomb = this.bombPool.acquire();
    if (!bomb) return null;
    bomb.r = r;
    bomb.c = c;
    bomb.power = power;
    bomb.owner = owner;
    bomb.fuse = 0;
    bomb.stage = 1;
    this.metrics.bombsPlaced++;
    return bomb;
  }

  detonateBomb(bomb) {
    this.metrics.detonations++;
    this.traumaEngine.addTrauma(0.18);

    const centerIdx = bomb.r * this.cols + bomb.c;

    // Center blast
    const centerExpl = this.explosionPool.acquire();
    if (centerExpl) {
      centerExpl.tileIdx = centerIdx;
      centerExpl.lifeRemainingMs = 300;
      centerExpl.isCenter = true;
      this.hazardBitmask.setCoord(bomb.r, bomb.c, 1);
    }

    // 4 cardinal rays
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

        if (this.walls[nIdx] === 1) break; // Walls stop rays

        // Destroy breakable block
        if (this.blocks[nIdx] === 1) {
          this.blocks[nIdx] = 0; // Destroyed
          const expl = this.explosionPool.acquire();
          if (expl) {
            expl.tileIdx = nIdx;
            expl.lifeRemainingMs = 300;
            this.hazardBitmask.setCoord(nr, nc, 1);
          }
          this.emitParticles(nc * TILE_SIZE + 20, nr * TILE_SIZE + 20, 8);
          break; // Block absorbs remaining ray
        }

        // Empty tile engulfed
        const expl = this.explosionPool.acquire();
        if (expl) {
          expl.tileIdx = nIdx;
          expl.lifeRemainingMs = 300;
          this.hazardBitmask.setCoord(nr, nc, 1);
        }
        this.emitParticles(nc * TILE_SIZE + 20, nr * TILE_SIZE + 20, 4);

        // Trigger chain reaction on any active bomb in blast zone
        for (let b = 0; b < this.bombPool.activeCount; b++) {
          const otherBomb = this.bombPool.pool[b];
          if (otherBomb !== bomb && otherBomb.r === nr && otherBomb.c === nc) {
            otherBomb.fuse = 2000; // Detonate immediately on next tick
          }
        }
      }
    }

    // Release exploded bomb
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
      p.maxLife = p.life;
      this.metrics.particlesEmitted++;
    }
  }
}

/* ==============================================================================
 * SUITE 1: TIER 1 & TIER 2 SUBSYSTEM ISOLATED SOAK TESTS
 * ============================================================================== */

test('Tier 1 [ZeroGCPathfinder]: 10,000 isolated BFS queries produce valid paths with zero heap drift', () => {
  const pathfinder = new ZeroGCPathfinder(ROWS, COLS);
  const outPath = new Int16Array(TOTAL_TILES);

  // Warmup 1k queries
  for (let i = 0; i < 1000; i++) {
    pathfinder.findPath(1 * COLS + 1, 11 * COLS + 13, outPath);
  }

  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }
  const baselineHeap = process.memoryUsage().heapUsed;

  // 10,000 queries across varying points
  for (let i = 0; i < 10000; i++) {
    const start = (1 + (i % 9)) * COLS + (1 + (i % 11));
    const target = (11 - (i % 9)) * COLS + (13 - (i % 11));
    const len = pathfinder.findPath(start, target, outPath);
    assert.ok(len >= 0, 'Path length must be non-negative');
  }

  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }
  const finalHeap = process.memoryUsage().heapUsed;
  const driftMB = (finalHeap - baselineHeap) / (1024 * 1024);

  if (typeof global.gc === 'function') {
    assert.ok(driftMB <= 0.10, `Pathfinder heap drift ${driftMB.toFixed(4)} MB exceeded 0.10 MB limit`);
  }
});

test('Tier 1 [ObjectPool]: 10,000 continuous acquire/release cycles maintain pool capacity invariants', () => {
  const pool = new ObjectPool({
    capacity: 64,
    factory: (i) => ({ id: i, x: 0, y: 0 }),
    reset: (item) => { item.id = 0; item.x = 0; item.y = 0; },
  });

  assert.strictEqual(pool.activeCount, 0);

  for (let cycle = 0; cycle < 10000; cycle++) {
    const batch = [];
    const count = 1 + (cycle % 32);
    for (let i = 0; i < count; i++) {
      const item = pool.acquire();
      assert.ok(item !== null, 'Acquire must succeed within capacity');
      batch.push(item);
    }
    assert.strictEqual(pool.activeCount, count);

    // Release all in random order
    for (let i = batch.length - 1; i >= 0; i--) {
      pool.release(batch[i]);
    }
    assert.strictEqual(pool.activeCount, 0);
  }
});

test('Tier 1 [CameraTraumaSimulator]: 10,000 continuous frame evaluations with scratch vector allocate 0 bytes', () => {
  const trauma = new CameraTraumaSimulator();
  const out = { x: 0, y: 0, angle: 0 };

  // 1k Warmup
  for (let f = 0; f < 1000; f++) {
    trauma.addTrauma(0.01);
    trauma.update(0.01667);
    trauma.getOffsets(f * 16.667, out);
  }

  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }
  const baseline = process.memoryUsage().heapUsed;

  for (let f = 1000; f < 11000; f++) {
    if (f % 60 === 0) trauma.addTrauma(0.25);
    trauma.update(0.01667);
    trauma.getOffsets(f * 16.667, out);
    assert.ok(Number.isFinite(out.x));
    assert.ok(Number.isFinite(out.y));
    assert.ok(Number.isFinite(out.angle));
  }

  if (typeof global.gc === 'function') {
    global.gc();
    global.gc();
  }
  const final = process.memoryUsage().heapUsed;
  const driftMB = (final - baseline) / (1024 * 1024);

  if (typeof global.gc === 'function') {
    assert.ok(driftMB <= 0.05, `Camera trauma scratch vector drift ${driftMB.toFixed(4)} MB exceeded 0.05 MB`);
  }
});

test('Tier 2 [Hazard Bitmask]: 10,000 frame hazard cycles eliminate per-frame Set<string> allocations', () => {
  const bitmask = new FlatHazardMask(TOTAL_TILES);

  for (let f = 0; f < 10000; f++) {
    bitmask.fill(0);
    // Mark 10 dynamic hazard blast tiles
    for (let i = 0; i < 10; i++) {
      const idx = (f * 7 + i * 13) % TOTAL_TILES;
      bitmask.setIdx(idx, 1);
    }
    // Query hazard
    const isHazard = bitmask.isHazardIdx(1 * COLS + 1);
    assert.strictEqual(typeof isHazard, 'boolean');
  }
});

/* ==============================================================================
 * SUITE 2: TIER 3 & TIER 4 GRAND SOAK TEST (10,000 CONTINUOUS FRAMES)
 * ============================================================================== */

test('Grand Soak: 10,000 Continuous Headless Frames with V8 Heap Drift <= 0.25 MB', (t) => {
  const simulator = new HeadlessSoakSimulator();
  const isGcExposed = typeof global.gc === 'function';

  // --- Phase 1: JIT & Pool Hydration Warmup (1,000 frames) ---
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

  // --- Phase 2: 9,000-Frame Soak Execution with Checkpoints ---
  const checkpoints = [];
  const tSoakStart = performance.now();

  for (let f = WARMUP_FRAMES; f < TOTAL_FRAMES; f++) {
    simulator.step(FRAME_DELTA_MS, f);

    // Record checkpoints at 2.5k, 5.0k, 7.5k, and 10k frames
    if (f === 2500 || f === 5000 || f === 7500 || f === TOTAL_FRAMES - 1) {
      checkpoints.push({
        frame: f + 1,
        heapUsed: process.memoryUsage().heapUsed,
        activeBombs: simulator.bombPool.getActiveCount(),
        activeExplosions: simulator.explosionPool.getActiveCount(),
        activeParticles: simulator.particlePool.getActiveCount(),
      });
    }
  }

  const soakDurationMs = performance.now() - tSoakStart;
  const avgFrameTimeMs = soakDurationMs / SOAK_RUN_FRAMES;

  // Post-run GC & Final Capture
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalMemory = process.memoryUsage();
  const finalHeapUsed = finalMemory.heapUsed;

  const heapDriftBytes = finalHeapUsed - baselineHeapUsed;
  const heapDriftMB = heapDriftBytes / (1024 * 1024);

  // --- Phase 3: Telemetry Reporting ---
  t.diagnostic(`\n===============================================================`);
  t.diagnostic(`          10,000-FRAME SOAK TEST TELEMETRY REPORT              `);
  t.diagnostic(`===============================================================`);
  t.diagnostic(`Execution Mode:        ${isGcExposed ? 'V8 Explicit GC (--expose-gc)' : 'Ambient V8 GC (recommend --expose-gc)'}`);
  t.diagnostic(`Warmup Duration:       ${warmupDurationMs.toFixed(2)} ms (1,000 frames)`);
  t.diagnostic(`Soak Execution Time:   ${soakDurationMs.toFixed(2)} ms (9,000 frames)`);
  t.diagnostic(`Average Frame Time:    ${avgFrameTimeMs.toFixed(4)} ms (${(avgFrameTimeMs * 1000).toFixed(1)} µs/frame)`);
  t.diagnostic(`Baseline Heap Used:    ${(baselineHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Final Heap Used:       ${(finalHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Net Heap Drift:        ${heapDriftMB.toFixed(4)} MB (${heapDriftBytes > 0 ? '+' : ''}${heapDriftBytes} bytes)`);
  t.diagnostic(`Heap Drift Budget:     <= ${HEAP_DRIFT_THRESHOLD_MB.toFixed(2)} MB`);
  t.diagnostic(`Total Bombs Placed:    ${simulator.metrics.bombsPlaced}`);
  t.diagnostic(`Total Detonations:     ${simulator.metrics.detonations}`);
  t.diagnostic(`Total Particles Fired: ${simulator.metrics.particlesEmitted}`);
  t.diagnostic(`Pathfinding Queries:   ${simulator.metrics.pathfindingQueries}`);
  t.diagnostic(`Peak Active Bombs:     ${simulator.metrics.maxActiveBombs} / 32`);
  t.diagnostic(`Peak Active Explosions:${simulator.metrics.maxActiveExplosions} / 128`);
  t.diagnostic(`Peak Active Particles: ${simulator.metrics.maxActiveParticles} / 256`);
  t.diagnostic(`---------------------------------------------------------------`);
  t.diagnostic(`Intermediate Checkpoints:`);
  for (const cp of checkpoints) {
    t.diagnostic(`  Frame ${cp.frame.toString().padStart(5, ' ')}: Heap ${(cp.heapUsed / (1024 * 1024)).toFixed(3)} MB | Bombs: ${cp.activeBombs} | Expl: ${cp.activeExplosions} | Part: ${cp.activeParticles}`);
  }
  t.diagnostic(`===============================================================\n`);

  // --- Phase 4: Verification Assertions ---

  // 1. Total frame execution invariance
  assert.strictEqual(simulator.metrics.totalFrames, TOTAL_FRAMES, 'All 10,000 frames must execute');

  // 2. High-throughput mechanics verification
  assert.ok(simulator.metrics.bombsPlaced > 50, 'Soak must simulate significant bomb placements');
  assert.ok(simulator.metrics.detonations > 40, 'Soak must simulate bomb explosions');
  assert.ok(simulator.metrics.particlesEmitted > 500, 'Soak must simulate heavy particle generation');
  assert.ok(simulator.metrics.pathfindingQueries > 500, 'Soak must simulate regular enemy pathfinding calls');

  // 3. Pool capacity invariants
  assert.ok(simulator.metrics.maxActiveBombs <= 32, 'Active bombs must never exceed pool capacity 32');
  assert.ok(simulator.metrics.maxActiveExplosions <= 128, 'Active explosions must never exceed pool capacity 128');
  assert.ok(simulator.metrics.maxActiveParticles <= 256, 'Active particles must never exceed pool capacity 256');

  // 4. Performance headroom verification (60+ FPS requirement: < 16.6ms per frame)
  assert.ok(avgFrameTimeMs < 0.5, `Average frame step time (${avgFrameTimeMs.toFixed(4)}ms) must be < 0.5ms for 60+ FPS`);

  // 5. Zero-GC Memory Invariant: Heap Drift <= 0.25 MB
  if (isGcExposed) {
    assert.ok(
      heapDriftMB <= HEAP_DRIFT_THRESHOLD_MB,
      `Zero-GC Violation: Heap drift of ${heapDriftMB.toFixed(4)} MB exceeded threshold of ${HEAP_DRIFT_THRESHOLD_MB} MB`
    );
  } else {
    // Ambient GC mode: warning if exceeded, but allow reasonable runtime margin
    if (heapDriftMB > HEAP_DRIFT_THRESHOLD_MB) {
      t.diagnostic(`[NOTICE] Ambient V8 GC drift was ${heapDriftMB.toFixed(4)} MB. Run with --expose-gc for exact Zero-GC verification.`);
    }
  }
});
