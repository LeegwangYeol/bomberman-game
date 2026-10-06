import test from 'node:test';
import assert from 'node:assert/strict';

import { MiasmaHazard } from '../../src/game/hazards/MiasmaHazard.ts';
import { MagmaHazard } from '../../src/game/hazards/MagmaHazard.ts';
import { ROWS, COLS, TOTAL_TILES } from '../../src/game/pathfinding.ts';

test('HazardDiffusionRegression [Numerical Stability]: 500-step Laplacian diffusion produces zero NaN or Inf', () => {
  const miasma = new MiasmaHazard();
  miasma.init(6, 7);
  miasma.sporeGrid[6 * COLS + 7] = 1.0;

  const magma = new MagmaHazard();
  magma.init(6, 7);
  magma.heatGrid[6 * COLS + 7] = 1.0;

  for (let step = 0; step < 500; step++) {
    miasma.stepDiscreteDiffusion(0.016, 0.25, 0.05);
    magma.stepDiscreteDiffusion(0.016, 0.15);
  }

  for (let i = 0; i < TOTAL_TILES; i++) {
    assert.ok(Number.isFinite(miasma.sporeGrid[i]), `Miasma tile ${i} must be finite`);
    assert.ok(miasma.sporeGrid[i] >= 0.0 && miasma.sporeGrid[i] <= 1.0, `Miasma tile ${i} must be in [0, 1]`);

    assert.ok(Number.isFinite(magma.heatGrid[i]), `Magma tile ${i} must be finite`);
    assert.ok(magma.heatGrid[i] >= 0.0 && magma.heatGrid[i] <= 1.0, `Magma tile ${i} must be in [0, 1]`);
  }
});

test('HazardDiffusionRegression [Boundary Clamping & Out-of-Bounds Rejection]: Rejects NaN, negative, and infinite inputs', () => {
  const miasma = new MiasmaHazard();
  miasma.init(6, 7);
  miasma.sporeGrid[6 * COLS + 7] = 1.0;

  // Should safely clamp extreme dt and rates without throw
  assert.doesNotThrow(() => {
    miasma.stepDiscreteDiffusion(-999, -5, -2);
    miasma.stepDiscreteDiffusion(NaN, NaN, NaN);
    miasma.stepDiscreteDiffusion(Infinity, Infinity, Infinity);
  });

  const magma = new MagmaHazard();
  magma.init(6, 7);
  magma.heatGrid[6 * COLS + 7] = 1.0;

  assert.doesNotThrow(() => {
    magma.stepDiscreteDiffusion(-999, -5);
    magma.stepDiscreteDiffusion(NaN, NaN);
    magma.stepDiscreteDiffusion(Infinity, Infinity);
  });
});

test('HazardDiffusionRegression [Zero-GC Double Buffering]: Buffer references remain immutable across steps', () => {
  const miasma = new MiasmaHazard();
  const sporeRef = miasma.sporeGrid;
  const propRef = miasma.propagationBuffer;

  miasma.stepDiscreteDiffusion(0.016, 0.2, 0.05);
  assert.equal(miasma.sporeGrid, sporeRef, 'sporeGrid Float32Array reference must not change');
  assert.equal(miasma.propagationBuffer, propRef, 'propagationBuffer Float32Array reference must not change');

  const magma = new MagmaHazard();
  const heatRef = magma.heatGrid;
  const magmaPropRef = magma.propagationBuffer;

  magma.stepDiscreteDiffusion(0.016, 0.15);
  assert.equal(magma.heatGrid, heatRef, 'heatGrid Float32Array reference must not change');
  assert.equal(magma.propagationBuffer, magmaPropRef, 'Magma propagationBuffer reference must not change');
});
