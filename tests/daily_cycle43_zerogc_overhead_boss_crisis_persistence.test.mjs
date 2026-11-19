import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
const { OverheadUI } = await import('../src/game/entities/OverheadUI.ts');
const {
  ChaserEnemy,
  TankEnemy,
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
  FlatHazardMask,
  findPathWithDemolition,
} = await import('../src/game/pathfinding.ts');
const { VoidCrisis } = await import('../src/game/crises/VoidCrisis.ts');
const { ClockworkCrisis } = await import('../src/game/crises/ClockworkCrisis.ts');
const { OrbitalCrisis } = await import('../src/game/crises/OrbitalCrisis.ts');
const { LavaCrisis } = await import('../src/game/crises/LavaCrisis.ts');
const { CrisisType, CrisisStage, HazardType } = await import('../src/game/crises/CrisisTypes.ts');
const { HamsterBoss } = await import('../src/game/bosses/HamsterBoss.ts');
const { GummyBearBoss } = await import('../src/game/bosses/GummyBearBoss.ts');
const { QueenBeeBoss } = await import('../src/game/bosses/QueenBeeBoss.ts');
const { SteamToyTitanBoss } = await import('../src/game/bosses/SteamToyTitanBoss.ts');
const { MutantFloraBoss } = await import('../src/game/bosses/MutantFloraBoss.ts');
const { BossState } = await import('../src/game/bosses/BossTypes.ts');
const { renderMeteorReticle } = await import('../src/game/ultimate_skills.ts');

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

test('Cycle 43.1: OverheadUI Zero-GC revival reuses exact OverheadUI instance, resets LOD/alpha/offsets, and guards pool generation', () => {
  const { scene } = createStatefulGameSceneHarness();
  scene.create();

  const chaser = new ChaserEnemy(scene, 140, 140);
  const originalUI = chaser.overheadUI;

  // Mutate transient OverheadUI state (as OverheadUIManager does during player proximity / clutter)
  originalUI.setCustomOffsets(18, -24);
  originalUI.setAlpha(0.15);
  originalUI.setLODMode('minimal');
  originalUI.setIntent('🎯', true);
  assert.equal(originalUI.nameTag.visible, false);

  const gActiveBeforeDie = scene.graphicsPool.activeCount;
  const nameActiveBeforeDie = scene.nameTagTextPool.activeCount;
  const badgeActiveBeforeDie = scene.intentBadgeTextPool.activeCount;

  // Kill and revive via pooled entity revival path
  chaser.die(2000);
  assert.equal(originalUI.isDestroyed, true);
  assert.equal(scene.graphicsPool.activeCount, gActiveBeforeDie - 1);
  assert.equal(scene.nameTagTextPool.activeCount, nameActiveBeforeDie - 1);
  assert.equal(scene.intentBadgeTextPool.activeCount, badgeActiveBeforeDie - 1);

  chaser.reviveAt(220, 260);
  assert.equal(chaser.overheadUI, originalUI, 'reviveAt must reuse the exact OverheadUI instance without reallocating');
  assert.equal(chaser.overheadUI.isDestroyed, false);
  assert.equal(chaser.overheadUI.customOffsetX, 0);
  assert.equal(chaser.overheadUI.customOffsetY, 0);
  assert.equal(chaser.overheadUI.currentAlpha, 1.0);
  assert.equal(chaser.overheadUI.lodMode, 'full');
  assert.equal(chaser.overheadUI.nameTag.visible, true);
  assert.equal(scene.graphicsPool.activeCount, gActiveBeforeDie);
  assert.equal(scene.nameTagTextPool.activeCount, nameActiveBeforeDie);
  assert.equal(scene.intentBadgeTextPool.activeCount, badgeActiveBeforeDie);

  // Stale pool generation safety: if scene pools are replaced on re-entrant create(),
  // destroying an old OverheadUI must destroy orphaned objects rather than polluting the new pool
  const standaloneUI = new OverheadUI(scene, 'LegacyUnit', 'enemy', 3);
  scene.create(); // replaces graphicsPool / nameTagTextPool / intentBadgeTextPool
  const freshPoolFreeCount = scene.graphicsPool.freeCount;
  standaloneUI.destroy();
  assert.equal(scene.graphicsPool.freeCount, freshPoolFreeCount, 'Stale OverheadUI must not release into a newer pool generation');

  scene.shutdown();
});

test('Cycle 43.2: Allies & Neutrals enforce stun freeze, PetDrone preserves longer stun, Tank stomp is timer-free, and Merchant loot is Zero-GC', () => {
  const { scene, activeTimers } = createStatefulGameSceneHarness();
  scene.create();
  const map = createOpenArenaMap();
  const bombTiles = new FlatHazardMask(ROWS * COLS);

  const miniBomber = new MiniBomberAlly(scene, 60, 60);
  const petDrone = new PetDroneAlly(scene, 100, 60);
  const shieldGuard = new ShieldGuardAlly(scene, 100, 100);
  const merchant = new MerchantNPC(scene, 140, 140);
  const critter = new CritterNPC(scene, 180, 140);
  const targetEnemy = new ChaserEnemy(scene, 120, 60);

  // Stun all allies & neutrals for 2000ms
  for (const entity of [miniBomber, petDrone, shieldGuard, merchant, critter]) {
    entity.setVelocity(80, -60);
    entity.applyStun(2000);
    assert.equal(entity.overheadUI.intentGlyph, '💫');
  }

  let plantedBombs = 0;
  miniBomber.bombCooldownTimer = 0;
  miniBomber.updateAI(16, 1050, scene.player, map, bombTiles, () => {
    plantedBombs++;
    return true;
  });
  petDrone.shootTimer = 0;
  petDrone.updateAI(16, 1050, scene.player, [], [targetEnemy]);
  shieldGuard.tauntTimer = 0;
  shieldGuard.updateAI(16, 1050, scene.player, 'down', [targetEnemy]);
  merchant.updateAI(16, 1050, scene.player, map, bombTiles);
  critter.updateAI(16, 1050, map);

  assert.equal(plantedBombs, 0, 'Stunned MiniBomberAlly must not plant bombs');
  assert.equal(targetEnemy.isStunned, false, 'Stunned PetDroneAlly must not shoot stun bolts');
  for (const entity of [miniBomber, petDrone, shieldGuard, merchant, critter]) {
    assert.equal(entity.body.velocity.x, 0);
    assert.equal(entity.body.velocity.y, 0);
    assert.equal(entity.overheadUI.intentGlyph, '💫', `${entity.entityName} must retain stun badge while stunned`);
  }

  // Unstun PetDrone and verify it preserves a longer existing stun on targetEnemy + keeps 🎯 intent for 400ms
  petDrone.isStunned = false;
  petDrone.stunUntil = 0;
  targetEnemy.isStunned = true;
  targetEnemy.stunUntil = 5000; // Existing 4000ms remaining stun at t=1000
  targetEnemy.setVelocity(90, 45);
  petDrone.shootTimer = 0;
  petDrone.updateAI(16, 1000, scene.player, [], [targetEnemy]);
  assert.equal(targetEnemy.stunUntil, 5000, 'PetDrone bolt must preserve longer existing stun duration');
  assert.equal(targetEnemy.body.velocity.x, 0, 'PetDrone bolt must halt target velocity');
  assert.equal(petDrone.overheadUI.intentGlyph, '🎯', 'PetDrone must display 🎯 shot intent for 400ms instead of immediately overwriting with 🚁');

  // ShieldGuard taunt must not overwrite 💫 on stunned enemies
  shieldGuard.isStunned = false;
  shieldGuard.stunUntil = 0;
  shieldGuard.tauntTimer = 0;
  targetEnemy.overheadUI.setIntent('💫', true);
  shieldGuard.setPosition(targetEnemy.x + 10, targetEnemy.y);
  shieldGuard.updateAI(16, 1000, scene.player, 'down', [targetEnemy]);
  assert.equal(targetEnemy.overheadUI.intentGlyph, '💫', 'Aegis taunt must not overwrite stun badge on stunned enemy');

  // TankEnemy stomp uses Zero-GC delta countdown instead of scheduling scene.time.delayedCall
  const tank = new TankEnemy(scene, 140, 60);
  const timersBeforeStomp = activeTimers.length;
  tank.stompTimer = 0;
  tank.updateAI(16, 1000, scene.player, map, bombTiles);
  assert.equal(activeTimers.length, timersBeforeStomp, 'TankEnemy stomp must not allocate delayedCall timers');
  assert.equal(tank.overheadUI.intentGlyph, '💥');
  tank.updateAI(1250, 2250, scene.player, map, bombTiles);
  assert.equal(tank.overheadUI.intentGlyph, '🛡️', 'TankEnemy must restore 🛡️ intent after 1200ms delta timer');

  // MerchantNPC onDeath reuses droppedLoot array and slot objects in place
  merchant.isStunned = false;
  merchant.die(2500);
  assert.equal(merchant.droppedLoot.length, 2);
  const lootArrRef = merchant.droppedLoot;
  const slot0Ref = merchant.droppedLoot[0];
  const slot1Ref = merchant.droppedLoot[1];
  merchant.reviveAt(180, 180);
  assert.equal(merchant.droppedLoot.length, 0);
  merchant.die(3500);
  assert.equal(merchant.droppedLoot, lootArrRef);
  assert.equal(merchant.droppedLoot[0], slot0Ref);
  assert.equal(merchant.droppedLoot[1], slot1Ref);
  assert.equal(merchant.droppedLoot[0].spawnTime, 3500);

  scene.shutdown();
});

test('Cycle 43.3: Boss cutscene stun immunity, onStateChanged stun hook, and GameScene bomb-boss collision damage order', () => {
  // 1. Cutscene stun immunity across all 5 bosses in INTRO & INTERMISSION
  const bosses = [
    new HamsterBoss(300, 260),
    new GummyBearBoss(300, 260),
    new QueenBeeBoss(300, 260),
    new SteamToyTitanBoss(300, 260),
    new MutantFloraBoss(300, 260),
  ];
  for (const boss of bosses) {
    assert.equal(boss.bossState, BossState.INTRO);
    boss.applyStun(3.0);
    assert.equal(boss.bossState, BossState.INTRO, `${boss.constructor.name} must ignore stun during INTRO`);
    boss.transitionTo(BossState.INTERMISSION);
    boss.applyStun(3.0);
    assert.equal(boss.bossState, BossState.INTERMISSION, `${boss.constructor.name} must ignore stun during INTERMISSION`);
    boss.destroy();
  }

  // 2. HamsterBoss external applyStun invokes onStateChanged to cancel active dash/rev
  const hamster = new HamsterBoss(300, 260);
  hamster.update(1600, 300, 260);
  assert.equal(hamster.bossState, BossState.PHASE_1);
  hamster.isDashing = true;
  hamster.isReving = true;
  hamster.applyStun(2.5);
  assert.equal(hamster.bossState, BossState.STUNNED);
  assert.equal(hamster.isDashing, false, 'applyStun must cancel HamsterBoss dash via onStateChanged');
  assert.equal(hamster.isReving, false, 'applyStun must cancel HamsterBoss rev via onStateChanged');
  hamster.destroy();

  // 3. GameScene bomb-boss collision applies stun BEFORE takeBombDamage so shielded/aerial bosses take 1 HP damage (not 0)
  const { scene } = createStatefulGameSceneHarness();
  scene.create();

  for (const BossCtor of [HamsterBoss, GummyBearBoss, QueenBeeBoss]) {
    const boss = new BossCtor(7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
    boss.update(1600, 60, 60); // Advance INTRO -> PHASE_1
    assert.equal(boss.bossState, BossState.PHASE_1);
    const hpBefore = boss.currentHp;

    scene.activeBoss = boss;
    scene.bossHitBombIds.clear();
    scene.player.setPosition(7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
    scene.maxBombs = 5;
    scene.activeBombs = 0;
    scene.placeBomb();
    const planted = scene.bombs.getChildren().find((b) => b.active);
    assert.ok(planted, 'Bomb must be placed');

    scene.handleBombBossCollision(planted, 6, 7, false);
    assert.equal(boss.currentHp, hpBefore - 1, `${BossCtor.name} must take exactly 1 HP damage on bomb collision`);
    assert.equal(boss.bossState, BossState.STUNNED, `${BossCtor.name} must remain STUNNED when non-lethal`);

    // Lethal 1-HP collision must end in DEFEATED (never overwritten back to STUNNED)
    boss.currentHp = 1;
    boss.transitionTo(BossState.PHASE_2);
    scene.bossHitBombIds.clear();
    scene.activeBombs = 0;
    scene.placeBomb();
    const lethalBomb = scene.bombs.getChildren().find((b) => b.active);
    scene.handleBombBossCollision(lethalBomb, 6, 7, false);
    assert.equal(boss.currentHp, 0);
    assert.equal(boss.bossState, BossState.DEFEATED, `${BossCtor.name} lethal bomb collision must preserve DEFEATED`);

    boss.destroy();
  }
  scene.activeBoss = null;
  scene.shutdown();
});

test('Cycle 43.4: VoidCrisis, ClockworkCrisis, OrbitalCrisis, and LavaCrisis reset & extraState serialization round-trip', () => {
  // 1. VoidCrisis serialize -> reset -> deserialize
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.setStage(CrisisStage.CLIMAX);
  voidCrisis.voidCreepCount = 19;
  voidCrisis.creepTimerMs = 1750;
  voidCrisis.avatarSpawned = true;
  voidCrisis.avatarHp = 2;
  voidCrisis.avatarShieldActive = false;
  voidCrisis.supernovaCleansed = true;
  voidCrisis.prisms[0].charge = 100;
  voidCrisis.prisms[0].hits = 2;
  voidCrisis.prisms[0].isCharged = true;
  const prismsRef = voidCrisis.prisms;
  const savedVoid = voidCrisis.serialize();

  voidCrisis.reset();
  assert.equal(voidCrisis.getStage(), CrisisStage.INACTIVE);
  assert.equal(voidCrisis.voidCreepCount, 0);
  assert.equal(voidCrisis.avatarSpawned, false);
  assert.equal(voidCrisis.avatarHp, 3);
  assert.equal(voidCrisis.prisms, prismsRef, 'VoidCrisis.reset must reuse prisms array in place');
  assert.equal(voidCrisis.prisms[0].isCharged, false);

  voidCrisis.deserialize(savedVoid);
  assert.equal(voidCrisis.voidCreepCount, 19);
  assert.equal(voidCrisis.avatarSpawned, true);
  assert.equal(voidCrisis.avatarHp, 2);
  assert.equal(voidCrisis.avatarShieldActive, false);
  assert.equal(voidCrisis.supernovaCleansed, true);
  assert.equal(voidCrisis.prisms[0].isCharged, true);

  // 2. ClockworkCrisis serialize -> reset -> deserialize
  const clockwork = new ClockworkCrisis();
  clockwork.init();
  clockwork.empTimerMs = 8400;
  clockwork.isEmpWarningActive = true;
  clockwork.totalEmpPulsesFired = 2;
  clockwork.isOverloadWindowActive = true;
  clockwork.overloadWindowTimerMs = 950;
  clockwork.bonusBombSlotsGranted = true;
  clockwork.conduits[1].isHit = true;
  clockwork.conduits[1].hitTimestampMs = 4200;
  const conduitsRef = clockwork.conduits;
  const savedClock = clockwork.serialize();

  clockwork.reset();
  assert.equal(clockwork.empTimerMs, 0);
  assert.equal(clockwork.isEmpWarningActive, false);
  assert.equal(clockwork.totalEmpPulsesFired, 0);
  assert.equal(clockwork.bonusBombSlotsGranted, false);
  assert.equal(clockwork.conduits, conduitsRef);
  assert.equal(clockwork.conduits[1].isHit, false);

  clockwork.deserialize(savedClock);
  assert.equal(clockwork.empTimerMs, 8400);
  assert.equal(clockwork.isEmpWarningActive, true);
  assert.equal(clockwork.totalEmpPulsesFired, 2);
  assert.equal(clockwork.isOverloadWindowActive, true);
  assert.equal(clockwork.conduits[1].isHit, true);

  // 3. OrbitalCrisis serialize -> reset -> deserialize
  const orbital = new OrbitalCrisis();
  orbital.init();
  orbital.salvoTimerMs = 3100;
  orbital.salvosEvadedCount = 3;
  orbital.macrocannonCharge = 68;
  orbital.uplinks[2].isOverridden = true;
  orbital.pendingCraters.push({ r: 3, c: 5, remainingMs: 700 });
  const savedOrbital = orbital.serialize();

  orbital.reset();
  assert.equal(orbital.salvoTimerMs, 0);
  assert.equal(orbital.salvosEvadedCount, 0);
  assert.equal(orbital.macrocannonCharge, 0);
  assert.equal(orbital.uplinks[2].isOverridden, false);
  assert.equal(orbital.pendingCraters.length, 0);

  orbital.deserialize(savedOrbital);
  assert.equal(orbital.salvoTimerMs, 3100);
  assert.equal(orbital.salvosEvadedCount, 3);
  assert.equal(orbital.macrocannonCharge, 68);
  assert.equal(orbital.uplinks[2].isOverridden, true);
  assert.equal(orbital.pendingCraters.length, 1);
  assert.equal(orbital.pendingCraters[0].r, 3);

  // 4. LavaCrisis exact corner deduplication, CALDERA_VALVE protection, & cooling decrement
  const lava = new LavaCrisis();
  lava.init();
  lava.setStage(CrisisStage.OUTBREAK); // Ignites ring 1 without double-counting 4 corners
  let actualLavaHazards = 0;
  for (const h of lava.getActiveHazardTiles()) {
    if (h.type === HazardType.LAVA_SURFACE) actualLavaHazards++;
  }
  assert.equal(lava.lavaTilesCount, actualLavaHazards, 'lavaTilesCount must match exact active LAVA_SURFACE tiles without corner double-counting');

  lava.handleBombBlast(1, 2, 1); // Quench lava around (1,2) into obsidian
  let postQuenchLavaHazards = 0;
  for (const h of lava.getActiveHazardTiles()) {
    if (h.type === HazardType.LAVA_SURFACE) postQuenchLavaHazards++;
  }
  assert.equal(lava.lavaTilesCount, postQuenchLavaHazards, 'Cooling lava into obsidian must decrement lavaTilesCount');

  lava.setStage(CrisisStage.CLIMAX);
  assert.equal(lava.getHazardAt(6, 7)?.type, HazardType.CALDERA_VALVE);
  lava.currentLavaRing = 6;
  lava.lavaAdvanceTimerMs = lava.lavaAdvanceIntervalMs;
  lava.update(100);
  assert.equal(lava.getHazardAt(6, 7)?.type, HazardType.CALDERA_VALVE, 'Advancing lava must never overwrite CALDERA_VALVE');
});

test('Cycle 43.5: Resume event order preserves Crisis state, monotonic bomb IDs, cloak alpha, conveyor body sync, & GameOver reticle abort', () => {
  // 1. Verify BombermanGame.tsx emits mode-changed BEFORE resume-run-state
  const componentSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/BombermanGame.tsx'),
    'utf8'
  );
  const resumeFnStart = componentSrc.indexOf('const handleResumeRun = useCallback');
  assert.ok(resumeFnStart !== -1, 'handleResumeRun must exist in BombermanGame.tsx');
  const resumeSlice = componentSrc.slice(resumeFnStart, resumeFnStart + 650);
  const modeIdx = resumeSlice.indexOf("emit('mode-changed'");
  const stateIdx = resumeSlice.indexOf("emit('resume-run-state'");
  assert.ok(modeIdx !== -1 && stateIdx !== -1 && modeIdx < stateIdx, 'handleResumeRun must emit mode-changed BEFORE resume-run-state');

  // Verify end-to-end on GameScene event bus that mode-changed -> resume-run-state preserves Crisis state
  const { scene, gameEmitter, activeTimers, repeatingEvents } = createStatefulGameSceneHarness();
  scene.create();

  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.setStage(CrisisStage.CLIMAX);
  voidCrisis.voidCreepCount = 14;
  voidCrisis.avatarSpawned = true;
  voidCrisis.avatarHp = 2;
  const serializedCrisis = voidCrisis.serialize();

  const savedRunPayload = {
    meta: { gameMode: 'CRISIS', score: 4200, level: 2 },
    player: {
      row: 1,
      col: 1,
      stats: {
        lives: 3,
        maxBombs: 3,
        bombPower: 3,
        speed: 180,
        hasShield: false,
        cosmicEssence: 15,
        activeBombType: 'NORMAL',
        inventory: {},
      },
      equippedRelics: [],
    },
    crisis: serializedCrisis,
  };

  gameEmitter.emit('mode-changed', 'CRISIS');
  gameEmitter.emit('resume-run-state', savedRunPayload);
  const restoredCrisis = scene.crisisManager.getActiveCrisis();
  assert.ok(restoredCrisis, 'Active crisis must exist after mode-changed -> resume-run-state');
  assert.equal(restoredCrisis.id, CrisisType.PASTEL_VOID);
  assert.equal(restoredCrisis.getStage(), CrisisStage.CLIMAX);
  assert.equal(restoredCrisis.avatarHp, 2);

  // 2. Monotonic bomb IDs remain strictly unique even under frozen Date.now & Math.random
  const origNow = Date.now;
  const origRandom = Math.random;
  Date.now = () => 1700000000000;
  Math.random = () => 0.123456;
  try {
    scene.maxBombs = 5;
    scene.activeBombs = 0;
    scene.player.setPosition(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
    scene.placeBomb();
    scene.player.setPosition(3 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
    scene.placeBomb();
    const activeBombs = scene.bombs.getChildren().filter((b) => b.active);
    assert.equal(activeBombs.length, 2);
    assert.notEqual(activeBombs[0].getData('id'), activeBombs[1].getData('id'), 'Bomb IDs must never collide under identical timestamps/RNG');
  } finally {
    Date.now = origNow;
    Math.random = origRandom;
  }

  // 3. Cloaked player preserves 0.35 alpha when mastery invulnerability expires
  scene.isCloaked = true;
  scene.player.setAlpha(0.35);
  scene.grantSuperconductorDash();
  const expireTimers = activeTimers.filter((t) => !t.removed);
  for (const t of expireTimers) {
    t.callback();
  }
  assert.equal(scene.player.alpha, 0.35, 'Cloaked player must retain 0.35 alpha after mastery invulnerability expires');
  scene.isCloaked = false;

  // 4. Stationary bomb drifting on conveyor belt synchronizes Arcade body.position
  scene.conveyors = [{ row: 5, col: 5, dirX: 1, dirY: 0 }];
  scene.map[5][5] = TILE_EMPTY;
  scene.map[5][6] = TILE_EMPTY;
  for (const b of scene.bombs.getChildren()) b.disableBody(true, true);
  scene.activeBombs = 0;
  scene.player.setPosition(5 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  scene.placeBomb();
  const driftBomb = scene.bombs.getChildren().find((b) => b.active);
  const startBodyX = driftBomb.body.position.x;
  scene.update(1050, 100);
  assert.ok(driftBomb.x > 5 * TILE_SIZE + 20, 'Conveyor must drift stationary bomb');
  assert.ok(driftBomb.body.position.x > startBodyX, 'Conveyor bomb drift must synchronize Arcade body.position.x');

  // 5. renderMeteorReticle aborts cleanly without firing onImpact when scene.isGameOver is true
  const gActiveBeforeReticle = scene.graphicsPool.activeCount;
  let meteorImpacted = false;
  renderMeteorReticle(scene, 200, 200, 64, () => {
    meteorImpacted = true;
  });
  assert.equal(scene.graphicsPool.activeCount, gActiveBeforeReticle + 1);
  scene.isGameOver = true;
  for (let step = 0; step < 6; step++) {
    for (const ev of [...repeatingEvents]) {
      if (!ev.removed && typeof ev.callback === 'function') {
        ev.callback();
      }
    }
  }
  assert.equal(meteorImpacted, false, 'renderMeteorReticle must not fire onImpact after GameOver');
  assert.equal(scene.graphicsPool.activeCount, gActiveBeforeReticle, 'renderMeteorReticle must release graphics back to pool on GameOver');

  scene.shutdown();
});

test('Cycle 43.6: 10,000-frame Zero-GC soak across entity revival OverheadUI reuse, crisis resets, pathfinding, and pooled VFX', () => {
  const { scene, activeTweens } = createStatefulGameSceneHarness();
  scene.create();
  const map = createOpenArenaMap();
  const emptyMask = new FlatHazardMask(ROWS * COLS);

  const chaser = new ChaserEnemy(scene, 140, 140);
  const tank = new TankEnemy(scene, 220, 140);
  const miniBomber = new MiniBomberAlly(scene, 60, 100);
  const petDrone = new PetDroneAlly(scene, 100, 100);
  const merchant = new MerchantNPC(scene, 180, 220);
  const critter = new CritterNPC(scene, 260, 220);

  const chaserUI = chaser.overheadUI;
  const tankUI = tank.overheadUI;
  const miniUI = miniBomber.overheadUI;
  const droneUI = petDrone.overheadUI;
  const merchantUI = merchant.overheadUI;
  const critterUI = critter.overheadUI;

  const voidCrisis = new VoidCrisis();
  const clockwork = new ClockworkCrisis();
  const orbital = new OrbitalCrisis();
  const validTarget = { r: 1, c: 1 };
  const invalidStart = { r: -1, c: 99 };
  const emptyItems = [];
  const enemyList = [chaser];

  const recycleDroppedItems = () => {
    for (const it of scene.items.getChildren()) {
      if (it && it.active) {
        const sh = it.getData('itemShadow');
        if (sh && sh.active && scene.shadowPool) {
          scene.tweens.killTweensOf(sh);
          scene.shadowPool.release(sh);
          it.setData('itemShadow', null);
        }
        scene.tweens.killTweensOf(it);
        it.disableBody(true, true);
      }
    }
  };

  // JIT Warmup (500 frames)
  for (let i = 0; i < 500; i++) {
    const t = 1000 + i * 16;
    chaser.updateAI(16, t, scene.player, map, emptyMask);
    tank.updateAI(16, t, scene.player, map, emptyMask);
    miniBomber.updateAI(16, t, scene.player, map, emptyMask, () => false);
    petDrone.updateAI(16, t, scene.player, emptyItems, enemyList);
    merchant.updateAI(16, t, scene.player, map, emptyMask);
    critter.updateAI(16, t, map);
    findPathWithDemolition(invalidStart, validTarget, map, emptyMask);
    if (i % 50 === 49) {
      chaser.die(t);
      chaser.reviveAt(140, 140);
      merchant.die(t);
      recycleDroppedItems();
      merchant.reviveAt(180, 220);
      voidCrisis.reset();
      clockwork.reset();
      orbital.reset();
      scene.spawnFloatingText(200, 200, '+100', '#38bdf8');
      scene.spawnPickupParticles(200, 200, '#38bdf8');
      for (const tw of [...activeTweens]) {
        if (typeof tw.complete === 'function') tw.complete();
      }
    }
  }

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) global.gc();
  const memBefore = process.memoryUsage().heapUsed;

  const noopDropBomb = () => false;
  const FRAMES = 10000;
  for (let frame = 0; frame < FRAMES; frame++) {
    const now = 20000 + frame * 16;
    chaser.updateAI(16, now, scene.player, map, emptyMask);
    tank.updateAI(16, now, scene.player, map, emptyMask);
    miniBomber.updateAI(16, now, scene.player, map, emptyMask, noopDropBomb);
    petDrone.updateAI(16, now, scene.player, emptyItems, enemyList);
    merchant.updateAI(16, now, scene.player, map, emptyMask);
    critter.updateAI(16, now, map);
    findPathWithDemolition(invalidStart, validTarget, map, emptyMask);

    if (frame % 100 === 99) {
      chaser.overheadUI.setCustomOffsets(8, -12);
      chaser.overheadUI.setAlpha(0.25);
      chaser.overheadUI.setLODMode('minimal');
      chaser.die(now);
      chaser.reviveAt(140, 140);

      tank.die(now);
      tank.reviveAt(220, 140);
      miniBomber.die(now);
      miniBomber.reviveAt(60, 100);
      petDrone.die(now);
      petDrone.reviveAt(100, 100);
      merchant.die(now);
      recycleDroppedItems();
      merchant.reviveAt(180, 220);
      critter.die(now);
      critter.reviveAt(260, 220);

      voidCrisis.reset();
      clockwork.reset();
      orbital.reset();

      scene.spawnFloatingText(180, 180, '+200', '#fbbf24');
      scene.spawnPickupParticles(180, 180, '#fbbf24');
    }

    if (activeTweens.size > 0) {
      for (const tw of activeTweens) {
        if (typeof tw.complete === 'function') tw.complete();
      }
    }
  }

  // Verify 0 OverheadUI reallocations across 100 full entity death+revival cycles each
  assert.equal(chaser.overheadUI, chaserUI);
  assert.equal(tank.overheadUI, tankUI);
  assert.equal(miniBomber.overheadUI, miniUI);
  assert.equal(petDrone.overheadUI, droneUI);
  assert.equal(merchant.overheadUI, merchantUI);
  assert.equal(critter.overheadUI, critterUI);

  // Verify 0 leaked ephemeral pool objects during active simulation
  assert.equal(scene.circlePool.activeCount, 0, 'circlePool must have 0 leaked active arcs after 10k frames');
  assert.equal(scene.floatingTextPool.activeCount, 0, 'floatingTextPool must have 0 leaked active texts after 10k frames');

  if (isGcExposed) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  const driftMB = (memAfter - memBefore) / (1024 * 1024);
  if (isGcExposed) {
    assert.ok(driftMB < 0.75, `10k-frame soak heap drift ${driftMB.toFixed(4)} MB must be < 0.75 MB`);
  } else {
    assert.ok(driftMB < 24.0, `10k-frame ambient soak heap drift ${driftMB.toFixed(4)} MB must remain bounded within V8 young-gen`);
  }

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

  for (const entity of [chaser, tank, miniBomber, petDrone, merchant, critter]) {
    entity.destroy();
  }
  scene.shutdown();

  assert.equal(pools.shadowPool.activeCount, 0, '0 leaked shadows after shutdown');
  assert.equal(pools.circlePool.activeCount, 0, '0 leaked circles after shutdown');
  assert.equal(pools.rectPool.activeCount, 0, '0 leaked rects after shutdown');
  assert.equal(pools.graphicsPool.activeCount, 0, '0 leaked graphics after shutdown');
  assert.equal(pools.spritePool.activeCount, 0, '0 leaked sprites after shutdown');
  assert.equal(pools.floatingTextPool.activeCount, 0, '0 leaked floating texts after shutdown');
  assert.equal(pools.nameTagTextPool.activeCount, 0, '0 leaked name tags after shutdown');
  assert.equal(pools.intentBadgeTextPool.activeCount, 0, '0 leaked intent badges after shutdown');
});
