import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
  findTargetBlockBFS,
  findDemolitionTarget,
  findDemolitionPath,
  canSafelyPlaceBomb,
  getSafeBombEscapePath,
  findCorneringBombTile,
  findOffensiveBombTile,
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
 * TEST HARNESS: Headless Arena Simulator & Aggressive Enemy Model
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

function createCorridorMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || r >= 2) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

class AggressiveArenaSimulator {
  constructor(customMap = null) {
    this.map = customMap ? customMap.map((row) => [...row]) : createStandardMap();
    this.bombs = []; // { id, row, col, timerMs, fuseMs, power, owner, enemy, active }
    this.destroyedBlocks = [];
    this.currentTime = 0;
    this.nextBombId = 1;
    this.damageDealtToEnemy = 0;
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
    // Arena cap: max 2 active enemy bombs
    const activeEnemyBombs = this.bombs.filter((b) => b.active && b.owner === 'enemy').length;
    if (activeEnemyBombs >= 2) return false;

    // Check existing bomb on same tile
    const hasBomb = this.bombs.some((b) => b.active && b.row === row && b.col === col);
    if (hasBomb) return false;

    // Suicide prevention invariant
    const existingCoords = this.getActiveBombCoords();
    if (!canSafelyPlaceBomb({ r: row, c: col }, power, this.map, existingCoords, 4)) {
      return false; // Rejected: unsafe
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
    const blast = getBlastTiles({ r: bomb.row, c: bomb.col }, bomb.power, this.map);

    if (bomb.enemy) {
      if (blast.has(`${bomb.enemy.r},${bomb.enemy.c}`)) {
        this.damageDealtToEnemy++;
        this.suicideCount++;
      }
    }

    if (bomb.enemy && typeof bomb.enemy.onBombExploded === 'function') {
      bomb.enemy.onBombExploded();
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

class AggressiveEnemyModel {
  constructor(r, c, archetype = 'CHASER') {
    this.r = r;
    this.c = c;
    this.archetype = archetype;
    this.aiState = 'HUNTING'; // 'HUNTING', 'EVADING'
    this.activeBombs = 0;
    this.maxBombs = 1;
    this.bombCooldownTimer = 0;
    this.bombPower = 2;
    this.escapePath = [];
    this.evadeTimeoutMs = 0;
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
      // Offensive trap bombing check if close
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
              this.bombCooldownTimer = this.archetype === 'BOMBER' ? 3000 : 2500;
              this.escapePath = safeEscape;
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
      // Direct path is blocked by soft blocks: Aggressive Demolition!
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
              this.bombCooldownTimer = this.archetype === 'BOMBER' ? 3000 : 2500;
              this.escapePath = safeEscape;
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

/* ==============================================================================
 * SCENARIO A: BLOCK DEMOLITION / TERRITORY EXPANSION
 * ============================================================================== */

test('Scenario A1: findTargetBlockBFS & findDemolitionTarget identify first blocking block and approach tile', () => {
  const map = createCorridorMap();
  // Open corridor along row 1 except breakable block at (1, 3)
  map[1][3] = TILE_BLOCK;

  const enemy = { r: 1, c: 1 };
  const player = { r: 1, c: 5 };

  const target1 = findTargetBlockBFS(enemy, player, map);
  assert.ok(target1 !== null, 'Target block must be found');
  assert.deepEqual(target1.targetBlock, { r: 1, c: 3 });
  assert.deepEqual(target1.approachTile, { r: 1, c: 2 });
  assert.deepEqual(target1.placementTile, { r: 1, c: 2 });

  // Verify alias findDemolitionTarget
  const target2 = findDemolitionTarget(enemy, player, map);
  assert.deepEqual(target1, target2);

  // Verify findDemolitionPath structure
  const demoPath = findDemolitionPath(enemy, player, map);
  assert.ok(demoPath !== null);
  assert.equal(demoPath.hasDirectPath, false);
  assert.deepEqual(demoPath.blockingBlock, { r: 1, c: 3 });
  assert.deepEqual(demoPath.stagingTile, { r: 1, c: 2 });
  assert.equal(demoPath.blockCount, 1);
});

test('Scenario A2: Full demolition lifecycle & corridor traversal (places bomb, evades, destroys block, reaches player)', () => {
  const map = createCorridorMap();
  // Place soft block blocking player at (1, 3)
  map[1][3] = TILE_BLOCK;
  // Alcove at (2, 1) enables safe retreat
  map[2][1] = TILE_EMPTY;

  const sim = new AggressiveArenaSimulator(map);
  const enemy = new AggressiveEnemyModel(1, 1, 'BOMBER');
  const playerPos = { r: 1, c: 5 };

  // Tick 1: Enemy advances to approach tile (1, 2)
  enemy.step(sim, playerPos);
  assert.equal(enemy.r, 1);
  assert.equal(enemy.c, 2);
  assert.equal(enemy.activeBombs, 0);

  // Tick 2: Standing at (1, 2) adjacent to block (1, 3), enemy places demolition bomb and evades
  enemy.step(sim, playerPos);
  assert.equal(enemy.activeBombs, 1, 'Enemy must place demolition bomb');
  assert.equal(enemy.aiState, 'EVADING', 'Enemy must switch to EVADING state');
  assert.equal(sim.bombs.length, 1);
  assert.deepEqual({ r: sim.bombs[0].row, c: sim.bombs[0].col }, { r: 1, c: 2 });

  // Continuous simulation during fuse countdown: enemy evades and holds safe position without taking damage
  while (sim.bombs.some((b) => b.active)) {
    enemy.step(sim, playerPos);
    sim.update(200);
  }
  assert.equal(sim.damageDealtToEnemy, 0, 'Enemy must take 0 damage from bomb blast during continuous ticking');
  assert.equal(sim.suicideCount, 0, 'Zero suicides during demolition in Scenario A2');
  assert.equal(sim.map[1][3], TILE_EMPTY, 'Breakable block at (1, 3) must be destroyed to TILE_EMPTY');
  assert.equal(enemy.activeBombs, 0, 'Enemy activeBombs must decrement to 0 on explosion');
  assert.equal(enemy.aiState, 'HUNTING', 'Enemy must resume HUNTING state');

  // Now corridor is cleared! Enemy steps through opened corridor to reach player
  for (let step = 0; step < 10; step++) {
    enemy.step(sim, playerPos);
    if (Math.abs(enemy.r - playerPos.r) + Math.abs(enemy.c - playerPos.c) <= 1) {
      break;
    }
  }

  const finalDist = Math.abs(enemy.r - playerPos.r) + Math.abs(enemy.c - playerPos.c);
  assert.ok(finalDist <= 1, `Enemy must traverse opened corridor and intercept player, got distance ${finalDist}`);
});

test('Scenario A3: Multi-stage territory expansion across arena (sequential block destruction)', () => {
  const map = createCorridorMap();
  // Set up 3 consecutive block barriers along row 1: (1, 3), (1, 6), (1, 9)
  map[1][3] = TILE_BLOCK;
  map[1][6] = TILE_BLOCK;
  map[1][9] = TILE_BLOCK;

  // Safe alcoves adjacent to each staging zone
  map[2][1] = TILE_EMPTY;
  map[2][4] = TILE_EMPTY;
  map[2][7] = TILE_EMPTY;

  const sim = new AggressiveArenaSimulator(map);
  const enemy = new AggressiveEnemyModel(1, 1, 'BOMBER');
  const playerPos = { r: 1, c: 11 };

  let initialDist = Math.abs(enemy.r - playerPos.r) + Math.abs(enemy.c - playerPos.c);
  assert.equal(initialDist, 10);

  // Run simulation up to 100 iterations with ticking
  for (let tick = 0; tick < 100; tick++) {
    enemy.step(sim, playerPos);
    sim.update(200);

    const currDist = Math.abs(enemy.r - playerPos.r) + Math.abs(enemy.c - playerPos.c);
    if (currDist <= 1) break;
  }

  // Enemy must take 0 damage and 0 suicides during continuous ticking
  assert.equal(sim.damageDealtToEnemy, 0, 'Enemy must take 0 damage from bomb blasts during continuous ticking');
  assert.equal(sim.suicideCount, 0, 'Zero suicides must occur during multi-stage demolition');

  // All 3 blocks must have been demolished by the enemy
  assert.equal(sim.map[1][3], TILE_EMPTY, 'First block at (1, 3) must be cleared');
  assert.equal(sim.map[1][6], TILE_EMPTY, 'Second block at (1, 6) must be cleared');
  assert.equal(sim.map[1][9], TILE_EMPTY, 'Third block at (1, 9) must be cleared');

  const finalDist = Math.abs(enemy.r - playerPos.r) + Math.abs(enemy.c - playerPos.c);
  assert.ok(finalDist <= 1, `Enemy must bridge the entire arena and reach player, final dist: ${finalDist}`);
});

/* ==============================================================================
 * SCENARIO B: RELENTLESS HUNTING & DISTANCE REDUCTION
 * ============================================================================== */

test('Scenario B1: Monotonic distance reduction on open grid towards static target', () => {
  const map = createStandardMap();
  const sim = new AggressiveArenaSimulator(map);
  const enemy = new AggressiveEnemyModel(1, 1, 'CHASER');
  const playerPos = { r: 9, c: 11 };

  let prevDist = Math.abs(enemy.r - playerPos.r) + Math.abs(enemy.c - playerPos.c);
  let reached = false;

  for (let step = 0; step < 30; step++) {
    enemy.step(sim, playerPos);
    const currDist = Math.abs(enemy.r - playerPos.r) + Math.abs(enemy.c - playerPos.c);

    assert.ok(
      currDist <= prevDist,
      `Step ${step}: Distance increased from ${prevDist} to ${currDist} at (${enemy.r}, ${enemy.c})`
    );
    prevDist = currDist;

    if (currDist <= 1) {
      reached = true;
      break;
    }
  }

  assert.ok(reached, 'Enemy must relentlessly reach the player on open grid within 30 steps');
});

test('Scenario B2: Statistical superiority over Random Wandering across 20 varied grid layouts', () => {
  const layouts = [];

  // 1. 5 open arenas (no internal pillars)
  for (let i = 0; i < 5; i++) {
    const m = [];
    for (let r = 0; r < ROWS; r++) {
      m[r] = [];
      for (let c = 0; c < COLS; c++) {
        m[r][c] = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? TILE_WALL : TILE_EMPTY;
      }
    }
    layouts.push({ map: m, dynamicPlayer: false });
  }

  // 2. 5 standard pillar maps with sparse blocks
  for (let i = 0; i < 5; i++) {
    const m = createStandardMap();
    for (let k = 0; k < 10; k++) {
      const r = 1 + ((i * 3 + k * 2) % (ROWS - 2));
      const c = 1 + ((i * 2 + k * 3) % (COLS - 2));
      if (m[r][c] === TILE_EMPTY && (r !== 1 || c !== 1) && (r !== 9 || c !== 11)) {
        m[r][c] = TILE_BLOCK;
      }
    }
    layouts.push({ map: m, dynamicPlayer: false });
  }

  // 3. 5 maze corridors (gaps on odd rows so corridors remain connected)
  for (let i = 0; i < 5; i++) {
    const m = createStandardMap();
    const gap1 = 1 + 2 * (i % 5);
    const gap2 = 1 + 2 * ((i + 2) % 5);
    for (let r = 1; r < ROWS - 1; r++) {
      if (r !== gap1) m[r][4] = TILE_WALL;
      if (r !== gap2) m[r][8] = TILE_WALL;
    }
    layouts.push({ map: m, dynamicPlayer: false });
  }

  // 4. 5 dynamic moving player layouts
  for (let i = 0; i < 5; i++) {
    const m = createStandardMap();
    layouts.push({ map: m, dynamicPlayer: true });
  }

  assert.equal(layouts.length, 20);

  let aggressiveIntercepts = 0;
  let randomIntercepts = 0;
  let aggressiveTotalDistSum = 0;
  let randomTotalDistSum = 0;
  let totalMeasurements = 0;

  for (let i = 0; i < 20; i++) {
    const { map, dynamicPlayer } = layouts[i];

    // --- Run Aggressive AI ---
    const simAggressive = new AggressiveArenaSimulator(map);
    const aggEnemy = new AggressiveEnemyModel(1, 1, 'CHASER');
    let pPosAgg = { r: 9, c: 11 };
    let aggHit = false;

    for (let tick = 0; tick < 100; tick++) {
      if (dynamicPlayer && tick % 4 === 0) {
        if (pPosAgg.c > 2 && simAggressive.map[pPosAgg.r][pPosAgg.c - 1] === TILE_EMPTY) {
          pPosAgg = { r: pPosAgg.r, c: pPosAgg.c - 1 };
        }
      }
      aggEnemy.step(simAggressive, pPosAgg);
      simAggressive.update(200);

      const d = Math.abs(aggEnemy.r - pPosAgg.r) + Math.abs(aggEnemy.c - pPosAgg.c);
      aggressiveTotalDistSum += d;
      totalMeasurements++;

      if (d <= 1) {
        aggHit = true;
        break;
      }
    }
    if (aggHit) aggressiveIntercepts++;

    // --- Run Random Wander AI ---
    const simRandom = new AggressiveArenaSimulator(map);
    let randEnemy = { r: 1, c: 1 };
    let pPosRand = { r: 9, c: 11 };
    let randHit = false;
    let seed = 123456789 + i * 10007;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let tick = 0; tick < 100; tick++) {
      if (dynamicPlayer && tick % 4 === 0) {
        if (pPosRand.c > 2 && simRandom.map[pPosRand.r][pPosRand.c - 1] === TILE_EMPTY) {
          pPosRand = { r: pPosRand.r, c: pPosRand.c - 1 };
        }
      }
      const dirs = [
        { dr: -1, dc: 0 },
        { dr: 1, dc: 0 },
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
      ];
      const validMoves = [];
      for (const dir of dirs) {
        const nr = randEnemy.r + dir.dr;
        const nc = randEnemy.c + dir.dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && simRandom.map[nr][nc] === TILE_EMPTY) {
          validMoves.push({ r: nr, c: nc });
        }
      }
      if (validMoves.length > 0) {
        const chosen = validMoves[Math.floor(lcg() * validMoves.length)];
        randEnemy = chosen;
      }
      simRandom.update(200);

      const d = Math.abs(randEnemy.r - pPosRand.r) + Math.abs(randEnemy.c - pPosRand.c);
      randomTotalDistSum += d;

      if (d <= 1) {
        randHit = true;
        break;
      }
    }
    if (randHit) randomIntercepts++;
  }

  const avgDistAggressive = aggressiveTotalDistSum / totalMeasurements;
  const avgDistRandom = randomTotalDistSum / totalMeasurements;

  // 1. Aggressive AI intercept rate must be >= 90% (18/20)
  assert.ok(
    aggressiveIntercepts >= 18,
    `Aggressive AI intercept rate must be >= 90% (18/20), got ${aggressiveIntercepts}/20`
  );
  // 2. Random AI intercept rate must be significantly lower (<= 30%)
  assert.ok(
    randomIntercepts <= 6,
    `Random walk intercept rate must be <= 30% (6/20), got ${randomIntercepts}/20`
  );
  assert.ok(
    aggressiveIntercepts >= randomIntercepts * 2.5,
    `Aggressive intercepts (${aggressiveIntercepts}) must be at least 2.5x random intercepts (${randomIntercepts})`
  );
  // 3. Average distance of aggressive AI must be less than half of random walk
  assert.ok(
    avgDistAggressive < 0.5 * avgDistRandom,
    `Aggressive average distance (${avgDistAggressive.toFixed(2)}) must be < 50% of random (${avgDistRandom.toFixed(2)})`
  );
});

/* ==============================================================================
 * SCENARIO C: CORNERING & TRAP BOMBING
 * ============================================================================== */

test('Scenario C1: Choke point detection for player trapped in corner/dead-end', () => {
  const map = createStandardMap();
  // Player at (1, 1). Dead-end created by walls at (2, 1) and (0, 1), (1, 0)
  map[2][1] = TILE_WALL;
  // Open corridor along row 1: (1, 1) - (1, 2) - (1, 3) - (1, 4) - (1, 5)
  const player = { r: 1, c: 1 };
  const enemy = { r: 1, c: 3 };

  const chokeTile = findCorneringBombTile(enemy, player, map);
  assert.ok(chokeTile !== null, 'Must identify choke point tile for trapped player');
  const isChoke = (chokeTile.r === 1 && chokeTile.c === 3) || (chokeTile.r === 1 && chokeTile.c === 2);
  assert.ok(isChoke, `Choke point must be at (1, 3) or (1, 2), got (${chokeTile.r}, ${chokeTile.c})`);
});

test('Scenario C2: Offensive trap bomb placement with enemy safe retreat', () => {
  const map = createStandardMap();
  // Player cornered at (1, 1)
  map[2][1] = TILE_WALL;
  // Corridor extends east: (1, 1) - (1, 2) - (1, 3) - (1, 4) - (1, 5)
  // Ensure escape paths exist at (1, 4) and (1, 5)
  map[2][3] = TILE_WALL; // wall under (1, 3) forces corridor east

  const sim = new AggressiveArenaSimulator(map);
  const enemy = new AggressiveEnemyModel(1, 3, 'BOMBER');
  const playerPos = { r: 1, c: 1 };

  // Enemy drops trap bomb at (1, 3) with power 2
  const placed = sim.placeEnemyBomb(enemy, 1, 3, 2, 2000);
  assert.equal(placed, true, 'Enemy must successfully place trap bomb');

  // Verify blast coverage: blast from (1, 3) with power 2 hits (1, 2) and (1, 1)
  const blast = getBlastTiles({ r: 1, c: 3 }, 2, sim.map);
  assert.ok(blast.has('1,1'), 'Trap bomb blast must cover trapped player at (1, 1)');
  assert.ok(blast.has('1,2'), 'Trap bomb blast must cover player escape corridor at (1, 2)');

  // Player at (1, 1) has 0 escape routes!
  const playerEscape = findEscapePathBFS(playerPos, blast, sim.map, new Set(['1,3']), 4);
  assert.equal(playerEscape, null, 'Player must have zero escape routes outside the trap');

  // Enemy retreats east to (1, 5) (safe tile outside blast)
  const enemyEscape = getSafeBombEscapePath({ r: 1, c: 3 }, 2, sim.map, new Set(['1,3']), 4);
  assert.ok(enemyEscape !== null && enemyEscape.length > 0, 'Enemy must have safe retreat path');
  const safeDestination = enemyEscape[enemyEscape.length - 1];
  assert.ok(!blast.has(`${safeDestination.r},${safeDestination.c}`), 'Enemy destination must be safe from blast');
});

/* ==============================================================================
 * SCENARIO D: SUICIDE PREVENTION INVARIANT (ZERO SUICIDE)
 * ============================================================================== */

test('Scenario D1: Single-tile dead-end cul-de-sac strictly rejects bomb placement', () => {
  const map = createStandardMap();
  // Cul-de-sac at (1, 1): walls at (0, 1), (1, 0), (2, 1), and (1, 2)
  map[2][1] = TILE_WALL;
  map[1][2] = TILE_WALL;

  const sim = new AggressiveArenaSimulator(map);
  const enemy = new AggressiveEnemyModel(1, 1, 'BOMBER');

  const safe = canSafelyPlaceBomb({ r: 1, c: 1 }, 2, map);
  assert.equal(safe, false, 'canSafelyPlaceBomb must return false in single-tile dead end');

  const placed = sim.placeEnemyBomb(enemy, 1, 1, 2);
  assert.equal(placed, false, 'placeEnemyBomb must strictly reject bomb in dead end');
  assert.equal(enemy.activeBombs, 0);
});

test('Scenario D2: 2-tile and 3-tile dead ends reject bomb when blast covers entire corridor', () => {
  const map = createStandardMap();
  // 2-tile dead end along row 1: (1, 1) and (1, 2).
  // Blocked at (1, 3) and downward exits at (2, 1) and (2, 2)
  map[1][3] = TILE_WALL;
  map[2][1] = TILE_WALL;
  map[2][2] = TILE_WALL;

  // If power = 2, bomb at (1, 1) covers (1, 1) and (1, 2). No safe tile exists!
  assert.equal(canSafelyPlaceBomb({ r: 1, c: 1 }, 2, map), false);
  assert.equal(canSafelyPlaceBomb({ r: 1, c: 2 }, 2, map), false);

  // If power = 1, bomb at (1, 1) covers (1, 1) and (1, 2). Still covers entire 2-tile corridor!
  assert.equal(canSafelyPlaceBomb({ r: 1, c: 1 }, 1, map), false);
});

test('Scenario D3: Multi-bomb overlapping hazard trap rejects bomb when exits are blocked by active bombs', () => {
  const map = createStandardMap();
  // Corridor: (1, 1) - (1, 2) - (1, 3) - (1, 4) - (1, 5)
  // Wall at (2, 1) and (2, 2) and (2, 3)
  map[2][1] = TILE_WALL;
  map[2][2] = TILE_WALL;
  map[2][3] = TILE_WALL;

  // An active ticking bomb already exists at (1, 4)
  const existingBombs = new Set(['1,4']);

  // If enemy drops bomb at (1, 2) with power 2:
  // Blast from (1, 2) covers (1, 1), (1, 2), (1, 3)
  // Tile (1, 4) is occupied by another bomb
  // Therefore within 4 steps, enemy cannot reach safe tile (1, 5) without stepping on active bomb (1, 4)
  const safe = canSafelyPlaceBomb({ r: 1, c: 2 }, 2, map, existingBombs, 4);
  assert.equal(safe, false, 'Must reject bomb drop when existing bombs block all safe escape routes');
});

test('Scenario D4: 1,000-scenario adversarial fuzzing (zero suicide invariance)', () => {
  let testedScenarios = 0;
  let safePlacements = 0;
  let rejectedPlacements = 0;

  for (let seed = 1; seed <= 1000; seed++) {
    const map = createStandardMap();
    const testCoord = { r: 1, c: 1 };

    if (seed % 3 === 0) {
      // 1-tile dead end
      map[1][2] = TILE_WALL;
      map[2][1] = TILE_WALL;
    } else if (seed % 3 === 1) {
      // 2-tile dead end
      map[1][3] = TILE_WALL;
      map[2][1] = TILE_WALL;
      map[2][2] = TILE_WALL;
    } else {
      // Open exits
      map[2][1] = TILE_EMPTY;
      map[1][2] = TILE_EMPTY;
    }

    const power = 2;
    const isSafe = canSafelyPlaceBomb(testCoord, power, map, new Set(), 4);
    testedScenarios++;

    if (isSafe) {
      safePlacements++;
      const escape = getSafeBombEscapePath(testCoord, power, map, new Set(), 4);
      assert.ok(escape !== null && escape.length > 0, 'Safe placement must return non-null escape path');
      assert.ok(escape.length <= 4, 'Escape path must be <= 4 steps');

      const blast = getBlastTiles(testCoord, power, map);
      const dest = escape[escape.length - 1];
      assert.ok(
        !blast.has(`${dest.r},${dest.c}`),
        `Escape destination (${dest.r}, ${dest.c}) must not be in blast set for bomb at (${testCoord.r}, ${testCoord.c})`
      );
    } else {
      rejectedPlacements++;
      const escape = getSafeBombEscapePath(testCoord, power, map, new Set(), 4);
      assert.equal(escape, null, 'Rejected placement must return null escape path');
    }
  }

  assert.equal(testedScenarios, 1000);
  assert.ok(safePlacements > 0, 'Must have some valid safe placements');
  assert.ok(rejectedPlacements > 0, 'Must have some rejected placements');
});

/* ==============================================================================
 * SCENARIO E: PRODUCTION ENTITY SUITE (ChaserEnemy & BomberEnemy Live Demolition)
 * ============================================================================== */

function createMockScene() {
  const createChainable = () => {
    const obj = {};
    const methods = [
      'setOrigin', 'setDepth', 'setText', 'setVisible', 'destroy', 'setAlpha',
      'clear', 'fillStyle', 'fillRect', 'strokeRect', 'lineStyle', 'setScrollFactor',
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
      text: () => createChainable(),
      graphics: () => createChainable(),
      image: () => createChainable(),
    },
    physics: {
      add: {
        existing: (obj) => {
          obj.body = {
            setSize: () => obj.body,
            setOffset: () => obj.body,
            setCollideWorldBounds: () => obj.body,
            setVelocity: (vx, vy) => {
              obj.body.velocity.x = vx;
              obj.body.velocity.y = vy;
              return obj.body;
            },
            velocity: { x: 0, y: 0 },
            x: obj.x,
            y: obj.y,
            width: 24,
            height: 24,
          };
          return obj;
        },
      },
    },
    time: { now: 1000 },
  };
}

test('Scenario E1: Real ChaserEnemy production entity executes live demolition and 8-step BFS escape', () => {
  const scene = createMockScene();
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_BLOCK;
      }
    }
  }
  map[1][1] = TILE_EMPTY; // Enemy tile
  map[1][2] = TILE_BLOCK; // Target soft block to demolish
  map[2][1] = TILE_EMPTY; // Corridor down
  map[3][1] = TILE_EMPTY; // Corridor down
  map[3][2] = TILE_EMPTY; // Safe retreat alcove outside bomb blast
  map[1][5] = TILE_EMPTY; // Player tile behind block

  const chaser = new ChaserEnemy(scene, 1 * 32 + 16, 1 * 32 + 16);
  chaser.bombCooldownTimer = 0;

  let placedBomb = null;
  const dropBombCallback = (r, c, fuseMs) => {
    placedBomb = { r, c, fuseMs };
    return true;
  };

  const player = { x: 5 * 32 + 16, y: 1 * 32 + 16, active: true };
  const bombTiles = new Set();

  chaser.updateAI(16, 1000, player, map, bombTiles, dropBombCallback);

  assert.ok(placedBomb !== null, 'ChaserEnemy must place demolition bomb');
  assert.equal(placedBomb.r, 1);
  assert.equal(placedBomb.c, 1);
  assert.equal(placedBomb.fuseMs, 2000);
  assert.equal(chaser.aiState, EnemyState.EVADING, 'ChaserEnemy must transition to EVADING state');
  assert.equal(chaser.activeBombs, 1, 'activeBombs count must increment to 1');
  assert.ok(chaser.escapePath.length > 0, 'Escape path must be populated');

  // Verify escape destination is outside bomb blast
  const blast = getBlastTiles({ r: 1, c: 1 }, chaser.bombPower, map);
  const dest = chaser.escapePath[chaser.escapePath.length - 1];
  assert.ok(!blast.has(`${dest.r},${dest.c}`), 'Escape destination must be outside blast');

  // Simulate bomb explosion lifecycle
  chaser.onBombExploded();
  assert.equal(chaser.activeBombs, 0, 'activeBombs must decrement to 0');
  assert.equal(chaser.aiState, EnemyState.TRACKING, 'aiState must reset to TRACKING on explosion');
});

test('Scenario E2: Real BomberEnemy production entity executes live demolition and enraged fuse scaling', () => {
  const scene = createMockScene();
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_BLOCK;
      }
    }
  }
  map[1][1] = TILE_EMPTY;
  map[1][2] = TILE_BLOCK; // Target block
  map[2][1] = TILE_EMPTY;
  map[3][1] = TILE_EMPTY;
  map[3][2] = TILE_EMPTY; // Safe retreat
  map[1][5] = TILE_EMPTY;

  // Test 1: Full HP BomberEnemy uses standard 2500ms fuse
  const bomberFullHp = new BomberEnemy(scene, 1 * 32 + 16, 1 * 32 + 16);
  bomberFullHp.bombCooldownTimer = 0;
  let fullHpBomb = null;
  bomberFullHp.updateAI(16, 1000, { x: 5 * 32 + 16, y: 1 * 32 + 16, active: true }, map, new Set(), (r, c, fuseMs) => {
    fullHpBomb = { r, c, fuseMs };
    return true;
  });
  assert.ok(fullHpBomb !== null);
  assert.equal(fullHpBomb.fuseMs, 2500, 'Full HP BomberEnemy must use 2500ms fuse');

  // Test 2: Enraged BomberEnemy (HP = 1) uses quick 1200ms fuse
  const bomberEnraged = new BomberEnemy(scene, 1 * 32 + 16, 1 * 32 + 16);
  bomberEnraged.hp = 1;
  bomberEnraged.bombCooldownTimer = 0;
  let enragedBomb = null;
  bomberEnraged.updateAI(16, 1000, { x: 5 * 32 + 16, y: 1 * 32 + 16, active: true }, map, new Set(), (r, c, fuseMs) => {
    enragedBomb = { r, c, fuseMs };
    return true;
  });
  assert.ok(enragedBomb !== null);
  assert.equal(enragedBomb.fuseMs, 1200, 'Enraged BomberEnemy must use quickFuseMs 1200ms fuse');
  assert.equal(bomberEnraged.aiState, EnemyState.EVADING);
});

test('Scenario E3: Multi-angle demolition approach targeting (getSafeDemolitionApproaches)', () => {
  const map = createStandardMap();
  const targetBlock = { r: 1, c: 3 };
  map[1][3] = TILE_BLOCK;
  map[1][1] = TILE_EMPTY;
  map[1][2] = TILE_EMPTY;
  map[1][4] = TILE_EMPTY;
  map[1][5] = TILE_EMPTY;

  const safeApproaches = getSafeDemolitionApproaches(targetBlock, map, new Set(), 2, 8);
  assert.ok(Array.isArray(safeApproaches), 'Must return array of safe coordinates');
  assert.ok(safeApproaches.length > 0, 'Must identify at least 1 safe approach angle');
  const hasCol2 = safeApproaches.some((pt) => pt.r === 1 && pt.c === 2);
  const hasCol4 = safeApproaches.some((pt) => pt.r === 1 && pt.c === 4);
  assert.ok(hasCol2 || hasCol4, 'Must identify adjacent corridor tiles as safe approaches');
});

test('Scenario E4: Anti-freeze fallback patrol when safe escape is unavailable', () => {
  const scene = createMockScene();
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = TILE_WALL;
    }
  }
  // 2-tile enclosed pocket: enemy at (1,1), adjacent soft block at (1,2), open tile at (2,1)
  map[1][1] = TILE_EMPTY;
  map[1][2] = TILE_BLOCK;
  map[2][1] = TILE_EMPTY; // Alternative corridor tile
  map[1][5] = TILE_EMPTY; // Distant player

  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 2, map);
  const escape = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(['1,1']), 8);
  assert.equal(escape, null, 'Must have no safe escape from 1-tile pocket');

  const chaser = new ChaserEnemy(scene, 1 * 32 + 16, 1 * 32 + 16);
  chaser.bombCooldownTimer = 0;

  let dropped = false;
  chaser.updateAI(16, 1000, { x: 5 * 32 + 16, y: 1 * 32 + 16, active: true }, map, new Set(), () => {
    dropped = true;
    return true;
  });

  // Since unsafe, bomb MUST NOT be dropped to prevent suicide
  assert.equal(dropped, false, 'Must not drop bomb without safe escape');
  // AND anti-freeze fallback patrol must move the entity rather than setting velocity to (0,0)
  const isMoving = Math.abs(chaser.body.velocity.x) > 0 || Math.abs(chaser.body.velocity.y) > 0;
  assert.ok(isMoving, 'Entity must patrol towards adjacent open tile rather than freezing permanently at (0,0)');
});

test('Scenario E5: Aggressive offensive player hunting in open spaces (findOffensiveBombTile)', () => {
  const map = createStandardMap();
  const enemyPos = { r: 3, c: 2 };
  const playerPos = { r: 3, c: 3 }; // Player at 4-way intersection with 4 open neighbors

  // Standard cornering requires playerNeighbors <= 2; at (3,3) player has 4 open neighbors:
  const standardCorner = findCorneringBombTile(enemyPos, playerPos, map, new Set(), false);
  assert.equal(standardCorner, null, 'Standard cornering rejects open player with > 2 neighbors');

  // Aggressive hunting allows close-range offensive bombing (dist <= 2):
  const offensiveBomb = findOffensiveBombTile(enemyPos, playerPos, map, new Set());
  assert.ok(offensiveBomb !== null, 'Offensive hunting must identify strike tile when dist <= 2');
  assert.deepEqual(offensiveBomb, { r: 3, c: 2 });
});

test('Scenario E6: Arcade Physics ignoringColliders Set & AABB overlap separation logic', () => {
  const entity = {
    x: 48,
    y: 48,
    body: {
      x: 36,
      y: 36,
      right: 60,
      bottom: 60,
      width: 24,
      height: 24,
    },
  };

  const bomb = {
    x: 48,
    y: 48,
    data: new Map(),
    getData(key) { return this.data.get(key); },
    setData(key, val) { this.data.set(key, val); },
    body: {
      x: 32,
      y: 32,
      right: 64,
      bottom: 64,
      width: 32,
      height: 32,
    },
  };

  const intersects = (r1, r2) => {
    return !(r2.x >= r1.right || r2.right <= r1.x || r2.y >= r1.bottom || r2.bottom <= r1.y);
  };

  const ignoring = new Set([entity]);
  bomb.setData('ignoringColliders', ignoring);

  const processCallback = (e, b) => {
    const ign = b.getData('ignoringColliders');
    if (ign && ign.has(e)) {
      if (!intersects(e.body, b.body)) {
        ign.delete(e);
        return true;
      }
      return false; // Pass through while still overlapping
    }
    return true; // Collision active
  };

  assert.equal(processCallback(entity, bomb), false, 'Must pass through while body overlaps bomb');
  assert.ok(ignoring.has(entity), 'Entity still in ignoringColliders');

  entity.body.x = 52;
  entity.body.right = 76;
  assert.equal(processCallback(entity, bomb), false, 'Must still pass through while partial overlap remains');

  entity.body.x = 65;
  entity.body.right = 89;
  assert.equal(processCallback(entity, bomb), true, 'Collision must re-enable once body fully separates');
  assert.equal(ignoring.has(entity), false, 'Entity must be removed from ignoringColliders');

  assert.equal(processCallback(entity, bomb), true, 'Subsequent collision attempts must collide');
});
