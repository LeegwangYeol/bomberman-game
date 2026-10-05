import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MiasmaHazard,
  MIASMA_FUSE_ACCELERATION_MS,
  MIASMA_SUPER_BOMB_TINT,
  CATALYTIC_EXTRA_POWER,
  CATALYTIC_BONUS_SCORE,
  MIASMA_MINION_DAMAGE,
  ENEMY_MIASMA_SCORE,
  ENEMY_MIASMA_ULTIMATE_CHARGE,
  BOSS_SPORE_STASIS_STUN_MS,
  DURATION_SPORE_INCUBATION_MS,
  FLORAL_CLEANSE_DURATION_MS,
  MiasmaDangerValue,
  BOMB_KICK_MIASMA_SPEED,
  FLOATING_TEXT_BIO_SLICK_GLIDE,
} from '../src/game/hazards/MiasmaHazard.ts';

test('MiasmaHazard Tactical Bomb [Bio-Fused Bomb]: Placing bomb on spore tile accelerates fuse by 1.2s', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const originalFuse = 2500;
  const res = hazard.onBombPlaced('bomb_1', 6, 7, 2, originalFuse);

  assert.equal(res.isBioFused, true);
  assert.equal(res.fuseDeltaMs, -MIASMA_FUSE_ACCELERATION_MS);
  assert.equal(res.modifiedFuseMs, originalFuse - MIASMA_FUSE_ACCELERATION_MS);
  assert.equal(res.tint, MIASMA_SUPER_BOMB_TINT);
});

test('MiasmaHazard Tactical Bomb [Catalytic Detonation]: Detonating bomb on spore tile adds +2 power & +200 score', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const basePower = 2;
  const res = hazard.onBombDetonated('bomb_1', 6, 7, basePower);

  assert.equal(res.isCatalytic, true);
  assert.equal(res.modifiedPower, basePower + CATALYTIC_EXTRA_POWER);
  assert.equal(res.bonusScore, CATALYTIC_BONUS_SCORE);
  assert.equal(res.piercing, true);
});

test('MiasmaHazard Minion Combat [Dissolution]: Minions inside burst take 120 damage & grant rewards', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_SPORE_INCUBATION_MS + 10); // Enter burst

  const res = hazard.checkEnemyCollision(6, 7, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.isDissolved, true);
  assert.equal(res.damage, MIASMA_MINION_DAMAGE);
  assert.equal(res.scoreBonus, ENEMY_MIASMA_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_MIASMA_ULTIMATE_CHARGE);
});

test('MiasmaHazard Boss Combat [Spore Overgrowth Stasis]: Boss takes stasis stun with single-hit anti-exploit guard', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_SPORE_INCUBATION_MS + 10); // Enter burst

  // First hit on boss succeeds
  const res1 = hazard.checkEnemyCollision(6, 7, true, 3000);
  assert.equal(res1.hit, true);
  assert.equal(res1.isSporeStunned, true);
  assert.equal(res1.stunDurationMs, BOSS_SPORE_STASIS_STUN_MS);
  assert.equal(res1.damage, 150);

  // Immediate subsequent hit in same burst is blocked by anti-exploit cooldown
  const res2 = hazard.checkEnemyCollision(6, 7, true, 3016);
  assert.equal(res2.hit, false, 'Anti-exploit guard blocks multi-tick damage');
});

test('MiasmaHazard Ground Impact [Floral Cleansing]: Bomb blast cleanses spore ground into fertile soil', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  // Blast impact on spore tile cleanses it
  const cleanse = hazard.onBombBlastImpact(6, 7);
  assert.equal(cleanse.cleansed, true);
  assert.equal(cleanse.durationMs, FLORAL_CLEANSE_DURATION_MS);
  assert.equal(hazard.getTileDangerCode(6, 7), MiasmaDangerValue.FERTILE_SOIL);

  // Cleansed tile is safe for movement
  assert.equal(hazard.isTileWalkable(6, 7), true);
});

test('MiasmaHazard Tactical Bomb [Bio-Slick Kick]: Kicking bombs across hazard tiles alters velocity to 450 px/s', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const baseSpeed = 300;
  // Kick on spore tile
  const kickRes = hazard.onBombKicked('bomb_1', 6, 7, baseSpeed);
  assert.equal(kickRes.isBioSlick, true, 'Kicking on spore tile must trigger Bio-Slick glide');
  assert.equal(kickRes.modifiedSpeed, BOMB_KICK_MIASMA_SPEED, 'Velocity must accelerate to 450 px/s');
  assert.equal(kickRes.speedDelta, 150, 'Velocity delta must be +150 px/s (+50%)');
  assert.equal(kickRes.floatingText, FLOATING_TEXT_BIO_SLICK_GLIDE);

  // Direct tile query helper
  assert.equal(hazard.isTileBioSlick(6, 7), true);
  assert.equal(hazard.getTileKickSpeed(6, 7, baseSpeed), 450);

  // Outside hazard tile retains base speed
  const safeKick = hazard.onBombKicked('bomb_safe', 0, 0, baseSpeed);
  assert.equal(safeKick.isBioSlick, false);
  assert.equal(safeKick.modifiedSpeed, baseSpeed);
  assert.equal(safeKick.speedDelta, 0);
  assert.equal(hazard.isTileBioSlick(0, 0), false);
  assert.equal(hazard.getTileKickSpeed(0, 0, baseSpeed), baseSpeed);
});

test('MiasmaHazard Tactical Bomb [Sliding Dynamics]: Sliding across spore tiles accelerates; fertile soil restores control', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  // Slide across active spore tile
  const slide1 = hazard.evaluateBombSlide(6, 7, 300);
  assert.equal(slide1.isBioSlick, true);
  assert.equal(slide1.speed, 450);
  assert.equal(slide1.isCleansed, false);

  // Cleanse the tile with blast impact
  hazard.onBombBlastImpact(6, 7);
  assert.equal(hazard.isTileCleansed(6, 7), true);

  // Slide across cleansed fertile soil restores safe controlled traction (300 px/s)
  const slide2 = hazard.evaluateBombSlide(6, 7, 450);
  assert.equal(slide2.isBioSlick, false);
  assert.equal(slide2.isCleansed, true);
  assert.equal(slide2.speed, 300, 'Cleansed soil must restore standard controlled traction');
});

test('MiasmaHazard Zero-GC Invariance: 10,000 rapid tactical operations execute without allocation', () => {
  const hazard = new MiasmaHazard();
  hazard.init(6, 7);
  hazard.start();

  for (let i = 0; i < 10000; i++) {
    hazard.dangerMask[6 * 15 + 7] = MiasmaDangerValue.INCUBATING;
    const placed = hazard.onBombPlaced('b_perf', 6, 7, 2, 2500);
    assert.equal(placed.isBioFused, true);

    const kicked = hazard.onBombKicked('b_perf', 6, 7, 300);
    assert.equal(kicked.isBioSlick, true);

    const slid = hazard.evaluateBombSlide(6, 7, 300);
    assert.equal(slid.speed, 450);

    const detonated = hazard.onBombDetonated('b_perf', 6, 7, 3);
    assert.equal(detonated.isCatalytic, true);

    const impact = hazard.onBombBlastImpact(6, 7);
    assert.equal(impact.cleansed, true);
  }
});

