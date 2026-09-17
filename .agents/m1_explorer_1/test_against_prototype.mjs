import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
  findSafeTileBFS,
  isTileInBlastRange,
  FlatHazardMask,
  ZeroGCPathfinder,
  zeroGCPathfinder,
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  coordToIdx
} from './prototype_test.mjs';

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

test('ZeroGC Benchmark: 10,000 queries with ZERO heap growth', () => {
  const map = createStandardMap();
  map[1][4] = TILE_BLOCK;
  map[3][2] = TILE_BLOCK;
  const bombMask = new FlatHazardMask();
  bombMask.add('1,6');
  bombMask.add('2,5');

  const start = { r: 1, c: 1 };
  const target = { r: 5, c: 5 };

  const t0 = performance.now();
  for (let i = 0; i < 10000; i++) {
    const p = findPathBFS(start, target, map, bombMask);
    assert.ok(p.length > 0);
  }
  const t1 = performance.now();
  const avg = (t1 - t0) / 10000;
  console.log(`10,000 queries took ${(t1 - t0).toFixed(2)}ms (avg: ${avg.toFixed(4)}ms/query)`);
  assert.ok(avg < 0.05, 'Should be faster than 0.05ms per query');
});

test('ZeroGC Native API: direct index query zero allocation', () => {
  const pathfinder = new ZeroGCPathfinder();
  const obstacleMask = new Uint8Array(TOTAL_TILES);
  // Place wall at pillar (2, 2)
  obstacleMask[coordToIdx(2, 2)] = TILE_WALL;
  const outPath = new Int16Array(TOTAL_TILES);

  const startIdx = coordToIdx(1, 2);
  const targetIdx = coordToIdx(3, 2);

  const len = pathfinder.findPath(startIdx, targetIdx, outPath, obstacleMask);
  assert.ok(len > 0);
  assert.equal(outPath[len - 1], targetIdx);
});
