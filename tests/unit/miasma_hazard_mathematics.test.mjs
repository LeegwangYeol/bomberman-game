import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MiasmaHazard,
  TOTAL_TILES,
  COLS,
  ROWS,
  MIASMA_RADIUS_TILES,
  MIN_MIASMA_SAFE_AREA_RATIO,
  MiasmaDangerValue,
} from '../../src/game/hazards/MiasmaHazard.ts';

test('MiasmaHazard [TypedArray Allocation & Dimensions]: Buffers match exact 195-tile arena specifications', () => {
  const hazard = new MiasmaHazard();
  assert.equal(hazard.dangerMask.length, TOTAL_TILES);
  assert.equal(hazard.sporeGrid.length, TOTAL_TILES);
  assert.equal(hazard.intensityGrid.length, TOTAL_TILES);
  assert.equal(hazard.cleanseTimerGrid.length, TOTAL_TILES);
  assert.equal(hazard.propagationBuffer.length, TOTAL_TILES);
  assert.equal(hazard.activeSporeIndices.length, 32);

  assert.ok(hazard.dangerMask instanceof Uint8Array);
  assert.ok(hazard.sporeGrid instanceof Float32Array);
  assert.ok(hazard.intensityGrid instanceof Float32Array);
  assert.ok(hazard.cleanseTimerGrid instanceof Float32Array);
  assert.ok(hazard.propagationBuffer instanceof Float32Array);
  assert.ok(hazard.activeSporeIndices instanceof Int16Array);
});

test('MiasmaHazard [Euclidean Lattice Density]: Radius 3 lattice ball contains exactly 29 discrete tiles', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);

  const activeCount = hazard.getActiveSporeCount();
  assert.equal(activeCount, 29, 'Radius 3 Euclidean lattice contains exactly 29 tiles');

  // Verify all 29 precomputed tiles satisfy dr^2 + dc^2 <= 9
  const indices = hazard.getActiveSporeIndices();
  for (let i = 0; i < activeCount; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const dr = r - 6;
    const dc = c - 7;
    assert.ok(dr * dr + dc * dc <= MIASMA_RADIUS_TILES * MIASMA_RADIUS_TILES, `Tile (${r}, ${c}) within radius 3`);
  }
});

test('MiasmaHazard [Safe Area Invariant]: Mathematical guarantee of safe area ratio >= 80% (observed 85.128%)', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const safeAreaRatio = hazard.calculateSafeAreaRatio();
  assert.ok(safeAreaRatio >= MIN_MIASMA_SAFE_AREA_RATIO, `Safe area ratio ${safeAreaRatio} >= ${MIN_MIASMA_SAFE_AREA_RATIO}`);

  // Exactly (195 - 29) / 195 = 166 / 195 = ~0.85128
  const expectedRatio = (TOTAL_TILES - 29) / TOTAL_TILES;
  assert.ok(Math.abs(safeAreaRatio - expectedRatio) < 1e-4, 'Safe area ratio matches analytical Euclidean derivation');
});

test('MiasmaHazard [Zero-GC Scratch Containers]: All query methods return pre-allocated scratch objects by reference', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const res1 = hazard.evaluatePlayer(280, 260, false, 1000);
  const res2 = hazard.evaluatePlayer(280, 260, false, 1016);
  assert.strictEqual(res1, res2, 'evaluatePlayer returns identical scratch instance by reference');

  const enemy1 = hazard.checkEnemyCollision(6, 7, false, 1000);
  const enemy2 = hazard.checkEnemyCollision(6, 7, false, 1016);
  assert.strictEqual(enemy1, enemy2, 'checkEnemyCollision returns identical scratch instance by reference');

  const bomb1 = hazard.onBombPlaced('b1', 6, 7, 2, 2500);
  const bomb2 = hazard.onBombPlaced('b2', 6, 7, 2, 2500);
  assert.strictEqual(bomb1, bomb2, 'onBombPlaced returns identical scratch instance by reference');

  const det1 = hazard.onBombDetonated('b1', 6, 7, 2);
  const det2 = hazard.onBombDetonated('b2', 6, 7, 2);
  assert.strictEqual(det1, det2, 'onBombDetonated returns identical scratch instance by reference');

  const blast1 = hazard.onBombBlastImpact(6, 7);
  const blast2 = hazard.onBombBlastImpact(6, 7);
  assert.strictEqual(blast1, blast2, 'onBombBlastImpact returns identical scratch instance by reference');
});

test('MiasmaHazard [Math Defense]: Out-of-bounds, float, and NaN coordinate rejection', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  // Test non-finite coordinates
  assert.equal(hazard.isPointInSporeZone(NaN, 100), false);
  assert.equal(hazard.isPointInSporeZone(100, Infinity), false);
  assert.equal(hazard.isPointInSporeZone(-50, -50), false);
  assert.equal(hazard.isPointInSporeZone(9999, 9999), false);

  // Discrete coordinate validation
  assert.equal(hazard.isTileInSporeZone(-1, 0), false);
  assert.equal(hazard.isTileInSporeZone(ROWS, 0), false);
  assert.equal(hazard.isTileInSporeZone(0, -1), false);
  assert.equal(hazard.isTileInSporeZone(0, COLS), false);
  assert.equal(hazard.isTileInSporeZone(NaN, 5), false);
});
