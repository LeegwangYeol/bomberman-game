import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MagmaHazard,
  TOTAL_TILES,
  COLS,
  ROWS,
  MAGMA_RADIUS_TILES,
  MIN_MAGMA_SAFE_AREA_RATIO,
  MagmaDangerValue,
} from '../../src/game/hazards/MagmaHazard.ts';

test('MagmaHazard [TypedArray Allocation & Dimensions]: Buffers match exact 195-tile arena specifications', () => {
  const hazard = new MagmaHazard();
  assert.equal(hazard.dangerMask.length, TOTAL_TILES);
  assert.equal(hazard.heatGrid.length, TOTAL_TILES);
  assert.equal(hazard.intensityGrid.length, TOTAL_TILES);
  assert.equal(hazard.obsidianTimerGrid.length, TOTAL_TILES);
  assert.equal(hazard.propagationBuffer.length, TOTAL_TILES);
  assert.equal(hazard.activeMagmaIndices.length, 32);

  assert.ok(hazard.dangerMask instanceof Uint8Array);
  assert.ok(hazard.heatGrid instanceof Float32Array);
  assert.ok(hazard.intensityGrid instanceof Float32Array);
  assert.ok(hazard.obsidianTimerGrid instanceof Float32Array);
  assert.ok(hazard.propagationBuffer instanceof Float32Array);
  assert.ok(hazard.activeMagmaIndices instanceof Int16Array);
});

test('MagmaHazard [Euclidean Lattice Density]: Radius 3 lattice ball contains exactly 29 discrete tiles', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);

  const activeCount = hazard.getActiveMagmaCount();
  assert.equal(activeCount, 29, 'Radius 3 Euclidean lattice contains exactly 29 tiles');

  // Verify all 29 precomputed tiles satisfy dr^2 + dc^2 <= 9
  const indices = hazard.getActiveMagmaIndices();
  for (let i = 0; i < activeCount; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const dr = r - 6;
    const dc = c - 7;
    assert.ok(dr * dr + dc * dc <= MAGMA_RADIUS_TILES * MAGMA_RADIUS_TILES, `Tile (${r}, ${c}) within radius 3`);
  }
});

test('MagmaHazard [Safe Area Invariant]: Mathematical guarantee of safe area ratio >= 80% (observed 85.128%)', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const safeAreaRatio = hazard.calculateSafeAreaRatio();
  assert.ok(safeAreaRatio >= MIN_MAGMA_SAFE_AREA_RATIO, `Safe area ratio ${safeAreaRatio} >= ${MIN_MAGMA_SAFE_AREA_RATIO}`);

  // Exactly (195 - 29) / 195 = 166 / 195 = ~0.85128
  const expectedRatio = (TOTAL_TILES - 29) / TOTAL_TILES;
  assert.ok(Math.abs(safeAreaRatio - expectedRatio) < 1e-4, 'Safe area ratio matches analytical Euclidean derivation');
});

test('MagmaHazard [Zero-GC Scratch Containers]: All query methods return pre-allocated scratch objects by reference', () => {
  const hazard = new MagmaHazard();
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

  const impact1 = hazard.onBombBlastImpact(6, 7);
  const impact2 = hazard.onBombBlastImpact(6, 7);
  assert.strictEqual(impact1, impact2, 'onBombBlastImpact returns identical scratch instance by reference');
});

test('MagmaHazard [Math Defense]: Out-of-bounds, float, and NaN coordinate rejection', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();

  // Test non-finite coordinates
  assert.equal(hazard.isPointMolten(NaN, 100), false);
  assert.equal(hazard.isPointMolten(100, Infinity), false);
  assert.equal(hazard.isPointMolten(-50, -50), false);
  assert.equal(hazard.isPointMolten(9999, 9999), false);

  // Floating coordinates should not corrupt TypedArray lookups
  assert.equal(hazard.isTileMagma(NaN, 5), false);
  assert.equal(hazard.isTileMagma(5.8, 7.2), true); // integer truncation to (5, 7) within radius
  assert.equal(hazard.getTileHeat(NaN, NaN), 0);
  assert.equal(hazard.getTileDangerCode(Infinity, 0), MagmaDangerValue.SAFE);

  // Boundary clamping of setEpicenter
  hazard.setEpicenter(-10, -20);
  assert.equal(hazard.epicenterR, 1, 'Clamped to interior min row 1');
  assert.equal(hazard.epicenterC, 1, 'Clamped to interior min col 1');

  hazard.setEpicenter(100, 200);
  assert.equal(hazard.epicenterR, ROWS - 2, 'Clamped to interior max row');
  assert.equal(hazard.epicenterC, COLS - 2, 'Clamped to interior max col');
});
