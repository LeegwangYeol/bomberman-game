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

    this.state = newState;

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

  public reset(): void {
    this.state = this.createDefaultState();
    this.emitUpdate();
  }
}
