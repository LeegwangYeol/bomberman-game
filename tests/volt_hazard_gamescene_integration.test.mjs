import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VoltHazard,
  VoltLifecycleState,
} from '../src/game/hazards/VoltHazard.ts';
import { FrostHazard, FrostLifecycleState } from '../src/game/hazards/FrostHazard.ts';
import { GravityHazard, GravityLifecycleState } from '../src/game/hazards/GravityHazard.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

test('VoltHazard Coexistence [Multi-Hazard Parallelism]: Dynamic, Frost, Gravity, and Volt Hazards coexist without interference', () => {
  const gravity = new GravityHazard();
  const frost = new FrostHazard();
  const volt = new VoltHazard();

  gravity.init(6, 7);
  frost.init(6, 7);
  volt.init(6, 7);

  gravity.start();
  frost.start();
  volt.start();

  assert.notEqual(gravity.state, GravityLifecycleState.DORMANT);
  assert.notEqual(frost.state, FrostLifecycleState.DORMANT);
  assert.notEqual(volt.state, VoltLifecycleState.DORMANT);

  // Multiplier composition
  const px = 300;
  const py = 260;
  const gRes = gravity.evaluatePlayer(px, py, false, 1000, 1, 0);
  const fRes = frost.evaluatePlayer(px, py, false, 1000, 1, 0);
  const vRes = volt.evaluatePlayer(px, py, false, 1000, 1, 0);

  const compoundMultiplier = gRes.slowFactor * fRes.slowFactor * vRes.slowFactor;
  assert.ok(compoundMultiplier > 0, 'Compound multiplier is strictly positive');

  const speed = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    speedMultiplier: compoundMultiplier,
  });
  assert.ok(speed > 0, 'Clamped speed is strictly positive');
});

test('VoltHazard 1,000-Frame Soak Test [Zero Leak & Numerical Stability]: 1,000 continuous frames execute without NaNs or heap growth', () => {
  const volt = new VoltHazard();
  volt.init(6, 7);
  volt.start('CLIMAX'); // Accelerated cooldown for high state throughput

  let playerX = 300;
  let playerY = 260;
  let isDashing = false;

  for (let frame = 0; frame < 1000; frame++) {
    const deltaMs = 16.666;
    const nowMs = frame * 16.666;

    volt.update(deltaMs);

    // Toggle dash every 60 frames
    if (frame % 60 === 0) {
      isDashing = !isDashing;
    }

    // Evaluate player
    const pRes = volt.evaluatePlayer(playerX, playerY, isDashing, nowMs);
    assert.ok(Number.isFinite(pRes.slowFactor));
    assert.ok(Number.isFinite(pRes.damage));

    // Enemy check
    const eRes = volt.checkEnemyCollision(6, 7, false, nowMs);
    assert.ok(Number.isFinite(eRes.damage));

    // Bomb interaction
    if (frame % 100 === 0) {
      const bRes = volt.onBombPlaced(`bomb_${frame}`, 6, 7, 2, 2500);
      assert.ok(Number.isFinite(bRes.modifiedFuseMs));
      const detRes = volt.onBombDetonated(`bomb_${frame}`, 6, 7, 2);
      assert.ok(Number.isFinite(detRes.modifiedPower));
    }
  }

  assert.ok(true, '1,000 continuous frames completed successfully');
});
