/**
 * BaseBoss.ts — Abstract Foundation for Multi-Phase Epic Bosses
 *
 * Implements 7-State FSM, 150ms Multi-Bomb Combo Buffer, Dynamic Enrage Gauge,
 * Landing Stun mechanics, and Universal 3-Tier Visual Telegraphing.
 * Pure simulation logic decoupled from Phaser visuals for 100% headless testability.
 */

import { BossState, type BossId } from './BossTypes.ts';


export interface BossConfig {
  id: BossId | string;
  name: string;
  title: string;
  avatarEmoji: string;
  maxHp: number;
  footprintWidth: number; // In pixels (e.g. 80 for 2x2)
  footprintHeight: number; // In pixels (e.g. 80 for 2x2)
  colliderRadius: number; // Collision circle radius
  baseSpeed: number;
  phase2HpThreshold: number; // e.g. 0.70
  phase3HpThreshold: number; // e.g. 0.33
}

export interface BossHUDData {
  bossId: string;
  name: string;
  title: string;
  avatarEmoji: string;
  currentHp: number;
  maxHp: number;
  phase: number;
  state: BossState;
  enrageGauge: number; // 0 to 100
  isStunned: boolean;
  stunRemainingMs: number;
  isInvulnerable: boolean;
}

export abstract class BaseBoss {
  public readonly config: BossConfig;
  public currentHp: number;
  public maxHp: number;
  public phase: number = 1;
  public bossState: BossState = BossState.INTRO;

  // Position and Physics
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public currentSpeed: number = 0;

  // Enrage Mechanics
  public enrageGauge: number = 0; // 0.0 to 100.0
  public readonly enrageGainPerSecond: number = 1.5;
  public readonly enrageGainPerHit: number = 10.0;

  // 150ms Multi-Bomb Combo Buffering
  public comboHits: number = 0;
  public comboDamageAccumulator: number = 0;
  public comboBufferTimerMs: number = 0;
  public readonly comboWindowMs: number = 150;

  // Vulnerability & i-Frames
  public isInvulnerable: boolean = true; // Invulnerable during INTRO
  public iFrameTimerMs: number = 0;
  public readonly defaultIFrameMs: number = 1500;

  // Stun & Recovery
  public stunDurationMs: number = 0;
  public stunTimerMs: number = 0;
  public previousStateBeforeStun: BossState = BossState.PHASE_1;

  // State Machine Timers
  public stateTimerMs: number = 0;
  public readonly introDurationMs: number = 1500;
  public readonly intermissionDurationMs: number = 1800;
  public readonly deathDurationMs: number = 1200;
  public deathTimerMs: number = 0;
  public isDeathAnimationComplete: boolean = false;

  constructor(config: BossConfig, startX: number, startY: number) {
    this.config = config;
    this.maxHp = Math.max(1, config.maxHp);
    this.currentHp = this.maxHp;
    this.x = startX;
    this.y = startY;
    this.currentSpeed = config.baseSpeed;
    this.bossState = BossState.INTRO;
    this.stateTimerMs = this.introDurationMs;
    this.isInvulnerable = true;
  }

  /**
   * Main per-frame simulation update (Zero-GC, 60 FPS tick).
   */
  public update(dt: number, playerX: number = 0, playerY: number = 0): void {
    if (this.bossState === BossState.DEFEATED) {
      if (!this.isDeathAnimationComplete) {
        this.deathTimerMs -= dt;
        if (this.deathTimerMs <= 0) {
          this.deathTimerMs = 0;
          this.isDeathAnimationComplete = true;
          this.onDeathAnimationFinished();
        }
      }
      return;
    }

    const stateAtStart = this.bossState;

    // 1. Process active 150ms combo buffer timer
    if (this.comboBufferTimerMs > 0) {
      this.comboBufferTimerMs -= dt;
      if (this.comboBufferTimerMs <= 0) {
        this.comboBufferTimerMs = 0;
        this.resolveComboBuffer();
      }
    }

    // 2. Process i-frame blinking timer
    if (this.iFrameTimerMs > 0) {
      this.iFrameTimerMs -= dt;
      if (this.iFrameTimerMs <= 0) {
        this.iFrameTimerMs = 0;
        // Keep invulnerable if state dictates (e.g. INTRO, INTERMISSION)
        if (
          this.bossState !== BossState.INTRO &&
          this.bossState !== BossState.INTERMISSION
        ) {
          this.isInvulnerable = false;
        }
      }
    }

    // 3. Process passive enrage gain during active combat
    if (
      this.bossState === BossState.PHASE_1 ||
      this.bossState === BossState.PHASE_2
    ) {
      this.enrageGauge = Math.min(
        100,
        this.enrageGauge + this.enrageGainPerSecond * (dt / 1000)
      );
      if (this.enrageGauge >= 100) {
        this.transitionTo(BossState.ENRAGED);
      }
    }

    // 4. Update state-specific logic
    if (this.bossState === stateAtStart) {
      switch (this.bossState) {
        case BossState.INTRO:
          this.updateIntro(dt);
          break;
        case BossState.PHASE_1:
          this.updatePhase1(dt, playerX, playerY);
          break;
        case BossState.INTERMISSION:
          this.updateIntermission(dt);
          break;
        case BossState.PHASE_2:
          this.updatePhase2(dt, playerX, playerY);
          break;
        case BossState.ENRAGED:
          this.updateEnraged(dt, playerX, playerY);
          break;
        case BossState.STUNNED:
          this.updateStunned(dt);
          break;
      }
    }
  }

  /**
   * Applies damage from bomb explosions with 150ms combo buffering.
   * Returns true if damage was registered.
   */
  public takeBombDamage(
    damage: number = 1,
    source: 'bomb' | 'skill' = 'bomb'
  ): boolean {
    void source;
    if (
      this.bossState === BossState.DEFEATED ||
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION
    ) {
      return false;
    }

    if (!this.canTakeDamage()) {
      this.onDamageBlocked();
      return false;
    }

    // Reject if currently in post-combo i-frames
    if (this.isInvulnerable && this.comboBufferTimerMs <= 0) {
      return false;
    }

    // Subsequent hit within active 150ms buffer window
    if (this.comboBufferTimerMs > 0) {
      this.comboHits++;
      this.comboDamageAccumulator += damage;
      this.currentHp = Math.max(0, this.currentHp - damage);
      this.enrageGauge = Math.min(100, this.enrageGauge + this.enrageGainPerHit);
      this.onHitReceived(damage, true);
      this.checkDefeatCondition();
      return true;
    }

    // First hit opening the 150ms buffer window
    this.comboHits = 1;
    this.comboDamageAccumulator = damage;
    this.currentHp = Math.max(0, this.currentHp - damage);
    this.enrageGauge = Math.min(100, this.enrageGauge + this.enrageGainPerHit);
    this.comboBufferTimerMs = this.comboWindowMs;
    this.isInvulnerable = true;
    this.onHitReceived(damage, false);
    this.checkDefeatCondition();
    return true;
  }

  /**
   * Resolves buffered hits after 150ms window expires.
   */
  private resolveComboBuffer(): void {
    if (this.currentHp <= 0) {
      this.transitionTo(BossState.DEFEATED);
      return;
    }

    // Multi-bomb combo extends stun duration
    if (this.comboHits >= 2) {
      const bonusStun = Math.min(1.5, (this.comboHits - 1) * 0.75);
      const totalStunSec = 3.0 + bonusStun; // Up to 4.5s
      this.applyStun(totalStunSec);
    }

    // ARCH-02: Engage post-combo i-frames ONLY if boss is NOT stunned
    // Stun is a tactical vulnerability window; i-frames must not overlap and negate it.
    if (this.bossState !== BossState.STUNNED) {
      this.iFrameTimerMs = this.defaultIFrameMs;
      this.isInvulnerable = true;
    } else {
      this.iFrameTimerMs = 0;
      this.isInvulnerable = false;
    }

    // Check phase transition thresholds
    const hpRatio = this.currentHp / this.maxHp;
    if (hpRatio <= this.config.phase3HpThreshold || this.enrageGauge >= 100) {
      if (
        this.bossState !== BossState.ENRAGED &&
        this.bossState !== BossState.STUNNED
      ) {
        this.transitionTo(BossState.ENRAGED);
      }
    } else if (hpRatio <= this.config.phase2HpThreshold && this.phase < 2) {
      if (
        this.bossState !== BossState.INTERMISSION &&
        this.bossState !== BossState.STUNNED
      ) {
        this.transitionTo(BossState.INTERMISSION);
      }
    }
  }

  /**
   * Applies stun for specified duration in seconds.
   */
  public applyStun(durationSec: number): void {
    if (this.bossState === BossState.DEFEATED) return;
    if (this.bossState !== BossState.STUNNED) {
      this.previousStateBeforeStun = this.bossState;
    }
    this.bossState = BossState.STUNNED;
    this.stunDurationMs = durationSec * 1000;
    this.stunTimerMs = Math.max(this.stunTimerMs, durationSec * 1000);
    this.vx = 0;
    this.vy = 0;
    // ARCH-02: Stun opens vulnerability window — clear i-frames immediately
    this.isInvulnerable = false;
    this.iFrameTimerMs = 0;
  }

  /**
   * State Transition Handler
   */
  public transitionTo(nextState: BossState): void {
    if (this.bossState === nextState || this.bossState === BossState.DEFEATED)
      return;

    const prevState = this.bossState;
    this.bossState = nextState;
    this.stateTimerMs = 0;

    switch (nextState) {
      case BossState.PHASE_1:
        this.phase = 1;
        this.isInvulnerable = false;
        this.currentSpeed = this.config.baseSpeed;
        break;
      case BossState.INTERMISSION:
        this.phase = 2;
        this.isInvulnerable = true;
        this.stateTimerMs = this.intermissionDurationMs;
        this.vx = 0;
        this.vy = 0;
        break;
      case BossState.PHASE_2:
        this.phase = 2;
        this.isInvulnerable = false;
        this.currentSpeed = this.config.baseSpeed * 1.35;
        break;
      case BossState.ENRAGED:
        this.phase = 3;
        this.enrageGauge = 100;
        this.isInvulnerable = false;
        this.currentSpeed = this.config.baseSpeed * 1.6;
        break;
      case BossState.STUNNED:
        this.vx = 0;
        this.vy = 0;
        break;
      case BossState.DEFEATED:
        this.isInvulnerable = true;
        this.vx = 0;
        this.vy = 0;
        this.deathTimerMs = this.deathDurationMs;
        this.isDeathAnimationComplete = false;
        this.onDefeated();
        break;
    }

    this.onStateChanged(prevState, nextState);
  }

  private updateIntro(dt: number): void {
    this.stateTimerMs -= dt;
    if (this.stateTimerMs <= 0) {
      this.transitionTo(BossState.PHASE_1);
    }
  }

  private updateIntermission(dt: number): void {
    this.stateTimerMs -= dt;
    if (this.stateTimerMs <= 0) {
      this.transitionTo(BossState.PHASE_2);
    }
  }

  private updateStunned(dt: number): void {
    this.stunTimerMs -= dt;
    if (this.stunTimerMs <= 0) {
      this.stunTimerMs = 0;
      // Resume previous active phase with i-frames
      const hpRatio = this.currentHp / this.maxHp;
      const resumeState =
        hpRatio <= this.config.phase3HpThreshold || this.enrageGauge >= 100
          ? BossState.ENRAGED
          : hpRatio <= this.config.phase2HpThreshold && this.phase < 2
            ? BossState.INTERMISSION
            : this.phase >= 2
              ? BossState.PHASE_2
              : BossState.PHASE_1;

      this.transitionTo(resumeState);
      this.iFrameTimerMs = this.defaultIFrameMs;
      this.isInvulnerable = true;
    }
  }

  private checkDefeatCondition(): void {
    if (this.currentHp <= 0) {
      this.currentHp = 0;
      this.transitionTo(BossState.DEFEATED);
    }
  }

  public getState(): BossState {
    return this.bossState;
  }

  public get state(): BossState {
    return this.bossState;
  }

  public get isComboActive(): boolean {
    return this.comboBufferTimerMs > 0;
  }

  public get isStunned(): boolean {
    return this.bossState === BossState.STUNNED;
  }

  public get stunRemainingMs(): number {
    return this.stunTimerMs;
  }

  public get isDismissible(): boolean {
    return this.bossState === BossState.DEFEATED && this.isDeathAnimationComplete;
  }

  public get deathAnimationProgress(): number {
    if (this.bossState !== BossState.DEFEATED) return 0;
    if (this.deathDurationMs <= 0) return 1.0;
    return Math.min(1.0, Math.max(0, 1.0 - this.deathTimerMs / this.deathDurationMs));
  }

  protected onDeathAnimationFinished(): void {}

  public getHUDData(): BossHUDData {
    return {
      bossId: this.config.id,
      name: this.config.name,
      title: this.config.title,
      avatarEmoji: this.config.avatarEmoji,
      currentHp: this.currentHp,
      maxHp: this.maxHp,
      phase: this.phase,
      state: this.bossState,
      enrageGauge: Math.floor(this.enrageGauge),
      isStunned: this.bossState === BossState.STUNNED,
      stunRemainingMs: Math.max(0, this.stunTimerMs),
      isInvulnerable: this.isInvulnerable,
    };
  }

  // Abstract Hooks for Subclasses
  public abstract canTakeDamage(): boolean;
  protected abstract updatePhase1(dt: number, playerX: number, playerY: number): void;
  protected abstract updatePhase2(dt: number, playerX: number, playerY: number): void;
  protected abstract updateEnraged(dt: number, playerX: number, playerY: number): void;
  protected abstract onHitReceived(damage: number, isChained: boolean): void;
  protected abstract onDamageBlocked(): void;
  protected abstract onStateChanged(prevState: BossState, nextState: BossState): void;
  protected abstract onDefeated(): void;
}
