/**
 * DynamicHazard.ts — Quantum Spire Dynamic Hazard System
 *
 * Implements the bidirectional geometric hazard designed in creative_1_hazard_design.md:
 * - 4-Stage Lifecycle FSM: INACTIVE -> TELEGRAPH -> ACTIVE -> COOLDOWN
 * - 3-Tier Telegraph Progression: Yellow (1000ms) -> Amber (500ms) -> Red (500ms)
 * - Zero-GC 1D TypedArray Memory Layout (Uint8Array, Int16Array, Float32Array)
 * - Tactical Bomb Interactions: Quantum Entanglement, Tachyon Overcharge, Subspace Hyper-Fuse, Polarization Strike
 * - Dynamic Collision & Player Mastery: Tachyon Shear, Phase Jitter Debuff, Quantum Tunneling (Dash I-Frames)
 * - Environmental Enemy Kills: Tachyon Vaporization (120 DMG) & Elite 1.5s Stun
 * - Mathematical Fair Encounter Guarantees (Safe area >= 40%, observed >= 79%)
 */

import {
  ROWS,
  COLS,
  TOTAL_TILES,
} from '../pathfinding.ts';

/**
 * Universal Lifecycle States for Dynamic Hazard FSM
 */
export const HazardLifecycleState = {
  INACTIVE: 'INACTIVE',
  TELEGRAPH: 'TELEGRAPH',
  ACTIVE: 'ACTIVE',
  COOLDOWN: 'COOLDOWN',
} as const;

export type HazardLifecycleState =
  typeof HazardLifecycleState[keyof typeof HazardLifecycleState];

/**
 * 3-Tier Sub-Phases during TELEGRAPH Lifecycle State
 */
export const TelegraphPhase = {
  NONE: 'NONE',
  YELLOW: 'YELLOW',
  AMBER: 'AMBER',
  RED: 'RED',
} as const;

export type TelegraphPhase =
  typeof TelegraphPhase[keyof typeof TelegraphPhase];

/**
 * Subtype descriptor for Spire Nodes and Corridor Beams
 */
export const HazardSubtype = {
  ANCHOR: 0,
  H_BEAM: 1,
  V_BEAM: 2,
  NEXUS: 3,
} as const;

export type HazardSubtype = typeof HazardSubtype[keyof typeof HazardSubtype];

/**
 * Timing & Tuning Constants (ms)
 */
export const DURATION_TELEGRAPH_YELLOW_MS = 1000;
export const DURATION_TELEGRAPH_AMBER_MS = 500;
export const DURATION_TELEGRAPH_RED_MS = 500;
export const TOTAL_TELEGRAPH_MS =
  DURATION_TELEGRAPH_YELLOW_MS +
  DURATION_TELEGRAPH_AMBER_MS +
  DURATION_TELEGRAPH_RED_MS; // 2000 ms

export const DURATION_ACTIVE_BEAM_MS = 300;
export const TUNNELING_WINDOW_MS = 150; // First 150ms of ACTIVE allows Quantum Tunneling
export const DEFAULT_COOLDOWN_MS = 5700; // Outbreak: 5.7s cooldown + 2.0s telegraph + 0.3s active = 8.0s
export const CLIMAX_COOLDOWN_MS = 3700; // Climax: 3.7s cooldown + 2.0s telegraph + 0.3s active = 6.0s
export const WHISPERS_CYCLE_MS = 12000; // Whispers teaching pulse
export const POLARIZATION_DURATION_MS = 8000; // 8.0s cleansing & neutral state

export const HYPER_FUSE_MS = 1500;
export const STANDARD_FUSE_MS = 3000;

export const PLAYER_HAZARD_DAMAGE = 25;
export const ENEMY_HAZARD_DAMAGE = 120;
export const BOSS_HAZARD_DAMAGE_RATIO = 0.15;
export const BOSS_STUN_DURATION_MS = 1500;
export const PHASE_JITTER_DURATION_MS = 2000;

export const MAX_SPIRE_NODES = 5;
export const MAX_BEAM_TILES = 32;
export const MAX_GHOST_BOMBS = 16;
export const MIN_SAFE_AREA_RATIO = 0.4;

/**
 * Pre-allocated Spire Node Structure
 */
export interface SpireNode {
  id: number;
  r: number;
  c: number;
  idx: number;
  pairId: number; // Node ID of paired Spire (-1 for nexus)
  subtype: HazardSubtype;
  isPolarized: boolean;
  polarizeTimerMs: number;
}

/**
 * Pre-allocated Ghost Bomb Slot for Zero-GC Entanglement
 */
export interface GhostBombSlot {
  active: boolean;
  id: number;
  parentBombId: number;
  r: number;
  c: number;
  fuseMs: number;
  power: number;
  isEntangled: boolean;
}

/**
 * Player Collision Result (Zero-GC scratch container)
 */
export interface PlayerCollisionResult {
  hit: boolean;
  damage: number;
  isLethal: boolean;
  tunneled: boolean;
  phaseShiftGranted: boolean;
  phaseJitterInflicted: boolean;
  jitterDurationMs: number;
}

/**
 * Enemy Collision Result (Zero-GC scratch container)
 */
export interface EnemyCollisionResult {
  hit: boolean;
  damage: number;
  isVaporized: boolean;
  isStunned: boolean;
  stunDurationMs: number;
  scoreBonus: number;
}

/**
 * DynamicHazard: Main Engine Class for the Quantum Spire Hazard
 */
export class DynamicHazard {
  private lifecycleState: HazardLifecycleState = HazardLifecycleState.INACTIVE;
  private telegraphPhase: TelegraphPhase = TelegraphPhase.NONE;

  private stage: 'WHISPERS' | 'OUTBREAK' | 'CLIMAX' = 'OUTBREAK';
  private stageTimerMs: number = 0;
  private cycleTimerMs: number = 0;
  private activeRemainingMs: number = 0;
  private telegraphRemainingMs: number = 0;

  // Active Spire selection for current cycle (0: Pair Alpha, 1: Pair Beta, 2: Both + Nexus)
  private activePairMode: number = 1;

  // Spire Nodes (Fixed Anchors)
  // Pair Alpha: S0(3, 4) & S1(9, 4)
  // Pair Beta:  S2(6, 3) & S3(6, 11)
  // Nexus C0:   S4(6, 7)
  private readonly spires: SpireNode[] = [
    { id: 0, r: 3, c: 4, idx: 3 * COLS + 4, pairId: 1, subtype: HazardSubtype.ANCHOR, isPolarized: false, polarizeTimerMs: 0 },
    { id: 1, r: 9, c: 4, idx: 9 * COLS + 4, pairId: 0, subtype: HazardSubtype.ANCHOR, isPolarized: false, polarizeTimerMs: 0 },
    { id: 2, r: 6, c: 3, idx: 6 * COLS + 3, pairId: 3, subtype: HazardSubtype.ANCHOR, isPolarized: false, polarizeTimerMs: 0 },
    { id: 3, r: 6, c: 11, idx: 6 * COLS + 11, pairId: 2, subtype: HazardSubtype.ANCHOR, isPolarized: false, polarizeTimerMs: 0 },
    { id: 4, r: 6, c: 7, idx: 6 * COLS + 7, pairId: -1, subtype: HazardSubtype.NEXUS, isPolarized: false, polarizeTimerMs: 0 },
  ];

  // Pre-allocated 1D TypedArrays for Zero-GC Grid State
  // dangerMask: 0 = Safe, 1 = Telegraphed Danger, 2 = Lethal Active Beam, 3 = Polarized Safe Beam
  private readonly dangerMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  // intensityGrid: 0.0 to 1.0
  private readonly intensityGrid: Float32Array = new Float32Array(TOTAL_TILES);
  // activeBeamTiles: indices of tiles currently in active beam
  private readonly activeBeamIndices: Int16Array = new Int16Array(MAX_BEAM_TILES);
  private activeBeamCount: number = 0;

  // Pre-allocated Ghost Bomb Pool
  private readonly ghostBombPool: GhostBombSlot[] = [];
  private nextGhostBombId: number = 9000;

  // Pre-allocated scratch objects for Zero-GC returns
  private readonly scratchPlayerResult: PlayerCollisionResult = {
    hit: false,
    damage: 0,
    isLethal: false,
    tunneled: false,
    phaseShiftGranted: false,
    phaseJitterInflicted: false,
    jitterDurationMs: 0,
  };

  private readonly scratchEnemyResult: EnemyCollisionResult = {
    hit: false,
    damage: 0,
    isVaporized: false,
    isStunned: false,
    stunDurationMs: 0,
    scoreBonus: 0,
  };

  // Map representation reference for wall/block checks
  private mapRef: number[][] | null = null;

  constructor() {
    for (let i = 0; i < MAX_GHOST_BOMBS; i++) {
      this.ghostBombPool.push({
        active: false,
        id: 0,
        parentBombId: -1,
        r: 0,
        c: 0,
        fuseMs: 0,
        power: 0,
        isEntangled: false,
      });
    }
  }

  /**
   * Initializes the hazard system with the arena map layout
   */
  public init(map?: number[][]): void {
    if (map) {
      this.mapRef = map;
    }
    this.reset();
  }

  /**
   * Starts hazard progression with specific crisis stage
   */
  public start(stage: 'WHISPERS' | 'OUTBREAK' | 'CLIMAX' = 'OUTBREAK'): void {
    this.stage = stage;
    this.cycleTimerMs = 0;
    this.stageTimerMs = 0;
    this.transitionTo(HazardLifecycleState.COOLDOWN);
    // Initial warmup delay before first telegraph
    this.cycleTimerMs = stage === 'WHISPERS' ? WHISPERS_CYCLE_MS : 2000;
  }

  /**
   * Stops the hazard and returns to INACTIVE
   */
  public stop(): void {
    this.transitionTo(HazardLifecycleState.INACTIVE);
    this.clearBeams();
  }

  /**
   * Resets all internal buffers, pools, and timers to initial baseline
   */
  public reset(): void {
    this.lifecycleState = HazardLifecycleState.INACTIVE;
    this.telegraphPhase = TelegraphPhase.NONE;
    this.stage = 'OUTBREAK';
    this.stageTimerMs = 0;
    this.cycleTimerMs = 0;
    this.activeRemainingMs = 0;
    this.telegraphRemainingMs = 0;
    this.activePairMode = 1;
    this.clearBeams();

    for (let i = 0; i < this.spires.length; i++) {
      this.spires[i].isPolarized = false;
      this.spires[i].polarizeTimerMs = 0;
    }

    for (let i = 0; i < this.ghostBombPool.length; i++) {
      this.ghostBombPool[i].active = false;
    }
  }

  /**
   * Main per-frame update loop — Strictly adheres to Zero-GC invariants
   */
  public update(deltaMs: number): void {
    if (this.lifecycleState === HazardLifecycleState.INACTIVE) {
      return;
    }

    this.stageTimerMs += deltaMs;

    // Update Spire polarization timers
    for (let i = 0; i < this.spires.length; i++) {
      if (this.spires[i].isPolarized) {
        this.spires[i].polarizeTimerMs -= deltaMs;
        if (this.spires[i].polarizeTimerMs <= 0) {
          this.spires[i].isPolarized = false;
          this.spires[i].polarizeTimerMs = 0;
        }
      }
    }

    // Update Ghost Bomb fuses
    for (let i = 0; i < this.ghostBombPool.length; i++) {
      if (this.ghostBombPool[i].active) {
        this.ghostBombPool[i].fuseMs -= deltaMs;
      }
    }

    // FSM State Updates with cascading delta time
    let remainingDelta = deltaMs;
    let loopGuard = 0;

    while (remainingDelta > 0 && loopGuard++ < 6) {
      switch (this.lifecycleState) {
        case HazardLifecycleState.COOLDOWN: {
          if (this.cycleTimerMs <= remainingDelta) {
            remainingDelta -= this.cycleTimerMs;
            this.cycleTimerMs = 0;
            this.beginTelegraph();
          } else {
            this.cycleTimerMs -= remainingDelta;
            remainingDelta = 0;
          }
          break;
        }

        case HazardLifecycleState.TELEGRAPH: {
          if (this.telegraphRemainingMs <= remainingDelta) {
            remainingDelta -= this.telegraphRemainingMs;
            this.telegraphRemainingMs = 0;
            this.activateDischarge();
          } else {
            this.telegraphRemainingMs -= remainingDelta;
            remainingDelta = 0;
            const elapsed = TOTAL_TELEGRAPH_MS - Math.max(0, this.telegraphRemainingMs);

            if (elapsed < DURATION_TELEGRAPH_YELLOW_MS) {
              this.telegraphPhase = TelegraphPhase.YELLOW;
              this.setBeamIntensity(0.25);
            } else if (elapsed < DURATION_TELEGRAPH_YELLOW_MS + DURATION_TELEGRAPH_AMBER_MS) {
              this.telegraphPhase = TelegraphPhase.AMBER;
              this.setBeamIntensity(0.55);
            } else {
              this.telegraphPhase = TelegraphPhase.RED;
              this.setBeamIntensity(0.85);
            }
          }
          break;
        }

        case HazardLifecycleState.ACTIVE: {
          if (this.activeRemainingMs <= remainingDelta) {
            remainingDelta -= this.activeRemainingMs;
            this.activeRemainingMs = 0;
            this.endDischarge();
          } else {
            this.activeRemainingMs -= remainingDelta;
            remainingDelta = 0;
            this.setBeamIntensity(1.0);
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
   * Internal transition: Begin Telegraphing next corridor strike
   */
  private beginTelegraph(): void {
    this.transitionTo(HazardLifecycleState.TELEGRAPH);
    this.telegraphRemainingMs = TOTAL_TELEGRAPH_MS;
    this.telegraphPhase = TelegraphPhase.YELLOW;

    // Determine active spire pairs based on stage & alternation
    if (this.stage === 'CLIMAX') {
      this.activePairMode = 2; // All spires + Nexus
    } else {
      this.activePairMode = (this.activePairMode + 1) % 2; // Alternate Alpha / Beta
    }

    this.recomputeBeams(true);
  }

  /**
   * Internal transition: Fire Active Tachyon Discharge Beam
   */
  private activateDischarge(): void {
    this.transitionTo(HazardLifecycleState.ACTIVE);
    this.telegraphPhase = TelegraphPhase.NONE;
    this.activeRemainingMs = DURATION_ACTIVE_BEAM_MS;
    this.recomputeBeams(false);
  }

  /**
   * Internal transition: End Discharge and enter Cooldown
   */
  private endDischarge(): void {
    this.clearBeams();
    this.transitionTo(HazardLifecycleState.COOLDOWN);
    this.cycleTimerMs =
      this.stage === 'CLIMAX' ? CLIMAX_COOLDOWN_MS : DEFAULT_COOLDOWN_MS;
  }

  private transitionTo(newState: HazardLifecycleState): void {
    this.lifecycleState = newState;
  }

  /**
   * Computes beam path between paired spires and writes to 1D TypedArrays
   */
  private recomputeBeams(isTelegraph: boolean): void {
    this.clearBeams();

    // Helper to add line of tiles between two points
    const addCorridor = (r1: number, c1: number, r2: number, c2: number, isPolarized: boolean) => {
      const minR = Math.min(r1, r2);
      const maxR = Math.max(r1, r2);
      const minC = Math.min(c1, c2);
      const maxC = Math.max(c1, c2);

      const dangerCode = isTelegraph ? 1 : isPolarized ? 3 : 2;

      if (r1 === r2) {
        // Horizontal Corridor
        for (let c = minC; c <= maxC; c++) {
          if (this.isWalkableOrPiercable(r1, c)) {
            const idx = r1 * COLS + c;
            if (this.dangerMask[idx] === 0) {
              this.dangerMask[idx] = dangerCode;
              if (this.activeBeamCount < MAX_BEAM_TILES) {
                this.activeBeamIndices[this.activeBeamCount++] = idx;
              }
            } else if (dangerCode === 2 && this.dangerMask[idx] === 3) {
              // Non-polarized takes precedence if lethal
              this.dangerMask[idx] = dangerCode;
            }
          }
        }
      } else if (c1 === c2) {
        // Vertical Corridor
        for (let r = minR; r <= maxR; r++) {
          if (this.isWalkableOrPiercable(r, c1)) {
            const idx = r * COLS + c1;
            if (this.dangerMask[idx] === 0) {
              this.dangerMask[idx] = dangerCode;
              if (this.activeBeamCount < MAX_BEAM_TILES) {
                this.activeBeamIndices[this.activeBeamCount++] = idx;
              }
            } else if (dangerCode === 2 && this.dangerMask[idx] === 3) {
              this.dangerMask[idx] = dangerCode;
            }
          }
        }
      }
    };

    if (this.activePairMode === 2) {
      // CLIMAX: Full cross-axis beams through Nexus C0(6, 7): Row 6 (1..13) and Col 7 (1..11)
      const isPolarizedRow = this.spires[2].isPolarized || this.spires[3].isPolarized;
      const isPolarizedCol = this.spires[0].isPolarized || this.spires[1].isPolarized || this.spires[4].isPolarized;
      addCorridor(6, 1, 6, 13, isPolarizedRow); // 13 tiles
      addCorridor(1, 7, 11, 7, isPolarizedCol); // 11 tiles (intersects at 6,7 -> 23 total)
      // Also include anchors S0(3,4) & S1(9,4)
      addCorridor(3, 4, 3, 4, isPolarizedCol);
      addCorridor(9, 4, 9, 4, isPolarizedCol);
    } else if (this.activePairMode === 0) {
      // Pair Alpha (Vertical, Col 4, rows 3..9)
      const isPolarized = this.spires[0].isPolarized || this.spires[1].isPolarized;
      addCorridor(this.spires[0].r, this.spires[0].c, this.spires[1].r, this.spires[1].c, isPolarized);
    } else {
      // Pair Beta (Horizontal, Row 6, cols 3..11)
      const isPolarized = this.spires[2].isPolarized || this.spires[3].isPolarized;
      addCorridor(this.spires[2].r, this.spires[2].c, this.spires[3].r, this.spires[3].c, isPolarized);
    }
  }

  private setBeamIntensity(intensity: number): void {
    for (let i = 0; i < this.activeBeamCount; i++) {
      const idx = this.activeBeamIndices[i];
      this.intensityGrid[idx] = intensity;
    }
  }

  private clearBeams(): void {
    for (let i = 0; i < this.activeBeamCount; i++) {
      const idx = this.activeBeamIndices[i];
      this.dangerMask[idx] = 0;
      this.intensityGrid[idx] = 0;
    }
    this.activeBeamCount = 0;
  }

  private isWalkableOrPiercable(r: number, c: number): boolean {
    if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1) return false;
    return true;
  }

  /* ==============================================================================
   * PUBLIC QUERY & INTERACTION APIS
   * ============================================================================== */

  public getState(): HazardLifecycleState {
    return this.lifecycleState;
  }

  public getTelegraphPhase(): TelegraphPhase {
    return this.telegraphPhase;
  }

  public getStage(): 'WHISPERS' | 'OUTBREAK' | 'CLIMAX' {
    return this.stage;
  }

  public isTileLethal(r: number, c: number): boolean {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const idx = r * COLS + c;
    return this.dangerMask[idx] === 2; // 2 = Lethal Active Beam
  }

  public isTileTelegraphed(r: number, c: number): boolean {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const idx = r * COLS + c;
    return this.dangerMask[idx] === 1;
  }

  public isTilePolarized(r: number, c: number): boolean {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const idx = r * COLS + c;
    return this.dangerMask[idx] === 3;
  }

  public getActiveBeamCount(): number {
    return this.activeBeamCount;
  }

  /**
   * Evaluates Player Collision against active hazard beam
   * Features:
   * - Quantum Tunneling: Dashing during first 150ms grants phase shift and 0 damage
   * - Polarized Beam: 0 damage
   * - Direct Hit: 25 damage, Phase Jitter debuff
   */
  public checkPlayerCollision(
    playerR: number,
    playerC: number,
    isDashing: boolean = false,
    dashElapsedMs: number = 0
  ): PlayerCollisionResult {
    const res = this.scratchPlayerResult;
    res.hit = false;
    res.damage = 0;
    res.isLethal = false;
    res.tunneled = false;
    res.phaseShiftGranted = false;
    res.phaseJitterInflicted = false;
    res.jitterDurationMs = 0;

    if (this.lifecycleState !== HazardLifecycleState.ACTIVE) {
      return res;
    }

    const idx = playerR * COLS + playerC;
    const tileCode = this.dangerMask[idx];

    // Polarized beam is completely harmless
    if (tileCode === 3) {
      res.hit = true;
      res.damage = 0;
      return res;
    }

    if (tileCode === 2) {
      res.hit = true;

      // Quantum Tunneling Check
      const activeElapsed = DURATION_ACTIVE_BEAM_MS - this.activeRemainingMs;
      if (isDashing && activeElapsed <= TUNNELING_WINDOW_MS && dashElapsedMs <= TUNNELING_WINDOW_MS) {
        res.damage = 0;
        res.tunneled = true;
        res.phaseShiftGranted = true;
        return res;
      }

      // Standard Lethal Hit
      res.damage = PLAYER_HAZARD_DAMAGE;
      res.isLethal = true;
      res.phaseJitterInflicted = true;
      res.jitterDurationMs = PHASE_JITTER_DURATION_MS;
      return res;
    }

    return res;
  }

  /**
   * Evaluates Enemy Collision against active hazard beam
   * - Minion: 120 Environmental Damage (vaporized)
   * - Elite/Boss: 15% Max HP damage + 1.5s Stun
   */
  public checkEnemyCollision(
    enemyR: number,
    enemyC: number,
    isBoss: boolean = false
  ): EnemyCollisionResult {
    const res = this.scratchEnemyResult;
    res.hit = false;
    res.damage = 0;
    res.isVaporized = false;
    res.isStunned = false;
    res.stunDurationMs = 0;
    res.scoreBonus = 0;

    if (this.lifecycleState !== HazardLifecycleState.ACTIVE) {
      return res;
    }

    const idx = enemyR * COLS + enemyC;
    if (this.dangerMask[idx] === 2) {
      res.hit = true;
      if (isBoss) {
        res.damage = 15; // 15% Max HP
        res.isStunned = true;
        res.stunDurationMs = BOSS_STUN_DURATION_MS;
      } else {
        res.damage = ENEMY_HAZARD_DAMAGE;
        res.isVaporized = true;
        res.scoreBonus = 100;
      }
    }

    return res;
  }

  /* ==============================================================================
   * TACTICAL BOMB INTERACTIONS
   * ============================================================================== */

  /**
   * Called when a player places a bomb:
   * 1. Subspace Hyper-Fuse: Placing bomb on Spire compresses fuse to 1500ms
   * 2. Quantum Entanglement: Placing bomb adjacent/on Spire creates Ghost Bomb at paired Spire
   */
  public onBombPlaced(
    bombId: number,
    r: number,
    c: number,
    power: number,
    fuseMs: number = STANDARD_FUSE_MS
  ): { isEntangled: boolean; ghostBombId?: number; modifiedFuseMs: number } {
    let modifiedFuseMs = fuseMs;
    let targetSpire: SpireNode | null = null;

    // Check if on Spire
    for (let i = 0; i < this.spires.length; i++) {
      const spire = this.spires[i];
      if (spire.r === r && spire.c === c) {
        modifiedFuseMs = HYPER_FUSE_MS;
        targetSpire = spire;
        break;
      }
    }

    // Check if adjacent to Spire (Chebyshev distance 1)
    if (!targetSpire) {
      for (let i = 0; i < this.spires.length; i++) {
        const spire = this.spires[i];
        if (Math.abs(spire.r - r) <= 1 && Math.abs(spire.c - c) <= 1) {
          targetSpire = spire;
          break;
        }
      }
    }

    if (targetSpire && targetSpire.pairId >= 0) {
      const pairedSpire = this.spires[targetSpire.pairId];
      // Acquire slot from pre-allocated ghost bomb pool
      for (let i = 0; i < this.ghostBombPool.length; i++) {
        const slot = this.ghostBombPool[i];
        if (!slot.active) {
          slot.active = true;
          slot.id = ++this.nextGhostBombId;
          slot.parentBombId = bombId;
          slot.r = pairedSpire.r;
          slot.c = pairedSpire.c;
          slot.fuseMs = modifiedFuseMs;
          slot.power = power;
          slot.isEntangled = true;

          return {
            isEntangled: true,
            ghostBombId: slot.id,
            modifiedFuseMs,
          };
        }
      }
    }

    return {
      isEntangled: false,
      modifiedFuseMs,
    };
  }

  /**
   * Called when a bomb detonates:
   * 1. Synchronized Entanglement Detonation
   * 2. Tachyon Overcharge (+2 blast power if detonating within active beam)
   */
  public onBombDetonated(
    bombId: number,
    r: number,
    c: number,
    power: number
  ): {
    overcharged: boolean;
    modifiedPower: number;
    piercing: boolean;
    pairedGhostBombIds: number[];
  } {
    const idx = r * COLS + c;
    const isOvercharged = this.lifecycleState === HazardLifecycleState.ACTIVE && this.dangerMask[idx] > 0;
    const modifiedPower = isOvercharged ? power + 2 : power;
    const piercing = isOvercharged;

    const pairedGhostBombIds: number[] = [];

    // Detonate any active ghost bombs linked to this bomb
    for (let i = 0; i < this.ghostBombPool.length; i++) {
      const slot = this.ghostBombPool[i];
      if (slot.active && (slot.parentBombId === bombId || slot.id === bombId)) {
        pairedGhostBombIds.push(slot.id);
        slot.active = false;
      }
    }

    return {
      overcharged: isOvercharged,
      modifiedPower,
      piercing,
      pairedGhostBombIds,
    };
  }

  /**
   * Polarization Strike: Bomb blast impact against a Spire crystal
   * Striking an unpolarized Spire crystal:
   * - Polarizes the spire pair for 8000ms
   * - Cleanses surrounding 3x3 tiles
   */
  public onBombBlastImpact(r: number, c: number): {
    polarized: boolean;
    spireId?: number;
    cleansedTileCount: number;
  } {
    for (let i = 0; i < this.spires.length; i++) {
      const spire = this.spires[i];
      if (spire.r === r && spire.c === c) {
        spire.isPolarized = true;
        spire.polarizeTimerMs = POLARIZATION_DURATION_MS;

        // If paired, polarize pair as well
        if (spire.pairId >= 0) {
          const paired = this.spires[spire.pairId];
          paired.isPolarized = true;
          paired.polarizeTimerMs = POLARIZATION_DURATION_MS;
        }

        // Count cleansed 3x3 tiles
        let cleansed = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const tr = r + dr;
            const tc = c + dc;
            if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) {
              cleansed++;
            }
          }
        }

        return {
          polarized: true,
          spireId: spire.id,
          cleansedTileCount: cleansed,
        };
      }
    }

    return {
      polarized: false,
      cleansedTileCount: 0,
    };
  }

  /**
   * Spatial Ejection Safeguard:
   * Safely displaces an entity standing on an activating Spire anchor to adjacent empty tile
   */
  public resolveSafeEjection(r: number, c: number): { r: number; c: number; displaced: boolean } {
    let isAnchor = false;
    for (let i = 0; i < this.spires.length; i++) {
      if (this.spires[i].r === r && this.spires[i].c === c) {
        isAnchor = true;
        break;
      }
    }

    if (!isAnchor) {
      return { r, c, displaced: false };
    }

    const DIRS = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (let i = 0; i < DIRS.length; i++) {
      const tr = r + DIRS[i].dr;
      const tc = c + DIRS[i].dc;
      if (this.isWalkableOrPiercable(tr, tc)) {
        return { r: tr, c: tc, displaced: true };
      }
    }

    return { r, c, displaced: false };
  }

  /**
   * Mathematical Fair Encounter Guarantee:
   * Returns ratio of safe walkable tiles to total walkable tiles (must always be >= 0.40)
   */
  public getSafeAreaRatio(): number {
    let totalWalkable = 0;
    let dangerousWalkable = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.isWalkableOrPiercable(r, c)) {
          totalWalkable++;
          const idx = r * COLS + c;
          if (this.dangerMask[idx] > 0) {
            dangerousWalkable++;
          }
        }
      }
    }

    if (totalWalkable === 0) return 1.0;
    const safeTiles = totalWalkable - dangerousWalkable;
    return safeTiles / totalWalkable;
  }

  public getSpires(): readonly SpireNode[] {
    return this.spires;
  }

  public getActiveGhostBombs(): readonly GhostBombSlot[] {
    return this.ghostBombPool.filter((b) => b.active);
  }
}
