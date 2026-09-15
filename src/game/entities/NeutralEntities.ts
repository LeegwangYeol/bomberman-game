import Phaser from 'phaser';
import { BaseEntity } from './BaseEntity';
import { NEUTRAL_ARCHETYPES, FACTIONS } from './types';
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  GridCoord,
  findEscapePathBFS,
} from '../pathfinding';
import { ItemType } from '../gameplay_mechanics';

/**
 * 1. Wandering Merchant ("Pops"):
 * 3 HP, peaceful walk, flees ticking bombs, pauses at intersections for trade cart (`[E] Trade`),
 * drops 2 protected power-ups on death.
 */
export class MerchantNPC extends BaseEntity {
  public config = NEUTRAL_ARCHETYPES.MERCHANT;
  public droppedLoot: Array<{ type: ItemType; r: number; c: number; spawnTime: number }> = [];

  private currentDirection: { x: number; y: number } = { x: 1, y: 0 };
  private pauseTimer: number = 0;
  private isTrading: boolean = false;
  private fleePath: GridCoord[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'player') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.NEUTRAL,
      NEUTRAL_ARCHETYPES.MERCHANT.maxHp,
      NEUTRAL_ARCHETYPES.MERCHANT.name,
      'MERCHANT',
      24,
      NEUTRAL_ARCHETYPES.MERCHANT.hpBarColor
    );
    this.moveSpeed = this.config.walkSpeed;
    this.setTint(0xf59e0b);
    this.overheadUI.setIntent('🛒', true);
  }

  protected override onDeath(currentTime: number): void {
    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);

    const rightC = Math.min(COLS - 2, ec + 1);

    // Drop 2 protected power-ups upon cart destruction
    this.droppedLoot = [
      { type: 'SPEED_UP', r: er, c: ec, spawnTime: currentTime },
      { type: 'SHIELD', r: er, c: rightC, spawnTime: currentTime },
    ];

    // Spawn items into scene if available
    const sceneWithItems = this.scene as unknown as {
      spawnSpecificItem?: (type: ItemType, r: number, c: number, spawnTime: number) => void;
    };
    if (sceneWithItems && typeof sceneWithItems.spawnSpecificItem === 'function') {
      for (const loot of this.droppedLoot) {
        sceneWithItems.spawnSpecificItem(loot.type, loot.r, loot.c, loot.spawnTime);
      }
    }
  }

  public updateAI(
    delta: number,
    currentTime: number,
    player: Phaser.Physics.Arcade.Sprite | null,
    map: number[][],
    bombTiles: Set<string>
  ) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    const mr = Math.floor(this.y / TILE_SIZE);
    const mc = Math.floor(this.x / TILE_SIZE);

    // 1. Danger check: Flee if ticking bomb is within 3 tiles
    let nearBomb = false;
    for (const bKey of bombTiles) {
      const [br, bc] = bKey.split(',').map(Number);
      if (Math.abs(mr - br) + Math.abs(mc - bc) <= 3) {
        nearBomb = true;
        break;
      }
    }

    if (nearBomb) {
      this.overheadUI.setIntent('😱', true);
      if (this.fleePath.length === 0) {
        const escape = findEscapePathBFS({ r: mr, c: mc }, bombTiles, map, bombTiles, 4);
        if (escape) this.fleePath = escape;
      }

      if (this.fleePath.length > 0) {
        const next = this.fleePath[0];
        const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
        const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;

        const fleeSpeed = 80;
        if (Math.abs(dx) > Math.abs(dy)) {
          this.setVelocity(Math.sign(dx) * fleeSpeed, 0);
        } else {
          this.setVelocity(0, Math.sign(dy) * fleeSpeed);
        }

        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          this.fleePath.shift();
        }
        return;
      }
    }

    // 2. Player proximity trade check
    if (player && player.active) {
      const pr = Math.floor(player.y / TILE_SIZE);
      const pc = Math.floor(player.x / TILE_SIZE);
      if (Math.abs(mr - pr) + Math.abs(mc - pc) <= 1) {
        this.isTrading = true;
        this.setVelocity(0, 0);
        this.overheadUI.setIntent('💰', true);
        return;
      }
    }

    this.isTrading = false;

    // 3. Pause at intersections for trade stall
    this.pauseTimer -= delta;
    if (this.pauseTimer > 0) {
      this.setVelocity(0, 0);
      this.overheadUI.setIntent('🛒', true);
      return;
    }

    // Count open orthogonal corridor directions
    const openDirs: Array<{ x: number; y: number }> = [];
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (const d of dirs) {
      const nr = mr + d.y;
      const nc = mc + d.x;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === TILE_EMPTY) {
        openDirs.push(d);
      }
    }

    // Check if at intersection
    const isAtTileCenter =
      Math.abs(this.x - (mc * TILE_SIZE + TILE_SIZE / 2)) < 4 &&
      Math.abs(this.y - (mr * TILE_SIZE + TILE_SIZE / 2)) < 4;

    if (openDirs.length >= 3 && isAtTileCenter && Math.random() < 0.05) {
      this.pauseTimer = 2500;
      this.setVelocity(0, 0);
      this.overheadUI.setIntent('🛒', true);
      return;
    }

    // Move in current direction or choose new open direction
    const forwardR = mr + this.currentDirection.y;
    const forwardC = mc + this.currentDirection.x;
    const isForwardBlocked =
      forwardR < 0 ||
      forwardR >= ROWS ||
      forwardC < 0 ||
      forwardC >= COLS ||
      map[forwardR][forwardC] !== TILE_EMPTY;

    if (isForwardBlocked && openDirs.length > 0) {
      this.currentDirection = openDirs[Math.floor(Math.random() * openDirs.length)];
    }

    this.setVelocity(
      this.currentDirection.x * this.config.walkSpeed,
      this.currentDirection.y * this.config.walkSpeed
    );
    this.overheadUI.setIntent('🛒', true);
  }
}

/**
 * 2. Wandering Critter ("Fluff"):
 * 1 HP, peaceful waddle, harmless to player, 25% chance to distract hunting enemies,
 * grants +200 score on defeat.
 */
export class CritterNPC extends BaseEntity {
  public config = NEUTRAL_ARCHETYPES.CRITTER;
  private hopTimer: number = 0;
  private isHopping: boolean = false;
  private hopDirection: { x: number; y: number } = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'player') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.NEUTRAL,
      NEUTRAL_ARCHETYPES.CRITTER.maxHp,
      NEUTRAL_ARCHETYPES.CRITTER.name,
      'CRITTER',
      18,
      NEUTRAL_ARCHETYPES.CRITTER.hpBarColor
    );
    this.moveSpeed = this.config.hopSpeed;
    this.setTint(0xec4899);
    this.setScale(0.8, 0.8);
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(20, 20).setOffset(10, 10);
    this.overheadUI.setIntent('🐾', true);
  }

  protected override onDeath(_currentTime?: number): void {
    void _currentTime;
    const sceneWithScore = this.scene as unknown as { score?: number };
    if (sceneWithScore && typeof sceneWithScore.score === 'number') {
      sceneWithScore.score += this.config.scoreReward;
    }
  }

  public updateAI(delta: number, currentTime: number, map: number[][]) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    this.hopTimer -= delta;
    if (this.hopTimer <= 0) {
      this.isHopping = !this.isHopping;
      if (this.isHopping) {
        this.hopTimer = 900; // Hop duration
        this.overheadUI.setIntent('🐾', true);

        // Pick random open direction
        const cr = Math.floor(this.y / TILE_SIZE);
        const cc = Math.floor(this.x / TILE_SIZE);
        const dirs = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ];
        const openDirs = dirs.filter((d) => {
          const nr = cr + d.y;
          const nc = cc + d.x;
          return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === TILE_EMPTY;
        });

        if (openDirs.length > 0) {
          this.hopDirection = openDirs[Math.floor(Math.random() * openDirs.length)];
          this.setVelocity(
            this.hopDirection.x * this.config.hopSpeed,
            this.hopDirection.y * this.config.hopSpeed
          );
        }
      } else {
        this.hopTimer = 1400; // Pause & nibble
        this.setVelocity(0, 0);
        this.overheadUI.setIntent('💤', true);
      }
    }
  }
}
