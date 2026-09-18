/**
 * ScalingEngine.ts — Infinite Scaling Difficulty Engine with Mobile Performance Soft Caps
 *
 * Implements mathematical formulations from survey report § 3.1:
 * - v(W) = v0 * (1 + min(1.2, 0.035 * (W - 1))) [Soft capped at 2.2x]
 * - HP(W) = floor(HP0 + 0.25 * (W - 1))
 * - N(W) = min(14, 4 + floor(sqrt(W - 1) * 1.5)) [Strict cap at 14 active enemies]
 * - Fuse(W) = max(1200ms, 2000ms - 40ms * (W - 1))
 * - Reaction(W) = max(200ms, 600ms - 20ms * (W - 1))
 * - M(W) = 1.0 + 0.15 * (W - 1) + 0.05 * KillStreak
 */

import { WaveMutatorId } from './ProgressionTypes.ts';
import type { WaveMutator, WaveScalingParameters } from './ProgressionTypes.ts';

/* ==============================================================================
 * WAVE ROOM MUTATORS (AFFIXES)
 * ============================================================================== */

export const WAVE_MUTATOR_CATALOG: Record<WaveMutatorId, WaveMutator> = {
  [WaveMutatorId.SPEED_DEMON]: {
    id: WaveMutatorId.SPEED_DEMON,
    name: 'Speed Demon',
    icon: '⚡',
    description: 'All entities move 25% faster; bomb fuses burn 25% faster.',
    statModifiers: {
      enemySpeedMultiplier: 1.25,
      bombFuseMultiplier: 0.75,
    },
  },
  [WaveMutatorId.VOLATILE_CONDUITS]: {
    id: WaveMutatorId.VOLATILE_CONDUITS,
    name: 'Volatile Conduits',
    icon: '💥',
    description: 'Bomb blast radius expanded by +2 tiles; chain reaction delay reduced to 0ms.',
    statModifiers: {
      blastRadiusDelta: 2,
      chainDelayMs: 0,
    },
  },
  [WaveMutatorId.DENSE_FORTIFICATION]: {
    id: WaveMutatorId.DENSE_FORTIFICATION,
    name: 'Dense Fortification',
    icon: '🧱',
    description: 'Soft block density increased to 80%; all soft blocks require 2 bomb hits.',
    statModifiers: {
      softBlockDensityMultiplier: 1.8,
      softBlockHitsRequired: 2,
    },
  },
  [WaveMutatorId.GLASS_CANNON]: {
    id: WaveMutatorId.GLASS_CANNON,
    name: 'Glass Cannon',
    icon: '🔮',
    description: 'Player deals double bomb damage, but shield protection buffers are disabled.',
    statModifiers: {
      playerDamageMultiplier: 2.0,
      playerShieldsDisabled: true,
    },
  },
  [WaveMutatorId.MAGNETIC_DRIFT]: {
    id: WaveMutatorId.MAGNETIC_DRIFT,
    name: 'Magnetic Drift',
    icon: '🧲',
    description: 'Placed bombs slowly glide toward nearest moving entity at 20 px/s.',
    statModifiers: {
      bombDriftPxPerSec: 20,
    },
  },
  [WaveMutatorId.SOLAR_CORONA]: {
    id: WaveMutatorId.SOLAR_CORONA,
    name: 'Solar Corona',
    icon: '☀️',
    description: 'Coronal heat pulses sweep open cardinal corridors every 20 seconds.',
    statModifiers: {
      coronalPulseIntervalMs: 20000,
    },
  },
  [WaveMutatorId.ZERO_G_FIZZ]: {
    id: WaveMutatorId.ZERO_G_FIZZ,
    name: 'Zero-G Fizz',
    icon: '🚀',
    description: 'Low-gravity arena; kicked bombs bounce off walls up to 2 times without stopping.',
    statModifiers: {
      bombKickRebounds: 2,
    },
  },
};

/* ==============================================================================
 * MATHEMATICAL SCALING ENGINE
 * ============================================================================== */

export class ScalingEngine {
  /**
   * Internal helper to guarantee wave index is a finite integer >= 1.
   * Prevents NaN propagation and infinite loops.
   */
  private static sanitizeWave(wave: number): number {
    return Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
  }

  /**
   * Calculate enemy speed multiplier based on wave W:
   * v(W) = v0 * (1 + min(1.2, 0.035 * (W - 1)))
   * Soft capped at 2.2x base velocity.
   */
  static calculateEnemySpeedMultiplier(wave: number): number {
    const safeWave = this.sanitizeWave(wave);
    const bonus = Math.min(1.2, 0.035 * (safeWave - 1));
    return Number((1.0 + bonus).toFixed(4));
  }

  /**
   * Calculate effective enemy velocity in px/s.
   */
  static calculateEnemyVelocity(wave: number, baseVelocity: number = 100): number {
    const safeBase = Number.isFinite(baseVelocity) && baseVelocity > 0 ? baseVelocity : 100;
    const mult = this.calculateEnemySpeedMultiplier(wave);
    return Math.round(safeBase * mult);
  }

  /**
   * Calculate base enemy hit points based on wave W:
   * HP(W) = floor(HP0 + 0.25 * (W - 1))
   * Soft capped at baseHP + 5 to maintain reasonable mobile combat pacing.
   */
  static calculateEnemyHp(wave: number, baseHP: number = 1): number {
    const safeWave = this.sanitizeWave(wave);
    const safeBase = Number.isFinite(baseHP) && baseHP > 0 ? Math.floor(baseHP) : 1;
    const scaled = Math.floor(safeBase + 0.25 * (safeWave - 1));
    return Math.min(safeBase + 5, scaled);
  }

  /**
   * Calculate probability of an enemy spawning with Reinforced Armor (+1 extra bomb hit).
   * Starting at Wave 5, 20% baseline, scaling up to 50% at wave 20+.
   */
  static calculateArmorChance(wave: number): number {
    const safeWave = this.sanitizeWave(wave);
    if (safeWave < 5) return 0.0;
    const additionalChance = Math.min(0.30, 0.02 * (safeWave - 5));
    return Number((0.20 + additionalChance).toFixed(2));
  }

  /**
   * Calculate active concurrent enemy density:
   * N(W) = min(14, 4 + floor(sqrt(W - 1) * 1.5))
   * Strictly capped at 14 to guarantee zero frame drops and prevent pool exhaustion.
   */
  static calculateActiveEnemyCount(wave: number): number {
    const safeWave = this.sanitizeWave(wave);
    const delta = Math.sqrt(safeWave - 1) * 1.5;
    const count = 4 + Math.floor(delta);
    return Math.min(14, count);
  }

  /**
   * Calculate bomb fuse duration in ms:
   * Fuse(W) = max(1200ms, 2000ms - 40ms * (W - 1))
   */
  static calculateBombFuseMs(wave: number): number {
    const safeWave = this.sanitizeWave(wave);
    const raw = 2000 - 40 * (safeWave - 1);
    return Math.max(1200, raw);
  }

  /**
   * Calculate enemy reaction evasion time in ms:
   * ReactionTime(W) = max(200ms, 600ms - 20ms * (W - 1))
   */
  static calculateEnemyReactionMs(wave: number): number {
    const safeWave = this.sanitizeWave(wave);
    const raw = 600 - 20 * (safeWave - 1);
    return Math.max(200, raw);
  }

  /**
   * Calculate score multiplier based on wave and kill streak:
   * M(W, KillStreak) = 1.0 + 0.15 * (W - 1) + 0.05 * KillStreak
   */
  static calculateScoreMultiplier(wave: number, killStreak: number = 0): number {
    const safeWave = this.sanitizeWave(wave);
    const safeStreak = Number.isFinite(killStreak) ? Math.max(0, Math.floor(killStreak)) : 0;
    const mult = 1.0 + 0.15 * (safeWave - 1) + 0.05 * safeStreak;
    return Number(mult.toFixed(2));
  }

  /**
   * Boss HP scaling for deep endless runs or Boss Rush waves:
   * BossHP(W) = floor(BaseBossHP * (1 + 0.15 * (W - 1)))
   * Soft capped at floor(baseBossHp * 2.5) to keep boss encounters beatable.
   */
  static calculateBossHp(wave: number, baseBossHp: number = 10): number {
    const safeWave = this.sanitizeWave(wave);
    const safeBase = Number.isFinite(baseBossHp) && baseBossHp > 0 ? Math.floor(baseBossHp) : 10;
    const scaled = Math.floor(safeBase * (1.0 + 0.15 * (safeWave - 1)));
    return Math.min(Math.floor(safeBase * 2.5), scaled);
  }

  /**
   * Deterministically or pseudo-randomly pick 1-2 mutators for wave W.
   * Ensures no conflicting mutators (e.g. Glass Cannon + Dense Fortification).
   */
  static generateWaveMutators(wave: number, seed?: number): WaveMutator[] {
    const safeWave = this.sanitizeWave(wave);
    if (safeWave < 3) return []; // Waves 1 and 2 are vanilla training waves

    const allKeys = Object.keys(WAVE_MUTATOR_CATALOG) as WaveMutatorId[];
    const s = seed !== undefined && Number.isFinite(seed) ? seed : safeWave * 104729;

    // Pick first mutator
    const idx1 = Math.abs(s) % allKeys.length;
    const mutator1 = WAVE_MUTATOR_CATALOG[allKeys[idx1]];

    // Wave 3-5 gets 1 mutator; Wave 6+ gets 2 mutators
    if (safeWave < 6) {
      return [mutator1];
    }

    // Pick second mutator that does not conflict
    let idx2 = (idx1 + 1 + (Math.abs(s >> 4) % (allKeys.length - 1))) % allKeys.length;
    let mutator2 = WAVE_MUTATOR_CATALOG[allKeys[idx2]];

    // Incompatible pairs check
    if (
      (mutator1.id === WaveMutatorId.GLASS_CANNON && mutator2.id === WaveMutatorId.DENSE_FORTIFICATION) ||
      (mutator1.id === WaveMutatorId.DENSE_FORTIFICATION && mutator2.id === WaveMutatorId.GLASS_CANNON)
    ) {
      idx2 = (idx2 + 1) % allKeys.length;
      mutator2 = WAVE_MUTATOR_CATALOG[allKeys[idx2]];
    }

    return [mutator1, mutator2];
  }

  /**
   * Generate complete wave scaling snapshot.
   */
  static calculateWaveParameters(
    wave: number,
    baseVelocity: number = 100,
    baseHp: number = 1,
    killStreak: number = 0
  ): WaveScalingParameters {
    const speedMult = this.calculateEnemySpeedMultiplier(wave);
    const speed = this.calculateEnemyVelocity(wave, baseVelocity);
    const hp = this.calculateEnemyHp(wave, baseHp);
    const armorChance = this.calculateArmorChance(wave);
    const count = this.calculateActiveEnemyCount(wave);
    const fuse = this.calculateBombFuseMs(wave);
    const reaction = this.calculateEnemyReactionMs(wave);
    const scoreMult = this.calculateScoreMultiplier(wave, killStreak);
    const mutators = this.generateWaveMutators(wave);

    return {
      wave,
      enemyVelocityMultiplier: speedMult,
      enemyVelocity: speed,
      enemyMaxHp: hp,
      reinforcedArmorChance: armorChance,
      activeEnemyCount: count,
      bombFuseMs: fuse,
      enemyReactionMs: reaction,
      scoreMultiplier: scoreMult,
      mutators,
    };
  }

  /**
   * Compact number formatter for scores exceeding 1,000,000 (Edge Case 16).
   * E.g. 1,250,000 -> "1.25M", 14,800,000 -> "14.8M", 450,000 -> "450K".
   */
  static formatScore(score: number): string {
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
    if (safeScore < 10000) {
      return safeScore.toLocaleString('en-US');
    }
    if (safeScore < 1000000) {
      const k = safeScore / 1000;
      return `${Number(k.toFixed(1))}K`;
    }
    const m = safeScore / 1000000;
    return `${Number(m.toFixed(2))}M`;
  }
}
