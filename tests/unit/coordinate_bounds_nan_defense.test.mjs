/**
 * tests/unit/coordinate_bounds_nan_defense.test.mjs
 *
 * Dedicated verification suite for:
 * 1. Coordinate bounds and NaN defense in pathfinding.ts
 * 2. Strict Number.isInteger guards and zero-leak prevention in BaseCrisis.ts
 * 3. Robust coordinate validation and float defense in VoidCrisis.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  coordToIdx,
  idxToRow,
  idxToCol,
  findPathBFS,
  findEscapePathBFS,
  isTileInBlastRange,
  findTargetBlockBFS,
  getSafeDemolitionApproaches,
  findDemolitionPath,
  findPathWithDemolition,
  getSafeBombEscapePath,
  canSafelyPlaceBomb,
  findCorneringBombTile,
  ZeroGCPathfinder,
  FlatHazardMask,
} from '../../src/game/pathfinding.ts';

import { BaseCrisis } from '../../src/game/crises/BaseCrisis.ts';
import { VoidCrisis } from '../../src/game/crises/VoidCrisis.ts';
import { CrisisType, CrisisStage, HazardType } from '../../src/game/crises/CrisisTypes.ts';

// Concrete subclass for testing BaseCrisis abstract methods
class TestCrisis extends BaseCrisis {
  blastsRecorded = [];

  constructor() {
    super(CrisisType.PASTEL_VOID);
  }

  onInit() {
    this.blastsRecorded = [];
  }

  onStageEnter(_stage) {}
  onUpdate(_deltaMs, _playerPos) {}

  onBombBlast(r, c, radius) {
    this.blastsRecorded.push({ r, c, radius });
  }

  onResolveObjective(_objectiveId, _value) {}

  // Expose protected methods for auditing
  testIsPerimeter(r, c) {
    return this.isPerimeter(r, c);
  }

  testIsPillar(r, c) {
    return this.isPillar(r, c);
  }

  testIsWalkableTile(r, c) {
    return this.isWalkableTile(r, c);
  }
}

/* ==============================================================================
 * SUITE 1: pathfinding.ts COORDINATE BOUNDS & NaN DEFENSE
 * ============================================================================== */

test('Pathfinding 1.1: coordToIdx strictly rejects NaN, floats, and out-of-bounds coordinates', () => {
  // Valid bounds
  assert.equal(coordToIdx(0, 0), 0);
  assert.equal(coordToIdx(0, COLS - 1), 14);
  assert.equal(coordToIdx(ROWS - 1, 0), 180);
  assert.equal(coordToIdx(ROWS - 1, COLS - 1), 194);

  // NaN & Non-finite
  assert.equal(coordToIdx(NaN, 0), -1, 'NaN row must return -1');
  assert.equal(coordToIdx(0, NaN), -1, 'NaN col must return -1');
  assert.equal(coordToIdx(NaN, NaN), -1, 'NaN row and col must return -1');
  assert.equal(coordToIdx(Infinity, 0), -1);
  assert.equal(coordToIdx(0, -Infinity), -1);

  // Floats (Must NOT truncate and leak to 0 or arbitrary offsets)
  assert.equal(coordToIdx(0.5, 0), -1, 'Float row must return -1');
  assert.equal(coordToIdx(0, 0.5), -1, 'Float col must return -1');
  assert.equal(coordToIdx(-0.5, 0), -1, 'Negative float must return -1, not alias to 0');
  assert.equal(coordToIdx(0, -0.5), -1, 'Negative float must return -1, not alias to 0');
  assert.equal(coordToIdx(1.9, 2.1), -1);

  // Boundary checks & Aliased coordinates
  assert.equal(coordToIdx(-1, 0), -1);
  assert.equal(coordToIdx(0, -1), -1);
  assert.equal(coordToIdx(-1, 15), -1, '(-1, 15) algebraically -15+15=0 must be rejected');
  assert.equal(coordToIdx(ROWS, 0), -1);
  assert.equal(coordToIdx(0, COLS), -1);
  assert.equal(coordToIdx(100, 100), -1);
});

test('Pathfinding 1.2: idxToRow and idxToCol strictly reject negative, NaN, float, and out-of-bounds indices', () => {
  // Valid bounds
  assert.equal(idxToRow(0), 0);
  assert.equal(idxToCol(0), 0);
  assert.equal(idxToRow(194), 12);
  assert.equal(idxToCol(194), 14);

  // Negative indices (Must NOT leak to row 0 or negative col)
  assert.equal(idxToRow(-1), -1, 'idx -1 must return -1');
  assert.equal(idxToCol(-1), -1, 'idx -1 must return -1');
  assert.equal(idxToRow(-15), -1);
  assert.equal(idxToCol(-15), -1);

  // NaN & Non-finite
  assert.equal(idxToRow(NaN), -1);
  assert.equal(idxToCol(NaN), -1);
  assert.equal(idxToRow(Infinity), -1);
  assert.equal(idxToCol(Infinity), -1);

  // Floats
  assert.equal(idxToRow(0.5), -1);
  assert.equal(idxToCol(0.5), -1);
  assert.equal(idxToRow(14.9), -1);

  // Out of bounds
  assert.equal(idxToRow(TOTAL_TILES), -1);
  assert.equal(idxToCol(TOTAL_TILES), -1);
  assert.equal(idxToRow(1000), -1);
  assert.equal(idxToCol(1000), -1);
});

test('Pathfinding 1.3: ZeroGCPathfinder.computeBlast rejects float, NaN, and negative centerIdx', () => {
  const pathfinder = new ZeroGCPathfinder();
  const mask = new Uint8Array(TOTAL_TILES);

  // Non-integer float centerIdx (Must NOT truncate to 0 and contaminate tile 0)
  pathfinder.computeBlast(0.5, 2, pathfinder.obstacleMask, mask, true);
  assert.equal(mask[0], 0, 'centerIdx 0.5 must NOT set tile 0');

  pathfinder.computeBlast(-0.5, 2, pathfinder.obstacleMask, mask, true);
  assert.equal(mask[0], 0, 'centerIdx -0.5 must NOT set tile 0');

  pathfinder.computeBlast(NaN, 2, pathfinder.obstacleMask, mask, true);
  assert.equal(mask[0], 0, 'centerIdx NaN must NOT set tile 0');

  pathfinder.computeBlast(TOTAL_TILES, 2, pathfinder.obstacleMask, mask, true);
  assert.equal(mask[0], 0, 'centerIdx TOTAL_TILES must NOT set any tile');

  // Valid centerIdx
  pathfinder.computeBlast(1 * COLS + 1, 2, pathfinder.obstacleMask, mask, true);
  assert.equal(mask[1 * COLS + 1], 1, 'Valid centerIdx must set tile');
});

test('Pathfinding 1.4: findPathBFS and findEscapePathBFS reject NaN, float, and null inputs', () => {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  // NaN & float start / target
  assert.deepEqual(findPathBFS({ r: NaN, c: 1 }, { r: 1, c: 1 }, map, new Set()), []);
  assert.deepEqual(findPathBFS({ r: 1, c: NaN }, { r: 1, c: 1 }, map, new Set()), []);
  assert.deepEqual(findPathBFS({ r: 0.5, c: 1 }, { r: 1, c: 1 }, map, new Set()), []);
  assert.deepEqual(findPathBFS({ r: 1, c: 1 }, { r: 1.5, c: 1 }, map, new Set()), []);
  assert.deepEqual(findPathBFS(null, { r: 1, c: 1 }, map, new Set()), []);
  assert.deepEqual(findPathBFS({ r: 1, c: 1 }, null, map, new Set()), []);
  assert.deepEqual(findPathBFS({ r: 1, c: 1 }, { r: 1, c: 1 }, null, new Set()), []);

  // Escape BFS
  assert.equal(findEscapePathBFS({ r: NaN, c: 1 }, new Set(), map, new Set()), null);
  assert.equal(findEscapePathBFS({ r: 1.5, c: 1 }, new Set(), map, new Set()), null);
  assert.equal(findEscapePathBFS({ r: -1, c: 1 }, new Set(), map, new Set()), null);
  assert.equal(findEscapePathBFS(null, new Set(), map, new Set()), null);
  assert.equal(findEscapePathBFS({ r: 1, c: 1 }, new Set(), null, new Set()), null);
  assert.equal(findEscapePathBFS({ r: 1, c: 1 }, new Set(), map, new Set(), NaN), null);
  assert.equal(findEscapePathBFS({ r: 1, c: 1 }, new Set(), map, new Set(), -5), null);
});

test('Pathfinding 1.5: isTileInBlastRange rejects float, NaN, and negative coordinates without throwing', () => {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  // Null checks
  assert.equal(isTileInBlastRange(null, { r: 1, c: 1 }, 2, map), false);
  assert.equal(isTileInBlastRange({ r: 1, c: 1 }, null, 2, map), false);
  assert.equal(isTileInBlastRange({ r: 1, c: 1 }, { r: 1, c: 1 }, 2, null), false);

  // Object coordinates with NaNs and floats
  assert.equal(isTileInBlastRange({ r: NaN, c: 1 }, { r: 1, c: 1 }, 2, map), false);
  assert.equal(isTileInBlastRange({ r: 1, c: 1 }, { r: 1, c: NaN }, 2, map), false);
  assert.equal(isTileInBlastRange({ r: 0.5, c: 1 }, { r: 1, c: 1 }, 2, map), false);
  assert.equal(isTileInBlastRange({ r: 1, c: 1 }, { r: 1, c: 1.5 }, 2, map), false);

  // Number indices with NaNs and floats
  assert.equal(isTileInBlastRange(NaN, 16, 2, map), false);
  assert.equal(isTileInBlastRange(16, NaN, 2, map), false);
  assert.equal(isTileInBlastRange(0.5, 16, 2, map), false);
  assert.equal(isTileInBlastRange(-1, 16, 2, map), false);
  assert.equal(isTileInBlastRange(TOTAL_TILES, 16, 2, map), false);

  // Valid blast range
  assert.equal(isTileInBlastRange({ r: 1, c: 2 }, { r: 1, c: 1 }, 2, map), true);
});

test('Pathfinding 1.6: findPathWithDemolition, canSafelyPlaceBomb, and getSafeBombEscapePath reject corrupt coordinates', () => {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  // Demolition path
  const demoRes1 = findPathWithDemolition({ r: NaN, c: 1 }, { r: 1, c: 1 }, map);
  assert.equal(demoRes1.pathLength, 0);
  assert.equal(demoRes1.reachedTarget, false);

  const demoRes2 = findPathWithDemolition(0.5, 16, map);
  assert.equal(demoRes2.pathLength, 0);

  const demoRes3 = findPathWithDemolition(null, { r: 1, c: 1 }, map);
  assert.equal(demoRes3.pathLength, 0);

  // canSafelyPlaceBomb
  assert.equal(canSafelyPlaceBomb(null, 2, map), false);
  assert.equal(canSafelyPlaceBomb({ r: NaN, c: 1 }, 2, map), false);
  assert.equal(canSafelyPlaceBomb(0.5, 2, map), false);
  assert.equal(canSafelyPlaceBomb(-1, 2, map), false);
  assert.equal(canSafelyPlaceBomb({ r: 1, c: 1 }, 2, null), false);

  // getSafeBombEscapePath
  assert.equal(getSafeBombEscapePath(null, 2, map), null);
  assert.equal(getSafeBombEscapePath({ r: NaN, c: 1 }, 2, map), null);
  assert.equal(getSafeBombEscapePath(0.5, 2, map), null);
  assert.equal(getSafeBombEscapePath(-1, 2, map), null);
  assert.equal(getSafeBombEscapePath({ r: 1, c: 1 }, 2, null), null);

  // findCorneringBombTile
  assert.equal(findCorneringBombTile(null, { r: 1, c: 1 }, map), null);
  assert.equal(findCorneringBombTile({ r: 1, c: 1 }, null, map), null);
  assert.equal(findCorneringBombTile({ r: NaN, c: 1 }, { r: 1, c: 1 }, map), null);
  assert.equal(findCorneringBombTile({ r: 1, c: 1 }, { r: 1.5, c: 1 }, map), null);
});

/* ==============================================================================
 * SUITE 2: BaseCrisis.ts ZERO-LEAK & STRICT INTEGER GUARDS
 * ============================================================================== */

test('BaseCrisis 2.1: setHazardTile rejects floats and negative coordinates without leaking to tile 0', () => {
  const crisis = new TestCrisis();
  crisis.init();

  // Negative float (-0.5, -0.5) must NOT truncate to 0 and set tile (0, 0)
  const res1 = crisis.setHazardTile(-0.5, -0.5, HazardType.VOID_CREEP, 1.0);
  assert.equal(res1, null, 'setHazardTile(-0.5, -0.5) must return null');
  assert.equal(crisis.isTileHazardous(0, 0), false, 'Tile (0, 0) must NOT be contaminated by -0.5');

  // Positive float (0.9, 0.9) must NOT truncate to 0
  const res2 = crisis.setHazardTile(0.9, 0.9, HazardType.VOID_CREEP, 1.0);
  assert.equal(res2, null, 'setHazardTile(0.9, 0.9) must return null');
  assert.equal(crisis.isTileHazardous(0, 0), false, 'Tile (0, 0) must remain clean');

  // NaNs and Infinities
  assert.equal(crisis.setHazardTile(NaN, 1, HazardType.VOID_CREEP), null);
  assert.equal(crisis.setHazardTile(1, NaN, HazardType.VOID_CREEP), null);
  assert.equal(crisis.setHazardTile(Infinity, 1, HazardType.VOID_CREEP), null);

  // Out of bounds
  assert.equal(crisis.setHazardTile(-1, 0, HazardType.VOID_CREEP), null);
  assert.equal(crisis.setHazardTile(ROWS, 0, HazardType.VOID_CREEP), null);
  assert.equal(crisis.setHazardTile(0, COLS, HazardType.VOID_CREEP), null);

  // Valid coordinate
  const valid = crisis.setHazardTile(1, 1, HazardType.VOID_CREEP, 1.0);
  assert.ok(valid !== null);
  assert.equal(crisis.isTileHazardous(1, 1), true);
});

test('BaseCrisis 2.2: clearHazardTile, isTileHazardous, and getHazardAt reject float and NaN coordinates', () => {
  const crisis = new TestCrisis();
  crisis.init();

  // Populate tile (0, 0) with a hazard
  crisis.setHazardTile(0, 0, HazardType.VOID_CREEP, 1.0);
  assert.equal(crisis.isTileHazardous(0, 0), true);

  // Querying with (-0.5, 0) must NOT evaluate tile (0, 0)
  assert.equal(crisis.isTileHazardous(-0.5, 0), false, 'isTileHazardous(-0.5, 0) must be false');
  assert.equal(crisis.getHazardAt(-0.5, 0), null, 'getHazardAt(-0.5, 0) must return null');

  // clearHazardTile(-0.5, 0) must NOT clear tile (0, 0)
  crisis.clearHazardTile(-0.5, 0);
  assert.equal(crisis.isTileHazardous(0, 0), true, 'Tile (0, 0) must remain intact after clearHazardTile(-0.5, 0)');

  // NaNs
  assert.equal(crisis.isTileHazardous(NaN, 0), false);
  assert.equal(crisis.getHazardAt(0, NaN), null);
  crisis.clearHazardTile(NaN, NaN);
  assert.equal(crisis.isTileHazardous(0, 0), true);

  // Valid clear
  crisis.clearHazardTile(0, 0);
  assert.equal(crisis.isTileHazardous(0, 0), false);
});

test('BaseCrisis 2.3: isPerimeter, isPillar, and isWalkableTile strictly reject out-of-bounds, negative, and NaN coordinates', () => {
  const crisis = new TestCrisis();

  // Out of bounds negative coordinates must NOT be classified as walkable
  assert.equal(crisis.testIsPerimeter(-1, -1), false);
  assert.equal(crisis.testIsPillar(-1, -1), false);
  assert.equal(crisis.testIsWalkableTile(-1, -1), false, '(-1, -1) must NOT be walkable');

  // Large out-of-bounds coordinates
  assert.equal(crisis.testIsWalkableTile(100, 100), false, '(100, 100) must NOT be walkable');
  assert.equal(crisis.testIsWalkableTile(13, 15), false);

  // NaN and floats
  assert.equal(crisis.testIsWalkableTile(NaN, NaN), false);
  assert.equal(crisis.testIsWalkableTile(1.5, 1.5), false);

  // Valid perimeter tile (0, 0) -> perimeter true, pillar true, walkable false
  assert.equal(crisis.testIsPerimeter(0, 0), true);
  assert.equal(crisis.testIsWalkableTile(0, 0), false);

  // Valid inner pillar (2, 2) -> perimeter false, pillar true, walkable false
  assert.equal(crisis.testIsPerimeter(2, 2), false);
  assert.equal(crisis.testIsPillar(2, 2), true);
  assert.equal(crisis.testIsWalkableTile(2, 2), false);

  // Valid inner walkable corridor (1, 1) -> walkable true
  assert.equal(crisis.testIsPerimeter(1, 1), false);
  assert.equal(crisis.testIsPillar(1, 1), false);
  assert.equal(crisis.testIsWalkableTile(1, 1), true);
});

test('BaseCrisis 2.4: handleBombBlast strictly guards against NaN, floats, and out-of-bounds coords', () => {
  const crisis = new TestCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Invalid bomb blasts
  crisis.handleBombBlast(NaN, 1, 2);
  crisis.handleBombBlast(1, NaN, 2);
  crisis.handleBombBlast(0.5, 1, 2);
  crisis.handleBombBlast(-1, 0, 2);
  crisis.handleBombBlast(ROWS, 0, 2);
  crisis.handleBombBlast(1, 1, NaN);
  crisis.handleBombBlast(1, 1, -1);
  crisis.handleBombBlast(1, 1, -0.5);

  assert.equal(crisis.blastsRecorded.length, 0, 'No invalid bomb blast should be forwarded');

  // Valid bomb blast
  crisis.handleBombBlast(1, 1, 2);
  assert.equal(crisis.blastsRecorded.length, 1);
  assert.deepEqual(crisis.blastsRecorded[0], { r: 1, c: 1, radius: 2 });
});

/* ==============================================================================
 * SUITE 3: VoidCrisis.ts DEFENSE & EXPANSION GUARDS
 * ============================================================================== */

test('VoidCrisis 3.1: canCreepSpreadTo rejects NaN, float, negative, and perimeter coordinates', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Invalid coordinates
  assert.equal(crisis.canCreepSpreadTo(NaN, 1), false);
  assert.equal(crisis.canCreepSpreadTo(1, NaN), false);
  assert.equal(crisis.canCreepSpreadTo(0.5, 1), false);
  assert.equal(crisis.canCreepSpreadTo(-1, 1), false);
  assert.equal(crisis.canCreepSpreadTo(ROWS, 1), false);

  // Perimeter wall immunity
  assert.equal(crisis.canCreepSpreadTo(0, 0), false);
  assert.equal(crisis.canCreepSpreadTo(0, 5), false);
  assert.equal(crisis.canCreepSpreadTo(ROWS - 1, 5), false);

  // Valid corridor tile
  assert.equal(crisis.canCreepSpreadTo(1, 1), true);
});

test('VoidCrisis 3.2: onBombBlast with float radius or float coordinates executes without corruption', () => {
  const crisis = new VoidCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Float coordinates are safely rejected
  assert.doesNotThrow(() => {
    crisis.handleBombBlast(1.5, 2.5, 2);
    crisis.handleBombBlast(NaN, 2, 2);
    crisis.handleBombBlast(-5, -5, 2);
  });

  // Valid blast with float radius 2.9 is safely floored to 2
  crisis.setHazardTile(1, 2, HazardType.VOID_CREEP, 0.8);
  crisis.voidCreepCount = 1;

  crisis.handleBombBlast(1, 1, 2.9);
  assert.equal(crisis.isTileHazardous(1, 2), false, 'Creep in range should be cleared');
  assert.equal(crisis.voidCreepCount, 0);
});
