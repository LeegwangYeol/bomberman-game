export const TILE_SIZE = 40;
export const ROWS = 13;
export const COLS = 15;

export const TILE_EMPTY = 0;
export const TILE_WALL = 1;
export const TILE_BLOCK = 2;

export interface GridCoord {
  r: number;
  c: number;
}

/**
 * Grid-based BFS pathfinding on discrete 13x15 arena avoiding walls, blocks, and active bombs.
 * Includes nearest-frontier Manhattan fallback when player is enclosed by breakable blocks.
 */
export function findPathBFS(
  start: GridCoord,
  target: GridCoord,
  map: number[][],
  bombTiles: Set<string>
): GridCoord[] {
  if (start.r === target.r && start.c === target.c) return [];

  const queue: GridCoord[] = [start];
  const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent: Map<string, GridCoord | null> = new Map();

  visited[start.r][start.c] = true;
  parent.set(`${start.r},${start.c}`, null);

  const directions = [
    { dr: -1, dc: 0 }, // Up
    { dr: 1, dc: 0 },  // Down
    { dr: 0, dc: -1 }, // Left
    { dr: 0, dc: 1 },  // Right
  ];

  let closestReachable: GridCoord = start;
  let minDistance = Math.abs(start.r - target.r) + Math.abs(start.c - target.c);
  let reachedTarget = false;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.r === target.r && current.c === target.c) {
      reachedTarget = true;
      break;
    }

    const dist = Math.abs(current.r - target.r) + Math.abs(current.c - target.c);
    if (dist < minDistance) {
      minDistance = dist;
      closestReachable = current;
    }

    for (const dir of directions) {
      const nr = current.r + dir.dr;
      const nc = current.c + dir.dc;

      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;

      // Obstacle check: Walls or Breakable Blocks
      if (map[nr][nc] === TILE_WALL || map[nr][nc] === TILE_BLOCK) continue;

      // Bomb check: avoid active bombs (unless target is the player's tile)
      if (bombTiles.has(`${nr},${nc}`) && !(nr === target.r && nc === target.c)) {
        continue;
      }

      visited[nr][nc] = true;
      parent.set(`${nr},${nc}`, current);
      queue.push({ r: nr, c: nc });
    }
  }

  const destination = reachedTarget ? target : closestReachable;
  if (destination.r === start.r && destination.c === start.c) {
    return [];
  }

  // Reconstruct path from destination backwards to start
  const path: GridCoord[] = [];
  let curr: GridCoord | null = destination;
  while (curr && !(curr.r === start.r && curr.c === start.c)) {
    path.unshift(curr);
    curr = parent.get(`${curr.r},${curr.c}`) ?? null;
  }

  return path;
}

/**
 * Computes all grid tiles engulfed by an explosion at `center` with radius `power`.
 * Raycasts in 4 cardinal directions:
 * - Stops at indestructible walls (wall tile is NOT engulfed)
 * - Engulfs breakable blocks (block tile IS engulfed, but ray stops after it)
 * - Engulfs empty tiles up to `power` distance
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
 * Finds the shortest path to the nearest safe tile outside dangerTiles using BFS.
 * Guarantees enemy avoids walking into walls, blocks, or other active bombs.
 * If start tile is not in dangerTiles, returns an empty path [].
 * If no safe tile can be reached within maxSteps, returns null.
 */
export function findEscapePathBFS(
  start: GridCoord,
  dangerTiles: Set<string>,
  map: number[][],
  existingBombs: Set<string>,
  maxSteps: number = 4
): GridCoord[] | null {
  // If start is miraculously safe, return empty path
  if (!dangerTiles.has(`${start.r},${start.c}`)) return [];

  const queue: { coord: GridCoord; dist: number }[] = [{ coord: start, dist: 0 }];
  const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent: Map<string, GridCoord | null> = new Map();

  visited[start.r][start.c] = true;
  parent.set(`${start.r},${start.c}`, null);

  const directions = [
    { dr: -1, dc: 0 }, // Up
    { dr: 1, dc: 0 },  // Down
    { dr: 0, dc: -1 }, // Left
    { dr: 0, dc: 1 },  // Right
  ];

  let safeTarget: GridCoord | null = null;

  while (queue.length > 0) {
    const currentItem = queue.shift()!;
    const { coord: current, dist } = currentItem;

    if (!dangerTiles.has(`${current.r},${current.c}`)) {
      safeTarget = current;
      break;
    }

    if (dist >= maxSteps) continue;

    for (const dir of directions) {
      const nr = current.r + dir.dr;
      const nc = current.c + dir.dc;

      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;
      if (map[nr][nc] === TILE_WALL || map[nr][nc] === TILE_BLOCK) continue;
      // Cannot escape into another existing bomb tile (except start tile)
      if (existingBombs.has(`${nr},${nc}`) && !(nr === start.r && nc === start.c)) continue;

      visited[nr][nc] = true;
      parent.set(`${nr},${nc}`, current);
      queue.push({ coord: { r: nr, c: nc }, dist: dist + 1 });
    }
  }

  if (!safeTarget) return null;

  // Reconstruct path from safeTarget backwards to start
  const path: GridCoord[] = [];
  let curr: GridCoord | null = safeTarget;
  while (curr && !(curr.r === start.r && curr.c === start.c)) {
    path.unshift(curr);
    curr = parent.get(`${curr.r},${curr.c}`) ?? null;
  }

  return path;
}

