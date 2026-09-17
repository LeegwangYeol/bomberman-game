/**
 * GummyBearBoss.ts — King Gummy Bear (Colossus of Gelatin)
 *
 * Implements Royal Jelly Bounce (Parabolic Leap), Sugar Crush shockwaves,
 * Gummy Minion Spawns, and Masterplay Lure Landing Stun (2.2s -> 4.0s).
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState } from './BossTypes.ts';

export class GummyBearBoss extends BaseBoss {
  public isAirborne: boolean = false;
  public leapElevation: number = 0;
  public targetLandingX: number = 0;
  public targetLandingY: number = 0;
  public leapTimerMs: number = 0;
  public leapDurationMs: number = 1800; // 1.8s airtime Phase 1
  public attackCooldownMs: number = 2500;
  public leapCount: number = 0;
  public activeCubCount: number = 0;
  public readonly maxCubs: number = 4;
  public isSquashedPancake: boolean = false;

  constructor(startX: number = 300, startY: number = 260) {
    const config: BossConfig = {
      id: 'boss_gummy_bear',
      name: 'King Gummy Bear',
      title: 'Colossus of Gelatin',
      avatarEmoji: '👑🐻',
      maxHp: 9, // 3 / 3 / 3
      footprintWidth: 80,
      footprintHeight: 80,
      colliderRadius: 35,
      baseSpeed: 80,
      phase2HpThreshold: 0.7, // <= 6 HP
      phase3HpThreshold: 0.33, // <= 3 HP
    };
    super(config, startX, startY);
  }

  /**
   * King Gummy can ONLY take damage during landing pancake squash or stunned state!
   * While marching, his thick gelatin skin absorbs bomb blasts with 0 damage.
   */
  public override canTakeDamage(): boolean {
    if (this.isAirborne) return false;
    return this.bossState === BossState.STUNNED || this.isSquashedPancake;
  }

  protected override updatePhase1(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateCombatLoop(dt, playerX, playerY, 1800, 2500);
  }

  protected override updatePhase2(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateCombatLoop(dt, playerX, playerY, 1200, 2000);
  }

  protected override updateEnraged(
    dt: number,
    playerX: number,
    playerY: number
  ): void {
    this.updateCombatLoop(dt, playerX, playerY, 900, 1200);
  }

  private updateCombatLoop(
    dt: number,
    playerX: number,
    playerY: number,
    leapDuration: number,
    cooldown: number
  ): void {
    if (this.isAirborne) {
      this.leapTimerMs -= dt;
      const progress = 1.0 - this.leapTimerMs / this.leapDurationMs;
      this.leapElevation = Math.sin(progress * Math.PI) * 64; // Peak at 64px

      // Interpolate position toward landing target
      this.x += (this.targetLandingX - this.x) * (dt / Math.max(16, this.leapTimerMs));
      this.y += (this.targetLandingY - this.y) * (dt / Math.max(16, this.leapTimerMs));

      if (this.leapTimerMs <= 0) {
        this.onTouchdown();
      }
      return;
    }

    this.attackCooldownMs -= dt;
    if (this.attackCooldownMs <= 0) {
      this.initiateRoyalLeap(playerX, playerY, leapDuration);
      this.attackCooldownMs = cooldown;
    } else {
      // Ponderous march toward player quadrant
      const dx = playerX - this.x;
      const dy = playerY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        this.vx = (dx / dist) * this.currentSpeed;
        this.vy = (dy / dist) * this.currentSpeed;
        this.x += this.vx * (dt / 1000);
        this.y += this.vy * (dt / 1000);
      }
    }
  }

  public initiateRoyalLeap(
    targetX: number,
    targetY: number,
    durationMs: number = 1800
  ): void {
    this.isAirborne = true;
    this.targetLandingX = targetX;
    this.targetLandingY = targetY;
    this.leapDurationMs = durationMs;
    this.leapTimerMs = durationMs;
    this.isSquashedPancake = false;
    this.leapCount++;
  }

  /**
   * Touchdown resolution: handles radial shockwave, puddles, minion buds, and landing stun.
   */
  public onTouchdown(hasBombOnLandingTile: boolean = false): void {
    this.isAirborne = false;
    this.leapElevation = 0;
    this.x = this.targetLandingX;
    this.y = this.targetLandingY;
    this.vx = 0;
    this.vy = 0;
    this.isInvulnerable = false;
    this.iFrameTimerMs = 0;

    // Masterplay Lure Check: Did he land on an active primed bomb?
    if (hasBombOnLandingTile) {
      this.isSquashedPancake = true;
      this.takeBombDamage(1, 'bomb');
      this.applyStun(4.0); // Extended 4.0s Stun!
      return;
    }

    // Normal Landing: Flatten into pancake and stun for 2.2s
    this.isSquashedPancake = true;
    this.applyStun(2.2);

    // Phase 2+ Jelly Budding (Minion Spawns)
    if (this.phase >= 2 && this.leapCount % 2 === 0 && this.activeCubCount < this.maxCubs) {
      this.spawnMinionCubs(2);
    }
  }

  /**
   * Convenience alias for simulation and unit testing
   */
  public land(hasBombOnLandingTile: boolean = false): string {
    const isLure = hasBombOnLandingTile;
    this.onTouchdown(hasBombOnLandingTile);
    return isLure ? 'MASTERPLAY_LURE' : 'STANDARD_LANDING';
  }

  public spawnMinionCubs(count: number): void {
    const toSpawn = Math.min(count, this.maxCubs - this.activeCubCount);
    this.activeCubCount += toSpawn;
  }

  public onMinionDefeated(): void {
    this.activeCubCount = Math.max(0, this.activeCubCount - 1);
  }

  protected override onHitReceived(damage: number, isChained: boolean): void {
    void damage;
    void isChained;
  }

  protected override onDamageBlocked(): void {
    // Blast absorbed by thick gelatin skin; knock back 1 tile
    this.x -= Math.sign(this.vx || 1) * 20;
    this.y -= Math.sign(this.vy || 1) * 20;
  }

  protected override onStateChanged(
    prevState: BossState,
    nextState: BossState
  ): void {
    void prevState;
    if (nextState !== BossState.STUNNED) {
      this.isSquashedPancake = false;
    }
  }

  protected override onDefeated(): void {
    this.isAirborne = false;
    this.isSquashedPancake = false;
  }
}
