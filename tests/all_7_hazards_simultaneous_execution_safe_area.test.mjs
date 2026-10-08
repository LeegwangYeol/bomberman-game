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
  calculateClampedPlayerSpeed,
} from '../src/game/gameplay_mechanics.ts';
import {
  ROWS,
  COLS,
} from '../src/game/pathfinding.ts';

const TOTAL_TILES = ROWS * COLS; // 13 * 15 = 195
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
        isDangerous = true;
        break;
      }
    }
    if (isDangerous) {
      dangerousTileCount++;
    }
  }
  return (TOTAL_TILES - dangerousTileCount) / TOTAL_TILES;
}

test('Tier 1 [Baseline Invariants]: Initial construction of all 7 hazards preserves 100% safe area', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const map = createStandardMap();
  dynamic.init(map);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  const allHazards = [dynamic, gravity, frost, volt, magma, miasma, chrono];

  // Inactive / Dormant states
  assert.equal(dynamic.getState(), DynamicLifecycleState.INACTIVE);
  assert.equal(gravity.getState(), GravityLifecycleState.DORMANT);
  assert.equal(frost.getState(), FrostLifecycleState.DORMANT);
  assert.equal(volt.getState(), VoltLifecycleState.DORMANT);
  assert.equal(magma.getState(), MagmaLifecycleState.DORMANT);
  assert.equal(miasma.getState(), MiasmaLifecycleState.DORMANT);
  assert.equal(chrono.getState(), ChronoLifecycleState.DORMANT);

  // Individual safe area ratios must all satisfy >= 80% invariant
  for (let i = 0; i < allHazards.length; i++) {
    const ratio = allHazards[i].getSafeAreaRatio();
    assert.ok(ratio >= MIN_SAFE_AREA_INVARIANT, `Hazard ${i} baseline safe area ratio ${ratio} must be >= 0.80`);
  }

  // Composite safe area ratio must be 1.0 (100%)
  const compositeRatio = calculateCompositeSafeAreaRatio(allHazards);
  assert.equal(compositeRatio, 1.0, 'Baseline composite safe area ratio must be 1.0');
});

test('Tier 2 [Simultaneous Activation]: Starting all 7 hazards strictly preserves safe area >= 80% invariant', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const map = createStandardMap();
  dynamic.init(map);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  // Simultaneous activation
  dynamic.start('OUTBREAK');
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);

  // Verify non-dormant states
  assert.notEqual(dynamic.getState(), DynamicLifecycleState.INACTIVE);
  assert.notEqual(gravity.getState(), GravityLifecycleState.DORMANT);
  assert.notEqual(frost.getState(), FrostLifecycleState.DORMANT);
  assert.notEqual(volt.getState(), VoltLifecycleState.DORMANT);
  assert.notEqual(magma.getState(), MagmaLifecycleState.DORMANT);
  assert.notEqual(miasma.getState(), MiasmaLifecycleState.DORMANT);
  assert.notEqual(chrono.getState(), ChronoLifecycleState.DORMANT);

  const allHazards = [dynamic, gravity, frost, volt, magma, miasma, chrono];

  // Verify every individual hazard strictly satisfies safe area >= 80%
  for (let i = 0; i < allHazards.length; i++) {
    const ratio = allHazards[i].getSafeAreaRatio();
    assert.ok(
      ratio >= MIN_SAFE_AREA_INVARIANT,
      `Hazard ${i} individual safe area ratio ${ratio} must be >= 0.80`
    );
  }

  // Verify composite safe area ratio across all 7 simultaneously executing hazards
  const compositeRatio = calculateCompositeSafeAreaRatio(allHazards);
  assert.ok(
    compositeRatio >= MIN_SAFE_AREA_INVARIANT,
    `Composite safe area ratio ${compositeRatio} must be >= 0.80 upon simultaneous activation`
  );
  assert.ok(compositeRatio >= 0.82, `Composite safe area observed >= 82% (got ${(compositeRatio * 100).toFixed(2)}%)`);
});

test('Tier 3 [Simultaneous Full-Phase Cycling]: Safe area >= 80% invariant maintained across all phase transitions', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const map = createStandardMap();
  dynamic.init(map);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  dynamic.start('OUTBREAK');
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);

  const allHazards = [dynamic, gravity, frost, volt, magma, miasma, chrono];

  // Step through specific key lifecycle milestones
  const milestonesMs = [100, 500, 1000, 1500, 1900, 2050, 2150, 2300, 2500, 3000, 4000, 6000, 8000];

  let currentElapsed = 0;
  for (const targetMs of milestonesMs) {
    const stepDelta = targetMs - currentElapsed;
    currentElapsed = targetMs;

    for (let h = 0; h < allHazards.length; h++) {
      allHazards[h].update(stepDelta);
    }

    // Verify individual ratios
    for (let h = 0; h < allHazards.length; h++) {
      const ratio = allHazards[h].getSafeAreaRatio();
      assert.ok(
        ratio >= MIN_SAFE_AREA_INVARIANT,
        `At ${targetMs}ms, hazard ${h} ratio ${ratio} must be >= 0.80`
      );
    }

    // Verify composite ratio
    const compRatio = calculateCompositeSafeAreaRatio(allHazards);
    assert.ok(
      compRatio >= MIN_SAFE_AREA_INVARIANT,
      `At ${targetMs}ms, composite ratio ${compRatio} must be >= 0.80`
    );
  }
});

test('Tier 4 [10,000-Frame Long-Running Soak Test]: 10,000 continuous frames of 7 hazards strictly preserves safe area >= 80%', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const map = createStandardMap();
  dynamic.init(map);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  dynamic.start('OUTBREAK');
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);

  const allHazards = [dynamic, gravity, frost, volt, magma, miasma, chrono];

  const dt = 16.666; // 60 FPS
  const totalFrames = 10000;

  let minObservedDyn = 1.0;
  let minObservedGrav = 1.0;
  let minObservedFrost = 1.0;
  let minObservedVolt = 1.0;
  let minObservedMagma = 1.0;
  let minObservedMiasma = 1.0;
  let minObservedChrono = 1.0;
  let minObservedComposite = 1.0;

  const startTime = performance.now();

  for (let frame = 0; frame < totalFrames; frame++) {
    // Simultaneous update step
    dynamic.update(dt);
    gravity.update(dt);
    frost.update(dt);
    volt.update(dt);
    magma.update(dt);
    miasma.update(dt);
    chrono.update(dt);

    const rDyn = dynamic.getSafeAreaRatio();
    const rGrav = gravity.getSafeAreaRatio();
    const rFrost = frost.getSafeAreaRatio();
    const rVolt = volt.getSafeAreaRatio();
    const rMagma = magma.getSafeAreaRatio();
    const rMiasma = miasma.getSafeAreaRatio();
    const rChrono = chrono.getSafeAreaRatio();

    if (rDyn < minObservedDyn) minObservedDyn = rDyn;
    if (rGrav < minObservedGrav) minObservedGrav = rGrav;
    if (rFrost < minObservedFrost) minObservedFrost = rFrost;
    if (rVolt < minObservedVolt) minObservedVolt = rVolt;
    if (rMagma < minObservedMagma) minObservedMagma = rMagma;
    if (rMiasma < minObservedMiasma) minObservedMiasma = rMiasma;
    if (rChrono < minObservedChrono) minObservedChrono = rChrono;

    // Strict individual invariants per frame
    assert.ok(rDyn >= MIN_SAFE_AREA_INVARIANT, `Frame ${frame}: Dynamic safe ratio ${rDyn} < 0.80`);
    assert.ok(rGrav >= MIN_SAFE_AREA_INVARIANT, `Frame ${frame}: Gravity safe ratio ${rGrav} < 0.80`);
    assert.ok(rFrost >= MIN_SAFE_AREA_INVARIANT, `Frame ${frame}: Frost safe ratio ${rFrost} < 0.80`);
    assert.ok(rVolt >= MIN_SAFE_AREA_INVARIANT, `Frame ${frame}: Volt safe ratio ${rVolt} < 0.80`);
    assert.ok(rMagma >= MIN_SAFE_AREA_INVARIANT, `Frame ${frame}: Magma safe ratio ${rMagma} < 0.80`);
    assert.ok(rMiasma >= MIN_SAFE_AREA_INVARIANT, `Frame ${frame}: Miasma safe ratio ${rMiasma} < 0.80`);
    assert.ok(rChrono >= MIN_SAFE_AREA_INVARIANT, `Frame ${frame}: Chrono safe ratio ${rChrono} < 0.80`);

    // Verify composite safe area invariant periodically and during transitions
    if (frame % 5 === 0) {
      const compRatio = calculateCompositeSafeAreaRatio(allHazards);
      if (compRatio < minObservedComposite) minObservedComposite = compRatio;
      assert.ok(
        compRatio >= MIN_SAFE_AREA_INVARIANT,
        `Frame ${frame}: Composite safe ratio ${compRatio} < 0.80`
      );
    }
  }

  const durationMs = performance.now() - startTime;
  const usPerFrame = (durationMs / totalFrames) * 1000;

  // Assert minimum observed bounds
  assert.ok(minObservedDyn >= MIN_SAFE_AREA_INVARIANT, 'Dynamic min >= 0.80');
  assert.ok(minObservedGrav >= MIN_SAFE_AREA_INVARIANT, 'Gravity min >= 0.80');
  assert.ok(minObservedFrost >= MIN_SAFE_AREA_INVARIANT, 'Frost min >= 0.80');
  assert.ok(minObservedVolt >= MIN_SAFE_AREA_INVARIANT, 'Volt min >= 0.80');
  assert.ok(minObservedMagma >= MIN_SAFE_AREA_INVARIANT, 'Magma min >= 0.80');
  assert.ok(minObservedMiasma >= MIN_SAFE_AREA_INVARIANT, 'Miasma min >= 0.80');
  assert.ok(minObservedChrono >= MIN_SAFE_AREA_INVARIANT, 'Chrono min >= 0.80');
  assert.ok(minObservedComposite >= MIN_SAFE_AREA_INVARIANT, 'Composite min >= 0.80');

  // Performance budget: < 150 µs per frame across all 7 simultaneous hazards
  assert.ok(
    usPerFrame < 150,
    `10,000 frames took ${durationMs.toFixed(2)} ms (${usPerFrame.toFixed(2)} µs/frame, budget < 150 µs)`
  );
});

test('Tier 5 [Climax High-Throughput Stress]: Accelerated cooldowns maintain safe area >= 80% invariant', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const map = createStandardMap();
  dynamic.init(map);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  dynamic.start('CLIMAX');
  gravity.start();
  frost.start();
  volt.start();
  magma.start('CLIMAX');
  miasma.start('CLIMAX');
  chrono.start('CLIMAX', 6, 7);

  const allHazards = [dynamic, gravity, frost, volt, magma, miasma, chrono];

  const dt = 16.666;
  for (let frame = 0; frame < 3000; frame++) {
    for (let h = 0; h < allHazards.length; h++) {
      allHazards[h].update(dt);
    }

    // Every individual hazard must strictly preserve safe area >= 80%
    assert.ok(dynamic.getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT);
    assert.ok(gravity.getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT);
    assert.ok(frost.getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT);
    assert.ok(volt.getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT);
    assert.ok(magma.getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT);
    assert.ok(miasma.getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT);
    assert.ok(chrono.getSafeAreaRatio() >= MIN_SAFE_AREA_INVARIANT);

    // Dynamic hazard in CLIMAX preserves >= 80% on standard arena
    assert.ok(dynamic.getSafeAreaRatio() >= 0.80);
  }
});

test('Tier 6 [Player Combat Mastery & Speed Stacking]: Multipliers compose and respect minimum speed floor', () => {
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);

  const px = 280;
  const py = 240;
  const nowMs = 1500;

  // Walking: slow debuff stacking
  const gRes = gravity.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const fRes = frost.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const vRes = volt.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const mRes = magma.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const miRes = miasma.evaluatePlayer(px, py, false, nowMs, 1, 0);
  const cRes = chrono.evaluatePlayer(px, py, false, nowMs);

  const rawMultiplier =
    gRes.slowFactor *
    fRes.slowFactor *
    vRes.slowFactor *
    mRes.slowFactor *
    miRes.slowFactor *
    cRes.slowFactor;

  assert.ok(Number.isFinite(rawMultiplier), 'Raw multiplier is finite');
  assert.ok(rawMultiplier > 0, 'Raw multiplier is strictly positive');

  // Enforce GameScene clamping [0.30, 1.85]
  const clampedMultiplier = Math.max(0.30, Math.min(1.85, rawMultiplier));
  const finalSpeed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    speedMultiplier: clampedMultiplier,
  });

  assert.ok(finalSpeed >= 40, `Clamped speed ${finalSpeed} strictly respects minimum floor 40 px/s`);

  // Dashing: mastery buff triggers
  const dashG = gravity.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashF = frost.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashV = volt.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashM = magma.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashMi = miasma.evaluatePlayer(px, py, true, nowMs, 1, 0);
  const dashC = chrono.evaluatePlayer(px, py, true, nowMs);

  assert.equal(typeof dashG.isEscaping, 'boolean');
  assert.equal(typeof dashF.thermalBreakGranted, 'boolean');
  assert.equal(typeof dashV.superconductorDashGranted, 'boolean');
  assert.equal(typeof dashM.magmaSurfGranted, 'boolean');
  assert.equal(typeof dashMi.sporeSurgeGranted, 'boolean');
  assert.equal(typeof dashC.chronoSurgeGranted, 'boolean');
});

test('Tier 7 [Tactical Bomb Simultaneous Interactivity]: Placing, detonating, and blast cleansing on shared center', () => {
  const dynamic = new DynamicHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const map = createStandardMap();
  dynamic.init(map);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  dynamic.start('OUTBREAK');
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start('NORMAL', 6, 7);

  const bombId = 'test_bomb_simultaneous';
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

  assert.ok(Number.isFinite(dPlace.fuseTimerMs || fuseMs));
  assert.ok(Number.isFinite(fPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(vPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(mPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(miPlace.modifiedFuseMs));
  assert.ok(Number.isFinite(cPlace.modifiedFuseMs));

  // Bomb Detonated across all hazards
  const dDet = dynamic.onBombDetonated(bombId, row, col, power);
  const fDet = frost.onBombDetonated(bombId, row, col, power);
  const vDet = volt.onBombDetonated(bombId, row, col, power);
  const mDet = magma.onBombDetonated(bombId, row, col, power);
  const miDet = miasma.onBombDetonated(bombId, row, col, power);
  const cDet = chrono.onBombDetonated(bombId, row, col, power);

  assert.ok(Number.isFinite(dDet.bonusPower || power));
  assert.ok(Number.isFinite(fDet.modifiedPower));
  assert.ok(Number.isFinite(vDet.modifiedPower));
  assert.ok(Number.isFinite(mDet.modifiedPower));
  assert.ok(Number.isFinite(miDet.modifiedPower));
  assert.ok(Number.isFinite(cDet.modifiedPower));

  // Blast impact cleanses/thaws/grounds/quenches/stabilizes
  const dImpact = dynamic.onBombBlastImpact(row, col);
  const fImpact = frost.onBombBlastImpact(row, col);
  const vImpact = volt.onBombBlastImpact(row, col);
  const mImpact = magma.onBombBlastImpact(row, col);
  const miImpact = miasma.onBombBlastImpact(row, col);
  const cImpact = chrono.onBombBlastImpact(row, col);

  assert.equal(typeof dImpact.polarized, 'boolean');
  assert.equal(typeof fImpact, 'boolean');
  assert.equal(typeof vImpact.grounded, 'boolean');
  assert.equal(typeof mImpact.quenched, 'boolean');
  assert.equal(typeof miImpact.cleansed, 'boolean');
  assert.equal(typeof cImpact.stabilized, 'boolean');
});

test('Tier 8 [Full Grid Epicenter Spatial Invariant Sweep]: Safe area >= 80% across all inner arena epicenters', () => {
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const hazards = [gravity, frost, volt, magma, miasma, chrono];

  // Test across all playable interior centers
  for (let r = 2; r <= ROWS - 3; r++) {
    for (let c = 2; c <= COLS - 3; c++) {
      gravity.setCenter(r, c);
      frost.setCenter(r, c);
      volt.setCenter(r, c);
      magma.setCenter(r, c);
      miasma.setCenter(r, c);
      chrono.setCenter(r, c);

      gravity.start();
      frost.start();
      volt.start();
      magma.start();
      miasma.start();
      chrono.start('NORMAL', r, c);

      for (let h = 0; h < hazards.length; h++) {
        const ratio = hazards[h].getSafeAreaRatio();
        assert.ok(
          ratio >= MIN_SAFE_AREA_INVARIANT,
          `At (${r}, ${c}), hazard ${h} ratio ${ratio} must be >= 0.80`
        );
      }

      // Shared epicenter composite safe area
      const compositeRatio = calculateCompositeSafeAreaRatio(hazards);
      assert.ok(
        compositeRatio >= MIN_SAFE_AREA_INVARIANT,
        `At (${r}, ${c}), composite ratio ${compositeRatio} must be >= 0.80`
      );
    }
  }
});
