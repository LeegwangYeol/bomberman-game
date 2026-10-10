import Phaser from 'phaser';
import * as Pooling from './pooling/ObjectPool.ts';
import { AudioVoicePool } from './pooling/AudioVoicePool.ts';
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
} from './pathfinding.ts';
import {
  type PlayerStats,
  type ItemType,
  BASE_PLAYER_SPEED,
  BASE_MAX_BOMBS,
  MAX_BOMBS_CAP,
  BASE_BOMB_POWER,
  MAX_BOMB_POWER_CAP,
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
  calculateClampedPlayerSpeed,
  updateInvulnerabilityExpiry,
  ITEM_GRACE_PERIOD_MS,
  SHIELD_INVULN_MS,
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
  calculateClampedPlayerSpeed,
  updateInvulnerabilityExpiry,
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
} from './gameplay_mechanics.ts';

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
  RENDER_DEPTH,
  applyPhysicsBodyInvariantGuard,
  resolveEntitySeparation,
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
  MutantFloraBoss,
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
import {
  DynamicHazard,
  HazardSubtype,
  HYPER_FUSE_MS,
  HazardLifecycleState,
  TelegraphPhase,
  PHASE_JITTER_DURATION_MS,
  TUNNELING_INVULNERABILITY_MS,
  FLOATING_TEXT_QUANTUM_PHASED,
  type EnemyCollisionResult,
  GravityHazard,
  GravityLifecycleState,
  ESCAPE_VELOCITY_INVULN_MS,
  ESCAPE_VELOCITY_SPEED_BURST_RATIO,
  FLOATING_TEXT_GRAVITATIONAL_ESCAPE,
  FrostHazard,
  FrostLifecycleState,
  HoarfrostPhase,
  THERMAL_BREAK_INVULN_MS,
  THERMAL_BREAK_SPEED_BURST_RATIO,
  FLOATING_TEXT_THERMAL_BREAK,
  FROST_CHILL_DURATION_MS,
  FROST_CHILL_SLOW_RATIO,
  FLOATING_TEXT_FROST_CHILL,
  BOSS_FROST_DAMAGE_RATIO,
  FrostHazardAudio,
  VoltHazard,
  VoltLifecycleState,
  VoltTelegraphPhase,
  SUPERCONDUCTOR_DASH_INVULN_MS,
  SUPERCONDUCTOR_SPEED_BURST_RATIO,
  FLOATING_TEXT_SUPERCONDUCTOR_DASH,
  STATIC_SHOCK_DURATION_MS,
  STATIC_SHOCK_SLOW_RATIO,
  FLOATING_TEXT_STATIC_SHOCK,
  BOSS_VOLT_DAMAGE_RATIO,
  VoltHazardAudio,
  MagmaHazard,
  MagmaLifecycleState,
  MagmaTelegraphPhase,
  MAGMA_SURF_INVULN_MS,
  MAGMA_SURF_SPEED_BURST_RATIO,
  FLOATING_TEXT_MAGMA_SURF,
  THERMAL_SINGE_DURATION_MS,
  THERMAL_SINGE_SLOW_RATIO,
  FLOATING_TEXT_THERMAL_SINGE,
  BOSS_MAGMA_DAMAGE_RATIO,
  MagmaHazardAudio,
  MiasmaHazard,
  MiasmaLifecycleState,
  MiasmaTelegraphPhase,
  SPORE_SURGE_INVULN_MS,
  SPORE_SURGE_SPEED_BURST_RATIO,
  FLOATING_TEXT_SPORE_SURGE,
  NEUROTOXIN_DURATION_MS,
  NEUROTOXIN_SLOW_RATIO,
  FLOATING_TEXT_NEUROTOXIN,
  BOSS_MIASMA_DAMAGE_RATIO,
  MiasmaHazardAudio,
  MIASMA_SUPER_BOMB_TINT,
  FLOATING_TEXT_BIO_FUSED,
  FLOATING_TEXT_CATALYTIC_DETONATION,
  BOMB_KICK_MIASMA_SPEED,
  FLOATING_TEXT_BIO_SLICK_GLIDE,
  ChronoHazard,
  ChronoLifecycleState,
  ChronoTelegraphPhase,
  CHRONO_SURGE_INVULN_MS,
  CHRONO_SURGE_SPEED_BURST_RATIO,
  FLOATING_TEXT_CHRONO_SURGE,
  TEMPORAL_DILATION_DURATION_MS,
  TEMPORAL_DILATION_SLOW_RATIO,
  FLOATING_TEXT_TEMPORAL_DILATION,
  BOSS_CHRONO_DAMAGE_RATIO,
  ChronoHazardAudio,
  CHRONO_SUPER_BOMB_TINT,
  FLOATING_TEXT_CHRONO_SHIFTED,
  FLOATING_TEXT_TEMPORAL_IMPLOSION,
  BOMB_KICK_CHRONO_SPEED,
  FLOATING_TEXT_CHRONO_SLIPSTREAM,
  FLOATING_TEXT_TIMELINE_STABILIZED,
  SolarHazard,
  SolarLifecycleState,
  SolarTelegraphPhase,
  SOLAR_SURF_INVULN_MS,
  SOLAR_SURF_SPEED_BURST_RATIO,
  FLOATING_TEXT_SOLAR_SURF,
  SUNSTROKE_DURATION_MS,
  SUNSTROKE_SLOW_RATIO,
  FLOATING_TEXT_SUNSTROKE,
  BOSS_SOLAR_DAMAGE_RATIO,
  BOSS_SOLAR_STASIS_STUN_MS,
  SolarHazardAudio,
  SOLAR_SUPER_BOMB_TINT,
  FLOATING_TEXT_SOLAR_FUSED,
  FLOATING_TEXT_SUPERNOVA,
  BOMB_KICK_SOLAR_SPEED,
  FLOATING_TEXT_SOLAR_SLIPSTREAM,
  FLOATING_TEXT_SOLAR_CALM,
  FLOATING_TEXT_PLASMA_VAPORIZED,
  FLOATING_TEXT_SOLAR_BLINDNESS,
  NebulaHazard,
  NebulaLifecycleState,
  NebulaTelegraphPhase,
  ASTRAL_GLIDE_INVULN_MS,
  ASTRAL_GLIDE_SPEED_BURST_RATIO,
  FLOATING_TEXT_ASTRAL_GLIDE,
  COSMIC_DAZE_DURATION_MS,
  COSMIC_DAZE_SLOW_RATIO,
  FLOATING_TEXT_COSMIC_DAZE,
  BOSS_NEBULA_DAMAGE_RATIO,
  BOSS_NEBULA_STASIS_STUN_MS,
  NebulaHazardAudio,
  NEBULA_SUPER_BOMB_TINT,
  FLOATING_TEXT_NEBULA_FUSED,
  FLOATING_TEXT_SINGULARITY_BURST,
  BOMB_KICK_NEBULA_SPEED,
  FLOATING_TEXT_ASTRAL_SLIPSTREAM,
  FLOATING_TEXT_STARDUST_CALM,
  FLOATING_TEXT_COSMIC_VAPORIZED,
  FLOATING_TEXT_ECLIPSE_STASIS,
  HazardRenderer,
} from './hazards/index.ts';
import { PerkTreeManager, RelicManager, type RelicId, type AppliedPerkBonuses } from './progression/index.ts';

import { decompressGrid, compressGrid } from './persistence/GameStatePersistence.ts';
import type {
  SerializedRunState,
  SaveTriggerType,
  SerializedBomb,
  SerializedItem,
  SerializedEntity,
  GameModeType,
} from './persistence/PersistenceTypes.ts';

interface PooledEnemySprite extends BaseEntity {
  archetype?: string;
  reset?: () => void;
}
import {
  generateItemTextures as generateProceduralItemTextures,
  ensureJuiceTextures as ensureProceduralJuiceTextures,
} from './graphics/index.ts';

export { RENDER_DEPTH };

export const DEFAULT_MOBILE_INPUT = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  bomb: false,
  dash: false,
  ultimate: false,
});

export const CARDINAL_DIRECTIONS = Object.freeze([
  { dr: -1, dc: 0 }, // up
  { dr: 1, dc: 0 },  // down
  { dr: 0, dc: -1 }, // left
  { dr: 0, dc: 1 },  // right
]);

import { OverheadUIManager, FloatingTextManager } from './ui/index.ts';
export { OverheadUIManager, FloatingTextManager };
export type { DeclutterEntity, ActiveFloatingText } from './ui/index.ts';



/**
 * Main Phaser GameScene for Bomberman.
 */
export default class GameScene extends Phaser.Scene {
  public circlePool!: Pooling.ObjectPool<Phaser.GameObjects.Arc>;
  public rectPool!: Pooling.ObjectPool<Phaser.GameObjects.Rectangle>;
  public graphicsPool!: Pooling.ObjectPool<Phaser.GameObjects.Graphics>;
  public spritePool!: Pooling.ObjectPool<Phaser.GameObjects.Sprite>;
  public shadowPool!: Pooling.ObjectPool<Phaser.GameObjects.Sprite>;
  public floatingTextPool!: Pooling.ObjectPool<Phaser.GameObjects.Text>;

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
  public dashBufferRemaining: number = 0;
  public bombBufferRemaining: number = 0;
  public ultBufferRemaining: number = 0;
  public dashSpeedBurstRemaining: number = 0;
  public dashSpeedBurstMultiplier: number = 1.0;
  public appliedPerkBonuses: AppliedPerkBonuses | null = null;
  public dashStartTime: number = 0;
  public phaseJitterRemaining: number = 0;
  public lastQuantumTunnelTimestampMs: number = 0;
  public isInvulnerable: boolean = false;
  public shieldInvulnerableUntil: number = 0;
  public portalCooldown: number = 0;
  public score: number = 0;
  public starCandies: number = 0;
  public cosmicEssence: number = 0;
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
  public bossPhaseBarGraphics: Phaser.GameObjects.Graphics | null = null;
  public bossHUD: BossHUD | null = null;
  public currentBossIndex: number = 0;

  // Progression & Physics Resilience (PHYS-05, PHYS-06, PHYS-07, UI-01, UI-06)
  public cornerSlideTolerance: number = 8;
  public baseSpeedBonus: number = 0;
  public destroyedBlocksThisTick: Set<string> = new Set();
  public bossHitBombIds: Set<string> = new Set();

  // Scratch vectors & buffers for Zero-GC hot loops
  private readonly scratchPlayerPos = { r: 0, c: 0, x: 0, y: 0 };
  private readonly scratchPlayerVector = { x: 0, y: 0 };
  private readonly scratchExpVector = { x: 0, y: 0 };
  private readonly scratchActiveEntities: BaseEntity[] = [];
  private readonly scratchActiveEnemies: BaseEntity[] = [];
  private readonly scratchActiveItems: Phaser.Physics.Arcade.Sprite[] = [];

  private getConveyorAt(row: number, col: number): ConveyorConfig | undefined {
    for (let i = 0; i < this.conveyors.length; i++) {
      const c = this.conveyors[i];
      if (c.row === row && c.col === col) return c;
    }
    return undefined;
  }

  private collectActiveEntitiesFromGroup(group?: Phaser.Physics.Arcade.Group): void {
    if (!group) return;
    const children = group.getChildren();
    for (let i = 0; i < children.length; i++) {
      const e = children[i] as BaseEntity;
      if (e && e.active && !e.isDead && e.overheadUI) {
        this.scratchActiveEntities.push(e);
      }
    }
  }

  private isTilePassableForPlayer(r: number, c: number, playerRow: number, playerCol: number): boolean {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (this.map[r][c] === TILE_WALL) return false;
    if (this.map[r][c] === TILE_BLOCK && !this.hasWallPass) return false;

    if (!this.hasBombPass && this.bombs) {
      const bombsList = this.bombs.getChildren();
      for (let i = 0; i < bombsList.length; i++) {
        const b = bombsList[i] as Phaser.Physics.Arcade.Sprite;
        if (b.active) {
          const br = Math.floor(b.y / TILE_SIZE);
          const bc = Math.floor(b.x / TILE_SIZE);
          if (br === r && bc === c) {
            // Allow stepping off a bomb if player is currently on it
            if (!(playerRow === r && playerCol === c)) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }
  private statsTimerAccumulator: number = 0;

  // Crisis Subsystem Integration
  public crisisManager: CrisisManager = new CrisisManager();
  public situationLog: SituationLog | null = null;
  public crisisGraphics: Phaser.GameObjects.Graphics | null = null;
  public hasRewardedActiveCrisis: boolean = false;

  // Dynamic Hazard System Integration
  public dynamicHazard: DynamicHazard = new DynamicHazard();
  public gravityHazard: GravityHazard = new GravityHazard();
  public frostHazard: FrostHazard = new FrostHazard();
  public voltHazard: VoltHazard = new VoltHazard();
  public magmaHazard: MagmaHazard = new MagmaHazard();
  public miasmaHazard: MiasmaHazard = new MiasmaHazard();
  public chronoHazard: ChronoHazard = new ChronoHazard();
  public solarHazard: SolarHazard = new SolarHazard();
  public nebulaHazard: NebulaHazard = new NebulaHazard();
  public lastGravitationalEscapeTimestampMs: number = 0;
  public lastFrostChillFloatingTextMs: number = -9999;
  public lastStaticShockFloatingTextMs: number = -9999;
  public lastThermalSingeFloatingTextMs: number = -9999;
  public lastNeurotoxinFloatingTextMs: number = -9999;
  public lastTemporalDilationFloatingTextMs: number = -9999;
  public lastSunstrokeFloatingTextMs: number = -9999;
  public lastCosmicDazeFloatingTextMs: number = -9999;
  public frostHazardAudio: FrostHazardAudio = FrostHazardAudio.getInstance();
  public voltHazardAudio: VoltHazardAudio = VoltHazardAudio.getInstance();
  public magmaHazardAudio: MagmaHazardAudio = MagmaHazardAudio.getInstance();
  public miasmaHazardAudio: MiasmaHazardAudio = MiasmaHazardAudio.getInstance();
  public chronoHazardAudio: ChronoHazardAudio = ChronoHazardAudio.getInstance();
  public solarHazardAudio: SolarHazardAudio = SolarHazardAudio.getInstance();
  public nebulaHazardAudio: NebulaHazardAudio = NebulaHazardAudio.getInstance();
  public hazardGraphics: Phaser.GameObjects.Graphics | null = null;


  // Juice & Polish Engine
  public dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  public bombSparkEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  public blockDebrisEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  public playerDropShadow?: Phaser.GameObjects.Sprite | null;
  public playerStepCycle: number = 0;
  public playerBobOffset: number = 0;
  private lastHitStopMs: number = 0;
  public isHitStopActive: boolean = false;
  private hitStopTimeout: ReturnType<typeof setTimeout> | null = null;
  public relicManager!: RelicManager;
  public perkManager?: {
    triggerSecondWind(): boolean;
    [key: string]: unknown;
  };
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
          if (this.physics && this.physics.world && this.physics.world.isPaused) {
            this.physics.world.resume();
          }
          this.isHitStopActive = false;
        });
      } else {
        if (this.hitStopTimeout) {
          clearTimeout(this.hitStopTimeout);
        }
        this.hitStopTimeout = setTimeout(() => {
          this.hitStopTimeout = null;
          if (this.physics && this.physics.world && this.physics.world.isPaused) {
            this.physics.world.resume();
          }
          this.isHitStopActive = false;
        }, durationMs);
      }
    }
  }

  public attachEntityDropShadow(entity: { x: number; y: number; dropShadow?: Phaser.GameObjects.Sprite }): void {
    if (this.textures && this.textures.exists('shadow_ellipse')) {
      const shadow = this.shadowPool ? this.shadowPool.acquire() : null;
      if (shadow) {
        shadow.setActive(true).setVisible(true).setPosition(entity.x, entity.y + 14);
        shadow.setDepth(6);
        shadow.setAlpha(0.45);
        shadow.setScale(1.0, 0.7);
        entity.dropShadow = shadow;
      }
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
    this.hasRewardedActiveCrisis = false;
    this.crisisManager.triggerCrisis(type);
    if (this.situationLog) {
      this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now(), true);
    }
    if (this.dynamicHazard) {
      this.dynamicHazard.start(type === CrisisType.DIMENSIONAL_RIFTS ? 'OUTBREAK' : 'WHISPERS');
    }
  }

  public stopCrisisMode(): void {
    this.hasRewardedActiveCrisis = false;
    if (this.crisisManager) {
      this.crisisManager.stopCrisis('reset');
    }
    if (this.situationLog) {
      this.situationLog.reset();
    }
    if (this.crisisGraphics) {
      this.crisisGraphics.clear();
    }
    if (this.dynamicHazard) {
      this.dynamicHazard.stop();
    }
    if (this.gravityHazard) {
      this.gravityHazard.stop();
    }
    if (this.frostHazard) {
      this.frostHazard.stop();
    }
    if (this.voltHazard) {
      this.voltHazard.stop();
    }
    if (this.magmaHazard) {
      this.magmaHazard.stop();
    }
    if (this.miasmaHazard) {
      this.miasmaHazard.stop();
    }
    if (this.chronoHazard) {
      this.chronoHazard.stop();
    }
    if (this.solarHazard) {
      this.solarHazard.stop();
    }
    if (this.nebulaHazard) {
      this.nebulaHazard.stop();
    }
    if (this.hazardGraphics) {
      this.hazardGraphics.clear();
    }
    this.frostHazardAudio?.reset();
    this.voltHazardAudio?.stop();
    this.magmaHazardAudio?.stop();
    this.miasmaHazardAudio?.stop();
    this.chronoHazardAudio?.stop();
    this.solarHazardAudio?.stop();
    this.nebulaHazardAudio?.stop();
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
      const bonuses = PerkTreeManager.calculateAppliedBonuses(perks);
      this.appliedPerkBonuses = bonuses;
      let secondWindConsumed = false;
      this.perkManager = {
        triggerSecondWind: () => {
          const res = PerkTreeManager.triggerSecondWind(bonuses, secondWindConsumed);
          if (res.saved) {
            secondWindConsumed = true;
            return true;
          }
          return false;
        },
      };
      const cornerLvl = typeof perks['corner_magnet'] === 'number' ? perks['corner_magnet'] : 0;
      this.cornerSlideTolerance = bonuses.cornerSlideTolerance || (cornerLvl === 1 ? 11 : cornerLvl >= 2 ? 14 : 8);
      const bouncy = typeof perks['bouncy_soles'] === 'number' ? perks['bouncy_soles'] : 0;
      if (bouncy > 0 || bonuses.baseSpeedBonus > 0) {
        this.baseSpeedBonus = bonuses.baseSpeedBonus || Math.min(3, bouncy) * 10;
      }
      const sugar = typeof perks['sugar_coating'] === 'number' ? perks['sugar_coating'] : 0;
      if (sugar > 0 || bonuses.startingShields > 0) {
        this.shieldCharges = Math.max(this.shieldCharges, bonuses.startingShields || Math.min(2, sugar));
        this.hasShield = this.shieldCharges > 0;
      }
      if (bonuses.startingBlastRadiusBonus > 0) {
        this.bombPower = Math.min(MAX_BOMB_POWER_CAP, BASE_BOMB_POWER + bonuses.startingBlastRadiusBonus);
      }
      if (bonuses.maxBombCapacity > 6) {
        this.maxBombs = Math.min(MAX_BOMBS_CAP, bonuses.maxBombCapacity);
      }
      this.emitStatsUpdate();
    }
  };

  private onRelicsUpdated = (relicsPayload: unknown) => {
    if (this.relicManager) {
      const equipped = this.relicManager.getEquippedRelics();
      for (const r of equipped) {
        this.relicManager.unequipRelic(r);
      }
      if (Array.isArray(relicsPayload)) {
        for (const r of relicsPayload) {
          this.relicManager.equipRelic(r as RelicId);
        }
      } else if (relicsPayload && typeof relicsPayload === 'object' && 'equipped' in relicsPayload && Array.isArray((relicsPayload as { equipped: RelicId[] }).equipped)) {
        for (const r of (relicsPayload as { equipped: RelicId[] }).equipped) {
          this.relicManager.equipRelic(r as RelicId);
        }
      }
    }
    this.emitStatsUpdate();
  };

  private onResumeRunState = (savedRun: unknown) => {
    if (!savedRun || typeof savedRun !== 'object') {
      this.emitStatsUpdate();
      return;
    }
    const state = savedRun as Partial<SerializedRunState>;

    // 1. Restore score
    if (state.meta && typeof state.meta.score === 'number') {
      this.score = state.meta.score;
    }

    // 2. Restore board
    if (state.board) {
      let restoredMap: number[][] | undefined = state.board.map;
      if ((!restoredMap || restoredMap.length === 0) && state.board.mapRLE) {
        try {
          restoredMap = decompressGrid(state.board.mapRLE, state.board.rows || ROWS, state.board.cols || COLS);
        } catch {
          // ignore decompression failure
        }
      }
      if (restoredMap && restoredMap.length === ROWS && restoredMap[0]?.length === COLS) {
        this.map = restoredMap.map((row) => [...row]);
        if (this.blocks) {
          this.blocks.clear(true, true);
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              if (this.map[r][c] === TILE_BLOCK) {
                const block = this.blocks.create(
                  c * TILE_SIZE + TILE_SIZE / 2,
                  r * TILE_SIZE + TILE_SIZE / 2,
                  'block'
                ) as Phaser.Physics.Arcade.Sprite;
                block.setDepth(RENDER_DEPTH.BLOCKS);
                block.setImmovable(true);
                (block.body as Phaser.Physics.Arcade.StaticBody)?.updateFromGameObject();
              }
            }
          }
        }
      }
    }

    // 3. Restore player stats & position
    if (state.player) {
      if (typeof state.player.x === 'number' && typeof state.player.y === 'number' && this.player) {
        this.player.setPosition(state.player.x, state.player.y);
        this.player.body?.reset(state.player.x, state.player.y);
      }
      if (state.player.facing) {
        this.playerFacing = state.player.facing;
      }
      if (state.player.stats) {
        const s = state.player.stats;
        if (typeof s.bombPower === 'number') this.bombPower = s.bombPower;
        if (typeof s.maxBombs === 'number') this.maxBombs = s.maxBombs;
        if (typeof s.hasKick === 'boolean') this.hasKick = s.hasKick;
        if (typeof s.hasShield === 'boolean') this.hasShield = s.hasShield;
        if (typeof s.shieldCharges === 'number') this.shieldCharges = s.shieldCharges;
        if (typeof s.hasWallPass === 'boolean') this.hasWallPass = s.hasWallPass;
        if (typeof s.hasBombPass === 'boolean') this.hasBombPass = s.hasBombPass;
        if (typeof s.extraLives === 'number') this.extraLives = s.extraLives;
      }
    }

    // 4. Restore items
    if (this.items && Array.isArray(state.activeItems)) {
      this.items.clear(true, true);
      for (const it of state.activeItems) {
        if (it && typeof it.row === 'number' && typeof it.col === 'number' && it.itemType) {
          this.spawnItem(it.row, it.col, it.itemType as ItemType);
        }
      }
    }

    // 5. Restore crisis & situation log state
    if (state.crisis && this.crisisManager) {
      this.crisisManager.deserialize(state.crisis);
      if (this.situationLog) {
        if (state.situationLog) {
          this.situationLog.deserialize(state.situationLog);
        } else {
          this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now(), true);
        }
      }
    } else if (state.crisis === null && this.crisisManager) {
      this.crisisManager.stopCrisis('reset');
      if (this.situationLog) {
        this.situationLog.reset();
      }
    } else if (state.situationLog && this.situationLog) {
      this.situationLog.deserialize(state.situationLog);
    }

    this.emitStatsUpdate();
  };

  public captureRunState(saveTrigger: SaveTriggerType = 'manual'): SerializedRunState {
    const serializedBombs: SerializedBomb[] = [];
    if (this.bombs) {
      this.bombs.getChildren().forEach((b) => {
        const bomb = b as Phaser.Physics.Arcade.Sprite & {
          id?: string | number;
          fuseRemainingMs?: number;
          power?: number;
          owner?: string;
          bombType?: string;
        };
        if (bomb.active) {
          const col = Math.floor(bomb.x / TILE_SIZE);
          const row = Math.floor(bomb.y / TILE_SIZE);
          serializedBombs.push({
            id: bomb.id || `bomb_${row}_${col}_${Date.now()}`,
            x: bomb.x,
            y: bomb.y,
            row,
            col,
            fuseRemainingMs: typeof bomb.fuseRemainingMs === 'number' ? bomb.fuseRemainingMs : 2000,
            power: typeof bomb.power === 'number' ? bomb.power : this.bombPower,
            owner: bomb.owner || 'player',
            bombType: bomb.bombType || 'standard',
          });
        }
      });
    }

    const serializedItems: SerializedItem[] = [];
    if (this.items) {
      this.items.getChildren().forEach((it) => {
        const item = it as Phaser.Physics.Arcade.Sprite & { itemType?: string };
        if (item.active) {
          const col = Math.floor(item.x / TILE_SIZE);
          const row = Math.floor(item.y / TILE_SIZE);
          serializedItems.push({
            row,
            col,
            itemType: item.itemType || 'bomb_up',
            spawnTime: Date.now(),
          });
        }
      });
    }

    const serializedEntities: SerializedEntity[] = [];
    if (this.enemies) {
      this.enemies.getChildren().forEach((e) => {
        const enemy = e as Phaser.Physics.Arcade.Sprite & {
          id?: string | number;
          archetype?: string;
          faction?: 'enemy' | 'neutral' | 'ally';
          hp?: number;
          maxHp?: number;
          aiState?: string;
        };
        if (enemy.active) {
          serializedEntities.push({
            id: enemy.id || `enemy_${Date.now()}`,
            archetype: enemy.archetype || 'slime',
            faction: enemy.faction || 'enemy',
            x: enemy.x,
            y: enemy.y,
            hp: typeof enemy.hp === 'number' ? enemy.hp : 1,
            maxHp: typeof enemy.maxHp === 'number' ? enemy.maxHp : 1,
            aiState: enemy.aiState || 'IDLE',
          });
        }
      });
    }

    const playerCol = this.player ? Math.floor(this.player.x / TILE_SIZE) : 1;
    const playerRow = this.player ? Math.floor(this.player.y / TILE_SIZE) : 1;

    const crisisState = this.crisisManager ? this.crisisManager.serialize() : null;
    const sitLogState = this.situationLog ? this.situationLog.serialize() : null;

    return {
      version: 1,
      timestamp: Date.now(),
      saveTrigger,
      meta: {
        runId: `run_${Date.now()}`,
        stageIndex: 1,
        gameMode: 'STANDARD' as GameModeType,
        score: this.score,
        elapsedTimeMs: 0,
        activeCrisesCount: crisisState && crisisState.stage !== CrisisStage.INACTIVE ? 1 : 0,
        bossEncounterActive: Boolean(this.activeBoss),
      },
      player: {
        x: this.player ? this.player.x : 60,
        y: this.player ? this.player.y : 60,
        gridRow: playerRow,
        gridCol: playerCol,
        facing: this.playerFacing || 'down',
        stats: this.getStats(),
        hp: this.extraLives + 1,
      },
      board: {
        rows: ROWS,
        cols: COLS,
        mapRLE: compressGrid(this.map || []),
        map: this.map ? this.map.map((r) => [...r]) : undefined,
      },
      activeBombs: serializedBombs,
      activeEntities: serializedEntities,
      activeItems: serializedItems,
      crisis: crisisState,
      situationLog: sitLogState,
      checksum: '',
    };
  }

  public init(data?: unknown): void {
    void data;
    this.isGameOver = false;
    this.activeBombs = 0;
    this.playerFacing = 'down';
    this.isHitStopActive = false;
    this.lastHitStopMs = 0;
    if (this.hitStopTimeout) {
      clearTimeout(this.hitStopTimeout);
      this.hitStopTimeout = null;
    }
    this.playerStepCycle = 0;
    this.playerBobOffset = 0;
    this.conveyors = [...DEFAULT_CONVEYORS];
    this.persistentHazardMask.clear();
    this.lastGravitationalEscapeTimestampMs = 0;
    this.lastFrostChillFloatingTextMs = -9999;
    this.lastStaticShockFloatingTextMs = -9999;
    this.lastThermalSingeFloatingTextMs = -9999;
    this.lastNeurotoxinFloatingTextMs = -9999;
    this.lastTemporalDilationFloatingTextMs = -9999;
    this.lastSunstrokeFloatingTextMs = -9999;
    this.destroyedBlocksThisTick.clear();
    this.bossHitBombIds.clear();
    this.scratchActiveEntities.length = 0;
    this.scratchActiveEnemies.length = 0;
    this.scratchActiveItems.length = 0;
  }

  public destroy(): void {
    this.shutdown();
  }

  public shutdown(): void {
    if (this.events) {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
      this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    }
    if (this.game && this.game.events) {
      this.game.events.off('mode-changed', this.onModeChanged);
      this.game.events.off('perks-updated', this.onPerksUpdated);
      this.game.events.off('relics-updated', this.onRelicsUpdated);
      this.game.events.off('resume-run-state', this.onResumeRunState);
    }
    if (this.time && typeof this.time.removeAllEvents === 'function') {
      this.time.removeAllEvents();
    }
    if (this.tweens && typeof this.tweens.killAll === 'function') {
      this.tweens.killAll();
    }
    this.isHitStopActive = false;
    this.lastHitStopMs = 0;
    if (this.hitStopTimeout) {
      clearTimeout(this.hitStopTimeout);
      this.hitStopTimeout = null;
    }
    if (this.physics && this.physics.world && this.physics.world.isPaused) {
      this.physics.world.resume();
    }
    if (this.input?.keyboard && typeof this.input.keyboard.resetKeys === 'function') {
      this.input.keyboard.resetKeys();
    }

    this.dismissBoss();
    this.stopCrisisMode();
    this.crisisManager?.reset();
    this.bossHitBombIds.clear();
    this.destroyedBlocksThisTick.clear();
    this.scratchActiveEntities.length = 0;
    this.scratchActiveEnemies.length = 0;
    this.scratchActiveItems.length = 0;
    this.activeBuffs = [];
    this.persistentHazardMask.clear();
    this.floatingTextManager?.reset();
    this.overheadUIManager?.reset();

    // Clear entity physics groups BEFORE destroying object pools so drop shadows release cleanly
    this.enemies?.clear(true, true);
    this.neutrals?.clear(true, true);
    this.allies?.clear(true, true);
    this.bombs?.clear(true, true);
    this.items?.clear(true, true);
    this.explosions?.clear(true, true);
    this.blocks?.clear(true, true);
    this.walls?.clear(true, true);

    if (this.aegisDomeVisual) {
      this.aegisDomeVisual.destroy();
      this.aegisDomeVisual = null;
    }
    if (this.shieldVisual) {
      if (this.graphicsPool) {
        this.graphicsPool.release(this.shieldVisual);
      } else {
        this.shieldVisual.destroy();
      }
      this.shieldVisual = null;
    }
    if (this.playerDropShadow) {
      if (this.shadowPool) {
        this.shadowPool.release(this.playerDropShadow);
      } else {
        this.playerDropShadow.destroy();
      }
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
    if (this.frostHazardAudio) {
      this.frostHazardAudio.destroy();
    }
    if (this.voltHazardAudio) {
      this.voltHazardAudio.destroy();
    }
    if (this.magmaHazardAudio) {
      this.magmaHazardAudio.destroy();
    }
    if (this.miasmaHazardAudio) {
      this.miasmaHazardAudio.destroy();
    }
    if (this.chronoHazardAudio) {
      this.chronoHazardAudio.destroy();
    }
    if (this.solarHazardAudio) {
      this.solarHazardAudio.destroy();
    }
    if (this.nebulaHazardAudio) {
      this.nebulaHazardAudio.destroy();
    }
    webAudioSynth.destroy();
    AudioVoicePool.resetInstance();

    if (this.telegraphGraphics) {
      this.telegraphGraphics.destroy();
      this.telegraphGraphics = null;
    }
    if (this.bossGraphics) {
      this.bossGraphics.destroy();
      this.bossGraphics = null;
    }
    if (this.bossPhaseBarGraphics) {
      this.bossPhaseBarGraphics.destroy();
      this.bossPhaseBarGraphics = null;
    }
    if (this.crisisGraphics) {
      this.crisisGraphics.destroy();
      this.crisisGraphics = null;
    }
    if (this.hazardGraphics) {
      this.hazardGraphics.destroy();
      this.hazardGraphics = null;
    }

    this.circlePool?.destroy();
    this.rectPool?.destroy();
    this.graphicsPool?.destroy();
    this.spritePool?.destroy();
    this.shadowPool?.destroy();
    this.floatingTextPool?.destroy();
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
    // Generate procedural textures for items, drop shadows, and VFX particles first
    this.generateItemTextures();
    this.ensureJuiceTextures();

    this.circlePool = new Pooling.ObjectPool({
      capacity: 512,
      factory: () => this.add.circle(-1000, -1000, 4, 0xffffff, 1).setVisible(false).setActive(false),
      reset: (arc) => { arc.setVisible(false).setActive(false); if(this.tweens) this.tweens.killTweensOf(arc); }
    });
    this.rectPool = new Pooling.ObjectPool({
      capacity: 512,
      factory: () => this.add.rectangle(-1000, -1000, 4, 4, 0xffffff).setVisible(false).setActive(false),
      reset: (rect) => { rect.setVisible(false).setActive(false); if(this.tweens) this.tweens.killTweensOf(rect); }
    });
    this.graphicsPool = new Pooling.ObjectPool({
      capacity: 256,
      factory: () => this.add.graphics().setVisible(false).setActive(false),
      reset: (g) => { g.clear(); g.setVisible(false).setActive(false); if(this.tweens) this.tweens.killTweensOf(g); }
    });
    this.spritePool = new Pooling.ObjectPool({
      capacity: 128,
      factory: () => this.add.sprite(-1000, -1000, 'player').setVisible(false).setActive(false),
      reset: (s) => { s.setVisible(false).setActive(false); if(this.tweens) this.tweens.killTweensOf(s); }
    });
    this.shadowPool = new Pooling.ObjectPool({
      capacity: 256,
      factory: () => {
        const key = this.textures && this.textures.exists('shadow_ellipse') ? 'shadow_ellipse' : '';
        return this.add.sprite(-1000, -1000, key).setVisible(false).setActive(false);
      },
      reset: (s) => { s.setVisible(false).setActive(false); if(this.tweens) this.tweens.killTweensOf(s); }
    });
    this.floatingTextPool = new Pooling.ObjectPool({
      capacity: Pooling.POOL_PRESETS.FLOATING_TEXT,
      factory: () => this.add.text(-1000, -1000, '', {
        fontSize: '12px',
        fontStyle: 'bold',
        fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5, 0.5).setVisible(false).setActive(false),
      reset: (t) => { t.setVisible(false).setActive(false); if(this.tweens) this.tweens.killTweensOf(t); }
    });
    this.isGameOver = false;
    this.isHitStopActive = false;
    if (this.physics && this.physics.world && this.physics.world.isPaused) {
      this.physics.world.resume();
    }
    if (this.physics && this.physics.world) {
      this.physics.world.setBounds(0, 0, 600, 520);
    }
    this.relicManager = new RelicManager();
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
    this.dashBufferRemaining = 0;
    this.bombBufferRemaining = 0;
    this.ultBufferRemaining = 0;
    this.dashSpeedBurstRemaining = 0;
    this.dashSpeedBurstMultiplier = 1.0;
    this.dashStartTime = 0;
    this.phaseJitterRemaining = 0;
    this.lastQuantumTunnelTimestampMs = 0;
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
    this.overheadUIManager = new OverheadUIManager(true);
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
    if (this.anims) {
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
    }


    // Background image at (400, 300) with setScrollFactor(0) and setDepth(RENDER_DEPTH.BACKGROUND)
    if (typeof this.add?.image === 'function') {
      const bg = this.add.image(400, 300, 'background');
      bg?.setScrollFactor?.(0);
      bg?.setDepth?.(RENDER_DEPTH.BACKGROUND);
    }

    // Physics Groups
    this.walls = this.physics.add.staticGroup();
    this.blocks = this.physics.add.staticGroup();
    this.bombs = this.physics.add.group({ maxSize: Pooling.POOL_PRESETS.BOMBS, classType: Phaser.Physics.Arcade.Sprite, defaultKey: 'bomb' });
    this.explosions = this.physics.add.group({ maxSize: Pooling.POOL_PRESETS.EXPLOSIONS, classType: Phaser.Physics.Arcade.Sprite, defaultKey: 'explosion' });
    this.enemies = this.physics.add.group({ maxSize: 128 });
    this.neutrals = this.physics.add.group({ maxSize: 32 });
    this.allies = this.physics.add.group({ maxSize: 32 });
    this.items = this.physics.add.group({ maxSize: Pooling.POOL_PRESETS.ITEM_DROPS });

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
      this.playerDropShadow = (this.shadowPool ? this.shadowPool.acquire() : null) ?? undefined;
      if (this.playerDropShadow) {
        this.playerDropShadow.setActive(true).setVisible(true).setPosition(this.player.x, this.player.y + 14);
        this.playerDropShadow.setDepth(6);
        this.playerDropShadow.setAlpha(0.45);
        this.playerDropShadow.setScale(1.0, 0.7);
      }
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
      const b = bombObj as Phaser.Physics.Arcade.Sprite;
      if (b && b.getData('isSliding')) return false;
      const n = neutralObj as Phaser.Physics.Arcade.Sprite;
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
      const b = bombObj as Phaser.Physics.Arcade.Sprite;
      if (b && b.getData('isSliding')) return false;
      const a = allyObj as Phaser.Physics.Arcade.Sprite;
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
      const shadow = item.getData('itemShadow') as Phaser.GameObjects.Sprite | null;
      if (shadow && shadow.active) {
        if (this.tweens) this.tweens.killTweensOf(shadow);
        if (this.shadowPool) this.shadowPool.release(shadow);
        item.setData('itemShadow', null);
      }
      if (this.tweens) this.tweens.killTweensOf(item);
      if (item.active) { item.disableBody(true, true); }
    });

    // Explosions destroy items ONLY after 600ms grace period
    this.physics.add.overlap(this.items, this.explosions, (itemObj) => {
      const item = itemObj as Phaser.Physics.Arcade.Sprite;
      if (!item || !item.active) return;
      const spawnTime = (item.getData('spawnTime') as number) || 0;
      if (!isItemProtectedFromExplosion(spawnTime, this.time.now)) {
        const shadow = item.getData('itemShadow') as Phaser.GameObjects.Sprite | null;
        if (shadow && shadow.active) {
          if (this.tweens) this.tweens.killTweensOf(shadow);
          if (this.shadowPool) this.shadowPool.release(shadow);
          item.setData('itemShadow', null);
        }
        if (this.tweens) this.tweens.killTweensOf(item);
        if (item.active) { item.disableBody(true, true); }
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

    // Sliding bomb hits allies or neutrals gracefully without jittering (PHYS-REV-05)
    this.physics.add.overlap(this.bombs, this.allies, (bombObj, allyObj) => {
      const bomb = bombObj as Phaser.Physics.Arcade.Sprite;
      const ally = allyObj as BaseEntity;
      if (bomb.active && bomb.getData('isSliding') && ally && ally.active) {
        const bCol = Math.floor(bomb.x / TILE_SIZE);
        const bRow = Math.floor(bomb.y / TILE_SIZE);
        bomb.setVelocity(0, 0);
        bomb.setData('isSliding', false);
        (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
        bomb.setPosition(bCol * TILE_SIZE + TILE_SIZE / 2, bRow * TILE_SIZE + TILE_SIZE / 2);
      }
    });

    this.physics.add.overlap(this.bombs, this.neutrals, (bombObj, neutralObj) => {
      const bomb = bombObj as Phaser.Physics.Arcade.Sprite;
      const neutral = neutralObj as BaseEntity;
      if (bomb.active && bomb.getData('isSliding') && neutral && neutral.active) {
        const bCol = Math.floor(bomb.x / TILE_SIZE);
        const bRow = Math.floor(bomb.y / TILE_SIZE);
        bomb.setVelocity(0, 0);
        bomb.setData('isSliding', false);
        (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
        bomb.setPosition(bCol * TILE_SIZE + TILE_SIZE / 2, bRow * TILE_SIZE + TILE_SIZE / 2);
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
            if (enemy.active) { enemy['disableBody'](true, true); }
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
      const allies = this.allies.getChildren();
      for (let i = 0; i < allies.length; i++) {
        const child = allies[i];
        if (child.active && child instanceof ShieldGuardAlly) {
          this.scratchPlayerVector.x = this.player.x;
          this.scratchPlayerVector.y = this.player.y;
          this.scratchExpVector.x = exp.x;
          this.scratchExpVector.y = exp.y;
          if (
            child.tryAbsorbExplosionForPlayer(
              this.scratchPlayerVector,
              this.scratchExpVector,
              owner
            )
          ) {
            absorbed = true;
            break;
          }
        }
      }
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
          if (target.active) { target['disableBody'](true, true); }
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

        let enemy = this.enemies.getChildren().find((e) => {
          const pe = e as unknown as PooledEnemySprite;
          return !pe.active && pe.archetype === archetype;
        }) as unknown as PooledEnemySprite | undefined;
        if (enemy) {
          enemy.enableBody(true, x, y, true, true);
          enemy.hp = enemy.maxHp;
          if (enemy.reset) enemy.reset();
        } else {
          enemy = createEnemy(this, archetype, x, y);
          enemy.archetype = archetype;
          this.enemies.add(enemy);
          this.attachEntityDropShadow(enemy);
        }
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
            const ao = this.rectPool ? this.rectPool.acquire() : null;
            if (ao) {
              ao.setActive(true).setVisible(true).setPosition(c * TILE_SIZE + TILE_SIZE / 2, (r + 1) * TILE_SIZE + 2)
                .setSize(TILE_SIZE, 4).setFillStyle(0x000000, 0.28).setAlpha(0.28).setScale(1).setAngle(0);
              ao.setDepth(1);
            }
          }
        }
        // Inner fixed pillars
        else if (r % 2 === 0 && c % 2 === 0) {
          this.map[r][c] = TILE_WALL;
          const wall = this.walls.create(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'wall') as Phaser.Physics.Arcade.Sprite;
          wall.setDepth(RENDER_DEPTH.WALLS);
          wall.refreshBody();
          if (r < ROWS - 1) {
            const ao = this.rectPool ? this.rectPool.acquire() : null;
            if (ao) {
              ao.setActive(true).setVisible(true).setPosition(c * TILE_SIZE + TILE_SIZE / 2, (r + 1) * TILE_SIZE + 2)
                .setSize(TILE_SIZE, 4).setFillStyle(0x000000, 0.28).setAlpha(0.28).setScale(1).setAngle(0);
              ao.setDepth(1);
            }
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
              const ao = this.rectPool ? this.rectPool.acquire() : null;
              if (ao) {
                ao.setActive(true).setVisible(true).setPosition(c * TILE_SIZE + TILE_SIZE / 2, (r + 1) * TILE_SIZE + 2)
                  .setSize(TILE_SIZE, 4).setFillStyle(0x000000, 0.28).setAlpha(0.28).setScale(1).setAngle(0);
                ao.setDepth(1);
                block.setData('aoShadow', ao);
              }
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
    this.bossPhaseBarGraphics = this.add.graphics();
    this.bossPhaseBarGraphics.setDepth(RENDER_DEPTH.BOSS_PHASE_BARS);
    this.telegraphEngine = new TelegraphEngine(this.telegraphGraphics);

    // Initialize Crisis Subsystem Renderers & Bridge
    this.situationLog = new SituationLog(this.game);
    this.crisisGraphics = this.add.graphics();
    this.crisisGraphics.setDepth(RENDER_DEPTH.CRISIS_HAZARDS);

    // Initialize Dynamic Hazard System (Quantum Spire Hazard & Frost Hazard)
    this.frostHazardAudio = FrostHazardAudio.getInstance();
    this.voltHazardAudio = VoltHazardAudio.getInstance();
    this.magmaHazardAudio = MagmaHazardAudio.getInstance();
    this.miasmaHazardAudio = MiasmaHazardAudio.getInstance();
    this.chronoHazardAudio = ChronoHazardAudio.getInstance();
    this.solarHazardAudio = SolarHazardAudio.getInstance();
    this.nebulaHazardAudio = NebulaHazardAudio.getInstance();

    this.dynamicHazard.init(this.map);
    this.gravityHazard.init(6, 7);
    this.frostHazard.init(6, 7);
    this.voltHazard.init(6, 7);
    this.magmaHazard.init(6, 7);
    this.miasmaHazard.init(6, 7);
    this.chronoHazard.init(6, 7);
    this.solarHazard.init(6, 7);
    this.nebulaHazard.init(6, 7);
    this.hazardGraphics = this.add.graphics();
    this.hazardGraphics.setDepth(RENDER_DEPTH.CRISIS_HAZARDS);

    // Wire Game Mode Changes & Meta-Progression Events (UI-06, MEM-01)
    if (this.events) {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
      this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
      this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    }
    if (this.game && this.game.events) {
      this.game.events.off('mode-changed', this.onModeChanged);
      this.game.events.off('perks-updated', this.onPerksUpdated);
      this.game.events.off('relics-updated', this.onRelicsUpdated);
      this.game.events.off('resume-run-state', this.onResumeRunState);

      this.game.events.on('mode-changed', this.onModeChanged);
      this.game.events.on('perks-updated', this.onPerksUpdated);
      this.game.events.on('relics-updated', this.onRelicsUpdated);
      this.game.events.on('resume-run-state', this.onResumeRunState);
    }
  }

  public startBossEncounter(bossId: string): void {
    this.dismissBoss();

    const startX = 300;
    const startY = 260;

    if (bossId === 'captain_nibbles' || bossId === 'boss_hamster_nibbles') {
      this.activeBoss = new HamsterBoss(startX, startY);
    } else if (bossId === 'queen_bee_cupcake' || bossId === 'boss_queen_bee') {
      this.activeBoss = new QueenBeeBoss(startX, startY);
    } else if (bossId === 'boss_mutant_flora' || bossId === 'mutant_flora' || bossId === 'verdant_terror') {
      this.activeBoss = new MutantFloraBoss(startX, startY);
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
    if (this.bossPhaseBarGraphics) {
      this.bossPhaseBarGraphics.clear();
    }
    if (this.bossHUD) {
      this.bossHUD.dismissBoss();
    }
    this.bossHitBombIds.clear();
    if (this.activeBoss) {
      if (typeof (this.activeBoss as unknown as { destroy?: () => void }).destroy === 'function') {
        (this.activeBoss as unknown as { destroy: () => void }).destroy();
      }
      this.activeBoss = null;
    }
  }

  update(_time: number, delta: number) {
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta <= 0) return;
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

    // Update post-dash speed burst
    if (this.dashSpeedBurstRemaining > 0) {
      this.dashSpeedBurstRemaining = Math.max(0, this.dashSpeedBurstRemaining - delta);
      if (this.dashSpeedBurstRemaining === 0) {
        this.dashSpeedBurstMultiplier = 1.0;
      }
    }

    // 1. Dash cooldown & portal cooldown decrements (SPEED_SURGE halves dash cooldown)
    let hasSpeedSurge = false;
    if (this.activeBuffs) {
      for (let bi = 0; bi < this.activeBuffs.length; bi++) {
        if (this.activeBuffs[bi].id === 'SPEED_SURGE') {
          hasSpeedSurge = true;
          break;
        }
      }
    }
    const cdMult = hasSpeedSurge ? 2 : 1;
    const mobileFairnessMult = this.isMobileDevice() ? 1.15 : 1.0;
    if (this.dashCooldownRemaining > 0) {
      const prevCd = this.dashCooldownRemaining;
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - delta * cdMult * mobileFairnessMult);
      if (prevCd > 0 && this.dashCooldownRemaining === 0) {
        this.emitStatsUpdate();
      }
    }

    if (this.portalCooldown > 0) {
      this.portalCooldown = Math.max(0, this.portalCooldown - delta);
    }

    // 1b. Active buffs countdown & Phase Jitter decrement
    if (this.phaseJitterRemaining > 0) {
      this.phaseJitterRemaining = Math.max(0, this.phaseJitterRemaining - delta);
    }

    if (this.activeBuffs && this.activeBuffs.length > 0) {
      let buffChanged = false;
      for (let bi = 0; bi < this.activeBuffs.length; bi++) {
        const b = this.activeBuffs[bi];
        b.remainingMs = Math.max(0, b.remainingMs - delta);
        if (b.remainingMs <= 0) buffChanged = true;
      }
      if (buffChanged) {
        let writeIdx = 0;
        let hasTimeFreeze = false;
        let hasCloak = false;
        for (let bi = 0; bi < this.activeBuffs.length; bi++) {
          const b = this.activeBuffs[bi];
          if (b.remainingMs > 0) {
            this.activeBuffs[writeIdx++] = b;
            if (b.id === 'TIME_FREEZE') hasTimeFreeze = true;
            if (b.id === 'CLOAK') hasCloak = true;
          }
        }
        this.activeBuffs.length = writeIdx;
        this.isTimeFrozen = hasTimeFreeze;
        this.isCloaked = hasCloak;
        if (this.player && this.player.active) {
          this.player.setAlpha(this.isCloaked ? 0.35 : 1.0);
        }
        this.emitStatsUpdate();
      }
    }

    // 1c. Item magnet attraction aura (3 tiles = 120px on desktop, 140px on mobile)
    if (this.hasMagnet && this.player && this.player.active) {
      const pullDist = this.isMobileDevice() ? 140 : 120;
      const pullSpeed = 160 * (delta / 1000);
      const itemsList = this.items.getChildren();
      for (let i = 0; i < itemsList.length; i++) {
        const it = itemsList[i] as Phaser.Physics.Arcade.Sprite;
        if (it && it.active) {
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
          if (d <= pullDist && d > 6) {
            const angle = Phaser.Math.Angle.Between(it.x, it.y, this.player.x, this.player.y);
            it.x += Math.cos(angle) * pullSpeed;
            it.y += Math.sin(angle) * pullSpeed;
          }
        }
      }
    }

    // 2. Dash skill trigger check (with 250ms input buffer)
    const mInput = window.mobileInput || DEFAULT_MOBILE_INPUT;
    const dashPressed = Boolean(this.shiftKey?.isDown || this.eKey?.isDown || mInput.dash);
    if (mInput.dash) mInput.dash = false; // consume mobile dash

    if (dashPressed) {
      if (
        !this.isDashing &&
        this.dashCooldownRemaining <= 0 &&
        this.phaseJitterRemaining <= 0 &&
        !this.isGameOver
      ) {
        this.dashBufferRemaining = 0;
        this.performDash();
      } else if (this.dashCooldownRemaining > 0 && this.dashCooldownRemaining <= 250 && !this.isGameOver) {
        this.dashBufferRemaining = this.dashCooldownRemaining + 16;
      }
    } else if (this.dashBufferRemaining > 0) {
      this.dashBufferRemaining -= delta;
      if (
        !this.isDashing &&
        this.dashCooldownRemaining <= 0 &&
        this.phaseJitterRemaining <= 0 &&
        !this.isGameOver
      ) {
        this.dashBufferRemaining = 0;
        this.performDash();
      }
    }

    // 2b. Ultimate Skill selection via 1-5 keys
    if (this.num1Key && Phaser.Input.Keyboard.JustDown(this.num1Key)) { this.activeUltimate = 'METEOR_STRIKE'; this.emitStatsUpdate(); }
    if (this.num2Key && Phaser.Input.Keyboard.JustDown(this.num2Key)) { this.activeUltimate = 'SUPER_NOVA'; this.emitStatsUpdate(); }
    if (this.num3Key && Phaser.Input.Keyboard.JustDown(this.num3Key)) { this.activeUltimate = 'CHRONO_FREEZE'; this.emitStatsUpdate(); }
    if (this.num4Key && Phaser.Input.Keyboard.JustDown(this.num4Key)) { this.activeUltimate = 'NUCLEAR_BARRAGE'; this.emitStatsUpdate(); }
    if (this.num5Key && Phaser.Input.Keyboard.JustDown(this.num5Key)) { this.activeUltimate = 'AEGIS_OVERDRIVE'; this.emitStatsUpdate(); }

    // 2c. Ultimate Skill trigger (Hotkeys 'R', 'Q', or mobileInput.ultimate with 250ms input buffer)
    const ultPressed = Boolean(
      (this.rKey && Phaser.Input.Keyboard.JustDown(this.rKey)) ||
      (this.qKey && Phaser.Input.Keyboard.JustDown(this.qKey)) ||
      mInput.ultimate
    );
    if (mInput.ultimate) mInput.ultimate = false; // consume mobile ultimate

    if (ultPressed) {
      if (
        this.phaseJitterRemaining <= 0 &&
        !this.isGameOver &&
        this.ultimateGauge >= this.ultimateMax &&
        this.ultimateLockoutRemaining <= 0
      ) {
        this.ultBufferRemaining = 0;
        this.triggerUltimate(this.activeUltimate);
      } else if (
        this.ultimateLockoutRemaining > 0 &&
        this.ultimateLockoutRemaining <= 250 &&
        this.ultimateGauge >= this.ultimateMax &&
        !this.isGameOver
      ) {
        this.ultBufferRemaining = this.ultimateLockoutRemaining + 16;
      }
    } else if (this.ultBufferRemaining > 0) {
      this.ultBufferRemaining -= delta;
      if (
        this.phaseJitterRemaining <= 0 &&
        !this.isGameOver &&
        this.ultimateGauge >= this.ultimateMax &&
        this.ultimateLockoutRemaining <= 0
      ) {
        this.ultBufferRemaining = 0;
        this.triggerUltimate(this.activeUltimate);
      }
    }

    // 3. Movement & Juice
    this.updatePlayerMovement(delta);
    this.updatePlayerJuice(delta, _time);

    // 4. Bomb placement (with 250ms input buffer)
    const bombPressed = Boolean(Phaser.Input.Keyboard.JustDown(this.spaceKey) || mInput.bomb);
    if (mInput.bomb) mInput.bomb = false; // consume mobile input

    if (bombPressed) {
      if (this.activeBombs < this.maxBombs && !this.isGameOver) {
        this.bombBufferRemaining = 0;
        this.placeBomb();
      } else if (this.activeBombs >= this.maxBombs && !this.isGameOver) {
        this.bombBufferRemaining = 250;
      }
    } else if (this.bombBufferRemaining > 0) {
      this.bombBufferRemaining -= delta;
      if (this.activeBombs < this.maxBombs && !this.isGameOver) {
        this.bombBufferRemaining = 0;
        this.placeBomb();
      }
    }

    // 5. Conveyor belt push drift for player (PHYS-03: AABB bounds check)
    const pCol = Math.floor(this.player.x / TILE_SIZE);
    const pRow = Math.floor(this.player.y / TILE_SIZE);
    const belt = this.getConveyorAt(pRow, pCol);
    if (belt && !this.isDashing && this.player && this.player.active) {
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
        this.isTilePassableForPlayer(leadRow, leadCol, pRow, pCol) &&
        this.isTilePassableForPlayer(Math.floor((leadY + perpY) / TILE_SIZE), Math.floor((leadX + perpX) / TILE_SIZE), pRow, pCol) &&
        this.isTilePassableForPlayer(Math.floor((leadY - perpY) / TILE_SIZE), Math.floor((leadX - perpX) / TILE_SIZE), pRow, pCol);

      if (canMove) {
        this.player.setPosition(nextX, nextY);
      }
    }

    // 6. Teleport Portal warp
    if (this.portalCooldown <= 0 && this.player && this.player.active) {
      if (pRow === DEFAULT_PORTALS.portalA.row && pCol === DEFAULT_PORTALS.portalA.col) {
        this.warpPlayer(DEFAULT_PORTALS.portalB.row, DEFAULT_PORTALS.portalB.col);
      } else if (pRow === DEFAULT_PORTALS.portalB.row && pCol === DEFAULT_PORTALS.portalB.col) {
        this.warpPlayer(DEFAULT_PORTALS.portalA.row, DEFAULT_PORTALS.portalA.col);
      }
    }

    // 7. Conveyor push drift for bombs & sliding bomb physics
    const bombsList = this.bombs.getChildren();
    for (let bi = 0; bi < bombsList.length; bi++) {
      const bomb = bombsList[bi] as Phaser.Physics.Arcade.Sprite;
      if (!bomb || !bomb.active) continue;

      const bCol = Math.floor(bomb.x / TILE_SIZE);
      const bRow = Math.floor(bomb.y / TILE_SIZE);

      if (bomb.getData('isSliding')) {
        const dir = bomb.getData('slideDir') as { x: number; y: number };
        let currentSpeed = (bomb.getData('slideSpeed') as number) || BOMB_KICK_SPEED;

        // Dynamic hazard tile interaction while sliding:
        if (this.miasmaHazard && this.miasmaHazard.state !== MiasmaLifecycleState.DORMANT) {
          const slideRes = this.miasmaHazard.evaluateBombSlide(bRow, bCol, currentSpeed);
          if (slideRes.speed !== currentSpeed) {
            currentSpeed = slideRes.speed;
            bomb.setData('slideSpeed', currentSpeed);
            bomb.setVelocity(dir.x * currentSpeed, dir.y * currentSpeed);
          }
        }
        if (this.chronoHazard && this.chronoHazard.state !== ChronoLifecycleState.DORMANT) {
          const slideRes = this.chronoHazard.evaluateBombSlide(bRow, bCol, currentSpeed);
          if (slideRes.speed !== currentSpeed) {
            currentSpeed = slideRes.speed;
            bomb.setData('slideSpeed', currentSpeed);
            bomb.setVelocity(dir.x * currentSpeed, dir.y * currentSpeed);
          }
        }
        if (this.solarHazard && this.solarHazard.state !== SolarLifecycleState.DORMANT) {
          const slideRes = this.solarHazard.evaluateBombSlide(bRow, bCol, currentSpeed);
          if (slideRes.speed !== currentSpeed) {
            currentSpeed = slideRes.speed;
            bomb.setData('slideSpeed', currentSpeed);
            bomb.setVelocity(dir.x * currentSpeed, dir.y * currentSpeed);
          }
        }
        if (this.nebulaHazard && this.nebulaHazard.state !== NebulaLifecycleState.DORMANT) {
          const slideRes = this.nebulaHazard.evaluateBombSlide(bRow, bCol, currentSpeed);
          if (slideRes.isSlipstreamKick && slideRes.kickSpeed !== currentSpeed) {
            currentSpeed = slideRes.kickSpeed;
            bomb.setData('slideSpeed', currentSpeed);
            bomb.setVelocity(dir.x * currentSpeed, dir.y * currentSpeed);
          }
        }

        const stepDistance = currentSpeed * (delta / 1000);
        const lookahead = Math.max(16, 16 + stepDistance + 2);
        const checkX = bomb.x + dir.x * lookahead;
        const checkY = bomb.y + dir.y * lookahead;
        const targetCol = Math.floor(checkX / TILE_SIZE);
        const targetRow = Math.floor(checkY / TILE_SIZE);

        let blocked = false;
        let stopCol = bCol;
        let stopRow = bRow;

        // Continuous swept-tile raymarch along movement trajectory:
        // Evaluates every tile between current tile and target to guarantee zero tunneling
        // even under extreme kick velocities (up to 460 px/s) and severe lag spikes (100ms+)
        const dCol = Math.sign(dir.x);
        const dRow = Math.sign(dir.y);
        const numSteps = Math.max(Math.abs(targetCol - bCol), Math.abs(targetRow - bRow));

        if (numSteps > 0) {
          for (let s = 1; s <= numSteps; s++) {
            const checkC = bCol + dCol * s;
            const checkR = bRow + dRow * s;

            if (checkR < 0 || checkR >= ROWS || checkC < 0 || checkC >= COLS) {
              blocked = true;
              stopCol = bCol + dCol * (s - 1);
              stopRow = bRow + dRow * (s - 1);
              break;
            } else if (this.map[checkR][checkC] !== TILE_EMPTY) {
              blocked = true;
              stopCol = bCol + dCol * (s - 1);
              stopRow = bRow + dRow * (s - 1);
              break;
            } else {
              let bombHit = false;
              for (let oi = 0; oi < bombsList.length; oi++) {
                const ob = bombsList[oi] as Phaser.Physics.Arcade.Sprite;
                if (ob && ob.active && ob !== bomb) {
                  const obr = Math.floor(ob.y / TILE_SIZE);
                  const obc = Math.floor(ob.x / TILE_SIZE);
                  if (obr === checkR && obc === checkC) {
                    bombHit = true;
                    break;
                  }
                }
              }
              if (bombHit) {
                blocked = true;
                stopCol = bCol + dCol * (s - 1);
                stopRow = bRow + dRow * (s - 1);
                break;
              }
            }
          }
        }

        // Check collision with active boss
        if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
          const bossDist = Phaser.Math.Distance.Between(bomb.x, bomb.y, this.activeBoss.x, this.activeBoss.y);
          if (bossDist < (this.activeBoss.config.colliderRadius || 35) + 16) {
            this.explodeBomb(bomb, bRow, bCol);
            continue;
          }
        }

        if (blocked) {
          bomb.setVelocity(0, 0);
          bomb.setData('isSliding', false);
          (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
          const safeCol = Math.max(0, Math.min(COLS - 1, stopCol));
          const safeRow = Math.max(0, Math.min(ROWS - 1, stopRow));
          bomb.setPosition(safeCol * TILE_SIZE + TILE_SIZE / 2, safeRow * TILE_SIZE + TILE_SIZE / 2);
        }
      } else {
        // Not sliding: check conveyor drift (PHYS-03: AABB bounds check)
        const bBelt = this.getConveyorAt(bRow, bCol);
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

          // Prevent bomb stacking: check if target cell already contains another bomb (PHYS-REV-04)
          let bombBlocking = false;
          if (leadRow !== bRow || leadCol !== bCol) {
            for (let oi = 0; oi < bombsList.length; oi++) {
              const other = bombsList[oi] as Phaser.Physics.Arcade.Sprite;
              if (other !== bomb && other && other.active && Math.floor(other.y / TILE_SIZE) === leadRow && Math.floor(other.x / TILE_SIZE) === leadCol) {
                bombBlocking = true;
                break;
              }
            }
          }

          const canMove =
            !bombBlocking &&
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
    }

    // 8. Shield visual follow
    if (this.hasShield) {
      if (!this.shieldVisual) {
        this.shieldVisual = this.graphicsPool ? this.graphicsPool.acquire() : null;
        if (this.shieldVisual) {
          this.shieldVisual.setActive(true).setVisible(true);
          const pDepth =
            RENDER_DEPTH.ENTITY_Y_BASE + this.player.y * RENDER_DEPTH.ENTITY_Y_SCALE;
          this.shieldVisual.setDepth(pDepth + RENDER_DEPTH.OFFSET_SHIELD);
        }
      }
      if (this.shieldVisual) {
        this.shieldVisual.clear();
        this.shieldVisual.lineStyle(2, 0x38bdf8, 0.85);
        this.shieldVisual.fillStyle(0x0284c7, 0.25);
        this.shieldVisual.strokeCircle(this.player.x, this.player.y, 18);
        this.shieldVisual.fillCircle(this.player.x, this.player.y, 18);
      }
    } else if (this.shieldVisual) {
      if (this.graphicsPool) {
        this.graphicsPool.release(this.shieldVisual);
      } else {
        this.shieldVisual.destroy();
      }
      this.shieldVisual = null;
    }

    // 9. Collect active bomb tiles for AI path avoidance (Zero-GC persistent FlatHazardMask)
    this.persistentHazardMask.clear();
    const bombTiles = this.persistentHazardMask as unknown as Set<string>;
    for (let bi = 0; bi < bombsList.length; bi++) {
      const b = bombsList[bi] as Phaser.Physics.Arcade.Sprite;
      if (b && b.active) {
        const col = Math.floor(b.x / TILE_SIZE);
        const row = Math.floor(b.y / TILE_SIZE);
        this.persistentHazardMask.setCoord(row, col, 1);
      }
    }

    // 10. Update enemies, neutrals, and allies with advanced AI
    const enemiesList = this.enemies.getChildren();
    if (!this.isTimeFrozen) {
      for (let ei = 0; ei < enemiesList.length; ei++) {
        const child = enemiesList[ei] as Phaser.GameObjects.GameObject;
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
      }

      if (this.neutrals) {
        const neutralsList = this.neutrals.getChildren();
        for (let ni = 0; ni < neutralsList.length; ni++) {
          const child = neutralsList[ni] as Phaser.GameObjects.GameObject;
          if (child && child.active) {
            if (child instanceof MerchantNPC) {
              child.updateAI(delta, _time, this.player, this.map, bombTiles);
            } else if (child instanceof CritterNPC) {
              child.updateAI(delta, _time, this.map);
            } else if (child instanceof BaseEntity) {
              child.updateEntity(delta, _time);
            }
          }
        }
      }

      if (this.allies) {
        this.scratchActiveEnemies.length = 0;
        for (let ei = 0; ei < enemiesList.length; ei++) {
          const c = enemiesList[ei];
          if (c && c.active && c instanceof BaseEntity) {
            this.scratchActiveEnemies.push(c);
          }
        }

        this.scratchActiveItems.length = 0;
        const itemChildren = this.items.getChildren();
        for (let ii = 0; ii < itemChildren.length; ii++) {
          const c = itemChildren[ii] as Phaser.Physics.Arcade.Sprite;
          if (c && c.active) {
            this.scratchActiveItems.push(c);
          }
        }
        const activeEnemies = this.scratchActiveEnemies;
        const activeItems = this.scratchActiveItems;

        const alliesList = this.allies.getChildren();
        for (let ai = 0; ai < alliesList.length; ai++) {
          const child = alliesList[ai] as Phaser.GameObjects.GameObject;
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
        }
      }
    } else {
      for (let ei = 0; ei < enemiesList.length; ei++) {
        const enemy = enemiesList[ei] as Phaser.Physics.Arcade.Sprite;
        if (enemy && enemy.active && enemy.body) {
          enemy.setVelocity(0, 0);
        }
      }
      if (this.neutrals) {
        const neutralsList = this.neutrals.getChildren();
        for (let ni = 0; ni < neutralsList.length; ni++) {
          const n = neutralsList[ni] as Phaser.Physics.Arcade.Sprite;
          if (n && n.active && n.body) {
            n.setVelocity(0, 0);
          }
        }
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

    this.scratchActiveEntities.length = 0;
    this.collectActiveEntitiesFromGroup(this.enemies);
    this.collectActiveEntitiesFromGroup(this.allies);
    this.collectActiveEntitiesFromGroup(this.neutrals);

    // Physical spatial separation pass across active dynamic entities
    if (this.scratchActiveEntities.length > 1) {
      resolveEntitySeparation(this.scratchActiveEntities, {
        iterations: 1,
        separationFactor: 0.4,
        bounds: { minX: 20, maxX: 600 - 20, minY: 20, maxY: 500 },
        map: this.map,
      });
    }

    if (this.overheadUIManager) {
      this.overheadUIManager.update(this.scratchActiveEntities, this.player, delta);
    }

    // 10c. Dynamic Hazard Environmental Vaporization for Enemies
    if (this.dynamicHazard && this.dynamicHazard.getState() === HazardLifecycleState.ACTIVE) {
      if (this.enemies) {
        this.enemies.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
          const enemy = child as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const enemyTileR = Math.floor(enemy.y / TILE_SIZE);
            const enemyTileC = Math.floor(enemy.x / TILE_SIZE);
            const col = this.dynamicHazard.checkEnemyCollision(enemyTileR, enemyTileC, false);
            if (col.hit && col.isVaporized) {
              this.score += col.scoreBonus;
              this.addUltimateCharge(col.ultimateChargeBonus || 5);
              this.emitStatsUpdate();
              this.spawnFloatingText(enemy.x, enemy.y - 10, col.floatingText || '⚡ VAPORIZED!', '#38BDF8');
              this.spawnPickupParticles(enemy.x, enemy.y, '#38BDF8');
              if (typeof enemy.takeDamage === 'function') {
                enemy.takeDamage(col.damage, 'hazard', this.time.now);
              }
              if (enemy.active && !enemy.isDead) {
                enemy.die(this.time.now);
              }
            }
          }
        });
      }
    }

    // 10.5 Update Relic Manager (ARCH-RELIC-01)
    if (this.relicManager) {
      const pCol = Math.floor(this.player.x / TILE_SIZE);
      const pRow = Math.floor(this.player.y / TILE_SIZE);
      const north = pRow > 0 && this.map[pRow - 1]?.[pCol] === TILE_EMPTY;
      const south = pRow < ROWS - 1 && this.map[pRow + 1]?.[pCol] === TILE_EMPTY;
      const west = pCol > 0 && this.map[pRow]?.[pCol - 1] === TILE_EMPTY;
      const east = pCol < COLS - 1 && this.map[pRow]?.[pCol + 1] === TILE_EMPTY;
      const isOpenCorridor = (north && south) || (west && east);

      const relicRes = this.relicManager.update(delta, Date.now(), 60, isOpenCorridor);
      if (relicRes.solarShieldGranted) {
        this.shieldCharges = Math.min(3, this.shieldCharges + 1);
        this.hasShield = true;
        this.emitStatsUpdate();
      }
    }

    // 11. Update Active Boss & Telegraphs
    if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
      this.activeBoss.update(delta, this.player.x, this.player.y);

      // Boss contact damage to player (AI-BOSS-01)
      const bossRadius = this.activeBoss.config.colliderRadius || 35;
      const bossDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.activeBoss.x, this.activeBoss.y);
      if (bossDist < bossRadius + 14) {
        if (!this.isInvulnerable && !this.isAegisOverdriveActive && this.activeBoss.bossState !== BossState.STUNNED) {
          this.playerDie();
        }
      }

      // Boss crater / bomb collision stun check (AI-BOSS-01)
      this.bombs.getChildren().forEach((child) => {
        const bomb = child as Phaser.Physics.Arcade.Sprite;
        if (bomb.active && this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
          const bDist = Phaser.Math.Distance.Between(bomb.x, bomb.y, this.activeBoss.x, this.activeBoss.y);
          if (bDist < bossRadius + 16) {
            this.activeBoss.takeBombDamage(1, 'bomb');
            this.activeBoss.applyStun(2.5);
            if (this.bossHUD) {
              this.bossHUD.triggerStun(2.5, 'Bomb Collision Stun!');
            }
            const bCol = Math.floor(bomb.x / TILE_SIZE);
            const bRow = Math.floor(bomb.y / TILE_SIZE);
            this.explodeBomb(bomb, bRow, bCol);
          }
        }
      });

      // Boss Dynamic Hazard Beam Collision (Environmental Overcharge)
      if (this.dynamicHazard && this.dynamicHazard.getState() === HazardLifecycleState.ACTIVE) {
        const bossRadius = this.activeBoss.config.colliderRadius || 35;
        const minR = Math.max(0, Math.floor((this.activeBoss.y - bossRadius) / TILE_SIZE));
        const maxR = Math.min(ROWS - 1, Math.floor((this.activeBoss.y + bossRadius) / TILE_SIZE));
        const minC = Math.max(0, Math.floor((this.activeBoss.x - bossRadius) / TILE_SIZE));
        const maxC = Math.min(COLS - 1, Math.floor((this.activeBoss.x + bossRadius) / TILE_SIZE));

        let bossHit = false;
        let colResult: EnemyCollisionResult | null = null;

        const centerR = Math.floor(this.activeBoss.y / TILE_SIZE);
        const centerC = Math.floor(this.activeBoss.x / TILE_SIZE);
        const centerRes = this.dynamicHazard.checkEnemyCollision(centerR, centerC, true);
        if (centerRes.hit) {
          bossHit = true;
          colResult = centerRes;
        } else {
          for (let r = minR; r <= maxR && !bossHit; r++) {
            for (let c = minC; c <= maxC && !bossHit; c++) {
              const res = this.dynamicHazard.checkEnemyCollision(r, c, true);
              if (res.hit) {
                bossHit = true;
                colResult = res;
              }
            }
          }
        }

        if (bossHit && colResult && colResult.isStunned) {
          if (this.activeBoss.bossState !== BossState.STUNNED) {
            const dmg = (this.activeBoss.maxHp * colResult.damage) / 100;
            this.activeBoss.currentHp = Math.max(0, this.activeBoss.currentHp - dmg);
            this.activeBoss.applyStun(colResult.stunDurationMs / 1000);
            if (this.bossHUD) {
              this.bossHUD.triggerStun(colResult.stunDurationMs / 1000, '⚡ Overcharge Beam Stun!');
            }
            this.spawnFloatingText(this.activeBoss.x, this.activeBoss.y - 20, colResult.floatingText || '⚡ STUNNED (1.5s)!', '#FBBF24');
            if (this.cameraTrauma) {
              this.cameraTrauma.addTrauma(0.35);
            }
            if (this.activeBoss.currentHp <= 0) {
              this.score += 5000;
              this.dismissBoss();
            }
          }
        }
      }

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

        const isFlora = this.activeBoss instanceof MutantFloraBoss || this.activeBoss.config.id === 'boss_mutant_flora';

        // Outer glow / aura
        const themeColor =
          this.activeBoss.bossState === BossState.ENRAGED
            ? 0xff0044
            : this.activeBoss.bossState === BossState.STUNNED
              ? 0xf59e0b
              : isFlora
                ? 0x10b981
                : 0x9333ea;

        this.bossGraphics.fillStyle(themeColor, 0.3);
        this.bossGraphics.fillCircle(this.activeBoss.x, this.activeBoss.y, radius + 8);

        // Mutant Flora Bloom Petals
        if (isFlora) {
          this.bossGraphics.fillStyle(0xf43f5e, 0.65);
          for (let p = 0; p < 6; p++) {
            const pAngle = (_time / 800) + (p * Math.PI / 3);
            const px = this.activeBoss.x + Math.cos(pAngle) * (radius + 6);
            const py = this.activeBoss.y + Math.sin(pAngle) * (radius + 6);
            this.bossGraphics.fillCircle(px, py, 7);
          }
        }

        // Core body
        this.bossGraphics.fillStyle(themeColor, 0.9);
        this.bossGraphics.fillCircle(this.activeBoss.x, this.activeBoss.y, radius);

        if (isFlora) {
          // Emerald Core Center
          this.bossGraphics.fillStyle(0x059669, 0.95);
          this.bossGraphics.fillCircle(this.activeBoss.x, this.activeBoss.y, radius - 8);
        }

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

      // Render Procedural Multi-Phase Boss Phase Bars with proper depth and zero visual occlusion
      if (this.bossPhaseBarGraphics) {
        this.bossPhaseBarGraphics.clear();
        if (this.bossHUD && (this.activeBoss.bossState as unknown as string) !== 'DEFEATED') {
          const hudState = this.bossHUD.getState();
          const segments = hudState.phaseHpSegments;
          if (segments && segments.length > 0) {
            const barWidth = 64;
            const barHeight = 6;
            const radius = this.activeBoss.config.colliderRadius || 35;
            const barX = this.activeBoss.x - barWidth / 2;
            const barY = this.activeBoss.y - radius - 24;

            // Container background
            this.bossPhaseBarGraphics.fillStyle(0x0b1329, 0.90);
            this.bossPhaseBarGraphics.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

            // Container border (danger red if enraged, amber if stunned, slate otherwise)
            const borderColor =
              this.activeBoss.bossState === BossState.ENRAGED
                ? 0xff0044
                : this.activeBoss.bossState === BossState.STUNNED
                  ? 0xf59e0b
                  : 0x475569;
            this.bossPhaseBarGraphics.lineStyle(1.5, borderColor, 0.95);
            this.bossPhaseBarGraphics.strokeRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

            // Phase Segment Bars
            const numSegments = segments.length;
            const gap = 2;
            const totalGaps = (numSegments - 1) * gap;
            const segmentWidth = (barWidth - totalGaps) / numSegments;

            let curX = barX;
            for (let idx = 0; idx < numSegments; idx++) {
              const segMax = Math.max(1, segments[idx]);
              const isDepleted = idx > hudState.activeSegmentIndex;
              const isCurrent = idx === hudState.activeSegmentIndex;
              const segPct = isDepleted
                ? 0
                : isCurrent
                  ? Math.max(0, Math.min(1, hudState.activeSegmentHp / segMax))
                  : 1;

              // Segment slot background
              this.bossPhaseBarGraphics.fillStyle(0x1e293b, 0.85);
              this.bossPhaseBarGraphics.fillRect(curX, barY, segmentWidth, barHeight);

              // Segment fill
              if (segPct > 0) {
                const segFillColor = isCurrent
                  ? (this.activeBoss.bossState === BossState.ENRAGED ? 0xff1144 : 0x10b981)
                  : 0x3b82f6;
                this.bossPhaseBarGraphics.fillStyle(segFillColor, 1.0);
                this.bossPhaseBarGraphics.fillRect(curX, barY, segmentWidth * segPct, barHeight);
              }

              // Segment divider line if not last
              if (idx < numSegments - 1) {
                this.bossPhaseBarGraphics.lineStyle(1, 0x000000, 0.85);
                this.bossPhaseBarGraphics.lineBetween(
                  curX + segmentWidth + gap / 2,
                  barY - 1,
                  curX + segmentWidth + gap / 2,
                  barY + barHeight + 1
                );
              }

              curX += segmentWidth + gap;
            }
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
        this.scratchPlayerPos.r = Math.floor(this.player.y / TILE_SIZE);
        this.scratchPlayerPos.c = Math.floor(this.player.x / TILE_SIZE);
        this.scratchPlayerPos.x = this.player.x;
        this.scratchPlayerPos.y = this.player.y;
        this.crisisManager.update(delta, this.scratchPlayerPos);
        if (this.situationLog) {
          this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now());
        }

        // Edge-triggered reward when crisis resolves
        if (activeCrisis.getStage() === CrisisStage.RESOLVED && !this.hasRewardedActiveCrisis) {
          this.hasRewardedActiveCrisis = true;
          this.score += 5000;
          this.starCandies = (this.starCandies || 0) + 35;
          this.cosmicEssence = (this.cosmicEssence || 0) + 15;
          this.spawnFloatingText(this.player.x, this.player.y - 25, '🌟 CRISIS STABILIZED! +5000 SCORE +35 CANDY +15 ESSENCE', '#38bdf8');
          if (this.game && this.game.events) {
            this.game.events.emit('currency-reward', { starCandies: 35, cosmicEssence: 15 });
          }
          this.emitStatsUpdate();
        }

        // Render Crisis Hazard Graphics
        this.renderCrisisHazards(_time);
      }
    }

    // 13. Update Dynamic Hazard System (Quantum Spire Hazard)
    if (this.dynamicHazard && this.dynamicHazard.getState() !== HazardLifecycleState.INACTIVE) {
      this.dynamicHazard.update(delta);

      // Player Collision Check against active beam
      if (this.dynamicHazard.getState() === HazardLifecycleState.ACTIVE && !this.isGameOver) {
        const playerRow = Math.floor(this.player.y / TILE_SIZE);
        const playerCol = Math.floor(this.player.x / TILE_SIZE);
        const dashElapsed = this.isDashing ? (_time - this.dashStartTime) : 0;
        const playerHit = this.dynamicHazard.checkPlayerCollision(playerRow, playerCol, this.isDashing, dashElapsed);

        if (playerHit.tunneled && playerHit.phaseShiftGranted) {
          const now = this.time?.now ?? Date.now();
          if (now - this.lastQuantumTunnelTimestampMs >= 800) {
            this.lastQuantumTunnelTimestampMs = now;
            this.grantQuantumPhaseShift();
          }
        } else if (playerHit.hit && playerHit.damage > 0 && !this.isInvulnerable) {
          this.spawnFloatingText(this.player.x, this.player.y - 14, `-${playerHit.damage} TACHYON SHEAR`, '#ef4444');
          if (this.cameraTrauma) {
            this.cameraTrauma.addTrauma(0.35);
          }
          if (playerHit.phaseJitterInflicted) {
            this.applyPhaseJitter(playerHit.jitterDurationMs);
          }
          this.playerDie();
        }

        // Enemy Collision Check against active beam
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.dynamicHazard.checkEnemyCollision(er, ec, isBoss);
            if (enemyHit.hit) {
              if (enemyHit.isVaporized) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(5);
              } else if (enemyHit.isStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(enemyHit.damage);
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'Tachyon Stasis!');
                }
              }
            }
          }
        }
      }
    }

    // 13b. Update Frost Hazard System
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT) {
      this.frostHazard.update(delta);

      if (this.frostHazard.state === FrostLifecycleState.ABSOLUTE_ZERO_BURST && !this.isGameOver) {
        // Enemy Collision Check against absolute zero burst
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.frostHazard.checkEnemyCollision(er, ec, isBoss);
            if (enemyHit.hit) {
              if (enemyHit.isShattered) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#38bdf8');
              } else if (enemyHit.isFrozenStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_FROST_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#38bdf8');
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'Deep Freeze Stasis!');
                }
              }
            }
          }
        }
      }
    }

    // 13c. Update Gravity Hazard System (Gravitational Singularity)
    if (this.gravityHazard && this.gravityHazard.state !== GravityLifecycleState.DORMANT) {
      this.gravityHazard.update(delta);
    }

    // 13d. Update Volt Hazard System (Tesla Storm / Electro Surge)
    if (this.voltHazard && this.voltHazard.state !== VoltLifecycleState.DORMANT) {
      this.voltHazard.update(delta);
      if (this.voltHazardAudio) {
        this.voltHazardAudio.playVoltHazardState(this.voltHazard.state, this.time?.now ?? Date.now());
      }

      if (this.voltHazard.state === VoltLifecycleState.LIGHTNING_DISCHARGE && !this.isGameOver) {
        // Enemy Collision Check against lightning discharge
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.voltHazard.checkEnemyCollision(er, ec, isBoss, this.time.now);
            if (enemyHit.hit) {
              if (enemyHit.isVaporized) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#facc15');
              } else if (enemyHit.isEmpStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_VOLT_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#facc15');
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'EMP Overload Stasis!');
                }
              }
            }
          }
        }
      }
    }

    // 13e. Update Magma Hazard System (Magma Caldera & Pyroclastic Surge)
    if (this.magmaHazard && this.magmaHazard.state !== MagmaLifecycleState.DORMANT) {
      this.magmaHazard.update(delta);
      if (this.magmaHazardAudio) {
        this.magmaHazardAudio.playMagmaHazardState(this.magmaHazard.state, this.magmaHazard.getTelegraphPhase(), this.time?.now ?? Date.now());
      }

      if (this.magmaHazard.state === MagmaLifecycleState.PYROCLASTIC_BURST && !this.isGameOver) {
        // Enemy Collision Check against pyroclastic burst
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.magmaHazard.checkEnemyCollision(er, ec, isBoss, this.time.now);
            if (enemyHit.hit) {
              if (enemyHit.isIncinerated) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#f97316');
              } else if (enemyHit.isMeltdownStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_MAGMA_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#f97316');
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'Magma Meltdown Stasis!');
                }
              }
            }
          }
        }
      }
    }

    // 13f. Update Miasma Hazard System (Toxic Miasma & Spore Bloom)
    if (this.miasmaHazard && this.miasmaHazard.state !== MiasmaLifecycleState.DORMANT) {
      this.miasmaHazard.update(delta);
      if (this.miasmaHazardAudio) {
        this.miasmaHazardAudio.playMiasmaHazardState(this.miasmaHazard.state, this.miasmaHazard.getTelegraphPhase(), this.time?.now ?? Date.now());
      }

      if (this.miasmaHazard.state === MiasmaLifecycleState.CORROSIVE_BURST && !this.isGameOver) {
        // Enemy Collision Check against corrosive burst
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.miasmaHazard.checkEnemyCollision(er, ec, isBoss, this.time.now);
            if (enemyHit.hit) {
              if (enemyHit.isDissolved || enemyHit.isDecomposed) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#10b981');
              } else if ((enemyHit.isStunned || enemyHit.isSporeStunned) && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_MIASMA_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#10b981');
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'Spore Overgrowth Stasis!');
                }
              }
            }
          }
        }
      }
    }

    // 13g. Update Chrono Hazard System (Temporal Dilation & Time Collapse)
    if (this.chronoHazard && this.chronoHazard.state !== ChronoLifecycleState.DORMANT) {
      this.chronoHazard.update(delta);
      if (this.chronoHazardAudio) {
        this.chronoHazardAudio.playChronoHazardState(this.chronoHazard.state, this.chronoHazard.getTelegraphPhase(), this.time?.now ?? Date.now());
      }

      if (this.chronoHazard.state === ChronoLifecycleState.TIME_COLLAPSE && !this.isGameOver) {
        // Enemy Collision Check against time collapse
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.chronoHazard.checkEnemyCollision(er, ec, isBoss, this.time.now);
            if (enemyHit.hit) {
              if (enemyHit.isDissolved || enemyHit.isDecomposed) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#818cf8');
              } else if (enemyHit.isStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_CHRONO_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#818cf8');
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'Temporal Stasis Distortion!');
                }
              }
            }
          }
        }
      }
    }

    // 13h. Update Solar Hazard System (Solar Corona & Superheat Flare)
    if (this.solarHazard && this.solarHazard.state !== SolarLifecycleState.DORMANT) {
      this.solarHazard.update(delta);
      if (this.solarHazardAudio) {
        this.solarHazardAudio.playSolarHazardState(this.solarHazard.state, this.solarHazard.getTelegraphPhase(), undefined, this.time?.now ?? Date.now());
      }

      if (this.solarHazard.state === SolarLifecycleState.SUPERHEAT_FLARE && !this.isGameOver) {
        // Enemy Collision Check against superheat flare
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.solarHazard.checkEnemyCollision(er, ec, isBoss, this.time.now);
            if (enemyHit.hit) {
              if (enemyHit.isDissolved || enemyHit.isDecomposed) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#f59e0b');
              } else if (enemyHit.isStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_SOLAR_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#f59e0b');
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'Solar Corona Stasis!');
                }
              }
            }
          }
        }
      }
    }

    // 13i. Update Nebula Hazard System (Astral Nebula & Solar Eclipse)
    if (this.nebulaHazard && this.nebulaHazard.state !== NebulaLifecycleState.DORMANT) {
      this.nebulaHazard.update(delta);
      if (this.nebulaHazardAudio) {
        NebulaHazardAudio.playNebulaHazardState(this.nebulaHazard.state, this.nebulaHazard.getTelegraphPhase(), undefined, this.time?.now ?? Date.now());
      }

      if (this.nebulaHazard.state === NebulaLifecycleState.ECLIPSE_COLLAPSE && !this.isGameOver) {
        // Enemy Collision Check against eclipse collapse
        const enemiesList = this.enemies.getChildren();
        for (let i = 0; i < enemiesList.length; i++) {
          const enemy = enemiesList[i] as BaseEntity;
          if (enemy && enemy.active && !enemy.isDead) {
            const er = Math.floor(enemy.y / TILE_SIZE);
            const ec = Math.floor(enemy.x / TILE_SIZE);
            const isBoss = enemy === (this.activeBoss as unknown as BaseEntity);
            const enemyHit = this.nebulaHazard.checkEnemyCollision(er, ec, isBoss, this.time.now);
            if (enemyHit.hit) {
              if (enemyHit.isDissolved || enemyHit.isDecomposed) {
                if (typeof enemy.takeDamage === 'function') {
                  enemy.takeDamage(enemyHit.damage, 'hazard', this.time.now);
                }
                this.score += enemyHit.scoreBonus;
                this.addUltimateCharge(enemyHit.ultimateChargeBonus);
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#a855f7');
              } else if (enemyHit.isStunned && isBoss && this.activeBoss) {
                this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_NEBULA_DAMAGE_RATIO));
                this.spawnFloatingText(enemy.x, enemy.y - 14, enemyHit.floatingText, '#a855f7');
                if (this.bossHUD) {
                  this.bossHUD.triggerStun(enemyHit.stunDurationMs / 1000, 'Astral Stasis!');
                }
              }
            }
          }
        }

        // Dedicated active boss check
        if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED && this.activeBoss.currentHp > 0) {
          const br = Math.floor(this.activeBoss.y / TILE_SIZE);
          const bc = Math.floor(this.activeBoss.x / TILE_SIZE);
          const bossHit = this.nebulaHazard.checkEnemyCollision(br, bc, true, this.time.now);
          if (bossHit.hit && bossHit.isStunned) {
            this.activeBoss.takeBombDamage(Math.floor(this.activeBoss.maxHp * BOSS_NEBULA_DAMAGE_RATIO));
            this.spawnFloatingText(this.activeBoss.x, this.activeBoss.y - 14, bossHit.floatingText, '#a855f7');
            if (this.bossHUD) {
              this.bossHUD.triggerStun(bossHit.stunDurationMs / 1000, 'Astral Stasis!');
            }
          }
        }
      }
    }

    // Single unified hazard rendering pass per tick
    this.renderDynamicHazardGraphics(_time);
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
        case HazardType.QUANTUM_SPIRE: {
          const pulse = 0.8 + 0.2 * Math.sin(time / 140 + hazard.idx);
          this.crisisGraphics.fillStyle(0x00e5ff, 0.3 * pulse);
          this.crisisGraphics.fillCircle(x, y, 18 * pulse);
          this.crisisGraphics.fillStyle(0x00ffff, 0.9);
          this.crisisGraphics.beginPath();
          this.crisisGraphics.moveTo(x, y - 12);
          this.crisisGraphics.lineTo(x + 10, y);
          this.crisisGraphics.lineTo(x, y + 12);
          this.crisisGraphics.lineTo(x - 10, y);
          this.crisisGraphics.closePath();
          this.crisisGraphics.fillPath();
          this.crisisGraphics.lineStyle(1.5, 0xffffff, 0.9);
          this.crisisGraphics.strokePath();
          break;
        }
        case HazardType.PSIONIC_DISRUPTION: {
          const pulse = 0.8 + 0.2 * Math.sin(time / 160 + hazard.idx);
          this.crisisGraphics.fillStyle(0xec4899, 0.45 * pulse);
          this.crisisGraphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          this.crisisGraphics.lineStyle(1.5, 0xf472b6, 0.85);
          this.crisisGraphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          break;
        }
        case HazardType.PSIONIC_ILLUSION:
        case HazardType.PSIONIC_MANIFESTATION: {
          const pulse = 0.8 + 0.2 * Math.sin(time / 140 + hazard.idx);
          this.crisisGraphics.fillStyle(0xdb2777, 0.5 * pulse);
          this.crisisGraphics.fillCircle(x, y, 18 * pulse);
          this.crisisGraphics.fillStyle(0xfbcfe8, 0.9);
          this.crisisGraphics.fillCircle(x, y, 6);
          this.crisisGraphics.lineStyle(2, 0xffffff, 0.9);
          this.crisisGraphics.strokeCircle(x, y, 14 * pulse);
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

  grantQuantumPhaseShift(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    this.isInvulnerable = true;
    this.shieldInvulnerableUntil = Math.max(this.shieldInvulnerableUntil, now + TUNNELING_INVULNERABILITY_MS);
    this.player.setAlpha(0.65);
    this.player.setTint(0x00ffff);

    const originalSpeed = this.playerSpeed;
    this.playerSpeed = this.playerSpeed * 1.30;

    // Cleanse conflicting debuff
    this.activeBuffs = this.activeBuffs.filter((b) => b.id !== 'PHASE_JITTER');
    this.phaseJitterRemaining = 0;

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_QUANTUM_PHASED, '#00ffff');
    if (this.cameras?.main) {
      this.cameras.main.flash(120, 0, 229, 255);
    }

    this.time.delayedCall(TUNNELING_INVULNERABILITY_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
    });

    this.time.delayedCall(2500, () => {
      this.playerSpeed = originalSpeed;
    });
  }

  grantGravitationalEscape(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    this.isInvulnerable = true;
    this.shieldInvulnerableUntil = Math.max(this.shieldInvulnerableUntil, now + ESCAPE_VELOCITY_INVULN_MS);
    this.player.setAlpha(0.75);
    this.player.setTint(0xfbbf24);

    const originalSpeed = this.playerSpeed;
    this.playerSpeed = this.playerSpeed * (1.0 + ESCAPE_VELOCITY_SPEED_BURST_RATIO);

    const existing = this.activeBuffs.find((b) => b.id === 'GRAVITATIONAL_ESCAPE');
    if (existing) {
      existing.remainingMs = ESCAPE_VELOCITY_INVULN_MS;
      existing.totalMs = ESCAPE_VELOCITY_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'GRAVITATIONAL_ESCAPE',
        name: 'Escape Velocity',
        icon: '✦',
        color: '#fbbf24',
        remainingMs: ESCAPE_VELOCITY_INVULN_MS,
        totalMs: ESCAPE_VELOCITY_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_GRAVITATIONAL_ESCAPE, '#fbbf24');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 251, 191, 36);
    }

    this.time.delayedCall(ESCAPE_VELOCITY_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  grantThermalBreak(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    this.isInvulnerable = true;
    this.shieldInvulnerableUntil = Math.max(this.shieldInvulnerableUntil, now + THERMAL_BREAK_INVULN_MS);
    this.player.setAlpha(0.75);
    this.player.setTint(0x38bdf8);

    const originalSpeed = this.playerSpeed;
    this.playerSpeed = this.playerSpeed * (1.0 + THERMAL_BREAK_SPEED_BURST_RATIO);

    // Cleanse conflicting debuffs
    this.activeBuffs = this.activeBuffs.filter((b) => b.id !== 'FROST_CHILL' && b.id !== 'THERMAL_SINGE');

    const existing = this.activeBuffs.find((b) => b.id === 'THERMAL_BREAK');
    if (existing) {
      existing.remainingMs = THERMAL_BREAK_INVULN_MS;
      existing.totalMs = THERMAL_BREAK_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'THERMAL_BREAK',
        name: 'Thermal Break',
        icon: '✦',
        color: '#38bdf8',
        remainingMs: THERMAL_BREAK_INVULN_MS,
        totalMs: THERMAL_BREAK_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_THERMAL_BREAK, '#38bdf8');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 56, 189, 248);
    }
    if (this.frostHazardAudio) {
      this.frostHazardAudio.playThermalBreak(now);
    }

    this.time.delayedCall(THERMAL_BREAK_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  applyFrostChill(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing || this.activeBuffs.some((b) => b.id === 'THERMAL_BREAK' || b.id === 'MAGMA_SURF')) return;
    this.activeBuffs = this.activeBuffs.filter((b) => b.id !== 'THERMAL_SINGE');

    const existing = this.activeBuffs.find((b) => b.id === 'FROST_CHILL');
    if (existing) {
      existing.remainingMs = FROST_CHILL_DURATION_MS;
      existing.totalMs = FROST_CHILL_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'FROST_CHILL',
        name: 'Frost Chill',
        icon: '❄️',
        color: '#93c5fd',
        remainingMs: FROST_CHILL_DURATION_MS,
        totalMs: FROST_CHILL_DURATION_MS,
      });
    }

    if (now - this.lastFrostChillFloatingTextMs >= 2000) {
      this.lastFrostChillFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_FROST_CHILL, '#93c5fd');
      if (this.frostHazardAudio) {
        this.frostHazardAudio.playFrostChill(now);
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0x93c5fd);
      this.time.delayedCall(FROST_CHILL_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'FROST_CHILL')) {
          this.player.clearTint();
        }
      });
    }

    this.emitStatsUpdate();
  }

  grantSuperconductorDash(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    this.isInvulnerable = true;
    this.shieldInvulnerableUntil = Math.max(
      this.shieldInvulnerableUntil,
      now + SUPERCONDUCTOR_DASH_INVULN_MS
    );
    this.player.setAlpha(0.80);
    this.player.setTint(0xfacc15);

    const originalSpeed = this.playerSpeed;
    this.playerSpeed = originalSpeed * (1.0 + SUPERCONDUCTOR_SPEED_BURST_RATIO);

    // Cleanse conflicting debuff
    this.activeBuffs = this.activeBuffs.filter((b) => b.id !== 'STATIC_SHOCK');

    const existing = this.activeBuffs.find((b) => b.id === 'SUPERCONDUCTOR_DASH');
    if (existing) {
      existing.remainingMs = SUPERCONDUCTOR_DASH_INVULN_MS;
      existing.totalMs = SUPERCONDUCTOR_DASH_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'SUPERCONDUCTOR_DASH',
        name: 'Superconductor Dash',
        icon: '✦',
        color: '#facc15',
        remainingMs: SUPERCONDUCTOR_DASH_INVULN_MS,
        totalMs: SUPERCONDUCTOR_DASH_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_SUPERCONDUCTOR_DASH, '#facc15');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 250, 204, 21);
    }
    if (this.voltHazardAudio) {
      this.voltHazardAudio.playSuperconductorDash(now);
    }

    this.time.delayedCall(SUPERCONDUCTOR_DASH_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  applyStaticShock(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing || this.activeBuffs.some((b) => b.id === 'SUPERCONDUCTOR_DASH')) return;

    const existing = this.activeBuffs.find((b) => b.id === 'STATIC_SHOCK');
    if (existing) {
      existing.remainingMs = STATIC_SHOCK_DURATION_MS;
      existing.totalMs = STATIC_SHOCK_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'STATIC_SHOCK',
        name: 'Static Shock',
        icon: '⚡',
        color: '#eab308',
        remainingMs: STATIC_SHOCK_DURATION_MS,
        totalMs: STATIC_SHOCK_DURATION_MS,
      });
    }

    if (now - this.lastStaticShockFloatingTextMs >= 2000) {
      this.lastStaticShockFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_STATIC_SHOCK, '#eab308');
      if (this.voltHazardAudio) {
        this.voltHazardAudio.playStaticShock(now);
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0xfef08a);
      this.time.delayedCall(STATIC_SHOCK_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'STATIC_SHOCK')) {
          this.player.clearTint();
        }
      });
    }

    this.emitStatsUpdate();
  }

  grantMagmaSurf(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    this.isInvulnerable = true;
    this.shieldInvulnerableUntil = Math.max(
      this.shieldInvulnerableUntil,
      now + MAGMA_SURF_INVULN_MS
    );
    this.player.setAlpha(0.85);
    this.player.setTint(0xf97316);

    const originalSpeed = this.playerSpeed;
    this.playerSpeed = originalSpeed * (1.0 + MAGMA_SURF_SPEED_BURST_RATIO);

    // Cleanse conflicting debuffs
    this.activeBuffs = this.activeBuffs.filter((b) => b.id !== 'THERMAL_SINGE' && b.id !== 'FROST_CHILL');

    const existing = this.activeBuffs.find((b) => b.id === 'MAGMA_SURF');
    if (existing) {
      existing.remainingMs = MAGMA_SURF_INVULN_MS;
      existing.totalMs = MAGMA_SURF_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'MAGMA_SURF',
        name: 'Magma Surf',
        icon: '✦',
        color: '#f97316',
        remainingMs: MAGMA_SURF_INVULN_MS,
        totalMs: MAGMA_SURF_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_MAGMA_SURF, '#f97316');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 249, 115, 22);
    }
    if (this.magmaHazardAudio) {
      this.magmaHazardAudio.playMagmaSurf();
    }

    this.time.delayedCall(MAGMA_SURF_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  applyThermalSinge(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing || this.activeBuffs.some((b) => b.id === 'MAGMA_SURF' || b.id === 'THERMAL_BREAK')) return;
    this.activeBuffs = this.activeBuffs.filter((b) => b.id !== 'FROST_CHILL');

    const existing = this.activeBuffs.find((b) => b.id === 'THERMAL_SINGE');
    if (existing) {
      existing.remainingMs = THERMAL_SINGE_DURATION_MS;
      existing.totalMs = THERMAL_SINGE_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'THERMAL_SINGE',
        name: 'Thermal Singe',
        icon: '🔥',
        color: '#ea580c',
        remainingMs: THERMAL_SINGE_DURATION_MS,
        totalMs: THERMAL_SINGE_DURATION_MS,
      });
    }

    if (now - this.lastThermalSingeFloatingTextMs >= 2000) {
      this.lastThermalSingeFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_THERMAL_SINGE, '#ea580c');
      if (this.magmaHazardAudio) {
        this.magmaHazardAudio.playThermalSinge(now);
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0xfdba74);
      this.time.delayedCall(THERMAL_SINGE_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'THERMAL_SINGE')) {
          this.player.clearTint();
        }
      });
    }

    this.emitStatsUpdate();
  }

  grantSporeSurge(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    this.isInvulnerable = true;
    const originalSpeed = this.playerSpeed;
    this.playerSpeed = Math.floor(originalSpeed * (1.0 + SPORE_SURGE_SPEED_BURST_RATIO));

    this.player.setTint(0x10b981);
    this.player.setAlpha(0.85);

    const existing = this.activeBuffs.find((b) => b.id === 'SPORE_SURGE');
    if (existing) {
      existing.remainingMs = SPORE_SURGE_INVULN_MS;
      existing.totalMs = SPORE_SURGE_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'SPORE_SURGE',
        name: 'Spore Surge',
        icon: '✦',
        color: '#10b981',
        remainingMs: SPORE_SURGE_INVULN_MS,
        totalMs: SPORE_SURGE_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_SPORE_SURGE, '#10b981');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 16, 185, 129);
    }
    if (this.miasmaHazardAudio) {
      this.miasmaHazardAudio.playSporeSurge();
    }

    this.time.delayedCall(SPORE_SURGE_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  applyNeurotoxin(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing) return;

    const existing = this.activeBuffs.find((b) => b.id === 'NEUROTOXIN');
    if (existing) {
      existing.remainingMs = NEUROTOXIN_DURATION_MS;
      existing.totalMs = NEUROTOXIN_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'NEUROTOXIN',
        name: 'Neurotoxin',
        icon: '🧪',
        color: '#84cc16',
        remainingMs: NEUROTOXIN_DURATION_MS,
        totalMs: NEUROTOXIN_DURATION_MS,
      });
    }

    if (now - this.lastNeurotoxinFloatingTextMs >= 2000) {
      this.lastNeurotoxinFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_NEUROTOXIN, '#84cc16');
      if (this.miasmaHazardAudio) {
        this.miasmaHazardAudio.playNeurotoxin(now);
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0xbbf7d0);
      this.time.delayedCall(NEUROTOXIN_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'NEUROTOXIN')) {
          this.player.clearTint();
        }
      });
    }

    this.emitStatsUpdate();
  }

  grantChronoSurge(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    this.isInvulnerable = true;
    const originalSpeed = this.playerSpeed;
    this.playerSpeed = Math.floor(originalSpeed * (1.0 + CHRONO_SURGE_SPEED_BURST_RATIO));

    this.player.setTint(0x818cf8);
    this.player.setAlpha(0.85);

    const existing = this.activeBuffs.find((b) => b.id === 'CHRONO_SURGE');
    if (existing) {
      existing.remainingMs = CHRONO_SURGE_INVULN_MS;
      existing.totalMs = CHRONO_SURGE_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'CHRONO_SURGE',
        name: 'Chrono Surge',
        icon: '⏳',
        color: '#818cf8',
        remainingMs: CHRONO_SURGE_INVULN_MS,
        totalMs: CHRONO_SURGE_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_CHRONO_SURGE, '#818cf8');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 129, 140, 248);
    }
    if (this.chronoHazardAudio) {
      this.chronoHazardAudio.playChronoSurge();
    }

    this.time.delayedCall(CHRONO_SURGE_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  applyTemporalDilation(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing) return;

    const existing = this.activeBuffs.find((b) => b.id === 'TEMPORAL_DILATION');
    if (existing) {
      existing.remainingMs = TEMPORAL_DILATION_DURATION_MS;
      existing.totalMs = TEMPORAL_DILATION_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'TEMPORAL_DILATION',
        name: 'Temporal Dilation',
        icon: '⌛',
        color: '#a5b4fc',
        remainingMs: TEMPORAL_DILATION_DURATION_MS,
        totalMs: TEMPORAL_DILATION_DURATION_MS,
      });
    }

    if (now - this.lastTemporalDilationFloatingTextMs >= 2000) {
      this.lastTemporalDilationFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_TEMPORAL_DILATION, '#a5b4fc');
      if (this.chronoHazardAudio) {
        this.chronoHazardAudio.playTemporalDilation(now);
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0xc7d2fe);
      this.time.delayedCall(TEMPORAL_DILATION_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'TEMPORAL_DILATION')) {
          this.player.clearTint();
        }
      });
    }

    this.emitStatsUpdate();
  }

  grantSolarSurf(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    this.isInvulnerable = true;
    const originalSpeed = this.playerSpeed;
    this.playerSpeed = Math.floor(originalSpeed * (1.0 + SOLAR_SURF_SPEED_BURST_RATIO));

    this.player.setTint(0xfbbf24);
    this.player.setAlpha(0.90);

    const existing = this.activeBuffs.find((b) => b.id === 'SOLAR_SURF');
    if (existing) {
      existing.remainingMs = SOLAR_SURF_INVULN_MS;
      existing.totalMs = SOLAR_SURF_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'SOLAR_SURF',
        name: 'Solar Surf',
        icon: '☀️',
        color: '#f59e0b',
        remainingMs: SOLAR_SURF_INVULN_MS,
        totalMs: SOLAR_SURF_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_SOLAR_SURF, '#fbbf24');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 251, 191, 36);
    }
    if (this.solarHazardAudio) {
      this.solarHazardAudio.playSolarSurfChimes();
    }

    this.time.delayedCall(SOLAR_SURF_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  applySunstroke(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing) return;

    const existing = this.activeBuffs.find((b) => b.id === 'SUNSTROKE');
    if (existing) {
      existing.remainingMs = SUNSTROKE_DURATION_MS;
      existing.totalMs = SUNSTROKE_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'SUNSTROKE',
        name: 'Sunstroke',
        icon: '🥵',
        color: '#f97316',
        remainingMs: SUNSTROKE_DURATION_MS,
        totalMs: SUNSTROKE_DURATION_MS,
      });
    }

    if (now - this.lastSunstrokeFloatingTextMs >= 2000) {
      this.lastSunstrokeFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_SUNSTROKE, '#f97316');
      if (this.solarHazardAudio) {
        this.solarHazardAudio.playCoronaArcSweep();
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0xfdba74);
      this.time.delayedCall(SUNSTROKE_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'SUNSTROKE')) {
          this.player.clearTint();
        }
      });
    }
    this.emitStatsUpdate();
  }

  grantAstralGlide(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    this.isInvulnerable = true;
    const originalSpeed = this.playerSpeed;
    this.playerSpeed = Math.floor(originalSpeed * (1.0 + ASTRAL_GLIDE_SPEED_BURST_RATIO));

    this.player.setTint(0xc084fc);
    this.player.setAlpha(0.85);

    const existing = this.activeBuffs.find((b) => b.id === 'ASTRAL_GLIDE');
    if (existing) {
      existing.remainingMs = ASTRAL_GLIDE_INVULN_MS;
      existing.totalMs = ASTRAL_GLIDE_INVULN_MS;
    } else {
      this.activeBuffs.push({
        id: 'ASTRAL_GLIDE',
        name: 'Astral Glide',
        icon: '🌌',
        color: '#a855f7',
        remainingMs: ASTRAL_GLIDE_INVULN_MS,
        totalMs: ASTRAL_GLIDE_INVULN_MS,
      });
    }

    this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_ASTRAL_GLIDE, '#c084fc');
    if (this.cameras?.main) {
      this.cameras.main.flash(100, 168, 85, 247);
    }
    if (this.nebulaHazardAudio) {
      this.nebulaHazardAudio.playAstralGlideChimes();
    }

    this.time.delayedCall(ASTRAL_GLIDE_INVULN_MS, () => {
      if (this.player && this.player.active) {
        this.player.setAlpha(1.0);
        this.player.clearTint();
        if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
          this.isInvulnerable = false;
        }
      }
      this.playerSpeed = originalSpeed;
    });

    this.emitStatsUpdate();
  }

  applyCosmicDaze(): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing) return;

    const existing = this.activeBuffs.find((b) => b.id === 'COSMIC_DAZE');
    if (existing) {
      existing.remainingMs = COSMIC_DAZE_DURATION_MS;
      existing.totalMs = COSMIC_DAZE_DURATION_MS;
    } else {
      this.activeBuffs.push({
        id: 'COSMIC_DAZE',
        name: 'Cosmic Daze',
        icon: '💫',
        color: '#8b5cf6',
        remainingMs: COSMIC_DAZE_DURATION_MS,
        totalMs: COSMIC_DAZE_DURATION_MS,
      });
    }

    if (now - this.lastCosmicDazeFloatingTextMs >= 2000) {
      this.lastCosmicDazeFloatingTextMs = now;
      this.spawnFloatingText(this.player.x, this.player.y - 25, FLOATING_TEXT_COSMIC_DAZE, '#8b5cf6');
      if (this.nebulaHazardAudio) {
        this.nebulaHazardAudio.playCosmicDazeWarning();
      }
    }

    if (this.player && this.player.active && !this.isInvulnerable) {
      this.player.setTint(0xddd6fe);
      this.time.delayedCall(COSMIC_DAZE_DURATION_MS, () => {
        if (this.player && this.player.active && !this.activeBuffs.some((b) => b.id === 'COSMIC_DAZE')) {
          this.player.clearTint();
        }
      });
    }
    this.emitStatsUpdate();
  }

  applyPhaseJitter(durationMs: number = PHASE_JITTER_DURATION_MS): void {
    if (this.isGameOver) return;
    const now = this.time?.now ?? Date.now();
    if (this.isInvulnerable || this.isDashing || now < this.shieldInvulnerableUntil) return;
    this.phaseJitterRemaining = Math.max(this.phaseJitterRemaining, durationMs);

    const existing = this.activeBuffs.find((b) => b.id === 'PHASE_JITTER');
    if (existing) {
      existing.remainingMs = durationMs;
      existing.totalMs = durationMs;
    } else {
      this.activeBuffs.push({
        id: 'PHASE_JITTER',
        name: 'Phase Jitter',
        icon: '⚡',
        color: '#a855f7',
        remainingMs: durationMs,
        totalMs: durationMs,
      });
    }

    if (this.player && this.player.active) {
      this.player.setTint(0xa855f7);
      this.spawnFloatingText(this.player.x, this.player.y - 25, '⚡ PHASE JITTER (-25%)', '#a855f7');
    }

    this.time.delayedCall(durationMs, () => {
      if (this.player && this.player.active && !this.isInvulnerable) {
        this.player.clearTint();
      }
    });
    this.emitStatsUpdate();
  }

  grantDistortionBarrier(durationMs: number = 2500): void {
    if (this.isGameOver || !this.player || !this.player.active) return;
    const now = this.time?.now ?? Date.now();
    this.isInvulnerable = true;
    this.shieldInvulnerableUntil = Math.max(this.shieldInvulnerableUntil, now + durationMs);

    this.player.setTint(0xec4899);
    this.player.setAlpha(0.85);

    const existing = this.activeBuffs.find((b) => b.id === 'DISTORTION_BARRIER');
    if (existing) {
      existing.remainingMs = durationMs;
      existing.totalMs = durationMs;
    } else {
      this.activeBuffs.push({
        id: 'DISTORTION_BARRIER',
        name: 'Distortion Barrier',
        icon: '🔮',
        color: '#ec4899',
        remainingMs: durationMs,
        totalMs: durationMs,
      });
    }

    if (this.cameras?.main) {
      this.cameras.main.flash(100, 236, 72, 153, false);
    }

    if (this.time && this.time.delayedCall) {
      this.time.delayedCall(durationMs, () => {
        if (this.player && this.player.active) {
          this.player.setAlpha(1.0);
          this.player.clearTint();
          if ((this.time?.now ?? Date.now()) >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
            this.isInvulnerable = false;
          }
        }
      });
    }

    this.emitStatsUpdate();
  }

  private renderDynamicHazardGraphics(time: number): void {
    if (!this.hazardGraphics) return;
    HazardRenderer.render(
      this.hazardGraphics,
      {
        dynamicHazard: this.dynamicHazard,
        gravityHazard: this.gravityHazard,
        frostHazard: this.frostHazard,
        voltHazard: this.voltHazard,
        magmaHazard: this.magmaHazard,
        miasmaHazard: this.miasmaHazard,
        chronoHazard: this.chronoHazard,
        solarHazard: this.solarHazard,
        nebulaHazard: this.nebulaHazard,
      },
      time
    );
    return;
  }

  /**
   * Detects active mobile touch environment or screen layout.
   */
  public isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;
    const hasTouch = ('ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0);
    const mInput = window.mobileInput;
    const hasActiveTouchInput = Boolean(
      mInput &&
      (mInput.up || mInput.down || mInput.left || mInput.right || mInput.bomb || mInput.dash || mInput.ultimate)
    );
    return Boolean(window.innerWidth < 768 || hasTouch || hasActiveTouchInput);
  }

  /**
   * Smooth Corridor Centering and Corner-Sliding Movement Controller
   */
  private updatePlayerMovement(delta: number = 16.666) {
    if (!this.player || !this.player.body) return;

    const mInput = window.mobileInput || DEFAULT_MOBILE_INPUT;
    const left = Boolean(this.cursors?.left?.isDown || mInput.left);
    const right = Boolean(this.cursors?.right?.isDown || mInput.right);
    const up = Boolean(this.cursors?.up?.isDown || mInput.up);
    const down = Boolean(this.cursors?.down?.isDown || mInput.down);
    const isIdle = !left && !right && !up && !down;

    const px = this.player.x;
    const py = this.player.y;

    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);

    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;

    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    // Directional intent
    let wantX = 0;
    let wantY = 0;
    if (left && !right) wantX = -1;
    else if (right && !left) wantX = 1;

    if (up && !down) wantY = -1;
    else if (down && !up) wantY = 1;

    const surgeBonus = this.activeBuffs?.some((b) => b.id === 'SPEED_SURGE') ? 75 : 0;
    const perkSpeedBonus = this.baseSpeedBonus || 0;
    const isPhaseJittered = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'PHASE_JITTER')) || this.phaseJitterRemaining > 0;
    const isGravitationalEscapeActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'GRAVITATIONAL_ESCAPE')) || false;
    const isThermalBreakActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'THERMAL_BREAK')) || false;
    const isFrostChillActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'FROST_CHILL')) || false;
    const isSuperconductorDashActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'SUPERCONDUCTOR_DASH')) || false;
    const isStaticShockActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'STATIC_SHOCK')) || false;
    const isMagmaSurfActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'MAGMA_SURF')) || false;
    const isThermalSingeActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'THERMAL_SINGE')) || false;
    const isSporeSurgeActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'SPORE_SURGE')) || false;
    const isNeurotoxinActive = (this.activeBuffs && this.activeBuffs.some((b) => b.id === 'NEUROTOXIN')) || false;

    let gravityMultiplier = 1.0;
    if (this.gravityHazard && this.gravityHazard.state !== GravityLifecycleState.DORMANT && this.gravityHazard.state !== GravityLifecycleState.COOLDOWN) {
      const gRes = this.gravityHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      gravityMultiplier = gRes.slowFactor;
    }
    if (isGravitationalEscapeActive) {
      gravityMultiplier *= (1.0 + ESCAPE_VELOCITY_SPEED_BURST_RATIO);
    }

    let frostMultiplier = 1.0;
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      const fRes = this.frostHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      if (fRes.thermalBreakGranted) {
        this.grantThermalBreak();
      } else if (fRes.frostChillInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applyFrostChill();
      }
      frostMultiplier = fRes.slowFactor;
    }
    if (isThermalBreakActive) {
      frostMultiplier *= (1.0 + THERMAL_BREAK_SPEED_BURST_RATIO);
    }
    if (isFrostChillActive) {
      frostMultiplier *= (1.0 - FROST_CHILL_SLOW_RATIO);
    }

    let voltMultiplier = 1.0;
    if (this.voltHazard && this.voltHazard.state !== VoltLifecycleState.DORMANT && this.voltHazard.state !== VoltLifecycleState.DISCHARGE_COOLDOWN) {
      const vRes = this.voltHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      if (vRes.superconductorDashGranted) {
        this.grantSuperconductorDash();
      } else if (vRes.hit && vRes.damage > 0 && !this.isInvulnerable && !this.isDashing) {
        this.spawnFloatingText(this.player.x, this.player.y - 14, `-${vRes.damage} LIGHTNING BURST`, '#ef4444');
        if (this.cameraTrauma) {
          this.cameraTrauma.addTrauma(0.35);
        }
        this.playerDie();
      } else if (vRes.staticShockInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applyStaticShock();
      }
      voltMultiplier = vRes.slowFactor;
    }
    if (isSuperconductorDashActive) {
      voltMultiplier *= (1.0 + SUPERCONDUCTOR_SPEED_BURST_RATIO);
    }
    if (isStaticShockActive) {
      voltMultiplier *= (1.0 - STATIC_SHOCK_SLOW_RATIO);
    }

    let magmaMultiplier = 1.0;
    if (this.magmaHazard && this.magmaHazard.state !== MagmaLifecycleState.DORMANT && this.magmaHazard.state !== MagmaLifecycleState.OBSIDIAN_COOLDOWN) {
      const mRes = this.magmaHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      if (mRes.magmaSurfGranted) {
        this.grantMagmaSurf();
      } else if (mRes.hit && mRes.damage > 0 && !this.isInvulnerable && !this.isDashing) {
        this.spawnFloatingText(this.player.x, this.player.y - 14, `-${mRes.damage} PYROCLASTIC BURST`, '#ef4444');
        if (this.cameraTrauma) {
          this.cameraTrauma.addTrauma(0.40);
        }
        this.playerDie();
      } else if (mRes.thermalSingeInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applyThermalSinge();
      }
      magmaMultiplier = mRes.slowFactor;
    }
    if (isMagmaSurfActive) {
      magmaMultiplier *= (1.0 + MAGMA_SURF_SPEED_BURST_RATIO);
    }
    if (isThermalSingeActive) {
      magmaMultiplier *= (1.0 - THERMAL_SINGE_SLOW_RATIO);
    }

    let miasmaMultiplier = 1.0;
    if (this.miasmaHazard && this.miasmaHazard.state !== MiasmaLifecycleState.DORMANT && this.miasmaHazard.state !== MiasmaLifecycleState.SPORE_DISSIPATION) {
      const miRes = this.miasmaHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      if (miRes.sporeSurgeGranted) {
        this.grantSporeSurge();
      } else if (miRes.hit && miRes.damage > 0 && !this.isInvulnerable && !this.isDashing) {
        this.spawnFloatingText(this.player.x, this.player.y - 14, `-${miRes.damage} CORROSIVE BURST`, '#ef4444');
        if (this.cameraTrauma) {
          this.cameraTrauma.addTrauma(0.40);
        }
        this.playerDie();
      } else if (miRes.neurotoxinInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applyNeurotoxin();
      }
      miasmaMultiplier = miRes.slowFactor;
    }
    if (isSporeSurgeActive) {
      miasmaMultiplier *= (1.0 + SPORE_SURGE_SPEED_BURST_RATIO);
    }
    if (isNeurotoxinActive) {
      miasmaMultiplier *= (1.0 - NEUROTOXIN_SLOW_RATIO);
    }

    let chronoMultiplier = 1.0;
    const isChronoSurgeActive = this.activeBuffs.some((b) => b.id === 'CHRONO_SURGE');
    const isTemporalDilationActive = this.activeBuffs.some((b) => b.id === 'TEMPORAL_DILATION');
    if (this.chronoHazard && this.chronoHazard.state !== ChronoLifecycleState.DORMANT && this.chronoHazard.state !== ChronoLifecycleState.TACHYON_RECOVERY) {
      const chRes = this.chronoHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      if (chRes.chronoSurgeGranted) {
        this.grantChronoSurge();
      } else if (chRes.hit && chRes.damage > 0 && !this.isInvulnerable && !this.isDashing) {
        this.spawnFloatingText(this.player.x, this.player.y - 14, `-${chRes.damage} TIME COLLAPSE`, '#818cf8');
        if (this.cameraTrauma) {
          this.cameraTrauma.addTrauma(0.40);
        }
        this.playerDie();
      } else if (chRes.temporalDilationInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applyTemporalDilation();
      }
      chronoMultiplier = chRes.slowFactor;
    }
    if (isChronoSurgeActive) {
      chronoMultiplier *= (1.0 + CHRONO_SURGE_SPEED_BURST_RATIO);
    }
    if (isTemporalDilationActive) {
      chronoMultiplier *= (1.0 - TEMPORAL_DILATION_SLOW_RATIO);
    }

    let solarMultiplier = 1.0;
    const isSolarSurfActive = this.activeBuffs.some((b) => b.id === 'SOLAR_SURF');
    const isSunstrokeActive = this.activeBuffs.some((b) => b.id === 'SUNSTROKE');
    if (this.solarHazard && this.solarHazard.state !== SolarLifecycleState.DORMANT && this.solarHazard.state !== SolarLifecycleState.CORONA_RECOVERY) {
      const sRes = this.solarHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      if (sRes.solarSurfGranted) {
        this.grantSolarSurf();
      } else if (sRes.hit && sRes.damage > 0 && !this.isInvulnerable && !this.isDashing) {
        this.spawnFloatingText(this.player.x, this.player.y - 14, `-${sRes.damage} SUPERHEAT FLARE`, '#f59e0b');
        if (this.cameraTrauma) {
          this.cameraTrauma.addTrauma(0.40);
        }
        this.playerDie();
      } else if (sRes.sunstrokeInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applySunstroke();
      }
      solarMultiplier = sRes.slowFactor;
    }
    if (isSolarSurfActive) {
      solarMultiplier *= (1.0 + SOLAR_SURF_SPEED_BURST_RATIO);
    }
    if (isSunstrokeActive) {
      solarMultiplier *= (1.0 - SUNSTROKE_SLOW_RATIO);
    }

    let nebulaMultiplier = 1.0;
    const isAstralGlideActive = this.activeBuffs.some((b) => b.id === 'ASTRAL_GLIDE');
    const isCosmicDazeActive = this.activeBuffs.some((b) => b.id === 'COSMIC_DAZE');
    if (this.nebulaHazard && this.nebulaHazard.state !== NebulaLifecycleState.DORMANT && this.nebulaHazard.state !== NebulaLifecycleState.STELLAR_DAWN) {
      const nRes = this.nebulaHazard.evaluatePlayer(px, py, this.isDashing, this.time?.now ?? Date.now(), wantX, wantY);
      if (nRes.astralGlideGranted) {
        this.grantAstralGlide();
      } else if (nRes.hit && nRes.damage > 0 && !this.isInvulnerable && !this.isDashing) {
        this.spawnFloatingText(this.player.x, this.player.y - 14, `-${nRes.damage} ECLIPSE COLLAPSE`, '#a855f7');
        if (this.cameraTrauma) {
          this.cameraTrauma.addTrauma(0.40);
        }
        this.playerDie();
      } else if (nRes.dazeInflicted && !this.isDashing && !this.isInvulnerable) {
        this.applyCosmicDaze();
      }
      nebulaMultiplier = nRes.slowFactor;
    }
    if (isAstralGlideActive) {
      nebulaMultiplier *= (1.0 + ASTRAL_GLIDE_SPEED_BURST_RATIO);
    }
    if (isCosmicDazeActive) {
      nebulaMultiplier *= (1.0 - COSMIC_DAZE_SLOW_RATIO);
    }

    // Return here if we are just dashing (so we evaluated hazards, but dash controls velocity)
    if (this.isDashing) {
      return;
    }

    if (isIdle) {
      this.player.setVelocity(0, 0);
      this.player.anims.stop();
      switch (this.playerFacing) {
        case 'down': this.player.setFrame(0); break;
        case 'up': this.player.setFrame(3); break;
        case 'right': this.player.setFlipX(false); this.player.setFrame(6); break;
        case 'left': this.player.setFlipX(true); this.player.setFrame(6); break;
      }
      return;
    }

    const rawCompoundMultiplier = gravityMultiplier * frostMultiplier * voltMultiplier * magmaMultiplier * miasmaMultiplier * chronoMultiplier * solarMultiplier * nebulaMultiplier;
    const clampedHazardMultiplier = Math.min(1.85, Math.max(0.30, Number.isFinite(rawCompoundMultiplier) && rawCompoundMultiplier > 0 ? rawCompoundMultiplier : 1.0));

    const hazardSlowdownReduction = this.appliedPerkBonuses?.groundSlowdownReduction || 0;
    let effectiveHazardMultiplier = clampedHazardMultiplier;
    if (clampedHazardMultiplier < 1.0 && hazardSlowdownReduction > 0) {
      effectiveHazardMultiplier = 1.0 - (1.0 - clampedHazardMultiplier) * (1.0 - hazardSlowdownReduction);
    }

    const postDashMultiplier = this.dashSpeedBurstRemaining > 0 ? this.dashSpeedBurstMultiplier : 1.0;
    const speed = calculateClampedPlayerSpeed({
      baseSpeed: this.playerSpeed,
      perkSpeedBonus,
      surgeBonus,
      isDashing: this.isDashing,
      dashSpeed: DASH_SPEED,
      phaseJitterActive: isPhaseJittered,
      speedMultiplier: effectiveHazardMultiplier * postDashMultiplier,
    });
    const slideSpeed = speed;
    const snapThreshold = Math.max(2, speed * (delta / 1000));
    const isMobile = this.isMobileDevice();
    const baseTol = this.cornerSlideTolerance || 8;
    const tol = isMobile ? Math.max(baseTol + 4, 14) : baseTol;

    // Resolve dominant axis when multiple inputs are pressed
    let primaryAxis: 'x' | 'y' = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = this.isTilePassableForPlayer(row, col + wantX, row, col);
      const yOpen = this.isTilePassableForPlayer(row + wantY, col, row, col);

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
      const directOpen = this.isTilePassableForPlayer(row, nextCol, row, col);

      if (directOpen) {
        if (Math.abs(diffY) > snapThreshold) {
          vy = -Math.sign(diffY) * slideSpeed;
        } else {
          this.player.y = rowCenterY;
          if (this.player.body && typeof (this.player.body as unknown as { updateFromGameObject?: () => void }).updateFromGameObject === 'function') {
            (this.player.body as unknown as { updateFromGameObject: () => void }).updateFromGameObject();
          }
          vy = 0;
        }
      } else {
        const canRoundUp = diffY <= 0 && Math.abs(diffY) <= tol && this.isTilePassableForPlayer(row - 1, col, row, col) && this.isTilePassableForPlayer(row - 1, nextCol, row, col);
        const canRoundDown = diffY >= 0 && Math.abs(diffY) <= tol && this.isTilePassableForPlayer(row + 1, col, row, col) && this.isTilePassableForPlayer(row + 1, nextCol, row, col);

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
      const directOpen = this.isTilePassableForPlayer(nextRow, col, row, col);

      if (directOpen) {
        if (Math.abs(diffX) > snapThreshold) {
          vx = -Math.sign(diffX) * slideSpeed;
        } else {
          this.player.x = colCenterX;
          if (this.player.body && typeof (this.player.body as unknown as { updateFromGameObject?: () => void }).updateFromGameObject === 'function') {
            (this.player.body as unknown as { updateFromGameObject: () => void }).updateFromGameObject();
          }
          vx = 0;
        }
      } else {
        const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= tol && this.isTilePassableForPlayer(row, col - 1, row, col) && this.isTilePassableForPlayer(nextRow, col - 1, row, col);
        const canRoundRight = diffX >= 0 && Math.abs(diffX) <= tol && this.isTilePassableForPlayer(row, col + 1, row, col) && this.isTilePassableForPlayer(nextRow, col + 1, row, col);

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

    const bomb = this.bombs.get(centerX, centerY, 'bomb') as Phaser.Physics.Arcade.Sprite;
    if (!bomb) return;
    bomb.setActive(true).setVisible(true);
    bomb.enableBody(true, centerX, centerY, true, true);
    bomb.setDepth(RENDER_DEPTH.BOMBS);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
    applyPhysicsBodyInvariantGuard(bomb, 32, 32, 4, 4);

    this.populateBombIgnoringColliders(bomb, this.player);

    if (this.relicManager) {
      const activeEnemies: { id: string; r: number; c: number }[] = [];
      this.enemies.getChildren().forEach((child) => {
        const e = child as BaseEntity;
        if (e && e.active && !e.isDead) {
          activeEnemies.push({
            id: (e as unknown as { id?: string }).id || `e_${e.x}_${e.y}`,
            r: Math.floor(e.y / TILE_SIZE),
            c: Math.floor(e.x / TILE_SIZE),
          });
        }
      });
      const pullResult = this.relicManager.onBombPlaced({ r: row, c: col }, activeEnemies, Date.now());
      if (pullResult.pulledEnemyIds.length > 0) {
        this.enemies.getChildren().forEach((child) => {
          const e = child as BaseEntity;
          const eId = (e as unknown as { id?: string }).id || `e_${e.x}_${e.y}`;
          if (pullResult.pulledEnemyIds.includes(eId) && e.body) {
            const dirX = centerX - e.x;
            const dirY = centerY - e.y;
            const len = Math.sqrt(dirX * dirX + dirY * dirY);
            if (len > 0) {
              e.setVelocity((dirX / len) * 80, (dirY / len) * 80);
            }
          }
        });
      }
    }

    const bombId = `bomb_${Date.now()}_${Math.random()}`;
    bomb.setData('id', bombId);
    bomb.setData('owner', 'player');
    bomb.setData('power', this.bombPower);

    let fuseDuration = 2000;
    if (this.dynamicHazard) {
      const hazardInteraction = this.dynamicHazard.onBombPlaced(bombId, row, col, this.bombPower, 2000);
      fuseDuration = hazardInteraction.modifiedFuseMs;

      // Subspace Hyper-Fuse: fuse compressed to 1500ms when placed on Spire anchor
      if (fuseDuration === HYPER_FUSE_MS) {
        bomb.setTint(0x38bdf8);
        this.spawnFloatingText(centerX, centerY - 25, '⚡ HYPER-FUSE (1.5s)', '#38bdf8');
      }

      // Quantum Entanglement: Ghost bomb spawned at paired spire
      if (
        hazardInteraction.isEntangled &&
        hazardInteraction.ghostBombId !== undefined &&
        hazardInteraction.pairedR !== undefined &&
        hazardInteraction.pairedC !== undefined
      ) {
        this.spawnGhostBomb(
          hazardInteraction.ghostBombId,
          bombId,
          hazardInteraction.pairedR,
          hazardInteraction.pairedC,
          this.bombPower,
          fuseDuration
        );
      }
    }

    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      const frostInteraction = this.frostHazard.onBombPlaced(bombId, row, col, this.bombPower, fuseDuration);
      if (frostInteraction.isFrozen) {
        fuseDuration = frostInteraction.modifiedFuseMs;
        bomb.setTint(0x93c5fd);
        this.spawnFloatingText(centerX, centerY - 25, '❄️ GLACIAL FUSE (+1.5s)', '#93c5fd');
      }
    }

    if (this.voltHazard && this.voltHazard.state !== VoltLifecycleState.DORMANT && this.voltHazard.state !== VoltLifecycleState.DISCHARGE_COOLDOWN) {
      const voltInteraction = this.voltHazard.onBombPlaced(bombId, row, col, this.bombPower, fuseDuration);
      if (voltInteraction.isVoltCharged) {
        fuseDuration = voltInteraction.modifiedFuseMs;
        bomb.setTint(voltInteraction.tint ?? 0xfacc15);
        this.spawnFloatingText(centerX, centerY - 25, voltInteraction.floatingText ?? '⚡ VOLT CHARGED (-1.2s)', '#facc15');
      }
    }

    if (this.magmaHazard && this.magmaHazard.state !== MagmaLifecycleState.DORMANT && this.magmaHazard.state !== MagmaLifecycleState.OBSIDIAN_COOLDOWN) {
      const magmaInteraction = this.magmaHazard.onBombPlaced(bombId, row, col, this.bombPower, fuseDuration);
      if (magmaInteraction.isPyroFused) {
        fuseDuration = magmaInteraction.modifiedFuseMs;
        bomb.setTint(magmaInteraction.tint ?? 0xf97316);
        this.spawnFloatingText(centerX, centerY - 25, magmaInteraction.floatingText ?? '🔥 PYRO-FUSED (-1.2s)', '#f97316');
      }
    }

    if (this.miasmaHazard && this.miasmaHazard.state !== MiasmaLifecycleState.DORMANT && this.miasmaHazard.state !== MiasmaLifecycleState.SPORE_DISSIPATION) {
      const miasmaInteraction = this.miasmaHazard.onBombPlaced(bombId, row, col, this.bombPower, fuseDuration);
      if (miasmaInteraction.isBioFused) {
        fuseDuration = miasmaInteraction.modifiedFuseMs;
        bomb.setTint(miasmaInteraction.tint ?? MIASMA_SUPER_BOMB_TINT);
        this.spawnFloatingText(centerX, centerY - 25, miasmaInteraction.floatingText ?? FLOATING_TEXT_BIO_FUSED, '#10b981');
      }
    }

    if (this.chronoHazard && this.chronoHazard.state !== ChronoLifecycleState.DORMANT && this.chronoHazard.state !== ChronoLifecycleState.TACHYON_RECOVERY) {
      const chronoInteraction = this.chronoHazard.onBombPlaced(bombId, row, col, this.bombPower, fuseDuration);
      if (chronoInteraction.isChronoShifted) {
        fuseDuration = chronoInteraction.modifiedFuseMs;
        bomb.setTint(chronoInteraction.tint ?? CHRONO_SUPER_BOMB_TINT);
        this.spawnFloatingText(centerX, centerY - 25, chronoInteraction.floatingText ?? FLOATING_TEXT_CHRONO_SHIFTED, '#818cf8');
      }
    }

    if (this.solarHazard && this.solarHazard.state !== SolarLifecycleState.DORMANT && this.solarHazard.state !== SolarLifecycleState.CORONA_RECOVERY) {
      const solarInteraction = this.solarHazard.onBombPlaced(bombId, row, col, this.bombPower, fuseDuration);
      if (solarInteraction.isSolarFused) {
        fuseDuration = solarInteraction.modifiedFuseMs;
        bomb.setTint(solarInteraction.tint ?? SOLAR_SUPER_BOMB_TINT);
        this.spawnFloatingText(centerX, centerY - 25, solarInteraction.floatingText ?? FLOATING_TEXT_SOLAR_FUSED, '#f59e0b');
      }
    }

    if (this.nebulaHazard && this.nebulaHazard.state !== NebulaLifecycleState.DORMANT && this.nebulaHazard.state !== NebulaLifecycleState.STELLAR_DAWN) {
      const nebulaInteraction = this.nebulaHazard.onBombPlaced(bombId, row, col, this.bombPower, fuseDuration);
      if (nebulaInteraction.isAccelerated) {
        fuseDuration = Math.max(800, fuseDuration - nebulaInteraction.fuseAccelerationMs);
        bomb.setTint(nebulaInteraction.bombTint ?? NEBULA_SUPER_BOMB_TINT);
        this.spawnFloatingText(centerX, centerY - 25, nebulaInteraction.floatingText ?? FLOATING_TEXT_NEBULA_FUSED, '#a855f7');
      }
    }

    const scale = fuseDuration / 2000;
    // Multi-stage 4-phase asymmetric accelerating pulse tween chain with 100ms pre-detonation whiteout contraction
    const tweenChain = this.tweens.chain({
      targets: bomb,
      tweens: [
        // Phase 1: Asymmetric Rhythmic Heartbeat (scaled)
        {
          scaleX: 1.14,
          scaleY: 1.04,
          duration: 250 * scale,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        // Phase 2: Boiling Pressure Amber Swell (scaled)
        {
          scaleX: 1.22,
          scaleY: 0.92,
          duration: 150 * scale,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(fuseDuration === HYPER_FUSE_MS ? 0x0284c7 : 0xff8844);
          },
        },
        // Phase 3: Critical Detonation Hyper-Pulse & Micro-Jitter (scaled)
        {
          scaleX: 1.32,
          scaleY: 1.12,
          angle: 3.5,
          duration: 50 * scale,
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (bomb.active) bomb.setTint(fuseDuration === HYPER_FUSE_MS ? 0x0ea5e9 : 0xff2222);
          },
        },
        // Phase 4: Detonation Anticipation Gasp & Whiteout Contraction (scaled)
        {
          scaleX: 0.80,
          scaleY: 0.80,
          duration: 100 * scale,
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

    const fuseTimer = this.time.delayedCall(fuseDuration, () => {
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

  /**
   * Spawns an Entangled Ghost Bomb at the paired Spire crystal
   * Cloned properties, holographic visuals, and synchronized detonation
   */
  spawnGhostBomb(
    ghostId: number | string,
    parentBombId: string,
    row: number,
    col: number,
    power: number,
    fuseMs: number
  ): void {
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    let hasBomb = false;
    this.bombs.getChildren().forEach((child: Phaser.GameObjects.GameObject) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active && b.x === centerX && b.y === centerY) {
        hasBomb = true;
      }
    });
    if (hasBomb) return;

    const ghostBomb = this.bombs.create(centerX, centerY, 'bomb') as Phaser.Physics.Arcade.Sprite;
    ghostBomb.setDepth(RENDER_DEPTH.BOMBS);
    (ghostBomb.body as Phaser.Physics.Arcade.Body)?.setSize(32, 32).setOffset(4, 4);
    (ghostBomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
    applyPhysicsBodyInvariantGuard(ghostBomb, 32, 32, 4, 4);

    ghostBomb.setData('id', ghostId);
    ghostBomb.setData('parentBombId', parentBombId);
    ghostBomb.setData('owner', 'player');
    ghostBomb.setData('power', power);
    ghostBomb.setData('isGhostBomb', true);

    // Translucent cyan holographic appearance (GDD spec)
    ghostBomb.setTint(0x00ffff);
    ghostBomb.setAlpha(0.8);

    const scale = fuseMs / 2000;
    const tweenChain = this.tweens.chain({
      targets: ghostBomb,
      tweens: [
        {
          scaleX: 1.14,
          scaleY: 1.04,
          duration: 250 * scale,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
        },
        {
          scaleX: 1.22,
          scaleY: 0.92,
          duration: 150 * scale,
          yoyo: true,
          repeat: 1,
          ease: 'Quad.easeInOut',
          onStart: () => {
            if (ghostBomb.active) ghostBomb.setTint(0x38bdf8);
          },
        },
        {
          scaleX: 1.32,
          scaleY: 1.12,
          angle: 3.5,
          duration: 50 * scale,
          yoyo: true,
          repeat: 2,
          ease: 'Back.easeOut',
          onStart: () => {
            if (ghostBomb.active) ghostBomb.setTint(0x67e8f9);
          },
        },
        {
          scaleX: 0.80,
          scaleY: 0.80,
          duration: 100 * scale,
          ease: 'Quad.easeIn',
          onStart: () => {
            if (ghostBomb.active) {
              ghostBomb.setTint(0xffffff);
              ghostBomb.setAngle(0);
            }
          },
        },
      ],
    });

    const fuseTimer = this.time.delayedCall(fuseMs, () => {
      if (ghostBomb && ghostBomb.active) {
        const curCol = Math.floor(ghostBomb.x / TILE_SIZE);
        const curRow = Math.floor(ghostBomb.y / TILE_SIZE);
        this.explodeBomb(ghostBomb, curRow, curCol);
      }
    });
    ghostBomb.setData('fuseTimer', fuseTimer);
    ghostBomb.setData('tweenChain', tweenChain);

    this.spawnFloatingText(centerX, centerY - 25, '✦ QUANTUM ENTANGLED', '#00ffff');
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
    applyPhysicsBodyInvariantGuard(bomb, 32, 32, 4, 4);

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

    if (bomb.active) { bomb.disableBody(true, true); }

    const isGhostBomb = Boolean(bomb.getData('isGhostBomb'));

    // Isolated capacity management (ghost bombs do not consume regular bomb slots)
    if (owner === 'player' && !isGhostBomb) {
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

    // Dynamic Hazard Tactical Bomb Interactions:
    // 1. Tachyon Overcharge (+2 blast power inside active beam)
    // 2. Synchronized Entanglement Detonation
    let effectivePower = bombPower;
    let isPiercing = false;

    if (this.dynamicHazard) {
      const detResult = this.dynamicHazard.onBombDetonated(bombId, actualRow, actualCol, bombPower);
      if (detResult.overcharged) {
        effectivePower = detResult.modifiedPower;
        isPiercing = detResult.piercing;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, '⚡ TACHYON OVERCHARGE (+2)', '#38bdf8');
      }

      // Synchronized Entanglement Detonation: Trigger paired ghost bomb / parent bomb immediately
      if (detResult.pairedGhostBombIds && detResult.pairedGhostBombIds.length > 0) {
        const pairedBombsToDetonate: { b: Phaser.Physics.Arcade.Sprite; r: number; c: number }[] = [];
        const allBombs = this.bombs.getChildren();
        for (let i = 0; i < allBombs.length; i++) {
          const b = allBombs[i] as Phaser.Physics.Arcade.Sprite;
          if (b && b.active && b !== bomb) {
            const bId = b.getData('id');
            const parentId = b.getData('parentBombId');
            if (detResult.pairedGhostBombIds.includes(bId) || (parentId && detResult.pairedGhostBombIds.includes(parentId))) {
              const bCol = Math.floor(b.x / TILE_SIZE);
              const bRow = Math.floor(b.y / TILE_SIZE);
              pairedBombsToDetonate.push({ b, r: bRow, c: bCol });
            }
          }
        }
        for (let i = 0; i < pairedBombsToDetonate.length; i++) {
          const target = pairedBombsToDetonate[i];
          if (target.b.active) {
            this.explodeBomb(target.b, target.r, target.c);
          }
        }
      }
    }

    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      const fDet = this.frostHazard.onBombDetonated(bombId, actualRow, actualCol, effectivePower);
      if (fDet.isThermalShock) {
        effectivePower = fDet.modifiedPower;
        isPiercing = isPiercing || fDet.piercing;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, fDet.floatingText, '#38bdf8');
        this.score += fDet.bonusScore;
        this.emitStatsUpdate();
      }
    }

    if (this.voltHazard && this.voltHazard.state !== VoltLifecycleState.DORMANT && this.voltHazard.state !== VoltLifecycleState.DISCHARGE_COOLDOWN) {
      const vDet = this.voltHazard.onBombDetonated(bombId, actualRow, actualCol, effectivePower);
      if (vDet.isChainLightning) {
        effectivePower = vDet.modifiedPower;
        isPiercing = isPiercing || vDet.piercing;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, vDet.floatingText || '⚡ CHAIN LIGHTNING (+200)', '#facc15');
        this.score += vDet.bonusScore;
        this.emitStatsUpdate();
      }
    }

    if (this.magmaHazard && this.magmaHazard.state !== MagmaLifecycleState.DORMANT && this.magmaHazard.state !== MagmaLifecycleState.OBSIDIAN_COOLDOWN) {
      const mDet = this.magmaHazard.onBombDetonated(bombId, actualRow, actualCol, effectivePower);
      if (mDet.isPyroclastic) {
        effectivePower = mDet.modifiedPower;
        isPiercing = isPiercing || mDet.piercing;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, mDet.floatingText || '🔥 PYROCLASTIC DETONATION (+200)', '#f97316');
        this.score += mDet.bonusScore;
        this.emitStatsUpdate();
      }
    }

    if (this.miasmaHazard && this.miasmaHazard.state !== MiasmaLifecycleState.DORMANT && this.miasmaHazard.state !== MiasmaLifecycleState.SPORE_DISSIPATION) {
      const miDet = this.miasmaHazard.onBombDetonated(bombId, actualRow, actualCol, effectivePower);
      if (miDet.isCatalytic) {
        effectivePower = miDet.modifiedPower;
        isPiercing = isPiercing || miDet.piercing;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, miDet.floatingText || FLOATING_TEXT_CATALYTIC_DETONATION, '#10b981');
        this.score += miDet.bonusScore;
        this.emitStatsUpdate();
      }
    }

    if (this.chronoHazard && this.chronoHazard.state !== ChronoLifecycleState.DORMANT && this.chronoHazard.state !== ChronoLifecycleState.TACHYON_RECOVERY) {
      const chDet = this.chronoHazard.onBombDetonated(bombId, actualRow, actualCol, effectivePower);
      if (chDet.isTemporalImplosion) {
        effectivePower = chDet.modifiedPower;
        isPiercing = isPiercing || chDet.piercing;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, chDet.floatingText || FLOATING_TEXT_TEMPORAL_IMPLOSION, '#818cf8');
        this.score += chDet.bonusScore;
        this.emitStatsUpdate();
      }
    }

    if (this.solarHazard && this.solarHazard.state !== SolarLifecycleState.DORMANT && this.solarHazard.state !== SolarLifecycleState.CORONA_RECOVERY) {
      const solDet = this.solarHazard.onBombDetonated(bombId, actualRow, actualCol, effectivePower);
      if (solDet.isSupernova) {
        effectivePower = solDet.modifiedPower;
        isPiercing = isPiercing || solDet.piercing;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, solDet.floatingText || FLOATING_TEXT_SUPERNOVA, '#f59e0b');
        this.score += solDet.bonusScore;
        this.emitStatsUpdate();
      }
    }

    if (this.nebulaHazard && this.nebulaHazard.state !== NebulaLifecycleState.DORMANT && this.nebulaHazard.state !== NebulaLifecycleState.STELLAR_DAWN) {
      const nebDet = this.nebulaHazard.onBombDetonated(bombId, actualRow, actualCol, effectivePower);
      if (nebDet.isSingularity) {
        effectivePower += nebDet.extraPower;
        isPiercing = true;
        const cX = actualCol * TILE_SIZE + TILE_SIZE / 2;
        const cY = actualRow * TILE_SIZE + TILE_SIZE / 2;
        this.spawnFloatingText(cX, cY - 25, nebDet.floatingText || FLOATING_TEXT_SINGULARITY_BURST, '#a855f7');
        this.score += nebDet.bonusScore;
        this.emitStatsUpdate();
      }
    }

    // 3. Polarization Strike helper (blast cleanses spire into golden channel for 8.0s)
    const checkPolarizationStrike = (r: number, c: number) => {
      if (this.frostHazard) {
        this.frostHazard.onBombBlastImpact(r, c);
      }
      if (this.voltHazard) {
        this.voltHazard.onBombBlastImpact(r, c);
      }
      if (this.magmaHazard) {
        const quenchRes = this.magmaHazard.onBombBlastImpact(r, c);
        if (quenchRes.quenched) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          this.spawnFloatingText(px, py - 20, quenchRes.floatingText, '#6366f1');
          if (this.magmaHazardAudio) {
            this.magmaHazardAudio.playObsidianQuenchSnap();
          }
        }
      }
      if (this.miasmaHazard) {
        const cleanseRes = this.miasmaHazard.onBombBlastImpact(r, c);
        if (cleanseRes.cleansed) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          this.spawnFloatingText(px, py - 20, cleanseRes.floatingText, '#10b981');
          if (this.miasmaHazardAudio) {
            this.miasmaHazardAudio.playFloralCleanseSnap();
          }
        }
      }
      if (this.chronoHazard) {
        const stabRes = this.chronoHazard.onBombBlastImpact(r, c);
        if (stabRes.stabilized) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          this.spawnFloatingText(px, py - 20, stabRes.floatingText, '#818cf8');
          if (this.chronoHazardAudio) {
            this.chronoHazardAudio.playTimelineStabilizeSnap();
          }
        }
      }
      if (this.solarHazard) {
        const calmRes = this.solarHazard.onBombBlastImpact(r, c);
        if (calmRes.quenched) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          this.spawnFloatingText(px, py - 20, calmRes.floatingText, '#fbbf24');
          if (this.solarHazardAudio) {
            this.solarHazardAudio.playSolarCalmResolution();
          }
        }
      }
      if (this.nebulaHazard) {
        const calmRes = this.nebulaHazard.onBombBlastImpact(r, c);
        if (calmRes.cleanedTilesCount > 0) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          this.spawnFloatingText(px, py - 20, calmRes.floatingText, '#c084fc');
          if (this.nebulaHazardAudio) {
            this.nebulaHazardAudio.playStardustCalmSnap();
          }
        }
      }
      if (this.crisisManager && this.crisisManager.dispelPsionicIllusionAt(r, c)) {
        const px = c * TILE_SIZE + TILE_SIZE / 2;
        const py = r * TILE_SIZE + TILE_SIZE / 2;
        this.score += 150;
        this.emitStatsUpdate();
        this.spawnFloatingText(px, py - 20, '+150 DISPELLED!', '#ec4899');
        this.grantDistortionBarrier();
      }
      if (this.dynamicHazard) {
        const impact = this.dynamicHazard.onBombBlastImpact(r, c);
        if (impact.polarized) {
          const px = c * TILE_SIZE + TILE_SIZE / 2;
          const py = r * TILE_SIZE + TILE_SIZE / 2;
          this.spawnFloatingText(px, py - 20, '★ POLARIZATION STRIKE (8.0s)', '#facc15');
          this.score += 350;
          this.emitStatsUpdate();

          // Purge 3x3 surrounding tiles if crisis manager is active
          if (this.crisisManager && this.crisisManager.getActiveCrisis()) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                this.crisisManager.handleBombBlast(r + dr, c + dc, 1);
              }
            }
          }
        }
      }
    };

    checkPolarizationStrike(actualRow, actualCol);

    // Crisis blast interaction (clearing void creep, charging prisms, psionic disruption)
    if (this.crisisManager && this.crisisManager.getActiveCrisis()) {
      const activeCrisis = this.crisisManager.getActiveCrisis();
      const isPsychic = activeCrisis && (activeCrisis.id === 'psychic_invasion' || (activeCrisis as unknown as { type?: CrisisType }).type === CrisisType.PSYCHIC_INVASION);
      let psionicBefore = 0;
      const psychicCrisis = activeCrisis as unknown as { manifestations?: Array<{ isDestroyed: boolean }> } | null;
      if (isPsychic && psychicCrisis && Array.isArray(psychicCrisis.manifestations)) {
        psionicBefore = psychicCrisis.manifestations.filter((m) => m.isDestroyed).length;
      }

      this.crisisManager.handleBombBlast(actualRow, actualCol, effectivePower);

      if (isPsychic && psychicCrisis && Array.isArray(psychicCrisis.manifestations)) {
        const psionicAfter = psychicCrisis.manifestations.filter((m) => m.isDestroyed).length;
        if (psionicAfter > psionicBefore) {
          this.score += 500;
          this.addUltimateCharge(10);
          this.spawnFloatingText(actualCol * TILE_SIZE + 20, actualRow * TILE_SIZE + 20, '🧠 PSIONIC DISRUPTED! +500', '#ec4899');
          this.emitStatsUpdate();
        }
      }
    }

    // Mutant Flora boss root overgrowth cleanse
    const floraBoss = this.activeBoss as unknown as { cleanseRootsAt?: (r: number, c: number, p: number) => number } | null;
    if (floraBoss && typeof floraBoss.cleanseRootsAt === 'function') {
      const cleansed = floraBoss.cleanseRootsAt(actualRow, actualCol, effectivePower);
      if (cleansed > 0) {
        this.score += 150 * cleansed;
        this.spawnFloatingText(actualCol * TILE_SIZE + 20, actualRow * TILE_SIZE + 20, `🌿 OVERGROWTH CLEARED! +${150 * cleansed}`, '#10b981');
        this.emitStatsUpdate();
      }
    }

    // Relic proc on bomb exploded: Pyroclastic Prism (ARCH-RELIC-01)
    if (owner === 'player' && this.relicManager) {
      const relicExp = this.relicManager.onBombExploded({ r: actualRow, c: actualCol }, Date.now());
      if (relicExp.spawnDiagonalShards) {
        for (const shard of relicExp.shards) {
          for (let step = 1; step <= shard.maxDist; step++) {
            const sr = actualRow + shard.dr * step;
            const sc = actualCol + shard.dc * step;
            if (sr >= 0 && sr < ROWS && sc >= 0 && sc < COLS) {
              if (this.map[sr][sc] === TILE_WALL) break;
              checkPolarizationStrike(sr, sc);
              this.spawnExplosion(sr, sc, false, owner, bombId, isPiercing);
              if (this.map[sr][sc] === TILE_BLOCK) {
                this.destroyBlock(sr, sc);
                break;
              }
            }
          }
        }
      }
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
    const shockwave = this.graphicsPool ? this.graphicsPool.acquire() : null;
    if (shockwave) {
      shockwave.setActive(true).setVisible(true);
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
          if (this.graphicsPool) this.graphicsPool.release(shockwave);
        },
      });
    }

    // Spawn Epicenter Explosion (isCenter = true, passing bombId for PHYS-06)
    this.spawnExplosion(actualRow, actualCol, true, owner, bombId, isPiercing);

    // Epicenter chain reaction: detonate any other active bombs stacked on the same tile
    const sameTileBombs: Phaser.Physics.Arcade.Sprite[] = [];
    const bombChildren = this.bombs.getChildren();
    for (let cIdx = 0; cIdx < bombChildren.length; cIdx++) {
      const otherBomb = bombChildren[cIdx] as Phaser.Physics.Arcade.Sprite;
      if (otherBomb && otherBomb.active && otherBomb !== bomb) {
        const bCol = Math.floor(otherBomb.x / TILE_SIZE);
        const bRow = Math.floor(otherBomb.y / TILE_SIZE);
        if (bRow === actualRow && bCol === actualCol) {
          sameTileBombs.push(otherBomb);
        }
      }
    }
    for (let i = 0; i < sameTileBombs.length; i++) {
      const otherBomb = sameTileBombs[i];
      if (otherBomb.active) {
        const bCol = Math.floor(otherBomb.x / TILE_SIZE);
        const bRow = Math.floor(otherBomb.y / TILE_SIZE);
        this.explodeBomb(otherBomb, bRow, bCol);
      }
    }

    for (const dir of CARDINAL_DIRECTIONS) {
      let blocksPierced = 0;
      for (let i = 1; i <= effectivePower; i++) {
        const nr = actualRow + dir.dr * i;
        const nc = actualCol + dir.dc * i;

        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;

        if (this.map[nr][nc] === TILE_WALL) {
          break; // Stop at unbreakable wall
        }

        checkPolarizationStrike(nr, nc);

        // PHYS-05: Prevent simultaneous blast ray piercing through destroyed blocks
        const key = `${nr},${nc}`;
        const isBlock = this.map[nr][nc] === TILE_BLOCK || this.destroyedBlocksThisTick.has(key);

        if (isBlock) {
          this.destroyedBlocksThisTick.add(key);
          if (this.map[nr][nc] === TILE_BLOCK) {
            this.destroyBlock(nr, nc);
          }
          this.spawnExplosion(nr, nc, false, owner, bombId, isPiercing);
          if (!isPiercing || ++blocksPierced >= 3) {
            break;
          }
          continue;
        }

        // Empty tile, spawn explosion
        this.spawnExplosion(nr, nc, false, owner, bombId, isPiercing);

        // Check for chain reaction with other bombs (snapshot targets to prevent iteration skips)
        const chainedBombs: Phaser.Physics.Arcade.Sprite[] = [];
        const activeBombsList = this.bombs.getChildren();
        for (let bIdx = 0; bIdx < activeBombsList.length; bIdx++) {
          const otherBomb = activeBombsList[bIdx] as Phaser.Physics.Arcade.Sprite;
          if (otherBomb && otherBomb.active) {
            const bCol = Math.floor(otherBomb.x / TILE_SIZE);
            const bRow = Math.floor(otherBomb.y / TILE_SIZE);
            if (bRow === nr && bCol === nc) {
              chainedBombs.push(otherBomb);
            }
          }
        }
        for (let j = 0; j < chainedBombs.length; j++) {
          const otherBomb = chainedBombs[j];
          if (otherBomb.active) {
            const bCol = Math.floor(otherBomb.x / TILE_SIZE);
            const bRow = Math.floor(otherBomb.y / TILE_SIZE);
            this.explodeBomb(otherBomb, bRow, bCol);
          }
        }
      }
    }
  }

  public createExplosionSprite(x: number, y: number, owner: string = 'player'): Phaser.Physics.Arcade.Sprite {
    const exp = this.explosions.create(x, y, 'explosion') as Phaser.Physics.Arcade.Sprite;
    exp.setDepth(RENDER_DEPTH.EXPLOSIONS);
    exp.setData('owner', owner);

    // PHYS-04 & PHYS-REV-02: Inset hitbox by 2px on all sides (36x36 at offset 2,2) with invariant guard
    (exp.body as Phaser.Physics.Arcade.Body)?.setSize(36, 36).setOffset(2, 2);
    applyPhysicsBodyInvariantGuard(exp, 36, 36, 2, 2);
    return exp;
  }

  spawnExplosion(
    row: number,
    col: number,
    isCenter: boolean = false,
    owner: string = 'player',
    bombId?: string,
    isOverchargedPiercing: boolean = false
  ) {
    const x = col * TILE_SIZE + TILE_SIZE / 2;
    const y = row * TILE_SIZE + TILE_SIZE / 2;

    const exp = this.createExplosionSprite(x, y, owner);

    // Center core has bright brilliant tint, arms have hot orange tint, tachyon overcharge has electric cyan tint
    if (isOverchargedPiercing) {
      exp.setTint(0x00ffff);
    } else if (isCenter) {
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
        if (exp.active) { exp.disableBody(true, true); }
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
        const ao = b.getData('aoShadow') as Phaser.GameObjects.Rectangle | undefined;
        if (ao) {
          if (this.rectPool) this.rectPool.release(ao);
          b.setData('aoShadow', undefined);
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
            const frag = this.rectPool ? this.rectPool.acquire() : null;
            if (!frag) return;
            frag.setActive(true).setVisible(true).setPosition(centerX + off.dx, centerY + off.dy)
              .setSize(8, 8).setFillStyle(isChest ? 0xfbbf24 : 0xb87333).setAlpha(1).setAngle(0).setScale(1);
            frag.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
            this.tweens.add({
              targets: frag,
              x: frag.x + off.vx,
              y: frag.y + off.vy,
              alpha: 0,
              angle: 45,
              duration: 220,
              onComplete: () => {
                if (this.rectPool) this.rectPool.release(frag);
              },
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

    this.relicManager?.onPlayerDamaged();

    if (this.hasShield) {
      if (this.shieldCharges > 1) {
        this.shieldCharges--;
        this.hasShield = true;
      } else {
        this.shieldCharges = 0;
        this.hasShield = false;
      }
      this.isInvulnerable = true;
      const shieldGrace = this.isMobileDevice() ? (SHIELD_INVULN_MS + 300) : SHIELD_INVULN_MS;
      this.shieldInvulnerableUntil = updateInvulnerabilityExpiry(this.shieldInvulnerableUntil, shieldGrace, this.time.now);
      if (this.cameraTrauma) {
        this.cameraTrauma.addTrauma(0.40);
      }
      this.triggerHitStop(50);

      // Spawn shield shatter burst
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const spark = this.circlePool ? this.circlePool.acquire() : null;
        if (!spark) continue;
        spark.setActive(true).setVisible(true).setPosition(this.player.x, this.player.y)
          .setRadius(4).setFillStyle(0x38bdf8, 0.9).setAlpha(0.9).setScale(1);
        spark.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
        this.tweens.add({
          targets: spark,
          x: this.player.x + Math.cos(angle) * 25,
          y: this.player.y + Math.sin(angle) * 25,
          alpha: 0,
          scale: 0.2,
          duration: 250,
          onComplete: () => {
            if (this.circlePool) this.circlePool.release(spark);
          },
        });
      }

      // 1.5s i-frame blink (+300ms on mobile)
      const shieldBlinkRepeats = this.isMobileDevice() ? 8 : 7;
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: shieldBlinkRepeats,
        onComplete: () => {
          if (this.player && this.player.active) {
            this.player.alpha = 1;
            if (!this.isDashing && !this.isAegisOverdriveActive && this.time.now >= this.shieldInvulnerableUntil) {
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
      const reviveGrace = this.isMobileDevice() ? 3300 : 3000;
      this.shieldInvulnerableUntil = updateInvulnerabilityExpiry(this.shieldInvulnerableUntil, reviveGrace, this.time.now);
      this.spawnFloatingText(this.player.x, this.player.y - 12, '1-UP REVIVED!', '#fb7185');
      this.cameras.main.flash(300, 251, 113, 133);

      // 3.0s i-frame blink and safe vulnerability restoration (PHYS-01, +300ms on mobile)
      const reviveBlinkRepeats = this.isMobileDevice() ? 16 : 14;
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: reviveBlinkRepeats,
        onComplete: () => {
          if (this.player && this.player.active) {
            this.player.alpha = 1;
            if (!this.isDashing && !this.isAegisOverdriveActive && this.time.now >= this.shieldInvulnerableUntil) {
              this.isInvulnerable = false;
            }
          }
        },
      });

      this.emitStatsUpdate();
      return;
    }

    // Check Second Wind perk (ARCH-PERK-01)
    if (this.perkManager?.triggerSecondWind()) {
      this.isInvulnerable = true;
      const secondWindGrace = this.isMobileDevice() ? 3300 : 3000;
      this.shieldInvulnerableUntil = updateInvulnerabilityExpiry(this.shieldInvulnerableUntil, secondWindGrace, this.time.now);
      this.hasShield = true;
      this.shieldCharges = 1;
      this.spawnFloatingText(this.player.x, this.player.y - 12, 'SECOND WIND!', '#fbbf24');
      this.cameras.main.flash(300, 251, 191, 36);

      // Golden shield VFX burst
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const spark = this.circlePool ? this.circlePool.acquire() : null;
        if (!spark) continue;
        spark.setActive(true).setVisible(true).setPosition(this.player.x, this.player.y)
          .setRadius(5).setFillStyle(0xfbbf24, 0.95).setAlpha(0.95).setScale(1);
        spark.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
        this.tweens.add({
          targets: spark,
          x: this.player.x + Math.cos(angle) * 35,
          y: this.player.y + Math.sin(angle) * 35,
          alpha: 0,
          scale: 0.2,
          duration: 350,
          onComplete: () => {
            if (this.circlePool) this.circlePool.release(spark);
          },
        });
      }

      // 3.0s i-frame blink and safe vulnerability restoration (+300ms on mobile)
      const secondWindBlinkRepeats = this.isMobileDevice() ? 16 : 14;
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: secondWindBlinkRepeats,
        onComplete: () => {
          if (this.player && this.player.active) {
            this.player.alpha = 1;
            if (!this.isDashing && !this.isAegisOverdriveActive && this.time.now >= this.shieldInvulnerableUntil) {
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
                          if (e.active) { e['disableBody'](true, true); }
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
                      if (enemy.active) { enemy['disableBody'](true, true); }
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

        const warhead = this.circlePool ? this.circlePool.acquire() : null;
        if (warhead) {
          warhead.setActive(true).setVisible(true).setPosition(targetX, targetY)
            .setRadius(14).setFillStyle(0xd90429, 0.9).setAlpha(0.9).setScale(1);
          warhead.setDepth(RENDER_DEPTH.BOMBS);
          this.tweens.add({
            targets: warhead,
            scale: 1.25,
            alpha: 0.6,
            yoyo: true,
            repeat: Math.floor(fuseTime / 200),
            duration: 100,
          });
        }

        this.time.delayedCall(fuseTime, () => {
            if (warhead && warhead.active) {
              if (this.circlePool) this.circlePool.release(warhead);
            }
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
                  if (enemy.active) { enemy['disableBody'](true, true); }
                  this.addUltimateCharge(CHARGE_VALUES.ENEMY_DEFEATED);
                }
              }
            }
          });

          const exp = this.createExplosionSprite(targetX, targetY, 'player');
          this.time.delayedCall(280, () => {
            if (exp.active) { exp.disableBody(true, true); }
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
    this.dashStartTime = this.time?.now || Date.now();
    const perkReduction = this.appliedPerkBonuses?.dashCooldownReductionMs || 0;
    this.dashCooldownRemaining = Math.max(1500, DASH_COOLDOWN_MS - perkReduction);

    // Creative Agent 5: Gravitational Escape when dashing inside pull field
    if (this.gravityHazard && this.gravityHazard.state !== GravityLifecycleState.DORMANT && this.gravityHazard.state !== GravityLifecycleState.COOLDOWN) {
      const pull = this.gravityHazard.evaluatePull(this.player.x, this.player.y);
      if (pull.inAccretionField) {
        this.grantGravitationalEscape();
      }
    }

    // Player Mastery: Thermal Break when dashing inside glaciated frost
    if (this.frostHazard && this.frostHazard.state !== FrostLifecycleState.DORMANT && this.frostHazard.state !== FrostLifecycleState.THAW_COOLDOWN) {
      if (this.frostHazard.isPointGlaciated(this.player.x, this.player.y)) {
        this.grantThermalBreak();
      }
    }

    // Player Mastery: Superconductor Dash when dashing inside electrified volt zone
    if (this.voltHazard && this.voltHazard.state !== VoltLifecycleState.DORMANT && this.voltHazard.state !== VoltLifecycleState.DISCHARGE_COOLDOWN) {
      if (this.voltHazard.isPointElectrified(this.player.x, this.player.y)) {
        this.grantSuperconductorDash();
      }
    }

    // Player Mastery: Magma Surf when dashing inside molten magma zone
    if (this.magmaHazard && this.magmaHazard.state !== MagmaLifecycleState.DORMANT && this.magmaHazard.state !== MagmaLifecycleState.OBSIDIAN_COOLDOWN) {
      if (this.magmaHazard.isPointMolten(this.player.x, this.player.y)) {
        this.grantMagmaSurf();
      }
    }

    // Player Mastery: Spore Surge when dashing inside miasma spore zone
    if (this.miasmaHazard && this.miasmaHazard.state !== MiasmaLifecycleState.DORMANT && this.miasmaHazard.state !== MiasmaLifecycleState.SPORE_DISSIPATION) {
      if (this.miasmaHazard.isPointInSporeZone(this.player.x, this.player.y)) {
        this.grantSporeSurge();
      }
    }

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
        const ghost = this.spritePool ? this.spritePool.acquire() : null;
        if (!ghost) return;
        ghost.setActive(true).setVisible(true).setPosition(this.player.x, this.player.y);
        if (typeof ghost.setTexture === 'function') {
          ghost.setTexture('player', this.player.frame?.name);
        }
        ghost.setFlipX(this.player.flipX);
        ghost.setAlpha(0.5);
        ghost.setScale(1);
        ghost.setTint(0x38bdf8);
        const pDepth = RENDER_DEPTH.ENTITY_Y_BASE + this.player.y * RENDER_DEPTH.ENTITY_Y_SCALE;
        ghost.setDepth(pDepth + RENDER_DEPTH.OFFSET_SHADOW);
        this.tweens.add({
          targets: ghost,
          alpha: 0,
          scale: 0.8,
          duration: 200,
          onComplete: () => {
            if (this.spritePool) this.spritePool.release(ghost);
          },
        });
      });
    }

    this.time.delayedCall(DASH_DURATION_MS, () => {
      this.isDashing = false;
      if (this.time.now >= this.shieldInvulnerableUntil && !this.isAegisOverdriveActive) {
        this.isInvulnerable = false;
      }
      if (this.player && this.player.active) {
        this.player.setVelocity(0, 0);
      }
      if (this.appliedPerkBonuses?.dashSpeedBurstRatio && this.appliedPerkBonuses.dashSpeedBurstRatio > 0) {
        this.dashSpeedBurstRemaining = 1000;
        this.dashSpeedBurstMultiplier = 1.0 + this.appliedPerkBonuses.dashSpeedBurstRatio;
      }
    });

    this.emitStatsUpdate();
  }

  private warpPlayer(toRow: number, toCol: number) {
    if (!this.player || !this.player.active) return;
    this.portalCooldown = PORTAL_COOLDOWN_MS;
    const targetX = toCol * TILE_SIZE + TILE_SIZE / 2;
    const targetY = toRow * TILE_SIZE + TILE_SIZE / 2;

    if (this.cameras?.main) {
      this.cameras.main.flash(100, 56, 189, 248, false);
    }

    if (this.tweens) {
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
            this.player.body?.reset(targetX, targetY);

            // Add destination portal bomb to ignoringColliders to prevent collision ejection (PHYS-REV-06)
            this.bombs?.getChildren().forEach((child) => {
              const b = child as Phaser.Physics.Arcade.Sprite;
              if (b.active) {
                const bCol = Math.floor(b.x / TILE_SIZE);
                const bRow = Math.floor(b.y / TILE_SIZE);
                if (bRow === toRow && bCol === toCol) {
                  let ignoring = b.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
                  if (!ignoring) {
                    ignoring = new Set();
                    b.setData('ignoringColliders', ignoring);
                  }
                  ignoring.add(this.player);

                  let playerIgnoring = this.player.getData('ignoringColliders') as Set<Phaser.GameObjects.GameObject> | undefined;
                  if (!playerIgnoring) {
                    playerIgnoring = new Set();
                    this.player.setData('ignoringColliders', playerIgnoring);
                  }
                  playerIgnoring.add(b);
                }
              }
            });
          }
        },
      });
    } else {
      this.player.setPosition(targetX, targetY);
      this.player.body?.reset(targetX, targetY);
    }
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
    const glow = this.circlePool ? this.circlePool.acquire() : null;
    if (glow) {
      glow.setActive(true).setVisible(true).setPosition(centerX, centerY)
        .setRadius(18).setFillStyle(0xfbbf24, 0.45).setAlpha(0.45).setScale(1);
      glow.setDepth(RENDER_DEPTH.ITEM_GLOW);
      this.tweens.add({
        targets: glow,
        scaleX: 1.3,
        scaleY: 1.3,
        alpha: 0,
        duration: ITEM_GRACE_PERIOD_MS,
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (this.circlePool) this.circlePool.release(glow);
        },
      });
    }

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
      const itemShadow = this.shadowPool ? this.shadowPool.acquire() : null;
      if (itemShadow) {
        itemShadow.setActive(true).setVisible(true).setPosition(centerX, centerY + 14);
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
          const s = item.getData('itemShadow') as Phaser.GameObjects.Sprite | null;
          if (s && s.active) {
            if (this.tweens) this.tweens.killTweensOf(s);
            if (this.shadowPool) this.shadowPool.release(s);
          }
          item.setData('itemShadow', null);
        });
      }
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
    let kickSpeed = BOMB_KICK_SPEED;
    if (this.miasmaHazard && this.miasmaHazard.state !== MiasmaLifecycleState.DORMANT) {
      const kickRes = this.miasmaHazard.onBombKicked(bomb.getData('id') || 'bomb', bRow, bCol, BOMB_KICK_SPEED);
      if (kickRes.isBioSlick) {
        kickSpeed = kickRes.modifiedSpeed || BOMB_KICK_MIASMA_SPEED;
        const txt = kickRes.floatingText || FLOATING_TEXT_BIO_SLICK_GLIDE;
        this.spawnFloatingText(bomb.x, bomb.y - 20, txt, '#10b981');
        if (this.miasmaHazardAudio) {
          this.miasmaHazardAudio.playBioSlickKick();
        }
      }
    }
    if (this.chronoHazard && this.chronoHazard.state !== ChronoLifecycleState.DORMANT) {
      const kickRes = this.chronoHazard.onBombKicked(bomb.getData('id') || 'bomb', bRow, bCol, BOMB_KICK_SPEED);
      if (kickRes.isSlipstream) {
        kickSpeed = kickRes.modifiedSpeed || BOMB_KICK_CHRONO_SPEED;
        const txt = kickRes.floatingText || FLOATING_TEXT_CHRONO_SLIPSTREAM;
        this.spawnFloatingText(bomb.x, bomb.y - 20, txt, '#818cf8');
        if (this.chronoHazardAudio) {
          this.chronoHazardAudio.playChronoSlipstreamKick();
        }
      }
    }
    if (this.solarHazard && this.solarHazard.state !== SolarLifecycleState.DORMANT) {
      const kickRes = this.solarHazard.onBombKicked(bomb.getData('id') || 'bomb', bRow, bCol, BOMB_KICK_SPEED);
      if (kickRes.isSlipstream) {
        kickSpeed = kickRes.modifiedSpeed || BOMB_KICK_SOLAR_SPEED;
        const txt = kickRes.floatingText || FLOATING_TEXT_SOLAR_SLIPSTREAM;
        this.spawnFloatingText(bomb.x, bomb.y - 20, txt, '#f59e0b');
        if (this.solarHazardAudio) {
          this.solarHazardAudio.playCoronaArcSweep();
        }
      }
    }
    if (this.nebulaHazard && this.nebulaHazard.state !== NebulaLifecycleState.DORMANT) {
      const kickRes = this.nebulaHazard.onBombKicked(bomb.getData('id') || 'bomb', bRow, bCol, BOMB_KICK_SPEED);
      if (kickRes.isSlipstreamKick) {
        kickSpeed = kickRes.kickSpeed || BOMB_KICK_NEBULA_SPEED;
        const txt = kickRes.floatingText || FLOATING_TEXT_ASTRAL_SLIPSTREAM;
        this.spawnFloatingText(bomb.x, bomb.y - 20, txt, '#a855f7');
        if (this.nebulaHazardAudio) {
          this.nebulaHazardAudio.playOpticalLensKick();
        }
      }
    }
    bomb.setData('isSliding', true);
    bomb.setData('slideSpeed', kickSpeed);
    let slideDir = bomb.getData('slideDir') as { x: number; y: number } | undefined;
    if (!slideDir) {
      slideDir = { x: dirX, y: dirY };
      bomb.setData('slideDir', slideDir);
    } else {
      slideDir.x = dirX;
      slideDir.y = dirY;
    }
    (bomb.body as Phaser.Physics.Arcade.Body)?.setImmovable(false);
    bomb.setVelocity(dirX * kickSpeed, dirY * kickSpeed);
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string) {
    const currentTime = this.time?.now || Date.now();
    const cascadeOffset = this.floatingTextManager
      ? Math.min(80, this.floatingTextManager.getCascadeOffset(x, y, currentTime))
      : 0;
    const startY = y - cascadeOffset;
    const targetY = startY - 22;

    const floating = this.floatingTextPool
      ? this.floatingTextPool.acquire()
      : this.add.text(x, startY, text, {
          fontSize: '12px',
          fontStyle: 'bold',
          fontFamily: 'monospace, "Press Start 2P", Arial, sans-serif',
          color,
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5, 0.5);

    if (!floating) return;

    floating.setActive(true).setVisible(true).setPosition(x, startY).setText(text).setColor(color).setAlpha(1);
    floating.setDepth(RENDER_DEPTH.FLOATING_TEXT);

    this.tweens.add({
      targets: floating,
      y: targetY,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (this.floatingTextPool) {
          this.floatingTextPool.release(floating);
        } else {
          floating.destroy();
        }
      },
    });
  }

  private spawnPickupParticles(x: number, y: number, colorStr: string) {
    const colorNum = parseInt(colorStr.replace('#', '0x'), 16) || 0xffffff;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spark = this.circlePool ? this.circlePool.acquire() : null;
      if (!spark) continue;
      spark.setActive(true).setVisible(true).setPosition(x, y).setRadius(3).setFillStyle(colorNum, 1).setAlpha(1).setScale(1);
      spark.setDepth(RENDER_DEPTH.DEBRIS_PARTICLES);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 18,
        y: y + Math.sin(angle) * 18,
        alpha: 0,
        scale: 0.3,
        duration: 280,
        onComplete: () => {
          if (this.circlePool) this.circlePool.release(spark);
        },
      });
    }
  }

  private generateItemTextures(): void {
    generateProceduralItemTextures(this);
  }

  public ensureJuiceTextures(): void {
    ensureProceduralJuiceTextures(this);
  }
}

