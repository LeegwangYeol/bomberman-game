/**
 * GameModes.ts — Game Mode Handlers, Gauntlet Chambers, and Boss Rush Logic
 */

import {
  GameModeType,
  GAME_MODE_DEFINITIONS,
  ChamberType,
} from './ProgressionTypes.ts';
import type {
  GameModeInfo,
  BoonOption,
  AppliedBoonBonuses,
} from './ProgressionTypes.ts';

/* ==============================================================================
 * BOSS RUSH SPECIFICATIONS
 * ============================================================================== */

export const BOSS_RUSH_SEQUENCE = [
  { id: 'king_gummy_bear', name: 'King Gummy Bear', title: 'Colossus of Gelatin', icon: '👑🐻', maxHp: 9 },
  { id: 'captain_nibbles', name: 'Captain Nibbles', title: 'Mecha Hamster', icon: '🐹⚙️', maxHp: 10 },
  { id: 'queen_bee_cupcake', name: 'Queen Mellifera', title: 'Queen Bee Cupcake', icon: '🧁🐝', maxHp: 12 },
  { id: 'steam_toy_titan', name: 'Steam Toy Titan', title: 'Clockwork Arch-Inventor', icon: '🦾🤖', maxHp: 16 },
  { id: 'void_devourer_avatar', name: 'Void Devourer Avatar', title: 'Singularity Avatar', icon: '🪐🌀', maxHp: 14 },
] as const;

export const BOSS_RUSH_MEDAL_LIMITS_SEC = {
  PLATINUM: 300, // < 5 minutes
  GOLD: 420,     // < 7 minutes
  SILVER: 600,   // < 10 minutes
} as const;

export type BossRushMedal = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';

export function getBossRushMedal(elapsedSeconds: number): BossRushMedal {
  if (elapsedSeconds < BOSS_RUSH_MEDAL_LIMITS_SEC.PLATINUM) return 'PLATINUM';
  if (elapsedSeconds < BOSS_RUSH_MEDAL_LIMITS_SEC.GOLD) return 'GOLD';
  if (elapsedSeconds < BOSS_RUSH_MEDAL_LIMITS_SEC.SILVER) return 'SILVER';
  return 'BRONZE';
}

/* ==============================================================================
 * ROGUELITE BOON DRAFT CATALOG (ENDLESS GAUNTLET)
 * ============================================================================== */

export const ROGUELITE_BOONS_CATALOG: BoonOption[] = [
  {
    id: 'sugar_infusion',
    name: 'Sugar Infusion',
    icon: '⚡',
    rarity: 'common',
    description: '+15 px/s Movement Speed for the rest of the gauntlet.',
    apply: (b) => { b.extraSpeed += 15; },
  },
  {
    id: 'extra_confection',
    name: 'Extra Confection',
    icon: '💣',
    rarity: 'common',
    description: '+1 Maximum Bomb capacity.',
    apply: (b) => { b.extraBombs += 1; },
  },
  {
    id: 'bubble_barrier',
    name: 'Bubble Barrier',
    icon: '🫧',
    rarity: 'rare',
    description: '+1 Bubble Shield protecting against 1 fatal blast.',
    apply: (b) => { b.extraShield += 1; },
  },
  {
    id: 'hot_fudge_core',
    name: 'Hot Fudge Core',
    icon: '🔥',
    rarity: 'rare',
    description: '+1 Bomb Blast Damage to all bosses and armored enemies.',
    apply: (b) => { b.extraDamage += 1; },
  },
  {
    id: 'golden_macaron',
    name: 'Golden Macaron',
    icon: '🍬',
    rarity: 'common',
    description: 'Instantly gain +25 Star Candies.',
    apply: (b) => { b.bonusCandies += 25; },
  },
  {
    id: 'cosmic_resonance',
    name: 'Cosmic Resonance',
    icon: '✨',
    rarity: 'epic',
    description: 'Ultimate skill charges 30% faster.',
    apply: (b) => { b.ultChargeMultiplier += 0.30; },
  },
];

/* ==============================================================================
 * GAUNTLET CHAMBER DETERMINATION
 * ============================================================================== */

export function determineChamberType(chamberNumber: number): ChamberType {
  const c = Math.max(1, Math.floor(chamberNumber));
  // Every 5th chamber is an Epic Boss Arena
  if (c % 5 === 0) {
    return ChamberType.BOSS;
  }
  // Deterministic procedural distribution for remaining chambers
  const mod = c % 10;
  if (mod === 3 || mod === 7) {
    return ChamberType.ELITE;
  }
  if (mod === 4 || mod === 8) {
    return ChamberType.CRISIS;
  }
  return ChamberType.STANDARD;
}

/* ==============================================================================
 * GAME MODE CONTROLLER
 * ============================================================================== */

export class GameModeManager {
  public currentMode: GameModeType;
  public wave: number = 1;
  public chamberNumber: number = 1;
  public score: number = 0;
  public starCandies: number = 0;
  public cosmicEssence: number = 0;

  // Crisis Survival mode states
  public survivalElapsedMs: number = 0;
  public nextCrisisCountdownMs: number = 60000; // Strikes every 60s
  public nextDropPodCountdownMs: number = 45000; // Emergency drop pod every 45s
  public crisesPurifiedCount: number = 0;
  public dropPodsCollected: number = 0;

  // Boss Rush mode states
  public bossRushIndex: number = 0; // 0..4
  public bossRushElapsedMs: number = 0;
  public isAtRestStop: boolean = false;
  public restStopTimerMs: number = 0;
  public bossRushCompleted: boolean = false;

  // Endless Gauntlet mode states
  public activeBoons: AppliedBoonBonuses = {
    extraBombs: 0,
    extraSpeed: 0,
    extraShield: 0,
    extraDamage: 0,
    bonusCandies: 0,
    ultChargeMultiplier: 1.0,
  };
  public currentBoonDraft: BoonOption[] = [];
  public isAwaitingBoonSelection: boolean = false;
  public unlockedCheckpoints: number[] = [1];

  constructor(mode: GameModeType = GameModeType.STANDARD) {
    this.currentMode = mode;
    this.reset(mode);
  }

  public getModeInfo(): GameModeInfo {
    return GAME_MODE_DEFINITIONS[this.currentMode];
  }

  public reset(mode?: GameModeType): void {
    if (mode) {
      this.currentMode = mode;
    }
    this.wave = 1;
    this.chamberNumber = 1;
    this.score = 0;
    this.starCandies = 0;
    this.cosmicEssence = 0;

    this.survivalElapsedMs = 0;
    this.nextCrisisCountdownMs = 60000;
    this.nextDropPodCountdownMs = 45000;
    this.crisesPurifiedCount = 0;
    this.dropPodsCollected = 0;

    this.bossRushIndex = 0;
    this.bossRushElapsedMs = 0;
    this.isAtRestStop = false;
    this.restStopTimerMs = 0;
    this.bossRushCompleted = false;

    this.activeBoons = {
      extraBombs: 0,
      extraSpeed: 0,
      extraShield: 0,
      extraDamage: 0,
      bonusCandies: 0,
      ultChargeMultiplier: 1.0,
    };
    this.currentBoonDraft = [];
    this.isAwaitingBoonSelection = false;
    this.unlockedCheckpoints = [1];
  }

  /**
   * Main simulation tick
   */
  public update(deltaMs: number): {
    triggerCrisis?: boolean;
    spawnDropPod?: boolean;
    restStopExpired?: boolean;
  } {
    const events: {
      triggerCrisis?: boolean;
      spawnDropPod?: boolean;
      restStopExpired?: boolean;
    } = {};

    if (this.currentMode === GameModeType.CRISIS_SURVIVAL) {
      this.survivalElapsedMs += deltaMs;

      this.nextCrisisCountdownMs -= deltaMs;
      if (this.nextCrisisCountdownMs <= 0) {
        this.nextCrisisCountdownMs = 60000; // Reset 60s cadence
        events.triggerCrisis = true;
      }

      this.nextDropPodCountdownMs -= deltaMs;
      if (this.nextDropPodCountdownMs <= 0) {
        this.nextDropPodCountdownMs = 45000; // Reset 45s cadence
        events.spawnDropPod = true;
      }
    } else if (this.currentMode === GameModeType.BOSS_RUSH) {
      if (!this.bossRushCompleted) {
        this.bossRushElapsedMs += deltaMs;
      }

      if (this.isAtRestStop) {
        this.restStopTimerMs -= deltaMs;
        if (this.restStopTimerMs <= 0) {
          this.isAtRestStop = false;
          this.restStopTimerMs = 0;
          events.restStopExpired = true;
        }
      }
    }

    return events;
  }

  /**
   * Crisis Survival Drop Pod Collection
   */
  public collectDropPod(isInventoryFull: boolean): { type: 'gear' | 'overshield'; bonusScore: number } {
    this.dropPodsCollected++;
    if (isInventoryFull) {
      this.score += 500;
      return { type: 'overshield', bonusScore: 500 };
    }
    this.score += 250;
    return { type: 'gear', bonusScore: 250 };
  }

  /**
   * Mark active crisis purified
   */
  public onCrisisPurified(): void {
    this.crisesPurifiedCount++;
    this.cosmicEssence += 15; // +15 Cosmic Essence per crisis
    this.score += 5000;
  }

  /**
   * Boss Rush: advance to next boss or rest stop
   */
  public onBossDefeated(): { isRushComplete: boolean; medal?: BossRushMedal } {
    this.cosmicEssence += 20; // +20 Cosmic Essence per boss
    this.score += 10000;

    if (this.currentMode === GameModeType.BOSS_RUSH) {
      if (this.bossRushIndex >= BOSS_RUSH_SEQUENCE.length - 1) {
        this.bossRushCompleted = true;
        const medal = getBossRushMedal(this.bossRushElapsedMs / 1000);
        return { isRushComplete: true, medal };
      }

      // Enter 20-second Madame Bonbon Rest Stop
      this.bossRushIndex++;
      this.isAtRestStop = true;
      this.restStopTimerMs = 20000; // 20s
      return { isRushComplete: false };
    }

    return { isRushComplete: false };
  }

  /**
   * Skip remaining rest stop timer
   */
  public skipRestStop(): void {
    if (this.isAtRestStop) {
      this.isAtRestStop = false;
      this.restStopTimerMs = 0;
    }
  }

  /**
   * Endless Gauntlet: clear chamber and trigger Boon Draft
   */
  public onChamberCleared(): BoonOption[] {
    this.chamberNumber++;
    this.cosmicEssence += 2; // +2 Cosmic Essence per chamber

    // Unlock checkpoints at Chambers 10, 20, 30
    if (this.chamberNumber % 10 === 0 && !this.unlockedCheckpoints.includes(this.chamberNumber)) {
      this.unlockedCheckpoints.push(this.chamberNumber);
    }

    // Generate 3-card boon draft
    const draft = this.generateBoonDraft(this.chamberNumber);
    this.currentBoonDraft = draft;
    this.isAwaitingBoonSelection = true;
    return draft;
  }

  /**
   * Select a boon from the 3-card draft
   */
  public selectBoon(boonId: string): boolean {
    const chosen = this.currentBoonDraft.find((b) => b.id === boonId);
    if (!chosen) return false;

    chosen.apply(this.activeBoons);
    this.starCandies += this.activeBoons.bonusCandies;
    this.activeBoons.bonusCandies = 0;
    this.currentBoonDraft = [];
    this.isAwaitingBoonSelection = false;
    return true;
  }

  /**
   * Generate 3 random unique boons
   */
  public generateBoonDraft(seed: number = 0): BoonOption[] {
    const catalog = [...ROGUELITE_BOONS_CATALOG];
    const draft: BoonOption[] = [];

    let s = (seed || Date.now()) % 100000;
    while (draft.length < 3 && catalog.length > 0) {
      s = (s * 9301 + 49297) % 233280;
      const idx = Math.floor((s / 233280) * catalog.length);
      draft.push(catalog.splice(idx, 1)[0]);
    }

    return draft;
  }
}
