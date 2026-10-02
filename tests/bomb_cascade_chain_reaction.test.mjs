import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamicHazard, HazardLifecycleState } from '../src/game/hazards/index.ts';
import { BaseBoss, BossState } from '../src/game/bosses/index.ts';

const TILE_SIZE = 40;
const ROWS = 13;
const COLS = 15;
const TILE_EMPTY = 0;
const TILE_WALL = 1;
const TILE_BLOCK = 2;

const CARDINAL_DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

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
 * Headless Concrete Boss for Stress Testing
 */
class TestFsmBoss extends BaseBoss {
  constructor(maxHp = 200, x = 300, y = 260) {
    super(
      {
        id: 'test_chaos_boss',
        name: 'Chaos Test Boss',
        title: 'Detonation Stress Dummy',
        avatarEmoji: '👾',
        maxHp,
        footprintWidth: 80,
        footprintHeight: 80,
        colliderRadius: 35,
        baseSpeed: 80,
        phase2HpThreshold: 0.7,
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
 * High-Fidelity Bomb Cascade Simulator faithfully replicating GameScene.ts lines 3601-3850
 * with instrumented stack depth tracking, fuse timers, and loop detection.
 */
class GameSceneBombCascadeSimulator {
  constructor(map, maxBombs = 200, bombPower = 2) {
    this.map = map.map(row => [...row]);
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.maxBombs = maxBombs;
    this.bombPower = bombPower;
    this.activeBombs = 0;
    this.bombs = []; // Array simulating Phaser Group getChildren()
    this.explosions = [];
    this.destroyedBlocks = [];
    this.destroyedBlocksThisTick = new Set();
    this.nextId = 1;

    this.dynamicHazard = null;
    this.boss = null;
    this.bossHitBombIds = new Set();
    this.bossHitsByBombId = [];
    this.rejectedBossHits = [];

    // Diagnostic & Safety Instrumentation
    this.currentCallDepth = 0;
    this.maxCallDepth = 0;
    this.totalExplodeCalls = 0;
    this.detonatedBombIds = new Set();
    this.duplicateDetonations = [];
    this.maxSafeStackLimit = 5000; // Well below V8 10,000 threshold to catch runaway recursion early
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

    // Mock Phaser Arcade Sprite object adhering to GameScene.ts contract
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
        // In Phaser, sprite.destroy() removes from group
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

  /**
   * Advances game time simulating fuse timeouts (matching GameScene.ts delayedCall)
   */
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

  /**
   * Explodes a bomb using the exact operational sequence and semantics of GameScene.ts lines 3601-3850
   */
  explodeBomb(bomb, row = null, col = null) {
    if (!bomb || !bomb.active) return;

    this.currentCallDepth++;
    if (this.currentCallDepth > this.maxCallDepth) {
      this.maxCallDepth = this.currentCallDepth;
    }
    if (this.currentCallDepth > this.maxSafeStackLimit) {
      throw new Error(`CRITICAL: Call stack limit exceeded safe threshold (${this.currentCallDepth} > ${this.maxSafeStackLimit})`);
    }
    this.totalExplodeCalls++;

    const bombId = bomb.getData('id') || `bomb_${this.nextId++}`;
    if (this.detonatedBombIds.has(bombId)) {
      this.duplicateDetonations.push(bombId);
      throw new Error(`CRITICAL: Infinite loop detected! Bomb ${bombId} detonated more than once!`);
    }
    this.detonatedBombIds.add(bombId);

    try {
      const curCol = Math.floor(bomb.x / TILE_SIZE);
      const curRow = Math.floor(bomb.y / TILE_SIZE);
      const actualRow = Number.isFinite(curRow) && curRow >= 0 && curRow < this.rows ? curRow : (row ?? 0);
      const actualCol = Number.isFinite(curCol) && curCol >= 0 && curCol < this.cols ? curCol : (col ?? 0);

      const bombPower = bomb.getData('power') || this.bombPower;
      const isGhostBomb = Boolean(bomb.getData('isGhostBomb'));

      // 1. Physically destroy bomb sprite before any cascading (GameScene line 3620)
      bomb.destroy();

      if (!isGhostBomb) {
        this.activeBombs = Math.max(0, this.activeBombs - 1);
      }

      // 2. Dynamic Hazard Interactions (Tachyon Overcharge & Entanglement Detonation)
      let effectivePower = bombPower;
      let isPiercing = false;

      if (this.dynamicHazard) {
        const detResult = this.dynamicHazard.onBombDetonated(bombId, actualRow, actualCol, bombPower);
        if (detResult.overcharged) {
          effectivePower = detResult.modifiedPower;
          isPiercing = detResult.piercing;
        }

        // Synchronized Entanglement Detonation (GameScene lines 3662-3683)
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

      // 3. Spawn Epicenter Explosion (GameScene line 3769)
      this.explosions.push({ row: actualRow, col: actualCol, isCenter: true, bombId, isPiercing });
      this.checkBossHit(actualRow, actualCol, bombId);

      if (this.dynamicHazard) {
        this.dynamicHazard.onBombBlastImpact(actualRow, actualCol);
      }

      // 4. Epicenter chain reaction: detonate any active bombs stacked on same tile (GameScene lines 3772-3791)
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

      // 5. Blast rays in 4 cardinal directions (GameScene lines 3793-3848)
      for (const dir of CARDINAL_DIRECTIONS) {
        let blocksPierced = 0;
        for (let i = 1; i <= effectivePower; i++) {
          const nr = actualRow + dir.dr * i;
          const nc = actualCol + dir.dc * i;

          if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;

          if (this.map[nr][nc] === TILE_WALL) {
            break; // Stop at unbreakable wall
          }

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
            if (this.dynamicHazard) {
              this.dynamicHazard.onBombBlastImpact(nr, nc);
            }
            if (!isPiercing || ++blocksPierced >= 3) {
              break;
            }
            continue;
          }

          // Empty tile explosion
          this.explosions.push({ row: nr, col: nc, isCenter: false, bombId, isPiercing });
          this.checkBossHit(nr, nc, bombId);
          if (this.dynamicHazard) {
            this.dynamicHazard.onBombBlastImpact(nr, nc);
          }

          // Check for chained bombs (GameScene lines 3827-3847)
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
      } else {
        this.rejectedBossHits.push({ bombId, row, col, dist });
      }
    }
  }
}

/* ==============================================================================
 * VERIFICATION SUITE: BOMB CASCADE CHAIN REACTION SAFETY & RECURSION INTEGRITY
 * ============================================================================== */

test('VERIFY-01: 50-bomb contiguous serpentine snake cascade terminates cleanly without call-stack overflow', () => {
  const map = createOpenMap(ROWS, COLS);
  const sim = new GameSceneBombCascadeSimulator(map, 100, 1); // power = 1: strictly single-step chain

  // Lay down exactly 50 bombs in a serpentine path
  let placed = 0;
  const targetCount = 50;
  for (let r = 1; r <= 5; r++) {
    const isEven = r % 2 === 0;
    const startCol = isEven ? 10 : 1;
    const endCol = isEven ? 1 : 10;
    const step = isEven ? -1 : 1;

    for (let c = startCol; isEven ? c >= endCol : c <= endCol; c += step) {
      if (placed < targetCount) {
        sim.placeBombAtGrid(r, c, 1);
        placed++;
      }
    }
  }

  assert.equal(sim.activeBombs, 50, 'Exactly 50 bombs must be placed');
  assert.equal(sim.bombs.length, 50, '50 active bomb sprites in group');

  // Detonate the head bomb at (1, 1)
  const headBomb = sim.bombs[0];
  sim.explodeBomb(headBomb);

  // Invariant assertions
  assert.equal(sim.activeBombs, 0, 'All 50 bombs must be destroyed and inactive');
  assert.equal(sim.bombs.length, 0, 'Phaser group must have 0 remaining sprites');
  assert.equal(sim.totalExplodeCalls, 50, 'Exactly 50 explodeBomb calls occurred');
  assert.equal(sim.detonatedBombIds.size, 50, 'All 50 bombs detonated exactly once');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate detonations occurred');

  // Call stack depth verification
  assert.ok(sim.maxCallDepth >= 40 && sim.maxCallDepth <= 50, `Linear cascade call depth (${sim.maxCallDepth}) matches chain length`);
  assert.ok(sim.maxCallDepth < 5000, 'Max call depth is thousands of frames below JS limit (~10,000)');
  assert.equal(sim.currentCallDepth, 0, 'Call stack must unwind completely to depth 0');
});

test('VERIFY-02: 75-bomb mega serpentine snake verifies extended recursion headroom and zero stack overflow', () => {
  // Use a larger 20x20 open arena for 75 bombs
  const openMap = createOpenMap(20, 20);
  const sim = new GameSceneBombCascadeSimulator(openMap, 150, 1);

  let placed = 0;
  const targetCount = 75;
  for (let r = 1; r < 19; r++) {
    const isEven = r % 2 === 0;
    const startCol = isEven ? 15 : 1;
    const endCol = isEven ? 1 : 15;
    const step = isEven ? -1 : 1;

    for (let c = startCol; isEven ? c >= endCol : c <= endCol; c += step) {
      if (placed < targetCount) {
        sim.placeBombAtGrid(r, c, 1);
        placed++;
      }
    }
  }

  assert.equal(sim.activeBombs, 75, 'Placed exactly 75 contiguous bombs');

  const headBomb = sim.bombs[0];
  sim.explodeBomb(headBomb);

  assert.equal(sim.activeBombs, 0, 'All 75 bombs detonated');
  assert.equal(sim.totalExplodeCalls, 75, 'Exactly 75 explode calls');
  assert.equal(sim.detonatedBombIds.size, 75, '75 unique bomb IDs');
  assert.ok(sim.maxCallDepth <= 75, `Max depth (${sim.maxCallDepth}) <= 75`);
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound to 0');
});

test('VERIFY-03: Cyclic mutual-crossfire configuration strictly prevents infinite detonation loops', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombCascadeSimulator(map, 50, 3); // power = 3

  // Place 4 bombs in a mutual crossfire loop at adjacent tiles:
  // (3, 3) <-> (3, 5)
  //   ^          ^
  //   v          v
  // (5, 3) <-> (5, 5)
  // Each bomb's blast with power=3 directly covers the other three bombs!
  const b1 = sim.placeBombAtGrid(3, 3, 3);
  const b2 = sim.placeBombAtGrid(3, 5, 3);
  const b3 = sim.placeBombAtGrid(5, 3, 3);
  const b4 = sim.placeBombAtGrid(5, 5, 3);

  assert.equal(sim.activeBombs, 4);

  // Trigger b1
  sim.explodeBomb(b1);

  // Invariants:
  assert.equal(sim.activeBombs, 0, 'All 4 bombs in crossfire loop detonated');
  assert.equal(sim.totalExplodeCalls, 4, 'Total explode calls must be EXACTLY 4 (no re-triggers)');
  assert.equal(sim.detonatedBombIds.size, 4, 'All 4 unique bombs detonated once');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate detonations');
  assert.equal(sim.currentCallDepth, 0, 'Stack unwinds to 0');
});

test('VERIFY-04: Concentric dual-ring 56-bomb crossfire barrage resolves synchronously with zero infinite loops', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombCascadeSimulator(map, 80, 2);

  // Place 56 bombs covering row 3, row 5, row 7, row 9 across cols 1..13
  let placed = 0;
  for (const r of [3, 5, 7, 9]) {
    for (let c = 1; c <= 13; c++) {
      if (map[r][c] === TILE_EMPTY) {
        sim.placeBombAtGrid(r, c, 2);
        placed++;
      }
    }
  }

  // Cross vertical columns 3, 7, 11
  for (const c of [3, 7, 11]) {
    for (let r = 1; r <= 11; r++) {
      if (map[r][c] === TILE_EMPTY && !sim.bombs.some(b => b.row === r && b.col === c)) {
        sim.placeBombAtGrid(r, c, 2);
        placed++;
      }
    }
  }

  assert.ok(placed >= 50, `Placed at least 50 bombs (placed: ${placed})`);
  const initialCount = placed;

  // Trigger epicenter bomb at (5, 7)
  const epicenterBomb = sim.bombs.find(b => b.row === 5 && b.col === 7);
  assert.ok(epicenterBomb, 'Epicenter bomb exists');

  sim.explodeBomb(epicenterBomb);

  assert.equal(sim.activeBombs, 0, 'All bombs must be cleared');
  assert.equal(sim.totalExplodeCalls, initialCount, `Exactly ${initialCount} detonations occurred`);
  assert.equal(sim.detonatedBombIds.size, initialCount, 'Every placed bomb detonated exactly once');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate detonations');
  assert.ok(sim.maxCallDepth <= initialCount, `Call stack depth (${sim.maxCallDepth}) <= total bombs`);
  assert.equal(sim.currentCallDepth, 0, 'Call stack cleanly unwound');
});

test('VERIFY-05: 12 co-located bombs on exact same tile (epicenter stacking) detonate without infinite recursion', () => {
  const map = createStandardMap();
  const sim = new GameSceneBombCascadeSimulator(map, 30, 2);

  // Stack 12 bombs on tile (5, 5)
  for (let i = 0; i < 12; i++) {
    sim.placeBombAtGrid(5, 5, 2);
  }

  assert.equal(sim.activeBombs, 12, '12 stacked bombs placed');
  assert.equal(sim.bombs.length, 12);

  const firstBomb = sim.bombs[0];
  sim.explodeBomb(firstBomb);

  assert.equal(sim.activeBombs, 0, 'All 12 stacked bombs detonated');
  assert.equal(sim.totalExplodeCalls, 12, 'Exactly 12 explode calls executed');
  assert.equal(sim.detonatedBombIds.size, 12, '12 unique bomb detonations');
  assert.equal(sim.duplicateDetonations.length, 0, 'No loops or duplicate triggers');
  assert.equal(sim.currentCallDepth, 0, 'Stack unwound to 0');
});

test('VERIFY-06: 60-bomb cascade with DynamicHazard Tachyon Overcharge & paired Entangled Ghost Bombs', () => {
  const map = createStandardMap();
  const hazard = new DynamicHazard();
  hazard.init(map);
  hazard.start('CLIMAX');
  hazard.update(2000); // TELEGRAPH
  hazard.update(2000); // ACTIVE
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  const sim = new GameSceneBombCascadeSimulator(map, 100, 2);
  sim.dynamicHazard = hazard;

  // Interlocking grid: Row 5 (cols 1..13), Row 7 (cols 1..13), Col 7 (rows 1..11), Col 3 (rows 1..11), Col 11 (rows 1..11)
  // Row 5: 13 bombs
  for (let c = 1; c <= 13; c++) {
    sim.placeBombAtGrid(5, c, 2);
  }
  // Row 7: 13 bombs
  for (let c = 1; c <= 13; c++) {
    if (!sim.bombs.some(b => b.row === 7 && b.col === c)) {
      sim.placeBombAtGrid(7, c, 2);
    }
  }
  // Columns 3, 7, 11 (crossing rows 1..11)
  for (const c of [3, 7, 11]) {
    for (let r = 1; r <= 11; r++) {
      if (!sim.bombs.some(b => b.row === r && b.col === c)) {
        sim.placeBombAtGrid(r, c, 2);
      }
    }
  }
  // Row 6 (Tachyon active beam corridor): cols 1, 3, 5, 7, 9, 11, 13
  for (const c of [1, 3, 5, 7, 9, 11, 13]) {
    if (!sim.bombs.some(b => b.row === 6 && b.col === c)) {
      sim.placeBombAtGrid(6, c, 2);
    }
  }

  // Add 5 entangled ghost bomb pairs connected along Row 5 and 6
  for (let i = 0; i < 5; i++) {
    const parentCol = 2 + i * 2;
    const parentBomb = sim.bombs.find(b => b.row === 5 && b.col === parentCol);
    if (parentBomb) {
      const parentId = `parent_hazard_${i}`;
      const ghostId = `ghost_hazard_${i}`;
      parentBomb.setData('id', parentId);

      hazard.ghostBombPool[i].active = true;
      hazard.ghostBombPool[i].id = ghostId;
      hazard.ghostBombPool[i].parentBombId = parentId;
      hazard.ghostBombPool[i].r = 6;
      hazard.ghostBombPool[i].c = parentCol;
      hazard.ghostBombPool[i].power = 2;

      const ghostBomb = sim.placeBombAtGrid(6, parentCol, 2, true, parentId);
      ghostBomb.setData('id', ghostId);
    }
  }

  const totalPlaced = sim.bombs.length;
  assert.ok(totalPlaced >= 50, `Placed >= 50 total bombs (placed ${totalPlaced})`);

  // Trigger cascade from epicenter at (5, 7)
  const epicenter = sim.bombs.find(b => b.row === 5 && b.col === 7);
  assert.ok(epicenter, 'Epicenter bomb exists');
  sim.explodeBomb(epicenter);

  assert.equal(sim.activeBombs, 0, 'All regular bombs active counter is 0');
  assert.equal(sim.bombs.length, 0, 'All sprites destroyed including ghost bombs');
  assert.equal(sim.totalExplodeCalls, totalPlaced, `All ${totalPlaced} bombs detonated`);
  assert.equal(sim.detonatedBombIds.size, totalPlaced, 'All unique IDs executed once');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero duplicate detonations or infinite re-triggers');
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound');
});

test('VERIFY-07: Boss 52-bomb concentric barrage strictly adheres to PHYS-06 with zero infinite loops', () => {
  const map = createStandardMap();
  const boss = new TestFsmBoss(500, 7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  const sim = new GameSceneBombCascadeSimulator(map, 80, 2);
  sim.boss = boss;

  // Place 52 bombs surrounding boss at (6, 7)
  let count = 0;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (map[r][c] === TILE_EMPTY && (r !== 6 || c !== 7) && count < 52) {
        sim.placeBombAtGrid(r, c, 2);
        count++;
      }
    }
  }

  assert.equal(sim.activeBombs, 52, '52 bombs placed around boss');
  const startHp = boss.currentHp;

  // Trigger cascade via simultaneous timeout
  sim.update(2000);

  assert.equal(sim.activeBombs, 0, 'All 52 bombs detonated');
  assert.equal(sim.totalExplodeCalls, 52, 'Exactly 52 detonations');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero loop re-triggers');

  // Verify PHYS-06: exactly 1 damage registered per unique bomb that intersected boss radius
  const uniqueHits = sim.bossHitsByBombId.length;
  assert.ok(uniqueHits > 0, 'At least 1 unique bomb hit boss');
  assert.equal(boss.currentHp, startHp - uniqueHits, 'Boss HP strictly decremented by unique bomb count');

  // Ensure no duplicate bomb IDs damaged boss
  const hitIds = new Set();
  for (const hit of sim.bossHitsByBombId) {
    assert.equal(hitIds.has(hit.bombId), false, `Bomb ${hit.bombId} registered duplicate damage`);
    hitIds.add(hit.bombId);
  }
  assert.equal(sim.currentCallDepth, 0, 'Stack unwound to 0');
});

test('VERIFY-08: Monte Carlo 50-trial soak with 50-70 randomized bombs per trial proves 0% defect rate', () => {
  let grandTotalBombs = 0;
  let grandTotalCalls = 0;
  let maxObservedDepthAcrossTrials = 0;

  for (let trial = 0; trial < 50; trial++) {
    const map = createOpenMap(ROWS, COLS);
    const bombCount = 50 + (trial % 21); // 50 to 70 bombs
    const sim = new GameSceneBombCascadeSimulator(map, 100, 2);

    const openTiles = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        openTiles.push({ r, c });
      }
    }

    // Pseudo-random deterministic shuffle
    for (let i = openTiles.length - 1; i > 0; i--) {
      const j = (trial * 37 + i * 19) % (i + 1);
      [openTiles[i], openTiles[j]] = [openTiles[j], openTiles[i]];
    }

    for (let b = 0; b < bombCount; b++) {
      const tile = openTiles[b];
      sim.placeBombAtGrid(tile.r, tile.c, 2);
    }

    grandTotalBombs += bombCount;

    // Simulate frame tick where all bombs expire or chain-detonate
    sim.update(2000);

    grandTotalCalls += sim.totalExplodeCalls;
    if (sim.maxCallDepth > maxObservedDepthAcrossTrials) {
      maxObservedDepthAcrossTrials = sim.maxCallDepth;
    }

    assert.equal(sim.activeBombs, 0, `Trial ${trial}: All bombs cleared`);
    assert.equal(sim.totalExplodeCalls, bombCount, `Trial ${trial}: Calls equal placed bombs`);
    assert.equal(sim.detonatedBombIds.size, bombCount, `Trial ${trial}: All bombs detonated exactly once`);
    assert.equal(sim.duplicateDetonations.length, 0, `Trial ${trial}: No duplicate detonations`);
    assert.equal(sim.currentCallDepth, 0, `Trial ${trial}: Stack unwinds to 0`);
  }

  assert.ok(grandTotalBombs >= 2500, `Simulated >= 2,500 bombs (total: ${grandTotalBombs})`);
  assert.equal(grandTotalCalls, grandTotalBombs, 'Every simulated bomb cleanly detonated');
  assert.ok(maxObservedDepthAcrossTrials <= 70, `Max observed stack depth (${maxObservedDepthAcrossTrials}) <= 70`);
  assert.ok(maxObservedDepthAcrossTrials < 5000, 'Max stack depth is safely bounded below JS limits');
});

test('VERIFY-09: Single-trigger 60-bomb contiguous chain verifies pure recursive propagation without timeouts', () => {
  // Test pure recursive propagation: ONE call to explodeBomb initiates a cascade that reaches 60 bombs
  const openMap = createOpenMap(ROWS, COLS);
  const sim = new GameSceneBombCascadeSimulator(openMap, 100, 2);

  // Place 60 bombs along contiguous connected lines
  let placed = 0;
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 12; c++) {
      if (placed < 60) {
        sim.placeBombAtGrid(r, c, 2);
        placed++;
      }
    }
  }

  assert.equal(placed, 60);
  assert.equal(sim.activeBombs, 60);

  // Detonate ONLY the first bomb at (1, 1). Do NOT call update(). Pure recursion!
  sim.explodeBomb(sim.bombs[0]);

  assert.equal(sim.activeBombs, 0, 'Pure recursive cascade cleared all 60 bombs');
  assert.equal(sim.totalExplodeCalls, 60, 'Exactly 60 detonations triggered');
  assert.equal(sim.detonatedBombIds.size, 60, 'All 60 unique IDs executed');
  assert.equal(sim.duplicateDetonations.length, 0, 'Zero infinite loop re-triggers');
  assert.ok(sim.maxCallDepth <= 60, `Call depth (${sim.maxCallDepth}) <= 60`);
  assert.equal(sim.currentCallDepth, 0, 'Call stack cleanly unwound to 0');
});

test('VERIFY-10: 100+ simultaneous bombs mega-cascade with soft blocks and obstacle obstruction verifies absolute safety', () => {
  // Construct a large 25x25 arena with interspersed soft blocks
  const arena = createOpenMap(25, 25);
  // Add some soft blocks at strategic locations
  for (let r = 2; r < 23; r += 2) {
    for (let c = 2; c < 23; c += 2) {
      arena[r][c] = TILE_BLOCK;
    }
  }

  const sim = new GameSceneBombCascadeSimulator(arena, 200, 2);

  // Place 110 contiguous bombs
  let placed = 0;
  for (let r = 1; r < 23; r++) {
    for (let c = 1; c < 23; c++) {
      if (placed < 110 && arena[r][c] === TILE_EMPTY) {
        sim.placeBombAtGrid(r, c, 2);
        placed++;
      }
    }
  }

  assert.equal(placed, 110, 'Placed exactly 110 bombs');
  assert.equal(sim.activeBombs, 110);

  // Trigger cascade via simultaneous timeout tick
  sim.update(2000);

  // Invariants
  assert.equal(sim.activeBombs, 0, 'All 110 bombs cleared');
  assert.equal(sim.totalExplodeCalls, 110, 'All 110 detonations executed');
  assert.equal(sim.detonatedBombIds.size, 110, '110 unique bomb IDs');
  assert.equal(sim.duplicateDetonations.length, 0, '0 duplicate calls or loops');
  assert.ok(sim.maxCallDepth <= 110, `Call depth (${sim.maxCallDepth}) <= 110`);
  assert.ok(sim.maxCallDepth < 5000, 'Call depth bounded far below JS call stack limit');
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound to 0');
});

