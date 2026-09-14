import Phaser from 'phaser';

const TILE_SIZE = 40;
const ROWS = 13;
const COLS = 15;

const TILE_EMPTY = 0;
const TILE_WALL = 1;
const TILE_BLOCK = 2;

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
  private bombPower: number = 2; // radius

  private map: number[][] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    const g = this.make.graphics({x: 0, y: 0});
    
    // Wall (Unbreakable)
    g.fillStyle(0x606060);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.generateTexture('wall', TILE_SIZE, TILE_SIZE);
    
    // Block (Breakable)
    g.clear();
    g.fillStyle(0xd2b48c);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.generateTexture('block', TILE_SIZE, TILE_SIZE);

    // Player
    g.clear();
    g.fillStyle(0xff5555);
    g.fillCircle(TILE_SIZE/2, TILE_SIZE/2, 16);
    g.generateTexture('player', TILE_SIZE, TILE_SIZE);

    // Enemy
    g.clear();
    g.fillStyle(0x9932CC); // Purple enemy
    g.fillCircle(TILE_SIZE/2, TILE_SIZE/2, 16);
    g.generateTexture('enemy', TILE_SIZE, TILE_SIZE);

    // Bomb
    g.clear();
    g.fillStyle(0x222222);
    g.fillCircle(TILE_SIZE/2, TILE_SIZE/2, 14);
    g.generateTexture('bomb', TILE_SIZE, TILE_SIZE);

    // Explosion
    g.clear();
    g.fillStyle(0xffa500);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.generateTexture('explosion', TILE_SIZE, TILE_SIZE);

    // Floor
    g.clear();
    g.fillStyle(0x90ee90);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.generateTexture('floor', TILE_SIZE, TILE_SIZE);
  }

  create() {
    this.cameras.main.setBackgroundColor('#87CEEB');
    
    // Groups
    this.walls = this.physics.add.staticGroup();
    this.blocks = this.physics.add.staticGroup();
    this.bombs = this.physics.add.group();
    this.explosions = this.physics.add.group();

    this.generateMap();

    // Player
    // Start at grid (1,1)
    this.player = this.physics.add.sprite(
      1 * TILE_SIZE + TILE_SIZE / 2, 
      1 * TILE_SIZE + TILE_SIZE / 2, 
      'player'
    );
    this.player.setCollideWorldBounds(true);
    // slight smaller hit box
    this.player.body?.setSize(24, 24);

    // Enemies
    this.enemies = this.physics.add.group();
    this.spawnEnemies(3);

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

    // Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }
  }

  spawnEnemies(count: number) {
    let spawned = 0;
    while (spawned < count) {
      const r = Phaser.Math.Between(5, ROWS - 2);
      const c = Phaser.Math.Between(5, COLS - 2);
      
      if (this.map[r][c] === TILE_EMPTY) {
        const enemy = this.enemies.create(
          c * TILE_SIZE + TILE_SIZE / 2,
          r * TILE_SIZE + TILE_SIZE / 2,
          'enemy'
        ) as Phaser.Physics.Arcade.Sprite;
        
        enemy.setCollideWorldBounds(true);
        enemy.body?.setSize(24, 24);
        enemy.setData('direction', Phaser.Math.Between(0, 3)); // 0:up, 1:right, 2:down, 3:left
        
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
        // Background floor
        this.add.image(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2, 'floor');

        // Borders
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          this.map[r][c] = TILE_WALL;
          this.walls.create(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2, 'wall');
        } 
        // Inner fixed walls
        else if (r % 2 === 0 && c % 2 === 0) {
          this.map[r][c] = TILE_WALL;
          this.walls.create(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2, 'wall');
        }
        // Breakable blocks
        else {
          // Leave top-left corner open for player spawn
          if ((r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1)) {
            this.map[r][c] = TILE_EMPTY;
          } else if (Math.random() < 0.6) {
            this.map[r][c] = TILE_BLOCK;
            const block = this.blocks.create(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2, 'block');
            block.setData('row', r);
            block.setData('col', c);
          } else {
            this.map[r][c] = TILE_EMPTY;
          }
        }
      }
    }
  }

  update() {
    if (!this.player || !this.cursors) return;

    // Movement
    const speed = 150;
    this.player.setVelocity(0);

    const mInput = window.mobileInput || { up: false, down: false, left: false, right: false, bomb: false };

    if (this.cursors.left.isDown || mInput.left) {
      this.player.setVelocityX(-speed);
    } else if (this.cursors.right.isDown || mInput.right) {
      this.player.setVelocityX(speed);
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

    // Enemy movement
    const enemySpeed = 60;
    this.enemies.getChildren().forEach((child: any) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return true;

      const dir = enemy.getData('direction');
      
      // Check if blocked
      if (enemy.body && (enemy.body.blocked.up || enemy.body.blocked.down || enemy.body.blocked.left || enemy.body.blocked.right)) {
        // Change direction if hit wall
        enemy.setData('direction', Phaser.Math.Between(0, 3));
      }

      enemy.setVelocity(0);
      switch(dir) {
        case 0: enemy.setVelocityY(-enemySpeed); break; // up
        case 1: enemy.setVelocityX(enemySpeed); break;  // right
        case 2: enemy.setVelocityY(enemySpeed); break;  // down
        case 3: enemy.setVelocityX(-enemySpeed); break; // left
      }
      return true;
    });
  }

  placeBomb() {
    if (this.activeBombs >= this.maxBombs) return;

    const col = Math.floor(this.player.x / TILE_SIZE);
    const row = Math.floor(this.player.y / TILE_SIZE);

    // Prevent placing multiple bombs on same tile
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;
    
    // Check if bomb already exists here
    let hasBomb = false;
    this.bombs.getChildren().forEach((child: any) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.x === centerX && b.y === centerY) {
        hasBomb = true;
      }
    });

    if (hasBomb) return;

    const bomb = this.bombs.create(centerX, centerY, 'bomb');
    bomb.body.setImmovable(true);
    this.activeBombs++;

    // Explode after 2 seconds
    this.time.delayedCall(2000, () => this.explodeBomb(bomb, row, col));
  }

  explodeBomb(bomb: Phaser.Physics.Arcade.Sprite, row: number, col: number) {
    bomb.destroy();
    this.activeBombs--;

    // Create explosions (center + 4 directions)
    this.spawnExplosion(row, col);

    const directions = [
      { dr: -1, dc: 0 }, // up
      { dr: 1, dc: 0 },  // down
      { dr: 0, dc: -1 }, // left
      { dr: 0, dc: 1 }   // right
    ];

    for (const dir of directions) {
      for (let i = 1; i <= this.bombPower; i++) {
        const nr = row + dir.dr * i;
        const nc = col + dir.dc * i;
        
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
    
    const exp = this.explosions.create(x, y, 'explosion');
    
    // Check if player is caught
    this.physics.add.overlap(this.player, exp, () => {
      this.playerDie();
    });

    // Check if enemies are caught
    this.physics.add.overlap(this.enemies, exp, (enemyHit) => {
      enemyHit.destroy();
    });

    // Remove explosion after 300ms
    this.time.delayedCall(300, () => {
      exp.destroy();
    });
  }

  destroyBlock(row: number, col: number) {
    this.map[row][col] = TILE_EMPTY;
    this.blocks.getChildren().forEach((child: any) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b && b.getData('row') === row && b.getData('col') === col) {
        b.destroy();
      }
    });
  }

  playerDie() {
    this.player.setTint(0x000000);
    this.physics.pause();
    this.time.delayedCall(1000, () => {
      this.scene.restart();
      this.activeBombs = 0;
    });
  }
}
