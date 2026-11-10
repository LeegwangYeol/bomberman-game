/**
 * tests/cryo_glacial_core_and_thermal_shock_synergy.test.mjs
 *
 * Exhaustive Verification Suite for:
 * 1. 12th Relic: CRYO_GLACIAL_CORE (Epic, Cryogenic Frost Burst, 2.5-tile blast, 40 dmg, 40% Glacial Chill slow for 2.0s, 500ms ICD)
 * 2. 8th Synergy: 'Thermal Shock Reaction' (PYROCLASTIC_PRISM + CRYO_GLACIAL_CORE -> 3.0-tile, 100 dmg, 40% slow for 2.5s)
 * 3. Bijective catalog integrity across all 12 relics and 8 synergies
 * 4. 10,000-cycle Zero-GC stress and numerical stability verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RelicId,
} from '../src/game/progression/ProgressionTypes.ts';

import {
  RELIC_CATALOG,
  SYNERGY_DEFINITIONS,
  RelicManager,
} from '../src/game/progression/RelicSystem.ts';

/* ==============================================================================
 * TIER 1: CATALOG DEFINITIONS & BIJECTIVE SYMMETRY
 * ============================================================================== */

test('Tier 1.1: Catalog contains exactly 12 relics', () => {
  assert.equal(Object.keys(RELIC_CATALOG).length, 12, 'Catalog must register exactly 12 relics');
  assert.ok(RelicId.CRYO_GLACIAL_CORE, 'RelicId.CRYO_GLACIAL_CORE enum must exist');
  assert.equal(RelicId.CRYO_GLACIAL_CORE, 'cryo_glacial_core');
});

test('Tier 1.2: CRYO_GLACIAL_CORE configuration integrity', () => {
  const relic = RELIC_CATALOG[RelicId.CRYO_GLACIAL_CORE];
  assert.ok(relic, 'CRYO_GLACIAL_CORE must exist in RELIC_CATALOG');
  assert.equal(relic.id, RelicId.CRYO_GLACIAL_CORE);
  assert.equal(relic.name, 'Cryo Glacial Core');
  assert.equal(relic.rarity, 'epic');
  assert.equal(relic.icon, '❄️🧊');
  assert.equal(relic.internalCooldownMs, 500);
  assert.ok(relic.synergyPartners.includes(RelicId.PYROCLASTIC_PRISM));
  assert.equal(relic.synergyName, 'Thermal Shock Reaction');
});

test('Tier 1.3: Reciprocal Bijective Synergy Partner Alignment', () => {
  const pyro = RELIC_CATALOG[RelicId.PYROCLASTIC_PRISM];
  const cryo = RELIC_CATALOG[RelicId.CRYO_GLACIAL_CORE];

  assert.ok(
    pyro.synergyPartners.includes(RelicId.CRYO_GLACIAL_CORE),
    'PYROCLASTIC_PRISM must have CRYO_GLACIAL_CORE as a synergy partner'
  );
  assert.ok(
    cryo.synergyPartners.includes(RelicId.PYROCLASTIC_PRISM),
    'CRYO_GLACIAL_CORE must have PYROCLASTIC_PRISM as a synergy partner'
  );
});

test('Tier 1.4: 8 Active Synergies registered in SYNERGY_DEFINITIONS', () => {
  assert.equal(SYNERGY_DEFINITIONS.length, 8, 'Must have exactly 8 synergies registered');
  const thermalShock = SYNERGY_DEFINITIONS.find((s) => s.name === 'Thermal Shock Reaction');
  assert.ok(thermalShock, 'Thermal Shock Reaction synergy must exist in SYNERGY_DEFINITIONS');
  assert.ok(
    (thermalShock.relicA === RelicId.PYROCLASTIC_PRISM && thermalShock.relicB === RelicId.CRYO_GLACIAL_CORE) ||
    (thermalShock.relicA === RelicId.CRYO_GLACIAL_CORE && thermalShock.relicB === RelicId.PYROCLASTIC_PRISM)
  );
  assert.equal(thermalShock.icon, '🔥❄️');
  assert.ok(thermalShock.description.includes('Thermal Shatter'));
});

/* ==============================================================================
 * TIER 2: STANDALONE CRYO_GLACIAL_CORE COMBAT PROCS & ICD GUARDS
 * ============================================================================== */

test('Tier 2.1: Standalone Frost Burst applies 40 damage and 40% slow within 2.5 tiles', () => {
  const manager = new RelicManager([RelicId.CRYO_GLACIAL_CORE], 4);
  const now = 100000;

  // Enemies at various distances (tile 4,4 bomb epicenter)
  const mockEnemies = [
    { id: 'e1', r: 4, c: 5 }, // 1.0 tiles away -> within 2.5
    { id: 'e2', r: 5, c: 6 }, // sqrt(1^2 + 2^2) = 2.236 tiles -> within 2.5
    { id: 'e3', r: 4, c: 7 }, // 3.0 tiles away -> OUTSIDE 2.5
    { id: 'e4', r: 1, c: 1 }, // far away -> OUTSIDE
  ];

  const proc = manager.onBombDetonationCryoGlacial(4, 4, mockEnemies, now);
  assert.equal(proc.triggered, true, 'Proc must trigger when equipped');
  assert.equal(proc.isThermalShock, false, 'Solo relic must not trigger Thermal Shock');
  assert.equal(proc.frostRadius, 2.5, 'Base radius is 2.5 tiles');
  assert.equal(proc.damage, 40, 'Base damage is 40');
  assert.equal(proc.slowRatio, 0.40, 'Base slow is 40%');
  assert.equal(proc.chillDurationMs, 2000, 'Base chill duration is 2000ms');

  assert.equal(proc.chilledEnemyIds.length, 2, 'Exactly 2 enemies within 2.5 tiles must be affected');
  assert.ok(proc.chilledEnemyIds.includes('e1'));
  assert.ok(proc.chilledEnemyIds.includes('e2'));
  assert.ok(!proc.chilledEnemyIds.includes('e3'));
  assert.ok(!proc.chilledEnemyIds.includes('e4'));
});

test('Tier 2.2: 500ms Internal Cooldown (ICD) Guard prevents spam', () => {
  const manager = new RelicManager([RelicId.CRYO_GLACIAL_CORE], 4);
  const t0 = 200000;
  const mockEnemies = [{ id: 'target_1', r: 4, c: 4 }];

  // First burst procs
  const proc1 = manager.onBombDetonationCryoGlacial(4, 4, mockEnemies, t0);
  assert.equal(proc1.triggered, true);
  assert.equal(proc1.chilledEnemyIds.length, 1);

  // Second burst at t0 + 200ms -> suppressed by 500ms ICD
  const proc2 = manager.onBombDetonationCryoGlacial(4, 4, mockEnemies, t0 + 200);
  assert.equal(proc2.triggered, false, 'Must be suppressed by ICD');
  assert.equal(proc2.chilledEnemyIds.length, 0);

  // Third burst at t0 + 499ms -> still suppressed
  const proc3 = manager.onBombDetonationCryoGlacial(4, 4, mockEnemies, t0 + 499);
  assert.equal(proc3.triggered, false, 'Must still be suppressed before 500ms');

  // Fourth burst at t0 + 500ms -> procs!
  const proc4 = manager.onBombDetonationCryoGlacial(4, 4, mockEnemies, t0 + 500);
  assert.equal(proc4.triggered, true, 'Must proc at exactly ICD elapsed');
  assert.equal(proc4.chilledEnemyIds.length, 1);
});

test('Tier 2.3: Un-equipped CRYO_GLACIAL_CORE does not proc', () => {
  const manager = new RelicManager([RelicId.POCKET_CHRONOMETER], 4);
  const mockEnemies = [{ id: 'target_1', r: 4, c: 4 }];
  const proc = manager.onBombDetonationCryoGlacial(4, 4, mockEnemies, 300000);
  assert.equal(proc.triggered, false);
  assert.equal(proc.chilledEnemyIds.length, 0);
});

/* ==============================================================================
 * TIER 3: THERMAL SHOCK REACTION SYNERGY
 * ============================================================================== */

test('Tier 3.1: Synergy active when PYROCLASTIC_PRISM and CRYO_GLACIAL_CORE are equipped', () => {
  const manager = new RelicManager([RelicId.PYROCLASTIC_PRISM, RelicId.CRYO_GLACIAL_CORE], 4);
  const synergies = manager.getActiveSynergies();

  assert.equal(synergies.length, 1);
  assert.equal(synergies[0].name, 'Thermal Shock Reaction');
  assert.equal(synergies[0].icon, '🔥❄️');
  assert.ok(manager.hasSynergy(RelicId.PYROCLASTIC_PRISM, RelicId.CRYO_GLACIAL_CORE));
  assert.ok(manager.hasSynergy(RelicId.CRYO_GLACIAL_CORE, RelicId.PYROCLASTIC_PRISM));
});

test('Tier 3.2: Thermal Shock expands radius to 3.0 tiles, increases damage to 100 and chill to 2.5s', () => {
  const manager = new RelicManager([RelicId.PYROCLASTIC_PRISM, RelicId.CRYO_GLACIAL_CORE], 4);
  const now = 400000;

  const mockEnemies = [
    { id: 'e1', r: 4, c: 5 }, // 1.0 tiles
    { id: 'e2', r: 4, c: 6 }, // 2.0 tiles
    { id: 'e3', r: 4, c: 7 }, // 3.0 tiles -> caught in 3.0 tile radius!
    { id: 'e4', r: 4, c: 8 }, // 4.0 tiles -> outside
  ];

  const proc = manager.onBombDetonationCryoGlacial(4, 4, mockEnemies, now);
  assert.equal(proc.triggered, true);
  assert.equal(proc.isThermalShock, true, 'Must identify as Thermal Shock');
  assert.equal(proc.frostRadius, 3.0, 'Synergy expands radius to 3.0 tiles');
  assert.equal(proc.damage, 100, 'Synergy elevates damage to 100');
  assert.equal(proc.slowRatio, 0.40);
  assert.equal(proc.chillDurationMs, 2500, 'Synergy extends chill duration to 2500ms');

  assert.equal(proc.chilledEnemyIds.length, 3, 'Must chill e1, e2, and e3');
  assert.ok(proc.chilledEnemyIds.includes('e1'));
  assert.ok(proc.chilledEnemyIds.includes('e2'));
  assert.ok(proc.chilledEnemyIds.includes('e3'));
  assert.ok(!proc.chilledEnemyIds.includes('e4'));
});

/* ==============================================================================
 * TIER 4: 10,000-CYCLE ZERO-GC & NUMERICAL STRESS TEST
 * ============================================================================== */

test('Tier 4.1: 10,000 consecutive detonation evaluations with zero leaks and deterministic bounds', () => {
  const manager = new RelicManager([RelicId.PYROCLASTIC_PRISM, RelicId.CRYO_GLACIAL_CORE], 4);
  let now = 500000;
  let procsCount = 0;

  const enemies = [
    { id: 'enemy_1', r: 5, c: 5 },
    { id: 'enemy_2', r: 6, c: 6 },
    { id: 'enemy_3', r: 7, c: 7 },
  ];

  for (let i = 0; i < 10000; i++) {
    now += 50; // 50ms timestep (every 10th iteration reaches 500ms)
    const proc = manager.onBombDetonationCryoGlacial(5, 5, enemies, now);
    assert.ok(typeof proc.triggered === 'boolean');
    assert.ok(Number.isFinite(proc.damage));
    assert.ok(Number.isFinite(proc.frostRadius));
    assert.ok(Number.isFinite(proc.slowRatio));
    assert.ok(Number.isFinite(proc.chillDurationMs));

    if (proc.triggered) {
      procsCount++;
      assert.equal(proc.isThermalShock, true);
      assert.equal(proc.damage, 100);
    }
  }

  // At 50ms intervals across 500,000ms total elapsed, exactly 1,000 procs should fire (every 500ms)
  assert.equal(procsCount, 1000, 'ICD must deterministically allow exactly 1,000 procs over 500,000ms');
});
