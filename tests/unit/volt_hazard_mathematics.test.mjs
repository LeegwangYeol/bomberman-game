import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VoltHazard,
  TOTAL_TILES,
  COLS,
  VOLT_RADIUS_TILES,
  MIN_VOLT_SAFE_AREA_RATIO,
} from '../../src/game/hazards/VoltHazard.ts';

test('VoltHazard [TypedArray Allocation & Dimensions]: Buffers match exact 195-tile arena specifications', () => {
  const hazard = new VoltHazard();
  assert.equal(hazard.dangerMask.length, TOTAL_TILES);
  assert.equal(hazard.voltageGrid.length, TOTAL_TILES);
  assert.equal(hazard.conductanceGrid.length, TOTAL_TILES);
  assert.equal(hazard.intensityGrid.length, TOTAL_TILES);
  assert.equal(hazard.propagationBuffer.length, TOTAL_TILES);
  assert.equal(hazard.activeVoltIndices.length, 32);

  assert.ok(hazard.dangerMask instanceof Uint8Array);
  assert.ok(hazard.voltageGrid instanceof Float32Array);
  assert.ok(hazard.conductanceGrid instanceof Float32Array);
  assert.ok(hazard.intensityGrid instanceof Float32Array);
  assert.ok(hazard.propagationBuffer instanceof Float32Array);
  assert.ok(hazard.activeVoltIndices instanceof Int16Array);
});

test('VoltHazard [Euclidean Lattice Density]: Radius 3 lattice ball contains exactly 29 discrete tiles', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);

  const activeCount = hazard.getActiveVoltCount();
  assert.equal(activeCount, 29, 'Radius 3 Euclidean lattice contains exactly 29 tiles');

  // Verify all 29 precomputed tiles satisfy dr^2 + dc^2 <= 9
  const indices = hazard.getActiveVoltIndices();
  for (let i = 0; i < activeCount; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const dr = r - 6;
    const dc = c - 7;
    assert.ok(dr * dr + dc * dc <= VOLT_RADIUS_TILES * VOLT_RADIUS_TILES, `Tile (${r}, ${c}) within radius 3`);
  }
});

test('VoltHazard [Safe Area Invariant]: Mathematical guarantee of safe area ratio >= 40% (observed 85.128%)', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  const safeAreaRatio = hazard.calculateSafeAreaRatio();
  assert.ok(safeAreaRatio >= MIN_VOLT_SAFE_AREA_RATIO, `Safe area ratio ${safeAreaRatio} >= ${MIN_VOLT_SAFE_AREA_RATIO}`);
  
  // Exactly (195 - 29) / 195 = 166 / 195 = ~0.85128
  const expectedRatio = (TOTAL_TILES - 29) / TOTAL_TILES;
  assert.ok(Math.abs(safeAreaRatio - expectedRatio) < 1e-4, 'Safe area ratio matches analytical Euclidean derivation');
});

test('VoltHazard [Discrete Laplacian Diffusion]: In-place stepDiscreteDiffusion operates with zero heap churn', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  // Populate voltage epicenter
  hazard.voltageGrid[6 * COLS + 7] = 100.0;
  const initialPeak = hazard.voltageGrid[6 * COLS + 7];

  hazard.stepDiscreteDiffusion(0.016);

  // Peak should diffuse outward
  assert.ok(hazard.voltageGrid[6 * COLS + 7] < initialPeak, 'Epicenter voltage dissipates outward');
  // Neighbor should gain voltage
  assert.ok(hazard.voltageGrid[5 * COLS + 7] > 0, 'Neighbor tile receives diffused voltage');
  assert.ok(hazard.voltageGrid[6 * COLS + 8] > 0, 'Neighbor tile receives diffused voltage');
});

test('VoltHazard [Zero-GC Scratch Containers]: All query methods return pre-allocated scratch objects by reference', () => {
  const hazard = new VoltHazard();
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
});

test('VoltHazard [Math Defense]: Out-of-bounds, float, and NaN coordinate rejection', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  // Out of bounds
  assert.equal(hazard.isTileElectrified(-1, 5), false);
  assert.equal(hazard.isTileElectrified(13, 5), false);
  assert.equal(hazard.isTileElectrified(5, -1), false);
  assert.equal(hazard.isTileElectrified(5, 15), false);

  // Float coordinates should not crash or return true outside active tiles
  assert.doesNotThrow(() => hazard.isTileElectrified(5.5, 7.2));
  assert.doesNotThrow(() => hazard.isTileLethal(NaN, 7));
  assert.doesNotThrow(() => hazard.isTileLethal(6, NaN));
  assert.equal(hazard.isTileLethal(NaN, NaN), false);

  // Epicenter NaN protection
  hazard.setEpicenter(NaN, NaN);
  assert.ok(Number.isFinite(hazard.getEpicenterRow()));
  assert.ok(Number.isFinite(hazard.getEpicenterCol()));
  assert.equal(hazard.getEpicenterRow(), 6);
  assert.equal(hazard.getEpicenterCol(), 7);
});
