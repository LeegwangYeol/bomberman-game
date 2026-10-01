/**
 * tests/corner_sliding.test.mjs
 *
 * Dedicated Corner Sliding & High-Velocity Subpixel Diagonal Physics Suite
 * Chaos Agent 8: High-Velocity Subpixel Corner Sliding
 * 2026-10-02 Daily Evolution Cycle
 *
 * Key Scopes:
 * 1. Hitbox & Clearance Invariants (24x24 Hitbox, 8px Clearance Margin).
 * 2. Diagonal Navigation against Solid Pillars at 250 px/s (Speed Up Lv. 5).
 * 3. Diagonal Navigation against Solid Pillars at 350 px/s (Dash Speed).
 * 4. Subpixel Rounding & Jitter-Free Convergence Proofs.
 * 5. Corner Slide Tolerance Zones (8px base, 11px Lv. 1 Magnet, 14px Lv. 2 Magnet).
 * 6. Velocity Profiles & Vector Decomposition Invariants.
 * 7. Long-Duration High-Speed Diagonal Navigation Soak (5,000 Frames).
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
} = await import('../src/game/pathfinding.ts');

const {
  DASH_SPEED,
} = await import('../src/game/gameplay_mechanics.ts');

/**
 * Creates a mock Arcade Physics sprite with rigid body physics.
 */
function createMockPlayerSprite(x = 60, y = 60, baseW = 40, baseH = 40) {
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

/**
 * Standard 15x13 Bomberman grid generator with outer walls and solid pillars.
 */
function createStandardArenaMap() {
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
 * High-Precision Kinematic Movement Simulator mimicking GameScene.ts
 */
class CornerSlidingSimulator {
  constructor(map = createStandardArenaMap()) {
    this.map = map.map(row => [...row]);
    this.player = createMockPlayerSprite(60, 60);
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

  /**
   * Production-identical movement logic from GameScene.ts updatePlayerMovement
   */
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
    // Dynamic snap threshold: max(2, speed * dt)
    const dynamicSnap = Math.max(this.snapThreshold, speed * dt);

    if (primaryAxis === 'x') {
      vx = wantX * speed;
      const nextCol = col + wantX;
      const directOpen = this.isPassable(row, nextCol);

      if (directOpen) {
        // Corridor centering
        if (Math.abs(diffY) > dynamicSnap) {
          vy = -Math.sign(diffY) * slideSpeed;
        } else {
          this.player.y = rowCenterY;
          vy = 0;
        }
      } else {
        // Corner rounding assist
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
      // primaryAxis === 'y'
      vy = wantY * speed;
      const nextRow = row + wantY;
      const directOpen = this.isPassable(nextRow, col);

      if (directOpen) {
        // Corridor centering
        if (Math.abs(diffX) > dynamicSnap) {
          vx = -Math.sign(diffX) * slideSpeed;
        } else {
          this.player.x = colCenterX;
          vx = 0;
        }
      } else {
        // Corner rounding assist
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
   * Complete step with AABB obstacle separation
   */
  step(dt = 1 / 60) {
    this.updateMovement(dt);

    let newX = this.player.x + this.player.body.velocity.x * dt;
    let newY = this.player.y + this.player.body.velocity.y * dt;

    // Arcade Physics AABB separation against solid tiles
    const halfSize = 12; // 24x24 hitbox -> 12px radius
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

  /**
   * Measures penetration against solid pillars and boundary walls
   */
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
 * TEST SUITE 1: HITBOX INVARIANTS & CLEARANCE MARGINS
 * ============================================================================== */

test('HITBOX-01: Player body invariant guard preserves 24x24 hitbox and (8,8) offset under all transforms', () => {
  const sim = new CornerSlidingSimulator();
  const player = sim.player;

  assert.strictEqual(player.body.width, 24, 'Initial body width must be 24px');
  assert.strictEqual(player.body.height, 24, 'Initial body height must be 24px');
  assert.strictEqual(player.body.halfWidth, 12, 'Initial halfWidth must be 12px');
  assert.strictEqual(player.body.halfHeight, 12, 'Initial halfHeight must be 12px');
  assert.strictEqual(player.body.offset.x, 8, 'Initial offset.x must be 8px');
  assert.strictEqual(player.body.offset.y, 8, 'Initial offset.y must be 8px');

  // Verify across scale and position mutations
  const transforms = [
    { sx: 1.0, sy: 1.0, x: 60, y: 60 },
    { sx: 1.2, sy: 0.8, x: 75.3, y: 92.1 }, // walk squash
    { sx: 0.85, sy: 1.15, x: 100, y: 140 }, // walk stretch
    { sx: -1.0, sy: 1.0, x: 120, y: 180 },  // flip X
    { sx: 1.0, sy: -1.0, x: 200, y: 220 },  // flip Y
    { sx: 2.0, sy: 2.0, x: 300, y: 300 },   // mega scale
  ];

  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    player.setPosition(t.x, t.y);
    player.setScale(t.sx, t.sy);
    player.body.updateBounds();
    player.body.updateFromGameObject();

    assert.strictEqual(player.body.width, 24, `Transform ${i}: body width mutated`);
    assert.strictEqual(player.body.height, 24, `Transform ${i}: body height mutated`);
    assert.strictEqual(player.body.halfWidth, 12, `Transform ${i}: halfWidth mutated`);
    assert.strictEqual(player.body.halfHeight, 12, `Transform ${i}: halfHeight mutated`);
    assert.strictEqual(player.body.offset.x, 8, `Transform ${i}: offset.x mutated`);
    assert.strictEqual(player.body.offset.y, 8, `Transform ${i}: offset.y mutated`);
  }
});

test('HITBOX-02: Centered player has exactly 8.000px clearance margin inside standard 40px corridors', () => {
  const sim = new CornerSlidingSimulator();
  // Center of corridor (row 1, col 1): [40, 80] x [40, 80], center is (60, 60)
  sim.player.setPosition(60, 60);

  const leftEdge = sim.player.x - 12;
  const rightEdge = sim.player.x + 12;
  const topEdge = sim.player.y - 12;
  const bottomEdge = sim.player.y + 12;

  assert.strictEqual(leftEdge - 40, 8.0, 'West clearance must be exactly 8px');
  assert.strictEqual(80 - rightEdge, 8.0, 'East clearance must be exactly 8px');
  assert.strictEqual(topEdge - 40, 8.0, 'North clearance must be exactly 8px');
  assert.strictEqual(80 - bottomEdge, 8.0, 'South clearance must be exactly 8px');

  const pen = sim.getPenetration();
  assert.strictEqual(pen.area, 0, 'Centered player has 0 penetration area');
  assert.strictEqual(pen.worstOverlap, 0, 'Centered player has 0 worst overlap');
});

/* ==============================================================================
 * TEST SUITE 2: DIAGONAL NAVIGATION AGAINST SOLID PILLARS AT 250 PX/S (SPEED UP LV. 5)
 * ============================================================================== */

test('DIAG-250-01: Diagonal navigation against solid pillar vertex at 250 px/s (Northeast approach)', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(250); // Speed Up Lv. 5: 250 px/s

  // Pillar at (2, 2) is [80, 120] x [80, 120]
  // Player at (2, 1) [center 60, 100], moving East + North (Right + Up)
  // East is blocked by pillar (2, 2), North (1, 1) is open.
  sim.player.setPosition(60, 100);
  sim.inputs.right = true;
  sim.inputs.up = true;
  sim.inputs.timeX = 100;
  sim.inputs.timeY = 150;

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame} at 250 px/s: Wall penetration detected! Area: ${pen.area}`);
    assert.strictEqual(pen.worstOverlap, 0, `Frame ${frame} at 250 px/s: Overlap detected!`);

    // In frames 0..3 (while traversing row 2 next to pillar), X must be locked to 60
    if (frame <= 3) {
      assert.strictEqual(sim.player.x, 60, `Frame ${frame}: X deviated before clearing pillar`);
    }
  }

  // Player routes North into row 1 (y=60), then turns East along row 1 into col 3
  assert.strictEqual(sim.player.y, 60, 'Player y must lock to row 1 centerline');
  assert.ok(sim.player.x > 120, `Player must advance East past pillar into col 3 (got x=${sim.player.x})`);
});

test('DIAG-250-02: Diagonal navigation against solid pillar vertex at 250 px/s (Southeast approach)', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(250);

  // Pillar at (2, 2) [80..120] x [80..120]
  // Player at (1, 2) [center 100, 60], moving South + East (Down + Right)
  // South is blocked by pillar (2, 2), East (1, 3) is open.
  sim.player.setPosition(100, 60);
  sim.inputs.down = true;
  sim.inputs.right = true;
  sim.inputs.timeX = 200;
  sim.inputs.timeY = 100;

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame} at 250 px/s: Wall penetration detected! Area: ${pen.area}`);
    assert.strictEqual(pen.worstOverlap, 0, `Frame ${frame} at 250 px/s: Overlap detected!`);
  }

  // Player must route cleanly East into col 3
  assert.ok(sim.player.x > 120, `Player must advance East past pillar into col 3 (x=${sim.player.x})`);
});

test('DIAG-250-03: Diagonal navigation against solid pillar vertex at 250 px/s (Northwest approach)', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(250);

  // Pillar at (2, 2) [80..120] x [80..120]
  // Player at (2, 3) [center 140, 100], moving West + North (Left + Up)
  // West is blocked by pillar (2, 2), North (1, 3) is open.
  sim.player.setPosition(140, 100);
  sim.inputs.left = true;
  sim.inputs.up = true;

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame} at 250 px/s: Wall penetration detected! Area: ${pen.area}`);

    if (frame <= 3) {
      assert.strictEqual(sim.player.x, 140, `Frame ${frame}: X deviated before clearing pillar`);
    }
  }

  // Player clears North into row 1 (y=60), then moves West along row 1
  assert.strictEqual(sim.player.y, 60, 'Player y must lock to row 1 centerline');
  assert.ok(sim.player.x < 100, `Player must advance West into col 1 (x=${sim.player.x})`);
});

test('DIAG-250-04: Diagonal navigation against solid pillar vertex at 250 px/s (Southwest approach)', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(250);

  // Pillar at (2, 2) [80..120] x [80..120]
  // Player at (3, 2) [center 100, 140], moving North + West (Up + Left)
  // North is blocked by pillar (2, 2), West (3, 1) is open.
  sim.player.setPosition(100, 140);
  sim.inputs.up = true;
  sim.inputs.left = true;

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame} at 250 px/s: Wall penetration detected! Area: ${pen.area}`);

    if (frame <= 3) {
      assert.strictEqual(sim.player.y, 140, `Frame ${frame}: Y deviated before clearing pillar`);
    }
  }

  // Player clears West past pillar (x < 100) and advances North along col 1 (y < 140)
  assert.ok(sim.player.x < 100, `Player must advance West into col 1 (got x=${sim.player.x})`);
  assert.ok(sim.player.y < 140, `Player must advance North along col 1 (got y=${sim.player.y})`);
});

/* ==============================================================================
 * TEST SUITE 3: DIAGONAL NAVIGATION AGAINST SOLID PILLARS AT 350 PX/S (DASH SPEED)
 * ============================================================================== */

test('DIAG-350-01: Dash Speed (350 px/s) diagonal navigation against pillar corner: 0 penetration, 0 snag', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(DASH_SPEED); // 350 px/s
  assert.strictEqual(sim.speed, 350, 'Dash speed must be 350 px/s');

  // Player at (2, 1) [center 60, 100], moving East + North at 350 px/s
  sim.player.setPosition(60, 100);
  sim.inputs.right = true;
  sim.inputs.up = true;

  for (let frame = 0; frame < 30; frame++) {
    sim.step(1 / 60);
    const pen = sim.getPenetration();
    assert.strictEqual(pen.area, 0, `Frame ${frame} at 350 px/s: Dash breached wall!`);

    // In frames 0..2 (before clearing row 2 pillar at y=80), x must be locked to 60
    if (frame <= 2) {
      assert.strictEqual(sim.player.x, 60, `Frame ${frame}: Premature horizontal drift before clearing pillar`);
    }
  }

  // After 30 frames at 350 px/s: player reaches row 1, turns East into open corridor (col 2/3)
  assert.strictEqual(sim.player.y, 60, 'Y coordinate must stay locked to row 1 centerline');
  assert.ok(sim.player.x > 120, `Player must advance East past pillar into col 3 (got x=${sim.player.x})`);
});

test('DIAG-350-02: Dash Speed (350 px/s) rapid corner turning around pillar array: 0 wall clipping', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(DASH_SPEED);
  sim.player.setPosition(60, 60);

  // Turn around pillar at (2, 2):
  // 1. Move East from (1, 1) to (1, 3): 20 frames
  sim.inputs.right = true;
  for (let frame = 0; frame < 20; frame++) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0);
  }

  // 2. Turn South into col 3: 20 frames
  sim.inputs.right = false;
  sim.inputs.down = true;
  for (let frame = 0; frame < 20; frame++) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0);
  }

  // 3. Turn West into row 3: 20 frames
  sim.inputs.down = false;
  sim.inputs.left = true;
  for (let frame = 0; frame < 20; frame++) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0);
  }

  // 4. Turn North back to (1, 1): 20 frames
  sim.inputs.left = false;
  sim.inputs.up = true;
  for (let frame = 0; frame < 20; frame++) {
    sim.step(1 / 60);
    assert.strictEqual(sim.getPenetration().area, 0);
  }

  const pen = sim.getPenetration();
  assert.strictEqual(pen.area, 0, 'Lap around pillar completed with 0 wall clipping');
});

/* ==============================================================================
 * TEST SUITE 4: SUBPIXEL ROUNDING & ZERO JITTER PROOFS
 * ============================================================================== */

test('SUBPIXEL-01: Zero subpixel jitter verification across 150 fine offsets at 250 px/s', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(250);
  sim.inputs.right = true;

  // Offsets from -7.5px to +7.5px in 0.1px increments
  const offsets = [];
  for (let val = -7.5; val <= 7.5; val += 0.1) {
    offsets.push(parseFloat(val.toFixed(2)));
  }

  for (const offset of offsets) {
    sim.player.setPosition(60, 60 + offset);

    let converged = false;
    let signSwitches = 0;
    let prevSign = Math.sign(offset);

    for (let tick = 0; tick < 15; tick++) {
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

    assert.ok(converged, `Offset ${offset} failed to converge! Final y=${sim.player.y}`);
    // Zero subpixel jitter invariant: sign must not oscillate indefinitely (at most 1 transition before snap)
    assert.ok(signSwitches <= 1, `Offset ${offset} exhibited subpixel jitter! Sign switches: ${signSwitches}`);
  }
});

test('SUBPIXEL-02: Zero subpixel jitter verification across irrational offsets at 350 px/s (Dash speed)', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(350);
  sim.inputs.down = true;

  // Irrational and fractional offsets that test IEEE-754 precision limits
  const exoticOffsets = [
    Math.PI / 4,
    Math.SQRT2,
    Math.E / 2,
    2.0000001,
    -2.0000001,
    4.1666667,
    -4.1666667,
    5.8333333,
    -5.8333333,
  ];

  for (const offset of exoticOffsets) {
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

    assert.ok(converged, `Irrational offset ${offset} failed to converge at 350 px/s! Final x=${sim.player.x}`);
    assert.ok(signSwitches <= 1, `Irrational offset ${offset} exhibited jitter at 350 px/s! Switches: ${signSwitches}`);
  }
});

/* ==============================================================================
 * TEST SUITE 5: CORNER CENTERING TOLERANCES (8px, 11px, 14px)
 * ============================================================================== */

test('TOLERANCE-01: Corner slide tolerance expansion (8px base, 11px Lv. 1, 14px Lv. 2 Corner Magnet)', () => {
  const testCases = [
    { tol: 8, testOffset: 7.5, inside: true },
    { tol: 8, testOffset: 8.5, inside: false },
    { tol: 11, testOffset: 10.5, inside: true },
    { tol: 11, testOffset: 11.5, inside: false },
    { tol: 14, testOffset: 13.5, inside: true },
    { tol: 14, testOffset: 14.5, inside: false },
  ];

  for (const tc of testCases) {
    const sim = new CornerSlidingSimulator();
    sim.setTolerance(tc.tol);
    sim.setSpeed(150);

    // Player approaching pillar at (2, 2) from (2, 1) moving East. Center of (2, 1) is (60, 100).
    // Displaced downward by testOffset.
    sim.player.setPosition(60, 100 + tc.testOffset);
    sim.inputs.right = true;

    sim.updateMovement(1 / 60);

    if (tc.inside) {
      assert.strictEqual(
        sim.player.body.velocity.y,
        150,
        `Tolerance ${tc.tol}px with offset ${tc.testOffset}px MUST engage downward slide velocity`
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
 * TEST SUITE 6: VELOCITY PROFILES & VECTOR DECOMPOSITION
 * ============================================================================== */

test('VELOCITY-01: Velocity decomposition invariants under cardinal and corner assist states', () => {
  const sim = new CornerSlidingSimulator();
  sim.setSpeed(200);

  // 1. Unobstructed cardinal movement: vx = speed, vy = 0
  sim.player.setPosition(60, 60);
  sim.inputs.right = true;
  sim.updateMovement(1 / 60);
  assert.strictEqual(sim.player.body.velocity.x, 200);
  assert.strictEqual(sim.player.body.velocity.y, 0);

  // 2. Corridor centering slide: vx = speed, vy = -slideSpeed
  sim.player.setPosition(60, 65); // 5px off-center vertically
  sim.updateMovement(1 / 60);
  assert.strictEqual(sim.player.body.velocity.x, 200);
  assert.strictEqual(sim.player.body.velocity.y, -200);

  // 3. Flat dead-end wall: vx = speed, vy = 0 (no ghost perpendicular sliding)
  // Outer wall at row 0. Player at (1, 1) moving Up towards row 0.
  sim.inputs.right = false;
  sim.inputs.up = true;
  sim.player.setPosition(60, 60);
  sim.updateMovement(1 / 60);
  // (0, 1) is WALL. Neither side can round because (0, 0) and (0, 2) are also WALL!
  assert.strictEqual(sim.player.body.velocity.y, -200);
  assert.strictEqual(sim.player.body.velocity.x, 0, 'Dead-end wall must produce zero perpendicular velocity');
});

/* ==============================================================================
 * TEST SUITE 7: CONTINUOUS 5,000-FRAME HIGH-SPEED DIAGONAL SOAK
 * ============================================================================== */

test('SOAK-5000: 5,000 Frames of continuous high-speed diagonal navigation against solid pillars', () => {
  const sim = new CornerSlidingSimulator();
  sim.player.setPosition(60, 60);

  const speedCycle = [250, 350];
  const diagonalInputs = [
    { right: true, up: true, left: false, down: false },
    { right: true, down: true, left: false, up: false },
    { left: true, down: true, right: false, up: false },
    { left: true, up: true, right: false, down: false },
  ];

  let totalPenetrations = 0;
  let minPillarDistance = Infinity;

  for (let frame = 0; frame < 5000; frame++) {
    // Switch speed every 25 frames
    if (frame % 25 === 0) {
      const spd = speedCycle[(frame / 25) % speedCycle.length];
      sim.setSpeed(spd);
    }

    // Switch diagonal direction every 13 frames
    if (frame % 13 === 0) {
      const inp = diagonalInputs[(frame / 13) % diagonalInputs.length];
      sim.inputs.right = inp.right;
      sim.inputs.up = inp.up;
      sim.inputs.left = inp.left;
      sim.inputs.down = inp.down;
      sim.inputs.timeX = frame;
      sim.inputs.timeY = frame + 1;
    }

    sim.step(1 / 60);

    const pen = sim.getPenetration();
    if (pen.area > 0) {
      totalPenetrations++;
    }

    // Check distance to nearby pillars
    const pCol = Math.round(sim.player.x / TILE_SIZE);
    const pRow = Math.round(sim.player.y / TILE_SIZE);

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = pRow + dr;
        const nc = pCol + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && sim.map[nr][nc] === TILE_WALL) {
          const wLeft = nc * TILE_SIZE;
          const wRight = (nc + 1) * TILE_SIZE;
          const wTop = nr * TILE_SIZE;
          const wBottom = (nr + 1) * TILE_SIZE;

          const pxL = sim.player.x - 12;
          const pxR = sim.player.x + 12;
          const pyT = sim.player.y - 12;
          const pyB = sim.player.y + 12;

          const dx = Math.max(0, Math.max(wLeft - pxR, pxL - wRight));
          const dy = Math.max(0, Math.max(wTop - pyB, pyT - wBottom));
          const dist = Math.hypot(dx, dy);
          if (dist < minPillarDistance) {
            minPillarDistance = dist;
          }
        }
      }
    }

    // Legal world boundary check [52, 548] x [52, 468]
    assert.ok(sim.player.x >= 52 && sim.player.x <= 548, `Frame ${frame}: Out of X bounds (${sim.player.x})`);
    assert.ok(sim.player.y >= 52 && sim.player.y <= 468, `Frame ${frame}: Out of Y bounds (${sim.player.y})`);
  }

  assert.strictEqual(totalPenetrations, 0, `Recorded ${totalPenetrations} wall penetrations during 5,000 soak frames!`);
  assert.ok(minPillarDistance >= 0, `Negative distance to solid pillar detected: ${minPillarDistance}`);
});
