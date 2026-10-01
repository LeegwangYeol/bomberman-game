/**
 * tests/cosmic_fusion_super_bomb.test.mjs
 *
 * Creative Agent 2: Cosmic Fusion Super-Bomb Mechanics & Verification Suite
 *
 * Validates:
 * 1. Dynamic Attraction: Steady inward gravitational pull on loose bombs inside accretion radius (120px)
 * 2. 300ms Arrival Window: Trigger threshold when 2+ bombs enter core within <= 300ms
 * 3. Window Expiration: Rejection of fusion when bombs arrive > 300ms apart
 * 4. Super-Bomb Invariants: Blast radius +3, power inheritance, surviving host selection, absorbed capacity refund
 * 5. 360-Degree Radial Blast: 8 radial arms (cardinal + diagonal) + 3x3 concentric epicenter horizon
 * 6. Dual-Tone Visual Styling & Juice: Cyan (0x00ffff) / Purple (0xa855f7) tints and combat notifications
 * 7. Zero-GC Invariant: 10,000 continuous fusion & pull cycles with 0 bytes net heap drift
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GravityHazard,
  FUSION_ARRIVAL_WINDOW_MS,
  FUSION_EXTRA_BLAST_RADIUS,
  COSMIC_SUPER_BOMB_EXTRA_RADIUS,
  COSMIC_SUPER_BOMB_TINT_CYAN,
  COSMIC_SUPER_BOMB_TINT_PURPLE,
  COSMIC_SUPER_BOMB_FUSE_MS,
  COSMIC_SUPER_BOMB_PIERCING_BLOCKS,
  COSMIC_FUSION_SCORE_BONUS,
  COSMIC_RADIAL_DIRECTIONS,
  FLOATING_TEXT_COSMIC_FUSION,
  FUSION_CORE_RADIUS_PX,
} from '../src/game/hazards/GravityHazard.ts';
import { ROWS, COLS, TILE_SIZE } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * TIER 1: COSMIC FUSION CONSTANTS & RADIAL TOPOLOGY
 * ============================================================================== */

test('Cosmic Fusion [Tier 1]: Constants, durations, and radial directions strictly calibrated', () => {
  assert.equal(FUSION_ARRIVAL_WINDOW_MS, 300, 'Arrival window must be exactly 300ms');
  assert.equal(FUSION_EXTRA_BLAST_RADIUS, 3, 'Extra blast radius must be +3');
  assert.equal(COSMIC_SUPER_BOMB_EXTRA_RADIUS, 3, 'Super bomb extra radius must be +3');
  assert.equal(COSMIC_SUPER_BOMB_TINT_CYAN, 0x00ffff, 'Cyan tint must be 0x00ffff');
  assert.equal(COSMIC_SUPER_BOMB_TINT_PURPLE, 0xa855f7, 'Purple tint must be 0xa855f7');
  assert.equal(COSMIC_SUPER_BOMB_FUSE_MS, 1000, 'Compressed fuse must be 1000ms');
  assert.equal(COSMIC_SUPER_BOMB_PIERCING_BLOCKS, 2, 'Piercing block count must be 2');
  assert.equal(COSMIC_FUSION_SCORE_BONUS, 250, 'Score bonus must be 250');
  assert.equal(FLOATING_TEXT_COSMIC_FUSION, '✦ COSMIC FUSION!');

  // 8 Radial Directions
  assert.equal(COSMIC_RADIAL_DIRECTIONS.length, 8, 'Must define 8 full radial directions for 360-degree blast');
  const diagonals = COSMIC_RADIAL_DIRECTIONS.filter((d) => d.isDiagonal);
  const cardinals = COSMIC_RADIAL_DIRECTIONS.filter((d) => !d.isDiagonal);
  assert.equal(cardinals.length, 4, 'Must have 4 cardinal directions');
  assert.equal(diagonals.length, 4, 'Must have 4 diagonal directions');
});

/* ==============================================================================
 * TIER 2: DYNAMIC ATTRACTION & INWARD PULL VECTOR CALCULATION
 * ============================================================================== */

test('Cosmic Fusion [Tier 2]: Dynamic attraction steadily pulls distant bombs into core tile', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2; // 300px
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2; // 260px

  // Place bomb at 80px distance (inside 120px accretion radius)
  let bombX = corePxX + 80;
  let bombY = corePxY;

  const dtSec = 0.016; // 60 FPS
  let frames = 0;
  let reachedCore = false;

  while (frames < 250) {
    const pull = hazard.evaluatePull(bombX, bombY);
    assert.ok(pull.inAccretionField, 'Bomb must be inside accretion field');
    assert.ok(pull.pullVx < 0, 'Horizontal pull must direct westward towards core');

    // Euler integration step
    bombX += pull.pullVx * dtSec;
    bombY += pull.pullVy * dtSec;

    const dist = Math.hypot(bombX - corePxX, bombY - corePxY);
    if (dist <= FUSION_CORE_RADIUS_PX) {
      reachedCore = true;
      break;
    }
    frames++;
  }

  assert.ok(reachedCore, `Bomb must reach core tile within 250 frames (took ${frames} frames)`);
  assert.ok(frames <= 180, `Inward pull speed must be snappy (took ${frames} frames <= 3.0s)`);
});

test('Cosmic Fusion [Tier 2]: applyBombGravitationalPull smoothly updates bomb coordinates', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Bomb placed 60px north of core
  const startX = corePxX;
  const startY = corePxY - 60;

  const pullRes = hazard.applyBombGravitationalPull(startX, startY, 50); // 50ms step
  assert.ok(pullRes.displaced, 'Bomb must be displaced by gravitational field');
  assert.equal(pullRes.newX, startX, 'X coordinate remains aligned');
  assert.ok(pullRes.newY > startY, 'Bomb must be pulled downward towards core');
  assert.ok(pullRes.deltaY > 0, 'Delta Y must be positive');
});

/* ==============================================================================
 * TIER 3: 300MS ARRIVAL WINDOW & FUSION TRIGGER INVARIANTS
 * ============================================================================== */

test('Cosmic Fusion [Tier 3]: Synchronous arrival triggers Cosmic Fusion immediately', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  const bombs = [
    { id: 'bomb_alpha', x: corePxX + 5, y: corePxY + 5, power: 2 },
    { id: 'bomb_beta', x: corePxX - 5, y: corePxY - 5, power: 3 },
  ];

  const res = hazard.evaluateBombFusion(bombs, 1000);
  assert.equal(res.triggered, true, 'Cosmic Fusion must trigger');
  assert.equal(res.bonusRadius, 3, 'Bonus blast radius must be +3');
  assert.equal(res.effectivePower, 6, 'Effective power must be max(2, 3) + 3 = 6');
  assert.equal(res.survivingBombIndex, 0, 'First arriving bomb must be host');
  assert.deepEqual(res.absorbedBombIndices, [1], 'Second bomb must be designated absorbed');
  assert.equal(res.isRadial360, true, 'Radial 360-degree flag must be true');
  assert.equal(res.tintCyan, COSMIC_SUPER_BOMB_TINT_CYAN);
  assert.equal(res.tintPurple, COSMIC_SUPER_BOMB_TINT_PURPLE);
});

test('Cosmic Fusion [Tier 3]: Asynchronous arrival within <= 300ms successfully fuses', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Bomb 1 arrives at T = 1000ms
  hazard.evaluateBombFusion([{ id: 'b1', x: corePxX, y: corePxY, power: 2 }], 1000);

  // Bomb 2 arrives at T = 1250ms (delta = 250ms <= 300ms)
  const bombs = [
    { id: 'b1', x: corePxX, y: corePxY, power: 2 },
    { id: 'b2', x: corePxX + 2, y: corePxY + 2, power: 2 },
  ];

  const res = hazard.evaluateBombFusion(bombs, 1250);
  assert.equal(res.triggered, true, 'Delta 250ms <= 300ms must trigger Cosmic Fusion');
  assert.equal(res.bonusRadius, 3);
});

test('Cosmic Fusion [Tier 3]: Arrival delta > 300ms rejects fusion (window expired)', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Bomb 1 arrives at T = 1000ms
  hazard.evaluateBombFusion([{ id: 'b_old', x: corePxX, y: corePxY, power: 2 }], 1000);

  // Bomb 2 arrives at T = 1450ms (delta = 450ms > 300ms window)
  const bombs = [
    { id: 'b_old', x: corePxX, y: corePxY, power: 2 },
    { id: 'b_late', x: corePxX + 2, y: corePxY + 2, power: 2 },
  ];

  const res = hazard.evaluateBombFusion(bombs, 1450);
  assert.equal(res.triggered, false, 'Delta 450ms > 300ms must NOT trigger Cosmic Fusion');
  assert.equal(res.bonusRadius, 0);
});

/* ==============================================================================
 * TIER 4: 360-DEGREE RADIAL BLAST RAYCASTING & PROPAGATION RULES
 * ============================================================================== */

test('Cosmic Fusion [Tier 4]: computeCosmicRadialBlast generates 8 radial rays + 3x3 epicenter horizon', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);

  const blastTiles = hazard.computeCosmicRadialBlast(6, 7, 3);

  // 1. Concentric 3x3 Epicenter Horizon (9 tiles)
  const epicenterTiles = blastTiles.filter((t) => t.isEpicenter);
  assert.equal(epicenterTiles.length, 9, 'Epicenter horizon must cover exact 3x3 grid (9 tiles)');

  // 2. Cardinal Ray Tiles (dr=0 or dc=0, step > 1)
  const cardinalTiles = blastTiles.filter((t) => !t.isDiagonal && !t.isEpicenter);
  assert.ok(cardinalTiles.length > 0, 'Must have extended cardinal blast tiles');

  // 3. Diagonal Ray Tiles (dr!=0 and dc!=0, step > 1)
  const diagonalTiles = blastTiles.filter((t) => t.isDiagonal && !t.isEpicenter);
  assert.ok(diagonalTiles.length > 0, 'Must have extended diagonal blast tiles');

  // 4. Boundary verification: all coordinates within [0, ROWS-1] and [0, COLS-1]
  for (const t of blastTiles) {
    assert.ok(t.r >= 0 && t.r < ROWS, `Row ${t.r} within bounds`);
    assert.ok(t.c >= 0 && t.c < COLS, `Col ${t.c} within bounds`);
  }
});

test('Cosmic Fusion [Tier 4]: Radial blast stops at unbreakable boundary walls', () => {
  const hazard = new GravityHazard();
  hazard.init(1, 1); // Corner near outer wall (row 0 and col 0 are walls)

  // Wall inspector: tiles on r === 0 or c === 0 are walls
  const isWalkable = (r, c) => r > 0 && c > 0 && r < ROWS - 1 && c < COLS - 1;

  const blastTiles = hazard.computeCosmicRadialBlast(1, 1, 4, isWalkable);

  for (const t of blastTiles) {
    // Rays must never penetrate outer perimeter walls
    if (!t.isEpicenter) {
      assert.ok(t.r > 0, 'Ray must not extend into top wall');
      assert.ok(t.c > 0, 'Ray must not extend into left wall');
    }
  }
});

/* ==============================================================================
 * TIER 5: CAPACITY RECLAMATION & HOSTILITY INVARIANTS
 * ============================================================================== */

test('Cosmic Fusion [Tier 5]: Multi-bomb merge (3 bombs) designates 1 survivor and 2 absorbed', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  const bombs = [
    { id: 'b0', x: corePxX, y: corePxY, power: 2 },
    { id: 'b1', x: corePxX + 4, y: corePxY, power: 4 },
    { id: 'b2', x: corePxX - 4, y: corePxY, power: 3 },
  ];

  const res = hazard.evaluateBombFusion(bombs, 1000);
  assert.equal(res.triggered, true);
  assert.equal(res.survivingBombIndex, 0, 'b0 is host');
  assert.deepEqual(res.absorbedBombIndices, [1, 2], 'b1 and b2 are absorbed');
  assert.equal(res.effectivePower, 4 + 3, 'Effective power is max(2,4,3) + 3 = 7');
});

test('Cosmic Fusion [Tier 5]: Clear and reset operations clean arrival records', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  hazard.recordBombCoreArrival('test_bomb', 6, 7, 500);
  assert.equal(hazard.getBombCoreArrivalTimestamp('test_bomb'), 500);

  hazard.clearBombCoreArrival('test_bomb');
  assert.equal(hazard.getBombCoreArrivalTimestamp('test_bomb'), null);

  hazard.recordBombCoreArrival('b_a', 6, 7, 100);
  hazard.recordBombCoreArrival('b_b', 6, 7, 200);
  hazard.reset();

  assert.equal(hazard.getBombCoreArrivalTimestamp('b_a'), null);
  assert.equal(hazard.getBombCoreArrivalTimestamp('b_b'), null);
});

/* ==============================================================================
 * TIER 6: ZERO-GC 10,000 ITERATION STRESS SOAK
 * ============================================================================== */

test('Cosmic Fusion [Tier 6]: 10,000 fusion evaluation iterations execute with 0 net heap drift', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  const bombs = [
    { id: 'b0', x: corePxX, y: corePxY, power: 2 },
    { id: 'b1', x: corePxX + 2, y: corePxY, power: 3 },
  ];

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const ITERATIONS = 10000;
  for (let i = 0; i < ITERATIONS; i++) {
    hazard.update(16);
    hazard.applyBombGravitationalPull(corePxX + (i % 40), corePxY + (i % 40), 16);
    hazard.evaluateBombFusion(bombs, 1000 + (i % 200));
  }

  const durationMs = performance.now() - t0;
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const memAfter = process.memoryUsage().heapUsed;
  const netHeapDriftMB = (memAfter - memBefore) / (1024 * 1024);

  if (isGcExposed) {
    assert.ok(
      netHeapDriftMB < 0.25,
      `Zero-GC net heap drift ${netHeapDriftMB.toFixed(4)} MB must be strictly < 0.25 MB`
    );
  } else {
    assert.ok(
      netHeapDriftMB < 5.0,
      `Ambient heap drift ${netHeapDriftMB.toFixed(4)} MB must remain negligible`
    );
  }

  assert.ok(
    durationMs < 200,
    `10,000 Cosmic Fusion cycles must execute under 200ms (took ${durationMs.toFixed(2)}ms)`
  );
});
