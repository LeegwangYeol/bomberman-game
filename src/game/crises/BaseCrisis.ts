/**
 * BaseCrisis.ts — Base class for all 6 Stellaris-Style Map Crises
 * Implements 3-Stage FSM, Threat Meter, Zero-GC Hazard Buffers, and Objectives.
 */

import {
  CrisisType,
  CrisisStage,
  HazardType,
  CRISIS_DEFINITIONS,
} from './CrisisTypes.ts';
import type {
  HazardTile,
  CrisisObjective,
  CrisisThreatAlert,
  CrisisStatus,
  CrisisDefinition,
  ICrisis,
} from './CrisisTypes.ts';
import { ROWS, COLS, TOTAL_TILES, coordToIdx } from '../pathfinding.ts';

export abstract class BaseCrisis implements ICrisis {
  public readonly id: CrisisType;
  public readonly name: string;
  public readonly icon: string;
  public readonly themeColor: string;
  public readonly definition: CrisisDefinition;

  protected stage: CrisisStage = CrisisStage.INACTIVE;
  protected stageElapsedMs: number = 0;
  protected stageDurationMs: number = 0;
  protected threatMeter: number = 0;
  protected threatTrend: 'stable' | 'rising' | 'critical' | 'declining' = 'stable';
  protected lastThreatValue: number = 0;

  // Pre-allocated flat buffer of 195 HazardTiles for Zero-GC
  protected hazardTileBuffer: HazardTile[];
  protected activeHazardList: HazardTile[] = [];
  protected activeHazardCount: number = 0;

  // Objectives and Alerts
  protected objectives: CrisisObjective[] = [];
  protected activeAlert: CrisisThreatAlert | null = null;

  // Outcome flags
  protected isVictorious: boolean = false;
  protected isDefeated: boolean = false;

  constructor(id: CrisisType) {
    this.id = id;
    this.definition = CRISIS_DEFINITIONS[id];
    this.name = this.definition.name;
    this.icon = this.definition.icon;
    this.themeColor = this.definition.themeColor;

    // Pre-allocate 195 tile descriptors
    this.hazardTileBuffer = new Array<HazardTile>(TOTAL_TILES);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = coordToIdx(r, c);
        this.hazardTileBuffer[idx] = {
          idx,
          r,
          c,
          type: HazardType.NONE,
          intensity: 0,
          durationMs: 0,
          remainingMs: 0,
          data: 0,
        };
      }
    }
  }

  public getStage(): CrisisStage {
    return this.stage;
  }

  public getThreat(): number {
    return this.threatMeter;
  }

  public getObjectives(): CrisisObjective[] {
    return this.objectives;
  }

  public getActiveAlert(): CrisisThreatAlert | null {
    return this.activeAlert;
  }

  public init(): void {
    this.stage = CrisisStage.WHISPERS;
    this.stageElapsedMs = 0;
    this.stageDurationMs = this.definition.stageDurations[CrisisStage.WHISPERS];
    this.threatMeter = 10;
    this.threatTrend = 'rising';
    this.lastThreatValue = 10;
    this.isVictorious = false;
    this.isDefeated = false;
    this.clearAllHazards();
    this.objectives = [];
    this.activeAlert = null;

    this.onInit();
    this.onStageEnter(CrisisStage.WHISPERS);
  }

  public update(deltaMs: number, playerPos?: { r: number; c: number; x?: number; y?: number }): void {
    if (this.stage === CrisisStage.INACTIVE || this.stage === CrisisStage.RESOLVED || this.stage === CrisisStage.FAILED) {
      return;
    }

    this.stageElapsedMs += deltaMs;

    // Tick active alert
    if (this.activeAlert) {
      this.activeAlert.remainingMs -= deltaMs;
      if (this.activeAlert.remainingMs <= 0) {
        this.activeAlert = null;
      }
    }

    // Tick hazard tiles
    for (let i = 0; i < this.activeHazardCount; i++) {
      const tile = this.activeHazardList[i];
      if (tile.durationMs > 0) {
        tile.remainingMs -= deltaMs;
        if (tile.remainingMs <= 0) {
          this.clearHazardTile(tile.r, tile.c);
          i--; // Adjust index since clearHazardTile compresses activeHazardList
        }
      }
    }

    // Subclass update logic
    this.onUpdate(deltaMs, playerPos);

    // Natural Stage Progression
    if (this.stage === CrisisStage.WHISPERS && this.stageElapsedMs >= this.stageDurationMs) {
      this.transitionToStage(CrisisStage.OUTBREAK);
    } else if (this.stage === CrisisStage.OUTBREAK && this.stageElapsedMs >= this.stageDurationMs) {
      this.transitionToStage(CrisisStage.CLIMAX);
    } else if (this.stage === CrisisStage.CLIMAX && this.stageElapsedMs >= this.stageDurationMs) {
      // If climax timer runs out and objectives not resolved, crisis fails!
      if (!this.isVictorious) {
        this.failCrisis('Climax countdown expired before crisis was stabilized.');
      }
    }

    // Update Threat Trend
    if (this.threatMeter > this.lastThreatValue + 0.1) {
      this.threatTrend = this.threatMeter >= 85 ? 'critical' : 'rising';
    } else if (this.threatMeter < this.lastThreatValue - 0.1) {
      this.threatTrend = 'declining';
    } else {
      this.threatTrend = this.threatMeter >= 85 ? 'critical' : 'stable';
    }
    this.lastThreatValue = this.threatMeter;
  }

  public transitionToStage(newStage: CrisisStage): void {
    if (this.stage === newStage) return;
    this.stage = newStage;
    this.stageElapsedMs = 0;

    if (newStage === CrisisStage.OUTBREAK) {
      this.stageDurationMs = this.definition.stageDurations[CrisisStage.OUTBREAK];
      this.setThreat(Math.max(35, this.threatMeter));
    } else if (newStage === CrisisStage.CLIMAX) {
      this.stageDurationMs = this.definition.stageDurations[CrisisStage.CLIMAX];
      this.setThreat(Math.max(70, this.threatMeter));
    } else if (newStage === CrisisStage.RESOLVED) {
      this.stageDurationMs = 0;
      this.isVictorious = true;
      this.setThreat(0);
      this.threatTrend = 'declining';
    } else if (newStage === CrisisStage.FAILED) {
      this.stageDurationMs = 0;
      this.isDefeated = true;
      this.setThreat(100);
      this.threatTrend = 'critical';
    }

    this.onStageEnter(newStage);
  }

  public resolveCrisis(victoryMessage: string = 'Crisis successfully stabilized!'): void {
    this.transitionToStage(CrisisStage.RESOLVED);
    this.triggerAlert('resolved', 'CRISIS STABILIZED', victoryMessage, 'info', '✨', 5000);
  }

  public failCrisis(failMessage: string = 'Catastrophic failure: Area consumed!'): void {
    this.transitionToStage(CrisisStage.FAILED);
    this.triggerAlert('failed', 'CRISIS UNCONTAINED', failMessage, 'critical', '💀', 5000);
  }

  public handleBombBlast(r: number, c: number, radius: number = 1): void {
    if (this.stage === CrisisStage.INACTIVE || this.stage === CrisisStage.RESOLVED || this.stage === CrisisStage.FAILED) {
      return;
    }
    this.onBombBlast(r, c, radius);
  }

  public resolveObjective(objectiveId: string, value?: number): void {
    const obj = this.objectives.find((o) => o.id === objectiveId);
    if (!obj) return;

    if (value !== undefined) {
      obj.currentCount = Math.min(obj.targetCount, value);
    } else {
      obj.currentCount = Math.min(obj.targetCount, obj.currentCount + 1);
    }

    if (obj.currentCount >= obj.targetCount) {
      obj.isCompleted = true;
    }

    this.onResolveObjective(objectiveId, value);
  }

  public getStatus(): CrisisStatus {
    return {
      isActive: this.stage !== CrisisStage.INACTIVE,
      crisisType: this.id,
      stage: this.stage,
      threatMeter: this.threatMeter,
      threatTrend: this.threatTrend,
      stageElapsedMs: this.stageElapsedMs,
      stageDurationMs: this.stageDurationMs,
      stageRemainingMs: Math.max(0, this.stageDurationMs - this.stageElapsedMs),
      objectives: this.objectives,
      activeAlert: this.activeAlert,
      hazardTileCount: this.activeHazardCount,
      isVictorious: this.isVictorious,
      isDefeated: this.isDefeated,
      summary: `${this.name} (${this.stage})`,
    };
  }

  // --- Zero-GC Hazard Management ---

  public setHazardTile(
    r: number,
    c: number,
    type: HazardType,
    intensity: number = 1.0,
    durationMs: number = 0,
    data: number = 0
  ): HazardTile | null {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    const idx = coordToIdx(r, c);
    const tile = this.hazardTileBuffer[idx];

    const wasActive = tile.type !== HazardType.NONE;
    tile.type = type;
    tile.intensity = Math.max(0, Math.min(1, intensity));
    tile.durationMs = durationMs;
    tile.remainingMs = durationMs;
    tile.data = data;

    if (!wasActive && type !== HazardType.NONE) {
      this.activeHazardList[this.activeHazardCount++] = tile;
    }

    return tile;
  }

  public clearHazardTile(r: number, c: number): void {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const idx = coordToIdx(r, c);
    const tile = this.hazardTileBuffer[idx];
    if (tile.type === HazardType.NONE) return;

    tile.type = HazardType.NONE;
    tile.intensity = 0;
    tile.durationMs = 0;
    tile.remainingMs = 0;
    tile.data = 0;

    // Swap-and-pop removal in activeHazardList for O(1) Zero-GC release
    for (let i = 0; i < this.activeHazardCount; i++) {
      if (this.activeHazardList[i].idx === idx) {
        this.activeHazardCount--;
        this.activeHazardList[i] = this.activeHazardList[this.activeHazardCount];
        break;
      }
    }
  }

  public clearAllHazards(): void {
    for (let i = 0; i < this.activeHazardCount; i++) {
      const tile = this.activeHazardList[i];
      tile.type = HazardType.NONE;
      tile.intensity = 0;
      tile.durationMs = 0;
      tile.remainingMs = 0;
      tile.data = 0;
    }
    this.activeHazardCount = 0;
  }

  public isTileHazardous(r: number, c: number): boolean {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const idx = coordToIdx(r, c);
    return this.hazardTileBuffer[idx].type !== HazardType.NONE;
  }

  public getHazardAt(r: number, c: number): HazardTile | null {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    const idx = coordToIdx(r, c);
    const tile = this.hazardTileBuffer[idx];
    return tile.type !== HazardType.NONE ? tile : null;
  }

  public getActiveHazardTiles(): HazardTile[] {
    // Return active slice without allocating new arrays on each frame
    return this.activeHazardList.slice(0, this.activeHazardCount);
  }

  public getActiveHazardCount(): number {
    return this.activeHazardCount;
  }

  // --- Threat, Objectives & Alerts Helpers ---

  public setThreat(value: number): void {
    this.threatMeter = Math.max(0, Math.min(100, value));
  }

  public adjustThreat(delta: number): void {
    this.setThreat(this.threatMeter + delta);
  }

  public triggerAlert(
    id: string,
    title: string,
    message: string,
    level: 'info' | 'warning' | 'danger' | 'critical' = 'warning',
    icon: string = '⚠️',
    durationMs: number = 3500
  ): void {
    this.activeAlert = {
      id,
      title,
      message,
      level,
      icon,
      durationMs,
      remainingMs: durationMs,
    };
  }

  public reset(): void {
    this.stage = CrisisStage.INACTIVE;
    this.stageElapsedMs = 0;
    this.stageDurationMs = 0;
    this.threatMeter = 0;
    this.threatTrend = 'stable';
    this.isVictorious = false;
    this.isDefeated = false;
    this.clearAllHazards();
    this.objectives = [];
    this.activeAlert = null;
    this.onReset();
  }

  protected onReset(): void {
    // Reinitialize subclass state (timers, pending craters, counts, etc.)
    this.onInit();
    // Keep objectives empty while crisis remains INACTIVE
    this.objectives = [];
  }

  // Helper grid bounds checks
  protected isPerimeter(r: number, c: number): boolean {
    return r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
  }

  protected isPillar(r: number, c: number): boolean {
    return r % 2 === 0 && c % 2 === 0;
  }

  protected isWalkableTile(r: number, c: number): boolean {
    return !this.isPerimeter(r, c) && !this.isPillar(r, c);
  }

  // Abstract hooks for subclasses
  protected abstract onInit(): void;
  protected abstract onStageEnter(stage: CrisisStage): void;
  protected abstract onUpdate(deltaMs: number, playerPos?: { r: number; c: number; x?: number; y?: number }): void;
  protected abstract onBombBlast(r: number, c: number, radius: number): void;
  protected abstract onResolveObjective(objectiveId: string, value?: number): void;
}
