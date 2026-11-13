/**
 * tests/daily_zerogc_pooling_resilience.test.mjs
 *
 * Permanent Defensive Regression Suite for Daily Zero-GC & Object-Pooling Resilience:
 * 1. Bounded Bomb Pool recycling (>32 sequential bombs) & `ignoringColliders` Set reuse
 * 2. Ghost Bomb (`isGhostBomb`) & `RICOCHET_BOMB` (`reboundsLeft`) state isolation across recycled bombs
 * 3. Enemy/Ally bomb entity reference release on `explodeBomb` & graceful saturation at 32 active bombs
 * 4. Bounded Explosion Pool recycling (>128 sequential explosions) & boss hit preservation under saturation
 * 5. Bounded Item Pool recycling (>48 sequential items), prior shadow release, & single `DESTROY` hook registration
 * 6. Particle emitter bounded configuration (`maxAliveParticles: 256`, `reserve: 256`) on all 3 scene emitters
 * 7. `BaseEntity.die()` death spark `circlePool` acquire/release lifecycle (0 leaked arcs)
 * 8. In-place `activeBuffs` compaction, 60Hz debuff timer/HUD deduplication, & non-compounding mastery speed bursts
 * 9. Zero-GC `pathfinding.ts` (`FlatHazardMask.copyFrom`, `findSafeEscapeAfterBomb`, `canSafelyPlaceBomb`) parity & malformed key defense
 * 10. `PsychicCrisis` manifestation pool identity & all 7 `*CrisisAudio.destroy()` static noise buffer teardown
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

EventEmitter.defaultMaxListeners = 500;

const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      for (const ext of ['.ts', '.js', '/index.ts', '/index.js']) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {}
      }
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'));

// Headless DOM & Canvas Context Mocks for Phaser Environment
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
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};
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
    body: {},
  };
}

const PhaserModule = await import('phaser');
const Phaser = PhaserModule.default || PhaserModule;
const GameSceneModule = await import('../src/game/GameScene.ts');
const GameScene = GameSceneModule.default || GameSceneModule.GameScene;
const { BaseEntity } = await import('../src/game/entities/BaseEntity.ts');
const { ObjectPool, POOL_PRESETS } = await import('../src/game/pooling/ObjectPool.ts');
const { AudioVoicePool } = await import('../src/game/pooling/AudioVoicePool.ts');
const {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  FlatHazardMask,
  getSafeBombEscapePath,
  canSafelyPlaceBomb,
} = await import('../src/game/pathfinding.ts');
const { ITEM_DEFINITIONS } = await import('../src/game/gameplay_mechanics.ts');
const { PsychicCrisis } = await import('../src/game/crises/PsychicCrisis.ts');
const { OrbitalCrisis } = await import('../src/game/crises/OrbitalCrisis.ts');
const { VoidCrisis } = await import('../src/game/crises/VoidCrisis.ts');
const { CrisisStage } = await import('../src/game/crises/CrisisTypes.ts');
const { PsychicCrisisAudio } = await import('../src/game/crises/PsychicCrisisAudio.ts');
const { LavaCrisisAudio } = await import('../src/game/crises/LavaCrisisAudio.ts');
const { SolarFlareCrisisAudio } = await import('../src/game/crises/SolarFlareCrisisAudio.ts');
const { ClockworkCrisisAudio } = await import('../src/game/crises/ClockworkCrisisAudio.ts');
const { VoidCrisisAudio } = await import('../src/game/crises/VoidCrisisAudio.ts');
const { OrbitalCrisisAudio } = await import('../src/game/crises/OrbitalCrisisAudio.ts');
const { RiftCrisisAudio } = await import('../src/game/crises/RiftCrisisAudio.ts');

/**
 * Creates a realistic pooled sprite mock with real Map-backed getData/setData,
 * enableBody/disableBody, EventEmitter-backed once/emit, and Arcade Body geometry.
 */
function createRealisticPooledSprite(x = 0, y = 0, texture = 'bomb') {
  const dataStore = new Map();
  const emitter = new EventEmitter();
  const body = {
    enable: true,
    immovable: false,
    velocity: { x: 0, y: 0 },
    x: x - 12,
    y: y - 12,
    width: 24,
    height: 24,
    get right() {
      return this.x + this.width;
    },
    get bottom() {
      return this.y + this.height;
    },
    setSize(w, h) {
      this.width = w;
      this.height = h;
      return this;
    },
    setOffset(ox, oy) {
      this.offsetX = ox;
      this.offsetY = oy;
      return this;
    },
    setImmovable(val) {
      this.immovable = Boolean(val);
      return this;
    },
    setVelocity(vx, vy) {
      this.velocity.x = vx;
      this.velocity.y = vy;
      return this;
    },
    reset(nx, ny) {
      this.x = nx - this.width / 2;
      this.y = ny - this.height / 2;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.enable = true;
    },
    stop() {
      this.velocity.x = 0;
      this.velocity.y = 0;
    },
    updateFromGameObject() {},
  };

  const sprite = {
    x,
    y,
    textureKey: texture,
    active: true,
    visible: true,
    alpha: 1,
    angle: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    depth: 0,
    tint: 0xffffff,
    onceCount: 0,
    body,
    anims: {
      play: () => sprite,
      stop: () => sprite,
    },
    getData(key) {
      return dataStore.get(key);
    },
    setData(key, val) {
      dataStore.set(key, val);
      return sprite;
    },
    setActive(val) {
      sprite.active = Boolean(val);
      return sprite;
    },
    setVisible(val) {
      sprite.visible = Boolean(val);
      return sprite;
    },
    setPosition(nx, ny) {
      sprite.x = nx;
      sprite.y = ny;
      body.x = nx - body.width / 2;
      body.y = ny - body.height / 2;
      return sprite;
    },
    setTexture(tex) {
      sprite.textureKey = tex;
      return sprite;
    },
    setScale(sx, sy = sx) {
      sprite.scaleX = sx;
      sprite.scaleY = sy;
      return sprite;
    },
    setAlpha(a) {
      sprite.alpha = a;
      return sprite;
    },
    setAngle(deg) {
      sprite.angle = deg;
      return sprite;
    },
    setRotation(rad) {
      sprite.rotation = rad;
      return sprite;
    },
    setDepth(d) {
      sprite.depth = d;
      return sprite;
    },
    setTint(c) {
      sprite.tint = c;
      return sprite;
    },
    clearTint() {
      sprite.tint = 0xffffff;
      return sprite;
    },
    setVelocity(vx, vy) {
      body.setVelocity(vx, vy);
      return sprite;
    },
    setImmovable(val) {
      body.setImmovable(val);
      return sprite;
    },
    setFlipX() {
      return sprite;
    },
    setFrame() {
      return sprite;
    },
    setOrigin() {
      return sprite;
    },
    setDisplaySize() {
      return sprite;
    },
    setInteractive() {
      return sprite;
    },
    setCircle() {
      return sprite;
    },
    setCollideWorldBounds() {
      return sprite;
    },
    refreshBody() {
      return sprite;
    },
    enableBody(reset, nx, ny, enableGameObject, showGameObject) {
      if (reset) {
        sprite.setPosition(nx, ny);
      }
      body.enable = true;
      body.velocity.x = 0;
      body.velocity.y = 0;
      if (enableGameObject) sprite.active = true;
      if (showGameObject) sprite.visible = true;
      return sprite;
    },
    disableBody(disableGameObject = false, hideGameObject = false) {
      body.enable = false;
      body.velocity.x = 0;
      body.velocity.y = 0;
      if (disableGameObject) sprite.active = false;
      if (hideGameObject) sprite.visible = false;
      return sprite;
    },
    once(evt, cb) {
      sprite.onceCount++;
      emitter.once(evt, cb);
      return sprite;
    },
    on(evt, cb) {
      emitter.on(evt, cb);
      return sprite;
    },
    off(evt, cb) {
      emitter.off(evt, cb);
      return sprite;
    },
    emit(evt, ...args) {
      return emitter.emit(evt, ...args);
    },
    destroy() {
      sprite.active = false;
      sprite.visible = false;
      emitter.emit(Phaser.GameObjects.Events.DESTROY, sprite);
    },
  };

  return sprite;
}

/**
 * Creates a Phaser-accurate bounded Arcade Group supporting `.get()`, `.create()`,
 * `.getChildren()`, and `maxSize` enforcement.
 */
function createBoundedArcadeGroup(config = {}) {
  const maxSize = typeof config.maxSize === 'number' ? config.maxSize : -1;
  const children = [];
  return {
    maxSize,
    config,
    get(x = 0, y = 0, key = 'sprite') {
      for (let i = 0; i < children.length; i++) {
        if (!children[i].active) {
          children[i].setPosition(x, y);
          return children[i];
        }
      }
      if (maxSize > 0 && children.length >= maxSize) {
        return null;
      }
      const created = createRealisticPooledSprite(x, y, key);
      children.push(created);
      return created;
    },
    create(x = 0, y = 0, key = 'sprite') {
      if (maxSize > 0 && children.length >= maxSize) {
        return null;
      }
      const created = createRealisticPooledSprite(x, y, key);
      children.push(created);
      return created;
    },
    add(obj) {
      children.push(obj);
      return obj;
    },
    getChildren() {
      return children;
    },
    clear() {
      children.length = 0;
    },
    remove(obj) {
      const idx = children.indexOf(obj);
      if (idx !== -1) children.splice(idx, 1);
    },
  };
}

/**
 * Builds a headless GameScene wired with bounded Arcade groups, deterministic timers,
 * tween completion hooks, and particle config capture.
 */
function createPooledTestScene() {
  const scene = new GameScene();
  const gameEmitter = new EventEmitter();
  const sceneEmitter = new EventEmitter();
  gameEmitter.setMaxListeners(500);
  sceneEmitter.setMaxListeners(500);

  scene.game = { events: gameEmitter };
  scene.events = sceneEmitter;
  scene.scene = { restart: () => {} };

  scene.sys = {
    queueDepthSort: () => {},
    displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
    updateList: { add: () => {}, remove: () => {} },
    events: sceneEmitter,
    game: scene.game,
    settings: { data: {} },
    scale: { on: () => {}, removeListener: () => {} },
  };

  const activeTimers = new Set();
  scene.time = {
    now: 1000,
    delayedCall(delayMs, callback) {
      const timer = {
        delayMs,
        callback,
        removed: false,
        remove() {
          this.removed = true;
          activeTimers.delete(this);
        },
      };
      activeTimers.add(timer);
      return timer;
    },
    removeAllEvents() {
      activeTimers.clear();
    },
    get activeTimers() {
      return activeTimers;
    },
  };

  const pendingTweens = [];
  scene.tweens = {
    add(cfg) {
      const tween = {
        cfg,
        stopped: false,
        stop() {
          this.stopped = true;
        },
        complete() {
          if (!this.stopped && typeof cfg?.onComplete === 'function') {
            cfg.onComplete();
          }
        },
      };
      pendingTweens.push(tween);
      return tween;
    },
    addCounter(cfg) {
      const counterTween = {
        cfg,
        stopped: false,
        getValue() {
          return typeof cfg?.to === 'number' ? cfg.to : 1;
        },
        stop() {
          this.stopped = true;
        },
        complete() {
          if (!this.stopped && typeof cfg?.onComplete === 'function') {
            cfg.onComplete();
          }
        },
      };
      pendingTweens.push(counterTween);
      return counterTween;
    },
    chain(cfg) {
      const chainObj = {
        cfg,
        stopped: false,
        stop() {
          this.stopped = true;
        },
      };
      return chainObj;
    },
    killTweensOf() {},
    killAll() {
      pendingTweens.length = 0;
    },
  };

  const createChainableVisual = (extra = {}) => {
    const target = {
      x: 0,
      y: 0,
      active: true,
      visible: true,
      alpha: 1,
      depth: 0,
      scaleX: 1,
      scaleY: 1,
      destroy() {
        this.active = false;
        this.visible = false;
      },
      setActive(v) {
        this.active = Boolean(v);
        return this;
      },
      setVisible(v) {
        this.visible = Boolean(v);
        return this;
      },
      setPosition(nx, ny) {
        this.x = nx;
        this.y = ny;
        return this;
      },
      setRadius() {
        return this;
      },
      setFillStyle() {
        return this;
      },
      setStrokeStyle() {
        return this;
      },
      setAlpha(a) {
        this.alpha = a;
        return this;
      },
      setScale(sx, sy = sx) {
        this.scaleX = sx;
        this.scaleY = sy;
        return this;
      },
      setSize() {
        return this;
      },
      setAngle() {
        return this;
      },
      setRotation() {
        return this;
      },
      setDepth(d) {
        this.depth = d;
        return this;
      },
      setText() {
        return this;
      },
      setColor() {
        return this;
      },
      setOrigin() {
        return this;
      },
      setScrollFactor() {
        return this;
      },
      setBlendMode() {
        return this;
      },
      clear() {
        return this;
      },
      ...extra,
    };
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop in t) {
          const val = t[prop];
          if (typeof val === 'function') {
            return (...args) => {
              const res = val.apply(t, args);
              return res === undefined ? receiver : res;
            };
          }
          return val;
        }
        return () => receiver;
      },
      set(t, prop, val) {
        t[prop] = val;
        return true;
      },
    });
  };

  const particleEmitterConfigs = [];
  scene.physics = {
    world: {
      isPaused: false,
      pause() {
        this.isPaused = true;
      },
      resume() {
        this.isPaused = false;
      },
      setBounds() {},
    },
    pause() {
      scene.physics.world.isPaused = true;
    },
    resume() {
      scene.physics.world.isPaused = false;
    },
    add: {
      group: (cfg) => createBoundedArcadeGroup(cfg),
      staticGroup: (cfg) => createBoundedArcadeGroup(cfg),
      sprite: (x, y, tex) => createRealisticPooledSprite(x, y, tex),
      existing: (obj) => obj,
      collider: () => {},
      overlap: () => {},
    },
  };

  scene.add = {
    image: () => createChainableVisual(),
    graphics: () => createChainableVisual(),
    sprite: (x, y, tex) => createRealisticPooledSprite(x, y, tex),
    particles: (x, y, texture, config) => {
      particleEmitterConfigs.push({ x, y, texture, config });
      return createChainableVisual({ texture, config });
    },
    text: () => createChainableVisual(),
    rectangle: () => createChainableVisual(),
    circle: () => createChainableVisual(),
    container: () => createChainableVisual(),
    existing: (obj) => obj,
  };

  const animsEmitter = new EventEmitter();
  scene.anims = {
    exists: () => true,
    create: () => {},
    generateFrameNumbers: () => [],
    on: (evt, cb) => animsEmitter.on(evt, cb),
    off: (evt, cb) => animsEmitter.off(evt, cb),
    once: (evt, cb) => animsEmitter.once(evt, cb),
    emit: (evt, ...args) => animsEmitter.emit(evt, ...args),
    removeListener: (evt, cb) => animsEmitter.removeListener(evt, cb),
  };
  scene.sys.anims = scene.anims;

  scene.input = {
    keyboard: {
      on: () => {},
      createCursorKeys: () => ({ up: {}, down: {}, left: {}, right: {} }),
      addKeys: () => ({}),
      addKey: () => ({ isDown: false, reset: () => {} }),
    },
    on: () => {},
  };

  scene.sound = { play: () => {}, stop: () => {} };
  scene.cameras = {
    main: {
      setBackgroundColor: () => {},
      setScroll: () => {},
      setRotation: () => {},
      shake: () => {},
      flash: () => {},
    },
  };

  const mockTexture = {
    get: () => ({ cutX: 0, cutY: 0, cutWidth: 32, cutHeight: 32, setAlpha: () => {} }),
    frames: { __BASE: { cutX: 0, cutY: 0, cutWidth: 32, cutHeight: 32 } },
  };
  scene.textures = {
    exists: () => true,
    get: () => mockTexture,
  };
  scene.sys.textures = scene.textures;

  return { scene, gameEmitter, activeTimers, pendingTweens, particleEmitterConfigs };
}

/* ============================================================================
 * 1. BOMB POOL RECYCLING (>32 SEQUENTIAL BOMBS) & IGNORING SET REUSE
 * ============================================================================ */

test('Zero-GC Bomb Pool: placing & exploding 80 sequential bombs recycles <= 32 sprites and reuses ignoringColliders Set', () => {
  const { scene } = createPooledTestScene();
  scene.create();
  scene.maxBombs = 8;

  // Clear soft blocks around row 1 so explosions are fast and deterministic
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (scene.map[r][c] !== TILE_WALL) {
        scene.map[r][c] = TILE_EMPTY;
      }
    }
  }

  scene.player.setPosition(1 * 40 + 20, 1 * 40 + 20);

  let firstIgnoringSet = null;
  for (let i = 0; i < 80; i++) {
    scene.placeBomb();
    assert.equal(scene.activeBombs, 1, `Iteration ${i}: activeBombs must be 1 after placeBomb`);
    const activeBomb = scene.bombs.getChildren().find((b) => b.active);
    assert.ok(activeBomb, `Iteration ${i}: pooled bomb must be active`);

    const ignoring = activeBomb.getData('ignoringColliders');
    assert.ok(ignoring instanceof Set, 'ignoringColliders must be a Set');
    assert.equal(ignoring.has(scene.player), true, 'creator must be in ignoringColliders while active');
    if (i === 0) {
      firstIgnoringSet = ignoring;
    } else {
      assert.strictEqual(ignoring, firstIgnoringSet, 'recycled bomb must reuse the same ignoringColliders Set instance');
    }

    scene.explodeBomb(activeBomb, 1, 1);
    assert.equal(scene.activeBombs, 0, `Iteration ${i}: activeBombs must return to 0 after explodeBomb`);
    assert.equal(ignoring.size, 0, 'explodeBomb must immediately clear ignoringColliders references');
    assert.equal(activeBomb.getData('fuseTimer'), undefined, 'explodeBomb must clear fuseTimer reference');
    assert.equal(activeBomb.getData('tweenChain'), undefined, 'explodeBomb must clear tweenChain reference');
  }

  assert.equal(
    scene.bombs.getChildren().length,
    1,
    '80 sequential single-bomb cycles must reuse 1 pooled sprite without allocating past POOL_PRESETS.BOMBS (32)'
  );
  scene.shutdown();
});

/* ============================================================================
 * 2. GHOST BOMB & RICOCHET STATE ISOLATION ACROSS RECYCLED BOMBS
 * ============================================================================ */

test('Zero-GC Bomb Pool: recycling a Ghost Bomb into a player RICOCHET_BOMB resets isGhostBomb and preserves 3 rebounds', () => {
  const { scene } = createPooledTestScene();
  scene.create();
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (scene.map[r][c] !== TILE_WALL) scene.map[r][c] = TILE_EMPTY;
    }
  }

  // 1. Spawn and detonate a Ghost Bomb first so slot 0 has `isGhostBomb: true` history
  scene.spawnGhostBomb('ghost_1', 'parent_1', 1, 3, 2, 1500);
  const ghostSprite = scene.bombs.getChildren()[0];
  assert.ok(ghostSprite, 'Ghost bomb sprite allocated');
  assert.equal(ghostSprite.getData('isGhostBomb'), true);
  assert.equal(scene.activeBombs, 0, 'Ghost bomb must not increment player activeBombs');

  scene.explodeBomb(ghostSprite, 1, 3);
  assert.equal(ghostSprite.active, false);

  // 2. Reuse that exact pooled sprite as a regular player RICOCHET_BOMB with Kick enabled
  scene.hasKick = true;
  scene.activeBombType = 'RICOCHET_BOMB';
  scene.player.setPosition(1 * 40 + 20, 1 * 40 + 20);
  scene.placeBomb();

  const playerBomb = scene.bombs.getChildren()[0];
  assert.strictEqual(playerBomb, ghostSprite, 'Must recycle the deactivated ghost bomb sprite');
  assert.equal(playerBomb.getData('isGhostBomb'), false, 'Recycled bomb must reset isGhostBomb to false');
  assert.equal(playerBomb.getData('reboundsLeft'), undefined, 'Recycled bomb must reset reboundsLeft to undefined before kick');
  assert.equal(scene.activeBombs, 1);

  // Kick right from (1,1) toward (1,2)
  scene.player.setPosition(1 * 40 + 4, 1 * 40 + 20);
  scene.playerFacing = 'right';
  scene.tryKickBomb(scene.player, playerBomb);
  assert.equal(playerBomb.getData('reboundsLeft'), 3, 'Recycled RICOCHET_BOMB must receive all 3 rebounds on kick');

  // Explode and ensure activeBombs decrements back to 0 (not skipped due to stale isGhostBomb)
  scene.explodeBomb(playerBomb, 1, 1);
  assert.equal(scene.activeBombs, 0, 'Player bomb recycled from ghost bomb must decrement activeBombs on detonation');
  scene.shutdown();
});

/* ============================================================================
 * 3. ENEMY/ALLY REFERENCE RELEASE & 32-BOMB POOL SATURATION SAFETY
 * ============================================================================ */

test('Zero-GC Bomb Pool: enemy/ally references are cleared on explodeBomb and 32-bomb pool saturation never throws', () => {
  const { scene } = createPooledTestScene();
  scene.create();
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (scene.map[r][c] !== TILE_WALL) scene.map[r][c] = TILE_EMPTY;
    }
  }

  let enemyExplodedCount = 0;
  const mockEnemy = createRealisticPooledSprite(60, 60, 'enemy');
  mockEnemy.onBombExploded = () => {
    enemyExplodedCount++;
  };
  const mockAlly = createRealisticPooledSprite(100, 60, 'ally');
  mockAlly.activeBombs = 1;

  assert.equal(scene.placeEnemyBomb(mockEnemy, 1, 2, 2, 2000), true);
  const enemyBomb = scene.bombs.getChildren().find((b) => b.active && b.getData('owner') === 'enemy');
  assert.strictEqual(enemyBomb.getData('enemy'), mockEnemy);
  scene.explodeBomb(enemyBomb, 1, 2);
  assert.equal(enemyExplodedCount, 1);
  assert.equal(enemyBomb.getData('enemy'), undefined, 'explodeBomb must release enemy reference on pooled bomb');

  assert.equal(scene.placeAllyBomb(mockAlly, 1, 3, 2), true);
  const allyBomb = scene.bombs.getChildren().find((b) => b.active && b.getData('owner') === 'ally');
  assert.strictEqual(allyBomb.getData('ally'), mockAlly);
  scene.explodeBomb(allyBomb, 1, 3);
  assert.equal(mockAlly.activeBombs, 0);
  assert.equal(allyBomb.getData('ally'), undefined, 'explodeBomb must release ally reference on pooled bomb');

  // Saturate all 32 slots in scene.bombs simultaneously
  scene.maxBombs = 64;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const activePoolCount = scene.bombs.getChildren().filter((b) => b.active).length;
      if (activePoolCount >= POOL_PRESETS.BOMBS) break;
      if (scene.map[r][c] === TILE_EMPTY) {
        scene.player.setPosition(c * 40 + 20, r * 40 + 20);
        scene.placeBomb();
      }
    }
  }
  const activeBeforeOverflow = scene.activeBombs;
  assert.equal(scene.bombs.getChildren().length, POOL_PRESETS.BOMBS);
  assert.equal(scene.bombs.getChildren().filter((b) => b.active).length, POOL_PRESETS.BOMBS);

  // Attempting additional placements at full 32 capacity must gracefully no-op without TypeError
  scene.player.setPosition(11 * 40 + 20, 11 * 40 + 20);
  assert.doesNotThrow(() => scene.placeBomb());
  assert.doesNotThrow(() => scene.spawnGhostBomb('g_sat', 'p_sat', 11, 10, 2, 1500));
  assert.equal(scene.placeEnemyBomb(mockEnemy, 11, 9, 2, 2000), false);
  assert.equal(scene.placeAllyBomb(mockAlly, 11, 8, 2), false);
  assert.equal(scene.activeBombs, activeBeforeOverflow, 'Failed pool acquisition must not increment activeBombs');

  scene.shutdown();
});

/* ============================================================================
 * 4. EXPLOSION POOL RECYCLING (>128) & SATURATION BOSS DAMAGE INVARIANT
 * ============================================================================ */

test('Zero-GC Explosion Pool: 260 sequential explosions recycle <= 128 sprites and saturated explosions still apply boss damage', () => {
  const { scene, pendingTweens } = createPooledTestScene();
  scene.create();

  for (let i = 0; i < 260; i++) {
    scene.spawnExplosion(1, 1, i % 2 === 0, 'player', `b_${i}`, i % 5 === 0);
    // Complete explosion fade tween immediately to return sprite to pool
    while (pendingTweens.length > 0) {
      pendingTweens.pop().complete();
    }
  }

  assert.ok(
    scene.explosions.getChildren().length <= POOL_PRESETS.EXPLOSIONS,
    `Expected <= ${POOL_PRESETS.EXPLOSIONS} explosion sprites, got ${scene.explosions.getChildren().length}`
  );
  assert.equal(scene.explosions.getChildren().length, 1, 'Sequential completed explosions must reuse slot 0');

  // Saturate all 128 explosion sprites simultaneously (do not complete tweens)
  for (let i = 0; i < POOL_PRESETS.EXPLOSIONS; i++) {
    scene.spawnExplosion(1, 2, false, 'player', `sat_${i}`);
  }
  assert.equal(scene.explosions.getChildren().filter((e) => e.active).length, POOL_PRESETS.EXPLOSIONS);

  // Attach mock active boss at (1, 3) and fire 129th explosion while pool is 100% saturated
  let bossDamageTaken = 0;
  scene.activeBoss = {
    x: 3 * 40 + 20,
    y: 1 * 40 + 20,
    bossState: 'IDLE',
    currentHp: 10,
    config: { colliderRadius: 35 },
    takeBombDamage(dmg) {
      bossDamageTaken += dmg;
      this.currentHp -= dmg;
      return true;
    },
  };

  assert.doesNotThrow(() => {
    scene.spawnExplosion(1, 3, true, 'player', 'boss_hit_under_saturation');
  });
  assert.equal(bossDamageTaken, 1, 'Boss must still receive bomb damage even when visual explosion pool is saturated');

  scene.shutdown();
});

/* ============================================================================
 * 5. ITEM POOL RECYCLING (>48) & SINGLE SHADOW DESTROY HOOK GUARD
 * ============================================================================ */

test('Zero-GC Item Pool: 120 sequential items recycle <= 48 sprites, release prior shadows, and attach DESTROY hook once', () => {
  const { scene, pendingTweens } = createPooledTestScene();
  scene.create();

  const baselineShadows = scene.shadowPool.activeCount;
  const itemTypes = ['SPEED_UP', 'BOMB_UP', 'FIRE_UP', 'SHIELD', 'KICK'];
  for (let i = 0; i < 120; i++) {
    const type = itemTypes[i % itemTypes.length];
    scene.spawnSpecificItem(type, 1, 1);

    const activeItem = scene.items.getChildren().find((it) => it.active);
    assert.ok(activeItem, `Iteration ${i}: item must be active`);
    assert.equal(activeItem.getData('itemType'), type);
    assert.equal(activeItem.textureKey, ITEM_DEFINITIONS[type].iconKey, 'Recycled item sprite must update texture');
    assert.equal(activeItem.onceCount, 1, 'DESTROY shadow cleanup listener must be registered at most once per pooled sprite');

    // Alternate between explicit pickup shadow release and relying on spawnItem's prior-shadow auto-release
    if (i % 2 === 1 || i === 119) {
      const shadow = activeItem.getData('itemShadow');
      if (shadow && scene.shadowPool) {
        scene.shadowPool.release(shadow);
        activeItem.setData('itemShadow', null);
      }
    }
    activeItem.disableBody(true, true);
    while (pendingTweens.length > 0) {
      pendingTweens.pop().complete();
    }
  }

  assert.equal(scene.items.getChildren().length, 1, '120 sequential items must recycle a single pooled sprite');
  assert.equal(scene.shadowPool.activeCount, baselineShadows, 'Zero item shadows may leak across 120 item recycles');
  scene.shutdown();
});

/* ============================================================================
 * 6. PARTICLE EMITTER POOL BOUNDS & 7. BASEENTITY DEATH SPARK CIRCLEPOOL
 * ============================================================================ */

test('Zero-GC Particle Emitters: GameScene.create() enforces maxAliveParticles & reserve (256) on all 3 emitters', () => {
  const { scene, particleEmitterConfigs } = createPooledTestScene();
  scene.create();

  assert.equal(particleEmitterConfigs.length, 3, 'Expected dust, bombSpark, and blockDebris emitters');
  for (const entry of particleEmitterConfigs) {
    assert.equal(
      entry.config.maxAliveParticles,
      POOL_PRESETS.PARTICLES,
      `Emitter ${entry.texture} must cap maxAliveParticles at ${POOL_PRESETS.PARTICLES}`
    );
    assert.equal(
      entry.config.reserve,
      POOL_PRESETS.PARTICLES,
      `Emitter ${entry.texture} must pre-reserve ${POOL_PRESETS.PARTICLES} particles`
    );
  }

  scene.shutdown();
});

test('Zero-GC BaseEntity.die(): acquires 6 death sparks from scene.circlePool and releases all 6 on tween completion', () => {
  const { scene, pendingTweens } = createPooledTestScene();

  const circlePool = new ObjectPool(
    () => scene.add.circle(0, 0, 4, 0xffffff, 1),
    (c) => {
      c.setActive(false);
      c.setVisible(false);
    },
    16,
    64
  );
  scene.circlePool = circlePool;
  scene.shadowPool = new ObjectPool(
    () => scene.add.sprite(0, 0, 'shadow_ellipse'),
    (s) => {
      s.setActive(false);
      s.setVisible(false);
    },
    8,
    32
  );

  class TestEnemy extends BaseEntity {
    constructor(s, x, y) {
      super(s, x, y, 'enemy_slime', 'enemy', 1, 'Slime', 'slime');
    }
  }

  const enemy = new TestEnemy(scene, 100, 100);
  // Stub super.destroy side-effects while preserving BaseEntity.prototype.destroy logic
  enemy.destroy = function () {
    if (this.dropShadow && scene.shadowPool) {
      scene.shadowPool.release(this.dropShadow);
      this.dropShadow = undefined;
    }
    if (this.overheadUI) {
      this.overheadUI.destroy();
    }
    this.active = false;
  };

  assert.equal(circlePool.activeCount, 0);
  enemy.die(1000);
  assert.equal(circlePool.activeCount, 6, 'BaseEntity.die() must acquire 6 pooled spark circles');

  while (pendingTweens.length > 0) {
    pendingTweens.pop().complete();
  }
  assert.equal(circlePool.activeCount, 0, 'All 6 pooled death sparks must be released back to circlePool');
  assert.equal(scene.shadowPool.activeCount, 0, 'Drop shadow must be released on entity death');
});

/* ============================================================================
 * 8. BUFF COMPACTION, 60HZ DEBUFF DEDUPLICATION & NON-COMPOUNDING MASTERY SPEED
 * ============================================================================ */

test('Zero-GC Buffs & Mastery Speed: in-place compaction, 60Hz debuff timer deduplication, and non-compounding speed bursts', () => {
  const { scene, gameEmitter, activeTimers } = createPooledTestScene();
  scene.create();

  let statsEmissions = 0;
  gameEmitter.on('stats-update', () => {
    statsEmissions++;
  });

  const buffsArrayRef = scene.activeBuffs;

  // 1. 60Hz repeated debuff application must NOT accumulate 60 timers or emit 60 stats updates
  const baselineTimerCount = activeTimers.size;
  statsEmissions = 0;
  for (let frame = 0; frame < 60; frame++) {
    scene.time.now = 2000 + frame * 16;
    scene.applyFrostChill();
  }
  assert.strictEqual(scene.activeBuffs, buffsArrayRef, 'activeBuffs array reference must remain in-place');
  assert.equal(scene.activeBuffs.length, 1, 'FROST_CHILL must be deduplicated in activeBuffs');
  assert.equal(statsEmissions, 1, '60Hz refresh of existing FROST_CHILL must emit stats-update only on initial apply');
  assert.equal(
    activeTimers.size - baselineTimerCount,
    1,
    'scheduleDebuffTintClear must maintain at most 1 active tint timer for FROST_CHILL'
  );

  // 2. Granting Thermal Break cleanses FROST_CHILL in-place and applies non-compounding speed bonus
  const initialBaseSpeed = scene.playerSpeed; // 160
  scene.grantThermalBreak();
  const boostedSpeed = scene.playerSpeed;
  assert.ok(boostedSpeed > initialBaseSpeed, 'Thermal Break must boost playerSpeed');
  assert.strictEqual(scene.activeBuffs, buffsArrayRef, 'removeBuffById must compact activeBuffs in-place');
  assert.equal(scene.activeBuffs.some((b) => b.id === 'FROST_CHILL'), false, 'FROST_CHILL must be cleansed');

  // Re-triggering grantThermalBreak 10 times during multi-frame dash must NEVER compound exponentially
  for (let i = 0; i < 10; i++) {
    scene.time.now += 16;
    scene.grantThermalBreak();
  }
  assert.equal(scene.playerSpeed, boostedSpeed, 'Repeated mastery triggers must never compound playerSpeed');

  // Picking up permanent SPEED_UP (+25) while mastery buff is active must be preserved after expiry
  scene.collectItem('SPEED_UP', scene.player.x, scene.player.y);
  const speedDuringBuffAfterPickup = scene.playerSpeed;
  assert.equal(speedDuringBuffAfterPickup, boostedSpeed + 25);

  // Advance clock past mastery expiry and invoke scheduled timer callback
  scene.time.now += 5000;
  for (const timer of [...activeTimers]) {
    timer.callback();
  }
  assert.equal(
    scene.playerSpeed,
    initialBaseSpeed + 25,
    'Expiring mastery speed burst must subtract only its exact delta and preserve permanent SPEED_UP (+25)'
  );

  scene.shutdown();
  assert.equal(scene.activeMasterySpeedBonuses.size, 0);
  assert.equal(scene.activeDebuffTintTimers.size, 0);
});

/* ============================================================================
 * 9. ZERO-GC PATHFINDING PARITY & MALFORMED KEY DEFENSE
 * ============================================================================ */

test('Zero-GC Pathfinding: FlatHazardMask.copyFrom size recount and Set/Uint8Array/FlatHazardMask parity with malformed Set entries', () => {
  const map = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? TILE_WALL : TILE_EMPTY
    )
  );

  // Verify FlatHazardMask.copyFrom recounts accurately even when source has hazards beyond a smaller mask
  const largeSource = new Uint8Array(ROWS * COLS + 20);
  largeSource[2 * COLS + 3] = 1;
  largeSource[4 * COLS + 5] = 1;
  largeSource[ROWS * COLS + 10] = 1; // Out-of-grid tail byte

  const mask = new FlatHazardMask(ROWS * COLS);
  mask.copyFrom(largeSource);
  assert.equal(mask.size, 2, 'FlatHazardMask.copyFrom must count only copied in-bounds hazard bytes');
  assert.equal(mask.has('2,3'), true);
  assert.equal(mask.has('4,5'), true);
  assert.equal(mask.has('invalid_key'), false);

  // Compare Set<string> (including malformed entries) vs FlatHazardMask vs Uint8Array in findSafeEscapeAfterBomb & canSafelyPlaceBomb
  const hazardSet = new Set(['1,3', '3,1', 'bad', '', '99,99', '-1,2']);
  hazardSet.add(null);
  hazardSet.add(42);

  const flatHazards = new FlatHazardMask(ROWS * COLS);
  flatHazards.add('1,3');
  flatHazards.add('3,1');

  const rawArrayHazards = new Uint8Array(ROWS * COLS);
  rawArrayHazards[1 * COLS + 3] = 1;
  rawArrayHazards[3 * COLS + 1] = 1;

  const bombSet = new Set(['2,4', 'malformed']);
  const escFromSet = getSafeBombEscapePath({ r: 2, c: 2 }, 2, map, bombSet, 8, hazardSet);
  const escFromMask = getSafeBombEscapePath({ r: 2, c: 2 }, 2, map, new Set(['2,4']), 8, flatHazards);
  const escFromUint8 = getSafeBombEscapePath({ r: 2, c: 2 }, 2, map, new Set(['2,4']), 8, rawArrayHazards);

  assert.deepEqual(escFromSet, escFromMask);
  assert.deepEqual(escFromMask, escFromUint8);

  const canFromSet = canSafelyPlaceBomb({ r: 2, c: 2 }, 2, map, bombSet, 8, hazardSet);
  const canFromMask = canSafelyPlaceBomb({ r: 2, c: 2 }, 2, map, new Set(['2,4']), 8, flatHazards);
  const canFromUint8 = canSafelyPlaceBomb({ r: 2, c: 2 }, 2, map, new Set(['2,4']), 8, rawArrayHazards);

  assert.equal(canFromSet, canFromMask);
  assert.equal(canFromMask, canFromUint8);
});

/* ============================================================================
 * 10. CRISIS POOL IDENTITY & ALL 7 CRISIS AUDIO NOISE BUFFER TEARDOWNS
 * ============================================================================ */

test('Zero-GC Crises & Audio: PsychicCrisis.reset() preserves manifestationPool identity and all 7 CrisisAudio.destroy() release cachedNoiseBuffer', () => {
  // 1. PsychicCrisis manifestation pool identity across reset cycles
  const psychic = new PsychicCrisis();
  const initialPoolRef = psychic.manifestationPool;
  assert.strictEqual(psychic.manifestations, initialPoolRef);
  psychic.start();
  psychic.update(100, { r: 1, c: 1 });
  psychic.reset();
  assert.strictEqual(
    psychic.manifestations,
    initialPoolRef,
    'PsychicCrisis.reset() must mutate manifestationPool in-place without allocating a new array'
  );

  // Verify OrbitalCrisis & VoidCrisis Zero-GC update loops run cleanly in CLIMAX
  const orbital = new OrbitalCrisis();
  orbital.start();
  orbital.transitionToStage(CrisisStage.CLIMAX);
  assert.doesNotThrow(() => orbital.update(200, { r: 1, c: 1 }));
  orbital.reset();

  const voidCrisis = new VoidCrisis();
  voidCrisis.start();
  voidCrisis.transitionToStage(CrisisStage.CLIMAX);
  assert.doesNotThrow(() => voidCrisis.update(200, { r: 1, c: 1 }));
  voidCrisis.reset();

  // 2. All 7 CrisisAudio classes must clear static cachedNoiseBuffer & singleton instance on destroy()
  const mockAudioCtx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: { connect() {}, disconnect() {} },
    createOscillator: () => ({
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    }),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      connect() {},
      disconnect() {},
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: {
        value: 350,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      Q: { value: 1, setValueAtTime() {}, cancelScheduledValues() {} },
      connect() {},
      disconnect() {},
    }),
    createBuffer: (_channels, length, sampleRate) => ({
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    }),
  };

  const audioTargets = [
    {
      Cls: PsychicCrisisAudio,
      warmNoise: (inst) => inst.getSharedNoiseBuffer(mockAudioCtx),
    },
    {
      Cls: LavaCrisisAudio,
      warmNoise: () => LavaCrisisAudio.getOrCreateNoiseBuffer(mockAudioCtx),
    },
    {
      Cls: SolarFlareCrisisAudio,
      warmNoise: () => SolarFlareCrisisAudio.getOrCreateNoiseBuffer(mockAudioCtx),
    },
    {
      Cls: ClockworkCrisisAudio,
      warmNoise: (inst) => inst.getSharedNoiseBuffer(mockAudioCtx),
    },
    {
      Cls: VoidCrisisAudio,
      warmNoise: (inst) => inst.getSharedNoiseBuffer(mockAudioCtx),
    },
    {
      Cls: OrbitalCrisisAudio,
      warmNoise: (inst) => inst.getOrCreateNoiseBuffer(mockAudioCtx),
    },
    {
      Cls: RiftCrisisAudio,
      warmNoise: () => RiftCrisisAudio.getOrCreateNoiseBuffer(mockAudioCtx),
    },
  ];

  for (const { Cls, warmNoise } of audioTargets) {
    if (typeof Cls.resetInstance === 'function') Cls.resetInstance();
    const pool = new AudioVoicePool(4, mockAudioCtx);
    const inst = Cls.getInstance(pool, mockAudioCtx);
    const buf = warmNoise(inst);
    assert.ok(buf, `${Cls.name} must allocate procedural 500ms noise buffer on warm-up`);
    assert.notEqual(Cls.cachedNoiseBuffer, null, `${Cls.name}.cachedNoiseBuffer must be populated`);

    inst.destroy();
    pool.destroy();

    assert.equal(
      Cls.cachedNoiseBuffer,
      null,
      `${Cls.name}.destroy() must release static cachedNoiseBuffer to prevent 88KB AudioBuffer retention`
    );
    const rateField = 'cachedNoiseSampleRate' in Cls ? Cls.cachedNoiseSampleRate : Cls.cachedSampleRate;
    assert.equal(rateField, 0, `${Cls.name}.destroy() must reset cached sample rate to 0`);
    assert.equal(Cls.instance, null, `${Cls.name}.destroy() must clear static singleton instance reference`);
  }
});
