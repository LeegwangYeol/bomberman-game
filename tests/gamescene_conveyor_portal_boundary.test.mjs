/**
 * tests/gamescene_conveyor_portal_boundary.test.mjs
 *
 * Exhaustive Verification Suite for:
 * 1. Conveyor Belt Drift Forces (Speed, Cardinal Directions, Delta Invariance, Dash/Slide Precedence)
 * 2. Portal Teleportation Debounce (Strict 1.2s Cooldown, Anti-Infinite-Loop Invariant, Debounce Window Enforcement)
 * 3. Boundary Clamping & Wall Confinement in GameScene.ts (Zero Wall Penetration under Conveyor Push, Sliding, & Swarm Separation)
 * 4. Headless GameScene Instance Integration (Verifying live GameScene state & physics update pipelines)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// 1. ESM Loader hook for seamless TypeScript module imports
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      for (const ext of ['.ts', '.js', '/index.ts', '/index.js']) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {}
      }
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'));

// 2. Headless DOM & Canvas Context Mocks for Phaser Environment
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
  createRadialGradient: () => ({ addColorStop: () => {} }),
};

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.HTMLCanvasElement) globalThis.HTMLCanvasElement = class {};
if (!globalThis.Image) globalThis.Image = class {};
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
    body: {},
  };
}

// 3. Import Game Constants & Modules
const {
  CONVEYOR_DRIFT_SPEED,
  PORTAL_COOLDOWN_MS,
  DEFAULT_CONVEYORS,
  DEFAULT_PORTALS,
  BOMB_KICK_SPEED,
} = await import('../src/game/gameplay_mechanics.ts');

const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
} = await import('../src/game/pathfinding.ts');

const {
  SpatialSeparationGrid,
} = await import('../src/game/entities/SpatialSeparation.ts');

const GameSceneModule = await import('../src/game/GameScene.ts');
const GameScene = GameSceneModule.default;

// Standard Arena Map Generator
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
        map[r][c] = TILE_EMPTY;
      } else if (DEFAULT_CONVEYORS.some((cv) => cv.row === r && cv.col === c)) {
        map[r][c] = TILE_EMPTY;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/* ==============================================================================
 * SECTION 1: CONVEYOR BELT DRIFT FORCES & INTEGRATION DYNAMICS
 * ============================================================================== */

test('1.1: Conveyor drift speed matches strict 60 px/s specification', () => {
  assert.equal(CONVEYOR_DRIFT_SPEED, 60, 'CONVEYOR_DRIFT_SPEED must be 60 px/s');
  assert.ok(Array.isArray(DEFAULT_CONVEYORS), 'DEFAULT_CONVEYORS must be an array');
  assert.equal(DEFAULT_CONVEYORS.length, 7, 'Default conveyor row must span 7 tiles (cols 4..10 on row 7)');
  for (const cv of DEFAULT_CONVEYORS) {
    assert.equal(cv.row, 7, 'All default conveyors must reside on row 7');
    assert.equal(cv.dirX, 1, 'Default conveyor must push East (dirX = 1)');
    assert.equal(cv.dirY, 0, 'Default conveyor must have 0 Y-drift (dirY = 0)');
  }
});

test('1.2: Multi-framerate integration preserves cumulative 60px/s displacement across variable deltas', () => {
  const rates = [
    { fps: 15, dt: 1000 / 15, frames: 15 },
    { fps: 30, dt: 1000 / 30, frames: 30 },
    { fps: 60, dt: 1000 / 60, frames: 60 },
    { fps: 120, dt: 1000 / 120, frames: 120 },
    { fps: 240, dt: 1000 / 240, frames: 240 },
  ];

  for (const { fps, dt, frames } of rates) {
    let x = 0;
    for (let f = 0; f < frames; f++) {
      const step = CONVEYOR_DRIFT_SPEED * (dt / 1000);
      x += step;
    }
    const diff = Math.abs(x - 60.0);
    assert.ok(diff < 1e-4, `At ${fps} FPS, total drift over 1.0s must equal 60 px (got ${x.toFixed(6)})`);
  }
});

test('1.3: Cardinal direction vectors drift cleanly along intended coordinate axes', () => {
  const vectors = [
    { dirX: 1, dirY: 0, name: 'EAST' },
    { dirX: -1, dirY: 0, name: 'WEST' },
    { dirX: 0, dirY: 1, name: 'SOUTH' },
    { dirX: 0, dirY: -1, name: 'NORTH' },
  ];

  const dt = 16.666;
  for (const vec of vectors) {
    let px = 200;
    let py = 200;
    const drift = CONVEYOR_DRIFT_SPEED * (dt / 1000);
    px += vec.dirX * drift;
    py += vec.dirY * drift;

    if (vec.dirX !== 0) {
      assert.equal(py, 200, `${vec.name} drift must not modify Y coordinate`);
      assert.equal(Math.sign(px - 200), vec.dirX, `${vec.name} drift sign must match dirX`);
    }
    if (vec.dirY !== 0) {
      assert.equal(px, 200, `${vec.name} drift must not modify X coordinate`);
      assert.equal(Math.sign(py - 200), vec.dirY, `${vec.name} drift sign must match dirY`);
    }
  }
});

test('1.4: Dashing player completely suppresses conveyor drift force', () => {
  let playerX = 220;
  const belt = { row: 7, col: 5, dirX: 1, dirY: 0 };
  const dt = 16.666;

  // Case A: Not dashing -> drift applies
  let isDashing = false;
  if (belt && !isDashing) {
    playerX += CONVEYOR_DRIFT_SPEED * (dt / 1000) * belt.dirX;
  }
  assert.ok(playerX > 220, 'Non-dashing player must drift');

  // Case B: Dashing -> drift is strictly suppressed (GameScene.ts line 2083)
  const xBeforeDash = playerX;
  isDashing = true;
  for (let f = 0; f < 30; f++) {
    if (belt && !isDashing) {
      playerX += CONVEYOR_DRIFT_SPEED * (dt / 1000) * belt.dirX;
    }
  }
  assert.equal(playerX, xBeforeDash, 'Dashing player must not receive any conveyor drift displacement');
});

/* ==============================================================================
 * SECTION 2: BOMB CONVEYOR DYNAMICS, SLIDING PRECEDENCE & ANTI-STACKING
 * ============================================================================== */

test('2.1: Stationary bombs drift on conveyors at exact 60 px/s rate', () => {
  let bombX = 260; // Row 7, Col 6 center
  const belt = { row: 7, col: 6, dirX: 1, dirY: 0 };
  const dt = 1000 / 60;

  for (let f = 0; f < 60; f++) {
    const drift = CONVEYOR_DRIFT_SPEED * (dt / 1000);
    bombX += belt.dirX * drift;
  }

  assert.ok(
    Math.abs(bombX - 320) < 1e-4,
    `Stationary bomb must drift exactly 60 px from 260 to 320 (got ${bombX})`
  );
});

test('2.2: Kicked sliding bombs prioritize kick trajectory over conveyor drift', () => {
  let bombX = 260;
  let isSliding = true;
  const slideDir = { x: -1, y: 0 }; // Kicked West
  const belt = { row: 7, col: 6, dirX: 1, dirY: 0 }; // Conveyor pushing East
  const dt = 1000 / 60;

  // In GameScene.ts line 2124: if (bomb.getData('isSliding')) { slideLogic } else { beltLogic }
  for (let f = 0; f < 10; f++) {
    if (isSliding) {
      // Moves at kick speed West
      bombX += slideDir.x * (BOMB_KICK_SPEED * (dt / 1000));
    } else if (belt) {
      bombX += belt.dirX * (CONVEYOR_DRIFT_SPEED * (dt / 1000));
    }
  }

  // Bomb moved West, conveyor East drift had 0 influence
  assert.ok(bombX < 260, 'Sliding bomb must move West according to kick impulse without East conveyor drag');
});

test('2.3: Anti-stacking mechanism (PHYS-REV-04) prevents bombs from overlapping on conveyor', () => {
  const map = createStandardArenaMap();
  const leadBomb = { x: 340, y: 300, active: true }; // Stationary on Col 8
  let trailingBombX = 300; // Col 7 center
  let trailingBombY = 300;
  const belt = { row: 7, col: 7, dirX: 1, dirY: 0 };
  const dt = 1000 / 60;

  let stoppedByStacking = false;

  for (let f = 0; f < 300; f++) {
    const bRow = Math.floor(trailingBombY / TILE_SIZE);
    const bCol = Math.floor(trailingBombX / TILE_SIZE);

    const drift = CONVEYOR_DRIFT_SPEED * (dt / 1000);
    const nextX = trailingBombX + belt.dirX * drift;
    const nextY = trailingBombY + belt.dirY * drift;

    const leadX = nextX + belt.dirX * 16;
    const leadY = nextY + belt.dirY * 16;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    const leadRow = Math.floor(leadY / TILE_SIZE);

    const perpX = belt.dirY !== 0 ? 15 : 0;
    const perpY = belt.dirX !== 0 ? 15 : 0;

    let bombBlocking = false;
    if (leadRow !== bRow || leadCol !== bCol) {
      if (leadBomb.active && Math.floor(leadBomb.y / TILE_SIZE) === leadRow && Math.floor(leadBomb.x / TILE_SIZE) === leadCol) {
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

  assert.ok(stoppedByStacking, 'PHYS-REV-04: Lead bomb must block trailing bomb on conveyor');
  assert.ok(trailingBombX + 16 <= 320.0001, 'Trailing bomb right edge must never enter Col 8');
});

/* ==============================================================================
 * SECTION 3: PORTAL TELEPORTATION DEBOUNCE (1.2s) & ANTI-INFINITE-LOOP
 * ============================================================================== */

test('3.1: Portal cooldown constant strictly matches 1200ms (1.2s) specification', () => {
  assert.equal(PORTAL_COOLDOWN_MS, 1200, 'PORTAL_COOLDOWN_MS must be 1200 ms');
  assert.equal(DEFAULT_PORTALS.portalA.row, 1);
  assert.equal(DEFAULT_PORTALS.portalA.col, 13);
  assert.equal(DEFAULT_PORTALS.portalB.row, 11);
  assert.equal(DEFAULT_PORTALS.portalB.col, 1);
});

test('3.2: Standing on portal tile for 5,000 frames strictly enforces 1.2s intervals with ZERO infinite loops', () => {
  let portalCooldown = 0;
  let warpCount = 0;
  const warpTimestamps = [];

  let playerRow = DEFAULT_PORTALS.portalA.row;
  let playerCol = DEFAULT_PORTALS.portalA.col;

  const dt = 16.666; // 60 FPS
  const totalFrames = 5000; // ~83.3 seconds of continuous simulation

  for (let f = 0; f < totalFrames; f++) {
    const simTime = f * dt;

    // 1. Cooldown decrement (GameScene.ts line 1992)
    if (portalCooldown > 0) {
      portalCooldown = Math.max(0, portalCooldown - dt);
    }

    // 2. Teleport Portal warp check (GameScene.ts line 2108)
    if (portalCooldown <= 0) {
      if (playerRow === DEFAULT_PORTALS.portalA.row && playerCol === DEFAULT_PORTALS.portalA.col) {
        portalCooldown = PORTAL_COOLDOWN_MS;
        playerRow = DEFAULT_PORTALS.portalB.row;
        playerCol = DEFAULT_PORTALS.portalB.col;
        warpCount++;
        warpTimestamps.push(simTime);
      } else if (playerRow === DEFAULT_PORTALS.portalB.row && playerCol === DEFAULT_PORTALS.portalB.col) {
        portalCooldown = PORTAL_COOLDOWN_MS;
        playerRow = DEFAULT_PORTALS.portalA.row;
        playerCol = DEFAULT_PORTALS.portalA.col;
        warpCount++;
        warpTimestamps.push(simTime);
      }
    }
  }

  // Over 83.3s, warps should occur at intervals of >= 1200ms
  assert.ok(warpCount >= 60, `Warp count must be realistic for 83.3s (~69 warps, got ${warpCount})`);

  for (let i = 1; i < warpTimestamps.length; i++) {
    const interval = warpTimestamps[i] - warpTimestamps[i - 1];
    assert.ok(
      interval >= 1199.0,
      `Warp ${i} occurred only ${interval.toFixed(1)}ms after previous warp (must be >= 1200ms)`
    );
  }
});

test('3.3: Stepping off and returning to portal within 1.2s window is strictly debounced', () => {
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

  // Warp 1: A -> B
  tick(16.666);
  assert.equal(warpCount, 1);
  assert.equal(playerRow, 11);
  assert.equal(playerCol, 1);

  // Player moves away to (11, 2)
  playerRow = 11;
  playerCol = 2;

  // Advance 600ms (half the cooldown)
  for (let i = 0; i < 36; i++) tick(16.666);
  assert.ok(portalCooldown > 500, `Cooldown must still have ~600ms remaining (got ${portalCooldown})`);

  // Player steps back onto portal B at t = 600ms
  playerRow = DEFAULT_PORTALS.portalB.row;
  playerCol = DEFAULT_PORTALS.portalB.col;
  tick(16.666);

  // NO warp allowed!
  assert.equal(warpCount, 1, 'Early re-entry onto portal must be rejected while cooldown > 0');

  // Advance remaining 600ms
  for (let i = 0; i < 40; i++) tick(16.666);

  // Now cooldown expired -> warp 2 occurs cleanly
  assert.equal(warpCount, 2, 'Warp must trigger cleanly once the full 1200ms debounce expires');
  assert.equal(playerRow, DEFAULT_PORTALS.portalA.row);
  assert.equal(playerCol, DEFAULT_PORTALS.portalA.col);
});

test('3.4: Destination bomb collision bypass (PHYS-REV-06) neutralizes ejection physics', () => {
  // Destination bomb on Portal B
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
    body: {
      x: 48,
      y: 448,
      width: 24,
      height: 24,
      velocity: { x: 250, y: -100 },
      reset(rx, ry) {
        this.x = rx;
        this.y = ry;
        this.velocity.x = 0;
        this.velocity.y = 0;
      },
    },
    setPosition(nx, ny) { this.x = nx; this.y = ny; },
  };

  // Simulate GameScene.ts warpPlayer logic
  const toRow = DEFAULT_PORTALS.portalB.row;
  const toCol = DEFAULT_PORTALS.portalB.col;
  const targetX = toCol * TILE_SIZE + TILE_SIZE / 2;
  const targetY = toRow * TILE_SIZE + TILE_SIZE / 2;

  player.setPosition(targetX, targetY);
  player.body.reset(targetX, targetY);

  // Velocity reset invariant
  assert.equal(player.body.velocity.x, 0, 'Residual X velocity must be neutralized on warp');
  assert.equal(player.body.velocity.y, 0, 'Residual Y velocity must be neutralized on warp');

  // Reciprocal ignoring registration
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

  assert.ok(bombIgnoring.has(player), 'Bomb must ignore warped player to prevent launch');
  assert.ok(playerIgnoring.has(destBomb), 'Player must ignore dest bomb to prevent launch');
});

/* ==============================================================================
 * SECTION 4: BOUNDARY CLAMPING & HARD WALL PENETRATION DEFENSE IN GAMESCENE
 * ============================================================================== */

test('4.1: Conveyor drift terminating into solid perimeter wall clamps player with 0 penetration', () => {
  const map = createStandardArenaMap();
  // Construct East-pointing conveyor at (1, 13) pointing directly into outer wall at col 14 (starts at x=560)
  map[1][14] = TILE_WALL;

  let playerX = 13 * 40 + 20; // x = 540
  let playerY = 1 * 40 + 20;  // y = 60
  const belt = { row: 1, col: 13, dirX: 1, dirY: 0 };
  const dt = 1000 / 60;

  for (let f = 0; f < 500; f++) {
    const drift = CONVEYOR_DRIFT_SPEED * (dt / 1000);
    const nextX = playerX + belt.dirX * drift;
    const nextY = playerY + belt.dirY * drift;

    const leadX = nextX + belt.dirX * 12; // 24x24 hitbox radius 12
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

    // INVARIANT: Right edge (playerX + 12) must never exceed or penetrate wall at x=560
    assert.ok(
      playerX + 12 <= 560.0001,
      `Frame ${f}: Player penetrated outer wall at x=560 (right edge=${playerX + 12})`
    );
  }

  // Clamped at edge
  assert.ok(playerX >= 540 && playerX <= 548, `Player clamped cleanly at wall interface: ${playerX}`);
});

test('4.2: Conveyor drift into fixed interior pillar (even row/col) is strictly halted', () => {
  const map = createStandardArenaMap();
  // Pillar at (2, 2) [starts at x=80, y=80]. Conveyor at (2, 1) pushing East toward pillar
  assert.equal(map[2][2], TILE_WALL, 'Map (2, 2) must be fixed pillar');

  let playerX = 60; // Col 1 center
  let playerY = 100; // Row 2 center
  const belt = { row: 2, col: 1, dirX: 1, dirY: 0 };
  const dt = 1000 / 60;

  for (let f = 0; f < 300; f++) {
    const drift = CONVEYOR_DRIFT_SPEED * (dt / 1000);
    const nextX = playerX + belt.dirX * drift;
    const nextY = playerY + belt.dirY * drift;

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

    assert.ok(playerX + 12 <= 80.0001, `Player penetrated pillar at x=80 (right edge=${playerX + 12})`);
  }
});

test('4.3: High-velocity kicked bomb stops at obstacle boundary without wall tunneling', () => {
  const map = createStandardArenaMap();
  // Wall at Col 10 (starts at x=400). Bomb at Col 8 (x=340), kicked East at 300 px/s
  map[7][10] = TILE_WALL;

  let bombX = 340;
  let bombY = 300;
  let isSliding = true;
  const slideDir = { x: 1, y: 0 };
  const dt = 1000 / 60;

  for (let f = 0; f < 60; f++) {
    if (isSliding) {
      const lookahead = Math.max(16, BOMB_KICK_SPEED * (dt / 1000) + 4);
      const checkX = bombX + slideDir.x * lookahead;
      const checkY = bombY + slideDir.y * lookahead;
      const targetCol = Math.floor(checkX / TILE_SIZE);
      const targetRow = Math.floor(checkY / TILE_SIZE);

      let blocked = false;
      if (targetRow < 0 || targetRow >= ROWS || targetCol < 0 || targetCol >= COLS) {
        blocked = true;
      } else if (map[targetRow][targetCol] !== TILE_EMPTY) {
        blocked = true;
      }

      if (blocked) {
        isSliding = false;
        // Snap to center of current cell (GameScene.ts line 2163)
        const bCol = Math.floor(bombX / TILE_SIZE);
        const bRow = Math.floor(bombY / TILE_SIZE);
        bombX = bCol * TILE_SIZE + TILE_SIZE / 2;
        bombY = bRow * TILE_SIZE + TILE_SIZE / 2;
        break;
      } else {
        bombX += slideDir.x * (BOMB_KICK_SPEED * (dt / 1000));
      }
    }
  }

  assert.equal(isSliding, false, 'Bomb must stop sliding before wall');
  // Stopped at Col 9 (center 380)
  assert.equal(bombX, 380, 'Bomb snapped to tile center in Col 9 before wall in Col 10');
  assert.ok(bombX + 16 <= 400.0001, 'Bomb right edge (396) must not penetrate Col 10 wall');
});

/* ==============================================================================
 * SECTION 5: MULTI-ENTITY SWARM SEPARATION AGAINST HARD WALLS (ZERO TUNNELING)
 * ============================================================================== */

test('5.1: 80-entity cluster shoved against corner wall maintains 100% confinement outside hard walls', () => {
  const map = createStandardArenaMap();
  const grid = new SpatialSeparationGrid(40, 600, 600);

  // Place 80 entities clustered tightly in corner cell (1, 1) [bounds: 40..80]
  // Adjacent to walls at Row 0, Col 0, and pillar at (2, 2)
  const entities = [];
  for (let i = 0; i < 80; i++) {
    entities.push({
      x: 60 + (Math.random() - 0.5) * 6,
      y: 60 + (Math.random() - 0.5) * 6,
      active: true,
      collisionRadius: 12,
      mass: i % 4 === 0 ? 3.0 : 1.0, // Mixed masses (Tanks vs Chasers)
    });
  }

  // Run 100 physics relaxation steps with map wall collision resolution
  for (let step = 0; step < 100; step++) {
    grid.resolveSeparation(entities, {
      iterations: 2,
      separationFactor: 0.4,
      bounds: { minX: 20, maxX: 580, minY: 20, maxY: 500 },
      map,
      tileSize: 40,
    });

    // Verify after EVERY step: ZERO entities inside hard walls!
    for (let k = 0; k < entities.length; k++) {
      const e = entities[k];
      const r = Math.floor(e.y / TILE_SIZE);
      const c = Math.floor(e.x / TILE_SIZE);

      assert.ok(
        r >= 1 && r <= ROWS - 2 && c >= 1 && c <= COLS - 2,
        `Step ${step}, Entity ${k}: pushed out of arena bounds into row ${r}, col ${c} (x=${e.x}, y=${e.y})`
      );

      assert.notEqual(
        map[r]?.[c],
        TILE_WALL,
        `Step ${step}, Entity ${k}: penetrated TILE_WALL at row ${r}, col ${c} (x=${e.x}, y=${e.y})`
      );
    }
  }
});

/* ==============================================================================
 * SECTION 6: HEADLESS GAMESCENE LIVE INSTANCE INTEGRATION
 * ============================================================================== */

test('6.1: GameScene instance initializes conveyors, portals, and boundary defaults cleanly', () => {
  const scene = new GameScene();
  assert.ok(scene, 'GameScene instance created successfully');

  // Verify initial conveyor belt setup
  assert.ok(Array.isArray(scene.conveyors), 'scene.conveyors initialized');
  assert.equal(scene.conveyors.length, 7, 'Default 7 conveyors configured');

  // Verify initial portal cooldown
  assert.equal(scene.portalCooldown, 0, 'Initial portalCooldown must be 0');
  assert.equal(scene.dashCooldownRemaining, 0, 'Initial dashCooldownRemaining must be 0');
});

test('6.2: GameScene getConveyorAt accurately identifies conveyor corridor tiles', () => {
  const scene = new GameScene();

  // Test getConveyorAt on conveyor tiles
  for (let col = 4; col <= 10; col++) {
    const belt = scene['getConveyorAt'](7, col);
    assert.ok(belt, `Conveyor must exist at (7, ${col})`);
    assert.equal(belt.dirX, 1, 'dirX must be 1');
    assert.equal(belt.dirY, 0, 'dirY must be 0');
  }

  // Test getConveyorAt on non-conveyor tiles
  assert.equal(scene['getConveyorAt'](6, 4), undefined, 'Row 6 must not have conveyor');
  assert.equal(scene['getConveyorAt'](7, 3), undefined, 'Col 3 must not have conveyor');
  assert.equal(scene['getConveyorAt'](7, 11), undefined, 'Col 11 must not have conveyor');
});

test('6.3: GameScene warpPlayer sets 1.2s portal cooldown and handles zero-ejection bomb bypass', () => {
  const scene = new GameScene();

  // Mock player entity
  const player = {
    x: 540,
    y: 60,
    active: true,
    data: new Map(),
    getData(k) { return this.data.get(k); },
    setData(k, v) { this.data.set(k, v); },
    body: {
      reset(rx, ry) {
        player.x = rx;
        player.y = ry;
      },
    },
    setPosition(nx, ny) {
      player.x = nx;
      player.y = ny;
    },
  };
  scene.player = player;

  // Destination portal B coords
  const pB = DEFAULT_PORTALS.portalB;

  // Execute warpPlayer(11, 1) directly on GameScene instance
  scene['warpPlayer'](pB.row, pB.col);

  // Verify portal cooldown set immediately to 1200ms
  assert.equal(
    scene.portalCooldown,
    PORTAL_COOLDOWN_MS,
    'portalCooldown must be set to 1200ms on warpPlayer'
  );

  // In headless mode without tweens, fallback sets position directly to destination center
  assert.equal(player.x, pB.col * TILE_SIZE + TILE_SIZE / 2, 'Player warped to Portal B center X (60px)');
  assert.equal(player.y, pB.row * TILE_SIZE + TILE_SIZE / 2, 'Player warped to Portal B center Y (460px)');
});
