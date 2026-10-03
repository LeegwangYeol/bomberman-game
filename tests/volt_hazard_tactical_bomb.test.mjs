import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VoltHazard,
  VoltLifecycleState,
  VOLT_FUSE_ACCELERATION_MS,
  CHAIN_LIGHTNING_EXTRA_POWER,
  CHAIN_LIGHTNING_BONUS_SCORE,
  ENEMY_VOLT_BURST_DAMAGE,
  ENEMY_VOLT_SCORE,
  ENEMY_VOLT_ULTIMATE_CHARGE,
  BOSS_EMP_STASIS_STUN_MS,
  DURATION_IONIZATION_TELEGRAPH_MS,
  DURATION_LIGHTNING_DISCHARGE_MS,
} from '../src/game/hazards/VoltHazard.ts';

test('VoltHazard Tactical Bomb [Volt-Charged Bomb]: Placing bomb on ionized tile accelerates fuse by 1.2s', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  const originalFuse = 2500;
  const res = hazard.onBombPlaced('b_volt_1', 6, 7, 2, originalFuse);
  assert.equal(res.isVoltCharged, true);
  assert.equal(res.modifiedFuseMs, originalFuse - VOLT_FUSE_ACCELERATION_MS);
  assert.equal(res.fuseDeltaMs, -VOLT_FUSE_ACCELERATION_MS);
});

test('VoltHazard Tactical Bomb [Chain Lightning]: Detonating bomb on ionized tile adds +2 power & +200 score', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  const basePower = 3;
  const res = hazard.onBombDetonated('b_volt_1', 6, 7, basePower);
  assert.equal(res.isChainLightning, true);
  assert.equal(res.modifiedPower, basePower + CHAIN_LIGHTNING_EXTRA_POWER);
  assert.equal(res.bonusScore, CHAIN_LIGHTNING_BONUS_SCORE);
  assert.equal(res.piercing, true);
});

test('VoltHazard Minion Combat [Electro-Vaporization]: Minions inside discharge take 120 damage & grant rewards', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  // Advance to discharge burst
  hazard.update(DURATION_IONIZATION_TELEGRAPH_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);

  const res = hazard.checkEnemyCollision(6, 7, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.isVaporized, true);
  assert.equal(res.damage, ENEMY_VOLT_BURST_DAMAGE);
  assert.equal(res.scoreBonus, ENEMY_VOLT_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_VOLT_ULTIMATE_CHARGE);
});

test('VoltHazard Boss Combat [EMP Overload Stasis]: Boss takes stasis stun with single-hit anti-exploit guard', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  // Advance to discharge burst
  hazard.update(DURATION_IONIZATION_TELEGRAPH_MS + 10);
  assert.equal(hazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);

  // First hit on boss
  const hit1 = hazard.checkEnemyCollision(6, 7, true, 3000);
  assert.equal(hit1.hit, true);
  assert.equal(hit1.isEmpStunned, true);
  assert.equal(hit1.stunDurationMs, BOSS_EMP_STASIS_STUN_MS);

  // Immediate subsequent check in same burst: should NOT hit boss again (anti-exploit guard)
  const hit2 = hazard.checkEnemyCollision(6, 7, true, 3016);
  assert.equal(hit2.hit, false, 'Anti-exploit single-hit guard suppresses repeated boss damage in same burst');

  // Next burst cycle after cooldown
  hazard.update(DURATION_LIGHTNING_DISCHARGE_MS + 10); // Enter cooldown
  hazard.update(18000 + 10); // Re-enter telegraph
  hazard.update(DURATION_IONIZATION_TELEGRAPH_MS + 10); // Re-enter discharge
  assert.equal(hazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);

  const hit3 = hazard.checkEnemyCollision(6, 7, true, 25000);
  assert.equal(hit3.hit, true, 'Boss can take EMP stasis again in a new discharge cycle');
});

test('VoltHazard Ground Impact [Blast Grounding]: Bomb blast on tile discharges tile conductance', () => {
  const hazard = new VoltHazard();
  hazard.init(6, 7);
  hazard.start();

  const res = hazard.onBombBlastImpact(6, 7);
  assert.equal(res.grounded, true);
});
