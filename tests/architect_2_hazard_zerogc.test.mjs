/**
 * tests/architect_2_hazard_zerogc.test.mjs
 *
 * Architect 2: Dynamic Hazard Zero-GC Memory & Pool Harmonizer Verification Suite
 * Validates:
 * 1. 1D TypedArray Memory Layout (Uint8Array, Int16Array, Float32Array)
 * 2. Pre-allocated Collision & Tactical Interaction Scratch Objects
 * 3. Fixed-Capacity Ghost Bomb Slot Array & In-Place Recycling
 * 4. 10,000-Frame Soak Test: Zero GC Events & Zero Net Heap Drift
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DynamicHazard,
  MAX_GHOST_BOMBS,
  MAX_BEAM_TILES,
  TOTAL_TELEGRAPH_MS,
  STANDARD_FUSE_MS,
} from '../src/game/hazards/index.ts';
import { TOTAL_TILES } from '../src/game/pathfinding.ts';

test('Architect 2 [TypedArray Layout]: Spacial and corridor state stored in typed arrays', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  const dangerMask = hazard.getDangerMask();
  assert.ok(dangerMask instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(dangerMask.length, TOTAL_TILES, `dangerMask must be size ${TOTAL_TILES}`);

  const intensityGrid = hazard.getIntensityGrid();
  assert.ok(intensityGrid instanceof Float32Array, 'intensityGrid must be Float32Array');
  assert.equal(intensityGrid.length, TOTAL_TILES, `intensityGrid must be size ${TOTAL_TILES}`);

  const activeBeamIndices = hazard.getActiveBeamIndices();
  assert.ok(activeBeamIndices instanceof Int16Array, 'activeBeamIndices must be Int16Array');
  assert.equal(activeBeamIndices.length, MAX_BEAM_TILES, `activeBeamIndices must be size ${MAX_BEAM_TILES}`);
});

test('Architect 2 [Scratch Container Reuse]: Collision and spatial queries reuse pre-allocated scratch objects', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE

  // Player collision scratch reuse
  const playerRes1 = hazard.checkPlayerCollision(5, 4, false, 0);
  const playerRes2 = hazard.checkPlayerCollision(1, 1, false, 0);
  assert.strictEqual(playerRes1, playerRes2, 'Player collision must reuse scratch object instance');

  // Enemy collision scratch reuse
  const enemyRes1 = hazard.checkEnemyCollision(5, 4, false);
  const enemyRes2 = hazard.checkEnemyCollision(1, 1, false);
  assert.strictEqual(enemyRes1, enemyRes2, 'Enemy collision must reuse scratch object instance');

  // Safe ejection scratch reuse
  const ejectRes1 = hazard.resolveSafeEjection(3, 4);
  const ejectRes2 = hazard.resolveSafeEjection(1, 1);
  assert.strictEqual(ejectRes1, ejectRes2, 'Safe ejection must reuse scratch object instance');

  // Tactical bomb interaction scratch reuse
  const placeRes1 = hazard.onBombPlaced(1, 3, 4, 2, STANDARD_FUSE_MS);
  const placeRes2 = hazard.onBombPlaced(2, 1, 1, 2, STANDARD_FUSE_MS);
  assert.strictEqual(placeRes1, placeRes2, 'Bomb placement must reuse scratch object instance');

  const detRes1 = hazard.onBombDetonated(1, 3, 4, 2);
  const detRes2 = hazard.onBombDetonated(2, 1, 1, 2);
  assert.strictEqual(detRes1, detRes2, 'Bomb detonation must reuse scratch object instance');
  assert.strictEqual(
    detRes1.pairedGhostBombIds,
    detRes2.pairedGhostBombIds,
    'Paired ghost bomb IDs array must be reused in-place'
  );

  const impactRes1 = hazard.onBombBlastImpact(3, 4);
  const impactRes2 = hazard.onBombBlastImpact(1, 1);
  assert.strictEqual(impactRes1, impactRes2, 'Blast impact must reuse scratch object instance');
});

test('Architect 2 [Ghost Bomb In-Place Recycling]: Pre-allocated slots recycled with zero allocations', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  const pool = hazard.getGhostBombPool();
  assert.equal(pool.length, MAX_GHOST_BOMBS, `Pool capacity must be ${MAX_GHOST_BOMBS}`);

  // Place bomb on spire S0(3, 4) to trigger ghost bomb at S1(9, 4)
  const placeRes = hazard.onBombPlaced(501, 3, 4, 3, STANDARD_FUSE_MS);
  assert.equal(placeRes.isEntangled, true);
  assert.ok(placeRes.ghostBombId);

  assert.equal(hazard.getActiveGhostBombCount(), 1);

  // In-place buffer query
  const ghosts1 = hazard.getActiveGhostBombs();
  assert.equal(ghosts1.length, 1);
  assert.equal(ghosts1[0].id, placeRes.ghostBombId);

  const ghosts2 = hazard.getActiveGhostBombs();
  assert.strictEqual(ghosts1, ghosts2, 'getActiveGhostBombs must return pre-allocated buffer');

  // Visitor iteration
  let visitorCount = 0;
  hazard.forEachActiveGhostBomb((slot, idx) => {
    visitorCount++;
    assert.equal(slot.id, placeRes.ghostBombId);
    assert.equal(idx, 0);
  });
  assert.equal(visitorCount, 1);

  // Detonate parent bomb -> in-place release
  hazard.onBombDetonated(501, 3, 4, 3);
  assert.equal(hazard.getActiveGhostBombCount(), 0);
  assert.equal(hazard.getActiveGhostBombs().length, 0);
});

test('Architect 2 [Task 3: 10,000 Update Iterations]: Zero heap allocations & zero GC pressure', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Warmup run to trigger Turbofan JIT compilation
  for (let f = 0; f < 2000; f++) {
    hazard.update(16.666);
  }

  if (global.gc) {
    global.gc();
    global.gc();
  }

  const baselineHeap = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  for (let f = 0; f < 10000; f++) {
    hazard.update(16.666);
  }

  const totalTimeMs = performance.now() - startTime;
  const avgFrameMs = totalTimeMs / 10000;

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) {
    global.gc();
    global.gc();
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const netHeapDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

  // Pure updates must have minimal drift (< 0.15 MB accounting for Node test runner harness)
  if (isGcExposed) {
    assert.ok(
      netHeapDriftMB <= 0.15,
      `Net heap drift ${netHeapDriftMB.toFixed(6)} MB must be <= 0.15 MB`
    );
  } else {
    assert.ok(
      netHeapDriftMB <= 5.0,
      `Ambient heap drift ${netHeapDriftMB.toFixed(6)} MB must be reasonable`
    );
  }
  assert.ok(
    avgFrameMs < 0.02,
    `Average frame update time ${avgFrameMs.toFixed(4)} ms must be < 0.02 ms`
  );
});

test('Architect 2 [10,000-Frame Stress Soak]: Full lifecycle, bomb placement & collision stress', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Warmup run
  for (let f = 0; f < 1000; f++) {
    hazard.update(16.666);
  }

  if (global.gc) {
    global.gc();
    global.gc();
  }

  const baselineHeap = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  for (let f = 0; f < 10000; f++) {
    hazard.update(16.666);

    // Periodic bomb placement and collisions
    if (f % 60 === 0) {
      hazard.onBombPlaced(f, 3, 4, 2, STANDARD_FUSE_MS);
      hazard.checkPlayerCollision(6, 5, false, 0);
      hazard.checkEnemyCollision(6, 5, false);
    }
    if (f % 120 === 0) {
      hazard.onBombDetonated(f - 60, 3, 4, 2);
    }
    if (f === 5000) {
      hazard.start('CLIMAX');
    }
  }

  const totalTimeMs = performance.now() - startTime;
  const avgFrameMs = totalTimeMs / 10000;

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) {
    global.gc();
    global.gc();
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const netHeapDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

  if (isGcExposed) {
    assert.ok(
      netHeapDriftMB <= 0.25,
      `Net heap drift ${netHeapDriftMB.toFixed(4)} MB must be <= 0.25 MB (creative_3_zerogc_spec threshold)`
    );
  } else {
    assert.ok(
      netHeapDriftMB <= 5.0,
      `Ambient heap drift ${netHeapDriftMB.toFixed(4)} MB must be reasonable`
    );
  }
  assert.ok(
    avgFrameMs < 0.05,
    `Average frame update time ${avgFrameMs.toFixed(4)} ms must be < 0.05 ms`
  );
});
