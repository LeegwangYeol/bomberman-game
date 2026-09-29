import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook for extensionless TypeScript imports in Node --experimental-strip-types
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND") {
      for (const ext of [".ts", ".js", "/index.ts"]) {
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

// Minimal DOM & Canvas mocks for headless Phaser entity instantiation
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
  };
}
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};

const {
  applyPhysicsBodyInvariantGuard,
} = await import('../src/game/entities/BaseEntity.ts');
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
  PetDroneAlly,
} = await import('../src/game/entities/AllyEntities.ts');
const {
  MerchantNPC,
} = await import('../src/game/entities/NeutralEntities.ts');
const {
  OverheadUI,
} = await import('../src/game/entities/OverheadUI.ts');
const {
  RENDER_DEPTH,
} = await import('../src/game/entities/types.ts');
const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  getBlastTiles,
} = await import('../src/game/pathfinding.ts');

function createMockScene() {
  let graphicsClearCalls = 0;
  let graphicsFillCalls = 0;

  const createGraphics = () => {
    const g = {
      depth: 0,
      visible: true,
      active: true,
      clear() {
        graphicsClearCalls++;
        return g;
      },
      fillStyle() {
        return g;
      },
      fillRect() {
        graphicsFillCalls++;
        return g;
      },
      lineStyle() {
        return g;
      },
      lineBetween() {
        return g;
      },
      setDepth(d) {
        g.depth = d;
        return g;
      },
      setAlpha() {
        return g;
      },
      setVisible(v) {
        g.visible = v;
        return g;
      },
      destroy() {
        g.active = false;
      },
    };
    return g;
  };

  const createText = (content = '') => {
    const t = {
      text: content,
      depth: 0,
      visible: true,
      active: true,
      x: 0,
      y: 0,
      setOrigin() {
        return t;
      },
      setDepth(d) {
        t.depth = d;
        return t;
      },
      setPosition(x, y) {
        t.x = x;
        t.y = y;
        return t;
      },
      setText(str) {
        t.text = str;
        return t;
      },
      setVisible(v) {
        t.visible = v;
        return t;
      },
      setAlpha() {
        return t;
      },
      destroy() {
        t.active = false;
      },
    };
    return t;
  };

  const scene = {
    sys: {
      queueDepthSort: () => {},
      anims: { on: () => {}, off: () => {}, get: () => null, create: () => {} },
      textures: { get: () => ({ get: () => ({}) }) },
    },
    add: {
      existing: (obj) => obj,
      graphics: createGraphics,
      text: (_x, _y, content) => createText(content),
      circle: (x, y, r) => ({
        x,
        y,
        r,
        setDepth() {
          return this;
        },
        destroy() {},
      }),
    },
    tweens: {
      add: (config) => {
        if (config && typeof config.onComplete === 'function') {
          // Keep mock tween clean without leaking
        }
        return { stop: () => {}, destroy: () => {} };
      },
    },
    physics: {
      add: {
        existing: (obj) => {
          if (!obj.body) {
            obj.body = {
              width: 24,
              height: 24,
              halfWidth: 12,
              halfHeight: 12,
              offset: { x: 8, y: 8 },
              position: { x: obj.x - 12, y: obj.y - 12 },
              center: { x: obj.x, y: obj.y },
              velocity: { x: 0, y: 0 },
              transform: { x: obj.x, y: obj.y, rotation: 0, scaleX: 1, scaleY: 1 },
              setSize(w, h) {
                this.width = w;
                this.height = h;
                this.halfWidth = w / 2;
                this.halfHeight = h / 2;
                return this;
              },
              setOffset(ox, oy) {
                this.offset.x = ox;
                this.offset.y = oy;
                return this;
              },
              setCollideWorldBounds() {
                return this;
              },
              setVelocity(vx, vy) {
                this.velocity.x = vx;
                this.velocity.y = vy;
                return this;
              },
              updateCenter() {
                this.center.x = this.position.x + this.halfWidth;
                this.center.y = this.position.y + this.halfHeight;
              },
              updateBounds() {
                this.updateCenter();
              },
              updateFromGameObject() {
                this.position.x = this.transform.x + this.offset.x - 20;
                this.position.y = this.transform.y + this.offset.y - 20;
                this.updateCenter();
              },
            };
          }
          return obj;
        },
      },
    },
    time: {
      now: 1000,
      delayedCall: (_delay, fn) => fn(),
    },
    getMetrics: () => ({
      graphicsClearCalls,
      graphicsFillCalls,
    }),
  };

  return scene;
}

function createArenaMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/* ==============================================================================
 * TEST 1: PHYS-REV-01 Transform Sync in Invariant Guard
 * ============================================================================== */

test('PHYS-REV-01: applyPhysicsBodyInvariantGuard maintains transform and body sync when sprite.setPosition() is called', () => {
  const scene = createMockScene();
  const sprite = {
    x: 60,
    y: 60,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    body: null,
    setPosition(newX, newY) {
      this.x = newX;
      this.y = newY;
      if (this.body) {
        this.body.updateBounds();
        this.body.updateFromGameObject();
      }
      return this;
    },
    setCollideWorldBounds() {
      return this;
    },
    setDepth() {
      return this;
    },
  };

  scene.physics.add.existing(sprite);
  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  const body = sprite.body;

  // Initial invariant verification
  assert.equal(body.width, 24);
  assert.equal(body.height, 24);
  assert.equal(body.halfWidth, 12);
  assert.equal(body.halfHeight, 12);
  assert.equal(body.transform.x, 60);
  assert.equal(body.transform.y, 60);
  assert.equal(body.center.x, 60);
  assert.equal(body.center.y, 60);

  // Direct setPosition call to (200, 200)
  sprite.setPosition(200, 200);

  // Invariant Guard MUST copy transform.x = 200, transform.y = 200 and update position/center
  assert.equal(body.transform.x, 200, 'Transform x must synchronize with sprite.x');
  assert.equal(body.transform.y, 200, 'Transform y must synchronize with sprite.y');
  assert.equal(body.position.x, 200 + (8 - 20), 'Position x must match sprite.x + fixedRelX (188)');
  assert.equal(body.position.y, 200 + (8 - 20), 'Position y must match sprite.y + fixedRelY (188)');
  assert.equal(body.center.x, 200, 'Body center.x must match sprite.x (200)');
  assert.equal(body.center.y, 200, 'Body center.y must match sprite.y (200)');

  // 1,000 rapid coordinate jumps: zero coordinate lag or freezing
  for (let i = 0; i < 1000; i++) {
    const rx = 30 + (i * 17) % 500;
    const ry = 30 + (i * 23) % 400;
    sprite.setPosition(rx, ry);

    assert.equal(body.transform.x, rx);
    assert.equal(body.transform.y, ry);
    assert.equal(body.center.x, rx);
    assert.equal(body.center.y, ry);
    assert.equal(body.width, 24);
    assert.equal(body.height, 24);
  }
});

/* ==============================================================================
 * TEST 2: AI-STUN-01 & AI-DEMOL-01 Enemy State & Stun Integrity Across All Variants
 * ============================================================================== */

test('AI-STUN-01: EnemyState enum includes STUNNED and all 6 enemy variants stop moving and cannot attack while stunned', () => {
  assert.equal(EnemyState.STUNNED, 'STUNNED', 'EnemyState must define STUNNED');

  const scene = createMockScene();
  const map = createArenaMap();
  const player = { x: 2 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true };
  const bombTiles = new Set();

  let droppedBombsCount = 0;
  const dropBombCb = () => {
    droppedBombsCount++;
    return true;
  };

  // 1. ChaserEnemy
  const chaser = new ChaserEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  chaser.isStunned = true;
  chaser.stunUntil = 5000;
  chaser.body.velocity.x = 240;
  chaser.body.velocity.y = 240;

  chaser.updateAI(16, 1000, player, map, bombTiles, dropBombCb);
  assert.equal(chaser.body.velocity.x, 0, 'Chaser velocity.x must be clamped to 0 while stunned');
  assert.equal(chaser.body.velocity.y, 0, 'Chaser velocity.y must be clamped to 0 while stunned');
  assert.equal(droppedBombsCount, 0, 'Chaser must not drop bombs while stunned');

  // Chaser external stun must NOT be cancelled when stateTimer <= 0
  for (let frame = 0; frame < 30; frame++) {
    chaser.updateAI(16, 1500, player, map, bombTiles, dropBombCb);
    assert.equal(chaser.isStunned, true, `Frame ${frame}: Chaser must remain stunned while currentTime < stunUntil`);
    assert.equal(chaser.body.velocity.x, 0);
    assert.equal(chaser.body.velocity.y, 0);
  }

  // 2. BomberEnemy
  const bomber = new BomberEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  bomber.isStunned = true;
  bomber.stunUntil = 5000;
  bomber.bombCooldownTimer = 0;
  bomber.body.velocity.x = 80;
  bomber.body.velocity.y = 80;

  bomber.updateAI(16, 1000, player, map, bombTiles, dropBombCb);
  assert.equal(bomber.body.velocity.x, 0, 'Bomber velocity.x must be clamped to 0 while stunned');
  assert.equal(bomber.body.velocity.y, 0, 'Bomber velocity.y must be clamped to 0 while stunned');
  assert.equal(droppedBombsCount, 0, 'Bomber must not drop bombs while stunned');

  // 3. TankEnemy
  let stompsTriggered = 0;
  const tank = new TankEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  tank.isStunned = true;
  tank.stunUntil = 5000;
  tank.body.velocity.x = 60;
  tank.body.velocity.y = 60;

  tank.updateAI(16, 1000, player, map, bombTiles, () => {}, () => { stompsTriggered++; });
  assert.equal(tank.body.velocity.x, 0, 'Tank velocity.x must be clamped to 0 while stunned');
  assert.equal(tank.body.velocity.y, 0, 'Tank velocity.y must be clamped to 0 while stunned');
  assert.equal(stompsTriggered, 0, 'Tank must not execute stomp slow pulse while stunned');

  // 4. GhostEnemy
  const ghost = new GhostEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  ghost.isStunned = true;
  ghost.stunUntil = 5000;
  ghost.body.velocity.x = 90;
  ghost.body.velocity.y = 90;

  ghost.updateAI(16, 1000, player, map, bombTiles);
  assert.equal(ghost.body.velocity.x, 0, 'Ghost velocity.x must be clamped to 0 while stunned');
  assert.equal(ghost.body.velocity.y, 0, 'Ghost velocity.y must be clamped to 0 while stunned');

  // 5. SplitterEnemy
  const splitter = new SplitterEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  splitter.isStunned = true;
  splitter.stunUntil = 5000;
  splitter.body.velocity.x = 75;
  splitter.body.velocity.y = 75;

  splitter.updateAI(16, 1000, player, map, bombTiles);
  assert.equal(splitter.body.velocity.x, 0, 'Splitter velocity.x must be clamped to 0 while stunned');
  assert.equal(splitter.body.velocity.y, 0, 'Splitter velocity.y must be clamped to 0 while stunned');

  // 6. MiniSplitterEnemy
  const mini = new MiniSplitterEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  mini.isStunned = true;
  mini.stunUntil = 5000;
  mini.body.velocity.x = 100;
  mini.body.velocity.y = 100;

  mini.updateAI(16, 1000, player, map, bombTiles);
  assert.equal(mini.body.velocity.x, 0, 'MiniSplitter velocity.x must be clamped to 0 while stunned');
  assert.equal(mini.body.velocity.y, 0, 'MiniSplitter velocity.y must be clamped to 0 while stunned');
});

/* ==============================================================================
 * TEST 3: AI-DEMOL-01 BomberEnemy respects canDropBombs = false
 * ============================================================================== */

test('AI-DEMOL-01: BomberEnemy strictly respects canDropBombs = false during offensive and demolition AI cycles', () => {
  const scene = createMockScene();
  const map = createArenaMap();
  map[1][2] = TILE_BLOCK; // Target soft block to demolish
  map[2][1] = TILE_EMPTY; // Escape path corridor

  const bomber = new BomberEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  bomber.canDropBombs = false;
  bomber.bombCooldownTimer = 0;
  bomber.activeBombs = 0;

  let bombsPlaced = 0;
  const dropBombCb = () => {
    bombsPlaced++;
    return true;
  };

  // 1. Offensive scenario (player is adjacent at (1, 1) to (1, 2) or (1, 3))
  const player = { x: 3 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true };
  const bombTiles = new Set();

  for (let frame = 0; frame < 10; frame++) {
    bomber.updateAI(16, 1000 + frame * 16, player, map, bombTiles, dropBombCb);
  }

  assert.equal(bombsPlaced, 0, 'BomberEnemy must place 0 bombs when canDropBombs = false');
  assert.equal(bomber.activeBombs, 0, 'activeBombs must remain 0');
  assert.notEqual(bomber.aiState, EnemyState.EVADING, 'Must not transition to EVADING state');
});

/* ==============================================================================
 * TEST 4: GhostEnemy Stops when currentPath is Empty
 * ============================================================================== */

test('AI-05: GhostEnemy resets velocity to (0,0) when currentPath is empty, preventing indefinite drifting', () => {
  const scene = createMockScene();
  const map = createArenaMap();

  const ghost = new GhostEnemy(scene, 3 * TILE_SIZE + TILE_SIZE / 2, 3 * TILE_SIZE + TILE_SIZE / 2);
  // Pre-seed non-zero velocity
  ghost.body.velocity.x = 95;
  ghost.body.velocity.y = 95;

  // Player at EXACT same tile position so findPathBFS returns empty path []
  const player = { x: 3 * TILE_SIZE + TILE_SIZE / 2, y: 3 * TILE_SIZE + TILE_SIZE / 2, active: true };
  const bombTiles = new Set();

  ghost.updateAI(16, 1000, player, map, bombTiles);

  assert.equal(ghost.body.velocity.x, 0, 'Ghost velocity.x must reset to 0 when path is empty');
  assert.equal(ghost.body.velocity.y, 0, 'Ghost velocity.y must reset to 0 when path is empty');
});

/* ==============================================================================
 * TEST 5: PHYS-REV-09 Squash/Stretch Base Scale Invariance
 * ============================================================================== */

test('PHYS-REV-09: BaseEntity respects entity base scale (baseScaleX, baseScaleY) across movement and idle cycles', () => {
  const scene = createMockScene();

  // 1. Tank: baseScale = 1.2
  const tank = new TankEnemy(scene, 100, 100);
  assert.equal(tank.baseScaleX, 1.2);
  assert.equal(tank.baseScaleY, 1.2);

  // 2. MiniSplitter: baseScale = 0.7
  const mini = new MiniSplitterEnemy(scene, 150, 150);
  assert.equal(mini.baseScaleX, 0.7);
  assert.equal(mini.baseScaleY, 0.7);

  // 3. PetDrone: baseScale = 0.75
  const drone = new PetDroneAlly(scene, 200, 200);
  assert.equal(drone.baseScaleX, 0.75);
  assert.equal(drone.baseScaleY, 0.75);

  // Simulate 100 frames of walking squash/stretch for Tank
  tank.body.velocity.x = 60;
  tank.body.velocity.y = 0;

  for (let frame = 0; frame < 100; frame++) {
    tank.updateEntity(16, 1000 + frame * 16);
    // Tank squash factors: 1.0 + 0.15 * (1 - stompNorm)
    assert.ok(tank.scaleX >= 1.2 * 0.95 && tank.scaleX <= 1.2 * 1.20, `Tank scaleX (${tank.scaleX}) must scale relative to 1.2`);
    assert.ok(tank.scaleY >= 1.2 * 0.80 && tank.scaleY <= 1.2 * 1.05, `Tank scaleY (${tank.scaleY}) must scale relative to 1.2`);
  }

  // Simulate 100 frames of idle breathing for MiniSplitter
  mini.body.velocity.x = 0;
  mini.body.velocity.y = 0;

  for (let frame = 0; frame < 100; frame++) {
    mini.updateEntity(16, 1000 + frame * 16);
    // MiniSplitter idle factor: 1.0 +- breathe
    assert.ok(mini.scaleX >= 0.7 * 0.97 && mini.scaleX <= 0.7 * 1.03, `MiniSplitter scaleX (${mini.scaleX}) must scale relative to 0.7`);
    assert.ok(mini.scaleY >= 0.7 * 0.97 && mini.scaleY <= 0.7 * 1.03, `MiniSplitter scaleY (${mini.scaleY}) must scale relative to 0.7`);
  }
});

/* ==============================================================================
 * TEST 6: UI-DEPTH & OverheadUI Initial Depth & Redraw Cache
 * ============================================================================== */

test('UI-DEPTH & UI-PERF-01: OverheadUI initializes with RENDER_DEPTH and guards renderHpBar against redundant clearing', () => {
  const scene = createMockScene();
  const ui = new OverheadUI(scene, 'Test Entity', 'enemy', 3, 24);

  // Initial depth checks
  assert.equal(ui.hpGraphics.depth, RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_HP_BAR); // 100.2
  assert.equal(ui.nameTag.depth, RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_NAME_TAG); // 100.3
  assert.equal(ui.indicator.depth, RENDER_DEPTH.ENTITY_Y_BASE + RENDER_DEPTH.OFFSET_INTENT_BADGE); // 100.4

  const metricsBefore = scene.getMetrics();
  const initialClearCount = metricsBefore.graphicsClearCalls;
  const initialFillCount = metricsBefore.graphicsFillCalls;

  // Frame 1: render at (100, 100) with 3 HP
  ui.update(100, 100, 3);
  const metricsFrame1 = scene.getMetrics();
  assert.equal(metricsFrame1.graphicsClearCalls, initialClearCount + 1, 'First render must clear once');
  assert.ok(metricsFrame1.graphicsFillCalls > initialFillCount, 'First render must draw bar');

  const afterFrame1Clear = metricsFrame1.graphicsClearCalls;
  const afterFrame1Fill = metricsFrame1.graphicsFillCalls;

  // Next 100 frames at same position (100, 100) and same 3 HP: Redundant redraw MUST be skipped!
  for (let f = 0; f < 100; f++) {
    ui.update(100, 100, 3);
  }

  const metricsAfter100 = scene.getMetrics();
  assert.equal(metricsAfter100.graphicsClearCalls, afterFrame1Clear, 'Redundant updates must NOT call clear()');
  assert.equal(metricsAfter100.graphicsFillCalls, afterFrame1Fill, 'Redundant updates must NOT call fillRect()');

  // Changing HP from 3 to 2 must trigger exactly one redraw
  ui.update(100, 100, 2);
  const metricsAfterDamage = scene.getMetrics();
  assert.equal(metricsAfterDamage.graphicsClearCalls, afterFrame1Clear + 1, 'Damage must trigger redraw');
  assert.ok(metricsAfterDamage.graphicsFillCalls > afterFrame1Fill, 'Damage must fill updated bar');
});

/* ==============================================================================
 * TEST 7: AI-ALLY-01 PetDrone Tractor Beam Physics Coordination
 * ============================================================================== */

test('AI-ALLY-01: PetDroneAlly tractor beam coordinates pull velocity and position with target item body', () => {
  const scene = createMockScene();
  const drone = new PetDroneAlly(scene, 100, 100);
  const player = { x: 50, y: 50, active: true };

  const item = {
    x: 120,
    y: 120,
    active: true,
    body: {
      velocity: { x: 0, y: 0 },
      position: { x: 108, y: 108 },
      halfWidth: 12,
      halfHeight: 12,
      setVelocity(vx, vy) {
        this.velocity.x = vx;
        this.velocity.y = vy;
      },
    },
    getData: () => null,
  };

  const initialItemX = item.x;
  const initialItemY = item.y;

  drone.updateAI(16, 1000, player, [item], []);

  // Tractor beam should pull toward player (from 120,120 toward 50,50)
  assert.ok(item.x < initialItemX, 'Item.x must be pulled closer to player');
  assert.ok(item.y < initialItemY, 'Item.y must be pulled closer to player');
  assert.ok(item.body.velocity.x < 0, 'Item body velocity.x must point toward player');
  assert.ok(item.body.velocity.y < 0, 'Item body velocity.y must point toward player');
  assert.equal(item.body.position.x, item.x - 12, 'Body position.x must coordinate with item.x');
  assert.equal(item.body.position.y, item.y - 12, 'Body position.y must coordinate with item.y');
});

/* ==============================================================================
 * TEST 8: AI-ALLY-01 MerchantNPC Escape & Wander Blast Hazard Avoidance
 * ============================================================================== */

test('AI-ALLY-01: MerchantNPC avoids re-entering active blast tiles during wander and escape pathing', () => {
  const scene = createMockScene();
  const map = createArenaMap();

  // Create Merchant at (1, 1)
  const merchant = new MerchantNPC(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);

  // Active bomb at (1, 3) with blast affecting (1, 1), (1, 2), (1, 3), (1, 4), (1, 5)
  const dangerTiles = getBlastTiles({ r: 1, c: 3 }, 2, map);
  assert.ok(dangerTiles.has('1,1'));
  assert.ok(dangerTiles.has('1,2'));
  assert.ok(dangerTiles.has('1,3'));

  const bombTiles = new Set(['1,3']);

  // Update AI: Merchant detects danger and escapes southward into (2, 1) -> (3, 1) which are outside dangerTiles
  merchant.updateAI(16, 1000, null, map, bombTiles);

  // Merchant must transition to fleeing and set intent
  assert.equal(merchant.overheadUI.intentGlyph, '😱');
  // Velocity must move south away from blast line
  assert.ok(merchant.body.velocity.y > 0, 'Merchant must flee downward away from horizontal blast');
});
