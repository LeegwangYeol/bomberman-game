import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPathBFS,
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK
} from '../src/game/pathfinding.ts';

function createEmptyMap() {
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

test('BFS: returns empty path when start equals target', () => {
  const map = createEmptyMap();
  const path = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 1 }, map, new Set());
  assert.deepEqual(path, []);
});

test('BFS: finds direct open path in corridor', () => {
  const map = createEmptyMap();
  const path = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 4 }, map, new Set());
  assert.equal(path.length, 3);
  assert.deepEqual(path, [
    { r: 1, c: 2 },
    { r: 1, c: 3 },
    { r: 1, c: 4 }
  ]);
});

test('BFS: navigates around fixed inner pillar walls', () => {
  const map = createEmptyMap();
  // Pillar at (2, 2) is a wall. Going from (1, 2) to (3, 2) must route through (1,1)->(2,1)->(3,1)->(3,2) or (1,3)->(2,3)->(3,3)->(3,2)
  const path = findPathBFS({ r: 1, c: 2 }, { r: 3, c: 2 }, map, new Set());
  assert.ok(path.length > 0);
  // None of the path tiles can be a wall
  for (const step of path) {
    assert.notEqual(map[step.r][step.c], TILE_WALL);
  }
  // Last step must reach target
  assert.deepEqual(path[path.length - 1], { r: 3, c: 2 });
});

test('BFS: avoids breakable blocks', () => {
  const map = createEmptyMap();
  // Place a block at (1, 2)
  map[1][2] = TILE_BLOCK;

  const path = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 3 }, map, new Set());
  assert.ok(path.length > 0);
  for (const step of path) {
    assert.ok(!(step.r === 1 && step.c === 2), 'Path must not step on breakable block');
  }
  assert.deepEqual(path[path.length - 1], { r: 1, c: 3 });
});

test('BFS: avoids active bomb tiles', () => {
  const map = createEmptyMap();
  const bombTiles = new Set(['1,2']); // Bomb placed at (1, 2)

  const path = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 3 }, map, bombTiles);
  assert.ok(path.length > 0);
  for (const step of path) {
    assert.ok(!bombTiles.has(`${step.r},${step.c}`), 'Path must avoid active bomb tile');
  }
  assert.deepEqual(path[path.length - 1], { r: 1, c: 3 });
});

test('BFS: Manhattan fallback when player is fully enclosed by blocks', () => {
  const map = createEmptyMap();
  // Enclose player at (1, 1) with blocks at (1, 2) and (2, 1)
  map[1][2] = TILE_BLOCK;
  map[2][1] = TILE_BLOCK;

  // Enemy is at (5, 5)
  const path = findPathBFS({ r: 5, c: 5 }, { r: 1, c: 1 }, map, new Set());

  // Direct target (1,1) is unreachable, but fallback must find the closest open frontier tile
  assert.ok(path.length > 0);
  const finalTile = path[path.length - 1];
  assert.notEqual(map[finalTile.r][finalTile.c], TILE_WALL);
  assert.notEqual(map[finalTile.r][finalTile.c], TILE_BLOCK);
  // Manhattan distance to (1, 1) from the final tile should be minimal among open tiles
  const dist = Math.abs(finalTile.r - 1) + Math.abs(finalTile.c - 1);
  assert.ok(dist <= 3, `Expected fallback tile to be close to enclosed player, got distance ${dist}`);
});
