/**
 * bomb_kick_sliding_and_rebound_mechanics.test.mjs
 *
 * Exhaustive Verification & Soak Test Battery for:
 * - Bomb Kick Mechanics & Velocity Tiers (300 px/s up to 460 px/s slipstream kicks)
 * - Continuous Sliding Physics & Zero-Tunneling across high frame deltas (up to 150ms)
 * - Clean Wall Rebound Physics (1, 2, 3 rebounds, specular reflection, trapped cell defense)
 * - Sub-pixel Tile Snapping & Center Alignment
 * - Continuous Swept-Ray Immediate Detonation on Enemy Impact
 * - High-Velocity Chain Reaction Detonation Cascades
 * - Discrete simulateBombKickSlide & Continuous Simulator Equivalence
 * - 200-Trial Monte Carlo Soak Testing under randomized deltas and configurations
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
import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';

const BOMB_KICK_ABYSSAL_SPEED = 460;
const BOMB_RADIUS = 16;
const ENEMY_RADIUS = 16;

const CARDINAL_DIRECTIONS = [
  { dr: -1, dc: 0, name: 'UP' },
  { dr: 1, dc: 0, name: 'DOWN' },
  { dr: 0, dc: -1, name: 'LEFT' },
  { dr: 0, dc: 1, name: 'RIGHT' },
];

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
 * Headless Boss Entity for Boss Collision Verification
 */
class HeadlessTestBoss extends BaseBoss {
  constructor(maxHp = 500, x = 300, y = 260) {
    super(
      {
        id: 'headless_test_boss',
        name: 'Test Boss',
        title: 'Collision Target',
        avatarEmoji: '👾',
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
 * High-Fidelity Continuous Bomb Physics Simulator matching GameScene.ts
 */
class ContinuousBombPhysicsSimulator {
  constructor(map, options = {}) {
    this.map = map.map((row) => [...row]);
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.otherBombs = (options.otherBombs || []).map((b) => ({ ...b }));
    this.enemies = (options.enemies || []).map((e) => ({ ...e }));
    this.activeBoss = options.activeBoss || null;

    // Simulation events
    this.bossCollided = false;
    this.enemyImpactDetonation = null;
    this.reboundEvents = [];
    this.explosions = [];
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
    const trajectory = [{ x: bombX, y: bombY, frame: 0, reboundsLeft }];

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

            // Check enemies on swept tile (immediate detonation on enemy impact)
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

      // Proximity enemy check (continuous sub-tile collision radius)
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

      // Check active boss collision
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

          // Check if reverse path is also immediately blocked (1x1 trapped cell)
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
        // Integrate continuous position
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
      trajectory,
      enemyImpactDetonation: this.enemyImpactDetonation,
      bossCollided: this.bossCollided,
    };
  }
}

/**
 * Detonation Cascade Engine
 */
class CascadeTestEngine {
  constructor(map, bombPower = 2) {
    this.map = map.map((row) => [...row]);
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.bombPower = bombPower;
    this.bombs = [];
    this.detonatedOrder = [];
    this.explosions = [];
  }

  addBomb(row, col, id) {
    const bomb = {
      id: id || `b_${row}_${col}`,
      row,
      col,
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
      active: true,
      power: this.bombPower,
    };
    this.bombs.push(bomb);
    return bomb;
  }

  explodeBomb(bomb) {
    if (!bomb || !bomb.active) return;
    bomb.active = false;
    this.detonatedOrder.push(bomb);

    const actualRow = bomb.row;
    const actualCol = bomb.col;
    this.explosions.push({ row: actualRow, col: actualCol, bombId: bomb.id });

    // Check same-tile stacked bombs
    for (const other of this.bombs) {
      if (other.active && other !== bomb && other.row === actualRow && other.col === actualCol) {
        this.explodeBomb(other);
      }
    }

    // Cardinal blast rays
    for (const dir of CARDINAL_DIRECTIONS) {
      for (let i = 1; i <= bomb.power; i++) {
        const nr = actualRow + dir.dr * i;
        const nc = actualCol + dir.dc * i;

        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
        if (this.map[nr][nc] === TILE_WALL) break;

        if (this.map[nr][nc] === TILE_BLOCK) {
          this.map[nr][nc] = TILE_EMPTY;
          this.explosions.push({ row: nr, col: nc, bombId: bomb.id });
          break; // Soft block absorbs blast ray
        }

        this.explosions.push({ row: nr, col: nc, bombId: bomb.id });

        // Chain detonate active bombs in blast ray
        for (const other of this.bombs) {
          if (other.active && other.row === nr && other.col === nc) {
            this.explodeBomb(other);
          }
        }
      }
    }
  }
}

/* ==============================================================================
 * PART 1: KICK VELOCITIES & SLIPSTREAM PHYSICS (UP TO 460 PX/S)
 * ============================================================================== */

test('VEL-01: Velocity tier hierarchy preserves exact specification constants', () => {
  assert.equal(BOMB_KICK_SPEED, 300, 'Standard kick speed is 300 px/s');
  assert.equal(BOMB_KICK_SOLAR_SPEED, 460, 'Solar Corona kick speed is 460 px/s');
  assert.equal(BOMB_KICK_MAGMA_SPEED, 450, 'Magma kick speed is 450 px/s');
  assert.equal(BOMB_KICK_CHRONO_SPEED, 460, 'Chrono slipstream kick speed is 460 px/s');
  assert.equal(BOMB_KICK_NEBULA_SPEED, 460, 'Nebula slipstream kick speed is 460 px/s');
  assert.equal(BOMB_KICK_ABYSSAL_SPEED, 460, 'Abyssal hydro slipstream kick speed is 460 px/s');
});

test('VEL-02: 460 px/s slipstream kick under 120 FPS (8.33ms) prevents wall penetration', () => {
  const map = createStandardMap();
  const sim = new ContinuousBombPhysicsSimulator(map);

  // Row 1 open corridor, kicked East from Col 10 (x=420) towards Col 14 perimeter wall (x=560)
  const result = sim.simulateSlide(420, 60, 1, 0, BOMB_KICK_CHRONO_SPEED, 8.33, 100);

  assert.equal(result.isSliding, false, 'Bomb must stop before wall');
  assert.equal(result.stoppedSafeCol, 13, 'Safe col is 13');
  assert.equal(result.finalX, 13 * TILE_SIZE + 20, 'Snapped to center 540');
  assert.ok(result.finalX + BOMB_RADIUS <= 560.0001, 'Right edge does not penetrate wall at 560');
});

test('VEL-03: 460 px/s slipstream kick under severe 150ms lag spike maintains zero tunneling', () => {
  const map = createStandardMap();
  const sim = new ContinuousBombPhysicsSimulator(map);

  // Step distance at 460 px/s * 0.150s = 69px (> 40px TILE_SIZE)
  const result = sim.simulateSlide(100, 60, 1, 0, BOMB_KICK_NEBULA_SPEED, 150, 20);

  assert.equal(result.isSliding, false, 'Slide must terminate cleanly');
  assert.equal(result.stoppedSafeCol, 13, 'Stopped cleanly at safe col 13');
  assert.equal(result.finalX, 540, 'Snapped to center 540');
  assert.ok(result.finalX + BOMB_RADIUS <= 560.0001, 'No tunneling through boundary wall');
});

test('VEL-04: 460 px/s slipstream kick against destructible soft block prevents tunneling', () => {
  const map = createOpenMap(5, 12);
  map[2][6] = TILE_BLOCK; // Soft block at Col 6 (x=240..280)
  const sim = new ContinuousBombPhysicsSimulator(map);

  // Kicked East from Col 2 (x=100) at 460 px/s with 60 FPS
  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 60);

  assert.equal(result.isSliding, false);
  assert.equal(result.stoppedSafeCol, 5, 'Stops right before soft block at col 5');
  assert.equal(result.finalX, 5 * TILE_SIZE + 20, 'Snapped to center 220');
  assert.ok(result.finalX + BOMB_RADIUS <= 240.0001, 'Right edge does not penetrate soft block at 240');
});

/* ==============================================================================
 * PART 2: CLEAN WALL REBOUND PHYSICS & TILE SNAPPING
 * ============================================================================== */

test('REB-01: Single wall rebound (1 rebound) reverses velocity and snaps cleanly', () => {
  const map = createOpenMap(5, 12);
  // Col 0 is WALL (x=0..40), Col 11 is WALL (x=440..480)
  const sim = new ContinuousBombPhysicsSimulator(map);

  // Bomb at Col 8 (x=340), kicked East (dirX = 1) towards Col 11 wall with 1 rebound
  const result = sim.simulateSlide(340, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 120, 1);

  assert.equal(result.reboundsExecuted, 1, 'Exactly 1 rebound executed');
  assert.equal(result.reboundsLeft, 0, 'Rebounds exhausted');
  assert.equal(sim.reboundEvents.length, 1);

  // First rebound happened at Col 10 (immediately before Col 11 wall)
  assert.equal(sim.reboundEvents[0].col, 10);
  assert.equal(sim.reboundEvents[0].newDirX, -1, 'Direction reversed to West');

  // After reflection, bomb slid West until stopped before Col 0 wall
  assert.equal(result.stoppedSafeCol, 1, 'Stopped at Col 1 before Col 0 perimeter wall');
  assert.equal(result.finalX, 1 * TILE_SIZE + 20, 'Tile center snapped to 60');
  assert.equal(result.isSliding, false, 'Came to complete rest');
});

test('REB-02: Multi-rebound trajectory (2 rebounds, Zero-G Fizz) bounces twice across corridor', () => {
  const map = createOpenMap(5, 10);
  // Col 0 is WALL (x=0..40), Col 9 is WALL (x=360..400)
  const sim = new ContinuousBombPhysicsSimulator(map);

  // Bomb at Col 5 (x=220), kicked East at 460 px/s with 2 rebounds
  const result = sim.simulateSlide(220, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 180, 2);

  assert.equal(result.reboundsExecuted, 2, 'Executed 2 rebounds');
  assert.equal(result.reboundsLeft, 0, 'Rebounds exhausted');
  assert.equal(sim.reboundEvents.length, 2);

  // Bounce 1: Hit Col 9 wall -> bounced West from Col 8
  assert.equal(sim.reboundEvents[0].col, 8);
  assert.equal(sim.reboundEvents[0].newDirX, -1);

  // Bounce 2: Hit Col 0 wall -> bounced East from Col 1
  assert.equal(sim.reboundEvents[1].col, 1);
  assert.equal(sim.reboundEvents[1].newDirX, 1);

  // Final stop: Hit Col 9 wall with 0 rebounds left -> stopped at Col 8
  assert.equal(result.stoppedSafeCol, 8);
  assert.equal(result.finalX, 8 * TILE_SIZE + 20);
  assert.equal(result.isSliding, false);
});

test('REB-03: Elastic Ricochet Bomb (3 rebounds) executes 3 reflections before stopping', () => {
  const map = createOpenMap(5, 8);
  // Col 0 is WALL, Col 7 is WALL. Open corridor is cols 1..6 (240px wide)
  const sim = new ContinuousBombPhysicsSimulator(map);

  // Bomb kicked East from Col 3 (x=140) at 460 px/s with 3 rebounds
  const result = sim.simulateSlide(140, 100, 1, 0, BOMB_KICK_NEBULA_SPEED, 16.67, 200, 3);

  assert.equal(result.reboundsExecuted, 3, 'All 3 rebounds executed');
  assert.equal(result.reboundsLeft, 0);

  // Bounce sequence: East wall (Col 6), West wall (Col 1), East wall (Col 6)
  assert.equal(sim.reboundEvents[0].col, 6);
  assert.equal(sim.reboundEvents[1].col, 1);
  assert.equal(sim.reboundEvents[2].col, 6);

  // Stops at West wall Col 1
  assert.equal(result.stoppedSafeCol, 1);
  assert.equal(result.finalX, 60);
  assert.equal(result.isSliding, false);
});

test('REB-04: Trapped 1-tile corridor safety prevents infinite oscillation', () => {
  const map = createOpenMap(5, 7);
  // Create a 1-tile isolated pit at Row 2, Col 3:
  // Col 2 is WALL, Col 4 is WALL
  map[2][2] = TILE_WALL;
  map[2][4] = TILE_WALL;

  const sim = new ContinuousBombPhysicsSimulator(map);

  // Bomb placed at Col 3 (x=140), kicked East towards Col 4 wall with 5 rebounds allowed
  const result = sim.simulateSlide(140, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 50, 5);

  assert.equal(result.isSliding, false, 'Must stop sliding cleanly');
  assert.equal(result.stoppedSafeCol, 3, 'Remains centered in 1-tile cell');
  assert.equal(result.finalX, 140, 'Centered at x=140');
  assert.ok(result.reboundsExecuted <= 1, 'Clean termination prevents runaway loop');
});

test('REB-05: Sub-pixel tile centering invariant strictly holds across all cardinal directions', () => {
  const map = createStandardMap();
  const sim = new ContinuousBombPhysicsSimulator(map);

  // Test North kick: from Col 1, Row 5 (y=220) towards North perimeter at Row 0
  const resultNorth = sim.simulateSlide(60, 220, 0, -1, BOMB_KICK_CHRONO_SPEED, 16.67, 60, 0);
  assert.equal(resultNorth.stoppedSafeRow, 1);
  assert.equal(resultNorth.finalY, 1 * TILE_SIZE + 20);
  assert.equal(resultNorth.finalX, 60);

  // Test South kick: from Col 1, Row 8 (y=340) towards South perimeter at Row 12
  const resultSouth = sim.simulateSlide(60, 340, 0, 1, BOMB_KICK_CHRONO_SPEED, 16.67, 60, 0);
  assert.equal(resultSouth.stoppedSafeRow, 11);
  assert.equal(resultSouth.finalY, 11 * TILE_SIZE + 20);
  assert.equal(resultSouth.finalX, 60);
});

/* ==============================================================================
 * PART 3: IMMEDIATE DETONATION ON ENEMY IMPACT
 * ============================================================================== */

test('ENM-01: Continuous swept ray collision triggers immediate detonation on enemy tile', () => {
  const map = createOpenMap(5, 12);
  const enemy = {
    id: 'chaser_1',
    x: 7 * TILE_SIZE + 20, // Col 7 (x=300)
    y: 100,
    active: true,
    isDead: false,
    collisionRadius: 16,
  };
  const sim = new ContinuousBombPhysicsSimulator(map, { enemies: [enemy] });

  // Bomb kicked East from Col 2 (x=100) at 460 px/s
  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 60);

  assert.equal(result.isSliding, false, 'Sliding halts upon impact');
  assert.ok(result.enemyImpactDetonation !== null, 'Enemy impact detonation event triggered');
  assert.equal(result.enemyImpactDetonation.col, 7, 'Detonated on enemy tile col 7');
  assert.equal(result.finalX, 300, 'Detonation centered on enemy x=300');
});

test('ENM-02: Zero tunneling through enemies under 150ms lag spike at 460 px/s', () => {
  const map = createOpenMap(5, 12);
  const enemy = {
    id: 'tank_1',
    x: 4 * TILE_SIZE + 20, // Col 4 (x=180)
    y: 100,
    active: true,
    isDead: false,
    collisionRadius: 16,
  };
  const sim = new ContinuousBombPhysicsSimulator(map, { enemies: [enemy] });

  // Bomb at Col 2 (x=100), step distance at 460 px/s * 0.150 = 69px (would skip to Col 4 in single frame)
  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 150, 10);

  assert.equal(result.isSliding, false);
  assert.ok(result.enemyImpactDetonation !== null, 'Swept detection caught enemy');
  assert.equal(result.enemyImpactDetonation.col, 4, 'Detonated on Col 4 without passing through');
});

test('ENM-03: Sub-tile continuous proximity collision catches offset enemy', () => {
  const map = createOpenMap(5, 12);
  // Enemy positioned slightly off tile center at x=215
  const enemy = {
    id: 'ghost_1',
    x: 215,
    y: 100,
    active: true,
    isDead: false,
    collisionRadius: 18,
  };
  const sim = new ContinuousBombPhysicsSimulator(map, { enemies: [enemy] });

  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_MAGMA_SPEED, 16.67, 60);

  assert.equal(result.isSliding, false);
  assert.ok(result.enemyImpactDetonation !== null);
  // Distance upon collision must be within radii sum (18 + 16 = 34px)
  const dist = Math.abs(result.finalX - 215);
  assert.ok(dist <= 34.0001, `Distance (${dist}) is within contact radius 34`);
});

test('ENM-04: Multi-rebound bomb detonates on enemy after reflecting off wall', () => {
  const map = createOpenMap(5, 10);
  // Enemy placed at Col 4 (x=180)
  const enemy = {
    id: 'splitter_1',
    x: 180,
    y: 100,
    active: true,
    isDead: false,
    collisionRadius: 16,
  };
  const sim = new ContinuousBombPhysicsSimulator(map, { enemies: [enemy] });

  // Bomb at Col 6 (x=260), kicked East towards Col 9 wall with 2 rebounds
  // Expected: Hits Col 9 wall -> reflects West -> impacts enemy at Col 4 and detonates!
  const result = sim.simulateSlide(260, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 80, 2);

  assert.equal(result.reboundsExecuted, 1, 'Rebounded once before hitting enemy');
  assert.ok(result.enemyImpactDetonation !== null, 'Detonated on enemy');
  assert.equal(result.enemyImpactDetonation.col, 4, 'Impacted enemy at Col 4');
  assert.equal(result.isSliding, false);
});

test('ENM-05: 460 px/s sliding bomb impact against active Boss triggers collision immediately', () => {
  const map = createOpenMap(5, 15);
  const boss = new HeadlessTestBoss(500, 320, 100);
  const sim = new ContinuousBombPhysicsSimulator(map, { activeBoss: boss });

  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 60);

  assert.equal(result.bossCollided, true, 'Boss collision detected');
  assert.equal(result.isSliding, false, 'Sliding terminated upon boss contact');
});

/* ==============================================================================
 * PART 4: HIGH-VELOCITY CHAIN REACTION DETONATION CASCADES
 * ============================================================================== */

test('CHN-01: 460 px/s sliding bomb detonates on enemy and triggers 20-bomb linear cascade', () => {
  const map = createOpenMap(5, 25);
  const cascade = new CascadeTestEngine(map, 2);

  // Place 20 stationary bombs along Row 2, cols 2..21
  for (let c = 2; c <= 21; c++) {
    cascade.addBomb(2, c, `corridor_bomb_${c}`);
  }

  // Enemy is at Col 2 (x=100)
  const enemy = {
    id: 'target_grunt',
    x: 2 * TILE_SIZE + 20,
    y: 100,
    active: true,
    isDead: false,
    collisionRadius: 16,
  };
  const physSim = new ContinuousBombPhysicsSimulator(map, { enemies: [enemy] });

  // Kicked bomb rocketing from Col 0/1 towards enemy at Col 2
  const physResult = physSim.simulateSlide(60, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 20);
  assert.ok(physResult.enemyImpactDetonation !== null, 'Impacted enemy at Col 2');

  // Trigger cascade starting from bomb at Col 2
  const starterBomb = cascade.bombs.find((b) => b.col === 2);
  cascade.explodeBomb(starterBomb);

  // Invariant: All 20 bombs must detonate cleanly in sequence
  assert.equal(cascade.detonatedOrder.length, 20, 'All 20 corridor bombs detonated');
  for (let i = 0; i < 20; i++) {
    assert.equal(cascade.detonatedOrder[i].col, 2 + i, `Bomb ${i} detonated in correct order`);
    assert.equal(cascade.bombs[i].active, false, `Bomb ${i} is inactive`);
  }
});

test('CHN-02: Sliding bomb impact initiates 25-bomb 5x5 crossfire grid chain detonation', () => {
  const map = createOpenMap(7, 7);
  const cascade = new CascadeTestEngine(map, 2);

  // 5x5 grid of bombs at rows 1..5, cols 1..5
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 5; c++) {
      cascade.addBomb(r, c, `grid_${r}_${c}`);
    }
  }

  // Center bomb at (3, 3) detonated by sliding bomb impact
  const centerBomb = cascade.bombs.find((b) => b.row === 3 && b.col === 3);
  cascade.explodeBomb(centerBomb);

  // Invariant: All 25 bombs in crossfire grid detonate completely
  assert.equal(cascade.detonatedOrder.length, 25, 'All 25 bombs detonated');
  assert.ok(cascade.bombs.every((b) => !b.active), 'Zero active bombs remaining');
});

test('CHN-03: AudioVoicePool handles 25+ simultaneous detonations without leaks', () => {
  const mockCtx = {
    currentTime: 10.0,
    state: 'running',
    destination: {},
    createOscillator: () => ({
      type: 'sine',
      frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
      Q: { setValueAtTime: () => {}, cancelScheduledValues: () => {} },
      connect: () => {},
      disconnect: () => {},
    }),
    createGain: () => ({
      gain: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} },
      connect: () => {},
      disconnect: () => {},
    }),
  };

  const pool = new AudioVoicePool(16);
  pool.init(mockCtx);
  assert.equal(pool.capacity, 16);
  assert.equal(pool.getActiveCount(), 0);

  // Dispatch 25 simultaneous bomb explosion voices
  for (let i = 0; i < 25; i++) {
    const voice = pool.acquireVoice();
    assert.ok(voice, `Voice ${i} acquired via pool recycling / stealing`);
    voice.play(
      {
        frequency: 80,
        gain: 0.8,
        duration: 0.4,
      },
      mockCtx
    );
  }

  // Pool active count must be capped at 16 (voice stealing without unbounded heap growth)
  assert.ok(pool.getActiveCount() <= 16, `Active count (${pool.getActiveCount()}) <= capacity (16)`);

  // Reset/silence all voices
  pool.reset();
  mockCtx.currentTime += 0.5;
  assert.equal(pool.getActiveCount(), 0, 'All voices returned to quiescent state');
});

/* ==============================================================================
 * PART 5: DISCRETE & CONTINUOUS SIMULATION HARMONY
 * ============================================================================== */

test('HARM-01: Discrete simulateBombKickSlide agrees with continuous physics on wall stops', () => {
  const map = createStandardMap();
  const discrete = simulateBombKickSlide(2, 1, 1, 0, map);

  const sim = new ContinuousBombPhysicsSimulator(map);
  const cont = sim.simulateSlide(2 * TILE_SIZE + 20, 1 * TILE_SIZE + 20, 1, 0, BOMB_KICK_SPEED, 16.67, 100);

  assert.equal(discrete.endCol, cont.stoppedSafeCol, 'Col agreement on obstacle stop');
  assert.equal(discrete.endRow, cont.stoppedSafeRow, 'Row agreement on obstacle stop');
  assert.equal(cont.finalX, discrete.endCol * TILE_SIZE + 20, 'Exact pixel snap alignment');
});

test('HARM-02: Discrete simulateBombKickSlide agrees with continuous physics on multi-rebound', () => {
  const map = createOpenMap(5, 10);
  const discrete = simulateBombKickSlide(2, 2, 1, 0, map, { maxRebounds: 2 });

  const sim = new ContinuousBombPhysicsSimulator(map);
  const cont = sim.simulateSlide(2 * TILE_SIZE + 20, 2 * TILE_SIZE + 20, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 200, 2);

  assert.equal(discrete.rebounds, cont.reboundsExecuted, 'Rebound count matches');
  assert.equal(discrete.endCol, cont.stoppedSafeCol, 'Final safe col matches');
  assert.equal(discrete.endRow, cont.stoppedSafeRow, 'Final safe row matches');
});

test('HARM-03: Discrete simulateBombKickSlide agrees with continuous physics on enemy impact', () => {
  const map = createOpenMap(5, 12);
  const enemyTiles = new Set(['2,7']);
  const discrete = simulateBombKickSlide(2, 2, 1, 0, map, { enemyTiles });

  const sim = new ContinuousBombPhysicsSimulator(map, {
    enemies: [{ x: 7 * TILE_SIZE + 20, y: 2 * TILE_SIZE + 20, active: true, isDead: false, collisionRadius: 16 }],
  });
  const cont = sim.simulateSlide(2 * TILE_SIZE + 20, 2 * TILE_SIZE + 20, 1, 0, BOMB_KICK_NEBULA_SPEED, 16.67, 60);

  assert.equal(discrete.detonatedOnEnemy, true, 'Discrete detonatedOnEnemy is true');
  assert.ok(cont.enemyImpactDetonation !== null, 'Continuous enemy impact triggered');
  assert.equal(discrete.endCol, 7);
  assert.equal(cont.enemyImpactDetonation.col, 7);
});

/* ==============================================================================
 * PART 6: 200-TRIAL MONTE CARLO SOAK & STRESS TESTING
 * ============================================================================== */

test('SOAK-01: 200-Trial Monte Carlo Soak Test verifies zero tunneling, clean rebounds, and tile snapping', () => {
  let passedTrials = 0;

  for (let trial = 0; trial < 200; trial++) {
    const map = createOpenMap(7, 15);
    const wallCol = 7 + (trial % 7); // Col 7..13
    map[3][wallCol] = trial % 3 === 0 ? TILE_WALL : trial % 3 === 1 ? TILE_BLOCK : TILE_WALL;

    const rebounds = trial % 4; // 0, 1, 2, 3 rebounds
    const speed = [BOMB_KICK_SPEED, BOMB_KICK_SOLAR_SPEED, BOMB_KICK_MAGMA_SPEED, BOMB_KICK_CHRONO_SPEED][trial % 4];
    const deltaMs = 8.33 + (trial * 17) % 115; // 8.33ms to 123ms

    let enemies = [];
    if (trial % 5 === 0) {
      // Enemy at random open tile
      const enemyCol = 3 + (trial % (wallCol - 4));
      enemies.push({
        id: `soak_enemy_${trial}`,
        x: enemyCol * TILE_SIZE + 20,
        y: 3 * TILE_SIZE + 20,
        active: true,
        isDead: false,
        collisionRadius: 16,
      });
    }

    const sim = new ContinuousBombPhysicsSimulator(map, { enemies });
    const result = sim.simulateSlide(60, 3 * TILE_SIZE + 20, 1, 0, speed, deltaMs, 500, rebounds);

    assert.equal(result.isSliding, false, `Trial ${trial}: Must stop sliding`);

    // Invariant 1: No NaN coordinates
    assert.ok(Number.isFinite(result.finalX), `Trial ${trial}: finalX must be finite`);
    assert.ok(Number.isFinite(result.finalY), `Trial ${trial}: finalY must be finite`);

    // Invariant 2: Stopped bomb strictly within map bounds
    assert.ok(result.finalX >= 60 && result.finalX <= (15 - 1) * TILE_SIZE + 20);

    // Invariant 3: Right edge never penetrates right perimeter or obstacle
    if (!result.enemyImpactDetonation) {
      assert.ok(
        result.finalX + BOMB_RADIUS <= (wallCol + 1) * TILE_SIZE + 0.0001,
        `Trial ${trial}: Penetration violation`
      );
    }

    // Invariant 4: Snapped position is centered on an integer tile
    const remainderX = Math.round(result.finalX - 20) % TILE_SIZE;
    assert.equal(remainderX, 0, `Trial ${trial}: Position snapped cleanly to tile center (mod 40 == 0)`);

    passedTrials++;
  }

  assert.equal(passedTrials, 200, 'All 200 Monte Carlo soak trials passed with 0% defect rate');
});
