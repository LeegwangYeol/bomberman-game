/**
 * BossAttackManager.ts — Zero-GC Boss Projectile, Hazard, and Telegraph Subsystem
 *
 * Implements Contiguous ObjectPool for Sunflower Gatling seeds, Candy Stingers,
 * EMP Mines, Pollen Pods, Falling Candies, Ground Shockwaves, and Telegraph Tiles.
 * Guarantees zero heap allocations during the 60 FPS update loop.
 */

import { ObjectPool } from '../pooling/ObjectPool.ts';
import {
  BossProjectileType,
  type BossProjectile,
  type BossShockwave,
  type BossMinion,
  type TelegraphTile,
} from './BossTypes.ts';

export class BossAttackManager {
  public readonly projectilePool: ObjectPool<BossProjectile>;
  public readonly shockwavePool: ObjectPool<BossShockwave>;
  public readonly minionPool: ObjectPool<BossMinion>;
  public readonly telegraphPool: ObjectPool<TelegraphTile>;

  constructor() {
    // 1. Boss Projectile Pool (64 capacity)
    this.projectilePool = new ObjectPool<BossProjectile>({
      capacity: 64,
      factory: (i) => ({
        id: i,
        active: false,
        type: BossProjectileType.GATLING_SEED,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 6,
        damage: 1,
        timerMs: 0,
        maxDurationMs: 3000,
        homing: false,
        targetX: 0,
        targetY: 0,
      }),
      reset: (p) => {
        p.active = false;
        p.vx = 0;
        p.vy = 0;
        p.timerMs = 0;
        p.homing = false;
      },
    });

    // 2. Boss Shockwave Pool (16 capacity)
    this.shockwavePool = new ObjectPool<BossShockwave>({
      capacity: 16,
      factory: (i) => ({
        id: i,
        active: false,
        originX: 0,
        originY: 0,
        currentRadius: 0,
        maxRadius: 160,
        expansionSpeed: 200,
        damage: 1,
        affectedTilesBitmask: new Uint8Array(195),
      }),
      reset: (s) => {
        s.active = false;
        s.currentRadius = 0;
        s.affectedTilesBitmask.fill(0);
      },
    });

    // 3. Boss Minion Pool (8 capacity, max 4 active)
    this.minionPool = new ObjectPool<BossMinion>({
      capacity: 8,
      factory: (i) => ({
        id: i,
        active: false,
        type: 'GUMMY_CUB',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        hp: 1,
        maxHp: 1,
        state: 0,
        targetTileIdx: -1,
        carriedBombId: -1,
      }),
      reset: (m) => {
        m.active = false;
        m.hp = 1;
        m.targetTileIdx = -1;
        m.carriedBombId = -1;
      },
    });

    // 4. Telegraph Tile Pool (64 capacity)
    this.telegraphPool = new ObjectPool<TelegraphTile>({
      capacity: 64,
      factory: (i) => ({
        id: i,
        active: false,
        row: 0,
        col: 0,
        tier: 1,
        timerMs: 0,
        durationMs: 2000,
      }),
      reset: (t) => {
        t.active = false;
        t.timerMs = 0;
      },
    });
  }

  /**
   * Spawns a directional projectile from pool in O(1).
   */
  public spawnProjectile(
    type: BossProjectileType,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number = 6,
    durationMs: number = 3000
  ): BossProjectile | null {
    const p = this.projectilePool.acquire();
    if (!p) return null;

    p.active = true;
    p.type = type;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.radius = radius;
    p.timerMs = durationMs;
    p.maxDurationMs = durationMs;
    return p;
  }

  /**
   * Spawns an expanding ground shockwave from pool in O(1).
   */
  public spawnShockwave(
    originX: number,
    originY: number,
    maxRadius: number = 160,
    speed: number = 200
  ): BossShockwave | null {
    const s = this.shockwavePool.acquire();
    if (!s) return null;

    s.active = true;
    s.originX = originX;
    s.originY = originY;
    s.currentRadius = 0;
    s.maxRadius = maxRadius;
    s.expansionSpeed = speed;
    return s;
  }

  /**
   * Registers a 3-tier floor danger telegraph.
   */
  public addTelegraphTile(
    row: number,
    col: number,
    durationMs: number = 2000
  ): TelegraphTile | null {
    const t = this.telegraphPool.acquire();
    if (!t) return null;

    t.active = true;
    t.row = row;
    t.col = col;
    t.tier = 1;
    t.timerMs = durationMs;
    t.durationMs = durationMs;
    return t;
  }

  /**
   * Per-frame zero-allocation update loop.
   */
  public update(
    dt: number,
    playerX: number,
    playerY: number,
    onPlayerHit: (dmg: number) => void
  ): void {
    // 1. Update Projectiles
    this.projectilePool.forEachActive((p) => {
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      p.timerMs -= dt;

      // Check collision with player
      const dx = playerX - p.x;
      const dy = playerY - p.y;
      if (dx * dx + dy * dy <= (p.radius + 12) * (p.radius + 12)) {
        onPlayerHit(p.damage);
        this.projectilePool.release(p);
        return;
      }

      if (p.timerMs <= 0 || p.x < 0 || p.x > 600 || p.y < 0 || p.y > 520) {
        this.projectilePool.release(p);
      }
    });

    // 2. Update Shockwaves
    this.shockwavePool.forEachActive((s) => {
      s.currentRadius += s.expansionSpeed * (dt / 1000);
      const dx = playerX - s.originX;
      const dy = playerY - s.originY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (Math.abs(dist - s.currentRadius) < 14) {
        onPlayerHit(s.damage);
      }

      if (s.currentRadius >= s.maxRadius) {
        this.shockwavePool.release(s);
      }
    });

    // 3. Update Telegraphs (Progression Tier 1 -> Tier 2 -> Tier 3)
    this.telegraphPool.forEachActive((t) => {
      t.timerMs -= dt;
      const remainingRatio = t.timerMs / t.durationMs;
      if (remainingRatio > 0.75) {
        t.tier = 1; // Yellow pre-warning
      } else if (remainingRatio > 0.25) {
        t.tier = 2; // Amber active threat
      } else {
        t.tier = 3; // Flashing ruby red impact
      }

      if (t.timerMs <= 0) {
        this.telegraphPool.release(t);
      }
    });
  }

  public resetAll(): void {
    this.projectilePool.reset();
    this.shockwavePool.reset();
    this.minionPool.reset();
    this.telegraphPool.reset();
  }
}
