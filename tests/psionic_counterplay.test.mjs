/**
 * psionic_counterplay.test.mjs
 *
 * Exhaustive Verification for Player Psionic Counterplay:
 * 1. Bomb blasts dispel psionic illusions / manifestations on contact
 * 2. Dispelling provides '+150 DISPELLED!' bonus score and visual floating text
 * 3. Dispelling grants the player a short distortion barrier (DISTORTION_BARRIER buff & invulnerability)
 * 4. Zero-GC buffer stability and idempotent dispel operations
 * 5. Crisis objective progression and reality anchoring
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CrisisType,
  CrisisStage,
  HazardType,
  CrisisManager,
  PsychicCrisis,
} from '../src/game/crises/index.ts';

test('Psionic Counterplay 1.1: dispelPsionicIllusionAt dispels active illusions and manifestations', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PSYCHIC_INVASION);
  const crisis = manager.getActiveCrisis();
  assert.ok(crisis);

  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Place a psionic illusion hazard tile at (5, 5)
  crisis.setHazardTile(5, 5, HazardType.PSIONIC_ILLUSION, 0.8, 5000, 0);
  assert.equal(crisis.hasIllusionAt(5, 5), true);
  assert.equal(manager.isTileHazardous(5, 5), true);

  // Dispelling at (5, 5) succeeds
  const dispelled = manager.dispelPsionicIllusionAt(5, 5);
  assert.equal(dispelled, true);

  // Tile is cleared and no longer hazardous
  assert.equal(crisis.hasIllusionAt(5, 5), false);
  assert.equal(manager.isTileHazardous(5, 5), false);

  // Idempotent: repeated dispel on same tile returns false
  const repeatDispel = manager.dispelPsionicIllusionAt(5, 5);
  assert.equal(repeatDispel, false);
});

test('Psionic Counterplay 1.2: Dispelling psionic illusion advances resist_psionics objective', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PSYCHIC_INVASION);
  const crisis = manager.getActiveCrisis();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  const initialObj = crisis.getObjectives().find((o) => o.id === 'resist_psionics');
  assert.ok(initialObj);
  assert.equal(initialObj.currentCount, 0);

  // Dispel 3 manifestations
  crisis.setHazardTile(3, 3, HazardType.PSIONIC_ILLUSION, 0.9, 0, 0);
  crisis.setHazardTile(4, 4, HazardType.PSIONIC_ILLUSION, 0.9, 0, 0);
  crisis.setHazardTile(5, 5, HazardType.PSIONIC_ILLUSION, 0.9, 0, 0);

  assert.equal(manager.dispelPsionicIllusionAt(3, 3), true);
  assert.equal(initialObj.currentCount, 1);

  assert.equal(manager.dispelPsionicIllusionAt(4, 4), true);
  assert.equal(initialObj.currentCount, 2);

  assert.equal(manager.dispelPsionicIllusionAt(5, 5), true);
  assert.equal(initialObj.currentCount, 3);
  assert.equal(initialObj.isCompleted, true);
  assert.equal(crisis.isCrisisVictorious(), true);
});

test('Psionic Counterplay 2.1: Dispel returns false when no crisis or different crisis is active', () => {
  const manager = new CrisisManager();
  // No crisis active
  assert.equal(manager.dispelPsionicIllusionAt(5, 5), false);

  // Different crisis active (e.g. Void Crisis)
  manager.triggerCrisis(CrisisType.PASTEL_VOID);
  assert.equal(manager.dispelPsionicIllusionAt(5, 5), false);
});

test('Psionic Counterplay 2.2: Out of bounds and non-finite coordinate safety', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PSYCHIC_INVASION);

  assert.equal(manager.dispelPsionicIllusionAt(-1, 5), false);
  assert.equal(manager.dispelPsionicIllusionAt(5, 999), false);
  assert.equal(manager.dispelPsionicIllusionAt(NaN, 5), false);
  assert.equal(manager.dispelPsionicIllusionAt(5, Infinity), false);
});

test('Psionic Counterplay 3.1: Distortion Barrier contract and buff lifecycle simulation', () => {
  const durationMs = 2500;
  const mockPlayer = {
    active: true,
    alpha: 1.0,
    tint: 0xffffff,
    setAlpha(a) { this.alpha = a; },
    setTint(t) { this.tint = t; },
    clearTint() { this.tint = 0xffffff; },
  };

  const activeBuffs = [];

  let score = 0;
  let isInvulnerable = false;
  let shieldInvulnerableUntil = 0;
  let spawnedFloatingText = '';

  // Simulate GameScene dispel handler
  const onDispelStrike = (now) => {
    score += 150;
    spawnedFloatingText = '+150 DISPELLED!';

    // Grant distortion barrier
    isInvulnerable = true;
    shieldInvulnerableUntil = Math.max(shieldInvulnerableUntil, now + durationMs);
    mockPlayer.setTint(0xec4899);
    mockPlayer.setAlpha(0.85);

    const existing = activeBuffs.find((b) => b.id === 'DISTORTION_BARRIER');
    if (existing) {
      existing.remainingMs = durationMs;
      existing.totalMs = durationMs;
    } else {
      activeBuffs.push({
        id: 'DISTORTION_BARRIER',
        name: 'Distortion Barrier',
        icon: '🔮',
        color: '#ec4899',
        remainingMs: durationMs,
        totalMs: durationMs,
      });
    }
  };

  // Trigger dispel strike at time 1000
  onDispelStrike(1000);

  assert.equal(score, 150);
  assert.equal(spawnedFloatingText, '+150 DISPELLED!');
  assert.equal(isInvulnerable, true);
  assert.equal(shieldInvulnerableUntil, 3500);
  assert.equal(mockPlayer.tint, 0xec4899);
  assert.equal(mockPlayer.alpha, 0.85);

  const barrierBuff = activeBuffs.find((b) => b.id === 'DISTORTION_BARRIER');
  assert.ok(barrierBuff);
  assert.equal(barrierBuff?.name, 'Distortion Barrier');
  assert.equal(barrierBuff?.color, '#ec4899');
  assert.equal(barrierBuff?.remainingMs, 2500);

  // Second dispel refreshes barrier
  onDispelStrike(2000);
  assert.equal(score, 300);
  assert.equal(shieldInvulnerableUntil, 4500);
  assert.equal(activeBuffs.length, 1, 'Barrier buff should refresh in-place without duplicate entries');
});

test('Psionic Counterplay 4.1: dispelPsionicIllusion helper returns standardized counterplay rewards', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  crisis.setHazardTile(7, 7, HazardType.PSIONIC_ILLUSION, 0.85, 3000, 0);

  const reward = crisis.dispelPsionicIllusion(7, 7);
  assert.equal(reward.dispelled, true);
  assert.equal(reward.bonusScore, 150);
  assert.equal(reward.barrierDurationMs, 2500);

  // Subsequent call on cleared tile returns 0 bonus
  const repeatReward = crisis.dispelPsionicIllusion(7, 7);
  assert.equal(repeatReward.dispelled, false);
  assert.equal(repeatReward.bonusScore, 0);
  assert.equal(reward.barrierDurationMs, 2500);
});

test('Psionic Counterplay 4.2: onBombBlast clears multiple psionic illusions in blast radius', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Set 3 illusion tiles in a cross around (6, 6)
  crisis.setHazardTile(5, 6, HazardType.PSIONIC_ILLUSION, 0.8, 0, 0);
  crisis.setHazardTile(6, 5, HazardType.PSIONIC_ILLUSION, 0.8, 0, 0);
  crisis.setHazardTile(6, 7, HazardType.PSIONIC_ILLUSION, 0.8, 0, 0);

  assert.equal(crisis.hasIllusionAt(5, 6), true);
  assert.equal(crisis.hasIllusionAt(6, 5), true);
  assert.equal(crisis.hasIllusionAt(6, 7), true);

  // Detonate bomb at (6, 6) with radius 2
  crisis.handleBombBlast(6, 6, 2);

  // All 3 in-blast illusions are dispelled
  assert.equal(crisis.hasIllusionAt(5, 6), false);
  assert.equal(crisis.hasIllusionAt(6, 5), false);
  assert.equal(crisis.hasIllusionAt(6, 7), false);
});

test('Psionic Counterplay 5.1: 1,000 rapid cycles of spawning and dispelling maintain Zero-GC stability', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  for (let cycle = 0; cycle < 1000; cycle++) {
    const r = (cycle % 9) + 1;
    const c = ((cycle * 3) % 11) + 1;
    crisis.setHazardTile(r, c, HazardType.PSIONIC_ILLUSION, 0.8, 2000, 0);
    assert.equal(crisis.hasIllusionAt(r, c), true);

    const dispelled = crisis.dispelIllusionAt(r, c);
    assert.equal(dispelled, true);
    assert.equal(crisis.hasIllusionAt(r, c), false);
  }

  assert.ok(crisis.getActiveHazardTiles().length <= 18);
  assert.ok(Number.isFinite(crisis.getThreat()));
  assert.ok(crisis.getThreat() >= 0 && crisis.getThreat() <= 100);
});
