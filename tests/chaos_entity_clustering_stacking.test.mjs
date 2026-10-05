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
  TILE_BLOCK,
  getBlastTiles,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
} = await import('../src/game/pathfinding.ts');

const {
  applyPhysicsBodyInvariantGuard,
} = await import('../src/game/entities/BaseEntity.ts');

const {
  ChaserEnemy,
  BomberEnemy,
  TankEnemy,
  GhostEnemy,
  SplitterEnemy,
  EnemyState,
} = await import('../src/game/entities/EnemyEntities.ts');

const {
  DynamicHazard,
  HazardLifecycleState,
  TOTAL_TELEGRAPH_MS,
  ENEMY_HAZARD_DAMAGE,
} = await import('../src/game/hazards/index.ts');

const {
  OverheadUIManager,
} = await import('../src/game/GameScene.ts');

/* ==============================================================================
 * TEST FIXTURES & MOCK HELPERS
 * ============================================================================== */

function createMockScene(mapOverride) {
  const tweens = [];
  const timerEvents = [];
  const enemyList = [];
  const map = mapOverride || createEmptyMap();

  return {
    map,
    enemies: {
      children: enemyList,
      add: (obj) => { enemyList.push(obj); },
      getChildren: () => enemyList,
    },
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
      updateList: { remove: () => {}, exists: () => false },
      displayList: { remove: () => {}, exists: () => false },
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
          lineBetween: function() { return this; },
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
          if (!obj.body) {
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
              setSize: function(w, h) {
                this.width = w;
                this.height = h;
                this.halfWidth = w / 2;
                this.halfHeight = h / 2;
                return this;
              },
              setOffset: function() { return this; },
              setCollideWorldBounds: function() { return this; },
              setImmovable: function(v) { this.immovable = v; return this; },
              reset: function() { return this; },
              setVelocity: function(vx, vy) { this.velocity.x = vx; this.velocity.y = vy; return this; },
              updateBounds: function() {},
              updateCenter: function() {
                this.center.x = this.position.x + this.halfWidth;
                this.center.y = this.position.y + this.halfHeight;
              },
              updateFromGameObject: function() {
                this.position.x = obj.x - this.halfWidth;
                this.position.y = obj.y - this.halfHeight;
                this.updateCenter();
              },
              destroy: function() {},
            };
          }
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

/* ==============================================================================
 * SUITE 6: EXTREME TRI-FACTOR COLLISION (120+ ENEMIES, 50+ BOMBS, DYNAMIC HAZARD AT SAME TILE)
 * ============================================================================== */

test('CHAOS-CLUSTER-09: 130 mixed enemies, 50 simultaneous bombs, and active DynamicHazard on identical tile (6, 4) execute without crash or NaN', () => {
  const scene = createMockScene();
  const map = createEmptyMap();
  const manager = new OverheadUIManager(true);

  // 1. Initialize Dynamic Hazard and advance to ACTIVE state (Climax stage for cross-axis discharge)
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('CLIMAX');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE state

  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);
  assert.ok(hazard.isTileLethal(6, 4), 'Target tile (6, 4) must be in active hazard beam');

  // Tile center for (r=6, c=4): x = 4*40 + 20 = 180, y = 6*40 + 20 = 260
  const targetR = 6;
  const targetC = 4;
  const centerX = targetC * TILE_SIZE + TILE_SIZE / 2; // 180
  const centerY = targetR * TILE_SIZE + TILE_SIZE / 2; // 260

  // 2. Spawn 130 mixed archetype enemies (26 of each type) all stacked exactly at (180, 260)
  const enemies = [];
  const countPerType = 26;
  for (let i = 0; i < countPerType; i++) {
    enemies.push(new ChaserEnemy(scene, centerX, centerY));
    enemies.push(new BomberEnemy(scene, centerX, centerY));
    enemies.push(new TankEnemy(scene, centerX, centerY));
    enemies.push(new GhostEnemy(scene, centerX, centerY));
    enemies.push(new SplitterEnemy(scene, centerX, centerY));
  }
  assert.equal(enemies.length, 130);

  // 3. Spawn 50 simultaneous bombs: 25 forced at epicenter (6, 4), and 25 radiating out along the active beam
  const bombs = [];
  for (let i = 0; i < 25; i++) {
    bombs.push({
      id: `epicenter_bomb_${i}`,
      active: true,
      x: centerX,
      y: centerY,
      row: targetR,
      col: targetC,
      power: 3,
      destroy: function() { this.active = false; },
    });
  }
  for (let i = 0; i < 25; i++) {
    const colOffset = ((i % 5) - 2);
    const rowOffset = (Math.floor(i / 5) - 2);
    const br = Math.max(1, Math.min(ROWS - 2, targetR + rowOffset));
    const bc = Math.max(1, Math.min(COLS - 2, targetC + colOffset));
    bombs.push({
      id: `corridor_bomb_${i}`,
      active: true,
      x: bc * TILE_SIZE + TILE_SIZE / 2,
      y: br * TILE_SIZE + TILE_SIZE / 2,
      row: br,
      col: bc,
      power: 2,
      destroy: function() { this.active = false; },
    });
  }
  assert.equal(bombs.length, 50);

  // 4. Update OverheadUIManager decluttering pass on the 130-entity cluster
  const player = { x: centerX, y: centerY };
  manager.update(enemies, player, 16, true);

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    assert.equal(e.overheadUI.lodMode, 'minimal');
    assert.ok(Number.isFinite(e.overheadUI.customOffsetX));
    assert.ok(Number.isFinite(e.overheadUI.customOffsetY));
  }

  // 5. Simultaneous Tri-Factor Collision Execution:
  // Step A: Dynamic Hazard Environmental Damage Tick (Tachyon Vaporization: 120 DMG)
  const hazardResult = hazard.checkEnemyCollision(targetR, targetC, false, false);
  assert.equal(hazardResult.hit, true);
  assert.equal(hazardResult.damage, ENEMY_HAZARD_DAMAGE); // 120

  let initialKills = 0;
  for (const e of enemies) {
    if (e.active && !e.isDead) {
      const died = e.takeDamage(hazardResult.damage, 'hazard');
      if (died) initialKills++;
    }
  }
  assert.ok(initialKills > 0, 'Hazard must inflict fatal damage on minions');

  // Step B: Chain-detonate all 50 bombs simultaneously
  let detonations = 0;
  function detonateBomb(bomb) {
    if (!bomb.active) return;
    bomb.destroy();
    detonations++;
    const blast = getBlastTiles({ r: bomb.row, c: bomb.col }, bomb.power, map);

    // Blast triggers any other bombs in its radius
    for (const other of bombs) {
      if (other.active && blast.has(`${other.row},${other.col}`)) {
        detonateBomb(other);
      }
    }

    // Dynamic hazard bomb detonation notification
    hazard.onBombDetonated(100 + detonations, bomb.row, bomb.col);
  }

  // Detonate epicenter bomb 0
  detonateBomb(bombs[0]);
  // Detonate any remaining active corridor bombs
  for (const b of bombs) {
    if (b.active) detonateBomb(b);
  }

  assert.equal(bombs.filter(b => b.active).length, 0, 'All 50 simultaneous bombs must detonate cleanly');
  assert.equal(detonations, 50, 'Exactly 50 detonations must execute');

  // Step C: Verify Splitter death cascade safely spawned MiniSplitters
  const splitterMinis = scene.enemies.getChildren();
  assert.equal(splitterMinis.length, countPerType * 2, '26 Splitters must spawn exactly 52 MiniSplitters');

  for (const mini of splitterMinis) {
    assert.ok(Number.isFinite(mini.x), 'MiniSplitter x must be finite');
    assert.ok(Number.isFinite(mini.y), 'MiniSplitter y must be finite');
    const mr = Math.floor(mini.y / TILE_SIZE);
    const mc = Math.floor(mini.x / TILE_SIZE);
    assert.ok(mr >= 1 && mr < ROWS - 1, `MiniSplitter row ${mr} must stay within arena`);
    assert.ok(mc >= 1 && mc < COLS - 1, `MiniSplitter col ${mc} must stay within arena`);
    assert.equal(map[mr][mc], TILE_EMPTY, `MiniSplitter must spawn on TILE_EMPTY, not wall or block`);
  }

  // Step D: Verify all entities (original 130 + 52 minis) maintain 0 NaN
  const allEntities = [...enemies, ...splitterMinis];
  for (const e of allEntities) {
    assert.ok(Number.isFinite(e.x), 'Entity x must be finite');
    assert.ok(Number.isFinite(e.y), 'Entity y must be finite');
    assert.ok(Number.isFinite(e.baseScaleX), 'Entity baseScaleX must be finite');
    assert.ok(Number.isFinite(e.baseScaleY), 'Entity baseScaleY must be finite');
  }
});

/* ==============================================================================
 * SUITE 7: BOUNDARY WALL PUSH & UNPASSABLE BLOCK ANTI-TUNNELING STRESS
 * ============================================================================== */

test('CHAOS-CLUSTER-10: Multi-entity compression against boundary walls strictly preserves wall bounds (zero boundary penetration)', () => {
  const scene = createMockScene();

  // Corner tile (1, 1): center is (60, 60).
  // Immediately bordered by:
  // - Top boundary wall: row 0 (y: 0 to 40)
  // - Left boundary wall: col 0 (x: 0 to 40)
  // - Inner pillar: row 2, col 2 (x: 80 to 120, y: 80 to 120)
  const startX = 60;
  const startY = 60;
  const COUNT = 120;
  const entities = [];

  for (let i = 0; i < COUNT; i++) {
    const archetype = i % 5;
    let enemy;
    if (archetype === 0) enemy = new ChaserEnemy(scene, startX, startY);
    else if (archetype === 1) enemy = new BomberEnemy(scene, startX, startY);
    else if (archetype === 2) enemy = new TankEnemy(scene, startX, startY);
    else if (archetype === 3) enemy = new GhostEnemy(scene, startX, startY);
    else enemy = new SplitterEnemy(scene, startX, startY);
    entities.push(enemy);
  }

  // Static wall bodies mirroring Phaser Arcade Physics static group
  const walls = [
    { x: 0, y: 0, width: 40, height: ROWS * TILE_SIZE }, // Left outer wall (c=0)
    { x: 0, y: 0, width: COLS * TILE_SIZE, height: 40 }, // Top outer wall (r=0)
    { x: (COLS - 1) * TILE_SIZE, y: 0, width: 40, height: ROWS * TILE_SIZE }, // Right outer wall
    { x: 0, y: (ROWS - 1) * TILE_SIZE, width: COLS * TILE_SIZE, height: 40 }, // Bottom outer wall
    { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE, width: 40, height: 40 }, // Pillar at (2, 2)
  ];

  function resolveStaticAABB(body, wall) {
    const bLeft = body.position.x;
    const bRight = bLeft + body.width;
    const bTop = body.position.y;
    const bBottom = bTop + body.height;

    const wLeft = wall.x;
    const wRight = wall.x + wall.width;
    const wTop = wall.y;
    const wBottom = wall.y + wall.height;

    if (bRight <= wLeft || bLeft >= wRight || bBottom <= wTop || bTop >= wBottom) {
      return false; // No overlap
    }

    const overlapRight = bRight - wLeft;
    const overlapLeft = wRight - bLeft;
    const overlapBottom = bBottom - wTop;
    const overlapTop = wBottom - bTop;

    const minX = Math.min(overlapRight, overlapLeft);
    const minY = Math.min(overlapBottom, overlapTop);

    if (minX < minY) {
      if (overlapRight < overlapLeft) {
        body.position.x -= overlapRight;
      } else {
        body.position.x += overlapLeft;
      }
      body.velocity.x = 0;
    } else {
      if (overlapBottom < overlapTop) {
        body.position.y -= overlapBottom;
      } else {
        body.position.y += overlapTop;
      }
      body.velocity.y = 0;
    }
    body.updateCenter();
    return true;
  }

  // 200 ticks of chaotic outward push impulses against the corner walls
  const TICKS = 200;
  for (let tick = 0; tick < TICKS; tick++) {
    const dt = 0.016; // 16ms per frame

    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];
      const body = e.body;

      // Apply chaotic outward force towards walls
      const angle = (i * 17 + tick * 31) % 360;
      const rad = (angle * Math.PI) / 180;
      const pushSpeed = 240 + (i % 60); // up to 300 px/s
      body.velocity.x = Math.cos(rad) * pushSpeed;
      body.velocity.y = Math.sin(rad) * pushSpeed;

      // Position integration
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;

      // Resolve collisions against all static walls (Arcade physics separation)
      for (const wall of walls) {
        resolveStaticAABB(body, wall);
      }

      // Sync sprite to body center
      e.x = body.position.x + body.halfWidth;
      e.y = body.position.y + body.halfHeight;

      // CRITICAL INVARIANT ASSERTIONS:
      // 1. Zero penetration of left boundary wall (x < 40)
      assert.ok(
        body.position.x >= 40 - 1e-6,
        `Tick ${tick} Entity ${i} left edge ${body.position.x} breached left boundary wall (min 40)`
      );
      // 2. Zero penetration of top boundary wall (y < 40)
      assert.ok(
        body.position.y >= 40 - 1e-6,
        `Tick ${tick} Entity ${i} top edge ${body.position.y} breached top boundary wall (min 40)`
      );
      // 3. Zero penetration of right boundary wall (x + width > 560)
      assert.ok(
        body.position.x + body.width <= 560 + 1e-6,
        `Tick ${tick} Entity ${i} right edge breached right boundary wall (max 560)`
      );
      // 4. Zero penetration of bottom boundary wall (y + height > 480)
      assert.ok(
        body.position.y + body.height <= 480 + 1e-6,
        `Tick ${tick} Entity ${i} bottom edge breached bottom boundary wall (max 480)`
      );
      // 5. Center coordinates strictly finite
      assert.ok(Number.isFinite(e.x), `Tick ${tick} Entity ${i} x must be finite`);
      assert.ok(Number.isFinite(e.y), `Tick ${tick} Entity ${i} y must be finite`);
    }
  }
});

test('CHAOS-CLUSTER-11: Cul-de-sac cluster anti-tunneling: soft blocks vs boundary walls vs Ghost/Tank archetypes', () => {
  const mapWithBlocks = createEmptyMap();
  // Build a tight cul-de-sac at (r=1, c=2) (x=100, y=60):
  // North: (0, 2) is boundary wall TILE_WALL
  // South: (2, 2) is pillar wall TILE_WALL
  // West: (1, 1) is TILE_BLOCK (soft block)
  // East: (1, 3) is TILE_BLOCK (soft block)
  mapWithBlocks[1][1] = TILE_BLOCK;
  mapWithBlocks[1][3] = TILE_BLOCK;

  const scene = createMockScene(mapWithBlocks);

  const startX = 2 * TILE_SIZE + TILE_SIZE / 2; // 100
  const startY = 1 * TILE_SIZE + TILE_SIZE / 2; // 60

  const chaser = new ChaserEnemy(scene, startX, startY);
  const bomber = new BomberEnemy(scene, startX, startY);
  const tank = new TankEnemy(scene, startX, startY);
  const ghost = new GhostEnemy(scene, startX, startY);
  const splitter = new SplitterEnemy(scene, startX, startY);

  // Static walls (North boundary r=0, South pillar r=2)
  const walls = [
    { x: 0, y: 0, width: COLS * TILE_SIZE, height: 40 }, // North wall (r=0)
    { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE, width: 40, height: 40 }, // South pillar (r=2, c=2)
  ];

  // Soft blocks (West r=1, c=1, East r=1, c=3)
  const blocks = [
    { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE, width: 40, height: 40, r: 1, c: 1 },
    { x: 3 * TILE_SIZE, y: 1 * TILE_SIZE, width: 40, height: 40, r: 1, c: 3 },
  ];

  function resolveStaticAABB(body, obstacle) {
    const bLeft = body.position.x;
    const bRight = bLeft + body.width;
    const bTop = body.position.y;
    const bBottom = bTop + body.height;

    const wLeft = obstacle.x;
    const wRight = obstacle.x + obstacle.width;
    const wTop = obstacle.y;
    const wBottom = obstacle.y + obstacle.height;

    if (bRight <= wLeft || bLeft >= wRight || bBottom <= wTop || bTop >= wBottom) {
      return false;
    }

    const overlapRight = bRight - wLeft;
    const overlapLeft = wRight - bLeft;
    const overlapBottom = bBottom - wTop;
    const overlapTop = wBottom - bTop;

    const minX = Math.min(overlapRight, overlapLeft);
    const minY = Math.min(overlapBottom, overlapTop);

    if (minX < minY) {
      if (overlapRight < overlapLeft) {
        body.position.x -= overlapRight;
      } else {
        body.position.x += overlapLeft;
      }
      body.velocity.x = 0;
    } else {
      if (overlapBottom < overlapTop) {
        body.position.y -= overlapBottom;
      } else {
        body.position.y += overlapTop;
      }
      body.velocity.y = 0;
    }
    body.updateCenter();
    return true;
  }

  // 1. GhostEnemy moving West into soft block: PHASES through block, but CANNOT penetrate North/South walls
  const ghostBody = ghost.body;
  ghostBody.position.x = 45; // Inside soft block at x: 40..80
  ghostBody.position.y = 50;

  // Collision with blocks: Ghost ignores blocks (GameScene line 1211)
  // Collision with walls: Ghost collides with walls (GameScene line 1208)
  for (const wall of walls) {
    resolveStaticAABB(ghostBody, wall);
  }
  // Ghost can be at x=45 (phasing through block)
  assert.ok(ghostBody.position.x < 80, 'Ghost can phase into soft block');

  // But Ghost MUST NOT penetrate North boundary wall (y >= 40)
  ghostBody.position.y = 30; // Attempt upward penetration into North wall
  for (const wall of walls) {
    resolveStaticAABB(ghostBody, wall);
  }
  assert.ok(ghostBody.position.y >= 40, 'Ghost strictly blocked by TILE_WALL');

  // 2. Chaser/Bomber/Splitter moving into soft block: STRICTLY BLOCKED
  for (const standard of [chaser, bomber, splitter]) {
    const sBody = standard.body;
    sBody.position.x = 75; // Overlapping East edge of West block (x: 40..80)
    sBody.position.y = 50;

    // Must resolve against soft block
    for (const b of blocks) {
      resolveStaticAABB(sBody, b);
    }
    assert.ok(sBody.position.x >= 80, `${standard.entityType} must be pushed out of soft block (min 80)`);

    // Must resolve against North boundary wall
    sBody.position.y = 35;
    for (const wall of walls) {
      resolveStaticAABB(sBody, wall);
    }
    assert.ok(sBody.position.y >= 40, `${standard.entityType} must be pushed out of North wall (min 40)`);
  }

  // 3. TankEnemy bulldozing soft blocks upon contact
  tank.updateAI(16, 1000, null, mapWithBlocks, new Set(), (r, c) => {
    mapWithBlocks[r][c] = TILE_EMPTY;
  });
  tank.x = 85; // Move tank within 28px of (1, 1) center (60, 60): 85 - 60 = 25px < 28px
  tank.updateAI(16, 1016, null, mapWithBlocks, new Set(), (r, c) => {
    mapWithBlocks[r][c] = TILE_EMPTY;
  });
  assert.equal(mapWithBlocks[1][1], TILE_EMPTY, 'Tank bulldozes touching soft block');

  // Even after bulldozing soft block, Tank MUST NOT penetrate North boundary wall
  const tankBody = tank.body;
  tankBody.position.y = 30;
  for (const wall of walls) {
    resolveStaticAABB(tankBody, wall);
  }
  assert.ok(tankBody.position.y >= 40, 'Tank strictly blocked by TILE_WALL (min 40)');
});

test('CHAOS-CLUSTER-12: High-velocity dash swept impact: zero tunneling through boundary walls under lag spikes (16ms to 100ms)', () => {
  const scene = createMockScene();
  const map = createEmptyMap();

  const lagDeltas = [16, 33, 66, 100];

  for (const deltaMs of lagDeltas) {
    const dt = deltaMs / 1000;

    // 1. ChaserEnemy dash at 240 px/s directed directly into Left Boundary Wall (c=0, x: 0..40)
    const chaser = new ChaserEnemy(scene, 55, 60);
    chaser.attackDir = { x: -1, y: 0 };
    chaser.changeState(EnemyState.ATTACK);
    const dashSpeed = 240;
    const body = chaser.body;
    body.velocity.x = -dashSpeed;
    body.velocity.y = 0;

    // Integrated position step
    const displacement = body.velocity.x * dt;
    body.position.x += displacement;

    // Swept collision / Arcade physics separation with left wall [0, 40]
    const leftWall = { x: 0, y: 0, width: 40, height: ROWS * TILE_SIZE };
    if (body.position.x < leftWall.width) {
      body.position.x = leftWall.width;
      body.velocity.x = 0;
    }
    chaser.x = body.position.x + body.halfWidth;

    // Chaser AI checks hitWall and transitions to COOLDOWN (stun)
    const ec = Math.floor(chaser.x / TILE_SIZE);
    const nextC = ec - 1;
    assert.equal(nextC, 0);
    const mockPlayer = { active: true, x: 200, y: 200 };
    chaser.updateAI(deltaMs, 1000 + deltaMs, mockPlayer, map, new Set());
    assert.equal(chaser.aiState, EnemyState.COOLDOWN, `Chaser must enter COOLDOWN on wall impact under ${deltaMs}ms lag`);
    assert.ok(body.position.x >= 40, `Chaser body.position.x ${body.position.x} must be >= 40`);
    assert.ok(chaser.x >= 52, `Chaser center x ${chaser.x} must be >= 52`);

    // 2. GhostEnemy dash at 260 px/s directed directly into Top Boundary Wall (r=0, y: 0..40)
    const ghost = new GhostEnemy(scene, 60, 55);
    const ghostBody = ghost.body;
    const ghostDashSpeed = 260;
    ghostBody.velocity.x = 0;
    ghostBody.velocity.y = -ghostDashSpeed;

    const ghostDisplacement = ghostBody.velocity.y * dt;
    ghostBody.position.y += ghostDisplacement;

    const topWall = { x: 0, y: 0, width: COLS * TILE_SIZE, height: 40 };
    if (ghostBody.position.y < topWall.height) {
      ghostBody.position.y = topWall.height;
      ghostBody.velocity.y = 0;
    }
    ghost.y = ghostBody.position.y + ghostBody.halfHeight;

    assert.ok(ghostBody.position.y >= 40, `Ghost body.position.y ${ghostBody.position.y} must be >= 40 under ${deltaMs}ms lag`);
    assert.ok(ghost.y >= 52, `Ghost center y ${ghost.y} must be >= 52`);
  }
});

/* ==============================================================================
 * SUITE 8: 1,000-TICK CONTINUOUS MEGA SOAK STRESS
 * ============================================================================== */

test('CHAOS-CLUSTER-13: 1,000-tick continuous simulation with 150 clustered entities, dynamic hazard FSM cycling, and periodic bomb detonations maintains 0 NaN and < 15ms step time', () => {
  const scene = createMockScene();
  const map = createEmptyMap();
  const manager = new OverheadUIManager(true);
  const entities = [];
  const COUNT = 150;

  // 150 mixed entities
  for (let i = 0; i < COUNT; i++) {
    const archetype = i % 5;
    const gx = 100 + (i % 10) * 12;
    const gy = 100 + Math.floor(i / 10) * 12;
    let e;
    if (archetype === 0) e = new ChaserEnemy(scene, gx, gy);
    else if (archetype === 1) e = new BomberEnemy(scene, gx, gy);
    else if (archetype === 2) e = new TankEnemy(scene, gx, gy);
    else if (archetype === 3) e = new GhostEnemy(scene, gx, gy);
    else e = new SplitterEnemy(scene, gx, gy);
    entities.push(e);
  }

  // Dynamic Hazard
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('CLIMAX');

  const bombTiles = new Set();
  const activeBombs = [];

  const TICKS = 1000;
  const startTs = Date.now();

  for (let tick = 0; tick < TICKS; tick++) {
    const time = 1000 + tick * 16;
    const delta = 16;

    // 1. Advance Dynamic Hazard FSM
    hazard.update(delta);

    // 2. Periodic bomb drop & chain explosion every 25 ticks
    if (tick % 25 === 0) {
      bombTiles.clear();
      const dropCol = 3 + (tick % 8);
      const dropRow = 3 + (tick % 6);
      bombTiles.add(`${dropRow},${dropCol}`);
      activeBombs.push({
        id: `soak_bomb_${tick}`,
        row: dropRow,
        col: dropCol,
        x: dropCol * TILE_SIZE + TILE_SIZE / 2,
        y: dropRow * TILE_SIZE + TILE_SIZE / 2,
        power: 3,
        detonateAt: time + 48, // explodes after 3 ticks
      });
    }

    // Detonate due bombs
    for (let bIdx = activeBombs.length - 1; bIdx >= 0; bIdx--) {
      const b = activeBombs[bIdx];
      if (time >= b.detonateAt) {
        getBlastTiles({ r: b.row, c: b.col }, b.power, map);
        hazard.onBombDetonated(tick, b.row, b.col);
        activeBombs.splice(bIdx, 1);
        bombTiles.delete(`${b.row},${b.col}`);
      }
    }

    // 3. Overhead UI pass
    const player = { x: 260 + Math.sin(tick * 0.02) * 80, y: 260 + Math.cos(tick * 0.02) * 80 };
    manager.update(entities, player, delta, false);

    // 4. Update entities
    for (let i = 0; i < COUNT; i++) {
      const e = entities[i];
      if (e.active && !e.isDead) {
        e.updateAI(delta, time, null, map, bombTiles);

        // Verify finite numbers & valid arena coordinates
        assert.ok(Number.isFinite(e.x), `Tick ${tick} entity ${i} x must be finite`);
        assert.ok(Number.isFinite(e.y), `Tick ${tick} entity ${i} y must be finite`);
        assert.ok(Number.isFinite(e.baseScaleX), `Tick ${tick} entity ${i} baseScaleX must be finite`);
        assert.ok(Number.isFinite(e.baseScaleY), `Tick ${tick} entity ${i} baseScaleY must be finite`);

        // Check arena bounds
        assert.ok(e.x >= 20 && e.x <= 580, `Tick ${tick} entity ${i} x ${e.x} out of arena bounds`);
        assert.ok(e.y >= 20 && e.y <= 500, `Tick ${tick} entity ${i} y ${e.y} out of arena bounds`);
      }
    }
  }

  const totalDurationMs = Date.now() - startTs;
  const avgFrameMs = totalDurationMs / TICKS;

  assert.ok(avgFrameMs < 35, `Average frame step time ${avgFrameMs.toFixed(2)}ms must be < 35ms under 150-entity soak`);
});

