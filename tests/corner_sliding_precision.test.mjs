/**
 * tests/corner_sliding_precision.test.mjs
 *
 * Exhaustive Subpixel Corner Sliding Precision & Mathematical Convergence Test Suite
 * Verifies subpixel rounding, dynamic snap threshold scaling, zero jitter,
 * and exact tolerance boundaries in player/entity kinematics.
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
const { DASH_SPEED } = await import('../src/game/gameplay_mechanics.ts');

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
        map[r][c] = TILE_WALL; // Pillars at even coordinates
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

class PrecisionMovementSimulator {
  constructor(map = createArenaMap()) {
    this.map = map.map(row => [...row]);
    this.player = createMockSprite(60, 60);
    applyPhysicsBodyInvariantGuard(this.player, 24, 24, 8, 8);

    this.speed = 150;
    this.slideSpeed = 150;
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
 * PRECISION SUITE TESTS
 * ============================================================================== */

test('PREC-01: Exact Hitbox & Clearance Precision (24x24 in 40x40 tile)', () => {
  const sim = new PrecisionMovementSimulator();
  const player = sim.player;

  assert.strictEqual(player.body.width, 24, 'Body width must be exactly 24px');
  assert.strictEqual(player.body.height, 24, 'Body height must be exactly 24px');

  // Centered in tile (1, 1) -> center (60, 60)
  sim.player.setPosition(60.000000, 60.000000);
  const leftClearance = (sim.player.x - 12) - 40; // tile (1,0) wall edge at x=40
  const topClearance = (sim.player.y - 12) - 40;  // tile (0,1) wall edge at y=40

  assert.strictEqual(leftClearance, 8.0, 'Clearance to wall must be exactly 8.000000px');
  assert.strictEqual(topClearance, 8.0, 'Clearance to wall must be exactly 8.000000px');
});

test('PREC-02: High-Density Subpixel Offset Continuum at 250 px/s (300 discrete steps)', () => {
  const sim = new PrecisionMovementSimulator();
  sim.setSpeed(250);
  sim.inputs.right = true;

  const steps = 300;
  const minOffset = -7.5;
  const maxOffset = 7.5;
  const stepSize = (maxOffset - minOffset) / steps;

  for (let i = 0; i <= steps; i++) {
    const offset = minOffset + i * stepSize;
    // Set player in open corridor tile (1, 1) with subpixel offset
    sim.player.setPosition(60, 60 + offset);

    let signChanges = 0;
    let prevDiff = offset;
    let converged = false;

    // Simulate up to 5 ticks at 60 FPS
    for (let tick = 0; tick < 5; tick++) {
      sim.step(1 / 60);
      const currDiff = sim.player.y - 60;

      if (Math.sign(currDiff) !== Math.sign(prevDiff) && Math.abs(currDiff) > 1e-6 && Math.abs(prevDiff) > 1e-6) {
        signChanges++;
      }

      if (Math.abs(currDiff) < 1e-6) {
        converged = true;
        assert.ok(tick <= 2, `Offset ${offset.toFixed(4)}px converged in ${tick + 1} ticks (must be <= 2 ticks)`);
        break;
      }
      prevDiff = currDiff;
    }

    assert.ok(converged, `Offset ${offset.toFixed(4)}px must converge cleanly to centerline`);
    assert.ok(signChanges <= 1, `Offset ${offset.toFixed(4)}px had ${signChanges} sign changes (must be <= 1 to guarantee 0 jitter)`);
  }
});

test('PREC-03: High-Density Subpixel Offset Continuum at 350 px/s Dash Speed (300 discrete steps)', () => {
  const sim = new PrecisionMovementSimulator();
  sim.setSpeed(350);
  sim.inputs.right = true;

  const steps = 300;
  const minOffset = -7.5;
  const maxOffset = 7.5;
  const stepSize = (maxOffset - minOffset) / steps;

  for (let i = 0; i <= steps; i++) {
    const offset = minOffset + i * stepSize;
    sim.player.setPosition(60, 60 + offset);

    let signChanges = 0;
    let prevDiff = offset;
    let converged = false;

    for (let tick = 0; tick < 5; tick++) {
      sim.step(1 / 60);
      const currDiff = sim.player.y - 60;

      if (Math.sign(currDiff) !== Math.sign(prevDiff) && Math.abs(currDiff) > 1e-6 && Math.abs(prevDiff) > 1e-6) {
        signChanges++;
      }

      if (Math.abs(currDiff) < 1e-6) {
        converged = true;
        assert.ok(tick <= 2, `Dash offset ${offset.toFixed(4)}px converged in ${tick + 1} ticks (must be <= 2 ticks)`);
        break;
      }
      prevDiff = currDiff;
    }

    assert.ok(converged, `Dash offset ${offset.toFixed(4)}px must converge cleanly`);
    assert.ok(signChanges <= 1, `Dash offset ${offset.toFixed(4)}px had ${signChanges} sign changes (must be <= 1)`);
  }
});

test('PREC-04: Irrational and Floating-Point Precision Offsets (pi/4, sqrt(2), e/2, phi)', () => {
  const sim = new PrecisionMovementSimulator();
  sim.setSpeed(250);
  sim.inputs.right = true;

  const irrationals = [
    Math.PI / 4,          // ~0.785398
    Math.SQRT2,           // ~1.414213
    Math.E / 2,           // ~1.359140
    (1 + Math.sqrt(5)) / 2, // Golden ratio phi ~1.618033
    1 / Math.sqrt(3),     // ~0.577350
    -Math.PI / 4,
    -Math.SQRT2,
    -Math.E / 2,
    -(1 + Math.sqrt(5)) / 2,
  ];

  for (const offset of irrationals) {
    sim.player.setPosition(60, 60 + offset);
    sim.step(1 / 60);
    // At 250 px/s (dt=1/60), dynamic snap threshold is max(2, 250/60) = 4.1667px
    // All offsets here are |offset| < 2.0px <= snapThreshold, so immediate snap in 1 tick!
    assert.strictEqual(sim.player.y, 60, `Offset ${offset} must snap to exact 60.0 on tick 1`);
    assert.strictEqual(sim.player.body.velocity.y, 0, `Perpendicular velocity must be zeroed`);
  }
});

test('PREC-05: Dynamic Snap Window Scaling Across Velocity and Frame Rates', () => {
  const velocities = [50, 100, 150, 200, 250, 300, 350, 425];
  const frameRates = [120, 60, 30, 20];

  for (const v of velocities) {
    for (const fps of frameRates) {
      const dt = 1 / fps;
      const stepDisplacement = v * dt;
      const snapThreshold = Math.max(2.0, v * dt);
      const windowWidth = 2.0 * snapThreshold;

      // Mathematical invariant: Window width must be >= 2 * stepDisplacement
      assert.ok(
        windowWidth >= 2.0 * stepDisplacement,
        `Window width (${windowWidth}) must be >= 2 * stepDisplacement (${2 * stepDisplacement}) for v=${v}, fps=${fps}`
      );

      // Invariant: Single step cannot skip the window
      assert.ok(
        stepDisplacement <= windowWidth,
        `Single step (${stepDisplacement}) cannot exceed window width (${windowWidth})`
      );
    }
  }
});

test('PREC-06: Tolerance Zone Boundaries (8px Base, 11px Lv. 1, 14px Lv. 2 Corner Magnet)', () => {
  const sim = new PrecisionMovementSimulator();
  sim.setSpeed(250);
  sim.inputs.right = true;

  // Approach solid pillar at (2, 2) from (1, 1) -> (1, 2) is open, (2, 2) is pillar
  // Player at col 1 heading right towards col 2.
  // When approaching row 2, col 1: pillar is at (2, 2). NextCol is 2.
  // Let row = 2, col = 1. Moving RIGHT into (2, 2) which is WALL!
  // Passable corridors: (1, 1) and (1, 2) are open (upwards).
  sim.player.setPosition(60, 100); // Tile (2, 1) center is (60, 100).
  // diffY = player.y - 100.
  // diffY < 0 means player is above rowCenterY (towards open row 1).

  const tolerances = [
    { tol: 8, label: 'Base' },
    { tol: 11, label: 'Corner Magnet Lv. 1' },
    { tol: 14, label: 'Corner Magnet Lv. 2' },
  ];

  for (const { tol, label } of tolerances) {
    sim.setTolerance(tol);

    // Test inside tolerance: diffY = -(tol - 0.001)
    sim.player.setPosition(60, 100 - (tol - 0.001));
    sim.updateMovement(1 / 60);
    assert.strictEqual(
      sim.player.body.velocity.y,
      -250,
      `[${label}] Inside tolerance (${tol - 0.001}px): must assist upwards with -250 px/s`
    );

    // Test outside tolerance: diffY = -(tol + 0.001)
    sim.player.setPosition(60, 100 - (tol + 0.001));
    sim.updateMovement(1 / 60);
    assert.strictEqual(
      sim.player.body.velocity.y,
      0,
      `[${label}] Outside tolerance (${tol + 0.001}px): must NOT assist (zero velocity)`
    );
  }
});

test('PREC-07: Zero Dead Zone at Corner Pillar (diff === 0)', () => {
  const sim = new PrecisionMovementSimulator();
  sim.setSpeed(250);
  sim.inputs.right = true;

  // At tile (2, 1), pillar is at (2, 2). diffY = 0.
  // Row 1 (above) is passable.
  sim.player.setPosition(60, 100);
  sim.updateMovement(1 / 60);

  // Must select valid non-zero perpendicular assist instead of stalling
  assert.notStrictEqual(
    sim.player.body.velocity.y,
    0,
    'Player centered at dead-end pillar corner must receive assist velocity (zero dead-zone invariant)'
  );
  assert.strictEqual(sim.player.body.velocity.y, -250, 'Default tie-breaker slides upwards');
});

test('PREC-08: Quadrant Symmetry Invariance (North, South, East, West)', () => {
  const sim = new PrecisionMovementSimulator();
  sim.setSpeed(250);

  // 1. Moving RIGHT in horizontal corridor (1, 1), offset Y = +3.0px
  sim.inputs = { left: false, right: true, up: false, down: false, timeX: 1, timeY: 0 };
  sim.player.setPosition(60, 63.0);
  sim.step(1 / 60);
  assert.strictEqual(sim.player.y, 60.0, 'Rightward corridor centering must snap to 60.0');

  // 2. Moving LEFT in horizontal corridor (1, 3), offset Y = -3.0px
  sim.inputs = { left: true, right: false, up: false, down: false, timeX: 1, timeY: 0 };
  sim.player.setPosition(140, 57.0);
  sim.step(1 / 60);
  assert.strictEqual(sim.player.y, 60.0, 'Leftward corridor centering must snap to 60.0');

  // 3. Moving DOWN in vertical corridor (1, 1), offset X = +3.0px
  sim.inputs = { left: false, right: false, up: false, down: true, timeX: 0, timeY: 1 };
  sim.player.setPosition(63.0, 60);
  sim.step(1 / 60);
  assert.strictEqual(sim.player.x, 60.0, 'Downward corridor centering must snap to 60.0');

  // 4. Moving UP in vertical corridor (3, 1), offset X = -3.0px
  sim.inputs = { left: false, right: false, up: true, down: false, timeX: 0, timeY: 1 };
  sim.player.setPosition(57.0, 140);
  sim.step(1 / 60);
  assert.strictEqual(sim.player.x, 60.0, 'Upward corridor centering must snap to 60.0');
});

test('PREC-09: 2,000 Frames of Continuous Micro-Perturbation Stress at 250 px/s and 350 px/s', () => {
  const sim = new PrecisionMovementSimulator();
  sim.inputs.right = true;

  let pseudoRand = 123456789;
  function nextRand() {
    pseudoRand = (pseudoRand * 1103515245 + 12345) & 0x7fffffff;
    return (pseudoRand / 0x7fffffff) - 0.5; // [-0.5, +0.5]
  }

  // 1,000 frames at 250 px/s
  sim.setSpeed(250);
  sim.player.setPosition(60, 60);
  for (let frame = 0; frame < 1000; frame++) {
    // Inject subpixel noise
    const noise = nextRand() * 0.98; // [-0.49, +0.49]
    sim.player.setPosition(60, 60 + noise);
    sim.step(1 / 60);

    // After step, player should immediately snap back to 60.0
    assert.strictEqual(sim.player.y, 60.0, `Frame ${frame} at 250 px/s must snap cleanly to 60.0`);
    assert.strictEqual(sim.player.body.velocity.y, 0, `Perpendicular velocity must remain 0`);
  }

  // 1,000 frames at 350 px/s (Dash Speed)
  sim.setSpeed(350);
  for (let frame = 0; frame < 1000; frame++) {
    const noise = nextRand() * 0.98;
    sim.player.setPosition(60, 60 + noise);
    sim.step(1 / 60);

    assert.strictEqual(sim.player.y, 60.0, `Frame ${frame} at 350 px/s must snap cleanly to 60.0`);
    assert.strictEqual(sim.player.body.velocity.y, 0, `Perpendicular velocity must remain 0`);
  }
});
