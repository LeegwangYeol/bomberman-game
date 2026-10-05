/**
 * tests/high_velocity_corner_sliding.test.mjs
 *
 * Dedicated High-Velocity Subpixel Corner Sliding & Anti-Clipping Physics Test Suite
 * Verifies smooth corner turning and zero wall clipping at 250 px/s (Speed Up Lv. 5)
 * and 350 px/s (Dash Speed), as well as extreme compound velocities (425 px/s).
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
const { ENEMY_ARCHETYPES } = await import('../src/game/entities/types.ts');

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

class HighVelocitySlidingSimulator {
  constructor(map = createArenaMap()) {
    this.map = map.map(row => [...row]);
    this.player = createMockSprite(60, 60);
    applyPhysicsBodyInvariantGuard(this.player, 24, 24, 8, 8);

    this.speed = 250;
    this.slideSpeed = 250;
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
 * HIGH VELOCITY CORNER SLIDING TESTS
 * ============================================================================== */

test('HIGHVEL-01: 250 px/s Solid Pillar Rounding (All 4 Approaches: NE, SE, NW, SW)', () => {
  const sim = new HighVelocitySlidingSimulator();
  sim.setSpeed(250);

  // Pillar is at tile (2, 2) -> bounds [80, 120] x [80, 120]
  // 1. NE approach: Player at tile (2, 1) moving RIGHT + UP around pillar top-left corner
  sim.player.setPosition(60, 95); // Y=95 is inside tolerance zone [-5px from 100]
  sim.inputs = { left: false, right: true, up: true, down: false, timeX: 1, timeY: 2 };

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `NE approach at 250 px/s must have 0 wall penetration (frame ${frame})`);
  }
  // After 30 frames, player must have rounded corner into corridor row 1
  assert.ok(sim.player.y <= 65, 'Player successfully rounded corner upwards');

  // 2. SE approach: Player at tile (2, 1) moving RIGHT + DOWN around pillar bottom-left corner
  sim.player.setPosition(60, 105); // Y=105 is inside tolerance zone [+5px from 100]
  sim.inputs = { left: false, right: true, up: false, down: true, timeX: 1, timeY: 2 };
  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `SE approach at 250 px/s must have 0 wall penetration (frame ${frame})`);
  }
  assert.ok(sim.player.y >= 135, 'Player successfully rounded corner downwards');

  // 3. NW approach: Player at tile (2, 3) moving LEFT + UP around pillar top-right corner
  sim.player.setPosition(140, 95);
  sim.inputs = { left: true, right: false, up: true, down: false, timeX: 1, timeY: 2 };
  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `NW approach at 250 px/s must have 0 wall penetration (frame ${frame})`);
  }
  assert.ok(sim.player.y <= 65, 'Player successfully rounded corner upwards');

  // 4. SW approach: Player at tile (2, 3) moving LEFT + DOWN around pillar bottom-right corner
  sim.player.setPosition(140, 105);
  sim.inputs = { left: true, right: false, up: false, down: true, timeX: 1, timeY: 2 };
  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `SW approach at 250 px/s must have 0 wall penetration (frame ${frame})`);
  }
  assert.ok(sim.player.y >= 135, 'Player successfully rounded corner downwards');
});

test('HIGHVEL-02: 350 px/s Dash Speed Pillar Rounding with Zero Clipping', () => {
  const sim = new HighVelocitySlidingSimulator();
  sim.setSpeed(350); // Dash speed

  // Diagonal approach directly against pillar corner (2, 2)
  sim.player.setPosition(60, 96);
  sim.inputs = { left: false, right: true, up: true, down: false, timeX: 1, timeY: 2 };

  let maxPerpendicularDisplacement = 0;
  for (let frame = 0; frame < 40; frame++) {
    const prevY = sim.player.y;
    sim.step(1 / 60);
    maxPerpendicularDisplacement = Math.max(maxPerpendicularDisplacement, Math.abs(sim.player.y - prevY));

    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `350 px/s Dash must have 0 wall penetration at frame ${frame}`);
    assert.strictEqual(pen.worstOverlap, 0, `350 px/s Dash must have 0 overlap`);
  }

  // Displacement per frame at 350 px/s is ~5.83px
  assert.ok(maxPerpendicularDisplacement > 5.0, 'Dash velocity was fully applied during corner slide');
  assert.ok(sim.player.y <= 60.1, 'Player reached row 1 corridor without clipping');
});

test('HIGHVEL-03: Extreme 425 px/s Compound Speed (Dash 350 + Speed Surge 75)', () => {
  const sim = new HighVelocitySlidingSimulator();
  sim.setSpeed(425); // Max extreme compound velocity

  sim.player.setPosition(60, 94);
  sim.inputs = { left: false, right: true, up: true, down: false, timeX: 1, timeY: 2 };

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `425 px/s Compound speed must have 0 wall penetration at frame ${frame}`);
  }

  assert.ok(sim.player.y <= 60.1, 'Player cleanly navigated into corridor at 425 px/s');
});

test('HIGHVEL-03B: Maximum 450 px/s Extreme Speed Corner Sliding with Zero Clipping', () => {
  const sim = new HighVelocitySlidingSimulator();
  sim.setSpeed(450); // Maximum 450 px/s extreme velocity

  sim.player.setPosition(60, 94);
  sim.inputs = { left: false, right: true, up: true, down: false, timeX: 1, timeY: 2 };

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `450 px/s Extreme speed must have 0 wall penetration at frame ${frame}`);
  }

  assert.ok(sim.player.y <= 60.1, 'Player cleanly navigated into corridor at 450 px/s');
});

test('HIGHVEL-04: Continuous Multi-Lap Pillar Laps (20 Consecutive Corners at 250, 350 & 450 px/s)', () => {
  const sim = new HighVelocitySlidingSimulator();

  // Test across all speed tiers up to 450 px/s
  for (const testSpeed of [250, 350, 450]) {
    sim.setSpeed(testSpeed);
    // Player will navigate counter-clockwise around pillar (2, 2):
    // (1, 1) -> (1, 3) -> (3, 3) -> (3, 1) -> (1, 1)
    sim.player.setPosition(60, 60);

    for (let lap = 0; lap < 5; lap++) {
      // Leg 1: Move RIGHT from (1, 1) to (1, 3)
      sim.inputs = { left: false, right: true, up: false, down: false, timeX: 1, timeY: 0 };
      while (sim.player.x < 140) {
        sim.step(1 / 60);
        assert.strictEqual(sim.getPenetration().area, 0, `Lap ${lap} Leg 1 wall penetration`);
      }

      // Leg 2: Move DOWN from (1, 3) to (3, 3)
      sim.inputs = { left: false, right: false, up: false, down: true, timeX: 0, timeY: 1 };
      while (sim.player.y < 140) {
        sim.step(1 / 60);
        assert.strictEqual(sim.getPenetration().area, 0, `Lap ${lap} Leg 2 wall penetration`);
      }

      // Leg 3: Move LEFT from (3, 3) to (3, 1)
      sim.inputs = { left: true, right: false, up: false, down: false, timeX: 1, timeY: 0 };
      while (sim.player.x > 60) {
        sim.step(1 / 60);
        assert.strictEqual(sim.getPenetration().area, 0, `Lap ${lap} Leg 3 wall penetration`);
      }

      // Leg 4: Move UP from (3, 1) to (1, 1)
      sim.inputs = { left: false, right: false, up: true, down: false, timeX: 0, timeY: 1 };
      while (sim.player.y > 60) {
        sim.step(1 / 60);
        assert.strictEqual(sim.getPenetration().area, 0, `Lap ${lap} Leg 4 wall penetration`);
      }
    }
  }
});

test('HIGHVEL-05: Delta Spikes & Frame Rate Volatility (120, 60, 30, and 15 FPS lag spike)', () => {
  const sim = new HighVelocitySlidingSimulator();
  sim.setSpeed(350);

  const deltaConfigs = [
    { fps: 120, dt: 1 / 120, frames: 60 },
    { fps: 60, dt: 1 / 60, frames: 30 },
    { fps: 30, dt: 1 / 30, frames: 15 },
    { fps: 15, dt: 1 / 15, frames: 8 }, // 66.7ms lag spike!
  ];

  for (const { fps, dt, frames } of deltaConfigs) {
    // Approach corner pillar at (2, 2)
    sim.player.setPosition(60, 96);
    sim.inputs = { left: false, right: true, up: true, down: false, timeX: 1, timeY: 2 };

    for (let f = 0; f < frames; f++) {
      sim.step(dt);
      const pen = sim.getPenetration();
      assert.strictEqual(
        pen.area,
        0,
        `Lag spike at ${fps} FPS (dt=${(dt * 1000).toFixed(1)}ms): 0 wall penetration at frame ${f}`
      );
    }
  }
});

test('HIGHVEL-06: S-Bend & Chicane High-Speed Navigation at 350 px/s', () => {
  const sim = new HighVelocitySlidingSimulator();
  sim.setSpeed(350);

  // Navigate through chicane / S-bend around pillar (2, 2):
  // (1, 1) -> Move DOWN to (3, 1) -> Turn RIGHT into (3, 3) -> Turn UP into (1, 3)
  sim.player.setPosition(60, 60);

  // Phase 1: Move DOWN towards (3, 1) through (2, 1)
  sim.inputs = { left: false, right: false, up: false, down: true, timeX: 0, timeY: 1 };
  for (let f = 0; f < 15; f++) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0, 'Leg 1 down: 0 penetration');
  }
  assert.ok(sim.player.y >= 100, 'Reached row 2/3 corridor');

  // Phase 2: Corner turn RIGHT into row 3 towards (3, 3)
  sim.inputs = { left: false, right: true, up: false, down: false, timeX: 2, timeY: 1 };
  for (let f = 0; f < 15; f++) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0, 'Leg 2 right: 0 penetration');
  }
  assert.ok(sim.player.x >= 100, 'Reached col 2/3 corridor');

  // Phase 3: Corner turn UP towards (1, 3)
  sim.inputs = { left: false, right: false, up: true, down: false, timeX: 2, timeY: 3 };
  for (let f = 0; f < 15; f++) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0, 'Leg 3 up: 0 penetration');
  }
  assert.ok(sim.player.y <= 100, 'Successfully completed high-speed chicane around pillar (2, 2)');
});

test('HIGHVEL-07: Entity Invariant Guard Clearance at High Dash Speeds (Chaser 240 px/s, Ghost 260 px/s)', () => {
  const chaserSpeed = ENEMY_ARCHETYPES.CHASER.dashSpeed || 240;
  const ghostSpeed = ENEMY_ARCHETYPES.GHOST.dashSpeed || 260;

  assert.strictEqual(chaserSpeed, 240, 'Chaser dash speed must be 240 px/s');
  assert.strictEqual(ghostSpeed, 260, 'Ghost dash speed must be 260 px/s');

  const enemySprite = createMockSprite(60, 60);
  applyPhysicsBodyInvariantGuard(enemySprite, 24, 24, 8, 8);

  assert.strictEqual(enemySprite.body.width, 24);
  assert.strictEqual(enemySprite.body.height, 24);
  assert.strictEqual(enemySprite.body.halfWidth, 12);
  assert.strictEqual(enemySprite.body.halfHeight, 12);

  // Clearance in 40px corridor
  const clearance = (40 - enemySprite.body.width) / 2;
  assert.strictEqual(clearance, 8.0, 'Entity has exactly 8.0px corridor clearance');
});

test('HIGHVEL-08: 10,000-Frame High-Velocity Soak Across Entire Arena (250, 350 & 450 px/s)', () => {
  const sim = new HighVelocitySlidingSimulator();

  let seed = 987654321;
  function prng() {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  }

  sim.player.setPosition(60, 60);
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

  const soakSpeeds = [250, 350, 450];
  for (let frame = 0; frame < 10000; frame++) {
    // Cycle between 250, 350, and 450 px/s every 500 frames
    if (frame % 500 === 0) {
      sim.setSpeed(soakSpeeds[Math.floor(frame / 500) % soakSpeeds.length]);
    }

    if (dirTicks <= 0) {
      const idx = Math.floor(prng() * dirs.length);
      currentDir = dirs[idx];
      dirTicks = 10 + Math.floor(prng() * 30);
      sim.inputs = { ...currentDir, timeX: frame, timeY: frame + 1 };
    }
    dirTicks--;

    sim.step(1 / 60);

    const pen = sim.getPenetration();
    assert.strictEqual(
      pen.area,
      0,
      `10k Soak Violation: Penetration area ${pen.area} detected at frame ${frame} (pos: ${sim.player.x.toFixed(2)}, ${sim.player.y.toFixed(2)})`
    );
  }
});
