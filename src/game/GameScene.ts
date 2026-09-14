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
  TRACKING = 'TRACKING',
  WINDUP = 'WINDUP',
  ATTACK = 'ATTACK',
  COOLDOWN = 'COOLDOWN',
}

/**
 * Intelligent Enemy Sprite with 4-Stage Attack State Machine and Corridor Snapping.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public aiState: EnemyState = EnemyState.TRACKING;
  public isTracker: boolean;

  private stateTimer: number = 0;
  private pathRecalcTimer: number = 0;
  private currentPath: GridCoord[] = [];
  private targetTile: GridCoord | null = null;

  private attackDir: { x: number; y: number } = { x: 0, y: 0 };
  private baseSpeed: number = 75;
  private chargeSpeed: number = 200;

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
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6);
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

    const enemyR = Math.floor(this.y / TILE_SIZE);
    const enemyC = Math.floor(this.x / TILE_SIZE);
    const playerR = Math.floor(player.y / TILE_SIZE);
    const playerC = Math.floor(player.x / TILE_SIZE);

    switch (this.aiState) {
      case EnemyState.TRACKING:
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
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal primary motion: snap orthogonal Y to corridor center
        const corridorY = this.targetTile.r * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.y - corridorY) < 6) {
          this.y = corridorY;
        }
        this.setVelocity(Math.sign(dx) * this.baseSpeed, 0);
      } else {
        // Vertical primary motion: snap orthogonal X to corridor center
        const corridorX = this.targetTile.c * TILE_SIZE + TILE_SIZE / 2;
        if (Math.abs(this.x - corridorX) < 6) {
          this.x = corridorX;
        }
        this.setVelocity(0, Math.sign(dy) * this.baseSpeed);
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
    this.aiState = EnemyState.WINDUP;
    this.stateTimer = 450; // 450ms telegraph
    this.setVelocity(0, 0);
    this.setTint(0xff2222); // Red warning tint

    // Lock attack direction along corridor
    if (er === pr) {
      this.attackDir = { x: Math.sign(pc - ec), y: 0 };
    } else if (ec === pc) {
      this.attackDir = { x: 0, y: Math.sign(pr - er) };
    } else {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.attackDir = { x: Math.sign(dx), y: 0 };
      } else {
        this.attackDir = { x: 0, y: Math.sign(dy) };
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
      this.aiState = EnemyState.ATTACK;
      this.stateTimer = 650; // Max attack dash duration
      this.setTint(0xffaa00); // Orange charging tint
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
      this.aiState = EnemyState.COOLDOWN;
      this.stateTimer = 1200; // 1200ms recovery window
      this.setVelocity(0, 0);
      this.setTint(0x88bbff); // Blue recovery tint
      if (isBlocked && this.scene) {
        this.scene.cameras.main.shake(80, 0.005);
      }
    }
  }

  private handleCooldown(delta: number) {
    this.stateTimer -= delta;
    this.setVelocity(0, 0);

    if (this.stateTimer <= 0) {
      this.aiState = EnemyState.TRACKING;
      this.clearTint();
      this.pathRecalcTimer = 0;
      this.currentPath = [];
      this.targetTile = null;
    }
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

    // Spawn player at depth 10 with physics size 28x28 (offset 6, 6)
    this.player = this.physics.add.sprite(
      1 * TILE_SIZE + TILE_SIZE / 2,
      1 * TILE_SIZE + TILE_SIZE / 2,
      'player'
    );
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    (this.player.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6);

    // Spawn enemies at depth 9 with physics size 28x28 (offset 6, 6)
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
        (enemy.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6);

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
    const speed = 150;
    this.player.setVelocity(0);

    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false };

    if (this.cursors.left.isDown || mInput.left) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
    } else if (this.cursors.right.isDown || mInput.right) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
    } else if (this.cursors.up.isDown || mInput.up) {
      this.player.setVelocityY(-speed);
    } else if (this.cursors.down.isDown || mInput.down) {
      this.player.setVelocityY(speed);
    }

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
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(36, 36).setOffset(2, 2);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);

    // Pulse animation while ticking
    this.tweens.add({
      targets: bomb,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 250,
      yoyo: true,
      repeat: -1,
    });

    this.activeBombs++;

    // Explode after 2 seconds
    this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
  }

  explodeBomb(bomb: Phaser.Physics.Arcade.Sprite, row: number, col: number) {
    if (!bomb.active) return;
    bomb.destroy();
    this.activeBombs = Math.max(0, this.activeBombs - 1);

    this.cameras.main.shake(100, 0.004);

    // Create explosions (center + 4 directions)
    this.spawnExplosion(row, col);

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
          this.spawnExplosion(nr, nc);
          break;
        }

        // Empty tile, spawn explosion
        this.spawnExplosion(nr, nc);
      }
    }
  }

  spawnExplosion(row: number, col: number) {
    const x = col * TILE_SIZE + TILE_SIZE / 2;
    const y = row * TILE_SIZE + TILE_SIZE / 2;

    const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
    exp.setDepth(12);

    // Check if player is caught
    this.physics.add.overlap(this.player, exp, () => {
      this.playerDie();
    });

    // Check if enemies are caught
    this.physics.add.overlap(this.enemies, exp, (_expObj, enemyHit) => {
      const target = enemyHit as Phaser.GameObjects.GameObject;
      if (target.active) {
        target.destroy();
      }
    });

    // Scale/fade explosion and destroy after 300ms
    this.tweens.add({
      targets: exp,
      alpha: { from: 1, to: 0.4 },
      scaleX: { from: 1, to: 1.15 },
      scaleY: { from: 1, to: 1.15 },
      duration: 300,
      onComplete: () => {
        exp.destroy();
      },
    });
  }

  destroyBlock(row: number, col: number) {
    this.map[row][col] = TILE_EMPTY;
    this.blocks.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b && b.active && b.getData('row') === row && b.getData('col') === col) {
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
