import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MagmaHazard,
  MAGMA_FUSE_ACCELERATION_MS,
  MAGMA_SUPER_BOMB_TINT,
  PYROCLASTIC_EXTRA_POWER,
  PYROCLASTIC_BONUS_SCORE,
  ENEMY_MAGMA_BURST_DAMAGE,
  ENEMY_MAGMA_SCORE,
  ENEMY_MAGMA_ULTIMATE_CHARGE,
  BOSS_MELTDOWN_STUN_MS,
  DURATION_MAGMA_TELEGRAPH_MS,
  OBSIDIAN_QUENCH_DURATION_MS,
  MagmaDangerValue,
} from '../src/game/hazards/MagmaHazard.ts';

test('MagmaHazard Tactical Bomb [Pyro-Fused Bomb]: Placing bomb on molten tile accelerates fuse by 1.2s', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const originalFuse = 2500;
  const res = hazard.onBombPlaced('bomb_1', 6, 7, 2, originalFuse);

  assert.equal(res.isPyroFused, true);
  assert.equal(res.fuseDeltaMs, -MAGMA_FUSE_ACCELERATION_MS);
  assert.equal(res.modifiedFuseMs, originalFuse - MAGMA_FUSE_ACCELERATION_MS);
  assert.equal(res.tint, MAGMA_SUPER_BOMB_TINT);
});

test('MagmaHazard Tactical Bomb [Pyroclastic Detonation]: Detonating bomb on molten tile adds +2 power & +200 score', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();

  const basePower = 2;
  const res = hazard.onBombDetonated('bomb_1', 6, 7, basePower);

  assert.equal(res.isPyroclastic, true);
  assert.equal(res.modifiedPower, basePower + PYROCLASTIC_EXTRA_POWER);
  assert.equal(res.bonusScore, PYROCLASTIC_BONUS_SCORE);
  assert.equal(res.piercing, true);
});

test('MagmaHazard Minion Combat [Incineration]: Minions inside burst take 120 damage & grant rewards', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_MAGMA_TELEGRAPH_MS + 10); // Enter burst

  const res = hazard.checkEnemyCollision(6, 7, false, 3000);
  assert.equal(res.hit, true);
  assert.equal(res.isIncinerated, true);
  assert.equal(res.damage, ENEMY_MAGMA_BURST_DAMAGE);
  assert.equal(res.scoreBonus, ENEMY_MAGMA_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_MAGMA_ULTIMATE_CHARGE);
});

test('MagmaHazard Boss Combat [Magma Meltdown]: Boss takes meltdown stun with single-hit anti-exploit guard', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();
  hazard.update(DURATION_MAGMA_TELEGRAPH_MS + 10); // Enter burst

  // First hit on boss succeeds
  const res1 = hazard.checkEnemyCollision(6, 7, true, 3000);
  assert.equal(res1.hit, true);
  assert.equal(res1.isMeltdownStunned, true);
  assert.equal(res1.stunDurationMs, BOSS_MELTDOWN_STUN_MS);
  assert.equal(res1.damage, 150);

  // Immediate subsequent hit in same burst is blocked by anti-exploit cooldown
  const res2 = hazard.checkEnemyCollision(6, 7, true, 3016);
  assert.equal(res2.hit, false, 'Anti-exploit guard blocks multi-tick damage');
});

test('MagmaHazard Ground Impact [Obsidian Shell Quenching]: Bomb blast solidifies molten lava into obsidian crust', () => {
  const hazard = new MagmaHazard();
  hazard.init(6, 7);
  hazard.start();

  // Blast impact on molten tile
  const quench = hazard.onBombBlastImpact(6, 7);
  assert.equal(quench.quenched, true);
  assert.equal(quench.obsidianDurationMs, OBSIDIAN_QUENCH_DURATION_MS);
  assert.equal(hazard.getTileDangerCode(6, 7), MagmaDangerValue.OBSIDIAN_CRUST);

  // Stepping on obsidian crust is safe
  assert.equal(hazard.isTileWalkable(6, 7), true);
});
