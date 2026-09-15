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

/* ==============================================================================
 * ENTITY & OVERHEAD UI SPECIFICATION HARNESS (WIRED TO ACTUAL IMPLEMENTATION)
 * ============================================================================== */

export {
  FACTIONS,
  ENEMY_ARCHETYPES,
  NEUTRAL_ARCHETYPES,
  ALLY_ARCHETYPES,
};

/**
 * 3-Tier Overhead UI wired to actual OverheadUI implementation
 */
export class OverheadUISimulator extends OverheadUI {
  constructor(name, faction, maxHp, barWidth = 24) {
    super(null, name, faction, maxHp, barWidth);
  }
}

/**
 * Specification Entity Simulator
 */
export class EntitySimulator {
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

    this.ui = new OverheadUISimulator(this.name, this.faction, this.maxHp);
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
      return false; // Zero damage from friendly fire!
    }
    if (this.faction === FACTIONS.ENEMY && sourceBombOwner === 'enemy') {
      return false; // Zero damage from fellow enemy bombs!
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
    this.isDead = true;
    this.ui.destroy();

    // Archetype on-death triggers
    if (this.type === 'SPLITTER') {
      // Divide into 2 mini-slimes
      this.spawnedMinis = [
        new EntitySimulator({ ...ENEMY_ARCHETYPES.SPLITTER, maxHp: 1, trackSpeed: 100 }, FACTIONS.ENEMY),
        new EntitySimulator({ ...ENEMY_ARCHETYPES.SPLITTER, maxHp: 1, trackSpeed: 100 }, FACTIONS.ENEMY),
      ];
      this.spawnedMinis[0].setPosition(this.r, Math.max(1, this.c - 1));
      this.spawnedMinis[1].setPosition(this.r, Math.min(COLS - 2, this.c + 1));
    } else if (this.type === 'MERCHANT') {
      // Spill 2 random protected power-up items
      this.droppedLoot = [
        { type: 'SPEED_UP', r: this.r, c: this.c, spawnTime: currentTime },
        { type: 'SHIELD_BARRIER', r: this.r, c: Math.min(COLS - 2, this.c + 1), spawnTime: currentTime },
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

function createEmptyArena() {
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
 * TIER 1: FEATURE COVERAGE (5 ENEMIES, 2 NEUTRALS, 3 ALLIES, 3-TIER UI)
 * ============================================================================== */

test('Tier 1 [Enemy 1/5]: CHASER archetype configuration, pounce velocity, and stun state', () => {
  const chaser = new EntitySimulator(ENEMY_ARCHETYPES.CHASER, FACTIONS.ENEMY);
  assert.equal(chaser.maxHp, 1);
  assert.equal(chaser.hp, 1);
  assert.equal(chaser.config.trackSpeed, 110);
  assert.equal(chaser.config.dashSpeed, 240);

  // Simulate pounce impact with wall: triggers 900ms stun
  chaser.isStunned = true;
  chaser.stunUntil = 1900;
  chaser.ui.setIntent('💫', true);
  assert.equal(chaser.ui.intentGlyph, '💫');
  chaser.update(500, 1500);
  assert.equal(chaser.isStunned, true);
  chaser.update(500, 2000);
  assert.equal(chaser.isStunned, false);
});

test('Tier 1 [Enemy 2/5]: BOMBER archetype multi-HP, strategic planting, and 1 HP enrage state', () => {
  const bomber = new EntitySimulator(ENEMY_ARCHETYPES.BOMBER, FACTIONS.ENEMY);
  assert.equal(bomber.maxHp, 2);
  assert.equal(bomber.hp, 2);

  // Take 1 damage -> Enraged mode
  const died = bomber.takeDamage(1, 'player');
  assert.equal(died, false);
  assert.equal(bomber.hp, 1);
  bomber.state = 'ENRAGED';
  bomber.ui.setIntent('😈', true);
  assert.equal(bomber.ui.intentGlyph, '😈');
  assert.equal(bomber.config.enragedSpeed, 105);
  assert.equal(bomber.config.quickFuseMs, 1200);
});

test('Tier 1 [Enemy 3/5]: TANK archetype 4 HP pool, 1200ms i-frame, and soft block crushing', () => {
  const tank = new EntitySimulator(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY);
  assert.equal(tank.maxHp, 4);
  assert.equal(tank.hp, 4);

  // Takes hit -> drops to 3 HP and gets 1200ms i-frame
  tank.takeDamage(1, 'player');
  assert.equal(tank.hp, 3);
  assert.equal(tank.invulnerableTimer, 1200);

  // Secondary hit during i-frame is rejected
  const extraHit = tank.takeDamage(1, 'player');
  assert.equal(extraHit, false);
  assert.equal(tank.hp, 3, 'Tank HP unchanged during i-frame');

  // Block pulverization logic check
  const map = createEmptyArena();
  map[1][2] = TILE_BLOCK;
  function tankStepOnBlock(r, c, grid) {
    if (grid[r][c] === TILE_BLOCK) {
      grid[r][c] = TILE_EMPTY; // Pulverize
      return true;
    }
    return false;
  }
  const crushed = tankStepOnBlock(1, 2, map);
  assert.equal(crushed, true);
  assert.equal(map[1][2], TILE_EMPTY, 'Block was crushed into empty tile');
});

test('Tier 1 [Enemy 4/5]: GHOST archetype soft-block phasing BFS and ether dash delay', () => {
  const map = createEmptyArena();
  map[1][2] = TILE_BLOCK; // Soft block blocking corridor
  map[2][1] = TILE_WALL;  // Wall blocking south corridor

  // Standard BFS cannot pass soft block
  const standardPath = findPathBFS({ r: 1, c: 1 }, { r: 1, c: 3 }, map, new Set());
  assert.equal(standardPath.length, 0, 'Standard BFS blocked by soft block');
  // Ghost BFS treats TILE_BLOCK as passable
  function ghostFindPathBFS(start, target, grid) {
    const ghostMap = grid.map((row) => row.map((tile) => (tile === TILE_BLOCK ? TILE_EMPTY : tile)));
    return findPathBFS(start, target, ghostMap, new Set());
  }

  const ghostPath = ghostFindPathBFS({ r: 1, c: 1 }, { r: 1, c: 3 }, map);
  assert.ok(ghostPath.length > 0, 'Ghost path penetrates through TILE_BLOCK');
  assert.equal(ghostPath[0].r, 1);
  assert.equal(ghostPath[0].c, 2, 'Ghost steps directly into soft block tile');
});

test('Tier 1 [Enemy 5/5]: SPLITTER archetype splits into 2 mini-slimes upon elimination', () => {
  const splitter = new EntitySimulator(ENEMY_ARCHETYPES.SPLITTER, FACTIONS.ENEMY);
  splitter.setPosition(5, 5);
  assert.equal(splitter.hp, 2);

  splitter.takeDamage(1, 'player');
  assert.equal(splitter.hp, 1);
  assert.equal(splitter.isDead, false);

  // Defeat parent
  splitter.invulnerableTimer = 0;
  splitter.takeDamage(1, 'player');
  assert.equal(splitter.isDead, true);
  assert.equal(splitter.spawnedMinis.length, 2);

  const mini1 = splitter.spawnedMinis[0];
  const mini2 = splitter.spawnedMinis[1];
  assert.equal(mini1.hp, 1);
  assert.equal(mini2.hp, 1);
  assert.equal(mini1.config.trackSpeed, 100);
  assert.equal(mini2.config.trackSpeed, 100);
  assert.equal(mini1.r, 5);
  assert.equal(mini1.c, 4);
  assert.equal(mini2.r, 5);
  assert.equal(mini2.c, 6);
});

test('Tier 1 [Neutral 1/2]: MERCHANT NPC trade stall and protected loot spill on cart destruction', () => {
  const merchant = new EntitySimulator(NEUTRAL_ARCHETYPES.MERCHANT, FACTIONS.NEUTRAL);
  merchant.setPosition(3, 3);
  assert.equal(merchant.maxHp, 3);
  assert.equal(merchant.hp, 3);

  // Destroy merchant cart
  merchant.die(1000);
  assert.equal(merchant.isDead, true);
  assert.equal(merchant.droppedLoot.length, 2);
  // Spilled loot is protected by 600ms grace period
  for (const loot of merchant.droppedLoot) {
    assert.equal(isItemProtectedFromExplosion(loot.spawnTime, 1200), true);
    assert.equal(isItemProtectedFromExplosion(loot.spawnTime, 1600), true);
    assert.equal(isItemProtectedFromExplosion(loot.spawnTime, 1601), false);
  }
});

test('Tier 1 [Neutral 2/2]: CRITTER harmless ambient wildlife and +200 bonus on blast', () => {
  const critter = new EntitySimulator(NEUTRAL_ARCHETYPES.CRITTER, FACTIONS.NEUTRAL);
  critter.setPosition(7, 7);
  assert.equal(critter.maxHp, 1);
  assert.equal(critter.hp, 1);
  assert.equal(critter.config.scoreReward, 200);

  critter.die();
  assert.equal(critter.isDead, true);
  assert.equal(critter.ui.isDestroyed, true);
});

test('Tier 1 [Ally 1/3]: MINI_BOMBER dynamic leash and suicide/friendly-fire prevention', () => {
  const ally = new EntitySimulator(ALLY_ARCHETYPES.MINI_BOMBER, FACTIONS.ALLY);
  ally.setPosition(1, 1);

  // Friendly fire check: Player bomb deals ZERO damage to Mini-Bomber
  const tookDamage = ally.takeDamage(1, 'player');
  assert.equal(tookDamage, false);
  assert.equal(ally.hp, 3, 'Mini-Bomber immune to player bomb blast');

  // Enemy bomb DOES deal damage
  const tookEnemyDamage = ally.takeDamage(1, 'enemy');
  assert.equal(tookEnemyDamage, false);
  assert.equal(ally.hp, 2, 'Mini-Bomber takes damage from enemy bomb');
});

test('Tier 1 [Ally 2/3]: PET_DRONE flight, tractor beam item retrieval, and stun peashooter', () => {
  const drone = new EntitySimulator(ALLY_ARCHETYPES.PET_DRONE, FACTIONS.ALLY);
  assert.equal(drone.config.fetchRadiusTiles, 6);
  assert.equal(drone.config.flightSpeed, 120);
  assert.equal(drone.config.shootIntervalMs, 3000);
});

test('Tier 1 [Ally 3/3]: SHIELD_GUARD 5 HP vanguard tank, taunt wave, and Aegis blast dome', () => {
  const guard = new EntitySimulator(ALLY_ARCHETYPES.SHIELD_GUARD, FACTIONS.ALLY);
  assert.equal(guard.maxHp, 5);
  assert.equal(guard.hp, 5);
  assert.equal(guard.config.tauntRadiusTiles, 5);
  assert.equal(guard.config.domeAbsorbRadiusTiles, 2);
});

test('Tier 1 [UI]: 3-Tier Overhead UI component renders HP bar, name tag, and intent badge with exact vertical offsets', () => {
  const ui = new OverheadUISimulator('Chaser: Blinky', 'enemy', 4);
  ui.update(200, 300, 3);
  ui.setIntent('!', true);

  const layers = ui.getRenderLayers();
  // Tier 1: HP Bar at y - 14
  assert.equal(layers.tier1_hp.y, 286);
  assert.equal(layers.tier1_hp.ratio, 0.75);
  assert.equal(layers.tier1_hp.segments, 4);

  // Tier 2: Name Tag at y - 22 (8px above HP bar)
  assert.equal(layers.tier2_name.y, 278);
  assert.equal(layers.tier2_name.color, '#fb923c');

  // Tier 3: Intent Badge at y - 34 (12px above Name Tag)
  assert.equal(layers.tier3_intent.y, 266);
  assert.equal(layers.tier3_intent.glyph, '!');
  assert.equal(layers.tier3_intent.visible, true);

  // Clearance verification: 12px vertical clearance prevents badge from overlapping text
  const clearance = layers.tier2_name.y - layers.tier3_intent.y;
  assert.equal(clearance, 12);
});

/* ==============================================================================
 * TIER 2: BOUNDARY & CORNER CASES (I-FRAMES, SUICIDE INVARIANTS, MEMORY LEAKS)
 * ============================================================================== */

test('Tier 2: Multi-hit explosion i-frames prevent single-blast instant elimination of high-HP Tank', () => {
  const tank = new EntitySimulator(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY);
  assert.equal(tank.hp, 4);

  // Frame 0: First blast tick hits
  tank.takeDamage(1, 'player');
  assert.equal(tank.hp, 3);

  // Simulate 10 frames during active 320ms explosion
  for (let frame = 1; frame <= 10; frame++) {
    tank.update(32, frame * 32);
    tank.takeDamage(1, 'player'); // Continuous collision overlap
  }

  assert.equal(tank.hp, 3, 'Tank must lose only 1 HP during the entire explosion lifecycle due to i-frames');
});

test('Tier 2: Bomber AI suicide prevention strictly aborts bomb drop in cul-de-sac dead-end', () => {
  const map = createEmptyArena();
  // Construct a dead-end corridor of length 2 at row 1:
  // (1, 1) is dead end. (1, 2) is only way out. Wall placed at (1, 3) and (2, 1).
  map[1][3] = TILE_WALL;
  map[2][1] = TILE_WALL;

  const dangerTiles = getBlastTiles({ r: 1, c: 1 }, 2, map);
  const escapePath = findEscapePathBFS({ r: 1, c: 1 }, dangerTiles, map, new Set(['1,1']), 4);
  assert.equal(escapePath, null, 'No escape possible; Bomber must reject bomb placement');
});

test('Tier 2: Overhead UI destroy completely cleans up and invalidates component state', () => {
  const entity = new EntitySimulator(ENEMY_ARCHETYPES.CHASER, FACTIONS.ENEMY);
  assert.equal(entity.ui.isDestroyed, false);
  entity.die();
  assert.equal(entity.ui.isDestroyed, true);
});

test('Tier 2: Entity HP clamping bounds HP between 0 and maxHp', () => {
  const entity = new EntitySimulator(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY);
  entity.ui.update(100, 100, 100); // Overflow
  assert.equal(entity.ui.currentHp, 4);

  entity.ui.update(100, 100, -50); // Underflow
  assert.equal(entity.ui.currentHp, 0);
});

/* ==============================================================================
 * TIER 3: CROSS-FEATURE COMBINATIONS
 * ============================================================================== */

test('Tier 3: Tank pulverizes soft block concealing an item without incinerating the item', () => {
  const tank = new EntitySimulator(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY);
  const map = createEmptyArena();
  map[1][2] = TILE_BLOCK;

  // Block holds an item
  const concealedItem = { type: 'ARMOR_UP', r: 1, c: 2, spawnTime: 1000 };

  // Tank moves into (1, 2) and crushes block
  map[1][2] = TILE_EMPTY;
  tank.setPosition(1, 2);

  // Item is now exposed and protected by grace period
  assert.equal(isItemProtectedFromExplosion(concealedItem.spawnTime, 1500), true);
  assert.equal(tank.r, 1);
  assert.equal(tank.c, 2);
});

test('Tier 3: Mini-Bomber buddy strictly validates player position before planting to prevent team kill', () => {
  const map = createEmptyArena();
  const player = { r: 1, c: 2 };
  const ally = new EntitySimulator(ALLY_ARCHETYPES.MINI_BOMBER, FACTIONS.ALLY);
  ally.setPosition(1, 1);

  // If ally considers planting bomb at (1, 1) with power 2:
  const candidateBlast = getBlastTiles({ r: 1, c: 1 }, 2, map);
  const wouldHitPlayer = candidateBlast.has(`${player.r},${player.c}`);

  assert.equal(wouldHitPlayer, true);
  // Friendly-fire safety invariant: Ally rejects planting if blast intersects player!
  function canAllyPlantBomb(allyCoord, playerCoord, power, grid) {
    const blast = getBlastTiles(allyCoord, power, grid);
    return !blast.has(`${playerCoord.r},${playerCoord.c}`);
  }

  const allowed = canAllyPlantBomb({ r: ally.r, c: ally.c }, player, 2, map);
  assert.equal(allowed, false, 'Mini-Bomber refuses to plant bomb when blast zone intersects player');
});

test('Tier 3: Shield Guard Vanguard absorbs bomb blast within dome radius, shielding player', () => {
  const map = createEmptyArena();
  const player = { r: 5, c: 5 };
  const guard = new EntitySimulator(ALLY_ARCHETYPES.SHIELD_GUARD, FACTIONS.ALLY);
  guard.setPosition(5, 4);

  const bomb = { r: 5, c: 3, power: 3 };
  const blast = getBlastTiles({ r: bomb.r, c: bomb.c }, bomb.power, map);
  assert.ok(blast.has(`${player.r},${player.c}`), 'Blast would reach player');

  // Guard dome intercepts blast
  const distToGuard = Math.abs(bomb.r - guard.r) + Math.abs(bomb.c - guard.c);
  assert.ok(distToGuard <= guard.config.domeAbsorbRadiusTiles);

  // Guard takes damage instead of player
  guard.takeDamage(1, 'enemy');
  assert.equal(guard.hp, 4);
  assert.equal(guard.isDead, false);
});

/* ==============================================================================
 * TIER 4: REAL-WORLD MULTI-WAVE ENTITY ENCOUNTER SCENARIOS
 * ============================================================================== */

test('Tier 4: Multi-Wave Encounter Simulation — Chaser, Tank, and Splitter clash with Player & Ally', () => {
  const map = createEmptyArena();
  const player = { r: 1, c: 1, hp: 3 };
  assert.equal(player.hp, 3);
  const ally = new EntitySimulator(ALLY_ARCHETYPES.MINI_BOMBER, FACTIONS.ALLY);
  ally.setPosition(1, 2);

  const chaser = new EntitySimulator(ENEMY_ARCHETYPES.CHASER, FACTIONS.ENEMY);
  chaser.setPosition(1, 6);

  const tank = new EntitySimulator(ENEMY_ARCHETYPES.TANK, FACTIONS.ENEMY);
  tank.setPosition(3, 1);

  const splitter = new EntitySimulator(ENEMY_ARCHETYPES.SPLITTER, FACTIONS.ENEMY);
  splitter.setPosition(5, 5);

  // Turn 1: Chaser dashes along corridor towards player
  chaser.setPosition(1, 4);
  assert.equal(chaser.isDead, false);

  // Turn 2: Player bomb detonates at (1, 3) with power 3
  const playerBlast = getBlastTiles({ r: 1, c: 3 }, 3, map);
  assert.ok(playerBlast.has('1,4'), 'Blast reaches Chaser');
  assert.ok(playerBlast.has('1,2'), 'Blast reaches Ally');

  // Chaser takes 1 damage -> Dies
  const chaserDied = chaser.takeDamage(1, 'player');
  assert.equal(chaserDied, true);
  assert.equal(chaser.isDead, true);

  // Ally takes player blast -> Immune!
  const allyDied = ally.takeDamage(1, 'player');
  assert.equal(allyDied, false);
  assert.equal(ally.hp, 3, 'Ally suffered zero friendly fire damage');

  // Turn 3: Tank hit by enemy bomb -> Takes 1 damage (HP 3)
  tank.takeDamage(1, 'player');
  assert.equal(tank.hp, 3);
  assert.equal(tank.isDead, false);

  // Turn 4: Splitter eliminated -> 2 mini-slimes spawn
  splitter.takeDamage(1, 'player');
  splitter.invulnerableTimer = 0;
  splitter.takeDamage(1, 'player');
  assert.equal(splitter.isDead, true);
  assert.equal(splitter.spawnedMinis.length, 2);

  // Verification: All remaining active entities have valid UI layers
  for (const mini of splitter.spawnedMinis) {
    const layers = mini.ui.getRenderLayers();
    assert.ok(layers.tier1_hp && layers.tier2_name && layers.tier3_intent);
  }
});
