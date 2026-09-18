/**
 * QueenBeeBoss.ts — Queen Mellifera (Queen Bee Cupcake)
 *
 * Implements 3D Aerial Sovereign Flight (immune to floor bomb flames), 4 Rotating Shields,
 * Honey Carpet caramelization, Stinger Salvo, Anti-Air Pollen Sniping, and Supersonic Dive Coma.
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState } from './BossTypes.ts';

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
    super(config, startX, startY);
    this.activeShieldCount = 4;
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
    this.activeShieldCount = val;
  }

  /**
   * Queen Mellifera can ONLY take damage when grounded on the floor!
   * Grounded triggers: All 4 shields popped, corner launcher sniped, or dive-bomb crater miss.
   */
  public override canTakeDamage(): boolean {
    return this.isGrounded && this.bossState === BossState.STUNNED;
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
    // Update rotating flower shields
    this.shieldRotationRad += 1.5 * (dt / 1000);
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
    void playerX;
    void playerY;
    void speed;
    if (this.isGrounded) return;

    if (this.isDiving) {
      this.diveTimerMs -= dt;
      // High speed plunge toward crater
      this.x += (this.targetDiveX - this.x) * (dt / Math.max(16, this.diveTimerMs));
      this.y += (this.targetDiveY - this.y) * (dt / Math.max(16, this.diveTimerMs));

      if (this.diveTimerMs <= 0) {
        this.onDiveImpact();
      }
      return;
    }

    // ARCH-03: Automated periodic royal dive cadence to expose tactical grounding vulnerability
    if (
      this.bossState === BossState.PHASE_1 ||
      this.bossState === BossState.PHASE_2 ||
      this.bossState === BossState.ENRAGED
    ) {
      this.timeUntilNextDiveMs -= dt;
      if (this.timeUntilNextDiveMs <= 0) {
        this.timeUntilNextDiveMs = this.bossState === BossState.ENRAGED ? 4000 : 5500;
        const targetX = playerX > 0 ? playerX : this.x;
        const targetY = playerY > 0 ? playerY : this.y;
        this.initiateRoyalDive(targetX, targetY);
        return;
      }
    }

    // Figure-8 cruising flight pattern
    this.flightTimeSec += dt / 1000;
    const centerX = 300;
    const centerY = 260;
    this.x = centerX + Math.cos(this.flightTimeSec * 0.8) * 120;
    this.y = centerY + Math.sin(this.flightTimeSec * 1.6) * 60;
  }

  /**
   * Grounding Method 1: Sniped by Corner Pollen Launcher!
   */
  public snipeFromSky(): void {
    if (this.isGrounded) return;
    this.groundBoss(3.0); // 3.0s anti-air stun
  }

  /**
   * Grounding Method 2: Individual Rotating Shield Destroyed / Popped.
   */
  public popShield(): boolean {
    if (this.activeShieldCount <= 0) return false;
    this.activeShieldCount--;
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
    this.isDiving = true;
    this.targetDiveX = playerX;
    this.targetDiveY = playerY;
    this.diveTimerMs = 1200;
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
    this.x = this.targetDiveX;
    this.y = this.targetDiveY;

    if (bombInCrater) {
      this.groundBoss(3.5);
      this.takeBombDamage(1, 'bomb');
    } else {
      this.groundBoss(2.5); // 2.5s Sugar Coma crater stun
    }
  }

  public groundBoss(stunDurationSec: number): void {
    this.isGrounded = true;
    this.altitude = 0;
    this.applyStun(stunDurationSec);
  }

  protected override onHitReceived(damage: number, isChained: boolean): void {
    void damage;
    void isChained;
  }

  protected override onDamageBlocked(): void {
    // Airborne immunity deflects ground blast
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
    if (nextState === BossState.INTERMISSION) {
      this.activeShieldCount = this.maxShields;
    }
  }

  protected override onDefeated(): void {
    this.isGrounded = true;
    this.altitude = 0;
    this.isDiving = false;
  }
}
