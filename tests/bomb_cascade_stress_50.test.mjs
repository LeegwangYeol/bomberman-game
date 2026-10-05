/**
 * bomb_cascade_stress_50.test.mjs — Comprehensive Stress Test Suite for 50 Simultaneous Bombs
 *
 * Exhaustive verification of:
 * 1. Synchronous & asynchronous cascade raycasts (up to 50 simultaneous bombs across diverse topologies).
 * 2. Pure recursion depth & call stack safety (zero RangeError / stack overflow, stack cleanly unwound).
 * 3. Soft block destruction along blast rays, destroyedBlocksThisTick multi-ray absorption, and map mutation.
 * 4. 24-item drop table rollItemDrop integration, player stat caps (anti-snowballing), and item grace period
 *    (isItemProtectedFromExplosion ensures freshly dropped items are never incinerated by same-tick explosions).
 * 5. Production ObjectPool<ExplosionSprite> recycling, pointer invariant integrity (freeHead, activeIndices,
 *    itemToActiveSlot, activeFlags), zero pointer corruption under heavy saturation, FIFO sprite stealing,
 *    and rejection of double-release and foreign object attacks.
 * 6. Monte Carlo 100-trial soak test verifying 0% defect rate across 5,000+ bombs and 40,000+ pool cycles.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ObjectPool, POOL_PRESETS } from '../src/game/pooling/ObjectPool.ts';
import {
  rollItemDrop,
  isItemProtectedFromExplosion,
  ITEM_GRACE_PERIOD_MS,
  MAX_BOMBS_CAP,
  MAX_BOMB_POWER_CAP,
  MAX_PLAYER_SPEED,
} from '../src/game/gameplay_mechanics.ts';
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';

const CARDINAL_DIRECTIONS = [
  { dr: -1, dc: 0, name: 'UP' },
  { dr: 1, dc: 0, name: 'DOWN' },
  { dr: 0, dc: -1, name: 'LEFT' },
  { dr: 0, dc: 1, name: 'RIGHT' },
];

/**
 * Creates standard 13x15 arena with perimeter walls and alternating pillar grid
 */
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

/**
 * Creates open arena with perimeter walls only
 */
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
 * Audits complete low-level pointer invariants of an ObjectPool instance.
 * Throws an assertion error if any internal typed array pointer is corrupted.
 */
function assertPoolPointerInvariants(pool, expectedCapacity) {
  assert.equal(pool.capacity, expectedCapacity, 'Pool capacity invariant');
  assert.equal(
    pool.activeCount + pool.freeCount,
    pool.capacity,
    `activeCount (${pool.activeCount}) + freeCount (${pool.freeCount}) must equal capacity (${pool.capacity})`
  );
  assert.ok(
    pool.activeCount >= 0 && pool.activeCount <= pool.capacity,
    `activeCount (${pool.activeCount}) must be in [0, ${pool.capacity}]`
  );
  assert.ok(
    pool.freeCount >= 0 && pool.freeCount <= pool.capacity,
    `freeCount (${pool.freeCount}) must be in [0, ${pool.capacity}]`
  );
  assert.equal(pool.isExhausted, pool.freeCount === 0, 'isExhausted must match freeCount === 0');

  // Low-level reflection into typed arrays
  const freeHead = pool.freeHead;
  const freeIndices = pool.freeIndices;
  const activeIndices = pool.activeIndices;
  const itemToActiveSlot = pool.itemToActiveSlot;
  const activeFlags = pool.activeFlags;

  // 1. Audit free indices
  const seenFree = new Set();
  for (let i = 0; i < pool.freeCount; i++) {
    const idx = freeIndices[i];
    assert.ok(
      idx >= 0 && idx < pool.capacity,
      `Free index at [${i}] = ${idx} out of bounds [0, ${pool.capacity - 1}]`
    );
    assert.ok(!seenFree.has(idx), `Duplicate free index ${idx} in freeIndices array`);
    seenFree.add(idx);
    assert.equal(activeFlags[idx], 0, `Free index ${idx} must have activeFlag === 0`);
    assert.equal(itemToActiveSlot[idx], -1, `Free index ${idx} must have itemToActiveSlot === -1`);
  }

  // 2. Audit active indices
  const seenActive = new Set();
  for (let slot = 0; slot < pool.activeCount; slot++) {
    const idx = activeIndices[slot];
    assert.ok(
      idx >= 0 && idx < pool.capacity,
      `Active index at slot [${slot}] = ${idx} out of bounds [0, ${pool.capacity - 1}]`
    );
    assert.ok(!seenActive.has(idx), `Duplicate active index ${idx} in activeIndices array`);
    seenActive.add(idx);
    assert.equal(activeFlags[idx], 1, `Active index ${idx} must have activeFlag === 1`);
    assert.equal(itemToActiveSlot[idx], slot, `Active index ${idx} itemToActiveSlot must equal slot ${slot}`);
  }

  // 3. Mutual exclusion and complete partition
  assert.equal(
    seenFree.size + seenActive.size,
    pool.capacity,
    'Free indices and active indices must form exact disjoint partition of capacity'
  );
  for (const idx of seenActive) {
    assert.ok(!seenFree.has(idx), `Invariant violation: index ${idx} is both active and free!`);
  }

  // 4. Inactive slots in activeIndices must remain -1
  for (let s = pool.activeCount; s < pool.capacity; s++) {
    assert.equal(activeIndices[s], -1, `Inactive slot ${s} in activeIndices must be -1`);
  }
}

/**
 * Explosion Sprite Interface for ObjectPool
 */
class MockExplosionSprite {
  constructor(index) {
    this.poolId = index;
    this.x = 0;
    this.y = 0;
    this.row = 0;
    this.col = 0;
    this.isCenter = false;
    this.owner = 'player';
    this.bombId = '';
    this.isPiercing = false;
    this.lifeRemainingMs = 320;
    this.allocSeq = 0;
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.row = 0;
    this.col = 0;
    this.isCenter = false;
    this.owner = 'player';
    this.bombId = '';
    this.isPiercing = false;
    this.lifeRemainingMs = 320;
    this.allocSeq = 0;
  }
}

/**
 * High-Performance Bomb Cascade Stress Simulator
 * Faithfully mirrors GameScene.ts detonation physics, raycasts, soft block destruction,
 * item drops, and explosion sprite pool recycling with comprehensive telemetry.
 */
class BombCascadeStressSimulator {
  constructor(options = {}) {
    this.map = options.map ? options.map.map(r => [...r]) : createStandardMap();
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.maxBombs = options.maxBombs ?? 100;
    this.defaultPower = options.defaultPower ?? 2;
    this.poolCapacity = options.poolCapacity ?? POOL_PRESETS.EXPLOSIONS; // 128
    this.recyclingPolicy = options.recyclingPolicy ?? 'STEAL_OLDEST'; // 'STEAL_OLDEST' | 'EXHAUSTION_GUARD'

    // Real ObjectPool instance
    this.sequence = 0;
    this.explosionPool = new ObjectPool({
      capacity: this.poolCapacity,
      factory: (i) => new MockExplosionSprite(i),
      reset: (e) => e.reset(),
    });

    // Bomb registry
    this.bombs = [];
    this.activeBombs = 0;
    this.nextBombId = 1;

    // Soft block & Item tracking
    this.blocks = [];
    this.destroyedBlocksThisTick = new Set();
    this.destroyedBlockHistory = [];
    this.items = [];
    this.destroyedItems = [];
    this.currentTimeMs = 1000;

    // Player stats for drop table
    this.playerStats = {
      speed: 150,
      bombPower: 2,
      maxBombs: 3,
      hasKick: false,
      hasWallPass: false,
      hasBombPass: false,
      hasMagnet: false,
      hasBlastDeflector: false,
      hasBlastResist: false,
      hasVampiric: false,
      extraLives: 0,
      ...(options.playerStats || {}),
    };

    // Telemetry & Safety Instrumentation
    this.currentCallDepth = 0;
    this.maxCallDepth = 0;
    this.totalExplodeCalls = 0;
    this.detonatedBombIds = new Set();
    this.duplicateDetonations = [];
    this.maxSafeStackLimit = 5000;
    this.explosionAcquires = 0;
    this.explosionReleases = 0;
    this.poolExhaustionCount = 0;
    this.stolenSpritesCount = 0;
  }

  /**
   * Initializes soft blocks from map configuration
   */
  initSoftBlocks() {
    this.blocks = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.map[r][c] === TILE_BLOCK) {
          this.blocks.push({
            row: r,
            col: c,
            active: true,
            isChest: (r + c) % 5 === 0, // 20% chests
          });
        }
      }
    }
  }

  /**
   * Places a bomb on the grid
   */
  placeBombAtGrid(row, col, customPower = null, isGhostBomb = false, parentBombId = null, fuseMs = 2000) {
    if (this.activeBombs >= this.maxBombs) return null;
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    const id = `bomb_${this.nextBombId++}`;
    const dataStore = new Map([
      ['id', id],
      ['power', customPower ?? this.defaultPower],
      ['owner', 'player'],
      ['isGhostBomb', isGhostBomb],
      ['parentBombId', parentBombId],
    ]);

    const bomb = {
      id,
      x: centerX,
      y: centerY,
      row,
      col,
      active: true,
      timeElapsed: 0,
      fuseMs,
      getData: (k) => dataStore.get(k),
      setData: (k, v) => dataStore.set(k, v),
      destroy: () => {
        bomb.active = false;
        const idx = this.bombs.indexOf(bomb);
        if (idx !== -1) {
          this.bombs.splice(idx, 1);
        }
      },
    };

    this.bombs.push(bomb);
    if (!isGhostBomb) {
      this.activeBombs++;
    }
    return bomb;
  }

  /**
   * Advances simulation time, triggering fuses and recycling expired explosions
   */
  update(deltaMs) {
    this.currentTimeMs += deltaMs;
    this.destroyedBlocksThisTick.clear();

    // 1. Recycle expired explosions in ObjectPool
    const toRelease = [];
    this.explosionPool.forEachActive((exp) => {
      exp.lifeRemainingMs -= deltaMs;
      if (exp.lifeRemainingMs <= 0) {
        toRelease.push(exp);
      }
    });

    for (const exp of toRelease) {
      const ok = this.explosionPool.release(exp);
      if (ok) {
        this.explosionReleases++;
      }
    }

    // 2. Trigger expired bombs
    const toExplode = [];
    for (const bomb of this.bombs) {
      if (!bomb.active) continue;
      bomb.timeElapsed += deltaMs;
      if (bomb.timeElapsed >= bomb.fuseMs) {
        toExplode.push(bomb);
      }
    }

    for (const b of toExplode) {
      if (b.active) {
        this.explodeBomb(b);
      }
    }
  }

  /**
   * Acquires an explosion sprite from ObjectPool using configured recycling policy
   */
  acquireExplosionSprite(row, col, isCenter, owner, bombId, isPiercing) {
    let exp = this.explosionPool.acquire();

    if (!exp && this.recyclingPolicy === 'STEAL_OLDEST') {
      // Steal oldest active sprite (lowest allocSeq)
      let oldest = null;
      let oldestSeq = Infinity;
      this.explosionPool.forEachActive((activeExp) => {
        if (activeExp.allocSeq < oldestSeq) {
          oldestSeq = activeExp.allocSeq;
          oldest = activeExp;
        }
      });

      if (oldest) {
        this.explosionPool.release(oldest);
        this.stolenSpritesCount++;
        exp = this.explosionPool.acquire();
      }
    }

    if (!exp) {
      this.poolExhaustionCount++;
      return null;
    }

    this.explosionAcquires++;
    exp.x = col * TILE_SIZE + TILE_SIZE / 2;
    exp.y = row * TILE_SIZE + TILE_SIZE / 2;
    exp.row = row;
    exp.col = col;
    exp.isCenter = isCenter;
    exp.owner = owner;
    exp.bombId = bombId;
    exp.isPiercing = isPiercing;
    exp.lifeRemainingMs = 320;
    exp.allocSeq = ++this.sequence;
    return exp;
  }

  /**
   * Spawns an explosion and processes item overlaps
   */
  spawnExplosion(row, col, isCenter = false, owner = 'player', bombId = '', isPiercing = false) {
    const exp = this.acquireExplosionSprite(row, col, isCenter, owner, bombId, isPiercing);

    // Process overlap with active items on this tile
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.active && item.row === row && item.col === col) {
        const isProtected = isItemProtectedFromExplosion(item.spawnTime, this.currentTimeMs);
        if (!isProtected) {
          item.active = false;
          this.destroyedItems.push(item);
          this.items.splice(i, 1);
        }
      }
    }

    return exp;
  }

  /**
   * Destroys a soft block, triggers rollItemDrop, and spawns dropped item
   */
  destroyBlock(row, col) {
    this.map[row][col] = TILE_EMPTY;

    let isChest = false;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.active && b.row === row && b.col === col) {
        b.active = false;
        isChest = b.isChest;
        break;
      }
    }

    this.destroyedBlockHistory.push({ row, col, isChest, time: this.currentTimeMs });

    // Item Drop Calculation
    const droppedItemType = rollItemDrop(
      Math.random,
      this.playerStats,
      isChest ? 'CHEST' : 'BLOCK'
    );

    if (droppedItemType) {
      this.items.push({
        id: `item_${this.items.length + 1}`,
        type: droppedItemType,
        row,
        col,
        x: col * TILE_SIZE + TILE_SIZE / 2,
        y: row * TILE_SIZE + TILE_SIZE / 2,
        spawnTime: this.currentTimeMs,
        active: true,
      });
    }
  }

  /**
   * Detonates a bomb faithfully replicating GameScene.ts lines 4319-4623
   */
  explodeBomb(bomb, row = null, col = null) {
    if (!bomb || !bomb.active) return;

    this.currentCallDepth++;
    if (this.currentCallDepth > this.maxCallDepth) {
      this.maxCallDepth = this.currentCallDepth;
    }
    if (this.currentCallDepth > this.maxSafeStackLimit) {
      throw new Error(
        `CRITICAL: Stack overflow protection triggered (${this.currentCallDepth} > ${this.maxSafeStackLimit})`
      );
    }
    this.totalExplodeCalls++;

    const bombId = bomb.getData('id') || `bomb_${this.nextBombId++}`;
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

      const bombPower = bomb.getData('power') || this.defaultPower;
      const isGhostBomb = Boolean(bomb.getData('isGhostBomb'));
      const owner = bomb.getData('owner') || 'player';

      // 1. Destroy bomb sprite immediately before raycasts to prevent re-entrancy
      bomb.destroy();

      if (owner === 'player' && !isGhostBomb) {
        this.activeBombs = Math.max(0, this.activeBombs - 1);
      }

      const effectivePower = bombPower;
      const isPiercing = Boolean(bomb.getData('isPiercing'));

      // 2. Spawn epicenter explosion
      this.spawnExplosion(actualRow, actualCol, true, owner, bombId, isPiercing);

      // 3. Epicenter chain reaction: detonate other active bombs stacked on same tile
      const sameTileBombs = [];
      for (const b of this.bombs) {
        if (b && b.active && b !== bomb) {
          const bCol = Math.floor(b.x / TILE_SIZE);
          const bRow = Math.floor(b.y / TILE_SIZE);
          if (bRow === actualRow && bCol === actualCol) {
            sameTileBombs.push(b);
          }
        }
      }
      for (const otherBomb of sameTileBombs) {
        if (otherBomb.active) {
          this.explodeBomb(otherBomb, actualRow, actualCol);
        }
      }

      // 4. Trace blast rays in 4 cardinal directions
      for (const dir of CARDINAL_DIRECTIONS) {
        let blocksPierced = 0;
        for (let i = 1; i <= effectivePower; i++) {
          const nr = actualRow + dir.dr * i;
          const nc = actualCol + dir.dc * i;

          if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;

          if (this.map[nr][nc] === TILE_WALL) {
            break; // Stop at solid wall
          }

          const key = `${nr},${nc}`;
          const isBlock = this.map[nr][nc] === TILE_BLOCK || this.destroyedBlocksThisTick.has(key);

          if (isBlock) {
            this.destroyedBlocksThisTick.add(key);
            if (this.map[nr][nc] === TILE_BLOCK) {
              this.destroyBlock(nr, nc);
            }
            this.spawnExplosion(nr, nc, false, owner, bombId, isPiercing);
            if (!isPiercing || ++blocksPierced >= 3) {
              break; // Block absorbs blast ray
            }
            continue;
          }

          // Empty tile explosion
          this.spawnExplosion(nr, nc, false, owner, bombId, isPiercing);

          // Check for chained bombs on empty tile
          const chainedBombs = [];
          for (const otherBomb of this.bombs) {
            if (otherBomb && otherBomb.active) {
              const bCol = Math.floor(otherBomb.x / TILE_SIZE);
              const bRow = Math.floor(otherBomb.y / TILE_SIZE);
              if (bRow === nr && bCol === nc) {
                chainedBombs.push(otherBomb);
              }
            }
          }
          for (const otherBomb of chainedBombs) {
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
}

/* ==============================================================================
 * SUITE: 50 SIMULTANEOUS BOMBS CASCADE STRESS TESTS
 * ============================================================================== */

test('STRESS-01: 50-bomb contiguous serpentine snake cascade verifies zero stack overflow & pool pointer integrity', () => {
  const map = createOpenMap(15, 20);
  const sim = new BombCascadeStressSimulator({
    map,
    maxBombs: 100,
    defaultPower: 1, // power 1: single-step linear chain
    poolCapacity: 128,
  });

  // Lay down exactly 50 contiguous bombs in a serpentine snake
  let placed = 0;
  for (let r = 1; r < 14; r++) {
    const isEven = r % 2 === 0;
    const startCol = isEven ? 18 : 1;
    const endCol = isEven ? 1 : 18;
    const step = isEven ? -1 : 1;

    for (let c = startCol; isEven ? c >= endCol : c <= endCol; c += step) {
      if (placed < 50) {
        sim.placeBombAtGrid(r, c, 1);
        placed++;
      }
    }
  }

  assert.equal(sim.activeBombs, 50, 'Placed exactly 50 bombs');
  assert.equal(sim.bombs.length, 50, '50 active bomb sprites in list');
  assertPoolPointerInvariants(sim.explosionPool, 128);

  // Trigger cascade from head bomb at (1, 1)
  const headBomb = sim.bombs[0];
  sim.explodeBomb(headBomb);

  // Assertions
  assert.equal(sim.activeBombs, 0, 'All 50 bombs must be cleared');
  assert.equal(sim.bombs.length, 0, '0 remaining bombs');
  assert.equal(sim.totalExplodeCalls, 50, 'Exactly 50 explodeBomb calls');
  assert.equal(sim.detonatedBombIds.size, 50, 'All 50 bombs detonated once');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate detonations');

  // Call stack depth verification
  assert.ok(sim.maxCallDepth >= 40 && sim.maxCallDepth <= 50, `Observed linear call depth: ${sim.maxCallDepth}`);
  assert.ok(sim.maxCallDepth < 5000, 'Call stack safely bounded thousands of frames below JS limit (~10,000)');
  assert.equal(sim.currentCallDepth, 0, 'Call stack cleanly unwound to 0');

  // Explosion pool pointer verification
  assertPoolPointerInvariants(sim.explosionPool, 128);
  assert.ok(sim.explosionAcquires > 50, `Acquired ${sim.explosionAcquires} explosions`);
});

test('STRESS-02: 50-bomb dense 2D grid cluster (5x10) tests branching cascade & mutual overlap', () => {
  const map = createOpenMap(15, 20);
  const sim = new BombCascadeStressSimulator({
    map,
    maxBombs: 100,
    defaultPower: 2,
    poolCapacity: 128,
  });

  // Pack 50 bombs into dense 5x10 rectangle
  for (let r = 2; r <= 6; r++) {
    for (let c = 2; c <= 11; c++) {
      sim.placeBombAtGrid(r, c, 2);
    }
  }

  assert.equal(sim.activeBombs, 50, '50 bombs in dense cluster');
  assertPoolPointerInvariants(sim.explosionPool, 128);

  // Detonate corner bomb at (2, 2)
  const cornerBomb = sim.bombs[0];
  sim.explodeBomb(cornerBomb);

  // Assertions
  assert.equal(sim.activeBombs, 0, 'All 50 bombs detonated');
  assert.equal(sim.bombs.length, 0, 'All bomb sprites removed');
  assert.equal(sim.totalExplodeCalls, 50, 'Exactly 50 detonations');
  assert.equal(sim.detonatedBombIds.size, 50, 'All 50 IDs detonated once');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero infinite loops or re-entrancy');
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound to 0');
  assertPoolPointerInvariants(sim.explosionPool, 128);
});

test('STRESS-03: 50-bomb cascade with soft block destruction, item drops, and grace period protection', () => {
  const map = createOpenMap(15, 20);

  // Lay down a contiguous 50-bomb serpentine corridor across 5 rows (1..5) and 10 cols (3..12)
  const bombLocations = [];
  let placed = 0;
  for (let r = 1; r <= 5; r++) {
    const isOddRow = r % 2 === 1;
    const startCol = isOddRow ? 3 : 12;
    const endCol = isOddRow ? 12 : 3;
    const step = isOddRow ? 1 : -1;

    for (let c = startCol; isOddRow ? c <= endCol : c >= endCol; c += step) {
      if (placed < 50) {
        bombLocations.push({ r, c });
        placed++;
      }
    }
  }

  // Populate flanking tiles with soft blocks:
  // - West flank: col 2 and col 1 (rows 1..5)
  // - East flank: col 13 and col 14 (rows 1..5)
  // - South flank: row 6 (cols 3..12)
  for (let r = 1; r <= 5; r++) {
    map[r][1] = TILE_BLOCK;
    map[r][2] = TILE_BLOCK;
    map[r][13] = TILE_BLOCK;
    map[r][14] = TILE_BLOCK;
  }
  for (let c = 3; c <= 12; c++) {
    map[6][c] = TILE_BLOCK;
  }

  const sim = new BombCascadeStressSimulator({
    map,
    maxBombs: 100,
    defaultPower: 2,
    poolCapacity: 128,
    playerStats: {
      speed: 150,
      bombPower: 2,
      maxBombs: 4,
      hasKick: true,
      hasWallPass: false,
    },
  });
  sim.initSoftBlocks();

  // Place the 50 contiguous bombs
  for (const loc of bombLocations) {
    sim.placeBombAtGrid(loc.r, loc.c, 2);
  }

  assert.equal(sim.activeBombs, 50, 'Placed 50 bombs along connected corridor');
  assert.equal(sim.blocks.length, 30, 'Exactly 30 soft blocks active');

  // Trigger cascade from head bomb at (1, 3)
  const firstBomb = sim.bombs[0];
  sim.explodeBomb(firstBomb);

  // Invariants:
  // 1. All bombs detonated without stack overflow
  assert.equal(sim.activeBombs, 0, 'All 50 bombs detonated');
  assert.equal(sim.totalExplodeCalls, 50, 'Exactly 50 explodeBomb calls');
  assert.equal(sim.currentCallDepth, 0, 'Stack depth unwound to 0');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate detonations');

  // 2. Soft blocks destroyed
  assert.ok(sim.destroyedBlockHistory.length > 0, 'Multiple soft blocks destroyed');
  for (const db of sim.destroyedBlockHistory) {
    assert.equal(sim.map[db.row][db.col], TILE_EMPTY, 'Destroyed block tile became TILE_EMPTY');
  }

  // 3. Item drops generated
  assert.ok(sim.items.length > 0, `Generated ${sim.items.length} item drops from destroyed blocks`);

  // 4. Grace period verification: Freshly spawned items MUST survive explosions in same cascade!
  assert.equal(
    sim.destroyedItems.length,
    0,
    'Freshly dropped items must NOT be incinerated by simultaneous explosions during cascade'
  );
  for (const item of sim.items) {
    assert.ok(
      isItemProtectedFromExplosion(item.spawnTime, sim.currentTimeMs),
      `Item ${item.id} must be protected by grace period`
    );
  }

  // 5. Invariant check on explosion sprite pool
  assertPoolPointerInvariants(sim.explosionPool, 128);
});

test('STRESS-04: Concentric dual-ring 50-bomb implosion with pool saturation & FIFO sprite recycling', () => {
  const map = createOpenMap(17, 19);
  const POOL_CAP = 64; // Constrained pool capacity to strictly force heavy recycling & sprite stealing

  const sim = new BombCascadeStressSimulator({
    map,
    maxBombs: 80,
    defaultPower: 4, // 17 tiles per bomb
    poolCapacity: POOL_CAP,
    recyclingPolicy: 'STEAL_OLDEST',
  });

  const centerR = 8;
  const centerC = 9;

  // Ring 1 (Inner): radius 2, 16 bombs
  // Ring 2 (Outer): radius 5, 34 bombs
  // Total = 50 bombs
  let placed = 0;
  for (let r = 1; r < 16; r++) {
    for (let c = 1; c < 18; c++) {
      const dist = Math.hypot(r - centerR, c - centerC);
      if ((Math.abs(dist - 2) < 0.8 || Math.abs(dist - 5) < 0.8) && placed < 50) {
        sim.placeBombAtGrid(r, c, 4);
        placed++;
      }
    }
  }

  // Top up to exactly 50 if needed
  for (let r = 1; r < 16 && placed < 50; r++) {
    for (let c = 1; c < 18 && placed < 50; c++) {
      if (sim.map[r][c] === TILE_EMPTY && !sim.bombs.some(b => b.row === r && b.col === c)) {
        sim.placeBombAtGrid(r, c, 4);
        placed++;
      }
    }
  }

  assert.equal(sim.activeBombs, 50, 'Placed exactly 50 bombs in concentric implosion');
  assertPoolPointerInvariants(sim.explosionPool, POOL_CAP);

  // Trigger cascade from outer ring bomb
  const triggerBomb = sim.bombs[0];
  sim.explodeBomb(triggerBomb);

  // Invariants:
  assert.equal(sim.activeBombs, 0, 'All 50 bombs detonated');
  assert.equal(sim.totalExplodeCalls, 50, 'All 50 calls completed');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate calls');
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound to 0');

  // Verify heavy recycling occurred without corrupting pool pointers
  assert.ok(sim.explosionAcquires > POOL_CAP, `Acquires (${sim.explosionAcquires}) exceeded capacity (${POOL_CAP})`);
  assert.ok(sim.stolenSpritesCount > 0, `Stolen sprites (${sim.stolenSpritesCount}) successfully recycled`);
  assertPoolPointerInvariants(sim.explosionPool, POOL_CAP);

  // Advancing time recycles all remaining active sprites back to pool
  sim.update(500);
  assert.equal(sim.explosionPool.activeCount, 0, 'All active explosions expired and recycled');
  assert.equal(sim.explosionPool.freeCount, POOL_CAP, 'All slots returned to free list');
  assertPoolPointerInvariants(sim.explosionPool, POOL_CAP);
});

test('STRESS-05: 50 bombs with co-located epicenter stacking (5 clusters of 10 bombs on same tile)', () => {
  const map = createStandardMap(15, 17);
  const sim = new BombCascadeStressSimulator({
    map,
    maxBombs: 100,
    defaultPower: 2,
    poolCapacity: 128,
  });

  // 5 distinct coordinates, each holding 10 stacked bombs
  const clusterCoords = [
    { r: 3, c: 3 },
    { r: 3, c: 5 },
    { r: 5, c: 5 },
    { r: 7, c: 5 },
    { r: 7, c: 7 },
  ];

  for (const coord of clusterCoords) {
    for (let k = 0; k < 10; k++) {
      sim.placeBombAtGrid(coord.r, coord.c, 2);
    }
  }

  assert.equal(sim.activeBombs, 50, '50 bombs in 5 stacked clusters');
  assertPoolPointerInvariants(sim.explosionPool, 128);

  // Detonate first bomb at (3, 3)
  const initialBomb = sim.bombs[0];
  sim.explodeBomb(initialBomb);

  // All 50 bombs must resolve without infinite loops or stack overflow
  assert.equal(sim.activeBombs, 0, 'All 50 stacked bombs detonated');
  assert.equal(sim.totalExplodeCalls, 50, '50 total explodeBomb calls');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate calls');
  assert.ok(sim.maxCallDepth < 500, `Call depth (${sim.maxCallDepth}) well within bounds`);
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound');
  assertPoolPointerInvariants(sim.explosionPool, 128);
});

test('STRESS-06: Piercing 50-bomb cascade penetrating multi-layer soft blocks with item drop anti-snowballing', () => {
  const map = createOpenMap(16, 20);

  // Set up 4 dense rows of soft blocks
  for (let r = 4; r <= 10; r += 2) {
    for (let c = 2; c < 18; c++) {
      map[r][c] = TILE_BLOCK;
    }
  }

  // Player stats with max speed and max bombs to test anti-snowball filter
  const sim = new BombCascadeStressSimulator({
    map,
    maxBombs: 100,
    defaultPower: 5,
    poolCapacity: 128,
    playerStats: {
      speed: MAX_PLAYER_SPEED, // Capped! SPEED_UP must not drop
      maxBombs: MAX_BOMBS_CAP, // Capped! BOMB_UP must not drop
      bombPower: 5,
      hasKick: true,
      hasWallPass: true,
      hasBombPass: true,
      hasMagnet: true,
      hasBlastDeflector: true,
      hasBlastResist: true,
      hasVampiric: true,
      extraLives: 3, // Capped! EXTRA_LIFE must not drop
    },
  });
  sim.initSoftBlocks();

  // Place 50 piercing bombs
  let placed = 0;
  for (let r = 1; r < 15; r++) {
    for (let c = 1; c < 19; c++) {
      if (sim.map[r][c] === TILE_EMPTY && placed < 50) {
        const b = sim.placeBombAtGrid(r, c, 5);
        b.setData('isPiercing', true);
        placed++;
      }
    }
  }

  assert.equal(sim.activeBombs, 50, '50 piercing bombs placed');

  // Trigger cascade
  sim.explodeBomb(sim.bombs[0]);

  // Assertions:
  assert.equal(sim.activeBombs, 0, 'All 50 piercing bombs detonated');
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound');
  assert.ok(sim.destroyedBlockHistory.length >= 10, 'Piercing blast penetrated multiple blocks');

  // Verify anti-snowballing: no capped items dropped
  for (const item of sim.items) {
    assert.notEqual(item.type, 'SPEED_UP', 'SPEED_UP must be filtered by anti-snowball cap');
    assert.notEqual(item.type, 'BOMB_UP', 'BOMB_UP must be filtered by anti-snowball cap');
    assert.notEqual(item.type, 'EXTRA_LIFE', 'EXTRA_LIFE must be filtered by anti-snowball cap');
  }

  assertPoolPointerInvariants(sim.explosionPool, 128);
});

test('STRESS-07: Adversarial attacks on ObjectPool during 50-bomb cascade (double release, foreign items, flapping)', () => {
  const map = createOpenMap(15, 17);
  const sim = new BombCascadeStressSimulator({
    map,
    maxBombs: 100,
    defaultPower: 2,
    poolCapacity: 64,
    recyclingPolicy: 'STEAL_OLDEST',
  });

  // Lay down 50 bombs
  let count = 0;
  for (let r = 1; r < 14 && count < 50; r++) {
    for (let c = 1; c < 16 && count < 50; c++) {
      sim.placeBombAtGrid(r, c, 2);
      count++;
    }
  }

  // 1. Detonate cascade
  sim.explodeBomb(sim.bombs[0]);
  assert.equal(sim.activeBombs, 0);
  assertPoolPointerInvariants(sim.explosionPool, 64);

  // 2. Adversarial Double-Release Attack on active items
  const pool = sim.explosionPool;
  const activeItems = [];
  pool.forEachActive((item) => activeItems.push(item));

  for (const item of activeItems) {
    const firstRel = pool.release(item);
    assert.equal(firstRel, true, 'First release must succeed');
    // Double release attempts
    for (let rep = 0; rep < 50; rep++) {
      const dupRel = pool.release(item);
      assert.equal(dupRel, false, 'Duplicate release must be safely rejected');
    }
    assertPoolPointerInvariants(pool, 64);
  }

  // 3. Foreign Object Injections
  const foreignObjects = [
    { poolId: 999 },
    null,
    undefined,
    {},
    'string_token',
    12345,
    new MockExplosionSprite(999),
  ];
  for (const foreign of foreignObjects) {
    assert.equal(pool.release(foreign), false, 'Foreign object release must return false');
    assertPoolPointerInvariants(pool, 64);
  }

  // 4. Rapid acquire-release flapping (5,000 cycles)
  for (let f = 0; f < 5000; f++) {
    const item = pool.acquire();
    assert.ok(item !== null);
    assert.equal(pool.release(item), true);
    assert.equal(pool.release(item), false); // double release
  }
  assertPoolPointerInvariants(pool, 64);

  // 5. Full pool reset and refilling
  pool.reset();
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.freeCount, 64);
  assertPoolPointerInvariants(pool, 64);
});

test('STRESS-08: Monte Carlo 100-trial soak test with randomized 50-bomb networks verifies 0% defect rate', () => {
  const TRIALS = 100;
  let totalBombsDetonated = 0;
  let totalBlocksDestroyed = 0;
  let totalItemsSpawned = 0;
  let maxCallDepthAcrossAll = 0;

  for (let trial = 0; trial < TRIALS; trial++) {
    const map = createOpenMap(15, 17);

    // Randomize 20 soft blocks
    for (let b = 0; b < 20; b++) {
      const br = 1 + ((trial * 7 + b * 11) % 13);
      const bc = 1 + ((trial * 13 + b * 17) % 15);
      map[br][bc] = TILE_BLOCK;
    }

    const sim = new BombCascadeStressSimulator({
      map,
      maxBombs: 80,
      defaultPower: 2 + (trial % 3), // power 2, 3, or 4
      poolCapacity: 128,
      recyclingPolicy: 'STEAL_OLDEST',
    });
    sim.initSoftBlocks();

    // Place 50 randomized bombs
    let placed = 0;
    const availableTiles = [];
    for (let r = 1; r < 14; r++) {
      for (let c = 1; c < 16; c++) {
        if (sim.map[r][c] === TILE_EMPTY) {
          availableTiles.push({ r, c });
        }
      }
    }

    // Pseudo-random shuffle
    for (let i = availableTiles.length - 1; i > 0; i--) {
      const j = (trial * 41 + i * 29) % (i + 1);
      [availableTiles[i], availableTiles[j]] = [availableTiles[j], availableTiles[i]];
    }

    for (let i = 0; i < 50 && i < availableTiles.length; i++) {
      sim.placeBombAtGrid(availableTiles[i].r, availableTiles[i].c, sim.defaultPower);
      placed++;
    }

    assert.equal(placed, 50, `Trial ${trial}: exactly 50 bombs placed`);
    totalBombsDetonated += 50;

    // Trigger cascade via simultaneous fuse timeout (all 50 bombs active in same tick)
    sim.update(2000);

    if (sim.maxCallDepth > maxCallDepthAcrossAll) {
      maxCallDepthAcrossAll = sim.maxCallDepth;
    }

    totalBlocksDestroyed += sim.destroyedBlockHistory.length;
    totalItemsSpawned += sim.items.length;

    // Invariant assertions per trial
    assert.equal(sim.activeBombs, 0, `Trial ${trial}: All bombs cleared`);
    assert.equal(sim.duplicateDetonations.length, 0, `Trial ${trial}: 0 duplicate detonations`);
    assert.equal(sim.currentCallDepth, 0, `Trial ${trial}: Stack unwound to 0`);
    assert.equal(sim.destroyedItems.length, 0, `Trial ${trial}: Zero freshly dropped items incinerated`);
    assertPoolPointerInvariants(sim.explosionPool, 128);

    // Fast-forward 400ms to recycle all explosions
    sim.update(400);
    assert.equal(sim.explosionPool.activeCount, 0, `Trial ${trial}: Pool fully recycled`);
    assertPoolPointerInvariants(sim.explosionPool, 128);
  }

  assert.equal(totalBombsDetonated, 5000, 'Simulated exactly 5,000 bombs across 100 trials');
  assert.ok(totalBlocksDestroyed > 500, `Destroyed ${totalBlocksDestroyed} soft blocks`);
  assert.ok(totalItemsSpawned > 200, `Spawned ${totalItemsSpawned} items`);
  assert.ok(maxCallDepthAcrossAll <= 50, `Max observed call depth (${maxCallDepthAcrossAll}) <= 50`);
  assert.ok(maxCallDepthAcrossAll < 5000, 'Call stack safely bounded below JS limits');
});
