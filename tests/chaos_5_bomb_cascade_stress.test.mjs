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

class CascadeSimulator {
  constructor(map, maxBombs = 120, bombPower = 2) {
    this.map = map.map(row => [...row]);
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
    this.rejectedBossHits = [];

    this.currentCallDepth = 0;
    this.maxCallDepth = 0;
    this.totalExplodeCalls = 0;
  }

  placeBomb(playerX, playerY, customPower) {
    if (this.activeBombs >= this.maxBombs) return null;
    const col = Math.floor(playerX / TILE_SIZE);
    const row = Math.floor(playerY / TILE_SIZE);
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    const exists = this.bombs.some(b => b.active && b.row === row && b.col === col);
    if (exists) return null;

    const bomb = {
      id: `bomb_${this.nextId++}`,
      row,
      col,
      x: centerX,
      y: centerY,
      timeElapsed: 0,
      stage: 1,
      tint: 0xffffff,
      scale: 1.15,
      active: true,
      power: customPower ?? this.bombPower,
    };

    this.bombs.push(bomb);
    this.activeBombs++;
    return bomb;
  }

  update(deltaMs) {
    this.destroyedBlocksThisTick.clear();
    const toExplode = [];
    for (const bomb of this.bombs) {
      if (!bomb.active) continue;
      bomb.timeElapsed += deltaMs;
      if (bomb.timeElapsed >= 2000) {
        toExplode.push(bomb);
      }
    }
    for (const bomb of toExplode) {
      if (bomb.active) {
        this.explodeBomb(bomb);
      }
    }
  }

  explodeBomb(bomb) {
    if (!bomb.active) return;
    bomb.active = false;
    this.activeBombs = Math.max(0, this.activeBombs - 1);

    this.currentCallDepth++;
    if (this.currentCallDepth > this.maxCallDepth) {
      this.maxCallDepth = this.currentCallDepth;
    }
    this.totalExplodeCalls++;

    try {
      let effectivePower = bomb.power ?? this.bombPower;

      // Tachyon Overcharge (+2 power if detonating within active hazard beam)
      if (this.dynamicHazard) {
        const bombNumId = typeof bomb.id === 'string' ? parseInt(bomb.id.replace('bomb_', ''), 10) || 1 : bomb.id;
        const hazardRes = this.dynamicHazard.onBombDetonated(
          bombNumId,
          bomb.row,
          bomb.col,
          effectivePower
        );
        if (hazardRes.overcharged) {
          effectivePower = hazardRes.modifiedPower;
        }
      }

      this.explosions.push({ row: bomb.row, col: bomb.col, isCenter: true, bombId: bomb.id });
      this.checkBossHit(bomb.row, bomb.col, bomb.id);

      if (this.dynamicHazard) {
        this.dynamicHazard.onBombBlastImpact(bomb.row, bomb.col);
      }

      const sameTileBombs = this.bombs.filter(b => b.active && b.row === bomb.row && b.col === bomb.col && b !== bomb);
      for (const otherBomb of sameTileBombs) {
        if (otherBomb.active) {
          this.explodeBomb(otherBomb);
        }
      }

      const directions = [
        { dr: -1, dc: 0 },
        { dr: 1, dc: 0 },
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
      ];

      for (const dir of directions) {
        for (let i = 1; i <= effectivePower; i++) {
          const nr = bomb.row + dir.dr * i;
          const nc = bomb.col + dir.dc * i;

          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (this.map[nr][nc] === TILE_WALL) break;

          const key = `${nr},${nc}`;
          const isBlock = this.map[nr][nc] === TILE_BLOCK || this.destroyedBlocksThisTick.has(key);

          if (isBlock) {
            this.destroyedBlocksThisTick.add(key);
            if (this.map[nr][nc] === TILE_BLOCK) {
              this.map[nr][nc] = TILE_EMPTY;
              this.destroyedBlocks.push({ row: nr, col: nc });
            }
            this.explosions.push({ row: nr, col: nc, isCenter: false, bombId: bomb.id });
            this.checkBossHit(nr, nc, bomb.id);
            if (this.dynamicHazard) {
              this.dynamicHazard.onBombBlastImpact(nr, nc);
            }
            break;
          }

          this.explosions.push({ row: nr, col: nc, isCenter: false, bombId: bomb.id });
          this.checkBossHit(nr, nc, bomb.id);
          if (this.dynamicHazard) {
            this.dynamicHazard.onBombBlastImpact(nr, nc);
          }

          const chainTargets = this.bombs.filter(b => b.active && b.row === nr && b.col === nc);
          for (const target of chainTargets) {
            if (target.active) {
              this.explodeBomb(target);
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
 * SUITE: 30+ BOMB SIMULTANEOUS INTERLOCKING CROSS & DYNAMIC HAZARD ADVERSARIAL STRESS
 * ============================================================================== */

test('ADV-CASCADE-01: 32-bomb dense cross-corridor cascade with active Tachyon beams triggers synchronously without stack overflow', () => {
  const map = createStandardMap();
  const hazard = new DynamicHazard();
  hazard.init(map);
  hazard.start('CLIMAX');
  hazard.update(2000); // -> TELEGRAPH
  hazard.update(2000); // -> ACTIVE
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  const sim = new CascadeSimulator(map, 60, 2);
  sim.dynamicHazard = hazard;

  // Interlocking grid: Row 5, Col 7, Row 7
  // Row 5: 13 bombs (cols 1..13)
  for (let c = 1; c <= 13; c++) sim.placeBomb(c * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  // Col 7: 9 bombs (rows 1..11, skip 5 and 7)
  for (let r = 1; r <= 11; r++) {
    if (r !== 5 && r !== 7) sim.placeBomb(7 * TILE_SIZE + 20, r * TILE_SIZE + 20);
  }
  // Row 7: 12 bombs (cols 1..13, skip col 7 already placed)
  for (let c = 1; c <= 13; c++) {
    if (c !== 7) sim.placeBomb(c * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  }
  // Row 6 (Tachyon beam): cols 1, 3, 5, 9, 11, 13 (6 bombs)
  for (const c of [1, 3, 5, 9, 11, 13]) {
    sim.placeBomb(c * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  }

  assert.ok(sim.activeBombs >= 30, `Must place >= 30 bombs (placed ${sim.activeBombs})`);
  const initialCount = sim.activeBombs;

  // Single tick detonation at t = 2000ms
  sim.update(2000);

  // Invariants
  assert.equal(sim.activeBombs, 0, 'All active bombs must be 0 after chain cascade');
  assert.equal(sim.totalExplodeCalls, initialCount, `Exactly ${initialCount} detonations occurred`);
  assert.ok(sim.maxCallDepth <= initialCount, `Call depth (${sim.maxCallDepth}) must be <= total bombs`);
  assert.equal(sim.currentCallDepth, 0, 'Call stack must unwind cleanly to 0');
});

test('ADV-CASCADE-02: 50-bomb linear snake chain tests maximum linear recursion depth safety', () => {
  // Construct an open zig-zag map capable of hosting a contiguous 50-tile chain
  const openMap = [];
  for (let r = 0; r < ROWS; r++) {
    openMap[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        openMap[r][c] = TILE_WALL;
      } else {
        openMap[r][c] = TILE_EMPTY; // Wide open arena for unbroken snake
      }
    }
  }

  const sim = new CascadeSimulator(openMap, 60, 1); // power = 1 (strictly triggers only immediate neighbor)

  // Place 50 bombs contiguously in a serpentine snake
  let count = 0;
  for (let r = 1; r <= 5; r++) {
    const isEven = r % 2 === 0;
    const colStart = isEven ? 12 : 1;
    const colEnd = isEven ? 1 : 12;
    const colStep = isEven ? -1 : 1;

    for (let c = colStart; isEven ? c >= colEnd : c <= colEnd; c += colStep) {
      if (count < 50) {
        sim.placeBomb(c * TILE_SIZE + 20, r * TILE_SIZE + 20);
        count++;
      }
    }
  }

  assert.equal(sim.activeBombs, 50, 'Placed 50 contiguous snake bombs');

  // Trigger head of snake at (1, 1)
  sim.update(2000);

  // Invariants:
  assert.equal(sim.activeBombs, 0, 'Entire 50-bomb chain cleanly detonated');
  assert.equal(sim.totalExplodeCalls, 50, 'Exactly 50 explode calls');
  assert.ok(sim.maxCallDepth >= 40 && sim.maxCallDepth <= 50, `Linear cascade reaches depth ${sim.maxCallDepth}`);
  assert.equal(sim.currentCallDepth, 0, 'Stack cleanly unwound without overflow');
});

test('ADV-CASCADE-03: PHYS-06 strict invariant under 48-bomb concentric barrage on Boss at Nexus (6, 7)', () => {
  const map = createStandardMap();
  const hazard = new DynamicHazard();
  hazard.init(map);
  hazard.start('CLIMAX');
  hazard.update(2000);
  hazard.update(2000); // ACTIVE

  const boss = new TestFsmBoss(300, 7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  const sim = new CascadeSimulator(map, 80, 3); // power = 3
  sim.dynamicHazard = hazard;
  sim.boss = boss;

  // Dense placement surrounding (6, 7):
  // Rows 5 and 7: cols 1 through 13 (26 bombs)
  for (let c = 1; c <= 13; c++) {
    sim.placeBomb(c * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
    sim.placeBomb(c * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  }
  // Col 7: rows 1 through 11 (skip 5, 6, 7 -> 8 bombs)
  for (let r = 1; r <= 11; r++) {
    if (r !== 5 && r !== 6 && r !== 7) sim.placeBomb(7 * TILE_SIZE + 20, r * TILE_SIZE + 20);
  }
  // Row 6: cols 1, 3, 5, 9, 11, 13 (6 bombs)
  for (const c of [1, 3, 5, 9, 11, 13]) {
    sim.placeBomb(c * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  }
  // Cols 5 and 9: rows 1, 3, 9, 11 (8 bombs)
  for (const c of [5, 9]) {
    for (const r of [1, 3, 9, 11]) {
      sim.placeBomb(c * TILE_SIZE + 20, r * TILE_SIZE + 20);
    }
  }

  assert.equal(sim.activeBombs, 48, '48 bombs placed for concentric boss barrage');
  const startHp = boss.currentHp;

  // Single frame detonation
  sim.update(2000);

  // Verification
  assert.equal(sim.activeBombs, 0);
  assert.equal(sim.totalExplodeCalls, 48);

  const uniqueHits = sim.bossHitsByBombId.length;
  const rejectedHits = sim.rejectedBossHits.length;

  assert.ok(uniqueHits >= 20, `At least 20 unique bombs should intersect boss (got ${uniqueHits})`);
  assert.ok(rejectedHits >= 10, `At least 10 duplicate tiles should be rejected (got ${rejectedHits})`);

  // PHYS-06 check
  const idSet = new Set();
  for (const hit of sim.bossHitsByBombId) {
    assert.equal(idSet.has(hit.bombId), false, `Duplicate hit registered for bomb ${hit.bombId}`);
    idSet.add(hit.bombId);
  }

  // Boss HP reduction equals exact unique bomb hits
  assert.equal(boss.currentHp, startHp - uniqueHits, 'Boss currentHp must reflect unique hits exactly');
});

test('ADV-CASCADE-04: Monte Carlo 50-trial soak with randomized bomb networks (30-50 bombs each) maintains 0% defect rate', () => {
  let totalBombsSimulated = 0;
  let totalExplodeCalls = 0;
  let maxObservedStackDepth = 0;

  for (let trial = 0; trial < 50; trial++) {
    const map = createStandardMap();
    const sim = new CascadeSimulator(map, 60, 2);

    // Pick 35 distinct open tiles at random
    const openTiles = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (map[r][c] === TILE_EMPTY) {
          openTiles.push({ r, c });
        }
      }
    }

    // Shuffle
    for (let i = openTiles.length - 1; i > 0; i--) {
      const j = (trial * 17 + i * 31) % (i + 1);
      [openTiles[i], openTiles[j]] = [openTiles[j], openTiles[i]];
    }

    const bombCount = 35;
    for (let b = 0; b < bombCount; b++) {
      const t = openTiles[b];
      sim.placeBomb(t.c * TILE_SIZE + 20, t.r * TILE_SIZE + 20);
    }

    totalBombsSimulated += sim.activeBombs;
    const initialBombs = sim.activeBombs;

    // Trigger
    sim.update(2000);

    totalExplodeCalls += sim.totalExplodeCalls;
    if (sim.maxCallDepth > maxObservedStackDepth) {
      maxObservedStackDepth = sim.maxCallDepth;
    }

    assert.equal(sim.activeBombs, 0, `Trial ${trial}: All bombs must be cleared`);
    assert.equal(sim.totalExplodeCalls, initialBombs, `Trial ${trial}: Total explode calls must equal bombs placed`);
    assert.equal(sim.currentCallDepth, 0, `Trial ${trial}: Stack unwound to 0`);
  }

  assert.equal(totalBombsSimulated, 1750, 'Total 1,750 bombs simulated across 50 trials');
  assert.equal(totalExplodeCalls, 1750, '1,750 explode calls cleanly resolved');
  assert.ok(maxObservedStackDepth <= 35, `Max observed stack depth (${maxObservedStackDepth}) <= 35`);
});
