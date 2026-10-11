import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AbyssalHazard,
  AbyssalLifecycleState,
  ABYSSAL_FUSE_ACCELERATION_MS,
  ABYSSAL_SUPER_BOMB_TINT,
  MAELSTROM_EXTRA_POWER,
  MAELSTROM_BONUS_SCORE,
  BOMB_KICK_ABYSSAL_SPEED,
  ABYSSAL_MINION_DAMAGE,
  ENEMY_ABYSSAL_SCORE,
  ENEMY_ABYSSAL_ULTIMATE_CHARGE,
  BOSS_ABYSSAL_STASIS_STUN_MS,
  BOSS_ABYSSAL_EXPLOIT_COOLDOWN_MS,
  OCEANIC_CALM_DURATION_MS,
  DURATION_TIDAL_SURGE_MS,
} from '../src/game/hazards/AbyssalHazard.ts';

test('AbyssalHazard Tactical Bomb [Hydro-Fused Bomb]: Placing bomb on abyssal tile accelerates fuse with oceanic tint', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const res = hazard.onBombPlaced('b_abyss_1', 6, 7, 2, 2500);
  assert.equal(res.isAccelerated, true);
  assert.equal(res.fuseAccelerationMs, ABYSSAL_FUSE_ACCELERATION_MS);
  assert.equal(res.bombTint, ABYSSAL_SUPER_BOMB_TINT);
});

test('AbyssalHazard Tactical Bomb [Maelstrom Burst]: Detonating bomb in maelstrom adds +2 power, +250 score', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to maelstrom burst
  hazard.update(DURATION_TIDAL_SURGE_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);

  const basePower = 3;
  const res = hazard.onBombDetonated('b_abyss_1', 6, 7, basePower);
  assert.equal(res.isMaelstrom, true);
  assert.equal(res.extraPower, MAELSTROM_EXTRA_POWER);
  assert.equal(res.bonusScore, MAELSTROM_BONUS_SCORE);
});

test('AbyssalHazard Tactical Bomb [Hydro Slipstream Kick]: Kicking or sliding bomb over abyssal tile accelerates to 460 px/s', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const kickRes = hazard.onBombKicked('b_abyss_1', 6, 7, 200);
  assert.equal(kickRes.isSlipstreamKick, true);
  assert.equal(kickRes.kickSpeed, BOMB_KICK_ABYSSAL_SPEED);

  const slideRes = hazard.evaluateBombSlide(6, 7, 200);
  assert.equal(slideRes.isSlipstreamKick, true);
  assert.equal(slideRes.kickSpeed, BOMB_KICK_ABYSSAL_SPEED);
});

test('AbyssalHazard Ground Impact [Oceanic Calm Sanctuary]: Bomb blast cleanses abyssal torrent into 4.0s safe sanctuary', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Impact single tile
  const res = hazard.onBombBlastImpact(6, 7);
  assert.equal(res.cleanedTilesCount, 1);
  assert.equal(res.durationMs, OCEANIC_CALM_DURATION_MS);
  assert.equal(hazard.isTileCalm(6, 7), true);

  // Cleanse batch tiles
  const cleanseRes = hazard.cleanseAbyssalAt([{ r: 6, c: 7 }, { r: 6, c: 8 }]);
  assert.ok(cleanseRes.cleanedTilesCount >= 1);
  assert.equal(cleanseRes.durationMs, OCEANIC_CALM_DURATION_MS);

  // Cleansed sanctuary tile is safe from drag
  const playerEval = hazard.evaluatePlayer(7 * 40 + 20, 6 * 40 + 20, false, 1000);
  assert.equal(playerEval.hit, false);
  assert.equal(playerEval.dazeInflicted, false);
});

test('AbyssalHazard Minion Combat [Abyssal Crushing]: Minions inside maelstrom take 120 damage & grant rewards', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to maelstrom burst
  hazard.update(DURATION_TIDAL_SURGE_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);

  const res = hazard.checkEnemyCollision(6, 7, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.isCrushed, true);
  assert.equal(res.damage, ABYSSAL_MINION_DAMAGE);
  assert.equal(res.scoreBonus, ENEMY_ABYSSAL_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_ABYSSAL_ULTIMATE_CHARGE);
});

test('AbyssalHazard Boss Combat [Maelstrom Stasis Stun]: Boss inside maelstrom suffers 1.5s stun with 2.5s anti-exploit guard', () => {
  const hazard = new AbyssalHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to maelstrom burst
  hazard.update(DURATION_TIDAL_SURGE_MS + 10);
  assert.equal(hazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);

  // Initial boss hit triggers stasis
  const res1 = hazard.checkEnemyCollision(6, 7, true, 3000);
  assert.equal(res1.hit, true);
  assert.equal(res1.isStunned, true);
  assert.equal(res1.isStasisStunned, true);
  assert.equal(res1.stunDurationMs, BOSS_ABYSSAL_STASIS_STUN_MS);

  // Immediate subsequent hit within anti-exploit window (2500ms) does not re-stun
  const res2 = hazard.checkEnemyCollision(6, 7, true, 3000 + BOSS_ABYSSAL_EXPLOIT_COOLDOWN_MS - 200);
  assert.equal(res2.hit, false);
  assert.equal(res2.isStunned, false);

  // Hit after anti-exploit window re-triggers stasis
  const res3 = hazard.checkEnemyCollision(6, 7, true, 3000 + BOSS_ABYSSAL_EXPLOIT_COOLDOWN_MS + 10);
  assert.equal(res3.hit, true);
  assert.equal(res3.isStunned, true);
});
