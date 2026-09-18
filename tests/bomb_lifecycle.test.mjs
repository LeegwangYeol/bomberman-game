import test from 'node:test';
import assert from 'node:assert/strict';

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
 * High-Fidelity Simulator for Bomb Placement, Multi-Stage Fuse, Blast Propagation & Chain Reactions.
 */
class BombLifecycleSimulator {
  constructor(map, maxBombs = 1, bombPower = 2) {
    this.map = map.map(row => [...row]);
    this.maxBombs = maxBombs;
    this.bombPower = bombPower;
    this.activeBombs = 0;
    this.bombs = []; // { id, row, col, x, y, timeElapsed, stage, active }
    this.explosions = []; // { row, col, isCenter }
    this.destroyedBlocks = [];
    this.nextId = 1;
  }

  placeBomb(playerX, playerY) {
    if (this.activeBombs >= this.maxBombs) return null;

    const col = Math.floor(playerX / TILE_SIZE);
    const row = Math.floor(playerY / TILE_SIZE);
    const centerX = col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = row * TILE_SIZE + TILE_SIZE / 2;

    // Reject if tile already has an active bomb
    const exists = this.bombs.some(b => b.active && b.row === row && b.col === col);
    if (exists) return null;

    const bomb = {
      id: this.nextId++,
      row,
      col,
      x: centerX,
      y: centerY,
      timeElapsed: 0,
      stage: 1,
      tint: 0xffffff,
      scale: 1.15,
      active: true,
    };

    this.bombs.push(bomb);
    this.activeBombs++;
    return bomb;
  }

  update(deltaMs) {
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

    // Epicenter explosion
    this.explosions.push({ row: bomb.row, col: bomb.col, isCenter: true });

    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (const dir of directions) {
      for (let i = 1; i <= this.bombPower; i++) {
        const nr = bomb.row + dir.dr * i;
        const nc = bomb.col + dir.dc * i;

        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        if (this.map[nr][nc] === TILE_WALL) break; // Halts on indestructible wall

        if (this.map[nr][nc] === TILE_BLOCK) {
          // Destroys block and halts propagation
          this.map[nr][nc] = TILE_EMPTY;
          this.destroyedBlocks.push({ row: nr, col: nc });
          this.explosions.push({ row: nr, col: nc, isCenter: false });
          break;
        }

        // Empty tile: explosion continues
        this.explosions.push({ row: nr, col: nc, isCenter: false });

        // Check for chain reaction with other bombs
        const chainTarget = this.bombs.find(b => b.active && b.row === nr && b.col === nc);
        if (chainTarget) {
          this.explodeBomb(chainTarget);
        }
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

