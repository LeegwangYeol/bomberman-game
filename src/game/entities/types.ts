/**
 * Modular Entity Archetype Definitions, Factions, and Interface Contracts.
 * Strictly adheres to tests/entities_expansion.test.mjs specification harness.
 */

export const FACTIONS = {
  PLAYER: 'player',
  ENEMY: 'enemy',
  NEUTRAL: 'neutral',
  ALLY: 'ally',
} as const;

export type EntityFaction = (typeof FACTIONS)[keyof typeof FACTIONS];

export const RENDER_DEPTH = {
  // Ground Layers
  BACKGROUND: -10,
  FLOOR: 0,
  WALLS: 1,
  BLOCKS: 2,
  DECALS: 3,
  PORTALS: 4,
  ITEM_GLOW: 5,
  ITEMS: 6,
  BOMBS: 7,
  TELEGRAPHS: 8,
  CRISIS_HAZARDS: 9,

  // Dynamic Y-Sorted Band (100 to 700 based on screen Y)
  // depth = ENTITY_Y_BASE + y * Y_SCALE + OFFSET
  ENTITY_Y_BASE: 100,
  ENTITY_Y_SCALE: 1.0,
  OFFSET_SHADOW: -0.1,
  OFFSET_SPRITE: 0.0,
  OFFSET_SHIELD: 0.1,
  OFFSET_HP_BAR: 0.2,
  OFFSET_NAME_TAG: 0.3,
  OFFSET_INTENT_BADGE: 0.4,

  // World Visual Effects (Always above ground entities)
  EXPLOSIONS: 750,
  SHOCKWAVES: 760,
  DEBRIS_PARTICLES: 770,

  // Boss Graphics Layer
  BOSS_BODY: 800,
  BOSS_VFX: 810,

  // Floating Labels & Popups
  FLOATING_TEXT: 900,
  SCREEN_OVERLAY: 950,
} as const;


export const ENEMY_ARCHETYPES = {
  CHASER: {
    type: 'CHASER',
    name: 'Chaser: Blinky',
    maxHp: 1,
    patrolSpeed: 70,
    trackSpeed: 110,
    dashSpeed: 240,
    windupMs: 350,
    stunMs: 900,
    hpBarColor: 0xef4444,
    segments: 1,
  },
  BOMBER: {
    type: 'BOMBER',
    name: 'Bomber: Pyro',
    maxHp: 2,
    patrolSpeed: 60,
    trackSpeed: 80,
    evadeSpeed: 95,
    enragedSpeed: 105,
    quickFuseMs: 1200,
    hpBarColor: 0xeab308,
    segments: 2,
  },
  TANK: {
    type: 'TANK',
    name: 'Tank: Iron Golem',
    maxHp: 4,
    walkSpeed: 45,
    chargeSpeed: 130,
    iFrameMs: 1200,
    stompSlowPct: 0.30,
    stompDurationMs: 1500,
    hpBarColor: 0x38bdf8,
    segments: 4,
  },
  GHOST: {
    type: 'GHOST',
    name: 'Ghost: Phantasm',
    maxHp: 1,
    phaseSpeed: 65,
    dashSpeed: 260,
    materializeDelayMs: 1500,
    hpBarColor: 0x06b6d4,
    segments: 1,
  },
  SPLITTER: {
    type: 'SPLITTER',
    name: 'Splitter: Gelatin',
    maxHp: 2,
    parentSpeed: 60,
    miniSpeed: 100,
    miniHp: 1,
    hpBarColor: 0x10b981,
    segments: 2,
  },
} as const;

export const NEUTRAL_ARCHETYPES = {
  MERCHANT: {
    type: 'MERCHANT',
    name: 'Merchant: Pops',
    maxHp: 3,
    walkSpeed: 40,
    escortDurationSec: 30,
    lootDropsCount: 2,
    hpBarColor: 0xf59e0b,
    segments: 3,
  },
  CRITTER: {
    type: 'CRITTER',
    name: 'Critter: Fluff',
    maxHp: 1,
    hopSpeed: 35,
    distractionChance: 0.25,
    scoreReward: 200,
    hpBarColor: 0xec4899,
    segments: 1,
  },
} as const;

export const ALLY_ARCHETYPES = {
  MINI_BOMBER: {
    type: 'MINI_BOMBER',
    name: 'Ally: Pom-Pom',
    maxHp: 3,
    leashMinTiles: 2,
    leashMaxTiles: 6,
    sprintSpeed: 160,
    bombPower: 2,
    hpBarColor: 0x06b6d4,
    segments: 3,
  },
  PET_DRONE: {
    type: 'PET_DRONE',
    name: 'Drone: Gizmo',
    maxHp: 2,
    flightSpeed: 120,
    fetchRadiusTiles: 6,
    shootIntervalMs: 3000,
    stunDurationMs: 1000,
    hpBarColor: 0x38bdf8,
    segments: 2,
  },
  SHIELD_GUARD: {
    type: 'SHIELD_GUARD',
    name: 'Ally: Aegis',
    maxHp: 5,
    marchDistanceAhead: 1,
    tauntIntervalMs: 4000,
    tauntRadiusTiles: 5,
    domeAbsorbRadiusTiles: 2,
    hpBarColor: 0x3b82f6,
    segments: 5,
  },
} as const;

export type EnemyType = keyof typeof ENEMY_ARCHETYPES;
export type NeutralType = keyof typeof NEUTRAL_ARCHETYPES;
export type AllyType = keyof typeof ALLY_ARCHETYPES;

export type EnemyArchetypeConfig = (typeof ENEMY_ARCHETYPES)[EnemyType];
export type NeutralArchetypeConfig = (typeof NEUTRAL_ARCHETYPES)[NeutralType];
export type AllyArchetypeConfig = (typeof ALLY_ARCHETYPES)[AllyType];

export interface OverheadRenderLayers {
  tier1_hp: {
    x: number;
    y: number;
    width: number;
    height: number;
    ratio: number;
    segments: number;
  };
  tier2_name: {
    x: number;
    y: number;
    text: string;
    color: string;
  };
  tier3_intent: {
    x: number;
    y: number;
    glyph: string;
    visible: boolean;
  };
}

export type NameTagLODMode = 'full' | 'compact' | 'minimal';

