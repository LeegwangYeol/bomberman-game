/**
 * Gameplay Mechanics, Item Drop Tables, Stat Clamping, Skills & Gimmicks Engine.
 */

export type ItemType = 'SPEED_UP' | 'BOMB_UP' | 'FIRE_UP' | 'KICK' | 'SHIELD';

export interface PlayerStats {
  speed: number;
  speedLevel: number;        // 1 to 5
  maxBombs: number;          // 1 to 8
  activeBombs: number;       // Current placed on board by player
  bombPower: number;         // 2 to 8 (blast radius in tiles)
  hasKick: boolean;          // Bomb kick unlocked
  hasShield: boolean;        // Shield active (absorbs 1 fatal hit)
  dashCooldownRemaining: number; // 0 = ready, > 0 = ms left
  itemsCollected: {
    speedUp: number;
    bombUp: number;
    fireUp: number;
    kick: number;
    shield: number;
  };
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
  return {
    speed: BASE_PLAYER_SPEED,
    speedLevel: 1,
    maxBombs: BASE_MAX_BOMBS,
    activeBombs: 0,
    bombPower: BASE_BOMB_POWER,
    hasKick: false,
    hasShield: false,
    dashCooldownRemaining: 0,
    itemsCollected: {
      speedUp: 0,
      bombUp: 0,
      fireUp: 0,
      kick: 0,
      shield: 0,
    },
    score: 0,
    isGameOver: false,
  };
}

/**
 * Probabilistic Item Drop Selection
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
 * Apply Item Pickup Mutator with Strict Clamping
 */
export function applyItemUpgrade(
  stats: PlayerStats,
  itemType: ItemType
): { upgraded: boolean; label: string; color: string } {
  stats.score += 100;

  switch (itemType) {
    case 'SPEED_UP': {
      const prev = stats.speed;
      stats.speed = Math.min(MAX_PLAYER_SPEED, stats.speed + SPEED_UP_DELTA);
      stats.speedLevel = calculateSpeedLevel(stats.speed);
      stats.itemsCollected.speedUp++;
      return { upgraded: stats.speed > prev, label: '+SPEED!', color: '#22d3ee' };
    }
    case 'BOMB_UP': {
      const prev = stats.maxBombs;
      stats.maxBombs = Math.min(MAX_BOMBS_CAP, stats.maxBombs + 1);
      stats.itemsCollected.bombUp++;
      return { upgraded: stats.maxBombs > prev, label: '+BOMB!', color: '#e2e8f0' };
    }
    case 'FIRE_UP': {
      const prev = stats.bombPower;
      stats.bombPower = Math.min(MAX_BOMB_POWER_CAP, stats.bombPower + 1);
      stats.itemsCollected.fireUp++;
      return { upgraded: stats.bombPower > prev, label: '+FIRE!', color: '#f87171' };
    }
    case 'KICK': {
      const prev = stats.hasKick;
      stats.hasKick = true;
      stats.itemsCollected.kick++;
      return { upgraded: !prev, label: 'BOMB KICK!', color: '#4ade80' };
    }
    case 'SHIELD': {
      stats.hasShield = true;
      stats.itemsCollected.shield++;
      return { upgraded: true, label: 'SHIELD ON!', color: '#fbbf24' };
    }
  }
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
