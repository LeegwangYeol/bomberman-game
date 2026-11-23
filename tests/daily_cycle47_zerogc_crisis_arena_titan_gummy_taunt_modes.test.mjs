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
  MiniSplitterEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');
const { ShieldGuardAlly } = await import('../src/game/entities/AllyEntities.ts');
const { MerchantNPC } = await import('../src/game/entities/NeutralEntities.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
} = await import('../src/game/pathfinding.ts');
const {
  BossState,
  GummyBearBoss,
  SteamToyTitanBoss,
} = await import('../src/game/bosses/index.ts');
const {
  ClockworkCrisis,
  CrisisManager,
  CrisisStage,
  CrisisType,
  HazardType,
  LavaCrisis,
  OrbitalCrisis,
  RiftCrisis,
  SolarFlareCrisis,
} = await import('../src/game/crises/index.ts');
const { GravityHazard } = await import('../src/game/hazards/GravityHazard.ts');
const { GameModeType, BOSS_RUSH_SEQUENCE } = await import('../src/game/progression/index.ts');

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

function createStatefulGameSceneHarness({ withParticles = false, recordDrawCalls = true } = {}) {
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
    particles: withParticles ? () => makeStatefulObject('particles') : undefined,
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
    activeTweens,
    overlapHandlers,
    graphicsFillAlphas,
    floatingTexts,
  };
}

test('Cycle 47.1: Zero-GC CrisisManager triggerRandomCrisis/reset, RiftCrisis in-place deserialization & GravityHazard radial rays', () => {
  const cm = new CrisisManager();
  const origArrayFrom = Array.from;
  let arrayFromCalls = 0;
  Array.from = function (...args) {
    arrayFromCalls++;
    return origArrayFrom.apply(this, args);
  };
  try {
    for (let i = 0; i < 50; i++) {
      const triggered = cm.triggerRandomCrisis(true);
      assert.ok(triggered, 'triggerRandomCrisis(true) must always select a registered crisis');
    }
    cm.reset();
    assert.equal(arrayFromCalls, 0, 'CrisisManager.triggerRandomCrisis & reset must perform 0 Array.from allocations');
  } finally {
    Array.from = origArrayFrom;
    cm.destroy();
  }

  // RiftCrisis in-place applyExtraSerializedState slot reuse
  const rift = new RiftCrisis();
  rift.init();
  const origRiftSlot0 = rift.rifts[0];
  const origSpireSlot0 = rift.spires[0];
  const snap = rift.serialize();
  snap.extraState = {
    ...snap.extraState,
    rifts: [
      { r: 2, c: 3 },
      { r: 5, c: 9 },
      { r: 10, c: 11 },
    ],
    spires: [
      { r: 2, c: 3, isPolarized: true, hitTimestampMs: 1200 },
      { r: 5, c: 9, isPolarized: false, hitTimestampMs: 0 },
      { r: 10, c: 11, isPolarized: true, hitTimestampMs: 1450 },
    ],
  };
  rift.deserialize(snap);
  assert.equal(rift.rifts[0], origRiftSlot0, 'RiftCrisis.deserialize must reuse existing rift object slots in-place');
  assert.equal(rift.spires[0], origSpireSlot0, 'RiftCrisis.deserialize must reuse existing spire object slots in-place');
  assert.equal(rift.rifts[0].r, 2);
  assert.equal(rift.rifts[0].c, 3);
  assert.equal(rift.spires[0].isPolarized, true);

  // GravityHazard computeCosmicRadialBlast indexed loop reuse
  const gh = new GravityHazard();
  gh.init(6, 7);
  const tilesA = gh.computeCosmicRadialBlast(6, 7, 3, () => true);
  const slot0Ref = tilesA[0];
  const tilesB = gh.computeCosmicRadialBlast(5, 5, 2, () => true);
  assert.equal(tilesB, tilesA, 'computeCosmicRadialBlast must reuse scratchRadialBlastTiles container');
  assert.equal(tilesB[0], slot0Ref, 'computeCosmicRadialBlast must reuse radialBlastPool slots');
  assert.ok(tilesB.length >= 9, '3x3 epicenter + radial rays must populate blast tiles');
});

test('Cycle 47.2: Zero-GC in-place onResumeRunState item/bomb recycling, ally/neutral revival, Merchant spawnTime, & resolved-crisis anti-exploit', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();

  // Spawn 2 items and 2 bombs before save
  scene.time.now = 2500;
  scene.spawnItem(3, 3, 'SPEED_UP', 2100);
  scene.spawnItem(3, 5, 'SHIELD', 2200);
  scene.maxBombs = 4;
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  scene.player.setPosition(1 * TILE_SIZE + 60, 1 * TILE_SIZE + 20);
  scene.placeBomb();

  const preResumeItemRefs = [...scene.items.getChildren()];
  const preResumeBombRefs = [...scene.bombs.getChildren()];
  assert.equal(preResumeItemRefs.length, 2);
  assert.equal(preResumeBombRefs.length, 2);

  // Trigger crisis and resolve it BEFORE capturing save state
  scene.startCrisisMode(CrisisType.PASTEL_VOID);
  const voidCrisis = scene.crisisManager.getActiveCrisis();
  voidCrisis.stage = CrisisStage.RESOLVED;
  scene.update(2600, 16);
  const scoreAfterFirstReward = scene.score;
  const candiesAfterFirstReward = scene.starCandies;
  assert.equal(scene.hasRewardedActiveCrisis, true);

  const saved = scene.captureRunState('manual');
  // Add explicit ally and neutral entries to verify multi-faction in-place revival
  saved.activeEntities.push(
    {
      id: 'ally_guard_1',
      archetype: 'SHIELD_GUARD',
      faction: 'ally',
      x: 5 * TILE_SIZE + 20,
      y: 3 * TILE_SIZE + 20,
      hp: 4,
      maxHp: 5,
      aiState: 'IDLE',
    },
    {
      id: 'neutral_merch_1',
      archetype: 'MERCHANT',
      faction: 'neutral',
      x: 7 * TILE_SIZE + 20,
      y: 3 * TILE_SIZE + 20,
      hp: 2,
      maxHp: 3,
      aiState: 'IDLE',
    }
  );

  // Resume run state and verify 0 pooled item/bomb sprite destructions + no duplicate crisis reward!
  gameEmitter.emit('resume-run-state', saved);

  for (const it of preResumeItemRefs) {
    assert.equal(it.destroyed, false, 'Pooled item sprites must be recycled in-place without destruction');
  }
  for (const b of preResumeBombRefs) {
    assert.equal(b.destroyed, false, 'Pooled bomb sprites must be recycled in-place without destruction');
  }
  const resumedItems = scene.items.getChildren().filter((i) => i.active);
  assert.equal(resumedItems.length, 2);
  assert.equal(resumedItems[0].getData('spawnTime'), 2100, 'Serialized spawnTime must be preserved on resume');

  const activeGuards = scene.allies
    .getChildren()
    .filter((a) => a.active && a instanceof ShieldGuardAlly);
  assert.equal(activeGuards.length, 1);
  assert.equal(activeGuards[0].hp, 4);

  const activeMerchants = scene.neutrals
    .getChildren()
    .filter((n) => n.active && n instanceof MerchantNPC);
  assert.equal(activeMerchants.length, 1);
  assert.equal(activeMerchants[0].hp, 2);

  // Step update after resuming a RESOLVED crisis: must NOT grant duplicate crisis completion rewards
  scene.update(2700, 16);
  assert.equal(scene.score, scoreAfterFirstReward, 'Resuming an already-resolved crisis must not duplicate score reward');
  assert.equal(scene.starCandies, candiesAfterFirstReward, 'Resuming an already-resolved crisis must not duplicate candy reward');

  // Verify MerchantNPC.onDeath passes currentTime through spawnSpecificItem -> spawnItem
  scene.time.now = 9900;
  activeMerchants[0].takeDamage(10, 'enemy', 7777);
  const droppedAfterDeath = scene.items
    .getChildren()
    .filter((i) => i.active && i.getData('spawnTime') === 7777);
  assert.equal(droppedAfterDeath.length, 2, 'MerchantNPC death drops must preserve exact death timestamp');

  scene.shutdown();
});

test('Cycle 47.3: Non-occluding floor alpha (<= 0.40) enforced across all 17 Crisis HazardType render branches', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const allHazardTypes = Object.values(HazardType);
  assert.ok(allHazardTypes.length >= 17, 'All 17 HazardType variants must be covered');

  const syntheticTiles = allHazardTypes.map((type, idx) => ({
    idx,
    r: 1 + Math.floor(idx / 10),
    c: 1 + (idx % 10),
    type,
    intensity: 1.0,
    data: idx % 2,
  }));
  // Also include both cooled (data=1) and uncooled (data=0) variants for stateful hazards
  syntheticTiles.push(
    { idx: 100, r: 5, c: 5, type: HazardType.THERMAL_VENT, intensity: 1.0, data: 0 },
    { idx: 101, r: 5, c: 6, type: HazardType.THERMAL_VENT, intensity: 1.0, data: 1 },
    { idx: 102, r: 5, c: 7, type: HazardType.DYNAMO_CONDUIT, intensity: 1.0, data: 1 },
    { idx: 103, r: 5, c: 8, type: HazardType.UPLINK_TERMINAL, intensity: 1.0, data: 1 }
  );

  scene.crisisManager.getActiveHazardTiles = () => syntheticTiles;
  scene.crisisGraphics.clear();
  scene.renderCrisisHazards(1500);

  const floorFills = scene.crisisGraphics.drawCalls.filter(
    (dc) =>
      dc.op === 'fillRect' ||
      dc.op === 'fillRoundedRect' ||
      (dc.op === 'fillCircle' && dc.cr >= 14)
  );
  assert.ok(floorFills.length >= 14, 'Expected floor fill draw calls across crisis hazard types');
  for (const dc of floorFills) {
    assert.ok(
      dc.alpha <= 0.400001,
      `Crisis floor fill (${dc.op}) alpha ${dc.alpha} exceeded 0.40 non-occlusion ceiling`
    );
  }

  scene.shutdown();
});

test('Cycle 47.4: Live ClockworkCrisis arena integration (conveyor drift, temporary +3 Climax bomb slots stripped from saves, EMP disarm/detonate)', () => {
  const { scene, floatingTexts } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();
  scene.conveyors = [];
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);
  scene.isInvulnerable = true;
  scene.shieldInvulnerableUntil = 999999;

  scene.startCrisisMode(CrisisType.CLOCKWORK_REBELLION);
  const cw = scene.crisisManager.getActiveCrisis();
  assert.ok(cw instanceof ClockworkCrisis);

  // Advance to OUTBREAK (triggers conveyor belts on Row 6 & Col 7)
  cw.transitionToStage(CrisisStage.OUTBREAK);
  scene.update(1100, 16);

  // Place player on Row 6, Col 3 and step 200ms -> conveyor must push player East (+X)
  scene.player.setPosition(3 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  const startPlayerX = scene.player.x;
  scene.update(1300, 200);
  assert.ok(scene.player.x > startPlayerX, 'Clockwork Row 6 conveyor must push player East');

  // Advance to CLIMAX -> grants +3 temporary bonus bomb slots
  const baseMaxBombs = scene.maxBombs;
  cw.transitionToStage(CrisisStage.CLIMAX);
  scene.update(1400, 16);
  assert.equal(scene.maxBombs, baseMaxBombs + 3, 'Clockwork Climax must grant +3 temporary maxBombs');

  // Saved run state must strip temporary crisis bonus so saves never permanently inflate maxBombs
  const snapDuringClimax = scene.captureRunState('auto');
  assert.equal(
    snapDuringClimax.player.stats.maxBombs,
    baseMaxBombs,
    'captureRunState must strip temporary Clockwork bonus bomb slots'
  );

  // Plant 2 player bombs: one fresh (2000ms > 500ms -> disarm & refund), one imminent (300ms <= 500ms -> detonate)
  scene.player.setPosition(2 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  scene.placeBomb();
  const freshBomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(freshBomb);
  freshBomb.getData('fuseTimer').delayMs = 1800;

  scene.player.setPosition(4 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  scene.placeBomb();
  const imminentBomb = scene.bombs.getChildren().find((b) => b.active && b !== freshBomb);
  assert.ok(imminentBomb);
  imminentBomb.getData('fuseTimer').delayMs = 250;
  assert.equal(scene.activeBombs, 2);

  // Fire Clockwork EMP pulse -> fresh bomb disarmed, imminent bomb detonated, activeBombs refunded to 0
  cw.totalEmpPulsesFired += 1;
  scene.update(1500, 16);
  assert.equal(freshBomb.active, false);
  assert.equal(imminentBomb.active, false);
  assert.equal(scene.activeBombs, 0, 'EMP disarm + detonate must cleanly refund all player bomb slots');
  assert.ok(
    floatingTexts.some((t) => t.includes('EMP DISARMED')),
    'EMP disarm must emit tactical floating text feedback'
  );

  // Stopping crisis clears temporary +3 bomb slots
  scene.stopCrisisMode();
  assert.equal(scene.maxBombs, baseMaxBombs, 'stopCrisisMode must restore base maxBombs');

  scene.shutdown();
});

test('Cycle 47.5: Live SolarFlareCrisis, LavaCrisis, RiftCrisis & OrbitalCrisis arena interactions', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  // 1. SolarFlareCrisis: exposed bomb flash-ignites & exposed player takes flare hit
  scene.startCrisisMode(CrisisType.SOLAR_FLARES);
  const solar = scene.crisisManager.getActiveCrisis();
  assert.ok(solar instanceof SolarFlareCrisis);
  solar.transitionToStage(CrisisStage.OUTBREAK);
  solar.isCmeSweeping = true;
  solar.cmeSweepRemainingMs = 800;

  // Row 1, Col 1 has no pillar on row/col? Wait: pillars are at even (r,c). (1,1) is odd row & odd col -> exposed!
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.isInvulnerable = false;
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  const solarBomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(solarBomb);

  scene.update(2000, 16);
  assert.equal(solarBomb.active, false, 'Exposed bomb must flash-ignited during Solar CME sweep');
  assert.equal(scene.shieldCharges, 0, 'Exposed player must take Solar CME sweep damage');

  // 2. LavaCrisis: unprotected item incineration + bomb flash-detonation quenching lava into OBSIDIAN_BLOCK
  scene.startCrisisMode(CrisisType.CREEPING_LAVA);
  const lava = scene.crisisManager.getActiveCrisis();
  assert.ok(lava instanceof LavaCrisis);
  lava.transitionToStage(CrisisStage.OUTBREAK); // Ring 1 (outer perimeter r=1, r=11, c=1, c=13) becomes LAVA_SURFACE
  assert.equal(lava.getHazardAt(1, 3)?.type, HazardType.LAVA_SURFACE);

  // Spawn expired-grace item on lava tile (1, 3) and plant bomb on lava tile (1, 5)
  scene.time.now = 5000;
  scene.spawnItem(1, 3, 'FIRE_UP', 1000);
  const lavaItem = scene.items.getChildren().find((i) => i.active);
  assert.ok(lavaItem);

  scene.isInvulnerable = true;
  scene.shieldInvulnerableUntil = 999999;
  scene.player.setPosition(5 * TILE_SIZE + 20, 1 * TILE_SIZE + 20); // (r=1, c=5)
  scene.placeBomb();
  const lavaBomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(lavaBomb);

  scene.update(5100, 16);
  assert.equal(lavaItem.active, false, 'Unprotected item on molten lava must be incinerated');
  assert.equal(lavaBomb.active, false, 'Bomb on molten lava must flash-detonate');
  assert.equal(
    lava.getHazardAt(1, 5)?.type,
    HazardType.OBSIDIAN_BLOCK,
    'Bomb detonation on lava must quench molten tile into OBSIDIAN_BLOCK'
  );

  // 3. RiftCrisis: stepping onto active subspace rift (3, 4) warps player to next rift (6, 10)
  scene.startCrisisMode(CrisisType.DIMENSIONAL_RIFTS);
  const rift = scene.crisisManager.getActiveCrisis();
  assert.ok(rift instanceof RiftCrisis);
  rift.transitionToStage(CrisisStage.OUTBREAK);
  scene.portalCooldown = 0;
  scene.player.setPosition(4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20); // rift[0] = (3, 4)
  scene.update(5300, 16);
  for (const tw of Array.from(activeTweens)) {
    if (tw.targets === scene.player && typeof tw.complete === 'function') {
      tw.complete();
    }
  }
  assert.equal(Math.floor(scene.player.y / TILE_SIZE), 6, 'Rift warp must move player to next rift row (6)');
  assert.equal(Math.floor(scene.player.x / TILE_SIZE), 10, 'Rift warp must move player to next rift col (10)');

  // 4. OrbitalCrisis: KINETIC_CRATER & CrisisStage.FAILED damage player
  scene.startCrisisMode(CrisisType.ORBITAL_BOMBARDMENT);
  const orbital = scene.crisisManager.getActiveCrisis();
  assert.ok(orbital instanceof OrbitalCrisis);
  orbital.transitionToStage(CrisisStage.OUTBREAK);
  orbital.setHazardTile(5, 5, HazardType.KINETIC_CRATER, 1.0);
  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.player.setPosition(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.update(5500, 16);
  assert.equal(scene.shieldCharges, 0, 'Standing in fresh KINETIC_CRATER must damage unprotected/shielded player');

  // Test CrisisStage.FAILED catastrophic collapse hit
  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  orbital.stage = CrisisStage.FAILED;
  scene.update(5700, 16);
  assert.equal(scene.shieldCharges, 0, 'CrisisStage.FAILED must trigger catastrophic collapse hit');

  scene.shutdown();
});

test('Cycle 47.6: Live SteamToyTitanBoss (facingAngle, deflected gear shard, steam slow) & GummyBearBoss (landing shockwave + 2.2s HUD stun, gelatin deflection, cub lifecycle)', () => {
  const { scene, floatingTexts } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  // --- Part A: SteamToyTitanBoss ---
  scene.startBossEncounter('steam_toy_titan');
  const titan = scene.activeBoss;
  assert.ok(titan instanceof SteamToyTitanBoss);
  titan.bossState = BossState.PHASE_2;
  titan.gearShieldActive = true;

  // Move Titan East toward player at (500, 260), then halt velocity (stationary windup)
  titan.x = 300;
  titan.y = 260;
  titan.vx = 50;
  titan.vy = 0;
  titan.update(16, 500, 260);
  titan.vx = 0;
  titan.vy = 0;
  assert.ok(Math.abs(titan.getFacingAngle()) < 0.25, 'Stationary Titan must preserve East facingAngle');
  assert.equal(
    titan.checkGearDeflection(380, 260),
    true,
    'Frontal blast at East-facing stationary Titan must be deflected by Gear Shield'
  );

  // Trigger frontal explosion against Titan -> spawns deflected gear shard toward blast source -> hits player
  scene.hasShield = true;
  scene.shieldCharges = 2;
  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  scene.player.setPosition(380, 260);
  scene.spawnExplosion(Math.floor(260 / TILE_SIZE), Math.floor(340 / TILE_SIZE), true, 'player', 'bomb_titan_front');
  assert.ok(titan.gearProjectilePool.activeCount >= 1, 'Frontal blast deflection must spawn pooled gear shard');
  assert.ok(floatingTexts.some((t) => t.includes('GEAR DEFLECTED')));

  // Step scene update so gear shard collides with player at (380, 260)
  for (let step = 0; step < 20 && scene.shieldCharges === 2; step++) {
    scene.time.now += 16;
    scene.update(scene.time.now, 16);
  }
  assert.equal(scene.shieldCharges, 1, 'Deflected gear shard must collide with player and consume shield');

  // Steam Vent slow check (inside steam aura <= 88px, outside Titan physical contact < 56px)
  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  const speedBeforeSteam = scene.playerSpeed;
  titan.isSteamVenting = true;
  titan.steamVentDurationTimerMs = 500;
  scene.player.setPosition(titan.x + 70, titan.y);
  scene.time.now += 16;
  scene.update(scene.time.now, 16);
  assert.ok(scene.playerSpeed < speedBeforeSteam, 'Titan steam venting must apply slow debuff to nearby player');

  // --- Part B: GummyBearBoss ---
  scene.startBossEncounter('boss_gummy_bear');
  const gummy = scene.activeBoss;
  assert.ok(gummy instanceof GummyBearBoss);
  gummy.bossState = BossState.PHASE_2;
  gummy.x = 300;
  gummy.y = 260;
  scene.player.setPosition(60, 60);

  // 1. Marching gelatin skin deflects bomb blasts with feedback
  scene.spawnExplosion(Math.floor(260 / TILE_SIZE), Math.floor(300 / TILE_SIZE), true, 'player', 'bomb_gummy_deflect');
  assert.ok(
    floatingTexts.some((t) => t.includes('GELATIN SKIN DEFLECTED')),
    'Marching GummyBearBoss must emit gelatin skin deflection feedback'
  );

  // 2. Normal touchdown (no bomb lure) emits Sugar Crush shockwave, syncs 2.2s BossHUD stun, and spawns Phase 2 cubs
  gummy.phase = 2;
  gummy.leapCount = 1;
  gummy.initiateRoyalLeap(300, 260, 10); // Increments leapCount -> 2 (even -> Jelly Budding 2 cubs on touchdown)
  scene.time.now += 16;
  scene.update(scene.time.now, 16);

  assert.equal(gummy.bossState, BossState.STUNNED);
  assert.equal(scene.bossHUD.getState().isStunned, true, 'Standard Sugar Crush landing must sync BossHUD stun state');
  assert.ok(
    scene.bossAttackManager.shockwavePool.activeCount >= 1,
    'Standard Sugar Crush landing must emit pooled shockwave'
  );

  const spawnedCubs = scene.enemies
    .getChildren()
    .filter((e) => e.active && e instanceof MiniSplitterEnemy && e.bossOwnerRef === gummy);
  assert.equal(spawnedCubs.length, 2, 'Phase 2 Jelly Budding must spawn 2 live MiniSplitterEnemy cubs');
  assert.equal(gummy.activeCubCount, 2);

  // Defeating cubs must automatically decrement gummy.activeCubCount via zero-closure bossOwnerRef
  spawnedCubs[0].takeDamage(10, 'player', scene.time.now);
  assert.equal(gummy.activeCubCount, 1, 'Defeating a Gummy cub must decrement boss.activeCubCount');
  spawnedCubs[1].takeDamage(10, 'player', scene.time.now);
  assert.equal(gummy.activeCubCount, 0);

  scene.shutdown();
});

test('Cycle 47.7: Live ShieldGuardAlly taunt aggro redirection + BOSS_RUSH 5-boss gauntlet & CRISIS_SURVIVAL rotation', () => {
  const { scene, gameEmitter, activeTimers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);
  scene.isInvulnerable = true;
  scene.shieldInvulnerableUntil = 999999;

  // 1. ShieldGuardAlly taunt aggro redirection
  // Place player far West at (2, 2), ShieldGuard at (6, 6), ChaserEnemy at (6, 8) (within 5 tiles of Guard, far from Player)
  scene.player.setPosition(2 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  const guard = new ShieldGuardAlly(scene, 6 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.allies.add(guard);
  const chaser = new ChaserEnemy(scene, 8 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.enemies.add(chaser);

  // Trigger guard taunt pulse (tauntTimer starts at 4000ms)
  guard.tauntTimer = 10;
  scene.time.now = 3000;
  scene.update(3000, 16);
  assert.equal(chaser.tauntTarget, guard, 'ShieldGuardAlly taunt pulse must set enemy.tauntTarget to Aegis');
  assert.equal(chaser.tauntedUntil, 5500);

  // Move Guard East of Chaser to (6, 11) while Player stays West at (2, 2); Chaser enters WINDUP (350ms) then ATTACK (+vx)!
  guard.setPosition(11 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.time.now = 3200;
  scene.update(3200, 100); // Triggers WINDUP toward Guard (+X)
  scene.time.now = 3600;
  scene.update(3600, 400); // Completes 350ms WINDUP -> launches Eastward ATTACK dash!
  assert.ok(
    chaser.body.velocity.x > 0,
    `Taunted enemy must move East toward ShieldGuard (+vx), got vx=${chaser.body.velocity.x}`
  );

  // Advance past tauntedUntil (5500ms) -> taunt expires cleanly
  scene.time.now = 5600;
  scene.update(5600, 16);
  assert.equal(chaser.tauntTarget, null, 'Expired taunt must clear tauntTarget reference cleanly');
  scene.enemies.clear(true, true);
  scene.allies.clear(true, true);

  // 2. BOSS_RUSH 5-boss gauntlet progression + completion bonus
  gameEmitter.emit('mode-changed', 'boss_rush');
  assert.equal(scene.activeGameMode, GameModeType.BOSS_RUSH);
  assert.equal(scene.currentBossIndex, 0);
  assert.ok(scene.activeBoss);

  for (let idx = 0; idx < BOSS_RUSH_SEQUENCE.length; idx++) {
    assert.ok(scene.activeBoss, `Boss #${idx + 1} must be active in BOSS_RUSH`);
    scene.activeBoss.currentHp = 0;
    scene.activeBoss.bossState = BossState.DEFEATED;
    scene.time.now += 16;
    scene.update(scene.time.now, 16);

    if (idx < BOSS_RUSH_SEQUENCE.length - 1) {
      const bossTimer = activeTimers.find((t) => !t.removed && t.delayMs === 1200);
      assert.ok(bossTimer, `Next boss timer must be scheduled after defeating boss #${idx + 1}`);
      bossTimer.removed = true;
      bossTimer.callback();
      assert.equal(scene.currentBossIndex, idx + 1);
    }
  }
  assert.equal(scene.activeBoss, null, 'All 5 bosses defeated -> BOSS_RUSH gauntlet complete');
  assert.ok(scene.score >= 5 * 5000 + 10000, 'BOSS_RUSH completion must award +10000 bonus score');

  // 3. CRISIS_SURVIVAL continuous crisis rotation
  gameEmitter.emit('mode-changed', 'crisis_survival');
  assert.equal(scene.activeGameMode, GameModeType.CRISIS_SURVIVAL);
  const firstCrisis = scene.crisisManager.getActiveCrisis();
  assert.ok(firstCrisis);
  firstCrisis.stage = CrisisStage.RESOLVED;
  scene.time.now += 16;
  scene.update(scene.time.now, 16);

  const nextCrisisTimer = activeTimers.find((t) => !t.removed && t.delayMs === 1800);
  assert.ok(nextCrisisTimer, 'CRISIS_SURVIVAL must schedule next crisis rotation on resolution');
  nextCrisisTimer.removed = true;
  nextCrisisTimer.callback();
  assert.equal(scene.crisisManager.isCrisisActive(), true, 'CRISIS_SURVIVAL must automatically start next crisis');

  scene.shutdown();
});

test('Cycle 47.8: 10,000-frame continuous Zero-GC soak across active crises, SteamToyTitanBoss, GummyBearBoss, ShieldGuardAlly & hazards', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness({ recordDrawCalls: false });
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();
  scene.isInvulnerable = true;
  scene.shieldInvulnerableUntil = Number.MAX_SAFE_INTEGER;

  // Keep a live ShieldGuardAlly and ChaserEnemy in the arena alongside bosses & rotating crises
  scene.enemies.clear(true, true);
  scene.allies.clear(true, true);
  scene.neutrals.clear(true, true);
  const guard = new ShieldGuardAlly(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.allies.add(guard);
  const chaser = new ChaserEnemy(scene, 9 * TILE_SIZE + 20, 9 * TILE_SIZE + 20);
  scene.enemies.add(chaser);

  scene.startBossEncounter('steam_toy_titan');
  scene.startCrisisMode(CrisisType.CLOCKWORK_REBELLION);
  scene.crisisManager.getActiveCrisis().transitionToStage(CrisisStage.OUTBREAK);

  // Record 80 bomb IDs to verify bossHitBombIds stays strictly bounded <= 64
  for (let i = 0; i < 80; i++) {
    scene.recordBossHitBombId(`soak_bomb_${i}`);
  }
  assert.ok(scene.bossHitBombIds.size <= 64, 'bossHitBombIds must stay bounded <= 64');

  const crisisRotation = [
    CrisisType.CLOCKWORK_REBELLION,
    CrisisType.SOLAR_FLARES,
    CrisisType.CREEPING_LAVA,
    CrisisType.DIMENSIONAL_RIFTS,
    CrisisType.ORBITAL_BOMBARDMENT,
  ];

  // Warmup lazy audio singletons & pooled MiniSplitterEnemy cub slots before patching Set for Zero-GC check
  for (const ct of crisisRotation) {
    scene.crisisManager.triggerCrisis(ct);
  }
  for (let c = 0; c < 4; c++) {
    const warmCub = new MiniSplitterEnemy(scene, 60, 60);
    warmCub.archetype = 'SPLITTER_MINI';
    scene.enemies.add(warmCub);
    warmCub.die(1000);
  }
  scene.startBossEncounter('steam_toy_titan');
  scene.startCrisisMode(CrisisType.CLOCKWORK_REBELLION);
  scene.crisisManager.getActiveCrisis().transitionToStage(CrisisStage.OUTBREAK);

  for (let f = 0; f < 200; f++) {
    scene.time.now += 16;
    scene.update(scene.time.now, 16);
  }

  const OrigSet = globalThis.Set;
  let setAllocations = 0;
  const PatchedSet = class extends OrigSet {
    constructor(...args) {
      setAllocations++;
      super(...args);
    }
  };

  if (typeof globalThis.gc === 'function') globalThis.gc();
  const heapStart = process.memoryUsage().heapUsed;

  try {
    globalThis.Set = PatchedSet;
    for (let frame = 0; frame < 10000; frame++) {
      // Switch encounter at frame 5000 (temporarily restore Set during one-time boss audio init)
      if (frame === 5000) {
        globalThis.Set = OrigSet;
        scene.startBossEncounter('boss_gummy_bear');
        if (scene.activeBoss) {
          scene.activeBoss.bossState = BossState.PHASE_2;
          scene.activeBoss.phase = 2;
        }
        globalThis.Set = PatchedSet;
      }

      scene.time.now += 16;
      const angle = frame * 0.03;
      const px = 300 + Math.cos(angle) * 120;
      const py = 260 + Math.sin(angle) * 100;
      scene.player.setPosition(px, py);

      if (frame > 0 && frame % 2000 === 0) {
        const nextType = crisisRotation[(frame / 2000) % crisisRotation.length];
        scene.crisisManager.triggerCrisis(nextType);
        scene.crisisManager.getActiveCrisis()?.transitionToStage(CrisisStage.OUTBREAK);
      }

      scene.update(scene.time.now, 16);

      // Flush completed visual tweens periodically so pooled VFX arcs/texts return to pools as in real Phaser
      if (frame % 30 === 0 && activeTweens.size > 0) {
        for (const tw of OrigSet.prototype.values.call(activeTweens)) {
          if (!tw.repeat || tw.repeat !== -1) {
            tw.complete();
          }
        }
      }
    }
  } finally {
    globalThis.Set = OrigSet;
  }

  // Flush remaining finite tweens
  for (const tw of Array.from(activeTweens)) {
    if (tw.repeat !== -1) tw.complete();
  }

  if (typeof globalThis.gc === 'function') globalThis.gc();
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapStart) / (1024 * 1024);

  assert.equal(setAllocations, 0, '10,000-frame soak must allocate 0 new Set instances');
  assert.equal(scene.circlePool.activeCount, 0, 'circlePool must have 0 leaked arcs after tween completion');
  assert.equal(scene.floatingTextPool.activeCount, 0, 'floatingTextPool must have 0 leaked texts after tween completion');
  assert.ok(scene.bossHitBombIds.size <= 64, 'bossHitBombIds must remain bounded <= 64');
  assert.ok(heapDeltaMb < 45, `10,000-frame soak heap growth must stay bounded (< 45 MB), got ${heapDeltaMb.toFixed(2)} MB`);

  scene.shutdown();
});
