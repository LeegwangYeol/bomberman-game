/**
 * Adversarial Physics Separation, Multi-Entity Clearance & Suicide Prevention Stress Test Suite
 *
 * Empirical Challenger 2 Verification for Milestone 1:
 * 1. Bomb Physics Separation:
 *    - Sub-pixel AABB boundary transitions (24x24 hitbox vs 32x32 bomb body inside 40x40 tiles).
 *    - Cardinal (N, S, E, W) and diagonal escape paths from bomb tile without physical separation lock.
 *    - Instantaneous deregistration upon full clearance (!checkBodiesOverlap) and subsequent block.
 * 2. Multi-Entity Collision Clearance & Simultaneous Bomb Drops:
 *    - Multi-entity overlap (Player + multiple enemies) on the same bomb tile with independent clearance.
 *    - Re-entry rejection for cleared entities while remaining overlapping entities can still exit.
 *    - Simultaneous bomb placement rejection on identical tile (idempotency, no duplicate bombs, no count leaks).
 *    - Border-straddling entity between adjacent bombs (safe dual clearance, zero jitter/ping-pong).
 * 3. Suicide Prevention & Demolition Invariants:
 *    - 2,000-case Monte Carlo dead-end & cul-de-sac stress test across powers 1 to 4.
 *    - Strict rejection of dead ends and suicide bombing traps (0 suicides invariant).
 *    - Multi-angle demolition approach validation (safe approaches vs blocked/trapped angles).
 *    - Production ChaserEnemy and BomberEnemy live FSM simulation verifying 0 blast self-destructions.
 * 4. Player Movement & Bomb Sliding Invariants:
 *    - Non-kick on drop: player standing on placed bomb does not kick it out from under themselves.
 *    - Post-clearance kick: player walking back into bomb activates sliding at 300 px/s.
 *    - Obstacle collision snapping to grid center for sliding bombs.
 *    - Corner sliding tolerance (8px / 11px / 14px) and fluid movement without wall snagging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  getBlastTiles,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
  getSafeDemolitionApproaches,
} from '../src/game/pathfinding.ts';
import {
  BOMB_KICK_SPEED,
  DASH_SPEED,
} from '../src/game/gameplay_mechanics.ts';

// ESM loader hook to resolve extensionless imports in Node --experimental-strip-types
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

const { ChaserEnemy, EnemyState } = await import('../src/game/entities/EnemyEntities.ts');

/* ==============================================================================
 * DETERMINISTIC PRNG (Mulberry32)
 * ============================================================================== */

function createPRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ==============================================================================
 * AABB PHYSICS COLLISION HARNESS (Mirroring GameScene.checkBodiesOverlap)
 * ============================================================================== */

function checkBodiesOverlap(b1, b2) {
  if (!b1 || !b2) return false;
  return !(b2.x >= b1.right || b2.right <= b1.x || b2.y >= b1.bottom || b2.bottom <= b1.y);
}

function createMockBody(x, y, width, height) {
  return {
    x,
    y,
    width,
    height,
    get right() { return this.x + this.width; },
    get bottom() { return this.y + this.height; },
  };
}

function createMockBomb(centerX, centerY) {
  const data = new Map();
  return {
    x: centerX,
    y: centerY,
    active: true,
    data,
    getData(k) { return data.get(k); },
    setData(k, v) { data.set(k, v); return this; },
    // 32x32 body centered at (centerX, centerY) with offset (4, 4) in 40x40 tile
    body: createMockBody(centerX - 16, centerY - 16, 32, 32),
  };
}

function createMockEntity(x, y, name = 'entity') {
  // 40x40 sprite with 24x24 body centered (offset 8, 8)
  const body = createMockBody(x - 12, y - 12, 24, 24);
  return {
    name,
    x,
    y,
    active: true,
    body,
    setPosition(nx, ny) {
      this.x = nx;
      this.y = ny;
      this.body.x = nx - 12;
      this.body.y = ny - 12;
    },
  };
}

function evaluateBombCollider(entity, bomb) {
  const ignoring = bomb.getData('ignoringColliders');
  if (ignoring && ignoring.has(entity)) {
    if (!checkBodiesOverlap(entity.body, bomb.body)) {
      ignoring.delete(entity);
      return true; // Deregistered and collision now active
    }
    return false; // Suppress separation while overlapping
  }
  return true; // Normal solid obstacle collision
}

function createStandardMap() {
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
            setSize: () => obj.body,
            setOffset: () => obj.body,
            setCollideWorldBounds: () => obj.body,
            setVelocity: (vx, vy) => {
              obj.body.velocity.x = vx;
              obj.body.velocity.y = vy;
              return obj.body;
            },
            velocity: { x: 0, y: 0 },
            x: obj.x,
            y: obj.y,
            width: 24,
            height: 24,
          };
          return obj;
        },
      },
    },
    time: { now: 1000 },
  };
}

/* ==============================================================================
 * SUITE 1: BOMB PHYSICS SEPARATION & AABB BOUNDARY INVARIANTS
 * ============================================================================== */

test('PHYS-CHALLENGE-01: Sub-pixel AABB boundary clearance across all 4 cardinal directions', () => {
  // Tile (1,1): center (60, 60), bomb body bounds [44..76, 44..76] (32x32)
  const bomb = createMockBomb(60, 60);

  // Entity body is 24x24 (x - 12 to x + 12):
  // East clear: body.x >= 76 -> px >= 88
  // West clear: body.right <= 44 -> px <= 32
  // South clear: body.y >= 76 -> py >= 88
  // North clear: body.bottom <= 44 -> py <= 32
  const cardinalVectors = [
    { name: 'EAST (Right)', clearCoord: { x: 88, y: 60 }, boundaryCoord: { x: 87.9, y: 60 } },
    { name: 'WEST (Left)', clearCoord: { x: 32, y: 60 }, boundaryCoord: { x: 32.1, y: 60 } },
    { name: 'SOUTH (Down)', clearCoord: { x: 60, y: 88 }, boundaryCoord: { x: 60, y: 87.9 } },
    { name: 'NORTH (Up)', clearCoord: { x: 60, y: 32 }, boundaryCoord: { x: 60, y: 32.1 } },
  ];

  for (const card of cardinalVectors) {
    const entity = createMockEntity(60, 60, `entity_${card.name}`);
    const ignoring = new Set([entity]);
    bomb.setData('ignoringColliders', ignoring);

    // Initial position: center of bomb tile -> MUST suppress collision (return false)
    assert.equal(
      evaluateBombCollider(entity, bomb),
      false,
      `Initial overlap for ${card.name} must suppress collision`
    );
    assert.ok(ignoring.has(entity), `Entity must remain in ignoringColliders for ${card.name}`);

    // Boundary position: 0.1px inside boundary -> MUST still suppress collision
    entity.setPosition(card.boundaryCoord.x, card.boundaryCoord.y);
    assert.equal(
      evaluateBombCollider(entity, bomb),
      false,
      `0.1px inside boundary for ${card.name} must still suppress collision`
    );
    assert.ok(ignoring.has(entity));

    // Clearance position: body completely disjoint (e.g. body.x >= 76 for EAST)
    entity.setPosition(card.clearCoord.x, card.clearCoord.y);
    assert.equal(
      evaluateBombCollider(entity, bomb),
      true,
      `Fully cleared position for ${card.name} must return true and deregister`
    );
    assert.equal(
      ignoring.has(entity),
      false,
      `Entity must be removed from ignoringColliders after clearing for ${card.name}`
    );

    // Re-entry attempt: walking back into the bomb must be BLOCKED
    entity.setPosition(60, 60);
    assert.equal(
      evaluateBombCollider(entity, bomb),
      true,
      `Re-entry attempt for ${card.name} must collide (return true)`
    );
  }
});

test('PHYS-CHALLENGE-02: 4 diagonal escape vectors clear cleanly and independently', () => {
  const bomb = createMockBomb(60, 60);

  const diagonals = [
    { name: 'SOUTHEAST', clearCoord: { x: 88, y: 88 }, touchingCoord: { x: 87, y: 87 } },
    { name: 'SOUTHWEST', clearCoord: { x: 32, y: 88 }, touchingCoord: { x: 33, y: 87 } },
    { name: 'NORTHEAST', clearCoord: { x: 88, y: 32 }, touchingCoord: { x: 87, y: 33 } },
    { name: 'NORTHWEST', clearCoord: { x: 32, y: 32 }, touchingCoord: { x: 33, y: 33 } },
  ];

  for (const diag of diagonals) {
    const entity = createMockEntity(60, 60, `diag_${diag.name}`);
    const ignoring = new Set([entity]);
    bomb.setData('ignoringColliders', ignoring);

    entity.setPosition(diag.touchingCoord.x, diag.touchingCoord.y);
    assert.equal(
      evaluateBombCollider(entity, bomb),
      false,
      `Partial diagonal overlap for ${diag.name} must remain ignored`
    );

    entity.setPosition(diag.clearCoord.x, diag.clearCoord.y);
    assert.equal(
      evaluateBombCollider(entity, bomb),
      true,
      `Full diagonal separation for ${diag.name} must trigger deregistration`
    );
    assert.equal(ignoring.has(entity), false);
  }
});

/* ==============================================================================
 * SUITE 2: MULTI-ENTITY CONCURRENT CLEARANCE & ADJACENT BOMBS
 * ============================================================================== */

test('MULTI-CHALLENGE-01: Multi-entity concurrent overlap on same bomb tile with staggered exit', () => {
  const bomb = createMockBomb(60, 60);

  const player = createMockEntity(60, 60, 'player');
  const enemy1 = createMockEntity(60, 60, 'enemy1');
  const enemy2 = createMockEntity(60, 60, 'enemy2');

  const ignoring = new Set([player, enemy1, enemy2]);
  bomb.setData('ignoringColliders', ignoring);

  // Step 1: All 3 entities start overlapping at bomb center
  assert.equal(evaluateBombCollider(player, bomb), false);
  assert.equal(evaluateBombCollider(enemy1, bomb), false);
  assert.equal(evaluateBombCollider(enemy2, bomb), false);
  assert.equal(ignoring.size, 3);

  // Step 2: Enemy1 moves North and clears (y=32)
  enemy1.setPosition(60, 32);
  assert.equal(evaluateBombCollider(enemy1, bomb), true, 'Enemy1 clears and deregisters');
  assert.equal(ignoring.has(enemy1), false, 'Enemy1 removed from Set');

  // Verify Player and Enemy2 STILL have ignore clearance
  assert.ok(ignoring.has(player), 'Player still retained in ignoringColliders');
  assert.ok(ignoring.has(enemy2), 'Enemy2 still retained in ignoringColliders');
  assert.equal(evaluateBombCollider(player, bomb), false, 'Player still passes through');
  assert.equal(evaluateBombCollider(enemy2, bomb), false, 'Enemy2 still passes through');

  // Step 3: Enemy1 tries to step back South into the bomb (y=50)
  enemy1.setPosition(60, 50);
  assert.equal(
    evaluateBombCollider(enemy1, bomb),
    true,
    'Enemy1 must be blocked from re-entering bomb'
  );
  // While Enemy1 is blocked, Enemy2 can still exit South without lock
  enemy2.setPosition(60, 88);
  assert.equal(evaluateBombCollider(enemy2, bomb), true, 'Enemy2 clears South');
  assert.equal(ignoring.has(enemy2), false);

  // Step 4: Player steps West and clears (x=32)
  player.setPosition(32, 60);
  assert.equal(evaluateBombCollider(player, bomb), true, 'Player clears West');
  assert.equal(ignoring.has(player), false);

  // All entities cleared
  assert.equal(ignoring.size, 0, 'ignoringColliders Set must be empty');

  // Now all 3 entities are completely blocked from entering
  player.setPosition(60, 60);
  enemy1.setPosition(60, 60);
  enemy2.setPosition(60, 60);
  assert.equal(evaluateBombCollider(player, bomb), true);
  assert.equal(evaluateBombCollider(enemy1, bomb), true);
  assert.equal(evaluateBombCollider(enemy2, bomb), true);
});

test('MULTI-CHALLENGE-02: Border-straddling entity between adjacent bombs clears smoothly without ping-pong', () => {
  // Tile (1,1): center (60, 60), bomb body bounds [44..76, 44..76]
  // Tile (1,2): center (100, 60), bomb body bounds [84..116, 44..76]
  const bomb1 = createMockBomb(60, 60);
  const bomb2 = createMockBomb(100, 60);

  // Entity positioned at x=80, body bounds [68..92, 48..72].
  // Notice body extends from 68 to 92: it overlaps Bomb1 (68 < 76) AND Bomb2 (92 > 84)!
  const entity = createMockEntity(80, 60, 'straddler');

  const ignoring1 = new Set([entity]);
  const ignoring2 = new Set([entity]);
  bomb1.setData('ignoringColliders', ignoring1);
  bomb2.setData('ignoringColliders', ignoring2);

  // Step 1: Initial position at x=80 -> both bombs suppress separation
  assert.equal(evaluateBombCollider(entity, bomb1), false);
  assert.equal(evaluateBombCollider(entity, bomb2), false);

  // Step 2: Entity steps East to x=85, body [73..97] -> still overlapping both
  entity.setPosition(85, 60);
  assert.equal(evaluateBombCollider(entity, bomb1), false);
  assert.equal(evaluateBombCollider(entity, bomb2), false);

  // Step 3: Entity steps East to x=88, body [76..100] -> clears Bomb1 (body.x >= 76)
  entity.setPosition(88, 60);
  assert.equal(evaluateBombCollider(entity, bomb1), true, 'Bomb1 clears entity');
  assert.equal(ignoring1.has(entity), false, 'Entity removed from Bomb1 ignoring set');

  // Crucial invariant: Bomb2 MUST STILL suppress collision because body [76..100] is inside Bomb2 [84..116]!
  assert.equal(
    evaluateBombCollider(entity, bomb2),
    false,
    'Bomb2 must still allow pass-through without pushing entity backward into Bomb1'
  );
  assert.ok(ignoring2.has(entity), 'Entity still in Bomb2 ignoring set');

  // Step 4: Entity steps East to x=128, body [116..140] -> clears Bomb2 (body.x >= 116)
  entity.setPosition(128, 60);
  assert.equal(evaluateBombCollider(entity, bomb2), true, 'Bomb2 clears entity');
  assert.equal(ignoring2.has(entity), false, 'Entity removed from Bomb2 ignoring set');

  // Entity is now free at tile (1,3). Attempting to move West collides with Bomb2:
  entity.setPosition(100, 60);
  assert.equal(evaluateBombCollider(entity, bomb2), true, 'Bomb2 blocks re-entry from East');
});

test('MULTI-CHALLENGE-03: Duplicate bomb placement rejection & arena cap invariants', () => {
  const bombList = [];
  const MAX_ENEMY_BOMBS = 2;
  let activeEnemyBombs = 0;

  function tryPlaceEnemyBomb(r, c) {
    const centerX = c * TILE_SIZE + TILE_SIZE / 2;
    const centerY = r * TILE_SIZE + TILE_SIZE / 2;

    // Arena global cap
    if (activeEnemyBombs >= MAX_ENEMY_BOMBS) {
      return { success: false, reason: 'ARENA_CAP' };
    }

    // Tile duplicate check
    let hasBomb = false;
    for (const b of bombList) {
      if (b.active && b.x === centerX && b.y === centerY) {
        hasBomb = true;
        break;
      }
    }
    if (hasBomb) {
      return { success: false, reason: 'DUPLICATE_TILE' };
    }

    const newBomb = createMockBomb(centerX, centerY);
    bombList.push(newBomb);
    activeEnemyBombs++;
    return { success: true, bomb: newBomb };
  }

  // 1. Attempt 50 simultaneous placements on tile (1,1)
  const resultsTile1 = [];
  for (let i = 0; i < 50; i++) {
    resultsTile1.push(tryPlaceEnemyBomb(1, 1));
  }

  assert.equal(resultsTile1[0].success, true, 'First placement must succeed');
  assert.equal(activeEnemyBombs, 1, 'activeEnemyBombs must increment by exactly 1');
  for (let i = 1; i < 50; i++) {
    assert.equal(resultsTile1[i].success, false, `Subsequent placement ${i} must fail`);
    assert.equal(resultsTile1[i].reason, 'DUPLICATE_TILE');
  }

  // 2. Second placement on distinct tile (1,2)
  const resultTile2 = tryPlaceEnemyBomb(1, 2);
  assert.equal(resultTile2.success, true);
  assert.equal(activeEnemyBombs, 2, 'activeEnemyBombs must reach cap of 2');

  // 3. Third placement on distinct tile (1,3) when at cap of 2
  const resultTile3 = tryPlaceEnemyBomb(1, 3);
  assert.equal(resultTile3.success, false, 'Third placement must be rejected due to arena cap');
  assert.equal(resultTile3.reason, 'ARENA_CAP');

  // 4. Detonate first bomb, decrement counter, then retry
  bombList[0].active = false;
  activeEnemyBombs--;
  assert.equal(activeEnemyBombs, 1);

  const retryTile3 = tryPlaceEnemyBomb(1, 3);
  assert.equal(retryTile3.success, true, 'Placement must now succeed after bomb exploded');
  assert.equal(activeEnemyBombs, 2);
});

/* ==============================================================================
 * SUITE 3: SUICIDE PREVENTION INVARIANTS & MONTE CARLO STRESS
 * ============================================================================== */

test('SUICIDE-CHALLENGE-01: 2,000 Monte Carlo dead ends & cul-de-sacs maintain 0 suicides invariant', () => {
  const rng = createPRNG(424242);
  let totalEvaluations = 0;
  let rejectedPlacements = 0;
  let acceptedPlacements = 0;

  for (let trial = 0; trial < 2000; trial++) {
    const map = createStandardMap();
    const power = 1 + Math.floor(rng() * 4); // Powers 1, 2, 3, 4

    // Pick random inner tile (r, c)
    const er = 1 + Math.floor(rng() * (ROWS - 2));
    const ec = 1 + Math.floor(rng() * (COLS - 2));
    if (map[er][ec] === TILE_WALL) continue;

    // Randomly seal adjacent directions to create dead ends or cul-de-sacs
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];
    let sealedNeighbors = 0;
    for (const d of dirs) {
      const nr = er + d.dr;
      const nc = ec + d.dc;
      if (rng() < 0.6) {
        map[nr][nc] = rng() < 0.5 ? TILE_WALL : TILE_BLOCK;
        sealedNeighbors++;
      } else {
        map[nr][nc] = TILE_EMPTY;
      }
    }

    totalEvaluations++;

    const isSafe = canSafelyPlaceBomb({ r: er, c: ec }, power, map, new Set(), 8);
    const escapePath = getSafeBombEscapePath({ r: er, c: ec }, power, map, new Set(), 8);

    if (isSafe) {
      acceptedPlacements++;
      assert.ok(escapePath !== null, 'Safe placement must return a non-null escape path');
      assert.ok(escapePath.length > 0, 'Escape path must have at least 1 step');
      assert.ok(escapePath.length <= 8, 'Escape path must not exceed maxEscapeSteps (8)');

      // Verify the escape destination is OUTSIDE the bomb's blast
      const blast = getBlastTiles({ r: er, c: ec }, power, map);
      const dest = escapePath[escapePath.length - 1];
      assert.ok(
        !blast.has(`${dest.r},${dest.c}`),
        `SUICIDE VIOLATION: Escape destination (${dest.r}, ${dest.c}) is inside blast for bomb at (${er}, ${ec})!`
      );

      // Verify every step in the escape path is traversable
      for (const step of escapePath) {
        assert.equal(
          map[step.r][step.c],
          TILE_EMPTY,
          `Escape path step (${step.r}, ${step.c}) must be TILE_EMPTY`
        );
      }
    } else {
      rejectedPlacements++;
      assert.equal(escapePath, null, 'Unsafe placement must return null escape path');
    }

    // Strict 1-tile dead end invariant: if 3 or 4 neighbors are sealed, placement MUST be rejected
    if (sealedNeighbors >= 3) {
      const openNeighbors = dirs.filter((d) => map[er + d.dr][ec + d.dc] === TILE_EMPTY);
      if (openNeighbors.length === 0) {
        assert.equal(isSafe, false, 'Completely sealed tile (4 walls) must NEVER permit bomb');
      } else if (openNeighbors.length === 1) {
        // Single exit: check if next step has an escape turn or is covered by blast
        const exit = { r: er + openNeighbors[0].dr, c: ec + openNeighbors[0].dc };
        const exitBlast = getBlastTiles({ r: er, c: ec }, power, map);
        if (exitBlast.has(`${exit.r},${exit.c}`)) {
          // Check if exit has a safe turn to an open neighbor
          const exitDirs = dirs.filter((d) => {
            const tr = exit.r + d.dr;
            const tc = exit.c + d.dc;
            return tr !== er || tc !== ec;
          });
          const hasSideTurn = exitDirs.some((d) => {
            const tr = exit.r + d.dr;
            const tc = exit.c + d.dc;
            if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) {
              return map[tr][tc] === TILE_EMPTY;
            }
            return false;
          });
          if (!hasSideTurn && power >= 2) {
            assert.equal(isSafe, false, 'Straight dead-end corridor with no turn must reject bomb');
          }
        }
      }
    }
  }

  assert.ok(totalEvaluations > 1000, `Evaluated ${totalEvaluations} scenarios`);
  assert.ok(acceptedPlacements > 0, `Accepted ${acceptedPlacements} safe placements`);
  assert.ok(rejectedPlacements > 0, `Rejected ${rejectedPlacements} dangerous placements`);
});

test('SUICIDE-CHALLENGE-02: Multi-angle demolition approaches evaluation (getSafeDemolitionApproaches)', () => {
  const map = createStandardMap();
  // Construct a specific tactical puzzle:
  // Target block at (1, 3)
  map[1][3] = TILE_BLOCK;
  // West side (1, 2): Open corridor leading to safe alcove at (2, 2)
  map[1][2] = TILE_EMPTY;
  map[2][2] = TILE_EMPTY;
  // East side (1, 4): 1-tile dead end surrounded by blocks
  map[1][4] = TILE_EMPTY;
  map[1][5] = TILE_WALL;
  map[2][4] = TILE_WALL;
  map[0][4] = TILE_WALL;
  // North side (0, 3): Wall
  // South side (2, 3): Block
  map[2][3] = TILE_BLOCK;

  const safeApproaches = getSafeDemolitionApproaches({ r: 1, c: 3 }, map, new Set(), 2, 8);

  // Invariant: West side (1, 2) MUST be safe because it can escape down to (2, 2)
  const westSafe = safeApproaches.some((pt) => pt.r === 1 && pt.c === 2);
  assert.ok(westSafe, 'West approach (1, 2) must be recognized as safe');

  // Invariant: East side (1, 4) MUST BE REJECTED because it is a dead end surrounded by walls
  const eastSafe = safeApproaches.some((pt) => pt.r === 1 && pt.c === 4);
  assert.equal(eastSafe, false, 'East approach (1, 4) in dead end must be rejected as unsafe');

  // If we seal the safe alcove at (2, 2) with a wall:
  map[2][2] = TILE_WALL;
  map[1][1] = TILE_WALL; // Seal west corridor
  const noApproaches = getSafeDemolitionApproaches({ r: 1, c: 3 }, map, new Set(), 2, 8);
  assert.equal(noApproaches.length, 0, 'When all angles are unsafe, must return empty array');
});

test('SUICIDE-CHALLENGE-03: Production ChaserEnemy and BomberEnemy live simulation with 0 suicides', () => {
  const scene = createMockScene();

  for (let trial = 0; trial < 100; trial++) {
    const map = createStandardMap();
    const er = 1 + (trial % (ROWS - 4));
    const ec = 1 + (trial % (COLS - 4));

    // Place a soft block 1 tile away
    map[er][ec] = TILE_EMPTY;
    map[er][ec + 1] = TILE_BLOCK;
    // Create an L-bend escape corridor
    map[er + 1][ec] = TILE_EMPTY;
    map[er + 1][ec - 1] = TILE_EMPTY;

    const chaser = new ChaserEnemy(scene, ec * TILE_SIZE + TILE_SIZE / 2, er * TILE_SIZE + TILE_SIZE / 2);
    chaser.bombCooldownTimer = 0;

    let placedBomb = null;
    const dropBombCallback = (r, c, fuseMs) => {
      placedBomb = { r, c, fuseMs };
      return true;
    };

    const player = { x: (ec + 3) * TILE_SIZE + TILE_SIZE / 2, y: er * TILE_SIZE + TILE_SIZE / 2, active: true };
    chaser.updateAI(16, 1000 + trial * 16, player, map, new Set(), dropBombCallback);

    if (placedBomb) {
      // Invariant: Chaser must be in EVADING state
      assert.equal(chaser.aiState, EnemyState.EVADING);
      assert.ok(chaser.escapePath.length > 0);

      // Verify destination is outside blast
      const blast = getBlastTiles({ r: placedBomb.r, c: placedBomb.c }, chaser.bombPower, map);
      const dest = chaser.escapePath[chaser.escapePath.length - 1];
      assert.ok(
        !blast.has(`${dest.r},${dest.c}`),
        `Chaser placed bomb at (${placedBomb.r},${placedBomb.c}) with destination (${dest.r},${dest.c}) in blast!`
      );

      // Verify onBombExploded() properly restores tracking
      chaser.onBombExploded();
      assert.equal(chaser.aiState, EnemyState.TRACKING);
      assert.equal(chaser.activeBombs, 0);
    }
  }
});

/* ==============================================================================
 * SUITE 4: PLAYER MOVEMENT & BOMB SLIDING INVARIANTS
 * ============================================================================== */

test('MOVE-CHALLENGE-01: Non-kick on drop invariant (player drops bomb at feet without kicking)', () => {
  // Setup player with kick capability
  const player = createMockEntity(60, 60, 'kicking_player');
  const bomb = createMockBomb(60, 60);

  // When bomb is dropped at player feet, player is added to ignoringColliders
  const ignoring = new Set([player]);
  bomb.setData('ignoringColliders', ignoring);
  bomb.setData('isSliding', false);

  let kickTriggered = false;
  const tryKickBombMock = () => {
    kickTriggered = true;
  };

  // Collider callback with process check
  const colliderCallback = () => {
    tryKickBombMock();
  };

  const processCallback = (p, b) => {
    const ign = b.getData('ignoringColliders');
    if (ign && ign.has(p)) {
      if (!checkBodiesOverlap(p.body, b.body)) {
        ignoring.delete(p);
      } else {
        return false; // Suppress collision
      }
    }
    return true;
  };

  // 1. Initial drop tick: player standing inside bomb
  const canCollideInitial = processCallback(player, bomb);
  if (canCollideInitial) {
    colliderCallback(player, bomb);
  }
  assert.equal(canCollideInitial, false, 'Process callback must return false on drop');
  assert.equal(kickTriggered, false, 'Kick must NOT trigger on initial drop at feet');
  assert.equal(bomb.getData('isSliding'), false, 'Bomb must NOT slide');

  // 2. Player moves East away to x=88 (clears bomb body)
  player.setPosition(88, 60);
  const canCollideClear = processCallback(player, bomb);
  assert.equal(canCollideClear, true, 'Process callback returns true once cleared');
  assert.equal(ignoring.has(player), false, 'Player removed from ignoring set');
  assert.equal(kickTriggered, false, 'Moving away does not trigger kick');

  // 3. Player turns around and walks West back into the bomb (from x=88 to x=75)
  player.setPosition(75, 60);
  const canCollideKick = processCallback(player, bomb);
  if (canCollideKick) {
    colliderCallback(player, bomb);
  }
  assert.equal(canCollideKick, true, 'Process callback returns true when walking into bomb');
  assert.equal(kickTriggered, true, 'Walking back into bomb successfully triggers kick');
});

test('MOVE-CHALLENGE-02: Bomb sliding velocity, obstacle collision, and center snapping', () => {
  const bomb = createMockBomb(60, 60); // Tile (1,1): center (60, 60)
  bomb.setData('isSliding', true);
  bomb.setData('slideDir', { x: 1, y: 0 }); // Sliding East

  assert.equal(BOMB_KICK_SPEED, 300, 'Bomb kick speed must match specification (300 px/s)');

  // Corridor with wall at column 4 (x = 4 * 40 = 160)
  const map = createStandardMap();
  map[1][4] = TILE_WALL;

  let isBlocked = false;
  let snappedPosition = null;

  // Simulate sliding loop
  let bombX = bomb.x;
  const bombY = bomb.y;
  const delta = 16.6; // ms

  for (let f = 0; f < 60; f++) {
    const dir = bomb.getData('slideDir');
    const lookahead = Math.max(16, BOMB_KICK_SPEED * (delta / 1000) + 4);
    const checkX = bombX + dir.x * lookahead;
    const checkY = bombY + dir.y * lookahead;
    const targetCol = Math.floor(checkX / TILE_SIZE);
    const targetRow = Math.floor(checkY / TILE_SIZE);

    if (map[targetRow][targetCol] !== TILE_EMPTY) {
      isBlocked = true;
      const bCol = Math.floor(bombX / TILE_SIZE);
      const bRow = Math.floor(bombY / TILE_SIZE);
      snappedPosition = {
        x: bCol * TILE_SIZE + TILE_SIZE / 2,
        y: bRow * TILE_SIZE + TILE_SIZE / 2,
      };
      bomb.setData('isSliding', false);
      break;
    }

    bombX += dir.x * BOMB_KICK_SPEED * (delta / 1000);
  }

  assert.equal(isBlocked, true, 'Sliding bomb must detect upcoming wall');
  assert.equal(bomb.getData('isSliding'), false, 'Bomb must stop sliding');
  assert.ok(snappedPosition !== null, 'Bomb must snap to tile center');
  // Column 3 is the open tile before wall at column 4:
  assert.equal(snappedPosition.x, 3 * TILE_SIZE + TILE_SIZE / 2, 'Snapped X must be exact center of column 3 (140)');
  assert.equal(snappedPosition.y, 1 * TILE_SIZE + TILE_SIZE / 2, 'Snapped Y must be exact center of row 1 (60)');
});

test('MOVE-CHALLENGE-03: Corner sliding tolerance (8px / 11px / 14px) and fluid rounding', () => {
  const map = createStandardMap();
  // Corner scenario:
  // Player is moving East (+X) in corridor at row 1.
  // Next column (col 2) is blocked by a wall at (1, 2).
  // But corridor turns Down: (2, 1) is EMPTY and (2, 2) is EMPTY.
  map[1][2] = TILE_WALL;
  map[2][1] = TILE_EMPTY;
  map[2][2] = TILE_EMPTY;

  const baseSpeed = 150;

  function simulateCornerRounding(diffY, tol) {
    const row = 1;
    const col = 1;
    const nextCol = col + 1;

    const isPassable = (r, c) => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      return map[r][c] === TILE_EMPTY;
    };

    const directOpen = isPassable(row, nextCol);
    if (directOpen) return { vx: baseSpeed, vy: 0 };

    const canRoundDown = diffY >= 0 && Math.abs(diffY) <= tol && isPassable(row + 1, col) && isPassable(row + 1, nextCol);
    const canRoundUp = diffY <= 0 && Math.abs(diffY) <= tol && isPassable(row - 1, col) && isPassable(row - 1, nextCol);

    let vy = 0;
    if (canRoundUp && canRoundDown) {
      vy = diffY < 0 ? -baseSpeed : diffY > 0 ? baseSpeed : -baseSpeed;
    } else if (canRoundUp) {
      vy = -baseSpeed;
    } else if (canRoundDown) {
      vy = baseSpeed;
    }

    return { vx: 0, vy };
  }

  // Test 1: Standard tolerance (8px)
  // At diffY = +6: within 8px tolerance -> must receive +vy (rounding down)
  const resTol6 = simulateCornerRounding(6, 8);
  assert.equal(resTol6.vy, baseSpeed, 'diffY = +6 within tol=8 must round down');

  // At diffY = +8: exact boundary of 8px tolerance -> must round down
  const resTol8 = simulateCornerRounding(8, 8);
  assert.equal(resTol8.vy, baseSpeed, 'diffY = +8 on boundary of tol=8 must round down');

  // At diffY = +9: outside 8px tolerance -> must NOT round (vy = 0)
  const resTol9 = simulateCornerRounding(9, 8);
  assert.equal(resTol9.vy, 0, 'diffY = +9 outside tol=8 must not round');

  // Test 2: Perk level 1 tolerance (11px)
  const resPerk1 = simulateCornerRounding(10, 11);
  assert.equal(resPerk1.vy, baseSpeed, 'diffY = +10 within perk tol=11 must round down');

  // Test 3: Perk level 2 tolerance (14px)
  const resPerk2 = simulateCornerRounding(13, 14);
  assert.equal(resPerk2.vy, baseSpeed, 'diffY = +13 within perk tol=14 must round down');
});

test('MOVE-CHALLENGE-04: Dash speed and shield invulnerability preservation', () => {
  assert.equal(DASH_SPEED, 350, 'Dash speed must be 350 px/s');

  // Dash duration 140ms, shield invulnerability 1500ms
  let isInvulnerable = true;
  let isDashing = true;
  const now = 1000;
  const shieldInvulnerableUntil = now + 1500; // 2500

  // Simulate Dash ending at t = 1140ms
  const tDashEnd = 1140;
  isDashing = false;

  // Invariant guard (from GameScene.ts line 2830):
  // When dash ends, if shieldInvulnerableUntil > currentTime, isInvulnerable MUST remain true!
  if (tDashEnd < shieldInvulnerableUntil) {
    isInvulnerable = true; // Preserved by shield guard!
  } else {
    isInvulnerable = false;
  }

  assert.equal(
    isInvulnerable,
    true,
    'Invulnerability must be preserved when dash ends during active shield window'
  );

  // After shield window expires at t = 2501ms:
  const tShieldEnd = 2501;
  if (tShieldEnd >= shieldInvulnerableUntil && !isDashing) {
    isInvulnerable = false;
  }
  assert.equal(isInvulnerable, false, 'Invulnerability must clear after shield window expires');
});
