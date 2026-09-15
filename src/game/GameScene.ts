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
} from './pathfinding';

export const TILE_SIZE = PATH_TILE_SIZE;
export const ROWS = PATH_ROWS;
export const COLS = PATH_COLS;
export const TILE_EMPTY = PATH_TILE_EMPTY;
export const TILE_WALL = PATH_TILE_WALL;
export const TILE_BLOCK = PATH_TILE_BLOCK;

export { findPathBFS };
export type { GridCoord };

export enum EnemyState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  TRACKING = 'TRACKING',
  HUNTING = 'HUNTING',
  WINDUP = 'WINDUP',
  ATTACK = 'ATTACK',
  COOLDOWN = 'COOLDOWN',
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

  // Visual companion indicator
  private indicator!: Phaser.GameObjects.Text;

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

    // Create intent indicator text above enemy head
    this.indicator = scene.add.text(x, y - 24, '', {
      fontSize: '15px',
      fontStyle: 'bold',
      fontFamily: 'monospace, Arial, sans-serif',
      color: '#FFD700',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.indicator.setOrigin(0.5, 0.5);
    this.indicator.setDepth(15);
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

    // Sync companion indicator position
    if (this.indicator && this.indicator.active) {
      this.indicator.setPosition(this.x, this.y - 24);
    }

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
  private bombs!: Phaser.Physics.Arcade.Group;
  private explosions!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;

  private spaceKey!: Phaser.Input.Keyboard.Key;
  private activeBombs: number = 0;
  private maxBombs: number = 1;
  private bombPower: number = 2; // blast radius

  private map: number[][] = [];
  private isGameOver: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.image('player', '/assets/player.png');
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
    this.cameras.main.setBackgroundColor('#87CEEB');

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

    // Spawn enemies at depth 9 with physics size 24x24 (offset 8, 8)
    this.spawnEnemies(4);

    // Collisions
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.blocks);
    this.physics.add.collider(this.player, this.bombs);

    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.enemies, this.blocks);
    this.physics.add.collider(this.enemies, this.bombs);

    // Player hits enemy
    this.physics.add.overlap(this.player, this.enemies, () => {
      this.playerDie();
    });

    // Global explosion overlaps (replaces per-sprite overlap additions in spawnExplosion)
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
    }
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
  }

  update(_time: number, delta: number) {
    if (this.isGameOver || !this.player || !this.cursors) return;

    // Movement
    this.updatePlayerMovement();

    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false };

    // Bomb placement
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || mInput.bomb) {
      if (mInput.bomb) mInput.bomb = false; // consume mobile input
      this.placeBomb();
    }

    // Collect active bomb tiles for AI path avoidance
    const bombTiles = new Set<string>();
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active) {
        const col = Math.floor(b.x / TILE_SIZE);
        const row = Math.floor(b.y / TILE_SIZE);
        bombTiles.add(`${row},${col}`);
      }
    });

    // Update enemies with advanced tracking and attack AI
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

    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false };
    const left = Boolean(this.cursors?.left?.isDown || mInput.left);
    const right = Boolean(this.cursors?.right?.isDown || mInput.right);
    const up = Boolean(this.cursors?.up?.isDown || mInput.up);
    const down = Boolean(this.cursors?.down?.isDown || mInput.down);

    if (!left && !right && !up && !down) {
      this.player.setVelocity(0, 0);
      return;
    }

    const speed = 150;
    const slideSpeed = 150;
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

    // Attach references to bomb data for clean lifecycle management
    const fuseTimer = this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
    bomb.setData('fuseTimer', fuseTimer);
    bomb.setData('tweenChain', tweenChain);
  }

  explodeBomb(bomb: Phaser.Physics.Arcade.Sprite, row: number, col: number) {
    if (!bomb.active) return;

    // Clean up timers & tweens
    const timer = bomb.getData('fuseTimer') as Phaser.Time.TimerEvent | undefined;
    if (timer) timer.remove(false);
    const chain = bomb.getData('tweenChain') as Phaser.Tweens.TweenChain | undefined;
    if (chain) chain.stop();

    bomb.destroy();
    this.activeBombs = Math.max(0, this.activeBombs - 1);

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
      for (let i = 1; i <= this.bombPower; i++) {
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
  }

  playerDie() {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.player.setTint(0x000000);
    this.physics.pause();

    this.time.delayedCall(1000, () => {
      this.isGameOver = false;
      this.activeBombs = 0;
      this.scene.restart();
    });
  }
}
