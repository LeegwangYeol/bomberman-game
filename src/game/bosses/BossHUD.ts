/**
 * BossHUD.ts — Headless-capable Boss HUD controller and event bridge
 *
 * Tracks multi-phase segmented health bars, dynamic enrage gauges,
 * combo windows, and real-time threat alert banners.
 */

import {
  BossState,
  type BossHUDState,
  type BossId,
  type BossThreatAlert,
} from './BossTypes.ts';

export interface IGameEventEmitter {
  events?: {
    emit(event: string, ...args: unknown[]): boolean;
  };
}

export const BOSS_METADATA: Record<
  BossId,
  {
    name: string;
    title: string;
    avatarEmoji: string;
    themeColor: string;
    phaseHpSegments: number[];
  }
> = {
  king_gummy_bear: {
    name: 'King Gummy Bear',
    title: 'Colossus of Gelatin',
    avatarEmoji: '👑🐻',
    themeColor: '#FF1144',
    phaseHpSegments: [3, 3, 3], // 9 HP total
  },
  boss_gummy_bear: {
    name: 'King Gummy Bear',
    title: 'Colossus of Gelatin',
    avatarEmoji: '👑🐻',
    themeColor: '#FF1144',
    phaseHpSegments: [3, 3, 3],
  },
  captain_nibbles: {
    name: 'Captain Nibbles',
    title: 'Mad Rodent Inventor',
    avatarEmoji: '🐹⚙️',
    themeColor: '#00F0FF',
    phaseHpSegments: [3, 3, 4], // 10 HP total
  },
  boss_hamster_nibbles: {
    name: 'Captain Nibbles',
    title: 'Mad Rodent Inventor',
    avatarEmoji: '🐹⚙️',
    themeColor: '#00F0FF',
    phaseHpSegments: [3, 3, 4],
  },
  queen_bee_cupcake: {
    name: 'Queen Bee Cupcake',
    title: 'Sovereign of the Sugar Hive',
    avatarEmoji: '🧁🐝',
    themeColor: '#F59E0B',
    phaseHpSegments: [3, 4, 5], // 12 HP total
  },
  boss_queen_bee: {
    name: 'Queen Bee Cupcake',
    title: 'Sovereign of the Sugar Hive',
    avatarEmoji: '🧁🐝',
    themeColor: '#F59E0B',
    phaseHpSegments: [3, 4, 5],
  },
};

export class BossHUD {
  private game: IGameEventEmitter | null;
  private state: BossHUDState;
  private isDirty: boolean = false;
  private lastEmitTime: number = 0;
  private readonly emitIntervalMs: number = 50; // Throttle to max 20 updates/sec

  constructor(game: IGameEventEmitter | null = null) {
    this.game = game;
    this.state = this.createDefaultState();
  }

  public createDefaultState(): BossHUDState {
    return {
      isActive: false,
      bossId: '',
      name: '',
      title: '',
      avatarEmoji: '',
      themeColor: '#EF4444',
      state: BossState.INTRO,
      currentHp: 0,
      maxHp: 0,
      phase: 1,
      maxPhase: 3,
      phaseHpSegments: [3, 3, 3],
      activeSegmentIndex: 0,
      activeSegmentHp: 0,
      activeSegmentMaxHp: 0,
      enrageGauge: 0,
      isEnraged: false,
      isStunned: false,
      stunDurationMs: 0,
      stunRemainingMs: 0,
      stunReason: '',
      comboHits: 0,
      isComboWindowActive: false,
      comboWindowRemainingMs: 0,
      activeAlert: null,
    };
  }

  public initBoss(bossId: BossId, startingHp?: number): void {
    const meta = BOSS_METADATA[bossId] || BOSS_METADATA.king_gummy_bear;
    const maxHp = startingHp ?? meta.phaseHpSegments.reduce((a, b) => a + b, 0);

    this.state = {
      ...this.createDefaultState(),
      isActive: true,
      bossId,
      name: meta.name,
      title: meta.title,
      avatarEmoji: meta.avatarEmoji,
      themeColor: meta.themeColor,
      state: BossState.INTRO,
      currentHp: maxHp,
      maxHp,
      phase: 1,
      maxPhase: meta.phaseHpSegments.length,
      phaseHpSegments: [...meta.phaseHpSegments],
      enrageGauge: 0,
      isEnraged: false,
    };

    this.recomputeSegments();
    this.emitState(true);
  }

  public update(deltaMs: number): void {
    if (!this.state.isActive) return;

    let stateChanged = false;

    // 1. Tick Stun Timer
    if (this.state.isStunned && this.state.stunRemainingMs > 0) {
      this.state.stunRemainingMs = Math.max(0, this.state.stunRemainingMs - deltaMs);
      if (this.state.stunRemainingMs === 0) {
        this.state.isStunned = false;
        this.state.stunReason = '';
      }
      stateChanged = true;
    }

    // 2. Tick Combo Window
    if (this.state.isComboWindowActive && this.state.comboWindowRemainingMs > 0) {
      this.state.comboWindowRemainingMs = Math.max(
        0,
        this.state.comboWindowRemainingMs - deltaMs
      );
      if (this.state.comboWindowRemainingMs === 0) {
        this.state.isComboWindowActive = false;
      }
      stateChanged = true;
    }

    // 3. Tick Threat Alert
    if (this.state.activeAlert && this.state.activeAlert.remainingMs > 0) {
      this.state.activeAlert.remainingMs = Math.max(
        0,
        this.state.activeAlert.remainingMs - deltaMs
      );
      if (this.state.activeAlert.remainingMs === 0) {
        this.state.activeAlert = null;
      }
      stateChanged = true;
    }

    // 4. Passive Enrage Gauge Build (0.5% per second)
    if (
      !this.state.isEnraged &&
      this.state.state !== BossState.INTRO &&
      this.state.state !== BossState.DEFEATED
    ) {
      const prevGauge = this.state.enrageGauge;
      this.state.enrageGauge = Math.min(
        100,
        this.state.enrageGauge + (deltaMs / 1000) * 0.5
      );
      if (this.state.enrageGauge >= 100) {
        this.setEnraged(true);
      }
      if (Math.floor(prevGauge) !== Math.floor(this.state.enrageGauge)) {
        stateChanged = true;
      }
    }

    if (stateChanged) {
      this.isDirty = true;
    }

    const now = Date.now();
    if (this.isDirty && now - this.lastEmitTime >= this.emitIntervalMs) {
      this.emitState(false);
    }
  }

  public setHp(newHp: number): void {
    const clampedHp = Math.max(0, Math.min(this.state.maxHp, newHp));
    if (this.state.currentHp !== clampedHp) {
      this.state.currentHp = clampedHp;
      this.recomputeSegments();
      if (this.state.currentHp === 0) {
        this.state.state = BossState.DEFEATED;
      }
      this.emitState(true);
    }
  }

  public setPhase(phase: number): void {
    if (this.state.phase !== phase) {
      this.state.phase = phase;
      this.recomputeSegments();
      this.emitState(true);
    }
  }

  public setBossState(state: BossState): void {
    if (this.state.state !== state) {
      this.state.state = state;
      if (state === BossState.ENRAGED) {
        this.state.isEnraged = true;
      }
      this.emitState(true);
    }
  }

  public setEnrageGauge(value: number): void {
    const clamped = Math.max(0, Math.min(100, value));
    if (this.state.enrageGauge !== clamped) {
      this.state.enrageGauge = clamped;
      if (this.state.enrageGauge >= 100) {
        this.setEnraged(true);
      }
      this.emitState(false);
    }
  }

  public setEnraged(enraged: boolean): void {
    this.state.isEnraged = enraged;
    if (enraged) {
      this.state.enrageGauge = 100;
      this.state.state = BossState.ENRAGED;
      this.postAlert({
        id: 'enrage_trigger',
        title: 'BERSERK ENRAGE ACTIVE!',
        subtitle: 'Boss speed and attack rates boosted by 60%!',
        level: 'critical',
        icon: '😡🔥',
        durationMs: 3500,
        remainingMs: 3500,
      });
    }
    this.emitState(true);
  }

  public triggerStun(durationSec: number, reason: string): void {
    this.state.isStunned = true;
    this.state.stunDurationMs = durationSec * 1000;
    this.state.stunRemainingMs = durationSec * 1000;
    this.state.stunReason = reason;
    this.state.state = BossState.STUNNED;

    this.postAlert({
      id: `stun_${Date.now()}`,
      title: 'TACTICAL STUN WINDOW!',
      subtitle: `${reason} (${durationSec.toFixed(1)}s window)`,
      level: 'info',
      icon: '💫',
      durationMs: durationSec * 1000,
      remainingMs: durationSec * 1000,
    });

    this.emitState(true);
  }

  public registerComboHit(hits: number, windowMs: number = 150): void {
    this.state.comboHits = hits;
    this.state.isComboWindowActive = true;
    this.state.comboWindowRemainingMs = windowMs;
    this.emitState(true);
  }

  public postAlert(alert: BossThreatAlert): void {
    this.state.activeAlert = { ...alert };
    this.emitState(true);
  }

  public dismissBoss(): void {
    this.state.isActive = false;
    this.emitState(true);
  }

  public getState(): Readonly<BossHUDState> {
    return this.state;
  }

  private recomputeSegments(): void {
    const segments = this.state.phaseHpSegments;
    const currentHp = this.state.currentHp;

    let accumulated = 0;
    for (let i = 0; i < segments.length; i++) {
      const segCap = segments[i];
      accumulated += segCap;
      if (currentHp <= accumulated || i === segments.length - 1) {
        this.state.activeSegmentIndex = i;
        const prevCap = accumulated - segCap;
        this.state.activeSegmentHp = Math.max(0, currentHp - prevCap);
        this.state.activeSegmentMaxHp = segCap;
        break;
      }
    }
  }

  private emitState(force: boolean): void {
    void force;
    this.lastEmitTime = Date.now();
    this.isDirty = false;
    if (this.game && this.game.events) {
      this.game.events.emit('boss-hud-update', { ...this.state });
    }
  }
}
