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
  ChaserEnemy,
  TankEnemy,
  MiniSplitterEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');
const {
  MiniBomberAlly,
  ShieldGuardAlly,
} = await import('../src/game/entities/AllyEntities.ts');
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
  BossState,
  MutantFloraBoss,
  SteamToyTitanBoss,
  GummyBearBoss,
} = await import('../src/game/bosses/index.ts');
const {
  CrisisStage,
  CrisisType,
  HazardType,
  SituationLog,
} = await import('../src/game/crises/index.ts');
const {
  GameModeType,
  GameModeManager,
  ScalingEngine,
  RelicManager,
  RelicId,
  PerkTreeManager,
} = await import('../src/game/progression/index.ts');
const {
  GameStatePersistence,
  MemoryStorageAdapter,
} = await import('../src/game/persistence/GameStatePersistence.ts');

function createOpenCorridorMap() {
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
      strokeColor: 0,
      strokeAlpha: 0,
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
      setStrokeStyle(width, color = 0, alpha = 1) {
        this.strokeWidth = width;
        this.strokeColor = color;
        this.strokeAlpha = alpha;
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
      setRadius(r) {
        this.radius = r;
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
    overlapHandlers,
    graphicsFillAlphas,
    floatingTexts,
    tweenConfigs,
    activeTweens,
  };
}

test('Cycle 50.1: Zero-GC GameModeManager.update scratch reuse, ScalingEngine static mutator IDs, & warpPlayer non-Set sentinel resilience', () => {
  const modeMgr = new GameModeManager(GameModeType.CRISIS_SURVIVAL);
  const t1 = modeMgr.update(45000);
  assert.equal(t1.spawnDropPod, true);
  assert.equal(t1.triggerCrisis, undefined);

  const t2 = modeMgr.update(1000);
  assert.strictEqual(t1, t2, 'GameModeManager.update must reuse its pre-allocated scratch object');
  assert.equal(t2.spawnDropPod, undefined, 'Scratch spawnDropPod flag must reset on next tick');
  assert.equal(t2.triggerCrisis, undefined);
  assert.equal(t2.restStopExpired, undefined);

  const t3 = modeMgr.update(14000);
  assert.strictEqual(t3, t1);
  assert.equal(t3.triggerCrisis, true);

  for (let w = 1; w <= 120; w++) {
    const muts = ScalingEngine.generateWaveMutators(w, w * 31337);
    if (w < 3) {
      assert.equal(muts.length, 0);
    } else if (w < 6) {
      assert.equal(muts.length, 1);
    } else {
      assert.equal(muts.length, 2);
      assert.notEqual(muts[0].id, muts[1].id);
    }
  }

  // SituationLog & RelicManager static Set validation
  const log = new SituationLog();
  assert.equal(log.deserialize({ stage: CrisisStage.CLIMAX, threatTrend: 'critical' }), true);
  assert.equal(log.getState().stage, CrisisStage.CLIMAX);
  assert.equal(log.getState().threatTrend, 'critical');

  // warpPlayer non-Set ignoringColliders sentinel defense
  const { scene, activeTweens } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();

  const destBomb = scene.bombs.create(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20, 'bomb');
  destBomb.setData('ignoringColliders', 'corrupted_non_set_sentinel');

  assert.doesNotThrow(() => {
    scene.warpPlayer(5, 5);
    for (const tw of Array.from(activeTweens)) {
      if (typeof tw.complete === 'function') tw.complete();
    }
  });
  const healedSet = destBomb.getData('ignoringColliders');
  assert.ok(healedSet instanceof Set, 'warpPlayer must replace corrupted non-Set ignoringColliders with a valid Set');
  assert.equal(healedSet.has(scene.player), true);
  scene.shutdown();
});

test('Cycle 50.2: MiniBomberAlly waypoint advancement without sub-tick oscillation & ShieldGuardAlly taunt ring non-occlusion (alpha <= 0.40)', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.enemies.clear(true, true);
  scene.allies.clear(true, true);

  // 1. MiniBomberAlly waypoint advancement
  scene.player.setPosition(6 * TILE_SIZE + 20, 1 * TILE_SIZE + 20); // (1, 6) = (260, 60)
  const pomPom = new MiniBomberAlly(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20); // (1, 1) = (60, 60)
  scene.allies.add(pomPom);

  const emptyBombs = new FlatHazardMask(ROWS * COLS);
  pomPom.pathRecalcTimer = 0;
  pomPom.updateAI(16, 1000, scene.player, scene.map, emptyBombs, () => false);
  assert.ok(pomPom.currentPath.length >= 4, 'BFS should compute multi-tile corridor path toward player');
  assert.equal(pomPom.currentPath[0].c, 2);
  assert.ok(pomPom.body.velocity.x > 0);

  // Move Pom-Pom 2px past first waypoint (1, 2) = (100, 60) BEFORE pathRecalcTimer (220ms) expires
  pomPom.setPosition(2 * TILE_SIZE + 22, 1 * TILE_SIZE + 20); // x = 102, dx to (1,2) is -2 (< 4px!)
  pomPom.updateAI(16, 1016, scene.player, scene.map, emptyBombs, () => false);
  assert.equal(pomPom.currentPath[0].c, 3, 'Reached waypoint (1, 2) must be shifted out in-place');
  assert.ok(
    pomPom.body.velocity.x > 0,
    'MiniBomberAlly must continue forward (+vx) toward (1, 3) instead of oscillating backward (-vx)'
  );

  // Entering leashMinTiles clears stale waypoints
  pomPom.setPosition(5 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  pomPom.updateAI(16, 1032, scene.player, scene.map, emptyBombs, () => false);
  assert.equal(pomPom.currentPath.length, 0, 'Entering leashMinTiles must clear stale waypoints in-place');
  assert.equal(pomPom.body.velocity.x, 0);

  // 2. ShieldGuardAlly taunt ring non-occlusion (alpha <= 0.40) + circlePool lifecycle
  const aegis = new ShieldGuardAlly(scene, 4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.allies.add(aegis);
  const chaser = new ChaserEnemy(scene, 5 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.enemies.add(chaser);

  aegis.tauntTimer = 0;
  aegis.updateAI(16, 2000, scene.player, 'down', scene.enemies.getChildren());
  assert.equal(scene.circlePool.activeCount, 1, 'ShieldGuardAlly taunt ring must acquire from circlePool');
  const ring = scene.circlePool.getActive(0);
  assert.ok(ring.fillAlpha <= 0.40, `Taunt ring fillAlpha (${ring.fillAlpha}) must be <= 0.40`);
  assert.ok(ring.alpha <= 0.40, `Taunt ring alpha (${ring.alpha}) must be <= 0.40`);
  assert.ok(ring.strokeAlpha <= 0.40, `Taunt ring strokeAlpha (${ring.strokeAlpha}) must be <= 0.40`);
  assert.equal(chaser.tauntTarget, aegis);

  for (const tw of Array.from(activeTweens)) {
    if (tw.targets === ring && typeof tw.complete === 'function') tw.complete();
  }
  assert.equal(scene.circlePool.activeCount, 0, 'Taunt ring must release back to circlePool on completion');
  assert.equal(scene.circlePool.verifyInvariants(), true);
  scene.shutdown();
});

test('Cycle 50.3: Relic combat harmonization — ORBITAL_TARGETING_CORE kinetic strike, PYROCLASTIC_PRISM diagonal chain-detonation + crisis blast, & QUANTUM_WARP_PRISM phase slow', () => {
  const { scene, activeTimers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.blocks.clear(true, true);
  scene.enemies.clear(true, true);

  // 1. ORBITAL_TARGETING_CORE + MAGNETRON_DIAL delayed cross strike: destroys soft blocks, deals 150 enemy damage, & clears Void Creep
  scene.relicManager = new RelicManager([RelicId.ORBITAL_TARGETING_CORE, RelicId.MAGNETRON_DIAL], 2);
  scene.map[4][5] = TILE_BLOCK;
  const blockSprite = scene.blocks.create(5 * TILE_SIZE + 20, 4 * TILE_SIZE + 20, 'block');
  blockSprite.setData('row', 4);
  blockSprite.setData('col', 5);

  const tankTarget = new TankEnemy(scene, 4 * TILE_SIZE + 20, 5 * TILE_SIZE + 20); // (5, 4), 4 HP
  scene.enemies.add(tankTarget);
  assert.equal(tankTarget.hp, 4);

  scene.crisisManager.triggerCrisis(CrisisType.PASTEL_VOID);
  const voidCrisis = scene.crisisManager.getActiveCrisis();
  voidCrisis.setHazardTile(6, 5, HazardType.VOID_CREEP, 0.5, 0, 0);

  scene.time.now = 15000;
  const orbitalBomb = scene.bombs.create(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20, 'bomb');
  orbitalBomb.setData('id', 'player_bomb_orbital');
  orbitalBomb.setData('owner', 'player');
  orbitalBomb.setData('power', 1);
  orbitalBomb.setData('col', 5);
  orbitalBomb.setData('row', 5);

  const timersBefore = activeTimers.length;
  scene.explodeBomb(orbitalBomb, 5, 5);

  const orbitalTimer = activeTimers.slice(timersBefore).find((t) => t.delayMs === 1200 && !t.removed);
  assert.ok(orbitalTimer, 'Orbital Targeting Core must schedule a 1200ms delayed kinetic strike');
  // Re-seed soft block & 4-HP enemy on cross tiles right before delayed strike lands to isolate orbital strike impact
  scene.map[4][5] = TILE_BLOCK;
  const orbitalBlock = scene.blocks.create(5 * TILE_SIZE + 20, 4 * TILE_SIZE + 20, 'block');
  orbitalBlock.setData('row', 4);
  orbitalBlock.setData('col', 5);
  const strikeTank = new TankEnemy(scene, 4 * TILE_SIZE + 20, 5 * TILE_SIZE + 20); // (5, 4), 4 HP
  scene.enemies.add(strikeTank);
  voidCrisis.setHazardTile(6, 5, HazardType.VOID_CREEP, 0.5, 0, 0);

  scene.time.now = 15800;
  orbitalTimer.callback();

  assert.equal(scene.map[4][5], TILE_EMPTY, 'Orbital strike must destroy soft blocks on cross tiles');
  assert.equal(strikeTank.isDead, true, 'Orbital strike must deal 150 kinetic damage killing multi-HP enemies');
  assert.equal(
    !voidCrisis.getHazardAt(6, 5) || voidCrisis.getHazardAt(6, 5).type === HazardType.NONE,
    true,
    'Orbital strike must notify CrisisManager.handleBombBlast'
  );

  // 2. PYROCLASTIC_PRISM diagonal spark shards chain-detonate bombs & hit crisis tiles
  scene.relicManager = new RelicManager([RelicId.PYROCLASTIC_PRISM], 2);
  voidCrisis.setHazardTile(6, 6, HazardType.VOID_CREEP, 0.5, 0, 0);
  const diagBomb = scene.bombs.create(6 * TILE_SIZE + 20, 6 * TILE_SIZE + 20, 'bomb');
  diagBomb.setData('id', 'diag_chain_bomb');
  diagBomb.setData('owner', 'player');
  diagBomb.setData('power', 1);
  diagBomb.setData('col', 6);
  diagBomb.setData('row', 6);

  const centerBomb = scene.bombs.create(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20, 'bomb');
  centerBomb.setData('id', 'prism_center_bomb');
  centerBomb.setData('owner', 'player');
  centerBomb.setData('power', 1);
  centerBomb.setData('col', 5);
  centerBomb.setData('row', 5);

  scene.time.now = 25000;
  scene.explodeBomb(centerBomb, 5, 5);
  assert.equal(diagBomb.active, false, 'Pyroclastic Prism diagonal spark shard must chain-detonate bombs on diagonal tiles');
  assert.equal(
    !voidCrisis.getHazardAt(6, 6) || voidCrisis.getHazardAt(6, 6).type === HazardType.NONE,
    true,
    'Pyroclastic Prism diagonal shard must clear Void Creep'
  );

  // 3. QUANTUM_WARP_PRISM applies phaseDurationMs slow to surviving high-HP elite enemies
  scene.relicManager = new RelicManager([RelicId.QUANTUM_WARP_PRISM], 2);
  scene.enemies.clear(true, true);
  const phaseTank = new TankEnemy(scene, 7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20); // 2 tiles away (outside power 1 blast, inside 2.0-tile warp)
  phaseTank.maxHp = 100;
  phaseTank.hp = 100;
  scene.enemies.add(phaseTank);
  assert.equal(phaseTank.hp, 100);

  const warpBomb = scene.bombs.create(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20, 'bomb');
  warpBomb.setData('id', 'warp_bomb');
  warpBomb.setData('owner', 'player');
  warpBomb.setData('power', 1);
  warpBomb.setData('col', 5);
  warpBomb.setData('row', 5);

  scene.time.now = 35000;
  scene.explodeBomb(warpBomb, 5, 5);
  assert.equal(phaseTank.hp, 25, 'Quantum Warp Prism should deal 75 damage to high-HP TankEnemy');
  assert.equal(phaseTank.speedMultiplier, 0.55, 'Surviving enemy must receive 0.55x phase-shift slow');
  scene.shutdown();
});

test('Cycle 50.4: Synergy & Perk harmonization — Radiant Leech heat immunity + shock reflection, Chrono Attraction +1s item extension (15s cap), & sugar_coating maxShields sync', () => {
  const { scene, gameEmitter, overlapHandlers } = createStatefulGameSceneHarness();
  scene.appliedPerkBonuses = PerkTreeManager.calculateAppliedBonuses({ sugar_coating: 2 });
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();

  // 1. sugar_coating Level 2 syncs maxShields = 2
  assert.equal(scene.shieldCharges, 2);
  assert.equal(scene.maxShields, 2, 'Level 2 Sugar Coating must set maxShields to 2');

  // Consume 1 shield via playerDie, then collect SHIELD item back up to 2!
  scene.isInvulnerable = false;
  scene.playerDie();
  assert.equal(scene.shieldCharges, 1);
  scene.collectItem('SHIELD', scene.player.x, scene.player.y);
  assert.equal(scene.shieldCharges, 2, 'Synced maxShields=2 allows re-collecting a 2nd Bubble Shield');

  // Also test dynamic perks-updated event from 1 -> 2 shields
  scene.maxShields = 1;
  scene.shieldCharges = 0;
  gameEmitter.emit('perks-updated', { sugar_coating: 2 });
  assert.equal(scene.shieldCharges, 2);
  assert.equal(scene.maxShields, 2);

  // Clear Bubble Shields to isolate Radiant Leech Solar Shield
  scene.shieldCharges = 0;
  scene.hasShield = false;
  scene.isInvulnerable = false;

  // 2. Radiant Leech (SOLAR_CAPACITOR + VAMPIRIC_CONFECTION): heat debuff immunity & collision shock reflection
  scene.relicManager = new RelicManager([RelicId.SOLAR_CAPACITOR, RelicId.VAMPIRIC_CONFECTION], 2);
  scene.relicManager.update(15000, 50000, 60, true);
  assert.equal(scene.relicManager.hasSolarShield, true);

  scene.applyThermalSinge();
  scene.applySunstroke();
  assert.equal(scene.hasBuff('THERMAL_SINGE'), false, 'Radiant Leech Solar Shield must block Thermal Singe');
  assert.equal(scene.hasBuff('SUNSTROKE'), false, 'Radiant Leech Solar Shield must block Sunstroke');

  const chaser = new ChaserEnemy(scene, scene.player.x, scene.player.y);
  scene.enemies.add(chaser);
  const playerEnemyOverlap = overlapHandlers.find((h) => h.objA === scene.player && h.objB === scene.enemies);
  assert.ok(playerEnemyOverlap, 'Player-Enemy overlap handler must be registered');

  scene.time.now = 52000;
  playerEnemyOverlap.cb(scene.player, chaser);
  assert.equal(chaser.isDead, true, 'Radiant Leech collision must deal 1 shock damage killing 1-HP attacker');
  assert.equal(scene.relicManager.hasSolarShield, false, 'Solar Shield must absorb the hit');
  assert.equal(scene.isGameOver, false);

  // 3. Chrono Attraction (MAGNETRON_DIAL + POCKET_CHRONOMETER): +1s per item up to +15s cap
  scene.relicManager = new RelicManager([RelicId.MAGNETRON_DIAL, RelicId.POCKET_CHRONOMETER], 2);
  scene.matchSecondsRemaining = 40;
  scene.chronoBonusSecondsGranted = 0;

  for (let i = 0; i < 20; i++) {
    scene.collectItem('SPEED_UP', 100, 100);
  }
  assert.equal(scene.chronoBonusSecondsGranted, 15, 'Chrono Attraction bonus must cap at 15 seconds per run');
  assert.equal(scene.matchSecondsRemaining, 55, 'matchSecondsRemaining must advance from 40s to exactly 55s');
  scene.shutdown();
});

test('Cycle 50.5: Lossless Boss Encounter Save-Resume across stunTimerMs, MutantFloraBoss roots/burrow, SteamToyTitanBoss facingAngle, & GummyBearBoss cub bossOwnerRef re-linking', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage, storage);

  // Case A: MutantFloraBoss burrow + active pooled roots
  const h1 = createStatefulGameSceneHarness();
  h1.scene.init();
  h1.scene.create();
  h1.scene.map = createOpenCorridorMap();
  h1.scene.startBossEncounter('boss_mutant_flora');
  assert.ok(h1.scene.activeBoss instanceof MutantFloraBoss);
  const flora1 = h1.scene.activeBoss;
  flora1.bossState = BossState.PHASE_2;
  flora1.phase = 2;
  flora1.currentHp = 8;
  flora1.isUnderground = true;
  flora1.undergroundTimerMs = 1420;
  flora1.spawnSubterraneanRoot(180, 220);
  flora1.spawnSubterraneanRoot(340, 300);
  assert.equal(flora1.rootPool.activeCount, 2);

  const snapFlora = h1.scene.captureRunState('manual');
  persistence.saveRunState(snapFlora);
  const loadedFlora = persistence.loadRunState();
  assert.ok(loadedFlora, 'Checksum-verified Flora run state must load cleanly');

  const h2 = createStatefulGameSceneHarness();
  h2.scene.init();
  h2.scene.create();
  h2.scene.onResumeRunState(loadedFlora);
  assert.ok(h2.scene.activeBoss instanceof MutantFloraBoss);
  assert.equal(h2.scene.activeBoss.isUnderground, true);
  assert.equal(h2.scene.activeBoss.undergroundTimerMs, 1420);
  assert.equal(h2.scene.activeBoss.rootPool.activeCount, 2);
  assert.equal(h2.scene.activeBoss.rootPool.verifyInvariants(), true);
  h1.scene.shutdown();
  h2.scene.shutdown();

  // Case B: SteamToyTitanBoss facingAngle + exact stunTimerMs
  const h3 = createStatefulGameSceneHarness();
  h3.scene.init();
  h3.scene.create();
  h3.scene.startBossEncounter('boss_steam_toy_titan');
  assert.ok(h3.scene.activeBoss instanceof SteamToyTitanBoss);
  h3.scene.activeBoss.phase = 2;
  h3.scene.activeBoss.bossState = BossState.STUNNED;
  h3.scene.activeBoss.stunTimerMs = 2850;
  h3.scene.activeBoss.facingAngle = 1.375;

  const snapTitan = h3.scene.captureRunState('auto');
  persistence.saveRunState(snapTitan);
  const loadedTitan = persistence.loadRunState();
  assert.ok(loadedTitan, 'Checksum-verified Titan run state must load cleanly');

  const h4 = createStatefulGameSceneHarness();
  h4.scene.init();
  h4.scene.create();
  h4.scene.onResumeRunState(loadedTitan);
  assert.ok(h4.scene.activeBoss instanceof SteamToyTitanBoss);
  assert.equal(h4.scene.activeBoss.stunTimerMs, 2850, 'Exact stunTimerMs must survive save-resume without 1500ms overwrite');
  assert.equal(h4.scene.activeBoss.facingAngle, 1.375);
  assert.equal(h4.scene.activeBoss.gearShieldActive, false, 'Stunned Phase 2 Titan must keep gearShieldActive disabled');
  h3.scene.shutdown();
  h4.scene.shutdown();

  // Case C: GummyBearBoss Masterplay 3850ms stun + pancake squash + SPLITTER_MINI cub bossOwnerRef re-linking
  const h5 = createStatefulGameSceneHarness();
  h5.scene.init();
  h5.scene.create();
  h5.scene.map = createOpenCorridorMap();
  h5.scene.enemies.clear(true, true);
  h5.scene.startBossEncounter('boss_gummy_bear');
  assert.ok(h5.scene.activeBoss instanceof GummyBearBoss);
  const gummy5 = h5.scene.activeBoss;
  gummy5.bossState = BossState.STUNNED;
  gummy5.stunTimerMs = 3850;
  gummy5.isSquashedPancake = true;
  gummy5.leapCount = 2;
  gummy5.activeCubCount = 2;
  gummy5.pendingCubSpawns = 2;
  h5.scene.spawnGummyBossCubs(gummy5, 2);
  assert.equal(gummy5.activeCubCount, 2);

  const snapGummy = h5.scene.captureRunState('quota_429');
  persistence.saveRunState(snapGummy);
  const loadedGummy = persistence.loadRunState();
  assert.ok(loadedGummy, 'Checksum-verified Gummy run state must load cleanly');

  const h6 = createStatefulGameSceneHarness();
  h6.scene.init();
  h6.scene.create();
  h6.scene.onResumeRunState(loadedGummy);
  assert.ok(h6.scene.activeBoss instanceof GummyBearBoss);
  const gummy6 = h6.scene.activeBoss;
  assert.equal(gummy6.stunTimerMs, 3850);
  assert.equal(gummy6.isSquashedPancake, true);
  assert.equal(gummy6.leapCount, 2);
  assert.equal(gummy6.activeCubCount, 2);

  const restoredCubs = h6.scene.enemies
    .getChildren()
    .filter((e) => e.active && e instanceof MiniSplitterEnemy);
  assert.equal(restoredCubs.length, 2);
  for (const cub of restoredCubs) {
    assert.strictEqual(cub.bossOwnerRef, gummy6, 'Restored SPLITTER_MINI cubs must re-link bossOwnerRef to GummyBearBoss');
  }

  // Killing a restored cub must decrement gummy6.activeCubCount!
  restoredCubs[0].takeDamage(10, 'player', 60000);
  assert.equal(gummy6.activeCubCount, 1, 'Killing a resumed Gummy cub must decrement GummyBearBoss.activeCubCount');
  h5.scene.shutdown();
  h6.scene.shutdown();
});

test('Cycle 50.6: 10,000-frame continuous Zero-GC soak across GameModeManager, MiniBomberAlly, ShieldGuardAlly, MutantFloraBoss, RelicManager, & GameScene', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness({ recordDrawCalls: false });
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.enemies.clear(true, true);
  scene.allies.clear(true, true);

  scene.relicManager = new RelicManager([RelicId.SOLAR_CAPACITOR, RelicId.VAMPIRIC_CONFECTION], 2);
  const modeMgr = new GameModeManager(GameModeType.CRISIS_SURVIVAL);

  const pomPom = new MiniBomberAlly(scene, 2 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  const aegis = new ShieldGuardAlly(scene, 4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.allies.add(pomPom);
  scene.allies.add(aegis);

  const chaser = new ChaserEnemy(scene, 7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.enemies.add(chaser);

  scene.startBossEncounter('boss_mutant_flora');
  assert.ok(scene.activeBoss instanceof MutantFloraBoss);
  const flora = scene.activeBoss;
  flora.bossState = BossState.PHASE_2;
  flora.phase = 2;

  const emptyBombs = new FlatHazardMask(ROWS * COLS);
  const enemyList = scene.enemies.getChildren();

  // Warmup 200 frames
  for (let w = 0; w < 200; w++) {
    const t = 1000 + w * 16.67;
    scene.time.now = t;
    modeMgr.update(16.67);
    scene.relicManager.update(16.67, t, 45, true);
    pomPom.updateAI(16.67, t, scene.player, scene.map, emptyBombs, () => false);
    aegis.updateAI(16.67, t, scene.player, 'right', enemyList);
    flora.update(16.67, scene.player.x, scene.player.y, t);
    for (const tw of Array.from(activeTweens)) {
      if (typeof tw.complete === 'function') tw.complete();
    }
  }

  if (typeof global.gc === 'function') global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let frame = 0; frame < 10000; frame++) {
    const nowMs = 5000 + frame * 16.67;
    scene.time.now = nowMs;

    // Orbit player smoothly across open arena so MiniBomberAlly continually computes & advances paths
    const col = 2 + ((frame >>> 4) % 10);
    const row = 2 + ((frame >>> 6) % 8);
    scene.player.setPosition(col * TILE_SIZE + 20, row * TILE_SIZE + 20);

    const modeEvents = modeMgr.update(16.67);
    assert.equal(typeof modeEvents, 'object');

    scene.relicManager.update(16.67, nowMs, 45, true);
    pomPom.updateAI(16.67, nowMs, scene.player, scene.map, emptyBombs, () => false);
    // Advance Pom-Pom slightly along velocity to exercise in-place waypoint shifting
    pomPom.x = Math.max(60, Math.min(540, pomPom.x + pomPom.body.velocity.x * 0.016));
    pomPom.y = Math.max(60, Math.min(460, pomPom.y + pomPom.body.velocity.y * 0.016));

    aegis.updateAI(16.67, nowMs, scene.player, 'down', enemyList);
    flora.update(16.67, scene.player.x, scene.player.y, nowMs);

    if ((frame & 63) === 0) {
      ScalingEngine.generateWaveMutators((frame >>> 6) + 3, frame);
    }

    for (const tw of Array.from(activeTweens)) {
      if (typeof tw.complete === 'function') tw.complete();
    }

    assert.ok(Number.isFinite(pomPom.x) && Number.isFinite(pomPom.y));
    assert.ok(Number.isFinite(flora.x) && Number.isFinite(flora.y));
  }

  if (typeof global.gc === 'function') global.gc();
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

  assert.equal(scene.circlePool.activeCount, 0, 'All pooled taunt rings must be reclaimed');
  assert.equal(scene.circlePool.verifyInvariants(), true);
  assert.equal(flora.rootPool.verifyInvariants(), true);
  assert.equal(scene.destroyedBlocksThisTick.size, 0);
  assert.ok(heapDeltaMb < 24, `10,000-frame soak heap delta (${heapDeltaMb.toFixed(2)} MB) must remain bounded`);

  scene.shutdown();
});
