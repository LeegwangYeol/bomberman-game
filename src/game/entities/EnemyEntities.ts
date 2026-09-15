import Phaser from 'phaser';
import { BaseEntity } from './BaseEntity';
import { ENEMY_ARCHETYPES, FACTIONS } from './types';
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_WALL,
  TILE_BLOCK,
  TILE_EMPTY,
  GridCoord,
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
} from '../pathfinding';

/**
 * Enemy AI States
 */
export enum EnemyState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  TRACKING = 'TRACKING',
  HUNTING = 'HUNTING',
  WINDUP = 'WINDUP',
  ATTACK = 'ATTACK',
  COOLDOWN = 'COOLDOWN',
  EVADING = 'EVADING',
  ENRAGED = 'ENRAGED',
  PHASING = 'PHASING',
  MATERIALIZED = 'MATERIALIZED',
}

/**
 * 1. ChaserEnemy: High speed, 350ms telegraph windup before 240 px/s corridor dash, 900ms stun on wall impact.
 */
export class ChaserEnemy extends BaseEntity {
  public aiState: EnemyState = EnemyState.PATROL;
  public config = ENEMY_ARCHETYPES.CHASER;

  private stateTimer: number = 0;
  private pathRecalcTimer: number = 0;
  private currentPath: GridCoord[] = [];
  private attackDir: { x: number; y: number } = { x: 0, y: 0 };
  private dashTargetTile: GridCoord | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy_tracker') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ENEMY,
      ENEMY_ARCHETYPES.CHASER.maxHp,
      ENEMY_ARCHETYPES.CHASER.name,
      'CHASER',
      24,
      ENEMY_ARCHETYPES.CHASER.hpBarColor
    );
    this.moveSpeed = this.config.trackSpeed;
    this.setTint(0xff4444);
    this.changeState(EnemyState.TRACKING);
  }

  public changeState(newState: EnemyState) {
    if (this.aiState === newState) return;
    this.aiState = newState;

    switch (newState) {
      case EnemyState.IDLE:
        this.overheadUI.setIntent('...', true);
        break;
      case EnemyState.PATROL:
        this.overheadUI.setIntent('', false);
        break;
      case EnemyState.TRACKING:
      case EnemyState.HUNTING:
        this.overheadUI.setIntent('!', true);
        break;
      case EnemyState.WINDUP:
        this.overheadUI.setIntent('⚠️', true);
        this.setVelocity(0, 0);
        this.stateTimer = this.config.windupMs;
        break;
      case EnemyState.ATTACK:
        this.overheadUI.setIntent('⚡', true);
        this.setVelocity(
          this.attackDir.x * this.config.dashSpeed,
          this.attackDir.y * this.config.dashSpeed
        );
        this.stateTimer = 600; // max dash duration
        break;
      case EnemyState.COOLDOWN:
        this.overheadUI.setIntent('💫', true);
        this.setVelocity(0, 0);
        this.isStunned = true;
        this.stunUntil = (this.scene?.time?.now || 0) + this.config.stunMs;
        this.stateTimer = this.config.stunMs;
        break;
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

    if (this.isStunned) {
      if (currentTime >= this.stunUntil) {
        this.isStunned = false;
        this.changeState(EnemyState.TRACKING);
      }
      return;
    }

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);
    const pr = Math.floor(player.y / TILE_SIZE);
    const pc = Math.floor(player.x / TILE_SIZE);

    switch (this.aiState) {
      case EnemyState.TRACKING:
      case EnemyState.HUNTING: {
        // Line-of-sight check for corridor charge
        if ((er === pr || ec === pc) && Math.abs(er - pr) + Math.abs(ec - pc) <= 4) {
          if (this.hasLineOfSight(er, ec, pr, pc, map)) {
            const dirX = er === pr ? Math.sign(pc - ec) : 0;
            const dirY = ec === pc ? Math.sign(pr - er) : 0;
            this.attackDir = { x: dirX, y: dirY };
            this.dashTargetTile = { r: pr, c: pc };
            this.changeState(EnemyState.WINDUP);
            return;
          }
        }

        // BFS pathfinding towards player
        this.pathRecalcTimer -= delta;
        if (this.pathRecalcTimer <= 0) {
          this.pathRecalcTimer = 200;
          this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
        }

        if (this.currentPath.length > 0) {
          const next = this.currentPath[0];
          const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
          const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
          const dx = targetX - this.x;
          const dy = targetY - this.y;

          if (Math.abs(dx) > Math.abs(dy)) {
            this.setVelocity(Math.sign(dx) * this.config.trackSpeed, 0);
          } else {
            this.setVelocity(0, Math.sign(dy) * this.config.trackSpeed);
          }
        }
        break;
      }

      case EnemyState.WINDUP:
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          this.changeState(EnemyState.ATTACK);
        }
        break;

      case EnemyState.ATTACK: {
        this.stateTimer -= delta;
        // Check impact with wall/block or dash timeout
        const nextR = er + this.attackDir.y;
        const nextC = ec + this.attackDir.x;
        const hitWall =
          nextR < 0 ||
          nextR >= ROWS ||
          nextC < 0 ||
          nextC >= COLS ||
          map[nextR][nextC] === TILE_WALL ||
          map[nextR][nextC] === TILE_BLOCK;

        if (this.stateTimer <= 0 || hitWall) {
          this.changeState(EnemyState.COOLDOWN);
        }
        break;
      }

      case EnemyState.COOLDOWN:
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          this.changeState(EnemyState.TRACKING);
        }
        break;
    }
  }

  private hasLineOfSight(r1: number, c1: number, r2: number, c2: number, map: number[][]): boolean {
    if (r1 === r2) {
      const minC = Math.min(c1, c2);
      const maxC = Math.max(c1, c2);
      for (let c = minC + 1; c < maxC; c++) {
        if (map[r1][c] !== TILE_EMPTY) return false;
      }
      return true;
    }
    if (c1 === c2) {
      const minR = Math.min(r1, r2);
      const maxR = Math.max(r1, r2);
      for (let r = minR + 1; r < maxR; r++) {
        if (map[r][c1] !== TILE_EMPTY) return false;
      }
      return true;
    }
    return false;
  }
}

/**
 * 2. BomberEnemy: 2 HP, strategic bomb planting with suicide prevention, 1 HP enraged mode with 1200ms quick-fuse bombs.
 */
export class BomberEnemy extends BaseEntity {
  public aiState: EnemyState = EnemyState.PATROL;
  public config = ENEMY_ARCHETYPES.BOMBER;

  public canDropBombs: boolean = true;
  public activeBombs: number = 0;
  public maxBombs: number = 1;
  public bombCooldownTimer: number = 2500;
  public bombPower: number = 2;

  private currentPath: GridCoord[] = [];
  private escapePath: GridCoord[] = [];
  private escapeTargetTile: GridCoord | null = null;
  private pathRecalcTimer: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ENEMY,
      ENEMY_ARCHETYPES.BOMBER.maxHp,
      ENEMY_ARCHETYPES.BOMBER.name,
      'BOMBER',
      24,
      ENEMY_ARCHETYPES.BOMBER.hpBarColor
    );
    this.moveSpeed = this.config.trackSpeed;
    this.setTint(0xc084fc);
    this.changeState(EnemyState.HUNTING);
  }

  public changeState(newState: EnemyState) {
    if (this.aiState === newState) return;
    this.aiState = newState;

    switch (newState) {
      case EnemyState.PATROL:
        this.overheadUI.setIntent('', false);
        break;
      case EnemyState.HUNTING:
      case EnemyState.TRACKING:
        this.overheadUI.setIntent('💣', true);
        break;
      case EnemyState.EVADING:
        this.overheadUI.setIntent('💨', true);
        break;
      case EnemyState.ENRAGED:
        this.overheadUI.setIntent('😈', true);
        this.moveSpeed = this.config.enragedSpeed;
        this.setTint(0xec4899);
        break;
    }
  }

  public override takeDamage(amount: number, sourceBombOwner?: string, currentTime: number = 0): boolean {
    const died = super.takeDamage(amount, sourceBombOwner, currentTime);
    if (!died && this.hp === 1) {
      this.changeState(EnemyState.ENRAGED);
    }
    return died;
  }

  public updateAI(
    delta: number,
    currentTime: number,
    player: Phaser.Physics.Arcade.Sprite | null,
    map: number[][],
    bombTiles: Set<string>,
    dropBombCallback?: (r: number, c: number, fuseMs: number) => boolean
  ) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    this.bombCooldownTimer -= delta;

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);
    const pr = Math.floor(player.y / TILE_SIZE);
    const pc = Math.floor(player.x / TILE_SIZE);
    const dist = Math.abs(er - pr) + Math.abs(ec - pc);

    if (this.aiState === EnemyState.EVADING) {
      // Follow escape path to safety
      if (this.escapePath.length > 0) {
        const next = this.escapePath[0];
        const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
        const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;

        const currentSpeed = this.hp === 1 ? this.config.enragedSpeed : this.config.evadeSpeed;
        if (Math.abs(dx) > Math.abs(dy)) {
          this.setVelocity(Math.sign(dx) * currentSpeed, 0);
        } else {
          this.setVelocity(0, Math.sign(dy) * currentSpeed);
        }

        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          this.escapePath.shift();
          if (this.escapePath.length === 0) {
            this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING);
          }
        }
      } else {
        this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING);
      }
      return;
    }

    // Try planting bomb strategically with suicide prevention check
    if (this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs && dist <= 3) {
      const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
      const simulatedBombTiles = new Set(bombTiles);
      simulatedBombTiles.add(`${er},${ec}`);

      const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);

      if (safeEscape && safeEscape.length > 0) {
        const fuseMs = this.hp === 1 ? this.config.quickFuseMs : 3000;
        const placed = dropBombCallback ? dropBombCallback(er, ec, fuseMs) : false;
        if (placed) {
          this.activeBombs++;
          this.bombCooldownTimer = this.hp === 1 ? 1800 : 3500;
          this.escapePath = safeEscape;
          this.changeState(EnemyState.EVADING);
          return;
        }
      }
    }

    // Default tracking movement
    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0) {
      this.pathRecalcTimer = 250;
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
    }

    if (this.currentPath.length > 0) {
      const next = this.currentPath[0];
      const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;

      const currentSpeed = this.hp === 1 ? this.config.enragedSpeed : this.config.trackSpeed;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.setVelocity(Math.sign(dx) * currentSpeed, 0);
      } else {
        this.setVelocity(0, Math.sign(dy) * currentSpeed);
      }
    }
  }
}

/**
 * 3. TankEnemy: 4 HP, 1200ms i-frame armor, bulldozes TILE_BLOCK, ground stomp slow wave.
 */
export class TankEnemy extends BaseEntity {
  public config = ENEMY_ARCHETYPES.TANK;
  private stompTimer: number = 4500;
  private pathRecalcTimer: number = 0;
  private currentPath: GridCoord[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ENEMY,
      ENEMY_ARCHETYPES.TANK.maxHp,
      ENEMY_ARCHETYPES.TANK.name,
      'TANK',
      24,
      ENEMY_ARCHETYPES.TANK.hpBarColor
    );
    this.iFrameDurationMs = this.config.iFrameMs;
    this.moveSpeed = this.config.walkSpeed;
    this.setTint(0x64748b);
    this.setScale(1.2, 1.2);
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(28, 28).setOffset(6, 6);
    this.overheadUI.setIntent('🛡️', true);
  }

  public updateAI(
    delta: number,
    currentTime: number,
    player: Phaser.Physics.Arcade.Sprite | null,
    map: number[][],
    bombTiles: Set<string>,
    destroyBlockCallback?: (r: number, c: number) => void,
    applyStompSlowCallback?: (slowPct: number, durationMs: number) => void
  ) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);

    // Bulldoze soft blocks upon walking onto/touching them
    const checkNeighbors = [
      { r: er, c: ec },
      { r: er - 1, c: ec },
      { r: er + 1, c: ec },
      { r: er, c: ec - 1 },
      { r: er, c: ec + 1 },
    ];

    for (const n of checkNeighbors) {
      if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
        if (map[n.r][n.c] === TILE_BLOCK) {
          const distPx = Phaser.Math.Distance.Between(
            this.x,
            this.y,
            n.c * TILE_SIZE + TILE_SIZE / 2,
            n.r * TILE_SIZE + TILE_SIZE / 2
          );
          if (distPx < 28) {
            map[n.r][n.c] = TILE_EMPTY;
            if (destroyBlockCallback) {
              destroyBlockCallback(n.r, n.c);
            }
          }
        }
      }
    }

    // Ground stomp slow pulse
    this.stompTimer -= delta;
    if (this.stompTimer <= 0) {
      this.stompTimer = 5000;
      this.overheadUI.setIntent('💥', true);

      if (player && player.active) {
        const pr = Math.floor(player.y / TILE_SIZE);
        const pc = Math.floor(player.x / TILE_SIZE);
        const dist = Math.abs(er - pr) + Math.abs(ec - pc);
        if (dist <= 4 && applyStompSlowCallback) {
          applyStompSlowCallback(this.config.stompSlowPct, this.config.stompDurationMs);
        }
      }

      if (this.scene) {
        this.scene.time.delayedCall(1200, () => {
          if (this.active && !this.isDead) {
            this.overheadUI.setIntent('🛡️', true);
          }
        });
      }
    }

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    // Pathfinding directly towards player (treating blocks as passable since Tank crushes them)
    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0) {
      this.pathRecalcTimer = 350;
      const bulldozerMap = map.map((row) =>
        row.map((t) => (t === TILE_BLOCK ? TILE_EMPTY : t))
      );
      const pr = Math.floor(player.y / TILE_SIZE);
      const pc = Math.floor(player.x / TILE_SIZE);
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, bulldozerMap, bombTiles);
    }

    if (this.currentPath.length > 0) {
      const next = this.currentPath[0];
      const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.setVelocity(Math.sign(dx) * this.config.walkSpeed, 0);
      } else {
        this.setVelocity(0, Math.sign(dy) * this.config.walkSpeed);
      }
    }
  }
}

/**
 * 4. GhostEnemy: 1 HP, phases through TILE_BLOCK, ether dash towards player, materializes for 1500ms.
 */
export class GhostEnemy extends BaseEntity {
  public config = ENEMY_ARCHETYPES.GHOST;
  private pathRecalcTimer: number = 0;
  private dashCooldownTimer: number = 4000;
  private isMaterialized: boolean = false;
  private materializeUntil: number = 0;
  private currentPath: GridCoord[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ENEMY,
      ENEMY_ARCHETYPES.GHOST.maxHp,
      ENEMY_ARCHETYPES.GHOST.name,
      'GHOST',
      24,
      ENEMY_ARCHETYPES.GHOST.hpBarColor
    );
    this.moveSpeed = this.config.phaseSpeed;
    this.setTint(0x67e8f9);
    this.setAlpha(0.65);
    this.overheadUI.setIntent('👻', true);
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

    if (this.isMaterialized) {
      if (currentTime >= this.materializeUntil) {
        this.isMaterialized = false;
        this.setAlpha(0.65);
        this.overheadUI.setIntent('👻', true);
      }
    }

    this.dashCooldownTimer -= delta;

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);
    const pr = Math.floor(player.y / TILE_SIZE);
    const pc = Math.floor(player.x / TILE_SIZE);
    const dist = Math.abs(er - pr) + Math.abs(ec - pc);

    // Ghost pathfinding: Treats TILE_BLOCK as passable, but halts at TILE_WALL
    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0) {
      this.pathRecalcTimer = 250;
      const ghostMap = map.map((row) =>
        row.map((t) => (t === TILE_BLOCK ? TILE_EMPTY : t))
      );
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, ghostMap, bombTiles);
    }

    // Ether dash if close and off cooldown
    if (!this.isMaterialized && this.dashCooldownTimer <= 0 && dist <= 4) {
      this.dashCooldownTimer = 5000;
      this.isMaterialized = true;
      this.materializeUntil = currentTime + this.config.materializeDelayMs;
      this.setAlpha(1.0);
      this.overheadUI.setIntent('⚡', true);

      const dx = player.x - this.x;
      const dy = player.y - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.setVelocity(Math.sign(dx) * this.config.dashSpeed, 0);
      } else {
        this.setVelocity(0, Math.sign(dy) * this.config.dashSpeed);
      }
      return;
    }

    if (this.currentPath.length > 0) {
      const next = this.currentPath[0];
      const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;

      const speed = this.isMaterialized ? this.config.phaseSpeed * 0.7 : this.config.phaseSpeed;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.setVelocity(Math.sign(dx) * speed, 0);
      } else {
        this.setVelocity(0, Math.sign(dy) * speed);
      }
    }
  }
}

/**
 * 5. SplitterEnemy: 2 HP parent, upon defeat spawns 2 fast mini-slimes at adjacent open tiles.
 */
export class SplitterEnemy extends BaseEntity {
  public config = ENEMY_ARCHETYPES.SPLITTER;
  public spawnedMinis: MiniSplitterEnemy[] = [];
  private pathRecalcTimer: number = 0;
  private currentPath: GridCoord[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ENEMY,
      ENEMY_ARCHETYPES.SPLITTER.maxHp,
      ENEMY_ARCHETYPES.SPLITTER.name,
      'SPLITTER',
      24,
      ENEMY_ARCHETYPES.SPLITTER.hpBarColor
    );
    this.moveSpeed = this.config.parentSpeed;
    this.setTint(0x22c55e);
    this.setScale(1.15, 1.15);
    this.overheadUI.setIntent('🟢', true);
  }

  protected override onDeath(_currentTime?: number): void {
    void _currentTime;
    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);

    if (this.scene) {
      const leftC = Math.max(1, ec - 1);
      const rightC = Math.min(COLS - 2, ec + 1);

      const mini1 = new MiniSplitterEnemy(
        this.scene,
        leftC * TILE_SIZE + TILE_SIZE / 2,
        er * TILE_SIZE + TILE_SIZE / 2
      );
      const mini2 = new MiniSplitterEnemy(
        this.scene,
        rightC * TILE_SIZE + TILE_SIZE / 2,
        er * TILE_SIZE + TILE_SIZE / 2
      );

      this.spawnedMinis = [mini1, mini2];

      const enemyGroup = (this.scene as unknown as { enemies?: Phaser.Physics.Arcade.Group }).enemies;
      if (enemyGroup) {
        enemyGroup.add(mini1);
        enemyGroup.add(mini2);
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

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);
    const pr = Math.floor(player.y / TILE_SIZE);
    const pc = Math.floor(player.x / TILE_SIZE);

    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0) {
      this.pathRecalcTimer = 300;
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
    }

    if (this.currentPath.length > 0) {
      const next = this.currentPath[0];
      const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.setVelocity(Math.sign(dx) * this.config.parentSpeed, 0);
      } else {
        this.setVelocity(0, Math.sign(dy) * this.config.parentSpeed);
      }
    }
  }
}

/**
 * Mini-Slime spawned by SplitterEnemy upon defeat.
 */
export class MiniSplitterEnemy extends BaseEntity {
  public config = {
    ...ENEMY_ARCHETYPES.SPLITTER,
    maxHp: 1,
    trackSpeed: 100,
    name: 'Splitter: Mini',
  };
  private pathRecalcTimer: number = 0;
  private currentPath: GridCoord[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string = 'enemy') {
    super(
      scene,
      x,
      y,
      texture,
      FACTIONS.ENEMY,
      1,
      'Splitter: Mini',
      'SPLITTER_MINI',
      16,
      ENEMY_ARCHETYPES.SPLITTER.hpBarColor
    );
    this.moveSpeed = 100;
    this.setTint(0x84cc16);
    this.setScale(0.7, 0.7);
    (this.body as Phaser.Physics.Arcade.Body)?.setSize(18, 18).setOffset(11, 11);
    this.overheadUI.setIntent('🟢', true);
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

    if (!player || !player.active) {
      this.setVelocity(0, 0);
      return;
    }

    const er = Math.floor(this.y / TILE_SIZE);
    const ec = Math.floor(this.x / TILE_SIZE);
    const pr = Math.floor(player.y / TILE_SIZE);
    const pc = Math.floor(player.x / TILE_SIZE);

    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0) {
      this.pathRecalcTimer = 180;
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
    }

    if (this.currentPath.length > 0) {
      const next = this.currentPath[0];
      const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
      const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.setVelocity(Math.sign(dx) * this.config.trackSpeed, 0);
      } else {
        this.setVelocity(0, Math.sign(dy) * this.config.trackSpeed);
      }
    }
  }
}
