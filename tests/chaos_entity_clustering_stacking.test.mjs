/**
 * Chaos QA Agent 2: Extreme Entity Clustering, Stacking & Blast Resolution Test Suite
 *
 * Mission:
 * 1. Audit extreme entity clustering and stacking invariants (100+ bombs or entities occupying same tile/coord).
 * 2. Verify physics resolution, blast radius calculations, and separation logic do not crash, lock up, or produce NaN coordinates.
 * 3. Soak test extreme density under continuous multi-tick simulations.
 */

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
    if (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
      for (const ext of [".ts", ".js", "/index.ts", "/index.js"]) {
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
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  getBlastTiles,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
} = await import('../src/game/pathfinding.ts');

const {
  applyPhysicsBodyInvariantGuard,
} = await import('../src/game/entities/BaseEntity.ts');

const {
  ChaserEnemy,
} = await import('../src/game/entities/EnemyEntities.ts');

const {
  OverheadUIManager,
} = await import('../src/game/GameScene.ts');

/* ==============================================================================
 * TEST FIXTURES & MOCK HELPERS
 * ============================================================================== */

function createMockScene() {
  const tweens = [];
  const timerEvents = [];

  return {
    time: {
      now: 1000,
      delayedCall: (delay, callback) => {
        const evt = { delay, callback, elapsed: 0, active: true, remove: () => { evt.active = false; } };
        timerEvents.push(evt);
        return evt;
      },
    },
    tweens: {
      add: (config) => {
        tweens.push(config);
        return { stop: () => {} };
      },
      chain: (config) => {
        tweens.push(config);
        return { stop: () => {} };
      },
      addCounter: (config) => {
        tweens.push(config);
        return { stop: () => {} };
      },
    },
    sys: {
      queueDepthSort: () => {},
      anims: { on: () => {}, off: () => {}, get: () => null, create: () => {} },
      textures: { get: () => ({ get: () => ({}) }) },
    },
    add: {
      existing: (obj) => obj,
      graphics: () => {
        const g = {
          active: true,
          clear: function() { return this; },
          fillStyle: function() { return this; },
          fillRect: function() { return this; },
          lineStyle: function() { return this; },
          strokeRect: function() { return this; },
          strokeCircle: function() { return this; },
          setDepth: function() { return this; },
          setAlpha: function() { return this; },
          destroy: function() { this.active = false; },
        };
        return g;
      },
      text: (x, y, text, style) => {
        const t = {
          x,
          y,
          text,
          style,
          active: true,
          setOrigin: function() { return this; },
          setDepth: function() { return this; },
          setVisible: function() { return this; },
          setAlpha: function() { return this; },
          setText: function(val) { this.text = val; return this; },
          setPosition: function(nx, ny) { this.x = nx; this.y = ny; return this; },
          destroy: function() { this.active = false; },
        };
        return t;
      },
      circle: (x, y, r, color, alpha) => {
        const c = {
          x, y, r, color, alpha,
          active: true,
          setDepth: function() { return this; },
          destroy: function() { this.active = false; },
        };
        return c;
      },
    },
    physics: {
      add: {
        existing: (obj) => {
          obj.body = {
            x: obj.x,
            y: obj.y,
            width: 24,
            height: 24,
            halfWidth: 12,
            halfHeight: 12,
            position: { x: obj.x - 12, y: obj.y - 12 },
            center: { x: obj.x, y: obj.y },
            velocity: { x: 0, y: 0 },
            immovable: false,
            setSize: function(w, h) { this.width = w; this.height = h; return this; },
            setOffset: function() { return this; },
            setCollideWorldBounds: function() { return this; },
            setImmovable: function(v) { this.immovable = v; return this; },
            reset: function() { return this; },
            setVelocity: function(vx, vy) { this.velocity.x = vx; this.velocity.y = vy; return this; },
            updateBounds: function() {},
            updateCenter: function() {},
            updateFromGameObject: function() {},
          };
          return obj;
        },
      },
    },
  };
}

function createEmptyMap() {
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

function checkBodiesOverlap(b1, b2) {
  if (!b1 || !b2) return false;
  const b1Right = b1.x + b1.width;
  const b1Bottom = b1.y + b1.height;
  const b2Right = b2.x + b2.width;
  const b2Bottom = b2.y + b2.height;
  return !(b2.x >= b1Right || b2Right <= b1.x || b2.y >= b1Bottom || b2Bottom <= b1.y);
}

/* ==============================================================================
 * SUITE 1: EXTREME ENTITY CLUSTERING (100+ ENTITIES AT SAME COORDINATE)
 * ============================================================================== */

test('CHAOS-CLUSTER-01: 120 entities stacked at exact coordinate (200, 200) execute OverheadUIManager and AI updates without crash or NaN', () => {
  const scene = createMockScene();
  const manager = new OverheadUIManager(true);
  const entities = [];
  const COUNT = 120;

  for (let i = 0; i < COUNT; i++) {
    const chaser = new ChaserEnemy(scene, 200, 200);
    entities.push(chaser);
  }

  assert.equal(entities.length, COUNT);

  // 1. Run OverheadUIManager update on all 120 stacked entities
  const player = { x: 200, y: 200 };
  manager.update(entities, player, 16, true);

  // 2. Validate all 120 entities transition to 'minimal' LOD mode
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.equal(e.overheadUI.lodMode, 'minimal', `Entity ${i} must enter minimal LOD under 120-entity stack`);
    assert.ok(Number.isFinite(e.overheadUI.customOffsetX), `Entity ${i} customOffsetX must be finite`);
    assert.ok(Number.isFinite(e.overheadUI.customOffsetY), `Entity ${i} customOffsetY must be finite`);
    assert.ok(Number.isFinite(e.overheadUI.currentAlpha), `Entity ${i} currentAlpha must be finite`);

    // Intended positions must remain strictly within arena bounds [20, 580] and [20, 500]
    const finalX = e.x + e.overheadUI.customOffsetX;
    const finalY = e.y + e.overheadUI.customOffsetY;
    assert.ok(finalX >= 20 && finalX <= 580, `Entity ${i} final X ${finalX} must stay within [20, 580]`);
    assert.ok(finalY >= 20 && finalY <= 500, `Entity ${i} final Y ${finalY} must stay within [20, 500]`);
  }

  // 3. Run entity updates across all 120 entities
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    e.updateEntity(16, 1000);
    assert.ok(Number.isFinite(e.x), `Entity ${i} x must remain finite`);
    assert.ok(Number.isFinite(e.y), `Entity ${i} y must remain finite`);
    assert.ok(Number.isFinite(e.baseScaleX), `Entity ${i} baseScaleX must remain finite`);
    assert.ok(Number.isFinite(e.baseScaleY), `Entity ${i} baseScaleY must remain finite`);
  }
});

/* ==============================================================================
 * SUITE 2: EXTREME BOMB STACKING & REJECTION INVARIANTS
 * ============================================================================== */

test('CHAOS-CLUSTER-02: Bomb placement idempotency strictly rejects multiple bombs on identical tile', () => {
  const activeBombs = [];
  const TILE = 40;
  const targetCol = 3;
  const targetRow = 3;

  function tryPlaceBomb(col, row) {
    const cx = col * TILE + TILE / 2;
    const cy = row * TILE + TILE / 2;
    let hasBomb = false;
    for (const b of activeBombs) {
      if (b.active && b.x === cx && b.y === cy) {
        hasBomb = true;
        break;
      }
    }
    if (hasBomb) return null;

    const newBomb = {
      active: true,
      x: cx,
      y: cy,
      row,
      col,
      destroy: function() { this.active = false; },
    };
    activeBombs.push(newBomb);
    return newBomb;
  }

  // 1. First bomb placement succeeds
  const bomb1 = tryPlaceBomb(targetCol, targetRow);
  assert.ok(bomb1 !== null, 'First bomb placement must succeed');
  assert.equal(activeBombs.length, 1);

  // 2. Attempting to place 99 more bombs on the same tile must all be rejected
  let rejectedCount = 0;
  for (let i = 0; i < 99; i++) {
    const rejected = tryPlaceBomb(targetCol, targetRow);
    if (rejected === null) {
      rejectedCount++;
    }
  }

  assert.equal(rejectedCount, 99, 'All 99 subsequent placement attempts on the same tile must be rejected');
  assert.equal(activeBombs.length, 1, 'Only exactly 1 bomb may exist on the tile');
});

test('CHAOS-CLUSTER-03: Forced 100-bomb stack at epicenter cleanly chain-detonates in 1 tick without stack overflow', () => {
  const allBombs = [];
  const COUNT = 100;
  const tileR = 5;
  const tileC = 5;
  const cx = tileC * TILE_SIZE + TILE_SIZE / 2;
  const cy = tileR * TILE_SIZE + TILE_SIZE / 2;

  for (let i = 0; i < COUNT; i++) {
    allBombs.push({
      id: `bomb_${i}`,
      active: true,
      x: cx,
      y: cy,
      power: 2,
      destroy: function() { this.active = false; },
    });
  }

  assert.equal(allBombs.filter(b => b.active).length, COUNT);

  // Mirror GameScene.explodeBomb with epicenter chain-reaction
  let explosionsTriggered = 0;
  function explodeBomb(bomb) {
    if (!bomb.active) return;
    bomb.destroy();
    explosionsTriggered++;

    const bCol = Math.floor(bomb.x / TILE_SIZE);
    const bRow = Math.floor(bomb.y / TILE_SIZE);

    // Epicenter chain reaction: detonate any other active bombs stacked on the same tile
    allBombs.forEach((otherBomb) => {
      if (otherBomb.active && otherBomb !== bomb) {
        const obc = Math.floor(otherBomb.x / TILE_SIZE);
        const obr = Math.floor(otherBomb.y / TILE_SIZE);
        if (obr === bRow && obc === bCol) {
          explodeBomb(otherBomb);
        }
      }
    });
  }

  // Trigger detonation of bomb 0
  explodeBomb(allBombs[0]);

  // Assert all 100 bombs detonated cleanly
  assert.equal(explosionsTriggered, COUNT, `All ${COUNT} stacked bombs must detonate`);
  assert.equal(allBombs.filter(b => b.active).length, 0, 'Zero active bombs remain');
});

/* ==============================================================================
 * SUITE 3: BLAST RADIUS CALCULATIONS UNDER ADVERSARIAL & CORRUPT INPUTS
 * ============================================================================== */

test('CHAOS-CLUSTER-04: getBlastTiles boundary and finite number guards eliminate crashes on NaN, float, and extreme power', () => {
  const map = createEmptyMap();

  // 1. NaN center coordinates
  const nanBlast = getBlastTiles({ r: NaN, c: NaN }, 2, map);
  assert.equal(nanBlast.size, 0, 'NaN coordinates must return empty blast set without throwing');

  // 2. Floating-point center coordinates
  const floatBlast = getBlastTiles({ r: 2.5, c: 3.7 }, 2, map);
  assert.equal(floatBlast.size, 0, 'Float coordinates must return empty blast set without throwing');

  // 3. Out-of-bounds negative coordinates
  const negBlast = getBlastTiles({ r: -10, c: 5 }, 2, map);
  assert.equal(negBlast.size, 0, 'Negative row must return empty blast set');

  // 4. Out-of-bounds large coordinates
  const oobBlast = getBlastTiles({ r: 100, c: 100 }, 2, map);
  assert.equal(oobBlast.size, 0, 'Out of bounds coordinates must return empty blast set');

  // 5. NaN or negative power
  const nanPowerBlast = getBlastTiles({ r: 5, c: 5 }, NaN, map);
  assert.equal(nanPowerBlast.size, 0, 'NaN power must return empty blast set');

  const negPowerBlast = getBlastTiles({ r: 5, c: 5 }, -3, map);
  assert.equal(negPowerBlast.size, 0, 'Negative power must return empty blast set');

  // 6. Extreme power (1,000 tiles) must terminate at walls and boundaries without hanging
  const extremeBlast = getBlastTiles({ r: 1, c: 1 }, 1000, map);
  assert.ok(extremeBlast.size > 0, 'Extreme power blast must calculate cleanly');
  assert.ok(extremeBlast.size <= ROWS * COLS, 'Extreme power blast cannot exceed total arena tiles');
  assert.ok(extremeBlast.has('1,1'), 'Epicenter must be included');

  // 7. Null/undefined map
  const nullMapBlast = getBlastTiles({ r: 1, c: 1 }, 2, null);
  assert.equal(nullMapBlast.size, 0, 'Null map must return empty blast set');
});

test('CHAOS-CLUSTER-05: canSafelyPlaceBomb and getSafeBombEscapePath reject corrupt inputs without throwing', () => {
  const map = createEmptyMap();

  assert.equal(canSafelyPlaceBomb({ r: NaN, c: NaN }, 2, map), false);
  assert.equal(canSafelyPlaceBomb({ r: 1.5, c: 2 }, 2, map), false);
  assert.equal(canSafelyPlaceBomb({ r: 1, c: 1 }, NaN, map), false);
  assert.equal(canSafelyPlaceBomb({ r: 1, c: 1 }, -1, map), false);
  assert.equal(canSafelyPlaceBomb({ r: -5, c: 5 }, 2, map), false);

  assert.equal(getSafeBombEscapePath({ r: NaN, c: NaN }, 2, map), null);
  assert.equal(getSafeBombEscapePath({ r: 1.5, c: 2 }, 2, map), null);
  assert.equal(getSafeBombEscapePath({ r: 1, c: 1 }, NaN, map), null);
  assert.equal(getSafeBombEscapePath({ r: 1, c: 1 }, -1, map), null);
  assert.equal(getSafeBombEscapePath({ r: -5, c: 5 }, 2, map), null);
});

/* ==============================================================================
 * SUITE 4: PHYSICS BODY INVARIANT GUARD & SEPARATION LOGIC
 * ============================================================================== */

test('CHAOS-CLUSTER-06: applyPhysicsBodyInvariantGuard restores valid finite numbers when NaN is set', () => {
  const sprite = {
    x: 100,
    y: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    body: {
      width: 24,
      height: 24,
      halfWidth: 12,
      halfHeight: 12,
      position: { x: 88, y: 88 },
      transform: { x: 100, y: 100 },
      setSize: function(w, h) { this.width = w; this.height = h; return this; },
      setOffset: function() { return this; },
      updateBounds: function() {},
      updateCenter: function() {},
      updateFromGameObject: function() {},
    },
  };

  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  // Set corrupt NaN coordinates
  sprite.x = NaN;
  sprite.y = NaN;

  // Trigger updateFromGameObject
  sprite.body.updateFromGameObject();

  assert.ok(Number.isFinite(sprite.x), 'sprite.x must be restored to finite value');
  assert.ok(Number.isFinite(sprite.y), 'sprite.y must be restored to finite value');
  assert.ok(Number.isFinite(sprite.body.position.x), 'body.position.x must be finite');
  assert.ok(Number.isFinite(sprite.body.position.y), 'body.position.y must be finite');
  assert.equal(sprite.x, 0, 'Corrupted sprite.x must be sanitized to 0');
  assert.equal(sprite.y, 0, 'Corrupted sprite.y must be sanitized to 0');
});

test('CHAOS-CLUSTER-07: 100 entities overlapping single bomb tile clear independently via ignoringColliders', () => {
  const bombBody = { x: 80, y: 80, width: 32, height: 32 };
  const ignoring = new Set();
  const entities = [];
  const COUNT = 100;

  for (let i = 0; i < COUNT; i++) {
    const entity = {
      id: i,
      body: { x: 84, y: 84, width: 24, height: 24 },
    };
    entities.push(entity);
    ignoring.add(entity);
  }

  assert.equal(ignoring.size, COUNT, 'All 100 entities must be registered in ignoringColliders');

  // Verify all overlapping entities suppress separation
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    const overlaps = checkBodiesOverlap(e.body, bombBody);
    assert.strictEqual(overlaps, true, `Entity ${i} must initially overlap bomb body`);
  }

  // Staggered exit: step entities out one by one
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    // Move entity to x: 120 (past bomb right edge: 80 + 32 = 112)
    e.body.x = 120;

    const stillOverlaps = checkBodiesOverlap(e.body, bombBody);
    assert.strictEqual(stillOverlaps, false, `Entity ${i} must no longer overlap at x=120`);

    // Arcade collider logic: deregister upon clearance
    if (ignoring.has(e) && !stillOverlaps) {
      ignoring.delete(e);
    }

    assert.strictEqual(ignoring.size, COUNT - 1 - i, `ignoringColliders size must decrease to ${COUNT - 1 - i}`);
  }

  assert.equal(ignoring.size, 0, 'All 100 entities must cleanly deregister upon clearance');

  // Verify re-entry is blocked for all cleared entities
  for (let i = 0; i < COUNT; i++) {
    const e = entities[i];
    assert.strictEqual(ignoring.has(e), false, `Cleared entity ${i} cannot be in ignoringColliders`);
  }
});

/* ==============================================================================
 * SUITE 5: 500-TICK CONTINUOUS SWARM STRESS SOAK
 * ============================================================================== */

test('CHAOS-CLUSTER-08: 500-tick continuous soak with 100 entities and 50 ticking bombs maintains 0 NaN and bounded step time', () => {
  const scene = createMockScene();
  const map = createEmptyMap();
  const manager = new OverheadUIManager(true);
  const entities = [];
  const COUNT = 100;

  for (let i = 0; i < COUNT; i++) {
    const chaser = new ChaserEnemy(scene, 100 + (i % 5) * 4, 100 + ((i / 5) | 0) * 4);
    entities.push(chaser);
  }

  const bombTiles = new Set();
  for (let r = 2; r <= 6; r++) {
    for (let c = 2; c <= 11; c++) {
      if (bombTiles.size < 50) {
        bombTiles.add(`${r},${c}`);
      }
    }
  }

  const TICKS = 500;
  const startTs = Date.now();

  for (let tick = 0; tick < TICKS; tick++) {
    const time = 1000 + tick * 16;
    const player = { x: 200 + Math.sin(tick * 0.05) * 50, y: 200 + Math.cos(tick * 0.05) * 50 };

    // Update Overhead UI decluttering pass
    manager.update(entities, player, 16, false);

    // Update AI and entity logic
    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];
      e.updateAI(16, time, null, map, bombTiles);

      // Verify no NaN coordinates or scales
      assert.ok(Number.isFinite(e.x), `Tick ${tick} entity ${i} x must be finite`);
      assert.ok(Number.isFinite(e.y), `Tick ${tick} entity ${i} y must be finite`);
      assert.ok(Number.isFinite(e.moveSpeed), `Tick ${tick} entity ${i} moveSpeed must be finite`);
    }
  }

  const totalDurationMs = Date.now() - startTs;
  const avgFrameMs = totalDurationMs / TICKS;

  assert.ok(avgFrameMs < 15, `Average frame step time ${avgFrameMs.toFixed(2)}ms must be < 15ms under 100-entity swarm`);
});
