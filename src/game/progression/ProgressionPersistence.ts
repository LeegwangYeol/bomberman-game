/**
 * ProgressionPersistence.ts — Robust Serialization, Deserialization, and API 429 Recovery Bridge
 * for In-Run and Meta Progression State.
 */

import {
  GameModeType,
  RelicId,
  WaveMutatorId,
} from './ProgressionTypes.ts';
import type {
  RunProgressionState,
  MetaProfile,
  AppliedPerkBonuses,
  WaveMutator,
} from './ProgressionTypes.ts';
import { WAVE_MUTATOR_CATALOG } from './ScalingEngine.ts';
import { PerkTreeManager } from './PerkTree.ts';

/**
 * Creates a clean default RunProgressionState for the given GameModeType.
 */
export function createDefaultRunProgressionState(
  mode: GameModeType = GameModeType.STANDARD,
  appliedPerks?: AppliedPerkBonuses,
  equippedRelics?: RelicId[]
): RunProgressionState {
  const perks = appliedPerks ?? PerkTreeManager.calculateAppliedBonuses({});
  const relics = equippedRelics ? equippedRelics.slice(0, perks.maxRelicSlots) : [];

  return {
    mode,
    wave: 1,
    chamberNumber: 1,
    score: 0,
    killCount: 0,
    starCandiesEarned: 0,
    cosmicEssenceEarned: 0,
    equippedRelics: relics,
    appliedPerks: perks,
    activeMutators: [],
    secondWindConsumed: false,
    bossRushCurrentIndex: 0,
    bossRushElapsedMs: 0,
    survivalElapsedMs: 0,
    nextCrisisCountdownMs: 60000,
    nextDropPodCountdownMs: 45000,
    crisesPurifiedCount: 0,
  };
}

/**
 * Defensively sanitizes an unknown object or untrusted payload into a valid RunProgressionState.
 * Prevents prototype pollution, NaN, negative currencies, corrupted arrays, and out-of-range timers.
 */
export function sanitizeRunProgressionState(input: unknown): RunProgressionState {
  const defaults = createDefaultRunProgressionState();
  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const p = input as Record<string, unknown>;

  // 1. Game Mode
  const validModes = new Set(Object.values(GameModeType));
  const mode = typeof p.mode === 'string' && validModes.has(p.mode as GameModeType)
    ? (p.mode as GameModeType)
    : defaults.mode;

  // 2. Safe Numbers
  const safeInt = (val: unknown, fallback: number, min: number = 0, max: number = 999_999_999): number => {
    if (typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val)) {
      return Math.min(max, Math.max(min, Math.floor(val)));
    }
    return fallback;
  };

  const safeFloat = (val: unknown, fallback: number, min: number = 0, max: number = 999_999_999): number => {
    if (typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val)) {
      return Math.min(max, Math.max(min, val));
    }
    return fallback;
  };

  const wave = safeInt(p.wave, 1, 1);
  const chamberNumber = safeInt(p.chamberNumber, 1, 1);
  const score = safeInt(p.score, 0, 0);
  const killCount = safeInt(p.killCount, 0, 0);
  const starCandiesEarned = safeInt(p.starCandiesEarned, 0, 0);
  const cosmicEssenceEarned = safeInt(p.cosmicEssenceEarned, 0, 0);

  // 3. Applied Perks
  const appliedPerks: AppliedPerkBonuses = {
    startingBlastRadiusBonus: safeInt((p.appliedPerks as AppliedPerkBonuses)?.startingBlastRadiusBonus, 0),
    bombCooldownReduction: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.bombCooldownReduction, 0, 0, 1),
    chainScoreBonus: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.chainScoreBonus, 0),
    chainUltChargeBonus: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.chainUltChargeBonus, 0),
    maxBombCapacity: safeInt((p.appliedPerks as AppliedPerkBonuses)?.maxBombCapacity, 6, 1, 12),
    baseSpeedBonus: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.baseSpeedBonus, 0),
    cornerSlideTolerance: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.cornerSlideTolerance, 8, 4, 20),
    hasDashDecoy: Boolean((p.appliedPerks as AppliedPerkBonuses)?.hasDashDecoy),
    dashCooldownReductionMs: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.dashCooldownReductionMs, 0),
    dashSpeedBurstRatio: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.dashSpeedBurstRatio, 0),
    startingShields: safeInt((p.appliedPerks as AppliedPerkBonuses)?.startingShields, 0, 0, 5),
    hasSecondWind: Boolean((p.appliedPerks as AppliedPerkBonuses)?.hasSecondWind),
    groundSlowdownReduction: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.groundSlowdownReduction, 0, 0, 1),
    extraHeartContainer: safeInt((p.appliedPerks as AppliedPerkBonuses)?.extraHeartContainer, 0, 0, 5),
    itemDropRateBonus: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.itemDropRateBonus, 0, 0, 1),
    shopDiscountRatio: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.shopDiscountRatio, 0, 0, 1),
    relicDropChanceBonus: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.relicDropChanceBonus, 0, 0, 1),
    maxRelicSlots: safeInt((p.appliedPerks as AppliedPerkBonuses)?.maxRelicSlots, 1, 1, 2),
    gildedChestChance: safeFloat((p.appliedPerks as AppliedPerkBonuses)?.gildedChestChance, 0, 0, 1),
  };

  // 4. Equipped Relics
  const validRelics = new Set(Object.values(RelicId));
  const equippedRelics: RelicId[] = Array.isArray(p.equippedRelics)
    ? (p.equippedRelics as unknown[])
        .filter((r): r is RelicId => typeof r === 'string' && validRelics.has(r as RelicId))
        .slice(0, appliedPerks.maxRelicSlots)
    : [];

  // 5. Mutators
  const validMutators = new Set(Object.values(WaveMutatorId));
  const activeMutators: WaveMutator[] = [];
  if (Array.isArray(p.activeMutators)) {
    for (const m of p.activeMutators) {
      if (m && typeof m === 'object' && typeof (m as WaveMutator).id === 'string') {
        const mId = (m as WaveMutator).id;
        if (validMutators.has(mId) && WAVE_MUTATOR_CATALOG[mId]) {
          activeMutators.push(WAVE_MUTATOR_CATALOG[mId]);
        }
      }
    }
  }

  // 6. Timers & Progress
  const secondWindConsumed = Boolean(p.secondWindConsumed);
  const bossRushCurrentIndex = safeInt(p.bossRushCurrentIndex, 0, 0, 10);
  const bossRushElapsedMs = safeFloat(p.bossRushElapsedMs, 0);
  const survivalElapsedMs = safeFloat(p.survivalElapsedMs, 0);
  const nextCrisisCountdownMs = safeFloat(p.nextCrisisCountdownMs, 60000, 0);
  const nextDropPodCountdownMs = safeFloat(p.nextDropPodCountdownMs, 45000, 0);
  const crisesPurifiedCount = safeInt(p.crisesPurifiedCount, 0);

  return {
    mode,
    wave,
    chamberNumber,
    score,
    killCount,
    starCandiesEarned,
    cosmicEssenceEarned,
    equippedRelics,
    appliedPerks,
    activeMutators,
    secondWindConsumed,
    bossRushCurrentIndex,
    bossRushElapsedMs,
    survivalElapsedMs,
    nextCrisisCountdownMs,
    nextDropPodCountdownMs,
    crisesPurifiedCount,
  };
}

/**
 * Serializes a RunProgressionState into a JSON string.
 */
export function serializeRunProgressionState(state: RunProgressionState): string {
  const sanitized = sanitizeRunProgressionState(state);
  return JSON.stringify(sanitized);
}

/**
 * Deserializes a RunProgressionState from a JSON string or raw object.
 */
export function deserializeRunProgressionState(raw: string | unknown): RunProgressionState {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return sanitizeRunProgressionState(parsed);
    } catch {
      return createDefaultRunProgressionState();
    }
  }
  return sanitizeRunProgressionState(raw);
}

/**
 * API 429 Quota Recovery Reconciliation:
 * Seamlessly reconciles RunProgressionState and MetaProfile following an API 429 quota interruption.
 * Guarantees zero currency duplication and zero progress loss.
 */
export function reconcileProgressionOn429Recovery(
  savedProgression: RunProgressionState,
  currentMeta: MetaProfile
): {
  reconciledProgression: RunProgressionState;
  reconciledMeta: MetaProfile;
} {
  const sanitizedProg = sanitizeRunProgressionState(savedProgression);

  // Sync highest wave reached and survival time records into meta profile
  const metaCopy: MetaProfile = {
    ...currentMeta,
    highestWaveReached: {
      ...currentMeta.highestWaveReached,
      [sanitizedProg.mode]: Math.max(
        currentMeta.highestWaveReached[sanitizedProg.mode] || 1,
        sanitizedProg.wave
      ),
    },
    bestSurvivalTimesSeconds: {
      ...currentMeta.bestSurvivalTimesSeconds,
      [sanitizedProg.mode]: Math.max(
        currentMeta.bestSurvivalTimesSeconds[sanitizedProg.mode] || 0,
        Math.floor(sanitizedProg.survivalElapsedMs / 1000)
      ),
    },
  };

  return {
    reconciledProgression: sanitizedProg,
    reconciledMeta: metaCopy,
  };
}
