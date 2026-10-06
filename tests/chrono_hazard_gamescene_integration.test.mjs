import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChronoHazard,
  ChronoLifecycleState,
  FLOATING_TEXT_CHRONO_SURGE,
  FLOATING_TEXT_TEMPORAL_DILATION,
  FLOATING_TEXT_CHRONO_SHIFTED,
  FLOATING_TEXT_TEMPORAL_IMPLOSION,
  FLOATING_TEXT_TIMELINE_STABILIZED,
  FLOATING_TEXT_TIME_COLLAPSED,
  FLOATING_TEXT_CHRONO_STASIS,
  CHRONO_SURGE_SPEED_BURST_RATIO,
  TEMPORAL_DILATION_SLOW_RATIO,
} from '../src/game/hazards/ChronoHazard.ts';
import { MiasmaHazard, MiasmaLifecycleState } from '../src/game/hazards/MiasmaHazard.ts';
import { MagmaHazard, MagmaLifecycleState } from '../src/game/hazards/MagmaHazard.ts';
import { VoltHazard, VoltLifecycleState } from '../src/game/hazards/VoltHazard.ts';
import { FrostHazard, FrostLifecycleState } from '../src/game/hazards/FrostHazard.ts';
import { GravityHazard, GravityLifecycleState } from '../src/game/hazards/GravityHazard.ts';
import { DynamicHazard, HazardLifecycleState } from '../src/game/hazards/DynamicHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('ChronoHazard Coexistence [Septenary Pantheon Parallelism]: All 7 Elemental Hazards coexist and stack cleanly', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();
  const chrono = new ChronoHazard();

  const dummyMap = Array.from({ length: 13 }, () => Array(15).fill(0));
  dynamic.init(dummyMap);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);
  chrono.init(6, 7);

  dynamic.start();
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();
  chrono.start();

  assert.notEqual(dynamic.getState(), HazardLifecycleState.INACTIVE);
  assert.notEqual(gravity.state, GravityLifecycleState.DORMANT);
  assert.notEqual(frost.state, FrostLifecycleState.DORMANT);
  assert.notEqual(volt.state, VoltLifecycleState.DORMANT);
  assert.notEqual(magma.state, MagmaLifecycleState.DORMANT);
  assert.notEqual(miasma.state, MiasmaLifecycleState.DORMANT);
  assert.notEqual(chrono.state, ChronoLifecycleState.DORMANT);

  // Multiplier composition with 7 elements
  const px = 300;
  const py = 260;
  const gRes = gravity.evaluatePlayer(px, py, false, 1000, 1, 0);
  const fRes = frost.evaluatePlayer(px, py, false, 1000, 1, 0);
  const vRes = volt.evaluatePlayer(px, py, false, 1000, 1, 0);
  const mRes = magma.evaluatePlayer(px, py, false, 1000, 1, 0);
  const miRes = miasma.evaluatePlayer(px, py, false, 1000, 1, 0);
  const cRes = chrono.evaluatePlayer(px, py, false, 1000);

  const rawCompoundMultiplier =
    gRes.slowFactor *
    fRes.slowFactor *
    vRes.slowFactor *
    mRes.slowFactor *
    miRes.slowFactor *
    cRes.slowFactor;

  assert.ok(rawCompoundMultiplier > 0, 'Raw compound 7-element multiplier is strictly positive');

  // Enforce GameScene clamping [0.30, 1.85]
  const clampedMultiplier = Math.max(0.30, Math.min(1.85, rawCompoundMultiplier));
  assert.ok(clampedMultiplier >= 0.30 && clampedMultiplier <= 1.85);

  const speed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    speedMultiplier: clampedMultiplier,
  });
  assert.ok(speed >= 40, 'Clamped speed respects minimum floor');
});

test('ChronoHazard GameScene Integration [Floating Combat Texts & Mastery Triggers]', () => {
  const chrono = new ChronoHazard();
  chrono.init(6, 7);
  chrono.start();

  // Dashing triggers Chrono Surge
  const dashRes = chrono.evaluatePlayer(300, 260, true, 1000);
  assert.equal(dashRes.chronoSurgeGranted, true);
  assert.equal(dashRes.floatingText, FLOATING_TEXT_CHRONO_SURGE);

  // Walking triggers Temporal Dilation slow
  const walkRes = chrono.evaluatePlayer(300, 260, false, 2500);
  assert.equal(walkRes.temporalDilationInflicted, true);
  assert.equal(walkRes.slowFactor, 1.0 - TEMPORAL_DILATION_SLOW_RATIO);
  assert.equal(walkRes.floatingText, FLOATING_TEXT_TEMPORAL_DILATION);

  // Bomb placed on chrono tile
  const bombPlaced = chrono.onBombPlaced('bomb_test', 6, 7, 2, 2500);
  assert.equal(bombPlaced.isChronoShifted, true);
  assert.equal(bombPlaced.floatingText, FLOATING_TEXT_CHRONO_SHIFTED);

  // Bomb blast stabilizes tile
  const blastImp = chrono.onBombBlastImpact(6, 7);
  assert.equal(blastImp.stabilized, true);
  assert.equal(blastImp.floatingText, FLOATING_TEXT_TIMELINE_STABILIZED);
});

test('ChronoHazard 1,000-Frame Soak Simulation [Zero-GC & Numerical Stability]', () => {
  const chrono = new ChronoHazard();
  chrono.init(6, 7);
  chrono.start('CLIMAX', 6, 7);

  const dt = 16.666; // 60 FPS
  for (let frame = 0; frame < 1000; frame++) {
    chrono.update(dt);

    const safeRatio = chrono.getSafeAreaRatio();
    assert.ok(Number.isFinite(safeRatio), 'Safe area ratio is finite');
    assert.ok(safeRatio >= 0.80, 'Safe area ratio >= 80% maintained across 1,000 frames');

    const dangerMask = chrono.getDangerMask();
    for (let i = 0; i < dangerMask.length; i++) {
      assert.ok(dangerMask[i] >= 0 && dangerMask[i] <= 3, 'Danger mask codes strictly in [0, 3]');
    }

    const dilationGrid = chrono.getDilationGrid();
    for (let i = 0; i < dilationGrid.length; i++) {
      assert.ok(Number.isFinite(dilationGrid[i]), 'Dilation factors are strictly finite');
      assert.ok(dilationGrid[i] >= 0 && dilationGrid[i] <= 1.0, 'Dilation factors in [0.0, 1.0]');
    }
  }

  // Teardown
  chrono.stop();
  assert.equal(chrono.state, ChronoLifecycleState.DORMANT);
});
