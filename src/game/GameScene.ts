import Phaser from 'phaser';
import {
  TILE_SIZE as PATH_TILE_SIZE,
  ROWS as PATH_ROWS,
  COLS as PATH_COLS,
  TILE_EMPTY as PATH_TILE_EMPTY,
  TILE_WALL as PATH_TILE_WALL,
  TILE_BLOCK as PATH_TILE_BLOCK,
  type GridCoord,
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
  FlatHazardMask,
} from './pathfinding';
import {
  type PlayerStats,
  type ItemType,
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
  type ConveyorConfig,
  rollItemDrop,
  applyItemEffect,
  isItemProtectedFromExplosion,
  ITEM_DEFINITIONS,
  type ActiveBuff,
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
  type EnemyType,
  type NeutralType,
  type AllyType,
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
  OverheadUI,
  RENDER_DEPTH,
  applyPhysicsBodyInvariantGuard,
} from './entities';

export * from './entities';

import {
  ULTIMATE_SKILLS,
  CHARGE_VALUES,
  type UltimateSkillId,
  type UltimateSkillDefinition,
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
import {
  CrisisManager,
  CrisisType,
  CrisisStage,
  HazardType,
  SituationLog,
} from './crises/index.ts';

export { RENDER_DEPTH };

export interface DeclutterEntity {
  x: number;
  y: number;
  active: boolean;
  isDead?: boolean;
  setDepth?(depth: number): unknown;
  overheadUI: OverheadUI;
}

export class OverheadUIManager {
  /**
   * Centralized decluttering and dynamic depth coordinator:
   * 1. Dynamic continuous 2.5D Y-sorting depth pass.
   * 2. Adaptive Name Tag LOD (Solo: full, Clustered: compact, Dense melee: minimal/hidden).
   * 3. AABB overlap detection with horizontal spring repulsion (+/- dx/2) and vertical staggering.
   * 4. Player protection bubble (R = 38px, alpha = 0.15 or 0 if <= 20px) with smooth exponential lerp.
   */
  public update(
    entities: DeclutterEntity[],
    player: { x: number; y: number } | null,
    delta: number = 16,
    immediate: boolean = false
  ): void {
    const active = entities.filter(
      (e) => e && e.active && !e.isDead && e.overheadUI && !e.overheadUI.isDestroyed
    );

    // 1. Unified 2.5D dynamic Y-sorting depth pass
    for (const entity of active) {
      const baseDepth = RENDER_DEPTH.ENTITY_Y_BASE + entity.y * RENDER_DEPTH.ENTITY_Y_SCALE;
      if (typeof entity.setDepth === 'function') {
        entity.setDepth(baseDepth + RENDER_DEPTH.OFFSET_SPRITE);
      }
      entity.overheadUI.setDepth(baseDepth);
    }

    const playerObj = player as unknown as { setDepth?: (d: number) => unknown } | null | undefined;
    if (player && playerObj && typeof playerObj.setDepth === 'function') {
      const playerBaseDepth = RENDER_DEPTH.ENTITY_Y_BASE + player.y * RENDER_DEPTH.ENTITY_Y_SCALE;
      playerObj.setDepth(playerBaseDepth + RENDER_DEPTH.OFFSET_SPRITE);
    }

    // 2. Adaptive Name Tag LOD calculation
    // Solo mode (d > 70px): full name
    // Clustered mode (d <= 70px): compact nickname
    // Dense melee mode (3+ entities within 60px): minimal (hide text tag, HP & intent only)
    for (let i = 0; i < active.length; i++) {
      const eA = active[i];
      let minDistance = Infinity;
      let countWithin60 = 0;

      for (let j = 0; j < active.length; j++) {
        if (i === j) continue;
        const eB = active[j];
        const dist = Math.hypot(eA.x - eB.x, eA.y - eB.y);
        if (dist < minDistance) {
          minDistance = dist;
        }
        if (dist <= 60) {
          countWithin60++;
        }
      }

      if (player) {
        const distP = Math.hypot(eA.x - player.x, eA.y - player.y);
        if (distP < minDistance) {
          minDistance = distP;
        }
        if (distP <= 60) {
          countWithin60++;
        }
      }

      if (countWithin60 >= 2) {
        eA.overheadUI.setLODMode('minimal');
      } else if (minDistance <= 70) {
        eA.overheadUI.setLODMode('compact');
      } else {
        eA.overheadUI.setLODMode('full');
      }
    }

    // 3. AABB Collision Detection, Horizontal Spring Repulsion & Vertical Staggering
    const offsetsX = new Float32Array(active.length);
    const offsetsY = new Float32Array(active.length);

    for (let i = 0; i < active.length; i++) {
      const eA = active[i];
      for (let j = i + 1; j < active.length; j++) {
        const eB = active[j];
        const dx = Math.abs(eA.x - eB.x);
        const dy = Math.abs(eA.y - eB.y);

        const widthA =
          eA.overheadUI.lodMode === 'minimal' ? 24 : eA.overheadUI.lodMode === 'compact' ? 44 : 88;
        const widthB =
          eB.overheadUI.lodMode === 'minimal' ? 24 : eB.overheadUI.lodMode === 'compact' ? 44 : 88;
        const requiredW = (widthA + widthB) / 2 + 4;
        const requiredH = 16;

        if (dx < requiredW && dy < requiredH) {
          // Label overlap detected!
          if (dx >= 24) {
            // Horizontal spring repulsion
            const overlapX = requiredW - dx;
            const shift = overlapX / 2;
            if (eA.x < eB.x) {
              offsetsX[i] -= shift;
              offsetsX[j] += shift;
            } else if (eA.x > eB.x) {
              offsetsX[i] += shift;
              offsetsX[j] += shift;
            } else {
              offsetsX[i] -= shift;
              offsetsX[j] += shift;
            }
          } else {
            // Tightly stacked horizontally (dx < 24px) -> vertical staggering!
            // Northern entity gets elevated tier (-14px), Southern entity under-foot (+46px -> y + 24)
            if (eA.y <= eB.y) {
              offsetsY[i] = -14;
              offsetsY[j] = 46;
            } else {
              offsetsY[i] = 46;
              offsetsY[j] = -14;
            }
          }
        }
      }
    }

    // Clamp horizontal offsets to arena boundaries
    for (let i = 0; i < active.length; i++) {
      const entity = active[i];
      const intendedX = entity.x + offsetsX[i];
      if (intendedX < 20) {
        offsetsX[i] = 20 - entity.x;
      } else if (intendedX > 600 - 20) {
        offsetsX[i] = (600 - 20) - entity.x;
      }
    }

    // 4. Player Protection Bubble (R = 38px)
    for (let i = 0; i < active.length; i++) {
      const entity = active[i];
      const ox = offsetsX[i];
      const oy = offsetsY[i];

      let targetAlpha = 1.0;
      if (player) {
        const lx = entity.x + ox;
        const ly = entity.y - 22 + oy;
        const distLabel = Math.hypot(lx - player.x, ly - player.y);
        const distBody = Math.hypot(entity.x - player.x, entity.y - player.y);
        const effectiveDist = Math.min(distLabel, distBody);

        if (effectiveDist <= 20) {
          targetAlpha = 0.0;
        } else if (effectiveDist <= 38) {
          targetAlpha = Math.min(0.15, 0.15 * ((effectiveDist - 20) / (38 - 20)));
        }
      }

      let alpha: number;
      if (!immediate && delta > 0) {
        const lerpFactor = Math.min(1.0, delta * 0.015);
        alpha = entity.overheadUI.currentAlpha + (targetAlpha - entity.overheadUI.currentAlpha) * lerpFactor;
      } else {
        alpha = targetAlpha;
      }

      entity.overheadUI.setAlpha(alpha);
      entity.overheadUI.setCustomOffsets(ox, oy);
    }
  }
}

export interface ActiveFloatingText {
  x: number;
  y: number;
  spawnTime: number;
}

export class FloatingTextManager {
  private activeTexts: ActiveFloatingText[] = [];
  private head: number = 0;

  public getCascadeOffset(x: number, y: number, currentTime: number): number {
    const cutoff = currentTime - 450;
    const len = this.activeTexts.length;
    while (this.head < len && this.activeTexts[this.head].spawnTime < cutoff) {
      this.head++;
    }

    // Reset buffer if all expired
    if (this.head >= len) {
      this.activeTexts.length = 0;
      this.head = 0;
    } else if (this.head > 128) {
      this.activeTexts = this.activeTexts.slice(this.head);
      this.head = 0;
    }

    const currentHead = this.head;
    const currentLen = this.activeTexts.length;
    let nearbyCount = 0;
    for (let i = currentHead; i < currentLen; i++) {
      const item = this.activeTexts[i];
      const dx = item.x - x;
      const dy = item.y - y;
      if (dx * dx + dy * dy <= 900) {
        nearbyCount++;
      }
    }

    const offset = nearbyCount * 16;
    this.activeTexts.push({ x, y, spawnTime: currentTime });
    return offset;
  }

  public registerSpawn(x: number, y: number, currentTime: number): number {
    return this.getCascadeOffset(x, y, currentTime);
  }

  public getActiveCount(): number {
    return Math.max(0, this.activeTexts.length - this.head);
  }

  public reset(): void {
    this.activeTexts.length = 0;
    this.head = 0;
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
  public overheadUIManager!: OverheadUIManager;
  public floatingTextManager!: FloatingTextManager;


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

  // Crisis Subsystem Integration
  public crisisManager: CrisisManager = new CrisisManager();
  public situationLog: SituationLog | null = null;
  public crisisGraphics: Phaser.GameObjects.Graphics | null = null;

  // Juice & Polish Engine
  public dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  public bombSparkEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  public blockDebrisEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  public playerDropShadow?: Phaser.GameObjects.Sprite;
  public playerStepCycle: number = 0;
  public playerBobOffset: number = 0;
  private lastHitStopMs: number = 0;
  public isHitStopActive: boolean = false;
  public baseScrollX: number = -100;
  public baseScrollY: number = -40;

  public triggerHitStop(durationMs: number = 40): void {
    const now = this.time ? this.time.now : Date.now();
    if (this.isHitStopActive || now - this.lastHitStopMs < 150) return;
    this.isHitStopActive = true;
    this.lastHitStopMs = now;

    if (this.physics && this.physics.world) {
      this.physics.world.pause();
      if (this.time && this.time.delayedCall) {
        this.time.delayedCall(durationMs, () => {
          if (this.physics && this.physics.world) {
            this.physics.world.resume();
          }
          this.isHitStopActive = false;
        });
      } else {
        setTimeout(() => {
          if (this.physics && this.physics.world) {
            this.physics.world.resume();
          }
          this.isHitStopActive = false;
        }, durationMs);
      }
    }
  }

  public attachEntityDropShadow(entity: BaseEntity): void {
    if (this.textures && this.textures.exists('shadow_ellipse')) {
      const shadow = this.add.sprite(entity.x, entity.y + 14, 'shadow_ellipse');
      shadow.setDepth(6);
      shadow.setAlpha(0.45);
      shadow.setScale(1.0, 0.7);
      entity.dropShadow = shadow;
    }
  }

  public updatePlayerJuice(delta: number, currentTime: number): void {
    if (!this.player || !this.player.active) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    const vx = body ? body.velocity.x : 0;
    const vy = body ? body.velocity.y : 0;
    const isMoving = Math.abs(vx) > 1 || Math.abs(vy) > 1;

    if (isMoving && !this.isGameOver) {
      const speedMag = Math.hypot(vx, vy);
      this.playerStepCycle += (delta / 1000) * (speedMag / 22);
      // 0 to 3px vertical hop
      const hop = Math.abs(Math.sin(this.playerStepCycle * Math.PI)) * 3;
      this.playerBobOffset = hop;
      this.player.displayOriginY = 20 - hop;

      // Footstep squash/stretch: 1.08/0.92 at ground, 0.94/1.06 at apex
      const apexNorm = hop / 3;
      const sx = 1.08 - 0.14 * apexNorm;
      const sy = 0.92 + 0.14 * apexNorm;
      this.player.setScale(sx, sy);

      // Motion tilt (3.5 degrees)
      if (vx !== 0) {
        this.player.setAngle(Math.sign(vx) * 3.5);
      } else {
        this.player.setAngle(0);
      }

      // Walking dust emitter
      if (this.dustEmitter && Math.random() < 0.12) {
        this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 14, 1);
      }
    } else {
      this.playerBobOffset = 0;
      this.player.displayOriginY = 20;
      this.player.setAngle(0);
      if (!this.isGameOver) {
        const breathe = Math.sin(currentTime * 0.003) * 0.02;
        this.player.setScale(1.0 - breathe, 1.0 + breathe);
      }
    }

    // Dynamic drop shadow under player (depth 6) with height modulation
    if (this.playerDropShadow && this.playerDropShadow.active) {
      this.playerDropShadow.x = this.player.x;
      this.playerDropShadow.y = this.player.y + 14;
      const hNorm = Math.max(0, this.playerBobOffset) / 20;
      this.playerDropShadow.setScale(Math.max(0.4, 1.0 - hNorm * 0.25), Math.max(0.3, 0.7 - hNorm * 0.2));
      this.playerDropShadow.setAlpha(Math.max(0.15, 0.45 - hNorm * 0.20));
      this.playerDropShadow.setDepth(6);
    }
  }

  private onModeChanged = (mode: string) => {
    const normalized = (mode || '').toLowerCase();
    if (normalized === 'boss_rush') {
      this.stopCrisisMode();
      this.startBossEncounter('king_gummy_bear');
    } else if (normalized === 'crisis_survival') {
      this.dismissBoss();
      this.startCrisisMode(CrisisType.PASTEL_VOID);
    } else {
      if (this.activeBoss) {
        this.dismissBoss();
      }
      this.stopCrisisMode();
    }
  };

  public startCrisisMode(type: CrisisType = CrisisType.PASTEL_VOID): void {
    this.stopCrisisMode();
    this.crisisManager.triggerCrisis(type);
    if (this.situationLog) {
      this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now(), true);
    }
  }

  public stopCrisisMode(): void {
    if (this.crisisManager) {
      this.crisisManager.stopCrisis('reset');
    }
    if (this.situationLog) {
      this.situationLog.reset();
    }
    if (this.crisisGraphics) {
      this.crisisGraphics.clear();
    }
  }


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
    this.stopCrisisMode();
    this.floatingTextManager?.reset();
    if (this.playerDropShadow) {
      this.playerDropShadow.destroy();
      this.playerDropShadow = undefined;
    }
    if (this.dustEmitter) {
      this.dustEmitter.destroy();
      this.dustEmitter = undefined;
    }
    if (this.bombSparkEmitter) {
      this.bombSparkEmitter.destroy();
      this.bombSparkEmitter = undefined;
    }
    if (this.blockDebrisEmitter) {
      this.blockDebrisEmitter.destroy();
      this.blockDebrisEmitter = undefined;
    }
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

  private checkBodiesOverlap(
    b1?: Phaser.Physics.Arcade.Body | null,
    b2?: Phaser.Physics.Arcade.Body | null
  ): boolean {
    if (!b1 || !b2) return false;
    return !(b2.x >= b1.right || b2.right <= b1.x || b2.y >= b1.bottom || b2.bottom <= b1.y);
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
    this.overheadUIManager = new OverheadUIManager();
    this.floatingTextManager = new FloatingTextManager();
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

    // Generate procedural textures for items and juice
    this.generateItemTextures();
    this.ensureJuiceTextures();

    // Pre-allocate Zero-GC particle emitters
    if (this.add && this.add.particles && this.textures.exists('particle_dust')) {
      try {
        this.dustEmitter = this.add.particles(0, 0, 'particle_dust', {
          lifespan: 220,
          speed: { min: 15, max: 35 },
          scale: { start: 0.7, end: 0.1 },
          alpha: { start: 0.45, end: 0 },
          emitting: false,
        });
        this.dustEmitter.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
      } catch {
        // Safe headless fallback
      }
    }

    if (this.add && this.add.particles && this.textures.exists('particle_spark')) {
      try {
        this.bombSparkEmitter = this.add.particles(0, 0, 'particle_spark', {
          lifespan: { min: 100, max: 200 },
          speed: { min: 40, max: 90 },
          scale: { start: 0.9, end: 0.2 },
          alpha: { start: 1, end: 0 },
          tint: [0xffffff, 0xfde047, 0xf97316],
          blendMode: 'ADD',
          emitting: false,
        });
        this.bombSparkEmitter.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
      } catch {
        // Safe headless fallback
      }
    }

    if (this.add && this.add.particles && this.textures.exists('particle_debris')) {
      try {
        this.blockDebrisEmitter = this.add.particles(0, 0, 'particle_debris', {
          lifespan: { min: 320, max: 480 },
          speed: { min: 90, max: 180 },
          angle: { min: 0, max: 360 },
          rotate: { start: 0, end: 360 },
          scale: { start: 1.0, end: 0.2 },
          gravityY: 350,
          tint: [0xf97316, 0xc2410c, 0xb45309, 0x78350f],
          emitting: false,
        });
        this.blockDebrisEmitter.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
      } catch {
        // Safe headless fallback
      }
    }

    // Register Player Animations
    if (!this.anims.exists('player_down')) {
      this.anims.create({
        key: 'player_down',
        frames: this.anims.generateFrameNumbers('player', { frames: [0, 1, 0, 2] }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!this.anims.exists('player_up')) {
      this.anims.create({
        key: 'player_up',
        frames: this.anims.generateFrameNumbers('player', { frames: [3, 4, 3, 5] }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!this.anims.exists('player_side')) {
      this.anims.create({
        key: 'player_side',
        frames: this.anims.generateFrameNumbers('player', { frames: [6, 7, 6, 8] }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!this.anims.exists('player_defeat')) {
      this.anims.create({
        key: 'player_defeat',
        frames: this.anims.generateFrameNumbers('player', { frames: [9, 10, 11] }),
        frameRate: 6,
        repeat: 0,
      });
    }


    // Background image at (400, 300) with setScrollFactor(0) and setDepth(RENDER_DEPTH.BACKGROUND)
    const bg = this.add.image(400, 300, 'background');
    bg.setScrollFactor(0);
    bg.setDepth(RENDER_DEPTH.BACKGROUND);

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

    // Spawn player with 2.5D depth and physics size 24x24 (offset 8, 8)
    this.player = this.physics.add.sprite(
      1 * TILE_SIZE + TILE_SIZE / 2,
      1 * TILE_SIZE + TILE_SIZE / 2,
      'player'
    );
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(
      RENDER_DEPTH.ENTITY_Y_BASE + this.player.y * RENDER_DEPTH.ENTITY_Y_SCALE + RENDER_DEPTH.OFFSET_SPRITE
    );
    applyPhysicsBodyInvariantGuard(this.player, 24, 24, 8, 8);
    this.player.setFrame(0);

    // Dynamic drop shadow under player (depth 6)
    if (this.textures && this.textures.exists('shadow_ellipse')) {
      this.playerDropShadow = this.add.sprite(this.player.x, this.player.y + 14, 'shadow_ellipse');
      this.playerDropShadow.setDepth(6);
      this.playerDropShadow.setAlpha(0.45);
      this.playerDropShadow.setScale(1.0, 0.7);
    }

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
      const ignoring = b.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
      if (ignoring && ignoring.has(p)) {
        const entityBody = p.body as Phaser.Physics.Arcade.Body;
        const bombBody = b.body as Phaser.Physics.Arcade.Body;
        if (entityBody && bombBody && !this.checkBodiesOverlap(entityBody, bombBody)) {
          ignoring.delete(p);
        } else {
          return false;
        }
      }
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
      const ignoring = b.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
      if (ignoring && ignoring.has(e)) {
        const entityBody = e.body as Phaser.Physics.Arcade.Body;
        const bombBody = b.body as Phaser.Physics.Arcade.Body;
        if (entityBody && bombBody && !this.checkBodiesOverlap(entityBody, bombBody)) {
          ignoring.delete(e);
          return true;
        }
        return false;
      }
      return true;
    });

    // Neutral NPC collisions
    this.physics.add.collider(this.neutrals, this.walls);
    this.physics.add.collider(this.neutrals, this.blocks);
    this.physics.add.collider(this.neutrals, this.bombs, undefined, (neutralObj, bombObj) => {
      const n = neutralObj as Phaser.Physics.Arcade.Sprite;
      const b = bombObj as Phaser.Physics.Arcade.Sprite;
      const ignoring = b.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
      if (ignoring && ignoring.has(n)) {
        const entityBody = n.body as Phaser.Physics.Arcade.Body;
        const bombBody = b.body as Phaser.Physics.Arcade.Body;
        if (entityBody && bombBody && !this.checkBodiesOverlap(entityBody, bombBody)) {
          ignoring.delete(n);
          return true;
        }
        return false;
      }
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
      const ignoring = b.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
      if (ignoring && ignoring.has(a)) {
        const entityBody = a.body as Phaser.Physics.Arcade.Body;
        const bombBody = b.body as Phaser.Physics.Arcade.Body;
        if (entityBody && bombBody && !this.checkBodiesOverlap(entityBody, bombBody)) {
          ignoring.delete(a);
          return true;
        }
        return false;
      }
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
      const enemy = enemyObj as BaseEntity;
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
        const enemy = enemyObj as BaseEntity;
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
      const target = enemyObj as BaseEntity;
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
        // Guarantee at least 2 open orthogonal corridor neighbors (prevent spawn dead-end locks)
        const dirs = [
          { dr: -1, dc: 0 },
          { dr: 1, dc: 0 },
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
        ];
        const openNeighbors = dirs.filter((d) => {
          const nr = r + d.dr;
          const nc = c + d.dc;
          return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && this.map[nr][nc] === TILE_EMPTY;
        });

        if (openNeighbors.length < 2) {
          for (const d of dirs) {
            if (openNeighbors.length >= 2) break;
            const nr = r + d.dr;
            const nc = c + d.dc;
            if (nr >= 1 && nr < ROWS - 1 && nc >= 1 && nc < COLS - 1 && this.map[nr][nc] === TILE_BLOCK) {
              this.map[nr][nc] = TILE_EMPTY;
              this.blocks.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
                const b = child as Phaser.Physics.Arcade.Sprite;
                if (b && b.active && b.getData('row') === nr && b.getData('col') === nc) {
                  b.destroy();
                }
              });
              openNeighbors.push(d);
            }
          }
        }

        spawnedTiles.add(key);
        const archetype = archetypes[spawned % archetypes.length];
        const x = c * TILE_SIZE + TILE_SIZE / 2;
        const y = r * TILE_SIZE + TILE_SIZE / 2;

        const enemy = createEnemy(this, archetype, x, y);
        this.enemies.add(enemy);
        this.attachEntityDropShadow(enemy);
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
        this.attachEntityDropShadow(neutral);
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
        this.attachEntityDropShadow(ally);
        spawned++;
      }
    }
  }

  generateMap() {
    const offsetX = (800 - COLS * TILE_SIZE) / 2;
    const offsetY = (600 - ROWS * TILE_SIZE) / 2;
    this.baseScrollX = -offsetX;
    this.baseScrollY = -offsetY;

    this.cameras.main.setScroll(-offsetX, -offsetY);

    for (let r = 0; r < ROWS; r++) {
      this.map[r] = [];
      for (let c = 0; c < COLS; c++) {
        // Floor tile at depth 0
        const floor = this.add.image(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'floor');
        floor.setDepth(RENDER_DEPTH.FLOOR);

        // Outer borders
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          this.map[r][c] = TILE_WALL;
          const wall = this.walls.create(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'wall') as Phaser.Physics.Arcade.Sprite;
          wall.setDepth(RENDER_DEPTH.WALLS);
          wall.refreshBody();
          if (r < ROWS - 1) {
            const ao = this.add.rectangle(c * TILE_SIZE + TILE_SIZE / 2, (r + 1) * TILE_SIZE + 2, TILE_SIZE, 4, 0x000000, 0.28);
            ao.setDepth(1);
          }
        }
        // Inner fixed pillars
        else if (r % 2 === 0 && c % 2 === 0) {
          this.map[r][c] = TILE_WALL;
          const wall = this.walls.create(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'wall') as Phaser.Physics.Arcade.Sprite;
          wall.setDepth(RENDER_DEPTH.WALLS);
          wall.refreshBody();
          if (r < ROWS - 1) {
            const ao = this.add.rectangle(c * TILE_SIZE + TILE_SIZE / 2, (r + 1) * TILE_SIZE + 2, TILE_SIZE, 4, 0x000000, 0.28);
            ao.setDepth(1);
          }
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
            block.setDepth(RENDER_DEPTH.BLOCKS);
            block.setData('row', r);
            block.setData('col', c);
            block.refreshBody();
            if (r < ROWS - 1) {
              const ao = this.add.rectangle(c * TILE_SIZE + TILE_SIZE / 2, (r + 1) * TILE_SIZE + 2, TILE_SIZE, 4, 0x000000, 0.28);
              ao.setDepth(1);
              block.setData('aoShadow', ao);
            }
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
      marker.setDepth(RENDER_DEPTH.WALLS);
      marker.setAlpha(0.65);
    });

    // Portal visual runes
    const pA = DEFAULT_PORTALS.portalA;
    const pB = DEFAULT_PORTALS.portalB;
    const portalA = this.add.text(pA.col * TILE_SIZE + TILE_SIZE / 2, pA.row * TILE_SIZE + TILE_SIZE / 2, '🌀', {
      fontSize: '20px',
    });
    portalA.setOrigin(0.5, 0.5);
    portalA.setDepth(RENDER_DEPTH.PORTALS);

    const portalB = this.add.text(pB.col * TILE_SIZE + TILE_SIZE / 2, pB.row * TILE_SIZE + TILE_SIZE / 2, '🌀', {
      fontSize: '20px',
    });
    portalB.setOrigin(0.5, 0.5);
    portalB.setDepth(RENDER_DEPTH.PORTALS);

    this.tweens.add({
      targets: [portalA, portalB],
      angle: 360,
      duration: 3500,
      repeat: -1,
    });

    // Initialize Boss HUD & Telegraph Renderers
    this.bossHUD = new BossHUD(this.game);
    this.telegraphGraphics = this.add.graphics();
    this.telegraphGraphics.setDepth(RENDER_DEPTH.TELEGRAPHS);
    this.bossGraphics = this.add.graphics();
    this.bossGraphics.setDepth(RENDER_DEPTH.BOSS_BODY);
    this.telegraphEngine = new TelegraphEngine(this.telegraphGraphics);

    // Initialize Crisis Subsystem Renderers & Bridge
    this.situationLog = new SituationLog(this.game);
    this.crisisGraphics = this.add.graphics();
    this.crisisGraphics.setDepth(RENDER_DEPTH.CRISIS_HAZARDS);


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
    this.cameras.main.setScroll(this.baseScrollX + shake.x, this.baseScrollY + shake.y);
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

    // 3. Movement & Juice
    this.updatePlayerMovement();
    this.updatePlayerJuice(delta, _time);

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

      // Fuse spark emission at fuse tip
      if (this.bombSparkEmitter && Math.random() < 0.35) {
        this.bombSparkEmitter.emitParticleAt(bomb.x + 9, bomb.y - 15, 1);
      }
    });

    // 8. Shield visual follow
    if (this.hasShield) {
      if (!this.shieldVisual) {
        this.shieldVisual = this.add.graphics();
        const pDepth =
          RENDER_DEPTH.ENTITY_Y_BASE + this.player.y * RENDER_DEPTH.ENTITY_Y_SCALE;
        this.shieldVisual.setDepth(pDepth + RENDER_DEPTH.OFFSET_SHIELD);
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
            typeof (child as unknown as { updateAI: (delta: number, time: number, p: Phaser.Physics.Arcade.Sprite | null, m: number[][], b: Set<string>) => void }).updateAI === 'function'
          ) {
            (child as unknown as { updateAI: (delta: number, time: number, p: Phaser.Physics.Arcade.Sprite | null, m: number[][], b: Set<string>) => void }).updateAI(
              delta,
              _time,
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

    // 10b. Continuous 2.5D dynamic Y-sorting & OverheadUIManager declutter pass
    if (this.player && this.player.active) {
      const playerBaseDepth =
        RENDER_DEPTH.ENTITY_Y_BASE + this.player.y * RENDER_DEPTH.ENTITY_Y_SCALE;
      this.player.setDepth(playerBaseDepth + RENDER_DEPTH.OFFSET_SPRITE);
      if (this.shieldVisual && this.shieldVisual.active) {
        this.shieldVisual.setDepth(playerBaseDepth + RENDER_DEPTH.OFFSET_SHIELD);
      }
    }

    const activeEntities: BaseEntity[] = [];
    const collectActive = (group?: Phaser.Physics.Arcade.Group) => {
      if (!group) return;
      group.getChildren().forEach((child) => {
        const e = child as BaseEntity;
        if (e && e.active && !e.isDead && e.overheadUI) {
          activeEntities.push(e);
        }
      });
    };
    collectActive(this.enemies);
    collectActive(this.allies);
    collectActive(this.neutrals);

    if (this.overheadUIManager) {
      this.overheadUIManager.update(activeEntities, this.player, delta);
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

    // 12. Update Crisis Subsystem & Visual Hazards
    if (this.crisisManager && this.crisisManager.getActiveCrisis()) {
      const activeCrisis = this.crisisManager.getActiveCrisis();
      if (activeCrisis && activeCrisis.getStage() !== CrisisStage.INACTIVE) {
        const playerPos = {
          r: Math.floor(this.player.y / TILE_SIZE),
          c: Math.floor(this.player.x / TILE_SIZE),
          x: this.player.x,
          y: this.player.y,
        };
        this.crisisManager.update(delta, playerPos);
        if (this.situationLog) {
          this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now());
        }

        // Render Crisis Hazard Graphics
        this.renderCrisisHazards(_time);
      }
    }
  }

  private renderCrisisHazards(time: number): void {
    if (!this.crisisGraphics || !this.crisisManager) return;
    this.crisisGraphics.clear();

    const hazards = this.crisisManager.getActiveHazardTiles();
    for (const hazard of hazards) {
      const x = hazard.c * TILE_SIZE + TILE_SIZE / 2;
      const y = hazard.r * TILE_SIZE + TILE_SIZE / 2;
      const left = hazard.c * TILE_SIZE;
      const top = hazard.r * TILE_SIZE;

      switch (hazard.type) {
        case HazardType.VOID_RIFT: {
          const pulse = 0.75 + 0.25 * Math.sin(time / 200 + hazard.idx);
          this.crisisGraphics.fillStyle(0x8a2be2, 0.45 * pulse);
          this.crisisGraphics.fillCircle(x, y, 22 * pulse);

          this.crisisGraphics.fillStyle(0xda70d6, 0.75);
          this.crisisGraphics.fillCircle(x, y, 13);

          this.crisisGraphics.fillStyle(0x0a0014, 0.95);
          this.crisisGraphics.fillCircle(x, y, 6);

          this.crisisGraphics.lineStyle(2, 0x00ffff, 0.85);
          this.crisisGraphics.strokeCircle(x, y, 16 * pulse);
          break;
        }
        case HazardType.PURIFICATION_PRISM: {
          const prismPulse = 0.8 + 0.2 * Math.sin(time / 150 + hazard.idx);
          this.crisisGraphics.fillStyle(0x00ffff, 0.25 * prismPulse);
          this.crisisGraphics.fillCircle(x, y, 24 * prismPulse);

          this.crisisGraphics.fillStyle(0x38bdf8, 0.9);
          this.crisisGraphics.beginPath();
          this.crisisGraphics.moveTo(x, y - 15);
          this.crisisGraphics.lineTo(x + 13, y);
          this.crisisGraphics.lineTo(x, y + 15);
          this.crisisGraphics.lineTo(x - 13, y);
          this.crisisGraphics.closePath();
          this.crisisGraphics.fillPath();

          this.crisisGraphics.lineStyle(2, 0xffffff, 0.95);
          this.crisisGraphics.strokePath();

          this.crisisGraphics.fillStyle(0xffd700, 0.9);
          this.crisisGraphics.fillCircle(x, y, 4);
          break;
        }
        case HazardType.VOID_CREEP: {
          this.crisisGraphics.fillStyle(0x4c1d95, 0.6);
          this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          this.crisisGraphics.lineStyle(1.5, 0xa855f7, 0.75);
          this.crisisGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          this.crisisGraphics.fillStyle(0xc084fc, 0.7);
          this.crisisGraphics.fillCircle(x, y, 3);
          break;
        }
        case HazardType.LAVA_SURFACE: {
          this.crisisGraphics.fillStyle(0xd97706, 0.65);
          this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          this.crisisGraphics.lineStyle(2, 0xef4444, 0.85);
          this.crisisGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          break;
        }
        case HazardType.OBSIDIAN_BLOCK: {
          this.crisisGraphics.fillStyle(0x1e1b4b, 0.85);
          this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          this.crisisGraphics.lineStyle(1.5, 0x6366f1, 0.6);
          this.crisisGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          break;
        }
        case HazardType.EMP_PULSE:
        case HazardType.BRASS_COG: {
          this.crisisGraphics.lineStyle(2, 0x38bdf8, 0.85);
          this.crisisGraphics.strokeCircle(x, y, 16);
          break;
        }
        case HazardType.SOLAR_SWEEP:
        case HazardType.THERMAL_VENT: {
          this.crisisGraphics.fillStyle(0xfacc15, 0.45);
          this.crisisGraphics.fillRect(left, top, TILE_SIZE, TILE_SIZE);
          break;
        }
        case HazardType.KINETIC_TARGET:
        case HazardType.KINETIC_CRATER: {
          this.crisisGraphics.lineStyle(2, 0xf43f5e, 0.9);
          this.crisisGraphics.strokeCircle(x, y, 15);
          this.crisisGraphics.lineBetween(x - 18, y, x + 18, y);
          this.crisisGraphics.lineBetween(x, y - 18, x, y + 18);
          break;
        }
        default: {
          this.crisisGraphics.fillStyle(0x8b5cf6, 0.4);
          this.crisisGraphics.fillRect(left + 4, top + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          break;
        }
      }
    }

    // If Void Devourer Avatar is active in Climax stage, render Avatar boss visual
    const activeCrisis = this.crisisManager.getActiveCrisis();
    if (activeCrisis && 'avatarSpawned' in activeCrisis && (activeCrisis as { avatarSpawned: boolean }).avatarSpawned) {
      const ax = 7 * TILE_SIZE + TILE_SIZE / 2;
      const ay = 6 * TILE_SIZE + TILE_SIZE / 2;
      const pulse = 0.8 + 0.2 * Math.sin(time / 160);

      this.crisisGraphics.fillStyle(0x581c87, 0.4 * pulse);
      this.crisisGraphics.fillCircle(ax, ay, 36 * pulse);

      this.crisisGraphics.fillStyle(0x2e1065, 0.9);
      this.crisisGraphics.fillCircle(ax, ay, 26);

      this.crisisGraphics.lineStyle(3, 0xd946ef, 0.9);
      this.crisisGraphics.strokeCircle(ax, ay, 26);

      this.crisisGraphics.lineStyle(2, 0x38bdf8, 0.85);
      this.crisisGraphics.strokeCircle(ax, ay, 32 + 3 * Math.sin(time / 140));
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

  private populateBombIgnoringColliders(
    bomb: Phaser.Physics.Arcade.Sprite,
    creator?: Phaser.GameObjects.GameObject
  ): void {
    const ignoring = new Set<Phaser.GameObjects.GameObject>();
    if (creator) {
      ignoring.add(creator);
    }
    const bombBody = bomb.body as Phaser.Physics.Arcade.Body;
    if (!bombBody) {
      bomb.setData('ignoringColliders', ignoring);
      return;
    }

    if (this.player?.active && this.player !== creator) {
      const pb = this.player.body as Phaser.Physics.Arcade.Body;
      if (pb && this.checkBodiesOverlap(pb, bombBody)) {
        ignoring.add(this.player);
      }
    }

    const checkGroup = (group?: Phaser.Physics.Arcade.Group) => {
      if (!group) return;
      group.getChildren().forEach((child) => {
        const obj = child as Phaser.Physics.Arcade.Sprite;
        if (obj.active && obj !== creator) {
          const ob = obj.body as Phaser.Physics.Arcade.Body;
          if (ob && this.checkBodiesOverlap(ob, bombBody)) {
            ignoring.add(obj);
          }
        }
      });
    };

    checkGroup(this.enemies);
    checkGroup(this.allies);
    checkGroup(this.neutrals);

    bomb.setData('ignoringColliders', ignoring);
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
    bomb.setDepth(RENDER_DEPTH.BOMBS);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);

    this.populateBombIgnoringColliders(bomb, this.player);

    // Multi-stage 4-phase asymmetric accelerating pulse tween chain with 100ms pre-detonation whiteout contraction
    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        // Phase 1: Asymmetric Rhythmic Heartbeat (0ms - 1000ms: 2 cycles @ 250ms half-period)
        {
          scaleX: 1.14,
          scaleY: 1.04,
          duration: 250,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        // Phase 2: Boiling Pressure Amber Swell (1000ms - 1600ms: 2 cycles @ 150ms half-period)
        {
          scaleX: 1.22,
          scaleY: 0.92,
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xff8844);
          },
        },
        // Phase 3: Critical Detonation Hyper-Pulse & Micro-Jitter (1600ms - 1900ms: 3 cycles @ 50ms half-period)
        {
          scaleX: 1.32,
          scaleY: 1.12,
          angle: 3.5,
          duration: 50,
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xff2222);
          },
        },
        // Phase 4: Detonation Anticipation Gasp & Whiteout Contraction (1900ms - 2000ms: 100ms pre-blast)
        {
          scaleX: 0.80,
          scaleY: 0.80,
          duration: 100,
          ease: 'Quad.easeIn',
          onStart: () => {
            if (bomb.active) {
              bomb.setTint(0xffffff);
              bomb.setAngle(0);
            }
          },
        },
      ],
    });

    const bombId = `bomb_${Date.now()}_${Math.random()}`;
    bomb.setData('id', bombId);
    bomb.setData('owner', 'player');
    bomb.setData('power', this.bombPower);

    const fuseTimer = this.time.delayedCall(2000, () => {
      if (bomb && bomb.active) {
        const curCol = Math.floor(bomb.x / TILE_SIZE);
        const curRow = Math.floor(bomb.y / TILE_SIZE);
        this.explodeBomb(bomb, curRow, curCol);
      }
    });
    bomb.setData('fuseTimer', fuseTimer);
    bomb.setData('tweenChain', tweenChain);

    this.activeBombs++;
    this.emitStatsUpdate();
  }

  placeEnemyBomb(enemy: Phaser.GameObjects.GameObject, row: number, col: number, power: number, fuseMs: number = 2000): boolean {
    if (this.isGameOver) return false;

    // Hard ceiling: max 2 active enemy bombs on arena
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
    bomb.setDepth(RENDER_DEPTH.BOMBS);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);

    this.populateBombIgnoringColliders(bomb, enemy as Phaser.GameObjects.GameObject);

    const bombId = `bomb_e_${Date.now()}_${Math.random()}`;
    bomb.setData('id', bombId);
    bomb.setData('owner', 'enemy');
    bomb.setData('enemy', enemy);
    bomb.setData('power', power);

    // Distinct purple/amethyst pulse tint (0xd946ef)
    bomb.setTint(0xd946ef);

    // Multi-stage 4-phase accelerating pulse tween chain with purple/amethyst theme & 100ms pre-detonation whiteout
    const p1 = Math.round(fuseMs * 0.50 / 4);
    const p2 = Math.round(fuseMs * 0.30 / 4);
    const p3 = Math.round(fuseMs * 0.15 / 6);
    const p4 = Math.max(50, fuseMs - (p1 * 4 + p2 * 4 + p3 * 6));

    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        {
          scaleX: 1.14,
          scaleY: 1.04,
          duration: p1,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        {
          scaleX: 1.22,
          scaleY: 0.92,
          duration: p2,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xc084fc);
          },
        },
        {
          scaleX: 1.32,
          scaleY: 1.12,
          angle: 3.5,
          duration: p3,
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0xa855f7);
          },
        },
        {
          scaleX: 0.80,
          scaleY: 0.80,
          duration: p4,
          ease: 'Quad.easeIn',
          onStart: () => {
            if (bomb.active) {
              bomb.setTint(0xffffff);
              bomb.setAngle(0);
            }
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
    bomb.setDepth(RENDER_DEPTH.BOMBS);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);

    this.populateBombIgnoringColliders(bomb, ally as Phaser.GameObjects.GameObject);

    const bombId = `bomb_a_${Date.now()}_${Math.random()}`;
    bomb.setData('id', bombId);
    bomb.setData('owner', 'ally');
    bomb.setData('ally', ally);
    bomb.setData('power', power);
    bomb.setTint(0x06b6d4); // Cyan tint for ally bombs

    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        {
          scaleX: 1.14,
          scaleY: 1.04,
          duration: 300,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        {
          scaleX: 1.22,
          scaleY: 0.92,
          duration: 180,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0x38bdf8);
          },
        },
        {
          scaleX: 1.32,
          scaleY: 1.12,
          angle: 3.5,
          duration: 60,
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(0x0284c7);
          },
        },
        {
          scaleX: 0.80,
          scaleY: 0.80,
          duration: 100,
          ease: 'Quad.easeIn',
          onStart: () => {
            if (bomb.active) {
              bomb.setTint(0xffffff);
              bomb.setAngle(0);
            }
          },
        },
      ],
    });
    bomb.setData('tweenChain', tweenChain);

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
      const enemy = bomb.getData('enemy') as (BaseEntity | BomberEnemy) | undefined;
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

    // Crisis blast interaction (clearing void creep, charging prisms)
    if (this.crisisManager && this.crisisManager.getActiveCrisis()) {
      this.crisisManager.handleBombBlast(actualRow, actualCol, bombPower);
    }

    // 1. Tactile Camera Trauma & Debounced Hit-Stop (Juice M3)
    if (this.cameraTrauma) {
      this.cameraTrauma.addTrauma(0.35);
    }
    this.triggerHitStop(35);

    // 2. High-Impact Screen Flash (warm golden-white flash)
    this.cameras.main.flash(80, 255, 230, 160, false);

    // 3. Dynamic Expanding Shockwave Ring
    const centerX = actualCol * TILE_SIZE + TILE_SIZE / 2;
    const centerY = actualRow * TILE_SIZE + TILE_SIZE / 2;
    const shockwave = this.add.graphics();
    shockwave.setDepth(RENDER_DEPTH.SHOCKWAVES);
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
    exp.setDepth(RENDER_DEPTH.EXPLOSIONS);
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
        // Clean up ambient occlusion shadow
        const ao = b.getData('aoShadow') as Phaser.GameObjects.GameObject | undefined;
        if (ao) {
          ao.destroy();
        }

        // Zero-GC particle emitter
        if (this.blockDebrisEmitter) {
          this.blockDebrisEmitter.explode(8, centerX, centerY);
        } else {
          // Fallback if emitter not initialized (headless test environment)
          const offsets = [
            { dx: -6, dy: -6, vx: -25, vy: -25 },
            { dx: 6, dy: -6, vx: 25, vy: -25 },
            { dx: -6, dy: 6, vx: -25, vy: 25 },
            { dx: 6, dy: 6, vx: 25, vy: 25 },
          ];
          offsets.forEach((off) => {
            const frag = this.add.rectangle(centerX + off.dx, centerY + off.dy, 8, 8, isChest ? 0xfbbf24 : 0xb87333);
            frag.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
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
        }

        b.destroy();
      }
    });

    if (this.destroyedBlocksThisTick.size >= 3) {
      this.triggerHitStop(45);
    }

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
      if (this.cameraTrauma) {
        this.cameraTrauma.addTrauma(0.40);
      }
      this.triggerHitStop(50);

      // Spawn shield shatter burst
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const spark = this.add.circle(this.player.x, this.player.y, 4, 0x38bdf8, 0.9);
        spark.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
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
    if (this.cameraTrauma) {
      this.cameraTrauma.addTrauma(0.60);
    }
    this.triggerHitStop(70);
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
        warhead.setDepth(RENDER_DEPTH.BOMBS);
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
          exp.setDepth(RENDER_DEPTH.EXPLOSIONS);
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
        const pDepth = RENDER_DEPTH.ENTITY_Y_BASE + this.player.y * RENDER_DEPTH.ENTITY_Y_SCALE;
        ghost.setDepth(pDepth + RENDER_DEPTH.OFFSET_SHADOW);
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
    item.setDepth(RENDER_DEPTH.ITEMS);
    (item.body as Phaser.Physics.Arcade.Body)?.setSize(24, 24).setOffset(4, 4);
    item.setData('itemType', type);
    item.setData('spawnTime', this.time.now);
    item.setData('row', row);
    item.setData('col', col);

    // 600ms grace period golden glow ring
    const glow = this.add.circle(centerX, centerY, 18, 0xfbbf24, 0.45);
    glow.setDepth(RENDER_DEPTH.ITEM_GLOW);
    this.tweens.add({
      targets: glow,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: ITEM_GRACE_PERIOD_MS,
      ease: 'Sine.easeOut',
      onComplete: () => glow.destroy(),
    });

    // Floating bobbing animation & item hover shadow (Juice M3)
    this.tweens.add({
      targets: item,
      y: centerY - 4,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    if (this.textures && this.textures.exists('shadow_ellipse')) {
      const itemShadow = this.add.sprite(centerX, centerY + 14, 'shadow_ellipse');
      itemShadow.setDepth(3);
      itemShadow.setAlpha(0.35);
      itemShadow.setScale(0.75, 0.5);
      item.setData('itemShadow', itemShadow);

      this.tweens.add({
        targets: itemShadow,
        scaleX: 0.60,
        scaleY: 0.38,
        alpha: 0.22,
        duration: 450,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      item.once(Phaser.GameObjects.Events.DESTROY, () => {
        if (itemShadow && itemShadow.active) {
          itemShadow.destroy();
        }
      });
    }
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
    const currentTime = this.time?.now || Date.now();
    const cascadeOffset = this.floatingTextManager
      ? this.floatingTextManager.getCascadeOffset(x, y, currentTime)
      : 0;
    const startY = y - cascadeOffset;
    const targetY = startY - 22;

    const floating = this.add.text(x, startY, text, {
      fontSize: '12px',
      fontStyle: 'bold',
      fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    floating.setOrigin(0.5, 0.5);
    floating.setDepth(RENDER_DEPTH.FLOATING_TEXT);

    this.tweens.add({
      targets: floating,
      y: targetY,
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
      spark.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
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

  public ensureJuiceTextures(): void {
    if (!this.textures) return;

    // 1. Particle textures (dust, spark, debris)
    if (!this.textures.exists('particle_dust')) {
      try {
        const g = this.add.graphics();
        g.fillStyle(0xd6cbb8, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture('particle_dust', 8, 8);
        g.destroy();
      } catch {
        // Safe headless fallback
      }
    }

    if (!this.textures.exists('particle_spark')) {
      try {
        const g = this.add.graphics();
        g.fillStyle(0xfde047, 1);
        g.fillRect(1, 1, 4, 4);
        g.generateTexture('particle_spark', 6, 6);
        g.destroy();
      } catch {
        // Safe headless fallback
      }
    }

    if (!this.textures.exists('particle_debris')) {
      try {
        const g = this.add.graphics();
        g.fillStyle(0xe2e8f0, 1);
        g.fillRect(0, 0, 6, 6);
        g.generateTexture('particle_debris', 6, 6);
        g.destroy();
      } catch {
        // Safe headless fallback
      }
    }

    // 2. Procedural radial shadow ellipse texture (32x16)
    if (!this.textures.exists('shadow_ellipse')) {
      try {
        if (typeof document !== 'undefined') {
          const canvas = this.textures.createCanvas('shadow_ellipse', 32, 16);
          if (canvas) {
            const ctx = canvas.getContext();
            const grad = ctx.createRadialGradient(16, 8, 1, 16, 8, 15);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
            grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(16, 8, 15, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            canvas.refresh();
          }
        }
      } catch {
        // Fallback graphics below
      }

      if (!this.textures.exists('shadow_ellipse')) {
        try {
          const g = this.add.graphics();
          g.fillStyle(0x000000, 0.4);
          g.fillEllipse(16, 8, 30, 14);
          g.generateTexture('shadow_ellipse', 32, 16);
          g.destroy();
        } catch {
          // Safe headless fallback
        }
      }
    }
  }
}
