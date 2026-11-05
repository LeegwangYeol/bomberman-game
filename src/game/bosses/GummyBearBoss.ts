/**
 * GummyBearBoss.ts — King Gummy Bear (Colossus of Gelatin)
 *
 * Implements Royal Jelly Bounce (Parabolic Leap), Sugar Crush shockwaves,
 * Gummy Minion Spawns, and Masterplay Lure Landing Stun (2.2s -> 4.0s).
 *
 * Hardened Architectural Invariants:
 * - 100% Procedural Web Audio Synthesis integration via GummyBearAudio.
 * - Strict arena boundary confinement ([60, 540] x [60, 460]) eliminating clipping breaches.
 * - Finite float protections and non-overshooting leap interpolation.
 * - Clean lifecycle disposal with complete audio and pool teardown.
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState } from './BossTypes.ts';
import { GummyBearAudio } from './GummyBearAudio.ts';

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
  public stepTimerMs: number = 0;
  public landingBombCheck?: () => boolean;
  public audio: GummyBearAudio;

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
    const safeStartX = Number.isFinite(startX) ? Math.max(60, Math.min(startX, 540)) : 300;
    const safeStartY = Number.isFinite(startY) ? Math.max(60, Math.min(startY, 460)) : 260;
    super(config, safeStartX, safeStartY);
    this.targetLandingX = safeStartX;
    this.targetLandingY = safeStartY;
    this.audio = GummyBearAudio.getInstance();
  }

  /**
   * King Gummy can ONLY take damage during landing pancake squash or stunned state!
   * While marching, his thick gelatin skin absorbs bomb blasts with 0 damage.
   */
  public override canTakeDamage(): boolean {
    if (
      this.bossState === BossState.DEFEATED ||
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.INTERMISSION ||
      this.isAirborne
    ) {
      return false;
    }
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
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.max(0, dt);

    if (this.isAirborne) {
      if (!Number.isFinite(this.leapTimerMs)) {
        this.leapTimerMs = 0;
      }
      this.leapTimerMs -= safeDt;
      const progress = Math.min(
        1.0,
        Math.max(0.0, 1.0 - this.leapTimerMs / Math.max(1, this.leapDurationMs))
      );
      this.leapElevation = Math.max(0, Math.sin(progress * Math.PI) * 64); // Peak at 64px

      if (this.leapTimerMs <= 0) {
        const hasBomb =
          typeof this.landingBombCheck === 'function' ? this.landingBombCheck() : false;
        this.onTouchdown(hasBomb);
        return;
      }

      // Safe fractional interpolation capped to [0, 1] to prevent lag-spike velocity overshoots
      const remainingTime = Math.max(16, this.leapTimerMs + safeDt);
      const stepFactor = Math.min(1.0, Math.max(0.0, safeDt / remainingTime));
      this.x += (this.targetLandingX - this.x) * stepFactor;
      this.y += (this.targetLandingY - this.y) * stepFactor;
      this.clampPosition();
      return;
    }

    this.attackCooldownMs -= safeDt;
    if (this.attackCooldownMs <= 0) {
      const validPx = Number.isFinite(playerX) && playerX > 0 ? playerX : this.x;
      const validPy = Number.isFinite(playerY) && playerY > 0 ? playerY : this.y;
      this.initiateRoyalLeap(validPx, validPy, leapDuration);
      this.attackCooldownMs = cooldown;
    } else {
      // Ponderous march toward player quadrant
      const validPx = Number.isFinite(playerX) ? playerX : this.x;
      const validPy = Number.isFinite(playerY) ? playerY : this.y;
      const dx = validPx - this.x;
      const dy = validPy - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        let vx = (dx / dist) * this.currentSpeed;
        let vy = (dy / dist) * this.currentSpeed;
        if (Math.abs(vx) < 1e-15) vx = 0;
        if (Math.abs(vy) < 1e-15) vy = 0;
        this.vx = vx;
        this.vy = vy;
        this.x += this.vx * (safeDt / 1000);
        this.y += this.vy * (safeDt / 1000);
        this.clampPosition();

        // Periodic ponderous march wobble sound
        this.stepTimerMs += safeDt;
        if (this.stepTimerMs >= 650) {
          this.stepTimerMs = 0;
          this.audio.playPonderousMarch();
        }
      } else {
        this.vx = 0;
        this.vy = 0;
      }
    }
  }

  public initiateRoyalLeap(
    targetX: number,
    targetY: number,
    durationMs: number = 1800
  ): void {
    const safeX = Number.isFinite(targetX) ? targetX : (Number.isFinite(this.x) ? this.x : 300);
    const safeY = Number.isFinite(targetY) ? targetY : (Number.isFinite(this.y) ? this.y : 260);
    this.targetLandingX = Math.max(this.minArenaX, Math.min(this.maxArenaX, safeX));
    this.targetLandingY = Math.max(this.minArenaY, Math.min(this.maxArenaY, safeY));
    this.leapDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 1800;
    this.leapTimerMs = this.leapDurationMs;
    this.isAirborne = true;
    this.isSquashedPancake = false;
    this.leapCount++;
    this.audio.playRoyalJellyBounce();
  }

  /**
   * Touchdown resolution: handles radial shockwave, puddles, minion buds, and landing stun.
   */
  public onTouchdown(hasBombOnLandingTile: boolean = false): void {
    this.isAirborne = false;
    this.leapElevation = 0;
    this.x = Number.isFinite(this.targetLandingX) ? this.targetLandingX : 300;
    this.y = Number.isFinite(this.targetLandingY) ? this.targetLandingY : 260;
    this.clampPosition();
    this.vx = 0;
    this.vy = 0;
    this.isInvulnerable = false;
    this.iFrameTimerMs = 0;

    this.audio.playSugarCrushSlam(hasBombOnLandingTile);

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
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const toSpawn = Math.min(safeCount, this.maxCubs - this.activeCubCount);
    if (toSpawn > 0) {
      this.activeCubCount += toSpawn;
      this.audio.playMinionCubPop();
    }
  }

  public onMinionDefeated(): void {
    this.activeCubCount = Math.max(0, this.activeCubCount - 1);
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
    this.isAirborne = false;
    this.leapElevation = 0;
    this.clampPosition();
    super.applyStun(durationSec);
  }

  protected override onHitReceived(damage: number, isChained: boolean): void {
    if (isChained) {
      this.isSquashedPancake = true;
    }
    this.currentSpeed = Math.max(30, this.currentSpeed - damage * 2);
  }

  protected override onDamageBlocked(): void {
    // Blast absorbed by thick gelatin skin; knock back 1 tile
    this.audio.playGelatinSkinDeflection();
    this.x -= Math.sign(this.vx || 1) * 20;
    this.y -= Math.sign(this.vy || 1) * 20;
    this.clampPosition();
  }

  protected override onStateChanged(
    prevState: BossState,
    nextState: BossState
  ): void {
    void prevState;
    if (nextState !== BossState.STUNNED) {
      this.isSquashedPancake = false;
    }
    if (nextState === BossState.PHASE_2 || nextState === BossState.ENRAGED) {
      this.audio.playPhaseTransition(this.phase);
    }
  }

  protected override onDefeated(): void {
    this.isAirborne = false;
    this.isSquashedPancake = false;
    this.clampPosition();
    this.audio.playDefeatGelatinDissolution();
  }

  public override destroy(): void {
    this.isAirborne = false;
    this.isSquashedPancake = false;
    this.audio.destroy();
    super.destroy();
  }
}
