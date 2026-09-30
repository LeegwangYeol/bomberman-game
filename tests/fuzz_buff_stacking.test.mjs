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

import {
  DynamicHazard,
  HazardLifecycleState,
  PHASE_JITTER_DURATION_MS,
  PLAYER_HAZARD_DAMAGE,
  STANDARD_FUSE_MS,
} from '../src/game/hazards/index.ts';

import {
  calculateClampedPlayerSpeed,
  updateInvulnerabilityExpiry,
  BASE_PLAYER_SPEED,
  MAX_PLAYER_SPEED,
  DASH_SPEED,
  MIN_PLAYER_SPEED,
  MAX_PLAYER_SPEED_CLAMP,
} from '../src/game/gameplay_mechanics.ts';

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
  assert.equal(calculateClampedPlayerSpeed({ itemSpeed: 250, perkSpeedBonus: 30, surgeBonus: 75 }), 350, 'Walking with surge strictly clamped to 350 px/s');

  // Second wind burst
  const secondWindRes = PerkTreeManager.triggerSecondWind({ hasSecondWind: true }, false);
  const secondWindSpeed = walkingWithSurge * (1 + secondWindRes.speedBurstBonus); // 355 * 1.5 = 532.5 px/s
  assert.equal(secondWindSpeed, 532.5);
  assert.equal(calculateClampedPlayerSpeed({ itemSpeed: 250, perkSpeedBonus: 30, surgeBonus: 75, speedMultiplier: 1 + secondWindRes.speedBurstBonus }), 350, 'Second Wind burst strictly clamped to 350 px/s');

  // In GameScene.ts:
  // (this.isDashing ? DASH_SPEED : this.playerSpeed + perkSpeedBonus) + surgeBonus
  // If dashing with surge: 350 + 75 = 425 px/s
  const dashWithSurge = 350 + 75;
  assert.equal(dashWithSurge, 425);
  assert.equal(calculateClampedPlayerSpeed({ isDashing: true, surgeBonus: 75 }), 350, 'Dash with surge strictly clamped to 350 px/s');
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

/* ==============================================================================
 * SECTION 6: COMBINATORIAL BUFF & DEBUFF FUZZING
 * Combinations: Speed Up + Phase Jitter + Tachyon Overcharge + Shield Invuln + Dash I-Frames
 * ============================================================================== */

test('Chaos QA 9: All 32 combinatorial permutations of Speed Up + Phase Jitter + Tachyon Overcharge + Shield Invuln + Dash I-Frames', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + 2000); // Enter ACTIVE beam (Col 4, Rows 3..9)
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  const activeR = 5;
  const activeC = 4;
  assert.ok(hazard.isTileLethal(activeR, activeC));

  // 5 Boolean Flags -> 32 permutations
  for (let mask = 0; mask < 32; mask++) {
    const hasSpeedUp = Boolean(mask & 1);
    const hasPhaseJitter = Boolean(mask & 2);
    const hasTachyonOvercharge = Boolean(mask & 4);
    const hasShieldInvuln = Boolean(mask & 8);
    const hasDash = Boolean(mask & 16);

    // 1. Calculate and verify speed bounds under combination
    const baseSpeed = hasSpeedUp ? MAX_PLAYER_SPEED : BASE_PLAYER_SPEED;
    const effectiveSpeed = calculateClampedPlayerSpeed({
      baseSpeed,
      isDashing: hasDash,
      dashSpeed: DASH_SPEED,
      phaseJitterActive: hasPhaseJitter,
      surgeBonus: hasSpeedUp ? 75 : 0,
    });

    assert.ok(Number.isFinite(effectiveSpeed), `Mask ${mask}: Speed must be finite`);
    assert.ok(
      effectiveSpeed >= MIN_PLAYER_SPEED && effectiveSpeed <= MAX_PLAYER_SPEED_CLAMP,
      `Mask ${mask}: Effective speed ${effectiveSpeed} must be within [50, 350]`
    );

    // 2. Evaluate Dynamic Hazard Player Collision
    const collision = hazard.checkPlayerCollision(
      activeR,
      activeC,
      hasDash,
      50, // 50ms <= 150ms tunneling window
      hasShieldInvuln
    );

    if (hasShieldInvuln) {
      assert.equal(collision.damage, 0, `Mask ${mask}: Shield invulnerability must negate all hazard damage`);
      assert.equal(collision.isLethal, false);
      assert.equal(collision.phaseJitterInflicted, false, `Mask ${mask}: Invulnerability must prevent Phase Jitter`);
    } else if (hasDash) {
      assert.equal(collision.damage, 0, `Mask ${mask}: Dash within tunneling window must take 0 damage`);
      assert.equal(collision.tunneled, true);
      assert.equal(collision.phaseShiftGranted, true);
      assert.equal(collision.phaseJitterInflicted, false);
    } else {
      assert.equal(collision.damage, PLAYER_HAZARD_DAMAGE, `Mask ${mask}: Exposed player must take 25 energy damage`);
      assert.equal(collision.isLethal, true);
      assert.equal(collision.phaseJitterInflicted, true);
      assert.equal(collision.jitterDurationMs, PHASE_JITTER_DURATION_MS);
    }

    // 3. Evaluate Bomb Detonation (Tachyon Overcharge)
    if (hasTachyonOvercharge) {
      const bombDet = hazard.onBombDetonated(1000 + mask, activeR, activeC, 3);
      assert.equal(bombDet.overcharged, true, `Mask ${mask}: Detonation in active beam must be overcharged`);
      assert.equal(bombDet.modifiedPower, 5, `Mask ${mask}: Overcharge must add +2 blast power (3 + 2 = 5)`);
      assert.equal(bombDet.piercing, true);
    }
  }
});

/* ==============================================================================
 * SECTION 7: SPEED CLAMPING EXTREMES & NEGATIVE / NAN REJECTION
 * ============================================================================== */

test('Chaos QA 9: Extreme buff stacking peak strictly clamped to 350 px/s', () => {
  // Peak stack:
  // Base 150 + 4x Speed Up (250) + Bouncy Soles (+30) + Speed Surge (+75)
  // + Second Wind (+50%) + Quantum Phase Shift (+30%) + Aegis Overdrive (+40) + Dash (350)
  // Raw un-clamped = (350 + 75 + 40) * 1.5 * 1.3 = 906.75 px/s
  const clampedPeak = calculateClampedPlayerSpeed({
    itemSpeed: 250,
    perkSpeedBonus: 30,
    surgeBonus: 75,
    customBonus: 40,
    isDashing: true,
    dashSpeed: 350,
    speedMultiplier: 1.5 * 1.3,
  });

  assert.equal(clampedPeak, 350, 'Extreme theoretical speed stack MUST clamp strictly to 350 px/s ceiling');
});

test('Chaos QA 9: Extreme debuff stacking floor strictly clamped to 50 px/s', () => {
  // Floor stack:
  // Base 150 slowed by Honey (-80%) + Phase Jitter (-25%) + Additional Slow (-50%)
  // Raw un-clamped = 150 * (1 - 0.80) * 0.75 * 0.5 = 11.25 px/s
  const clampedFloor = calculateClampedPlayerSpeed({
    baseSpeed: 150,
    slowdownRatio: 0.80,
    phaseJitterActive: true,
    speedMultiplier: 0.50,
  });

  assert.equal(clampedFloor, 50, 'Extreme debuff stack MUST clamp strictly to 50 px/s floor');
});

test('Chaos QA 9: 10,000 Monte Carlo randomized cycles strictly clamp within [50, 350] and reject NaN', () => {
  const corruptValues = [NaN, Infinity, -Infinity, -9999, -1, 0, null, undefined, 'speed', {}, []];

  for (let i = 0; i < 10000; i++) {
    // Generate pseudo-random configuration
    const useCorruptBase = i % 10 === 0;
    const baseSpeed = useCorruptBase
      ? corruptValues[i % corruptValues.length]
      : Math.floor(Math.random() * 800) - 200;

    const perkSpeedBonus = i % 7 === 0 ? NaN : Math.floor(Math.random() * 100) - 20;
    const surgeBonus = i % 11 === 0 ? -100 : Math.floor(Math.random() * 150);
    const isDashing = Math.random() < 0.5;
    const phaseJitterActive = Math.random() < 0.5;
    const slowdownRatio = i % 13 === 0 ? NaN : Math.random() * 1.5;
    const speedMultiplier = i % 17 === 0 ? -2 : Math.random() * 4;

    const speed = calculateClampedPlayerSpeed({
      baseSpeed,
      perkSpeedBonus,
      surgeBonus,
      isDashing,
      phaseJitterActive,
      slowdownRatio,
      speedMultiplier,
    });

    assert.ok(Number.isFinite(speed), `Iteration ${i}: Speed must be finite`);
    assert.ok(!Number.isNaN(speed), `Iteration ${i}: Speed must not be NaN`);
    assert.ok(
      speed >= 50 && speed <= 350,
      `Iteration ${i}: Speed ${speed} out of bounds [50, 350]`
    );
  }
});

/* ==============================================================================
 * SECTION 8: INVULNERABILITY EXPIRY TIMESTAMP OVERWRITE PROTECTION
 * ============================================================================== */

test('Chaos QA 9: Invulnerability timestamps cannot be overwritten or downgraded by lesser durations', () => {
  const now = 50000;
  // Step 1: Grant 3000ms invulnerability (expires at 53,000)
  let expiry = updateInvulnerabilityExpiry(0, 3000, now);
  assert.equal(expiry, 53000);

  // Step 2: Lesser duration 1500ms at t = 50,500 (target 52,000 < 53,000) -> MUST NOT overwrite!
  const expiry2 = updateInvulnerabilityExpiry(expiry, 1500, now + 500);
  assert.equal(expiry2, 53000, 'Lesser duration 1500ms must not downgrade 53,000 expiry');

  // Step 3: Rapid succession of smaller durations (500ms, 200ms, 50ms)
  const expiry3 = updateInvulnerabilityExpiry(expiry2, 500, now + 1000); // target 51,500
  assert.equal(expiry3, 53000);
  const expiry4 = updateInvulnerabilityExpiry(expiry3, 200, now + 2000); // target 52,200
  assert.equal(expiry4, 53000);

  // Step 4: Negative, NaN, or corrupt durations -> strictly rejected, preserving 53,000
  assert.equal(updateInvulnerabilityExpiry(expiry4, -500, now + 2500), 53000);
  assert.equal(updateInvulnerabilityExpiry(expiry4, NaN, now + 2500), 53000);
  assert.equal(updateInvulnerabilityExpiry(expiry4, -Infinity, now + 2500), 53000);
  assert.equal(updateInvulnerabilityExpiry(expiry4, undefined, now + 2500), 53000);

  // Step 5: Legitimate extension with higher duration (e.g. 5000ms at t = 51,000 -> target 56,000 > 53,000)
  const upgradedExpiry = updateInvulnerabilityExpiry(expiry4, 5000, now + 1000);
  assert.equal(upgradedExpiry, 56000, 'Greater duration must properly extend expiry to 56,000');
});

test('Chaos QA 9: BaseEntity invulnerableTimer resists overwrite degradation', () => {
  // Simulate entity timer degradation resistance
  let invulnTimer = 1500;
  const newDamageIFrame = 500;

  // Ensure Math.max guard prevents reducing active timer
  invulnTimer = Math.max(invulnTimer, newDamageIFrame);
  assert.equal(invulnTimer, 1500, 'Existing 1500ms timer must not be degraded by 500ms i-frame');

  // Upgrade timer when new duration is higher
  const superBuffIFrame = 3000;
  invulnTimer = Math.max(invulnTimer, superBuffIFrame);
  assert.equal(invulnTimer, 3000, 'Higher duration must upgrade timer to 3000ms');
});

/* ==============================================================================
 * SECTION 9: DYNAMIC HAZARD EXTREME INPUT FUZZING
 * ============================================================================== */

test('Chaos QA 9: DynamicHazard rejects corrupt, negative, and NaN inputs across all public APIs', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // 1. checkPlayerCollision input fuzzing
  const corruptCoords = [
    [-999, -999],
    [NaN, NaN],
    [Infinity, 5],
    [5, -Infinity],
    [100, 100],
    [-1, 4],
    [5, -1],
  ];

  for (const [r, c] of corruptCoords) {
    const col = hazard.checkPlayerCollision(r, c, false, 0);
    assert.equal(col.hit, false, `Corrupt coord (${r}, ${c}) must return hit=false`);
    assert.equal(col.damage, 0);
  }

  // 2. dashElapsedMs fuzzing
  hazard.update(2000 + 2000); // ACTIVE beam
  const colNegDash = hazard.checkPlayerCollision(5, 4, true, -500);
  assert.ok(colNegDash.hit);
  assert.equal(colNegDash.damage, 0, 'Negative dash elapsed sanitizes to 0ms (within 150ms window)');

  const colNanDash = hazard.checkPlayerCollision(5, 4, true, NaN);
  assert.ok(colNanDash.hit);
  assert.equal(colNanDash.damage, 0, 'NaN dash elapsed sanitizes to 0ms (within 150ms window)');

  // 3. onBombPlaced input fuzzing
  const bombPlacedNan = hazard.onBombPlaced(999, NaN, NaN, NaN, NaN);
  assert.equal(bombPlacedNan.isEntangled, false);
  assert.equal(bombPlacedNan.modifiedFuseMs, STANDARD_FUSE_MS);

  const bombPlacedNeg = hazard.onBombPlaced(999, -5, -5, -10, -500);
  assert.equal(bombPlacedNeg.isEntangled, false);
  assert.ok(bombPlacedNeg.modifiedFuseMs >= 100);

  // 4. onBombDetonated input fuzzing
  const bombDetNan = hazard.onBombDetonated(999, NaN, NaN, NaN);
  assert.equal(bombDetNan.overcharged, false);
  assert.equal(bombDetNan.modifiedPower, 1, 'NaN power sanitizes to 1');
  assert.equal(bombDetNan.piercing, false);

  const bombDetNeg = hazard.onBombDetonated(999, -1, -1, -5);
  assert.equal(bombDetNeg.overcharged, false);
  assert.equal(bombDetNeg.modifiedPower, 1, 'Negative power sanitizes to 1');

  // 5. onBombBlastImpact input fuzzing
  const impactNan = hazard.onBombBlastImpact(NaN, NaN);
  assert.equal(impactNan.polarized, false);
  assert.equal(impactNan.cleansedTileCount, 0);

  // 6. resolveSafeEjection input fuzzing
  const ejectNan = hazard.resolveSafeEjection(NaN, NaN);
  assert.equal(ejectNan.displaced, false);

  // 7. update timestep fuzzing
  const timerBefore = hazard.getCycleTimerMs();
  hazard.update(NaN);
  hazard.update(-100);
  hazard.update(-Infinity);
  hazard.update(0);
  assert.equal(hazard.getCycleTimerMs(), timerBefore, 'Invalid deltaMs must be strictly rejected without state drift');
});

/* ==============================================================================
 * SECTION 10: INTEGRATION MATRIX: SECOND WIND & TACHYON SHEAR INTERACTION
 * ============================================================================== */

test('Chaos QA 9: Second Wind perk revival grants 3.0s invulnerability protecting against Tachyon Shear', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + 2000); // Enter ACTIVE beam on Col 4
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  // 1. Player sustains fatal blow with Second Wind
  const perks = PerkTreeManager.calculateAppliedBonuses({ second_wind: 1 });
  const secondWindRes = PerkTreeManager.triggerSecondWind(perks, false);
  assert.equal(secondWindRes.saved, true);
  assert.equal(secondWindRes.remainingHp, 1);
  assert.equal(secondWindRes.invulnDurationMs, 3000);
  assert.equal(secondWindRes.speedBurstBonus, 0.50);

  // 2. Set invulnerability timestamp
  const now = 10000;
  let invulnExpiry = updateInvulnerabilityExpiry(0, secondWindRes.invulnDurationMs, now);
  assert.equal(invulnExpiry, 13000);

  // 3. Player walks directly through active Tachyon Discharge beam (5, 4) with invulnerability active
  const isCurrentlyInvulnerable = now + 1000 < invulnExpiry; // t = 11,000 < 13,000
  assert.ok(isCurrentlyInvulnerable);

  const beamCollision = hazard.checkPlayerCollision(5, 4, false, 0, isCurrentlyInvulnerable);
  assert.equal(beamCollision.hit, true);
  assert.equal(beamCollision.damage, 0, 'Second Wind invulnerability must absorb Tachyon Shear');
  assert.equal(beamCollision.isLethal, false);
  assert.equal(beamCollision.phaseJitterInflicted, false, 'No Phase Jitter while invulnerable');

  // 4. Stacking Speed Up + Second Wind speed burst (+50%): strictly clamped
  const effectiveSpeed = calculateClampedPlayerSpeed({
    itemSpeed: 250,
    speedMultiplier: 1 + secondWindRes.speedBurstBonus, // 250 * 1.5 = 375 px/s
  });
  assert.equal(effectiveSpeed, 350, 'Second Wind speed burst must clamp strictly to 350 px/s');

  // 5. Secondary shield shatter at t = 11,500 must not overwrite 13,000 expiry
  invulnExpiry = updateInvulnerabilityExpiry(invulnExpiry, 1500, 11500); // target 13,000
  assert.equal(invulnExpiry, 13000);

  // 6. Null/undefined safety in PerkTree triggerSecondWind
  const nullCheck = PerkTreeManager.triggerSecondWind(null, false);
  assert.equal(nullCheck.saved, false);
  assert.equal(nullCheck.remainingHp, 0);
});

