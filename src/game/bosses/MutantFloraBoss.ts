/**
 * MutantFloraBoss.ts — Verdant Terror (Mutant Flora)
 *
 * Implements Subterranean Roots, Pollen Clouds, and Vine Whips.
 * Zero-GC pooling via ObjectPool, safe arena boundary collision clamping,
 * procedural Web Audio synthesis via MutantFloraAudio, and strict NaN-velocity immunity.
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState, BossProjectileType } from './BossTypes.ts';
import { ObjectPool } from '../pooling/ObjectPool.ts';
import type { BossAttackManager } from './BossAttackManager.ts';
import { MutantFloraAudio } from './MutantFloraAudio.ts';

export interface FloraRootHazard {
  id: number;
  active: boolean;
  x: number;
  y: number;
  col: number;
  row: number;
  radius: number;
  timerMs: number;
  durationMs: number;
  damage: number;
  isTelegraph: boolean;
}

export class MutantFloraBoss extends BaseBoss {
  public rootTimerMs: number = 4000;
  public pollenTimerMs: number = 3000;
  public activeRoots: number = 0;
  public readonly maxRoots: number = 6;

  // Mechanics flags and timers
  public isUnderground: boolean = false;
  public undergroundTimerMs: number = 0;
  public vineWhipCooldownMs: number = 4000;
  public isVineWhipping: boolean = false;

  // Zero-GC root hazard pool
  public readonly rootPool: ObjectPool<FloraRootHazard>;

  // Dedicated procedural audio synthesizer
  public readonly audio: MutantFloraAudio;

  // Optional connection to universal BossAttackManager
  public attackManager: BossAttackManager | null = null;

  constructor(startX: number = 300, startY: number = 260) {
    const config: BossConfig = {
      id: 'boss_mutant_flora',
      name: 'Verdant Terror',
      title: 'Overgrown Carnivorous Plant',
      avatarEmoji: '🌿',
      maxHp: 15,
      footprintWidth: 100,
      footprintHeight: 100,
      colliderRadius: 40,
      baseSpeed: 50,
      phase2HpThreshold: 0.60,
      phase3HpThreshold: 0.30,
    };
    const safeX = Number.isFinite(startX) ? Math.max(60, Math.min(startX, 540)) : 300;
    const safeY = Number.isFinite(startY) ? Math.max(60, Math.min(startY, 460)) : 260;
    super(config, safeX, safeY);

    this.audio = MutantFloraAudio.getInstance();

    this.rootTimerMs = 4000;
    this.pollenTimerMs = 3000;
    this.vineWhipCooldownMs = 4000;

    // Contiguous Zero-GC ObjectPool for Subterranean Root Hazards (Capacity 16)
    this.rootPool = new ObjectPool<FloraRootHazard>({
      capacity: 16,
      factory: (i) => ({
        id: i,
        active: false,
        x: 0,
        y: 0,
        col: 0,
        row: 0,
        radius: 20,
        timerMs: 0,
        durationMs: 25000,
        damage: 1,
        isTelegraph: true,
      }),
      reset: (r) => {
        r.active = false;
        r.timerMs = 0;
        r.x = 0;
        r.y = 0;
        r.col = 0;
        r.row = 0;
        r.isTelegraph = true;
      },
    });
  }

  public override canTakeDamage(): boolean {
    if (
      this.bossState === BossState.DEFEATED ||
      this.bossState === BossState.INTERMISSION ||
      this.bossState === BossState.INTRO
    ) {
      return false;
    }
    if (this.isUnderground) {
      return false;
    }
    if (this.isInvulnerable && this.comboBufferTimerMs <= 0) {
      return false;
    }
    return true;
  }

  /**
   * Spawns a subterranean root cluster at target coordinates using Zero-GC pool.
   */
  public spawnSubterraneanRoot(targetX: number = this.x, targetY: number = this.y): FloraRootHazard | null {
    if (this.activeRoots >= this.maxRoots) {
      return null;
    }

    const arenaMidX = (this.minArenaX + this.maxArenaX) / 2;
    const arenaMidY = (this.minArenaY + this.maxArenaY) / 2;
    const fallbackX = Number.isFinite(this.x)
      ? Math.max(this.minArenaX, Math.min(this.maxArenaX, this.x))
      : arenaMidX;
    const fallbackY = Number.isFinite(this.y)
      ? Math.max(this.minArenaY, Math.min(this.maxArenaY, this.y))
      : arenaMidY;

    const rawTargetX = typeof targetX === 'number' && Number.isFinite(targetX) ? targetX : fallbackX;
    const rawTargetY = typeof targetY === 'number' && Number.isFinite(targetY) ? targetY : fallbackY;

    const safeTargetX = Math.max(this.minArenaX, Math.min(this.maxArenaX, rawTargetX));
    const safeTargetY = Math.max(this.minArenaY, Math.min(this.maxArenaY, rawTargetY));

    const targetCol = Math.max(1, Math.min(13, Math.floor(safeTargetX / 40)));
    const targetRow = Math.max(1, Math.min(11, Math.floor(safeTargetY / 40)));

    const root = this.rootPool.acquire();
    if (!root) {
      return null;
    }

    root.active = true;
    root.x = safeTargetX;
    root.y = safeTargetY;
    root.col = targetCol;
    root.row = targetRow;
    root.radius = 20;
    root.durationMs = 25000;
    root.timerMs = 25000;
    root.damage = 1;
    root.isTelegraph = true;

    this.activeRoots = this.rootPool.activeCount;

    if (this.attackManager) {
      this.attackManager.addTelegraphTile(targetRow, targetCol, 2000);
    }

    this.audio.playRootEruption();

    return root;
  }

  /**
   * Cleanses active subterranean roots caught in bomb blast with Zero-GC pool recycling.
   */
  public cleanseRootsAt(r: number, c: number, radius: number = 1): number {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return 0;
    const safeRadius = Number.isFinite(radius) && radius >= 0 ? radius : 1;

    let cleansed = 0;
    this.rootPool.forEachActive((root) => {
      const dist = Math.max(Math.abs(root.row - r), Math.abs(root.col - c));
      if (dist <= safeRadius) {
        this.rootPool.release(root);
        cleansed++;
      }
    });

    this.activeRoots = this.rootPool.activeCount;

    if (cleansed > 0) {
      this.audio.playRootCleansed();
    }

    return cleansed;
  }

  /**
   * Emits an airborne pollen cloud / spore projectile toward target with safe velocity.
   */
  public emitPollenCloud(targetX: number = this.x, targetY: number = this.y): void {
    if (!this.attackManager) return;

    const arenaMidX = (this.minArenaX + this.maxArenaX) / 2;
    const arenaMidY = (this.minArenaY + this.maxArenaY) / 2;

    const safeOriginX = Number.isFinite(this.x)
      ? Math.max(this.minArenaX, Math.min(this.maxArenaX, this.x))
      : arenaMidX;
    const safeOriginY = Number.isFinite(this.y)
      ? Math.max(this.minArenaY, Math.min(this.maxArenaY, this.y))
      : arenaMidY;

    const safeTargetX = Number.isFinite(targetX)
      ? Math.max(this.minArenaX, Math.min(this.maxArenaX, targetX))
      : safeOriginX;
    const safeTargetY = Number.isFinite(targetY)
      ? Math.max(this.minArenaY, Math.min(this.maxArenaY, targetY))
      : safeOriginY;

    const dx = safeTargetX - safeOriginX;
    const dy = safeTargetY - safeOriginY;
    const dist = Math.hypot(dx, dy);
    const speed = 120;

    let pVx = 0;
    let pVy = speed;
    if (dist > 1e-4) {
      pVx = (dx / dist) * speed;
      pVy = (dy / dist) * speed;
      if (Math.abs(pVx) < 1e-15) pVx = 0;
      if (Math.abs(pVy) < 1e-15) pVy = 0;
    }

    if (!Number.isFinite(pVx)) pVx = 0;
    if (!Number.isFinite(pVy)) pVy = speed;

    this.attackManager.spawnProjectile(
      BossProjectileType.POLLEN_POD,
      safeOriginX,
      safeOriginY,
      pVx,
      pVy,
      8,
      3000
    );

    this.audio.playSporeBurst();
  }

  /**
   * Executes radial Vine Whip shockwave attack.
   */
  public executeVineWhip(): void {
    this.isVineWhipping = true;
    if (this.attackManager) {
      const safeOriginX = Number.isFinite(this.x)
        ? Math.max(this.minArenaX, Math.min(this.maxArenaX, this.x))
        : (this.minArenaX + this.maxArenaX) / 2;
      const safeOriginY = Number.isFinite(this.y)
        ? Math.max(this.minArenaY, Math.min(this.maxArenaY, this.y))
        : (this.minArenaY + this.maxArenaY) / 2;

      this.attackManager.spawnShockwave(safeOriginX, safeOriginY, 140, 220);
    }
    this.audio.playVineWhip();
  }

  /**
   * Burrows underground, becoming invulnerable and clearing active surface roots.
   */
  public burrowUnderground(durationMs: number = 2000): void {
    if (this.bossState === BossState.DEFEATED || this.bossState === BossState.INTRO) return;
    const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 2000;
    this.isUnderground = true;
    this.isInvulnerable = true;
    this.vx = 0;
    this.vy = 0;
    this.undergroundTimerMs = safeDuration;
    this.audio.playBurrow();
  }

  /**
   * Emerges from subterranean state back onto the arena floor.
   */
  public emergeFromUnderground(): void {
    this.isUnderground = false;
    this.undergroundTimerMs = 0;
    if (
      this.bossState !== BossState.DEFEATED &&
      this.bossState !== BossState.INTRO &&
      this.bossState !== BossState.INTERMISSION &&
      this.iFrameTimerMs <= 0
    ) {
      this.isInvulnerable = false;
    }
    this.audio.playEmerge();
  }

  /**
   * Pure zero-GC movement update toward player target with distance threshold and wall clamping.
   */
  private updateMovement(dt: number, playerX: number, playerY: number): void {
    if (this.isUnderground && this.bossState !== BossState.INTERMISSION) {
      this.undergroundTimerMs = Math.max(0, this.undergroundTimerMs - dt);
      if (this.undergroundTimerMs <= 0) {
        this.emergeFromUnderground();
      }
    }

    if (this.isUnderground) {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 250) : 0;
    if (safeDt <= 0) {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    const arenaMidX = (this.minArenaX + this.maxArenaX) / 2;
    const arenaMidY = (this.minArenaY + this.maxArenaY) / 2;
    if (!Number.isFinite(this.x)) this.x = arenaMidX;
    if (!Number.isFinite(this.y)) this.y = arenaMidY;

    const safePlayerX = Number.isFinite(playerX)
      ? Math.max(this.minArenaX, Math.min(this.maxArenaX, playerX))
      : this.x;
    const safePlayerY = Number.isFinite(playerY)
      ? Math.max(this.minArenaY, Math.min(this.maxArenaY, playerY))
      : this.y;

    const dx = safePlayerX - this.x;
    const dy = safePlayerY - this.y;
    const dist = Math.hypot(dx, dy);

    const safeSpeed = Number.isFinite(this.currentSpeed) && this.currentSpeed >= 0
      ? this.currentSpeed
      : this.config.baseSpeed;

    // Keep distance: slow approach if beyond 40px, halt when close to avoid overlap jitter
    if (dist > 40) {
      let vx = (dx / dist) * safeSpeed;
      let vy = (dy / dist) * safeSpeed;
      if (Math.abs(vx) < 1e-15) vx = 0;
      if (Math.abs(vy) < 1e-15) vy = 0;
      this.vx = vx;
      this.vy = vy;
    } else {
      this.vx = 0;
      this.vy = 0;
    }

    // Defensive NaN velocity guard
    if (!Number.isFinite(this.vx)) this.vx = 0;
    if (!Number.isFinite(this.vy)) this.vy = 0;

    // Movement integration
    this.x += this.vx * (safeDt / 1000);
    this.y += this.vy * (safeDt / 1000);

    // Boundary collision clamp
    this.clampPosition();
  }

  /**
   * Ticks active pooled root hazards with Zero-GC.
   */
  private updatePooledRoots(dt: number): void {
    this.rootPool.forEachActive((root) => {
      root.timerMs -= dt;
      if (root.timerMs <= 1500) {
        root.isTelegraph = false; // Transition from warning to active hazard
      }
      if (root.timerMs <= 0) {
        this.rootPool.release(root);
      }
    });

    // Unconditionally synchronize activeRoots count with pool
    this.activeRoots = this.rootPool.activeCount;
  }

  protected override updatePhase1(dt: number, playerX: number, playerY: number): void {
    this.currentSpeed = this.config.baseSpeed;
    this.updateMovement(dt, playerX, playerY);
    this.updatePooledRoots(dt);

    this.rootTimerMs -= dt;
    if (this.rootTimerMs <= 0) {
      this.spawnSubterraneanRoot(playerX, playerY);
      this.rootTimerMs = 4000;
    }
  }

  protected override updatePhase2(dt: number, playerX: number, playerY: number): void {
    this.currentSpeed = this.config.baseSpeed * 1.5;
    this.updateMovement(dt, playerX, playerY);
    this.updatePooledRoots(dt);

    this.pollenTimerMs -= dt;
    if (this.pollenTimerMs <= 0) {
      this.emitPollenCloud(playerX, playerY);
      this.pollenTimerMs = 3000;
    }

    this.rootTimerMs -= dt;
    if (this.rootTimerMs <= 0) {
      this.spawnSubterraneanRoot(playerX, playerY);
      this.rootTimerMs = 3500;
    }
  }

  protected override updateEnraged(dt: number, playerX: number, playerY: number): void {
    this.currentSpeed = this.config.baseSpeed * 2.0;
    this.updateMovement(dt, playerX, playerY);
    this.updatePooledRoots(dt);

    this.vineWhipCooldownMs -= dt;
    if (this.vineWhipCooldownMs <= 0) {
      this.executeVineWhip();
      this.vineWhipCooldownMs = 2500;
    } else {
      this.isVineWhipping = false;
    }

    this.pollenTimerMs -= dt;
    if (this.pollenTimerMs <= 0) {
      this.emitPollenCloud(playerX, playerY);
      this.pollenTimerMs = 2000;
    }

    this.rootTimerMs -= dt;
    if (this.rootTimerMs <= 0) {
      this.spawnSubterraneanRoot(playerX, playerY);
      this.rootTimerMs = 3000;
    }
  }

  protected override onHitReceived(damage: number, isChained: boolean): void {
    void damage;
    void isChained;
    // Defensive retaliatory root sprouted upon receiving bomb blast
    if (this.activeRoots < this.maxRoots) {
      this.spawnSubterraneanRoot(this.x, this.y);
    }
  }

  protected override onDamageBlocked(): void {
    // Sprout defensive root network and accelerate pollen spore emission when blast blocked
    if (this.activeRoots < this.maxRoots) {
      this.spawnSubterraneanRoot(this.x, this.y);
    }
    this.pollenTimerMs = Math.max(0, this.pollenTimerMs - 500);
  }

  public takeDamage(damage: number = 1, _x: number = 0, _y: number = 0): boolean {
    void _x;
    void _y;
    return this.takeBombDamage(damage);
  }

  public override applyStun(durationSec: number): void {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    if (
      this.bossState === BossState.INTERMISSION ||
      this.bossState === BossState.INTRO ||
      this.bossState === BossState.DEFEATED
    ) {
      return;
    }
    if (this.isUnderground) {
      this.emergeFromUnderground();
    }
    super.applyStun(durationSec);
  }

  protected override onStateChanged(prevState: BossState, nextState: BossState): void {
    void prevState;
    this.isVineWhipping = false;

    if (nextState === BossState.INTERMISSION) {
      this.burrowUnderground(this.intermissionDurationMs);
      this.activeRoots = 0;
      this.rootPool.reset();
    } else if (nextState === BossState.PHASE_2) {
      this.isUnderground = false;
      this.undergroundTimerMs = 0;
      this.isInvulnerable = false;
      this.currentSpeed = this.config.baseSpeed * 1.5;
      this.audio.playPhaseTransition(2);
    } else if (nextState === BossState.ENRAGED) {
      this.isUnderground = false;
      this.undergroundTimerMs = 0;
      this.isInvulnerable = false;
      this.currentSpeed = this.config.baseSpeed * 2.0;
      this.audio.playPhaseTransition(3);
    } else if (nextState === BossState.STUNNED) {
      this.isUnderground = false;
      this.undergroundTimerMs = 0;
      this.vx = 0;
      this.vy = 0;
    } else if (nextState === BossState.PHASE_1) {
      this.isUnderground = false;
      this.undergroundTimerMs = 0;
    }
  }

  protected override onDefeated(): void {
    this.isUnderground = false;
    this.undergroundTimerMs = 0;
    this.activeRoots = 0;
    this.rootPool.reset();
    this.vx = 0;
    this.vy = 0;
    this.isInvulnerable = true;
    this.isVineWhipping = false;
    this.audio.playBossDefeated();
  }

  public destroy(): void {
    this.audio.destroy();
    this.rootPool.destroy();
  }

  public dispose(): void {
    this.destroy();
  }
}
