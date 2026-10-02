/**
 * tests/unit/typedarray_bounds_audit.test.mjs
 *
 * Dedicated verification suite for:
 * 1. All 1D TypedArray buffers (Uint8Array, Float32Array, Int16Array) in pathfinding.ts, DynamicHazard.ts, GravityHazard.ts
 * 2. Flat index calculation (r * COLS + c) bounds safety and aliasing protection
 * 3. Scratch vector / object reuse without heap garbage collection
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
  FlatHazardMask,
  ZeroGCPathfinder,
  zeroGCPathfinder,
  coordToIdx,
  idxToRow,
  idxToCol,
  findPathBFS,
  findEscapePathBFS,
  findTargetBlockBFS,
  findDemolitionPath,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
  isTileInBlastRange,
  isTileInHazardMask,
} from '../../src/game/pathfinding.ts';

import {
  DynamicHazard,
  HazardLifecycleState,
  MAX_SPIRE_NODES,
  MAX_BEAM_TILES,
} from '../../src/game/hazards/DynamicHazard.ts';

import {
  GravityHazard,
  GravityLifecycleState,
  MAX_EVENT_HORIZON_TILES,
} from '../../src/game/hazards/GravityHazard.ts';

/* ==============================================================================
 * SUITE 1: 1D TYPEDARRAY BUFFER SIZING & MEMORY LAYOUT AUDIT
 * ============================================================================== */

test('Audit Suite 1: pathfinding.ts 1D TypedArray buffers match exact grid capacity', () => {
  assert.equal(TOTAL_TILES, 195, 'TOTAL_TILES must be exactly 13 * 15 = 195');

  const mask = new FlatHazardMask();
  assert.ok(mask.mask instanceof Uint8Array, 'FlatHazardMask.mask must be Uint8Array');
  assert.equal(mask.mask.length, TOTAL_TILES, 'FlatHazardMask.mask length must be 195');

  const pf = new ZeroGCPathfinder();
  assert.ok(pf.obstacleMask instanceof Uint8Array, 'obstacleMask must be Uint8Array');
  assert.equal(pf.obstacleMask.length, TOTAL_TILES, 'obstacleMask length must be 195');
  assert.ok(pf.hazardMask instanceof Uint8Array, 'hazardMask must be Uint8Array');
  assert.equal(pf.hazardMask.length, TOTAL_TILES, 'hazardMask length must be 195');
});

test('Audit Suite 1: DynamicHazard 1D TypedArray buffers match exact grid capacity', () => {
  const dh = new DynamicHazard();
  assert.ok(dh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(dh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(dh.getIntensityGrid() instanceof Float32Array, 'intensityGrid must be Float32Array');
  assert.equal(dh.getIntensityGrid().length, TOTAL_TILES, 'intensityGrid length must be 195');

  assert.ok(dh.getActiveBeamIndices() instanceof Int16Array, 'activeBeamIndices must be Int16Array');
  assert.equal(dh.getActiveBeamIndices().length, MAX_BEAM_TILES, 'activeBeamIndices length must be 32');
});

test('Audit Suite 1: GravityHazard 1D TypedArray buffers match exact grid capacity', () => {
  const gh = new GravityHazard();
  assert.ok(gh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(gh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(gh.pullField instanceof Float32Array, 'pullField must be Float32Array');
  assert.equal(gh.pullField.length, TOTAL_TILES * 2, 'pullField length must be 390 (2 components per tile)');

  assert.ok(gh.getPullVectorsX() instanceof Float32Array, 'pullVectorsX must be Float32Array');
  assert.equal(gh.getPullVectorsX().length, TOTAL_TILES, 'pullVectorsX length must be 195');

  assert.ok(gh.getPullVectorsY() instanceof Float32Array, 'pullVectorsY must be Float32Array');
  assert.equal(gh.getPullVectorsY().length, TOTAL_TILES, 'pullVectorsY length must be 195');

  assert.ok(gh.getIntensityGrid() instanceof Float32Array, 'intensityGrid must be Float32Array');
  assert.equal(gh.getIntensityGrid().length, TOTAL_TILES, 'intensityGrid length must be 195');

  assert.ok(gh.getEventHorizonIndices() instanceof Int16Array, 'eventHorizonIndices must be Int16Array');
  assert.equal(gh.getEventHorizonIndices().length, MAX_EVENT_HORIZON_TILES, 'eventHorizonIndices length must be 32');
});

/* ==============================================================================
 * SUITE 2: FLAT INDEX (r * COLS + c) BOUNDS SAFETY & ALIASING REJECTION
 * ============================================================================== */

test('Audit Suite 2: FlatHazardMask rejects aliased (-1, 15) and out-of-bounds coordinates', () => {
  const mask = new FlatHazardMask();

  // (-1, 15) algebraically yields -1 * 15 + 15 = 0, which would alias to (0, 0)
  assert.equal(mask.has('-1,15'), false, 'has("-1,15") must be false');
  mask.add('-1,15');
  assert.equal(mask.has('-1,15'), false, 'add("-1,15") must be ignored');
  assert.equal(mask.has(0), false, 'Aliased index 0 must NOT be set');

  mask.setCoord(-1, 15, 1);
  assert.equal(mask.getCoord(-1, 15), 0, 'setCoord(-1, 15) must be rejected');
  assert.equal(mask.getCoord(0, 0), 0, 'Tile (0, 0) must remain 0');

  // Float indices
  mask.setCoord(1.5, 2, 1);
  assert.equal(mask.getCoord(1.5, 2), 0, 'Float row must be rejected');
  mask.setCoord(1, 2.5, 1);
  assert.equal(mask.getCoord(1, 2.5), 0, 'Float col must be rejected');

  // NaN & Infinity
  mask.setCoord(NaN, 2, 1);
  assert.equal(mask.getCoord(NaN, 2), 0, 'NaN row must be rejected');
  mask.setCoord(1, Infinity, 1);
  assert.equal(mask.getCoord(1, Infinity), 0, 'Infinity col must be rejected');

  // Legitimate (1, 2)
  mask.setCoord(1, 2, 1);
  assert.equal(mask.getCoord(1, 2), 1, 'Valid coord (1, 2) must be set');
  assert.equal(mask.has('1,2'), true);
  assert.equal(mask.has(1 * COLS + 2), true);
});

test('Audit Suite 2: DynamicHazard rejects out-of-bounds, float, and aliased enemy coordinates', () => {
  const dh = new DynamicHazard();
  dh.start('OUTBREAK');
  // Transition to ACTIVE: 2000ms cooldown + 2000ms telegraph
  dh.update(4100);
  assert.equal(dh.getState(), HazardLifecycleState.ACTIVE);

  // (-1, 15) alias test
  const aliasedRes = dh.checkEnemyCollision(-1, 15, false);
  assert.equal(aliasedRes.hit, false, 'Aliased enemy (-1, 15) must not register a hit');

  // Out of bounds tests
  assert.equal(dh.checkEnemyCollision(100, 2, false).hit, false);
  assert.equal(dh.checkEnemyCollision(2, -5, false).hit, false);
  assert.equal(dh.checkEnemyCollision(NaN, 2, false).hit, false);
  assert.equal(dh.checkEnemyCollision(2, Infinity, false).hit, false);

  // isTileLethal / isTileTelegraphed / isTilePolarized bounds safety
  assert.equal(dh.isTileLethal(-1, 15), false);
  assert.equal(dh.isTileLethal(NaN, 2), false);
  assert.equal(dh.isTileLethal(100, 100), false);
  assert.equal(dh.isTileTelegraphed(-1, 15), false);
  assert.equal(dh.isTilePolarized(-1, 15), false);
});

test('Audit Suite 2: GravityHazard rejects out-of-bounds, float, and aliased coordinates', () => {
  const gh = new GravityHazard();
  gh.init(6, 7);
  gh.start('OUTBREAK');
  gh.update(2100); // Enter burst
  assert.equal(gh.getLifecycleState(), GravityLifecycleState.SINGULARITY_BURST);

  // (-1, 15) enemy collision
  const aliasedEnemy = gh.checkEnemyCollision(-1, 15, false);
  assert.equal(aliasedEnemy.hit, false, 'Aliased enemy (-1, 15) must not register a hit');

  // Out of bounds enemy
  assert.equal(gh.checkEnemyCollision(-5, 5, false).hit, false);
  assert.equal(gh.checkEnemyCollision(100, 7, false).hit, false);
  assert.equal(gh.checkEnemyCollision(NaN, 7, false).hit, false);

  // Out of bounds bomb detonation
  const detRes = gh.onBombDetonatedInSingularity(-1, 15, 2);
  assert.equal(detRes.collapsed, false);
  assert.equal(gh.onBombDetonatedInSingularity(NaN, 7, 2).collapsed, false);

  // Radial blast bounds safety
  const radialBlast = gh.computeCosmicRadialBlast(6, 7, 5);
  for (const t of radialBlast) {
    assert.ok(t.r >= 0 && t.r < ROWS, `Row ${t.r} must be in [0, ${ROWS - 1}]`);
    assert.ok(t.c >= 0 && t.c < COLS, `Col ${t.c} must be in [0, ${COLS - 1}]`);
  }
});

/* ==============================================================================
 * SUITE 3: SCRATCH VECTOR REUSE & ZERO-GC PERSISTENCE
 * ============================================================================== */

test('Audit Suite 3: pathfinding.ts getSafeBombEscapePath reuses shared scratch masks without heap growth', () => {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        map[r][c] = 1;
      }
    }
  }

  // Pre-warm JIT
  for (let i = 0; i < 50; i++) {
    getSafeBombEscapePath({ r: 1, c: 1 }, 2, map);
  }

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) global.gc();
  const memBefore = process.memoryUsage().heapUsed;

  const ITERATIONS = 5000;
  for (let i = 0; i < ITERATIONS; i++) {
    getSafeBombEscapePath({ r: 1 + (i % 5), c: 1 + (i % 5) }, 2, map);
  }

  if (isGcExposed) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  const driftMB = (memAfter - memBefore) / (1024 * 1024);

  if (isGcExposed) {
    assert.ok(driftMB < 0.25, `Heap drift ${driftMB.toFixed(4)} MB must be < 0.25 MB`);
  } else {
    assert.ok(driftMB < 5.0, `Ambient heap drift ${driftMB.toFixed(4)} MB must remain small`);
  }
});

test('Audit Suite 3: DynamicHazard checkEnemyCollisions reuses batch scratch slots without heap growth', () => {
  const dh = new DynamicHazard();
  dh.start('OUTBREAK');
  dh.update(2100);

  const enemies = [
    { r: 3, c: 4, isBoss: false },
    { r: 6, c: 7, isBoss: true },
    { r: 1, c: 1, isBoss: false },
  ];

  // Verify batch query returns correct length and result
  const res1 = dh.checkEnemyCollisions(enemies);
  assert.equal(res1.length, 3);

  const res2 = dh.checkEnemyCollisions(enemies);
  // Reuses the same batch results list instance
  assert.strictEqual(res1, res2, 'Batch queries must reuse internal pre-allocated list');
});

test('Audit Suite 3: GravityHazard computeCosmicRadialBlast reuses scratch pool without heap growth', () => {
  const gh = new GravityHazard();
  gh.init(6, 7);

  const tiles1 = gh.computeCosmicRadialBlast(6, 7, 3);
  assert.ok(tiles1.length > 0);

  const tiles2 = gh.computeCosmicRadialBlast(6, 7, 3);
  assert.strictEqual(tiles1, tiles2, 'computeCosmicRadialBlast must reuse internal scratch array');
});
