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
  SerializedCrisisState,
  ICrisis,
} from './CrisisTypes.ts';
import { ROWS, COLS, TOTAL_TILES, coordToIdx } from '../pathfinding.ts';

export abstract class BaseCrisis implements ICrisis {
  public readonly id: CrisisType;
  public get type(): CrisisType {
    return this.id;
  }
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
  protected activeHazardList: HazardTile[];
  protected activeHazardCount: number = 0;

  // Objectives and Alerts
  protected objectives: CrisisObjective[] = [];
  protected activeAlert: CrisisThreatAlert | null = null;
  private readonly cachedAlert: CrisisThreatAlert;

  // Outcome flags
  protected isVictorious: boolean = false;
  protected isDefeated: boolean = false;

  // Pre-allocated CrisisStatus to eliminate per-frame heap allocations
  protected readonly cachedStatus: CrisisStatus;
  protected cachedSummary: string = '';

  // Scratch active slice to eliminate per-frame GC churn in 60 FPS update loops
  private readonly scratchActiveSlice: HazardTile[];

  constructor(id: CrisisType) {
    this.id = id;
    this.definition = CRISIS_DEFINITIONS[id];
    this.name = this.definition.name;
    this.icon = this.definition.icon;
    this.themeColor = this.definition.themeColor;

    this.cachedSummary = `${this.name} (${CrisisStage.INACTIVE})`;

    this.cachedAlert = {
      id: '',
      title: '',
      message: '',
      level: 'warning',
      icon: '⚠️',
      durationMs: 0,
      remainingMs: 0,
    };

    this.cachedStatus = {
      isActive: false,
      crisisType: this.id,
      stage: CrisisStage.INACTIVE,
      threatMeter: 0,
      threatTrend: 'stable',
      stageElapsedMs: 0,
      stageDurationMs: 0,
      stageRemainingMs: 0,
      objectives: this.objectives,
      activeAlert: null,
      hazardTileCount: 0,
      isVictorious: false,
      isDefeated: false,
      summary: this.cachedSummary,
    };

    // Pre-allocate 195 tile descriptors and flat reusable buffers
    this.hazardTileBuffer = new Array<HazardTile>(TOTAL_TILES);
    this.activeHazardList = new Array<HazardTile>(TOTAL_TILES);
    this.scratchActiveSlice = new Array<HazardTile>(TOTAL_TILES);
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

    this.cachedSummary = `${this.name} (${this.stage})`;
    this.onInit();
    this.onStageEnter(CrisisStage.WHISPERS);
  }

  public start(): void {
    this.init();
  }

  public setStage(stage: CrisisStage): void {
    this.transitionToStage(stage);
  }

  public isCrisisVictorious(): boolean {
    return this.isVictorious;
  }

  public update(deltaMs: number, playerPos?: { r: number; c: number; x?: number; y?: number }): void {
    if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || Number.isNaN(deltaMs) || deltaMs < 0) {
      deltaMs = 0;
    }
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
    this.cachedSummary = `${this.name} (${this.stage})`;

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

  public resolveCrisis(victoryMessage?: string): void {
    if (this.stage === CrisisStage.RESOLVED) return;
    this.transitionToStage(CrisisStage.RESOLVED);
    const msg = victoryMessage || 'Crisis successfully stabilized!';
    this.triggerAlert('resolved', 'CRISIS STABILIZED', msg, 'info', '✨', 5000);
  }

  public failCrisis(failureMessage?: string): void {
    if (this.stage === CrisisStage.FAILED) return;
    this.transitionToStage(CrisisStage.FAILED);
    const msg = failureMessage || 'Catastrophic failure: Area consumed!';
    this.triggerAlert('failed', 'CRISIS UNCONTAINED', msg, 'critical', '💀', 5000);
  }

  public handleBombBlast(r: number, c: number, radius: number = 1): void {
    if (this.stage === CrisisStage.INACTIVE || this.stage === CrisisStage.RESOLVED || this.stage === CrisisStage.FAILED) {
      return;
    }
    this.onBombBlast(r, c, radius);
  }

  public resolveObjective(objectiveId: string, value?: number): void {
    if (this.stage === CrisisStage.INACTIVE || this.stage === CrisisStage.RESOLVED || this.stage === CrisisStage.FAILED) {
      return;
    }
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
    const s = this.cachedStatus;
    s.isActive = this.stage !== CrisisStage.INACTIVE;
    s.crisisType = this.id;
    s.stage = this.stage;
    s.threatMeter = Number.isFinite(this.threatMeter) ? this.threatMeter : 0;
    s.threatTrend = this.threatTrend;
    s.stageElapsedMs = Number.isFinite(this.stageElapsedMs) ? this.stageElapsedMs : 0;
    s.stageDurationMs = Number.isFinite(this.stageDurationMs) ? this.stageDurationMs : 0;
    s.stageRemainingMs = Math.max(0, Number.isFinite(this.stageDurationMs - this.stageElapsedMs) ? this.stageDurationMs - this.stageElapsedMs : 0);
    s.objectives = this.objectives;
    s.activeAlert = this.activeAlert;
    s.hazardTileCount = this.activeHazardCount;
    s.isVictorious = this.isVictorious;
    s.isDefeated = this.isDefeated;
    s.summary = this.cachedSummary;
    return s;
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
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return null;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return null;
    const idx = ir * COLS + ic;
    const tile = this.hazardTileBuffer[idx];

    if (type === HazardType.NONE) {
      if (tile.type !== HazardType.NONE) {
        this.clearHazardTile(ir, ic);
      }
      return tile;
    }

    const wasActive = tile.type !== HazardType.NONE;
    tile.type = type;
    tile.intensity = Math.max(0, Math.min(1, intensity));
    tile.durationMs = durationMs;
    tile.remainingMs = durationMs;
    tile.data = data;

    if (!wasActive) {
      if (this.activeHazardCount < TOTAL_TILES) {
        this.activeHazardList[this.activeHazardCount++] = tile;
      }
    }

    return tile;
  }

  public clearHazardTile(r: number, c: number): void {
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return;
    const idx = ir * COLS + ic;
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
    this.scratchActiveSlice.length = 0;
  }

  public isTileHazardous(r: number, c: number): boolean {
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return false;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return false;
    const idx = ir * COLS + ic;
    return this.hazardTileBuffer[idx].type !== HazardType.NONE;
  }

  public getHazardAt(r: number, c: number): HazardTile | null {
    if (typeof r !== 'number' || typeof c !== 'number' || !Number.isFinite(r) || !Number.isFinite(c)) return null;
    const ir = r | 0;
    const ic = c | 0;
    if (ir < 0 || ir >= ROWS || ic < 0 || ic >= COLS) return null;
    const idx = ir * COLS + ic;
    const tile = this.hazardTileBuffer[idx];
    return tile.type !== HazardType.NONE ? tile : null;
  }

  public getActiveHazardTiles(): HazardTile[] {
    // Return recycled scratch slice without allocating new arrays on each frame
    this.scratchActiveSlice.length = this.activeHazardCount;
    for (let i = 0; i < this.activeHazardCount; i++) {
      this.scratchActiveSlice[i] = this.activeHazardList[i];
    }
    return this.scratchActiveSlice;
  }

  public getActiveHazardCount(): number {
    return this.activeHazardCount;
  }

  // --- Threat, Objectives & Alerts Helpers ---

  public setThreat(value: number): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
      value = 0;
    }
    this.threatMeter = Math.max(0, Math.min(100, value));
  }

  public adjustThreat(delta: number): void {
    if (typeof delta !== 'number' || !Number.isFinite(delta) || Number.isNaN(delta)) {
      delta = 0;
    }
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
    const alert = this.cachedAlert;
    alert.id = id;
    alert.title = title;
    alert.message = message;
    alert.level = level;
    alert.icon = icon;
    alert.durationMs = durationMs;
    alert.remainingMs = durationMs;
    this.activeAlert = alert;
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
    this.cachedSummary = `${this.name} (${this.stage})`;
    this.onReset();
  }

  public serialize(): SerializedCrisisState {
    const activeHazards: HazardTile[] = [];
    for (let i = 0; i < this.activeHazardCount; i++) {
      const h = this.activeHazardList[i];
      activeHazards.push({
        idx: h.idx,
        r: h.r,
        c: h.c,
        type: h.type,
        intensity: h.intensity,
        durationMs: h.durationMs,
        remainingMs: h.remainingMs,
        data: h.data,
      });
    }

    const objectivesCopy: CrisisObjective[] = this.objectives.map((obj) => ({
      id: obj.id,
      title: obj.title,
      description: obj.description,
      targetCount: obj.targetCount,
      currentCount: obj.currentCount,
      isCompleted: obj.isCompleted,
      isFailed: obj.isFailed,
      timeLimitMs: obj.timeLimitMs,
      remainingTimeMs: obj.remainingTimeMs,
    }));

    const alertCopy: CrisisThreatAlert | null = this.activeAlert
      ? {
          id: this.activeAlert.id,
          title: this.activeAlert.title,
          message: this.activeAlert.message,
          level: this.activeAlert.level,
          icon: this.activeAlert.icon,
          durationMs: this.activeAlert.durationMs,
          remainingMs: this.activeAlert.remainingMs,
        }
      : null;

    return {
      crisisType: this.id,
      stage: this.stage,
      stageElapsedMs: this.stageElapsedMs,
      stageDurationMs: this.stageDurationMs,
      threatMeter: this.threatMeter,
      threatTrend: this.threatTrend,
      objectives: objectivesCopy,
      activeAlert: alertCopy,
      hazardTiles: activeHazards,
      totalCrisesResolved: 0,
      isVictorious: this.isVictorious,
      isDefeated: this.isDefeated,
      extraState: this.getExtraSerializedState ? this.getExtraSerializedState() : undefined,
    };
  }

  public deserialize(state: Partial<SerializedCrisisState>): void {
    if (!state || typeof state !== 'object') return;

    this.stage = state.stage || CrisisStage.INACTIVE;
    this.stageElapsedMs = typeof state.stageElapsedMs === 'number' && Number.isFinite(state.stageElapsedMs)
      ? Math.max(0, state.stageElapsedMs)
      : 0;
    this.stageDurationMs = typeof state.stageDurationMs === 'number' && Number.isFinite(state.stageDurationMs)
      ? Math.max(0, state.stageDurationMs)
      : (this.definition.stageDurations[this.stage as keyof typeof this.definition.stageDurations] || 0);
    this.threatMeter = typeof state.threatMeter === 'number' && Number.isFinite(state.threatMeter)
      ? Math.max(0, Math.min(100, state.threatMeter))
      : 0;
    this.threatTrend = state.threatTrend || 'stable';
    this.isVictorious = Boolean(state.isVictorious);
    this.isDefeated = Boolean(state.isDefeated);

    if (Array.isArray(state.objectives)) {
      this.objectives = state.objectives.map((o) => ({
        id: String(o.id || ''),
        title: String(o.title || ''),
        description: String(o.description || ''),
        targetCount: typeof o.targetCount === 'number' && Number.isFinite(o.targetCount) ? Math.max(0, o.targetCount) : 0,
        currentCount: typeof o.currentCount === 'number' && Number.isFinite(o.currentCount) ? Math.max(0, o.currentCount) : 0,
        isCompleted: Boolean(o.isCompleted),
        isFailed: Boolean(o.isFailed),
        timeLimitMs: typeof o.timeLimitMs === 'number' && Number.isFinite(o.timeLimitMs) ? o.timeLimitMs : undefined,
        remainingTimeMs: typeof o.remainingTimeMs === 'number' && Number.isFinite(o.remainingTimeMs) ? o.remainingTimeMs : undefined,
      }));
    }

    if (state.activeAlert && typeof state.activeAlert === 'object') {
      this.activeAlert = {
        id: String(state.activeAlert.id || ''),
        title: String(state.activeAlert.title || ''),
        message: String(state.activeAlert.message || ''),
        level: state.activeAlert.level || 'warning',
        icon: String(state.activeAlert.icon || '⚠️'),
        durationMs: typeof state.activeAlert.durationMs === 'number' && Number.isFinite(state.activeAlert.durationMs) ? state.activeAlert.durationMs : 3500,
        remainingMs: typeof state.activeAlert.remainingMs === 'number' && Number.isFinite(state.activeAlert.remainingMs) ? state.activeAlert.remainingMs : 3500,
      };
    } else {
      this.activeAlert = null;
    }

    this.clearAllHazards();
    if (Array.isArray(state.hazardTiles)) {
      for (const h of state.hazardTiles) {
        if (h && typeof h.r === 'number' && typeof h.c === 'number') {
          this.setHazardTile(h.r, h.c, h.type, h.intensity, h.remainingMs ?? h.durationMs, h.data);
        }
      }
    }

    if (state.extraState && typeof state.extraState === 'object' && this.applyExtraSerializedState) {
      this.applyExtraSerializedState(state.extraState);
    }
  }

  protected getExtraSerializedState?(): Record<string, unknown>;
  protected applyExtraSerializedState?(extra: Record<string, unknown>): void;

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
