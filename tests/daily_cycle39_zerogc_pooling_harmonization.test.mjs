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

const GameSceneModule = await import('../src/game/GameScene.ts');
const GameScene = GameSceneModule.default || GameSceneModule.GameScene;
const { OverheadUI } = await import('../src/game/entities/OverheadUI.ts');
const { PetDroneAlly } = await import('../src/game/entities/AllyEntities.ts');
const { SplitterEnemy } = await import('../src/game/entities/EnemyEntities.ts');
const { renderMeteorReticle, renderScorchDecal } = await import('../src/game/ultimate_skills.ts');
const { RelicManager, RelicId } = await import('../src/game/progression/index.ts');
const { BossAttackManager } = await import('../src/game/bosses/BossAttackManager.ts');
const { OrbitalCrisis } = await import('../src/game/crises/OrbitalCrisis.ts');
const { VoidCrisis } = await import('../src/game/crises/VoidCrisis.ts');
const { ClockworkCrisis } = await import('../src/game/crises/ClockworkCrisis.ts');
const { RiftCrisis } = await import('../src/game/crises/RiftCrisis.ts');
const { SolarFlareCrisis } = await import('../src/game/crises/SolarFlareCrisis.ts');
const { CrisisStage } = await import('../src/game/crises/CrisisTypes.ts');
const { POOL_PRESETS } = await import('../src/game/pooling/ObjectPool.ts');
const { ROWS, COLS, TILE_SIZE, TILE_EMPTY, TILE_WALL, TILE_BLOCK } = await import(
  '../src/game/pathfinding.ts'
);

/**
 * Stateful headless GameScene harness that faithfully tracks object state,
 * data maps, tweens (including killAll / killTweensOf / onStop), and timers.
 */
function createStatefulGameSceneHarness({ withParticles = false } = {}) {
  const scene = new GameScene();
  const gameEmitter = new EventEmitter();
  const sceneEmitter = new EventEmitter();
  gameEmitter.setMaxListeners(500);
  sceneEmitter.setMaxListeners(500);

  scene.game = { events: gameEmitter };
  scene.events = sceneEmitter;
  scene.sys = {
    queueDepthSort: () => {},
    displayList: { add: () => {}, remove: () => {}, exists: () => false, queueDepthSort: () => {} },
    updateList: { add: () => {}, remove: () => {}, exists: () => false },
    events: sceneEmitter,
    game: scene.game,
    settings: { data: {} },
    scale: { on: () => {}, removeListener: () => {} },
  };
  scene.scale = { width: 600, height: 520 };

  const activeTimers = [];
  const repeatingEvents = [];
  scene.time = {
    now: 1000,
    delayedCall: (delayMs, callback) => {
      const timer = {
        delayMs,
        callback,
        paused: false,
        removed: false,
        remove() {
          this.removed = true;
        },
      };
      activeTimers.push(timer);
      return timer;
    },
    addEvent: (cfg) => {
      const ev = {
        ...cfg,
        removed: false,
        remove() {
          this.removed = true;
        },
      };
      repeatingEvents.push(ev);
      return ev;
    },
    removeAllEvents: () => {
      activeTimers.length = 0;
      repeatingEvents.length = 0;
    },
  };

  const activeTweens = new Set();
  scene.tweens = {
    add: (cfg = {}) => {
      const tw = {
        ...cfg,
        stopped: false,
        stop() {
          if (this.stopped) return;
          this.stopped = true;
          activeTweens.delete(this);
          if (typeof this.onStop === 'function') this.onStop(this);
        },
        complete() {
          if (this.stopped) return;
          this.stopped = true;
          activeTweens.delete(this);
          if (cfg.targets) {
            const list = Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets];
            for (const t of list) {
              if (t && typeof cfg.alpha === 'number') t.alpha = cfg.alpha;
            }
          }
          if (typeof this.onComplete === 'function') this.onComplete(this);
        },
      };
      activeTweens.add(tw);
      return tw;
    },
    addCounter: (cfg = {}) => {
      let val = cfg.from ?? 0;
      const tw = {
        ...cfg,
        stopped: false,
        getValue: () => val,
        step(nextVal) {
          val = nextVal;
          if (typeof this.onUpdate === 'function') this.onUpdate(this);
        },
        stop() {
          if (this.stopped) return;
          this.stopped = true;
          activeTweens.delete(this);
          if (typeof this.onStop === 'function') this.onStop(this);
        },
        complete() {
          if (this.stopped) return;
          val = cfg.to ?? 1;
          if (typeof this.onUpdate === 'function') this.onUpdate(this);
          this.stopped = true;
          activeTweens.delete(this);
          if (typeof this.onComplete === 'function') this.onComplete(this);
        },
      };
      activeTweens.add(tw);
      return tw;
    },
    chain: (cfg = {}) => {
      const ch = { ...cfg, paused: false, pause() { this.paused = true; }, resume() { this.paused = false; }, stop() {} };
      activeTweens.add(ch);
      return ch;
    },
    killTweensOf: (target) => {
      for (const tw of Array.from(activeTweens)) {
        const list = Array.isArray(tw.targets) ? tw.targets : tw.targets ? [tw.targets] : [];
        if (list.includes(target)) {
          if (typeof tw.stop === 'function') tw.stop();
          else activeTweens.delete(tw);
        }
      }
    },
    killAll: () => {
      for (const tw of Array.from(activeTweens)) {
        if (typeof tw.stop === 'function') tw.stop();
        else activeTweens.delete(tw);
      }
      activeTweens.clear();
    },
    get activeSet() {
      return activeTweens;
    },
  };

  let textFactoryCount = 0;
  let imageDestroyCount = 0;

  const makeStatefulObject = (kind = 'generic') => {
    const data = new Map();
    const listeners = new EventEmitter();
    const body = {
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      halfWidth: 12,
      halfHeight: 12,
      right: 24,
      bottom: 24,
      enable: true,
      immovable: false,
      moves: true,
      velocity: { x: 0, y: 0 },
      position: { x: 0, y: 0 },
      setSize(w, h) {
        this.width = w;
        this.height = h;
        this.halfWidth = w / 2;
        this.halfHeight = h / 2;
        return this;
      },
      setOffset() {
        return this;
      },
      setVelocity(vx, vy) {
        this.velocity.x = vx;
        this.velocity.y = vy;
        return this;
      },
      setImmovable(v) {
        this.immovable = v;
        return this;
      },
      setAllowGravity() {
        return this;
      },
      setCollideWorldBounds() {
        return this;
      },
      updateFromGameObject() {
        return this;
      },
      reset(rx, ry) {
        this.x = rx;
        this.y = ry;
        this.position.x = rx - this.halfWidth;
        this.position.y = ry - this.halfHeight;
        this.velocity.x = 0;
        this.velocity.y = 0;
      },
      destroy() {},
    };

    const obj = {
      kind,
      x: 0,
      y: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      depth: 0,
      scrollFactorX: 1,
      scrollFactorY: 1,
      strokeWidth: 0,
      tint: null,
      flipX: false,
      flipY: false,
      text: '',
      color: '#ffffff',
      active: true,
      visible: true,
      destroyed: false,
      textureKey: '',
      frame: { name: 0 },
      body,
      anims: { play: () => {}, stop: () => {} },
      setData(k, v) {
        data.set(k, v);
        return this;
      },
      getData(k) {
        return data.get(k);
      },
      setPosition(nx, ny) {
        this.x = nx;
        this.y = ny;
        this.body.position.x = nx - this.body.halfWidth;
        this.body.position.y = ny - this.body.halfHeight;
        return this;
      },
      setActive(v) {
        this.active = v;
        return this;
      },
      setVisible(v) {
        this.visible = v;
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
      setAngle(deg) {
        this.angle = deg;
        return this;
      },
      setDepth(d) {
        this.depth = d;
        return this;
      },
      setOrigin() {
        return this;
      },
      setScrollFactor(fx, fy = fx) {
        this.scrollFactorX = fx;
        this.scrollFactorY = fy;
        return this;
      },
      setStrokeStyle(width) {
        this.strokeWidth = width;
        return this;
      },
      setFillStyle() {
        return this;
      },
      setRadius() {
        return this;
      },
      setSize(w, h) {
        this.width = w;
        this.height = h;
        return this;
      },
      setTint(c) {
        this.tint = c;
        return this;
      },
      clearTint() {
        this.tint = null;
        return this;
      },
      setFlipX(f) {
        this.flipX = f;
        return this;
      },
      setFlipY(f) {
        this.flipY = f;
        return this;
      },
      setTexture(key) {
        this.textureKey = key;
        return this;
      },
      setFrame(f) {
        this.frame = { name: f };
        return this;
      },
      play() {
        return this;
      },
      stop() {
        return this;
      },
      setBlendMode() {
        return this;
      },
      setRotation(r) {
        this.rotation = r;
        return this;
      },
      setFontSize() {
        return this;
      },
      setStroke() {
        return this;
      },
      setText(t) {
        this.text = String(t);
        return this;
      },
      setColor(c) {
        this.color = c;
        return this;
      },
      setImmovable(v) {
        this.body.immovable = v;
        return this;
      },
      setCollideWorldBounds() {
        return this;
      },
      setPushable() {
        return this;
      },
      setVelocity(vx, vy) {
        this.body.setVelocity(vx, vy);
        return this;
      },
      refreshBody() {
        return this;
      },
      enableBody(_reset, gx, gy, enableGameObject, showGameObject) {
        this.x = gx;
        this.y = gy;
        this.body.reset(gx, gy);
        this.body.enable = true;
        if (enableGameObject) this.active = true;
        if (showGameObject) this.visible = true;
        return this;
      },
      disableBody(disableGameObject = false, hideGameObject = false) {
        this.body.enable = false;
        if (disableGameObject) this.active = false;
        if (hideGameObject) this.visible = false;
        return this;
      },
      clear() {
        return this;
      },
      lineStyle() {
        return this;
      },
      fillStyle() {
        return this;
      },
      fillRect() {
        return this;
      },
      strokeRect() {
        return this;
      },
      fillCircle() {
        return this;
      },
      strokeCircle() {
        return this;
      },
      lineBetween() {
        return this;
      },
      beginPath() {
        return this;
      },
      moveTo() {
        return this;
      },
      lineTo() {
        return this;
      },
      closePath() {
        return this;
      },
      fillPath() {
        return this;
      },
      strokePath() {
        return this;
      },
      generateTexture() {
        return this;
      },
      once(evt, cb) {
        listeners.once(evt, cb);
        return this;
      },
      on(evt, cb) {
        listeners.on(evt, cb);
        return this;
      },
      off(evt, cb) {
        listeners.off(evt, cb);
        return this;
      },
      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.active = false;
        this.visible = false;
        if (kind === 'image') imageDestroyCount++;
        listeners.emit('destroy', this);
        if (this._parentGroup) {
          const idx = this._parentGroup.indexOf(this);
          if (idx !== -1) this._parentGroup.splice(idx, 1);
        }
      },
    };
    return obj;
  };

  const createGroup = () => {
    const children = [];
    return {
      create(gx = 0, gy = 0, key = '') {
        const o = makeStatefulObject('sprite');
        o.setPosition(gx, gy);
        o.setTexture(key);
        o._parentGroup = children;
        children.push(o);
        return o;
      },
      get(gx = 0, gy = 0, key = '') {
        for (let i = 0; i < children.length; i++) {
          if (!children[i].active && !children[i].destroyed) {
            const o = children[i];
            o.setPosition(gx, gy);
            o.setTexture(key);
            return o;
          }
        }
        return this.create(gx, gy, key);
      },
      add(o) {
        o._parentGroup = children;
        if (!children.includes(o)) children.push(o);
        return o;
      },
      getChildren: () => children,
      clear(_removeFromScene = false, destroyChild = false) {
        const snapshot = [...children];
        children.length = 0;
        if (destroyChild) {
          for (const ch of snapshot) {
            if (ch && typeof ch.destroy === 'function') ch.destroy();
          }
        }
      },
      remove(o) {
        const idx = children.indexOf(o);
        if (idx !== -1) children.splice(idx, 1);
      },
      destroy() {
        this.clear(true, true);
      },
    };
  };

  scene.physics = {
    world: {
      isPaused: false,
      resume() {
        this.isPaused = false;
      },
      pause() {
        this.isPaused = true;
      },
      setBounds: () => {},
    },
    pause() {
      this.world.pause();
    },
    resume() {
      this.world.resume();
    },
    add: {
      group: createGroup,
      staticGroup: createGroup,
      sprite: (gx = 0, gy = 0, key = '') => {
        const s = makeStatefulObject('sprite');
        s.setPosition(gx, gy);
        s.setTexture(key);
        return s;
      },
      existing: (o) => {
        if (o && !o.body) {
          o.body = makeStatefulObject('body').body;
        }
        return o;
      },
      collider: () => {},
      overlap: () => {},
    },
  };

  scene.add = {
    image: (gx = 0, gy = 0, key = '') => {
      const img = makeStatefulObject('image');
      img.setPosition(gx, gy);
      img.setTexture(key);
      return img;
    },
    graphics: () => makeStatefulObject('graphics'),
    sprite: (gx = 0, gy = 0, key = '') => {
      const s = makeStatefulObject('sprite');
      s.setPosition(gx, gy);
      s.setTexture(key);
      return s;
    },
    particles: withParticles ? () => makeStatefulObject('particles') : undefined,
    text: (gx = 0, gy = 0, txt = '') => {
      textFactoryCount++;
      const t = makeStatefulObject('text');
      t.setPosition(gx, gy);
      t.setText(txt);
      return t;
    },
    rectangle: (gx = 0, gy = 0, w = 4, h = 4) => {
      const r = makeStatefulObject('rect');
      r.setPosition(gx, gy);
      r.setSize(w, h);
      return r;
    },
    circle: (gx = 0, gy = 0) => {
      const c = makeStatefulObject('circle');
      c.setPosition(gx, gy);
      return c;
    },
    ellipse: (gx = 0, gy = 0) => {
      const el = makeStatefulObject('ellipse');
      el.setPosition(gx, gy);
      return el;
    },
    container: () => makeStatefulObject('container'),
    existing: (o) => o,
  };

  const animsEmitter = new EventEmitter();
  scene.anims = {
    exists: () => true,
    create: () => {},
    generateFrameNumbers: () => [],
    on: (e, cb) => animsEmitter.on(e, cb),
    off: (e, cb) => animsEmitter.off(e, cb),
    once: (e, cb) => animsEmitter.once(e, cb),
    emit: (e, ...a) => animsEmitter.emit(e, ...a),
    removeListener: (e, cb) => animsEmitter.removeListener(e, cb),
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

  scene.sound = { play: () => {}, stop: () => {}, mute: true };
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
    remove: () => {},
  };
  scene.sys.textures = scene.textures;

  return {
    scene,
    gameEmitter,
    activeTimers,
    repeatingEvents,
    activeTweens,
    getTextFactoryCount: () => textFactoryCount,
    getImageDestroyCount: () => imageDestroyCount,
    makeStatefulObject,
  };
}

test('Cycle 39.1: Pool reset callbacks restore alpha=1, scale=1, angle=0, scrollFactor=1, strokeStyle=0, clearTint after renderScorchDecal fade', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness();
  scene.create();

  assert.equal(scene.nameTagTextPool.capacity, POOL_PRESETS.OVERHEAD_TEXT);
  assert.equal(scene.intentBadgeTextPool.capacity, POOL_PRESETS.OVERHEAD_TEXT);

  const baselineGraphicsActive = scene.graphicsPool.activeCount;

  // renderScorchDecal fades decal.alpha -> 0 and releases back to LIFO graphicsPool
  renderScorchDecal(scene, 120, 120, 400);
  for (const tw of Array.from(activeTweens)) {
    if (tw.duration === 400) tw.complete();
  }
  assert.equal(scene.graphicsPool.activeCount, baselineGraphicsActive);

  // Immediately constructing OverheadUI acquires the exact Graphics slot that just faded to alpha=0
  const ui = new OverheadUI(scene, 'Chaser', 'enemy', 3);
  assert.equal(ui.hpGraphics.alpha, 1, 'Recycled Graphics from graphicsPool must have alpha restored to 1');
  ui.destroy();

  // Mutate transforms/tints/strokes across every GameScene pool and verify reset() cleans all state
  const poolsToVerify = [
    scene.circlePool,
    scene.rectPool,
    scene.graphicsPool,
    scene.spritePool,
    scene.shadowPool,
    scene.floatingTextPool,
    scene.nameTagTextPool,
    scene.intentBadgeTextPool,
  ];

  for (const pool of poolsToVerify) {
    const item = pool.acquire();
    item.setAlpha(0);
    item.setScale(3.5, 0.2);
    item.setAngle(137);
    item.setScrollFactor(0);
    item.setStrokeStyle(5, 0xff0000, 1);
    item.setTint(0x123456);
    pool.release(item);

    const recycled = pool.acquire();
    assert.strictEqual(recycled, item, 'LIFO ObjectPool must return the just-released slot');
    assert.equal(recycled.alpha, 1);
    assert.equal(recycled.scaleX, 1);
    assert.equal(recycled.scaleY, 1);
    assert.equal(recycled.angle, 0);
    assert.equal(recycled.scrollFactorX, 1);
    if (pool === scene.circlePool || pool === scene.rectPool) {
      assert.equal(recycled.strokeWidth, 0);
    }
    if (pool === scene.spritePool || pool === scene.shadowPool) {
      assert.equal(recycled.tint, null);
    }
    pool.release(recycled);
  }

  scene.shutdown();
  assert.equal(scene.nameTagTextPool, null);
  assert.equal(scene.intentBadgeTextPool, null);
});

test('Cycle 39.2: OverheadUI recycles nameTag & intentBadge via Zero-GC pools and safely falls back on exhaustion', () => {
  const { scene, getTextFactoryCount } = createStatefulGameSceneHarness();
  scene.create();

  const initialNameActive = scene.nameTagTextPool.activeCount;
  const initialBadgeActive = scene.intentBadgeTextPool.activeCount;
  const initialGraphicsActive = scene.graphicsPool.activeCount;
  const textCountAfterCreate = getTextFactoryCount();

  // 250 sequential entity spawn/death cycles -> ZERO new scene.add.text canvas allocations!
  for (let i = 0; i < 250; i++) {
    const ui = new OverheadUI(scene, `Enemy_${i}`, i % 2 === 0 ? 'enemy' : 'ally', 4);
    ui.setIntent('💣', true);
    ui.update(100 + (i % 50), 120, 3, 4);
    ui.destroy();
  }

  assert.equal(
    getTextFactoryCount(),
    textCountAfterCreate,
    '250 OverheadUI spawn/destroy cycles must allocate 0 new Text canvases'
  );
  assert.equal(scene.nameTagTextPool.activeCount, initialNameActive);
  assert.equal(scene.intentBadgeTextPool.activeCount, initialBadgeActive);
  assert.equal(scene.graphicsPool.activeCount, initialGraphicsActive);

  // Exhaustion stress: allocate 72 concurrent OverheadUIs (> capacity 64) and destroy all cleanly
  const concurrent = [];
  for (let i = 0; i < 72; i++) {
    const ui = new OverheadUI(scene, `Swarm_${i}`, 'enemy', 2);
    assert.ok(ui.nameTag, 'Fallback must create non-null nameTag even when pool is exhausted');
    assert.ok(ui.indicator, 'Fallback must create non-null indicator even when pool is exhausted');
    concurrent.push(ui);
  }
  for (const ui of concurrent) {
    ui.destroy();
  }
  assert.equal(scene.nameTagTextPool.activeCount, initialNameActive);
  assert.equal(scene.intentBadgeTextPool.activeCount, initialBadgeActive);

  scene.shutdown();
  assert.equal(scene.nameTagTextPool, null);
  assert.equal(scene.intentBadgeTextPool, null);
});

test('Cycle 39.3: resume-run-state releases prior AO/item shadows and sets row/col/aoShadow so restored blocks are destructible', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.create();

  // Clear auto-spawned entities to isolate block/item pool accounting
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  scene.spawnItem(1, 2, 'SPEED_UP');
  const shadowBeforeRestore = scene.shadowPool.activeCount;
  assert.ok(shadowBeforeRestore >= 1);

  // Build custom deterministic restored board with exactly 2 soft blocks at (2, 3) and (3, 3)
  const customMap = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return TILE_WALL;
      if (r % 2 === 0 && c % 2 === 0) return TILE_WALL;
      return TILE_EMPTY;
    })
  );
  customMap[2][3] = TILE_BLOCK;
  customMap[3][3] = TILE_BLOCK;

  gameEmitter.emit('resume-run-state', {
    meta: { wave: 3, score: 500 },
    board: { map: customMap, rows: ROWS, cols: COLS },
    activeItems: [{ row: 1, col: 1, itemType: 'FIRE_UP' }],
  });

  // Only player drop shadow + 1 restored item shadow should be active (old item shadow was released!)
  assert.equal(scene.blocks.getChildren().length, 2, 'Exactly 2 restored soft blocks must exist');
  const wallAoCount = scene.walls
    .getChildren()
    .filter((w) => Boolean(w.getData('aoShadow'))).length;
  assert.equal(
    scene.rectPool.activeCount,
    wallAoCount + 2,
    'rectPool activeCount must equal wall AO shadows + 2 restored block AO shadows (0 leaked)'
  );

  // Bomb blast destroying restored soft block (2, 3) MUST remove its sprite AND release its aoShadow!
  const origRandom = Math.random;
  Math.random = () => 0.99; // suppress random item drop for exact rectPool accounting
  try {
    // Use particle emitter stub so fallback rect debris isn't spawned during exact AO count check
    scene.blockDebrisEmitter = { explode: () => {}, destroy: () => {} };
    scene.destroyBlock(2, 3);
  } finally {
    Math.random = origRandom;
  }

  assert.equal(scene.map[2][3], TILE_EMPTY);
  assert.equal(scene.blocks.getChildren().length, 1, 'Restored soft block sprite must be destroyed');
  assert.equal(
    scene.rectPool.activeCount,
    wallAoCount + 1,
    'Destroying restored block must release its aoShadow back to rectPool'
  );

  scene.shutdown();
});

test('Cycle 39.4: spawnEnemies corridor carving releases aoShadow and generateMap cleans up floor decorations', () => {
  const { scene, getImageDestroyCount } = createStatefulGameSceneHarness();
  scene.create();

  // Regenerating map must destroy all previous floor images + decorations before creating new ones
  const destroyedBeforeRegen = getImageDestroyCount();
  scene.walls.clear(true, true);
  scene.blocks.clear(true, true);
  scene.generateMap();
  assert.ok(
    getImageDestroyCount() - destroyedBeforeRegen >= ROWS * COLS,
    'generateMap() must destroy all prior floor tile Images in mapDecorations'
  );

  // Prepare an enclosed empty tile at (5, 5) surrounded by 4 soft blocks with AO shadows
  scene.blocks.clear(true, true);
  scene.releaseGroupAoShadows(scene.walls);
  scene.rectPool.reset();

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      scene.map[r][c] = TILE_WALL;
    }
  }
  scene.map[5][5] = TILE_EMPTY;
  const neighbors = [
    [5, 4],
    [5, 6],
    [4, 5],
    [6, 5],
  ];
  for (const [nr, nc] of neighbors) {
    scene.map[nr][nc] = TILE_BLOCK;
    const blk = scene.blocks.create(nc * TILE_SIZE + 20, nr * TILE_SIZE + 20, 'block');
    blk.setData('row', nr);
    blk.setData('col', nc);
    const ao = scene.rectPool.acquire();
    blk.setData('aoShadow', ao);
  }
  assert.equal(scene.rectPool.activeCount, 4);

  scene.spawnEnemies(1);
  assert.equal(
    scene.rectPool.activeCount,
    2,
    'Carving 2 neighbor soft blocks in spawnEnemies must release 2 aoShadows back to rectPool'
  );

  scene.shutdown();
});

test('Cycle 39.5: explodeBomb re-entrant Zero-GC scratchChainStack + VFX interruption reclamation on tweens.killAll()', () => {
  const { scene } = createStatefulGameSceneHarness({ withParticles: false });
  scene.create();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);
  scene.blocks.clear(true, true);

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (!(r % 2 === 0 && c % 2 === 0)) {
        scene.map[r][c] = TILE_EMPTY;
      }
    }
  }
  // Place 1 soft block at (1, 5) so fallback debris rect tweens are also exercised
  scene.map[1][5] = TILE_BLOCK;
  const blk = scene.blocks.create(5 * TILE_SIZE + 20, 1 * TILE_SIZE + 20, 'block');
  blk.setData('row', 1);
  blk.setData('col', 5);

  const makeBomb = (id, r, c) => {
    const b = scene.bombs.get(c * TILE_SIZE + 20, r * TILE_SIZE + 20, 'bomb');
    b.setActive(true).setVisible(true);
    b.setData('id', id);
    b.setData('owner', 'player');
    b.setData('power', 3);
    return b;
  };

  const b1 = makeBomb('b_epicenter_1', 1, 2);
  const b2 = makeBomb('b_epicenter_stacked', 1, 2);
  const b3 = makeBomb('b_ray_chain_1', 1, 3);
  const b4 = makeBomb('b_ray_chain_2', 1, 4);
  scene.activeBombs = 4;

  scene.explodeBomb(b1, 1, 2);

  assert.equal(b1.active, false);
  assert.equal(b2.active, false, 'Same-tile stacked bomb must detonate via scratchChainStack');
  assert.equal(b3.active, false, 'Ray-chained bomb 1 must detonate via scratchChainStack');
  assert.equal(b4.active, false, 'Nested ray-chained bomb 2 must detonate via re-entrant scratchChainStack');
  assert.equal(scene.scratchChainStackTop, 0, 'scratchChainStackTop must unwind to 0');
  for (let i = 0; i < scene.scratchChainStack.length; i++) {
    assert.equal(scene.scratchChainStack[i], null, 'scratchChainStack slots must be nulled to prevent retention');
  }

  // Also trigger shield shatter, Second Wind, dash ghosts, item glow, and Nuclear Barrage warheads, then killAll tweens!
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.isInvulnerable = false;
  scene.playerDie();

  scene.isInvulnerable = false;
  scene.extraLives = 1;
  scene.playerDie();

  scene.spawnItem(3, 3, 'BOMB_UP');
  scene.ultimateGauge = 100;
  scene.isUltimateReady = true;
  scene.ultimateLockoutRemaining = 0;
  scene.triggerUltimate('NUCLEAR_BARRAGE');

  // Interrupt all active tweens mid-flight (simulating wave reset / sudden transition)
  scene.tweens.killAll();

  assert.equal(scene.circlePool.activeCount, 0, 'All sparks, glows, and warheads must release on tweens.killAll()');
  assert.equal(scene.graphicsPool.activeCount, 0, 'All shockwave Graphics must release on tweens.killAll()');
  const activeExplosions = scene.explosions.getChildren().filter((e) => e.active);
  assert.equal(activeExplosions.length, 0, 'All explosion sprites must disableBody on tweens.killAll()');

  scene.shutdown();
});

test('Cycle 39.6: Magnet & PetDroneAlly kill infinite bobbing tween and synchronize itemShadow + physics body', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness();
  scene.create();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  scene.player.setPosition(60, 60);
  scene.spawnItem(1, 3, 'FIRE_UP'); // (140, 60) -> 80px from player (inside 120px magnet radius)
  const item = scene.items.getChildren()[0];
  const shadow = item.getData('itemShadow');
  assert.ok(item && shadow);

  // Complete only the glow tween so only infinite bobbing tweens remain on item & shadow
  const itemTweensBefore = Array.from(activeTweens).filter((tw) => tw.targets === item || tw.targets === shadow);
  assert.equal(itemTweensBefore.length, 2, 'spawnItem attaches bobbing tweens to item and itemShadow');

  scene.hasMagnet = true;
  scene.update(1100, 16);

  const itemTweensAfter = Array.from(activeTweens).filter((tw) => tw.targets === item || tw.targets === shadow);
  assert.equal(itemTweensAfter.length, 0, 'Magnet pull must kill conflicting infinite bobbing tweens');
  assert.equal(item.getData('bobTweenKilled'), true);
  assert.equal(shadow.x, item.x, 'itemShadow.x must track magnetized item.x');
  assert.equal(shadow.y, item.y + 14, 'itemShadow.y must track magnetized item.y + 14');
  assert.equal(item.body.position.x, item.x - item.body.halfWidth, 'item.body.position.x must sync with Magnet');

  // Verify PetDroneAlly tractor beam also kills bobbing tweens on newly spawned item
  scene.hasMagnet = false;
  scene.items.clear(true, true);
  scene.spawnItem(2, 3, 'SPEED_UP');
  const droneItem = scene.items.getChildren()[0];
  const droneShadow = droneItem.getData('itemShadow');
  const drone = new PetDroneAlly(scene, 100, 100);
  drone.updateAI(16, 1200, scene.player, [droneItem], []);

  const droneItemTweensAfter = Array.from(activeTweens).filter(
    (tw) => tw.targets === droneItem || tw.targets === droneShadow
  );
  assert.equal(droneItemTweensAfter.length, 0, 'PetDroneAlly tractor beam must kill bobbing tweens');
  assert.equal(droneShadow.x, droneItem.x);
  assert.equal(droneShadow.y, droneItem.y + 14);
  drone.destroy();

  scene.shutdown();
});

test('Cycle 39.7: renderMeteorReticle guards 0ms/NaN warningMs against 0/0 NaN pool leaks & Nuclear Barrage guards isGameOver', () => {
  const { scene, repeatingEvents, activeTimers } = createStatefulGameSceneHarness();
  scene.create();

  for (const badWarning of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
    const before = scene.graphicsPool.activeCount;
    renderMeteorReticle(scene, 120, 120, badWarning);
    assert.equal(scene.graphicsPool.activeCount, before + 1);
    const ev = repeatingEvents.pop();
    assert.ok(ev);
    ev.callback();
    assert.equal(
      scene.graphicsPool.activeCount,
      before,
      `renderMeteorReticle(${badWarning}) must release Graphics on first tick without NaN leak`
    );
  }

  // Nuclear barrage delayedCall must NOT detonate blocks/spawn explosions if isGameOver became true
  scene.ultimateGauge = 100;
  scene.isUltimateReady = true;
  scene.ultimateLockoutRemaining = 0;
  scene.triggerUltimate('NUCLEAR_BARRAGE');
  scene.isGameOver = true;

  for (const t of activeTimers) {
    t.callback();
  }
  assert.equal(scene.circlePool.activeCount, 0, 'Warheads must release even when isGameOver aborts detonation');
  const activeExps = scene.explosions.getChildren().filter((e) => e.active);
  assert.equal(activeExps.length, 0, 'No Nuclear Barrage explosions may spawn during Game Over');

  scene.shutdown();
});

test('Cycle 39.8: RelicManager Zero-GC scratch reference identity across all 13 runtime hooks + 2-slot Crisis auto-equip + 10k-frame soak', () => {
  const rm = new RelicManager(2);
  rm.equipRelic(RelicId.SOLAR_CAPACITOR);
  assert.equal(rm.getEquippedCount(), 1);
  assert.equal(rm.getMaxSlots(), 2);

  const enemies = [
    { id: 'e1', r: 5, c: 6 },
    { id: 'e2', r: 6, c: 5 },
  ];
  const tile = { r: 5, c: 5 };

  // Reference identity check across every runtime hook (Zero-GC contract)
  assert.strictEqual(rm.update(16, 1000, 20, true), rm.update(16, 1016, 20, true));
  assert.strictEqual(rm.onEnemyKilled(1000), rm.onEnemyKilled(1600));
  assert.strictEqual(rm.onBombPlaced(tile, enemies, 1000), rm.onBombPlaced(tile, enemies, 1600));
  assert.strictEqual(rm.onBombExploded(tile, 1000), rm.onBombExploded(tile, 1600));
  assert.strictEqual(rm.onWallBounce(tile, enemies, 1000), rm.onWallBounce(tile, enemies, 1600));
  assert.strictEqual(rm.onBombKicked(1000), rm.onBombKicked(1600));

  // Verify Pyroclastic Prism triggered & suppressed results are frozen Zero-GC singletons that never corrupt stored arrays
  rm.equipRelic(RelicId.PYROCLASTIC_PRISM);
  assert.equal(rm.getEquippedCount(), 2);
  const storedExplosions = [
    rm.onBombExploded(tile, 2000),
    rm.onBombExploded(tile, 2000),
    rm.onBombExploded(tile, 2600),
  ];
  assert.equal(storedExplosions[0].spawnDiagonalShards, true);
  assert.equal(storedExplosions[1].spawnDiagonalShards, false);
  assert.strictEqual(storedExplosions[0], storedExplosions[2], 'Triggered Pyroclastic result reuses frozen singleton');
  rm.unequipRelic(RelicId.PYROCLASTIC_PRISM);
  assert.strictEqual(
    rm.onBombDetonationPsionicPulse(5, 5, enemies, true, 25, 1000),
    rm.onBombDetonationPsionicPulse(5, 5, enemies, true, 25, 1600)
  );
  assert.strictEqual(
    rm.onBombDetonationOrbitalTargeting(5, 5, 1000),
    rm.onBombDetonationOrbitalTargeting(5, 5, 1600)
  );
  assert.strictEqual(
    rm.onBombDetonationQuantumWarp(5, 5, enemies, 1000),
    rm.onBombDetonationQuantumWarp(5, 5, enemies, 1600)
  );
  assert.strictEqual(
    rm.onBombDetonationCryoGlacial(5, 5, enemies, 1000),
    rm.onBombDetonationCryoGlacial(5, 5, enemies, 1600)
  );
  assert.strictEqual(
    rm.onBombDetonationTeslaCoil(5, 5, enemies, 1000),
    rm.onBombDetonationTeslaCoil(5, 5, enemies, 1600)
  );
  assert.strictEqual(
    rm.onBombDetonationMiasmicFlask(5, 5, enemies, 1000),
    rm.onBombDetonationMiasmicFlask(5, 5, enemies, 1600)
  );
  assert.strictEqual(
    rm.onBombDetonationAbyssalPearl(5, 5, enemies, 1000),
    rm.onBombDetonationAbyssalPearl(5, 5, enemies, 1600)
  );

  // BossAttackManager NaN / negative dt & 0ms telegraph immunity
  const bam = new BossAttackManager();
  bam.spawnProjectile(200, 200, 100, 0, 8, 1, 500);
  bam.spawnShockwave(200, 200, 120, 200, 1);
  const tg = bam.spawnTelegraphTile(4, 4, 0);
  assert.ok(tg);
  bam.update(Number.NaN, 50, 50, () => {});
  bam.update(-50, Number.NaN, Number.NaN, () => {});
  assert.equal(bam.projectilePool.activeCount, 1, 'NaN/negative dt must not corrupt projectile into premature/eternal NaN');
  bam.update(600, 50, 50, () => {});
  assert.equal(bam.projectilePool.activeCount, 0, 'Projectile expires cleanly once valid dt elapses');
  assert.equal(bam.shockwavePool.activeCount, 0, 'Shockwave expires cleanly once valid dt elapses');
  assert.equal(bam.telegraphPool.activeCount, 0, '0ms telegraph expires cleanly without 0/0 NaN tier');
  bam.destroy();

  // OrbitalCrisis Zero-GC crater pool reuse across 10,000 frames + Crisis counters + SplitterEnemy Zero-GC split
  const orbital = new OrbitalCrisis();
  orbital.init();
  orbital.setStage(CrisisStage.OUTBREAK);
  const firstCraterRef = orbital.pendingCraters[0];
  assert.ok(firstCraterRef);

  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.setStage(CrisisStage.CLIMAX);
  voidCrisis.update(16);

  const clockwork = new ClockworkCrisis();
  clockwork.init();
  clockwork.setStage(CrisisStage.CLIMAX);
  clockwork.update(16);

  const rift = new RiftCrisis();
  rift.init();
  rift.setStage(CrisisStage.CLIMAX);
  rift.update(16);

  const solar = new SolarFlareCrisis();
  solar.init();
  solar.setStage(CrisisStage.CLIMAX);
  solar.update(16);

  const rmSoak = new RelicManager([RelicId.ORBITAL_TARGETING_CORE, RelicId.MAGNETRON_DIAL], 2);
  for (let frame = 0; frame < 10000; frame++) {
    const now = 2000 + frame * 16;
    rmSoak.update(16, now, 25, frame % 2 === 0);
    if (frame % 40 === 0) {
      const strike = rmSoak.onBombDetonationOrbitalTargeting(5, 5, now);
      assert.equal(strike.targetTiles.length, 5);
    }
    orbital.update(16);
  }
  orbital.reset();
  assert.equal(orbital.pendingCraters.length, 0);

  // SplitterEnemy Zero-GC death split attaches drop shadows when scene provides attachEntityDropShadow
  const { scene } = createStatefulGameSceneHarness();
  scene.create();
  scene.enemies.clear(true, true);
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      scene.map[r][c] = TILE_EMPTY;
    }
  }
  let attachedShadows = 0;
  const origAttach = scene.attachEntityDropShadow.bind(scene);
  scene.attachEntityDropShadow = (ent, sc) => {
    attachedShadows++;
    return origAttach(ent, sc);
  };
  const splitter = new SplitterEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.enemies.add(splitter);
  splitter.takeDamage(999, 'player', 5000);
  assert.equal(splitter.spawnedMinis.length, 2);
  assert.equal(attachedShadows, 2, 'Both spawned MiniSplitterEnemies must receive pooled drop shadows');

  scene.shutdown();
});
