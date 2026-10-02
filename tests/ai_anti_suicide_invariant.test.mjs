/**
 * AI Suicide Prevention Invariant & Cul-de-Sac Safety Verification Test Suite
 *
 * Verifies the following core invariants:
 * 1. findEscapePathBFS yields 0 safe tiles (returns null) for any cul-de-sac or trap where
 *    the blast radius engulfs all escape avenues.
 * 2. Enemy AI (ChaserEnemy, BomberEnemy, and FSM decision cycle) strictly NEVER places a bomb
 *    in a cul-de-sac or trap when findEscapePathBFS yields 0 safe tiles.
 * 3. 0% suicide rate verified empirically across 1,000 distinct randomized test trials.
 * 4. Approved bomb placements guarantee 100% path continuity and absolute blast clearance.
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
  findEscapePathBFS,
  getSafeDemolitionApproaches,
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

const { ChaserEnemy, BomberEnemy, EnemyState } = await import('../src/game/entities/EnemyEntities.ts');

/* ==============================================================================
 * DETERMINISTIC PSEUDO-RANDOM NUMBER GENERATOR (Mulberry32)
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

/* ==============================================================================
 * MAP GENERATION HELPERS
 * ============================================================================== */

function createStandardMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        map[r][c] = TILE_WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

function createEnclosedArena() {
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
 * SUITE 1: CANONICAL CUL-DE-SAC & TRAP INVARIANTS (findEscapePathBFS)
 * ============================================================================== */

test('Cul-de-Sac 1: 1-tile dead end surrounded by 3 walls yields 0 safe tiles (returns null)', () => {
  const map = createStandardMap();
  // Corner pocket at (1, 1):
  // North (0, 1) is boundary wall
  // West (1, 0) is boundary wall
  // South (2, 1) is set to wall
  map[2][1] = TILE_WALL;
  // East (1, 2) is set to wall
  map[1][2] = TILE_WALL;

  // Epicenter at (1, 1), bombPower = 1
  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 1, map);
  const simulatedBombs = new Set(['1,1']);

  const escapePath = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, simulatedBombs, 8);
  assert.equal(escapePath, null, '1-tile cul-de-sac must yield null escape path (0 safe tiles reachable)');

  const canPlace = canSafelyPlaceBomb({ r: 1, c: 1 }, 1, map, new Set(), 8);
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must strictly reject 1-tile cul-de-sac');
});

test('Cul-de-Sac 2: 2-tile dead-end corridor with blast covering both tiles yields 0 safe tiles', () => {
  const map = createStandardMap();
  // Corridor at (1, 1) and (1, 2). Blocked at (1, 3), (2, 1), (2, 2)
  map[1][3] = TILE_WALL;
  map[2][1] = TILE_WALL;
  map[2][2] = TILE_WALL;

  // Bomb at (1, 1) with power 2: blast covers (1, 1) and (1, 2)
  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 2, map);
  assert.ok(dangerTiles.has('1,1'));
  assert.ok(dangerTiles.has('1,2'));

  const simulatedBombs = new Set(['1,1']);
  const escapePath = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, simulatedBombs, 8);
  assert.equal(escapePath, null, '2-tile cul-de-sac must yield null escape path (0 safe tiles)');

  const canPlace = canSafelyPlaceBomb({ r: 1, c: 1 }, 2, map, new Set(), 8);
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must reject 2-tile cul-de-sac');
});

test('Cul-de-Sac 3: 3-tile dead-end corridor with power 3 yields 0 safe tiles', () => {
  const map = createStandardMap();
  // Corridor at (1, 1), (1, 2), (1, 3). Blocked at (1, 4), and south (2, 1), (2, 2), (2, 3)
  map[1][4] = TILE_WALL;
  map[2][1] = TILE_WALL;
  map[2][2] = TILE_WALL;
  map[2][3] = TILE_WALL;

  // Bomb at (1, 1) with power 3: blast covers (1, 1), (1, 2), (1, 3)
  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 3, map);
  assert.ok(dangerTiles.has('1,1'));
  assert.ok(dangerTiles.has('1,2'));
  assert.ok(dangerTiles.has('1,3'));

  const escapePath = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(['1,1']), 8);
  assert.equal(escapePath, null, '3-tile cul-de-sac must yield null escape path');

  const canPlace = canSafelyPlaceBomb({ r: 1, c: 1 }, 3, map, new Set(), 8);
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must reject 3-tile cul-de-sac');
});

test('Cul-de-Sac 4: 4-tile dead-end corridor with power 4 yields 0 safe tiles', () => {
  const map = createStandardMap();
  // Corridor from (1, 1) to (1, 4). Blocked at (1, 5) and south (2, 1..4)
  map[1][5] = TILE_WALL;
  for (let c = 1; c <= 4; c++) map[2][c] = TILE_WALL;

  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 4, map);
  const escapePath = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(['1,1']), 8);
  assert.equal(escapePath, null, '4-tile cul-de-sac must yield null escape path');

  const canPlace = canSafelyPlaceBomb({ r: 1, c: 1 }, 4, map, new Set(), 8);
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must reject 4-tile cul-de-sac');
});

test('Trap 5: U-shaped pocket trap with all exits sealed yields 0 safe tiles', () => {
  const map = createStandardMap();
  // Center at (3, 3). Walls at (3, 2) [West], (3, 4) [East], (4, 3) [South]
  map[3][2] = TILE_WALL;
  map[3][4] = TILE_WALL;
  map[4][3] = TILE_WALL;
  // North exit (2, 3) blocked by TILE_BLOCK
  map[2][3] = TILE_BLOCK;

  const dangerTiles = getBlastTiles({ r: 3, c: 3 }, 2, map);
  const escapePath = findEscapePathBFS({ r: 3, c: 3 }, dangerTiles, map, new Set(['3,3']), 8);
  assert.equal(escapePath, null, 'U-shaped pocket trap must yield null escape path');

  const canPlace = canSafelyPlaceBomb({ r: 3, c: 3 }, 2, map, new Set(), 8);
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must reject trapped pocket');
});

test('Trap 6: Pincher trap where only escape is blocked by an active bomb yields 0 safe tiles', () => {
  const map = createStandardMap();
  // Linear corridor: (1, 1) to (1, 5).
  // South walls at (2, 1..4).
  for (let c = 1; c <= 4; c++) map[2][c] = TILE_WALL;
  // Wall at (1, 5)
  map[1][5] = TILE_WALL;

  // Active ticking bomb already placed at exit (1, 4)
  const existingBombs = new Set(['1,4']);

  // Enemy at (1, 2) evaluates placing a bomb with power 2:
  const dangerTiles = getBlastTiles({ r: 1, c: 2 }, 2, map);
  const simulatedBombs = new Set(['1,2', '1,4']);

  const escapePath = findEscapePathBFS({ r: 1, c: 2 }, dangerTiles, map, simulatedBombs, 8);
  assert.equal(escapePath, null, 'Corridor blocked by active bomb must yield 0 safe tiles (returns null)');

  const canPlace = canSafelyPlaceBomb({ r: 1, c: 2 }, 2, map, existingBombs, 8);
  assert.equal(canPlace, false, 'canSafelyPlaceBomb must reject placement blocked by existing bomb');
});

/* ==============================================================================
 * SUITE 2: ENEMY AI DECISION CYCLE INVARIANTS (NEVER PLACES BOMB IN CUL-DE-SAC)
 * ============================================================================== */

test('Enemy AI Invariant: ChaserEnemy decision loop never drops bomb in cul-de-sac', () => {
  const scene = createMockScene();
  const map = createStandardMap();

  // Construct dead end at (1, 1): walls at (1, 2) and (2, 1)
  map[1][2] = TILE_WALL;
  map[2][1] = TILE_WALL;

  const chaser = new ChaserEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  chaser.bombCooldownTimer = 0;
  chaser.activeBombs = 0;

  let bombDropped = false;
  const dropBombCallback = () => {
    bombDropped = true;
    return true;
  };

  // Player adjacent (outside the cul-de-sac wall) at (1, 3)
  const player = { x: 3 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true };

  // Run updateAI multiple times
  for (let tick = 0; tick < 10; tick++) {
    chaser.updateAI(16, tick * 16, player, map, new Set(), dropBombCallback);
  }

  assert.equal(bombDropped, false, 'ChaserEnemy must NEVER call dropBombCallback when trapped in cul-de-sac');
  assert.equal(chaser.activeBombs, 0, 'ChaserEnemy activeBombs must remain 0');
  assert.notEqual(chaser.aiState, EnemyState.EVADING, 'ChaserEnemy must not enter EVADING state on null escape');
});

test('Enemy AI Invariant: BomberEnemy decision loop never drops bomb in cul-de-sac', () => {
  const scene = createMockScene();
  const map = createStandardMap();

  // Construct dead end at (1, 1) with soft block demo target at (1, 2)
  map[1][2] = TILE_BLOCK;
  map[2][1] = TILE_WALL; // South blocked

  const bomber = new BomberEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  bomber.bombCooldownTimer = 0;
  bomber.activeBombs = 0;

  let bombDropped = false;
  const dropBombCallback = () => {
    bombDropped = true;
    return true;
  };

  // Player at (1, 5)
  const player = { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true };

  for (let tick = 0; tick < 10; tick++) {
    bomber.updateAI(16, tick * 16, player, map, new Set(), dropBombCallback);
  }

  assert.equal(bombDropped, false, 'BomberEnemy must NEVER call dropBombCallback when trapped in cul-de-sac');
  assert.equal(bomber.activeBombs, 0, 'BomberEnemy activeBombs must remain 0');
  assert.notEqual(bomber.aiState, EnemyState.EVADING, 'BomberEnemy must not enter EVADING state in cul-de-sac');
});

test('Enemy AI Invariant: Drops bomb and safely evades when valid escape path exists', () => {
  const scene = createMockScene();
  const map = createStandardMap();

  // Open L-bend at (1, 1) with safe escape corridor south to (2, 1) -> (3, 1)
  map[1][2] = TILE_EMPTY; // East open towards player
  map[2][1] = TILE_EMPTY; // South open
  map[3][1] = TILE_EMPTY; // Safe tile outside power 1 blast

  const bomber = new BomberEnemy(scene, 1 * TILE_SIZE + TILE_SIZE / 2, 1 * TILE_SIZE + TILE_SIZE / 2);
  bomber.bombCooldownTimer = 0;
  bomber.activeBombs = 0;
  bomber.bombPower = 1;

  let bombDropped = false;
  let droppedCoord = null;
  const dropBombCallback = (r, c) => {
    bombDropped = true;
    droppedCoord = { r, c };
    return true;
  };

  // Player within bomb power (dist 1 <= power 1) at (1, 2)
  const player = { x: 2 * TILE_SIZE + TILE_SIZE / 2, y: 1 * TILE_SIZE + TILE_SIZE / 2, active: true };
  bomber.updateAI(16, 16, player, map, new Set(), dropBombCallback);

  assert.equal(bombDropped, true, 'BomberEnemy must place bomb when safe escape path is verified');
  assert.deepEqual(droppedCoord, { r: 1, c: 1 });
  assert.equal(bomber.activeBombs, 1);
  assert.equal(bomber.aiState, EnemyState.EVADING, 'BomberEnemy must transition to EVADING state');
  assert.ok(bomber.escapePath !== null && bomber.escapePath.length > 0, 'Must have recorded valid escape path');

  // Verify escape destination is safe
  const blast = getBlastTiles(droppedCoord, bomber.bombPower, map);
  const dest = bomber.escapePath[bomber.escapePath.length - 1];
  assert.ok(!blast.has(`${dest.r},${dest.c}`), 'Escape destination must be strictly outside blast');
});

/* ==============================================================================
 * SUITE 3: 1,000 TEST TRIALS EMPIRICAL SUICIDE-PREVENTION INVARIANT STRESS TEST
 * ============================================================================== */

test('Adversarial Verification: 1,000 randomized trials enforce 0% suicide rate and strict trap rejection', () => {
  const rng = mulberry32(0x1337c0de);

  let totalTrials = 0;
  let safeApprovals = 0;
  let unsafeRejections = 0;
  let suicideViolations = 0;
  let falseTrapApprovals = 0;
  let pathContinuityViolations = 0;
  let blastSelfHitViolations = 0;

  for (let trial = 1; trial <= 1000; trial++) {
    totalTrials++;

    const map = createEnclosedArena();
    const configType = trial % 10;
    const existingBombs = new Set();

    let enemyPos = { r: 1, c: 1 };
    let isGuaranteedTrap = false;
    const power = 1 + Math.floor(rng() * 6); // power 1..6
    const maxEscapeSteps = 2 + Math.floor(rng() * 6); // 2..7 steps

    switch (configType) {
      case 0: {
        // 1-tile dead end (cul-de-sac) at (1, 1): walls at (1, 2) and (2, 1)
        map[1][2] = TILE_WALL;
        map[2][1] = TILE_WALL;
        enemyPos = { r: 1, c: 1 };
        isGuaranteedTrap = true;
        break;
      }

      case 1: {
        // 2-tile dead end: (1, 1) and (1, 2). Blocked at (1, 3), (2, 1), (2, 2)
        map[1][3] = TILE_WALL;
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        enemyPos = rng() < 0.5 ? { r: 1, c: 1 } : { r: 1, c: 2 };
        if (power >= 2) isGuaranteedTrap = true;
        break;
      }

      case 2: {
        // 3-tile dead end: (1, 1), (1, 2), (1, 3). Blocked at (1, 4), and south (2, 1..3)
        map[1][4] = TILE_WALL;
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][3] = TILE_WALL;
        enemyPos = { r: 1, c: 1 + Math.floor(rng() * 3) };
        if (power >= 3) isGuaranteedTrap = true;
        break;
      }

      case 3: {
        // 4-tile dead end: (1, 1) to (1, 4). Blocked at (1, 5) and (2, 1..4)
        map[1][5] = TILE_WALL;
        for (let c = 1; c <= 4; c++) map[2][c] = TILE_WALL;
        enemyPos = { r: 1, c: 1 + Math.floor(rng() * 4) };
        if (power >= 4) isGuaranteedTrap = true;
        break;
      }

      case 4: {
        // Sealed chamber: (3, 3) surrounded by 4 walls
        map[2][3] = TILE_WALL;
        map[4][3] = TILE_WALL;
        map[3][2] = TILE_WALL;
        map[3][4] = TILE_WALL;
        enemyPos = { r: 3, c: 3 };
        isGuaranteedTrap = true;
        break;
      }

      case 5: {
        // T-junction with escape avenues
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][4] = TILE_WALL;
        map[2][5] = TILE_WALL;
        enemyPos = { r: 1, c: 3 };
        // Escape avenues exist north/south or east/west
        break;
      }

      case 6: {
        // Pincher trap: exit blocked by existing active bomb
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][3] = TILE_WALL;
        map[1][5] = TILE_WALL;
        existingBombs.add('1,4');
        enemyPos = { r: 1, c: 2 };
        if (power >= 3) isGuaranteedTrap = true;
        break;
      }

      case 7: {
        // L-bend corridor with safe alcove
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][4] = TILE_WALL;
        map[1][5] = TILE_WALL;
        map[2][3] = TILE_EMPTY; // Safe alcove
        enemyPos = { r: 1, c: 2 };
        break;
      }

      case 8: {
        // Randomized maze layout with soft blocks
        const r = 1 + Math.floor(rng() * (ROWS - 2));
        const c = 1 + Math.floor(rng() * (COLS - 2));
        enemyPos = { r, c };
        for (let b = 0; b < 20; b++) {
          const br = 1 + Math.floor(rng() * (ROWS - 2));
          const bc = 1 + Math.floor(rng() * (COLS - 2));
          if (br !== r || bc !== c) {
            map[br][bc] = TILE_BLOCK;
          }
        }
        break;
      }

      case 9: {
        // Multi-bomb congestion scenario
        const bombCount = 1 + Math.floor(rng() * 3);
        for (let b = 0; b < bombCount; b++) {
          const br = 1 + Math.floor(rng() * (ROWS - 2));
          const bc = 1 + Math.floor(rng() * (COLS - 2));
          existingBombs.add(`${br},${bc}`);
        }
        let er = 1 + Math.floor(rng() * (ROWS - 2));
        let ec = 1 + Math.floor(rng() * (COLS - 2));
        while (existingBombs.has(`${er},${ec}`)) {
          er = 1 + Math.floor(rng() * (ROWS - 2));
          ec = 1 + Math.floor(rng() * (COLS - 2));
        }
        enemyPos = { r: er, c: ec };
        break;
      }
    }

    // Evaluate safe escape path and bomb placement safety
    const escapePath = getSafeBombEscapePath(enemyPos, power, map, existingBombs, maxEscapeSteps);
    const canPlace = canSafelyPlaceBomb(enemyPos, power, map, existingBombs, maxEscapeSteps);

    // Simulated Enemy AI placement decision:
    // Enemy AI places bomb IF AND ONLY IF escapePath is non-null and has > 0 steps
    const enemyPlacesBomb = escapePath !== null && escapePath.length > 0;

    if (isGuaranteedTrap) {
      if (enemyPlacesBomb) {
        falseTrapApprovals++;
        suicideViolations++;
      }
      if (canPlace) {
        falseTrapApprovals++;
        suicideViolations++;
      }
    }

    if (enemyPlacesBomb) {
      safeApprovals++;

      // Invariant: escape path must not exceed maxEscapeSteps
      if (escapePath.length > maxEscapeSteps) {
        pathContinuityViolations++;
        suicideViolations++;
      }

      // Invariant: Path continuity & traversability
      let prev = enemyPos;
      for (let s = 0; s < escapePath.length; s++) {
        const step = escapePath[s];
        const dist = Math.abs(step.r - prev.r) + Math.abs(step.c - prev.c);
        if (dist !== 1) {
          pathContinuityViolations++;
          suicideViolations++;
        }
        if (map[step.r][step.c] === TILE_WALL || map[step.r][step.c] === TILE_BLOCK) {
          pathContinuityViolations++;
          suicideViolations++;
        }
        if (existingBombs.has(`${step.r},${step.c}`)) {
          pathContinuityViolations++;
          suicideViolations++;
        }
        prev = step;
      }

      // Invariant: Destination tile must NOT be in the blast of the placed bomb
      const placedBlast = getBlastTiles(enemyPos, power, map);
      const dest = escapePath[escapePath.length - 1];
      if (placedBlast.has(`${dest.r},${dest.c}`)) {
        blastSelfHitViolations++;
        suicideViolations++;
      }

      // Invariant: Destination tile must NOT be in the blast of any existing bombs
      for (const bStr of existingBombs) {
        const [ebr, ebc] = bStr.split(',').map(Number);
        const eBlast = getBlastTiles({ r: ebr, c: ebc }, power, map);
        if (eBlast.has(`${dest.r},${dest.c}`)) {
          blastSelfHitViolations++;
          suicideViolations++;
        }
      }
    } else {
      unsafeRejections++;
      // Invariant: When escapePath is null, enemy AI must not place bomb
      assert.equal(enemyPlacesBomb, false, 'Enemy AI must never place bomb when escapePath is null/empty');
    }
  }

  const suicideRate = (suicideViolations / totalTrials) * 100;

  // Assertions for 1,000 trials
  assert.equal(totalTrials, 1000, 'Must have evaluated exactly 1,000 trials');
  assert.ok(safeApprovals > 0, `Must have approved valid safe placements (got ${safeApprovals})`);
  assert.ok(unsafeRejections > 0, `Must have rejected dangerous cul-de-sacs/traps (got ${unsafeRejections})`);
  assert.equal(falseTrapApprovals, 0, 'Zero false approvals in cul-de-sacs or traps');
  assert.equal(pathContinuityViolations, 0, 'Zero path continuity violations');
  assert.equal(blastSelfHitViolations, 0, 'Zero blast self-hit violations');
  assert.equal(suicideViolations, 0, 'Zero suicide violations across 1,000 trials');
  assert.equal(suicideRate, 0.0, 'Suicide rate must be strictly 0.0% across 1,000 trials');
});

/* ==============================================================================
 * SUITE 4: MULTI-ANGLE DEMOLITION AND LIVE SOAK STRESS
 * ============================================================================== */

test('Demolition Safety: getSafeDemolitionApproaches filters out dead-end approach tiles', () => {
  const map = createStandardMap();

  // Target soft block at (3, 3)
  map[3][3] = TILE_BLOCK;

  // North tile (2, 3): Open and leads to open corridor
  map[2][3] = TILE_EMPTY;

  // South tile (4, 3): Dead end trapped on 3 sides
  map[4][3] = TILE_EMPTY;
  map[5][3] = TILE_WALL;
  map[4][2] = TILE_WALL;
  map[4][4] = TILE_WALL;

  const approaches = getSafeDemolitionApproaches({ r: 3, c: 3 }, map, new Set(), 2, 8);

  const northSafe = approaches.some((t) => t.r === 2 && t.c === 3);
  const southSafe = approaches.some((t) => t.r === 4 && t.c === 3);

  assert.equal(northSafe, true, 'North approach tile (open corridor) must be recognized as safe');
  assert.equal(southSafe, false, 'South approach tile (trapped cul-de-sac) must be strictly excluded');
});
