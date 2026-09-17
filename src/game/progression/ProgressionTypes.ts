/**
 * ProgressionTypes.ts — Universal types and interfaces for Scaling, Modes, Perks, and Relics
 */

/* ==============================================================================
 * GAME MODES
 * ============================================================================== */

export const GameModeType = {
  STANDARD: 'STANDARD',
  CRISIS_SURVIVAL: 'CRISIS_SURVIVAL',
  BOSS_RUSH: 'BOSS_RUSH',
  ENDLESS_GAUNTLET: 'ENDLESS_GAUNTLET',
} as const;

export type GameModeType = typeof GameModeType[keyof typeof GameModeType];

export interface GameModeInfo {
  id: GameModeType;
  name: string;
  badge: string;
  icon: string;
  description: string;
  features: string[];
  rules: {
    timerType: 'countdown' | 'countup' | 'stage';
    hasCrises: boolean;
    hasBosses: boolean;
    hasBoonDraft: boolean;
    respawnAllowed: boolean;
  };
}

export const GAME_MODE_DEFINITIONS: Record<GameModeType, GameModeInfo> = {
  [GameModeType.STANDARD]: {
    id: GameModeType.STANDARD,
    name: 'Standard Adventure',
    badge: 'Classic 💣',
    icon: '💣',
    description: 'Classic stage-by-stage progression with tactical enemy waves and escalating challenges.',
    features: ['Standard wave escalation', 'Boss encounters every 5 waves', 'Classic power-up drops'],
    rules: {
      timerType: 'stage',
      hasCrises: true,
      hasBosses: true,
      hasBoonDraft: false,
      respawnAllowed: true,
    },
  },
  [GameModeType.CRISIS_SURVIVAL]: {
    id: GameModeType.CRISIS_SURVIVAL,
    name: 'Crisis Survival',
    badge: 'Stellaris 🌌',
    icon: '🌌',
    description: 'Survive against escalating Stellaris-style cosmic disasters striking every 60 seconds.',
    features: ['Count-up stopwatch', 'Crises strike every 60s', 'Emergency drop pods every 45s'],
    rules: {
      timerType: 'countup',
      hasCrises: true,
      hasBosses: false,
      hasBoonDraft: false,
      respawnAllowed: false,
    },
  },
  [GameModeType.BOSS_RUSH]: {
    id: GameModeType.BOSS_RUSH,
    name: 'Boss Rush Gauntlet',
    badge: 'Gauntlet 👑',
    icon: '👑',
    description: 'Consecutive battle against all 5 Epic Bosses with persistent health and time-attack medals.',
    features: ['5 Consecutive Bosses', 'Persistent Health pool', '20s Madame Bonbon rest stops', 'Time-attack medals'],
    rules: {
      timerType: 'countup',
      hasCrises: false,
      hasBosses: true,
      hasBoonDraft: false,
      respawnAllowed: false,
    },
  },
  [GameModeType.ENDLESS_GAUNTLET]: {
    id: GameModeType.ENDLESS_GAUNTLET,
    name: 'Endless Gauntlet',
    badge: 'Roguelite 🌀',
    icon: '🌀',
    description: 'Infinite procedurally generated chambers with 3-card boon drafts and checkpoint elevators.',
    features: ['Infinite procedural chambers', '3-card Roguelite Boon Draft', 'Checkpoints at Chambers 10, 20, 30'],
    rules: {
      timerType: 'stage',
      hasCrises: true,
      hasBosses: true,
      hasBoonDraft: true,
      respawnAllowed: false,
    },
  },
};

/* ==============================================================================
 * SCALING & MUTATORS
 * ============================================================================== */

export const WaveMutatorId = {
  SPEED_DEMON: 'SPEED_DEMON',
  VOLATILE_CONDUITS: 'VOLATILE_CONDUITS',
  DENSE_FORTIFICATION: 'DENSE_FORTIFICATION',
  GLASS_CANNON: 'GLASS_CANNON',
  MAGNETIC_DRIFT: 'MAGNETIC_DRIFT',
  SOLAR_CORONA: 'SOLAR_CORONA',
  ZERO_G_FIZZ: 'ZERO_G_FIZZ',
} as const;

export type WaveMutatorId = typeof WaveMutatorId[keyof typeof WaveMutatorId];

export interface WaveMutator {
  id: WaveMutatorId;
  name: string;
  icon: string;
  description: string;
  statModifiers: {
    enemySpeedMultiplier?: number;
    bombFuseMultiplier?: number;
    blastRadiusDelta?: number;
    chainDelayMs?: number;
    softBlockDensityMultiplier?: number;
    softBlockHitsRequired?: number;
    playerDamageMultiplier?: number;
    playerShieldsDisabled?: boolean;
    bombDriftPxPerSec?: number;
    coronalPulseIntervalMs?: number;
    bombKickRebounds?: number;
  };
}

export interface WaveScalingParameters {
  wave: number;
  enemyVelocityMultiplier: number;
  enemyVelocity: number; // in px/s based on base 100 px/s
  enemyMaxHp: number;
  reinforcedArmorChance: number;
  activeEnemyCount: number;
  bombFuseMs: number;
  enemyReactionMs: number;
  scoreMultiplier: number;
  mutators: WaveMutator[];
}

/* ==============================================================================
 * CONFECTIONERY PERK TREE (16 NODES ACROSS 4 BRANCHES)
 * ============================================================================== */

export const PerkBranch = {
  BAKING: 'BAKING',
  SUGAR_RUSH: 'SUGAR_RUSH',
  RESILIENCE: 'RESILIENCE',
  ALCHEMY: 'ALCHEMY',
} as const;

export type PerkBranch = typeof PerkBranch[keyof typeof PerkBranch];

export interface PerkNode {
  id: string;
  name: string;
  branch: PerkBranch;
  icon: string;
  maxLevel: number;
  costs: number[]; // Cosmic Sugar Essence cost per level [lvl1, lvl2, ...]
  description: string;
  effects: string[]; // Per-level description of effects
  prerequisites?: { perkId: string; minLevel: number }[];
}

export type PerkState = Record<string, number>;

export interface AppliedPerkBonuses {
  startingBlastRadiusBonus: number;
  bombCooldownReduction: number; // 0.0 to 1.0 (e.g. 0.25 = 25%)
  chainScoreBonus: number;
  chainUltChargeBonus: number;
  maxBombCapacity: number; // default 6, up to 9
  baseSpeedBonus: number; // px/s
  cornerSlideTolerance: number; // px, default 8px
  hasDashDecoy: boolean;
  dashCooldownReductionMs: number;
  dashSpeedBurstRatio: number;
  startingShields: number;
  hasSecondWind: boolean;
  groundSlowdownReduction: number; // 0.0 to 1.0
  extraHeartContainer: number;
  itemDropRateBonus: number; // 0.0 to 1.0
  shopDiscountRatio: number; // 0.0 to 1.0
  relicDropChanceBonus: number; // 0.0 to 1.0
  maxRelicSlots: number; // 1 or 2
  gildedChestChance: number; // 0.0 to 1.0
}

/* ==============================================================================
 * EQUIPPABLE RELICS (8 ARTIFACTS)
 * ============================================================================== */

export const RelicId = {
  POCKET_CHRONOMETER: 'pocket_chronometer',
  GELATINOUS_CORE: 'gelatinous_core',
  PYROCLASTIC_PRISM: 'pyroclastic_prism',
  MAGNETRON_DIAL: 'magnetron_dial',
  VAMPIRIC_CONFECTION: 'vampiric_confection',
  SOLAR_CAPACITOR: 'solar_capacitor',
  VOID_SINGULARITY_LENS: 'void_singularity_lens',
  CLOCKWORK_SPRING: 'clockwork_spring',
} as const;

export type RelicId = typeof RelicId[keyof typeof RelicId];

export type RelicRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface RelicDefinition {
  id: RelicId;
  name: string;
  icon: string;
  rarity: RelicRarity;
  description: string;
  mechanics: string;
  internalCooldownMs: number; // Internal Cooldown Guard (e.g. 500ms)
  synergyPartners: RelicId[];
  synergyName?: string;
  synergyDescription?: string;
}

export interface RelicSynergy {
  relicA: RelicId;
  relicB: RelicId;
  name: string;
  icon: string;
  description: string;
}

/* ==============================================================================
 * ENDLESS GAUNTLET ROOM TAXONOMY & BOON DRAFTS
 * ============================================================================== */

export const ChamberType = {
  STANDARD: 'STANDARD',
  ELITE: 'ELITE',
  CRISIS: 'CRISIS',
  BOSS: 'BOSS',
} as const;

export type ChamberType = typeof ChamberType[keyof typeof ChamberType];

export interface BoonOption {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic';
  description: string;
  apply: (bonuses: AppliedBoonBonuses) => void;
}

export interface AppliedBoonBonuses {
  extraBombs: number;
  extraSpeed: number;
  extraShield: number;
  extraDamage: number;
  bonusCandies: number;
  ultChargeMultiplier: number;
}

/* ==============================================================================
 * DUAL-CURRENCY ECONOMY & META PROGRESSION
 * ============================================================================== */

export interface MetaProfile {
  version: number;
  lastUpdated: number;
  cosmicEssence: number; // Permanent meta-currency (✨)
  starCandies: number; // In-run currency (🍬)
  perks: PerkState;
  unlockedModes: GameModeType[];
  discoveredRelics: RelicId[];
  equippedRelics: RelicId[];
  highestWaveReached: Record<GameModeType, number>;
  bestSurvivalTimesSeconds: Record<GameModeType, number>;
  bestBossRushTimeSeconds: number | null;
  trophiesUnlocked: string[];
}

export interface RunProgressionState {
  mode: GameModeType;
  wave: number;
  chamberNumber: number;
  score: number;
  killCount: number;
  starCandiesEarned: number;
  cosmicEssenceEarned: number;
  equippedRelics: RelicId[];
  appliedPerks: AppliedPerkBonuses;
  activeMutators: WaveMutator[];
  secondWindConsumed: boolean;
  bossRushCurrentIndex: number;
  bossRushElapsedMs: number;
  survivalElapsedMs: number;
  nextCrisisCountdownMs: number;
  nextDropPodCountdownMs: number;
  crisesPurifiedCount: number;
}
