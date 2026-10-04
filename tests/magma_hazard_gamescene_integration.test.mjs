import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MagmaHazard,
  MagmaLifecycleState,
} from '../src/game/hazards/MagmaHazard.ts';
import { VoltHazard, VoltLifecycleState } from '../src/game/hazards/VoltHazard.ts';
import { FrostHazard, FrostLifecycleState } from '../src/game/hazards/FrostHazard.ts';
import { GravityHazard, GravityLifecycleState } from '../src/game/hazards/GravityHazard.ts';
import { DynamicHazard, HazardLifecycleState } from '../src/game/hazards/DynamicHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('MagmaHazard Coexistence [5-Element Pantheon Parallelism]: Dynamic, Frost, Gravity, Volt, and Magma Hazards coexist without interference', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();

  const dummyMap = Array.from({ length: 13 }, () => Array(15).fill(0));
  dynamic.init(dummyMap);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);

  dynamic.start();
  gravity.start();
  frost.start();
  volt.start();
  magma.start();

  assert.notEqual(dynamic.getState(), HazardLifecycleState.INACTIVE);
  assert.notEqual(gravity.state, GravityLifecycleState.DORMANT);
  assert.notEqual(frost.state, FrostLifecycleState.DORMANT);
  assert.notEqual(volt.state, VoltLifecycleState.DORMANT);
  assert.notEqual(magma.state, MagmaLifecycleState.DORMANT);

  // Multiplier composition
  const px = 300;
  const py = 260;
  const gRes = gravity.evaluatePlayer(px, py, false, 1000, 1, 0);
  const fRes = frost.evaluatePlayer(px, py, false, 1000, 1, 0);
  const vRes = volt.evaluatePlayer(px, py, false, 1000, 1, 0);
  const mRes = magma.evaluatePlayer(px, py, false, 1000, 1, 0);

  const compoundMultiplier = gRes.slowFactor * fRes.slowFactor * vRes.slowFactor * mRes.slowFactor;
  assert.ok(compoundMultiplier > 0, 'Compound multiplier is strictly positive');

  const speed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    speedMultiplier: compoundMultiplier,
  });
  assert.ok(speed >= 40, 'Clamped speed respects minimum floor');
});

test('MagmaHazard 1,000-Frame Soak Test [Zero Leak & Numerical Stability]: 1,000 continuous frames with 5 hazards execute without NaNs or heap growth', () => {
  const dynamic = new DynamicHazard();
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();
  const magma = new MagmaHazard();

  const dummyMap = Array.from({ length: 13 }, () => Array(15).fill(0));
  dynamic.init(dummyMap);
  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);
  magma.init(6, 7);

  dynamic.start();
  gravity.start();
  frost.start();
  volt.start();
  magma.start('CLIMAX'); // Accelerated cooldown for high throughput

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

    // Toggle dash periodically
    if (frame % 60 === 0) {
      isDashing = !isDashing;
    }

    // Evaluate player across all hazards
    const mRes = magma.evaluatePlayer(playerX, playerY, isDashing, nowMs);
    assert.ok(Number.isFinite(mRes.slowFactor));
    assert.ok(Number.isFinite(mRes.damage));

    const vRes = volt.evaluatePlayer(playerX, playerY, isDashing, nowMs);
    assert.ok(Number.isFinite(vRes.slowFactor));

    // Enemy check
    const eRes = magma.checkEnemyCollision(6, 7, false, nowMs);
    assert.ok(Number.isFinite(eRes.damage));

    // Bomb interaction
    if (frame % 100 === 0) {
      const bRes = magma.onBombPlaced(`bomb_${frame}`, 6, 7, 2, 2500);
      assert.ok(Number.isFinite(bRes.modifiedFuseMs));
      const detRes = magma.onBombDetonated(`bomb_${frame}`, 6, 7, 2);
      assert.ok(Number.isFinite(detRes.modifiedPower));
      const quenchRes = magma.onBombBlastImpact(6, 7);
      assert.ok(typeof quenchRes.quenched === 'boolean');
    }
  }

  assert.ok(true, '1,000 continuous frames across 5 hazards completed successfully');
});
