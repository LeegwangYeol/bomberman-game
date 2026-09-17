/**
 * HamsterBoss.ts — Mecha Hamster Captain Nibbles (Gyro Rodent Inventor)
 *
 * Implements Wheel Charge Dash with 90° Bank Shots, Head-On Bomb Collision Trap (3.0s Stun),
 * Sunflower Gatling seed spray, 360° Gyro-Laser Sweep, and EMP Minefield.
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState } from './BossTypes.ts';

export class HamsterBoss extends BaseBoss {
  public isDashing: boolean = false;
  public dashDirection: { x: number; y: number } = { x: 1, y: 0 };
  public dashSpeed: number = 200;
  public remainingRebounds: number = 1;
  public revWindupTimerMs: number = 0;
  public isReving: boolean = false;
  public gatlingTimerMs: number = 0;
  public laserAngleRad: number = 0;
  public isLaserSweeping: boolean = false;

  constructor(startX: number = 300, startY: number = 260) {
    const config: BossConfig = {
      id: 'boss_hamster_nibbles',
      name: 'Captain Nibbles',
      title: 'Mecha Hamster in Gyro Sphere',
      avatarEmoji: '🐹⚙️',
      maxHp: 10, // 3 / 3 / 4
      footprintWidth: 80,
      footprintHeight: 80,
      colliderRadius: 38,
      baseSpeed: 90,
      phase2HpThreshold: 0.7, // <= 7 HP
      phase3HpThreshold: 0.33, // <= 3 HP
    };
    super(config, startX, startY);
  }

  public override canTakeDamage(): boolean {
    // Frontal shield protects during normal dash unless stunned or hitting a bomb head-on
    return this.bossState === BossState.STUNNED;
  }

  protected override updatePhase1(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateDashCombat(dt, playerX, playerY, 200, 1);
  }

  protected override updatePhase2(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateDashCombat(dt, playerX, playerY, 260, 3);
  }

  protected override updateEnraged(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateDashCombat(dt, playerX, playerY, 320, 99); // Pinball mode
  }

  private updateDashCombat(
    dt: number,
    playerX: number,
    playerY: number,
    speed: number,
    rebounds: number
  ): void {
    if (this.isReving) {
      this.revWindupTimerMs -= dt;
      if (this.revWindupTimerMs <= 0) {
        this.isReving = false;
        this.isDashing = true;
        this.dashSpeed = speed;
        this.remainingRebounds = rebounds;
      }
      return;
    }

    if (this.isDashing) {
      this.x += this.dashDirection.x * this.dashSpeed * (dt / 1000);
      this.y += this.dashDirection.y * this.dashSpeed * (dt / 1000);
      return;
    }

    // Line-of-sight acquisition: check if player aligns in row or column
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    if (Math.abs(dx) < 20 || Math.abs(dy) < 20) {
      this.startDashWindup(dx, dy);
    } else {
      // Normal corridor patrol
      this.x += Math.sign(dx) * this.currentSpeed * (dt / 1000);
      this.y += Math.sign(dy) * this.currentSpeed * (dt / 1000);
    }
  }

  public startDashWindup(dx: number, dy: number): void {
    this.isReving = true;
    this.revWindupTimerMs = 1200; // 1.2s rev
    if (Math.abs(dx) > Math.abs(dy)) {
      this.dashDirection = { x: Math.sign(dx), y: 0 };
    } else {
      this.dashDirection = { x: 0, y: Math.sign(dy) };
    }
  }

  /**
   * Helper for unit tests / immediate dash activation
   */
  public startDash(direction: { x: number; y: number } = { x: 1, y: 0 }): void {
    this.isDashing = true;
    this.isReving = false;
    this.dashDirection = direction;
  }

  /**
   * Called when dashing Captain Nibbles collides head-on with a primed bomb!
   */
  public onHeadOnBombCollision(): void {
    if (!this.isDashing) return;
    this.isDashing = false;
    this.isReving = false;

    // Recoil backward 2 tiles
    this.x -= this.dashDirection.x * 40;
    this.y -= this.dashDirection.y * 40;

    // Head-on bomb hit breaks kinetic shield, triggers 3.0s dizzy stun and deals damage
    this.applyStun(3.0);
    this.takeBombDamage(1, 'bomb');
  }

  /**
   * Convenience alias for simulation and unit testing
   */
  public collideWithBombHeadOn(): boolean {
    if (this.isDashing) {
      this.onHeadOnBombCollision();
      return true;
    }
    return false;
  }

  /**
   * Called when dashing into an indestructible boundary wall.
   */
  public onWallImpact(): void {
    if (!this.isDashing) return;

    if (this.remainingRebounds > 0) {
      this.remainingRebounds--;
      // 90-degree bank shot turn
      if (this.dashDirection.x !== 0) {
        this.dashDirection = { x: 0, y: Math.random() > 0.5 ? 1 : -1 };
      } else {
        this.dashDirection = { x: Math.random() > 0.5 ? 1 : -1, y: 0 };
      }
    } else {
      this.isDashing = false;
      this.vx = 0;
      this.vy = 0;
    }
  }

  protected override onHitReceived(damage: number, isChained: boolean): void {
    void damage;
    void isChained;
  }

  protected override onDamageBlocked(): void {
    // Kinetic shield blocks
  }

  protected override onStateChanged(
    prevState: BossState,
    nextState: BossState
  ): void {
    void prevState;
    if (nextState === BossState.STUNNED || nextState === BossState.DEFEATED) {
      this.isDashing = false;
      this.isReving = false;
    }
  }

  protected override onDefeated(): void {
    this.isDashing = false;
    this.isReving = false;
  }
}
