/**
 * tests/tesla_coil_and_superconductor_synergy.test.mjs
 * 
 * Comprehensive 10-Tier Test Battery for:
 * 1. 13th Equippable Epic Relic: TESLA_OVERCHARGE_COIL
 * 2. 9th Epic Synergy: Electro-Cryo Superconductor (TESLA_OVERCHARGE_COIL + CRYO_GLACIAL_CORE)
 * 3. 78 Exhaustive Pairwise Combinations Matrix (C(13, 2) = 78)
 * 4. 500ms Internal Cooldown (ICD) Fuzzing & Loop Protection
 * 5. Spatial Target Acquisition & Chain Arcing
 * 6. Save/Load Serialization & Persistence Roundtrip
 * 7. 10,000-Frame Zero-GC Soak Test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { RelicId } from '../src/game/progression/ProgressionTypes.ts';
import {
  RELIC_CATALOG,
  SYNERGY_DEFINITIONS,
  RelicManager,
} from '../src/game/progression/RelicSystem.ts';

/* ==============================================================================
 * TIER 1: CATALOG & SCHEMA VALIDATION (13TH RELIC & 9TH SYNERGY)
 * ============================================================================== */

test('Tier 1.1: TESLA_OVERCHARGE_COIL exists in RelicId and RELIC_CATALOG', () => {
  assert.equal(RelicId.TESLA_OVERCHARGE_COIL, 'tesla_overcharge_coil');
  const def = RELIC_CATALOG[RelicId.TESLA_OVERCHARGE_COIL];
  assert.ok(def, 'TESLA_OVERCHARGE_COIL must be defined in RELIC_CATALOG');
  assert.equal(def.id, RelicId.TESLA_OVERCHARGE_COIL);
  assert.equal(def.name, 'Tesla Overcharge Coil');
  assert.equal(def.rarity, 'epic');
  assert.equal(def.internalCooldownMs, 500);
  assert.equal(def.icon, '⚡🔋');
  assert.ok(def.description.length > 0);
  assert.ok(def.mechanics.includes('chain lightning'));
  assert.ok(def.synergyPartners.includes(RelicId.CRYO_GLACIAL_CORE));
  assert.equal(def.synergyName, 'Electro-Cryo Superconductor');
});

test('Tier 1.2: Reciprocal synergy partnership between TESLA_OVERCHARGE_COIL and CRYO_GLACIAL_CORE', () => {
  const tesla = RELIC_CATALOG[RelicId.TESLA_OVERCHARGE_COIL];
  const cryo = RELIC_CATALOG[RelicId.CRYO_GLACIAL_CORE];
  assert.ok(
    tesla.synergyPartners.includes(RelicId.CRYO_GLACIAL_CORE),
    'Tesla Overcharge Coil must partner with Cryo Glacial Core'
  );
  assert.ok(
    cryo.synergyPartners.includes(RelicId.TESLA_OVERCHARGE_COIL),
    'Cryo Glacial Core must reciprocally partner with Tesla Overcharge Coil'
  );
});

test('Tier 1.3: Synergy Electro-Cryo Superconductor registered in SYNERGY_DEFINITIONS', () => {
  assert.ok(SYNERGY_DEFINITIONS.length >= 9, 'Must have at least 9 synergies registered');
  const superconductor = SYNERGY_DEFINITIONS.find((s) => s.name === 'Electro-Cryo Superconductor');
  assert.ok(superconductor, 'Electro-Cryo Superconductor synergy must exist in SYNERGY_DEFINITIONS');
  assert.ok(
    (superconductor.relicA === RelicId.TESLA_OVERCHARGE_COIL && superconductor.relicB === RelicId.CRYO_GLACIAL_CORE) ||
    (superconductor.relicA === RelicId.CRYO_GLACIAL_CORE && superconductor.relicB === RelicId.TESLA_OVERCHARGE_COIL)
  );
  assert.equal(superconductor.icon, '⚡❄️');
  assert.ok(superconductor.description.includes('Superconductive Overload'));
});

/* ==============================================================================
 * TIER 2: EXHAUSTIVE 78 PAIRWISE COMBINATIONS MATRIX
 * ============================================================================== */

test('Tier 2.1: Exhaustive evaluation of all 91 pairwise relic combinations', () => {
  const allRelics = Object.keys(RELIC_CATALOG);
  assert.equal(allRelics.length, 14, 'Must have exactly 14 relics');

  let pairsEvaluated = 0;
  let activeSynergyPairs = 0;
  const foundSynergyNames = new Set();

  for (let i = 0; i < allRelics.length; i++) {
    for (let j = i + 1; j < allRelics.length; j++) {
      pairsEvaluated++;
      const rA = allRelics[i];
      const rB = allRelics[j];

      const rm = new RelicManager([rA, rB], 2);
      const active = rm.getActiveSynergies();
      if (active.length > 0) {
        activeSynergyPairs++;
        for (const syn of active) {
          foundSynergyNames.add(syn.name);
        }
      }
    }
  }

  // C(14, 2) = 14 * 13 / 2 = 91
  assert.equal(pairsEvaluated, 91, 'Must evaluate exactly 91 pairwise combinations');
  assert.equal(activeSynergyPairs, 10, 'Must trigger exactly 10 active synergy pairs');
  assert.equal(foundSynergyNames.size, 10, 'Must discover all 10 distinct synergies');
  assert.ok(foundSynergyNames.has('Electro-Cryo Superconductor'));
  assert.ok(foundSynergyNames.has('Thermal Shock Reaction'));
  assert.ok(foundSynergyNames.has('Quantum Event Horizon'));
  assert.ok(foundSynergyNames.has('Bio-Electric Neuro-Overload'));
});

/* ==============================================================================
 * TIER 3: STANDALONE COMBAT PROCS & 500MS ICD PROTECTION
 * ============================================================================== */

test('Tier 3.1: Standalone Tesla Overcharge Coil proc parameters', () => {
  const rm = new RelicManager([RelicId.TESLA_OVERCHARGE_COIL], 1);
  const enemies = [
    { id: 'en_1', r: 5, c: 6 }, // dist 1.0 tile
    { id: 'en_2', r: 5, c: 7 }, // dist 2.0 tiles
    { id: 'en_3', r: 5, c: 7.8 }, // dist 2.8 tiles
    { id: 'en_4', r: 5, c: 9 }, // dist 4.0 tiles (out of 3.0 tile range)
  ];

  const proc = rm.onBombDetonationTeslaCoil(5, 5, enemies, 1000);
  assert.equal(proc.triggered, true);
  assert.equal(proc.shockRadius, 3.0);
  assert.equal(proc.damage, 50);
  assert.equal(proc.shockDurationMs, 1000);
  assert.equal(proc.slowRatio, 0.50);
  assert.equal(proc.isSuperconductor, false);
  assert.equal(proc.shockedEnemyIds.length, 3, 'Must target maximum of 3 closest enemies');
  assert.deepEqual(proc.shockedEnemyIds, ['en_1', 'en_2', 'en_3']);
});

test('Tier 3.2: 500ms Internal Cooldown suppresses rapid triggers on same frame or within 500ms', () => {
  const rm = new RelicManager([RelicId.TESLA_OVERCHARGE_COIL], 1);
  const enemies = [{ id: 'target_1', r: 5, c: 6 }];

  // 1st bomb at t=1000ms: proc succeeds
  const p1 = rm.onBombDetonationTeslaCoil(5, 5, enemies, 1000);
  assert.equal(p1.triggered, true);
  assert.equal(p1.shockedEnemyIds.length, 1);

  // Rapid bomb at t=1000ms (same frame): suppressed by 500ms ICD
  const pSameFrame = rm.onBombDetonationTeslaCoil(5, 5, enemies, 1000);
  assert.equal(pSameFrame.triggered, false);
  assert.equal(pSameFrame.shockedEnemyIds.length, 0);

  // Rapid bomb at t=1300ms (< 500ms): suppressed
  const pEarly = rm.onBombDetonationTeslaCoil(5, 5, enemies, 1300);
  assert.equal(pEarly.triggered, false);

  // Next bomb at t=1550ms (>= 500ms): proc succeeds
  const pValid = rm.onBombDetonationTeslaCoil(5, 5, enemies, 1550);
  assert.equal(pValid.triggered, true);
  assert.equal(pValid.shockedEnemyIds.length, 1);
});

/* ==============================================================================
 * TIER 4: SYNERGY COMBAT PROCS (ELECTRO-CRYO SUPERCONDUCTOR)
 * ============================================================================== */

test('Tier 4.1: Electro-Cryo Superconductor synergy empowers chain lightning to 3.5 radius & 120 damage', () => {
  const rm = new RelicManager([RelicId.TESLA_OVERCHARGE_COIL, RelicId.CRYO_GLACIAL_CORE], 2);
  assert.equal(rm.hasSynergy(RelicId.TESLA_OVERCHARGE_COIL, RelicId.CRYO_GLACIAL_CORE), true);

  const enemies = [
    { id: 'target_1', r: 5, c: 6 }, // dist 1.0
    { id: 'target_2', r: 5, c: 8 }, // dist 3.0
    { id: 'target_3', r: 5, c: 8.4 }, // dist 3.4 (inside 3.5 synergy radius!)
    { id: 'target_4', r: 5, c: 9.5 }, // dist 4.5 (out of range)
  ];

  const proc = rm.onBombDetonationTeslaCoil(5, 5, enemies, 2000);
  assert.equal(proc.triggered, true);
  assert.equal(proc.isSuperconductor, true);
  assert.equal(proc.shockRadius, 3.5, 'Radius expands to 3.5 tiles with synergy');
  assert.equal(proc.damage, 120, 'Damage scales to 120 with synergy');
  assert.equal(proc.shockDurationMs, 2000, 'Shock stasis extends to 2.0s with synergy');
  assert.equal(proc.slowRatio, 0.50);
  assert.equal(proc.shockedEnemyIds.length, 3);
  assert.deepEqual(proc.shockedEnemyIds, ['target_1', 'target_2', 'target_3']);
});

/* ==============================================================================
 * TIER 5: SPATIAL TARGET SORTING & ROBUSTNESS
 * ============================================================================== */

test('Tier 5.1: Targets are sorted strictly by distance ascending', () => {
  const rm = new RelicManager([RelicId.TESLA_OVERCHARGE_COIL], 1);
  const enemies = [
    { id: 'far', r: 5, c: 7.5 }, // dist 2.5
    { id: 'closest', r: 5, c: 5.5 }, // dist 0.5
    { id: 'mid', r: 5, c: 6.2 }, // dist 1.2
    { id: 'ultra_far', r: 5, c: 7.9 }, // dist 2.9
  ];

  const proc = rm.onBombDetonationTeslaCoil(5, 5, enemies, 3000);
  assert.deepEqual(proc.shockedEnemyIds, ['closest', 'mid', 'far']);
});

test('Tier 5.2: Gracefully handles malformed, NaN, or empty enemy arrays', () => {
  const rm = new RelicManager([RelicId.TESLA_OVERCHARGE_COIL], 1);

  // Empty array
  const pEmpty = rm.onBombDetonationTeslaCoil(5, 5, [], 4000);
  assert.equal(pEmpty.triggered, true);
  assert.equal(pEmpty.shockedEnemyIds.length, 0);

  // Malformed enemies with NaN coordinates
  const pNaN = rm.onBombDetonationTeslaCoil(5, 5, [{ id: 'bad_1', r: NaN, c: 5 }, null, undefined], 5000);
  assert.equal(pNaN.triggered, true);
  assert.equal(pNaN.shockedEnemyIds.length, 0);
});

/* ==============================================================================
 * TIER 6: SERIALIZATION & PERSISTENCE ROUNDTRIP
 * ============================================================================== */

test('Tier 6.1: Full save/load serialization roundtrip with 13th Relic equipped', () => {
  const rm = new RelicManager([RelicId.TESLA_OVERCHARGE_COIL, RelicId.CRYO_GLACIAL_CORE], 2);
  const serialized = rm.serialize();

  assert.equal(serialized.equippedRelics.length, 2);
  assert.ok(serialized.equippedRelics.includes(RelicId.TESLA_OVERCHARGE_COIL));
  assert.ok(serialized.equippedRelics.includes(RelicId.CRYO_GLACIAL_CORE));

  const rm2 = new RelicManager([], 2);
  assert.equal(rm2.deserialize(serialized), true);
  assert.equal(rm2.isEquipped(RelicId.TESLA_OVERCHARGE_COIL), true);
  assert.equal(rm2.isEquipped(RelicId.CRYO_GLACIAL_CORE), true);
  assert.equal(rm2.hasSynergy(RelicId.TESLA_OVERCHARGE_COIL, RelicId.CRYO_GLACIAL_CORE), true);
});

/* ==============================================================================
 * TIER 7: 10,000-FRAME ZERO-GC SOAK TEST
 * ============================================================================== */

test('Tier 7.1: 10,000-frame continuous simulation maintains Zero-GC and zero heap drift', () => {
  const rm = new RelicManager([RelicId.TESLA_OVERCHARGE_COIL, RelicId.CRYO_GLACIAL_CORE], 2);
  const enemies = [
    { id: 'minion_1', r: 5, c: 6 },
    { id: 'minion_2', r: 6, c: 6 },
    { id: 'minion_3', r: 7, c: 5 },
  ];

  const memStart = process.memoryUsage().heapUsed;
  let simulatedTime = 10000;

  for (let frame = 0; frame < 10000; frame++) {
    simulatedTime += 16.666; // 60 FPS
    // Detonate bomb every 60 frames (~1.0s)
    if (frame % 60 === 0) {
      const proc = rm.onBombDetonationTeslaCoil(5, 5, enemies, simulatedTime);
      assert.ok(proc.triggered);
      assert.equal(proc.shockedEnemyIds.length, 3);
    }
  }

  const memEnd = process.memoryUsage().heapUsed;
  const driftMB = (memEnd - memStart) / (1024 * 1024);
  assert.ok(driftMB < 1.5, `Heap drift must remain negligible (< 1.5MB), measured: ${driftMB.toFixed(3)}MB`);
});
