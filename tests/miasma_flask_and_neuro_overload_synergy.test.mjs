/**
 * tests/miasma_flask_and_neuro_overload_synergy.test.mjs
 *
 * Comprehensive 10-Tier Test Battery for:
 * 1. 14th Equippable Epic Relic: CORROSIVE_MIASMIC_FLASK ('corrosive_miasmic_flask')
 * 2. 10th Epic Synergy: 'Bio-Electric Neuro-Overload' (CORROSIVE_MIASMIC_FLASK + TESLA_OVERCHARGE_COIL)
 * 3. 91 Exhaustive Pairwise Combinations Matrix (C(14, 2) = 91)
 * 4. 500ms Internal Cooldown (ICD) Fuzzing & Loop Protection
 * 5. Standalone Corrosive Acid Burst, 35% Slow & Status Tracking
 * 6. Empowered 10th Synergy: 130 Burst Damage, 3.5-Tile Range, 50% Slow & 2.0s EMP Stun
 * 7. Spatial Euclidean Distance Sorting & Multi-Target Acquisition
 * 8. Malformed Payload, Non-Finite & NaN Coordinate Defenses
 * 9. Save/Load Serialization & State Preservation Roundtrip
 * 10. 10,000-Frame Zero-GC Soak Test (< 1.5MB Heap Drift with GC, < 5.0MB Ambient)
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
 * TIER 1: CATALOG & SCHEMA VALIDATION (14TH RELIC & 10TH SYNERGY)
 * ============================================================================== */

test('Tier 1.1: CORROSIVE_MIASMIC_FLASK exists in RelicId and RELIC_CATALOG', () => {
  assert.equal(RelicId.CORROSIVE_MIASMIC_FLASK, 'corrosive_miasmic_flask');
  const def = RELIC_CATALOG[RelicId.CORROSIVE_MIASMIC_FLASK];
  assert.ok(def, 'CORROSIVE_MIASMIC_FLASK must be defined in RELIC_CATALOG');
  assert.equal(def.id, RelicId.CORROSIVE_MIASMIC_FLASK);
  assert.equal(def.name, 'Corrosive Miasmic Flask');
  assert.equal(def.rarity, 'epic');
  assert.equal(def.internalCooldownMs, 500);
  assert.equal(def.icon, '🧪☣️');
  assert.ok(def.description.length > 0);
  assert.ok(def.mechanics.includes('neurotoxic miasma cloud'));
  assert.ok(def.synergyPartners.includes(RelicId.TESLA_OVERCHARGE_COIL));
  assert.equal(def.synergyName, 'Bio-Electric Neuro-Overload');
});

test('Tier 1.2: Reciprocal synergy partnership between CORROSIVE_MIASMIC_FLASK and TESLA_OVERCHARGE_COIL', () => {
  const miasma = RELIC_CATALOG[RelicId.CORROSIVE_MIASMIC_FLASK];
  const tesla = RELIC_CATALOG[RelicId.TESLA_OVERCHARGE_COIL];
  assert.ok(
    miasma.synergyPartners.includes(RelicId.TESLA_OVERCHARGE_COIL),
    'Corrosive Miasmic Flask must partner with Tesla Overcharge Coil'
  );
  assert.ok(
    tesla.synergyPartners.includes(RelicId.CORROSIVE_MIASMIC_FLASK),
    'Tesla Overcharge Coil must reciprocally partner with Corrosive Miasmic Flask'
  );
});

test('Tier 1.3: 10th Synergy Bio-Electric Neuro-Overload registered in SYNERGY_DEFINITIONS', () => {
  assert.ok(SYNERGY_DEFINITIONS.length >= 10, 'Must have at least 10 synergies registered');
  const neuroOverload = SYNERGY_DEFINITIONS.find((s) => s.name === 'Bio-Electric Neuro-Overload');
  assert.ok(neuroOverload, 'Bio-Electric Neuro-Overload synergy must exist in SYNERGY_DEFINITIONS');
  assert.ok(
    (neuroOverload.relicA === RelicId.TESLA_OVERCHARGE_COIL && neuroOverload.relicB === RelicId.CORROSIVE_MIASMIC_FLASK) ||
    (neuroOverload.relicA === RelicId.CORROSIVE_MIASMIC_FLASK && neuroOverload.relicB === RelicId.TESLA_OVERCHARGE_COIL)
  );
  assert.equal(neuroOverload.icon, '⚡☣️');
  assert.ok(neuroOverload.description.includes('bio-electric storm'));
});

/* ==============================================================================
 * TIER 2: EXHAUSTIVE 105 PAIRWISE COMBINATIONS MATRIX (C(15, 2) = 105)
 * ============================================================================== */

test('Tier 2.1: Exhaustive evaluation of all 105 pairwise relic combinations', () => {
  const allRelics = Object.keys(RELIC_CATALOG);
  assert.equal(allRelics.length, 15, 'Must have exactly 15 relics');

  let pairsEvaluated = 0;
  let activeSynergyPairs = 0;
  const foundSynergyNames = new Set();

  for (let i = 0; i < allRelics.length; i++) {
    for (let j = i + 1; j < allRelics.length; j++) {
      pairsEvaluated++;
      const rA = allRelics[i];
      const rB = allRelics[j];

      // Test symmetry: [rA, rB] vs [rB, rA]
      const rmAB = new RelicManager([rA, rB], 2);
      const rmBA = new RelicManager([rB, rA], 2);

      const activeAB = rmAB.getActiveSynergies();
      const activeBA = rmBA.getActiveSynergies();

      assert.equal(activeAB.length, activeBA.length, `Synergy symmetry mismatch for pair (${rA}, ${rB})`);
      assert.equal(rmAB.hasSynergy(rA, rB), rmBA.hasSynergy(rB, rA));

      if (activeAB.length > 0) {
        activeSynergyPairs++;
        for (const syn of activeAB) {
          foundSynergyNames.add(syn.name);
        }
      }
    }
  }

  // C(15, 2) = 15 * 14 / 2 = 105
  assert.equal(pairsEvaluated, 105, 'Must evaluate exactly 105 pairwise combinations');
  assert.equal(activeSynergyPairs, 11, 'Must trigger exactly 11 active synergy pairs');
  assert.equal(foundSynergyNames.size, 11, 'Must discover all 11 distinct synergies');
  assert.ok(foundSynergyNames.has('Hadal Brine Maelstrom'));
  assert.ok(foundSynergyNames.has('Bio-Electric Neuro-Overload'));
  assert.ok(foundSynergyNames.has('Electro-Cryo Superconductor'));
  assert.ok(foundSynergyNames.has('Thermal Shock Reaction'));
  assert.ok(foundSynergyNames.has('Quantum Event Horizon'));
  assert.ok(foundSynergyNames.has('Precognitive Resonance'));
  assert.ok(foundSynergyNames.has('Orbital Ion Strike'));
  assert.ok(foundSynergyNames.has('Chrono Attraction'));
  assert.ok(foundSynergyNames.has('Cosmic Supernova'));
  assert.ok(foundSynergyNames.has('Kinetic Pinball'));
  assert.ok(foundSynergyNames.has('Radiant Leech'));
});

/* ==============================================================================
 * TIER 3: STANDALONE COMBAT PROCS & BASE ATTRIBUTES
 * ============================================================================== */

test('Tier 3.1: Standalone Corrosive Miasmic Flask proc applies 45 damage, 35% slow within 2.5 tiles', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK], 1);
  const enemies = [
    { id: 'en_near', r: 5, c: 6 },     // dist 1.0 tile -> within 2.5
    { id: 'en_mid', r: 5, c: 7.2 },    // dist 2.2 tiles -> within 2.5
    { id: 'en_edge', r: 5, c: 7.5 },   // dist 2.5 tiles -> on boundary
    { id: 'en_far', r: 5, c: 8.5 },    // dist 3.5 tiles -> OUTSIDE 2.5
  ];

  const proc = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 1000);
  assert.equal(proc.triggered, true);
  assert.equal(proc.cloudRadius, 2.5);
  assert.equal(proc.damage, 45);
  assert.equal(proc.poisonDurationMs, 2000);
  assert.equal(proc.slowRatio, 0.35);
  assert.equal(proc.isNeuroOverload, false);
  assert.equal(proc.poisonedEnemyIds.length, 3);
  assert.deepEqual(proc.poisonedEnemyIds, ['en_near', 'en_mid', 'en_edge']);
});

test('Tier 3.2: Unequipped relic produces clean inert result', () => {
  const rm = new RelicManager([RelicId.SOLAR_CAPACITOR], 1);
  const proc = rm.onBombDetonationMiasmicFlask(5, 5, [{ id: 'e1', r: 5, c: 6 }], 2000);
  assert.equal(proc.triggered, false);
  assert.equal(proc.poisonedEnemyIds.length, 0);
  assert.equal(proc.cloudRadius, 0);
});

/* ==============================================================================
 * TIER 4: 500MS INTERNAL COOLDOWN (ICD) & CLOCK SKEW PROTECTION
 * ============================================================================== */

test('Tier 4.1: 500ms Internal Cooldown suppresses spam, same-frame triggers and clock skew', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK], 1);
  const enemies = [{ id: 'target_1', r: 5, c: 6 }];

  // 1st bomb at t=1000ms: proc succeeds
  const p1 = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 1000);
  assert.equal(p1.triggered, true);
  assert.equal(p1.poisonedEnemyIds.length, 1);

  // Same-frame detonation at t=1000ms: suppressed
  const pSameFrame = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 1000);
  assert.equal(pSameFrame.triggered, false);
  assert.equal(pSameFrame.poisonedEnemyIds.length, 0);

  // Rapid detonation at t=1300ms (< 500ms): suppressed
  const pEarly = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 1300);
  assert.equal(pEarly.triggered, false);

  // Backward clock skew / non-monotonic timestamp at t=900ms: suppressed safely
  const pBackward = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 900);
  assert.equal(pBackward.triggered, false);

  // Detonate at t=1550ms (>= 500ms): proc succeeds
  const pValid = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 1550);
  assert.equal(pValid.triggered, true);
  assert.equal(pValid.poisonedEnemyIds.length, 1);
});

/* ==============================================================================
 * TIER 5: 10TH SYNERGY (BIO-ELECTRIC NEURO-OVERLOAD) EMPOWERED MECHANICS
 * ============================================================================== */

test('Tier 5.1: Bio-Electric Neuro-Overload empowers radius to 3.5, damage to 130, targets to 4 and slow to 50%', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK, RelicId.TESLA_OVERCHARGE_COIL], 2);
  assert.equal(rm.hasSynergy(RelicId.CORROSIVE_MIASMIC_FLASK, RelicId.TESLA_OVERCHARGE_COIL), true);

  const enemies = [
    { id: 'target_1', r: 5, c: 6 },     // dist 1.0
    { id: 'target_2', r: 5, c: 7.2 },   // dist 2.2
    { id: 'target_3', r: 5, c: 7.8 },   // dist 2.8 (inside 3.5 synergy radius!)
    { id: 'target_4', r: 5, c: 8.4 },   // dist 3.4 (inside 3.5 synergy radius!)
    { id: 'target_5', r: 5, c: 9.0 },   // dist 4.0 (outside 3.5)
  ];

  const proc = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 20000);
  assert.equal(proc.triggered, true);
  assert.equal(proc.isNeuroOverload, true);
  assert.equal(proc.cloudRadius, 3.5);
  assert.equal(proc.damage, 130);
  assert.equal(proc.poisonDurationMs, 3000);
  assert.equal(proc.slowRatio, 0.50);
  // Captures up to 4 closest targets within 3.5
  assert.equal(proc.poisonedEnemyIds.length, 4);
  assert.deepEqual(proc.poisonedEnemyIds, ['target_1', 'target_2', 'target_3', 'target_4']);
});

/* ==============================================================================
 * TIER 6: SPATIAL TARGET SORTING & CLUSTERING RESOLUTION
 * ============================================================================== */

test('Tier 6.1: Affected enemies are strictly sorted by Euclidean distance ascending', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK], 1);
  const enemies = [
    { id: 'far', r: 5, c: 7.2 },     // dist 2.2
    { id: 'closest', r: 5, c: 5.3 }, // dist 0.3
    { id: 'mid', r: 5, c: 6.1 },     // dist 1.1
  ];

  const proc = rm.onBombDetonationMiasmicFlask(5, 5, enemies, 40000);
  assert.deepEqual(proc.poisonedEnemyIds, ['closest', 'mid', 'far']);
});

/* ==============================================================================
 * TIER 7: DEFENSIVE INPUT SANITIZATION & MALFORMED PAYLOAD RESILIENCE
 * ============================================================================== */

test('Tier 7.1: Gracefully handles empty, null, or corrupted enemy arrays', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK], 1);

  // Empty array
  const pEmpty = rm.onBombDetonationMiasmicFlask(5, 5, [], 60000);
  assert.equal(pEmpty.triggered, true);
  assert.equal(pEmpty.poisonedEnemyIds.length, 0);

  // Array with null, undefined, and NaN entries
  const pCorrupt = rm.onBombDetonationMiasmicFlask(
    5,
    5,
    [null, undefined, { id: 'bad_nan', r: NaN, c: 5 }, { id: 'missing_coords' }],
    61000
  );
  assert.equal(pCorrupt.triggered, true);
  assert.equal(pCorrupt.poisonedEnemyIds.length, 0);
});

test('Tier 7.2: Gracefully handles non-finite coordinates for bomb epicenter', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK], 1);
  const enemies = [{ id: 'e1', r: 5, c: 6 }];

  const pNaN = rm.onBombDetonationMiasmicFlask(NaN, 5, enemies, 70000);
  assert.equal(pNaN.triggered, false);
  assert.equal(pNaN.poisonedEnemyIds.length, 0);

  const pInf = rm.onBombDetonationMiasmicFlask(Infinity, 5, enemies, 71000);
  assert.equal(pInf.triggered, false);
});

/* ==============================================================================
 * TIER 8: SAVE / LOAD SERIALIZATION & STATE ROUNDTRIP
 * ============================================================================== */

test('Tier 8.1: Full save/load serialization roundtrip with 14th Relic equipped', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK, RelicId.TESLA_OVERCHARGE_COIL], 2);
  const serialized = rm.serialize();

  assert.equal(serialized.equippedRelics.length, 2);
  assert.ok(serialized.equippedRelics.includes(RelicId.CORROSIVE_MIASMIC_FLASK));
  assert.ok(serialized.equippedRelics.includes(RelicId.TESLA_OVERCHARGE_COIL));

  const rm2 = new RelicManager([], 2);
  assert.equal(rm2.deserialize(serialized), true);
  assert.equal(rm2.isEquipped(RelicId.CORROSIVE_MIASMIC_FLASK), true);
  assert.equal(rm2.isEquipped(RelicId.TESLA_OVERCHARGE_COIL), true);
  assert.equal(rm2.hasSynergy(RelicId.CORROSIVE_MIASMIC_FLASK, RelicId.TESLA_OVERCHARGE_COIL), true);
});

test('Tier 8.2: Deserializing legacy save payload without CORROSIVE_MIASMIC_FLASK does not fail', () => {
  const legacyData = {
    equippedRelics: ['pocket_chronometer', 'gelatinous_core'],
    discoveredRelics: ['pocket_chronometer', 'gelatinous_core'],
    maxSlots: 2,
    vampiricKillStreak: 0,
    solarChargeElapsedMs: 0,
    hasSolarShield: false,
  };

  const rm = new RelicManager([], 2);
  assert.equal(rm.deserialize(legacyData), true);
  assert.equal(rm.isEquipped(RelicId.CORROSIVE_MIASMIC_FLASK), false);
  assert.equal(rm.isEquipped(RelicId.POCKET_CHRONOMETER), true);
});

/* ==============================================================================
 * TIER 9: ROLL RELIC DROP DETERMINISM
 * ============================================================================== */

test('Tier 9.1: rollRelicDrop includes CORROSIVE_MIASMIC_FLASK in random pool', () => {
  const perkBonuses = { relicDropChanceBonus: 1.0 }; // 100% drop
  const discovered = new Set();

  for (let seed = 0; seed < 1000; seed++) {
    const relic = RelicManager.rollRelicDrop(true, false, perkBonuses, seed);
    if (relic) discovered.add(relic);
  }

  assert.ok(discovered.has(RelicId.CORROSIVE_MIASMIC_FLASK));
  assert.ok(discovered.has(RelicId.ABYSSAL_MAELSTROM_PEARL));
  assert.equal(discovered.size, 15, 'All 15 relics must be rollable from drops');
});

/* ==============================================================================
 * TIER 10: 10,000-FRAME ZERO-GC SOAK TEST
 * ============================================================================== */

test('Tier 10.1: 10,000-frame continuous simulation maintains Zero-GC and zero heap drift', () => {
  const rm = new RelicManager([RelicId.CORROSIVE_MIASMIC_FLASK, RelicId.TESLA_OVERCHARGE_COIL], 2);
  const enemies = [
    { id: 'minion_1', r: 5, c: 6 },
    { id: 'minion_2', r: 6, c: 6 },
    { id: 'minion_3', r: 7, c: 5 },
    { id: 'minion_4', r: 6, c: 7 },
  ];

  if (global.gc) global.gc();
  const memStart = process.memoryUsage().heapUsed;
  let simulatedTime = 100000;

  for (let frame = 0; frame < 10000; frame++) {
    simulatedTime += 16.666; // 60 FPS
    if (frame % 60 === 0) {
      const proc = rm.onBombDetonationMiasmicFlask(5, 5, enemies, simulatedTime);
      assert.ok(proc.triggered);
      assert.equal(proc.poisonedEnemyIds.length, 4);
    }
  }

  if (global.gc) global.gc();
  const memEnd = process.memoryUsage().heapUsed;
  const driftMB = (memEnd - memStart) / (1024 * 1024);

  if (global.gc) {
    assert.ok(driftMB < 1.5, `Heap drift must remain negligible (< 1.5MB), measured: ${driftMB.toFixed(3)}MB`);
  } else {
    assert.ok(driftMB < 5.0, `Heap drift under ambient GC must remain bounded (< 5.0MB), measured: ${driftMB.toFixed(3)}MB`);
  }
});
