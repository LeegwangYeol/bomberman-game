/**
 * PerkTree.ts — 16-Node Confectionery Perk Tree across 4 Branches
 */

import { PerkBranch } from './ProgressionTypes.ts';
import type {
  PerkNode,
  PerkState,
  AppliedPerkBonuses,
} from './ProgressionTypes.ts';

/* ==============================================================================
 * 16 CONFECTIONERY PERK DEFINITIONS
 * ============================================================================== */

export const CONFECTIONERY_PERKS: Record<string, PerkNode> = {
  // Branch 1: Baking Mastery
  sugar_spark: {
    id: 'sugar_spark',
    name: 'Sugar Spark',
    branch: PerkBranch.BAKING,
    icon: '✨',
    maxLevel: 3,
    costs: [5, 10, 20],
    description: 'Amplifies bomb ignition energy, expanding blast radius.',
    effects: [
      '+1 Starting Bomb Blast Radius',
      '+2 Starting Bomb Blast Radius',
      '+3 Starting Bomb Blast Radius',
    ],
  },
  quick_wick: {
    id: 'quick_wick',
    name: 'Quick Wick',
    branch: PerkBranch.BAKING,
    icon: '⚡',
    maxLevel: 3,
    costs: [5, 12, 25],
    description: 'Improves wick formulation to reduce bomb placement cooldown.',
    effects: [
      'Bomb cooldown reduced by 10%',
      'Bomb cooldown reduced by 18%',
      'Bomb cooldown reduced by 25%',
    ],
  },
  chain_reaction: {
    id: 'chain_reaction',
    name: 'Chain Reaction',
    branch: PerkBranch.BAKING,
    icon: '🎆',
    maxLevel: 2,
    costs: [10, 25],
    description: 'Rewards rapid multi-bomb detonations with score and ultimate charge.',
    effects: [
      '+25% chain combo score bonus, +5% ult charge per chained bomb',
      '+50% chain combo score bonus, +10% ult charge per chained bomb',
    ],
  },
  master_confectioner: {
    id: 'master_confectioner',
    name: 'Master Confectioner',
    branch: PerkBranch.BAKING,
    icon: '👑',
    maxLevel: 1,
    costs: [40],
    description: 'Unlocks ultimate confection pockets, raising maximum bomb capacity to 9.',
    effects: ['Maximum Bomb Capacity increased to 9'],
    prerequisites: [{ perkId: 'sugar_spark', minLevel: 2 }],
  },

  // Branch 2: Sugar Rush (Mobility)
  bouncy_soles: {
    id: 'bouncy_soles',
    name: 'Bouncy Soles',
    branch: PerkBranch.SUGAR_RUSH,
    icon: '👟',
    maxLevel: 3,
    costs: [5, 10, 20],
    description: 'Gelatin soles give a permanent boost to base movement velocity.',
    effects: [
      '+10 px/s Base Movement Speed',
      '+20 px/s Base Movement Speed',
      '+30 px/s Base Movement Speed',
    ],
  },
  corner_magnet: {
    id: 'corner_magnet',
    name: 'Corner Magnet',
    branch: PerkBranch.SUGAR_RUSH,
    icon: '🧲',
    maxLevel: 2,
    costs: [8, 18],
    description: 'Expands corridor corner-sliding tolerance for seamless navigation.',
    effects: [
      'Corner-sliding tolerance expanded to 11px',
      'Corner-sliding tolerance expanded to 14px',
    ],
  },
  dash_decoy: {
    id: 'dash_decoy',
    name: 'Dash Decoy',
    branch: PerkBranch.SUGAR_RUSH,
    icon: '🎭',
    maxLevel: 1,
    costs: [30],
    description: 'Dashing leaves behind a sweet confection decoy drawing enemy aggro for 1.5s.',
    effects: ['Dash leaves a 1.5s confectionery decoy that taunts nearby enemies'],
    prerequisites: [{ perkId: 'bouncy_soles', minLevel: 2 }],
  },
  hyper_sprint: {
    id: 'hyper_sprint',
    name: 'Hyper-Sprint',
    branch: PerkBranch.SUGAR_RUSH,
    icon: '💨',
    maxLevel: 1,
    costs: [35],
    description: 'Reduces dash cooldown and grants an adrenaline speed burst upon completion.',
    effects: ['Dash cooldown reduced by 1.0s, +20% speed burst for 1.0s post-dash'],
    prerequisites: [{ perkId: 'bouncy_soles', minLevel: 2 }],
  },

  // Branch 3: Resilience (Defense)
  sugar_coating: {
    id: 'sugar_coating',
    name: 'Sugar Coating',
    branch: PerkBranch.RESILIENCE,
    icon: '🫧',
    maxLevel: 2,
    costs: [10, 25],
    description: 'Hard candy shell provides protective Bubble Shields at run start.',
    effects: [
      'Start every run with 1 Bubble Shield',
      'Start every run with 2 Bubble Shields',
    ],
  },
  second_wind: {
    id: 'second_wind',
    name: 'Second Wind',
    branch: PerkBranch.RESILIENCE,
    icon: '💖',
    maxLevel: 1,
    costs: [45],
    description: 'Once per run, survive fatal damage with 1 HP and 3.0s golden invulnerability.',
    effects: ['Once per run, survive fatal blow with 1 HP + 3.0s invulnerability shield'],
  },
  hazard_buffer: {
    id: 'hazard_buffer',
    name: 'Hazard Buffer',
    branch: PerkBranch.RESILIENCE,
    icon: '🛡️',
    maxLevel: 2,
    costs: [8, 16],
    description: 'Provides resistance against floor hazard slowdowns (honey, gelatin, void creep).',
    effects: [
      'Ground hazard slowdown reduced by 50%',
      'Ground hazard slowdown reduced by 80%',
    ],
  },
  titan_heart: {
    id: 'titan_heart',
    name: 'Titan Heart',
    branch: PerkBranch.RESILIENCE,
    icon: '❤️',
    maxLevel: 1,
    costs: [50],
    description: 'Forges a permanent extra Heart container for all runs.',
    effects: ['Permanent +1 Max Heart Container (4 Hearts total)'],
    prerequisites: [{ perkId: 'sugar_coating', minLevel: 1 }],
  },

  // Branch 4: Alchemy & Luck (Utility)
  sweet_tooth: {
    id: 'sweet_tooth',
    name: 'Sweet Tooth',
    branch: PerkBranch.ALCHEMY,
    icon: '🍭',
    maxLevel: 3,
    costs: [5, 10, 20],
    description: 'Increases the chance of soft blocks dropping rare items and power-ups.',
    effects: [
      '+5% Soft Block Item Drop Rate',
      '+10% Soft Block Item Drop Rate',
      '+15% Soft Block Item Drop Rate',
    ],
  },
  merchant_discount: {
    id: 'merchant_discount',
    name: 'Merchant Discount',
    branch: PerkBranch.ALCHEMY,
    icon: '🏷️',
    maxLevel: 2,
    costs: [8, 18],
    description: 'Friendly rapport with Madame Bonbon reduces all shop prices.',
    effects: [
      'Madame Bonbon shop prices reduced by 15%',
      'Madame Bonbon shop prices reduced by 30%',
    ],
  },
  relic_resonance: {
    id: 'relic_resonance',
    name: 'Relic Resonance',
    branch: PerkBranch.ALCHEMY,
    icon: '🔮',
    maxLevel: 2,
    costs: [15, 35],
    description: 'Deepens connection with ancient confections, unlocking equippable relic slots.',
    effects: [
      '+10% Relic Drop Chance from Elite enemies and Chests',
      '+20% Relic Drop Chance and unlocks 2nd Equippable Relic Slot',
    ],
  },
  golden_touch: {
    id: 'golden_touch',
    name: 'Golden Touch',
    branch: PerkBranch.ALCHEMY,
    icon: '🪙',
    maxLevel: 1,
    costs: [40],
    description: 'Breakable soft blocks have a chance to transmute into Gilded Chests.',
    effects: ['5% chance breakable blocks turn into Gilded Chests with rare loot'],
    prerequisites: [{ perkId: 'sweet_tooth', minLevel: 2 }],
  },
};

/* ==============================================================================
 * PERK TREE MANAGER
 * ============================================================================== */

export class PerkTreeManager {
  /**
   * Check if a perk can be upgraded
   */
  static canUpgradePerk(
    perkId: string,
    currentPerks: PerkState,
    availableEssence: number
  ): { canUpgrade: boolean; cost: number; reason?: string } {
    const node = CONFECTIONERY_PERKS[perkId];
    if (!node) {
      return { canUpgrade: false, cost: 0, reason: 'Unknown perk ID' };
    }

    const currentLevel = currentPerks[perkId] || 0;
    if (currentLevel >= node.maxLevel) {
      return { canUpgrade: false, cost: 0, reason: 'Perk already at maximum level' };
    }

    const cost = node.costs[currentLevel];
    if (availableEssence < cost) {
      return { canUpgrade: false, cost, reason: `Insufficient Cosmic Sugar Essence (needs ${cost} ✨)` };
    }

    // Check prerequisites
    if (node.prerequisites) {
      for (const req of node.prerequisites) {
        const reqLvl = currentPerks[req.perkId] || 0;
        if (reqLvl < req.minLevel) {
          const reqNode = CONFECTIONERY_PERKS[req.perkId];
          const reqName = reqNode ? reqNode.name : req.perkId;
          return {
            canUpgrade: false,
            cost,
            reason: `Requires ${reqName} Level ${req.minLevel} (currently Level ${reqLvl})`,
          };
        }
      }
    }

    return { canUpgrade: true, cost };
  }

  /**
   * Purchase/Upgrade a perk, deducting essence
   */
  static upgradePerk(
    perkId: string,
    currentPerks: PerkState,
    availableEssence: number
  ): { success: boolean; newPerks: PerkState; remainingEssence: number; error?: string } {
    const check = this.canUpgradePerk(perkId, currentPerks, availableEssence);
    if (!check.canUpgrade) {
      return {
        success: false,
        newPerks: { ...currentPerks },
        remainingEssence: availableEssence,
        error: check.reason,
      };
    }

    const currentLevel = currentPerks[perkId] || 0;
    const newPerks: PerkState = {
      ...currentPerks,
      [perkId]: currentLevel + 1,
    };
    const remainingEssence = availableEssence - check.cost;

    return {
      success: true,
      newPerks,
      remainingEssence,
    };
  }

  /**
   * Calculate total spent essence for a set of perks
   */
  static calculateSpentEssence(perks: PerkState): number {
    let total = 0;
    for (const [id, level] of Object.entries(perks)) {
      const node = CONFECTIONERY_PERKS[id];
      if (!node) continue;
      for (let i = 0; i < Math.min(level, node.maxLevel); i++) {
        total += node.costs[i];
      }
    }
    return total;
  }

  /**
   * Respec all perks: resets all perk levels to 0 and refunds 100% of spent Cosmic Sugar Essence
   */
  static respecAllPerks(
    currentPerks: PerkState,
    currentEssence: number
  ): { newPerks: PerkState; refundedEssence: number; totalEssence: number } {
    const spent = this.calculateSpentEssence(currentPerks);
    return {
      newPerks: {},
      refundedEssence: spent,
      totalEssence: currentEssence + spent,
    };
  }

  /**
   * Calculate all active gameplay bonuses provided by the current perk tree
   */
  static calculateAppliedBonuses(perks: PerkState): AppliedPerkBonuses {
    const p = (id: string) => perks[id] || 0;

    // Sugar Spark: +1, +2, +3 blast radius
    const startingBlastRadiusBonus = Math.min(3, p('sugar_spark'));

    // Quick Wick: -10%, -18%, -25% bomb cooldown
    const qWickLvl = p('quick_wick');
    const bombCooldownReduction = qWickLvl === 1 ? 0.10 : qWickLvl === 2 ? 0.18 : qWickLvl >= 3 ? 0.25 : 0;

    // Chain Reaction: +25%/+50% score, +5%/+10% ult charge
    const chainLvl = p('chain_reaction');
    const chainScoreBonus = chainLvl * 0.25;
    const chainUltChargeBonus = chainLvl * 0.05;

    // Master Confectioner: max bomb capacity 9 (default is 6)
    const maxBombCapacity = p('master_confectioner') >= 1 ? 9 : 6;

    // Bouncy Soles: +10, +20, +30 px/s
    const baseSpeedBonus = Math.min(3, p('bouncy_soles')) * 10;

    // Corner Magnet: 8px default, 11px lvl 1, 14px lvl 2
    const cornerLvl = p('corner_magnet');
    const cornerSlideTolerance = cornerLvl === 1 ? 11 : cornerLvl >= 2 ? 14 : 8;

    // Dash Decoy & Hyper Sprint
    const hasDashDecoy = p('dash_decoy') >= 1;
    const dashCooldownReductionMs = p('hyper_sprint') >= 1 ? 1000 : 0;
    const dashSpeedBurstRatio = p('hyper_sprint') >= 1 ? 0.20 : 0;

    // Sugar Coating & Second Wind
    const startingShields = Math.min(2, p('sugar_coating'));
    const hasSecondWind = p('second_wind') >= 1;

    // Hazard Buffer: -50%, -80% slowdown
    const hazardLvl = p('hazard_buffer');
    const groundSlowdownReduction = hazardLvl === 1 ? 0.50 : hazardLvl >= 2 ? 0.80 : 0;

    // Titan Heart: +1 Heart Container
    const extraHeartContainer = p('titan_heart') >= 1 ? 1 : 0;

    // Sweet Tooth: +5%, +10%, +15% drop rate
    const itemDropRateBonus = Number((Math.min(3, p('sweet_tooth')) * 0.05).toFixed(2));

    // Merchant Discount: -15%, -30%
    const discLvl = p('merchant_discount');
    const shopDiscountRatio = discLvl === 1 ? 0.15 : discLvl >= 2 ? 0.30 : 0;

    // Relic Resonance: +10%/+20% drop chance, Level 2 unlocks 2nd slot
    const relicLvl = p('relic_resonance');
    const relicDropChanceBonus = Number((Math.min(2, relicLvl) * 0.10).toFixed(2));
    const maxRelicSlots = relicLvl >= 2 ? 2 : 1;

    // Golden Touch: 5% chance breakable blocks turn into Gilded Chests
    const gildedChestChance = p('golden_touch') >= 1 ? 0.05 : 0;

    return {
      startingBlastRadiusBonus,
      bombCooldownReduction,
      chainScoreBonus,
      chainUltChargeBonus,
      maxBombCapacity,
      baseSpeedBonus,
      cornerSlideTolerance,
      hasDashDecoy,
      dashCooldownReductionMs,
      dashSpeedBurstRatio,
      startingShields,
      hasSecondWind,
      groundSlowdownReduction,
      extraHeartContainer,
      itemDropRateBonus,
      shopDiscountRatio,
      relicDropChanceBonus,
      maxRelicSlots,
      gildedChestChance,
    };
  }

  /**
   * Trigger Second Wind when fatal damage is sustained (Edge Case 19)
   */
  static triggerSecondWind(
    bonuses: AppliedPerkBonuses,
    alreadyConsumed: boolean
  ): { saved: boolean; remainingHp: number; invulnDurationMs: number; speedBurstBonus: number } {
    if (bonuses.hasSecondWind && !alreadyConsumed) {
      return {
        saved: true,
        remainingHp: 1,
        invulnDurationMs: 3000,
        speedBurstBonus: 0.50, // +50% speed burst for 3.0s
      };
    }
    return {
      saved: false,
      remainingHp: 0,
      invulnDurationMs: 0,
      speedBurstBonus: 0,
    };
  }
}
