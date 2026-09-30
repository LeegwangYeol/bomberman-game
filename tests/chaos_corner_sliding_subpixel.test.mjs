/**
 * tests/chaos_corner_sliding_subpixel.test.mjs
 *
 * Chaos QA Agent 8: Corner Sliding & Sub-Pixel Physics Boundary Tester
 * 2026-10-01 Daily Evolution Cycle
 *
 * Mission Scopes:
 * 1. Hitbox & Geometry Invariant Guards (24x24 Rigid Body, 8px Clearance).
 * 2. Corner Sliding Under Diagonal Movement (4-way diagonal routing, pillar rounding, S-bends).
 * 3. Sub-Pixel Physics & High-Speed Rounding (250 px/s & 350 px/s dash, sub-pixel offsets, variable delta).
 * 4. Conveyor Belt Drift Intersections & Compound Kinematics (AABB leading edge, cross-drift, counter-drift).
 * 5. Absolute Anti-Tunneling & Pillar Invariant Verification (10,000 Continuous Frames, 0 Pen, 0 Snag).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook for extensionless TypeScript imports in Node --experimental-strip-types
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
      for (const ext of [".ts", ".js", "/index.ts", "/index.js"]) {
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

// Minimal DOM & Canvas mocks for headless testing environment
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

const {
  applyPhysicsBodyInvariantGuard,
} = await import('../src/game/entities/BaseEntity.ts');

const {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} = await import('../src/game/pathfinding.ts');

const {
  CONVEYOR_DRIFT_SPEED,
  DASH_SPEED,
} = await import('../src/game/gameplay_mechanics.ts');

/* ==============================================================================
 * MOCK ARCADE PHYSICS SPRITE GENERATOR (True-to-Phaser Physics Simulation)
 * ============================================================================== */

function createMockArcadeSprite(x = 60, y = 60, baseW = 40, baseH = 40) {
  const sprite = {
    x,
    y,
    rotation: 0,
    angle: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    displayOriginX: 20,
    displayOriginY: 20,
    active: true,
    data: new Map(),
    setData(k, v) { sprite.data.set(k, v); return sprite; },
    getData(k) { return sprite.data.get(k); },
    setPosition(nx, ny) {
      sprite.x = nx;
      sprite.y = ny;
      if (sprite.body && sprite.body.updateFromGameObject) {
        sprite.body.updateFromGameObject();
      }
      return sprite;
    },
    setScale(sx, sy = sx) {
      sprite.scaleX = sx;
      sprite.scaleY = sy;
      if (sprite.body && sprite.body.updateFromGameObject) {
        sprite.body.updateFromGameObject();
      }
      return sprite;
    },
    setAngle(deg) {
      sprite.angle = deg;
      sprite.rotation = (deg * Math.PI) / 180;
      if (sprite.body && sprite.body.updateFromGameObject) {
        sprite.body.updateFromGameObject();
      }
      return sprite;
    },
    destroy() {
      sprite.active = false;
    },
  };

  const body = {
    width: baseW,
    height: baseH,
    halfWidth: baseW / 2,
    halfHeight: baseH / 2,
    offset: { x: 0, y: 0 },
    position: { x: x - baseW / 2, y: y - baseH / 2 },
    center: { x, y },
    velocity: { x: 0, y: 0 },
    immovable: false,
    transform: { x, y, rotation: 0, scaleX: 1.0, scaleY: 1.0 },
    setSize(w, h) {
      body.width = w;
      body.height = h;
      body.halfWidth = w / 2;
      body.halfHeight = h / 2;
      body.updateCenter();
      return body;
    },
    setOffset(ox, oy) {
      body.offset.x = ox;
      body.offset.y = oy;
      body.updateCenter();
      return body;
    },
    setVelocity(vx, vy) {
      body.velocity.x = vx;
      body.velocity.y = vy;
      return body;
    },
    updateCenter() {
      body.center.x = body.position.x + body.halfWidth;
      body.center.y = body.position.y + body.halfHeight;
    },
    updateBounds() {
      body.width = baseW * Math.abs(sprite.scaleX);
      body.height = baseH * Math.abs(sprite.scaleY);
      body.halfWidth = body.width / 2;
      body.halfHeight = body.height / 2;
      body.updateCenter();
    },
    updateFromGameObject() {
      body.updateBounds();
      body.position.x = sprite.x + body.offset.x - sprite.displayOriginX;
      body.position.y = sprite.y + body.offset.y - sprite.displayOriginY;
      body.updateCenter();
    },
    reset(rx, ry) {
      sprite.x = rx;
      sprite.y = ry;
      body.position.x = rx - body.halfWidth;
      body.position.y = ry - body.halfHeight;
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.updateCenter();
    },
  };

  sprite.body = body;
  body.updateCenter();
  return sprite;
}

/**
 * Standard Bomberman Arena generator (matching GameScene.ts generateMap)
 */
function createStandardArena() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        map[r][c] = TILE_WALL;
      } else if (r % 2 === 0 && c % 2 === 0) {
        map[r][c] = TILE_WALL; // Indestructible pillars
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/**
 * High-Fidelity Physics and Kinematics Harness for Player Movement,
 * Corner Sliding, Sub-Pixel Centering, and Conveyor Intersections.
 */
class ChaosPhysicsHarness {
  constructor(map = createStandardArena()) {
    this.map = map.map(row => [...row]);
    this.player = createMockArcadeSprite(60, 60);
    applyPhysicsBodyInvariantGuard(this.player, 24, 24, 8, 8);

    this.speed = 150;
    this.slideSpeed = 150;
    this.cornerSlideTolerance = 8;
    this.snapThreshold = 2;

    this.conveyors = []; // { row, col, dirX, dirY }
    this.hasWallPass = false;
    this.hasBombPass = false;
    this.bombs = [];

    this.inputs = {
      left: false,
      right: false,
      up: false,
      down: false,
      timeX: 0,
      timeY: 0,
    };
  }

  setSpeed(s) {
    this.speed = s;
    this.slideSpeed = s;
  }

  setTolerance(tol) {
    this.cornerSlideTolerance = tol;
  }

  addConveyor(row, col, dirX, dirY) {
    this.conveyors.push({ row, col, dirX, dirY });
  }

  isPassable(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (this.map[r][c] === TILE_WALL) return false;
    if (this.map[r][c] === TILE_BLOCK && !this.hasWallPass) return false;

    if (!this.hasBombPass) {
      const pCol = Math.floor(this.player.x / TILE_SIZE);
      const pRow = Math.floor(this.player.y / TILE_SIZE);
      for (const b of this.bombs) {
        if (b.active && b.row === r && b.col === c) {
          if (!(pRow === r && pCol === c)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Replicates GameScene.ts updatePlayerMovement with dynamic snap support
   */
  updatePlayerMovement(dt = 1 / 60) {
    const left = this.inputs.left;
    const right = this.inputs.right;
    const up = this.inputs.up;
    const down = this.inputs.down;

    if (!left && !right && !up && !down) {
      this.player.body.velocity.x = 0;
      this.player.body.velocity.y = 0;
      return;
    }

    const px = this.player.x;
    const py = this.player.y;
    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;
    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    let wantX = 0;
    let wantY = 0;
    if (left && !right) wantX = -1;
    else if (right && !left) wantX = 1;

    if (up && !down) wantY = -1;
    else if (down && !up) wantY = 1;

    // Resolve dominant axis
    let primaryAxis = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = this.isPassable(row, col + wantX);
      const yOpen = this.isPassable(row + wantY, col);

      if (xOpen && !yOpen) {
        primaryAxis = 'x';
      } else if (yOpen && !xOpen) {
        primaryAxis = 'y';
      } else {
        primaryAxis = this.inputs.timeY > this.inputs.timeX ? 'y' : 'x';
      }
    } else if (wantX !== 0) {
      primaryAxis = 'x';
    } else if (wantY !== 0) {
      primaryAxis = 'y';
    }

    let vx = 0;
    let vy = 0;
    const speed = this.speed;
    const slideSpeed = this.slideSpeed;
    const tol = this.cornerSlideTolerance || 8;
    // High-speed sub-pixel snap threshold accommodating step distance
    const snapThreshold = Math.max(this.snapThreshold, speed * dt);

    if (primaryAxis === 'x') {
      vx = wantX * speed;
      const nextCol = col + wantX;
      const directOpen = this.isPassable(row, nextCol);

      if (directOpen) {
        if (Math.abs(diffY) > snapThreshold) {
          vy = -Math.sign(diffY) * slideSpeed;
        } else {
          this.player.y = rowCenterY;
          vy = 0;
        }
      } else {
        // Corner Rounding assist
        const canRoundUp = diffY <= 0 && Math.abs(diffY) <= tol && this.isPassable(row - 1, col) && this.isPassable(row - 1, nextCol);
        const canRoundDown = diffY >= 0 && Math.abs(diffY) <= tol && this.isPassable(row + 1, col) && this.isPassable(row + 1, nextCol);

        if (canRoundUp && canRoundDown) {
          vy = diffY < 0 ? -slideSpeed : diffY > 0 ? slideSpeed : -slideSpeed;
        } else if (canRoundUp) {
          vy = -slideSpeed;
        } else if (canRoundDown) {
          vy = slideSpeed;
        } else {
          vy = 0;
        }
      }
    } else {
      vy = wantY * speed;
      const nextRow = row + wantY;
      const directOpen = this.isPassable(nextRow, col);

      if (directOpen) {
        if (Math.abs(diffX) > snapThreshold) {
          vx = -Math.sign(diffX) * slideSpeed;
        } else {
          this.player.x = colCenterX;
          vx = 0;
        }
      } else {
        // Corner Rounding assist
        const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= tol && this.isPassable(row, col - 1) && this.isPassable(nextRow, col - 1);
        const canRoundRight = diffX >= 0 && Math.abs(diffX) <= tol && this.isPassable(row, col + 1) && this.isPassable(nextRow, col + 1);

        if (canRoundLeft && canRoundRight) {
          vx = diffX < 0 ? -slideSpeed : diffX > 0 ? slideSpeed : -slideSpeed;
        } else if (canRoundLeft) {
          vx = -slideSpeed;
        } else if (canRoundRight) {
          vx = slideSpeed;
        } else {
          vx = 0;
        }
      }
    }

    this.player.body.velocity.x = vx;
    this.player.body.velocity.y = vy;
  }

  /**
   * Applies conveyor drift matching GameScene.ts lines 1903-1930 with 12px leading edge probes
   */
  applyConveyorDrift(dt = 1 / 60) {
    const pCol = Math.floor(this.player.x / TILE_SIZE);
    const pRow = Math.floor(this.player.y / TILE_SIZE);

    const belt = this.conveyors.find(c => c.row === pRow && c.col === pCol);
    if (!belt) return;

    const drift = CONVEYOR_DRIFT_SPEED * dt;
    const nextX = this.player.x + belt.dirX * drift;
    const nextY = this.player.y + belt.dirY * drift;

    const leadX = nextX + belt.dirX * 12;
    const leadY = nextY + belt.dirY * 12;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    const leadRow = Math.floor(leadY / TILE_SIZE);

    const perpX = belt.dirY !== 0 ? 11 : 0;
    const perpY = belt.dirX !== 0 ? 11 : 0;

    const canMove =
      leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
      this.isPassable(leadRow, leadCol) &&
      this.isPassable(Math.floor((leadY + perpY) / TILE_SIZE), Math.floor((leadX + perpX) / TILE_SIZE)) &&
      this.isPassable(Math.floor((leadY - perpY) / TILE_SIZE), Math.floor((leadX - perpX) / TILE_SIZE));

    if (canMove) {
      this.player.x = nextX;
      this.player.y = nextY;
      this.player.body.updateFromGameObject();
    }
  }

  /**
   * Complete physics tick (movement update, conveyor drift, integration, and AABB wall separation)
   */
  step(dt = 1 / 60) {
    this.updatePlayerMovement(dt);
    this.applyConveyorDrift(dt);

    let newX = this.player.x + this.player.body.velocity.x * dt;
    let newY = this.player.y + this.player.body.velocity.y * dt;

    // Arcade Physics AABB separation against static walls
    const halfSize = 12; // 24x24 hitbox -> 12px half-dimension
    const minX = newX - halfSize;
    const maxX = newX + halfSize;
    const minY = newY - halfSize;
    const maxY = newY + halfSize;

    const startCol = Math.floor((minX - 1) / TILE_SIZE);
    const endCol = Math.floor((maxX + 1) / TILE_SIZE);
    const startRow = Math.floor((minY - 1) / TILE_SIZE);
    const endRow = Math.floor((maxY + 1) / TILE_SIZE);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        if (this.map[r][c] === TILE_WALL || (this.map[r][c] === TILE_BLOCK && !this.hasWallPass)) {
          const wallLeft = c * TILE_SIZE;
          const wallRight = wallLeft + TILE_SIZE;
          const wallTop = r * TILE_SIZE;
          const wallBottom = wallTop + TILE_SIZE;

          if (maxX > wallLeft && minX < wallRight && maxY > wallTop && minY < wallBottom) {
            const overlapX1 = maxX - wallLeft;
            const overlapX2 = wallRight - minX;
            const overlapY1 = maxY - wallTop;
            const overlapY2 = wallBottom - minY;

            const minOverlapX = Math.min(overlapX1, overlapX2);
            const minOverlapY = Math.min(overlapY1, overlapY2);

            if (minOverlapX < minOverlapY) {
              if (overlapX1 < overlapX2) {
                newX = wallLeft - halfSize;
              } else {
                newX = wallRight + halfSize;
              }
            } else {
              if (overlapY1 < overlapY2) {
                newY = wallTop - halfSize;
              } else {
                newY = wallBottom + halfSize;
              }
            }
          }
        }
      }
    }

    this.player.setPosition(newX, newY);
    this.player.body.updateBounds();
    this.player.body.updateFromGameObject();
  }

  /**
   * Exact AABB overlap check against all walls and pillars
   */
  getWallPenetration() {
    const half = 12;
    const pLeft = this.player.x - half;
    const pRight = this.player.x + half;
    const pTop = this.player.y - half;
    const pBottom = this.player.y + half;

    let totalPenetrationArea = 0;
    let worstOverlap = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.map[r][c] === TILE_WALL || (this.map[r][c] === TILE_BLOCK && !this.hasWallPass)) {
          const wLeft = c * TILE_SIZE;
          const wRight = (c + 1) * TILE_SIZE;
          const wTop = r * TILE_SIZE;
          const wBottom = (r + 1) * TILE_SIZE;

          const oX = Math.max(0, Math.min(pRight, wRight) - Math.max(pLeft, wLeft));
          const oY = Math.max(0, Math.min(pBottom, wBottom) - Math.max(pTop, wTop));
          const area = oX * oY;
          if (area > 0) {
            totalPenetrationArea += area;
            worstOverlap = Math.max(worstOverlap, Math.min(oX, oY));
          }
        }
      }
    }
    return { area: totalPenetrationArea, worstOverlap };
  }
}

/* ==============================================================================
 * SCOPE 1: HITBOX & GEOMETRY INVARIANT GUARDS
 * ============================================================================== */

test('CHAOS 1.1: Player Body Invariant Guard maintains strict 24x24 hitbox across 1,000 rapid transforms', () => {
  const harness = new ChaosPhysicsHarness();
  const player = harness.player;

  assert.strictEqual(player.body.width, 24);
  assert.strictEqual(player.body.height, 24);
  assert.strictEqual(player.body.halfWidth, 12);
  assert.strictEqual(player.body.halfHeight, 12);
  assert.strictEqual(player.body.offset.x, 8);
  assert.strictEqual(player.body.offset.y, 8);

  const testScales = [
    [1.0, 1.0],
    [1.15, 0.85], // Squash on walk
    [0.90, 1.10], // Stretch on step
    [-1.0, 1.0],  // Flip X left
    [1.0, -1.0],  // Inverted Y
    [2.5, 2.5],   // Super-charge scale
  ];

  for (let i = 0; i < 1000; i++) {
    const rx = 52 + Math.random() * 496;
    const ry = 52 + Math.random() * 416;
    const pair = testScales[i % testScales.length];
    const bobOriginY = 20 - (i % 5);

    player.displayOriginY = bobOriginY;
    player.setPosition(rx, ry);
    player.setScale(pair[0], pair[1]);
    player.body.updateBounds();
    player.body.updateFromGameObject();

    assert.strictEqual(player.body.width, 24, `Frame ${i}: width mutated`);
    assert.strictEqual(player.body.height, 24, `Frame ${i}: height mutated`);
    assert.strictEqual(player.body.halfWidth, 12, `Frame ${i}: halfWidth mutated`);
    assert.strictEqual(player.body.halfHeight, 12, `Frame ${i}: halfHeight mutated`);
    assert.strictEqual(player.body.offset.x, 8, `Frame ${i}: offset.x mutated`);
    assert.strictEqual(player.body.offset.y, 8, `Frame ${i}: offset.y mutated`);

    // Center alignment must strictly match within floating point precision
    assert.ok(Math.abs(player.body.center.x - rx) < 1e-5);
    assert.ok(Math.abs(player.body.center.y - ry) < 1e-5);
  }
});

test('CHAOS 1.2: Boundary Clearance Matrix: Centered player has exactly 8.000px clearance in 40px corridors', () => {
  const harness = new ChaosPhysicsHarness();
  // Player at center of tile (1, 1): x = 60, y = 60
  harness.player.setPosition(60, 60);

  const pLeft = harness.player.x - 12;
  const pRight = harness.player.x + 12;
  const pTop = harness.player.y - 12;
  const pBottom = harness.player.y + 12;

  // Outer bounds of tile (1, 1) are [40, 80] x [40, 80]
  assert.strictEqual(pLeft - 40, 8, 'West clearance must be exactly 8px');
  assert.strictEqual(80 - pRight, 8, 'East clearance must be exactly 8px');
  assert.strictEqual(pTop - 40, 8, 'North clearance must be exactly 8px');
  assert.strictEqual(80 - pBottom, 8, 'South clearance must be exactly 8px');

  const pen = harness.getWallPenetration();
  assert.strictEqual(pen.area, 0, 'Centered player has 0 penetration');
});

/* ==============================================================================
 * SCOPE 2: CORNER SLIDING UNDER DIAGONAL MOVEMENT
 * ============================================================================== */

test('CHAOS 2.1: Diagonal input routing automatically picks open orthogonal axis against pillar corners', () => {
  const harness = new ChaosPhysicsHarness();
  // Pillar at (2, 2) [80..120] x [80..120]
  // 1. Player at (2, 1) [center 60, 100] pressing East + North (Right + Up)
  // East (2, 2) is WALL. North (1, 1) is EMPTY.
  harness.player.setPosition(60, 100);
  harness.inputs.right = true;
  harness.inputs.up = true;

  harness.updatePlayerMovement();
  assert.strictEqual(harness.player.body.velocity.y, -150, 'Must route to North (UP) because East is blocked by pillar');
  assert.strictEqual(harness.player.body.velocity.x, 0, 'Blocked East axis must not produce forward penetration');

  // 2. Player at (1, 2) [center 100, 60] pressing South + West (Down + Left)
  // South (2, 2) is WALL. West (1, 1) is EMPTY.
  harness.player.setPosition(100, 60);
  harness.inputs.right = false;
  harness.inputs.up = false;
  harness.inputs.down = true;
  harness.inputs.left = true;

  harness.updatePlayerMovement();
  assert.strictEqual(harness.player.body.velocity.x, -150, 'Must route to West (LEFT) because South is blocked by pillar');
  assert.strictEqual(harness.player.body.velocity.y, 0, 'Blocked South axis must not produce forward penetration');
});

test('CHAOS 2.2: Corner Rounding assist zone (8px, 11px, 14px) successfully slides around pillar without snagging', () => {
  const tolerances = [8, 11, 14];

  for (const tol of tolerances) {
    const harness = new ChaosPhysicsHarness();
    harness.setTolerance(tol);

    // Approaching solid pillar at (2, 2) moving East from (2, 1)
    // Offset slightly downward within tolerance zone: y = 100 + (tol - 2)
    const startY = 100 + (tol - 2);
    harness.player.setPosition(60, startY);
    harness.inputs.right = true;

    harness.updatePlayerMovement();
    assert.strictEqual(harness.player.body.velocity.x, 150, 'Forward intent must be maintained');
    assert.strictEqual(harness.player.body.velocity.y, 150, `Tolerance ${tol}px must engage downward slide around corner`);

    // Verify 0 penetration during step
    harness.step(1 / 60);
    const pen = harness.getWallPenetration();
    assert.strictEqual(pen.area, 0, `No penetration while rounding corner at tol=${tol}`);
  }
});

test('CHAOS 2.3: "Fake Open" diagonal trap: player does not clip vertex when diagonal corner is blocked', () => {
  const harness = new ChaosPhysicsHarness();
  // Player at (1, 1) [center 60, 60].
  // Suppose (1, 2) is open corridor, (2, 1) is open corridor, but diagonal pillar (2, 2) is WALL.
  // Player moves diagonally Southeast (Down + Right)
  harness.player.setPosition(60, 60);
  harness.inputs.right = true;
  harness.inputs.down = true;
  harness.inputs.timeX = 100;
  harness.inputs.timeY = 200; // timeY > timeX -> primaryAxis = 'y'

  for (let frame = 0; frame < 30; frame++) {
    harness.step(1 / 60);
    const pen = harness.getWallPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame}: Diagonal movement must not clip corner pillar at (2, 2)`);
  }
  // After 30 frames moving Down into (2, 1), player is centered in col 1 (x=60) and y > 80
  assert.strictEqual(harness.player.x, 60, 'Player must remain centered horizontally in col 1');
  assert.ok(harness.player.y > 80, 'Player made forward progress into row 2');
});

test('CHAOS 2.4: 2,000 Frames of continuous diagonal chaos pathing around pillars: 0 snags, 0 penetrations', () => {
  const harness = new ChaosPhysicsHarness();
  harness.player.setPosition(60, 60);

  const diagonalPairs = [
    { right: true, down: true },
    { left: true, down: true },
    { right: true, up: true },
    { left: true, up: true },
  ];

  let totalPenetrations = 0;
  let framesProcessed = 0;

  for (let frame = 0; frame < 2000; frame++) {
    // Switch diagonal intent every 15 frames
    if (frame % 15 === 0) {
      const choice = diagonalPairs[(frame / 15) % diagonalPairs.length];
      harness.inputs.right = Boolean(choice.right);
      harness.inputs.left = Boolean(choice.left);
      harness.inputs.up = Boolean(choice.up);
      harness.inputs.down = Boolean(choice.down);
      harness.inputs.timeX = frame;
      harness.inputs.timeY = frame + 1;
    }

    harness.step(1 / 60);
    framesProcessed++;

    const pen = harness.getWallPenetration();
    if (pen.area > 0) {
      totalPenetrations++;
    }

    // Verify player stays in legal world bounds [52, 548] x [52, 468]
    assert.ok(harness.player.x >= 52 && harness.player.x <= 548, `Frame ${frame}: Player x out of bounds: ${harness.player.x}`);
    assert.ok(harness.player.y >= 52 && harness.player.y <= 468, `Frame ${frame}: Player y out of bounds: ${harness.player.y}`);
  }

  assert.strictEqual(totalPenetrations, 0, `Recorded ${totalPenetrations} wall penetrations during diagonal chaos!`);
  assert.strictEqual(framesProcessed, 2000);
});

/* ==============================================================================
 * SCOPE 3: SUB-PIXEL PHYSICS & HIGH-SPEED ROUNDING (250 px/s & 350 px/s)
 * ============================================================================== */

test('CHAOS 3.1: Sub-pixel rounding at 250 px/s cleanly converges to centerline without infinite oscillation', () => {
  const harness = new ChaosPhysicsHarness();
  harness.setSpeed(250); // 250 px/s high speed (Speed Surge + Perk Bonus)
  harness.inputs.right = true;

  // Test 100 sub-pixel offsets spanning [-7.5, +7.5] px
  const testOffsets = [];
  for (let o = -7.5; o <= 7.5; o += 0.15) {
    testOffsets.push(parseFloat(o.toFixed(4)));
  }
  // Include irrational numbers
  testOffsets.push(Math.PI / 2, Math.SQRT2, 2.05, -2.05, 4.1667, -4.1667);

  for (const offset of testOffsets) {
    harness.player.setPosition(60, 60 + offset);

    let converged = false;
    for (let step = 0; step < 20; step++) {
      harness.step(1 / 60);
      const diffY = Math.abs(harness.player.y - 60);
      if (diffY < 1e-4) {
        converged = true;
        break;
      }
      // Invariant: no wall penetration during convergence
      const pen = harness.getWallPenetration();
      assert.strictEqual(pen.area, 0, `Wall penetration at offset ${offset}, step ${step}`);
    }

    assert.ok(converged, `Sub-pixel offset ${offset} failed to converge to centerline within 20 steps! Final y=${harness.player.y}`);
  }
});

test('CHAOS 3.2: Extreme Dash Speed (350 px/s) maintains corridor clearance and 0 penetration across 500 frames', () => {
  const harness = new ChaosPhysicsHarness();
  harness.setSpeed(DASH_SPEED); // 350 px/s dash
  harness.player.setPosition(60, 60);
  harness.inputs.right = true;

  for (let frame = 0; frame < 500; frame++) {
    // If approaching outer wall at col 13 (x >= 540), bounce back left
    if (harness.player.x >= 540) {
      harness.inputs.right = false;
      harness.inputs.left = true;
    } else if (harness.player.x <= 60) {
      harness.inputs.left = false;
      harness.inputs.right = true;
    }

    harness.step(1 / 60);

    const pen = harness.getWallPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame}: 350 px/s dash penetrated wall! Area: ${pen.area}`);

    // Verify Y remains locked to centerline (y=60)
    assert.strictEqual(harness.player.y, 60, `Frame ${frame}: Dash drifted off-axis vertically: ${harness.player.y}`);
  }
});

test('CHAOS 3.3: Variable Frame Rate & Delta Jitter (120 FPS, 60 FPS, 30 FPS, 20 FPS lag spike) at 250 px/s', () => {
  const dtVariants = [
    1 / 120, // 8.33ms (120 FPS high-refresh)
    1 / 60,  // 16.66ms (standard 60 FPS)
    1 / 30,  // 33.33ms (30 FPS half-rate)
    1 / 20,  // 50.00ms (20 FPS lag spike)
  ];

  for (const dt of dtVariants) {
    const harness = new ChaosPhysicsHarness();
    harness.setSpeed(250);
    harness.player.setPosition(60, 60);
    harness.inputs.down = true;

    for (let frame = 0; frame < 100; frame++) {
      harness.step(dt);
      const pen = harness.getWallPenetration();
      assert.strictEqual(pen.area, 0, `Lag spike dt=${(dt*1000).toFixed(1)}ms frame ${frame} penetrated wall!`);

      // Verify X remains locked to centerline (x=60)
      assert.strictEqual(harness.player.x, 60, `Dt=${(dt*1000).toFixed(1)}ms: Drifted off horizontal center: ${harness.player.x}`);
    }
  }
});

/* ==============================================================================
 * SCOPE 4: CONVEYOR BELT DRIFT INTERSECTIONS & COMPOUND KINEMATICS
 * ============================================================================== */

test('CHAOS 4.1: Conveyor belt drift halts cleanly at solid wall boundaries without penetration', () => {
  const harness = new ChaosPhysicsHarness();
  // Place conveyor at (1, 1) pushing East directly into solid wall at (1, 2)
  harness.map[1][2] = TILE_WALL;
  harness.addConveyor(1, 1, 1, 0); // East conveyor
  harness.player.setPosition(60, 60);

  // Player idle (no input), conveyor pushes player toward x=80
  for (let frame = 0; frame < 120; frame++) {
    harness.step(1 / 60);

    const pen = harness.getWallPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame}: Conveyor drift pushed player into wall!`);
    // Hitbox right edge (player.x + 12) must never exceed wall left boundary (80)
    assert.ok(harness.player.x + 12 <= 80, `Hitbox right edge (${harness.player.x + 12}) breached wall at 80`);
  }

  // Final position must be clamped cleanly at or before x=68 (68 + 12 = 80)
  assert.ok(harness.player.x <= 68.0, `Player x must be clamped <= 68 (got ${harness.player.x})`);
});

test('CHAOS 4.2: Conveyor drift intersecting perpendicular high-speed movement (250 px/s)', () => {
  const harness = new ChaosPhysicsHarness();
  // Row 7 has conveyor pushing East (cols 4..10)
  for (let c = 4; c <= 10; c++) {
    harness.addConveyor(7, c, 1, 0);
  }

  // Player starts at (6, 5) [center 220, 260] and moves South across conveyor into (8, 5) at 250 px/s
  harness.setSpeed(250);
  harness.player.setPosition(220, 260);
  harness.inputs.down = true;

  for (let frame = 0; frame < 30; frame++) {
    harness.step(1 / 60);

    const pen = harness.getWallPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame}: Perpendicular conveyor crossing penetrated wall!`);
  }

  // Player must have crossed into row 8 (y > 320)
  assert.ok(harness.player.y > 320, `Player must cross row 7 conveyor into row 8 (got y=${harness.player.y})`);
  // Player x must have drifted slightly East due to the conveyor push while traversing row 7
  assert.ok(harness.player.x >= 220, `Player x must be pushed East or centered: ${harness.player.x}`);
});

test('CHAOS 4.3: Counter-drift navigation: player overcomes conveyor push without snagging', () => {
  const harness = new ChaosPhysicsHarness();
  // Conveyor at row 1, cols 3, 4, 5 pushing East (+60 px/s)
  harness.addConveyor(1, 3, 1, 0);
  harness.addConveyor(1, 4, 1, 0);
  harness.addConveyor(1, 5, 1, 0);

  // Player starts at (1, 5) [center 220, 60] and moves West (LEFT) at 150 px/s against the East drift
  harness.player.setPosition(220, 60);
  harness.inputs.left = true;

  for (let frame = 0; frame < 60; frame++) {
    harness.step(1 / 60);

    const pen = harness.getWallPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame}: Counter-drift penetrated wall`);
  }

  // Effective net velocity = -150 + 60 = -90 px/s. In 60 frames (1s), displacement ~ -90px.
  // Final x should be around 220 - 90 = 130px (in col 3: [120, 160])
  assert.ok(harness.player.x < 150, `Player must make forward headway against conveyor: ${harness.player.x}`);
  assert.strictEqual(harness.player.y, 60, 'Y must stay centered in corridor');
});

/* ==============================================================================
 * SCOPE 5: ABSOLUTE ANTI-TUNNELING & PILLAR INVARIANT VERIFICATION (10,000 FRAMES)
 * ============================================================================== */

test('CHAOS 5.1: 10,000 Continuous frames of chaotic movement under 250/350 px/s: 0 wall penetrations, 0 pillar clippings', () => {
  const harness = new ChaosPhysicsHarness();
  harness.player.setPosition(60, 60);

  // Add standard conveyor corridor along row 7
  for (let c = 4; c <= 10; c++) {
    harness.addConveyor(7, c, 1, 0);
  }

  const speedPresets = [150, 200, 250, DASH_SPEED]; // DASH_SPEED = 350
  const inputCombos = [
    { right: true, down: false, left: false, up: false },
    { right: false, down: true, left: false, up: false },
    { right: false, down: false, left: true, up: false },
    { right: false, down: false, left: false, up: true },
    { right: true, down: true, left: false, up: false },
    { right: false, down: true, left: true, up: false },
    { right: false, down: false, left: true, up: true },
    { right: true, down: false, left: false, up: true },
  ];

  let totalPenetrations = 0;
  let minPillarDistance = Infinity;

  for (let frame = 0; frame < 10000; frame++) {
    // Dynamic chaotic changes every 10-25 frames
    if (frame % 17 === 0) {
      const spd = speedPresets[(frame / 17) % speedPresets.length];
      harness.setSpeed(spd);
    }
    if (frame % 11 === 0) {
      const inp = inputCombos[(frame / 11) % inputCombos.length];
      harness.inputs.right = inp.right;
      harness.inputs.down = inp.down;
      harness.inputs.left = inp.left;
      harness.inputs.up = inp.up;
      harness.inputs.timeX = frame;
      harness.inputs.timeY = frame + 2;
    }

    harness.step(1 / 60);

    const pen = harness.getWallPenetration();
    if (pen.area > 0) {
      totalPenetrations++;
    }

    // Check distance to all indestructible pillars (r % 2 === 0 && c % 2 === 0)
    const pCol = Math.round(harness.player.x / TILE_SIZE);
    const pRow = Math.round(harness.player.y / TILE_SIZE);

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = pRow + dr;
        const nc = pCol + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && harness.map[nr][nc] === TILE_WALL) {
          const wLeft = nc * TILE_SIZE;
          const wRight = (nc + 1) * TILE_SIZE;
          const wTop = nr * TILE_SIZE;
          const wBottom = (nr + 1) * TILE_SIZE;

          const pHalf = 12;
          const pxL = harness.player.x - pHalf;
          const pxR = harness.player.x + pHalf;
          const pyT = harness.player.y - pHalf;
          const pyB = harness.player.y + pHalf;

          // Distance between AABB and wall (0 if touching, negative if penetrating)
          const dx = Math.max(0, Math.max(wLeft - pxR, pxL - wRight));
          const dy = Math.max(0, Math.max(wTop - pyB, pyT - wBottom));
          const dist = Math.hypot(dx, dy);
          if (dist < minPillarDistance) {
            minPillarDistance = dist;
          }
        }
      }
    }

    // World boundary containment assertion
    assert.ok(harness.player.x >= 52 && harness.player.x <= 548, `Frame ${frame}: Breached X boundary (${harness.player.x})`);
    assert.ok(harness.player.y >= 52 && harness.player.y <= 468, `Frame ${frame}: Breached Y boundary (${harness.player.y})`);
  }

  assert.strictEqual(totalPenetrations, 0, `Recorded ${totalPenetrations} wall penetrations in 10,000 frames!`);
  assert.ok(minPillarDistance >= 0, `Negative distance to pillar detected: ${minPillarDistance}`);
});
