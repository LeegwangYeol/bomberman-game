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
const { BaseEntity } = await import('../src/game/entities/BaseEntity.ts');
const { TankEnemy } = await import('../src/game/entities/EnemyEntities.ts');
const { ShieldGuardAlly } = await import('../src/game/entities/AllyEntities.ts');
const { MerchantNPC } = await import('../src/game/entities/NeutralEntities.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
} = await import('../src/game/pathfinding.ts');
const { BossAttackManager } = await import('../src/game/bosses/BossAttackManager.ts');
const { BossProjectileType, BossState } = await import('../src/game/bosses/BossTypes.ts');
const { MutantFloraBoss } = await import('../src/game/bosses/MutantFloraBoss.ts');
const { SteamToyTitanBoss } = await import('../src/game/bosses/SteamToyTitanBoss.ts');
const { BossHUD } = await import('../src/game/bosses/BossHUD.ts');
const { CrisisManager } = await import('../src/game/crises/CrisisManager.ts');
const { PsychicCrisis } = await import('../src/game/crises/PsychicCrisis.ts');
const { CrisisType, CrisisStage } = await import('../src/game/crises/CrisisTypes.ts');
const { OverheadUIManager } = await import('../src/game/ui/OverheadUIManager.ts');
const { FloatingTextManager } = await import('../src/game/ui/FloatingTextManager.ts');
const { FrostLifecycleState } = await import('../src/game/hazards/FrostHazard.ts');
const { GravityLifecycleState } = await import('../src/game/hazards/GravityHazard.ts');
const { VoltLifecycleState } = await import('../src/game/hazards/VoltHazard.ts');
const { MagmaLifecycleState } = await import('../src/game/hazards/MagmaHazard.ts');
const { MiasmaLifecycleState } = await import('../src/game/hazards/MiasmaHazard.ts');
const { ChronoLifecycleState } = await import('../src/game/hazards/ChronoHazard.ts');
const { SolarLifecycleState } = await import('../src/game/hazards/SolarHazard.ts');
const { NebulaLifecycleState } = await import('../src/game/hazards/NebulaHazard.ts');
const { AbyssalLifecycleState } = await import('../src/game/hazards/AbyssalHazard.ts');

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
      setFillStyle(color) {
        if (typeof color === 'number') this.fillColor = color;
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
  };
}

test('Cycle 44.1: BossAttackManager & MutantFloraBoss execute Zero-GC indexed iteration without forEachActive closures and reset all pool fields cleanly', () => {
  const bam = new BossAttackManager();

  // Spy on forEachActive to prove zero closure iteration during 60 FPS update()
  let forEachActiveCalls = 0;
  for (const pool of [bam.projectilePool, bam.shockwavePool, bam.telegraphPool]) {
    const orig = pool.forEachActive.bind(pool);
    pool.forEachActive = (cb) => {
      forEachActiveCalls++;
      return orig(cb);
    };
  }

  // Mutate fields on acquired objects, release, and re-acquire to verify complete reset
  const proj = bam.spawnProjectile(BossProjectileType.GATLING_SEED, 100, 100, 50, 0, 12, 500);
  proj.damage = 7;
  proj.homing = true;
  proj.targetX = 444;
  proj.targetY = 333;
  bam.projectilePool.release(proj);
  const projReused = bam.projectilePool.acquire();
  assert.equal(projReused.damage, 1, 'Projectile reset must restore default damage');
  assert.equal(projReused.targetX, 0, 'Projectile reset must clear targetX');
  assert.equal(projReused.targetY, 0, 'Projectile reset must clear targetY');
  assert.equal(projReused.radius, 6, 'Projectile reset must restore default radius');
  bam.projectilePool.release(projReused);

  const sw = bam.spawnShockwave(200, 200, 300, 400);
  sw.damage = 9;
  bam.shockwavePool.release(sw);
  const swReused = bam.shockwavePool.acquire();
  assert.equal(swReused.damage, 1, 'Shockwave reset must restore default damage');
  assert.equal(swReused.maxRadius, 160, 'Shockwave reset must restore default maxRadius');
  bam.shockwavePool.release(swReused);

  const minion = bam.spawnMinion('WORKER_BEE', 150, 160, 45, -35);
  minion.maxHp = 5;
  minion.state = 3;
  bam.minionPool.release(minion);
  const minionReused = bam.minionPool.acquire();
  assert.equal(minionReused.vx, 0, 'Minion reset must clear vx');
  assert.equal(minionReused.vy, 0, 'Minion reset must clear vy');
  assert.equal(minionReused.maxHp, 1, 'Minion reset must restore default maxHp');
  assert.equal(minionReused.state, 0, 'Minion reset must restore default state');
  bam.minionPool.release(minionReused);

  // Spawn mixed expiring and surviving projectiles/shockwaves/telegraphs to test mid-loop swap-and-pop safety
  bam.spawnProjectile(BossProjectileType.GATLING_SEED, 200, 200, 0, 0, 6, 10);
  bam.spawnProjectile(BossProjectileType.GATLING_SEED, 240, 200, 10, 0, 6, 1000);
  bam.spawnProjectile(BossProjectileType.GATLING_SEED, 280, 200, 0, 0, 6, 10);
  bam.spawnShockwave(200, 200, 20, 2000);
  bam.spawnShockwave(200, 200, 300, 100);
  bam.addTelegraphTile(3, 3, 10);
  bam.addTelegraphTile(5, 5, 1000);

  let hits = 0;
  bam.update(16, 200, 200, (dmg) => {
    hits += dmg;
  });

  assert.equal(forEachActiveCalls, 0, 'BossAttackManager.update() must not allocate forEachActive closures');
  assert.equal(bam.projectilePool.activeCount, 1, 'Expiring/colliding projectiles must release cleanly without skipping neighbors');
  assert.equal(bam.shockwavePool.activeCount, 1, 'Completed shockwaves must release cleanly');
  assert.equal(bam.telegraphPool.activeCount, 1, 'Expired telegraphs must release cleanly');
  assert.ok(hits >= 1);
  assert.equal(bam.projectilePool.verifyInvariants(), true);
  assert.equal(bam.shockwavePool.verifyInvariants(), true);
  assert.equal(bam.telegraphPool.verifyInvariants(), true);

  // Verify MutantFloraBoss rootPool zero-closure update & cleanseRootsAt
  const flora = new MutantFloraBoss(300, 260, bam);
  let floraForEachCalls = 0;
  const origRootForEach = flora.rootPool.forEachActive.bind(flora.rootPool);
  flora.rootPool.forEachActive = (cb) => {
    floraForEachCalls++;
    return origRootForEach(cb);
  };
  flora.update(2100, 220, 220); // Exit 2000ms INTRO -> PHASE_1
  flora.spawnSubterraneanRoot(140, 140);
  flora.spawnSubterraneanRoot(220, 220);
  flora.update(100, 220, 220);
  const cleansed = flora.cleanseRootsAt(Math.floor(140 / TILE_SIZE), Math.floor(140 / TILE_SIZE), 1);
  assert.ok(cleansed >= 1);
  assert.equal(floraForEachCalls, 0, 'MutantFloraBoss root updates and cleansing must not use forEachActive closures');
  assert.equal(flora.rootPool.verifyInvariants(), true);

  flora.destroy();
  bam.destroy();
});

test('Cycle 44.2: SteamToyTitanBoss INTERMISSION stun immunity preserves gearShieldActive, cancels steam venting on stun/intermission, and BossHUD scales multi-phase segments', () => {
  const titan = new SteamToyTitanBoss(300, 260);
  titan.update(2100, 100, 100); // Finish INTRO -> PHASE_1
  assert.equal(titan.bossState, BossState.PHASE_1);

  // Trigger steam venting in PHASE_1, then applyStun -> steam venting must cancel immediately
  titan.isSteamVenting = true;
  titan.steamVentDurationTimerMs = 900;
  titan.applyStun(1.5);
  assert.equal(titan.bossState, BossState.STUNNED);
  assert.equal(titan.isSteamVenting, false, 'Stun must cancel active steam venting');
  assert.equal(titan.steamVentDurationTimerMs, 0);

  // Recover from stun and transition into INTERMISSION with gearShieldActive = true
  titan.update(1600, 100, 100);
  titan.phase = 2;
  titan.gearShieldActive = true;
  titan.isSteamVenting = true;
  titan.steamVentDurationTimerMs = 800;
  titan.transitionTo(BossState.INTERMISSION);
  assert.equal(titan.isSteamVenting, false, 'Entering INTERMISSION must cancel active steam venting');

  // Attempt applyStun during INTERMISSION -> cutscene immunity must preserve gearShieldActive!
  titan.gearShieldActive = true;
  titan.applyStun(2.0);
  assert.equal(titan.bossState, BossState.INTERMISSION);
  assert.equal(titan.gearShieldActive, true, 'Rejected stun during INTERMISSION must NOT strip gearShieldActive');
  titan.destroy();

  // BossHUD scaled startingHp proportional phase segment invariant
  const hud = new BossHUD(null);
  hud.initBoss('king_gummy_bear', 18); // Default is [3, 3, 3] = 9; scaled 2x = 18
  const scaledState = hud.getState();
  assert.deepEqual(scaledState.phaseHpSegments, [6, 6, 6]);
  assert.equal(
    scaledState.phaseHpSegments.reduce((a, b) => a + b, 0),
    18,
    'Scaled phaseHpSegments must sum to startingHp'
  );
  assert.equal(scaledState.activeSegmentIndex, 2);
  assert.equal(scaledState.activeSegmentHp, 6);
  assert.equal(scaledState.activeSegmentMaxHp, 6);

  hud.setHp(11);
  const midState = hud.getState();
  assert.equal(midState.activeSegmentIndex, 1);
  assert.equal(midState.activeSegmentHp, 5);
  assert.equal(midState.activeSegmentMaxHp, 6);
  hud.destroy();
});

test('Cycle 44.3: PsychicCrisis extraState round-trip preserves destroyed manifestations & pool identity, BaseCrisis updates cachedSummary, and CrisisManager suppresses spurious stage events', () => {
  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.PSYCHIC_INVASION);

  const psychic = cm.getActiveCrisis();
  assert.ok(psychic instanceof PsychicCrisis);
  const initialPoolRef = psychic.manifestations;

  psychic.transitionToStage(CrisisStage.OUTBREAK);
  psychic.phantomTimerMs = 3250;
  psychic.pulseTimerMs = 2750;

  // Dispel first manifestation at (3, 3)
  const firstPos = PsychicCrisis.MANIFESTATION_POSITIONS[0];
  assert.equal(psychic.dispelIllusionAt(firstPos.r, firstPos.c), true);
  assert.equal(psychic.manifestations[0].isDestroyed, true);
  assert.equal(psychic.manifestations[1].isDestroyed, false);

  const snapshot = cm.serialize();
  assert.ok(snapshot);
  assert.ok(snapshot.extraState);

  // Restore into a brand-new CrisisManager and listen for spurious events on next tick
  const restoredCm = new CrisisManager();
  const stageEvents = [];
  const failedEvents = [];
  restoredCm.on('crisis-stage-changed', (payload) => stageEvents.push(payload));
  restoredCm.on('crisis-failed', (payload) => failedEvents.push(payload));

  assert.equal(restoredCm.deserialize(snapshot), true);
  const restoredPsychic = restoredCm.getActiveCrisis();
  assert.ok(restoredPsychic instanceof PsychicCrisis);
  const restoredPoolRef = restoredPsychic.manifestations;

  // Verify BaseCrisis cachedSummary reflects restored stage instead of "(inactive)"
  assert.equal(
    restoredPsychic.getStatus().summary,
    `${restoredPsychic.name} (${CrisisStage.OUTBREAK})`,
    'Deserialized BaseCrisis must update cachedSummary to match restored stage'
  );
  assert.equal(restoredPsychic.phantomTimerMs, 3250);
  assert.equal(restoredPsychic.pulseTimerMs, 2750);
  assert.equal(restoredPsychic.manifestations[0].isDestroyed, true, 'Destroyed manifestation must stay destroyed after deserialize');
  assert.equal(restoredPsychic.manifestations[1].isDestroyed, false);
  assert.equal(restoredPsychic.manifestations, restoredPoolRef, 'Manifestation pool reference must remain intact');

  // Tick 16ms -> must NOT emit spurious crisis-stage-changed from INACTIVE -> OUTBREAK
  restoredCm.update(16, { r: 1, c: 1 });
  assert.equal(stageEvents.length, 0, 'First update after deserialize must not emit spurious crisis-stage-changed');

  // Trigger spawnDisruptionZones -> destroyed manifestation[0] must NOT re-seed its manifestation marker
  restoredPsychic.spawnDisruptionZones();
  assert.equal(
    restoredPsychic.getHazardAt(firstPos.r, firstPos.c),
    null,
    'Destroyed manifestation must not respawn hazard marker after resume'
  );

  // Verify FAILED crisis deserialization does not re-emit crisis-failed on subsequent ticks
  const failedSnapshot = {
    ...snapshot,
    stage: CrisisStage.FAILED,
    isDefeated: true,
    isVictorious: false,
  };
  assert.equal(restoredCm.deserialize(failedSnapshot), true);
  restoredCm.update(16, { r: 1, c: 1 });
  assert.equal(failedEvents.length, 0, 'Already-failed deserialized crisis must not re-emit crisis-failed');

  // Also verify original instance reset preserves manifestationPool identity
  psychic.reset();
  assert.equal(psychic.manifestations, initialPoolRef);
});

test('Cycle 44.4: All 9 environmental burst hazards vaporize i-framed BaseEntity minions on frame 1 with zero multi-frame score/ult/floating-text farming', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();

  let statsEmissions = 0;
  gameEmitter.on('stats-update', () => {
    statsEmissions++;
  });

  const centerCol = 7;
  const centerRow = 6;
  const centerX = centerCol * TILE_SIZE + TILE_SIZE / 2;
  const centerY = centerRow * TILE_SIZE + TILE_SIZE / 2;
  // Keep player safely away from center hazard bursts
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.player.body.reset(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);

  const hazardConfigs = [
    {
      name: 'FrostHazard',
      activate: () => {
        scene.frostHazard.init(centerRow, centerCol);
        scene.frostHazard.start('NORMAL');
        scene.frostHazard.update(2010);
        assert.equal(scene.frostHazard.state, FrostLifecycleState.ABSOLUTE_ZERO_BURST);
      },
      deactivate: () => scene.frostHazard.stop(),
    },
    {
      name: 'GravityHazard',
      activate: () => {
        scene.gravityHazard.init(centerRow, centerCol);
        scene.gravityHazard.start();
        scene.gravityHazard.update(2010);
        assert.equal(scene.gravityHazard.state, GravityLifecycleState.SINGULARITY_BURST);
      },
      deactivate: () => scene.gravityHazard.stop(),
    },
    {
      name: 'VoltHazard',
      activate: () => {
        scene.voltHazard.init(centerRow, centerCol);
        scene.voltHazard.start('NORMAL');
        scene.voltHazard.update(2010);
        assert.equal(scene.voltHazard.state, VoltLifecycleState.LIGHTNING_DISCHARGE);
      },
      deactivate: () => scene.voltHazard.stop(),
    },
    {
      name: 'MagmaHazard',
      activate: () => {
        scene.magmaHazard.init(centerRow, centerCol);
        scene.magmaHazard.start('NORMAL');
        scene.magmaHazard.update(2010);
        assert.equal(scene.magmaHazard.state, MagmaLifecycleState.PYROCLASTIC_BURST);
      },
      deactivate: () => scene.magmaHazard.stop(),
    },
    {
      name: 'MiasmaHazard',
      activate: () => {
        scene.miasmaHazard.init(centerRow, centerCol);
        scene.miasmaHazard.start('NORMAL');
        scene.miasmaHazard.update(2010);
        assert.equal(scene.miasmaHazard.state, MiasmaLifecycleState.CORROSIVE_BURST);
      },
      deactivate: () => scene.miasmaHazard.stop(),
    },
    {
      name: 'ChronoHazard',
      activate: () => {
        scene.chronoHazard.init(centerRow, centerCol);
        scene.chronoHazard.start('NORMAL');
        scene.chronoHazard.update(2010);
        assert.equal(scene.chronoHazard.state, ChronoLifecycleState.TIME_COLLAPSE);
      },
      deactivate: () => scene.chronoHazard.stop(),
    },
    {
      name: 'SolarHazard',
      activate: () => {
        scene.solarHazard.init(centerRow, centerCol);
        scene.solarHazard.start('NORMAL');
        scene.solarHazard.update(2010);
        assert.equal(scene.solarHazard.state, SolarLifecycleState.SUPERHEAT_FLARE);
      },
      deactivate: () => scene.solarHazard.stop(),
    },
    {
      name: 'NebulaHazard',
      activate: () => {
        scene.nebulaHazard.init(centerRow, centerCol);
        scene.nebulaHazard.start('NORMAL');
        scene.nebulaHazard.update(2010);
        assert.equal(scene.nebulaHazard.state, NebulaLifecycleState.ECLIPSE_COLLAPSE);
      },
      deactivate: () => scene.nebulaHazard.stop(),
    },
    {
      name: 'AbyssalHazard',
      activate: () => {
        scene.abyssalHazard.init(centerRow, centerCol);
        scene.abyssalHazard.start('NORMAL');
        scene.abyssalHazard.update(2010);
        assert.equal(scene.abyssalHazard.state, AbyssalLifecycleState.ABYSSAL_MAELSTROM);
      },
      deactivate: () => scene.abyssalHazard.stop(),
    },
  ];

  for (const cfg of hazardConfigs) {
    scene.enemies.clear(true, true);
    scene.floatingTextManager.reset();
    scene.score = 0;
    scene.ultimateGauge = 0;
    scene.ultimateLockoutRemaining = 0;

    // Spawn a 3-HP TankEnemy with active i-frames (invulnerableTimer = 1200ms) right on the burst center
    const tank = new TankEnemy(scene, centerX, centerY);
    scene.enemies.add(tank);
    tank.invulnerableTimer = 1200;

    const beforeEmissions = statsEmissions;
    cfg.activate();

    // Frame 1: TankEnemy must be immediately vaporized despite invulnerableTimer > 0
    scene.time.now += 16;
    scene.update(scene.time.now, 16);

    assert.equal(tank.isDead, true, `${cfg.name} must immediately kill i-framed minion on burst frame 1`);
    assert.ok(scene.score > 0, `${cfg.name} must award minion score bonus once`);
    const scoreAfterFrame1 = scene.score;
    const ultAfterFrame1 = scene.ultimateGauge;
    assert.ok(statsEmissions > beforeEmissions, `${cfg.name} must emit stats-update on minion vaporization`);

    // Frames 2..5: Subsequent frames in the same burst must NOT farm additional score or ultimate charge
    for (let f = 0; f < 4; f++) {
      scene.time.now += 16;
      scene.update(scene.time.now, 16);
    }
    assert.equal(scene.score, scoreAfterFrame1, `${cfg.name} must NOT farm score across subsequent burst frames`);
    assert.equal(scene.ultimateGauge, ultAfterFrame1, `${cfg.name} must NOT farm ultimate charge across subsequent burst frames`);

    cfg.deactivate();
  }

  scene.shutdown();
});

test('Cycle 44.5: captureRunState -> onResumeRunState restores full player stats/arsenal/ultimate/items & BaseEntity.reset clears stale tints', () => {
  const { scene, gameEmitter } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  // Upgrade numerous player stats that previously dropped on resume
  scene.score = 4250;
  scene.playerSpeed = 210;
  scene.speedLevel = 4;
  scene.bombPower = 5;
  scene.maxBombs = 4;
  scene.hasKick = true;
  scene.hasShield = true;
  scene.shieldCharges = 2;
  scene.maxShields = 2;
  scene.hasWallPass = true;
  scene.hasBombPass = true;
  scene.hasMagnet = true;
  scene.hasBlastDeflector = true;
  scene.hasBlastResist = true;
  scene.hasVampiric = true;
  scene.activeBombType = 'PIERCE';
  scene.extraLives = 2;
  scene.ultimateGauge = 85;
  scene.isUltimateReady = false;
  scene.ultimateLockoutRemaining = 500;
  scene.activeUltimate = 'CHRONO_FREEZE';
  scene.itemsCollectedTotal = 9;
  scene.inventory.MAGNET = 1;
  scene.inventory.PIERCE_BOMB = 1;
  scene.itemsCollected = { speedUp: 3, bombUp: 3, fireUp: 4, kick: 1, shield: 2 };

  // Also test an active item without explicit itemType metadata -> fallback must be uppercase 'BOMB_UP'
  scene.items.clear(true, true);
  const mysteryItem = scene.items.create(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20, 'item_bomb_up');
  mysteryItem.setActive(true);

  const saved = scene.captureRunState('manual');
  assert.equal(saved.activeItems[0].itemType, 'BOMB_UP', 'Fallback serialized itemType must be uppercase BOMB_UP');

  // Also inject a legacy lowercase itemType into saved snapshot to verify normalization on resume
  saved.activeItems.push({ row: 5, col: 5, itemType: 'fire_up', spawnTime: 1000 });

  // Reset scene to fresh defaults via create(), then resume from snapshot
  scene.create();
  assert.equal(scene.hasMagnet, false);
  assert.equal(scene.playerSpeed, 150);
  assert.equal(scene.activeUltimate, 'METEOR_STRIKE');

  gameEmitter.emit('resume-run-state', saved);

  const restoredStats = scene.getStats();
  assert.equal(restoredStats.score, 4250);
  assert.equal(restoredStats.speed, 210);
  assert.equal(restoredStats.speedLevel, 4);
  assert.equal(restoredStats.bombPower, 5);
  assert.equal(restoredStats.maxBombs, 4);
  assert.equal(restoredStats.hasKick, true);
  assert.equal(restoredStats.hasShield, true);
  assert.equal(restoredStats.shieldCharges, 2);
  assert.equal(restoredStats.maxShields, 2);
  assert.equal(restoredStats.hasWallPass, true);
  assert.equal(restoredStats.hasBombPass, true);
  assert.equal(restoredStats.hasMagnet, true);
  assert.equal(restoredStats.hasBlastDeflector, true);
  assert.equal(restoredStats.hasBlastResist, true);
  assert.equal(restoredStats.hasVampiric, true);
  assert.equal(restoredStats.activeBombType, 'PIERCE');
  assert.equal(restoredStats.extraLives, 2);
  assert.equal(restoredStats.ultimateGauge, 85);
  assert.equal(restoredStats.ultimateLockoutRemaining, 500);
  assert.equal(restoredStats.activeUltimate, 'CHRONO_FREEZE');
  assert.equal(restoredStats.itemsCollectedTotal, 9);
  assert.equal(restoredStats.inventory.MAGNET, 1);
  assert.deepEqual(restoredStats.itemsCollected, { speedUp: 3, bombUp: 3, fireUp: 4, kick: 1, shield: 2 });

  const resumedItems = scene.items.getChildren().filter((it) => it.active);
  assert.equal(resumedItems.length, 2);
  assert.equal(resumedItems[1].getData('itemType'), 'FIRE_UP', 'Lowercase legacy itemType must normalize to FIRE_UP');

  // Verify BaseEntity.reset() clears stale tint on custom BaseEntity subclasses without default tint
  class CustomTintlessEntity extends BaseEntity {
    constructor(sc, gx, gy) {
      super(sc, gx, gy, 'player', 'neutral', 2, 'Custom', 'custom');
    }
  }
  const custom = new CustomTintlessEntity(scene, 100, 100);
  custom.setTint(0xff00ff);
  assert.equal(custom.isTinted, true);
  assert.equal(custom.tintTopLeft, 0xff00ff);
  custom.reset();
  assert.equal(custom.isTinted, false, 'BaseEntity.reset() must clear stale status/damage tints');
  assert.equal(custom.tintTopLeft, 0xffffff, 'BaseEntity.reset() must restore neutral white tint');

  scene.shutdown();
});

test('Cycle 44.6: Sliding bomb stop/ricochet syncs body.position, TIME_FREEZE keeps companion allies responsive, and re-entrant create() reuses Zero-GC managers', () => {
  const { scene, overlapHandlers } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  scene.map = createOpenArenaMap();

  const initialTraumaMgr = scene.cameraTrauma;
  const initialOverheadMgr = scene.overheadUIManager;
  const initialFloatingMgr = scene.floatingTextManager;

  // 1. Sliding bomb hitting an ally via overlap handler must snap both sprite (x,y) and body.position
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.placeBomb();
  const bomb = scene.bombs.getChildren().find((b) => b.active);
  assert.ok(bomb);
  bomb.setPosition(3 * TILE_SIZE + 7, 1 * TILE_SIZE + 20);
  bomb.body.position.x = 999;
  bomb.body.position.y = 999;
  bomb.setData('isSliding', true);

  const ally = new ShieldGuardAlly(scene, 3 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.allies.add(ally);

  const bombAllyOverlap = overlapHandlers.find((h) => h.objA === scene.bombs && h.objB === scene.allies);
  assert.ok(bombAllyOverlap, 'Bomb-ally overlap handler must be registered');
  bombAllyOverlap.cb(bomb, ally);

  const expectedCx = 3 * TILE_SIZE + TILE_SIZE / 2;
  const expectedCy = 1 * TILE_SIZE + TILE_SIZE / 2;
  assert.equal(bomb.x, expectedCx);
  assert.equal(bomb.y, expectedCy);
  assert.equal(bomb.body.position.x, expectedCx - bomb.body.halfWidth, 'Stopped bomb body.position.x must sync to tile center');
  assert.equal(bomb.body.position.y, expectedCy - bomb.body.halfHeight, 'Stopped bomb body.position.y must sync to tile center');

  // 2. Activate TIME_FREEZE while an ally and a neutral exist -> neutral freezes, ally updates AI cleanly
  const merchant = new MerchantNPC(scene, 5 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  merchant.setVelocity(80, 0);
  scene.neutrals.add(merchant);

  let allyUpdateCount = 0;
  const origUpdateAI = ally.updateAI.bind(ally);
  ally.updateAI = (...args) => {
    allyUpdateCount++;
    return origUpdateAI(...args);
  };

  scene.collectItem('TIME_FREEZE', scene.player.x, scene.player.y);
  assert.equal(scene.isTimeFrozen, true);

  scene.time.now += 16;
  scene.update(scene.time.now, 16);
  assert.equal(merchant.body.velocity.x, 0, 'Neutral NPC velocity must freeze during TIME_FREEZE');
  assert.equal(allyUpdateCount, 1, 'Player companion ally must continue updating AI during player TIME_FREEZE');

  // 3. Start boss + crisis, then invoke create() re-entrantly without shutdown() -> must dismiss active encounters & reuse Zero-GC managers
  scene.startCrisisMode(CrisisType.PSYCHIC_INVASION);
  scene.activeBoss = new SteamToyTitanBoss(300, 260);
  scene.cameraTrauma.addTrauma(0.8);
  scene.floatingTextManager.registerSpawn(100, 100, 1000);
  assert.ok(scene.floatingTextManager.getActiveCount() >= 1);

  scene.create();
  assert.equal(scene.activeBoss, null, 'Re-entrant create() must dismiss activeBoss');
  assert.equal(scene.crisisManager.isCrisisActive(), false, 'Re-entrant create() must stop active crisis');
  assert.equal(scene.cameraTrauma, initialTraumaMgr, 'Re-entrant create() must reuse CameraTraumaSimulator instance');
  assert.equal(scene.cameraTrauma.trauma, 0, 'Reused CameraTraumaSimulator must reset trauma to 0');
  assert.equal(scene.overheadUIManager, initialOverheadMgr, 'Re-entrant create() must reuse OverheadUIManager TypedArrays');
  assert.equal(scene.floatingTextManager, initialFloatingMgr, 'Re-entrant create() must reuse FloatingTextManager TypedArrays');
  assert.equal(scene.floatingTextManager.getActiveCount(), 0);

  scene.shutdown();
});

test('Cycle 44.7: 10,000-Frame Zero-GC Soak across BossAttackManager, MutantFloraBoss, PsychicCrisis, OverheadUIManager, and FloatingTextManager', () => {
  const bam = new BossAttackManager();
  const flora = new MutantFloraBoss(300, 260, bam);
  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.PSYCHIC_INVASION);
  const psychic = cm.getActiveCrisis();
  psychic.transitionToStage(CrisisStage.OUTBREAK);

  const overheadMgr = new OverheadUIManager(true);
  const floatingMgr = new FloatingTextManager();
  const dummyEntities = Array.from({ length: 12 }, (_, idx) => ({
    x: 80 + (idx % 4) * 32,
    y: 80 + Math.floor(idx / 4) * 32,
    active: true,
    isDead: false,
    hp: idx % 2 === 0 ? 1 : 2,
    maxHp: 2,
    faction: idx % 3 === 0 ? 'ally' : 'enemy',
    overheadUI: {
      isDestroyed: false,
      isIntentVisible: idx % 4 === 0,
      lodMode: 'full',
      currentAlpha: 1,
      setDepth() {},
      setLODMode(m) {
        this.lodMode = m;
      },
      setAlpha(a) {
        this.currentAlpha = a;
      },
      setCustomOffsets() {},
    },
  }));
  const player = { x: 240, y: 220 };

  if (globalThis.gc) globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  let simTimeMs = 0;
  const dt = 16.6667;

  for (let frame = 0; frame < 10000; frame++) {
    simTimeMs += dt;
    const px = 120 + ((frame * 3) % 360);
    const py = 120 + ((frame * 2) % 280);
    player.x = px;
    player.y = py;

    if (frame % 30 === 0) {
      bam.spawnProjectile(BossProjectileType.GATLING_SEED, 300, 260, 140, 60, 6, 800);
      bam.addTelegraphTile(2 + (frame % 7), 2 + (frame % 9), 600);
    }
    if (frame % 90 === 0) {
      bam.spawnShockwave(300, 260, 140, 240);
    }

    bam.update(dt, px, py, () => {});
    flora.update(dt, px, py);
    cm.update(dt, { r: Math.floor(py / TILE_SIZE), c: Math.floor(px / TILE_SIZE), x: px, y: py });

    if (frame % 120 === 0) {
      flora.cleanseRootsAt(Math.floor(py / TILE_SIZE), Math.floor(px / TILE_SIZE), 2);
    }
    if (frame % 2500 === 2499) {
      const snap = cm.serialize();
      cm.deserialize(snap);
    }

    overheadMgr.update(dummyEntities, player);
    if (frame % 20 === 0) {
      floatingMgr.registerSpawn(px, py - 12, simTimeMs);
    }
    floatingMgr.getActiveCount(simTimeMs);
  }

  if (globalThis.gc) globalThis.gc();
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);

  assert.equal(bam.projectilePool.verifyInvariants(), true, 'Projectile pool invariants must hold after 10k frames');
  assert.equal(bam.shockwavePool.verifyInvariants(), true, 'Shockwave pool invariants must hold after 10k frames');
  assert.equal(bam.telegraphPool.verifyInvariants(), true, 'Telegraph pool invariants must hold after 10k frames');
  assert.equal(flora.rootPool.verifyInvariants(), true, 'MutantFloraBoss rootPool invariants must hold after 10k frames');
  assert.ok(
    psychic.getActiveHazardCount() <= PsychicCrisis.MAX_DISRUPTED_TILES,
    'PsychicCrisis safe-area cap must hold across 10k frames'
  );
  assert.ok(heapDeltaMb < 32, `10k-frame Zero-GC soak heap delta (${heapDeltaMb.toFixed(2)} MB) must remain bounded`);

  flora.destroy();
  bam.destroy();
  cm.destroy();
  overheadMgr.reset();
  floatingMgr.reset();
});
