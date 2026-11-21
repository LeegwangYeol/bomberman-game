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
  BomberEnemy,
  TankEnemy,
  MiniSplitterEnemy,
  EnemyState,
} = await import('../src/game/entities/EnemyEntities.ts');
const { SpatialSeparationGrid } = await import('../src/game/entities/SpatialSeparation.ts');
const {
  resolveJoystickDeadzone,
  resolvePlayerCornerSlide,
} = await import('../src/game/entities/PlayerMovementPhysics.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
} = await import('../src/game/pathfinding.ts');
const { BossProjectileType, BossState } = await import('../src/game/bosses/BossTypes.ts');
const { MutantFloraBoss } = await import('../src/game/bosses/MutantFloraBoss.ts');
const { SteamToyTitanBoss } = await import('../src/game/bosses/SteamToyTitanBoss.ts');
const { GummyBearBoss } = await import('../src/game/bosses/GummyBearBoss.ts');
const { CrisisManager } = await import('../src/game/crises/CrisisManager.ts');
const { CrisisType } = await import('../src/game/crises/CrisisTypes.ts');
const { WaveDirector } = await import('../src/game/progression/WaveDirector.ts');
const { RelicId } = await import('../src/game/progression/index.ts');
const { HazardLifecycleState } = await import('../src/game/hazards/DynamicHazard.ts');
const { renderMeteorStreak, ULTIMATE_SKILLS } = await import('../src/game/ultimate_skills.ts');

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

test('Cycle 45.1: Zero-GC pool resets (SteamToyTitanBoss & MutantFloraBoss), mallet telegraph tier escalation, scratch physics outputs, and saturated-pool meteor fallback', () => {
  const titan = new SteamToyTitanBoss(300, 260);
  titan.bossState = BossState.PHASE_1;

  // Mutate shockwave & gear projectile fields, release, and verify full reset
  const sw = titan.shockwavePool.acquire();
  assert.ok(sw);
  sw.originX = 412;
  sw.originY = 188;
  sw.currentRadius = 99;
  sw.maxRadius = 999;
  sw.expansionSpeed = 777;
  sw.damage = 9;
  titan.shockwavePool.release(sw);

  assert.equal(sw.active, false);
  assert.equal(sw.originX, 0);
  assert.equal(sw.originY, 0);
  assert.equal(sw.currentRadius, 0);
  assert.equal(sw.maxRadius, SteamToyTitanBoss.MALLET_RADIUS_PX);
  assert.equal(sw.expansionSpeed, 300);
  assert.equal(sw.damage, 1);

  const gp = titan.gearProjectilePool.acquire();
  assert.ok(gp);
  gp.type = BossProjectileType.POLLEN;
  gp.x = 500;
  gp.y = 400;
  gp.vx = 120;
  gp.vy = -80;
  gp.radius = 64;
  gp.damage = 7;
  gp.timerMs = 4500;
  gp.maxDurationMs = 9000;
  gp.homing = true;
  gp.targetX = 222;
  gp.targetY = 333;
  titan.gearProjectilePool.release(gp);

  assert.equal(gp.active, false);
  assert.equal(gp.type, BossProjectileType.GEAR_SHARD);
  assert.equal(gp.radius, 12);
  assert.equal(gp.damage, 1);
  assert.equal(gp.timerMs, 0);
  assert.equal(gp.maxDurationMs, 3000);
  assert.equal(gp.homing, false);
  assert.equal(gp.targetX, 0);
  assert.equal(gp.targetY, 0);

  // Mallet windup telegraph tier escalation: Tier 2 (Amber) -> Tier 3 (Red Flash at <= 500ms) -> false on slam
  titan.startMalletWindup(300, 260);
  const activeBefore = titan.getActiveTelegraphs().filter((t) => t.active);
  assert.ok(activeBefore.length > 0);
  assert.ok(activeBefore.every((t) => t.tier === 2 && t.timerMs === SteamToyTitanBoss.MALLET_WINDUP_MS));

  titan.update(700, 300, 260); // 1000 - 700 = 300ms remaining (<= 500ms)
  const activeImminent = titan.getActiveTelegraphs().filter((t) => t.active);
  assert.equal(activeImminent.length, activeBefore.length);
  assert.ok(activeImminent.every((t) => t.tier === 3 && t.timerMs === 300));

  titan.update(350, 300, 260); // Slam executes
  assert.equal(titan.getActiveTelegraphs().filter((t) => t.active).length, 0);
  titan.destroy();

  // MutantFloraBoss rootPool reset completeness
  const flora = new MutantFloraBoss(300, 260);
  const root = flora.spawnSubterraneanRoot(220, 180);
  assert.ok(root);
  root.radius = 99;
  root.durationMs = 1234;
  root.damage = 8;
  flora.rootPool.release(root);
  assert.equal(root.active, false);
  assert.equal(root.radius, 20);
  assert.equal(root.durationMs, 25000);
  assert.equal(root.damage, 1);
  flora.destroy();

  // PlayerMovementPhysics scratch `out` reuse & SpatialSeparationGrid default options
  const dzScratch = {
    up: true,
    down: true,
    left: true,
    right: true,
    angle: 99,
    distance: 99,
    isActive: true,
  };
  const dzRes = resolveJoystickDeadzone(0.02, -0.01, 0.15, dzScratch);
  assert.strictEqual(dzRes, dzScratch);
  assert.equal(dzRes.distance, 0);
  assert.equal(dzRes.up, false);
  assert.equal(dzRes.isActive, false);

  const csScratch = { vx: 0, vy: 0, facing: 'down' };
  const csRes = resolvePlayerCornerSlide(
    {
      px: 66,
      py: 60,
      wantX: 0,
      wantY: 1,
      primaryAxis: 'y',
      speed: 160,
      slideSpeed: 160,
      tolerance: 10,
      isPassable: (r, c) => !(r === 2 && c === 1),
    },
    csScratch
  );
  assert.strictEqual(csRes, csScratch);
  assert.ok(csRes.vx !== 0);

  const sepGrid = new SpatialSeparationGrid();
  const a = { x: 100, y: 100, active: true, collisionRadius: 16 };
  const b = { x: 104, y: 100, active: true, collisionRadius: 16 };
  sepGrid.resolveSeparation([a, b]); // Omitted options uses frozen EMPTY_SEPARATION_OPTIONS
  assert.ok(a.x < 100 && b.x > 104);

  // Saturated circlePool fallback in renderMeteorStreak still fires onTouchdown
  let touchedDown = false;
  let tweenCreated = false;
  renderMeteorStreak(
    {
      add: {},
      circlePool: { acquire: () => null, release: () => {} },
      tweens: {
        add: () => {
          tweenCreated = true;
        },
      },
    },
    200,
    200,
    () => {
      touchedDown = true;
    }
  );
  assert.equal(tweenCreated, false);
  assert.equal(touchedDown, true);
});

test('Cycle 45.2: Monotonic clock-domain unification across BaseEntity, ChaserEnemy, and GameScene Quantum Spire Tunneling after scene.restart()', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  // Simulate scene.restart() skew: game.loop.time (_time) = 60,000ms while scene.time.now = 100ms
  scene.time.now = 100;
  const chaser = new ChaserEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.enemies.add(chaser);

  // Advance 1 frame at _time = 60,000ms so entity records monotonic frame clock
  chaser.updateAI(16, 60_000, scene.player, scene.map, scene.persistentHazardMask, false);
  chaser.applyStun(1500);
  chaser.applySpeedMultiplier(0.5, 1500);
  assert.equal(chaser.isStunned, true);
  assert.equal(chaser.stunUntil, 61_500);
  assert.equal(chaser.speedMultiplierUntilMs, 61_500);

  // Next frame at _time = 60,016ms MUST NOT prematurely expire stun or slow!
  chaser.updateAI(16, 60_016, scene.player, scene.map, scene.persistentHazardMask, false);
  assert.equal(chaser.isStunned, true);
  assert.equal(chaser.speedMultiplier, 0.5);

  // At _time = 61,520ms both stun and slow expire cleanly
  chaser.updateAI(16, 61_520, scene.player, scene.map, scene.persistentHazardMask, false);
  assert.equal(chaser.isStunned, false);
  assert.equal(chaser.speedMultiplier, 1.0);

  // ChaserEnemy COOLDOWN uses unified entity clock as well
  chaser.changeState(EnemyState.COOLDOWN);
  assert.equal(chaser.stunUntil, 61_520 + chaser.config.stunMs);
  chaser.updateAI(480, 62_000, scene.player, scene.map, scene.persistentHazardMask, false);
  assert.equal(chaser.isStunned, true);
  assert.equal(chaser.aiState, EnemyState.COOLDOWN);
  chaser.updateAI(500, 62_500, scene.player, scene.map, scene.persistentHazardMask, false);
  assert.equal(chaser.isStunned, false);
  assert.equal(chaser.aiState, EnemyState.TRACKING);

  // Headless missing scene.time must never fall back to Date.now() (~1.79e12 = 56-year permanent stun)
  const savedTime = scene.time;
  scene.time = undefined;
  const headlessEnemy = new ChaserEnemy(scene, 7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  headlessEnemy.applyStun(1000);
  assert.equal(headlessEnemy.stunUntil, 1000);
  headlessEnemy.updateAI(16, 1050, scene.player, scene.map, scene.persistentHazardMask, false);
  assert.equal(headlessEnemy.isStunned, false);
  scene.time = savedTime;

  // Quantum Spire Tunneling works cleanly when _time = 90,000ms and scene.time.now = 120ms
  scene.time.now = 120;
  scene.update(90_000, 16);
  scene.performDash();
  assert.equal(scene.isDashing, true);
  assert.equal(scene.dashStartTime, 90_000);

  let capturedDashElapsed = -1;
  scene.dynamicHazard.getState = () => HazardLifecycleState.ACTIVE;
  scene.dynamicHazard.update = () => {};
  scene.dynamicHazard.checkPlayerCollision = (_r, _c, isDashing, dashElapsed) => {
    capturedDashElapsed = dashElapsed;
    return {
      hit: false,
      damage: 0,
      tunneled: Boolean(isDashing && dashElapsed >= 0 && dashElapsed <= 180),
      phaseShiftGranted: Boolean(isDashing && dashElapsed >= 0 && dashElapsed <= 180),
      phaseJitterInflicted: false,
      jitterDurationMs: 0,
    };
  };
  scene.update(90_080, 16);
  assert.equal(capturedDashElapsed, 80);
  assert.equal(scene.lastQuantumTunnelTimestampMs, 120);
  assert.equal(scene.player.tint, 0x00ffff);

  scene.shutdown();
});

test('Cycle 45.3: SteamToyTitanBoss & MutantFloraBoss live GameScene + WaveDirector integration (Clockwork synergy, frontal gear deflection, clamped telegraph alpha, root cleanse)', () => {
  const { scene, graphicsFillAlphas, floatingTexts } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  // 1. WaveDirector syncs ClockworkCrisis into SteamToyTitanBoss
  const cm = new CrisisManager();
  const wd = new WaveDirector(cm);
  const wdTitan = wd.spawnBoss('steam_toy_titan', 300, 260);
  cm.triggerCrisis(CrisisType.CLOCKWORK_REBELLION);
  wd.update(16, { r: 1, c: 1, x: 60, y: 60 });
  assert.equal(wdTitan.isClockworkCrisisActive, true);
  cm.stopCrisis('reset');
  wd.update(16, { r: 1, c: 1, x: 60, y: 60 });
  assert.equal(wdTitan.isClockworkCrisisActive, false);
  wd.destroy();
  cm.destroy();

  // 2. GameScene frontal gear deflection vs rear hit
  scene.startBossEncounter('steam_toy_titan');
  const titan = scene.activeBoss;
  assert.ok(titan instanceof SteamToyTitanBoss);
  titan.bossState = BossState.PHASE_2;
  titan.isInvulnerable = false;
  titan.iFrameTimerMs = 0;
  titan.x = 7 * TILE_SIZE + 20; // col 7 (x=300)
  titan.y = 6 * TILE_SIZE + 20; // row 6 (y=260)
  titan.vx = 50; // facing right (+X)
  titan.vy = 0;
  titan.gearShieldActive = true;
  const hpBefore = titan.currentHp;

  // Blast in front of Titan (col 8, row 6 -> x=340, y=260, angle=0) is deflected!
  floatingTexts.length = 0;
  scene.spawnExplosion(6, 8, false, 'player', 'bomb_front_1', false);
  assert.equal(titan.currentHp, hpBefore);
  assert.ok(floatingTexts.some((t) => t.includes('GEAR DEFLECTED')));

  // Blast behind Titan (col 6, row 6 -> x=260, y=260, angle=PI) deals damage!
  scene.spawnExplosion(6, 6, false, 'player', 'bomb_rear_1', false);
  assert.equal(titan.currentHp, hpBefore - 1);

  // 3. Telegraph fill alpha rendered on bossGraphics is strictly clamped <= 0.40
  titan.startMalletWindup(300, 260);
  graphicsFillAlphas.length = 0;
  scene.update(2000, 16);
  const telegraphDraws = scene.bossGraphics.drawCalls.filter((d) => d.op === 'fillRect');
  assert.ok(telegraphDraws.length > 0);
  for (const d of telegraphDraws) {
    assert.ok(d.alpha >= 0.18 && d.alpha <= 0.40, `Expected telegraph alpha in [0.18, 0.40], got ${d.alpha}`);
  }

  // 4. MutantFloraBoss subterranean roots are cleansed by spawnExplosion at impacted tile
  scene.startBossEncounter('boss_mutant_flora');
  const flora = scene.activeBoss;
  assert.ok(flora instanceof MutantFloraBoss);
  flora.bossState = BossState.PHASE_1;
  const spawnedRoot = flora.spawnSubterraneanRoot(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  assert.ok(spawnedRoot);
  assert.equal(flora.rootPool.activeCount, 1);
  scene.spawnExplosion(5, 5, true, 'player', 'bomb_cleanse_1', false);
  assert.equal(flora.rootPool.activeCount, 0);

  scene.shutdown();
});

test('Cycle 45.4: GummyBearBoss aerial leap flyover + 4.0s Masterplay Landing Lure stun without double-damage, plus cutscene & underground contact immunity', () => {
  const { scene, floatingTexts } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  scene.startBossEncounter('gummy_bear_king');
  const gummy = scene.activeBoss;
  assert.ok(gummy instanceof GummyBearBoss);
  assert.equal(typeof gummy.landingBombCheck, 'function');

  // 1. INTRO cutscene contact immunity: player overlapping boss during INTRO does NOT die
  gummy.bossState = BossState.INTRO;
  scene.player.setPosition(gummy.x, gummy.y);
  scene.update(1500, 16);
  assert.equal(scene.isGameOver, false);

  // Move player to safe corner and place a bomb at landing target (row 5, col 5 -> 220, 220)
  scene.player.setPosition(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.placeBomb();
  assert.equal(scene.bombs.getChildren().filter((b) => b.active).length, 1);
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  // 2. Mid-air flyover at high elevation (> 20) directly over the bomb does NOT prematurely detonate it
  gummy.bossState = BossState.PHASE_1;
  gummy.initiateRoyalLeap(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20, 1800);
  gummy.leapTimerMs = 900;
  gummy.x = 5 * TILE_SIZE + 20;
  gummy.y = 5 * TILE_SIZE + 20;
  gummy.leapElevation = 60;
  const hpBeforeLanding = gummy.currentHp;

  scene.update(1600, 16);
  assert.equal(gummy.isAirborne, true);
  assert.equal(scene.bombs.getChildren().filter((b) => b.active).length, 1);
  assert.equal(gummy.currentHp, hpBeforeLanding);

  // 3. Touchdown onto the bomb triggers 4.0s Masterplay Lure stun + single-hit damage (not double-hit!) + BossHUD sync
  floatingTexts.length = 0;
  gummy.leapTimerMs = 10; // Next 16ms tick completes jump & lands on (220, 220)
  scene.update(1650, 16);

  assert.equal(gummy.isAirborne, false);
  assert.equal(gummy.bossState, BossState.STUNNED);
  assert.equal(gummy.stunTimerMs, 4000);
  assert.equal(gummy.currentHp, hpBeforeLanding - 1);
  assert.equal(scene.bossHUD.getState().isStunned, true);
  assert.ok(floatingTexts.some((t) => t.includes('MASTERPLAY LURE')));

  // 4. MutantFloraBoss underground burrow does not deal contact damage or collide with floor bombs
  scene.startBossEncounter('boss_mutant_flora');
  const flora = scene.activeBoss;
  assert.ok(flora instanceof MutantFloraBoss);
  flora.bossState = BossState.PHASE_2;
  flora.burrowUnderground(2000);
  scene.player.setPosition(flora.x, flora.y);
  scene.update(1700, 16);
  assert.equal(scene.isGameOver, false);

  scene.shutdown();
});

test('Cycle 45.5: Unified handlePlayerEnemyKillRewards advances VAMPIRIC_CONFECTION across Aegis Overdrive, Ultimates, and Detonation Relics', () => {
  const { scene, activeTimers, overlapHandlers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  scene.enemies.clear(true, true);
  scene.relicManager.setMaxSlots(3);
  scene.relicManager.discoverRelic(RelicId.VAMPIRIC_CONFECTION);
  scene.relicManager.equipRelic(RelicId.VAMPIRIC_CONFECTION);
  scene.relicManager.discoverRelic(RelicId.TESLA_OVERCHARGE_COIL);
  scene.relicManager.equipRelic(RelicId.TESLA_OVERCHARGE_COIL);
  scene.shieldCharges = 0;
  scene.hasShield = false;

  // Kill 1: Aegis Overdrive reflection
  scene.isAegisOverdriveActive = true;
  const e1 = new ChaserEnemy(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(e1);
  const playerEnemyOverlap = overlapHandlers.find(
    (h) => h.objA === scene.player && h.objB === scene.enemies
  );
  assert.ok(playerEnemyOverlap);
  playerEnemyOverlap.cb(scene.player, e1);
  assert.equal(e1.isDead, true);
  assert.equal(scene.relicManager.vampiricKillStreak, 1);
  scene.isAegisOverdriveActive = false;

  // Kill 2: Nuclear Barrage ultimate
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  const e2 = new ChaserEnemy(scene, 2 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.enemies.add(e2);
  activeTimers.length = 0;
  scene.executeNuclearBarrage(ULTIMATE_SKILLS.NUCLEAR_BARRAGE);
  for (const t of [...activeTimers]) {
    if (!t.removed && typeof t.callback === 'function') t.callback();
  }
  assert.equal(e2.isDead, true);
  assert.equal(scene.relicManager.vampiricKillStreak, 2);

  // Kill 3: Super Nova ultimate
  const e3 = new ChaserEnemy(scene, 1 * TILE_SIZE + 20, 2 * TILE_SIZE + 20);
  scene.enemies.add(e3);
  activeTimers.length = 0;
  scene.executeSuperNova(ULTIMATE_SKILLS.SUPER_NOVA);
  for (let pass = 0; pass < 3; pass++) {
    for (const t of [...activeTimers]) {
      if (!t.removed && typeof t.callback === 'function') {
        t.removed = true;
        t.callback();
      }
    }
  }
  assert.equal(e3.isDead, true);
  assert.equal(scene.relicManager.vampiricKillStreak, 3);

  // Kill 4: Tesla Overcharge Coil detonation relic proc
  const e4 = new ChaserEnemy(scene, 5 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(e4);
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.placeBomb();
  const placedBomb = scene.bombs.getChildren().find((b) => b.active && !b.getData('isGhostBomb'));
  assert.ok(placedBomb);
  scene.time.now = 5000;
  scene.explodeBomb(placedBomb, 3, 3);
  assert.equal(e4.isDead, true);
  assert.equal(scene.relicManager.vampiricKillStreak, 4);

  // Kill 5: Explosion vs Enemy overlap -> triggers Vampiric Confection 5th-kill shield (resets streak to 0)!
  const e5 = new TankEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  e5.hp = 1;
  scene.enemies.add(e5);
  const enemyExpOverlap = overlapHandlers.find(
    (h) => h.objA === scene.enemies && h.objB === scene.explosions
  );
  assert.ok(enemyExpOverlap);
  const expSprite = scene.createExplosionSprite(e5.x, e5.y, 'player');
  enemyExpOverlap.cb(e5, expSprite);
  assert.equal(e5.isDead, true);
  assert.equal(scene.relicManager.vampiricKillStreak, 0);
  assert.equal(scene.shieldCharges, 1);
  assert.equal(scene.hasShield, true);

  scene.shutdown();
});

test('Cycle 45.6: Full captureRunState -> onResumeRunState round-trip of activeEntities, activeBombs, playerDropShadow, and activeBuffs', () => {
  const { scene, gameEmitter, activeTimers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const openMap = createOpenArenaMap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      scene.map[r][c] = openMap[r][c];
    }
  }

  // Populate custom enemies: 1-HP enraged BomberEnemy + MiniSplitterEnemy + 2-HP TankEnemy
  scene.enemies.clear(true, true);
  const bomber = new BomberEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  bomber.hp = 1;
  bomber.changeState(EnemyState.ENRAGED);
  scene.enemies.add(bomber);

  const mini = new MiniSplitterEnemy(scene, 7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.enemies.add(mini);

  const tank = new TankEnemy(scene, 9 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  tank.hp = 2;
  scene.enemies.add(tank);

  // Place a player bomb at Spire anchor (3,3) -> spawns primary bomb + entangled ghost bomb!
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.activeBombType = 'PIERCING_BOMB';
  scene.bombPower = 4;
  scene.placeBomb();
  const origBomb = scene.bombs.getChildren().find((b) => b.active && !b.getData('isGhostBomb'));
  assert.ok(origBomb);
  origBomb.setData('id', 'bomb_42');

  scene.activeBuffs = [
    {
      id: 'TIME_FREEZE',
      name: 'Time Freeze',
      icon: '❄️',
      color: '#38bdf8',
      remainingMs: 3200,
      totalMs: 5000,
    },
    {
      id: 'CLOAK',
      name: 'Cloak',
      icon: '👻',
      color: '#a855f7',
      remainingMs: 2800,
      totalMs: 4000,
    },
  ];

  const snapshot = scene.captureRunState('auto_wave');
  assert.equal(snapshot.activeEntities.length, 3);
  assert.deepEqual(
    snapshot.activeEntities.map((e) => e.archetype),
    ['BOMBER', 'SPLITTER_MINI', 'TANK']
  );
  assert.equal(snapshot.activeBombs.length, 2);
  assert.ok(snapshot.activeBombs.some((b) => b.id === 'bomb_42' && !b.isGhostBomb));
  assert.ok(snapshot.activeBombs.some((b) => b.isGhostBomb === true));

  // Re-initialize into a fresh scene state with random enemies & stale player bomb
  const {
    scene: resumedScene,
    gameEmitter: resumedEmitter,
    activeTimers: resumedTimers,
  } = createStatefulGameSceneHarness();
  resumedScene.init();
  resumedScene.create();
  resumedScene.placeBomb();
  const staleBombTimer = resumedTimers[resumedTimers.length - 1];
  assert.ok(staleBombTimer && !staleBombTimer.removed);

  resumedEmitter.emit('resume-run-state', snapshot);

  // Stale pre-resume bomb fuse timer was cleanly removed
  assert.equal(staleBombTimer.removed, true);

  // Player & drop shadow synced + buffs restored
  assert.equal(resumedScene.player.x, 3 * TILE_SIZE + 20);
  assert.equal(resumedScene.player.y, 3 * TILE_SIZE + 20);
  if (resumedScene.playerDropShadow) {
    assert.equal(resumedScene.playerDropShadow.x, 3 * TILE_SIZE + 20);
    assert.equal(resumedScene.playerDropShadow.y, 3 * TILE_SIZE + 34);
  }
  assert.equal(resumedScene.isTimeFrozen, true);
  assert.equal(resumedScene.isCloaked, true);
  assert.equal(resumedScene.player.alpha, 0.35);

  // Restored enemies match exact count, archetypes, HP, MiniSplitter shadow scale, and Bomber ENRAGED state
  const restoredEnemies = resumedScene.enemies.getChildren().filter((e) => e.active);
  assert.equal(restoredEnemies.length, 3);
  const restoredBomber = restoredEnemies.find((e) => e instanceof BomberEnemy);
  const restoredMini = restoredEnemies.find((e) => e instanceof MiniSplitterEnemy);
  const restoredTank = restoredEnemies.find((e) => e instanceof TankEnemy);
  assert.ok(restoredBomber && restoredBomber.hp === 1 && restoredBomber.aiState === EnemyState.ENRAGED);
  assert.ok(restoredMini && restoredMini.dropShadowScale === 0.72);
  assert.ok(restoredTank && restoredTank.hp === 2 && restoredTank.maxHp === 4);

  // Restored primary + ghost bombs are active, paused under TIME_FREEZE, activeBombs === 1 (ghost excluded!), and nextBombUid >= 42
  const restoredBombs = resumedScene.bombs.getChildren().filter((b) => b.active);
  assert.equal(restoredBombs.length, 2);
  assert.equal(resumedScene.activeBombs, 1);
  const restoredPrimary = restoredBombs.find((b) => b.getData('id') === 'bomb_42');
  const restoredGhost = restoredBombs.find((b) => b.getData('isGhostBomb') === true);
  assert.ok(restoredPrimary);
  assert.ok(restoredGhost);
  assert.equal(restoredPrimary.getData('power'), 4);
  assert.equal(restoredPrimary.getData('type'), 'PIERCING_BOMB');
  assert.equal(restoredPrimary.getData('fuseTimer').paused, true);
  assert.equal(restoredGhost.getData('fuseTimer').paused, true);

  // Placing a new bomb generates bomb_43 (no ID collision with bomb_42!)
  resumedScene.maxBombs = 4;
  resumedScene.player.setPosition(1 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  resumedScene.placeBomb();
  const newlyPlaced = resumedScene.bombs
    .getChildren()
    .find((b) => b.active && !b.getData('isGhostBomb') && b.getData('id') !== 'bomb_42');
  assert.ok(newlyPlaced);
  assert.equal(newlyPlaced.getData('id'), 'bomb_43');

  // Partial payload omitting activeEntities/activeBombs preserves existing enemies/bombs
  const partialCountBefore = resumedScene.enemies.getChildren().filter((e) => e.active).length;
  resumedEmitter.emit('resume-run-state', { meta: { score: 9876 } });
  assert.equal(resumedScene.score, 9876);
  assert.equal(resumedScene.enemies.getChildren().filter((e) => e.active).length, partialCountBefore);

  void gameEmitter;
  void activeTimers;
  scene.shutdown();
  resumedScene.shutdown();
});

test('Cycle 45.7: 10,000-frame continuous Zero-GC soak across SteamToyTitanBoss, MutantFloraBoss, GummyBearBoss, SpatialSeparationGrid, and PlayerMovementPhysics', () => {
  const titan = new SteamToyTitanBoss(300, 260);
  const flora = new MutantFloraBoss(300, 260);
  const gummy = new GummyBearBoss(300, 260);
  titan.bossState = BossState.PHASE_2;
  flora.bossState = BossState.PHASE_2;
  gummy.bossState = BossState.PHASE_2;

  let fakeBombAvailable = false;
  gummy.landingBombCheck = () => {
    if (fakeBombAvailable) {
      fakeBombAvailable = false;
      return true;
    }
    return false;
  };

  const sepGrid = new SpatialSeparationGrid();
  const sepEntities = [
    { x: 140, y: 140, active: true, collisionRadius: 16 },
    { x: 148, y: 142, active: true, collisionRadius: 16 },
    { x: 152, y: 138, active: true, collisionRadius: 16 },
    { x: 220, y: 220, active: true, collisionRadius: 12 },
  ];
  const dzOut = {
    up: false,
    down: false,
    left: false,
    right: false,
    angle: 0,
    distance: 0,
    isActive: false,
  };
  const csOut = { vx: 0, vy: 0, facing: 'down' };
  const csInput = {
    px: 64,
    py: 60,
    wantX: 0,
    wantY: 1,
    primaryAxis: 'y',
    speed: 170,
    slideSpeed: 170,
    tolerance: 8,
    isPassable: (r, c) => !(r % 2 === 0 && c % 2 === 0),
  };

  // Warmup
  for (let w = 0; w < 200; w++) {
    titan.update(16, 220, 220);
    flora.update(16, 220, 220);
    gummy.update(16, 220, 220);
    sepGrid.resolveSeparation(sepEntities);
    resolveJoystickDeadzone(0.6, -0.4, 0.15, dzOut);
    resolvePlayerCornerSlide(csInput, csOut);
  }

  if (typeof global.gc === 'function') global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let frame = 0; frame < 10_000; frame++) {
    const px = 120 + ((frame * 7) % 360);
    const py = 120 + ((frame * 5) % 280);

    if (frame % 600 === 0) {
      titan.setClockworkCrisis((frame / 600) % 2 === 0);
    }
    if (frame % 450 === 0 && flora.rootPool.activeCount >= 2) {
      const activeRoot = flora.rootPool.getActive(0);
      if (activeRoot) {
        flora.cleanseRootsAt(activeRoot.row, activeRoot.col, 1);
      }
    }
    if (frame % 500 === 0) {
      fakeBombAvailable = true;
    }

    titan.update(16, px, py);
    flora.update(16, px, py);
    gummy.update(16, px, py);

    // Keep test entities mildly overlapping periodically to stress separation solver
    if (frame % 50 === 0) {
      sepEntities[0].x = 180;
      sepEntities[0].y = 180;
      sepEntities[1].x = 184;
      sepEntities[1].y = 181;
      sepEntities[2].x = 178;
      sepEntities[2].y = 183;
    }
    sepGrid.resolveSeparation(sepEntities);

    const rawJx = Math.sin(frame * 0.05);
    const rawJy = Math.cos(frame * 0.05);
    resolveJoystickDeadzone(rawJx, rawJy, 0.15, dzOut);
    csInput.px = 60 + (frame % 9);
    csInput.wantX = frame % 2 === 0 ? 1 : 0;
    csInput.wantY = frame % 2 === 0 ? 0 : 1;
    csInput.primaryAxis = frame % 2 === 0 ? 'x' : 'y';
    resolvePlayerCornerSlide(csInput, csOut);

    assert.ok(Number.isFinite(titan.x) && Number.isFinite(titan.y));
    assert.ok(Number.isFinite(flora.x) && Number.isFinite(flora.y));
    assert.ok(Number.isFinite(gummy.x) && Number.isFinite(gummy.y));
    assert.ok(titan.shockwavePool.activeCount <= titan.shockwavePool.capacity);
    assert.ok(flora.rootPool.activeCount <= flora.rootPool.capacity);
  }

  if (typeof global.gc === 'function') global.gc();
  const heapAfter = process.memoryUsage().heapUsed;
  const heapDeltaMb = (heapAfter - heapBefore) / (1024 * 1024);
  assert.ok(heapDeltaMb < 24, `Expected bounded heap delta < 24MB across 10k frames, got ${heapDeltaMb.toFixed(2)}MB`);

  titan.destroy();
  flora.destroy();
  gummy.destroy();

  assert.equal(titan.shockwavePool.activeCount, 0);
  assert.equal(titan.gearProjectilePool.activeCount, 0);
  assert.equal(flora.rootPool.activeCount, 0);
});
