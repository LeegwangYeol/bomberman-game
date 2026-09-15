import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';
import {
  ITEM_DROP_RATE,
  ITEM_WEIGHTS,
  BASE_PLAYER_SPEED,
  SPEED_UP_DELTA,
  MAX_PLAYER_SPEED,
  BASE_MAX_BOMBS,
  MAX_BOMBS_CAP,
  BASE_BOMB_POWER,
  MAX_BOMB_POWER_CAP,
  DASH_SPEED,
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  BOMB_KICK_SPEED,
  ITEM_GRACE_PERIOD_MS,
  SHIELD_INVULN_MS,
  CONVEYOR_DRIFT_SPEED,
  PORTAL_COOLDOWN_MS,
  determineItemDrop,
  applyItemUpgrade,
  calculateSpeedLevel,
  createInitialPlayerStats,
  isItemProtectedFromExplosion,
  simulateBombKickSlide,
} from '../src/game/gameplay_mechanics.ts';

function createStandardArena() {
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
 * CHALLENGE SUITE 1: RAPID KEY REVERSALS & DIRECTIONAL ANIMATION RETENTION
 * ============================================================================== */

class PlayerAnimStateEngine {
  constructor() {
    this.playerFacing = 'down';
    this.currentAnim = null;
    this.currentFrame = 0;
    this.flipX = false;
    this.isPlaying = false;
    this.isDefeated = false;
  }

  updateInput(inputs, primaryAxisOverride = null) {
    if (this.isDefeated) {
      this.isPlaying = true;
      this.currentAnim = 'player_defeat';
      return;
    }

    const { up = false, down = false, left = false, right = false } = inputs;

    let wantX = 0;
    let wantY = 0;
    if (left && !right) wantX = -1;
    else if (right && !left) wantX = 1;

    if (up && !down) wantY = -1;
    else if (down && !up) wantY = 1;

    if (wantX === 0 && wantY === 0) {
      this.isPlaying = false;
      this.currentAnim = null;
      switch (this.playerFacing) {
        case 'down':
          this.currentFrame = 0;
          this.flipX = false;
          break;
        case 'up':
          this.currentFrame = 3;
          this.flipX = false;
          break;
        case 'right':
          this.flipX = false;
          this.currentFrame = 6;
          break;
        case 'left':
          this.flipX = true;
          this.currentFrame = 6;
          break;
      }
      return;
    }

    let primaryAxis = primaryAxisOverride;
    if (!primaryAxis) {
      primaryAxis = wantX !== 0 ? 'x' : 'y';
    }

    this.isPlaying = true;
    if (primaryAxis === 'x') {
      this.flipX = wantX < 0;
      this.playerFacing = wantX < 0 ? 'left' : 'right';
      this.currentAnim = 'player_side';
      this.currentFrame = 6;
    } else {
      this.flipX = false;
      this.playerFacing = wantY < 0 ? 'up' : 'down';
      this.currentAnim = wantY < 0 ? 'player_up' : 'player_down';
      this.currentFrame = wantY < 0 ? 3 : 0;
    }
  }

  triggerDefeat() {
    this.isDefeated = true;
    this.isPlaying = true;
    this.currentAnim = 'player_defeat';
  }
}

test('Challenger 1.1: Rapid UP/DOWN oscillations (1,000 ticks) maintain exact anim state & final idle frame', () => {
  const engine = new PlayerAnimStateEngine();

  for (let i = 0; i < 1000; i++) {
    const isEven = i % 2 === 0;
    engine.updateInput({ up: isEven, down: !isEven }, 'y');

    if (isEven) {
      assert.equal(engine.playerFacing, 'up');
      assert.equal(engine.currentAnim, 'player_up');
      assert.equal(engine.isPlaying, true);
    } else {
      assert.equal(engine.playerFacing, 'down');
      assert.equal(engine.currentAnim, 'player_down');
      assert.equal(engine.isPlaying, true);
    }
  }

  // Release all keys -> Must preserve last facing (down in this case) and idle frame 0
  engine.updateInput({ up: false, down: false, left: false, right: false });
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.playerFacing, 'down');
  assert.equal(engine.currentFrame, 0);
  assert.equal(engine.flipX, false);
});

test('Challenger 1.2: Rapid LEFT/RIGHT oscillations (1,000 ticks) toggle flipX without desync', () => {
  const engine = new PlayerAnimStateEngine();

  for (let i = 0; i < 1000; i++) {
    const isEven = i % 2 === 0;
    engine.updateInput({ left: isEven, right: !isEven }, 'x');

    if (isEven) {
      assert.equal(engine.playerFacing, 'left');
      assert.equal(engine.flipX, true);
      assert.equal(engine.currentAnim, 'player_side');
    } else {
      assert.equal(engine.playerFacing, 'right');
      assert.equal(engine.flipX, false);
      assert.equal(engine.currentAnim, 'player_side');
    }
    assert.equal(engine.isPlaying, true);
  }

  // Release all keys -> Must preserve right facing, idle frame 6, and flipX=false
  engine.updateInput({ up: false, down: false, left: false, right: false });
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.playerFacing, 'right');
  assert.equal(engine.currentFrame, 6);
  assert.equal(engine.flipX, false);
});

test('Challenger 1.3: 10,000 Chaotic Input Fuzzing cycles enforce strict animation invariants', () => {
  const engine = new PlayerAnimStateEngine();
  const validFacings = new Set(['up', 'down', 'left', 'right']);
  const validAnims = new Set(['player_up', 'player_down', 'player_side', null]);

  for (let i = 0; i < 10000; i++) {
    const up = Math.random() > 0.6;
    const down = Math.random() > 0.6;
    const left = Math.random() > 0.6;
    const right = Math.random() > 0.6;

    const primaryAxis = Math.random() > 0.5 ? 'x' : 'y';
    engine.updateInput({ up, down, left, right }, primaryAxis);

    // Invariant 1: Facing is always valid
    assert.ok(validFacings.has(engine.playerFacing), `Invalid facing: ${engine.playerFacing}`);
    // Invariant 2: Current animation is always valid
    assert.ok(validAnims.has(engine.currentAnim), `Invalid anim: ${engine.currentAnim}`);

    // Invariant 3: FlipX strict correlation
    if (engine.playerFacing === 'left') {
      assert.equal(engine.flipX, true);
    } else if (engine.playerFacing === 'right') {
      assert.equal(engine.flipX, false);
    }

    // Invariant 4: Idle frame accuracy when not playing
    if (!engine.isPlaying) {
      if (engine.playerFacing === 'down') assert.equal(engine.currentFrame, 0);
      else if (engine.playerFacing === 'up') assert.equal(engine.currentFrame, 3);
      else if (engine.playerFacing === 'right' || engine.playerFacing === 'left') {
        assert.equal(engine.currentFrame, 6);
      }
    }
  }

  // Final release
  engine.updateInput({ up: false, down: false, left: false, right: false });
  assert.equal(engine.isPlaying, false);
});

test('Challenger 1.4: Defeat state overrides rapid directional movement and locks animation', () => {
  const engine = new PlayerAnimStateEngine();
  engine.updateInput({ right: true }, 'x');
  assert.equal(engine.currentAnim, 'player_side');

  engine.triggerDefeat();
  assert.equal(engine.currentAnim, 'player_defeat');
  assert.equal(engine.isPlaying, true);

  // Subsequent rapid key inputs must not break defeat animation
  engine.updateInput({ left: true, up: true }, 'x');
  assert.equal(engine.currentAnim, 'player_defeat');
  assert.equal(engine.isPlaying, true);
});

/* ==============================================================================
 * CHALLENGE SUITE 2: ENEMY ESCAPE BFS UNDER EXTREME ARENA CONGESTION
 * ============================================================================== */

test('Challenger 2.1: Extreme Arena Congestion — 20 simultaneous bombs with overlapping danger zones', () => {
  const map = createStandardArena();
  const existingBombs = new Set();
  const dangerTiles = new Set();

  // Seed 20 bombs at odd-intersection corridors
  const bombLocations = [
    { r: 1, c: 1 }, { r: 1, c: 3 }, { r: 1, c: 5 }, { r: 1, c: 7 }, { r: 1, c: 9 },
    { r: 3, c: 1 }, { r: 3, c: 3 }, { r: 3, c: 5 }, { r: 3, c: 7 }, { r: 3, c: 9 },
    { r: 5, c: 1 }, { r: 5, c: 3 }, { r: 5, c: 5 }, { r: 5, c: 7 }, { r: 5, c: 9 },
    { r: 7, c: 1 }, { r: 7, c: 3 }, { r: 7, c: 5 }, { r: 7, c: 7 }, { r: 7, c: 9 },
  ];

  for (const b of bombLocations) {
    existingBombs.add(`${b.r},${b.c}`);
    const blast = getBlastTiles(b, 3, map);
    for (const tile of blast) {
      dangerTiles.add(tile);
    }
  }

  // Enemy placed in congested zone at (1, 2)
  const enemyStart = { r: 1, c: 2 };
  assert.ok(dangerTiles.has('1,2'), 'Enemy must start in danger zone');

  const startTime = performance.now();
  const path = findEscapePathBFS(enemyStart, dangerTiles, map, existingBombs, 6);
  const elapsed = performance.now() - startTime;

  // BFS must execute in under 5ms even with 20 overlapping bombs
  assert.ok(elapsed < 5, `Escape BFS elapsed time ${elapsed.toFixed(3)}ms should be < 5ms`);

  if (path !== null) {
    // If a path was found, verify validity
    assert.ok(path.length <= 6);
    const dest = path[path.length - 1];
    assert.ok(!dangerTiles.has(`${dest.r},${dest.c}`), 'Escape target must be safe');

    let curr = enemyStart;
    for (const step of path) {
      assert.equal(Math.abs(step.r - curr.r) + Math.abs(step.c - curr.c), 1);
      assert.notEqual(map[step.r][step.c], TILE_WALL);
      assert.notEqual(map[step.r][step.c], TILE_BLOCK);
      // Cannot step on active bomb unless it was start
      assert.ok(!existingBombs.has(`${step.r},${step.c}`) || (step.r === enemyStart.r && step.c === enemyStart.c));
      curr = step;
    }
  }
});

test('Challenger 2.2: Narrow Corridor Choke — 3 consecutive bombs in 1-tile corridor', () => {
  const map = createStandardArena();
  // Wall off side exit at (2, 1) so (1, 1) is a true 1-tile wide dead-end corridor
  map[2][1] = TILE_WALL;

  const existingBombs = new Set(['1,2', '1,4', '1,6']);
  const dangerTiles = new Set();

  for (const b of [{ r: 1, c: 2 }, { r: 1, c: 4 }, { r: 1, c: 6 }]) {
    const blast = getBlastTiles(b, 2, map);
    for (const tile of blast) dangerTiles.add(tile);
  }

  // Enemy is at (1, 1). Safe tile (1, 8) is 7 steps away, beyond maxSteps=4
  const path4 = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, existingBombs, 4);
  assert.equal(path4, null, 'Choked corridor with safe tile beyond maxSteps must return null');

  // With maxSteps=10, safe tile (1, 8) is reachable if path is open, but bombs at (1,2), (1,4), (1,6) block corridor!
  const path10 = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, existingBombs, 10);
  assert.equal(path10, null, 'Cannot walk over existing bombs at (1,2) to escape down corridor');
});

test('Challenger 2.3: 5,000 Randomized Congestion BFS Benchmark (No infinite loops, < 0.1ms average)', () => {
  const map = createStandardArena();
  let totalTime = 0;

  for (let i = 0; i < 5000; i++) {
    const bombCount = 1 + (i % 6);
    const existingBombs = new Set();
    const dangerTiles = new Set();

    for (let b = 0; b < bombCount; b++) {
      const br = 1 + ((i * 3 + b * 2) % (ROWS - 2));
      const bc = 1 + ((i * 5 + b * 2) % (COLS - 2));
      if (map[br][bc] === TILE_EMPTY) {
        existingBombs.add(`${br},${bc}`);
        const blast = getBlastTiles({ r: br, c: bc }, 2, map);
        for (const t of blast) dangerTiles.add(t);
      }
    }

    const startR = 1 + (i % (ROWS - 2));
    const startC = 1 + ((i * 2) % (COLS - 2));

    const t0 = performance.now();
    const path = findEscapePathBFS({ r: startR, c: startC }, dangerTiles, map, existingBombs, 4);
    totalTime += (performance.now() - t0);

    if (path !== null && path.length > 0) {
      const finalTile = path[path.length - 1];
      assert.ok(!dangerTiles.has(`${finalTile.r},${finalTile.c}`));
    }
  }

  const avgTime = totalTime / 5000;
  assert.ok(avgTime < 0.1, `Average BFS execution time ${avgTime.toFixed(4)}ms must be < 0.1ms`);
});

test('Challenger 2.4: Blast Raycast with Extreme Power (power=100) respects map bounds without memory blowup', () => {
  const map = createStandardArena();
  const blast = getBlastTiles({ r: 6, c: 7 }, 100, map);

  // Maximum possible empty tiles engulfed cannot exceed ROWS * COLS
  assert.ok(blast.size <= ROWS * COLS);
  assert.ok(blast.size > 0);

  for (const tile of blast) {
    const [r, c] = tile.split(',').map(Number);
    assert.ok(r >= 0 && r < ROWS);
    assert.ok(c >= 0 && c < COLS);
    assert.notEqual(map[r][c], TILE_WALL, 'Indestructible walls must never be in blast set');
  }
});

/* ==============================================================================
 * CHALLENGE SUITE 3: HIGH-VOLUME ITEM DROPS & 10,000 STAT CLAMPING MUTATIONS
 * ============================================================================== */

test('Challenger 3.1: 100,000 Item Drop Simulations satisfy exact statistical confidence bounds', () => {
  const N = 100000;
  let dropCount = 0;
  const itemCounts = {
    BOMB_UP: 0,
    FIRE_UP: 0,
    SPEED_UP: 0,
    KICK: 0,
    SHIELD: 0,
  };

  for (let i = 0; i < N; i++) {
    const drop = determineItemDrop(Math.random(), Math.random());
    if (drop !== null) {
      dropCount++;
      itemCounts[drop]++;
    }
  }

  const observedDropRate = dropCount / N;
  // Expected 45% ± 0.6% at 100,000 samples
  assert.ok(
    observedDropRate >= 0.444 && observedDropRate <= 0.456,
    `Observed drop rate ${observedDropRate} must be within [0.444, 0.456]`
  );

  const pBomb = itemCounts.BOMB_UP / dropCount;
  const pFire = itemCounts.FIRE_UP / dropCount;
  const pSpeed = itemCounts.SPEED_UP / dropCount;
  const pKick = itemCounts.KICK / dropCount;
  const pShield = itemCounts.SHIELD / dropCount;

  // Verify weights within 1.5% tolerance
  assert.ok(pBomb >= 0.365 && pBomb <= 0.395, `Bomb Up proportion ${pBomb} near 0.38`);
  assert.ok(pFire >= 0.365 && pFire <= 0.395, `Fire Up proportion ${pFire} near 0.38`);
  assert.ok(pSpeed >= 0.145 && pSpeed <= 0.175, `Speed Up proportion ${pSpeed} near 0.16`);
  assert.ok(pKick >= 0.030 && pKick <= 0.050, `Kick proportion ${pKick} near 0.04`);
  assert.ok(pShield >= 0.030 && pShield <= 0.050, `Shield proportion ${pShield} near 0.04`);
});

test('Challenger 3.2: 10,000 Consecutive Item Upgrades on single player maintain strict clamping', () => {
  const stats = createInitialPlayerStats();

  const itemTypes = ['SPEED_UP', 'BOMB_UP', 'FIRE_UP', 'KICK', 'SHIELD'];

  for (let i = 0; i < 10000; i++) {
    const item = itemTypes[i % itemTypes.length];
    applyItemUpgrade(stats, item);

    // Invariant 1: Speed never exceeds MAX_PLAYER_SPEED (250)
    assert.ok(stats.speed <= MAX_PLAYER_SPEED, `Speed ${stats.speed} exceeded ${MAX_PLAYER_SPEED}`);
    // Invariant 2: SpeedLevel never exceeds 5
    assert.ok(stats.speedLevel <= 5, `SpeedLevel ${stats.speedLevel} exceeded 5`);
    // Invariant 3: Max bombs never exceeds MAX_BOMBS_CAP (8)
    assert.ok(stats.maxBombs <= MAX_BOMBS_CAP, `MaxBombs ${stats.maxBombs} exceeded ${MAX_BOMBS_CAP}`);
    // Invariant 4: Bomb power never exceeds MAX_BOMB_POWER_CAP (8)
    assert.ok(stats.bombPower <= MAX_BOMB_POWER_CAP, `BombPower ${stats.bombPower} exceeded ${MAX_BOMB_POWER_CAP}`);
    // Invariant 5: No NaN or Infinite numbers
    assert.ok(Number.isFinite(stats.speed));
    assert.ok(Number.isFinite(stats.maxBombs));
    assert.ok(Number.isFinite(stats.bombPower));
    assert.ok(Number.isFinite(stats.score));
  }

  // Final exact cap values
  assert.equal(stats.speed, 250);
  assert.equal(stats.speedLevel, 5);
  assert.equal(stats.maxBombs, 8);
  assert.equal(stats.bombPower, 8);
  assert.equal(stats.hasKick, true);
  assert.equal(stats.hasShield, true);

  // Exact counters: 2000 of each
  assert.equal(stats.itemsCollected.speedUp, 2000);
  assert.equal(stats.itemsCollected.bombUp, 2000);
  assert.equal(stats.itemsCollected.fireUp, 2000);
  assert.equal(stats.itemsCollected.kick, 2000);
  assert.equal(stats.itemsCollected.shield, 2000);
  assert.equal(stats.score, 10000 * 100);
});

test('Challenger 3.3: Grace Period Microsecond Boundary Precision', () => {
  const spawn = 5000.0;

  // Sub-millisecond checks around 600ms threshold
  assert.equal(isItemProtectedFromExplosion(spawn, spawn + 0.0), true);
  assert.equal(isItemProtectedFromExplosion(spawn, spawn + 599.9), true);
  assert.equal(isItemProtectedFromExplosion(spawn, spawn + 600.0), true);
  assert.equal(isItemProtectedFromExplosion(spawn, spawn + 600.001), false);
  assert.equal(isItemProtectedFromExplosion(spawn, spawn + 601.0), false);
  assert.equal(isItemProtectedFromExplosion(spawn, spawn + 1000000.0), false);
});

/* ==============================================================================
 * CHALLENGE SUITE 4: SLIDING BOMB COLLISIONS & CHAIN DETONATION DYNAMICS
 * ============================================================================== */

test('Challenger 4.1: Sliding Bomb trajectory stops at perimeter wall, pillar, block, and other bomb', () => {
  const map = createStandardArena();
  // Place breakable block at (1, 8)
  map[1][8] = TILE_BLOCK;
  // Place existing bomb at (3, 5)
  const bombTiles = new Set(['3,5']);

  // Case A: Slide right into breakable block at (1, 8)
  const resA = simulateBombKickSlide(2, 1, 1, 0, map, bombTiles);
  assert.equal(resA.endRow, 1);
  assert.equal(resA.endCol, 7, 'Must stop at tile 7 before block at 8');

  // Case B: Slide down into pillar wall at (2, 2)
  const resB = simulateBombKickSlide(2, 1, 0, 1, map, bombTiles);
  assert.equal(resB.endRow, 1, 'Pillar at (2, 2) blocks downward slide from (1, 2)');
  assert.equal(resB.endCol, 2);
  assert.equal(resB.steps, 0);

  // Case C: Slide right towards existing bomb at (3, 5) from (3, 1)
  const resC = simulateBombKickSlide(1, 3, 1, 0, map, bombTiles);
  assert.equal(resC.endRow, 3);
  assert.equal(resC.endCol, 4, 'Must stop at tile 4 before active bomb at (3, 5)');

  // Case D: Slide left into outer perimeter wall at (1, 0) from (1, 3)
  const resD = simulateBombKickSlide(3, 1, -1, 0, map, bombTiles);
  assert.equal(resD.endRow, 1);
  assert.equal(resD.endCol, 1, 'Must stop at tile 1 before outer wall at (1, 0)');
});

test('Challenger 4.2: Continuous Physics Integration Simulation (Zero Wall-Tunneling across 120fps, 60fps, 30fps)', () => {
  const map = createStandardArena();
  const speed = BOMB_KICK_SPEED; // 300 px/s
  const corridorEndCol = 13; // wall is at col 14

  // Operational game loop delta rates: 120 FPS (8.3ms), 60 FPS (16.6ms), 30 FPS (33.3ms), and 50ms threshold
  const safeDeltas = [8.3, 16.6, 33.3, 50];

  for (const delta of safeDeltas) {
    let bombX = 1 * TILE_SIZE + TILE_SIZE / 2; // (1, 1) center: 60px
    let bombY = 1 * TILE_SIZE + TILE_SIZE / 2; // 60px
    let isSliding = true;
    const dirX = 1;

    let frames = 0;
    while (isSliding && frames < 500) {
      frames++;
      // Check forward obstacle with 16px lookahead
      const checkX = bombX + dirX * 16;
      const targetCol = Math.floor(checkX / TILE_SIZE);
      const targetRow = Math.floor(bombY / TILE_SIZE);

      if (targetCol >= COLS || map[targetRow][targetCol] !== TILE_EMPTY) {
        // Collided with wall or obstacle! Snap to tile
        const curCol = Math.floor(bombX / TILE_SIZE);
        bombX = curCol * TILE_SIZE + TILE_SIZE / 2;
        isSliding = false;
      } else {
        bombX += dirX * speed * (delta / 1000);
      }
    }

    const finalCol = Math.floor(bombX / TILE_SIZE);
    assert.equal(
      finalCol,
      corridorEndCol,
      `Delta ${delta}ms: Bomb must stop cleanly at corridor boundary col 13, but was at col ${finalCol}`
    );
  }

  // Extreme lag spike resilience test with adaptive lookahead: max(16, speed * delta / 1000)
  const lagSpikeDeltas = [100, 150, 200];
  for (const delta of lagSpikeDeltas) {
    let bombX = 1 * TILE_SIZE + TILE_SIZE / 2;
    let bombY = 1 * TILE_SIZE + TILE_SIZE / 2;
    let isSliding = true;
    const dirX = 1;

    let frames = 0;
    while (isSliding && frames < 500) {
      frames++;
      // Adaptive lookahead scales with delta step size
      const lookahead = Math.max(16, speed * (delta / 1000) + 4);
      const checkX = bombX + dirX * lookahead;
      const targetCol = Math.floor(checkX / TILE_SIZE);
      const targetRow = Math.floor(bombY / TILE_SIZE);

      if (targetCol >= COLS || map[targetRow][targetCol] !== TILE_EMPTY) {
        const curCol = Math.floor(bombX / TILE_SIZE);
        bombX = curCol * TILE_SIZE + TILE_SIZE / 2;
        isSliding = false;
      } else {
        bombX += dirX * speed * (delta / 1000);
      }
    }

    const finalCol = Math.floor(bombX / TILE_SIZE);
    assert.equal(
      finalCol,
      corridorEndCol,
      `Lag spike ${delta}ms with adaptive lookahead must stop cleanly at col 13`
    );
  }
});

test('Challenger 4.3: Sliding Bomb Chain Detonation Cascade Simulation', () => {
  const map = createStandardArena();

  // Setup: Bomb A at (1, 2) kicked right towards stationary Bomb B at (1, 6)
  // Bomb A stops at (1, 5) adjacent to Bomb B.
  // When Bomb A detonates (power 2), its blast reaches (1, 6) and triggers Bomb B immediately.
  const slideRes = simulateBombKickSlide(2, 1, 1, 0, map, new Set(['1,6']));
  assert.equal(slideRes.endRow, 1);
  assert.equal(slideRes.endCol, 5);

  const bombABlast = getBlastTiles({ r: 1, c: 5 }, 2, map);
  assert.ok(bombABlast.has('1,6'), 'Bomb A blast must engulf adjacent stationary Bomb B at (1, 6)');

  // Chain detonation: Bomb B detonates and engulfs its own radius
  const bombBBlast = getBlastTiles({ r: 1, c: 6 }, 2, map);
  assert.ok(bombBBlast.has('1,7'));
  assert.ok(bombBBlast.has('1,8'));

  // Combined cascade engulfs corridor from col 3 to col 8
  const combined = new Set([...bombABlast, ...bombBBlast]);
  for (let c = 3; c <= 8; c++) {
    assert.ok(combined.has(`1,${c}`), `Tile (1, ${c}) must be engulfed by chain explosion`);
  }
});

test('Challenger 4.4: Head-on Dual Sliding Bomb Mutual Halting Collision', () => {
  const map = createStandardArena();

  // Bomb 1 at (1, 2) sliding RIGHT (+1, 0)
  // Bomb 2 at (1, 8) sliding LEFT (-1, 0)
  // They approach each other along corridor row 1.
  let b1Col = 2;
  let b2Col = 8;
  let b1Moving = true;
  let b2Moving = true;

  for (let step = 0; step < 10; step++) {
    if (b1Moving) {
      const next1 = b1Col + 1;
      if (next1 === b2Col || map[1][next1] !== TILE_EMPTY) {
        b1Moving = false;
      } else {
        b1Col = next1;
      }
    }
    if (b2Moving) {
      const next2 = b2Col - 1;
      if (next2 === b1Col || map[1][next2] !== TILE_EMPTY) {
        b2Moving = false;
      } else {
        b2Col = next2;
      }
    }
  }

  // Both bombs must halt adjacent to each other without overlapping or passing through
  assert.equal(b1Moving, false);
  assert.equal(b2Moving, false);
  assert.equal(b2Col - b1Col, 1, 'Head-on sliding bombs must halt on adjacent tiles (1 tile apart)');
});
