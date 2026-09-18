import test from 'node:test';
import assert from 'node:assert/strict';

// Constants matching src/game/GameScene.ts & src/game/pathfinding.ts
const TILE_SIZE = 40;
const ROWS = 13;
const COLS = 15;
const TILE_EMPTY = 0;
const TILE_WALL = 1;
const TILE_BLOCK = 2;

const SPEED = 150;
const SLIDE_SPEED = 150;
const SNAP_THRESHOLD = 2;

const PLAYER_BODY_SIZE = 24;
const PLAYER_BODY_OFFSET = 8; // (40 - 24) / 2 = 8px margin when centered

/**
 * Standard Bomberman Arena generator (matching GameScene.ts generateMap)
 */
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

/**
 * High-Fidelity Simulator & Reference Oracle for Player Movement,
 * Corridor Centering, Corner-Sliding, Dead-End Safety, and Bomb Passability.
 */
class PlayerMovementSimulator {
  constructor(map = createStandardMap()) {
    this.map = map.map(row => [...row]);
    // Player state: center of tile (1, 1) by default: x = 60, y = 60
    this.player = {
      x: 1 * TILE_SIZE + TILE_SIZE / 2,
      y: 1 * TILE_SIZE + TILE_SIZE / 2,
      vx: 0,
      vy: 0,
      flipX: false,
      bodyWidth: PLAYER_BODY_SIZE,
      bodyHeight: PLAYER_BODY_SIZE,
      bodyOffsetX: PLAYER_BODY_OFFSET,
      bodyOffsetY: PLAYER_BODY_OFFSET,
    };
    this.bombs = []; // { x, y, row, col, active: true }
    this.cursors = {
      left: { isDown: false, timeDown: 0 },
      right: { isDown: false, timeDown: 0 },
      up: { isDown: false, timeDown: 0 },
      down: { isDown: false, timeDown: 0 },
    };
    this.mobileInput = { up: false, down: false, left: false, right: false, bomb: false };
    this.cornerSlideTolerance = 8;
    this.remediatedCornerSlide = false;
    this.hasWallPass = false;
    this.hasBombPass = false;
  }

  setPlayerPosition(x, y) {
    this.player.x = x;
    this.player.y = y;
  }

  placeBomb(r, c) {
    const centerX = c * TILE_SIZE + TILE_SIZE / 2;
    const centerY = r * TILE_SIZE + TILE_SIZE / 2;
    const bomb = { x: centerX, y: centerY, row: r, col: c, active: true };
    this.bombs.push(bomb);
    return bomb;
  }

  /**
   * Fast tile passability check matching GameScene.ts isPassable
   */
  isPassable(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (this.map[r][c] === TILE_WALL) return false;
    if (this.map[r][c] === TILE_BLOCK && !this.hasWallPass) return false;

    if (!this.hasBombPass) {
      const playerCol = Math.floor(this.player.x / TILE_SIZE);
      const playerRow = Math.floor(this.player.y / TILE_SIZE);

      let hasBomb = false;
      for (const b of this.bombs) {
        if (b.active) {
          const br = Math.floor(b.y / TILE_SIZE);
          const bc = Math.floor(b.x / TILE_SIZE);
          if (br === r && bc === c) {
            // Allow stepping off a bomb if player is currently on it
            if (!(playerRow === r && playerCol === c)) {
              hasBomb = true;
            }
          }
        }
      }
      if (hasBomb) return false;
    }
    return true;
  }

  /**
   * Exact execution of updatePlayerMovement() from GameScene.ts
   */
  updatePlayerMovement() {
    const mInput = this.mobileInput;
    const left = Boolean(this.cursors.left.isDown || mInput.left);
    const right = Boolean(this.cursors.right.isDown || mInput.right);
    const up = Boolean(this.cursors.up.isDown || mInput.up);
    const down = Boolean(this.cursors.down.isDown || mInput.down);

    if (!left && !right && !up && !down) {
      this.player.vx = 0;
      this.player.vy = 0;
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

    // Directional intent
    let wantX = 0;
    let wantY = 0;
    if (left && !right) wantX = -1;
    else if (right && !left) wantX = 1;

    if (up && !down) wantY = -1;
    else if (down && !up) wantY = 1;

    // Resolve dominant axis when multiple inputs are pressed
    let primaryAxis = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = this.isPassable(row, col + wantX);
      const yOpen = this.isPassable(row + wantY, col);

      if (xOpen && !yOpen) {
        primaryAxis = 'x';
      } else if (yOpen && !xOpen) {
        primaryAxis = 'y';
      } else {
        const timeX = wantX < 0 ? this.cursors.left.timeDown : this.cursors.right.timeDown;
        const timeY = wantY < 0 ? this.cursors.up.timeDown : this.cursors.down.timeDown;
        primaryAxis = timeY > timeX ? 'y' : 'x';
      }
    } else if (wantX !== 0) {
      primaryAxis = 'x';
    } else if (wantY !== 0) {
      primaryAxis = 'y';
    }

    let vx = 0;
    let vy = 0;

    if (primaryAxis === 'x') {
      vx = wantX * SPEED;
      this.player.flipX = wantX < 0;

      const nextCol = col + wantX;
      const directOpen = this.isPassable(row, nextCol);

      if (directOpen) {
        // Phase 1: Corridor Centering
        if (Math.abs(diffY) > SNAP_THRESHOLD) {
          vy = -Math.sign(diffY) * SLIDE_SPEED;
        } else {
          this.player.y = rowCenterY;
          vy = 0;
        }
      } else {
        // Phase 2: Corner Rounding
        if (this.remediatedCornerSlide) {
          const tol = this.cornerSlideTolerance || 8;
          const canRoundUp = diffY <= 0 && Math.abs(diffY) <= tol && this.isPassable(row - 1, col) && this.isPassable(row - 1, nextCol);
          const canRoundDown = diffY >= 0 && Math.abs(diffY) <= tol && this.isPassable(row + 1, col) && this.isPassable(row + 1, nextCol);

          if (canRoundUp && canRoundDown) {
            vy = diffY < 0 ? -SLIDE_SPEED : diffY > 0 ? SLIDE_SPEED : -SLIDE_SPEED;
          } else if (canRoundUp) {
            vy = -SLIDE_SPEED;
          } else if (canRoundDown) {
            vy = SLIDE_SPEED;
          } else {
            vy = 0;
          }
        } else {
          const canRoundUp = diffY < -3 && this.isPassable(row - 1, col) && this.isPassable(row - 1, nextCol);
          const canRoundDown = diffY > 3 && this.isPassable(row + 1, col) && this.isPassable(row + 1, nextCol);

          if (canRoundUp) {
            vy = -SLIDE_SPEED;
          } else if (canRoundDown) {
            vy = SLIDE_SPEED;
          } else {
            vy = 0;
          }
        }
      }
    } else {
      vy = wantY * SPEED;

      const nextRow = row + wantY;
      const directOpen = this.isPassable(nextRow, col);

      if (directOpen) {
        // Phase 1: Corridor Centering
        if (Math.abs(diffX) > SNAP_THRESHOLD) {
          vx = -Math.sign(diffX) * SLIDE_SPEED;
        } else {
          this.player.x = colCenterX;
          vx = 0;
        }
      } else {
        // Phase 2: Corner Rounding
        if (this.remediatedCornerSlide) {
          const tol = this.cornerSlideTolerance || 8;
          const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= tol && this.isPassable(row, col - 1) && this.isPassable(nextRow, col - 1);
          const canRoundRight = diffX >= 0 && Math.abs(diffX) <= tol && this.isPassable(row, col + 1) && this.isPassable(nextRow, col + 1);

          if (canRoundLeft && canRoundRight) {
            if (diffX < 0) {
              vx = -SLIDE_SPEED;
              this.player.flipX = true;
            } else if (diffX > 0) {
              vx = SLIDE_SPEED;
              this.player.flipX = false;
            } else {
              vx = -SLIDE_SPEED;
              this.player.flipX = true;
            }
          } else if (canRoundLeft) {
            vx = -SLIDE_SPEED;
            this.player.flipX = true;
          } else if (canRoundRight) {
            vx = SLIDE_SPEED;
            this.player.flipX = false;
          } else {
            vx = 0;
          }
        } else {
          const canRoundLeft = diffX < -3 && this.isPassable(row, col - 1) && this.isPassable(nextRow, col - 1);
          const canRoundRight = diffX > 3 && this.isPassable(row, col + 1) && this.isPassable(nextRow, col + 1);

          if (canRoundLeft) {
            vx = -SLIDE_SPEED;
            this.player.flipX = true;
          } else if (canRoundRight) {
            vx = SLIDE_SPEED;
            this.player.flipX = false;
          } else {
            vx = 0;
          }
        }
      }
    }

    this.player.vx = vx;
    this.player.vy = vy;
  }

  /**
   * Physics Integration step (dt seconds) with Arcade Physics static body separation
   */
  step(dt = 1 / 60) {
    this.updatePlayerMovement();

    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    // Arcade Physics AABB separation against static walls and blocks
    const halfSize = PLAYER_BODY_SIZE / 2; // 12
    const minX = this.player.x - halfSize;
    const maxX = this.player.x + halfSize;
    const minY = this.player.y - halfSize;
    const maxY = this.player.y + halfSize;

    const startCol = Math.floor((minX - 1) / TILE_SIZE);
    const endCol = Math.floor((maxX + 1) / TILE_SIZE);
    const startRow = Math.floor((minY - 1) / TILE_SIZE);
    const endRow = Math.floor((maxY + 1) / TILE_SIZE);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        if (this.map[r][c] === TILE_WALL || this.map[r][c] === TILE_BLOCK) {
          const wallLeft = c * TILE_SIZE;
          const wallRight = wallLeft + TILE_SIZE;
          const wallTop = r * TILE_SIZE;
          const wallBottom = wallTop + TILE_SIZE;

          // AABB overlap check
          if (maxX > wallLeft && minX < wallRight && maxY > wallTop && minY < wallBottom) {
            const overlapX1 = maxX - wallLeft;
            const overlapX2 = wallRight - minX;
            const overlapY1 = maxY - wallTop;
            const overlapY2 = wallBottom - minY;

            const minOverlapX = Math.min(overlapX1, overlapX2);
            const minOverlapY = Math.min(overlapY1, overlapY2);

            if (minOverlapX < minOverlapY) {
              if (overlapX1 < overlapX2) {
                this.player.x = wallLeft - halfSize;
              } else {
                this.player.x = wallRight + halfSize;
              }
            } else {
              if (overlapY1 < overlapY2) {
                this.player.y = wallTop - halfSize;
              } else {
                this.player.y = wallBottom + halfSize;
              }
            }
          }
        }
      }
    }
  }

  getPlayerAABB() {
    const half = PLAYER_BODY_SIZE / 2; // 12
    return {
      left: this.player.x - half,
      right: this.player.x + half,
      top: this.player.y - half,
      bottom: this.player.y + half,
    };
  }

  isOverlappingWall() {
    const aabb = this.getPlayerAABB();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.map[r][c] === TILE_WALL || this.map[r][c] === TILE_BLOCK) {
          const wallLeft = c * TILE_SIZE;
          const wallRight = wallLeft + TILE_SIZE;
          const wallTop = r * TILE_SIZE;
          const wallBottom = wallTop + TILE_SIZE;

          if (aabb.right > wallLeft && aabb.left < wallRight && aabb.bottom > wallTop && aabb.top < wallBottom) {
            return true;
          }
        }
      }
    }
    return false;
  }
}

/* ==============================================================================
 * SUITE 1: HITBOX CLEARANCE & GEOMETRIC MARGINS IN 40px CORRIDORS
 * ============================================================================== */

test('Hitbox Geometry: Centered player has exactly 8px clearance to corridor boundaries', () => {
  const sim = new PlayerMovementSimulator();
  // Player at center of tile (1, 1): x = 60, y = 60
  sim.setPlayerPosition(60, 60);

  const aabb = sim.getPlayerAABB();
  // Body width = 24, height = 24 -> [48, 72] x [48, 72]
  assert.equal(aabb.left, 48);
  assert.equal(aabb.right, 72);
  assert.equal(aabb.top, 48);
  assert.equal(aabb.bottom, 72);

  // Corridor tile boundaries for (1, 1): [40, 80] x [40, 80]
  const marginWest = aabb.left - 40;
  const marginEast = 80 - aabb.right;
  const marginNorth = aabb.top - 40;
  const marginSouth = 80 - aabb.bottom;

  assert.equal(marginWest, 8, 'West margin must be 8px');
  assert.equal(marginEast, 8, 'East margin must be 8px');
  assert.equal(marginNorth, 8, 'North margin must be 8px');
  assert.equal(marginSouth, 8, 'South margin must be 8px');
  assert.equal(sim.isOverlappingWall(), false, 'Centered player must never overlap walls');
});

test('Hitbox Geometry: Boundary threshold is exactly 8px before wall intersection occurs', () => {
  const sim = new PlayerMovementSimulator();
  // Corridor is east-west along row 1. Row 0 is a wall.
  // Tile center is y = 60. Top wall boundary is y = 40.
  // At y = 52 (offset = -8px): player top = 52 - 12 = 40 (touches boundary, 0 overlap)
  sim.setPlayerPosition(60, 52);
  assert.equal(sim.isOverlappingWall(), false, 'Offset of -8px must not intersect top wall');

  // At y = 51.9 (offset = -8.1px): player top = 39.9 < 40 (intersects wall)
  sim.setPlayerPosition(60, 51.9);
  assert.equal(sim.isOverlappingWall(), true, 'Offset exceeding 8px must intersect wall');
});

test('Hitbox Geometry: Assist thresholds (snap=2px, round=3px) engage 5px before wall collision', () => {
  // Snapping activates at <= 2px.
  // Corner rounding activates at > 3px.
  // Collision only happens at > 8px.
  // Therefore there is a guaranteed safety buffer of 8 - 3 = 5px.
  assert.ok(SNAP_THRESHOLD < PLAYER_BODY_OFFSET);
  assert.ok(3 < PLAYER_BODY_OFFSET);
  assert.equal(PLAYER_BODY_OFFSET - 3, 5, 'Safety margin is 5px before physical wall contact');
});

/* ==============================================================================
 * SUITE 2: CORRIDOR CENTERING ASSIST (PHASE 1)
 * ============================================================================== */

test('Corridor Centering: Moving RIGHT with positive Y offset pulls player NORTH towards center', () => {
  const sim = new PlayerMovementSimulator();
  // Open corridor along row 1: (1, 1) -> (1, 2) is open
  // Player at (1, 1) with y = 65 (diffY = +5px south of center)
  sim.setPlayerPosition(60, 65);
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, 150, 'Forward velocity must remain at full speed (150)');
  assert.equal(sim.player.vy, -150, 'Centering velocity must pull north (-150) towards center');
  assert.equal(sim.player.flipX, false, 'Moving right sets flipX = false');
});

test('Corridor Centering: Moving RIGHT with negative Y offset pulls player SOUTH towards center', () => {
  const sim = new PlayerMovementSimulator();
  sim.setPlayerPosition(60, 55); // diffY = -5px north of center
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, 150, 'Forward velocity must remain at full speed (150)');
  assert.equal(sim.player.vy, 150, 'Centering velocity must pull south (+150) towards center');
});

test('Corridor Centering: Snapping boundary snaps player directly to centerline when within 2px', () => {
  const sim = new PlayerMovementSimulator();
  // At diffY = +1.8px (within threshold of 2px)
  sim.setPlayerPosition(60, 61.8);
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, 150);
  assert.equal(sim.player.y, 60, 'Player y must be snapped exactly to rowCenterY (60)');
  assert.equal(sim.player.vy, 0, 'Centering velocity must be zeroed once snapped');

  // At diffY = -1.5px
  sim.setPlayerPosition(60, 58.5);
  sim.updatePlayerMovement();
  assert.equal(sim.player.y, 60, 'Player y must be snapped exactly to rowCenterY (60)');
  assert.equal(sim.player.vy, 0);
});

test('Corridor Centering: Moving DOWN with X offset centers player horizontally', () => {
  const sim = new PlayerMovementSimulator();
  // Vertical corridor along col 1: (1, 1) -> (2, 1) is open
  // Player at x = 66 (diffX = +6px east of center)
  sim.setPlayerPosition(66, 60);
  sim.cursors.down.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vy, 150, 'Downwards velocity must be 150');
  assert.equal(sim.player.vx, -150, 'Centering velocity must pull west (-150)');

  // Snap test for vertical movement
  sim.setPlayerPosition(61.5, 60);
  sim.updatePlayerMovement();
  assert.equal(sim.player.x, 60, 'Player x must be snapped to colCenterX (60)');
  assert.equal(sim.player.vx, 0);
});

test('Corridor Centering Convergence: Player starting at 7px offset smoothly converges to 0 in physics steps', () => {
  const sim = new PlayerMovementSimulator();
  // Start at x = 60, y = 67 (offset = +7px)
  sim.setPlayerPosition(60, 67);
  sim.cursors.right.isDown = true;

  let steps = 0;
  while (sim.player.y !== 60 && steps < 30) {
    sim.step(1 / 60);
    steps++;
    // Invariant: player must never collide with walls during convergence
    assert.equal(sim.isOverlappingWall(), false, `Wall overlap at step ${steps}, y=${sim.player.y}`);
  }

  assert.equal(sim.player.y, 60, 'Player must have converged to centerline (y=60)');
  assert.ok(steps <= 5, `Expected convergence within 5 frames (got ${steps})`);
  assert.ok(sim.player.x > 60, 'Player must have made forward progress during centering');
});

/* ==============================================================================
 * SUITE 3: CORNER-ROUNDING ASSIST (PHASE 2)
 * ============================================================================== */

test('Corner Rounding: Turning early into perpendicular corridor slides around corner pillar', () => {
  const sim = new PlayerMovementSimulator();
  // Player is at (1, 1) moving RIGHT.
  // Create a T-corner: tile (1, 2) is a WALL, but (2, 1) and (2, 2) are OPEN.
  sim.map[1][2] = TILE_WALL;
  sim.map[2][1] = TILE_EMPTY;
  sim.map[2][2] = TILE_EMPTY;

  // Player is slightly offset downward (diffY = +5px > 3)
  sim.setPlayerPosition(60, 65);
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, 150, 'Forward intent vx is 150');
  assert.equal(sim.player.vy, 150, 'Corner-rounding vy must be +150 (sliding DOWN around pillar)');
});

test('Corner Rounding: Early turn upward slides player NORTH around corner pillar', () => {
  const sim = new PlayerMovementSimulator();
  // Player at (2, 1) moving RIGHT towards wall at (2, 2).
  // Row 1 is open: (1, 1) and (1, 2) are open.
  sim.map[2][2] = TILE_WALL;
  sim.map[1][1] = TILE_EMPTY;
  sim.map[1][2] = TILE_EMPTY;

  // Player at (2, 1): center is y = 100. Offset up: y = 94 (diffY = -6 < -3)
  sim.setPlayerPosition(60, 94);
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, 150);
  assert.equal(sim.player.vy, -150, 'Corner-rounding vy must be -150 (sliding UP around pillar)');
});

test('Corner Rounding: Vertical heading early turn applies horizontal slide and flipX', () => {
  const sim = new PlayerMovementSimulator();
  // Player at (1, 1) moving DOWN towards wall at (2, 1).
  // Column 2 is open: (1, 2) and (2, 2) are open.
  sim.map[2][1] = TILE_WALL;
  sim.map[1][2] = TILE_EMPTY;
  sim.map[2][2] = TILE_EMPTY;

  // Player offset right: x = 65 (diffX = +5 > 3)
  sim.setPlayerPosition(65, 60);
  sim.cursors.down.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vy, 150);
  assert.equal(sim.player.vx, 150, 'Corner-rounding vx must be +150 (sliding RIGHT into column 2)');
  assert.equal(sim.player.flipX, false, 'Sliding right sets flipX = false');

  // Mirror case: offset left (x = 55, diffX = -5 < -3)
  // Left column 0 is wall, but test if (1, 0) and (2, 0) were open:
  sim.map[1][0] = TILE_EMPTY;
  sim.map[2][0] = TILE_EMPTY;
  sim.setPlayerPosition(55, 60);
  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, -150, 'Corner-rounding vx must be -150 (sliding LEFT)');
  assert.equal(sim.player.flipX, true, 'Sliding left sets flipX = true');
});

test('Corner Rounding Threshold: Exact boundary verification at ±3px', () => {
  const sim = new PlayerMovementSimulator();
  sim.map[1][2] = TILE_WALL;
  sim.map[2][1] = TILE_EMPTY;
  sim.map[2][2] = TILE_EMPTY;
  sim.cursors.right.isDown = true;

  // Exactly at diffY = +3.0: strict > 3 check does NOT trigger rounding
  sim.setPlayerPosition(60, 63.0);
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 0, 'At diffY = 3.0, vy must be 0 (no assist)');

  // At diffY = +3.05: triggers rounding
  sim.setPlayerPosition(60, 63.05);
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 150, 'At diffY = 3.05, vy must be 150');

  // Exactly at diffY = -3.0: strict < -3 check does NOT trigger rounding
  sim.map[0][1] = TILE_EMPTY;
  sim.map[0][2] = TILE_EMPTY;
  sim.setPlayerPosition(60, 57.0);
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 0, 'At diffY = -3.0, vy must be 0 (no assist)');

  // At diffY = -3.05: triggers rounding
  sim.setPlayerPosition(60, 56.95);
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, -150, 'At diffY = -3.05, vy must be -150');
});

/* ==============================================================================
 * SUITE 4: DEAD-END SAFETY & GHOST-SLIDING IMMUNITY
 * ============================================================================== */

test('Dead-End Safety: Moving into flat dead-end wall produces ZERO perpendicular drift', () => {
  const sim = new PlayerMovementSimulator();
  // Player at (1, 1) in a dead-end corridor:
  // North (0, 1) is WALL
  // East (1, 2) is WALL
  // South (2, 1) is WALL
  // West (1, 0) is WALL (only way in was from somewhere else)
  sim.map[1][2] = TILE_WALL;
  sim.map[0][1] = TILE_WALL;
  sim.map[2][1] = TILE_WALL;

  // Player runs RIGHT towards wall at (1, 2) with arbitrary offset
  sim.setPlayerPosition(60, 65);
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, 150, 'Forward velocity is applied towards wall');
  assert.equal(sim.player.vy, 0, 'Assist MUST NOT produce perpendicular ghost slide into dead end walls');
});

test('Dead-End Safety: Centered collision into flat wall produces zero perpendicular velocity', () => {
  const sim = new PlayerMovementSimulator();
  // Wall ahead at (1, 2)
  sim.map[1][2] = TILE_WALL;
  // Adjacent paths are open, but player is dead center (diffY = 0)
  sim.map[2][1] = TILE_EMPTY;
  sim.map[2][2] = TILE_EMPTY;
  sim.setPlayerPosition(60, 60);
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  assert.equal(sim.player.vy, 0, 'Centered player hitting wall does not guess a direction');
});

test('Dead-End Safety: "Fake Open" Diagonal Trap — adjacent tile is open but diagonal is blocked', () => {
  const sim = new PlayerMovementSimulator();
  // Player at (1, 1) moving RIGHT into wall at (1, 2).
  // Tile below (2, 1) is EMPTY, BUT the corner target (2, 2) is a SOLID BLOCK!
  sim.map[1][2] = TILE_WALL;
  sim.map[2][1] = TILE_EMPTY;
  sim.map[2][2] = TILE_BLOCK; // Blocked diagonally!

  sim.setPlayerPosition(60, 66); // diffY = +6 > 3
  sim.cursors.right.isDown = true;

  sim.updatePlayerMovement();

  // Invariant: assist must NOT round into a blocked diagonal corridor
  assert.equal(sim.player.vy, 0, 'Assist must verify BOTH adjacent and diagonal tiles before rounding');
});

/* ==============================================================================
 * SUITE 5: BOMB PASSABILITY & STEPPING OFF
 * ============================================================================== */

test('Bomb Passability: Player can immediately step off freshly placed bomb on current tile', () => {
  const sim = new PlayerMovementSimulator();
  // Player places bomb at current tile (1, 1)
  const bomb = sim.placeBomb(1, 1);
  assert.ok(bomb);

  // isPassable for current tile (1, 1) must be true for the player standing on it
  assert.equal(sim.isPassable(1, 1), true, 'Current bomb tile must be passable for player on it');

  // Neighbor tile (1, 2) is empty and passable
  assert.equal(sim.isPassable(1, 2), true, 'Adjacent open tile must be passable');

  // Player presses RIGHT
  sim.cursors.right.isDown = true;
  sim.updatePlayerMovement();

  assert.equal(sim.player.vx, 150, 'Player can walk off bomb at full speed');
  assert.equal(sim.player.vy, 0);
});

test('Bomb Passability: Continuous physics step from bomb tile to neighbor smoothly exits', () => {
  const sim = new PlayerMovementSimulator();
  sim.placeBomb(1, 1); // Bomb at (1, 1): x=60, y=60
  sim.setPlayerPosition(60, 60);
  sim.cursors.right.isDown = true;

  // Step 15 frames (~250ms at 150px/s -> ~37.5px displacement)
  for (let i = 0; i < 15; i++) {
    sim.step(1 / 60);
  }

  // Player position should now be > 95px (in tile col 2: [80, 120])
  assert.ok(sim.player.x > 80, `Player x should exceed 80 (got ${sim.player.x})`);
  const currentCol = Math.floor(sim.player.x / TILE_SIZE);
  assert.equal(currentCol, 2, 'Player has transitioned to column 2');
});

test('Bomb Obstacle: Exited bomb becomes an impassable solid obstacle blocking re-entry', () => {
  const sim = new PlayerMovementSimulator();
  sim.placeBomb(1, 1); // Bomb at (1, 1)
  // Move player to (1, 2): x = 100, y = 60
  sim.setPlayerPosition(100, 60);

  // From outside, bomb tile (1, 1) must be impassable
  assert.equal(sim.isPassable(1, 1), false, 'Exited bomb must block passability from outside');

  // Attempting to move LEFT into the bomb tile
  sim.cursors.left.isDown = true;
  sim.updatePlayerMovement();

  // directOpen for (1, 1) is false!
  // Because left is blocked, forward motion into bomb is stopped or deflected
  // With centered y=60 and left tile blocked, assist does not round into dead end
  assert.equal(sim.isPassable(1, 1), false);
});

test('Bomb Barricade: Second bomb in adjacent corridor is impassable while stepping off first bomb', () => {
  const sim = new PlayerMovementSimulator();
  sim.placeBomb(1, 1); // Current tile bomb
  sim.placeBomb(1, 2); // Adjacent tile bomb

  sim.setPlayerPosition(60, 60);
  // Current tile is passable
  assert.equal(sim.isPassable(1, 1), true);
  // Adjacent bomb tile is NOT passable
  assert.equal(sim.isPassable(1, 2), false, 'Second bomb must block player from entering');

  sim.cursors.right.isDown = true;
  sim.updatePlayerMovement();

  // directOpen is false because (1, 2) has a solid bomb
  // Player does not get free pass through the second bomb
  assert.equal(sim.isPassable(1, 2), false);
});

/* ==============================================================================
 * SUITE 6: MULTI-INPUT & DIAGONAL PRIORITY RESOLUTION
 * ============================================================================== */

test('Diagonal Resolution: Automatically routes to open axis when one axis is blocked by a wall', () => {
  const sim = new PlayerMovementSimulator();
  // Player at (1, 1).
  // Wall to the RIGHT at (1, 2).
  // Path DOWN at (2, 1) is OPEN.
  sim.map[1][2] = TILE_WALL;
  sim.map[2][1] = TILE_EMPTY;

  // Player inputs both RIGHT and DOWN
  sim.cursors.right.isDown = true;
  sim.cursors.down.isDown = true;

  sim.updatePlayerMovement();

  // x is blocked, y is open -> primaryAxis resolves to 'y'
  assert.equal(sim.player.vy, 150, 'Must choose open vertical axis');
  assert.equal(sim.player.vx, 0, 'Must zero horizontal velocity to prevent snagging on right wall');
});

test('Diagonal Resolution: Automatically routes to horizontal axis when vertical is blocked', () => {
  const sim = new PlayerMovementSimulator();
  // Wall DOWN at (2, 1).
  // Path RIGHT at (1, 2) is OPEN.
  sim.map[2][1] = TILE_WALL;
  sim.map[1][2] = TILE_EMPTY;

  sim.cursors.right.isDown = true;
  sim.cursors.down.isDown = true;

  sim.updatePlayerMovement();

  // y is blocked, x is open -> primaryAxis resolves to 'x'
  assert.equal(sim.player.vx, 150, 'Must choose open horizontal axis');
  assert.equal(sim.player.vy, 0);
});

test('Diagonal Resolution: Timestamp priority when both diagonal directions are open', () => {
  const sim = new PlayerMovementSimulator();
  // Both (1, 2) [RIGHT] and (2, 1) [DOWN] are open
  sim.map[1][2] = TILE_EMPTY;
  sim.map[2][1] = TILE_EMPTY;

  sim.cursors.right.isDown = true;
  sim.cursors.down.isDown = true;

  // DOWN was pressed later (timeY = 500 > timeX = 400)
  sim.cursors.right.timeDown = 400;
  sim.cursors.down.timeDown = 500;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 150, 'More recent DOWN key takes priority');

  // RIGHT was pressed later (timeX = 600 > timeY = 500)
  sim.cursors.right.timeDown = 600;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vx, 150, 'More recent RIGHT key takes priority');
});

test('Opposing Inputs: Simultaneously pressing LEFT + RIGHT or UP + DOWN zeroes intent', () => {
  const sim = new PlayerMovementSimulator();
  sim.cursors.left.isDown = true;
  sim.cursors.right.isDown = true;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vx, 0, 'LEFT + RIGHT must cancel out to 0');

  sim.cursors.left.isDown = false;
  sim.cursors.right.isDown = false;
  sim.cursors.up.isDown = true;
  sim.cursors.down.isDown = true;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 0, 'UP + DOWN must cancel out to 0');

  // All 4 keys down
  sim.cursors.left.isDown = true;
  sim.cursors.right.isDown = true;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vx, 0);
  assert.equal(sim.player.vy, 0);
});

test('Mobile Joystick Input: Integrates smoothly with mobileInput object', () => {
  const sim = new PlayerMovementSimulator();
  // Mobile virtual joystick pushing UP
  sim.mobileInput.up = true;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, -150, 'Mobile input up produces vy = -150');

  sim.mobileInput.up = false;
  sim.mobileInput.left = true;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vx, -150, 'Mobile input left produces vx = -150');
  assert.equal(sim.player.flipX, true, 'Mobile input left sets flipX = true');
});

/* ==============================================================================
 * SUITE 7: ADVERSARIAL STRESS, FUZZING & INVARIANT HARNESS
 * ============================================================================== */

test('Adversarial Fuzzing: 1,000 randomized state vectors maintain strict physical invariants', () => {
  const sim = new PlayerMovementSimulator();

  for (let iter = 0; iter < 1000; iter++) {
    // Random valid corridor tile (odd row/col)
    const r = 1 + 2 * Math.floor(Math.random() * 5); // 1, 3, 5, 7, 9
    const c = 1 + 2 * Math.floor(Math.random() * 6); // 1, 3, 5, 7, 9, 11

    // Random sub-tile offset in [-8, +8]
    const offsetX = (Math.random() - 0.5) * 16;
    const offsetY = (Math.random() - 0.5) * 16;
    const px = c * TILE_SIZE + 20 + offsetX;
    const py = r * TILE_SIZE + 20 + offsetY;

    sim.setPlayerPosition(px, py);

    // Random inputs
    sim.cursors.left.isDown = Math.random() < 0.3;
    sim.cursors.right.isDown = Math.random() < 0.3;
    sim.cursors.up.isDown = Math.random() < 0.3;
    sim.cursors.down.isDown = Math.random() < 0.3;
    sim.cursors.left.timeDown = Math.random() * 1000;
    sim.cursors.right.timeDown = Math.random() * 1000;
    sim.cursors.up.timeDown = Math.random() * 1000;
    sim.cursors.down.timeDown = Math.random() * 1000;

    // Random active bomb
    sim.bombs = [];
    if (Math.random() < 0.2) {
      sim.placeBomb(r, c);
    }

    sim.updatePlayerMovement();

    // INVARIANT 1: Speeds must never exceed max limits (150 px/s)
    assert.ok(Math.abs(sim.player.vx) <= SPEED, `vx exceeded speed: ${sim.player.vx}`);
    assert.ok(Math.abs(sim.player.vy) <= SPEED, `vy exceeded speed: ${sim.player.vy}`);

    // INVARIANT 2: No NaN or non-finite values
    assert.ok(Number.isFinite(sim.player.vx), 'vx must be finite');
    assert.ok(Number.isFinite(sim.player.vy), 'vy must be finite');
    assert.ok(Number.isFinite(sim.player.x), 'x must be finite');
    assert.ok(Number.isFinite(sim.player.y), 'y must be finite');
  }
});

test('Continuous Stress: Navigating an S-curve corridor under continuous physics step integration', () => {
  const sim = new PlayerMovementSimulator();
  // Build an S-curve corridor:
  // (1, 1) -> (1, 2) [East]
  // (1, 2) -> (2, 2) [South]
  // (2, 2) -> (2, 3) [East]
  sim.map[1][1] = TILE_EMPTY;
  sim.map[1][2] = TILE_EMPTY;
  sim.map[1][3] = TILE_WALL; // blocked east of (1, 2)
  sim.map[2][2] = TILE_EMPTY;
  sim.map[2][1] = TILE_WALL; // blocked south of (1, 1)
  sim.map[2][3] = TILE_EMPTY;

  sim.setPlayerPosition(60, 60);

  // Phase 1: Move East to (1, 2)
  sim.cursors.right.isDown = true;
  for (let i = 0; i < 20; i++) {
    sim.step(1 / 60);
    assert.equal(sim.isOverlappingWall(), false);
  }

  // Phase 2: Corner turn South into (2, 2)
  sim.cursors.right.isDown = false;
  sim.cursors.down.isDown = true;
  for (let i = 0; i < 20; i++) {
    sim.step(1 / 60);
    assert.equal(sim.isOverlappingWall(), false);
  }

  // Phase 3: Corner turn East into (2, 3)
  sim.cursors.down.isDown = false;
  sim.cursors.right.isDown = true;
  for (let i = 0; i < 20; i++) {
    sim.step(1 / 60);
    assert.equal(sim.isOverlappingWall(), false);
  }

  // Player successfully completed S-curve without hitting or overlapping any walls!
  const finalCol = Math.floor(sim.player.x / TILE_SIZE);
  const finalRow = Math.floor(sim.player.y / TILE_SIZE);
  assert.equal(finalRow, 2);
  assert.ok(finalCol >= 2, `Expected player to reach at least col 2 (got ${finalCol})`);
  assert.equal(sim.isOverlappingWall(), false, 'Player must remain wall-collision free');
});

/* ==============================================================================
 * SUITE: DEFENSIVE TESTS (PHYS-03, PHYS-07, CORNER SLIDING & PERKS)
 * ============================================================================== */

test('PHYS-07: cornerSlideTolerance level 0 (8px), level 1 (11px), level 2 (14px) expands corner assist zone', () => {
  const sim = new PlayerMovementSimulator();
  sim.remediatedCornerSlide = true;
  sim.map[1][2] = TILE_WALL; // blocked ahead when moving right
  sim.map[2][1] = TILE_EMPTY;
  sim.map[2][2] = TILE_EMPTY; // corner open downwards
  sim.cursors.right.isDown = true;

  // Level 0 (tolerance = 8px): diffY = +10px (py = 70) is out of range
  sim.cornerSlideTolerance = 8;
  sim.setPlayerPosition(60, 70); // rowCenterY = 60, diffY = +10
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 0, 'diffY = 10 must NOT trigger rounding at tolerance 8px');

  // Level 1 (tolerance = 11px): diffY = +10px IS within range
  sim.cornerSlideTolerance = 11;
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 150, 'diffY = 10 triggers rounding at tolerance 11px');

  // Level 2 (tolerance = 14px): diffY = +13px (py = 73) triggers rounding
  sim.cornerSlideTolerance = 14;
  sim.setPlayerPosition(60, 73); // diffY = +13
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 150, 'diffY = 13 triggers rounding at tolerance 14px');

  // Outside level 2 tolerance: diffY = +15px (py = 75) does not trigger
  sim.setPlayerPosition(60, 75); // diffY = +15
  sim.updatePlayerMovement();
  assert.equal(sim.player.vy, 0, 'diffY = 15 must NOT trigger rounding at tolerance 14px');
});

test('PHYS-07: Zero dead zone allows corner rounding when centered (diff === 0)', () => {
  const sim = new PlayerMovementSimulator();
  sim.remediatedCornerSlide = true;
  sim.map[1][2] = TILE_WALL; // blocked ahead to the right
  sim.map[0][1] = TILE_EMPTY; // open upwards
  sim.map[0][2] = TILE_EMPTY;
  sim.map[2][1] = TILE_WALL; // blocked downwards
  sim.map[2][2] = TILE_WALL;
  sim.cursors.right.isDown = true;

  // Perfectly centered on Y axis (py = 60, diffY = 0)
  sim.setPlayerPosition(60, 60);
  sim.updatePlayerMovement();

  // In the old code, diffY === 0 meant diffY < -3 and diffY > 3 were both false (dead zone).
  // In the remediated code, zero dead zone allows rounding into the only open direction!
  assert.equal(sim.player.vy, -150, 'Centered player rounds upwards when upward corner is open');
});

test('PHYS-07: Wall-pass & Bomb-pass passability preserves corridor centering', () => {
  const sim = new PlayerMovementSimulator();
  sim.remediatedCornerSlide = true;

  // Corridor with soft block at (1, 2)
  sim.map[1][2] = TILE_BLOCK;
  sim.cursors.right.isDown = true;

  // Without wall pass: blocked ahead, corridor centering does not treat (1, 2) as directOpen
  sim.hasWallPass = false;
  assert.equal(sim.isPassable(1, 2), false);

  // With wall pass: passable ahead, directOpen = true, corridor centering engages
  sim.hasWallPass = true;
  assert.equal(sim.isPassable(1, 2), true);

  sim.setPlayerPosition(60, 64); // 4px off-center vertically
  sim.updatePlayerMovement();
  assert.equal(sim.player.vx, 150, 'Player moves right through soft block');
  assert.equal(sim.player.vy, -150, 'Corridor centering pulls player toward centerline while passing wall');

  // Bomb on (1, 3)
  sim.placeBomb(1, 3);
  sim.hasBombPass = false;
  assert.equal(sim.isPassable(1, 3), false);

  sim.hasBombPass = true;
  assert.equal(sim.isPassable(1, 3), true);
});

test('PHYS-03: Conveyor drift AABB boundary clamp prevents wall penetration', () => {
  const sim = new PlayerMovementSimulator();
  // Player at (1, 1) [center 60, 60], wall at (1, 2) [starts at x = 80]
  sim.map[1][2] = TILE_WALL;
  sim.setPlayerPosition(67, 60); // 24x24 hitbox with radius 12: right edge at 67 + 12 = 79px (< 80)

  // Helper conveyor step matching GameScene.ts AABB clamp
  function driftStep(playerX, beltDirX, delta) {
    const drift = 60 * delta;
    const nextX = playerX + beltDirX * drift;
    const leadX = nextX + beltDirX * 12;
    const leadCol = Math.floor(leadX / TILE_SIZE);
    if (leadCol < COLS && sim.map[1]?.[leadCol] === TILE_EMPTY) {
      return nextX;
    }
    return playerX; // Clamped at boundary
  }

  // Drift for 60 frames (1 second, 60px drift without clamp)
  let currX = 67;
  for (let i = 0; i < 60; i++) {
    currX = driftStep(currX, 1, 1 / 60);
    // Boundary check: right edge (currX + 12) must NEVER reach or enter tile 2 (x >= 80)
    assert.ok(currX + 12 <= 80, `Hitbox right edge (${currX + 12}) must never penetrate wall at x=80`);
  }
  // Max clamped player x is 68px (68 + 12 = 80)
  assert.ok(currX <= 68, `Player clamped cleanly at wall edge (got ${currX})`);
});
