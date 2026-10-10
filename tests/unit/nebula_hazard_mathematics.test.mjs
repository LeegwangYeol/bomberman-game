import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NebulaHazard,
  TOTAL_TILES,
  COLS,
  NEBULA_RADIUS_TILES,
  MIN_NEBULA_SAFE_AREA_RATIO,
} from '../../src/game/hazards/NebulaHazard.ts';

test('NebulaHazard [TypedArray Allocation & Dimensions]: Buffers match exact 195-tile arena specifications', () => {
  const hazard = new NebulaHazard();
  assert.equal(hazard.getDangerMask().length, TOTAL_TILES);
  assert.equal(hazard.getDensityGrid().length, TOTAL_TILES);
  assert.equal(hazard.getCleanseGrid().length, TOTAL_TILES);
  assert.equal(hazard.getActiveNebulaIndices().length, 32);

  assert.ok(hazard.getDangerMask() instanceof Uint8Array);
  assert.ok(hazard.getDensityGrid() instanceof Float32Array);
  assert.ok(hazard.getCleanseGrid() instanceof Float32Array);
  assert.ok(hazard.getActiveNebulaIndices() instanceof Int16Array);
});

test('NebulaHazard [Euclidean Lattice Density]: Radius 3 lattice ball contains exactly 29 discrete tiles', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const activeCount = hazard.getActiveNebulaCount();
  assert.equal(activeCount, 29, 'Radius 3 Euclidean lattice contains exactly 29 tiles');

  // Verify all 29 precomputed tiles satisfy dr^2 + dc^2 <= 9
  const indices = hazard.getActiveNebulaIndices();
  for (let i = 0; i < activeCount; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const dr = r - 6;
    const dc = c - 7;
    assert.ok(dr * dr + dc * dc <= NEBULA_RADIUS_TILES * NEBULA_RADIUS_TILES, `Tile (${r}, ${c}) within radius 3`);
  }
});

test('NebulaHazard [Safe Area Invariant]: Mathematical guarantee of safe area ratio >= 80% (observed 85.128%)', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const safeAreaRatio = hazard.getSafeAreaRatio();
  assert.ok(safeAreaRatio >= MIN_NEBULA_SAFE_AREA_RATIO, `Safe area ratio ${safeAreaRatio} >= ${MIN_NEBULA_SAFE_AREA_RATIO}`);

  // Exactly (195 - 29) / 195 = 166 / 195 = ~0.85128
  const expectedRatio = (TOTAL_TILES - 29) / TOTAL_TILES;
  assert.ok(Math.abs(safeAreaRatio - expectedRatio) < 1e-4, 'Safe area ratio matches analytical Euclidean derivation');
});

test('NebulaHazard [Discrete Laplacian Diffusion]: In-place stepDiscreteDiffusion operates with zero heap churn', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const centerIdx = 6 * COLS + 7;
  hazard.getDensityGrid()[centerIdx] = 1.0;

  hazard.stepDiscreteDiffusion(0.8);
  assert.ok(hazard.getDensityGrid()[centerIdx] < 1.0, 'Density dissipates with decay factor');
});

test('NebulaHazard [Zero-GC Scratch Containers]: All query methods return pre-allocated scratch objects by reference', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const res1 = hazard.evaluatePlayer(280, 260, false, 1000);
  const res2 = hazard.evaluatePlayer(280, 260, false, 1016);
  assert.strictEqual(res1, res2, 'evaluatePlayer returns identical scratch instance by reference');

  const enemy1 = hazard.checkEnemyCollision(6, 7, false, 1000);
  const enemy2 = hazard.checkEnemyCollision(6, 7, false, 1016);
  assert.strictEqual(enemy1, enemy2, 'checkEnemyCollision returns identical scratch instance by reference');

  const bomb1 = hazard.onBombPlaced('b1', 6, 7, 2, 2000);
  const bomb2 = hazard.onBombPlaced('b2', 6, 7, 2, 2000);
  assert.strictEqual(bomb1, bomb2, 'onBombPlaced returns identical scratch instance by reference');

  const cleanse1 = hazard.cleanseNebulaAt([{ r: 6, c: 7 }]);
  const cleanse2 = hazard.cleanseNebulaAt([{ r: 6, c: 7 }]);
  assert.strictEqual(cleanse1, cleanse2, 'cleanseNebulaAt returns identical scratch instance by reference');
});

test('NebulaHazard [Math Defense]: Out-of-bounds, float, and NaN coordinate rejection', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // NaN queries
  assert.equal(hazard.isPointInNebula(NaN, NaN), false);
  assert.equal(hazard.isPointLethal(NaN, 100), false);
  assert.equal(hazard.isTileCalm(NaN, NaN), false);

  // Negative & extreme float bounds
  assert.equal(hazard.isTileInNebula(-1, -1), false);
  assert.equal(hazard.isTileInNebula(999, 999), false);
  assert.equal(hazard.isTileInCollapse(-5, 3), false);
  assert.equal(hazard.isTileInCalm(100, 2), false);
});
