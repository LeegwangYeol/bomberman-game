/**
 * Zero-GC Pathfinding & Flat Hazard Bitmask Engine
 * 195-tile flat 1D TypedArray BFS and hazard tracking for Bomberman.
 */

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

export interface GridCoord {
  r: number;
  c: number;
}

/**
 * Coordinate transformations
 */
export function coordToIdx(r: number, c: number): number {
  return r * COLS + c;
}

export function idxToRow(idx: number): number {
  return (idx / COLS) | 0;
}

export function idxToCol(idx: number): number {
  return idx % COLS;
}

/**
 * FlatHazardMask: 1D Uint8Array(195) with Set<string> duck-typing compatibility.
 * Eliminates per-frame new Set<string>() allocations in the 60 FPS update loop.
 */
export class FlatHazardMask extends Uint8Array {
  constructor(bufferOrLength: number | ArrayBufferLike = TOTAL_TILES) {
    super(typeof bufferOrLength === 'number' ? bufferOrLength : bufferOrLength);
  }

  public has(key: string | number): boolean {
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

  public add(key: string | number): this {
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

  public delete(key: string | number): boolean {
    if (typeof key === 'number') {
      if (key >= 0 && key < TOTAL_TILES) {
        this[key] = 0;
        return true;
      }
      return false;
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

  public clear(): void {
    this.fill(0);
  }

  public setCoord(r: number, c: number, val: number = 1): void {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      this[r * COLS + c] = val;
    }
  }

  public getCoord(r: number, c: number): number {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
    return this[r * COLS + c];
  }

  public isHazard(r: number, c: number): boolean {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this[r * COLS + c] !== 0;
  }

  public isHazardIdx(idx: number): boolean {
    return idx >= 0 && idx < TOTAL_TILES && this[idx] !== 0;
  }

  public *[Symbol.iterator](): Generator<string, void, unknown> {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this[r * COLS + c] !== 0) {
          yield `${r},${c}`;
        }
      }
    }
  }

  public forEachHazard(callback: (r: number, c: number, val: number) => void): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = this[r * COLS + c];
        if (val !== 0) {
          callback(r, c, val);
        }
      }
    }
  }

  public isNearHazard(r: number, c: number, maxDist: number = 3): boolean {
    const minR = Math.max(0, r - maxDist);
    const maxR = Math.min(ROWS - 1, r + maxDist);
    const minC = Math.max(0, c - maxDist);
    const maxC = Math.min(COLS - 1, c + maxDist);
    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        if (Math.abs(row - r) + Math.abs(col - c) <= maxDist && this[row * COLS + col] !== 0) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * ZeroGCPathfinder: High-performance 1D typed-array BFS engine.
 * Pre-allocates all search structures (visited, queue, parent, dist) to guarantee zero GC.
 */
export class ZeroGCPathfinder {
  public rows: number;
  public cols: number;
  public totalTiles: number;

  private visited: Uint16Array;
  private generation: number = 1;
  private queue: Int16Array;
  private parent: Int16Array;
  private dist: Int16Array;
  private tempPath: Int16Array;

  public obstacleMask: Uint8Array;
  public hazardMask: Uint8Array;

  constructor(rows: number = ROWS, cols: number = COLS) {
    this.rows = rows;
    this.cols = cols;
    this.totalTiles = rows * cols;

    this.visited = new Uint16Array(this.totalTiles);
    this.queue = new Int16Array(this.totalTiles);
    this.parent = new Int16Array(this.totalTiles);
    this.dist = new Int16Array(this.totalTiles);
    this.tempPath = new Int16Array(this.totalTiles);
    this.obstacleMask = new Uint8Array(this.totalTiles);
    this.hazardMask = new Uint8Array(this.totalTiles);
  }

  public init(cols: number, rows: number): void {
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

  public setObstacles(walkableBitmask: Uint8Array): void {
    this.obstacleMask.set(walkableBitmask);
  }

  private resetVisited(): void {
    this.generation++;
    if (this.generation >= 65530) {
      this.visited.fill(0);
      this.generation = 1;
    }
  }

  /**
   * High-performance Zero-GC BFS pathfinder.
   * Returns pathLength written to outPath.
   */
  public findPath(
    startIdx: number,
    targetIdx: number,
    outPath: Int16Array,
    obstacleMask: Uint8Array = this.obstacleMask,
    bombMask: Uint8Array | null = null
  ): number {
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

      // 4 directions in exact order: Up, Down, Left, Right
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

  /**
   * Escape BFS: Finds shortest path to nearest safe tile outside dangerMask.
   * Returns pathLength written to outPath, 0 if start is safe, or -1 if unreachable within maxSteps.
   */
  public findSafeTile(
    startIdx: number,
    dangerMask: Uint8Array,
    obstacleMask: Uint8Array,
    existingBombsMask: Uint8Array | null,
    maxSteps: number,
    outPath: Int16Array
  ): number {
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

function populateObstacleMask(map: number[][], outMask: Uint8Array): void {
  for (let r = 0; r < ROWS; r++) {
    const row = map[r];
    const base = r * COLS;
    for (let c = 0; c < COLS; c++) {
      outMask[base + c] = row[c];
    }
  }
}

function populateMaskFromSetOrArray(
  source: Set<string> | Uint8Array | null | undefined,
  outMask: Uint8Array
): void {
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
 * Backward-compatible findPathBFS:
 * Grid-based BFS pathfinding on discrete 13x15 arena avoiding walls, blocks, and active bombs.
 * Includes nearest-frontier Manhattan fallback when player is enclosed by breakable blocks.
 */
export function findPathBFS(
  start: GridCoord,
  target: GridCoord,
  map: number[][],
  bombTiles: Set<string> | Uint8Array
): GridCoord[] {
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

  const path: GridCoord[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const idx = outPathBuffer[i];
    path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
  }
  return path;
}

/**
 * Backward-compatible getBlastTiles:
 * Computes all grid tiles engulfed by an explosion at `center` with radius `power`.
 */
export function getBlastTiles(
  center: GridCoord,
  power: number,
  map: number[][]
): Set<string> {
  const blast = new Set<string>();
  blast.add(`${center.r},${center.c}`);

  const directions = [
    { dr: -1, dc: 0 }, // Up
    { dr: 1, dc: 0 },  // Down
    { dr: 0, dc: -1 }, // Left
    { dr: 0, dc: 1 },  // Right
  ];

  for (const dir of directions) {
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
 * Backward-compatible findEscapePathBFS:
 * Finds the shortest path to the nearest safe tile outside dangerTiles using BFS.
 */
export function findEscapePathBFS(
  start: GridCoord,
  dangerTiles: Set<string> | Uint8Array,
  map: number[][],
  existingBombs: Set<string> | Uint8Array,
  maxSteps: number = 4
): GridCoord[] | null {
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

  const path: GridCoord[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const idx = outPathBuffer[i];
    path[i] = { r: (idx / COLS) | 0, c: idx % COLS };
  }
  return path;
}

/**
 * Alias for findEscapePathBFS
 */
export const findSafeTileBFS = findEscapePathBFS;

/**
 * Determines if a tile is within blast range of a bomb epicenter.
 */
export function isTileInBlastRange(
  tile: GridCoord | number,
  center: GridCoord | number,
  power: number,
  map: number[][] | Uint8Array
): boolean {
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
