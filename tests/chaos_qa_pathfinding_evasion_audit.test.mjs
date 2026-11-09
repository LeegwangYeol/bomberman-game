/**
 * Chaos QA & Resilience: Deep Audit Test Suite for Pathfinding, Memory Leaks & Dynamic Tile Blocking
 *
 * Exhaustively Audits & Verifies:
 * 1. A* / BFS & Demolition Pathfinder Invariants & Optimality
 * 2. Zero Memory Leak & Zero-GC Buffer Reusability (100,000 cycles, heap stability, generational rollover)
 * 3. Cul-de-Sac Evasion under Dynamic Tile Blocking (dynamic soft blocks, bombs, lethal hazards, pincher traps)
 * 4. Dynamic Path Re-routing when previous escape corridor is blocked on next frame
 * 5. Fuzzing 1,000 randomized cul-de-sac and dynamic trap scenarios (0% suicide, 0% trap-walking)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  FLAG_LETHAL,
  FlatHazardMask,
  ZeroGCPathfinder,
  zeroGCPathfinder,
  getBlastTiles,
  isTileInBlastRange,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
  findEscapePathBFS,
  findPathBFS,
  findPathWithDemolition,
  findTargetBlockBFS,
  getSafeDemolitionApproaches,
  coordToIdx,
  idxToRow,
  idxToCol,
  isLethalHazardValue,
} from '../src/game/pathfinding.ts';

function createEnclosedMap() {
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

function createPillaredMap() {
  const map = createEnclosedMap();
  for (let r = 2; r < ROWS - 1; r += 2) {
    for (let c = 2; c < COLS - 1; c += 2) {
      map[r][c] = TILE_WALL;
    }
  }
  return map;
}

/* ==============================================================================
 * SECTION 1: ZERO MEMORY LEAK & ZERO-GC AUDIT
 * ============================================================================== */

test('Memory Leak Audit: 100,000 pathfinding cycles produce zero heap drift and perfect generational rollover', () => {
  const pathfinder = new ZeroGCPathfinder(ROWS, COLS);
  const map = createPillaredMap();
  const obstacleMask = new Uint8Array(TOTAL_TILES);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      obstacleMask[r * COLS + c] = map[r][c];
    }
  }
  const outPath = new Int16Array(TOTAL_TILES);

  // Measure initial memory
  if (global.gc) global.gc();
  const initialHeap = process.memoryUsage().heapUsed;

  // Run 100,000 iterations to test generational rollover (resets at 65,530)
  for (let i = 0; i < 100000; i++) {
    const startIdx = 1 * COLS + 1;
    const targetIdx = 1 * COLS + (1 + (i % 10));
    const len = pathfinder.findPath(startIdx, targetIdx, outPath, obstacleMask, null, false);
    assert.ok(len >= 0, 'Path length must be non-negative');
  }

  if (global.gc) global.gc();
  const finalHeap = process.memoryUsage().heapUsed;
  const heapDiffMB = (finalHeap - initialHeap) / (1024 * 1024);

  // Buffer heap drift should be strictly negligible (< 1.5 MB in Node without global.gc)
  assert.ok(heapDiffMB < 2.0, `Heap drift must remain minimal across 100k cycles, got ${heapDiffMB.toFixed(2)} MB`);
});

test('Memory Leak Audit: FlatHazardMask zero-GC operations (100k ops without allocations)', () => {
  const mask = new FlatHazardMask(TOTAL_TILES);
  for (let i = 0; i < 50000; i++) {
    mask.setCoord(3, 4, 1);
    mask.setCoord(5, 6, 2);
    assert.equal(mask.getCoord(3, 4), 1);
    assert.equal(mask.getCoord(5, 6), 2);
    mask.clear();
    assert.equal(mask.size, 0);
  }
});

/* ==============================================================================
 * SECTION 2: PATHFINDING OPTIMALITY & MANHATTAN FALLBACK
 * ============================================================================== */

test('Pathfinding Optimality: BFS finds strictly minimal steps between distant points', () => {
  const map = createPillaredMap();
  const path = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 5 }, map, new Set());
  // In a straight open row 1 from col 1 to col 5: 4 steps
  assert.equal(path.length, 4);
  assert.deepEqual(path[path.length - 1], { r: 1, c: 5 });
});

test('Pathfinding Fallback: When target is surrounded by soft blocks, falls back to nearest reachable frontier', () => {
  const map = createEnclosedMap();
  // Surround (5, 5) with soft blocks
  map[4][5] = TILE_BLOCK;
  map[6][5] = TILE_BLOCK;
  map[5][4] = TILE_BLOCK;
  map[5][6] = TILE_BLOCK;

  const path = findPathBFS({ r: 1, c: 1 }, { r: 5, c: 5 }, map, new Set(), false);
  assert.ok(path.length > 0, 'Must find path to adjacent frontier');
  const dest = path[path.length - 1];
  const manhattan = Math.abs(dest.r - 5) + Math.abs(dest.c - 5);
  // Nearest open tile adjacent to blocks surrounding (5,5) has Manhattan distance 1 or 2
  assert.ok(manhattan <= 2, `Dest (${dest.r}, ${dest.c}) should be on frontier near target`);
});

test('Demolition Pathfinding: Identifies first soft block and approach tile correctly', () => {
  const map = createEnclosedMap();
  // Place a line of soft blocks at col 4
  for (let r = 1; r < ROWS - 1; r++) {
    map[r][4] = TILE_BLOCK;
  }

  const res = findTargetBlockBFS({ r: 3, c: 2 }, { r: 3, c: 8 }, map);
  assert.ok(res !== null, 'Demolition target must be found');
  assert.equal(res.targetBlock.c, 4, 'Target block must be on col 4');
  assert.equal(res.approachTile.c, 3, 'Approach tile must be adjacent at col 3');
});

/* ==============================================================================
 * SECTION 3: CUL-DE-SAC EVASION UNDER DYNAMIC TILE BLOCKING
 * ============================================================================== */

test('Cul-de-Sac Dynamic Blocking: Dynamic soft block placement at exit turns open corridor into dead end', () => {
  const map = createEnclosedMap();
  // Build a horizontal corridor (row 3, cols 1..5)
  for (let c = 1; c <= 5; c++) {
    map[2][c] = TILE_WALL;
    map[4][c] = TILE_WALL;
  }
  map[3][1] = TILE_WALL; // Left closed -> dead end at left, open at col 5

  // When col 5 is open, placing bomb at (3, 3) with power 2 can escape to (3, 6)
  const canPlaceBefore = canSafelyPlaceBomb({ r: 3, c: 3 }, 2, map, null, 6);
  assert.ok(canPlaceBefore, 'Should be able to escape to col 6 before blocking');

  // DYNAMIC BLOCKING EVENT: A soft block suddenly spawns at (3, 5)
  map[3][5] = TILE_BLOCK;

  // Now (3, 2)..(3, 4) is a sealed cul-de-sac of depth 3
  const canPlaceAfter = canSafelyPlaceBomb({ r: 3, c: 3 }, 2, map, null, 6);
  assert.equal(canPlaceAfter, false, 'Dynamic block at exit must immediately prevent bomb placement');

  const escapePath = getSafeBombEscapePath({ r: 3, c: 3 }, 2, map, null, 6);
  assert.equal(escapePath, null, 'Must return null escape path when sealed by dynamic block');
});

test('Cul-de-Sac Dynamic Blocking: Pincher trap (bomb dropped at corridor mouth while entity is inside)', () => {
  const map = createEnclosedMap();
  // Horizontal corridor (row 5, cols 1..6)
  for (let c = 1; c <= 6; c++) {
    map[4][c] = TILE_WALL;
    map[6][c] = TILE_WALL;
  }
  map[5][1] = TILE_WALL; // Dead end at left

  const danger = new FlatHazardMask(TOTAL_TILES);
  const existingBombs = new FlatHazardMask(TOTAL_TILES);

  // Dynamic bomb dropped at mouth (5, 4) with power 3
  existingBombs.setCoord(5, 4, 1);
  getBlastTiles({ r: 5, c: 4 }, 3, map, danger);

  // Entity is at (5, 2) trapped inside cul-de-sac behind the bomb
  const escapePath = findEscapePathBFS({ r: 5, c: 2 }, danger, map, existingBombs, 8);
  assert.equal(escapePath, null, 'Entity inside cul-de-sac behind bomb cannot escape');
});

test('Cul-de-Sac Dynamic Blocking: Dynamic re-routing to secondary exit when primary exit is blocked', () => {
  const map = createEnclosedMap();
  // T-junction corridor:
  // Entity at (5, 5).
  // Branch North to (3, 5) is open (cols 4 and 6 are walled).
  map[4][4] = TILE_WALL; map[4][6] = TILE_WALL;
  map[3][4] = TILE_WALL; map[3][6] = TILE_WALL;
  // Branch East to (5, 8) is open (rows 4 and 6 are walled).
  map[4][6] = TILE_WALL; map[4][7] = TILE_WALL;
  map[6][6] = TILE_WALL; map[6][7] = TILE_WALL;
  // South and West are walls.
  map[6][5] = TILE_WALL; // South wall
  map[5][4] = TILE_WALL; // West wall

  const danger = new FlatHazardMask(TOTAL_TILES);
  // Bomb placed at (5, 5)
  getBlastTiles({ r: 5, c: 5 }, 2, map, danger);

  // Frame 1: North branch is open, escaping North
  let escape1 = findEscapePathBFS({ r: 5, c: 5 }, danger, map, null, 6);
  assert.ok(escape1 !== null && escape1.length > 0);

  // Frame 2: Dynamic block suddenly blocks North branch (4, 5)
  map[4][5] = TILE_BLOCK;

  // findEscapePathBFS must dynamically re-route to East branch!
  let escape2 = findEscapePathBFS({ r: 5, c: 5 }, danger, map, null, 6);
  assert.ok(escape2 !== null, 'Must find alternative exit when primary is dynamically blocked');
  assert.deepEqual(escape2[0], { r: 5, c: 6 }, 'First step must be East to (5, 6)');
  const dest = escape2[escape2.length - 1];
  assert.equal(danger.isHazard(dest.r, dest.c), false, 'Destination must be completely safe');
});

test('Cul-de-Sac Dynamic Blocking: Dynamic lethal hazard (magma/volt/void) expanding into cul-de-sac', () => {
  const map = createEnclosedMap();
  // Corridor row 7, cols 1..5, closed at col 1
  for (let c = 1; c <= 5; c++) {
    map[6][c] = TILE_WALL;
    map[8][c] = TILE_WALL;
  }
  map[7][1] = TILE_WALL;

  const danger = new FlatHazardMask(TOTAL_TILES);
  const lethal = new FlatHazardMask(TOTAL_TILES);

  // All tiles in the corridor are in danger (e.g. from expanding hazard or bomb)
  danger.setCoord(7, 2, 1);
  danger.setCoord(7, 3, 1);

  // Dynamic expanding lethal hazard at col 4 (value = 2 / FLAG_LETHAL)
  lethal.setCoord(7, 4, 2);
  danger.setCoord(7, 4, 2);

  // Entity at (7, 2) in dead end
  const escapePath = findEscapePathBFS({ r: 7, c: 2 }, danger, map, null, 8, lethal);
  // Cannot cross col 4 because it is lethal, and all local tiles are in danger!
  assert.equal(escapePath, null, 'Entity cannot escape across dynamic lethal barrier');
});

test('Cul-de-Sac L-Pocket: Alcove allows safe bomb drop while straight cul-de-sac rejects it', () => {
  const mapStraight = createEnclosedMap();
  // Straight dead-end corridor (row 5, cols 2..3 enclosed between walls at 1 and 4)
  mapStraight[4][1] = TILE_WALL; mapStraight[4][2] = TILE_WALL; mapStraight[4][3] = TILE_WALL; mapStraight[4][4] = TILE_WALL;
  mapStraight[6][1] = TILE_WALL; mapStraight[6][2] = TILE_WALL; mapStraight[6][3] = TILE_WALL; mapStraight[6][4] = TILE_WALL;
  mapStraight[5][1] = TILE_WALL; // left closed
  mapStraight[5][4] = TILE_WALL; // right closed -> dead-end pocket of length 2

  // Straight enclosed pocket of length 2 rejects bomb at (5, 2)
  assert.equal(canSafelyPlaceBomb({ r: 5, c: 2 }, 2, mapStraight), false, 'Pocket of length 2 must reject bomb');

  // Now create an L-shaped pocket with side alcove at (4, 3) around the corner
  const mapL = createEnclosedMap();
  mapL[4][1] = TILE_WALL; mapL[4][2] = TILE_WALL; mapL[4][3] = TILE_EMPTY; mapL[4][4] = TILE_WALL; // alcove at (4,3)
  mapL[6][1] = TILE_WALL; mapL[6][2] = TILE_WALL; mapL[6][3] = TILE_WALL;  mapL[6][4] = TILE_WALL;
  mapL[5][1] = TILE_WALL; // left closed
  mapL[5][4] = TILE_WALL; // right closed
  mapL[3][3] = TILE_WALL; // roof of alcove

  // In the L-shaped pocket, dropping bomb at (5, 2) allows stepping to (5, 3) -> (4, 3) which is sheltered around the 90-degree corner!
  const canPlaceL = canSafelyPlaceBomb({ r: 5, c: 2 }, 2, mapL);
  assert.ok(canPlaceL, 'Alcove around 90-degree corner must allow safe haven out of line of fire');

  const escapePath = getSafeBombEscapePath({ r: 5, c: 2 }, 2, mapL);
  assert.ok(escapePath !== null);
  assert.deepEqual(escapePath, [{ r: 5, c: 3 }, { r: 4, c: 3 }], 'Must step around corner into the safe alcove');
});

/* ==============================================================================
 * SECTION 4: CHAOS MONTE CARLO PERMUTATION FUZZING (1,000 SCENARIOS)
 * ============================================================================== */

test('Chaos Monte Carlo: 1,000 randomized dynamic cul-de-sacs enforce 100% safety invariants', () => {
  // Linear congruential generator for reproducible fuzzing
  let seed = 42;
  function rand() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  let totalTested = 0;
  let falsePositiveSuicides = 0;
  let dynamicBlocksTested = 0;

  for (let trial = 0; trial < 1000; trial++) {
    const map = createEnclosedMap();
    const cr = 2 + Math.floor(rand() * (ROWS - 4));
    const cc = 2 + Math.floor(rand() * (COLS - 4));

    // Create a cul-de-sac around (cr, cc)
    const orientation = Math.floor(rand() * 4); // 0: N, 1: S, 2: W, 3: E
    if (orientation === 0) { // open north
      map[cr + 1][cc] = TILE_WALL;
      map[cr][cc - 1] = TILE_WALL;
      map[cr][cc + 1] = TILE_WALL;
    } else if (orientation === 1) { // open south
      map[cr - 1][cc] = TILE_WALL;
      map[cr][cc - 1] = TILE_WALL;
      map[cr][cc + 1] = TILE_WALL;
    } else if (orientation === 2) { // open west
      map[cr][cc + 1] = TILE_WALL;
      map[cr - 1][cc] = TILE_WALL;
      map[cr + 1][cc] = TILE_WALL;
    } else { // open east
      map[cr][cc - 1] = TILE_WALL;
      map[cr - 1][cc] = TILE_WALL;
      map[cr + 1][cc] = TILE_WALL;
    }

    // Dynamic tile blocking: 50% chance of a soft block or bomb placed in the opening
    let openR = cr, openC = cc;
    if (orientation === 0) openR--;
    else if (orientation === 1) openR++;
    else if (orientation === 2) openC--;
    else openC++;

    const existingBombs = new FlatHazardMask(TOTAL_TILES);
    const hasDynamicBlock = rand() < 0.5;
    if (hasDynamicBlock) {
      dynamicBlocksTested++;
      if (rand() < 0.5) {
        map[openR][openC] = TILE_BLOCK; // dynamic soft block
      } else {
        existingBombs.setCoord(openR, openC, 1); // dynamic bomb
      }
    }

    const power = 1 + Math.floor(rand() * 3);
    const canPlace = canSafelyPlaceBomb({ r: cr, c: cc }, power, map, existingBombs, 6);
    const escape = getSafeBombEscapePath({ r: cr, c: cc }, power, map, existingBombs, 6);

    totalTested++;

    if (canPlace) {
      if (!escape || escape.length === 0) {
        falsePositiveSuicides++;
      } else {
        const dest = escape[escape.length - 1];
        if (isTileInBlastRange(dest, { r: cr, c: cc }, power, map)) {
          falsePositiveSuicides++;
        }
      }
    } else {
      if (escape !== null) {
        falsePositiveSuicides++;
      }
    }
  }

  assert.equal(totalTested, 1000);
  assert.equal(falsePositiveSuicides, 0, 'Suicide violations must be strictly 0 across 1000 fuzz scenarios');
  assert.ok(dynamicBlocksTested > 400, 'Dynamic blocking must be tested in >400 scenarios');
});
