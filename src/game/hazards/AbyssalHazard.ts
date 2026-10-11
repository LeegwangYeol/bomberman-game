/**
 * AbyssalHazard.ts — Abyssal Rift & Ocean Trench Dynamic Hazard & Tactical Bomb Interaction Engine
 *
 * Implements the 10th Mythic Elemental Dimension (Ocean / Abyss / Trench Maelstrom) completing the Decary Pantheon:
 *     1. Aether / Light: Quantum Spire (DynamicHazard)
 *     2. Void / Gravity: Gravitational Singularity (GravityHazard)
 *     3. Water / Ice: Cryo Glaciation (FrostHazard)
 *     4. Air / Lightning: Tesla Storm (VoltHazard)
 *     5. Earth / Fire: Magma Caldera & Pyroclastic Surge (MagmaHazard)
 *     6. Nature / Decay: Toxic Miasma & Spore Bloom (MiasmaHazard)
 *     7. Time / Spacetime: Chrono Anomaly & Tachyon Dilation (ChronoHazard)
 *     8. Sun / Plasma: Solar Corona & Coronal Mass Ejection (SolarHazard)
 *     9. Astral / Eclipse: Astral Nebula & Solar Eclipse Singularity (NebulaHazard)
 *    10. Ocean / Abyss: Abyssal Rift & Ocean Trench Maelstrom (AbyssalHazard)
 *
 * Architecture & Features:
 * - 4-Stage Lifecycle FSM: DORMANT -> TIDAL_SURGE (2000ms) -> ABYSSAL_MAELSTROM (350ms) -> OCEANIC_CALM (5800ms)
 * - 3-Tier Telegraph Sub-Phases: TIDAL_UNDERTOW (1000ms) -> TRENCH_CONVERGENCE (600ms) -> MAELSTROM_IMMINENT (400ms)
 * - Zero-GC 1D TypedArray Memory Layout (Uint8Array dangerMask, Float32Array pressureGrid, Float32Array cleanseGrid, Int16Array activeAbyssalIndices)
 * - Mathematical Safe Area Guarantees: Safe Area >= 80% (Guaranteed >= 85.128% on standard 13x15 arenas, exactly 29 lattice tiles in radius 3)
 * - Discrete Laplacian Hydrostatic Pressure Diffusion: In-place trench fluid dynamics propagation without heap allocations
 * - Tactical Bomb Interactions:
 *     1. Hydro-Fused Bomb: Fuse accelerated by -1.2s on active abyssal tiles, luminous aqua cyan tint (0x06b6d4)
 *     2. Hydro Slipstream Kick: Sliding across abyssal tiles accelerates to 460 px/s
 *     3. Maelstrom Burst Detonation: Detonating in maelstrom vortex zone grants +2 blast power, +250 bonus score, and +10 ultimate charge
 *     4. Oceanic Calm (Trench Barrier): Bomb blast impacts dissipate oceanic torrent, stabilizing into a safe calm sanctuary (4.0s safe footing)
 * - Environmental Entity Interactions:
 *     1. Minion Abyssal Crushing: 120 environmental damage, +120 score bonus, +6 ult charge, '🌊 ABYSS-CRUSHED!'
 *     2. Boss Maelstrom Stasis: 15% Max HP damage, 1.5s complete crushing pressure stun, with Anti-Exploit Guard (single hit per maelstrom cycle)
 *     3. Player Combat Mastery: Abyssal Glide / Trench Wave Dash (I-Frames 1200ms, +40% speed burst) vs Crushing Depth Drag (-30% speed debuff for 2000ms)
 */

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
} from '../pathfinding.ts';

export { ROWS, COLS, TOTAL_TILES, TILE_SIZE };

/**
 * Universal Lifecycle States for Abyssal Hazard FSM
 */
export const AbyssalLifecycleState = {
  DORMANT: 'DORMANT',
  TIDAL_SURGE: 'TIDAL_SURGE',
  ABYSSAL_MAELSTROM: 'ABYSSAL_MAELSTROM',
  OCEANIC_CALM: 'OCEANIC_CALM',
  // Harmonization aliases
  ABYSSAL_TIDE: 'TIDAL_SURGE',
  TIDAL_TELEGRAPH: 'TIDAL_SURGE',
  OCEANIC_SURGE: 'TIDAL_SURGE',
  ABYSSAL_BURST: 'ABYSSAL_MAELSTROM',
  MAELSTROM_BURST: 'ABYSSAL_MAELSTROM',
  MAELSTROM_SINGULARITY: 'ABYSSAL_MAELSTROM',
  COOLDOWN: 'OCEANIC_CALM',
  ABYSSAL_COOLDOWN: 'OCEANIC_CALM',
  RECOVERY: 'OCEANIC_CALM',
} as const;

export type AbyssalLifecycleState =
  typeof AbyssalLifecycleState[keyof typeof AbyssalLifecycleState];

/**
 * 3-Tier Sub-Phases during TIDAL_SURGE Lifecycle State
 */
export const AbyssalTelegraphPhase = {
  NONE: 'NONE',
  TIDAL_UNDERTOW: 'TIDAL_UNDERTOW',               // 0ms - 1000ms: Translucent turquoise oceanic mist, faint undertow ripples
  TRENCH_CONVERGENCE: 'TRENCH_CONVERGENCE',       // 1000ms - 1600ms: Roaring trench currents condensing inward, rising hydrostatic pressure
  MAELSTROM_IMMINENT: 'MAELSTROM_IMMINENT',       // 1600ms - 2000ms: Trench vortex formed, roaring abyssal whirlpool eye opening
  // Aliases
  TRENCH_MURMUR: 'TIDAL_UNDERTOW',
  MAELSTROM_SWIRL: 'TRENCH_CONVERGENCE',
  UNDERTOW_PHASE: 'TIDAL_UNDERTOW',
  CONVERGENCE_PHASE: 'TRENCH_CONVERGENCE',
  ABYSSAL_MURMUR: 'TIDAL_UNDERTOW',
  OCEANIC_SWELL: 'TIDAL_UNDERTOW',
  PRESSURE_SURGE: 'TRENCH_CONVERGENCE',
  HIGH_TIDE_WARNING: 'TIDAL_UNDERTOW',
  WHIRLPOOL_VORTEX: 'TRENCH_CONVERGENCE',
  COLLAPSE_IMMINENT: 'MAELSTROM_IMMINENT',
  DISCHARGE_IMMINENT: 'MAELSTROM_IMMINENT',
  BURST_IMMINENT: 'MAELSTROM_IMMINENT',
} as const;

export type AbyssalTelegraphPhase =
  typeof AbyssalTelegraphPhase[keyof typeof AbyssalTelegraphPhase];

/**
 * Danger Mask Discrete Bit Values (Uint8Array)
 */
export const AbyssalDangerValue = {
  SAFE: 0,             // Safe walkable tile
  TIDAL: 1,            // Oceanic undertow zone: non-lethal, inflicts crushing depth slow on non-dashing players
  SURGE: 1,            // Alias
  ABYSS: 1,            // Alias
  TRENCH: 1,           // Alias
  DRIFT: 1,            // Alias
  MAELSTROM: 2,        // Active abyssal maelstrom: instant minion crushing & lethal damage
  COLLAPSE: 2,         // Alias
  VORTEX: 2,           // Alias
  BURST: 2,            // Alias
  CALM: 3,             // Stabilized oceanic calm zone: temporary safe footing created by bomb blast
  ANCHOR: 3,           // Alias
  CLEANSED: 3,         // Alias
  SANCTUARY: 3,        // Alias
  TRENCH_BARRIER: 3,   // Alias
} as const;

export type AbyssalDangerValue =
  typeof AbyssalDangerValue[keyof typeof AbyssalDangerValue];

/**
 * Timing & Tuning Constants (ms)
 */
export const DURATION_TIDAL_UNDERTOW_MS = 1000;
export const DURATION_TRENCH_CONVERGENCE_MS = 600;
export const DURATION_MAELSTROM_IMMINENT_MS = 400;
export const DURATION_TIDAL_SURGE_MS = 2000;
export const DURATION_ABYSSAL_MAELSTROM_MS = 350;

export const DEFAULT_ABYSSAL_COOLDOWN_MS = 5800;       // Standard recovery
export const CLIMAX_ABYSSAL_COOLDOWN_MS = 3800;        // Climax recovery
export const WHISPERS_ABYSSAL_COOLDOWN_MS = 9000;      // Whispers teaching recovery

export const ABYSSAL_RADIUS_TILES = 3;
export const ABYSSAL_MAX_RADIUS_PX = ABYSSAL_RADIUS_TILES * TILE_SIZE; // 120px
export const ABYSSAL_RADIUS_PX = ABYSSAL_MAX_RADIUS_PX;
export const MAX_ABYSSAL_TILES = 32;

export const MIN_ABYSSAL_SAFE_AREA_RATIO = 0.80;

/**
 * Player Combat Mastery Tuning Constants
 */
export const ABYSSAL_GLIDE_INVULN_MS = 1200;
export const ABYSSAL_GLIDE_SPEED_BURST_RATIO = 0.40;
export const ABYSSAL_GLIDE_COOLDOWN_MS = 1500;
export const AQUA_GLIDE_INVULN_MS = ABYSSAL_GLIDE_INVULN_MS;
export const AQUA_GLIDE_SPEED_BURST_RATIO = ABYSSAL_GLIDE_SPEED_BURST_RATIO;
export const AQUA_GLIDE_COOLDOWN_MS = ABYSSAL_GLIDE_COOLDOWN_MS;
export const HYDRO_DASH_INVULN_MS = ABYSSAL_GLIDE_INVULN_MS;
export const HYDRO_DASH_SPEED_BURST_RATIO = ABYSSAL_GLIDE_SPEED_BURST_RATIO;

export const HYDROSTATIC_DRAG_DURATION_MS = 2000;
export const HYDROSTATIC_DRAG_SLOW_RATIO = 0.30;
export const ABYSSAL_UNDERTOW_DURATION_MS = HYDROSTATIC_DRAG_DURATION_MS;
export const ABYSSAL_UNDERTOW_SLOW_RATIO = HYDROSTATIC_DRAG_SLOW_RATIO;
export const PLAYER_MAELSTROM_DAMAGE = 25;

/**
 * Tactical Bomb Constants
 */
export const ABYSSAL_SUPER_BOMB_TINT = 0x06b6d4;        // Radiant Oceanic Aqua / Cyan
export const HYDRO_FUSED_BOMB_TINT = ABYSSAL_SUPER_BOMB_TINT;
export const ABYSSAL_FUSE_ACCELERATION_MS = 1200;       // -1.2s fuse time
export const HYDRO_FUSE_ACCELERATION_MS = ABYSSAL_FUSE_ACCELERATION_MS;
export const MAELSTROM_EXTRA_POWER = 2;                 // +2 blast radius
export const MAELSTROM_BONUS_SCORE = 250;               // +250 tactical score
export const MAELSTROM_ULT_CHARGE = 10;                 // +10 ult charge
export const MAELSTROM_DETONATION_ULT_CHARGE = 10;
export const BOMB_KICK_ABYSSAL_SPEED = 460;             // 460 px/s hydrodynamic slipstream glide
export const OCEANIC_CALM_DURATION_MS = 4000;           // 4.0s safe stabilized oceanic calm sanctuary
export const HYDRO_BARRIER_ANCHOR_DURATION_MS = 4000;
export const HYDRO_CALM_DURATION_MS = 4000;

/**
 * Environmental Minion & Boss Tuning Constants
 */
export const ABYSSAL_MINION_DAMAGE = 120;
export const ENEMY_ABYSSAL_SCORE = 120;
export const ENEMY_ABYSSAL_ULTIMATE_CHARGE = 6;
export const BOSS_ABYSSAL_DAMAGE_RATIO = 0.15;          // 15% Max HP flat damage
export const BOSS_ABYSSAL_STASIS_STUN_MS = 1500;        // 1.5s stasis stun
export const BOSS_ABYSSAL_EXPLOIT_COOLDOWN_MS = 2500;   // Single hit guard per maelstrom cycle

/**
 * Visual Floating Text Labels
 */
export const FLOATING_TEXT_ABYSSAL_GLIDE = '🌊 ABYSSAL GLIDE!';
export const FLOATING_TEXT_AQUA_GLIDE = '✦ AQUA GLIDE!';
export const FLOATING_TEXT_HYDRO_DASH = '🌊 HYDRO DASH!';
export const FLOATING_TEXT_HYDROSTATIC_DRAG = '🌊 CRUSHING DEPTH (-30%)';
export const FLOATING_TEXT_ABYSSAL_UNDERTOW = '🌊 CRUSHING DEPTH (-30%)';
export const FLOATING_TEXT_ABYSSAL_FUSED = '🌊 HYDRO-FUSED (-1.2s)';
export const FLOATING_TEXT_HYDRO_FUSED = '🌊 HYDRO-FUSED (-1.2s)';
export const FLOATING_TEXT_TRENCH_GLIDE = '🌊 TRENCH GLIDE!';
export const FLOATING_TEXT_HYDRO_SLIPSTREAM = '🌊 HYDRO SLIPSTREAM!';
export const FLOATING_TEXT_ABYSSAL_SLIPSTREAM = '🌊 ABYSSAL SLIPSTREAM!';
export const FLOATING_TEXT_MAELSTROM_BURST = '🌊 MAELSTROM BURST (+250)';
export const FLOATING_TEXT_MAELSTROM_DETONATION = '🌊 MAELSTROM DETONATION (+250)';
export const FLOATING_TEXT_MAELSTROM_IMPLOSION = '🌊 MAELSTROM IMPLOSION (+250)';
export const FLOATING_TEXT_OCEANIC_CALM = '✦ OCEANIC CALM!';
export const FLOATING_TEXT_HYDRO_BARRIER_ANCHOR = '✦ HYDRO-BARRIER ANCHOR!';
export const FLOATING_TEXT_HYDRO_BARRIER = '✦ HYDRO-BARRIER ANCHOR!';
export const FLOATING_TEXT_HYDRO_CALM = '✦ HYDRO-BARRIER CALM!';
export const FLOATING_TEXT_ABYSS_CRUSHED = '🌊 ABYSS-CRUSHED!';
export const FLOATING_TEXT_MAELSTROM_STASIS = '🌊 MAELSTROM STASIS (1.5s)!';

export const ELEMENTAL_REACTION_MAELSTROM = 'MAELSTROM';

export interface AbyssalPlayerResult {
  hit: boolean;
  damage: number;
  isLethal: boolean;
  isDazed: boolean;
  dazeInflicted: boolean;
  slowFactor: number;
  slowDurationMs: number;
  isGlideActivated: boolean;
  abyssalGlideGranted: boolean;
  aquaGlideGranted?: boolean;
  hydroDashGranted?: boolean;
  isUndertow?: boolean;
  undertowInflicted?: boolean;
  glideInvulnMs: number;
  glideSpeedBoost: number;
  floatingText: string;
}

export interface AbyssalEnemyResult {
  hit: boolean;
  damage: number;
  isVaporized: boolean;
  isCrushed: boolean;
  isDissolved: boolean;
  isDecomposed: boolean;
  isStasisStunned: boolean;
  isStunned: boolean;
  stunDurationMs: number;
  scoreBonus: number;
  ultimateChargeBonus: number;
  floatingText: string;
}

export interface AbyssalBombResult {
  isAccelerated: boolean;
  fuseAccelerationMs: number;
  isSlipstreamKick: boolean;
  kickSpeed: number;
  isMaelstrom: boolean;
  extraPower: number;
  bonusScore: number;
  ultimateChargeBonus?: number;
  bombTint: number;
  floatingText: string;
}

export interface AbyssalCleanseResult {
  cleanedTilesCount: number;
  durationMs: number;
  floatingText: string;
}

/**
 * AbyssalHazard — High-performance Zero-GC Dynamic Hazard Controller
 */
export class AbyssalHazard {
  public state: AbyssalLifecycleState = AbyssalLifecycleState.DORMANT;
  public telegraphPhase: AbyssalTelegraphPhase = AbyssalTelegraphPhase.NONE;

  private centerRow: number = 6;
  private centerCol: number = 7;
  public isCenterAnchored: boolean = true;
  private currentCooldownDurationMs: number = DEFAULT_ABYSSAL_COOLDOWN_MS;
  private stateTimerMs: number = 0;

  // Zero-GC 1D Memory Layout
  private dangerMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  private pressureGrid: Float32Array = new Float32Array(TOTAL_TILES);
  private cleanseGrid: Float32Array = new Float32Array(TOTAL_TILES);
  private activeAbyssalIndices: Int16Array = new Int16Array(MAX_ABYSSAL_TILES);
  private activeAbyssalCount: number = 0;

  // Anti-Exploit boss cooldown timestamp
  private lastBossHitTimestampMs: number = -99999;
  // Player glide cooldown timestamp
  private lastPlayerGlideTimestampMs: number = -99999;

  // Pre-allocated scratch result containers
  private scratchPlayerResult: AbyssalPlayerResult = {
    hit: false,
    damage: 0,
    isLethal: false,
    isDazed: false,
    dazeInflicted: false,
    isUndertow: false,
    undertowInflicted: false,
    slowFactor: 1.0,
    slowDurationMs: 0,
    isGlideActivated: false,
    abyssalGlideGranted: false,
    aquaGlideGranted: false,
    hydroDashGranted: false,
    glideInvulnMs: 0,
    glideSpeedBoost: 0,
    floatingText: '',
  };

  private scratchEnemyResult: AbyssalEnemyResult = {
    hit: false,
    damage: 0,
    isVaporized: false,
    isCrushed: false,
    isDissolved: false,
    isDecomposed: false,
    isStasisStunned: false,
    isStunned: false,
    stunDurationMs: 0,
    scoreBonus: 0,
    ultimateChargeBonus: 0,
    floatingText: '',
  };

  private scratchBombResult: AbyssalBombResult = {
    isAccelerated: false,
    fuseAccelerationMs: 0,
    isSlipstreamKick: false,
    kickSpeed: 0,
    isMaelstrom: false,
    extraPower: 0,
    bonusScore: 0,
    ultimateChargeBonus: 0,
    bombTint: 0xffffff,
    floatingText: '',
  };

  private scratchCleanseResult: AbyssalCleanseResult = {
    cleanedTilesCount: 0,
    durationMs: 0,
    floatingText: '',
  };

  constructor(centerRow: number = 6, centerCol: number = 7) {
    this.init(centerRow, centerCol);
  }

  /**
   * Initializes or re-anchors the hazard center and computes the Euclidean footprint
   */
  public init(centerRow: number = 6, centerCol: number = 7): void {
    if (
      !Number.isFinite(centerRow) ||
      !Number.isFinite(centerCol) ||
      centerRow < 0 ||
      centerRow >= ROWS ||
      centerCol < 0 ||
      centerCol >= COLS
    ) {
      this.centerRow = 6;
      this.centerCol = 7;
    } else {
      this.centerRow = Math.floor(centerRow);
      this.centerCol = Math.floor(centerCol);
    }

    this.reset();
  }

  public start(mode: 'WHISPERS' | 'NORMAL' | 'CLIMAX' = 'NORMAL', centerR: number = 6, centerC: number = 7): void {
    if (mode === 'CLIMAX') {
      this.currentCooldownDurationMs = CLIMAX_ABYSSAL_COOLDOWN_MS;
    } else if (mode === 'WHISPERS') {
      this.currentCooldownDurationMs = WHISPERS_ABYSSAL_COOLDOWN_MS;
    } else {
      this.currentCooldownDurationMs = DEFAULT_ABYSSAL_COOLDOWN_MS;
    }

    this.centerRow = Math.max(1, Math.min(ROWS - 2, centerR | 0));
    this.centerCol = Math.max(1, Math.min(COLS - 2, centerC | 0));
    this.computeAbyssalFootprint();

    this.transitionTo(AbyssalLifecycleState.TIDAL_SURGE);
  }

  public triggerTidalSurge(centerR: number = this.centerRow, centerC: number = this.centerCol): void {
    this.start('NORMAL', centerR, centerC);
  }

  public getCooldownDurationMs(): number {
    return this.currentCooldownDurationMs;
  }

  /**
   * Computes discrete lattice ball of radius 3 centered at (centerRow, centerCol)
   */
  private computeAbyssalFootprint(): void {
    this.activeAbyssalCount = 0;
    const rMax = ABYSSAL_RADIUS_TILES;
    const rMaxSq = rMax * rMax;

    for (let dr = -rMax; dr <= rMax; dr++) {
      const r = this.centerRow + dr;
      if (r < 0 || r >= ROWS) continue;

      for (let dc = -rMax; dc <= rMax; dc++) {
        const c = this.centerCol + dc;
        if (c < 0 || c >= COLS) continue;

        const distSq = dr * dr + dc * dc;
        if (distSq <= rMaxSq) {
          const idx = r * COLS + c;
          if (this.activeAbyssalCount < MAX_ABYSSAL_TILES) {
            this.activeAbyssalIndices[this.activeAbyssalCount++] = idx;
          }
        }
      }
    }
  }

  /**
   * In-place discrete Laplacian diffusion step for hydrostatic trench pressure
   */
  public stepDiscreteDiffusion(diffusionRate: number = 0.15): void {
    if (typeof diffusionRate !== 'number' || !Number.isFinite(diffusionRate) || diffusionRate < 1e-8) return;
    const rate = Math.min(0.25, diffusionRate);

    for (let i = 0; i < this.activeAbyssalCount; i++) {
      const idx = this.activeAbyssalIndices[i];
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      const currentVal = this.pressureGrid[idx];

      let neighborSum = 0;
      let neighborCount = 0;

      if (r > 0) { neighborSum += this.pressureGrid[(r - 1) * COLS + c]; neighborCount++; }
      if (r < ROWS - 1) { neighborSum += this.pressureGrid[(r + 1) * COLS + c]; neighborCount++; }
      if (c > 0) { neighborSum += this.pressureGrid[r * COLS + (c - 1)]; neighborCount++; }
      if (c < COLS - 1) { neighborSum += this.pressureGrid[r * COLS + (c + 1)]; neighborCount++; }

      if (neighborCount > 0) {
        const laplacian = neighborSum / neighborCount - currentVal;
        let val = Math.max(0, Math.min(1.0, currentVal + laplacian * rate));
        if (val < 1e-15) val = 0.0;
        this.pressureGrid[idx] = val;
      }
    }
  }

  /**
   * Main simulation step update
   */
  public update(deltaMs: number): void {
    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }

    this.stateTimerMs += deltaMs;

    // Decay stabilized cleanse grid
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (this.cleanseGrid[i] > 0) {
        this.cleanseGrid[i] = Math.max(0, this.cleanseGrid[i] - deltaMs);
        if (this.cleanseGrid[i] === 0 && this.dangerMask[i] === AbyssalDangerValue.CALM) {
          // Revert to current ambient state
          if (this.state === AbyssalLifecycleState.TIDAL_SURGE) {
            this.dangerMask[i] = AbyssalDangerValue.TIDAL;
          } else if (this.state === AbyssalLifecycleState.ABYSSAL_MAELSTROM) {
            this.dangerMask[i] = AbyssalDangerValue.MAELSTROM;
          } else {
            this.dangerMask[i] = AbyssalDangerValue.SAFE;
          }
        }
      }
    }

    // FSM State transitions
    switch (this.state) {
      case AbyssalLifecycleState.DORMANT: {
        this.telegraphPhase = AbyssalTelegraphPhase.NONE;
        break;
      }

      case AbyssalLifecycleState.OCEANIC_CALM: {
        this.telegraphPhase = AbyssalTelegraphPhase.NONE;
        if (this.stateTimerMs >= this.currentCooldownDurationMs) {
          this.transitionTo(AbyssalLifecycleState.TIDAL_SURGE);
        }
        break;
      }

      case AbyssalLifecycleState.TIDAL_SURGE: {
        // Evaluate telegraph sub-phases
        if (this.stateTimerMs < DURATION_TIDAL_UNDERTOW_MS) {
          this.telegraphPhase = AbyssalTelegraphPhase.TIDAL_UNDERTOW;
        } else if (this.stateTimerMs < DURATION_TIDAL_UNDERTOW_MS + DURATION_TRENCH_CONVERGENCE_MS) {
          this.telegraphPhase = AbyssalTelegraphPhase.TRENCH_CONVERGENCE;
        } else {
          this.telegraphPhase = AbyssalTelegraphPhase.MAELSTROM_IMMINENT;
        }

        // Diffuse hydrostatic trench pressure
        this.stepDiscreteDiffusion(0.12);

        if (this.stateTimerMs >= DURATION_TIDAL_SURGE_MS) {
          this.transitionTo(AbyssalLifecycleState.ABYSSAL_MAELSTROM);
        }
        break;
      }

      case AbyssalLifecycleState.ABYSSAL_MAELSTROM: {
        this.telegraphPhase = AbyssalTelegraphPhase.NONE;
        if (this.stateTimerMs >= DURATION_ABYSSAL_MAELSTROM_MS) {
          this.transitionTo(AbyssalLifecycleState.OCEANIC_CALM);
        }
        break;
      }
    }
  }

  /**
   * Internal deterministic FSM state transition handler
   */
  private transitionTo(newState: AbyssalLifecycleState): void {
    this.state = newState;
    this.stateTimerMs = 0;

    switch (newState) {
      case AbyssalLifecycleState.TIDAL_SURGE: {
        this.telegraphPhase = AbyssalTelegraphPhase.TIDAL_UNDERTOW;
        for (let i = 0; i < this.activeAbyssalCount; i++) {
          const idx = this.activeAbyssalIndices[i];
          if (this.cleanseGrid[idx] > 0) {
            this.dangerMask[idx] = AbyssalDangerValue.CALM;
          } else {
            this.dangerMask[idx] = AbyssalDangerValue.TIDAL;
            this.pressureGrid[idx] = 0.5 + Math.random() * 0.3;
          }
        }
        break;
      }

      case AbyssalLifecycleState.ABYSSAL_MAELSTROM: {
        this.telegraphPhase = AbyssalTelegraphPhase.NONE;
        for (let i = 0; i < this.activeAbyssalCount; i++) {
          const idx = this.activeAbyssalIndices[i];
          if (this.cleanseGrid[idx] > 0) {
            this.dangerMask[idx] = AbyssalDangerValue.CALM;
          } else {
            this.dangerMask[idx] = AbyssalDangerValue.MAELSTROM;
            this.pressureGrid[idx] = 1.0;
          }
        }
        break;
      }

      case AbyssalLifecycleState.OCEANIC_CALM:
      case AbyssalLifecycleState.DORMANT: {
        this.telegraphPhase = AbyssalTelegraphPhase.NONE;
        for (let i = 0; i < this.activeAbyssalCount; i++) {
          const idx = this.activeAbyssalIndices[i];
          if (this.cleanseGrid[idx] > 0) {
            this.dangerMask[idx] = AbyssalDangerValue.CALM;
          } else {
            this.dangerMask[idx] = AbyssalDangerValue.SAFE;
            this.pressureGrid[idx] = 0.0;
          }
        }
        break;
      }
    }
  }

  /**
   * Evaluates player combat interaction against abyssal tiles
   */
  public evaluatePlayer(
    px: number,
    py: number,
    isDashing: boolean = false,
    currentTimeMs: number = Date.now(),
    _wantX?: number,
    _wantY?: number
  ): AbyssalPlayerResult {
    const res = this.scratchPlayerResult;
    res.hit = false;
    res.damage = 0;
    res.isLethal = false;
    res.isDazed = false;
    res.dazeInflicted = false;
    res.isUndertow = false;
    res.undertowInflicted = false;
    res.slowFactor = 1.0;
    res.slowDurationMs = 0;
    res.isGlideActivated = false;
    res.abyssalGlideGranted = false;
    res.aquaGlideGranted = false;
    res.hydroDashGranted = false;
    res.glideInvulnMs = 0;
    res.glideSpeedBoost = 0;
    res.floatingText = '';

    if (!Number.isFinite(px) || !Number.isFinite(py)) return res;

    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return res;

    const idx = row * COLS + col;
    const danger = this.dangerMask[idx];

    // Calm oceanic sanctuary tiles are safe
    if (danger === AbyssalDangerValue.CALM) {
      return res;
    }

    const time = Number.isFinite(currentTimeMs) ? currentTimeMs : Date.now();

    // Dashing through active abyssal or maelstrom tiles triggers Aqua Glide / Hydro Dash
    if (isDashing && (danger === AbyssalDangerValue.TIDAL || danger === AbyssalDangerValue.MAELSTROM)) {
      if (time - this.lastPlayerGlideTimestampMs >= ABYSSAL_GLIDE_COOLDOWN_MS) {
        this.lastPlayerGlideTimestampMs = time;
        res.isGlideActivated = true;
        res.abyssalGlideGranted = true;
        res.aquaGlideGranted = true;
        res.hydroDashGranted = true;
        res.glideInvulnMs = ABYSSAL_GLIDE_INVULN_MS;
        res.glideSpeedBoost = ABYSSAL_GLIDE_SPEED_BURST_RATIO;
        res.floatingText = FLOATING_TEXT_AQUA_GLIDE;
      }
      return res;
    }

    // Active lethal maelstrom
    if (danger === AbyssalDangerValue.MAELSTROM && !isDashing) {
      res.hit = true;
      res.damage = PLAYER_MAELSTROM_DAMAGE;
      res.isLethal = true;
      res.floatingText = FLOATING_TEXT_ABYSS_CRUSHED;
      return res;
    }

    // Abyssal undertow inflicts slow on walking players
    if (danger === AbyssalDangerValue.TIDAL && !isDashing) {
      res.isDazed = true;
      res.dazeInflicted = true;
      res.isUndertow = true;
      res.undertowInflicted = true;
      res.slowFactor = 1.0 - ABYSSAL_UNDERTOW_SLOW_RATIO;
      res.slowDurationMs = ABYSSAL_UNDERTOW_DURATION_MS;
      res.floatingText = FLOATING_TEXT_HYDROSTATIC_DRAG;
      return res;
    }

    return res;
  }

  /**
   * Harmonization alias for evaluating enemy collision from world coordinates
   */
  public evaluateEnemy(
    x: number,
    y: number,
    isBoss: boolean = false,
    nowMs: number = Date.now()
  ): AbyssalEnemyResult {
    const er = (y / TILE_SIZE) | 0;
    const ec = (x / TILE_SIZE) | 0;
    return this.checkEnemyCollision(er, ec, isBoss, nowMs);
  }

  /**
   * Checks environmental enemy or boss collision during lethal ABYSSAL_MAELSTROM
   */
  public checkEnemyCollision(
    enemyRow: number,
    enemyCol: number,
    isBoss: boolean,
    currentTimeMs: number
  ): AbyssalEnemyResult {
    const res = this.scratchEnemyResult;
    res.hit = false;
    res.damage = 0;
    res.isVaporized = false;
    res.isCrushed = false;
    res.isDissolved = false;
    res.isDecomposed = false;
    res.isStasisStunned = false;
    res.isStunned = false;
    res.stunDurationMs = 0;
    res.scoreBonus = 0;
    res.ultimateChargeBonus = 0;
    res.floatingText = '';

    if (
      !Number.isFinite(enemyRow) ||
      !Number.isFinite(enemyCol) ||
      enemyRow < 0 ||
      enemyRow >= ROWS ||
      enemyCol < 0 ||
      enemyCol >= COLS
    ) {
      return res;
    }

    if (this.state !== AbyssalLifecycleState.ABYSSAL_MAELSTROM) {
      return res;
    }

    const idx = Math.floor(enemyRow) * COLS + Math.floor(enemyCol);
    if (this.dangerMask[idx] !== AbyssalDangerValue.MAELSTROM) {
      return res;
    }

    const time = Number.isFinite(currentTimeMs) ? currentTimeMs : Date.now();

    if (isBoss) {
      // Single hit guard per maelstrom cycle to prevent tick exploits
      if (time - this.lastBossHitTimestampMs >= BOSS_ABYSSAL_EXPLOIT_COOLDOWN_MS) {
        this.lastBossHitTimestampMs = time;
        res.hit = true;
        res.isStasisStunned = true;
        res.isStunned = true;
        res.stunDurationMs = BOSS_ABYSSAL_STASIS_STUN_MS;
        res.damage = Math.floor(BOSS_ABYSSAL_DAMAGE_RATIO * 1000); // 15% Max HP flat scaling reference
        res.scoreBonus = 500;
        res.ultimateChargeBonus = 15;
        res.floatingText = FLOATING_TEXT_MAELSTROM_STASIS;
      }
    } else {
      res.hit = true;
      res.damage = ABYSSAL_MINION_DAMAGE;
      res.isVaporized = true;
      res.isCrushed = true;
      res.scoreBonus = ENEMY_ABYSSAL_SCORE;
      res.ultimateChargeBonus = ENEMY_ABYSSAL_ULTIMATE_CHARGE;
      res.floatingText = FLOATING_TEXT_ABYSS_CRUSHED;
    }

    return res;
  }

  /**
   * Tactical Bomb interaction: Placed on active abyssal tile
   */
  public onBombPlaced(
    _bombId: string,
    row: number,
    col: number,
    _power: number,
    _fuseDuration: number
  ): AbyssalBombResult {
    void _bombId;
    void _power;
    void _fuseDuration;
    const res = this.scratchBombResult;
    res.isAccelerated = false;
    res.fuseAccelerationMs = 0;
    res.isSlipstreamKick = false;
    res.kickSpeed = 0;
    res.isMaelstrom = false;
    res.extraPower = 0;
    res.bonusScore = 0;
    res.bombTint = 0xffffff;
    res.floatingText = '';

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return res;

    const idx = row * COLS + col;
    const danger = this.dangerMask[idx];

    if (danger === AbyssalDangerValue.TIDAL || danger === AbyssalDangerValue.MAELSTROM) {
      res.isAccelerated = true;
      res.fuseAccelerationMs = ABYSSAL_FUSE_ACCELERATION_MS;
      res.bombTint = ABYSSAL_SUPER_BOMB_TINT;
      res.floatingText = FLOATING_TEXT_ABYSSAL_FUSED;
    }

    return res;
  }

  /**
   * Tactical Bomb interaction: Kicked across active abyssal tile
   */
  public onBombKicked(
    _bombId: string,
    row: number,
    col: number,
    kickSpeed: number = 0
  ): AbyssalBombResult {
    void _bombId;
    const res = this.scratchBombResult;
    res.isAccelerated = false;
    res.fuseAccelerationMs = 0;
    res.isSlipstreamKick = false;
    res.kickSpeed = kickSpeed;
    res.isMaelstrom = false;
    res.extraPower = 0;
    res.bonusScore = 0;
    res.bombTint = 0xffffff;
    res.floatingText = '';

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return res;

    const idx = row * COLS + col;
    if (this.dangerMask[idx] === AbyssalDangerValue.TIDAL || this.dangerMask[idx] === AbyssalDangerValue.MAELSTROM) {
      res.isSlipstreamKick = true;
      res.kickSpeed = BOMB_KICK_ABYSSAL_SPEED;
      res.floatingText = FLOATING_TEXT_ABYSSAL_SLIPSTREAM;
    }

    return res;
  }

  /**
   * Evaluates continuous bomb sliding velocity boost over abyssal tiles
   */
  public evaluateBombSlide(row: number, col: number, currentSpeed: number): AbyssalBombResult {
    const res = this.scratchBombResult;
    res.isAccelerated = false;
    res.fuseAccelerationMs = 0;
    res.isSlipstreamKick = false;
    res.kickSpeed = currentSpeed;
    res.isMaelstrom = false;
    res.extraPower = 0;
    res.bonusScore = 0;
    res.bombTint = 0xffffff;
    res.floatingText = '';

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return res;

    const idx = row * COLS + col;
    if (this.dangerMask[idx] === AbyssalDangerValue.TIDAL || this.dangerMask[idx] === AbyssalDangerValue.MAELSTROM) {
      res.isSlipstreamKick = true;
      res.kickSpeed = Math.max(currentSpeed, BOMB_KICK_ABYSSAL_SPEED);
      res.floatingText = FLOATING_TEXT_ABYSSAL_SLIPSTREAM;
    }

    return res;
  }

  /**
   * Tactical Bomb interaction: Detonating inside active abyssal maelstrom
   */
  public onBombDetonated(
    _bombId: string,
    row: number,
    col: number,
    _power: number
  ): AbyssalBombResult {
    void _bombId;
    void _power;
    const res = this.scratchBombResult;
    res.isAccelerated = false;
    res.fuseAccelerationMs = 0;
    res.isSlipstreamKick = false;
    res.kickSpeed = 0;
    res.isMaelstrom = false;
    res.extraPower = 0;
    res.bonusScore = 0;
    res.ultimateChargeBonus = 0;
    res.bombTint = 0xffffff;
    res.floatingText = '';

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return res;

    const idx = row * COLS + col;
    if (this.dangerMask[idx] === AbyssalDangerValue.MAELSTROM) {
      res.isMaelstrom = true;
      res.extraPower = MAELSTROM_EXTRA_POWER;
      res.bonusScore = MAELSTROM_BONUS_SCORE;
      res.ultimateChargeBonus = MAELSTROM_ULT_CHARGE;
      res.bombTint = ABYSSAL_SUPER_BOMB_TINT;
      res.floatingText = FLOATING_TEXT_MAELSTROM_DETONATION;
    }

    return res;
  }

  /**
   * Bomb blast impact converts hit abyssal tiles into a stabilized oceanic calm zone
   */
  public onBombBlastImpact(row: number, col: number): AbyssalCleanseResult {
    const res = this.scratchCleanseResult;
    res.cleanedTilesCount = 0;
    res.durationMs = 0;
    res.floatingText = '';

    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return res;

    const idx = row * COLS + col;
    if (this.dangerMask[idx] === AbyssalDangerValue.TIDAL || this.dangerMask[idx] === AbyssalDangerValue.MAELSTROM) {
      this.dangerMask[idx] = AbyssalDangerValue.CALM;
      this.cleanseGrid[idx] = HYDRO_BARRIER_ANCHOR_DURATION_MS;
      this.pressureGrid[idx] = 0.0;

      res.cleanedTilesCount = 1;
      res.durationMs = HYDRO_BARRIER_ANCHOR_DURATION_MS;
      res.floatingText = FLOATING_TEXT_HYDRO_BARRIER_ANCHOR;
    }

    return res;
  }

  public cleanseAbyssalAt(blastTiles: Array<{ r: number; c: number }>): AbyssalCleanseResult {
    const res = this.scratchCleanseResult;
    res.cleanedTilesCount = 0;
    res.durationMs = OCEANIC_CALM_DURATION_MS;
    res.floatingText = FLOATING_TEXT_OCEANIC_CALM;

    if (!blastTiles || !Array.isArray(blastTiles)) return res;

    for (let i = 0; i < blastTiles.length; i++) {
      const tile = blastTiles[i];
      if (!tile || !Number.isFinite(tile.r) || !Number.isFinite(tile.c)) continue;
      const r = tile.r | 0;
      const c = tile.c | 0;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;

      const idx = r * COLS + c;
      if (idx < 0 || idx >= TOTAL_TILES) continue;

      if (this.dangerMask[idx] === AbyssalDangerValue.TIDAL || this.dangerMask[idx] === AbyssalDangerValue.MAELSTROM) {
        this.cleanseGrid[idx] = OCEANIC_CALM_DURATION_MS;
        this.dangerMask[idx] = AbyssalDangerValue.CALM;
        this.pressureGrid[idx] = 0.0;
        res.cleanedTilesCount++;
      }
    }

    return res;
  }

  /**
   * Tuning modes
   */
  public setClimaxMode(enabled: boolean): void {
    this.currentCooldownDurationMs = enabled
      ? CLIMAX_ABYSSAL_COOLDOWN_MS
      : DEFAULT_ABYSSAL_COOLDOWN_MS;
  }

  public setWhispersMode(enabled: boolean): void {
    this.currentCooldownDurationMs = enabled
      ? WHISPERS_ABYSSAL_COOLDOWN_MS
      : DEFAULT_ABYSSAL_COOLDOWN_MS;
  }

  // Getters & queries
  public getDangerMask(): Uint8Array { return this.dangerMask; }
  public getPressureGrid(): Float32Array { return this.pressureGrid; }
  public getDensityGrid(): Float32Array { return this.pressureGrid; } // Harmonization alias
  public getCleanseGrid(): Float32Array { return this.cleanseGrid; }
  public getActiveAbyssalIndices(): Int16Array { return this.activeAbyssalIndices; }
  public getActiveAbyssalCount(): number {
    return this.state === AbyssalLifecycleState.DORMANT ? 0 : this.activeAbyssalCount;
  }
  public getState(): AbyssalLifecycleState { return this.state; }
  public getTelegraphPhase(): AbyssalTelegraphPhase { return this.telegraphPhase; }
  public getCenterRow(): number { return this.centerRow; }
  public getCenterCol(): number { return this.centerCol; }
  public setCenter(centerR: number, centerC: number): void { this.init(centerR, centerC); }

  public getSafeAreaRatio(): number {
    let hazardousCount = 0;
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (
        this.dangerMask[i] === AbyssalDangerValue.TIDAL ||
        this.dangerMask[i] === AbyssalDangerValue.MAELSTROM
      ) {
        hazardousCount++;
      }
    }
    return (TOTAL_TILES - hazardousCount) / TOTAL_TILES;
  }

  public isTileInAbyss(row: number, col: number): boolean {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    return this.dangerMask[row * COLS + col] === AbyssalDangerValue.TIDAL;
  }

  public isTileInAbyssalZone(row: number, col: number): boolean {
    return this.isTileInAbyss(row, col);
  }

  public isTileInTrench(row: number, col: number): boolean {
    return this.isTileInAbyss(row, col);
  }

  public isTileInMaelstrom(row: number, col: number): boolean {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    return this.dangerMask[row * COLS + col] === AbyssalDangerValue.MAELSTROM;
  }

  public isTileInCalm(row: number, col: number): boolean {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    return this.dangerMask[row * COLS + col] === AbyssalDangerValue.CALM;
  }

  public isTileCleansed(row: number, col: number): boolean {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    const idx = (row * COLS + col) | 0;
    return this.cleanseGrid[idx] > 0 || this.dangerMask[idx] === AbyssalDangerValue.CALM;
  }

  public isTileCalm(row: number, col: number): boolean {
    return this.isTileCleansed(row, col);
  }

  public getActiveIndices(): Int16Array {
    return this.activeAbyssalIndices.subarray(0, this.activeAbyssalCount);
  }

  public isPointInAbyss(px: number, py: number): boolean {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    return this.isTileInAbyss(row, col);
  }

  public isPointInAbyssalZone(px: number, py: number): boolean {
    return this.isPointInAbyss(px, py);
  }

  public isPointLethal(px: number, py: number): boolean {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    return this.isTileInMaelstrom(row, col);
  }

  public stop(): void {
    this.state = AbyssalLifecycleState.DORMANT;
    this.telegraphPhase = AbyssalTelegraphPhase.NONE;
    this.stateTimerMs = 0;
    this.activeAbyssalCount = 0;
    for (let i = 0; i < TOTAL_TILES; i++) {
      this.dangerMask[i] = AbyssalDangerValue.SAFE;
      this.pressureGrid[i] = 0.0;
      this.cleanseGrid[i] = 0.0;
    }
  }

  public reset(): void {
    this.stop();
  }

  public destroy(): void {
    this.stop();
    this.activeAbyssalCount = 0;
  }
}
