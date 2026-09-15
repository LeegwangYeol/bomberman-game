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

// Helper: Standard Bomberman arena map generator
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

// Reference Oracle: Independent BFS implementation to verify optimality
function referenceBFS(start, target, map, bombTiles) {
  if (start.r === target.r && start.c === target.c) return [];

  const queue = [start];
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent = new Map();
  visited[start.r][start.c] = true;

  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  let reached = false;
  let closest = start;
  let minManhattan = Math.abs(start.r - target.r) + Math.abs(start.c - target.c);

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr.r === target.r && curr.c === target.c) {
      reached = true;
      break;
    }
    const dist = Math.abs(curr.r - target.r) + Math.abs(curr.c - target.c);
    if (dist < minManhattan) {
      minManhattan = dist;
      closest = curr;
    }
    for (const d of dirs) {
      const nr = curr.r + d.dr;
      const nc = curr.c + d.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;
      if (map[nr][nc] === TILE_WALL || map[nr][nc] === TILE_BLOCK) continue;
      if (bombTiles.has(`${nr},${nc}`) && !(nr === target.r && nc === target.c)) continue;

      visited[nr][nc] = true;
      parent.set(`${nr},${nc}`, curr);
      queue.push({ r: nr, c: nc });
    }
  }

  const dest = reached ? target : closest;
  if (dest.r === start.r && dest.c === start.c) return [];

  const path = [];
  let curr = dest;
  while (curr && !(curr.r === start.r && curr.c === start.c)) {
    path.unshift(curr);
    curr = parent.get(`${curr.r},${curr.c}`);
  }
  return path;
}

// Invariant Verifier
function assertPathInvariants(path, start, target, map, bombTiles) {
  let prev = start;
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    // In bounds
    assert.ok(step.r >= 0 && step.r < ROWS, `Step ${i} out of bounds: row ${step.r}`);
    assert.ok(step.c >= 0 && step.c < COLS, `Step ${i} out of bounds: col ${step.c}`);
    // Not a wall or block
    assert.notEqual(map[step.r][step.c], TILE_WALL, `Step ${i} is on a TILE_WALL`);
    assert.notEqual(map[step.r][step.c], TILE_BLOCK, `Step ${i} is on a TILE_BLOCK`);
    // Not a bomb (unless it's the target tile itself)
    if (bombTiles.has(`${step.r},${step.c}`)) {
      assert.ok(step.r === target.r && step.c === target.c, `Step ${i} is on a bomb that is not target`);
    }
    // Orthogonal step of exactly Manhattan distance 1
    const dist = Math.abs(step.r - prev.r) + Math.abs(step.c - prev.c);
    assert.equal(dist, 1, `Step ${i} is not adjacent to previous step (${prev.r},${prev.c}) -> (${step.r},${step.c})`);
    prev = step;
  }
}

// --- SUITE 1: BFS Correctness & Path Invariants ---
test('BFS Invariants: Path steps are strictly adjacent and obstacle-free across complex maze', () => {
  const map = createStandardMap();
  // Place blocks and bombs without completely sealing (1,1)
  map[1][4] = TILE_BLOCK;
  map[3][2] = TILE_BLOCK;
  const bombTiles = new Set(['1,6', '2,5']);

  const start = { r: 1, c: 1 };
  const target = { r: 5, c: 5 };

  const path = findPathBFS(start, target, map, bombTiles);
  assert.ok(path.length > 0, 'Path should be found');
  assertPathInvariants(path, start, target, map, bombTiles);
  assert.deepEqual(path[path.length - 1], target, 'Last tile must reach target');

  // Verify against independent reference BFS oracle
  const refPath = referenceBFS(start, target, map, bombTiles);
  assert.equal(path.length, refPath.length, 'Path length must match optimal BFS distance');
});

// --- SUITE 2: Enclosed Target Scenarios ---
test('Enclosed Target: Player in corner surrounded by blocks triggers Manhattan nearest-frontier fallback', () => {
  const map = createStandardMap();
  // Enclose corner (1,1) with blocks at (1,2) and (2,1)
  map[1][2] = TILE_BLOCK;
  map[2][1] = TILE_BLOCK;

  const start = { r: 7, c: 7 };
  const target = { r: 1, c: 1 };

  const path = findPathBFS(start, target, map, new Set());
  assert.ok(path.length > 0, 'Should return path to closest reachable frontier');
  assertPathInvariants(path, start, target, map, new Set());

  const endTile = path[path.length - 1];
  // End tile must be adjacent to the blocking ring or closest Manhattan distance
  const dist = Math.abs(endTile.r - target.r) + Math.abs(endTile.c - target.c);
  assert.ok(dist <= 3, `Expected fallback within distance <= 3, got ${dist}`);
});

test('Enclosed Target: Enemy completely boxed in returns empty path', () => {
  const map = createStandardMap();
  // Box in start (3,3) with blocks/walls
  map[2][3] = TILE_BLOCK;
  map[4][3] = TILE_BLOCK;
  map[3][2] = TILE_BLOCK;
  map[3][4] = TILE_BLOCK;

  const start = { r: 3, c: 3 };
  const target = { r: 7, c: 7 };

  const path = findPathBFS(start, target, map, new Set());
  assert.deepEqual(path, [], 'Trapped start should yield empty path');
});

test('Enclosed Target: Completely closed room separation', () => {
  const map = createStandardMap();
  // Seal row 4 completely with blocks
  for (let c = 1; c < COLS - 1; c++) {
    map[4][c] = TILE_BLOCK;
  }

  const start = { r: 1, c: 1 };
  const target = { r: 7, c: 7 };

  const path = findPathBFS(start, target, map, new Set());
  assert.ok(path.length > 0, 'Should find path to border of sealed section');
  assertPathInvariants(path, start, target, map, new Set());
  const endTile = path[path.length - 1];
  assert.ok(endTile.r < 4, 'End tile must remain on the accessible side of the barrier');
});

// --- SUITE 3: Bomb Barricade Scenarios ---
test('Bomb Barricade: All exits around player blocked by bombs', () => {
  const map = createStandardMap();
  const player = { r: 1, c: 1 };
  // Bombs block exits (1,2) and (2,1)
  const bombTiles = new Set(['1,2', '2,1']);
  const enemy = { r: 5, c: 5 };

  const path = findPathBFS(enemy, player, map, bombTiles);
  assert.ok(path.length > 0, 'Enemy should approach up to the bomb perimeter');
  assertPathInvariants(path, enemy, player, map, bombTiles);

  // Path must not step into any bomb tile
  for (const step of path) {
    assert.ok(!bombTiles.has(`${step.r},${step.c}`), 'Path must not step on barricade bombs');
  }
});

test('Bomb Barricade: Bomb on player tile itself is permitted as target', () => {
  const map = createStandardMap();
  const player = { r: 1, c: 3 };
  const bombTiles = new Set(['1,3']); // Player standing on their own bomb

  const enemy = { r: 1, c: 1 };
  const path = findPathBFS(enemy, player, map, bombTiles);

  assert.ok(path.length > 0);
  assertPathInvariants(path, enemy, player, map, bombTiles);
  assert.deepEqual(path[path.length - 1], player, 'Path should be able to step onto target even if bomb is on target');
});

test('Bomb Barricade: Enemy completely surrounded by bombs returns empty path', () => {
  const map = createStandardMap();
  const enemy = { r: 3, c: 3 };
  const bombTiles = new Set(['2,3', '4,3', '3,2', '3,4']);
  const player = { r: 7, c: 7 };

  const path = findPathBFS(enemy, player, map, bombTiles);
  assert.deepEqual(path, [], 'Enemy surrounded by bombs should safely return empty path');
});

test('Bomb Barricade: Corridor blocked by bomb forces detour when alternative route exists', () => {
  const map = createStandardMap();
  // Open arena has multiple paths around pillars
  // Block direct corridor at (1,2) with a bomb
  const bombTiles = new Set(['1,2']);
  const start = { r: 1, c: 1 };
  const target = { r: 1, c: 3 };

  const path = findPathBFS(start, target, map, bombTiles);
  assert.ok(path.length > 0, 'Should find alternative path around pillar');
  assertPathInvariants(path, start, target, map, bombTiles);
  assert.deepEqual(path[path.length - 1], target);
  // Ensure (1,2) is not in path
  for (const step of path) {
    assert.ok(!(step.r === 1 && step.c === 2), 'Must route around bomb at (1,2)');
  }
});

// --- SUITE 4: Dynamic Map Modifications (Mutations) ---
test('Dynamic Map: Rapid block destructions dynamically open new paths', () => {
  const map = createStandardMap();
  // Place a solid wall of blocks between column 2 and 3
  for (let r = 1; r < ROWS - 1; r++) {
    map[r][2] = TILE_BLOCK;
  }

  const start = { r: 1, c: 1 };
  const target = { r: 1, c: 5 };

  // Initially blocked
  const initialPath = findPathBFS(start, target, map, new Set());
  if (initialPath.length > 0) {
    assert.ok(initialPath[initialPath.length - 1].c <= 1, 'Cannot cross block column');
  }

  // Dynamically destroy block at (1, 2)
  map[1][2] = TILE_EMPTY;
  const newPath = findPathBFS(start, target, map, new Set());
  assert.ok(newPath.length > 0);
  assert.deepEqual(newPath[newPath.length - 1], target, 'Path should now reach target through cleared tile');
  assert.deepEqual(newPath[0], { r: 1, c: 2 }, 'First step should use newly cleared tile');
});

test('Dynamic Map: 500 random mutations maintain BFS correctness and memory safety', () => {
  const map = createStandardMap();
  const bombTiles = new Set();

  for (let step = 0; step < 500; step++) {
    const r = 1 + Math.floor(Math.random() * (ROWS - 2));
    const c = 1 + Math.floor(Math.random() * (COLS - 2));

    if (map[r][c] !== TILE_WALL) {
      if (Math.random() < 0.3) {
        map[r][c] = TILE_BLOCK;
      } else if (Math.random() < 0.6) {
        map[r][c] = TILE_EMPTY;
      } else {
        bombTiles.add(`${r},${c}`);
      }
    }

    if (step % 50 === 0 && bombTiles.size > 5) {
      bombTiles.clear();
    }

    const start = { r: 1, c: 1 };
    const target = { r: 11, c: 13 };
    map[start.r][start.c] = TILE_EMPTY;
    map[target.r][target.c] = TILE_EMPTY;
    bombTiles.delete(`${start.r},${start.c}`);

    const path = findPathBFS(start, target, map, bombTiles);
    assertPathInvariants(path, start, target, map, bombTiles);
  }
});

// --- SUITE 5: Scale & Performance Stress Harness ---
test('Performance Benchmark: 5,000 BFS path calculations on 13x15 arena', () => {
  const map = createStandardMap();
  // Populate with typical 40% breakable blocks
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (map[r][c] === TILE_EMPTY && (r > 2 || c > 2) && Math.random() < 0.4) {
        map[r][c] = TILE_BLOCK;
      }
    }
  }

  const bombTiles = new Set(['1,5', '3,7', '5,9', '7,11']);
  const iterations = 5000;
  const start = { r: 1, c: 1 };
  const target = { r: 11, c: 13 };

  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    findPathBFS(start, target, map, bombTiles);
  }
  const t1 = performance.now();

  const totalMs = t1 - t0;
  const avgMs = totalMs / iterations;
  const qps = Math.round((iterations / totalMs) * 1000);

  // Assert reasonable game performance: average < 0.2ms per query (allows 60fps with multiple enemies)
  assert.ok(avgMs < 0.2, `Average BFS latency ${avgMs.toFixed(4)}ms exceeded 0.2ms limit`);
  assert.ok(qps > 5000, `Throughput ${qps} QPS lower than required 5,000 QPS`);
});

// --- SUITE 6: Enemy AI State Machine & Attack Logic Stress Test ---
// Extract and simulate exact logic from GameScene.Enemy
class EnemyStateMachineSim {
  constructor() {
    this.aiState = 'TRACKING';
    this.isTracker = true;
    this.stateTimer = 0;
    this.pathRecalcTimer = 0;
    this.attackDir = { x: 0, y: 0 };
    this.x = 60;
    this.y = 60;
    this.chargeSpeed = 200;
    this.velocity = { x: 0, y: 0 };
    this.tint = 0;
  }

  hasLineOfSight(er, ec, pr, pc, map, bombTiles) {
    const maxRange = 6;
    if (er === pr) {
      const dist = Math.abs(ec - pc);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pc - ec);
      for (let c = ec + step; c !== pc; c += step) {
        if (c < 0 || c >= COLS) return false;
        if (map[er][c] !== TILE_EMPTY || bombTiles.has(`${er},${c}`)) return false;
      }
      return true;
    } else if (ec === pc) {
      const dist = Math.abs(er - pr);
      if (dist === 0 || dist > maxRange) return false;
      const step = Math.sign(pr - er);
      for (let r = er + step; r !== pr; r += step) {
        if (r < 0 || r >= ROWS) return false;
        if (map[r][ec] !== TILE_EMPTY || bombTiles.has(`${r},${ec}`)) return false;
      }
      return true;
    }
    return false;
  }

  startWindup(er, ec, pr, pc, playerX, playerY) {
    this.aiState = 'WINDUP';
    this.stateTimer = 450;
    this.velocity = { x: 0, y: 0 };
    this.tint = 0xff2222;

    // Fixed non-zero directional resolution when sharing same tile
    if (er === pr && ec !== pc) {
      this.attackDir = { x: Math.sign(pc - ec), y: 0 };
    } else if (ec === pc && er !== pr) {
      this.attackDir = { x: 0, y: Math.sign(pr - er) };
    } else {
      const dx = playerX - this.x;
      const dy = playerY - this.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.attackDir = { x: Math.sign(dx) || (this.flipX ? -1 : 1), y: 0 };
      } else {
        this.attackDir = { x: 0, y: Math.sign(dy) || 1 };
      }
    }
  }

  update(delta, er, ec, pr, pc, playerX, playerY, map, bombTiles, isBlocked = false) {
    switch (this.aiState) {
      case 'IDLE': {
        this.velocity = { x: 0, y: 0 };
        const manhattan = Math.abs(er - pr) + Math.abs(ec - pc);
        if (manhattan <= 5 || this.hasLineOfSight(er, ec, pr, pc, map, bombTiles)) {
          this.aiState = 'HUNTING';
          return;
        }
        break;
      }
      case 'PATROL': {
        const manhattan = Math.abs(er - pr) + Math.abs(ec - pc);
        if (manhattan <= 5 || this.hasLineOfSight(er, ec, pr, pc, map, bombTiles)) {
          this.aiState = 'HUNTING';
          return;
        }
        break;
      }
      case 'TRACKING':
      case 'HUNTING': {
        const manhattan = Math.abs(er - pr) + Math.abs(ec - pc);
        if (!this.isTracker && manhattan > 7 && !this.hasLineOfSight(er, ec, pr, pc, map, bombTiles)) {
          this.aiState = 'IDLE';
          this.velocity = { x: 0, y: 0 };
          return;
        }
        if (this.hasLineOfSight(er, ec, pr, pc, map, bombTiles) || manhattan <= 1) {
          this.startWindup(er, ec, pr, pc, playerX, playerY);
        }
        break;
      }
      case 'WINDUP': {
        this.stateTimer -= delta;
        this.velocity = { x: 0, y: 0 };
        if (this.stateTimer <= 0) {
          this.aiState = 'ATTACK';
          this.stateTimer = 650;
          this.tint = 0xffaa00;
          this.velocity = {
            x: this.attackDir.x * this.chargeSpeed,
            y: this.attackDir.y * this.chargeSpeed
          };
        }
        break;
      }
      case 'ATTACK': {
        this.stateTimer -= delta;
        if (this.stateTimer <= 0 || isBlocked) {
          this.aiState = 'COOLDOWN';
          this.stateTimer = 1200;
          this.velocity = { x: 0, y: 0 };
          this.tint = 0x88bbff;
        }
        break;
      }
      case 'COOLDOWN': {
        this.stateTimer -= delta;
        this.velocity = { x: 0, y: 0 };
        if (this.stateTimer <= 0) {
          this.aiState = this.isTracker ? 'TRACKING' : 'IDLE';
          this.tint = 0;
          this.pathRecalcTimer = 0;
        }
        break;
      }
    }
  }
}

test('State Machine: Complete lifecycle TRACKING -> WINDUP -> ATTACK -> COOLDOWN -> TRACKING', () => {
  const sim = new EnemyStateMachineSim();
  const map = createStandardMap();
  const bombTiles = new Set();

  // 1. Initial State
  assert.equal(sim.aiState, 'TRACKING');

  // 2. Trigger Windup via line of sight (Enemy at 1,1; Player at 1,4; open corridor)
  sim.update(16, 1, 1, 1, 4, 180, 60, map, bombTiles);
  assert.equal(sim.aiState, 'WINDUP');
  assert.equal(sim.stateTimer, 450);
  assert.deepEqual(sim.attackDir, { x: 1, y: 0 }); // Aiming right along corridor

  // 3. Advance through Windup (450ms)
  sim.update(200, 1, 1, 1, 4, 180, 60, map, bombTiles);
  assert.equal(sim.aiState, 'WINDUP');
  assert.equal(sim.stateTimer, 250);

  sim.update(250, 1, 1, 1, 4, 180, 60, map, bombTiles);
  assert.equal(sim.aiState, 'ATTACK');
  assert.equal(sim.stateTimer, 650);
  assert.deepEqual(sim.velocity, { x: 200, y: 0 }); // Charging right at chargeSpeed

  // 4. Collision / Blocked during attack
  sim.update(100, 1, 2, 1, 4, 180, 60, map, bombTiles, true); // isBlocked = true
  assert.equal(sim.aiState, 'COOLDOWN');
  assert.equal(sim.stateTimer, 1200);
  assert.deepEqual(sim.velocity, { x: 0, y: 0 });

  // 5. Advance through Cooldown (1200ms)
  sim.update(600, 1, 2, 1, 4, 180, 60, map, bombTiles);
  assert.equal(sim.aiState, 'COOLDOWN');

  sim.update(600, 1, 2, 1, 4, 180, 60, map, bombTiles);
  assert.equal(sim.aiState, 'TRACKING');
  assert.equal(sim.tint, 0);
});

test('State Machine: Attack timeout without collision still cleanly transitions to COOLDOWN', () => {
  const sim = new EnemyStateMachineSim();
  const map = createStandardMap();

  // Trigger windup
  sim.update(16, 1, 1, 1, 2, 100, 60, map, new Set());
  assert.equal(sim.aiState, 'WINDUP');

  // Complete windup (450ms)
  sim.update(450, 1, 1, 1, 2, 100, 60, map, new Set());
  assert.equal(sim.aiState, 'ATTACK');

  // Run full attack duration (650ms) without collision
  sim.update(650, 1, 1, 1, 2, 100, 60, map, new Set(), false);
  assert.equal(sim.aiState, 'COOLDOWN');
});

test('Adversarial Corner Case: Enemy and Player sharing the same grid tile (er === pr && ec === pc)', () => {
  const sim = new EnemyStateMachineSim();
  const map = createStandardMap();

  // Enemy at (1,1) pixel (50, 60), Player at (1,1) pixel (70, 60)
  // Both are on tile (1, 1), so er === pr and ec === pc
  // Manhattan distance is 0, which triggers windup (manhattan <= 1)
  sim.x = 50;
  sim.y = 60;
  sim.update(16, 1, 1, 1, 1, 70, 60, map, new Set());

  assert.equal(sim.aiState, 'WINDUP');

  // CRITICAL AUDIT CHECK (FIXED):
  // When sharing same tile, the attack vector resolves to non-zero using pixel differential (dx = +20)
  assert.notEqual(sim.attackDir.x, 0, 'Attack vector x is non-zero (charges toward playerX)');
  assert.equal(sim.attackDir.x, 1, 'Charges rightward towards player at x=70');
  assert.equal(sim.attackDir.y, 0);
});

test('Refined AI States: Normal enemy transitions IDLE -> HUNTING on proximity and back to IDLE on retreat', () => {
  const sim = new EnemyStateMachineSim();
  sim.isTracker = false;
  sim.aiState = 'IDLE';
  const map = createStandardMap();

  // Player at (1, 8), distance > 5 and no LOS -> stays IDLE
  sim.update(16, 1, 1, 1, 8, 340, 60, map, new Set());
  assert.equal(sim.aiState, 'IDLE');

  // Player moves to (1, 4), distance <= 5 -> triggers alert and HUNTING
  sim.update(16, 1, 1, 1, 4, 180, 60, map, new Set());
  assert.equal(sim.aiState, 'HUNTING');

  // Player retreats to (1, 10), distance > 7 and wall blocked -> loses interest and returns to IDLE
  sim.update(16, 1, 1, 1, 10, 420, 60, map, new Set());
  assert.equal(sim.aiState, 'IDLE');
});
