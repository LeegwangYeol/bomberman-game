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
  ICrisis,
} from './CrisisTypes.ts';
import { VoidCrisis } from './VoidCrisis.ts';
import { ClockworkCrisis } from './ClockworkCrisis.ts';
import { OrbitalCrisis } from './OrbitalCrisis.ts';
import { SolarFlareCrisis } from './SolarFlareCrisis.ts';
import { LavaCrisis } from './LavaCrisis.ts';
import { RiftCrisis } from './RiftCrisis.ts';

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
    objectives: [],
    activeAlert: null,
    hazardCount: 0,
    statusDescription: 'No active planetary crisis detected.',
    isVictorious: false,
    isDefeated: false,
  };

  constructor() {
    this.registerCrises();
  }

  private registerCrises(): void {
    this.crisesRegistry.set(CrisisType.PASTEL_VOID, new VoidCrisis());
    this.crisesRegistry.set(CrisisType.CLOCKWORK_REBELLION, new ClockworkCrisis());
    this.crisesRegistry.set(CrisisType.ORBITAL_BOMBARDMENT, new OrbitalCrisis());
    this.crisesRegistry.set(CrisisType.SOLAR_FLARES, new SolarFlareCrisis());
    this.crisesRegistry.set(CrisisType.CREEPING_LAVA, new LavaCrisis());
    this.crisesRegistry.set(CrisisType.DIMENSIONAL_RIFTS, new RiftCrisis());
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
  }

  public update(deltaMs: number, playerPos?: { r: number; c: number; x?: number; y?: number }): CrisisStatus {
    if (!this.activeCrisis) {
      return this.getDefaultStatus();
    }

    this.activeCrisis.update(deltaMs, playerPos);
    const status = this.activeCrisis.getStatus();

    if (status.isVictorious && status.stage === CrisisStage.RESOLVED) {
      if (!this.hasCountedResolution) {
        this.totalCrisesResolved++;
        this.hasCountedResolution = true;
      }
    }

    return status;
  }

  public resolveObjective(objectiveId: string, value?: number): void {
    if (this.activeCrisis) {
      this.activeCrisis.resolveObjective(objectiveId, value);
    }
  }

  public handleBombBlast(r: number, c: number, radius: number = 1): void {
    if (this.activeCrisis) {
      this.activeCrisis.handleBombBlast(r, c, radius);
    }
  }

  private readonly emptyHazardTiles: HazardTile[] = [];

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

  public getTotalCrisesResolved(): number {
    return this.totalCrisesResolved;
  }

  public resolveCrisis(victoryMessage?: string): void {
    if (this.activeCrisis) {
      this.activeCrisis.resolveCrisis(victoryMessage);
      if (!this.hasCountedResolution) {
        this.totalCrisesResolved++;
        this.hasCountedResolution = true;
      }
    }
  }

  public stopCrisis(result: 'resolved' | 'failed' | 'reset' = 'reset', message?: string): void {
    if (!this.activeCrisis) return;

    if (result === 'resolved') {
      this.activeCrisis.resolveCrisis(message);
      if (!this.hasCountedResolution) {
        this.totalCrisesResolved++;
        this.hasCountedResolution = true;
      }
    } else if (result === 'failed') {
      this.activeCrisis.failCrisis(message);
    } else {
      this.activeCrisis.reset();
    }
    this.activeCrisis = null;
  }

  public reset(): void {
    if (this.activeCrisis) {
      this.activeCrisis.reset();
      this.activeCrisis = null;
    }
    this.totalCrisesResolved = 0;
    this.hasCountedResolution = false;
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
      s.objectives = [];
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
    return {
      isActive: false,
      crisisType: null,
      stage: CrisisStage.INACTIVE,
      threatMeter: 0,
      threatTrend: 'stable',
      stageElapsedMs: 0,
      stageDurationMs: 0,
      stageRemainingMs: 0,
      objectives: [],
      activeAlert: null,
      hazardTileCount: 0,
      isVictorious: false,
      isDefeated: false,
      summary: 'No active crisis',
    };
  }
}
