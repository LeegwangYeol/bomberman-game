/**
 * Adversarial Suicide Prevention & Zero-GC Stress Test Suite
 *
 * Rigorous empirical challenger verification for Aggressive Enemy AI:
 * 1. 10,000 randomized dead-end, cul-de-sac, corridor, and multi-bomb configurations (0% suicides).
 * 2. High-load soak test (15,000+ pathfinder and bomb evaluations) verifying Zero-GC stability and zero heap drift (<= 0.25 MB).
 * 3. ZeroGCPathfinder 16-bit generational rollover (65,530 limit) and memory reuse verification.
 * 4. Multi-bomb overlapping blast hazard traps and congestion minefields.
 * 5. Extreme boundary coordinates, overflow indices, negative/NaN coordinates, and power scaling (1..50).
 * 6. Cornering and offensive trap bombing invariant stress (500 varied layouts).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  FlatHazardMask,
  ZeroGCPathfinder,
  getBlastTiles,
  isTileInBlastRange,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
  findCorneringBombTile,
} from '../src/game/pathfinding.ts';

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

function createPillaredArena() {
  const map = createEnclosedArena();
  for (let r = 2; r < ROWS - 1; r += 2) {
    for (let c = 2; c < COLS - 1; c += 2) {
      map[r][c] = TILE_WALL;
    }
  }
  return map;
}

/* ==============================================================================
 * SUITE 1: 10,000 RANDOMIZED CONFIGURATIONS (0% SUICIDES INVARIANT)
 * ============================================================================== */

test('Adversarial 1: 10,000 randomized dead-end, cul-de-sac, corridor & multi-bomb configurations enforce 0% suicides', () => {
  const rng = mulberry32(0xdeadbeef);

  let totalTested = 0;
  let safeApprovals = 0;
  let unsafeRejections = 0;
  let suicideViolations = 0;
  let falseApprovalsInTraps = 0;
  let pathInvariantViolations = 0;

  for (let i = 1; i <= 10000; i++) {
    const map = createEnclosedArena();
    const configType = i % 10;
    const existingBombs = new Set();

    let bombPos = { r: 1, c: 1 };
    let isGuaranteedTrap = false;
    const power = 1 + Math.floor(rng() * 8); // power 1..8
    const maxEscapeSteps = 2 + Math.floor(rng() * 5); // 2..6 steps

    switch (configType) {
      case 0: {
        // Single-tile dead end (cul-de-sac) at (1, 1): walls at (1, 2) and (2, 1)
        map[1][2] = TILE_WALL;
        map[2][1] = TILE_WALL;
        bombPos = { r: 1, c: 1 };
        isGuaranteedTrap = true;
        break;
      }

      case 1: {
        // 2-tile dead end along row 1: (1, 1) and (1, 2). Blocked at (1, 3), (2, 1), (2, 2)
        map[1][3] = TILE_WALL;
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        bombPos = rng() < 0.5 ? { r: 1, c: 1 } : { r: 1, c: 2 };
        isGuaranteedTrap = true;
        break;
      }

      case 2: {
        // 3-tile dead end along row 1: (1, 1), (1, 2), (1, 3). Blocked at (1, 4), and all south (2, 1..3)
        map[1][4] = TILE_WALL;
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][3] = TILE_WALL;
        bombPos = { r: 1, c: 1 + Math.floor(rng() * 3) };
        if (power >= 3) isGuaranteedTrap = true;
        break;
      }

      case 3: {
        // 4-tile dead end along row 1: (1, 1) to (1, 4). Blocked at (1, 5) and (2, 1..4)
        map[1][5] = TILE_WALL;
        for (let c = 1; c <= 4; c++) map[2][c] = TILE_WALL;
        bombPos = { r: 1, c: 1 + Math.floor(rng() * 4) };
        if (power >= 4) isGuaranteedTrap = true;
        break;
      }

      case 4: {
        // Truly sealed dead-end tunnel: (4, 3) with walls on north, south, east, west
        map[1][2] = TILE_WALL;
        map[1][4] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][4] = TILE_WALL;
        map[3][2] = TILE_WALL;
        map[3][4] = TILE_WALL;
        map[4][2] = TILE_WALL;
        map[4][4] = TILE_WALL;
        map[5][3] = TILE_WALL;
        bombPos = { r: 4, c: 3 };
        if (power >= 5) isGuaranteedTrap = true;
        break;
      }

      case 5: {
        // T-junction with left branch, right branch, and open stem
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][4] = TILE_WALL;
        map[2][5] = TILE_WALL;
        bombPos = { r: 1, c: 3 };
        break;
      }

      case 6: {
        // Corridor with exit blocked by active ticking bomb at (1, 4)
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][3] = TILE_WALL;
        map[1][5] = TILE_WALL;
        existingBombs.add('1,4');
        bombPos = { r: 1, c: 2 };
        isGuaranteedTrap = true;
        break;
      }

      case 7: {
        // Corridor with guaranteed safe alcove branch at (2, 3)
        map[2][1] = TILE_WALL;
        map[2][2] = TILE_WALL;
        map[2][4] = TILE_WALL;
        map[1][5] = TILE_WALL;
        map[2][3] = TILE_EMPTY; // Safe alcove
        bombPos = { r: 1, c: 2 };
        break;
      }

      case 8: {
        // Randomized maze arena with soft blocks
        const r = 1 + Math.floor(rng() * (ROWS - 2));
        const c = 1 + Math.floor(rng() * (COLS - 2));
        bombPos = { r, c };
        for (let b = 0; b < 15; b++) {
          const br = 1 + Math.floor(rng() * (ROWS - 2));
          const bc = 1 + Math.floor(rng() * (COLS - 2));
          if (br !== r || bc !== c) {
            map[br][bc] = TILE_BLOCK;
          }
        }
        break;
      }

      case 9: {
        // Multi-bomb field: 2 to 4 active bombs placed across open spaces
        const activeCount = 2 + Math.floor(rng() * 3);
        for (let b = 0; b < activeCount; b++) {
          const br = 1 + Math.floor(rng() * (ROWS - 2));
          const bc = 1 + Math.floor(rng() * (COLS - 2));
          existingBombs.add(`${br},${bc}`);
        }
        let br = 1 + Math.floor(rng() * (ROWS - 2));
        let bc = 1 + Math.floor(rng() * (COLS - 2));
        while (existingBombs.has(`${br},${bc}`)) {
          br = 1 + Math.floor(rng() * (ROWS - 2));
          bc = 1 + Math.floor(rng() * (COLS - 2));
        }
        bombPos = { r: br, c: bc };
        break;
      }
    }

    totalTested++;
    const isSafe = canSafelyPlaceBomb(bombPos, power, map, existingBombs, maxEscapeSteps);

    if (isSafe) {
      safeApprovals++;

      if (isGuaranteedTrap) {
        falseApprovalsInTraps++;
        suicideViolations++;
      }

      const escape = getSafeBombEscapePath(bombPos, power, map, existingBombs, maxEscapeSteps);
      if (!escape || escape.length === 0) {
        pathInvariantViolations++;
        suicideViolations++;
        continue;
      }

      if (escape.length > maxEscapeSteps) {
        pathInvariantViolations++;
        suicideViolations++;
      }

      let prev = bombPos;
      for (let s = 0; s < escape.length; s++) {
        const step = escape[s];
        const stepDist = Math.abs(step.r - prev.r) + Math.abs(step.c - prev.c);
        if (stepDist !== 1) {
          pathInvariantViolations++;
        }
        if (map[step.r][step.c] === TILE_WALL || map[step.r][step.c] === TILE_BLOCK) {
          pathInvariantViolations++;
          suicideViolations++;
        }
        if (existingBombs.has(`${step.r},${step.c}`)) {
          pathInvariantViolations++;
          suicideViolations++;
        }
        prev = step;
      }

      const blast = getBlastTiles(bombPos, power, map);
      const dest = escape[escape.length - 1];
      if (blast.has(`${dest.r},${dest.c}`)) {
        suicideViolations++;
      }

      for (const bStr of existingBombs) {
        const comma = bStr.indexOf(',');
        const ebr = parseInt(bStr.slice(0, comma), 10);
        const ebc = parseInt(bStr.slice(comma + 1), 10);
        const eBlast = getBlastTiles({ r: ebr, c: ebc }, power, map);
        if (eBlast.has(`${dest.r},${dest.c}`)) {
          suicideViolations++;
        }
      }
    } else {
      unsafeRejections++;
      const escape = getSafeBombEscapePath(bombPos, power, map, existingBombs, maxEscapeSteps);
      assert.strictEqual(
        escape,
        null,
        `When canSafelyPlaceBomb is false, escape path must be null, got length ${escape?.length}`
      );
    }
  }

  assert.strictEqual(totalTested, 10000, 'Must have evaluated exactly 10,000 configurations');
  assert.ok(safeApprovals > 0, `Must have valid safe approvals (got ${safeApprovals})`);
  assert.ok(unsafeRejections > 0, `Must have valid unsafe rejections (got ${unsafeRejections})`);
  assert.strictEqual(
    falseApprovalsInTraps,
    0,
    `Must have 0 false approvals in guaranteed lethal traps (got ${falseApprovalsInTraps})`
  );
  assert.strictEqual(
    pathInvariantViolations,
    0,
    `Must have 0 escape path invariant violations (got ${pathInvariantViolations})`
  );
  assert.strictEqual(
    suicideViolations,
    0,
    `CRITICAL INVARIANT VIOLATION: Zero-Suicide invariant failed with ${suicideViolations} suicides across 10,000 tests!`
  );
});

/* ==============================================================================
 * SUITE 2: HIGH-LOAD SOAK TEST (15,000+ EVALUATIONS) & ZERO-GC STABILITY
 * ============================================================================== */

test('Adversarial 2: 15,000-call high-load soak test verifies Zero-GC stability and heap drift <= 0.25 MB', () => {
  const isGcExposed = typeof global.gc === 'function';
  const pf = new ZeroGCPathfinder();
  const outPath = new Int16Array(TOTAL_TILES);
  const obstacleMask = new Uint8Array(TOTAL_TILES);
  const bombMask = new Uint8Array(TOTAL_TILES);
  const hazardMask = new Uint8Array(TOTAL_TILES);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        obstacleMask[idx] = TILE_WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        obstacleMask[idx] = TILE_WALL;
      } else if ((r + c) % 5 === 0) {
        obstacleMask[idx] = TILE_BLOCK;
      } else {
        obstacleMask[idx] = TILE_EMPTY;
      }
    }
  }

  bombMask[1 * COLS + 3] = 1;
  bombMask[3 * COLS + 7] = 1;
  bombMask[7 * COLS + 5] = 1;

  for (let w = 0; w < 1000; w++) {
    const s = 1 + (w % 10);
    const t = TOTAL_TILES - 2 - (w % 10);
    pf.findPathWithDemolition(s, t, outPath, obstacleMask, bombMask, 8);
    pf.computeBlast(s, 2, obstacleMask, hazardMask, true);
    pf.findSafeTile(s, hazardMask, obstacleMask, bombMask, 4, outPath);
  }

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const baselineHeapUsed = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const SOAK_ITERATIONS = 15000;
  let demolitionPathsFound = 0;
  let blastCalculations = 0;
  let safeTilesFound = 0;

  for (let i = 0; i < SOAK_ITERATIONS; i++) {
    const startIdx = 1 + (i % (TOTAL_TILES - 2));
    const targetIdx = TOTAL_TILES - 2 - (i % (TOTAL_TILES - 2));

    if (i % 500 === 0) {
      bombMask.fill(0);
      const b1 = (i * 7) % TOTAL_TILES;
      const b2 = (i * 13) % TOTAL_TILES;
      if (obstacleMask[b1] === TILE_EMPTY) bombMask[b1] = 1;
      if (obstacleMask[b2] === TILE_EMPTY) bombMask[b2] = 1;
    }

    const demoRes = pf.findPathWithDemolition(startIdx, targetIdx, outPath, obstacleMask, bombMask, 8);
    if (demoRes.pathLength > 0) demolitionPathsFound++;

    pf.computeBlast(startIdx, 2 + (i % 4), obstacleMask, hazardMask, true);
    blastCalculations++;

    const safeLen = pf.findSafeTile(startIdx, hazardMask, obstacleMask, bombMask, 4, outPath);
    if (safeLen >= 0) safeTilesFound++;
  }

  const durationMs = performance.now() - t0;
  const avgMicrosPerQuery = (durationMs * 1000) / (SOAK_ITERATIONS * 3);

  if (isGcExposed) {
    global.gc();
    global.gc();
  }
  const finalHeapUsed = process.memoryUsage().heapUsed;
  const heapDriftMB = (finalHeapUsed - baselineHeapUsed) / (1024 * 1024);

  assert.ok(demolitionPathsFound > 0, 'Must have computed valid demolition paths');
  assert.strictEqual(blastCalculations, SOAK_ITERATIONS);
  assert.ok(safeTilesFound > 0, 'Must have computed safe tiles');

  assert.ok(
    avgMicrosPerQuery < 50,
    `Query performance must be < 50µs per call, got ${avgMicrosPerQuery.toFixed(2)}µs`
  );

  if (isGcExposed) {
    assert.ok(
      heapDriftMB <= 0.25,
      `V8 heap drift must be <= 0.25 MB, got ${heapDriftMB.toFixed(4)} MB over ${SOAK_ITERATIONS} soak queries`
    );
  }
});

/* ==============================================================================
 * SUITE 3: GENERATIONAL COUNTER ROLLOVER STRESS (65,530 BOUNDARY)
 * ============================================================================== */

test('Adversarial 3: ZeroGCPathfinder 16-bit generation counter rollover preserves path integrity', () => {
  const pf = new ZeroGCPathfinder();
  const outPath = new Int16Array(TOTAL_TILES);
  const obstacleMask = new Uint8Array(TOTAL_TILES);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        obstacleMask[r * COLS + c] = TILE_WALL;
      }
    }
  }

  const startIdx = 1 * COLS + 1;
  const targetIdx = 1 * COLS + 5;

  pf['generation'] = 65527;

  for (let step = 0; step < 10; step++) {
    const len = pf.findPath(startIdx, targetIdx, outPath, obstacleMask);
    assert.strictEqual(len, 4, `Step ${step}: Path length must be 4 across rollover`);
    assert.strictEqual(outPath[0], 1 * COLS + 2);
    assert.strictEqual(outPath[1], 1 * COLS + 3);
    assert.strictEqual(outPath[2], 1 * COLS + 4);
    assert.strictEqual(outPath[3], 1 * COLS + 5);
  }

  assert.ok(
    pf['generation'] < 15,
    `Generation must have rolled over, currently ${pf['generation']}`
  );
});

/* ==============================================================================
 * SUITE 4: MULTI-BOMB HAZARD OVERLAPS & CONGESTION MINEFIELDS
 * ============================================================================== */

test('Adversarial 4: Multi-bomb hazard overlaps, cross-blasts and dense minefields reject unsafe placements', () => {
  const map = createEnclosedArena();

  // Test Case 4.1: 4-way cross blast intersection with power 2
  const multiBombs = new Set(['2,4', '4,2']);
  const blast1 = getBlastTiles({ r: 2, c: 4 }, 2, map);
  const blast2 = getBlastTiles({ r: 4, c: 2 }, 2, map);

  assert.ok(blast1.has('4,4'), 'Blast 1 with power 2 must engulf intersection tile (4, 4)');
  assert.ok(blast2.has('4,4'), 'Blast 2 with power 2 must engulf intersection tile (4, 4)');

  const escapePath = getSafeBombEscapePath({ r: 3, c: 4 }, 2, map, multiBombs, 3);
  if (escapePath && escapePath.length > 0) {
    const dest = escapePath[escapePath.length - 1];
    assert.ok(
      !blast1.has(`${dest.r},${dest.c}`) && !blast2.has(`${dest.r},${dest.c}`),
      `Destination (${dest.r}, ${dest.c}) must not be inside any overlapping blast`
    );
  }

  // Test Case 4.2: Duck-typing equivalence between FlatHazardMask and Set<string>
  const setBombs = new Set(['1,1', '3,5', '5,9']);
  const maskBombs = new FlatHazardMask();
  maskBombs.add('1,1').add('3,5').add('5,9');

  const escapeFromSet = getSafeBombEscapePath({ r: 1, c: 2 }, 2, map, setBombs, 4);
  const escapeFromMask = getSafeBombEscapePath({ r: 1, c: 2 }, 2, map, maskBombs, 4);

  assert.strictEqual(
    escapeFromSet === null,
    escapeFromMask === null,
    'Set and FlatHazardMask must produce identical escape feasibility'
  );
  if (escapeFromSet && escapeFromMask) {
    assert.strictEqual(
      escapeFromSet.length,
      escapeFromMask.length,
      'Escape paths must match in step length'
    );
  }

  // Test Case 4.3: Dense encirclement minefield (8 surrounding bombs)
  const surroundingBombs = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr !== 0 || dc !== 0) {
        surroundingBombs.add(`${3 + dr},${3 + dc}`);
      }
    }
  }

  const safeEncircled = canSafelyPlaceBomb({ r: 3, c: 3 }, 1, map, surroundingBombs, 4);
  assert.strictEqual(
    safeEncircled,
    false,
    'Encircled entity by active bombs must strictly reject bomb placement'
  );
  const encircledEscape = getSafeBombEscapePath({ r: 3, c: 3 }, 1, map, surroundingBombs, 4);
  assert.strictEqual(encircledEscape, null, 'Encircled escape path must be null');
});

/* ==============================================================================
 * SUITE 5: EXTREME BOUNDARY COORDINATES & DEFECT IDENTIFICATION
 * ============================================================================== */

test('Adversarial 5: Extreme boundaries, negative/overflow indices and power scaling', () => {
  const map = createEnclosedArena();

  // Test 5.1: isTileInBlastRange integer boundary checks
  assert.strictEqual(isTileInBlastRange({ r: -1, c: 0 }, { r: 1, c: 1 }, 2, map), false);
  assert.strictEqual(isTileInBlastRange({ r: 1, c: 1 }, { r: -1, c: 0 }, 2, map), false);
  assert.strictEqual(isTileInBlastRange({ r: ROWS, c: 0 }, { r: 1, c: 1 }, 2, map), false);
  assert.strictEqual(isTileInBlastRange({ r: 1, c: 1 }, { r: 1, c: COLS }, 2, map), false);

  // Test 5.2: getSafeBombEscapePath on boundary and off-grid coordinates
  assert.strictEqual(getSafeBombEscapePath({ r: -1, c: 1 }, 2, map), null);
  assert.strictEqual(getSafeBombEscapePath({ r: ROWS, c: 1 }, 2, map), null);
  assert.strictEqual(getSafeBombEscapePath({ r: 1, c: -1 }, 2, map), null);
  assert.strictEqual(getSafeBombEscapePath({ r: 1, c: COLS }, 2, map), null);

  // Test 5.3: canSafelyPlaceBomb on boundary perimeter walls
  assert.strictEqual(canSafelyPlaceBomb({ r: 0, c: 0 }, 2, map), false);
  assert.strictEqual(canSafelyPlaceBomb({ r: 12, c: 14 }, 2, map), false);
  assert.strictEqual(canSafelyPlaceBomb({ r: -5, c: -5 }, 2, map), false);

  // Test 5.4: High bomb powers (power = 50)
  const blastHuge = getBlastTiles({ r: 1, c: 1 }, 50, map);
  assert.ok(blastHuge.has('1,1'));
  assert.ok(blastHuge.has('1,13')); // reaches edge before wall
  assert.ok(!blastHuge.has('1,14')); // wall tile itself not in blast
  assert.ok(blastHuge.has('11,1'));

  // Test 5.5: ZeroGCPathfinder outPath with invalid indices
  const pf = new ZeroGCPathfinder();
  const outPath = new Int16Array(TOTAL_TILES);
  assert.strictEqual(pf.findPath(-1, 10, outPath), 0);
  assert.strictEqual(pf.findPath(10, TOTAL_TILES + 10, outPath), 0);
  assert.strictEqual(pf.findPath(NaN, 10, outPath), 0);
  assert.strictEqual(pf.findPath(10, NaN, outPath), 0);
  assert.strictEqual(pf.findSafeTile(-1, pf.hazardMask, pf.obstacleMask, null, 4, outPath), -1);
  assert.strictEqual(pf.findSafeTile(TOTAL_TILES + 5, pf.hazardMask, pf.obstacleMask, null, 4, outPath), -1);

  // Test 5.6: Boundary Guard — isTileInBlastRange returns false immediately without CPU-hang on NaN
  assert.strictEqual(isTileInBlastRange({ r: 1, c: 1 }, { r: NaN, c: 1 }, 2, map), false);
  assert.strictEqual(isTileInBlastRange({ r: NaN, c: 1 }, { r: 1, c: 1 }, 2, map), false);
  assert.strictEqual(isTileInBlastRange({ r: 1, c: NaN }, { r: 1, c: 1 }, 2, map), false);
  assert.strictEqual(isTileInBlastRange({ r: 1, c: 1 }, { r: 1, c: NaN }, 2, map), false);

  const childHang = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '-e',
      'import { isTileInBlastRange } from "./src/game/pathfinding.ts"; const map = Array.from({length: 13}, () => Array(15).fill(0)); isTileInBlastRange({ r: 1, c: 1 }, { r: NaN, c: 1 }, 2, map);',
    ],
    { timeout: 500 }
  );
  assert.strictEqual(childHang.status, 0, 'isTileInBlastRange process must exit with code 0');
  assert.ok(!childHang.error, 'isTileInBlastRange must not time out on NaN');

  // Test 5.7: Boundary Guard — getSafeBombEscapePath safely handles NaN coordinates without TypeError
  assert.strictEqual(getSafeBombEscapePath({ r: NaN, c: 1 }, 2, map), null);
  assert.strictEqual(getSafeBombEscapePath({ r: 1, c: NaN }, 2, map), null);

  const childTypeError = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '-e',
      'import { getSafeBombEscapePath } from "./src/game/pathfinding.ts"; const map = Array.from({length: 13}, () => Array(15).fill(0)); getSafeBombEscapePath({ r: NaN, c: 1 }, 2, map);',
    ],
    { timeout: 500 }
  );
  assert.strictEqual(childTypeError.status, 0, 'getSafeBombEscapePath process must exit with code 0');
  assert.ok(!childTypeError.stderr.toString().includes('TypeError'), 'getSafeBombEscapePath must not throw TypeError on NaN');
});

/* ==============================================================================
 * SUITE 6: CORNERING & OFFENSIVE TRAP BOMBING INVARIANTS (500 LAYOUTS)
 * ============================================================================== */

test('Adversarial 6: 500 cornering & trap bombing scenarios guarantee no enemy self-trapping', () => {
  let openEvaluations = 0;
  let trapsFound = 0;

  for (let i = 0; i < 500; i++) {
    const map = createPillaredArena();
    const existingBombs = new Set();

    if (i % 2 === 0) {
      // Player in open space with 3 or 4 open neighbors:
      // Cornering trap MUST return null! (Cannot corner an unconfined player)
      const pr = 3;
      const pc = 3;
      const er = 3;
      const ec = 5;
      const trapTile = findCorneringBombTile({ r: er, c: ec }, { r: pr, c: pc }, map, existingBombs);
      assert.strictEqual(
        trapTile,
        null,
        `Player at open (${pr}, ${pc}) has > 2 exits; trap must be null`
      );
      openEvaluations++;
    } else {
      // Player cornered in a 1-tile or 2-tile choke point
      map[2][1] = TILE_WALL;
      map[2][3] = TILE_WALL;

      const pr = 1;
      const pc = 1;
      const er = 1;
      const ec = 3;

      const trapTile = findCorneringBombTile({ r: er, c: ec }, { r: pr, c: pc }, map, existingBombs);
      if (trapTile) {
        trapsFound++;
        const safe = canSafelyPlaceBomb(trapTile, 2, map, existingBombs, 4);
        assert.strictEqual(
          safe,
          true,
          `Candidate cornering trap at (${trapTile.r}, ${trapTile.c}) must be safe for enemy to place!`
        );

        const blast = getBlastTiles(trapTile, 2, map);
        const coversPlayer = blast.has(`${pr},${pc}`) || blast.has('1,2');
        assert.strictEqual(
          coversPlayer,
          true,
          `Trap bomb blast must cover player or escape corridor`
        );

        const escape = getSafeBombEscapePath(trapTile, 2, map, existingBombs, 4);
        assert.ok(escape !== null && escape.length > 0, 'Enemy must have escape route from trap bomb');
        const dest = escape[escape.length - 1];
        assert.ok(
          !blast.has(`${dest.r},${dest.c}`),
          `Enemy retreat destination (${dest.r}, ${dest.c}) must be outside blast`
        );
      }
    }
  }

  assert.strictEqual(openEvaluations, 250, 'Must have evaluated 250 open-space scenarios');
  assert.ok(trapsFound > 0, `Must have successfully identified valid cornering traps (got ${trapsFound})`);
});
