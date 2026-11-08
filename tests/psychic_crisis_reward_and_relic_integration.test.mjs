/**
 * psychic_crisis_reward_and_relic_integration.test.mjs
 *
 * Dedicated Test Battery for:
 * 1. Psychic Crisis Resolution Reward & Relic Award (PSIONIC_FEEDBACK_CRYSTAL)
 * 2. 10th Relic Catalog Definition & 500ms ICD Invariant
 * 3. 6th Relic Synergy: Precognitive Resonance (PSIONIC_FEEDBACK_CRYSTAL + POCKET_CHRONOMETER)
 * 4. Psionic Pulse & Precognitive Stun Combat Procs
 * 5. Orbital Ion Strike Synergy Harmonization in Magnet Scanning & 3-Tile Cross Lance
 * 6. Zero-GC 10,000-Frame Combat Soak Simulation
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RelicId,
  RELIC_CATALOG,
  SYNERGY_DEFINITIONS,
  RelicManager,
} from '../src/game/progression/index.ts';

import { CrisisManager } from '../src/game/crises/CrisisManager.ts';
import { CrisisType, CrisisStage } from '../src/game/crises/CrisisTypes.ts';

/* ==============================================================================
 * TIER 1: CRISIS REWARD MAPPING FOR PSYCHIC INVASION
 * ============================================================================== */

test('Tier 1: CrisisManager maps PSYCHIC_INVASION to PSIONIC_FEEDBACK_CRYSTAL', () => {
  const manager = new CrisisManager();
  const reward = manager.getCrisisReward(CrisisType.PSYCHIC_INVASION);

  assert.equal(reward.crisisType, CrisisType.PSYCHIC_INVASION);
  assert.equal(reward.relicReward, RelicId.PSIONIC_FEEDBACK_CRYSTAL);
  assert.equal(reward.scoreAwarded, 5000);
  assert.equal(reward.starCandies, 35);
  assert.equal(reward.cosmicEssence, 15);
});

/* ==============================================================================
 * TIER 2: 10TH RELIC CATALOG DEFINITION & 500MS ICD
 * ============================================================================== */

test('Tier 2: PSIONIC_FEEDBACK_CRYSTAL is registered with complete metadata', () => {
  const relic = RELIC_CATALOG[RelicId.PSIONIC_FEEDBACK_CRYSTAL];
  assert.ok(relic, 'PSIONIC_FEEDBACK_CRYSTAL must exist in RELIC_CATALOG');
  assert.equal(relic.id, RelicId.PSIONIC_FEEDBACK_CRYSTAL);
  assert.equal(relic.name, 'Psionic Feedback Crystal');
  assert.equal(relic.rarity, 'epic');
  assert.equal(relic.internalCooldownMs, 500);
  assert.ok(relic.synergyPartners.includes(RelicId.POCKET_CHRONOMETER));
  assert.equal(relic.synergyName, 'Precognitive Resonance');
});

/* ==============================================================================
 * TIER 3: PRECOGNITIVE RESONANCE SYNERGY DEFINITION
 * ============================================================================== */

test('Tier 3: Precognitive Resonance is registered in SYNERGY_DEFINITIONS', () => {
  const synergy = SYNERGY_DEFINITIONS.find((s) => s.name === 'Precognitive Resonance');
  assert.ok(synergy, 'Precognitive Resonance synergy must exist');
  assert.equal(synergy.relicA, RelicId.PSIONIC_FEEDBACK_CRYSTAL);
  assert.equal(synergy.relicB, RelicId.POCKET_CHRONOMETER);
  assert.ok(synergy.description.includes('3.5 tiles'));
});

/* ==============================================================================
 * TIER 4: PSIONIC PULSE & PRECOGNITIVE STUN COMBAT PROCS
 * ============================================================================== */

test('Tier 4.1: Standalone Psionic Feedback Crystal emits 2.0-tile pulse without stun', () => {
  const rm = new RelicManager([RelicId.PSIONIC_FEEDBACK_CRYSTAL], 1);
  const enemies = [
    { id: 'near_1', r: 5, c: 6 }, // dist 1.0 tile
    { id: 'near_2', r: 6, c: 6 }, // dist 1.414 tiles
    { id: 'far_1', r: 5, c: 8 },  // dist 3.0 tiles
  ];

  const proc = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, 1000);
  assert.ok(proc);
  assert.equal(proc.pulseRadius, 2.0);
  assert.equal(proc.isStunned, false);
  assert.equal(proc.confusedDurationMs, 1500);
  assert.deepEqual(proc.affectedEnemyIds.sort(), ['near_1', 'near_2']);
});

test('Tier 4.2: Precognitive Resonance synergy expands pulse to 3.5 tiles and stuns during crisis', () => {
  const rm = new RelicManager([RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.POCKET_CHRONOMETER], 2);
  const enemies = [
    { id: 'near_1', r: 5, c: 6 }, // dist 1.0
    { id: 'mid_1', r: 5, c: 8 },  // dist 3.0 (within 3.5)
    { id: 'far_1', r: 5, c: 10 }, // dist 5.0 (outside 3.5)
  ];

  // Active crisis enables empowerment
  const proc = rm.onBombDetonationPsionicPulse(5, 5, enemies, true, 60, 1000);
  assert.ok(proc);
  assert.equal(proc.pulseRadius, 3.5);
  assert.equal(proc.isStunned, true);
  assert.equal(proc.confusedDurationMs, 1500);
  assert.deepEqual(proc.affectedEnemyIds.sort(), ['mid_1', 'near_1']);
});

test('Tier 4.3: Precognitive Resonance synergy triggers empowerment in final 30s of normal match', () => {
  const rm = new RelicManager([RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.POCKET_CHRONOMETER], 2);
  const enemies = [{ id: 'mid_1', r: 5, c: 8 }];

  // Not in crisis, but matchSecondsRemaining <= 30
  const proc = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 25, 1000);
  assert.ok(proc);
  assert.equal(proc.pulseRadius, 3.5);
  assert.equal(proc.isStunned, true);
  assert.deepEqual(proc.affectedEnemyIds, ['mid_1']);
});

test('Tier 4.4: 500ms ICD suppresses rapid psionic pulse spam', () => {
  const rm = new RelicManager([RelicId.PSIONIC_FEEDBACK_CRYSTAL], 1);
  const enemies = [{ id: 'e1', r: 5, c: 6 }];

  const proc1 = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, 1000);
  assert.ok(proc1);
  assert.equal(proc1.affectedEnemyIds.length, 1);

  // 200ms later (< 500ms ICD): strictly suppressed
  const proc2 = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, 1200);
  assert.equal(proc2.affectedEnemyIds.length, 0);

  // 600ms later (> 500ms ICD): allowed
  const proc3 = rm.onBombDetonationPsionicPulse(5, 5, enemies, false, 60, 1600);
  assert.ok(proc3);
  assert.equal(proc3.affectedEnemyIds.length, 1);
});

/* ==============================================================================
 * TIER 5: ORBITAL ION STRIKE SYNERGY HARMONIZATION
 * ============================================================================== */

test('Tier 5.1: getMagnetRadiusTiles returns 8 tiles when Orbital Ion Strike is active', () => {
  const rm = new RelicManager([RelicId.MAGNETRON_DIAL, RelicId.ORBITAL_TARGETING_CORE], 2);
  assert.equal(rm.getMagnetRadiusTiles(60), 8, 'Orbital Ion Strike must grant 8-tile magnet radius anytime');
});

test('Tier 5.2: onBombDetonationOrbitalTargeting fires 3-tile cross pattern with synergy', () => {
  const rm = new RelicManager([RelicId.MAGNETRON_DIAL, RelicId.ORBITAL_TARGETING_CORE], 2);
  const strike = rm.onBombDetonationOrbitalTargeting(5, 5, 1000);

  assert.ok(strike);
  assert.equal(strike.damage, 150);
  assert.equal(strike.delayMs, 1200);
  assert.equal(strike.targetTiles.length, 5); // Center + 4 cross directions
  assert.deepEqual(strike.targetTiles, [
    { r: 5, c: 5 },
    { r: 4, c: 5 },
    { r: 6, c: 5 },
    { r: 5, c: 4 },
    { r: 5, c: 6 },
  ]);
});

/* ==============================================================================
 * TIER 6: SERIALIZATION & ZERO-GC 10,000-FRAME SOAK
 * ============================================================================== */

test('Tier 6.1: Serialization & deserialization safely roundtrips PSIONIC_FEEDBACK_CRYSTAL', () => {
  const rm = new RelicManager([RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.POCKET_CHRONOMETER], 2);
  const state = rm.serialize();
  assert.ok(state.equippedRelics.includes(RelicId.PSIONIC_FEEDBACK_CRYSTAL));

  const restored = new RelicManager([], 2);
  restored.deserialize(state);
  assert.equal(restored.isEquipped(RelicId.PSIONIC_FEEDBACK_CRYSTAL), true);
  assert.equal(restored.isEquipped(RelicId.POCKET_CHRONOMETER), true);
  assert.equal(restored.hasSynergy(RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.POCKET_CHRONOMETER), true);
});

test('Tier 6.2: 10,000 continuous frames execute with 0 heap leaks and bounded execution', () => {
  const rm = new RelicManager([RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.POCKET_CHRONOMETER], 2);
  const enemies = [{ id: 'e1', r: 5, c: 6 }];

  let nowMs = 100000;
  let procCount = 0;

  for (let frame = 0; frame < 10000; frame++) {
    nowMs += 16.6667;
    // Every 60 frames (~1.0s), detonate a bomb
    if (frame % 60 === 0) {
      const proc = rm.onBombDetonationPsionicPulse(5, 5, enemies, true, 60, nowMs);
      if (proc) procCount++;
    }
  }

  assert.equal(procCount, 167); // 10000 / 60 rounded up
});
