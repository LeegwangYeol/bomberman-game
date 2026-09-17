/**
 * Comprehensive Progression, Scaling, Game Modes, Perk Tree & Relics Test Suite
 *
 * Covers:
 * 1. Tier 1: ProgressionTypes Catalog, Mutators, Perk Tree, Relics & Synergies
 * 2. Tier 2: Mathematical Scaling Engine Formulas & Mobile Soft Caps
 * 3. Tier 3: 16-Node Confectionery Perk Tree, Prerequisites, 100% Respec & Second Wind
 * 4. Tier 4: Relic System Mechanics, 500ms ICD Loop Protection, Triggers & Synergies
 * 5. Tier 5: Game Modes (Crisis Survival 60s/45s, Boss Rush 5 Bosses & Medals, Endless Gauntlet Boons & Checkpoints)
 * 6. Tier 6: High-Wave Boundary Stress, Score Clamping & Invariant Conservation
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GameModeType,
  GAME_MODE_DEFINITIONS,
  WaveMutatorId,
  WAVE_MUTATOR_CATALOG,
  PerkBranch,
  CONFECTIONERY_PERKS,
  RelicId,
  RELIC_CATALOG,
  SYNERGY_DEFINITIONS,
  ScalingEngine,
  GameModeManager,
  BOSS_RUSH_SEQUENCE,
  BOSS_RUSH_MEDAL_LIMITS_SEC,
  getBossRushMedal,
  determineChamberType,
  ChamberType,
  PerkTreeManager,
  RelicManager,
} from '../src/game/progression/index.ts';

/* ==============================================================================
 * TIER 1: SPECIFICATION CATALOG & DEFINITIONS
 * ============================================================================== */

test('Tier 1: GameModeType catalog defines all 4 distinct game modes with complete metadata', () => {
  const modes = [
    GameModeType.STANDARD,
    GameModeType.CRISIS_SURVIVAL,
    GameModeType.BOSS_RUSH,
    GameModeType.ENDLESS_GAUNTLET,
  ];

  for (const mode of modes) {
    const def = GAME_MODE_DEFINITIONS[mode];
    assert.ok(def, `Missing definition for mode ${mode}`);
    assert.equal(def.id, mode);
    assert.ok(def.name.length > 0);
    assert.ok(def.badge.length > 0);
    assert.ok(def.icon.length > 0);
    assert.ok(def.description.length > 0);
    assert.ok(def.features.length >= 3);
    assert.ok(def.rules.timerType);
  }
});

test('Tier 1: WaveMutatorCatalog defines 7 distinct wave room mutators', () => {
  const mutatorIds = [
    WaveMutatorId.SPEED_DEMON,
    WaveMutatorId.VOLATILE_CONDUITS,
    WaveMutatorId.DENSE_FORTIFICATION,
    WaveMutatorId.GLASS_CANNON,
    WaveMutatorId.MAGNETIC_DRIFT,
    WaveMutatorId.SOLAR_CORONA,
    WaveMutatorId.ZERO_G_FIZZ,
  ];

  assert.equal(Object.keys(WAVE_MUTATOR_CATALOG).length, 7);
  for (const id of mutatorIds) {
    const m = WAVE_MUTATOR_CATALOG[id];
    assert.ok(m, `Missing mutator ${id}`);
    assert.equal(m.id, id);
    assert.ok(m.name.length > 0);
    assert.ok(m.icon.length > 0);
    assert.ok(m.description.length > 0);
    assert.ok(typeof m.statModifiers === 'object');
  }
});

test('Tier 1: Confectionery Perk Tree defines 16 perks across 4 distinct branches', () => {
  const allPerks = Object.values(CONFECTIONERY_PERKS);
  assert.equal(allPerks.length, 16, 'Perk tree must have exactly 16 nodes');

  const branches = {
    [PerkBranch.BAKING]: 0,
    [PerkBranch.SUGAR_RUSH]: 0,
    [PerkBranch.RESILIENCE]: 0,
    [PerkBranch.ALCHEMY]: 0,
  };

  for (const p of allPerks) {
    assert.ok(branches[p.branch] !== undefined, `Invalid branch ${p.branch}`);
    branches[p.branch]++;
    assert.ok(p.id.length > 0);
    assert.ok(p.name.length > 0);
    assert.ok(p.icon.length > 0);
    assert.ok(p.maxLevel >= 1 && p.maxLevel <= 3);
    assert.equal(p.costs.length, p.maxLevel, 'Cost array length must match maxLevel');
    assert.equal(p.effects.length, p.maxLevel, 'Effects array length must match maxLevel');
  }

  // Exactly 4 perks per branch
  assert.equal(branches[PerkBranch.BAKING], 4);
  assert.equal(branches[PerkBranch.SUGAR_RUSH], 4);
  assert.equal(branches[PerkBranch.RESILIENCE], 4);
  assert.equal(branches[PerkBranch.ALCHEMY], 4);
});

test('Tier 1: Relic Catalog defines 8 distinct artifacts with 500ms ICD', () => {
  const allRelics = Object.values(RELIC_CATALOG);
  assert.equal(allRelics.length, 8, 'Must define exactly 8 relics');

  for (const r of allRelics) {
    assert.ok(r.id.length > 0);
    assert.ok(r.name.length > 0);
    assert.ok(r.icon.length > 0);
    assert.ok(r.rarity);
    assert.ok(r.description.length > 0);
    assert.ok(r.mechanics.length > 0);
    assert.equal(r.internalCooldownMs, 500, 'All relics must have 500ms ICD');
  }
});

test('Tier 1: Synergy Catalog defines 4 unique pairwise synergies', () => {
  assert.equal(SYNERGY_DEFINITIONS.length, 4, 'Must define 4 pairwise synergies');

  const expected = ['Radiant Leech', 'Kinetic Pinball', 'Cosmic Supernova', 'Chrono Attraction'];
  for (const s of SYNERGY_DEFINITIONS) {
    assert.ok(expected.includes(s.name));
    assert.ok(RELIC_CATALOG[s.relicA]);
    assert.ok(RELIC_CATALOG[s.relicB]);
    assert.notEqual(s.relicA, s.relicB);
    assert.ok(s.description.length > 0);
  }
});

/* ==============================================================================
 * TIER 2: MATHEMATICAL SCALING ENGINE FORMULAS & SOFT CAPS
 * ============================================================================== */

test('Tier 2: v(W) formula scales velocity with soft cap 2.2x base speed', () => {
  // W=1: 1.0x (100 px/s)
  assert.equal(ScalingEngine.calculateEnemySpeedMultiplier(1), 1.0);
  assert.equal(ScalingEngine.calculateEnemyVelocity(1, 100), 100);

  // W=11: 1 + min(1.2, 0.035 * 10) = 1 + 0.35 = 1.35x
  assert.equal(ScalingEngine.calculateEnemySpeedMultiplier(11), 1.35);
  assert.equal(ScalingEngine.calculateEnemyVelocity(11, 100), 135);

  // W=35: 1 + min(1.2, 0.035 * 34) = 1 + 1.19 = 2.19x
  assert.equal(ScalingEngine.calculateEnemySpeedMultiplier(35), 2.19);

  // W=36: 1 + min(1.2, 0.035 * 35) = 1 + 1.2 = 2.20x
  assert.equal(ScalingEngine.calculateEnemySpeedMultiplier(36), 2.20);

  // W=100: Soft capped at 2.20x (Edge Case 15)
  assert.equal(ScalingEngine.calculateEnemySpeedMultiplier(100), 2.20);
  assert.equal(ScalingEngine.calculateEnemyVelocity(100, 100), 220);

  // Fastest enemy (base 150 px/s) at wave 100 clamps to 330 px/s
  assert.equal(ScalingEngine.calculateEnemyVelocity(100, 150), 330);
});

test('Tier 2: N(W) enemy density formula enforces strict cap of 14 concurrent enemies', () => {
  // N(W) = min(14, 4 + floor(sqrt(W - 1) * 1.5))
  assert.equal(ScalingEngine.calculateActiveEnemyCount(1), 4);
  assert.equal(ScalingEngine.calculateActiveEnemyCount(2), 5); // 4 + floor(1 * 1.5) = 5
  assert.equal(ScalingEngine.calculateActiveEnemyCount(5), 7); // 4 + floor(2 * 1.5) = 7
  assert.equal(ScalingEngine.calculateActiveEnemyCount(10), 8); // 4 + floor(3 * 1.5) = 8
  assert.equal(ScalingEngine.calculateActiveEnemyCount(26), 11); // 4 + floor(5 * 1.5) = 11
  assert.equal(ScalingEngine.calculateActiveEnemyCount(45), 13);
  assert.equal(ScalingEngine.calculateActiveEnemyCount(50), 14); // 4 + floor(7 * 1.5) = 14

  // Deep waves (Wave 100, Wave 500) strictly stay capped at 14 (Edge Case 15)
  assert.equal(ScalingEngine.calculateActiveEnemyCount(100), 14);
  assert.equal(ScalingEngine.calculateActiveEnemyCount(500), 14);
});

test('Tier 2: HP(W) and Armor Chance scaling', () => {
  // HP(W) = floor(HP0 + 0.25 * (W - 1))
  assert.equal(ScalingEngine.calculateEnemyHp(1, 1), 1);
  assert.equal(ScalingEngine.calculateEnemyHp(4, 1), 1);
  assert.equal(ScalingEngine.calculateEnemyHp(5, 1), 2); // 1 + floor(0.25 * 4) = 2
  assert.equal(ScalingEngine.calculateEnemyHp(9, 1), 3);

  // Reinforced Armor chance: 0 below wave 5, 20% at wave 5
  assert.equal(ScalingEngine.calculateArmorChance(1), 0.0);
  assert.equal(ScalingEngine.calculateArmorChance(4), 0.0);
  assert.equal(ScalingEngine.calculateArmorChance(5), 0.20);
  assert.equal(ScalingEngine.calculateArmorChance(10), 0.30);
  assert.ok(ScalingEngine.calculateArmorChance(30) <= 0.50);
});

test('Tier 2: Fuse(W) and Reaction(W) scaling formulas', () => {
  // Fuse(W) = max(1200ms, 2000ms - 40ms * (W - 1))
  assert.equal(ScalingEngine.calculateBombFuseMs(1), 2000);
  assert.equal(ScalingEngine.calculateBombFuseMs(6), 1800);
  assert.equal(ScalingEngine.calculateBombFuseMs(21), 1200);
  assert.equal(ScalingEngine.calculateBombFuseMs(50), 1200, 'Fuse must floor at 1200ms');

  // Reaction(W) = max(200ms, 600ms - 20ms * (W - 1))
  assert.equal(ScalingEngine.calculateEnemyReactionMs(1), 600);
  assert.equal(ScalingEngine.calculateEnemyReactionMs(11), 400);
  assert.equal(ScalingEngine.calculateEnemyReactionMs(21), 200);
  assert.equal(ScalingEngine.calculateEnemyReactionMs(50), 200, 'Reaction must floor at 200ms');
});

test('Tier 2: Score Multiplier M(W) formula', () => {
  // M(W, Streak) = 1.0 + 0.15 * (W - 1) + 0.05 * Streak
  assert.equal(ScalingEngine.calculateScoreMultiplier(1, 0), 1.0);
  assert.equal(ScalingEngine.calculateScoreMultiplier(5, 0), 1.6);
  assert.equal(ScalingEngine.calculateScoreMultiplier(5, 4), 1.8);
  assert.equal(ScalingEngine.calculateScoreMultiplier(10, 10), 2.85);
});

test('Tier 2: Compact Score Formatter (Edge Case 16)', () => {
  assert.equal(ScalingEngine.formatScore(450), '450');
  assert.equal(ScalingEngine.formatScore(9999), '9,999');
  assert.equal(ScalingEngine.formatScore(14500), '14.5K');
  assert.equal(ScalingEngine.formatScore(450000), '450K');
  assert.equal(ScalingEngine.formatScore(1250000), '1.25M');
  assert.equal(ScalingEngine.formatScore(14800000), '14.8M');
  assert.equal(ScalingEngine.formatScore(1000000000), '1000M');
});

test('Tier 2: Boss HP formula scales linearly with wave index', () => {
  assert.equal(ScalingEngine.calculateBossHp(1, 10), 10);
  assert.equal(ScalingEngine.calculateBossHp(3, 10), 13); // 10 * (1 + 0.3)
  assert.equal(ScalingEngine.calculateBossHp(5, 10), 16); // 10 * (1 + 0.6)
});

test('Tier 2: Dynamic Wave Mutator Generator ensures no conflicting affixes', () => {
  assert.equal(ScalingEngine.generateWaveMutators(1).length, 0);
  assert.equal(ScalingEngine.generateWaveMutators(2).length, 0);

  const m3 = ScalingEngine.generateWaveMutators(3);
  assert.equal(m3.length, 1);

  const m6 = ScalingEngine.generateWaveMutators(6);
  assert.equal(m6.length, 2);
  assert.notEqual(m6[0].id, m6[1].id, 'Mutators must be distinct');

  // Verify incompatible pair (Glass Cannon + Dense Fortification) is never picked
  for (let w = 6; w <= 50; w++) {
    const muts = ScalingEngine.generateWaveMutators(w);
    if (muts.length === 2) {
      const hasGlass = muts.some((m) => m.id === WaveMutatorId.GLASS_CANNON);
      const hasDense = muts.some((m) => m.id === WaveMutatorId.DENSE_FORTIFICATION);
      assert.ok(!(hasGlass && hasDense), `Wave ${w} had conflicting mutators!`);
    }
  }
});

/* ==============================================================================
 * TIER 3: CONFECTIONERY PERK TREE & RESPEC MECHANICS
 * ============================================================================== */

test('Tier 3: Perk Tree upgrade validation rejects insufficient essence', () => {
  const check = PerkTreeManager.canUpgradePerk('sugar_spark', {}, 2);
  assert.equal(check.canUpgrade, false);
  assert.equal(check.cost, 5);
  assert.ok(check.reason?.includes('Insufficient'));
});

test('Tier 3: Perk Tree enforces prerequisite locks', () => {
  // master_confectioner requires sugar_spark >= 2
  const check1 = PerkTreeManager.canUpgradePerk('master_confectioner', {}, 100);
  assert.equal(check1.canUpgrade, false);
  assert.ok(check1.reason?.includes('Sugar Spark'));

  // With sugar_spark level 1, still locked
  const check2 = PerkTreeManager.canUpgradePerk('master_confectioner', { sugar_spark: 1 }, 100);
  assert.equal(check2.canUpgrade, false);

  // With sugar_spark level 2, unlocked!
  const check3 = PerkTreeManager.canUpgradePerk('master_confectioner', { sugar_spark: 2 }, 100);
  assert.equal(check3.canUpgrade, true);
  assert.equal(check3.cost, 40);
});

test('Tier 3: Perk Tree upgrade deducts essence and increments level up to max', () => {
  let perks = {};
  let essence = 50;

  // Level 1: cost 5
  const step1 = PerkTreeManager.upgradePerk('sugar_spark', perks, essence);
  assert.equal(step1.success, true);
  assert.equal(step1.newPerks.sugar_spark, 1);
  assert.equal(step1.remainingEssence, 45);
  perks = step1.newPerks;
  essence = step1.remainingEssence;

  // Level 2: cost 10
  const step2 = PerkTreeManager.upgradePerk('sugar_spark', perks, essence);
  assert.equal(step2.success, true);
  assert.equal(step2.newPerks.sugar_spark, 2);
  assert.equal(step2.remainingEssence, 35);
  perks = step2.newPerks;
  essence = step2.remainingEssence;

  // Level 3: cost 20
  const step3 = PerkTreeManager.upgradePerk('sugar_spark', perks, essence);
  assert.equal(step3.success, true);
  assert.equal(step3.newPerks.sugar_spark, 3);
  assert.equal(step3.remainingEssence, 15);
  perks = step3.newPerks;
  essence = step3.remainingEssence;

  // Level 4: Exceeds max level 3 -> rejected
  const step4 = PerkTreeManager.upgradePerk('sugar_spark', perks, essence);
  assert.equal(step4.success, false);
  assert.equal(step4.error, 'Perk already at maximum level');
});

test('Tier 3: 100% Respec Refund returns all spent Cosmic Sugar Essence', () => {
  const testPerks = {
    sugar_spark: 3, // costs 5 + 10 + 20 = 35
    bouncy_soles: 2, // costs 5 + 10 = 15
    second_wind: 1, // cost 45
  };
  const initialSpent = PerkTreeManager.calculateSpentEssence(testPerks);
  assert.equal(initialSpent, 35 + 15 + 45); // 95

  const respec = PerkTreeManager.respecAllPerks(testPerks, 10);
  assert.deepEqual(respec.newPerks, {});
  assert.equal(respec.refundedEssence, 95);
  assert.equal(respec.totalEssence, 105);
});

test('Tier 3: calculateAppliedBonuses derives correct player buffs', () => {
  const fullPerks = {
    sugar_spark: 3,
    quick_wick: 3,
    chain_reaction: 2,
    master_confectioner: 1,
    bouncy_soles: 3,
    corner_magnet: 2,
    dash_decoy: 1,
    hyper_sprint: 1,
    sugar_coating: 2,
    second_wind: 1,
    hazard_buffer: 2,
    titan_heart: 1,
    sweet_tooth: 3,
    merchant_discount: 2,
    relic_resonance: 2,
    golden_touch: 1,
  };

  const b = PerkTreeManager.calculateAppliedBonuses(fullPerks);
  assert.equal(b.startingBlastRadiusBonus, 3);
  assert.equal(b.bombCooldownReduction, 0.25);
  assert.equal(b.chainScoreBonus, 0.50);
  assert.equal(b.chainUltChargeBonus, 0.10);
  assert.equal(b.maxBombCapacity, 9);
  assert.equal(b.baseSpeedBonus, 30);
  assert.equal(b.cornerSlideTolerance, 14);
  assert.equal(b.hasDashDecoy, true);
  assert.equal(b.dashCooldownReductionMs, 1000);
  assert.equal(b.dashSpeedBurstRatio, 0.20);
  assert.equal(b.startingShields, 2);
  assert.equal(b.hasSecondWind, true);
  assert.equal(b.groundSlowdownReduction, 0.80);
  assert.equal(b.extraHeartContainer, 1);
  assert.equal(b.itemDropRateBonus, 0.15);
  assert.equal(b.shopDiscountRatio, 0.30);
  assert.equal(b.relicDropChanceBonus, 0.20);
  assert.equal(b.maxRelicSlots, 2);
  assert.equal(b.gildedChestChance, 0.05);
});

test('Tier 3: Second Wind fatal damage survival (Edge Case 19)', () => {
  const bonusesWithWind = PerkTreeManager.calculateAppliedBonuses({ second_wind: 1 });
  const bonusesWithoutWind = PerkTreeManager.calculateAppliedBonuses({});

  // 1. Without perk: not saved
  const fail = PerkTreeManager.triggerSecondWind(bonusesWithoutWind, false);
  assert.equal(fail.saved, false);
  assert.equal(fail.remainingHp, 0);

  // 2. First fatal blow with perk: saved with 1 HP, 3.0s invulnerability, +50% speed burst
  const save = PerkTreeManager.triggerSecondWind(bonusesWithWind, false);
  assert.equal(save.saved, true);
  assert.equal(save.remainingHp, 1);
  assert.equal(save.invulnDurationMs, 3000);
  assert.equal(save.speedBurstBonus, 0.50);

  // 3. Second fatal blow in same run: already consumed -> dies
  const consumed = PerkTreeManager.triggerSecondWind(bonusesWithWind, true);
  assert.equal(consumed.saved, false);
  assert.equal(consumed.remainingHp, 0);
});

/* ==============================================================================
 * TIER 4: RELIC SYSTEM MECHANICS, 500MS ICD & SYNERGIES
 * ============================================================================== */

test('Tier 4: RelicManager slot limits and equip/unequip', () => {
  const rm = new RelicManager([], 1);
  assert.equal(rm.getMaxSlots(), 1);

  // Equip first relic
  const eq1 = rm.equipRelic(RelicId.POCKET_CHRONOMETER);
  assert.equal(eq1.success, true);
  assert.equal(rm.isEquipped(RelicId.POCKET_CHRONOMETER), true);

  // Cannot exceed 1 slot
  const eq2 = rm.equipRelic(RelicId.GELATINOUS_CORE);
  assert.equal(eq2.success, false);
  assert.ok(eq2.error?.includes('full'));

  // Expand to 2 slots via Perk
  rm.setMaxSlots(2);
  const eq3 = rm.equipRelic(RelicId.GELATINOUS_CORE);
  assert.equal(eq3.success, true);
  assert.equal(rm.getEquippedRelics().length, 2);

  // Unequip
  assert.equal(rm.unequipRelic(RelicId.POCKET_CHRONOMETER), true);
  assert.equal(rm.getEquippedRelics().length, 1);
});

test('Tier 4: Relic Synergies detection', () => {
  const rm = new RelicManager([RelicId.VAMPIRIC_CONFECTION, RelicId.SOLAR_CAPACITOR], 2);
  const synergies = rm.getActiveSynergies();
  assert.equal(synergies.length, 1);
  assert.equal(synergies[0].name, 'Radiant Leech');

  rm.unequipRelic(RelicId.SOLAR_CAPACITOR);
  assert.equal(rm.getActiveSynergies().length, 0);

  rm.equipRelic(RelicId.GELATINOUS_CORE);
  rm.setMaxSlots(2);
  rm.unequipRelic(RelicId.VAMPIRIC_CONFECTION);
  rm.equipRelic(RelicId.CLOCKWORK_SPRING);
  assert.equal(rm.getActiveSynergies()[0].name, 'Kinetic Pinball');
});

test('Tier 4: 500ms Internal Cooldown Guard suppresses rapid loop procs (Edge Case 21)', () => {
  const rm = new RelicManager([RelicId.PYROCLASTIC_PRISM], 1);

  // 1st explosion at t=1000ms: succeeds
  const proc1 = rm.onBombExploded({ r: 5, c: 5 }, 1000);
  assert.equal(proc1.spawnDiagonalShards, true);
  assert.equal(proc1.shards.length, 4);

  // 2nd explosion at t=1200ms (< 500ms): suppressed by ICD guard
  const proc2 = rm.onBombExploded({ r: 5, c: 5 }, 1200);
  assert.equal(proc2.spawnDiagonalShards, false);

  // 3rd explosion at t=1600ms (>= 500ms): succeeds
  const proc3 = rm.onBombExploded({ r: 5, c: 5 }, 1600);
  assert.equal(proc3.spawnDiagonalShards, true);
});

test('Tier 4: Relic Triggers: Pocket Chronometer and Solar Capacitor', () => {
  const rm = new RelicManager([RelicId.POCKET_CHRONOMETER, RelicId.SOLAR_CAPACITOR], 2);

  // Time > 30s: Chronometer not active
  const tick1 = rm.update(1000, 1000, 45, true);
  assert.equal(tick1.applyEnemySlow, false);

  // Time <= 30s: Chronometer activates with 20% slow
  const tick2 = rm.update(1000, 2000, 28, false);
  assert.equal(tick2.applyEnemySlow, true);
  assert.equal(tick2.slowRatio, 0.80);

  // Solar Capacitor charges over 8.0s in open corridor
  let shieldGranted = false;
  let time = 3000;
  for (let i = 0; i < 9; i++) {
    time += 1000;
    const res = rm.update(1000, time, 25, true);
    if (res.solarShieldGranted) shieldGranted = true;
  }
  assert.equal(shieldGranted, true);
  assert.equal(rm.hasSolarShield, true);
});

test('Tier 4: Relic Triggers: Vampiric Confection restores shield on 5 kills', () => {
  const rm = new RelicManager([RelicId.VAMPIRIC_CONFECTION], 1);

  let now = 1000;
  assert.equal(rm.onEnemyKilled(now += 600).shieldGranted, false);
  assert.equal(rm.onEnemyKilled(now += 600).shieldGranted, false);
  assert.equal(rm.onEnemyKilled(now += 600).shieldGranted, false);
  assert.equal(rm.onEnemyKilled(now += 600).shieldGranted, false);
  // 5th kill restores shield
  assert.equal(rm.onEnemyKilled(now += 600).shieldGranted, true);

  // Taking damage resets kill streak
  rm.onPlayerDamaged();
  assert.equal(rm.vampiricKillStreak, 0);
});

test('Tier 4: Relic Triggers: Clockwork Spring kick speed and soft block pierce', () => {
  const rm = new RelicManager([RelicId.CLOCKWORK_SPRING], 1);
  const kick = rm.onBombKicked(1000);
  assert.equal(kick.velocityPxPerSec, 450);
  assert.equal(kick.softBlockPierceCount, 1);

  // With Kinetic Pinball synergy: 2 pierces
  rm.setMaxSlots(2);
  rm.equipRelic(RelicId.GELATINOUS_CORE);
  const synergyKick = rm.onBombKicked(2000);
  assert.equal(synergyKick.softBlockPierceCount, 2);
});

test('Tier 4: Relic Drop Generator: Boss guarantee and chest drop chances', () => {
  const perkBonuses = PerkTreeManager.calculateAppliedBonuses({});
  // Boss kill: 100% guaranteed drop
  const bossDrop = RelicManager.rollRelicDrop(true, false, perkBonuses, 42);
  assert.ok(bossDrop !== null);
  assert.ok(RELIC_CATALOG[bossDrop]);
});

/* ==============================================================================
 * TIER 5: GAME MODES (SURVIVAL, BOSS RUSH, ENDLESS GAUNTLET)
 * ============================================================================== */

test('Tier 5: Crisis Survival Mode: 60s Crisis Cadence and 45s Drop Pods', () => {
  const mgr = new GameModeManager(GameModeType.CRISIS_SURVIVAL);
  assert.equal(mgr.currentMode, GameModeType.CRISIS_SURVIVAL);

  // Tick 30 seconds
  const tick1 = mgr.update(30000);
  assert.equal(tick1.triggerCrisis, undefined);
  assert.equal(tick1.spawnDropPod, undefined);
  assert.equal(mgr.survivalElapsedMs, 30000);

  // Tick another 15 seconds (total 45s) -> Drop Pod triggers!
  const tick2 = mgr.update(15000);
  assert.equal(tick2.spawnDropPod, true);
  assert.equal(tick2.triggerCrisis, undefined);

  // Tick another 15 seconds (total 60s) -> Crisis triggers!
  const tick3 = mgr.update(15000);
  assert.equal(tick3.triggerCrisis, true);

  // Crisis resolution awards +15 Cosmic Essence
  mgr.onCrisisPurified();
  assert.equal(mgr.crisesPurifiedCount, 1);
  assert.equal(mgr.cosmicEssence, 15);
});

test('Tier 5: Crisis Survival Drop Pod full inventory handling (Edge Case 18)', () => {
  const mgr = new GameModeManager(GameModeType.CRISIS_SURVIVAL);

  // 1. Normal inventory: awards gear and +250 score
  const pod1 = mgr.collectDropPod(false);
  assert.equal(pod1.type, 'gear');
  assert.equal(pod1.bonusScore, 250);

  // 2. Full inventory: converts to overshield and +500 score
  const pod2 = mgr.collectDropPod(true);
  assert.equal(pod2.type, 'overshield');
  assert.equal(pod2.bonusScore, 500);
});

test('Tier 5: Boss Rush Mode: 5 Consecutive Bosses, Rest Stops & Medals', () => {
  const mgr = new GameModeManager(GameModeType.BOSS_RUSH);
  assert.equal(mgr.currentMode, GameModeType.BOSS_RUSH);
  assert.equal(BOSS_RUSH_SEQUENCE.length, 5);

  // Boss 1 defeated -> Enter 20s rest stop
  const b1 = mgr.onBossDefeated();
  assert.equal(b1.isRushComplete, false);
  assert.equal(mgr.isAtRestStop, true);
  assert.equal(mgr.restStopTimerMs, 20000);
  assert.equal(mgr.bossRushIndex, 1);

  // Rest stop tick down
  const tick = mgr.update(20000);
  assert.equal(tick.restStopExpired, true);
  assert.equal(mgr.isAtRestStop, false);

  // Boss 2, 3, 4 defeated
  mgr.skipRestStop();
  mgr.onBossDefeated(); // Boss 2
  mgr.skipRestStop();
  mgr.onBossDefeated(); // Boss 3
  mgr.skipRestStop();
  mgr.onBossDefeated(); // Boss 4
  mgr.skipRestStop();

  // Boss 5 defeated -> Rush complete!
  mgr.bossRushElapsedMs = 280000; // 280s (< 300s)
  const finalBoss = mgr.onBossDefeated();
  assert.equal(finalBoss.isRushComplete, true);
  assert.equal(finalBoss.medal, 'PLATINUM');
});

test('Tier 5: Boss Rush Medal thresholds', () => {
  assert.equal(BOSS_RUSH_MEDAL_LIMITS_SEC.PLATINUM, 300);
  assert.equal(BOSS_RUSH_MEDAL_LIMITS_SEC.GOLD, 420);
  assert.equal(BOSS_RUSH_MEDAL_LIMITS_SEC.SILVER, 600);
  assert.equal(getBossRushMedal(299), 'PLATINUM');
  assert.equal(getBossRushMedal(300), 'GOLD');
  assert.equal(getBossRushMedal(419), 'GOLD');
  assert.equal(getBossRushMedal(420), 'SILVER');
  assert.equal(getBossRushMedal(599), 'SILVER');
  assert.equal(getBossRushMedal(600), 'BRONZE');
});

test('Tier 5: Endless Gauntlet: Chamber Taxonomy, 3-Card Boon Draft & Checkpoints', () => {
  const mgr = new GameModeManager(GameModeType.ENDLESS_GAUNTLET);

  // Chamber Taxonomy
  assert.equal(determineChamberType(1), ChamberType.STANDARD);
  assert.equal(determineChamberType(3), ChamberType.ELITE);
  assert.equal(determineChamberType(4), ChamberType.CRISIS);
  assert.equal(determineChamberType(5), ChamberType.BOSS);
  assert.equal(determineChamberType(10), ChamberType.BOSS);

  // Clear Chamber 1 -> Triggers 3-card boon draft
  const draft = mgr.onChamberCleared();
  assert.equal(draft.length, 3);
  assert.equal(mgr.isAwaitingBoonSelection, true);

  // Select boon
  const chosenId = draft[0].id;
  assert.equal(mgr.selectBoon(chosenId), true);
  assert.equal(mgr.isAwaitingBoonSelection, false);

  // Checkpoints at Chamber 10
  for (let c = 2; c <= 9; c++) {
    mgr.onChamberCleared();
  }
  assert.ok(mgr.unlockedCheckpoints.includes(10));
});

/* ==============================================================================
 * TIER 6: STRESS, BOUNDARIES & INVARIANT CONSERVATION
 * ============================================================================== */

test('Tier 6: Wave 1 to 1,000 monotonic scaling stability without NaN or negative values', () => {
  for (let w = 1; w <= 1000; w += 10) {
    const params = ScalingEngine.calculateWaveParameters(w, 100, 1, 5);
    assert.ok(params.enemyVelocityMultiplier >= 1.0 && params.enemyVelocityMultiplier <= 2.20);
    assert.ok(params.activeEnemyCount >= 4 && params.activeEnemyCount <= 14);
    assert.ok(params.bombFuseMs >= 1200 && params.bombFuseMs <= 2000);
    assert.ok(params.enemyReactionMs >= 200 && params.enemyReactionMs <= 600);
    assert.ok(params.scoreMultiplier >= 1.0);
    assert.ok(!Number.isNaN(params.enemyVelocity));
  }
});

test('Tier 6: 10,000 rapid perk upgrade and respec cycles maintain exact essence balance', () => {
  let essence = 1000;
  let perks = {};
  const perkKeys = Object.keys(CONFECTIONERY_PERKS);

  for (let i = 0; i < 1000; i++) {
    const randomKey = perkKeys[i % perkKeys.length];
    const up = PerkTreeManager.upgradePerk(randomKey, perks, essence);
    if (up.success) {
      perks = up.newPerks;
      essence = up.remainingEssence;
    }

    if (i % 100 === 0) {
      const respec = PerkTreeManager.respecAllPerks(perks, essence);
      assert.equal(respec.totalEssence, 1000, 'Total essence must be strictly conserved!');
      perks = respec.newPerks;
      essence = respec.totalEssence;
    }
  }
});
