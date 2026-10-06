/**
 * ChronoHazard.ts — Chrono Anomaly & Tachyon Dilation Dynamic Hazard & Tactical Bomb Interaction Engine
 *
 * Implements the 7th Mythic Dimensional Element (Time/Temporal Dimension) completing the Cosmic Pantheon:
 *     1. Aether / Light: Quantum Spire (DynamicHazard)
 *     2. Void / Gravity: Gravitational Singularity (GravityHazard)
 *     3. Water / Ice: Cryo Glaciation (FrostHazard)
 *     4. Air / Lightning: Tesla Storm (VoltHazard)
 *     5. Earth / Fire: Magma Caldera & Pyroclastic Surge (MagmaHazard)
 *     6. Nature / Decay: Toxic Miasma & Spore Bloom (MiasmaHazard)
 *     7. Time / Spacetime: Chrono Anomaly & Tachyon Dilation (ChronoHazard)
 *
 * Architecture & Features:
 * - 4-Stage Lifecycle FSM: DORMANT -> CHRONO_DISTORTION (2000ms) -> TIME_COLLAPSE (350ms) -> TACHYON_RECOVERY (5800ms)
 * - 3-Tier Telegraph Sub-Phases: TEMPORAL_RIPPLE (1000ms) -> TACHYON_WARP (600ms) -> EVENT_HORIZON_IMMINENT (400ms)
 * - Zero-GC 1D TypedArray Memory Layout (Uint8Array dangerMask, Float32Array dilationGrid, Float32Array cleanseGrid, Int16Array activeChronoIndices)
 * - Mathematical Safe Area Guarantees: Safe Area >= 80% (Guaranteed >= 85.128% on standard 13x15 arenas, exactly 29 lattice tiles in radius 3)
 * - Tactical Bomb Interactions:
 *     1. Chrono-Shifted Bomb: Fuse accelerated by -1.3s on active chrono tiles, neon indigo/violet pulse tint (0x818cf8)
 *     2. Tachyon Slipstream Kick: Sliding across chrono tiles accelerates to 460 px/s
 *     3. Temporal Implosion Detonation: Detonating in collapsing zone grants +2 piercing power and +250 bonus score
 *     4. Timeline Stabilization (Temporal Anchor): Bomb blast impacts stabilize spacetime into a calm anchor zone (4.0s safe footing)
 * - Environmental Entity Interactions:
 *     1. Minion Temporal Dissolution: 120 environmental damage, +120 score bonus, +6 ult charge, '⏳ TIME COLLAPSED!'
 *     2. Boss Chrono Stasis: 15% Max HP damage, 1.5s complete stasis stun, with Anti-Exploit Guard (single hit per burst)
 *     3. Player Combat Mastery: Chrono Surge / Tachyon Dash (I-Frames 1200ms, +40% speed burst) vs Temporal Dilation (-30% speed debuff for 2000ms)
 */

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
} from '../pathfinding.ts';

export { ROWS, COLS, TOTAL_TILES, TILE_SIZE };

/**
 * Universal Lifecycle States for Chrono Hazard FSM
 */
export const ChronoLifecycleState = {
  DORMANT: 'DORMANT',
  CHRONO_DISTORTION: 'CHRONO_DISTORTION',
  TIME_COLLAPSE: 'TIME_COLLAPSE',
  TACHYON_RECOVERY: 'TACHYON_RECOVERY',
  // Harmonization aliases
  CHRONO_TELEGRAPH: 'CHRONO_DISTORTION',
  TEMPORAL_WARP: 'CHRONO_DISTORTION',
  TEMPORAL_COLLAPSE: 'TIME_COLLAPSE',
  CHRONO_BURST: 'TIME_COLLAPSE',
  COOLDOWN: 'TACHYON_RECOVERY',
  TACHYON_COOLDOWN: 'TACHYON_RECOVERY',
} as const;

export type ChronoLifecycleState =
  typeof ChronoLifecycleState[keyof typeof ChronoLifecycleState];

/**
 * 3-Tier Sub-Phases during CHRONO_DISTORTION Lifecycle State
 */
export const ChronoTelegraphPhase = {
  NONE: 'NONE',
  TEMPORAL_RIPPLE: 'TEMPORAL_RIPPLE',             // 0ms - 1000ms: Subtle spacetime ripple, faint ticking clock glyph
  TACHYON_WARP: 'TACHYON_WARP',                   // 1000ms - 1600ms: Accelerating spacetime spiral, violet/cyan dilation
  EVENT_HORIZON_IMMINENT: 'EVENT_HORIZON_IMMINENT', // 1600ms - 2000ms: Spacetime tension reaches singularity
  // Aliases
  RIPPLE_PHASE: 'TEMPORAL_RIPPLE',
  WARP_PHASE: 'TACHYON_WARP',
  COLLAPSE_IMMINENT: 'EVENT_HORIZON_IMMINENT',
  HORIZON_IMMINENT: 'EVENT_HORIZON_IMMINENT',
} as const;

export type ChronoTelegraphPhase =
  typeof ChronoTelegraphPhase[keyof typeof ChronoTelegraphPhase];

/**
 * Danger Mask Discrete Bit Values (Uint8Array)
 */
export const ChronoDangerValue = {
  SAFE: 0,             // Safe walkable tile
  DILATION: 1,         // Spacetime dilation zone: non-lethal, slows non-dashing players
  WARPING: 1,          // Alias
  COLLAPSE: 2,         // Active time collapse: instant minion dissolution & lethal damage
  ANCHOR: 3,           // Stabilized timeline (temporal anchor): temporary safe footing created by bomb blast
  STABILIZED: 3,       // Alias
  CLEANSED: 3,         // Alias
} as const;

export type ChronoDangerValue =
  typeof ChronoDangerValue[keyof typeof ChronoDangerValue];

/**
 * Timing & Tuning Constants (ms)
 */
export const DURATION_TEMPORAL_RIPPLE_MS = 1000;
export const DURATION_TACHYON_WARP_MS = 600;
export const DURATION_EVENT_HORIZON_IMMINENT_MS = 400;
export const DURATION_CHRONO_DISTORTION_MS = 2000;
export const DURATION_TIME_COLLAPSE_MS = 350;

export const DEFAULT_CHRONO_COOLDOWN_MS = 5800;       // Standard recovery
export const CLIMAX_CHRONO_COOLDOWN_MS = 3800;        // Climax recovery
export const WHISPERS_CHRONO_COOLDOWN_MS = 9000;      // Whispers teaching recovery

export const CHRONO_RADIUS_TILES = 3;
export const CHRONO_MAX_RADIUS_PX = CHRONO_RADIUS_TILES * TILE_SIZE; // 120px
export const CHRONO_RADIUS_PX = CHRONO_MAX_RADIUS_PX;
export const MAX_CHRONO_TILES = 32;

export const MIN_CHRONO_SAFE_AREA_RATIO = 0.80;

/**
 * Player Combat Mastery Tuning Constants
 */
export const CHRONO_SURGE_INVULN_MS = 1200;
export const CHRONO_SURGE_SPEED_BURST_RATIO = 0.40;
export const CHRONO_SURGE_COOLDOWN_MS = 1500;

export const TEMPORAL_DILATION_DURATION_MS = 2000;
export const TEMPORAL_DILATION_SLOW_RATIO = 0.30;
export const PLAYER_TIME_COLLAPSE_DAMAGE = 25;

/**
 * Tactical Bomb Constants
 */
export const CHRONO_SUPER_BOMB_TINT = 0x818cf8;        // Neon Indigo/Violet
export const CHRONO_FUSE_ACCELERATION_MS = 1300;       // -1.3s fuse time
export const TEMPORAL_IMPLOSION_EXTRA_POWER = 2;       // +2 blast radius
export const TEMPORAL_IMPLOSION_BONUS_SCORE = 250;     // +250 tactical score
export const BOMB_KICK_CHRONO_SPEED = 460;             // 460 px/s slipstream glide
export const TIMELINE_STABILIZE_DURATION_MS = 4000;    // 4.0s safe stabilized timeline

/**
 * Environmental Minion & Boss Tuning Constants
 */
export const CHRONO_MINION_DAMAGE = 120;
export const ENEMY_CHRONO_SCORE = 120;
export const ENEMY_CHRONO_ULTIMATE_CHARGE = 6;
export const BOSS_CHRONO_DAMAGE_RATIO = 0.15;          // 15% Max HP flat damage
export const BOSS_CHRONO_STASIS_STUN_MS = 1500;        // 1.5s stasis stun
export const BOSS_CHRONO_EXPLOIT_COOLDOWN_MS = 2500;   // Single hit guard per collapse cycle

/**
 * Visual Floating Text Labels
 */
export const FLOATING_TEXT_CHRONO_SURGE = '✦ CHRONO SURGE!';
export const FLOATING_TEXT_TEMPORAL_DILATION = '⏳ TIME DILATED (-30%)';
export const FLOATING_TEXT_CHRONO_SHIFTED = '⏳ CHRONO-SHIFTED (-1.3s)';
export const FLOATING_TEXT_TACHYON_GLIDE = '⏳ TACHYON GLIDE!';
export const FLOATING_TEXT_CHRONO_SLIPSTREAM = '⏳ CHRONO SLIPSTREAM!';
export const FLOATING_TEXT_TEMPORAL_IMPLOSION = '⏳ TEMPORAL IMPLOSION (+250)';
export const FLOATING_TEXT_TIMELINE_STABILIZED = '✦ TIMELINE STABILIZED!';
export const FLOATING_TEXT_TIME_COLLAPSED = '⏳ TIME COLLAPSED!';
export const FLOATING_TEXT_CHRONO_STASIS = '⏳ CHRONO STASIS (1.5s)!';

export const ELEMENTAL_REACTION_CHRONO_IMPLOSION = 'CHRONO_IMPLOSION';

export interface ChronoPlayerResult {
  hit: boolean;
  damage: number;
  isLethal: boolean;
  isDilated: boolean;
  temporalDilationInflicted: boolean;
  slowFactor: number;
  slowDurationMs: number;
  isSurgeActivated: boolean;
  chronoSurgeGranted: boolean;
  surgeInvulnMs: number;
  surgeSpeedBoost: number;
  floatingText: string;
}

export interface ChronoEnemyResult {
  hit: boolean;
  damage: number;
  isDissolved: boolean;
  isDecomposed: boolean;
  isStasisStunned: boolean;
  isStunned: boolean;
  stunDurationMs: number;
  scoreBonus: number;
  ultimateChargeBonus: number;
  floatingText: string;
}

export interface ChronoBombResult {
  isAccelerated: boolean;
  fuseAccelerationMs: number;
  isSlipstreamKick: boolean;
  kickSpeed: number;
  isChronoImplosion: boolean;
  extraPower: number;
  bonusScore: number;
  bombTint: number;
  floatingText: string;
}

export interface ChronoCleanseResult {
  cleanedTilesCount: number;
  durationMs: number;
  floatingText: string;
}

/**
 * ChronoHazard — High-performance Zero-GC Dynamic Hazard Controller
 */
export class ChronoHazard {
  public state: ChronoLifecycleState = ChronoLifecycleState.DORMANT;
  public telegraphPhase: ChronoTelegraphPhase = ChronoTelegraphPhase.NONE;

  private centerRow: number = 6;
  private centerCol: number = 7;
  private currentCooldownDurationMs: number = DEFAULT_CHRONO_COOLDOWN_MS;
  private stateTimerMs: number = 0;

  // Zero-GC 1D Memory Layout
  private dangerMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  private dilationGrid: Float32Array = new Float32Array(TOTAL_TILES);
  private cleanseGrid: Float32Array = new Float32Array(TOTAL_TILES);
  private activeChronoIndices: Int16Array = new Int16Array(MAX_CHRONO_TILES);
  private activeChronoCount: number = 0;

  // Anti-Exploit boss cooldown timestamp
  private lastBossHitTimestampMs: number = -99999;
  // Player surge cooldown timestamp
  private lastPlayerSurgeTimestampMs: number = -99999;

  // Pre-allocated scratch result containers
  private scratchPlayerResult: ChronoPlayerResult = {
    hit: false,
    damage: 0,
    isLethal: false,
    isDilated: false,
    temporalDilationInflicted: false,
    slowFactor: 1.0,
    slowDurationMs: 0,
    isSurgeActivated: false,
    chronoSurgeGranted: false,
    surgeInvulnMs: 0,
    surgeSpeedBoost: 0,
    floatingText: '',
  };

  private scratchEnemyResult: ChronoEnemyResult = {
    hit: false,
    damage: 0,
    isDissolved: false,
    isDecomposed: false,
    isStasisStunned: false,
    isStunned: false,
    stunDurationMs: 0,
    scoreBonus: 0,
    ultimateChargeBonus: 0,
    floatingText: '',
  };

  private scratchBombResult: ChronoBombResult = {
    isAccelerated: false,
    fuseAccelerationMs: 0,
    isSlipstreamKick: false,
    kickSpeed: 0,
    isChronoImplosion: false,
    extraPower: 0,
    bonusScore: 0,
    bombTint: 0xffffff,
    floatingText: '',
  };

  private scratchCleanseResult: ChronoCleanseResult = {
    cleanedTilesCount: 0,
    durationMs: 0,
    floatingText: '',
  };

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.state = ChronoLifecycleState.DORMANT;
    this.telegraphPhase = ChronoTelegraphPhase.NONE;
    this.stateTimerMs = 0;
    this.activeChronoCount = 0;
    this.lastBossHitTimestampMs = -99999;
    this.lastPlayerSurgeTimestampMs = -99999;
    this.dangerMask.fill(0);
    this.dilationGrid.fill(0);
    this.cleanseGrid.fill(0);
    this.activeChronoIndices.fill(-1);
  }

  public start(mode: 'WHISPERS' | 'NORMAL' | 'CLIMAX' = 'NORMAL', centerR: number = 6, centerC: number = 7): void {
    if (mode === 'CLIMAX') {
      this.currentCooldownDurationMs = CLIMAX_CHRONO_COOLDOWN_MS;
    } else if (mode === 'WHISPERS') {
      this.currentCooldownDurationMs = WHISPERS_CHRONO_COOLDOWN_MS;
    } else {
      this.currentCooldownDurationMs = DEFAULT_CHRONO_COOLDOWN_MS;
    }

    this.centerRow = Math.max(1, Math.min(ROWS - 2, centerR | 0));
    this.centerCol = Math.max(1, Math.min(COLS - 2, centerC | 0));
    this.buildLatticeBall(this.centerRow, this.centerCol);

    this.state = ChronoLifecycleState.CHRONO_DISTORTION;
    this.telegraphPhase = ChronoTelegraphPhase.TEMPORAL_RIPPLE;
    this.stateTimerMs = 0;
    this.updateDangerMaskAndDilation();
  }

  public stop(): void {
    this.reset();
  }

  public getState(): ChronoLifecycleState {
    return this.state;
  }

  public getTelegraphPhase(): ChronoTelegraphPhase {
    return this.telegraphPhase;
  }

  public getDangerMask(): Uint8Array {
    return this.dangerMask;
  }

  public getDilationGrid(): Float32Array {
    return this.dilationGrid;
  }

  public getCleanseGrid(): Float32Array {
    return this.cleanseGrid;
  }

  public getActiveChronoIndices(): Int16Array {
    return this.activeChronoIndices;
  }

  public getActiveChronoCount(): number {
    return this.activeChronoCount;
  }

  public getCenter(): { r: number; c: number } {
    return { r: this.centerRow, c: this.centerCol };
  }

  public calculateSafeAreaRatio(): number {
    let dangerousCount = 0;
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (this.dangerMask[i] === ChronoDangerValue.DILATION || this.dangerMask[i] === ChronoDangerValue.COLLAPSE) {
        dangerousCount++;
      }
    }
    return (TOTAL_TILES - dangerousCount) / TOTAL_TILES;
  }

  public getSafeAreaRatio(): number {
    return this.calculateSafeAreaRatio();
  }

  public getCooldownDurationMs(): number {
    return this.currentCooldownDurationMs;
  }

  private buildLatticeBall(centerR: number, centerC: number): void {
    this.activeChronoCount = 0;
    const r2 = CHRONO_RADIUS_TILES * CHRONO_RADIUS_TILES;

    for (let dr = -CHRONO_RADIUS_TILES; dr <= CHRONO_RADIUS_TILES; dr++) {
      const r = centerR + dr;
      if (r < 0 || r >= ROWS) continue;

      for (let dc = -CHRONO_RADIUS_TILES; dc <= CHRONO_RADIUS_TILES; dc++) {
        const c = centerC + dc;
        if (c < 0 || c >= COLS) continue;

        if (dr * dr + dc * dc <= r2) {
          const idx = r * COLS + c;
          if (this.activeChronoCount < MAX_CHRONO_TILES) {
            this.activeChronoIndices[this.activeChronoCount++] = idx;
          }
        }
      }
    }
  }

  public update(deltaMs: number): void {
    if (this.state === ChronoLifecycleState.DORMANT) return;

    // Decay stabilized timeline tiles
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (this.cleanseGrid[i] > 0) {
        this.cleanseGrid[i] = Math.max(0, this.cleanseGrid[i] - deltaMs);
      }
    }

    this.stateTimerMs += deltaMs;

    switch (this.state) {
      case ChronoLifecycleState.CHRONO_DISTORTION: {
        if (this.stateTimerMs < DURATION_TEMPORAL_RIPPLE_MS) {
          this.telegraphPhase = ChronoTelegraphPhase.TEMPORAL_RIPPLE;
        } else if (this.stateTimerMs < DURATION_TEMPORAL_RIPPLE_MS + DURATION_TACHYON_WARP_MS) {
          this.telegraphPhase = ChronoTelegraphPhase.TACHYON_WARP;
        } else if (this.stateTimerMs < DURATION_CHRONO_DISTORTION_MS) {
          this.telegraphPhase = ChronoTelegraphPhase.EVENT_HORIZON_IMMINENT;
        } else {
          // Transition to lethal TIME_COLLAPSE
          this.state = ChronoLifecycleState.TIME_COLLAPSE;
          this.telegraphPhase = ChronoTelegraphPhase.NONE;
          this.stateTimerMs = 0;
        }
        this.updateDangerMaskAndDilation();
        break;
      }

      case ChronoLifecycleState.TIME_COLLAPSE: {
        if (this.stateTimerMs >= DURATION_TIME_COLLAPSE_MS) {
          this.state = ChronoLifecycleState.TACHYON_RECOVERY;
          this.telegraphPhase = ChronoTelegraphPhase.NONE;
          this.stateTimerMs = 0;
        }
        this.updateDangerMaskAndDilation();
        break;
      }

      case ChronoLifecycleState.TACHYON_RECOVERY: {
        if (this.stateTimerMs >= this.currentCooldownDurationMs) {
          // Relocate center within arena bounds
          const nextR = 2 + Math.floor(Math.random() * (ROWS - 4));
          const nextC = 2 + Math.floor(Math.random() * (COLS - 4));
          this.centerRow = nextR;
          this.centerCol = nextC;
          this.buildLatticeBall(this.centerRow, this.centerCol);

          this.state = ChronoLifecycleState.CHRONO_DISTORTION;
          this.telegraphPhase = ChronoTelegraphPhase.TEMPORAL_RIPPLE;
          this.stateTimerMs = 0;
        }
        this.updateDangerMaskAndDilation();
        break;
      }
    }
  }

  private updateDangerMaskAndDilation(): void {
    this.dangerMask.fill(0);
    this.dilationGrid.fill(0);

    // Apply cleansed / stabilized anchors
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (this.cleanseGrid[i] > 0) {
        this.dangerMask[i] = ChronoDangerValue.ANCHOR;
      }
    }

    if (this.state === ChronoLifecycleState.DORMANT || this.state === ChronoLifecycleState.TACHYON_RECOVERY) {
      return;
    }

    const isBurst = this.state === ChronoLifecycleState.TIME_COLLAPSE;

    for (let i = 0; i < this.activeChronoCount; i++) {
      const idx = this.activeChronoIndices[i];
      if (idx < 0 || idx >= TOTAL_TILES) continue;

      if (this.cleanseGrid[idx] > 0) {
        continue;
      }

      if (isBurst) {
        this.dangerMask[idx] = ChronoDangerValue.COLLAPSE;
        this.dilationGrid[idx] = 1.0;
      } else {
        this.dangerMask[idx] = ChronoDangerValue.DILATION;
        const progress = Math.min(1.0, this.stateTimerMs / DURATION_CHRONO_DISTORTION_MS);
        this.dilationGrid[idx] = 0.2 + 0.8 * progress;
      }
    }
  }

  public isPointDilation(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = (y / TILE_SIZE) | 0;
    const c = (x / TILE_SIZE) | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const idx = r * COLS + c;
    if (idx < 0 || idx >= TOTAL_TILES) return false;
    return this.dangerMask[idx] === ChronoDangerValue.DILATION;
  }

  public isPointLethal(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = (y / TILE_SIZE) | 0;
    const c = (x / TILE_SIZE) | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const idx = r * COLS + c;
    if (idx < 0 || idx >= TOTAL_TILES) return false;
    return this.dangerMask[idx] === ChronoDangerValue.COLLAPSE;
  }

  public isTileStabilized(r: number, c: number): boolean {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return false;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const idx = ir * COLS + ic;
    if (idx < 0 || idx >= TOTAL_TILES) return false;
    return this.dangerMask[idx] === ChronoDangerValue.ANCHOR;
  }

  public evaluatePlayer(
    px: number,
    py: number,
    isDashing: boolean = false,
    hasShieldOrTime: boolean | number = false,
    currentTimeOrWantX: number = Date.now(),
    _wantX?: number,
    _wantY?: number
  ): ChronoPlayerResult {
    let hasShield = false;
    let currentTimeMs = Date.now();
    if (typeof hasShieldOrTime === 'number') {
      currentTimeMs = hasShieldOrTime;
    } else {
      hasShield = Boolean(hasShieldOrTime);
      if (typeof currentTimeOrWantX === 'number') {
        currentTimeMs = currentTimeOrWantX;
      }
    }

    const res = this.scratchPlayerResult;
    res.hit = false;
    res.damage = 0;
    res.isLethal = false;
    res.isDilated = false;
    res.temporalDilationInflicted = false;
    res.slowFactor = 1.0;
    res.slowDurationMs = 0;
    res.isSurgeActivated = false;
    res.chronoSurgeGranted = false;
    res.surgeInvulnMs = 0;
    res.surgeSpeedBoost = 0;
    res.floatingText = '';

    if (!Number.isFinite(px) || !Number.isFinite(py)) return res;
    const r = (py / TILE_SIZE) | 0;
    const c = (px / TILE_SIZE) | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return res;

    const idx = r * COLS + c;
    if (idx < 0 || idx >= TOTAL_TILES) return res;

    const maskVal = this.dangerMask[idx];

    // Stabilized / Cleaned tiles are 100% safe
    if (maskVal === ChronoDangerValue.ANCHOR) {
      return res;
    }

    // Active Time Collapse (Lethal Burst)
    if (maskVal === ChronoDangerValue.COLLAPSE) {
      if (isDashing) {
        // Chrono Surge mastery: dashing through collapse activates surge
        if (currentTimeMs - this.lastPlayerSurgeTimestampMs >= CHRONO_SURGE_COOLDOWN_MS) {
          this.lastPlayerSurgeTimestampMs = currentTimeMs;
          res.isSurgeActivated = true;
          res.chronoSurgeGranted = true;
          res.surgeInvulnMs = CHRONO_SURGE_INVULN_MS;
          res.surgeSpeedBoost = CHRONO_SURGE_SPEED_BURST_RATIO;
          res.floatingText = FLOATING_TEXT_CHRONO_SURGE;
        }
      } else {
        res.hit = true;
        res.isLethal = true;
        res.damage = hasShield ? 0 : PLAYER_TIME_COLLAPSE_DAMAGE;
        res.floatingText = FLOATING_TEXT_TIME_COLLAPSED;
      }
      return res;
    }

    // Chrono Distortion (Dilation Zone)
    if (maskVal === ChronoDangerValue.DILATION) {
      if (isDashing) {
        if (currentTimeMs - this.lastPlayerSurgeTimestampMs >= CHRONO_SURGE_COOLDOWN_MS) {
          this.lastPlayerSurgeTimestampMs = currentTimeMs;
          res.isSurgeActivated = true;
          res.chronoSurgeGranted = true;
          res.surgeInvulnMs = CHRONO_SURGE_INVULN_MS;
          res.surgeSpeedBoost = CHRONO_SURGE_SPEED_BURST_RATIO;
          res.floatingText = FLOATING_TEXT_CHRONO_SURGE;
        }
      } else {
        res.isDilated = true;
        res.temporalDilationInflicted = true;
        res.slowFactor = 1.0 - TEMPORAL_DILATION_SLOW_RATIO; // 0.70x
        res.slowDurationMs = TEMPORAL_DILATION_DURATION_MS;
        res.floatingText = FLOATING_TEXT_TEMPORAL_DILATION;
      }
    }

    res.chronoSurgeGranted = res.isSurgeActivated;
    res.temporalDilationInflicted = res.isDilated;
    return res;
  }

  public checkEnemyCollision(
    er: number,
    ec: number,
    isBoss: boolean,
    currentTimeMs: number = Date.now()
  ): ChronoEnemyResult {
    const res = this.scratchEnemyResult;
    res.hit = false;
    res.damage = 0;
    res.isDissolved = false;
    res.isDecomposed = false;
    res.isStasisStunned = false;
    res.isStunned = false;
    res.stunDurationMs = 0;
    res.scoreBonus = 0;
    res.ultimateChargeBonus = 0;
    res.floatingText = '';

    if (!Number.isFinite(er) || !Number.isFinite(ec)) return res;
    const r = er | 0;
    const c = ec | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return res;

    const idx = r * COLS + c;
    if (idx < 0 || idx >= TOTAL_TILES) return res;

    if (this.dangerMask[idx] === ChronoDangerValue.COLLAPSE) {
      if (isBoss) {
        // Anti-exploit cooldown: boss can only take damage once per collapse cycle
        if (currentTimeMs - this.lastBossHitTimestampMs >= BOSS_CHRONO_EXPLOIT_COOLDOWN_MS) {
          this.lastBossHitTimestampMs = currentTimeMs;
          res.hit = true;
          res.isStasisStunned = true;
          res.isStunned = true;
          res.stunDurationMs = BOSS_CHRONO_STASIS_STUN_MS;
          res.damage = 1; // Handled as boss ratio in GameScene
          res.floatingText = FLOATING_TEXT_CHRONO_STASIS;
        }
      } else {
        res.hit = true;
        res.isDissolved = true;
        res.isDecomposed = true;
        res.damage = CHRONO_MINION_DAMAGE;
        res.scoreBonus = ENEMY_CHRONO_SCORE;
        res.ultimateChargeBonus = ENEMY_CHRONO_ULTIMATE_CHARGE;
        res.floatingText = FLOATING_TEXT_TIME_COLLAPSED;
      }
    }

    res.isDecomposed = res.isDissolved;
    res.isStunned = res.isStasisStunned;
    return res;
  }

  public evaluateBomb(br: number, bc: number): ChronoBombResult {
    const res = this.scratchBombResult;
    res.isAccelerated = false;
    res.fuseAccelerationMs = 0;
    res.isSlipstreamKick = false;
    res.kickSpeed = 0;
    res.isChronoImplosion = false;
    res.extraPower = 0;
    res.bonusScore = 0;
    res.bombTint = 0xffffff;
    res.floatingText = '';

    if (!Number.isFinite(br) || !Number.isFinite(bc)) return res;
    const r = br | 0;
    const c = bc | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return res;

    const idx = r * COLS + c;
    if (idx < 0 || idx >= TOTAL_TILES) return res;

    const maskVal = this.dangerMask[idx];

    // Bomb placed on Chrono Distortion / Collapse tile
    if (maskVal === ChronoDangerValue.DILATION || maskVal === ChronoDangerValue.COLLAPSE) {
      res.isAccelerated = true;
      res.fuseAccelerationMs = CHRONO_FUSE_ACCELERATION_MS;
      res.isSlipstreamKick = true;
      res.kickSpeed = BOMB_KICK_CHRONO_SPEED;
      res.bombTint = CHRONO_SUPER_BOMB_TINT;
      res.floatingText = FLOATING_TEXT_CHRONO_SHIFTED;
    }

    if (maskVal === ChronoDangerValue.COLLAPSE) {
      res.isChronoImplosion = true;
      res.extraPower = TEMPORAL_IMPLOSION_EXTRA_POWER;
      res.bonusScore = TEMPORAL_IMPLOSION_BONUS_SCORE;
      res.floatingText = FLOATING_TEXT_TEMPORAL_IMPLOSION;
    }

    return res;
  }

  public stabilizeTilesWithExplosion(blastTiles: Array<{ r: number; c: number }>): ChronoCleanseResult {
    const res = this.scratchCleanseResult;
    res.cleanedTilesCount = 0;
    res.durationMs = TIMELINE_STABILIZE_DURATION_MS;
    res.floatingText = FLOATING_TEXT_TIMELINE_STABILIZED;

    if (!blastTiles || !Array.isArray(blastTiles)) return res;

    for (let i = 0; i < blastTiles.length; i++) {
      const tile = blastTiles[i];
      if (!tile || !Number.isFinite(tile.r) || !Number.isFinite(tile.c)) continue;
      const r = tile.r | 0;
      const c = tile.c | 0;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;

      const idx = r * COLS + c;
      if (idx < 0 || idx >= TOTAL_TILES) continue;

      // If tile was in dilation or collapse, stabilize it
      if (this.dangerMask[idx] === ChronoDangerValue.DILATION || this.dangerMask[idx] === ChronoDangerValue.COLLAPSE) {
        this.cleanseGrid[idx] = TIMELINE_STABILIZE_DURATION_MS;
        this.dangerMask[idx] = ChronoDangerValue.ANCHOR;
        res.cleanedTilesCount++;
      }
    }

    return res;
  }

  public init(centerR: number = 6, centerC: number = 7): void {
    this.start('NORMAL', centerR, centerC);
  }

  public evaluateBombSlide(br: number, bc: number, currentSpeed: number): { speed: number } {
    const bombRes = this.evaluateBomb(br, bc);
    if (bombRes.isSlipstreamKick) {
      return { speed: bombRes.kickSpeed };
    }
    return { speed: currentSpeed };
  }

  public onBombPlaced(
    _bombId: string,
    row: number,
    col: number,
    _power: number,
    fuseMs: number
  ): { isChronoShifted: boolean; modifiedFuseMs: number; tint: number; floatingText: string } {
    const res = this.evaluateBomb(row, col);
    if (res.isAccelerated) {
      return {
        isChronoShifted: true,
        modifiedFuseMs: Math.max(800, fuseMs - res.fuseAccelerationMs),
        tint: res.bombTint,
        floatingText: res.floatingText,
      };
    }
    return {
      isChronoShifted: false,
      modifiedFuseMs: fuseMs,
      tint: 0xffffff,
      floatingText: '',
    };
  }

  public onBombDetonated(
    _bombId: string,
    row: number,
    col: number,
    power: number
  ): { isTemporalImplosion: boolean; modifiedPower: number; piercing: boolean; bonusScore: number; floatingText: string } {
    const res = this.evaluateBomb(row, col);
    if (res.isChronoImplosion) {
      return {
        isTemporalImplosion: true,
        modifiedPower: power + res.extraPower,
        piercing: true,
        bonusScore: res.bonusScore,
        floatingText: res.floatingText,
      };
    }
    return {
      isTemporalImplosion: false,
      modifiedPower: power,
      piercing: false,
      bonusScore: 0,
      floatingText: '',
    };
  }

  public onBombBlastImpact(r: number, c: number): { stabilized: boolean; floatingText: string } {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return { stabilized: false, floatingText: '' };
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return { stabilized: false, floatingText: '' };
    const idx = ir * COLS + ic;
    if (idx < 0 || idx >= TOTAL_TILES) return { stabilized: false, floatingText: '' };

    if (this.dangerMask[idx] === ChronoDangerValue.DILATION || this.dangerMask[idx] === ChronoDangerValue.COLLAPSE) {
      this.cleanseGrid[idx] = TIMELINE_STABILIZE_DURATION_MS;
      this.dangerMask[idx] = ChronoDangerValue.ANCHOR;
      return { stabilized: true, floatingText: FLOATING_TEXT_TIMELINE_STABILIZED };
    }
    return { stabilized: false, floatingText: '' };
  }

  public onBombKicked(
    _bombId: string,
    row: number,
    col: number,
    currentSpeed: number
  ): { isSlipstream: boolean; modifiedSpeed: number; floatingText: string } {
    const res = this.evaluateBomb(row, col);
    if (res.isSlipstreamKick) {
      return {
        isSlipstream: true,
        modifiedSpeed: res.kickSpeed,
        floatingText: FLOATING_TEXT_CHRONO_SLIPSTREAM,
      };
    }
    return {
      isSlipstream: false,
      modifiedSpeed: currentSpeed,
      floatingText: '',
    };
  }
}
