/**
 * AI Suicide Prevention Invariant Verification Suite: Cul-de-Sacs & Traps
 *
 * Exhaustively verifies:
 * 1. findEscapePathBFS yields null for all 1..5 tile deep cul-de-sacs across all 4 cardinal orientations.
 * 2. canSafelyPlaceBomb and getSafeBombEscapePath reject 100% of cul-de-sac bomb placements.
 * 3. Breakable block cul-de-sacs, active bomb barricaded cul-de-sacs, and maxSteps reachability limits.
 * 4. Production ChaserEnemy and BomberEnemy FSM decision cycles strictly enforce 0% suicide rate.
 * 5. 5,000 randomized adversarial cul-de-sac trials enforce 0.0% suicide rate.
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
  FlatHazardMask,
  getBlastTiles,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
  findEscapePathBFS,
} from '../src/game/pathfinding.ts';

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

// Minimal headless Phaser scene mocks
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

function createEmptyMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
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
      'play', 'setTint', 'clearTint', 'setPosition', 'add',
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
      sprite: () => createChainable(),
      text: () => createChainable(),
      graphics: () => createChainable(),
      image: () => createChainable(),
      container: () => createChainable(),
      circle: () => createChainable(),
    },
    physics: {
      world: {
        enable: () => {},
      },
      add: {
        existing: (obj) => {
          obj.body = {
            setSize: () => obj.body,
            setOffset: () => obj.body,
            setCollideWorldBounds: () => obj.body,
            setVelocity: (vx, vy) => {
              if (obj.body) {
                obj.body.velocity.x = vx;
                obj.body.velocity.y = vy;
              }
              return obj.body;
            },
            velocity: { x: 0, y: 0 },
            x: obj.x || 0,
            y: obj.y || 0,
            width: 24,
            height: 24,
          };
          return obj;
        },
      },
    },
    tweens: {
      add: () => ({ stop: () => {}, remove: () => {} }),
    },
    textures: {
      exists: () => false,
    },
    time: { now: 1000 },
  };
}

/* ==============================================================================
 * SUITE 1: 4-CARDINAL ORIENTATION CUL-DE-SACS ACROSS DEPTHS 1 TO 5
 * ============================================================================== */

test('Cardinal Cul-de-Sacs: North, South, East, West orientations reject bomb placement across depths 1..5', () => {
  const directions = [
    { name: 'East-Facing', dr: 0, dc: 1, sideR: 1, sideC: 0 },
    { name: 'West-Facing', dr: 0, dc: -1, sideR: 1, sideC: 0 },
    { name: 'South-Facing', dr: 1, dc: 0, sideR: 0, sideC: 1 },
    { name: 'North-Facing', dr: -1, dc: 0, sideR: 0, sideC: 1 },
  ];

  for (const dir of directions) {
    for (let depth = 1; depth <= 5; depth++) {
      const map = createEmptyMap();
      const startR = 6;
      const startC = 7;

      // Construct a cul-de-sac tunnel of given depth
      // Back of the cul-de-sac is at (startR, startC)
      // Block the back
      const backR = startR - dir.dr;
      const backC = startC - dir.dc;
      map[backR][backC] = TILE_WALL;

      // Build flanking walls along the tunnel
      for (let step = 0; step < depth; step++) {
        const curR = startR + step * dir.dr;
        const curC = startC + step * dir.dc;
        map[curR + dir.sideR][curC + dir.sideC] = TILE_WALL;
        map[curR - dir.sideR][curC - dir.sideC] = TILE_WALL;
      }

      // Close the mouth of the tunnel with a wall to create a closed cul-de-sac
      const endR = startR + depth * dir.dr;
      const endC = startC + depth * dir.dc;
      map[endR][endC] = TILE_WALL;

      // Bomb power covers the depth
      const power = depth;

      // Evaluate findEscapePathBFS, canSafelyPlaceBomb, and getSafeBombEscapePath
      const simulatedBombs = new Set([`${startR},${startC}`]);
      const danger = getBlastTiles({ r: startR, c: startC }, power, map);
      const escape = findEscapePathBFS({ r: startR, c: startC }, danger, map, simulatedBombs, 8);
      const canPlace = canSafelyPlaceBomb({ r: startR, c: startC }, power, map, new Set(), 8);
      const safePath = getSafeBombEscapePath({ r: startR, c: startC }, power, map, new Set(), 8);

      assert.equal(escape, null, `${dir.name} depth ${depth} cul-de-sac must return null escape path`);
      assert.equal(canPlace, false, `${dir.name} depth ${depth} cul-de-sac must reject canSafelyPlaceBomb`);
      assert.equal(safePath, null, `${dir.name} depth ${depth} cul-de-sac must return null safeBombEscapePath`);
    }
  }
});

/* ==============================================================================
 * SUITE 2: BREAKABLE BLOCK CUL-DE-SACS & HYBRID TRAPS
 * ============================================================================== */

test('Soft Block Cul-de-Sacs: TILE_BLOCK encasement strictly prevents bomb self-trapping', () => {
  const map = createEmptyMap();
  // Enemy at (3, 3) surrounded by destructible blocks on 3 sides and wall on 1 side
  map[2][3] = TILE_WALL;  // North wall
  map[3][2] = TILE_BLOCK; // West soft block
  map[4][3] = TILE_BLOCK; // South soft block
  map[3][4] = TILE_BLOCK; // East soft block

  const danger = getBlastTiles({ r: 3, c: 3 }, 2, map);
  const escape = findEscapePathBFS({ r: 3, c: 3 }, danger, map, new Set(['3,3']), 8);
  const canPlace = canSafelyPlaceBomb({ r: 3, c: 3 }, 2, map, new Set(), 8);

  assert.equal(escape, null, 'Encasement by soft blocks must yield null escape (soft blocks block movement)');
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must reject encasement by soft blocks');
});

test('Pincher Cul-de-Sac: Open corridor blocked by active bomb at mouth returns null', () => {
  const map = createEmptyMap();
  // Corridor from (2, 2) to (2, 5)
  for (let c = 2; c <= 5; c++) {
    map[1][c] = TILE_WALL;
    map[3][c] = TILE_WALL;
  }
  map[2][1] = TILE_WALL; // West dead-end

  // Active bomb ticking at (2, 4)
  const existingBombs = new Set(['2,4']);

  // Enemy at dead end (2, 2) contemplates dropping bomb with power 1
  const danger = getBlastTiles({ r: 2, c: 2 }, 1, map);
  const simBombs = new Set(['2,2', '2,4']);
  const escape = findEscapePathBFS({ r: 2, c: 2 }, danger, map, simBombs, 8);
  const canPlace = canSafelyPlaceBomb({ r: 2, c: 2 }, 1, map, existingBombs, 8);

  assert.equal(escape, null, 'Corridor with exit blocked by active bomb must return null escape');
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must reject placement blocked by active bomb');
});

test('Multi-Format Existing Bombs: FlatHazardMask and Uint8Array correctly enforce cul-de-sac trap detection', () => {
  const map = createEmptyMap();
  for (let c = 2; c <= 5; c++) {
    map[1][c] = TILE_WALL;
    map[3][c] = TILE_WALL;
  }
  map[2][1] = TILE_WALL;

  // Active bomb at (2, 4)
  const bombMaskFlat = new FlatHazardMask(ROWS * COLS);
  bombMaskFlat.setCoord(2, 4, 1);

  const bombArray = new Uint8Array(ROWS * COLS);
  bombArray[2 * COLS + 4] = 1;

  const canPlaceFlat = canSafelyPlaceBomb({ r: 2, c: 2 }, 1, map, bombMaskFlat, 8);
  const canPlaceArray = canSafelyPlaceBomb({ r: 2, c: 2 }, 1, map, bombArray, 8);

  assert.equal(canPlaceFlat, false, 'FlatHazardMask existing bomb must reject placement');
  assert.equal(canPlaceArray, false, 'Uint8Array existing bomb must reject placement');
});

test('Step Limit Exhaustion: Cul-de-sac longer than maxEscapeSteps rejects placement', () => {
  const map = createEmptyMap();
  // Long corridor along row 1, cols 1..13
  for (let c = 1; c <= 13; c++) {
    map[2][c] = TILE_WALL;
  }
  map[1][0] = TILE_WALL; // West wall

  // Bomb at (1, 1) with power 7 (blast covers cols 1..8)
  // Nearest safe tile is at (1, 9), requiring 8 steps from (1, 1)
  // If maxEscapeSteps = 6, it cannot reach (1, 9)
  const canPlace6 = canSafelyPlaceBomb({ r: 1, c: 1 }, 7, map, new Set(), 6);
  assert.equal(canPlace6, false, 'Must reject when safe tile requires more steps than maxEscapeSteps');

  // If maxEscapeSteps = 10, it CAN reach (1, 9) safely
  const canPlace10 = canSafelyPlaceBomb({ r: 1, c: 1 }, 7, map, new Set(), 10);
  assert.equal(canPlace10, true, 'Must approve when safe tile is within maxEscapeSteps');
});

/* ==============================================================================
 * SUITE 3: PRODUCTION ENEMY ENTITY FSM CUL-DE-SAC INVARIANT TESTS
 * ============================================================================== */

test('ChaserEnemy & BomberEnemy FSM: 100 consecutive frames in cul-de-sac produces 0 dropped bombs', () => {
  const scene = createMockScene();
  const map = createEmptyMap();

  // Dead end at (1, 1): surrounded by walls at (0, 1), (1, 0), (2, 1), (1, 2)
  map[2][1] = TILE_WALL;
  map[1][2] = TILE_WALL;

  const chaser = new ChaserEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  const bomber = new BomberEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);

  chaser.bombCooldownTimer = 0;
  bomber.bombCooldownTimer = 0;

  let chaserDropped = 0;
  let bomberDropped = 0;

  const chaserCallback = () => {
    chaserDropped++;
    return true;
  };
  const bomberCallback = () => {
    bomberDropped++;
    return true;
  };

  const player = { x: 3 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true };

  for (let frame = 0; frame < 100; frame++) {
    chaser.updateAI(16, frame * 16, player, map, new Set(), chaserCallback);
    bomber.updateAI(16, frame * 16, player, map, new Set(), bomberCallback);
  }

  assert.equal(chaserDropped, 0, 'ChaserEnemy must never drop bomb in cul-de-sac');
  assert.equal(bomberDropped, 0, 'BomberEnemy must never drop bomb in cul-de-sac');
  assert.equal(chaser.activeBombs, 0);
  assert.equal(bomber.activeBombs, 0);
  assert.notEqual(chaser.aiState, EnemyState.EVADING);
  assert.notEqual(bomber.aiState, EnemyState.EVADING);
});

test('Positive Control: Enemy drops bomb and executes clean evacuation when safe alcove exists', () => {
  const scene = createMockScene();
  const map = createEmptyMap();

  // Corridor with an L-bend alcove around the corner:
  // Enemy at (1, 2)
  // East wall at (1, 4)
  map[1][4] = TILE_WALL;
  // South of (1, 2) is walled off
  map[2][2] = TILE_WALL;
  // West tile (1, 1) is in blast ray
  map[1][1] = TILE_EMPTY;
  // Alcove around corner at (2, 1) is shielded from cross blast of (1, 2)
  map[2][1] = TILE_EMPTY;
  map[3][1] = TILE_WALL; // Alcove bottom
  map[2][0] = TILE_WALL; // Alcove left wall

  // Player at (1, 3)
  const player = { x: 3 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true };

  const bomber = new BomberEnemy(scene, 2 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  bomber.bombCooldownTimer = 0;
  bomber.bombPower = 2;

  let dropped = false;
  let droppedCoord = null;
  const dropCallback = (r, c) => {
    dropped = true;
    droppedCoord = { r, c };
    return true;
  };

  bomber.updateAI(16, 16, player, map, new Set(), dropCallback);

  assert.equal(dropped, true, 'Bomber must drop bomb when safe L-bend alcove is available');
  assert.deepEqual(droppedCoord, { r: 1, c: 2 });
  assert.equal(bomber.aiState, EnemyState.EVADING);
  assert.ok(bomber.escapePath !== null && bomber.escapePath.length > 0);

  // Final destination must be the safe alcove at (2, 1)
  const dest = bomber.escapePath[bomber.escapePath.length - 1];
  assert.equal(dest.r, 2);
  assert.equal(dest.c, 1);
});

/* ==============================================================================
 * SUITE 4: 5,000 MONTE CARLO RANDOMIZED ADVERSARIAL CUL-DE-SAC SOAK TEST
 * ============================================================================== */

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('Monte Carlo Invariant: 5,000 randomized cul-de-sac scenarios enforce 0.0% suicide rate', () => {
  const rng = mulberry32(0xcafebabe);

  let totalTrials = 0;
  let culDeSacRejections = 0;
  let safeEscapesApproved = 0;
  let falseApprovalsInTraps = 0;
  let blastSelfHits = 0;

  for (let trial = 1; trial <= 5000; trial++) {
    totalTrials++;

    const map = createEmptyMap();
    const existingBombs = new Set();
    const power = 1 + Math.floor(rng() * 5); // 1..5
    const maxSteps = 4 + Math.floor(rng() * 5); // 4..8

    // Random enemy location
    const er = 2 + Math.floor(rng() * (ROWS - 4));
    const ec = 2 + Math.floor(rng() * (COLS - 4));

    const isCulDeSac = (trial % 2) === 0;

    if (isCulDeSac) {
      // Seal 3 sides of (er, ec)
      map[er - 1][ec] = TILE_WALL; // North
      map[er + 1][ec] = TILE_WALL; // South
      map[er][ec - 1] = TILE_WALL; // West

      // Tunnel length of open East tiles
      const tunnelLength = 1 + Math.floor(rng() * 3);
      for (let step = 1; step <= tunnelLength; step++) {
        map[er - 1][ec + step] = TILE_WALL;
        map[er + 1][ec + step] = TILE_WALL;
      }
      // Dead end wall at end of tunnel
      map[er][ec + tunnelLength + 1] = TILE_WALL;

      // Because tunnel is completely sealed and power >= tunnelLength, this is a 100% cul-de-sac
      if (power >= tunnelLength) {
        const canPlace = canSafelyPlaceBomb({ r: er, c: ec }, power, map, existingBombs, maxSteps);
        const escape = getSafeBombEscapePath({ r: er, c: ec }, power, map, existingBombs, maxSteps);

        if (canPlace || escape !== null) {
          falseApprovalsInTraps++;
        } else {
          culDeSacRejections++;
        }
      }
    } else {
      // Open or semi-open layout with potential safe paths
      if (rng() < 0.3) {
        // Add random existing bomb nearby
        existingBombs.add(`${er + 1},${ec + 1}`);
      }

      const escape = getSafeBombEscapePath({ r: er, c: ec }, power, map, existingBombs, maxSteps);
      if (escape && escape.length > 0) {
        safeEscapesApproved++;

        // Verify destination is strictly safe
        const blast = getBlastTiles({ r: er, c: ec }, power, map);
        const dest = escape[escape.length - 1];
        if (blast.has(`${dest.r},${dest.c}`)) {
          blastSelfHits++;
        }
      }
    }
  }

  assert.equal(totalTrials, 5000);
  assert.equal(falseApprovalsInTraps, 0, 'Zero false approvals in guaranteed cul-de-sacs');
  assert.equal(blastSelfHits, 0, 'Zero escape paths lead to blast self-hit tiles');
  assert.ok(culDeSacRejections > 1500, `Must have rejected over 1,500 cul-de-sacs (got ${culDeSacRejections})`);
  assert.ok(safeEscapesApproved > 500, `Must have approved valid escapes (got ${safeEscapesApproved})`);
});
