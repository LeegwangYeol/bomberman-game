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
  FlatHazardMask,
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
  rollItemDrop,
  applyItemEffect,
  isItemProtectedFromExplosion,
  ITEM_DEFINITIONS,
  ActiveBuff,
  createInitialPlayerStats,
  ITEM_GRACE_PERIOD_MS,
} from './gameplay_mechanics';

export const TILE_SIZE = PATH_TILE_SIZE;
export const ROWS = PATH_ROWS;
export const COLS = PATH_COLS;
export const TILE_EMPTY = PATH_TILE_EMPTY;
export const TILE_WALL = PATH_TILE_WALL;
export const TILE_BLOCK = PATH_TILE_BLOCK;

export { findPathBFS, getBlastTiles, findEscapePathBFS };
export type { GridCoord };
export type { PlayerStats, ItemType, ConveyorConfig, ItemDefinition, ActiveBuff } from './gameplay_mechanics';
export {
  determineItemDrop,
  rollItemDrop,
  applyItemUpgrade,
  applyItemEffect,
  calculateSpeedLevel,
  createInitialPlayerStats,
  isItemProtectedFromExplosion,
  ITEM_DEFINITIONS,
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

import {
  BaseEntity,
  createEnemy,
  createNeutral,
  createAlly,
  EnemyType,
  NeutralType,
  AllyType,
  ChaserEnemy,
  BomberEnemy,
  TankEnemy,
  GhostEnemy,
  SplitterEnemy,
  MiniSplitterEnemy,
  MerchantNPC,
  CritterNPC,
  MiniBomberAlly,
  PetDroneAlly,
  ShieldGuardAlly,
} from './entities';

export * from './entities';

import {
  ULTIMATE_SKILLS,
  CHARGE_VALUES,
  UltimateSkillId,
  UltimateSkillDefinition,
  CameraTraumaSimulator,
  webAudioSynth,
  renderMeteorReticle,
  renderMeteorStreak,
  renderSuperNovaWave,
  renderChronoStasisVFX,
  renderScorchDecal,
  createAegisDomeVisual,
} from './ultimate_skills';

export * from './ultimate_skills';

import {
  BaseBoss,
  BossState,
  type BossId,
  GummyBearBoss,
  HamsterBoss,
  QueenBeeBoss,
  TelegraphEngine,
  BossHUD,
} from './bosses/index.ts';

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
    player: Phaser.Physics.Arcade.Sprite | null,
    map: number[][],
    bombTiles: Set<string>
  ) {
    if (!this.active || !player || !player.active) {
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
  public neutrals!: Phaser.Physics.Arcade.Group;
  public allies!: Phaser.Physics.Arcade.Group;
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
  public shieldCharges: number = 0;
  public maxShields: number = 1;
  public extraLives: number = 0;
  public hasWallPass: boolean = false;
  public hasBombPass: boolean = false;
  public hasMagnet: boolean = false;
  public hasBlastDeflector: boolean = false;
  public hasBlastResist: boolean = false;
  public hasVampiric: boolean = false;
  public activeBombType: ItemType | 'REGULAR' = 'REGULAR';
  public isDashing: boolean = false;
  public dashCooldownRemaining: number = 0;
  public isInvulnerable: boolean = false;
  public shieldInvulnerableUntil: number = 0;
  public portalCooldown: number = 0;
  public score: number = 0;
  public isTimeFrozen: boolean = false;
  public isCloaked: boolean = false;
  public activeBuffs: ActiveBuff[] = [];
  public inventory: Record<ItemType, number> = { ...createInitialPlayerStats().inventory };
  public itemsCollectedTotal: number = 0;
  public ultimateGauge: number = 0;
  public ultimateMax: number = 100;
  public isUltimateReady: boolean = false;
  public ultimateLockoutRemaining: number = 0;
  public activeUltimate: UltimateSkillId = 'METEOR_STRIKE';
  public cameraTrauma: CameraTraumaSimulator = new CameraTraumaSimulator();
  public persistentHazardMask: FlatHazardMask = new FlatHazardMask();
  public lastSurvivalTickMs: number = 0;
  public isAegisOverdriveActive: boolean = false;
  public aegisDurationMs: number = 0;
  private aegisDomeVisual: { update: (remainingMs: number) => void; destroy: () => void } | null = null;
  private rKey?: Phaser.Input.Keyboard.Key;
  private qKey?: Phaser.Input.Keyboard.Key;
  private num1Key?: Phaser.Input.Keyboard.Key;
  private num2Key?: Phaser.Input.Keyboard.Key;
  private num3Key?: Phaser.Input.Keyboard.Key;
  private num4Key?: Phaser.Input.Keyboard.Key;
  private num5Key?: Phaser.Input.Keyboard.Key;
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

  // Boss Subsystem Integration
  public activeBoss: BaseBoss | null = null;
  public telegraphEngine: TelegraphEngine | null = null;
  public telegraphGraphics: Phaser.GameObjects.Graphics | null = null;
  public bossGraphics: Phaser.GameObjects.Graphics | null = null;
  public bossHUD: BossHUD | null = null;
  public currentBossIndex: number = 0;

  // Progression & Physics Resilience (PHYS-05, PHYS-06, PHYS-07, UI-01, UI-06)
  public cornerSlideTolerance: number = 8;
  public baseSpeedBonus: number = 0;
  public destroyedBlocksThisTick: Set<string> = new Set();
  public bossHitBombIds: Set<string> = new Set();
  private statsTimerAccumulator: number = 0;

  private onModeChanged = (mode: string) => {
    if (mode === 'boss_rush' || mode === 'BOSS_RUSH') {
      this.startBossEncounter('king_gummy_bear');
    } else if (this.activeBoss) {
      this.dismissBoss();
    }
  };

  private onPerksUpdated = (perksPayload: Record<string, number> | { perks?: Record<string, number> }) => {
    let perks: Record<string, number> | undefined;
    if (perksPayload && typeof perksPayload === 'object') {
      if ('perks' in perksPayload && perksPayload.perks && typeof perksPayload.perks === 'object') {
        perks = perksPayload.perks;
      } else {
        perks = perksPayload as Record<string, number>;
      }
    }
    if (perks) {
      const cornerLvl = typeof perks['corner_magnet'] === 'number' ? perks['corner_magnet'] : 0;
      this.cornerSlideTolerance = cornerLvl === 1 ? 11 : cornerLvl >= 2 ? 14 : 8;
      const bouncy = typeof perks['bouncy_soles'] === 'number' ? perks['bouncy_soles'] : 0;
      if (bouncy > 0) {
        this.baseSpeedBonus = Math.min(3, bouncy) * 10;
      }
      const sugar = typeof perks['sugar_coating'] === 'number' ? perks['sugar_coating'] : 0;
      if (sugar > 0) {
        this.shieldCharges = Math.max(this.shieldCharges, Math.min(2, sugar));
        this.hasShield = this.shieldCharges > 0;
      }
      this.emitStatsUpdate();
    }
  };

  private onRelicsUpdated = (_relics: unknown) => {
    void _relics;
    this.emitStatsUpdate();
  };

  private onResumeRunState = (_savedRun: unknown) => {
    void _savedRun;
    this.emitStatsUpdate();
  };

  public shutdown(): void {
    if (this.game && this.game.events) {
      this.game.events.off('mode-changed', this.onModeChanged);
      this.game.events.off('perks-updated', this.onPerksUpdated);
      this.game.events.off('relics-updated', this.onRelicsUpdated);
      this.game.events.off('resume-run-state', this.onResumeRunState);
    }
    this.dismissBoss();
  }

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
    this.shieldCharges = 0;
    this.maxShields = 1;
    this.extraLives = 0;
    this.hasWallPass = false;
    this.hasBombPass = false;
    this.hasMagnet = false;
    this.hasBlastDeflector = false;
    this.hasBlastResist = false;
    this.hasVampiric = false;
    this.activeBombType = 'REGULAR';
    this.isDashing = false;
    this.dashCooldownRemaining = 0;
    this.isInvulnerable = false;
    this.shieldInvulnerableUntil = 0;
    this.portalCooldown = 0;
    this.score = 0;
    this.isTimeFrozen = false;
    this.isCloaked = false;
    this.activeBuffs = [];
    this.inventory = { ...createInitialPlayerStats().inventory };
    this.itemsCollectedTotal = 0;
    this.ultimateGauge = 0;
    this.ultimateMax = 100;
    this.isUltimateReady = false;
    this.ultimateLockoutRemaining = 0;
    this.activeUltimate = 'METEOR_STRIKE';
    this.cameraTrauma = new CameraTraumaSimulator();
    this.lastSurvivalTickMs = 0;
    this.isAegisOverdriveActive = false;
    this.aegisDurationMs = 0;
    this.cornerSlideTolerance = 8;
    this.baseSpeedBonus = 0;
    this.destroyedBlocksThisTick.clear();
    this.bossHitBombIds.clear();
    this.statsTimerAccumulator = 0;
    if (this.aegisDomeVisual) {
      this.aegisDomeVisual.destroy();
      this.aegisDomeVisual = null;
    }
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
    this.neutrals = this.physics.add.group();
    this.allies = this.physics.add.group();
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

    // Spawn diverse entities: 5 enemy archetypes, neutral NPCs, and AI allies
    this.spawnEnemies(5);
    this.spawnNeutrals(2);
    this.spawnAllies(1);

    // Collisions
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.blocks, undefined, () => !this.hasWallPass);
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
      if (this.hasBombPass) {
        if (this.hasKick) {
          this.tryKickBomb(p, b);
        }
        return false;
      }
      return true;
    });

    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.enemies, this.blocks, undefined, (enemyObj) => {
      // Ghost phases through soft blocks!
      if (enemyObj instanceof GhostEnemy) return false;
      // Tank bulldozes soft blocks!
      if (enemyObj instanceof TankEnemy) return false;
      return true;
    });
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

    // Neutral NPC collisions
    this.physics.add.collider(this.neutrals, this.walls);
    this.physics.add.collider(this.neutrals, this.blocks);
    this.physics.add.collider(this.neutrals, this.bombs, undefined, (neutralObj, bombObj) => {
      const n = neutralObj as Phaser.Physics.Arcade.Sprite;
      const b = bombObj as Phaser.Physics.Arcade.Sprite;
      const nr = Math.floor(n.y / TILE_SIZE);
      const nc = Math.floor(n.x / TILE_SIZE);
      const br = Math.floor(b.y / TILE_SIZE);
      const bc = Math.floor(b.x / TILE_SIZE);
      if (nr === br && nc === bc) return false;
      return true;
    });

    // Ally collisions
    this.physics.add.collider(this.allies, this.walls, undefined, (allyObj) => {
      // Pet Drone flies over walls
      if (allyObj instanceof PetDroneAlly) return false;
      return true;
    });
    this.physics.add.collider(this.allies, this.blocks, undefined, (allyObj) => {
      // Pet Drone flies over blocks
      if (allyObj instanceof PetDroneAlly) return false;
      return true;
    });
    this.physics.add.collider(this.allies, this.bombs, undefined, (allyObj, bombObj) => {
      if (allyObj instanceof PetDroneAlly) return false;
      const a = allyObj as Phaser.Physics.Arcade.Sprite;
      const b = bombObj as Phaser.Physics.Arcade.Sprite;
      const ar = Math.floor(a.y / TILE_SIZE);
      const ac = Math.floor(a.x / TILE_SIZE);
      const br = Math.floor(b.y / TILE_SIZE);
      const bc = Math.floor(b.x / TILE_SIZE);
      if (ar === br && ac === bc) return false;
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
      const enemy = enemyObj as (Enemy | BaseEntity);
      if (bomb.active && bomb.getData('isSliding') && enemy.active) {
        const bCol = Math.floor(bomb.x / TILE_SIZE);
        const bRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, bRow, bCol);
      }
    });

    // Player hits enemy -> damage or Aegis Overdrive reflection
    this.physics.add.overlap(this.player, this.enemies, (_playerObj, enemyObj) => {
      if (this.isAegisOverdriveActive) {
        webAudioSynth.playAegisReflect();
        this.cameraTrauma.addTrauma(0.25);
        const enemy = enemyObj as (Enemy | BaseEntity);
        if (enemy && enemy.active) {
          if ('takeDamage' in enemy && typeof (enemy as BaseEntity).takeDamage === 'function') {
            (enemy as BaseEntity).takeDamage(ULTIMATE_SKILLS.AEGIS_OVERDRIVE.reflectDamage ?? 100, 'player', this.time.now);
          } else {
            enemy.destroy();
            this.addUltimateCharge(CHARGE_VALUES.ENEMY_DEFEATED);
          }
        }
        return;
      }
      this.playerDie();
    });

    // Player touches neutral NPC -> harmless interaction
    this.physics.add.overlap(this.player, this.neutrals, (_playerObj, neutralObj) => {
      const neutral = neutralObj as BaseEntity;
      if (neutral instanceof CritterNPC) {
        neutral.overheadUI.setIntent('💖', true);
      }
    });

    // Ally hits enemy -> ally takes damage
    this.physics.add.overlap(this.allies, this.enemies, (allyObj) => {
      const ally = allyObj as BaseEntity;
      if (ally && ally.active) {
        ally.takeDamage(1, 'enemy', this.time.now);
      }
    });

    // Global explosion overlaps:
    // 1. Explosion vs Player
    this.physics.add.overlap(this.player, this.explosions, (_playerObj, expObj) => {
      const exp = expObj as Phaser.Physics.Arcade.Sprite;
      const owner = (exp?.getData('owner') as string) || 'player';

      // Aegis Overdrive thermal absorption
      if (this.isAegisOverdriveActive) {
        const maxDur = ULTIMATE_SKILLS.AEGIS_OVERDRIVE.maxDurationMs ?? 8000;
        const bonus = ULTIMATE_SKILLS.AEGIS_OVERDRIVE.absorbDurationBonusMs ?? 300;
        this.aegisDurationMs = Math.min(maxDur, this.aegisDurationMs + bonus);
        webAudioSynth.playAegisReflect();
        return;
      }

      // Strict friendly fire immunity: Player & Ally explosions deal ZERO damage to player
      if (owner === 'player' || owner === 'ally') {
        return;
      }
      // Shield Guard absorption check
      let absorbed = false;
      this.allies.getChildren().forEach((child) => {
        if (child.active && child instanceof ShieldGuardAlly) {
          if (
            child.tryAbsorbExplosionForPlayer(
              { x: this.player.x, y: this.player.y },
              { x: exp.x, y: exp.y },
              owner
            )
          ) {
            absorbed = true;
          }
        }
      });
      if (absorbed) return;
      this.playerDie();
    });

    // 2. Explosion vs Enemy
    this.physics.add.overlap(this.enemies, this.explosions, (enemyObj, expObj) => {
      const target = enemyObj as (BaseEntity | Enemy);
      const exp = expObj as Phaser.Physics.Arcade.Sprite;
      const owner = (exp?.getData('owner') as string) || 'player';
      if (target && target.active) {
        if ('takeDamage' in target && typeof (target as BaseEntity).takeDamage === 'function') {
          const died = (target as BaseEntity).takeDamage(1, owner, this.time.now);
          if (died && owner === 'player') {
            const targetEntity = target as unknown as { isTracker?: boolean; archetype?: string };
            const isTracker = Boolean(targetEntity.isTracker || targetEntity.archetype === 'TANK');
            this.addUltimateCharge(isTracker ? CHARGE_VALUES.TRACKER_DEFEATED : CHARGE_VALUES.ENEMY_DEFEATED);
          }
        } else {
          target.destroy();
          if (owner === 'player') {
            this.addUltimateCharge(CHARGE_VALUES.ENEMY_DEFEATED);
          }
        }
      }
    });

    // 3. Explosion vs Ally
    this.physics.add.overlap(this.allies, this.explosions, (allyObj, expObj) => {
      const ally = allyObj as BaseEntity;
      const exp = expObj as Phaser.Physics.Arcade.Sprite;
      const owner = (exp?.getData('owner') as string) || 'player';
      if (ally && ally.active && typeof ally.takeDamage === 'function') {
        ally.takeDamage(1, owner, this.time.now);
      }
    });

    // 4. Explosion vs Neutral
    this.physics.add.overlap(this.neutrals, this.explosions, (neutralObj, expObj) => {
      const neutral = neutralObj as BaseEntity;
      const exp = expObj as Phaser.Physics.Arcade.Sprite;
      const owner = (exp?.getData('owner') as string) || 'player';
      if (neutral && neutral.active && typeof neutral.takeDamage === 'function') {
        neutral.takeDamage(1, owner, this.time.now);
      }
    });

    // Keyboard Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.qKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
      this.num1Key = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
      this.num2Key = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
      this.num3Key = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
      this.num4Key = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
      this.num5Key = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
    }

    // Emit initial stats payload to React HUD
    this.emitStatsUpdate();
  }

  spawnEnemies(count: number) {
    let spawned = 0;
    const spawnedTiles = new Set<string>();
    const archetypes: EnemyType[] = ['CHASER', 'BOMBER', 'TANK', 'GHOST', 'SPLITTER'];

    while (spawned < count) {
      const r = Phaser.Math.Between(5, ROWS - 2);
      const c = Phaser.Math.Between(5, COLS - 2);
      const key = `${r},${c}`;

      if (this.map[r][c] === TILE_EMPTY && !spawnedTiles.has(key)) {
        spawnedTiles.add(key);
        const archetype = archetypes[spawned % archetypes.length];
        const x = c * TILE_SIZE + TILE_SIZE / 2;
        const y = r * TILE_SIZE + TILE_SIZE / 2;

        const enemy = createEnemy(this, archetype, x, y);
        this.enemies.add(enemy);
        spawned++;
      }
    }
  }

  spawnNeutrals(count: number = 2) {
    let spawned = 0;
    const spawnedTiles = new Set<string>();
    const types: NeutralType[] = ['MERCHANT', 'CRITTER'];

    while (spawned < count) {
      const r = Phaser.Math.Between(3, ROWS - 3);
      const c = Phaser.Math.Between(3, COLS - 3);
      const key = `${r},${c}`;

      if (this.map[r][c] === TILE_EMPTY && !spawnedTiles.has(key)) {
        spawnedTiles.add(key);
        const type = types[spawned % types.length];
        const x = c * TILE_SIZE + TILE_SIZE / 2;
        const y = r * TILE_SIZE + TILE_SIZE / 2;

        const neutral = createNeutral(this, type, x, y);
        this.neutrals.add(neutral);
        spawned++;
      }
    }
  }

  spawnAllies(count: number = 1) {
    let spawned = 0;
    const spawnedTiles = new Set<string>();
    const types: AllyType[] = ['MINI_BOMBER', 'PET_DRONE', 'SHIELD_GUARD'];

    while (spawned < count) {
      const r = Phaser.Math.Clamp(1 + Phaser.Math.Between(0, 2), 1, ROWS - 2);
      const c = Phaser.Math.Clamp(1 + Phaser.Math.Between(0, 2), 1, COLS - 2);
      const key = `${r},${c}`;

      if (this.map[r][c] === TILE_EMPTY && !spawnedTiles.has(key)) {
        spawnedTiles.add(key);
        const type = types[spawned % types.length];
        const x = c * TILE_SIZE + TILE_SIZE / 2;
        const y = r * TILE_SIZE + TILE_SIZE / 2;

        const ally = createAlly(this, type, x, y);
        this.allies.add(ally);
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

    // Initialize Boss HUD & Telegraph Renderers
    this.bossHUD = new BossHUD(this.game);
    this.telegraphGraphics = this.add.graphics();
    this.telegraphGraphics.setDepth(5);
    this.bossGraphics = this.add.graphics();
    this.bossGraphics.setDepth(15);
    this.telegraphEngine = new TelegraphEngine(this.telegraphGraphics);

    // Wire Game Mode Changes & Meta-Progression Events (UI-06, MEM-01)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.game.events.on('mode-changed', this.onModeChanged);
    this.game.events.on('perks-updated', this.onPerksUpdated);
    this.game.events.on('relics-updated', this.onRelicsUpdated);
    this.game.events.on('resume-run-state', this.onResumeRunState);
  }

  public startBossEncounter(bossId: string): void {
    this.dismissBoss();

    const startX = 300;
    const startY = 260;

    if (bossId === 'captain_nibbles' || bossId === 'boss_hamster_nibbles') {
      this.activeBoss = new HamsterBoss(startX, startY);
    } else if (bossId === 'queen_bee_cupcake' || bossId === 'boss_queen_bee') {
      this.activeBoss = new QueenBeeBoss(startX, startY);
    } else {
      this.activeBoss = new GummyBearBoss(startX, startY);
    }

    if (this.bossHUD) {
      this.bossHUD.initBoss(this.activeBoss.config.id as BossId, this.activeBoss.maxHp);
    }
  }

  public dismissBoss(): void {
    if (this.telegraphEngine) {
      this.telegraphEngine.reset();
    }
    if (this.telegraphGraphics) {
      this.telegraphGraphics.clear();
    }
    if (this.bossGraphics) {
      this.bossGraphics.clear();
    }
    if (this.bossHUD) {
      this.bossHUD.dismissBoss();
    }
    this.activeBoss = null;
  }

  update(_time: number, delta: number) {
    this.destroyedBlocksThisTick.clear();

    // Fail-safe reset for extra-life/shield invulnerability
    if (
      this.isInvulnerable &&
      !this.isDashing &&
      !this.isAegisOverdriveActive &&
      this.time.now >= this.shieldInvulnerableUntil
    ) {
      this.isInvulnerable = false;
      if (this.player && this.player.active) {
        this.player.alpha = 1;
      }
    }

    // UI-01: Periodic stats update during active cooldowns and buffs
    this.statsTimerAccumulator = (this.statsTimerAccumulator || 0) + delta;
    if (this.statsTimerAccumulator >= 100) {
      this.statsTimerAccumulator = 0;
      if (
        this.dashCooldownRemaining > 0 ||
        this.ultimateLockoutRemaining > 0 ||
        (this.activeBuffs && this.activeBuffs.length > 0)
      ) {
        this.emitStatsUpdate();
      }
    }

    // 0a. Survival Drip: +1 charge point every 3000ms
    if (_time - this.lastSurvivalTickMs >= 3000) {
      this.addUltimateCharge(CHARGE_VALUES.SURVIVAL_TICK);
      this.lastSurvivalTickMs = _time;
    }

    // 0b. Lockout timer decay
    if (this.ultimateLockoutRemaining > 0) {
      const prev = this.ultimateLockoutRemaining;
      this.ultimateLockoutRemaining = Math.max(0, this.ultimateLockoutRemaining - delta);
      if (prev > 0 && this.ultimateLockoutRemaining <= 0) {
        this.isUltimateReady = this.ultimateGauge >= this.ultimateMax;
        this.emitStatsUpdate();
      }
    }

    // 0c. Update camera trauma shake model
    this.cameraTrauma.update(delta / 1000);
    const shake = this.cameraTrauma.getOffsets(_time);
    this.cameras.main.setScroll(shake.x, shake.y);
    this.cameras.main.setRotation(shake.angle * (Math.PI / 180));

    // 0d. Aegis Overdrive visual update & duration decay
    if (this.isAegisOverdriveActive) {
      this.aegisDurationMs = Math.max(0, this.aegisDurationMs - delta);
      if (this.aegisDomeVisual) {
        this.aegisDomeVisual.update(this.aegisDurationMs);
      }
      if (this.aegisDurationMs <= 0) {
        this.isAegisOverdriveActive = false;
        this.isInvulnerable = false;
        this.playerSpeed = Math.max(BASE_PLAYER_SPEED, this.playerSpeed - (ULTIMATE_SKILLS.AEGIS_OVERDRIVE.speedBonus ?? 40));
        if (this.aegisDomeVisual) {
          this.aegisDomeVisual.destroy();
          this.aegisDomeVisual = null;
        }
      }
    }

    if (this.isGameOver || !this.player || !this.cursors) return;

    // 1. Dash cooldown & portal cooldown decrements (SPEED_SURGE halves dash cooldown)
    const cdMult = this.activeBuffs?.some((b) => b.id === 'SPEED_SURGE') ? 2 : 1;
    if (this.dashCooldownRemaining > 0) {
      const prevCd = this.dashCooldownRemaining;
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - delta * cdMult);
      if (prevCd > 0 && this.dashCooldownRemaining === 0) {
        this.emitStatsUpdate();
      }
    }

    if (this.portalCooldown > 0) {
      this.portalCooldown = Math.max(0, this.portalCooldown - delta);
    }

    // 1b. Active buffs countdown
    if (this.activeBuffs && this.activeBuffs.length > 0) {
      let buffChanged = false;
      this.activeBuffs.forEach((b) => {
        b.remainingMs = Math.max(0, b.remainingMs - delta);
        if (b.remainingMs <= 0) buffChanged = true;
      });
      if (buffChanged) {
        this.activeBuffs = this.activeBuffs.filter((b) => b.remainingMs > 0);
        this.isTimeFrozen = this.activeBuffs.some((b) => b.id === 'TIME_FREEZE');
        this.isCloaked = this.activeBuffs.some((b) => b.id === 'CLOAK');
        if (this.player && this.player.active) {
          this.player.setAlpha(this.isCloaked ? 0.35 : 1.0);
        }
        this.emitStatsUpdate();
      }
    }

    // 1c. Item magnet attraction aura (3 tiles = 120px)
    if (this.hasMagnet && this.player && this.player.active) {
      const pullDist = 120;
      const pullSpeed = 160 * (delta / 1000);
      this.items.getChildren().forEach((child) => {
        const it = child as Phaser.Physics.Arcade.Sprite;
        if (it.active) {
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
          if (d <= pullDist && d > 6) {
            const angle = Phaser.Math.Angle.Between(it.x, it.y, this.player.x, this.player.y);
            it.x += Math.cos(angle) * pullSpeed;
            it.y += Math.sin(angle) * pullSpeed;
          }
        }
      });
    }

    // 2. Dash skill trigger check
    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false, dash: false, ultimate: false };
    const dashPressed = Boolean(this.shiftKey?.isDown || this.eKey?.isDown || mInput.dash);
    if (mInput.dash) mInput.dash = false; // consume mobile dash

    if (dashPressed && !this.isDashing && this.dashCooldownRemaining <= 0 && !this.isGameOver) {
      this.performDash();
    }

    // 2b. Ultimate Skill selection via 1-5 keys
    if (this.num1Key && Phaser.Input.Keyboard.JustDown(this.num1Key)) { this.activeUltimate = 'METEOR_STRIKE'; this.emitStatsUpdate(); }
    if (this.num2Key && Phaser.Input.Keyboard.JustDown(this.num2Key)) { this.activeUltimate = 'SUPER_NOVA'; this.emitStatsUpdate(); }
    if (this.num3Key && Phaser.Input.Keyboard.JustDown(this.num3Key)) { this.activeUltimate = 'CHRONO_FREEZE'; this.emitStatsUpdate(); }
    if (this.num4Key && Phaser.Input.Keyboard.JustDown(this.num4Key)) { this.activeUltimate = 'NUCLEAR_BARRAGE'; this.emitStatsUpdate(); }
    if (this.num5Key && Phaser.Input.Keyboard.JustDown(this.num5Key)) { this.activeUltimate = 'AEGIS_OVERDRIVE'; this.emitStatsUpdate(); }

    // 2c. Ultimate Skill trigger (Hotkeys 'R', 'Q', or mobileInput.ultimate)
    const ultPressed = Boolean(
      (this.rKey && Phaser.Input.Keyboard.JustDown(this.rKey)) ||
      (this.qKey && Phaser.Input.Keyboard.JustDown(this.qKey)) ||
      mInput.ultimate
    );
    if (mInput.ultimate) mInput.ultimate = false; // consume mobile ultimate

    if (ultPressed && !this.isGameOver) {
      this.triggerUltimate(this.activeUltimate);
    }

    // 3. Movement
    this.updatePlayerMovement();

    // 4. Bomb placement
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || mInput.bomb) {
      if (mInput.bomb) mInput.bomb = false; // consume mobile input
      this.placeBomb();
    }

    // 5. Conveyor belt push drift for player (PHYS-03: AABB bounds check)
    const pCol = Math.floor(this.player.x / TILE_SIZE);
    const pRow = Math.floor(this.player.y / TILE_SIZE);
    const belt = this.conveyors.find((c) => c.row === pRow && c.col === pCol);
    if (belt && !this.isDashing) {
      const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
      const nextX = this.player.x + belt.dirX * drift;
      const nextY = this.player.y + belt.dirY * drift;

      // Leading edge of 24x24 hitbox (radius 12)
      const leadX = nextX + belt.dirX * 12;
      const leadY = nextY + belt.dirY * 12;
      const leadCol = Math.floor(leadX / TILE_SIZE);
      const leadRow = Math.floor(leadY / TILE_SIZE);

      const perpX = belt.dirY !== 0 ? 11 : 0;
      const perpY = belt.dirX !== 0 ? 11 : 0;
      const canMove =
        leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
        this.map[leadRow]?.[leadCol] === TILE_EMPTY &&
        this.map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
        this.map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

      if (canMove) {
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

        // Check collision with active boss
        if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
          const bossDist = Phaser.Math.Distance.Between(bomb.x, bomb.y, this.activeBoss.x, this.activeBoss.y);
          if (bossDist < (this.activeBoss.config.colliderRadius || 35) + 16) {
            this.explodeBomb(bomb, bRow, bCol);
            return;
          }
        }

        if (blocked) {
          bomb.setVelocity(0, 0);
          bomb.setData('isSliding', false);
          (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
          bomb.setPosition(bCol * TILE_SIZE + TILE_SIZE / 2, bRow * TILE_SIZE + TILE_SIZE / 2);
        }
      } else {
        // Not sliding: check conveyor drift (PHYS-03: AABB bounds check)
        const bBelt = this.conveyors.find((c) => c.row === bRow && c.col === bCol);
        if (bBelt) {
          const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
          const nextX = bomb.x + bBelt.dirX * drift;
          const nextY = bomb.y + bBelt.dirY * drift;

          // Leading edge of 32x32 bomb hitbox (radius 16)
          const leadX = nextX + bBelt.dirX * 16;
          const leadY = nextY + bBelt.dirY * 16;
          const leadCol = Math.floor(leadX / TILE_SIZE);
          const leadRow = Math.floor(leadY / TILE_SIZE);

          const perpX = bBelt.dirY !== 0 ? 15 : 0;
          const perpY = bBelt.dirX !== 0 ? 15 : 0;
          const canMove =
            leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
            this.map[leadRow]?.[leadCol] === TILE_EMPTY &&
            this.map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
            this.map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

          if (canMove) {
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

    // 9. Collect active bomb tiles for AI path avoidance (Zero-GC persistent FlatHazardMask)
    this.persistentHazardMask.clear();
    const bombTiles = this.persistentHazardMask as unknown as Set<string>;
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active) {
        const col = Math.floor(b.x / TILE_SIZE);
        const row = Math.floor(b.y / TILE_SIZE);
        this.persistentHazardMask.setCoord(row, col, 1);
      }
    });

    // 10. Update enemies, neutrals, and allies with advanced AI
    if (!this.isTimeFrozen) {
      this.enemies.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
        if (child && child.active) {
          if (child instanceof ChaserEnemy) {
            child.updateAI(delta, _time, this.isCloaked ? null : this.player, this.map, bombTiles);
          } else if (child instanceof BomberEnemy) {
            child.updateAI(
              delta,
              _time,
              this.isCloaked ? null : this.player,
              this.map,
              bombTiles,
              (r, c, fuseMs) => {
                return this.placeEnemyBomb(child, r, c, child.bombPower, fuseMs);
              }
            );
          } else if (child instanceof TankEnemy) {
            child.updateAI(
              delta,
              _time,
              this.isCloaked ? null : this.player,
              this.map,
              bombTiles,
              (r, c) => this.destroyBlock(r, c),
              (slowPct, durationMs) => this.applyStompSlow(slowPct, durationMs)
            );
          } else if (child instanceof GhostEnemy) {
            child.updateAI(delta, _time, this.isCloaked ? null : this.player, this.map, bombTiles);
          } else if (child instanceof SplitterEnemy || child instanceof MiniSplitterEnemy) {
            child.updateAI(delta, _time, this.isCloaked ? null : this.player, this.map, bombTiles);
          } else if (
            'updateAI' in child &&
            typeof (child as unknown as { updateAI: (time: number, delta: number, p: Phaser.Physics.Arcade.Sprite | null, m: number[][], b: Set<string>) => void }).updateAI === 'function'
          ) {
            (child as unknown as { updateAI: (time: number, delta: number, p: Phaser.Physics.Arcade.Sprite | null, m: number[][], b: Set<string>) => void }).updateAI(
              _time,
              delta,
              this.isCloaked ? null : this.player,
              this.map,
              bombTiles
            );
          } else if (child instanceof BaseEntity) {
            child.updateEntity(delta, _time);
          }
        }
      });

      if (this.neutrals) {
        this.neutrals.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
          if (child && child.active) {
            if (child instanceof MerchantNPC) {
              child.updateAI(delta, _time, this.player, this.map, bombTiles);
            } else if (child instanceof CritterNPC) {
              child.updateAI(delta, _time, this.map);
            } else if (child instanceof BaseEntity) {
              child.updateEntity(delta, _time);
            }
          }
        });
      }

      if (this.allies) {
        const activeEnemies = this.enemies
          .getChildren()
          .filter((c) => c.active && c instanceof BaseEntity) as BaseEntity[];
        const activeItems = this.items.getChildren().filter((c) => c.active);

        this.allies.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
          if (child && child.active) {
            if (child instanceof MiniBomberAlly) {
              child.updateAI(delta, _time, this.player, this.map, bombTiles, (r, c, power) => {
                return this.placeAllyBomb(child, r, c, power);
              });
            } else if (child instanceof PetDroneAlly) {
              child.updateAI(delta, _time, this.player, activeItems, activeEnemies);
            } else if (child instanceof ShieldGuardAlly) {
              child.updateAI(delta, _time, this.player, this.playerFacing, activeEnemies);
            } else if (child instanceof BaseEntity) {
              child.updateEntity(delta, _time);
            }
          }
        });
      }
    } else {
      this.enemies.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
        const enemy = child as Phaser.Physics.Arcade.Sprite;
        if (enemy.active && enemy.body) {
          enemy.setVelocity(0, 0);
        }
      });
      if (this.neutrals) {
        this.neutrals.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
          const n = child as Phaser.Physics.Arcade.Sprite;
          if (n.active && n.body) {
            n.setVelocity(0, 0);
          }
        });
      }
    }

    // 11. Update Active Boss & Telegraphs
    if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
      this.activeBoss.update(delta, this.player.x, this.player.y);

      if (this.telegraphEngine) {
        this.telegraphEngine.update(delta);
        this.telegraphEngine.render(_time);
      }

      if (this.bossHUD) {
        this.bossHUD.update(delta);
        this.bossHUD.setHp(this.activeBoss.currentHp);
        this.bossHUD.setBossState(this.activeBoss.bossState);
        this.bossHUD.setEnrageGauge(this.activeBoss.enrageGauge);
      }

      // Render Procedural Boss Visuals
      if (this.bossGraphics) {
        this.bossGraphics.clear();
        const radius = this.activeBoss.config.colliderRadius || 35;

        // Outer glow / aura
        const themeColor =
          this.activeBoss.bossState === BossState.ENRAGED
            ? 0xff0044
            : this.activeBoss.bossState === BossState.STUNNED
              ? 0xf59e0b
              : 0x9333ea;

        this.bossGraphics.fillStyle(themeColor, 0.3);
        this.bossGraphics.fillCircle(this.activeBoss.x, this.activeBoss.y, radius + 8);

        // Core body
        this.bossGraphics.fillStyle(themeColor, 0.9);
        this.bossGraphics.fillCircle(this.activeBoss.x, this.activeBoss.y, radius);

        // Health ring / border
        this.bossGraphics.lineStyle(3, 0xffffff, 0.8);
        this.bossGraphics.strokeCircle(this.activeBoss.x, this.activeBoss.y, radius);

        // Stun Stars if stunned
        if (this.activeBoss.bossState === BossState.STUNNED) {
          this.bossGraphics.fillStyle(0xfff500, 1.0);
          for (let i = 0; i < 3; i++) {
            const starAngle = _time / 200 + (i * (Math.PI * 2)) / 3;
            const sx = this.activeBoss.x + Math.cos(starAngle) * (radius + 12);
            const sy = this.activeBoss.y - 10 + Math.sin(starAngle) * 8;
            this.bossGraphics.fillCircle(sx, sy, 4);
          }
        }
      }

      // Defeat check
      if (this.activeBoss.currentHp <= 0 || this.activeBoss.getState() === BossState.DEFEATED) {
        this.score += 5000;
        this.game.events.emit('currency-reward', { starCandies: 50, cosmicEssence: 25 });
        this.dismissBoss();
      }
    }
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

    const surgeBonus = this.activeBuffs?.some((b) => b.id === 'SPEED_SURGE') ? 75 : 0;
    const perkSpeedBonus = this.baseSpeedBonus || 0;
    const speed = (this.isDashing ? DASH_SPEED : this.playerSpeed + perkSpeedBonus) + surgeBonus;
    const slideSpeed = speed;
    const snapThreshold = 2;
    const tol = this.cornerSlideTolerance || 8;

    const px = this.player.x;
    const py = this.player.y;

    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);

    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;

    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    // Fast check for tile passability avoiding walls, blocks, and other active bombs (PHYS-07)
    const isPassable = (r: number, c: number): boolean => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      if (this.map[r][c] === TILE_WALL) return false;
      if (this.map[r][c] === TILE_BLOCK && !this.hasWallPass) return false;

      if (!this.hasBombPass) {
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
        if (hasBomb) return false;
      }
      return true;
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
        // Phase 2: Corner Rounding (PHYS-07: cornerSlideTolerance & zero dead zone)
        const canRoundUp = diffY <= 0 && Math.abs(diffY) <= tol && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
        const canRoundDown = diffY >= 0 && Math.abs(diffY) <= tol && isPassable(row + 1, col) && isPassable(row + 1, nextCol);

        if (canRoundUp && canRoundDown) {
          vy = diffY < 0 ? -slideSpeed : diffY > 0 ? slideSpeed : -slideSpeed;
        } else if (canRoundUp) {
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
        // Phase 2: Corner Rounding (PHYS-07: cornerSlideTolerance & zero dead zone)
        const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= tol && isPassable(row, col - 1) && isPassable(nextRow, col - 1);
        const canRoundRight = diffX >= 0 && Math.abs(diffX) <= tol && isPassable(row, col + 1) && isPassable(nextRow, col + 1);

        if (canRoundLeft && canRoundRight) {
          if (diffX < 0) {
            vx = -slideSpeed;
            this.player.setFlipX(true);
          } else if (diffX > 0) {
            vx = slideSpeed;
            this.player.setFlipX(false);
          } else {
            vx = -slideSpeed;
            this.player.setFlipX(true);
          }
        } else if (canRoundLeft) {
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
    const bombId = `bomb_p_${Date.now()}_${Math.random()}`;
    bomb.setData('id', bombId);
    const fuseTimer = this.time.delayedCall(2000, () => {
      if (bomb && bomb.active) {
        const curCol = Math.floor(bomb.x / TILE_SIZE);
        const curRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, curRow, curCol);
      }
    });
    bomb.setData('owner', 'player');
    bomb.setData('power', this.bombPower);
    bomb.setData('fuseTimer', fuseTimer);
    bomb.setData('tweenChain', tweenChain);
  }

  placeEnemyBomb(
    enemy: Enemy | BaseEntity | { activeBombs?: number; onBombExploded?: () => void },
    row: number,
    col: number,
    power: number,
    fuseMs: number = 2000
  ): boolean {
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

    const bombId = `bomb_e_${Date.now()}_${Math.random()}`;
    bomb.setData('id', bombId);
    bomb.setData('owner', 'enemy');
    bomb.setData('enemy', enemy);
    bomb.setData('power', power);

    // Distinct purple/amethyst pulse tint (0xd946ef)
    bomb.setTint(0xd946ef);

    // Multi-stage accelerating pulse tween chain with purple/amethyst theme
    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        {
          scaleX: 1.15,
          scaleY: 1.15,
          duration: Math.max(100, Math.floor(fuseMs * 0.25)),
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        {
          scaleX: 1.25,
          scaleY: 1.25,
          duration: Math.max(80, Math.floor(fuseMs * 0.15)),
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xc084fc);
          },
        },
        {
          scaleX: 1.35,
          scaleY: 1.35,
          duration: Math.max(50, Math.floor(fuseMs * 0.08)),
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xa855f7);
          },
        },
      ],
    });

    const fuseTimer = this.time.delayedCall(fuseMs, () => {
      if (bomb && bomb.active) {
        const curCol = Math.floor(bomb.x / TILE_SIZE);
        const curRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, curRow, curCol);
      }
    });
    bomb.setData('fuseTimer', fuseTimer);
    bomb.setData('tweenChain', tweenChain);

    return true;
  }

  placeAllyBomb(ally: MiniBomberAlly, row: number, col: number, power: number): boolean {
    if (this.isGameOver) return false;

    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

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

    const bombId = `bomb_a_${Date.now()}_${Math.random()}`;
    bomb.setData('id', bombId);
    bomb.setData('owner', 'ally');
    bomb.setData('ally', ally);
    bomb.setData('power', power);
    bomb.setTint(0x06b6d4); // Cyan tint for ally bombs

    const fuseTimer = this.time.delayedCall(2500, () => {
      if (ally && ally.active) {
        ally.activeBombs = Math.max(0, ally.activeBombs - 1);
      }
      if (bomb && bomb.active) {
        const curCol = Math.floor(bomb.x / TILE_SIZE);
        const curRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, curRow, curCol);
      }
    });
    bomb.setData('fuseTimer', fuseTimer);
    return true;
  }

  explodeBomb(bomb: Phaser.Physics.Arcade.Sprite, row?: number, col?: number) {
    if (!bomb.active) return;

    // Clean up timers & tweens
    const timer = bomb.getData('fuseTimer') as Phaser.Time.TimerEvent | undefined;
    if (timer) timer.remove(false);
    const chain = bomb.getData('tweenChain') as Phaser.Tweens.TweenChain | undefined;
    if (chain) chain.stop();

    const owner = (bomb.getData('owner') as string) || 'player';
    const bombPower = (bomb.getData('power') as number) || this.bombPower;
    const bombId = (bomb.getData('id') as string) || `bomb_${Date.now()}_${Math.random()}`;

    // Compute dynamic detonation coordinates from sprite position (PHYS-02)
    const curCol = Math.floor(bomb.x / TILE_SIZE);
    const curRow = Math.floor(bomb.y / TILE_SIZE);
    const actualRow = Number.isFinite(curRow) && curRow >= 0 && curRow < ROWS ? curRow : (row ?? 0);
    const actualCol = Number.isFinite(curCol) && curCol >= 0 && curCol < COLS ? curCol : (col ?? 0);

    bomb.destroy();

    // Isolated capacity management
    if (owner === 'player') {
      this.activeBombs = Math.max(0, this.activeBombs - 1);
      this.emitStatsUpdate();
    } else if (owner === 'enemy') {
      const enemy = bomb.getData('enemy') as (Enemy | BomberEnemy) | undefined;
      if (enemy && 'onBombExploded' in enemy && typeof enemy.onBombExploded === 'function') {
        enemy.onBombExploded();
      } else if (enemy && typeof (enemy as { activeBombs?: number }).activeBombs === 'number') {
        (enemy as { activeBombs: number }).activeBombs = Math.max(
          0,
          (enemy as { activeBombs: number }).activeBombs - 1
        );
      }
    } else if (owner === 'ally') {
      const ally = bomb.getData('ally') as MiniBomberAlly | undefined;
      if (ally && typeof ally.activeBombs === 'number') {
        ally.activeBombs = Math.max(0, ally.activeBombs - 1);
      }
    }

    // 1. Tactile Camera Shake
    this.cameras.main.shake(150, 0.008);

    // 2. High-Impact Screen Flash (warm golden-white flash)
    this.cameras.main.flash(80, 255, 230, 160, false);

    // 3. Dynamic Expanding Shockwave Ring
    const centerX = actualCol * TILE_SIZE + TILE_SIZE / 2;
    const centerY = actualRow * TILE_SIZE + TILE_SIZE / 2;
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

    // Spawn Epicenter Explosion (isCenter = true, passing bombId for PHYS-06)
    this.spawnExplosion(actualRow, actualCol, true, owner, bombId);

    const directions = [
      { dr: -1, dc: 0 }, // up
      { dr: 1, dc: 0 },  // down
      { dr: 0, dc: -1 }, // left
      { dr: 0, dc: 1 },  // right
    ];

    for (const dir of directions) {
      for (let i = 1; i <= bombPower; i++) {
        const nr = actualRow + dir.dr * i;
        const nc = actualCol + dir.dc * i;

        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;

        if (this.map[nr][nc] === TILE_WALL) {
          break; // Stop at unbreakable wall
        }

        // PHYS-05: Prevent simultaneous blast ray piercing through destroyed blocks
        const key = `${nr},${nc}`;
        const isBlock = this.map[nr][nc] === TILE_BLOCK || this.destroyedBlocksThisTick.has(key);

        if (isBlock) {
          this.destroyedBlocksThisTick.add(key);
          if (this.map[nr][nc] === TILE_BLOCK) {
            this.destroyBlock(nr, nc);
          }
          this.spawnExplosion(nr, nc, false, owner, bombId);
          break;
        }

        // Empty tile, spawn explosion
        this.spawnExplosion(nr, nc, false, owner, bombId);

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

  spawnExplosion(row: number, col: number, isCenter: boolean = false, owner: string = 'player', bombId?: string) {
    const x = col * TILE_SIZE + TILE_SIZE / 2;
    const y = row * TILE_SIZE + TILE_SIZE / 2;

    const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
    exp.setDepth(12);
    exp.setData('owner', owner);

    // PHYS-04: Inset hitbox by 2px on all sides (36x36 at offset 2,2) to eliminate diagonal corner leakage
    (exp.body as Phaser.Physics.Arcade.Body)?.setSize(36, 36).setOffset(2, 2);

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

    // Check hit on active boss (PHYS-06: exactly 1 hit per bombId)
    if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
      const dist = Phaser.Math.Distance.Between(x, y, this.activeBoss.x, this.activeBoss.y);
      if (dist < (this.activeBoss.config.colliderRadius || 35) + 20) {
        if (!bombId || !this.bossHitBombIds.has(bombId)) {
          if (bombId) {
            this.bossHitBombIds.add(bombId);
            this.time.delayedCall(1000, () => {
              this.bossHitBombIds.delete(bombId);
            });
          }
          const hit = this.activeBoss.takeBombDamage(1, 'bomb');
          if (hit && this.bossHUD) {
            this.bossHUD.setHp(this.activeBoss.currentHp);
            if (this.activeBoss.bossState === BossState.STUNNED) {
              this.bossHUD.triggerStun(this.activeBoss.stunTimerMs / 1000, 'Bomb Blast Combo!');
            }
          }
        }
      }
    }
  }

  spawnSpecificItem(type: ItemType, row: number, col: number) {
    this.spawnItem(row, col, type);
  }

  applyStompSlow(slowPct: number = 0.30, durationMs: number = 1500) {
    const originalSpeed = this.playerSpeed;
    this.playerSpeed = Math.max(70, this.playerSpeed * (1 - slowPct));
    this.time.delayedCall(durationMs, () => {
      this.playerSpeed = originalSpeed;
    });
  }

  destroyBlock(row: number, col: number) {
    this.map[row][col] = TILE_EMPTY;
    this.addUltimateCharge(CHARGE_VALUES.BLOCK_DESTROYED);
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    let isChest = false;
    this.blocks.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b && b.active && b.getData('row') === row && b.getData('col') === col) {
        if (b.getData('isChest')) {
          isChest = true;
        }
        // Spawn 4 crumbling debris fragments
        const offsets = [
          { dx: -6, dy: -6, vx: -25, vy: -25 },
          { dx: 6, dy: -6, vx: 25, vy: -25 },
          { dx: -6, dy: 6, vx: -25, vy: 25 },
          { dx: 6, dy: 6, vx: 25, vy: 25 },
        ];
        offsets.forEach((off) => {
          const frag = this.add.rectangle(centerX + off.dx, centerY + off.dy, 8, 8, isChest ? 0xfbbf24 : 0xb87333);
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

    // 45% drop chance with anti-snowballing (or 100% Rare/Epic guaranteed for gilded chests)
    const droppedItem = rollItemDrop(Math.random, this.getStats(), isChest ? 'CHEST' : 'BLOCK');
    if (droppedItem) {
      this.spawnItem(row, col, droppedItem);
    }
  }

  playerDie() {
    if (this.isGameOver) return;
    if (this.isInvulnerable) return;

    if (this.hasShield) {
      if (this.shieldCharges > 1) {
        this.shieldCharges--;
        this.hasShield = true;
      } else {
        this.shieldCharges = 0;
        this.hasShield = false;
      }
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

    if (this.extraLives > 0) {
      this.extraLives--;
      this.isInvulnerable = true;
      this.shieldInvulnerableUntil = this.time.now + 3000;
      this.spawnFloatingText(this.player.x, this.player.y - 12, '1-UP REVIVED!', '#fb7185');
      this.cameras.main.flash(300, 251, 113, 133);

      // 3.0s i-frame blink and safe vulnerability restoration (PHYS-01)
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 14,
        onComplete: () => {
          if (this.player && this.player.active) {
            this.player.alpha = 1;
            if (!this.isDashing && !this.isAegisOverdriveActive) {
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
      shieldCharges: this.shieldCharges,
      maxShields: this.maxShields,
      extraLives: this.extraLives,
      hasWallPass: this.hasWallPass,
      hasBombPass: this.hasBombPass,
      hasMagnet: this.hasMagnet,
      hasBlastDeflector: this.hasBlastDeflector,
      hasBlastResist: this.hasBlastResist,
      hasVampiric: this.hasVampiric,
      activeBombType: this.activeBombType,
      dashCooldownRemaining: Math.max(0, Math.ceil(this.dashCooldownRemaining)),
      activeBuffs: [...this.activeBuffs],
      inventory: { ...this.inventory },
      itemsCollectedTotal: this.itemsCollectedTotal,
      itemsCollected: { ...this.itemsCollected },
      ultimateGauge: this.ultimateGauge,
      ultimateMax: this.ultimateMax,
      isUltimateReady: this.isUltimateReady,
      ultimateLockoutRemaining: Math.max(0, Math.ceil(this.ultimateLockoutRemaining)),
      activeUltimate: this.activeUltimate,
      score: this.score,
      isGameOver: this.isGameOver,
    };
  }

  public emitStatsUpdate() {
    if (this.game && this.game.events) {
      this.game.events.emit('stats-update', this.getStats());
    }
  }

  public addUltimateCharge(points: number): number {
    if (this.isGameOver) return 0;
    if (this.ultimateLockoutRemaining > 0) return 0;

    const prev = this.ultimateGauge;
    this.ultimateGauge = Math.min(this.ultimateMax, Math.max(0, this.ultimateGauge + points));
    const delta = this.ultimateGauge - prev;

    const wasReady = this.isUltimateReady;
    this.isUltimateReady = this.ultimateGauge >= this.ultimateMax && this.ultimateLockoutRemaining <= 0;

    if (!wasReady && this.isUltimateReady) {
      webAudioSynth.playUltimateReadyChime();
    }

    if (delta > 0) {
      this.emitStatsUpdate();
    }
    return delta;
  }

  public setUltimateSkill(skillId: UltimateSkillId): void {
    if (ULTIMATE_SKILLS[skillId]) {
      this.activeUltimate = skillId;
      this.emitStatsUpdate();
    }
  }

  public triggerUltimate(skillId: UltimateSkillId = this.activeUltimate): boolean {
    if (this.isGameOver) return false;
    if (this.ultimateGauge < this.ultimateMax || this.ultimateLockoutRemaining > 0) {
      return false;
    }

    const skill = ULTIMATE_SKILLS[skillId];
    if (!skill) return false;

    // Consume gauge and initiate anti-snowball lockout
    this.ultimateGauge = 0;
    this.isUltimateReady = false;
    this.ultimateLockoutRemaining = skill.lockoutMs;
    this.emitStatsUpdate();

    switch (skillId) {
      case 'METEOR_STRIKE':
        this.executeMeteorStrike(skill);
        break;
      case 'SUPER_NOVA':
        this.executeSuperNova(skill);
        break;
      case 'CHRONO_FREEZE':
        this.executeChronoFreeze(skill);
        break;
      case 'NUCLEAR_BARRAGE':
        this.executeNuclearBarrage(skill);
        break;
      case 'AEGIS_OVERDRIVE':
        this.executeAegisOverdrive(skill);
        break;
    }

    return true;
  }

  private executeMeteorStrike(skill: UltimateSkillDefinition): void {
    webAudioSynth.playMeteorWhistleAndBoom();
    this.cameraTrauma.addTrauma(skill.traumaPerImpact ?? 0.35);

    const minCount = skill.meteorCountMin ?? 8;
    const maxCount = skill.meteorCountMax ?? 10;
    const count = Phaser.Math.Between(minCount, maxCount);
    const targets: { r: number; c: number }[] = [];
    const used = new Set<string>();

    // 1. Live enemies
    this.enemies.getChildren().forEach((child) => {
      const e = child as Phaser.Physics.Arcade.Sprite;
      if (e.active && targets.length < 5) {
        const er = Math.floor(e.y / TILE_SIZE);
        const ec = Math.floor(e.x / TILE_SIZE);
        const k = `${er},${ec}`;
        if (!used.has(k) && er > 0 && er < ROWS - 1 && ec > 0 && ec < COLS - 1) {
          used.add(k);
          targets.push({ r: er, c: ec });
        }
      }
    });

    // 2. Soft blocks
    for (let r = 1; r < ROWS - 1 && targets.length < count - 2; r++) {
      for (let c = 1; c < COLS - 1 && targets.length < count - 2; c++) {
        if (this.map[r][c] === TILE_BLOCK) {
          const k = `${r},${c}`;
          if (!used.has(k) && Math.random() < 0.4) {
            used.add(k);
            targets.push({ r, c });
          }
        }
      }
    }

    // 3. Fallback open arena tiles
    while (targets.length < count) {
      const r = Phaser.Math.Between(1, ROWS - 2);
      const c = Phaser.Math.Between(1, COLS - 2);
      const k = `${r},${c}`;
      if (!used.has(k) && this.map[r][c] !== TILE_WALL) {
        used.add(k);
        targets.push({ r, c });
      }
    }

    targets.forEach((target, idx) => {
      const targetX = target.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = target.r * TILE_SIZE + TILE_SIZE / 2;
      const delay = idx * 75;

      this.time.delayedCall(delay, () => {
        renderMeteorReticle(this, targetX, targetY, skill.warningMs ?? 600, () => {
          renderMeteorStreak(this, targetX, targetY, () => {
            webAudioSynth.playSubBassBoom(0.45, 65, 20);
            renderScorchDecal(this, targetX, targetY, skill.scorchDecalMs ?? 2000);
            this.cameraTrauma.addTrauma(skill.traumaPerImpact ?? 0.35);

            // 3x3 footprint blast
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const tr = target.r + dr;
                const tc = target.c + dc;
                if (tr > 0 && tr < ROWS - 1 && tc > 0 && tc < COLS - 1) {
                  if (this.map[tr][tc] === TILE_BLOCK) {
                    this.destroyBlock(tr, tc);
                  }

                  this.enemies.getChildren().forEach((child) => {
                    const e = child as Phaser.Physics.Arcade.Sprite;
                    if (e.active) {
                      const er = Math.floor(e.y / TILE_SIZE);
                      const ec = Math.floor(e.x / TILE_SIZE);
                      if (er === tr && ec === tc) {
                        const targetEntity = e as unknown as { takeDamage?: (damage: number, source: string, time: number) => boolean };
                        if (typeof targetEntity.takeDamage === 'function') {
                          targetEntity.takeDamage(100, 'player', this.time.now);
                        } else {
                          e.destroy();
                          this.addUltimateCharge(CHARGE_VALUES.ENEMY_DEFEATED);
                        }
                      }
                    }
                  });

                  this.bombs.getChildren().forEach((child) => {
                    const b = child as Phaser.Physics.Arcade.Sprite;
                    if (b.active) {
                      const br = Math.floor(b.y / TILE_SIZE);
                      const bc = Math.floor(b.x / TILE_SIZE);
                      if (br === tr && bc === tc) {
                        this.explodeBomb(b, br, bc);
                      }
                    }
                  });
                }
              }
            }
          });
        });
      });
    });
  }

  private executeSuperNova(skill: UltimateSkillDefinition): void {
    // 1. Implosion & Hit-stop
    this.physics.world.pause();
    this.player.setTint(0xffffff);
    this.player.setScale(0.75);
    webAudioSynth.playSuperNovaShockwave();

    this.time.delayedCall(skill.hitStopMs ?? 60, () => {
      this.physics.world.resume();
      this.player.clearTint();
      this.player.setScale(1.0);
    });

    // 2. Concentric wavefront detonation
    this.time.delayedCall(skill.implosionMs ?? 300, () => {
      this.cameras.main.flash(120, 255, 255, 240);
      this.cameraTrauma.addTrauma(skill.trauma ?? 1.0);
      renderSuperNovaWave(this, this.player.x, this.player.y, 240, 400);

      const pCol = Math.floor(this.player.x / TILE_SIZE);
      const pRow = Math.floor(this.player.y / TILE_SIZE);
      const maxRadius = skill.maxRadiusTiles ?? 5;
      const waveDelay = skill.tileWaveDelayMs ?? 40;

      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          const dist = Math.abs(r - pRow) + Math.abs(c - pCol);
          if (dist <= maxRadius) {
            const delay = dist * waveDelay;
            this.time.delayedCall(delay, () => {
              if (this.map[r][c] === TILE_BLOCK) {
                this.destroyBlock(r, c);
              }

              this.enemies.getChildren().forEach((child) => {
                const enemy = child as Phaser.Physics.Arcade.Sprite;
                if (enemy.active) {
                  const er = Math.floor(enemy.y / TILE_SIZE);
                  const ec = Math.floor(enemy.x / TILE_SIZE);
                  if (er === r && ec === c) {
                    const targetEntity = enemy as unknown as { takeDamage?: (damage: number, source: string, time: number) => boolean };
                    if (typeof targetEntity.takeDamage === 'function') {
                      targetEntity.takeDamage(100, 'player', this.time.now);
                    } else {
                      enemy.destroy();
                      this.addUltimateCharge(CHARGE_VALUES.ENEMY_DEFEATED);
                    }
                  }
                }
              });

              this.bombs.getChildren().forEach((child) => {
                const b = child as Phaser.Physics.Arcade.Sprite;
                if (b.active) {
                  const br = Math.floor(b.y / TILE_SIZE);
                  const bc = Math.floor(b.x / TILE_SIZE);
                  if (br === r && bc === c) {
                    this.explodeBomb(b, br, bc);
                  }
                }
              });
            });
          }
        }
      }
    });
  }

  private executeChronoFreeze(skill: UltimateSkillDefinition): void {
    webAudioSynth.playChronoFreeze();
    renderChronoStasisVFX(this, skill.durationMs ?? 5000);

    this.isTimeFrozen = true;
    const speedBoost = this.playerSpeed * ((skill.playerSpeedMultiplier ?? 1.20) - 1);
    this.playerSpeed += speedBoost;

    // Pause bomb fuse timers
    this.bombs.getChildren().forEach((child) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      const ft = b.getData('fuseTimer') as Phaser.Time.TimerEvent;
      if (ft) ft.paused = true;
      const tc = b.getData('tweenChain') as Phaser.Tweens.TweenChain;
      if (tc) tc.pause();
    });

    [2000, 3000, 4000, 4500].forEach((t) => {
      this.time.delayedCall(t, () => webAudioSynth.playChronoTick());
    });

    this.time.delayedCall(skill.durationMs ?? 5000, () => {
      this.isTimeFrozen = false;
      this.playerSpeed = Math.max(BASE_PLAYER_SPEED, this.playerSpeed - speedBoost);
      webAudioSynth.playChronoResume();
      this.cameraTrauma.addTrauma(skill.traumaOnResume ?? 0.60);

      this.bombs.getChildren().forEach((child) => {
        const b = child as Phaser.Physics.Arcade.Sprite;
        const ft = b.getData('fuseTimer') as Phaser.Time.TimerEvent;
        if (ft) ft.paused = false;
        const tc = b.getData('tweenChain') as Phaser.Tweens.TweenChain;
        if (tc) tc.resume();
      });
    });
  }

  private executeNuclearBarrage(skill: UltimateSkillDefinition): void {
    webAudioSynth.playNuclearLaunch();
    const pCol = Math.floor(this.player.x / TILE_SIZE);
    const pRow = Math.floor(this.player.y / TILE_SIZE);

    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    const maxDepth = skill.maxDepthPerArm ?? 4;
    const baseFuse = skill.fuseMs ?? 1200;
    const stepDelay = skill.cascadeStepDelayMs ?? 70;

    directions.forEach((dir) => {
      for (let k = 1; k <= maxDepth; k++) {
        const r = pRow + dir.dr * k;
        const c = pCol + dir.dc * k;
        if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1) break;
        if (this.map[r][c] === TILE_WALL) break;

        const targetX = c * TILE_SIZE + TILE_SIZE / 2;
        const targetY = r * TILE_SIZE + TILE_SIZE / 2;
        const fuseTime = baseFuse + k * stepDelay;

        const warhead = this.add.circle(targetX, targetY, 14, 0xd90429, 0.9);
        warhead.setDepth(6);
        this.tweens.add({
          targets: warhead,
          scale: 1.25,
          alpha: 0.6,
          yoyo: true,
          repeat: Math.floor(fuseTime / 200),
          duration: 100,
        });

        this.time.delayedCall(fuseTime, () => {
          if (warhead && warhead.active) warhead.destroy();
          webAudioSynth.playCarpetDetonation(k);
          this.cameraTrauma.addTrauma(skill.traumaPerStep ?? 0.15);

          if (this.map[r][c] === TILE_BLOCK) {
            this.destroyBlock(r, c);
          }

          this.enemies.getChildren().forEach((child) => {
            const enemy = child as Phaser.Physics.Arcade.Sprite;
            if (enemy.active) {
              const er = Math.floor(enemy.y / TILE_SIZE);
              const ec = Math.floor(enemy.x / TILE_SIZE);
              if (er === r && ec === c) {
                const targetEntity = enemy as unknown as { takeDamage?: (damage: number, source: string, time: number) => boolean };
                if (typeof targetEntity.takeDamage === 'function') {
                  targetEntity.takeDamage(100, 'player', this.time.now);
                } else {
                  enemy.destroy();
                  this.addUltimateCharge(CHARGE_VALUES.ENEMY_DEFEATED);
                }
              }
            }
          });

          const exp = this.explosions.create(targetX, targetY, 'explosion') as Phaser.Physics.Arcade.Sprite;
          exp.setDepth(10);
          exp.setData('owner', 'player');
          (exp.body as Phaser.Physics.Arcade.Body)?.setSize(36, 36).setOffset(2, 2);
          this.time.delayedCall(280, () => {
            if (exp.active) exp.destroy();
          });
        });

        if (this.map[r][c] === TILE_BLOCK) break;
      }
    });
  }

  private executeAegisOverdrive(skill: UltimateSkillDefinition): void {
    webAudioSynth.playAegisChime();
    this.isAegisOverdriveActive = true;
    this.isInvulnerable = true;
    this.aegisDurationMs = skill.durationMs ?? 6000;
    const speedBonus = skill.speedBonus ?? 40;
    this.playerSpeed += speedBonus;

    if (this.aegisDomeVisual) {
      this.aegisDomeVisual.destroy();
    }
    this.aegisDomeVisual = createAegisDomeVisual(this, this.player);
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

    const def = ITEM_DEFINITIONS[type];
    const textureKey = def ? def.iconKey : 'item_bomb';
    const item = this.items.create(centerX, centerY, textureKey) as Phaser.Physics.Arcade.Sprite;
    item.setDepth(4);
    (item.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(4, 4);
    item.setData('itemType', type);
    item.setData('spawnTime', this.time.now);
    item.setData('row', row);
    item.setData('col', col);

    // 600ms grace period golden glow ring
    const glow = this.add.circle(centerX, centerY, 18, 0xfbbf24, 0.45);
    glow.setDepth(3);
    this.tweens.add({
      targets: glow,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: ITEM_GRACE_PERIOD_MS,
      ease: 'Sine.easeOut',
      onComplete: () => glow.destroy(),
    });

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
    const result = applyItemEffect(type, currentStats, this);

    // Sync instance variables
    this.playerSpeed = currentStats.speed;
    this.speedLevel = currentStats.speedLevel;
    this.maxBombs = currentStats.maxBombs;
    this.bombPower = currentStats.bombPower;
    this.hasKick = currentStats.hasKick;
    this.hasShield = currentStats.hasShield;
    this.shieldCharges = currentStats.shieldCharges;
    this.maxShields = currentStats.maxShields;
    this.extraLives = currentStats.extraLives;
    this.hasWallPass = currentStats.hasWallPass;
    this.hasBombPass = currentStats.hasBombPass;
    this.hasMagnet = currentStats.hasMagnet;
    this.hasBlastDeflector = currentStats.hasBlastDeflector;
    this.hasBlastResist = currentStats.hasBlastResist;
    this.hasVampiric = currentStats.hasVampiric;
    this.activeBombType = currentStats.activeBombType;
    this.activeBuffs = currentStats.activeBuffs;
    this.inventory = currentStats.inventory;
    this.itemsCollectedTotal = currentStats.itemsCollectedTotal;
    this.itemsCollected = currentStats.itemsCollected;
    this.score = currentStats.score;

    this.spawnFloatingText(x, y - 8, result.label, result.color);
    this.spawnPickupParticles(x, y, result.color);

    if (this.game && this.game.events) {
      this.game.events.emit('item-collected', {
        item: ITEM_DEFINITIONS[type],
        x,
        y,
      });
    }

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
    const itemDefs: Array<{
      key: string;
      bgColor: number;
      ringColor: number;
      drawGlyph: (ctx: CanvasRenderingContext2D) => void;
    }> = [
      {
        key: 'item_speed',
        bgColor: 0x06b6d4,
        ringColor: 0x22d3ee,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(10, 22); ctx.lineTo(18, 12); ctx.lineTo(14, 12); ctx.lineTo(20, 8);
          ctx.lineTo(13, 16); ctx.lineTo(17, 16); ctx.closePath();
          ctx.fill();
        },
      },
      {
        key: 'item_bomb',
        bgColor: 0x334155,
        ringColor: 0x94a3b8,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(16, 18, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(16, 11); ctx.quadraticCurveTo(18, 8, 21, 9);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(21, 9, 2, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        key: 'item_fire',
        bgColor: 0xe11d48,
        ringColor: 0xfb7185,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(16, 8);
          ctx.quadraticCurveTo(22, 14, 20, 22);
          ctx.quadraticCurveTo(16, 25, 12, 22);
          ctx.quadraticCurveTo(10, 14, 16, 8);
          ctx.fill();
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(16, 13);
          ctx.quadraticCurveTo(19, 17, 18, 22);
          ctx.quadraticCurveTo(16, 24, 14, 22);
          ctx.quadraticCurveTo(13, 17, 16, 13);
          ctx.fill();
        },
      },
      {
        key: 'item_kick',
        bgColor: 0x16a34a,
        ringColor: 0x4ade80,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(10, 10); ctx.lineTo(15, 10); ctx.lineTo(15, 17); ctx.lineTo(22, 17);
          ctx.lineTo(23, 22); ctx.lineTo(10, 22); ctx.closePath();
          ctx.fill();
        },
      },
      {
        key: 'item_shield',
        bgColor: 0xd97706,
        ringColor: 0xfbbf24,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.moveTo(16, 8); ctx.lineTo(23, 12); ctx.lineTo(21, 20); ctx.lineTo(16, 24); ctx.lineTo(11, 20); ctx.lineTo(9, 12); ctx.closePath();
          ctx.fill();
        },
      },
      {
        key: 'item_piercing_bomb',
        bgColor: 0x1e293b,
        ringColor: 0x06b6d4,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.moveTo(16, 6); ctx.lineTo(18, 12); ctx.lineTo(14, 12); ctx.closePath();
          ctx.moveTo(16, 26); ctx.lineTo(18, 20); ctx.lineTo(14, 20); ctx.closePath();
          ctx.moveTo(6, 16); ctx.lineTo(12, 14); ctx.lineTo(12, 18); ctx.closePath();
          ctx.moveTo(26, 16); ctx.lineTo(20, 14); ctx.lineTo(20, 18); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(16, 16, 5, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        key: 'item_remote_bomb',
        bgColor: 0x881337,
        ringColor: 0xfbbf24,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(16, 19, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(16, 13); ctx.lineTo(16, 7);
          ctx.stroke();
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(16, 7, 2.5, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        key: 'item_cluster_bomb',
        bgColor: 0x3b0764,
        ringColor: 0xe879f9,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#facc15';
          [ [12, 13], [20, 13], [16, 21] ].forEach(([cx, cy]) => {
            ctx.beginPath();
            ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.strokeStyle = '#e879f9';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(12, 13); ctx.lineTo(20, 13); ctx.lineTo(16, 21); ctx.closePath();
          ctx.stroke();
        },
      },
      {
        key: 'item_landmine',
        bgColor: 0x334155,
        ringColor: 0xeab308,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.ellipse(16, 18, 9, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(16, 18, 3, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        key: 'item_ice_bomb',
        bgColor: 0x082f49,
        ringColor: 0x38bdf8,
        drawGlyph: (ctx) => {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(16, 8); ctx.lineTo(16, 24);
          ctx.moveTo(9, 12); ctx.lineTo(23, 20);
          ctx.moveTo(9, 20); ctx.lineTo(23, 12);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(16, 16, 2, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        key: 'item_ricochet_bomb',
        bgColor: 0x581c87,
        ringColor: 0x22c55e,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(16, 16, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(16, 16, 9, -Math.PI * 0.75, Math.PI * 0.25);
          ctx.stroke();
        },
      },
      {
        key: 'item_mega_fire',
        bgColor: 0xea580c,
        ringColor: 0xfde047,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const r = i % 2 === 0 ? 9 : 4;
            const x = 16 + Math.cos(angle) * r;
            const y = 16 + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        },
      },
      {
        key: 'item_armor_up',
        bgColor: 0x1e3a5f,
        ringColor: 0x60a5fa,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#60a5fa';
          ctx.beginPath();
          ctx.moveTo(10, 10); ctx.lineTo(22, 10); ctx.lineTo(20, 22); ctx.lineTo(12, 22); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(13, 13, 2, 2);
          ctx.fillRect(17, 13, 2, 2);
        },
      },
      {
        key: 'item_blast_resist',
        bgColor: 0xc2410c,
        ringColor: 0xf97316,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#fed7aa';
          ctx.beginPath();
          ctx.moveTo(16, 8); ctx.lineTo(25, 23); ctx.lineTo(7, 23); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#c2410c';
          ctx.fillRect(15, 12, 2, 6);
          ctx.fillRect(15, 20, 2, 2);
        },
      },
      {
        key: 'item_wall_pass',
        bgColor: 0x581c87,
        ringColor: 0xc084fc,
        drawGlyph: (ctx) => {
          ctx.strokeStyle = '#e9d5ff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(9, 10, 14, 5);
          ctx.strokeRect(9, 17, 14, 5);
          ctx.fillStyle = '#c084fc';
          ctx.beginPath();
          ctx.moveTo(14, 22); ctx.lineTo(22, 14); ctx.lineTo(19, 11); ctx.lineTo(11, 19); ctx.closePath();
          ctx.fill();
        },
      },
      {
        key: 'item_bomb_pass',
        bgColor: 0x312e81,
        ringColor: 0x818cf8,
        drawGlyph: (ctx) => {
          ctx.strokeStyle = '#a5b4fc';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(16, 16, 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(10, 22); ctx.lineTo(22, 10);
          ctx.stroke();
        },
      },
      {
        key: 'item_time_freeze',
        bgColor: 0x78350f,
        ringColor: 0xfacc15,
        drawGlyph: (ctx) => {
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(16, 17, 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(16, 17); ctx.lineTo(16, 13);
          ctx.moveTo(16, 17); ctx.lineTo(19, 17);
          ctx.stroke();
          ctx.strokeRect(14, 7, 4, 3);
        },
      },
      {
        key: 'item_magnet',
        bgColor: 0x172554,
        ringColor: 0x38bdf8,
        drawGlyph: (ctx) => {
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(16, 15, 6, Math.PI, Math.PI * 1.5);
          ctx.stroke();
          ctx.strokeStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(16, 15, 6, Math.PI * 1.5, 0);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(9, 15, 3, 4);
          ctx.fillRect(20, 15, 3, 4);
        },
      },
      {
        key: 'item_extra_life',
        bgColor: 0x881337,
        ringColor: 0xfbbf24,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.moveTo(16, 22);
          ctx.bezierCurveTo(9, 17, 9, 11, 13, 11);
          ctx.bezierCurveTo(15, 11, 16, 13, 16, 13);
          ctx.bezierCurveTo(16, 13, 17, 11, 19, 11);
          ctx.bezierCurveTo(23, 11, 23, 17, 16, 22);
          ctx.fill();
        },
      },
      {
        key: 'item_cloak',
        bgColor: 0x0f172a,
        ringColor: 0x818cf8,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#c084fc';
          ctx.beginPath();
          ctx.moveTo(16, 9); ctx.lineTo(23, 21); ctx.lineTo(9, 21); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(14, 16, 1.5, 0, Math.PI * 2);
          ctx.arc(18, 16, 1.5, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        key: 'item_deflector',
        bgColor: 0x0f766e,
        ringColor: 0x2dd4bf,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#2dd4bf';
          ctx.beginPath();
          ctx.moveTo(16, 8); ctx.lineTo(24, 16); ctx.lineTo(16, 24); ctx.lineTo(8, 16); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(16, 11); ctx.lineTo(21, 16); ctx.lineTo(16, 21); ctx.lineTo(11, 16); ctx.closePath();
          ctx.fill();
        },
      },
      {
        key: 'item_speed_surge',
        bgColor: 0x15803d,
        ringColor: 0x84cc16,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#bef264';
          ctx.beginPath();
          ctx.moveTo(14, 9); ctx.lineTo(18, 9); ctx.lineTo(18, 13); ctx.lineTo(22, 21);
          ctx.lineTo(10, 21); ctx.lineTo(14, 13); ctx.closePath();
          ctx.fill();
        },
      },
      {
        key: 'item_vampiric',
        bgColor: 0x450a0a,
        ringColor: 0xef4444,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(16, 8); ctx.lineTo(22, 14); ctx.lineTo(16, 24); ctx.lineTo(10, 14); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(16, 14, 2, 0, Math.PI * 2);
          ctx.fill();
        },
      },
      {
        key: 'item_poison_mist',
        bgColor: 0x064e3b,
        ringColor: 0x10b981,
        drawGlyph: (ctx) => {
          ctx.fillStyle = '#34d399';
          ctx.beginPath();
          ctx.arc(13, 17, 4, 0, Math.PI * 2);
          ctx.arc(19, 17, 4, 0, Math.PI * 2);
          ctx.arc(16, 13, 4.5, 0, Math.PI * 2);
          ctx.fill();
        },
      },
    ];

    itemDefs.forEach(({ key, bgColor, ringColor, drawGlyph }) => {
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

          // Draw distinct item glyph
          try {
            drawGlyph(ctx);
          } catch {
            // Glyph drawing safe fallback
          }

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
