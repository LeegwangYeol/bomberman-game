/**
 * QueenBeeBoss.ts — Queen Mellifera (Queen Bee Cupcake)
 *
 * Implements 3D Aerial Sovereign Flight (immune to floor bomb flames), 4 Rotating Shields,
 * Honey Carpet caramelization, Stinger Salvo, Anti-Air Pollen Sniping, and Supersonic Dive Coma.
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState } from './BossTypes.ts';
import { QueenBeeAudio } from './QueenBeeAudio.ts';

export class QueenBeeBoss extends BaseBoss {
  public isGrounded: boolean = false;
  public altitude: number = 40; // 40px flight height
  public activeShieldCount: number = 4;
  public readonly maxShields: number = 4;
  public shieldRotationRad: number = 0;
  public isDiving: boolean = false;
  public diveTimerMs: number = 0;
  public targetDiveX: number = 0;
  public targetDiveY: number = 0;
  public flightTimeSec: number = 0;
  public timeUntilNextDiveMs: number = 5000;
  public audio: QueenBeeAudio;

  constructor(startX: number = 300, startY: number = 260) {
    const config: BossConfig = {
      id: 'boss_queen_bee',
      name: 'Queen Mellifera',
      title: 'Sovereign of the Sugar Hive Bakery',
      avatarEmoji: '🧁🐝',
      maxHp: 12, // 3 / 4 / 5
      footprintWidth: 80,
      footprintHeight: 80,
      colliderRadius: 36,
      baseSpeed: 75,
      phase2HpThreshold: 0.75, // <= 9 HP
      phase3HpThreshold: 0.33, // <= 4 HP
    };
    const safeStartX = Number.isFinite(startX) ? Math.max(60, Math.min(startX, 540)) : 300;
    const safeStartY = Number.isFinite(startY) ? Math.max(60, Math.min(startY, 460)) : 260;
    super(config, safeStartX, safeStartY);
    this.activeShieldCount = 4;
    this.targetDiveX = safeStartX;
    this.targetDiveY = safeStartY;
    this.audio = QueenBeeAudio.getInstance();
  }

  public get isFlying(): boolean {
    return !this.isGrounded;
  }

  public set isFlying(val: boolean) {
    this.isGrounded = !val;
    this.altitude = val ? 40 : 0;
  }

  public get shieldsRemaining(): number {
    return this.activeShieldCount;
  }

  public set shieldsRemaining(val: number) {
    this.activeShieldCount = Number.isFinite(val)
      ? Math.max(0, Math.min(this.maxShields, Math.floor(val)))
      : 0;
  }

  /**
   * Queen Mellifera can ONLY take damage when grounded on the floor!
   * Grounded triggers: All 4 shields popped, corner launcher sniped, or dive-bomb crater miss.
   */
  public override canTakeDamage(): boolean {
    if (
      this.bossState === BossState.DEFEATED ||
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION
    ) {
      return false;
    }
    return this.isGrounded && !this.isFlying && this.bossState === BossState.STUNNED;
  }

  /**
   * Checks floor-level bomb damage. Rejected if flying.
   */
  public takeFloorBombDamage(damage: number = 1): boolean {
    if (this.isFlying) {
      return false; // Ground flames cannot reach flying boss
    }
    return this.takeBombDamage(damage);
  }

  protected override updatePhase1(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateFlightLoop(dt, playerX, playerY, 75);
  }

  protected override updatePhase2(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateFlightLoop(dt, playerX, playerY, 95);
  }

  protected override updateEnraged(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateFlightLoop(dt, playerX, playerY, 125);
  }

  private updateFlightLoop(
    dt: number,
    playerX: number,
    playerY: number,
    speed: number
  ): void {
    void speed;
    if (!Number.isFinite(dt) || dt <= 0 || this.isGrounded) return;

    const safeDt = Math.max(0, dt);

    // Continuous shield rotation across all active flight phases
    this.shieldRotationRad += 1.5 * (safeDt / 1000);

    if (this.isDiving) {
      if (!Number.isFinite(this.diveTimerMs)) {
        this.diveTimerMs = 0;
      }
      this.diveTimerMs -= safeDt;

      if (this.diveTimerMs <= 0) {
        this.onDiveImpact();
        return;
      }

      // Safe fractional interpolation capped to [0, 1] to prevent lag-spike velocity overshoots
      const remainingTime = Math.max(16, this.diveTimerMs + safeDt);
      const stepFactor = Math.min(1.0, Math.max(0.0, safeDt / remainingTime));
      this.x += (this.targetDiveX - this.x) * stepFactor;
      this.y += (this.targetDiveY - this.y) * stepFactor;
      this.clampPosition();
      return;
    }

    // ARCH-03: Automated periodic royal dive cadence to expose tactical grounding vulnerability
    if (
      this.bossState === BossState.PHASE_1 ||
      this.bossState === BossState.PHASE_2 ||
      this.bossState === BossState.ENRAGED
    ) {
      if (!Number.isFinite(this.timeUntilNextDiveMs)) {
        this.timeUntilNextDiveMs = this.bossState === BossState.ENRAGED ? 4000 : 5500;
      }
      this.timeUntilNextDiveMs -= safeDt;
      if (this.timeUntilNextDiveMs <= 0) {
        this.timeUntilNextDiveMs = this.bossState === BossState.ENRAGED ? 4000 : 5500;
        const validPx = Number.isFinite(playerX) && playerX >= this.minArenaX && playerX <= this.maxArenaX;
        const validPy = Number.isFinite(playerY) && playerY >= this.minArenaY && playerY <= this.maxArenaY;
        const targetX = validPx ? playerX : (Number.isFinite(this.x) ? this.x : 300);
        const targetY = validPy ? playerY : (Number.isFinite(this.y) ? this.y : 260);
        this.initiateRoyalDive(targetX, targetY);
        return;
      }
    }

    // Figure-8 cruising flight pattern with modulo wrap and boundary clamp
    if (!Number.isFinite(this.flightTimeSec)) {
      this.flightTimeSec = 0;
    }
    const flightPeriod = Math.PI * 10;
    this.flightTimeSec = (this.flightTimeSec + safeDt / 1000) % flightPeriod;
    const centerX = 300;
    const centerY = 260;
    this.x = centerX + Math.cos(this.flightTimeSec * 0.8) * 120;
    this.y = centerY + Math.sin(this.flightTimeSec * 1.6) * 60;
    this.clampPosition();
  }

  /**
   * Grounding Method 1: Sniped by Corner Pollen Launcher!
   */
  public snipeFromSky(): void {
    if (
      this.isGrounded ||
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION ||
      this.bossState === BossState.DEFEATED
    ) {
      return;
    }
    this.groundBoss(3.0); // 3.0s anti-air stun
  }

  /**
   * Grounding Method 2: Individual Rotating Shield Destroyed / Popped.
   */
  public popShield(): boolean {
    if (
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION ||
      this.bossState === BossState.DEFEATED
    ) {
      return false;
    }
    if (!Number.isFinite(this.activeShieldCount) || this.activeShieldCount <= 0) {
      this.activeShieldCount = 0;
      return false;
    }
    this.activeShieldCount = Math.max(0, this.activeShieldCount - 1);
    this.audio.playShieldShatter();
    if (this.activeShieldCount === 0) {
      this.groundBoss(3.0); // Engine overheat grounding
    }
    return true;
  }

  public onShieldDestroyed(): void {
    this.popShield();
  }

  /**
   * Grounding Method 3: Supersonic Royal Dive Impact ("Sugar Coma").
   */
  public initiateRoyalDive(playerX: number, playerY: number): void {
    const safeX = Number.isFinite(playerX) ? playerX : (Number.isFinite(this.x) ? this.x : 300);
    const safeY = Number.isFinite(playerY) ? playerY : (Number.isFinite(this.y) ? this.y : 260);
    this.targetDiveX = Math.max(this.minArenaX, Math.min(this.maxArenaX, safeX));
    this.targetDiveY = Math.max(this.minArenaY, Math.min(this.maxArenaY, safeY));
    this.diveTimerMs = 1200;
    this.isDiving = true;
    this.audio.playRoyalDiveWhoosh();
  }

  /**
   * Simulation / Testing dive execution
   */
  public executeDiveBomb(playerEvaded: boolean): string {
    if (playerEvaded) {
      this.groundBoss(2.5); // Dodged dive-bomb lodges into crater (2.5s Sugar Coma)
      return 'CRATER_STUN';
    }
    return 'HIT_PLAYER';
  }

  private onDiveImpact(bombInCrater: boolean = false): void {
    this.isDiving = false;
    this.diveTimerMs = 0;
    const safeX = Number.isFinite(this.targetDiveX) ? this.targetDiveX : 300;
    const safeY = Number.isFinite(this.targetDiveY) ? this.targetDiveY : 260;
    this.x = Math.max(this.minArenaX, Math.min(this.maxArenaX, safeX));
    this.y = Math.max(this.minArenaY, Math.min(this.maxArenaY, safeY));
    this.clampPosition();

    this.audio.playCraterImpact();

    if (bombInCrater) {
      this.groundBoss(3.5);
      this.takeBombDamage(1, 'bomb');
    } else {
      this.groundBoss(2.5); // 2.5s Sugar Coma crater stun
      this.audio.playDazedStars();
    }
  }

  public override applyStun(durationSec: number): void {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    if (
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION ||
      this.bossState === BossState.DEFEATED
    ) {
      return;
    }
    this.isGrounded = true;
    this.altitude = 0;
    this.isDiving = false;
    this.diveTimerMs = 0;
    this.clampPosition();
    super.applyStun(durationSec);
  }

  public groundBoss(stunDurationSec: number): void {
    this.applyStun(stunDurationSec);
  }

  protected override onHitReceived(damage: number, isChained: boolean): void {
    void damage;
    // Ground impact damage disrupts bee flight mechanics and chips rotating shields
    if (this.activeShieldCount > 0) {
      this.activeShieldCount = Math.max(0, this.activeShieldCount - 1);
      this.audio.playShieldShatter();
    }
    if (isChained) {
      this.enrageGauge = Math.min(100, this.enrageGauge + 5);
    }
  }

  protected override onDamageBlocked(): void {
    // Airborne flight deflects ground blast; brief upward gust elevation
    this.altitude = Math.min(60, this.altitude + 6);
  }

  protected override onStateChanged(
    prevState: BossState,
    nextState: BossState
  ): void {
    void prevState;
    if (nextState !== BossState.STUNNED && nextState !== BossState.DEFEATED) {
      this.isGrounded = false;
      this.altitude = 40;
      this.timeUntilNextDiveMs = nextState === BossState.ENRAGED ? 3500 : 5000;
    }
    if (
      nextState === BossState.INTERMISSION ||
      (prevState === BossState.STUNNED && nextState !== BossState.DEFEATED)
    ) {
      this.activeShieldCount = this.maxShields;
    }
    if (nextState === BossState.PHASE_2 || nextState === BossState.ENRAGED) {
      this.audio.playPhaseTransition(nextState);
    }
  }

  protected override onDefeated(): void {
    this.isGrounded = true;
    this.altitude = 0;
    this.isDiving = false;
    this.diveTimerMs = 0;
    this.clampPosition();
    this.audio.playDefeatSweetNectar();
  }

  public override destroy(): void {
    this.isDiving = false;
    this.diveTimerMs = 0;
    this.audio.destroy();
    super.destroy();
  }
}
