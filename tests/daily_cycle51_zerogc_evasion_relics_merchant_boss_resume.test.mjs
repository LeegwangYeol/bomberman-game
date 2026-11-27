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
  BomberEnemy,
  TankEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');
const {
  MiniBomberAlly,
  PetDroneAlly,
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
  FlatHazardMask,
} = await import('../src/game/pathfinding.ts');
const {
  BossState,
  QueenBeeBoss,
  HamsterBoss,
  GummyBearBoss,
} = await import('../src/game/bosses/index.ts');
const {
  CrisisStage,
  CrisisType,
  PsychicCrisis,
} = await import('../src/game/crises/index.ts');
const {
  GameModeType,
  GameModeManager,
  ROGUELITE_BOONS_CATALOG,
  RelicManager,
  RelicId,
  WaveMutatorId,
  sanitizeRunProgressionState,
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
    tweenConfigs,
    activeTweens,
  };
}

test('Cycle 51.1: Zero-GC static validation Sets, zero-clone generateBoonDraft determinism, & spawnItem glow alpha <= 0.40 non-occlusion', () => {
  // 1. Deterministic Boon Draft without mutating or cloning ROGUELITE_BOONS_CATALOG
  const modeMgr = new GameModeManager(GameModeType.ENDLESS_GAUNTLET);
  const catalogBefore = ROGUELITE_BOONS_CATALOG.map((b) => b.id);
  const draftA = modeMgr.generateBoonDraft(42);
  const draftB = modeMgr.generateBoonDraft(42);
  assert.equal(draftA.length, 3);
  assert.equal(new Set(draftA.map((b) => b.id)).size, 3, 'All 3 drafted boons must be unique');
  assert.deepEqual(
    draftA.map((b) => b.id),
    draftB.map((b) => b.id),
    'generateBoonDraft must remain 100% deterministic for identical seeds'
  );
  assert.deepEqual(
    ROGUELITE_BOONS_CATALOG.map((b) => b.id),
    catalogBefore,
    'ROGUELITE_BOONS_CATALOG order must never be mutated'
  );

  // 2. Static validation Sets in ProgressionPersistence & GameStatePersistence
  const sanitizedProg = sanitizeRunProgressionState({
    mode: GameModeType.BOSS_RUSH,
    wave: 7,
    equippedRelics: [RelicId.VOID_SINGULARITY_LENS, 'INVALID_RELIC', RelicId.PYROCLASTIC_PRISM],
    appliedPerks: { maxRelicSlots: 2 },
    activeMutators: [{ id: WaveMutatorId.SPEED_DEMON }, { id: 'BOGUS_MUTATOR' }],
  });
  assert.equal(sanitizedProg.mode, GameModeType.BOSS_RUSH);
  assert.deepEqual(sanitizedProg.equippedRelics, [
    RelicId.VOID_SINGULARITY_LENS,
    RelicId.PYROCLASTIC_PRISM,
  ]);
  assert.equal(sanitizedProg.activeMutators.length, 1);

  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());
  const sanitizedMeta = persistence.sanitizeMetaProfile({
    starCandies: 120,
    cosmicEssence: 85,
    unlockedModes: ['boss_rush', GameModeType.CRISIS_SURVIVAL, 'HACKED_MODE'],
    equippedRelics: [RelicId.PSIONIC_FEEDBACK_CRYSTAL, 'FAKE_RELIC'],
  });
  assert.equal(sanitizedMeta.unlockedModes.length, 2);
  assert.deepEqual(sanitizedMeta.equippedRelics, [RelicId.PSIONIC_FEEDBACK_CRYSTAL]);

  // 3. spawnItem 600ms golden grace glow strictly enforces alpha <= 0.40 & releases cleanly to circlePool
  const { scene, tweenConfigs } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  tweenConfigs.length = 0;

  scene.spawnItem(4, 5, 'SPEED_UP', 1500);
  assert.equal(scene.circlePool.activeCount, 1, 'Item grace glow must acquire 1 pooled arc');
  const glowArc = scene.circlePool.getActive(0);
  assert.ok(glowArc);
  assert.ok(glowArc.alpha <= 0.40 && glowArc.fillAlpha <= 0.40, `Item grace glow alpha (${glowArc.alpha}) must obey <= 0.40 non-occlusion`);
  assert.ok(glowArc.strokeAlpha <= 0.40, `Item grace glow stroke alpha (${glowArc.strokeAlpha}) must obey <= 0.40`);

  scene.tweens.killTweensOf(glowArc);
  assert.equal(scene.circlePool.activeCount, 0, 'Killing/completing item glow tween must return arc to circlePool');
  assert.equal(glowArc.strokeWidth, 0, 'Stroke style must be reset on release');
  assert.equal(scene.circlePool.verifyInvariants(), true);
  scene.shutdown();
});

test('Cycle 51.2: BomberEnemy cloak-evasion safety, immediate <4px evasion waypoint advancement, & PetDroneAlly stun clock alignment', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();

  // 1. BomberEnemy in EVADING must NOT freeze on its own ticking bomb when player activates CLOAK (player === null)
  const bomber = new BomberEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  bomber.activeBombs = 1;
  bomber.changeState(EnemyState.EVADING);
  // First waypoint at (5,5) is < 4px away; second waypoint at (5,6) is 40px right
  bomber.escapePath = [
    { r: 5, c: 5 },
    { r: 5, c: 6 },
  ];

  const bombMask = new FlatHazardMask(ROWS * COLS);
  bombMask.setCoord(5, 5, 1);

  bomber.updateAI(16, 2000, null, scene.map, bombMask);
  assert.equal(bomber.escapePath.length, 1, 'Reached <4px waypoint must be immediately shifted out of escapePath');
  assert.deepEqual(bomber.escapePath[0], { r: 5, c: 6 });
  assert.ok(
    bomber.body.velocity.x > 0,
    'Cloaked player (null target) must NEVER freeze an EVADING BomberEnemy on top of its own bomb'
  );

  // 2. MiniBomberAlly & MerchantNPC immediate <4px escape/flee waypoint advancement
  const pomPom = new MiniBomberAlly(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  pomPom.activeBombs = 1;
  pomPom.evadeTimeoutMs = 2000;
  pomPom.escapePath = [
    { r: 3, c: 3 },
    { r: 3, c: 4 },
  ];
  pomPom.updateAI(16, 2000, scene.player, scene.map, bombMask, () => false);
  assert.equal(pomPom.escapePath.length, 1);
  assert.ok(pomPom.body.velocity.x > 0, 'MiniBomberAlly must immediately steer toward next safe escape tile');

  const merchant = new MerchantNPC(scene, 5 * TILE_SIZE + 21, 5 * TILE_SIZE + 20);
  merchant.fleePath = [
    { r: 5, c: 5 },
    { r: 5, c: 6 },
    { r: 6, c: 6 },
  ];
  merchant.updateAI(16, 2000, scene.player, scene.map, bombMask);
  assert.equal(merchant.fleePath.length, 2);
  assert.deepEqual(merchant.fleePath[0], { r: 5, c: 6 });
  assert.ok(merchant.body.velocity.x > 0, 'MerchantNPC must immediately advance past <4px flee waypoint');

  // 3. PetDroneAlly stun bolt synchronizes targetEnemy stun clock even after scene clock jumps
  const drone = new PetDroneAlly(scene, 4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  drone.shootTimer = 0;
  const chaser = new ChaserEnemy(scene, 5 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  drone.updateAI(16, 50000, scene.player, [], [chaser]);
  assert.equal(chaser.isStunned, true);
  assert.equal(chaser.stunUntil, 50000 + drone.config.stunDurationMs);
  // Next tick at 50016ms must NOT prematurely expire stun due to stale _lastEntityTimeMs
  chaser.updateEntity(16, 50016);
  assert.equal(chaser.isStunned, true, 'Enemy stunned by PetDroneAlly must remain stunned across subsequent frames');

  scene.shutdown();
});

test('Cycle 51.3: PSIONIC_FEEDBACK_CRYSTAL dispels diagonal PsychicCrisis illusions within pulseRadius even with 0 enemies', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.enemies.clear(true, true);

  scene.relicManager = new RelicManager([RelicId.PSIONIC_FEEDBACK_CRYSTAL], 1);
  scene.startCrisisMode(CrisisType.PSYCHIC_INVASION);
  const psychic = scene.crisisManager.getActiveCrisis();
  assert.ok(psychic instanceof PsychicCrisis);
  psychic.setStage(CrisisStage.OUTBREAK);

  // OUTBREAK spawns psionic disruption at (4, 3), diagonally 1.414 tiles from bomb at (5, 4) — outside cardinal cross!
  assert.equal(psychic.hasIllusionAt(4, 3), true);

  scene.player.setPosition(4 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.time.now = 4000;
  const scoreBefore = scene.score;
  scene.placeBomb();
  const bomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(bomb);
  scene.explodeBomb(bomb, 5, 4);

  assert.equal(
    psychic.hasIllusionAt(4, 3),
    false,
    'PSIONIC_FEEDBACK_CRYSTAL 2.0-tile radial pulse must dispel diagonal psionic illusions even with 0 enemies'
  );
  assert.ok(scene.score >= scoreBefore + 150, 'Dispelling psionic illusion must award +150 score');
  assert.equal(scene.hasBuff('DISTORTION_BARRIER'), true, 'Dispelling illusion must grant Distortion Barrier');

  scene.shutdown();
});

test('Cycle 51.4: GELATINOUS_CORE wall-bounce knockback, Quantum Event Horizon 2.5-tile pull, & Cosmic Supernova root + 2x shard damage', () => {
  const { scene, colliders } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.enemies.clear(true, true);

  // 1. Quantum Event Horizon expands VOID_SINGULARITY_LENS onBombPlaced pullRadius to 2.5 tiles
  const rmHorizon = new RelicManager([RelicId.VOID_SINGULARITY_LENS, RelicId.QUANTUM_WARP_PRISM], 2);
  const horizonPull = rmHorizon.onBombPlaced({ r: 5, c: 5 }, [{ id: 'e_far', r: 5, c: 7 }], 2000);
  assert.equal(horizonPull.pullRadius, 2.5);
  assert.deepEqual(horizonPull.pulledEnemyIds, ['e_far']);

  // 2. GELATINOUS_CORE + CLOCKWORK_SPRING (Kinetic Pinball) wall bounce knocks back & stuns nearby enemies
  scene.relicManager = new RelicManager([RelicId.GELATINOUS_CORE, RelicId.CLOCKWORK_SPRING], 2);
  scene.player.setPosition(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  const tank = new TankEnemy(scene, 4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(tank);
  const startTankX = tank.x;

  const playerWallCollider = colliders.find((c) => c.objA === scene.player && c.objB === scene.walls && typeof c.cb === 'function');
  assert.ok(playerWallCollider, 'Player-vs-walls collider must be registered');
  scene.time.now = 5000;
  playerWallCollider.cb(scene.player, null);
  assert.equal(tank.isStunned, true, 'GELATINOUS_CORE wall bounce must stun nearby enemy');
  assert.ok(tank.x > startTankX + 20, `GELATINOUS_CORE must knock enemy outward (${tank.x} > ${startTankX})`);

  // 3. Cosmic Supernova (VOID_SINGULARITY_LENS + PYROCLASTIC_PRISM): 1.0s inward root on bomb placement + 2x shard damage
  scene.enemies.clear(true, true);
  scene.relicManager = new RelicManager([RelicId.VOID_SINGULARITY_LENS, RelicId.PYROCLASTIC_PRISM], 2);
  scene.player.setPosition(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);

  // Place a 4-HP TankEnemy diagonally at (6, 6) (1.414 tiles from (5,5), along Pyroclastic (+1,+1) shard ray)
  const diagTank = new TankEnemy(scene, 6 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  const beforePullDist = Math.hypot(diagTank.x - (5 * TILE_SIZE + 20), diagTank.y - (5 * TILE_SIZE + 20));
  scene.enemies.add(diagTank);

  scene.time.now = 8000;
  scene.placeBomb();
  const afterPullDist = Math.hypot(diagTank.x - (5 * TILE_SIZE + 20), diagTank.y - (5 * TILE_SIZE + 20));
  assert.ok(afterPullDist < beforePullDist, 'Cosmic Supernova bomb placement must pull enemy inward');
  assert.equal(diagTank.isStunned, true, 'Cosmic Supernova must briefly root pulled enemy for 1.0s');

  // Re-center on diagonal tile (6,6), clear i-frames, and detonate bomb at (5,5) to verify 2x diagonal shard damage
  diagTank.setPosition(6 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  diagTank.invulnerableTimer = 0;
  const hpBeforeShard = diagTank.hp;
  scene.time.now = 9000;
  const placedBomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(placedBomb);
  scene.explodeBomb(placedBomb, 5, 5);
  assert.equal(
    diagTank.hp,
    hpBeforeShard - 2,
    'Cosmic Supernova diagonal spark shard must deal double (2) damage to multi-HP enemies'
  );

  scene.shutdown();
});

test('Cycle 51.5: currencies-updated event boot sync & MerchantNPC merchant-traded Star Candy deduction', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.neutrals.clear(true, true);

  // Boot currency sync via game.events 'currencies-updated'
  gameEmitter.emit('currencies-updated', { starCandies: 65, cosmicEssence: 140 });
  assert.equal(scene.starCandies, 65);
  assert.equal(scene.cosmicEssence, 140);

  // Spawn MerchantNPC adjacent to player and trade
  scene.player.setPosition(4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  const pops = new MerchantNPC(scene, 5 * TILE_SIZE + 20, 4 * TILE_SIZE + 20);
  scene.neutrals.add(pops);

  let tradedPayload = null;
  gameEmitter.once('merchant-traded', (p) => {
    tradedPayload = p;
  });

  const traded = scene.tryTradeWithNearbyMerchant(123);
  assert.equal(traded, true);
  assert.equal(scene.starCandies, 45);
  assert.ok(tradedPayload);
  assert.equal(tradedPayload.cost, 20);
  assert.equal(tradedPayload.remainingStarCandies, 45);

  scene.shutdown();
});

test('Cycle 51.6: Lossless checksum-verified mid-attack boss & match timer save-resume (QueenBeeBoss, HamsterBoss, GummyBearBoss)', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());

  // Case A: QueenBeeBoss cruising flightTimeSec & mid-Royal Dive crater trap + Chrono timer cap
  const h1 = createStatefulGameSceneHarness();
  h1.scene.init();
  h1.scene.create();
  h1.scene.matchSecondsRemaining = 27;
  h1.scene.chronoBonusSecondsGranted = 9;
  h1.scene.startBossEncounter('boss_queen_bee');
  assert.ok(h1.scene.activeBoss instanceof QueenBeeBoss);
  const queen1 = h1.scene.activeBoss;
  queen1.bossState = BossState.PHASE_2;
  queen1.phase = 2;
  queen1.shieldsRemaining = 2;
  queen1.flightTimeSec = 3.75;
  queen1.initiateRoyalDive(220, 300);
  queen1.diveTimerMs = 420;
  queen1.x = 250;
  queen1.y = 280;

  const snapQueen = h1.scene.captureRunState('page_hide');
  persistence.saveRunState(snapQueen);
  const loadedQueen = persistence.loadRunState();
  assert.ok(loadedQueen);

  const h2 = createStatefulGameSceneHarness();
  h2.scene.init();
  h2.scene.create();
  h2.scene.onResumeRunState(loadedQueen);
  assert.equal(h2.scene.matchSecondsRemaining, 27);
  assert.equal(h2.scene.chronoBonusSecondsGranted, 9);
  assert.ok(h2.scene.activeBoss instanceof QueenBeeBoss);
  const queen2 = h2.scene.activeBoss;
  assert.equal(queen2.isDiving, true);
  assert.equal(queen2.diveTimerMs, 420);
  assert.equal(queen2.targetDiveX, 220);
  assert.equal(queen2.targetDiveY, 300);
  assert.equal(queen2.flightTimeSec, 3.75);
  assert.equal(queen2.activeShieldCount, 2);
  h1.scene.shutdown();
  h2.scene.shutdown();

  // Case B: HamsterBoss mid-dash velocity, direction, & remainingRebounds
  const h3 = createStatefulGameSceneHarness();
  h3.scene.init();
  h3.scene.create();
  h3.scene.startBossEncounter('boss_hamster_nibbles');
  assert.ok(h3.scene.activeBoss instanceof HamsterBoss);
  const hamster3 = h3.scene.activeBoss;
  hamster3.bossState = BossState.PHASE_2;
  hamster3.phase = 2;
  hamster3.dashSpeed = 260;
  hamster3.startDash({ x: 0, y: -1 });
  hamster3.remainingRebounds = 3;
  hamster3.gatlingTimerMs = 1150;

  const snapHamster = h3.scene.captureRunState('quota_429');
  persistence.saveRunState(snapHamster);
  const loadedHamster = persistence.loadRunState();
  assert.ok(loadedHamster);

  const h4 = createStatefulGameSceneHarness();
  h4.scene.init();
  h4.scene.create();
  h4.scene.onResumeRunState(loadedHamster);
  assert.ok(h4.scene.activeBoss instanceof HamsterBoss);
  const hamster4 = h4.scene.activeBoss;
  assert.equal(hamster4.isDashing, true);
  assert.equal(hamster4.dashDirection.x, 0);
  assert.equal(hamster4.dashDirection.y, -1);
  assert.equal(hamster4.dashSpeed, 260);
  assert.equal(hamster4.remainingRebounds, 3);
  assert.equal(hamster4.vy, -260);
  assert.equal(hamster4.gatlingTimerMs, 1150);
  h3.scene.shutdown();
  h4.scene.shutdown();

  // Case C: GummyBearBoss mid-airborne parabolic leap onto landing target
  const h5 = createStatefulGameSceneHarness();
  h5.scene.init();
  h5.scene.create();
  h5.scene.startBossEncounter('boss_gummy_bear');
  assert.ok(h5.scene.activeBoss instanceof GummyBearBoss);
  const gummy5 = h5.scene.activeBoss;
  gummy5.bossState = BossState.PHASE_2;
  gummy5.phase = 2;
  gummy5.initiateRoyalLeap(180, 220, 1200);
  gummy5.leapTimerMs = 540;
  gummy5.leapElevation = 58;

  const snapGummy = h5.scene.captureRunState('manual');
  persistence.saveRunState(snapGummy);
  const loadedGummy = persistence.loadRunState();
  assert.ok(loadedGummy);

  const h6 = createStatefulGameSceneHarness();
  h6.scene.init();
  h6.scene.create();
  h6.scene.onResumeRunState(loadedGummy);
  assert.ok(h6.scene.activeBoss instanceof GummyBearBoss);
  const gummy6 = h6.scene.activeBoss;
  assert.equal(gummy6.isAirborne, true);
  assert.equal(gummy6.leapTimerMs, 540);
  assert.equal(gummy6.leapDurationMs, 1200);
  assert.equal(gummy6.targetLandingX, 180);
  assert.equal(gummy6.targetLandingY, 220);
  assert.equal(gummy6.leapElevation, 58);
  h5.scene.shutdown();
  h6.scene.shutdown();
});

test('Cycle 51.7: 10,000-frame continuous Zero-GC soak across BomberEnemy evasion, MerchantNPC flee, PetDroneAlly, QueenBeeBoss, HamsterBoss, & Boon/Progression sanitizers', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness({ recordDrawCalls: false });
  scene.init();
  scene.create();
  scene.map = createOpenCorridorMap();
  scene.enemies.clear(true, true);
  scene.allies.clear(true, true);
  scene.neutrals.clear(true, true);

  const bomber = new BomberEnemy(scene, 6 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  scene.enemies.add(bomber);
  const drone = new PetDroneAlly(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.allies.add(drone);
  const merchant = new MerchantNPC(scene, 8 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.neutrals.add(merchant);

  scene.startBossEncounter('boss_queen_bee');
  assert.ok(scene.activeBoss instanceof QueenBeeBoss);
  const queen = scene.activeBoss;
  queen.bossState = BossState.PHASE_2;
  queen.phase = 2;

  const hamster = new HamsterBoss(300, 220);
  hamster.bossState = BossState.PHASE_2;
  hamster.phase = 2;
  hamster.attackManager = scene.bossAttackManager;

  const modeMgr = new GameModeManager(GameModeType.ENDLESS_GAUNTLET);
  const hazardMask = new FlatHazardMask(ROWS * COLS);
  const enemyList = scene.enemies.getChildren();

  // Warmup 200 frames
  for (let w = 0; w < 200; w++) {
    const t = 1000 + w * 16.67;
    scene.time.now = t;
    bomber.updateAI(16.67, t, scene.player, scene.map, hazardMask, () => false);
    drone.updateAI(16.67, t, scene.player, [], enemyList);
    merchant.updateAI(16.67, t, scene.player, scene.map, hazardMask);
    queen.update(16.67, scene.player.x, scene.player.y);
    hamster.update(16.67, scene.player.x, scene.player.y);
    scene.bossAttackManager.update(16.67, scene.player.x, scene.player.y, () => {});
    for (const tw of Array.from(activeTweens)) {
      if (typeof tw.complete === 'function') tw.complete();
    }
  }

  if (typeof global.gc === 'function') global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let frame = 0; frame < 10000; frame++) {
    const nowMs = 5000 + frame * 16.67;
    scene.time.now = nowMs;

    const pCol = 2 + ((frame >>> 4) % 10);
    const pRow = 2 + ((frame >>> 6) % 8);
    scene.player.setPosition(pCol * TILE_SIZE + 20, pRow * TILE_SIZE + 20);

    hazardMask.clear();
    if ((frame & 31) === 0) {
      hazardMask.setCoord(Math.floor(merchant.y / TILE_SIZE), Math.floor(merchant.x / TILE_SIZE), 1);
    }

    // Periodically toggle cloak (null target) while BomberEnemy evades
    const targetForBomber = (frame & 16) === 0 ? null : scene.player;
    bomber.updateAI(16.67, nowMs, targetForBomber, scene.map, hazardMask, () => false);
    bomber.x = Math.max(60, Math.min(540, bomber.x + bomber.body.velocity.x * 0.016));
    bomber.y = Math.max(60, Math.min(460, bomber.y + bomber.body.velocity.y * 0.016));

    drone.updateAI(16.67, nowMs, scene.player, [], enemyList);
    merchant.updateAI(16.67, nowMs, scene.player, scene.map, hazardMask);
    merchant.x = Math.max(60, Math.min(540, merchant.x + merchant.body.velocity.x * 0.016));
    merchant.y = Math.max(60, Math.min(460, merchant.y + merchant.body.velocity.y * 0.016));

    queen.update(16.67, scene.player.x, scene.player.y);
    if (queen.bossState === BossState.STUNNED && (frame & 63) === 0) {
      queen.bossState = BossState.PHASE_2;
      queen.isGrounded = false;
      queen.altitude = 40;
    }
    hamster.update(16.67, scene.player.x, scene.player.y);
    scene.bossAttackManager.update(16.67, scene.player.x, scene.player.y, () => {});

    if ((frame & 127) === 0) {
      modeMgr.generateBoonDraft(frame);
    }

    for (const tw of Array.from(activeTweens)) {
      if (typeof tw.complete === 'function') tw.complete();
    }

    assert.ok(Number.isFinite(bomber.x) && Number.isFinite(bomber.y));
    assert.ok(Number.isFinite(merchant.x) && Number.isFinite(merchant.y));
    assert.ok(Number.isFinite(queen.x) && Number.isFinite(queen.y));
    assert.ok(Number.isFinite(hamster.x) && Number.isFinite(hamster.y));
  }

  scene.bossAttackManager.resetAll();

  if (typeof global.gc === 'function') global.gc();
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

  assert.equal(scene.circlePool.activeCount, 0, 'All pooled stun bolts & rings must be reclaimed');
  assert.equal(scene.circlePool.verifyInvariants(), true);
  assert.equal(scene.bossAttackManager.projectilePool.verifyInvariants(), true);
  assert.equal(scene.bossAttackManager.shockwavePool.verifyInvariants(), true);
  assert.equal(scene.bossAttackManager.telegraphPool.verifyInvariants(), true);
  assert.ok(heapDeltaMb < 24, `10,000-frame soak heap delta (${heapDeltaMb.toFixed(2)} MB) must remain bounded`);

  hamster.destroy();
  scene.shutdown();
});
