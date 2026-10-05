import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
EventEmitter.defaultMaxListeners = 500;
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// 1. ESM Loader hook for seamless TypeScript module imports without extension
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

// 2. Headless DOM & Canvas Context Mocks for Phaser Environment
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

const GameSceneModule = await import('../../src/game/GameScene.ts');
const GameScene = GameSceneModule.default || GameSceneModule.GameScene;



/**
 * Creates a headless mock environment for GameScene lifecycle testing.
 */
function createMockGameScene() {
  const scene = new GameScene();

  const gameEmitter = new EventEmitter();
  const sceneEmitter = new EventEmitter();
  gameEmitter.setMaxListeners(500);
  sceneEmitter.setMaxListeners(500);

  scene.game = {
    events: gameEmitter,
  };

  scene.events = sceneEmitter;

  scene.sys = {
    queueDepthSort: () => {},
    displayList: {
      add: () => {},
      remove: () => {},
      queueDepthSort: () => {},
    },
    updateList: {
      add: () => {},
      remove: () => {},
    },
    events: sceneEmitter,
    game: scene.game,
    settings: { data: {} },
    scale: { on: () => {}, removeListener: () => {} },
  };

  // Mock Phaser Clock
  const activeTimers = new Set();
  scene.time = {
    now: 1000,
    delayedCall: (delayMs, callback) => {
      const timer = { delayMs, callback };
      activeTimers.add(timer);
      return timer;
    },
    removeAllEvents: () => {
      activeTimers.clear();
    },
    get activeTimerCount() {
      return activeTimers.size;
    },
  };

  // Mock Phaser Tweens
  let activeTweenCount = 0;
  scene.tweens = {
    add: () => {
      activeTweenCount++;
      return {};
    },
    killAll: () => {
      activeTweenCount = 0;
    },
    get activeCount() {
      return activeTweenCount;
    },
  };

  const createChainableMock = (extra = {}) => {
    const target = {
      x: 0,
      y: 0,
      active: true,
      alpha: 1,
      depth: 0,
      visible: true,
      destroy: () => {},
      ...extra,
    };
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (prop in t) {
          const val = t[prop];
          if (typeof val === 'function') {
            return (...args) => {
              const res = val.apply(receiver, args);
              return res === undefined ? receiver : res;
            };
          }
          return val;
        }
        return (...args) => receiver;
      },
    });
  };

  const mockGameObject = () => {
    const body = {
      setSize: () => body,
      setOffset: () => body,
      velocity: { x: 0, y: 0 },
      reset: () => {},
      immovable: false,
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      right: 24,
      bottom: 24,
    };
    return createChainableMock({
      body: new Proxy(body, {
        get(t, prop) {
          if (prop in t) return t[prop];
          return (...args) => t;
        },
      }),
    });
  };

  const createMockGroup = () => {
    const children = [];
    return {
      create: () => {
        const obj = mockGameObject();
        children.push(obj);
        return obj;
      },
      add: (obj) => children.push(obj),
      getChildren: () => children,
      clear: () => { children.length = 0; },
      remove: () => {},
    };
  };

  // Mock Physics World
  scene.physics = {
    world: {
      isPaused: false,
      resume: () => {
        scene.physics.world.isPaused = false;
      },
      pause: () => {
        scene.physics.world.isPaused = true;
      },
      setBounds: () => {},
    },
    add: {
      group: createMockGroup,
      staticGroup: createMockGroup,
      sprite: () => mockGameObject(),
      existing: (obj) => {
        if (!obj.body) {
          obj.body = new Proxy({
            setSize: () => {},
            setOffset: () => {},
            velocity: { x: 0, y: 0 },
            reset: () => {},
            x: 0,
            y: 0,
            width: 24,
            height: 24,
            right: 24,
            bottom: 24,
          }, {
            get(t, prop) {
              if (prop in t) return t[prop];
              return (...args) => t;
            },
          });
        }
        return obj;
      },
      collider: () => {},
      overlap: () => {},
    },
  };

  scene.add = {
    image: () => createChainableMock(),
    graphics: () => createChainableMock(),
    sprite: () => mockGameObject(),
    particles: () => createChainableMock(),
    text: () => createChainableMock(),
    rectangle: () => createChainableMock(),
    circle: () => createChainableMock(),
    container: () => createChainableMock(),
    existing: (obj) => obj,
  };

  const animsEmitter = new EventEmitter();
  scene.anims = {
    exists: () => true,
    create: () => {},
    generateFrameNumbers: () => [],
    on: (evt, cb) => animsEmitter.on(evt, cb),
    off: (evt, cb) => animsEmitter.off(evt, cb),
    once: (evt, cb) => animsEmitter.once(evt, cb),
    emit: (evt, ...args) => animsEmitter.emit(evt, ...args),
    removeListener: (evt, cb) => animsEmitter.removeListener(evt, cb),
  };
  scene.sys.anims = scene.anims;

  scene.input = {
    keyboard: {
      on: () => {},
      createCursorKeys: () => ({ up: {}, down: {}, left: {}, right: {} }),
      addKeys: () => ({}),
      addKey: () => ({ isDown: false, reset: () => {} }),
    },
    on: () => {},
  };

  scene.sound = {
    play: () => {},
    stop: () => {},
  };

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
  };
  scene.sys.textures = scene.textures;

  return { scene, gameEmitter, sceneEmitter };
}

/* ==============================================================================
 * TEST 1: EVENT LISTENER LEAK PREVENTION & DEDUPLICATION ON RESTART
 * ============================================================================== */

test('Lifecycle Audit: GameScene.shutdown() unregisters all listeners from game.events without residual leaks', () => {
  const { scene, gameEmitter } = createMockGameScene();

  // Initial event attachment
  scene.create();

  assert.equal(gameEmitter.listenerCount('mode-changed'), 1, 'mode-changed must have 1 listener after create');
  assert.equal(gameEmitter.listenerCount('perks-updated'), 1, 'perks-updated must have 1 listener after create');
  assert.equal(gameEmitter.listenerCount('relics-updated'), 1, 'relics-updated must have 1 listener after create');
  assert.equal(gameEmitter.listenerCount('resume-run-state'), 1, 'resume-run-state must have 1 listener after create');

  // Shutdown
  scene.shutdown();

  assert.equal(gameEmitter.listenerCount('mode-changed'), 0, 'mode-changed must have 0 listeners after shutdown');
  assert.equal(gameEmitter.listenerCount('perks-updated'), 0, 'perks-updated must have 0 listeners after shutdown');
  assert.equal(gameEmitter.listenerCount('relics-updated'), 0, 'relics-updated must have 0 listeners after shutdown');
  assert.equal(gameEmitter.listenerCount('resume-run-state'), 0, 'resume-run-state must have 0 listeners after shutdown');
});

test('Lifecycle Audit: 50 consecutive scene restart cycles maintain exactly 1 listener on game.events (0 leak)', () => {
  const { scene, gameEmitter } = createMockGameScene();

  for (let cycle = 0; cycle < 50; cycle++) {
    scene.create();
    assert.equal(gameEmitter.listenerCount('mode-changed'), 1, `Cycle ${cycle}: mode-changed must never exceed 1 listener`);
    assert.equal(gameEmitter.listenerCount('perks-updated'), 1, `Cycle ${cycle}: perks-updated must never exceed 1 listener`);
    assert.equal(gameEmitter.listenerCount('relics-updated'), 1, `Cycle ${cycle}: relics-updated must never exceed 1 listener`);
    assert.equal(gameEmitter.listenerCount('resume-run-state'), 1, `Cycle ${cycle}: resume-run-state must never exceed 1 listener`);

    scene.shutdown();
    assert.equal(gameEmitter.listenerCount('mode-changed'), 0, `Cycle ${cycle}: mode-changed must be 0 after shutdown`);
  }
});

/* ==============================================================================
 * TEST 2: TIMER & TWEEN TEARDOWN (CLOSURE RETENTION PROTECTION)
 * ============================================================================== */

test('Lifecycle Audit: scene.shutdown() cleans up all pending delayedCall timers and active tweens', () => {
  const { scene } = createMockGameScene();
  scene.create();

  // Schedule multiple delayedCalls (bomb fuse, hitStop, invulnerability)
  scene.time.delayedCall(2000, () => {});
  scene.time.delayedCall(3000, () => {});
  scene.time.delayedCall(5000, () => {});
  scene.tweens.add();
  scene.tweens.add();

  assert.equal(scene.time.activeTimerCount, 3, 'Must have 3 active timers before shutdown');
  assert.equal(scene.tweens.activeCount, 3, 'Must have 3 active tweens (1 portal rotation + 2 manual) before shutdown');

  // Shutdown must cancel all timers and kill tweens to eliminate closure retention
  scene.shutdown();

  assert.equal(scene.time.activeTimerCount, 0, 'All timers must be cleared on shutdown');
  assert.equal(scene.tweens.activeCount, 0, 'All tweens must be killed on shutdown');
});

/* ==============================================================================
 * TEST 3: HAZARD AUDIO RE-ACQUISITION ON SCENE RESTART
 * ============================================================================== */

test('Lifecycle Audit: Hazard audio instances are valid and operational across consecutive restarts', () => {
  const { scene } = createMockGameScene();

  // Run 5 restart cycles
  for (let cycle = 0; cycle < 5; cycle++) {
    scene.create();

    // Verify all hazard audio properties exist and point to valid instances
    assert.ok(scene.frostHazardAudio, `Cycle ${cycle}: frostHazardAudio must be defined`);
    assert.ok(scene.voltHazardAudio, `Cycle ${cycle}: voltHazardAudio must be defined`);
    assert.ok(scene.magmaHazardAudio, `Cycle ${cycle}: magmaHazardAudio must be defined`);
    assert.ok(scene.miasmaHazardAudio, `Cycle ${cycle}: miasmaHazardAudio must be defined`);

    // Verify methods can be called without exception
    assert.doesNotThrow(() => {
      scene.frostHazardAudio.playFrostChill(1000);
      scene.voltHazardAudio.playHighVoltageHum(1000);
      scene.magmaHazardAudio.playMagmaUpwellingSizzle();
      scene.miasmaHazardAudio.playSporeSurge();
    }, `Cycle ${cycle}: Audio methods must be callable post-restart`);

    scene.shutdown();
  }
});

/* ==============================================================================
 * TEST 4: UNBOUNDED MAP & SET GROWTH AUDIT ACROSS RAPID MODE CHANGES & COMBAT
 * ============================================================================== */

test('Lifecycle Audit: bossHitBombIds and destroyedBlocksThisTick Sets remain bounded across combat and restarts', () => {
  const { scene } = createMockGameScene();
  scene.create();

  // Add 100 hit IDs to bossHitBombIds
  for (let i = 0; i < 100; i++) {
    scene.bossHitBombIds.add(`bomb_${i}`);
    scene.destroyedBlocksThisTick.add(`1_${i}`);
  }

  assert.equal(scene.bossHitBombIds.size, 100);
  assert.equal(scene.destroyedBlocksThisTick.size, 100);

  // Dismissing boss clears bossHitBombIds immediately
  scene.dismissBoss();
  assert.equal(scene.bossHitBombIds.size, 0, 'bossHitBombIds must be 0 after dismissBoss');

  // Add more IDs and verify shutdown clears all
  scene.bossHitBombIds.add('bomb_new');
  scene.shutdown();
  assert.equal(scene.bossHitBombIds.size, 0, 'bossHitBombIds must be 0 after shutdown');
  assert.equal(scene.destroyedBlocksThisTick.size, 0, 'destroyedBlocksThisTick must not accumulate');
});

test('Lifecycle Audit: 100 rapid mode changes (Boss Rush -> Crisis Survival -> Normal) produce 0 Map/Set leak', () => {
  const { scene, gameEmitter } = createMockGameScene();
  scene.create();

  const modes = ['boss_rush', 'crisis_survival', 'standard', 'endless'];

  for (let i = 0; i < 100; i++) {
    const mode = modes[i % modes.length];
    gameEmitter.emit('mode-changed', mode);

    assert.ok(scene.bossHitBombIds.size <= 32, 'bossHitBombIds must remain strictly bounded');
    assert.equal(scene.destroyedBlocksThisTick.size, 0, 'destroyedBlocksThisTick must not accumulate');
  }

  scene.shutdown();
  assert.equal(scene.bossHitBombIds.size, 0);
  assert.equal(scene.destroyedBlocksThisTick.size, 0);
});
