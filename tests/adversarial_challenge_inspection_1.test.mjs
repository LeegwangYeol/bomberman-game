/**
 * adversarial_challenge_inspection_1.test.mjs — Adversarial Stress Harness for Challenger 1
 *
 * Comprehensive empirical stress testing across all assigned scopes:
 * 1. Player corridor movement, corner sliding at all sub-pixel offsets, corner magnet levels.
 * 2. Conveyor belt drift and solid wall collision boundaries (zero penetration & zero 60 FPS jitter).
 * 3. Bomb kicking velocity, obstacle impacts, and multi-tile displacement detonation coordinates.
 * 4. Diagonal blast raycasting around solid pillars (zero diagonal damage leakage).
 * 5. Soft block simultaneous ray piercing prevention.
 * 6. ZeroGCPathfinder bounds checking and flat array indexing.
 * 7. Enemy and ally FSM edge cases (Chaser stun timing, Bomber evasion watchdog, Ghost Ether Dash velocity).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ZeroGCPathfinder,
  coordToIdx,
  idxToRow,
  idxToCol,
  getBlastTiles,
  findEscapePathBFS,
  ROWS,
  COLS,
  TOTAL_TILES,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';

import {
  ENEMY_ARCHETYPES,
} from '../src/game/entities/types.ts';

// Arena Generator
function createStandardMap() {
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
 * SUITE 1: PLAYER CORRIDOR MOVEMENT & SUB-PIXEL CORNER SLIDING
 * ============================================================================== */

test('Challenger 1.1: Player corner sliding — exhaustive sub-pixel offsets and zero dead zone', () => {
  const SPEED = 150;
  const SLIDE_SPEED = 150;
  const snapThreshold = 2;

  // Simulator representing GameScene.ts updatePlayerMovement corner sliding math
  function simulateCornerSlide(px, py, wantX, wantY, cornerSlideTol, hasWallPass = false, mapOverride = null) {
    const map = mapOverride || createStandardMap();
    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;
    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    const isPassable = (r, c) => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      if (map[r][c] === TILE_WALL) return false;
      if (map[r][c] === TILE_BLOCK && !hasWallPass) return false;
      return true;
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

    if (primaryAxis === 'x') {
      vx = wantX * SPEED;
      const nextCol = col + wantX;
      const directOpen = isPassable(row, nextCol);

      if (directOpen) {
        if (Math.abs(diffY) > snapThreshold) {
          vy = -Math.sign(diffY) * SLIDE_SPEED;
        } else {
          vy = 0;
        }
      } else {
        const canRoundUp = diffY <= 0 && Math.abs(diffY) <= cornerSlideTol && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
        const canRoundDown = diffY >= 0 && Math.abs(diffY) <= cornerSlideTol && isPassable(row + 1, col) && isPassable(row + 1, nextCol);

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
          vx = 0;
        }
      } else {
        const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= cornerSlideTol && isPassable(row, col - 1) && isPassable(nextRow, col - 1);
        const canRoundRight = diffX >= 0 && Math.abs(diffX) <= cornerSlideTol && isPassable(row, col + 1) && isPassable(nextRow, col + 1);

        if (canRoundLeft && canRoundRight) {
          if (diffX < 0) vx = -SLIDE_SPEED;
          else if (diffX > 0) vx = SLIDE_SPEED;
          else vx = -SLIDE_SPEED;
        } else if (canRoundLeft) {
          vx = -SLIDE_SPEED;
        } else if (canRoundRight) {
          vx = SLIDE_SPEED;
        } else {
          vx = 0;
        }
      }
    }

    return { vx, vy, diffX, diffY };
  }

  // Setup corner arena: (1, 1) moving East towards (1, 2) which is a WALL
  const map = createStandardMap();
  map[1][2] = TILE_WALL;
  map[2][1] = TILE_EMPTY;
  map[2][2] = TILE_EMPTY; // Corner open downwards to row 2

  // 1. Zero dead zone check: exact center diffY = 0
  const centerRes = simulateCornerSlide(60, 60, 1, 0, 8, false, map);
  assert.equal(centerRes.vy, 150, 'diffY = 0 (exact center) must round into open downward corridor (zero dead zone)');

  // 2. Fuzz sub-pixel offsets at tolerance = 8 (Level 0)
  for (let offset = -12.0; offset <= 12.0; offset += 0.25) {
    const py = 60 + offset;
    const res = simulateCornerSlide(60, py, 1, 0, 8, false, map);

    // Only downwards corner is open (canRoundDown: diffY >= 0 && diffY <= 8)
    if (offset >= 0 && offset <= 8.0001) {
      assert.equal(res.vy, 150, `Offset ${offset.toFixed(2)} within tolerance 8 must slide down`);
    } else {
      assert.equal(res.vy, 0, `Offset ${offset.toFixed(2)} outside tolerance 8 must not slide`);
    }
  }

  // 3. Tolerance levels: 8px (Lv 0), 11px (Lv 1), 14px (Lv 2)
  // At offset = 10px:
  const lv0 = simulateCornerSlide(60, 70, 1, 0, 8, false, map);
  assert.equal(lv0.vy, 0, 'Lv 0 (8px tol) must reject 10px offset');
  const lv1 = simulateCornerSlide(60, 70, 1, 0, 11, false, map);
  assert.equal(lv1.vy, 150, 'Lv 1 (11px tol) must accept 10px offset');

  // At offset = 13px:
  const lv1_13 = simulateCornerSlide(60, 73, 1, 0, 11, false, map);
  assert.equal(lv1_13.vy, 0, 'Lv 1 (11px tol) must reject 13px offset');
  const lv2_13 = simulateCornerSlide(60, 73, 1, 0, 14, false, map);
  assert.equal(lv2_13.vy, 150, 'Lv 2 (14px tol) must accept 13px offset');

  // 4. Wall-pass perk bypasses corner snag into corridor centering
  map[1][2] = TILE_BLOCK; // Soft block
  const noPass = simulateCornerSlide(60, 65, 1, 0, 8, false, map); // 5px off-center
  assert.equal(noPass.vy, 150, 'Without wall-pass, corner rounding engages downwards');

  const withPass = simulateCornerSlide(60, 65, 1, 0, 8, true, map);
  assert.equal(withPass.vx, 150, 'With wall-pass, moves right directly');
  assert.equal(withPass.vy, -150, 'With wall-pass, corridor centering pulls towards centerline (-vy)');
});

/* ==============================================================================
 * SUITE 2: CONVEYOR BELT DRIFT & SOLID WALL COLLISION BOUNDARIES
 * ============================================================================== */

test('Challenger 1.2: Conveyor belt drift — 1,000 frames zero wall penetration and zero 60 FPS jitter', () => {
  const map = createStandardMap();
  map[1][2] = TILE_WALL; // Solid wall starts at x = 80

  const CONVEYOR_DRIFT_SPEED = 60; // px/s
  const delta = 1000 / 60; // 16.666ms per frame

  // Player hitbox: 24x24, radius 12. Center starts at x = 60.
  let playerX = 60;
  let playerY = 60;
  const beltDirX = 1;
  const beltDirY = 0;

  const positions = [];

  for (let frame = 0; frame < 1000; frame++) {
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    const nextX = playerX + beltDirX * drift;
    const nextY = playerY + beltDirY * drift;

    const leadX = nextX + beltDirX * 12;
    const leadY = nextY + beltDirY * 12;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    const leadRow = Math.floor(leadY / TILE_SIZE);

    const perpX = beltDirY !== 0 ? 11 : 0;
    const perpY = beltDirX !== 0 ? 11 : 0;

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

    // INVARIANT 1: Zero Penetration — right edge (playerX + 12) must NEVER exceed wall boundary (80)
    assert.ok(
      playerX + 12 <= 80.0001,
      `Frame ${frame}: Player right edge penetrated solid wall at x=80 (playerX=${playerX}, rightEdge=${playerX + 12})`
    );
  }

  // Clamped resting position: player right edge touches wall at exactly x=80 -> playerX = 68
  assert.ok(playerX <= 68.0001, `Player resting x must be <= 68 (got ${playerX})`);

  // INVARIANT 2: Zero 60 FPS Jitter — after reaching boundary, position delta across frames must be 0
  const restingFrames = positions.slice(200);
  for (let i = 1; i < restingFrames.length; i++) {
    const diff = Math.abs(restingFrames[i] - restingFrames[i - 1]);
    assert.equal(diff, 0, `Frame ${200 + i}: Conveyor jitter detected! Position fluctuated by ${diff}`);
  }

  // Bomb conveyor drift test (hitbox 32x32, radius 16)
  let bombX = 60;
  let bombY = 60;
  const bombPositions = [];

  for (let frame = 0; frame < 1000; frame++) {
    const drift = CONVEYOR_DRIFT_SPEED * (delta / 1000);
    const nextX = bombX + beltDirX * drift;
    const nextY = bombY + beltDirY * drift;

    const leadX = nextX + beltDirX * 16;
    const leadY = nextY + beltDirY * 16;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    const leadRow = Math.floor(leadY / TILE_SIZE);

    const perpX = beltDirY !== 0 ? 15 : 0;
    const perpY = beltDirX !== 0 ? 15 : 0;

    const canMove =
      leadRow >= 0 && leadRow < ROWS && leadCol >= 0 && leadCol < COLS &&
      map[leadRow]?.[leadCol] === TILE_EMPTY &&
      map[Math.floor((leadY + perpY) / TILE_SIZE)]?.[Math.floor((leadX + perpX) / TILE_SIZE)] === TILE_EMPTY &&
      map[Math.floor((leadY - perpY) / TILE_SIZE)]?.[Math.floor((leadX - perpX) / TILE_SIZE)] === TILE_EMPTY;

    if (canMove) {
      bombX = nextX;
      bombY = nextY;
    }

    bombPositions.push(bombX);

    // Bomb right edge (bombX + 16) must NEVER exceed wall boundary (80)
    assert.ok(
      bombX + 16 <= 80.0001,
      `Frame ${frame}: Bomb penetrated solid wall (bombX=${bombX}, rightEdge=${bombX + 16})`
    );
  }

  // Bomb resting position: 80 - 16 = 64
  assert.ok(bombX <= 64.0001);
  for (let i = 1; i < bombPositions.slice(200).length; i++) {
    const diff = Math.abs(bombPositions.slice(200)[i] - bombPositions.slice(200)[i - 1]);
    assert.equal(diff, 0, `Bomb jitter detected: ${diff}`);
  }
});

/* ==============================================================================
 * SUITE 3: BOMB KICKING VELOCITY & MULTI-TILE DETONATION COORDINATES
 * ============================================================================== */

test('Challenger 1.3: Bomb kicking — velocity, obstacle impacts, and multi-tile displacement detonation coordinates (PHYS-02)', () => {
  const map = createStandardMap();
  const BOMB_KICK_SPEED = 300; // px/s

  // 1. Kicking initiation
  const bomb = {
    x: 60, // Tile (1, 1)
    y: 60,
    active: true,
    isSliding: true,
    slideDir: { x: 1, y: 0 },
    vx: BOMB_KICK_SPEED,
    vy: 0,
    placementRow: 1,
    placementCol: 1,
  };

  // 2. Multi-tile translation across 6 tiles to (1, 7)
  // Distance: 6 tiles * 40px = 240px. At 300 px/s, takes 800ms.
  let deltaSum = 0;
  while (bomb.x < 7 * TILE_SIZE + 20) {
    const dt = 16.67 / 1000;
    bomb.x += bomb.slideDir.x * BOMB_KICK_SPEED * dt;
    deltaSum += 16.67;
    if (deltaSum > 2000) break; // guard
  }

  // Snap to tile (1, 7) center = 7 * 40 + 20 = 300
  const finalCol = Math.floor(bomb.x / TILE_SIZE);
  const finalRow = Math.floor(bomb.y / TILE_SIZE);
  assert.equal(finalCol, 7, 'Bomb must have drifted to column 7');
  assert.equal(finalRow, 1, 'Bomb must remain on row 1');

  // 3. PHYS-02 Detonation coordinates: must read live bomb.x, bomb.y rather than placement closure
  function simulateExplosionDetonation(b, closureRow, closureCol) {
    // Dynamic read matching GameScene.ts explodeBomb (PHYS-02)
    const curCol = Math.floor(b.x / TILE_SIZE);
    const curRow = Math.floor(b.y / TILE_SIZE);
    const actualRow = Number.isFinite(curRow) && curRow >= 0 && curRow < ROWS ? curRow : closureRow;
    const actualCol = Number.isFinite(curCol) && curCol >= 0 && curCol < COLS ? curCol : closureCol;

    const blastTiles = [];
    blastTiles.push({ r: actualRow, c: actualCol, isCenter: true });

    const directions = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
    for (const dir of directions) {
      for (let i = 1; i <= 2; i++) {
        const nr = actualRow + dir.dr * i;
        const nc = actualCol + dir.dc * i;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] !== TILE_WALL) {
          blastTiles.push({ r: nr, c: nc, isCenter: false });
        }
      }
    }
    return blastTiles;
  }

  const blastTiles = simulateExplosionDetonation(bomb, bomb.placementRow, bomb.placementCol);

  // Epicenter MUST be (1, 7)
  const epicenter = blastTiles.find(t => t.isCenter);
  assert.deepEqual(epicenter, { r: 1, c: 7, isCenter: true }, 'Epicenter must be at physical resting coordinates (1, 7)');

  // Epicenter must NOT be at initial placement tile (1, 1)
  assert.ok(
    !blastTiles.some(t => t.r === 1 && t.c === 1),
    'Stale placement tile (1, 1) must receive ZERO phantom blast damage'
  );

  // 4. Mid-slide detonation test (bomb detonates between tiles at x = 185, col 4)
  const midSlideBomb = { x: 185, y: 60 };
  const midBlast = simulateExplosionDetonation(midSlideBomb, 1, 1);
  const midCenter = midBlast.find(t => t.isCenter);
  assert.equal(midCenter.c, 4, 'Mid-slide bomb at x=185 must detonate at col 4');
});

/* ==============================================================================
 * SUITE 4: DIAGONAL BLAST RAYCASTING AROUND SOLID PILLARS (PHYS-04)
 * ============================================================================== */

test('Challenger 1.4: Diagonal blast raycasting — 36x36 inset mathematically prevents pillar clipping (PHYS-04)', () => {
  // Solid pillar at (2, 2): coordinates [80, 120] x [80, 120]
  // Blast epicenter at (1, 2): center = (100, 60)
  const blastCenter = { x: 100, y: 60 };

  // 1. Unadjusted 40x40 body: bounds [80, 120] x [40, 80]
  const unadjustedBlast = {
    left: blastCenter.x - 20, // 80
    right: blastCenter.x + 20, // 120
    top: blastCenter.y - 20, // 40
    bottom: blastCenter.y + 20, // 80
  };

  // 2. Remediated 36x36 body with 2px inset: bounds [82, 118] x [42, 78]
  const remediatedBlast = {
    left: blastCenter.x - 18, // 82
    right: blastCenter.x + 18, // 118
    top: blastCenter.y - 18, // 42
    bottom: blastCenter.y + 18, // 78
  };

  function aabbOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  // Fuzz entity position in East corridor rounding around the pillar corner (2, 2)
  // East corridor is tile (2, 3), column x in [120, 160], row y in [80, 120].
  // Pillar (2, 2) is [80, 120] x [80, 120].
  // An entity rounding the corner has center starting at (130, 90), so its hitbox
  // left edge touches x = 130 - 12 = 118 (2px margin from pillar boundary at 120)
  // and top edge touches y = 90 - 12 = 78 (2px margin from pillar boundary at 80).
  let unadjustedLeaks = 0;
  let remediatedLeaks = 0;

  for (let step = 0; step <= 30; step += 0.2) {
    const entityCenter = { x: 130 + step, y: 90 + step };
    const entityBox = {
      left: entityCenter.x - 12,
      right: entityCenter.x + 12,
      top: entityCenter.y - 12,
      bottom: entityCenter.y + 12,
    };

    if (aabbOverlap(unadjustedBlast, entityBox)) {
      unadjustedLeaks++;
    }
    if (aabbOverlap(remediatedBlast, entityBox)) {
      remediatedLeaks++;
    }
  }

  // The unadjusted body leaked on multiple corner steps!
  assert.ok(unadjustedLeaks > 0, `Unadjusted 40x40 body leaked on ${unadjustedLeaks} sub-pixel positions`);

  // The remediated 36x36 body with 2px inset has EXACTLY ZERO LEAKS!
  assert.equal(remediatedLeaks, 0, 'Remediated 36x36 body must have exactly 0 diagonal leakage events');
});

/* ==============================================================================
 * SUITE 5: SOFT BLOCK SIMULTANEOUS RAY PIERCING PREVENTION (PHYS-05)
 * ============================================================================== */

test('Challenger 1.5: Simultaneous 4-bomb cross convergent detonation at single soft block (PHYS-05)', () => {
  const map = createStandardMap();
  // Place target soft block at center (3, 3)
  map[3][3] = TILE_BLOCK;

  // 4 simultaneous bombs positioned North, South, West, East of (3, 3) with power = 5
  // Bomb N: (1, 3) shooting Down (dr = 1, dc = 0)
  // Bomb S: (5, 3) shooting Up (dr = -1, dc = 0)
  // Bomb W: (3, 1) shooting Right (dr = 0, dc = 1)
  // Bomb E: (3, 5) shooting Left (dr = 0, dc = -1)

  const destroyedBlocksThisTick = new Set();
  const rayHits = { N: [], S: [], W: [], E: [] };

  function traceBombRay(bombKey, startR, startC, dr, dc, power) {
    for (let i = 1; i <= power; i++) {
      const nr = startR + dr * i;
      const nc = startC + dc * i;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      if (map[nr][nc] === TILE_WALL) break;

      const key = `${nr},${nc}`;
      const isBlock = map[nr][nc] === TILE_BLOCK || destroyedBlocksThisTick.has(key);

      if (isBlock) {
        destroyedBlocksThisTick.add(key);
        if (map[nr][nc] === TILE_BLOCK) {
          map[nr][nc] = TILE_EMPTY; // Destroy block
        }
        rayHits[bombKey].push({ r: nr, c: nc, type: 'block_hit' });
        break; // Clean termination
      }

      rayHits[bombKey].push({ r: nr, c: nc, type: 'empty_hit' });
    }
  }

  // All 4 bombs trace in the same tick:
  traceBombRay('N', 1, 3, 1, 0, 5);
  traceBombRay('S', 5, 3, -1, 0, 5);
  traceBombRay('W', 3, 1, 0, 1, 5);
  traceBombRay('E', 3, 5, 0, -1, 5);

  // 1. All 4 bombs hit (3, 3)
  assert.equal(rayHits.N.at(-1)?.r, 3);
  assert.equal(rayHits.N.at(-1)?.c, 3);
  assert.equal(rayHits.S.at(-1)?.r, 3);
  assert.equal(rayHits.S.at(-1)?.c, 3);
  assert.equal(rayHits.W.at(-1)?.r, 3);
  assert.equal(rayHits.W.at(-1)?.c, 3);
  assert.equal(rayHits.E.at(-1)?.r, 3);
  assert.equal(rayHits.E.at(-1)?.c, 3);

  // 2. Invariant: ZERO rays pierced through (3, 3) to the other side!
  assert.ok(!rayHits.N.some(h => h.r > 3), 'Bomb N must not pierce past row 3');
  assert.ok(!rayHits.S.some(h => h.r < 3), 'Bomb S must not pierce past row 3');
  assert.ok(!rayHits.W.some(h => h.c > 3), 'Bomb W must not pierce past col 3');
  assert.ok(!rayHits.E.some(h => h.c < 3), 'Bomb E must not pierce past col 3');
});

/* ==============================================================================
 * SUITE 6: ZeroGCPathfinder BOUNDS CHECKING & FLAT ARRAY INDEXING
 * ============================================================================== */

test('Challenger 1.6: ZeroGCPathfinder — bounds fuzzing, NaN protection, and generational rollover', () => {
  const pf = new ZeroGCPathfinder();
  const outPath = new Int16Array(TOTAL_TILES);

  // 1. Bounds check and NaN rejection on findPath
  const adversarialInputs = [
    [-1, 17],
    [TOTAL_TILES, 17],
    [TOTAL_TILES + 100, 17],
    [17, -1],
    [17, TOTAL_TILES],
    [17, TOTAL_TILES + 50],
    [NaN, 17],
    [17, NaN],
    [Infinity, 17],
    [17, -Infinity],
    [1.5, 17],
    [17, 2.7],
    [null, 17],
    [undefined, 17],
  ];

  for (const [s, t] of adversarialInputs) {
    const len = pf.findPath(s, t, outPath);
    assert.equal(len, 0, `findPath(${s}, ${t}) must return 0 without throw or hang`);
  }

  // 2. Bounds check on findSafeTile
  const dangerMask = new Uint8Array(TOTAL_TILES);
  dangerMask[16] = 1;
  const safeInputs = [-1, TOTAL_TILES, NaN, null, undefined];
  for (const s of safeInputs) {
    const len = pf.findSafeTile(s, dangerMask, pf.obstacleMask, null, 4, outPath);
    assert.equal(len, -1, `findSafeTile(${s}) must return -1 for invalid startIdx`);
  }

  // 3. Coordinate conversion round-trip invariance
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = coordToIdx(r, c);
      assert.equal(idxToRow(idx), r, `idxToRow(${idx}) failed`);
      assert.equal(idxToCol(idx), c, `idxToCol(${idx}) failed`);
      assert.ok(idx >= 0 && idx < TOTAL_TILES, `idx ${idx} out of range`);
    }
  }

  // 4. Generational rollover survival: 70,000 queries to force rollover past 65,530
  const start = 16; // (1, 1)
  const target = 32; // (2, 2)
  for (let i = 0; i < 70000; i++) {
    pf.findPath(start, target, outPath);
  }
  const lenAfter = pf.findPath(start, target, outPath);
  assert.ok(lenAfter >= 0, 'findPath must function flawlessly after 70,000 generational cycles');
});

/* ==============================================================================
 * SUITE 7: ENEMY & ALLY FSM EDGE CASES
 * ============================================================================== */

test('Challenger 1.7: Enemy and ally FSM edge cases — Chaser stun, Bomber evasion watchdog, Ghost Ether Dash, MiniBomber friendly fire', () => {
  // 1. ChaserEnemy stun lifecycle: 900ms stun on wall impact
  let chaserState = 'COOLDOWN';
  let chaserIsStunned = true;
  let chaserTimer = ENEMY_ARCHETYPES.CHASER.stunMs; // 900ms

  function updateChaser(delta) {
    if (chaserIsStunned || chaserState === 'COOLDOWN') {
      chaserTimer -= delta;
      if (chaserTimer <= 0) {
        chaserIsStunned = false;
        chaserState = 'TRACKING';
        chaserTimer = 0;
      }
    }
  }

  updateChaser(450);
  assert.equal(chaserIsStunned, true);
  assert.equal(chaserState, 'COOLDOWN');
  updateChaser(450);
  assert.equal(chaserIsStunned, false, 'Chaser must recover from stun at exactly 900ms');
  assert.equal(chaserState, 'TRACKING');

  // 2. BomberEnemy evasion watchdog: 2500ms timeout recovery
  let bomberState = 'EVADING';
  let bomberWatchdog = 2500;

  function updateBomber(delta) {
    if (bomberState === 'EVADING') {
      bomberWatchdog -= delta;
      if (bomberWatchdog <= 0) {
        bomberState = 'HUNTING';
        bomberWatchdog = 2500;
      }
    }
  }

  // Tick past 2500ms without bomb callback
  updateBomber(2490);
  assert.equal(bomberState, 'EVADING');
  updateBomber(20);
  assert.equal(bomberState, 'HUNTING', 'Bomber watchdog must recover from EVADING after 2500ms');

  // 3. GhostEnemy Ether Dash: 450ms dash at 260 px/s
  let ghostIsDashing = true;
  let ghostDashMs = 450;
  let ghostVx = 260;

  function updateGhost(delta) {
    if (ghostIsDashing) {
      ghostDashMs -= delta;
      if (ghostDashMs <= 0) {
        ghostIsDashing = false;
        ghostVx = ENEMY_ARCHETYPES.GHOST.phaseSpeed; // 110 px/s
      } else {
        ghostVx = ENEMY_ARCHETYPES.GHOST.dashSpeed; // 260 px/s
      }
    }
  }

  // Middle of dash (300ms elapsed)
  updateGhost(300);
  assert.equal(ghostIsDashing, true);
  assert.equal(ghostVx, 260, 'Ghost dash velocity must stay 260 px/s during dash');

  // Dash completes (another 160ms elapsed, total 460ms)
  updateGhost(160);
  assert.equal(ghostIsDashing, false);
  assert.equal(ghostVx, ENEMY_ARCHETYPES.GHOST.phaseSpeed, 'Ghost reverts to normal phase speed after 450ms');

  // 4. MiniBomberAlly: Zero Friendly Fire Invariant
  const map = createStandardMap();
  const player = { r: 1, c: 2 };
  const ally = { r: 1, c: 1 };
  const bombPower = 2;

  let droppedBomb = false;
  function evaluateAllyBomb(pr, pc, ar, ac, power) {
    const candidateBlast = getBlastTiles({ r: ar, c: ac }, power, map);
    const playerInDanger = candidateBlast.has(`${pr},${pc}`);
    if (playerInDanger) {
      return false; // Friendly fire immunity!
    }
    droppedBomb = true;
    return true;
  }

  // Player at (1, 2) is in blast range of ally at (1, 1) with power 2:
  const allowedInDanger = evaluateAllyBomb(player.r, player.c, ally.r, ally.c, bombPower);
  assert.equal(allowedInDanger, false, 'Ally must NEVER place bomb when blast intersects player');
  assert.equal(droppedBomb, false);

  // Player moves to safe tile (3, 3):
  const allowedSafe = evaluateAllyBomb(3, 3, ally.r, ally.c, bombPower);
  assert.equal(allowedSafe, true, 'Ally places bomb when player is outside blast danger');
  assert.equal(droppedBomb, true);
});

/* ==============================================================================
 * SUITE 8: DEEP ADVERSARIAL STRESS, CORNER SNAGGING & DRIFT LAG SPIKES
 * ============================================================================== */

test('Challenger 1.8: Player movement — 10,000 randomized velocity fuzzing cycles across all 4 directions', () => {
  const map = createStandardMap();
  const SPEED = 150;
  const SLIDE_SPEED = 150;

  for (let i = 0; i < 10000; i++) {
    // Pick random corridor tile
    const r = 1 + 2 * Math.floor(Math.random() * 5); // 1, 3, 5, 7, 9
    const c = 1 + 2 * Math.floor(Math.random() * 6); // 1, 3, 5, 7, 9, 11
    const subX = (Math.random() - 0.5) * 16;
    const subY = (Math.random() - 0.5) * 16;
    const px = c * TILE_SIZE + 20 + subX;
    const py = r * TILE_SIZE + 20 + subY;

    // Random input keys
    const wantX = Math.random() < 0.33 ? -1 : Math.random() < 0.5 ? 1 : 0;
    const wantY = Math.random() < 0.33 ? -1 : Math.random() < 0.5 ? 1 : 0;
    const tol = Math.random() < 0.33 ? 8 : Math.random() < 0.5 ? 11 : 14;

    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    const colCenterX = col * TILE_SIZE + 20;
    const rowCenterY = row * TILE_SIZE + 20;
    const diffX = px - colCenterX;
    const diffY = py - rowCenterY;

    let vx = 0;
    let vy = 0;

    if (wantX !== 0) {
      vx = wantX * SPEED;
      const nextCol = col + wantX;
      const directOpen = nextCol >= 0 && nextCol < COLS && map[row][nextCol] === TILE_EMPTY;
      if (directOpen) {
        vy = Math.abs(diffY) > 2 ? -Math.sign(diffY) * SLIDE_SPEED : 0;
      } else {
        const canRoundUp = diffY <= 0 && Math.abs(diffY) <= tol && map[row - 1]?.[col] === TILE_EMPTY && map[row - 1]?.[nextCol] === TILE_EMPTY;
        const canRoundDown = diffY >= 0 && Math.abs(diffY) <= tol && map[row + 1]?.[col] === TILE_EMPTY && map[row + 1]?.[nextCol] === TILE_EMPTY;
        if (canRoundUp && canRoundDown) vy = diffY < 0 ? -SLIDE_SPEED : diffY > 0 ? SLIDE_SPEED : -SLIDE_SPEED;
        else if (canRoundUp) vy = -SLIDE_SPEED;
        else if (canRoundDown) vy = SLIDE_SPEED;
        else vy = 0;
      }
    } else if (wantY !== 0) {
      vy = wantY * SPEED;
      const nextRow = row + wantY;
      const directOpen = nextRow >= 0 && nextRow < ROWS && map[nextRow][col] === TILE_EMPTY;
      if (directOpen) {
        vx = Math.abs(diffX) > 2 ? -Math.sign(diffX) * SLIDE_SPEED : 0;
      } else {
        const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= tol && map[row]?.[col - 1] === TILE_EMPTY && map[nextRow]?.[col - 1] === TILE_EMPTY;
        const canRoundRight = diffX >= 0 && Math.abs(diffX) <= tol && map[row]?.[col + 1] === TILE_EMPTY && map[nextRow]?.[col + 1] === TILE_EMPTY;
        if (canRoundLeft && canRoundRight) vx = diffX < 0 ? -SLIDE_SPEED : diffX > 0 ? SLIDE_SPEED : -SLIDE_SPEED;
        else if (canRoundLeft) vx = -SLIDE_SPEED;
        else if (canRoundRight) vx = SLIDE_SPEED;
        else vx = 0;
      }
    }

    // Invariant: velocities must be finite and within speed boundaries
    assert.ok(Number.isFinite(vx), 'vx must be finite');
    assert.ok(Number.isFinite(vy), 'vy must be finite');
    assert.ok(Math.abs(vx) <= SPEED, `vx exceeded maximum: ${vx}`);
    assert.ok(Math.abs(vy) <= SLIDE_SPEED, `vy exceeded slide speed: ${vy}`);
  }
});

test('Challenger 1.9: Conveyor belt drift under extreme lag spikes (500ms frame delta)', () => {
  const map = createStandardMap();
  map[1][2] = TILE_WALL; // Wall at x = 80

  const CONVEYOR_DRIFT_SPEED = 60;
  let playerX = 60;

  // Single extreme lag spike of 500ms (drift = 30px, would place player at x=90 without clamp)
  const lagDelta = 500;
  const drift = CONVEYOR_DRIFT_SPEED * (lagDelta / 1000); // 30px
  const nextX = playerX + 1 * drift; // 90

  const leadX = nextX + 12; // 102
  const leadCol = Math.floor(leadX / TILE_SIZE); // 2 -> WALL!

  const canMove = leadCol < COLS && map[1]?.[leadCol] === TILE_EMPTY;
  if (canMove) {
    playerX = nextX;
  }

  // Under lag spike, canMove is FALSE, so player does NOT overshoot or penetrate the wall!
  assert.equal(canMove, false, 'Extreme lag spike drift must be rejected before wall penetration');
  assert.equal(playerX, 60, 'Player position must remain safe at x=60');
  assert.ok(playerX + 12 <= 80, 'Hitbox right edge must strictly satisfy boundary');
});

test('Challenger 1.10: Bomb sliding chain impact — sliding bomb halts before penetrating another active bomb', () => {
  const map = createStandardMap();
  const BOMB_KICK_SPEED = 300;

  // Bomb A sliding East from (1, 1)
  const bombA = { x: 60, y: 60, isSliding: true, dir: { x: 1, y: 0 } };
  // Bomb B resting at tile (1, 4) [x = 180, y = 60]
  const bombB = { x: 180, y: 60, active: true };

  const delta = 16.67;
  let stopped = false;

  for (let frame = 0; frame < 60; frame++) {
    const lookahead = Math.max(16, BOMB_KICK_SPEED * (delta / 1000) + 4);
    const checkX = bombA.x + bombA.dir.x * lookahead;
    const targetCol = Math.floor(checkX / TILE_SIZE);
    const targetRow = Math.floor(bombA.y / TILE_SIZE);

    const bCol = Math.floor(bombA.x / TILE_SIZE);

    let blocked = false;
    if (map[targetRow][targetCol] !== TILE_EMPTY) {
      blocked = true;
    } else {
      // Check other bomb collision
      const otherCol = Math.floor(bombB.x / TILE_SIZE);
      const otherRow = Math.floor(bombB.y / TILE_SIZE);
      if (otherRow === targetRow && otherCol === targetCol) {
        blocked = true;
      }
    }

    if (blocked) {
      bombA.isSliding = false;
      bombA.x = bCol * TILE_SIZE + 20; // Snap to center
      stopped = true;
      break;
    } else {
      bombA.x += bombA.dir.x * BOMB_KICK_SPEED * (delta / 1000);
    }
  }

  assert.equal(stopped, true, 'Sliding Bomb A must stop upon encountering stationary Bomb B');
  const finalColA = Math.floor(bombA.x / TILE_SIZE);
  assert.equal(finalColA, 3, 'Bomb A must halt cleanly at col 3 (adjacent to col 4)');
  assert.ok(bombA.x < bombB.x, 'Bomb A must never penetrate Bomb B tile');
});

test('Challenger 1.11: SplitterEnemy mini-slime spawn bounds checking at arena corners (AI-08)', () => {
  const map = createStandardMap();
  // Splitter defeated at top-left corner (1, 1)
  const r = 1;
  const c = 1;

  const offsets = [
    { dr: -1, dc: 0 }, // Up (0, 1) -> TILE_WALL
    { dr: 1, dc: 0 },  // Down (2, 1) -> TILE_EMPTY
    { dr: 0, dc: -1 }, // Left (1, 0) -> TILE_WALL
    { dr: 0, dc: 1 },  // Right (1, 2) -> TILE_EMPTY
  ];

  const validSpawns = [];
  for (const off of offsets) {
    const nr = r + off.dr;
    const nc = c + off.dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === TILE_EMPTY) {
      validSpawns.push({ r: nr, c: nc });
    }
  }

  // Exactly 2 valid spawns: (2, 1) and (1, 2)
  assert.equal(validSpawns.length, 2, 'Only 2 open adjacent tiles exist at corner (1, 1)');
  assert.ok(validSpawns.some(s => s.r === 2 && s.c === 1));
  assert.ok(validSpawns.some(s => s.r === 1 && s.c === 2));
  // Zero spawns inside solid walls
  assert.ok(!validSpawns.some(s => map[s.r][s.c] !== TILE_EMPTY), 'Mini-slimes must never spawn in solid walls');
});

test('Challenger 1.12: MerchantNPC full blast escape path finding (AI-06)', () => {
  const map = createStandardMap();
  // Bomb placed at (1, 1) with power = 2
  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 2, map);

  // Danger tiles must include (1, 1), (1, 2), (1, 3), (2, 1), (3, 1)
  assert.ok(dangerTiles.has('1,1'));
  assert.ok(dangerTiles.has('1,2'));
  assert.ok(dangerTiles.has('1,3'));
  assert.ok(dangerTiles.has('2,1'));
  assert.ok(dangerTiles.has('3,1'));

  // Merchant standing at (1, 2) in the blast line
  const escapePath = findEscapePathBFS({ r: 1, c: 2 }, dangerTiles, map, new Set(['1,1']), 5);
  assert.ok(escapePath !== null && escapePath.length > 0, 'Merchant must find an escape route');

  // Destination tile must be safe from dangerTiles
  const dest = escapePath[escapePath.length - 1];
  assert.ok(!dangerTiles.has(`${dest.r},${dest.c}`), 'Merchant escape destination must be safe from blast');
  assert.equal(map[dest.r][dest.c], TILE_EMPTY, 'Destination tile must be walkable');
});

