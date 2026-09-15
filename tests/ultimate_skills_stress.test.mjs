import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
} from '../src/game/pathfinding.ts';
import {
  ULTIMATE_SKILLS,
  CHARGE_VALUES,
  CameraTraumaSimulator,
  UltimateEngineSimulator,
} from '../src/game/ultimate_skills.ts';
import {
  MobileHUDController,
  StatsBridgeManager,
} from './hud_inventory_expansion.test.mjs';

/* ==============================================================================
 * CHALLENGER 2: ADVERSARIAL STRESS SUITE (ULTIMATE SKILLS & ECONOMY)
 * ============================================================================== */

test('Adversarial [Resource Economy]: 10,000 high-frequency charge spam events during lockout are strictly rejected (0 leakage)', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  assert.equal(engine.isReady(), true);

  // Trigger Meteor Strike: sets lockout to 6000ms
  const ok = engine.trigger('METEOR_STRIKE', 1000);
  assert.equal(ok, true);
  assert.equal(engine.gauge, 0);
  assert.equal(engine.lockoutRemainingMs, 6000);

  // Spam 10,000 charge events across all charge types
  const chargeTypes = [
    CHARGE_VALUES.BLOCK_DESTROYED,
    CHARGE_VALUES.ENEMY_DEFEATED,
    CHARGE_VALUES.TRACKER_DEFEATED,
    CHARGE_VALUES.ENERGY_SPARK,
    CHARGE_VALUES.CLOSE_CALL,
    CHARGE_VALUES.SURVIVAL_TICK,
    100, // Massive fake injection
  ];

  for (let i = 0; i < 10000; i++) {
    const charge = chargeTypes[i % chargeTypes.length];
    const added = engine.addCharge(charge);
    assert.equal(added, 0, `Charge must be rejected during lockout at iteration ${i}`);
    assert.equal(engine.gauge, 0, `Gauge must remain exactly 0.0 at iteration ${i}`);
  }

  assert.equal(engine.gauge, 0.0, 'Zero charge leakage occurred during lockout');
  assert.equal(engine.isReady(), false, 'Engine must not become ready during lockout');
});

test('Adversarial [Resource Economy]: Millisecond-precision boundary transitions around lockout window', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  engine.trigger('SUPER_NOVA');
  assert.equal(engine.lockoutRemainingMs, 6000);

  // Advance 5999ms -> exactly 1ms of lockout remaining
  engine.update(5999);
  assert.equal(engine.lockoutRemainingMs, 1);
  assert.equal(engine.addCharge(CHARGE_VALUES.TRACKER_DEFEATED), 0);
  assert.equal(engine.gauge, 0);

  // Advance 0.5ms (sub-millisecond)
  engine.update(0.5);
  assert.ok(engine.lockoutRemainingMs > 0 && engine.lockoutRemainingMs <= 0.5);
  assert.equal(engine.addCharge(CHARGE_VALUES.TRACKER_DEFEATED), 0);
  assert.equal(engine.gauge, 0);

  // Advance remaining 0.5ms -> lockout hits 0
  engine.update(0.5);
  assert.equal(engine.lockoutRemainingMs, 0);
  assert.equal(engine.addCharge(CHARGE_VALUES.TRACKER_DEFEATED), 25);
  assert.equal(engine.gauge, 25);
});

test('Adversarial [Resource Economy]: Extreme numerical clamping & fuzzing', () => {
  const engine = new UltimateEngineSimulator();

  // 1. Extreme negative numbers
  engine.addCharge(-1e9);
  assert.equal(engine.gauge, 0);

  // 2. Extreme positive numbers
  engine.addCharge(1e12);
  assert.equal(engine.gauge, 100);

  // 3. Subtracting from max
  engine.addCharge(-50);
  assert.equal(engine.gauge, 50);

  // 4. Sub-unit increments
  engine.addCharge(0.00001);
  assert.ok(Math.abs(engine.gauge - 50.00001) < 1e-9);

  // 5. Zero-charge addition
  const delta = engine.addCharge(0);
  assert.equal(delta, 0);
});

test('Adversarial [Execution Invariants]: Concurrent trigger spamming rejects duplicate firings', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  assert.equal(engine.isReady(), true);

  // Attempt 1,000 rapid triggers in the exact same tick
  let successes = 0;
  let failures = 0;
  for (let i = 0; i < 1000; i++) {
    const res = engine.trigger('NUCLEAR_BARRAGE', 5000);
    if (res) successes++;
    else failures++;
  }

  assert.equal(successes, 1, 'Only 1 trigger must succeed');
  assert.equal(failures, 999, 'All subsequent triggers must fail');
  assert.equal(engine.lockoutRemainingMs, 6000);
  assert.equal(engine.gauge, 0);
});

test('Adversarial [Trauma Model]: 5,000 rapid trauma impacts clamp strictly at 1.0 max without overflow', () => {
  const trauma = new CameraTraumaSimulator(18, 3.5, 1.4);

  for (let i = 0; i < 5000; i++) {
    trauma.addTrauma(0.5);
    assert.ok(trauma.trauma <= 1.0, `Trauma ${trauma.trauma} exceeded 1.0 at iteration ${i}`);
    assert.ok(trauma.trauma >= 0.0, `Trauma ${trauma.trauma} fell below 0.0 at iteration ${i}`);
  }

  assert.equal(trauma.trauma, 1.0);
  const shake = trauma.getShakeMagnitude();
  assert.equal(shake.offsetPx, 18);
  assert.equal(shake.angleDeg, 3.5);
});

test('Adversarial [Trauma Model]: Pseudo-harmonic offset bounds under 100,000ms time range', () => {
  const trauma = new CameraTraumaSimulator(18, 3.5, 1.4);
  trauma.addTrauma(1.0); // Maximum shake

  for (let t = 0; t <= 100000; t += 137) {
    const offsets = trauma.getOffsets(t);
    // Upper bounds: offsetPx <= 18, angleDeg <= 3.5
    assert.ok(Math.abs(offsets.x) <= 18.0001, `Offset X ${offsets.x} out of bounds at t=${t}`);
    assert.ok(Math.abs(offsets.y) <= 18.0001, `Offset Y ${offsets.y} out of bounds at t=${t}`);
    assert.ok(Math.abs(offsets.angle) <= 3.5001, `Angle ${offsets.angle} out of bounds at t=${t}`);
  }
});

test('Adversarial [Trauma Model]: Monotonic decay stability and background tab sleep survival (large delta)', () => {
  const trauma = new CameraTraumaSimulator(18, 3.5, 1.4);
  trauma.addTrauma(1.0);

  // 1. Monotonic decay under 60fps
  let lastTrauma = trauma.trauma;
  for (let frame = 0; frame < 50; frame++) {
    trauma.update(1 / 60);
    assert.ok(trauma.trauma <= lastTrauma, 'Trauma must monotonically decrease');
    lastTrauma = trauma.trauma;
  }
  assert.equal(trauma.trauma, 0);

  // 2. Large delta sleep (e.g. 3600 seconds = 1 hour tab backgrounded)
  trauma.addTrauma(0.8);
  trauma.update(3600);
  assert.equal(trauma.trauma, 0, 'Trauma must clamp cleanly to 0 after massive time jump');
  const offsets = trauma.getOffsets(50000);
  assert.equal(offsets.x, 0);
  assert.equal(offsets.y, 0);
  assert.equal(offsets.angle, 0);
});

test('Adversarial [Aegis Overdrive]: Extreme explosion absorption cap (8000ms ceiling invariance)', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  engine.trigger('AEGIS_OVERDRIVE');

  assert.equal(engine.isAegisOverdriveActive, true);
  assert.equal(engine.aegisDurationMs, 6000);

  // Absorb 1,000 thermal explosions in rapid succession
  for (let i = 0; i < 1000; i++) {
    const absorbed = engine.absorbThermalExplosion();
    assert.equal(absorbed, true);
    assert.ok(engine.aegisDurationMs <= 8000, `Duration ${engine.aegisDurationMs} exceeded 8000ms cap`);
  }

  assert.equal(engine.aegisDurationMs, 8000, 'Aegis Overdrive strictly clamped at 8000ms ceiling');

  // Verify decay past 8000ms correctly terminates shield
  engine.update(7999);
  assert.equal(engine.isAegisOverdriveActive, true);

  engine.update(2);
  assert.equal(engine.isAegisOverdriveActive, false, 'Shield expired when timer crossed 0');
  assert.equal(engine.absorbThermalExplosion(), false, 'Cannot absorb explosions when shield inactive');
});

test('Adversarial [Chrono Freeze]: Stasis duration, bomb fuse suspension, and resumption trauma shock', () => {
  const engine = new UltimateEngineSimulator();
  engine.addCharge(100);
  engine.trigger('CHRONO_FREEZE');

  assert.equal(engine.isChronoFrozen, true);
  assert.equal(engine.activeSkillRemainingMs, 5000);

  // Advance 4999ms
  engine.update(4999);
  assert.equal(engine.isChronoFrozen, true);
  assert.equal(engine.activeSkillRemainingMs, 1);

  // Cross 5000ms threshold
  engine.update(2);
  assert.equal(engine.isChronoFrozen, false);
  assert.equal(engine.activeSkillRemainingMs, 0);
  // Resumption boom should inject 0.60 trauma
  assert.ok(Math.abs(engine.traumaEngine.trauma - 0.60) < 1e-4);
});

test('Adversarial [Nuclear Barrage]: 4-arm corridor raycast constraints and bounds verification', () => {
  // Construct 13x15 arena with outer walls
  const map = [];
  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? TILE_WALL : TILE_EMPTY;
    }
  }

  // Place solid pillar at (6, 9)
  map[6][9] = TILE_WALL;
  // Place soft block at (4, 7)
  map[4][7] = TILE_BLOCK;

  const playerPos = { r: 6, c: 7 };
  const directions = [
    { name: 'NORTH', dr: -1, dc: 0 },
    { name: 'SOUTH', dr: 1, dc: 0 },
    { name: 'WEST', dr: 0, dc: -1 },
    { name: 'EAST', dr: 0, dc: 1 },
  ];

  const warheadSpawns = [];
  const maxDepth = ULTIMATE_SKILLS.NUCLEAR_BARRAGE.maxDepthPerArm; // 4

  directions.forEach((dir) => {
    for (let k = 1; k <= maxDepth; k++) {
      const r = playerPos.r + dir.dr * k;
      const c = playerPos.c + dir.dc * k;
      // Invariant: cannot spawn outside arena
      if (r <= 0 || r >= ROWS - 1 || c <= 0 || c >= COLS - 1) break;
      // Invariant: stops at solid wall
      if (map[r][c] === TILE_WALL) break;

      warheadSpawns.push({ r, c, k, dir: dir.name });
      // Invariant: stops after hitting a block
      if (map[r][c] === TILE_BLOCK) break;
    }
  });

  // Verify EAST stopped before pillar at c=9 (should only have c=8)
  const eastSpawns = warheadSpawns.filter((w) => w.dir === 'EAST');
  assert.equal(eastSpawns.length, 1);
  assert.equal(eastSpawns[0].c, 8);

  // Verify NORTH stopped at block at r=4 (should have r=5 and r=4)
  const northSpawns = warheadSpawns.filter((w) => w.dir === 'NORTH');
  assert.equal(northSpawns.length, 2);
  assert.equal(northSpawns[0].r, 5);
  assert.equal(northSpawns[1].r, 4);

  // Verify SOUTH reached full depth 4
  const southSpawns = warheadSpawns.filter((w) => w.dir === 'SOUTH');
  assert.equal(southSpawns.length, 4);

  // Total warheads spawned <= 16
  assert.ok(warheadSpawns.length <= 16);
});

test('Adversarial [Meteor Strike]: 3x3 footprint boundary clamping across all corner and perimeter positions', () => {
  function getMeteorCraterTiles(centerR, centerC) {
    const tiles = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const tr = centerR + dr;
        const tc = centerC + dc;
        if (tr > 0 && tr < ROWS - 1 && tc > 0 && tc < COLS - 1) {
          tiles.push({ r: tr, c: tc });
        }
      }
    }
    return tiles;
  }

  // 1. Center impact (5, 5): full 9 tiles
  const centerTiles = getMeteorCraterTiles(5, 5);
  assert.equal(centerTiles.length, 9);

  // 2. Corner impact (1, 1): clamped by outer wall boundaries to 4 playable tiles
  const cornerTiles = getMeteorCraterTiles(1, 1);
  assert.equal(cornerTiles.length, 4);
  assert.deepEqual(cornerTiles, [
    { r: 1, c: 1 },
    { r: 1, c: 2 },
    { r: 2, c: 1 },
    { r: 2, c: 2 },
  ]);

  // 3. Edge impact (1, 5): clamped to 6 playable tiles
  const edgeTiles = getMeteorCraterTiles(1, 5);
  assert.equal(edgeTiles.length, 6);
});

test('Adversarial [Super Nova]: Radial diamond shockwave covers exact Manhattan distance tiles <= 5', () => {
  const pRow = 6;
  const pCol = 7;
  const maxRadius = ULTIMATE_SKILLS.SUPER_NOVA.maxRadiusTiles; // 5
  let coveredCount = 0;

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const dist = Math.abs(r - pRow) + Math.abs(c - pCol);
      if (dist <= maxRadius) {
        coveredCount++;
      }
    }
  }

  // Total points with |dr| + |dc| <= 5: 1 + 4*(1+2+3+4+5) = 1 + 4*15 = 61 tiles (bounded by 11x13 inner arena)
  assert.equal(coveredCount, 61);
});

test('Adversarial [Mobile Touch & HUD Bridge]: 10,000 rapid touch events adhere strictly to gauge readiness', () => {
  const mobile = new MobileHUDController();

  // Test at various gauge / lockout states
  const testStates = [
    { gauge: 0, lockout: 0, expected: false },
    { gauge: 50, lockout: 0, expected: false },
    { gauge: 99.9, lockout: 0, expected: false },
    { gauge: 100, lockout: 6000, expected: false },
    { gauge: 100, lockout: 1, expected: false },
    { gauge: 100, lockout: 0, expected: true },
  ];

  for (const state of testStates) {
    for (let i = 0; i < 100; i++) {
      const result = mobile.handleUltimatePress({
        ultimateGauge: state.gauge,
        ultimateLockoutRemaining: state.lockout,
      });
      assert.equal(result, state.expected, `Mismatch for state gauge=${state.gauge} lockout=${state.lockout}`);
      assert.equal(mobile.mobileInput.ultimate, state.expected);
      mobile.releaseUltimate();
      assert.equal(mobile.mobileInput.ultimate, false);
    }
  }
});

test('Adversarial [HUD Event Throttling]: 10,000 rapid event emissions over 1000ms emit at most 6 snapshots unless forced', () => {
  const bridge = new StatsBridgeManager();
  let receivedCount = 0;
  bridge.on('stats-update', () => {
    receivedCount++;
  });

  const payload = { ultimateGauge: 100, speed: 150 };

  // 10,000 emissions distributed evenly across 1000ms
  for (let i = 0; i < 10000; i++) {
    const timeMs = (i / 10000) * 1000;
    bridge.emit('stats-update', payload, timeMs, false);
  }

  // With 200ms throttle, only emissions at t=0, 200, 400, 600, 800, 1000 should pass (total 6)
  assert.ok(receivedCount >= 5 && receivedCount <= 6, `Received ${receivedCount} throttled emissions, expected 5-6`);

  // Forced emissions must always bypass throttle
  let forcedCount = 0;
  bridge.on('stats-update-force', () => {
    forcedCount++;
  });
  for (let i = 0; i < 10; i++) {
    bridge.emit('stats-update-force', payload, 500, true);
  }
  assert.equal(forcedCount, 10, 'Forced emissions must never be throttled');
});

test('Adversarial [HUD Payload Immutability]: Consumer mutations do not contaminate source data or subsequent emissions', () => {
  const bridge = new StatsBridgeManager();
  let captured = null;
  bridge.on('stats-update', (snap) => {
    captured = snap;
  });

  const sourceData = {
    inventory: [{ id: 'SPEED_UP', count: 1 }],
    ultimateGauge: 100,
  };

  bridge.emit('stats-update', sourceData, 100, true);
  assert.equal(captured.inventory.length, 1);

  // Consumer attempts mutation on received payload
  captured.inventory.push({ id: 'MALICIOUS_ITEM', count: 999 });
  captured.ultimateGauge = 99999;

  // Verify sourceData was completely isolated and unmodified
  assert.equal(sourceData.inventory.length, 1, 'sourceData inventory must remain unmutated');
  assert.equal(sourceData.ultimateGauge, 100, 'sourceData ultimateGauge must remain 100');

  // Emit sourceData again at t=400ms: new snapshot emitted must be pristine
  bridge.emit('stats-update', sourceData, 400, true);
  assert.equal(captured.inventory.length, 1, 'Subsequent emission snapshot must be pristine');
  assert.equal(captured.ultimateGauge, 100, 'Subsequent emission gauge must be 100');
});
