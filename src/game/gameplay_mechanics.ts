/**
 * Gameplay Mechanics, Item Drop Tables, Stat Clamping, Skills & Gimmicks Engine.
 */

export type ItemType =
  | 'PIERCING_BOMB'
  | 'REMOTE_BOMB'
  | 'CLUSTER_BOMB'
  | 'LANDMINE'
  | 'ICE_BOMB'
  | 'RICOCHET_BOMB'
  | 'SPEED_UP'
  | 'BOMB_UP'
  | 'FIRE_UP'
  | 'MEGA_FIRE'
  | 'ARMOR_UP'
  | 'BLAST_RESIST'
  | 'KICK'
  | 'WALL_PASS'
  | 'BOMB_PASS'
  | 'TIME_FREEZE'
  | 'MAGNET'
  | 'EXTRA_LIFE'
  | 'SHIELD'
  | 'CLOAK'
  | 'DEFLECTOR'
  | 'SPEED_SURGE'
  | 'VAMPIRIC'
  | 'POISON_MIST';

export type ItemCategory = 'bomb' | 'stat' | 'utility' | 'buff';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface ItemDefinition {
  id: ItemType;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  iconKey: string;
  description: string;
  mechanics: string;
  badge: string;
  color: string;
  bgColor: number;
  ringColor: number;
}

export interface ActiveBuff {
  id: string;
  name: string;
  icon: string;
  color: string;
  remainingMs: number;
  totalMs: number;
}

export interface PlayerStats {
  speed: number;
  speedLevel: number;        // 1 to 5
  maxBombs: number;          // 1 to 8
  activeBombs: number;       // Current placed on board by player
  bombPower: number;         // 2 to 8 (blast radius in tiles)
  hasKick: boolean;          // Bomb kick unlocked
  hasShield: boolean;        // Shield active (absorbs 1 fatal hit)
  shieldCharges: number;     // 0, 1, 2
  maxShields: number;        // 1 or 2
  extraLives: number;        // 0 to 3
  hasWallPass: boolean;      // Walk through soft blocks
  hasBombPass: boolean;      // Walk through bombs
  hasMagnet: boolean;        // Pull items towards player
  hasBlastDeflector: boolean;// Reflect blasts during dash
  hasBlastResist: boolean;   // 50% resist friendly blasts
  hasVampiric: boolean;      // 35% chance on enemy kill to restore shield
  activeBombType: ItemType | 'REGULAR';
  dashCooldownRemaining: number; // 0 = ready, > 0 = ms left
  activeBuffs: ActiveBuff[];
  inventory: Record<ItemType, number>;
  itemsCollectedTotal: number;
  itemsCollected: {
    speedUp: number;
    bombUp: number;
    fireUp: number;
    kick: number;
    shield: number;
  };
  ultimateGauge: number;     // 0 to 100
  ultimateMax: number;       // 100
  isUltimateReady: boolean;
  ultimateLockoutRemaining: number; // ms remaining in lockout
  activeUltimate?: string;
  score: number;
  isGameOver: boolean;
}

export const ITEM_DROP_RATE = 0.45; // 45% drop probability on block destruction

// Weighted proportions: Bomb Up 38%, Fire Up 38%, Speed Up 16%, Kick 4%, Shield 4%
export const ITEM_WEIGHTS = {
  BOMB_UP: 0.38,
  FIRE_UP: 0.38,
  SPEED_UP: 0.16,
  KICK: 0.04,
  SHIELD: 0.04,
} as const;

export const TIER_WEIGHTS = {
  common: 0.60,
  uncommon: 0.22,
  rare: 0.13,
  epic: 0.05,
} as const;

export const ITEM_DEFINITIONS: Record<ItemType, ItemDefinition> = {
  PIERCING_BOMB: {
    id: 'PIERCING_BOMB',
    name: 'Spike Penetrator Bomb',
    category: 'bomb',
    rarity: 'rare',
    iconKey: 'item_piercing_bomb',
    description: 'Titanium spike-tipped bomb capable of vaporizing reinforced obstacles.',
    mechanics: 'Blast rays penetrate through all soft blocks along cardinal directions.',
    badge: '💣 PIERCE',
    color: '#06b6d4',
    bgColor: 0x1e293b,
    ringColor: 0x06b6d4,
  },
  REMOTE_BOMB: {
    id: 'REMOTE_BOMB',
    name: 'Radio Detonator Bomb',
    category: 'bomb',
    rarity: 'rare',
    iconKey: 'item_remote_bomb',
    description: 'Military-grade C4 linked to an encrypted shortwave transmitter.',
    mechanics: 'Fuses do not tick down; press [R] or detonate button to detonate active bombs.',
    badge: '📡 REMOTE',
    color: '#ef4444',
    bgColor: 0x881337,
    ringColor: 0xfbbf24,
  },
  CLUSTER_BOMB: {
    id: 'CLUSTER_BOMB',
    name: 'Scatter Cluster Bomb',
    category: 'bomb',
    rarity: 'epic',
    iconKey: 'item_cluster_bomb',
    description: 'Volatile secondary munitions packed into a pressurized fragmentation shell.',
    mechanics: 'Primary blast launches 4 sub-munitions into adjacent tiles that explode after 400ms.',
    badge: '💥 CLUSTER',
    color: '#a855f7',
    bgColor: 0x3b0764,
    ringColor: 0xe879f9,
  },
  LANDMINE: {
    id: 'LANDMINE',
    name: 'Stealth Proximity Mine',
    category: 'bomb',
    rarity: 'common',
    iconKey: 'item_landmine',
    description: 'Pressure-actuated subterranean mine designed for corridor ambush.',
    mechanics: 'Arms in 0.4s and fades into stealth. Detonates instantly when stepped on.',
    badge: '⚠️ MINE',
    color: '#f59e0b',
    bgColor: 0x334155,
    ringColor: 0xeab308,
  },
  ICE_BOMB: {
    id: 'ICE_BOMB',
    name: 'Absolute Zero Cryo Bomb',
    category: 'bomb',
    rarity: 'rare',
    iconKey: 'item_ice_bomb',
    description: 'Liquid nitrogen core that flash-freezes matter to near absolute zero.',
    mechanics: 'Freezes enemies caught in blast for 3 seconds; freezes player for 1.5s in cryo shell.',
    badge: '❄️ ICE',
    color: '#38bdf8',
    bgColor: 0x082f49,
    ringColor: 0x38bdf8,
  },
  RICOCHET_BOMB: {
    id: 'RICOCHET_BOMB',
    name: 'Elastic Ricochet Bomb',
    category: 'bomb',
    rarity: 'uncommon',
    iconKey: 'item_ricochet_bomb',
    description: 'High-density vulcanized rubber shell encasing an explosive core.',
    mechanics: 'Kicked bombs rebound off obstacles up to 3 times before coming to rest.',
    badge: '🔄 RICOCHET',
    color: '#22c55e',
    bgColor: 0x581c87,
    ringColor: 0x22c55e,
  },
  SPEED_UP: {
    id: 'SPEED_UP',
    name: 'Swift Roller Boots',
    category: 'stat',
    rarity: 'common',
    iconKey: 'item_speed',
    description: 'Pneumatic spring skates that reduce friction across the arena grid.',
    mechanics: '+25 px/s movement speed (Capped at 250 px/s / Level 5).',
    badge: '⚡ SPEED',
    color: '#22d3ee',
    bgColor: 0x06b6d4,
    ringColor: 0x22d3ee,
  },
  BOMB_UP: {
    id: 'BOMB_UP',
    name: 'Ammunition Bandolier',
    category: 'stat',
    rarity: 'common',
    iconKey: 'item_bomb',
    description: 'Modular combat bandolier providing rapid ordnance reload.',
    mechanics: '+1 maximum concurrent placed bombs (Capped at 8 bombs).',
    badge: '💣 BOMB',
    color: '#e2e8f0',
    bgColor: 0x334155,
    ringColor: 0x94a3b8,
  },
  FIRE_UP: {
    id: 'FIRE_UP',
    name: 'High-Octane Gunpowder',
    category: 'stat',
    rarity: 'common',
    iconKey: 'item_fire',
    description: 'Refined nitroglycerin additive that supercharges explosive combustion.',
    mechanics: '+1 tile explosion flame radius in all cardinal directions (Capped at 8 tiles).',
    badge: '🔥 FIRE',
    color: '#f87171',
    bgColor: 0xe11d48,
    ringColor: 0xfb7185,
  },
  MEGA_FIRE: {
    id: 'MEGA_FIRE',
    name: 'Golden Supernova Canister',
    category: 'stat',
    rarity: 'epic',
    iconKey: 'item_mega_fire',
    description: 'Concentrated solar plasma fuel sealed inside an ancient golden urn.',
    mechanics: 'Instantly maximizes explosion blast length to full level 8.',
    badge: '☀️ MEGA FIRE',
    color: '#facc15',
    bgColor: 0xea580c,
    ringColor: 0xfde047,
  },
  ARMOR_UP: {
    id: 'ARMOR_UP',
    name: 'Heavy Blast Plate',
    category: 'stat',
    rarity: 'uncommon',
    iconKey: 'item_armor_up',
    description: 'Composite ceramic-titanium armor plating designed to absorb high-yield concussions.',
    mechanics: 'Unlocks 2nd shield storage slot and immediately grants +1 shield charge.',
    badge: '🛡️ ARMOR',
    color: '#60a5fa',
    bgColor: 0x1e3a5f,
    ringColor: 0x60a5fa,
  },
  BLAST_RESIST: {
    id: 'BLAST_RESIST',
    name: 'Blast Deflection Lining',
    category: 'stat',
    rarity: 'rare',
    iconKey: 'item_blast_resist',
    description: 'Asbestos-insulated hazard suit certified against high-temperature blast waves.',
    mechanics: '50% chance to shrug off friendly bomb blasts without losing a shield.',
    badge: '🦺 RESIST',
    color: '#f97316',
    bgColor: 0xc2410c,
    ringColor: 0xf97316,
  },
  KICK: {
    id: 'KICK',
    name: 'Cleated Power Boots',
    category: 'utility',
    rarity: 'common',
    iconKey: 'item_kick',
    description: 'Spring-loaded magnetic cleat boots that propel heavy ordnance with precision.',
    mechanics: 'Walk into any placed bomb to kick it sliding down the corridor at 300 px/s.',
    badge: '👟 KICK',
    color: '#4ade80',
    bgColor: 0x16a34a,
    ringColor: 0x4ade80,
  },
  WALL_PASS: {
    id: 'WALL_PASS',
    name: 'Quantum Phasing Treads',
    category: 'utility',
    rarity: 'epic',
    iconKey: 'item_wall_pass',
    description: 'Experimental quantum phase-shifter allowing molecular de-densification.',
    mechanics: 'Pass freely through soft destructible blocks. Escape dead-ends with ease!',
    badge: '👻 WALL PASS',
    color: '#c084fc',
    bgColor: 0x581c87,
    ringColor: 0xc084fc,
  },
  BOMB_PASS: {
    id: 'BOMB_PASS',
    name: 'Displacement Belt',
    category: 'utility',
    rarity: 'uncommon',
    iconKey: 'item_bomb_pass',
    description: 'Harmonic dimensional tether that permits safe transit through armed explosives.',
    mechanics: 'Walk directly over planted bombs without being blocked.',
    badge: '🌀 BOMB PASS',
    color: '#818cf8',
    bgColor: 0x312e81,
    ringColor: 0x818cf8,
  },
  TIME_FREEZE: {
    id: 'TIME_FREEZE',
    name: 'Chrono Stop Pocketwatch',
    category: 'utility',
    rarity: 'epic',
    iconKey: 'item_time_freeze',
    description: 'Relic of an ancient chronomancer, locking local spacetime into absolute stasis.',
    mechanics: 'Freezes all enemies and bomb countdown fuses for 4 seconds while you move freely.',
    badge: '⏱️ TIME FREEZE',
    color: '#facc15',
    bgColor: 0x78350f,
    ringColor: 0xfacc15,
  },
  MAGNET: {
    id: 'MAGNET',
    name: 'Electro-Magnetic Attractor',
    category: 'utility',
    rarity: 'uncommon',
    iconKey: 'item_magnet',
    description: 'High-intensity neodymium electromagnets tuned to power-up metallic shells.',
    mechanics: 'Automatically pulls all dropped items within a 3-tile radius directly to you.',
    badge: '🧲 MAGNET',
    color: '#38bdf8',
    bgColor: 0x172554,
    ringColor: 0x38bdf8,
  },
  EXTRA_LIFE: {
    id: 'EXTRA_LIFE',
    name: 'Golden Cherub Heart',
    category: 'utility',
    rarity: 'epic',
    iconKey: 'item_extra_life',
    description: 'Sacred heart infused with phoenix essence, defying fatal demise.',
    mechanics: 'Grants +1 extra life (up to 3). Fatal hits revive you in place with 3s invulnerability.',
    badge: '❤️ 1-UP',
    color: '#fb7185',
    bgColor: 0x881337,
    ringColor: 0xfbbf24,
  },
  SHIELD: {
    id: 'SHIELD',
    name: 'Aegis Force Barrier',
    category: 'buff',
    rarity: 'common',
    iconKey: 'item_shield',
    description: 'Hexagonal energy field enveloping the user in an impenetrable kinetic barrier.',
    mechanics: 'Completely absorbs 1 fatal hit and triggers 1.5s of emergency invulnerability.',
    badge: '🛡️ SHIELD',
    color: '#fbbf24',
    bgColor: 0xd97706,
    ringColor: 0xfbbf24,
  },
  CLOAK: {
    id: 'CLOAK',
    name: 'Phantom Cloak',
    category: 'buff',
    rarity: 'rare',
    iconKey: 'item_cloak',
    description: 'Cloak woven from dark matter threads that bend light and thermal signatures.',
    mechanics: 'Renders you completely invisible to enemies for 6 seconds, canceling pursuit.',
    badge: '👤 CLOAK',
    color: '#c084fc',
    bgColor: 0x0f172a,
    ringColor: 0x818cf8,
  },
  DEFLECTOR: {
    id: 'DEFLECTOR',
    name: 'Prismatic Mirror Aegis',
    category: 'buff',
    rarity: 'rare',
    iconKey: 'item_deflector',
    description: 'Prismatic alloy that absorbs explosive shockwaves and redirects their force.',
    mechanics: 'Dashing through explosions deflects flame shockwaves away from you.',
    badge: '🪞 DEFLECT',
    color: '#2dd4bf',
    bgColor: 0x0f766e,
    ringColor: 0x2dd4bf,
  },
  SPEED_SURGE: {
    id: 'SPEED_SURGE',
    name: 'Adrenaline Turbo Injector',
    category: 'buff',
    rarity: 'uncommon',
    iconKey: 'item_speed_surge',
    description: 'Hyper-concentrated adrenaline stimulant that pushes motor limits.',
    mechanics: '+75 px/s speed burst and halves Dash cooldown for 8 seconds.',
    badge: '⚡ SURGE',
    color: '#84cc16',
    bgColor: 0x15803d,
    ringColor: 0x84cc16,
  },
  VAMPIRIC: {
    id: 'VAMPIRIC',
    name: 'Crimson Soul Phylactery',
    category: 'buff',
    rarity: 'uncommon',
    iconKey: 'item_vampiric',
    description: 'Dark crystalline phylactery that siphons ambient soul energy upon enemy defeat.',
    mechanics: 'Defeating enemies has a 35% chance to siphon energy and restore a lost shield.',
    badge: '🩸 VAMPIRIC',
    color: '#f87171',
    bgColor: 0x450a0a,
    ringColor: 0xef4444,
  },
  POISON_MIST: {
    id: 'POISON_MIST',
    name: 'Toxic Venom Cloud Bomb',
    category: 'bomb',
    rarity: 'uncommon',
    iconKey: 'item_poison_mist',
    description: 'Bio-chemical gas bomb that releases dense, paralyzing neurotoxin mist.',
    mechanics: 'Detonations leave a 3.5s toxic gas cloud that slows enemies by 60%.',
    badge: '☠️ POISON',
    color: '#10b981',
    bgColor: 0x064e3b,
    ringColor: 0x10b981,
  },
};

export const ITEMS_BY_TIER: Record<ItemRarity, { item: ItemType; weight: number }[]> = {
  common: [
    { item: 'BOMB_UP', weight: 0.18 },
    { item: 'FIRE_UP', weight: 0.18 },
    { item: 'SPEED_UP', weight: 0.12 },
    { item: 'KICK', weight: 0.04 },
    { item: 'SHIELD', weight: 0.04 },
    { item: 'LANDMINE', weight: 0.04 },
  ],
  uncommon: [
    { item: 'RICOCHET_BOMB', weight: 0.035 },
    { item: 'SPEED_SURGE', weight: 0.035 },
    { item: 'ARMOR_UP', weight: 0.030 },
    { item: 'BOMB_PASS', weight: 0.030 },
    { item: 'MAGNET', weight: 0.030 },
    { item: 'POISON_MIST', weight: 0.030 },
    { item: 'VAMPIRIC', weight: 0.030 },
  ],
  rare: [
    { item: 'PIERCING_BOMB', weight: 0.025 },
    { item: 'REMOTE_BOMB', weight: 0.025 },
    { item: 'ICE_BOMB', weight: 0.020 },
    { item: 'BLAST_RESIST', weight: 0.020 },
    { item: 'CLOAK', weight: 0.020 },
    { item: 'DEFLECTOR', weight: 0.020 },
  ],
  epic: [
    { item: 'CLUSTER_BOMB', weight: 0.010 },
    { item: 'MEGA_FIRE', weight: 0.010 },
    { item: 'WALL_PASS', weight: 0.010 },
    { item: 'TIME_FREEZE', weight: 0.010 },
    { item: 'EXTRA_LIFE', weight: 0.010 },
  ],
};

export const BASE_PLAYER_SPEED = 150;
export const SPEED_UP_DELTA = 25;
export const MAX_PLAYER_SPEED = 250; // Cap at 250 px/s (Level 5)

export const BASE_MAX_BOMBS = 1;
export const MAX_BOMBS_CAP = 8;

export const BASE_BOMB_POWER = 2;
export const MAX_BOMB_POWER_CAP = 8;

export const DASH_SPEED = 350;
export const DASH_DURATION_MS = 140;
export const DASH_COOLDOWN_MS = 3500;

export const BOMB_KICK_SPEED = 300;
export const ITEM_GRACE_PERIOD_MS = 600;
export const SHIELD_INVULN_MS = 1500;

export const CONVEYOR_DRIFT_SPEED = 60; // px/s
export const PORTAL_COOLDOWN_MS = 1200; // ms

export interface ConveyorConfig {
  row: number;
  col: number;
  dirX: number;
  dirY: number;
}

export interface PortalPair {
  portalA: { row: number; col: number };
  portalB: { row: number; col: number };
}

export const DEFAULT_CONVEYORS: ConveyorConfig[] = [
  { row: 7, col: 4, dirX: 1, dirY: 0 },
  { row: 7, col: 5, dirX: 1, dirY: 0 },
  { row: 7, col: 6, dirX: 1, dirY: 0 },
  { row: 7, col: 7, dirX: 1, dirY: 0 },
  { row: 7, col: 8, dirX: 1, dirY: 0 },
  { row: 7, col: 9, dirX: 1, dirY: 0 },
  { row: 7, col: 10, dirX: 1, dirY: 0 },
];

export const DEFAULT_PORTALS: PortalPair = {
  portalA: { row: 1, col: 13 },
  portalB: { row: 11, col: 1 },
};

export function calculateSpeedLevel(speed: number): number {
  return Math.min(5, Math.max(1, Math.floor((speed - BASE_PLAYER_SPEED) / SPEED_UP_DELTA) + 1));
}

export function createInitialPlayerStats(): PlayerStats {
  const inventory: Record<ItemType, number> = {
    PIERCING_BOMB: 0,
    REMOTE_BOMB: 0,
    CLUSTER_BOMB: 0,
    LANDMINE: 0,
    ICE_BOMB: 0,
    RICOCHET_BOMB: 0,
    SPEED_UP: 0,
    BOMB_UP: 0,
    FIRE_UP: 0,
    MEGA_FIRE: 0,
    ARMOR_UP: 0,
    BLAST_RESIST: 0,
    KICK: 0,
    WALL_PASS: 0,
    BOMB_PASS: 0,
    TIME_FREEZE: 0,
    MAGNET: 0,
    EXTRA_LIFE: 0,
    SHIELD: 0,
    CLOAK: 0,
    DEFLECTOR: 0,
    SPEED_SURGE: 0,
    VAMPIRIC: 0,
    POISON_MIST: 0,
  };

  return {
    speed: BASE_PLAYER_SPEED,
    speedLevel: 1,
    maxBombs: BASE_MAX_BOMBS,
    activeBombs: 0,
    bombPower: BASE_BOMB_POWER,
    hasKick: false,
    hasShield: false,
    shieldCharges: 0,
    maxShields: 1,
    extraLives: 0,
    hasWallPass: false,
    hasBombPass: false,
    hasMagnet: false,
    hasBlastDeflector: false,
    hasBlastResist: false,
    hasVampiric: false,
    activeBombType: 'REGULAR',
    dashCooldownRemaining: 0,
    activeBuffs: [],
    inventory,
    itemsCollectedTotal: 0,
    itemsCollected: {
      speedUp: 0,
      bombUp: 0,
      fireUp: 0,
      kick: 0,
      shield: 0,
    },
    ultimateGauge: 0,
    ultimateMax: 100,
    isUltimateReady: false,
    ultimateLockoutRemaining: 0,
    score: 0,
    isGameOver: false,
  };
}

/**
 * Probabilistic Item Drop Selection (Legacy 5-item compatibility)
 */
export function determineItemDrop(
  dropRoll: number = Math.random(),
  typeRoll: number = Math.random()
): ItemType | null {
  if (dropRoll >= ITEM_DROP_RATE) return null;

  if (typeRoll < 0.38) {
    return 'BOMB_UP';
  } else if (typeRoll < 0.76) {
    return 'FIRE_UP';
  } else if (typeRoll < 0.92) {
    return 'SPEED_UP';
  } else if (typeRoll < 0.96) {
    return 'KICK';
  } else {
    return 'SHIELD';
  }
}

/**
 * Dynamic 24-Item Drop Table with Tiered Weights, Gilded Chests & Anti-Snowball Cap Redirection
 */
export function rollItemDrop(
  rng: (() => number) | number = Math.random,
  playerStats?: PlayerStats,
  blockType: string = 'BLOCK'
): ItemType | null {
  const getRandom = typeof rng === 'function' ? rng : () => rng;

  // Chests guarantee 100% Rare or Epic drop
  const isChest = blockType === 'CHEST' || blockType === 'TILE_CHEST';
  if (!isChest) {
    const dropRoll = getRandom();
    if (dropRoll >= ITEM_DROP_RATE) return null;
  }

  let tier: ItemRarity;
  if (isChest) {
    // 72% Rare, 28% Epic
    tier = getRandom() < 0.72 ? 'rare' : 'epic';
  } else {
    const tierRoll = getRandom();
    if (tierRoll < 0.60) {
      tier = 'common';
    } else if (tierRoll < 0.82) {
      tier = 'uncommon';
    } else if (tierRoll < 0.95) {
      tier = 'rare';
    } else {
      tier = 'epic';
    }
  }

  // Filter out items that have reached hard caps or unique unlocks (anti-snowball)
  let pool = ITEMS_BY_TIER[tier];
  if (playerStats) {
    const filtered = pool.filter(({ item }) => {
      if (item === 'SPEED_UP' && playerStats.speed >= MAX_PLAYER_SPEED) return false;
      if (item === 'BOMB_UP' && playerStats.maxBombs >= MAX_BOMBS_CAP) return false;
      if (item === 'FIRE_UP' && playerStats.bombPower >= MAX_BOMB_POWER_CAP) return false;
      if (item === 'MEGA_FIRE' && playerStats.bombPower >= MAX_BOMB_POWER_CAP) return false;
      if (item === 'KICK' && playerStats.hasKick) return false;
      if (item === 'WALL_PASS' && playerStats.hasWallPass) return false;
      if (item === 'BOMB_PASS' && playerStats.hasBombPass) return false;
      if (item === 'MAGNET' && playerStats.hasMagnet) return false;
      if (item === 'DEFLECTOR' && playerStats.hasBlastDeflector) return false;
      if (item === 'BLAST_RESIST' && playerStats.hasBlastResist) return false;
      if (item === 'VAMPIRIC' && playerStats.hasVampiric) return false;
      if (item === 'EXTRA_LIFE' && (playerStats.extraLives ?? 0) >= 3) return false;
      return true;
    });
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = getRandom() * totalWeight;
  for (const entry of pool) {
    if (roll < entry.weight) {
      return entry.item;
    }
    roll -= entry.weight;
  }

  return pool[0]?.item || 'BOMB_UP';
}

/**
 * Apply Item Effect for all 24 items with genuine stat/buff mutations
 */
export function applyItemEffect(
  itemType: ItemType,
  stats: PlayerStats,
  scene?: unknown
): { upgraded: boolean; label: string; color: string } {
  const isEpic = ITEM_DEFINITIONS[itemType]?.rarity === 'epic';
  stats.score += isEpic ? 500 : 100;

  if (!stats.inventory) {
    stats.inventory = {} as Record<ItemType, number>;
  }
  stats.inventory[itemType] = (stats.inventory[itemType] || 0) + 1;
  stats.itemsCollectedTotal = (stats.itemsCollectedTotal || 0) + 1;

  if (!stats.activeBuffs) {
    stats.activeBuffs = [];
  }

  const def = ITEM_DEFINITIONS[itemType] || {
    badge: itemType,
    color: '#fbbf24',
  };

  switch (itemType) {
    case 'SPEED_UP': {
      const prev = stats.speed;
      stats.speed = Math.min(MAX_PLAYER_SPEED, stats.speed + SPEED_UP_DELTA);
      stats.speedLevel = calculateSpeedLevel(stats.speed);
      if (stats.itemsCollected) stats.itemsCollected.speedUp++;
      return { upgraded: stats.speed > prev, label: '+SPEED!', color: def.color };
    }
    case 'BOMB_UP': {
      const prev = stats.maxBombs;
      stats.maxBombs = Math.min(MAX_BOMBS_CAP, stats.maxBombs + 1);
      if (stats.itemsCollected) stats.itemsCollected.bombUp++;
      return { upgraded: stats.maxBombs > prev, label: '+BOMB!', color: def.color };
    }
    case 'FIRE_UP': {
      const prev = stats.bombPower;
      stats.bombPower = Math.min(MAX_BOMB_POWER_CAP, stats.bombPower + 1);
      if (stats.itemsCollected) stats.itemsCollected.fireUp++;
      return { upgraded: stats.bombPower > prev, label: '+FIRE!', color: def.color };
    }
    case 'MEGA_FIRE': {
      const prev = stats.bombPower;
      stats.bombPower = MAX_BOMB_POWER_CAP;
      return { upgraded: stats.bombPower > prev, label: 'MAX FIRE POWER!', color: def.color };
    }
    case 'ARMOR_UP': {
      stats.maxShields = 2;
      const prev = stats.shieldCharges || 0;
      stats.shieldCharges = Math.min(2, prev + 1);
      stats.hasShield = true;
      return { upgraded: stats.shieldCharges > prev, label: 'ARMOR UP (+1 SHIELD)!', color: def.color };
    }
    case 'BLAST_RESIST': {
      const prev = stats.hasBlastResist;
      stats.hasBlastResist = true;
      return { upgraded: !prev, label: 'BLAST RESIST!', color: def.color };
    }
    case 'KICK': {
      const prev = stats.hasKick;
      stats.hasKick = true;
      if (stats.itemsCollected) stats.itemsCollected.kick++;
      return { upgraded: !prev, label: 'BOMB KICK!', color: def.color };
    }
    case 'WALL_PASS': {
      const prev = stats.hasWallPass;
      stats.hasWallPass = true;
      return { upgraded: !prev, label: 'WALL PASS!', color: def.color };
    }
    case 'BOMB_PASS': {
      const prev = stats.hasBombPass;
      stats.hasBombPass = true;
      return { upgraded: !prev, label: 'BOMB PASS!', color: def.color };
    }
    case 'TIME_FREEZE': {
      const existing = stats.activeBuffs.find(b => b.id === 'TIME_FREEZE');
      if (existing) {
        existing.remainingMs = 4000;
        existing.totalMs = 4000;
      } else {
        stats.activeBuffs.push({
          id: 'TIME_FREEZE',
          name: 'Time Freeze',
          icon: '⏱️',
          color: '#facc15',
          remainingMs: 4000,
          totalMs: 4000,
        });
      }
      if (scene && typeof scene === 'object') {
        const s = scene as { isTimeFrozen?: boolean; cameras?: { main?: { flash?: (d: number, r: number, g: number, b: number) => void } } };
        s.isTimeFrozen = true;
        s.cameras?.main?.flash?.(200, 250, 204, 21);
      }
      return { upgraded: true, label: 'TIME FREEZE (4s)!', color: def.color };
    }
    case 'MAGNET': {
      const prev = stats.hasMagnet;
      stats.hasMagnet = true;
      return { upgraded: !prev, label: 'ITEM MAGNET!', color: def.color };
    }
    case 'EXTRA_LIFE': {
      const prev = stats.extraLives || 0;
      stats.extraLives = Math.min(3, prev + 1);
      return { upgraded: stats.extraLives > prev, label: '1-UP EXTRA LIFE!', color: def.color };
    }
    case 'SHIELD': {
      stats.hasShield = true;
      const maxS = stats.maxShields || 1;
      const prev = stats.shieldCharges || 0;
      stats.shieldCharges = Math.min(maxS, prev + 1);
      if (stats.itemsCollected) stats.itemsCollected.shield++;
      return { upgraded: true, label: 'SHIELD ON!', color: def.color };
    }
    case 'CLOAK': {
      const existing = stats.activeBuffs.find(b => b.id === 'CLOAK');
      if (existing) {
        existing.remainingMs = 6000;
        existing.totalMs = 6000;
      } else {
        stats.activeBuffs.push({
          id: 'CLOAK',
          name: 'Cloak',
          icon: '👤',
          color: '#c084fc',
          remainingMs: 6000,
          totalMs: 6000,
        });
      }
      if (scene && typeof scene === 'object') {
        const s = scene as { isCloaked?: boolean; player?: { setAlpha?: (a: number) => void } };
        s.isCloaked = true;
        s.player?.setAlpha?.(0.35);
      }
      return { upgraded: true, label: 'CLOAK (6s)!', color: def.color };
    }
    case 'DEFLECTOR': {
      const prev = stats.hasBlastDeflector;
      stats.hasBlastDeflector = true;
      return { upgraded: !prev, label: 'BLAST DEFLECTOR!', color: def.color };
    }
    case 'SPEED_SURGE': {
      const existing = stats.activeBuffs.find(b => b.id === 'SPEED_SURGE');
      if (existing) {
        existing.remainingMs = 8000;
        existing.totalMs = 8000;
      } else {
        stats.activeBuffs.push({
          id: 'SPEED_SURGE',
          name: 'Speed Surge',
          icon: '⚡',
          color: '#84cc16',
          remainingMs: 8000,
          totalMs: 8000,
        });
      }
      return { upgraded: true, label: 'SPEED SURGE (8s)!', color: def.color };
    }
    case 'VAMPIRIC': {
      const prev = stats.hasVampiric;
      stats.hasVampiric = true;
      return { upgraded: !prev, label: 'VAMPIRIC SIPHON!', color: def.color };
    }
    case 'PIERCING_BOMB':
    case 'REMOTE_BOMB':
    case 'CLUSTER_BOMB':
    case 'LANDMINE':
    case 'ICE_BOMB':
    case 'RICOCHET_BOMB':
    case 'POISON_MIST': {
      const prev = stats.activeBombType;
      stats.activeBombType = itemType;
      return { upgraded: prev !== itemType, label: `${def.badge}!`, color: def.color };
    }
  }
}

/**
 * Apply Item Pickup Mutator with Strict Clamping (Delegates to applyItemEffect)
 */
export function applyItemUpgrade(
  stats: PlayerStats,
  itemType: ItemType
): { upgraded: boolean; label: string; color: string } {
  return applyItemEffect(itemType, stats);
}

/**
 * Check if item is within 600ms grace window preventing immediate blast incineration
 */
export function isItemProtectedFromExplosion(spawnTime: number, explosionTime: number): boolean {
  return (explosionTime - spawnTime) <= ITEM_GRACE_PERIOD_MS;
}

/**
 * Simulate Bomb Kick Slide Trajectory
 */
export function simulateBombKickSlide(
  startCol: number,
  startRow: number,
  dirX: number,
  dirY: number,
  map: number[][],
  bombTiles: Set<string> = new Set()
): { endCol: number; endRow: number; steps: number } {
  let currentCol = startCol;
  let currentRow = startRow;
  let steps = 0;

  const rows = map.length;
  const cols = map[0].length;

  while (true) {
    const nextCol = currentCol + dirX;
    const nextRow = currentRow + dirY;

    // Check bounds
    if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
      break;
    }

    // Check impassable wall or block (non-zero)
    if (map[nextRow][nextCol] !== 0) {
      break;
    }

    // Check if another bomb occupies next tile
    if (bombTiles.has(`${nextRow},${nextCol}`)) {
      break;
    }

    currentCol = nextCol;
    currentRow = nextRow;
    steps++;
  }

  return { endCol: currentCol, endRow: currentRow, steps };
}
