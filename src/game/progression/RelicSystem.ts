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
 * 15 EQUIPPABLE RELIC DEFINITIONS
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
    synergyPartners: [RelicId.MAGNETRON_DIAL, RelicId.PSIONIC_FEEDBACK_CRYSTAL],
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
    synergyPartners: [RelicId.VOID_SINGULARITY_LENS, RelicId.CRYO_GLACIAL_CORE],
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
    synergyPartners: [RelicId.POCKET_CHRONOMETER, RelicId.ORBITAL_TARGETING_CORE],
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
    synergyPartners: [RelicId.PYROCLASTIC_PRISM, RelicId.QUANTUM_WARP_PRISM],
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
  [RelicId.ORBITAL_TARGETING_CORE]: {
    id: RelicId.ORBITAL_TARGETING_CORE,
    name: 'Orbital Targeting Core',
    icon: '🛰️',
    rarity: 'epic',
    description: 'Salvaged fire-control subcore from the Orbital Dreadnought.',
    mechanics: 'Bomb detonations paint orbital crosshairs; after 1.2s, a micro-kinetic lance strikes the tile, dealing 150 damage to enemies.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.MAGNETRON_DIAL],
    synergyName: 'Orbital Ion Strike',
    synergyDescription: 'Micro-kinetic lance expands to a 3-tile cross pattern and draws items and star candies within 8 tiles.',
  },
  [RelicId.PSIONIC_FEEDBACK_CRYSTAL]: {
    id: RelicId.PSIONIC_FEEDBACK_CRYSTAL,
    name: 'Psionic Feedback Crystal',
    icon: '🔮🧠',
    rarity: 'epic',
    description: 'Resonates with telepathic frequencies, deflecting psychic distortions.',
    mechanics: 'Bomb detonations emit a 2-tile psionic pulse dispelling illusions and confusing enemies for 1.5s.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.POCKET_CHRONOMETER],
    synergyName: 'Precognitive Resonance',
    synergyDescription: 'During final 30s or crises, psionic pulse radius expands to 3.5 tiles and stuns confused enemies.',
  },
  [RelicId.QUANTUM_WARP_PRISM]: {
    id: RelicId.QUANTUM_WARP_PRISM,
    name: 'Quantum Warp Prism',
    icon: '🌌💎',
    rarity: 'epic',
    description: 'Extradimensional crystalline prism attuned to wormhole topology and quantum state superposition.',
    mechanics: 'Bomb detonations open a micro quantum rift at the epicenter, damaging enemies within 2.0 tiles for 75 damage and phase-shifting them for 1.2s.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.VOID_SINGULARITY_LENS],
    synergyName: 'Quantum Event Horizon',
    synergyDescription: 'Rift radius expands to 3.5 tiles, damage doubles to 150, pulls enemies to epicenter, and extends phase-shift to 2.0s.',
  },
  [RelicId.CRYO_GLACIAL_CORE]: {
    id: RelicId.CRYO_GLACIAL_CORE,
    name: 'Cryo Glacial Core',
    icon: '❄️🧊',
    rarity: 'epic',
    description: 'Sub-zero cryo containment core pulsing with absolute zero hoarfrost.',
    mechanics: 'Bomb detonations emit a 2.5-tile cryogenic frost burst, inflicting 40 frost damage and a 40% Glacial Chill slow for 2.0s.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.PYROCLASTIC_PRISM, RelicId.TESLA_OVERCHARGE_COIL],
    synergyName: 'Thermal Shock Reaction',
    synergyDescription: 'Detonating bombs triggers a rapid thermal shock reaction: chilled enemies struck by Pyroclastic flame shards suffer Thermal Shatter (+150% damage) and detonate in a 3.0-tile flash-freeze secondary frost explosion!',
  },
  [RelicId.TESLA_OVERCHARGE_COIL]: {
    id: RelicId.TESLA_OVERCHARGE_COIL,
    name: 'Tesla Overcharge Coil',
    icon: '⚡🔋',
    rarity: 'epic',
    description: 'High-voltage conductive coil that overcharges cosmic discharge upon bomb detonation.',
    mechanics: 'Bomb detonations emit chain lightning arcing to 3 targets within 3.0 tiles for 50 damage each, inflicting a 1.0s EMP shock and 50% slow, protected by a 500ms ICD guard.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.CRYO_GLACIAL_CORE, RelicId.CORROSIVE_MIASMIC_FLASK],
    synergyName: 'Electro-Cryo Superconductor',
    synergyDescription: 'Chilled enemies struck by chain lightning suffer a superconductive flash overload (3.5 tile radius, 120 damage, shield shatter, 2.0s stasis freeze).',
  },
  [RelicId.CORROSIVE_MIASMIC_FLASK]: {
    id: RelicId.CORROSIVE_MIASMIC_FLASK,
    name: 'Corrosive Miasmic Flask',
    icon: '🧪☣️',
    rarity: 'epic',
    description: 'Pressurized alchemical flask distilling concentrated neurotoxic spore miasma.',
    mechanics: 'Bomb detonations vent a 2.5-tile neurotoxic miasma cloud lasting 3.0s, inflicting 45 corrosive poison damage and a 35% acid slow for 2.0s with a 500ms ICD guard.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.TESLA_OVERCHARGE_COIL, RelicId.ABYSSAL_MAELSTROM_PEARL],
    synergyName: 'Bio-Electric Neuro-Overload',
    synergyDescription: 'High-voltage chain lightning passing through miasmic spore clouds ignites a bio-electric storm: arcing to up to 4 targets for 130 damage, causing a 2.0s EMP paralysis, shield shatter, and neurotoxic detonation (+350 score)!',
  },
  [RelicId.ABYSSAL_MAELSTROM_PEARL]: {
    id: RelicId.ABYSSAL_MAELSTROM_PEARL,
    name: 'Abyssal Maelstrom Pearl',
    icon: '🌊🐚',
    rarity: 'epic',
    description: 'Bioluminescent hadal trench pearl condensing crushing hydrostatic currents and oceanic undertows.',
    mechanics: 'Bomb detonations unleash a 2.5-tile tidal undertow maelstrom crushing up to 3 enemies for 55 hydrostatic damage, pulling them inward at 120 px/s, and inflicting a 35% undertow drag for 2.0s with a 500ms ICD guard.',
    internalCooldownMs: 500,
    synergyPartners: [RelicId.CORROSIVE_MIASMIC_FLASK],
    synergyName: 'Hadal Brine Maelstrom',
    synergyDescription: 'Acidic miasma dissolves into hyper-pressurized oceanic brine: expands maelstrom to 3.5 tiles (up to 4 targets), crushes for 135 damage, pulls inward at 180 px/s, and inflicts 55% drag (3.0s) + 1.5s abyssal stun (+350 score)!',
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
  {
    relicA: RelicId.MAGNETRON_DIAL,
    relicB: RelicId.ORBITAL_TARGETING_CORE,
    name: 'Orbital Ion Strike',
    icon: '🧭🛰️',
    description: 'Micro-kinetic lance expands to a 3-tile cross pattern and draws items and star candies within 8 tiles.',
  },
  {
    relicA: RelicId.PSIONIC_FEEDBACK_CRYSTAL,
    relicB: RelicId.POCKET_CHRONOMETER,
    name: 'Precognitive Resonance',
    icon: '🧠⏱️',
    description: 'During final 30s or crises, psionic pulse radius expands to 3.5 tiles and stuns confused enemies.',
  },
  {
    relicA: RelicId.QUANTUM_WARP_PRISM,
    relicB: RelicId.VOID_SINGULARITY_LENS,
    name: 'Quantum Event Horizon',
    icon: '🌌🌀',
    description: 'Quantum rifts expand from 2.0 to 3.5 tiles, pull enemies inward with singularity force, deal double damage (150), and extend phase-shift to 2.0s.',
  },
  {
    relicA: RelicId.PYROCLASTIC_PRISM,
    relicB: RelicId.CRYO_GLACIAL_CORE,
    name: 'Thermal Shock Reaction',
    icon: '🔥❄️',
    description: 'Opposing thermodynamic extremes collide: chilled enemies struck by Pyroclastic flame shards suffer Thermal Shatter (+150% damage) and detonate in a 3.0-tile flash-freeze secondary frost explosion!',
  },
  {
    relicA: RelicId.TESLA_OVERCHARGE_COIL,
    relicB: RelicId.CRYO_GLACIAL_CORE,
    name: 'Electro-Cryo Superconductor',
    icon: '⚡❄️',
    description: 'Opposing elements achieve superconductivity: chilled enemies struck by chain lightning suffer Superconductive Overload (+140% damage, 120 damage, 3.5-tile blast) and shatter shields!',
  },
  {
    relicA: RelicId.TESLA_OVERCHARGE_COIL,
    relicB: RelicId.CORROSIVE_MIASMIC_FLASK,
    name: 'Bio-Electric Neuro-Overload',
    icon: '⚡☣️',
    description: 'High-voltage chain lightning passing through miasmic spore clouds ignites a bio-electric storm: arcing to up to 4 targets within 3.5 tiles for 130 damage, causing 2.0s EMP paralysis, shield shatter, and neurotoxic detonation (+350 score)!',
  },
  {
    relicA: RelicId.CORROSIVE_MIASMIC_FLASK,
    relicB: RelicId.ABYSSAL_MAELSTROM_PEARL,
    name: 'Hadal Brine Maelstrom',
    icon: '🌊☣️',
    description: 'Acidic miasma dissolves into hyper-pressurized oceanic brine: maelstrom expands to 3.5 tiles hitting up to 4 targets for 135 crushing damage, pulling them inward at 180 px/s with 55% drag (3.0s) and 1.5s abyssal stun (+350 score)!',
  },
];

/* ==============================================================================
 * RELIC SYSTEM MANAGER
 * ============================================================================== */

export interface AbyssalPearlProcResult {
  triggered: boolean;
  pulledEnemyIds: string[];
  maelstromRadius: number;
  damage: number;
  undertowDurationMs: number;
  slowRatio: number;
  pullSpeedPx: number;
  stunDurationMs: number;
  isHadalBrineMaelstrom: boolean;
}

const PYROCLASTIC_DIAGONAL_SHARDS: { dr: number; dc: number; maxDist: number }[] = [
  Object.freeze({ dr: -1, dc: -1, maxDist: 2 }),
  Object.freeze({ dr: -1, dc: 1, maxDist: 2 }),
  Object.freeze({ dr: 1, dc: -1, maxDist: 2 }),
  Object.freeze({ dr: 1, dc: 1, maxDist: 2 }),
];
Object.freeze(PYROCLASTIC_DIAGONAL_SHARDS);

const EMPTY_SHARDS: { dr: number; dc: number; maxDist: number }[] = [];
Object.freeze(EMPTY_SHARDS);

const PYROCLASTIC_TRIGGERED_RESULT: {
  spawnDiagonalShards: boolean;
  shards: { dr: number; dc: number; maxDist: number }[];
} = Object.freeze({
  spawnDiagonalShards: true,
  shards: PYROCLASTIC_DIAGONAL_SHARDS,
});

const PYROCLASTIC_SUPPRESSED_RESULT: {
  spawnDiagonalShards: boolean;
  shards: { dr: number; dc: number; maxDist: number }[];
} = Object.freeze({
  spawnDiagonalShards: false,
  shards: EMPTY_SHARDS,
});

const BOMB_KICKED_DEFAULT = Object.freeze({ velocityPxPerSec: 200, softBlockPierceCount: 0 });
const BOMB_KICKED_CLOCKWORK = Object.freeze({ velocityPxPerSec: 450, softBlockPierceCount: 1 });
const BOMB_KICKED_SYNERGY = Object.freeze({ velocityPxPerSec: 450, softBlockPierceCount: 2 });

const UPDATE_RESULT_IDLE = Object.freeze({ applyEnemySlow: false, slowRatio: 1.0, solarShieldGranted: false });
const UPDATE_RESULT_SLOW = Object.freeze({ applyEnemySlow: true, slowRatio: 0.80, solarShieldGranted: false });
const UPDATE_RESULT_SHIELD = Object.freeze({ applyEnemySlow: false, slowRatio: 1.0, solarShieldGranted: true });
const UPDATE_RESULT_SLOW_SHIELD = Object.freeze({ applyEnemySlow: true, slowRatio: 0.80, solarShieldGranted: true });

const ALL_RELIC_IDS: readonly RelicId[] = Object.freeze(Object.keys(RELIC_CATALOG) as RelicId[]);

export class RelicManager {
  private equippedRelics: RelicId[] = [];
  private discoveredRelics: Set<RelicId> = new Set();
  private maxSlots: number = 1;

  // Internal Cooldown Tracking (Edge Case 21: 500ms ICD loop protection)
  private lastProcTimes: Map<string, number> = new Map();

  // Pre-allocated Zero-GC scratch buffers for nearest-target selection & runtime hooks
  private readonly _scratchCandIds: string[] = [];
  private readonly _scratchCandDists: number[] = [];
  private readonly _scratchEnemyKilled = {
    shieldGranted: false,
    currentStreak: 0,
  };
  private readonly _scratchBombPlacedIds: string[] = [];
  private readonly _scratchBombPlaced = {
    pulledEnemyIds: this._scratchBombPlacedIds,
    pullRadius: 0,
  };
  private readonly _scratchWallBounceIds: string[] = [];
  private readonly _scratchWallBounce = {
    stunnedEnemyIds: this._scratchWallBounceIds,
    stunDurationMs: 0,
  };
  private readonly _scratchPsionicIds: string[] = [];
  private readonly _scratchPsionicPulse = {
    affectedEnemyIds: this._scratchPsionicIds,
    pulseRadius: 0,
    confusedDurationMs: 0,
    isStunned: false,
  };
  private readonly _scratchOrbitalTileSlots: { r: number; c: number }[] = [
    { r: 0, c: 0 },
    { r: 0, c: 0 },
    { r: 0, c: 0 },
    { r: 0, c: 0 },
    { r: 0, c: 0 },
  ];
  private readonly _scratchOrbitalTargetTiles: { r: number; c: number }[] = [];
  private readonly _scratchOrbitalTargeting = {
    targetTiles: this._scratchOrbitalTargetTiles,
    damage: 0,
    delayMs: 0,
  };
  private readonly _scratchQuantumWarpIds: string[] = [];
  private readonly _scratchQuantumWarp = {
    warpedEnemyIds: this._scratchQuantumWarpIds,
    warpRadius: 0,
    damage: 0,
    phaseDurationMs: 0,
    singularityPull: false,
    isEmpowered: false,
  };
  private readonly _scratchCryoIds: string[] = [];
  private readonly _scratchCryoGlacial = {
    triggered: false,
    chilledEnemyIds: this._scratchCryoIds,
    frostRadius: 0,
    damage: 0,
    chillDurationMs: 0,
    slowRatio: 0,
    isThermalShock: false,
  };
  private readonly _scratchTeslaIds: string[] = [];
  private readonly _scratchTeslaCoil = {
    triggered: false,
    shockedEnemyIds: this._scratchTeslaIds,
    shockRadius: 0,
    damage: 0,
    shockDurationMs: 0,
    slowRatio: 0,
    isSuperconductor: false,
  };
  private readonly _scratchMiasmaIds: string[] = [];
  private readonly _scratchMiasmicFlask = {
    triggered: false,
    poisonedEnemyIds: this._scratchMiasmaIds,
    cloudRadius: 0,
    damage: 0,
    poisonDurationMs: 0,
    slowRatio: 0,
    isNeuroOverload: false,
  };
  private readonly _scratchAbyssalPulledIds: string[] = [];
  private readonly _scratchAbyssalPearl: AbyssalPearlProcResult = {
    triggered: false,
    pulledEnemyIds: this._scratchAbyssalPulledIds,
    maelstromRadius: 0,
    damage: 0,
    undertowDurationMs: 0,
    slowRatio: 0,
    pullSpeedPx: 0,
    stunDurationMs: 0,
    isHadalBrineMaelstrom: false,
  };

  // State trackers for specific relics
  public vampiricKillStreak: number = 0;
  public solarChargeElapsedMs: number = 0;
  public hasSolarShield: boolean = false;

  constructor(initialEquippedOrMaxSlots: RelicId[] | number = [], maxSlots: number = 1) {
    if (typeof initialEquippedOrMaxSlots === 'number') {
      this.maxSlots = Number.isFinite(initialEquippedOrMaxSlots)
        ? Math.max(1, Math.floor(initialEquippedOrMaxSlots))
        : 1;
    } else {
      this.maxSlots = Number.isFinite(maxSlots) ? Math.max(1, Math.floor(maxSlots)) : 1;
      if (Array.isArray(initialEquippedOrMaxSlots)) {
        for (const r of initialEquippedOrMaxSlots) {
          this.equipRelic(r);
        }
      }
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

  public getEquippedCount(): number {
    return this.equippedRelics.length;
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

  public serialize(): {
    equippedRelics: RelicId[];
    discoveredRelics: RelicId[];
    maxSlots: number;
    vampiricKillStreak: number;
    solarChargeElapsedMs: number;
    hasSolarShield: boolean;
  } {
    return {
      equippedRelics: [...this.equippedRelics],
      discoveredRelics: Array.from(this.discoveredRelics),
      maxSlots: this.maxSlots,
      vampiricKillStreak: this.vampiricKillStreak,
      solarChargeElapsedMs: this.solarChargeElapsedMs,
      hasSolarShield: this.hasSolarShield,
    };
  }

  private static readonly VALID_RELIC_ID_SET: ReadonlySet<string> = new Set<string>(
    Object.values(RelicId)
  );

  public deserialize(saved: unknown): boolean {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false;
    const s = saved as Record<string, unknown>;
    this.lastProcTimes.clear();

    if (typeof s.maxSlots === 'number' && Number.isFinite(s.maxSlots)) {
      this.setMaxSlots(s.maxSlots);
    }

    const validRelicIds = RelicManager.VALID_RELIC_ID_SET;

    if (Array.isArray(s.discoveredRelics)) {
      for (const r of s.discoveredRelics) {
        if (typeof r === 'string' && validRelicIds.has(r)) {
          this.discoveredRelics.add(r as RelicId);
        }
      }
    }

    if (Array.isArray(s.equippedRelics)) {
      this.equippedRelics = [];
      for (const r of s.equippedRelics) {
        if (typeof r === 'string' && validRelicIds.has(r) && this.equippedRelics.length < this.maxSlots) {
          if (!this.equippedRelics.includes(r as RelicId)) {
            this.equippedRelics.push(r as RelicId);
            this.discoveredRelics.add(r as RelicId);
          }
        }
      }
    }

    if (typeof s.vampiricKillStreak === 'number' && Number.isFinite(s.vampiricKillStreak)) {
      this.vampiricKillStreak = Math.max(0, Math.floor(s.vampiricKillStreak));
    }
    if (typeof s.solarChargeElapsedMs === 'number' && Number.isFinite(s.solarChargeElapsedMs)) {
      this.solarChargeElapsedMs = Math.max(0, s.solarChargeElapsedMs);
    }
    if (typeof s.hasSolarShield === 'boolean') {
      this.hasSolarShield = s.hasSolarShield;
    }

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
    if (!this.isEquipped(relicA) || !this.isEquipped(relicB)) return false;
    for (let i = 0; i < SYNERGY_DEFINITIONS.length; i++) {
      const s = SYNERGY_DEFINITIONS[i];
      if ((s.relicA === relicA && s.relicB === relicB) || (s.relicA === relicB && s.relicB === relicA)) {
        return true;
      }
    }
    return false;
  }

  public resetCooldowns(): void {
    this.lastProcTimes.clear();
  }

  public hasAnyDetonationEnemyRelic(): boolean {
    for (let i = 0; i < this.equippedRelics.length; i++) {
      const r = this.equippedRelics[i];
      if (
        r === RelicId.PSIONIC_FEEDBACK_CRYSTAL ||
        r === RelicId.QUANTUM_WARP_PRISM ||
        r === RelicId.CRYO_GLACIAL_CORE ||
        r === RelicId.TESLA_OVERCHARGE_COIL ||
        r === RelicId.CORROSIVE_MIASMIC_FLASK ||
        r === RelicId.ABYSSAL_MAELSTROM_PEARL
      ) {
        return true;
      }
    }
    return false;
  }

  private selectNearestEnemyIds(
    enemies: { id: string; r: number; c: number }[],
    bombRow: number,
    bombCol: number,
    maxRadius: number,
    maxTargets: number,
    outIds: string[]
  ): void {
    const ids = this._scratchCandIds;
    const dists = this._scratchCandDists;
    let count = 0;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || typeof e.id !== 'string' || !Number.isFinite(e.r) || !Number.isFinite(e.c)) continue;
      const dist = Math.hypot(e.r - bombRow, e.c - bombCol);
      if (dist <= maxRadius) {
        // In-place insertion sort by ascending Euclidean distance (Zero-GC, zero closures)
        let pos = count;
        while (pos > 0 && dists[pos - 1] > dist) {
          ids[pos] = ids[pos - 1];
          dists[pos] = dists[pos - 1];
          pos--;
        }
        ids[pos] = e.id;
        dists[pos] = dist;
        count++;
      }
    }

    const limit = Math.min(maxTargets, count);
    for (let i = 0; i < limit; i++) {
      outIds.push(ids[i]);
    }
    ids.length = 0;
    dists.length = 0;
  }

  /**
   * Internal Cooldown Guard (500ms) to prevent infinite loop procs (Edge Case 21)
   */
  private checkAndSetIcd(procKey: string, nowMs: number): boolean {
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < 0) {
      return false;
    }
    const last = this.lastProcTimes.get(procKey);
    if (last !== undefined) {
      if (nowMs < last || nowMs - last < 500) {
        return false; // Suppressed by 500ms ICD guard / non-monotonic timestamp
      }
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
    const applyEnemySlow =
      this.isEquipped(RelicId.POCKET_CHRONOMETER) && matchSecondsRemaining <= 30 && matchSecondsRemaining > 0;
    let solarShieldGranted = false;

    // 2. Solar Capacitor
    if (this.isEquipped(RelicId.SOLAR_CAPACITOR)) {
      const validDelta = typeof deltaMs === 'number' && Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
      if (isInOpenCorridor && !this.hasSolarShield) {
        const reqDuration = this.hasSynergy(RelicId.SOLAR_CAPACITOR, RelicId.VAMPIRIC_CONFECTION) ? 4000 : 8000;
        this.solarChargeElapsedMs += validDelta;
        if (this.solarChargeElapsedMs >= reqDuration) {
          if (this.checkAndSetIcd('solar_shield_charge', nowMs)) {
            this.hasSolarShield = true;
            this.solarChargeElapsedMs = 0;
            solarShieldGranted = true;
          }
        }
      } else if (!isInOpenCorridor) {
        // Slowly lose charge if hiding in tight corners
        this.solarChargeElapsedMs = Math.max(0, this.solarChargeElapsedMs - validDelta * 0.5);
      }
    }

    if (applyEnemySlow) {
      return solarShieldGranted ? UPDATE_RESULT_SLOW_SHIELD : UPDATE_RESULT_SLOW;
    }
    return solarShieldGranted ? UPDATE_RESULT_SHIELD : UPDATE_RESULT_IDLE;
  }

  /**
   * On Enemy Defeated
   * - Vampiric Confection: restores 1 shield charge every 5 (or 3 with synergy) kills
   */
  public onEnemyKilled(nowMs: number): { shieldGranted: boolean; currentStreak: number } {
    const out = this._scratchEnemyKilled;
    out.shieldGranted = false;
    out.currentStreak = 0;

    if (!this.isEquipped(RelicId.VAMPIRIC_CONFECTION)) {
      return out;
    }

    this.vampiricKillStreak++;
    const threshold = this.hasSynergy(RelicId.VAMPIRIC_CONFECTION, RelicId.SOLAR_CAPACITOR) ? 3 : 5;

    if (this.vampiricKillStreak >= threshold) {
      if (this.checkAndSetIcd('vampiric_shield_restore', nowMs)) {
        this.vampiricKillStreak = 0;
        out.shieldGranted = true;
        out.currentStreak = 0;
        return out;
      }
    }

    out.currentStreak = this.vampiricKillStreak;
    return out;
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
    const out = this._scratchBombPlaced;
    out.pulledEnemyIds.length = 0;
    out.pullRadius = 0;

    if (!this.isEquipped(RelicId.VOID_SINGULARITY_LENS)) {
      return out;
    }

    if (!bombTile || !Number.isFinite(bombTile.r) || !Number.isFinite(bombTile.c) || !Array.isArray(enemies)) {
      return out;
    }

    if (!this.checkAndSetIcd('void_singularity_pull', nowMs)) {
      return out;
    }

    const radius = this.hasSynergy(RelicId.VOID_SINGULARITY_LENS, RelicId.PYROCLASTIC_PRISM) ? 2.5 : 1.5;
    out.pullRadius = radius;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || typeof enemy.r !== 'number' || typeof enemy.c !== 'number') continue;
      const dr = enemy.r - bombTile.r;
      const dc = enemy.c - bombTile.c;
      const dist = Math.hypot(dr, dc);
      if (dist <= radius && dist > 0.1) {
        out.pulledEnemyIds.push(enemy.id);
      }
    }

    return out;
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
      return PYROCLASTIC_SUPPRESSED_RESULT;
    }

    if (!bombTile || !Number.isFinite(bombTile.r) || !Number.isFinite(bombTile.c)) {
      return PYROCLASTIC_SUPPRESSED_RESULT;
    }

    if (!this.checkAndSetIcd('pyroclastic_shards', nowMs)) {
      return PYROCLASTIC_SUPPRESSED_RESULT;
    }

    return PYROCLASTIC_TRIGGERED_RESULT;
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
    const out = this._scratchWallBounce;
    out.stunnedEnemyIds.length = 0;
    out.stunDurationMs = 0;

    if (!this.isEquipped(RelicId.GELATINOUS_CORE)) {
      return out;
    }

    if (!playerTile || !Number.isFinite(playerTile.r) || !Number.isFinite(playerTile.c) || !Array.isArray(enemies)) {
      return out;
    }

    if (!this.checkAndSetIcd('gelatinous_core_stun', nowMs)) {
      return out;
    }

    const radius = this.hasSynergy(RelicId.GELATINOUS_CORE, RelicId.CLOCKWORK_SPRING) ? 2.5 : 1.5;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || typeof enemy.r !== 'number' || typeof enemy.c !== 'number') continue;
      const dr = enemy.r - playerTile.r;
      const dc = enemy.c - playerTile.c;
      const dist = Math.hypot(dr, dc);
      if (dist <= radius) {
        out.stunnedEnemyIds.push(enemy.id);
      }
    }

    out.stunDurationMs = 500;
    return out;
  }

  /**
   * On Bomb Kicked
   * - Clockwork Spring: accelerates sliding speed to 450 px/s and pierces through 1 soft block
   */
  public onBombKicked(nowMs: number): { velocityPxPerSec: number; softBlockPierceCount: number } {
    if (!this.isEquipped(RelicId.CLOCKWORK_SPRING)) {
      return BOMB_KICKED_DEFAULT;
    }

    if (!this.checkAndSetIcd('clockwork_spring_kick', nowMs)) {
      return BOMB_KICKED_DEFAULT;
    }

    return this.hasSynergy(RelicId.CLOCKWORK_SPRING, RelicId.GELATINOUS_CORE)
      ? BOMB_KICKED_SYNERGY
      : BOMB_KICKED_CLOCKWORK;
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
    // Synergy: Orbital Ion Strike draws items within 8 tiles
    if (this.hasSynergy(RelicId.MAGNETRON_DIAL, RelicId.ORBITAL_TARGETING_CORE)) {
      return 8;
    }
    return 4;
  }

  /**
   * On Bomb Detonation (Psionic Feedback Crystal)
   * Emits a psionic pulse dispelling illusions and confusing enemies.
   * If Precognitive Resonance is active, expands to 3.5 tiles and applies 1.0s stun.
   */
  public onBombDetonationPsionicPulse(
    bombRow: number,
    bombCol: number,
    enemies: { id: string; r: number; c: number }[],
    isCrisisActive: boolean,
    matchSecondsRemaining: number,
    nowMs: number
  ): { affectedEnemyIds: string[]; pulseRadius: number; confusedDurationMs: number; isStunned: boolean } {
    const out = this._scratchPsionicPulse;
    out.affectedEnemyIds.length = 0;
    out.pulseRadius = 0;
    out.confusedDurationMs = 0;
    out.isStunned = false;

    if (!this.isEquipped(RelicId.PSIONIC_FEEDBACK_CRYSTAL)) {
      return out;
    }

    if (!Number.isFinite(bombRow) || !Number.isFinite(bombCol) || !Array.isArray(enemies)) {
      return out;
    }

    if (!this.checkAndSetIcd('psionic_feedback_crystal', nowMs)) {
      return out;
    }

    const hasSynergy = this.hasSynergy(RelicId.PSIONIC_FEEDBACK_CRYSTAL, RelicId.POCKET_CHRONOMETER);
    const isEmpowered = hasSynergy && (isCrisisActive || (matchSecondsRemaining <= 30 && matchSecondsRemaining > 0));
    const radius = isEmpowered ? 3.5 : 2.0;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || typeof e.r !== 'number' || typeof e.c !== 'number') continue;
      const dist = Math.hypot(e.r - bombRow, e.c - bombCol);
      if (dist <= radius) {
        out.affectedEnemyIds.push(e.id);
      }
    }

    out.pulseRadius = radius;
    out.confusedDurationMs = 1500;
    out.isStunned = isEmpowered;
    return out;
  }

  /**
   * On Bomb Detonation (Orbital Targeting Core)
   * Calls a micro-kinetic lance striking after 1.2s dealing 150 damage.
   * If Orbital Ion Strike is active, expands to a 3-tile cross pattern.
   */
  public onBombDetonationOrbitalTargeting(
    bombRow: number,
    bombCol: number,
    nowMs: number
  ): { targetTiles: { r: number; c: number }[]; damage: number; delayMs: number } {
    const out = this._scratchOrbitalTargeting;
    out.targetTiles.length = 0;
    out.damage = 0;
    out.delayMs = 0;

    if (!this.isEquipped(RelicId.ORBITAL_TARGETING_CORE)) {
      return out;
    }

    if (!Number.isFinite(bombRow) || !Number.isFinite(bombCol)) {
      return out;
    }

    if (!this.checkAndSetIcd('orbital_targeting_core', nowMs)) {
      return out;
    }

    const slots = this._scratchOrbitalTileSlots;
    slots[0].r = bombRow;
    slots[0].c = bombCol;
    out.targetTiles.push(slots[0]);

    if (this.hasSynergy(RelicId.ORBITAL_TARGETING_CORE, RelicId.MAGNETRON_DIAL)) {
      slots[1].r = bombRow - 1;
      slots[1].c = bombCol;
      slots[2].r = bombRow + 1;
      slots[2].c = bombCol;
      slots[3].r = bombRow;
      slots[3].c = bombCol - 1;
      slots[4].r = bombRow;
      slots[4].c = bombCol + 1;
      out.targetTiles.push(slots[1], slots[2], slots[3], slots[4]);
    }

    out.damage = 150;
    out.delayMs = 1200;
    return out;
  }

  /**
   * On Bomb Detonation (Quantum Warp Prism)
   * Opens a micro quantum rift at the epicenter, damaging enemies within 2.0 tiles (or 3.5 tiles with synergy)
   * and phase-shifting / slowing them.
   */
  public onBombDetonationQuantumWarp(
    bombRow: number,
    bombCol: number,
    enemies: { id: string; r: number; c: number }[],
    nowMs: number
  ): {
    warpedEnemyIds: string[];
    warpRadius: number;
    damage: number;
    phaseDurationMs: number;
    singularityPull: boolean;
    isEmpowered: boolean;
  } {
    const out = this._scratchQuantumWarp;
    out.warpedEnemyIds.length = 0;
    out.warpRadius = 0;
    out.damage = 0;
    out.phaseDurationMs = 0;
    out.singularityPull = false;
    out.isEmpowered = false;

    if (!this.isEquipped(RelicId.QUANTUM_WARP_PRISM)) {
      return out;
    }

    if (!Number.isFinite(bombRow) || !Number.isFinite(bombCol) || !Array.isArray(enemies)) {
      return out;
    }

    if (!this.checkAndSetIcd('quantum_warp_prism', nowMs)) {
      return out;
    }

    const hasSynergy = this.hasSynergy(RelicId.QUANTUM_WARP_PRISM, RelicId.VOID_SINGULARITY_LENS);
    const warpRadius = hasSynergy ? 3.5 : 2.0;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || typeof e.id !== 'string' || !Number.isFinite(e.r) || !Number.isFinite(e.c)) continue;
      const dist = Math.hypot(e.r - bombRow, e.c - bombCol);
      if (dist <= warpRadius) {
        out.warpedEnemyIds.push(e.id);
      }
    }

    out.warpRadius = warpRadius;
    out.damage = hasSynergy ? 150 : 75;
    out.phaseDurationMs = hasSynergy ? 2000 : 1200;
    out.singularityPull = hasSynergy;
    out.isEmpowered = hasSynergy;
    return out;
  }

  /**
   * On Bomb Detonation (Cryo Glacial Core)
   * Releases a cryogenic frost burst within 2.5 tiles (3.0 tiles with Thermal Shock Reaction synergy),
   * dealing frost damage (40 base, 100 with synergy) and applying a 40% Glacial Chill slow for 2.0s.
   * If Thermal Shock Reaction synergy is active with Pyroclastic Prism, triggers Thermal Shatter.
   */
  public onBombDetonationCryoGlacial(
    bombRow: number,
    bombCol: number,
    enemies: { id: string; r: number; c: number }[],
    nowMs: number
  ): {
    triggered: boolean;
    chilledEnemyIds: string[];
    frostRadius: number;
    damage: number;
    chillDurationMs: number;
    slowRatio: number;
    isThermalShock: boolean;
  } {
    const out = this._scratchCryoGlacial;
    out.triggered = false;
    out.chilledEnemyIds.length = 0;
    out.frostRadius = 0;
    out.damage = 0;
    out.chillDurationMs = 0;
    out.slowRatio = 0;
    out.isThermalShock = false;

    if (!this.isEquipped(RelicId.CRYO_GLACIAL_CORE)) {
      return out;
    }

    if (!Number.isFinite(bombRow) || !Number.isFinite(bombCol) || !Array.isArray(enemies)) {
      return out;
    }

    if (!this.checkAndSetIcd('cryo_glacial_core', nowMs)) {
      return out;
    }

    const hasSynergy = this.hasSynergy(RelicId.CRYO_GLACIAL_CORE, RelicId.PYROCLASTIC_PRISM);
    const frostRadius = hasSynergy ? 3.0 : 2.5;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || typeof e.id !== 'string' || !Number.isFinite(e.r) || !Number.isFinite(e.c)) continue;
      const dist = Math.hypot(e.r - bombRow, e.c - bombCol);
      if (dist <= frostRadius) {
        out.chilledEnemyIds.push(e.id);
      }
    }

    out.triggered = true;
    out.frostRadius = frostRadius;
    out.damage = hasSynergy ? 100 : 40;
    out.chillDurationMs = hasSynergy ? 2500 : 2000;
    out.slowRatio = 0.40;
    out.isThermalShock = hasSynergy;
    return out;
  }

  /**
   * On Bomb Detonation (Tesla Overcharge Coil)
   * Emits high-voltage chain lightning to up to 3 non-defeated targets within 3.0 tiles
   * (3.5 tiles with Electro-Cryo Superconductor synergy), dealing 50 damage (120 with synergy)
   * and inflicting a 1.0s EMP shock/stun (2.0s with synergy) and 50% slow.
   * If Electro-Cryo Superconductor synergy is active with Cryo Glacial Core, triggers Superconductive Overload.
   */
  public onBombDetonationTeslaCoil(
    bombRow: number,
    bombCol: number,
    enemies: { id: string; r: number; c: number }[],
    nowMs: number
  ): {
    triggered: boolean;
    shockedEnemyIds: string[];
    shockRadius: number;
    damage: number;
    shockDurationMs: number;
    slowRatio: number;
    isSuperconductor: boolean;
  } {
    const out = this._scratchTeslaCoil;
    out.triggered = false;
    out.shockedEnemyIds.length = 0;
    out.shockRadius = 0;
    out.damage = 0;
    out.shockDurationMs = 0;
    out.slowRatio = 0;
    out.isSuperconductor = false;

    if (!this.isEquipped(RelicId.TESLA_OVERCHARGE_COIL)) {
      return out;
    }

    if (!Number.isFinite(bombRow) || !Number.isFinite(bombCol) || !Array.isArray(enemies)) {
      return out;
    }

    if (!this.checkAndSetIcd('tesla_overcharge_coil', nowMs)) {
      return out;
    }

    const hasSynergy = this.hasSynergy(RelicId.TESLA_OVERCHARGE_COIL, RelicId.CRYO_GLACIAL_CORE);
    const shockRadius = hasSynergy ? 3.5 : 3.0;
    this.selectNearestEnemyIds(enemies, bombRow, bombCol, shockRadius, 3, out.shockedEnemyIds);

    out.triggered = true;
    out.shockRadius = shockRadius;
    out.damage = hasSynergy ? 120 : 50;
    out.shockDurationMs = hasSynergy ? 2000 : 1000;
    out.slowRatio = 0.50;
    out.isSuperconductor = hasSynergy;
    return out;
  }

  /**
   * 14th Relic Hook: Corrosive Miasmic Flask (RelicId.CORROSIVE_MIASMIC_FLASK)
   * Bomb detonations vent a 2.5-tile neurotoxic miasma cloud (3.5 with synergy),
   * dealing 45 corrosive acid damage (130 with synergy) and 35% slow for 2.0s (50% slow & 2.0s EMP stun with synergy).
   */
  public onBombDetonationMiasmicFlask(
    bombRow: number,
    bombCol: number,
    enemies: { id: string; r: number; c: number }[],
    nowMs: number
  ): {
    triggered: boolean;
    poisonedEnemyIds: string[];
    cloudRadius: number;
    damage: number;
    poisonDurationMs: number;
    slowRatio: number;
    isNeuroOverload: boolean;
  } {
    const out = this._scratchMiasmicFlask;
    out.triggered = false;
    out.poisonedEnemyIds.length = 0;
    out.cloudRadius = 0;
    out.damage = 0;
    out.poisonDurationMs = 0;
    out.slowRatio = 0;
    out.isNeuroOverload = false;

    if (!this.isEquipped(RelicId.CORROSIVE_MIASMIC_FLASK)) {
      return out;
    }

    if (!Number.isFinite(bombRow) || !Number.isFinite(bombCol) || !Array.isArray(enemies)) {
      return out;
    }

    if (!this.checkAndSetIcd('corrosive_miasmic_flask', nowMs)) {
      return out;
    }

    const hasSynergy = this.hasSynergy(RelicId.CORROSIVE_MIASMIC_FLASK, RelicId.TESLA_OVERCHARGE_COIL);
    const cloudRadius = hasSynergy ? 3.5 : 2.5;
    this.selectNearestEnemyIds(enemies, bombRow, bombCol, cloudRadius, hasSynergy ? 4 : 3, out.poisonedEnemyIds);

    out.triggered = true;
    out.cloudRadius = cloudRadius;
    out.damage = hasSynergy ? 130 : 45;
    out.poisonDurationMs = hasSynergy ? 3000 : 2000;
    out.slowRatio = hasSynergy ? 0.50 : 0.35;
    out.isNeuroOverload = hasSynergy;
    return out;
  }

  /**
   * 15th Relic Hook: Abyssal Maelstrom Pearl (RelicId.ABYSSAL_MAELSTROM_PEARL)
   * Bomb detonations unleash a 2.5-tile tidal undertow maelstrom (3.5 with Hadal Brine Maelstrom synergy),
   * crushing up to 3 nearest enemies (4 with synergy) for 55 hydrostatic damage (135 with synergy),
   * pulling them inward at 120 px/s (180 px/s with synergy), and inflicting a 35% drag for 2.0s
   * (55% drag for 3.0s + 1.5s abyssal stun with synergy).
   */
  public onBombDetonationAbyssalPearl(
    bombRow: number,
    bombCol: number,
    enemies: { id: string; r: number; c: number }[],
    nowMs: number
  ): AbyssalPearlProcResult {
    const out = this._scratchAbyssalPearl;
    out.triggered = false;
    out.pulledEnemyIds.length = 0;
    out.maelstromRadius = 0;
    out.damage = 0;
    out.undertowDurationMs = 0;
    out.slowRatio = 0;
    out.pullSpeedPx = 0;
    out.stunDurationMs = 0;
    out.isHadalBrineMaelstrom = false;

    if (!this.isEquipped(RelicId.ABYSSAL_MAELSTROM_PEARL)) {
      return out;
    }

    if (
      !Number.isFinite(bombRow) ||
      !Number.isFinite(bombCol) ||
      !Array.isArray(enemies) ||
      enemies.length === 0 ||
      typeof nowMs !== 'number' ||
      !Number.isFinite(nowMs) ||
      nowMs < 0
    ) {
      return out;
    }

    const prevLast = this.lastProcTimes.get('abyssal_maelstrom_pearl');
    if (!this.checkAndSetIcd('abyssal_maelstrom_pearl', nowMs)) {
      return out;
    }

    const hasSynergy = this.hasSynergy(RelicId.ABYSSAL_MAELSTROM_PEARL, RelicId.CORROSIVE_MIASMIC_FLASK);
    const maelstromRadius = hasSynergy ? 3.5 : 2.5;
    this.selectNearestEnemyIds(enemies, bombRow, bombCol, maelstromRadius, hasSynergy ? 4 : 3, out.pulledEnemyIds);

    if (out.pulledEnemyIds.length === 0) {
      // Do not consume 500ms ICD if zero valid targets fell inside maelstrom radius
      if (prevLast === undefined) {
        this.lastProcTimes.delete('abyssal_maelstrom_pearl');
      } else {
        this.lastProcTimes.set('abyssal_maelstrom_pearl', prevLast);
      }
      return out;
    }

    out.triggered = true;
    out.maelstromRadius = maelstromRadius;
    out.damage = hasSynergy ? 135 : 55;
    out.undertowDurationMs = hasSynergy ? 3000 : 2000;
    out.slowRatio = hasSynergy ? 0.55 : 0.35;
    out.pullSpeedPx = hasSynergy ? 180 : 120;
    out.stunDurationMs = hasSynergy ? 1500 : 0;
    out.isHadalBrineMaelstrom = hasSynergy;

    return out;
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
    const allRelics = ALL_RELIC_IDS;
    const safeSeed =
      typeof seed === 'number' && Number.isFinite(seed) && seed > 0
        ? Math.floor(seed)
        : Date.now();
    const rand = ((safeSeed % 1000) + 1000) % 1000 / 1000;
    const dropBonus =
      perkBonuses && typeof perkBonuses.relicDropChanceBonus === 'number' && Number.isFinite(perkBonuses.relicDropChanceBonus)
        ? perkBonuses.relicDropChanceBonus
        : 0;

    let dropChance = 0.05 + dropBonus;
    if (isBoss) {
      dropChance = 1.0; // Boss defeat gives guaranteed relic drop!
    } else if (isChest) {
      dropChance = 0.35 + dropBonus;
    }

    if (rand <= dropChance) {
      const idx = Math.floor((((safeSeed >> 3) % allRelics.length) + allRelics.length) % allRelics.length);
      return allRelics[idx];
    }
    return null;
  }
}
