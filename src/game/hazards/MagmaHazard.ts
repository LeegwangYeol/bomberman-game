/**
 * MagmaHazard.ts — Magma Caldera & Pyroclastic Surge Dynamic Hazard & Tactical Bomb Interaction Engine
 *
 * Implements the Magma Caldera & Pyroclastic Surge Dynamic Hazard Subsystem:
 * - Completes the 5-Element Pantheon:
 *     1. Aether: Quantum Spire (DynamicHazard)
 *     2. Void: Gravitational Singularity (GravityHazard)
 *     3. Water/Ice: Cryo Glaciation (FrostHazard)
 *     4. Air/Lightning: Tesla Storm (VoltHazard)
 *     5. Earth/Fire: Magma Caldera & Pyroclastic Surge (MagmaHazard)
 *
 * Architecture & Features:
 * - 4-Stage Lifecycle FSM: DORMANT -> MAGMA_TELEGRAPH (2000ms) -> PYROCLASTIC_BURST (350ms) -> OBSIDIAN_COOLDOWN (5700ms)
 * - 3-Tier Telegraph Sub-Phases: CRUST_HEATING (1000ms) -> MAGMA_UPWELLING (600ms) -> ERUPTION_IMMINENT (400ms)
 * - Zero-GC 1D TypedArray Memory Layout (Uint8Array dangerMask, Float32Array heatGrid, Float32Array obsidianTimerGrid, Int16Array activeMagmaIndices)
 * - Mathematical Safe Area Guarantees: Safe Area >= 80% (Guaranteed >= 85.128% on standard 13x15 arenas, exactly 29 lattice tiles in radius 3)
 * - Tactical Bomb Interactions:
 *     1. Pyro-Fused Bomb: Fuse accelerated by -1.2s on active magma tiles, volcanic orange pulsing tint (0xf97316)
 *     2. Magma Surf Kick: Sliding on magma tiles accelerates to 450 px/s
 *     3. Pyroclastic Detonation: Detonating in molten zone grants +2 piercing power and +200 bonus score
 *     4. Obsidian Shell Quenching: Bomb blast impacts solidify molten lava into temporary obsidian crust (4.0s safe footing)
 * - Environmental Entity Interactions:
 *     1. Minion Incineration: 120 environmental damage, +120 score bonus, +6 ult charge, '🔥 INCINERATED!'
 *     2. Boss Magma Meltdown: 15% Max HP damage, 1.5s stun, with Anti-Exploit Guard (single hit per burst)
 *     3. Player Combat Mastery: Magma Surf / Obsidian Dash (I-Frames 1200ms, +35% speed burst) vs Thermal Singe (-25% speed debuff for 2000ms)
 */

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
} from '../pathfinding.ts';

export { ROWS, COLS, TOTAL_TILES, TILE_SIZE };

/**
 * Universal Lifecycle States for Magma Hazard FSM
 */
export const MagmaLifecycleState = {
  DORMANT: 'DORMANT',
  MAGMA_TELEGRAPH: 'MAGMA_TELEGRAPH',
  PYROCLASTIC_BURST: 'PYROCLASTIC_BURST',
  OBSIDIAN_COOLDOWN: 'OBSIDIAN_COOLDOWN',
  // Harmonization aliases
  THERMAL_SURGE: 'MAGMA_TELEGRAPH',
  CALDERA_SURGE: 'MAGMA_TELEGRAPH',
  MAGMA_BURST: 'PYROCLASTIC_BURST',
  ERUPTION_BURST: 'PYROCLASTIC_BURST',
  COOLDOWN: 'OBSIDIAN_COOLDOWN',
} as const;

export type MagmaLifecycleState =
  typeof MagmaLifecycleState[keyof typeof MagmaLifecycleState];

/**
 * 3-Tier Sub-Phases during MAGMA_TELEGRAPH Lifecycle State
 */
export const MagmaTelegraphPhase = {
  NONE: 'NONE',
  CRUST_HEATING: 'CRUST_HEATING',         // 0ms - 1000ms: Earth fissures crack, glowing amber embers
  MAGMA_UPWELLING: 'MAGMA_UPWELLING',     // 1000ms - 1600ms: Molten lava bubbles through ground fissures
  ERUPTION_IMMINENT: 'ERUPTION_IMMINENT', // 1600ms - 2000ms: Pyroclastic gas vents, ground shudders violently
  // Aliases
  FISSURE_FORMING: 'CRUST_HEATING',
  LAVA_SURGE: 'MAGMA_UPWELLING',
  CRITICAL_VENT: 'ERUPTION_IMMINENT',
} as const;

export type MagmaTelegraphPhase =
  typeof MagmaTelegraphPhase[keyof typeof MagmaTelegraphPhase];

/**
 * Danger Mask Discrete Bit Values (Uint8Array)
 */
export const MagmaDangerValue = {
  SAFE: 0,              // Safe walkable tile
  HEATING: 1,           // Telegraph heating zone: thermal fissures, non-lethal, slows non-dashing players
  BURST: 2,             // Lethal eruption stage: instant minion incineration & lethal damage
  OBSIDIAN_CRUST: 3,    // Solidified obsidian crust: temporary safe footing formed by bomb quench
} as const;

export type MagmaDangerValue =
  typeof MagmaDangerValue[keyof typeof MagmaDangerValue];

/**
 * Timing & Tuning Constants (ms)
 */
export const DURATION_CRUST_HEATING_MS = 1000;
export const DURATION_MAGMA_UPWELLING_MS = 600;
export const DURATION_ERUPTION_IMMINENT_MS = 400;
export const DURATION_MAGMA_TELEGRAPH_MS = 2000;
export const DURATION_PYROCLASTIC_BURST_MS = 350;

export const DEFAULT_MAGMA_COOLDOWN_MS = 5700;       // Standard recovery
export const CLIMAX_MAGMA_COOLDOWN_MS = 3700;        // Climax recovery
export const WHISPERS_MAGMA_COOLDOWN_MS = 9000;      // Whispers teaching recovery

export const MAGMA_RADIUS_TILES = 3;
export const MAX_RADIUS_PX = MAGMA_RADIUS_TILES * TILE_SIZE; // 120px
export const MAGMA_RADIUS_PX = MAX_RADIUS_PX;
export const MAX_MAGMA_TILES = 32;

export const MIN_MAGMA_SAFE_AREA_RATIO = 0.80;

/**
 * Player Combat Mastery Tuning Constants
 */
export const MAGMA_SURF_INVULN_MS = 1200;
export const MAGMA_SURF_SPEED_BURST_RATIO = 0.35;
export const MAGMA_SURF_COOLDOWN_MS = 1500;

export const THERMAL_SINGE_DURATION_MS = 2000;
export const THERMAL_SINGE_SLOW_RATIO = 0.25;
export const PLAYER_MAGMA_BURST_DAMAGE = 25;

/**
 * Tactical Bomb Constants
 */
export const MAGMA_SUPER_BOMB_TINT = 0xf97316;        // Volcanic orange
export const MAGMA_SUPER_BOMB_TINT_RED = 0xef4444;    // Molten red
export const MAGMA_FUSE_ACCELERATION_MS = 1200;
export const PYROCLASTIC_EXTRA_POWER = 2;
export const PYROCLASTIC_BONUS_SCORE = 200;
export const OBSIDIAN_QUENCH_DURATION_MS = 4000;      // 4.0s safe obsidian crust
export const BOMB_KICK_MAGMA_SPEED = 450;

/**
 * Entity Damage & Combat Scoring Constants
 */
export const ENEMY_MAGMA_BURST_DAMAGE = 120;
export const MAGMA_MINION_DAMAGE = 120;
export const ENEMY_MAGMA_SCORE = 120;
export const ENEMY_MAGMA_ULTIMATE_CHARGE = 6;

export const BOSS_MAGMA_DAMAGE_RATIO = 0.15;
export const BOSS_MELTDOWN_STUN_MS = 1500;
export const BOSS_MAGMA_EXPLOIT_COOLDOWN_MS = 2000;

/**
 * Floating Combat Text Constants
 */
export const FLOATING_TEXT_MAGMA_SURF = '✦ MAGMA SURF!';
export const FLOATING_TEXT_THERMAL_SINGE = '🔥 THERMAL SINGE (-25%)';
export const FLOATING_TEXT_PYRO_FUSED = '🔥 PYRO-FUSED (-1.2s)';
export const FLOATING_TEXT_PYROCLASTIC_DETONATION = '🔥 PYROCLASTIC DETONATION (+200)';
export const FLOATING_TEXT_OBSIDIAN_QUENCHED = '✦ OBSIDIAN QUENCHED!';
export const FLOATING_TEXT_INCINERATED = '🔥 INCINERATED!';
export const FLOATING_TEXT_MAGMA_MELTDOWN = '🔥 MAGMA MELTDOWN (1.5s)!';
export const FLOATING_TEXT_PYROCLASTIC_BURST = '🔥 PYROCLASTIC BURST!';

/**
 * Scratch Result Interfaces for Strict Zero-GC Execution
 */
export interface MagmaPlayerResult {
  hit: boolean;
  damage: number;
  isLethal: boolean;
  magmaSurfGranted: boolean;
  invulnerabilityGrantedMs: number;
  speedBoostGranted: boolean;
  speedBoostRatio: number;
  thermalSingeInflicted: boolean;
  thermalSingeDurationMs: number;
  slowRatio: number;
  slowFactor: number;
  floatingText: string;
}

export interface MagmaEnemyResult {
  hit: boolean;
  damage: number;
  isIncinerated: boolean;
  isMeltdownStunned: boolean;
  stunDurationMs: number;
  scoreBonus: number;
  ultimateChargeBonus: number;
  floatingText: string;
}

export interface MagmaBombPlacedResult {
  isPyroFused: boolean;
  modifiedFuseMs: number;
  fuseDeltaMs: number;
  kickSpeedBonus: number;
  tint?: number;
  floatingText?: string;
}

export interface MagmaBombDetonationResult {
  isPyroclastic: boolean;
  modifiedPower: number;
  piercing: boolean;
  bonusScore: number;
  floatingText: string;
}

export interface MagmaThermalResult {
  heat: number;
  isMolten: boolean;
  isObsidianCrust: boolean;
}

export interface MagmaBlastImpactResult {
  quenched: boolean;
  obsidianDurationMs: number;
  floatingText: string;
}

/**
 * MagmaHazard Main Engine Class
 */
export class MagmaHazard {
  public state: MagmaLifecycleState = MagmaLifecycleState.DORMANT;
  public telegraphPhase: MagmaTelegraphPhase = MagmaTelegraphPhase.NONE;

  public epicenterR: number = 6;
  public epicenterC: number = 7;
  public radiusTiles: number = MAGMA_RADIUS_TILES;
  public radiusPx: number = MAGMA_RADIUS_PX;

  // Timers and State Tracking
  public stateElapsedMs: number = 0;
  public telegraphDurationMs: number = DURATION_MAGMA_TELEGRAPH_MS;
  public burstDurationMs: number = DURATION_PYROCLASTIC_BURST_MS;
  public cooldownDurationMs: number = DEFAULT_MAGMA_COOLDOWN_MS;

  // Zero-GC 1D TypedArray Buffers
  public readonly dangerMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  public readonly heatGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public readonly intensityGrid: Float32Array = this.heatGrid; // Shared alias
  public readonly obsidianTimerGrid: Float32Array = new Float32Array(TOTAL_TILES);
  public readonly propagationBuffer: Float32Array = new Float32Array(TOTAL_TILES);
  public readonly activeMagmaIndices: Int16Array = new Int16Array(MAX_MAGMA_TILES);
  public activeMagmaCount: number = 0;

  // Single-Hit Anti-Exploit Guard
  private lastBossHitTimestampMs: number = -Infinity;
  private lastMagmaSurfTimestampMs: number = -Infinity;

  // Reusable Scratch Containers
  private readonly scratchPlayerResult: MagmaPlayerResult = {
    hit: false,
    damage: 0,
    isLethal: false,
    magmaSurfGranted: false,
    invulnerabilityGrantedMs: 0,
    speedBoostGranted: false,
    speedBoostRatio: 0,
    thermalSingeInflicted: false,
    thermalSingeDurationMs: 0,
    slowRatio: 0,
    slowFactor: 1.0,
    floatingText: '',
  };

  private readonly scratchEnemyResult: MagmaEnemyResult = {
    hit: false,
    damage: 0,
    isIncinerated: false,
    isMeltdownStunned: false,
    stunDurationMs: 0,
    scoreBonus: 0,
    ultimateChargeBonus: 0,
    floatingText: '',
  };

  private readonly scratchBombPlacedResult: MagmaBombPlacedResult = {
    isPyroFused: false,
    modifiedFuseMs: 3000,
    fuseDeltaMs: 0,
    kickSpeedBonus: 0,
    tint: undefined,
    floatingText: undefined,
  };

  private readonly scratchBombDetonationResult: MagmaBombDetonationResult = {
    isPyroclastic: false,
    modifiedPower: 1,
    piercing: false,
    bonusScore: 0,
    floatingText: '',
  };

  private readonly scratchThermalResult: MagmaThermalResult = {
    heat: 0,
    isMolten: false,
    isObsidianCrust: false,
  };

  private readonly scratchBlastImpactResult: MagmaBlastImpactResult = {
    quenched: false,
    obsidianDurationMs: 0,
    floatingText: '',
  };

  constructor(r: number = 6, c: number = 7) {
    this.setEpicenter(r, c);
  }

  /**
   * Initializes or re-anchors the MagmaHazard epicenter with interior clamping
   */
  public init(r: number = 6, c: number = 7): void {
    this.setEpicenter(r, c);
    this.stop();
  }

  /**
   * Clamps epicenter within interior playable bounds
   */
  public setEpicenter(r: number, c: number): void {
    const minR = 1;
    const maxR = ROWS - 2;
    const minC = 1;
    const maxC = COLS - 2;

    this.epicenterR = Math.max(minR, Math.min(maxR, Math.round(Number.isFinite(r) ? r : 6)));
    this.epicenterC = Math.max(minC, Math.min(maxC, Math.round(Number.isFinite(c) ? c : 7)));
    this.dangerMask.fill(0);
    this.heatGrid.fill(0);
    this.obsidianTimerGrid.fill(0);
    this.precomputeActiveMagmaIndices();
  }

  public setCenter(r: number, c: number): void {
    this.setEpicenter(r, c);
  }

  public getEpicenterRow(): number {
    return this.epicenterR;
  }

  public getEpicenterCol(): number {
    return this.epicenterC;
  }

  /**
   * Precomputes discrete Euclidean ball tiles (R <= 3, dx^2 + dy^2 <= 9)
   */
  public precomputeActiveMagmaIndices(): void {
    let count = 0;
    const r0 = this.epicenterR;
    const c0 = this.epicenterC;
    const rSqMax = this.radiusTiles * this.radiusTiles;

    for (let dr = -this.radiusTiles; dr <= this.radiusTiles; dr++) {
      const nr = r0 + dr;
      if (nr < 0 || nr >= ROWS) continue;

      for (let dc = -this.radiusTiles; dc <= this.radiusTiles; dc++) {
        const nc = c0 + dc;
        if (nc < 0 || nc >= COLS) continue;

        const distSq = dr * dr + dc * dc;
        if (distSq <= rSqMax) {
          if (count < MAX_MAGMA_TILES) {
            this.activeMagmaIndices[count++] = nr * COLS + nc;
          }
        }
      }
    }

    this.activeMagmaCount = count;
  }

  /**
   * Safe area invariant calculation: Ratio of tiles unaffected by magma
   */
  public getSafeAreaRatio(): number {
    return (TOTAL_TILES - this.activeMagmaCount) / TOTAL_TILES;
  }

  /**
   * Triggers the Magma Hazard lifecycle cycle
   */
  public trigger(mode: 'NORMAL' | 'CLIMAX' | 'WHISPERS' = 'NORMAL'): void {
    if (mode === 'CLIMAX') {
      this.cooldownDurationMs = CLIMAX_MAGMA_COOLDOWN_MS;
    } else if (mode === 'WHISPERS') {
      this.cooldownDurationMs = WHISPERS_MAGMA_COOLDOWN_MS;
    } else {
      this.cooldownDurationMs = DEFAULT_MAGMA_COOLDOWN_MS;
    }

    this.state = MagmaLifecycleState.MAGMA_TELEGRAPH;
    this.telegraphPhase = MagmaTelegraphPhase.CRUST_HEATING;
    this.stateElapsedMs = 0;
    this.updateGridsForPhase();
  }

  public start(mode: 'NORMAL' | 'CLIMAX' | 'WHISPERS' = 'NORMAL'): void {
    this.trigger(mode);
  }

  public stop(): void {
    this.state = MagmaLifecycleState.DORMANT;
    this.telegraphPhase = MagmaTelegraphPhase.NONE;
    this.stateElapsedMs = 0;
    this.dangerMask.fill(MagmaDangerValue.SAFE);
    this.heatGrid.fill(0);
    this.obsidianTimerGrid.fill(0);
  }

  public reset(): void {
    this.stop();
  }

  /**
   * Discrete time-step update
   */
  public update(deltaMs: number): void {
    if (this.state === MagmaLifecycleState.DORMANT) return;
    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs <= 0) return;

    this.stateElapsedMs += deltaMs;

    // Update any active obsidian quenched crust timers
    for (let i = 0; i < this.activeMagmaCount; i++) {
      const idx = this.activeMagmaIndices[i];
      if (this.obsidianTimerGrid[idx] > 0) {
        this.obsidianTimerGrid[idx] = Math.max(0, this.obsidianTimerGrid[idx] - deltaMs);
        if (this.obsidianTimerGrid[idx] === 0 && this.dangerMask[idx] === MagmaDangerValue.OBSIDIAN_CRUST) {
          // Obsidian crust breaks back to current ambient hazard state
          this.dangerMask[idx] =
            this.state === MagmaLifecycleState.PYROCLASTIC_BURST
              ? MagmaDangerValue.BURST
              : this.state === MagmaLifecycleState.MAGMA_TELEGRAPH
                ? MagmaDangerValue.HEATING
                : MagmaDangerValue.SAFE;
        }
      }
    }

    switch (this.state) {
      case MagmaLifecycleState.MAGMA_TELEGRAPH: {
        if (this.stateElapsedMs < DURATION_CRUST_HEATING_MS) {
          this.telegraphPhase = MagmaTelegraphPhase.CRUST_HEATING;
        } else if (this.stateElapsedMs < DURATION_CRUST_HEATING_MS + DURATION_MAGMA_UPWELLING_MS) {
          this.telegraphPhase = MagmaTelegraphPhase.MAGMA_UPWELLING;
        } else if (this.stateElapsedMs < this.telegraphDurationMs) {
          this.telegraphPhase = MagmaTelegraphPhase.ERUPTION_IMMINENT;
        } else {
          // Transition to lethal pyroclastic burst
          this.state = MagmaLifecycleState.PYROCLASTIC_BURST;
          this.telegraphPhase = MagmaTelegraphPhase.NONE;
          this.stateElapsedMs = 0;
        }
        this.updateGridsForPhase();
        break;
      }

      case MagmaLifecycleState.PYROCLASTIC_BURST: {
        if (this.stateElapsedMs >= this.burstDurationMs) {
          // Transition to cooldown
          this.state = MagmaLifecycleState.OBSIDIAN_COOLDOWN;
          this.stateElapsedMs = 0;
        }
        this.updateGridsForPhase();
        break;
      }

      case MagmaLifecycleState.OBSIDIAN_COOLDOWN: {
        if (this.stateElapsedMs >= this.cooldownDurationMs) {
          this.trigger();
        } else {
          this.updateGridsForPhase();
        }
        break;
      }
    }
  }

  /**
   * Updates dangerMask and heatGrid in-place
   */
  private updateGridsForPhase(): void {
    const count = this.activeMagmaCount;
    const r0 = this.epicenterR;
    const c0 = this.epicenterC;

    if (this.state === MagmaLifecycleState.MAGMA_TELEGRAPH) {
      const progress = Math.min(1.0, this.stateElapsedMs / this.telegraphDurationMs);

      for (let i = 0; i < count; i++) {
        const idx = this.activeMagmaIndices[i];
        if (this.obsidianTimerGrid[idx] > 0) continue; // Respect solidified obsidian crust

        const r = Math.floor(idx / COLS);
        const c = idx % COLS;
        const dist = Math.sqrt((r - r0) * (r - r0) + (c - c0) * (c - c0));
        const falloff = Math.max(0.2, 1.0 - dist / (this.radiusTiles + 0.5));

        this.dangerMask[idx] = MagmaDangerValue.HEATING;
        this.heatGrid[idx] = progress * falloff;
      }
    } else if (this.state === MagmaLifecycleState.PYROCLASTIC_BURST) {
      for (let i = 0; i < count; i++) {
        const idx = this.activeMagmaIndices[i];
        if (this.obsidianTimerGrid[idx] > 0) continue; // Obsidian shields from lethal burst

        this.dangerMask[idx] = MagmaDangerValue.BURST;
        this.heatGrid[idx] = 1.0;
      }
    } else if (this.state === MagmaLifecycleState.OBSIDIAN_COOLDOWN) {
      const decay = Math.max(0, 1.0 - this.stateElapsedMs / Math.min(1500, this.cooldownDurationMs));
      for (let i = 0; i < count; i++) {
        const idx = this.activeMagmaIndices[i];
        if (this.obsidianTimerGrid[idx] > 0) continue;

        this.dangerMask[idx] = decay > 0.05 ? MagmaDangerValue.HEATING : MagmaDangerValue.SAFE;
        this.heatGrid[idx] = decay * 0.3;
      }
    }
  }

  /**
   * In-place discrete Laplacian heat diffusion for thermal modeling
   */
  public stepDiscreteDiffusion(dt: number = 0.016, diffusionRate: number = 0.15): void {
    const safeDt = (typeof dt === 'number' && Number.isFinite(dt)) ? Math.max(0.001, Math.min(0.1, dt)) : 0.016;
    const safeRate = (typeof diffusionRate === 'number' && Number.isFinite(diffusionRate)) ? Math.max(0.01, Math.min(0.25, diffusionRate)) : 0.15;
    this.propagationBuffer.set(this.heatGrid);

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const idx = r * COLS + c;
        const up = (r - 1) * COLS + c;
        const down = (r + 1) * COLS + c;
        const left = r * COLS + (c - 1);
        const right = r * COLS + (c + 1);

        const laplacian =
          this.propagationBuffer[up] +
          this.propagationBuffer[down] +
          this.propagationBuffer[left] +
          this.propagationBuffer[right] -
          4.0 * this.propagationBuffer[idx];

        const raw = this.propagationBuffer[idx] + laplacian * safeRate * safeDt;
        this.heatGrid[idx] = Number.isFinite(raw) ? Math.max(0.0, Math.min(1.0, raw)) : 0.0;
      }
    }
  }

  /**
   * Checks if an arena coordinate (px, py) is within active magma influence
   */
  public isPointMolten(x: number, y: number): boolean {
    if (this.state === MagmaLifecycleState.DORMANT) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;

    const idx = r * COLS + c;
    return this.dangerMask[idx] === MagmaDangerValue.HEATING || this.dangerMask[idx] === MagmaDangerValue.BURST;
  }

  /**
   * Checks if a grid tile is active magma
   */
  public isTileMolten(r: number, c: number): boolean {
    if (this.state === MagmaLifecycleState.DORMANT) return false;
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return false;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const idx = ir * COLS + ic;
    return this.dangerMask[idx] === MagmaDangerValue.HEATING || this.dangerMask[idx] === MagmaDangerValue.BURST;
  }

  public isTileLethal(r: number, c: number): boolean {
    if (this.state !== MagmaLifecycleState.PYROCLASTIC_BURST) return false;
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return false;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const idx = ir * COLS + ic;
    return this.dangerMask[idx] === MagmaDangerValue.BURST;
  }

  /**
   * Evaluates Player interaction: Magma Surf (dashing) vs Thermal Singe (walking) vs Lethal Eruption
   */
  public evaluatePlayer(
    px: number,
    py: number,
    isDashing: boolean = false,
    nowMs: number = Date.now(),
    _wantX?: number,
    _wantY?: number
  ): MagmaPlayerResult {
    void _wantX;
    void _wantY;
    const res = this.scratchPlayerResult;
    res.hit = false;
    res.damage = 0;
    res.isLethal = false;
    res.magmaSurfGranted = false;
    res.invulnerabilityGrantedMs = 0;
    res.speedBoostGranted = false;
    res.speedBoostRatio = 0;
    res.thermalSingeInflicted = false;
    res.thermalSingeDurationMs = 0;
    res.slowRatio = 0;
    res.slowFactor = 1.0;
    res.floatingText = '';

    if (this.state === MagmaLifecycleState.DORMANT) return res;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return res;

    const safeNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    const c = Math.floor(px / TILE_SIZE);
    const r = Math.floor(py / TILE_SIZE);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return res;

    const idx = r * COLS + c;
    const danger = this.dangerMask[idx];
    if (danger === MagmaDangerValue.SAFE || danger === MagmaDangerValue.OBSIDIAN_CRUST) {
      return res;
    }

    // Player Mastery Branch 1: Dashing triggers Magma Surf
    if (isDashing) {
      if (safeNowMs - this.lastMagmaSurfTimestampMs >= MAGMA_SURF_COOLDOWN_MS) {
        this.lastMagmaSurfTimestampMs = safeNowMs;
        res.magmaSurfGranted = true;
        res.invulnerabilityGrantedMs = MAGMA_SURF_INVULN_MS;
        res.speedBoostGranted = true;
        res.speedBoostRatio = MAGMA_SURF_SPEED_BURST_RATIO;
        res.slowFactor = 1.0 + MAGMA_SURF_SPEED_BURST_RATIO; // 1.35x
        res.floatingText = FLOATING_TEXT_MAGMA_SURF;
      }
      return res;
    }

    // Player Mastery Branch 2: Active lethal pyroclastic burst without dash
    if (this.state === MagmaLifecycleState.PYROCLASTIC_BURST && danger === MagmaDangerValue.BURST) {
      res.hit = true;
      res.damage = PLAYER_MAGMA_BURST_DAMAGE;
      res.isLethal = true;
      res.thermalSingeInflicted = true;
      res.thermalSingeDurationMs = THERMAL_SINGE_DURATION_MS;
      res.slowRatio = THERMAL_SINGE_SLOW_RATIO;
      res.slowFactor = 1.0 - THERMAL_SINGE_SLOW_RATIO; // 0.75x
      res.floatingText = FLOATING_TEXT_THERMAL_SINGE;
      return res;
    }

    // Player Mastery Branch 3: Walking in molten telegraph zone inflicts Thermal Singe
    if (this.state === MagmaLifecycleState.MAGMA_TELEGRAPH && danger === MagmaDangerValue.HEATING) {
      res.thermalSingeInflicted = true;
      res.thermalSingeDurationMs = THERMAL_SINGE_DURATION_MS;
      res.slowRatio = THERMAL_SINGE_SLOW_RATIO;
      res.slowFactor = 1.0 - THERMAL_SINGE_SLOW_RATIO; // 0.75x
      res.floatingText = FLOATING_TEXT_THERMAL_SINGE;
      return res;
    }

    return res;
  }

  /**
   * Checks collision against an enemy or boss during lethal burst
   */
  public checkEnemyCollision(
    er: number,
    ec: number,
    isBoss: boolean,
    nowMs: number = Date.now(),
    bossMaxHp: number = 1000
  ): MagmaEnemyResult {
    const res = this.scratchEnemyResult;
    res.hit = false;
    res.damage = 0;
    res.isIncinerated = false;
    res.isMeltdownStunned = false;
    res.stunDurationMs = 0;
    res.scoreBonus = 0;
    res.ultimateChargeBonus = 0;
    res.floatingText = '';

    if (this.state !== MagmaLifecycleState.PYROCLASTIC_BURST) return res;
    if (typeof er !== 'number' || typeof ec !== 'number' || !Number.isFinite(er) || !Number.isFinite(ec)) return res;

    const ier = er | 0;
    const iec = ec | 0;
    if (ier < 0 || ier >= ROWS || iec < 0 || iec >= COLS) return res;

    const idx = ier * COLS + iec;
    if (this.dangerMask[idx] !== MagmaDangerValue.BURST) return res;

    const safeNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
    res.hit = true;

    if (isBoss) {
      // Boss: Anti-exploit guard check (single hit per burst)
      if (safeNowMs - this.lastBossHitTimestampMs >= BOSS_MAGMA_EXPLOIT_COOLDOWN_MS) {
        this.lastBossHitTimestampMs = safeNowMs;
        const safeHp = typeof bossMaxHp === 'number' && Number.isFinite(bossMaxHp) && bossMaxHp > 0 ? Math.max(100, bossMaxHp) : 1000;
        res.damage = Math.floor(safeHp * BOSS_MAGMA_DAMAGE_RATIO);
        res.isMeltdownStunned = true;
        res.stunDurationMs = BOSS_MELTDOWN_STUN_MS;
        res.floatingText = FLOATING_TEXT_MAGMA_MELTDOWN;
      } else {
        res.hit = false;
      }
    } else {
      // Minion: Instant lethal Incineration
      res.damage = ENEMY_MAGMA_BURST_DAMAGE;
      res.isIncinerated = true;
      res.scoreBonus = ENEMY_MAGMA_SCORE;
      res.ultimateChargeBonus = ENEMY_MAGMA_ULTIMATE_CHARGE;
      res.floatingText = FLOATING_TEXT_INCINERATED;
    }

    return res;
  }

  /**
   * Tactical Bomb Hook: Placed bomb interaction
   */
  public onBombPlaced(
    _bombId: string | number,
    row: number,
    col: number,
    _power: number,
    fuseDurationMs: number
  ): MagmaBombPlacedResult {
    const res = this.scratchBombPlacedResult;
    res.isPyroFused = false;
    res.modifiedFuseMs = fuseDurationMs;
    res.fuseDeltaMs = 0;
    res.kickSpeedBonus = 0;
    res.tint = undefined;
    res.floatingText = undefined;

    if (this.state === MagmaLifecycleState.DORMANT) return res;
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return res;

    const ir = row | 0;
    const ic = col | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;

    const idx = ir * COLS + ic;
    if (this.dangerMask[idx] === MagmaDangerValue.HEATING || this.dangerMask[idx] === MagmaDangerValue.BURST) {
      res.isPyroFused = true;
      res.modifiedFuseMs = Math.max(1000, fuseDurationMs - MAGMA_FUSE_ACCELERATION_MS);
      res.fuseDeltaMs = -MAGMA_FUSE_ACCELERATION_MS;
      res.kickSpeedBonus = BOMB_KICK_MAGMA_SPEED;
      res.tint = MAGMA_SUPER_BOMB_TINT;
      res.floatingText = FLOATING_TEXT_PYRO_FUSED;
    }

    return res;
  }

  /**
   * Tactical Bomb Hook: Bomb detonation interaction
   */
  public onBombDetonated(
    _bombId: string | number,
    row: number,
    col: number,
    power: number
  ): MagmaBombDetonationResult {
    const res = this.scratchBombDetonationResult;
    res.isPyroclastic = false;
    res.modifiedPower = power;
    res.piercing = false;
    res.bonusScore = 0;
    res.floatingText = '';

    if (this.state === MagmaLifecycleState.DORMANT) return res;
    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return res;

    const ir = row | 0;
    const ic = col | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;

    const idx = ir * COLS + ic;
    if (this.dangerMask[idx] === MagmaDangerValue.HEATING || this.dangerMask[idx] === MagmaDangerValue.BURST) {
      res.isPyroclastic = true;
      res.modifiedPower = power + PYROCLASTIC_EXTRA_POWER;
      res.piercing = true;
      res.bonusScore = PYROCLASTIC_BONUS_SCORE;
      res.floatingText = FLOATING_TEXT_PYROCLASTIC_DETONATION;
    }

    return res;
  }

  /**
   * Tactical Bomb Hook: Blast impact solidifies lava into Obsidian Crust (quenches lethal tile)
   */
  public onBombBlastImpact(row: number, col: number): MagmaBlastImpactResult {
    const res = this.scratchBlastImpactResult;
    res.quenched = false;
    res.obsidianDurationMs = 0;
    res.floatingText = '';

    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return res;

    const ir = row | 0;
    const ic = col | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;

    const idx = ir * COLS + ic;
    if (this.dangerMask[idx] === MagmaDangerValue.HEATING || this.dangerMask[idx] === MagmaDangerValue.BURST) {
      this.dangerMask[idx] = MagmaDangerValue.OBSIDIAN_CRUST;
      this.obsidianTimerGrid[idx] = OBSIDIAN_QUENCH_DURATION_MS;
      this.heatGrid[idx] = 0.1;
      res.quenched = true;
      res.obsidianDurationMs = OBSIDIAN_QUENCH_DURATION_MS;
      res.floatingText = FLOATING_TEXT_OBSIDIAN_QUENCHED;
    }

    return res;
  }

  /**
   * Thermal queries for physics and renderers
   */
  public getTileThermal(row: number, col: number): MagmaThermalResult {
    const res = this.scratchThermalResult;
    res.heat = 0;
    res.isMolten = false;
    res.isObsidianCrust = false;

    if (typeof row !== 'number' || typeof col !== 'number' || !Number.isFinite(row) || !Number.isFinite(col)) return res;

    const ir = row | 0;
    const ic = col | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return res;

    const idx = ir * COLS + ic;
    res.heat = this.heatGrid[idx];
    res.isMolten = this.dangerMask[idx] === MagmaDangerValue.HEATING || this.dangerMask[idx] === MagmaDangerValue.BURST;
    res.isObsidianCrust = this.dangerMask[idx] === MagmaDangerValue.OBSIDIAN_CRUST;
    return res;
  }

  /**
   * State accessors
   */
  public getState(): MagmaLifecycleState {
    return this.state;
  }

  public getTelegraphPhase(): MagmaTelegraphPhase {
    return this.telegraphPhase;
  }

  public getActiveMagmaIndices(): Int16Array {
    return this.activeMagmaIndices;
  }

  public getActiveMagmaCount(): number {
    return this.activeMagmaCount;
  }

  public calculateSafeAreaRatio(): number {
    return (TOTAL_TILES - this.activeMagmaCount) / TOTAL_TILES;
  }

  public isTileMagma(r: number, c: number): boolean {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return false;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const dr = ir - this.epicenterR;
    const dc = ic - this.epicenterC;
    return dr * dr + dc * dc <= this.radiusTiles * this.radiusTiles;
  }

  public getTileDangerCode(r: number, c: number): MagmaDangerValue {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return MagmaDangerValue.SAFE;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return MagmaDangerValue.SAFE;
    return this.dangerMask[ir * COLS + ic] as MagmaDangerValue;
  }

  public getTileHeat(r: number, c: number): number {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return 0;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return 0;
    return this.heatGrid[ir * COLS + ic];
  }

  public isTileWalkable(r: number, c: number): boolean {
    return this.getTileDangerCode(r, c) !== MagmaDangerValue.BURST;
  }

  public getCooldownDurationMs(): number {
    return this.cooldownDurationMs;
  }

  public setClimaxMode(enabled: boolean): void {
    this.cooldownDurationMs = enabled ? CLIMAX_MAGMA_COOLDOWN_MS : DEFAULT_MAGMA_COOLDOWN_MS;
  }

  public setWhispersMode(enabled: boolean): void {
    this.cooldownDurationMs = enabled ? WHISPERS_MAGMA_COOLDOWN_MS : DEFAULT_MAGMA_COOLDOWN_MS;
  }
}
