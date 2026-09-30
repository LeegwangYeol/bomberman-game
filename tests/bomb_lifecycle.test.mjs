import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamicHazard, HazardLifecycleState } from '../src/game/hazards/index.ts';
import { BaseBoss, BossState } from '../src/game/bosses/index.ts';
import { CameraTraumaSimulator } from '../src/game/ultimate_skills.ts';

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

/**
 * Headless Concrete Boss for Chaos Testing
 */
class TestFsmBoss extends BaseBoss {
  constructor(maxHp = 100, x = 300, y = 260) {
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
 * Headless Hit-Stop Test Harness
 */
class HitStopTestHarness {
  constructor() {
    this.isHitStopActive = false;
    this.lastHitStopMs = -9999;
    this.pauseCallCount = 0;
    this.resumeCallCount = 0;
    this.isPhysicsPaused = false;
    this.activeDelayedCalls = [];
  }

  triggerHitStop(nowMs, durationMs = 40) {
    if (this.isHitStopActive || nowMs - this.lastHitStopMs < 150) {
      return false;
    }
    this.isHitStopActive = true;
    this.lastHitStopMs = nowMs;
    this.isPhysicsPaused = true;
    this.pauseCallCount++;

    const call = {
      targetTimeMs: nowMs + durationMs,
      execute: () => {
        this.isPhysicsPaused = false;
        this.resumeCallCount++;
        this.isHitStopActive = false;
      },
    };
    this.activeDelayedCalls.push(call);
    return true;
  }

  advanceTime(currentTimeMs) {
    const pending = this.activeDelayedCalls.filter((c) => c.targetTimeMs <= currentTimeMs);
    this.activeDelayedCalls = this.activeDelayedCalls.filter((c) => c.targetTimeMs > currentTimeMs);
    for (const call of pending) {
      call.execute();
    }
  }
}

/**
 * High-Fidelity Simulator for Bomb Placement, Multi-Stage Fuse, Blast Propagation & Chain Reactions.
 */
class BombLifecycleSimulator {
  constructor(map, maxBombs = 1, bombPower = 2) {
    this.map = map.map(row => [...row]);
    this.maxBombs = maxBombs;
    this.bombPower = bombPower;
    this.activeBombs = 0;
    this.bombs = []; // { id, row, col, x, y, timeElapsed, stage, active, power }
    this.explosions = []; // { row, col, isCenter, bombId }
    this.destroyedBlocks = [];
    this.destroyedBlocksThisTick = new Set();
    this.nextId = 1;

    // Subsystem extensions
    this.dynamicHazard = null;
    this.boss = null;
    this.bossHitBombIds = new Set();
    this.bossHitsByBombId = [];
    this.rejectedBossHits = [];

    // Call stack & recursion profiling
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

    // Reject if tile already has an active bomb
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

      // Stage 1 (0-1000ms): Normal Rhythmic Pulse (1.15x scale, 0xffffff tint)
      if (bomb.timeElapsed < 1000) {
        bomb.stage = 1;
        bomb.tint = 0xffffff;
        bomb.scale = 1.15;
      }
      // Stage 2 (1000-1600ms): Accelerated Warning Pulse (1.25x scale, 0xff8866 amber)
      else if (bomb.timeElapsed < 1600) {
        bomb.stage = 2;
        bomb.tint = 0xff8866;
        bomb.scale = 1.25;
      }
      // Stage 3 (1600-2000ms): Critical Detonation Swell (1.35x scale, 0xff2222 red)
      else if (bomb.timeElapsed < 2000) {
        bomb.stage = 3;
        bomb.tint = 0xff2222;
        bomb.scale = 1.35;
      }
      // 2000ms: Detonation
      else {
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

      // Dynamic Hazard: Tachyon Overcharge (+2 power if detonating within active beam)
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

      // Epicenter explosion
      this.explosions.push({ row: bomb.row, col: bomb.col, isCenter: true, bombId: bomb.id });
      this.checkBossHit(bomb.row, bomb.col, bomb.id);

      // Spire polarization check on epicenter
      if (this.dynamicHazard) {
        this.dynamicHazard.onBombBlastImpact(bomb.row, bomb.col);
      }

      // Epicenter chain reaction: detonate any other active bombs stacked on the same tile
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
          if (this.map[nr][nc] === TILE_WALL) break; // Halts on indestructible wall

          // PHYS-05: Prevent simultaneous blast ray piercing through destroyed blocks
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

          // Empty tile: explosion continues
          this.explosions.push({ row: nr, col: nc, isCenter: false, bombId: bomb.id });
          this.checkBossHit(nr, nc, bomb.id);
          if (this.dynamicHazard) {
            this.dynamicHazard.onBombBlastImpact(nr, nc);
          }

          // Check for chain reaction with other bombs (snapshot targets to prevent iteration mutation skips)
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

test('Bomb Lifecycle: Grid snapping places bomb accurately at tile center', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 2, 2);

  // Player at (58, 62) -> row 1, col 1 -> center should be (60, 60)
  const b1 = sim.placeBomb(58, 62);
  assert.ok(b1);
  assert.equal(b1.row, 1);
  assert.equal(b1.col, 1);
  assert.equal(b1.x, 60);
  assert.equal(b1.y, 60);
});

test('Bomb Placement: Duplicate bomb on same tile is rejected', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 3, 2);

  const b1 = sim.placeBomb(60, 60);
  assert.ok(b1);
  assert.equal(sim.activeBombs, 1);

  // Attempting second bomb on same tile (1,1)
  const b2 = sim.placeBomb(65, 55);
  assert.equal(b2, null, 'Duplicate bomb on same tile should be rejected');
  assert.equal(sim.activeBombs, 1);
});

test('Bomb Placement: Max bombs capacity is strictly enforced', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 1, 2); // maxBombs = 1

  const b1 = sim.placeBomb(60, 60); // (1, 1)
  assert.ok(b1);
  assert.equal(sim.activeBombs, 1);

  // Attempting bomb on different tile (1, 2)
  const b2 = sim.placeBomb(100, 60);
  assert.equal(b2, null, 'Cannot exceed maxBombs');
  assert.equal(sim.activeBombs, 1);
});

test('Multi-Stage Accelerating Ticking: Stage 1 (0-1000ms), Stage 2 (1000-1600ms), Stage 3 (1600-2000ms)', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 1, 2);
  const bomb = sim.placeBomb(60, 60);

  // Initial State (t = 0)
  assert.equal(bomb.stage, 1);
  assert.equal(bomb.tint, 0xffffff);
  assert.equal(bomb.scale, 1.15);

  // Advance to 500ms (Stage 1)
  sim.update(500);
  assert.equal(bomb.stage, 1);
  assert.equal(bomb.tint, 0xffffff);

  // Advance to 1050ms (Stage 2 - Accelerated Warning)
  sim.update(550);
  assert.equal(bomb.stage, 2);
  assert.equal(bomb.tint, 0xff8866, 'Stage 2 amber tint');
  assert.equal(bomb.scale, 1.25);

  // Advance to 1700ms (Stage 3 - Critical Detonation Swell)
  sim.update(650);
  assert.equal(bomb.stage, 3);
  assert.equal(bomb.tint, 0xff2222, 'Stage 3 red alert tint');
  assert.equal(bomb.scale, 1.35);

  // Advance to 2000ms (Detonation)
  sim.update(300);
  assert.equal(bomb.active, false, 'Bomb detonated at 2000ms');
  assert.equal(sim.activeBombs, 0);
  assert.ok(sim.explosions.length > 0, 'Explosions spawned');
});

test('Blast Propagation: Wall stops raycast, block is destroyed, empty propagates full power', () => {
  const map = createStandardMap();
  // Place a block at (1, 3)
  map[1][3] = TILE_BLOCK;

  const sim = new BombLifecycleSimulator(map, 1, 2); // bombPower = 2
  // Place bomb at (1, 1)
  sim.placeBomb(60, 60);

  // Detonate
  sim.update(2000);

  // Center (1, 1) exploded
  assert.ok(sim.explosions.some(e => e.row === 1 && e.col === 1 && e.isCenter));

  // Up: (0, 1) is TILE_WALL -> ray stops immediately, no explosion at (0, 1)
  assert.ok(!sim.explosions.some(e => e.row === 0 && e.col === 1));

  // Left: (1, 0) is TILE_WALL -> ray stops immediately
  assert.ok(!sim.explosions.some(e => e.row === 1 && e.col === 0));

  // Down: (2, 1) is TILE_EMPTY -> exploded; (3, 1) is TILE_EMPTY -> exploded (power = 2)
  assert.ok(sim.explosions.some(e => e.row === 2 && e.col === 1));
  assert.ok(sim.explosions.some(e => e.row === 3 && e.col === 1));

  // Right: (1, 2) is TILE_EMPTY -> exploded; (1, 3) is TILE_BLOCK -> block destroyed and ray stops
  assert.ok(sim.explosions.some(e => e.row === 1 && e.col === 2));
  assert.ok(sim.explosions.some(e => e.row === 1 && e.col === 3));
  assert.equal(sim.map[1][3], TILE_EMPTY, 'Block at (1, 3) cleared to empty');
  assert.ok(sim.destroyedBlocks.some(d => d.row === 1 && d.col === 3));

  // (1, 4) should NOT have exploded because block stopped the ray
  assert.ok(!sim.explosions.some(e => e.row === 1 && e.col === 4));
});

test('Chain Detonation: Explosion hitting another bomb detonates it immediately', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 2, 2);

  // Bomb 1 at (1, 1)
  const b1 = sim.placeBomb(60, 60);
  // Bomb 2 at (1, 2)
  const b2 = sim.placeBomb(100, 60);

  assert.equal(sim.activeBombs, 2);

  // Advance 2000ms to detonate Bomb 1
  sim.update(2000);

  // Bomb 1 blast reached (1, 2) and triggered immediate chain detonation of Bomb 2
  assert.equal(b1.active, false);
  assert.equal(b2.active, false);
  assert.equal(sim.activeBombs, 0, 'Both bombs in chain reaction cleanly cleared');

  // Both epicenters exploded
  assert.ok(sim.explosions.some(e => e.row === 1 && e.col === 1 && e.isCenter));
  assert.ok(sim.explosions.some(e => e.row === 1 && e.col === 2 && e.isCenter));
});

/* ==============================================================================
 * SUITE: DEFENSIVE TESTS (PHYS-01, PHYS-02, PHYS-04, PHYS-05, PHYS-06)
 * ============================================================================== */

test('PHYS-01: Extra life revival grants 3000ms i-frames and resets isInvulnerable to false', () => {
  let extraLives = 1;
  let isInvulnerable = false;
  let shieldInvulnerableUntil = 0;
  let currentTime = 10000;

  function playerDie() {
    if (isInvulnerable) return;
    if (extraLives > 0) {
      extraLives--;
      isInvulnerable = true;
      shieldInvulnerableUntil = currentTime + 3000;
      return;
    }
  }

  function updateVulnerability(now) {
    if (isInvulnerable && now >= shieldInvulnerableUntil) {
      isInvulnerable = false;
    }
  }

  // Fatal hit at t = 10000
  playerDie();
  assert.equal(extraLives, 0);
  assert.equal(isInvulnerable, true, 'Player should be invulnerable immediately after 1-UP');
  assert.equal(shieldInvulnerableUntil, 13000);

  // During 3000ms window (t = 11500)
  updateVulnerability(11500);
  assert.equal(isInvulnerable, true, 'Must remain invulnerable during 3000ms window');

  // After 3000ms expires (t = 13000)
  updateVulnerability(13000);
  assert.equal(isInvulnerable, false, 'isInvulnerable must reset to false after 3000ms');

  // Next fatal hit without extra lives kills player
  let gameOver = false;
  function playerDieFinal() {
    if (isInvulnerable) return;
    if (extraLives === 0) {
      gameOver = true;
    }
  }
  playerDieFinal();
  assert.equal(gameOver, true, 'Vulnerability restored cleanly; player is not in permanent god-mode');
});

test('PHYS-02: Kicked / drifted bomb detonates at current sprite position, not placement closure', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 1, 2);

  // Place bomb at (1, 1) [x = 60, y = 60]
  const b = sim.placeBomb(60, 60);
  assert.equal(b.row, 1);
  assert.equal(b.col, 1);

  // Simulate kicking the bomb 4 tiles to the right: comes to rest at (1, 5) [x = 220, y = 60]
  b.x = 220;
  b.y = 60;
  // Dynamic update of row/col matching GameScene.ts explodeBomb(bomb)
  b.col = Math.floor(b.x / TILE_SIZE); // 5
  b.row = Math.floor(b.y / TILE_SIZE); // 1

  // Detonate
  sim.update(2000);

  // Epicenter MUST be at (1, 5), NOT at original placement tile (1, 1)
  assert.ok(
    sim.explosions.some(e => e.row === 1 && e.col === 5 && e.isCenter),
    'Epicenter must be at current sprite tile (1, 5)'
  );
  assert.ok(
    !sim.explosions.some(e => e.row === 1 && e.col === 1 && e.isCenter),
    'Old placement tile (1, 1) must NOT explode'
  );
});

test('PHYS-04: 36x36 explosion body with 2px inset eliminates diagonal blast damage behind solid corner pillars', () => {
  // Indestructible pillar at (2, 2) spanning x: [80, 120], y: [80, 120]
  // Blast epicenter at (1, 2), center = (100, 60)
  const blastCenter = { x: 100, y: 60 };

  // 1. Unadjusted 40x40 body: [80, 120] x [40, 80]
  const unadjustedAABB = {
    left: blastCenter.x - 20,
    right: blastCenter.x + 20,
    top: blastCenter.y - 20,
    bottom: blastCenter.y + 20,
  };
  assert.equal(unadjustedAABB.right, 120);
  assert.equal(unadjustedAABB.bottom, 80);

  // 2. Remediated 36x36 body with 2px inset: [82, 118] x [42, 78]
  const remediatedAABB = {
    left: blastCenter.x - 18,
    right: blastCenter.x + 18,
    top: blastCenter.y - 18,
    bottom: blastCenter.y + 18,
  };
  assert.equal(remediatedAABB.right, 118);
  assert.equal(remediatedAABB.bottom, 78);

  // Entity rounding corner in East corridor (2, 3), center = (130, 90), 24x24 hitbox (radius 12)
  const entityAABB = {
    left: 130 - 12, // 118
    right: 130 + 12, // 142
    top: 90 - 12, // 78
    bottom: 90 + 12, // 102
  };

  function checkOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  // Without 2px inset: diagonal leakage bug hits entity through pillar corner!
  assert.equal(
    checkOverlap(unadjustedAABB, entityAABB),
    true,
    '40x40 body incorrectly leaks diagonally across pillar corner'
  );

  // With 36x36 2px inset: diagonal leakage is mathematically eliminated!
  assert.equal(
    checkOverlap(remediatedAABB, entityAABB),
    false,
    '36x36 body with 2px inset cleanly shields entity behind solid pillar'
  );
});

test('PHYS-05: Simultaneous blast rays terminate cleanly at soft blocks without piercing', () => {
  const map = createStandardMap();
  map[2][1] = TILE_BLOCK; // Soft block separating (1, 1) and (3, 1)

  const destroyedBlocksThisTick = new Set();
  const raycastHitsA = [];
  const raycastHitsB = [];

  // Bomb A at (1, 1) shoots downwards with power = 3
  function traceRay(startR, startC, dr, dc, power, hits) {
    for (let i = 1; i <= power; i++) {
      const nr = startR + dr * i;
      const nc = startC + dc * i;
      const key = `${nr},${nc}`;
      const isBlock = map[nr][nc] === TILE_BLOCK || destroyedBlocksThisTick.has(key);

      if (isBlock) {
        destroyedBlocksThisTick.add(key);
        map[nr][nc] = TILE_EMPTY; // Block destroyed
        hits.push({ r: nr, c: nc, type: 'block_hit' });
        break; // Ray terminates
      }
      hits.push({ r: nr, c: nc, type: 'empty_hit' });
    }
  }

  // Trace Bomb A down
  traceRay(1, 1, 1, 0, 3, raycastHitsA);
  assert.equal(raycastHitsA.length, 1);
  assert.equal(raycastHitsA[0].r, 2);
  assert.equal(raycastHitsA[0].c, 1);
  assert.equal(raycastHitsA[0].type, 'block_hit');

  // In the same tick, trace Bomb B at (3, 1) shooting upwards
  traceRay(3, 1, -1, 0, 3, raycastHitsB);
  assert.equal(raycastHitsB.length, 1);
  assert.equal(raycastHitsB[0].r, 2);
  assert.equal(raycastHitsB[0].c, 1);
  assert.equal(raycastHitsB[0].type, 'block_hit');

  // Neither ray pierced through (2, 1) to strike opposite bomb source
  assert.ok(!raycastHitsA.some(h => h.r === 3 && h.c === 1), 'Bomb A ray must not pierce to (3, 1)');
  assert.ok(!raycastHitsB.some(h => h.r === 1 && h.c === 1), 'Bomb B ray must not pierce to (1, 1)');
});

test('PHYS-06: Single bomb blast damages active boss exactly once despite multiple overlapping explosion tiles', () => {
  // Model Boss HP and bomb hit tracking
  let bossHp = 10;
  const bossHitBombIds = new Set();

  function onExplosionTileNearBoss(tileX, tileY, bombId) {
    // Boss collider circle at (100, 100), radius 35 (+20 = 55px reach)
    const dist = Math.hypot(tileX - 100, tileY - 100);
    if (dist < 55) {
      if (!bombId || !bossHitBombIds.has(bombId)) {
        if (bombId) bossHitBombIds.add(bombId);
        bossHp -= 1; // Take 1 damage
        return true;
      }
    }
    return false;
  }

  const bombId = 'bomb_test_phys_06';

  // Bomb blast spawns 3 tiles close to boss:
  // 1. Epicenter at (80, 80) -> dist = 28.2px (< 55)
  const hit1 = onExplosionTileNearBoss(80, 80, bombId);
  assert.equal(hit1, true);
  assert.equal(bossHp, 9);

  // 2. Arm tile 1 at (100, 60) -> dist = 40.0px (< 55)
  const hit2 = onExplosionTileNearBoss(100, 60, bombId);
  assert.equal(hit2, false, 'Second tile from same bombId must be rejected');
  assert.equal(bossHp, 9, 'Boss HP must remain 9 (no multi-hit)');

  // 3. Arm tile 2 at (60, 100) -> dist = 40.0px (< 55)
  const hit3 = onExplosionTileNearBoss(60, 100, bombId);
  assert.equal(hit3, false, 'Third tile from same bombId must be rejected');
  assert.equal(bossHp, 9, 'Boss HP must remain 9');

  // Different bomb detonates later
  const hitOtherBomb = onExplosionTileNearBoss(80, 80, 'bomb_other_02');
  assert.equal(hitOtherBomb, true, 'Different bombId is accepted');
  assert.equal(bossHp, 8);
});

/* ==============================================================================
 * SUITE: CHAOS QA AGENT 5 - BOMB CASCADES, ATOMIC BREAK & HARD WALL AUDIT
 * ============================================================================== */

test('CHAOS-05-01: Simultaneous opposing detonations resolve deterministically with atomic soft block destruction', () => {
  const map = createStandardMap();
  map[1][2] = TILE_BLOCK; // Soft block separating (1, 1) and (1, 3)

  const sim = new BombLifecycleSimulator(map, 2, 3); // power = 3

  // Place Bomb A at (1, 1) and Bomb B at (1, 3)
  const bA = sim.placeBomb(60, 60);  // (1, 1)
  const bB = sim.placeBomb(140, 60); // (1, 3)
  assert.ok(bA && bB);
  assert.equal(sim.activeBombs, 2);

  // Both bombs detonate simultaneously at t = 2000ms
  sim.update(2000);

  // 1. Both bombs cleanly deactivated
  assert.equal(bA.active, false);
  assert.equal(bB.active, false);
  assert.equal(sim.activeBombs, 0);

  // 2. Soft block destroyed atomically (exactly 1 destruction record)
  assert.equal(sim.destroyedBlocks.length, 1);
  assert.equal(sim.destroyedBlocks[0].row, 1);
  assert.equal(sim.destroyedBlocks[0].col, 2);
  assert.equal(sim.map[1][2], TILE_EMPTY);

  // 3. Rays terminate at the soft block (1, 2) without piercing through to opposing bomb
  // Bomb A ray moving right (dr=0, dc=1): (1, 2) hit, should NOT reach (1, 3) or (1, 4)
  // Bomb B ray moving left (dr=0, dc=-1): (1, 2) hit, should NOT reach (1, 1) or (1, 0)
  const nonCenterExplosionsAt1_3 = sim.explosions.filter(e => e.row === 1 && e.col === 3 && !e.isCenter);
  const nonCenterExplosionsAt1_1 = sim.explosions.filter(e => e.row === 1 && e.col === 1 && !e.isCenter);
  assert.equal(nonCenterExplosionsAt1_3.length, 0, 'Bomb A ray must not penetrate soft block into (1, 3)');
  assert.equal(nonCenterExplosionsAt1_1.length, 0, 'Bomb B ray must not penetrate soft block into (1, 1)');
});

test('CHAOS-05-02: 4-way simultaneous blast wave cascade on a single soft block breaks it atomically exactly once without piercing', () => {
  const map = createStandardMap();
  // (3, 3) is surrounded by valid corridors: (2, 3) North, (4, 3) South, (3, 2) West, (3, 4) East
  map[3][3] = TILE_BLOCK;

  const sim = new BombLifecycleSimulator(map, 4, 3); // power = 3

  const bNorth = sim.placeBomb(3 * TILE_SIZE + 20, 2 * TILE_SIZE + 20); // (2, 3)
  const bSouth = sim.placeBomb(3 * TILE_SIZE + 20, 4 * TILE_SIZE + 20); // (4, 3)
  const bWest  = sim.placeBomb(2 * TILE_SIZE + 20, 3 * TILE_SIZE + 20); // (3, 2)
  const bEast  = sim.placeBomb(4 * TILE_SIZE + 20, 3 * TILE_SIZE + 20); // (3, 4)
  assert.ok(bNorth && bSouth && bWest && bEast);
  assert.equal(sim.activeBombs, 4);

  // Detonate all 4 simultaneously at t = 2000ms
  sim.update(2000);

  // 1. All 4 bombs cleanly cleared
  assert.equal(sim.activeBombs, 0);

  // 2. Soft block at (3, 3) destroyed atomically (exactly 1 record)
  assert.equal(sim.destroyedBlocks.length, 1, 'Block must be destroyed exactly once across all 4 converging rays');
  assert.equal(sim.destroyedBlocks[0].row, 3);
  assert.equal(sim.destroyedBlocks[0].col, 3);
  assert.equal(sim.map[3][3], TILE_EMPTY);

  // 3. No ray pierces across (3, 3) to strike opposite bomb tiles
  // For example, North bomb ray (downwards) must stop at (3, 3) and not hit (4, 3) as a non-center blast
  const northRayAtSouth = sim.explosions.filter(e => e.row === 4 && e.col === 3 && !e.isCenter);
  const southRayAtNorth = sim.explosions.filter(e => e.row === 2 && e.col === 3 && !e.isCenter);
  const westRayAtEast   = sim.explosions.filter(e => e.row === 3 && e.col === 4 && !e.isCenter);
  const eastRayAtWest   = sim.explosions.filter(e => e.row === 3 && e.col === 2 && !e.isCenter);

  assert.equal(northRayAtSouth.length, 0, 'North ray must terminate at block (3, 3) without piercing South');
  assert.equal(southRayAtNorth.length, 0, 'South ray must terminate at block (3, 3) without piercing North');
  assert.equal(westRayAtEast.length, 0, 'West ray must terminate at block (3, 3) without piercing East');
  assert.equal(eastRayAtWest.length, 0, 'East ray must terminate at block (3, 3) without piercing West');
});

test('CHAOS-05-03: Contiguous 8-bomb chain reaction cascades in single tick deterministically without duplicate epicenters or re-entrancy leaks', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 8, 2); // power = 2

  // Place 8 bombs along corridor row 1: cols 1 through 8
  const bombs = [];
  for (let c = 1; c <= 8; c++) {
    const b = sim.placeBomb(c * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
    assert.ok(b, `Bomb at col ${c} placed`);
    bombs.push(b);
  }
  assert.equal(sim.activeBombs, 8);

  // Trigger cascade by advancing to 2000ms
  sim.update(2000);

  // 1. All 8 bombs must be deactivated
  assert.equal(sim.activeBombs, 0, 'All 8 bombs in cascade must be deactivated');
  for (let i = 0; i < 8; i++) {
    assert.equal(bombs[i].active, false, `Bomb ${i + 1} must be deactivated`);
  }

  // 2. Exactly 8 epicenter explosions must be spawned (1 per bomb)
  const centerExplosions = sim.explosions.filter(e => e.isCenter);
  assert.equal(centerExplosions.length, 8, 'Exactly 8 epicenter explosions spawned');

  // Verify unique coordinates for each epicenter
  const centerCoords = new Set(centerExplosions.map(e => `${e.row},${e.col}`));
  assert.equal(centerCoords.size, 8, 'All 8 epicenters must occupy unique tiles');
  for (let c = 1; c <= 8; c++) {
    assert.ok(centerCoords.has(`1,${c}`), `Tile (1, ${c}) must have an epicenter explosion`);
  }
});

test('CHAOS-05-04: Maximum power blast raycasts (power = 8 and power = 15) terminate strictly at outer walls and interior pillars without wall damage or bounds escape', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 2, 15); // extreme power = 15

  // Place bomb at (1, 1)
  sim.placeBomb(60, 60);

  // Detonate
  sim.update(2000);

  // Verify all explosions are within playable open boundaries
  for (const exp of sim.explosions) {
    // 1. Must never be outside grid bounds
    assert.ok(exp.row >= 0 && exp.row < ROWS, `Row ${exp.row} must be within bounds`);
    assert.ok(exp.col >= 0 && exp.col < COLS, `Col ${exp.col} must be within bounds`);

    // 2. Must NEVER be spawned on an indestructible wall
    assert.notEqual(
      map[exp.row][exp.col],
      TILE_WALL,
      `Explosion must never spawn on wall tile (${exp.row}, ${exp.col})`
    );

    // 3. Perimeter walls (row 0, row ROWS-1, col 0, col COLS-1) must never contain explosions
    assert.ok(exp.row > 0 && exp.row < ROWS - 1, `Explosion row ${exp.row} cannot be outer perimeter wall`);
    assert.ok(exp.col > 0 && exp.col < COLS - 1, `Explosion col ${exp.col} cannot be outer perimeter wall`);
  }

  // Verify interior pillars are unmarred
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r % 2 === 0 && c % 2 === 0) {
        assert.equal(map[r][c], TILE_WALL, `Interior pillar at (${r}, ${c}) must remain intact`);
      }
    }
  }
});

test('CHAOS-05-05: Kicked bomb sliding into active chain reaction detonates at current grid coordinates and triggers secondary cascades deterministically', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 3, 3); // power = 3

  // Bomb 1 at (1, 1)
  const b1 = sim.placeBomb(60, 60);
  // Bomb 2 at (1, 2)
  const b2 = sim.placeBomb(100, 60);
  // Bomb 3 at (1, 6)
  const b3 = sim.placeBomb(260, 60);

  // Simulate kicking Bomb 2 to the right, sliding from (1, 2) to (1, 4)
  b2.x = 4 * TILE_SIZE + 20; // 180
  b2.y = 1 * TILE_SIZE + 20; // 60
  b2.col = 4;
  b2.row = 1;

  // Bomb 1 reaches 2000ms and detonates
  sim.update(2000);

  // Bomb 1 at (1, 1) with power 3 reaches:
  // (1, 2) [empty, was old b2 pos]
  // (1, 3) [empty]
  // (1, 4) [hits b2 at its NEW position!] -> triggers chain detonation of Bomb 2!
  // Bomb 2 at (1, 4) with power 3 reaches:
  // (1, 5) [empty]
  // (1, 6) [hits b3!] -> triggers chain detonation of Bomb 3!
  assert.equal(b1.active, false);
  assert.equal(b2.active, false);
  assert.equal(b3.active, false);
  assert.equal(sim.activeBombs, 0);

  // Verify Bomb 2 epicenter is at (1, 4) and Bomb 3 epicenter is at (1, 6)
  assert.ok(
    sim.explosions.some(e => e.row === 1 && e.col === 4 && e.isCenter),
    'Bomb 2 epicenter must be at current position (1, 4)'
  );
  assert.ok(
    sim.explosions.some(e => e.row === 1 && e.col === 6 && e.isCenter),
    'Bomb 3 epicenter must be at position (1, 6)'
  );
  assert.ok(
    !sim.explosions.some(e => e.row === 1 && e.col === 2 && e.isCenter),
    'Old Bomb 2 tile (1, 2) must NOT be an epicenter'
  );
});

test('CHAOS-05-06: 35-bomb interlocking cross-grid cascade with Dynamic Hazard beams executes with zero recursion overflow and finite call depth', () => {
  const map = createStandardMap();
  const hazard = new DynamicHazard();
  hazard.init(map);
  hazard.start('CLIMAX');
  hazard.update(2000); // Transition COOLDOWN -> TELEGRAPH
  hazard.update(2000); // Transition TELEGRAPH -> ACTIVE
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  const sim = new BombLifecycleSimulator(map, 50, 2);
  sim.dynamicHazard = hazard;

  // Interlocking cross-grid layout:
  // Row 5: cols 1 through 13 (13 bombs)
  for (let c = 1; c <= 13; c++) {
    sim.placeBomb(c * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  }
  // Col 7: rows 1 through 11 (skip (5, 7) already placed -> 10 bombs)
  for (let r = 1; r <= 11; r++) {
    if (r !== 5) {
      sim.placeBomb(7 * TILE_SIZE + 20, r * TILE_SIZE + 20);
    }
  }
  // Row 6 (Hazard horizontal beam): cols 1, 3, 5, 9, 11, 13 (6 bombs)
  for (const c of [1, 3, 5, 9, 11, 13]) {
    sim.placeBomb(c * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  }
  // Row 7: cols 1, 3, 5, 9, 11, 13 (6 bombs)
  for (const c of [1, 3, 5, 9, 11, 13]) {
    sim.placeBomb(c * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  }

  assert.equal(sim.activeBombs, 35, 'Exactly 35 bombs placed in interlocking cross layout');

  // Trigger cascade
  sim.update(2000);

  // 1. All 35 bombs must cleanly deactivate
  assert.equal(sim.activeBombs, 0, 'All 35 bombs must be deactivated');

  // 2. Call stack & recursion invariants:
  assert.equal(sim.totalExplodeCalls, 35, 'Each bomb exploded exactly once');
  assert.ok(sim.maxCallDepth > 0 && sim.maxCallDepth <= 35, `Max call depth (${sim.maxCallDepth}) must be <= total bombs`);
  assert.equal(sim.currentCallDepth, 0, 'Call stack must unwind completely to depth 0');

  // 3. Exactly 35 unique epicenter explosions
  const centerExps = sim.explosions.filter(e => e.isCenter);
  assert.equal(centerExps.length, 35, 'Exactly 35 epicenter explosions spawned');
  const uniqueCenterCoords = new Set(centerExps.map(e => `${e.row},${e.col}`));
  assert.equal(uniqueCenterCoords.size, 35, 'All 35 epicenters must be distinct coordinates');

  // 4. Polarization of spires occurred from blast wave intersections
  const anyPolarized = hazard['spires'].some(s => s.isPolarized);
  assert.equal(anyPolarized, true, 'At least one Spire crystal was polarized by blast wave impact');
});

test('CHAOS-05-07: PHYS-06 strict invariant under 40-bomb dense cross-blast intersection verifies each bomb ID damages boss exactly once', () => {
  const map = createStandardMap();
  const hazard = new DynamicHazard();
  hazard.init(map);
  hazard.start('CLIMAX');
  hazard.update(2000);
  hazard.update(2000);
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  // Concrete boss placed at Nexus corridor intersection (row 6, col 7) -> (300, 260)
  const boss = new TestFsmBoss(200, 7 * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  assert.equal(boss.bossState, BossState.PHASE_1);
  assert.equal(boss.isInvulnerable, false);
  const startHp = boss.currentHp;

  const sim = new BombLifecycleSimulator(map, 60, 2);
  sim.dynamicHazard = hazard;
  sim.boss = boss;

  // Place 40 bombs across multiple intersecting corridors:
  // Row 5: cols 1 through 13 (13)
  for (let c = 1; c <= 13; c++) sim.placeBomb(c * TILE_SIZE + 20, 5 * TILE_SIZE + 20);
  // Row 7: cols 1 through 13 (13)
  for (let c = 1; c <= 13; c++) sim.placeBomb(c * TILE_SIZE + 20, 7 * TILE_SIZE + 20);
  // Col 7: rows 1 through 11 (skip 5 and 7 which already have bombs, skip 6 which is boss) (8)
  for (let r = 1; r <= 11; r++) {
    if (r !== 5 && r !== 6 && r !== 7) sim.placeBomb(7 * TILE_SIZE + 20, r * TILE_SIZE + 20);
  }
  // Row 6: cols 1, 3, 5, 9, 11, 13 (6)
  for (const c of [1, 3, 5, 9, 11, 13]) sim.placeBomb(c * TILE_SIZE + 20, 6 * TILE_SIZE + 20);

  assert.equal(sim.activeBombs, 40, '40 bombs positioned for dense boss intersection barrage');

  // Detonate all bombs via cascade
  sim.update(2000);

  // 1. All bombs cleared
  assert.equal(sim.activeBombs, 0);
  assert.equal(sim.totalExplodeCalls, 40);

  // 2. Boss damage verification
  const uniqueHits = sim.bossHitsByBombId.length;
  const rejectedHits = sim.rejectedBossHits.length;
  const totalBossBlastIntersections = uniqueHits + rejectedHits;
  assert.ok(totalBossBlastIntersections > 0, 'Must have recorded blast intersections');
  assert.ok(rejectedHits > 0, `Multiple blast tiles from the same bombs should be rejected (got ${rejectedHits})`);

  // 3. PHYS-06 Invariant: Each bomb ID damages boss EXACTLY ONCE
  const hitIds = sim.bossHitsByBombId.map(h => h.bombId);
  const uniqueHitIds = new Set(hitIds);
  assert.equal(uniqueHitIds.size, uniqueHits, 'All registered boss hits must originate from distinct bomb IDs');

  // Verify every rejected hit came from a bombId already in uniqueHitIds
  for (const rej of sim.rejectedBossHits) {
    assert.ok(uniqueHitIds.has(rej.bombId), `Rejected hit from ${rej.bombId} must already have registered an earlier hit`);
  }

  // 4. Exact HP arithmetic check
  const actualDamageTaken = startHp - boss.currentHp;
  assert.equal(actualDamageTaken, uniqueHits, 'Boss HP reduction must equal the exact number of unique bomb IDs, not total tiles');
});

test('CHAOS-05-08: Dual Tachyon Overcharge (+2 power) and Spire Polarization during 40-bomb chain cascade maintains deterministic blast bounds and zero re-entrancy', () => {
  const map = createStandardMap();
  const hazard = new DynamicHazard();
  hazard.init(map);
  hazard.start('CLIMAX');
  hazard.update(2000);
  hazard.update(2000);

  const sim = new BombLifecycleSimulator(map, 50, 2);
  sim.dynamicHazard = hazard;

  // Place bombs on active Tachyon beam: Row 6, cols 1, 3, 5, 7, 9, 11, 13
  for (const c of [1, 3, 5, 7, 9, 11, 13]) {
    sim.placeBomb(c * TILE_SIZE + 20, 6 * TILE_SIZE + 20);
  }
  // Place bombs on Col 7 (vertical beam): rows 1, 3, 5, 7, 9, 11
  for (const r of [1, 3, 5, 7, 9, 11]) {
    sim.placeBomb(7 * TILE_SIZE + 20, r * TILE_SIZE + 20);
  }

  assert.equal(sim.activeBombs, 13);
  sim.update(2000);

  assert.equal(sim.activeBombs, 0);

  // Invariant: No explosion ever spawned on outer wall or interior pillars, despite +2 Tachyon overcharge
  for (const exp of sim.explosions) {
    assert.notEqual(map[exp.row][exp.col], TILE_WALL, `Explosion spawned on wall tile (${exp.row}, ${exp.col})`);
    assert.ok(exp.row > 0 && exp.row < ROWS - 1, 'Row out of bounds');
    assert.ok(exp.col > 0 && exp.col < COLS - 1, 'Col out of bounds');
  }
});

test('CHAOS-05-09: Closed-loop cyclic bomb graph (mutual triggers) resolves deterministically with zero infinite recursion', () => {
  const map = createStandardMap();
  const sim = new BombLifecycleSimulator(map, 10, 3); // power = 3

  // 4 bombs in a mutual trigger loop in open corridor junction:
  // (1, 1), (1, 3), (3, 3), (3, 1)
  sim.placeBomb(1 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  sim.placeBomb(3 * TILE_SIZE + 20, 1 * TILE_SIZE + 20);
  sim.placeBomb(3 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);
  sim.placeBomb(1 * TILE_SIZE + 20, 3 * TILE_SIZE + 20);

  assert.equal(sim.activeBombs, 4);

  // Detonate Bomb 1 at t=2000ms
  sim.update(2000);

  // All 4 bombs should detonate in the chain reaction
  assert.equal(sim.activeBombs, 0, 'All 4 cyclic bombs cleared');
  assert.equal(sim.totalExplodeCalls, 4, 'Each bomb in cycle detonated exactly once (no cyclic re-entrancy)');
  assert.ok(sim.maxCallDepth <= 4, `Max call depth (${sim.maxCallDepth}) must be <= 4`);
  assert.equal(sim.currentCallDepth, 0, 'Call depth cleanly returned to 0');
});

test('CHAOS-05-10: 50-bomb simultaneous detonation with HitStop debounce and Camera Trauma simulator maintains bounded pause and clamped trauma', () => {
  const traumaSim = new CameraTraumaSimulator(18, 3.5, 1.4);
  const hitStopHarness = new HitStopTestHarness();
  const nowMs = 5000;

  let acceptedHitStops = 0;
  let rejectedHitStops = 0;

  // 50 bombs explode in the very same frame
  for (let i = 0; i < 50; i++) {
    traumaSim.addTrauma(0.35);
    const accepted = hitStopHarness.triggerHitStop(nowMs, 35);
    if (accepted) {
      acceptedHitStops++;
    } else {
      rejectedHitStops++;
    }
  }

  // Hit-Stop invariants
  assert.equal(acceptedHitStops, 1, 'Exactly 1 hit-stop trigger permitted among 50 simultaneous detonations');
  assert.equal(rejectedHitStops, 49, '49 simultaneous triggers debounced');
  assert.equal(hitStopHarness.isPhysicsPaused, true, 'Physics paused');

  // Advance time to conclude hit-stop
  hitStopHarness.advanceTime(nowMs + 35);
  assert.equal(hitStopHarness.isPhysicsPaused, false, 'Physics resumed cleanly');

  // Camera trauma invariants
  assert.equal(traumaSim.trauma, 1.0, 'Trauma saturated at strictly 1.0');
  const mag = traumaSim.getShakeMagnitude();
  assert.equal(mag.offsetPx, 18.0, 'Offset clamped at maxOffset');
  assert.equal(mag.angleDeg, 3.5, 'Angle clamped at maxAngle');

  // 60 frames (1.0 sec) decay
  for (let f = 0; f < 60; f++) {
    traumaSim.update(1 / 60);
  }
  assert.equal(traumaSim.trauma, 0.0, 'Trauma decayed to 0.0');
});

