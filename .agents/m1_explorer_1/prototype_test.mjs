import assert from 'node:assert/strict';

// Constants
export const TILE_SIZE = 40;
export const ROWS = 13;
export const COLS = 15;
export const TOTAL_TILES = ROWS * COLS; // 195

export const TILE_EMPTY = 0;
export const TILE_WALL = 1;
export const TILE_BLOCK = 2;

export const FLAG_PASSABLE = 0;
export const FLAG_WALL = 1;
export const FLAG_BLOCK = 2;
export const FLAG_BOMB = 4;
export const FLAG_HAZARD = 8;

export function coordToIdx(r, c) {
  return r * COLS + c;
}

export function idxToRow(idx) {
  return (idx / COLS) | 0;
}

export function idxToCol(idx) {
  return idx % COLS;
}

/**
 * FlatHazardMask: 1D Uint8Array(195) with Set<string> duck-typing compatibility.
 */
export class FlatHazardMask extends Uint8Array {
  constructor(bufferOrLength = TOTAL_TILES) {
    super(bufferOrLength);
  }

  has(key) {
    if (typeof key === 'number') {
      return key >= 0 && key < TOTAL_TILES && this[key] !== 0;
    }
    const comma = key.indexOf(',');
    if (comma === -1) return false;
    const r = parseInt(key.slice(0, comma), 10);
    const c = parseInt(key.slice(comma + 1), 10);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this[r * COLS + c] !== 0;
  }

  add(key) {
    if (typeof key === 'number') {
      if (key >= 0 && key < TOTAL_TILES) this[key] = 1;
      return this;
    }
    const comma = key.indexOf(',');
    if (comma === -1) return this;
    const r = parseInt(key.slice(0, comma), 10);
    const c = parseInt(key.slice(comma + 1), 10);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      this[r * COLS + c] = 1;
    }
    return this;
  }

  delete(key) {
    if (typeof key === 'number') {
      if (key >= 0 && key < TOTAL_TILES) this[key] = 0;
      return true;
    }
    const comma = key.indexOf(',');
    if (comma === -1) return false;
    const r = parseInt(key.slice(0, comma), 10);
    const c = parseInt(key.slice(comma + 1), 10);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      this[r * COLS + c] = 0;
      return true;
    }
    return false;
  }

  clear() {
    this.fill(0);
  }

  setCoord(r, c, val = 1) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      this[r * COLS + c] = val;
    }
  }

  getCoord(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
    return this[r * COLS + c];
  }

  isHazard(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this[r * COLS + c] !== 0;
  }

  isHazardIdx(idx) {
    return idx >= 0 && idx < TOTAL_TILES && this[idx] !== 0;
  }

  *[Symbol.iterator]() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this[r * COLS + c] !== 0) {
          yield `${r},${c}`;
        }
      }
    }
  }

  forEachHazard(callback) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = this[r * COLS + c];
        if (val !== 0) {
          callback(r, c, val);
        }
      }
    }
  }
}

/**
 * ZeroGCPathfinder: High-performance 1D typed-array BFS engine.
 */
export class ZeroGCPathfinder {
  constructor(rows = ROWS, cols = COLS) {
    this.rows = rows;
    this.cols = cols;
    this.totalTiles = rows * cols;

    // Pre-allocated typed arrays
    this.visited = new Uint16Array(this.totalTiles);
    this.generation = 1;
    this.queue = new Int16Array(this.totalTiles);
    this.parent = new Int16Array(this.totalTiles);
    this.dist = new Int16Array(this.totalTiles);

    // Scratch buffers
    this.tempPath = new Int16Array(this.totalTiles);
    this.obstacleMask = new Uint8Array(this.totalTiles);
    this.hazardMask = new Uint8Array(this.totalTiles);
  }

  init(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.totalTiles = rows * cols;
    if (this.visited.length < this.totalTiles) {
      this.visited = new Uint16Array(this.totalTiles);
      this.queue = new Int16Array(this.totalTiles);
      this.parent = new Int16Array(this.totalTiles);
      this.dist = new Int16Array(this.totalTiles);
      this.tempPath = new Int16Array(this.totalTiles);
      this.obstacleMask = new Uint8Array(this.totalTiles);
      this.hazardMask = new Uint8Array(this.totalTiles);
    }
  }

  setObstacles(walkableBitmask) {
    this.obstacleMask.set(walkableBitmask);
  }

  resetVisited() {
    this.generation++;
    if (this.generation >= 65530) {
      this.visited.fill(0);
      this.generation = 1;
    }
  }

  findPath(startIdx, targetIdx, outPath, obstacleMask = this.obstacleMask, bombMask = null) {
    if (startIdx === targetIdx) return 0;

    const cols = this.cols;
    const rows = this.rows;
    const targetR = (targetIdx / cols) | 0;
    const targetC = targetIdx % cols;
    const startR = (startIdx / cols) | 0;
    const startC = startIdx % cols;

    this.resetVisited();
    const gen = this.generation;
    const visited = this.visited;
    const queue = this.queue;
    const parent = this.parent;

    let head = 0;
    let tail = 0;

    queue[tail++] = startIdx;
    visited[startIdx] = gen;
    parent[startIdx] = -1;

    let closestReachable = startIdx;
    let minDistance = Math.abs(startR - targetR) + Math.abs(startC - targetC);
    let reachedTarget = false;

    while (head < tail) {
      const curr = queue[head++];

      if (curr === targetIdx) {
        reachedTarget = true;
        break;
      }

      const currR = (curr / cols) | 0;
      const currC = curr % cols;
      const d = Math.abs(currR - targetR) + Math.abs(currC - targetC);
      if (d < minDistance) {
        minDistance = d;
        closestReachable = curr;
      }

      // 4 directions: Up, Down, Left, Right
      for (let dir = 0; dir < 4; dir++) {
        let nr = currR;
        let nc = currC;
        if (dir === 0) nr--;      // Up
        else if (dir === 1) nr++; // Down
        else if (dir === 2) nc--; // Left
        else nc++;                // Right

        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const nIdx = nr * cols + nc;

        if (visited[nIdx] === gen) continue;

        // Obstacle check: Walls or Breakable Blocks
        if (obstacleMask[nIdx] === TILE_WALL || obstacleMask[nIdx] === TILE_BLOCK) continue;

        // Bomb check: avoid active bombs (unless target is the player's tile)
        if (bombMask && bombMask[nIdx] !== 0 && nIdx !== targetIdx) continue;

        visited[nIdx] = gen;
        parent[nIdx] = curr;
        queue[tail++] = nIdx;
      }
    }

    const destination = reachedTarget ? targetIdx : closestReachable;
    if (destination === startIdx) {
      return 0;
    }

    // Reconstruct path
    let stepCount = 0;
    let curr = destination;
    while (curr !== startIdx && curr >= 0) {
      this.tempPath[stepCount++] = curr;
      curr = parent[curr];
    }

    // Reverse into outPath
    for (let i = 0; i < stepCount; i++) {
      outPath[i] = this.tempPath[stepCount - 1 - i];
    }

    return stepCount;
  }

  findSafeTile(startIdx, dangerMask, obstacleMask, existingBombsMask, maxSteps, outPath) {
    // If start is safe, empty path
    if (dangerMask[startIdx] === 0) return 0;

    const cols = this.cols;
    const rows = this.rows;

    this.resetVisited();
    const gen = this.generation;
    const visited = this.visited;
    const queue = this.queue;
    const parent = this.parent;
    const dist = this.dist;

    let head = 0;
    let tail = 0;

    queue[tail++] = startIdx;
    visited[startIdx] = gen;
    parent[startIdx] = -1;
    dist[startIdx] = 0;

    let safeTarget = -1;

    while (head < tail) {
      const curr = queue[head++];
      const d = dist[curr];

      if (dangerMask[curr] === 0) {
        safeTarget = curr;
        break;
      }

      if (d >= maxSteps) continue;

      const currR = (curr / cols) | 0;
      const currC = curr % cols;

      for (let dir = 0; dir < 4; dir++) {
        let nr = currR;
        let nc = currC;
        if (dir === 0) nr--;
        else if (dir === 1) nr++;
        else if (dir === 2) nc--;
        else nc++;

        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const nIdx = nr * cols + nc;

        if (visited[nIdx] === gen) continue;
        if (obstacleMask[nIdx] === TILE_WALL || obstacleMask[nIdx] === TILE_BLOCK) continue;
        if (existingBombsMask && existingBombsMask[nIdx] !== 0 && nIdx !== startIdx) continue;

        visited[nIdx] = gen;
        parent[nIdx] = curr;
        dist[nIdx] = d + 1;
        queue[tail++] = nIdx;
      }
    }

    if (safeTarget === -1) return -1;

    // Reconstruct path
    let stepCount = 0;
    let curr = safeTarget;
    while (curr !== startIdx && curr >= 0) {
      this.tempPath[stepCount++] = curr;
      curr = parent[curr];
    }

    for (let i = 0; i < stepCount; i++) {
      outPath[i] = this.tempPath[stepCount - 1 - i];
    }

    return stepCount;
  }
}

// Global Zero-GC Pathfinder Singleton
export const zeroGCPathfinder = new ZeroGCPathfinder();
const outPathBuffer = new Int16Array(TOTAL_TILES);
const sharedBombMask = new Uint8Array(TOTAL_TILES);
const sharedDangerMask = new Uint8Array(TOTAL_TILES);
const sharedObstacleMask = new Uint8Array(TOTAL_TILES);

function populateObstacleMask(map, outMask) {
  for (let r = 0; r < ROWS; r++) {
    const row = map[r];
    const base = r * COLS;
    for (let c = 0; c < COLS; c++) {
      outMask[base + c] = row[c];
    }
  }
}

function populateMaskFromSetOrArray(source, outMask) {
  outMask.fill(0);
  if (!source) return;
  if (source instanceof Uint8Array) {
    outMask.set(source);
  } else if (source instanceof Set) {
    for (const key of source) {
      const comma = key.indexOf(',');
      if (comma !== -1) {
        const r = parseInt(key.slice(0, comma), 10);
        const c = parseInt(key.slice(comma + 1), 10);
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
          outMask[r * COLS + c] = 1;
        }
      }
    }
  }
}

/**
 * Backward-compatible findPathBFS
 */
export function findPathBFS(start, target, map, bombTiles) {
  if (start.r === target.r && start.c === target.c) return [];

  populateObstacleMask(map, sharedObstacleMask);
  populateMaskFromSetOrArray(bombTiles, sharedBombMask);

  const startIdx = coordToIdx(start.r, start.c);
  const targetIdx = coordToIdx(target.r, target.c);

  const len = zeroGCPathfinder.findPath(
    startIdx,
    targetIdx,
    outPathBuffer,
    sharedObstacleMask,
    sharedBombMask
  );

  if (len === 0) return [];

  const path = new Array(len);
  for (let i = 0; i < len; i++) {
    const idx = outPathBuffer[i];
    path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
  }
  return path;
}

/**
 * Backward-compatible getBlastTiles
 */
export function getBlastTiles(center, power, map) {
  const blast = new Set();
  blast.add(`${center.r},${center.c}`);

  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const dir of dirs) {
    for (let i = 1; i <= power; i++) {
      const nr = center.r + dir.dr * i;
      const nc = center.c + dir.dc * i;

      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      if (map[nr][nc] === TILE_WALL) break;

      blast.add(`${nr},${nc}`);
      if (map[nr][nc] === TILE_BLOCK) break;
    }
  }

  return blast;
}

/**
 * Backward-compatible findEscapePathBFS
 */
export function findEscapePathBFS(start, dangerTiles, map, existingBombs, maxSteps = 4) {
  populateObstacleMask(map, sharedObstacleMask);
  populateMaskFromSetOrArray(dangerTiles, sharedDangerMask);
  populateMaskFromSetOrArray(existingBombs, sharedBombMask);

  const startIdx = coordToIdx(start.r, start.c);

  const len = zeroGCPathfinder.findSafeTile(
    startIdx,
    sharedDangerMask,
    sharedObstacleMask,
    sharedBombMask,
    maxSteps,
    outPathBuffer
  );

  if (len === -1) return null;
  if (len === 0) return [];

  const path = new Array(len);
  for (let i = 0; i < len; i++) {
    const idx = outPathBuffer[i];
    path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
  }
  return path;
}

export const findSafeTileBFS = findEscapePathBFS;

export function isTileInBlastRange(tile, center, power, map) {
  const tr = typeof tile === 'number' ? (tile / COLS) | 0 : tile.r;
  const tc = typeof tile === 'number' ? tile % COLS : tile.c;
  const cr = typeof center === 'number' ? (center / COLS) | 0 : center.r;
  const cc = typeof center === 'number' ? center % COLS : center.c;

  if (tr === cr && tc === cc) return true;
  if (tr !== cr && tc !== cc) return false;

  const dist = Math.abs(tr - cr) + Math.abs(tc - cc);
  if (dist > power) return false;

  const dr = Math.sign(tr - cr);
  const dc = Math.sign(tc - cc);

  let r = cr + dr;
  let c = cc + dc;
  while (r !== tr || c !== tc) {
    const tileVal = Array.isArray(map) ? map[r][c] : map[r * COLS + c];
    if (tileVal === TILE_WALL || tileVal === TILE_BLOCK) return false;
    r += dr;
    c += dc;
  }
  const destVal = Array.isArray(map) ? map[tr][tc] : map[tr * COLS + tc];
  if (destVal === TILE_WALL) return false;
  return true;
}

console.log("Prototype loaded cleanly. Running self-test checks...");

// Run tests
const testMap = [];
for (let r = 0; r < ROWS; r++) {
  testMap[r] = [];
  for (let c = 0; c < COLS; c++) {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
      testMap[r][c] = TILE_WALL;
    } else if (r % 2 === 0 && c % 2 === 0) {
      testMap[r][c] = TILE_WALL;
    } else {
      testMap[r][c] = TILE_EMPTY;
    }
  }
}

// Check 1: start === target
assert.deepEqual(findPathBFS({ r: 1, c: 1 }, { r: 1, c: 1 }, testMap, new Set()), []);

// Check 2: corridor
const p1 = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 4 }, testMap, new Set());
assert.equal(p1.length, 3);
assert.deepEqual(p1, [{ r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }]);

// Check 3: avoids bomb
const p2 = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 3 }, testMap, new Set(['1,2']));
assert.ok(p2.length > 0);
for (const step of p2) {
  assert.ok(!(step.r === 1 && step.c === 2));
}

// Check 4: blast tiles
const b1 = getBlastTiles({ r: 1, c: 1 }, 2, testMap);
assert.ok(b1.has('1,1'));
assert.ok(b1.has('1,2'));
assert.ok(b1.has('1,3'));

// Check 5: findEscapePathBFS
const esc = findEscapePathBFS({ r: 1, c: 1 }, b1, testMap, new Set(['1,1']), 4);
assert.ok(esc !== null);
assert.ok(esc.length > 0);
assert.ok(!b1.has(`${esc[esc.length - 1].r},${esc[esc.length - 1].c}`));

// Check 6: FlatHazardMask duck typing
const mask = new FlatHazardMask();
mask.add('1,2');
assert.ok(mask.has('1,2'));
assert.equal(mask.getCoord(1, 2), 1);
assert.equal(mask[coordToIdx(1, 2)], 1);
assert.ok(!mask.has('1,3'));
mask.delete('1,2');
assert.ok(!mask.has('1,2'));

// Check 7: isTileInBlastRange
assert.ok(isTileInBlastRange({ r: 1, c: 3 }, { r: 1, c: 1 }, 2, testMap));
assert.ok(!isTileInBlastRange({ r: 1, c: 4 }, { r: 1, c: 1 }, 2, testMap));

console.log("All 7 prototype self-test checks PASSED flawlessly!");
