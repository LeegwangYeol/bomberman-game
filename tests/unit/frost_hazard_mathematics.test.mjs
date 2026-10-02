/**
 * tests/unit/frost_hazard_mathematics.test.mjs
 *
 * Mathematical Foundations & Core FSM Verification Suite for FrostHazard.ts:
 * 1. 1D TypedArray Memory Layout (Uint8Array dangerMask, Float32Array intensityGrid, Float32Array propagationBuffer)
 * 2. Discrete Lattice Frost Propagation & Discrete Laplacian Diffusion Operator
 * 3. Telegraph Sub-Phases: CRYSTALLIZATION -> CHILL_ACCUMULATION -> PERMAFROST_CRITICAL
 * 4. Zero-GC Scratch Vector & Container Recycling
 * 5. Mathematical Safe Area Guarantees (>= 40% mandate, >= 80% observed)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FrostHazard,
  FrostLifecycleState,
  FrostTelegraphPhase,
  DURATION_FLASH_FREEZE_MS,
  DEFAULT_FROST_COOLDOWN_MS,
  MIN_SAFE_AREA_RATIO,
  FROST_RADIUS_TILES,
  TOTAL_TILES,
} from '../../src/game/hazards/index.ts';
import { COLS } from '../../src/game/pathfinding.ts';

test('FrostHazard [Math & TypedArrays]: 1D TypedArray buffer allocation and invariants', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);

  // 1D TypedArray Danger Bitmask
  const dangerMask = hazard.getDangerMask();
  assert.ok(dangerMask instanceof Uint8Array, 'dangerMask must be a 1D Uint8Array');
  assert.equal(dangerMask.length, TOTAL_TILES, `dangerMask length must be exactly ${TOTAL_TILES}`);

  // 1D TypedArray Intensity Grid
  const intensityGrid = hazard.getIntensityGrid();
  assert.ok(intensityGrid instanceof Float32Array, 'intensityGrid must be a 1D Float32Array');
  assert.equal(intensityGrid.length, TOTAL_TILES, `intensityGrid length must be exactly ${TOTAL_TILES}`);

  // 1D TypedArray Propagation Double-Buffer
  assert.ok(hazard.propagationBuffer instanceof Float32Array, 'propagationBuffer must be Float32Array');
  assert.equal(hazard.propagationBuffer.length, TOTAL_TILES);

  // 1D TypedArray Friction and Temperature Grids
  assert.ok(hazard.getFrictionGrid() instanceof Float32Array);
  assert.equal(hazard.getFrictionGrid().length, TOTAL_TILES);
  assert.ok(hazard.getTemperatureGrid() instanceof Float32Array);
  assert.equal(hazard.getTemperatureGrid().length, TOTAL_TILES);
});

test('FrostHazard [Core FSM & Telegraph Progression]: Deterministic transitions CRYSTALLIZATION -> CHILL_ACCUMULATION -> PERMAFROST_CRITICAL', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.DORMANT);
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.NONE);

  // Start Outbreak
  hazard.start('OUTBREAK');
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.HOARFROST_SURGE);

  // 1. CRYSTALLIZATION Phase (0ms - 1000ms)
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.CRYSTALLIZATION);
  hazard.update(500);
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.CRYSTALLIZATION);

  // 2. CHILL_ACCUMULATION Phase (1000ms - 1600ms)
  hazard.update(500); // 1000ms elapsed
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.CHILL_ACCUMULATION);
  hazard.update(300); // 1300ms elapsed
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.CHILL_ACCUMULATION);

  // 3. PERMAFROST_CRITICAL Phase (1600ms - 2000ms)
  hazard.update(300); // 1600ms elapsed
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.PERMAFROST_CRITICAL);
  hazard.update(399); // 1999ms elapsed
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.PERMAFROST_CRITICAL);

  // 4. Flash Freeze Active Burst (2000ms -> 2350ms)
  hazard.update(1); // 2000ms reached
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.ABSOLUTE_ZERO_BURST);
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.NONE);

  // 5. Thaw Cooldown
  hazard.update(DURATION_FLASH_FREEZE_MS);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.THAW_COOLDOWN);
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.NONE);

  // 6. Loop back to Telegraph Surge
  hazard.update(DEFAULT_FROST_COOLDOWN_MS);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.HOARFROST_SURGE);
  assert.equal(hazard.getTelegraphPhase(), FrostTelegraphPhase.CRYSTALLIZATION);
});

test('FrostHazard [Discrete Lattice Frost Propagation]: Euclidean closed ball lattice math and radial falloff', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Verify discrete lattice closed ball formula: dr^2 + dc^2 <= R^2 (R=3)
  const activeCount = hazard.getActiveFrostCount();
  assert.equal(activeCount, 29, 'Euclidean closed ball (dr^2 + dc^2 <= 9) on 2D grid must contain exactly 29 lattice tiles');

  const activeIndices = hazard.getActiveFrostIndices();
  for (let i = 0; i < activeCount; i++) {
    const idx = activeIndices[i];
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;
    const dr = r - 6;
    const dc = c - 7;
    assert.ok(dr * dr + dc * dc <= 9, `Tile (${r}, ${c}) must satisfy dr^2 + dc^2 <= 9`);
    assert.ok(hazard.isTileGlaciated(r, c), `Tile (${r}, ${c}) must be glaciated`);

    // Verify continuous intensity grid falloff: I = (R - dist) / R
    const dist = Math.hypot(dr, dc);
    const expectedIntensity = Math.max(0, (FROST_RADIUS_TILES - dist) / FROST_RADIUS_TILES);
    assert.ok(
      Math.abs(hazard.getIntensityGrid()[idx] - expectedIntensity) < 0.001,
      `Intensity at (${r}, ${c}) must match linear radial falloff`
    );
  }

  // Tiles outside radius 3 must have 0 intensity
  assert.equal(hazard.getIntensityGrid()[0], 0);
  assert.equal(hazard.isTileGlaciated(0, 0), false);
});

test('FrostHazard [Discrete Laplacian Diffusion]: stepDiscreteDiffusion operates in-place without heap allocations', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const initialCenterIntensity = hazard.getIntensityGrid()[6 * COLS + 7];
  assert.equal(initialCenterIntensity, 1.0, 'Center tile must have maximum intensity 1.0');

  // Step discrete diffusion
  hazard.stepDiscreteDiffusion(0.05);

  const newCenterIntensity = hazard.getIntensityGrid()[6 * COLS + 7];
  assert.ok(newCenterIntensity < 1.0, 'Center tile should diffuse thermal deficit to neighbors');
  assert.ok(newCenterIntensity > 0.0, 'Center tile should retain non-zero intensity');

  // Verify all tiles are bounded within [0.0, 1.0]
  for (let i = 0; i < TOTAL_TILES; i++) {
    const val = hazard.getIntensityGrid()[i];
    assert.ok(val >= 0.0 && val <= 1.0, `Tile ${i} intensity must be in [0, 1]`);
  }
});

test('FrostHazard [Zero-GC Scratch Reuse]: All query methods recycle pre-allocated containers by reference', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');
  hazard.update(2000); // Enter ABSOLUTE_ZERO_BURST

  // Player query
  const p1 = hazard.evaluatePlayer(300, 260, false, 2000);
  const p2 = hazard.evaluatePlayer(100, 100, false, 2000);
  assert.strictEqual(p1, p2, 'evaluatePlayer must recycle scratchPlayerResult');

  // Enemy query
  const e1 = hazard.evaluateEnemy(300, 260, false, 1000);
  const e2 = hazard.evaluateEnemy(100, 100, false, 1000);
  assert.strictEqual(e1, e2, 'evaluateEnemy must recycle scratchEnemyResult');

  // Friction query
  const f1 = hazard.evaluateFriction(300, 260);
  const f2 = hazard.evaluateFriction(100, 100);
  assert.strictEqual(f1, f2, 'evaluateFriction must recycle scratchFrictionResult');

  // Bomb query
  const b1 = hazard.evaluateBomb('b1', 6, 7, 3000, 0);
  const b2 = hazard.evaluateBomb('b2', 1, 1, 3000, 0);
  assert.strictEqual(b1, b2, 'evaluateBomb must recycle scratchBombEvalResult');

  // Bomb placed query
  const bp1 = hazard.onBombPlaced('bp1', 6, 7, 3000);
  const bp2 = hazard.onBombPlaced('bp2', 1, 1, 3000);
  assert.strictEqual(bp1, bp2, 'onBombPlaced must recycle scratchBombPlacedResult');

  // Bomb detonation query
  const bd1 = hazard.onBombDetonated('bd1', 6, 7, 3);
  const bd2 = hazard.onBombDetonated('bd2', 1, 1, 3);
  assert.strictEqual(bd1, bd2, 'onBombDetonated must recycle scratchBombDetonationResult');
});

test('FrostHazard [Safe Area Invariant]: Mathematical guarantee of safe area ratio >= 40% (observed 85.128%)', () => {
  const hazard = new FrostHazard();
  hazard.init(6, 7);

  // In DORMANT
  assert.equal(hazard.getSafeAreaRatio(), 1.0);

  // In HOARFROST_SURGE
  hazard.start('OUTBREAK');
  assert.equal(hazard.getSafeAreaRatio(), (195 - 29) / 195);
  assert.ok(hazard.getSafeAreaRatio() >= MIN_SAFE_AREA_RATIO);
  assert.ok(hazard.getSafeAreaRatio() >= 0.85);

  // In ABSOLUTE_ZERO_BURST
  hazard.update(2000);
  assert.equal(hazard.getSafeAreaRatio(), (195 - 29) / 195);
  assert.ok(hazard.getSafeAreaRatio() >= MIN_SAFE_AREA_RATIO);

  // In THAW_COOLDOWN
  hazard.update(350);
  assert.equal(hazard.getSafeAreaRatio(), 1.0);
});
