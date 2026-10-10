import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NebulaHazard,
  NebulaLifecycleState,
  NEBULA_FUSE_ACCELERATION_MS,
  NEBULA_SUPER_BOMB_TINT,
  SINGULARITY_EXTRA_POWER,
  SINGULARITY_BONUS_SCORE,
  BOMB_KICK_NEBULA_SPEED,
  NEBULA_MINION_DAMAGE,
  ENEMY_NEBULA_SCORE,
  ENEMY_NEBULA_ULTIMATE_CHARGE,
  BOSS_NEBULA_STASIS_STUN_MS,
  BOSS_NEBULA_EXPLOIT_COOLDOWN_MS,
  STARDUST_CALM_DURATION_MS,
  DURATION_NEBULA_DRIFT_MS,
} from '../src/game/hazards/NebulaHazard.ts';

test('NebulaHazard Tactical Bomb [Nebula-Fused Bomb]: Placing bomb on nebula tile accelerates fuse with astral tint', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const res = hazard.onBombPlaced('b_nebula_1', 6, 7, 2, 2500);
  assert.equal(res.isAccelerated, true);
  assert.equal(res.fuseAccelerationMs, NEBULA_FUSE_ACCELERATION_MS);
  assert.equal(res.bombTint, NEBULA_SUPER_BOMB_TINT);
});

test('NebulaHazard Tactical Bomb [Singularity Burst]: Detonating bomb in collapse adds +2 power, +250 score', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to collapse burst
  hazard.update(DURATION_NEBULA_DRIFT_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);

  const basePower = 3;
  const res = hazard.onBombDetonated('b_nebula_1', 6, 7, basePower);
  assert.equal(res.isSingularity, true);
  assert.equal(res.extraPower, SINGULARITY_EXTRA_POWER);
  assert.equal(res.bonusScore, SINGULARITY_BONUS_SCORE);
});

test('NebulaHazard Tactical Bomb [Astral Slipstream Kick]: Kicking or sliding bomb over nebula tile accelerates to 460 px/s', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const kickRes = hazard.onBombKicked('b_nebula_1', 6, 7, 200);
  assert.equal(kickRes.isSlipstreamKick, true);
  assert.equal(kickRes.kickSpeed, BOMB_KICK_NEBULA_SPEED);

  const slideRes = hazard.evaluateBombSlide(6, 7, 200);
  assert.equal(slideRes.isSlipstreamKick, true);
  assert.equal(slideRes.kickSpeed, BOMB_KICK_NEBULA_SPEED);
});

test('NebulaHazard Ground Impact [Stardust Calm Anchor]: Bomb blast cleanses nebula into 4.0s safe sanctuary', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Impact single tile
  const res = hazard.onBombBlastImpact(6, 7);
  assert.equal(res.cleanedTilesCount, 1);
  assert.equal(res.durationMs, STARDUST_CALM_DURATION_MS);
  assert.equal(hazard.isTileCalm(6, 7), true);

  // Cleanse batch tiles
  const cleanseRes = hazard.cleanseNebulaAt([{ r: 6, c: 7 }, { r: 6, c: 8 }]);
  assert.ok(cleanseRes.cleanedTilesCount >= 1);
  assert.equal(cleanseRes.durationMs, STARDUST_CALM_DURATION_MS);

  // Cleansed anchor tile is safe from daze
  const playerEval = hazard.evaluatePlayer(7 * 40 + 20, 6 * 40 + 20, false, 1000);
  assert.equal(playerEval.hit, false);
  assert.equal(playerEval.dazeInflicted, false);
});

test('NebulaHazard Minion Combat [Cosmic Vaporization]: Minions inside collapse take 120 damage & grant rewards', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to collapse burst
  hazard.update(DURATION_NEBULA_DRIFT_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);

  const res = hazard.checkEnemyCollision(6, 7, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.isVaporized, true);
  assert.equal(res.damage, NEBULA_MINION_DAMAGE);
  assert.equal(res.scoreBonus, ENEMY_NEBULA_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_NEBULA_ULTIMATE_CHARGE);
});

test('NebulaHazard Boss Combat [Eclipse Stasis Stun]: Boss inside collapse suffers 1.5s stun with 2.5s anti-exploit guard', () => {
  const hazard = new NebulaHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to collapse burst
  hazard.update(DURATION_NEBULA_DRIFT_MS + 10);
  assert.equal(hazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);

  // Initial boss hit triggers stasis
  const res1 = hazard.checkEnemyCollision(6, 7, true, 3000);
  assert.equal(res1.hit, true);
  assert.equal(res1.isStunned, true);
  assert.equal(res1.isStasisStunned, true);
  assert.equal(res1.stunDurationMs, BOSS_NEBULA_STASIS_STUN_MS);

  // Immediate subsequent hit within anti-exploit window (2500ms) does not re-stun
  const res2 = hazard.checkEnemyCollision(6, 7, true, 3000 + BOSS_NEBULA_EXPLOIT_COOLDOWN_MS - 200);
  assert.equal(res2.hit, false);
  assert.equal(res2.isStunned, false);

  // Hit after anti-exploit window re-triggers stasis
  const res3 = hazard.checkEnemyCollision(6, 7, true, 3000 + BOSS_NEBULA_EXPLOIT_COOLDOWN_MS + 10);
  assert.equal(res3.hit, true);
  assert.equal(res3.isStunned, true);
});
