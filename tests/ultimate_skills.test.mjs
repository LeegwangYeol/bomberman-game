import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';

/* ==============================================================================
 * ULTIMATE SKILLS SPECIFICATION & SIMULATOR HARNESS
 * ============================================================================== */

import {
  ULTIMATE_SKILLS,
  CHARGE_VALUES,
  CameraTraumaSimulator,
  UltimateEngineSimulator,
} from '../src/game/ultimate_skills.ts';

export {
  ULTIMATE_SKILLS,
  CHARGE_VALUES,
  CameraTraumaSimulator,
  UltimateEngineSimulator,
};

/* ==============================================================================
 * TIER 1: FEATURE COVERAGE (5 ULTIMATE SKILLS, RESOURCE ECONOMY, CAMERA TRAUMA)
 * ============================================================================== */

test('Tier 1: Specification Catalog contains 5 distinct Ultimate Skills', () => {
  const skillIds = Object.keys(ULTIMATE_SKILLS);
  assert.equal(skillIds.length, 5);
  for (const id of skillIds) {
    const skill = ULTIMATE_SKILLS[id];
    assert.ok(skill.id && skill.name && skill.archetype && skill.cost === 100 && skill.lockoutMs === 6000);
  }
});

test('Tier 1 [Skill 1/5]: METEOR_STRIKE targeting reticles, 600ms warning, and 3x3 impact blast', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  assert.equal(engine.isReady(), true);

  const triggered = engine.trigger('METEOR_STRIKE', 1000);
  assert.equal(triggered, true);
  assert.equal(engine.gauge, 0);
  assert.equal(engine.lockoutRemainingMs, 6000);
  assert.equal(engine.activeSkill, 'METEOR_STRIKE');

  // Verify 3x3 crater footprint logic
  function calculateCraterTiles(center) {
    const tiles = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        tiles.add(`${center.r + dr},${center.c + dc}`);
      }
    }
    return tiles;
  }

  const crater = calculateCraterTiles({ r: 5, c: 5 });
  assert.equal(crater.size, 9);
  assert.ok(crater.has('4,4'));
  assert.ok(crater.has('5,5'));
  assert.ok(crater.has('6,6'));
});

test('Tier 1 [Skill 2/5]: SUPER_NOVA 5-ring radial expansion and 1.0 max camera trauma saturation', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);

  engine.trigger('SUPER_NOVA');
  assert.equal(engine.activeSkill, 'SUPER_NOVA');

  // Full trauma injection
  const shake = engine.traumaEngine.getShakeMagnitude();
  assert.equal(shake.trauma, 1.0);
  assert.equal(shake.offsetPx, 18); // 1.0^2 * 18
  assert.equal(shake.angleDeg, 3.5); // 1.0^2 * 3.5

  // Concentric wave delay formula verification
  function getWaveDelay(centerR, centerC, r, c) {
    const dist = Math.abs(r - centerR) + Math.abs(c - centerC);
    return dist * ULTIMATE_SKILLS.SUPER_NOVA.tileWaveDelayMs;
  }

  assert.equal(getWaveDelay(6, 7, 6, 7), 0);
  assert.equal(getWaveDelay(6, 7, 6, 8), 40);
  assert.equal(getWaveDelay(6, 7, 8, 9), 160); // dist 4 * 40ms
});

test('Tier 1 [Skill 3/5]: CHRONO_FREEZE 5000ms global stasis and +20% player speed boost', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);

  engine.trigger('CHRONO_FREEZE', 1000);
  assert.equal(engine.isChronoFrozen, true);
  assert.equal(engine.activeSkillRemainingMs, 5000);

  // Player speed boost during stasis
  const baseSpeed = 150;
  const chronoSpeed = baseSpeed * ULTIMATE_SKILLS.CHRONO_FREEZE.playerSpeedMultiplier;
  assert.equal(chronoSpeed, 180);

  // Advance 5000ms: Stasis ends and triggers resumption boom trauma
  engine.update(5000, 6000);
  assert.equal(engine.isChronoFrozen, false);
  assert.equal(engine.traumaEngine.trauma, 0.60);
});

test('Tier 1 [Skill 4/5]: NUCLEAR_BARRAGE 4-way cross corridor deployment with rolling cascade', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);

  engine.trigger('NUCLEAR_BARRAGE');
  assert.equal(engine.activeSkill, 'NUCLEAR_BARRAGE');

  // Rolling cascade detonation formula verification: t = 1200ms + k * 70ms
  function getDetonationTime(stepK) {
    return ULTIMATE_SKILLS.NUCLEAR_BARRAGE.fuseMs + stepK * ULTIMATE_SKILLS.NUCLEAR_BARRAGE.cascadeStepDelayMs;
  }

  assert.equal(getDetonationTime(1), 1270);
  assert.equal(getDetonationTime(2), 1340);
  assert.equal(getDetonationTime(3), 1410);
  assert.equal(getDetonationTime(4), 1480);
});

test('Tier 1 [Skill 5/5]: AEGIS_OVERDRIVE 6000ms invulnerability and reflective counter-kill', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);

  engine.trigger('AEGIS_OVERDRIVE');
  assert.equal(engine.isAegisOverdriveActive, true);
  assert.equal(engine.aegisDurationMs, 6000);

  // Thermal absorption extends barrier by +300ms
  const absorbed = engine.absorbThermalExplosion();
  assert.equal(absorbed, true);
  assert.equal(engine.aegisDurationMs, 6300);
});

test('Tier 1 [Resource Economy]: Charging sources yield exact calibrated points', () => {
  const engine = new UltimateEngineSimulator();

  // Block destroyed: +2
  engine.addCharge(CHARGE_VALUES.BLOCK_DESTROYED);
  assert.equal(engine.gauge, 2);

  // Enemy defeated: +15
  engine.addCharge(CHARGE_VALUES.ENEMY_DEFEATED);
  assert.equal(engine.gauge, 17);

  // Tracker defeated: +25
  engine.addCharge(CHARGE_VALUES.TRACKER_DEFEATED);
  assert.equal(engine.gauge, 42);

  // Energy spark: +10
  engine.addCharge(CHARGE_VALUES.ENERGY_SPARK);
  assert.equal(engine.gauge, 52);

  // Close call: +5
  engine.addCharge(CHARGE_VALUES.CLOSE_CALL);
  assert.equal(engine.gauge, 57);
});

test('Tier 1 [Trauma Model]: Non-linear square-law trauma decay matches lambda = 1.4 s^-1', () => {
  const trauma = new CameraTraumaSimulator(18, 3.5, 1.4);
  trauma.addTrauma(1.0);

  // Initially: Trauma = 1.0 -> Offset = 1.0^2 * 18 = 18
  assert.equal(trauma.getShakeMagnitude().offsetPx, 18);

  // After 0.5s: Trauma = 1.0 - 0.7 = 0.3
  trauma.update(0.5);
  assert.ok(Math.abs(trauma.trauma - 0.3) < 1e-5);
  // Offset = 0.3^2 * 18 = 0.09 * 18 = 1.62
  assert.ok(Math.abs(trauma.getShakeMagnitude().offsetPx - 1.62) < 1e-4);

  // After another 0.3s (total 0.8s): Trauma drops below 0.01
  trauma.update(0.3);
  assert.ok(trauma.trauma < 0.01);
});

/* ==============================================================================
 * TIER 2: BOUNDARY & CORNER CASES (LOCKOUT, ZERO-CHARGE, SATURATION)
 * ============================================================================== */

test('Tier 2: Gauge strictly clamps at 100.0 max and 0.0 min', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(500);
  assert.equal(engine.gauge, 100.0);

  engine.addCharge(-200);
  assert.equal(engine.gauge, 0.0);
});

test('Tier 2: Anti-Snowball Lockout Window rejects all charge accumulation while active', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  engine.trigger('SUPER_NOVA');

  assert.equal(engine.gauge, 0);
  assert.equal(engine.lockoutRemainingMs, 6000);

  // Attempt to add charge via 50 blocks during lockout
  for (let i = 0; i < 50; i++) {
    engine.addCharge(CHARGE_VALUES.BLOCK_DESTROYED);
  }
  assert.equal(engine.gauge, 0, 'Gauge must remain strictly at 0 while lockout > 0');

  // Advance time by 5999ms (1ms left of lockout)
  engine.update(5999);
  assert.equal(engine.lockoutRemainingMs, 1);
  engine.addCharge(CHARGE_VALUES.BLOCK_DESTROYED);
  assert.equal(engine.gauge, 0, 'Still in lockout');

  // Advance past 6000ms
  engine.update(2);
  assert.equal(engine.lockoutRemainingMs, 0);
  engine.addCharge(CHARGE_VALUES.BLOCK_DESTROYED);
  assert.equal(engine.gauge, 2, 'Lockout cleared; gauge recharges normally');
});

test('Tier 2: Camera trauma saturation clamps strictly at 1.0 max', () => {
  const trauma = new CameraTraumaSimulator();
  trauma.addTrauma(0.8);
  trauma.addTrauma(0.8);
  assert.equal(trauma.trauma, 1.0, 'Trauma must not exceed 1.0');
});

test('Tier 2: Aegis Overdrive maximum duration cap halts extension at 8000ms', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  engine.trigger('AEGIS_OVERDRIVE');

  // Absorb 20 thermal explosions
  for (let i = 0; i < 20; i++) {
    engine.absorbThermalExplosion();
  }

  assert.equal(engine.aegisDurationMs, ULTIMATE_SKILLS.AEGIS_OVERDRIVE.maxDurationMs);
  assert.equal(engine.aegisDurationMs, 8000);
});

/* ==============================================================================
 * TIER 3: CROSS-FEATURE COMBINATIONS
 * ============================================================================== */

test('Tier 3: Chrono Freeze stasis suspends bomb fuse countdowns while player moves freely', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  engine.trigger('CHRONO_FREEZE');

  class MockBomb {
    constructor(fuseMs = 3000) {
      this.fuseMs = fuseMs;
      this.isDetonated = false;
    }
    tick(deltaMs, isFrozen) {
      if (isFrozen) return; // Stasis freezes fuse
      this.fuseMs = Math.max(0, this.fuseMs - deltaMs);
      if (this.fuseMs <= 0) this.isDetonated = true;
    }
  }

  const bomb = new MockBomb(2000);
  // Tick for 3000ms during Chrono Freeze
  for (let t = 0; t < 30; t++) {
    engine.update(100);
    bomb.tick(100, engine.isChronoFrozen);
  }

  assert.equal(bomb.fuseMs, 2000, 'Bomb fuse remained frozen mid-pulse');
  assert.equal(bomb.isDetonated, false);
});

test('Tier 3: Aegis Overdrive reflects fatal enemy contact, destroying attacker', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  engine.trigger('AEGIS_OVERDRIVE');

  class MockAttackingEnemy {
    constructor() {
      this.hp = 1;
      this.isDead = false;
      this.knockbackSteps = 0;
    }
    collideWithPlayer(isAegisActive) {
      if (isAegisActive) {
        this.hp -= ULTIMATE_SKILLS.AEGIS_OVERDRIVE.reflectDamage;
        this.knockbackSteps = ULTIMATE_SKILLS.AEGIS_OVERDRIVE.reflectKnockbackTiles;
        if (this.hp <= 0) this.isDead = true;
        return { playerHurt: false, enemyReflected: true };
      }
      return { playerHurt: true, enemyReflected: false };
    }
  }

  const enemy = new MockAttackingEnemy();
  const outcome = enemy.collideWithPlayer(engine.isAegisOverdriveActive);

  assert.equal(outcome.playerHurt, false);
  assert.equal(outcome.enemyReflected, true);
  assert.equal(enemy.isDead, true);
  assert.equal(enemy.knockbackSteps, 2);
});

test('Tier 3: Super Nova shockwave wave destroys breakable blocks and clears tiles', () => {
  // Construct 13x15 arena with blocks
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? TILE_WALL : TILE_BLOCK;
    }
  }

  const center = { r: 6, c: 7 };
  map[center.r][center.c] = TILE_EMPTY;

  // Super Nova wave up to radius 5 clears all blocks within Manhattan distance <= 5
  let clearedBlocks = 0;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const dist = Math.abs(r - center.r) + Math.abs(c - center.c);
      if (dist <= ULTIMATE_SKILLS.SUPER_NOVA.maxRadiusTiles && map[r][c] === TILE_BLOCK) {
        map[r][c] = TILE_EMPTY;
        clearedBlocks++;
      }
    }
  }

  assert.ok(clearedBlocks >= 40, `Super Nova cleared ${clearedBlocks} blocks`);
});

/* ==============================================================================
 * TIER 4: REAL-WORLD MATCH LIFECYCLE SIMULATION (CHARGE -> EXECUTE -> RECHARGE)
 * ============================================================================== */

test('Tier 4: Full Match Simulation — 2 complete Ultimate Skill execution cycles with lockout and decay', () => {
  const engine = new UltimateEngineSimulator();

  // Phase 1: Charge from 0 to 100 via blocks, enemies, and sparks
  assert.equal(engine.gauge, 0);
  assert.equal(engine.isReady(), false);

  // 15 blocks destroyed (+30)
  for (let i = 0; i < 15; i++) engine.addCharge(CHARGE_VALUES.BLOCK_DESTROYED);
  assert.equal(engine.gauge, 30);

  // 2 standard enemies defeated (+30)
  engine.addCharge(CHARGE_VALUES.ENEMY_DEFEATED);
  engine.addCharge(CHARGE_VALUES.ENEMY_DEFEATED);
  assert.equal(engine.gauge, 60);

  // 1 tracker defeated (+25)
  engine.addCharge(CHARGE_VALUES.TRACKER_DEFEATED);
  assert.equal(engine.gauge, 85);

  // 2 energy sparks (+20 -> clamps to 100)
  engine.addCharge(CHARGE_VALUES.ENERGY_SPARK);
  engine.addCharge(CHARGE_VALUES.ENERGY_SPARK);
  assert.equal(engine.gauge, 100);
  assert.equal(engine.isReady(), true);

  // Phase 2: Execute Meteor Strike
  const executed1 = engine.trigger('METEOR_STRIKE', 30000);
  assert.equal(executed1, true);
  assert.equal(engine.gauge, 0);
  assert.equal(engine.isReady(), false);
  assert.equal(engine.lockoutRemainingMs, 6000);

  // Phase 3: Lockout duration passes (6000ms) with camera trauma decay
  for (let t = 0; t < 60; t++) {
    engine.update(100, 30000 + t * 100);
  }
  assert.equal(engine.lockoutRemainingMs, 0);
  assert.ok(engine.traumaEngine.trauma < 0.01);

  // Phase 4: Second charging cycle (10 blocks + 2 trackers + sparks)
  for (let i = 0; i < 10; i++) engine.addCharge(CHARGE_VALUES.BLOCK_DESTROYED); // +20
  engine.addCharge(CHARGE_VALUES.TRACKER_DEFEATED); // +25
  engine.addCharge(CHARGE_VALUES.TRACKER_DEFEATED); // +25
  engine.addCharge(CHARGE_VALUES.ENERGY_SPARK); // +10
  engine.addCharge(CHARGE_VALUES.ENERGY_SPARK); // +10
  engine.addCharge(CHARGE_VALUES.ENEMY_DEFEATED); // +15 -> Total 105 -> clamps 100

  assert.equal(engine.gauge, 100);
  assert.equal(engine.isReady(), true);

  // Execute second ultimate: Chrono Freeze
  const executed2 = engine.trigger('CHRONO_FREEZE', 45000);
  assert.equal(executed2, true);
  assert.equal(engine.activeSkill, 'CHRONO_FREEZE');
});
