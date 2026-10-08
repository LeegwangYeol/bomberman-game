/**
 * CrisisManager.ts — 3-Stage FSM, Threat Meter & Objective Orchestrator
 *
 * Manages all 6 Stellaris-Style Crises, hazard indexing, threat metrics,
 * and interface contracts with GameScene and Situation Log HUD.
 */

import {
  CrisisType,
  CrisisStage,
} from './CrisisTypes.ts';
import type {
  CrisisStatus,
  HazardTile,
  SituationLogState,
  SerializedCrisisState,
  CrisisObjective,
  ICrisis,
} from './CrisisTypes.ts';
import type { IGameEventEmitter } from './SituationLog.ts';
export type { IGameEventEmitter };
import { VoidCrisis } from './VoidCrisis.ts';
import { ClockworkCrisis } from './ClockworkCrisis.ts';
import { OrbitalCrisis } from './OrbitalCrisis.ts';
import { SolarFlareCrisis } from './SolarFlareCrisis.ts';
import { LavaCrisis } from './LavaCrisis.ts';
import { RiftCrisis } from './RiftCrisis.ts';
import { PsychicCrisis } from './PsychicCrisis.ts';

const STAGE_NAMES: Record<CrisisStage, string> = Object.freeze({
  [CrisisStage.INACTIVE]: 'Inactive',
  [CrisisStage.WHISPERS]: 'Stage 1: Whispers (Buildup)',
  [CrisisStage.OUTBREAK]: 'Stage 2: Outbreak (Escalation)',
  [CrisisStage.CLIMAX]: 'Stage 3: Climax (Resolution)',
  [CrisisStage.RESOLVED]: 'Stabilized (Victory)',
  [CrisisStage.FAILED]: 'Catastrophic Collapse (Failed)',
});

export class CrisisManager {
  private crisesRegistry: Map<CrisisType, ICrisis> = new Map();
  private activeCrisis: ICrisis | null = null;
  private totalCrisesResolved: number = 0;
  private hasCountedResolution: boolean = false;
  private previousStage: CrisisStage = CrisisStage.INACTIVE;

  // Robust Event Decoupling & Emitter Bridge
  private eventEmitter: IGameEventEmitter | null = null;
  private readonly listeners: Map<string, Set<(payload: unknown) => void>> = new Map();

  // Pre-allocated empty arrays and status objects to guarantee Zero-GC
  private readonly emptyObjectives: CrisisObjective[] = [];
  private readonly emptyHazardTiles: HazardTile[] = [];

  private readonly cachedDefaultStatus: CrisisStatus = {
    isActive: false,
    crisisType: null,
    stage: CrisisStage.INACTIVE,
    threatMeter: 0,
    threatTrend: 'stable',
    stageElapsedMs: 0,
    stageDurationMs: 0,
    stageRemainingMs: 0,
    objectives: this.emptyObjectives,
    activeAlert: null,
    hazardTileCount: 0,
    isVictorious: false,
    isDefeated: false,
    summary: 'No active crisis',
  };

  private readonly cachedSituationLogState: SituationLogState = {
    isActive: false,
    crisisId: '',
    crisisName: '',
    crisisIcon: '',
    themeColor: '#6B7280',
    stage: CrisisStage.INACTIVE,
    stageName: 'Inactive',
    threatLevel: 0,
    threatTrend: 'stable',
    stageRemainingMs: 0,
    totalDurationMs: 0,
    elapsedMs: 0,
    objectives: this.emptyObjectives,
    activeAlert: null,
    hazardCount: 0,
    statusDescription: 'No active planetary crisis detected.',
    isVictorious: false,
    isDefeated: false,
  };

  constructor(eventEmitter: IGameEventEmitter | null = null) {
    this.eventEmitter = eventEmitter;
    this.registerCrises();
  }

  public setEventEmitter(emitter: IGameEventEmitter | null): void {
    this.eventEmitter = emitter;
  }

  public getEventEmitter(): IGameEventEmitter | null {
    return this.eventEmitter;
  }

  public on(event: string, listener: (payload: unknown) => void): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  public off(event: string, listener: (payload: unknown) => void): this {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
    return this;
  }

  public emit(event: string, payload?: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(payload);
      }
    }
    if (this.eventEmitter && this.eventEmitter.events) {
      this.eventEmitter.events.emit(event, payload);
    }
  }

  private registerCrises(): void {
    this.crisesRegistry.set(CrisisType.PASTEL_VOID, new VoidCrisis());
    this.crisesRegistry.set(CrisisType.CLOCKWORK_REBELLION, new ClockworkCrisis());
    this.crisesRegistry.set(CrisisType.ORBITAL_BOMBARDMENT, new OrbitalCrisis());
    this.crisesRegistry.set(CrisisType.SOLAR_FLARES, new SolarFlareCrisis());
    this.crisesRegistry.set(CrisisType.CREEPING_LAVA, new LavaCrisis());
    this.crisesRegistry.set(CrisisType.DIMENSIONAL_RIFTS, new RiftCrisis());
    this.crisesRegistry.set(CrisisType.PSYCHIC_INVASION, new PsychicCrisis());
  }

  public triggerCrisis(type: CrisisType): void {
    // If a crisis is already active, reset it cleanly before triggering new one
    if (this.activeCrisis) {
      this.activeCrisis.reset();
    }

    const crisis = this.crisesRegistry.get(type);
    if (!crisis) {
      throw new Error(`Unknown crisis type: ${type}`);
    }

    this.hasCountedResolution = false;
    this.activeCrisis = crisis;
    this.activeCrisis.init();
    this.previousStage = CrisisStage.WHISPERS;
    this.emit('crisis-triggered', { crisisType: type, crisisName: crisis.name });
  }

  public getStatus(): CrisisStatus {
    return this.activeCrisis ? this.activeCrisis.getStatus() : this.cachedDefaultStatus;
  }

  public update(deltaMs: number, playerPos?: { r: number; c: number; x?: number; y?: number }): CrisisStatus {
    if (!this.activeCrisis) {
      return this.cachedDefaultStatus;
    }

    this.activeCrisis.update(deltaMs, playerPos);
    const status = this.activeCrisis.getStatus();

    if (status.stage !== this.previousStage) {
      this.emit('crisis-stage-changed', {
        crisisType: status.crisisType,
        stage: status.stage,
        previousStage: this.previousStage,
      });
      this.previousStage = status.stage;
    }

    if (status.isVictorious && status.stage === CrisisStage.RESOLVED) {
      if (!this.hasCountedResolution) {
        this.totalCrisesResolved++;
        this.hasCountedResolution = true;
        this.emit('crisis-resolved', {
          crisisType: status.crisisType,
          totalCrisesResolved: this.totalCrisesResolved,
        });
      }
    } else if (status.isDefeated && status.stage === CrisisStage.FAILED) {
      this.emit('crisis-failed', {
        crisisType: status.crisisType,
      });
    }

    return status;
  }

  public resolveObjective(objectiveId: string, value?: number): void {
    if (this.activeCrisis) {
      this.activeCrisis.resolveObjective(objectiveId, value);
      this.emit('crisis-objective-resolved', { objectiveId, value });
    }
  }

  public handleBombBlast(r: number, c: number, radius: number = 1): void {
    if (this.activeCrisis) {
      this.activeCrisis.handleBombBlast(r, c, radius);
      this.emit('crisis-bomb-blast', { r, c, radius });
    }
  }

  public onBombBlast(r: number, c: number, radius: number = 1): void {
    this.handleBombBlast(r, c, radius);
  }

  public dispelPsionicIllusionAt(r: number, c: number): boolean {
    if (this.activeCrisis && this.activeCrisis.id === CrisisType.PSYCHIC_INVASION) {
      const psychic = this.activeCrisis as PsychicCrisis;
      if (typeof psychic.dispelIllusionAt === 'function') {
        return psychic.dispelIllusionAt(r, c);
      }
    }
    return false;
  }

  public getActiveHazardTiles(): HazardTile[] {
    return this.activeCrisis ? this.activeCrisis.getActiveHazardTiles() : this.emptyHazardTiles;
  }

  public isTileHazardous(r: number, c: number): boolean {
    return this.activeCrisis ? this.activeCrisis.isTileHazardous(r, c) : false;
  }

  public getHazardAt(r: number, c: number): HazardTile | null {
    return this.activeCrisis ? this.activeCrisis.getHazardAt(r, c) : null;
  }

  public getActiveCrisis(): ICrisis | null {
    return this.activeCrisis;
  }

  public getCurrentCrisisType(): CrisisType | null {
    return this.activeCrisis ? this.activeCrisis.id : null;
  }

  public getStage(): CrisisStage {
    return this.activeCrisis ? this.activeCrisis.getStage() : CrisisStage.INACTIVE;
  }

  public getThreatMeter(): number {
    return this.activeCrisis ? this.activeCrisis.getThreat() : 0;
  }

  public getRegisteredCrisisTypes(): CrisisType[] {
    return Array.from(this.crisesRegistry.keys());
  }

  public hasCrisis(type: CrisisType): boolean {
    return this.crisesRegistry.has(type);
  }

  public getCrisis(type: CrisisType): ICrisis | undefined {
    return this.crisesRegistry.get(type);
  }

  public triggerRandomCrisis(excludeCurrent: boolean = true): CrisisType {
    const types = Array.from(this.crisesRegistry.keys());
    const candidates = excludeCurrent && this.activeCrisis
      ? types.filter((t) => t !== this.activeCrisis?.id)
      : types;
    const pool = candidates.length > 0 ? candidates : types;
    const chosen = pool[Math.floor(Math.random() * pool.length)] ?? CrisisType.PASTEL_VOID;
    this.triggerCrisis(chosen);
    return chosen;
  }

  public getTotalCrisesResolved(): number {
    return this.totalCrisesResolved;
  }

  public resolveCrisis(victoryMessage?: string): void {
    if (this.activeCrisis) {
      const type = this.activeCrisis.id;
      this.activeCrisis.resolveCrisis(victoryMessage);
      if (!this.hasCountedResolution) {
        this.totalCrisesResolved++;
        this.hasCountedResolution = true;
        this.emit('crisis-resolved', {
          crisisType: type,
          totalCrisesResolved: this.totalCrisesResolved,
        });
      }
    }
  }

  public stopCrisis(result: 'resolved' | 'failed' | 'reset' = 'reset', message?: string): void {
    if (!this.activeCrisis) return;

    const type = this.activeCrisis.id;
    if (result === 'resolved') {
      this.activeCrisis.resolveCrisis(message);
      if (!this.hasCountedResolution) {
        this.totalCrisesResolved++;
        this.hasCountedResolution = true;
        this.emit('crisis-resolved', {
          crisisType: type,
          totalCrisesResolved: this.totalCrisesResolved,
        });
      }
    } else if (result === 'failed') {
      this.activeCrisis.failCrisis(message);
      this.emit('crisis-failed', {
        crisisType: type,
      });
    } else {
      this.activeCrisis.reset();
      this.emit('crisis-reset', null);
    }
    this.activeCrisis = null;
    this.previousStage = CrisisStage.INACTIVE;
  }

  public reset(): void {
    if (this.activeCrisis) {
      this.activeCrisis.reset();
      this.activeCrisis = null;
    }
    this.totalCrisesResolved = 0;
    this.hasCountedResolution = false;
    this.previousStage = CrisisStage.INACTIVE;
    this.emit('crisis-reset', null);
  }

  public serialize(): SerializedCrisisState | null {
    if (!this.activeCrisis || this.activeCrisis.getStage() === CrisisStage.INACTIVE) {
      if (this.totalCrisesResolved > 0) {
        return {
          crisisType: null,
          stage: CrisisStage.INACTIVE,
          stageElapsedMs: 0,
          stageDurationMs: 0,
          threatMeter: 0,
          threatTrend: 'stable',
          objectives: [],
          activeAlert: null,
          hazardTiles: [],
          totalCrisesResolved: this.totalCrisesResolved,
          isVictorious: false,
          isDefeated: false,
        };
      }
      return null;
    }

    if (this.activeCrisis.serialize) {
      const serialized = this.activeCrisis.serialize();
      serialized.totalCrisesResolved = this.totalCrisesResolved;
      return serialized;
    }

    // Fallback if crisis does not implement serialize
    const status = this.activeCrisis.getStatus();
    return {
      crisisType: this.activeCrisis.id,
      stage: status.stage,
      stageElapsedMs: status.stageElapsedMs,
      stageDurationMs: status.stageDurationMs,
      threatMeter: status.threatMeter,
      threatTrend: status.threatTrend,
      objectives: [...status.objectives],
      activeAlert: status.activeAlert ? { ...status.activeAlert } : null,
      hazardTiles: this.getActiveHazardTiles().map((h) => ({ ...h })),
      totalCrisesResolved: this.totalCrisesResolved,
      isVictorious: status.isVictorious,
      isDefeated: status.isDefeated,
    };
  }

  public deserialize(saved: Partial<SerializedCrisisState> | null): boolean {
    if (!saved || typeof saved !== 'object') {
      this.reset();
      return true;
    }

    if (typeof saved.totalCrisesResolved === 'number' && Number.isFinite(saved.totalCrisesResolved)) {
      this.totalCrisesResolved = Math.max(0, Math.floor(saved.totalCrisesResolved));
    }

    if (!saved.crisisType || saved.stage === CrisisStage.INACTIVE) {
      if (this.activeCrisis) {
        this.activeCrisis.reset();
        this.activeCrisis = null;
      }
      this.hasCountedResolution = false;
      return true;
    }

    const crisis = this.crisesRegistry.get(saved.crisisType);
    if (!crisis) {
      console.warn(`CrisisManager.deserialize: Unknown crisis type "${saved.crisisType}"`);
      return false;
    }

    if (this.activeCrisis && this.activeCrisis !== crisis) {
      this.activeCrisis.reset();
    }

    this.activeCrisis = crisis;
    if (this.activeCrisis.deserialize) {
      this.activeCrisis.deserialize(saved);
    } else {
      this.activeCrisis.init();
    }

    this.hasCountedResolution = Boolean(saved.isVictorious && saved.stage === CrisisStage.RESOLVED);
    return true;
  }


  public getSituationLogState(): SituationLogState {
    const s = this.cachedSituationLogState;
    if (!this.activeCrisis || this.activeCrisis.getStage() === CrisisStage.INACTIVE) {
      s.isActive = false;
      s.crisisId = '';
      s.crisisName = '';
      s.crisisIcon = '';
      s.themeColor = '#6B7280';
      s.stage = CrisisStage.INACTIVE;
      s.stageName = 'Inactive';
      s.threatLevel = 0;
      s.threatTrend = 'stable';
      s.stageRemainingMs = 0;
      s.totalDurationMs = 0;
      s.elapsedMs = 0;
      s.objectives = this.emptyObjectives;
      s.activeAlert = null;
      s.hazardCount = 0;
      s.statusDescription = 'No active planetary crisis detected.';
      s.isVictorious = false;
      s.isDefeated = false;
      return s;
    }

    const status = this.activeCrisis.getStatus();
    s.isActive = true;
    s.crisisId = status.crisisType || '';
    s.crisisName = this.activeCrisis.name;
    s.crisisIcon = this.activeCrisis.icon;
    s.themeColor = this.activeCrisis.themeColor;
    s.stage = status.stage;
    s.stageName = STAGE_NAMES[status.stage] || status.stage;
    s.threatLevel = Math.round(status.threatMeter);
    s.threatTrend = status.threatTrend;
    s.stageRemainingMs = status.stageRemainingMs;
    s.totalDurationMs = status.stageDurationMs;
    s.elapsedMs = status.stageElapsedMs;
    s.objectives = status.objectives;
    s.activeAlert = status.activeAlert;
    s.hazardCount = status.hazardTileCount;
    s.statusDescription = status.summary;
    s.isVictorious = status.isVictorious;
    s.isDefeated = status.isDefeated;
    return s;
  }

  private getDefaultStatus(): CrisisStatus {
    return this.cachedDefaultStatus;
  }
}
