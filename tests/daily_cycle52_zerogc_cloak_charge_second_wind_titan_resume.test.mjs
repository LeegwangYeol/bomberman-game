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
  EnemyState,
  ChaserEnemy,
  GhostEnemy,
  MiniSplitterEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');
const {
  MiniBomberAlly,
} = await import('../src/game/entities/AllyEntities.ts');
const {
  MerchantNPC,
} = await import('../src/game/entities/NeutralEntities.ts');
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
  SteamToyTitanBoss,
  MutantFloraBoss,
} = await import('../src/game/bosses/index.ts');
const {
  RelicId,
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
  const colliders = [];
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
      collider: (objA, objB, cb, processCb) => {
        colliders.push({ objA, objB, cb, processCb });
      },
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
    colliders,
    overlapHandlers,
    graphicsFillAlphas,
    floatingTexts,
    activeTweens,
  };
}

test('Cycle 52.1: Committed ChaserEnemy charge, GhostEnemy ether dash, and MiniBomberAlly bomb escape complete even when player cloaks or deactivates', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  const map = createOpenCorridorMap();
  scene.map = map;
  const bombMask = new FlatHazardMask();

  // 1. ChaserEnemy enters WINDUP along row 3 toward player at (3, 6), then player cloaks (null)
  const chaser = new ChaserEnemy(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(chaser);
  scene.player.setPosition(6 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.player.active = true;

  chaser.updateAI(16, 1000, scene.player, map, bombMask);
  assert.equal(chaser.aiState, EnemyState.WINDUP, 'ChaserEnemy must initiate WINDUP along open corridor');

  // Player activates CLOAK -> enemyTarget becomes null
  chaser.updateAI(chaser.config.windupMs + 20, 1450, null, map, bombMask);
  assert.equal(
    chaser.aiState,
    EnemyState.ATTACK,
    'ChaserEnemy must transition WINDUP -> ATTACK even when player cloaked mid-windup'
  );
  assert.ok(chaser.body.velocity.x > 0, 'ChaserEnemy must launch corridor dash along committed attackDir');

  chaser.updateAI(650, 2100, null, map, bombMask);
  assert.equal(
    chaser.aiState,
    EnemyState.COOLDOWN,
    'ChaserEnemy must finish committed ATTACK into COOLDOWN instead of freezing indefinitely'
  );

  // 2. GhostEnemy initiates ether dash, then player cloaks mid-dash
  const ghost = new GhostEnemy(scene, 3 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.enemies.add(ghost);
  scene.player.setPosition(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  ghost.dashCooldownTimer = 0;
  ghost.updateAI(16, 3000, scene.player, map, bombMask);
  assert.equal(ghost.isDashing, true, 'GhostEnemy must start ether dash within 4 tiles');
  assert.ok(ghost.body.velocity.x > 0, 'GhostEnemy must dash toward player');

  // Player cloaks mid-dash: GhostEnemy continues dash then cleanly exits isDashing
  ghost.updateAI(200, 3200, null, map, bombMask);
  assert.equal(ghost.isDashing, true);
  assert.ok(ghost.body.velocity.x > 0, 'GhostEnemy must maintain ether dash velocity while mid-dash');

  ghost.updateAI(300, 3500, null, map, bombMask);
  assert.equal(ghost.isDashing, false, 'GhostEnemy must clear isDashing once dashRemainingMs expires');
  assert.equal(ghost.body.velocity.x, 0, 'GhostEnemy must halt once dash finishes and player is cloaked');

  // 3. MiniBomberAlly plants bomb and continues escaping even if player becomes inactive
  const ally = new MiniBomberAlly(scene, 4 * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  scene.allies.add(ally);
  scene.player.setPosition(10 * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  ally.bombCooldownTimer = 0;

  let bombPlaced = false;
  ally.updateAI(16, 4000, scene.player, map, bombMask, (r, c) => {
    bombMask.setCoord(r, c, 1);
    bombPlaced = true;
    return true;
  });
  assert.equal(bombPlaced, true, 'MiniBomberAlly must place bomb when safe escape exists');

  ally.updateAI(16, 4016, null, map, bombMask);
  const allySpeed = Math.hypot(ally.body.velocity.x, ally.body.velocity.y);
  assert.ok(
    allySpeed > 0,
    'MiniBomberAlly must continue steering along escapePath away from its bomb even if player is null'
  );

  scene.shutdown();
});

test('Cycle 52.2: Second Wind perk survives scene.restart() lifecycle, grants +50% speed burst, and persists secondWindConsumed across save-resume', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  gameEmitter.emit('perks-updated', { perks: { second_wind: 1 } });
  assert.equal(scene.secondWindConsumed, false);
  assert.equal(scene.hasShield, false);
  assert.equal(scene.extraLives, 0);

  // First fatal hit triggers Second Wind (+1 shield, 3s i-frames, +50% speed burst)
  scene.time.now = 2000;
  scene.playerDie();
  assert.equal(scene.isGameOver, false, 'Second Wind must save player from first fatal blow');
  assert.equal(scene.secondWindConsumed, true);
  assert.equal(scene.hasShield, true);
  assert.equal(scene.shieldCharges, 1);
  assert.equal(scene.dashSpeedBurstMultiplier, 1.5, 'Second Wind must apply +50% speed burst multiplier');
  assert.ok(scene.dashSpeedBurstRemaining >= 3000, 'Second Wind speed burst must last full grace window');

  // Verify save-resume preserves secondWindConsumed (prevents reload infinite-revive exploit)
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);
  const saved = scene.captureRunState('manual');
  assert.equal(saved.player.secondWindConsumed, true);
  persistence.saveRunState(saved);

  const resumedHarness = createStatefulGameSceneHarness();
  resumedHarness.scene.init();
  resumedHarness.scene.create();
  resumedHarness.gameEmitter.emit('perks-updated', { perks: { second_wind: 1 } });
  resumedHarness.gameEmitter.emit('resume-run-state', persistence.loadRunState());
  assert.equal(
    resumedHarness.scene.secondWindConsumed,
    true,
    'Resumed run must preserve secondWindConsumed === true'
  );
  resumedHarness.scene.hasShield = false;
  resumedHarness.scene.shieldCharges = 0;
  resumedHarness.scene.isInvulnerable = false;
  resumedHarness.scene.playerDie();
  assert.equal(
    resumedHarness.scene.isGameOver,
    true,
    'Consumed Second Wind must not trigger a second time after save-reload'
  );
  resumedHarness.scene.shutdown();

  // Simulate scene.restart() (shutdown -> init -> create) WITHOUT re-emitting perks-updated
  scene.shutdown();
  scene.init();
  scene.create();
  assert.equal(scene.secondWindConsumed, false, 'New run after scene.restart() must reset secondWindConsumed');
  assert.ok(scene.perkManager, 'create() must rebind perkManager when appliedPerkBonuses is present');

  scene.time.now = 5000;
  scene.playerDie();
  assert.equal(
    scene.isGameOver,
    false,
    'Second Wind must work again on subsequent runs after scene.restart() without needing a new perks-updated event'
  );
  assert.equal(scene.secondWindConsumed, true);
  assert.equal(scene.hasShield, true);

  scene.shutdown();
});

test('Cycle 52.3: Zero-GC destroyBlock & merchant trade avoid getStats() heap clones, and inventory resets/restores in-place', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const initialInventoryRef = scene.inventory;
  assert.ok(initialInventoryRef && typeof initialInventoryRef === 'object');

  let nonEmitGetStatsCalls = 0;
  let insideEmitStats = false;
  const origEmitStatsUpdate = scene.emitStatsUpdate.bind(scene);
  const origGetStats = scene.getStats.bind(scene);
  scene.emitStatsUpdate = () => {
    insideEmitStats = true;
    try {
      origEmitStatsUpdate();
    } finally {
      insideEmitStats = false;
    }
  };
  scene.getStats = () => {
    if (!insideEmitStats) {
      nonEmitGetStatsCalls++;
    }
    return origGetStats();
  };

  // Place soft block + gilded chest block and destroy both
  scene.ultimateGauge = scene.ultimateMax;
  scene.isUltimateReady = true;
  scene.map[3][3] = TILE_BLOCK;
  const softBlock = scene.blocks.create(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20, 'block');
  softBlock.setData('row', 3);
  softBlock.setData('col', 3);

  scene.map[3][4] = TILE_BLOCK;
  const chestBlock = scene.blocks.create(4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20, 'block');
  chestBlock.setData('row', 3);
  chestBlock.setData('col', 4);
  chestBlock.setData('isChest', true);

  nonEmitGetStatsCalls = 0;
  scene.destroyBlock(3, 3);
  scene.destroyBlock(3, 4);
  assert.equal(
    nonEmitGetStatsCalls,
    0,
    'destroyBlock on standard and gilded blocks must use Zero-GC scratchDropStats with 0 non-HUD getStats() calls'
  );

  // Merchant trade must also use scratchDropStats with 0 non-HUD getStats() calls
  const merchant = new MerchantNPC(scene, scene.player.x + TILE_SIZE, scene.player.y);
  scene.neutrals.add(merchant);
  scene.starCandies = 50;
  nonEmitGetStatsCalls = 0;
  const traded = scene.tryTradeWithNearbyMerchant(123);
  assert.equal(traded, true);
  assert.equal(
    nonEmitGetStatsCalls,
    0,
    'tryTradeWithNearbyMerchant must use Zero-GC scratchDropStats with 0 non-HUD getStats() calls'
  );

  // Verify inventory reference stability across resume-run-state and create()
  const snap = origGetStats();
  snap.inventory.ICE_BOMB = 4;
  snap.inventory.SHIELD = 2;
  gameEmitter.emit('resume-run-state', {
    player: {
      x: 60,
      y: 60,
      gridRow: 1,
      gridCol: 1,
      facing: 'down',
      hp: 1,
      stats: snap,
    },
  });
  assert.equal(
    scene.inventory,
    initialInventoryRef,
    'applySavedInventoryInPlace must mutate inventory object in-place without allocating a replacement object'
  );
  assert.equal(scene.inventory.ICE_BOMB, 4);
  assert.equal(scene.inventory.SHIELD, 2);
  assert.equal(scene.inventory.LANDMINE, 0);

  scene.create();
  assert.equal(
    scene.inventory,
    initialInventoryRef,
    'resetInventoryInPlace in create() must preserve the existing inventory object reference'
  );
  assert.equal(scene.inventory.ICE_BOMB, 0);
  assert.equal(scene.inventory.SHIELD, 0);

  scene.shutdown();
});

test('Cycle 52.4: Clock-domain alignment anchors applySpeedMultiplier and ICE_BOMB/relic debuffs on newly spawned same-tick entities', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();

  scene.time.now = 42_000;
  const freshMini = new MiniSplitterEnemy(scene, 4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.enemies.add(freshMini);
  freshMini.hp = 5;
  freshMini.maxHp = 5;

  // Trigger ICE_BOMB explosion on (4, 4) before freshMini has ever executed update() (_lastEntityTimeMs === -1)
  scene.spawnExplosion(4, 4, true, 'player', 'ice_test_1', false, 'ICE_BOMB');

  assert.equal(freshMini.isStunned, true);
  assert.equal(freshMini.stunUntil, 45_000, 'Stun expiry must anchor to scene clock 42,000 + 3,000ms');
  assert.equal(freshMini.speedMultiplier, 0.35);
  assert.equal(
    freshMini.speedMultiplierUntilMs,
    45_500,
    'Speed multiplier expiry must anchor to scene clock 42,000 + 3,500ms instead of expiring immediately'
  );

  // Advance to 45,100ms: stun expires, 0.35x chill slow remains active for another 400ms
  freshMini.updateEntity(16, 45_100);
  assert.equal(freshMini.isStunned, false);
  assert.equal(freshMini.speedMultiplier, 0.35);
  freshMini.setVelocity(100, 0);
  assert.ok(Math.abs(freshMini.body.velocity.x - 35) < 1e-6, 'Active chill slow must scale velocity by 0.35x');

  // Advance past 45,500ms: chill slow expires cleanly back to 1.0x
  freshMini.updateEntity(16, 45_600);
  assert.equal(freshMini.speedMultiplier, 1.0);
  assert.equal(freshMini.speedMultiplierUntilMs, 0);

  scene.shutdown();
});

test('Cycle 52.5: ORBITAL_TARGETING_CORE delayed kinetic lance chain-detonates active bombs on target tiles', () => {
  const { scene, activeTimers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();

  scene.relicManager.discoverRelic(RelicId.ORBITAL_TARGETING_CORE);
  scene.relicManager.equipRelic(RelicId.ORBITAL_TARGETING_CORE);

  // Place primary Bomb A at (5, 5), detonate it to arm the 1,200ms Orbital Targeting Core lock-on at (5, 5),
  // then plant Bomb B on (5, 5) during the lock-on window so the delayed orbital lance chain-detonates Bomb B!
  scene.time.now = 10_000;
  const bombA = scene.bombs.get(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20, 'bomb');
  bombA.setActive(true).setVisible(true);
  bombA.setData('id', 'bomb_primary');
  bombA.setData('owner', 'player');
  bombA.setData('power', 1);
  bombA.setData('type', 'REGULAR');

  scene.explodeBomb(bombA, 5, 5);

  const orbitalTimer = activeTimers.find((t) => !t.removed && t.delayMs === 1200);
  assert.ok(orbitalTimer, 'Orbital Targeting Core must schedule a 1,200ms delayed kinetic lance');

  scene.time.now = 10_500;
  const bombB = scene.bombs.get(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20, 'bomb');
  bombB.setActive(true).setVisible(true);
  bombB.setData('id', 'bomb_secondary_orbital_target');
  bombB.setData('owner', 'player');
  bombB.setData('power', 2);
  bombB.setData('type', 'REGULAR');
  assert.equal(bombB.active, true);

  // Clear primary explosion visuals before orbital impact so we verify Bomb B's chain ray cleanly
  scene.explosions.clear(true, true);

  scene.time.now = 11_200;
  orbitalTimer.callback();

  assert.equal(
    bombB.active,
    false,
    'Orbital Targeting Core kinetic lance at (5, 5) must chain-detonate Bomb B'
  );
  const explodedAtRow3Col5 = scene.explosions
    .getChildren()
    .some((exp) => Math.floor(exp.y / TILE_SIZE) === 3 && Math.floor(exp.x / TILE_SIZE) === 5);
  assert.equal(
    explodedAtRow3Col5,
    true,
    'Chain-detonated Bomb B (power 2 at row 5, col 5) must propagate its blast ray to (3, 5)'
  );

  scene.shutdown();
});

test('Cycle 52.6: Lossless mid-attack save-resume for SteamToyTitanBoss (mallet windup & shockwave) and MutantFloraBoss (burrowed invulnerability & timers)', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);

  // 1. SteamToyTitanBoss mid-mallet windup + steam vent in PHASE_2
  const h1 = createStatefulGameSceneHarness();
  h1.scene.init();
  h1.scene.create();
  h1.scene.startBossEncounter('steam_toy_titan');
  assert.ok(h1.scene.activeBoss instanceof SteamToyTitanBoss);

  const titan = h1.scene.activeBoss;
  titan.bossState = BossState.PHASE_2;
  titan.phase = 2;
  titan.currentHp = 10;
  titan.gearShieldActive = true;
  titan.gearRotationAngle = 1.75;
  titan.facingAngle = 0.5;
  titan.startMalletWindup(260, 220);
  titan.update(300, 260, 220);
  titan.triggerSteamVent();
  titan.update(300, 260, 220); // 400ms remaining in windup (tier 3) & 300ms remaining in steam vent!

  const expectedGearAngle = titan.gearRotationAngle;
  assert.equal(titan.isMalletWindingUp, true);
  assert.equal(titan.malletWindupTimerMs, 400);

  persistence.saveRunState(h1.scene.captureRunState('manual'));
  h1.scene.shutdown();

  const h2 = createStatefulGameSceneHarness();
  h2.scene.init();
  h2.scene.create();
  h2.gameEmitter.emit('resume-run-state', persistence.loadRunState());

  assert.ok(h2.scene.activeBoss instanceof SteamToyTitanBoss);
  const resumedTitan = h2.scene.activeBoss;
  assert.equal(resumedTitan.bossState, BossState.PHASE_2);
  assert.equal(resumedTitan.isMalletWindingUp, true);
  assert.equal(resumedTitan.malletWindupTimerMs, 400);
  assert.equal(resumedTitan.malletImpactX, 260);
  assert.equal(resumedTitan.malletImpactY, 220);
  assert.equal(resumedTitan.isSteamVenting, true);
  assert.ok(Math.abs(resumedTitan.gearRotationAngle - expectedGearAngle) < 1e-6);

  const activeTelegraphs = resumedTitan.getActiveTelegraphs().filter((t) => t.active);
  assert.ok(activeTelegraphs.length > 0, 'Resumed Titan mid-windup must reconstruct floor telegraph tiles');
  assert.equal(activeTelegraphs[0].tier, 3, '400ms remaining windup must restore tier 3 telegraph urgency');
  assert.equal(activeTelegraphs[0].timerMs, 400);

  // Advancing 400ms completes the resumed windup into mallet shockwave slam at (260, 220)
  resumedTitan.update(400, 260, 220);
  assert.equal(resumedTitan.isMalletWindingUp, false);
  assert.equal(resumedTitan.malletImpactActive, true);
  assert.equal(resumedTitan.shockwavePool.activeCount, 1);
  assert.equal(resumedTitan.evaluatePlayerMalletHit(260, 220).hit, true);

  // Save & resume mid-shockwave!
  persistence.saveRunState(h2.scene.captureRunState('manual'));
  h2.scene.shutdown();

  const h3 = createStatefulGameSceneHarness();
  h3.scene.init();
  h3.scene.create();
  h3.gameEmitter.emit('resume-run-state', persistence.loadRunState());
  const shockwaveTitan = h3.scene.activeBoss;
  assert.ok(shockwaveTitan instanceof SteamToyTitanBoss);
  assert.equal(shockwaveTitan.malletImpactActive, true);
  assert.equal(shockwaveTitan.shockwavePool.activeCount, 1, 'Resumed mid-shockwave Titan must restore pooled shockwave');
  assert.equal(shockwaveTitan.evaluatePlayerMalletHit(260, 220).hit, true);
  h3.scene.shutdown();

  // 2. MutantFloraBoss burrowed underground in ENRAGED with custom attack cadence timers
  const h4 = createStatefulGameSceneHarness();
  h4.scene.init();
  h4.scene.create();
  h4.scene.startBossEncounter('boss_mutant_flora');
  assert.ok(h4.scene.activeBoss instanceof MutantFloraBoss);
  const flora = h4.scene.activeBoss;
  flora.bossState = BossState.ENRAGED;
  flora.phase = 3;
  flora.currentHp = 4;
  flora.burrowUnderground(1400);
  flora.rootTimerMs = 1120;
  flora.pollenTimerMs = 840;
  flora.vineWhipCooldownMs = 620;
  flora.spawnSubterraneanRoot(220, 220);

  persistence.saveRunState(h4.scene.captureRunState('manual'));
  h4.scene.shutdown();

  const h5 = createStatefulGameSceneHarness();
  h5.scene.init();
  h5.scene.create();
  h5.gameEmitter.emit('resume-run-state', persistence.loadRunState());
  const resumedFlora = h5.scene.activeBoss;
  assert.ok(resumedFlora instanceof MutantFloraBoss);
  assert.equal(resumedFlora.isUnderground, true);
  assert.equal(resumedFlora.isInvulnerable, true, 'Burrowed MutantFloraBoss must preserve isInvulnerable on resume');
  assert.equal(resumedFlora.canTakeDamage(), false);
  assert.equal(resumedFlora.undergroundTimerMs, 1400);
  assert.equal(resumedFlora.rootTimerMs, 1120);
  assert.equal(resumedFlora.pollenTimerMs, 840);
  assert.equal(resumedFlora.vineWhipCooldownMs, 620);
  assert.equal(resumedFlora.activeRoots, 1);
  h5.scene.shutdown();
});

test('Cycle 52.7: 10,000-frame continuous combat, cloak dashes, block drops, and SteamToyTitanBoss Zero-GC soak test', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness({ recordDrawCalls: false });
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.startBossEncounter('steam_toy_titan');
  assert.ok(scene.activeBoss instanceof SteamToyTitanBoss);
  scene.activeBoss.bossState = BossState.PHASE_2;
  scene.activeBoss.phase = 2;

  const chaser = new ChaserEnemy(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  const ghost = new GhostEnemy(scene, 11 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  const ally = new MiniBomberAlly(scene, 3 * TILE_SIZE + 20, 9 * TILE_SIZE + 20);
  scene.enemies.add(chaser);
  scene.enemies.add(ghost);
  scene.allies.add(ally);

  const dt = 16.67;
  let simNow = 1000;
  for (let frame = 0; frame < 10_000; frame++) {
    simNow += dt;
    scene.time.now = simNow;

    // Periodically toggle player cloak every 250 frames to stress mid-windup/mid-dash cloak transitions
    if (frame % 250 === 0) {
      scene.isCloaked = !scene.isCloaked;
    }

    // Periodically spawn and destroy a soft block to stress Zero-GC scratchDropStats + pooled debris
    if (frame % 200 === 0) {
      scene.map[6][7] = TILE_BLOCK;
      scene.destroyBlock(6, 7);
    }

    scene.update(simNow, dt);

    // Drain short-lived VFX tweens every 30 frames so pooled shapes return cleanly as in real gameplay
    if (frame % 30 === 0 && activeTweens.size > 0) {
      for (const tw of Array.from(activeTweens)) {
        if (typeof tw.complete === 'function') tw.complete();
      }
    }

    assert.ok(Number.isFinite(scene.activeBoss.x) && Number.isFinite(scene.activeBoss.y));
    assert.ok(Number.isFinite(chaser.x) && Number.isFinite(chaser.y));
    assert.ok(Number.isFinite(ghost.x) && Number.isFinite(ghost.y));
  }

  assert.equal(scene.circlePool.verifyInvariants(), true);
  assert.equal(scene.rectPool.verifyInvariants(), true);
  assert.equal(scene.graphicsPool.verifyInvariants(), true);
  assert.equal(scene.spritePool.verifyInvariants(), true);
  assert.equal(scene.shadowPool.verifyInvariants(), true);
  assert.equal(scene.floatingTextPool.verifyInvariants(), true);
  assert.equal(scene.nameTagTextPool.verifyInvariants(), true);
  assert.equal(scene.intentBadgeTextPool.verifyInvariants(), true);
  assert.equal(scene.activeBoss.shockwavePool.verifyInvariants(), true);
  assert.equal(scene.activeBoss.gearProjectilePool.verifyInvariants(), true);

  scene.shutdown();
});
