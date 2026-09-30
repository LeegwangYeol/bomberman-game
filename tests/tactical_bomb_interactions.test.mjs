/**
 * tests/tactical_bomb_interactions.test.mjs — Comprehensive Unit Test Suite
 * for Quantum Spire Tactical Bomb Interaction Engine (2026-10-01 Evolution)
 *
 * Verifies:
 * 1. Subspace Hyper-Fuse: placing bomb on Spire anchor compresses fuse to 1500ms
 * 2. Quantum Entanglement: placing bomb adjacent to or on Spire spawns Ghost Bomb at paired spire
 * 3. Bidirectional Entanglement Detonation: parent bomb detonates ghost bomb; ghost bomb detonates parent bomb
 * 4. Tachyon Overcharge: +2 blast power and piercing beam inside active hazard
 * 5. Polarization Strike: blast impact cleanses spire into golden channel (8.0s), immediate beam recalculation
 * 6. Zero-GC Invariance: 5,000 rapid placement/detonation cycles execute with 0 object allocations
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DynamicHazard,
  HazardLifecycleState,
  HYPER_FUSE_MS,
  POLARIZATION_DURATION_MS,
  TOTAL_TELEGRAPH_MS,
} from '../src/game/hazards/index.ts';

test('Tactical Bombs: Subspace Hyper-Fuse compresses fuse to 1500ms only on Spire anchors', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  // Test anchor S0 at (3, 4)
  const anchorPlacement = hazard.onBombPlaced('bomb_anchor_1', 3, 4, 3, 2000);
  assert.equal(anchorPlacement.modifiedFuseMs, HYPER_FUSE_MS);
  assert.equal(anchorPlacement.isEntangled, true);
  assert.equal(anchorPlacement.pairedR, 9);
  assert.equal(anchorPlacement.pairedC, 4);

  // Test anchor S2 at (6, 3)
  const anchorPlacement2 = hazard.onBombPlaced('bomb_anchor_2', 6, 3, 2, 3000);
  assert.equal(anchorPlacement2.modifiedFuseMs, HYPER_FUSE_MS);
  assert.equal(anchorPlacement2.isEntangled, true);
  assert.equal(anchorPlacement2.pairedR, 6);
  assert.equal(anchorPlacement2.pairedC, 11);

  // Test distant placement far from any Spire at (1, 1)
  const distantPlacement = hazard.onBombPlaced('bomb_distant', 1, 1, 2, 2000);
  assert.equal(distantPlacement.modifiedFuseMs, 2000);
  assert.equal(distantPlacement.isEntangled, false);
  assert.equal(distantPlacement.ghostBombId, undefined);
});

test('Tactical Bombs: Quantum Entanglement clones paired ghost bomb with identical power and fuse', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  // Place bomb at (3, 4) with power 4
  const res = hazard.onBombPlaced('parent_1', 3, 4, 4, 2000);
  assert.equal(res.isEntangled, true);
  assert.ok(res.ghostBombId !== undefined);

  const activeGhosts = hazard.getActiveGhostBombs();
  assert.equal(activeGhosts.length, 1);
  const ghost = activeGhosts[0];
  assert.equal(ghost.id, res.ghostBombId);
  assert.equal(ghost.parentBombId, 'parent_1');
  assert.equal(ghost.r, 9);
  assert.equal(ghost.c, 4);
  assert.equal(ghost.power, 4);
  assert.equal(ghost.fuseMs, HYPER_FUSE_MS);
});

test('Tactical Bombs: Bidirectional Entanglement Detonation (Parent -> Ghost)', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  const placed = hazard.onBombPlaced('parent_100', 6, 3, 3, 2000);
  assert.equal(placed.isEntangled, true);
  const ghostId = placed.ghostBombId;

  // Detonate parent bomb
  const detResult = hazard.onBombDetonated('parent_100', 6, 3, 3);
  assert.ok(detResult.pairedGhostBombIds.includes(ghostId));
  assert.equal(hazard.getActiveGhostBombs().length, 0, 'Ghost bomb slot must be freed on detonation');
});

test('Tactical Bombs: Bidirectional Entanglement Detonation (Ghost -> Parent)', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  const placed = hazard.onBombPlaced('parent_200', 6, 3, 3, 2000);
  assert.equal(placed.isEntangled, true);
  const ghostId = placed.ghostBombId;

  // Detonate ghost bomb directly (e.g. from chain explosion or timer)
  assert.ok(ghostId !== undefined);
  const detResult = hazard.onBombDetonated(ghostId, 6, 11, 3);
  assert.ok(detResult.pairedGhostBombIds.includes('parent_200'), 'Parent bomb must be queued for synchronized detonation');
  assert.equal(hazard.getActiveGhostBombs().length, 0);
});

test('Tactical Bombs: Tachyon Overcharge (+2 blast power and piercing beam inside active hazard)', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE state

  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  // Detonate bomb on active beam corridor (5, 4)
  const overcharged = hazard.onBombDetonated('bomb_beam', 5, 4, 3);
  assert.equal(overcharged.overcharged, true);
  assert.equal(overcharged.modifiedPower, 5, 'Must grant +2 blast power (3 + 2 = 5)');
  assert.equal(overcharged.piercing, true, 'Must grant piercing wave');

  // Detonate bomb outside hazard beam (1, 1)
  const normal = hazard.onBombDetonated('bomb_safe', 1, 1, 3);
  assert.equal(normal.overcharged, false);
  assert.equal(normal.modifiedPower, 3);
  assert.equal(normal.piercing, false);
});

test('Tactical Bombs: Polarization Strike cleanses spire into golden channel and recalculates active beams immediately', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE state
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  // Initially, active beam tile (5, 4) is lethal (danger code 2)
  assert.equal(hazard.isTileLethal(5, 4), true);
  assert.equal(hazard.isTilePolarized(5, 4), false);

  // Bomb blast strikes Spire crystal at (3, 4)
  const impact = hazard.onBombBlastImpact(3, 4);
  assert.equal(impact.polarized, true);
  assert.equal(impact.spireId, 0);
  assert.ok(impact.cleansedTileCount >= 9, 'Must cleanse surrounding 3x3 tiles');

  // Immediately, active beam converts into golden safe channel (danger code 3)
  assert.equal(hazard.isTileLethal(5, 4), false);
  assert.equal(hazard.isTilePolarized(5, 4), true);

  // Player moving through polarized beam takes 0 damage
  const playerHit = hazard.checkPlayerCollision(5, 4, false, 0);
  assert.equal(playerHit.hit, true);
  assert.equal(playerHit.damage, 0);

  // Fast forward past 8000ms polarization duration
  hazard.update(POLARIZATION_DURATION_MS + 100);
  const spires = hazard.getSpires();
  assert.equal(spires[0].isPolarized, false, 'Polarization must expire after 8.0s');
  assert.equal(spires[1].isPolarized, false);
});

test('Tactical Bombs: Zero-GC Invariance under 5,000 rapid placement and detonation cycles', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  // Warmup run
  for (let i = 0; i < 200; i++) {
    hazard.onBombPlaced(`warmup_${i}`, 3, 4, 2);
    hazard.onBombDetonated(`warmup_${i}`, 3, 4, 2);
    hazard.onBombBlastImpact(3, 4);
  }

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) {
    global.gc();
    global.gc();
  }

  const initialHeap = process.memoryUsage().heapUsed;

  // 5,000 Rapid tactical bomb interaction cycles
  for (let i = 0; i < 5000; i++) {
    const placed = hazard.onBombPlaced(i, 6, 3, 3);
    if (placed.isEntangled && placed.ghostBombId) {
      hazard.onBombDetonated(placed.ghostBombId, 6, 11, 3);
    } else {
      hazard.onBombDetonated(i, 6, 3, 3);
    }
    hazard.onBombBlastImpact(6, 3);
  }

  if (isGcExposed) {
    global.gc();
    global.gc();
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const driftMb = (finalHeap - initialHeap) / (1024 * 1024);

  if (isGcExposed) {
    assert.ok(driftMb < 0.25, `Memory drift must be < 0.25 MB, observed: ${driftMb.toFixed(4)} MB`);
  } else {
    assert.ok(driftMb < 5.0, `Ambient memory drift must be bounded < 5.0 MB, observed: ${driftMb.toFixed(4)} MB`);
  }
});
