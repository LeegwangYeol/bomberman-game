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
const {
  MultiTouchPointerTracker,
  createDefaultMobileInputState,
} = await import('../src/game/input_state.ts');
const {
  HazardRenderer,
  DynamicHazard,
  MagmaHazard,
  MagmaLifecycleState,
} = await import('../src/game/hazards/index.ts');
const {
  ChaserEnemy,
  BomberEnemy,
  TankEnemy,
  GhostEnemy,
  SplitterEnemy,
  MiniSplitterEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');
const { MerchantNPC } = await import('../src/game/entities/NeutralEntities.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  FlatHazardMask,
} = await import('../src/game/pathfinding.ts');
const {
  BossProjectileType,
  BossState,
  BossAttackManager,
  HamsterBoss,
  QueenBeeBoss,
} = await import('../src/game/bosses/index.ts');
const {
  CrisisStage,
  CrisisType,
  SolarFlareCrisis,
  OrbitalCrisis,
  ClockworkCrisis,
  RiftCrisis,
  VoidCrisis,
  LavaCrisis,
  PsychicCrisis,
} = await import('../src/game/crises/index.ts');
const { GameModeType } = await import('../src/game/progression/index.ts');
const {
  GameStatePersistence,
  MemoryStorageAdapter,
} = await import('../src/game/persistence/GameStatePersistence.ts');

function createOpenArenaMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        row.push(TILE_WALL);
      } else if (r % 2 === 0 && c % 2 === 0) {
        row.push(TILE_WALL);
      } else {
        row.push(TILE_EMPTY);
      }
    }
    map.push(row);
  }
  return map;
}

function createCorridorOpenMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        row.push(TILE_WALL);
      } else {
        row.push(TILE_EMPTY);
      }
    }
    map.push(row);
  }
  return map;
}

function createStatefulGameSceneHarness({ recordDrawCalls = true } = {}) {
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
  scene.scene = {
    restart: () => {},
    isActive: () => true,
  };

  const activeTimers = [];
  const repeatingEvents = [];
  const overlapHandlers = [];
  const graphicsFillAlphas = [];
  const floatingTexts = [];
  const tweenConfigs = [];

  scene.time = {
    now: 1000,
    delayedCall: (delayMs, callback) => {
      const timer = {
        delayMs,
        callback,
        paused: false,
        removed: false,
        getRemaining() {
          return this.delayMs;
        },
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
    removeEvent: (ev) => {
      if (ev) ev.removed = true;
    },
    removeAllEvents: () => {
      activeTimers.length = 0;
      repeatingEvents.length = 0;
    },
  };

  const activeTweens = new Set();
  scene.tweens = {
    add: (cfg = {}) => {
      if (recordDrawCalls) tweenConfigs.push(cfg);
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
              if (t && typeof cfg.x === 'number') t.x = cfg.x;
              if (t && typeof cfg.y === 'number') t.y = cfg.y;
              if (t && typeof cfg.alpha === 'number') t.alpha = cfg.alpha;
            }
          }
          if (typeof this.onUpdate === 'function') this.onUpdate(this);
          if (typeof this.onYoyo === 'function') this.onYoyo(this);
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
      const ch = {
        ...cfg,
        paused: false,
        stopped: false,
        pause() {
          this.paused = true;
        },
        resume() {
          this.paused = false;
        },
        stop() {
          this.stopped = true;
          activeTweens.delete(this);
        },
      };
      activeTweens.add(ch);
      return ch;
    },
    killTweensOf: (target) => {
      for (const tw of activeTweens) {
        const hit = Array.isArray(tw.targets) ? tw.targets.includes(target) : tw.targets === target;
        if (hit) {
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
  };

  const makeStatefulObject = (kind = 'generic') => {
    const data = new Map();
    const listeners = new EventEmitter();
    const body = {
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      halfWidth: 16,
      halfHeight: 16,
      right: 32,
      bottom: 32,
      enable: true,
      immovable: false,
      moves: true,
      velocity: { x: 0, y: 0 },
      position: { x: 0, y: 0 },
      center: { x: 16, y: 16 },
      stop() {
        this.velocity.x = 0;
        this.velocity.y = 0;
        return this;
      },
      updateCenter() {
        this.center.x = this.position.x + this.halfWidth;
        this.center.y = this.position.y + this.halfHeight;
      },
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

    return {
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
      fillColor: 0xffffff,
      fillAlpha: 1,
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
      clearCount: 0,
      drawCalls: [],
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
      setFillStyle(color, alpha = 1) {
        if (typeof color === 'number') this.fillColor = color;
        this.fillAlpha = alpha;
        if (recordDrawCalls) {
          graphicsFillAlphas.push({ color, alpha });
        }
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
        this.frame.name = f;
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
        if (recordDrawCalls && this.text.length > 0) {
          floatingTexts.push(this.text);
        }
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
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;
        if (disableGameObject) this.active = false;
        if (hideGameObject) this.visible = false;
        return this;
      },
      clear() {
        this.clearCount++;
        this.drawCalls.length = 0;
        return this;
      },
      lineStyle(width, color, alpha = 1) {
        if (recordDrawCalls) this.drawCalls.push({ op: 'lineStyle', width, color, alpha });
        return this;
      },
      fillStyle(color, alpha = 1) {
        this.fillColor = color;
        this.fillAlpha = alpha;
        if (recordDrawCalls) {
          graphicsFillAlphas.push({ color, alpha });
          this.drawCalls.push({ op: 'fillStyle', color, alpha });
        }
        return this;
      },
      fillRect(rx, ry, rw, rh) {
        if (recordDrawCalls) {
          this.drawCalls.push({ op: 'fillRect', rx, ry, rw, rh, color: this.fillColor, alpha: this.fillAlpha });
        }
        return this;
      },
      fillRoundedRect(rx, ry, rw, rh, radius) {
        if (recordDrawCalls) {
          this.drawCalls.push({ op: 'fillRoundedRect', rx, ry, rw, rh, radius, color: this.fillColor, alpha: this.fillAlpha });
        }
        return this;
      },
      strokeRect(rx, ry, rw, rh) {
        if (recordDrawCalls) this.drawCalls.push({ op: 'strokeRect', rx, ry, rw, rh });
        return this;
      },
      strokeRoundedRect() {
        return this;
      },
      fillCircle(cx, cy, cr) {
        if (recordDrawCalls) {
          this.drawCalls.push({ op: 'fillCircle', cx, cy, cr, color: this.fillColor, alpha: this.fillAlpha });
        }
        return this;
      },
      strokeCircle(cx, cy, cr) {
        if (recordDrawCalls) this.drawCalls.push({ op: 'strokeCircle', cx, cy, cr });
        return this;
      },
      lineBetween(x1, y1, x2, y2) {
        if (recordDrawCalls) this.drawCalls.push({ op: 'lineBetween', x1, y1, x2, y2 });
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
        if (recordDrawCalls) this.drawCalls.push({ op: 'fillPath', color: this.fillColor, alpha: this.fillAlpha });
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
        listeners.emit('destroy', this);
        if (this._parentGroup) {
          const idx = this._parentGroup.indexOf(this);
          if (idx !== -1) this._parentGroup.splice(idx, 1);
        }
      },
    };
  };

  const createGroup = () => {
    const children = [];
    return {
      create(gx = 0, gy = 0, key = '') {
        const o = makeStatefulObject('sprite');
        o.setPosition(gx, gy);
        o.body.reset(gx, gy);
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
            o.body.reset(gx, gy);
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
      this.world.isPaused = true;
    },
    resume() {
      this.world.isPaused = false;
    },
    add: {
      group: createGroup,
      staticGroup: createGroup,
      sprite: (gx = 0, gy = 0, key = '') => {
        const s = makeStatefulObject('sprite');
        s.setPosition(gx, gy);
        s.body.reset(gx, gy);
        s.setTexture(key);
        return s;
      },
      existing: (o) => {
        if (o && !o.body) {
          o.body = makeStatefulObject('body').body;
          o.body.reset(o.x ?? 0, o.y ?? 0);
        }
        return o;
      },
      collider: () => {},
      overlap: (objA, objB, cb) => {
        overlapHandlers.push({ objA, objB, cb });
      },
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
    particles: undefined,
    text: (gx = 0, gy = 0, txt = '') => {
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
      createCursorKeys: () => ({
        up: { isDown: false, timeDown: 0 },
        down: { isDown: false, timeDown: 0 },
        left: { isDown: false, timeDown: 0 },
        right: { isDown: false, timeDown: 0 },
      }),
      addKeys: () => ({}),
      addKey: () => ({ isDown: false, _justDown: false, reset: () => {} }),
      resetKeys: () => {},
      removeAllKeys: () => {},
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
    overlapHandlers,
    graphicsFillAlphas,
    floatingTexts,
    tweenConfigs,
    activeTweens,
  };
}

test('Cycle 49.1: Zero-GC multi-touch MultiTouchPointerTracker pointer release/cancel/recovery & HazardRenderer non-occlusion ceiling (alpha <= 0.40)', () => {
  const controller = new MultiTouchPointerTracker({ deadzone: 5 });
  const state = createDefaultMobileInputState();

  const origArrayFrom = Array.from;
  let arrayFromCalled = false;
  Array.from = function (...args) {
    arrayFromCalled = true;
    return origArrayFrom.apply(this, args);
  };

  try {
    // 3 simultaneous fingers on joystick: release/cancel/recover while remaining finger resyncs
    controller.onPointerDown(1, 'joystick', state, { x: 100, y: 100 }, undefined, 1000);
    controller.onPointerMove(1, { x: 140, y: 100 }, state, { x: 100, y: 100 }, 1010);
    assert.equal(state.right, true);

    controller.onPointerDown(2, 'joystick', state, { x: 100, y: 100 }, undefined, 1020);
    controller.onPointerMove(2, { x: 60, y: 100 }, state, { x: 100, y: 100 }, 1030);
    assert.equal(state.left, true);

    controller.onPointerDown(3, 'joystick', state, { x: 100, y: 100 }, undefined, 1040);
    controller.onPointerMove(3, { x: 100, y: 60 }, state, { x: 100, y: 100 }, 1050);
    assert.equal(state.up, true);

    // Release pointer 3 -> must resync to pointer 2 (left) with zero Array.from calls
    controller.onPointerUp(3, state);
    assert.equal(state.left, true, 'onPointerUp must resync joystick direction to last remaining pointer');
    assert.equal(state.up, false);

    // Cancel pointer 2 -> must resync to pointer 1 (right) with zero Array.from calls
    controller.onPointerCancel(2, state);
    assert.equal(state.right, true, 'onPointerCancel must resync joystick direction to remaining pointer');
    assert.equal(state.left, false);

    // Add newer pointer 4 (down) and prune dropped pointer 1 via recoverDroppedPointers
    controller.onPointerDown(4, 'joystick', state, { x: 100, y: 100 }, undefined, 5000);
    controller.onPointerMove(4, { x: 100, y: 145 }, state, { x: 100, y: 100 }, 5010);
    const recovered = controller.recoverDroppedPointers(state, 3000, 5100);
    assert.equal(recovered, 1);
    assert.equal(state.down, true, 'recoverDroppedPointers must resync remaining active joystick pointer');

    // Re-targeting active pointer 4 from joystick to bomb while pointer 5 holds joystick
    controller.onPointerDown(5, 'joystick', state, { x: 100, y: 100 }, undefined, 5110);
    controller.onPointerMove(5, { x: 60, y: 100 }, state, { x: 100, y: 100 }, 5120);
    controller.onPointerDown(4, 'bomb', state, { x: 500, y: 400 }, undefined, 5130);
    assert.equal(state.left, true, 'releasePointerFromTarget must resync remaining joystick pointer');
    assert.equal(arrayFromCalled, false, 'MultiTouchPointerTracker multi-touch resync must never allocate via Array.from');
  } finally {
    Array.from = origArrayFrom;
  }

  // Verify HazardRenderer non-occlusion ceiling (<= 0.40) on DynamicHazard code=3 (Polarized Spire safe zone) & MagmaHazard code=3 (Obsidian Crust)
  const { scene, graphicsFillAlphas } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const map = createOpenArenaMap();

  const dyn = new DynamicHazard();
  dyn.init(map);
  dyn.start('OUTBREAK');
  dyn.update(2100); // advance past 2000ms COOLDOWN warmup into TELEGRAPH
  const spires = dyn.getSpires();
  assert.ok(spires.length > 0);
  dyn.onBombBlastImpact(spires[0].r, spires[0].c); // polarizes spire -> sets dangerGrid code=3 in 3x3 safe zone

  const magma = new MagmaHazard();
  magma.init(6, 7);
  magma.state = MagmaLifecycleState.MAGMA_TELEGRAPH;
  magma.update(100);
  // Quench center magma tile into solidified obsidian crust (dangerMask code === 3)
  magma.onBombBlastImpact(6, 7);
  const magmaIndices = magma.getActiveMagmaIndices();
  if (magma.getActiveMagmaCount() > 0 && magma.dangerMask[magmaIndices[0]] !== 3) {
    magma.dangerMask[magmaIndices[0]] = 3;
  }

  graphicsFillAlphas.length = 0;
  const g = scene.add.graphics();
  HazardRenderer.render(
    g,
    {
      dynamicHazard: dyn,
      magmaHazard: magma,
    },
    Math.PI * 60
  );

  const polarizedFills = graphicsFillAlphas.filter((e) => e.color === 0xfacc15);
  const obsidianFills = graphicsFillAlphas.filter((e) => e.color === 0x312e81);
  assert.ok(polarizedFills.length > 0, 'Polarized Spire safe zone fill must render');
  assert.ok(obsidianFills.length > 0, 'Magma Obsidian Crust safe tile fill must render');
  for (const entry of polarizedFills) {
    assert.ok(entry.alpha <= 0.40, `Polarized Spire safe tile alpha (${entry.alpha}) must stay <= 0.40`);
  }
  for (const entry of obsidianFills) {
    assert.ok(entry.alpha <= 0.40, `Magma Obsidian Crust alpha (${entry.alpha}) must stay <= 0.40`);
  }

  scene.shutdown();
});

test('Cycle 49.2: All-7-Crises Zero-GC objective slot reuse & complete omitted-extraState stale-field scrubbing', () => {
  const crises = [
    new SolarFlareCrisis(),
    new OrbitalCrisis(),
    new ClockworkCrisis(),
    new RiftCrisis(),
    new VoidCrisis(),
    new LavaCrisis(),
    new PsychicCrisis(),
  ];

  // 1. Verify pre-allocated objective slot reuse across init() -> mutate -> reset() -> init()
  for (const crisis of crises) {
    crisis.init();
    assert.ok(crisis.objectives.length >= 1);
    const slot0Ref = crisis.objectives[0];
    const slot1Ref = crisis.objectives[1];
    slot0Ref.currentCount = 99;
    slot0Ref.isCompleted = true;
    crisis.reset();
    crisis.init();
    assert.strictEqual(
      crisis.objectives[0],
      slot0Ref,
      `${crisis.constructor.name} must reuse pre-allocated objective[0] slot across init/reset`
    );
    assert.equal(crisis.objectives[0].currentCount, 0);
    assert.equal(crisis.objectives[0].isCompleted, false);
    if (slot1Ref) {
      assert.strictEqual(
        crisis.objectives[1],
        slot1Ref,
        `${crisis.constructor.name} must reuse pre-allocated objective[1] slot across init/reset`
      );
    }
  }

  // 2. Verify omitted extraState (undefined) scrubs all subclass scalar & pool fields to clean defaults
  const solar = crises[0];
  solar.cmeTimerMs = 9500;
  solar.cmeSweepRemainingMs = 800;
  solar.sweepsSurvivedCount = 5;
  solar.vents[0].isCooled = true;
  solar.deserialize({ ...solar.serialize(), extraState: undefined });
  assert.equal(solar.cmeTimerMs, 0);
  assert.equal(solar.cmeSweepRemainingMs, 0);
  assert.equal(solar.sweepsSurvivedCount, 0);
  assert.equal(solar.vents[0].isCooled, false);

  const orbital = crises[1];
  orbital.salvoTimerMs = 4200;
  orbital.salvosEvadedCount = 3;
  orbital.macrocannonCharge = 88;
  orbital.uplinks[0].isOverridden = true;
  orbital.deserialize({ ...orbital.serialize(), extraState: undefined });
  assert.equal(orbital.salvoTimerMs, 0);
  assert.equal(orbital.salvosEvadedCount, 0);
  assert.equal(orbital.macrocannonCharge, 0);
  assert.equal(orbital.uplinks[0].isOverridden, false);

  const clockwork = crises[2];
  clockwork.empTimerMs = 11000;
  clockwork.isEmpWarningActive = true;
  clockwork.totalEmpPulsesFired = 4;
  clockwork.overloadWindowTimerMs = 900;
  clockwork.isOverloadWindowActive = true;
  clockwork.conduits[0].isHit = true;
  clockwork.deserialize({ ...clockwork.serialize(), stage: CrisisStage.OUTBREAK, extraState: undefined });
  assert.equal(clockwork.empTimerMs, 0);
  assert.equal(clockwork.isEmpWarningActive, false);
  assert.equal(clockwork.totalEmpPulsesFired, 0);
  assert.equal(clockwork.overloadWindowTimerMs, 0);
  assert.equal(clockwork.isOverloadWindowActive, false);
  assert.equal(clockwork.conduits[0].isHit, false);

  const rift = crises[3];
  rift.spires[0].isPolarized = true;
  rift.spires[1].isPolarized = true;
  rift.isQuantumSyncActive = true;
  rift.quantumSyncTimerMs = 1400;
  rift.warpsPerformedCount = 7;
  rift.deserialize({ ...rift.serialize(), stage: CrisisStage.CLIMAX, extraState: undefined });
  assert.equal(rift.spires.every((s) => s.isPolarized === false), true, 'RiftCrisis must scrub stale polarized spires when extraState is omitted');
  assert.equal(rift.isQuantumSyncActive, false);
  assert.equal(rift.warpsPerformedCount, 0);

  const voidCrisis = crises[4];
  voidCrisis.voidCreepCount = 45;
  voidCrisis.creepTimerMs = 3100;
  voidCrisis.avatarHp = 1;
  voidCrisis.avatarShieldActive = false;
  voidCrisis.supernovaCleansed = true;
  voidCrisis.prisms[0].isCharged = true;
  voidCrisis.deserialize({ ...voidCrisis.serialize(), stage: CrisisStage.OUTBREAK, extraState: undefined });
  assert.equal(voidCrisis.voidCreepCount, 0);
  assert.equal(voidCrisis.creepTimerMs, 0);
  assert.equal(voidCrisis.avatarHp, 3);
  assert.equal(voidCrisis.avatarShieldActive, true);
  assert.equal(voidCrisis.supernovaCleansed, false);
  assert.equal(voidCrisis.prisms[0].isCharged, false);

  const lava = crises[5];
  lava.lavaAdvanceTimerMs = 7000;
  lava.currentLavaRing = 4;
  lava.lavaTilesCount = 30;
  lava.obsidianSolidifiedCount = 6;
  lava.isCalderaSealed = true;
  lava.deserialize({ ...lava.serialize(), extraState: undefined });
  assert.equal(lava.lavaAdvanceTimerMs, 0);
  assert.equal(lava.currentLavaRing, 1);
  assert.equal(lava.lavaTilesCount, 0);
  assert.equal(lava.obsidianSolidifiedCount, 0);
  assert.equal(lava.isCalderaSealed, false);

  const psychic = crises[6];
  psychic.manifestations[0].isDestroyed = true;
  psychic.phantomTimerMs = 3300;
  psychic.pulseTimerMs = 2200;
  psychic.deserialize({ ...psychic.serialize(), extraState: undefined });
  assert.equal(psychic.manifestations[0].isDestroyed, false, 'PsychicCrisis must reset manifestationPool when extraState is omitted');
  assert.equal(psychic.phantomTimerMs, 0);
  assert.equal(psychic.pulseTimerMs, 0);
});

test('Cycle 49.3: Zero-GC Enemy BFS Waypoint Advancement (steerAlongPath / shiftCoordPathInPlace without sub-recalc oscillation)', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const map = createCorridorOpenMap();
  const emptyHazards = new FlatHazardMask(ROWS * COLS);

  // Place player down an L-shaped corridor: enemy at (1, 1) -> waypoint (1, 2) -> (1, 3) -> ... -> (3, 3)
  map[2][1] = TILE_WALL;
  map[2][2] = TILE_WALL;
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);

  const archetypes = [
    new ChaserEnemy(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20),
    new BomberEnemy(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20),
    new TankEnemy(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20),
    new GhostEnemy(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20),
    new SplitterEnemy(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20),
    new MiniSplitterEnemy(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20),
  ];

  for (const enemy of archetypes) {
    // Frame 1 (dt=16ms): computes BFS path [(1, 2), (1, 3), (2, 3), (3, 3)], pathRecalcTimer becomes > 160ms
    enemy.updateAI(16, 1000, scene.player, map, emptyHazards);
    assert.ok(enemy.body.velocity.x > 0, `${enemy.constructor.name} must steer East toward first waypoint (1, 2)`);

    // Simulate enemy reaching waypoint (1, 2) center + 1px overshoot BEFORE pathRecalcTimer expires
    enemy.setPosition(2 * TILE_SIZE + 21, 1 * TILE_SIZE + 20);
    enemy.updateAI(16, 1016, scene.player, map, emptyHazards);

    // Without shiftCoordPathInPlace, dx to (1, 2) would be -1 and velocity.x would flip NEGATIVE!
    // With steerAlongPath, (1, 2) is shifted in-place and enemy steers immediately toward (1, 3) (positive vx)!
    assert.ok(
      enemy.body.velocity.x > 0,
      `${enemy.constructor.name} must shift reached waypoint (1, 2) in-place and continue East toward (1, 3) without oscillating backward`
    );
  }

  scene.shutdown();
});

test('Cycle 49.4: Remaining Perks & Economy (hazard_buffer on applyStompSlow, dash_decoy 1.5s taunt lure, MerchantNPC discount trade, & relic_resonance drops)', () => {
  const { scene, gameEmitter, activeTweens } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();

  // Clear default spawns
  scene.enemies.clear(true, true);
  for (const a of scene.allies.getChildren()) scene.safeDisableSpriteBody(a);
  for (const n of scene.neutrals.getChildren()) scene.safeDisableSpriteBody(n);

  // 1. hazard_buffer Lv2 (80% groundSlowdownReduction) mitigates applyStompSlow (35% -> 7%)
  scene.playerSpeed = 200;
  scene.applyStompSlow(0.35, 1000);
  assert.equal(scene.playerSpeed, 130, 'Unmitigated 35% stomp/void-creep slow reduces 200 speed to 130');

  scene.playerSpeed = 200;
  scene.activeStompSlowDelta = 0;
  scene.activeStompSlowTimer = null;
  gameEmitter.emit('perks-updated', {
    hazard_buffer: 2, // 80% groundSlowdownReduction
    dash_decoy: 1, // 1.5s confectionery decoy taunt + dazzle
    merchant_discount: 2, // 30% shop discount (20 -> 14 Star Candies)
    relic_resonance: 2, // +10% relic drop chance + 2 max relic slots
  });
  scene.playerSpeed = 200;
  scene.applyStompSlow(0.35, 1000);
  assert.equal(
    Math.round(scene.playerSpeed),
    186,
    'hazard_buffer Lv2 (80% reduction) must mitigate 35% slow down to 7% (200 -> 186)'
  );

  // 2. dash_decoy sets reusable dashDecoyTarget lure for 1500ms so enemy chases decoy after 650ms stun
  const chaser = new ChaserEnemy(scene, 4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.enemies.add(chaser);
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20); // decoy origin = (140, 140)
  scene.playerFacing = 'right';
  scene.time.now = 2000;
  scene.update(2000, 16);
  scene.performDash();

  assert.equal(chaser.isStunned, true);
  assert.strictEqual(chaser.tauntTarget, scene.dashDecoyTarget);
  assert.equal(chaser.tauntedUntil, 3500);

  // Complete dash hologram tween -> spritePool returns to 0 active while dashDecoyTarget remains active
  for (const tw of Array.from(activeTweens)) {
    if (typeof tw.complete === 'function') tw.complete();
  }
  assert.equal(scene.spritePool.activeCount, 0);

  // Move player East to (9, 4) while decoy stays NW of chaser at (3, 3); advance clock past 650ms stun to t=2800 (< 3500 taunt expiry)
  scene.isDashing = false;
  scene.player.setPosition(9 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.time.now = 2800;
  scene.update(2800, 220);
  assert.equal(chaser.isStunned, false);
  assert.ok(
    (chaser.body.velocity.x < 0 || chaser.body.velocity.y < 0) && chaser.body.velocity.x <= 0,
    'After 650ms dazzle expires, taunted enemy at (4, 4) must steer toward decoy at (3, 3) instead of East toward player at (9, 4)'
  );

  // Advance past 1500ms taunt window (t=3600): enemy must resume chasing player East at (9, 4)!
  scene.time.now = 3600;
  scene.update(3600, 220);
  assert.ok(
    chaser.body.velocity.x > 0,
    'Once 1500ms decoy taunt expires, enemy must resume steering East toward player at (9, 4)'
  );
  scene.enemies.clear(true, true);

  // 3. MerchantNPC live trade with merchant_discount Lv2 (-30%: 20 -> 14 Star Candies) + 3s cooldown
  const merchant = new MerchantNPC(scene, 4 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.neutrals.add(merchant);
  scene.player.setPosition(3 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.starCandies = 30;
  const preItemsTotal = scene.itemsCollectedTotal;
  let tradedEventPayload = null;
  gameEmitter.once('merchant-traded', (payload) => {
    tradedEventPayload = payload;
  });

  const traded = scene.tryTradeWithNearbyMerchant(125);
  assert.equal(traded, true, 'Adjacent MerchantNPC must complete Star Candy trade');
  assert.equal(scene.starCandies, 16, 'merchant_discount Lv2 (-30%) must charge 14 Star Candies instead of 20');
  assert.equal(scene.itemsCollectedTotal, preItemsTotal + 1, 'Merchant trade must grant chest-tier power-up');
  assert.ok(tradedEventPayload && tradedEventPayload.cost === 14);
  assert.equal(
    scene.tryTradeWithNearbyMerchant(125),
    false,
    'Merchant tradeCooldownMs must prevent immediate duplicate purchase spam'
  );
  merchant.updateAI(3100, 7000, scene.player, scene.map, new FlatHazardMask(ROWS * COLS));
  assert.equal(scene.tryTradeWithNearbyMerchant(250), true, 'Merchant trade must succeed again once 3s cooldown elapses');
  assert.equal(scene.starCandies, 2);

  // 4. relic_resonance & tryAwardRolledRelic: chest drop (35% + 10% = 45% threshold) & guaranteed boss drop
  assert.equal(scene.relicManager.getEquippedCount(), 0);
  // Seed 400 -> rand = 0.400 <= 0.45 (succeeds ONLY because of +0.10 relic_resonance bonus over 0.35 base!)
  const chestRelic = scene.tryAwardRolledRelic(false, true, 140, 140, 400);
  assert.ok(chestRelic !== null, 'relic_resonance +10% bonus must enable chest relic roll at rand=0.40');
  assert.equal(scene.relicManager.isEquipped(chestRelic), true, 'Dropped relic must auto-equip into available slot');

  // Defeating a boss guarantees a relic drop
  scene.startBossEncounter('king_gummy_bear');
  scene.handleActiveBossDefeated();
  assert.ok(scene.relicManager.getDiscoveredRelics().length >= 1);

  scene.shutdown();
});

test('Cycle 49.5: HamsterBoss GATLING_SEED 3-way fan & QueenBeeBoss CANDY_STINGER salvo via pooled BossAttackManager', () => {
  const { scene, graphicsFillAlphas } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();

  // 1. Captain Nibbles Phase 2 Sunflower Gatling 3-seed fan
  scene.startBossEncounter('captain_nibbles');
  assert.ok(scene.activeBoss instanceof HamsterBoss);
  scene.activeBoss.bossState = BossState.PHASE_2;
  scene.activeBoss.phase = 2;
  scene.activeBoss.setPosition?.(300, 260);
  scene.activeBoss.x = 300;
  scene.activeBoss.y = 260;

  const seedsSpawned = scene.activeBoss.fireSunflowerGatling(420, 260);
  assert.equal(seedsSpawned, 3, 'HamsterBoss.fireSunflowerGatling must spawn 3 pooled GATLING_SEED projectiles');
  assert.equal(scene.bossAttackManager.projectilePool.activeCount, 3);
  for (let i = 0; i < 3; i++) {
    const p = scene.bossAttackManager.projectilePool.getActive(i);
    assert.equal(p.type, BossProjectileType.GATLING_SEED);
  }

  graphicsFillAlphas.length = 0;
  scene.player.setPosition(80, 80); // out of line-of-sight row/col
  scene.update(3000, 16);
  assert.ok(
    graphicsFillAlphas.some((e) => e.color === 0xfbbf24),
    'GATLING_SEED projectiles must render with golden sunflower tint (0xfbbf24)'
  );

  // 2. Queen Mellifera Stinger Salvo (1 in Phase 2, 3-way fan in Enraged, 0 when grounded)
  scene.startBossEncounter('queen_bee_cupcake');
  assert.ok(scene.activeBoss instanceof QueenBeeBoss);
  scene.activeBoss.bossState = BossState.PHASE_2;
  scene.activeBoss.phase = 2;
  assert.equal(scene.activeBoss.fireStingerSalvo(200, 320), 1, 'Phase 2 QueenBeeBoss must fire single CANDY_STINGER');

  scene.activeBoss.bossState = BossState.ENRAGED;
  scene.activeBoss.phase = 3;
  assert.equal(scene.activeBoss.fireStingerSalvo(200, 320), 3, 'Enraged QueenBeeBoss must fire 3-way CANDY_STINGER fan');
  assert.equal(scene.bossAttackManager.projectilePool.activeCount, 4);

  graphicsFillAlphas.length = 0;
  scene.update(3100, 16);
  assert.ok(
    graphicsFillAlphas.some((e) => e.color === 0xf472b6),
    'CANDY_STINGER projectiles must render with pink stinger tint (0xf472b6)'
  );

  scene.activeBoss.applyStun(2.5);
  assert.equal(scene.activeBoss.fireStingerSalvo(200, 320), 0, 'Grounded/stunned QueenBeeBoss must not fire aerial stingers');
  assert.equal(scene.bossAttackManager.projectilePool.verifyInvariants(), true);

  scene.shutdown();
});

test('Cycle 49.6: Checksum-verified Save-Resume round-trip for activeBoss (QueenBee shields/HP/phase & Boss Rush index), activePoisonMist, & currencies', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();

  scene.activeGameMode = GameModeType.BOSS_RUSH;
  scene.currentBossIndex = 2;
  scene.starCandies = 75;
  scene.cosmicEssence = 40;
  scene.setPoisonMistTile(4, 6, 2900);
  scene.setPoisonMistTile(4, 7, 1800);

  scene.startBossEncounter('queen_bee_cupcake');
  assert.ok(scene.activeBoss instanceof QueenBeeBoss);
  scene.activeBoss.x = 340;
  scene.activeBoss.y = 220;
  scene.activeBoss.currentHp = 7;
  scene.activeBoss.phase = 2;
  scene.activeBoss.bossState = BossState.PHASE_2;
  scene.activeBoss.enrageGauge = 42;
  scene.activeBoss.shieldsRemaining = 2;

  const primaryStorage = new MemoryStorageAdapter();
  const backupStorage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(primaryStorage, backupStorage);

  const rawCapture = scene.captureRunState('quota_429');
  assert.equal(rawCapture.meta.bossEncounterActive, true);
  assert.equal(rawCapture.meta.starCandies, 75);
  assert.equal(rawCapture.meta.cosmicEssence, 40);
  assert.equal(rawCapture.activePoisonMist.length, 2);
  assert.ok(rawCapture.activeBoss);
  assert.equal(rawCapture.activeBoss.bossId, 'boss_queen_bee');
  assert.equal(rawCapture.activeBoss.currentHp, 7);
  assert.equal(rawCapture.activeBoss.activeShieldCount, 2);

  const savedEnvelope = persistence.saveRunState(rawCapture);
  assert.ok(savedEnvelope && typeof savedEnvelope.checksum === 'string' && savedEnvelope.checksum.length > 0);
  const loaded = persistence.loadRunState();
  assert.ok(loaded, 'Checksum-verified active boss & poison mist run state must load cleanly');

  // Wipe live state completely before resume
  scene.dismissBoss();
  scene.clearPoisonMist();
  scene.starCandies = 0;
  scene.cosmicEssence = 0;
  scene.currentBossIndex = 0;
  assert.equal(scene.activeBoss, null);
  assert.equal(scene.activePoisonMistCount, 0);

  gameEmitter.emit('resume-run-state', loaded);

  assert.equal(scene.starCandies, 75);
  assert.equal(scene.cosmicEssence, 40);
  assert.equal(scene.currentBossIndex, 2);
  assert.equal(scene.activePoisonMistCount, 2);
  assert.ok(scene.poisonMistRemainingMs[4 * COLS + 6] >= 2800);
  assert.ok(scene.activeBoss instanceof QueenBeeBoss, 'QueenBeeBoss encounter must be reconstructed on resume');
  assert.equal(scene.activeBoss.currentHp, 7);
  assert.equal(scene.activeBoss.phase, 2);
  assert.equal(scene.activeBoss.bossState, BossState.PHASE_2);
  assert.equal(scene.activeBoss.enrageGauge, 42);
  assert.equal(scene.activeBoss.shieldsRemaining, 2);
  assert.equal(scene.bossHUD.getState().currentHp, 7);

  // Resuming a snapshot with activeBoss: null must cleanly dismiss any active boss
  loaded.activeBoss = null;
  gameEmitter.emit('resume-run-state', loaded);
  assert.equal(scene.activeBoss, null);

  scene.shutdown();
});

test('Cycle 49.7: 10,000-frame continuous Zero-GC soak across multi-touch input, Boss projectiles, Merchant & Enemy pathing, and Crises', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness({ recordDrawCalls: false });
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();
  scene.isInvulnerable = true;

  scene.enemies.clear(true, true);
  for (const n of scene.neutrals.getChildren()) scene.safeDisableSpriteBody(n);

  const chaser = new ChaserEnemy(scene, 10 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.enemies.add(chaser);
  const merchant = new MerchantNPC(scene, 4 * TILE_SIZE + 20, 8 * TILE_SIZE + 20);
  scene.neutrals.add(merchant);

  scene.startBossEncounter('queen_bee_cupcake');
  scene.activeBoss.bossState = BossState.ENRAGED;
  scene.activeBoss.phase = 3;
  scene.startCrisisMode(CrisisType.ORBITAL_BOMBARDMENT);

  const touchController = new MultiTouchPointerTracker({ deadzone: 5 });
  const touchState = createDefaultMobileInputState();
  const standaloneAttackMgr = new BossAttackManager();
  assert.ok(standaloneAttackMgr);

  if (globalThis.gc) globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let frame = 0; frame < 10000; frame++) {
    const now = 30000 + frame * 16;
    scene.time.now = now;

    // Multi-touch joystick spam every 20 frames
    if (frame % 20 === 0) {
      touchController.onPointerDown(1, 'joystick', touchState, { x: 80, y: 420 }, undefined, now);
      touchController.onPointerMove(1, { x: 110, y: 420 }, touchState, { x: 80, y: 420 }, now + 2);
      touchController.onPointerDown(2, 'joystick', touchState, { x: 80, y: 420 }, undefined, now + 4);
      touchController.onPointerMove(2, { x: 80, y: 390 }, touchState, { x: 80, y: 420 }, now + 6);
      touchController.onPointerUp(2, touchState);
      touchController.onPointerCancel(1, touchState);
    }

    // Alternate QueenBeeBoss and HamsterBoss every 2,500 frames
    if (frame > 0 && frame % 2500 === 0) {
      const useHamster = (frame / 2500) % 2 === 1;
      scene.startBossEncounter(useHamster ? 'captain_nibbles' : 'queen_bee_cupcake');
      scene.activeBoss.bossState = BossState.ENRAGED;
      scene.activeBoss.phase = 3;
    }

    scene.update(now, 16);

    if (activeTweens.size > 32) {
      for (const tw of Array.from(activeTweens)) {
        if (typeof tw.complete === 'function') tw.complete();
      }
    }
  }

  for (const tw of Array.from(activeTweens)) {
    if (typeof tw.complete === 'function') tw.complete();
  }

  if (globalThis.gc) globalThis.gc();
  const heapAfter = process.memoryUsage().heapUsed;
  const heapDeltaMb = (heapAfter - heapBefore) / (1024 * 1024);

  assert.equal(scene.floatingTextPool.verifyInvariants(), true);
  assert.equal(scene.nameTagTextPool.verifyInvariants(), true);
  assert.equal(scene.intentBadgeTextPool.verifyInvariants(), true);
  assert.equal(scene.rectPool.verifyInvariants(), true);
  assert.equal(scene.circlePool.verifyInvariants(), true);
  assert.equal(scene.graphicsPool.verifyInvariants(), true);
  assert.equal(scene.spritePool.verifyInvariants(), true);
  assert.equal(scene.shadowPool.verifyInvariants(), true);
  assert.equal(scene.bossAttackManager.projectilePool.verifyInvariants(), true);
  assert.equal(scene.bossAttackManager.shockwavePool.verifyInvariants(), true);
  assert.equal(scene.bossAttackManager.telegraphPool.verifyInvariants(), true);
  assert.ok(heapDeltaMb < 32, `10,000-frame soak heap growth (${heapDeltaMb.toFixed(2)} MB) must remain strictly bounded`);

  scene.shutdown();
});
