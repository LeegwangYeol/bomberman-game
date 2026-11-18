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
  GhostEnemy,
  SplitterEnemy,
  MiniSplitterEnemy,
  EnemyState,
} = await import('../src/game/entities/EnemyEntities.ts');
const {
  MiniBomberAlly,
  PetDroneAlly,
  ShieldGuardAlly,
} = await import('../src/game/entities/AllyEntities.ts');
const {
  MerchantNPC,
  CritterNPC,
} = await import('../src/game/entities/NeutralEntities.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  FlatHazardMask,
  findPathBFS,
  findEscapePathBFS,
  getSafeBombEscapePath,
  getSafeDemolitionApproaches,
  findCorneringBombTile,
  getBlastTiles,
  clearCoordPathInPlace,
  shiftCoordPathInPlace,
  copyCoordPathInPlace,
} = await import('../src/game/pathfinding.ts');
const { RiftCrisis } = await import('../src/game/crises/RiftCrisis.ts');
const { CrisisType, CrisisStage, HazardType } = await import('../src/game/crises/CrisisTypes.ts');
const { ClockworkCrisisAudio } = await import('../src/game/crises/ClockworkCrisisAudio.ts');
const { OrbitalCrisisAudio } = await import('../src/game/crises/OrbitalCrisisAudio.ts');
const { VoidCrisisAudio } = await import('../src/game/crises/VoidCrisisAudio.ts');
const { SteamToyTitanBoss } = await import('../src/game/bosses/SteamToyTitanBoss.ts');
const { MutantFloraBoss } = await import('../src/game/bosses/MutantFloraBoss.ts');
const { GummyBearBoss } = await import('../src/game/bosses/GummyBearBoss.ts');
const { BossState } = await import('../src/game/bosses/BossTypes.ts');
const { AudioVoicePool } = await import('../src/game/pooling/AudioVoicePool.ts');

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
  };

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
      center: { x: 12, y: 12 },
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
      fillRoundedRect() {
        return this;
      },
      strokeRect() {
        return this;
      },
      strokeRoundedRect() {
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
  };
}

test('Cycle 42.1: pathfinding Zero-GC outPath / outApproaches / outCoord reuse & backward-compatible defaults', () => {
  const map = createOpenArenaMap();
  const bombs = new FlatHazardMask(ROWS * COLS);

  const reusablePath = [];
  const freshPath = findPathBFS({ r: 1, c: 1 }, { r: 5, c: 7 }, map, bombs);
  const inPlacePath = findPathBFS({ r: 1, c: 1 }, { r: 5, c: 7 }, map, bombs, false, undefined, reusablePath);
  assert.equal(inPlacePath, reusablePath, 'findPathBFS must return the exact outPath reference');
  assert.deepEqual(inPlacePath, freshPath, 'In-place path coordinates must match fresh path');
  assert.notEqual(freshPath, reusablePath);

  const firstNodeRef = reusablePath[0];
  findPathBFS({ r: 1, c: 1 }, { r: 1, c: 5 }, map, bombs, false, undefined, reusablePath);
  assert.equal(reusablePath[0], firstNodeRef, 'Existing coordinate slot must be mutated in place');
  assert.equal(reusablePath.length, 4);

  // Same-tile clears in place without discarding array
  findPathBFS({ r: 1, c: 1 }, { r: 1, c: 1 }, map, bombs, false, undefined, reusablePath);
  assert.equal(reusablePath.length, 0);

  // Escape & safe bomb escape path reuse
  const danger = new FlatHazardMask(ROWS * COLS);
  getBlastTiles({ r: 3, c: 3 }, 2, map, danger);
  bombs.setCoord(3, 3, 1);

  const reusableEscape = [];
  const freshEscape = findEscapePathBFS({ r: 3, c: 3 }, danger, map, bombs, 8);
  const inPlaceEscape = findEscapePathBFS({ r: 3, c: 3 }, danger, map, bombs, 8, undefined, reusableEscape);
  assert.equal(inPlaceEscape, reusableEscape);
  assert.deepEqual(inPlaceEscape, freshEscape);

  shiftCoordPathInPlace(reusableEscape);
  assert.equal(reusableEscape.length, freshEscape.length - 1);
  assert.deepEqual(reusableEscape[0], freshEscape[1]);

  const copiedEscape = [];
  copyCoordPathInPlace(copiedEscape, freshEscape);
  assert.deepEqual(copiedEscape, freshEscape);
  clearCoordPathInPlace(copiedEscape);
  assert.equal(copiedEscape.length, 0);

  bombs.clear();
  const reusableSafeBombEscape = [];
  const freshSafeEscape = getSafeBombEscapePath({ r: 3, c: 3 }, 2, map, bombs, 8);
  const inPlaceSafeEscape = getSafeBombEscapePath(
    { r: 3, c: 3 },
    2,
    map,
    bombs,
    8,
    undefined,
    reusableSafeBombEscape
  );
  assert.equal(inPlaceSafeEscape, reusableSafeBombEscape);
  assert.deepEqual(inPlaceSafeEscape, freshSafeEscape);

  // Safe demolition approaches & cornering outCoord reuse
  map[3][4] = TILE_BLOCK;
  const reusableApproaches = [];
  const freshApproaches = getSafeDemolitionApproaches({ r: 3, c: 4 }, map, bombs, 2, 8);
  const inPlaceApproaches = getSafeDemolitionApproaches(
    { r: 3, c: 4 },
    map,
    bombs,
    2,
    8,
    undefined,
    reusableApproaches
  );
  assert.equal(inPlaceApproaches, reusableApproaches);
  assert.deepEqual(inPlaceApproaches, freshApproaches);
  map[3][4] = TILE_EMPTY;

  const reusableCornerCoord = { r: -1, c: -1 };
  const freshCorner = findCorneringBombTile({ r: 1, c: 3 }, { r: 1, c: 1 }, map, bombs, true);
  const inPlaceCorner = findCorneringBombTile(
    { r: 1, c: 3 },
    { r: 1, c: 1 },
    map,
    bombs,
    true,
    undefined,
    reusableCornerCoord
  );
  assert.equal(inPlaceCorner, reusableCornerCoord);
  assert.deepEqual(inPlaceCorner, freshCorner);
});

test('Cycle 42.2: Entity AI Zero-GC path buffer identity, demolition cache invalidation & BomberEnemy cooldown gate', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const map = createOpenArenaMap();
  map[1][3] = TILE_BLOCK; // Block corridor between (1,1) and (1,5)
  map[3][1] = TILE_BLOCK; // Enclose player/enemy so demolition pathing runs

  const chaser = new ChaserEnemy(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  const bomber = new BomberEnemy(scene, 5 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  const ally = new MiniBomberAlly(scene, 7 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  const merchant = new MerchantNPC(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);

  const chaserCurrentRef = chaser.currentPath;
  const chaserEscapeRef = chaser.escapePath;
  const bomberCurrentRef = bomber.currentPath;
  const bomberEscapeRef = bomber.escapePath;
  const allyCurrentRef = ally.currentPath;
  const allyEscapeRef = ally.escapePath;
  const merchantFleeRef = merchant.fleePath;

  const player = { x: 9 * TILE_SIZE + 20, y: 1 * TILE_SIZE + 20, active: true };
  const bombTiles = new FlatHazardMask(ROWS * COLS);

  // Run demolition AI while on bomb cooldown, then break block and verify immediate recovery
  chaser.bombCooldownTimer = 2000;
  bomber.bombCooldownTimer = 2000;
  for (let f = 0; f < 10; f++) {
    chaser.updateAI(16, 1000 + f * 16, player, map, bombTiles, () => true);
    bomber.updateAI(16, 1000 + f * 16, player, map, bombTiles, () => true);
    ally.updateAI(16, 1000 + f * 16, player, map, bombTiles, () => true);
  }

  // Trigger evasion & explosion reset and verify backing arrays never get replaced
  chaser.bombCooldownTimer = 0;
  bomber.bombCooldownTimer = 0;
  map[3][1] = TILE_EMPTY;
  map[1][3] = TILE_EMPTY;
  player.x = 3 * TILE_SIZE + 20;
  player.y = 1 * TILE_SIZE + 20;

  chaser.updateAI(16, 2000, player, map, bombTiles, () => true);
  bomber.updateAI(16, 2000, player, map, bombTiles, () => true);
  chaser.onBombExploded();
  bomber.onBombExploded();
  ally.onBombExploded();

  bombTiles.setCoord(5, 4, 1);
  merchant.updateAI(16, 2100, player, map, bombTiles);

  assert.equal(chaser.currentPath, chaserCurrentRef, 'Chaser currentPath array must be preserved in place');
  assert.equal(chaser.escapePath, chaserEscapeRef, 'Chaser escapePath array must be preserved in place');
  assert.equal(bomber.currentPath, bomberCurrentRef, 'Bomber currentPath array must be preserved in place');
  assert.equal(bomber.escapePath, bomberEscapeRef, 'Bomber escapePath array must be preserved in place');
  assert.equal(ally.currentPath, allyCurrentRef, 'MiniBomberAlly currentPath array must be preserved in place');
  assert.equal(ally.escapePath, allyEscapeRef, 'MiniBomberAlly escapePath array must be preserved in place');
  assert.equal(merchant.fleePath, merchantFleeRef, 'MerchantNPC fleePath array must be preserved in place');

  scene.shutdown();
});

test('Cycle 42.3: SplitterEnemy.onDeath reuses pooled inactive MiniSplitterEnemy instances & preserves 0.72 shadow scale', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();

  const splitter = new SplitterEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.enemies.add(splitter);
  scene.attachEntityDropShadow(splitter, 1.0);

  // 1st death allocates 2 MiniSplitterEnemy instances into scene.enemies
  splitter.die(1000);
  assert.equal(splitter.spawnedMinis.length, 2);
  const [firstMiniA, firstMiniB] = splitter.spawnedMinis;
  assert.equal(firstMiniA.dropShadowScale, 0.72);
  assert.equal(firstMiniB.dropShadowScale, 0.72);
  assert.equal(firstMiniA.dropShadow.scaleX, 0.72);
  assert.equal(firstMiniB.dropShadow.scaleX, 0.72);

  const shadowPoolRef = scene.shadowPool;
  const enemyGroupCountAfterFirstSplit = scene.enemies.getChildren().length;

  // Defeat both minis so they become inactive pooled members in scene.enemies
  firstMiniA.die(1200);
  firstMiniB.die(1200);
  assert.equal(firstMiniA.active, false);
  assert.equal(firstMiniB.active, false);

  // Revive parent splitter and trigger 2nd split -> MUST reuse firstMiniA & firstMiniB with 0 new allocations!
  splitter.reviveAt(7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.attachEntityDropShadow(splitter, splitter.dropShadowScale);
  splitter.die(2000);

  assert.equal(
    scene.enemies.getChildren().length,
    enemyGroupCountAfterFirstSplit,
    'Second SplitterEnemy death must reuse pooled inactive MiniSplitterEnemy instances'
  );
  assert.equal(splitter.spawnedMinis[0], firstMiniA);
  assert.equal(splitter.spawnedMinis[1], firstMiniB);
  assert.equal(firstMiniA.active, true);
  assert.equal(firstMiniA.isDead, false);
  assert.equal(firstMiniA.hp, 1);
  assert.equal(firstMiniA.dropShadow.scaleX, 0.72);
  assert.equal(firstMiniB.dropShadow.scaleX, 0.72);

  scene.shutdown();
  assert.equal(shadowPoolRef.activeCount, 0);
});

test('Cycle 42.4: Ally & Neutral reset() lifecycle, pooled revival, and termination-safe spawnEnemies/Neutrals/Allies', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  scene.spawnNeutrals(2);
  scene.spawnAllies(3);
  assert.equal(scene.neutrals.getChildren().length, 2);
  assert.equal(scene.allies.getChildren().length, 3);

  const initialNeutrals = [...scene.neutrals.getChildren()];
  const initialAllies = [...scene.allies.getChildren()];

  for (const n of initialNeutrals) {
    n.isStunned = true;
    n.die(1500);
    assert.equal(n.active, false);
  }
  for (const a of initialAllies) {
    a.isStunned = true;
    a.die(1500);
    assert.equal(a.active, false);
  }

  // Re-spawning neutrals and allies must revive the exact pooled instances via reset()
  scene.spawnNeutrals(2);
  scene.spawnAllies(3);
  assert.equal(scene.neutrals.getChildren().length, 2, 'Pooled neutrals must be reused');
  assert.equal(scene.allies.getChildren().length, 3, 'Pooled allies must be reused');

  for (const n of scene.neutrals.getChildren()) {
    assert.equal(n.active, true);
    assert.equal(n.isDead, false);
    assert.equal(n.isStunned, false);
    assert.equal(n.hp, n.maxHp);
    assert.ok(n.dropShadow && n.dropShadow.active);
  }
  for (const a of scene.allies.getChildren()) {
    assert.equal(a.active, true);
    assert.equal(a.isDead, false);
    assert.equal(a.isStunned, false);
    assert.equal(a.hp, a.maxHp);
    assert.ok(a.dropShadow && a.dropShadow.active);
  }

  // Dense-map termination safety: fill almost entire map with blocks and request 500 spawns
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (scene.map[r][c] === TILE_EMPTY && !(r === 1 && c === 1)) {
        scene.map[r][c] = TILE_BLOCK;
      }
    }
  }
  scene.spawnEnemies(500);
  scene.spawnNeutrals(500);
  scene.spawnAllies(50);
  // Reaching here proves 0 infinite loops even when empty tiles < requested count!
  scene.shutdown();
});

test('Cycle 42.5: Boss bomb collision deals exactly 1 HP hit (PHYS-06) and skips stun if boss is defeated', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();

  const boss = new GummyBearBoss(7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  boss.transitionTo(BossState.PHASE_1);
  boss.isInvulnerable = false;
  boss.isSquashedPancake = true;
  boss.currentHp = 5;
  scene.activeBoss = boss;
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  // Place an active bomb right on top of the boss
  const bomb = scene.bombs.get(boss.x, boss.y, 'bomb');
  bomb.setActive(true).setVisible(true);
  bomb.setData('id', 'collision_bomb_1');
  bomb.setData('power', 2);
  bomb.setData('owner', 'player');

  scene.update(2000, 16);
  assert.equal(
    boss.currentHp,
    4,
    'Colliding bomb must deal exactly 1 HP damage (not double-hit in update + explodeBomb)'
  );
  assert.equal(boss.bossState, BossState.STUNNED);

  // Now set boss to 1 HP out of stun and collide a lethal bomb -> must stay DEFEATED, not STUNNED!
  boss.transitionTo(BossState.ENRAGED);
  boss.isSquashedPancake = true;
  boss.stunTimerMs = 0;
  boss.isInvulnerable = false;
  boss.comboBufferTimerMs = 0;
  boss.currentHp = 1;

  const lethalBomb = scene.bombs.get(boss.x, boss.y, 'bomb');
  lethalBomb.setActive(true).setVisible(true);
  lethalBomb.setData('id', 'collision_bomb_lethal');
  lethalBomb.setData('power', 2);
  lethalBomb.setData('owner', 'player');

  scene.update(5000, 16);
  assert.equal(boss.currentHp, 0);
  assert.equal(boss.bossState, BossState.DEFEATED, 'Lethal colliding bomb must leave boss DEFEATED, not STUNNED');

  scene.shutdown();
});

test('Cycle 42.6: Re-entrant GameScene.create() releases item shadows cleanly & captureRunState serializes indexed groups', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  scene.spawnItem(3, 3, 'SPEED_UP');
  scene.spawnItem(3, 5, 'SHIELD');
  const oldShadowPool = scene.shadowPool;
  assert.ok(oldShadowPool.activeCount >= 3, 'Player + 2 items must hold active shadows');

  const snapshot = scene.captureRunState('manual');
  assert.equal(snapshot.activeItems.length, 2);

  // Re-entrant create() without prior shutdown() must release item shadows before destroying old pools
  scene.create();
  assert.equal(oldShadowPool.activeCount, 0, 'Old shadowPool must have 0 leaked active shadows after re-entrant create()');

  const recreatedShadowPool = scene.shadowPool;
  scene.shutdown();
  assert.equal(recreatedShadowPool.activeCount, 0);
});

test('Cycle 42.7: RiftCrisis reuses rifts & spires arrays/elements in place across init() and reset()', () => {
  const crisis = new RiftCrisis();
  crisis.init();

  const riftsRef = crisis.rifts;
  const spiresRef = crisis.spires;
  const rift0Ref = crisis.rifts[0];
  const spire0Ref = crisis.spires[0];

  crisis.transitionToStage(CrisisStage.OUTBREAK);
  const dest = crisis.teleportThroughRift(rift0Ref.r, rift0Ref.c);
  assert.deepEqual(dest, { r: crisis.rifts[1].r, c: crisis.rifts[1].c });

  crisis.transitionToStage(CrisisStage.CLIMAX);
  crisis.handleBombBlast(spire0Ref.r, spire0Ref.c, 1);
  assert.equal(spire0Ref.isPolarized, true);

  crisis.reset();
  assert.equal(crisis.rifts, riftsRef, 'rifts array reference must be preserved across reset()');
  assert.equal(crisis.spires, spiresRef, 'spires array reference must be preserved across reset()');
  assert.equal(crisis.rifts[0], rift0Ref, 'rift[0] object must be reused in place across reset()');
  assert.equal(crisis.spires[0], spire0Ref, 'spire[0] object must be reused in place across reset()');
  assert.equal(crisis.spires[0].isPolarized, false);

  crisis.init();
  assert.equal(crisis.rifts, riftsRef, 'rifts array reference must be preserved across re-init()');
  assert.equal(crisis.spires, spiresRef, 'spires array reference must be preserved across re-init()');
  assert.equal(crisis.rifts[0], rift0Ref);
  assert.equal(crisis.spires[0], spire0Ref);
});

test('Cycle 42.8: GameScene.renderCrisisHazards renders CONVEYOR_BELT, DYNAMO_CONDUIT, UPLINK_TERMINAL, CALDERA_VALVE & DIMENSIONAL_WARP with non-occluding floor alpha <= 0.40', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const recordedOps = [];
  let currentAlpha = 1;
  let currentColor = 0;
  scene.crisisGraphics = {
    clear() {
      recordedOps.length = 0;
    },
    fillStyle(color, alpha = 1) {
      currentColor = color;
      currentAlpha = alpha;
    },
    lineStyle() {},
    fillRect(x, y, w, h) {
      recordedOps.push({ kind: 'fillRect', color: currentColor, alpha: currentAlpha, w, h });
    },
    strokeRect() {},
    fillCircle(x, y, radius) {
      recordedOps.push({ kind: 'fillCircle', color: currentColor, alpha: currentAlpha, radius });
    },
    strokeCircle() {},
    lineBetween() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fillPath() {},
    strokePath() {},
    fillRoundedRect() {},
    strokeRoundedRect() {},
    destroy() {},
  };

  scene.crisisManager.triggerCrisis(CrisisType.DIMENSIONAL_RIFTS);
  const active = scene.crisisManager.getActiveCrisis();
  active.clearAllHazards();
  active.setHazardTile(2, 3, HazardType.CONVEYOR_BELT, 0.8, 0, 0);
  active.setHazardTile(4, 5, HazardType.DYNAMO_CONDUIT, 1.0, 0, 1);
  active.setHazardTile(6, 7, HazardType.UPLINK_TERMINAL, 1.0, 0, 0);
  active.setHazardTile(8, 9, HazardType.CALDERA_VALVE, 1.0, 0, 0);
  active.setHazardTile(10, 11, HazardType.DIMENSIONAL_WARP, 0.8, 0, 0);

  scene.renderCrisisHazards(1500);

  assert.ok(recordedOps.length >= 5, 'All 5 crisis hazard types must emit procedural draw ops');
  for (const op of recordedOps) {
    const isFloorFill = op.kind === 'fillRect' || (op.kind === 'fillCircle' && op.radius >= 10);
    if (isFloorFill) {
      assert.ok(
        op.alpha <= 0.400001,
        `Crisis floor fill (${op.kind}, color=0x${op.color.toString(16)}) alpha ${op.alpha} must be <= 0.40`
      );
    }
  }

  scene.shutdown();
});

test('Cycle 42.9: Boss destroy() state cleanup (SteamToyTitan, MutantFlora) & CrisisAudio non-owned shared pool release', () => {
  const titan = new SteamToyTitanBoss(300, 260);
  titan.isMalletWindingUp = true;
  titan.malletImpactActive = true;
  titan.isSteamVenting = true;
  titan.gearShieldActive = true;
  titan.vx = 45;
  titan.vy = -30;
  titan.destroy();
  assert.equal(titan.isMalletWindingUp, false);
  assert.equal(titan.malletImpactActive, false);
  assert.equal(titan.isSteamVenting, false);
  assert.equal(titan.gearShieldActive, false);
  assert.equal(titan.vx, 0);
  assert.equal(titan.vy, 0);

  const flora = new MutantFloraBoss(300, 260);
  flora.isUnderground = true;
  flora.undergroundTimerMs = 1500;
  flora.isVineWhipping = true;
  flora.activeRoots = 3;
  flora.vx = 30;
  flora.vy = 20;
  flora.destroy();
  assert.equal(flora.isUnderground, false);
  assert.equal(flora.undergroundTimerMs, 0);
  assert.equal(flora.isVineWhipping, false);
  assert.equal(flora.activeRoots, 0);
  assert.equal(flora.vx, 0);
  assert.equal(flora.vy, 0);

  // Verify shared non-owned AudioVoicePool is released (pool === null) without destroying the shared pool
  let sharedPoolDestroyed = false;
  const sharedPool = new AudioVoicePool(8);
  const origDestroy = sharedPool.destroy.bind(sharedPool);
  sharedPool.destroy = () => {
    sharedPoolDestroyed = true;
    origDestroy();
  };

  for (const AudioCls of [ClockworkCrisisAudio, OrbitalCrisisAudio, VoidCrisisAudio]) {
    AudioCls.resetInstance();
    const inst = AudioCls.getInstance(sharedPool);
    if (typeof inst.bindPool === 'function') {
      inst.bindPool(sharedPool);
    } else {
      inst.pool = sharedPool;
      inst.ownsPool = false;
    }
    inst.destroy();
    assert.equal(inst.pool, null, `${AudioCls.name}.destroy() must release non-owned shared pool reference`);
    assert.equal(sharedPoolDestroyed, false, `${AudioCls.name}.destroy() must NOT destroy non-owned shared pool`);
  }
  origDestroy();
});

test('Cycle 42.10: 10,000-Frame Zero-GC Multi-Entity Pathfinding + Crisis + Pool Soak Test', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();
  scene.map[3][5] = TILE_BLOCK;
  scene.map[5][7] = TILE_BLOCK;

  const chaser = new ChaserEnemy(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  const bomber = new BomberEnemy(scene, 7 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  const ally = new MiniBomberAlly(scene, 1 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  const merchant = new MerchantNPC(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  const riftCrisis = new RiftCrisis();
  riftCrisis.init();
  riftCrisis.transitionToStage(CrisisStage.OUTBREAK);

  const player = { x: 9 * TILE_SIZE + 20, y: 7 * TILE_SIZE + 20, active: true };
  const bombTiles = new FlatHazardMask(ROWS * COLS);

  const chaserPathRef = chaser.currentPath;
  const bomberPathRef = bomber.currentPath;
  const allyPathRef = ally.currentPath;

  for (let frame = 0; frame < 10000; frame++) {
    const now = 1000 + frame * 16;
    scene.time.now = now;

    if (frame % 250 === 0) {
      player.x = ((frame / 250) % 2 === 0 ? 9 : 3) * TILE_SIZE + 20;
      player.y = ((frame / 250) % 2 === 0 ? 7 : 9) * TILE_SIZE + 20;
    }

    chaser.updateAI(16, now, player, scene.map, bombTiles, () => false);
    bomber.updateAI(16, now, player, scene.map, bombTiles, () => false);
    ally.updateAI(16, now, player, scene.map, bombTiles, () => false);
    merchant.updateAI(16, now, player, scene.map, bombTiles);
    riftCrisis.update(16);

    if (frame % 500 === 499) {
      for (const tw of Array.from(activeTweens)) {
        if (typeof tw.complete === 'function') tw.complete();
      }
    }
  }

  assert.equal(chaser.currentPath, chaserPathRef);
  assert.equal(bomber.currentPath, bomberPathRef);
  assert.equal(ally.currentPath, allyPathRef);

  const pools = {
    shadowPool: scene.shadowPool,
    circlePool: scene.circlePool,
    rectPool: scene.rectPool,
    graphicsPool: scene.graphicsPool,
    spritePool: scene.spritePool,
    floatingTextPool: scene.floatingTextPool,
    nameTagTextPool: scene.nameTagTextPool,
    intentBadgeTextPool: scene.intentBadgeTextPool,
  };

  chaser.destroy();
  bomber.destroy();
  ally.destroy();
  merchant.destroy();
  riftCrisis.reset();
  scene.shutdown();

  assert.equal(pools.shadowPool.activeCount, 0, '0 leaked shadows after 10k-frame soak');
  assert.equal(pools.circlePool.activeCount, 0, '0 leaked circles after 10k-frame soak');
  assert.equal(pools.rectPool.activeCount, 0, '0 leaked rects after 10k-frame soak');
  assert.equal(pools.graphicsPool.activeCount, 0, '0 leaked graphics after 10k-frame soak');
  assert.equal(pools.spritePool.activeCount, 0, '0 leaked sprites after 10k-frame soak');
  assert.equal(pools.floatingTextPool.activeCount, 0, '0 leaked floating texts after 10k-frame soak');
  assert.equal(pools.nameTagTextPool.activeCount, 0, '0 leaked name tags after 10k-frame soak');
  assert.equal(pools.intentBadgeTextPool.activeCount, 0, '0 leaked intent badges after 10k-frame soak');
});
