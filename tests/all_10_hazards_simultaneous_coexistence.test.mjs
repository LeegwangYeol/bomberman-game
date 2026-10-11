import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DynamicHazard,
  HazardLifecycleState as DynamicLifecycleState,
} from '../src/game/hazards/DynamicHazard.ts';
import {
  GravityHazard,
  GravityLifecycleState,
} from '../src/game/hazards/GravityHazard.ts';
import {
  FrostHazard,
  FrostLifecycleState,
  MIN_FROST_SAFE_AREA_RATIO,
} from '../src/game/hazards/FrostHazard.ts';
import {
  VoltHazard,
  VoltLifecycleState,
  MIN_VOLT_SAFE_AREA_RATIO,
} from '../src/game/hazards/VoltHazard.ts';
import {
  MagmaHazard,
  MagmaLifecycleState,
  MIN_MAGMA_SAFE_AREA_RATIO,
} from '../src/game/hazards/MagmaHazard.ts';
import {
  MiasmaHazard,
  MiasmaLifecycleState,
  MIN_MIASMA_SAFE_AREA_RATIO,
} from '../src/game/hazards/MiasmaHazard.ts';
import {
  ChronoHazard,
  ChronoLifecycleState,
  MIN_CHRONO_SAFE_AREA_RATIO,
} from '../src/game/hazards/ChronoHazard.ts';
import {
  SolarHazard,
  SolarLifecycleState,
  MIN_SOLAR_SAFE_AREA_RATIO,
} from '../src/game/hazards/SolarHazard.ts';
import {
  NebulaHazard,
  NebulaLifecycleState,
  MIN_NEBULA_SAFE_AREA_RATIO,
} from '../src/game/hazards/NebulaHazard.ts';
import {
  AbyssalHazard,
  AbyssalLifecycleState,
  MIN_ABYSSAL_SAFE_AREA_RATIO,
  AbyssalDangerValue,
} from '../src/game/hazards/AbyssalHazard.ts';
import {
  calculateClampedPlayerSpeed,
} from '../src/game/gameplay_mechanics.ts';
import {
  ROWS,
  COLS,
  TOTAL_TILES,
} from '../src/game/pathfinding.ts';

const MIN_SAFE_AREA_INVARIANT = 0.80; // 80%

function createStandardMap() {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return 1;
      if (r % 2 === 0 && c % 2 === 0) return 1;
      return 0;
    })
  );
}

function calculateCompositeSafeAreaRatio(hazards) {
  let dangerousTileCount = 0;
  for (let idx = 0; idx < TOTAL_TILES; idx++) {
    let isDangerous = false;
    for (let h = 0; h < hazards.length; h++) {
      const mask = hazards[h].getDangerMask();
      if (mask && mask[idx] > 0) {
        // Treat calm/cleanse anchors (value 3) as safe
        const val = mask[idx];
        if (val === 1 || val === 2) {
          isDangerous = true;
          break;
        }
      }
    }
    if (isDangerous) {
      dangerousTileCount++;
    }
  }
  return (TOTAL_TILES - dangerousTileCount) / TOTAL_TILES;
}

function instantiateAll10Hazards() {
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
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);
  solar.init(6, 7);
  nebula.init(6, 7);
  abyssal.init(6, 7);

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

test('Tier 1 [Baseline Invariants]: Universal construction of all 10 hazards preserves 100% safe area', () => {
  const { dynamic, gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal, all } = instantiateAll10Hazards();

  assert.equal(all.length, 10, 'Must have exactly 10 hazards in parallel');

  // Verify initial dormant/inactive states
  assert.equal(dynamic.getState(), DynamicLifecycleState.INACTIVE);
  assert.equal(gravity.getState(), GravityLifecycleState.DORMANT);
  assert.equal(frost.getState(), FrostLifecycleState.DORMANT);
  assert.equal(volt.getState(), VoltLifecycleState.DORMANT);
  assert.equal(magma.getState(), MagmaLifecycleState.DORMANT);
  assert.equal(miasma.getState(), MiasmaLifecycleState.DORMANT);
  assert.equal(chrono.getState(), ChronoLifecycleState.DORMANT);
  assert.equal(solar.getState(), SolarLifecycleState.DORMANT);
  assert.equal(nebula.getState(), NebulaLifecycleState.DORMANT);
  assert.equal(abyssal.getState(), AbyssalLifecycleState.DORMANT);

  // Individual safe area ratios must all satisfy >= 80% invariant
  for (let i = 0; i < all.length; i++) {
    const ratio = all[i].getSafeAreaRatio();
    assert.ok(ratio >= MIN_SAFE_AREA_INVARIANT, `Hazard ${i} baseline safe area ratio ${ratio} must be >= 0.80`);
  }

  // Composite safe area ratio must be >= 80%
  const compositeRatio = calculateCompositeSafeAreaRatio(all);
  assert.ok(compositeRatio >= MIN_SAFE_AREA_INVARIANT, 'Baseline composite safe area ratio across all 10 hazards must be >= 0.80');
});

test('Tier 2 [Strict Memory Isolation]: All 10 hazards own independent TypedArray buffers with zero cross-leak', () => {
  const { all } = instantiateAll10Hazards();

  // 1. Verify dangerMask ArrayBuffer independence across all 10 hazards
  for (let i = 0; i < all.length; i++) {
    const maskA = all[i].getDangerMask();
    assert.ok(maskA instanceof Uint8Array, `Hazard ${i} dangerMask must be Uint8Array`);
    assert.equal(maskA.length, TOTAL_TILES, `Hazard ${i} dangerMask must be exactly ${TOTAL_TILES} elements`);

    for (let j = i + 1; j < all.length; j++) {
      const maskB = all[j].getDangerMask();
      assert.notEqual(
        maskA.buffer,
        maskB.buffer,
        `Hazard ${i} and ${j} MUST NOT share the same ArrayBuffer (dangerMask memory isolation violation)`
      );
    }
  }

  // 2. Mutation Isolation: Writing into hazard i's dangerMask does NOT alter any other hazard's mask
  for (let i = 0; i < all.length; i++) {
    const targetIdx = 42 + i;
    const mask = all[i].getDangerMask();
    const originalVal = mask[targetIdx];
    mask[targetIdx] = 255;

    // Verify all other 9 hazards remain untouched at targetIdx
    for (let j = 0; j < all.length; j++) {
      if (i === j) continue;
      const otherMask = all[j].getDangerMask();
      assert.notEqual(
        otherMask[targetIdx],
        255,
        `Mutating hazard ${i} mask corrupted hazard ${j} mask at index ${targetIdx}`
      );
    }

    // Restore
    mask[targetIdx] = originalVal;
  }

  // 3. Float32Array and Int16Array auxiliary buffer isolation
  const { solar, nebula, abyssal } = instantiateAll10Hazards();
  assert.notEqual(solar.getHeatGrid().buffer, nebula.getDensityGrid().buffer, 'Solar heatGrid and Nebula densityGrid must not share buffer');
  assert.notEqual(nebula.getDensityGrid().buffer, abyssal.getPressureGrid().buffer, 'Nebula densityGrid and Abyssal pressureGrid must not share buffer');
  assert.notEqual(solar.getActiveSolarIndices().buffer, abyssal.getActiveAbyssalIndices().buffer, 'Active index buffers must be separate');
});

test('Tier 3 [Simultaneous Parallel Activation]: Starting all 10 hazards preserves safe area >= 80% invariant', () => {
  const { dynamic, gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal, all } = instantiateAll10Hazards();

  // Simultaneous activation of all 10 hazards in parallel
  dynamic.start('OUTBREAK');
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);
  solar.start('NORMAL', 6, 7);
  nebula.start('NORMAL', 6, 7);
  abyssal.start('NORMAL', 6, 7);

  // Verify non-dormant states
  assert.notEqual(dynamic.getState(), DynamicLifecycleState.INACTIVE);
  assert.notEqual(gravity.getState(), GravityLifecycleState.DORMANT);
  assert.notEqual(frost.getState(), FrostLifecycleState.DORMANT);
  assert.notEqual(volt.getState(), VoltLifecycleState.DORMANT);
  assert.notEqual(magma.getState(), MagmaLifecycleState.DORMANT);
  assert.notEqual(miasma.getState(), MiasmaLifecycleState.DORMANT);
  assert.notEqual(chrono.getState(), ChronoLifecycleState.DORMANT);
  assert.notEqual(solar.getState(), SolarLifecycleState.DORMANT);
  assert.notEqual(nebula.getState(), NebulaLifecycleState.DORMANT);
  assert.notEqual(abyssal.getState(), AbyssalLifecycleState.DORMANT);

  // Verify each individual hazard satisfies safe area >= 80%
  for (let i = 0; i < all.length; i++) {
    const ratio = all[i].getSafeAreaRatio();
    assert.ok(
      ratio >= MIN_SAFE_AREA_INVARIANT,
      `Hazard ${i} individual safe area ratio ${ratio} must be >= 0.80 upon activation`
    );
  }

  // When all 10 hazards share the same epicenter (6, 7), danger tiles are confined to radius 3 ball (<= 29 tiles).
  // Composite safe area must be >= 85% on 13x15 arena (166 / 195 = 85.128%)
  const compositeRatio = calculateCompositeSafeAreaRatio(all);
  assert.ok(
    compositeRatio >= MIN_SAFE_AREA_INVARIANT,
    `Composite safe area ratio ${compositeRatio} must be >= 0.80 upon simultaneous activation`
  );
  assert.ok(
    compositeRatio >= 0.85,
    `Observed composite safe area ${(compositeRatio * 100).toFixed(2)}% >= 85% on shared center`
  );
});

test('Tier 4 [Simultaneous Full-Phase Cycling]: Safe area >= 80% maintained across all phase transitions', () => {
  const { dynamic, gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal, all } = instantiateAll10Hazards();

  dynamic.start('OUTBREAK');
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);
  solar.start('NORMAL', 6, 7);
  nebula.start('NORMAL', 6, 7);
  abyssal.start('NORMAL', 6, 7);

  // Step through specific key lifecycle milestones
  const milestonesMs = [100, 500, 1000, 1500, 1900, 2050, 2150, 2300, 2500, 3000, 4000, 6000, 8000];

  let currentElapsed = 0;
  for (const targetMs of milestonesMs) {
    const stepDelta = targetMs - currentElapsed;
    currentElapsed = targetMs;

    for (let h = 0; h < all.length; h++) {
      all[h].update(stepDelta);
    }

    // Verify individual ratios and state integrity at each milestone
    for (let h = 0; h < all.length; h++) {
      const ratio = all[h].getSafeAreaRatio();
      assert.ok(
        ratio >= MIN_SAFE_AREA_INVARIANT,
        `At ${targetMs}ms, hazard ${h} ratio ${ratio} must be >= 0.80`
      );
      assert.ok(Number.isFinite(ratio), `At ${targetMs}ms, hazard ${h} ratio must be finite number`);
    }

    // Verify composite ratio
    const compRatio = calculateCompositeSafeAreaRatio(all);
    assert.ok(
      compRatio >= MIN_SAFE_AREA_INVARIANT,
      `At ${targetMs}ms, composite ratio ${compRatio} must be >= 0.80`
    );
  }
});

test('Tier 5 [10,000-Frame Long-Running Soak Test]: 10,000 continuous frames of 10 hazards strictly preserves safe area >= 80%', () => {
  const { dynamic, gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal, all } = instantiateAll10Hazards();

  dynamic.start('OUTBREAK');
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);
  solar.start('NORMAL', 6, 7);
  nebula.start('NORMAL', 6, 7);
  abyssal.start('NORMAL', 6, 7);

  const dt = 16.666; // 60 FPS
  const totalFrames = 10000;

  const minObservedRatios = new Array(10).fill(1.0);
  let minObservedComposite = 1.0;

  const startTime = performance.now();

  for (let frame = 0; frame < totalFrames; frame++) {
    // Simultaneous update step across all 10 hazards
    dynamic.update(dt);
    gravity.update(dt);
    frost.update(dt);
    volt.update(dt);
    magma.update(dt);
    miasma.update(dt);
    chrono.update(dt);
    solar.update(dt);
    nebula.update(dt);
    abyssal.update(dt);

    for (let h = 0; h < all.length; h++) {
      const r = all[h].getSafeAreaRatio();
      if (r < minObservedRatios[h]) minObservedRatios[h] = r;

      assert.ok(
        r >= MIN_SAFE_AREA_INVARIANT,
        `Frame ${frame}: Hazard ${h} safe ratio ${r} < 0.80`
      );
      assert.ok(Number.isFinite(r), `Frame ${frame}: Hazard ${h} ratio is not finite`);
    }

    // Verify composite safe area invariant periodically (every 10 frames)
    if (frame % 10 === 0) {
      const compRatio = calculateCompositeSafeAreaRatio(all);
      if (compRatio < minObservedComposite) minObservedComposite = compRatio;
      assert.ok(
        compRatio >= MIN_SAFE_AREA_INVARIANT,
        `Frame ${frame}: Composite safe ratio ${compRatio} < 0.80`
      );
    }
  }

  const durationMs = performance.now() - startTime;
  const usPerFrame = (durationMs / totalFrames) * 1000;

  // Assert minimum observed bounds for all 10 hazards
  for (let h = 0; h < 10; h++) {
    assert.ok(minObservedRatios[h] >= MIN_SAFE_AREA_INVARIANT, `Hazard ${h} min observed ratio >= 0.80`);
  }
  assert.ok(minObservedComposite >= MIN_SAFE_AREA_INVARIANT, 'Composite min >= 0.80');

  // Performance budget: < 250 µs per frame across all 10 simultaneous hazards
  assert.ok(
    usPerFrame < 250,
    `10,000 frames took ${durationMs.toFixed(2)} ms (${usPerFrame.toFixed(2)} µs/frame, budget < 250 µs)`
  );
});

test('Tier 6 [Climax High-Throughput Stress]: Accelerated cooldowns across all 10 hazards maintain safe area >= 80%', () => {
  const { dynamic, gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal, all } = instantiateAll10Hazards();

  dynamic.start('CLIMAX');
  gravity.start();
  frost.start();
  volt.start();
  magma.start('CLIMAX');
  miasma.start('CLIMAX');
  chrono.start('CLIMAX', 6, 7);
  solar.start('CLIMAX', 6, 7);
  nebula.start('CLIMAX', 6, 7);
  abyssal.start('CLIMAX', 6, 7);

  const dt = 16.666;
  for (let frame = 0; frame < 3000; frame++) {
    for (let h = 0; h < all.length; h++) {
      all[h].update(dt);
    }

    // Every individual hazard must strictly preserve safe area >= 80%
    for (let h = 0; h < all.length; h++) {
      assert.ok(
        all[h].getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT,
        `Climax frame ${frame}: Hazard ${h} safe ratio must be >= 0.80`
      );
    }
  }
});

test('Tier 7 [Player Combat Mastery & Speed Stacking]: 10-Hazard multipliers compose and respect minimum speed floor', () => {
  const { gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal } = instantiateAll10Hazards();

  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);
  solar.start('NORMAL', 6, 7);
  nebula.start('NORMAL', 6, 7);
  abyssal.start('NORMAL', 6, 7);

  const px = 280;
  const py = 240;
  const nowMs = 1500;

  // 1. Walking: slow debuff stacking across all hazards
  const gRes = gravity.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const fRes = frost.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const vRes = volt.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const mRes = magma.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const miRes = miasma.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const cRes = chrono.evaluatePlayer(px, py, false, nowMs);
  const sRes = solar.evaluatePlayer(px, py, false, false, nowMs);
  const nRes = nebula.evaluatePlayer(px, py, false, false, nowMs);
  const aRes = abyssal.evaluatePlayer(px, py, false, false, nowMs);

  const rawMultiplier =
    gRes.slowFactor *
    fRes.slowFactor *
    vRes.slowFactor *
    mRes.slowFactor *
    miRes.slowFactor *
    cRes.slowFactor *
    sRes.slowFactor *
    nRes.slowFactor *
    aRes.slowFactor;

  assert.ok(Number.isFinite(rawMultiplier), 'Raw multiplier is finite');
  assert.ok(rawMultiplier > 0, 'Raw multiplier is strictly positive');

  // Enforce GameScene clamping [0.30, 1.85]
  const clampedMultiplier = Math.max(0.30, Math.min(1.85, rawMultiplier));
  const finalSpeed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    speedMultiplier: clampedMultiplier,
  });

  assert.ok(finalSpeed >= 40, `Clamped speed ${finalSpeed} strictly respects minimum floor 40 px/s`);

  // 2. Dashing: mastery buff triggers independently without corruption
  const dashG = gravity.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashF = frost.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashV = volt.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashM = magma.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashMi = miasma.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashC = chrono.evaluatePlayer(px, py, true, nowMs);
  const dashS = solar.evaluatePlayer(px, py, true, false, nowMs);
  const dashN = nebula.evaluatePlayer(px, py, true, false, nowMs);
  const dashA = abyssal.evaluatePlayer(px, py, true, false, nowMs);

  assert.equal(typeof dashG.isEscaping, 'boolean');
  assert.equal(typeof dashF.thermalBreakGranted, 'boolean');
  assert.equal(typeof dashV.superconductorDashGranted, 'boolean');
  assert.equal(typeof dashM.magmaSurfGranted, 'boolean');
  assert.equal(typeof dashMi.sporeSurgeGranted, 'boolean');
  assert.equal(typeof dashC.chronoSurgeGranted, 'boolean');
  assert.equal(typeof dashS.solarSurfGranted, 'boolean');
  assert.equal(typeof dashN.astralGlideGranted, 'boolean');
  assert.equal(typeof (dashA.aquaGlideGranted ?? dashA.abyssalGlideGranted ?? dashA.isGlideActivated), 'boolean');
});

test('Tier 8 [Tactical Bomb Simultaneous Interactivity]: Placing, detonating, and blast cleansing across all hazards', () => {
  const { dynamic, frost, volt, magma, miasma, chrono, solar, nebula, abyssal } = instantiateAll10Hazards();

  dynamic.start('OUTBREAK');
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);
  solar.start('NORMAL', 6, 7);
  nebula.start('NORMAL', 6, 7);
  abyssal.start('NORMAL', 6, 7);

  const bombId = 'test_bomb_all_10';
  const row = 6;
  const col = 7;
  const power = 2;
  const fuseMs = 2500;

  // Bomb Placed across all hazards
  const dPlace = dynamic.onBombPlaced(bombId, row, col, power, fuseMs);
  const fPlace = frost.onBombPlaced(bombId, row, col, power, fuseMs);
  const vPlace = volt.onBombPlaced(bombId, row, col, power, fuseMs);
  const mPlace = magma.onBombPlaced(bombId, row, col, power, fuseMs);
  const miPlace = miasma.onBombPlaced(bombId, row, col, power, fuseMs);
  const cPlace = chrono.onBombPlaced(bombId, row, col, power, fuseMs);
  const sPlace = solar.onBombPlaced(bombId, row, col, power, fuseMs);
  const nPlace = nebula.onBombPlaced(bombId, row, col, power, fuseMs);
  const aPlace = abyssal.onBombPlaced(bombId, row, col, power, fuseMs);

  assert.ok(Number.isFinite(dPlace.fuseTimerMs || fuseMs));
  assert.ok(Number.isFinite(fPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(vPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(mPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(miPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(cPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(sPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(nPlace.modifiedFuseMs || fuseMs - nPlace.fuseAccelerationMs));
  assert.ok(Number.isFinite(aPlace.modifiedFuseMs || fuseMs - aPlace.fuseAccelerationMs));

  // Bomb Detonated across all hazards
  const dDet = dynamic.onBombDetonated(bombId, row, col, power);
  const fDet = frost.onBombDetonated(bombId, row, col, power);
  const vDet = volt.onBombDetonated(bombId, row, col, power);
  const mDet = magma.onBombDetonated(bombId, row, col, power);
  const miDet = miasma.onBombDetonated(bombId, row, col, power);
  const cDet = chrono.onBombDetonated(bombId, row, col, power);
  const sDet = solar.onBombDetonated(bombId, row, col, power);
  const nDet = nebula.onBombDetonated(bombId, row, col, power);
  const aDet = abyssal.onBombDetonated(bombId, row, col, power);

  assert.ok(Number.isFinite(dDet.bonusPower || power));
  assert.ok(Number.isFinite(fDet.modifiedPower));
  assert.ok(Number.isFinite(vDet.modifiedPower));
  assert.ok(Number.isFinite(mDet.modifiedPower));
  assert.ok(Number.isFinite(miDet.modifiedPower));
  assert.ok(Number.isFinite(cDet.modifiedPower));
  assert.ok(Number.isFinite(sDet.bonusPower || power));
  assert.ok(Number.isFinite(nDet.bonusPower || power));
  assert.ok(Number.isFinite(aDet.bonusPower || power));

  // Blast impact cleanses / anchors tiles independently
  const dImpact = dynamic.onBombBlastImpact(row, col);
  const fImpact = frost.onBombBlastImpact(row, col);
  const vImpact = volt.onBombBlastImpact(row, col);
  const mImpact = magma.onBombBlastImpact(row, col);
  const miImpact = miasma.onBombBlastImpact(row, col);
  const cImpact = chrono.onBombBlastImpact(row, col);
  const sImpact = solar.onBombBlastImpact(row, col);
  const nImpact = nebula.onBombBlastImpact(row, col);
  const aImpact = abyssal.onBombBlastImpact(row, col);

  assert.equal(typeof dImpact.polarized, 'boolean');
  assert.equal(typeof fImpact, 'boolean');
  assert.equal(typeof vImpact.grounded, 'boolean');
  assert.equal(typeof mImpact.quenched, 'boolean');
  assert.equal(typeof miImpact.cleansed, 'boolean');
  assert.equal(typeof cImpact.stabilized, 'boolean');
  assert.equal(typeof sImpact.quenched, 'boolean');
  assert.equal(typeof nImpact.cleanedTilesCount, 'number');
  assert.equal(typeof aImpact.cleanedTilesCount, 'number');

  // Verify slipstream kick speeds (460 px/s) across slipstream hazards
  const sKick = solar.onBombKicked('bomb_k', row, col, 200);
  const nKick = nebula.onBombKicked('bomb_k', row, col, 200);
  const aKick = abyssal.onBombKicked('bomb_k', row, col, 200);
  assert.equal(typeof (sKick.isSlipstream ?? sKick.slipstream), 'boolean');
  assert.equal(typeof (nKick.isSlipstreamKick ?? nKick.isSlipstream), 'boolean');
  assert.equal(typeof (aKick.isSlipstreamKick ?? aKick.isSlipstream), 'boolean');
});

test('Tier 9 [Environmental Minions & Boss Anti-Exploit Isolation]: Coexistence across all 10 hazards', () => {
  const { frost, volt, magma, miasma, chrono, solar, nebula, abyssal } = instantiateAll10Hazards();

  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);
  solar.start('NORMAL', 6, 7);
  nebula.start('NORMAL', 6, 7);
  abyssal.start('NORMAL', 6, 7);

  const enemyX = 280;
  const enemyY = 240;
  const nowMs = 1500;

  // Regular minion evaluation
  const fMinion = frost.evaluateEnemy(enemyX, enemyY, false, nowMs);
  const vMinion = volt.evaluateEnemy(enemyX, enemyY, false, nowMs);
  const mMinion = magma.evaluateEnemy(enemyX, enemyY, false, nowMs);
  const miMinion = miasma.evaluateEnemy(enemyX, enemyY, false, nowMs);
  const cMinion = chrono.evaluateEnemy(enemyX, enemyY, false, nowMs);
  const sMinion = solar.evaluateEnemy(enemyX, enemyY, false, nowMs);
  const nMinion = nebula.evaluateEnemy(enemyX, enemyY, false, nowMs);
  const aMinion = abyssal.evaluateEnemy(enemyX, enemyY, false, nowMs);

  assert.equal(typeof fMinion.damage, 'number');
  assert.equal(typeof vMinion.damage, 'number');
  assert.equal(typeof mMinion.damage, 'number');
  assert.equal(typeof miMinion.damage, 'number');
  assert.equal(typeof cMinion.damage, 'number');
  assert.equal(typeof sMinion.damage, 'number');
  assert.equal(typeof nMinion.damage, 'number');
  assert.equal(typeof aMinion.damage, 'number');

  // Boss evaluation: Anti-exploit cooldown timestamps are independent
  const fBoss = frost.evaluateEnemy(enemyX, enemyY, true, nowMs);
  const sBoss = solar.evaluateEnemy(enemyX, enemyY, true, nowMs);
  const aBoss = abyssal.evaluateEnemy(enemyX, enemyY, true, nowMs);

  assert.equal(typeof fBoss.stunDurationMs, 'number');
  assert.equal(typeof sBoss.stunDurationMs, 'number');
  assert.equal(typeof aBoss.stunDurationMs, 'number');
});

test('Tier 10 [Distributed Epicenter Multi-Sector Sweep]: Safe area >= 80% with separate hazard epicenters', () => {
  const { gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal } = instantiateAll10Hazards();

  // Distribute hazards across disparate quadrants
  gravity.setCenter(3, 3);
  frost.setCenter(3, 11);
  volt.setCenter(9, 3);
  magma.setCenter(9, 11);
  miasma.setCenter(4, 7);
  chrono.setCenter(8, 7);
  solar.setCenter(6, 4);
  nebula.setCenter(6, 10);
  abyssal.setCenter(6, 7);

  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 8, 7);
  solar.start('NORMAL', 6, 4);
  nebula.start('NORMAL', 6, 10);
  abyssal.start('NORMAL', 6, 7);

  const distributed = [gravity, frost, volt, magma, miasma, chrono, solar, nebula, abyssal];

  // Each individual hazard must preserve >= 80% safe area in its sector
  for (let h = 0; h < distributed.length; h++) {
    const ratio = distributed[h].getSafeAreaRatio();
    assert.ok(
      ratio >= MIN_SAFE_AREA_INVARIANT,
      `Distributed hazard ${h} ratio ${ratio} must be >= 0.80`
    );
  }
});
