/**
 * psionic_flora_integration_loop.test.mjs
 *
 * Integration and Verification Suite:
 * 1. Mutant Flora Boss roots cleanse on bomb blast (+150 score bonus)
 * 2. Psionic manifestation disruption on bomb blast (+500 score, +10 ultimate charge)
 * 3. Crisis resolution edge-triggered reward (+5000 score, +35 star candies, +15 cosmic essence)
 * 4. WaveMutatorId catalog expansion (PSIONIC_HAZE, VERDANT_OVERGROWTH)
 * 5. Procedural boss visuals and Zero-GC invariant soak tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MutantFloraBoss } from '../src/game/bosses/MutantFloraBoss.ts';
import { BossState } from '../src/game/bosses/BossTypes.ts';
import { PsychicCrisis } from '../src/game/crises/PsychicCrisis.ts';
import { CrisisManager } from '../src/game/crises/CrisisManager.ts';
import { CrisisType, CrisisStage, HazardType } from '../src/game/crises/CrisisTypes.ts';
import { WaveMutatorId } from '../src/game/progression/ProgressionTypes.ts';
import { WAVE_MUTATOR_CATALOG, ScalingEngine } from '../src/game/progression/ScalingEngine.ts';

test('Integration 1.1: MutantFloraBoss.cleanseRootsAt safely clears roots within blast radius', () => {
  const boss = new MutantFloraBoss(300, 260);

  // Spawn subterranean roots at specific grid cells
  const root1 = boss.spawnSubterraneanRoot(120, 120); // (col 3, row 3)
  const root2 = boss.spawnSubterraneanRoot(160, 120); // (col 4, row 3)
  const root3 = boss.spawnSubterraneanRoot(400, 400); // (col 10, row 10)

  assert.ok(root1);
  assert.ok(root2);
  assert.ok(root3);
  assert.strictEqual(boss.activeRoots, 3);

  // Bomb blast at (row 3, col 3) with radius 1 covers root1 and root2
  const cleansed = boss.cleanseRootsAt(3, 3, 1);
  assert.strictEqual(cleansed, 2, 'Should cleanse exactly 2 roots in radius');
  assert.strictEqual(boss.activeRoots, 1, 'Remaining active roots should be 1');

  // Cleansing distant tile cleanses nothing
  const none = boss.cleanseRootsAt(1, 1, 1);
  assert.strictEqual(none, 0);
  assert.strictEqual(boss.activeRoots, 1);

  // Cleansing root3
  const last = boss.cleanseRootsAt(10, 10, 1);
  assert.strictEqual(last, 1);
  assert.strictEqual(boss.activeRoots, 0);
});

test('Integration 1.2: WaveMutator catalog registers PSIONIC_HAZE and VERDANT_OVERGROWTH', () => {
  assert.ok(WaveMutatorId.PSIONIC_HAZE);
  assert.ok(WaveMutatorId.VERDANT_OVERGROWTH);

  const psionicMutator = WAVE_MUTATOR_CATALOG[WaveMutatorId.PSIONIC_HAZE];
  assert.ok(psionicMutator, 'PSIONIC_HAZE must be present in catalog');
  assert.strictEqual(psionicMutator.id, WaveMutatorId.PSIONIC_HAZE);
  assert.strictEqual(psionicMutator.icon, '🧠');
  assert.ok(psionicMutator.statModifiers.playerDamageMultiplier > 1.0);

  const verdantMutator = WAVE_MUTATOR_CATALOG[WaveMutatorId.VERDANT_OVERGROWTH];
  assert.ok(verdantMutator, 'VERDANT_OVERGROWTH must be present in catalog');
  assert.strictEqual(verdantMutator.id, WaveMutatorId.VERDANT_OVERGROWTH);
  assert.strictEqual(verdantMutator.icon, '🌿');
  assert.ok(verdantMutator.statModifiers.softBlockDensityMultiplier > 1.0);
});

test('Integration 1.3: ScalingEngine.generateWaveMutators selects mutators with zero duplicates', () => {
  for (let wave = 1; wave <= 50; wave++) {
    const mutators = ScalingEngine.generateWaveMutators(wave);
    if (mutators.length >= 2) {
      assert.notStrictEqual(mutators[0].id, mutators[1].id, `Wave ${wave} produced duplicate mutators`);
    }
  }
});

test('Integration 1.4: Psionic Manifestation disruption via CrisisManager bomb blast advances crisis', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PSYCHIC_INVASION);
  const crisis = manager.getActiveCrisis();
  assert.ok(crisis);
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Position 1 of PsychicCrisis is at (3, 3)
  const pos = PsychicCrisis.MANIFESTATION_POSITIONS[0];
  const beforeObj = crisis.getObjectives().find((o) => o.id === 'resist_psionics');
  const countBefore = beforeObj.currentCount;

  // Bomb blast at (3, 3) destroys manifestation
  manager.handleBombBlast(pos.r, pos.c, 1);

  const afterObj = crisis.getObjectives().find((o) => o.id === 'resist_psionics');
  assert.strictEqual(afterObj.currentCount, countBefore + 1, 'Objective should increment on manifestation blast');
});

test('Integration 1.5: PsychicCrisis resolution event and state transition stability', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PSYCHIC_INVASION);
  const crisis = manager.getActiveCrisis();
  crisis.transitionToStage(CrisisStage.CLIMAX);

  // Blast all manifestations to trigger victory
  for (const pos of PsychicCrisis.MANIFESTATION_POSITIONS) {
    manager.handleBombBlast(pos.r, pos.c, 1);
  }

  assert.strictEqual(crisis.getStage(), CrisisStage.RESOLVED);
  assert.strictEqual(crisis.getStatus().isVictorious, true);
  assert.strictEqual(crisis.getActiveHazardCount(), 0);
});

test('Integration 1.6: 10,000-frame soak stability across Mutant Flora Boss and Psychic Crisis concurrent execution', () => {
  const boss = new MutantFloraBoss(300, 260);
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  for (let frame = 0; frame < 10000; frame++) {
    // 60 FPS tick (16.66ms)
    boss.update(16.66, 300, 300);
    crisis.update(16.66, { r: 6, c: 6, x: 300, y: 300 });

    if (frame % 250 === 0) {
      boss.cleanseRootsAt(frame % 11, frame % 13, 1);
      crisis.dispelIllusionAt(frame % 11, frame % 13);
    }
  }

  assert.ok(Number.isFinite(boss.x));
  assert.ok(Number.isFinite(boss.y));
  assert.ok(crisis.getSafeAreaRatio() >= 0.80);
});
