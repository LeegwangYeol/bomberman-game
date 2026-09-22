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

export interface DemolitionPathResult {
  pathLength: number;         // Total tiles in path
  openStepCount: number;      // Steps along open tiles before the first block
  hasDirectPath: boolean;     // True if path contains 0 blocks
  blockingBlockIdx: number;   // Flat index of first soft block, or -1 if none
  stagingTileIdx: number;     // Flat index of tile before first block, or -1
  blockCount: number;         // Total blocks along path
  reachedTarget: boolean;     // True if path reached the target tile
}

export interface BlockTargetResult {
  targetBlock: GridCoord;
  approachTile: GridCoord;
  placementTile: GridCoord;
}

export interface DemolitionPath {
  path: GridCoord[];
  blockingBlock: GridCoord | null;
  stagingTile: GridCoord | null;
  hasDirectPath: boolean;
  blockCount: number;
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
 * FlatHazardMask: 1D Uint8Array(195) wrapper with Set<string> duck-typing compatibility.
 * Eliminates per-frame new Set<string>() allocations in the 60 FPS update loop.
 */
export class FlatHazardMask implements Iterable<string> {
  public readonly mask: Uint8Array;
  public readonly length: number;
  private _size: number = 0;

  constructor(bufferOrLength: number | ArrayBufferLike = TOTAL_TILES) {
    if (typeof bufferOrLength === 'number') {
      this.length = bufferOrLength;
      this.mask = new Uint8Array(bufferOrLength);
    } else {
      this.mask = new Uint8Array(bufferOrLength);
      this.length = this.mask.length;
    }
  }

  public has(key: string | number): boolean {
    if (typeof key === 'number') {
      return Number.isInteger(key) && key >= 0 && key < this.length && this.mask[key] !== 0;
    }
    if (typeof key !== 'string') return false;
    const comma = key.indexOf(',');
    if (comma === -1) return false;
    const rStr = key.slice(0, comma).trim();
    const cStr = key.slice(comma + 1).trim();
    if (rStr === '' || cStr === '') return false;
    const r = Number(rStr);
    const c = Number(cStr);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS) {
      return false;
    }
    return this.mask[r * COLS + c] !== 0;
  }

  public add(key: string | number): this {
    if (typeof key === 'number') {
      if (Number.isInteger(key) && key >= 0 && key < this.length) {
        if (this.mask[key] === 0) {
          this.mask[key] = 1;
          this._size++;
        }
      }
      return this;
    }
    if (typeof key !== 'string') return this;
    const comma = key.indexOf(',');
    if (comma === -1) return this;
    const rStr = key.slice(0, comma).trim();
    const cStr = key.slice(comma + 1).trim();
    if (rStr === '' || cStr === '') return this;
    const r = Number(rStr);
    const c = Number(cStr);
    if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const idx = r * COLS + c;
      if (this.mask[idx] === 0) {
        this.mask[idx] = 1;
        this._size++;
      }
    }
    return this;
  }

  public delete(key: string | number): boolean {
    if (typeof key === 'number') {
      if (Number.isInteger(key) && key >= 0 && key < this.length) {
        if (this.mask[key] !== 0) {
          this.mask[key] = 0;
          this._size--;
          return true;
        }
      }
      return false;
    }
    if (typeof key !== 'string') return false;
    const comma = key.indexOf(',');
    if (comma === -1) return false;
    const rStr = key.slice(0, comma).trim();
    const cStr = key.slice(comma + 1).trim();
    if (rStr === '' || cStr === '') return false;
    const r = Number(rStr);
    const c = Number(cStr);
    if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const idx = r * COLS + c;
      if (this.mask[idx] !== 0) {
        this.mask[idx] = 0;
        this._size--;
        return true;
      }
    }
    return false;
  }

  public clear(): void {
    this.mask.fill(0);
    this._size = 0;
  }

  public fill(val: number = 0): this {
    this.mask.fill(val);
    this._size = val === 0 ? 0 : this.length;
    return this;
  }

  public get size(): number {
    return this._size;
  }

  public values(): Generator<string, void, unknown> {
    return this[Symbol.iterator]();
  }

  public keys(): Generator<string, void, unknown> {
    return this[Symbol.iterator]();
  }

  public *entries(): Generator<[string, string], void, unknown> {
    for (const key of this) {
      yield [key, key];
    }
  }

  public setCoord(r: number, c: number, val: number = 1): void {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const idx = r * COLS + c;
      if (val !== 0) {
        if (this.mask[idx] === 0) {
          this.mask[idx] = val;
          this._size++;
        } else {
          this.mask[idx] = val;
        }
      } else {
        if (this.mask[idx] !== 0) {
          this.mask[idx] = 0;
          this._size--;
        }
      }
    }
  }

  public getCoord(r: number, c: number): number {
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
    return this.mask[r * COLS + c];
  }

  public setIdx(idx: number, val: number = 1): void {
    if (idx >= 0 && idx < this.length) {
      if (val !== 0) {
        if (this.mask[idx] === 0) {
          this.mask[idx] = val;
          this._size++;
        } else {
          this.mask[idx] = val;
        }
      } else {
        if (this.mask[idx] !== 0) {
          this.mask[idx] = 0;
          this._size--;
        }
      }
    }
  }

  public isHazard(r: number, c: number): boolean {
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this.mask[r * COLS + c] !== 0;
  }

  public isHazardIdx(idx: number): boolean {
    return idx >= 0 && idx < this.length && this.mask[idx] !== 0;
  }

  public *[Symbol.iterator](): Generator<string, void, unknown> {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.mask[r * COLS + c] !== 0) {
          yield `${r},${c}`;
        }
      }
    }
  }

  public forEachHazard(callback: (r: number, c: number, val: number) => void): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = this.mask[r * COLS + c];
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
        if (Math.abs(row - r) + Math.abs(col - c) <= maxDist && this.mask[row * COLS + col] !== 0) {
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
  private heap: Int16Array;
  private heapSize: number = 0;
  private demolitionResult: DemolitionPathResult = {
    pathLength: 0,
    openStepCount: 0,
    hasDirectPath: true,
    blockingBlockIdx: -1,
    stagingTileIdx: -1,
    blockCount: 0,
    reachedTarget: false,
  };

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
    this.heap = new Int16Array(1024);
    this.obstacleMask = new Uint8Array(this.totalTiles);
    this.hazardMask = new Uint8Array(this.totalTiles);
  }

  public init(rows: number = ROWS, cols: number = COLS): void {
    this.rows = rows;
    this.cols = cols;
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
    if (this.heap.length < 1024) {
      this.heap = new Int16Array(1024);
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
    bombMask: Uint8Array | null = null,
    ignoreBlocks: boolean = false
  ): number {
    if (
      typeof startIdx !== 'number' ||
      !Number.isInteger(startIdx) ||
      startIdx < 0 ||
      startIdx >= this.totalTiles ||
      typeof targetIdx !== 'number' ||
      !Number.isInteger(targetIdx) ||
      targetIdx < 0 ||
      targetIdx >= this.totalTiles
    ) {
      return 0;
    }

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
        if (obstacleMask[nIdx] === TILE_WALL || (!ignoreBlocks && obstacleMask[nIdx] === TILE_BLOCK)) continue;

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
    while (curr !== startIdx && curr >= 0 && stepCount < this.totalTiles) {
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
    if (
      typeof startIdx !== 'number' ||
      !Number.isInteger(startIdx) ||
      startIdx < 0 ||
      startIdx >= this.totalTiles
    ) {
      return -1;
    }

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
    while (curr !== startIdx && curr >= 0 && stepCount < this.totalTiles) {
      this.tempPath[stepCount++] = curr;
      curr = parent[curr];
    }

    for (let i = 0; i < stepCount; i++) {
      outPath[i] = this.tempPath[stepCount - 1 - i];
    }

    return stepCount;
  }

  /**
   * Soft-block-aware demolition pathfinder using pre-allocated min-heap Dijkstra.
   * Traverses through breakable blocks with blockPenalty weight to identify the optimal corridor.
   * Returns DemolitionPathResult with first blocking block and staging tile.
   */
  public findPathWithDemolition(
    startIdx: number,
    targetIdx: number,
    outPath: Int16Array,
    obstacleMask: Uint8Array = this.obstacleMask,
    bombMask: Uint8Array | null = null,
    blockPenalty: number = 8
  ): DemolitionPathResult {
    const res = this.demolitionResult;
    res.pathLength = 0;
    res.openStepCount = 0;
    res.hasDirectPath = true;
    res.blockingBlockIdx = -1;
    res.stagingTileIdx = -1;
    res.blockCount = 0;
    res.reachedTarget = false;

    if (
      typeof startIdx !== 'number' ||
      !Number.isInteger(startIdx) ||
      startIdx < 0 ||
      startIdx >= this.totalTiles ||
      typeof targetIdx !== 'number' ||
      !Number.isInteger(targetIdx) ||
      targetIdx < 0 ||
      targetIdx >= this.totalTiles
    ) {
      return res;
    }

    if (startIdx === targetIdx) {
      res.reachedTarget = true;
      return res;
    }

    const cols = this.cols;
    const rows = this.rows;
    const targetR = (targetIdx / cols) | 0;
    const targetC = targetIdx % cols;
    const startR = (startIdx / cols) | 0;
    const startC = startIdx % cols;

    this.resetVisited();
    const gen = this.generation;
    const visited = this.visited;
    const parent = this.parent;
    const dist = this.dist;
    const heap = this.heap;

    dist.fill(30000);
    dist[startIdx] = 0;
    parent[startIdx] = -1;
    visited[startIdx] = gen;

    this.heapSize = 0;
    heap[this.heapSize++] = startIdx;

    let reachedTarget = false;
    let closestReachable = startIdx;
    let minDistance = Math.abs(startR - targetR) + Math.abs(startC - targetC);

    while (this.heapSize > 0) {
      const curr = heap[0];
      const lastNode = heap[--this.heapSize];
      if (this.heapSize > 0) {
        let i = 0;
        const half = this.heapSize >> 1;
        while (i < half) {
          const left = (i << 1) + 1;
          const right = left + 1;
          let best = left;
          if (right < this.heapSize && dist[heap[right]] < dist[heap[left]]) {
            best = right;
          }
          if (dist[lastNode] <= dist[heap[best]]) {
            break;
          }
          heap[i] = heap[best];
          i = best;
        }
        heap[i] = lastNode;
      }

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

      const currDist = dist[curr];

      for (let dir = 0; dir < 4; dir++) {
        let nr = currR;
        let nc = currC;
        if (dir === 0) nr--;
        else if (dir === 1) nr++;
        else if (dir === 2) nc--;
        else nc++;

        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const nIdx = nr * cols + nc;

        if (obstacleMask[nIdx] === TILE_WALL) continue;
        if (bombMask && bombMask[nIdx] !== 0 && nIdx !== targetIdx) continue;

        const isBlock = obstacleMask[nIdx] === TILE_BLOCK;
        const stepCost = isBlock ? 1 + blockPenalty : 1;
        const alt = currDist + stepCost;

        if (alt < dist[nIdx]) {
          dist[nIdx] = alt;
          parent[nIdx] = curr;
          visited[nIdx] = gen;

          if (this.heapSize < heap.length) {
            let i = this.heapSize++;
            while (i > 0) {
              const p = (i - 1) >> 1;
              const pNode = heap[p];
              if (alt < dist[pNode]) {
                heap[i] = pNode;
                i = p;
              } else {
                break;
              }
            }
            heap[i] = nIdx;
          }
        }
      }
    }

    res.reachedTarget = reachedTarget;
    if (!reachedTarget) {
      res.hasDirectPath = false;
    }

    const destination = reachedTarget ? targetIdx : closestReachable;
    if (destination === startIdx) {
      return res;
    }

    let stepCount = 0;
    let currNode = destination;
    while (currNode !== startIdx && currNode >= 0 && stepCount < this.totalTiles) {
      this.tempPath[stepCount++] = currNode;
      currNode = parent[currNode];
    }

    res.pathLength = stepCount;
    for (let i = 0; i < stepCount; i++) {
      outPath[i] = this.tempPath[stepCount - 1 - i];
    }

    for (let i = 0; i < stepCount; i++) {
      const idx = outPath[i];
      if (obstacleMask[idx] === TILE_BLOCK) {
        res.blockCount++;
        if (res.blockingBlockIdx === -1) {
          res.blockingBlockIdx = idx;
          res.stagingTileIdx = i === 0 ? startIdx : outPath[i - 1];
          res.openStepCount = i;
          res.hasDirectPath = false;
        }
      }
    }

    if (res.hasDirectPath) {
      res.openStepCount = stepCount;
    } else if (res.blockingBlockIdx === -1) {
      res.openStepCount = stepCount;
    }

    return res;
  }

  /**
   * Computes blast mask in-place without heap allocations.
   */
  public computeBlast(
    centerIdx: number,
    power: number,
    obstacleMask: Uint8Array = this.obstacleMask,
    outMask: Uint8Array = this.hazardMask,
    clearFirst: boolean = false
  ): void {
    if (clearFirst) outMask.fill(0);
    if (centerIdx < 0 || centerIdx >= this.totalTiles) return;

    outMask[centerIdx] = 1;
    const cr = (centerIdx / this.cols) | 0;
    const cc = centerIdx % this.cols;

    for (let dir = 0; dir < 4; dir++) {
      for (let i = 1; i <= power; i++) {
        let nr = cr;
        let nc = cc;
        if (dir === 0) nr -= i;
        else if (dir === 1) nr += i;
        else if (dir === 2) nc -= i;
        else nc += i;

        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
        const nIdx = nr * this.cols + nc;
        if (obstacleMask[nIdx] === TILE_WALL) break;
        outMask[nIdx] = 1;
        if (obstacleMask[nIdx] === TILE_BLOCK) break;
      }
    }
  }
}

// Global Zero-GC Pathfinder Singleton
export const zeroGCPathfinder = new ZeroGCPathfinder();
const outPathBuffer = new Int16Array(TOTAL_TILES);
const sharedBombMask = new Uint8Array(TOTAL_TILES);
const sharedDangerMask = new Uint8Array(TOTAL_TILES);
const sharedObstacleMask = new Uint8Array(TOTAL_TILES);

function populateObstacleMask(map: number[][] | Uint8Array, outMask: Uint8Array): void {
  outMask.fill(0);
  if (map instanceof Uint8Array) {
    outMask.set(map);
    return;
  }
  const rMax = Math.min(ROWS, map.length);
  for (let r = 0; r < rMax; r++) {
    const row = map[r];
    if (!row) continue;
    const base = r * COLS;
    const cMax = Math.min(COLS, row.length);
    for (let c = 0; c < cMax; c++) {
      outMask[base + c] = row[c];
    }
  }
}

function populateMaskFromSetOrArray(
  source: Set<string> | Uint8Array | FlatHazardMask | null | undefined,
  outMask: Uint8Array
): void {
  outMask.fill(0);
  if (!source) return;
  if (source instanceof FlatHazardMask) {
    outMask.set(source.mask);
  } else if (source instanceof Uint8Array) {
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
  bombTiles: Set<string> | Uint8Array | FlatHazardMask,
  ignoreBlocks: boolean = false
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
    sharedBombMask,
    ignoreBlocks
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
  dangerTiles: Set<string> | Uint8Array | FlatHazardMask,
  map: number[][],
  existingBombs: Set<string> | Uint8Array | FlatHazardMask,
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

  // AI-02: Boundary check coordinates against grid dimensions
  if (
    !Number.isInteger(tr) || !Number.isInteger(tc) ||
    !Number.isInteger(cr) || !Number.isInteger(cc) ||
    tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS ||
    cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS
  ) {
    return false;
  }

  if (tr === cr && tc === cc) return true;
  if (tr !== cr && tc !== cc) return false;

  const dist = Math.abs(tr - cr) + Math.abs(tc - cc);
  if (dist > power) return false;

  const dr = Math.sign(tr - cr);
  const dc = Math.sign(tc - cc);

  let r = cr + dr;
  let c = cc + dc;
  while (r !== tr || c !== tc) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const tileVal = Array.isArray(map) ? map[r]?.[c] : map[r * COLS + c];
    if (tileVal === TILE_WALL || tileVal === TILE_BLOCK) return false;
    r += dr;
    c += dc;
  }
  const destVal = Array.isArray(map) ? map[tr]?.[tc] : map[tr * COLS + tc];
  if (destVal === TILE_WALL) return false;
  return true;
}

/**
 * Identifies the first destructible block blocking the shortest demolition route to the target,
 * and the approach tile adjacent to it where the entity should stand to place the bomb.
 */
export function findTargetBlockBFS(
  start: GridCoord,
  target: GridCoord,
  map: number[][],
  bombTiles?: Set<string> | Uint8Array | FlatHazardMask
): BlockTargetResult | null {
  if (start.r === target.r && start.c === target.c) return null;

  populateObstacleMask(map, sharedObstacleMask);
  populateMaskFromSetOrArray(bombTiles, sharedBombMask);

  const startIdx = coordToIdx(start.r, start.c);
  const targetIdx = coordToIdx(target.r, target.c);

  const res = zeroGCPathfinder.findPathWithDemolition(
    startIdx,
    targetIdx,
    outPathBuffer,
    sharedObstacleMask,
    sharedBombMask,
    8
  );

  if (res.pathLength === 0 || res.blockingBlockIdx === -1) {
    return null; // Target unreachable or direct path exists with 0 blocks
  }

  const targetR = idxToRow(res.blockingBlockIdx);
  const targetC = idxToCol(res.blockingBlockIdx);
  const stagingR = idxToRow(res.stagingTileIdx);
  const stagingC = idxToCol(res.stagingTileIdx);

  return {
    targetBlock: { r: targetR, c: targetC },
    approachTile: { r: stagingR, c: stagingC },
    placementTile: { r: stagingR, c: stagingC },
  };
}

export const findDemolitionTarget = findTargetBlockBFS;

/**
 * Computes full path through breakable blocks, identifying any blocking blocks along the way.
 */
export function findDemolitionPath(
  start: GridCoord,
  target: GridCoord,
  map: number[][],
  bombTiles?: Set<string> | Uint8Array | FlatHazardMask,
  blockPenalty: number = 8
): DemolitionPath | null {
  if (start.r === target.r && start.c === target.c) return null;

  populateObstacleMask(map, sharedObstacleMask);
  populateMaskFromSetOrArray(bombTiles, sharedBombMask);

  const startIdx = coordToIdx(start.r, start.c);
  const targetIdx = coordToIdx(target.r, target.c);

  const res = zeroGCPathfinder.findPathWithDemolition(
    startIdx,
    targetIdx,
    outPathBuffer,
    sharedObstacleMask,
    sharedBombMask,
    blockPenalty
  );

  if (res.pathLength === 0) return null;

  const path: GridCoord[] = new Array(res.pathLength);
  for (let i = 0; i < res.pathLength; i++) {
    const idx = outPathBuffer[i];
    path[i] = { r: idxToRow(idx), c: idxToCol(idx) };
  }

  return {
    path,
    blockingBlock: res.blockingBlockIdx !== -1 ? { r: idxToRow(res.blockingBlockIdx), c: idxToCol(res.blockingBlockIdx) } : null,
    stagingTile: res.stagingTileIdx !== -1 ? { r: idxToRow(res.stagingTileIdx), c: idxToCol(res.stagingTileIdx) } : null,
    hasDirectPath: res.hasDirectPath,
    blockCount: res.blockCount,
  };
}

/**
 * Convenience wrapper around ZeroGCPathfinder.findPathWithDemolition using shared buffers or provided buffers.
 */
export function findPathWithDemolition(
  start: GridCoord | number,
  target: GridCoord | number,
  mapOrOutPath?: number[][] | Int16Array,
  bombTilesOrObstacleMask?: Set<string> | Uint8Array | FlatHazardMask | null,
  blockPenaltyOrBombMask?: number | Uint8Array | null,
  maybeBlockPenalty: number = 8
): DemolitionPathResult {
  if (mapOrOutPath instanceof Int16Array) {
    const startIdx = typeof start === 'number' ? start : coordToIdx(start.r, start.c);
    const targetIdx = typeof target === 'number' ? target : coordToIdx(target.r, target.c);
    const obstacleMask = (bombTilesOrObstacleMask instanceof Uint8Array) ? bombTilesOrObstacleMask : zeroGCPathfinder.obstacleMask;
    const bombMask = (blockPenaltyOrBombMask instanceof Uint8Array) ? blockPenaltyOrBombMask : null;
    const penalty = typeof maybeBlockPenalty === 'number' ? maybeBlockPenalty : 8;
    return zeroGCPathfinder.findPathWithDemolition(startIdx, targetIdx, mapOrOutPath, obstacleMask, bombMask, penalty);
  }

  const startIdx = typeof start === 'number' ? start : coordToIdx(start.r, start.c);
  const targetIdx = typeof target === 'number' ? target : coordToIdx(target.r, target.c);
  if (Array.isArray(mapOrOutPath)) {
    populateObstacleMask(mapOrOutPath, sharedObstacleMask);
  }
  populateMaskFromSetOrArray(bombTilesOrObstacleMask, sharedBombMask);
  const penalty = typeof blockPenaltyOrBombMask === 'number' ? blockPenaltyOrBombMask : 8;

  return zeroGCPathfinder.findPathWithDemolition(
    startIdx,
    targetIdx,
    outPathBuffer,
    sharedObstacleMask,
    sharedBombMask,
    penalty
  );
}

/**
 * Evaluates whether a safe escape path exists if a bomb is placed at `pos`.
 * Returns the escape path outside both the hypothetical blast and existing bombs, or null if trapped.
 */
export function getSafeBombEscapePath(
  pos: GridCoord | number,
  power: number,
  map: number[][],
  existingBombs?: Set<string> | Uint8Array | FlatHazardMask,
  maxEscapeSteps: number = 4
): GridCoord[] | null {
  const r = typeof pos === 'number' ? (pos / COLS) | 0 : pos.r;
  const c = typeof pos === 'number' ? pos % COLS : pos.c;

  // AI-02 boundary guard
  if (
    !Number.isInteger(r) || !Number.isInteger(c) ||
    r < 0 || r >= ROWS || c < 0 || c >= COLS
  ) {
    return null;
  }

  const startTileVal = map[r]?.[c];
  if (startTileVal === TILE_WALL || startTileVal === TILE_BLOCK) return null;

  const dangerTiles = getBlastTiles({ r, c }, power, map);
  if (existingBombs) {
    if (existingBombs instanceof FlatHazardMask) {
      existingBombs.forEachHazard((br, bc) => {
        if (br !== r || bc !== c) {
          const bBlast = getBlastTiles({ r: br, c: bc }, power, map);
          for (const tile of bBlast) dangerTiles.add(tile);
        }
      });
    } else if (existingBombs instanceof Set) {
      for (const bStr of existingBombs) {
        const comma = bStr.indexOf(',');
        if (comma !== -1) {
          const br = parseInt(bStr.slice(0, comma), 10);
          const bc = parseInt(bStr.slice(comma + 1), 10);
          if (br !== r || bc !== c) {
            const bBlast = getBlastTiles({ r: br, c: bc }, power, map);
            for (const tile of bBlast) dangerTiles.add(tile);
          }
        }
      }
    } else if (existingBombs instanceof Uint8Array) {
      for (let i = 0; i < existingBombs.length; i++) {
        if (existingBombs[i] !== 0) {
          const br = (i / COLS) | 0;
          const bc = i % COLS;
          if (br !== r || bc !== c) {
            const bBlast = getBlastTiles({ r: br, c: bc }, power, map);
            for (const tile of bBlast) dangerTiles.add(tile);
          }
        }
      }
    }
  }

  const simulatedBombs = new Set<string>();
  if (existingBombs instanceof FlatHazardMask) {
    existingBombs.forEachHazard((br, bc) => simulatedBombs.add(`${br},${bc}`));
  } else if (existingBombs instanceof Set) {
    for (const s of existingBombs) simulatedBombs.add(s);
  } else if (existingBombs instanceof Uint8Array) {
    for (let i = 0; i < existingBombs.length; i++) {
      if (existingBombs[i] !== 0) {
        simulatedBombs.add(`${(i / COLS) | 0},${i % COLS}`);
      }
    }
  }
  simulatedBombs.add(`${r},${c}`);

  return findEscapePathBFS({ r, c }, dangerTiles, map, simulatedBombs, maxEscapeSteps);
}

/**
 * Suicide prevention validator: returns true if bomb can be safely dropped without trapping the planter.
 */
export function canSafelyPlaceBomb(
  pos: GridCoord | number,
  power: number,
  map: number[][],
  existingBombs?: Set<string> | Uint8Array | FlatHazardMask,
  maxEscapeSteps: number = 4
): boolean {
  const path = getSafeBombEscapePath(pos, power, map, existingBombs, maxEscapeSteps);
  return path !== null && path.length > 0;
}

/**
 * Identifies a choke-point tile where dropping a bomb will trap or corner the player,
 * while ensuring the enemy has a valid safe escape path.
 */
export function findCorneringBombTile(
  enemyPos: GridCoord,
  playerPos: GridCoord,
  map: number[][],
  bombTiles?: Set<string> | Uint8Array | FlatHazardMask
): GridCoord | null {
  if (
    enemyPos.r < 0 || enemyPos.r >= ROWS || enemyPos.c < 0 || enemyPos.c >= COLS ||
    playerPos.r < 0 || playerPos.r >= ROWS || playerPos.c < 0 || playerPos.c >= COLS
  ) {
    return null;
  }

  // Count player's open walkable neighbors
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  const playerNeighbors: GridCoord[] = [];
  for (const d of dirs) {
    const nr = playerPos.r + d.dr;
    const nc = playerPos.c + d.dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === TILE_EMPTY) {
      playerNeighbors.push({ r: nr, c: nc });
    }
  }

  // Player must be confined (at most 2 open neighbors: corridor, corner, or dead-end)
  if (playerNeighbors.length > 2) {
    return null;
  }

  const path = findPathBFS(enemyPos, playerPos, map, bombTiles || new Set());
  if (path.length === 0 && (enemyPos.r !== playerPos.r || enemyPos.c !== playerPos.c)) {
    return null;
  }

  const dist = Math.abs(enemyPos.r - playerPos.r) + Math.abs(enemyPos.c - playerPos.c);
  if (dist > 4) {
    return null;
  }

  // Candidates for choke point:
  // 1. enemyPos (enemy already standing where dropping a bomb covers player or player exit)
  // 2. player's sole exit
  // 3. steps along path between enemy and player
  const candidates: GridCoord[] = [enemyPos];
  if (playerNeighbors.length === 1) {
    candidates.push(playerNeighbors[0]);
  }
  for (const step of path) {
    candidates.push(step);
  }

  for (const cand of candidates) {
    const blast = getBlastTiles(cand, 2, map);
    const coversPlayerOrExit =
      blast.has(`${playerPos.r},${playerPos.c}`) ||
      playerNeighbors.some((n) => blast.has(`${n.r},${n.c}`));

    if (coversPlayerOrExit) {
      if (canSafelyPlaceBomb(cand, 2, map, bombTiles, 4)) {
        return cand;
      }
    }
  }

  return null;
}

