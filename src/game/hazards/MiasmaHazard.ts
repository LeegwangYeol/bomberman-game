/**
 * MiasmaHazard.ts — Toxic Miasma & Spore Bloom Dynamic Hazard & Tactical Bomb Interaction Engine
 *
 * Implements the 6th Quintessential Element completing the Hexagonal Elemental Hexagram:
 *     1. Aether: Quantum Spire (DynamicHazard)
 *     2. Void: Gravitational Singularity (GravityHazard)
 *     3. Water/Ice: Cryo Glaciation (FrostHazard)
 *     4. Air/Lightning: Tesla Storm (VoltHazard)
 *     5. Earth/Fire: Magma Caldera & Pyroclastic Surge (MagmaHazard)
 *     6. Nature/Decay: Toxic Miasma & Spore Bloom (MiasmaHazard)
 *
 * Architecture & Features:
 * - 4-Stage Lifecycle FSM: DORMANT -> SPORE_INCUBATION (2000ms) -> CORROSIVE_BURST (350ms) -> SPORE_DISSIPATION (5700ms)
 * - 3-Tier Telegraph Sub-Phases: POD_SWELLING (1000ms) -> SPORE_EXHALATION (600ms) -> BLOOM_IMMINENT (400ms)
 * - Zero-GC 1D TypedArray Memory Layout (Uint8Array dangerMask, Float32Array sporeGrid, Float32Array cleanseTimerGrid, Int16Array activeSporeIndices)
 * - Mathematical Safe Area Guarantees: Safe Area >= 80% (Guaranteed >= 85.128% on standard 13x15 arenas, exactly 29 lattice tiles in radius 3)
 * - Tactical Bomb Interactions:
 *     1. Bio-Fused Bomb: Fuse accelerated by -1.2s on active spore tiles, emerald bio-pulse tint (0x10b981)
 *     2. Bio-Slick Kick: Sliding across spore film accelerates to 450 px/s
 *     3. Catalytic Detonation: Detonating in blooming zone grants +2 piercing power and +200 bonus score
 *     4. Floral Cleansing / Fertile Soil: Bomb blast impacts incinerate spores into fertile cleansed soil (4.0s safe footing)
 * - Environmental Entity Interactions:
 *     1. Minion Dissolution: 120 environmental damage, +120 score bonus, +6 ult charge, '🧪 DISSOLVED!'
 *     2. Boss Spore Overgrowth: 15% Max HP damage, 1.5s stun, with Anti-Exploit Guard (single hit per burst)
 *     3. Player Combat Mastery: Spore Surge / Photosynthetic Dash (I-Frames 1200ms, +35% speed burst) vs Neurotoxin (-25% speed debuff for 2000ms)
 */

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
} from '../pathfinding.ts';

export { ROWS, COLS, TOTAL_TILES, TILE_SIZE };

/**
 * Universal Lifecycle States for Miasma Hazard FSM
 */
export const MiasmaLifecycleState = {
  DORMANT: 'DORMANT',
  SPORE_INCUBATION: 'SPORE_INCUBATION',
  CORROSIVE_BURST: 'CORROSIVE_BURST',
  SPORE_DISSIPATION: 'SPORE_DISSIPATION',
  // Harmonization aliases
  SPORE_TELEGRAPH: 'SPORE_INCUBATION',
  SPORE_GERMINATION: 'SPORE_INCUBATION',
  TOXIC_BLOOM: 'CORROSIVE_BURST',
  MIASMA_BURST: 'CORROSIVE_BURST',
  SPORE_BURST: 'CORROSIVE_BURST',
  COOLDOWN: 'SPORE_DISSIPATION',
  DECAY_COOLDOWN: 'SPORE_DISSIPATION',
} as const;

export type MiasmaLifecycleState =
  typeof MiasmaLifecycleState[keyof typeof MiasmaLifecycleState];

/**
 * 3-Tier Sub-Phases during SPORE_INCUBATION Lifecycle State
 */
export const MiasmaTelegraphPhase = {
  NONE: 'NONE',
  POD_SWELLING: 'POD_SWELLING',         // 0ms - 1000ms: Spore pods emerge from ground, glowing bioluminescent veins
  SPORE_EXHALATION: 'SPORE_EXHALATION', // 1000ms - 1600ms: Thick greenish spore mist vents and spreads
  BLOOM_IMMINENT: 'BLOOM_IMMINENT',     // 1600ms - 2000ms: Pods pulse violently, corrosive spores about to burst
  // Aliases
  POD_INCUBATION: 'POD_SWELLING',
  MYCELIAL_SPREAD: 'POD_SWELLING',
  MIST_RISING: 'SPORE_EXHALATION',
  BURST_IMMINENT: 'BLOOM_IMMINENT',
  MIASMA_VENTING: 'BLOOM_IMMINENT',
} as const;

export type MiasmaTelegraphPhase =
  typeof MiasmaTelegraphPhase[keyof typeof MiasmaTelegraphPhase];

/**
 * Danger Mask Discrete Bit Values (Uint8Array)
 */
export const MiasmaDangerValue = {
  SAFE: 0,             // Safe walkable tile
  INCUBATING: 1,       // Spore incubation zone: toxic spores, non-lethal, slows non-dashing players
  GERMINATING: 1,      // Alias for incubating
  BURST: 2,            // Corrosive burst stage: instant minion dissolution & lethal damage
  FERTILE_SOIL: 3,     // Cleansed fertile ground: temporary safe footing created by bomb blast impact
  CLEANSING_FERTILE: 3,// Alias
  CLEANSED: 3,         // Alias
} as const;

export type MiasmaDangerValue =
  typeof MiasmaDangerValue[keyof typeof MiasmaDangerValue];

/**
 * Timing & Tuning Constants (ms)
 */
export const DURATION_POD_SWELLING_MS = 1000;
export const DURATION_SPORE_EXHALATION_MS = 600;
export const DURATION_BLOOM_IMMINENT_MS = 400;
export const DURATION_SPORE_INCUBATION_MS = 2000;
export const DURATION_CORROSIVE_BURST_MS = 350;

export const DEFAULT_MIASMA_COOLDOWN_MS = 5700;       // Standard recovery
export const CLIMAX_MIASMA_COOLDOWN_MS = 3700;        // Climax recovery
export const WHISPERS_MIASMA_COOLDOWN_MS = 9000;      // Whispers teaching recovery

export const MIASMA_RADIUS_TILES = 3;
export const MIASMA_MAX_RADIUS_PX = MIASMA_RADIUS_TILES * TILE_SIZE; // 120px
export const MIASMA_RADIUS_PX = MIASMA_MAX_RADIUS_PX;
export const MAX_MIASMA_TILES = 32;

export const MIN_MIASMA_SAFE_AREA_RATIO = 0.80;

/**
 * Player Combat Mastery Tuning Constants
 */
export const SPORE_SURGE_INVULN_MS = 1200;
export const SPORE_SURGE_SPEED_BURST_RATIO = 0.35;
export const SPORE_SURGE_COOLDOWN_MS = 1500;

export const NEUROTOXIN_DURATION_MS = 2000;
export const NEUROTOXIN_SLOW_RATIO = 0.25;
export const PLAYER_MIASMA_BURST_DAMAGE = 25;

/**
 * Tactical Bomb Constants
 */
export const MIASMA_SUPER_BOMB_TINT = 0x10b981;        // Emerald bio-glow
export const MIASMA_FUSE_ACCELERATION_MS = 1200;       // -1.2s fuse time
export const CATALYTIC_EXTRA_POWER = 2;                // +2 blast radius
export const CATALYTIC_BONUS_SCORE = 200;              // +200 tactical score
export const BOMB_KICK_MIASMA_SPEED = 450;             // 450 px/s slick bio-glide
export const FLORAL_CLEANSE_DURATION_MS = 4000;        // 4.0s safe fertile soil

/**
 * Environmental Minion & Boss Tuning Constants
 */
export const MIASMA_MINION_DAMAGE = 120;
export const ENEMY_MIASMA_SCORE = 120;
export const ENEMY_MIASMA_ULTIMATE_CHARGE = 6;
export const BOSS_MIASMA_DAMAGE_RATIO = 0.15;          // 15% Max HP flat damage
export const BOSS_SPORE_STASIS_STUN_MS = 1500;         // 1.5s stasis stun
export const BOSS_MIASMA_EXPLOIT_COOLDOWN_MS = 2500;   // Single hit guard per burst cycle

/**
 * Visual Floating Text Labels
 */
export const FLOATING_TEXT_SPORE_SURGE = '✦ SPORE SURGE!';
export const FLOATING_TEXT_NEUROTOXIN = '🧪 NEUROTOXIN (-25%)';
export const FLOATING_TEXT_BIO_FUSED = '🧪 BIO-FUSED (-1.2s)';
export const FLOATING_TEXT_BIO_SLICK_GLIDE = '🧪 BIO-SLICK GLIDE!';
export const FLOATING_TEXT_CATALYTIC_DETONATION = '🧪 CATALYTIC DETONATION (+200)';
export const FLOATING_TEXT_FLORAL_CLEANSED = '✦ SPORE CLEANSED!';
export const FLOATING_TEXT_DISSOLVED = '🧪 DISSOLVED!';
export const FLOATING_TEXT_SPORE_OVERGROWTH = '🧪 SPORE OVERGROWTH (1.5s)!';

export const ELEMENTAL_REACTION_CATALYTIC = 'CATALYTIC_COMBUSTION';

export interface MiasmaPlayerResult {
  hit: boolean;
  damage: number;
  isLethal: boolean;
  slowFactor: number;
  slowRatio: number;
  sporeSurgeGranted: boolean;
  invulnerabilityGrantedMs: number;
  speedBoostGranted: boolean;
  speedBoostRatio: number;
  neurotoxinInflicted: boolean;
  neurotoxinDurationMs: number;
  floatingText: string | null;
  isBurst: boolean;
  isSporeZone: boolean;
}

export interface MiasmaEnemyResult {
  hit: boolean;
  damage: number;
  isDissolved: boolean;
  isDecomposed: boolean;
  isStunned: boolean;
  isSporeStunned: boolean;
  stunDurationMs: number;
  scoreBonus: number;
  ultimateChargeBonus: number;
  floatingText: string;
}

export interface MiasmaBombPlacedResult {
  isBioFused: boolean;
  modifiedFuseMs: number;
  fuseDeltaMs: number;
  kickSpeedBonus: number;
  tint: number;
  floatingText: string | null;
}

export interface MiasmaBombKickedResult {
  isBioSlick: boolean;
  modifiedSpeed: number;
  speedDelta: number;
  tint?: number;
  floatingText: string | null;
}

export interface MiasmaBombSlideResult {
  isBioSlick: boolean;
  speed: number;
  isCleansed: boolean;
  floatingText: string | null;
}

export interface MiasmaBombDetonationResult {
  isCatalytic: boolean;
  elementalReaction: string;
  modifiedPower: number;
  piercing: boolean;
  bonusScore: number;
  floatingText: string | null;
}

export interface MiasmaCleanseResult {
  cleansed: boolean;
  durationMs: number;
  floatingText: string;
}

/**
 * Pure Simulation Engine for Toxic Miasma & Spore Bloom Dynamic Hazard
 */
export class MiasmaHazard {
  public state: MiasmaLifecycleState = MiasmaLifecycleState.DORMANT;
  public stateTimerMs: number = 0;
  public telegraphPhase: MiasmaTelegraphPhase = MiasmaTelegraphPhase.NONE;

  public centerRow: number = 6;
  public centerCol: number = 7;
  public radiusTiles: number = MIASMA_RADIUS_TILES;

  public cooldownDurationMs: number = DEFAULT_MIASMA_COOLDOWN_MS;

  // Zero-GC 1D TypedArray buffers (195 tiles for 13x15 arena)
  public dangerMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  public sporeGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public intensityGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public cleanseTimerGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public propagationBuffer: Float32Array = new Float32Array(TOTAL_TILES);

  // Active indices buffer (up to 32 tiles)
  public activeSporeIndices: Int16Array = new Int16Array(MAX_MIASMA_TILES);
  public activeSporeCount: number = 0;

  // Single-hit anti-exploit boss damage guard
  public hasDamagedBossInCurrentBurst: boolean = false;
  public lastBossHitTimestampMs: number = -99999;

  // Player combat mastery internal throttle
  public lastSporeSurgeGrantedMs: number = -99999;

  // Pre-allocated Zero-GC scratch result structures
  private scratchPlayerResult: MiasmaPlayerResult = {
    hit: false,
    damage: 0,
    isLethal: false,
    slowFactor: 1.0,
    slowRatio: 0,
    sporeSurgeGranted: false,
    invulnerabilityGrantedMs: 0,
    speedBoostGranted: false,
    speedBoostRatio: 0,
    neurotoxinInflicted: false,
    neurotoxinDurationMs: 0,
    floatingText: null,
    isBurst: false,
    isSporeZone: false,
  };

  private scratchEnemyResult: MiasmaEnemyResult = {
    hit: false,
    damage: 0,
    isDissolved: false,
    isDecomposed: false,
    isStunned: false,
    isSporeStunned: false,
    stunDurationMs: 0,
    scoreBonus: 0,
    ultimateChargeBonus: 0,
    floatingText: '',
  };

  private scratchBombPlacedResult: MiasmaBombPlacedResult = {
    isBioFused: false,
    modifiedFuseMs: 0,
    fuseDeltaMs: 0,
    kickSpeedBonus: 0,
    tint: MIASMA_SUPER_BOMB_TINT,
    floatingText: null,
  };

  private scratchBombKickedResult: MiasmaBombKickedResult = {
    isBioSlick: false,
    modifiedSpeed: 0,
    speedDelta: 0,
    tint: MIASMA_SUPER_BOMB_TINT,
    floatingText: null,
  };

  private scratchBombSlideResult: MiasmaBombSlideResult = {
    isBioSlick: false,
    speed: 0,
    isCleansed: false,
    floatingText: null,
  };

  private scratchBombDetonationResult: MiasmaBombDetonationResult = {
    isCatalytic: false,
    elementalReaction: '',
    modifiedPower: 0,
    piercing: false,
    bonusScore: 0,
    floatingText: null,
  };

  private scratchCleanseResult: MiasmaCleanseResult = {
    cleansed: false,
    durationMs: 0,
    floatingText: FLOATING_TEXT_FLORAL_CLEANSED,
  };

  constructor(centerRow: number = 6, centerCol: number = 7) {
    this.init(centerRow, centerCol);
  }

  public init(centerRow: number = 6, centerCol: number = 7): void {
    const safeR = (typeof centerRow === 'number' && Number.isFinite(centerRow)) ? Math.floor(centerRow) : 6;
    const safeC = (typeof centerCol === 'number' && Number.isFinite(centerCol)) ? Math.floor(centerCol) : 7;
    this.centerRow = Math.max(1, Math.min(ROWS - 2, safeR));
    this.centerCol = Math.max(1, Math.min(COLS - 2, safeC));
    this.recomputeLattice();
    this.state = MiasmaLifecycleState.DORMANT;
    this.stateTimerMs = 0;
    this.telegraphPhase = MiasmaTelegraphPhase.NONE;
    this.hasDamagedBossInCurrentBurst = false;
    this.dangerMask.fill(MiasmaDangerValue.SAFE);
    this.sporeGrid.fill(0);
    this.intensityGrid.fill(0);
    this.cleanseTimerGrid.fill(0);
    this.propagationBuffer.fill(0);
  }

  public setEpicenter(r: number, c: number): void {
    this.init(r, c);
  }

  public setCenter(r: number, c: number): void {
    this.init(r, c);
  }

  public get epicenterR(): number {
    return this.centerRow;
  }

  public get epicenterC(): number {
    return this.centerCol;
  }

  public getState(): MiasmaLifecycleState {
    return this.state;
  }

  public getLifecycleState(): MiasmaLifecycleState {
    return this.state;
  }

  public getTelegraphPhase(): MiasmaTelegraphPhase {
    return this.telegraphPhase;
  }

  public getStateElapsedMs(): number {
    return this.stateTimerMs;
  }

  public getDangerMask(): Uint8Array {
    return this.dangerMask;
  }

  public getSporeGrid(): Float32Array {
    return this.sporeGrid;
  }

  public getIntensityGrid(): Float32Array {
    return this.intensityGrid;
  }

  public getCleanseTimerGrid(): Float32Array {
    return this.cleanseTimerGrid;
  }

  public getPropagationBuffer(): Float32Array {
    return this.propagationBuffer;
  }

  public getActiveSporeIndices(): Int16Array {
    return this.activeSporeIndices;
  }

  public getActiveSporeCount(): number {
    return this.activeSporeCount;
  }

  public calculateSafeAreaRatio(): number {
    const safeTiles = TOTAL_TILES - this.activeSporeCount;
    return safeTiles / TOTAL_TILES;
  }

  public getSafeAreaRatio(): number {
    return this.calculateSafeAreaRatio();
  }

  public start(mode: 'NORMAL' | 'CLIMAX' | 'WHISPERS' = 'NORMAL'): void {
    this.setCooldownMode(mode);
    this.triggerCycle();
  }

  public trigger(mode: 'NORMAL' | 'CLIMAX' | 'WHISPERS' = 'NORMAL'): void {
    this.start(mode);
  }

  public setCooldownMode(mode: 'NORMAL' | 'CLIMAX' | 'WHISPERS'): void {
    switch (mode) {
      case 'CLIMAX':
        this.cooldownDurationMs = CLIMAX_MIASMA_COOLDOWN_MS;
        break;
      case 'WHISPERS':
        this.cooldownDurationMs = WHISPERS_MIASMA_COOLDOWN_MS;
        break;
      case 'NORMAL':
      default:
        this.cooldownDurationMs = DEFAULT_MIASMA_COOLDOWN_MS;
        break;
    }
  }

  public getCooldownDurationMs(): number {
    return this.cooldownDurationMs;
  }

  public reset(): void {
    this.state = MiasmaLifecycleState.DORMANT;
    this.stateTimerMs = 0;
    this.telegraphPhase = MiasmaTelegraphPhase.NONE;
    this.cooldownDurationMs = DEFAULT_MIASMA_COOLDOWN_MS;
    this.hasDamagedBossInCurrentBurst = false;
    this.lastBossHitTimestampMs = -99999;
    this.lastSporeSurgeGrantedMs = -99999;
    this.activeSporeCount = 0;

    this.dangerMask.fill(MiasmaDangerValue.SAFE);
    this.sporeGrid.fill(0);
    this.intensityGrid.fill(0);
    this.cleanseTimerGrid.fill(0);
    this.propagationBuffer.fill(0);
    this.recomputeLattice();
  }

  public stop(): void {
    this.reset();
  }

  public triggerCycle(centerRow?: number, centerCol?: number): void {
    if (centerRow !== undefined && centerCol !== undefined) {
      this.init(centerRow, centerCol);
    }
    this.state = MiasmaLifecycleState.SPORE_INCUBATION;
    this.stateTimerMs = 0;
    this.telegraphPhase = MiasmaTelegraphPhase.POD_SWELLING;
    this.hasDamagedBossInCurrentBurst = false;
    this.updateDangerMaskForState();
  }

  /**
   * Recomputes discrete Euclidean lattice disc (dr^2 + dc^2 <= R^2)
   */
  public recomputeLattice(): void {
    this.activeSporeCount = 0;
    const rSqMax = this.radiusTiles * this.radiusTiles;

    for (let dr = -this.radiusTiles; dr <= this.radiusTiles; dr++) {
      const r = this.centerRow + dr;
      if (r < 0 || r >= ROWS) continue;

      for (let dc = -this.radiusTiles; dc <= this.radiusTiles; dc++) {
        const c = this.centerCol + dc;
        if (c < 0 || c >= COLS) continue;

        if (dr * dr + dc * dc <= rSqMax) {
          const idx = r * COLS + c;
          if (this.activeSporeCount < MAX_MIASMA_TILES) {
            this.activeSporeIndices[this.activeSporeCount++] = idx;
          }
        }
      }
    }
  }

  /**
   * Discrete 2D Laplacian spore diffusion without heap allocation
   * Evaluates discrete diffusion over time step dtSec on discrete lattice:
   * dS/dt = D * Laplacian(S) - gamma * S
   * Uses double-buffered propagationBuffer for strict zero-GC execution.
   */
  public stepDiscreteDiffusion(
    dtSec: number = 0.016,
    diffusionRate: number = 0.25,
    decayGamma: number = 0.05
  ): void {
    const safeDt = (typeof dtSec === 'number' && Number.isFinite(dtSec))
      ? Math.max(0.001, Math.min(0.1, dtSec))
      : 0.016;
    const safeRate = (typeof diffusionRate === 'number' && Number.isFinite(diffusionRate))
      ? Math.max(0.01, Math.min(0.5, diffusionRate))
      : 0.25;
    const safeGamma = (typeof decayGamma === 'number' && Number.isFinite(decayGamma))
      ? Math.max(0.0, Math.min(0.2, decayGamma))
      : 0.05;

    // Double buffer copy without heap allocation
    this.propagationBuffer.set(this.sporeGrid);

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const idx = r * COLS + c;
        const up = (r - 1) * COLS + c;
        const down = (r + 1) * COLS + c;
        const left = r * COLS + (c - 1);
        const right = r * COLS + (c + 1);

        const current = this.propagationBuffer[idx];
        const laplacian =
          this.propagationBuffer[up] +
          this.propagationBuffer[down] +
          this.propagationBuffer[left] +
          this.propagationBuffer[right] -
          4.0 * current;

        const updated = current + (safeRate * laplacian - safeGamma * current) * safeDt;
        this.sporeGrid[idx] = Number.isFinite(updated) ? Math.max(0.0, Math.min(1.0, updated)) : 0.0;
        this.intensityGrid[idx] = this.sporeGrid[idx];
      }
    }
  }

  /**
   * Deterministic FSM Step
   */
  public update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;

    // Decay cleansed fertile soil timers
    for (let i = 0; i < this.activeSporeCount; i++) {
      const idx = this.activeSporeIndices[i];
      if (this.cleanseTimerGrid[idx] > 0) {
        this.cleanseTimerGrid[idx] -= deltaMs;
        if (this.cleanseTimerGrid[idx] <= 0) {
          this.cleanseTimerGrid[idx] = 0;
          if (this.state === MiasmaLifecycleState.CORROSIVE_BURST) {
            this.dangerMask[idx] = MiasmaDangerValue.BURST;
          } else if (this.state === MiasmaLifecycleState.SPORE_INCUBATION) {
            this.dangerMask[idx] = MiasmaDangerValue.INCUBATING;
          } else {
            this.dangerMask[idx] = MiasmaDangerValue.SAFE;
          }
        }
      }
    }

    if (this.state === MiasmaLifecycleState.DORMANT) {
      return;
    }

    this.stateTimerMs += deltaMs;

    let loopGuard = 0;
    while (loopGuard++ < 8) {
      if (this.state === MiasmaLifecycleState.SPORE_INCUBATION) {
        if (this.stateTimerMs < DURATION_POD_SWELLING_MS) {
          this.telegraphPhase = MiasmaTelegraphPhase.POD_SWELLING;
        } else if (this.stateTimerMs < DURATION_POD_SWELLING_MS + DURATION_SPORE_EXHALATION_MS) {
          this.telegraphPhase = MiasmaTelegraphPhase.SPORE_EXHALATION;
        } else if (this.stateTimerMs < DURATION_SPORE_INCUBATION_MS) {
          this.telegraphPhase = MiasmaTelegraphPhase.BLOOM_IMMINENT;
        } else {
          // Transition to CORROSIVE_BURST
          this.state = MiasmaLifecycleState.CORROSIVE_BURST;
          this.stateTimerMs -= DURATION_SPORE_INCUBATION_MS;
          this.telegraphPhase = MiasmaTelegraphPhase.NONE;
          this.hasDamagedBossInCurrentBurst = false;
          this.updateDangerMaskForState();
          continue;
        }
        this.updateDangerMaskForState();
        break;
      } else if (this.state === MiasmaLifecycleState.CORROSIVE_BURST) {
        if (this.stateTimerMs >= DURATION_CORROSIVE_BURST_MS) {
          // Transition to SPORE_DISSIPATION
          this.state = MiasmaLifecycleState.SPORE_DISSIPATION;
          this.stateTimerMs -= DURATION_CORROSIVE_BURST_MS;
          this.updateDangerMaskForState();
          continue;
        }
        break;
      } else if (this.state === MiasmaLifecycleState.SPORE_DISSIPATION) {
        if (this.stateTimerMs >= this.cooldownDurationMs) {
          this.state = MiasmaLifecycleState.SPORE_INCUBATION;
          this.stateTimerMs = 0;
          this.telegraphPhase = MiasmaTelegraphPhase.POD_SWELLING;
          this.hasDamagedBossInCurrentBurst = false;
          this.updateDangerMaskForState();
          break;
        }
        this.updateDangerMaskForState();
        break;
      } else {
        break;
      }
    }
  }

  private updateDangerMaskForState(): void {
    if (this.state === MiasmaLifecycleState.DORMANT) {
      for (let i = 0; i < this.activeSporeCount; i++) {
        const idx = this.activeSporeIndices[i];
        if (this.cleanseTimerGrid[idx] <= 0) {
          this.dangerMask[idx] = MiasmaDangerValue.SAFE;
          this.sporeGrid[idx] = 0;
          this.intensityGrid[idx] = 0;
        }
      }
      return;
    }

    if (this.state === MiasmaLifecycleState.SPORE_DISSIPATION) {
      const decay = Math.max(0, 1.0 - this.stateTimerMs / Math.min(1500, this.cooldownDurationMs));
      for (let i = 0; i < this.activeSporeCount; i++) {
        const idx = this.activeSporeIndices[i];
        if (this.cleanseTimerGrid[idx] <= 0) {
          this.dangerMask[idx] = decay > 0.05 ? MiasmaDangerValue.INCUBATING : MiasmaDangerValue.SAFE;
          this.sporeGrid[idx] = decay * 0.3;
          this.intensityGrid[idx] = decay * 0.3;
        }
      }
      return;
    }

    if (this.state === MiasmaLifecycleState.SPORE_INCUBATION) {
      const progress = Math.min(1.0, this.stateTimerMs / DURATION_SPORE_INCUBATION_MS);
      for (let i = 0; i < this.activeSporeCount; i++) {
        const idx = this.activeSporeIndices[i];
        if (this.cleanseTimerGrid[idx] <= 0) {
          const r = Math.floor(idx / COLS);
          const c = idx % COLS;
          const dr = r - this.centerRow;
          const dc = c - this.centerCol;
          const dist = Math.hypot(dr, dc);
          const falloff = Math.max(0.2, (this.radiusTiles - dist) / this.radiusTiles);

          this.dangerMask[idx] = MiasmaDangerValue.INCUBATING;
          this.sporeGrid[idx] = progress * falloff;
          this.intensityGrid[idx] = progress * falloff;
        }
      }
      return;
    }

    if (this.state === MiasmaLifecycleState.CORROSIVE_BURST) {
      for (let i = 0; i < this.activeSporeCount; i++) {
        const idx = this.activeSporeIndices[i];
        if (this.cleanseTimerGrid[idx] <= 0) {
          this.dangerMask[idx] = MiasmaDangerValue.BURST;
          this.sporeGrid[idx] = 1.0;
          this.intensityGrid[idx] = 1.0;
        }
      }
      return;
    }
  }

  public isTileSpore(row: number, col: number): boolean {
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return false;
    const r = row | 0;
    const c = col | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const idx = r * COLS + c;
    return this.dangerMask[idx] === MiasmaDangerValue.INCUBATING || this.dangerMask[idx] === MiasmaDangerValue.BURST;
  }

  public isTileMiasma(row: number, col: number): boolean {
    return this.isTileSpore(row, col);
  }

  public isTileInSporeZone(row: number, col: number): boolean {
    return this.isTileSpore(row, col);
  }

  public isPointSpore(worldX: number, worldY: number): boolean {
    if (typeof worldX !== 'number' || typeof worldY !== 'number' || !Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
    const c = Math.floor(worldX / TILE_SIZE);
    const r = Math.floor(worldY / TILE_SIZE);
    return this.isTileSpore(r, c);
  }

  public isPointInSporeZone(worldX: number, worldY: number): boolean {
    return this.isPointSpore(worldX, worldY);
  }

  public isPointMolten(worldX: number, worldY: number): boolean {
    return this.isPointSpore(worldX, worldY);
  }

  public getTileSpore(row: number, col: number): number {
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return 0;
    const r = row | 0;
    const c = col | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
    return this.sporeGrid[r * COLS + c];
  }

  public getTileSporeDensity(row: number, col: number): number {
    return this.getTileSpore(row, col);
  }

  public getTileIntensity(row: number, col: number): number {
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return 0;
    const r = row | 0;
    const c = col | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
    return this.intensityGrid[r * COLS + c];
  }

  public getTileDangerCode(row: number, col: number): number {
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return MiasmaDangerValue.SAFE;
    const r = row | 0;
    const c = col | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return MiasmaDangerValue.SAFE;
    return this.dangerMask[r * COLS + c];
  }

  public isTileLethal(row: number, col: number): boolean {
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return false;
    const r = row | 0;
    const c = col | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this.state === MiasmaLifecycleState.CORROSIVE_BURST && this.dangerMask[r * COLS + c] === MiasmaDangerValue.BURST;
  }

  public isPointLethal(worldX: number, worldY: number): boolean {
    if (typeof worldX !== 'number' || typeof worldY !== 'number' || !Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
    const c = (worldX / TILE_SIZE) | 0;
    const r = (worldY / TILE_SIZE) | 0;
    return this.isTileLethal(r, c);
  }

  /**
   * Player Combat Mastery: Evaluates player interactions in-place (Zero-GC)
   */
  public evaluatePlayer(
    px: number,
    py: number,
    isDashing: boolean = false,
    nowMs: number = Date.now(),
    _wantX?: number,
    _wantY?: number
  ): MiasmaPlayerResult {
    void _wantX;
    void _wantY;
    const res = this.scratchPlayerResult;
    res.hit = false;
    res.damage = 0;
    res.isLethal = false;
    res.slowFactor = 1.0;
    res.slowRatio = 0;
    res.sporeSurgeGranted = false;
    res.invulnerabilityGrantedMs = 0;
    res.speedBoostGranted = false;
    res.speedBoostRatio = 0;
    res.neurotoxinInflicted = false;
    res.neurotoxinDurationMs = 0;
    res.floatingText = null;
    res.isBurst = false;
    res.isSporeZone = false;

    if (this.state === MiasmaLifecycleState.DORMANT) return res;
    if (typeof px !== 'number' || typeof py !== 'number' || !Number.isFinite(px) || !Number.isFinite(py)) return res;

    const safeNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    const r = (py / TILE_SIZE) | 0;
    const c = (px / TILE_SIZE) | 0;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return res;

    const idx = r * COLS + c;
    if (idx < 0 || idx >= TOTAL_TILES) return res;
    const maskVal = this.dangerMask[idx];

    if (maskVal === MiasmaDangerValue.SAFE || maskVal === MiasmaDangerValue.FERTILE_SOIL) {
      return res;
    }

    res.isSporeZone = true;

    // Dashing grants Photosynthetic / Spore Surge
    if (isDashing) {
      if (safeNowMs - this.lastSporeSurgeGrantedMs >= SPORE_SURGE_COOLDOWN_MS) {
        this.lastSporeSurgeGrantedMs = safeNowMs;
        res.sporeSurgeGranted = true;
        res.invulnerabilityGrantedMs = SPORE_SURGE_INVULN_MS;
        res.speedBoostGranted = true;
        res.speedBoostRatio = SPORE_SURGE_SPEED_BURST_RATIO;
        res.slowFactor = 1.0 + SPORE_SURGE_SPEED_BURST_RATIO;
        res.floatingText = FLOATING_TEXT_SPORE_SURGE;
      }
      return res;
    }

    // Walking in active corrosive burst causes lethal burst damage
    if (maskVal === MiasmaDangerValue.BURST) {
      res.hit = true;
      res.damage = PLAYER_MIASMA_BURST_DAMAGE;
      res.isLethal = true;
      res.isBurst = true;
      res.floatingText = FLOATING_TEXT_DISSOLVED;
      return res;
    }

    // Walking in incubating spore cloud inflicts Neurotoxin slow
    if (maskVal === MiasmaDangerValue.INCUBATING) {
      res.slowRatio = NEUROTOXIN_SLOW_RATIO;
      res.slowFactor = 1.0 - NEUROTOXIN_SLOW_RATIO;
      res.neurotoxinInflicted = true;
      res.neurotoxinDurationMs = NEUROTOXIN_DURATION_MS;
      res.floatingText = FLOATING_TEXT_NEUROTOXIN;
      return res;
    }

    return res;
  }

  /**
   * Minion & Boss Environmental Combat
   */
  public checkEnemyCollision(
    r: number,
    c: number,
    isBoss: boolean,
    nowMs: number
  ): MiasmaEnemyResult {
    const res = this.scratchEnemyResult;
    res.hit = false;
    res.damage = 0;
    res.isDissolved = false;
    res.isStunned = false;
    res.stunDurationMs = 0;
    res.scoreBonus = 0;
    res.ultimateChargeBonus = 0;

    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return res;
    const idx = (r | 0) * COLS + (c | 0);

    // Only burst state deals lethal environmental damage
    if (this.dangerMask[idx] !== MiasmaDangerValue.BURST) {
      return res;
    }

    if (isBoss) {
      if (
        !this.hasDamagedBossInCurrentBurst &&
        nowMs - this.lastBossHitTimestampMs >= BOSS_MIASMA_EXPLOIT_COOLDOWN_MS
      ) {
        this.hasDamagedBossInCurrentBurst = true;
        this.lastBossHitTimestampMs = nowMs;
        res.hit = true;
        res.damage = 150; // Flat damage or 15% Max HP handled by caller
        res.isStunned = true;
        res.isSporeStunned = true;
        res.stunDurationMs = BOSS_SPORE_STASIS_STUN_MS;
        res.floatingText = FLOATING_TEXT_SPORE_OVERGROWTH;
      }
      return res;
    }

    // Minion Dissolution
    res.hit = true;
    res.damage = MIASMA_MINION_DAMAGE;
    res.isDissolved = true;
    res.isDecomposed = true;
    res.scoreBonus = ENEMY_MIASMA_SCORE;
    res.ultimateChargeBonus = ENEMY_MIASMA_ULTIMATE_CHARGE;
    res.floatingText = FLOATING_TEXT_DISSOLVED;
    return res;
  }

  /**
   * Tactical Bomb: Placement on spore tiles accelerates fuse
   */
  public onBombPlaced(
    _bombId: string | number,
    r: number,
    c: number,
    _power?: number,
    originalFuseMs: number = 2500
  ): MiasmaBombPlacedResult {
    const res = this.scratchBombPlacedResult;
    res.isBioFused = false;
    res.modifiedFuseMs = originalFuseMs;
    res.fuseDeltaMs = 0;
    res.kickSpeedBonus = 0;
    res.tint = MIASMA_SUPER_BOMB_TINT;
    res.floatingText = null;

    if (this.state === MiasmaLifecycleState.DORMANT) return res;
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return res;

    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;
    const idx = ir * COLS + ic;

    if (this.dangerMask[idx] === MiasmaDangerValue.INCUBATING || this.dangerMask[idx] === MiasmaDangerValue.BURST) {
      res.isBioFused = true;
      res.modifiedFuseMs = Math.max(800, originalFuseMs - MIASMA_FUSE_ACCELERATION_MS);
      res.fuseDeltaMs = -MIASMA_FUSE_ACCELERATION_MS;
      res.kickSpeedBonus = BOMB_KICK_MIASMA_SPEED;
      res.floatingText = FLOATING_TEXT_BIO_FUSED;
    }

    return res;
  }

  /**
   * Tactical Bomb: Kicking bombs across hazard tiles alters velocity (Bio-Slick Kick)
   */
  public onBombKicked(
    _bombId: string | number,
    r: number,
    c: number,
    baseSpeed: number = 300
  ): MiasmaBombKickedResult {
    const res = this.scratchBombKickedResult;
    res.isBioSlick = false;
    res.modifiedSpeed = baseSpeed;
    res.speedDelta = 0;
    res.tint = MIASMA_SUPER_BOMB_TINT;
    res.floatingText = null;

    if (this.state === MiasmaLifecycleState.DORMANT) return res;
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return res;

    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;
    const idx = ir * COLS + ic;

    if (this.dangerMask[idx] === MiasmaDangerValue.INCUBATING || this.dangerMask[idx] === MiasmaDangerValue.BURST) {
      res.isBioSlick = true;
      res.modifiedSpeed = BOMB_KICK_MIASMA_SPEED;
      res.speedDelta = BOMB_KICK_MIASMA_SPEED - baseSpeed;
      res.floatingText = FLOATING_TEXT_BIO_SLICK_GLIDE;
    }

    return res;
  }

  /**
   * Tactical Bomb: Evaluates sliding bomb speed as it crosses hazard tiles
   */
  public evaluateBombSlide(
    r: number,
    c: number,
    currentSpeed: number = 300
  ): MiasmaBombSlideResult {
    const res = this.scratchBombSlideResult;
    res.isBioSlick = false;
    res.speed = currentSpeed;
    res.isCleansed = false;
    res.floatingText = null;

    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return res;

    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;
    const idx = ir * COLS + ic;

    const mask = this.dangerMask[idx];
    if (mask === MiasmaDangerValue.FERTILE_SOIL) {
      res.isCleansed = true;
      res.speed = 300; // Normal controlled traction on cleansed fertile soil
      return res;
    }

    if (mask === MiasmaDangerValue.INCUBATING || mask === MiasmaDangerValue.BURST) {
      res.isBioSlick = true;
      res.speed = BOMB_KICK_MIASMA_SPEED;
      res.floatingText = FLOATING_TEXT_BIO_SLICK_GLIDE;
      return res;
    }

    return res;
  }

  public isTileBioSlick(r: number, c: number): boolean {
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return false;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const idx = ir * COLS + ic;
    return this.dangerMask[idx] === MiasmaDangerValue.INCUBATING || this.dangerMask[idx] === MiasmaDangerValue.BURST;
  }

  public getTileKickSpeed(r: number, c: number, defaultSpeed: number = 300): number {
    return this.isTileBioSlick(r, c) ? BOMB_KICK_MIASMA_SPEED : defaultSpeed;
  }

  /**
   * Tactical Bomb: Detonation in spore zone causes Catalytic Detonation (elemental reaction)
   */
  public onBombDetonated(
    _bombId: string | number,
    r: number,
    c: number,
    effectivePower: number
  ): MiasmaBombDetonationResult {
    const res = this.scratchBombDetonationResult;
    res.isCatalytic = false;
    res.elementalReaction = '';
    res.modifiedPower = effectivePower;
    res.piercing = false;
    res.bonusScore = 0;
    res.floatingText = null;

    if (this.state === MiasmaLifecycleState.DORMANT) return res;
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return res;

    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;
    const idx = ir * COLS + ic;

    if (this.dangerMask[idx] === MiasmaDangerValue.INCUBATING || this.dangerMask[idx] === MiasmaDangerValue.BURST) {
      res.isCatalytic = true;
      res.elementalReaction = ELEMENTAL_REACTION_CATALYTIC;
      res.modifiedPower = effectivePower + CATALYTIC_EXTRA_POWER;
      res.piercing = true;
      res.bonusScore = CATALYTIC_BONUS_SCORE;
      res.floatingText = FLOATING_TEXT_CATALYTIC_DETONATION;
    }

    return res;
  }

  /**
   * Tactical Bomb: Bomb blast impact incinerates spores and cleanses fertile soil
   */
  public onBombBlastImpact(r: number, c: number): MiasmaCleanseResult {
    const res = this.scratchCleanseResult;
    res.cleansed = false;
    res.durationMs = 0;
    res.floatingText = FLOATING_TEXT_FLORAL_CLEANSED;

    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return res;

    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;
    const idx = ir * COLS + ic;

    if (this.dangerMask[idx] === MiasmaDangerValue.INCUBATING || this.dangerMask[idx] === MiasmaDangerValue.BURST) {
      this.cleanseTimerGrid[idx] = FLORAL_CLEANSE_DURATION_MS;
      this.dangerMask[idx] = MiasmaDangerValue.FERTILE_SOIL;
      res.cleansed = true;
      res.durationMs = FLORAL_CLEANSE_DURATION_MS;
    }

    return res;
  }

  public isTileCleansed(r: number, c: number): boolean {
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return false;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const idx = ir * COLS + ic;
    return this.dangerMask[idx] === MiasmaDangerValue.FERTILE_SOIL;
  }

  public isTileWalkable(r: number, c: number): boolean {
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return true;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return true;
    const idx = ir * COLS + ic;
    return this.dangerMask[idx] === MiasmaDangerValue.SAFE || this.dangerMask[idx] === MiasmaDangerValue.FERTILE_SOIL;
  }
}
