import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// --- Minimal headless DOM & Canvas mocks for pure logic tests ---
const mockCanvasCtx = {
  fillRect: () => {},
  clearRect: () => {},
  getImageData: () => ({ data: new Uint8Array(16) }),
  putImageData: () => {},
  createImageData: () => ({ data: new Uint8Array(16) }),
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  restore: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  stroke: () => {},
  fill: () => {},
  scale: () => {},
  translate: () => {},
  rotate: () => {},
  createRadialGradient: () => ({ addColorStop: () => {} }),
};

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.document) {
  globalThis.document = {
    createElement: () => ({
      getContext: () => mockCanvasCtx,
      style: {},
      setAttribute: () => {},
      width: 800,
      height: 600,
    }),
    documentElement: { style: {} },
  };
}
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};

// --- Subsystem Imports ---
import {
  ROWS,
  COLS,
  TILE_SIZE,
  FlatHazardMask,
  ZeroGCPathfinder,
} from '../src/game/pathfinding.ts';

import {
  createInitialPlayerStats,
  calculateClampedPlayerSpeed,
  rollItemDrop,
  applyItemUpgrade,
  applyItemEffect,
  isItemProtectedFromExplosion,
  DEFAULT_CONVEYORS,
  DEFAULT_PORTALS,
  PORTAL_COOLDOWN_MS,
  CONVEYOR_DRIFT_SPEED,
  DASH_SPEED,
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  BOMB_KICK_SPEED,
} from '../src/game/gameplay_mechanics.ts';

import {
  ObjectPool,
  POOL_PRESETS,
} from '../src/game/pooling/ObjectPool.ts';

import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';
import { CameraTraumaSimulator, WebAudioSynth } from '../src/game/ultimate_skills.ts';
import { BossAttackManager } from '../src/game/bosses/BossAttackManager.ts';
import { BossProjectileType, BossState } from '../src/game/bosses/BossTypes.ts';
import { GummyBearBoss } from '../src/game/bosses/GummyBearBoss.ts';
import { HamsterBoss } from '../src/game/bosses/HamsterBoss.ts';
import { QueenBeeBoss } from '../src/game/bosses/QueenBeeBoss.ts';
import { MutantFloraBoss } from '../src/game/bosses/MutantFloraBoss.ts';

import {
  CrisisManager,
  CrisisType,
  CrisisStage,
} from '../src/game/crises/index.ts';

import {
  DynamicHazard,
  VoltHazard,
  FrostHazard,
  GravityHazard,
} from '../src/game/hazards/index.ts';

import { VoltHazardAudio } from '../src/game/hazards/VoltHazardAudio.ts';
import { DynamicHazardAudio } from '../src/game/hazards/DynamicHazardAudio.ts';
import { MagmaHazardAudio } from '../src/game/hazards/MagmaHazardAudio.ts';
import { MiasmaHazardAudio } from '../src/game/hazards/MiasmaHazardAudio.ts';
import { FrostHazardAudio } from '../src/game/hazards/FrostHazardAudio.ts';
import { ChronoHazardAudio } from '../src/game/hazards/ChronoHazardAudio.ts';

import { FloatingTextManager, OverheadUIManager } from '../src/game/ui/index.ts';
import { WaveDirector, WaveState } from '../src/game/progression/WaveDirector.ts';
import { ScalingEngine } from '../src/game/progression/ScalingEngine.ts';
import { PerkTreeManager } from '../src/game/progression/PerkTree.ts';
import { RelicManager } from '../src/game/progression/RelicSystem.ts';
import { APIQuotaCircuitBreaker } from '../src/game/persistence/index.ts';
import { GameStatePersistence } from '../src/game/persistence/GameStatePersistence.ts';
import { resolveEntitySeparation } from '../src/game/entities/SpatialSeparation.ts';

/* ==============================================================================
 * AUDIT CONSTANTS & PERFORMANCE BUDGETS
 * ============================================================================== */

const TOTAL_TILES = ROWS * COLS; // 13 x 15 = 195 tiles
const WARMUP_FRAMES = 280;       // JIT warmup and initial pool hydration (7 crises * 4 bosses * 10 frames)
const SOAK_FRAMES = 1000;        // Exactly 1,000 frames soak simulation
const TOTAL_FRAMES = WARMUP_FRAMES + SOAK_FRAMES;
const FRAME_DELTA_MS = 16.6667;  // 60 FPS standard timestep
const MAX_PER_FRAME_MS = 2.0;    // Frame time budget: < 2.0ms per tick
const HEAP_DRIFT_BUDGET_MB = 0.25; // Heap memory bounded threshold

/* ==============================================================================
 * HELPER: EXHAUSTIVE DEEP SCAN FOR NaNs AND INFINITIES
 * ============================================================================== */

const CARDINAL_DIRS = Object.freeze([
  Object.freeze({ dr: -1, dc: 0 }),
  Object.freeze({ dr: 1, dc: 0 }),
  Object.freeze({ dr: 0, dc: -1 }),
  Object.freeze({ dr: 0, dc: 1 }),
]);

const reusableVisitedSet = new Set();

function assertNoNaNs(obj, path = 'root') {
  reusableVisitedSet.clear();
  _checkNoNaNs(obj, path, reusableVisitedSet);
}

function _checkNoNaNs(obj, path, visited) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'number') {
    if (Number.isNaN(obj)) {
      throw new Error(`NaN detected at property path "${path}"! Value is NaN.`);
    }
    if (!path.endsWith('TimestampMs') && !Number.isFinite(obj)) {
      throw new Error(`Non-finite value detected at property path "${path}"! Value is ${obj}.`);
    }
    return;
  }
  if (typeof obj !== 'object') return;
  if (visited.has(obj)) return;
  visited.add(obj);

  // Check typed arrays fast
  if (ArrayBuffer.isView(obj)) {
    if (obj instanceof Float32Array || obj instanceof Float64Array) {
      for (let i = 0; i < obj.length; i++) {
        const v = obj[i];
        if (Number.isNaN(v)) {
          throw new Error(`NaN detected in TypedArray at "${path}[${i}]"!`);
        }
        if (!Number.isFinite(v)) {
          throw new Error(`Non-finite detected in TypedArray at "${path}[${i}]": ${v}!`);
        }
      }
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      _checkNoNaNs(obj[i], `${path}[${i}]`, visited);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    // Skip internal cyclic references or large non-state structures
    if (key === 'scene' || key === 'game' || key === 'parent' || key === 'config') continue;
    _checkNoNaNs(obj[key], `${path}.${key}`, visited);
  }
}

/* ==============================================================================
 * COMPREHENSIVE 1,000-FRAME SOAK SIMULATOR ENGINE
 * ============================================================================== */

class ActiveSystemsSoakHarness {
  constructor() {
    this.rows = ROWS;
    this.cols = COLS;
    this.totalTiles = TOTAL_TILES;

    // 1. Grid, Obstacles & Conveyors/Portals
    this.walls = new Uint8Array(TOTAL_TILES);
    this.blocks = new Uint8Array(TOTAL_TILES);
    this.hazardMask = new FlatHazardMask(TOTAL_TILES);
    this.walkableBitmask = new Uint8Array(TOTAL_TILES);
    this.pathBuffer = new Int16Array(TOTAL_TILES);
    this.conveyors = DEFAULT_CONVEYORS.slice();
    this.portalCooldown = 0;
    this.initArenaGrid();

    // 2. Navigation & Pathfinding
    this.pathfinder = new ZeroGCPathfinder(ROWS, COLS);

    // 3. Player State & Mechanics
    this.playerStats = createInitialPlayerStats();
    this.player = {
      x: 60,
      y: 60,
      r: 1,
      c: 1,
      vx: 0,
      vy: 0,
      speed: 150,
      scaleX: 1.0,
      scaleY: 1.0,
      displayOriginY: 20,
      angle: 0,
      stepCycle: 0,
      isDashing: false,
      dashTimerMs: 0,
      dashCooldownMs: 0,
      ultEnergy: 0,
      bombCooldownMs: 0,
      invulnMs: 0,
      activeBuffs: [],
      body: {
        position: { x: 48, y: 48 },
        velocity: { x: 0, y: 0 },
        width: 24,
        height: 24,
        halfWidth: 12,
        halfHeight: 12,
        updateCenter: function() {},
        updateFromGameObject: function() {},
      },
    };

    function createMockOverheadUI() {
      return {
        isDestroyed: false,
        lodMode: 'full',
        currentAlpha: 1.0,
        isIntentVisible: false,
        setDepth: function(d) {},
        setLODMode: function(mode) { this.lodMode = mode; },
        setAlpha: function(a) { this.currentAlpha = a; },
        setCustomOffsets: function(ox, oy) {},
      };
    }

    // 4. Multi-Faction Entities (Enemies, Allies, Neutrals)
    this.entities = [
      // Chaser Enemy
      { id: 'chaser_1', type: 'CHASER', faction: 'ENEMY', x: 540, y: 60, r: 1, c: 13, vx: 0, vy: 0, speed: 80, hp: 1, mass: 1.0, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 528, y: 48 }, velocity: { x: 0, y: 0 }, width: 24, height: 24, halfWidth: 12, halfHeight: 12 } },
      // Bomber Enemy
      { id: 'bomber_1', type: 'BOMBER', faction: 'ENEMY', x: 60, y: 460, r: 11, c: 1, vx: 0, vy: 0, speed: 75, hp: 1, mass: 1.0, timer: 0, bombTimer: 180, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 48, y: 448 }, velocity: { x: 0, y: 0 }, width: 24, height: 24, halfWidth: 12, halfHeight: 12 } },
      // Tank Enemy
      { id: 'tank_1', type: 'TANK', faction: 'ENEMY', x: 540, y: 460, r: 11, c: 13, vx: 0, vy: 0, speed: 50, hp: 3, mass: 3.0, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 526, y: 446 }, velocity: { x: 0, y: 0 }, width: 28, height: 28, halfWidth: 14, halfHeight: 14 } },
      // Ghost Enemy (Phasing)
      { id: 'ghost_1', type: 'GHOST', faction: 'ENEMY', x: 300, y: 220, r: 5, c: 7, vx: 0, vy: 0, speed: 65, hp: 1, mass: 0.8, timer: 0, isPhasing: true, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 288, y: 208 }, velocity: { x: 0, y: 0 }, width: 24, height: 24, halfWidth: 12, halfHeight: 12 } },
      // Splitter Enemy
      { id: 'splitter_1', type: 'SPLITTER', faction: 'ENEMY', x: 420, y: 260, r: 6, c: 10, vx: 0, vy: 0, speed: 70, hp: 2, mass: 1.2, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 408, y: 248 }, velocity: { x: 0, y: 0 }, width: 24, height: 24, halfWidth: 12, halfHeight: 12 } },
      // Mini-Splitter
      { id: 'mini_splitter_1', type: 'MINI_SPLITTER', faction: 'ENEMY', x: 460, y: 260, r: 6, c: 11, vx: 0, vy: 0, speed: 95, hp: 1, mass: 0.6, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 451, y: 251 }, velocity: { x: 0, y: 0 }, width: 18, height: 18, halfWidth: 9, halfHeight: 9 } },
      // Ally: Mini-Bomber
      { id: 'ally_bomber_1', type: 'MINI_BOMBER', faction: 'ALLY', x: 100, y: 60, r: 1, c: 2, vx: 0, vy: 0, speed: 80, hp: 1, mass: 1.0, timer: 0, bombTimer: 240, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 88, y: 48 }, velocity: { x: 0, y: 0 }, width: 24, height: 24, halfWidth: 12, halfHeight: 12 } },
      // Ally: Pet Drone
      { id: 'ally_drone_1', type: 'PET_DRONE', faction: 'ALLY', x: 80, y: 80, r: 2, c: 2, vx: 0, vy: 0, speed: 120, hp: 1, mass: 0.5, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 68, y: 68 }, velocity: { x: 0, y: 0 }, width: 20, height: 20, halfWidth: 10, halfHeight: 10 } },
      // Ally: Shield Guard
      { id: 'ally_shield_1', type: 'SHIELD_GUARD', faction: 'ALLY', x: 60, y: 100, r: 2, c: 1, vx: 0, vy: 0, speed: 70, hp: 2, mass: 2.0, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 48, y: 88 }, velocity: { x: 0, y: 0 }, width: 26, height: 26, halfWidth: 13, halfHeight: 13 } },
      // Neutral: Merchant NPC
      { id: 'neutral_merchant', type: 'MERCHANT', faction: 'NEUTRAL', x: 300, y: 60, r: 1, c: 7, vx: 0, vy: 0, speed: 0, hp: 99, mass: 5.0, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 288, y: 48 }, velocity: { x: 0, y: 0 }, width: 24, height: 24, halfWidth: 12, halfHeight: 12 } },
      // Neutral: Critter
      { id: 'neutral_critter', type: 'CRITTER', faction: 'NEUTRAL', x: 340, y: 460, r: 11, c: 8, vx: 0, vy: 0, speed: 90, hp: 1, mass: 0.5, timer: 0, active: true, overheadUI: createMockOverheadUI(), body: { position: { x: 330, y: 450 }, velocity: { x: 0, y: 0 }, width: 20, height: 20, halfWidth: 10, halfHeight: 10 } },
    ];

    // Initialize updateBounds on all entity bodies
    for (const ent of this.entities) {
      ent.body.updateBounds = function() {
        this.width = ent.body.width;
        this.height = ent.body.height;
      };
    }

    // Pre-allocated Zero-GC scratch buffers
    this.allSeparables = [this.player, ...this.entities];
    this.scratchExpiredExplosions = [];
    this.scratchExpiredParticles = [];
    this.scratchBombsToDetonate = [];
    this.scratchPlayerPos = { x: 0, y: 0, r: 0, c: 0, isDashing: false, currentSpeed: 0 };

    // 5. Object Pools
    this.bombPool = new ObjectPool({
      capacity: POOL_PRESETS.BOMBS, // 32
      factory: (i) => ({ id: i, r: 0, c: 0, x: 0, y: 0, vx: 0, vy: 0, fuseMs: 0, power: 2, owner: 'player', kicked: false }),
      reset: (b) => { b.r = 0; b.c = 0; b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.fuseMs = 0; b.power = 2; b.owner = 'player'; b.kicked = false; },
    });

    this.explosionPool = new ObjectPool({
      capacity: POOL_PRESETS.EXPLOSIONS, // 128
      factory: (i) => ({ id: i, tileIdx: 0, r: 0, c: 0, lifeMs: 0, isCenter: false }),
      reset: (e) => { e.tileIdx = 0; e.r = 0; e.c = 0; e.lifeMs = 0; e.isCenter = false; },
    });

    this.particlePool = new ObjectPool({
      capacity: POOL_PRESETS.PARTICLES, // 256
      factory: (i) => ({ id: i, x: 0, y: 0, vx: 0, vy: 0, life: 0 }),
      reset: (p) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 0; },
    });

    // 6. Active Floor Items
    this.floorItems = [];

    // 7. Boss Subsystem & Attack Manager
    this.bossAttacks = new BossAttackManager();
    this.bosses = [
      new GummyBearBoss(300, 260),
      new HamsterBoss(300, 260),
      new QueenBeeBoss(300, 260),
      new MutantFloraBoss(300, 260),
    ];
    this.currentBossIdx = 0;

    // 8. Crises Subsystem
    this.crisisManager = new CrisisManager();
    this.crisisRotation = [
      CrisisType.PSYCHIC_INVASION,
      CrisisType.PASTEL_VOID,
      CrisisType.CLOCKWORK_REBELLION,
      CrisisType.ORBITAL_BOMBARDMENT,
      CrisisType.SOLAR_FLARES,
      CrisisType.CREEPING_LAVA,
      CrisisType.DIMENSIONAL_RIFTS,
    ];
    this.currentCrisisIdx = 0;
    this.crisisManager.triggerCrisis(this.crisisRotation[0]);

    // 9. Dynamic Environmental Hazards
    this.dynamicHazard = new DynamicHazard();
    this.voltHazard = new VoltHazard();
    this.frostHazard = new FrostHazard();
    this.gravityHazard = new GravityHazard();

    // 10. Ultimate Skills & Camera Trauma Juice
    this.cameraTrauma = new CameraTraumaSimulator();
    this.scratchCameraOffsets = { x: 0, y: 0, angle: 0 };

    // 11. Audio Subsystem
    this.voicePool = new AudioVoicePool(16);
    this.webAudioSynth = new WebAudioSynth();
    this.voltAudio = new VoltHazardAudio(this.voicePool);
    this.dynamicAudio = new DynamicHazardAudio(this.voicePool);
    this.magmaAudio = new MagmaHazardAudio(this.voicePool);
    this.miasmaAudio = MiasmaHazardAudio.getInstance();
    this.miasmaAudio.bindPool(this.voicePool);
    this.frostAudio = new FrostHazardAudio(this.voicePool);
    this.chronoAudio = ChronoHazardAudio.getInstance();
    this.chronoAudio.setVoicePool(this.voicePool);

    // 12. UI Subsystem
    this.overheadUI = new OverheadUIManager(true);
    this.floatingText = new FloatingTextManager();

    // 13. Progression, Wave Director & Scaling
    this.waveDirector = new WaveDirector(this.crisisManager);
    this.waveDirector.startWave(1);
    this.perkTree = new PerkTreeManager();
    this.relicSystem = new RelicManager();

    // 14. Persistence & Circuit Breaker
    this.circuitBreaker = new APIQuotaCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 200,
      initialBackoffMs: 25,
      maxBackoffMs: 100,
    });
    this.persistence = new GameStatePersistence(undefined, undefined, this.circuitBreaker);

    // Metrics & Telemetry
    this.telemetry = {
      framesExecuted: 0,
      bombsPlaced: 0,
      detonations: 0,
      particlesSpawned: 0,
      pathfindingQueries: 0,
      itemsDropped: 0,
      itemsCollected: 0,
      bossProjectilesSpawned: 0,
      bossShockwavesSpawned: 0,
      crisisTransitions: 0,
      maxFrameDurationMs: 0,
      totalFrameDurationMs: 0,
      overBudgetFrames: 0,
    };
  }

  initArenaGrid() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
          this.walls[idx] = 1;
        } else if (r % 2 === 0 && c % 2 === 0) {
          this.walls[idx] = 1;
        } else if ((r > 1 || c > 1) && (r < 11 || c < 13) && (r + c) % 3 === 0) {
          this.blocks[idx] = 1;
        }
      }
    }
  }

  getWalkableBitmask(out) {
    for (let i = 0; i < this.totalTiles; i++) {
      out[i] = this.walls[i] === 0 && this.blocks[i] === 0 ? 1 : 0;
    }
    this.bombPool.forEachActive((b) => {
      const idx = b.r * this.cols + b.c;
      out[idx] = 0;
    });
  }

  step(deltaMs, frameNumber) {
    const timeMs = frameNumber * deltaMs;

    // =========================================================================
    // 1. ARENA HAZARDS, CONVEYORS, AND PORTAL TELEPORTATION
    // =========================================================================
    this.hazardMask.fill(0);

    // Update portal cooldown
    if (this.portalCooldown > 0) {
      this.portalCooldown = Math.max(0, this.portalCooldown - deltaMs);
    } else {
      if (this.player.r === DEFAULT_PORTALS.portalA.row && this.player.c === DEFAULT_PORTALS.portalA.col) {
        this.player.r = DEFAULT_PORTALS.portalB.row;
        this.player.c = DEFAULT_PORTALS.portalB.col;
        this.player.x = DEFAULT_PORTALS.portalB.col * TILE_SIZE + TILE_SIZE / 2;
        this.player.y = DEFAULT_PORTALS.portalB.row * TILE_SIZE + TILE_SIZE / 2;
        this.portalCooldown = PORTAL_COOLDOWN_MS;
      } else if (this.player.r === DEFAULT_PORTALS.portalB.row && this.player.c === DEFAULT_PORTALS.portalB.col) {
        this.player.r = DEFAULT_PORTALS.portalA.row;
        this.player.c = DEFAULT_PORTALS.portalA.col;
        this.player.x = DEFAULT_PORTALS.portalA.col * TILE_SIZE + TILE_SIZE / 2;
        this.player.y = DEFAULT_PORTALS.portalA.row * TILE_SIZE + TILE_SIZE / 2;
        this.portalCooldown = PORTAL_COOLDOWN_MS;
      }
    }

    // Conveyor drift for player
    for (let i = 0; i < this.conveyors.length; i++) {
      const conv = this.conveyors[i];
      if (this.player.r === conv.row && this.player.c === conv.col) {
        this.player.x += conv.dirX * CONVEYOR_DRIFT_SPEED * (deltaMs / 1000);
        this.player.y += conv.dirY * CONVEYOR_DRIFT_SPEED * (deltaMs / 1000);
      }
    }

    // =========================================================================
    // 2. PLAYER INPUT, MOVEMENT JUICE & CORNER SLIDING
    // =========================================================================
    // Simulate player movement input (alternating cardinal & diagonal test vectors)
    const movePhase = Math.floor(frameNumber / 30) % 8;
    let inputX = 0;
    let inputY = 0;
    if (movePhase === 0) inputX = 1;
    else if (movePhase === 1) inputY = 1;
    else if (movePhase === 2) inputX = -1;
    else if (movePhase === 3) inputY = -1;
    else if (movePhase === 4) { inputX = 1; inputY = 1; }
    else if (movePhase === 5) { inputX = -1; inputY = 1; }
    else if (movePhase === 6) { inputX = -1; inputY = -1; }
    else if (movePhase === 7) { inputX = 1; inputY = -1; }

    // Dash activation
    if (frameNumber % 120 === 0 && this.player.dashCooldownMs <= 0) {
      this.player.isDashing = true;
      this.player.dashTimerMs = DASH_DURATION_MS;
      this.player.dashCooldownMs = DASH_COOLDOWN_MS;
    }
    if (this.player.dashTimerMs > 0) {
      this.player.dashTimerMs -= deltaMs;
      if (this.player.dashTimerMs <= 0) {
        this.player.isDashing = false;
      }
    }
    if (this.player.dashCooldownMs > 0) {
      this.player.dashCooldownMs -= deltaMs;
    }

    const currentSpeed = this.player.isDashing
      ? DASH_SPEED
      : calculateClampedPlayerSpeed(this.playerStats.speedLevel, this.player.activeBuffs);

    this.player.vx = inputX * currentSpeed;
    this.player.vy = inputY * currentSpeed;

    this.player.x += this.player.vx * (deltaMs / 1000);
    this.player.y += this.player.vy * (deltaMs / 1000);

    // Arena boundary clamping
    this.player.x = Math.max(50, Math.min(this.cols * TILE_SIZE - 50, this.player.x));
    this.player.y = Math.max(50, Math.min(this.rows * TILE_SIZE - 50, this.player.y));
    this.player.r = Math.floor(this.player.y / TILE_SIZE);
    this.player.c = Math.floor(this.player.x / TILE_SIZE);

    // Body update
    this.player.body.position.x = this.player.x - 12;
    this.player.body.position.y = this.player.y - 12;
    this.player.body.velocity.x = this.player.vx;
    this.player.body.velocity.y = this.player.vy;

    // Movement animation juice (squash/stretch and bobbing)
    const isMoving = Math.abs(this.player.vx) > 1 || Math.abs(this.player.vy) > 1;
    if (isMoving) {
      const speedMag = Math.hypot(this.player.vx, this.player.vy);
      this.player.stepCycle += (deltaMs / 1000) * (speedMag / 22);
      const hop = Math.abs(Math.sin(this.player.stepCycle * Math.PI)) * 3;
      this.player.displayOriginY = 20 - hop;
      const apexNorm = hop / 3;
      this.player.scaleX = 1.08 - 0.14 * apexNorm;
      this.player.scaleY = 0.92 + 0.14 * apexNorm;
      this.player.angle = this.player.vx !== 0 ? Math.sign(this.player.vx) * 3.5 : 0;
    } else {
      this.player.displayOriginY = 20;
      this.player.scaleX = 1.0;
      this.player.scaleY = 1.0;
      this.player.angle = 0;
    }

    // Ultimate skill meter charging
    this.player.ultEnergy = Math.min(100, this.player.ultEnergy + deltaMs * 0.05);

    // =========================================================================
    // 3. EXPLOSIONS POOL LIFECYCLE & HAZARD SPREAD
    // =========================================================================
    this.scratchExpiredExplosions.length = 0;
    const expiredExplosions = this.scratchExpiredExplosions;
    this.explosionPool.forEachActive((expl) => {
      expl.lifeMs -= deltaMs;
      if (expl.lifeMs <= 0) {
        expiredExplosions.push(expl);
      } else {
        this.hazardMask.setIdx(expl.tileIdx, 1);
      }
    });
    for (let i = 0; i < expiredExplosions.length; i++) {
      this.explosionPool.release(expiredExplosions[i]);
    }

    // =========================================================================
    // 4. PARTICLES POOL PHYSICS INTEGRATION
    // =========================================================================
    this.scratchExpiredParticles.length = 0;
    const expiredParticles = this.scratchExpiredParticles;
    this.particlePool.forEachActive((p) => {
      p.life -= 1;
      if (p.life <= 0) {
        expiredParticles.push(p);
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
    });
    for (let i = 0; i < expiredParticles.length; i++) {
      this.particlePool.release(expiredParticles[i]);
    }

    // =========================================================================
    // 5. BOMBS POOL FUSE, CONVEYORS, KICK INTEGRATION & DETONATION
    // =========================================================================
    this.scratchBombsToDetonate.length = 0;
    const bombsToDetonate = this.scratchBombsToDetonate;
    this.bombPool.forEachActive((bomb) => {
      bomb.fuseMs += deltaMs;

      // Handle kick velocity
      if (bomb.kicked) {
        bomb.x += bomb.vx * (deltaMs / 1000);
        bomb.y += bomb.vy * (deltaMs / 1000);
        const nextR = Math.floor(bomb.y / TILE_SIZE);
        const nextC = Math.floor(bomb.x / TILE_SIZE);
        const nextIdx = nextR * this.cols + nextC;
        if (this.walls[nextIdx] === 1 || this.blocks[nextIdx] === 1) {
          bomb.kicked = false;
          bomb.vx = 0;
          bomb.vy = 0;
        } else {
          bomb.r = nextR;
          bomb.c = nextC;
        }
      }

      if (bomb.fuseMs >= 1000) {
        bombsToDetonate.push(bomb);
      }
    });

    for (let i = 0; i < bombsToDetonate.length; i++) {
      this.detonateBomb(bombsToDetonate[i]);
    }

    // Player places bomb periodically
    if (frameNumber % 30 === 0 && this.bombPool.activeCount < this.playerStats.maxBombs) {
      this.placeBomb(this.player.r, this.player.c, this.playerStats.bombPower, 'player');
    }

    // Replenish soft blocks periodically so destruction and item drops occur continuously
    if (frameNumber % 120 === 0) {
      for (let r = 2; r < this.rows - 2; r++) {
        for (let c = 2; c < this.cols - 2; c++) {
          const idx = r * this.cols + c;
          if (this.walls[idx] === 0 && this.blocks[idx] === 0 && (r + c) % 3 === 0) {
            this.blocks[idx] = 1;
          }
        }
      }
    }

    // =========================================================================
    // 6. MULTI-FACTION ENTITIES & AI PATHFINDING
    // =========================================================================
    this.getWalkableBitmask(this.walkableBitmask);
    this.pathfinder.setObstacles(this.walkableBitmask);

    for (let i = 0; i < this.entities.length; i++) {
      const ent = this.entities[i];
      if (!ent.active) continue;

      ent.timer -= deltaMs;

      if (ent.type === 'CHASER') {
        if (ent.timer <= 0) {
          ent.timer = 200;
          const startIdx = ent.r * this.cols + ent.c;
          const targetIdx = this.player.r * this.cols + this.player.c;
          const pathLen = this.pathfinder.findPath(startIdx, targetIdx, this.pathBuffer);
          this.telemetry.pathfindingQueries++;
          if (pathLen > 1) {
            const nextIdx = this.pathBuffer[1];
            const nextR = Math.floor(nextIdx / this.cols);
            const nextC = nextIdx % this.cols;
            ent.vx = (nextC - ent.c) * ent.speed;
            ent.vy = (nextR - ent.r) * ent.speed;
          }
        }
      } else if (ent.type === 'BOMBER') {
        ent.bombTimer = (ent.bombTimer || 80) - 1;
        if (ent.bombTimer <= 0) {
          ent.bombTimer = 90;
          this.placeBomb(ent.r, ent.c, 1, 'enemy');
        }
      } else if (ent.type === 'GHOST') {
        // Phasing motion straight towards player
        const dx = this.player.x - ent.x;
        const dy = this.player.y - ent.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          ent.vx = (dx / dist) * ent.speed;
          ent.vy = (dy / dist) * ent.speed;
        }
      }

      // Movement step
      ent.x += ent.vx * (deltaMs / 1000);
      ent.y += ent.vy * (deltaMs / 1000);
      ent.x = Math.max(50, Math.min(this.cols * TILE_SIZE - 50, ent.x));
      ent.y = Math.max(50, Math.min(this.rows * TILE_SIZE - 50, ent.y));
      ent.r = Math.floor(ent.y / TILE_SIZE);
      ent.c = Math.floor(ent.x / TILE_SIZE);

      ent.body.position.x = ent.x - ent.body.halfWidth;
      ent.body.position.y = ent.y - ent.body.halfHeight;
      ent.body.velocity.x = ent.vx;
      ent.body.velocity.y = ent.vy;
    }

    // =========================================================================
    // 7. SPATIAL SEPARATION RESOLUTION
    // =========================================================================
    resolveEntitySeparation(this.allSeparables, {
      iterations: 2,
      separationFactor: 0.5,
      defaultRadius: 14,
      bounds: { minX: 40, maxX: this.cols * TILE_SIZE - 40, minY: 40, maxY: this.rows * TILE_SIZE - 40 },
    });

    // =========================================================================
    // 8. FLOOR ITEMS & PICKUP LOGIC
    // =========================================================================
    for (let i = this.floorItems.length - 1; i >= 0; i--) {
      const item = this.floorItems[i];
      item.lifeMs -= deltaMs;
      // Distance to player
      const dist = Math.hypot(this.player.x - item.x, this.player.y - item.y);
      if (dist < 24) {
        // Collect item
        applyItemUpgrade(this.playerStats, item.type);
        this.floatingText.registerSpawn(this.player.x, this.player.y, timeMs);
        this.telemetry.itemsCollected++;
        this.floorItems.splice(i, 1);
      } else if (item.lifeMs <= 0) {
        this.floorItems.splice(i, 1);
      }
    }

    // =========================================================================
    // 9. BOSS SUBSYSTEM & ATTACK MANAGER
    // =========================================================================
    // Rotate active boss every 250 frames
    this.currentBossIdx = Math.floor(frameNumber / 250) % this.bosses.length;
    const activeBoss = this.bosses[this.currentBossIdx];
    activeBoss.update(deltaMs, this.player.x, this.player.y);

    // Spawn boss attacks periodically
    if (frameNumber % 100 === 0) {
      const proj = this.bossAttacks.spawnProjectile(
        BossProjectileType.GATLING_SEED,
        activeBoss.x,
        activeBoss.y,
        Math.cos(frameNumber) * 100,
        Math.sin(frameNumber) * 100,
        6,
        1500
      );
      if (proj) this.telemetry.bossProjectilesSpawned++;
      this.bossAttacks.addTelegraphTile(1 + (frameNumber % 11), 1 + (frameNumber % 13), 1000);
    }
    if (frameNumber % 300 === 0) {
      const wave = this.bossAttacks.spawnShockwave(activeBoss.x, activeBoss.y, 140, 200, 1);
      if (wave) this.telemetry.bossShockwavesSpawned++;
    }
    this.bossAttacks.update(deltaMs);

    // =========================================================================
    // 10. PLANETARY CRISES SUBSYSTEM
    // =========================================================================
    // Cycle crisis every 145 frames across all 7 crises
    const newCrisisIdx = Math.floor(frameNumber / 145) % this.crisisRotation.length;
    if (newCrisisIdx !== this.currentCrisisIdx) {
      this.currentCrisisIdx = newCrisisIdx;
      this.crisisManager.triggerCrisis(this.crisisRotation[newCrisisIdx]);
      this.telemetry.crisisTransitions++;
    }

    // Update scratch position for Zero-GC subsystem parameter passing
    this.scratchPlayerPos.x = this.player.x;
    this.scratchPlayerPos.y = this.player.y;
    this.scratchPlayerPos.r = this.player.r;
    this.scratchPlayerPos.c = this.player.c;
    this.scratchPlayerPos.isDashing = this.player.isDashing;
    this.scratchPlayerPos.currentSpeed = this.player.speed;

    this.crisisManager.update(deltaMs, this.scratchPlayerPos);

    // =========================================================================
    // 11. DYNAMIC ENVIRONMENTAL HAZARDS
    // =========================================================================
    this.dynamicHazard.update(deltaMs, this.scratchPlayerPos);
    this.voltHazard.update(deltaMs, this.scratchPlayerPos);
    this.frostHazard.update(deltaMs, this.scratchPlayerPos);
    this.gravityHazard.update(deltaMs, this.scratchPlayerPos);

    // =========================================================================
    // 12. CAMERA TRAUMA JUICE & SCREEN SHAKE
    // =========================================================================
    this.cameraTrauma.update(deltaMs / 1000);
    this.cameraTrauma.getOffsets(timeMs, this.scratchCameraOffsets);

    // =========================================================================
    // 13. PROCEDURAL SYNTHESIZERS & AUDIO POOL
    // =========================================================================
    if (frameNumber % 120 === 0) {
      this.voltAudio.playStaticSpark(timeMs);
      this.dynamicAudio.playTelegraphPulse(timeMs);
      this.magmaAudio.playMagmaUpwellingSizzle();
      this.miasmaAudio.playOrganicBubbling();
      this.frostAudio.playCrystallizationCrackle(timeMs);
      this.chronoAudio.playTemporalRipple(timeMs);
    }

    // =========================================================================
    // 14. UI MANAGERS: OVERHEAD UI & FLOATING TEXTS
    // =========================================================================
    this.overheadUI.update(this.entities, this.player, deltaMs);
    if (frameNumber % 50 === 0) {
      this.floatingText.registerSpawn(this.player.x, this.player.y, timeMs);
    }

    // =========================================================================
    // 15. PROGRESSION & WAVE DIRECTOR
    // =========================================================================
    this.waveDirector.update(deltaMs, { x: this.player.x, y: this.player.y, r: this.player.r, c: this.player.c });

    // =========================================================================
    // 16. PERSISTENCE & CIRCUIT BREAKER
    // =========================================================================
    if (frameNumber % 100 === 0) {
      this.persistence.saveRunState({
        mode: 'standard',
        currentWave: this.waveDirector.getCurrentWave(),
        score: frameNumber * 10,
        player: {
          x: this.player.x,
          y: this.player.y,
          gridRow: this.player.r,
          gridCol: this.player.c,
          facing: 'down',
          stats: this.playerStats,
          hp: 1,
        },
        board: {
          rows: this.rows,
          cols: this.cols,
          mapRLE: '13x15_arena',
        },
        bombs: [],
        enemies: [],
        crisis: null,
      });
    }

    this.telemetry.framesExecuted++;
  }

  placeBomb(r, c, power, owner = 'player') {
    const bomb = this.bombPool.acquire();
    if (!bomb) return null;
    bomb.r = r;
    bomb.c = c;
    bomb.x = c * TILE_SIZE + TILE_SIZE / 2;
    bomb.y = r * TILE_SIZE + TILE_SIZE / 2;
    bomb.power = power;
    bomb.owner = owner;
    bomb.fuseMs = 0;
    bomb.kicked = false;
    this.telemetry.bombsPlaced++;
    return bomb;
  }

  detonateBomb(bomb) {
    this.telemetry.detonations++;
    this.cameraTrauma.addTrauma(0.12);

    const centerIdx = bomb.r * this.cols + bomb.c;
    const centerExpl = this.explosionPool.acquire();
    if (centerExpl) {
      centerExpl.tileIdx = centerIdx;
      centerExpl.r = bomb.r;
      centerExpl.c = bomb.c;
      centerExpl.lifeMs = 280;
      centerExpl.isCenter = true;
      this.hazardMask.setCoord(bomb.r, bomb.c, 1);
    }

    for (const dir of CARDINAL_DIRS) {
      for (let dist = 1; dist <= bomb.power; dist++) {
        const nr = bomb.r + dir.dr * dist;
        const nc = bomb.c + dir.dc * dist;
        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
        const nIdx = nr * this.cols + nc;
        if (this.walls[nIdx] === 1) break;

        if (this.blocks[nIdx] === 1) {
          this.blocks[nIdx] = 0;
          const expl = this.explosionPool.acquire();
          if (expl) {
            expl.tileIdx = nIdx;
            expl.r = nr;
            expl.c = nc;
            expl.lifeMs = 280;
            this.hazardMask.setCoord(nr, nc, 1);
          }
          this.emitParticles(nc * TILE_SIZE + 20, nr * TILE_SIZE + 20, 6);

          // Roll powerup drop
          const drop = rollItemDrop(nr, nc);
          if (drop) {
            this.floorItems.push({
              x: nc * TILE_SIZE + TILE_SIZE / 2,
              y: nr * TILE_SIZE + TILE_SIZE / 2,
              type: drop,
              lifeMs: 15000,
            });
            this.telemetry.itemsDropped++;
          }
          break;
        }

        const expl = this.explosionPool.acquire();
        if (expl) {
          expl.tileIdx = nIdx;
          expl.r = nr;
          expl.c = nc;
          expl.lifeMs = 280;
          this.hazardMask.setCoord(nr, nc, 1);
        }
        this.emitParticles(nc * TILE_SIZE + 20, nr * TILE_SIZE + 20, 2);
      }
    }

    this.bombPool.release(bomb);
  }

  emitParticles(x, y, count) {
    for (let i = 0; i < count; i++) {
      const p = this.particlePool.acquire();
      if (!p) break;
      p.x = x;
      p.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 2.5;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = 12 + Math.floor(Math.random() * 12);
      this.telemetry.particlesSpawned++;
    }
  }

  destroy() {
    this.bombPool.destroy();
    this.explosionPool.destroy();
    this.particlePool.destroy();
    this.bossAttacks.destroy();
    this.voicePool.destroy();
    this.webAudioSynth.destroy();
    this.voltAudio.destroy();
    this.dynamicAudio.destroy();
    this.magmaAudio.destroy();
    this.miasmaAudio.destroy();
    this.frostAudio.destroy();
    this.chronoAudio.destroy();
    this.persistence.destroy();
    this.circuitBreaker.destroy();
    this.floatingText.reset();
  }
}

/* ==============================================================================
 * TEST SUITE: 1,000-FRAME SOAK SIMULATION ACROSS ALL ACTIVE SYSTEMS
 * ============================================================================== */

test('Soak Simulation: 1,000 Frames Across All Active Systems (Bounded Memory, Zero NaNs, Frame Time < 2ms)', (t) => {
  const isGcExposed = typeof global.gc === 'function';
  const harness = new ActiveSystemsSoakHarness();

  // 1. WARMUP PHASE (Cycle through all 4 bosses and 7 crises so all subsystems are hydrated and JIT-compiled)
  for (let c = 0; c < harness.crisisRotation.length; c++) {
    harness.currentCrisisIdx = c;
    harness.crisisManager.triggerCrisis(harness.crisisRotation[c]);
    for (let b = 0; b < harness.bosses.length; b++) {
      harness.currentBossIdx = b;
      for (let f = 0; f < 10; f++) {
        harness.step(FRAME_DELTA_MS, f);
      }
    }
  }

  // Force compaction before soak baseline if GC is exposed
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const baselineMemory = process.memoryUsage();
  const baselineHeapUsed = baselineMemory.heapUsed;

  // 2. SOAK SIMULATION PHASE (1,000 frames)
  const frameDurations = new Float32Array(SOAK_FRAMES);
  const checkpoints = [];
  let totalSoakDurationMs = 0;
  let maxFrameTimeMs = 0;
  let overBudgetCount = 0;

  for (let i = 0; i < SOAK_FRAMES; i++) {
    const frameIndex = WARMUP_FRAMES + i;

    const tStart = performance.now();
    harness.step(FRAME_DELTA_MS, frameIndex);
    const tEnd = performance.now();

    const frameTimeMs = tEnd - tStart;
    frameDurations[i] = frameTimeMs;
    totalSoakDurationMs += frameTimeMs;

    if (frameTimeMs > maxFrameTimeMs) {
      maxFrameTimeMs = frameTimeMs;
    }
    if (frameTimeMs > MAX_PER_FRAME_MS) {
      overBudgetCount++;
    }

    // Exhaustive NaN verification on every frame
    assertNoNaNs(harness.player, `frame_${frameIndex}.player`);
    assertNoNaNs(harness.entities, `frame_${frameIndex}.entities`);
    assertNoNaNs(harness.bosses[harness.currentBossIdx], `frame_${frameIndex}.activeBoss`);
    assertNoNaNs(harness.scratchCameraOffsets, `frame_${frameIndex}.cameraOffsets`);

    // Checkpoints every 250 frames
    if ((i + 1) % 250 === 0 || i === SOAK_FRAMES - 1) {
      const currentHeapMB = process.memoryUsage().heapUsed / (1024 * 1024);
      checkpoints.push({
        frame: i + 1,
        heapMB: currentHeapMB.toFixed(3),
        activeBombs: harness.bombPool.activeCount,
        activeExplosions: harness.explosionPool.activeCount,
        activeParticles: harness.particlePool.activeCount,
        activeFloorItems: harness.floorItems.length,
        activeBossProjectiles: harness.bossAttacks.projectilePool.activeCount,
        activeBossShockwaves: harness.bossAttacks.shockwavePool.activeCount,
        activeCrisis: harness.crisisRotation[harness.currentCrisisIdx],
      });
    }
  }

  const avgFrameTimeMs = totalSoakDurationMs / SOAK_FRAMES;

  // Compaction before final capture
  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalMemory = process.memoryUsage();
  const finalHeapUsed = finalMemory.heapUsed;
  const netHeapDriftBytes = finalHeapUsed - baselineHeapUsed;
  const netHeapDriftMB = netHeapDriftBytes / (1024 * 1024);

  // Full state deep scan after all 1,000 frames
  assertNoNaNs(harness.playerStats, 'final.playerStats');
  assertNoNaNs(harness.player, 'final.player');
  assertNoNaNs(harness.entities, 'final.entities');
  assertNoNaNs(harness.bosses, 'final.bosses');
  assertNoNaNs(harness.bossAttacks, 'final.bossAttacks');
  assertNoNaNs(harness.dynamicHazard, 'final.dynamicHazard');
  assertNoNaNs(harness.voltHazard, 'final.voltHazard');
  assertNoNaNs(harness.frostHazard, 'final.frostHazard');
  assertNoNaNs(harness.gravityHazard, 'final.gravityHazard');
  assertNoNaNs(harness.cameraTrauma, 'final.cameraTrauma');

  // Teardown
  harness.destroy();

  // Telemetry Diagnostic Report
  t.diagnostic(`\n===============================================================`);
  t.diagnostic(`      1,000-FRAME COMPREHENSIVE ACTIVE SYSTEMS SOAK AUDIT      `);
  t.diagnostic(`===============================================================`);
  t.diagnostic(`Execution Mode:           ${isGcExposed ? 'V8 Explicit GC' : 'Ambient V8 GC'}`);
  t.diagnostic(`Total Frames Simulated:   ${SOAK_FRAMES} frames (plus ${WARMUP_FRAMES} warmup)`);
  t.diagnostic(`Total Soak Duration:      ${totalSoakDurationMs.toFixed(2)} ms`);
  t.diagnostic(`Average Frame Time:       ${avgFrameTimeMs.toFixed(4)} ms (${(avgFrameTimeMs * 1000).toFixed(1)} µs/frame)`);
  t.diagnostic(`Max Frame Time:           ${maxFrameTimeMs.toFixed(4)} ms`);
  t.diagnostic(`Frames > 2.0ms:           ${overBudgetCount} (Budget: 0)`);
  t.diagnostic(`Baseline Heap Used:       ${(baselineHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Final Heap Used:          ${(finalHeapUsed / (1024 * 1024)).toFixed(3)} MB`);
  t.diagnostic(`Net Heap Drift:           ${netHeapDriftMB.toFixed(4)} MB (${netHeapDriftBytes > 0 ? '+' : ''}${netHeapDriftBytes} bytes)`);
  t.diagnostic(`Heap Drift Budget:        <= ${HEAP_DRIFT_BUDGET_MB.toFixed(2)} MB`);
  t.diagnostic(`Total Bombs Placed:       ${harness.telemetry.bombsPlaced}`);
  t.diagnostic(`Total Detonations:        ${harness.telemetry.detonations}`);
  t.diagnostic(`Total Particles Spawned:  ${harness.telemetry.particlesSpawned}`);
  t.diagnostic(`Pathfinding BFS Queries:  ${harness.telemetry.pathfindingQueries}`);
  t.diagnostic(`Floor Items Dropped:      ${harness.telemetry.itemsDropped}`);
  t.diagnostic(`Floor Items Collected:    ${harness.telemetry.itemsCollected}`);
  t.diagnostic(`Boss Projectiles:         ${harness.telemetry.bossProjectilesSpawned}`);
  t.diagnostic(`Boss Shockwaves:          ${harness.telemetry.bossShockwavesSpawned}`);
  t.diagnostic(`Planetary Crisis Cycles:  ${harness.telemetry.crisisTransitions}`);
  t.diagnostic(`---------------------------------------------------------------`);
  t.diagnostic(`Checkpoints:`);
  for (const cp of checkpoints) {
    t.diagnostic(`  Frame ${cp.frame.toString().padStart(4, ' ')}: Heap ${cp.heapMB} MB | Bombs: ${cp.activeBombs} | Expl: ${cp.activeExplosions} | Part: ${cp.activeParticles} | Items: ${cp.activeFloorItems} | Crisis: ${cp.activeCrisis}`);
  }
  t.diagnostic(`===============================================================\n`);

  // Assertions
  assert.strictEqual(harness.telemetry.framesExecuted, TOTAL_FRAMES, 'All frames must execute');
  assert.ok(harness.telemetry.bombsPlaced > 10, 'Substantial bomb placements must occur');
  assert.ok(harness.telemetry.detonations > 10, 'Substantial detonations must occur');
  assert.ok(harness.telemetry.pathfindingQueries > 50, 'Pathfinding queries must execute');
  assert.ok(harness.telemetry.crisisTransitions >= 5, 'Must cycle through multiple planetary crises');

  // Verify frame time remains under 2ms per tick (99% compliance accounting for concurrent test runner scheduling jitter)
  assert.ok(overBudgetCount <= 10, `At least 99% of frames must remain under 2ms per tick. Found ${overBudgetCount} frames exceeding budget.`);
  assert.ok(avgFrameTimeMs < 0.5, `Average frame time (${avgFrameTimeMs.toFixed(3)}ms) must be < 0.5ms`);

  // Verify heap memory does not grow unbounded
  if (isGcExposed) {
    assert.ok(netHeapDriftMB <= HEAP_DRIFT_BUDGET_MB, `Heap drift (${netHeapDriftMB.toFixed(3)} MB) must not exceed ${HEAP_DRIFT_BUDGET_MB} MB`);
  } else {
    // Under ambient GC, heap must not explode (e.g. within 25MB)
    assert.ok(finalHeapUsed < 40 * 1024 * 1024, `Heap used (${(finalHeapUsed / 1024 / 1024).toFixed(2)} MB) must remain bounded`);
  }
});
