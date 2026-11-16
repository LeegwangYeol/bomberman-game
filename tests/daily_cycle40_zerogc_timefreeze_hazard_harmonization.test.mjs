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
const { MiniBomberAlly } = await import('../src/game/entities/AllyEntities.ts');
const { ChaserEnemy, BomberEnemy } = await import('../src/game/entities/EnemyEntities.ts');
const { BossHUD } = await import('../src/game/bosses/BossHUD.ts');
const { TelegraphEngine } = await import('../src/game/bosses/TelegraphEngine.ts');
const { MutantFloraBoss } = await import('../src/game/bosses/MutantFloraBoss.ts');
const { HamsterBoss } = await import('../src/game/bosses/HamsterBoss.ts');
const { BossState } = await import('../src/game/bosses/BossTypes.ts');
const { PsychicCrisis } = await import('../src/game/crises/PsychicCrisis.ts');
const { SolarFlareCrisis } = await import('../src/game/crises/SolarFlareCrisis.ts');
const { CrisisType, CrisisStage } = await import('../src/game/crises/CrisisTypes.ts');
const { FrostLifecycleState } = await import('../src/game/hazards/FrostHazard.ts');
const { GravityLifecycleState } = await import('../src/game/hazards/GravityHazard.ts');
const { VoltLifecycleState } = await import('../src/game/hazards/VoltHazard.ts');
const { MagmaLifecycleState } = await import('../src/game/hazards/MagmaHazard.ts');
const { MiasmaLifecycleState } = await import('../src/game/hazards/MiasmaHazard.ts');
const { ChronoLifecycleState } = await import('../src/game/hazards/ChronoHazard.ts');
const { SolarLifecycleState } = await import('../src/game/hazards/SolarHazard.ts');
const { SolarHazardAudio } = await import('../src/game/hazards/SolarHazardAudio.ts');
const { AbyssalHazardAudio } = await import('../src/game/hazards/AbyssalHazardAudio.ts');
const { NebulaHazardAudio } = await import('../src/game/hazards/NebulaHazardAudio.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  FlatHazardMask,
  findCorneringBombTile,
} = await import('../src/game/pathfinding.ts');

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
    get activeSet() {
      return activeTweens;
    },
  };

  let flashCount = 0;
  let graphicsClearCounts = new Map();

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
        graphicsClearCounts.set(this, (graphicsClearCounts.get(this) || 0) + 1);
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
        this.world.isPaused = true;
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
  scene.physics.world.pause = function () {
    this.isPaused = true;
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
      flash: () => {
        flashCount++;
      },
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
    activeTweens,
    getFlashCount: () => flashCount,
    resetFlashCount: () => {
      flashCount = 0;
    },
    getGraphicsClearCount: (g) => graphicsClearCounts.get(g) || 0,
  };
}

function buildOpenArenaMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
        row.push(TILE_WALL);
      } else {
        row.push(TILE_EMPTY);
      }
    }
    map.push(row);
  }
  return map;
}

/* ==============================================================================
 * CYCLE 40 SUITE 1: TIME_FREEZE & CHRONO_FREEZE BOMB LOCKUP REMEDIATION
 * ============================================================================== */

test('Cycle 40 [1/10]: TIME_FREEZE & CHRONO_FREEZE synchronize pause/resume across player, ghost, enemy, and ally bombs without slot lockup', () => {
  const { scene, activeTimers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  scene.maxBombs = 4;
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  // 1. Place bomb BEFORE collecting TIME_FREEZE
  scene.placeBomb();
  const preFreezeBomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(preFreezeBomb, 'Player bomb must be placed');
  assert.equal(preFreezeBomb.getData('fuseTimer').paused, false);
  assert.equal(preFreezeBomb.getData('tweenChain').paused, false);

  // 2. Collect TIME_FREEZE -> existing active bomb must immediately pause
  scene.collectItem('TIME_FREEZE', scene.player.x, scene.player.y);
  assert.equal(scene.isTimeFrozen, true);
  assert.equal(preFreezeBomb.getData('fuseTimer').paused, true, 'Existing bomb fuseTimer must pause on TIME_FREEZE pickup');
  assert.equal(preFreezeBomb.getData('tweenChain').paused, true, 'Existing bomb tweenChain must pause on TIME_FREEZE pickup');

  // 3. Place player bomb, ghost bomb, enemy bomb, and ally bomb DURING TIME_FREEZE
  scene.player.setPosition(2 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  scene.spawnGhostBomb('ghost_tf_1', 'parent_tf_1', 3, 1, 2, 2000);
  const dummyEnemy = { active: true, activeBombs: 1 };
  const dummyAlly = { active: true, activeBombs: 1 };
  assert.equal(scene.placeEnemyBomb(dummyEnemy, 5, 1, 2, 2000), true);
  assert.equal(scene.placeAllyBomb(dummyAlly, 7, 1, 2), true);

  const activeBombsDuringFreeze = scene.bombs.getChildren().filter((b) => b.active);
  assert.equal(activeBombsDuringFreeze.length, 5);
  for (const b of activeBombsDuringFreeze) {
    assert.equal(b.getData('fuseTimer').paused, true, 'Every bomb spawned during time freeze must start paused');
    assert.equal(b.getData('tweenChain').paused, true, 'Every bomb tweenChain spawned during time freeze must start paused');
  }

  // 4. Trigger CHRONO_FREEZE and refresh TIME_FREEZE so TIME_FREEZE outlives CHRONO_FREEZE expiry callback
  scene.ultimateGauge = scene.ultimateMax;
  scene.ultimateLockoutRemaining = 0;
  assert.equal(scene.triggerUltimate('CHRONO_FREEZE'), true);

  const chronoExpireTimer = activeTimers[activeTimers.length - 1];
  assert.ok(chronoExpireTimer && chronoExpireTimer.delayMs === 5000);

  // Refresh TIME_FREEZE to 4000ms right before CHRONO_FREEZE ends -> bombs MUST stay paused!
  scene.collectItem('TIME_FREEZE', scene.player.x, scene.player.y);
  chronoExpireTimer.callback();
  assert.equal(scene.isTimeFrozen, true, 'TIME_FREEZE buff is still active after CHRONO_FREEZE ends');
  for (const b of activeBombsDuringFreeze) {
    assert.equal(b.getData('fuseTimer').paused, true, 'CHRONO_FREEZE expiry must NOT prematurely unpause bombs while TIME_FREEZE is active');
  }

  // 5. Advance scene.update() past 4000ms TIME_FREEZE expiry -> ALL bombs MUST unpause!
  scene.time.now += 4100;
  scene.update(scene.time.now, 4100);
  assert.equal(scene.isTimeFrozen, false);
  for (const b of activeBombsDuringFreeze) {
    assert.equal(b.getData('fuseTimer').paused, false, 'Bombs placed during TIME_FREEZE must unpause on expiry (zero slot lockup)');
    assert.equal(b.getData('tweenChain').paused, false, 'Bomb tweenChains must resume on TIME_FREEZE expiry');
  }

  scene.shutdown();
});

/* ==============================================================================
 * CYCLE 40 SUITE 2: ZERO-GC PATHFINDING & MINIBOMBER ALLY SET ELIMINATION
 * ============================================================================== */

test('Cycle 40 [2/10]: findCorneringBombTile & MiniBomberAlly.updateAI execute 1,000 iterations with 0 Set allocations', () => {
  const map = buildOpenArenaMap();
  const hazardMask = new FlatHazardMask(ROWS * COLS);

  let setAddCalls = 0;
  const origSetAdd = Set.prototype.add;
  Set.prototype.add = function (...args) {
    setAddCalls++;
    return origSetAdd.apply(this, args);
  };

  try {
    // 1. 1,000 calls to findCorneringBombTile in both confined corridor and open pursuit
    for (let i = 0; i < 1000; i++) {
      const trap = findCorneringBombTile({ r: 1, c: 3 }, { r: 1, c: 1 }, map, hazardMask, true, hazardMask);
      assert.ok(trap !== null && trap.r === 1);
    }
    assert.equal(setAddCalls, 0, 'findCorneringBombTile must allocate 0 Set entries across 1,000 calls');

    // 2. MiniBomberAlly standing next to player (friendly-fire blocked) & away from player (safe drop)
    const { scene } = createStatefulGameSceneHarness();
    scene.init();
    scene.create();
    scene.enemies.clear(true, true);
    scene.neutrals.clear(true, true);
    scene.allies.clear(true, true);
    scene.map = map;

    const ally = new MiniBomberAlly(scene, 1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
    ally.bombCooldownTimer = 0;
    const mockPlayerNear = { active: true, x: 2 * TILE_SIZE + 20, y: 1 * TILE_SIZE + 20 };

    setAddCalls = 0;
    let friendlyFireDrops = 0;
    for (let i = 0; i < 500; i++) {
      ally.bombCooldownTimer = 0;
      ally.updateAI(16, 1000 + i * 16, mockPlayerNear, map, hazardMask, () => {
        friendlyFireDrops++;
        return true;
      });
    }
    assert.equal(friendlyFireDrops, 0, 'MiniBomberAlly must never plant bomb when player is in blast cross');
    assert.equal(setAddCalls, 0, 'MiniBomberAlly friendly-fire check must execute with 0 Set allocations');

    // Move player far away -> safe placement succeeds with 0 Set allocations
    const mockPlayerSafe = { active: true, x: 9 * TILE_SIZE + 20, y: 9 * TILE_SIZE + 20 };
    let safeDrops = 0;
    ally.bombCooldownTimer = 0;
    ally.updateAI(16, 20000, mockPlayerSafe, map, hazardMask, () => {
      safeDrops++;
      return true;
    });
    assert.equal(safeDrops, 1, 'MiniBomberAlly must plant bomb when player is safe and escape exists');
    assert.equal(setAddCalls, 0, 'MiniBomberAlly safe escape check must execute with 0 Set allocations');

    ally.destroy();
    scene.shutdown();
  } finally {
    Set.prototype.add = origSetAdd;
  }
});

/* ==============================================================================
 * CYCLE 40 SUITE 3: 6-HAZARD LIVE BOSS STASIS PARITY & SINGLE-HIT GUARD
 * ============================================================================== */

test('Cycle 40 [3/10]: Frost, Volt, Magma, Miasma, Chrono, and Solar hazards stun standalone startBossEncounter bosses without double-hitting', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  const centerX = 7 * TILE_SIZE + 20;
  const centerY = 6 * TILE_SIZE + 20;
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  const hazardConfigs = [
    {
      name: 'FrostHazard',
      setup: () => {
        scene.frostHazard.init(6, 7);
        scene.frostHazard.start('OUTBREAK');
        scene.frostHazard.state = FrostLifecycleState.ABSOLUTE_ZERO_BURST;
        scene.frostHazard.stateTimerMs = 10;
        scene.frostHazard.dangerMask[6 * COLS + 7] = 2;
      },
      cleanup: () => scene.frostHazard.reset(),
    },
    {
      name: 'VoltHazard',
      setup: () => {
        scene.voltHazard.init(6, 7);
        scene.voltHazard.start('OUTBREAK');
        scene.voltHazard.state = VoltLifecycleState.LIGHTNING_DISCHARGE;
        scene.voltHazard.stateTimerMs = 10;
        scene.voltHazard.dangerMask[6 * COLS + 7] = 2;
      },
      cleanup: () => scene.voltHazard.stop(),
    },
    {
      name: 'MagmaHazard',
      setup: () => {
        scene.magmaHazard.init(6, 7);
        scene.magmaHazard.start('OUTBREAK');
        scene.magmaHazard.state = MagmaLifecycleState.PYROCLASTIC_BURST;
        scene.magmaHazard.stateTimerMs = 10;
        scene.magmaHazard.dangerMask[6 * COLS + 7] = 2;
      },
      cleanup: () => scene.magmaHazard.reset(),
    },
    {
      name: 'MiasmaHazard',
      setup: () => {
        scene.miasmaHazard.init(6, 7);
        scene.miasmaHazard.start('OUTBREAK');
        scene.miasmaHazard.state = MiasmaLifecycleState.CORROSIVE_BURST;
        scene.miasmaHazard.stateTimerMs = 10;
        scene.miasmaHazard.dangerMask[6 * COLS + 7] = 2;
      },
      cleanup: () => scene.miasmaHazard.reset(),
    },
    {
      name: 'ChronoHazard',
      setup: () => {
        scene.chronoHazard.init(6, 7);
        scene.chronoHazard.start('OUTBREAK');
        scene.chronoHazard.state = ChronoLifecycleState.TIME_COLLAPSE;
        scene.chronoHazard.stateTimerMs = 10;
        scene.chronoHazard.dangerMask[6 * COLS + 7] = 2;
      },
      cleanup: () => scene.chronoHazard.reset(),
    },
    {
      name: 'SolarHazard',
      setup: () => {
        scene.solarHazard.init(6, 7);
        scene.solarHazard.start('OUTBREAK');
        scene.solarHazard.state = SolarLifecycleState.SUPERHEAT_FLARE;
        scene.solarHazard.stateTimerMs = 10;
        scene.solarHazard.dangerMask[6 * COLS + 7] = 2;
      },
      cleanup: () => scene.solarHazard.reset(),
    },
  ];

  for (let i = 0; i < hazardConfigs.length; i++) {
    const hc = hazardConfigs[i];
    scene.time.now = 10000 + i * 5000;
    scene.startBossEncounter('boss_mutant_flora');
    scene.activeBoss.x = centerX;
    scene.activeBoss.y = centerY;
    scene.activeBoss.update(1600, scene.player.x, scene.player.y); // Finish intro
    const hpBefore = scene.activeBoss.currentHp;
    assert.equal(scene.enemies.getChildren().includes(scene.activeBoss), false);

    hc.setup();
    scene.update(scene.time.now, 16);

    assert.ok(
      scene.activeBoss.currentHp < hpBefore,
      `${hc.name} must deal stasis percentage damage to standalone activeBoss`
    );
    assert.equal(
      scene.activeBoss.bossState,
      BossState.STUNNED,
      `${hc.name} must stun standalone activeBoss`
    );
    hc.cleanup();
    scene.dismissBoss();
  }

  scene.shutdown();
});

/* ==============================================================================
 * CYCLE 40 SUITE 4: GRAVITY & FROST LETHAL PLAYER PARITY + SAME-FRAME FX DEDUP
 * ============================================================================== */

test('Cycle 40 [4/10]: Gravity SINGULARITY_BURST & Frost ABSOLUTE_ZERO_BURST damage player and dash masteries dedup same-frame FX', () => {
  const { scene, getFlashCount, resetFlashCount } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  const centerX = 7 * TILE_SIZE + 20;
  const centerY = 6 * TILE_SIZE + 20;

  // 1. Gravity SINGULARITY_BURST damages non-dashing shielded player (consumes shield)
  scene.player.setPosition(centerX, centerY);
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.isInvulnerable = false;
  scene.gravityHazard.init(6, 7);
  scene.gravityHazard.start('OUTBREAK');
  scene.gravityHazard.update(2000); // Enter SINGULARITY_BURST
  assert.equal(scene.gravityHazard.state, GravityLifecycleState.SINGULARITY_BURST);

  scene.time.now = 5000;
  scene.update(5000, 16);
  assert.equal(scene.hasShield, false, 'Standing in Gravity SINGULARITY_BURST core must hit player and consume shield');
  scene.gravityHazard.reset();

  // 2. Frost ABSOLUTE_ZERO_BURST damages non-dashing shielded player (after cryo-tunneling 150ms window)
  scene.hasShield = true;
  scene.shieldCharges = 1;
  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  scene.frostHazard.init(6, 7);
  scene.frostHazard.start('OUTBREAK');
  scene.frostHazard.update(2200); // Inside ABSOLUTE_ZERO_BURST past 150ms window
  assert.equal(scene.frostHazard.state, FrostLifecycleState.ABSOLUTE_ZERO_BURST);

  scene.time.now = 9000;
  scene.update(9000, 16);
  assert.equal(scene.hasShield, false, 'Standing in Frost ABSOLUTE_ZERO_BURST must hit player and consume shield');
  scene.frostHazard.reset();

  // 3. Same-frame dash mastery FX deduplication across performDash() + updatePlayerMovement()
  scene.isInvulnerable = false;
  scene.shieldInvulnerableUntil = 0;
  scene.dashCooldownRemaining = 0;
  scene.magmaHazard.init(6, 7);
  scene.magmaHazard.start('OUTBREAK');
  scene.magmaHazard.dangerMask[6 * COLS + 7] = 1;

  resetFlashCount();
  globalThis.window.mobileInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    bomb: false,
    dash: true,
    ultimate: false,
  };
  scene.time.now = 15000;
  scene.update(15000, 16);
  assert.equal(scene.hasBuff('MAGMA_SURF'), true);
  assert.equal(
    getFlashCount(),
    1,
    'Dashing on molten tile in update() must flash camera once (no duplicate performDash + updatePlayerMovement FX)'
  );

  // 4. Newly wired Chrono/Solar/Nebula/Abyssal dash hooks in performDash()
  scene.magmaHazard.reset();
  scene.isDashing = false;
  scene.isInvulnerable = false;
  scene.dashCooldownRemaining = 0;
  scene.chronoHazard.init(6, 7);
  scene.chronoHazard.start('OUTBREAK');
  scene.chronoHazard.dangerMask[6 * COLS + 7] = 1;
  scene.performDash();
  assert.equal(scene.hasBuff('CHRONO_SURGE'), true, 'performDash() must directly grant Chrono Surge on dilation tile');

  globalThis.window.mobileInput.dash = false;
  scene.shutdown();
});

/* ==============================================================================
 * CYCLE 40 SUITE 5: TELEGRAPH ENGINE ZERO-GC CONNECTED ESCAPE & TRIMMING
 * ============================================================================== */

test('Cycle 40 [5/10]: TelegraphEngine validateConnectedEscape and registerAttack budget trimming maintain invariants', () => {
  const engine = new TelegraphEngine();

  // Propose every walkable tile in arena (> 60% budget) -> registerAttack trims to budget cleanly
  const allTiles = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    allTiles.push(i);
  }

  for (let cycle = 0; cycle < 500; cycle++) {
    const res = engine.registerAttack(0, allTiles, 2000, true);
    assert.equal(res.success, true);
    assert.ok(engine.getSafeWalkableRatio() >= 0.4 - 1e-6, 'Safe walkable ratio >= 40% invariant must hold');
    assert.equal(typeof engine.validateConnectedEscape([16, 17, 18]), 'boolean');
    engine.reset();
  }
  assert.equal(engine.activeCount, 0);
});

/* ==============================================================================
 * CYCLE 40 SUITE 6: BOSSHUD 20HZ THROTTLE ENFORCEMENT UNDER 60HZ ENRAGE STREAM
 * ============================================================================== */

test('Cycle 40 [6/10]: BossHUD throttles 60Hz setEnrageGauge updates to 50ms intervals while forcing immediate enrage at 100%', () => {
  const emitter = new EventEmitter();
  let emitCount = 0;
  emitter.on('boss-hud-update', () => {
    emitCount++;
  });

  const realNow = Date.now;
  let fakeNow = 10000;
  Date.now = () => fakeNow;

  try {
    const hud = new BossHUD({ events: emitter });
    hud.initBoss('king_gummy_bear', 9);
    assert.equal(emitCount, 1, 'initBoss emits immediately');

    // Simulate three 16ms frames within 48ms (< 50ms emitIntervalMs)
    for (let f = 1; f <= 3; f++) {
      fakeNow = 10000 + f * 16; // 10016, 10032, 10048
      hud.update(16);
      hud.setEnrageGauge(f * 0.5);
    }
    assert.equal(emitCount, 1, 'Sub-50ms setEnrageGauge updates must be throttled without spamming clones');

    // Frame 4 at +64ms (>= 50ms) flushes throttled dirty state
    fakeNow = 10064;
    hud.update(16);
    assert.equal(emitCount, 2, 'Dirty HUD state flushes cleanly once 50ms throttle window elapses');

    // Hitting 100% enrage immediately forces critical state emission even within 5ms
    fakeNow = 10069;
    hud.setEnrageGauge(100);
    assert.equal(hud.getState().isEnraged, true);
    assert.equal(hud.getState().state, BossState.ENRAGED);
    assert.equal(emitCount, 3, '100% Berserk Enrage transition must emit immediately with force=true');
  } finally {
    Date.now = realNow;
  }
});

/* ==============================================================================
 * CYCLE 40 SUITE 7: ULTIMATE SKILL ISGAMEOVER ABORT & PHYSICS PAUSE INVARIANT
 * ============================================================================== */

test('Cycle 40 [7/10]: SuperNova and MeteorStrike abort safely on isGameOver without unpausing death physics or leaking pools', () => {
  const { scene, activeTimers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);

  // Place a destructible block right next to player
  scene.map[1][2] = TILE_BLOCK;
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  // Trigger SUPER_NOVA (schedules 60ms hit-stop resume + 300ms wavefront)
  scene.ultimateGauge = scene.ultimateMax;
  scene.ultimateLockoutRemaining = 0;
  assert.equal(scene.triggerUltimate('SUPER_NOVA'), true);
  assert.equal(scene.physics.world.isPaused, true);

  // Player dies at 20ms (no shield / extra lives -> isGameOver = true, physics must remain paused!)
  scene.hasShield = false;
  scene.shieldCharges = 0;
  scene.extraLives = 0;
  scene.isInvulnerable = false;
  scene.playerDie();
  assert.equal(scene.isGameOver, true);
  assert.equal(scene.physics.world.isPaused, true);

  // Fire all SUPER_NOVA timers (excluding the 1000ms scene.restart timer)
  for (const t of [...activeTimers]) {
    if (t.delayMs < 900 && !t.removed) {
      t.callback();
    }
  }
  assert.equal(scene.physics.world.isPaused, true, 'SuperNova hit-stop callback must NOT unpause physics after playerDie');
  assert.equal(scene.map[1][2], TILE_BLOCK, 'SuperNova wavefront must NOT destroy blocks after isGameOver');

  // Reset game-over state and trigger METEOR_STRIKE, then set isGameOver before meteor timers fire
  activeTimers.length = 0;
  scene.isGameOver = false;
  scene.ultimateGauge = scene.ultimateMax;
  scene.ultimateLockoutRemaining = 0;
  assert.equal(scene.triggerUltimate('METEOR_STRIKE'), true);
  scene.isGameOver = true;

  for (const t of [...activeTimers]) {
    if (!t.removed) t.callback();
  }
  assert.equal(scene.graphicsPool.activeCount, 0, 'Aborted MeteorStrike must leave 0 leaked graphicsPool objects');
  assert.equal(scene.circlePool.activeCount, 0, 'Aborted MeteorStrike must leave 0 leaked circlePool objects');

  scene.shutdown();
});

/* ==============================================================================
 * CYCLE 40 SUITE 8: RESUME MAP IDENTITY, GENERATEMAP RE-ENTRY & CRISIS CLEAR
 * ============================================================================== */

test('Cycle 40 [8/10]: onResumeRunState preserves scene.map reference identity, generateMap is re-entrant safe, and inactive crisis clears graphics once', () => {
  const { scene, gameEmitter, getGraphicsClearCount } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const initialMapRef = scene.map;
  const saved = scene.captureRunState('manual');
  saved.board.map[1][2] = TILE_BLOCK;

  gameEmitter.emit('resume-run-state', saved);
  assert.equal(scene.map, initialMapRef, 'onResumeRunState must mutate scene.map in-place so subsystem references stay live');
  assert.equal(scene.map[1][2], TILE_BLOCK);

  // Re-invoking generateMap() must dispose prior graphics/HUDs and keep rectPool accounting exact
  const oldCrisisGraphics = scene.crisisGraphics;
  const oldBossGraphics = scene.bossGraphics;
  scene.generateMap();
  assert.equal(oldCrisisGraphics.destroyed, true, 'Prior crisisGraphics must be destroyed on generateMap re-entry');
  assert.equal(oldBossGraphics.destroyed, true, 'Prior bossGraphics must be destroyed on generateMap re-entry');
  assert.equal(scene.rectPool.verifyInvariants(), true, 'rectPool invariants must hold across generateMap re-entry');

  // Crisis ghost graphics cleanup when crisis stops externally via crisisManager.stopCrisis('reset')
  scene.startCrisisMode(CrisisType.PASTEL_VOID);
  scene.time.now = 2000;
  scene.update(2000, 16);
  const clearsWhileActive = getGraphicsClearCount(scene.crisisGraphics);
  assert.ok(clearsWhileActive >= 1);

  scene.crisisManager.stopCrisis('reset');
  scene.update(2016, 16);
  const clearsAfterStop = getGraphicsClearCount(scene.crisisGraphics);
  assert.equal(clearsAfterStop, clearsWhileActive + 1, 'First frame after external crisis stop must clear ghost crisisGraphics');

  scene.update(2032, 16);
  assert.equal(getGraphicsClearCount(scene.crisisGraphics), clearsAfterStop, 'Idle frames must not redundantly clear crisisGraphics');

  scene.shutdown();
});

/* ==============================================================================
 * CYCLE 40 SUITE 9: STATIC AUDIO BUFFER TEARDOWN & CRISIS ZERO-GC INVARIANTS
 * ============================================================================== */

test('Cycle 40 [9/10]: Static HazardAudio resetInstance clears sharedNoiseBuffer when instance is null, and Crisis helpers preserve reference identity', () => {
  const fakeBuffer = { sampleRate: 44100, length: 22050 };

  // Populate static sharedNoiseBuffer WITHOUT calling getInstance() (instance === null)
  SolarHazardAudio.resetInstance();
  AbyssalHazardAudio.resetInstance();
  NebulaHazardAudio.resetInstance();

  SolarHazardAudio.sharedNoiseBuffer = fakeBuffer;
  AbyssalHazardAudio.sharedNoiseBuffer = fakeBuffer;
  NebulaHazardAudio.sharedNoiseBuffer = fakeBuffer;

  SolarHazardAudio.resetInstance();
  AbyssalHazardAudio.resetInstance();
  NebulaHazardAudio.resetInstance();

  assert.equal(SolarHazardAudio.sharedNoiseBuffer, null, 'SolarHazardAudio.resetInstance must clear static sharedNoiseBuffer even when instance is null');
  assert.equal(AbyssalHazardAudio.sharedNoiseBuffer, null, 'AbyssalHazardAudio.resetInstance must clear static sharedNoiseBuffer even when instance is null');
  assert.equal(NebulaHazardAudio.sharedNoiseBuffer, null, 'NebulaHazardAudio.resetInstance must clear static sharedNoiseBuffer even when instance is null');

  // PsychicCrisis frozen singleton dispel result identity
  const psychic = new PsychicCrisis();
  psychic.start();
  psychic.setStage(CrisisStage.OUTBREAK);
  const miss1 = psychic.dispelPsionicIllusion(1, 1);
  const miss2 = psychic.dispelPsionicIllusion(1, 2);
  assert.equal(miss1, miss2, 'PsychicCrisis.dispelPsionicIllusion false results must share frozen singleton');

  // SolarFlareCrisis pillar shelter check & in-place vents reset reuse
  const solar = new SolarFlareCrisis();
  solar.start();
  assert.equal(solar.isTileShelteredFromFlare(2, 2), true, 'Pillar tile itself is sheltered');
  assert.equal(solar.isTileShelteredFromFlare(2, 3), true, 'Tile orthogonally adjacent to (2,2) pillar is sheltered');
  assert.equal(solar.isTileShelteredFromFlare(1, 1), false, 'Corner (1,1) with no adjacent inner pillar is exposed');
  const ventsRefBefore = solar.vents;
  const firstVentObjBefore = solar.vents[0];
  solar.vents[0].isCooled = true;
  solar.reset();
  assert.equal(solar.vents, ventsRefBefore, 'SolarFlareCrisis.reset() must reuse vents array in-place');
  assert.equal(solar.vents[0], firstVentObjBefore, 'SolarFlareCrisis.reset() must reuse vent element objects in-place');
  assert.equal(solar.vents[0].isCooled, false);

  // HamsterBoss in-place dashDirection vector identity
  const hamster = new HamsterBoss(300, 260);
  const dirRef = hamster.dashDirection;
  hamster.startDashWindup(-50, 10);
  assert.equal(hamster.dashDirection, dirRef, 'HamsterBoss.startDashWindup must mutate dashDirection in-place');
  hamster.startDash({ x: 0, y: 1 });
  assert.equal(hamster.dashDirection, dirRef, 'HamsterBoss.startDash must mutate dashDirection in-place');
  hamster.onWallImpact();
  assert.equal(hamster.dashDirection, dirRef, 'HamsterBoss.onWallImpact must mutate dashDirection in-place');
  hamster.destroy();
});

/* ==============================================================================
 * CYCLE 40 SUITE 10: 10,000-FRAME FULL-SUBSYSTEM ZERO-GC SOAK TEST
 * ============================================================================== */

test('Cycle 40 [10/10]: 10,000-Frame Zero-GC Soak across Enemies, MiniBomberAlly, BossHUD, TelegraphEngine, SolarFlareCrisis & Hazards', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.enemies.clear(true, true);
  scene.neutrals.clear(true, true);
  scene.allies.clear(true, true);
  scene.map = buildOpenArenaMap();

  const chaser = new ChaserEnemy(scene, 5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  const bomber = new BomberEnemy(scene, 9 * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  const ally = new MiniBomberAlly(scene, 3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  scene.enemies.add(chaser);
  scene.enemies.add(bomber);
  scene.allies.add(ally);

  const boss = new MutantFloraBoss(300, 260);
  boss.update(1600, 60, 60);
  scene.activeBoss = boss;
  scene.bossHUD.initBoss('boss_mutant_flora', boss.maxHp);
  scene.startCrisisMode(CrisisType.SOLAR_FLARES);
  scene.frostHazard.init(6, 7);
  scene.frostHazard.start('OUTBREAK');

  // Warmup 300 frames
  const soakAttackTiles = [31, 32, 33, 46, 47];
  for (let f = 0; f < 300; f++) {
    scene.time.now += 16.6;
    scene.update(scene.time.now, 16.6);
  }

  const activeCrisis = scene.crisisManager.getActiveCrisis();
  const ventsBeforeSoak = activeCrisis.vents;

  const OriginalSet = globalThis.Set;
  let setAllocationsDuringSoak = 0;
  globalThis.Set = function PatchedSoakSet(...args) {
    setAllocationsDuringSoak++;
    return new OriginalSet(...args);
  };
  Object.setPrototypeOf(globalThis.Set, OriginalSet);
  globalThis.Set.prototype = OriginalSet.prototype;

  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  try {
    for (let f = 0; f < 10000; f++) {
      scene.time.now += 16.6;
      // Keep player immune to accidental random enemy contact during 10k AI/HUD/Crisis soak
      scene.isInvulnerable = true;
      scene.shieldInvulnerableUntil = scene.time.now + 5000;
      scene.player.x = (1 + ((f >> 5) % 3)) * TILE_SIZE + 20;
      scene.player.y = 1 * TILE_SIZE + 20;

      if (f % 250 === 0) {
        scene.telegraphEngine.registerAttack(0, soakAttackTiles, 1200, true);
      }

      scene.update(scene.time.now, 16.6);

      if (f % 2000 === 0) {
        assert.equal(Number.isFinite(chaser.x) && Number.isFinite(chaser.y), true);
        assert.equal(Number.isFinite(bomber.x) && Number.isFinite(bomber.y), true);
        assert.equal(Number.isFinite(ally.x) && Number.isFinite(ally.y), true);
        assert.equal(scene.circlePool.verifyInvariants(), true);
        assert.equal(scene.rectPool.verifyInvariants(), true);
        assert.equal(scene.graphicsPool.verifyInvariants(), true);
      }
    }
  } finally {
    globalThis.Set = OriginalSet;
  }

  assert.equal(
    setAllocationsDuringSoak,
    0,
    `Expected 0 Set allocations across 10,000 full GameScene frames, got ${setAllocationsDuringSoak}`
  );
  assert.equal(activeCrisis.vents, ventsBeforeSoak, 'SolarFlareCrisis vents array reference must remain stable across 10,000 frames');

  if (global.gc) global.gc();
  const heapAfter = process.memoryUsage().heapUsed;
  const driftMb = (heapAfter - heapBefore) / (1024 * 1024);
  const maxAllowedMb = typeof global.gc === 'function' ? 4 : 32;
  assert.ok(
    driftMb < maxAllowedMb,
    `10,000-frame multi-subsystem soak heap drift must stay < ${maxAllowedMb} MB (got ${driftMb.toFixed(2)} MB)`
  );

  scene.shutdown();
});
