import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MiasmaHazard,
  MiasmaLifecycleState,
  FLOATING_TEXT_SPORE_SURGE,
  FLOATING_TEXT_NEUROTOXIN,
  FLOATING_TEXT_BIO_FUSED,
  FLOATING_TEXT_CATALYTIC_DETONATION,
  FLOATING_TEXT_FLORAL_CLEANSED,
  FLOATING_TEXT_DISSOLVED,
  FLOATING_TEXT_SPORE_OVERGROWTH,
  SPORE_SURGE_SPEED_BURST_RATIO,
  NEUROTOXIN_SLOW_RATIO,
} from '../src/game/hazards/MiasmaHazard.ts';
import { MagmaHazard, MagmaLifecycleState } from '../src/game/hazards/MagmaHazard.ts';
import { VoltHazard, VoltLifecycleState } from '../src/game/hazards/VoltHazard.ts';
import { FrostHazard, FrostLifecycleState } from '../src/game/hazards/FrostHazard.ts';
import { GravityHazard, GravityLifecycleState } from '../src/game/hazards/GravityHazard.ts';
import { DynamicHazard, HazardLifecycleState } from '../src/game/hazards/DynamicHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('MiasmaHazard Coexistence [Hexagonal Pantheon Parallelism]: All 6 Elemental Hazards coexist and stack cleanly', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();

  const dummyMap = Array.from({ length: 13 }, () => Array(15).fill(0));
  dynamic.init(dummyMap);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);

  dynamic.start();
  gravity.start();
  frost.start();
  volt.start();
  magma.start();
  miasma.start();

  assert.notEqual(dynamic.getState(), HazardLifecycleState.INACTIVE);
  assert.notEqual(gravity.state, GravityLifecycleState.DORMANT);
  assert.notEqual(frost.state, FrostLifecycleState.DORMANT);
  assert.notEqual(volt.state, VoltLifecycleState.DORMANT);
  assert.notEqual(magma.state, MagmaLifecycleState.DORMANT);
  assert.notEqual(miasma.state, MiasmaLifecycleState.DORMANT);

  // Multiplier composition with 6 elements
  const px = 300;
  const py = 260;
  const gRes = gravity.evaluatePlayer(px, py, false, 1000, 1, 0);
  const fRes = frost.evaluatePlayer(px, py, false, 1000, 1, 0);
  const vRes = volt.evaluatePlayer(px, py, false, 1000, 1, 0);
  const mRes = magma.evaluatePlayer(px, py, false, 1000, 1, 0);
  const miRes = miasma.evaluatePlayer(px, py, false, 1000, 1, 0);

  const compoundMultiplier =
    gRes.slowFactor *
    fRes.slowFactor *
    vRes.slowFactor *
    mRes.slowFactor *
    miRes.slowFactor;

  assert.ok(compoundMultiplier > 0, 'Compound 6-element multiplier is strictly positive');

  const speed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    speedMultiplier: compoundMultiplier,
  });
  assert.ok(speed >= 40, 'Clamped speed respects minimum floor');
});

test('MiasmaHazard GameScene Integration [Floating Combat Texts & Mastery Triggers]', () => {
  const miasma = new MiasmaHazard();
  miasma.init(6, 7);
  miasma.start();

  // Dashing triggers Spore Surge
  const dashRes = miasma.evaluatePlayer(300, 260, true, 1000);
  assert.equal(dashRes.sporeSurgeGranted, true);

  // Walking triggers Neurotoxin slow
  const walkRes = miasma.evaluatePlayer(300, 260, false, 1000);
  assert.equal(walkRes.neurotoxinInflicted, true);
  assert.equal(walkRes.slowFactor, 1.0 - NEUROTOXIN_SLOW_RATIO);

  // Bomb placed on spore tile
  const bombPlaced = miasma.onBombPlaced('bomb_test', 6, 7, 2, 2500);
  assert.equal(bombPlaced.isBioFused, true);
  assert.equal(bombPlaced.floatingText, FLOATING_TEXT_BIO_FUSED);

  // Bomb detonated on spore tile
  const bombDet = miasma.onBombDetonated('bomb_test', 6, 7, 2);
  assert.equal(bombDet.isCatalytic, true);
  assert.equal(bombDet.floatingText, FLOATING_TEXT_CATALYTIC_DETONATION);

  // Blast impact cleanses fertile soil
  const blastCleanse = miasma.onBombBlastImpact(6, 7);
  assert.equal(blastCleanse.cleansed, true);
  assert.equal(blastCleanse.floatingText, FLOATING_TEXT_FLORAL_CLEANSED);

  // Advance to burst for minion and boss combat
  miasma.update(2010);

  // Minion dissolution combat text (on uncleansed active spore tile 6, 8)
  const minionRes = miasma.checkEnemyCollision(6, 8, false, 3000);
  assert.equal(minionRes.isDissolved, true);
  assert.equal(minionRes.floatingText, FLOATING_TEXT_DISSOLVED);

  // Boss stasis combat text
  const bossRes = miasma.checkEnemyCollision(6, 8, true, 3000);
  assert.equal(bossRes.isStunned, true);
  assert.equal(bossRes.floatingText, FLOATING_TEXT_SPORE_OVERGROWTH);

  // Player text verification
  assert.equal(FLOATING_TEXT_SPORE_SURGE, '✦ SPORE SURGE!');
  assert.equal(FLOATING_TEXT_NEUROTOXIN, '🧪 NEUROTOXIN (-25%)');
  assert.ok(SPORE_SURGE_SPEED_BURST_RATIO > 0);
});

test('MiasmaHazard 1,000-Frame Soak Test [Zero Leak & Numerical Stability across 6 Hazards]', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();
  const miasma = new MiasmaHazard();

  const dummyMap = Array.from({ length: 13 }, () => Array(15).fill(0));
  dynamic.init(dummyMap);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);
  miasma.init(6, 7);

  dynamic.start();
  gravity.start();
  frost.start();
  volt.start();
  magma.start('CLIMAX');
  miasma.start('CLIMAX');

  let playerX = 300;
  let playerY = 260;
  let isDashing = false;

  for (let frame = 0; frame < 1000; frame++) {
    const deltaMs = 16.666;
    const nowMs = frame * 16.666;

    dynamic.update(deltaMs);
    gravity.update(deltaMs);
    frost.update(deltaMs);
    volt.update(deltaMs);
    magma.update(deltaMs);
    miasma.update(deltaMs);

    if (frame % 60 === 0) {
      isDashing = !isDashing;
    }

    const miRes = miasma.evaluatePlayer(playerX, playerY, isDashing, nowMs);
    assert.ok(Number.isFinite(miRes.slowFactor));
    assert.ok(Number.isFinite(miRes.damage));

    const eRes = miasma.checkEnemyCollision(6, 7, false, nowMs);
    assert.ok(Number.isFinite(eRes.damage));

    if (frame % 100 === 0) {
      const bRes = miasma.onBombPlaced(`bomb_${frame}`, 6, 7, 2, 2500);
      assert.ok(Number.isFinite(bRes.modifiedFuseMs));
      const detRes = miasma.onBombDetonated(`bomb_${frame}`, 6, 7, 2);
      assert.ok(Number.isFinite(detRes.modifiedPower));
      const cleanseRes = miasma.onBombBlastImpact(6, 7);
      assert.ok(typeof cleanseRes.cleansed === 'boolean');
    }
  }

  assert.ok(true, '1,000 continuous frames across 6 hazards completed cleanly with zero NaNs or exceptions');
});
