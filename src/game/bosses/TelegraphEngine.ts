/**
 * TelegraphEngine.ts
 *
 * Universal 3-Tier Floor Tile Telegraph Engine for Sweet Bombers.
 * Provides procedural canvas batching, committed trajectories, locked windup,
 * and mathematical fair encounter guarantees (>= 40% safe area).
 *
 * Strictly adheres to Zero-GC constraints (1D Typed Arrays, zero runtime heap allocations).
 */

import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
  TILE_WALL,
} from '../pathfinding.ts';
import { TelegraphTier } from './BossTypes.ts';

/**
 * Interface representing Phaser Graphics or a Mock Renderer for Headless Testing
 */
export interface ITelegraphRenderer {
  clear(): this;
  lineStyle(lineWidth: number, color: number, alpha?: number): this;
  strokeRect(x: number, y: number, width: number, height: number): this;
  fillStyle(color: number, alpha?: number): this;
  fillRect(x: number, y: number, width: number, height: number): this;
  beginPath(): this;
  moveTo(x: number, y: number): this;
  lineTo(x: number, y: number): this;
  strokePath(): this;
}

/**
 * Result payload returned from attack registration
 */
export interface AttackRegistrationResult {
  success: boolean;
  attackId?: number;
  registeredTileCount?: number;
  reason?:
    | 'EXCEEDS_SAFE_BUDGET'
    | 'ZERO_BUDGET_REMAINING'
    | 'CAPACITY_EXHAUSTED'
    | 'INVALID_PARAMS';
  activeDangerCount?: number;
  maxAllowedDanger?: number;
  safeRatio?: number;
}

/**
 * Constants & Tuning Parameters
 */
export const MAX_TELEGRAPH_TILES = 128;
export const STANDARD_WALKABLE_TILES = 113;
export const MIN_SAFE_AREA_RATIO = 0.4;
export const MAX_DANGER_AREA_RATIO = 0.6;

export const DURATION_YELLOW_MS = 1000; // 2.0s -> 1.0s (Remaining: 2000 -> 1000)
export const DURATION_AMBER_MS = 500; // 1.0s -> 0.5s (Remaining: 1000 -> 500)
export const DURATION_RED_MS = 500; // 0.5s -> 0.0s (Remaining: 500 -> 0)
export const STANDARD_TOTAL_DURATION_MS = 2000;

export const COLOR_YELLOW = 0xffeb3b;
export const COLOR_AMBER = 0xf59e0b;
export const COLOR_RED = 0xef4444;
export const COLOR_RUBY_STROKE = 0xb8254a;
export const COLOR_WHITE_FLASH = 0xffffff;

export class TelegraphEngine {
  // 1. Renderer Target (Persistent Phaser Graphics or Mock)
  private renderer: ITelegraphRenderer | null = null;

  // 2. Arena Configuration & Walkable Tile Tracking
  public readonly rows: number = ROWS;
  public readonly cols: number = COLS;
  public readonly totalTiles: number = TOTAL_TILES;
  public readonly tileSize: number = TILE_SIZE;

  private readonly walkableMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  private _totalWalkableTiles: number = STANDARD_WALKABLE_TILES;
  private _activeWalkableDangerCount: number = 0;

  // 3. Dense Active Slot Pool (O(1) Swap-and-Pop)
  private readonly activeSlots: Int16Array = new Int16Array(MAX_TELEGRAPH_TILES);
  private _activeCount: number = 0;

  // 4. Per-Slot Parallel Typed Array Buffers
  private readonly slotTileIndex: Uint16Array = new Uint16Array(MAX_TELEGRAPH_TILES);
  private readonly slotAttackId: Uint16Array = new Uint16Array(MAX_TELEGRAPH_TILES);
  private readonly slotRemainingTimeMs: Float32Array = new Float32Array(MAX_TELEGRAPH_TILES);
  private readonly slotTotalDurationMs: Float32Array = new Float32Array(MAX_TELEGRAPH_TILES);
  private readonly slotStage: Uint8Array = new Uint8Array(MAX_TELEGRAPH_TILES);
  private readonly slotFlags: Uint8Array = new Uint8Array(MAX_TELEGRAPH_TILES);

  // 5. Fast Spatial Bitmasks (195 Tiles)
  public readonly activeTileMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  private readonly tileRefCount: Uint8Array = new Uint8Array(TOTAL_TILES);
  private readonly tileDominantStage: Uint8Array = new Uint8Array(TOTAL_TILES);
  private readonly tileRemainingTime: Float32Array = new Float32Array(TOTAL_TILES);

  // 6. Scratch Buffers for Zero-GC Validations
  private readonly scratchProposedMask: Uint8Array = new Uint8Array(TOTAL_TILES);
  private readonly scratchBfsQueue: Int16Array = new Int16Array(TOTAL_TILES);
  private readonly scratchBfsVisited: Uint8Array = new Uint8Array(TOTAL_TILES);
  private scratchBfsGen: number = 1;

  // 7. Attack Management State
  private nextAttackId: number = 1;
  private onImpactCallback: ((attackId: number, tileIdx: number) => void) | null = null;

  constructor(renderer?: ITelegraphRenderer, initialWalkableMask?: Uint8Array) {
    if (renderer) {
      this.renderer = renderer;
    }
    if (initialWalkableMask) {
      this.setWalkableArena(initialWalkableMask);
    } else {
      this.initDefaultStandardArena();
    }
  }

  /**
   * Initializes standard arena walkable map (indestructible border + fixed inner pillars)
   */
  public initDefaultStandardArena(): void {
    let count = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
          this.walkableMask[idx] = 0; // Outer wall
        } else if (r % 2 === 0 && c % 2 === 0) {
          this.walkableMask[idx] = 0; // Inner pillar
        } else {
          this.walkableMask[idx] = 1; // Walkable corridor
          count++;
        }
      }
    }
    this._totalWalkableTiles = count;
  }

  /**
   * Configures custom arena walkable layout (e.g. boss-specific arenas)
   */
  public setWalkableArena(walkableBitmask: Uint8Array): void {
    let count = 0;
    for (let i = 0; i < this.totalTiles; i++) {
      const isWalkable = walkableBitmask[i] !== 0 && walkableBitmask[i] !== TILE_WALL ? 1 : 0;
      this.walkableMask[i] = isWalkable;
      if (isWalkable) count++;
    }
    this._totalWalkableTiles = count > 0 ? count : STANDARD_WALKABLE_TILES;
    this.recalculateActiveWalkableDanger();
  }

  public setRenderer(renderer: ITelegraphRenderer): void {
    this.renderer = renderer;
  }

  public setOnImpactCallback(cb: (attackId: number, tileIdx: number) => void): void {
    this.onImpactCallback = cb;
  }

  public get activeCount(): number {
    return this._activeCount;
  }

  public get totalWalkableTiles(): number {
    return this._totalWalkableTiles;
  }

  public get activeWalkableDangerCount(): number {
    return this._activeWalkableDangerCount;
  }

  /**
   * Returns current percentage of walkable tiles that are completely safe
   */
  public getSafeWalkableRatio(): number {
    if (this._totalWalkableTiles === 0) return 1.0;
    const safeCount = this._totalWalkableTiles - this._activeWalkableDangerCount;
    return safeCount / this._totalWalkableTiles;
  }

  /**
   * Checks if an attack's trajectory is committed and frozen (t <= 1.0s)
   */
  public isTrajectoryLocked(attackId: number): boolean {
    for (let i = 0; i < this._activeCount; i++) {
      const slot = this.activeSlots[i];
      if (this.slotAttackId[slot] === attackId) {
        // If any tile in this attack has entered Amber or Red (remaining <= 1000ms), trajectory is locked
        if (this.slotRemainingTimeMs[slot] <= DURATION_YELLOW_MS) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Validates if a proposed set of tiles satisfies the Fair Encounter Guarantee (>= 40% safe area)
   */
  public validateSafeCoverage(targetTiles: readonly number[]): {
    valid: boolean;
    projectedDanger: number;
    maxAllowed: number;
  } {
    this.scratchProposedMask.set(this.activeTileMask);
    let newlyMarkedWalkable = 0;

    for (let i = 0; i < targetTiles.length; i++) {
      const idx = targetTiles[i];
      if (idx < 0 || idx >= this.totalTiles || this.walkableMask[idx] === 0) {
        continue;
      }
      if (this.scratchProposedMask[idx] === 0) {
        this.scratchProposedMask[idx] = 1;
        newlyMarkedWalkable++;
      }
    }

    const projectedDanger = this._activeWalkableDangerCount + newlyMarkedWalkable;
    const maxAllowed = Math.floor(MAX_DANGER_AREA_RATIO * this._totalWalkableTiles);

    return {
      valid: projectedDanger <= maxAllowed,
      projectedDanger,
      maxAllowed,
    };
  }

  /**
   * Validates that safe corridor tiles retain at least one connected escape component of size >= 2
   */
  public validateConnectedEscape(targetTiles: readonly number[]): boolean {
    this.scratchProposedMask.set(this.activeTileMask);
    for (let i = 0; i < targetTiles.length; i++) {
      const idx = targetTiles[i];
      if (idx >= 0 && idx < this.totalTiles) {
        this.scratchProposedMask[idx] = 1;
      }
    }

    const gen = ++this.scratchBfsGen;
    let maxComponentSize = 0;

    for (let i = 0; i < this.totalTiles; i++) {
      // Find unvisited walkable safe tile
      if (
        this.walkableMask[i] === 1 &&
        this.scratchProposedMask[i] === 0 &&
        this.scratchBfsVisited[i] !== gen
      ) {
        let head = 0;
        let tail = 0;
        this.scratchBfsQueue[tail++] = i;
        this.scratchBfsVisited[i] = gen;
        let currentSize = 0;

        while (head < tail) {
          const curr = this.scratchBfsQueue[head++];
          currentSize++;
          const cr = (curr / this.cols) | 0;
          const cc = curr % this.cols;

          // Check 4 cardinal neighbors
          const neighbors = [
            cr > 0 ? curr - this.cols : -1,
            cr < this.rows - 1 ? curr + this.cols : -1,
            cc > 0 ? curr - 1 : -1,
            cc < this.cols - 1 ? curr + 1 : -1,
          ];

          for (let n = 0; n < 4; n++) {
            const nIdx = neighbors[n];
            if (
              nIdx !== -1 &&
              this.walkableMask[nIdx] === 1 &&
              this.scratchProposedMask[nIdx] === 0 &&
              this.scratchBfsVisited[nIdx] !== gen
            ) {
              this.scratchBfsVisited[nIdx] = gen;
              this.scratchBfsQueue[tail++] = nIdx;
            }
          }
        }

        if (currentSize > maxComponentSize) {
          maxComponentSize = currentSize;
        }
      }
    }

    return maxComponentSize >= 2;
  }

  /**
   * Registers a new boss attack telegraph with 3-tier floor warnings.
   * Enforces the Fair Encounter Guarantee (>= 40% safe area).
   */
  public registerAttack(
    attackIdOrZero: number,
    targetTiles: readonly number[],
    durationMs: number = STANDARD_TOTAL_DURATION_MS,
    allowTrimming: boolean = true
  ): AttackRegistrationResult {
    if (
      !targetTiles ||
      targetTiles.length === 0 ||
      durationMs <= 0 ||
      isNaN(durationMs)
    ) {
      return { success: false, reason: 'INVALID_PARAMS' };
    }

    const attackId = attackIdOrZero > 0 ? attackIdOrZero : this.nextAttackId++;
    const validation = this.validateSafeCoverage(targetTiles);

    let tilesToRegister = targetTiles;
    if (!validation.valid) {
      if (!allowTrimming) {
        return {
          success: false,
          reason: 'EXCEEDS_SAFE_BUDGET',
          activeDangerCount: this._activeWalkableDangerCount,
          maxAllowedDanger: validation.maxAllowed,
          safeRatio: this.getSafeWalkableRatio(),
        };
      }

      // Trimming policy: retain only up to allowed budget
      const budgetRemaining = validation.maxAllowed - this._activeWalkableDangerCount;
      if (budgetRemaining <= 0) {
        return {
          success: false,
          reason: 'ZERO_BUDGET_REMAINING',
          activeDangerCount: this._activeWalkableDangerCount,
          maxAllowedDanger: validation.maxAllowed,
          safeRatio: this.getSafeWalkableRatio(),
        };
      }

      // Filter and trim tiles
      const trimmed: number[] = [];
      for (let i = 0; i < targetTiles.length && trimmed.length < budgetRemaining; i++) {
        const idx = targetTiles[i];
        if (idx >= 0 && idx < this.totalTiles && this.walkableMask[idx] === 1) {
          trimmed.push(idx);
        }
      }
      tilesToRegister = trimmed;
    }

    // Check capacity
    if (this._activeCount + tilesToRegister.length > MAX_TELEGRAPH_TILES) {
      return { success: false, reason: 'CAPACITY_EXHAUSTED' };
    }

    // Allocate and commit slots
    let registeredCount = 0;
    for (let i = 0; i < tilesToRegister.length; i++) {
      const idx = tilesToRegister[i];
      if (idx < 0 || idx >= this.totalTiles || isNaN(idx)) continue;

      const slot = this._activeCount++;
      this.activeSlots[slot] = slot;

      this.slotTileIndex[slot] = idx;
      this.slotAttackId[slot] = attackId;
      this.slotRemainingTimeMs[slot] = durationMs;
      this.slotTotalDurationMs[slot] = durationMs;
      this.slotStage[slot] =
        durationMs > DURATION_YELLOW_MS
          ? TelegraphTier.YELLOW
          : durationMs > DURATION_RED_MS
            ? TelegraphTier.AMBER
            : TelegraphTier.RED_FLASH;
      this.slotFlags[slot] = 1; // Active

      // Update spatial index
      if (this.tileRefCount[idx] === 0) {
        this.activeTileMask[idx] = 1;
        if (this.walkableMask[idx] === 1) {
          this._activeWalkableDangerCount++;
        }
      }
      this.tileRefCount[idx]++;
      registeredCount++;
    }

    this.rebuildSpatialDominance();

    return {
      success: true,
      attackId,
      registeredTileCount: registeredCount,
      activeDangerCount: this._activeWalkableDangerCount,
      safeRatio: this.getSafeWalkableRatio(),
    };
  }

  /**
   * Cancels an active attack cleanly (e.g. boss stunned or interrupted).
   * Eliminates ghost telegraphs.
   */
  public cancelAttack(attackId: number): number {
    let removed = 0;
    let i = 0;

    while (i < this._activeCount) {
      const slot = this.activeSlots[i];
      if (this.slotAttackId[slot] === attackId) {
        const idx = this.slotTileIndex[slot];

        // Decrement spatial ref
        if (this.tileRefCount[idx] > 0) {
          this.tileRefCount[idx]--;
          if (this.tileRefCount[idx] === 0) {
            this.activeTileMask[idx] = 0;
            if (this.walkableMask[idx] === 1) {
              this._activeWalkableDangerCount--;
            }
          }
        }

        // Swap and pop
        const lastSlotIdx = --this._activeCount;
        if (i < lastSlotIdx) {
          const movedSlot = this.activeSlots[lastSlotIdx];
          this.activeSlots[i] = movedSlot;

          this.slotTileIndex[slot] = this.slotTileIndex[movedSlot];
          this.slotAttackId[slot] = this.slotAttackId[movedSlot];
          this.slotRemainingTimeMs[slot] = this.slotRemainingTimeMs[movedSlot];
          this.slotTotalDurationMs[slot] = this.slotTotalDurationMs[movedSlot];
          this.slotStage[slot] = this.slotStage[movedSlot];
          this.slotFlags[slot] = this.slotFlags[movedSlot];
        }
        removed++;
      } else {
        i++;
      }
    }

    if (removed > 0) {
      this.rebuildSpatialDominance();
    }
    return removed;
  }

  /**
   * Core frame update: Advances countdown timers, transitions tiers, and triggers impacts.
   * Zero heap allocations.
   */
  public update(deltaMs: number): void {
    if (deltaMs <= 0 || isNaN(deltaMs)) return;

    let i = 0;
    while (i < this._activeCount) {
      const slot = this.activeSlots[i];
      const remaining = this.slotRemainingTimeMs[slot] - deltaMs;
      this.slotRemainingTimeMs[slot] = remaining;

      if (remaining <= 0) {
        // Impact reached!
        const tileIdx = this.slotTileIndex[slot];
        const attackId = this.slotAttackId[slot];

        if (this.onImpactCallback) {
          this.onImpactCallback(attackId, tileIdx);
        }

        // Decrement spatial ref
        if (this.tileRefCount[tileIdx] > 0) {
          this.tileRefCount[tileIdx]--;
          if (this.tileRefCount[tileIdx] === 0) {
            this.activeTileMask[tileIdx] = 0;
            if (this.walkableMask[tileIdx] === 1) {
              this._activeWalkableDangerCount--;
            }
          }
        }

        // Swap-and-pop release
        const lastSlotIdx = --this._activeCount;
        if (i < lastSlotIdx) {
          const movedSlot = this.activeSlots[lastSlotIdx];
          this.activeSlots[i] = movedSlot;

          this.slotTileIndex[slot] = this.slotTileIndex[movedSlot];
          this.slotAttackId[slot] = this.slotAttackId[movedSlot];
          this.slotRemainingTimeMs[slot] = this.slotRemainingTimeMs[movedSlot];
          this.slotTotalDurationMs[slot] = this.slotTotalDurationMs[movedSlot];
          this.slotStage[slot] = this.slotStage[movedSlot];
          this.slotFlags[slot] = this.slotFlags[movedSlot];
        }
      } else {
        // Update Stage & Locked Flag
        if (remaining > DURATION_YELLOW_MS) {
          this.slotStage[slot] = TelegraphTier.YELLOW;
        } else if (remaining > DURATION_RED_MS) {
          this.slotStage[slot] = TelegraphTier.AMBER;
          this.slotFlags[slot] |= 2; // Mark LOCKED
        } else {
          this.slotStage[slot] = TelegraphTier.RED_FLASH;
          this.slotFlags[slot] |= 2; // Locked
        }
        i++;
      }
    }

    this.rebuildSpatialDominance();
  }

  /**
   * Rebuilds spatial dominant tier and lowest remaining time for single-pass drawing.
   * O(activeCount) complexity, zero allocations.
   */
  private rebuildSpatialDominance(): void {
    this.tileDominantStage.fill(0);
    this.tileRemainingTime.fill(999999);

    for (let i = 0; i < this._activeCount; i++) {
      const slot = this.activeSlots[i];
      const idx = this.slotTileIndex[slot];
      const stg = this.slotStage[slot];
      const rem = this.slotRemainingTimeMs[slot];

      if (stg > this.tileDominantStage[idx]) {
        this.tileDominantStage[idx] = stg;
      }
      if (rem < this.tileRemainingTime[idx]) {
        this.tileRemainingTime[idx] = rem;
      }
    }
  }

  private recalculateActiveWalkableDanger(): void {
    let count = 0;
    for (let i = 0; i < this.totalTiles; i++) {
      if (this.activeTileMask[i] === 1 && this.walkableMask[i] === 1) {
        count++;
      }
    }
    this._activeWalkableDangerCount = count;
  }

  /**
   * Single-pass batched rendering to persistent Graphics layer.
   * Zero heap allocations.
   */
  public render(timeMs: number): void {
    if (!this.renderer) return;
    this.renderer.clear();

    if (this._activeCount === 0) return;

    const g = this.renderer;

    for (let idx = 0; idx < this.totalTiles; idx++) {
      if (this.activeTileMask[idx] === 0) continue;

      const stage = this.tileDominantStage[idx];
      const r = (idx / this.cols) | 0;
      const c = idx % this.cols;
      const x = c * this.tileSize;
      const y = r * this.tileSize;

      switch (stage) {
        case TelegraphTier.YELLOW: {
          // Tier 1: Soft dashed yellow border + soft yellow wash
          g.fillStyle(COLOR_YELLOW, 0.12);
          g.fillRect(x + 2, y + 2, 36, 36);

          g.lineStyle(2, COLOR_YELLOW, 0.65);
          // Dashed border (3 segments per 36px side)
          g.beginPath();
          // Top edge dashes
          g.moveTo(x + 2, y + 2);
          g.lineTo(x + 10, y + 2);
          g.moveTo(x + 14, y + 2);
          g.lineTo(x + 24, y + 2);
          g.moveTo(x + 28, y + 2);
          g.lineTo(x + 38, y + 2);
          // Bottom edge dashes
          g.moveTo(x + 2, y + 38);
          g.lineTo(x + 10, y + 38);
          g.moveTo(x + 14, y + 38);
          g.lineTo(x + 24, y + 38);
          g.moveTo(x + 28, y + 38);
          g.lineTo(x + 38, y + 38);
          // Left edge dashes
          g.moveTo(x + 2, y + 2);
          g.lineTo(x + 2, y + 10);
          g.moveTo(x + 2, y + 14);
          g.lineTo(x + 2, y + 24);
          g.moveTo(x + 2, y + 28);
          g.lineTo(x + 2, y + 38);
          // Right edge dashes
          g.moveTo(x + 38, y + 2);
          g.lineTo(x + 38, y + 10);
          g.moveTo(x + 38, y + 14);
          g.lineTo(x + 38, y + 24);
          g.moveTo(x + 38, y + 28);
          g.lineTo(x + 38, y + 38);
          g.strokePath();
          break;
        }

        case TelegraphTier.AMBER: {
          // Tier 2: 4 Hz Pulsing diagonal hatching + solid border (LOCKED)
          const pulseSin = Math.sin(timeMs * 0.0251327); // 2 * PI * 4Hz / 1000
          const fillAlpha = 0.25 + 0.15 * pulseSin; // Range: 0.10 .. 0.40
          const lineAlpha = 0.55 + 0.25 * pulseSin; // Range: 0.30 .. 0.80

          g.fillStyle(COLOR_AMBER, fillAlpha);
          g.fillRect(x + 1, y + 1, 38, 38);

          g.lineStyle(2, COLOR_AMBER, 0.85);
          g.strokeRect(x + 1, y + 1, 38, 38);

          // Diagonal 45-degree hatching lines
          g.lineStyle(1.5, COLOR_AMBER, lineAlpha);
          g.beginPath();
          g.moveTo(x + 2, y + 12);
          g.lineTo(x + 12, y + 2);
          g.moveTo(x + 2, y + 22);
          g.lineTo(x + 22, y + 2);
          g.moveTo(x + 2, y + 32);
          g.lineTo(x + 32, y + 2);
          g.moveTo(x + 8, y + 38);
          g.lineTo(x + 38, y + 8);
          g.moveTo(x + 18, y + 38);
          g.lineTo(x + 38, y + 18);
          g.moveTo(x + 28, y + 38);
          g.lineTo(x + 38, y + 28);
          g.strokePath();
          break;
        }

        case TelegraphTier.RED_FLASH: {
          // Tier 3: 8 Hz Rapid crimson strobe + bold ruby border
          const isWhiteStrobe = (((timeMs * 0.016) | 0) & 1) === 1;

          if (isWhiteStrobe) {
            g.fillStyle(COLOR_WHITE_FLASH, 0.85);
            g.lineStyle(3, COLOR_RUBY_STROKE, 1.0);
          } else {
            g.fillStyle(COLOR_RED, 0.8);
            g.lineStyle(3, COLOR_RUBY_STROKE, 0.95);
          }

          g.fillRect(x, y, 40, 40);
          g.strokeRect(x + 1.5, y + 1.5, 37, 37);

          // Center hazard diamond pip
          g.fillStyle(isWhiteStrobe ? COLOR_RED : COLOR_WHITE_FLASH, 0.9);
          g.beginPath();
          g.moveTo(x + 20, y + 12);
          g.lineTo(x + 28, y + 20);
          g.lineTo(x + 20, y + 28);
          g.lineTo(x + 12, y + 20);
          g.strokePath();
          break;
        }
      }
    }
  }

  /**
   * Resets all state and clears buffers.
   */
  public reset(): void {
    this._activeCount = 0;
    this._activeWalkableDangerCount = 0;
    this.activeTileMask.fill(0);
    this.tileRefCount.fill(0);
    this.tileDominantStage.fill(0);
    this.tileRemainingTime.fill(999999);
    if (this.renderer) {
      this.renderer.clear();
    }
  }

  // Public Query APIs
  public isTileDangerous(r: number, c: number): boolean {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols || isNaN(r) || isNaN(c)) return false;
    return this.activeTileMask[r * this.cols + c] !== 0;
  }

  public isIdxDangerous(idx: number): boolean {
    if (idx < 0 || idx >= this.totalTiles || isNaN(idx)) return false;
    return this.activeTileMask[idx] !== 0;
  }

  public getTileTier(r: number, c: number): TelegraphTier {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols || isNaN(r) || isNaN(c))
      return TelegraphTier.NONE;
    return this.tileDominantStage[r * this.cols + c] as TelegraphTier;
  }

  public getTileRemainingTime(r: number, c: number): number {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols || isNaN(r) || isNaN(c)) return 0;
    const time = this.tileRemainingTime[r * this.cols + c];
    return time < 999000 ? time : 0;
  }
}
