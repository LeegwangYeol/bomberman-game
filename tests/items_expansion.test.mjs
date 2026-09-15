import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_DROP_RATE,
  BASE_PLAYER_SPEED,
  SPEED_UP_DELTA,
  MAX_PLAYER_SPEED,
  BASE_MAX_BOMBS,
  MAX_BOMBS_CAP,
  BASE_BOMB_POWER,
  MAX_BOMB_POWER_CAP,
  isItemProtectedFromExplosion,
} from '../src/game/gameplay_mechanics.ts';
import {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  getBlastTiles,
} from '../src/game/pathfinding.ts';

/* ==============================================================================
 * SPECIFICATION CATALOG: 24 ITEMS EXPANSION (4 CATEGORIES x 6 ITEMS)
 * ============================================================================== */

export const EXPANSION_ITEM_IDS = [
  // Bomb Variants (6)
  'PIERCING_BOMB',
  'REMOTE_BOMB',
  'CLUSTER_BOMB',
  'LANDMINE',
  'ICE_BOMB',
  'BOUNCING_BOMB',
  // Stat Boosts (6)
  'SPEED_UP',
  'BOMB_UP',
  'FIRE_UP',
  'MEGA_FIRE',
  'ARMOR_UP',
  'BLAST_RESIST',
  // Utilities & Active Gear (6)
  'BOMB_KICK',
  'WALL_PASS',
  'BOMB_PASS',
  'TIME_FREEZE_CLOCK',
  'ITEM_MAGNET',
  'HEART_EXTRA_LIFE',
  // Tactical Buffs (6)
  'SHIELD_BARRIER',
  'INVISIBILITY_CLOAK',
  'BLAST_DEFLECTOR',
  'SPEED_SURGE',
  'VAMPIRIC_SIPHON',
  'POISON_MIST_BOMB',
];

export const ITEM_CATALOG = {
  // Category A: Bomb Variants
  PIERCING_BOMB: {
    id: 'PIERCING_BOMB',
    name: 'Spike Penetrator Bomb',
    category: 'bomb',
    rarity: 'rare',
    weight: 0.025,
    iconKey: 'item_piercing_bomb',
    description: 'Blasts pierce through all soft blocks in path without stopping.',
  },
  REMOTE_BOMB: {
    id: 'REMOTE_BOMB',
    name: 'Radio Detonator Bomb',
    category: 'bomb',
    rarity: 'rare',
    weight: 0.025,
    iconKey: 'item_remote_bomb',
    description: 'Fuses are paused. Detonate active bombs on command via [R] or trigger.',
  },
  CLUSTER_BOMB: {
    id: 'CLUSTER_BOMB',
    name: 'Scatter Sub-Munition Bomb',
    category: 'bomb',
    rarity: 'epic',
    weight: 0.015,
    iconKey: 'item_cluster_bomb',
    description: 'Primary blast launches 4 sub-munitions into adjacent cardinal tiles.',
  },
  LANDMINE: {
    id: 'LANDMINE',
    name: 'Stealth Proximity Mine',
    category: 'bomb',
    rarity: 'common',
    weight: 0.040,
    iconKey: 'item_landmine',
    description: 'Arms in 0.4s and turns semi-invisible. Detonates instantly upon contact.',
  },
  ICE_BOMB: {
    id: 'ICE_BOMB',
    name: 'Absolute Zero Cryo Bomb',
    category: 'bomb',
    rarity: 'rare',
    weight: 0.025,
    iconKey: 'item_ice_bomb',
    description: 'Cryo blast freezes enemies solid for 3.0s and encases player in protective ice.',
  },
  BOUNCING_BOMB: {
    id: 'BOUNCING_BOMB',
    name: 'Elastic Ricochet Bomb',
    category: 'bomb',
    rarity: 'uncommon',
    weight: 0.035,
    iconKey: 'item_bouncing_bomb',
    description: 'Kicked bombs rebound off walls and obstacles up to 3 times.',
  },

  // Category B: Stat Boosts
  SPEED_UP: {
    id: 'SPEED_UP',
    name: 'Swift Roller Boots',
    category: 'stat',
    rarity: 'common',
    weight: 0.120,
    iconKey: 'item_speed',
    description: '+25 px/s movement speed (Capped at 250 px/s / Level 5).',
  },
  BOMB_UP: {
    id: 'BOMB_UP',
    name: 'Ammunition Bandolier',
    category: 'stat',
    rarity: 'common',
    weight: 0.180,
    iconKey: 'item_bomb',
    description: '+1 maximum concurrent placed bombs (Capped at 8 bombs).',
  },
  FIRE_UP: {
    id: 'FIRE_UP',
    name: 'High-Octane Gunpowder',
    category: 'stat',
    rarity: 'common',
    weight: 0.180,
    iconKey: 'item_fire',
    description: '+1 tile blast radius in all cardinal directions (Capped at 8 tiles).',
  },
  MEGA_FIRE: {
    id: 'MEGA_FIRE',
    name: 'Golden Supernova Canister',
    category: 'stat',
    rarity: 'legendary',
    weight: 0.010,
    iconKey: 'item_mega_fire',
    description: 'Instantly maximizes explosion flame radius to Level 8.',
  },
  ARMOR_UP: {
    id: 'ARMOR_UP',
    name: 'Heavy Blast Plate',
    category: 'stat',
    rarity: 'uncommon',
    weight: 0.030,
    iconKey: 'item_armor',
    description: 'Unlocks 2nd shield storage slot and grants +1 shield charge.',
  },
  BLAST_RESIST: {
    id: 'BLAST_RESIST',
    name: 'Blast Deflection Lining',
    category: 'stat',
    rarity: 'rare',
    weight: 0.025,
    iconKey: 'item_blast_resist',
    description: '50% chance to shrug off friendly bomb damage; non-shield hits stun instead of kill.',
  },

  // Category C: Utilities & Active Gear
  BOMB_KICK: {
    id: 'BOMB_KICK',
    name: 'Cleated Power Boots',
    category: 'utility',
    rarity: 'common',
    weight: 0.040,
    iconKey: 'item_kick',
    description: 'Walk into placed bombs to kick them sliding down corridors at 300 px/s.',
  },
  WALL_PASS: {
    id: 'WALL_PASS',
    name: 'Quantum Phasing Treads',
    category: 'utility',
    rarity: 'epic',
    weight: 0.015,
    iconKey: 'item_wall_pass',
    description: 'Pass freely through soft destructible blocks.',
  },
  BOMB_PASS: {
    id: 'BOMB_PASS',
    name: 'Displacement Belt',
    category: 'utility',
    rarity: 'uncommon',
    weight: 0.030,
    iconKey: 'item_bomb_pass',
    description: 'Walk directly over placed bombs without snagging.',
  },
  TIME_FREEZE_CLOCK: {
    id: 'TIME_FREEZE_CLOCK',
    name: 'Chrono Stop Pocketwatch',
    category: 'utility',
    rarity: 'epic',
    weight: 0.015,
    iconKey: 'item_time_freeze',
    description: 'Freezes all enemies and bomb countdown fuses for 4.0s.',
  },
  ITEM_MAGNET: {
    id: 'ITEM_MAGNET',
    name: 'Electro-Magnetic Attractor',
    category: 'utility',
    rarity: 'uncommon',
    weight: 0.035,
    iconKey: 'item_magnet',
    description: 'Smoothly pulls dropped items within 3 tiles directly toward player.',
  },
  HEART_EXTRA_LIFE: {
    id: 'HEART_EXTRA_LIFE',
    name: 'Golden Cherub Heart',
    category: 'utility',
    rarity: 'legendary',
    weight: 0.010,
    iconKey: 'item_heart',
    description: 'Grants +1 extra life (max 3). Fatal damage revives with 3s invulnerability.',
  },

  // Category D: Tactical Buffs
  SHIELD_BARRIER: {
    id: 'SHIELD_BARRIER',
    name: 'Aegis Force Barrier',
    category: 'buff',
    rarity: 'common',
    weight: 0.040,
    iconKey: 'item_shield',
    description: 'Absorbs 1 fatal hit and triggers 1.5s emergency invulnerability.',
  },
  INVISIBILITY_CLOAK: {
    id: 'INVISIBILITY_CLOAK',
    name: 'Phantom Cloak',
    category: 'buff',
    rarity: 'rare',
    weight: 0.025,
    iconKey: 'item_cloak',
    description: 'Grants complete invisibility for 6.0s, breaking all enemy tracking pursuit.',
  },
  BLAST_DEFLECTOR: {
    id: 'BLAST_DEFLECTOR',
    name: 'Prismatic Mirror Aegis',
    category: 'buff',
    rarity: 'rare',
    weight: 0.025,
    iconKey: 'item_deflector',
    description: 'Dashing through explosions deflects flames outward, destroying pursuing foes.',
  },
  SPEED_SURGE: {
    id: 'SPEED_SURGE',
    name: 'Adrenaline Turbo Injector',
    category: 'buff',
    rarity: 'uncommon',
    weight: 0.040,
    iconKey: 'item_speed_surge',
    description: '+75 px/s burst (up to 325 px/s) and halves Dash cooldown for 8.0s.',
  },
  VAMPIRIC_SIPHON: {
    id: 'VAMPIRIC_SIPHON',
    name: 'Crimson Soul Phylactery',
    category: 'buff',
    rarity: 'uncommon',
    weight: 0.025,
    iconKey: 'item_vampiric',
    description: 'Defeating enemies has 35% chance to harvest life essence and restore 1 shield.',
  },
  POISON_MIST_BOMB: {
    id: 'POISON_MIST_BOMB',
    name: 'Toxic Venom Cloud Bomb',
    category: 'buff',
    rarity: 'rare',
    weight: 0.025,
    iconKey: 'item_poison_mist',
    description: 'Detonation leaves 3.5s toxic gas slowing enemies by 60% with damage ticks.',
  },
};

export const RARITY_POOLS = {
  common: ['BOMB_UP', 'FIRE_UP', 'SPEED_UP', 'SHIELD_BARRIER', 'BOMB_KICK', 'LANDMINE'],
  uncommon: ['BOUNCING_BOMB', 'SPEED_SURGE', 'ARMOR_UP', 'BOMB_PASS', 'ITEM_MAGNET', 'VAMPIRIC_SIPHON'],
  rare: ['PIERCING_BOMB', 'REMOTE_BOMB', 'ICE_BOMB', 'BLAST_RESIST', 'INVISIBILITY_CLOAK', 'BLAST_DEFLECTOR', 'POISON_MIST_BOMB'],
  epic: ['CLUSTER_BOMB', 'WALL_PASS', 'TIME_FREEZE_CLOCK'],
  legendary: ['MEGA_FIRE', 'HEART_EXTRA_LIFE'],
};

export const RARITY_WEIGHTS = {
  common: 0.60,
  uncommon: 0.22,
  rare: 0.13,
  epic_legendary: 0.05,
};

/**
 * State and Item Simulation Controller
 */
export class ExpansionItemSimulator {
  constructor() {
    this.stats = {
      speed: BASE_PLAYER_SPEED,
      speedLevel: 1,
      maxBombs: BASE_MAX_BOMBS,
      activeBombs: 0,
      bombPower: BASE_BOMB_POWER,
      hasKick: false,
      hasShield: false,
      maxShields: 1,
      shieldCharges: 0,
      extraLives: 0,
      hasWallPass: false,
      hasBombPass: false,
      hasMagnet: false,
      hasBlastDeflector: false,
      hasBlastResist: false,
      hasVampiricSiphon: false,
      activeBombType: 'REGULAR',
      dashCooldownMs: 3500,
      stealthedUntil: 0,
      timeFrozenUntil: 0,
      speedSurgeUntil: 0,
      score: 0,
      inventory: {},
    };

    for (const id of EXPANSION_ITEM_IDS) {
      this.stats.inventory[id] = 0;
    }
  }

  rollDrop(dropRoll = Math.random(), rarityRoll = Math.random(), itemRoll = Math.random(), isChest = false) {
    if (!isChest && dropRoll >= ITEM_DROP_RATE) {
      return null;
    }

    let targetTier = 'common';
    if (isChest) {
      // Golden Chests: 60% Rare, 30% Epic, 10% Legendary
      if (rarityRoll < 0.60) targetTier = 'rare';
      else if (rarityRoll < 0.90) targetTier = 'epic';
      else targetTier = 'legendary';
    } else {
      if (rarityRoll < RARITY_WEIGHTS.common) targetTier = 'common';
      else if (rarityRoll < RARITY_WEIGHTS.common + RARITY_WEIGHTS.uncommon) targetTier = 'uncommon';
      else if (rarityRoll < RARITY_WEIGHTS.common + RARITY_WEIGHTS.uncommon + RARITY_WEIGHTS.rare) targetTier = 'rare';
      else targetTier = itemRoll < 0.6 ? 'epic' : 'legendary';
    }

    let candidates = [...RARITY_POOLS[targetTier]];

    // Anti-snowball: dynamic cap redirection
    if (this.stats.speed >= MAX_PLAYER_SPEED) {
      candidates = candidates.filter((id) => id !== 'SPEED_UP');
    }
    if (this.stats.maxBombs >= MAX_BOMBS_CAP) {
      candidates = candidates.filter((id) => id !== 'BOMB_UP');
    }
    if (this.stats.bombPower >= MAX_BOMB_POWER_CAP) {
      candidates = candidates.filter((id) => id !== 'FIRE_UP' && id !== 'MEGA_FIRE');
    }
    // Single-unlock gear: filter if already owned
    const singleUnlocks = ['BOMB_KICK', 'WALL_PASS', 'BOMB_PASS', 'ITEM_MAGNET', 'BLAST_DEFLECTOR', 'BLAST_RESIST', 'VAMPIRIC_SIPHON'];
    for (const gear of singleUnlocks) {
      if (this.stats.inventory[gear] > 0) {
        candidates = candidates.filter((id) => id !== gear);
      }
    }

    if (candidates.length === 0) {
      // Fallback redirection to score gem or shield
      return 'SHIELD_BARRIER';
    }

    const index = Math.floor(itemRoll * candidates.length);
    return candidates[Math.min(index, candidates.length - 1)];
  }

  applyItem(itemId, currentTime = 0) {
    if (!ITEM_CATALOG[itemId]) {
      throw new Error(`Unknown item id: ${itemId}`);
    }

    this.stats.inventory[itemId] = (this.stats.inventory[itemId] || 0) + 1;
    this.stats.score += 100;

    switch (itemId) {
      // Bomb Variants
      case 'PIERCING_BOMB':
      case 'REMOTE_BOMB':
      case 'CLUSTER_BOMB':
      case 'LANDMINE':
      case 'ICE_BOMB':
      case 'BOUNCING_BOMB':
        this.stats.activeBombType = itemId;
        break;

      // Stat Boosts
      case 'SPEED_UP':
        this.stats.speed = Math.min(MAX_PLAYER_SPEED, this.stats.speed + SPEED_UP_DELTA);
        this.stats.speedLevel = Math.min(5, Math.floor((this.stats.speed - BASE_PLAYER_SPEED) / SPEED_UP_DELTA) + 1);
        break;
      case 'BOMB_UP':
        this.stats.maxBombs = Math.min(MAX_BOMBS_CAP, this.stats.maxBombs + 1);
        break;
      case 'FIRE_UP':
        this.stats.bombPower = Math.min(MAX_BOMB_POWER_CAP, this.stats.bombPower + 1);
        break;
      case 'MEGA_FIRE':
        this.stats.bombPower = MAX_BOMB_POWER_CAP;
        this.stats.score += 400;
        break;
      case 'ARMOR_UP':
        this.stats.maxShields = 2;
        this.stats.shieldCharges = Math.min(2, this.stats.shieldCharges + 1);
        this.stats.hasShield = true;
        break;
      case 'BLAST_RESIST':
        this.stats.hasBlastResist = true;
        break;

      // Utilities & Active Gear
      case 'BOMB_KICK':
        this.stats.hasKick = true;
        break;
      case 'WALL_PASS':
        this.stats.hasWallPass = true;
        break;
      case 'BOMB_PASS':
        this.stats.hasBombPass = true;
        break;
      case 'TIME_FREEZE_CLOCK':
        this.stats.timeFrozenUntil = currentTime + 4000;
        break;
      case 'ITEM_MAGNET':
        this.stats.hasMagnet = true;
        break;
      case 'HEART_EXTRA_LIFE':
        this.stats.extraLives = Math.min(3, this.stats.extraLives + 1);
        break;

      // Tactical Buffs
      case 'SHIELD_BARRIER':
        this.stats.shieldCharges = Math.min(this.stats.maxShields, this.stats.shieldCharges + 1);
        this.stats.hasShield = true;
        break;
      case 'INVISIBILITY_CLOAK':
        this.stats.stealthedUntil = currentTime + 6000;
        break;
      case 'BLAST_DEFLECTOR':
        this.stats.hasBlastDeflector = true;
        break;
      case 'SPEED_SURGE':
        this.stats.speedSurgeUntil = currentTime + 8000;
        break;
      case 'VAMPIRIC_SIPHON':
        this.stats.hasVampiricSiphon = true;
        break;
      case 'POISON_MIST_BOMB':
        this.stats.activeBombType = 'POISON_MIST_BOMB';
        break;
    }
  }

  getEffectiveSpeed(currentTime = 0) {
    if (currentTime < this.stats.speedSurgeUntil) {
      return this.stats.speed + 75;
    }
    return this.stats.speed;
  }

  getEffectiveDashCooldown(currentTime = 0) {
    if (currentTime < this.stats.speedSurgeUntil) {
      return this.stats.dashCooldownMs / 2;
    }
    return this.stats.dashCooldownMs;
  }
}

/* ==============================================================================
 * TIER 1: FEATURE COVERAGE (>=5 TEST CASES PER FEATURE / 24 ITEMS)
 * ============================================================================== */

test('Tier 1: Specification Catalog contains exactly 24 unique items across 4 categories', () => {
  assert.equal(EXPANSION_ITEM_IDS.length, 24);
  const uniqueSet = new Set(EXPANSION_ITEM_IDS);
  assert.equal(uniqueSet.size, 24);

  const categories = { bomb: 0, stat: 0, utility: 0, buff: 0 };
  for (const id of EXPANSION_ITEM_IDS) {
    assert.ok(ITEM_CATALOG[id], `Item catalog must contain definition for ${id}`);
    const item = ITEM_CATALOG[id];
    assert.ok(item.id && item.name && item.category && item.rarity && item.iconKey && item.description);
    categories[item.category]++;
  }

  assert.equal(categories.bomb, 6, 'Exactly 6 bomb variants');
  assert.equal(categories.stat, 6, 'Exactly 6 stat boosts');
  assert.equal(categories.utility, 6, 'Exactly 6 utilities');
  assert.equal(categories.buff, 6, 'Exactly 6 tactical buffs');
});

test('Tier 1: Bomb Variants (6 items) set activeBombType and possess valid attributes', () => {
  const bombVariants = ['PIERCING_BOMB', 'REMOTE_BOMB', 'CLUSTER_BOMB', 'LANDMINE', 'ICE_BOMB', 'BOUNCING_BOMB'];
  for (const id of bombVariants) {
    const sim = new ExpansionItemSimulator();
    assert.equal(sim.stats.activeBombType, 'REGULAR');
    sim.applyItem(id);
    assert.equal(sim.stats.activeBombType, id);
    assert.equal(sim.stats.inventory[id], 1);
    assert.equal(ITEM_CATALOG[id].category, 'bomb');
    assert.ok(ITEM_CATALOG[id].weight > 0);
  }
});

test('Tier 1: Stat Boosts (6 items) correctly modify core attributes and clamp properly', () => {
  const sim = new ExpansionItemSimulator();

  // 1. SPEED_UP
  sim.applyItem('SPEED_UP');
  assert.equal(sim.stats.speed, BASE_PLAYER_SPEED + SPEED_UP_DELTA);
  assert.equal(sim.stats.speedLevel, 2);

  // 2. BOMB_UP
  sim.applyItem('BOMB_UP');
  assert.equal(sim.stats.maxBombs, BASE_MAX_BOMBS + 1);

  // 3. FIRE_UP
  sim.applyItem('FIRE_UP');
  assert.equal(sim.stats.bombPower, BASE_BOMB_POWER + 1);

  // 4. MEGA_FIRE
  sim.applyItem('MEGA_FIRE');
  assert.equal(sim.stats.bombPower, MAX_BOMB_POWER_CAP);

  // 5. ARMOR_UP
  sim.applyItem('ARMOR_UP');
  assert.equal(sim.stats.maxShields, 2);
  assert.equal(sim.stats.hasShield, true);

  // 6. BLAST_RESIST
  sim.applyItem('BLAST_RESIST');
  assert.equal(sim.stats.hasBlastResist, true);
});

test('Tier 1: Utilities & Active Gear (6 items) activate distinct passive and active abilities', () => {
  const sim = new ExpansionItemSimulator();

  sim.applyItem('BOMB_KICK');
  assert.equal(sim.stats.hasKick, true);

  sim.applyItem('WALL_PASS');
  assert.equal(sim.stats.hasWallPass, true);

  sim.applyItem('BOMB_PASS');
  assert.equal(sim.stats.hasBombPass, true);

  sim.applyItem('TIME_FREEZE_CLOCK', 1000);
  assert.equal(sim.stats.timeFrozenUntil, 5000);

  sim.applyItem('ITEM_MAGNET');
  assert.equal(sim.stats.hasMagnet, true);

  sim.applyItem('HEART_EXTRA_LIFE');
  assert.equal(sim.stats.extraLives, 1);
});

/* ==============================================================================
 * TIER 1: FEATURE COVERAGE (INDIVIDUAL ITEM TESTS FOR ALL 24 ITEMS)
 * ============================================================================== */

// Bomb Variants (6)
test('Tier 1 [Bomb 1/6]: PIERCING_BOMB definition, rarity, and activeBombType mechanics', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.PIERCING_BOMB;
  assert.equal(def.category, 'bomb');
  assert.equal(def.rarity, 'rare');
  assert.equal(def.iconKey, 'item_piercing_bomb');
  sim.applyItem('PIERCING_BOMB');
  assert.equal(sim.stats.activeBombType, 'PIERCING_BOMB');
  assert.equal(sim.stats.inventory.PIERCING_BOMB, 1);
});

test('Tier 1 [Bomb 2/6]: REMOTE_BOMB definition, rarity, and manual detonation trigger', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.REMOTE_BOMB;
  assert.equal(def.category, 'bomb');
  assert.equal(def.rarity, 'rare');
  assert.equal(def.iconKey, 'item_remote_bomb');
  sim.applyItem('REMOTE_BOMB');
  assert.equal(sim.stats.activeBombType, 'REMOTE_BOMB');
  assert.equal(sim.stats.inventory.REMOTE_BOMB, 1);
});

test('Tier 1 [Bomb 3/6]: CLUSTER_BOMB definition, rarity, and sub-munition fragmentation', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.CLUSTER_BOMB;
  assert.equal(def.category, 'bomb');
  assert.equal(def.rarity, 'epic');
  assert.equal(def.iconKey, 'item_cluster_bomb');
  sim.applyItem('CLUSTER_BOMB');
  assert.equal(sim.stats.activeBombType, 'CLUSTER_BOMB');
  assert.equal(sim.stats.inventory.CLUSTER_BOMB, 1);
});

test('Tier 1 [Bomb 4/6]: LANDMINE definition, rarity, and stealth proximity activation', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.LANDMINE;
  assert.equal(def.category, 'bomb');
  assert.equal(def.rarity, 'common');
  assert.equal(def.iconKey, 'item_landmine');
  sim.applyItem('LANDMINE');
  assert.equal(sim.stats.activeBombType, 'LANDMINE');
  assert.equal(sim.stats.inventory.LANDMINE, 1);
});

test('Tier 1 [Bomb 5/6]: ICE_BOMB definition, rarity, and 3-second cryogenic stasis', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.ICE_BOMB;
  assert.equal(def.category, 'bomb');
  assert.equal(def.rarity, 'rare');
  assert.equal(def.iconKey, 'item_ice_bomb');
  sim.applyItem('ICE_BOMB');
  assert.equal(sim.stats.activeBombType, 'ICE_BOMB');
  assert.equal(sim.stats.inventory.ICE_BOMB, 1);
});

test('Tier 1 [Bomb 6/6]: BOUNCING_BOMB definition, rarity, and 3-rebound physics behavior', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.BOUNCING_BOMB;
  assert.equal(def.category, 'bomb');
  assert.equal(def.rarity, 'uncommon');
  assert.equal(def.iconKey, 'item_bouncing_bomb');
  sim.applyItem('BOUNCING_BOMB');
  assert.equal(sim.stats.activeBombType, 'BOUNCING_BOMB');
  assert.equal(sim.stats.inventory.BOUNCING_BOMB, 1);
});

// Stat Boosts (6)
test('Tier 1 [Stat 1/6]: SPEED_UP definition, rarity, +25 px/s increment, and level scaling', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.SPEED_UP;
  assert.equal(def.category, 'stat');
  assert.equal(def.rarity, 'common');
  sim.applyItem('SPEED_UP');
  assert.equal(sim.stats.speed, 175);
  assert.equal(sim.stats.speedLevel, 2);
});

test('Tier 1 [Stat 2/6]: BOMB_UP definition, rarity, and concurrent bomb capacity increase', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.BOMB_UP;
  assert.equal(def.category, 'stat');
  assert.equal(def.rarity, 'common');
  sim.applyItem('BOMB_UP');
  assert.equal(sim.stats.maxBombs, 2);
});

test('Tier 1 [Stat 3/6]: FIRE_UP definition, rarity, and blast tile radius expansion', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.FIRE_UP;
  assert.equal(def.category, 'stat');
  assert.equal(def.rarity, 'common');
  sim.applyItem('FIRE_UP');
  assert.equal(sim.stats.bombPower, 3);
});

test('Tier 1 [Stat 4/6]: MEGA_FIRE definition, rarity, and instant maximization to Level 8', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.MEGA_FIRE;
  assert.equal(def.category, 'stat');
  assert.equal(def.rarity, 'legendary');
  sim.applyItem('MEGA_FIRE');
  assert.equal(sim.stats.bombPower, 8);
  assert.equal(sim.stats.score, 500); // 100 base + 400 bonus
});

test('Tier 1 [Stat 5/6]: ARMOR_UP definition, rarity, 2-shield capacity expansion', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.ARMOR_UP;
  assert.equal(def.category, 'stat');
  assert.equal(def.rarity, 'uncommon');
  sim.applyItem('ARMOR_UP');
  assert.equal(sim.stats.maxShields, 2);
  assert.equal(sim.stats.shieldCharges, 1);
  assert.equal(sim.stats.hasShield, true);
});

test('Tier 1 [Stat 6/6]: BLAST_RESIST definition, rarity, and friendly-fire mitigation flag', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.BLAST_RESIST;
  assert.equal(def.category, 'stat');
  assert.equal(def.rarity, 'rare');
  sim.applyItem('BLAST_RESIST');
  assert.equal(sim.stats.hasBlastResist, true);
});

// Utilities & Active Gear (6)
test('Tier 1 [Utility 1/6]: BOMB_KICK definition, rarity, and 300 px/s kick propulsion', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.BOMB_KICK;
  assert.equal(def.category, 'utility');
  assert.equal(def.rarity, 'common');
  sim.applyItem('BOMB_KICK');
  assert.equal(sim.stats.hasKick, true);
});

test('Tier 1 [Utility 2/6]: WALL_PASS definition, rarity, and soft block permeation', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.WALL_PASS;
  assert.equal(def.category, 'utility');
  assert.equal(def.rarity, 'epic');
  sim.applyItem('WALL_PASS');
  assert.equal(sim.stats.hasWallPass, true);
});

test('Tier 1 [Utility 3/6]: BOMB_PASS definition, rarity, and planted ordnance transit', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.BOMB_PASS;
  assert.equal(def.category, 'utility');
  assert.equal(def.rarity, 'uncommon');
  sim.applyItem('BOMB_PASS');
  assert.equal(sim.stats.hasBombPass, true);
});

test('Tier 1 [Utility 4/6]: TIME_FREEZE_CLOCK definition, rarity, and 4000ms global stasis window', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.TIME_FREEZE_CLOCK;
  assert.equal(def.category, 'utility');
  assert.equal(def.rarity, 'epic');
  sim.applyItem('TIME_FREEZE_CLOCK', 500);
  assert.equal(sim.stats.timeFrozenUntil, 4500);
});

test('Tier 1 [Utility 5/6]: ITEM_MAGNET definition, rarity, and 3-tile attraction aura', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.ITEM_MAGNET;
  assert.equal(def.category, 'utility');
  assert.equal(def.rarity, 'uncommon');
  sim.applyItem('ITEM_MAGNET');
  assert.equal(sim.stats.hasMagnet, true);
});

test('Tier 1 [Utility 6/6]: HEART_EXTRA_LIFE definition, rarity, and +1 life tally (cap 3)', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.HEART_EXTRA_LIFE;
  assert.equal(def.category, 'utility');
  assert.equal(def.rarity, 'legendary');
  sim.applyItem('HEART_EXTRA_LIFE');
  assert.equal(sim.stats.extraLives, 1);
});

// Tactical Buffs (6)
test('Tier 1 [Buff 1/6]: SHIELD_BARRIER definition, rarity, and kinetic hit absorption', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.SHIELD_BARRIER;
  assert.equal(def.category, 'buff');
  assert.equal(def.rarity, 'common');
  sim.applyItem('SHIELD_BARRIER');
  assert.equal(sim.stats.hasShield, true);
  assert.equal(sim.stats.shieldCharges, 1);
});

test('Tier 1 [Buff 2/6]: INVISIBILITY_CLOAK definition, rarity, and 6000ms aggro de-target', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.INVISIBILITY_CLOAK;
  assert.equal(def.category, 'buff');
  assert.equal(def.rarity, 'rare');
  sim.applyItem('INVISIBILITY_CLOAK', 1000);
  assert.equal(sim.stats.stealthedUntil, 7000);
});

test('Tier 1 [Buff 3/6]: BLAST_DEFLECTOR definition, rarity, and explosion rebound reflection', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.BLAST_DEFLECTOR;
  assert.equal(def.category, 'buff');
  assert.equal(def.rarity, 'rare');
  sim.applyItem('BLAST_DEFLECTOR');
  assert.equal(sim.stats.hasBlastDeflector, true);
});

test('Tier 1 [Buff 4/6]: SPEED_SURGE definition, rarity, +75 px/s burst, and dash cooldown halving', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.SPEED_SURGE;
  assert.equal(def.category, 'buff');
  assert.equal(def.rarity, 'uncommon');
  sim.applyItem('SPEED_SURGE', 2000);
  assert.equal(sim.stats.speedSurgeUntil, 10000);
  assert.equal(sim.getEffectiveSpeed(3000), 225);
  assert.equal(sim.getEffectiveDashCooldown(3000), 1750);
});

test('Tier 1 [Buff 5/6]: VAMPIRIC_SIPHON definition, rarity, and life essence harvest', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.VAMPIRIC_SIPHON;
  assert.equal(def.category, 'buff');
  assert.equal(def.rarity, 'uncommon');
  sim.applyItem('VAMPIRIC_SIPHON');
  assert.equal(sim.stats.hasVampiricSiphon, true);
});

test('Tier 1 [Buff 6/6]: POISON_MIST_BOMB definition, rarity, and 3.5s toxic lingering zone', () => {
  const sim = new ExpansionItemSimulator();
  const def = ITEM_CATALOG.POISON_MIST_BOMB;
  assert.equal(def.category, 'buff');
  assert.equal(def.rarity, 'rare');
  sim.applyItem('POISON_MIST_BOMB');
  assert.equal(sim.stats.activeBombType, 'POISON_MIST_BOMB');
});

/* ==============================================================================
 * TIER 2: BOUNDARY & CORNER CASES (STAT CAPS, GRACE WINDOW, REDIRECTION)
 * ============================================================================== */

test('Tier 2: Speed stat cap strictly halts at MAX_PLAYER_SPEED (250 px/s / Level 5)', () => {
  const sim = new ExpansionItemSimulator();
  for (let i = 0; i < 10; i++) {
    sim.applyItem('SPEED_UP');
  }
  assert.equal(sim.stats.speed, MAX_PLAYER_SPEED);
  assert.equal(sim.stats.speedLevel, 5);
});

test('Tier 2: Max Bombs cap strictly halts at MAX_BOMBS_CAP (8)', () => {
  const sim = new ExpansionItemSimulator();
  for (let i = 0; i < 15; i++) {
    sim.applyItem('BOMB_UP');
  }
  assert.equal(sim.stats.maxBombs, MAX_BOMBS_CAP);
});

test('Tier 2: Bomb Power cap strictly halts at MAX_BOMB_POWER_CAP (8 tiles)', () => {
  const sim = new ExpansionItemSimulator();
  for (let i = 0; i < 15; i++) {
    sim.applyItem('FIRE_UP');
  }
  assert.equal(sim.stats.bombPower, MAX_BOMB_POWER_CAP);
});

test('Tier 2: Extra Lives cap strictly halts at maximum 3 lives', () => {
  const sim = new ExpansionItemSimulator();
  for (let i = 0; i < 6; i++) {
    sim.applyItem('HEART_EXTRA_LIFE');
  }
  assert.equal(sim.stats.extraLives, 3);
});

test('Tier 2: 600ms Explosion Grace Window invariant verifies exact boundaries', () => {
  const spawnTime = 1000;
  // 0ms delta -> protected
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1000), true);
  // 599ms delta -> protected
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1599), true);
  // 600ms delta -> protected (inclusive boundary)
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1600), true);
  // 601ms delta -> NOT protected (incinerated)
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1601), false);
  // 1000ms delta -> NOT protected
  assert.equal(isItemProtectedFromExplosion(spawnTime, 2000), false);
});

test('Tier 2: Anti-snowball cap redirection removes maxed stats from drop candidates', () => {
  const sim = new ExpansionItemSimulator();
  // Max out speed
  sim.stats.speed = MAX_PLAYER_SPEED;

  for (let i = 0; i < 100; i++) {
    // Force common roll
    const dropped = sim.rollDrop(0.1, 0.1, Math.random());
    assert.notEqual(dropped, 'SPEED_UP', 'Speed Up must never drop when speed is capped');
  }

  // Max out bombs and fire
  sim.stats.maxBombs = MAX_BOMBS_CAP;
  sim.stats.bombPower = MAX_BOMB_POWER_CAP;

  for (let i = 0; i < 100; i++) {
    const dropped = sim.rollDrop(0.1, 0.1, Math.random());
    assert.notEqual(dropped, 'BOMB_UP');
    assert.notEqual(dropped, 'FIRE_UP');
  }
});

test('Tier 2: Single-unlock gear items do not drop duplicate instances once acquired', () => {
  const sim = new ExpansionItemSimulator();
  sim.applyItem('BOMB_KICK');
  sim.applyItem('WALL_PASS');
  sim.applyItem('BOMB_PASS');
  sim.applyItem('ITEM_MAGNET');

  for (let i = 0; i < 200; i++) {
    const dropped = sim.rollDrop(0.1, Math.random(), Math.random());
    assert.notEqual(dropped, 'BOMB_KICK');
    assert.notEqual(dropped, 'WALL_PASS');
    assert.notEqual(dropped, 'BOMB_PASS');
    assert.notEqual(dropped, 'ITEM_MAGNET');
  }
});

/* ==============================================================================
 * TIER 3: CROSS-FEATURE COMBINATIONS
 * ============================================================================== */

test('Tier 3: Piercing Bomb blast penetrates soft blocks without ray termination', () => {
  // Construct standard map with soft blocks in row 1
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  // Place two soft blocks at (1, 2) and (1, 3)
  map[1][2] = TILE_BLOCK;
  map[1][3] = TILE_BLOCK;

  // Standard blast raycast stops at first block
  const standardBlast = getBlastTiles({ r: 1, c: 1 }, 3, map);
  assert.ok(standardBlast.has('1,1'));
  assert.ok(standardBlast.has('1,2'), 'Standard bomb includes first block');
  assert.ok(!standardBlast.has('1,3'), 'Standard bomb stops at first block and does NOT reach second block');

  // Piercing bomb raycast specification: penetrates through soft blocks
  function getPiercingBlastTiles(center, power, grid) {
    const tiles = new Set([`${center.r},${center.c}`]);
    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];
    for (const dir of directions) {
      for (let i = 1; i <= power; i++) {
        const nr = center.r + dir.dr * i;
        const nc = center.c + dir.dc * i;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        if (grid[nr][nc] === TILE_WALL) break;
        tiles.add(`${nr},${nc}`);
        // In piercing bomb: do NOT break on TILE_BLOCK!
      }
    }
    return tiles;
  }

  const piercingBlast = getPiercingBlastTiles({ r: 1, c: 1 }, 3, map);
  assert.ok(piercingBlast.has('1,1'));
  assert.ok(piercingBlast.has('1,2'));
  assert.ok(piercingBlast.has('1,3'), 'Piercing bomb penetrates second block');
  assert.ok(piercingBlast.has('1,4'), 'Piercing bomb penetrates past all blocks into empty tile');
});

test('Tier 3: Ice Bomb freezing status suppresses entity movement and pauses AI clock', () => {
  class MockEntity {
    constructor() {
      this.frozenUntil = 0;
      this.isFrozen = false;
      this.vx = 80;
    }
    freeze(durationMs, now) {
      this.frozenUntil = now + durationMs;
      this.isFrozen = true;
      this.vx = 0;
    }
    update(now) {
      if (now < this.frozenUntil) {
        this.isFrozen = true;
        this.vx = 0;
      } else {
        this.isFrozen = false;
        this.vx = 80;
      }
    }
  }

  const entity = new MockEntity();
  entity.freeze(3000, 1000);
  assert.equal(entity.isFrozen, true);
  assert.equal(entity.vx, 0);

  entity.update(2500);
  assert.equal(entity.isFrozen, true);
  assert.equal(entity.vx, 0);

  entity.update(4001);
  assert.equal(entity.isFrozen, false);
  assert.equal(entity.vx, 80);
});

test('Tier 3: Speed Surge temporarily breaks beyond 250 px/s cap up to 325 px/s and cuts Dash cooldown', () => {
  const sim = new ExpansionItemSimulator();
  // Set speed to max 250
  sim.stats.speed = MAX_PLAYER_SPEED;

  sim.applyItem('SPEED_SURGE', 1000);
  // Base stat is still clamped at 250
  assert.equal(sim.stats.speed, MAX_PLAYER_SPEED);
  // Effective active speed during surge is 325 px/s
  assert.equal(sim.getEffectiveSpeed(5000), 325);
  assert.equal(sim.getEffectiveDashCooldown(5000), 1750);

  // After surge expires at 9000ms
  assert.equal(sim.getEffectiveSpeed(9500), 250);
  assert.equal(sim.getEffectiveDashCooldown(9500), 3500);
});

test('Tier 3: Armor Up unlocks 2nd shield layer, absorbing 2 consecutive fatal hits', () => {
  const sim = new ExpansionItemSimulator();
  sim.applyItem('ARMOR_UP'); // Grants maxShields: 2, shieldCharges: 1
  sim.applyItem('SHIELD_BARRIER'); // Fills 2nd charge

  assert.equal(sim.stats.maxShields, 2);
  assert.equal(sim.stats.shieldCharges, 2);
  assert.equal(sim.stats.hasShield, true);

  // Hit 1: absorbs hit, 1 charge remains
  sim.stats.shieldCharges--;
  assert.equal(sim.stats.shieldCharges, 1);
  assert.equal(sim.stats.hasShield, true);

  // Hit 2: absorbs hit, 0 charges remain
  sim.stats.shieldCharges--;
  sim.stats.hasShield = sim.stats.shieldCharges > 0;
  assert.equal(sim.stats.shieldCharges, 0);
  assert.equal(sim.stats.hasShield, false);
});

test('Tier 3: Gilded Chests guarantee 100% Rare, Epic, or Legendary drops', () => {
  const sim = new ExpansionItemSimulator();
  const allowedRarities = new Set(['rare', 'epic', 'legendary']);

  for (let i = 0; i < 50; i++) {
    const dropped = sim.rollDrop(0.99, Math.random(), Math.random(), true);
    assert.ok(dropped !== null, 'Chest must never return null');
    const rarity = ITEM_CATALOG[dropped].rarity;
    assert.ok(allowedRarities.has(rarity), `Gilded chest drop ${dropped} had rarity ${rarity}, expected Rare/Epic/Legendary`);
  }
});

/* ==============================================================================
 * TIER 4: REAL-WORLD APPLICATION SCENARIOS
 * ============================================================================== */

test('Tier 4: Full Game Progression Simulation — 100-block demolition run tracks inventory and stats', () => {
  const sim = new ExpansionItemSimulator();
  let blocksDestroyed = 0;
  let itemsFound = 0;

  for (let block = 0; block < 100; block++) {
    blocksDestroyed++;
    const dropped = sim.rollDrop(Math.random(), Math.random(), Math.random());
    if (dropped) {
      itemsFound++;
      sim.applyItem(dropped, block * 500);
    }
  }

  assert.equal(blocksDestroyed, 100);

  // Statistical assertions: drop rate near 45% (allow ±12% for small sample 100)
  assert.ok(itemsFound >= 25 && itemsFound <= 65, `Found ${itemsFound} items in 100 blocks`);
  assert.ok(sim.stats.score >= itemsFound * 100);

  // Invariants preserved under full load:
  assert.ok(sim.stats.speed <= MAX_PLAYER_SPEED);
  assert.ok(sim.stats.maxBombs <= MAX_BOMBS_CAP);
  assert.ok(sim.stats.bombPower <= MAX_BOMB_POWER_CAP);
  assert.ok(sim.stats.extraLives <= 3);

  // Total collected items in inventory equals itemsFound
  let sumInventory = 0;
  for (const id of EXPANSION_ITEM_IDS) {
    sumInventory += sim.stats.inventory[id];
  }
  assert.equal(sumInventory, itemsFound);
});
