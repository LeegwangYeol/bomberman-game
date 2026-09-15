import test from 'node:test';
import assert from 'node:assert/strict';

const TILE_SIZE = 40;
const ROWS = 13;
const COLS = 15;
const TILE_EMPTY = 0;
const TILE_WALL = 1;

const SPEED = 150;
const SLIDE_SPEED = 150;
const SNAP_THRESHOLD = 2;

/**
 * Pure simulation model of the proposed player movement & corner sliding algorithm
 */
export function computePlayerVelocity(player, input, map, bombs = []) {
  const { left, right, up, down } = input;

  if (!left && !right && !up && !down) {
    return { vx: 0, vy: 0, snappedX: player.x, snappedY: player.y };
  }

  const px = player.x;
  const py = player.y;

  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);

  const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
  const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;

  const diffX = px - colCenterX;
  const diffY = py - rowCenterY;

  const isPassable = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (map[r][c] !== TILE_EMPTY) return false;

    for (const b of bombs) {
      if (b.r === r && b.c === c) {
        if (!(row === r && col === c)) {
          return false;
        }
      }
    }
    return true;
  };

  let wantX = 0;
  let wantY = 0;
  if (left && !right) wantX = -1;
  else if (right && !left) wantX = 1;

  if (up && !down) wantY = -1;
  else if (down && !up) wantY = 1;

  let primaryAxis = 'x';
  if (wantX !== 0 && wantY !== 0) {
    const xOpen = isPassable(row, col + wantX);
    const yOpen = isPassable(row + wantY, col);
    if (xOpen && !yOpen) {
      primaryAxis = 'x';
    } else if (yOpen && !xOpen) {
      primaryAxis = 'y';
    } else {
      primaryAxis = input.lastAxis || (input.timeY > input.timeX ? 'y' : 'x');
    }
  } else if (wantX !== 0) {
    primaryAxis = 'x';
  } else if (wantY !== 0) {
    primaryAxis = 'y';
  }

  let vx = 0;
  let vy = 0;
  let snappedX = px;
  let snappedY = py;

  if (primaryAxis === 'x') {
    vx = wantX * SPEED;
    const nextCol = col + wantX;
    const directOpen = isPassable(row, nextCol);

    if (directOpen) {
      if (Math.abs(diffY) > SNAP_THRESHOLD) {
        vy = -Math.sign(diffY) * SLIDE_SPEED;
      } else {
        snappedY = rowCenterY;
        vy = 0;
      }
    } else {
      const canRoundUp = diffY < -3 && isPassable(row - 1, col) && isPassable(row - 1, nextCol);
      const canRoundDown = diffY > 3 && isPassable(row + 1, col) && isPassable(row + 1, nextCol);

      if (canRoundUp) {
        vy = -SLIDE_SPEED;
      } else if (canRoundDown) {
        vy = SLIDE_SPEED;
      } else {
        vy = 0;
      }
    }
  } else {
    // primaryAxis === 'y'
    vy = wantY * SPEED;
    const nextRow = row + wantY;
    const directOpen = isPassable(nextRow, col);

    if (directOpen) {
      if (Math.abs(diffX) > SNAP_THRESHOLD) {
        vx = -Math.sign(diffX) * SLIDE_SPEED;
      } else {
        snappedX = colCenterX;
        vx = 0;
      }
    } else {
      const canRoundLeft = diffX < -3 && isPassable(row, col - 1) && isPassable(nextRow, col - 1);
      const canRoundRight = diffX > 3 && isPassable(row, col + 1) && isPassable(nextRow, col + 1);

      if (canRoundLeft) {
        vx = -SLIDE_SPEED;
      } else if (canRoundRight) {
        vx = SLIDE_SPEED;
      } else {
        vx = 0;
      }
    }
  }

  return { vx, vy, snappedX, snappedY };
}

function createTestMap() {
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

test('Vertical straight motion: automatically slides to center when misaligned left', () => {
  const map = createTestMap();
  // Player at col 1 (center 60), row 3 (center 140). x is 54 (6px misaligned left).
  const player = { x: 54, y: 140 };
  const input = { up: true, down: false, left: false, right: false };

  const res = computePlayerVelocity(player, input, map);
  assert.equal(res.vy, -150);
  assert.equal(res.vx, 150); // Corrects to right towards center (60)
});

test('Vertical straight motion: automatically slides to center when misaligned right', () => {
  const map = createTestMap();
  const player = { x: 67, y: 140 }; // 7px misaligned right
  const input = { up: true, down: false, left: false, right: false };

  const res = computePlayerVelocity(player, input, map);
  assert.equal(res.vy, -150);
  assert.equal(res.vx, -150); // Corrects to left towards center (60)
});

test('Vertical straight motion: snaps and zeroes orthogonal velocity when within threshold', () => {
  const map = createTestMap();
  const player = { x: 61, y: 140 }; // 1px from center (60)
  const input = { up: true, down: false, left: false, right: false };

  const res = computePlayerVelocity(player, input, map);
  assert.equal(res.vy, -150);
  assert.equal(res.vx, 0);
  assert.equal(res.snappedX, 60);
});

test('Corner Rounding: slides right past pillar when turning up at intersection', () => {
  const map = createTestMap();
  // Pillar at (2, 2). Player at row 2, col 1 is open.
  // Suppose player is at row 3, col 2 (where row 2 col 2 is a pillar wall!).
  // Player is at x = 74 (leaning towards col 1 center 60), y = 140.
  // Col is 1, colCenter is 60, diffX = +14.
  // Moving UP is directOpen: row 2 col 1 is OPEN!
  // So player slides left towards 60 while moving UP.
  const player = { x: 74, y: 140 };
  const input = { up: true, down: false, left: false, right: false };

  const res = computePlayerVelocity(player, input, map);
  assert.equal(res.vy, -150);
  assert.equal(res.vx, -150);
});

test('Dead End: facing wall with no side openings produces zero slide velocity', () => {
  const map = createTestMap();
  // Outer wall at row 0. Player at row 1 col 1, moving up.
  // Row 0 col 1 is WALL. Row 0 col 0 is WALL, Row 0 col 2 is WALL.
  const player = { x: 60, y: 60 };
  const input = { up: true, down: false, left: false, right: false };

  const res = computePlayerVelocity(player, input, map);
  assert.equal(res.vy, -150);
  assert.equal(res.vx, 0); // No ghost slide
});

test('Simultaneous input at corridor: prioritizes open axis over blocked axis', () => {
  const map = createTestMap();
  // In vertical corridor at col 1, row 2: left is outer wall (col 0), right is pillar (col 2).
  // Up (row 1 col 1) is open. Down (row 3 col 1) is open.
  // Player presses UP and RIGHT simultaneously!
  const player = { x: 60, y: 100 };
  const input = { up: true, down: false, left: false, right: true };

  const res = computePlayerVelocity(player, input, map);
  // UP is open, RIGHT is blocked by pillar at (2, 2).
  // Result must prioritize UP!
  assert.equal(res.vy, -150);
  assert.equal(res.vx, 0);
});
