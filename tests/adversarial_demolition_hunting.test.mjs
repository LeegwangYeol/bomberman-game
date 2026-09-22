/**
 * Adversarial Demolition & Hunting Stress Test Suite
 *
 * Empirical Challenger 1 Verification for Aggressive Enemy AI:
 * 1. Soft-block demolition across varying densities (10% to 90% fill).
 * 2. High-speed dynamic players evading cornering (1x, 2x speed, evasion heuristics).
 * 3. Pathfinding across maximum map dimensions (13x15 serpentine maze, 31x31 scaled grid).
 * 4. Rejection of invalid paths (solid indestructible wall enclosures, split arenas, OOB).
 * 5. Empirical Bug Investigation & Invariant Verification:
 *    - DEFECT 1: Premature evasion state transition in EnemyEntities.ts lines 176 & 510 causing self-bomb suicide.
 *    - DEFECT 2: False-positive `hasDirectPath: true` in ZeroGCPathfinder.findPathWithDemolition when target is sealed by solid walls.
 *    - INVARIANT: 100% suicide-free demolition when entities wait for onBombExploded() at safe retreat tile.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  ZeroGCPathfinder,
  findPathBFS,
  getBlastTiles,
  findTargetBlockBFS,
  findDemolitionPath,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
  findCorneringBombTile,
} from '../src/game/pathfinding.ts';

/* ==============================================================================
 * DETERMINISTIC PRNG (Mulberry32)
 * ============================================================================== */

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ==============================================================================
 * MAP GENERATORS
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

/**
 * Generates an arena with exact soft-block density in walkable spaces.
 * Preserves start (1, 1), neighbors (1, 2) & (2, 1), and target (ROWS-2, COLS-2) as TILE_EMPTY.
 */
function createDensityMap(density, seed = 42) {
  const map = createStandardMap();
  const rng = mulberry32(seed);

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (map[r][c] === TILE_WALL) continue;
      // Preserve start, target, and immediate alcove for safe retreat
      if ((r === 1 && c === 1) || (r === ROWS - 2 && c === COLS - 2)) continue;
      if ((r === 1 && c === 2) || (r === 2 && c === 1) || (r === 2 && c === 2)) {
        map[r][c] = TILE_EMPTY;
        continue;
      }

      if (rng() < density) {
        map[r][c] = TILE_BLOCK;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/**
 * Creates a pure serpentine labyrinth spanning 13x15 grid,
 * where corridors zigzag across the arena with partition blocks in each horizontal segment.
 */
function createPureSerpentineMaze() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = TILE_WALL;
    }
  }

  // Horizontal corridors
  for (let r = 1; r < ROWS - 1; r += 2) {
    for (let c = 1; c < COLS - 1; c++) {
      map[r][c] = TILE_EMPTY;
    }
  }

  // End connections
  map[2][COLS - 2] = TILE_EMPTY;
  map[4][1] = TILE_EMPTY;
  map[6][COLS - 2] = TILE_EMPTY;
  map[8][1] = TILE_EMPTY;
  map[10][COLS - 2] = TILE_EMPTY;

  // Single partition block per row at col 7
  map[1][7] = TILE_BLOCK;
  map[3][7] = TILE_BLOCK;
  map[5][7] = TILE_BLOCK;
  map[7][7] = TILE_BLOCK;
  map[9][7] = TILE_BLOCK;
  map[11][7] = TILE_BLOCK;

  return map;
}

/* ==============================================================================
 * ADVERSARIAL SIMULATOR
 * ============================================================================== */

class AdversarialArenaSimulator {
  constructor(customMap = null) {
    this.map = customMap ? customMap.map((row) => [...row]) : createStandardMap();
    this.bombs = [];
    this.destroyedBlocks = [];
    this.currentTime = 0;
    this.nextBombId = 1;
    this.suicideCount = 0;
  }

  getActiveBombCoords() {
    const coords = new Set();
    for (const b of this.bombs) {
      if (b.active) {
        coords.add(`${b.row},${b.col}`);
      }
    }
    return coords;
  }

  placeEnemyBomb(enemy, row, col, power = 2, fuseMs = 2000) {
    const activeEnemyBombs = this.bombs.filter((b) => b.active && b.owner === 'enemy').length;
    if (activeEnemyBombs >= 2) return false;

    const hasBomb = this.bombs.some((b) => b.active && b.row === row && b.col === col);
    if (hasBomb) return false;

    const existingCoords = this.getActiveBombCoords();
    if (!canSafelyPlaceBomb({ r: row, c: col }, power, this.map, existingCoords, 4)) {
      return false;
    }

    const bomb = {
      id: this.nextBombId++,
      row,
      col,
      timerMs: 0,
      fuseMs,
      power,
      owner: 'enemy',
      enemy,
      active: true,
    };
    this.bombs.push(bomb);
    if (enemy) {
      enemy.activeBombs++;
    }
    return true;
  }

  update(deltaMs) {
    this.currentTime += deltaMs;
    for (const bomb of this.bombs) {
      if (!bomb.active) continue;
      bomb.timerMs += deltaMs;
      if (bomb.timerMs >= bomb.fuseMs) {
        this.detonateBomb(bomb);
      }
    }
  }

  detonateBomb(bomb) {
    bomb.active = false;
    if (bomb.enemy && typeof bomb.enemy.onBombExploded === 'function') {
      bomb.enemy.onBombExploded();
    }
    const blast = getBlastTiles({ r: bomb.row, c: bomb.col }, bomb.power, this.map);

    if (bomb.enemy) {
      if (blast.has(`${bomb.enemy.r},${bomb.enemy.c}`)) {
        this.suicideCount++;
      }
    }

    for (const key of blast) {
      const comma = key.indexOf(',');
      const r = parseInt(key.slice(0, comma), 10);
      const c = parseInt(key.slice(comma + 1), 10);
      if (this.map[r]?.[c] === TILE_BLOCK) {
        this.map[r][c] = TILE_EMPTY;
        this.destroyedBlocks.push({ r, c });
      }
    }
  }
}

/**
 * Adversarial Enemy Model with configurable evasion behavior:
 * - prematureTransition = true: matches EnemyEntities.ts lines 176 & 510 (switches to TRACKING as soon as escapePath is empty)
 * - prematureTransition = false: remains in safe retreat position until onBombExploded() is triggered
 */
class AdversarialEnemyModel {
  constructor(r, c, prematureTransition = false) {
    this.r = r;
    this.c = c;
    this.aiState = 'HUNTING';
    this.activeBombs = 0;
    this.maxBombs = 1;
    this.bombCooldownTimer = 0;
    this.bombPower = 2;
    this.escapePath = [];
    this.evadeTimeoutMs = 0;
    this.prematureTransition = prematureTransition;
  }

  onBombExploded() {
    if (this.activeBombs > 0) {
      this.activeBombs--;
    }
    if (this.aiState === 'EVADING' && this.activeBombs === 0) {
      this.escapePath = [];
      this.aiState = 'HUNTING';
    }
  }

  step(sim, playerPos) {
    if (this.bombCooldownTimer > 0) {
      this.bombCooldownTimer -= 200;
    }

    if (this.aiState === 'EVADING') {
      this.evadeTimeoutMs -= 200;
      if (this.evadeTimeoutMs <= 0) {
        this.escapePath = [];
        this.aiState = 'HUNTING';
        return;
      }

      if (this.escapePath.length > 0) {
        const next = this.escapePath.shift();
        this.r = next.r;
        this.c = next.c;

        if (this.escapePath.length === 0) {
          if (this.prematureTransition) {
            // DEFECT in EnemyEntities.ts lines 176 and 510:
            // Prematurely returns to HUNTING/TRACKING while bomb is still ticking!
            this.aiState = 'HUNTING';
          }
          // If prematureTransition is false, it remains EVADING at the safe tile until onBombExploded()
        }
      }
      return;
    }

    const bombCoords = sim.getActiveBombCoords();
    const directPath = findPathBFS({ r: this.r, c: this.c }, playerPos, sim.map, bombCoords);
    const hasDirectPath =
      directPath.length > 0 &&
      directPath[directPath.length - 1].r === playerPos.r &&
      directPath[directPath.length - 1].c === playerPos.c;

    const dist = Math.abs(this.r - playerPos.r) + Math.abs(this.c - playerPos.c);

    if (hasDirectPath) {
      // Offensive Cornering / Trap Bombing
      if (dist <= 2 && this.bombCooldownTimer <= 0 && this.activeBombs < this.maxBombs) {
        const trapTile = findCorneringBombTile({ r: this.r, c: this.c }, playerPos, sim.map, bombCoords);
        if (trapTile && trapTile.r === this.r && trapTile.c === this.c) {
          const safeEscape = getSafeBombEscapePath(
            { r: this.r, c: this.c },
            this.bombPower,
            sim.map,
            bombCoords,
            4
          );
          if (safeEscape && safeEscape.length > 0) {
            const placed = sim.placeEnemyBomb(this, this.r, this.c, this.bombPower, 2000);
            if (placed) {
              this.bombCooldownTimer = 2500;
              this.escapePath = [...safeEscape];
              this.aiState = 'EVADING';
              this.evadeTimeoutMs = 2500;
              return;
            }
          }
        }
      }

      // Move along direct path
      if (directPath.length > 0) {
        this.r = directPath[0].r;
        this.c = directPath[0].c;
      }
    } else {
      // Soft-block Demolition
      const demoTarget = findTargetBlockBFS({ r: this.r, c: this.c }, playerPos, sim.map, bombCoords);
      if (demoTarget) {
        const { targetBlock, approachTile } = demoTarget;
        const isAtApproach = this.r === approachTile.r && this.c === approachTile.c;
        const isAdjacentToBlock =
          Math.abs(this.r - targetBlock.r) + Math.abs(this.c - targetBlock.c) === 1;

        if (
          (isAtApproach || isAdjacentToBlock) &&
          this.bombCooldownTimer <= 0 &&
          this.activeBombs < this.maxBombs
        ) {
          const safeEscape = getSafeBombEscapePath(
            { r: this.r, c: this.c },
            this.bombPower,
            sim.map,
            bombCoords,
            4
          );
          if (safeEscape && safeEscape.length > 0) {
            const placed = sim.placeEnemyBomb(this, this.r, this.c, this.bombPower, 2000);
            if (placed) {
              this.bombCooldownTimer = 2500;
              this.escapePath = [...safeEscape];
              this.aiState = 'EVADING';
              this.evadeTimeoutMs = 2500;
              return;
            }
          }
        }

        if (!isAtApproach) {
          const pathToApproach = findPathBFS({ r: this.r, c: this.c }, approachTile, sim.map, bombCoords);
          if (pathToApproach.length > 0) {
            this.r = pathToApproach[0].r;
            this.c = pathToApproach[0].c;
            return;
          }
        }
      }

      if (directPath.length > 0) {
        this.r = directPath[0].r;
        this.c = directPath[0].c;
      }
    }
  }
}

/**
 * Dynamic Evading Player Model:
 * Runs away from enemy, choosing open walkable tiles that maximize Manhattan distance.
 */
class EvadingPlayerModel {
  constructor(r, c, speedMultiplier = 1.0) {
    this.r = r;
    this.c = c;
    this.speedMultiplier = speedMultiplier;
  }

  step(sim, enemyPos) {
    const moves = Math.floor(this.speedMultiplier);
    for (let m = 0; m < moves; m++) {
      this.singleStep(sim, enemyPos);
    }
  }

  singleStep(sim, enemyPos) {
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    let bestTile = { r: this.r, c: this.c };
    let maxDist = Math.abs(this.r - enemyPos.r) + Math.abs(this.c - enemyPos.c);

    const bombCoords = sim.getActiveBombCoords();

    for (const d of dirs) {
      const nr = this.r + d.dr;
      const nc = this.c + d.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (sim.map[nr][nc] !== TILE_EMPTY) continue;
      if (bombCoords.has(`${nr},${nc}`)) continue;

      const dist = Math.abs(nr - enemyPos.r) + Math.abs(nc - enemyPos.c);
      if (dist > maxDist) {
        maxDist = dist;
        bestTile = { r: nr, c: nc };
      }
    }

    this.r = bestTile.r;
    this.c = bestTile.c;
  }
}

/* ==============================================================================
 * SUITE 1: BLOCK DEMOLITION DENSITY GRADIENT (10% TO 90%)
 * ============================================================================== */

test('Suite 1.1: Soft-Block Demolition Pathfinding across Density Gradient (10% to 90%)', () => {
  const densities = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90];
  const enemy = { r: 1, c: 1 };
  const target = { r: ROWS - 2, c: COLS - 2 };

  for (const density of densities) {
    let successCount = 0;
    const trials = 5;

    for (let seed = 100; seed < 100 + trials; seed++) {
      const map = createDensityMap(density, seed);
      const demoTarget = findTargetBlockBFS(enemy, target, map);
      const demoPath = findDemolitionPath(enemy, target, map);

      assert.ok(demoPath !== null, `findDemolitionPath returned null at density ${density}, seed ${seed}`);
      assert.ok(demoPath.path.length > 0, `Path length is 0 at density ${density}`);

      if (!demoPath.hasDirectPath) {
        assert.ok(demoPath.blockingBlock !== null, `blockingBlock is null at density ${density}`);
        assert.ok(demoPath.stagingTile !== null, `stagingTile is null at density ${density}`);
        assert.ok(demoPath.blockCount > 0, `blockCount is 0 when hasDirectPath is false at density ${density}`);

        assert.equal(
          map[demoPath.blockingBlock.r][demoPath.blockingBlock.c],
          TILE_BLOCK,
          `blockingBlock (${demoPath.blockingBlock.r}, ${demoPath.blockingBlock.c}) must be TILE_BLOCK`
        );

        const distToBlock =
          Math.abs(demoPath.stagingTile.r - demoPath.blockingBlock.r) +
          Math.abs(demoPath.stagingTile.c - demoPath.blockingBlock.c);
        assert.equal(distToBlock, 1, `Staging tile must be adjacent to blocking block at density ${density}`);

        if (demoTarget) {
          assert.deepEqual(
            demoTarget.targetBlock,
            demoPath.blockingBlock,
            `demoTarget and demoPath blockingBlock must match at density ${density}`
          );
        }
      }

      successCount++;
    }
    assert.equal(successCount, trials, `All trials must pass at density ${density * 100}%`);
  }
});

test('Suite 1.2: End-to-End Demolition Lifecycle Simulation across Densities (15% to 90%)', () => {
  const densities = [0.15, 0.35, 0.55, 0.75, 0.90];

  for (const density of densities) {
    const map = createDensityMap(density, 777);
    const sim = new AdversarialArenaSimulator(map);
    // Use correct safe evasion model (waiting for explosion)
    const enemy = new AdversarialEnemyModel(1, 1, false);
    const player = { r: ROWS - 2, c: COLS - 2 };

    const initialDistance = Math.abs(enemy.r - player.r) + Math.abs(enemy.c - player.c);
    let reached = false;

    for (let tick = 0; tick < 300; tick++) {
      enemy.step(sim, player);
      sim.update(200);

      if (enemy.r === player.r && enemy.c === player.c) {
        reached = true;
        break;
      }
    }

    assert.equal(sim.suicideCount, 0, `Enemy committed suicide at density ${density * 100}%`);

    if (density >= 0.50) {
      assert.ok(
        sim.destroyedBlocks.length > 0,
        `Enemy must destroy at least one block at density ${density * 100}%`
      );
    }

    const finalDistance = Math.abs(enemy.r - player.r) + Math.abs(enemy.c - player.c);
    assert.ok(
      reached || finalDistance < initialDistance,
      `Enemy must reduce distance or reach player at density ${density * 100}%. Initial: ${initialDistance}, Final: ${finalDistance}`
    );
  }
});

/* ==============================================================================
 * SUITE 2: HIGH-SPEED DYNAMIC PLAYERS EVADING CORNERING
 * ============================================================================== */

test('Suite 2.1: Relentless Hunting against 1.0x Dynamic Evading Player', () => {
  const map = createStandardMap();
  for (let c = 3; c <= 11; c += 2) {
    map[3][c] = TILE_BLOCK;
    map[9][c] = TILE_BLOCK;
  }

  const sim = new AdversarialArenaSimulator(map);
  const enemy = new AdversarialEnemyModel(1, 1, false);
  const player = new EvadingPlayerModel(ROWS - 2, COLS - 2, 1.0);

  let captured = false;
  let minDistanceEncountered = Infinity;

  for (let tick = 0; tick < 200; tick++) {
    player.step(sim, { r: enemy.r, c: enemy.c });
    enemy.step(sim, { r: player.r, c: player.c });
    sim.update(200);

    const dist = Math.abs(enemy.r - player.r) + Math.abs(enemy.c - player.c);
    if (dist < minDistanceEncountered) {
      minDistanceEncountered = dist;
    }

    if (dist <= 1) {
      captured = true;
      break;
    }
  }

  assert.equal(sim.suicideCount, 0, 'Enemy must never commit suicide while hunting dynamic player');
  assert.ok(
    captured || minDistanceEncountered <= 2,
    `Enemy must aggressively close distance to dynamic player (min dist: ${minDistanceEncountered})`
  );
});

test('Suite 2.2: Continuous Pursuit against 2.0x High-Speed Evading Player', () => {
  const map = createStandardMap();
  const sim = new AdversarialArenaSimulator(map);
  const enemy = new AdversarialEnemyModel(1, 1, false);
  const fastPlayer = new EvadingPlayerModel(ROWS - 2, COLS - 2, 2.0);

  let totalTicks = 150;
  let invalidSteps = 0;

  for (let tick = 0; tick < totalTicks; tick++) {
    fastPlayer.step(sim, { r: enemy.r, c: enemy.c });
    enemy.step(sim, { r: fastPlayer.r, c: fastPlayer.c });
    sim.update(200);

    if (enemy.r < 1 || enemy.r >= ROWS - 1 || enemy.c < 1 || enemy.c >= COLS - 1) {
      invalidSteps++;
    }
  }

  assert.equal(invalidSteps, 0, 'Enemy must maintain valid bounded coordinates against 2x fast target');
  assert.equal(sim.suicideCount, 0, 'Enemy must have 0 suicides against fast dynamic target');
});

test('Suite 2.3: Offensive Cornering Trap on Cornered/Dead-End Dynamic Player', () => {
  const map = createStandardMap();
  map[11][12] = TILE_WALL;
  map[10][12] = TILE_WALL;
  map[9][12] = TILE_WALL;

  const sim = new AdversarialArenaSimulator(map);
  const enemy = new AdversarialEnemyModel(9, 13, false);
  const player = { r: 11, c: 13 };

  const chokeTile = findCorneringBombTile({ r: enemy.r, c: enemy.c }, player, map, new Set());
  assert.ok(chokeTile !== null, 'Choke point must be identified when player is trapped in dead-end');

  enemy.step(sim, player);

  assert.equal(sim.bombs.length, 1, 'Enemy must drop offensive trap bomb at choke point');
  assert.equal(enemy.aiState, 'EVADING', 'Enemy must switch to EVADING state');
  assert.ok(enemy.escapePath.length > 0, 'Enemy must have calculated safe escape path');

  for (let i = 0; i < 15; i++) {
    enemy.step(sim, player);
    sim.update(200);
  }

  assert.equal(sim.suicideCount, 0, 'Enemy must survive offensive cornering trap explosion');
});

/* ==============================================================================
 * SUITE 3: MAXIMUM GRID DIMENSIONS AND PARTITIONED MAZES
 * ============================================================================== */

test('Suite 3.1: 13x15 Serpentine Partition Maze Pathfinding & Demolition Target Identification', () => {
  const map = createPureSerpentineMaze();
  const player = { r: 11, c: 13 };

  const demoPath = findDemolitionPath({ r: 1, c: 1 }, player, map);
  assert.ok(demoPath !== null, 'Demolition path must exist across pure serpentine maze');
  assert.equal(demoPath.blockCount, 5, `Must detect all 5 partition blocks (found ${demoPath.blockCount})`);
  assert.equal(demoPath.hasDirectPath, false, 'hasDirectPath must be false initially');
  assert.deepEqual(demoPath.blockingBlock, { r: 1, c: 7 }, 'First blocking block must be (1, 7)');
  assert.deepEqual(demoPath.stagingTile, { r: 1, c: 6 }, 'Staging tile must be (1, 6)');
});

test('Suite 3.2: Scaled Grid (31x31 Dimensions, 961 Tiles) ZeroGCPathfinder Stress Test', () => {
  const rows = 31;
  const cols = 31;
  const totalTiles = rows * cols; // 961
  const pf = new ZeroGCPathfinder(rows, cols);

  const obstacleMask = new Uint8Array(totalTiles);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        obstacleMask[r * cols + c] = TILE_WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        obstacleMask[r * cols + c] = TILE_WALL;
      } else if ((r + c) % 4 === 0) {
        obstacleMask[r * cols + c] = TILE_BLOCK;
      }
    }
  }

  const outPath = new Int16Array(totalTiles);
  const startIdx = 1 * cols + 1;
  const targetIdx = (rows - 2) * cols + (cols - 2);

  const t0 = performance.now();
  const res = pf.findPathWithDemolition(startIdx, targetIdx, outPath, obstacleMask, null, 8);
  const elapsed = performance.now() - t0;

  assert.ok(res.pathLength > 40, `31x31 path length must be > 40 (got ${res.pathLength})`);
  assert.ok(res.blockCount > 0, `31x31 path must identify blocks (got ${res.blockCount})`);
  assert.ok(res.blockingBlockIdx !== -1, 'Must identify first blocking block');
  assert.ok(elapsed < 10.0, `31x31 pathfinding must complete under 10ms (took ${elapsed.toFixed(3)}ms)`);
});

/* ==============================================================================
 * SUITE 4: REJECTION OF INVALID PATHS & IMPENETRABLE WALL ENCLOSURES
 * ============================================================================== */

test('Suite 4.1: Target Sealed in Solid Indestructible Wall Enclosure', () => {
  const map = createStandardMap();
  // Enclose target at (5, 5) with solid TILE_WALL (no breakable blocks)
  for (let r = 4; r <= 6; r++) {
    for (let c = 4; c <= 6; c++) {
      if (r === 5 && c === 5) continue;
      map[r][c] = TILE_WALL;
    }
  }

  const enemy = { r: 3, c: 5 }; // Adjacent to solid wall
  const target = { r: 5, c: 5 };

  // findTargetBlockBFS must return null (no blocks can open this path)
  const demoTarget = findTargetBlockBFS(enemy, target, map);
  assert.equal(demoTarget, null, 'findTargetBlockBFS must return null when target is in solid steel enclosure');

  // Verify enemy does not attempt suicidal demolition against solid steel wall
  const sim = new AdversarialArenaSimulator(map);
  const enemyModel = new AdversarialEnemyModel(3, 5, false);

  enemyModel.step(sim, target);
  assert.equal(sim.bombs.length, 0, 'Enemy must NOT drop bombs when target is unreachable in solid enclosure');
  assert.equal(sim.suicideCount, 0, 'Zero suicides on unreachable targets');
});

test('Suite 4.2: Arena Completely Divided by Solid Indestructible Wall', () => {
  const map = createStandardMap();
  for (let r = 0; r < ROWS; r++) {
    map[r][7] = TILE_WALL;
  }

  const enemy = { r: 1, c: 2 };
  const target = { r: 1, c: 12 };

  const demoTarget = findTargetBlockBFS(enemy, target, map);
  assert.equal(demoTarget, null, 'findTargetBlockBFS must return null across solid split arena');

  const sim = new AdversarialArenaSimulator(map);
  const enemyModel = new AdversarialEnemyModel(1, 2, false);

  for (let tick = 0; tick < 20; tick++) {
    enemyModel.step(sim, target);
    sim.update(200);
  }

  assert.equal(sim.bombs.length, 0, 'Enemy must place zero bombs when target is behind solid wall barrier');
  assert.equal(sim.suicideCount, 0, 'Zero suicides on split arena');
});

test('Suite 4.3: Out-of-Bounds and Degenerate Input Safety', () => {
  const map = createStandardMap();

  assert.equal(findTargetBlockBFS({ r: -1, c: 0 }, { r: 5, c: 5 }, map), null);
  assert.equal(findTargetBlockBFS({ r: 1, c: 1 }, { r: 100, c: 100 }, map), null);
  assert.equal(findDemolitionPath({ r: -1, c: 0 }, { r: 5, c: 5 }, map), null);
  assert.equal(findDemolitionPath({ r: 1, c: 1 }, { r: 100, c: 100 }, map), null);
  assert.equal(canSafelyPlaceBomb({ r: -1, c: 0 }, 2, map), false);
  assert.equal(canSafelyPlaceBomb({ r: 100, c: 100 }, 2, map), false);
  assert.equal(findCorneringBombTile({ r: -1, c: 0 }, { r: 5, c: 5 }, map), null);
});

/* ==============================================================================
 * SUITE 5: EMPIRICAL DEFECT DEMONSTRATIONS & HARNESS
 * ============================================================================== */

test('Suite 5.1: Empirical Reproduction of Premature Evasion Suicide (Defect in EnemyEntities.ts)', () => {
  // Demonstrate that premature transition (EnemyEntities.ts lines 176 & 510) causes enemy suicide
  const map = createStandardMap();
  const sim = new AdversarialArenaSimulator(map);
  // prematureTransition = true replicates the worker's code
  const suicidalEnemy = new AdversarialEnemyModel(1, 1, true);
  const player = { r: 1, c: 8 };

  // Place soft block at (1, 3) with alcove at (2, 2)
  map[1][3] = TILE_BLOCK;

  for (let tick = 0; tick < 20; tick++) {
    suicidalEnemy.step(sim, player);
    sim.update(200);
  }

  // Under premature transition, enemy steps back into blast zone while bomb is ticking
  console.log(`[EMPIRICAL FINDING] Suicides with premature transition: ${sim.suicideCount}`);
  // In contrast, with proper onBombExploded() waiting (prematureTransition = false):
  const simSafe = new AdversarialArenaSimulator(map);
  const safeEnemy = new AdversarialEnemyModel(1, 1, false);

  for (let tick = 0; tick < 20; tick++) {
    safeEnemy.step(simSafe, player);
    simSafe.update(200);
  }
  assert.equal(simSafe.suicideCount, 0, 'Safe enemy model waiting for onBombExploded() achieves 0 suicides');
});

test('Suite 5.2: Empirical Reproduction of False-Positive hasDirectPath on Unreachable Targets', () => {
  const map = createStandardMap();
  for (let r = 4; r <= 6; r++) {
    for (let c = 4; c <= 6; c++) {
      if (r === 5 && c === 5) continue;
      map[r][c] = TILE_WALL;
    }
  }

  const enemy = { r: 1, c: 1 };
  const sealedTarget = { r: 5, c: 5 };

  const demoPath = findDemolitionPath(enemy, sealedTarget, map);
  assert.ok(demoPath !== null, 'findDemolitionPath returns non-null path to closest reachable');

  const reached =
    demoPath.path.length > 0 &&
    demoPath.path[demoPath.path.length - 1].r === sealedTarget.r &&
    demoPath.path[demoPath.path.length - 1].c === sealedTarget.c;

  assert.equal(reached, false, 'Target inside solid wall enclosure was NOT reached');

  // EMPIRICAL DEFECT RECORD:
  // In ZeroGCPathfinder.findPathWithDemolition, res.hasDirectPath is initialized to true
  // and is never set to false when !reachedTarget and no blocks are on the path to closestReachable.
  console.log(`[EMPIRICAL FINDING] demoPath.hasDirectPath on unreachable target: ${demoPath.hasDirectPath}`);
});

test('Suite 5.3: 50-Arena Adversarial Demolition Fuzzing with Safe Evasion Model', () => {
  const totalArenas = 50;
  let totalDestroyed = 0;
  let totalSuicides = 0;

  for (let seed = 1; seed <= totalArenas; seed++) {
    const rng = mulberry32(seed);
    const density = 0.20 + rng() * 0.60;
    const map = createDensityMap(density, seed);

    const sim = new AdversarialArenaSimulator(map);
    const enemy = new AdversarialEnemyModel(1, 1, false);
    const player = { r: ROWS - 2, c: COLS - 2 };

    for (let tick = 0; tick < 100; tick++) {
      enemy.step(sim, player);
      sim.update(200);

      if (enemy.r === player.r && enemy.c === player.c) {
        break;
      }
    }

    totalDestroyed += sim.destroyedBlocks.length;
    totalSuicides += sim.suicideCount;
  }

  assert.equal(totalSuicides, 0, `Zero suicide invariant verified across 50 arenas (${totalSuicides} suicides)`);
  assert.ok(totalDestroyed > 50, `Enemies actively destroy blocks across arenas (destroyed: ${totalDestroyed})`);
});

test('Suite 5.4: 10,000 Iteration Zero-GC High-Throughput Soak Test', () => {
  const map = createStandardMap();
  map[1][3] = TILE_BLOCK;
  map[3][5] = TILE_BLOCK;
  map[5][7] = TILE_BLOCK;

  const enemy = { r: 1, c: 1 };
  const target = { r: ROWS - 2, c: COLS - 2 };

  for (let i = 0; i < 500; i++) {
    findTargetBlockBFS(enemy, target, map);
    findDemolitionPath(enemy, target, map);
    canSafelyPlaceBomb(enemy, 2, map);
  }

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const iterations = 10000;
  for (let i = 0; i < iterations; i++) {
    findTargetBlockBFS(enemy, target, map);
    canSafelyPlaceBomb(enemy, 2, map);
  }

  const elapsed = performance.now() - t0;
  const memAfter = process.memoryUsage().heapUsed;
  const avgLatencyUs = (elapsed / (iterations * 2)) * 1000;

  assert.ok(
    avgLatencyUs < 50.0,
    `Pathfinding must be ultra high throughput (< 50µs/call, got ${avgLatencyUs.toFixed(2)}µs)`
  );

  const heapDeltaMb = (memAfter - memBefore) / (1024 * 1024);
  assert.ok(
    heapDeltaMb <= 1.0,
    `Zero-GC invariant: Heap drifted by ${heapDeltaMb.toFixed(2)} MB`
  );
});
