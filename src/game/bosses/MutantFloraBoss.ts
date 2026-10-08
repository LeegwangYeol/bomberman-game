/**
 * MutantFloraBoss.ts — Verdant Terror (Mutant Flora)
 *
 * Implements Subterranean Roots, Pollen Clouds, and Vine Whips.
 * Zero-GC pooling via ObjectPool, safe arena boundary collision clamping,
 * and strict NaN-velocity immunity.
 */

import { BaseBoss, type BossConfig } from './BaseBoss.ts';
import { BossState, BossProjectileType } from './BossTypes.ts';
import { ObjectPool } from '../pooling/ObjectPool.ts';
import type { BossAttackManager } from './BossAttackManager.ts';

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
        durationMs: 3000,
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
    if (this.isUnderground) {
      return false;
    }
    if (this.bossState === BossState.INTERMISSION || this.bossState === BossState.INTRO) {
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

    const safeTargetX = Number.isFinite(targetX) ? Math.max(this.minArenaX, Math.min(this.maxArenaX, targetX)) : this.x;
    const safeTargetY = Number.isFinite(targetY) ? Math.max(this.minArenaY, Math.min(this.maxArenaY, targetY)) : this.y;

    const root = this.rootPool.acquire();
    if (root) {
      root.active = true;
      root.x = safeTargetX;
      root.y = safeTargetY;
      root.col = Math.max(1, Math.min(13, Math.floor(safeTargetX / 40)));
      root.row = Math.max(1, Math.min(11, Math.floor(safeTargetY / 40)));
      root.radius = 20;
      root.durationMs = 3500;
      root.timerMs = 3500;
      root.damage = 1;
      root.isTelegraph = true;
    }

    this.activeRoots++;

    // Synchronize with external BossAttackManager if available
    if (this.attackManager) {
      const col = Math.max(1, Math.min(13, Math.floor(safeTargetX / 40)));
      const row = Math.max(1, Math.min(11, Math.floor(safeTargetY / 40)));
      this.attackManager.addTelegraphTile(row, col, 2000);
    }

    return root;
  }

  /**
   * Cleanses active subterranean roots caught in bomb blast with Zero-GC pool recycling.
   */
  public cleanseRootsAt(r: number, c: number, radius: number = 1): number {
    let cleansed = 0;
    this.rootPool.forEachActive((root) => {
      const dist = Math.max(Math.abs(root.row - r), Math.abs(root.col - c));
      if (dist <= radius) {
        this.rootPool.release(root);
        cleansed++;
      }
    });
    if (cleansed > 0) {
      this.activeRoots = Math.max(0, this.activeRoots - cleansed);
    }
    return cleansed;
  }

  /**
   * Emits an airborne pollen cloud / spore projectile toward target with safe velocity.
   */
  public emitPollenCloud(targetX: number = this.x, targetY: number = this.y): void {
    if (!this.attackManager) return;

    const safeTargetX = Number.isFinite(targetX) ? targetX : this.x;
    const safeTargetY = Number.isFinite(targetY) ? targetY : this.y;

    const dx = safeTargetX - this.x;
    const dy = safeTargetY - this.y;
    const dist = Math.hypot(dx, dy);
    const speed = 120;

    let pVx = 0;
    let pVy = speed;
    if (dist > 1e-4) {
      pVx = (dx / dist) * speed;
      pVy = (dy / dist) * speed;
    }

    if (!Number.isFinite(pVx)) pVx = 0;
    if (!Number.isFinite(pVy)) pVy = speed;

    this.attackManager.spawnProjectile(
      BossProjectileType.POLLEN_POD,
      this.x,
      this.y,
      pVx,
      pVy,
      8,
      3000
    );
  }

  /**
   * Executes radial Vine Whip shockwave attack.
   */
  public executeVineWhip(): void {
    this.isVineWhipping = true;
    if (this.attackManager) {
      this.attackManager.spawnShockwave(this.x, this.y, 140, 220);
    }
  }

  /**
   * Burrows underground, becoming invulnerable and clearing active surface roots.
   */
  public burrowUnderground(durationMs: number = 2000): void {
    this.isUnderground = true;
    this.isInvulnerable = true;
    this.vx = 0;
    this.vy = 0;
    this.undergroundTimerMs = durationMs;
  }

  /**
   * Emerges from subterranean state back onto the arena floor.
   */
  public emergeFromUnderground(): void {
    this.isUnderground = false;
    this.isInvulnerable = false;
    this.undergroundTimerMs = 0;
  }

  /**
   * Pure zero-GC movement update toward player target with distance threshold and wall clamping.
   */
  private updateMovement(dt: number, playerX: number, playerY: number): void {
    if (this.isUnderground) {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    const safePlayerX = Number.isFinite(playerX) ? playerX : this.x;
    const safePlayerY = Number.isFinite(playerY) ? playerY : this.y;

    const dx = safePlayerX - this.x;
    const dy = safePlayerY - this.y;
    const dist = Math.hypot(dx, dy);

    // Keep distance: slow approach if beyond 40px, halt when close to avoid overlap jitter
    if (dist > 40) {
      this.vx = (dx / dist) * this.currentSpeed;
      this.vy = (dy / dist) * this.currentSpeed;
    } else {
      this.vx = 0;
      this.vy = 0;
    }

    // Defensive NaN velocity guard
    if (!Number.isFinite(this.vx)) this.vx = 0;
    if (!Number.isFinite(this.vy)) this.vy = 0;

    // Movement integration
    this.x += this.vx * (dt / 1000);
    this.y += this.vy * (dt / 1000);

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
    // Ensure activeRoots stays in sync with pool if pool was used
    if (this.rootPool.activeCount > 0) {
      this.activeRoots = this.rootPool.activeCount;
    }
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
    } else {
      this.activeRoots++;
    }
  }

  protected override onDamageBlocked(): void {
    // Sprout defensive root network and accelerate pollen spore emission when blast blocked
    this.activeRoots = Math.min(this.maxRoots, this.activeRoots + 1);
    this.pollenTimerMs = Math.max(0, this.pollenTimerMs - 500);
  }

  public override applyStun(durationSec: number): void {
    if (this.isUnderground) {
      this.emergeFromUnderground();
    }
    super.applyStun(durationSec);
  }

  protected override onStateChanged(prevState: BossState, nextState: BossState): void {
    void prevState;
    if (nextState === BossState.INTERMISSION) {
      this.burrowUnderground(this.intermissionDurationMs);
      this.activeRoots = 0;
      this.rootPool.reset();
    } else if (nextState === BossState.PHASE_2) {
      this.isUnderground = false;
      this.undergroundTimerMs = 0;
      this.isInvulnerable = false;
      this.currentSpeed = this.config.baseSpeed * 1.5;
    } else if (nextState === BossState.ENRAGED) {
      this.isUnderground = false;
      this.undergroundTimerMs = 0;
      this.isInvulnerable = false;
      this.currentSpeed = this.config.baseSpeed * 2.0;
    } else if (nextState === BossState.STUNNED) {
      this.isUnderground = false;
      this.undergroundTimerMs = 0;
      this.vx = 0;
      this.vy = 0;
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
  }

  public destroy(): void {
    this.rootPool.destroy();
  }

  public dispose(): void {
    this.destroy();
  }
}
