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
  findTargetBlockBFS,
  findCorneringBombTile,
} from '../pathfinding';

/**
 * Enemy AI States
 */
export const EnemyState = {
  IDLE: 'IDLE',
  PATROL: 'PATROL',
  TRACKING: 'TRACKING',
  HUNTING: 'HUNTING',
  WINDUP: 'WINDUP',
  ATTACK: 'ATTACK',
  COOLDOWN: 'COOLDOWN',
  EVADING: 'EVADING',
  ENRAGED: 'ENRAGED',
  PHASING: 'PHASING',
  MATERIALIZED: 'MATERIALIZED',
} as const;

export type EnemyState = typeof EnemyState[keyof typeof EnemyState];

/**
 * 1. ChaserEnemy: High speed, 350ms telegraph windup before 240 px/s corridor dash, 900ms stun on wall impact.
 */
export class ChaserEnemy extends BaseEntity {
  public aiState: EnemyState = EnemyState.PATROL;
  public config = ENEMY_ARCHETYPES.CHASER;

  public canDropBombs: boolean = true;
  public activeBombs: number = 0;
  public maxBombs: number = 1;
  public bombCooldownTimer: number = 2000;
  public bombPower: number = 2;
  public escapePath: GridCoord[] = [];
  public evadeTimeoutMs: number = 0;

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
      case EnemyState.EVADING:
        this.overheadUI.setIntent('💨', true);
        this.evadeTimeoutMs = 2500;
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

  public onBombExploded(): void {
    if (this.activeBombs > 0) {
      this.activeBombs--;
    }
    if (this.aiState === EnemyState.EVADING && this.activeBombs === 0) {
      this.escapePath = [];
      this.changeState(EnemyState.TRACKING);
    }
  }

  public updateAI(
    delta: number,
    currentTime: number,
    player: Phaser.Physics.Arcade.Sprite | null,
    map: number[][],
    bombTiles: Set<string>,
    dropBombCallback?: (r: number, c: number, fuseMs?: number) => boolean
  ) {
    if (this.isDead || !this.active) return;
    this.updateEntity(delta, currentTime);

    this.bombCooldownTimer -= delta;

    // AI-03: Unified stun & cooldown state recovery in exactly config.stunMs (900ms)
    if (this.isStunned || this.aiState === EnemyState.COOLDOWN) {
      this.stateTimer -= delta;
      if (currentTime >= this.stunUntil || this.stateTimer <= 0) {
        this.isStunned = false;
        this.changeState(EnemyState.TRACKING);
      }
      return;
    }

    if (this.aiState === EnemyState.EVADING) {
      this.evadeTimeoutMs -= delta;
      if (this.evadeTimeoutMs <= 0) {
        this.escapePath = [];
        this.changeState(EnemyState.TRACKING);
        return;
      }

      if (this.escapePath.length > 0) {
        const next = this.escapePath[0];
        const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
        const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          this.setVelocity(Math.sign(dx) * this.config.trackSpeed, 0);
        } else {
          this.setVelocity(0, Math.sign(dy) * this.config.trackSpeed);
        }

        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          this.escapePath.shift();
          if (this.escapePath.length === 0) {
            this.setVelocity(0, 0);
          }
        }
      } else {
        this.setVelocity(0, 0);
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
    const dist = Math.abs(er - pr) + Math.abs(ec - pc);

    switch (this.aiState) {
      case EnemyState.TRACKING:
      case EnemyState.HUNTING: {
        // Line-of-sight check for corridor charge
        if ((er === pr || ec === pc) && dist <= 4) {
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

        const hasDirectPath =
          this.currentPath.length > 0 &&
          this.currentPath[this.currentPath.length - 1].r === pr &&
          this.currentPath[this.currentPath.length - 1].c === pc;

        if (hasDirectPath) {
          // Offensive Cornering / Trap Bombing (R2):
          if (
            this.canDropBombs &&
            this.bombCooldownTimer <= 0 &&
            this.activeBombs < this.maxBombs &&
            dist <= 2
          ) {
            const trapTile = findCorneringBombTile({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
            if (trapTile && trapTile.r === er && trapTile.c === ec) {
              const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
              const simulatedBombTiles = new Set(bombTiles);
              simulatedBombTiles.add(`${er},${ec}`);
              const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);
              if (safeEscape && safeEscape.length > 0) {
                const placed = dropBombCallback ? dropBombCallback(er, ec, 2000) : false;
                if (placed) {
                  this.activeBombs++;
                  this.bombCooldownTimer = 2500;
                  this.escapePath = safeEscape;
                  this.changeState(EnemyState.EVADING);
                  return;
                }
              }
            }
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
        } else {
          // Path to player is blocked by soft blocks: Aggressive Demolition (R1)!
          const demoTarget = findTargetBlockBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
          if (demoTarget) {
            const { targetBlock, approachTile } = demoTarget;
            const isAtApproach = er === approachTile.r && ec === approachTile.c;
            const isAdjacentToBlock = Math.abs(er - targetBlock.r) + Math.abs(ec - targetBlock.c) === 1;

            if (
              (isAtApproach || isAdjacentToBlock) &&
              this.canDropBombs &&
              this.bombCooldownTimer <= 0 &&
              this.activeBombs < this.maxBombs
            ) {
              const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
              const simulatedBombTiles = new Set(bombTiles);
              simulatedBombTiles.add(`${er},${ec}`);
              const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);

              if (safeEscape && safeEscape.length > 0) {
                const placed = dropBombCallback ? dropBombCallback(er, ec, 2000) : false;
                if (placed) {
                  this.activeBombs++;
                  this.bombCooldownTimer = 2500;
                  this.escapePath = safeEscape;
                  this.changeState(EnemyState.EVADING);
                  return;
                }
              }
            }

            if (!isAtApproach) {
              const pathToApproach = findPathBFS({ r: er, c: ec }, approachTile, map, bombTiles);
              if (pathToApproach.length > 0) {
                const next = pathToApproach[0];
                const targetX = next.c * TILE_SIZE + TILE_SIZE / 2;
                const targetY = next.r * TILE_SIZE + TILE_SIZE / 2;
                const dx = targetX - this.x;
                const dy = targetY - this.y;

                if (Math.abs(dx) > Math.abs(dy)) {
                  this.setVelocity(Math.sign(dx) * this.config.trackSpeed, 0);
                } else {
                  this.setVelocity(0, Math.sign(dy) * this.config.trackSpeed);
                }
                return;
              }
            }
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
          } else {
            this.setVelocity(0, 0);
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
  public evadeTimeoutMs: number = 0;

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
        this.evadeTimeoutMs = 2500; // AI-04: 2500ms evasion watchdog
        break;
      case EnemyState.ENRAGED:
        this.overheadUI.setIntent('😈', true);
        this.moveSpeed = this.config.enragedSpeed;
        this.setTint(0xec4899);
        break;
    }
  }

  public onBombExploded(): void {
    if (this.activeBombs > 0) {
      this.activeBombs--;
    }
    if (this.aiState === EnemyState.EVADING && this.activeBombs === 0) {
      this.escapePath = [];
      this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING);
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
      // AI-04: Watchdog timeout to prevent evasion deadlock
      this.evadeTimeoutMs -= delta;
      if (this.evadeTimeoutMs <= 0) {
        this.escapePath = [];
        this.changeState(this.hp === 1 ? EnemyState.ENRAGED : EnemyState.HUNTING);
        return;
      }

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
            this.setVelocity(0, 0);
          }
        }
      } else {
        this.setVelocity(0, 0);
      }
      return;
    }

    // Update pathfinding towards player
    this.pathRecalcTimer -= delta;
    if (this.pathRecalcTimer <= 0) {
      this.pathRecalcTimer = 250;
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
    }

    const hasDirectPath =
      this.currentPath.length > 0 &&
      this.currentPath[this.currentPath.length - 1].r === pr &&
      this.currentPath[this.currentPath.length - 1].c === pc;

    if (hasDirectPath) {
      // Offensive Bombing & Cornering (R2):
      // When close to player (dist <= 2 or dist <= 3 in corridor/corner)
      const trapTile = findCorneringBombTile({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
      const isAtTrapTile = trapTile !== null && trapTile.r === er && trapTile.c === ec;
      if (
        this.bombCooldownTimer <= 0 &&
        this.activeBombs < this.maxBombs &&
        (dist <= this.bombPower || isAtTrapTile)
      ) {
        const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
        const simulatedBombTiles = new Set(bombTiles);
        simulatedBombTiles.add(`${er},${ec}`);

        const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);

        if (safeEscape && safeEscape.length > 0) {
          const fuseMs = this.hp === 1 ? this.config.quickFuseMs : 2500;
          const placed = dropBombCallback ? dropBombCallback(er, ec, fuseMs) : false;
          if (placed) {
            this.activeBombs++;
            this.bombCooldownTimer = this.hp === 1 ? 1800 : 3000;
            this.escapePath = safeEscape;
            this.changeState(EnemyState.EVADING);
            return;
          }
        }
      }

      // Follow direct path towards player
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
    } else {
      // Blocked by soft blocks: Aggressive Territory Expansion & Demolition (R1)!
      const demoTarget = findTargetBlockBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles);
      if (demoTarget) {
        const { targetBlock, approachTile } = demoTarget;
        const isAtApproach = er === approachTile.r && ec === approachTile.c;
        const isAdjacentToBlock = Math.abs(er - targetBlock.r) + Math.abs(ec - targetBlock.c) === 1;

        if (
          (isAtApproach || isAdjacentToBlock) &&
          this.bombCooldownTimer <= 0 &&
          this.activeBombs < this.maxBombs
        ) {
          const dangerTiles = getBlastTiles({ r: er, c: ec }, this.bombPower, map);
          const simulatedBombTiles = new Set(bombTiles);
          simulatedBombTiles.add(`${er},${ec}`);
          const safeEscape = findEscapePathBFS({ r: er, c: ec }, dangerTiles, map, simulatedBombTiles, 4);

          if (safeEscape && safeEscape.length > 0) {
            const fuseMs = this.hp === 1 ? this.config.quickFuseMs : 2500;
            const placed = dropBombCallback ? dropBombCallback(er, ec, fuseMs) : false;
            if (placed) {
              this.activeBombs++;
              this.bombCooldownTimer = this.hp === 1 ? 1800 : 3000;
              this.escapePath = safeEscape;
              this.changeState(EnemyState.EVADING);
              return;
            }
          }
        }

        if (!isAtApproach) {
          const pathToApproach = findPathBFS({ r: er, c: ec }, approachTile, map, bombTiles);
          if (pathToApproach.length > 0) {
            const next = pathToApproach[0];
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
            return;
          }
        }
      }

      // Fallback: move along whatever currentPath exists
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
      } else {
        this.setVelocity(0, 0);
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
      const pr = Math.floor(player.y / TILE_SIZE);
      const pc = Math.floor(player.x / TILE_SIZE);
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles, true);
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
  public isDashing: boolean = false;
  public dashRemainingMs: number = 0;
  public dashDir: { x: number; y: number } = { x: 0, y: 0 };

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
      this.currentPath = findPathBFS({ r: er, c: ec }, { r: pr, c: pc }, map, bombTiles, true);
    }

    // AI-05: Ether dash if close and off cooldown
    if (!this.isMaterialized && !this.isDashing && this.dashCooldownTimer <= 0 && dist <= 4) {
      this.dashCooldownTimer = 5000;
      this.isMaterialized = true;
      this.materializeUntil = currentTime + this.config.materializeDelayMs;
      this.isDashing = true;
      this.dashRemainingMs = 450; // 450ms dash duration
      this.setAlpha(1.0);
      this.overheadUI.setIntent('⚡', true);

      const dx = player.x - this.x;
      const dy = player.y - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.dashDir = { x: Math.sign(dx), y: 0 };
      } else {
        this.dashDir = { x: 0, y: Math.sign(dy) };
      }
      this.setVelocity(this.dashDir.x * this.config.dashSpeed, this.dashDir.y * this.config.dashSpeed);
      return;
    }

    // AI-05: Maintain dash velocity across entire dash duration
    if (this.isDashing) {
      this.dashRemainingMs -= delta;
      if (this.dashRemainingMs <= 0) {
        this.isDashing = false;
      } else {
        this.setVelocity(this.dashDir.x * this.config.dashSpeed, this.dashDir.y * this.config.dashSpeed);
        return;
      }
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
      // AI-08: Check tile validity and map emptiness before placing mini-slimes
      const map = (this.scene as unknown as { map?: number[][] }).map;
      const candidates: { r: number; c: number }[] = [
        { r: er, c: ec - 1 },
        { r: er, c: ec + 1 },
        { r: er - 1, c: ec },
        { r: er + 1, c: ec },
        { r: er - 1, c: ec - 1 },
        { r: er - 1, c: ec + 1 },
        { r: er + 1, c: ec - 1 },
        { r: er + 1, c: ec + 1 },
      ];

      const validTiles = candidates.filter((pt) => {
        if (pt.r < 1 || pt.r >= ROWS - 1 || pt.c < 1 || pt.c >= COLS - 1) return false;
        if (!map) return true;
        return map[pt.r]?.[pt.c] === TILE_EMPTY;
      });

      const p1 = validTiles[0] || { r: er, c: ec };
      const p2 = validTiles[1] || validTiles[0] || { r: er, c: ec };

      const mini1 = new MiniSplitterEnemy(
        this.scene,
        p1.c * TILE_SIZE + TILE_SIZE / 2,
        p1.r * TILE_SIZE + TILE_SIZE / 2
      );
      const mini2 = new MiniSplitterEnemy(
        this.scene,
        p2.c * TILE_SIZE + TILE_SIZE / 2,
        p2.r * TILE_SIZE + TILE_SIZE / 2
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
