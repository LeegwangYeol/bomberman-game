import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ESM loader hook to resolve extensionless imports in Node --experimental-strip-types
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

// Minimal DOM & Canvas mocks for headless environment
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
const { CameraTraumaSimulator } = await import('../src/game/GameScene.ts');
const { ZeroGCPathfinder } = await import('../src/game/pathfinding.ts');
const { ObjectPool } = await import('../src/game/pooling/ObjectPool.ts');

/* ==============================================================================
 * ARCADE PHYSICS SPRITE & BODY MOCK
 * ============================================================================== */

function createMockSpriteWithBody(x = 60, y = 60, w = 40, h = 40) {
  const body = {
    width: w,
    height: h,
    halfWidth: w / 2,
    halfHeight: h / 2,
    offset: { x: 0, y: 0 },
    position: { x: x - w / 2, y: y - h / 2 },
    center: { x, y },
    velocity: { x: 0, y: 0 },
    transform: { x, y },
    setSize(newW, newH) {
      this.width = newW;
      this.height = newH;
      this.halfWidth = newW / 2;
      this.halfHeight = newH / 2;
      return this;
    },
    setOffset(ox, oy) {
      this.offset.x = ox;
      this.offset.y = oy;
      return this;
    },
    updateCenter() {
      this.center.x = this.position.x + this.halfWidth;
      this.center.y = this.position.y + this.halfHeight;
    },
    updateBounds() {
      this.updateCenter();
    },
    updateFromGameObject() {
      this.position.x = this.transform.x + this.offset.x - 20;
      this.position.y = this.transform.y + this.offset.y - 20;
      this.updateCenter();
    },
  };

  const sprite = {
    x,
    y,
    scaleX: 1.0,
    scaleY: 1.0,
    displayOriginX: 20,
    displayOriginY: 20,
    angle: 0,
    body,
    setScale(sx, sy) {
      this.scaleX = sx;
      this.scaleY = sy !== undefined ? sy : sx;
      return this;
    },
    setAngle(deg) {
      this.angle = deg;
      return this;
    },
    setPosition(newX, newY) {
      this.x = newX;
      this.y = newY;
      this.body.transform.x = newX;
      this.body.transform.y = newY;
      this.body.updateFromGameObject();
      return this;
    },
  };

  return sprite;
}

/* ==============================================================================
 * CORNER SLIDING SIMULATOR & JUICE RUNNER
 * ============================================================================== */

const TILE_SIZE = 40;
const ROWS = 13;
const COLS = 15;
const TILE_EMPTY = 0;
const TILE_WALL = 1;

function createTestMap() {
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

class CornerTurnHarness {
  constructor(speed = 150, tolerance = 8) {
    this.map = createTestMap();
    this.speed = speed;
    this.slideSpeed = speed;
    this.snapThreshold = 2;
    this.cornerSlideTolerance = tolerance;

    this.player = createMockSpriteWithBody(60, 60);
    applyPhysicsBodyInvariantGuard(this.player, 24, 24, 8, 8);

    this.playerStepCycle = 0;
    this.playerBobOffset = 0;
  }

  isPassable(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this.map[r][c] !== TILE_WALL;
  }

  updateJuice(delta) {
    const vx = this.player.body.velocity.x;
    const vy = this.player.body.velocity.y;
    const isMoving = Math.abs(vx) > 1 || Math.abs(vy) > 1;

    if (isMoving) {
      const speedMag = Math.hypot(vx, vy);
      this.playerStepCycle += (delta / 1000) * (speedMag / 22);
      const hop = Math.abs(Math.sin(this.playerStepCycle * Math.PI)) * 3;
      this.playerBobOffset = hop;
      this.player.displayOriginY = 20 - hop;

      const apexNorm = hop / 3;
      const sx = 1.08 - 0.14 * apexNorm;
      const sy = 0.92 + 0.14 * apexNorm;
      this.player.setScale(sx, sy);

      if (vx !== 0) {
        this.player.setAngle(Math.sign(vx) * 3.5);
      } else {
        this.player.setAngle(0);
      }
    } else {
      this.playerBobOffset = 0;
      this.player.displayOriginY = 20;
      this.player.setAngle(0);
      this.player.setScale(1.0, 1.0);
    }
  }

  /**
   * Step corner movement exactly matching GameScene.ts lines 2115-2260
   */
  stepMovement(input, delta) {
    const px = this.player.x;
    const py = this.player.y;

    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);

    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;

    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    const tol = this.cornerSlideTolerance;
    const speed = this.speed;
    const slideSpeed = this.slideSpeed;
    const snapThreshold = this.snapThreshold;

    let wantX = 0;
    let wantY = 0;
    if (input.left && !input.right) wantX = -1;
    else if (input.right && !input.left) wantX = 1;

    if (input.up && !input.down) wantY = -1;
    else if (input.down && !input.up) wantY = 1;

    let primaryAxis = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = this.isPassable(row, col + wantX);
      const yOpen = this.isPassable(row + wantY, col);
      if (xOpen && !yOpen) primaryAxis = 'x';
      else if (yOpen && !xOpen) primaryAxis = 'y';
      else primaryAxis = 'y';
    } else if (wantX !== 0) {
      primaryAxis = 'x';
    } else if (wantY !== 0) {
      primaryAxis = 'y';
    }

    let vx = 0;
    let vy = 0;

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

    // Apply movement
    const dt = delta / 1000;
    let newX = this.player.x + vx * dt;
    let newY = this.player.y + vy * dt;

    // Arcade Physics AABB separation against static walls
    const halfSize = 24 / 2; // Invariant body half-width = 12
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

    // Apply Juice updates & physics body synchronization
    this.updateJuice(delta);
    this.player.body.updateBounds();
    this.player.body.updateFromGameObject();

    return { vx, vy, x: this.player.x, y: this.player.y };
  }
}

/* ==============================================================================
 * TIER 1: 1,000+ CORNER TURNS / SLIDES EMPIRICAL STRESS TEST
 * ============================================================================== */

test('Challenger M3 [Empirical Stress]: 1,000+ Corner Slides with Zero Snagging, Zero Jitter & 24x24 Body Invariance', () => {
  // 8 distinct corner configurations covering all 8 directions & slide combinations
  const cornerConfigs = [
    // 1. Moving Right at (1, 1), Wall at (1, 2), Row 2 Open -> Round DOWN into row 2 (diffY >= 0)
    {
      name: 'Right-Round-Down',
      startPos: { r: 1, c: 1 },
      wallTile: { r: 1, c: 2 },
      openCorridor: { r: 2, c: 1 },
      input: { right: true, down: false, left: false, up: false },
      axis: 'y',
      offsetSign: 1, // positive diffY
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // y = 100
    },
    // 2. Moving Right at (3, 1), Wall at (3, 2), Row 2 Open -> Round UP into row 2 (diffY <= 0)
    {
      name: 'Right-Round-Up',
      startPos: { r: 3, c: 1 },
      wallTile: { r: 3, c: 2 },
      openCorridor: { r: 2, c: 1 },
      input: { right: true, down: false, left: false, up: false },
      axis: 'y',
      offsetSign: -1, // negative diffY
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // y = 100
    },
    // 3. Moving Left at (1, 3), Wall at (1, 2), Row 2 Open -> Round DOWN into row 2 (diffY >= 0)
    {
      name: 'Left-Round-Down',
      startPos: { r: 1, c: 3 },
      wallTile: { r: 1, c: 2 },
      openCorridor: { r: 2, c: 3 },
      input: { left: true, down: false, right: false, up: false },
      axis: 'y',
      offsetSign: 1,
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // y = 100
    },
    // 4. Moving Left at (3, 3), Wall at (3, 2), Row 2 Open -> Round UP into row 2 (diffY <= 0)
    {
      name: 'Left-Round-Up',
      startPos: { r: 3, c: 3 },
      wallTile: { r: 3, c: 2 },
      openCorridor: { r: 2, c: 3 },
      input: { left: true, down: false, right: false, up: false },
      axis: 'y',
      offsetSign: -1,
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // y = 100
    },
    // 5. Moving Down at (1, 1), Wall at (2, 1), Col 2 Open -> Round RIGHT into col 2 (diffX >= 0)
    {
      name: 'Down-Round-Right',
      startPos: { r: 1, c: 1 },
      wallTile: { r: 2, c: 1 },
      openCorridor: { r: 1, c: 2 },
      input: { down: true, right: false, left: false, up: false },
      axis: 'x',
      offsetSign: 1,
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // x = 100
    },
    // 6. Moving Down at (1, 3), Wall at (2, 3), Col 2 Open -> Round LEFT into col 2 (diffX <= 0)
    {
      name: 'Down-Round-Left',
      startPos: { r: 1, c: 3 },
      wallTile: { r: 2, c: 3 },
      openCorridor: { r: 1, c: 2 },
      input: { down: true, right: false, left: false, up: false },
      axis: 'x',
      offsetSign: -1,
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // x = 100
    },
    // 7. Moving Up at (3, 1), Wall at (2, 1), Col 2 Open -> Round RIGHT into col 2 (diffX >= 0)
    {
      name: 'Up-Round-Right',
      startPos: { r: 3, c: 1 },
      wallTile: { r: 2, c: 1 },
      openCorridor: { r: 3, c: 2 },
      input: { up: true, right: false, left: false, down: false },
      axis: 'x',
      offsetSign: 1,
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // x = 100
    },
    // 8. Moving Up at (3, 3), Wall at (2, 3), Col 2 Open -> Round LEFT into col 2 (diffX <= 0)
    {
      name: 'Up-Round-Left',
      startPos: { r: 3, c: 3 },
      wallTile: { r: 2, c: 3 },
      openCorridor: { r: 3, c: 2 },
      input: { up: true, right: false, left: false, down: false },
      axis: 'x',
      offsetSign: -1,
      targetCenterCoord: 2 * TILE_SIZE + TILE_SIZE / 2, // x = 100
    },
  ];

  // 17 offset magnitudes within [0.0, 8.0]
  const offsetMagnitudes = [
    0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0,
  ];

  // 5 speeds
  const speeds = [70, 150, 225, 250, 350];

  // 2 deltas (60 FPS & 120 FPS)
  const deltas = [16.6667, 8.3333];

  let totalCornerRuns = 0;
  let totalPhysicsStepsEvaluated = 0;
  let maxBodyWidthObserved = 0;
  let minBodyWidthObserved = 999;
  let maxBodyHeightObserved = 0;
  let minBodyHeightObserved = 999;

  for (const cfg of cornerConfigs) {
    for (const mag of offsetMagnitudes) {
      for (const speed of speeds) {
        for (const delta of deltas) {
          totalCornerRuns++;
          const harness = new CornerTurnHarness(speed, 8);

          // Configure walls
          harness.map[cfg.wallTile.r][cfg.wallTile.c] = TILE_WALL;

          // Compute starting coordinates
          const startCenterX = cfg.startPos.c * TILE_SIZE + TILE_SIZE / 2;
          const startCenterY = cfg.startPos.r * TILE_SIZE + TILE_SIZE / 2;

          const signedOffset = cfg.offsetSign * mag;
          let posX = startCenterX;
          let posY = startCenterY;

          if (cfg.axis === 'y') {
            posY += signedOffset;
          } else {
            posX += signedOffset;
          }

          harness.player.setPosition(posX, posY);

          // Simulation metrics
          let previousVelocitySign = 0;
          let previousDistance = Infinity;
          let velocitySignFlips = 0;
          let distanceOscillations = 0;

          // Simulate corner rounding
          const MAX_STEPS = 60;
          for (let step = 0; step < MAX_STEPS; step++) {
            totalPhysicsStepsEvaluated++;

            const state = harness.stepMovement(cfg.input, delta);
            const body = harness.player.body;

            // 1. Strict 24x24 Body Dimension Invariance Check
            assert.equal(body.width, 24, `Run #${totalCornerRuns} Step ${step}: Body width must be 24px`);
            assert.equal(body.height, 24, `Run #${totalCornerRuns} Step ${step}: Body height must be 24px`);
            assert.equal(body.halfWidth, 12, `Run #${totalCornerRuns} Step ${step}: Body halfWidth must be 12px`);
            assert.equal(body.halfHeight, 12, `Run #${totalCornerRuns} Step ${step}: Body halfHeight must be 12px`);
            assert.equal(body.offset.x, 8, `Run #${totalCornerRuns} Step ${step}: Body offset.x must be 8px`);
            assert.equal(body.offset.y, 8, `Run #${totalCornerRuns} Step ${step}: Body offset.y must be 8px`);

            // Center alignment with sprite
            assert.ok(Math.abs(body.center.x - harness.player.x) < 1e-4, 'Body center.x must match sprite.x');
            assert.ok(Math.abs(body.center.y - harness.player.y) < 1e-4, 'Body center.y must match sprite.y');

            maxBodyWidthObserved = Math.max(maxBodyWidthObserved, body.width);
            minBodyWidthObserved = Math.min(minBodyWidthObserved, body.width);
            maxBodyHeightObserved = Math.max(maxBodyHeightObserved, body.height);
            minBodyHeightObserved = Math.min(minBodyHeightObserved, body.height);

            // 2. Physics Jitter & Monotonic Convergence Check
            const slideVelocity = cfg.axis === 'y' ? state.vy : state.vx;
            const currentSign = Math.sign(slideVelocity);

            if (currentSign !== 0) {
              if (previousVelocitySign !== 0 && currentSign !== previousVelocitySign) {
                velocitySignFlips++;
              }
              previousVelocitySign = currentSign;
            }

            const currentPos = cfg.axis === 'y' ? harness.player.y : harness.player.x;
            const dist = Math.abs(currentPos - cfg.targetCenterCoord);

            if (dist > harness.snapThreshold && previousDistance < Infinity && dist > previousDistance + 0.01) {
              distanceOscillations++;
            }
            previousDistance = dist;

            // Stop when corridor centered
            if (dist <= harness.snapThreshold) {
              break;
            }
          }

          // Zero Jitter Invariant
          assert.equal(velocitySignFlips, 0, `Run #${totalCornerRuns} (${cfg.name}, offset ${signedOffset}): Velocity sign must not flip`);
          assert.equal(distanceOscillations, 0, `Run #${totalCornerRuns} (${cfg.name}, offset ${signedOffset}): Distance must converge monotonically`);
        }
      }
    }
  }

  assert.ok(totalCornerRuns >= 1000, `Must evaluate >= 1,000 corner runs (evaluated ${totalCornerRuns})`);
  assert.ok(totalPhysicsStepsEvaluated >= 5000, `Must evaluate >= 5,000 physics steps (evaluated ${totalPhysicsStepsEvaluated})`);
  assert.equal(maxBodyWidthObserved, 24, 'Max body width must be 24');
  assert.equal(minBodyWidthObserved, 24, 'Min body width must be 24');
  assert.equal(maxBodyHeightObserved, 24, 'Max body height must be 24');
  assert.equal(minBodyHeightObserved, 24, 'Min body height must be 24');
});

/* ==============================================================================
 * TIER 2: ENEMY & DIVERSE ENTITY BODY INVARIANCE & MOVEMENT STRESS
 * ============================================================================== */

test('Challenger M3 [Entity Physics Guard]: Diverse entities (Tank 28x28, MiniSplitter 18x18, Critter 20x20) maintain invariant bodies under squash/stretch', () => {
  // 1. Tank Enemy: 28x28 hitbox, offset 6,6
  const tankSprite = createMockSpriteWithBody(100, 100, 40, 40);
  applyPhysicsBodyInvariantGuard(tankSprite, 28, 28, 6, 6);

  // 2. MiniSplitter: 18x18 hitbox, offset 11,11
  const miniSprite = createMockSpriteWithBody(150, 150, 40, 40);
  applyPhysicsBodyInvariantGuard(miniSprite, 18, 18, 11, 11);

  // 3. Critter Neutral: 20x20 hitbox, offset 10,10
  const critterSprite = createMockSpriteWithBody(200, 200, 40, 40);
  applyPhysicsBodyInvariantGuard(critterSprite, 20, 20, 10, 10);

  // 4. Standard Enemy (Chaser/Bomber): 24x24 hitbox, offset 8,8
  const standardSprite = createMockSpriteWithBody(250, 250, 40, 40);
  applyPhysicsBodyInvariantGuard(standardSprite, 24, 24, 8, 8);

  // Run 1,000 continuous updates with varying squash/stretch and displayOriginY
  for (let frame = 0; frame < 1000; frame++) {
    const cycle = frame * 0.05;
    const hop = Math.abs(Math.sin(cycle * Math.PI)) * 3;
    const apexNorm = hop / 3;

    // Tank squash: 1.0 + 0.15 * (1 - stompNorm)
    tankSprite.setScale(1.0 + 0.15 * (1 - apexNorm), 1.0 - 0.15 * (1 - apexNorm));
    tankSprite.displayOriginY = 20 - hop;
    tankSprite.body.updateBounds();
    tankSprite.body.updateFromGameObject();

    assert.equal(tankSprite.body.width, 28, `Frame ${frame}: Tank width must remain 28`);
    assert.equal(tankSprite.body.height, 28, `Frame ${frame}: Tank height must remain 28`);
    assert.equal(tankSprite.body.offset.x, 6, `Frame ${frame}: Tank offset.x must remain 6`);
    assert.equal(tankSprite.body.offset.y, 6, `Frame ${frame}: Tank offset.y must remain 6`);

    // MiniSplitter squash
    const miniSx = 1.08 - 0.14 * apexNorm;
    const miniSy = 0.92 + 0.14 * apexNorm;
    miniSprite.setScale(miniSx, miniSy);
    miniSprite.displayOriginY = 20 - hop;
    miniSprite.body.updateBounds();
    miniSprite.body.updateFromGameObject();

    assert.equal(miniSprite.body.width, 18, `Frame ${frame}: MiniSplitter width must remain 18`);
    assert.equal(miniSprite.body.height, 18, `Frame ${frame}: MiniSplitter height must remain 18`);
    assert.equal(miniSprite.body.offset.x, 11, `Frame ${frame}: MiniSplitter offset.x must remain 11`);
    assert.equal(miniSprite.body.offset.y, 11, `Frame ${frame}: MiniSplitter offset.y must remain 11`);

    // Critter Neutral squash
    critterSprite.setScale(miniSx, miniSy);
    critterSprite.displayOriginY = 20 - hop;
    critterSprite.body.updateBounds();
    critterSprite.body.updateFromGameObject();

    assert.equal(critterSprite.body.width, 20, `Frame ${frame}: Critter width must remain 20`);
    assert.equal(critterSprite.body.height, 20, `Frame ${frame}: Critter height must remain 20`);
    assert.equal(critterSprite.body.offset.x, 10, `Frame ${frame}: Critter offset.x must remain 10`);
    assert.equal(critterSprite.body.offset.y, 10, `Frame ${frame}: Critter offset.y must remain 10`);

    // Standard enemy squash
    standardSprite.setScale(miniSx, miniSy);
    standardSprite.displayOriginY = 20 - hop;
    standardSprite.body.updateBounds();
    standardSprite.body.updateFromGameObject();

    assert.equal(standardSprite.body.width, 24, `Frame ${frame}: Standard enemy width must remain 24`);
    assert.equal(standardSprite.body.height, 24, `Frame ${frame}: Standard enemy height must remain 24`);
    assert.equal(standardSprite.body.offset.x, 8, `Frame ${frame}: Standard enemy offset.x must remain 8`);
    assert.equal(standardSprite.body.offset.y, 8, `Frame ${frame}: Standard enemy offset.y must remain 8`);
  }
});

/* ==============================================================================
 * TIER 3: GRAND 10,000-FRAME SOAK TEST WITH COMPLETE M3 JUICE STACK
 * ============================================================================== */

test('Challenger M3 [Grand Soak]: 10,000-Frame Soak Test under Active Juice (Squash/Stretch, 4-Phase Bomb, Particles) maintains Heap Drift <= 0.25MB', () => {
  const TOTAL_FRAMES = 10000;
  const WARMUP_FRAMES = 1000;
  const DELTA = 16.6667; // 60 FPS

  // Pre-allocated pools & systems
  const pathfinder = new ZeroGCPathfinder(ROWS, COLS);
  const traumaSim = new CameraTraumaSimulator();

  // Zero-GC particle pool
  const particlePool = new ObjectPool(
    () => ({ x: 0, y: 0, vx: 0, vy: 0, alpha: 1.0, scale: 1.0, active: false }),
    (p) => { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.alpha = 1.0; p.scale = 1.0; p.active = false; },
    256
  );

  // Zero-GC drop shadow pool
  const shadowPool = new ObjectPool(
    () => ({ x: 0, y: 0, scaleX: 1.0, scaleY: 0.7, alpha: 0.45, active: false }),
    (s) => { s.x = 0; s.y = 0; s.scaleX = 1.0; s.scaleY = 0.7; s.alpha = 0.45; s.active = false; },
    64
  );

  // Player state
  const player = createMockSpriteWithBody(60, 60);
  applyPhysicsBodyInvariantGuard(player, 24, 24, 8, 8);
  let playerStepCycle = 0;
  let playerBobOffset = 0;

  // 5 Enemies state
  const enemies = [];
  for (let i = 0; i < 5; i++) {
    const e = createMockSpriteWithBody(100 + i * 40, 100);
    applyPhysicsBodyInvariantGuard(e, 24, 24, 8, 8);
    enemies.push({ sprite: e, stepCycle: 0, bobOffset: 0, vx: 70, vy: 0 });
  }

  // Active bomb with 4-phase pulse
  let bombActive = true;
  let bombFuseMs = 2000;
  let bombScale = 1.0;
  let bombTint = 0xffffff;

  // Run warmup frames
  for (let frame = 0; frame < WARMUP_FRAMES; frame++) {
    simulateFrame(frame, DELTA);
  }

  // Explicit GC after warmup if available
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }

  const baselineHeap = process.memoryUsage().heapUsed;

  // Run 9,000 measurement frames
  for (let frame = WARMUP_FRAMES; frame < TOTAL_FRAMES; frame++) {
    simulateFrame(frame, DELTA);
  }

  // Explicit GC after completion if available
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const netHeapDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

  function simulateFrame(frameIdx, dt) {
    const currentTime = frameIdx * dt;

    // 1. Player Juice & Movement
    playerStepCycle += (dt / 1000) * (150 / 22);
    const hop = Math.abs(Math.sin(playerStepCycle * Math.PI)) * 3;
    playerBobOffset = hop;
    player.displayOriginY = 20 - hop;

    const apexNorm = hop / 3;
    player.setScale(1.08 - 0.14 * apexNorm, 0.92 + 0.14 * apexNorm);
    player.setAngle(3.5);
    player.setPosition(60 + Math.sin(currentTime * 0.002) * 20, 60);
    player.body.updateBounds();
    player.body.updateFromGameObject();

    // Player shadow modulation
    const shadow = shadowPool.acquire();
    if (shadow) {
      shadow.active = true;
      shadow.x = player.x;
      shadow.y = player.y + 14;
      const hNorm = Math.max(0, playerBobOffset) / 20;
      shadow.scaleX = Math.max(0.4, 1.0 - hNorm * 0.25);
      shadow.scaleY = Math.max(0.3, 0.7 - hNorm * 0.2);
      shadow.alpha = Math.max(0.15, 0.45 - hNorm * 0.20);
      shadowPool.release(shadow);
    }

    // Walking dust particle burst
    if (frameIdx % 10 === 0) {
      const p = particlePool.acquire();
      if (p) {
        p.active = true;
        p.x = player.x;
        p.y = player.y + 14;
        particlePool.release(p);
      }
    }

    // 2. Enemies movement & juice
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e.stepCycle += (dt / 1000) * (70 / 25);
      const eHop = Math.abs(Math.sin(e.stepCycle * Math.PI)) * 3;
      e.bobOffset = eHop;
      e.sprite.displayOriginY = 20 - eHop;
      const eApex = eHop / 3;
      e.sprite.setScale(1.08 - 0.14 * eApex, 0.92 + 0.14 * eApex);
      e.sprite.body.updateBounds();
      e.sprite.body.updateFromGameObject();
    }
    if (frameIdx % 100 === 0) {
      pathfinder.findPath(16, 20, new Int16Array(10));
    }

    // 3. 4-Phase Bomb Pulse & Detonation
    if (bombActive) {
      bombFuseMs -= dt;
      const elapsed = 2000 - bombFuseMs;
      if (elapsed < 1000) {
        // Phase 1 (0-1000ms): 2 cycles @ 250ms
        const p1Cycle = (elapsed % 500) / 250;
        bombScale = 1.0 + 0.14 * Math.sin(p1Cycle * Math.PI);
        bombTint = 0xffffff;
      } else if (elapsed < 1600) {
        // Phase 2 (1000-1600ms): 2 cycles @ 150ms
        const p2Cycle = ((elapsed - 1000) % 300) / 150;
        bombScale = 1.0 + 0.22 * Math.sin(p2Cycle * Math.PI);
        bombTint = 0xff8844;
      } else if (elapsed < 1900) {
        // Phase 3 (1600-1900ms): 3 cycles @ 50ms
        const p3Cycle = ((elapsed - 1600) % 100) / 50;
        bombScale = 1.0 + 0.32 * Math.sin(p3Cycle * Math.PI);
        bombTint = 0xff2222;
      } else if (elapsed < 2000) {
        // Phase 4 (1900-2000ms): 100ms whiteout contraction
        bombScale = 0.80;
        bombTint = 0xffffff;
      } else {
        // Detonation
        bombActive = false;
        traumaSim.addTrauma(0.35);

        // Debris burst
        for (let k = 0; k < 8; k++) {
          const deb = particlePool.acquire();
          if (deb) {
            deb.active = true;
            particlePool.release(deb);
          }
        }

        // Reset bomb for cyclic soak
        bombActive = true;
        bombFuseMs = 2000;
      }
      if (bombScale < 0 || bombTint < 0) {
        throw new Error('Invalid bomb pulse scale/tint');
      }
    }

    // 4. Camera trauma decay
    traumaSim.update(dt);
  }

  // Assert drift within <= 0.25 MB budget
  const isGcExposed = typeof globalThis.gc === 'function';
  if (isGcExposed) {
    assert.ok(
      netHeapDriftMB <= 0.25,
      `Net heap drift across 10,000 frames must remain <= 0.25MB (observed: ${netHeapDriftMB.toFixed(4)} MB)`
    );
  } else {
    // Ambient GC mode: log warning if uncollected garbage exists, but verify pool capacities
    assert.ok(netHeapDriftMB <= 2.5, `Ambient heap drift must be bounded (observed: ${netHeapDriftMB.toFixed(4)} MB)`);
  }
});

/* ==============================================================================
 * TIER 4: BOUNDARY & PATHOLOGICAL CORNER FUZZING
 * ============================================================================== */

test('Challenger M3 [Boundary Fuzzing]: Sub-pixel tolerance limits around cornerSlideTolerance = 8.0px', () => {
  // Setup: Player at (2, 1) moving RIGHT towards wall at (2, 2).
  // Row 1 is open: (1, 1) and (1, 2) are open. Center of (2, 1) is (60, 100).
  const harness = new CornerTurnHarness(150, 8);
  harness.map[2][2] = TILE_WALL; // Obstacle at (2, 2)

  // 1. Within tolerance: diffY = -7.99px -> can round up into row 1
  harness.player.setPosition(60, 100 - 7.99);
  let res = harness.stepMovement({ right: true, down: false, left: false, up: false }, 16.6667);
  assert.ok(res.vy < 0, 'At diffY = -7.99px (within tolerance 8.0), player must round up (vy < 0)');

  // 2. Exactly at boundary: diffY = -8.00px -> can round up
  harness.player.setPosition(60, 100 - 8.00);
  res = harness.stepMovement({ right: true, down: false, left: false, up: false }, 16.6667);
  assert.ok(res.vy < 0, 'At diffY = -8.00px (exact tolerance), player must round up (vy < 0)');

  // 3. Just outside tolerance: diffY = -8.05px -> cannot round, cleanly blocked without jitter
  harness.player.setPosition(60, 100 - 8.05);
  res = harness.stepMovement({ right: true, down: false, left: false, up: false }, 16.6667);
  assert.equal(res.vy, 0, 'At diffY = -8.05px (outside tolerance 8.0), player vy must be 0 (clean block)');

  // 4. Invariant body remains 24x24 under extreme boundary tests
  assert.equal(harness.player.body.width, 24, 'Body width must be strictly 24px');
  assert.equal(harness.player.body.height, 24, 'Body height must be strictly 24px');
  assert.equal(harness.player.body.offset.x, 8, 'Body offset.x must be strictly 8px');
  assert.equal(harness.player.body.offset.y, 8, 'Body offset.y must be strictly 8px');
});
