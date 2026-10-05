/**
 * tests/player_movement_450_physics.test.mjs
 *
 * Comprehensive Physics & Hitbox Verification Test Suite for Player Movement:
 * - 24x24 hitbox geometry and 8.000px corridor clearance
 * - Corner sliding algorithm around solid pillars at speeds up to 450 px/s
 * - Dynamic corridor centering with snapThreshold scaling
 * - Subpixel tolerance continuum and IEEE-754 precision limits
 * - Tolerance zone expansions (8px, 11px, 14px)
 * - Zero dead-zone resolution at corner pillar vertices
 * - Delta lag spikes (120, 60, 30, 20, 15 FPS)
 * - Anti-tunneling, anti-snagging, and continuous multi-lap navigation at 450 px/s
 * - 10,000-frame chaotic soak test at maximum 450 px/s velocity
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

const { applyPhysicsBodyInvariantGuard } = await import('../src/game/entities/BaseEntity.ts');
const { ROWS, COLS, TILE_SIZE, TILE_EMPTY, TILE_WALL } = await import('../src/game/pathfinding.ts');

function createMockSprite(x = 60, y = 60, baseW = 40, baseH = 40) {
  const sprite = {
    x,
    y,
    rotation: 0,
    angle: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    displayOriginX: 20,
    displayOriginY: 20,
    flipX: false,
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
    setFlipX(flip) {
      sprite.flipX = flip;
      return sprite;
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

function createArenaMap() {
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

export class PlayerPhysics450Simulator {
  constructor(map = createArenaMap()) {
    this.map = map.map(row => [...row]);
    this.player = createMockSprite(60, 60);
    applyPhysicsBodyInvariantGuard(this.player, 24, 24, 8, 8);

    this.speed = 450;
    this.slideSpeed = 450;
    this.cornerSlideTolerance = 8;
    this.snapThreshold = 2;

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

  setTolerance(t) {
    this.cornerSlideTolerance = t;
  }

  isPassable(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this.map[r][c] === TILE_EMPTY;
  }

  updateMovement(dt = 1 / 60) {
    const { left, right, up, down } = this.inputs;
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
    const dynamicSnap = Math.max(this.snapThreshold, speed * dt);

    if (primaryAxis === 'x') {
      vx = wantX * speed;
      const nextCol = col + wantX;
      const directOpen = this.isPassable(row, nextCol);

      if (directOpen) {
        // Phase 1: Corridor Centering
        if (Math.abs(diffY) > dynamicSnap) {
          vy = -Math.sign(diffY) * slideSpeed;
        } else {
          this.player.y = rowCenterY;
          if (this.player.body && typeof this.player.body.updateFromGameObject === 'function') {
            this.player.body.updateFromGameObject();
          }
          vy = 0;
        }
      } else {
        // Phase 2: Corner Rounding (PHYS-07)
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
        // Phase 1: Corridor Centering
        if (Math.abs(diffX) > dynamicSnap) {
          vx = -Math.sign(diffX) * slideSpeed;
        } else {
          this.player.x = colCenterX;
          if (this.player.body && typeof this.player.body.updateFromGameObject === 'function') {
            this.player.body.updateFromGameObject();
          }
          vx = 0;
        }
      } else {
        // Phase 2: Corner Rounding (PHYS-07)
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

  step(dt = 1 / 60) {
    this.updateMovement(dt);

    let newX = this.player.x + this.player.body.velocity.x * dt;
    let newY = this.player.y + this.player.body.velocity.y * dt;

    const halfSize = 12;
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
        if (this.map[r][c] === TILE_WALL) {
          const wLeft = c * TILE_SIZE;
          const wRight = wLeft + TILE_SIZE;
          const wTop = r * TILE_SIZE;
          const wBottom = wTop + TILE_SIZE;

          if (maxX > wLeft && minX < wRight && maxY > wTop && minY < wBottom) {
            const overlapX1 = maxX - wLeft;
            const overlapX2 = wRight - minX;
            const overlapY1 = maxY - wTop;
            const overlapY2 = wBottom - minY;

            const minOverlapX = Math.min(overlapX1, overlapX2);
            const minOverlapY = Math.min(overlapY1, overlapY2);

            if (minOverlapX < minOverlapY) {
              if (overlapX1 < overlapX2) {
                newX = wLeft - halfSize;
              } else {
                newX = wRight + halfSize;
              }
            } else {
              if (overlapY1 < overlapY2) {
                newY = wTop - halfSize;
              } else {
                newY = wBottom + halfSize;
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

  getPenetration() {
    const half = 12;
    const pLeft = this.player.x - half;
    const pRight = this.player.x + half;
    const pTop = this.player.y - half;
    const pBottom = this.player.y + half;

    let totalArea = 0;
    let worstOverlap = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.map[r][c] === TILE_WALL) {
          const wLeft = c * TILE_SIZE;
          const wRight = (c + 1) * TILE_SIZE;
          const wTop = r * TILE_SIZE;
          const wBottom = (r + 1) * TILE_SIZE;

          const oX = Math.max(0, Math.min(pRight, wRight) - Math.max(pLeft, wLeft));
          const oY = Math.max(0, Math.min(pBottom, wBottom) - Math.max(pTop, wTop));
          const area = oX * oY;
          if (area > 0) {
            totalArea += area;
            worstOverlap = Math.max(worstOverlap, Math.min(oX, oY));
          }
        }
      }
    }
    return { area: totalArea, worstOverlap };
  }
}

/* ==============================================================================
 * 1. 24x24 HITBOX GEOMETRY & CLEARANCE MARGIN VERIFICATION
 * ============================================================================== */

test('HITBOX-450-01: Player 24x24 Hitbox & 8.000px Corridor Clearance Margins', () => {
  const sim = new PlayerPhysics450Simulator();
  const player = sim.player;

  assert.strictEqual(player.body.width, 24, 'Hitbox width must be exactly 24px');
  assert.strictEqual(player.body.height, 24, 'Hitbox height must be exactly 24px');
  assert.strictEqual(player.body.halfWidth, 12, 'Half width must be 12px');
  assert.strictEqual(player.body.halfHeight, 12, 'Half height must be 12px');
  assert.strictEqual(player.body.offset.x, 8, 'Hitbox offset X must be 8px');
  assert.strictEqual(player.body.offset.y, 8, 'Hitbox offset Y must be 8px');

  // Centered in tile (1, 1) -> center is (60, 60)
  player.setPosition(60, 60);
  const leftEdge = player.x - 12; // 48
  const rightEdge = player.x + 12; // 72
  const topEdge = player.y - 12; // 48
  const bottomEdge = player.y + 12; // 72

  // Surrounding walls: row 0 (0..40), row 2 (80..120), col 0 (0..40), col 2 (80..120)
  assert.strictEqual(leftEdge - 40, 8.0, 'Left clearance must be exactly 8.0px');
  assert.strictEqual(80 - rightEdge, 8.0, 'Right clearance must be exactly 8.0px');
  assert.strictEqual(topEdge - 40, 8.0, 'Top clearance must be exactly 8.0px');
  assert.strictEqual(80 - bottomEdge, 8.0, 'Bottom clearance must be exactly 8.0px');
});

test('HITBOX-450-02: Body Invariant Guard maintains 24x24 dimensions across transforms at 450 px/s', () => {
  const sim = new PlayerPhysics450Simulator();
  const player = sim.player;

  for (let i = 0; i < 500; i++) {
    player.setScale(1.0 + (i % 5) * 0.1, 1.0 - (i % 4) * 0.08);
    player.setFlipX(i % 2 === 0);
    player.setPosition(60 + (i % 10) * 0.5, 60 - (i % 10) * 0.5);

    assert.strictEqual(player.body.width, 24, `Scale step ${i} mutated width`);
    assert.strictEqual(player.body.height, 24, `Scale step ${i} mutated height`);
  }
});

/* ==============================================================================
 * 2. CORRIDOR CENTERING PHYSICS AT 450 PX/S
 * ============================================================================== */

test('CENTER-450-01: Corridor Centering snaps cleanly to centerline at 450 px/s with 0 overshoot', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);
  sim.inputs.right = true;

  // Test across offsets within corridor clearance (-7.5px to +7.5px)
  const testOffsets = [-7.5, -5.0, -3.2, -1.5, 1.5, 3.2, 5.0, 7.5];

  for (const offset of testOffsets) {
    sim.player.setPosition(60, 60 + offset);

    let converged = false;
    let signSwitches = 0;
    let prevSign = Math.sign(offset);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(1 / 60);
      const curDiff = sim.player.y - 60;
      const curSign = Math.sign(curDiff);

      if (curSign !== 0 && prevSign !== 0 && curSign !== prevSign) {
        signSwitches++;
      }
      prevSign = curSign;

      if (Math.abs(curDiff) < 1e-4) {
        converged = true;
        break;
      }
    }

    assert.ok(converged, `Offset ${offset} failed to converge at 450 px/s! Final Y=${sim.player.y}`);
    assert.ok(signSwitches <= 1, `Offset ${offset} had jitter! Switches: ${signSwitches}`);
    assert.strictEqual(sim.getPenetration().area, 0, `Offset ${offset} caused wall penetration`);
  }
});

test('CENTER-450-02: Vertical Corridor Centering snaps horizontally at 450 px/s with 0 overshoot', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);
  sim.inputs.down = true;

  const testOffsets = [-7.5, -4.5, -2.1, 2.1, 4.5, 7.5];

  for (const offset of testOffsets) {
    sim.player.setPosition(60 + offset, 60);

    let converged = false;
    let signSwitches = 0;
    let prevSign = Math.sign(offset);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(1 / 60);
      const curDiff = sim.player.x - 60;
      const curSign = Math.sign(curDiff);

      if (curSign !== 0 && prevSign !== 0 && curSign !== prevSign) {
        signSwitches++;
      }
      prevSign = curSign;

      if (Math.abs(curDiff) < 1e-4) {
        converged = true;
        break;
      }
    }

    assert.ok(converged, `Vertical offset ${offset} failed to converge at 450 px/s! Final X=${sim.player.x}`);
    assert.ok(signSwitches <= 1, `Vertical offset ${offset} had jitter! Switches: ${signSwitches}`);
  }
});

/* ==============================================================================
 * 3. SUBPIXEL TOLERANCES CONTINUUM & IEEE-754 PRECISION LIMITS
 * ============================================================================== */

test('SUBPIXEL-450-01: 500-step Subpixel Offset Continuum at 450 px/s converges cleanly with zero jitter', () => {
  let failedConvergence = 0;
  let excessiveJitter = 0;

  for (let i = 0; i < 500; i++) {
    const offset = -7.9 + (15.8 * i) / 500;
    if (Math.abs(offset) < 0.001) continue;

    const sim = new PlayerPhysics450Simulator();
    sim.setSpeed(450);
    sim.player.setPosition(60, 60 + offset);
    sim.inputs.right = true;

    let converged = false;
    let signSwitches = 0;
    let prevSign = Math.sign(offset);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(1 / 60);
      const curDiff = sim.player.y - 60;
      const curSign = Math.sign(curDiff);

      if (curSign !== 0 && prevSign !== 0 && curSign !== prevSign) {
        signSwitches++;
      }
      prevSign = curSign;

      if (Math.abs(curDiff) < 1e-4) {
        converged = true;
        break;
      }
    }

    if (!converged) failedConvergence++;
    if (signSwitches > 1) excessiveJitter++;
  }

  assert.strictEqual(failedConvergence, 0, `500-step continuum had ${failedConvergence} convergence failures at 450 px/s`);
  assert.strictEqual(excessiveJitter, 0, `500-step continuum had ${excessiveJitter} jitter occurrences at 450 px/s`);
});

test('SUBPIXEL-450-02: Irrational & Floating-Point Precision Offsets at 450 px/s', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);
  sim.inputs.right = true;

  const irrationalOffsets = [
    Math.PI / 4,
    -Math.PI / 4,
    Math.SQRT2,
    -Math.SQRT2,
    Math.E / 2,
    -Math.E / 2,
    (Math.sqrt(5) - 1) / 2, // 1/phi ~ 0.618
    -(Math.sqrt(5) - 1) / 2,
    2.0000001,
    -2.0000001,
    4.1666667,
    -4.1666667,
    5.8333333,
    -5.8333333,
    7.4999999,
    -7.4999999,
  ];

  for (const offset of irrationalOffsets) {
    sim.player.setPosition(60, 60 + offset);

    let converged = false;
    let signSwitches = 0;
    let prevSign = Math.sign(offset);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(1 / 60);
      const curDiff = sim.player.y - 60;
      const curSign = Math.sign(curDiff);

      if (curSign !== 0 && prevSign !== 0 && curSign !== prevSign) {
        signSwitches++;
      }
      prevSign = curSign;

      if (Math.abs(curDiff) < 1e-4) {
        converged = true;
        break;
      }
    }

    assert.ok(converged, `Irrational offset ${offset} failed to converge at 450 px/s! Final Y=${sim.player.y}`);
    assert.ok(signSwitches <= 1, `Irrational offset ${offset} exhibited jitter at 450 px/s! Switches: ${signSwitches}`);
  }
});

/* ==============================================================================
 * 4. SOLID PILLAR CORNER SLIDING AT MAXIMUM 450 PX/S
 * ============================================================================== */

test('CORNER-450-01: Solid Pillar Rounding from All 4 Diagonal Approaches at 450 px/s', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);

  // Pillar at tile (2, 2) -> bounds [80, 120] x [80, 120]
  // 1. NE approach: Player at tile (2, 1) moving RIGHT + UP around pillar top-left corner
  sim.player.setPosition(60, 95);
  sim.inputs = { left: false, right: true, up: true, down: false, timeX: 1, timeY: 2 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `NE approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.y <= 60.1, 'NE approach successfully rounded corner into row 1 corridor at 450 px/s');

  // 2. SE approach: Player at tile (2, 1) moving RIGHT + DOWN around pillar bottom-left corner
  sim.player.setPosition(60, 105);
  sim.inputs = { left: false, right: true, up: false, down: true, timeX: 1, timeY: 2 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `SE approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.y >= 139.9, 'SE approach successfully rounded corner into row 3 corridor at 450 px/s');

  // 3. NW approach: Player at tile (2, 3) moving LEFT + UP around pillar top-right corner
  sim.player.setPosition(140, 95);
  sim.inputs = { left: true, right: false, up: true, down: false, timeX: 1, timeY: 2 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `NW approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.y <= 60.1, 'NW approach successfully rounded corner into row 1 corridor at 450 px/s');

  // 4. SW approach: Player at tile (2, 3) moving LEFT + DOWN around pillar bottom-right corner
  sim.player.setPosition(140, 105);
  sim.inputs = { left: true, right: false, up: false, down: true, timeX: 1, timeY: 2 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `SW approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.y >= 139.9, 'SW approach successfully rounded corner into row 3 corridor at 450 px/s');
});

test('CORNER-450-02: Orthogonal Vertical Pillar Rounding (Down & Up) at 450 px/s', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);

  // 1. Moving Down + Left around pillar top-left corner
  sim.player.setPosition(95, 60);
  sim.inputs = { left: true, right: false, up: false, down: true, timeX: 2, timeY: 1 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Down-Left approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.x <= 60.1, 'Down-Left approach cleanly reached col 1 corridor at 450 px/s');

  // 2. Moving Down + Right around pillar top-right corner
  sim.player.setPosition(105, 60);
  sim.inputs = { left: false, right: true, up: false, down: true, timeX: 2, timeY: 1 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Down-Right approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.x >= 139.9, 'Down-Right approach cleanly reached col 3 corridor at 450 px/s');

  // 3. Moving Up + Left around pillar bottom-left corner
  sim.player.setPosition(95, 140);
  sim.inputs = { left: true, right: false, up: true, down: false, timeX: 2, timeY: 1 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Up-Left approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.x <= 60.1, 'Up-Left approach cleanly reached col 1 corridor at 450 px/s');

  // 4. Moving Up + Right around pillar bottom-right corner
  sim.player.setPosition(105, 140);
  sim.inputs = { left: false, right: true, up: true, down: false, timeX: 2, timeY: 1 };
  for (let f = 0; f < 30; f++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Up-Right approach at 450 px/s had penetration at frame ${f}`);
  }
  assert.ok(sim.player.x >= 139.9, 'Up-Right approach cleanly reached col 3 corridor at 450 px/s');
});

/* ==============================================================================
 * 5. TOLERANCE ZONE EXPANSIONS (8px, 11px, 14px) AT 450 PX/S
 * ============================================================================== */

test('TOLERANCE-450-01: Corner slide tolerance boundary engagement at 450 px/s', () => {
  const configs = [
    { tol: 8, testOffset: 7.5, inside: true },
    { tol: 8, testOffset: 8.5, inside: false },
    { tol: 11, testOffset: 10.5, inside: true },
    { tol: 11, testOffset: 11.5, inside: false },
    { tol: 14, testOffset: 13.5, inside: true },
    { tol: 14, testOffset: 14.5, inside: false },
  ];

  for (const tc of configs) {
    const sim = new PlayerPhysics450Simulator();
    sim.setTolerance(tc.tol);
    sim.setSpeed(450);

    // Player approaching pillar at (2, 2) from (2, 1) moving East. Center of (2, 1) is (60, 100).
    sim.player.setPosition(60, 100 + tc.testOffset);
    sim.inputs.right = true;

    sim.updateMovement(1 / 60);

    if (tc.inside) {
      assert.strictEqual(
        sim.player.body.velocity.y,
        450,
        `Tolerance ${tc.tol}px with offset ${tc.testOffset}px MUST engage downward slide at 450 px/s`
      );
    } else {
      assert.strictEqual(
        sim.player.body.velocity.y,
        0,
        `Tolerance ${tc.tol}px with offset ${tc.testOffset}px MUST NOT engage ghost slide velocity`
      );
    }
  }
});

/* ==============================================================================
 * 6. ZERO DEAD ZONE RESOLUTION & FLAT WALL SAFETY AT 450 PX/S
 * ============================================================================== */

test('DEADZONE-450-01: Zero dead zone resolves centered impact (diff === 0) at 450 px/s without snagging', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);

  // Perfectly centered approach: diffY = 0
  sim.player.setPosition(60, 100);
  sim.inputs.right = true;

  sim.updateMovement(1 / 60);

  // Both canRoundUp and canRoundDown are true -> defaults cleanly to -slideSpeed (-450)
  assert.strictEqual(sim.player.body.velocity.x, 450, 'Forward velocity maintained');
  assert.strictEqual(sim.player.body.velocity.y, -450, 'Zero dead zone cleanly defaults to upward rounding slide');
});

test('DEADWALL-450-01: Direct impact into flat dead-end wall at 450 px/s produces zero perpendicular velocity', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);

  // Player at (1, 1) moving Up into solid outer wall at row 0 (neither corner can round because row 0 is solid)
  sim.player.setPosition(60, 60);
  sim.inputs.up = true;

  sim.updateMovement(1 / 60);

  assert.strictEqual(sim.player.body.velocity.y, -450, 'Upward velocity toward wall');
  assert.strictEqual(sim.player.body.velocity.x, 0, 'Dead-end wall MUST produce zero perpendicular velocity');
});

/* ==============================================================================
 * 7. FRAMERATE VOLATILITY & DELTA LAG SPIKES AT 450 PX/S
 * ============================================================================== */

test('DELTA-450-01: Delta lag spikes (120, 60, 30, 20, 15 FPS) at 450 px/s maintain zero clipping & zero tunneling', () => {
  const deltaConfigs = [
    { fps: 120, dt: 1 / 120, frames: 60 },
    { fps: 60, dt: 1 / 60, frames: 30 },
    { fps: 30, dt: 1 / 30, frames: 15 },
    { fps: 20, dt: 1 / 20, frames: 10 },
    { fps: 15, dt: 1 / 15, frames: 8 }, // Severe 66.7ms lag spike!
  ];

  for (const { fps, dt, frames } of deltaConfigs) {
    const sim = new PlayerPhysics450Simulator();
    sim.setSpeed(450);

    // Diagonal approach towards pillar (2, 2) corner
    sim.player.setPosition(60, 95);
    sim.inputs = { left: false, right: true, up: true, down: false, timeX: 1, timeY: 2 };

    for (let f = 0; f < frames; f++) {
      sim.step(dt);
      const pen = sim.getPenetration();
      assert.strictEqual(
        pen.area,
        0,
        `FPS ${fps} (dt=${(dt * 1000).toFixed(1)}ms) at 450 px/s resulted in penetration at frame ${f}`
      );
    }

    assert.ok(
      sim.player.y <= 65,
      `FPS ${fps} successfully navigated corner into corridor at 450 px/s (final Y=${sim.player.y})`
    );
  }
});

/* ==============================================================================
 * 8. CONTINUOUS MULTI-LAP NAVIGATION AT 450 PX/S (100 LAPS / 400 CORNERS)
 * ============================================================================== */

test('MULTILAP-450-01: 100 Consecutive Laps (400 Corners) around Pillar at 450 px/s with Zero Snagging or Clipping', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);
  sim.player.setPosition(60, 60);

  let totalPenetrations = 0;

  for (let lap = 0; lap < 100; lap++) {
    // Leg 1: Move RIGHT from (1, 1) to (1, 3) [x: 60 -> 140]
    sim.inputs = { left: false, right: true, up: false, down: false, timeX: 1, timeY: 0 };
    let safety = 0;
    while (sim.player.x < 140 && safety++ < 100) {
      sim.step(1 / 60);
      if (sim.getPenetration().area > 0) totalPenetrations++;
    }
    assert.ok(safety < 100, `Lap ${lap} Leg 1 snagged! Pos: (${sim.player.x}, ${sim.player.y})`);

    // Leg 2: Move DOWN from (1, 3) to (3, 3) [y: 60 -> 140]
    sim.inputs = { left: false, right: false, up: false, down: true, timeX: 0, timeY: 1 };
    safety = 0;
    while (sim.player.y < 140 && safety++ < 100) {
      sim.step(1 / 60);
      if (sim.getPenetration().area > 0) totalPenetrations++;
    }
    assert.ok(safety < 100, `Lap ${lap} Leg 2 snagged! Pos: (${sim.player.x}, ${sim.player.y})`);

    // Leg 3: Move LEFT from (3, 3) to (3, 1) [x: 140 -> 60]
    sim.inputs = { left: true, right: false, up: false, down: false, timeX: 1, timeY: 0 };
    safety = 0;
    while (sim.player.x > 60 && safety++ < 100) {
      sim.step(1 / 60);
      if (sim.getPenetration().area > 0) totalPenetrations++;
    }
    assert.ok(safety < 100, `Lap ${lap} Leg 3 snagged! Pos: (${sim.player.x}, ${sim.player.y})`);

    // Leg 4: Move UP from (3, 1) to (1, 1) [y: 140 -> 60]
    sim.inputs = { left: false, right: false, up: true, down: false, timeX: 0, timeY: 1 };
    safety = 0;
    while (sim.player.y > 60 && safety++ < 100) {
      sim.step(1 / 60);
      if (sim.getPenetration().area > 0) totalPenetrations++;
    }
    assert.ok(safety < 100, `Lap ${lap} Leg 4 snagged! Pos: (${sim.player.x}, ${sim.player.y})`);
  }

  assert.strictEqual(totalPenetrations, 0, `100 Laps at 450 px/s produced ${totalPenetrations} wall penetrations`);
});

/* ==============================================================================
 * 9. S-BEND & CHICANE WEAVING AT 450 PX/S
 * ============================================================================== */

test('CHICANE-450-01: Rapid Chicane / S-Bend Weaving at 450 px/s maintains momentum and zero clipping', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);
  sim.player.setPosition(60, 60);

  // Navigate through chicane / S-bend around pillar (2, 2) at 450 px/s:
  // Phase 1: Move DOWN towards row 3 through (2, 1)
  sim.inputs = { left: false, right: false, up: false, down: true, timeX: 0, timeY: 1 };
  let safety1 = 0;
  while (sim.player.y < 140 && safety1++ < 60) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0, 'Leg 1 down: 0 penetration');
  }
  assert.ok(safety1 < 60, 'Leg 1 down reached row 3 without snagging');
  assert.ok(sim.player.y >= 140, 'Reached row 3 corridor');

  // Phase 2: Corner turn RIGHT into row 3 towards (3, 3)
  sim.inputs = { left: false, right: true, up: false, down: false, timeX: 2, timeY: 1 };
  let safety2 = 0;
  while (sim.player.x < 140 && safety2++ < 60) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0, 'Leg 2 right: 0 penetration');
  }
  assert.ok(safety2 < 60, 'Leg 2 right reached col 3 without snagging');
  assert.ok(sim.player.x >= 140, 'Reached col 3 corridor');

  // Phase 3: Corner turn UP towards (1, 3)
  sim.inputs = { left: false, right: false, up: true, down: false, timeX: 2, timeY: 3 };
  let safety3 = 0;
  while (sim.player.y > 60 && safety3++ < 60) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0, 'Leg 3 up: 0 penetration');
  }
  assert.ok(safety3 < 60, 'Leg 3 up reached row 1 without snagging');
  assert.ok(sim.player.y <= 60, 'Successfully completed 450 px/s chicane around pillar (2, 2)');
});

/* ==============================================================================
 * 10. CONTINUOUS 10,000-FRAME CHAOTIC SOAK TEST AT MAXIMUM 450 PX/S
 * ============================================================================== */

test('SOAK-450-01: 10,000-Frame Chaotic Soak Test across Entire Arena at 450 px/s', () => {
  const sim = new PlayerPhysics450Simulator();
  sim.setSpeed(450);
  sim.player.setPosition(60, 60);

  let seed = 123456789;
  function prng() {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  }

  const dirs = [
    { left: true, right: false, up: false, down: false },
    { left: false, right: true, up: false, down: false },
    { left: false, right: false, up: true, down: false },
    { left: false, right: false, up: false, down: true },
    { left: true, right: false, up: true, down: false },
    { left: true, right: false, up: false, down: true },
    { left: false, right: true, up: true, down: false },
    { left: false, right: true, up: false, down: true },
  ];

  let currentDir = dirs[1];
  let dirTicks = 0;

  for (let frame = 0; frame < 10000; frame++) {
    if (dirTicks <= 0) {
      const idx = Math.floor(prng() * dirs.length);
      currentDir = dirs[idx];
      dirTicks = 8 + Math.floor(prng() * 25);
      sim.inputs = { ...currentDir, timeX: frame, timeY: frame + 1 };
    }
    dirTicks--;

    sim.step(1 / 60);

    const pen = sim.getPenetration();
    assert.strictEqual(
      pen.area,
      0,
      `10k Soak Violation: Penetration area ${pen.area} at frame ${frame} (pos: ${sim.player.x.toFixed(2)}, ${sim.player.y.toFixed(2)})`
    );

    // Sanity checks: coordinates must remain finite and within arena boundaries
    assert.ok(Number.isFinite(sim.player.x), `Frame ${frame}: Non-finite X coordinate`);
    assert.ok(Number.isFinite(sim.player.y), `Frame ${frame}: Non-finite Y coordinate`);
    assert.ok(sim.player.x >= 52 && sim.player.x <= 548, `Frame ${frame}: Player breached X bounds (${sim.player.x})`);
    assert.ok(sim.player.y >= 52 && sim.player.y <= 468, `Frame ${frame}: Player breached Y bounds (${sim.player.y})`);
  }
});
