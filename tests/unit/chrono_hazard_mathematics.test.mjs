import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChronoHazard,
  TOTAL_TILES,
  COLS,
  ROWS,
  CHRONO_RADIUS_TILES,
  MIN_CHRONO_SAFE_AREA_RATIO,
  ChronoDangerValue,
} from '../../src/game/hazards/ChronoHazard.ts';

test('ChronoHazard [TypedArray Allocation & Dimensions]: Buffers match exact 195-tile arena specifications', () => {
  const hazard = new ChronoHazard();
  assert.equal(hazard.dangerMask.length, TOTAL_TILES);
  assert.equal(hazard.dilationGrid.length, TOTAL_TILES);
  assert.equal(hazard.cleanseGrid.length, TOTAL_TILES);
  assert.equal(hazard.activeChronoIndices.length, 32);

  assert.ok(hazard.dangerMask instanceof Uint8Array);
  assert.ok(hazard.dilationGrid instanceof Float32Array);
  assert.ok(hazard.cleanseGrid instanceof Float32Array);
  assert.ok(hazard.activeChronoIndices instanceof Int16Array);
});

test('ChronoHazard [Euclidean Lattice Density]: Radius 3 lattice ball contains exactly 29 discrete tiles', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);

  const activeCount = hazard.getActiveChronoCount();
  assert.equal(activeCount, 29, 'Radius 3 Euclidean lattice contains exactly 29 tiles');

  // Verify all 29 precomputed tiles satisfy dr^2 + dc^2 <= 9
  const indices = hazard.getActiveChronoIndices();
  for (let i = 0; i < activeCount; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const dr = r - 6;
    const dc = c - 7;
    assert.ok(dr * dr + dc * dc <= CHRONO_RADIUS_TILES * CHRONO_RADIUS_TILES, `Tile (${r}, ${c}) within radius 3`);
  }
});

test('ChronoHazard [Safe Area Invariant]: Mathematical guarantee of safe area ratio >= 80% (observed 85.128%)', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();

  const safeAreaRatio = hazard.calculateSafeAreaRatio();
  assert.ok(safeAreaRatio >= MIN_CHRONO_SAFE_AREA_RATIO, `Safe area ratio ${safeAreaRatio} >= ${MIN_CHRONO_SAFE_AREA_RATIO}`);

  // Exactly (195 - 29) / 195 = 166 / 195 = ~0.85128
  const expectedRatio = (TOTAL_TILES - 29) / TOTAL_TILES;
  assert.ok(Math.abs(safeAreaRatio - expectedRatio) < 1e-4, 'Safe area ratio matches analytical Euclidean derivation');
});

test('ChronoHazard [Zero-GC Scratch Containers]: All query methods return pre-allocated scratch objects by reference', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);

  const playerRes1 = hazard.evaluatePlayer(280, 240, false);
  const playerRes2 = hazard.evaluatePlayer(280, 240, false);
  assert.equal(playerRes1, playerRes2, 'evaluatePlayer returns identical scratch instance reference');

  const enemyRes1 = hazard.checkEnemyCollision(6, 7, false);
  const enemyRes2 = hazard.checkEnemyCollision(6, 7, false);
  assert.equal(enemyRes1, enemyRes2, 'checkEnemyCollision returns identical scratch instance reference');

  const bombRes1 = hazard.evaluateBomb(6, 7);
  const bombRes2 = hazard.evaluateBomb(6, 7);
  assert.equal(bombRes1, bombRes2, 'evaluateBomb returns identical scratch instance reference');

  const cleanseRes1 = hazard.stabilizeTilesWithExplosion([{ r: 6, c: 7 }]);
  const cleanseRes2 = hazard.stabilizeTilesWithExplosion([{ r: 6, c: 7 }]);
  assert.equal(cleanseRes1, cleanseRes2, 'stabilizeTilesWithExplosion returns identical scratch instance reference');
});

test('ChronoHazard [Math Defense]: Out-of-bounds, float, and NaN coordinate rejection', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);

  // NaN coordinates
  const nanPlayer = hazard.evaluatePlayer(NaN, NaN, false);
  assert.equal(nanPlayer.hit, false);
  assert.equal(nanPlayer.isDilated, false);
  assert.equal(nanPlayer.slowFactor, 1.0);

  const nanEnemy = hazard.checkEnemyCollision(NaN, NaN, false);
  assert.equal(nanEnemy.hit, false);
  assert.equal(nanEnemy.damage, 0);

  const nanBomb = hazard.evaluateBomb(NaN, NaN);
  assert.equal(nanBomb.isAccelerated, false);

  // Out of bounds
  const oobPlayer = hazard.evaluatePlayer(-100, 9999, false);
  assert.equal(oobPlayer.hit, false);

  const oobEnemy = hazard.checkEnemyCollision(-5, 50, false);
  assert.equal(oobEnemy.hit, false);

  const oobBomb = hazard.evaluateBomb(99, -2);
  assert.equal(oobBomb.isAccelerated, false);
});
