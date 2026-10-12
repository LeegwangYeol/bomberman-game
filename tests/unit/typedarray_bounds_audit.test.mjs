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

import {
  FrostHazard,
  FrostLifecycleState,
  MAX_FROST_TILES,
} from '../../src/game/hazards/FrostHazard.ts';

import {
  VoltHazard,
  VoltLifecycleState,
  MAX_VOLT_TILES,
} from '../../src/game/hazards/VoltHazard.ts';

import {
  MagmaHazard,
  MagmaLifecycleState,
  MAX_MAGMA_TILES,
} from '../../src/game/hazards/MagmaHazard.ts';

import {
  MiasmaHazard,
  MiasmaLifecycleState,
  MAX_MIASMA_TILES,
} from '../../src/game/hazards/MiasmaHazard.ts';

import {
  ChronoHazard,
  ChronoLifecycleState,
  MAX_CHRONO_TILES,
} from '../../src/game/hazards/ChronoHazard.ts';

import {
  SolarHazard,
  SolarLifecycleState,
  MAX_SOLAR_TILES,
} from '../../src/game/hazards/SolarHazard.ts';

import {
  NebulaHazard,
  NebulaLifecycleState,
  MAX_NEBULA_TILES,
} from '../../src/game/hazards/NebulaHazard.ts';

import {
  AbyssalHazard,
  MAX_ABYSSAL_TILES,
} from '../../src/game/hazards/AbyssalHazard.ts';

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

test('Audit Suite 1: FrostHazard 1D TypedArray buffers match exact grid capacity', () => {
  const fh = new FrostHazard();
  assert.ok(fh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(fh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(fh.frictionGrid instanceof Float32Array, 'frictionGrid must be Float32Array');
  assert.equal(fh.frictionGrid.length, TOTAL_TILES, 'frictionGrid length must be 195');

  assert.ok(fh.temperatureGrid instanceof Float32Array, 'temperatureGrid must be Float32Array');
  assert.equal(fh.temperatureGrid.length, TOTAL_TILES, 'temperatureGrid length must be 195');

  assert.ok(fh.intensityGrid instanceof Float32Array, 'intensityGrid must be Float32Array');
  assert.equal(fh.intensityGrid.length, TOTAL_TILES, 'intensityGrid length must be 195');

  assert.ok(fh.getCryoShockwaveMask() instanceof Uint8Array, 'cryoShockwaveMask must be Uint8Array');
  assert.equal(fh.getCryoShockwaveMask().length, TOTAL_TILES, 'cryoShockwaveMask length must be 195');

  assert.ok(fh.getActiveFrostIndices() instanceof Int16Array, 'activeFrostIndices must be Int16Array');
  assert.equal(fh.getActiveFrostIndices().length, MAX_FROST_TILES, 'activeFrostIndices length must be 32');
});

test('Audit Suite 1: VoltHazard 1D TypedArray buffers match exact grid capacity', () => {
  const vh = new VoltHazard();
  assert.ok(vh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(vh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(vh.voltageGrid instanceof Float32Array, 'voltageGrid must be Float32Array');
  assert.equal(vh.voltageGrid.length, TOTAL_TILES, 'voltageGrid length must be 195');

  assert.ok(vh.intensityGrid instanceof Float32Array, 'intensityGrid must be Float32Array');
  assert.equal(vh.intensityGrid.length, TOTAL_TILES, 'intensityGrid length must be 195');

  assert.ok(vh.conductanceGrid instanceof Float32Array, 'conductanceGrid must be Float32Array');
  assert.equal(vh.conductanceGrid.length, TOTAL_TILES, 'conductanceGrid length must be 195');

  assert.ok(vh.propagationBuffer instanceof Float32Array, 'propagationBuffer must be Float32Array');
  assert.equal(vh.propagationBuffer.length, TOTAL_TILES, 'propagationBuffer length must be 195');

  assert.ok(vh.getActiveVoltIndices() instanceof Int16Array, 'activeVoltIndices must be Int16Array');
  assert.equal(vh.getActiveVoltIndices().length, MAX_VOLT_TILES, 'activeVoltIndices length must be 32');
});

test('Audit Suite 1: MagmaHazard 1D TypedArray buffers match exact grid capacity', () => {
  const mh = new MagmaHazard();
  assert.ok(mh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(mh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(mh.heatGrid instanceof Float32Array, 'heatGrid must be Float32Array');
  assert.equal(mh.heatGrid.length, TOTAL_TILES, 'heatGrid length must be 195');

  assert.ok(mh.intensityGrid instanceof Float32Array, 'intensityGrid must be Float32Array');
  assert.equal(mh.intensityGrid.length, TOTAL_TILES, 'intensityGrid length must be 195');

  assert.ok(mh.obsidianTimerGrid instanceof Float32Array, 'obsidianTimerGrid must be Float32Array');
  assert.equal(mh.obsidianTimerGrid.length, TOTAL_TILES, 'obsidianTimerGrid length must be 195');

  assert.ok(mh.getActiveMagmaIndices() instanceof Int16Array, 'activeMagmaIndices must be Int16Array');
  assert.equal(mh.getActiveMagmaIndices().length, MAX_MAGMA_TILES, 'activeMagmaIndices length must be 32');
});

test('Audit Suite 1: MiasmaHazard 1D TypedArray buffers match exact grid capacity', () => {
  const msh = new MiasmaHazard();
  assert.ok(msh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(msh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(msh.getSporeGrid() instanceof Float32Array, 'sporeGrid must be Float32Array');
  assert.equal(msh.getSporeGrid().length, TOTAL_TILES, 'sporeGrid length must be 195');

  assert.ok(msh.getIntensityGrid() instanceof Float32Array, 'intensityGrid must be Float32Array');
  assert.equal(msh.getIntensityGrid().length, TOTAL_TILES, 'intensityGrid length must be 195');

  assert.ok(msh.getCleanseTimerGrid() instanceof Float32Array, 'cleanseTimerGrid must be Float32Array');
  assert.equal(msh.getCleanseTimerGrid().length, TOTAL_TILES, 'cleanseTimerGrid length must be 195');

  assert.ok(msh.getPropagationBuffer() instanceof Float32Array, 'propagationBuffer must be Float32Array');
  assert.equal(msh.getPropagationBuffer().length, TOTAL_TILES, 'propagationBuffer length must be 195');

  assert.ok(msh.getActiveSporeIndices() instanceof Int16Array, 'activeSporeIndices must be Int16Array');
  assert.equal(msh.getActiveSporeIndices().length, MAX_MIASMA_TILES, 'activeSporeIndices length must be 32');
});

test('Audit Suite 1: ChronoHazard 1D TypedArray buffers match exact grid capacity', () => {
  const ch = new ChronoHazard();
  assert.ok(ch.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(ch.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(ch.getDilationGrid() instanceof Float32Array, 'dilationGrid must be Float32Array');
  assert.equal(ch.getDilationGrid().length, TOTAL_TILES, 'dilationGrid length must be 195');

  assert.ok(ch.getCleanseGrid() instanceof Float32Array, 'cleanseGrid must be Float32Array');
  assert.equal(ch.getCleanseGrid().length, TOTAL_TILES, 'cleanseGrid length must be 195');

  assert.ok(ch.getActiveChronoIndices() instanceof Int16Array, 'activeChronoIndices must be Int16Array');
  assert.equal(ch.getActiveChronoIndices().length, MAX_CHRONO_TILES, 'activeChronoIndices length must be 32');
});

test('Audit Suite 1: SolarHazard 1D TypedArray buffers match exact grid capacity', () => {
  const sh = new SolarHazard();
  assert.ok(sh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(sh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(sh.getHeatGrid() instanceof Float32Array, 'heatGrid must be Float32Array');
  assert.equal(sh.getHeatGrid().length, TOTAL_TILES, 'heatGrid length must be 195');

  assert.ok(sh.getCleanseGrid() instanceof Float32Array, 'cleanseGrid must be Float32Array');
  assert.equal(sh.getCleanseGrid().length, TOTAL_TILES, 'cleanseGrid length must be 195');

  assert.ok(sh.getActiveSolarIndices() instanceof Int16Array, 'activeSolarIndices must be Int16Array');
  assert.equal(sh.getActiveSolarIndices().length, MAX_SOLAR_TILES, 'activeSolarIndices length must be 32');
});

test('Audit Suite 1: NebulaHazard 1D TypedArray buffers match exact grid capacity', () => {
  const nh = new NebulaHazard();
  assert.ok(nh.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(nh.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(nh.getDensityGrid() instanceof Float32Array, 'densityGrid must be Float32Array');
  assert.equal(nh.getDensityGrid().length, TOTAL_TILES, 'densityGrid length must be 195');

  assert.ok(nh.getCleanseGrid() instanceof Float32Array, 'cleanseGrid must be Float32Array');
  assert.equal(nh.getCleanseGrid().length, TOTAL_TILES, 'cleanseGrid length must be 195');

  assert.ok(nh.getActiveNebulaIndices() instanceof Int16Array, 'activeNebulaIndices must be Int16Array');
  assert.equal(nh.getActiveNebulaIndices().length, MAX_NEBULA_TILES, 'activeNebulaIndices length must be 32');
});

test('Audit Suite 1: AbyssalHazard 1D TypedArray buffers match exact grid capacity', () => {
  const ah = new AbyssalHazard();
  assert.ok(ah.getDangerMask() instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(ah.getDangerMask().length, TOTAL_TILES, 'dangerMask length must be 195');

  assert.ok(ah.pressureGrid instanceof Float32Array, 'pressureGrid must be Float32Array');
  assert.equal(ah.pressureGrid.length, TOTAL_TILES, 'pressureGrid length must be 195');

  assert.ok(ah.cleanseGrid instanceof Float32Array, 'cleanseGrid must be Float32Array');
  assert.equal(ah.cleanseGrid.length, TOTAL_TILES, 'cleanseGrid length must be 195');

  assert.ok(ah.getActiveIndices() instanceof Int16Array, 'activeAbyssalIndices must be Int16Array');
  assert.ok(ah.getActiveIndices().length <= MAX_ABYSSAL_TILES);
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

/* ==============================================================================
 * SUITE 2 EXPANDED: DISCRETE LATTICE DENSITY & SAFE AREA GUARANTEES (>= 80%)
 * ============================================================================== */

test('Audit Suite 2: Discrete Euclidean radius-3 balls equal exactly 29 lattice tiles across all 8 radial hazards', () => {
  const EXPECTED_TILES = 29;
  const EXPECTED_SAFE_RATIO = (TOTAL_TILES - EXPECTED_TILES) / TOTAL_TILES; // 166 / 195 approx 0.85128
  assert.ok(EXPECTED_SAFE_RATIO >= 0.80, 'Safe area ratio must be >= 80%');

  // 1. GravityHazard
  const gh = new GravityHazard();
  gh.init(6, 7);
  gh.start('OUTBREAK');
  gh.update(2100); // Transitions to SINGULARITY_BURST where 29-tile event horizon is active
  assert.equal(gh.getEventHorizonCount(), EXPECTED_TILES, 'GravityHazard interior ball must contain exactly 29 tiles');
  assert.equal(gh.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'GravityHazard safe area must be >= 80%');

  // 2. FrostHazard
  const fh = new FrostHazard();
  fh.init(6, 7);
  fh.start('OUTBREAK');
  assert.equal(fh.getActiveFrostCount(), EXPECTED_TILES, 'FrostHazard interior ball must contain exactly 29 tiles');
  assert.equal(fh.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'FrostHazard safe area must be >= 80%');

  // 3. VoltHazard
  const vh = new VoltHazard(6, 7);
  vh.start('NORMAL');
  assert.equal(vh.getActiveVoltCount(), EXPECTED_TILES, 'VoltHazard interior ball must contain exactly 29 tiles');
  assert.equal(vh.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'VoltHazard safe area must be >= 80%');

  // 4. MagmaHazard
  const mh = new MagmaHazard(6, 7);
  mh.start('NORMAL');
  assert.equal(mh.getActiveMagmaCount(), EXPECTED_TILES, 'MagmaHazard interior ball must contain exactly 29 tiles');
  assert.equal(mh.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'MagmaHazard safe area must be >= 80%');

  // 5. MiasmaHazard
  const msh = new MiasmaHazard(6, 7);
  msh.start('NORMAL');
  assert.equal(msh.getActiveSporeCount(), EXPECTED_TILES, 'MiasmaHazard interior ball must contain exactly 29 tiles');
  assert.equal(msh.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'MiasmaHazard safe area must be >= 80%');

  // 6. ChronoHazard
  const ch = new ChronoHazard();
  ch.start('NORMAL', 6, 7);
  assert.equal(ch.getActiveChronoCount(), EXPECTED_TILES, 'ChronoHazard interior ball must contain exactly 29 tiles');
  assert.equal(ch.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'ChronoHazard safe area must be >= 80%');

  // 7. SolarHazard
  const sh = new SolarHazard();
  sh.start('NORMAL', 6, 7);
  assert.equal(sh.getActiveSolarCount(), EXPECTED_TILES, 'SolarHazard interior ball must contain exactly 29 tiles');
  assert.equal(sh.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'SolarHazard safe area must be >= 80%');

  // 8. NebulaHazard
  const nh = new NebulaHazard(6, 7);
  nh.start('NORMAL', 6, 7);
  assert.equal(nh.getActiveNebulaCount(), EXPECTED_TILES, 'NebulaHazard interior ball must contain exactly 29 tiles');
  assert.equal(nh.getSafeAreaRatio(), EXPECTED_SAFE_RATIO, 'NebulaHazard safe area must be >= 80%');
});

test('Audit Suite 2: All 10 hazards reject out-of-bounds, float, and aliased coordinates', () => {
  // Aliased coordinate (-1, 15) which algebraically equals index 0 (-1 * 15 + 15 = 0)
  const ALIAS_R = -1;
  const ALIAS_C = 15;

  const hazards = [
    new FrostHazard(),
    new VoltHazard(6, 7),
    new MagmaHazard(6, 7),
    new MiasmaHazard(6, 7),
    new ChronoHazard(),
    new SolarHazard(),
    new NebulaHazard(6, 7),
    new AbyssalHazard(6, 7),
  ];

  for (const h of hazards) {
    if (typeof h.isTileLethal === 'function') {
      assert.equal(h.isTileLethal(ALIAS_R, ALIAS_C), false);
      assert.equal(h.isTileLethal(100, 2), false);
      assert.equal(h.isTileLethal(NaN, 2), false);
      assert.equal(h.isTileLethal(2, Infinity), false);
    }
    if (typeof h.isPointLethal === 'function') {
      assert.equal(h.isPointLethal(-100, 50), false);
      assert.equal(h.isPointLethal(NaN, 50), false);
    }
    if (typeof h.checkEnemyCollision === 'function') {
      const res = h.checkEnemyCollision(ALIAS_R, ALIAS_C, false);
      assert.equal(res.hit, false);
    }
  }
});

test('Audit Suite 2: AbyssalHazard and NebulaHazard NaN and float tile queries never leak to tile 0', () => {
  const ah = new AbyssalHazard(6, 7);
  ah.start('NORMAL', 6, 7);
  assert.equal(ah.isTileCleansed(NaN, 0), false);
  assert.equal(ah.isTileInAbyss(1.5, 2), false);
  assert.equal(ah.isTileInMaelstrom(NaN, NaN), false);
  assert.equal(ah.onBombPlaced('b1', NaN, 0, 1000).isAccelerated, false);
  assert.equal(ah.onBombKicked('b1', 1.5, 0, 100).isSlipstreamKick, false);

  const nh = new NebulaHazard(6, 7);
  nh.start('NORMAL', 6, 7);
  assert.equal(nh.isTileInNebula(NaN, 0), false);
  assert.equal(nh.isTileInCollapse(1.5, 2), false);
  assert.equal(nh.isTileInCalm(NaN, NaN), false);
  assert.equal(nh.onBombPlaced('b1', NaN, 0, 1000).isAccelerated, false);
  assert.equal(nh.onBombKicked('b1', 1.5, 0, 100).isSlipstreamKick, false);
});

/* ==============================================================================
 * SUITE 3 EXPANDED: ZERO-GC SCRATCH RECYCLING ACROSS ALL 9 HAZARDS
 * ============================================================================== */

test('Audit Suite 3: getCenter() returns recycled scratch objects without heap allocation', () => {
  const gh = new GravityHazard();
  assert.strictEqual(gh.getCenter(), gh.getCenter(), 'GravityHazard.getCenter() must return same scratch instance');

  const msh = new MiasmaHazard();
  assert.strictEqual(msh.getCenter(), msh.getCenter(), 'MiasmaHazard.getCenter() must return same scratch instance');

  const ch = new ChronoHazard();
  assert.strictEqual(ch.getCenter(), ch.getCenter(), 'ChronoHazard.getCenter() must return same scratch instance');

  const sh = new SolarHazard();
  assert.strictEqual(sh.getCenter(), sh.getCenter(), 'SolarHazard.getCenter() must return same scratch instance');

  const nh = new NebulaHazard();
  assert.strictEqual(nh.getCenter(), nh.getCenter(), 'NebulaHazard.getCenter() must return same scratch instance');
});

test('Audit Suite 3: evaluatePlayer and checkEnemyCollision recycle scratch instances across all hazards', () => {
  const hazards = [
    new DynamicHazard(),
    new GravityHazard(),
    new FrostHazard(),
    new VoltHazard(),
    new MagmaHazard(),
    new MiasmaHazard(),
    new ChronoHazard(),
    new SolarHazard(),
    new NebulaHazard(),
  ];

  for (const h of hazards) {
    if (typeof h.evaluatePlayer === 'function') {
      const p1 = h.evaluatePlayer(100, 100);
      const p2 = h.evaluatePlayer(100, 100);
      assert.strictEqual(p1, p2, `${h.constructor.name}.evaluatePlayer must reuse scratch instance`);
    }

    if (typeof h.checkEnemyCollision === 'function') {
      const e1 = h.checkEnemyCollision(3, 4, false, 0);
      const e2 = h.checkEnemyCollision(3, 4, false, 0);
      assert.strictEqual(e1, e2, `${h.constructor.name}.checkEnemyCollision must reuse scratch instance`);
    }
  }
});

test('Audit Suite 3: Tactical bomb hooks return recycled scratch instances without heap churn', () => {
  // ChronoHazard
  const ch = new ChronoHazard();
  assert.strictEqual(ch.evaluateBombSlide(6, 7, 300), ch.evaluateBombSlide(6, 7, 300));
  assert.strictEqual(ch.onBombPlaced('b1', 6, 7, 2, 2500), ch.onBombPlaced('b1', 6, 7, 2, 2500));
  assert.strictEqual(ch.onBombDetonated('b1', 6, 7, 2), ch.onBombDetonated('b1', 6, 7, 2));
  assert.strictEqual(ch.onBombBlastImpact(6, 7), ch.onBombBlastImpact(6, 7));
  assert.strictEqual(ch.onBombKicked('b1', 6, 7, 300), ch.onBombKicked('b1', 6, 7, 300));

  // SolarHazard
  const sh = new SolarHazard();
  assert.strictEqual(sh.evaluateBombSlide(6, 7, 300), sh.evaluateBombSlide(6, 7, 300));
  assert.strictEqual(sh.onBombPlaced('b1', 6, 7, 2, 2500), sh.onBombPlaced('b1', 6, 7, 2, 2500));
  assert.strictEqual(sh.onBombDetonated('b1', 6, 7, 2), sh.onBombDetonated('b1', 6, 7, 2));
  assert.strictEqual(sh.onBombBlastImpact(6, 7), sh.onBombBlastImpact(6, 7));
  assert.strictEqual(sh.onBombKicked('b1', 6, 7, 300), sh.onBombKicked('b1', 6, 7, 300));

  // NebulaHazard
  const nh = new NebulaHazard();
  assert.strictEqual(nh.evaluateBombSlide(6, 7, 300), nh.evaluateBombSlide(6, 7, 300));
  assert.strictEqual(nh.onBombPlaced('b1', 6, 7, 2, 2500), nh.onBombPlaced('b1', 6, 7, 2, 2500));
  assert.strictEqual(nh.onBombDetonated('b1', 6, 7, 2), nh.onBombDetonated('b1', 6, 7, 2));
  assert.strictEqual(nh.onBombBlastImpact(6, 7), nh.onBombBlastImpact(6, 7));
  assert.strictEqual(nh.onBombKicked('b1', 6, 7, 300), nh.onBombKicked('b1', 6, 7, 300));

  // MiasmaHazard
  const msh = new MiasmaHazard();
  assert.strictEqual(msh.evaluateBombSlide(6, 7, 300), msh.evaluateBombSlide(6, 7, 300));
  assert.strictEqual(msh.onBombPlaced('b1', 6, 7, 2, 2500), msh.onBombPlaced('b1', 6, 7, 2, 2500));
  assert.strictEqual(msh.onBombDetonated('b1', 6, 7, 2), msh.onBombDetonated('b1', 6, 7, 2));
  assert.strictEqual(msh.onBombBlastImpact(6, 7), msh.onBombBlastImpact(6, 7));
  assert.strictEqual(msh.onBombKicked('b1', 6, 7, 300), msh.onBombKicked('b1', 6, 7, 300));

  // FrostHazard
  const fh = new FrostHazard();
  assert.strictEqual(fh.onBombPlaced('b1', 6, 7, 2, 2500), fh.onBombPlaced('b1', 6, 7, 2, 2500));
  assert.strictEqual(fh.onBombDetonated('b1', 6, 7, 2), fh.onBombDetonated('b1', 6, 7, 2));

  // VoltHazard
  const vh = new VoltHazard();
  assert.strictEqual(vh.onBombPlaced('b1', 6, 7, 2, 2500), vh.onBombPlaced('b1', 6, 7, 2, 2500));
  assert.strictEqual(vh.onBombDetonated('b1', 6, 7, 2), vh.onBombDetonated('b1', 6, 7, 2));
  assert.strictEqual(vh.onBombBlastImpact(6, 7), vh.onBombBlastImpact(6, 7));

  // MagmaHazard
  const mh = new MagmaHazard();
  assert.strictEqual(mh.onBombPlaced('b1', 6, 7, 2, 2500), mh.onBombPlaced('b1', 6, 7, 2, 2500));
  assert.strictEqual(mh.onBombDetonated('b1', 6, 7, 2), mh.onBombDetonated('b1', 6, 7, 2));
  assert.strictEqual(mh.onBombBlastImpact(6, 7), mh.onBombBlastImpact(6, 7));
});
