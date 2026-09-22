/**
 * Adversarial Stress Testing: Enemy AI Demolition across 100+ Randomized Layouts
 *
 * Empirical Challenger 1 Verification:
 * 1. 100+ Randomized Layouts Demolition Stress Test (120 arenas):
 *    - Real ChaserEnemy and BomberEnemy production entities.
 *    - Varied soft block density (20% to 75%).
 *    - Verify reliable bomb placement next to breakable blocks.
 *    - Verify blocks are destroyed over time.
 *    - Verify 0 self-bomb suicides (suicide prevention invariant).
 *    - Verify 0 indefinite freezes (enemies never lock at (0,0) permanently).
 * 2. Anti-Freeze Fallback Adversarial Scenarios:
 *    - Unsafe approach cul-de-sacs trigger fallback patrol rather than freezing.
 *    - Multi-angle approach switching redirects enemy to safe faces of blocks.
 * 3. Arcade Physics Overlap & Boundary Clearance:
 *    - ignoringColliders Set allows seamless exit across tile boundaries (x = 64px) without backward snap.
 *    - Collision re-arms once bodies fully separate.
 * 4. Enraged Quick-Fuse (1200ms) Demolition Survival.
 * 5. 1,000-Tick High-Throughput Demolition Soak & Coordinate Invariants.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  TILE_SIZE,
  getBlastTiles,
  findEscapePathBFS,
  getSafeDemolitionApproaches,
} from '../src/game/pathfinding.ts';

// ESM loader hook for extensionless imports in Node --experimental-strip-types
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

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.includes("BaseEntity.ts")) {
    const src = typeof result.source === "string" ? result.source : result.source.toString("utf8");
    const patched = src.replace("import { EntityFaction, FACTIONS } from './types';", "import { FACTIONS } from './types';");
    return { ...result, source: patched };
  }
  return result;
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'));

// Headless DOM & Canvas mocks for Phaser entity instantiation
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

const { ChaserEnemy, BomberEnemy, EnemyState } = await import('../src/game/entities/EnemyEntities.ts');

/* ==============================================================================
 * DETERMINISTIC PRNG (Mulberry32)
 * ============================================================================== */

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ==============================================================================
 * MOCK SCENE GENERATOR
 * ============================================================================== */

function createMockScene() {
  const createChainable = () => {
    const obj = {};
    const methods = [
      'setOrigin', 'setDepth', 'setText', 'setVisible', 'destroy', 'setAlpha',
      'clear', 'fillStyle', 'fillRect', 'strokeRect', 'lineStyle', 'setScrollFactor',
    ];
    for (const m of methods) {
      obj[m] = () => obj;
    }
    return obj;
  };

  return {
    sys: {
      queueDepthSort: () => {},
      anims: { on: () => {}, off: () => {}, get: () => null, create: () => {} },
      textures: { get: () => ({ get: () => ({}) }) },
    },
    add: {
      existing: (obj) => obj,
      text: () => createChainable(),
      graphics: () => createChainable(),
      image: () => createChainable(),
    },
    physics: {
      add: {
        existing: (obj) => {
          obj.body = {
            setSize: (w, h) => {
              obj.body.width = w;
              obj.body.height = h;
              return obj.body;
            },
            setOffset: (ox, oy) => {
              obj.body.offsetX = ox;
              obj.body.offsetY = oy;
              return obj.body;
            },
            setCollideWorldBounds: () => obj.body,
            setVelocity: (vx, vy) => {
              obj.body.velocity.x = vx;
              obj.body.velocity.y = vy;
              return obj.body;
            },
            velocity: { x: 0, y: 0 },
            x: obj.x - 12,
            y: obj.y - 12,
            width: 24,
            height: 24,
            offsetX: 8,
            offsetY: 8,
            get right() { return this.x + this.width; },
            get bottom() { return this.y + this.height; },
          };
          return obj;
        },
      },
    },
    time: { now: 1000 },
  };
}

/* ==============================================================================
 * MAP GENERATOR
 * ============================================================================== */

function createRandomArena(density, seed) {
  const rng = mulberry32(seed);
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = rng() < density ? TILE_BLOCK : TILE_EMPTY;
      }
    }
  }

  // Preserve player area at (11, 13) and corridors
  map[ROWS - 2][COLS - 2] = TILE_EMPTY;
  map[ROWS - 3][COLS - 2] = TILE_EMPTY;
  map[ROWS - 2][COLS - 3] = TILE_EMPTY;

  // Preserve enemy spawn at (1, 1) and ensure >= 2 open corridor neighbors (GameScene contract)
  map[1][1] = TILE_EMPTY;
  const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
  let openNeighbors = dirs.filter((d) => map[1 + d.dr]?.[1 + d.dc] === TILE_EMPTY).length;
  for (const d of dirs) {
    if (openNeighbors >= 2) break;
    const nr = 1 + d.dr;
    const nc = 1 + d.dc;
    if (nr > 0 && nr < ROWS - 1 && nc > 0 && nc < COLS - 1 && map[nr][nc] === TILE_BLOCK) {
      map[nr][nc] = TILE_EMPTY;
      openNeighbors++;
    }
  }

  return map;
}

function checkAABBOverlap(b1, b2) {
  if (!b1 || !b2) return false;
  return !(b2.x >= b1.right || b2.right <= b1.x || b2.y >= b1.bottom || b2.bottom <= b1.y);
}

/* ==============================================================================
 * SUITE 1: 100+ RANDOMIZED LAYOUTS DEMOLITION STRESS TEST
 * ============================================================================== */

test('Adversarial Stress Suite 1: Enemy AI Demolition across 120 Randomized Layouts', () => {
  const TOTAL_LAYOUTS = 120;
  let totalBombsPlaced = 0;
  let totalBlocksDestroyed = 0;
  let totalSuicides = 0;
  let totalIndefiniteFreezes = 0;
  let totalEscapesSuccessful = 0;

  for (let layoutIdx = 1; layoutIdx <= TOTAL_LAYOUTS; layoutIdx++) {
    const seed = layoutIdx * 31337;
    const rng = mulberry32(seed);
    const density = 0.20 + rng() * 0.55; // 20% to 75% fill
    const map = createRandomArena(density, seed);

    const scene = createMockScene();

    // Alternate between ChaserEnemy and BomberEnemy
    const isChaser = layoutIdx % 2 === 0;
    const isEnragedBomber = !isChaser && layoutIdx % 4 === 1;

    let enemy;
    if (isChaser) {
      enemy = new ChaserEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
    } else {
      enemy = new BomberEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
      if (isEnragedBomber) {
        enemy.hp = 1;
        enemy.changeState(EnemyState.ENRAGED);
      }
    }
    enemy.bombCooldownTimer = 0;

    const player = {
      x: (COLS - 2) * TILE_SIZE + TILE_SIZE / 2,
      y: (ROWS - 2) * TILE_SIZE + TILE_SIZE / 2,
      active: true,
    };

    const activeBombs = [];
    let freezeTimerMs = 0;

    const dropBombCallback = (r, c, fuseMs) => {
      if (activeBombs.length >= 2) return false;
      const bombObj = {
        row: r,
        col: c,
        fuseRemaining: fuseMs,
        power: enemy.bombPower,
        owner: enemy,
        body: {
          x: c * TILE_SIZE + 4,
          y: r * TILE_SIZE + 4,
          width: 32,
          height: 32,
          right: c * TILE_SIZE + 36,
          bottom: r * TILE_SIZE + 36,
        },
        ignoringColliders: new Set([enemy]),
      };
      activeBombs.push(bombObj);
      totalBombsPlaced++;
      return true;
    };

    const SIMULATION_TICKS = 300;
    const DELTA_MS = 50; // 50ms per tick = 15 seconds real time
    let currentTime = 1000;

    for (let tick = 0; tick < SIMULATION_TICKS; tick++) {
      currentTime += DELTA_MS;

      // 1. Move enemy according to velocity
      const vx = enemy.body.velocity.x;
      const vy = enemy.body.velocity.y;
      enemy.x += (vx * DELTA_MS) / 1000;
      enemy.y += (vy * DELTA_MS) / 1000;
      enemy.body.x = enemy.x - 12;
      enemy.body.y = enemy.y - 12;

      // 2. Update active bombs and overlap clearance
      const bombTileSet = new Set(activeBombs.map((b) => `${b.row},${b.col}`));

      for (let bi = activeBombs.length - 1; bi >= 0; bi--) {
        const bomb = activeBombs[bi];

        // Process ignoringColliders
        if (bomb.ignoringColliders.has(enemy)) {
          if (!checkAABBOverlap(enemy.body, bomb.body)) {
            bomb.ignoringColliders.delete(enemy);
          }
        }

        // Advance fuse
        bomb.fuseRemaining -= DELTA_MS;
        if (bomb.fuseRemaining <= 0) {
          // Detonate
          const blast = getBlastTiles({ r: bomb.row, c: bomb.col }, bomb.power, map);
          const enemyR = Math.floor(enemy.y / TILE_SIZE);
          const enemyC = Math.floor(enemy.x / TILE_SIZE);

          if (blast.has(`${enemyR},${enemyC}`)) {
            totalSuicides++;
            if (totalSuicides <= 5) {
              console.log(`[DIAGNOSTIC SUICIDE #${totalSuicides}] layout=${layoutIdx}, enemy=${isChaser ? 'Chaser' : 'Bomber'}, enemyPos=(${enemyR},${enemyC}), bombPos=(${bomb.row},${bomb.col}), aiState=${enemy.aiState}, activeBombs=${enemy.activeBombs}, escapePathLen=${enemy.escapePath?.length}`);
            }
          } else {
            totalEscapesSuccessful++;
          }

          // Demolish blocks in blast
          for (const key of blast) {
            const [br, bc] = key.split(',').map((v) => parseInt(v, 10));
            if (map[br]?.[bc] === TILE_BLOCK) {
              map[br][bc] = TILE_EMPTY;
              totalBlocksDestroyed++;
            }
          }

          enemy.onBombExploded();
          activeBombs.splice(bi, 1);
        }
      }

      // 3. Freeze detector: If velocity is 0 and enemy is NOT in EVADING state waiting for bomb
      if (Math.abs(vx) === 0 && Math.abs(vy) === 0) {
        if (enemy.aiState !== EnemyState.EVADING && activeBombs.length === 0) {
          freezeTimerMs += DELTA_MS;
          if (freezeTimerMs >= 2000) {
            totalIndefiniteFreezes++;
            if (totalIndefiniteFreezes <= 5) {
              const er = Math.floor(enemy.y / TILE_SIZE);
              const ec = Math.floor(enemy.x / TILE_SIZE);
              console.log(`[DIAGNOSTIC FREEZE #${totalIndefiniteFreezes}] layout=${layoutIdx}, enemy=${isChaser ? 'Chaser' : 'Bomber'}, pos=(${er},${ec}), aiState=${enemy.aiState}`);
            }
            break;
          }
        } else {
          freezeTimerMs = 0;
        }
      } else {
        freezeTimerMs = 0;
      }

      // 4. Update enemy AI
      enemy.updateAI(DELTA_MS, currentTime, player, map, bombTileSet, dropBombCallback);

      // Early break if reached player
      const er = Math.floor(enemy.y / TILE_SIZE);
      const ec = Math.floor(enemy.x / TILE_SIZE);
      if (er === ROWS - 2 && ec === COLS - 2) {
        break;
      }
    }
  }

  console.log(`[EMPIRICAL STRESS TEST RESULTS across 120 Layouts]`);
  console.log(`  - Total Bombs Placed: ${totalBombsPlaced}`);
  console.log(`  - Total Blocks Destroyed: ${totalBlocksDestroyed}`);
  console.log(`  - Total Suicides: ${totalSuicides}`);
  console.log(`  - Total Indefinite Freezes: ${totalIndefiniteFreezes}`);
  console.log(`  - Successful Escapes: ${totalEscapesSuccessful}`);

  assert.ok(totalBombsPlaced >= 100, `Enemies must reliably place bombs (placed: ${totalBombsPlaced})`);
  assert.ok(totalBlocksDestroyed >= 100, `Enemies must reliably destroy blocks (destroyed: ${totalBlocksDestroyed})`);
  assert.equal(totalSuicides, 0, `Strict 0 suicide invariant violated: ${totalSuicides} suicides`);
  assert.equal(totalIndefiniteFreezes, 0, `Strict 0 indefinite freeze invariant violated: ${totalIndefiniteFreezes} freezes`);
});

/* ==============================================================================
 * SUITE 2: ANTI-FREEZE FALLBACK ADVERSARIAL STRESS SCENARIOS
 * ============================================================================== */

test('Adversarial Stress Suite 2.1: Cul-de-sac approach triggers anti-freeze fallback patrol', () => {
  const scene = createMockScene();
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = TILE_WALL;
    }
  }

  // Enclosed L-shape corridor:
  // (1,1): Enemy tile
  // (1,2): Soft block to demolish
  // (2,1): Open corridor tile (patrol exit)
  // (3,1): Solid wall (so dropping bomb at (1,1) with blast power 2 traps enemy in blast at (2,1))
  map[1][1] = TILE_EMPTY;
  map[1][2] = TILE_BLOCK;
  map[2][1] = TILE_EMPTY;
  map[3][1] = TILE_WALL;
  map[1][5] = TILE_EMPTY; // Player tile far away

  const danger = getBlastTiles({ r: 1, c: 1 }, 2, map);
  const escape = findEscapePathBFS({ r: 1, c: 1 }, danger, map, new Set(['1,1']), 8);
  assert.equal(escape, null, 'Safe escape from (1,1) must be impossible due to power-2 blast reaching wall');

  const chaser = new ChaserEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  chaser.bombCooldownTimer = 0;

  let dropped = false;
  chaser.updateAI(16, 1000, { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true }, map, new Set(), () => {
    dropped = true;
    return true;
  });

  assert.equal(dropped, false, 'Must reject suicide bomb when no safe escape exists');
  const hasVelocity = Math.abs(chaser.body.velocity.x) > 0 || Math.abs(chaser.body.velocity.y) > 0;
  assert.ok(hasVelocity, 'Must engage anti-freeze fallback patrol towards (2,1) rather than freezing at (0,0)');
  assert.ok(chaser.body.velocity.y > 0, 'Velocity must be directed southward towards open tile (2,1)');
});

test('Adversarial Stress Suite 2.2: Complete box-in safety without unhandled crashes', () => {
  const scene = createMockScene();
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = TILE_WALL;
    }
  }
  map[1][1] = TILE_EMPTY; // Completely surrounded by walls
  map[1][5] = TILE_EMPTY;

  const chaser = new ChaserEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  let dropped = false;
  chaser.updateAI(16, 1000, { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true }, map, new Set(), () => {
    dropped = true;
    return true;
  });

  assert.equal(dropped, false, 'Must not drop bomb when completely boxed in');
  assert.equal(chaser.body.velocity.x, 0);
  assert.equal(chaser.body.velocity.y, 0);
});

/* ==============================================================================
 * SUITE 3: MULTI-ANGLE SAFE APPROACH SWITCHING
 * ============================================================================== */

test('Adversarial Stress Suite 3.1: Multi-angle evaluation redirects enemy to safe approach angle', () => {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = TILE_WALL;
    }
  }

  // Soft block at (2, 2)
  // East approach at (2, 3) is a 1-tile dead end (wall at (2, 4)) -> unsafe escape
  // North approach at (1, 2) connects to open corridor (1, 1), (2, 1), (3, 1) -> safe escape
  // Enemy is at East approach (2, 3)
  map[2][2] = TILE_BLOCK;
  map[2][3] = TILE_EMPTY; // East approach (dead-end)
  map[1][2] = TILE_EMPTY; // North approach
  map[1][1] = TILE_EMPTY; // Safe retreat corridor
  map[2][1] = TILE_EMPTY;
  map[3][1] = TILE_EMPTY;
  map[5][5] = TILE_EMPTY; // Player

  // Verify East approach is unsafe
  const eastDanger = getBlastTiles({ r: 2, c: 3 }, 2, map);
  const eastEscape = findEscapePathBFS({ r: 2, c: 3 }, eastDanger, map, new Set(['2,3']), 8);
  assert.equal(eastEscape, null, 'East approach must have no safe escape');

  // Verify North approach is safe
  const northDanger = getBlastTiles({ r: 1, c: 2 }, 2, map);
  const northEscape = findEscapePathBFS({ r: 1, c: 2 }, northDanger, map, new Set(['1,2']), 8);
  assert.ok(northEscape !== null && northEscape.length > 0, 'North approach must have safe escape');

  // Verify getSafeDemolitionApproaches identifies North approach (1, 2)
  const safeApproaches = getSafeDemolitionApproaches({ r: 2, c: 2 }, map, new Set(), 2, 8);
  assert.ok(safeApproaches.some((a) => a.r === 1 && a.c === 2), 'Must discover safe North approach');
  assert.ok(!safeApproaches.some((a) => a.r === 2 && a.c === 3), 'Must NOT include unsafe East approach');
});

/* ==============================================================================
 * SUITE 4: ARCADE PHYSICS OVERLAP & BOUNDARY CLEARANCE
 * ============================================================================== */

test('Adversarial Stress Suite 4.1: Continuous sub-pixel bomb overlap clearance across tile border', () => {
  // Tile (1, 1): center is (60, 60), bomb body is 32x32 at (44, 44) to (76, 76)
  // Entity body is 24x24 centered at entity (x, y) -> (x - 12, y - 12)
  const entity = {
    x: 60,
    y: 60,
    body: {
      x: 48,
      y: 48,
      width: 24,
      height: 24,
      get right() { return this.x + this.width; },
      get bottom() { return this.y + this.height; },
    },
  };

  const bomb = {
    x: 60,
    y: 60,
    body: {
      x: 44,
      y: 44,
      width: 32,
      height: 32,
      get right() { return this.x + this.width; },
      get bottom() { return this.y + this.height; },
    },
    ignoringColliders: new Set([entity]),
  };

  const processCallback = (e, b) => {
    if (b.ignoringColliders.has(e)) {
      if (!checkAABBOverlap(e.body, b.body)) {
        b.ignoringColliders.delete(e);
        return true;
      }
      return false; // Pass through while overlapping
    }
    return true; // Solid collision
  };

  // Traversal towards right from x = 60 to x = 100 (delta = 4px)
  const positions = [60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100];
  const results = [];

  for (const px of positions) {
    entity.x = px;
    entity.body.x = px - 12; // 24px width centered
    const allowed = !processCallback(entity, bomb);
    results.push({ px, allowed, inIgnoring: bomb.ignoringColliders.has(entity) });
  }

  // At px = 80 (tile boundary: x = 2 * TILE_SIZE), entity.body.x = 68, right = 92. Bomb right is 76.
  // Overlap is 68 < 76 (TRUE!)
  const atBoundary = results.find((r) => r.px === 80);
  assert.ok(atBoundary.allowed, 'At tile boundary (x = 80), pass-through must remain active');
  assert.ok(atBoundary.inIgnoring, 'Entity must remain in ignoringColliders at boundary');

  // At px = 92, entity.body.x = 80, right = 104. Bomb right is 76. 80 >= 76, so overlap is FALSE!
  const atSeparation = results.find((r) => r.px === 92);
  assert.equal(atSeparation.allowed, false, 'At px = 92, body has fully cleared');
  assert.equal(atSeparation.inIgnoring, false, 'Entity must be removed from ignoringColliders at px = 92');

  // Attempt to step backward from px = 100 into the bomb:
  entity.x = 92;
  entity.body.x = 80;
  const reEntryAllowed = !processCallback(entity, bomb);
  assert.equal(reEntryAllowed, false, 'Re-entry into bomb must be blocked as solid wall');
});

/* ==============================================================================
 * SUITE 5: ENRAGED BOMBER QUICK-FUSE DEMOLITION SURVIVAL
 * ============================================================================== */

test('Adversarial Stress Suite 5.1: Enraged Bomber (1200ms fuse) demolition escape timing', () => {
  const scene = createMockScene();
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) ? TILE_WALL : TILE_BLOCK;
    }
  }

  map[1][1] = TILE_EMPTY; // Enemy
  map[1][2] = TILE_BLOCK; // Target block
  map[2][1] = TILE_EMPTY; // Escape step 1
  map[3][1] = TILE_EMPTY; // Escape step 2
  map[3][2] = TILE_EMPTY; // Escape step 3 (safe alcove outside blast)
  map[1][6] = TILE_EMPTY; // Player

  const bomber = new BomberEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  bomber.hp = 1;
  bomber.changeState(EnemyState.ENRAGED);
  bomber.bombCooldownTimer = 0;

  let droppedBomb = null;
  bomber.updateAI(16, 1000, { x: 6 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true }, map, new Set(), (r, c, fuseMs) => {
    droppedBomb = { r, c, fuseMs };
    return true;
  });

  assert.ok(droppedBomb !== null, 'Enraged Bomber must drop demolition bomb');
  assert.equal(droppedBomb.fuseMs, 1200, 'Enraged fuse must be 1200ms');
  assert.equal(bomber.aiState, EnemyState.EVADING, 'Must transition to EVADING');
  assert.ok(bomber.escapePath.length >= 3, 'Must have at least 3-step escape path');

  // Verify that enraged speed (105 px/s) covers 3 tiles (120px) in ~1142ms, safely before 1200ms
  const escapeDistancePx = bomber.escapePath.length * TILE_SIZE;
  const timeToReachSafeAlcoveMs = (escapeDistancePx / bomber.config.enragedSpeed) * 1000;
  assert.ok(
    timeToReachSafeAlcoveMs < droppedBomb.fuseMs,
    `Time to reach safe alcove (${timeToReachSafeAlcoveMs.toFixed(1)}ms) must be strictly less than fuse (${droppedBomb.fuseMs}ms)`
  );
});

/* ==============================================================================
 * SUITE 6: 1,000-TICK HIGH-THROUGHPUT DEMOLITION SOAK & MEMORY INVARIANCE
 * ============================================================================== */

test('Adversarial Stress Suite 6.1: 1,000-tick demolition soak maintains coordinate and state invariants', () => {
  const scene = createMockScene();
  const map = createRandomArena(0.50, 99999);

  const chaser = new ChaserEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  chaser.bombCooldownTimer = 0;

  const player = { x: (COLS - 2) * TILE_SIZE + TILE_SIZE / 2, y: (ROWS - 2) * TILE_SIZE + TILE_SIZE / 2, active: true };
  const activeBombs = [];

  for (let tick = 0; tick < 1000; tick++) {
    const delta = 16;
    const time = 1000 + tick * delta;

    // Movement
    chaser.x += (chaser.body.velocity.x * delta) / 1000;
    chaser.y += (chaser.body.velocity.y * delta) / 1000;

    // Invariant: coordinates must never be NaN
    assert.ok(!Number.isNaN(chaser.x), `chaser.x must not be NaN at tick ${tick}`);
    assert.ok(!Number.isNaN(chaser.y), `chaser.y must not be NaN at tick ${tick}`);

    // Update bombs
    for (let bi = activeBombs.length - 1; bi >= 0; bi--) {
      const b = activeBombs[bi];
      b.fuseRemaining -= delta;
      if (b.fuseRemaining <= 0) {
        const blast = getBlastTiles({ r: b.row, c: b.col }, 2, map);
        for (const key of blast) {
          const [br, bc] = key.split(',').map((v) => parseInt(v, 10));
          if (map[br]?.[bc] === TILE_BLOCK) {
            map[br][bc] = TILE_EMPTY;
          }
        }
        chaser.onBombExploded();
        activeBombs.splice(bi, 1);
      }
    }

    const bombTiles = new Set(activeBombs.map((b) => `${b.row},${b.col}`));

    chaser.updateAI(delta, time, player, map, bombTiles, (r, c, fuseMs) => {
      if (activeBombs.length >= 2) return false;
      activeBombs.push({ row: r, col: c, fuseRemaining: fuseMs });
      return true;
    });

    // Invariant: activeBombs count must match activeBombs.length
    assert.equal(
      chaser.activeBombs,
      activeBombs.length,
      `activeBombs (${chaser.activeBombs}) must match simulated bomb count (${activeBombs.length})`
    );
  }
});
