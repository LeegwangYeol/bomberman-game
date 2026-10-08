/**
 * SituationLog.ts — Headless-capable Situation Log HUD controller & event bridge
 *
 * Bridges CrisisManager state to React UI components via throttled events,
 * tracks objectives, threat meters, and stage alerts.
 */

import { CrisisStage } from './CrisisTypes.ts';
import type { SituationLogState } from './CrisisTypes.ts';
import { CrisisManager } from './CrisisManager.ts';

export interface IGameEventEmitter {
  events?: {
    emit(event: string, ...args: unknown[]): boolean;
  };
}

export class SituationLog {
  private game: IGameEventEmitter | null;
  private state: SituationLogState;
  private lastEmitTime: number = 0;
  private readonly emitIntervalMs: number = 50; // Throttle to max 20 emissions/sec

  constructor(game: IGameEventEmitter | null = null) {
    this.game = game;
    this.state = this.createDefaultState();
  }

  public createDefaultState(): SituationLogState {
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

  private copyState(target: SituationLogState, source: SituationLogState): void {
    target.isActive = source.isActive;
    target.crisisId = source.crisisId;
    target.crisisName = source.crisisName;
    target.crisisIcon = source.crisisIcon;
    target.themeColor = source.themeColor;
    target.stage = source.stage;
    target.stageName = source.stageName;
    target.threatLevel = source.threatLevel;
    target.threatTrend = source.threatTrend;
    target.stageRemainingMs = source.stageRemainingMs;
    target.totalDurationMs = source.totalDurationMs;
    target.elapsedMs = source.elapsedMs;
    target.objectives = source.objectives;
    target.activeAlert = source.activeAlert;
    target.hazardCount = source.hazardCount;
    target.statusDescription = source.statusDescription;
    target.isVictorious = source.isVictorious;
    target.isDefeated = source.isDefeated;
  }

  public updateFromCrisisManager(manager: CrisisManager, currentTimeMs: number = Date.now(), force: boolean = false): void {
    const newState = manager.getSituationLogState();
    
    // Check if significant state transition occurred to force immediate update
    const isMajorChange =
      force ||
      newState.stage !== this.state.stage ||
      newState.isActive !== this.state.isActive ||
      newState.isVictorious !== this.state.isVictorious ||
      newState.isDefeated !== this.state.isDefeated ||
      (newState.activeAlert !== null && this.state.activeAlert === null);

    this.copyState(this.state, newState);

    if (isMajorChange || currentTimeMs - this.lastEmitTime >= this.emitIntervalMs) {
      this.emitUpdate();
      this.lastEmitTime = currentTimeMs;
    }
  }

  public emitUpdate(): void {
    if (this.game && this.game.events) {
      // Emit both names for maximum compatibility
      this.game.events.emit('situation-log-update', this.state);
      this.game.events.emit('crisis-situation-log-update', this.state);
    }
  }

  public getState(): SituationLogState {
    return this.state;
  }

  public serialize(): SituationLogState {
    return {
      isActive: Boolean(this.state.isActive),
      crisisId: this.state.crisisId,
      crisisName: String(this.state.crisisName || ''),
      crisisIcon: String(this.state.crisisIcon || ''),
      themeColor: String(this.state.themeColor || '#6B7280'),
      stage: this.state.stage || CrisisStage.INACTIVE,
      stageName: String(this.state.stageName || 'Inactive'),
      threatLevel: Number.isFinite(this.state.threatLevel) ? Math.max(0, Math.min(100, Math.round(this.state.threatLevel))) : 0,
      threatTrend: this.state.threatTrend || 'stable',
      stageRemainingMs: Number.isFinite(this.state.stageRemainingMs) ? Math.max(0, this.state.stageRemainingMs) : 0,
      totalDurationMs: Number.isFinite(this.state.totalDurationMs) ? Math.max(0, this.state.totalDurationMs) : 0,
      elapsedMs: Number.isFinite(this.state.elapsedMs) ? Math.max(0, this.state.elapsedMs) : 0,
      objectives: Array.isArray(this.state.objectives)
        ? this.state.objectives.map((o) => ({
            id: String(o.id || ''),
            title: String(o.title || ''),
            description: String(o.description || ''),
            targetCount: Number.isFinite(o.targetCount) ? Math.max(0, o.targetCount) : 0,
            currentCount: Number.isFinite(o.currentCount) ? Math.max(0, o.currentCount) : 0,
            isCompleted: Boolean(o.isCompleted),
            isFailed: Boolean(o.isFailed),
            timeLimitMs: typeof o.timeLimitMs === 'number' && Number.isFinite(o.timeLimitMs) ? o.timeLimitMs : undefined,
            remainingTimeMs: typeof o.remainingTimeMs === 'number' && Number.isFinite(o.remainingTimeMs) ? o.remainingTimeMs : undefined,
          }))
        : [],
      activeAlert: this.state.activeAlert
        ? {
            id: String(this.state.activeAlert.id || ''),
            title: String(this.state.activeAlert.title || ''),
            message: String(this.state.activeAlert.message || ''),
            level: this.state.activeAlert.level || 'info',
            icon: String(this.state.activeAlert.icon || '⚠️'),
            durationMs: Number.isFinite(this.state.activeAlert.durationMs) ? this.state.activeAlert.durationMs : 3500,
            remainingMs: Number.isFinite(this.state.activeAlert.remainingMs) ? this.state.activeAlert.remainingMs : 3500,
          }
        : null,
      hazardCount: Number.isFinite(this.state.hazardCount) ? Math.max(0, Math.floor(this.state.hazardCount)) : 0,
      statusDescription: String(this.state.statusDescription || ''),
      isVictorious: Boolean(this.state.isVictorious),
      isDefeated: Boolean(this.state.isDefeated),
    };
  }

  public serializeToJson(): string {
    return JSON.stringify(this.serialize());
  }

  public deserialize(input: Partial<SituationLogState> | string): boolean {
    if (!input) {
      this.reset();
      return true;
    }

    let parsed: Partial<SituationLogState>;
    if (typeof input === 'string') {
      try {
        parsed = JSON.parse(input) as Partial<SituationLogState>;
      } catch (err) {
        console.warn('SituationLog.deserialize: Failed to parse JSON string', err);
        return false;
      }
    } else if (typeof input === 'object') {
      parsed = input;
    } else {
      return false;
    }

    const validStages = new Set(Object.values(CrisisStage));
    const stage = parsed.stage && validStages.has(parsed.stage) ? parsed.stage : CrisisStage.INACTIVE;

    const validTrends = new Set(['stable', 'rising', 'critical', 'declining'] as const);
    const trend = parsed.threatTrend && validTrends.has(parsed.threatTrend) ? parsed.threatTrend : 'stable';

    const safeNumber = (val: unknown, fallback: number = 0): number =>
      typeof val === 'number' && Number.isFinite(val) ? Math.max(0, val) : fallback;

    const sanitizedObjectives = Array.isArray(parsed.objectives)
      ? parsed.objectives.map((o) => ({
          id: String(o.id || ''),
          title: String(o.title || ''),
          description: String(o.description || ''),
          targetCount: safeNumber(o.targetCount),
          currentCount: safeNumber(o.currentCount),
          isCompleted: Boolean(o.isCompleted),
          isFailed: Boolean(o.isFailed),
          timeLimitMs: typeof o.timeLimitMs === 'number' && Number.isFinite(o.timeLimitMs) ? o.timeLimitMs : undefined,
          remainingTimeMs: typeof o.remainingTimeMs === 'number' && Number.isFinite(o.remainingTimeMs) ? o.remainingTimeMs : undefined,
        }))
      : [];

    let sanitizedAlert = null;
    if (parsed.activeAlert && typeof parsed.activeAlert === 'object') {
      sanitizedAlert = {
        id: String(parsed.activeAlert.id || ''),
        title: String(parsed.activeAlert.title || ''),
        message: String(parsed.activeAlert.message || ''),
        level: parsed.activeAlert.level || 'info',
        icon: String(parsed.activeAlert.icon || '⚠️'),
        durationMs: safeNumber(parsed.activeAlert.durationMs, 3500),
        remainingMs: safeNumber(parsed.activeAlert.remainingMs, 3500),
      };
    }

    this.state = {
      isActive: Boolean(parsed.isActive),
      crisisId: (parsed.crisisId || '') as SituationLogState['crisisId'],
      crisisName: String(parsed.crisisName || ''),
      crisisIcon: String(parsed.crisisIcon || ''),
      themeColor: String(parsed.themeColor || '#6B7280'),
      stage,
      stageName: String(parsed.stageName || 'Inactive'),
      threatLevel: typeof parsed.threatLevel === 'number' && Number.isFinite(parsed.threatLevel)
        ? Math.max(0, Math.min(100, Math.round(parsed.threatLevel)))
        : 0,
      threatTrend: trend,
      stageRemainingMs: safeNumber(parsed.stageRemainingMs),
      totalDurationMs: safeNumber(parsed.totalDurationMs),
      elapsedMs: safeNumber(parsed.elapsedMs),
      objectives: sanitizedObjectives,
      activeAlert: sanitizedAlert,
      hazardCount: typeof parsed.hazardCount === 'number' && Number.isFinite(parsed.hazardCount)
        ? Math.max(0, Math.floor(parsed.hazardCount))
        : 0,
      statusDescription: String(parsed.statusDescription || ''),
      isVictorious: Boolean(parsed.isVictorious),
      isDefeated: Boolean(parsed.isDefeated),
    };

    this.emitUpdate();
    return true;
  }

  public deserializeFromJson(json: string): boolean {
    return this.deserialize(json);
  }

  public reset(): void {
    this.state = this.createDefaultState();
    this.emitUpdate();
  }
}
