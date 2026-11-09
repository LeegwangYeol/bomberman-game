/**
 * tests/chaos_bomb_kicking_sliding_ricochet_corner_snapping.test.mjs
 *
 * Chaos QA & Resilience Verification Suite:
 * - Bomb Kicking Initiation & Cardinal Priority Resolution
 * - Continuous Swept-Ray Sliding Physics under High-Speed Collision Boundaries (300 to 1000 px/s)
 * - Zero Wall Penetration & Out-of-Bounds Confinement Invariants across all 4 Boundary Edges & Corners
 * - Elastic Ricochet Rebound Mechanics (1, 2, 3 rebounds, and Trapped Cell Deadlock Defense)
 * - Corner Snapping & Tile Center Alignment (Both Bomb Collision Snapping & Player Corner Rounding)
 * - 300-Trial Monte Carlo Chaos Fuzzing under Random Frame Spikes (4ms to 250ms)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';
import {
  BOMB_KICK_SPEED,
  simulateBombKickSlide,
} from '../src/game/gameplay_mechanics.ts';
import {
  BOMB_KICK_CHRONO_SPEED,
  BOMB_KICK_MAGMA_SPEED,
  BOMB_KICK_SOLAR_SPEED,
  BOMB_KICK_NEBULA_SPEED,
} from '../src/game/hazards/index.ts';
import { BaseBoss, BossState } from '../src/game/bosses/index.ts';

const BOMB_KICK_ABYSSAL_SPEED = 460;
const BOMB_RADIUS = 16;
const ENEMY_RADIUS = 16;

function createStandardMap(rows = ROWS, cols = COLS) {
  const map = [];
  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
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

function createOpenMap(rows = ROWS, cols = COLS) {
  const map = [];
  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        map[r][c] = TILE_WALL;
      } else {
        map[r][c] = TILE_EMPTY;
      }
    }
  }
  return map;
}

/**
 * Headless Concrete Boss for Boss Collision Testing
 */
class HeadlessTestBoss extends BaseBoss {
  constructor(maxHp = 500, x = 300, y = 260) {
    super(
      {
        id: 'headless_chaos_boss',
        name: 'Chaos Collision Boss',
        title: 'Boundary Smasher',
        avatarEmoji: '🥊',
        maxHp,
        footprintWidth: 80,
        footprintHeight: 80,
        colliderRadius: 35,
        baseSpeed: 60,
        phase2HpThreshold: 0.66,
        phase3HpThreshold: 0.33,
      },
      x,
      y
    );
    this.bossState = BossState.PHASE_1;
  }
  canTakeDamage() { return true; }
  updatePhase1() {}
  updatePhase2() {}
  updateEnraged() {}
  onHitReceived() {}
  onDamageBlocked() {}
  onStateChanged() {}
}

/**
 * Continuous Bomb Physics Simulator matching GameScene.ts 1:1
 */
class GameSceneBombPhysicsSimulator {
  constructor(map, options = {}) {
    this.map = map.map((row) => [...row]);
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.otherBombs = (options.otherBombs || []).map((b) => ({ ...b }));
    this.enemies = (options.enemies || []).map((e) => ({ ...e }));
    this.activeBoss = options.activeBoss || null;

    this.bossCollided = false;
    this.enemyImpactDetonation = null;
    this.reboundEvents = [];
  }

  simulateSlide(
    startX,
    startY,
    dirX,
    dirY,
    speed,
    deltaMs,
    maxFrames = 400,
    maxRebounds = 0
  ) {
    let bombX = startX;
    let bombY = startY;
    let currentDirX = dirX;
    let currentDirY = dirY;
    let isSliding = true;
    let reboundsLeft = maxRebounds;
    let reboundsExecuted = 0;
    let stoppedSafeCol = null;
    let stoppedSafeRow = null;
    const trajectory = [{ x: bombX, y: bombY, frame: 0, reboundsLeft, isSliding: true }];

    for (let frame = 1; frame <= maxFrames; frame++) {
      if (!isSliding) break;

      const bCol = Math.floor(bombX / TILE_SIZE);
      const bRow = Math.floor(bombY / TILE_SIZE);

      const stepDistance = speed * (deltaMs / 1000);
      const lookahead = Math.max(16, 16 + stepDistance + 2);
      const checkX = bombX + currentDirX * lookahead;
      const checkY = bombY + currentDirY * lookahead;
      const targetCol = Math.floor(checkX / TILE_SIZE);
      const targetRow = Math.floor(checkY / TILE_SIZE);

      let blocked = false;
      let stopCol = bCol;
      let stopRow = bRow;

      const dCol = Math.sign(currentDirX);
      const dRow = Math.sign(currentDirY);
      const numSteps = Math.max(Math.abs(targetCol - bCol), Math.abs(targetRow - bRow));

      if (numSteps > 0) {
        for (let s = 1; s <= numSteps; s++) {
          const checkC = bCol + dCol * s;
          const checkR = bRow + dRow * s;

          if (checkR < 0 || checkR >= this.rows || checkC < 0 || checkC >= this.cols) {
            blocked = true;
            stopCol = bCol + dCol * (s - 1);
            stopRow = bRow + dRow * (s - 1);
            break;
          } else if (this.map[checkR][checkC] !== TILE_EMPTY) {
            blocked = true;
            stopCol = bCol + dCol * (s - 1);
            stopRow = bRow + dRow * (s - 1);
            break;
          } else {
            // Check other stationary bombs
            let bombHit = false;
            for (const ob of this.otherBombs) {
              if (ob.active) {
                const obr = Math.floor(ob.y / TILE_SIZE);
                const obc = Math.floor(ob.x / TILE_SIZE);
                if (obr === checkR && obc === checkC) {
                  bombHit = true;
                  break;
                }
              }
            }
            if (bombHit) {
              blocked = true;
              stopCol = bCol + dCol * (s - 1);
              stopRow = bRow + dRow * (s - 1);
              break;
            }

            // Check active enemies on swept tile
            let enemyHitTile = null;
            for (const enemy of this.enemies) {
              if (enemy.active && !enemy.isDead) {
                const er = Math.floor(enemy.y / TILE_SIZE);
                const ec = Math.floor(enemy.x / TILE_SIZE);
                if (er === checkR && ec === checkC) {
                  enemyHitTile = enemy;
                  break;
                }
              }
            }
            if (enemyHitTile) {
              this.enemyImpactDetonation = {
                enemy: enemyHitTile,
                row: checkR,
                col: checkC,
                x: checkC * TILE_SIZE + TILE_SIZE / 2,
                y: checkR * TILE_SIZE + TILE_SIZE / 2,
                frame,
              };
              isSliding = false;
              bombX = checkC * TILE_SIZE + TILE_SIZE / 2;
              bombY = checkR * TILE_SIZE + TILE_SIZE / 2;
              break;
            }
          }
        }
      }

      if (!isSliding) break;

      // Proximity enemy check
      let enemyHitProximity = null;
      for (const enemy of this.enemies) {
        if (enemy.active && !enemy.isDead) {
          const eDist = Math.hypot(bombX - enemy.x, bombY - enemy.y);
          const eRadius = enemy.collisionRadius || ENEMY_RADIUS;
          if (eDist < eRadius + BOMB_RADIUS) {
            enemyHitProximity = enemy;
            break;
          }
        }
      }
      if (enemyHitProximity) {
        this.enemyImpactDetonation = {
          enemy: enemyHitProximity,
          row: bRow,
          col: bCol,
          x: bombX,
          y: bombY,
          frame,
        };
        isSliding = false;
        break;
      }

      // Boss proximity check
      if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
        const bossDist = Math.hypot(bombX - this.activeBoss.x, bombY - this.activeBoss.y);
        const bRadius = this.activeBoss.config.colliderRadius || 35;
        if (bossDist < bRadius + BOMB_RADIUS) {
          this.bossCollided = true;
          isSliding = false;
          break;
        }
      }

      if (blocked) {
        if (reboundsLeft > 0) {
          reboundsLeft--;
          reboundsExecuted++;

          // Wall rebound: reverse velocity and direction
          currentDirX = -dCol;
          currentDirY = -dRow;

          // Snap to safe tile center before reflection
          stoppedSafeCol = Math.max(0, Math.min(this.cols - 1, stopCol));
          stoppedSafeRow = Math.max(0, Math.min(this.rows - 1, stopRow));
          bombX = stoppedSafeCol * TILE_SIZE + TILE_SIZE / 2;
          bombY = stoppedSafeRow * TILE_SIZE + TILE_SIZE / 2;

          this.reboundEvents.push({
            frame,
            col: stoppedSafeCol,
            row: stoppedSafeRow,
            newDirX: currentDirX,
            newDirY: currentDirY,
            reboundsLeft,
          });

          // Check if reverse path is immediately blocked (1x1 trapped cell)
          const revC = stoppedSafeCol + currentDirX;
          const revR = stoppedSafeRow + currentDirY;
          if (
            revR < 0 ||
            revR >= this.rows ||
            revC < 0 ||
            revC >= this.cols ||
            this.map[revR][revC] !== TILE_EMPTY
          ) {
            isSliding = false; // Trapped, stop cleanly
          }
        } else {
          isSliding = false;
          stoppedSafeCol = Math.max(0, Math.min(this.cols - 1, stopCol));
          stoppedSafeRow = Math.max(0, Math.min(this.rows - 1, stopRow));
          bombX = stoppedSafeCol * TILE_SIZE + TILE_SIZE / 2;
          bombY = stoppedSafeRow * TILE_SIZE + TILE_SIZE / 2;
        }
      } else {
        bombX += currentDirX * stepDistance;
        bombY += currentDirY * stepDistance;
      }

      trajectory.push({
        x: bombX,
        y: bombY,
        frame,
        isSliding,
        reboundsLeft,
      });
    }

    return {
      finalX: bombX,
      finalY: bombY,
      isSliding,
      stoppedSafeCol,
      stoppedSafeRow,
      reboundsExecuted,
      reboundsLeft,
      reboundEvents: this.reboundEvents,
      trajectory,
      enemyImpactDetonation: this.enemyImpactDetonation,
      bossCollided: this.bossCollided,
    };
  }
}

/**
 * Player Corner Rounding & Snap Simulator matching GameScene.updatePlayerPhysics
 */
class PlayerCornerRoundingSimulator {
  constructor(map, cornerSlideTolerance = 8) {
    this.map = map.map((row) => [...row]);
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.cornerSlideTolerance = cornerSlideTolerance;
  }

  isPassable(r, c) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    return this.map[r][c] === TILE_EMPTY;
  }

  calculateMovement(playerX, playerY, wantX, wantY, speed = 150, deltaMs = 16.67, isMobile = false) {
    const col = Math.floor(playerX / TILE_SIZE);
    const row = Math.floor(playerY / TILE_SIZE);
    const colCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const rowCenterY = row * TILE_SIZE + TILE_SIZE / 2;
    const diffX = playerX - colCenterX;
    const diffY = playerY - rowCenterY;

    const slideSpeed = speed;
    const snapThreshold = Math.max(2, speed * (deltaMs / 1000));
    const baseTol = this.cornerSlideTolerance;
    const tol = isMobile ? Math.max(baseTol + 4, 14) : baseTol;

    let primaryAxis = 'x';
    if (wantX !== 0 && wantY !== 0) {
      const xOpen = this.isPassable(row, col + wantX);
      const yOpen = this.isPassable(row + wantY, col);
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
    let snappedY = playerY;
    let snappedX = playerX;

    if (primaryAxis === 'x') {
      vx = wantX * speed;
      const nextCol = col + wantX;
      const directOpen = this.isPassable(row, nextCol);

      if (directOpen) {
        if (Math.abs(diffY) > snapThreshold) {
          vy = -Math.sign(diffY) * slideSpeed;
        } else {
          snappedY = rowCenterY;
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
          snappedX = colCenterX;
          vx = 0;
        }
      } else {
        const canRoundLeft = diffX <= 0 && Math.abs(diffX) <= tol && this.isPassable(row, col - 1) && this.isPassable(nextRow, col - 1);
        const canRoundRight = diffX >= 0 && Math.abs(diffX) <= tol && this.isPassable(row, col + 1) && this.isPassable(nextRow, col + 1);

        if (canRoundLeft && canRoundRight) {
          vx = diffX < 0 ? -slideSpeed : slideSpeed;
        } else if (canRoundLeft) {
          vx = -slideSpeed;
        } else if (canRoundRight) {
          vx = slideSpeed;
        } else {
          vx = 0;
        }
      }
    }

    return { vx, vy, snappedX, snappedY };
  }
}

/**
 * Mock TryKickBomb implementation matching GameScene.tryKickBomb 1:1
 */
function tryKickBomb(player, bomb, hasKick, playerFacing, map, otherBombs = [], activeBombType = 'REGULAR') {
  if (!hasKick || !bomb.active || bomb.isSliding) return { kicked: false, reason: 'inactive_or_no_kick' };

  let dirX = 0;
  let dirY = 0;
  const dx = bomb.x - player.x;
  const dy = bomb.y - player.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    dirX = Math.sign(dx);
  } else if (Math.abs(dy) > 0) {
    dirY = Math.sign(dy);
  } else {
    switch (playerFacing) {
      case 'left': dirX = -1; break;
      case 'right': dirX = 1; break;
      case 'up': dirY = -1; break;
      case 'down': dirY = 1; break;
    }
  }

  if (dirX === 0 && dirY === 0) return { kicked: false, reason: 'zero_direction' };

  const bCol = Math.floor(bomb.x / TILE_SIZE);
  const bRow = Math.floor(bomb.y / TILE_SIZE);
  const targetC = bCol + dirX;
  const targetR = bRow + dirY;

  // Check if next tile is within map bounds
  if (targetR < 0 || targetR >= map.length || targetC < 0 || targetC >= map[0].length) {
    return { kicked: false, reason: 'out_of_bounds_target' };
  }
  // Check if next tile is passable
  if (map[targetR][targetC] !== TILE_EMPTY) {
    return { kicked: false, reason: 'blocked_target_tile' };
  }

  // Check for another bomb at target
  const hasOtherBomb = otherBombs.some((b) => {
    if (!b.active || b === bomb) return false;
    const br = Math.floor(b.y / TILE_SIZE);
    const bc = Math.floor(b.x / TILE_SIZE);
    return br === targetR && bc === targetC;
  });
  if (hasOtherBomb) return { kicked: false, reason: 'other_bomb_at_target' };

  let rebounds = bomb.reboundsLeft;
  if (rebounds === undefined) {
    rebounds = (bomb.type === 'RICOCHET_BOMB' || activeBombType === 'RICOCHET_BOMB') ? 3 : 0;
  }

  bomb.isSliding = true;
  bomb.slideSpeed = BOMB_KICK_SPEED;
  bomb.slideDir = { x: dirX, y: dirY };
  bomb.reboundsLeft = rebounds;

  return {
    kicked: true,
    dirX,
    dirY,
    speed: BOMB_KICK_SPEED,
    rebounds,
  };
}

/* ==============================================================================
 * PART 1: GAMEPLAY MECHANICS ENGINE: SIMULATE_BOMB_KICK_SLIDE INVARIANTS
 * ============================================================================== */

test('MECH-01: simulateBombKickSlide stops cleanly before perimeter walls in all 4 cardinal directions', () => {
  const map = createStandardMap();

  // East slide from (1, 1) to (1, 13)
  const resEast = simulateBombKickSlide(1, 1, 1, 0, map);
  assert.equal(resEast.endCol, 13, 'Stopped before col 14 East wall');
  assert.equal(resEast.endRow, 1);
  assert.equal(resEast.rebounds, 0);
  assert.equal(resEast.detonatedOnEnemy, false);

  // West slide from (1, 13) to (1, 1)
  const resWest = simulateBombKickSlide(13, 1, -1, 0, map);
  assert.equal(resWest.endCol, 1, 'Stopped before col 0 West wall');
  assert.equal(resWest.endRow, 1);

  // South slide from (1, 1) to (11, 1)
  const resSouth = simulateBombKickSlide(1, 1, 0, 1, map);
  assert.equal(resSouth.endCol, 1);
  assert.equal(resSouth.endRow, 11, 'Stopped before row 12 South wall');

  // North slide from (1, 11) to (1, 1)
  const resNorth = simulateBombKickSlide(1, 11, 0, -1, map);
  assert.equal(resNorth.endCol, 1);
  assert.equal(resNorth.endRow, 1, 'Stopped before row 0 North wall');
});

test('MECH-02: simulateBombKickSlide stops right before soft blocks without destroying or passing through', () => {
  const map = createOpenMap(5, 12);
  map[2][6] = TILE_BLOCK;

  const result = simulateBombKickSlide(2, 2, 1, 0, map);
  assert.equal(result.endCol, 5, 'Stops at col 5 right before col 6 soft block');
  assert.equal(result.endRow, 2);
  assert.equal(map[2][6], TILE_BLOCK, 'Soft block remains intact');
});

test('MECH-03: simulateBombKickSlide stops before stationary bomb with zero overlap', () => {
  const map = createOpenMap(5, 12);
  const bombTiles = new Set(['2,8']);

  const result = simulateBombKickSlide(2, 2, 1, 0, map, bombTiles);
  assert.equal(result.endCol, 7, 'Stops at col 7 right before col 8 bomb');
  assert.equal(result.endRow, 2);
});

test('MECH-04: simulateBombKickSlide ricochet counts (0, 1, 2, 3) reflect back and forth cleanly', () => {
  const map = createOpenMap(5, 10);
  // Col 0 wall, Col 9 wall. Walkable cols 1..8

  // 0 rebounds: stops at col 8
  const r0 = simulateBombKickSlide(2, 2, 1, 0, map, { maxRebounds: 0 });
  assert.equal(r0.rebounds, 0);
  assert.equal(r0.endCol, 8);

  // 1 rebound: hits col 9 -> reflects West -> stops at col 1
  const r1 = simulateBombKickSlide(2, 2, 1, 0, map, { maxRebounds: 1 });
  assert.equal(r1.rebounds, 1);
  assert.equal(r1.endCol, 1);

  // 2 rebounds: hits East (col 8) -> hits West (col 1) -> stops at East (col 8)
  const r2 = simulateBombKickSlide(2, 2, 1, 0, map, { maxRebounds: 2 });
  assert.equal(r2.rebounds, 2);
  assert.equal(r2.endCol, 8);

  // 3 rebounds: hits East -> West -> East -> stops at West (col 1)
  const r3 = simulateBombKickSlide(2, 2, 1, 0, map, { maxRebounds: 3 });
  assert.equal(r3.rebounds, 3);
  assert.equal(r3.endCol, 1);
});

test('MECH-05: simulateBombKickSlide trapped cell deadlock defense prevents infinite loops', () => {
  const map = createOpenMap(5, 7);
  // 1-tile pit at (2, 3): walls at (2, 2) and (2, 4)
  map[2][2] = TILE_WALL;
  map[2][4] = TILE_WALL;

  const result = simulateBombKickSlide(3, 2, 1, 0, map, { maxRebounds: 10 });
  assert.equal(result.endCol, 3, 'Remains centered in 1-tile pit');
  assert.equal(result.endRow, 2);
  assert.ok(result.steps <= 2, 'Terminates immediately without spinning infinite steps');
});

test('MECH-06: simulateBombKickSlide detonates immediately upon encountering enemy', () => {
  const map = createOpenMap(5, 12);
  const enemyTiles = new Set(['2,7']);

  const result = simulateBombKickSlide(2, 2, 1, 0, map, { enemyTiles });
  assert.equal(result.detonatedOnEnemy, true, 'Detonated on enemy');
  assert.equal(result.endCol, 7, 'Terminated on enemy tile col 7');
  assert.equal(result.endRow, 2);
});

/* ==============================================================================
 * PART 2: GAMESCENE HIGH-SPEED COLLISION BOUNDARIES & SWEPT ZERO-TUNNELING
 * ============================================================================== */

test('BOUND-01: Standard speed (300 px/s) respects all 4 perimeter boundary walls', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombPhysicsSimulator(map);

  // 1. East kick towards Col 14 perimeter wall
  const resE = sim.simulateSlide(460, 60, 1, 0, BOMB_KICK_SPEED, 16.67, 100);
  assert.equal(resE.isSliding, false);
  assert.equal(resE.stoppedSafeCol, 13);
  assert.equal(resE.finalX, 13 * TILE_SIZE + 20);
  assert.ok(resE.finalX + BOMB_RADIUS <= 14 * TILE_SIZE + 0.0001, 'No East wall penetration');

  // 2. West kick towards Col 0 perimeter wall
  const resW = sim.simulateSlide(100, 60, -1, 0, BOMB_KICK_SPEED, 16.67, 100);
  assert.equal(resW.isSliding, false);
  assert.equal(resW.stoppedSafeCol, 1);
  assert.equal(resW.finalX, 60);
  assert.ok(resW.finalX - BOMB_RADIUS >= 1 * TILE_SIZE - 0.0001, 'No West wall penetration');

  // 3. South kick towards Row 12 perimeter wall
  const resS = sim.simulateSlide(60, 380, 0, 1, BOMB_KICK_SPEED, 16.67, 100);
  assert.equal(resS.isSliding, false);
  assert.equal(resS.stoppedSafeRow, 11);
  assert.equal(resS.finalY, 11 * TILE_SIZE + 20);
  assert.ok(resS.finalY + BOMB_RADIUS <= 12 * TILE_SIZE + 0.0001, 'No South wall penetration');

  // 4. North kick towards Row 0 perimeter wall
  const resN = sim.simulateSlide(60, 100, 0, -1, BOMB_KICK_SPEED, 16.67, 100);
  assert.equal(resN.isSliding, false);
  assert.equal(resN.stoppedSafeRow, 1);
  assert.equal(resN.finalY, 60);
  assert.ok(resN.finalY - BOMB_RADIUS >= 1 * TILE_SIZE - 0.0001, 'No North wall penetration');
});

test('BOUND-02: Elemental speed (450 px/s) against internal corner pillars (r%2==0, c%2==0) maintains zero tunneling', () => {
  const map = createStandardMap();
  // Pillar at (2, 2) is TILE_WALL
  assert.equal(map[2][2], TILE_WALL);

  const sim = new GameSceneBombPhysicsSimulator(map);

  // Kicking along row 2 from col 1 (x=60, y=100) towards pillar at col 2
  const res = sim.simulateSlide(60, 100, 1, 0, BOMB_KICK_MAGMA_SPEED, 16.67, 50);

  assert.equal(res.isSliding, false);
  assert.equal(res.stoppedSafeCol, 1);
  assert.equal(res.finalX, 60);
  assert.ok(res.finalX + BOMB_RADIUS <= 80.0001, 'Bomb right edge (76) strictly <= pillar left edge (80)');
});

test('BOUND-03: Chrono/Abyssal slipstream speed (460 px/s) under 200ms lag spike (92px step) prevents wall clipping', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombPhysicsSimulator(map);

  // Bomb at (1, 9) [x=380, y=60], step distance at 460 * 0.200 = 92px (> 2 tiles)
  const res = sim.simulateSlide(380, 60, 1, 0, BOMB_KICK_CHRONO_SPEED, 200, 20);

  assert.equal(res.isSliding, false, 'Slide terminates cleanly');
  assert.equal(res.stoppedSafeCol, 13, 'Stopped cleanly at safe col 13 before col 14 wall');
  assert.equal(res.finalX, 540);
  assert.ok(res.finalX + BOMB_RADIUS <= 560.0001, 'Zero penetration into col 14 wall');

  for (const pt of res.trajectory) {
    assert.ok(pt.x + BOMB_RADIUS <= 560.0001, `Trajectory frame ${pt.frame} x=${pt.x} penetrated wall`);
    assert.ok(pt.x - BOMB_RADIUS >= 40.0001, `Trajectory frame ${pt.frame} x=${pt.x} breached West wall`);
  }
});

test('BOUND-04: Overclocked extreme velocity (1000 px/s) with 150ms delta (150px step > 3.7 tiles) prevents penetration', () => {
  const map = createOpenMap(5, 15);
  const sim = new GameSceneBombPhysicsSimulator(map);

  // Kicked East from Col 2 (x=100) at 1000 px/s towards Col 14 perimeter wall
  const res = sim.simulateSlide(100, 100, 1, 0, 1000, 150, 20);

  assert.equal(res.isSliding, false);
  assert.equal(res.stoppedSafeCol, 13);
  assert.equal(res.finalX, 13 * TILE_SIZE + 20);
  assert.ok(res.finalX + BOMB_RADIUS <= 14 * TILE_SIZE + 0.0001, 'Extreme 1000 px/s velocity did not penetrate wall');
});

/* ==============================================================================
 * PART 3: RICOCHET & REBOUND MECHANICS UNDER HIGH-SPEED BOUNDARIES
 * ============================================================================== */

test('RICO-01: Elastic Ricochet Bomb (3 rebounds) executes 3 consecutive specular reflections across corridor', () => {
  const map = createOpenMap(5, 8);
  // Col 0 wall, Col 7 wall. Walkable corridor is Col 1..6 (240px wide)
  const sim = new GameSceneBombPhysicsSimulator(map);

  // Bomb at Col 3 (x=140), kicked East at 460 px/s with 3 rebounds
  const res = sim.simulateSlide(140, 100, 1, 0, BOMB_KICK_NEBULA_SPEED, 16.67, 250, 3);

  assert.equal(res.reboundsExecuted, 3, 'Executed 3 rebounds');
  assert.equal(res.reboundsLeft, 0, 'Rebounds exhausted');
  assert.equal(sim.reboundEvents.length, 3);

  // Bounce 1: Hit East wall -> Col 6, dirX becomes -1
  assert.equal(sim.reboundEvents[0].col, 6);
  assert.equal(sim.reboundEvents[0].newDirX, -1);

  // Bounce 2: Hit West wall -> Col 1, dirX becomes 1
  assert.equal(sim.reboundEvents[1].col, 1);
  assert.equal(sim.reboundEvents[1].newDirX, 1);

  // Bounce 3: Hit East wall -> Col 6, dirX becomes -1
  assert.equal(sim.reboundEvents[2].col, 6);
  assert.equal(sim.reboundEvents[2].newDirX, -1);

  // Final stop: Rebounds exhausted at West wall -> stops at Col 1
  assert.equal(res.stoppedSafeCol, 1);
  assert.equal(res.finalX, 60);
  assert.equal(res.isSliding, false);
});

test('RICO-02: Ricochet bomb rebounding between two soft blocks preserves blocks intact', () => {
  const map = createOpenMap(5, 10);
  map[2][2] = TILE_BLOCK; // Soft block at Col 2
  map[2][7] = TILE_BLOCK; // Soft block at Col 7
  const sim = new GameSceneBombPhysicsSimulator(map);

  // Bomb at Col 4 (x=180), kicked East towards Col 7 soft block with 2 rebounds
  const res = sim.simulateSlide(180, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 150, 2);

  assert.equal(res.reboundsExecuted, 2);
  assert.equal(sim.reboundEvents[0].col, 6, 'Rebounds at Col 6 before Col 7 block');
  assert.equal(sim.reboundEvents[1].col, 3, 'Rebounds at Col 3 before Col 2 block');
  assert.equal(res.stoppedSafeCol, 6, 'Stops at Col 6');
  assert.equal(map[2][2], TILE_BLOCK, 'Col 2 soft block unharmed');
  assert.equal(map[2][7], TILE_BLOCK, 'Col 7 soft block unharmed');
});

test('RICO-03: Ricochet in 1-tile pit cul-de-sac safely terminates on first rebound (Trapped Defense)', () => {
  const map = createOpenMap(5, 7);
  // Isolated pit at (2, 3) flanked by walls at (2, 2) and (2, 4)
  map[2][2] = TILE_WALL;
  map[2][4] = TILE_WALL;
  const sim = new GameSceneBombPhysicsSimulator(map);

  const res = sim.simulateSlide(140, 100, 1, 0, BOMB_KICK_ABYSSAL_SPEED, 16.67, 50, 5);

  assert.equal(res.isSliding, false, 'Stopped immediately');
  assert.equal(res.stoppedSafeCol, 3, 'Cleanly confined to col 3');
  assert.equal(res.finalX, 140, 'Centered at tile center');
  assert.equal(res.reboundsExecuted, 1, 'Only 1 rebound before trapped reverse check triggers');
});

/* ==============================================================================
 * PART 4: CORNER SNAPPING & ALIGNMENT INVARIANTS
 * ============================================================================== */

test('SNAP-01: Bomb corner collision snaps to exact tile integer center (sub-pixel precision)', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombPhysicsSimulator(map);

  // Bomb at arbitrary float coordinate x=463.789, y=60.123 moving East
  const res = sim.simulateSlide(463.789, 60.123, 1, 0, BOMB_KICK_SPEED, 16.67, 60);

  assert.equal(res.isSliding, false);
  assert.equal(res.stoppedSafeCol, 13);
  assert.equal(res.finalX, 540, 'Exact integer center (13 * 40 + 20 = 540)');
  assert.equal(res.finalX % 40, 20, 'Modulo 40 is exactly 20');
});

test('SNAP-02: Kicked bomb sliding past orthogonal corridor T-junctions does not snag or deviate', () => {
  const map = createStandardMap();
  // Row 1 is open East-West corridor
  // Cols 1, 3, 5, 7, 9, 11, 13 intersect with North-South corridors
  const sim = new GameSceneBombPhysicsSimulator(map);

  // Kicked East from Col 1 (x=60, y=60) all the way to Col 13 (x=540, y=60)
  const res = sim.simulateSlide(60, 60, 1, 0, BOMB_KICK_SPEED, 16.67, 150);

  assert.equal(res.stoppedSafeCol, 13);
  assert.equal(res.finalX, 540);
  assert.equal(res.finalY, 60);

  // Verify every trajectory point kept constant y = 60
  for (const pt of res.trajectory) {
    assert.equal(pt.y, 60, `Trajectory point at x=${pt.x} maintained y=60 without vertical snagging`);
  }
});

test('SNAP-03: Player corner assist rounds around pillar corners to align for bomb kicking', () => {
  const map = createStandardMap();
  const playerSim = new PlayerCornerRoundingSimulator(map, 8);

  // Pillar at (2, 2) [x=80..120, y=80..120]
  // Player at (2, 1) [col 1, row 2, center x=60, y=100]
  // Player presses RIGHT (wantX = 1) towards pillar at (2, 2) with slight upward offset diffY = -4px (y = 96)
  const moveUp = playerSim.calculateMovement(60, 96, 1, 0, 150, 16.67, false);
  assert.equal(moveUp.vy, -150, 'Player receives upward assist velocity to round top corner of pillar');

  // Player presses RIGHT with slight downward offset diffY = +5px (y = 105)
  const moveDown = playerSim.calculateMovement(60, 105, 1, 0, 150, 16.67, false);
  assert.equal(moveDown.vy, 150, 'Player receives downward assist velocity to round bottom corner of pillar');

  // Direct open corridor: player at (1, 1) moving RIGHT into (1, 2) with diffY = -1px (within snapThreshold)
  const directSnap = playerSim.calculateMovement(60, 59, 1, 0, 150, 16.67, false);
  assert.equal(directSnap.snappedY, 60, 'Player snaps cleanly to corridor center y=60');
  assert.equal(directSnap.vy, 0);
});

test('SNAP-04: tryKickBomb respects cardinal priority, obstacle presence, and initializes ricochet counts', () => {
  const map = createStandardMap();

  // 1. Kick permitted when adjacent tile is open
  const player = { x: 60, y: 60 };
  const bomb = { x: 100, y: 60, active: true, isSliding: false, type: 'REGULAR' };
  const kickRes = tryKickBomb(player, bomb, true, 'right', map);
  assert.equal(kickRes.kicked, true);
  assert.equal(kickRes.dirX, 1);
  assert.equal(kickRes.dirY, 0);
  assert.equal(kickRes.rebounds, 0);

  // 2. Kick rejected if player lacks kick perk
  const noKickBomb = { x: 100, y: 60, active: true, isSliding: false };
  const noKickRes = tryKickBomb(player, noKickBomb, false, 'right', map);
  assert.equal(noKickRes.kicked, false);

  // 3. Kick rejected if target tile is a solid wall
  // Bomb at (1, 13) [x=540, y=60], player at (1, 12) [x=500, y=60]. Target is (1, 14) perimeter wall!
  const wallBomb = { x: 540, y: 60, active: true, isSliding: false };
  const wallPlayer = { x: 500, y: 60 };
  const wallKickRes = tryKickBomb(wallPlayer, wallBomb, true, 'right', map);
  assert.equal(wallKickRes.kicked, false);
  assert.equal(wallKickRes.reason, 'blocked_target_tile');

  // 4. Kick rejected if target tile is occupied by another bomb
  const otherBomb = { x: 140, y: 60, active: true };
  const bombWithNeighbor = { x: 100, y: 60, active: true, isSliding: false };
  const blockedKickRes = tryKickBomb(player, bombWithNeighbor, true, 'right', map, [otherBomb]);
  assert.equal(blockedKickRes.kicked, false);
  assert.equal(blockedKickRes.reason, 'other_bomb_at_target');

  // 5. Ricochet Bomb initializes with 3 rebounds
  const ricoBomb = { x: 100, y: 60, active: true, isSliding: false, type: 'RICOCHET_BOMB' };
  const ricoRes = tryKickBomb(player, ricoBomb, true, 'right', map);
  assert.equal(ricoRes.kicked, true);
  assert.equal(ricoRes.rebounds, 3);
});

test('SNAP-05: All 4 boundary corners (Top-Left, Top-Right, Bottom-Left, Bottom-Right) strictly confine kicked bombs', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombPhysicsSimulator(map);

  // Corner 1: Top-Left (Row 1, Col 1) [x=60, y=60]
  // Slide West towards Col 0 wall
  const resTL_W = sim.simulateSlide(60, 60, -1, 0, BOMB_KICK_SPEED, 16.67, 30);
  assert.equal(resTL_W.stoppedSafeCol, 1);
  assert.equal(resTL_W.finalX, 60);
  // Slide North towards Row 0 wall
  const resTL_N = sim.simulateSlide(60, 60, 0, -1, BOMB_KICK_SPEED, 16.67, 30);
  assert.equal(resTL_N.stoppedSafeRow, 1);
  assert.equal(resTL_N.finalY, 60);

  // Corner 2: Top-Right (Row 1, Col 13) [x=540, y=60]
  const resTR_E = sim.simulateSlide(540, 60, 1, 0, BOMB_KICK_SPEED, 16.67, 30);
  assert.equal(resTR_E.stoppedSafeCol, 13);
  assert.equal(resTR_E.finalX, 540);

  // Corner 3: Bottom-Left (Row 11, Col 1) [x=60, y=460]
  const resBL_W = sim.simulateSlide(60, 460, -1, 0, BOMB_KICK_SPEED, 16.67, 30);
  assert.equal(resBL_W.stoppedSafeCol, 1);
  assert.equal(resBL_W.finalX, 60);
  const resBL_S = sim.simulateSlide(60, 460, 0, 1, BOMB_KICK_SPEED, 16.67, 30);
  assert.equal(resBL_S.stoppedSafeRow, 11);
  assert.equal(resBL_S.finalY, 460);

  // Corner 4: Bottom-Right (Row 11, Col 13) [x=540, y=460]
  const resBR_E = sim.simulateSlide(540, 460, 1, 0, BOMB_KICK_SPEED, 16.67, 30);
  assert.equal(resBR_E.stoppedSafeCol, 13);
  assert.equal(resBR_E.finalX, 540);
  const resBR_S = sim.simulateSlide(540, 460, 0, 1, BOMB_KICK_SPEED, 16.67, 30);
  assert.equal(resBR_S.stoppedSafeRow, 11);
  assert.equal(resBR_S.finalY, 460);
});

/* ==============================================================================
 * PART 5: 300-TRIAL MONTE CARLO CHAOS FUZZING (ZERO WALL PENETRATION)
 * ============================================================================== */

test('CHAOS-01: 300-Trial Monte Carlo Chaos Fuzzing proves 100% boundary safety and zero clipping', () => {
  let passedTrials = 0;

  for (let trial = 0; trial < 300; trial++) {
    const rows = 7 + (trial % 7); // 7 to 13
    const cols = 9 + (trial % 9); // 9 to 17
    const map = createOpenMap(rows, cols);

    // Place random obstacle along row 3
    const obstacleCol = 4 + (trial % (cols - 5));
    map[3][obstacleCol] = trial % 2 === 0 ? TILE_WALL : TILE_BLOCK;

    const speed = [BOMB_KICK_SPEED, BOMB_KICK_MAGMA_SPEED, BOMB_KICK_SOLAR_SPEED, BOMB_KICK_CHRONO_SPEED, 500][trial % 5];
    const deltaMs = 4.17 + (trial * 19) % 195; // 4.17ms (240fps) to 200ms (lag spike)
    const rebounds = trial % 4; // 0, 1, 2, 3

    let enemies = [];
    if (trial % 4 === 0) {
      const eCol = 2 + (trial % (obstacleCol - 2));
      enemies.push({
        id: `fuzz_enemy_${trial}`,
        x: eCol * TILE_SIZE + 20,
        y: 3 * TILE_SIZE + 20,
        active: true,
        isDead: false,
        collisionRadius: 16,
      });
    }

    const sim = new GameSceneBombPhysicsSimulator(map, { enemies });
    const stepDist = speed * (deltaMs / 1000);
    const maxFrames = Math.max(500, Math.ceil(((rebounds + 1) * cols * TILE_SIZE * 1.5) / stepDist) + 50);
    const result = sim.simulateSlide(60, 3 * TILE_SIZE + 20, 1, 0, speed, deltaMs, maxFrames, rebounds);

    assert.equal(result.isSliding, false, `Trial ${trial}: slide must finish`);
    assert.ok(Number.isFinite(result.finalX), `Trial ${trial}: finalX is finite`);
    assert.ok(Number.isFinite(result.finalY), `Trial ${trial}: finalY is finite`);

    // Verify coordinates strictly inside arena
    assert.ok(result.finalX - BOMB_RADIUS >= 40, `Trial ${trial}: breached West wall`);
    assert.ok(result.finalX + BOMB_RADIUS <= (cols - 1) * TILE_SIZE, `Trial ${trial}: breached East wall`);
    assert.ok(result.finalY - BOMB_RADIUS >= 40, `Trial ${trial}: breached North wall`);
    assert.ok(result.finalY + BOMB_RADIUS <= (rows - 1) * TILE_SIZE, `Trial ${trial}: breached South wall`);

    // If stopped by obstacle, verify zero penetration
    if (!result.enemyImpactDetonation) {
      assert.ok(
        result.finalX + BOMB_RADIUS <= obstacleCol * TILE_SIZE + 0.0001 || result.finalX >= (obstacleCol + 1) * TILE_SIZE,
        `Trial ${trial}: Bomb right edge penetrated obstacle at col ${obstacleCol}`
      );
      // Clean tile snap
      const remainder = Math.round(result.finalX - 20) % TILE_SIZE;
      assert.equal(remainder, 0, `Trial ${trial}: Position snapped to tile center`);
    }

    passedTrials++;
  }

  assert.equal(passedTrials, 300, 'All 300 randomized Monte Carlo chaos fuzzing trials passed with 0 defects');
});

/* ==============================================================================
 * PART 6: EXHAUSTIVE PERIMETER SWEEP & CORNER VERTEX CLEARANCE
 * ============================================================================== */

test('PERIM-01: Complete perimeter sweep against all 52 perimeter wall tiles verifies 0% wall penetration', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombPhysicsSimulator(map);

  let sweepsTested = 0;

  // Sweep North perimeter (Row 0, cols 1..13): bomb at Row 2 kicked North
  for (let c = 1; c <= 13; c++) {
    if (map[1][c] === TILE_EMPTY) {
      const res = sim.simulateSlide(c * TILE_SIZE + 20, 2 * TILE_SIZE + 20, 0, -1, BOMB_KICK_CHRONO_SPEED, 16.67, 50);
      assert.equal(res.isSliding, false);
      assert.equal(res.stoppedSafeRow, 1);
      assert.equal(res.finalY, 60);
      assert.ok(res.finalY - BOMB_RADIUS >= 40.0001, `Col ${c} North breached Row 0 wall`);
      sweepsTested++;
    }
  }

  // Sweep South perimeter (Row 12, cols 1..13): bomb at Row 10 kicked South
  for (let c = 1; c <= 13; c++) {
    if (map[11][c] === TILE_EMPTY) {
      const res = sim.simulateSlide(c * TILE_SIZE + 20, 10 * TILE_SIZE + 20, 0, 1, BOMB_KICK_CHRONO_SPEED, 16.67, 50);
      assert.equal(res.isSliding, false);
      assert.equal(res.stoppedSafeRow, 11);
      assert.equal(res.finalY, 11 * TILE_SIZE + 20);
      assert.ok(res.finalY + BOMB_RADIUS <= 12 * TILE_SIZE + 0.0001, `Col ${c} South breached Row 12 wall`);
      sweepsTested++;
    }
  }

  // Sweep West perimeter (Col 0, rows 1..11): bomb at Col 2 kicked West
  for (let r = 1; r <= 11; r++) {
    if (map[r][1] === TILE_EMPTY) {
      const res = sim.simulateSlide(2 * TILE_SIZE + 20, r * TILE_SIZE + 20, -1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 50);
      assert.equal(res.isSliding, false);
      assert.equal(res.stoppedSafeCol, 1);
      assert.equal(res.finalX, 60);
      assert.ok(res.finalX - BOMB_RADIUS >= 40.0001, `Row ${r} West breached Col 0 wall`);
      sweepsTested++;
    }
  }

  // Sweep East perimeter (Col 14, rows 1..11): bomb at Col 12 kicked East
  for (let r = 1; r <= 11; r++) {
    if (map[r][13] === TILE_EMPTY) {
      const res = sim.simulateSlide(12 * TILE_SIZE + 20, r * TILE_SIZE + 20, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 50);
      assert.equal(res.isSliding, false);
      assert.equal(res.stoppedSafeCol, 13);
      assert.equal(res.finalX, 13 * TILE_SIZE + 20);
      assert.ok(res.finalX + BOMB_RADIUS <= 14 * TILE_SIZE + 0.0001, `Row ${r} East breached Col 14 wall`);
      sweepsTested++;
    }
  }

  assert.ok(sweepsTested >= 40, `Successfully verified ${sweepsTested} boundary perimeter approaches`);
});

test('CORNER-01: Corner vertex 4.0px physical clearance along all 4 faces of internal pillars', () => {
  const map = createStandardMap();
  // Internal pillar at (2, 2) spans x=[80..120], y=[80..120]
  assert.equal(map[2][2], TILE_WALL);

  // 1. Sliding East along Row 1 (y = 60):
  // Bomb y span: [60 - 16, 60 + 16] = [44, 76]
  // Pillar y starts at 80. Clearance = 80 - 76 = 4.0px!
  const topClearance = 80 - (60 + BOMB_RADIUS);
  assert.equal(topClearance, 4.0, 'Top face of pillar has exact 4.0px clearance');

  // 2. Sliding East along Row 3 (y = 140):
  // Bomb y span: [140 - 16, 140 + 16] = [124, 156]
  // Pillar y ends at 120. Clearance = 124 - 120 = 4.0px!
  const bottomClearance = (140 - BOMB_RADIUS) - 120;
  assert.equal(bottomClearance, 4.0, 'Bottom face of pillar has exact 4.0px clearance');

  // 3. Sliding South along Col 1 (x = 60):
  // Bomb x span: [44, 76]. Pillar x starts at 80. Clearance = 4.0px!
  const leftClearance = 80 - (60 + BOMB_RADIUS);
  assert.equal(leftClearance, 4.0, 'Left face of pillar has exact 4.0px clearance');

  // 4. Sliding South along Col 3 (x = 140):
  // Bomb x span: [124, 156]. Pillar x ends at 120. Clearance = 4.0px!
  const rightClearance = (140 - BOMB_RADIUS) - 120;
  assert.equal(rightClearance, 4.0, 'Right face of pillar has exact 4.0px clearance');
});

test('DIAG-01: tryKickBomb diagonal contact angle resolution tests all octants and tie-breaking', () => {
  const map = createOpenMap(7, 7);
  const makeBomb = () => ({ x: 100, y: 100, active: true, isSliding: false, reboundsLeft: 0 });

  // Octant 1: dx = 20, dy = 10 (|dx| > |dy|) -> dirX = 1, dirY = 0
  const o1 = tryKickBomb({ x: 80, y: 90 }, makeBomb(), true, 'right', map);
  assert.equal(o1.dirX, 1);
  assert.equal(o1.dirY, 0);

  // Octant 2: dx = 10, dy = 20 (|dy| > |dx|) -> dirX = 0, dirY = 1
  const o2 = tryKickBomb({ x: 90, y: 80 }, makeBomb(), true, 'down', map);
  assert.equal(o2.dirX, 0);
  assert.equal(o2.dirY, 1);

  // Octant 3: dx = -10, dy = 20 (|dy| > |dx|) -> dirX = 0, dirY = 1
  const o3 = tryKickBomb({ x: 110, y: 80 }, makeBomb(), true, 'down', map);
  assert.equal(o3.dirX, 0);
  assert.equal(o3.dirY, 1);

  // Octant 4: dx = -20, dy = 10 (|dx| > |dy|) -> dirX = -1, dirY = 0
  const o4 = tryKickBomb({ x: 120, y: 90 }, makeBomb(), true, 'left', map);
  assert.equal(o4.dirX, -1);
  assert.equal(o4.dirY, 0);

  // Exact diagonal tie: dx = 15, dy = 15 (Math.abs(dx) == Math.abs(dy), dy > 0) -> dirX = 0, dirY = 1
  const tie = tryKickBomb({ x: 85, y: 85 }, makeBomb(), true, 'right', map);
  assert.equal(tie.dirX, 0);
  assert.equal(tie.dirY, 1);

  // Dead center tie: dx = 0, dy = 0 -> falls back to playerFacing
  const centerFallback = tryKickBomb({ x: 100, y: 100 }, makeBomb(), true, 'up', map);
  assert.equal(centerFallback.dirX, 0);
  assert.equal(centerFallback.dirY, -1);
});

test('HIGH-01: 450 px/s high-velocity player corner rounding into bomb contact triggers immediate kick', () => {
  const map = createStandardMap();
  const playerSim = new PlayerCornerRoundingSimulator(map, 8);

  // Player at (2, 1) [x=60, y=95], dashing at 450 px/s towards pillar at (2, 2)
  // Bomb placed at corridor entrance (1, 2) [x=100, y=60]
  // 1. Player moves right: corner rounding gives upward assist vy = -450 px/s
  const move1 = playerSim.calculateMovement(60, 95, 1, 0, 450, 16.67);
  assert.equal(move1.vy, -450, 'Upward rounding assist applied at 450 px/s');

  // After rounding into Row 1 corridor: player y reaches 60.5 (within snapThreshold 7.5px)
  const move2 = playerSim.calculateMovement(75, 60.5, 1, 0, 450, 16.67);
  assert.equal(move2.snappedY, 60, 'Snapped cleanly to corridor center y=60');
  assert.equal(move2.vy, 0);

  // 2. Player at (x=80, y=60) makes contact with bomb at (x=100, y=60)
  const bomb = { x: 100, y: 60, active: true, isSliding: false };
  const kickResult = tryKickBomb({ x: 80, y: 60 }, bomb, true, 'right', map);
  assert.equal(kickResult.kicked, true);
  assert.equal(kickResult.dirX, 1);
  assert.equal(kickResult.dirY, 0);
});

test('RICO-04: L-bend corridor ricochet rebounds cleanly along orthogonal arm without corner clipping', () => {
  // Create an L-shaped corridor:
  // Row 1: Cols 1..5 is open (Col 6 is WALL)
  // Col 5: Rows 1..5 is open (Row 0 is WALL, Row 6 is WALL)
  const map = createOpenMap(7, 7);
  map[1][6] = TILE_WALL; // East wall of horizontal arm
  map[6][5] = TILE_WALL; // South wall of vertical arm

  const sim = new GameSceneBombPhysicsSimulator(map);

  // Bomb kicked East along Row 1 from Col 2 (x=100, y=60) with 1 rebound
  const res = sim.simulateSlide(100, 60, 1, 0, BOMB_KICK_SPEED, 16.67, 100, 1);

  assert.equal(res.reboundsExecuted, 1, 'Rebounded once off Col 6 wall');
  assert.equal(res.reboundEvents[0].col, 5, 'Rebounded at Col 5 before Col 6 wall');
  assert.equal(res.reboundEvents[0].newDirX, -1, 'Reversed West');
  assert.equal(res.stoppedSafeCol, 1, 'Stopped safely at Col 1 before Col 0 West wall');
  assert.equal(res.finalX, 60);
  assert.equal(res.finalY, 60);
  assert.equal(res.isSliding, false);
});
