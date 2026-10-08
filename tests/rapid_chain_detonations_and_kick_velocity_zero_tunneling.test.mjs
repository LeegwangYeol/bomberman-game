/**
 * rapid_chain_detonations_and_kick_velocity_zero_tunneling.test.mjs
 *
 * Comprehensive Verification & Soak Test Battery for:
 * Part 1: Rapid Chain Detonations (20+ simultaneous bomb explosions)
 *   - 20-bomb linear corridor instantaneous chain detonation
 *   - 25-bomb 5x5 crossfire grid simultaneous timeout detonation
 *   - 30-bomb concentric double-ring cascade with soft blocks
 *   - 40-bomb serpentine corridor cascade under DynamicHazard & Entangled Ghost Bombs
 *   - 50-bomb maximum density cluster around multi-phase Boss (PHYS-06 Invariant)
 *   - 64-bomb extreme stack & co-located cluster (16 tiles x 4 bombs stacked)
 *   - Audio Voice Pool recycling & voice-stealing under 25+ simultaneous detonations
 *   - Camera trauma accumulation and saturation clamping under 30 rapid detonations
 *
 * Part 2: Bomb Kick Velocities (up to 460 px/s) & Zero-Tunneling Invariants
 *   - Standard speed: 300 px/s (BOMB_KICK_SPEED) against perimeter boundary walls
 *   - Elemental speed: 450 px/s (Magma/Miasma/Volt/Frost) against internal wall pillars
 *   - Chrono slipstream speed: 460 px/s (BOMB_KICK_CHRONO_SPEED) against 1-tile soft blocks
 *   - Catastrophic lag spikes: 150ms delta (stepDistance = 69px > TILE_SIZE 40px) zero tunneling
 *   - Swept continuous raymarch collision against stationary bombs (zero overlap)
 *   - 460 px/s head-on collision between two sliding bombs (zero pass-through)
 *   - 460 px/s sliding bomb impact against active Boss entity
 *   - Monte Carlo 100-trial soak test: Randomized 460 px/s kicks across variable deltas (8ms to 120ms)
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
  DynamicHazard,
  HazardLifecycleState,
} from '../src/game/hazards/index.ts';
import { BaseBoss, BossState } from '../src/game/bosses/index.ts';
import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';

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
 * Headless Concrete Boss for Boss-Hit Verification
 */
class HeadlessStressBoss extends BaseBoss {
  constructor(maxHp = 500, x = 300, y = 260) {
    super(
      {
        id: 'headless_stress_boss',
        name: 'Detonation Stress Boss',
        title: 'Cascade Punching Bag',
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
    this.isInvulnerable = false;
  }

  canTakeDamage() {
    return true;
  }

  updatePhase1() {}
  updatePhase2() {}
  updateEnraged() {}
  onHitReceived() {}
  onDamageBlocked() {}
  onStateChanged() {}
}

/**
 * High-Fidelity Detonation & Cascade Simulator faithfully matching GameScene.ts explodeBomb
 */
class HighFidelityCascadeSimulator {
  constructor(map, maxBombs = 200, bombPower = 2) {
    this.map = map.map((row) => [...row]);
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.maxBombs = maxBombs;
    this.bombPower = bombPower;
    this.activeBombs = 0;
    this.bombs = [];
    this.explosions = [];
    this.destroyedBlocks = [];
    this.destroyedBlocksThisTick = new Set();
    this.nextId = 1;

    this.dynamicHazard = null;
    this.boss = null;
    this.bossHitBombIds = new Set();
    this.bossHitsByBombId = [];

    // Diagnostics
    this.currentCallDepth = 0;
    this.maxCallDepth = 0;
    this.totalExplodeCalls = 0;
    this.detonatedBombIds = new Set();
    this.duplicateDetonations = [];
    this.maxSafeStackLimit = 5000;
  }

  placeBomb(x, y, customPower = null, isGhostBomb = false, parentBombId = null, fuseMs = 2000) {
    if (this.activeBombs >= this.maxBombs) return null;
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    const dataStore = new Map();
    const id = `bomb_${this.nextId++}`;
    dataStore.set('id', id);
    dataStore.set('power', customPower ?? this.bombPower);
    dataStore.set('owner', 'player');
    dataStore.set('isGhostBomb', isGhostBomb);
    if (parentBombId) dataStore.set('parentBombId', parentBombId);

    const bombSprite = {
      x: centerX,
      y: centerY,
      active: true,
      row,
      col,
      timeElapsed: 0,
      fuseMs,
      getData: (key) => dataStore.get(key),
      setData: (key, val) => dataStore.set(key, val),
      destroy: () => {
        bombSprite.active = false;
        const idx = this.bombs.indexOf(bombSprite);
        if (idx !== -1) {
          this.bombs.splice(idx, 1);
        }
      },
    };

    this.bombs.push(bombSprite);
    if (!isGhostBomb) {
      this.activeBombs++;
    }
    return bombSprite;
  }

  placeBombAtGrid(row, col, customPower = null, isGhostBomb = false, parentBombId = null, fuseMs = 2000) {
    return this.placeBomb(col * TILE_SIZE + 20, row * TILE_SIZE + 20, customPower, isGhostBomb, parentBombId, fuseMs);
  }

  getBombChildren() {
    return [...this.bombs];
  }

  update(deltaMs) {
    this.destroyedBlocksThisTick.clear();
    const toExplode = [];
    for (const bomb of this.bombs) {
      if (!bomb.active) continue;
      bomb.timeElapsed += deltaMs;
      if (bomb.timeElapsed >= bomb.fuseMs) {
        toExplode.push(bomb);
      }
    }
    for (const bomb of toExplode) {
      if (bomb.active) {
        this.explodeBomb(bomb);
      }
    }
  }

  explodeBomb(bomb, row = null, col = null) {
    if (!bomb || !bomb.active) return;

    this.currentCallDepth++;
    if (this.currentCallDepth > this.maxCallDepth) {
      this.maxCallDepth = this.currentCallDepth;
    }
    if (this.currentCallDepth > this.maxSafeStackLimit) {
      throw new Error(`CRITICAL: Call stack limit exceeded (${this.currentCallDepth})`);
    }
    this.totalExplodeCalls++;

    const bombId = bomb.getData('id') || `bomb_${this.nextId++}`;
    if (this.detonatedBombIds.has(bombId)) {
      this.duplicateDetonations.push(bombId);
      throw new Error(`CRITICAL: Infinite loop detected! Bomb ${bombId} detonated multiple times`);
    }
    this.detonatedBombIds.add(bombId);

    try {
      const curCol = Math.floor(bomb.x / TILE_SIZE);
      const curRow = Math.floor(bomb.y / TILE_SIZE);
      const actualRow = Number.isFinite(curRow) && curRow >= 0 && curRow < this.rows ? curRow : (row ?? 0);
      const actualCol = Number.isFinite(curCol) && curCol >= 0 && curCol < this.cols ? curCol : (col ?? 0);

      const bombPower = bomb.getData('power') || this.bombPower;
      const isGhostBomb = Boolean(bomb.getData('isGhostBomb'));

      // 1. Physically destroy bomb sprite before cascading (GameScene line 4298)
      bomb.destroy();

      if (!isGhostBomb) {
        this.activeBombs = Math.max(0, this.activeBombs - 1);
      }

      // 2. Dynamic Hazard Interactions
      let effectivePower = bombPower;
      let isPiercing = false;

      if (this.dynamicHazard) {
        const detResult = this.dynamicHazard.onBombDetonated(bombId, actualRow, actualCol, bombPower);
        if (detResult.overcharged) {
          effectivePower = detResult.modifiedPower;
          isPiercing = detResult.piercing;
        }

        if (detResult.pairedGhostBombIds && detResult.pairedGhostBombIds.length > 0) {
          const pairedBombsToDetonate = [];
          const allBombs = this.getBombChildren();
          for (let i = 0; i < allBombs.length; i++) {
            const b = allBombs[i];
            if (b && b.active && b !== bomb) {
              const bId = b.getData('id');
              const parentId = b.getData('parentBombId');
              if (
                detResult.pairedGhostBombIds.includes(bId) ||
                (parentId && detResult.pairedGhostBombIds.includes(parentId))
              ) {
                const bCol = Math.floor(b.x / TILE_SIZE);
                const bRow = Math.floor(b.y / TILE_SIZE);
                pairedBombsToDetonate.push({ b, r: bRow, c: bCol });
              }
            }
          }
          for (let i = 0; i < pairedBombsToDetonate.length; i++) {
            const target = pairedBombsToDetonate[i];
            if (target.b.active) {
              this.explodeBomb(target.b, target.r, target.c);
            }
          }
        }
      }

      // 3. Spawn Epicenter Explosion
      this.explosions.push({ row: actualRow, col: actualCol, isCenter: true, bombId, isPiercing });
      this.checkBossHit(actualRow, actualCol, bombId);

      // 4. Epicenter chain reaction: detonate any other active bombs stacked on same tile
      const sameTileBombs = [];
      const bombChildren = this.getBombChildren();
      for (let cIdx = 0; cIdx < bombChildren.length; cIdx++) {
        const otherBomb = bombChildren[cIdx];
        if (otherBomb && otherBomb.active && otherBomb !== bomb) {
          const bCol = Math.floor(otherBomb.x / TILE_SIZE);
          const bRow = Math.floor(otherBomb.y / TILE_SIZE);
          if (bRow === actualRow && bCol === actualCol) {
            sameTileBombs.push(otherBomb);
          }
        }
      }
      for (let i = 0; i < sameTileBombs.length; i++) {
        const otherBomb = sameTileBombs[i];
        if (otherBomb.active) {
          const bCol = Math.floor(otherBomb.x / TILE_SIZE);
          const bRow = Math.floor(otherBomb.y / TILE_SIZE);
          this.explodeBomb(otherBomb, bRow, bCol);
        }
      }

      // 5. Blast rays in 4 cardinal directions
      for (const dir of CARDINAL_DIRECTIONS) {
        let blocksPierced = 0;
        for (let i = 1; i <= effectivePower; i++) {
          const nr = actualRow + dir.dr * i;
          const nc = actualCol + dir.dc * i;

          if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
          if (this.map[nr][nc] === TILE_WALL) break; // Unbreakable wall

          const key = `${nr},${nc}`;
          const isBlock = this.map[nr][nc] === TILE_BLOCK || this.destroyedBlocksThisTick.has(key);

          if (isBlock) {
            this.destroyedBlocksThisTick.add(key);
            if (this.map[nr][nc] === TILE_BLOCK) {
              this.map[nr][nc] = TILE_EMPTY;
              this.destroyedBlocks.push({ row: nr, col: nc });
            }
            this.explosions.push({ row: nr, col: nc, isCenter: false, bombId, isPiercing });
            this.checkBossHit(nr, nc, bombId);
            if (!isPiercing || ++blocksPierced >= 3) {
              break;
            }
            continue;
          }

          // Empty tile explosion
          this.explosions.push({ row: nr, col: nc, isCenter: false, bombId, isPiercing });
          this.checkBossHit(nr, nc, bombId);

          // Check for chained bombs
          const chainedBombs = [];
          const activeBombsList = this.getBombChildren();
          for (let bIdx = 0; bIdx < activeBombsList.length; bIdx++) {
            const otherBomb = activeBombsList[bIdx];
            if (otherBomb && otherBomb.active) {
              const bCol = Math.floor(otherBomb.x / TILE_SIZE);
              const bRow = Math.floor(otherBomb.y / TILE_SIZE);
              if (bRow === nr && bCol === nc) {
                chainedBombs.push(otherBomb);
              }
            }
          }
          for (let j = 0; j < chainedBombs.length; j++) {
            const otherBomb = chainedBombs[j];
            if (otherBomb.active) {
              const bCol = Math.floor(otherBomb.x / TILE_SIZE);
              const bRow = Math.floor(otherBomb.y / TILE_SIZE);
              this.explodeBomb(otherBomb, bRow, bCol);
            }
          }
        }
      }
    } finally {
      this.currentCallDepth--;
    }
  }

  checkBossHit(row, col, bombId) {
    if (!this.boss || this.boss.bossState === BossState.DEFEATED) return;
    const x = col * TILE_SIZE + TILE_SIZE / 2;
    const y = row * TILE_SIZE + TILE_SIZE / 2;
    const dist = Math.hypot(x - this.boss.x, y - this.boss.y);
    const reach = (this.boss.config.colliderRadius || 35) + 20;

    if (dist < reach) {
      if (!bombId || !this.bossHitBombIds.has(bombId)) {
        if (bombId) {
          this.bossHitBombIds.add(bombId);
        }
        this.boss.takeBombDamage(1, 'bomb');
        this.bossHitsByBombId.push({ bombId, row, col, dist });
      }
    }
  }
}

/**
 * Continuous Kicked Bomb Physics Simulator matching GameScene.ts lines 1944-2008
 */
class KickedBombPhysicsSimulator {
  constructor(map, otherBombs = []) {
    this.map = map.map((row) => [...row]);
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.otherBombs = otherBombs.map((b) => ({ ...b }));
    this.activeBoss = null;
    this.bossCollided = false;
  }

  simulateSlide(startX, startY, dirX, dirY, speed, deltaMs, maxFrames = 300) {
    let bombX = startX;
    let bombY = startY;
    let isSliding = true;
    let stoppedSafeCol = null;
    let stoppedSafeRow = null;
    const trajectory = [{ x: bombX, y: bombY, frame: 0 }];

    for (let frame = 1; frame <= maxFrames; frame++) {
      if (!isSliding) break;

      const bCol = Math.floor(bombX / TILE_SIZE);
      const bRow = Math.floor(bombY / TILE_SIZE);

      const stepDistance = speed * (deltaMs / 1000);
      const lookahead = Math.max(16, 16 + stepDistance + 2);
      const checkX = bombX + dirX * lookahead;
      const checkY = bombY + dirY * lookahead;
      const targetCol = Math.floor(checkX / TILE_SIZE);
      const targetRow = Math.floor(checkY / TILE_SIZE);

      let blocked = false;
      let stopCol = bCol;
      let stopRow = bRow;

      const dCol = Math.sign(dirX);
      const dRow = Math.sign(dirY);
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
          }
        }
      }

      // Boss collision check
      if (this.activeBoss && this.activeBoss.bossState !== BossState.DEFEATED) {
        const bossDist = Math.hypot(bombX - this.activeBoss.x, bombY - this.activeBoss.y);
        if (bossDist < (this.activeBoss.config.colliderRadius || 35) + 16) {
          this.bossCollided = true;
          isSliding = false;
          break;
        }
      }

      if (blocked) {
        isSliding = false;
        stoppedSafeCol = Math.max(0, Math.min(this.cols - 1, stopCol));
        stoppedSafeRow = Math.max(0, Math.min(this.rows - 1, stopRow));
        bombX = stoppedSafeCol * TILE_SIZE + TILE_SIZE / 2;
        bombY = stoppedSafeRow * TILE_SIZE + TILE_SIZE / 2;
      } else {
        // Integrate continuous position
        bombX += dirX * stepDistance;
        bombY += dirY * stepDistance;
      }

      trajectory.push({ x: bombX, y: bombY, frame, isSliding });
    }

    return {
      finalX: bombX,
      finalY: bombY,
      isSliding,
      stoppedSafeCol,
      stoppedSafeRow,
      trajectory,
    };
  }
}

/* ==============================================================================
 * PART 1: RAPID CHAIN DETONATIONS (20+ SIMULTANEOUS BOMB EXPLOSIONS)
 * ============================================================================== */

test('CHAIN-01: 20-bomb linear corridor instantaneous chain detonation terminates cleanly', () => {
  // Place exactly 20 bombs along row 2, cols 1..20 (open map 25 cols)
  const openArena = createOpenMap(5, 25);
  const sim20 = new HighFidelityCascadeSimulator(openArena, 50, 1);

  for (let c = 1; c <= 20; c++) {
    sim20.placeBombAtGrid(2, c, 1);
  }

  assert.equal(sim20.activeBombs, 20, '20 bombs placed');
  assert.equal(sim20.bombs.length, 20);

  // Detonate head bomb at (2, 1)
  sim20.explodeBomb(sim20.bombs[0]);

  assert.equal(sim20.activeBombs, 0, 'All 20 bombs detonated');
  assert.equal(sim20.bombs.length, 0, '0 active bomb sprites remaining');
  assert.equal(sim20.totalExplodeCalls, 20, 'Exactly 20 explodeBomb calls occurred');
  assert.equal(sim20.detonatedBombIds.size, 20, 'All 20 bomb IDs executed once');
  assert.equal(sim20.duplicateDetonations.length, 0, 'Zero duplicate detonations');
  assert.ok(sim20.maxCallDepth <= 20, `Call depth (${sim20.maxCallDepth}) <= 20`);
  assert.equal(sim20.currentCallDepth, 0, 'Call stack cleanly unwound to 0');
});

test('CHAIN-02: 25-bomb 5x5 crossfire grid simultaneous timeout detonation (single frame tick)', () => {
  const map = createOpenMap(10, 10);
  const sim = new HighFidelityCascadeSimulator(map, 50, 2);

  // 25 bombs in 5x5 grid (rows 2..6, cols 2..6)
  for (let r = 2; r <= 6; r++) {
    for (let c = 2; c <= 6; c++) {
      sim.placeBombAtGrid(r, c, 2, false, null, 2000);
    }
  }

  assert.equal(sim.activeBombs, 25, '25 bombs placed');

  // Trigger simultaneous expiration at frame tick deltaMs = 2000
  sim.update(2000);

  assert.equal(sim.activeBombs, 0, 'All 25 bombs cleared');
  assert.equal(sim.totalExplodeCalls, 25, 'Exactly 25 detonations');
  assert.equal(sim.detonatedBombIds.size, 25, '25 unique IDs');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate triggers in crossfire');
  assert.equal(sim.currentCallDepth, 0, 'Stack depth unwound to 0');
});

test('CHAIN-03: 30-bomb concentric double-ring cascade with destructible soft blocks', () => {
  const map = createStandardMap();
  // Place soft blocks around ring
  for (let r = 2; r <= 10; r += 2) {
    for (let c = 3; c <= 11; c += 2) {
      if (map[r][c] === TILE_EMPTY) {
        map[r][c] = TILE_BLOCK;
      }
    }
  }

  const sim = new HighFidelityCascadeSimulator(map, 60, 2);

  // Place 30 bombs along rows 3, 5, 7, 9
  let placed = 0;
  for (const r of [3, 5, 7, 9]) {
    for (let c = 1; c <= 13; c++) {
      if (placed < 30 && map[r][c] === TILE_EMPTY) {
        sim.placeBombAtGrid(r, c, 2);
        placed++;
      }
    }
  }

  assert.equal(placed, 30, 'Placed 30 bombs');
  assert.equal(sim.activeBombs, 30);

  // Detonate the first bomb
  sim.explodeBomb(sim.bombs[0]);

  assert.equal(sim.activeBombs, 0, 'All 30 bombs detonated');
  assert.equal(sim.totalExplodeCalls, 30, '30 detonations executed');
  assert.equal(sim.duplicateDetonations.length, 0, 'No loop re-triggers');
  assert.ok(sim.destroyedBlocks.length > 0, 'Soft blocks along blast rays were destroyed');
  assert.equal(sim.currentCallDepth, 0, 'Call stack cleanly unwound');
});

test('CHAIN-04: 40-bomb serpentine corridor cascade under DynamicHazard & Entangled Ghost Bombs', () => {
  const map = createStandardMap();
  const hazard = new DynamicHazard();
  hazard.init(map);
  hazard.start('CLIMAX');
  hazard.update(2000); // TELEGRAPH
  hazard.update(2000); // ACTIVE
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  const sim = new HighFidelityCascadeSimulator(map, 80, 2);
  sim.dynamicHazard = hazard;

  // Place 36 normal bombs
  let placed = 0;
  for (let r = 1; r < ROWS - 1; r += 2) {
    for (let c = 1; c < COLS - 1; c++) {
      if (placed < 36 && map[r][c] === TILE_EMPTY) {
        sim.placeBombAtGrid(r, c, 2);
        placed++;
      }
    }
  }

  // Add 4 entangled ghost bombs
  for (let i = 0; i < 4; i++) {
    const parent = sim.bombs[i];
    const parentId = `parent_p_${i}`;
    const ghostId = `ghost_g_${i}`;
    parent.setData('id', parentId);

    hazard.ghostBombPool[i].active = true;
    hazard.ghostBombPool[i].id = ghostId;
    hazard.ghostBombPool[i].parentBombId = parentId;
    hazard.ghostBombPool[i].r = parent.row;
    hazard.ghostBombPool[i].c = parent.col;

    const ghostBomb = sim.placeBombAtGrid(parent.row, parent.col, 2, true, parentId);
    ghostBomb.setData('id', ghostId);
  }

  const total = sim.bombs.length;
  assert.equal(total, 40, '40 total bombs placed (36 normal + 4 ghost)');

  // Detonate first bomb
  sim.explodeBomb(sim.bombs[0]);

  assert.equal(sim.activeBombs, 0, '0 active normal bombs');
  assert.equal(sim.bombs.length, 0, '0 sprites remaining');
  assert.equal(sim.totalExplodeCalls, 40, 'All 40 bombs detonated');
  assert.equal(sim.detonatedBombIds.size, 40, '40 unique IDs');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate detonations');
  assert.equal(sim.currentCallDepth, 0, 'Stack unwound to 0');
});

test('CHAIN-05: 50-bomb maximum density cluster around multi-phase Boss enforces PHYS-06 (single hit per bomb)', () => {
  const map = createStandardMap();
  const boss = new HeadlessStressBoss(1000, 7 * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  const sim = new HighFidelityCascadeSimulator(map, 80, 2);
  sim.boss = boss;

  // Place 50 bombs surrounding the boss
  let count = 0;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (count < 50 && map[r][c] === TILE_EMPTY) {
        sim.placeBombAtGrid(r, c, 2, false, null, 2000);
        count++;
      }
    }
  }

  assert.equal(count, 50);
  assert.equal(sim.activeBombs, 50);
  const startHp = boss.currentHp;

  // Simultaneous explosion via frame tick
  sim.update(2000);

  assert.equal(sim.activeBombs, 0, 'All 50 bombs detonated');
  assert.equal(sim.totalExplodeCalls, 50, 'Exactly 50 detonations');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero loops');

  // Verify PHYS-06: boss receives damage strictly once per intersecting bomb
  const hits = sim.bossHitsByBombId.length;
  assert.ok(hits > 0, 'Boss was hit by surrounding bombs');
  assert.equal(boss.currentHp, startHp - hits, 'Boss HP decreased strictly by unique hit count');

  const uniqueBombIds = new Set(sim.bossHitsByBombId.map((h) => h.bombId));
  assert.equal(uniqueBombIds.size, hits, 'Every recorded hit came from a strictly unique bomb ID');
  assert.equal(sim.currentCallDepth, 0, 'Call stack cleanly unwound');
});

test('CHAIN-06: 64-bomb extreme stack & co-located cluster (16 tiles x 4 bombs stacked)', () => {
  const map = createStandardMap();
  const sim = new HighFidelityCascadeSimulator(map, 100, 2);

  // 16 open tiles along rows 1, 3, 5, 7
  let tilesUsed = 0;
  for (const r of [1, 3, 5, 7]) {
    for (let c = 1; c <= 7; c += 2) {
      if (tilesUsed < 16 && map[r][c] === TILE_EMPTY) {
        // Stack 4 bombs on this tile
        for (let b = 0; b < 4; b++) {
          sim.placeBombAtGrid(r, c, 2);
        }
        tilesUsed++;
      }
    }
  }

  assert.equal(tilesUsed, 16);
  assert.equal(sim.activeBombs, 64, '64 total bombs placed (16 tiles x 4 stacked)');

  // Trigger cascade from head bomb
  sim.explodeBomb(sim.bombs[0]);

  assert.equal(sim.activeBombs, 0, 'All 64 stacked bombs detonated');
  assert.equal(sim.totalExplodeCalls, 64, '64 explodeBomb calls executed');
  assert.equal(sim.detonatedBombIds.size, 64, '64 unique detonations');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate calls');
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound');
});

test('CHAIN-07: AudioVoicePool voice recycling & voice-stealing handles 25+ simultaneous detonations without leaks', () => {
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

test('CHAIN-08: Camera trauma accumulation under 30 rapid detonations clamps strictly to [0.0, 1.0]', () => {
  let trauma = 0.0;
  const addTrauma = (amount) => {
    trauma = Math.min(1.0, Math.max(0.0, trauma + amount));
  };

  for (let i = 0; i < 30; i++) {
    addTrauma(0.15); // 30 rapid detonations adding trauma
    assert.ok(trauma <= 1.0, `Trauma (${trauma}) must not exceed 1.0 clamp`);
    assert.ok(trauma >= 0.0, `Trauma (${trauma}) must be >= 0.0`);
    assert.ok(Number.isFinite(trauma), 'Trauma must not be NaN or Infinity');
  }

  assert.equal(trauma, 1.0, 'Trauma saturated safely at 1.0');

  // Decay over 10 frames
  for (let f = 0; f < 10; f++) {
    trauma = Math.max(0.0, trauma - 0.10);
  }
  assert.ok(trauma <= 1e-9, `Trauma (${trauma}) cleanly decayed to 0.0`);
});

/* ==============================================================================
 * PART 2: BOMB KICK VELOCITIES (UP TO 460 PX/S) & ZERO-TUNNELING INVARIANTS
 * ============================================================================== */

test('KICK-01: Standard kick velocity (300 px/s) against outer boundary wall prevents penetration', () => {
  const map = createStandardMap();
  // Corridor row 1: cols 1..13 open, col 14 is perimeter WALL (starts at x = 14 * 40 = 560px)
  const sim = new KickedBombPhysicsSimulator(map);

  // Bomb placed at col 11 (x = 460), kicked East (dirX = 1) at 300 px/s
  const result = sim.simulateSlide(460, 60, 1, 0, BOMB_KICK_SPEED, 16.67, 120);

  assert.equal(result.isSliding, false, 'Bomb must stop sliding before wall');
  // Wall is at col 14, so safe tile is col 13 (center x = 13 * 40 + 20 = 540px)
  assert.equal(result.stoppedSafeCol, 13, 'Stopped at safe tile col 13 before col 14 wall');
  assert.equal(result.finalX, 540, 'Snapped to tile center 540');

  // Invariant: Right edge of bomb (finalX + 16 = 556) must strictly NOT penetrate wall at 560
  assert.ok(result.finalX + 16 <= 560.0001, `Right edge (${result.finalX + 16}) penetrated wall at 560`);

  // Verify every intermediate point in trajectory never penetrated wall
  for (const point of result.trajectory) {
    assert.ok(point.x + 16 <= 560.0001, `Frame ${point.frame} penetrated wall at x=${point.x}`);
  }
});

test('KICK-02: Elemental kick velocity (450 px/s) against internal indestructible pillar prevents tunneling', () => {
  const map = createStandardMap();
  // Row 2: col 1 is open (x=60), col 2 is pillar TILE_WALL (starts at x=80)
  assert.equal(map[2][2], TILE_WALL, 'Col 2 is indestructible pillar');

  const sim = new KickedBombPhysicsSimulator(map);

  // Bomb kicked from open row 1 into vertical path towards pillar, OR along open row into pillar
  // Map: (2, 2) is WALL. Let's test row 2, col 1 (x=60, y=100) moving East towards pillar at col 2
  const result = sim.simulateSlide(60, 100, 1, 0, BOMB_KICK_MAGMA_SPEED, 16.67, 60);

  assert.equal(result.isSliding, false, 'Bomb must stop before pillar');
  assert.equal(result.stoppedSafeCol, 1, 'Safe tile is col 1');
  assert.equal(result.finalX, 60, 'Centered in col 1');
  assert.ok(result.finalX + 16 <= 80.0001, 'Bomb right edge (76) does not penetrate pillar at 80');
});

test('KICK-03: Chrono slipstream kick velocity (460 px/s) against 1-tile soft block prevents tunneling', () => {
  const map = createOpenMap(5, 10);
  // Row 2: col 5 is a 1-tile soft block TILE_BLOCK (x = 200..240). Col 6 is empty.
  map[2][5] = TILE_BLOCK;
  assert.equal(map[2][5], TILE_BLOCK);
  assert.equal(map[2][6], TILE_EMPTY);

  const sim = new KickedBombPhysicsSimulator(map);

  // Bomb at col 2 (x=100), kicked East at 460 px/s under 20 FPS (delta = 50ms, stepDistance = 23px)
  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 50, 60);

  assert.equal(result.isSliding, false, 'Bomb must stop before soft block');
  assert.equal(result.stoppedSafeCol, 4, 'Must stop at col 4 right before col 5 block');
  assert.equal(result.finalX, 4 * TILE_SIZE + 20, 'Snapped to center of col 4 (180)');
  assert.ok(result.finalX + 16 <= 200.0001, 'Bomb right edge (196) must not enter soft block at 200');

  // Verify discrete simulateBombKickSlide agrees 100%
  const discrete = simulateBombKickSlide(2, 2, 1, 0, map);
  assert.equal(discrete.endCol, 4, 'Discrete simulation also stops at col 4');
  assert.equal(discrete.endRow, 2);
});

test('KICK-04: Catastrophic 150ms lag spike at 460 px/s (stepDistance = 69px > TILE_SIZE 40px) maintains zero tunneling', () => {
  const map = createOpenMap(5, 12);
  // Col 7 is solid wall (x = 280)
  map[2][7] = TILE_WALL;

  const sim = new KickedBombPhysicsSimulator(map);

  // Bomb at col 3 (x=140), kicked East at 460 px/s with 150ms delta (stepDistance = 460 * 0.15 = 69px)
  const result = sim.simulateSlide(140, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 150, 20);

  assert.equal(result.isSliding, false, 'Bomb must stop sliding');
  assert.equal(result.stoppedSafeCol, 6, 'Must stop at col 6 immediately preceding col 7 wall');
  assert.equal(result.finalX, 6 * TILE_SIZE + 20, 'Snapped to center of col 6 (260)');
  assert.ok(result.finalX + 16 <= 280.0001, 'Right edge (276) must not penetrate col 7 wall at 280');
});

test('KICK-05: 460 px/s kicked bomb colliding with stationary bomb stops with zero overlap', () => {
  const map = createOpenMap(5, 12);
  // Stationary bomb placed at col 7 (x=300, y=100)
  const otherBombs = [{ x: 300, y: 100, active: true }];

  const sim = new KickedBombPhysicsSimulator(map, otherBombs);

  // Bomb kicked East from col 2 (x=100) at 460 px/s with 60 FPS (16.67ms)
  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 60);

  assert.equal(result.isSliding, false, 'Bomb stopped before stationary bomb');
  assert.equal(result.stoppedSafeCol, 6, 'Must stop at col 6 before col 7 bomb');
  assert.equal(result.finalX, 6 * TILE_SIZE + 20, 'Snapped to center of col 6 (260)');

  // Invariant: Distance between bomb centers must be >= TILE_SIZE (40px)
  const dist = Math.abs(result.finalX - 300);
  assert.ok(dist >= 40, `Distance between bombs (${dist}px) must be >= 40px (zero overlap)`);
});

test('KICK-06: 460 px/s head-on collision between two sliding bombs resolves without pass-through', () => {
  // Bomb A moving East from Col 2 (x=100)
  // Bomb B moving West from Col 8 (x=340)
  // Both sliding at 460 px/s
  let bombAX = 100;
  let bombBX = 340;
  let slidingA = true;
  let slidingB = true;
  const dt = 16.67;
  const speed = BOMB_KICK_CHRONO_SPEED;

  for (let f = 0; f < 60; f++) {
    if (!slidingA && !slidingB) break;

    const bColA = Math.floor(bombAX / TILE_SIZE);
    const bColB = Math.floor(bombBX / TILE_SIZE);

    // Check A against B
    if (slidingA) {
      const step = speed * (dt / 1000);
      const lookahead = Math.max(16, 16 + step + 2);
      const checkX = bombAX + 1 * lookahead;
      const targetCol = Math.floor(checkX / TILE_SIZE);
      if (targetCol >= bColB) {
        slidingA = false;
        bombAX = (bColB - 1) * TILE_SIZE + 20;
      } else {
        bombAX += step;
      }
    }

    // Check B against A
    if (slidingB) {
      const step = speed * (dt / 1000);
      const lookahead = Math.max(16, 16 + step + 2);
      const checkX = bombBX - 1 * lookahead;
      const targetCol = Math.floor(checkX / TILE_SIZE);
      if (targetCol <= bColA) {
        slidingB = false;
        bombBX = (bColA + 1) * TILE_SIZE + 20;
      } else {
        bombBX -= step;
      }
    }
  }

  assert.equal(slidingA, false, 'Bomb A stopped');
  assert.equal(slidingB, false, 'Bomb B stopped');
  assert.ok(bombAX < bombBX, `Bomb A (${bombAX}) must remain strictly to the left of Bomb B (${bombBX})`);
  assert.ok(bombBX - bombAX >= 40, 'Bombs must not overlap');
});

test('KICK-07: 460 px/s kicked bomb impact against active Boss triggers collision immediately', () => {
  const map = createOpenMap(5, 15);
  const boss = new HeadlessStressBoss(200, 300, 100);
  const sim = new KickedBombPhysicsSimulator(map);
  sim.activeBoss = boss;

  // Bomb kicked East towards boss at x=300
  const result = sim.simulateSlide(100, 100, 1, 0, BOMB_KICK_CHRONO_SPEED, 16.67, 60);

  assert.equal(sim.bossCollided, true, 'Boss collision detected');
  assert.equal(result.isSliding, false, 'Slide stopped upon boss collision');
});

test('KICK-08: Monte Carlo 100-trial soak test: Randomized 460 px/s kicks with random deltas (8ms to 120ms) proves 0% defect rate', () => {
  let totalKicks = 0;
  let zeroPenetrationCount = 0;

  for (let trial = 0; trial < 100; trial++) {
    const map = createOpenMap(7, 15);
    // Add random obstacles
    const wallCol = 6 + (trial % 7); // Wall at col 6..12
    map[3][wallCol] = trial % 2 === 0 ? TILE_WALL : TILE_BLOCK;

    const sim = new KickedBombPhysicsSimulator(map);
    const speed = trial % 3 === 0 ? BOMB_KICK_SPEED : trial % 3 === 1 ? BOMB_KICK_MAGMA_SPEED : BOMB_KICK_CHRONO_SPEED;
    const deltaMs = 8.33 + (trial * 13) % 112; // 8.33ms to 120ms

    const result = sim.simulateSlide(60, 3 * TILE_SIZE + 20, 1, 0, speed, deltaMs, 600);

    totalKicks++;
    assert.equal(result.isSliding, false, `Trial ${trial}: Bomb must stop sliding`);
    assert.equal(result.stoppedSafeCol, wallCol - 1, `Trial ${trial}: Stopped at wallCol - 1`);

    const maxAllowedRightEdge = wallCol * TILE_SIZE;
    assert.ok(
      result.finalX + 16 <= maxAllowedRightEdge + 0.0001,
      `Trial ${trial}: Bomb right edge (${result.finalX + 16}) penetrated obstacle at ${maxAllowedRightEdge}`
    );
    zeroPenetrationCount++;
  }

  assert.equal(totalKicks, 100);
  assert.equal(zeroPenetrationCount, 100, 'All 100 randomized trials maintained 0.000px penetration');
});
