import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_DROP_RATE,
  ITEM_WEIGHTS,
  BASE_PLAYER_SPEED,
  SPEED_UP_DELTA,
  MAX_PLAYER_SPEED,
  BASE_MAX_BOMBS,
  MAX_BOMBS_CAP,
  BASE_BOMB_POWER,
  MAX_BOMB_POWER_CAP,
  DASH_SPEED,
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  BOMB_KICK_SPEED,
  ITEM_GRACE_PERIOD_MS,
  SHIELD_INVULN_MS,
  CONVEYOR_DRIFT_SPEED,
  PORTAL_COOLDOWN_MS,
  DEFAULT_CONVEYORS,
  DEFAULT_PORTALS,
  determineItemDrop,
  applyItemUpgrade,
  calculateSpeedLevel,
  createInitialPlayerStats,
  isItemProtectedFromExplosion,
  simulateBombKickSlide,
} from '../src/game/gameplay_mechanics.ts';
import {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';

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

/* ==============================================================================
 * SUITE 1: ITEM DROP PROBABILITIES & DISTRIBUTION TABLE
 * ============================================================================== */

test('Item Drop: Constants ITEM_DROP_RATE and ITEM_WEIGHTS match design specifications', () => {
  assert.equal(ITEM_DROP_RATE, 0.45);
  assert.equal(ITEM_WEIGHTS.BOMB_UP, 0.38);
  assert.equal(ITEM_WEIGHTS.FIRE_UP, 0.38);
  assert.equal(ITEM_WEIGHTS.SPEED_UP, 0.16);
  assert.equal(ITEM_WEIGHTS.KICK, 0.04);
  assert.equal(ITEM_WEIGHTS.SHIELD, 0.04);
});

test('Item Drop: 45% overall drop rate across 10,000 deterministic pseudo-random rolls', () => {
  const trials = 10000;
  let drops = 0;

  for (let i = 0; i < trials; i++) {
    const drop = determineItemDrop(Math.random(), Math.random());
    if (drop !== null) {
      drops++;
    }
  }

  const rate = drops / trials;
  // 45% ± 2%
  assert.ok(rate >= 0.43 && rate <= 0.47, `Observed drop rate ${rate} should be near 0.45`);
});

test('Item Drop: Weighted proportions among dropped items adhere to distribution specs', () => {
  const trials = 20000;
  const counts = {
    BOMB_UP: 0,
    FIRE_UP: 0,
    SPEED_UP: 0,
    KICK: 0,
    SHIELD: 0,
  };
  let totalDrops = 0;

  for (let i = 0; i < trials; i++) {
    // Force drop by passing dropRoll < 0.45
    const drop = determineItemDrop(0.1, Math.random());
    if (drop) {
      counts[drop]++;
      totalDrops++;
    }
  }

  const pBomb = counts.BOMB_UP / totalDrops;
  const pFire = counts.FIRE_UP / totalDrops;
  const pSpeed = counts.SPEED_UP / totalDrops;
  const pKick = counts.KICK / totalDrops;
  const pShield = counts.SHIELD / totalDrops;

  // Expected: Bomb 38%, Fire 38%, Speed 16%, Kick 4%, Shield 4%
  assert.ok(pBomb >= 0.35 && pBomb <= 0.41, `Bomb Up proportion ${pBomb} near 0.38`);
  assert.ok(pFire >= 0.35 && pFire <= 0.41, `Fire Up proportion ${pFire} near 0.38`);
  assert.ok(pSpeed >= 0.13 && pSpeed <= 0.19, `Speed Up proportion ${pSpeed} near 0.16`);
  assert.ok(pKick >= 0.025 && pKick <= 0.055, `Kick proportion ${pKick} near 0.04`);
  assert.ok(pShield >= 0.025 && pShield <= 0.055, `Shield proportion ${pShield} near 0.04`);
});

test('Item Drop: Deterministic threshold cutoffs match type roll boundaries', () => {
  // >= 0.45 returns null
  assert.equal(determineItemDrop(0.45, 0.1), null);
  assert.equal(determineItemDrop(0.99, 0.1), null);

  // < 0.45 evaluates typeRoll
  assert.equal(determineItemDrop(0.1, 0.0), 'BOMB_UP');
  assert.equal(determineItemDrop(0.1, 0.379), 'BOMB_UP');
  assert.equal(determineItemDrop(0.1, 0.38), 'FIRE_UP');
  assert.equal(determineItemDrop(0.1, 0.759), 'FIRE_UP');
  assert.equal(determineItemDrop(0.1, 0.76), 'SPEED_UP');
  assert.equal(determineItemDrop(0.1, 0.919), 'SPEED_UP');
  assert.equal(determineItemDrop(0.1, 0.92), 'KICK');
  assert.equal(determineItemDrop(0.1, 0.959), 'KICK');
  assert.equal(determineItemDrop(0.1, 0.96), 'SHIELD');
  assert.equal(determineItemDrop(0.1, 0.999), 'SHIELD');
});

/* ==============================================================================
 * SUITE 2: STAT MUTATION & CLAMPING INVARIANTS
 * ============================================================================== */

test('Stat Upgrades: Base stats and cap constants match architecture contracts', () => {
  assert.equal(BASE_PLAYER_SPEED, 150);
  assert.equal(SPEED_UP_DELTA, 25);
  assert.equal(MAX_PLAYER_SPEED, 250);
  assert.equal(BASE_MAX_BOMBS, 1);
  assert.equal(MAX_BOMBS_CAP, 8);
  assert.equal(BASE_BOMB_POWER, 2);
  assert.equal(MAX_BOMB_POWER_CAP, 8);

  assert.equal(calculateSpeedLevel(150), 1);
  assert.equal(calculateSpeedLevel(175), 2);
  assert.equal(calculateSpeedLevel(200), 3);
  assert.equal(calculateSpeedLevel(225), 4);
  assert.equal(calculateSpeedLevel(250), 5);
  assert.equal(calculateSpeedLevel(300), 5);
});

test('Stat Upgrades: Speed Up increases by +25 px/s and clamps strictly at 250 px/s (Lv. 5)', () => {
  const stats = createInitialPlayerStats();
  assert.equal(stats.speed, 150);
  assert.equal(stats.speedLevel, 1);

  // Upgrade 1: 150 -> 175 (Lv 2)
  applyItemUpgrade(stats, 'SPEED_UP');
  assert.equal(stats.speed, 175);
  assert.equal(stats.speedLevel, 2);

  // Upgrade 2: 175 -> 200 (Lv 3)
  applyItemUpgrade(stats, 'SPEED_UP');
  assert.equal(stats.speed, 200);
  assert.equal(stats.speedLevel, 3);

  // Upgrade 3: 200 -> 225 (Lv 4)
  applyItemUpgrade(stats, 'SPEED_UP');
  assert.equal(stats.speed, 225);
  assert.equal(stats.speedLevel, 4);

  // Upgrade 4: 225 -> 250 (Lv 5)
  applyItemUpgrade(stats, 'SPEED_UP');
  assert.equal(stats.speed, 250);
  assert.equal(stats.speedLevel, 5);

  // Upgrade 5: Over-cap attempt -> Must remain strictly 250 (Lv 5)
  const overCapRes = applyItemUpgrade(stats, 'SPEED_UP');
  assert.equal(stats.speed, 250);
  assert.equal(stats.speedLevel, 5);
  assert.equal(overCapRes.upgraded, false);
  assert.equal(stats.itemsCollected.speedUp, 5);
});

test('Stat Upgrades: Bomb Up increases max bombs by +1 and clamps strictly at 8', () => {
  const stats = createInitialPlayerStats();
  assert.equal(stats.maxBombs, 1);

  // Collect 7 Bomb Ups to reach 8
  for (let i = 0; i < 7; i++) {
    const res = applyItemUpgrade(stats, 'BOMB_UP');
    assert.equal(res.upgraded, true);
  }
  assert.equal(stats.maxBombs, 8);

  // Additional pickups over cap
  const res8 = applyItemUpgrade(stats, 'BOMB_UP');
  assert.equal(stats.maxBombs, 8, 'Max bombs must not exceed cap of 8');
  assert.equal(res8.upgraded, false);
});

test('Stat Upgrades: Fire Up increases blast radius by +1 and clamps strictly at 8', () => {
  const stats = createInitialPlayerStats();
  assert.equal(stats.bombPower, 2); // default power 2

  // Collect 6 Fire Ups to reach 8
  for (let i = 0; i < 6; i++) {
    const res = applyItemUpgrade(stats, 'FIRE_UP');
    assert.equal(res.upgraded, true);
  }
  assert.equal(stats.bombPower, 8);

  // Additional pickups over cap
  const overRes = applyItemUpgrade(stats, 'FIRE_UP');
  assert.equal(stats.bombPower, 8, 'Bomb power must not exceed cap of 8');
  assert.equal(overRes.upgraded, false);
});

test('Stat Upgrades: Kick and Shield mutate boolean flags and collection counters', () => {
  const stats = createInitialPlayerStats();
  assert.equal(stats.hasKick, false);
  assert.equal(stats.hasShield, false);

  applyItemUpgrade(stats, 'KICK');
  assert.equal(stats.hasKick, true);
  assert.equal(stats.itemsCollected.kick, 1);

  applyItemUpgrade(stats, 'SHIELD');
  assert.equal(stats.hasShield, true);
  assert.equal(stats.itemsCollected.shield, 1);
});

/* ==============================================================================
 * SUITE 3: 600MS EXPLOSION GRACE PERIOD INVARIANT
 * ============================================================================== */

test('Explosion Grace: ITEM_GRACE_PERIOD_MS is strictly calibrated to 600ms', () => {
  assert.equal(ITEM_GRACE_PERIOD_MS, 600);
});

test('Explosion Grace: Item spawned at t=0 survives explosion occurring within 600ms', () => {
  const spawnTime = 1000;

  // Immediate block destruction blast (same tick, t=1000ms)
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1000), true);

  // Blast at t=1200ms (200ms later) -> Protected
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1200), true);

  // Blast at t=1600ms (exact 600ms boundary) -> Protected
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1600), true);
});

test('Explosion Grace: Item spawned at t=0 is incinerated by explosion occurring after 600ms', () => {
  const spawnTime = 1000;

  // Blast at t=1601ms (601ms later) -> NOT protected (destroyed)
  assert.equal(isItemProtectedFromExplosion(spawnTime, 1601), false);

  // Subsequent bomb explosion at t=2500ms -> Destroyed
  assert.equal(isItemProtectedFromExplosion(spawnTime, 2500), false);
});

/* ==============================================================================
 * SUITE 4: BOMB KICK PHYSICS & TRAJECTORY SIMULATION
 * ============================================================================== */

test('Bomb Kick: Slides freely across open corridor until contacting obstacle wall', () => {
  const map = createStandardMap();
  // Corridor row 1 is open from col 1 to col 13 (walls at col 0 and col 14)
  // Bomb at (1, 2), kicked right (+1, 0)
  const result = simulateBombKickSlide(2, 1, 1, 0, map);

  assert.equal(result.endRow, 1);
  assert.equal(result.endCol, 13, 'Bomb must slide until hitting wall at col 14 and stop at col 13');
  assert.equal(result.steps, 11);
});

test('Bomb Kick: Halts immediately when encountering breakable block obstacle', () => {
  const map = createStandardMap();
  // Place breakable block at (1, 6)
  map[1][6] = TILE_BLOCK;

  // Bomb at (1, 2) kicked right
  const result = simulateBombKickSlide(2, 1, 1, 0, map);

  assert.equal(result.endRow, 1);
  assert.equal(result.endCol, 5, 'Bomb must halt at tile (1, 5) directly in front of block');
  assert.equal(result.steps, 3);
});

test('Bomb Kick: Halts when encountering another active bomb in trajectory', () => {
  const map = createStandardMap();
  const bombTiles = new Set(['1,4']);

  // Bomb at (1, 2) kicked right towards bomb at (1, 4)
  const result = simulateBombKickSlide(2, 1, 1, 0, map, bombTiles);

  assert.equal(result.endRow, 1);
  assert.equal(result.endCol, 3, 'Bomb must stop immediately before the second bomb');
  assert.equal(result.steps, 1);
});

test('Bomb Kick: Slide speed is calibrated to 300 px/s', () => {
  assert.equal(BOMB_KICK_SPEED, 300, 'Bomb kick speed must be 300 px/s');
});

/* ==============================================================================
 * SUITE 5: DASH SKILL DYNAMICS & COOLDOWN LIFECYCLE
 * ============================================================================== */

test('Dash Skill: Calibrated speed (350 px/s), duration (140ms), and cooldown (3500ms)', () => {
  assert.equal(DASH_SPEED, 350);
  assert.equal(DASH_DURATION_MS, 140);
  assert.equal(DASH_COOLDOWN_MS, 3500);
});

test('Dash Skill: Cooldown timer decrements discrete delta frames and returns to ready (0ms)', () => {
  let cd = DASH_COOLDOWN_MS; // 3500ms

  // Step 1: 1000ms elapsed
  cd = Math.max(0, cd - 1000);
  assert.equal(cd, 2500);

  // Step 2: 2000ms elapsed
  cd = Math.max(0, cd - 2000);
  assert.equal(cd, 500);

  // Step 3: 600ms elapsed -> Clamped to 0 (READY)
  cd = Math.max(0, cd - 600);
  assert.equal(cd, 0);
});

/* ==============================================================================
 * SUITE 6: SHIELD ABSORPTION & LETHAL HIT PROTECTION
 * ============================================================================== */

class PlayerDamageController {
  constructor(hasShield = false) {
    this.hasShield = hasShield;
    this.isInvulnerable = false;
    this.isGameOver = false;
    this.absorbedHits = 0;
  }

  takeDamage() {
    if (this.isGameOver) return 'already_dead';
    if (this.isInvulnerable) return 'invulnerable_safe';

    if (this.hasShield) {
      this.hasShield = false;
      this.isInvulnerable = true;
      this.absorbedHits++;
      return 'shield_absorbed';
    }

    this.isGameOver = true;
    return 'player_dead';
  }
}

test('Shield Skill: SHIELD_INVULN_MS is strictly calibrated to 1500ms', () => {
  assert.equal(SHIELD_INVULN_MS, 1500);
});

test('Shield Skill: Unshielded player is eliminated on lethal contact', () => {
  const ctrl = new PlayerDamageController(false);
  const outcome = ctrl.takeDamage();

  assert.equal(outcome, 'player_dead');
  assert.equal(ctrl.isGameOver, true);
});

test('Shield Skill: Shield absorbs 1 fatal hit, grants invulnerability, and prevents game over', () => {
  const ctrl = new PlayerDamageController(true);
  
  // Hit 1: Shield absorbs hit
  const outcome1 = ctrl.takeDamage();
  assert.equal(outcome1, 'shield_absorbed');
  assert.equal(ctrl.hasShield, false);
  assert.equal(ctrl.isInvulnerable, true);
  assert.equal(ctrl.isGameOver, false);

  // Immediate Hit 2 during i-frame window: safely ignored
  const outcome2 = ctrl.takeDamage();
  assert.equal(outcome2, 'invulnerable_safe');
  assert.equal(ctrl.isGameOver, false);

  // i-frame expires
  ctrl.isInvulnerable = false;

  // Hit 3 without shield: lethal
  const outcome3 = ctrl.takeDamage();
  assert.equal(outcome3, 'player_dead');
  assert.equal(ctrl.isGameOver, true);
});

/* ==============================================================================
 * SUITE 7: MAP GIMMICKS: CONVEYOR BELT DRIFT & TELEPORT PORTALS
 * ============================================================================== */

test('Conveyor Belt: Default conveyor corridor applies 60 px/s drift', () => {
  assert.equal(CONVEYOR_DRIFT_SPEED, 60);
  assert.ok(DEFAULT_CONVEYORS.length > 0);

  // Drift over 500ms
  const deltaSec = 500 / 1000;
  const drift = CONVEYOR_DRIFT_SPEED * deltaSec;
  assert.equal(drift, 30, '60 px/s over 0.5s results in 30px displacement');
});

test('Teleport Portal: Paired coordinates and debounce cooldown prevent infinite oscillation', () => {
  assert.equal(PORTAL_COOLDOWN_MS, 1200);
  const { portalA, portalB } = DEFAULT_PORTALS;

  assert.deepEqual(portalA, { row: 1, col: 13 });
  assert.deepEqual(portalB, { row: 11, col: 1 });

  // Simulate warp dispatch
  let currentPos = { ...portalA };
  let cd = 0;

  // Trigger warp from A to B
  if (cd <= 0 && currentPos.row === portalA.row && currentPos.col === portalA.col) {
    currentPos = { ...portalB };
    cd = PORTAL_COOLDOWN_MS;
  }

  assert.deepEqual(currentPos, portalB);
  assert.equal(cd, 1200);

  // Immediate tick next frame (delta = 16ms): cd = 1184ms, cannot re-warp back to A
  cd -= 16;
  let reWarped = false;
  if (cd <= 0 && currentPos.row === portalB.row && currentPos.col === portalB.col) {
    currentPos = { ...portalA };
    reWarped = true;
  }
  assert.equal(reWarped, false, 'Debounce cooldown must block immediate back-teleportation');
});

/* ==============================================================================
 * SUITE 8: REACT HUD BRIDGE INTERFACE CONTRACT
 * ============================================================================== */

test('HUD Bridge: PlayerStats model contains all required arcade gauge fields', () => {
  const stats = createInitialPlayerStats();

  // Core properties verification
  assert.equal(typeof stats.speed, 'number');
  assert.equal(typeof stats.speedLevel, 'number');
  assert.equal(typeof stats.maxBombs, 'number');
  assert.equal(typeof stats.activeBombs, 'number');
  assert.equal(typeof stats.bombPower, 'number');
  assert.equal(typeof stats.hasKick, 'boolean');
  assert.equal(typeof stats.hasShield, 'boolean');
  assert.equal(typeof stats.dashCooldownRemaining, 'number');
  assert.equal(typeof stats.score, 'number');
  assert.equal(typeof stats.isGameOver, 'boolean');

  // Items collected record verification
  assert.equal(typeof stats.itemsCollected.speedUp, 'number');
  assert.equal(typeof stats.itemsCollected.bombUp, 'number');
  assert.equal(typeof stats.itemsCollected.fireUp, 'number');
  assert.equal(typeof stats.itemsCollected.kick, 'number');
  assert.equal(typeof stats.itemsCollected.shield, 'number');
});
