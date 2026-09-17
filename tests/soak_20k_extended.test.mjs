import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectPool, POOL_PRESETS } from '../src/game/pooling/ObjectPool.ts';
import { HeadlessSoakSimulator } from './soak_10k_frames.test.mjs';

/* ==============================================================================
 * EXTENDED SOAK CONSTANTS (20,000 FRAMES)
 * ============================================================================== */

const EXTENDED_WARMUP_FRAMES = 1000;
const EXTENDED_SOAK_FRAMES = 19000;
const EXTENDED_TOTAL_FRAMES = EXTENDED_WARMUP_FRAMES + EXTENDED_SOAK_FRAMES; // 20,000 frames
const FRAME_DELTA_MS = 16.6667;
const HEAP_DRIFT_THRESHOLD_MB = 0.25;

/* ==============================================================================
 * TEST 1: 20,000-FRAME EXTENDED CONTINUOUS HEADLESS SOAK TEST
 * ============================================================================== */

test('Challenger Extended Soak: 20,000 Continuous Headless Frames with V8 Heap Drift <= 0.25 MB', (t) => {
  const simulator = new HeadlessSoakSimulator();
  const isGcExposed = typeof global.gc === 'function';

  // Warmup (1,000 frames)
  const tWarmupStart = performance.now();
  for (let f = 0; f < EXTENDED_WARMUP_FRAMES; f++) {
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

  // 19,000 Extended Soak Execution with Checkpoints every 2,500 frames
  const checkpoints = [];
  const tSoakStart = performance.now();

  for (let f = EXTENDED_WARMUP_FRAMES; f < EXTENDED_TOTAL_FRAMES; f++) {
    simulator.step(FRAME_DELTA_MS, f);

    if (f % 2500 === 0 || f === EXTENDED_TOTAL_FRAMES - 1) {
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
  const avgFrameTimeMs = soakDurationMs / EXTENDED_SOAK_FRAMES;

  // Post-run GC & Final Capture
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalMemory = process.memoryUsage();
  const finalHeapUsed = finalMemory.heapUsed;

  const heapDriftBytes = finalHeapUsed - baselineHeapUsed;
  const heapDriftMB = heapDriftBytes / (1024 * 1024);

  t.diagnostic(`\n===============================================================`);
  t.diagnostic(`          20,000-FRAME EXTENDED SOAK TEST TELEMETRY            `);
  t.diagnostic(`===============================================================`);
  t.diagnostic(`Execution Mode:        ${isGcExposed ? 'V8 Explicit GC (--expose-gc)' : 'Ambient V8 GC'}`);
  t.diagnostic(`Warmup Duration:       ${warmupDurationMs.toFixed(2)} ms (${EXTENDED_WARMUP_FRAMES} frames)`);
  t.diagnostic(`Soak Execution Time:   ${soakDurationMs.toFixed(2)} ms (${EXTENDED_SOAK_FRAMES} frames)`);
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
  t.diagnostic(`Checkpoints:`);
  for (const cp of checkpoints) {
    t.diagnostic(`  Frame ${cp.frame.toString().padStart(5, ' ')}: Heap ${(cp.heapUsed / (1024 * 1024)).toFixed(3)} MB | Bombs: ${cp.activeBombs} | Expl: ${cp.activeExplosions} | Part: ${cp.activeParticles}`);
  }
  t.diagnostic(`===============================================================\n`);

  // Assertions
  assert.strictEqual(simulator.metrics.totalFrames, EXTENDED_TOTAL_FRAMES, 'All 20,000 frames must execute');
  assert.ok(simulator.metrics.bombsPlaced >= 250, 'Must simulate >= 250 bomb placements');
  assert.ok(simulator.metrics.detonations >= 240, 'Must simulate >= 240 detonations');
  assert.ok(simulator.metrics.particlesEmitted >= 3000, 'Must simulate >= 3000 particle emissions');
  assert.ok(simulator.metrics.pathfindingQueries >= 3500, 'Must simulate >= 3500 pathfinding queries');

  // Performance headroom (< 0.5ms per frame)
  assert.ok(avgFrameTimeMs < 0.5, `Average frame step time must be < 0.5ms, got ${avgFrameTimeMs.toFixed(4)}ms`);

  // Zero-GC memory invariant: drift <= 0.25 MB
  if (isGcExposed) {
    assert.ok(
      heapDriftMB <= HEAP_DRIFT_THRESHOLD_MB,
      `Zero-GC Violation: 20k-frame heap drift of ${heapDriftMB.toFixed(4)} MB exceeded threshold of ${HEAP_DRIFT_THRESHOLD_MB} MB`
    );
  }
});

/* ==============================================================================
 * TEST 2: AGGRESSIVE SATURATION STRESS SOAK (20,000 FRAMES UNDER FULL POOL LOAD)
 * ============================================================================== */

test('Challenger Aggressive Stress: 20,000 Frames Under Full Pool Load Maintains Zero-GC Invariant', (t) => {
  const isGcExposed = typeof global.gc === 'function';

  class AggressiveStressSimulator extends HeadlessSoakSimulator {
    stepAggressive(deltaMs, f) {
      // Place bombs aggressively every 6 frames
      if (f % 6 === 0) {
        this.placeBomb(1 + (f % 11), 1 + (f % 13), 3, 'stress');
      }
      // Intensive pathfinding queries for 8 concurrent agents every frame
      for (let i = 0; i < 8; i++) {
        const s = (i * 19 + f) % this.totalTiles;
        const target = (i * 29 + f * 3) % this.totalTiles;
        this.pathfinder.findPath(s, target, this.pathOutBuffer);
        this.metrics.pathfindingQueries++;
      }
      super.step(deltaMs, f);
    }
  }

  const sim = new AggressiveStressSimulator();

  // Warmup 1k
  for (let f = 0; f < 1000; f++) {
    sim.stepAggressive(FRAME_DELTA_MS, f);
  }

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const baselineHeap = process.memoryUsage().heapUsed;

  const tStart = performance.now();
  for (let f = 1000; f < 20000; f++) {
    sim.stepAggressive(FRAME_DELTA_MS, f);
  }
  const durationMs = performance.now() - tStart;

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalHeap = process.memoryUsage().heapUsed;
  const driftMB = (finalHeap - baselineHeap) / (1024 * 1024);

  t.diagnostic(`Aggressive Stress 20k: Duration ${durationMs.toFixed(1)}ms, Drift ${driftMB.toFixed(4)} MB, Bombs Placed: ${sim.metrics.bombsPlaced}, Queries: ${sim.metrics.pathfindingQueries}`);

  assert.ok(sim.metrics.bombsPlaced > 3000, 'Must place > 3000 bombs under saturation');
  assert.ok(sim.metrics.particlesEmitted > 50000, 'Must emit > 50,000 particles under saturation');
  assert.ok(sim.metrics.pathfindingQueries > 150000, 'Must execute > 150,000 BFS queries');

  if (isGcExposed) {
    assert.ok(
      driftMB <= HEAP_DRIFT_THRESHOLD_MB,
      `Aggressive stress drift ${driftMB.toFixed(4)} MB exceeded limit ${HEAP_DRIFT_THRESHOLD_MB} MB`
    );
  }
});

/* ==============================================================================
 * TEST 3: PRODUCTION ObjectPool<T> 20,000-FRAME ZERO-GC COMPONENT SOAK
 * ============================================================================== */

test('Challenger Component Soak: Production ObjectPool<T> 20,000-Frame Acquire/Release Drift <= 0.10 MB', () => {
  const isGcExposed = typeof global.gc === 'function';

  const pool = new ObjectPool({
    capacity: POOL_PRESETS.PARTICLES,
    factory: (i) => ({ id: i, x: 0, y: 0, vx: 0, vy: 0, life: 0 }),
    reset: (p) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 0; },
  });

  const activeBatch = new Array(POOL_PRESETS.PARTICLES);

  // Warmup 1k
  for (let cycle = 0; cycle < 1000; cycle++) {
    const count = 10 + (cycle % 200);
    for (let i = 0; i < count; i++) {
      activeBatch[i] = pool.acquire();
    }
    for (let i = 0; i < count; i++) {
      pool.release(activeBatch[i]);
    }
  }

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const baseline = process.memoryUsage().heapUsed;

  // 20,000 continuous cycles
  for (let cycle = 0; cycle < 20000; cycle++) {
    const count = 10 + (cycle % 220);
    for (let i = 0; i < count; i++) {
      activeBatch[i] = pool.acquire();
    }
    // Release in reverse order
    for (let i = count - 1; i >= 0; i--) {
      pool.release(activeBatch[i]);
    }
  }

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalHeap = process.memoryUsage().heapUsed;
  const driftMB = (finalHeap - baseline) / (1024 * 1024);

  assert.strictEqual(pool.activeCount, 0);
  assert.strictEqual(pool.freeCount, POOL_PRESETS.PARTICLES);

  if (isGcExposed) {
    assert.ok(
      driftMB <= 0.10,
      `Production ObjectPool drift ${driftMB.toFixed(4)} MB exceeded 0.10 MB threshold`
    );
  }
});
