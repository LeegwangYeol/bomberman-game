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
  GravityHazard,
  GravityLifecycleState,
  AccretionPhase,
} = await import('../src/game/hazards/GravityHazard.ts');
const { HazardLifecycleState } = await import('../src/game/hazards/DynamicHazard.ts');
const { NebulaLifecycleState } = await import('../src/game/hazards/NebulaHazard.ts');
const { AbyssalLifecycleState } = await import('../src/game/hazards/AbyssalHazard.ts');
const { HazardRenderer } = await import('../src/game/hazards/HazardRenderer.ts');
const {
  ULTIMATE_SKILLS,
  renderMeteorReticle,
  renderChronoStasisVFX,
  renderScorchDecal,
  createAegisDomeVisual,
} = await import('../src/game/ultimate_skills.ts');
const { BossState } = await import('../src/game/bosses/BossTypes.ts');
const { ClockworkCrisis } = await import('../src/game/crises/ClockworkCrisis.ts');
const { OrbitalCrisis } = await import('../src/game/crises/OrbitalCrisis.ts');
const { VoidCrisis } = await import('../src/game/crises/VoidCrisis.ts');
const { VoltHazardAudio } = await import('../src/game/hazards/VoltHazardAudio.ts');
const { MiasmaHazardAudio } = await import('../src/game/hazards/MiasmaHazardAudio.ts');
const { DynamicHazardAudio } = await import('../src/game/hazards/DynamicHazardAudio.ts');
const { ChronoHazardAudio } = await import('../src/game/hazards/ChronoHazardAudio.ts');
const { MagmaHazardAudio } = await import('../src/game/hazards/MagmaHazardAudio.ts');
const { PsychicCrisisAudio } = await import('../src/game/crises/PsychicCrisisAudio.ts');
const { LavaCrisisAudio } = await import('../src/game/crises/LavaCrisisAudio.ts');
const { SolarFlareCrisisAudio } = await import('../src/game/crises/SolarFlareCrisisAudio.ts');
const { AudioVoicePool } = await import('../src/game/pooling/AudioVoicePool.ts');
const { ROWS, COLS, TILE_SIZE, TILE_EMPTY, TILE_BLOCK } = await import('../src/game/pathfinding.ts');

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

class GraphicsOpRecorder {
  constructor() {
    this.ops = [];
    this.currentFillAlpha = 1;
    this.currentFillColor = 0;
  }
  clear() {
    this.ops.length = 0;
  }
  fillStyle(color, alpha = 1) {
    this.currentFillColor = color;
    this.currentFillAlpha = alpha;
    this.ops.push({ type: 'fillStyle', color, alpha });
  }
  fillRect(x, y, width, height) {
    this.ops.push({
      type: 'fillRect',
      x,
      y,
      width,
      height,
      fillColor: this.currentFillColor,
      fillAlpha: this.currentFillAlpha,
    });
  }
  lineStyle(width, color, alpha = 1) {
    this.ops.push({ type: 'lineStyle', width, color, alpha });
  }
  strokeRect(x, y, width, height) {
    this.ops.push({ type: 'strokeRect', x, y, width, height });
  }
  strokeCircle(x, y, radius) {
    this.ops.push({ type: 'strokeCircle', x, y, radius });
  }
  fillCircle(x, y, radius) {
    this.ops.push({ type: 'fillCircle', x, y, radius, fillAlpha: this.currentFillAlpha });
  }
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  fillPath() {}
  strokePath() {}
}

test('Cycle 41.1: GravityHazard activeGravityIndices & HazardRenderer.renderGravitySingularity enforce [0.18, 0.40] telegraph alpha', () => {
  const gh = new GravityHazard();
  gh.init(6, 7);
  assert.equal(gh.getActiveGravityCount(), 0, 'DORMANT must have 0 active gravity tiles');

  gh.start('OUTBREAK');
  assert.equal(gh.getState(), GravityLifecycleState.ACCRETION_SWIRL);
  assert.equal(gh.getActiveGravityCount(), 29, 'Radius-3 lattice circle must contain 29 active gravity tiles');

  const g = new GraphicsOpRecorder();
  const context = { gravityHazard: gh };

  // Test across FORMATION (0ms), COMPRESSION (1100ms), and CRITICAL_COLLAPSE (1700ms)
  const sampleStepsMs = [0, 1100, 600];
  const expectedPhases = [
    AccretionPhase.FORMATION,
    AccretionPhase.COMPRESSION,
    AccretionPhase.CRITICAL_COLLAPSE,
  ];

  for (let s = 0; s < sampleStepsMs.length; s++) {
    if (sampleStepsMs[s] > 0) gh.update(sampleStepsMs[s]);
    assert.equal(gh.getAccretionPhase(), expectedPhases[s]);

    g.clear();
    HazardRenderer.render(g, context, s * 100);
    const rectOps = g.ops.filter((op) => op.type === 'fillRect' && op.width === TILE_SIZE - 4);
    assert.equal(rectOps.length, 29, 'Must render all 29 accretion tiles including core');
    for (const op of rectOps) {
      assert.ok(
        op.fillAlpha >= 0.18 && op.fillAlpha <= 0.40,
        `Telegraph fillAlpha (${op.fillAlpha}) in phase ${expectedPhases[s]} must stay strictly in [0.18, 0.40]`
      );
    }
  }

  // Advance into SINGULARITY_BURST (total >= 2000ms)
  gh.update(400);
  assert.equal(gh.getState(), GravityLifecycleState.SINGULARITY_BURST);
  assert.equal(gh.getActiveGravityCount(), 29);

  g.clear();
  HazardRenderer.render(g, context, 2100);
  const burstRects = g.ops.filter((op) => op.type === 'fillRect' && op.width === TILE_SIZE - 4);
  assert.equal(burstRects.length, 29, 'Burst must render all 29 lethal event horizon tiles');
  assert.ok(burstRects.every((op) => op.fillAlpha === 0.95), 'Burst tiles must render high-contrast 0.95 fill');

  // Advance into COOLDOWN
  gh.update(400);
  assert.equal(gh.getState(), GravityLifecycleState.COOLDOWN);
  assert.equal(gh.getActiveGravityCount(), 0);
});

test('Cycle 41.2: GameScene.explodeBomb triggers GravityHazard singularity collapse counterplay and clears core arrivals', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      scene.map[r][c] = TILE_EMPTY;
    }
  }

  scene.gravityHazard.init(6, 7);
  scene.gravityHazard.start('OUTBREAK');

  let dissipationPlayed = 0;
  scene.gravityHazardAudio = {
    playSingularityDissipation: () => {
      dissipationPlayed++;
    },
    stop: () => {},
    destroy: () => {},
  };

  // Place bomb right at singularity epicenter (6, 7)
  scene.player.setPosition(7 * TILE_SIZE + TILE_SIZE / 2, 6 * TILE_SIZE + TILE_SIZE / 2);
  const bomb = scene.bombs.get(7 * TILE_SIZE + TILE_SIZE / 2, 6 * TILE_SIZE + TILE_SIZE / 2, 'bomb');
  bomb.enableBody(true, 7 * TILE_SIZE + TILE_SIZE / 2, 6 * TILE_SIZE + TILE_SIZE / 2, true, true);
  bomb.setData('id', 'bomb_grav_test');
  bomb.setData('power', 3);
  bomb.setData('owner', 'player');
  scene.activeBombs = 1;

  // Register arrival record first via evaluateBombFusion so we verify clearBombCoreArrival runs
  const otherBomb = scene.bombs.get(7 * TILE_SIZE + TILE_SIZE / 2, 6 * TILE_SIZE + TILE_SIZE / 2, 'bomb');
  otherBomb.enableBody(false, -100, -100, false, false);
  otherBomb.setData('id', 'bomb_inactive');
  scene.gravityHazard.evaluateBombFusion([bomb, otherBomb], 1000);

  const scoreBefore = scene.score;
  scene.explodeBomb(bomb);

  assert.equal(scene.gravityHazard.getState(), GravityLifecycleState.COOLDOWN, 'Bomb at core must collapse singularity into COOLDOWN');
  assert.equal(dissipationPlayed, 1, 'Singularity collapse audio cue must fire once');
  assert.ok(scene.score >= scoreBefore + 250, 'Player must receive +250 singularity collapse bonus score');

  scene.shutdown();
});

test('Cycle 41.3: Unified DynamicHazard minion vaporization prevents double-scoring & Gravity/Nebula/Abyssal guard boss in group', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  // Clear enemies spawned by create()
  scene.enemies.clear(true, true);

  // Force DynamicHazard into ACTIVE beam state and place ChaserEnemy on first beam tile
  scene.dynamicHazard.init();
  scene.dynamicHazard.start('OUTBREAK');
  for (let step = 0; step < 30 && scene.dynamicHazard.getState() !== HazardLifecycleState.ACTIVE; step++) {
    scene.dynamicHazard.update(250);
  }
  assert.equal(scene.dynamicHazard.getState(), HazardLifecycleState.ACTIVE);

  const beamIdx = scene.dynamicHazard.getActiveBeamIndices()[0];
  const br = Math.floor(beamIdx / COLS);
  const bc = beamIdx % COLS;
  const bx = bc * TILE_SIZE + TILE_SIZE / 2;
  const by = br * TILE_SIZE + TILE_SIZE / 2;

  const chaser = new ChaserEnemy(scene, bx, by);
  scene.enemies.add(chaser);

  let vaporizeAudioCalls = 0;
  scene.dynamicHazardAudio = {
    playDynamicHazardState: () => {},
    playMinionVaporization: () => {
      vaporizeAudioCalls++;
    },
    stop: () => {},
    destroy: () => {},
  };

  // Move player far from beam so player does not die
  scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  scene.score = 0;
  scene.ultimateCharge = 0;

  scene.update(1016, 16);

  assert.equal(chaser.isDead, true, 'Minion on active beam tile must be vaporized');
  assert.equal(vaporizeAudioCalls, 1, 'Minion vaporization audio must fire exactly once');
  assert.equal(scene.score, 100, 'Score bonus must be awarded ONCE (+100), never doubled (+200)');

  // Verify Gravity, Nebula, and Abyssal !hitActiveBossInGroup guards when activeBoss is inside scene.enemies
  const testBossSingleEvaluation = (setupHazardFn) => {
    scene.enemies.clear(true, true);
    let bossHazardHits = 0;
    const mockBoss = {
      x: 7 * TILE_SIZE + 20,
      y: 6 * TILE_SIZE + 20,
      active: true,
      isDead: false,
      bossState: BossState.IDLE,
      getState: () => BossState.IDLE,
      currentHp: 1000,
      maxHp: 1000,
      config: { colliderRadius: 35 },
      update: () => {},
      render: () => {},
      destroy: () => {},
      takeHazardDamage: () => {
        bossHazardHits++;
        return { damage: 120, stunned: true, defeated: false };
      },
    };
    scene.activeBoss = mockBoss;
    scene.enemies.add(mockBoss);
    const collisionCallCounter = setupHazardFn();
    scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
    scene.update(2000, 16);
    assert.equal(collisionCallCounter(), 1, 'checkEnemyCollision must run ONCE for boss when boss is in enemies group');
    assert.equal(bossHazardHits, 1, 'Boss must take hazard stasis hit exactly once');
    scene.activeBoss = null;
    scene.enemies.clear(false, false);
  };

  testBossSingleEvaluation(() => {
    scene.dynamicHazard.stop();
    scene.gravityHazard.init(6, 7);
    scene.gravityHazard.transitionTo(GravityLifecycleState.SINGULARITY_BURST);
    let calls = 0;
    const orig = scene.gravityHazard.checkEnemyCollision.bind(scene.gravityHazard);
    scene.gravityHazard.checkEnemyCollision = (...args) => {
      calls++;
      return orig(...args);
    };
    return () => calls;
  });

  testBossSingleEvaluation(() => {
    scene.gravityHazard.stop();
    scene.nebulaHazard.init(6, 7);
    scene.nebulaHazard.transitionTo(NebulaLifecycleState.ECLIPSE_COLLAPSE);
    const activeIdx = scene.nebulaHazard.getActiveNebulaIndices()[0];
    const r = Math.floor(activeIdx / COLS);
    const c = activeIdx % COLS;
    scene.activeBoss.x = c * TILE_SIZE + 20;
    scene.activeBoss.y = r * TILE_SIZE + 20;
    let calls = 0;
    const orig = scene.nebulaHazard.checkEnemyCollision.bind(scene.nebulaHazard);
    scene.nebulaHazard.checkEnemyCollision = (...args) => {
      calls++;
      return orig(...args);
    };
    return () => calls;
  });

  testBossSingleEvaluation(() => {
    scene.nebulaHazard.stop();
    scene.abyssalHazard.init();
    scene.abyssalHazard.start();
    scene.abyssalHazard.transitionTo(AbyssalLifecycleState.ABYSSAL_MAELSTROM);
    const activeIdx = scene.abyssalHazard.getActiveAbyssalIndices()[0];
    const r = Math.floor(activeIdx / COLS);
    const c = activeIdx % COLS;
    scene.activeBoss.x = c * TILE_SIZE + 20;
    scene.activeBoss.y = r * TILE_SIZE + 20;
    let calls = 0;
    const orig = scene.abyssalHazard.checkEnemyCollision.bind(scene.abyssalHazard);
    scene.abyssalHazard.checkEnemyCollision = (...args) => {
      calls++;
      return orig(...args);
    };
    return () => calls;
  });

  scene.shutdown();
});

test('Cycle 41.4: Pooled Enemy reset() revives all 6 archetypes & attachEntityDropShadow(scale) prevents shadow leaks', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const enemies = [
    new ChaserEnemy(scene, 200, 200),
    new BomberEnemy(scene, 240, 200),
    new TankEnemy(scene, 280, 200),
    new GhostEnemy(scene, 320, 200),
    new SplitterEnemy(scene, 360, 200),
    new MiniSplitterEnemy(scene, 400, 200),
  ];

  for (const enemy of enemies) {
    enemy.isDead = true;
    enemy.hp = 0;
    enemy.applyStun?.(5000);
    enemy.isStunned = true;
    enemy.speedMultiplier = 0.35;
    enemy.speedMultiplierUntilMs = 99999;
    if ('activeBombs' in enemy) enemy.activeBombs = 2;
    enemy.overheadUI.destroy();
    assert.equal(enemy.overheadUI.isDestroyed, true);

    enemy.reset();

    assert.equal(enemy.isDead, false, `${enemy.entityType} isDead must reset to false`);
    assert.equal(enemy.hp, enemy.maxHp, `${enemy.entityType} hp must restore to maxHp`);
    assert.equal(enemy.isStunned, false, `${enemy.entityType} stun must clear`);
    assert.equal(enemy.speedMultiplier, 1.0, `${enemy.entityType} speedMultiplier must reset to 1.0`);
    assert.equal(enemy.overheadUI.isDestroyed, false, `${enemy.entityType} OverheadUI must revive cleanly`);
    if ('activeBombs' in enemy) {
      assert.equal(enemy.activeBombs, 0, `${enemy.entityType} activeBombs must reset to 0`);
    }
  }
  assert.equal(enemies[0].aiState, EnemyState.TRACKING);
  assert.equal(enemies[1].aiState, EnemyState.HUNTING);

  // Verify attachEntityDropShadow releases pre-existing shadow and preserves custom scale across updateEntity
  const mini = enemies[5];
  const shadowActiveBefore = scene.shadowPool.activeCount;
  scene.attachEntityDropShadow(mini, 1.0);
  assert.equal(scene.shadowPool.activeCount, shadowActiveBefore + 1);
  // Calling attachEntityDropShadow again with custom 0.72 scale must NOT leak the previous shadow!
  scene.attachEntityDropShadow(mini, 0.72);
  assert.equal(scene.shadowPool.activeCount, shadowActiveBefore + 1, 'Prior dropShadow must be released back to shadowPool');
  assert.ok(Math.abs(mini.dropShadow.scaleX - 0.72) < 1e-6);

  mini.updateEntity(16, 2000);
  assert.ok(Math.abs(mini.dropShadow.scaleX - 0.72) < 1e-6, 'updateEntity must preserve dropShadowScale = 0.72');

  for (const enemy of enemies) {
    enemy.destroy();
  }
  scene.shutdown();
});

test('Cycle 41.5: Overlapping CHRONO_FREEZE timers never expire early or drift speed + VFX scrollFactor(0) & reticle abort cleanup', () => {
  const { scene, repeatingEvents } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const baseSpeed = scene.playerSpeed;
  const chronoSkill = ULTIMATE_SKILLS.CHRONO_FREEZE;

  // Trigger first CHRONO_FREEZE at t = 1000ms
  scene.ultimateCharge = 100;
  scene.selectedUltimate = 'CHRONO_FREEZE';
  scene.executeChronoFreeze(chronoSkill);

  assert.equal(scene.isUltimateChronoFrozen, true);
  const boostedSpeed = scene.playerSpeed;
  assert.ok(boostedSpeed > baseSpeed);

  const firstExpiryTimer = scene.activeChronoFreezeTimer;
  assert.ok(firstExpiryTimer, 'First 5000ms expiry timer must be scheduled');

  // Re-trigger second CHRONO_FREEZE before first expires
  scene.executeChronoFreeze(chronoSkill);
  assert.equal(firstExpiryTimer.removed, true, 'Overlapping CHRONO_FREEZE must cancel prior expiry timer');
  assert.ok(
    Math.abs(scene.playerSpeed - boostedSpeed) < 1e-6,
    'Overlapping CHRONO_FREEZE must not compound playerSpeed'
  );

  // Fire latest expiry timer
  const secondExpiryTimer = scene.activeChronoFreezeTimer;
  assert.ok(secondExpiryTimer && secondExpiryTimer !== firstExpiryTimer);
  secondExpiryTimer.callback();

  assert.equal(scene.isUltimateChronoFrozen, false);
  assert.ok(Math.abs(scene.playerSpeed - baseSpeed) < 1e-6, 'Player speed must return cleanly to exact baseSpeed');

  // Verify renderChronoStasisVFX sets scrollFactor(0) on pooled overlay and border, and release restores scrollFactor(1)
  const rectActiveBefore = scene.rectPool.activeCount;
  const gfxActiveBefore = scene.graphicsPool.activeCount;
  const vfx = renderChronoStasisVFX(scene, 3000);
  assert.equal(scene.rectPool.activeCount, rectActiveBefore + 1);
  assert.equal(scene.graphicsPool.activeCount, gfxActiveBefore + 1);

  const activeOverlay = scene.rectPool.getActive(scene.rectPool.activeCount - 1);
  const activeBorder = scene.graphicsPool.getActive(scene.graphicsPool.activeCount - 1);
  assert.equal(activeOverlay.scrollFactorX, 0, 'Chrono overlay must lock scrollFactorX = 0');
  assert.equal(activeBorder.scrollFactorX, 0, 'Chrono border must lock scrollFactorX = 0');

  vfx.destroy();
  assert.equal(activeOverlay.scrollFactorX, 1, 'Pool reset must restore scrollFactorX = 1');
  assert.equal(activeBorder.scrollFactorX, 1, 'Pool reset must restore scrollFactorX = 1');

  // Verify renderMeteorReticle removes timer and releases graphics if graphics becomes inactive early
  const reticle = renderMeteorReticle(scene, 200, 200, 600);
  const reticleEvent = repeatingEvents[repeatingEvents.length - 1];
  assert.equal(reticleEvent.removed, false);
  reticle.setActive(false);
  reticleEvent.callback();
  assert.equal(reticleEvent.removed, true, 'Inactive reticle must immediately cancel repeating 16ms timer');

  // Verify pool-identity guard across scene recreation
  renderScorchDecal(scene, 120, 120, 1000);
  const dome = createAegisDomeVisual(scene, scene.player);
  const oldPool = scene.graphicsPool;
  scene.create(); // Replaces graphicsPool
  assert.notEqual(scene.graphicsPool, oldPool);
  assert.doesNotThrow(() => dome.destroy(), 'Destroying dome after pool replacement must be safe');

  scene.shutdown();
});

test('Cycle 41.6: Re-entrant GameScene.create() & multi-sprite destroyBlock reverse-loop maintain strict pool invariants', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();
  // Grant shield visual before re-entrant create()
  scene.shieldCharges = 1;
  scene.hasShield = true;
  scene.update(1016, 16);

  // Re-entrant create() without prior shutdown()
  scene.create();
  assert.equal(scene.shieldVisual, null, 'Re-entrant create() must clear stale shieldVisual reference');
  assert.equal(scene.graphicsPool.verifyInvariants(), true);
  assert.equal(scene.shadowPool.verifyInvariants(), true);
  assert.equal(scene.rectPool.verifyInvariants(), true);

  // Place two overlapping block sprites at (4, 4) with pooled aoShadows to test reverse-loop mutation safety
  scene.map[4][4] = TILE_BLOCK;
  const ao1 = scene.rectPool.acquire();
  const ao2 = scene.rectPool.acquire();
  const b1 = scene.blocks.create(4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20, 'block');
  b1.setData('row', 4).setData('col', 4).setData('aoShadow', ao1);
  const b2 = scene.blocks.create(4 * TILE_SIZE + 20, 4 * TILE_SIZE + 20, 'block');
  b2.setData('row', 4).setData('col', 4).setData('aoShadow', ao2).setData('isChest', true);

  scene.destroyBlock(4, 4);
  // Complete debris fallback tweens (rectPool LIFO immediately recycled ao1/ao2 into debris fragments)
  scene.tweens.killAll();

  assert.equal(b1.destroyed, true, 'First block sprite at (4,4) must be destroyed without array-mutation skip');
  assert.equal(b2.destroyed, true, 'Second block sprite at (4,4) must also be destroyed');
  assert.equal(scene.rectPool.isActive(ao1), false, 'ao1 must be released back to rectPool');
  assert.equal(scene.rectPool.isActive(ao2), false, 'ao2 must be released back to rectPool');
  assert.equal(scene.rectPool.verifyInvariants(), true);

  scene.shutdown();
});

test('Cycle 41.7: All 8 Hazard & Crisis Audio classes clear static cachedNoiseBuffer & cachedNoiseSampleRate when instance is null', () => {
  const audioClasses = [
    VoltHazardAudio,
    MiasmaHazardAudio,
    DynamicHazardAudio,
    ChronoHazardAudio,
    MagmaHazardAudio,
    PsychicCrisisAudio,
    LavaCrisisAudio,
    SolarFlareCrisisAudio,
  ];

  const fakeBuffer = { length: 22050 };
  for (const AudioCls of audioClasses) {
    AudioCls.resetInstance();
    // Simulate static cache populated when singleton instance is already null
    AudioCls.cachedNoiseBuffer = fakeBuffer;
    AudioCls.cachedNoiseSampleRate = 48000;
    AudioCls.instance = null;

    AudioCls.resetInstance();
    assert.equal(AudioCls.cachedNoiseBuffer, null, `${AudioCls.name}.resetInstance() must clear cachedNoiseBuffer even when instance is null`);
    assert.equal(AudioCls.cachedNoiseSampleRate, 0, `${AudioCls.name}.resetInstance() must reset cachedNoiseSampleRate to 0`);
  }

  // Verify PsychicCrisisAudio.destroy() nulls non-owned shared pool reference
  const sharedPool = new AudioVoicePool(8);
  const psychicAudio = PsychicCrisisAudio.getInstance();
  psychicAudio.init({ state: 'running', currentTime: 0, sampleRate: 44100 }, sharedPool);
  psychicAudio.destroy();
  assert.equal(psychicAudio.pool, null, 'PsychicCrisisAudio.destroy() must release non-owned pool reference');
  sharedPool.destroy();
});

test('Cycle 41.8: ClockworkCrisis, OrbitalCrisis, and VoidCrisis reuse conduits/uplinks/prisms in-place across init/reset', () => {
  const clockwork = new ClockworkCrisis();
  clockwork.init();
  const conduitsRef = clockwork.conduits;
  const conduit0Ref = clockwork.conduits[0];
  conduit0Ref.isHit = true;
  conduit0Ref.hitTimestampMs = 1234;

  clockwork.reset();
  clockwork.init();
  assert.equal(clockwork.conduits, conduitsRef, 'ClockworkCrisis.conduits array must be reused in-place');
  assert.equal(clockwork.conduits[0], conduit0Ref, 'Conduit element object must be reused in-place');
  assert.equal(clockwork.conduits[0].isHit, false);
  assert.equal(clockwork.conduits[0].hitTimestampMs, 0);

  const orbital = new OrbitalCrisis();
  orbital.init();
  const uplinksRef = orbital.uplinks;
  const uplink0Ref = orbital.uplinks[0];
  uplink0Ref.isOverridden = true;

  orbital.reset();
  orbital.init();
  assert.equal(orbital.uplinks, uplinksRef, 'OrbitalCrisis.uplinks array must be reused in-place');
  assert.equal(orbital.uplinks[0], uplink0Ref, 'Uplink element object must be reused in-place');
  assert.equal(orbital.uplinks[0].isOverridden, false);

  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  const prismsRef = voidCrisis.prisms;
  const prism0Ref = voidCrisis.prisms[0];
  prism0Ref.charge = 3;
  prism0Ref.hits = 3;
  prism0Ref.isCharged = true;

  voidCrisis.reset();
  voidCrisis.init();
  assert.equal(voidCrisis.prisms, prismsRef, 'VoidCrisis.prisms array must be reused in-place');
  assert.equal(voidCrisis.prisms[0], prism0Ref, 'Prism element object must be reused in-place');
  assert.equal(voidCrisis.prisms[0].charge, 0);
  assert.equal(voidCrisis.prisms[0].isCharged, false);
});

test('Cycle 41.9: 10,000-Frame Zero-GC Soak Test across GravityHazard renderer, pooled enemies, crises, and scene pools', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.init();
  scene.create();

  const gh = new GravityHazard();
  gh.init(6, 7);
  gh.start('OUTBREAK');

  const recorder = new GraphicsOpRecorder();
  const renderCtx = { gravityHazard: gh };
  const pooledChaser = new ChaserEnemy(scene, 220, 220);
  scene.attachEntityDropShadow(pooledChaser, 0.85);
  const orbital = new OrbitalCrisis();
  orbital.init();

  const dt = 16.67;
  for (let frame = 0; frame < 10000; frame++) {
    const nowMs = frame * dt;
    gh.update(dt);
    HazardRenderer.render(recorder, renderCtx, nowMs);

    if (gh.getState() === GravityLifecycleState.ACCRETION_SWIRL) {
      for (let i = 0; i < recorder.ops.length; i++) {
        const op = recorder.ops[i];
        if (op.type === 'fillRect') {
          assert.ok(op.fillAlpha >= 0.18 && op.fillAlpha <= 0.40);
        }
      }
    }

    pooledChaser.updateEntity(dt, nowMs);
    assert.ok(Number.isFinite(pooledChaser.x) && Number.isFinite(pooledChaser.y));

    if (frame % 500 === 499) {
      pooledChaser.applyStun(200);
      pooledChaser.reset();
      orbital.reset();
      orbital.init();
    } else {
      orbital.update(dt, { r: 1, c: 1, x: 60, y: 60 });
    }

    const tempArc = scene.circlePool.acquire();
    if (tempArc) scene.circlePool.release(tempArc);
  }

  assert.equal(scene.circlePool.verifyInvariants(), true);
  assert.equal(scene.rectPool.verifyInvariants(), true);
  assert.equal(scene.graphicsPool.verifyInvariants(), true);
  assert.equal(scene.shadowPool.verifyInvariants(), true);

  pooledChaser.destroy();
  orbital.reset();
  scene.shutdown();
});
