import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SolarHazard,
  SolarLifecycleState,
  SOLAR_FUSE_ACCELERATION_MS,
  SOLAR_SUPER_BOMB_TINT,
  SUPERNOVA_EXTRA_POWER,
  SUPERNOVA_BONUS_SCORE,
  BOMB_KICK_SOLAR_SPEED,
  SOLAR_MINION_DAMAGE,
  ENEMY_SOLAR_SCORE,
  ENEMY_SOLAR_ULTIMATE_CHARGE,
  BOSS_SOLAR_STASIS_STUN_MS,
  SOLAR_CALM_DURATION_MS,
  DURATION_SOLAR_CORONA_MS,
  DURATION_SUPERHEAT_FLARE_MS,
} from '../src/game/hazards/SolarHazard.ts';

test('SolarHazard Tactical Bomb [Solar-Fused Bomb]: Placing bomb on solar tile accelerates fuse by 1.2s with solar tint', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const originalFuse = 2500;
  const res = hazard.onBombPlaced('b_solar_1', 6, 7, 2, originalFuse);
  assert.equal(res.isSolarFused, true);
  assert.equal(res.modifiedFuseMs, originalFuse - SOLAR_FUSE_ACCELERATION_MS);
  assert.equal(res.tint, SOLAR_SUPER_BOMB_TINT);
});

test('SolarHazard Tactical Bomb [Supernova Blast]: Detonating bomb on flare tile adds +2 power, +250 score, and piercing', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to flare burst
  hazard.update(DURATION_SOLAR_CORONA_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);

  const basePower = 3;
  const res = hazard.onBombDetonated('b_solar_1', 6, 7, basePower);
  assert.equal(res.isSupernova, true);
  assert.equal(res.modifiedPower, basePower + SUPERNOVA_EXTRA_POWER);
  assert.equal(res.bonusScore, SUPERNOVA_BONUS_SCORE);
  assert.equal(res.piercing, true);
});

test('SolarHazard Tactical Bomb [Solar Slipstream Kick]: Kicking or sliding bomb over solar tile accelerates to 460 px/s', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  const kickRes = hazard.onBombKicked('b_solar_1', 6, 7, 200);
  assert.equal(kickRes.isSlipstream, true);
  assert.equal(kickRes.modifiedSpeed, BOMB_KICK_SOLAR_SPEED);

  const slideRes = hazard.evaluateBombSlide(6, 7, 200);
  assert.equal(slideRes.speed, BOMB_KICK_SOLAR_SPEED);
});

test('SolarHazard Ground Impact [Solar Calm Thermal Anchor]: Bomb blast impact quenches solar heat for 4.0s safe footing', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Impact single tile
  const res = hazard.onBombBlastImpact(6, 7);
  assert.equal(res.quenched, true);
  assert.equal(hazard.isTileCalm(6, 7), true);

  // Cleanse batch tiles
  const cleanseRes = hazard.cleanseSolarAt([{ r: 6, c: 7 }, { r: 6, c: 8 }]);
  assert.ok(cleanseRes.cleanedTilesCount >= 1);
  assert.equal(cleanseRes.durationMs, SOLAR_CALM_DURATION_MS);

  // Quenched tile is safe from lethal damage and sunstroke
  const playerEval = hazard.evaluatePlayer(7 * 40 + 20, 6 * 40 + 20, false, false, 1000);
  assert.equal(playerEval.hit, false);
  assert.equal(playerEval.sunstrokeInflicted, false);
});

test('SolarHazard Minion Combat [Plasma Vaporization]: Minions inside flare take 120 damage & grant rewards', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to flare burst
  hazard.update(DURATION_SOLAR_CORONA_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);

  const res = hazard.checkEnemyCollision(6, 7, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.isVaporized, true);
  assert.equal(res.damage, SOLAR_MINION_DAMAGE);
  assert.equal(res.scoreBonus, ENEMY_SOLAR_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_SOLAR_ULTIMATE_CHARGE);
});

test('SolarHazard Boss Combat [Solar Blindness Stasis]: Boss takes stasis stun with single-hit anti-exploit guard', () => {
  const hazard = new SolarHazard();
  hazard.init(6, 7);
  hazard.start('NORMAL', 6, 7);

  // Advance to flare burst
  hazard.update(DURATION_SOLAR_CORONA_MS + 10);
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);

  // First hit on boss
  const hit1 = hazard.checkEnemyCollision(6, 7, true, 3000);
  assert.equal(hit1.hit, true);
  assert.equal(hit1.isStasisStunned, true);
  assert.equal(hit1.stunDurationMs, BOSS_SOLAR_STASIS_STUN_MS);

  // Immediate subsequent check in same burst: should NOT hit boss again (anti-exploit guard)
  const hit2 = hazard.checkEnemyCollision(6, 7, true, 3016);
  assert.equal(hit2.hit, false, 'Anti-exploit single-hit guard suppresses repeated boss damage in same flare burst');

  // Next burst cycle after cooldown
  hazard.update(DURATION_SUPERHEAT_FLARE_MS + 10); // Enter recovery
  hazard.update(5800 + 10); // Re-enter corona
  hazard.update(DURATION_SOLAR_CORONA_MS + 10); // Re-enter flare burst
  assert.equal(hazard.state, SolarLifecycleState.SUPERHEAT_FLARE);

  const hit3 = hazard.checkEnemyCollision(6, 7, true, 25000);
  assert.equal(hit3.hit, true, 'Boss can take solar stasis stun again in a new flare cycle');
});
