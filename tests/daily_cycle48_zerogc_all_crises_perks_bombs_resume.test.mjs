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
} = await import('../src/game/entities/EnemyEntities.ts');
const { ShieldGuardAlly, PetDroneAlly } = await import('../src/game/entities/AllyEntities.ts');
const { MerchantNPC, CritterNPC } = await import('../src/game/entities/NeutralEntities.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} = await import('../src/game/pathfinding.ts');
const {
  BossState,
  HamsterBoss,
  QueenBeeBoss,
  GummyBearBoss,
  MutantFloraBoss,
} = await import('../src/game/bosses/index.ts');
const {
  CrisisStage,
  CrisisType,
  HazardType,
  VoidCrisis,
  PsychicCrisis,
  RiftCrisis,
  SolarFlareCrisis,
} = await import('../src/game/crises/index.ts');
const {
  rollItemDrop,
  applyItemEffect,
  createInitialPlayerStats,
} = await import('../src/game/gameplay_mechanics.ts');
const {
  renderMeteorStreak,
  renderScorchDecal,
} = await import('../src/game/ultimate_skills.ts');

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

test('Cycle 48.1: Zero-GC BaseCrisis/SolarFlare deserialization, renderMeteorStreak/ScorchDecal invariants, safeDisableSpriteBody guard, & idle hazardGraphics gating', () => {
  // 1. BaseCrisis.deserialize in-place slot reuse + SolarFlareCrisis resetVentsInPlace anti-leak
  const solar = new SolarFlareCrisis();
  solar.init();
  solar.vents[0].isCooled = true;
  solar.vents[1].isCooled = true;

  const snap = solar.serialize();
  const prevObjRef = solar.objectives[0];
  solar.triggerAlert('a1', 'Title', 'Msg', 'warning', '☀️', 3000);
  const prevAlertRef = solar.activeAlert;

  // Deserialize payload with omitted vents (and omitted extraState): must reset stale cooled vents cleanly!
  solar.deserialize({
    ...snap,
    activeAlert: { id: 'a2', title: 'New', message: 'Body', level: 'critical', icon: '🔥', durationMs: 1200, remainingMs: 1200 },
    extraState: undefined,
  });
  assert.strictEqual(solar.objectives[0], prevObjRef, 'BaseCrisis.deserialize must reuse objective object slot in-place');
  assert.strictEqual(solar.activeAlert, prevAlertRef, 'BaseCrisis.deserialize must mutate existing activeAlert in-place');
  assert.equal(solar.activeAlert.id, 'a2');
  assert.equal(solar.vents[0].isCooled, false, 'SolarFlareCrisis must reset vents when omitted from extra payload');
  assert.equal(solar.vents[1].isCooled, false);

  // 2. renderMeteorStreak zero-array tween target & renderScorchDecal alpha <= 0.40
  const { scene, tweenConfigs, graphicsFillAlphas, activeTweens } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();

  tweenConfigs.length = 0;
  let completed = false;
  renderMeteorStreak(scene, 220, 260, () => {
    completed = true;
  });
  assert.ok(tweenConfigs.length >= 1);
  const meteorTw = tweenConfigs[tweenConfigs.length - 1];
  assert.equal(Array.isArray(meteorTw.targets), false, 'renderMeteorStreak must pass single target without allocating [meteor, corona]');
  while (activeTweens.size > 0) {
    for (const tw of Array.from(activeTweens)) {
      if (typeof tw.complete === 'function') tw.complete();
    }
  }
  assert.equal(completed, true);
  assert.equal(scene.circlePool.activeCount, 0, 'Meteor & corona circles must return to circlePool');

  graphicsFillAlphas.length = 0;
  renderScorchDecal(scene, 200, 200, 1000);
  for (const entry of graphicsFillAlphas) {
    assert.ok(entry.alpha <= 0.40, `renderScorchDecal alpha (${entry.alpha}) must stay <= 0.40`);
  }
  for (const tw of Array.from(activeTweens)) {
    if (typeof tw.complete === 'function') tw.complete();
  }
  assert.equal(scene.circlePool.activeCount, 0);

  // 3. safeDisableSpriteBody guards against headless Phaser 4 disableBody TypeError
  const brokenBomb = scene.acquirePooledGroupSprite(scene.bombs, 100, 100, 'bomb');
  brokenBomb.disableBody = () => {
    throw new TypeError("Cannot read properties of undefined (reading 'stop')");
  };
  brokenBomb.setData('id', 'broken_1');
  brokenBomb.setData('owner', 'player');
  brokenBomb.setData('power', 1);
  scene.activeBombs = 1;
  assert.doesNotThrow(() => {
    scene.explodeBomb(brokenBomb, 2, 2);
  });
  assert.equal(brokenBomb.active, false);
  assert.equal(brokenBomb.body.enable, false);

  // 4. Idle hazardGraphics.clear() gating across 60 idle frames
  scene.hazardGraphics.clearCount = 0;
  for (let f = 0; f < 60; f++) {
    scene.update(2000 + f * 16, 16);
  }
  assert.equal(scene.hazardGraphics.clearCount, 0, 'Idle hazardGraphics must not clear when all 10 hazards are dormant/inactive');

  scene.shutdown();
});

test('Cycle 48.2: Live VoidCrisis, PsychicCrisis, & RiftCrisis arena interactions + AI persistentHazardMask merging', () => {
  const { scene, floatingTexts } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();

  // 1. VoidCrisis: VOID_CREEP slows player outside Prism aura, charged Prism 3x3 Sanctuary Aura grants immunity, Climax Avatar damages on (6,7)
  scene.startCrisisMode(CrisisType.PASTEL_VOID);
  const voidCrisis = scene.crisisManager.getActiveCrisis();
  assert.ok(voidCrisis instanceof VoidCrisis);
  voidCrisis.stage = CrisisStage.OUTBREAK;
  voidCrisis.setHazardTile(2, 12, HazardType.VOID_CREEP, 0.8, 0, 0);

  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  scene.player.setPosition(12 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  const baseSpeed = scene.playerSpeed;
  scene.update(3000, 16);
  assert.ok(scene.playerSpeed < baseSpeed, 'Stepping on unshielded VOID_CREEP must apply slow');
  assert.equal(scene.persistentHazardMask.getCoord(2, 12), 1, 'VOID_CREEP must populate AI persistentHazardMask');

  // Charge Prism at (1, 13) -> 3x3 Sanctuary Aura covers (2, 12)
  if (scene.activeStompSlowTimer) {
    scene.activeStompSlowTimer.callback();
  }
  voidCrisis.prisms[0].isCharged = true;
  voidCrisis.setHazardTile(2, 12, HazardType.VOID_CREEP, 0.8, 0, 0);
  scene.update(3100, 16);
  assert.equal(scene.playerSpeed, baseSpeed, 'Charged Prism 3x3 Sanctuary Aura must protect player from VOID_CREEP slow');

  // Climax Shielded Void Avatar at (6, 7)
  voidCrisis.stage = CrisisStage.CLIMAX;
  voidCrisis.avatarSpawned = true;
  voidCrisis.avatarHp = 3;
  voidCrisis.avatarShieldActive = true;
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.player.setPosition(7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.update(3200, 16);
  assert.equal(scene.hasShield, false, 'Contacting shielded Climax Void Avatar at (6, 7) must damage player');

  // 2. PsychicCrisis: PSIONIC_DISRUPTION applies Phase Jitter when walking, Dashing dispels for +150 score & Distortion Barrier
  scene.startCrisisMode(CrisisType.PSYCHIC_INVASION);
  const psychicCrisis = scene.crisisManager.getActiveCrisis();
  assert.ok(psychicCrisis instanceof PsychicCrisis);
  psychicCrisis.stage = CrisisStage.OUTBREAK;
  psychicCrisis.setHazardTile(4, 4, HazardType.PSIONIC_DISRUPTION, 0.8, 5000, 0);
  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  scene.player.setPosition(4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.update(4000, 16);
  assert.ok(scene.phaseJitterRemaining > 0, 'Walking onto PSIONIC_DISRUPTION without barrier must apply Phase Jitter');
  assert.equal(scene.persistentHazardMask.getCoord(4, 4), 1, 'PSIONIC_DISRUPTION must populate AI persistentHazardMask');

  // Dash on Psionic Illusion tile (5, 5) -> dispels +150 score + Distortion Barrier
  psychicCrisis.setHazardTile(5, 5, HazardType.PSIONIC_ILLUSION, 0.8, 5000, 0);
  scene.player.setPosition(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  const preDispelScore = scene.score;
  floatingTexts.length = 0;
  scene.performDash();
  assert.equal(scene.score, preDispelScore + 150, 'Dashing through Psionic Illusion must award +150 score');
  assert.equal(psychicCrisis.hasIllusionAt(5, 5), false, 'Illusion hazard tile must be cleared on dash dispel');
  assert.equal(scene.hasBuff('DISTORTION_BARRIER'), true, 'Dash dispel must grant DISTORTION_BARRIER');

  // 3. RiftCrisis: Toroidal corridor wrap-around at arena perimeter
  scene.startCrisisMode(CrisisType.DIMENSIONAL_RIFTS);
  const riftCrisis = scene.crisisManager.getActiveCrisis();
  assert.ok(riftCrisis instanceof RiftCrisis);
  riftCrisis.stage = CrisisStage.OUTBREAK;
  scene.portalCooldown = 0;
  scene.tweens = null; // immediate warp without yoyo tween delay
  scene.player.setPosition(0 * TILE_SIZE + 20, 5 * TILE_SIZE + 20); // col 0 -> wraps to COLS - 2
  scene.update(5000, 16);
  assert.equal(Math.floor(scene.player.x / TILE_SIZE), COLS - 2, 'RiftCrisis Outbreak must toroidally wrap col 0 to COLS - 2');

  scene.shutdown();
});

test('Cycle 48.3: Live QueenBeeBoss Royal Dive Crater Shockwave & HamsterBoss Phase 2/Enraged Wall Rebound Shockwave', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();

  // 1. QueenBeeBoss unblocked dive impact spawns pooled Royal Dive Crater Shockwave
  scene.startBossEncounter('queen_bee_cupcake');
  assert.ok(scene.activeBoss instanceof QueenBeeBoss);
  assert.strictEqual(scene.activeBoss.attackManager, scene.bossAttackManager);
  scene.activeBoss.bossState = BossState.PHASE_1;
  scene.activeBoss.isDiving = true;
  scene.activeBoss.targetDiveX = 7 * TILE_SIZE + 20;
  scene.activeBoss.targetDiveY = 6 * TILE_SIZE + 20;
  const swBeforeQueen = scene.bossAttackManager.shockwavePool.activeCount;
  scene.activeBoss.onDiveImpact(false);
  assert.equal(scene.bossAttackManager.shockwavePool.activeCount, swBeforeQueen + 1, 'QueenBeeBoss unblocked dive must spawn pooled shockwave');
  const qSw = scene.bossAttackManager.shockwavePool.getActive(0);
  assert.equal(qSw.maxRadius, 92);

  // 2. HamsterBoss Phase 2 wall rebound spawns pooled Kinetic Rebound Shockwave + AI telegraph corridor
  scene.startBossEncounter('captain_nibbles');
  assert.ok(scene.activeBoss instanceof HamsterBoss);
  assert.strictEqual(scene.activeBoss.attackManager, scene.bossAttackManager);
  scene.activeBoss.bossState = BossState.PHASE_2;
  scene.activeBoss.isReving = true;
  scene.activeBoss.x = 3 * TILE_SIZE + 20;
  scene.activeBoss.y = 3 * TILE_SIZE + 20;
  scene.activeBoss.dashDirection = { x: 1, y: 0 };
  scene.update(6000, 16);
  assert.equal(scene.persistentHazardMask.getCoord(3, 4), 1, 'HamsterBoss revving dash corridor must populate AI persistentHazardMask');

  scene.activeBoss.isReving = false;
  scene.activeBoss.isDashing = true;
  const swBeforeHamster = scene.bossAttackManager.shockwavePool.activeCount;
  scene.activeBoss.onWallImpact();
  assert.equal(scene.bossAttackManager.shockwavePool.activeCount, swBeforeHamster + 1, 'HamsterBoss Phase 2 wall impact must spawn pooled shockwave');

  // Verify GummyBearBoss & MutantFloraBoss AI persistentHazardMask population
  scene.startBossEncounter('king_gummy_bear');
  assert.ok(scene.activeBoss instanceof GummyBearBoss);
  scene.activeBoss.bossState = BossState.PHASE_1;
  scene.activeBoss.isAirborne = true;
  scene.activeBoss.targetLandingX = 8 * TILE_SIZE + 20;
  scene.activeBoss.targetLandingY = 5 * TILE_SIZE + 20;
  scene.update(6100, 16);
  assert.equal(scene.persistentHazardMask.getCoord(5, 8), 1, 'GummyBearBoss landing reticle must populate AI persistentHazardMask');

  scene.startBossEncounter('boss_mutant_flora');
  assert.ok(scene.activeBoss instanceof MutantFloraBoss);
  scene.activeBoss.bossState = BossState.PHASE_1;
  const root = scene.activeBoss.rootPool.acquire();
  root.active = true;
  root.x = 6 * TILE_SIZE + 20;
  root.y = 4 * TILE_SIZE + 20;
  scene.update(6200, 16);
  assert.equal(scene.persistentHazardMask.getCoord(4, 6), 1, 'MutantFloraBoss active root must populate AI persistentHazardMask');

  scene.shutdown();
});

test('Cycle 48.4: Live Perks (golden_touch, sweet_tooth, titan_heart, quick_wick, chain_reaction, dash_decoy) & Defensive Items (DEFLECTOR, BLAST_RESIST)', () => {
  // 1. sweet_tooth dropRateBonus in rollItemDrop + zero-closure applyItemEffect buff refresh
  const stats = createInitialPlayerStats();
  assert.equal(rollItemDrop(() => 0.52, stats, 'BLOCK', 0), null, 'Base 0.45 drop rate must not drop at rng=0.52');
  assert.ok(rollItemDrop(() => 0.52, stats, 'BLOCK', 0.15) !== null, '+15% sweet_tooth bonus (0.60 total) must drop at rng=0.52');

  applyItemEffect('SPEED_SURGE', stats);
  const buffSlotRef = stats.activeBuffs[0];
  buffSlotRef.remainingMs = 1200;
  applyItemEffect('SPEED_SURGE', stats);
  assert.strictEqual(stats.activeBuffs[0], buffSlotRef, 'Refreshing SPEED_SURGE must reuse existing buff slot');
  assert.equal(stats.activeBuffs[0].remainingMs, 8000);

  // 2. titan_heart, golden_touch, quick_wick, chain_reaction, dash_decoy in GameScene
  const { scene, gameEmitter, activeTimers, overlapHandlers, activeTweens } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  gameEmitter.emit('perks-updated', {
    quick_wick: 3, // -25% fuse: 2000ms -> 1500ms
    chain_reaction: 2, // +50% chain combo score (+100) & +10% ult charge (+10)
    titan_heart: 1, // +1 extra heart container
    golden_touch: 1, // 5% gilded chest chance
    sweet_tooth: 3, // +15% drop rate
    dash_decoy: 1, // hologram decoy + dazzle stun
  });
  assert.equal(scene.extraLives, 1, 'titan_heart perk must grant starting extra life');

  const origRandomGild = Math.random;
  Math.random = () => 0.02; // < 0.05 golden_touch threshold AND < 0.60 block spawn threshold
  try {
    scene.generateMap();
  } finally {
    Math.random = origRandomGild;
  }
  const blockChildren = scene.blocks.getChildren().filter((b) => b.active);
  assert.ok(blockChildren.length > 0);
  assert.ok(blockChildren.every((b) => b.getData('isChest') === true), 'golden_touch must gild generated soft blocks into chests when roll < 0.05');

  // quick_wick + chain_reaction test (use non-spire corridor tiles (1, 2) & (1, 3))
  scene.map = createCorridorOpenMap();
  scene.maxBombs = 4;
  scene.bombPower = 3;
  scene.ultimateGauge = 0;
  activeTimers.length = 0;
  scene.player.setPosition(2 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  const firstBombTimer = activeTimers[activeTimers.length - 1];
  assert.equal(firstBombTimer.delayMs, 1500, 'quick_wick 25% reduction must compress base fuse from 2000ms to 1500ms');

  scene.player.setPosition(3 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  const bombs = scene.bombs.getChildren().filter((b) => b.active);
  assert.equal(bombs.length, 2);
  const preChainScore = scene.score;
  scene.explodeBomb(bombs[0], 1, 2);
  assert.equal(scene.score, preChainScore + 100, 'Chained player bomb detonation must award chain_reaction score bonus (+100 at lvl 2)');
  assert.equal(scene.ultimateGauge, 10, 'Chained player bomb detonation must award chain_reaction ult charge bonus (+10 at lvl 2)');

  // dash_decoy test: stuns nearby enemy & releases hologram sprite cleanly back to spritePool
  const chaser = new ChaserEnemy(scene, 4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(chaser);
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.performDash();
  assert.equal(chaser.isStunned, true, 'dash_decoy must dazzle-stun nearby enemy on dash');
  for (const tw of Array.from(activeTweens)) {
    if (typeof tw.complete === 'function') tw.complete();
  }
  assert.equal(scene.spritePool.activeCount, 0, 'dash_decoy hologram must return cleanly to spritePool');

  // 3. DEFLECTOR & BLAST_RESIST defensive items on player-explosion overlap
  const playerExplosionOverlap = overlapHandlers.find(
    (h) => h.objA === scene.player && h.objB === scene.explosions
  );
  assert.ok(playerExplosionOverlap, 'Player-explosion overlap handler must be registered');

  // DEFLECTOR while dashing converts enemy explosion to player owner
  const enemyExp = scene.createExplosionSprite(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20, 'enemy');
  scene.hasBlastDeflector = true;
  scene.isDashing = true;
  scene.isInvulnerable = false;
  playerExplosionOverlap.cb(scene.player, enemyExp);
  assert.equal(enemyExp.getData('owner'), 'player', 'DEFLECTOR during dash must reflect enemy explosion to player owner');
  assert.equal(enemyExp.tint, 0x2dd4bf);

  // BLAST_RESIST shrugs off blast when deterministic roll < 0.50
  scene.hasBlastDeflector = false;
  scene.isDashing = false;
  scene.hasBlastResist = true;
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.isInvulnerable = false;
  const origRandom = Math.random;
  Math.random = () => 0.20;
  try {
    const exp2 = scene.createExplosionSprite(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20, 'enemy');
    playerExplosionOverlap.cb(scene.player, exp2);
  } finally {
    Math.random = origRandom;
  }
  assert.equal(scene.hasShield, true, 'BLAST_RESIST proc must prevent player damage/shield loss');

  scene.shutdown();
});

test('Cycle 48.5: Live Special Bomb Variants (ICE_BOMB, POISON_MIST, CLUSTER_BOMB, LANDMINE, REMOTE_BOMB)', () => {
  const { scene, activeTimers, graphicsFillAlphas } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();
  for (const a of scene.allies.getChildren()) scene.safeDisableSpriteBody(a);
  scene.maxBombs = 6;
  scene.bombPower = 2;

  // 1. ICE_BOMB freezes enemy on blast tile for 3.0s
  const enemyIce = new ChaserEnemy(scene, 4 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.enemies.add(enemyIce);
  scene.activeBombType = 'ICE_BOMB';
  scene.player.setPosition(3 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  const iceBomb = scene.bombs.getChildren().find((b) => b.active && b.getData('type') === 'ICE_BOMB');
  assert.equal(iceBomb.tint, 0x38bdf8);
  const preBombClock = scene.time.now;
  scene.explodeBomb(iceBomb, 1, 3);
  assert.equal(enemyIce.isStunned, true, 'ICE_BOMB blast must freeze enemy');
  assert.ok(enemyIce.stunUntil >= preBombClock + 3000, 'ICE_BOMB blast must freeze enemy for 3000ms');

  // 2. POISON_MIST creates Zero-GC Float32Array cloud, renders alpha <= 0.28, slows enemy 60%, and cleans up on expiry
  enemyIce.reviveAt(6 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.activeBombType = 'POISON_MIST';
  scene.player.setPosition(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.placeBomb();
  const mistBomb = scene.bombs.getChildren().find((b) => b.active && b.getData('type') === 'POISON_MIST');
  scene.explodeBomb(mistBomb, 5, 5);
  assert.ok(scene.activePoisonMistCount > 0, 'POISON_MIST detonation must populate lingering mist tiles');

  scene.update(7000, 100);
  assert.ok(enemyIce.speedMultiplier <= 0.40, 'POISON_MIST cloud must slow enemy by 60% (multiplier <= 0.40)');
  const mistFillCalls = scene.poisonMistGraphics.drawCalls.filter((dc) => dc.op === 'fillStyle' || dc.op === 'fillRect');
  assert.ok(mistFillCalls.length > 0, 'poisonMistGraphics must render mist tiles while active');
  for (const dc of mistFillCalls) {
    assert.ok(dc.alpha <= 0.40, `Poison mist alpha (${dc.alpha}) must stay <= 0.40`);
  }
  scene.update(11000, 4000);
  assert.equal(scene.activePoisonMistCount, 0, 'POISON_MIST cloud must decay to 0 active tiles after 3.5s');

  // 3. CLUSTER_BOMB spawns 4 non-recursive pooled sub-munitions without leaking player activeBombs
  scene.enemies.clear(true, true);
  scene.deactivatePooledGroupSprites(scene.bombs);
  scene.activeBombs = 0;
  scene.activeBombType = 'CLUSTER_BOMB';
  scene.player.setPosition(7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.placeBomb();
  assert.equal(scene.activeBombs, 1);
  const clusterMain = scene.bombs.getChildren().find((b) => b.active && b.getData('type') === 'CLUSTER_BOMB');
  activeTimers.length = 0;
  scene.explodeBomb(clusterMain, 6, 7);
  assert.equal(scene.activeBombs, 0, 'CLUSTER_BOMB sub-bombs must not consume player activeBombs capacity');
  const subBombs = scene.bombs.getChildren().filter((b) => b.active && b.getData('isClusterSubBomb') === true);
  assert.equal(subBombs.length, 4, 'CLUSTER_BOMB on open cross must scatter 4 cardinal sub-munitions');
  // Detonate all 4 sub-bombs -> must NOT spawn recursive sub-sub-bombs
  for (const sb of subBombs) {
    scene.explodeBomb(sb, Math.floor(sb.y / TILE_SIZE), Math.floor(sb.x / TILE_SIZE));
  }
  assert.equal(scene.bombs.getChildren().filter((b) => b.active).length, 0, 'Cluster sub-munitions must be non-recursive');

  // 4. LANDMINE arms after 400ms (alpha 0.28) & proximity-detonates when enemy steps onto it
  scene.time.now = 12000;
  scene.activeBombType = 'LANDMINE';
  scene.player.setPosition(9 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  const mine = scene.bombs.getChildren().find((b) => b.active && b.getData('isLandmine') === true);
  assert.equal(mine.getData('isLandmine'), true);
  scene.time.now = 12500;
  scene.update(12500, 16);
  assert.equal(mine.alpha, 0.28, 'Armed LANDMINE must enter stealth alpha (0.28)');
  const runner = new ChaserEnemy(scene, 9 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.enemies.add(runner);
  scene.update(12520, 16);
  assert.equal(mine.active, false, 'Armed LANDMINE must proximity-detonate when enemy steps onto tile');

  // 5. REMOTE_BOMB detonates on manual detonateRemoteBombs()
  scene.enemies.clear(true, true);
  scene.deactivatePooledGroupSprites(scene.bombs);
  scene.activeBombs = 0;
  scene.activeBombType = 'REMOTE_BOMB';
  scene.player.setPosition(2 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  scene.player.setPosition(5 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  assert.equal(scene.bombs.getChildren().filter((b) => b.active).length, 2);
  const detonated = scene.detonateRemoteBombs();
  assert.equal(detonated, 2, 'detonateRemoteBombs() must detonate all active remote bombs');
  assert.equal(scene.bombs.getChildren().filter((b) => b.active).length, 0);
  assert.equal(scene.activeBombs, 0);

  scene.shutdown();
});

test('Cycle 48.6: Full captureRunState -> onResumeRunState round-trip for activeAllies, activeNeutrals, & special bomb variants', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();

  // Configure custom enemy, custom ally, custom neutral, and special bombs
  scene.enemies.clear(true, true);
  for (const a of scene.allies.getChildren()) scene.safeDisableSpriteBody(a);
  for (const n of scene.neutrals.getChildren()) scene.safeDisableSpriteBody(n);

  const e1 = new ChaserEnemy(scene, 8 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  e1.archetype = 'CHASER';
  scene.enemies.add(e1);

  const drone = new PetDroneAlly(scene, 3 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  drone.hp = 2;
  scene.allies.add(drone);

  const guard = new ShieldGuardAlly(scene, 4 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  guard.hp = 4;
  scene.allies.add(guard);

  const critter = new CritterNPC(scene, 6 * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  scene.neutrals.add(critter);

  scene.maxBombs = 4;
  scene.activeBombType = 'REMOTE_BOMB';
  scene.player.setPosition(2 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();

  const snapshot = scene.captureRunState('manual');
  assert.equal(snapshot.activeEntities.length, 1, 'activeEntities must strictly contain active enemies for backward compatibility');
  assert.equal(snapshot.activeAllies.length, 2, 'activeAllies must capture both active companions');
  assert.equal(snapshot.activeNeutrals.length, 1, 'activeNeutrals must capture active CritterNPC');
  assert.equal(snapshot.activeBombs.length, 1);
  assert.equal(snapshot.activeBombs[0].bombType, 'REMOTE_BOMB');

  // Mutate live state before resume (kill allies, spawn extra merchant, clear bombs)
  for (const a of scene.allies.getChildren()) scene.safeDisableSpriteBody(a);
  const extraMerchant = new MerchantNPC(scene, 10 * TILE_SIZE + 20, 9 * TILE_SIZE + 20);
  scene.neutrals.add(extraMerchant);
  scene.detonateRemoteBombs();

  // Resume from snapshot
  gameEmitter.emit('resume-run-state', snapshot);

  const resumedAllies = scene.allies.getChildren().filter((a) => a.active);
  assert.equal(resumedAllies.length, 2, 'Both saved allies must be revived in-place on resume');
  const resumedGuard = resumedAllies.find((a) => a instanceof ShieldGuardAlly);
  assert.equal(resumedGuard.hp, 4);

  const resumedNeutrals = scene.neutrals.getChildren().filter((n) => n.active);
  assert.equal(resumedNeutrals.length, 1, 'Unsaved extra merchant must be deactivated and saved CritterNPC restored');
  assert.ok(resumedNeutrals[0] instanceof CritterNPC);

  const resumedBombs = scene.bombs.getChildren().filter((b) => b.active);
  assert.equal(resumedBombs.length, 1);
  assert.equal(resumedBombs[0].getData('isRemoteBomb'), true, 'Resumed REMOTE_BOMB must retain remote detonation capability');
  assert.equal(scene.detonateRemoteBombs(), 1);

  // Verify resuming with empty activeAllies: [] and activeNeutrals: [] cleanly deactivates all companions/neutrals
  snapshot.activeAllies = [];
  snapshot.activeNeutrals = [];
  snapshot.activeBombs = [];
  gameEmitter.emit('resume-run-state', snapshot);
  assert.equal(scene.allies.getChildren().filter((a) => a.active).length, 0);
  assert.equal(scene.neutrals.getChildren().filter((n) => n.active).length, 0);

  scene.shutdown();
  assert.equal(scene.poisonMistGraphics, null, 'shutdown() must destroy and null poisonMistGraphics');
});

test('Cycle 48.7: 10,000-frame continuous Zero-GC soak across VoidCrisis, PsychicCrisis, RiftCrisis, Poison Mist, & Boss Shockwaves', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness({ recordDrawCalls: false });
  scene.init();
  scene.create();
  scene.map = createCorridorOpenMap();
  scene.isInvulnerable = true; // prevent game-over interruption during 10,000-frame arena stress

  const enemy = new ChaserEnemy(scene, 9 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.enemies.add(enemy);
  scene.startBossEncounter('captain_nibbles');
  scene.activeBoss.bossState = BossState.PHASE_2;
  scene.startCrisisMode(CrisisType.PASTEL_VOID);

  if (globalThis.gc) globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  const crisisCycle = [
    CrisisType.PASTEL_VOID,
    CrisisType.PSYCHIC_INVASION,
    CrisisType.DIMENSIONAL_RIFTS,
  ];

  for (let frame = 0; frame < 10000; frame++) {
    const now = 20000 + frame * 16;
    scene.time.now = now;

    if (frame > 0 && frame % 2500 === 0) {
      const nextCrisis = crisisCycle[(frame / 2500) % crisisCycle.length];
      scene.startCrisisMode(nextCrisis);
      const ac = scene.crisisManager.getActiveCrisis();
      if (ac) ac.stage = CrisisStage.OUTBREAK;
    }

    if (frame % 500 === 0) {
      scene.setPoisonMistTile(6, 9, 1200);
      if (scene.activeBoss instanceof HamsterBoss) {
        scene.activeBoss.isDashing = true;
        scene.activeBoss.onWallImpact();
      }
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
  assert.equal(scene.bossAttackManager.shockwavePool.verifyInvariants(), true);
  assert.ok(
    scene.hazardGraphics.clearCount < 1000,
    `hazardGraphicsDirty gating must skip >90% of idle frames across 10,000 frames (actual: ${scene.hazardGraphics.clearCount})`
  );
  assert.ok(heapDeltaMb < 32, `10,000-frame soak heap growth (${heapDeltaMb.toFixed(2)} MB) must remain strictly bounded`);

  scene.shutdown();
});
