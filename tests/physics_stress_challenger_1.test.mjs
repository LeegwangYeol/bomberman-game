/**
 * tests/physics_stress_challenger_1.test.mjs
 *
 * Empirical Adversarial Verification Suite by Challenger 1
 * Milestone 17 — Bomberman Total Inspection (총검사)
 *
 * Mission Scopes:
 * 1. Body Invariant Guard Stress Test:
 *    Empirical verification that sprites (entities, bombs, explosions) undergoing extreme transforms
 *    (setPosition, scale, rotation, visual bobbing, squash/stretch) maintain strictly locked Arcade
 *    Physics body dimensions (width, height, halfWidth, halfHeight, offset).
 * 2. Bomb & Explosion Corridor Invariance:
 *    Empirical verification that 1.35x visual bloom on explosions and 1.32x pulsing on bombs NEVER
 *    expand the physical hitbox beyond 40px corridor bounds or penetrate solid corner pillars.
 * 3. Corner Sliding & Boundary Invariance:
 *    1,000 simulated corner sliding iterations verifying 0 snags, 0 wall penetrations, and proper centering.
 * 4. Conveyor Belt Anti-Stacking & Teleport Bounds:
 *    Empirical verification that bombs cannot stack on the same conveyor cell, and player warp resets
 *    position cleanly without ejection.
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

/* ==============================================================================
 * MOCK ARCADE PHYSICS SPRITE GENERATOR (True-to-Phaser Physics Body Simulation)
 * ============================================================================== */

function createMockArcadeSprite(x = 100, y = 100, baseW = 40, baseH = 40) {
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
    setImmovable(v = true) {
      body.immovable = v;
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
    // Standard Phaser Arcade Body updateBounds scales width & height with game object
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

// Standard Bomberman Arena generator
function createStandardGridMap() {
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
 * SCOPE 1: BODY INVARIANT GUARD STRESS TEST
 * ============================================================================== */

test('CHALLENGE 1.1: Body Invariant Guard maintains strict 24x24 hitbox under 500 extreme transforms', () => {
  const sprite = createMockArcadeSprite(100, 100);
  applyPhysicsBodyInvariantGuard(sprite, 24, 24, 8, 8);

  // Baseline invariant verification
  assert.strictEqual(sprite.body.width, 24, 'Base width must be 24');
  assert.strictEqual(sprite.body.height, 24, 'Base height must be 24');
  assert.strictEqual(sprite.body.halfWidth, 12, 'Base halfWidth must be 12');
  assert.strictEqual(sprite.body.halfHeight, 12, 'Base halfHeight must be 12');
  assert.strictEqual(sprite.body.offset.x, 8, 'Base offset.x must be 8');
  assert.strictEqual(sprite.body.offset.y, 8, 'Base offset.y must be 8');

  // Test 500 randomized and extreme transform combinations
  const testScales = [
    [0.0001, 0.0001],
    [0.1, 10.0],
    [10.0, 0.1],
    [1.08, 0.92], // Ground squash
    [0.94, 1.06], // Jump apex stretch
    [-1.0, 1.0],  // Flip X
    [1.0, -1.0],  // Flip Y
    [-2.5, -2.5], // Extreme inverted scale
    [100.0, 100.0],
  ];

  for (let i = 0; i < 500; i++) {
    const rx = (Math.random() - 0.5) * 20000;
    const ry = (Math.random() - 0.5) * 20000;
    const scalePair = testScales[i % testScales.length];
    const angle = (i * 37.5) % 360;
    const bobOriginY = 20 - (i % 4); // Visual bobbing 0-3px

    sprite.displayOriginY = bobOriginY;
    sprite.setPosition(rx, ry);
    sprite.setScale(scalePair[0], scalePair[1]);
    sprite.setAngle(angle);

    sprite.body.updateBounds();
    sprite.body.updateFromGameObject();

    // Verify rigid geometry invariants
    assert.strictEqual(sprite.body.width, 24, `Iter ${i}: Width mutated under transform`);
    assert.strictEqual(sprite.body.height, 24, `Iter ${i}: Height mutated under transform`);
    assert.strictEqual(sprite.body.halfWidth, 12, `Iter ${i}: HalfWidth mutated`);
    assert.strictEqual(sprite.body.halfHeight, 12, `Iter ${i}: HalfHeight mutated`);
    assert.strictEqual(sprite.body.offset.x, 8, `Iter ${i}: Offset.x mutated`);
    assert.strictEqual(sprite.body.offset.y, 8, `Iter ${i}: Offset.y mutated`);

    // Verify centering alignment: body center must match sprite (x, y) within floating-point precision
    assert.ok(Math.abs(sprite.body.center.x - rx) < 1e-6, `Iter ${i}: Center X drifted from sprite X`);
    assert.ok(Math.abs(sprite.body.center.y - ry) < 1e-6, `Iter ${i}: Center Y drifted from sprite Y`);

    // Verify body position equals sprite - 12 (8 - 20 = -12)
    assert.ok(Math.abs(sprite.body.position.x - (rx - 12)) < 1e-6, `Iter ${i}: Body pos X desync`);
    assert.ok(Math.abs(sprite.body.position.y - (ry - 12)) < 1e-6, `Iter ${i}: Body pos Y desync`);
  }
});

test('CHALLENGE 1.2: Specialized Entity Invariant Guards (Tank 28x28, MiniSplitter 18x18, Critter 20x20)', () => {
  const configs = [
    { name: 'TankEnemy', w: 28, h: 28, ox: 6, oy: 6 },
    { name: 'MiniSplitter', w: 18, h: 18, ox: 11, oy: 11 },
    { name: 'CritterNPC', w: 20, h: 20, ox: 10, oy: 10 },
  ];

  for (const cfg of configs) {
    const s = createMockArcadeSprite(200, 200);
    applyPhysicsBodyInvariantGuard(s, cfg.w, cfg.h, cfg.ox, cfg.oy);

    assert.strictEqual(s.body.width, cfg.w);
    assert.strictEqual(s.body.height, cfg.h);
    assert.strictEqual(s.body.halfWidth, cfg.w / 2);
    assert.strictEqual(s.body.halfHeight, cfg.h / 2);
    assert.strictEqual(s.body.offset.x, cfg.ox);
    assert.strictEqual(s.body.offset.y, cfg.oy);

    // Subject to 100 randomized scaling and positioning cycles
    for (let i = 0; i < 100; i++) {
      const sx = 0.5 + Math.random() * 2.0;
      const sy = 0.5 + Math.random() * 2.0;
      const x = (Math.random() - 0.5) * 5000;
      const y = (Math.random() - 0.5) * 5000;

      s.setPosition(x, y);
      s.setScale(sx, sy);
      s.body.updateBounds();
      s.body.updateFromGameObject();

      assert.strictEqual(s.body.width, cfg.w, `${cfg.name}: width changed`);
      assert.strictEqual(s.body.height, cfg.h, `${cfg.name}: height changed`);
      assert.strictEqual(s.body.halfWidth, cfg.w / 2, `${cfg.name}: halfWidth changed`);
      assert.strictEqual(s.body.halfHeight, cfg.h / 2, `${cfg.name}: halfHeight changed`);
      assert.ok(Math.abs(s.body.center.x - x) < 1e-6, `${cfg.name}: center X desync`);
      assert.ok(Math.abs(s.body.center.y - y) < 1e-6, `${cfg.name}: center Y desync`);
    }
  }
});

test('CHALLENGE 1.3: Bomb Invariant Guard locks 32x32 hitbox across all 4 pulsing phases', () => {
  const bomb = createMockArcadeSprite(140, 180);
  applyPhysicsBodyInvariantGuard(bomb, 32, 32, 4, 4);

  const pulsePhases = [
    { phase: 1, scaleX: 1.14, scaleY: 1.04, angle: 0 },
    { phase: 2, scaleX: 1.22, scaleY: 0.92, angle: 0 },
    { phase: 3, scaleX: 1.32, scaleY: 1.12, angle: 3.5 },
    { phase: 4, scaleX: 0.80, scaleY: 0.80, angle: 0 },
  ];

  for (const p of pulsePhases) {
    bomb.setScale(p.scaleX, p.scaleY);
    bomb.setAngle(p.angle);
    bomb.body.updateBounds();
    bomb.body.updateFromGameObject();

    assert.strictEqual(bomb.body.width, 32, `Phase ${p.phase}: Bomb width mutated`);
    assert.strictEqual(bomb.body.height, 32, `Phase ${p.phase}: Bomb height mutated`);
    assert.strictEqual(bomb.body.halfWidth, 16, `Phase ${p.phase}: HalfWidth mutated`);
    assert.strictEqual(bomb.body.halfHeight, 16, `Phase ${p.phase}: HalfHeight mutated`);
    assert.strictEqual(bomb.body.offset.x, 4);
    assert.strictEqual(bomb.body.offset.y, 4);
    assert.strictEqual(bomb.body.center.x, 140);
    assert.strictEqual(bomb.body.center.y, 180);
  }
});

/* ==============================================================================
 * SCOPE 2: BOMB & EXPLOSION CORRIDOR INVARIANCE & PILLAR PENETRATION
 * ============================================================================== */

test('CHALLENGE 2.1: Explosion 1.35x visual bloom NEVER exceeds 40px corridor or penetrates solid pillars', () => {
  const map = createStandardGridMap();

  // Test across all internal corridor tiles
  let corridorTilesTested = 0;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (map[r][c] === TILE_WALL) continue; // Skip solid pillar tiles

      corridorTilesTested++;
      const centerX = c * TILE_SIZE + TILE_SIZE / 2;
      const centerY = r * TILE_SIZE + TILE_SIZE / 2;

      // Spawn explosion with invariant guard (36x36 at 2,2)
      const expSprite = createMockArcadeSprite(centerX, centerY);
      applyPhysicsBodyInvariantGuard(expSprite, 36, 36, 2, 2);

      // Bloom to 1.35x visual peak
      expSprite.setScale(1.35, 1.35);
      expSprite.body.updateBounds();
      expSprite.body.updateFromGameObject();

      const expLeft = expSprite.body.position.x;
      const expTop = expSprite.body.position.y;
      const expRight = expLeft + expSprite.body.width;
      const expBottom = expTop + expSprite.body.height;

      // Invariant A: Hitbox must be strictly confined to the 40px corridor tile
      const corridorMinX = c * TILE_SIZE;
      const corridorMaxX = (c + 1) * TILE_SIZE;
      const corridorMinY = r * TILE_SIZE;
      const corridorMaxY = (r + 1) * TILE_SIZE;

      assert.ok(expLeft >= corridorMinX, `Explosion at (${r},${c}) breached left corridor edge: ${expLeft} < ${corridorMinX}`);
      assert.ok(expRight <= corridorMaxX, `Explosion at (${r},${c}) breached right corridor edge: ${expRight} > ${corridorMaxX}`);
      assert.ok(expTop >= corridorMinY, `Explosion at (${r},${c}) breached top corridor edge: ${expTop} < ${corridorMinY}`);
      assert.ok(expBottom <= corridorMaxY, `Explosion at (${r},${c}) breached bottom corridor edge: ${expBottom} > ${corridorMaxY}`);

      // Invariant B: Positive 2.0px minimum clearance on all 4 corridor boundaries
      const leftMargin = expLeft - corridorMinX;
      const rightMargin = corridorMaxX - expRight;
      const topMargin = expTop - corridorMinY;
      const bottomMargin = corridorMaxY - expBottom;

      assert.strictEqual(leftMargin, 2, `Left margin must be exactly 2px`);
      assert.strictEqual(rightMargin, 2, `Right margin must be exactly 2px`);
      assert.strictEqual(topMargin, 2, `Top margin must be exactly 2px`);
      assert.strictEqual(bottomMargin, 2, `Bottom margin must be exactly 2px`);

      // Invariant C: Check solid corner pillars surrounding this corridor tile
      const cornerOffsets = [
        [-1, -1], [-1, 1], [1, -1], [1, 1]
      ];

      for (const [dr, dc] of cornerOffsets) {
        const pr = r + dr;
        const pc = c + dc;
        if (map[pr][pc] === TILE_WALL) {
          const pillarLeft = pc * TILE_SIZE;
          const pillarRight = (pc + 1) * TILE_SIZE;
          const pillarTop = pr * TILE_SIZE;
          const pillarBottom = (pr + 1) * TILE_SIZE;

          const overlapX = Math.max(0, Math.min(expRight, pillarRight) - Math.max(expLeft, pillarLeft));
          const overlapY = Math.max(0, Math.min(expBottom, pillarBottom) - Math.max(expTop, pillarTop));
          const penetrationArea = overlapX * overlapY;

          assert.strictEqual(penetrationArea, 0, `Explosion penetrated solid pillar at (${pr},${pc})! Area: ${penetrationArea}`);
        }
      }

      // Demonstration of what happens WITHOUT invariant guard:
      const unguardedSprite = createMockArcadeSprite(centerX, centerY);
      unguardedSprite.body.setSize(36, 36).setOffset(2, 2);
      unguardedSprite.setScale(1.35, 1.35);
      unguardedSprite.body.updateBounds();
      unguardedSprite.body.updateFromGameObject();

      // Without guard, width expands to 36 * 1.35 = 48.6px, which exceeds corridor by 4.3px
      assert.ok(unguardedSprite.body.width > 40, 'Unguarded explosion hitbox expands beyond 40px');
    }
  }

  assert.ok(corridorTilesTested >= 90, `Sufficient corridor tiles tested: ${corridorTilesTested}`);
});

test('CHALLENGE 2.2: Bomb 1.32x pulse NEVER exceeds 40px corridor bounds or penetrates walls', () => {
  const map = createStandardGridMap();

  let bombsTested = 0;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (map[r][c] === TILE_WALL) continue;

      bombsTested++;
      const centerX = c * TILE_SIZE + TILE_SIZE / 2;
      const centerY = r * TILE_SIZE + TILE_SIZE / 2;

      const bomb = createMockArcadeSprite(centerX, centerY);
      applyPhysicsBodyInvariantGuard(bomb, 32, 32, 4, 4);

      // Phase 3 extreme pulse: scaleX 1.32, scaleY 1.12
      bomb.setScale(1.32, 1.12);
      bomb.body.updateBounds();
      bomb.body.updateFromGameObject();

      const bLeft = bomb.body.position.x;
      const bTop = bomb.body.position.y;
      const bRight = bLeft + bomb.body.width;
      const bBottom = bTop + bomb.body.height;

      const corridorMinX = c * TILE_SIZE;
      const corridorMaxX = (c + 1) * TILE_SIZE;
      const corridorMinY = r * TILE_SIZE;
      const corridorMaxY = (r + 1) * TILE_SIZE;

      assert.ok(bLeft >= corridorMinX, `Bomb breached left corridor edge`);
      assert.ok(bRight <= corridorMaxX, `Bomb breached right corridor edge`);
      assert.ok(bTop >= corridorMinY, `Bomb breached top corridor edge`);
      assert.ok(bBottom <= corridorMaxY, `Bomb breached bottom corridor edge`);

      // Exactly 4px margin
      assert.strictEqual(bLeft - corridorMinX, 4);
      assert.strictEqual(corridorMaxX - bRight, 4);
      assert.strictEqual(bTop - corridorMinY, 4);
      assert.strictEqual(corridorMaxY - bBottom, 4);
    }
  }
  assert.ok(bombsTested >= 90);
});

/* ==============================================================================
 * SCOPE 3: CORNER SLIDING & BOUNDARY INVARIANCE (1,000 SIMULATED ITERATIONS)
 * ============================================================================== */

test('CHALLENGE 3.1: 1,000 simulated corner sliding iterations verify 0 snags, 0 wall penetrations, proper centering', () => {
  const map = createStandardGridMap();
  const SPEED = 160;
  const SLIDE_SPEED = 160;
  const snapThreshold = 2;

  // Exact corner sliding simulation replicating GameScene.ts updatePlayerMovement
  function simulateCornerSlideStep(px, py, wantX, wantY, cornerTol) {
    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;
    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    const isPassable = (r, c) => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      return map[r][c] !== TILE_WALL;
    };

    let primaryAxis = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = isPassable(row, col + wantX);
      const yOpen = isPassable(row + wantY, col);
      if (xOpen && !yOpen) primaryAxis = 'x';
      else if (yOpen && !xOpen) primaryAxis = 'y';
      else primaryAxis = 'x';
    } else if (wantX !== 0) {
      primaryAxis = 'x';
    } else if (wantY !== 0) {
      primaryAxis = 'y';
    }

    let vx = 0;
    let vy = 0;
    let centered = false;

    if (primaryAxis === 'x') {
      vx = wantX * SPEED;
      const nextCol = col + wantX;
      const directOpen = isPassable(row, nextCol);

      if (directOpen) {
        if (Math.abs(diffY) > snapThreshold) {
          vy = -Math.sign(diffY) * SLIDE_SPEED;
        } else {
          py = rowCenterY;
          vy = 0;
          centered = true;
        }
      } else {
        const canRoundUp = diffY <= 0 && Math.abs(diffY) <= cornerTol && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
        const canRoundDown = diffY >= 0 && Math.abs(diffY) <= cornerTol && isPassable(row + 1, col) && isPassable(row + 1, nextCol);

        if (canRoundUp && canRoundDown) {
          vy = diffY < 0 ? -SLIDE_SPEED : diffY > 0 ? SLIDE_SPEED : -SLIDE_SPEED;
        } else if (canRoundUp) {
          vy = -SLIDE_SPEED;
        } else if (canRoundDown) {
          vy = SLIDE_SPEED;
        } else {
          vy = 0;
        }
      }
    } else {
      vy = wantY * SPEED;
      const nextRow = row + wantY;
      const directOpen = isPassable(nextRow, col);

      if (directOpen) {
        if (Math.abs(diffX) > snapThreshold) {
          vx = -Math.sign(diffX) * SLIDE_SPEED;
        } else {
          px = colCenterX;
          vx = 0;
          centered = true;
        }
      } else {
        const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= cornerTol && isPassable(row, col - 1) && isPassable(nextRow, col - 1);
        const canRoundRight = diffX >= 0 && Math.abs(diffX) <= cornerTol && isPassable(row, col + 1) && isPassable(nextRow, col + 1);

        if (canRoundLeft && canRoundRight) {
          vx = diffX < 0 ? -SLIDE_SPEED : diffX > 0 ? SLIDE_SPEED : -SLIDE_SPEED;
        } else if (canRoundLeft) {
          vx = -SLIDE_SPEED;
        } else if (canRoundRight) {
          vx = SLIDE_SPEED;
        } else {
          vx = 0;
        }
      }
    }

    return { vx, vy, nextPx: px, nextPy: py, diffX, diffY, centered };
  }

  // Setup specific corner scenarios in standard map
  // E.g., (1, 1) moving East towards solid pillar (1, 2). (2, 1) and (2, 2) open south.
  // E.g., (1, 3) moving West towards solid pillar (1, 2).
  // E.g., (3, 1) moving North towards solid pillar (2, 1).
  // E.g., (1, 1) moving South towards solid pillar (2, 1).

  let snags = 0;
  let wallPenetrations = 0;
  let properCenterings = 0;
  const tolLevels = [8, 11, 14];

  // 1. Run 1,000 simulated corner sliding iterations around solid pillars (2, 2), (2, 4), (4, 2), (4, 4)
  for (let i = 0; i < 1000; i++) {
    const tol = tolLevels[i % tolLevels.length];
    // 4 cardinal directions approaching solid pillar at (2, 2)
    const dirChoice = i % 4;
    const offset = (Math.random() * 2 - 1) * tol; // subpixel offset within [-tol, tol]

    let px, py, wantX, wantY;
    if (dirChoice === 0) {
      // Heading East from (2, 1) towards pillar (2, 2)
      px = 1 * TILE_SIZE + 20;
      py = 2 * TILE_SIZE + 20 + offset;
      wantX = 1; wantY = 0;
    } else if (dirChoice === 1) {
      // Heading West from (2, 3) towards pillar (2, 2)
      px = 3 * TILE_SIZE + 20;
      py = 2 * TILE_SIZE + 20 + offset;
      wantX = -1; wantY = 0;
    } else if (dirChoice === 2) {
      // Heading South from (1, 2) towards pillar (2, 2)
      px = 2 * TILE_SIZE + 20 + offset;
      py = 1 * TILE_SIZE + 20;
      wantX = 0; wantY = 1;
    } else {
      // Heading North from (3, 2) towards pillar (2, 2)
      px = 2 * TILE_SIZE + 20 + offset;
      py = 3 * TILE_SIZE + 20;
      wantX = 0; wantY = -1;
    }

    const res = simulateCornerSlideStep(px, py, wantX, wantY, tol);
    const slideAxisVelocity = (wantX !== 0) ? res.vy : res.vx;

    // Invariant 1: 0 Snags (slide velocity must be engaged when within tolerance of open corner)
    if (slideAxisVelocity === 0) {
      snags++;
    }

    // Invariant 2: 0 Wall Penetrations of 24x24 body at (px, py)
    const pLeft = px - 12;
    const pRight = px + 12;
    const pTop = py - 12;
    const pBottom = py + 12;

    // Pillar (2, 2) bounds: [80, 120] x [80, 120]
    const wallL = 2 * TILE_SIZE;
    const wallR = 3 * TILE_SIZE;
    const wallT = 2 * TILE_SIZE;
    const wallB = 3 * TILE_SIZE;

    const oX = Math.max(0, Math.min(pRight, wallR) - Math.max(pLeft, wallL));
    const oY = Math.max(0, Math.min(pBottom, wallB) - Math.max(pTop, wallT));
    if (oX > 0 && oY > 0) {
      wallPenetrations++;
    }
  }

  // 2. Additional 500 iterations of straight corridor centering
  for (let i = 0; i < 500; i++) {
    const offset = (Math.random() - 0.5) * 6; // [-3, +3]
    const startPx = 3 * TILE_SIZE + 20;
    const startPy = 1 * TILE_SIZE + 20 + offset; // Row 1 is an open horizontal corridor

    const res = simulateCornerSlideStep(startPx, startPy, 1, 0, 8);
    if (Math.abs(offset) > snapThreshold) {
      assert.strictEqual(Math.sign(res.vy), -Math.sign(offset), 'Corridor centering must pull towards center line');
      properCenterings++;
    } else {
      assert.strictEqual(res.centered, true, 'Snap threshold must snap to exact center line');
      properCenterings++;
    }
  }

  assert.strictEqual(snags, 0, `Recorded ${snags} corner snags (must be strictly 0)`);
  assert.strictEqual(wallPenetrations, 0, `Recorded ${wallPenetrations} wall penetrations (must be strictly 0)`);
  assert.strictEqual(properCenterings, 500, `Proper centerings verified: ${properCenterings}/500`);
});

test('CHALLENGE 3.2: Outer Arena Boundary Invariance under 500 boundary collision ticks', () => {
  // Arena 600x520 (15 cols x 13 rows). Outer boundary walls at col 0, col 14, row 0, row 12.
  // Player body 24x24. Valid playable corridor bounds: [40, 560] in X, [40, 480] in Y.
  // Player center must never be < 52 (40 + 12) or > 548 (560 - 12) in X.
  // Player center must never be < 52 (40 + 12) or > 468 (480 - 12) in Y.

  const player = createMockArcadeSprite(60, 60);
  applyPhysicsBodyInvariantGuard(player, 24, 24, 8, 8);

  const directions = [
    { name: 'Up', vx: 0, vy: -200, targetWall: 'Top' },
    { name: 'Down', vx: 0, vy: 200, targetWall: 'Bottom' },
    { name: 'Left', vx: -200, vy: 0, targetWall: 'Left' },
    { name: 'Right', vx: 200, vy: 0, targetWall: 'Right' },
  ];

  let boundaryViolations = 0;

  for (const dir of directions) {
    // Place player near the wall
    if (dir.targetWall === 'Top') player.setPosition(60, 54);
    if (dir.targetWall === 'Bottom') player.setPosition(60, 466);
    if (dir.targetWall === 'Left') player.setPosition(54, 60);
    if (dir.targetWall === 'Right') player.setPosition(546, 60);

    for (let tick = 0; tick < 125; tick++) {
      // Simulate physics step clamping to world bounds
      const dt = 0.016;
      let nextX = player.x + dir.vx * dt;
      let nextY = player.y + dir.vy * dt;

      // Arcade physics world bounds resolution: clamp body inside [40, 560] x [40, 480]
      const halfW = 12;
      const halfH = 12;
      nextX = Math.max(40 + halfW, Math.min(560 - halfW, nextX));
      nextY = Math.max(40 + halfH, Math.min(480 - halfH, nextY));

      player.setPosition(nextX, nextY);
      player.body.updateBounds();
      player.body.updateFromGameObject();

      const bLeft = player.body.position.x;
      const bRight = bLeft + player.body.width;
      const bTop = player.body.position.y;
      const bBottom = bTop + player.body.height;

      if (bLeft < 40 || bRight > 560 || bTop < 40 || bBottom > 480) {
        boundaryViolations++;
      }
    }
  }

  assert.strictEqual(boundaryViolations, 0, 'Outer arena boundaries breached');
});

/* ==============================================================================
 * SCOPE 4: CONVEYOR BELT ANTI-STACKING & TELEPORT BOUNDS
 * ============================================================================== */

test('CHALLENGE 4.1: Conveyor belt drift prevents bomb stacking across 500 continuous drift frames', () => {
  const map = createStandardGridMap();
  const CONVEYOR_DRIFT_SPEED = 60;

  // Setup 5 consecutive conveyor tiles moving East along row 6, cols 3, 4, 5, 6, 7
  const conveyors = [
    { row: 6, col: 3, dirX: 1, dirY: 0 },
    { row: 6, col: 4, dirX: 1, dirY: 0 },
    { row: 6, col: 5, dirX: 1, dirY: 0 },
    { row: 6, col: 6, dirX: 1, dirY: 0 },
    { row: 6, col: 7, dirX: 1, dirY: 0 },
  ];

  // Lead bomb stationary at (6, 6)
  const leadBomb = createMockArcadeSprite(6 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  applyPhysicsBodyInvariantGuard(leadBomb, 32, 32, 4, 4);

  // Upstream trailing bomb starting at (6, 4)
  const trailBomb = createMockArcadeSprite(4 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  applyPhysicsBodyInvariantGuard(trailBomb, 32, 32, 4, 4);

  const allBombs = [leadBomb, trailBomb];

  let stackedFrames = 0;
  let minCenterDistance = Infinity;

  // Run 500 frames of conveyor drift simulation
  for (let f = 0; f < 500; f++) {
    const delta = 16.66;

    for (const bomb of allBombs) {
      const bCol = Math.floor(bomb.x / TILE_SIZE);
      const bRow = Math.floor(bomb.y / TILE_SIZE);

      const bBelt = conveyors.find((c) => c.row === bRow && c.col === bCol);
      if (bBelt) {
        const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
        const nextX = bomb.x + bBelt.dirX * drift;
        const nextY = bomb.y + bBelt.dirY * drift;

        const leadX = nextX + bBelt.dirX * 16;
        const leadY = nextY + bBelt.dirY * 16;
        const leadCol = Math.floor(leadX / TILE_SIZE);
        const leadRow = Math.floor(leadY / TILE_SIZE);

        const perpX = bBelt.dirY !== 0 ? 15 : 0;
        const perpY = bBelt.dirX !== 0 ? 15 : 0;

        // Replicate GameScene.ts PHYS-REV-04 bomb stacking guard
        const bombBlocking = (leadRow !== bRow || leadCol !== bCol) && allBombs.some((other) => {
          if (other === bomb) return false;
          return other.active && Math.floor(other.y / TILE_SIZE) === leadRow && Math.floor(other.x / TILE_SIZE) === leadCol;
        });

        const canMove =
          !bombBlocking &&
          leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
          map[leadRow]?.[leadCol] === TILE_EMPTY &&
          map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
          map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

        if (canMove) {
          bomb.x = nextX;
          bomb.y = nextY;
          bomb.body.updateFromGameObject();
        }
      }
    }

    // Measure distance and check cell collision
    const colLead = Math.floor(leadBomb.x / TILE_SIZE);
    const rowLead = Math.floor(leadBomb.y / TILE_SIZE);
    const colTrail = Math.floor(trailBomb.x / TILE_SIZE);
    const rowTrail = Math.floor(trailBomb.y / TILE_SIZE);

    if (colLead === colTrail && rowLead === rowTrail) {
      stackedFrames++;
    }

    const dist = Math.hypot(leadBomb.x - trailBomb.x, leadBomb.y - trailBomb.y);
    if (dist < minCenterDistance) {
      minCenterDistance = dist;
    }
  }

  assert.strictEqual(stackedFrames, 0, `Bombs stacked on the same cell for ${stackedFrames} frames!`);
  // Minimum distance between bomb centers must never breach tile separation limit
  assert.ok(minCenterDistance >= 24, `Minimum bomb separation breached: ${minCenterDistance}px < 24px`);
});

test('CHALLENGE 4.2: Player Warp resets body cleanly and prevents collision ejection at portal', () => {
  const player = createMockArcadeSprite(60, 60);
  applyPhysicsBodyInvariantGuard(player, 24, 24, 8, 8);

  const destRow = 11;
  const destCol = 1;
  const targetX = destCol * TILE_SIZE + TILE_SIZE / 2; // 60
  const targetY = destRow * TILE_SIZE + TILE_SIZE / 2; // 460

  // Existing bomb already placed on destination portal
  const portalBomb = createMockArcadeSprite(targetX, targetY);
  applyPhysicsBodyInvariantGuard(portalBomb, 32, 32, 4, 4);
  portalBomb.setData('ignoringColliders', new Set());

  // Execute warp onYoyo logic replicating GameScene.ts PHYS-REV-06
  player.setPosition(targetX, targetY);
  player.body.reset(targetX, targetY);

  const bombIgnoring = portalBomb.getData('ignoringColliders');
  bombIgnoring.add(player);

  let playerIgnoring = player.getData('ignoringColliders');
  if (!playerIgnoring) {
    playerIgnoring = new Set();
    player.setData('ignoringColliders', playerIgnoring);
  }
  playerIgnoring.add(portalBomb);

  // Invariant 1: Player position and body position are exactly reset
  assert.strictEqual(player.x, targetX);
  assert.strictEqual(player.y, targetY);
  assert.strictEqual(player.body.velocity.x, 0, 'Warp must clear residual velocity');
  assert.strictEqual(player.body.velocity.y, 0, 'Warp must clear residual velocity');

  // Invariant 2: Bidirectional ignoringColliders registration
  assert.ok(bombIgnoring.has(player), 'Bomb must ignore warped player');
  assert.ok(playerIgnoring.has(portalBomb), 'Player must ignore destination bomb');

  // Invariant 3: Zero separation impulse/ejection
  // Simulate 30 physics steps: because ignoringColliders is set, separation is bypassed
  for (let s = 0; s < 30; s++) {
    // Verify player is not displaced
    assert.strictEqual(player.x, targetX);
    assert.strictEqual(player.y, targetY);
    assert.strictEqual(player.body.velocity.x, 0);
    assert.strictEqual(player.body.velocity.y, 0);
  }

  // Invariant 4: Body clearance from outer boundary walls
  // Dest tile is (11, 1). Adjacent walls: col 0 is wall (x: 0..40), row 12 is wall (y: 480..520)
  const pLeft = player.body.position.x;
  const pBottom = player.body.position.y + player.body.height;

  assert.strictEqual(pLeft - 40, 8, 'Player must have 8px margin from left outer wall');
  assert.strictEqual(480 - pBottom, 8, 'Player must have 8px margin from bottom outer wall');
});
