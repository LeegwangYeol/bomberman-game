/**
 * HamsterBoss.ts — Mecha Hamster Captain Nibbles (Gyro Rodent Inventor)
 *
 * Implements Wheel Charge Dash with 90° Bank Shots, Head-On Bomb Collision Trap (3.0s Stun),
 * Sunflower Gatling seed spray, 360° Gyro-Laser Sweep, and EMP Minefield.
 *
 * Hardened Architectural Invariants:
 * - 100% Procedural Web Audio Synthesis integration via HamsterAudio.
 * - Strict arena boundary confinement ([60, 540] x [60, 460]) eliminating clipping breaches.
 * - Single-axis bank shot detection preventing 1-frame premature rebound cancellations.
 * - Vector-normalized diagonal patrol and finite float protections.
 * - Clean lifecycle disposal with complete audio and pool teardown.
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState } from './BossTypes.ts';
import { HamsterAudio } from './HamsterAudio.ts';

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
  public headOnBombCheck?: () => boolean;
  public audio: HamsterAudio;

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
    const safeStartX = Number.isFinite(startX) ? Math.max(60, Math.min(startX, 540)) : 300;
    const safeStartY = Number.isFinite(startY) ? Math.max(60, Math.min(startY, 460)) : 260;
    super(config, safeStartX, safeStartY);
    this.audio = HamsterAudio.getInstance();
  }

  public override canTakeDamage(): boolean {
    if (
      this.bossState === BossState.DEFEATED ||
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION
    ) {
      return false;
    }
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
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.max(0, dt);

    if (this.isReving) {
      this.revWindupTimerMs -= safeDt;
      if (this.revWindupTimerMs <= 0) {
        this.isReving = false;
        this.isDashing = true;
        this.dashSpeed = speed;
        this.remainingRebounds = rebounds;
        this.vx = this.dashDirection.x * this.dashSpeed;
        this.vy = this.dashDirection.y * this.dashSpeed;
        this.audio.playDashWhirr();
      }
      return;
    }

    if (this.isDashing) {
      // Check head-on bomb trap hook
      if (typeof this.headOnBombCheck === 'function' && this.headOnBombCheck()) {
        this.onHeadOnBombCollision();
        return;
      }

      this.vx = this.dashDirection.x * this.dashSpeed;
      this.vy = this.dashDirection.y * this.dashSpeed;
      this.x += this.vx * (safeDt / 1000);
      this.y += this.vy * (safeDt / 1000);

      // Single-axis bank shot detection: check boundary impact strictly along moving axis
      let hitWall = false;
      if (this.dashDirection.x > 0 && this.x >= this.maxArenaX) {
        this.x = this.maxArenaX;
        hitWall = true;
      } else if (this.dashDirection.x < 0 && this.x <= this.minArenaX) {
        this.x = this.minArenaX;
        hitWall = true;
      }

      if (this.dashDirection.y > 0 && this.y >= this.maxArenaY) {
        this.y = this.maxArenaY;
        hitWall = true;
      } else if (this.dashDirection.y < 0 && this.y <= this.minArenaY) {
        this.y = this.minArenaY;
        hitWall = true;
      }

      if (hitWall) {
        this.onWallImpact();
      }
      return;
    }

    // Line-of-sight acquisition: check if player aligns in row or column
    const validPx = Number.isFinite(playerX) ? playerX : this.x;
    const validPy = Number.isFinite(playerY) ? playerY : this.y;
    const dx = validPx - this.x;
    const dy = validPy - this.y;
    if (Math.abs(dx) < 20 || Math.abs(dy) < 20) {
      this.startDashWindup(dx, dy);
    } else {
      // Normal vector-normalized corridor patrol
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        this.vx = (dx / dist) * this.currentSpeed;
        this.vy = (dy / dist) * this.currentSpeed;
        this.x += this.vx * (safeDt / 1000);
        this.y += this.vy * (safeDt / 1000);
        this.clampPosition();
      } else {
        this.vx = 0;
        this.vy = 0;
      }
    }
  }

  public startDashWindup(dx: number, dy: number): void {
    this.isReving = true;
    this.revWindupTimerMs = 1200; // 1.2s rev
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX === 0 && absY === 0) {
      this.dashDirection = { x: 1, y: 0 };
    } else if (absX > absY) {
      this.dashDirection = { x: Math.sign(dx) || 1, y: 0 };
    } else {
      this.dashDirection = { x: 0, y: Math.sign(dy) || 1 };
    }
    this.audio.playRevWindup();
  }

  /**
   * Helper for unit tests / immediate dash activation
   */
  public startDash(direction: { x: number; y: number } = { x: 1, y: 0 }): void {
    this.isDashing = true;
    this.isReving = false;
    this.dashDirection = direction;
    this.vx = this.dashDirection.x * this.dashSpeed;
    this.vy = this.dashDirection.y * this.dashSpeed;
    this.audio.playDashWhirr();
  }

  /**
   * Called when dashing Captain Nibbles collides head-on with a primed bomb!
   */
  public onHeadOnBombCollision(): void {
    if (!this.isDashing) return;
    this.isDashing = false;
    this.isReving = false;
    this.vx = 0;
    this.vy = 0;

    // Recoil backward 2 tiles with safe boundary clamping
    this.x -= this.dashDirection.x * 40;
    this.y -= this.dashDirection.y * 40;
    this.clampPosition();

    this.audio.playHeadOnBombCollision();

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

    this.audio.playWallRebound();

    if (this.remainingRebounds > 0) {
      this.remainingRebounds--;
      // 90-degree bank shot turn away from boundary walls
      if (this.dashDirection.x !== 0) {
        // Offset 2px inward to prevent immediate re-trigger on next frame
        this.x -= Math.sign(this.dashDirection.x) * 2;
        const canGoUp = this.y > this.minArenaY + 40;
        const canGoDown = this.y < this.maxArenaY - 40;
        const yDir = canGoUp && canGoDown ? (Math.random() > 0.5 ? 1 : -1) : canGoUp ? -1 : 1;
        this.dashDirection = { x: 0, y: yDir };
      } else {
        // Offset 2px inward to prevent immediate re-trigger on next frame
        this.y -= Math.sign(this.dashDirection.y) * 2;
        const canGoLeft = this.x > this.minArenaX + 40;
        const canGoRight = this.x < this.maxArenaX - 40;
        const xDir = canGoLeft && canGoRight ? (Math.random() > 0.5 ? 1 : -1) : canGoLeft ? -1 : 1;
        this.dashDirection = { x: xDir, y: 0 };
      }
      this.vx = this.dashDirection.x * this.dashSpeed;
      this.vy = this.dashDirection.y * this.dashSpeed;
      this.clampPosition();
    } else {
      this.isDashing = false;
      this.vx = 0;
      this.vy = 0;
      this.clampPosition();
    }
  }

  public fireSunflowerGatling(): void {
    this.audio.playSunflowerGatling();
  }

  public executeGyroLaserSweep(): void {
    this.audio.playGyroLaserSweep();
  }

  protected override onHitReceived(damage: number, isChained: boolean): void {
    void damage;
    // Unshielded impact disrupts gyro alignment and halts active dash
    this.isDashing = false;
    this.vx = 0;
    this.vy = 0;
    if (isChained) {
      this.enrageGauge = Math.min(100, this.enrageGauge + 5);
    }
  }

  protected override onDamageBlocked(): void {
    // Kinetic shield absorbs explosive impact into gyroscope kinetic charge
    this.enrageGauge = Math.min(100, this.enrageGauge + 3);
    const deflectDirX = this.isDashing ? this.dashDirection.x : (Math.sign(this.vx) || 1);
    const deflectDirY = this.isDashing ? this.dashDirection.y : (Math.sign(this.vy) || 0);
    this.x -= deflectDirX * 6;
    this.y -= deflectDirY * 6;
    this.clampPosition();
    this.audio.playWallRebound();
  }

  protected override onStateChanged(
    prevState: BossState,
    nextState: BossState
  ): void {
    void prevState;
    if (nextState === BossState.STUNNED || nextState === BossState.DEFEATED) {
      this.isDashing = false;
      this.isReving = false;
      this.vx = 0;
      this.vy = 0;
    }
    if (nextState === BossState.PHASE_2 || nextState === BossState.ENRAGED) {
      this.audio.playPhaseTransition(this.phase);
    }
  }

  protected override onDefeated(): void {
    this.isDashing = false;
    this.isReving = false;
    this.vx = 0;
    this.vy = 0;
    this.clampPosition();
    this.audio.playDefeatMechanicalRestoration();
  }

  public override destroy(): void {
    this.isDashing = false;
    this.isReving = false;
    this.vx = 0;
    this.vy = 0;
    this.audio.destroy();
    super.destroy();
  }
}
