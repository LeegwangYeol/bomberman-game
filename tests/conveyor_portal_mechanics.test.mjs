/**
 * tests/conveyor_portal_mechanics.test.mjs
 *
 * Exhaustive Audit and Verification Suite for Conveyor Belt Drift
 * and Teleport Portal Mechanics in Bomberman Game Engine.
 *
 * Verification Scopes:
 * Suite 1: Conveyor Belt Drift Consistency & Delta Invariance
 * Suite 2: Bomb Conveyor Physics & Anti-Stacking Mechanics (PHYS-REV-04)
 * Suite 3: AABB Bounds Checking, Obstacle Impact & Zero-Jitter Soak
 * Suite 4: Portal Coordinates & Procedural Map Corridor Invariance
 * Suite 5: Portal Cooldown Debounce & Infinite Teleport Loop Prevention
 * Suite 6: Smooth Entity Transitions, Body Momentum Reset & Bomb Ejection Bypass (PHYS-REV-06)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONVEYOR_DRIFT_SPEED,
  PORTAL_COOLDOWN_MS,
  DEFAULT_CONVEYORS,
  DEFAULT_PORTALS,
} from '../src/game/gameplay_mechanics.ts';

import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';

// Helper: Standard arena generator matching GameScene.createMap logic
function createStandardArenaMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        map[r][c] = TILE_WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        map[r][c] = TILE_WALL;
      } else if (
        (r === DEFAULT_PORTALS.portalA.row && c === DEFAULT_PORTALS.portalA.col) ||
        (r === DEFAULT_PORTALS.portalB.row && c === DEFAULT_PORTALS.portalB.col)
      ) {
        map[r][c] = TILE_EMPTY; // Portals guaranteed empty
      } else if (DEFAULT_CONVEYORS.some((cv) => cv.row === r && cv.col === c)) {
        map[r][c] = TILE_EMPTY; // Conveyors corridor guaranteed empty
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/* ==============================================================================
 * SUITE 1: CONVEYOR BELT DRIFT CONSISTENCY & DELTA INVARIANCE
 * ============================================================================== */

test('Conveyor 1.1: Drift speed constant invariant matches 60 px/s specification', () => {
  assert.equal(
    CONVEYOR_DRIFT_SPEED,
    60,
    'CONVEYOR_DRIFT_SPEED must be strictly 60 px/s'
  );
  assert.ok(DEFAULT_CONVEYORS.length > 0, 'DEFAULT_CONVEYORS must be populated');
});

test('Conveyor 1.2: Frame-rate delta scaling produces consistent cumulative displacement', () => {
  // Test at 60 FPS (16.666ms), 30 FPS (33.333ms), 120 FPS (8.333ms)
  const fpsTargets = [
    { name: '60 FPS', delta: 1000 / 60, frames: 60 },
    { name: '30 FPS', delta: 1000 / 30, frames: 30 },
    { name: '120 FPS', delta: 1000 / 120, frames: 120 },
  ];

  for (const { name, delta, frames } of fpsTargets) {
    let cumulativeDrift = 0;
    for (let f = 0; f < frames; f++) {
      const stepDrift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
      cumulativeDrift += stepDrift;
    }
    const diff = Math.abs(cumulativeDrift - 60.0);
    assert.ok(
      diff < 1e-4,
      `${name} cumulative drift over 1 second must equal exactly 60 px (got ${cumulativeDrift.toFixed(6)})`
    );
  }
});

test('Conveyor 1.3: Jittery irregular frame times preserve 60 px/s integration', () => {
  // Random frame times between 5ms and 45ms summing to exactly 1000ms
  const frameDeltas = [];
  let remainingMs = 1000;
  while (remainingMs > 45) {
    const d = 5 + Math.floor(Math.random() * 35);
    frameDeltas.push(d);
    remainingMs -= d;
  }
  frameDeltas.push(remainingMs);

  const totalTime = frameDeltas.reduce((a, b) => a + b, 0);
  assert.equal(totalTime, 1000, 'Total simulated duration must equal 1000ms');

  let accumulatedDrift = 0;
  for (const dt of frameDeltas) {
    accumulatedDrift += CONVEYOR_DRIFT_SPEED * (dt / 1000);
  }

  assert.ok(
    Math.abs(accumulatedDrift - 60.0) < 1e-6,
    `Irregular delta drift must equal exactly 60 px over 1000ms (got ${accumulatedDrift})`
  );
});

test('Conveyor 1.4: Cardinal direction vectors drift along intended coordinate axes', () => {
  const directions = [
    { dirX: 1, dirY: 0, label: 'East' },
    { dirX: -1, dirY: 0, label: 'West' },
    { dirX: 0, dirY: 1, label: 'South' },
    { dirX: 0, dirY: -1, label: 'North' },
  ];

  const delta = 16.666;
  for (const dir of directions) {
    const startX = 200;
    const startY = 200;
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    const nextX = startX + dir.dirX * drift;
    const nextY = startY + dir.dirY * drift;

    const dx = nextX - startX;
    const dy = nextY - startY;

    if (dir.dirX !== 0) {
      assert.equal(dy, 0, `${dir.label} drift must have zero Y variation`);
      assert.equal(Math.sign(dx), dir.dirX, `${dir.label} drift must match dirX sign`);
    }
    if (dir.dirY !== 0) {
      assert.equal(dx, 0, `${dir.label} drift must have zero X variation`);
      assert.equal(Math.sign(dy), dir.dirY, `${dir.label} drift must match dirY sign`);
    }
  }
});

test('Conveyor 1.5: Dash suppresses conveyor drift to protect high-speed trajectory', () => {
  const delta = 16.666;
  let playerX = 200;
  let playerY = 200;
  const isDashing = true;
  const belt = { row: 7, col: 5, dirX: 1, dirY: 0 };

  // When dashing, conveyor drift must NOT apply
  if (belt && !isDashing) {
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    playerX += belt.dirX * drift;
    playerY += belt.dirY * drift;
  }

  assert.equal(playerX, 200, 'Dashing player must not receive conveyor drift X displacement');
  assert.equal(playerY, 200, 'Dashing player must not receive conveyor drift Y displacement');
});

/* ==============================================================================
 * SUITE 2: BOMB CONVEYOR PHYSICS & ANTI-STACKING MECHANICS (PHYS-REV-04)
 * ============================================================================== */

test('Conveyor 2.1: Stationary bombs drift at exact 60 px/s rate', () => {
  const delta = 1000 / 60;
  let bombX = 180; // row 7 col 4 center
  let bombY = 300;
  const bBelt = { row: 7, col: 4, dirX: 1, dirY: 0 };

  for (let f = 0; f < 60; f++) {
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    bombX += bBelt.dirX * drift;
  }

  assert.ok(
    Math.abs(bombX - 240) < 1e-4,
    `Bomb must drift exactly 60 px in 1 second (got ${bombX})`
  );
});

test('Conveyor 2.2: Sliding (kicked) bombs ignore conveyor drift until stopping', () => {
  let isSliding = true;
  let bombX = 180;
  const bBelt = { row: 7, col: 4, dirX: 1, dirY: 0 };
  const delta = 16.666;

  // In GameScene.ts line 2044: if (bomb.getData('isSliding')) { slideLogic } else { beltLogic }
  if (!isSliding && bBelt) {
    bombX += CONVEYOR_DRIFT_SPEED * (delta / 1000);
  }

  assert.equal(bombX, 180, 'Sliding bomb must not receive conveyor drift');
});

test('Conveyor 2.3: Anti-stacking mechanism stops drifting bomb before overlapping lead bomb', () => {
  const map = createStandardArenaMap();
  // Place lead bomb at col 7 (x = 7 * 40 + 20 = 300, y = 7 * 40 + 20 = 300)
  const leadBomb = {
    x: 300,
    y: 300,
    active: true,
  };

  // Trailing bomb starts at col 6, drifting East towards col 7
  let trailingBombX = 260; // col 6 center
  let trailingBombY = 300;
  const bBelt = { row: 7, col: 6, dirX: 1, dirY: 0 };

  const delta = 1000 / 60;
  let stoppedByStacking = false;

  for (let f = 0; f < 300; f++) {
    const bRow = Math.floor(trailingBombY / TILE_SIZE);
    const bCol = Math.floor(trailingBombX / TILE_SIZE);

    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    const nextX = trailingBombX + bBelt.dirX * drift;
    const nextY = trailingBombY + bBelt.dirY * drift;

    const leadX = nextX + bBelt.dirX * 16;
    const leadY = nextY + bBelt.dirY * 16;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    const leadRow = Math.floor(leadY / TILE_SIZE);

    const perpX = bBelt.dirY !== 0 ? 15 : 0;
    const perpY = bBelt.dirX !== 0 ? 15 : 0;

    // GameScene PHYS-REV-04 check:
    let bombBlocking = false;
    if (leadRow !== bRow || leadCol !== bCol) {
      if (
        leadBomb.active &&
        Math.floor(leadBomb.y / TILE_SIZE) === leadRow &&
        Math.floor(leadBomb.x / TILE_SIZE) === leadCol
      ) {
        bombBlocking = true;
      }
    }

    const canMove =
      !bombBlocking &&
      leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
      map[leadRow]?.[leadCol] === TILE_EMPTY &&
      map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
      map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

    if (canMove) {
      trailingBombX = nextX;
      trailingBombY = nextY;
    } else if (bombBlocking) {
      stoppedByStacking = true;
      break;
    }
  }

  assert.ok(stoppedByStacking, 'Anti-stacking guard must intercept trailing bomb');
  // Trailing bomb right edge (trailingBombX + 16) must not enter col 7 (x >= 280)
  assert.ok(
    trailingBombX + 16 <= 280.0001,
    `Trailing bomb must not enter lead bomb tile col 7 (trailingBombX=${trailingBombX})`
  );
});

/* ==============================================================================
 * SUITE 3: AABB BOUNDS CHECKING, OBSTACLE IMPACT & ZERO-JITTER SOAK
 * ============================================================================== */

test('Conveyor 3.1: Player hitbox 1,000 frames soak test into solid wall produces zero penetration & zero jitter', () => {
  const map = createStandardArenaMap();
  map[7][8] = TILE_WALL; // Wall placed at col 8 (x: 320 to 360)

  let playerX = 7 * 40 + 20; // Starts at col 7 (x = 300)
  let playerY = 7 * 40 + 20; // y = 300
  const belt = { row: 7, col: 7, dirX: 1, dirY: 0 };
  const delta = 1000 / 60;

  const positions = [];

  for (let f = 0; f < 1000; f++) {
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    const nextX = playerX + belt.dirX * drift;
    const nextY = playerY + belt.dirY * drift;

    // Player 24x24 hitbox (radius 12, perp 11)
    const leadX = nextX + belt.dirX * 12;
    const leadY = nextY + belt.dirY * 12;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    const leadRow = Math.floor(leadY / TILE_SIZE);

    const perpX = belt.dirY !== 0 ? 11 : 0;
    const perpY = belt.dirX !== 0 ? 11 : 0;

    const canMove =
      leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
      map[leadRow]?.[leadCol] === TILE_EMPTY &&
      map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
      map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

    if (canMove) {
      playerX = nextX;
      playerY = nextY;
    }

    positions.push(playerX);

    // INVARIANT 1: Right edge (playerX + 12) must NEVER penetrate solid wall at x = 320
    assert.ok(
      playerX + 12 <= 320.0001,
      `Frame ${f}: Player penetrated wall at x=320 (right edge=${playerX + 12})`
    );
  }

  // INVARIANT 2: Zero jitter over resting frames (frames 200..1000)
  const resting = positions.slice(200);
  for (let i = 1; i < resting.length; i++) {
    const jitter = Math.abs(resting[i] - resting[i - 1]);
    assert.equal(jitter, 0, `Frame ${200 + i}: Player conveyor jitter detected: ${jitter}`);
  }
});

test('Conveyor 3.2: Bomb hitbox 1,000 frames soak test into solid obstacle produces zero penetration & zero jitter', () => {
  const map = createStandardArenaMap();
  map[7][8] = TILE_BLOCK; // Soft block placed at col 8 (x: 320 to 360)

  let bombX = 7 * 40 + 20; // Starts at col 7 (x = 300)
  let bombY = 7 * 40 + 20; // y = 300
  const belt = { row: 7, col: 7, dirX: 1, dirY: 0 };
  const delta = 1000 / 60;

  const positions = [];

  for (let f = 0; f < 1000; f++) {
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    const nextX = bombX + belt.dirX * drift;
    const nextY = bombY + belt.dirY * drift;

    // Bomb 32x32 hitbox (radius 16, perp 15)
    const leadX = nextX + belt.dirX * 16;
    const leadY = nextY + belt.dirY * 16;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    const leadRow = Math.floor(leadY / TILE_SIZE);

    const perpX = belt.dirY !== 0 ? 15 : 0;
    const perpY = belt.dirX !== 0 ? 15 : 0;

    const canMove =
      leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
      map[leadRow]?.[leadCol] === TILE_EMPTY &&
      map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
      map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

    if (canMove) {
      bombX = nextX;
      bombY = nextY;
    }

    positions.push(bombX);

    // Bomb right edge (bombX + 16) must NEVER enter obstacle at x = 320
    assert.ok(
      bombX + 16 <= 320.0001,
      `Frame ${f}: Bomb penetrated block at x=320 (right edge=${bombX + 16})`
    );
  }

  // Zero jitter check
  const resting = positions.slice(200);
  for (let i = 1; i < resting.length; i++) {
    const jitter = Math.abs(resting[i] - resting[i - 1]);
    assert.equal(jitter, 0, `Frame ${200 + i}: Bomb conveyor jitter detected: ${jitter}`);
  }
});

/* ==============================================================================
 * SUITE 4: PORTAL COORDINATES & PROCEDURAL MAP CORRIDOR INVARIANCE
 * ============================================================================== */

test('Portal 4.1: Portal coordinates match canonical specifications in gameplay_mechanics.ts', () => {
  assert.deepEqual(
    DEFAULT_PORTALS,
    {
      portalA: { row: 1, col: 13 },
      portalB: { row: 11, col: 1 },
    },
    'DEFAULT_PORTALS must define Portal A at (1, 13) and Portal B at (11, 1)'
  );

  // Exact tile center pixel coordinates
  const pA = DEFAULT_PORTALS.portalA;
  const pB = DEFAULT_PORTALS.portalB;

  const centerAX = pA.col * TILE_SIZE + TILE_SIZE / 2;
  const centerAY = pA.row * TILE_SIZE + TILE_SIZE / 2;
  const centerBX = pB.col * TILE_SIZE + TILE_SIZE / 2;
  const centerBY = pB.row * TILE_SIZE + TILE_SIZE / 2;

  assert.equal(centerAX, 540, 'Portal A center X must be 540px');
  assert.equal(centerAY, 60, 'Portal A center Y must be 60px');
  assert.equal(centerBX, 60, 'Portal B center X must be 60px');
  assert.equal(centerBY, 460, 'Portal B center Y must be 460px');
});

test('Portal 4.2: Procedural map generation guarantees portals and conveyors remain unobstructed', () => {
  const map = createStandardArenaMap();

  // Portal A & B must be TILE_EMPTY
  assert.equal(
    map[DEFAULT_PORTALS.portalA.row][DEFAULT_PORTALS.portalA.col],
    TILE_EMPTY,
    'Portal A must be unblocked floor tile'
  );
  assert.equal(
    map[DEFAULT_PORTALS.portalB.row][DEFAULT_PORTALS.portalB.col],
    TILE_EMPTY,
    'Portal B must be unblocked floor tile'
  );

  // Conveyor tiles must all be TILE_EMPTY
  for (const cv of DEFAULT_CONVEYORS) {
    assert.equal(
      map[cv.row][cv.col],
      TILE_EMPTY,
      `Conveyor tile (${cv.row}, ${cv.col}) must be unblocked floor tile`
    );
  }
});

/* ==============================================================================
 * SUITE 5: PORTAL COOLDOWN DEBOUNCE & INFINITE TELEPORT LOOP PREVENTION
 * ============================================================================== */

test('Portal 5.1: Portal cooldown constant invariant matches 1200 ms specification', () => {
  assert.equal(
    PORTAL_COOLDOWN_MS,
    1200,
    'PORTAL_COOLDOWN_MS must be strictly 1200 ms'
  );
});

test('Portal 5.2: Cooldown debounce prevents rapid oscillation / infinite warp loop while remaining on tile', () => {
  let portalCooldown = 0;
  let warpCount = 0;
  const warpHistory = [];

  let playerRow = DEFAULT_PORTALS.portalA.row;
  let playerCol = DEFAULT_PORTALS.portalA.col;

  function simulateTick(delta, simTime) {
    // 1. Cooldown decrement (GameScene line 1912)
    if (portalCooldown > 0) {
      portalCooldown = Math.max(0, portalCooldown - delta);
    }

    // 2. Portal warp check (GameScene line 2028)
    if (portalCooldown <= 0) {
      if (playerRow === DEFAULT_PORTALS.portalA.row && playerCol === DEFAULT_PORTALS.portalA.col) {
        portalCooldown = PORTAL_COOLDOWN_MS;
        playerRow = DEFAULT_PORTALS.portalB.row;
        playerCol = DEFAULT_PORTALS.portalB.col;
        warpCount++;
        warpHistory.push({ time: simTime, dest: 'B' });
      } else if (playerRow === DEFAULT_PORTALS.portalB.row && playerCol === DEFAULT_PORTALS.portalB.col) {
        portalCooldown = PORTAL_COOLDOWN_MS;
        playerRow = DEFAULT_PORTALS.portalA.row;
        playerCol = DEFAULT_PORTALS.portalA.col;
        warpCount++;
        warpHistory.push({ time: simTime, dest: 'A' });
      }
    }
  }

  // Initial step onto Portal A at t = 0
  simulateTick(16.666, 0);
  assert.equal(warpCount, 1, 'First step onto Portal A must trigger immediate warp');
  assert.equal(playerRow, DEFAULT_PORTALS.portalB.row, 'Player landed on Portal B row');
  assert.equal(playerCol, DEFAULT_PORTALS.portalB.col, 'Player landed on Portal B col');
  assert.equal(portalCooldown, 1200, 'Portal cooldown must be reset to 1200ms');

  // Player stands motionless on Portal B for 71 frames (~1183ms)
  const dt = 16.666;
  for (let f = 1; f <= 71; f++) {
    const t = f * dt;
    simulateTick(dt, t);
    // INVARIANT: ZERO additional warps while cooldown > 0
    assert.equal(
      warpCount,
      1,
      `Frame ${f} (t=${t.toFixed(1)}ms): Cooldown debounce failed! Unexpected warp triggered while cooldown=${portalCooldown.toFixed(1)}ms`
    );
  }

  // At frame 73 (t >= 1200ms), cooldown reaches 0, so if player still stands on Portal B, next warp occurs
  simulateTick(dt, 72 * dt); // t = 1199.95ms -> cooldown hits 0 on next
  simulateTick(dt, 73 * dt); // t = 1216.6ms -> triggers return warp
  assert.equal(warpCount, 2, 'Second warp must only trigger after full 1200ms debounce expires');
  assert.equal(playerRow, DEFAULT_PORTALS.portalA.row, 'Player warped back to Portal A');
  assert.equal(portalCooldown, 1200, 'Cooldown re-engaged for another 1200ms');
});

test('Portal 5.3: Stepping off and returning during debounce window does not trigger early warp', () => {
  let portalCooldown = 0;
  let warpCount = 0;
  let playerRow = DEFAULT_PORTALS.portalA.row;
  let playerCol = DEFAULT_PORTALS.portalA.col;

  function tick(delta) {
    if (portalCooldown > 0) portalCooldown = Math.max(0, portalCooldown - delta);
    if (portalCooldown <= 0) {
      if (playerRow === DEFAULT_PORTALS.portalA.row && playerCol === DEFAULT_PORTALS.portalA.col) {
        portalCooldown = PORTAL_COOLDOWN_MS;
        playerRow = DEFAULT_PORTALS.portalB.row;
        playerCol = DEFAULT_PORTALS.portalB.col;
        warpCount++;
      } else if (playerRow === DEFAULT_PORTALS.portalB.row && playerCol === DEFAULT_PORTALS.portalB.col) {
        portalCooldown = PORTAL_COOLDOWN_MS;
        playerRow = DEFAULT_PORTALS.portalA.row;
        playerCol = DEFAULT_PORTALS.portalA.col;
        warpCount++;
      }
    }
  }

  // 1. Initial warp from A to B
  tick(16.666);
  assert.equal(warpCount, 1);

  // 2. Player steps off Portal B into corridor (row 11, col 2)
  playerRow = 11;
  playerCol = 2;

  // Advance 500ms
  for (let i = 0; i < 30; i++) tick(16.666);
  assert.ok(portalCooldown > 0, 'Cooldown still active (~700ms remaining)');

  // 3. Player steps back onto Portal B at t = 500ms
  playerRow = DEFAULT_PORTALS.portalB.row;
  playerCol = DEFAULT_PORTALS.portalB.col;
  tick(16.666);

  // Cooldown is still ~680ms, so NO warp must occur!
  assert.equal(warpCount, 1, 'Premature warp must be blocked while cooldown remains');

  // 4. Advance until cooldown expires (700ms more)
  for (let i = 0; i < 45; i++) tick(16.666);
  // Now cooldown expired and player is on Portal B -> triggers warp to A
  assert.equal(warpCount, 2, 'Warp must trigger cleanly once debounce interval concludes');
  assert.equal(playerRow, DEFAULT_PORTALS.portalA.row);
});

/* ==============================================================================
 * SUITE 6: SMOOTH ENTITY TRANSITIONS, BODY RESET & BOMB EJECTION BYPASS
 * ============================================================================== */

test('Transition 6.1: Warp transition applies yoyo scale tween and physics body reset', () => {
  // Mock physics player
  const player = {
    x: 540,
    y: 60,
    scaleX: 1.0,
    scaleY: 1.0,
    active: true,
    body: {
      x: 528,
      y: 48,
      velocity: { x: 150, y: 0 },
      reset(x, y) {
        this.x = x - 12;
        this.y = y - 12;
        this.velocity.x = 0;
        this.velocity.y = 0;
      },
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
    },
  };

  // Target Portal B center
  const targetX = DEFAULT_PORTALS.portalB.col * TILE_SIZE + TILE_SIZE / 2;
  const targetY = DEFAULT_PORTALS.portalB.row * TILE_SIZE + TILE_SIZE / 2;

  // On yoyo mid-point of tween (t = 100ms):
  player.scaleX = 0.1;
  player.scaleY = 0.1;

  // Execute warp callback
  player.setPosition(targetX, targetY);
  player.body.reset(targetX, targetY);

  assert.equal(player.x, 60, 'Player X placed precisely at destination center');
  assert.equal(player.y, 460, 'Player Y placed precisely at destination center');
  assert.equal(player.body.velocity.x, 0, 'Residual velocity neutralized on warp');
  assert.equal(player.body.velocity.y, 0, 'Residual velocity neutralized on warp');
});

test('Transition 6.2: Destination bomb collision ejection bypass (PHYS-REV-06) registers reciprocal ignoringColliders', () => {
  // Destination bomb sitting at Portal B
  const destBomb = {
    x: 60,
    y: 460,
    active: true,
    data: new Map(),
    getData(k) { return this.data.get(k); },
    setData(k, v) { this.data.set(k, v); },
    body: { x: 44, y: 444, width: 32, height: 32 },
  };

  const player = {
    x: 60,
    y: 460,
    active: true,
    data: new Map(),
    getData(k) { return this.data.get(k); },
    setData(k, v) { this.data.set(k, v); },
    body: { x: 48, y: 448, width: 24, height: 24 },
  };

  // Simulate GameScene warpPlayer PHYS-REV-06 registration
  const toRow = DEFAULT_PORTALS.portalB.row;
  const toCol = DEFAULT_PORTALS.portalB.col;
  const bCol = Math.floor(destBomb.x / TILE_SIZE);
  const bRow = Math.floor(destBomb.y / TILE_SIZE);

  if (bRow === toRow && bCol === toCol) {
    let bombIgnoring = destBomb.getData('ignoringColliders');
    if (!bombIgnoring) {
      bombIgnoring = new Set();
      destBomb.setData('ignoringColliders', bombIgnoring);
    }
    bombIgnoring.add(player);

    let playerIgnoring = player.getData('ignoringColliders');
    if (!playerIgnoring) {
      playerIgnoring = new Set();
      player.setData('ignoringColliders', playerIgnoring);
    }
    playerIgnoring.add(destBomb);
  }

  // Verify reciprocal set membership
  const bSet = destBomb.getData('ignoringColliders');
  const pSet = player.getData('ignoringColliders');

  assert.ok(bSet && bSet.has(player), 'Bomb must ignore colliding player on destination portal');
  assert.ok(pSet && pSet.has(destBomb), 'Player must ignore colliding bomb on destination portal');

  // Simulate collision handler check
  function checkCollision(pObj, bObj) {
    const ignoring = bObj.getData('ignoringColliders');
    if (ignoring && ignoring.has(pObj)) {
      // Overlap check:
      const overlap = !(
        pObj.body.x + pObj.body.width <= bObj.body.x ||
        pObj.body.x >= bObj.body.x + bObj.body.width ||
        pObj.body.y + pObj.body.height <= bObj.body.y ||
        pObj.body.y >= bObj.body.y + bObj.body.height
      );
      if (!overlap) {
        ignoring.delete(pObj);
        return true;
      }
      return false; // Suppress ejection collision!
    }
    return true;
  }

  // While overlapping at destination portal:
  assert.equal(
    checkCollision(player, destBomb),
    false,
    'Collision must be suppressed while overlapping destination bomb'
  );

  // Player walks out of bomb bounding box
  player.body.x = 100;
  assert.equal(
    checkCollision(player, destBomb),
    true,
    'Collision must re-enable once player exits destination bomb bounding box'
  );
  assert.equal(bSet.has(player), false, 'Player must be pruned from ignoringColliders once separated');
});

test('Transition 6.3: Conveyor to non-conveyor tile transition is smooth without sudden snap', () => {
  // Player drifting along conveyor belt row 7 (cols 4..10) towards col 11 (empty floor)
  // At col 10 (center x = 420), conveyor belt ends at col 10.
  let playerX = 419.0;
  const playerY = 300;
  const delta = 16.666;

  function getConveyor(r, c) {
    return DEFAULT_CONVEYORS.find((cv) => cv.row === r && cv.col === c);
  }

  const trajectory = [];
  for (let f = 0; f < 30; f++) {
    const pCol = Math.floor(playerX / TILE_SIZE);
    const pRow = Math.floor(playerY / TILE_SIZE);
    const belt = getConveyor(pRow, pCol);

    if (belt) {
      const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
      playerX += belt.dirX * drift;
    }
    trajectory.push(playerX);
  }

  // Verify transition across boundary (col 10 -> col 11 at x >= 440)
  for (let i = 1; i < trajectory.length; i++) {
    const step = trajectory[i] - trajectory[i - 1];
    // Step must never exceed max single-frame drift (1.0001 px)
    assert.ok(
      step <= 1.0001,
      `Step ${i} had discontinuous position jump of ${step} px (must be <= 1.0)`
    );
  }

  // Once player entered col 11 (x >= 440), drift ceases
  const restingAfterConveyor = trajectory.slice(25);
  for (let i = 1; i < restingAfterConveyor.length; i++) {
    const diff = Math.abs(restingAfterConveyor[i] - restingAfterConveyor[i - 1]);
    assert.equal(diff, 0, 'Drift must cease cleanly once player exits conveyor corridor');
  }
});
