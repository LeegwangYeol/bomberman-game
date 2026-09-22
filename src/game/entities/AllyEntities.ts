import Phaser from 'phaser';
import { BaseEntity } from './BaseEntity';
import { ALLY_ARCHETYPES, FACTIONS } from './types';
import {
  TILE_SIZE,
  type GridCoord,
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
  FlatHazardMask,
  cloneBombTilesAsSet,
} from '../pathfinding';

/**
 * 1. Mini-Bomber Buddy ("Pom-Pom"):
 * 3 HP, dynamic leash following player (2-6 tiles), drops bombs ONLY when player is outside
 * blast danger zone (ZERO friendly fire!), flees safely.
 */
export class MiniBomberAlly extends BaseEntity {
  public config = ALLY_ARCHETYPES.MINI_BOMBER;
  public activeBombs: number = 0;
  public maxBombs: number = 1;
  public bombPower: number = 2;
  public bombCooldownTimer: number = 3000;

  private pathRecalcTimer: number = 0;
  private currentPath: GridCoord[] = [];
  private escapePath: GridCoord[] = [];
  public evadeTimeoutMs: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'player') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ALLY,
      ALLY_ARCHETYPES.MINI_BOMBER.maxHp,
      ALLY_ARCHETYPES.MINI_BOMBER.name,
      'MINI_BOMBER',
      24,
      ALLY_ARCHETYPES.MINI_BOMBER.hpBarColor
    );
    this.moveSpeed = 100;
    this.setTint(0x06b6d4);
    this.overheadUI.setIntent('🛡️', true);
  }

  public onBombExploded(): void {
    if (this.activeBombs > 0) {
      this.activeBombs--;
    }
    if (this.activeBombs === 0) {
      this.escapePath = [];
      this.overheadUI.setIntent('🛡️', true);
    }
  }

  public updateAI(
    delta: number,
    currentTime: number,
    player: Phaser.Physics.Arcade.Sprite | null,
    map: number[][],
    bombTiles: Set<string> | Uint8Array | FlatHazardMask,
    dropBombCallback?: (r: number, c: number, power: number) => boolean
  ) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    this.bombCooldownTimer -= delta;

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    const ar = Math.floor(this.y / TILE_SIZE);
    const ac = Math.floor(this.x / TILE_SIZE);
    const pr = Math.floor(player.y / TILE_SIZE);
    const pc = Math.floor(player.x / TILE_SIZE);
    const distToPlayer = Math.abs(ar - pr) + Math.abs(ac - pc);

    // Evasion handling with watchdog timer
    if (this.escapePath.length > 0) {
      this.evadeTimeoutMs -= delta;
      if (this.evadeTimeoutMs <= 0) {
        this.escapePath = [];
        this.overheadUI.setIntent('🛡️', true);
        return;
      }

      this.overheadUI.setIntent('💨', true);
      const next = this.escapePath[0];
      const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;

      const evadeSpeed = 110;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.setVelocity(Math.sign(dx) * evadeSpeed, 0);
      } else {
        this.setVelocity(0, Math.sign(dy) * evadeSpeed);
      }

      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        this.escapePath.shift();
        if (this.escapePath.length === 0) {
          this.overheadUI.setIntent('🛡️', true);
        }
      }
      return;
    }

    // Bomb placement evaluation with strict friendly fire immunity invariant:
    if (this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs) {
      const candidateBlast = getBlastTiles({ r: ar, c: ac }, this.bombPower, map);
      const playerInDanger = candidateBlast.has(`${pr},${pc}`);

      // FRIENDLY FIRE SAFETY: NEVER plant bomb if blast intersects player!
      if (!playerInDanger) {
        const simulatedBombs = cloneBombTilesAsSet(bombTiles);
        simulatedBombs.add(`${ar},${ac}`);
        const escape = findEscapePathBFS({ r: ar, c: ac }, candidateBlast, map, simulatedBombs, 4);

        if (escape && escape.length > 0) {
          const placed = dropBombCallback ? dropBombCallback(ar, ac, this.bombPower) : false;
          if (placed) {
            this.activeBombs++;
            this.bombCooldownTimer = 4500;
            this.escapePath = escape;
            this.evadeTimeoutMs = 2500; // AI-04: 2500ms evasion watchdog
            this.overheadUI.setIntent('💣', true);
            return;
          }
        }
      }
    }

    // Dynamic leash following player
    const speed = distToPlayer > this.config.leashMaxTiles ? this.config.sprintSpeed : 100;
    if (distToPlayer > this.config.leashMaxTiles) {
      this.overheadUI.setIntent('🏃', true);
    } else {
      this.overheadUI.setIntent('🛡️', true);
    }

    if (distToPlayer > this.config.leashMinTiles) {
      this.pathRecalcTimer -= delta;
      if (this.pathRecalcTimer <= 0) {
        this.pathRecalcTimer = 220;
        this.currentPath = findPathBFS({ r: ar, c: ac }, { r: pr, c: pc }, map, bombTiles);
      }

      if (this.currentPath.length > 0) {
        const next = this.currentPath[0];
        const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
        const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          this.setVelocity(Math.sign(dx) * speed, 0);
        } else {
          this.setVelocity(0, Math.sign(dy) * speed);
        }
      }
    } else {
      this.setVelocity(0, 0);
    }
  }
}

/**
 * 2. Pet Drone ("Gizmo"):
 * 2 HP, flies over obstacles, orbits player, vacuums power-up items within 6 tiles,
 * peashooter stun bolt at enemies every 3s.
 */
export class PetDroneAlly extends BaseEntity {
  public config = ALLY_ARCHETYPES.PET_DRONE;
  private shootTimer: number = 3000;
  private orbitAngle: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'player') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ALLY,
      ALLY_ARCHETYPES.PET_DRONE.maxHp,
      ALLY_ARCHETYPES.PET_DRONE.name,
      'PET_DRONE',
      20,
      ALLY_ARCHETYPES.PET_DRONE.hpBarColor
    );
    this.moveSpeed = this.config.flightSpeed;
    this.setTint(0x38bdf8);
    this.setScale(0.75, 0.75);
    this.overheadUI.setIntent('🚁', true);
  }

  public updateAI(
    delta: number,
    currentTime: number,
    player: Phaser.Physics.Arcade.Sprite | null,
    items: Phaser.GameObjects.GameObject[],
    enemies: BaseEntity[]
  ) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    // 1. Vacuum item fetcher within fetchRadiusTiles (6 tiles)
    let closestItem: Phaser.Physics.Arcade.Sprite | null = null;
    let closestItemDist = Infinity;
    const maxFetchDistPx = this.config.fetchRadiusTiles * TILE_SIZE;

    for (const itemObj of items) {
      const item = itemObj as Phaser.Physics.Arcade.Sprite;
      if (item && item.active) {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, item.x, item.y);
        if (dist <= maxFetchDistPx && dist < closestItemDist) {
          closestItemDist = dist;
          closestItem = item;
        }
      }
    }

    if (closestItem) {
      this.overheadUI.setIntent('🧲', true);
      // AI-07: Tractor beam pulls item towards player with delta scaling (150 px/s)
      const angle = Phaser.Math.Angle.Between(closestItem.x, closestItem.y, player.x, player.y);
      const pullSpeed = 150;
      const pullStep = pullSpeed * (delta / 1000);
      closestItem.x += Math.cos(angle) * pullStep;
      closestItem.y += Math.sin(angle) * pullStep;

      const toItemAngle = Phaser.Math.Angle.Between(this.x, this.y, closestItem.x, closestItem.y);
      this.setVelocity(
        Math.cos(toItemAngle) * this.config.flightSpeed,
        Math.sin(toItemAngle) * this.config.flightSpeed
      );
      return;
    }

    // 2. Peashooter stun bolt at closest enemy every 3s
    this.shootTimer -= delta;
    if (this.shootTimer <= 0) {
      this.shootTimer = this.config.shootIntervalMs;
      let targetEnemy: BaseEntity | null = null;
      let closestEnemyDist = Infinity;

      for (const e of enemies) {
        if (e && e.active && !e.isDead) {
          const dist = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
          if (dist <= 5 * TILE_SIZE && dist < closestEnemyDist) {
            closestEnemyDist = dist;
            targetEnemy = e;
          }
        }
      }

      if (targetEnemy) {
        this.overheadUI.setIntent('🎯', true);
        targetEnemy.isStunned = true;
        targetEnemy.stunUntil = currentTime + this.config.stunDurationMs;
        targetEnemy.overheadUI.setIntent('💫', true);

        // Visual plasma projectile
        if (this.scene) {
          const bolt = this.scene.add.circle(this.x, this.y, 4, 0x38bdf8, 1);
          bolt.setDepth(15);
          this.scene.tweens.add({
            targets: bolt,
            x: targetEnemy.x,
            y: targetEnemy.y,
            duration: 200,
            onComplete: () => bolt.destroy(),
          });
        }
      }
    }

    // 3. Orbit player at 32px radius
    this.orbitAngle += (delta / 1000) * 2.5;
    const targetX = player.x + Math.cos(this.orbitAngle) * 36;
    const targetY = player.y + Math.sin(this.orbitAngle) * 36;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.setVelocity(dx * 4, dy * 4);
    this.overheadUI.setIntent('🚁', true);
  }
}

/**
 * 3. Shield Guard ("Aegis"):
 * 5 HP, walks 1 tile ahead of player, periodic taunt aura (forces enemies within 5 tiles to target Aegis),
 * dome shield absorbing explosions near player.
 */
export class ShieldGuardAlly extends BaseEntity {
  public config = ALLY_ARCHETYPES.SHIELD_GUARD;
  private tauntTimer: number = 4000;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'player') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ALLY,
      ALLY_ARCHETYPES.SHIELD_GUARD.maxHp,
      ALLY_ARCHETYPES.SHIELD_GUARD.name,
      'SHIELD_GUARD',
      26,
      ALLY_ARCHETYPES.SHIELD_GUARD.hpBarColor
    );
    this.moveSpeed = 90;
    this.setTint(0x3b82f6);
    this.setScale(1.1, 1.1);
    this.overheadUI.setIntent('🛡️', true);
  }

  public updateAI(
    delta: number,
    currentTime: number,
    player: Phaser.Physics.Arcade.Sprite | null,
    playerFacing: string,
    enemies: BaseEntity[]
  ) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    // 1. Taunt aura every 4s
    this.tauntTimer -= delta;
    if (this.tauntTimer <= 0) {
      this.tauntTimer = this.config.tauntIntervalMs;
      this.overheadUI.setIntent('📢', true);

      // Visual taunt pulse ring
      if (this.scene) {
        const ring = this.scene.add.circle(this.x, this.y, 8, 0x60a5fa, 0.6);
        ring.setDepth(12);
        this.scene.tweens.add({
          targets: ring,
          radius: this.config.tauntRadiusTiles * TILE_SIZE,
          alpha: 0,
          duration: 400,
          onComplete: () => ring.destroy(),
        });
      }

      // Force enemies within radius to target Aegis
      for (const e of enemies) {
        if (e && e.active && !e.isDead) {
          const dist = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
          if (dist <= this.config.tauntRadiusTiles * TILE_SIZE) {
            e.overheadUI.setIntent('💢', true);
          }
        }
      }
    }

    // 2. Vanguard march 1 tile ahead of player
    let offsetDir = { x: 0, y: 1 };
    switch (playerFacing) {
      case 'up':
        offsetDir = { x: 0, y: -1 };
        break;
      case 'down':
        offsetDir = { x: 0, y: 1 };
        break;
      case 'left':
        offsetDir = { x: -1, y: 0 };
        break;
      case 'right':
        offsetDir = { x: 1, y: 0 };
        break;
    }

    const targetX = player.x + offsetDir.x * TILE_SIZE;
    const targetY = player.y + offsetDir.y * TILE_SIZE;
    const dx = targetX - this.x;
    const dy = targetY - this.y;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      this.setVelocity(Math.sign(dx) * 80, Math.sign(dy) * 80);
    } else {
      this.setVelocity(0, 0);
    }
  }

  /**
   * Intercepts and absorbs explosion hits targeting the player within dome radius.
   */
  public tryAbsorbExplosionForPlayer(
    playerPos: { x: number; y: number },
    explosionPos: { x: number; y: number },
    sourceBombOwner?: string
  ): boolean {
    if (this.isDead || !this.active) return false;

    const distToExplosion =
      (Math.abs(this.x - explosionPos.x) + Math.abs(this.y - explosionPos.y)) / TILE_SIZE;
    const distToPlayer =
      (Math.abs(this.x - playerPos.x) + Math.abs(this.y - playerPos.y)) / TILE_SIZE;

    if (distToExplosion <= this.config.domeAbsorbRadiusTiles || distToPlayer <= 2) {
      this.overheadUI.setIntent('✨', true);
      this.takeDamage(1, sourceBombOwner || 'enemy');
      return true; // Successfully absorbed!
    }

    return false;
  }
}
