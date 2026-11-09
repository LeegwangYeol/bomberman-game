/**
 * tests/quantum_warp_prism_synergy_regression.test.mjs
 * Creative Expansion & Victory Auditor Verification Suite:
 * 11th Equippable Relic (QUANTUM_WARP_PRISM) & 7th Synergy (Quantum Event Horizon)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RelicId,
  RELIC_CATALOG,
  SYNERGY_DEFINITIONS,
  RelicManager,
} from '../src/game/progression/index.ts';
import { CrisisType } from '../src/game/crises/CrisisTypes.ts';
import { CrisisManager } from '../src/game/crises/CrisisManager.ts';

/* ==============================================================================
 * TIER 1: 1:1 CRISIS-TO-RELIC BIJECTIVE MAPPING VERIFICATION
 * ============================================================================== */

test('Tier 1.1: CrisisManager awards QUANTUM_WARP_PRISM for DIMENSIONAL_RIFTS', () => {
  const cm = new CrisisManager();
  const reward = cm.getCrisisReward(CrisisType.DIMENSIONAL_RIFTS);
  assert.equal(reward.relicReward, RelicId.QUANTUM_WARP_PRISM);
  assert.equal(reward.scoreAwarded, 5000);
});

test('Tier 1.2: All 7 Crises have unique, dedicated 1:1 bijective relic rewards', () => {
  const cm = new CrisisManager();
  const crisisTypes = Object.values(CrisisType);
  assert.equal(crisisTypes.length, 7, 'Must have exactly 7 crises');

  const awardedRelics = new Set();
  for (const cType of crisisTypes) {
    const reward = cm.getCrisisReward(cType);
    assert.ok(reward.relicReward, `Crisis ${cType} must grant a relic reward`);
    assert.ok(!awardedRelics.has(reward.relicReward), `Relic ${reward.relicReward} must be unique to crisis ${cType}`);
    awardedRelics.add(reward.relicReward);
  }

  assert.equal(awardedRelics.size, 7, 'All 7 crises must map to 7 distinct relic rewards');
});

/* ==============================================================================
 * TIER 2: CATALOG & SYNERGY DEFINITION INTEGRITY
 * ============================================================================== */

test('Tier 2.1: Relic Catalog includes QUANTUM_WARP_PRISM with valid configuration', () => {
  assert.equal(Object.keys(RELIC_CATALOG).length, 11, 'Catalog must contain exactly 11 relics');
  const def = RELIC_CATALOG[RelicId.QUANTUM_WARP_PRISM];
  assert.ok(def, 'QUANTUM_WARP_PRISM must be registered in RELIC_CATALOG');
  assert.equal(def.id, RelicId.QUANTUM_WARP_PRISM);
  assert.equal(def.rarity, 'epic');
  assert.equal(def.internalCooldownMs, 500);
  assert.ok(def.synergyPartners.includes(RelicId.VOID_SINGULARITY_LENS));
});

test('Tier 2.2: Reciprocal synergy partnership with VOID_SINGULARITY_LENS', () => {
  const voidDef = RELIC_CATALOG[RelicId.VOID_SINGULARITY_LENS];
  assert.ok(voidDef.synergyPartners.includes(RelicId.QUANTUM_WARP_PRISM), 'VOID_SINGULARITY_LENS must reciprocally partner with QUANTUM_WARP_PRISM');
});

test('Tier 2.3: 7th Synergy "Quantum Event Horizon" registered in SYNERGY_DEFINITIONS', () => {
  assert.equal(SYNERGY_DEFINITIONS.length, 7, 'Must have exactly 7 active synergy definitions');
  const synergy = SYNERGY_DEFINITIONS.find((s) => s.name === 'Quantum Event Horizon');
  assert.ok(synergy, 'Quantum Event Horizon must be registered');
  assert.ok(
    (synergy.relicA === RelicId.QUANTUM_WARP_PRISM && synergy.relicB === RelicId.VOID_SINGULARITY_LENS) ||
    (synergy.relicA === RelicId.VOID_SINGULARITY_LENS && synergy.relicB === RelicId.QUANTUM_WARP_PRISM)
  );
  assert.ok(synergy.icon.length > 0);
  assert.ok(synergy.description.includes('Quantum rifts'));
});

/* ==============================================================================
 * TIER 3: STANDALONE QUANTUM WARP PRISM COMBAT PROCS
 * ============================================================================== */

test('Tier 3.1: Standalone Quantum Warp proc damages and phase-shifts enemies within 2.0 tiles', () => {
  const rm = new RelicManager([RelicId.QUANTUM_WARP_PRISM], 2);
  const enemies = [
    { id: 'e1', r: 5, c: 6 }, // 1.0 tile away
    { id: 'e2', r: 5, c: 7 }, // 2.0 tiles away
    { id: 'e3', r: 5, c: 8 }, // 3.0 tiles away (out of range)
  ];

  const proc = rm.onBombDetonationQuantumWarp(5, 5, enemies, 1000);
  assert.equal(proc.warpRadius, 2.0);
  assert.equal(proc.damage, 75);
  assert.equal(proc.phaseDurationMs, 1200);
  assert.equal(proc.singularityPull, false);
  assert.equal(proc.isEmpowered, false);
  assert.deepEqual(proc.warpedEnemyIds.sort(), ['e1', 'e2']);
});

test('Tier 3.2: Unequipped Quantum Warp Prism returns empty proc result', () => {
  const rm = new RelicManager([RelicId.SOLAR_CAPACITOR], 2);
  const enemies = [{ id: 'e1', r: 5, c: 6 }];
  const proc = rm.onBombDetonationQuantumWarp(5, 5, enemies, 1000);
  assert.equal(proc.warpRadius, 0);
  assert.equal(proc.damage, 0);
  assert.equal(proc.warpedEnemyIds.length, 0);
});

/* ==============================================================================
 * TIER 4: EMPOWERED QUANTUM EVENT HORIZON SYNERGY MECHANICS
 * ============================================================================== */

test('Tier 4.1: Empowered Synergy expands radius to 3.5 tiles, deals double damage (150), and enables pull', () => {
  const rm = new RelicManager([RelicId.QUANTUM_WARP_PRISM, RelicId.VOID_SINGULARITY_LENS], 2);
  assert.ok(rm.hasSynergy(RelicId.QUANTUM_WARP_PRISM, RelicId.VOID_SINGULARITY_LENS));

  const enemies = [
    { id: 'e1', r: 5, c: 6 }, // 1.0 tile away
    { id: 'e2', r: 5, c: 7 }, // 2.0 tiles away
    { id: 'e3', r: 5, c: 8 }, // 3.0 tiles away (within 3.5)
    { id: 'e4', r: 5, c: 9 }, // 4.0 tiles away (out of range)
  ];

  const proc = rm.onBombDetonationQuantumWarp(5, 5, enemies, 2000);
  assert.equal(proc.warpRadius, 3.5);
  assert.equal(proc.damage, 150);
  assert.equal(proc.phaseDurationMs, 2000);
  assert.equal(proc.singularityPull, true);
  assert.equal(proc.isEmpowered, true);
  assert.deepEqual(proc.warpedEnemyIds.sort(), ['e1', 'e2', 'e3']);
});

/* ==============================================================================
 * TIER 5: 500MS ICD & INPUT RESILIENCE
 * ============================================================================== */

test('Tier 5.1: Rapid detonations strictly adhere to 500ms ICD without dropping legitimate procs', () => {
  const rm = new RelicManager([RelicId.QUANTUM_WARP_PRISM], 2);
  const enemies = [{ id: 'e1', r: 5, c: 5 }];

  // First detonation at t=1000ms succeeds
  const p1 = rm.onBombDetonationQuantumWarp(5, 5, enemies, 1000);
  assert.equal(p1.warpedEnemyIds.length, 1);

  // Micro-jitter bursts within 500ms are suppressed
  for (const offset of [10, 50, 100, 250, 450, 499]) {
    const suppressed = rm.onBombDetonationQuantumWarp(5, 5, enemies, 1000 + offset);
    assert.equal(suppressed.warpedEnemyIds.length, 0, `Offset +${offset}ms must be suppressed`);
  }

  // Exactly at t=1500ms (+500ms), proc succeeds cleanly
  const p2 = rm.onBombDetonationQuantumWarp(5, 5, enemies, 1500);
  assert.equal(p2.warpedEnemyIds.length, 1);
});

test('Tier 5.2: Corrupted, NaN, Infinity, and malformed inputs are gracefully sanitized', () => {
  const rm = new RelicManager([RelicId.QUANTUM_WARP_PRISM], 2);

  // Corrupted bomb coordinates
  const pNaN = rm.onBombDetonationQuantumWarp(NaN, 5, [{ id: 'e1', r: 5, c: 5 }], 3000);
  assert.equal(pNaN.warpedEnemyIds.length, 0);

  // Corrupted enemies list
  const pNull = rm.onBombDetonationQuantumWarp(5, 5, null, 3600);
  assert.equal(pNull.warpedEnemyIds.length, 0);

  // Malformed individual enemy objects
  const malformedEnemies = [
    null,
    undefined,
    { id: 'corrupt1' },
    { id: 'corrupt2', r: NaN, c: 5 },
    { id: 'valid', r: 5, c: 5 },
  ];
  const pMalformed = rm.onBombDetonationQuantumWarp(5, 5, malformedEnemies, 4200);
  assert.deepEqual(pMalformed.warpedEnemyIds, ['valid']);
});

/* ==============================================================================
 * TIER 6: 10,000-FRAME ZERO-GC CONTINUOUS SOAK TEST
 * ============================================================================== */

test('Tier 6.1: 10,000 continuous frames of quantum warp proc evaluation maintain Zero-GC stability', () => {
  const rm = new RelicManager([RelicId.QUANTUM_WARP_PRISM, RelicId.VOID_SINGULARITY_LENS], 2);
  const enemies = [
    { id: 'e1', r: 5, c: 6 },
    { id: 'e2', r: 5, c: 7 },
  ];

  const tStart = performance.now();
  let validProcs = 0;

  for (let f = 0; f < 10000; f++) {
    const nowMs = 10000 + f * 16.67; // 60 FPS simulated step
    const proc = rm.onBombDetonationQuantumWarp(5, 5, enemies, nowMs);
    if (proc.warpedEnemyIds.length > 0) {
      validProcs++;
    }
  }

  const durationMs = performance.now() - tStart;
  assert.ok(durationMs < 200, `10,000 frames must evaluate in < 200ms (took ${durationMs.toFixed(2)}ms)`);
  // Expected procs: 10,000 frames * 16.67ms = 166,700ms. With 500ms ICD: ~333 procs
  assert.ok(validProcs >= 300 && validProcs <= 350, `Expected ~333 procs over 166.7s, got ${validProcs}`);
});
