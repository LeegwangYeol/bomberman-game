/**
 * M1 Challenger 1: Empirical Zero-GC & Pool Stress Suite
 *
 * Exhaustive adversarial stress harness against ZeroGCPathfinder, FlatHazardMask, and ObjectPool:
 * - 100,000 randomized BFS queries with path continuity, obstacle/bomb avoidance, and generational rollover.
 * - Adversarial environments: unreachable targets, dense bomb mazes, boundary tiles, corner-to-corner.
 * - 100,000 rapid ObjectPool acquire/release cycles, pool starvation, foreign object rejection, double-release attacks.
 * - FlatHazardMask adversarial stress and duck-typing invariants.
 * - Boundary / coordinate overflow and invalid input robustness verification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  ZeroGCPathfinder,
  FlatHazardMask,
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  coordToIdx,
  idxToRow,
  idxToCol,
} from '../src/game/pathfinding.ts';
import { ObjectPool, POOL_PRESETS } from '../src/game/pooling/ObjectPool.ts';

/* ==============================================================================
 * HELPER UTILITIES FOR ADVERSARIAL GENERATION
 * ============================================================================== */

function createStandardArenaObstacles() {
  const mask = new Uint8Array(TOTAL_TILES);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        mask[r * COLS + c] = TILE_WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        mask[r * COLS + c] = TILE_WALL;
      } else {
        mask[r * COLS + c] = TILE_EMPTY;
      }
    }
  }
  return mask;
}

/* ==============================================================================
 * SUITE 1: 100,000 RANDOMIZED QUERIES ON ZeroGCPathfinder
 * ============================================================================== */

test('Challenger 1.1: ZeroGCPathfinder — 100,000 randomized queries maintain 100% path validity and survive generational rollover', () => {
  const pf = new ZeroGCPathfinder();
  const outPath = new Int16Array(TOTAL_TILES);
  const obstacleMask = createStandardArenaObstacles();
  const bombMask = new Uint8Array(TOTAL_TILES);

  // Add initial random blocks
  for (let idx = 0; idx < TOTAL_TILES; idx++) {
    if (obstacleMask[idx] === TILE_EMPTY && Math.random() < 0.2) {
      obstacleMask[idx] = TILE_BLOCK;
    }
  }

  const QUERY_COUNT = 100000;
  let pathsFound = 0;
  let zeroLengthPaths = 0;
  const t0 = performance.now();

  for (let q = 0; q < QUERY_COUNT; q++) {
    // Dynamic bomb churn every 1,000 queries
    if (q % 1000 === 0) {
      bombMask.fill(0);
      const bombCount = 5 + Math.floor(Math.random() * 10);
      for (let b = 0; b < bombCount; b++) {
        const bIdx = Math.floor(Math.random() * TOTAL_TILES);
        if (obstacleMask[bIdx] === TILE_EMPTY) {
          bombMask[bIdx] = 1;
        }
      }
    }

    const startIdx = Math.floor(Math.random() * TOTAL_TILES);
    const targetIdx = Math.floor(Math.random() * TOTAL_TILES);

    const len = pf.findPath(startIdx, targetIdx, outPath, obstacleMask, bombMask);

    assert.ok(len >= 0 && len < TOTAL_TILES, `Path length ${len} must be within [0, ${TOTAL_TILES})`);

    if (startIdx === targetIdx) {
      assert.strictEqual(len, 0, 'Path from tile to itself must have length 0');
      zeroLengthPaths++;
      continue;
    }

    if (len === 0) {
      zeroLengthPaths++;
      continue;
    }

    pathsFound++;

    // 1. First step must be orthogonally adjacent to startIdx
    const startR = idxToRow(startIdx);
    const startC = idxToCol(startIdx);
    const firstStep = outPath[0];
    const firstR = idxToRow(firstStep);
    const firstC = idxToCol(firstStep);
    const distFromStart = Math.abs(startR - firstR) + Math.abs(startC - firstC);
    assert.strictEqual(distFromStart, 1, `First step ${firstStep} must be adjacent to start ${startIdx}`);

    // 2. Validate every step in path
    for (let i = 0; i < len; i++) {
      const tile = outPath[i];
      assert.ok(tile >= 0 && tile < TOTAL_TILES, `Tile ${tile} must be within [0, ${TOTAL_TILES})`);
      assert.notStrictEqual(obstacleMask[tile], TILE_WALL, `Tile ${tile} in path must not be TILE_WALL`);
      assert.notStrictEqual(obstacleMask[tile], TILE_BLOCK, `Tile ${tile} in path must not be TILE_BLOCK`);

      if (tile !== targetIdx) {
        assert.strictEqual(bombMask[tile], 0, `Intermediate tile ${tile} in path must not be a bomb`);
      }

      // Step-to-step continuity
      if (i < len - 1) {
        const nextTile = outPath[i + 1];
        const r1 = idxToRow(tile);
        const c1 = idxToCol(tile);
        const r2 = idxToRow(nextTile);
        const c2 = idxToCol(nextTile);
        assert.strictEqual(
          Math.abs(r1 - r2) + Math.abs(c1 - c2),
          1,
          `Adjacent path steps [${tile}, ${nextTile}] must be Manhattan distance 1`
        );
      }
    }
  }

  const durationMs = performance.now() - t0;
  assert.ok(pathsFound > 0, 'Should find at least some valid paths across 100,000 queries');
  assert.ok(durationMs < 5000, `100,000 queries took ${durationMs.toFixed(1)}ms (must be < 5000ms)`);
});

/* ==============================================================================
 * SUITE 2: ZeroGCPathfinder ADVERSARIAL TOPOLOGIES
 * ============================================================================== */

test('Challenger 1.2: ZeroGCPathfinder — Unreachable targets, dense bomb mazes, boundary & corner tiles', () => {
  const pf = new ZeroGCPathfinder();
  const outPath = new Int16Array(TOTAL_TILES);
  const obstacleMask = createStandardArenaObstacles();

  // 1. Enclosed Target (Surrounded by walls)
  // Target at tile (5, 5) surrounded completely
  const targetR = 5;
  const targetC = 5;
  const targetIdx = coordToIdx(targetR, targetC);
  obstacleMask[coordToIdx(targetR - 1, targetC)] = TILE_WALL;
  obstacleMask[coordToIdx(targetR + 1, targetC)] = TILE_WALL;
  obstacleMask[coordToIdx(targetR, targetC - 1)] = TILE_WALL;
  obstacleMask[coordToIdx(targetR, targetC + 1)] = TILE_WALL;

  const startIdx = coordToIdx(1, 1);
  const lenEnclosed = pf.findPath(startIdx, targetIdx, outPath, obstacleMask, null);

  // When target is unreachable, pathfinder should either return 0 or path to closest reachable frontier
  if (lenEnclosed > 0) {
    const endTile = outPath[lenEnclosed - 1];
    const endDist = Math.abs(idxToRow(endTile) - targetR) + Math.abs(idxToCol(endTile) - targetC);
    const startDist = Math.abs(idxToRow(startIdx) - targetR) + Math.abs(idxToCol(startIdx) - targetC);
    assert.ok(endDist <= startDist, 'Fallback destination must be closer or equal distance to unreachable target');
  }

  // 2. Dense Bomb Maze: Every second tile in walkable corridors blocked by bombs
  const bombMaze = new Uint8Array(TOTAL_TILES);
  for (let idx = 0; idx < TOTAL_TILES; idx++) {
    if (obstacleMask[idx] === TILE_EMPTY && idx % 2 === 0) {
      bombMaze[idx] = 1;
    }
  }

  for (let iter = 0; iter < 1000; iter++) {
    const s = coordToIdx(1, 1);
    const t = coordToIdx(ROWS - 2, COLS - 2);
    const lenMaze = pf.findPath(s, t, outPath, obstacleMask, bombMaze);
    assert.ok(lenMaze >= 0, 'Dense bomb maze must not crash or return negative length');
  }

  // 3. Boundary & Extreme Corner Tiles
  const corners = [
    coordToIdx(1, 1),
    coordToIdx(1, COLS - 2),
    coordToIdx(ROWS - 2, 1),
    coordToIdx(ROWS - 2, COLS - 2),
  ];

  for (const c1 of corners) {
    for (const c2 of corners) {
      const lenCorner = pf.findPath(c1, c2, outPath, obstacleMask, null);
      if (c1 === c2) {
        assert.strictEqual(lenCorner, 0);
      } else {
        assert.ok(lenCorner > 0, `Path between corners ${c1} and ${c2} must exist`);
        assert.strictEqual(outPath[lenCorner - 1], c2, 'Path must terminate at target corner');
      }
    }
  }
});

/* ==============================================================================
 * SUITE 3: ObjectPool<T> 100,000 RAPID ACQUIRE/RELEASE CYCLES & STARVATION
 * ============================================================================== */

test('Challenger 1.3: ObjectPool<T> — 100,000 rapid cycles, starvation attack, and invariant integrity', () => {
  const CAPACITY = 32;
  let resetInvocations = 0;
  let acquireInvocations = 0;

  const pool = new ObjectPool({
    capacity: CAPACITY,
    factory: (index) => ({ id: index, data: `item-${index}`, generation: 0 }),
    reset: (item) => {
      resetInvocations++;
      item.generation++;
    },
    onAcquire: (item) => {
      acquireInvocations++;
    },
  });

  const activeSet = new Set();
  const CYCLES = 100000;
  const t0 = performance.now();

  for (let c = 0; c < CYCLES; c++) {
    const action = Math.random();

    if (action < 0.45) {
      // Acquire
      const item = pool.acquire();
      if (item) {
        assert.ok(!activeSet.has(item), 'Acquired item must not already be in active set');
        activeSet.add(item);
        assert.strictEqual(pool.isActive(item), true);
      } else {
        // Pool exhausted
        assert.strictEqual(pool.isExhausted, true);
        assert.strictEqual(activeSet.size, CAPACITY);
      }
    } else if (action < 0.85) {
      // Release random active item
      if (activeSet.size > 0) {
        const items = Array.from(activeSet);
        const victim = items[Math.floor(Math.random() * items.length)];
        activeSet.delete(victim);
        const success = pool.release(victim);
        assert.strictEqual(success, true, 'Releasing active item must return true');
        assert.strictEqual(pool.isActive(victim), false);
      }
    } else if (action < 0.95) {
      // Starvation stress: if pool exhausted or almost exhausted, attempt 10 rapid acquires
      if (pool.isExhausted) {
        for (let s = 0; s < 10; s++) {
          const starved = pool.acquire();
          assert.strictEqual(starved, null, 'Acquire on exhausted pool must return null');
        }
      }
    } else {
      // Periodic complete reset
      if (Math.random() < 0.05) {
        pool.reset();
        activeSet.clear();
        assert.strictEqual(pool.activeCount, 0);
        assert.strictEqual(pool.freeCount, CAPACITY);
        assert.strictEqual(pool.isExhausted, false);
      }
    }

    // Strict invariant check
    assert.strictEqual(pool.activeCount + pool.freeCount, CAPACITY, 'Active + Free must equal Capacity');
    assert.strictEqual(pool.activeCount, activeSet.size, 'activeCount must match tracked active set size');
    assert.strictEqual(pool.isExhausted, pool.freeCount === 0, 'isExhausted must match freeCount === 0');
  }

  // Final verification: 10,000 consecutive starvation calls
  while (!pool.isExhausted) {
    const it = pool.acquire();
    if (it) activeSet.add(it);
  }
  assert.strictEqual(pool.activeCount, CAPACITY);
  for (let i = 0; i < 10000; i++) {
    assert.strictEqual(pool.acquire(), null, 'Exhausted pool must return null without exception');
  }

  const durationMs = performance.now() - t0;
  assert.ok(durationMs < 3000, `100,000 cycles completed in ${durationMs.toFixed(1)}ms`);
});

/* ==============================================================================
 * SUITE 4: ObjectPool<T> DOUBLE-RELEASE & FOREIGN OBJECT ATTACKS
 * ============================================================================== */

test('Challenger 1.4: ObjectPool<T> — Double-release attacks, foreign object rejection, and flapping', () => {
  const pool = new ObjectPool({
    capacity: 16,
    factory: (i) => ({ index: i }),
  });

  // 1. Single acquire followed by 50,000 consecutive double-release attempts
  const item = pool.acquire();
  assert.ok(item !== null);
  assert.strictEqual(pool.activeCount, 1);
  assert.strictEqual(pool.freeCount, 15);

  const firstRelease = pool.release(item);
  assert.strictEqual(firstRelease, true, 'First release must succeed');
  assert.strictEqual(pool.activeCount, 0);
  assert.strictEqual(pool.freeCount, 16);

  for (let r = 0; r < 50000; r++) {
    const duplicateRelease = pool.release(item);
    assert.strictEqual(duplicateRelease, false, 'Subsequent release of already released item must return false');
    assert.strictEqual(pool.freeCount, 16, 'freeCount must never exceed capacity (16)');
    assert.strictEqual(pool.activeCount, 0, 'activeCount must remain 0');
  }

  // 2. Rapid acquire-release flapping (10,000 times on single item)
  for (let f = 0; f < 10000; f++) {
    const obj = pool.acquire();
    assert.ok(obj !== null);
    assert.strictEqual(pool.release(obj), true);
    assert.strictEqual(pool.release(obj), false); // Double release
  }

  // 3. Foreign Object Attacks: Reject objects not owned by this pool
  const alienPool = new ObjectPool({
    capacity: 4,
    factory: (i) => ({ index: i }),
  });
  const alienItem = alienPool.acquire();

  const foreignAttacks = [
    alienItem,
    { index: 0 },
    { id: 999 },
    {},
    null,
    undefined,
    0,
    16,
    'string_token',
    NaN,
    true,
    Symbol('exploit'),
    [1, 2, 3],
  ];

  for (const attack of foreignAttacks) {
    const rejected = pool.release(attack);
    assert.strictEqual(rejected, false, `Foreign object ${String(attack)} must be rejected with false`);
    assert.strictEqual(pool.activeCount, 0, 'activeCount must remain uncorrupted');
    assert.strictEqual(pool.freeCount, 16, 'freeCount must remain uncorrupted');
  }
});

/* ==============================================================================
 * SUITE 5: FlatHazardMask ADVERSARIAL STRESS & DUCK-TYPING
 * ============================================================================== */

test('Challenger 1.5: FlatHazardMask — 10,000 adversarial operations, coordinate overflows, and duck-typing', () => {
  const mask = new FlatHazardMask(TOTAL_TILES);

  // 1. Out-of-bounds coordinate operations must be safely ignored without crash
  mask.setCoord(-1, 0, 1);
  mask.setCoord(13, 0, 1);
  mask.setCoord(0, -1, 1);
  mask.setCoord(0, 15, 1);
  mask.setCoord(999, 999, 1);
  assert.strictEqual(mask.size, 0, 'Out-of-bounds setCoord must not mutate mask or increment size');

  assert.strictEqual(mask.getCoord(-1, 0), 0);
  assert.strictEqual(mask.getCoord(13, 0), 0);
  assert.strictEqual(mask.isHazard(-1, -1), false);
  assert.strictEqual(mask.isHazard(99, 99), false);

  // 2. Set<string> duck-typing with malformed keys
  const malformedKeys = [
    'invalid',
    '-1,5',
    '13,0',
    '0,15',
    'NaN,NaN',
    '',
    ',',
    '5',
    '99999,99999',
    -1,
    195,
    NaN,
  ];

  for (const key of malformedKeys) {
    assert.strictEqual(mask.has(key), false, `mask.has(${String(key)}) must return false for invalid keys`);
    mask.add(key);
    assert.strictEqual(mask.size, 0, `mask.size must remain 0 after adding invalid key ${String(key)}`);
    assert.strictEqual(mask.delete(key), false, `mask.delete(${String(key)}) must return false for invalid keys`);
  }

  // 3. 10,000 Rapid random setCoord / delete / iterator operations
  const shadowSet = new Set();
  for (let op = 0; op < 10000; op++) {
    const r = Math.floor(Math.random() * (ROWS + 4)) - 2; // [-2, ROWS+1]
    const c = Math.floor(Math.random() * (COLS + 4)) - 2; // [-2, COLS+1]
    const val = Math.random() < 0.5 ? 1 : 0;

    mask.setCoord(r, c, val);

    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const key = `${r},${c}`;
      if (val !== 0) shadowSet.add(key);
      else shadowSet.delete(key);
    }

    if (op % 500 === 0) {
      assert.strictEqual(mask.size, shadowSet.size, 'mask.size must match shadow set size');
      for (const k of shadowSet) {
        assert.strictEqual(mask.has(k), true, `mask must contain active hazard ${k}`);
      }
    }
  }

  // 4. Iterator verification
  let iteratedCount = 0;
  for (const key of mask) {
    assert.ok(shadowSet.has(key), `Iterated key ${key} must exist in shadow set`);
    iteratedCount++;
  }
  assert.strictEqual(iteratedCount, shadowSet.size, 'Iterator count must equal shadow set count');
});

/* ==============================================================================
 * SUITE 6: ZeroGCPathfinder COORDINATE OVERFLOW & OFF-GRID BOUNDS REJECTION
 * ============================================================================== */

test('Challenger 1.6: ZeroGCPathfinder — Coordinate overflow bounds rejection on startIdx and targetIdx', () => {
  const pf = new ZeroGCPathfinder();
  const outPath = new Int16Array(TOTAL_TILES);

  // Negative startIdx must return 0
  const lenNeg = pf.findPath(-1, 17, outPath);
  assert.strictEqual(lenNeg, 0, `findPath(-1, 17) must return 0 for negative startIdx, got ${lenNeg}`);

  // StartIdx >= totalTiles must return 0
  const lenOverflow = pf.findPath(TOTAL_TILES, 17, outPath);
  assert.strictEqual(
    lenOverflow,
    0,
    `findPath(${TOTAL_TILES}, 17) must return 0 for out-of-bounds startIdx, got ${lenOverflow}`
  );

  // Negative targetIdx must return 0
  const lenTargetNeg = pf.findPath(16, -1, outPath);
  assert.strictEqual(lenTargetNeg, 0, `findPath(16, -1) must return 0 for negative targetIdx, got ${lenTargetNeg}`);

  // TargetIdx >= totalTiles must return 0
  const lenTargetOverflow = pf.findPath(16, TOTAL_TILES + 50, outPath);
  assert.strictEqual(
    lenTargetOverflow,
    0,
    `findPath(16, ${TOTAL_TILES + 50}) must return 0 for out-of-bounds targetIdx, got ${lenTargetOverflow}`
  );
});

/* ==============================================================================
 * SUITE 7: ZeroGCPathfinder NON-INTEGER & NaN INFINITE LOOP PREVENTION
 * ============================================================================== */

test('Challenger 1.7: ZeroGCPathfinder — Non-integer and NaN infinite loop hang prevention', () => {
  // Child process check for findPath(NaN, 17)
  const childNaN = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '-e',
      `import { ZeroGCPathfinder } from './src/game/pathfinding.ts';
       const pf = new ZeroGCPathfinder();
       const out = new Int16Array(195);
       pf.findPath(NaN, 17, out);`,
    ],
    { timeout: 400 }
  );

  const timedOutNaN = Boolean(childNaN.error && childNaN.error.code === 'ETIMEDOUT');
  assert.strictEqual(
    timedOutNaN,
    false,
    'findPath(NaN, 17) must not enter an infinite loop (process timed out after 400ms)'
  );

  // Child process check for findSafeTile(NaN, ...)
  const childSafeNaN = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '-e',
      `import { ZeroGCPathfinder } from './src/game/pathfinding.ts';
       const pf = new ZeroGCPathfinder();
       const out = new Int16Array(195);
       const danger = new Uint8Array(195);
       danger[1] = 1;
       pf.findSafeTile(NaN, danger, pf.obstacleMask, null, 4, out);`,
    ],
    { timeout: 400 }
  );

  const timedOutSafeNaN = Boolean(childSafeNaN.error && childSafeNaN.error.code === 'ETIMEDOUT');
  assert.strictEqual(
    timedOutSafeNaN,
    false,
    'findSafeTile(NaN, ...) must not enter an infinite loop (process timed out after 400ms)'
  );
});
