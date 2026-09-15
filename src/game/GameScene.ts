import Phaser from 'phaser';
import {
  TILE_SIZE as PATH_TILE_SIZE,
  ROWS as PATH_ROWS,
  COLS as PATH_COLS,
  TILE_EMPTY as PATH_TILE_EMPTY,
  TILE_WALL as PATH_TILE_WALL,
  TILE_BLOCK as PATH_TILE_BLOCK,
  GridCoord,
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
} from './pathfinding';
import {
  PlayerStats,
  ItemType,
  BASE_PLAYER_SPEED,
  BASE_MAX_BOMBS,
  BASE_BOMB_POWER,
  DASH_SPEED,
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  BOMB_KICK_SPEED,
  CONVEYOR_DRIFT_SPEED,
  PORTAL_COOLDOWN_MS,
  DEFAULT_CONVEYORS,
  DEFAULT_PORTALS,
  ConveyorConfig,
  determineItemDrop,
  applyItemUpgrade,
  isItemProtectedFromExplosion,
} from './gameplay_mechanics';

export const TILE_SIZE = PATH_TILE_SIZE;
export const ROWS = PATH_ROWS;
export const COLS = PATH_COLS;
export const TILE_EMPTY = PATH_TILE_EMPTY;
export const TILE_WALL = PATH_TILE_WALL;
export const TILE_BLOCK = PATH_TILE_BLOCK;

export { findPathBFS, getBlastTiles, findEscapePathBFS };
export type { GridCoord };
export type { PlayerStats, ItemType, ConveyorConfig } from './gameplay_mechanics';
export {
  determineItemDrop,
  applyItemUpgrade,
  calculateSpeedLevel,
  createInitialPlayerStats,
  isItemProtectedFromExplosion,
  ITEM_DROP_RATE,
  ITEM_WEIGHTS,
  BASE_PLAYER_SPEED,
  SPEED_UP_DELTA,
  MAX_PLAYER_SPEED,
  BASE_MAX_BOMBS,
  MAX_BOMBS_CAP,
  BASE_BOMB_POWER,
  MAX_BOMB_POWER_CAP,
  DASH_SPEED,
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  BOMB_KICK_SPEED,
  ITEM_GRACE_PERIOD_MS,
  SHIELD_INVULN_MS,
  CONVEYOR_DRIFT_SPEED,
  PORTAL_COOLDOWN_MS,
} from './gameplay_mechanics';



export enum EnemyState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  TRACKING = 'TRACKING',
  HUNTING = 'HUNTING',
  WINDUP = 'WINDUP',
  ATTACK = 'ATTACK',
  COOLDOWN = 'COOLDOWN',
  EVADING = 'EVADING',
}

/**
 * Intelligent Enemy Sprite with Dynamic Visual AI States, Tweens, Indicators & Corridor Snapping.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public aiState: EnemyState = EnemyState.PATROL;
  public isTracker: boolean;

  private stateTimer: number = 0;
  private pathRecalcTimer: number = 0;
  private particleTimer: number = 0;
  private currentPath: GridCoord[] = [];
  private targetTile: GridCoord | null = null;

  private attackDir: { x: number; y: number } = { x: 0, y: 0 };
  private baseSpeed: number = 75;
  private chargeSpeed: number = 220;

  // 2-tier UI: Name Tag (Tier 1: y-19) & Intent Indicator (Tier 2: y-33)
  public enemyName: string;
  public nameTag!: Phaser.GameObjects.Text;
  private indicator!: Phaser.GameObjects.Text;

  // Bomb capabilities & evasion
  public canDropBombs: boolean = true;
  public activeBombs: number = 0;
  public maxBombs: number = 1;
  public bombCooldownTimer: number = 3000;
  public bombPower: number = 2;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string = 'enemy',
    isTracker: boolean = true
  ) {
    super(scene, x, y, texture);
    this.isTracker = isTracker;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(9);
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);

    // Persona name catalog based on archetype
    const TRACKER_NAMES = ['Blinky', 'Pyro Slime', 'Ignis', 'Stalker', 'Shadow'];
    const NORMAL_NAMES = ['Grumble', 'Puffball', 'Blobby', 'Spook', 'Waddler'];
    const namePool = isTracker ? TRACKER_NAMES : NORMAL_NAMES;
    this.enemyName = namePool[Phaser.Math.Between(0, namePool.length - 1)];

    // Tier 1 Overhead Name Tag (y - 19)
    this.nameTag = scene.add.text(x, y - 19, this.enemyName, {
      fontSize: '10px',
      fontStyle: 'bold',
      fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
      color: isTracker ? '#fb923c' : '#38bdf8',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 4, y: 1 },
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.nameTag.setOrigin(0.5, 0.5);
    this.nameTag.setDepth(16);

    // Tier 2 Intent Indicator Badge (y - 33)
    this.indicator = scene.add.text(x, y - 33, '', {
      fontSize: '14px',
      fontStyle: 'bold',
      fontFamily: 'monospace, Arial, sans-serif',
      color: '#FFD700',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.indicator.setOrigin(0.5, 0.5);
    this.indicator.setDepth(17);
    this.indicator.setVisible(false);

    // Initialize initial state
    this.changeState(isTracker ? EnemyState.TRACKING : EnemyState.PATROL);
  }

  public changeState(newState: EnemyState) {
    if (this.aiState === newState) return;
    this.stopStateTweens();
    this.aiState = newState;
    this.applyStateVisuals(newState);
  }

  private stopStateTweens() {
    if (this.scene) {
      this.scene.tweens.killTweensOf(this);
      if (this.indicator) {
        this.scene.tweens.killTweensOf(this.indicator);
      }
    }
    this.setScale(1, 1);
    this.setAngle(0);
    if (this.indicator && this.indicator.active) {
      this.indicator.setAngle(0);
      this.indicator.setScale(1);
    }
  }

  private applyStateVisuals(state: EnemyState) {
    if (!this.active || !this.scene) return;

    switch (state) {
      case EnemyState.IDLE:
        this.clearTint();
        this.indicator.setText('...');
        this.indicator.setStyle({ color: '#94a3b8', stroke: '#0f172a', strokeThickness: 2 });
        this.indicator.setVisible(true);
        this.indicator.setScale(1);

        // Breathing squash & stretch
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.07,
          scaleY: 0.93,
          duration: 550,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case EnemyState.PATROL:
        this.clearTint();
        this.indicator.setVisible(false);

        // Walking waddle
        this.scene.tweens.add({
          targets: this,
          angle: { from: -6, to: 6 },
          duration: 170,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case EnemyState.TRACKING:
      case EnemyState.HUNTING:
        this.setTint(this.isTracker ? 0xffbbbb : 0xffddaa);
        this.indicator.setText('!');
        this.indicator.setStyle({ color: '#FFD700', stroke: '#7f1d1d', strokeThickness: 3 });
        this.indicator.setVisible(true);

        // Alert bounce pop-in
        this.indicator.setScale(0);
        this.scene.tweens.add({
          targets: this.indicator,
          scale: 1.15,
          duration: 220,
          ease: 'Back.easeOut',
        });

        // Fast sprint waddle
        this.scene.tweens.add({
          targets: this,
          angle: { from: -10, to: 10 },
          duration: 110,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case EnemyState.WINDUP:
        this.setTint(0xff2222);
        this.indicator.setText('⚠️');
        this.indicator.setStyle({ color: '#ff4444', stroke: '#000000', strokeThickness: 2 });
        this.indicator.setVisible(true);

        // High frequency telegraph shiver & spring compression
        this.scene.tweens.add({
          targets: this,
          scaleX: 0.86,
          scaleY: 1.14,
          duration: 50,
          yoyo: true,
          repeat: -1,
        });
        break;

      case EnemyState.ATTACK: {
        this.setTint(0xff8800);
        this.indicator.setText('⚡');
        this.indicator.setVisible(true);

        // Stretched sprint in attack direction
        const isHoriz = Math.abs(this.attackDir.x) > Math.abs(this.attackDir.y);
        this.setScale(isHoriz ? 1.3 : 0.82, isHoriz ? 0.82 : 1.3);
        break;
      }

      case EnemyState.COOLDOWN:
        this.setTint(0x88bbff);
        this.indicator.setText('💫');
        this.indicator.setVisible(true);

        // Dizzy rotating stars
        this.scene.tweens.add({
          targets: this.indicator,
          angle: 360,
          duration: 900,
          repeat: -1,
        });

        // Squashed pancake bounce
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.22,
          scaleY: 0.78,
          duration: 280,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case EnemyState.EVADING:
        this.setTint(0xdda0dd);
        this.indicator.setText('💨');
        this.indicator.setStyle({ color: '#f472b6', stroke: '#4a044e', strokeThickness: 2 });
        this.indicator.setVisible(true);

        // Fast hurried waddle tween
        this.scene.tweens.add({
          targets: this,
          angle: { from: -12, to: 12 },
          duration: 90,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
    }
  }

  private spawnParticle(x: number, y: number, radius: number, color: number, alpha: number) {
    if (!this.scene) return;
    const dot = this.scene.add.circle(x, y, radius, color, alpha);
    dot.setDepth(8);
    this.scene.tweens.add({
      targets: dot,
      alpha: 0,
      scale: 0.3,
      duration: 220,
      onComplete: () => {
        dot.destroy();
      },
    });
  }

  public updateAI(
    _time: number,
    delta: number,
    player: Phaser.Physics.Arcade.Sprite,
    map: number[][],
    bombTiles: Set<string>
  ) {
    if (!this.active || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    // Sync companion overhead UI positions (Tier 1: nameTag at y - 19, Tier 2: indicator at y - 33)
    if (this.nameTag && this.nameTag.active) {
      this.nameTag.setPosition(this.x, this.y - 19);
    }
    if (this.indicator && this.indicator.active) {
      this.indicator.setPosition(this.x, this.y - 33);
    }

    // Decrement bomb placement cooldown
    this.bombCooldownTimer -= delta;

    // Spawn walking dust or charge smoke particles
    this.particleTimer -= delta;
    if (this.particleTimer <= 0 && this.scene) {
      if (this.aiState === EnemyState.ATTACK) {
        this.particleTimer = 65;
        this.spawnParticle(this.x, this.y + 6, 4, 0xffaa44, 0.7);
      } else if (
        this.aiState === EnemyState.PATROL ||
        this.aiState === EnemyState.TRACKING ||
        this.aiState === EnemyState.HUNTING
      ) {
        const body = this.body as Phaser.Physics.Arcade.Body | null;
        if (body && (Math.abs(body.velocity.x) > 10 || Math.abs(body.velocity.y) > 10)) {
          this.particleTimer = 220;
          this.spawnParticle(this.x, this.y + 12, 3, 0xffffff, 0.5);
        }
      }
    }

    const enemyR = Math.floor(this.y / TILE_SIZE);
    const enemyC = Math.floor(this.x / TILE_SIZE);
    const playerR = Math.floor(player.y / TILE_SIZE);
    const playerC = Math.floor(player.x / TILE_SIZE);

    switch (this.aiState) {
      case EnemyState.IDLE:
        this.handleIdle(delta, enemyR, enemyC, playerR, playerC, player, map, bombTiles);
        break;
      case EnemyState.PATROL:
        this.handlePatrol(delta, enemyR, enemyC, playerR, playerC, player, map, bombTiles);
        break;
      case EnemyState.TRACKING:
      case EnemyState.HUNTING:
        this.handleTracking(delta, enemyR, enemyC, playerR, playerC, player, map, bombTiles);
        break;
      case EnemyState.WINDUP:
        this.handleWindup(delta);
        break;
      case EnemyState.ATTACK:
        this.handleAttacking(delta);
        break;
      case EnemyState.COOLDOWN:
        this.handleCooldown(delta);
        break;
      case EnemyState.EVADING:
        this.handleEvading();
        break;
    }
  }

  private handleIdle(
    delta: number,
    er: number,
    ec: number,
    pr: number,
    pc: number,
    _player: Phaser.Physics.Arcade.Sprite,
    map: number[][],
    bombTiles: Set<string>
  ) {
    this.setVelocity(0, 0);
    const manhattan = Math.abs(er - pr) + Math.abs(ec - pc);

    // If player is close or has line of sight, alert and switch to HUNTING
    if (manhattan <= 5 || this.hasLineOfSight(er, ec, pr, pc, map, bombTiles)) {
      this.changeState(EnemyState.HUNTING);
      return;
    }

    this.stateTimer -= delta;
    if (this.stateTimer <= 0) {
      // Pick an adjacent open tile to patrol
      const candidates: GridCoord[] = [];
      const neighbors = [
        { r: er - 1, c: ec },
        { r: er + 1, c: ec },
        { r: er, c: ec - 1 },
        { r: er, c: ec + 1 },
      ];
      for (const n of neighbors) {
        if (
          n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS &&
          map[n.r][n.c] === TILE_EMPTY &&
          !bombTiles.has(`${n.r},${n.c}`)
        ) {
          candidates.push(n);
        }
      }

      if (candidates.length > 0) {
        this.targetTile = candidates[Math.floor(Math.random() * candidates.length)];
        this.currentPath = [this.targetTile];
        this.changeState(EnemyState.PATROL);
      } else {
        this.stateTimer = 1000;
      }
    }
  }

  private handlePatrol(
    _delta: number,
    er: number,
    ec: number,
    pr: number,
    pc: number,
    _player: Phaser.Physics.Arcade.Sprite,
    map: number[][],
    bombTiles: Set<string>
  ) {
    const manhattan = Math.abs(er - pr) + Math.abs(ec - pc);

    // Alert if player spotted
    if (manhattan <= 5 || this.hasLineOfSight(er, ec, pr, pc, map, bombTiles)) {
      this.changeState(EnemyState.HUNTING);
      return;
    }

    if (!this.targetTile) {
      this.changeState(EnemyState.IDLE);
      this.stateTimer = 1000;
      this.setVelocity(0, 0);
      return;
    }

    const targetX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
    const targetY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 4) {
      this.targetTile = null;
      this.changeState(EnemyState.IDLE);
      this.stateTimer = 1000;
      this.setVelocity(0, 0);
    } else {
      const patrolSpeed = 55;
      if (Math.abs(dx) > Math.abs(dy)) {
        const corridorY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.y - corridorY) < 6) {
          this.y = corridorY;
        }
        this.setVelocity(Math.sign(dx) * patrolSpeed, 0);
      } else {
        const corridorX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.x - corridorX) < 6) {
          this.x = corridorX;
        }
        this.setVelocity(0, Math.sign(dy) * patrolSpeed);
      }

      const body = this.body as Phaser.Physics.Arcade.Body | null;
      if (body && Math.abs(body.velocity.x) > 5) {
        this.setFlipX(body.velocity.x < 0);
      }
    }
  }

  private handleTracking(
    delta: number,
    er: number,
    ec: number,
    pr: number,
    pc: number,
    player: Phaser.Physics.Arcade.Sprite,
    map: number[][],
    bombTiles: Set<string>
  ) {
    const manhattan = Math.abs(er - pr) + Math.abs(ec - pc);

    // If normal enemy and player escaped far away (> 7 tiles and no LOS)
    if (!this.isTracker && manhattan > 7 && !this.hasLineOfSight(er, ec, pr, pc, map, bombTiles)) {
      this.changeState(EnemyState.IDLE);
      this.stateTimer = 1000;
      this.setVelocity(0, 0);
      return;
    }

    // Strategic Bomb Placement Check with Suicide Prevention
    if (
      this.canDropBombs &&
      this.activeBombs < this.maxBombs &&
      this.bombCooldownTimer <= 0 &&
      (manhattan <= 3 || this.isNearBreakableBlock(er, ec, map)) &&
      !bombTiles.has(`${er},${ec}`)
    ) {
      // 1. Calculate hypothetical danger zone
      const hypotheticalDanger = getBlastTiles({ r: er, c: ec }, this.bombPower, map);

      // 2. Add existing bombs' blast zones
      const scene = this.scene as GameScene;
      const combinedDanger = new Set(hypotheticalDanger);
      if (scene && scene.bombs) {
        scene.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
          const b = child as Phaser.Physics.Arcade.Sprite;
          if (b.active) {
            const br = Math.floor(b.y / TILE_SIZE);
            const bc = Math.floor(b.x / TILE_SIZE);
            const bPow = (b.getData('power') as number) || 2;
            const blast = getBlastTiles({ r: br, c: bc }, bPow, map);
            blast.forEach((tile) => combinedDanger.add(tile));
          }
        });
      }

      // 3. Check for guaranteed escape route within 4 steps
      const escapePath = findEscapePathBFS(
        { r: er, c: ec },
        combinedDanger,
        map,
        bombTiles,
        4
      );

      if (escapePath && escapePath.length > 0) {
        const bombPlaced = scene.placeEnemyBomb(this, er, ec, this.bombPower);
        if (bombPlaced) {
          this.activeBombs++;
          this.bombCooldownTimer = 5500; // 5.5s cooldown before placing next bomb
          this.currentPath = escapePath;
          this.targetTile = this.currentPath[0];
          this.changeState(EnemyState.EVADING);
          return;
        }
      }
    }

    // Line of Sight or Proximity trigger
    if (this.hasLineOfSight(er, ec, pr, pc, map, bombTiles) || manhattan <= 1) {
      this.startWindup(er, ec, pr, pc, player);
      return;
    }

    // Recalculate path periodically or when path is empty
    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0 || this.currentPath.length === 0) {
      this.pathRecalcTimer = 350;
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
      this.targetTile = this.currentPath.length > 0 ? this.currentPath[0] : null;
    }

    if (!this.targetTile) {
      this.setVelocity(0, 0);
      return;
    }

    const targetX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
    const targetY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 4) {
      // Reached waypoint tile center, advance to next
      this.currentPath.shift();
      this.targetTile = this.currentPath.length > 0 ? this.currentPath[0] : null;
      this.setVelocity(0, 0);
    } else {
      // Orthogonal waypoint snapping to eliminate corridor corner-snagging
      const speed = this.aiState === EnemyState.HUNTING ? 85 : this.baseSpeed;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal primary motion: snap orthogonal Y to corridor center
        const corridorY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.y - corridorY) < 6) {
          this.y = corridorY;
        }
        this.setVelocity(Math.sign(dx) * speed, 0);
      } else {
        // Vertical primary motion: snap orthogonal X to corridor center
        const corridorX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.x - corridorX) < 6) {
          this.x = corridorX;
        }
        this.setVelocity(0, Math.sign(dy) * speed);
      }

      const body = this.body as Phaser.Physics.Arcade.Body | null;
      if (body && Math.abs(body.velocity.x) > 5) {
        this.setFlipX(body.velocity.x < 0);
      }
    }
  }

  private hasLineOfSight(
    er: number,
    ec: number,
    pr: number,
    pc: number,
    map: number[][],
    bombTiles: Set<string>
  ): boolean {
    const maxRange = 6;
    if (er === pr) {
      const dist = Math.abs(ec - pc);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pc - ec);
      for (let c = ec + step; c !== pc; c += step) {
        if (c < 0 || c >= COLS) return false;
        if (map[er][c] !== TILE_EMPTY || bombTiles.has(`${er},${c}`)) return false;
      }
      return true;
    } else if (ec === pc) {
      const dist = Math.abs(er - pr);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pr - er);
      for (let r = er + step; r !== pr; r += step) {
        if (r < 0 || r >= ROWS) return false;
        if (map[r][ec] !== TILE_EMPTY || bombTiles.has(`${r},${ec}`)) return false;
      }
      return true;
    }
    return false;
  }

  private startWindup(
    er: number,
    ec: number,
    pr: number,
    pc: number,
    player: Phaser.Physics.Arcade.Sprite
  ) {
    this.changeState(EnemyState.WINDUP);
    this.stateTimer = 450; // 450ms telegraph
    this.setVelocity(0, 0);

    // FIXED: Non-zero directional resolution when sharing same tile
    if (er === pr && ec !== pc) {
      this.attackDir = { x: Math.sign(pc - ec), y: 0 };
    } else if (ec === pc && er !== pr) {
      this.attackDir = { x: 0, y: Math.sign(pr - er) };
    } else {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.attackDir = { x: Math.sign(dx) || (this.flipX ? -1 : 1), y: 0 };
      } else {
        this.attackDir = { x: 0, y: Math.sign(dy) || 1 };
      }
    }

    if (this.attackDir.x !== 0) {
      this.setFlipX(this.attackDir.x < 0);
    }
  }

  private handleWindup(delta: number) {
    this.stateTimer -= delta;
    this.setVelocity(0, 0);

    if (this.stateTimer <= 0) {
      this.changeState(EnemyState.ATTACK);
      this.stateTimer = 650; // Max attack dash duration
      this.setVelocity(
        this.attackDir.x * this.chargeSpeed,
        this.attackDir.y * this.chargeSpeed
      );
    }
  }

  private handleAttacking(delta: number) {
    this.stateTimer -= delta;

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    const isBlocked = body && (
      (this.attackDir.x > 0 && body.blocked.right) ||
      (this.attackDir.x < 0 && body.blocked.left) ||
      (this.attackDir.y > 0 && body.blocked.down) ||
      (this.attackDir.y < 0 && body.blocked.up)
    );

    if (this.stateTimer <= 0 || isBlocked) {
      this.changeState(EnemyState.COOLDOWN);
      this.stateTimer = 1200; // 1200ms recovery window
      this.setVelocity(0, 0);
      if (isBlocked && this.scene) {
        this.scene.cameras.main.shake(80, 0.005);
      }
    }
  }

  private handleCooldown(delta: number) {
    this.stateTimer -= delta;
    this.setVelocity(0, 0);

    if (this.stateTimer <= 0) {
      this.changeState(this.isTracker ? EnemyState.TRACKING : EnemyState.IDLE);
      this.stateTimer = this.isTracker ? 0 : 800;
      this.pathRecalcTimer = 0;
      this.currentPath = [];
      this.targetTile = null;
    }
  }

  private isNearBreakableBlock(er: number, ec: number, map: number[][]): boolean {
    const neighbors = [
      { r: er - 1, c: ec },
      { r: er + 1, c: ec },
      { r: er, c: ec - 1 },
      { r: er, c: ec + 1 },
    ];
    for (const n of neighbors) {
      if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
        if (map[n.r][n.c] === TILE_BLOCK) return true;
      }
    }
    return false;
  }

  private handleEvading() {
    if (!this.targetTile) {
      this.setVelocity(0, 0);
      if (this.activeBombs === 0) {
        this.changeState(this.isTracker ? EnemyState.TRACKING : EnemyState.IDLE);
      }
      return;
    }

    const targetX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
    const targetY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 4) {
      this.currentPath.shift();
      this.targetTile = this.currentPath.length > 0 ? this.currentPath[0] : null;
      this.setVelocity(0, 0);
    } else {
      const evadeSpeed = 85;
      if (Math.abs(dx) > Math.abs(dy)) {
        const corridorY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.y - corridorY) < 6) {
          this.y = corridorY;
        }
        this.setVelocity(Math.sign(dx) * evadeSpeed, 0);
      } else {
        const corridorX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.x - corridorX) < 6) {
          this.x = corridorX;
        }
        this.setVelocity(0, Math.sign(dy) * evadeSpeed);
      }

      const body = this.body as Phaser.Physics.Arcade.Body | null;
      if (body && Math.abs(body.velocity.x) > 5) {
        this.setFlipX(body.velocity.x < 0);
      }
    }
  }

  public onBombExploded() {
    this.activeBombs = Math.max(0, this.activeBombs - 1);
    if (this.aiState === EnemyState.EVADING && !this.targetTile) {
      this.changeState(this.isTracker ? EnemyState.TRACKING : EnemyState.IDLE);
    }
  }

  public override destroy(fromScene?: boolean) {
    this.stopStateTweens();
    if (this.scene && this.active) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const spark = this.scene.add.circle(this.x, this.y, 4, 0xffe066, 0.9);
        spark.setDepth(14);
        this.scene.tweens.add({
          targets: spark,
          x: this.x + Math.cos(angle) * 20,
          y: this.y + Math.sin(angle) * 20,
          alpha: 0,
          scale: 0.2,
          duration: 260,
          onComplete: () => spark.destroy(),
        });
      }
    }
    if (this.nameTag && this.nameTag.active) {
      this.nameTag.destroy();
    }
    if (this.indicator && this.indicator.active) {
      this.indicator.destroy();
    }
    super.destroy(fromScene);
  }
}

/**
 * Main Phaser GameScene for Bomberman.
 */
export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private blocks!: Phaser.Physics.Arcade.StaticGroup;
  public bombs!: Phaser.Physics.Arcade.Group;
  public explosions!: Phaser.Physics.Arcade.Group;
  public enemies!: Phaser.Physics.Arcade.Group;
  public items!: Phaser.Physics.Arcade.Group;

  private spaceKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;

  // Player stats & dynamic state
  public playerSpeed: number = BASE_PLAYER_SPEED;
  public speedLevel: number = 1;
  public activeBombs: number = 0;
  public maxBombs: number = BASE_MAX_BOMBS;
  public bombPower: number = BASE_BOMB_POWER; // blast radius
  public hasKick: boolean = false;
  public hasShield: boolean = false;
  public isDashing: boolean = false;
  public dashCooldownRemaining: number = 0;
  public isInvulnerable: boolean = false;
  public shieldInvulnerableUntil: number = 0;
  public portalCooldown: number = 0;
  public score: number = 0;
  public itemsCollected = {
    speedUp: 0,
    bombUp: 0,
    fireUp: 0,
    kick: 0,
    shield: 0,
  };

  private shieldVisual: Phaser.GameObjects.Graphics | null = null;
  public conveyors: ConveyorConfig[] = [...DEFAULT_CONVEYORS];

  private map: number[][] = [];
  private isGameOver: boolean = false;
  private playerFacing: 'down' | 'up' | 'left' | 'right' = 'down';

  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.spritesheet('player', '/assets/player.png', {
      frameWidth: 40,
      frameHeight: 40,
    });
    this.load.image('enemy', '/assets/enemy.png');
    this.load.image('enemy_tracker', '/assets/enemy_tracker.png');
    this.load.image('bomb', '/assets/bomb.png');
    this.load.image('explosion', '/assets/explosion.png');
    this.load.image('wall', '/assets/wall.png');
    this.load.image('block', '/assets/block.png');
    this.load.image('floor', '/assets/floor.png');
    this.load.image('background', '/assets/background.png');
  }

  create() {
    this.isGameOver = false;
    this.playerFacing = 'down';
    this.playerSpeed = BASE_PLAYER_SPEED;
    this.speedLevel = 1;
    this.activeBombs = 0;
    this.maxBombs = BASE_MAX_BOMBS;
    this.bombPower = BASE_BOMB_POWER;
    this.hasKick = false;
    this.hasShield = false;
    this.isDashing = false;
    this.dashCooldownRemaining = 0;
    this.isInvulnerable = false;
    this.shieldInvulnerableUntil = 0;
    this.portalCooldown = 0;
    this.score = 0;
    this.itemsCollected = {
      speedUp: 0,
      bombUp: 0,
      fireUp: 0,
      kick: 0,
      shield: 0,
    };
    this.cameras.main.setBackgroundColor('#87CEEB');

    // Generate procedural textures for items
    this.generateItemTextures();

    // Register Player Animations
    this.anims.create({
      key: 'player_down',
      frames: this.anims.generateFrameNumbers('player', { frames: [0, 1, 0, 2] }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: 'player_up',
      frames: this.anims.generateFrameNumbers('player', { frames: [3, 4, 3, 5] }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: 'player_side',
      frames: this.anims.generateFrameNumbers('player', { frames: [6, 7, 6, 8] }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: 'player_defeat',
      frames: this.anims.generateFrameNumbers('player', { frames: [9, 10, 11] }),
      frameRate: 6,
      repeat: 0,
    });

    // Background image at (400, 300) with setScrollFactor(0) and setDepth(-10)
    const bg = this.add.image(400, 300, 'background');
    bg.setScrollFactor(0);
    bg.setDepth(-10);

    // Physics Groups
    this.walls = this.physics.add.staticGroup();
    this.blocks = this.physics.add.staticGroup();
    this.bombs = this.physics.add.group();
    this.explosions = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.items = this.physics.add.group();

    this.generateMap();

    // Spawn player at depth 10 with physics size 24x24 (offset 8, 8)
    this.player = this.physics.add.sprite(
      1 * TILE_SIZE + TILE_SIZE / 2,
      1 * TILE_SIZE + TILE_SIZE / 2,
      'player'
    );
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);
    this.player.setFrame(0);

    // Spawn enemies at depth 9 with physics size 24x24 (offset 8, 8)
    this.spawnEnemies(4);

    // Collisions
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.blocks);
    this.physics.add.collider(this.player, this.bombs, (playerObj, bombObj) => {
      if (this.hasKick) {
        this.tryKickBomb(playerObj as Phaser.Physics.Arcade.Sprite, bombObj as Phaser.Physics.Arcade.Sprite);
      }
    }, (playerObj, bombObj) => {
      const p = playerObj as Phaser.Physics.Arcade.Sprite;
      const b = bombObj as Phaser.Physics.Arcade.Sprite;
      const pr = Math.floor(p.y / TILE_SIZE);
      const pc = Math.floor(p.x / TILE_SIZE);
      const br = Math.floor(b.y / TILE_SIZE);
      const bc = Math.floor(b.x / TILE_SIZE);
      if (pr === br && pc === bc) return false;
      return true;
    });

    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.enemies, this.blocks);
    this.physics.add.collider(this.enemies, this.bombs, undefined, (enemyObj, bombObj) => {
      const e = enemyObj as Phaser.Physics.Arcade.Sprite;
      const b = bombObj as Phaser.Physics.Arcade.Sprite;
      const er = Math.floor(e.y / TILE_SIZE);
      const ec = Math.floor(e.x / TILE_SIZE);
      const br = Math.floor(b.y / TILE_SIZE);
      const bc = Math.floor(b.x / TILE_SIZE);
      if (er === br && ec === bc) return false;
      return true;
    });

    // Player picks up item
    this.physics.add.overlap(this.player, this.items, (_playerObj, itemObj) => {
      const item = itemObj as Phaser.Physics.Arcade.Sprite;
      if (!item || !item.active) return;
      const type = item.getData('itemType') as ItemType;
      this.collectItem(type, item.x, item.y);
      item.destroy();
    });

    // Explosions destroy items ONLY after 600ms grace period
    this.physics.add.overlap(this.items, this.explosions, (itemObj) => {
      const item = itemObj as Phaser.Physics.Arcade.Sprite;
      if (!item || !item.active) return;
      const spawnTime = (item.getData('spawnTime') as number) || 0;
      if (!isItemProtectedFromExplosion(spawnTime, this.time.now)) {
        item.destroy();
      }
    });

    // Sliding bomb hits enemy
    this.physics.add.overlap(this.bombs, this.enemies, (bombObj, enemyObj) => {
      const bomb = bombObj as Phaser.Physics.Arcade.Sprite;
      const enemy = enemyObj as Enemy;
      if (bomb.active && bomb.getData('isSliding') && enemy.active) {
        const bCol = Math.floor(bomb.x / TILE_SIZE);
        const bRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, bRow, bCol);
      }
    });

    // Player hits enemy
    this.physics.add.overlap(this.player, this.enemies, () => {
      this.playerDie();
    });

    // Global explosion overlaps
    this.physics.add.overlap(this.player, this.explosions, () => {
      this.playerDie();
    });
    this.physics.add.overlap(this.enemies, this.explosions, (enemyObj) => {
      const target = enemyObj as Phaser.GameObjects.GameObject;
      if (target.active) {
        target.destroy();
      }
    });

    // Keyboard Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    // Emit initial stats payload to React HUD
    this.emitStatsUpdate();
  }

  spawnEnemies(count: number) {
    let spawned = 0;
    const spawnedTiles = new Set<string>();

    while (spawned < count) {
      const r = Phaser.Math.Between(5, ROWS - 2);
      const c = Phaser.Math.Between(5, COLS - 2);
      const key = `${r},${c}`;

      if (this.map[r][c] === TILE_EMPTY && !spawnedTiles.has(key)) {
        spawnedTiles.add(key);
        const isTracker = spawned % 2 === 0;
        const textureKey = isTracker ? 'enemy_tracker' : 'enemy';

        const enemy = new Enemy(
          this,
          c * TILE_SIZE + TILE_SIZE / 2,
          r * TILE_SIZE + TILE_SIZE / 2,
          textureKey,
          isTracker
        );

        this.enemies.add(enemy);
        enemy.setDepth(9);
        (enemy.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(8, 8);

        spawned++;
      }
    }
  }

  generateMap() {
    const offsetX = (800 - COLS * TILE_SIZE) / 2;
    const offsetY = (600 - ROWS * TILE_SIZE) / 2;

    this.cameras.main.setScroll(-offsetX, -offsetY);

    for (let r = 0; r < ROWS; r++) {
      this.map[r] = [];
      for (let c = 0; c < COLS; c++) {
        // Floor tile at depth 0
        const floor = this.add.image(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'floor');
        floor.setDepth(0);

        // Outer borders
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          this.map[r][c] = TILE_WALL;
          const wall = this.walls.create(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'wall') as Phaser.Physics.Arcade.Sprite;
          wall.setDepth(1);
          wall.refreshBody();
        }
        // Inner fixed pillars
        else if (r % 2 === 0 && c % 2 === 0) {
          this.map[r][c] = TILE_WALL;
          const wall = this.walls.create(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'wall') as Phaser.Physics.Arcade.Sprite;
          wall.setDepth(1);
          wall.refreshBody();
        }
        // Breakable blocks or empty space
        else {
          // Keep player spawn corner (1,1), (1,2), (2,1) open
          if ((r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1)) {
            this.map[r][c] = TILE_EMPTY;
          }
          // Keep portals open
          else if (
            (r === DEFAULT_PORTALS.portalA.row && c === DEFAULT_PORTALS.portalA.col) ||
            (r === DEFAULT_PORTALS.portalB.row && c === DEFAULT_PORTALS.portalB.col)
          ) {
            this.map[r][c] = TILE_EMPTY;
          }
          // Keep conveyor corridor open
          else if (this.conveyors.some((cv) => cv.row === r && cv.col === c)) {
            this.map[r][c] = TILE_EMPTY;
          } else if (Math.random() < 0.6) {
            this.map[r][c] = TILE_BLOCK;
            const block = this.blocks.create(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'block') as Phaser.Physics.Arcade.Sprite;
            block.setDepth(1);
            block.setData('row', r);
            block.setData('col', c);
            block.refreshBody();
          } else {
            this.map[r][c] = TILE_EMPTY;
          }
        }
      }
    }

    // Conveyor belt overlays
    this.conveyors.forEach((cv) => {
      const cx = cv.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = cv.row * TILE_SIZE + TILE_SIZE / 2;
      const marker = this.add.text(cx, cy, '⏩', {
        fontSize: '14px',
        color: '#38bdf8',
      });
      marker.setOrigin(0.5, 0.5);
      marker.setDepth(1);
      marker.setAlpha(0.65);
    });

    // Portal visual runes
    const pA = DEFAULT_PORTALS.portalA;
    const pB = DEFAULT_PORTALS.portalB;
    const portalA = this.add.text(pA.col * TILE_SIZE + TILE_SIZE / 2, pA.row * TILE_SIZE + TILE_SIZE / 2, '🌀', {
      fontSize: '20px',
    });
    portalA.setOrigin(0.5, 0.5);
    portalA.setDepth(2);

    const portalB = this.add.text(pB.col * TILE_SIZE + TILE_SIZE / 2, pB.row * TILE_SIZE + TILE_SIZE / 2, '🌀', {
      fontSize: '20px',
    });
    portalB.setOrigin(0.5, 0.5);
    portalB.setDepth(2);

    this.tweens.add({
      targets: [portalA, portalB],
      angle: 360,
      duration: 3500,
      repeat: -1,
    });
  }

  update(_time: number, delta: number) {
    if (this.isGameOver || !this.player || !this.cursors) return;

    // 1. Dash cooldown & portal cooldown decrements
    if (this.dashCooldownRemaining > 0) {
      const prevCd = this.dashCooldownRemaining;
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - delta);
      if (prevCd > 0 && this.dashCooldownRemaining === 0) {
        this.emitStatsUpdate();
      }
    }

    if (this.portalCooldown > 0) {
      this.portalCooldown = Math.max(0, this.portalCooldown - delta);
    }

    // 2. Dash skill trigger check
    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false, dash: false };
    const dashPressed = Boolean(this.shiftKey?.isDown || this.eKey?.isDown || mInput.dash);
    if (mInput.dash) mInput.dash = false; // consume mobile dash

    if (dashPressed && !this.isDashing && this.dashCooldownRemaining <= 0 && !this.isGameOver) {
      this.performDash();
    }

    // 3. Movement
    this.updatePlayerMovement();

    // 4. Bomb placement
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || mInput.bomb) {
      if (mInput.bomb) mInput.bomb = false; // consume mobile input
      this.placeBomb();
    }

    // 5. Conveyor belt push drift for player
    const pCol = Math.floor(this.player.x / TILE_SIZE);
    const pRow = Math.floor(this.player.y / TILE_SIZE);
    const belt = this.conveyors.find((c) => c.row === pRow && c.col === pCol);
    if (belt && !this.isDashing) {
      const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
      const nextX = this.player.x + belt.dirX * drift;
      const nextY = this.player.y + belt.dirY * drift;
      const nCol = Math.floor(nextX / TILE_SIZE);
      const nRow = Math.floor(nextY / TILE_SIZE);
      if (this.map[nRow]?.[nCol] === TILE_EMPTY) {
        this.player.x = nextX;
        this.player.y = nextY;
      }
    }

    // 6. Teleport Portal warp
    if (this.portalCooldown <= 0) {
      if (pRow === DEFAULT_PORTALS.portalA.row && pCol === DEFAULT_PORTALS.portalA.col) {
        this.warpPlayer(DEFAULT_PORTALS.portalB.row, DEFAULT_PORTALS.portalB.col);
      } else if (pRow === DEFAULT_PORTALS.portalB.row && pCol === DEFAULT_PORTALS.portalB.col) {
        this.warpPlayer(DEFAULT_PORTALS.portalA.row, DEFAULT_PORTALS.portalA.col);
      }
    }

    // 7. Conveyor push drift for bombs & sliding bomb physics
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const bomb = child as Phaser.Physics.Arcade.Sprite;
      if (!bomb.active) return;

      const bCol = Math.floor(bomb.x / TILE_SIZE);
      const bRow = Math.floor(bomb.y / TILE_SIZE);

      if (bomb.getData('isSliding')) {
        const dir = bomb.getData('slideDir') as { x: number; y: number };
        const lookahead = Math.max(16, BOMB_KICK_SPEED * (delta / 1000) + 4);
        const checkX = bomb.x + dir.x * lookahead;
        const checkY = bomb.y + dir.y * lookahead;
        const targetCol = Math.floor(checkX / TILE_SIZE);
        const targetRow = Math.floor(checkY / TILE_SIZE);

        let blocked = false;
        if (targetRow < 0 || targetRow >= ROWS || targetCol < 0 || targetCol >= COLS) {
          blocked = true;
        } else if (this.map[targetRow][targetCol] !== TILE_EMPTY) {
          blocked = true;
        } else {
          this.bombs.getChildren().forEach((other) => {
            const ob = other as Phaser.Physics.Arcade.Sprite;
            if (ob.active && ob !== bomb) {
              const obr = Math.floor(ob.y / TILE_SIZE);
              const obc = Math.floor(ob.x / TILE_SIZE);
              if (obr === targetRow && obc === targetCol) {
                blocked = true;
              }
            }
          });
        }

        if (blocked) {
          bomb.setVelocity(0, 0);
          bomb.setData('isSliding', false);
          (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
          bomb.setPosition(bCol * TILE_SIZE + TILE_SIZE / 2, bRow * TILE_SIZE + TILE_SIZE / 2);
        }
      } else {
        // Not sliding: check conveyor drift
        const bBelt = this.conveyors.find((c) => c.row === bRow && c.col === bCol);
        if (bBelt) {
          const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
          const nextX = bomb.x + bBelt.dirX * drift;
          const nextY = bomb.y + bBelt.dirY * drift;
          const targetCol = Math.floor(nextX / TILE_SIZE);
          const targetRow = Math.floor(nextY / TILE_SIZE);
          if (this.map[targetRow]?.[targetCol] === TILE_EMPTY) {
            bomb.x = nextX;
            bomb.y = nextY;
          }
        }
      }
    });

    // 8. Shield visual follow
    if (this.hasShield) {
      if (!this.shieldVisual) {
        this.shieldVisual = this.add.graphics();
        this.shieldVisual.setDepth(11);
      }
      this.shieldVisual.clear();
      this.shieldVisual.lineStyle(2, 0x38bdf8, 0.85);
      this.shieldVisual.fillStyle(0x0284c7, 0.25);
      this.shieldVisual.strokeCircle(this.player.x, this.player.y, 18);
      this.shieldVisual.fillCircle(this.player.x, this.player.y, 18);
    } else if (this.shieldVisual) {
      this.shieldVisual.destroy();
      this.shieldVisual = null;
    }

    // 9. Collect active bomb tiles for AI path avoidance
    const bombTiles = new Set<string>();
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active) {
        const col = Math.floor(b.x / TILE_SIZE);
        const row = Math.floor(b.y / TILE_SIZE);
        bombTiles.add(`${row},${col}`);
      }
    });

    // 10. Update enemies with advanced tracking and attack AI
    this.enemies.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const enemy = child as Enemy;
      if (enemy.active) {
        enemy.updateAI(_time, delta, this.player, this.map, bombTiles);
      }
    });
  }

  /**
   * Smooth Corridor Centering and Corner-Sliding Movement Controller
   */
  private updatePlayerMovement() {
    if (!this.player || !this.player.body) return;

    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false, dash: false };
    const left = Boolean(this.cursors?.left?.isDown || mInput.left);
    const right = Boolean(this.cursors?.right?.isDown || mInput.right);
    const up = Boolean(this.cursors?.up?.isDown || mInput.up);
    const down = Boolean(this.cursors?.down?.isDown || mInput.down);

    if (!left && !right && !up && !down) {
      this.player.setVelocity(0, 0);
      this.player.anims.stop();
      switch (this.playerFacing) {
        case 'down':
          this.player.setFrame(0);
          break;
        case 'up':
          this.player.setFrame(3);
          break;
        case 'right':
          this.player.setFlipX(false);
          this.player.setFrame(6);
          break;
        case 'left':
          this.player.setFlipX(true);
          this.player.setFrame(6);
          break;
      }
      return;
    }

    const speed = this.isDashing ? DASH_SPEED : this.playerSpeed;
    const slideSpeed = speed;
    const snapThreshold = 2;

    const px = this.player.x;
    const py = this.player.y;

    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);

    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;

    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    // Fast check for tile passability avoiding walls, blocks, and other active bombs
    const isPassable = (r: number, c: number): boolean => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      if (this.map[r][c] !== TILE_EMPTY) return false;

      let hasBomb = false;
      this.bombs.getChildren().forEach((child) => {
        const b = child as Phaser.Physics.Arcade.Sprite;
        if (b.active) {
          const br = Math.floor(b.y / TILE_SIZE);
          const bc = Math.floor(b.x / TILE_SIZE);
          if (br === r && bc === c) {
            // Allow stepping off a bomb if player is currently on it
            if (!(row === r && col === c)) {
              hasBomb = true;
            }
          }
        }
      });
      return !hasBomb;
    };

    // Directional intent
    let wantX = 0;
    let wantY = 0;
    if (left && !right) wantX = -1;
    else if (right && !left) wantX = 1;

    if (up && !down) wantY = -1;
    else if (down && !up) wantY = 1;

    // Resolve dominant axis when multiple inputs are pressed
    let primaryAxis: 'x' | 'y' = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = isPassable(row, col + wantX);
      const yOpen = isPassable(row + wantY, col);

      if (xOpen && !yOpen) {
        primaryAxis = 'x';
      } else if (yOpen && !xOpen) {
        primaryAxis = 'y';
      } else {
        const timeX = wantX < 0 ? (this.cursors?.left?.timeDown ?? 0) : (this.cursors?.right?.timeDown ?? 0);
        const timeY = wantY < 0 ? (this.cursors?.up?.timeDown ?? 0) : (this.cursors?.down?.timeDown ?? 0);
        primaryAxis = timeY > timeX ? 'y' : 'x';
      }
    } else if (wantX !== 0) {
      primaryAxis = 'x';
    } else if (wantY !== 0) {
      primaryAxis = 'y';
    }

    let vx = 0;
    let vy = 0;

    if (primaryAxis === 'x') {
      vx = wantX * speed;
      this.player.setFlipX(wantX < 0);
      this.playerFacing = wantX < 0 ? 'left' : 'right';
      this.player.anims.play('player_side', true);

      const nextCol = col + wantX;
      const directOpen = isPassable(row, nextCol);

      if (directOpen) {
        // Phase 1: Corridor Centering
        if (Math.abs(diffY) > snapThreshold) {
          vy = -Math.sign(diffY) * slideSpeed;
        } else {
          this.player.y = rowCenterY;
          vy = 0;
        }
      } else {
        // Phase 2: Corner Rounding
        const canRoundUp = diffY < -3 && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
        const canRoundDown = diffY > 3 && isPassable(row + 1, col) && isPassable(row + 1, nextCol);

        if (canRoundUp) {
          vy = -slideSpeed;
        } else if (canRoundDown) {
          vy = slideSpeed;
        } else {
          vy = 0;
        }
      }
    } else {
      vy = wantY * speed;
      this.playerFacing = wantY < 0 ? 'up' : 'down';
      this.player.anims.play(wantY < 0 ? 'player_up' : 'player_down', true);

      const nextRow = row + wantY;
      const directOpen = isPassable(nextRow, col);

      if (directOpen) {
        // Phase 1: Corridor Centering
        if (Math.abs(diffX) > snapThreshold) {
          vx = -Math.sign(diffX) * slideSpeed;
        } else {
          this.player.x = colCenterX;
          vx = 0;
        }
      } else {
        // Phase 2: Corner Rounding
        const canRoundLeft = diffX < -3 && isPassable(row, col - 1) && isPassable(nextRow, col - 1);
        const canRoundRight = diffX > 3 && isPassable(row, col + 1) && isPassable(nextRow, col + 1);

        if (canRoundLeft) {
          vx = -slideSpeed;
          this.player.setFlipX(true);
        } else if (canRoundRight) {
          vx = slideSpeed;
          this.player.setFlipX(false);
        } else {
          vx = 0;
        }
      }
    }

    this.player.setVelocity(vx, vy);
  }

  placeBomb() {
    if (this.isGameOver || this.activeBombs >= this.maxBombs) return;

    const col = Math.floor(this.player.x / TILE_SIZE);
    const row = Math.floor(this.player.y / TILE_SIZE);

    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    // Prevent placing multiple bombs on same tile
    let hasBomb = false;
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active && b.x === centerX && b.y === centerY) {
        hasBomb = true;
      }
    });

    if (hasBomb) return;

    const bomb = this.bombs.create(centerX, centerY, 'bomb') as Phaser.Physics.Arcade.Sprite;
    bomb.setDepth(5);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);

    // Multi-stage accelerating pulse tween chain (Total duration = 2000ms)
    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        // Phase 1: Normal Rhythmic Pulse (0ms - 1000ms: 2 cycles @ 250ms half-period)
        {
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 250,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        // Phase 2: Accelerated Warning Pulse (1000ms - 1600ms: 2 cycles @ 150ms half-period)
        {
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xff8866); // Warning amber tint
          },
        },
        // Phase 3: Critical Detonation Swell & Hyper-Pulse (1600ms - 2000ms: ~3 cycles @ 65ms half-period)
        {
          scaleX: 1.35,
          scaleY: 1.35,
          duration: 65,
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xff2222); // Critical red alert
          },
        },
      ],
    });

    this.activeBombs++;
    this.emitStatsUpdate();

    // Attach references to bomb data for clean lifecycle management
    const fuseTimer = this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
    bomb.setData('owner', 'player');
    bomb.setData('power', this.bombPower);
    bomb.setData('fuseTimer', fuseTimer);
    bomb.setData('tweenChain', tweenChain);
  }

  placeEnemyBomb(enemy: Enemy, row: number, col: number, power: number): boolean {
    if (this.isGameOver) return false;

    // Enforce global active enemy bomb limit (max 2 across arena)
    let enemyBombCount = 0;
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active && b.getData('owner') === 'enemy') {
        enemyBombCount++;
      }
    });
    if (enemyBombCount >= 2) return false;

    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    // Prevent placing multiple bombs on same tile
    let hasBomb = false;
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active && b.x === centerX && b.y === centerY) {
        hasBomb = true;
      }
    });
    if (hasBomb) return false;

    const bomb = this.bombs.create(centerX, centerY, 'bomb') as Phaser.Physics.Arcade.Sprite;
    bomb.setDepth(5);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);

    bomb.setData('owner', 'enemy');
    bomb.setData('enemy', enemy);
    bomb.setData('power', power);

    // Distinct purple/amethyst pulse tint (0xd946ef)
    bomb.setTint(0xd946ef);

    // Multi-stage accelerating pulse tween chain with purple/amethyst theme (Total duration = 2000ms)
    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        // Phase 1: Normal Rhythmic Pulse (0ms - 1000ms: 2 cycles @ 250ms)
        {
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 250,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        // Phase 2: Accelerated Warning Pulse (1000ms - 1600ms: 2 cycles @ 150ms)
        {
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xc084fc); // Bright amethyst warning
          },
        },
        // Phase 3: Critical Detonation Swell (1600ms - 2000ms: ~3 cycles @ 65ms)
        {
          scaleX: 1.35,
          scaleY: 1.35,
          duration: 65,
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xa855f7); // Deep critical violet alert
          },
        },
      ],
    });

    const fuseTimer = this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
    bomb.setData('fuseTimer', fuseTimer);
    bomb.setData('tweenChain', tweenChain);

    return true;
  }

  explodeBomb(bomb: Phaser.Physics.Arcade.Sprite, row: number, col: number) {
    if (!bomb.active) return;

    // Clean up timers & tweens
    const timer = bomb.getData('fuseTimer') as Phaser.Time.TimerEvent | undefined;
    if (timer) timer.remove(false);
    const chain = bomb.getData('tweenChain') as Phaser.Tweens.TweenChain | undefined;
    if (chain) chain.stop();

    const owner = bomb.getData('owner') || 'player';
    const bombPower = (bomb.getData('power') as number) || this.bombPower;

    bomb.destroy();

    // Isolated capacity management
    if (owner === 'player') {
      this.activeBombs = Math.max(0, this.activeBombs - 1);
      this.emitStatsUpdate();
    } else if (owner === 'enemy') {
      const enemy = bomb.getData('enemy') as Enemy | undefined;
      if (enemy && enemy.onBombExploded) {
        enemy.onBombExploded();
      }
    }

    // 1. Tactile Camera Shake
    this.cameras.main.shake(150, 0.008);

    // 2. High-Impact Screen Flash (warm golden-white flash)
    this.cameras.main.flash(80, 255, 230, 160, false);

    // 3. Dynamic Expanding Shockwave Ring
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;
    const shockwave = this.add.graphics();
    shockwave.setDepth(15);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 220,
      ease: 'Quad.easeOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        shockwave.clear();
        shockwave.lineStyle(3 * (1 - t) + 0.5, 0xffe066, 0.85 * (1 - t));
        shockwave.strokeCircle(centerX, centerY, 8 + t * (TILE_SIZE * 1.3));
      },
      onComplete: () => {
        shockwave.destroy();
      },
    });

    // Spawn Epicenter Explosion (isCenter = true)
    this.spawnExplosion(row, col, true);

    const directions = [
      { dr: -1, dc: 0 }, // up
      { dr: 1, dc: 0 },  // down
      { dr: 0, dc: -1 }, // left
      { dr: 0, dc: 1 },  // right
    ];

    for (const dir of directions) {
      for (let i = 1; i <= bombPower; i++) {
        const nr = row + dir.dr * i;
        const nc = col + dir.dc * i;

        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;

        if (this.map[nr][nc] === TILE_WALL) {
          break; // Stop at unbreakable wall
        }

        if (this.map[nr][nc] === TILE_BLOCK) {
          // Destroy block and stop
          this.destroyBlock(nr, nc);
          this.spawnExplosion(nr, nc, false);
          break;
        }

        // Empty tile, spawn explosion
        this.spawnExplosion(nr, nc, false);

        // Check for chain reaction with other bombs
        this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
          const otherBomb = child as Phaser.Physics.Arcade.Sprite;
          if (otherBomb.active) {
            const bCol = Math.floor(otherBomb.x / TILE_SIZE);
            const bRow = Math.floor(otherBomb.y / TILE_SIZE);
            if (bRow === nr && bCol === nc) {
              this.explodeBomb(otherBomb, bRow, bCol);
            }
          }
        });
      }
    }
  }

  spawnExplosion(row: number, col: number, isCenter: boolean = false) {
    const x = col * TILE_SIZE + TILE_SIZE / 2;
    const y = row * TILE_SIZE + TILE_SIZE / 2;

    const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
    exp.setDepth(12);

    // Center core has bright brilliant tint, arms have hot orange tint
    if (isCenter) {
      exp.setTint(0xffffcc);
    } else {
      exp.setTint(0xff7722);
    }

    // Explosive bloom easing: pop in with easeOut, then rapid fade
    exp.setScale(0.7);
    this.tweens.add({
      targets: exp,
      scaleX: isCenter ? 1.35 : 1.2,
      scaleY: isCenter ? 1.35 : 1.2,
      alpha: { from: 1, to: 0.1 },
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => {
        exp.destroy();
      },
    });
  }

  destroyBlock(row: number, col: number) {
    this.map[row][col] = TILE_EMPTY;
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    this.blocks.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b && b.active && b.getData('row') === row && b.getData('col') === col) {
        // Spawn 4 crumbling debris fragments
        const offsets = [
          { dx: -6, dy: -6, vx: -25, vy: -25 },
          { dx: 6, dy: -6, vx: 25, vy: -25 },
          { dx: -6, dy: 6, vx: -25, vy: 25 },
          { dx: 6, dy: 6, vx: 25, vy: 25 },
        ];
        offsets.forEach((off) => {
          const frag = this.add.rectangle(centerX + off.dx, centerY + off.dy, 8, 8, 0xb87333);
          frag.setDepth(11);
          this.tweens.add({
            targets: frag,
            x: frag.x + off.vx,
            y: frag.y + off.vy,
            alpha: 0,
            angle: 45,
            duration: 220,
            onComplete: () => frag.destroy(),
          });
        });

        b.destroy();
      }
    });

    // 45% drop chance with weighted item roll
    const droppedItem = determineItemDrop();
    if (droppedItem) {
      this.spawnItem(row, col, droppedItem);
    }
  }

  playerDie() {
    if (this.isGameOver) return;
    if (this.isInvulnerable) return;

    if (this.hasShield) {
      this.hasShield = false;
      this.isInvulnerable = true;
      this.shieldInvulnerableUntil = this.time.now + 1500;
      this.cameras.main.shake(120, 0.01);

      // Spawn shield shatter burst
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const spark = this.add.circle(this.player.x, this.player.y, 4, 0x38bdf8, 0.9);
        spark.setDepth(14);
        this.tweens.add({
          targets: spark,
          x: this.player.x + Math.cos(angle) * 25,
          y: this.player.y + Math.sin(angle) * 25,
          alpha: 0,
          scale: 0.2,
          duration: 250,
          onComplete: () => spark.destroy(),
        });
      }

      // 1.5s i-frame blink
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 7,
        onComplete: () => {
          if (this.player && this.player.active) {
            this.player.alpha = 1;
            if (!this.isDashing) {
              this.isInvulnerable = false;
            }
          }
        },
      });

      this.emitStatsUpdate();
      return;
    }

    this.isGameOver = true;
    this.player.setVelocity(0, 0);
    this.player.anims.play('player_defeat');
    this.physics.pause();
    this.emitStatsUpdate();

    this.time.delayedCall(1000, () => {
      this.isGameOver = false;
      this.activeBombs = 0;
      this.playerFacing = 'down';
      this.scene.restart();
    });
  }

  public getStats(): PlayerStats {
    return {
      speed: this.playerSpeed,
      speedLevel: this.speedLevel,
      maxBombs: this.maxBombs,
      activeBombs: this.activeBombs,
      bombPower: this.bombPower,
      hasKick: this.hasKick,
      hasShield: this.hasShield,
      dashCooldownRemaining: Math.max(0, Math.ceil(this.dashCooldownRemaining)),
      itemsCollected: { ...this.itemsCollected },
      score: this.score,
      isGameOver: this.isGameOver,
    };
  }

  public emitStatsUpdate() {
    if (this.game && this.game.events) {
      this.game.events.emit('stats-update', this.getStats());
    }
  }

  private performDash() {
    this.isDashing = true;
    this.isInvulnerable = true;
    this.dashCooldownRemaining = DASH_COOLDOWN_MS;

    let dirX = 0;
    let dirY = 0;
    switch (this.playerFacing) {
      case 'left': dirX = -1; break;
      case 'right': dirX = 1; break;
      case 'up': dirY = -1; break;
      case 'down': dirY = 1; break;
    }

    this.player.setVelocity(dirX * DASH_SPEED, dirY * DASH_SPEED);

    // 3 Ghost afterimages
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 40, () => {
        if (!this.player || !this.player.active) return;
        const ghost = this.add.sprite(this.player.x, this.player.y, 'player', this.player.frame.name);
        ghost.setFlipX(this.player.flipX);
        ghost.setAlpha(0.5);
        ghost.setTint(0x38bdf8);
        ghost.setDepth(9);
        this.tweens.add({
          targets: ghost,
          alpha: 0,
          scale: 0.8,
          duration: 200,
          onComplete: () => ghost.destroy(),
        });
      });
    }

    this.time.delayedCall(DASH_DURATION_MS, () => {
      this.isDashing = false;
      if (this.time.now >= this.shieldInvulnerableUntil) {
        this.isInvulnerable = false;
      }
      if (this.player && this.player.active) {
        this.player.setVelocity(0, 0);
      }
    });

    this.emitStatsUpdate();
  }

  private warpPlayer(toRow: number, toCol: number) {
    this.portalCooldown = PORTAL_COOLDOWN_MS;
    const targetX = toCol * TILE_SIZE + TILE_SIZE / 2;
    const targetY = toRow * TILE_SIZE + TILE_SIZE / 2;

    this.cameras.main.flash(100, 56, 189, 248, false);

    this.tweens.add({
      targets: this.player,
      scaleX: 0.1,
      scaleY: 0.1,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeIn',
      onYoyo: () => {
        if (this.player && this.player.active) {
          this.player.setPosition(targetX, targetY);
        }
      },
    });
  }

  spawnItem(row: number, col: number, type: ItemType) {
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    const textureMap: Record<ItemType, string> = {
      SPEED_UP: 'item_speed',
      BOMB_UP: 'item_bomb',
      FIRE_UP: 'item_fire',
      KICK: 'item_kick',
      SHIELD: 'item_shield',
    };

    const textureKey = textureMap[type];
    const item = this.items.create(centerX, centerY, textureKey) as Phaser.Physics.Arcade.Sprite;
    item.setDepth(4);
    (item.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(4, 4);
    item.setData('itemType', type);
    item.setData('spawnTime', this.time.now);
    item.setData('row', row);
    item.setData('col', col);

    // Floating bobbing animation
    this.tweens.add({
      targets: item,
      y: centerY - 4,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  collectItem(type: ItemType, x: number, y: number) {
    const currentStats = this.getStats();
    const result = applyItemUpgrade(currentStats, type);

    // Sync instance variables
    this.playerSpeed = currentStats.speed;
    this.speedLevel = currentStats.speedLevel;
    this.maxBombs = currentStats.maxBombs;
    this.bombPower = currentStats.bombPower;
    this.hasKick = currentStats.hasKick;
    this.hasShield = currentStats.hasShield;
    this.score = currentStats.score;

    this.spawnFloatingText(x, y - 8, result.label, result.color);
    this.spawnPickupParticles(x, y, result.color);

    this.emitStatsUpdate();
  }

  tryKickBomb(player: Phaser.Physics.Arcade.Sprite, bomb: Phaser.Physics.Arcade.Sprite) {
    if (!this.hasKick || !bomb.active || bomb.getData('isSliding')) return;

    let dirX = 0;
    let dirY = 0;
    const dx = bomb.x - player.x;
    const dy = bomb.y - player.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      dirX = Math.sign(dx);
    } else if (Math.abs(dy) > 0) {
      dirY = Math.sign(dy);
    } else {
      switch (this.playerFacing) {
        case 'left': dirX = -1; break;
        case 'right': dirX = 1; break;
        case 'up': dirY = -1; break;
        case 'down': dirY = 1; break;
      }
    }

    if (dirX === 0 && dirY === 0) return;

    const bCol = Math.floor(bomb.x / TILE_SIZE);
    const bRow = Math.floor(bomb.y / TILE_SIZE);
    const targetC = bCol + dirX;
    const targetR = bRow + dirY;

    // Check if next tile is open
    if (targetR < 0 || targetR >= ROWS || targetC < 0 || targetC >= COLS) return;
    if (this.map[targetR][targetC] !== TILE_EMPTY) return;

    // Check for another bomb at target
    let hasOtherBomb = false;
    this.bombs.getChildren().forEach((child) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active && b !== bomb) {
        const br = Math.floor(b.y / TILE_SIZE);
        const bc = Math.floor(b.x / TILE_SIZE);
        if (br === targetR && bc === targetC) hasOtherBomb = true;
      }
    });
    if (hasOtherBomb) return;

    // Initiate sliding bomb
    bomb.setData('isSliding', true);
    bomb.setData('slideDir', { x: dirX, y: dirY });
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(false);
    bomb.setVelocity(dirX * BOMB_KICK_SPEED, dirY * BOMB_KICK_SPEED);
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string) {
    const floating = this.add.text(x, y, text, {
      fontSize: '12px',
      fontStyle: 'bold',
      fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    floating.setOrigin(0.5, 0.5);
    floating.setDepth(20);

    this.tweens.add({
      targets: floating,
      y: y - 22,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => floating.destroy(),
    });
  }

  private spawnPickupParticles(x: number, y: number, colorStr: string) {
    const colorNum = parseInt(colorStr.replace('#', '0x'), 16) || 0xffffff;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spark = this.add.circle(x, y, 3, colorNum, 1);
      spark.setDepth(15);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 18,
        y: y + Math.sin(angle) * 18,
        alpha: 0,
        scale: 0.3,
        duration: 280,
        onComplete: () => spark.destroy(),
      });
    }
  }

  private generateItemTextures() {
    const itemDefs = [
      { key: 'item_speed', bgColor: 0x06b6d4, ringColor: 0x22d3ee },
      { key: 'item_bomb', bgColor: 0x334155, ringColor: 0x94a3b8 },
      { key: 'item_fire', bgColor: 0xe11d48, ringColor: 0xfb7185 },
      { key: 'item_kick', bgColor: 0x16a34a, ringColor: 0x4ade80 },
      { key: 'item_shield', bgColor: 0xd97706, ringColor: 0xfbbf24 },
    ];

    itemDefs.forEach(({ key, bgColor, ringColor }) => {
      if (this.textures.exists(key)) return;
      try {
        const canvas = this.textures.createCanvas(key, 32, 32);
        if (canvas) {
          const ctx = canvas.getContext();
          ctx.fillStyle = '#' + bgColor.toString(16).padStart(6, '0');
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(2, 2, 28, 28, 6);
          } else {
            ctx.rect(2, 2, 28, 28);
          }
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#' + ringColor.toString(16).padStart(6, '0');
          ctx.stroke();
          canvas.refresh();
          return;
        }
      } catch {
        // Fallback below
      }

      try {
        const g = this.add.graphics();
        g.fillStyle(bgColor, 1);
        g.fillRoundedRect(2, 2, 28, 28, 6);
        g.lineStyle(2, ringColor, 1);
        g.strokeRoundedRect(2, 2, 28, 28, 6);
        g.generateTexture(key, 32, 32);
        g.destroy();
      } catch {
        // No-op
      }
    });
  }
}
