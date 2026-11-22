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
  SplitterEnemy,
  MiniSplitterEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');
const { OverheadUI } = await import('../src/game/entities/OverheadUI.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
} = await import('../src/game/pathfinding.ts');
const {
  BossAttackManager,
  BossHUD,
  BossProjectileType,
  BossState,
  HamsterBoss,
  QueenBeeBoss,
  MutantFloraBoss,
  TelegraphEngine,
} = await import('../src/game/bosses/index.ts');
const {
  ClockworkCrisis,
  CrisisStage,
  CrisisType,
  RiftCrisis,
  SituationLog,
  CrisisManager,
} = await import('../src/game/crises/index.ts');
const { RelicId } = await import('../src/game/progression/index.ts');
const {
  rollItemDrop,
  createInitialPlayerStats,
  MAX_PLAYER_SPEED,
  MAX_BOMBS_CAP,
  MAX_BOMB_POWER_CAP,
} = await import('../src/game/gameplay_mechanics.ts');
const { ULTIMATE_SKILLS } = await import('../src/game/ultimate_skills.ts');

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
        if (this.text.length > 0) {
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
        if (disableGameObject) this.active = false;
        if (hideGameObject) this.visible = false;
        return this;
      },
      clear() {
        this.drawCalls.length = 0;
        return this;
      },
      lineStyle(width, color, alpha = 1) {
        this.drawCalls.push({ op: 'lineStyle', width, color, alpha });
        return this;
      },
      fillStyle(color, alpha = 1) {
        this.fillColor = color;
        this.fillAlpha = alpha;
        graphicsFillAlphas.push({ color, alpha });
        this.drawCalls.push({ op: 'fillStyle', color, alpha });
        return this;
      },
      fillRect(rx, ry, rw, rh) {
        this.drawCalls.push({ op: 'fillRect', rx, ry, rw, rh, color: this.fillColor, alpha: this.fillAlpha });
        return this;
      },
      fillRoundedRect() {
        return this;
      },
      strokeRect(rx, ry, rw, rh) {
        this.drawCalls.push({ op: 'strokeRect', rx, ry, rw, rh });
        return this;
      },
      strokeRoundedRect() {
        return this;
      },
      fillCircle(cx, cy, cr) {
        this.drawCalls.push({ op: 'fillCircle', cx, cy, cr, color: this.fillColor, alpha: this.fillAlpha });
        return this;
      },
      strokeCircle(cx, cy, cr) {
        this.drawCalls.push({ op: 'strokeCircle', cx, cy, cr });
        return this;
      },
      lineBetween(x1, y1, x2, y2) {
        this.drawCalls.push({ op: 'lineBetween', x1, y1, x2, y2 });
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

test('Cycle 46.1: Zero-GC ring-pooled results & scratch reuse (TelegraphEngine, RiftCrisis, ClockworkCrisis, OverheadUI, BossAttackManager, BossHUD, rollItemDrop)', () => {
  // 1. TelegraphEngine 8-slot registration ring & 4-slot coverage ring + explicit out reuse
  const tg = new TelegraphEngine();
  const r0 = tg.registerAttack(1, [16, 17], 2000);
  const r1 = tg.registerAttack(2, [18, 19], 2000);
  assert.notEqual(r0, r1, 'Consecutive registerAttack calls must return distinct ring slots');
  assert.equal(r0.attackId, 1);
  assert.equal(r1.attackId, 2);

  tg.reset();
  for (let k = 0; k < 6; k++) {
    tg.registerAttack(k + 10, [16], 1500);
    tg.reset();
  }
  const rWrap = tg.registerAttack(99, [16], 1500);
  assert.equal(rWrap, r0, '9th total call (after 8-slot ring cycle) must wrap around and reuse slot 0');

  const scratchReg = { success: false };
  const rOut = tg.registerAttack(100, [17], 1500, true, scratchReg);
  assert.equal(rOut, scratchReg);
  assert.equal(rOut.success, true);

  const c0 = tg.validateSafeCoverage([18]);
  const c1 = tg.validateSafeCoverage([19]);
  assert.notEqual(c0, c1);
  tg.validateSafeCoverage([20]);
  tg.validateSafeCoverage([21]);
  const cWrap = tg.validateSafeCoverage([22]);
  assert.equal(cWrap, c0, '4th subsequent validateSafeCoverage call must reuse ring slot 0');

  // 2. RiftCrisis 4-slot coordinate ring + out reuse
  const rift = new RiftCrisis();
  rift.init();
  rift.setStage(CrisisStage.OUTBREAK);
  const firstRift = rift.rifts[0];
  const p0 = rift.wrapToroidalPosition(0, 5);
  const p1 = rift.resolveSafeSpawnLocation(3, 4, (r, c) => r === 3 && c === 4);
  const p2 = rift.teleportThroughRift(firstRift.r, firstRift.c);
  assert.equal(p0.r, ROWS - 2);
  assert.notEqual(p0, p1);
  assert.ok(p2);
  rift.wrapToroidalPosition(1, 1);
  const pWrap = rift.wrapToroidalPosition(1, 2);
  assert.equal(pWrap, p0, 'RiftCrisis 4-slot coord ring must wrap around without heap allocation');
  const outCoord = { r: 0, c: 0 };
  assert.equal(rift.wrapToroidalPosition(ROWS - 1, 7, outCoord), outCoord);
  assert.equal(outCoord.r, 1);
  assert.equal(outCoord.c, 7);
  rift.reset();

  // 3. ClockworkCrisis static frozen EMP results
  const clockwork = new ClockworkCrisis();
  const det1 = clockwork.evaluateBombEmpInteraction(30);
  const det2 = clockwork.evaluateBombEmpInteraction(50);
  const dis1 = clockwork.evaluateBombEmpInteraction(400);
  const dis2 = clockwork.evaluateBombEmpInteraction(900);
  assert.equal(det1, det2);
  assert.equal(dis1, dis2);
  assert.equal(Object.isFrozen(det1), true);
  assert.equal(Object.isFrozen(dis1), true);
  clockwork.reset();

  // 4. OverheadUI.getRenderLayers(false) vs getRenderLayers(true) zero-allocation slot separation
  const ui = new OverheadUI(null, 'Chaser: Blitz', 'enemy', 3, 24);
  ui.update(120, 160, 2);
  ui.setCustomOffsets(8, -6);
  const baseLayers1 = ui.getRenderLayers(false);
  const offsetLayers1 = ui.getRenderLayers(true);
  const baseLayers2 = ui.getRenderLayers(false);
  assert.equal(baseLayers1, baseLayers2, 'getRenderLayers(false) must reuse cached base structure');
  assert.notEqual(baseLayers1, offsetLayers1, 'base and offset render layer views must not alias');
  assert.equal(baseLayers1.tier2_name.x, 120);
  assert.equal(offsetLayers1.tier2_name.x, 128);
  ui.destroy();

  // 5. BossAttackManager.minionPool resets type to 'GUMMY_CUB' & BossHUD clears stun on phase transition
  const bam = new BossAttackManager();
  const beeMinion = bam.spawnMinion('WORKER_BEE', 200, 200, 10, 10);
  assert.ok(beeMinion);
  assert.equal(beeMinion.type, 'WORKER_BEE');
  bam.minionPool.release(beeMinion);
  assert.equal(beeMinion.type, 'GUMMY_CUB', 'Released minion must reset type back to GUMMY_CUB');
  bam.destroy();

  const hud = new BossHUD();
  hud.initBoss('queen_bee_cupcake', 12);
  hud.triggerStun(3.0, 'Shield Shatter');
  assert.equal(hud.getState().isStunned, true);
  hud.setBossState(BossState.PHASE_2);
  assert.equal(hud.getState().isStunned, false, 'Transitioning out of STUNNED must clear BossHUD stun state');
  assert.equal(hud.getState().stunRemainingMs, 0);
  hud.destroy();

  // 6.SituationLog clock-skew resilience & rollItemDrop anti-snowball cap filtering
  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.PASTEL_VOID);
  const emittedLogs = [];
  const sitLog = new SituationLog({ events: { emit: (ev, payload) => { emittedLogs.push({ ev, payload }); return true; } } });
  sitLog.updateFromCrisisManager(cm, 50000, true);
  emittedLogs.length = 0;
  // Backward clock after scene.restart() (t = 100 < 50000) must still emit instead of freezing for 49.9s
  sitLog.updateFromCrisisManager(cm, 100, false);
  assert.ok(emittedLogs.length >= 1, 'SituationLog must emit cleanly when clock resets to an earlier timestamp');
  cm.destroy();
  sitLog.destroy();

  const cappedStats = createInitialPlayerStats();
  cappedStats.speed = MAX_PLAYER_SPEED;
  cappedStats.maxBombs = MAX_BOMBS_CAP;
  cappedStats.bombPower = MAX_BOMB_POWER_CAP;
  cappedStats.hasKick = true;
  cappedStats.hasWallPass = true;
  cappedStats.hasBombPass = true;
  cappedStats.hasMagnet = true;
  cappedStats.hasBlastDeflector = true;
  cappedStats.hasBlastResist = true;
  cappedStats.hasVampiric = true;
  cappedStats.extraLives = 3;
  for (let i = 0; i < 30; i++) {
    const drop = rollItemDrop(() => (i % 10) * 0.04, cappedStats, 'BLOCK');
    assert.notEqual(drop, 'SPEED_UP');
    assert.notEqual(drop, 'KICK');
    assert.notEqual(drop, 'EXTRA_LIFE');
  }
});

test('Cycle 46.2: BaseEntity.baseMaxHp pool reset integrity & Zero-GC onResumeRunState entity recycling + relicState/ICD recovery', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  // 1. BaseEntity.baseMaxHp reset prevents scaled maxHp from contaminating recycled pooled enemies
  scene.enemies.clear(true, true);
  const scaledChaser = new ChaserEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scaledChaser.archetype = 'CHASER';
  assert.equal(scaledChaser.baseMaxHp, 1);
  scaledChaser.maxHp = 9;
  scaledChaser.hp = 9;
  scene.enemies.add(scaledChaser);
  scaledChaser.die(1000);
  assert.equal(scaledChaser.active, false);

  scaledChaser.reviveAt(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  assert.equal(scaledChaser.maxHp, 1, 'Revived ChaserEnemy must reset maxHp back to baseMaxHp (1)');
  assert.equal(scaledChaser.hp, 1);

  // 2. onResumeRunState recycles existing BaseEntity instances in-place, restores relicState, and clears stale ICDs
  const tank = new TankEnemy(scene, 7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  tank.archetype = 'TANK';
  tank.maxHp = 60;
  tank.hp = 60;
  scene.enemies.add(tank);

  scene.relicManager.setMaxSlots(2);
  scene.relicManager.discoverRelic(RelicId.VAMPIRIC_CONFECTION);
  scene.relicManager.equipRelic(RelicId.VAMPIRIC_CONFECTION);
  scene.relicManager.discoverRelic(RelicId.TESLA_OVERCHARGE_COIL);
  scene.relicManager.equipRelic(RelicId.TESLA_OVERCHARGE_COIL);
  scene.relicManager.vampiricKillStreak = 4;
  scene.relicManager.solarChargeElapsedMs = 3200;

  // Trigger Tesla at a high timestamp (95,000ms) at (r=5, c=9), 2 tiles from Tank (50 shock dmg -> 10 HP left)
  scene.time.now = 95000;
  scene.player.setPosition(9 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.placeBomb();
  const preBomb = scene.bombs.getChildren().find((b) => b.active);
  scene.explodeBomb(preBomb, 5, 9);
  assert.equal(tank.active, true);
  assert.equal(tank.hp, 10, 'Non-lethal 50-dmg Tesla shock must leave 60-HP Tank alive at 10 HP while arming 95,000ms ICD');

  const snapshot = scene.captureRunState('manual');
  assert.ok(snapshot.relicState);
  assert.equal(snapshot.relicState.vampiricKillStreak, 4);

  // Mutate live state & reset scene clock to 1200ms (simulating fresh boot before resume)
  scene.relicManager.vampiricKillStreak = 0;
  scene.time.now = 1200;
  const chaserInstanceBefore = scaledChaser;
  const tankInstanceBefore = tank;

  gameEmitter.emit('resume-run-state', snapshot);

  const activeAfterResume = scene.enemies.getChildren().filter((e) => e.active);
  assert.equal(activeAfterResume.includes(chaserInstanceBefore), true, 'Pooled ChaserEnemy instance must be recycled in-place');
  assert.equal(activeAfterResume.includes(tankInstanceBefore), true, 'Pooled TankEnemy instance must be recycled in-place');
  assert.equal(scene.relicManager.vampiricKillStreak, 4, 'vampiricKillStreak must restore from relicState');
  assert.equal(scene.shadowPool.verifyInvariants(), true);
  assert.equal(scene.graphicsPool.verifyInvariants(), true);

  // Immediately detonate a bomb at t = 1200ms (< 95000ms!) — Tesla ICD must NOT be suppressed by pre-save timestamp!
  scene.activeBombs = 0;
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scaledChaser.setPosition(4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scaledChaser.hp = 1;
  scene.placeBomb();
  const postBomb = scene.bombs.getChildren().find((b) => b.active);
  scene.explodeBomb(postBomb, 3, 3);
  assert.equal(scaledChaser.isDead, true, 'Tesla proc must fire immediately after resume despite lower scene clock');
  assert.equal(scene.shieldCharges >= 1, true, '5th Vampiric Confection kill after resume must grant shield');

  scene.shutdown();
});

test('Cycle 46.3: QueenBeeBoss live aerial flight flyover, 4-shield pop grounding (3.0s stun), and 3.5s Royal Dive Crater Bomb Trap', () => {
  const { scene, floatingTexts } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  scene.startBossEncounter('queen_bee_cupcake');
  const queen = scene.activeBoss;
  assert.ok(queen instanceof QueenBeeBoss);
  assert.equal(typeof queen.diveCraterBombCheck, 'function');

  // Advance INTRO -> PHASE_1
  queen.update(1600, 100, 100);
  assert.equal(queen.bossState, BossState.PHASE_1);
  assert.equal(queen.isFlying, true);

  // 1. Cruising flight at altitude = 40 flies over floor bomb AND player without premature collision or death
  queen.flightTimeSec = 0; // Figure-8 locus at (420, 260) -> col=10, row=6
  queen.timeUntilNextDiveMs = 9000;
  scene.player.setPosition(10 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.placeBomb();
  const floorBomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(floorBomb);

  scene.update(2000, 16);

  assert.equal(scene.isGameOver, false, 'Cruising airborne QueenBeeBoss must not deal floor contact death');
  assert.equal(floorBomb.active, true, 'Cruising airborne QueenBeeBoss must fly over floor bombs without detonating them');
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.explodeBomb(floorBomb, 6, 10); // Pops shield #1!
  assert.equal(queen.activeShieldCount, 3, 'First bomb blast must pop 1 of 4 rotating sugar shields');

  // 2. Popping remaining 3 shields grounds QueenBeeBoss with 3.0s stun + BossHUD sync
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  const bx = Math.floor(queen.x / TILE_SIZE);
  const by = Math.floor(queen.y / TILE_SIZE);
  scene.spawnExplosion(by, bx, true, 'player', 'q_shield_2', false);
  scene.spawnExplosion(by, bx, true, 'player', 'q_shield_3', false);
  assert.equal(queen.activeShieldCount, 1);
  assert.equal(queen.isFlying, true);

  scene.spawnExplosion(by, bx, true, 'player', 'q_shield_4', false);
  assert.equal(queen.activeShieldCount, 0);
  assert.equal(queen.isGrounded, true);
  assert.equal(queen.bossState, BossState.STUNNED);
  assert.equal(queen.stunTimerMs, 3000);
  assert.equal(scene.bossHUD.getState().isStunned, true);

  // Recover from stun -> shields regenerate & flight resumes
  queen.update(3100, 100, 100);
  assert.equal(queen.isFlying, true);
  assert.equal(queen.activeShieldCount, 4);

  // 3. Royal Dive onto planted bomb triggers 3.5s Crater Bomb Trap + single-hit 1 HP damage + clamped dive reticle alpha
  scene.player.setPosition(7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.activeBombs = 0;
  scene.placeBomb();
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  const hpBeforeDive = queen.currentHp;
  queen.initiateRoyalDive(7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  queen.diveTimerMs = 500;
  scene.update(6000, 16);
  const diveCircleDraws = scene.bossGraphics.drawCalls.filter(
    (d) => d.op === 'fillCircle' && d.cx === queen.targetDiveX && d.cy === queen.targetDiveY
  );
  assert.ok(diveCircleDraws.length >= 1, 'Dive target reticle must render on bossGraphics');
  for (const dc of diveCircleDraws) {
    assert.ok(dc.alpha >= 0.18 && dc.alpha <= 0.40, `Dive reticle alpha (${dc.alpha}) must remain in [0.18, 0.40]`);
  }

  floatingTexts.length = 0;
  queen.diveTimerMs = 8;
  scene.update(6100, 16);
  assert.equal(queen.bossState, BossState.STUNNED);
  assert.equal(queen.stunTimerMs, 3500);
  assert.equal(queen.currentHp, hpBeforeDive - 1, 'Royal Dive onto bomb must deal exactly 1 HP damage (no double-hit)');
  assert.ok(floatingTexts.some((t) => t.includes('ROYAL DIVE CRATER TRAP')));

  scene.shutdown();
});

test('Cycle 46.4: HamsterBoss live 3.0s Head-On Bomb Collision Trap, Gyro Shield deflection, and clamped windup telegraph', () => {
  const { scene, floatingTexts } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  scene.startBossEncounter('captain_nibbles');
  const hamster = scene.activeBoss;
  assert.ok(hamster instanceof HamsterBoss);
  assert.equal(typeof hamster.headOnBombCheck, 'function');

  hamster.update(1600, 100, 100);
  assert.equal(hamster.bossState, BossState.PHASE_1);

  // 1. Remote blast while un-stunned is deflected by Gyro Shield
  floatingTexts.length = 0;
  const hpStart = hamster.currentHp;
  const hCol = Math.floor(hamster.x / TILE_SIZE);
  const hRow = Math.floor(hamster.y / TILE_SIZE);
  scene.spawnExplosion(hRow, hCol, true, 'player', 'hamster_deflect_1', false);
  assert.equal(hamster.currentHp, hpStart);
  assert.ok(floatingTexts.some((t) => t.includes('GYRO SHIELD DEFLECTED')));

  // 2. Rev windup renders non-occluding corridor warning tiles (alpha in [0.18, 0.40])
  hamster.x = 3 * TILE_SIZE + 20;
  hamster.y = 5 * TILE_SIZE + 20;
  hamster.startDashWindup(120, 0);
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.update(3000, 16);
  const rectDraws = scene.bossGraphics.drawCalls.filter((d) => d.op === 'fillRect');
  assert.ok(rectDraws.length >= 1, 'Hamster rev windup must draw corridor warning tiles');
  for (const rd of rectDraws) {
    assert.ok(rd.alpha >= 0.18 && rd.alpha <= 0.40, `Hamster telegraph alpha (${rd.alpha}) must be in [0.18, 0.40]`);
  }

  // 3. Dashing head-on into planted bomb triggers 3.0s stun + 40px recoil + single-hit 1 HP damage + BossHUD sync
  scene.player.setPosition(6 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.activeBombs = 0;
  scene.placeBomb();
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  floatingTexts.length = 0;
  hamster.x = 6 * TILE_SIZE + 10;
  hamster.y = 5 * TILE_SIZE + 20;
  hamster.startDash({ x: 1, y: 0 });
  const xBeforeImpact = hamster.x;
  scene.update(3200, 16);

  assert.equal(hamster.isDashing, false);
  assert.equal(hamster.bossState, BossState.STUNNED);
  assert.equal(hamster.stunTimerMs, 3000);
  assert.equal(hamster.currentHp, hpStart - 1);
  assert.ok(hamster.x < xBeforeImpact, 'HamsterBoss must recoil backward upon head-on bomb trap');
  assert.equal(scene.bossHUD.getState().isStunned, true);
  assert.ok(floatingTexts.some((t) => t.includes('HEAD-ON BOMB TRAP')));

  scene.shutdown();
});

test('Cycle 46.5: MutantFloraBoss BossAttackManager constructor & GameScene wiring, underground attack suppression, and thorny root snare', () => {
  // 1. Direct constructor binds BossAttackManager and suppresses surface emissions while burrowed underground
  const bam = new BossAttackManager();
  const standaloneFlora = new MutantFloraBoss(300, 260, bam);
  assert.equal(standaloneFlora.attackManager, bam);
  standaloneFlora.update(1600, 200, 200);
  standaloneFlora.burrowUnderground(2000);
  standaloneFlora.emitPollenCloud(200, 200);
  standaloneFlora.executeVineWhip();
  assert.equal(bam.projectilePool.activeCount, 0, 'Burrowed MutantFloraBoss must not emit surface pollen projectiles');
  assert.equal(bam.shockwavePool.activeCount, 0, 'Burrowed MutantFloraBoss must not emit surface vine shockwaves');
  standaloneFlora.emergeFromUnderground();
  standaloneFlora.emitPollenCloud(200, 200);
  standaloneFlora.executeVineWhip();
  assert.equal(bam.projectilePool.activeCount, 1);
  assert.equal(bam.shockwavePool.activeCount, 1);
  standaloneFlora.destroy();
  bam.destroy();

  // 2. Live GameScene wires scene.bossAttackManager and applies thorny root snare slow on matured roots
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.startBossEncounter('boss_mutant_flora');
  const flora = scene.activeBoss;
  assert.ok(flora instanceof MutantFloraBoss);
  assert.equal(flora.attackManager, scene.bossAttackManager);

  flora.bossState = BossState.PHASE_2;
  flora.pollenTimerMs = 10;
  scene.player.setPosition(100, 100);
  scene.update(2000, 16);
  assert.ok(scene.bossAttackManager.projectilePool.activeCount >= 1, 'Phase 2 MutantFloraBoss must spawn live pollen pod into scene.bossAttackManager');

  // Matured root (!isTelegraph) snares overlapping player speed
  const root = flora.spawnSubterraneanRoot(100, 100);
  assert.ok(root);
  root.isTelegraph = false;
  const speedBeforeSnare = scene.playerSpeed;
  scene.update(2050, 16);
  assert.ok(scene.playerSpeed < speedBeforeSnare, 'Matured subterranean root must snare player movement speed');

  scene.dismissBoss();
  assert.equal(scene.bossAttackManager.projectilePool.activeCount, 0, 'dismissBoss must reset bossAttackManager pools');
  scene.shutdown();
});

test('Cycle 46.6: Chained detonation relic target-list refresh protects AbyssalPearl ICD on corpses and targets newly split MiniSplitterEnemy slimes', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  scene.enemies.clear(true, true);
  scene.relicManager.setMaxSlots(2);
  scene.relicManager.discoverRelic(RelicId.TESLA_OVERCHARGE_COIL);
  scene.relicManager.equipRelic(RelicId.TESLA_OVERCHARGE_COIL);
  scene.relicManager.discoverRelic(RelicId.ABYSSAL_MAELSTROM_PEARL);
  scene.relicManager.equipRelic(RelicId.ABYSSAL_MAELSTROM_PEARL);

  // Part A: Single 1-HP Chaser killed by Tesla refreshes activeEnemies -> AbyssalPearl does NOT waste its 500ms ICD on the corpse!
  const loneChaser = new ChaserEnemy(scene, 4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(loneChaser);
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.time.now = 5000;
  scene.placeBomb();
  const bomb1 = scene.bombs.getChildren().find((b) => b.active);
  scene.explodeBomb(bomb1, 3, 3);
  assert.equal(loneChaser.isDead, true);

  // Only 100ms later (t = 5100ms, within 500ms!), Tesla is on ICD, so ONLY AbyssalPearl can kill a fresh enemy if its ICD was preserved!
  const freshChaser = new ChaserEnemy(scene, 4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(freshChaser);
  scene.activeBombs = 0;
  scene.time.now = 5100;
  scene.placeBomb();
  const bomb2 = scene.bombs.getChildren().find((b) => b.active);
  scene.explodeBomb(bomb2, 3, 3);
  assert.equal(freshChaser.isDead, true, 'AbyssalPearl must preserve its 500ms ICD when prior relic in chain killed all targets');

  // Part B: 1-HP SplitterEnemy at (r=5, c=3) killed by Tesla spawns 2 MiniSplitterEnemy slimes at (5,2) & (5,4) (dist=2.24 <= 2.5r)
  scene.enemies.clear(true, true);
  const splitter = new SplitterEnemy(scene, 3 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  splitter.hp = 1;
  scene.enemies.add(splitter);

  scene.activeBombs = 0;
  scene.time.now = 7000;
  scene.placeBomb();
  const bomb3 = scene.bombs.getChildren().find((b) => b.active);
  scene.explodeBomb(bomb3, 3, 3);

  assert.equal(splitter.isDead, true);
  assert.equal(splitter.spawnedMinis.length, 2, 'SplitterEnemy must split into 2 MiniSplitterEnemy slimes');
  const deadMinis = splitter.spawnedMinis.filter((m) => m.isDead);
  assert.equal(deadMinis.length, 2, 'Refreshed candidate list must let AbyssalPearl crush both newly spawned MiniSplitterEnemy slimes in the same detonation');

  scene.shutdown();
});

test('Cycle 46.7: Offensive ultimates impact activeBoss & crises, handleActiveBossDefeated unifies currency rewards, and CLOAK alpha survives i-frame/blink recovery', () => {
  const { scene, activeTimers, activeTweens, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  const currencyRewards = [];
  gameEmitter.on('currency-reward', (payload) => currencyRewards.push(payload));

  // 1. NUCLEAR_BARRAGE hits activeBoss once per cast (2 skill damage) and triggers unified defeat currency reward on lethal hit
  scene.startBossEncounter('king_gummy_bear');
  const boss = scene.activeBoss;
  boss.update(1600, 60, 60);
  boss.x = 3 * TILE_SIZE + 20;
  boss.y = 1 * TILE_SIZE + 20;
  boss.currentHp = 2;

  const scoreBefore = scene.score;
  const candiesBefore = scene.starCandies || 0;
  const essenceBefore = scene.cosmicEssence || 0;

  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  activeTimers.length = 0;
  scene.executeNuclearBarrage(ULTIMATE_SKILLS.NUCLEAR_BARRAGE);
  for (const t of [...activeTimers]) {
    if (!t.removed && typeof t.callback === 'function') t.callback();
  }

  assert.equal(scene.activeBoss, null, 'Lethal NUCLEAR_BARRAGE must defeat and dismiss activeBoss');
  assert.equal(scene.score, scoreBefore + 5000);
  assert.equal(scene.starCandies, candiesBefore + 50);
  assert.equal(scene.cosmicEssence, essenceBefore + 25);
  assert.equal(currencyRewards.length, 1);

  // 2. CLOAK stealth alpha (0.35) preserved across shield-shatter blink completion and update() invulnerability expiry
  scene.isCloaked = true;
  scene.activeBuffs = [
    { id: 'CLOAK', name: 'Cloak', icon: '👻', color: '#94a3b8', remainingMs: 5000, totalMs: 5000 },
  ];
  scene.player.setAlpha(0.35);
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.isInvulnerable = false;

  scene.playerDie(); // Consumes shield and starts blink tween
  for (const tw of Array.from(activeTweens)) {
    if (typeof tw.complete === 'function') tw.complete();
  }
  assert.equal(scene.player.alpha, 0.35, 'Shield blink completion must preserve 0.35 CLOAK stealth alpha');

  scene.isInvulnerable = true;
  scene.shieldInvulnerableUntil = 1500;
  scene.time.now = 2000;
  scene.update(2000, 16);
  assert.equal(scene.player.alpha, 0.35, 'Invulnerability expiry in update() must preserve 0.35 CLOAK stealth alpha');

  scene.shutdown();
});

test('Cycle 46.8: 10,000-frame continuous Zero-GC soak across QueenBeeBoss, HamsterBoss, MutantFloraBoss, BossAttackManager, TelegraphEngine, RiftCrisis, ClockworkCrisis, and OverheadUI', () => {
  const bam = new BossAttackManager();
  const queen = new QueenBeeBoss(300, 260);
  const hamster = new HamsterBoss(300, 260);
  const flora = new MutantFloraBoss(300, 260, bam);
  const telegraph = new TelegraphEngine();
  const rift = new RiftCrisis();
  const clockwork = new ClockworkCrisis();
  const ui = new OverheadUI(null, 'Splitter: Mini', 'enemy', 2, 16);

  rift.init();
  rift.setStage(CrisisStage.CLIMAX);
  clockwork.init();
  clockwork.setStage(CrisisStage.CLIMAX);

  const sampleTiles = [16, 17, 18, 31, 32];
  const scratchCoord = { r: 0, c: 0 };

  if (globalThis.gc) globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  const dt = 16.6667;
  for (let frame = 0; frame < 10000; frame++) {
    const px = 100 + ((frame * 5) % 400);
    const py = 100 + ((frame * 3) % 300);

    queen.update(dt, px, py);
    hamster.update(dt, px, py);
    flora.update(dt, px, py);
    bam.update(dt, px, py, () => {});
    rift.update(dt, { r: Math.floor(py / TILE_SIZE), c: Math.floor(px / TILE_SIZE), x: px, y: py });
    clockwork.update(dt, { r: Math.floor(py / TILE_SIZE), c: Math.floor(px / TILE_SIZE), x: px, y: py });

    if (frame % 45 === 0) {
      const reg = telegraph.registerAttack(0, sampleTiles, 600, true);
      if (reg.success && frame % 90 === 0 && reg.attackId) {
        telegraph.cancelAttack(reg.attackId);
      }
    }
    telegraph.update(dt);

    if (frame % 25 === 0) {
      rift.wrapToroidalPosition(frame % ROWS, frame % COLS, scratchCoord);
      clockwork.evaluateBombEmpInteraction(frame % 2 === 0 ? 30 : 500);
      ui.update(px, py, (frame % 2) + 1);
      ui.getRenderLayers(false);
      ui.getRenderLayers(true);
    }

    if (frame % 150 === 0) {
      flora.cleanseRootsAt(Math.floor(py / TILE_SIZE), Math.floor(px / TILE_SIZE), 3);
    }
    if (frame % 400 === 399 && queen.isFlying) {
      queen.popShield();
    }
    if (frame % 500 === 499 && hamster.isDashing) {
      hamster.collideWithBombHeadOn();
    }

    assert.equal(Number.isFinite(queen.x) && Number.isFinite(queen.y), true);
    assert.equal(Number.isFinite(hamster.x) && Number.isFinite(hamster.y), true);
    assert.equal(Number.isFinite(flora.x) && Number.isFinite(flora.y), true);
  }

  if (globalThis.gc) globalThis.gc();
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

  assert.equal(bam.projectilePool.verifyInvariants(), true);
  assert.equal(bam.shockwavePool.verifyInvariants(), true);
  assert.equal(bam.minionPool.verifyInvariants(), true);
  assert.equal(bam.telegraphPool.verifyInvariants(), true);
  assert.equal(flora.rootPool.verifyInvariants(), true);
  assert.ok(telegraph.getSafeWalkableRatio() >= 0.40);
  assert.ok(heapDeltaMb < 24, `10k-frame soak heap delta (${heapDeltaMb.toFixed(2)} MB) must remain bounded`);

  queen.destroy();
  hamster.destroy();
  flora.destroy();
  bam.destroy();
  telegraph.destroy();
  rift.reset();
  clockwork.reset();
  ui.destroy();
});
