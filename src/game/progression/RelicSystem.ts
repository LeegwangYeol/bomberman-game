/**
 * RelicSystem.ts — Equippable Relics, Synergies, and Proc Trigger Subsystem
 */

import { RelicId } from './ProgressionTypes.ts';
import type {
  RelicDefinition,
  RelicSynergy,
  AppliedPerkBonuses,
} from './ProgressionTypes.ts';

/* ==============================================================================
 * 8 EQUIPPABLE RELIC DEFINITIONS
 * ============================================================================== */

export const RELIC_CATALOG: Record<RelicId, RelicDefinition> = {
  [RelicId.POCKET_CHRONOMETER]: {
    id: RelicId.POCKET_CHRONOMETER,
    name: 'Pocket Chronometer',
    icon: '⏱️',
    rarity: 'rare',
    description: 'Bends local time dilation when match pressure peaks.',
    mechanics: 'Slows all enemy velocities by 20% during the final 30 seconds of any match or crisis countdown.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.MAGNETRON_DIAL],
    synergyName: 'Chrono Attraction',
    synergyDescription: 'During the final 30 seconds, item magnet pull radius doubles from 4 to 8 tiles.',
  },
  [RelicId.GELATINOUS_CORE]: {
    id: RelicId.GELATINOUS_CORE,
    name: 'Gelatinous Core',
    icon: '🍮',
    rarity: 'common',
    description: 'Imbues the player body with hyper-elastic royal gummy jelly.',
    mechanics: 'Bouncing or sliding off walls emits a mini-shockwave knocking back enemies within 1.5 tiles and stunning them for 0.5s.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.CLOCKWORK_SPRING],
    synergyName: 'Kinetic Pinball',
    synergyDescription: 'Wall knockback range increases to 2.5 tiles; kicked bombs ricochet off walls twice at +50% velocity.',
  },
  [RelicId.PYROCLASTIC_PRISM]: {
    id: RelicId.PYROCLASTIC_PRISM,
    name: 'Pyroclastic Prism',
    icon: '💎',
    rarity: 'rare',
    description: 'Refracts explosive flames into concentrated crystalline fire shards.',
    mechanics: 'Bomb detonations cast 4 diagonal spark shards traveling 2 tiles outward, igniting secondary explosions.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.VOID_SINGULARITY_LENS],
    synergyName: 'Cosmic Supernova',
    synergyDescription: 'Diagonal shards bend toward enemies pulled into void vortexes, dealing double damage.',
  },
  [RelicId.MAGNETRON_DIAL]: {
    id: RelicId.MAGNETRON_DIAL,
    name: 'Magnetron Dial',
    icon: '🧭',
    rarity: 'common',
    description: 'Generates a confectionery polarity field drawing treats toward the carrier.',
    mechanics: 'Dropped power-ups and Star Candies within 4 tiles are magnetically drawn directly to the player.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.POCKET_CHRONOMETER],
    synergyName: 'Chrono Attraction',
    synergyDescription: 'Magnet pull speed +100%; item collection extends remaining time by +1 second (up to +15s max).',
  },
  [RelicId.VAMPIRIC_CONFECTION]: {
    id: RelicId.VAMPIRIC_CONFECTION,
    name: 'Vampiric Confection',
    icon: '🧛',
    rarity: 'epic',
    description: 'Siphons the crystallized sweetness of fallen foes.',
    mechanics: 'Defeating 5 enemies without taking damage restores 1 Bubble Shield charge.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.SOLAR_CAPACITOR],
    synergyName: 'Radiant Leech',
    synergyDescription: 'Restores overshield upon 3 kills instead of 5, and charging Solar Shield is 50% faster.',
  },
  [RelicId.SOLAR_CAPACITOR]: {
    id: RelicId.SOLAR_CAPACITOR,
    name: 'Solar Capacitor',
    icon: '☀️',
    rarity: 'rare',
    description: 'Stores coronal thermal energy in open corridors.',
    mechanics: 'Standing in open unobstructed corridors charges a temporary radiant overshield over 8.0 seconds.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.VAMPIRIC_CONFECTION],
    synergyName: 'Radiant Leech',
    synergyDescription: 'Radiant overshield provides immunity to floor heat hazards and deals 1 shock damage to colliding enemies.',
  },
  [RelicId.VOID_SINGULARITY_LENS]: {
    id: RelicId.VOID_SINGULARITY_LENS,
    name: 'Void Singularity Lens',
    icon: '🌀',
    rarity: 'epic',
    description: 'Microscopic tear in reality condensed into a focusing monocle.',
    mechanics: 'Placed bombs generate a gravitational vortex, pulling nearby enemies 1 tile inward before detonating.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.PYROCLASTIC_PRISM],
    synergyName: 'Cosmic Supernova',
    synergyDescription: 'Gravitational vortex range expanded to 2.5 tiles and briefly roots pulled enemies for 1.0s.',
  },
  [RelicId.CLOCKWORK_SPRING]: {
    id: RelicId.CLOCKWORK_SPRING,
    name: 'Clockwork Spring',
    icon: '⚙️',
    rarity: 'rare',
    description: 'Tempered brass torsion spring from the Toy Rebellion.',
    mechanics: 'Kicking a bomb accelerates its sliding speed to 450 px/s and pierces through 1 soft block.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.GELATINOUS_CORE],
    synergyName: 'Kinetic Pinball',
    synergyDescription: 'Kicked bombs explode with +1 tile blast radius if they collide with an enemy.',
  },
};

export const SYNERGY_DEFINITIONS: RelicSynergy[] = [
  {
    relicA: RelicId.VAMPIRIC_CONFECTION,
    relicB: RelicId.SOLAR_CAPACITOR,
    name: 'Radiant Leech',
    icon: '☀️🧛',
    description: 'Shield restore threshold reduced from 5 to 3 kills; Solar Capacitor charges in 4s instead of 8s.',
  },
  {
    relicA: RelicId.GELATINOUS_CORE,
    relicB: RelicId.CLOCKWORK_SPRING,
    name: 'Kinetic Pinball',
    icon: '🍮⚙️',
    description: 'Wall bounce knockback range expanded to 2.5 tiles; kicked bombs pierce 2 soft blocks.',
  },
  {
    relicA: RelicId.PYROCLASTIC_PRISM,
    relicB: RelicId.VOID_SINGULARITY_LENS,
    name: 'Cosmic Supernova',
    icon: '💎🌀',
    description: 'Void vortex pulls enemies into intersection points of diagonal flame shards.',
  },
  {
    relicA: RelicId.POCKET_CHRONOMETER,
    relicB: RelicId.MAGNETRON_DIAL,
    name: 'Chrono Attraction',
    icon: '⏱️🧭',
    description: 'Final 30s doubles magnet range to 8 tiles and items grant +1s time extension.',
  },
];

/* ==============================================================================
 * RELIC SYSTEM MANAGER
 * ============================================================================== */

export class RelicManager {
  private equippedRelics: RelicId[] = [];
  private discoveredRelics: Set<RelicId> = new Set();
  private maxSlots: number = 1;

  // Internal Cooldown Tracking (Edge Case 21: 500ms ICD loop protection)
  private lastProcTimes: Map<string, number> = new Map();

  // State trackers for specific relics
  public vampiricKillStreak: number = 0;
  public solarChargeElapsedMs: number = 0;
  public hasSolarShield: boolean = false;

  constructor(initialEquipped: RelicId[] = [], maxSlots: number = 1) {
    this.maxSlots = maxSlots;
    for (const r of initialEquipped) {
      this.equipRelic(r);
    }
  }

  public setMaxSlots(slots: number): void {
    this.maxSlots = Math.max(1, Math.min(2, slots));
    while (this.equippedRelics.length > this.maxSlots) {
      this.equippedRelics.pop();
    }
  }

  public getMaxSlots(): number {
    return this.maxSlots;
  }

  public getEquippedRelics(): RelicId[] {
    return [...this.equippedRelics];
  }

  public getDiscoveredRelics(): RelicId[] {
    return Array.from(this.discoveredRelics);
  }

  public discoverRelic(relicId: RelicId): void {
    if (RELIC_CATALOG[relicId]) {
      this.discoveredRelics.add(relicId);
    }
  }

  public isEquipped(relicId: RelicId): boolean {
    return this.equippedRelics.includes(relicId);
  }

  public equipRelic(relicId: RelicId): { success: boolean; error?: string } {
    if (!RELIC_CATALOG[relicId]) {
      return { success: false, error: 'Unknown relic ID' };
    }
    if (this.isEquipped(relicId)) {
      return { success: false, error: 'Relic already equipped' };
    }
    if (this.equippedRelics.length >= this.maxSlots) {
      return { success: false, error: `Relic slots full (max ${this.maxSlots})` };
    }

    this.equippedRelics.push(relicId);
    this.discoverRelic(relicId);
    return { success: true };
  }

  public unequipRelic(relicId: RelicId): boolean {
    const idx = this.equippedRelics.indexOf(relicId);
    if (idx === -1) return false;
    this.equippedRelics.splice(idx, 1);
    return true;
  }

  /**
   * Check active synergies
   */
  public getActiveSynergies(): RelicSynergy[] {
    const synergies: RelicSynergy[] = [];
    for (const s of SYNERGY_DEFINITIONS) {
      if (this.isEquipped(s.relicA) && this.isEquipped(s.relicB)) {
        synergies.push(s);
      }
    }
    return synergies;
  }

  public hasSynergy(relicA: RelicId, relicB: RelicId): boolean {
    return this.isEquipped(relicA) && this.isEquipped(relicB);
  }

  /**
   * Internal Cooldown Guard (500ms) to prevent infinite loop procs (Edge Case 21)
   */
  private checkAndSetIcd(procKey: string, nowMs: number): boolean {
    const last = this.lastProcTimes.get(procKey) || 0;
    if (nowMs - last < 500) {
      return false; // Suppressed by 500ms ICD guard
    }
    this.lastProcTimes.set(procKey, nowMs);
    return true;
  }

  /* ==============================================================================
   * RUNTIME RELIC TRIGGER HANDLERS
   * ============================================================================== */

  /**
   * Periodic tick evaluation:
   * - Pocket Chronometer (slows enemies in final 30s)
   * - Solar Capacitor (charges overshield in open corridor)
   */
  public update(
    deltaMs: number,
    nowMs: number,
    matchSecondsRemaining: number,
    isInOpenCorridor: boolean
  ): {
    applyEnemySlow: boolean;
    slowRatio: number;
    solarShieldGranted: boolean;
  } {
    let applyEnemySlow = false;
    let slowRatio = 1.0;
    let solarShieldGranted = false;

    // 1. Pocket Chronometer
    if (this.isEquipped(RelicId.POCKET_CHRONOMETER) && matchSecondsRemaining <= 30 && matchSecondsRemaining > 0) {
      applyEnemySlow = true;
      slowRatio = 0.80; // 20% slow
    }

    // 2. Solar Capacitor
    if (this.isEquipped(RelicId.SOLAR_CAPACITOR)) {
      if (isInOpenCorridor && !this.hasSolarShield) {
        const reqDuration = this.hasSynergy(RelicId.SOLAR_CAPACITOR, RelicId.VAMPIRIC_CONFECTION) ? 4000 : 8000;
        this.solarChargeElapsedMs += deltaMs;
        if (this.solarChargeElapsedMs >= reqDuration) {
          if (this.checkAndSetIcd('solar_shield_charge', nowMs)) {
            this.hasSolarShield = true;
            this.solarChargeElapsedMs = 0;
            solarShieldGranted = true;
          }
        }
      } else if (!isInOpenCorridor) {
        // Slowly lose charge if hiding in tight corners
        this.solarChargeElapsedMs = Math.max(0, this.solarChargeElapsedMs - deltaMs * 0.5);
      }
    }

    return {
      applyEnemySlow,
      slowRatio,
      solarShieldGranted,
    };
  }

  /**
   * On Enemy Defeated
   * - Vampiric Confection: restores 1 shield charge every 5 (or 3 with synergy) kills
   */
  public onEnemyKilled(nowMs: number): { shieldGranted: boolean; currentStreak: number } {
    if (!this.isEquipped(RelicId.VAMPIRIC_CONFECTION)) {
      return { shieldGranted: false, currentStreak: 0 };
    }

    this.vampiricKillStreak++;
    const threshold = this.hasSynergy(RelicId.VAMPIRIC_CONFECTION, RelicId.SOLAR_CAPACITOR) ? 3 : 5;

    if (this.vampiricKillStreak >= threshold) {
      if (this.checkAndSetIcd('vampiric_shield_restore', nowMs)) {
        this.vampiricKillStreak = 0;
        return { shieldGranted: true, currentStreak: 0 };
      }
    }

    return { shieldGranted: false, currentStreak: this.vampiricKillStreak };
  }

  /**
   * Reset streak if player takes damage
   */
  public onPlayerDamaged(): void {
    this.vampiricKillStreak = 0;
    this.hasSolarShield = false;
    this.solarChargeElapsedMs = 0;
  }

  /**
   * On Bomb Placed
   * - Void Singularity Lens: pulls nearby enemies within 1-2.5 tiles toward bomb
   */
  public onBombPlaced(
    bombTile: { r: number; c: number },
    enemies: { id: string; r: number; c: number }[],
    nowMs: number
  ): { pulledEnemyIds: string[]; pullRadius: number } {
    if (!this.isEquipped(RelicId.VOID_SINGULARITY_LENS)) {
      return { pulledEnemyIds: [], pullRadius: 0 };
    }

    if (!this.checkAndSetIcd('void_singularity_pull', nowMs)) {
      return { pulledEnemyIds: [], pullRadius: 0 };
    }

    const radius = this.hasSynergy(RelicId.VOID_SINGULARITY_LENS, RelicId.PYROCLASTIC_PRISM) ? 2.5 : 1.5;
    const pulledEnemyIds: string[] = [];

    for (const enemy of enemies) {
      const dr = enemy.r - bombTile.r;
      const dc = enemy.c - bombTile.c;
      const dist = Math.sqrt(dr * dr + dc * dc);
      if (dist <= radius && dist > 0.1) {
        pulledEnemyIds.push(enemy.id);
      }
    }

    return { pulledEnemyIds, pullRadius: radius };
  }

  /**
   * On Bomb Exploded
   * - Pyroclastic Prism: casts 4 diagonal spark shards traveling 2 tiles
   */
  public onBombExploded(
    bombTile: { r: number; c: number },
    nowMs: number
  ): {
    spawnDiagonalShards: boolean;
    shards: { dr: number; dc: number; maxDist: number }[];
  } {
    if (!this.isEquipped(RelicId.PYROCLASTIC_PRISM)) {
      return { spawnDiagonalShards: false, shards: [] };
    }

    if (!this.checkAndSetIcd('pyroclastic_shards', nowMs)) {
      return { spawnDiagonalShards: false, shards: [] };
    }

    const maxDist = 2;
    const shards = [
      { dr: -1, dc: -1, maxDist },
      { dr: -1, dc: 1, maxDist },
      { dr: 1, dc: -1, maxDist },
      { dr: 1, dc: 1, maxDist },
    ];

    return { spawnDiagonalShards: true, shards };
  }

  /**
   * On Wall Bounce / Slide
   * - Gelatinous Core: knocks back enemies within 1.5 tiles (2.5 with synergy) and stuns for 0.5s
   */
  public onWallBounce(
    playerTile: { r: number; c: number },
    enemies: { id: string; r: number; c: number }[],
    nowMs: number
  ): { stunnedEnemyIds: string[]; stunDurationMs: number } {
    if (!this.isEquipped(RelicId.GELATINOUS_CORE)) {
      return { stunnedEnemyIds: [], stunDurationMs: 0 };
    }

    if (!this.checkAndSetIcd('gelatinous_core_stun', nowMs)) {
      return { stunnedEnemyIds: [], stunDurationMs: 0 };
    }

    const radius = this.hasSynergy(RelicId.GELATINOUS_CORE, RelicId.CLOCKWORK_SPRING) ? 2.5 : 1.5;
    const stunnedEnemyIds: string[] = [];

    for (const enemy of enemies) {
      const dr = enemy.r - playerTile.r;
      const dc = enemy.c - playerTile.c;
      const dist = Math.sqrt(dr * dr + dc * dc);
      if (dist <= radius) {
        stunnedEnemyIds.push(enemy.id);
      }
    }

    return { stunnedEnemyIds, stunDurationMs: 500 };
  }

  /**
   * On Bomb Kicked
   * - Clockwork Spring: accelerates sliding speed to 450 px/s and pierces through 1 soft block
   */
  public onBombKicked(nowMs: number): { velocityPxPerSec: number; softBlockPierceCount: number } {
    if (!this.isEquipped(RelicId.CLOCKWORK_SPRING)) {
      return { velocityPxPerSec: 200, softBlockPierceCount: 0 };
    }

    if (!this.checkAndSetIcd('clockwork_spring_kick', nowMs)) {
      return { velocityPxPerSec: 200, softBlockPierceCount: 0 };
    }

    const pierces = this.hasSynergy(RelicId.CLOCKWORK_SPRING, RelicId.GELATINOUS_CORE) ? 2 : 1;
    return {
      velocityPxPerSec: 450,
      softBlockPierceCount: pierces,
    };
  }

  /**
   * On Magnet Scan (Magnetron Dial)
   */
  public getMagnetRadiusTiles(matchSecondsRemaining: number): number {
    if (!this.isEquipped(RelicId.MAGNETRON_DIAL)) {
      return 0;
    }
    // Synergy: Chrono Attraction doubles radius in final 30s to 8 tiles
    if (
      this.hasSynergy(RelicId.MAGNETRON_DIAL, RelicId.POCKET_CHRONOMETER) &&
      matchSecondsRemaining <= 30 &&
      matchSecondsRemaining > 0
    ) {
      return 8;
    }
    return 4;
  }

  /* ==============================================================================
   * RELIC DROP ROLLS
   * ============================================================================== */

  /**
   * Roll for a relic drop from a chest or defeated boss/elite
   */
  public static rollRelicDrop(
    isBoss: boolean,
    isChest: boolean,
    perkBonuses: AppliedPerkBonuses,
    seed: number = 0
  ): RelicId | null {
    const allRelics = Object.keys(RELIC_CATALOG) as RelicId[];
    const rand = ((seed || Date.now()) % 1000) / 1000;

    let dropChance = 0.05 + perkBonuses.relicDropChanceBonus;
    if (isBoss) {
      dropChance = 1.0; // Boss defeat gives guaranteed relic drop!
    } else if (isChest) {
      dropChance = 0.35 + perkBonuses.relicDropChanceBonus;
    }

    if (rand <= dropChance) {
      const idx = Math.floor((((seed || Date.now()) >> 3) % allRelics.length + allRelics.length) % allRelics.length);
      return allRelics[idx];
    }
    return null;
  }
}
