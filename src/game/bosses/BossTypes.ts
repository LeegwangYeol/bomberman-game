/**
 * BossTypes.ts — Universal types and interfaces for Boss Subsystem
 */

export const BossState = {
  INTRO: 'INTRO',
  PHASE_1: 'PHASE_1',
  INTERMISSION: 'INTERMISSION',
  PHASE_2: 'PHASE_2',
  ENRAGED: 'ENRAGED',
  STUNNED: 'STUNNED',
  DEFEATED: 'DEFEATED',
} as const;

export type BossState = typeof BossState[keyof typeof BossState];

export type BossId =
  | 'king_gummy_bear'
  | 'captain_nibbles'
  | 'queen_bee_cupcake'
  | 'boss_gummy_bear'
  | 'boss_hamster_nibbles'
  | 'boss_queen_bee';

export const TelegraphTier = {
  NONE: 0,
  YELLOW: 1,
  AMBER: 2,
  RED_FLASH: 3,
  TIER_1_PRE_WARNING: 1,
  TIER_2_ACTIVE_THREAT: 2,
  TIER_3_IMMINENT_IMPACT: 3,
} as const;

export type TelegraphTier = typeof TelegraphTier[keyof typeof TelegraphTier];

export interface BossThreatAlert {
  id: string;
  title: string;
  subtitle: string;
  level: 'info' | 'warning' | 'danger' | 'critical';
  icon: string;
  durationMs: number;
  remainingMs: number;
}

export interface BossHUDState {
  isActive: boolean;
  bossId: BossId | '';
  name: string;
  title: string;
  avatarEmoji: string;
  themeColor: string; // Hex color for glow and border
  state: BossState;

  // Health & Phase Segmentation
  currentHp: number;
  maxHp: number;
  phase: number;
  maxPhase: number;
  phaseHpSegments: number[]; // e.g. [3, 3, 3] for King Gummy Bear
  activeSegmentIndex: number;
  activeSegmentHp: number;
  activeSegmentMaxHp: number;

  // Enrage & Berserk Gauge
  enrageGauge: number; // 0 to 100 percentage
  isEnraged: boolean;

  // Stun & Tactical Vulnerability Window
  isStunned: boolean;
  stunDurationMs: number;
  stunRemainingMs: number;
  stunReason: string;

  // Combo Buffer Status
  comboHits: number;
  isComboWindowActive: boolean;
  comboWindowRemainingMs: number;

  // Real-Time Threat Alert Banner
  activeAlert: BossThreatAlert | null;
}

export const BossProjectileType = {
  GATLING_SEED: 0,
  CANDY_STINGER: 1,
  EMP_MINE: 2,
  POLLEN_POD: 3,
  FALLING_CANDY: 4,
} as const;

export type BossProjectileType = typeof BossProjectileType[keyof typeof BossProjectileType];

export interface BossProjectile {
  id: number;
  active: boolean;
  type: BossProjectileType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  timerMs: number;
  maxDurationMs: number;
  homing: boolean;
  targetX: number;
  targetY: number;
}

export interface BossShockwave {
  id: number;
  active: boolean;
  originX: number;
  originY: number;
  currentRadius: number;
  maxRadius: number;
  expansionSpeed: number;
  damage: number;
  affectedTilesBitmask: Uint8Array; // 195 cells bitmask
}

export interface BossMinion {
  id: number;
  active: boolean;
  type: 'GUMMY_CUB' | 'WORKER_BEE';
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  state: number;
  targetTileIdx: number;
  carriedBombId: number;
}

export interface TelegraphTile {
  id: number;
  active: boolean;
  row: number;
  col: number;
  tier: 1 | 2 | 3;
  timerMs: number;
  durationMs: number;
}
