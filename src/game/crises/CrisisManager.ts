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

export class CrisisManager {
  private crisesRegistry: Map<CrisisType, ICrisis> = new Map();
  private activeCrisis: ICrisis | null = null;
  private totalCrisesResolved: number = 0;

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
      this.totalCrisesResolved++;
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

  public getActiveHazardTiles(): HazardTile[] {
    return this.activeCrisis ? this.activeCrisis.getActiveHazardTiles() : [];
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

  public stopCrisis(result: 'resolved' | 'failed' | 'reset' = 'reset'): void {
    if (!this.activeCrisis) return;

    if (result === 'resolved') {
      this.activeCrisis.resolveObjective('all', 999);
      this.totalCrisesResolved++;
    } else if (result === 'failed') {
      this.activeCrisis.reset();
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
  }

  public getSituationLogState(): SituationLogState {
    if (!this.activeCrisis || this.activeCrisis.getStage() === CrisisStage.INACTIVE) {
      return {
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
    }

    const status = this.activeCrisis.getStatus();
    const stageNames: Record<CrisisStage, string> = {
      [CrisisStage.INACTIVE]: 'Inactive',
      [CrisisStage.WHISPERS]: 'Stage 1: Whispers (Buildup)',
      [CrisisStage.OUTBREAK]: 'Stage 2: Outbreak (Escalation)',
      [CrisisStage.CLIMAX]: 'Stage 3: Climax (Resolution)',
      [CrisisStage.RESOLVED]: 'Stabilized (Victory)',
      [CrisisStage.FAILED]: 'Catastrophic Collapse (Failed)',
    };

    return {
      isActive: true,
      crisisId: status.crisisType || '',
      crisisName: this.activeCrisis.name,
      crisisIcon: this.activeCrisis.icon,
      themeColor: this.activeCrisis.themeColor,
      stage: status.stage,
      stageName: stageNames[status.stage] || status.stage,
      threatLevel: Math.round(status.threatMeter),
      threatTrend: status.threatTrend,
      stageRemainingMs: status.stageRemainingMs,
      totalDurationMs: status.stageDurationMs,
      elapsedMs: status.stageElapsedMs,
      objectives: status.objectives,
      activeAlert: status.activeAlert,
      hazardCount: status.hazardTileCount,
      statusDescription: status.summary,
      isVictorious: status.isVictorious,
      isDefeated: status.isDefeated,
    };
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
