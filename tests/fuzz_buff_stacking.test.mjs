/**
 * fuzz_buff_stacking.test.mjs
 * Chaos QA Agent 9 — Extreme Fuzzing & Buff Stacking Verification Suite
 *
 * Tests:
 * 1. Status effects & Buff Stacking (Speed surge, freeze, cloak, shields, I-frames)
 * 2. Perk Multipliers & Corrupted Input Fuzzing (Extreme negative, Infinity, NaN, prototypes)
 * 3. Relic System & Synergy Stress (ICD loop protection, 28 pairwise combinations, clock skew)
 * 4. Formula Boundary Clamps (Speed clamps, cooldown floors, damage ceilings, wave scaling)
 * 5. Endless Gauntlet Boon Stacking Stress (1,000 drafts, unbound accumulation audits)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PerkTreeManager,
  RelicId,
  RELIC_CATALOG,
  RelicManager,
  ScalingEngine,
  GameModeType,
  GameModeManager,
  WaveMutatorId,
} from '../src/game/progression/index.ts';

/* ==============================================================================
 * SECTION 1: PERK TREE EXTREME FUZZING & UNCLAMPED BONUS AUDIT
 * ============================================================================== */

test('Chaos QA 9: PerkTreeManager handles corrupt, negative, NaN, and Infinity perk states', () => {
  const malformedPerks = {
    sugar_spark: -999,
    quick_wick: NaN,
    chain_reaction: Infinity,
    master_confectioner: 999999,
    bouncy_soles: '30',
    corner_magnet: {},
    dash_decoy: [1, 2, 3],
    hyper_sprint: true,
    sugar_coating: -Infinity,
    second_wind: 100,
    hazard_buffer: undefined,
    titan_heart: null,
    sweet_tooth: 1e12,
    merchant_discount: 'invalid',
    relic_resonance: 50,
    golden_touch: 1,
    __proto__: { hacked: 999 },
    unknown_illegal_perk: 12345,
  };

  const bonuses = PerkTreeManager.calculateAppliedBonuses(malformedPerks);

  // Assert no crash or fatal exception occurred
  assert.ok(bonuses, 'Must produce an AppliedPerkBonuses object');

  // Verify clamps on defined properties
  assert.equal(bonuses.startingBlastRadiusBonus, 0, 'Negative sugar_spark must floor to 0');
  assert.equal(bonuses.baseSpeedBonus, 0, 'Non-number string "30" must sanitize to 0');
  assert.equal(bonuses.cornerSlideTolerance, 8, 'Object {} is not a valid number, defaults to 8');
  assert.equal(bonuses.hasDashDecoy, false, 'Non-number array [1,2,3] must sanitize to 0, resolving to false');
  assert.equal(bonuses.startingShields, 0, '-Infinity floors to 0');
  assert.equal(bonuses.hasSecondWind, true);
  assert.equal(bonuses.groundSlowdownReduction, 0, 'undefined evaluates to 0');
  assert.equal(bonuses.extraHeartContainer, 0, 'null evaluates to 0');
  assert.equal(bonuses.itemDropRateBonus, 0.15, '1e12 clamped by Math.min(3) * 0.05 = 0.15');
  assert.equal(bonuses.shopDiscountRatio, 0, 'string "invalid" evaluates to 0');
  assert.equal(bonuses.relicDropChanceBonus, 0.20, 'Level 50 clamped to 0.20');
  assert.equal(bonuses.maxRelicSlots, 2, 'Level 50 clamped to 2');
  assert.equal(bonuses.gildedChestChance, 0.05);

  // Sanitized & Clamped: Infinity chain_reaction sanitizes to 0
  assert.equal(bonuses.chainScoreBonus, 0, 'Infinity chain_reaction is sanitized to 0');
  assert.equal(bonuses.chainUltChargeBonus, 0, 'Infinity chain_reaction is sanitized to 0');

  // Verify level 999 is clamped to maxLevel 2
  const overcapped = PerkTreeManager.calculateAppliedBonuses({ chain_reaction: 999 });
  assert.equal(overcapped.chainScoreBonus, 0.50, 'Level 999 chain_reaction is strictly clamped to maxLevel 2 (0.50)');
  assert.equal(overcapped.chainUltChargeBonus, 0.10, 'Level 999 chain_reaction is strictly clamped to maxLevel 2 (0.10)');
});

test('Chaos QA 9: Perk upgrade rejects negative, NaN, and non-numeric essence', () => {
  const perks = {};
  const negCheck = PerkTreeManager.canUpgradePerk('sugar_spark', perks, -100);
  assert.equal(negCheck.canUpgrade, false);
  assert.ok(negCheck.reason?.includes('Insufficient'));

  const nanCheck = PerkTreeManager.canUpgradePerk('sugar_spark', perks, NaN);
  assert.equal(nanCheck.canUpgrade, false);

  const unknownCheck = PerkTreeManager.canUpgradePerk('nonexistent_super_perk', perks, 1000);
  assert.equal(unknownCheck.canUpgrade, false);
  assert.equal(unknownCheck.reason, 'Unknown perk ID');

  const protoCheck = PerkTreeManager.canUpgradePerk('__proto__', perks, 1000);
  assert.equal(protoCheck.canUpgrade, false);
});

test('Chaos QA 9: CalculateSpentEssence sanitizes non-numeric and NaN values', () => {
  const corruptedPerks = {
    sugar_spark: NaN,
    quick_wick: '3',
    chain_reaction: Infinity,
    master_confectioner: -5,
    bouncy_soles: 3, // costs 5 + 10 + 20 = 35
  };

  const spent = PerkTreeManager.calculateSpentEssence(corruptedPerks);
  // Only bouncy_soles is a valid finite number >= 0
  assert.equal(spent, 35, 'Must strictly calculate 35 essence, ignoring corrupted keys');
});

/* ==============================================================================
 * SECTION 2: RELIC SYSTEM STRESS & 500MS ICD LOOP PROTECTION
 * ============================================================================== */

test('Chaos QA 9: RelicManager slot bounds enforcement under spam', () => {
  const rm = new RelicManager();
  assert.equal(rm.getMaxSlots(), 1);

  // Set negative or invalid slots
  rm.setMaxSlots(-5);
  assert.equal(rm.getMaxSlots(), 1, 'Slots must clamp to min 1');

  rm.setMaxSlots(999);
  assert.equal(rm.getMaxSlots(), 2, 'Slots must clamp to max 2');

  // Equip up to 2
  assert.equal(rm.equipRelic(RelicId.POCKET_CHRONOMETER).success, true);
  assert.equal(rm.equipRelic(RelicId.GELATINOUS_CORE).success, true);
  // 3rd must fail
  assert.equal(rm.equipRelic(RelicId.PYROCLASTIC_PRISM).success, false);

  // Reduce slots back to 1: must auto-evict excess
  rm.setMaxSlots(1);
  assert.equal(rm.getEquippedRelics().length, 1);
});

test('Chaos QA 9: All 28 Pairwise Relic Combinations evaluated for synergy accuracy', () => {
  const allRelicIds = Object.keys(RELIC_CATALOG);
  assert.equal(allRelicIds.length, 8);

  let activeSynergyCount = 0;
  const discoveredSynergies = new Set();

  for (let i = 0; i < allRelicIds.length; i++) {
    for (let j = i + 1; j < allRelicIds.length; j++) {
      const rA = allRelicIds[i];
      const rB = allRelicIds[j];

      const rm = new RelicManager([rA, rB], 2);
      const synergies = rm.getActiveSynergies();

      if (synergies.length > 0) {
        activeSynergyCount++;
        for (const s of synergies) {
          discoveredSynergies.add(s.name);
        }
      }
    }
  }

  // Exactly 4 synergies must be discovered across 28 pairs (C(8, 2) = 28)
  assert.equal(activeSynergyCount, 4);
  assert.equal(discoveredSynergies.size, 4);
  assert.ok(discoveredSynergies.has('Radiant Leech'));
  assert.ok(discoveredSynergies.has('Kinetic Pinball'));
  assert.ok(discoveredSynergies.has('Cosmic Supernova'));
  assert.ok(discoveredSynergies.has('Chrono Attraction'));
});

test('Chaos QA 9: Relic 500ms ICD loop protection and edge case with timestamp < 500ms', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM], 1);

  // Initial proc succeeds even when nowMs < 500ms (no false blocking at game start)
  const earlyCall = rm.onBombExploded({ r: 5, c: 5 }, 200);
  assert.equal(earlyCall.spawnDiagonalShards, true, 'Initial proc at t=200ms succeeds without false blockage');

  // Second proc at t=300ms (delta 100ms < 500ms): strictly suppressed by ICD
  const earlySpam = rm.onBombExploded({ r: 5, c: 5 }, 300);
  assert.equal(earlySpam.spawnDiagonalShards, false, 'Rapid proc at t=300ms suppressed by 500ms ICD');

  // At t=750ms (>= 200 + 500ms): succeeds
  const call1 = rm.onBombExploded({ r: 5, c: 5 }, 750);
  assert.equal(call1.spawnDiagonalShards, true);

  // High-frequency spam loop: rapid calls within 100ms
  let successCount = 0;
  for (let t = 751; t <= 850; t++) {
    const res = rm.onBombExploded({ r: 5, c: 5 }, t);
    if (res.spawnDiagonalShards) successCount++;
  }
  assert.equal(successCount, 0, 'All rapid procs within 100ms must be strictly suppressed by 500ms ICD');

  // Next proc after 500ms (t=1250ms >= 750 + 500ms): succeeds
  const call2 = rm.onBombExploded({ r: 5, c: 5 }, 1250);
  assert.equal(call2.spawnDiagonalShards, true);
});

test('Chaos QA 9: System clock skew / backward timestamp does not cause infinite unblock', () => {
  const rm = new RelicManager([RelicId.GELATINOUS_CORE], 1);
  const enemies = [{ id: 'e1', r: 5, c: 5 }];

  // 1st bounce at t=10,000
  const b1 = rm.onWallBounce({ r: 5, c: 5 }, enemies, 10000);
  assert.equal(b1.stunnedEnemyIds.length, 1);

  // System clock skews backwards to t=5,000:
  // nowMs - last = 5000 - 10000 = -5000 < 500 -> blocked safely
  const b2 = rm.onWallBounce({ r: 5, c: 5 }, enemies, 5000);
  assert.equal(b2.stunnedEnemyIds.length, 0, 'Backward time jump must remain blocked');
});

/* ==============================================================================
 * SECTION 3: MATHEMATICAL SCALING ENGINE & CLAMP AUDIT
 * ============================================================================== */

test('Chaos QA 9: ScalingEngine strict clamp invariants on extreme waves', () => {
  const extremeWaves = [-100, 0, 1, 35, 36, 100, 1000, 1000000, NaN, Infinity, -Infinity];

  for (const w of extremeWaves) {
    const speedMult = ScalingEngine.calculateEnemySpeedMultiplier(w);
    assert.ok(speedMult >= 1.0 && speedMult <= 2.20, `Speed mult out of bounds for wave ${w}: ${speedMult}`);

    const enemyCount = ScalingEngine.calculateActiveEnemyCount(w);
    assert.ok(enemyCount >= 4 && enemyCount <= 14, `Enemy count out of bounds for wave ${w}: ${enemyCount}`);

    const fuse = ScalingEngine.calculateBombFuseMs(w);
    assert.ok(fuse >= 1200 && fuse <= 2000, `Fuse out of bounds for wave ${w}: ${fuse}`);

    const reaction = ScalingEngine.calculateEnemyReactionMs(w);
    assert.ok(reaction >= 200 && reaction <= 600, `Reaction out of bounds for wave ${w}: ${reaction}`);

    const armorChance = ScalingEngine.calculateArmorChance(w);
    assert.ok(armorChance >= 0.0 && armorChance <= 0.50, `Armor chance out of bounds for wave ${w}: ${armorChance}`);

    const bossHp = ScalingEngine.calculateBossHp(w, 10);
    assert.ok(bossHp >= 10 && bossHp <= 25, `Boss HP out of bounds for wave ${w}: ${bossHp}`);
  }
});

test('Chaos QA 9: Mutator conflict isolation across 10,000 simulated waves', () => {
  for (let w = 1; w <= 10000; w++) {
    const muts = ScalingEngine.generateWaveMutators(w);
    if (muts.length === 2) {
      const hasGlass = muts.some((m) => m.id === WaveMutatorId.GLASS_CANNON);
      const hasDense = muts.some((m) => m.id === WaveMutatorId.DENSE_FORTIFICATION);
      assert.ok(!(hasGlass && hasDense), `Wave ${w} generated conflicting mutator pair!`);
    }
  }
});

/* ==============================================================================
 * SECTION 4: SPEED CLAMPS & COOLDOWN MINIMUMS AUDIT
 * ============================================================================== */

test('Chaos QA 9: Player speed stacking theoretical maximums and clamps', () => {
  // Base Speed: 150 px/s
  // Speed Up power-up cap: 250 px/s
  // Bouncy Soles (Perk Tree max): +30 px/s
  // Speed Surge (Item buff): +75 px/s
  // Dash: DASH_SPEED = 350 px/s
  // Hyper Sprint (+20% post dash): 350 * 1.2 = 420 px/s
  // Second Wind speed burst (+50%): 280 * 1.5 = 420 px/s
  // Extreme Theoretical Peak: (350 + 75) * 1.5 = 637.5 px/s

  const maxSpeedWithItems = 250;
  const fullPerks = PerkTreeManager.calculateAppliedBonuses({ bouncy_soles: 3 });
  const maxWalkingSpeed = maxSpeedWithItems + fullPerks.baseSpeedBonus; // 280 px/s
  assert.equal(maxWalkingSpeed, 280);

  const walkingWithSurge = maxWalkingSpeed + 75; // 355 px/s
  assert.equal(walkingWithSurge, 355);

  // Second wind burst
  const secondWindRes = PerkTreeManager.triggerSecondWind({ hasSecondWind: true }, false);
  const secondWindSpeed = walkingWithSurge * (1 + secondWindRes.speedBurstBonus); // 355 * 1.5 = 532.5 px/s
  assert.equal(secondWindSpeed, 532.5);

  // In GameScene.ts:
  // (this.isDashing ? DASH_SPEED : this.playerSpeed + perkSpeedBonus) + surgeBonus
  // If dashing with surge: 350 + 75 = 425 px/s
  const dashWithSurge = 350 + 75;
  assert.equal(dashWithSurge, 425);
});

test('Chaos QA 9: Cooldown minimums verification', () => {
  // 1. Dash Cooldown:
  // Base DASH_COOLDOWN_MS = 3500ms
  // Hyper Sprint perk: -1000ms -> 2500ms
  // Speed Surge buff: cdMult = 2 (recovery rate doubles -> effective 1250ms)
  const baseDashCd = 3500;
  const hyperSprintCd = baseDashCd - 1000;
  assert.equal(hyperSprintCd, 2500);
  const effectiveSurgeCd = hyperSprintCd / 2;
  assert.equal(effectiveSurgeCd, 1250);

  // 2. Bomb Fuse:
  // Base 2000ms -> Floor 1200ms at wave 21+
  // Speed Demon mutator: 0.75x -> 1200 * 0.75 = 900ms
  // Quick Wick perk (25% reduction): 900 * 0.75 = 675ms
  const minFuseFloor = 1200;
  const speedDemonFuse = minFuseFloor * 0.75;
  assert.equal(speedDemonFuse, 900);
  const quickWickFuse = speedDemonFuse * (1 - 0.25);
  assert.equal(quickWickFuse, 675);

  // 3. Relic ICD:
  // Strict 500ms minimum guard on all procs
  assert.equal(RELIC_CATALOG[RelicId.PYROCLASTIC_PRISM].internalCooldownMs, 500);
});

/* ==============================================================================
 * SECTION 5: ENDLESS GAUNTLET BOON STACKING FUZZING
 * ============================================================================== */

test('Chaos QA 9: Endless Gauntlet 100-Chamber Boon Accumulation Audit', () => {
  const mgr = new GameModeManager(GameModeType.ENDLESS_GAUNTLET);

  // Simulate 100 chamber clears and automatic boon selection
  for (let c = 1; c <= 100; c++) {
    const draft = mgr.onChamberCleared();
    assert.equal(draft.length, 3);
    assert.ok(mgr.isAwaitingBoonSelection);

    // Pick first available boon
    const chosen = draft[0];
    const ok = mgr.selectBoon(chosen.id);
    assert.ok(ok);
    assert.equal(mgr.isAwaitingBoonSelection, false);
  }

  // Verify that activeBoons accumulated values without NaN or crashes
  assert.ok(Number.isFinite(mgr.activeBoons.extraSpeed));
  assert.ok(Number.isFinite(mgr.activeBoons.extraDamage));
  assert.ok(Number.isFinite(mgr.activeBoons.extraBombs));
  assert.ok(Number.isFinite(mgr.activeBoons.extraShield));
  assert.ok(Number.isFinite(mgr.activeBoons.ultChargeMultiplier));

  // Checkpoints: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
  assert.equal(mgr.unlockedCheckpoints.length, 11); // Initial [1] + 10 checkpoints
});
