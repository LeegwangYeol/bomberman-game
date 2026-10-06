import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChronoHazard,
  CHRONO_FUSE_ACCELERATION_MS,
  CHRONO_SUPER_BOMB_TINT,
  TEMPORAL_IMPLOSION_EXTRA_POWER,
  TEMPORAL_IMPLOSION_BONUS_SCORE,
  BOMB_KICK_CHRONO_SPEED,
  TIMELINE_STABILIZE_DURATION_MS,
  CHRONO_MINION_DAMAGE,
  ENEMY_CHRONO_SCORE,
  ENEMY_CHRONO_ULTIMATE_CHARGE,
  BOSS_CHRONO_STASIS_STUN_MS,
  DURATION_CHRONO_DISTORTION_MS,
  ChronoDangerValue,
  FLOATING_TEXT_CHRONO_SHIFTED,
  FLOATING_TEXT_TEMPORAL_IMPLOSION,
  FLOATING_TEXT_TIMELINE_STABILIZED,
  FLOATING_TEXT_CHRONO_SLIPSTREAM,
  FLOATING_TEXT_TIME_COLLAPSED,
  FLOATING_TEXT_CHRONO_STASIS,
} from '../src/game/hazards/ChronoHazard.ts';

test('ChronoHazard Tactical Bomb [Tachyon Fused Bomb]: Placing bomb on chrono tile accelerates fuse by 1.3s', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();

  const originalFuse = 2500;
  const res = hazard.onBombPlaced('bomb_1', 6, 7, 2, originalFuse);

  assert.equal(res.isChronoShifted, true);
  assert.equal(res.modifiedFuseMs, originalFuse - CHRONO_FUSE_ACCELERATION_MS);
  assert.equal(res.tint, CHRONO_SUPER_BOMB_TINT);
  assert.equal(res.floatingText, FLOATING_TEXT_CHRONO_SHIFTED);
});

test('ChronoHazard Tactical Bomb [Temporal Implosion]: Detonating bomb on collapse tile adds +2 power & +250 score', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_CHRONO_DISTORTION_MS + 10); // Enter TIME_COLLAPSE

  const basePower = 2;
  const res = hazard.onBombDetonated('bomb_1', 6, 7, basePower);

  assert.equal(res.isTemporalImplosion, true);
  assert.equal(res.modifiedPower, basePower + TEMPORAL_IMPLOSION_EXTRA_POWER);
  assert.equal(res.bonusScore, TEMPORAL_IMPLOSION_BONUS_SCORE);
  assert.equal(res.piercing, true);
  assert.equal(res.floatingText, FLOATING_TEXT_TEMPORAL_IMPLOSION);
});

test('ChronoHazard Minion Combat [Dissolution]: Minions inside collapse take 120 damage & grant score/ult rewards', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_CHRONO_DISTORTION_MS + 10); // Enter TIME_COLLAPSE

  const res = hazard.checkEnemyCollision(6, 7, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.isDissolved, true);
  assert.equal(res.damage, CHRONO_MINION_DAMAGE);
  assert.equal(res.scoreBonus, ENEMY_CHRONO_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_CHRONO_ULTIMATE_CHARGE);
  assert.equal(res.floatingText, FLOATING_TEXT_TIME_COLLAPSED);
});

test('ChronoHazard Boss Combat [Chrono Stasis]: Boss takes 1.5s stasis stun with single-hit anti-exploit guard', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_CHRONO_DISTORTION_MS + 10); // Enter TIME_COLLAPSE

  // First hit on boss succeeds
  const res1 = hazard.checkEnemyCollision(6, 7, true, 3000);
  assert.equal(res1.hit, true);
  assert.equal(res1.isStasisStunned, true);
  assert.equal(res1.stunDurationMs, BOSS_CHRONO_STASIS_STUN_MS);
  assert.equal(res1.floatingText, FLOATING_TEXT_CHRONO_STASIS);

  // Immediate subsequent hit in same burst is blocked by anti-exploit cooldown
  const res2 = hazard.checkEnemyCollision(6, 7, true, 3016);
  assert.equal(res2.hit, false, 'Anti-exploit guard blocks multi-tick damage');
});

test('ChronoHazard Ground Impact [Timeline Stabilization]: Bomb blast stabilizes tiles into safe anchor footing', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();

  // Blast impact on chrono tile stabilizes it
  const single = hazard.onBombBlastImpact(6, 7);
  assert.equal(single.stabilized, true);
  assert.equal(single.floatingText, FLOATING_TEXT_TIMELINE_STABILIZED);
  assert.equal(hazard.isTileStabilized(6, 7), true);

  // Batch stabilization
  const batch = hazard.stabilizeTilesWithExplosion([
    { r: 6, c: 6 },
    { r: 6, c: 8 },
  ]);
  assert.equal(batch.cleanedTilesCount, 2);
  assert.equal(batch.durationMs, TIMELINE_STABILIZE_DURATION_MS);
  assert.equal(batch.floatingText, FLOATING_TEXT_TIMELINE_STABILIZED);
});

test('ChronoHazard Tactical Bomb [Slipstream Kick]: Kicking bombs across chrono tiles accelerates to 460 px/s', () => {
  const hazard = new ChronoHazard();
  hazard.init(6, 7);
  hazard.start();

  const kick = hazard.onBombKicked('bomb_1', 6, 7, 250);
  assert.equal(kick.isSlipstream, true);
  assert.equal(kick.modifiedSpeed, BOMB_KICK_CHRONO_SPEED);
  assert.equal(kick.floatingText, FLOATING_TEXT_CHRONO_SLIPSTREAM);

  // Sliding evaluation
  const slide = hazard.evaluateBombSlide(6, 7, 250);
  assert.equal(slide.speed, BOMB_KICK_CHRONO_SPEED);
});
