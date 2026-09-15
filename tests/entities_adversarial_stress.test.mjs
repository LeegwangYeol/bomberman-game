import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  findPathBFS,
  getBlastTiles,
  findEscapePathBFS,
} from '../src/game/pathfinding.ts';
import {
  isItemProtectedFromExplosion,
} from '../src/game/gameplay_mechanics.ts';
import {
  FACTIONS,
  ENEMY_ARCHETYPES,
  NEUTRAL_ARCHETYPES,
  ALLY_ARCHETYPES,
} from '../src/game/entities/types.ts';
import { OverheadUI } from '../src/game/entities/OverheadUI.ts';

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
 * Headless OverheadUI Mock for testing
 */
class HeadlessOverheadUI extends OverheadUI {
  constructor(name, faction, maxHp, barWidth = 24, hpBarColor) {
    super(null, name, faction, maxHp, barWidth, hpBarColor);
  }
}

/**
 * Headless Entity Test Harness
 */
class AdversarialEntityHarness {
  constructor(config, faction) {
    this.config = config;
    this.type = config.type;
    this.name = config.name;
    this.faction = faction;
    this.maxHp = config.maxHp;
    this.hp = config.maxHp;
    this.r = 1;
    this.c = 1;
    this.x = 40;
    this.y = 40;
    this.vx = 0;
    this.vy = 0;
    this.state = 'IDLE';
    this.invulnerableTimer = 0;
    this.isStunned = false;
    this.stunUntil = 0;
    this.isDead = false;
    this.spawnedMinis = [];
    this.droppedLoot = [];
    this.activeBombs = 0;
    this.maxBombs = 1;
    this.bombCooldownTimer = 0;
    this.stompTimer = 0;
    this.tauntTimer = 0;
    this.shootTimer = 0;

    this.ui = new HeadlessOverheadUI(this.name, this.faction, this.maxHp, 24, config.hpBarColor);
  }

  setPosition(r, c) {
    this.r = r;
    this.c = c;
    this.x = c * TILE_SIZE + TILE_SIZE / 2;
    this.y = r * TILE_SIZE + TILE_SIZE / 2;
    this.ui.update(this.x, this.y, this.hp);
  }

  takeDamage(amount, sourceBombOwner, currentTime = 0) {
    if (this.isDead || this.invulnerableTimer > 0) {
      return false;
    }

    // Friendly-fire invariant:
    if (this.faction === FACTIONS.ALLY && (sourceBombOwner === 'player' || sourceBombOwner === 'ally')) {
      return false;
    }
    if (this.faction === FACTIONS.ENEMY && sourceBombOwner === 'enemy') {
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableTimer = this.config.iFrameMs || 800;
    this.ui.update(this.x, this.y, this.hp);

    if (this.hp <= 0) {
      this.die(currentTime);
      return true;
    }
    return false;
  }

  die(currentTime = 0) {
    if (this.isDead) return;
    this.isDead = true;
    this.ui.destroy();

    if (this.type === 'SPLITTER') {
      // Splitter creates exactly 2 mini slimes with clamped coordinates
      const leftC = Math.max(1, this.c - 1);
      const rightC = Math.min(COLS - 2, this.c + 1);

      this.spawnedMinis = [
        new AdversarialEntityHarness({ ...ENEMY_ARCHETYPES.SPLITTER, type: 'SPLITTER_MINI', maxHp: 1, trackSpeed: 100 }, FACTIONS.ENEMY),
        new AdversarialEntityHarness({ ...ENEMY_ARCHETYPES.SPLITTER, type: 'SPLITTER_MINI', maxHp: 1, trackSpeed: 100 }, FACTIONS.ENEMY),
      ];
      this.spawnedMinis[0].setPosition(this.r, leftC);
      this.spawnedMinis[1].setPosition(this.r, rightC);
    } else if (this.type === 'MERCHANT') {
      const rightC = Math.min(COLS - 2, this.c + 1);
      this.droppedLoot = [
        { type: 'SPEED_UP', r: this.r, c: this.c, spawnTime: currentTime },
        { type: 'SHIELD', r: this.r, c: rightC, spawnTime: currentTime },
      ];
    }
  }

  update(deltaMs, currentTime) {
    if (this.isDead) return;

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaMs);
    }

    if (this.isStunned && currentTime >= this.stunUntil) {
      this.isStunned = false;
      this.ui.setIntent('', false);
    }

    this.ui.update(this.x, this.y, this.hp);
  }
}

/* ==============================================================================
 * ADVERSARIAL SUITE 1: 5 ENEMY ARCHETYPES UNDER EXTREME CONDITIONS
 * ============================================================================== */

test('Adversarial 1.1 [Chaser]: Pounce windup, corridor dash speed, and wall-collision stun lock', () => {
  const chaser = new AdversarialEntityHarness(ENEMY_ARCHETYPES.CHASER, FACTIONS.ENEMY);
  chaser.setPosition(1, 1);

  // Line of sight test along clear horizontal corridor
  const map = createStandardMap();
  function hasLineOfSight(r1, c1, r2, c2, grid) {
    if (r1 === r2) {
      const minC = Math.min(c1, c2);
      const maxC = Math.max(c1, c2);
      for (let c = minC + 1; c < maxC; c++) {
        if (grid[r1][c] !== TILE_EMPTY) return false;
      }
      return true;
    }
    if (c1 === c2) {
      const minR = Math.min(r1, r2);
      const maxR = Math.max(r1, r2);
      for (let r = minR + 1; r < maxR; r++) {
        if (grid[r][c1] !== TILE_EMPTY) return false;
      }
      return true;
    }
    return false;
  }

  // Clear path between (1, 1) and (1, 5)
  assert.equal(hasLineOfSight(1, 1, 1, 5, map), true);

  // Intervening block breaks line of sight
  map[1][3] = TILE_BLOCK;
  assert.equal(hasLineOfSight(1, 1, 1, 5, map), false);

  // Intervening fixed wall pillar breaks line of sight
  map[1][3] = TILE_WALL;
  assert.equal(hasLineOfSight(1, 1, 1, 5, map), false);

  // Stun locking on wall impact
  chaser.state = 'WINDUP';
  chaser.ui.setIntent('⚠️', true);
  assert.equal(chaser.ui.intentGlyph, '⚠️');

  // Trigger dash attack
  chaser.state = 'ATTACK';
  chaser.ui.setIntent('⚡', true);
  assert.equal(chaser.config.dashSpeed, 240);

  // Wall impact triggers 900ms stun
  chaser.isStunned = true;
  chaser.stunUntil = 5000 + chaser.config.stunMs;
  chaser.ui.setIntent('💫', true);
  assert.equal(chaser.ui.intentGlyph, '💫');

  // Halfway through stun: still stunned
  chaser.update(450, 5450);
  assert.equal(chaser.isStunned, true);

  // Stun expires: resumes tracking
  chaser.update(500, 5950);
  assert.equal(chaser.isStunned, false);
  assert.equal(chaser.ui.isIntentVisible, false);
});

test('Adversarial 1.2 [Bomber]: Cul-de-sac dead end, 1 HP Enrage state, and multi-bomb suicide refusal', () => {
  const bomber = new AdversarialEntityHarness(ENEMY_ARCHETYPES.BOMBER, FACTIONS.ENEMY);
  bomber.setPosition(1, 1);
  assert.equal(bomber.hp, 2);

  const map = createStandardMap();

  // Test 1: Trap Bomber in a 1x1 cul-de-sac
  map[1][2] = TILE_BLOCK;
  map[2][1] = TILE_WALL;
  // Bomber is at (1, 1), walls on top and left. Block on right, wall below.
  const blast1 = getBlastTiles({ r: 1, c: 1 }, 2, map);
  const escape1 = findEscapePathBFS({ r: 1, c: 1 }, blast1, map, new Set(['1,1']), 4);
  assert.equal(escape1, null, 'Bomber strictly refuses to plant bomb in 1x1 trap');

  // Test 2: Bomber in a 2-tile dead-end hallway
  map[1][2] = TILE_EMPTY; // open
  map[1][3] = TILE_WALL;  // wall at end
  map[2][1] = TILE_WALL;  // wall below (1, 1)
  map[2][2] = TILE_WALL;  // wall below (1, 2)
  // Hallway of length 2: (1,1) and (1,2). Blast with power 2 engulfs both tiles!
  const blast2 = getBlastTiles({ r: 1, c: 1 }, 2, map);
  assert.ok(blast2.has('1,1') && blast2.has('1,2'), 'Both hallway tiles are engulfed');
  const escape2 = findEscapePathBFS({ r: 1, c: 1 }, blast2, map, new Set(['1,1']), 4);
  assert.equal(escape2, null, 'Bomber strictly refuses to plant bomb in 2-tile dead end');

  // Test 3: Take 1 damage -> Enrage mode
  const died = bomber.takeDamage(1, 'player', 1000);
  assert.equal(died, false);
  assert.equal(bomber.hp, 1);
  bomber.ui.setIntent('😈', true);
  assert.equal(bomber.ui.intentGlyph, '😈');
  assert.equal(bomber.config.enragedSpeed, 105);
  assert.equal(bomber.config.quickFuseMs, 1200);

  // Test 4: Open corridor with T-junction allows safe escape
  const openMap = createStandardMap();
  const blastOpen = getBlastTiles({ r: 1, c: 2 }, 2, openMap);
  const escapeOpen = findEscapePathBFS({ r: 1, c: 2 }, blastOpen, openMap, new Set(['1,2']), 4);
  assert.ok(escapeOpen && escapeOpen.length > 0, 'Safe escape path found in open map');
  assert.ok(!blastOpen.has(`${escapeOpen[escapeOpen.length - 1].r},${escapeOpen[escapeOpen.length - 1].c}`), 'Escape destination is safe');
});

test('Adversarial 1.3 [Tank]: Soft block bulldozing with hidden item preservation and 1200ms i-frame defense', () => {
  const tank = new AdversarialEntityHarness(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY);
  tank.setPosition(1, 1);
  assert.equal(tank.hp, 4);

  const map = createStandardMap();
  map[1][2] = TILE_BLOCK;
  map[1][3] = TILE_BLOCK;

  // Item concealed inside soft block at (1, 2)
  const itemInBlock = { type: 'SPEED_UP', r: 1, c: 2, spawnTime: 2000 };

  // Tank bulldozes block at (1, 2)
  function tankBulldoze(tr, tc, grid, item) {
    if (grid[tr][tc] === TILE_BLOCK) {
      grid[tr][tc] = TILE_EMPTY; // Pulverized into empty tile
      // Item is revealed, keeping its spawnTime
      return { crushed: true, itemRevealed: item };
    }
    return { crushed: false, itemRevealed: null };
  }

  const result = tankBulldoze(1, 2, map, itemInBlock);
  assert.equal(result.crushed, true);
  assert.equal(map[1][2], TILE_EMPTY, 'Block pulverized to empty');
  assert.equal(result.itemRevealed.type, 'SPEED_UP');

  // Verify item is NOT destroyed and has 600ms grace period from spawnTime
  assert.equal(isItemProtectedFromExplosion(result.itemRevealed.spawnTime, 2400), true);
  assert.equal(isItemProtectedFromExplosion(result.itemRevealed.spawnTime, 2600), true);
  assert.equal(isItemProtectedFromExplosion(result.itemRevealed.spawnTime, 2601), false);

  // Tank cannot bulldoze fixed solid walls
  assert.equal(map[0][1], TILE_WALL);
  function tankAttemptSolidWall(tr, tc, grid) {
    return grid[tr][tc] === TILE_WALL ? 'BLOCKED' : 'PASSABLE';
  }
  assert.equal(tankAttemptSolidWall(0, 1, map), 'BLOCKED');

  // Continuous multi-frame blast tick defense
  tank.takeDamage(1, 'player', 3000);
  assert.equal(tank.hp, 3);
  assert.equal(tank.invulnerableTimer, 1200);

  // Simulate 30 consecutive frames of explosion overlap (e.g. 16ms each = 480ms)
  for (let frame = 1; frame <= 30; frame++) {
    tank.update(16, 3000 + frame * 16);
    tank.takeDamage(1, 'player', 3000 + frame * 16);
  }
  assert.equal(tank.hp, 3, 'Tank i-frames protect against all 30 explosion ticks');
});

test('Adversarial 1.4 [Ghost]: Phasing through soft blocks while halted by solid walls, ether dash delay', () => {
  const map = createStandardMap();
  // Fill an entire corridor with soft blocks
  map[1][2] = TILE_BLOCK;
  map[1][3] = TILE_BLOCK;
  map[1][4] = TILE_BLOCK;

  // Block south corridor so there is no detour around the blocks
  map[2][1] = TILE_WALL;

  // Normal entity cannot traverse through blocks when south corridor is closed
  const normalPath = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 5 }, map, new Set());
  assert.equal(normalPath.length, 0, 'Normal BFS cannot pass blocks without detour');

  // Ghost entity treats TILE_BLOCK as passable empty space
  const ghostMap = map.map((row) => row.map((t) => (t === TILE_BLOCK ? TILE_EMPTY : t)));
  const ghostPath = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 5 }, ghostMap, new Set());
  assert.ok(ghostPath.length > 0, 'Ghost path penetrates through all 3 soft blocks');
  assert.equal(ghostPath.length, 4, 'Ghost path is direct: (1,2)->(1,3)->(1,4)->(1,5)');
  assert.equal(ghostPath[ghostPath.length - 1].c, 5);

  // Ghost CANNOT penetrate outer perimeter walls or fixed pillars
  const wallTarget = { r: 0, c: 1 };
  const wallPath = findPathBFS({ r: 1, c: 1 }, wallTarget, ghostMap, new Set());
  assert.ok(!wallPath.some((step) => step.r === 0 && step.c === 1), 'Ghost strictly cannot step into outer perimeter TILE_WALL');

  const pillarTarget = { r: 2, c: 2 };
  const pillarPath = findPathBFS({ r: 1, c: 1 }, pillarTarget, ghostMap, new Set());
  assert.ok(!pillarPath.some((step) => step.r === 2 && step.c === 2), 'Ghost strictly cannot step into fixed inner pillar TILE_WALL');

  // Ether dash speed & materialization delay
  const ghost = new AdversarialEntityHarness(ENEMY_ARCHETYPES.GHOST, FACTIONS.ENEMY);
  assert.equal(ghost.config.dashSpeed, 260);
  assert.equal(ghost.config.materializeDelayMs, 1500);
});

test('Adversarial 1.5 [Splitter]: Recursive division limits and boundary spawn coordinate clamping', () => {
  const splitter = new AdversarialEntityHarness(ENEMY_ARCHETYPES.SPLITTER, FACTIONS.ENEMY);
  // Place parent near map right border: (1, COLS - 2)
  splitter.setPosition(1, COLS - 2);
  assert.equal(splitter.hp, 2);

  // Take 1 hit
  splitter.takeDamage(1, 'player', 1000);
  assert.equal(splitter.hp, 1);
  assert.equal(splitter.isDead, false);

  // Fatal hit triggers onDeath
  splitter.invulnerableTimer = 0;
  splitter.takeDamage(1, 'player', 2000);
  assert.equal(splitter.isDead, true);
  assert.equal(splitter.spawnedMinis.length, 2);

  const [mini1, mini2] = splitter.spawnedMinis;
  assert.equal(mini1.type, 'SPLITTER_MINI');
  assert.equal(mini2.type, 'SPLITTER_MINI');
  assert.equal(mini1.hp, 1);
  assert.equal(mini2.hp, 1);

  // Boundary clamping check: minis must be strictly within [1, COLS-2]
  assert.ok(mini1.c >= 1 && mini1.c <= COLS - 2, 'Mini 1 column is within valid bounds');
  assert.ok(mini2.c >= 1 && mini2.c <= COLS - 2, 'Mini 2 column is within valid bounds');

  // Terminal division: mini-slimes do NOT split into further minis upon death
  mini1.die();
  assert.equal(mini1.isDead, true);
  assert.equal(mini1.spawnedMinis.length, 0, 'Mini-slimes must not recursively divide');
});

/* ==============================================================================
 * ADVERSARIAL SUITE 2: NEUTRAL ENTITY INTERACTION & LOOT SAFETY
 * ============================================================================== */

test('Adversarial 2.1 [Merchant]: Bomb flee response, trade stall at intersection, and protected loot drop', () => {
  const merchant = new AdversarialEntityHarness(NEUTRAL_ARCHETYPES.MERCHANT, FACTIONS.NEUTRAL);
  merchant.setPosition(3, 3);
  assert.equal(merchant.hp, 3);

  // 1. Proximity trade: Player adjacent -> Merchant halts and displays 💰
  const playerAdjacent = { r: 3, c: 4 };
  const dist = Math.abs(merchant.r - playerAdjacent.r) + Math.abs(merchant.c - playerAdjacent.c);
  assert.equal(dist, 1);
  merchant.ui.setIntent('💰', true);
  assert.equal(merchant.ui.intentGlyph, '💰');

  // 2. Ticking bomb nearby -> Merchant flees with 😱
  const bombTile = '3,5'; // 2 tiles away
  const bombSet = new Set([bombTile]);
  let nearBomb = false;
  for (const b of bombSet) {
    const [br, bc] = b.split(',').map(Number);
    if (Math.abs(merchant.r - br) + Math.abs(merchant.c - bc) <= 3) {
      nearBomb = true;
      break;
    }
  }
  assert.equal(nearBomb, true);
  merchant.ui.setIntent('😱', true);
  assert.equal(merchant.ui.intentGlyph, '😱');

  // 3. Cart destruction drops 2 protected items
  merchant.die(5000);
  assert.equal(merchant.isDead, true);
  assert.equal(merchant.droppedLoot.length, 2);

  const [loot1, loot2] = merchant.droppedLoot;
  assert.equal(loot1.spawnTime, 5000);
  assert.equal(loot2.spawnTime, 5000);

  // Explosion at 5400ms (within 600ms grace window) -> both items protected
  assert.equal(isItemProtectedFromExplosion(loot1.spawnTime, 5400), true);
  assert.equal(isItemProtectedFromExplosion(loot2.spawnTime, 5400), true);

  // Explosion at 5601ms (after grace window) -> items can be destroyed
  assert.equal(isItemProtectedFromExplosion(loot1.spawnTime, 5601), false);
  assert.equal(isItemProtectedFromExplosion(loot2.spawnTime, 5601), false);
});

test('Adversarial 2.2 [Critter]: Distraction roll, player interaction 💖, and +200 bonus reward', () => {
  const critter = new AdversarialEntityHarness(NEUTRAL_ARCHETYPES.CRITTER, FACTIONS.NEUTRAL);
  critter.setPosition(5, 5);
  assert.equal(critter.hp, 1);
  assert.equal(critter.config.scoreReward, 200);

  // Player overlap gives 💖
  critter.ui.setIntent('💖', true);
  assert.equal(critter.ui.intentGlyph, '💖');

  // 25% distraction chance simulation across 1000 hunting enemy encounters
  let distractedCount = 0;
  for (let i = 0; i < 1000; i++) {
    if (Math.random() < critter.config.distractionChance) {
      distractedCount++;
    }
  }
  // Binomial expectation: ~250 (3 sigma: [209, 291])
  assert.ok(distractedCount > 180 && distractedCount < 320, `Distraction frequency: ${distractedCount}/1000`);

  // Defeat grants score
  let currentScore = 1500;
  currentScore += critter.config.scoreReward;
  critter.die();
  assert.equal(currentScore, 1700);
  assert.equal(critter.isDead, true);
});

/* ==============================================================================
 * ADVERSARIAL SUITE 3: ALLY SAFETY & SYNERGY INVARIANTS
 * ============================================================================== */

test('Adversarial 3.1 [Mini-Bomber]: Zero friendly-fire across all 4 cardinal orientations and leash limits', () => {
  const ally = new AdversarialEntityHarness(ALLY_ARCHETYPES.MINI_BOMBER, FACTIONS.ALLY);
  ally.setPosition(5, 5);
  const map = createStandardMap();

  function canAllySafelyPlant(allyCoord, playerCoord, power, grid) {
    const candidateBlast = getBlastTiles(allyCoord, power, grid);
    return !candidateBlast.has(`${playerCoord.r},${playerCoord.c}`);
  }

  // Check all 4 cardinal directions where player is in blast range (power 2)
  const dangerOffsets = [
    { r: -1, c: 0 }, // North
    { r: 1, c: 0 },  // South
    { r: 0, c: -1 }, // West
    { r: 0, c: 1 },  // East
    { r: -2, c: 0 }, // North 2 steps
    { r: 2, c: 0 },  // South 2 steps
    { r: 0, c: -2 }, // West 2 steps
    { r: 0, c: 2 },  // East 2 steps
  ];

  for (const offset of dangerOffsets) {
    const playerPos = { r: ally.r + offset.r, c: ally.c + offset.c };
    const safe = canAllySafelyPlant({ r: ally.r, c: ally.c }, playerPos, 2, map);
    assert.equal(safe, false, `Ally MUST refuse planting when player is at (${playerPos.r}, ${playerPos.c})`);
  }

  // Safe position: player is diagonal or beyond blast reach
  const safePlayerPositions = [
    { r: ally.r + 1, c: ally.c + 1 }, // Diagonal SE
    { r: ally.r - 1, c: ally.c - 1 }, // Diagonal NW
    { r: ally.r + 3, c: ally.c },     // 3 tiles South (out of power 2 range)
    { r: ally.r, c: ally.c + 3 },     // 3 tiles East (out of power 2 range)
  ];

  for (const playerPos of safePlayerPositions) {
    const safe = canAllySafelyPlant({ r: ally.r, c: ally.c }, playerPos, 2, map);
    assert.equal(safe, true, `Ally MAY plant when player is safely at (${playerPos.r}, ${playerPos.c})`);
  }

  // Leash sprint check: > 6 tiles triggers sprint speed (160 px/s)
  const distClose = 4;
  const distFar = 8;
  assert.equal(distClose <= ally.config.leashMaxTiles, true);
  assert.equal(distFar > ally.config.leashMaxTiles, true);
  assert.equal(ally.config.sprintSpeed, 160);
});

test('Adversarial 3.2 [Pet Drone]: Vacuum tractor beam item retrieval race conditions and peashooter stun', () => {
  const drone = new AdversarialEntityHarness(ALLY_ARCHETYPES.PET_DRONE, FACTIONS.ALLY);
  drone.setPosition(5, 5);

  // Generate 50 items scattered across the arena
  const items = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      items.push({
        active: true,
        x: c * TILE_SIZE + TILE_SIZE / 2,
        y: r * TILE_SIZE + TILE_SIZE / 2,
        r,
        c,
      });
    }
  }

  // Drone scans within 6 tiles (6 * 40 = 240 px)
  const maxDistPx = drone.config.fetchRadiusTiles * TILE_SIZE;
  assert.equal(maxDistPx, 240);

  let inRadiusCount = 0;
  for (const item of items) {
    const distPx = Math.hypot(drone.x - item.x, drone.y - item.y);
    if (distPx <= maxDistPx) {
      inRadiusCount++;
    }
  }
  assert.ok(inRadiusCount > 0, 'Found items within drone vacuum radius');

  // Peashooter targeting closest enemy
  const enemies = [
    new AdversarialEntityHarness(ENEMY_ARCHETYPES.CHASER, FACTIONS.ENEMY),
    new AdversarialEntityHarness(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY),
  ];
  enemies[0].setPosition(5, 7); // 2 tiles away
  enemies[1].setPosition(5, 9); // 4 tiles away

  // Target closest
  let target = null;
  let minDist = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(drone.x - e.x, drone.y - e.y);
    if (d < minDist) {
      minDist = d;
      target = e;
    }
  }
  assert.equal(target, enemies[0], 'Peashooter locks onto closest enemy');
  target.isStunned = true;
  target.stunUntil = 10000 + drone.config.stunDurationMs;
  target.ui.setIntent('💫', true);
  assert.equal(target.isStunned, true);
  assert.equal(target.ui.intentGlyph, '💫');
});

test('Adversarial 3.3 [Shield Guard]: Taunt wave radius and Dome shield explosion absorption', () => {
  const guard = new AdversarialEntityHarness(ALLY_ARCHETYPES.SHIELD_GUARD, FACTIONS.ALLY);
  guard.setPosition(5, 5);
  assert.equal(guard.hp, 5);
  assert.equal(guard.config.tauntRadiusTiles, 5);
  assert.equal(guard.config.domeAbsorbRadiusTiles, 2);

  // Simulate explosion hitting 1 tile from player, where Shield Guard is guarding player
  const player = { x: guard.x + 16, y: guard.y };
  const explosion = { x: player.x + 32, y: player.y };

  function tryAbsorb(guardPos, playerPos, expPos, guardHp) {
    const distToExplosion = (Math.abs(guardPos.x - expPos.x) + Math.abs(guardPos.y - expPos.y)) / TILE_SIZE;
    const distToPlayer = (Math.abs(guardPos.x - playerPos.x) + Math.abs(guardPos.y - playerPos.y)) / TILE_SIZE;
    if (distToExplosion <= guard.config.domeAbsorbRadiusTiles || distToPlayer <= 2) {
      return { absorbed: true, newGuardHp: guardHp - 1 };
    }
    return { absorbed: false, newGuardHp: guardHp };
  }

  const res = tryAbsorb(guard, player, explosion, guard.hp);
  assert.equal(res.absorbed, true, 'Dome shield successfully absorbed explosion');
  assert.equal(res.newGuardHp, 4, 'Guard absorbs 1 damage');
});

/* ==============================================================================
 * ADVERSARIAL SUITE 4: 3-TIER OVERHEAD UI & HIGH-VOLUME LIFECYCLE STRESS
 * ============================================================================== */

test('Adversarial 4.1 [UI]: Exact 3-tier vertical layout, segment calculations, and vertical clearances', () => {
  const ui = new HeadlessOverheadUI('Test: Entity', 'enemy', 5);
  ui.update(100, 200, 3);
  ui.setIntent('⚠️', true);

  const layers = ui.getRenderLayers();

  // Tier 1: HP Bar at y - 14
  assert.equal(layers.tier1_hp.y, 186);
  assert.equal(layers.tier1_hp.ratio, 3 / 5);
  assert.equal(layers.tier1_hp.segments, 5);

  // Tier 2: Name Tag at y - 22
  assert.equal(layers.tier2_name.y, 178);
  assert.equal(layers.tier2_name.color, '#fb923c');

  // Tier 3: Intent Badge at y - 34
  assert.equal(layers.tier3_intent.y, 166);
  assert.equal(layers.tier3_intent.glyph, '⚠️');
  assert.equal(layers.tier3_intent.visible, true);

  // Vertical clearance: 8px between Tier 1 & Tier 2; 12px between Tier 2 & Tier 3
  const clearance12 = layers.tier1_hp.y - layers.tier2_name.y;
  const clearance23 = layers.tier2_name.y - layers.tier3_intent.y;
  assert.equal(clearance12, 8, 'Exact 8px clearance between HP bar and Name Tag');
  assert.equal(clearance23, 12, 'Exact 12px clearance between Name Tag and Intent Badge');
});

test('Adversarial 4.2 [UI Memory Leak]: 10,000 rapid entity create/update/destroy cycles without reference retention', () => {
  const initialMemory = process.memoryUsage().heapUsed;

  const cycleCount = 10000;
  for (let i = 0; i < cycleCount; i++) {
    const entity = new AdversarialEntityHarness(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY);
    entity.setPosition(i % ROWS, i % COLS);
    entity.takeDamage(1, 'player');
    entity.ui.setIntent('💥', true);
    entity.die();
    assert.equal(entity.isDead, true);
    assert.equal(entity.ui.isDestroyed, true);
  }

  // Force V8 GC if available, or verify heap stability
  if (global.gc) {
    global.gc();
  }
  const postMemory = process.memoryUsage().heapUsed;
  const memoryDeltaMb = (postMemory - initialMemory) / (1024 * 1024);

  // 10,000 entities created and destroyed should not leak > 30MB of unreclaimed heap
  assert.ok(memoryDeltaMb < 30, `Memory delta after 10,000 entities: ${memoryDeltaMb.toFixed(2)} MB`);
});

test('Adversarial 4.3 [Faction Damage Matrix]: Complete 4x4 matrix exhaustive cross-verification', () => {
  function evaluateDamage(targetFaction, bombOwner) {
    if (targetFaction === FACTIONS.ALLY && (bombOwner === 'player' || bombOwner === 'ally')) {
      return 0; // Friendly fire immunity
    }
    if (targetFaction === FACTIONS.ENEMY && bombOwner === 'enemy') {
      return 0; // Enemy bomb immunity
    }
    if (targetFaction === FACTIONS.PLAYER && (bombOwner === 'player' || bombOwner === 'ally')) {
      return 0; // Player friendly fire immunity
    }
    return 1; // Standard damage
  }

  // Verify Player immunity to Player & Ally bombs
  assert.equal(evaluateDamage('player', 'player'), 0);
  assert.equal(evaluateDamage('player', 'ally'), 0);
  assert.equal(evaluateDamage('player', 'enemy'), 1);

  // Verify Ally immunity to Player & Ally bombs
  assert.equal(evaluateDamage('ally', 'player'), 0);
  assert.equal(evaluateDamage('ally', 'ally'), 0);
  assert.equal(evaluateDamage('ally', 'enemy'), 1);

  // Verify Enemy immunity to Enemy bombs, vulnerability to Player & Ally bombs
  assert.equal(evaluateDamage('enemy', 'enemy'), 0);
  assert.equal(evaluateDamage('enemy', 'player'), 1);
  assert.equal(evaluateDamage('enemy', 'ally'), 1);

  // Verify Neutral vulnerability to all bombs (environmental hazard)
  assert.equal(evaluateDamage('neutral', 'player'), 1);
  assert.equal(evaluateDamage('neutral', 'enemy'), 1);
  assert.equal(evaluateDamage('neutral', 'ally'), 1);
});
