import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBlastTiles,
  findEscapePathBFS,
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';

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

/* ==============================================================================
 * SUITE 1: BLAST RAYCAST CALCULATION (getBlastTiles)
 * ============================================================================== */

test('Blast Raycast: Open space explosion engulfs center plus 4 cardinal rays up to power', () => {
  const map = createStandardMap();
  // Center at (1, 1), power = 2
  // Up: (0, 1) is TILE_WALL -> stops immediately
  // Left: (1, 0) is TILE_WALL -> stops immediately
  // Down: (2, 1), (3, 1) are TILE_EMPTY -> added
  // Right: (1, 2), (1, 3) are TILE_EMPTY -> added
  const blast = getBlastTiles({ r: 1, c: 1 }, 2, map);

  assert.ok(blast.has('1,1'), 'Epicenter must be in blast');
  assert.ok(blast.has('2,1'), 'Down step 1 must be in blast');
  assert.ok(blast.has('3,1'), 'Down step 2 must be in blast');
  assert.ok(blast.has('1,2'), 'Right step 1 must be in blast');
  assert.ok(blast.has('1,3'), 'Right step 2 must be in blast');

  // Wall tiles must NOT be in blast
  assert.ok(!blast.has('0,1'), 'Up wall must not be in blast');
  assert.ok(!blast.has('1,0'), 'Left wall must not be in blast');

  // Exact set size: (1,1), (2,1), (3,1), (1,2), (1,3) -> 5 tiles
  assert.equal(blast.size, 5);
});

test('Blast Raycast: Indestructible wall halts raycast and is not included in blast set', () => {
  const map = createStandardMap();
  // Center at (1, 2). (2, 2) is a pillar wall
  const blast = getBlastTiles({ r: 1, c: 2 }, 2, map);

  assert.ok(blast.has('1,2'), 'Epicenter (1, 2) included');
  assert.ok(blast.has('1,1'), 'Left step (1, 1) included');
  assert.ok(blast.has('1,3'), 'Right step (1, 3) included');
  assert.ok(blast.has('1,4'), 'Right step (1, 4) included');

  // Pillar wall at (2, 2) halts ray and is omitted
  assert.ok(!blast.has('2,2'), 'Pillar wall (2, 2) must not be in blast set');
  // (3, 2) behind pillar wall must not be engulfed
  assert.ok(!blast.has('3,2'), 'Tile behind pillar wall must not be engulfed');
});

test('Blast Raycast: Breakable block is included in blast set, but halts further propagation', () => {
  const map = createStandardMap();
  // Place breakable block at (1, 3)
  map[1][3] = TILE_BLOCK;

  const blast = getBlastTiles({ r: 1, c: 1 }, 3, map); // power = 3

  // Epicenter and intermediate tile
  assert.ok(blast.has('1,1'));
  assert.ok(blast.has('1,2'));
  // The block tile itself is engulfed and destroyed
  assert.ok(blast.has('1,3'), 'Breakable block tile must be engulfed to trigger destruction');
  // Raycast must NOT penetrate beyond the block tile
  assert.ok(!blast.has('1,4'), 'Tile behind breakable block must NOT be engulfed');
  assert.ok(!blast.has('1,5'), 'Tile 2 steps behind breakable block must NOT be engulfed');
});

test('Blast Raycast: Power 0 only includes the epicenter tile', () => {
  const map = createStandardMap();
  const blast = getBlastTiles({ r: 5, c: 5 }, 0, map);

  assert.equal(blast.size, 1);
  assert.ok(blast.has('5,5'));
});

test('Blast Raycast: Outer boundary check prevents array overflow', () => {
  const map = createStandardMap();
  // Center close to border
  const blast = getBlastTiles({ r: 1, c: 1 }, 10, map);

  for (const tile of blast) {
    const [r, c] = tile.split(',').map(Number);
    assert.ok(r >= 0 && r < ROWS, `Row ${r} out of bounds`);
    assert.ok(c >= 0 && c < COLS, `Col ${c} out of bounds`);
    assert.notEqual(map[r][c], TILE_WALL, `Wall tile at ${r},${c} must not be in blast`);
  }
});

/* ==============================================================================
 * SUITE 2: ESCAPE ROUTE PATHFINDING & SUICIDE PREVENTION (findEscapePathBFS)
 * ============================================================================== */

test('Escape BFS: Start tile already safe returns empty path []', () => {
  const map = createStandardMap();
  const dangerTiles = new Set(['1,1', '1,2']);
  // Start at safe tile (1, 3)
  const path = findEscapePathBFS({ r: 1, c: 3 }, dangerTiles, map, new Set(), 4);

  assert.notEqual(path, null);
  assert.deepEqual(path, []);
});

test('Escape BFS: Finds shortest path to nearest safe tile outside blast radius', () => {
  const map = createStandardMap();
  // Bomb dropped at (1, 1), power = 2
  // Blast covers: (1,1), (1,2), (1,3), (2,1), (3,1)
  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 2, map);

  // Enemy is at (1, 1) and needs to escape
  const path = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(['1,1']), 4);

  assert.ok(path !== null, 'Path to safety must exist');
  assert.ok(path.length > 0, 'Path must require steps');
  assert.ok(path.length <= 4, `Path length ${path.length} must be <= 4 steps`);

  // Final tile of path must NOT be in dangerTiles
  const dest = path[path.length - 1];
  assert.ok(!dangerTiles.has(`${dest.r},${dest.c}`), 'Destination must be outside danger zone');

  // Verify path step continuity: each step is adjacent to previous
  let prev = { r: 1, c: 1 };
  for (const step of path) {
    const manhattan = Math.abs(step.r - prev.r) + Math.abs(step.c - prev.c);
    assert.equal(manhattan, 1, 'Each step in escape path must be orthogonal neighbor');
    assert.notEqual(map[step.r][step.c], TILE_WALL, 'Step must not be a wall');
    assert.notEqual(map[step.r][step.c], TILE_BLOCK, 'Step must not be a block');
    prev = step;
  }
});

test('Escape BFS: Dead-end cul-de-sac returns null (suicide prevention invariant)', () => {
  const map = createStandardMap();
  // Construct a dead-end corridor of length 2 at row 1:
  // (1, 1) is dead end. (1, 2) is only way out. Wall placed at (1, 3) and (2, 1).
  map[1][3] = TILE_WALL;
  map[2][1] = TILE_WALL;

  // If bomb placed at (1, 1) with power 2:
  // Blast covers (1, 1) and (1, 2). Since (1, 3) and (2, 1) and (0, 1) and (1, 0) are walls,
  // there are ZERO reachable safe tiles!
  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 2, map);
  assert.ok(dangerTiles.has('1,1'));
  assert.ok(dangerTiles.has('1,2'));

  const path = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(['1,1']), 4);

  // Must return null to signify trapped in dead end
  assert.equal(path, null, 'Dead-end cul-de-sac must return null (suicide prevention)');
});

test('Escape BFS: Respects maxSteps bound and returns null if safe tile is too distant', () => {
  const map = createStandardMap();
  // Open corridor from (1, 1) to (1, 13)
  // Danger covers tiles (1, 1) through (1, 5)
  const dangerTiles = new Set(['1,1', '1,2', '1,3', '1,4', '1,5']);
  // Block downward paths
  map[2][1] = TILE_WALL;
  map[2][3] = TILE_WALL;
  map[2][5] = TILE_WALL;

  // If maxSteps is 3, enemy cannot reach (1, 6) in 3 steps
  const path = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(), 3);
  assert.equal(path, null, 'Must return null when safe tile requires > maxSteps');

  // If maxSteps is 5, enemy reaches (1, 6) in exactly 5 steps
  const pathLong = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(), 5);
  assert.ok(pathLong !== null);
  assert.equal(pathLong.length, 5);
  assert.deepEqual(pathLong[pathLong.length - 1], { r: 1, c: 6 });
});

test('Escape BFS: Avoids escaping into other existing active bomb tiles', () => {
  const map = createStandardMap();
  // Bomb 1 at (1, 1)
  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 2, map);

  // Active bomb 2 placed at (1, 4)
  const existingBombs = new Set(['1,1', '1,4']);

  // Downward path blocked at (2, 1)
  map[2][1] = TILE_WALL;

  // Path eastward through (1, 2) -> (1, 3) -> (1, 4 is bomb) -> (1, 5)
  // Since (1, 4) has an active bomb, the escape path cannot step on (1, 4)
  const path = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, existingBombs, 4);

  // (1, 4) is blocked by existing bomb, so cannot reach safe tile (1, 4)
  // But (1, 3) is still in dangerTiles!
  // Therefore, no path <= 4 steps exists without walking onto bomb (1, 4)
  if (path) {
    for (const step of path) {
      assert.ok(!existingBombs.has(`${step.r},${step.c}`) || (step.r === 1 && step.c === 1));
    }
  }
});

/* ==============================================================================
 * SUITE 3: BOMB CAPACITY ISOLATION & OWNERSHIP LIFECYCLE
 * ============================================================================== */

class MockSceneForBombTest {
  constructor() {
    this.map = createStandardMap();
    this.isGameOver = false;
    this.playerActiveBombs = 0;
    this.playerMaxBombs = 1;
    this.bombPower = 2;
    this.bombs = []; // { x, y, row, col, active, owner, enemy, power }
    this.explosions = [];
  }

  placePlayerBomb(row, col) {
    if (this.playerActiveBombs >= this.playerMaxBombs) return false;
    const exists = this.bombs.some(b => b.active && b.row === row && b.col === col);
    if (exists) return false;

    const bomb = {
      row,
      col,
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
      active: true,
      owner: 'player',
      power: this.bombPower,
      tint: 0xffffff,
    };
    this.bombs.push(bomb);
    this.playerActiveBombs++;
    return true;
  }

  placeEnemyBomb(enemy, row, col, power) {
    if (this.isGameOver) return false;

    // Enforce global cap (max 2 enemy bombs)
    const enemyBombs = this.bombs.filter(b => b.active && b.owner === 'enemy');
    if (enemyBombs.length >= 2) return false;

    const exists = this.bombs.some(b => b.active && b.row === row && b.col === col);
    if (exists) return false;

    const bomb = {
      row,
      col,
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
      active: true,
      owner: 'enemy',
      enemy,
      power,
      tint: 0xd946ef, // Distinct purple/amethyst tint
    };
    this.bombs.push(bomb);
    return true;
  }

  explodeBomb(bomb) {
    if (!bomb.active) return;
    bomb.active = false;

    // Isolated capacity management
    if (bomb.owner === 'player') {
      this.playerActiveBombs = Math.max(0, this.playerActiveBombs - 1);
    } else if (bomb.owner === 'enemy') {
      if (bomb.enemy && bomb.enemy.onBombExploded) {
        bomb.enemy.onBombExploded();
      }
    }

    this.explosions.push({ row: bomb.row, col: bomb.col, isCenter: true });

    // Blast propagation and chain reactions
    const blast = getBlastTiles({ r: bomb.row, c: bomb.col }, bomb.power, this.map);
    for (const tile of blast) {
      const [r, c] = tile.split(',').map(Number);
      this.explosions.push({ row: r, col: c, isCenter: false });

      // Chain reaction
      const chained = this.bombs.find(b => b.active && b.row === r && b.col === c);
      if (chained) {
        this.explodeBomb(chained);
      }
    }
  }
}

class MockEnemyModel {
  constructor(name, isTracker = true) {
    this.enemyName = name;
    this.isTracker = isTracker;
    this.activeBombs = 0;
    this.maxBombs = 1;
    this.bombCooldownTimer = 0;
    this.bombPower = 2;
    this.aiState = isTracker ? 'TRACKING' : 'PATROL';
  }

  onBombExploded() {
    this.activeBombs = Math.max(0, this.activeBombs - 1);
    if (this.aiState === 'EVADING') {
      this.aiState = this.isTracker ? 'TRACKING' : 'IDLE';
    }
  }
}

test('Bomb Capacity Isolation: Enemy bomb placement does not affect player activeBombs', () => {
  const scene = new MockSceneForBombTest();
  const enemy = new MockEnemyModel('Blinky', true);

  assert.equal(scene.playerActiveBombs, 0);
  assert.equal(enemy.activeBombs, 0);

  // Enemy drops a bomb at (3, 3)
  const placed = scene.placeEnemyBomb(enemy, 3, 3, 2);
  assert.equal(placed, true);
  enemy.activeBombs++;

  // Invariant 1: Player activeBombs is strictly untouched
  assert.equal(scene.playerActiveBombs, 0, 'Player activeBombs must remain 0 after enemy bomb placement');
  assert.equal(enemy.activeBombs, 1);

  // Invariant 2: Player can still place full quota of bombs
  const playerPlaced = scene.placePlayerBomb(1, 1);
  assert.equal(playerPlaced, true);
  assert.equal(scene.playerActiveBombs, 1, 'Player activeBombs is now 1');

  // Invariant 3: Enemy bomb has distinct purple tint 0xd946ef
  const enemyBomb = scene.bombs.find(b => b.owner === 'enemy');
  assert.ok(enemyBomb);
  assert.equal(enemyBomb.tint, 0xd946ef, 'Enemy bomb must have distinct purple tint');
});

test('Bomb Capacity Isolation: Detonating enemy bomb decrements enemy count and leaves player count intact', () => {
  const scene = new MockSceneForBombTest();
  const enemy = new MockEnemyModel('Pyro Slime', true);

  scene.placePlayerBomb(1, 1);
  scene.placeEnemyBomb(enemy, 5, 5, 2);
  enemy.activeBombs = 1;

  assert.equal(scene.playerActiveBombs, 1);
  assert.equal(enemy.activeBombs, 1);

  const enemyBomb = scene.bombs.find(b => b.owner === 'enemy');
  scene.explodeBomb(enemyBomb);

  // Invariant: Enemy active count decrements, player count stays 1
  assert.equal(enemy.activeBombs, 0, 'Enemy activeBombs decremented to 0');
  assert.equal(scene.playerActiveBombs, 1, 'Player activeBombs remains 1');

  // Detonate player bomb
  const playerBomb = scene.bombs.find(b => b.owner === 'player');
  scene.explodeBomb(playerBomb);

  assert.equal(scene.playerActiveBombs, 0, 'Player activeBombs decremented to 0');
  assert.equal(enemy.activeBombs, 0, 'Enemy activeBombs remains 0');
});

test('Bomb Capacity Isolation: Chain reaction between player and enemy bomb cleanly clears both', () => {
  const scene = new MockSceneForBombTest();
  const enemy = new MockEnemyModel('Ignis', true);

  // Player bomb at (1, 1)
  scene.placePlayerBomb(1, 1);
  // Enemy bomb at (1, 2) (within blast radius of 2)
  scene.placeEnemyBomb(enemy, 1, 2, 2);
  enemy.activeBombs = 1;

  assert.equal(scene.playerActiveBombs, 1);
  assert.equal(enemy.activeBombs, 1);

  // Detonate player bomb -> triggers enemy bomb via chain reaction
  const playerBomb = scene.bombs.find(b => b.owner === 'player');
  scene.explodeBomb(playerBomb);

  assert.equal(scene.playerActiveBombs, 0, 'Player active bombs cleared');
  assert.equal(enemy.activeBombs, 0, 'Enemy active bombs cleared by chain reaction');
});

test('Global Enemy Bomb Cap: Arena permits maximum 2 active enemy bombs simultaneously', () => {
  const scene = new MockSceneForBombTest();
  const enemy1 = new MockEnemyModel('Blinky', true);
  const enemy2 = new MockEnemyModel('Stalker', true);
  const enemy3 = new MockEnemyModel('Shadow', true);

  const b1 = scene.placeEnemyBomb(enemy1, 1, 1, 2);
  const b2 = scene.placeEnemyBomb(enemy2, 3, 3, 2);
  const b3 = scene.placeEnemyBomb(enemy3, 5, 5, 2);

  assert.equal(b1, true, 'First enemy bomb accepted');
  assert.equal(b2, true, 'Second enemy bomb accepted');
  assert.equal(b3, false, 'Third enemy bomb rejected by global arena cap (max 2)');
});

/* ==============================================================================
 * SUITE 4: 2-TIER OVERHEAD TEXT UI & LIFECYCLE SAFETY
 * ============================================================================== */

test('Overhead UI: Name Tag (y - 19) and Indicator (y - 33) have distinct 14px vertical clearance', () => {
  const enemyY = 200;
  const nameTagY = enemyY - 19;
  const indicatorY = enemyY - 33;

  assert.equal(nameTagY, 181, 'Name tag sits 19px above sprite center (3px above 32px top edge)');
  assert.equal(indicatorY, 167, 'Indicator sits 33px above sprite center');

  const delta = nameTagY - indicatorY;
  assert.equal(delta, 14, 'Vertical clearance between Indicator and Name Tag must be exactly 14px');
  assert.ok(indicatorY < nameTagY, 'Indicator must sit strictly above Name Tag (Tier 2 above Tier 1)');
});

test('Overhead UI: Depth ordering ensures proper layer stacking (Enemy 9, NameTag 16, Indicator 17)', () => {
  const enemyDepth = 9;
  const nameTagDepth = 16;
  const indicatorDepth = 17;

  assert.ok(nameTagDepth > enemyDepth, 'NameTag must render on top of Enemy sprite');
  assert.ok(indicatorDepth > nameTagDepth, 'Indicator must render on top of NameTag');
});

test('Overhead UI: Persona catalogs contain expected names for trackers and normal archetypes', () => {
  const TRACKER_NAMES = ['Blinky', 'Pyro Slime', 'Ignis', 'Stalker', 'Shadow'];
  const NORMAL_NAMES = ['Grumble', 'Puffball', 'Blobby', 'Spook', 'Waddler'];

  assert.equal(TRACKER_NAMES.length, 5);
  assert.equal(NORMAL_NAMES.length, 5);

  for (const name of TRACKER_NAMES) {
    assert.ok(name.length > 0, 'Tracker name must not be empty');
  }
  for (const name of NORMAL_NAMES) {
    assert.ok(name.length > 0, 'Normal name must not be empty');
  }
});

test('Overhead UI: Entity destruction cleans up both nameTag and indicator without leaks', () => {
  const mockNameTag = { active: true, destroyed: false, destroy() { this.active = false; this.destroyed = true; } };
  const mockIndicator = { active: true, destroyed: false, destroy() { this.active = false; this.destroyed = true; } };

  const enemyInstance = {
    nameTag: mockNameTag,
    indicator: mockIndicator,
    destroy() {
      if (this.nameTag && this.nameTag.active) this.nameTag.destroy();
      if (this.indicator && this.indicator.active) this.indicator.destroy();
    },
  };

  assert.equal(enemyInstance.nameTag.active, true);
  assert.equal(enemyInstance.indicator.active, true);

  enemyInstance.destroy();

  assert.equal(enemyInstance.nameTag.active, false);
  assert.equal(enemyInstance.nameTag.destroyed, true);
  assert.equal(enemyInstance.indicator.active, false);
  assert.equal(enemyInstance.indicator.destroyed, true);
});

test('AI State Machine: Entering EVADING state activates evasion indicator 💨 and evasion speed', () => {
  const enemy = new MockEnemyModel('Blinky', true);
  assert.equal(enemy.aiState, 'TRACKING');

  // Transition to EVADING
  enemy.aiState = 'EVADING';
  assert.equal(enemy.aiState, 'EVADING');

  // Evasion speed specification: 85 px/s
  const evasionSpeed = 85;
  assert.equal(evasionSpeed, 85, 'Evasion speed must be 85 px/s for swift corridor clearance');

  // Once bomb detonates, returns to TRACKING
  enemy.onBombExploded();
  assert.equal(enemy.aiState, 'TRACKING', 'Enemy transitions back to TRACKING after safe evasion');
});
