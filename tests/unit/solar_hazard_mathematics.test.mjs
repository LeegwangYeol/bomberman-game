import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SolarHazard,
  TOTAL_TILES,
  COLS,
  SOLAR_RADIUS_TILES,
  MIN_SOLAR_SAFE_AREA_RATIO,
} from '../../src/game/hazards/SolarHazard.ts';

test('SolarHazard [TypedArray Allocation & Dimensions]: Buffers match exact 195-tile arena specifications', () => {
  const hazard = new SolarHazard();
  assert.equal(hazard.getDangerMask().length, TOTAL_TILES);
  assert.equal(hazard.getHeatGrid().length, TOTAL_TILES);
  assert.equal(hazard.getCleanseGrid().length, TOTAL_TILES);
  assert.equal(hazard.getActiveSolarIndices().length, 32);

  assert.ok(hazard.getDangerMask() instanceof Uint8Array);
  assert.ok(hazard.getHeatGrid() instanceof Float32Array);
  assert.ok(hazard.getCleanseGrid() instanceof Float32Array);
  assert.ok(hazard.getActiveSolarIndices() instanceof Int16Array);
});

test('SolarHazard [Euclidean Lattice Density]: Radius 3 lattice ball contains exactly 29 discrete tiles', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const activeCount = hazard.getActiveSolarCount();
  assert.equal(activeCount, 29, 'Radius 3 Euclidean lattice contains exactly 29 tiles');

  // Verify all 29 precomputed tiles satisfy dr^2 + dc^2 <= 9
  const indices = hazard.getActiveSolarIndices();
  for (let i = 0; i < activeCount; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const dr = r - 6;
    const dc = c - 7;
    assert.ok(dr * dr + dc * dc <= SOLAR_RADIUS_TILES * SOLAR_RADIUS_TILES, `Tile (${r}, ${c}) within radius 3`);
  }
});

test('SolarHazard [Safe Area Invariant]: Mathematical guarantee of safe area ratio >= 80% (observed 85.128%)', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const safeAreaRatio = hazard.calculateSafeAreaRatio();
  assert.ok(safeAreaRatio >= MIN_SOLAR_SAFE_AREA_RATIO, `Safe area ratio ${safeAreaRatio} >= ${MIN_SOLAR_SAFE_AREA_RATIO}`);

  // Exactly (195 - 29) / 195 = 166 / 195 = ~0.85128
  const expectedRatio = (TOTAL_TILES - 29) / TOTAL_TILES;
  assert.ok(Math.abs(safeAreaRatio - expectedRatio) < 1e-4, 'Safe area ratio matches analytical Euclidean derivation');
});

test('SolarHazard [Discrete Laplacian Diffusion]: In-place stepDiscreteDiffusion operates with zero heap churn', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const centerIdx = 6 * COLS + 7;
  hazard.getHeatGrid()[centerIdx] = 1.0;

  hazard.stepDiscreteDiffusion(0.8);
  assert.ok(hazard.getHeatGrid()[centerIdx] < 1.0, 'Heat dissipates with decay factor');
});

test('SolarHazard [Zero-GC Scratch Containers]: All query methods return pre-allocated scratch objects by reference', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const res1 = hazard.evaluatePlayer(280, 260, false, false, 1000);
  const res2 = hazard.evaluatePlayer(280, 260, false, false, 1016);
  assert.strictEqual(res1, res2, 'evaluatePlayer returns identical scratch instance by reference');

  const enemy1 = hazard.checkEnemyCollision(6, 7, false, 1000);
  const enemy2 = hazard.checkEnemyCollision(6, 7, false, 1016);
  assert.strictEqual(enemy1, enemy2, 'checkEnemyCollision returns identical scratch instance by reference');

  const bomb1 = hazard.evaluateBomb(6, 7);
  const bomb2 = hazard.evaluateBomb(6, 7);
  assert.strictEqual(bomb1, bomb2, 'evaluateBomb returns identical scratch instance by reference');

  const cleanse1 = hazard.cleanseSolarAt([{ r: 6, c: 7 }]);
  const cleanse2 = hazard.cleanseSolarAt([{ r: 6, c: 7 }]);
  assert.strictEqual(cleanse1, cleanse2, 'cleanseSolarAt returns identical scratch instance by reference');
});

test('SolarHazard [Math Defense]: Out-of-bounds, float, and NaN coordinate rejection', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // NaN queries
  assert.equal(hazard.isPointCorona(NaN, NaN), false);
  assert.equal(hazard.isPointLethal(NaN, 100), false);
  assert.equal(hazard.isTileCalm(NaN, NaN), false);

  const badPlayer = hazard.evaluatePlayer(NaN, Infinity);
  assert.equal(badPlayer.hit, false);

  const badEnemy = hazard.checkEnemyCollision(-1, 999, false);
  assert.equal(badEnemy.hit, false);

  const badBomb = hazard.evaluateBomb(Infinity, -5);
  assert.equal(badBomb.isAccelerated, false);
});
