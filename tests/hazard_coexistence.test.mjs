import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
  FlatHazardMask,
  isLethalHazardValue,
  isTileLethalInHazardMask,
  FLAG_LETHAL,
} from '../src/game/pathfinding.ts';

import {
  DynamicHazard,
  HazardLifecycleState as DynamicLifecycleState,
} from '../src/game/hazards/DynamicHazard.ts';

import {
  GravityHazard,
  GravityLifecycleState,
  GravityDangerValue,
  DURATION_SINGULARITY_BURST_MS,
  MIN_GRAVITY_SAFE_AREA_RATIO,
} from '../src/game/hazards/GravityHazard.ts';

import {
  FrostHazard,
  FrostLifecycleState,
  FrostDangerValue,
  MIN_FROST_SAFE_AREA_RATIO,
} from '../src/game/hazards/FrostHazard.ts';

import {
  VoltHazard,
  VoltLifecycleState,
  VoltDangerValue,
  MIN_VOLT_SAFE_AREA_RATIO,
} from '../src/game/hazards/VoltHazard.ts';

import {
  MagmaHazard,
  MagmaLifecycleState,
  MagmaDangerValue,
  MIN_MAGMA_SAFE_AREA_RATIO,
} from '../src/game/hazards/MagmaHazard.ts';

import {
  MiasmaHazard,
  MiasmaLifecycleState,
  MiasmaDangerValue,
  MIN_MIASMA_SAFE_AREA_RATIO,
} from '../src/game/hazards/MiasmaHazard.ts';

import {
  ChronoHazard,
  ChronoLifecycleState,
  ChronoDangerValue,
  MIN_CHRONO_SAFE_AREA_RATIO,
} from '../src/game/hazards/ChronoHazard.ts';

import {
  SolarHazard,
  SolarLifecycleState,
  SolarDangerValue,
  MIN_SOLAR_SAFE_AREA_RATIO,
} from '../src/game/hazards/SolarHazard.ts';

import {
  NebulaHazard,
  NebulaLifecycleState,
  NebulaDangerValue,
  MIN_NEBULA_SAFE_AREA_RATIO,
} from '../src/game/hazards/NebulaHazard.ts';

import {
  AbyssalHazard,
  AbyssalLifecycleState,
  AbyssalDangerValue,
  MIN_ABYSSAL_SAFE_AREA_RATIO,
} from '../src/game/hazards/AbyssalHazard.ts';

import {
  calculateClampedPlayerSpeed,
} from '../src/game/gameplay_mechanics.ts';

/**
 * Standard 13x15 arena with perimeter walls and alternating pillar grid.
 */
function createStandardMap() {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return 1;
      if (r % 2 === 0 && c % 2 === 0) return 1;
      return 0;
    })
  );
}

/**
 * Instantiates the primary 4-hazard quad specified in prompt:
 * Abyssal, Volt, Magma, and Gravity.
 */
function instantiateTargetQuadHazards(centerR = 6, centerC = 7) {
  const abyssal = new AbyssalHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const gravity = new GravityHazard();

  abyssal.init(centerR, centerC);
  volt.init(centerR, centerC);
  magma.init(centerR, centerC);
  gravity.init(centerR, centerC);

  return {
    abyssal,
    volt,
    magma,
    gravity,
    quad: [abyssal, volt, magma, gravity],
  };
}

/**
 * Instantiates all 10 hazards for full pantheon concurrency testing.
 */
function instantiateAll10Hazards(centerR = 6, centerC = 7) {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();
  const solar = new SolarHazard();
  const nebula = new NebulaHazard();
  const abyssal = new AbyssalHazard();

  const map = createStandardMap();
  dynamic.init(map);
  gravity.init(centerR, centerC);
  frost.init(centerR, centerC);
  volt.init(centerR, centerC);
  magma.init(centerR, centerC);
  miasma.init(centerR, centerC);
  chrono.init(centerR, centerC);
  solar.init(centerR, centerC);
  nebula.init(centerR, centerC);
  abyssal.init(centerR, centerC);

  return {
    dynamic,
    gravity,
    frost,
    volt,
    magma,
    miasma,
    chrono,
    solar,
    nebula,
    abyssal,
    all: [dynamic, gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal],
  };
}

/**
 * Computes composite safe area ratio across arbitrary set of hazards.
 */
function computeCompositeSafeAreaRatio(hazards) {
  let dangerousTiles = 0;
  for (let idx = 0; idx < TOTAL_TILES; idx++) {
    let isDangerous = false;
    for (let h = 0; h < hazards.length; h++) {
      const mask = hazards[h].getDangerMask();
      if (mask && mask[idx] > 0) {
        const val = mask[idx];
        if (val === 1 || val === 2 || val >= 4) {
          isDangerous = true;
          break;
        }
      }
    }
    if (isDangerous) dangerousTiles++;
  }
  return (TOTAL_TILES - dangerousTiles) / TOTAL_TILES;
}

test('Hazard Concurrency: Target Quad (Abyssal, Volt, Magma, Gravity) Simultaneous Activation & Invariants', () => {
  const { abyssal, volt, magma, gravity, quad } = instantiateTargetQuadHazards(6, 7);

  // Initial state check
  assert.equal(abyssal.getState(), AbyssalLifecycleState.DORMANT);
  assert.equal(volt.getState(), VoltLifecycleState.DORMANT);
  assert.equal(magma.getState(), MagmaLifecycleState.DORMANT);
  assert.equal(gravity.getState(), GravityLifecycleState.DORMANT);

  // Start all 4 concurrently
  abyssal.start('NORMAL', 6, 7);
  volt.start();
  magma.start();
  gravity.start();

  assert.equal(abyssal.getState(), AbyssalLifecycleState.TIDAL_SURGE);
  assert.equal(volt.getState(), VoltLifecycleState.IONIZATION_TELEGRAPH);
  assert.equal(magma.getState(), MagmaLifecycleState.MAGMA_TELEGRAPH);
  assert.equal(gravity.getState(), GravityLifecycleState.ACCRETION_SWIRL);

  // Individual safe area invariants >= 80%
  for (const h of quad) {
    const ratio = h.getSafeAreaRatio();
    assert.ok(ratio >= 0.80, `Initial ratio ${ratio} must be >= 0.80`);
  }

  // Composite safe area with co-located epicenter (6,7)
  const compositeRatio = computeCompositeSafeAreaRatio(quad);
  assert.ok(compositeRatio >= 0.80, `Initial composite ratio ${compositeRatio} must be >= 0.80`);
});

test('Danger Masks Concurrency: FlatHazardMask Merging with Abyssal, Volt, Magma, Gravity', () => {
  const { abyssal, volt, magma, gravity } = instantiateTargetQuadHazards(6, 7);

  abyssal.start('NORMAL', 6, 7);
  volt.start();
  magma.start();
  gravity.start();

  // Update into telegraph phase (500ms)
  abyssal.update(500);
  volt.update(500);
  magma.update(500);
  gravity.update(500);

  const mergedMask = new FlatHazardMask();
  mergedMask.mergeHazardMask(abyssal.getDangerMask());
  mergedMask.mergeHazardMask(volt.getDangerMask());
  mergedMask.mergeHazardMask(magma.getDangerMask());
  mergedMask.mergeHazardMask(gravity.getDangerMask());

  assert.ok(mergedMask.size > 0, 'Merged mask must have active tiles');

  // Accretion / Telegraph tile (6, 8) must be telegraph (1)
  const accretionIdx = 6 * COLS + 8;
  assert.equal(abyssal.getDangerMask()[accretionIdx], AbyssalDangerValue.TIDAL);
  assert.equal(volt.getDangerMask()[accretionIdx], VoltDangerValue.IONIZING);
  assert.equal(magma.getDangerMask()[accretionIdx], MagmaDangerValue.HEATING);
  assert.equal(gravity.getDangerMask()[accretionIdx], GravityDangerValue.ACCRETION);

  assert.equal(mergedMask.getCoord(6, 8), 1, 'Accretion tile (6, 8) must be telegraph value 1');
  assert.equal(isTileLethalInHazardMask(mergedMask, 6, 8), false, 'Telegraph is non-lethal');

  // Center tile (6, 7): Gravity singularity core has event horizon (2) while others have 1.
  // Merged mask must elevate to 2 without corrupting telegraph on non-core tiles.
  const centerIdx = 6 * COLS + 7;
  assert.equal(mergedMask.getCoord(6, 7), 2, 'Center tile contains singularity core event horizon (2)');
  assert.equal(isTileLethalInHazardMask(mergedMask, 6, 7), true, 'Core event horizon is lethal');

  // Advance into burst / lethal phase
  // Volt burst triggers around 2000ms
  // Magma burst triggers around 2000ms
  // Abyssal maelstrom triggers around 2000ms
  // Gravity singularity triggers around 2000ms
  const deltaToBurst = 1600; // Total 2100ms
  abyssal.update(deltaToBurst);
  volt.update(deltaToBurst);
  magma.update(deltaToBurst);
  gravity.update(deltaToBurst);

  assert.equal(abyssal.getState(), AbyssalLifecycleState.ABYSSAL_MAELSTROM);
  assert.equal(volt.getState(), VoltLifecycleState.LIGHTNING_DISCHARGE);
  assert.equal(magma.getState(), MagmaLifecycleState.PYROCLASTIC_BURST);
  assert.equal(gravity.getState(), GravityLifecycleState.SINGULARITY_BURST);

  // Verify danger masks individually report burst (2)
  assert.equal(abyssal.getDangerMask()[centerIdx], AbyssalDangerValue.MAELSTROM);
  assert.equal(volt.getDangerMask()[centerIdx], VoltDangerValue.LIGHTNING_BURST);
  assert.equal(magma.getDangerMask()[centerIdx], MagmaDangerValue.BURST);
  assert.equal(gravity.getDangerMask()[centerIdx], GravityDangerValue.EVENT_HORIZON);

  // Merge into FlatHazardMask
  const burstMergedMask = new FlatHazardMask();
  burstMergedMask.mergeHazardMask(abyssal.getDangerMask());
  burstMergedMask.mergeHazardMask(volt.getDangerMask());
  burstMergedMask.mergeHazardMask(magma.getDangerMask());
  burstMergedMask.mergeHazardMask(gravity.getDangerMask());

  assert.equal(burstMergedMask.getCoord(6, 7), 2, 'Center tile must be lethal value 2');
  assert.equal(isTileLethalInHazardMask(burstMergedMask, 6, 7), true, 'Center tile must be recognized as lethal');
  assert.equal(isLethalHazardValue(burstMergedMask.getCoord(6, 7)), true);
});

test('Danger Masks Concurrency: Non-Downgrade Rule (Lethal cannot be overwritten by Telegraph or Cleanse)', () => {
  const mask = new FlatHazardMask();
  const testIdx = 5 * COLS + 5;

  const lethalVoltMask = new Uint8Array(TOTAL_TILES);
  lethalVoltMask[testIdx] = VoltDangerValue.LIGHTNING_BURST; // 2

  const telegraphMagmaMask = new Uint8Array(TOTAL_TILES);
  telegraphMagmaMask[testIdx] = MagmaDangerValue.HEATING; // 1

  const calmAbyssalMask = new Uint8Array(TOTAL_TILES);
  calmAbyssalMask[testIdx] = AbyssalDangerValue.CALM; // 3

  // 1. Merge lethal first, then telegraph
  mask.mergeHazardMask(lethalVoltMask);
  assert.equal(mask.mask[testIdx], 2, 'Lethal volt sets 2');

  mask.mergeHazardMask(telegraphMagmaMask);
  assert.equal(mask.mask[testIdx], 2, 'Telegraph magma MUST NOT downgrade lethal 2 to 1');

  mask.mergeHazardMask(calmAbyssalMask);
  assert.equal(mask.mask[testIdx], 2, 'Calm sanctuary MUST NOT downgrade lethal 2 to 0');

  // 2. Reverse order: Telegraph first, then lethal
  const mask2 = new FlatHazardMask();
  mask2.mergeHazardMask(telegraphMagmaMask);
  assert.equal(mask2.mask[testIdx], 1, 'Telegraph magma sets 1');

  mask2.mergeHazardMask(lethalVoltMask);
  assert.equal(mask2.mask[testIdx], 2, 'Lethal volt upgrades 1 to 2');

  mask2.mergeHazardMask(calmAbyssalMask);
  assert.equal(mask2.mask[testIdx], 2, 'Lethal remains 2');
});

test('Danger Masks Concurrency: TypedArray Memory Buffer Independence (Zero Cross-Talk)', () => {
  const { abyssal, volt, magma, gravity, quad } = instantiateTargetQuadHazards(6, 7);

  // Verify buffer separation
  const buffers = new Set();
  for (let i = 0; i < quad.length; i++) {
    const mask = quad[i].getDangerMask();
    assert.ok(mask instanceof Uint8Array);
    assert.equal(mask.length, TOTAL_TILES);
    assert.ok(!buffers.has(mask.buffer), `Hazard ${i} shared buffer with another hazard`);
    buffers.add(mask.buffer);
  }

  // Verify mutation isolation
  const targetIdx = 6 * COLS + 7;
  for (let i = 0; i < quad.length; i++) {
    const orig = quad[i].getDangerMask()[targetIdx];
    quad[i].getDangerMask()[targetIdx] = 200 + i;

    for (let j = 0; j < quad.length; j++) {
      if (i === j) continue;
      assert.notEqual(
        quad[j].getDangerMask()[targetIdx],
        200 + i,
        `Mutating hazard ${i} leaked into hazard ${j}`
      );
    }
    quad[i].getDangerMask()[targetIdx] = orig;
  }
});

test('Hazard Concurrency: Simultaneous Player Evaluation & Speed Clamping', () => {
  const { abyssal, volt, magma, gravity } = instantiateTargetQuadHazards(6, 7);

  abyssal.start('NORMAL', 6, 7);
  volt.start();
  magma.start();
  gravity.start();

  // Advance to telegraph phase where slow debuffs are active
  abyssal.update(1000);
  volt.update(1000);
  magma.update(1000);
  gravity.update(1000);

  const px = 7 * TILE_SIZE + 20; // At (6, 7)
  const py = 6 * TILE_SIZE + 20;
  const nowMs = 1000;

  // 1. Walking: Debuffs compound simultaneously
  const aRes = abyssal.evaluatePlayer(px, py, false, false, nowMs);
  const vRes = volt.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const mRes = magma.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const gRes = gravity.evaluatePlayer(px, py, false, nowMs, 1, 0);

  const compoundSlow = aRes.slowFactor * vRes.slowFactor * mRes.slowFactor * gRes.slowFactor;
  assert.ok(Number.isFinite(compoundSlow), 'Compound slow factor must be finite');
  assert.ok(compoundSlow > 0, 'Compound slow factor must be positive');

  // Enforce GameScene clamping [0.30, 1.85] and calculate final player speed
  const clampedMultiplier = Math.max(0.30, Math.min(1.85, compoundSlow));
  const finalSpeed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    speedMultiplier: clampedMultiplier,
  });

  assert.ok(finalSpeed >= 40, `Final clamped player speed ${finalSpeed} px/s must respect >= 40 px/s floor`);

  // 2. Dashing: Player triggers mastery buffs simultaneously without corrupting one another
  const aDash = abyssal.evaluatePlayer(px, py, true, false, nowMs + 100);
  const vDash = volt.evaluatePlayer(px, py, true, nowMs + 100, 1, 0);
  const mDash = magma.evaluatePlayer(px, py, true, nowMs + 100, 1, 0);
  const gDash = gravity.evaluatePlayer(px, py, true, nowMs + 100, 1, 0);

  assert.equal(typeof (aDash.aquaGlideGranted ?? aDash.abyssalGlideGranted ?? aDash.isGlideActivated), 'boolean');
  assert.equal(typeof vDash.superconductorDashGranted, 'boolean');
  assert.equal(typeof mDash.magmaSurfGranted, 'boolean');
  assert.equal(typeof gDash.isEscaping, 'boolean');
});

test('Hazard Concurrency: Simultaneous Tactical Bomb Interactions & Blast Cleansing', () => {
  const { abyssal, volt, magma, gravity } = instantiateTargetQuadHazards(6, 7);

  abyssal.start('NORMAL', 6, 7);
  volt.start();
  magma.start();
  gravity.start();

  abyssal.update(500);
  volt.update(500);
  magma.update(500);
  gravity.update(500);

  const bombId = 'concurrent_bomb_01';
  const row = 6;
  const col = 7;
  const initialFuse = 2500;
  const power = 2;

  // Concurrent bomb placement
  const aPlace = abyssal.onBombPlaced(bombId, row, col, power, initialFuse);
  const vPlace = volt.onBombPlaced(bombId, row, col, power, initialFuse);
  const mPlace = magma.onBombPlaced(bombId, row, col, power, initialFuse);
  const gPlace = gravity.onBombPlaced ? gravity.onBombPlaced(bombId, row, col, power, initialFuse) : null;

  assert.ok(aPlace.isHydroFused || aPlace.fuseAccelerationMs > 0);
  assert.ok(vPlace.isVoltCharged || vPlace.modifiedFuseMs < initialFuse);
  assert.ok(mPlace.isPyroFused || mPlace.modifiedFuseMs < initialFuse);

  // Concurrent blast impact cleansing / quenching
  const aCleanse = abyssal.onBombBlastImpact(row, col);
  const vCleanse = volt.onBombBlastImpact(row, col);
  const mCleanse = magma.onBombBlastImpact(row, col);
  const gCleanse = gravity.onBombBlastImpact ? gravity.onBombBlastImpact(row, col) : null;

  assert.ok(typeof aCleanse.cleanedTilesCount === 'number');
  assert.equal(typeof vCleanse.grounded, 'boolean');
  assert.equal(typeof mCleanse.quenched, 'boolean');

  // Verify magma tile became obsidian crust (3) and abyssal tile became calm (3)
  assert.equal(magma.getTileDangerCode(row, col), MagmaDangerValue.OBSIDIAN_CRUST);
  assert.equal(abyssal.getDangerMask()[row * COLS + col], AbyssalDangerValue.CALM);
});

test('Hazard Concurrency: Simultaneous Boss Anti-Exploit Stasis Guards & Minion Damage', () => {
  const { abyssal, volt, magma, gravity } = instantiateTargetQuadHazards(6, 7);

  abyssal.start('NORMAL', 6, 7);
  volt.start();
  magma.start();
  gravity.start();

  // Advance to burst stage (2100ms)
  abyssal.update(2100);
  volt.update(2100);
  magma.update(2100);
  gravity.update(2100);

  const ex = 7 * TILE_SIZE + 20;
  const ey = 6 * TILE_SIZE + 20;
  const nowMs = 2100;
  const bossHp = 2000;

  // Minion evaluation: damage stacks cleanly
  const aMinion = abyssal.evaluateEnemy(ex, ey, false, nowMs);
  const vMinion = volt.evaluateEnemy(ex, ey, false, nowMs);
  const mMinion = magma.evaluateEnemy(ex, ey, false, nowMs);
  const gMinion = gravity.evaluateEnemy(ex, ey, false, nowMs);

  assert.ok(aMinion.damage > 0, 'Abyssal minion damage must be > 0');
  assert.ok(vMinion.damage > 0, 'Volt minion damage must be > 0');
  assert.ok(mMinion.damage > 0, 'Magma minion damage must be > 0');
  assert.ok(gMinion.damage > 0, 'Gravity minion damage must be > 0');

  // Boss evaluation: Anti-exploit cooldowns must not interfere
  const aBoss1 = abyssal.evaluateEnemy(ex, ey, true, nowMs, bossHp);
  const vBoss1 = volt.evaluateEnemy(ex, ey, true, nowMs, bossHp);
  const mBoss1 = magma.evaluateEnemy(ex, ey, true, nowMs, bossHp);
  const gBoss1 = gravity.evaluateEnemy(ex, ey, true, nowMs, bossHp);

  assert.ok(aBoss1.hit, 'Abyssal boss hit on first contact');
  assert.ok(aBoss1.damage > 0, 'Abyssal boss damage first hit');
  assert.ok(vBoss1.hit, 'Volt boss hit on first contact');
  assert.ok(vBoss1.isEmpStunned, 'Volt boss takes EMP stun on first hit');
  assert.ok(vBoss1.stunDurationMs > 0, 'Volt boss stun duration > 0');
  assert.ok(mBoss1.hit, 'Magma boss hit on first contact');
  assert.ok(mBoss1.damage > 0, 'Magma boss damage first hit');
  assert.ok(gBoss1.hit, 'Gravity boss hit on first contact');
  assert.ok(gBoss1.damage > 0, 'Gravity boss damage first hit');

  // Repeated immediate hit at nowMs + 10ms: Anti-exploit guards reject second hit
  const aBoss2 = abyssal.evaluateEnemy(ex, ey, true, nowMs + 10, bossHp);
  const vBoss2 = volt.evaluateEnemy(ex, ey, true, nowMs + 10, bossHp);
  const mBoss2 = magma.evaluateEnemy(ex, ey, true, nowMs + 10, bossHp);
  const gBoss2 = gravity.evaluateEnemy(ex, ey, true, nowMs + 10, bossHp);

  assert.equal(aBoss2.damage, 0, 'Abyssal exploit guard prevented duplicate hit');
  assert.equal(vBoss2.hit, false, 'Volt exploit guard prevented duplicate hit');
  assert.equal(mBoss2.damage, 0, 'Magma exploit guard prevented duplicate hit');
  assert.equal(gBoss2.damage, 0, 'Gravity exploit guard prevented duplicate hit');
});

test('Hazard Concurrency: Multi-Sector Clustered & Dispersed Epicenters Safe Area Invariants', () => {
  const { abyssal, volt, magma, gravity } = instantiateTargetQuadHazards();

  // Dispersed epicenters across 4 distinct quadrants
  abyssal.setCenter(3, 3);
  volt.setCenter(3, 11);
  magma.setCenter(9, 3);
  gravity.setCenter(9, 11);

  abyssal.start('NORMAL', 3, 3);
  volt.start();
  magma.start();
  gravity.start();

  const dt = 16.666;
  for (let frame = 0; frame < 600; frame++) {
    abyssal.update(dt);
    volt.update(dt);
    magma.update(dt);
    gravity.update(dt);

    // Each individual hazard must maintain >= 80% safe area
    assert.ok(abyssal.getSafeAreaRatio() >= 0.80);
    assert.ok(volt.getSafeAreaRatio() >= 0.80);
    assert.ok(magma.getSafeAreaRatio() >= 0.80);
    assert.ok(gravity.getSafeAreaRatio() >= 0.80);

    // Dispersed composite safe area must never drop below 40% floor
    if (frame % 30 === 0) {
      const comp = computeCompositeSafeAreaRatio([abyssal, volt, magma, gravity]);
      assert.ok(
        comp >= 0.40,
        `Frame ${frame}: Dispersed composite ratio ${comp} dropped below 0.40`
      );
    }
  }
});

test('Hazard Concurrency: 1,500-Frame Soak Test under Climax Mode across All 10 Hazards with Zero-GC', () => {
  const { all } = instantiateAll10Hazards(6, 7);

  // Set all 10 to Climax mode
  for (let h = 0; h < all.length; h++) {
    if (typeof all[h].setClimaxMode === 'function') {
      all[h].setClimaxMode(true);
    }
  }

  // Start all 10 hazards
  all[0].start('CLIMAX'); // Dynamic
  all[1].start();         // Gravity
  all[2].start();         // Frost
  all[3].start();         // Volt
  all[4].start('CLIMAX'); // Magma
  all[5].start('CLIMAX'); // Miasma
  all[6].start('CLIMAX', 6, 7); // Chrono
  all[7].start('CLIMAX', 6, 7); // Solar
  all[8].start('CLIMAX', 6, 7); // Nebula
  all[9].start('CLIMAX', 6, 7); // Abyssal

  const dt = 16.666;
  const totalFrames = 1500;

  // Warmup 100 frames
  for (let w = 0; w < 100; w++) {
    for (let h = 0; h < all.length; h++) all[h].update(dt);
  }

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const initialHeap = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  const mergedMask = new FlatHazardMask();

  for (let frame = 0; frame < totalFrames; frame++) {
    // Interleaved concurrent updates
    for (let h = 0; h < all.length; h++) {
      all[h].update(dt);
    }

    // Every 20 frames, verify danger mask merging and safe area bounds
    if (frame % 20 === 0) {
      mergedMask.clear();
      for (let h = 0; h < all.length; h++) {
        mergedMask.mergeHazardMask(all[h].getDangerMask());
      }

      // Check center tile is finite
      assert.ok(Number.isInteger(mergedMask.getCoord(6, 7)));

      // Composite safe area must remain >= 40%
      const comp = computeCompositeSafeAreaRatio(all);
      assert.ok(
        comp >= 0.40,
        `Frame ${frame}: Composite safe area ${comp} dropped below 40%`
      );
    }
  }

  const durationMs = performance.now() - startTime;
  const usPerFrame = (durationMs / totalFrames) * 1000;

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalHeap = process.memoryUsage().heapUsed;
  const driftMB = (finalHeap - initialHeap) / (1024 * 1024);

  // Performance budget: < 300 µs per frame for all 10 hazards simultaneous
  assert.ok(
    usPerFrame < 300,
    `Execution took ${usPerFrame.toFixed(2)} µs/frame (budget < 300 µs)`
  );

  // Memory budget: < 5.0 MB drift (or <= 0.35 MB with exposed GC)
  if (isGcExposed) {
    assert.ok(
      driftMB <= 0.35,
      `Zero-GC Violation: Heap drift was ${driftMB.toFixed(4)} MB (budget <= 0.35 MB)`
    );
  } else {
    assert.ok(
      driftMB < 5.0,
      `Ambient memory drift was ${driftMB.toFixed(4)} MB (budget < 5.0 MB)`
    );
  }
});
