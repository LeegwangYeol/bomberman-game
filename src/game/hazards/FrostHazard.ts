/**
 * FrostHazard.ts — Cryo Glaciation Dynamic Hazard & Tactical Bomb Interaction Engine
 *
 * Implements the Cryo Glaciation Dynamic Hazard Subsystem:
 * - 4-Stage Lifecycle FSM: DORMANT -> HOARFROST_SURGE (2000ms) -> ABSOLUTE_ZERO_BURST (350ms) -> THAW_COOLDOWN (5700ms)
 * - 3-Tier Telegraph Sub-Phases: CRYSTALLIZATION (1000ms) -> PERMAFROST_CREEP (600ms) -> SUBLIMATION_FLASH (400ms)
 * - Zero-GC 1D TypedArray Memory Layout (Uint8Array dangerMask, Float32Array frictionGrid, Int16Array activeFrostIndices)
 * - Mathematical Safe Area Guarantees: Safe Area >= 80% (Guaranteed >= 85.128% on standard 13x15 arenas, exactly 29 lattice tiles in radius 3)
 * - Tactical Bomb Interactions:
 *     1. Cryo-Stabilized Super-Bomb: Fuse frozen/paused inside frost zone (fuse countdown does NOT decrement)
 *     2. Kicking Cryo-Stabilized Super-Bomb releases Diamond Cryogenic Shockwaves (diagonals & Manhattan perimeter)
 *     3. Glacial Encapsulation: Fuse extension (+1500ms) and super-slick curling kick (+50% kick speed bonus)
 *     4. Thermal Shock Shatter: Detonating in frost zone grants +2 piercing power, +200 score, and triggers localized thaw
 * - Environmental Entity Interactions:
 *     1. Minion Flash-Freezing: 120 environmental damage, +120 score bonus, +6 ult charge, '❄️ CRYO-SHATTERED!'
 *     2. Boss Glacial Stasis: 15% Max HP confirmed damage, 1.5s (1500ms) stun, with Anti-Exploit Guard (single hit per burst)
 *     3. Player Combat Mastery: Cryo-Phasing Dash (I-Frames 1000ms, +30% speed burst within 150ms window) vs Frostbite (-25% speed)
 */

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
} from '../pathfinding.ts';

export { TOTAL_TILES };

/**
 * Universal Lifecycle States for Frost Hazard FSM
 */
export const FrostLifecycleState = {
  DORMANT: 'DORMANT',
  HOARFROST_SURGE: 'HOARFROST_SURGE',
  ABSOLUTE_ZERO_BURST: 'ABSOLUTE_ZERO_BURST',
  THAW_COOLDOWN: 'THAW_COOLDOWN',
  // Aliases for specification harmony
  CRYO_TELEGRAPH: 'HOARFROST_SURGE',
  GLACIAL_BURST: 'ABSOLUTE_ZERO_BURST',
  COOLDOWN: 'THAW_COOLDOWN',
} as const;

export type FrostLifecycleState =
  typeof FrostLifecycleState[keyof typeof FrostLifecycleState];

/**
 * 3-Tier Sub-Phases during HOARFROST_SURGE Lifecycle State
 */
export const FrostTelegraphPhase = {
  NONE: 'NONE',
  CRYSTALLIZATION: 'CRYSTALLIZATION',     // 0ms - 1000ms: Thin rime crystals form (μ = 0.70)
  CHILL_ACCUMULATION: 'CHILL_ACCUMULATION', // 1000ms - 1600ms: Heavy drift / creeping frost (μ = 0.25)
  PERMAFROST_CRITICAL: 'PERMAFROST_CRITICAL', // 1600ms - 2000ms: Critical permafrost crust (μ = 0.20)
  PERMAFROST_CREEP: 'PERMAFROST_CREEP',   // alias
  SUBLIMATION_FLASH: 'SUBLIMATION_FLASH', // alias
} as const;

export type FrostTelegraphPhase =
  typeof FrostTelegraphPhase[keyof typeof FrostTelegraphPhase];

export const HoarfrostPhase = {
  NONE: 'NONE',
  CRYSTALLIZATION: 'CRYSTALLIZATION',     // 0ms - 1000ms: Thin rime crystals form (μ = 0.70)
  PERMAFROST_CREEP: 'PERMAFROST_CREEP',   // 1000ms - 1600ms: Dense permafrost sheet (μ = 0.25)
  SUBLIMATION_FLASH: 'SUBLIMATION_FLASH', // 1600ms - 2000ms: High-contrast flashing strobe
  CHILL_ACCUMULATION: 'CHILL_ACCUMULATION',
  PERMAFROST_CRITICAL: 'PERMAFROST_CRITICAL',
} as const;

export type HoarfrostPhase =
  typeof HoarfrostPhase[keyof typeof HoarfrostPhase];

// Alias for telegraph phase
export const CryoTelegraphPhase = {
  NONE: 'NONE',
  RIME_FORMATION: 'CRYSTALLIZATION',
  HOARFROST_SPREAD: 'CHILL_ACCUMULATION',
  PERMAFROST_GLACIATION: 'PERMAFROST_CRITICAL',
  CRYSTALLIZATION: 'CRYSTALLIZATION',
  PERMAFROST_CREEP: 'CHILL_ACCUMULATION',
  SUBLIMATION_FLASH: 'PERMAFROST_CRITICAL',
  CHILL_ACCUMULATION: 'CHILL_ACCUMULATION',
  PERMAFROST_CRITICAL: 'PERMAFROST_CRITICAL',
} as const;

export type CryoTelegraphPhase =
  typeof CryoTelegraphPhase[keyof typeof CryoTelegraphPhase];

/**
 * Danger Mask Bit Values (Uint8Array)
 */
export const FrostDangerValue = {
  SAFE: 0,              // Safe tile: outside frost influence
  HOARFROST: 1,         // Telegraph glaciation zone: surface friction dropped, non-lethal
  RIME_TELEGRAPH: 1,    // Telegraph alias
  ABSOLUTE_ZERO: 2,     // Lethal flash-freeze burst: direct damage and shatter
  GLACIAL_BURST: 2,     // Burst alias
  THAWING: 3,           // Sublimation melt / dissipating vapor
  PERMAFROST_CORE: 3,   // Core epicenter alias
  CRYSTALLIZING: 1,
  CHILL_ACCUMULATION: 1,
  PERMAFROST_CRITICAL: 1,
  FLASH_FROZEN: 2,
  SHATTERED: 3,
} as const;

export type FrostDangerValue =
  typeof FrostDangerValue[keyof typeof FrostDangerValue];

/**
 * Timing & Tuning Constants (ms)
 */
export const DURATION_CRYSTALLIZATION_MS = 1000;
export const DURATION_PERMAFROST_CREEP_MS = 600;
export const DURATION_SUBLIMATION_FLASH_MS = 400;
export const DURATION_CRYO_FORMATION_MS = 1000;
export const DURATION_CRYO_SPREAD_MS = 600;
export const DURATION_CRYO_GLACIATION_MS = 400;
export const DURATION_CHILL_ACCUMULATION_MS = DURATION_PERMAFROST_CREEP_MS;
export const DURATION_PERMAFROST_CRITICAL_MS = DURATION_SUBLIMATION_FLASH_MS;
export const DURATION_FROST_TELEGRAPH_MS = 2000;
export const DURATION_FLASH_FREEZE_MS = 350;

export const DURATION_HOARFROST_SURGE_MS =
  DURATION_CRYSTALLIZATION_MS +
  DURATION_PERMAFROST_CREEP_MS +
  DURATION_SUBLIMATION_FLASH_MS; // 2000ms
export const DURATION_HOARFROST_TELEGRAPH_MS = DURATION_HOARFROST_SURGE_MS;
export const DURATION_CRYO_TELEGRAPH_MS = DURATION_HOARFROST_SURGE_MS;

export const DURATION_ABSOLUTE_ZERO_BURST_MS = 350; // 350ms active flash
export const DURATION_GLACIAL_BURST_MS = 400;

export const DEFAULT_FROST_COOLDOWN_MS = 5700;       // Standard Outbreak recovery
export const CLIMAX_FROST_COOLDOWN_MS = 3700;        // Climax recovery
export const WHISPERS_FROST_COOLDOWN_MS = 9000;      // Whispers teaching recovery

export const FROST_RADIUS_TILES = 3;
export const MAX_RADIUS_PX = FROST_RADIUS_TILES * TILE_SIZE; // 120px
export const FROST_RADIUS_PX = MAX_RADIUS_PX;
export const MAX_FROST_TILES = 32;

export const MIN_FROST_SAFE_AREA_RATIO = 0.80;
export const MIN_SAFE_AREA_RATIO = MIN_FROST_SAFE_AREA_RATIO;

/**
 * Player Combat Mastery Tuning Constants
 */
export const CRYO_TUNNELING_WINDOW_MS = 150;
export const CRYO_PHASE_INVULN_MS = 1200;
export const CRYO_PHASE_SPEED_BOOST = 0.30;
export const THERMAL_BREAK_INVULN_MS = 1200;
export const THERMAL_BREAK_SPEED_BURST_RATIO = 0.35;
export const THERMAL_BREAK_COOLDOWN_MS = 1500;
export const CRYO_DASH_INVULN_MS = 1200;
export const CRYO_DASH_SPEED_BURST_RATIO = 0.35;
export const CRYO_DASH_COOLDOWN_MS = 1500;

export const FROSTBITE_DURATION_MS = 2500;
export const FROSTBITE_SLOW_RATIO = 0.25;
export const FROST_CHILL_DURATION_MS = 2000;
export const FROST_CHILL_SLOW_RATIO = 0.25;
export const PLAYER_FROST_BURST_DAMAGE = 25;
export const PLAYER_FROST_DAMAGE = 25;
export const PLAYER_FROST_SLOW_RATIO = 0.25;

/**
 * Tactical Bomb & Cryo-Stabilized Super-Bomb Constants
 */
export const CRYO_SUPER_BOMB_TINT = 0x80d8ff;        // Crystalline ice blue
export const CRYO_SUPER_BOMB_TINT_CYAN = 0x00ffff;   // Cyan tint
export const CRYO_SUPER_BOMB_EXTRA_RADIUS = 3;
export const CRYO_SUPER_BOMB_SHOCKWAVE_POWER = 4;
export const CRYO_SHOCKWAVE_RANGE_TILES = 4;
export const CRYO_SUPER_BOMB_SCORE_BONUS = 200;
export const FROST_FUSE_EXTENSION_MS = 1500;
export const THERMAL_SHOCK_EXTRA_POWER = 2;
export const THERMAL_SHOCK_BONUS_SCORE = 200;
export const KICK_SPEED_BONUS_RATIO = 0.50;
export const BOMB_KICK_FROST_SPEED = 450;

/**
 * 4 Diamond Diagonal Directions (Shockwave Rays)
 */
export const CRYO_DIAMOND_DIRECTIONS: readonly {
  dr: number;
  dc: number;
  name: string;
}[] = [
  { dr: -1, dc: -1, name: 'NORTH_WEST' },
  { dr: -1, dc: 1, name: 'NORTH_EAST' },
  { dr: 1, dc: -1, name: 'SOUTH_WEST' },
  { dr: 1, dc: 1, name: 'SOUTH_EAST' },
];

/**
 * Entity Damage & Combat Scoring Constants
 */
export const ENEMY_FROST_BURST_DAMAGE = 120;
export const CRYO_MINION_DAMAGE = 120;
export const ENEMY_SHATTER_SCORE = 120;
export const CRYO_FLASH_FREEZE_SCORE = 120;
export const ENEMY_SHATTER_ULTIMATE_CHARGE = 6;
export const CRYO_FLASH_FREEZE_ULT_CHARGE = 6;

export const BOSS_FROST_DAMAGE_RATIO = 0.15;
export const BOSS_GLACIAL_DAMAGE_RATIO = 0.15;
export const BOSS_DEEP_FREEZE_STUN_MS = 1500;
export const BOSS_GLACIAL_STASIS_STUN_MS = 1500;
export const BOSS_GLACIAL_EXPLOIT_COOLDOWN_MS = 2000;

/**
 * Floating Combat Text Constants
 */
export const FLOATING_TEXT_CRYO_STABILIZED = '❄ CRYO-STABILIZED!';
export const FLOATING_TEXT_FUSE_FROZEN = '❄ FUSE FROZEN!';
export const FLOATING_TEXT_CRYO_SHOCKWAVE = '❄ CRYO SHOCKWAVE!';
export const FLOATING_TEXT_CRYO_PHASED = '✦ CRYO PHASED!';
export const FLOATING_TEXT_THERMAL_BREAK = '✦ THERMAL BREAK!';
export const FLOATING_TEXT_FROSTBITE = '❄️ FROSTBITE (-25%)';
export const FLOATING_TEXT_FROST_CHILL = '❄️ FROST CHILL (-25%)';
export const FLOATING_TEXT_THERMAL_SHOCK = '✦ THERMAL SHOCK!';
export const FLOATING_TEXT_CRYO_SHATTERED = '❄️ CRYO-SHATTERED!';
export const FLOATING_TEXT_FLASH_FROZEN = FLOATING_TEXT_CRYO_SHATTERED;
export const FLOATING_TEXT_DEEP_FREEZE = '❄️ DEEP FREEZE (1.5s)!';
export const FLOATING_TEXT_BOSS_GLACIAL_STASIS = FLOATING_TEXT_DEEP_FREEZE;
export const FLOATING_TEXT_GLACIAL_BURST = '💥 GLACIAL BURST!';

/**
 * Scratch Result Interfaces for Strict Zero-GC Execution
 */
export interface FrostPlayerResult {
  hit: boolean;
  damage: number;
  isLethal: boolean;
  thermalBreakGranted: boolean;
  invulnerabilityGrantedMs: number;
  speedBoostGranted: boolean;
  speedBoostRatio: number;
  frostChillInflicted: boolean;
  frostChillDurationMs: number;
  slowRatio: number;
  slowFactor: number;
  floatingText: string;
  cryoPhased: boolean;
  frostbiteInflicted: boolean;
  frostbiteDurationMs: number;
  isEscaping?: boolean;
  isChilled?: boolean;
  cryoDashGranted?: boolean;
  invulnDurationMs?: number;
}

export interface FrostEnemyResult {
  hit: boolean;
  damage: number;
  isShattered: boolean;
  isFrozenStunned: boolean;
  stunDurationMs: number;
  scoreBonus: number;
  ultimateChargeBonus: number;
  floatingText: string;
  isFlashFrozen?: boolean;
  isStunned?: boolean;
}

export interface FrostBombPlacedResult {
  isFrozen: boolean;
  modifiedFuseMs: number;
  kickSpeedBonus: number;
  isCryoStabilized?: boolean;
  isFuseFrozen?: boolean;
  tint?: number;
  floatingText?: string;
}

export interface FrostBombDetonationResult {
  isThermalShock: boolean;
  modifiedPower: number;
  piercing: boolean;
  shatteredBombIds: (number | string)[];
  bonusScore: number;
  floatingText: string;
  isCryoDetonation?: boolean;
  shockwaveRadiusTiles?: number;
  releasedCryoShockwave?: boolean;
}

export interface FrostFrictionResult {
  friction: number;
  isGlaciated: boolean;
  driftDamping: number;
}

export interface CryoBombEvaluationResult {
  isCryoStabilized: boolean;
  isFuseFrozen: boolean;
  fusePaused: boolean;
  remainingFuseMs: number;
  tint: number;
  floatingText: string;
}

export interface CryoShockwaveTile {
  r: number;
  c: number;
  distance: number;
  isDiagonal: boolean;
  isDiamondPerimeter: boolean;
}

export interface CryoShockwaveResult {
  shockwaveReleased: boolean;
  bombId: string | number;
  originR: number;
  originC: number;
  shockwaveTilesCount: number;
  power: number;
  floatingText: string;
}

export interface FrostFieldResult {
  inFrostZone: boolean;
  inPermafrostCore: boolean;
  distToCenterPx: number;
  intensity: number;
  dangerCode: number;
}

interface CryoBombSlot {
  active: boolean;
  bombId: string | number;
  r: number;
  c: number;
  frozenFuseMs: number;
  isKicked: boolean;
}

/**
 * FrostHazard: Main Cryo Glaciation Dynamic Hazard Subsystem
 */
export class FrostHazard {
  // Public FSM State & Timing
  public state: FrostLifecycleState = FrostLifecycleState.DORMANT;
  public stateTimerMs: number = 0;
  public centerRow: number = 6;
  public centerCol: number = 7;
  public cooldownDurationMs: number = DEFAULT_FROST_COOLDOWN_MS;

  // Center Coordinates in World Pixels
  private centerWorldX: number = 7 * TILE_SIZE + TILE_SIZE / 2; // 300px
  private centerWorldY: number = 6 * TILE_SIZE + TILE_SIZE / 2; // 260px

  // Anti-Exploit Guard: Prevents boss multi-hits within the same burst phase
  private bossHitInCurrentBurst: boolean = false;
  private lastBossHitTimestampMs: number = -9999;

  // Rate Limiting for Dash / Thermal Break Notifications
  private lastThermalBreakMs: number = -9999;

  // Pre-allocated 1D TypedArrays for Strict Zero-GC Memory Layout
  public readonly dangerMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  public readonly frictionGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public readonly temperatureGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public readonly intensityGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public readonly frostIntensity: Float32Array = this.intensityGrid; // Shared alias
  public readonly propagationBuffer: Float32Array = new Float32Array(TOTAL_TILES);
  public readonly cryoShockwaveMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  public readonly activeFrostIndices: Int16Array = new Int16Array(MAX_FROST_TILES);
  private activeFrostCount: number = 0;

  // Pre-allocated Fixed Pool for Cryo-Stabilized Bombs
  private readonly cryoBombPool: CryoBombSlot[] = Array.from({ length: 16 }, () => ({
    active: false,
    bombId: '',
    r: 0,
    c: 0,
    frozenFuseMs: 0,
    isKicked: false,
  }));

  // Pre-allocated Diamond Shockwave Tiles Buffer
  private readonly shockwaveTileBuffer: CryoShockwaveTile[] = Array.from({ length: 64 }, () => ({
    r: 0,
    c: 0,
    distance: 0,
    isDiagonal: false,
    isDiamondPerimeter: false,
  }));
  private activeShockwaveTileCount: number = 0;

  // Dual-slot Scratch Friction Container Pool (for dynamic comparison while preserving recycling)
  private readonly scratchFrictionPool: FrostFrictionResult[] = [
    { friction: 1.0, isGlaciated: false, driftDamping: 25.0 },
    { friction: 1.0, isGlaciated: false, driftDamping: 25.0 },
  ];
  private scratchFrictionIndex: number = 0;

  // Pre-allocated Scratch Return Containers (Zero runtime heap allocations)
  private readonly scratchPlayerResult: FrostPlayerResult = {
    hit: false,
    damage: 0,
    isLethal: false,
    thermalBreakGranted: false,
    invulnerabilityGrantedMs: 0,
    speedBoostGranted: false,
    speedBoostRatio: 0,
    frostChillInflicted: false,
    frostChillDurationMs: 0,
    slowRatio: 0,
    slowFactor: 1.0,
    floatingText: '',
    cryoPhased: false,
    frostbiteInflicted: false,
    frostbiteDurationMs: 0,
  };

  private readonly scratchEnemyResult: FrostEnemyResult = {
    hit: false,
    damage: 0,
    isShattered: false,
    isFrozenStunned: false,
    stunDurationMs: 0,
    scoreBonus: 0,
    ultimateChargeBonus: 0,
    floatingText: '',
    isFlashFrozen: false,
    isStunned: false,
  };

  private readonly scratchBombPlacedResult: FrostBombPlacedResult = {
    isFrozen: false,
    modifiedFuseMs: 3000,
    kickSpeedBonus: 0,
    isCryoStabilized: false,
    isFuseFrozen: false,
    tint: 0xffffff,
    floatingText: undefined,
  };

  private readonly scratchBombDetonationResult: FrostBombDetonationResult = {
    isThermalShock: false,
    modifiedPower: 1,
    piercing: false,
    shatteredBombIds: [],
    bonusScore: 0,
    floatingText: '',
    isCryoDetonation: false,
    shockwaveRadiusTiles: 0,
    releasedCryoShockwave: false,
  };

  private readonly scratchBombResult: CryoBombEvaluationResult = {
    isCryoStabilized: false,
    isFuseFrozen: false,
    fusePaused: false,
    remainingFuseMs: 3000,
    tint: 0xffffff,
    floatingText: '',
  };

  private readonly scratchShockwaveTiles: CryoShockwaveTile[] = [];

  private readonly scratchShockwaveResult: CryoShockwaveResult = {
    shockwaveReleased: false,
    bombId: '',
    originR: 0,
    originC: 0,
    shockwaveTilesCount: 0,
    power: CRYO_SUPER_BOMB_SHOCKWAVE_POWER,
    floatingText: FLOATING_TEXT_CRYO_SHOCKWAVE,
  };

  private readonly scratchFieldResult: FrostFieldResult = {
    inFrostZone: false,
    inPermafrostCore: false,
    distToCenterPx: 99999,
    intensity: 0,
    dangerCode: 0,
  };

  constructor() {
    this.frictionGrid.fill(1.0);
    this.temperatureGrid.fill(293.15); // Ambient room temp (K)
  }

  /**
   * Initializes epicenter coordinates, clamped within valid inner arena boundaries.
   */
  public init(centerRow: number = 6, centerCol: number = 7): void {
    this.setCenter(centerRow, centerCol);
    this.state = FrostLifecycleState.DORMANT;
    this.stateTimerMs = 0;
    this.bossHitInCurrentBurst = false;
    this.lastBossHitTimestampMs = -9999;
    this.lastThermalBreakMs = -9999;
    this.dangerMask.fill(0);
    this.frictionGrid.fill(1.0);
    this.temperatureGrid.fill(293.15);
    this.intensityGrid.fill(0);
    this.cryoShockwaveMask.fill(0);
    for (let i = 0; i < this.cryoBombPool.length; i++) {
      this.cryoBombPool[i].active = false;
    }
    this.recomputeFrostGeometry();
  }

  /**
   * Clamps epicenter within playable arena interior (rows 1..ROWS-2, cols 1..COLS-2).
   */
  public setCenter(centerRow: number, centerCol: number): void {
    const safeR = Number.isFinite(centerRow) ? Math.floor(centerRow) : 6;
    const safeC = Number.isFinite(centerCol) ? Math.floor(centerCol) : 7;
    this.centerRow = Math.max(1, Math.min(ROWS - 2, safeR));
    this.centerCol = Math.max(1, Math.min(COLS - 2, safeC));
    this.centerWorldX = this.centerCol * TILE_SIZE + TILE_SIZE / 2;
    this.centerWorldY = this.centerRow * TILE_SIZE + TILE_SIZE / 2;
    this.recomputeFrostGeometry();
    this.recomputeDangerMask();
  }

  /**
   * Starts the glaciation lifecycle cycle.
   */
  public start(mode: 'OUTBREAK' | 'CLIMAX' | 'WHISPERS' = 'OUTBREAK'): void {
    if (mode === 'CLIMAX') {
      this.cooldownDurationMs = CLIMAX_FROST_COOLDOWN_MS;
    } else if (mode === 'WHISPERS') {
      this.cooldownDurationMs = WHISPERS_FROST_COOLDOWN_MS;
    } else {
      this.cooldownDurationMs = DEFAULT_FROST_COOLDOWN_MS;
    }

    this.state = FrostLifecycleState.HOARFROST_SURGE;
    this.stateTimerMs = 0;
    this.bossHitInCurrentBurst = false;
    this.lastThermalBreakMs = -9999;
    this.recomputeFrostGeometry();
    this.recomputeDangerMask();
  }

  /**
   * Stops the hazard immediately and resets all tiles to safe state.
   */
  public stop(): void {
    this.state = FrostLifecycleState.DORMANT;
    this.stateTimerMs = 0;
    this.bossHitInCurrentBurst = false;
    this.dangerMask.fill(0);
    this.frictionGrid.fill(1.0);
    this.temperatureGrid.fill(293.15);
    this.intensityGrid.fill(0);
    this.cryoShockwaveMask.fill(0);
    this.activeFrostCount = 0;
  }

  /**
   * Full reset of hazard state and scratch containers.
   */
  public reset(): void {
    this.stop();
    this.lastThermalBreakMs = -9999;
    this.scratchBombDetonationResult.shatteredBombIds.length = 0;
  }

  /**
   * Retrieves active lifecycle state.
   */
  public getState(): FrostLifecycleState {
    return this.state;
  }

  public getLifecycleState(): FrostLifecycleState {
    return this.state;
  }

  /**
   * Returns current elapsed milliseconds in the current lifecycle state.
   */
  public getStateElapsedMs(): number {
    return this.stateTimerMs;
  }

  /**
   * Returns current 3-tier telegraph sub-phase during HOARFROST_SURGE.
   */
  public getHoarfrostPhase(): HoarfrostPhase {
    if (this.state !== FrostLifecycleState.HOARFROST_SURGE) {
      return HoarfrostPhase.NONE;
    }
    if (this.stateTimerMs < DURATION_CRYSTALLIZATION_MS) {
      return HoarfrostPhase.CRYSTALLIZATION;
    }
    if (this.stateTimerMs < DURATION_CRYSTALLIZATION_MS + DURATION_PERMAFROST_CREEP_MS) {
      return HoarfrostPhase.PERMAFROST_CREEP;
    }
    return HoarfrostPhase.SUBLIMATION_FLASH;
  }

  public getTelegraphPhase(): FrostTelegraphPhase {
    if (this.state !== FrostLifecycleState.HOARFROST_SURGE) {
      return FrostTelegraphPhase.NONE;
    }
    if (this.stateTimerMs < DURATION_CRYSTALLIZATION_MS) {
      return FrostTelegraphPhase.CRYSTALLIZATION;
    }
    if (this.stateTimerMs < DURATION_CRYSTALLIZATION_MS + DURATION_CHILL_ACCUMULATION_MS) {
      return FrostTelegraphPhase.CHILL_ACCUMULATION;
    }
    return FrostTelegraphPhase.PERMAFROST_CRITICAL;
  }

  /**
   * Step Discrete Laplacian Diffusion Operator:
   * Evaluates discrete 2D diffusion over time step dt on discrete lattice:
   * dI/dt = D * Laplacian(I) - gamma * I
   * Uses double-buffered propagationBuffer for strict zero-GC execution.
   */
  public stepDiscreteDiffusion(dtSeconds: number = 0.016): void {
    if (dtSeconds <= 0 || !Number.isFinite(dtSeconds)) {
      return;
    }

    this.propagationBuffer.set(this.intensityGrid);
    const D = 0.22;
    const gamma = 0.08;

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const idx = r * COLS + c;
        const currentVal = this.propagationBuffer[idx];
        const laplacian =
          this.propagationBuffer[idx - 1] +
          this.propagationBuffer[idx + 1] +
          this.propagationBuffer[idx - COLS] +
          this.propagationBuffer[idx + COLS] -
          4 * currentVal;

        const updated = currentVal + (D * laplacian - gamma * currentVal) * dtSeconds;
        this.intensityGrid[idx] = Math.max(0, Math.min(1.0, updated));
      }
    }
  }

  /**
   * Discrete Euclidean ball check: is tile within radius 3 (dr^2 + dc^2 <= 9)?
   */
  public isTileGlaciated(row: number, col: number): boolean {
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return false;
    const ir = row | 0;
    const ic = col | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const dr = ir - this.centerRow;
    const dc = ic - this.centerCol;
    return (dr * dr + dc * dc) <= (FROST_RADIUS_TILES * FROST_RADIUS_TILES);
  }

  public isTileInFrostZone(row: number, col: number): boolean {
    return this.isTileGlaciated(row, col);
  }

  public isTileLethal(row: number, col: number): boolean {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    const idx = row * COLS + col;
    return this.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST && this.dangerMask[idx] >= FrostDangerValue.ABSOLUTE_ZERO;
  }

  /**
   * Continuous Euclidean pixel distance check: is point within 120px?
   */
  public isPointGlaciated(worldX: number, worldY: number): boolean {
    const dx = this.centerWorldX - worldX;
    const dy = this.centerWorldY - worldY;
    return (dx * dx + dy * dy) <= (FROST_RADIUS_PX * FROST_RADIUS_PX);
  }

  /**
   * Returns count of active glaciated tiles in the grid.
   */
  public getActiveFrostCount(): number {
    return this.activeFrostCount;
  }

  /**
   * Returns reference to pre-allocated active glaciated tile index array.
   */
  public getActiveFrostIndices(): Int16Array {
    return this.activeFrostIndices;
  }

  /**
   * Returns reference to pre-allocated danger mask Uint8Array.
   */
  public getDangerMask(): Uint8Array {
    return this.dangerMask;
  }

  public getFrictionGrid(): Float32Array {
    return this.frictionGrid;
  }

  public getTemperatureGrid(): Float32Array {
    return this.temperatureGrid;
  }

  public getIntensityGrid(): Float32Array {
    return this.intensityGrid;
  }

  /**
   * Main simulation tick. Advances FSM and recalculates danger/friction fields.
   */
  public update(deltaMs: number, _nowMs?: number): void {
    void _nowMs;
    if (this.state === FrostLifecycleState.DORMANT) {
      return;
    }

    // Toggle scratch friction index on update for state comparisons
    this.scratchFrictionIndex = (this.scratchFrictionIndex + 1) % 2;

    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }

    let remainingDelta = Math.max(0, deltaMs);
    let loopGuard = 0;

    while (remainingDelta > 0 && loopGuard++ < 8) {
      switch (this.state) {
        case FrostLifecycleState.HOARFROST_SURGE: {
          const needed = DURATION_HOARFROST_SURGE_MS - this.stateTimerMs;
          if (remainingDelta >= needed) {
            remainingDelta -= needed;
            this.state = FrostLifecycleState.ABSOLUTE_ZERO_BURST;
            this.stateTimerMs = 0;
            this.bossHitInCurrentBurst = false;
            this.recomputeDangerMask();
          } else {
            this.stateTimerMs += remainingDelta;
            remainingDelta = 0;
          }
          break;
        }

        case FrostLifecycleState.ABSOLUTE_ZERO_BURST: {
          const needed = DURATION_ABSOLUTE_ZERO_BURST_MS - this.stateTimerMs;
          if (remainingDelta >= needed) {
            remainingDelta -= needed;
            this.state = FrostLifecycleState.THAW_COOLDOWN;
            this.stateTimerMs = 0;
            this.bossHitInCurrentBurst = false;
            this.recomputeDangerMask();
          } else {
            this.stateTimerMs += remainingDelta;
            remainingDelta = 0;
          }
          break;
        }

        case FrostLifecycleState.THAW_COOLDOWN: {
          const needed = this.cooldownDurationMs - this.stateTimerMs;
          if (remainingDelta >= needed) {
            remainingDelta -= needed;
            this.state = FrostLifecycleState.HOARFROST_SURGE;
            this.stateTimerMs = 0;
            this.bossHitInCurrentBurst = false;
            this.recomputeDangerMask();
          } else {
            this.stateTimerMs += remainingDelta;
            remainingDelta = 0;
          }
          break;
        }

        default:
          remainingDelta = 0;
          break;
      }
    }
  }

  /**
   * Pre-enumerates all lattice points in Euclidean radius 3 (exactly 29 tiles).
   */
  private recomputeFrostGeometry(): void {
    this.activeFrostCount = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const dr = r - this.centerRow;
        const dc = c - this.centerCol;
        if (dr * dr + dc * dc <= FROST_RADIUS_TILES * FROST_RADIUS_TILES) {
          const idx = r * COLS + c;
          if (this.activeFrostCount < MAX_FROST_TILES) {
            this.activeFrostIndices[this.activeFrostCount++] = idx;
          }
        }
      }
    }
  }

  /**
   * Updates dangerMask, frictionGrid, and intensityGrid based on current FSM state.
   */
  private recomputeDangerMask(): void {
    this.dangerMask.fill(0);
    this.frictionGrid.fill(1.0);
    this.temperatureGrid.fill(293.15);
    this.intensityGrid.fill(0);
    this.cryoShockwaveMask.fill(0);

    if (
      this.state === FrostLifecycleState.DORMANT ||
      this.state === FrostLifecycleState.THAW_COOLDOWN
    ) {
      return;
    }

    const isBurst = (this.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST);
    const dangerCode = isBurst ? FrostDangerValue.ABSOLUTE_ZERO : FrostDangerValue.HOARFROST;
    const baseFriction = isBurst ? 0.20 : 0.25;

    for (let i = 0; i < this.activeFrostCount; i++) {
      const idx = this.activeFrostIndices[i];
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      const dr = r - this.centerRow;
      const dc = c - this.centerCol;
      const dist = Math.hypot(dr, dc);

      this.dangerMask[idx] = dangerCode;
      this.frictionGrid[idx] = baseFriction;
      this.temperatureGrid[idx] = isBurst ? 0.0 : 150.0;
      this.intensityGrid[idx] = Math.max(0, (FROST_RADIUS_TILES - dist) / FROST_RADIUS_TILES);
    }
  }

  /**
   * Retrieves surface friction coefficient and drift damping at world position.
   */
  public evaluateFriction(worldX: number, worldY: number): FrostFrictionResult {
    return this.getFrictionAt(worldX, worldY);
  }

  public getFrictionAt(worldX: number, worldY: number): FrostFrictionResult {
    const res = this.scratchFrictionPool[this.scratchFrictionIndex];
    res.friction = 1.0;
    res.isGlaciated = false;
    res.driftDamping = 25.0;

    if (
      this.state === FrostLifecycleState.DORMANT ||
      this.state === FrostLifecycleState.THAW_COOLDOWN ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldY)
    ) {
      return res;
    }

    const dx = this.centerWorldX - worldX;
    const dy = this.centerWorldY - worldY;
    const dist = Math.hypot(dx, dy);

    if (dist <= FROST_RADIUS_PX) {
      res.isGlaciated = true;
      let mu = 1.0;
      if (this.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST) {
        mu = 0.20;
      } else {
        const t = this.stateTimerMs;
        let psi = 0;
        if (t <= DURATION_CRYSTALLIZATION_MS) {
          psi = 0.50 * (t / DURATION_CRYSTALLIZATION_MS);
        } else if (t <= DURATION_CRYSTALLIZATION_MS + DURATION_PERMAFROST_CREEP_MS) {
          psi = 0.50 + 0.50 * ((t - DURATION_CRYSTALLIZATION_MS) / DURATION_PERMAFROST_CREEP_MS);
        } else {
          psi = 1.0;
        }
        const spatialFactor = Math.cos((Math.PI * dist) / (2 * FROST_RADIUS_PX)) ** 2;
        mu = 1.0 - (1.0 - 0.20) * spatialFactor * psi;
      }
      res.friction = Math.max(0.20, Math.min(1.0, mu));
      res.driftDamping = 25.0 * res.friction;
    }

    return res;
  }

  /* ==============================================================================
   * PLAYER COMBAT MASTERY EVALUATION
   * ============================================================================== */

  public evaluatePlayer(
    worldX: number,
    worldY: number,
    isDashing: boolean = false,
    nowMs: number = 0,
    _moveDirX: number = 0,
    _moveDirY: number = 0
  ): FrostPlayerResult {
    void _moveDirX;
    void _moveDirY;
    const res = this.scratchPlayerResult;
    res.hit = false;
    res.damage = 0;
    res.isLethal = false;
    res.thermalBreakGranted = false;
    res.invulnerabilityGrantedMs = 0;
    res.speedBoostGranted = false;
    res.speedBoostRatio = 0;
    res.frostChillInflicted = false;
    res.frostChillDurationMs = 0;
    res.slowRatio = 0;
    res.slowFactor = 1.0;
    res.floatingText = '';
    res.cryoPhased = false;
    res.frostbiteInflicted = false;
    res.frostbiteDurationMs = 0;
    res.isEscaping = false;
    res.isChilled = false;
    res.cryoDashGranted = false;
    res.invulnDurationMs = 0;

    if (
      this.state === FrostLifecycleState.DORMANT ||
      this.state === FrostLifecycleState.THAW_COOLDOWN ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldY)
    ) {
      return res;
    }

    const dx = this.centerWorldX - worldX;
    const dy = this.centerWorldY - worldY;
    const dist = Math.hypot(dx, dy);

    if (dist > FROST_RADIUS_PX) {
      return res;
    }

    const isInSurge = this.state === FrostLifecycleState.HOARFROST_SURGE;
    const isBurst = this.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST;

    if (isInSurge || isBurst) {
      res.hit = true;

      if (isBurst) {
        // Active Absolute Zero Burst Window
        if (isDashing) {
          // Check Cryo-Tunneling window (150ms)
          if (this.stateTimerMs <= CRYO_TUNNELING_WINDOW_MS) {
            res.cryoPhased = true;
            res.thermalBreakGranted = true;
            res.damage = 0;
            res.isLethal = false;
            res.invulnerabilityGrantedMs = CRYO_PHASE_INVULN_MS;
            res.invulnDurationMs = THERMAL_BREAK_INVULN_MS;
            res.speedBoostGranted = true;
            res.speedBoostRatio = CRYO_PHASE_SPEED_BOOST;
            res.slowFactor = 1.0 + THERMAL_BREAK_SPEED_BURST_RATIO;
            res.floatingText = FLOATING_TEXT_CRYO_PHASED;
            res.isEscaping = true;
            res.cryoDashGranted = true;
          } else {
            // Late dash penalty
            res.cryoPhased = false;
            res.damage = PLAYER_FROST_BURST_DAMAGE;
            res.isLethal = true;
            res.frostbiteInflicted = true;
            res.frostChillInflicted = true;
            res.frostChillDurationMs = FROST_CHILL_DURATION_MS;
            res.frostbiteDurationMs = FROSTBITE_DURATION_MS;
            res.slowRatio = FROSTBITE_SLOW_RATIO;
            res.slowFactor = 1.0 - FROST_CHILL_SLOW_RATIO;
            res.floatingText = FLOATING_TEXT_FROSTBITE;
          }
        } else {
          // Non-dashing player suffers full damage and frostbite
          res.damage = PLAYER_FROST_BURST_DAMAGE;
          res.isLethal = true;
          res.frostbiteInflicted = true;
          res.frostChillInflicted = true;
          res.frostChillDurationMs = FROST_CHILL_DURATION_MS;
          res.frostbiteDurationMs = FROSTBITE_DURATION_MS;
          res.slowRatio = FROSTBITE_SLOW_RATIO;
          res.slowFactor = 1.0 - FROST_CHILL_SLOW_RATIO;
          res.floatingText = FLOATING_TEXT_FROSTBITE;
          res.isChilled = true;
        }
      } else {
        // Telegraph Surge: Chill slow unless dashing
        const safeNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
        if (isDashing) {
          if (safeNowMs - this.lastThermalBreakMs >= THERMAL_BREAK_COOLDOWN_MS) {
            res.thermalBreakGranted = true;
            res.cryoPhased = true;
            res.invulnerabilityGrantedMs = THERMAL_BREAK_INVULN_MS;
            res.speedBoostGranted = true;
            res.speedBoostRatio = THERMAL_BREAK_SPEED_BURST_RATIO;
            res.floatingText = FLOATING_TEXT_THERMAL_BREAK;
            this.lastThermalBreakMs = safeNowMs;
          }
          res.hit = false;
          res.damage = 0;
          res.slowFactor = 1.0 + THERMAL_BREAK_SPEED_BURST_RATIO;
        } else {
          res.frostChillInflicted = true;
          res.frostbiteInflicted = true;
          res.frostChillDurationMs = FROST_CHILL_DURATION_MS;
          res.frostbiteDurationMs = FROST_CHILL_DURATION_MS;
          res.slowRatio = FROST_CHILL_SLOW_RATIO;
          res.slowFactor = 1.0 - FROST_CHILL_SLOW_RATIO;
          res.floatingText = FLOATING_TEXT_FROST_CHILL;
          res.damage = 0;
          res.isChilled = true;
        }
      }
    }

    return res;
  }

  public checkPlayerCollision(
    row: number,
    col: number,
    isDashing: boolean = false,
    nowMs: number = 0
  ): FrostPlayerResult {
    const worldX = col * TILE_SIZE + TILE_SIZE / 2;
    const worldY = row * TILE_SIZE + TILE_SIZE / 2;
    return this.evaluatePlayer(worldX, worldY, isDashing, nowMs);
  }

  /* ==============================================================================
   * ENTITY INTERACTIONS: MINION FLASH-FREEZING & BOSS GLACIAL STASIS
   * ============================================================================== */

  public evaluateEnemy(
    worldX: number,
    worldY: number,
    isBoss: boolean = false,
    bossMaxHp: number = 1000
  ): FrostEnemyResult {
    const res = this.scratchEnemyResult;
    res.hit = false;
    res.damage = 0;
    res.isShattered = false;
    res.isFrozenStunned = false;
    res.stunDurationMs = 0;
    res.scoreBonus = 0;
    res.ultimateChargeBonus = 0;
    res.floatingText = '';
    res.isFlashFrozen = false;
    res.isStunned = false;

    const r = Math.floor(worldY / TILE_SIZE);
    const c = Math.floor(worldX / TILE_SIZE);

    if (
      this.state !== FrostLifecycleState.ABSOLUTE_ZERO_BURST ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldY)
    ) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.cryoShockwaveMask[r * COLS + c] > 0) {
        // Shockwave hit proceeds below
      } else {
        return res;
      }
    }

    const dx = this.centerWorldX - worldX;
    const dy = this.centerWorldY - worldY;
    const dist = Math.hypot(dx, dy);
    const inFrostCircle = dist <= FROST_RADIUS_PX;
    const inShockwave = r >= 0 && r < ROWS && c >= 0 && c < COLS && this.cryoShockwaveMask[r * COLS + c] > 0;

    if (inFrostCircle || inShockwave) {
      res.hit = true;

      if (isBoss) {
        // Anti-Exploit Guard: Single-hit protection per burst window
        if (this.bossHitInCurrentBurst) {
          res.hit = false;
          res.damage = 0;
          res.isFrozenStunned = false;
          res.isStunned = false;
          res.stunDurationMs = 0;
          return res;
        }

        this.bossHitInCurrentBurst = true;
        this.lastBossHitTimestampMs = this.stateTimerMs;

        // Boss Glacial Stasis: Exactly 15% Max HP damage + 1.5s (1500ms) stun
        const safeHp = typeof bossMaxHp === 'number' && Number.isFinite(bossMaxHp) && bossMaxHp > 0 ? Math.max(100, bossMaxHp) : 1000;
        res.damage = Math.floor(safeHp * BOSS_FROST_DAMAGE_RATIO);
        res.isFrozenStunned = true;
        res.isStunned = true;
        res.stunDurationMs = BOSS_DEEP_FREEZE_STUN_MS;
        res.floatingText = FLOATING_TEXT_DEEP_FREEZE;
      } else {
        // Minion Flash-Freezing: Exactly 120 environmental damage, +120 score bonus
        res.damage = ENEMY_FROST_BURST_DAMAGE;
        res.isShattered = true;
        res.isFlashFrozen = true;
        res.scoreBonus = ENEMY_SHATTER_SCORE;
        res.ultimateChargeBonus = ENEMY_SHATTER_ULTIMATE_CHARGE;
        res.floatingText = FLOATING_TEXT_CRYO_SHATTERED;
      }
    }

    return res;
  }

  public checkEnemyCollision(
    row: number,
    col: number,
    isBoss: boolean = false,
    bossMaxHp: number = 1000
  ): FrostEnemyResult {
    const worldX = col * TILE_SIZE + TILE_SIZE / 2;
    const worldY = row * TILE_SIZE + TILE_SIZE / 2;
    return this.evaluateEnemy(worldX, worldY, isBoss, bossMaxHp);
  }

  /* ==============================================================================
   * TACTICAL BOMB INTERACTIONS (CRYO-STABILIZED SUPER-BOMB & DIAMOND SHOCKWAVES)
   * ============================================================================== */

  /**
   * Evaluates dynamic bomb status:
   * - In Frost Zone: Fuse is FROZEN / PAUSED (does NOT tick down with dtMs).
   *   Bomb becomes Cryo-Stabilized Super-Bomb with ice crystal tint.
   * - Outside Frost Zone: Fuse ticks down normally.
   */
  public evaluateBomb(
    bombId: string | number,
    r: number,
    c: number,
    currentFuseMs: number = 3000,
    dtMs: number = 0
  ): CryoBombEvaluationResult {
    const res = this.scratchBombResult;
    res.isCryoStabilized = false;
    res.isFuseFrozen = false;
    res.fusePaused = false;
    res.remainingFuseMs = currentFuseMs;
    res.tint = 0xffffff;
    res.floatingText = '';

    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
      return res;
    }

    const inZone = this.isTileGlaciated(r, c);

    if (inZone) {
      // Cryo-Stabilized Super-Bomb: Fuse is FROZEN! Does NOT decrease by dtMs!
      res.isCryoStabilized = true;
      res.isFuseFrozen = true;
      res.fusePaused = true;
      res.remainingFuseMs = currentFuseMs; // PRESERVED!
      res.tint = CRYO_SUPER_BOMB_TINT;
      res.floatingText = FLOATING_TEXT_CRYO_STABILIZED;

      this.registerCryoBomb(bombId, r, c, currentFuseMs);
    } else {
      res.isCryoStabilized = false;
      res.isFuseFrozen = false;
      res.fusePaused = false;
      res.remainingFuseMs = Math.max(0, currentFuseMs - dtMs);
      res.tint = 0xffffff;
      res.floatingText = '';

      this.unregisterCryoBomb(bombId);
    }

    return res;
  }

  /**
   * Places a bomb: evaluates immediate frost encapsulation and fuse stasis
   */
  public onBombPlaced(
    bombId: number | string,
    row: number,
    col: number,
    powerOrFuseMs?: number,
    maybeFuseMs?: number
  ): FrostBombPlacedResult {
    let fuseMs = 3000;
    if (typeof maybeFuseMs === 'number') {
      fuseMs = maybeFuseMs;
    } else if (typeof powerOrFuseMs === 'number') {
      fuseMs = powerOrFuseMs;
    }

    const res = this.scratchBombPlacedResult;
    res.isFrozen = false;
    res.modifiedFuseMs = fuseMs;
    res.kickSpeedBonus = 0;
    res.isCryoStabilized = false;
    res.isFuseFrozen = false;
    res.tint = 0xffffff;
    res.floatingText = undefined;

    if (this.isTileGlaciated(row, col)) {
      res.isFrozen = true;
      res.isCryoStabilized = true;
      res.isFuseFrozen = true;
      res.modifiedFuseMs = typeof maybeFuseMs === 'number' ? fuseMs : fuseMs + FROST_FUSE_EXTENSION_MS;
      res.kickSpeedBonus = KICK_SPEED_BONUS_RATIO;
      res.tint = CRYO_SUPER_BOMB_TINT;
      res.floatingText = FLOATING_TEXT_CRYO_STABILIZED;

      this.registerCryoBomb(bombId, row, col, fuseMs);
    }

    return res;
  }

  /**
   * Kicks a Cryo-Stabilized Super-Bomb:
   * Releases Diamond Cryogenic Shockwaves!
   * Propagates 4 diagonal rays and diamond wavefront perimeter tiles.
   */
  public kickCryoBomb(
    bombId: string | number,
    fromR: number,
    fromC: number,
    dirDr: number = 0,
    dirDc: number = 0,
    shockwavePower: number = CRYO_SUPER_BOMB_SHOCKWAVE_POWER
  ): CryoShockwaveResult {
    const res = this.scratchShockwaveResult;
    res.bombId = bombId;
    res.originR = fromR;
    res.originC = fromC;
    res.power = shockwavePower;
    res.floatingText = FLOATING_TEXT_CRYO_SHOCKWAVE;

    const isCryo = this.isTileGlaciated(fromR, fromC) || this.isRegisteredCryoBomb(bombId);

    if (!isCryo) {
      res.shockwaveReleased = false;
      res.shockwaveTilesCount = 0;
      return res;
    }

    res.shockwaveReleased = true;

    // Generate Diamond Shockwave Tiles
    this.generateDiamondShockwaveTiles(fromR, fromC, shockwavePower);
    res.shockwaveTilesCount = this.activeShockwaveTileCount;

    // Populate cryo shockwave mask
    for (let i = 0; i < this.activeShockwaveTileCount; i++) {
      const tile = this.shockwaveTileBuffer[i];
      const idx = tile.r * COLS + tile.c;
      this.cryoShockwaveMask[idx] = 1;
    }

    void dirDr;
    void dirDc;
    return res;
  }

  /**
   * Generates Diamond Shockwave Tiles along 4 diagonals and Manhattan diamond perimeter
   */
  private generateDiamondShockwaveTiles(centerR: number, centerC: number, maxRadius: number): void {
    let count = 0;

    // 1. Diagonal Diamond Rays (NW, NE, SW, SE)
    for (let d = 0; d < CRYO_DIAMOND_DIRECTIONS.length; d++) {
      const dir = CRYO_DIAMOND_DIRECTIONS[d];
      for (let dist = 1; dist <= maxRadius; dist++) {
        const nr = centerR + dir.dr * dist;
        const nc = centerC + dir.dc * dist;
        if (nr <= 0 || nr >= ROWS - 1 || nc <= 0 || nc >= COLS - 1) break;

        if (count < this.shockwaveTileBuffer.length) {
          const tile = this.shockwaveTileBuffer[count++];
          tile.r = nr;
          tile.c = nc;
          tile.distance = dist;
          tile.isDiagonal = true;
          tile.isDiamondPerimeter = false;
        }
      }
    }

    // 2. Manhattan Diamond Perimeter wavefront
    for (let dist = 1; dist <= 2; dist++) {
      for (let dr = -dist; dr <= dist; dr++) {
        const dcAbs = dist - Math.abs(dr);
        const colOffsets = dcAbs === 0 ? [0] : [-dcAbs, dcAbs];
        for (let k = 0; k < colOffsets.length; k++) {
          const dc = colOffsets[k];
          if (Math.abs(dr) === Math.abs(dc)) continue;

          const nr = centerR + dr;
          const nc = centerC + dc;
          if (nr <= 0 || nr >= ROWS - 1 || nc <= 0 || nc >= COLS - 1) continue;

          if (count < this.shockwaveTileBuffer.length) {
            const tile = this.shockwaveTileBuffer[count++];
            tile.r = nr;
            tile.c = nc;
            tile.distance = dist;
            tile.isDiagonal = false;
            tile.isDiamondPerimeter = true;
          }
        }
      }
    }

    this.activeShockwaveTileCount = count;
  }

  public getActiveDiamondShockwaveTiles(): readonly CryoShockwaveTile[] {
    this.scratchShockwaveTiles.length = this.activeShockwaveTileCount;
    for (let i = 0; i < this.activeShockwaveTileCount; i++) {
      this.scratchShockwaveTiles[i] = this.shockwaveTileBuffer[i];
    }
    return this.scratchShockwaveTiles;
  }

  /**
   * Detonation on frost tiles triggers Thermal Shock Shatter & localized thaw cooldown
   */
  public onBombDetonated(
    bombId: number | string,
    row: number,
    col: number,
    power: number = 3
  ): FrostBombDetonationResult {
    const res = this.scratchBombDetonationResult;
    res.isThermalShock = false;
    res.modifiedPower = power;
    res.piercing = false;
    res.shatteredBombIds.length = 0;
    res.bonusScore = 0;
    res.floatingText = '';
    res.isCryoDetonation = false;
    res.shockwaveRadiusTiles = 0;
    res.releasedCryoShockwave = false;

    const inZone = this.isTileGlaciated(row, col) || this.isRegisteredCryoBomb(bombId);

    if (inZone) {
      res.isThermalShock = true;
      res.isCryoDetonation = true;
      res.modifiedPower = power + THERMAL_SHOCK_EXTRA_POWER;
      res.piercing = true;
      res.shatteredBombIds.push(bombId);
      res.bonusScore = THERMAL_SHOCK_BONUS_SCORE;
      res.shockwaveRadiusTiles = CRYO_SHOCKWAVE_RANGE_TILES;
      res.releasedCryoShockwave = true;
      res.floatingText = FLOATING_TEXT_THERMAL_SHOCK;

      // Trigger diamond shockwaves
      this.kickCryoBomb(bombId, row, col, 0, 0, CRYO_SUPER_BOMB_SHOCKWAVE_POWER);

      // Thaw cooldown transition (tactical counterplay)
      this.state = FrostLifecycleState.THAW_COOLDOWN;
      this.stateTimerMs = 0;
      this.recomputeDangerMask();
    }

    this.unregisterCryoBomb(bombId);
    return res;
  }

  /**
   * External explosion impact against ice triggers localized thaw
   */
  public onBombBlastImpact(row: number, col: number): boolean {
    if (
      (this.state === FrostLifecycleState.HOARFROST_SURGE ||
        this.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST) &&
      this.isTileGlaciated(row, col)
    ) {
      this.state = FrostLifecycleState.THAW_COOLDOWN;
      this.stateTimerMs = 0;
      this.recomputeDangerMask();
      return true;
    }
    return false;
  }

  private registerCryoBomb(bombId: string | number, r: number, c: number, fuseMs: number): void {
    for (let i = 0; i < this.cryoBombPool.length; i++) {
      const slot = this.cryoBombPool[i];
      if (slot.active && slot.bombId === bombId) {
        slot.r = r;
        slot.c = c;
        slot.frozenFuseMs = fuseMs;
        return;
      }
    }
    for (let i = 0; i < this.cryoBombPool.length; i++) {
      const slot = this.cryoBombPool[i];
      if (!slot.active) {
        slot.active = true;
        slot.bombId = bombId;
        slot.r = r;
        slot.c = c;
        slot.frozenFuseMs = fuseMs;
        slot.isKicked = false;
        return;
      }
    }
  }

  private unregisterCryoBomb(bombId: string | number): void {
    for (let i = 0; i < this.cryoBombPool.length; i++) {
      const slot = this.cryoBombPool[i];
      if (slot.active && slot.bombId === bombId) {
        slot.active = false;
        return;
      }
    }
  }

  private isRegisteredCryoBomb(bombId: string | number): boolean {
    for (let i = 0; i < this.cryoBombPool.length; i++) {
      const slot = this.cryoBombPool[i];
      if (slot.active && slot.bombId === bombId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculates the proportion of safe tiles across the arena.
   * Invariant: >= 80.0% mandate, observed 85.128% on 13x15 arena (166 / 195 tiles).
   */
  public getSafeAreaRatio(): number {
    return this.calculateSafeAreaRatio();
  }

  public calculateSafeAreaRatio(): number {
    let dangerousTiles = 0;
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (this.dangerMask[i] > 0) {
        dangerousTiles++;
      }
    }
    return (TOTAL_TILES - dangerousTiles) / TOTAL_TILES;
  }

  public resetBossExploitGuard(): void {
    this.bossHitInCurrentBurst = false;
  }
}
