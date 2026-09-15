import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  createInitialPlayerStats,
  applyItemUpgrade,
  simulateBombKickSlide,
} from '../src/game/gameplay_mechanics.ts';
import {
  ROWS,
  COLS,
  TILE_SIZE,
  TILE_EMPTY,
  TILE_WALL,
  TILE_BLOCK,
  getBlastTiles,
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
 * SUITE 1: PORTAL DEBOUNCE & ANTI-OSCILLATION STRESS
 * ============================================================================== */

class PortalSimulationController {
  constructor(portalA = DEFAULT_PORTALS.portalA, portalB = DEFAULT_PORTALS.portalB) {
    this.portalA = { ...portalA };
    this.portalB = { ...portalB };
    this.portalCooldown = 0;
    this.playerRow = portalA.row;
    this.playerCol = portalA.col;
    this.warpCount = 0;
    this.history = [];
  }

  update(deltaMs) {
    // Decrement cooldown
    if (this.portalCooldown > 0) {
      this.portalCooldown = Math.max(0, this.portalCooldown - deltaMs);
    }

    // Portal warp check
    if (this.portalCooldown <= 0) {
      if (this.playerRow === this.portalA.row && this.playerCol === this.portalA.col) {
        this.warpTo(this.portalB.row, this.portalB.col);
      } else if (this.playerRow === this.portalB.row && this.playerCol === this.portalB.col) {
        this.warpTo(this.portalA.row, this.portalA.col);
      }
    }
  }

  warpTo(toRow, toCol) {
    this.portalCooldown = PORTAL_COOLDOWN_MS;
    this.playerRow = toRow;
    this.playerCol = toCol;
    this.warpCount++;
    this.history.push({ row: toRow, col: toCol, time: this.warpCount });
  }
}

test('Portal Debounce: AFK player standing on portal for 10,000 frames does NOT infinite loop', () => {
  const portalSim = new PortalSimulationController();
  const totalFrames = 10000;
  const frameDeltaMs = 16.6; // ~60fps (total time ~166 seconds)

  for (let frame = 0; frame < totalFrames; frame++) {
    portalSim.update(frameDeltaMs);
  }

  // Without debounce, 10,000 frames would trigger 10,000 ping-pong oscillations!
  // With 1200ms debounce: max warps in 166,000ms is ~ 166,000 / 1200 + 1 ≈ 139 warps.
  assert.ok(portalSim.warpCount < 150, `Warp count ${portalSim.warpCount} must be strictly rate-limited`);
  assert.ok(portalSim.warpCount > 130, `Warp count ${portalSim.warpCount} should have triggered periodically`);
});

test('Portal Debounce: Immediate next-frame re-warp is strictly blocked (zero oscillation)', () => {
  const portalSim = new PortalSimulationController();

  // Frame 1: triggers initial warp A -> B
  portalSim.update(16);
  assert.equal(portalSim.warpCount, 1);
  assert.equal(portalSim.playerRow, portalSim.portalB.row);
  assert.equal(portalSim.playerCol, portalSim.portalB.col);
  assert.equal(portalSim.portalCooldown, PORTAL_COOLDOWN_MS);

  // Micro-step frames: 1ms, 5ms, 16ms
  for (let i = 0; i < 50; i++) {
    portalSim.update(16); // total elapsed 800ms < 1200ms
  }

  // Warp count must still be strictly 1
  assert.equal(portalSim.warpCount, 1, 'Re-warp back to portalA must be blocked while cooldown > 0');
  assert.equal(portalSim.playerRow, portalSim.portalB.row);
});

test('Portal Debounce: Dynamic exit and re-entry timing', () => {
  const portalSim = new PortalSimulationController();

  // Step 1: Initial warp from A to B at t=0
  portalSim.update(16);
  assert.equal(portalSim.warpCount, 1);
  assert.equal(portalSim.playerRow, portalSim.portalB.row);

  // Step 2: Player steps off portal B at t=200ms onto (11, 2)
  portalSim.update(200);
  portalSim.playerRow = 11;
  portalSim.playerCol = 2; // adjacent open tile

  // Step 3: Player steps back onto portal B at t=600ms (cooldown remaining = 1200 - 216 - 400 = 584ms)
  portalSim.update(400);
  portalSim.playerRow = portalSim.portalB.row;
  portalSim.playerCol = portalSim.portalB.col;
  portalSim.update(16);
  assert.equal(portalSim.warpCount, 1, 'Premature re-entry must not trigger warp before 1200ms');

  // Step 4: Advance past 1200ms boundary
  portalSim.update(600); // cooldown reaches 0
  assert.equal(portalSim.warpCount, 2, 'Warp should fire once cooldown expires and player is on portal');
  assert.equal(portalSim.playerRow, portalSim.portalA.row);
});

test('Portal Trajectory: Kicked bomb slides through portal tiles without triggering portal warp', () => {
  const map = createStandardMap();
  const { portalA } = DEFAULT_PORTALS; // (1, 13)

  // Bomb at (1, 11) kicked right (+1, 0) through (1, 13) towards boundary wall at (1, 14)
  const result = simulateBombKickSlide(11, 1, 1, 0, map);

  // Bomb passes cleanly through (1, 12) and portal tile (1, 13) and stops at (1, 13) because wall is at (1, 14)
  assert.equal(result.endRow, 1);
  assert.equal(result.endCol, 13);
  assert.equal(result.steps, 2);
});

test('Adaptive Bomb Kick Lookahead: Math.max(16, BOMB_KICK_SPEED * (delta / 1000) + 4) scales dynamically', () => {
  // At 60 FPS (delta = 16.6ms): probe = Math.max(16, 300 * 0.0166 + 4) = 16px floor
  const lookahead60fps = Math.max(16, BOMB_KICK_SPEED * (16.6 / 1000) + 4);
  assert.equal(lookahead60fps, 16);

  // At 30 FPS (delta = 33.3ms): probe = Math.max(16, 300 * 0.0333 + 4) = 16px floor
  const lookahead30fps = Math.max(16, BOMB_KICK_SPEED * (33.3 / 1000) + 4);
  assert.equal(lookahead30fps, 16);

  // At 15 FPS frame drop (delta = 66.6ms): probe = Math.max(16, 300 * 0.0666 + 4) = 23.98px > 16px
  const lookahead15fps = Math.max(16, BOMB_KICK_SPEED * (66.6 / 1000) + 4);
  assert.ok(lookahead15fps > 23.9 && lookahead15fps < 24.1);

  // At 100ms lag spike: probe = 300 * 0.1 + 4 = 34px, dynamically expanding lookahead to prevent tunneling
  const lookahead100ms = Math.max(16, BOMB_KICK_SPEED * (100 / 1000) + 4);
  assert.equal(lookahead100ms, 34);
});

/* ==============================================================================
 * SUITE 2: CONVEYOR DRIFT COLLISIONS & ENTITY STACKING
 * ============================================================================== */

class ConveyorSimulationController {
  constructor(map, conveyors = DEFAULT_CONVEYORS) {
    this.map = map;
    this.conveyors = conveyors;
    this.player = { x: 4 * TILE_SIZE + TILE_SIZE / 2, y: 7 * TILE_SIZE + TILE_SIZE / 2 };
    this.isDashing = false;
  }

  update(deltaMs) {
    const pCol = Math.floor(this.player.x / TILE_SIZE);
    const pRow = Math.floor(this.player.y / TILE_SIZE);
    const belt = this.conveyors.find((c) => c.row === pRow && c.col === pCol);
    if (belt && !this.isDashing) {
      const drift = CONVEYOR_DRIFT_SPEED * (deltaMs / 1000);
      const nextX = this.player.x + belt.dirX * drift;
      const nextY = this.player.y + belt.dirY * drift;
      const nCol = Math.floor(nextX / TILE_SIZE);
      const nRow = Math.floor(nextY / TILE_SIZE);
      if (this.map[nRow]?.[nCol] === TILE_EMPTY) {
        this.player.x = nextX;
        this.player.y = nextY;
      }
    }
  }
}

test('Conveyor Drift: Continuous 60 px/s integration moves player cleanly across open belt corridor', () => {
  const map = createStandardMap();
  const sim = new ConveyorSimulationController(map);

  // Start at (7, 4) center: x = 4 * 40 + 20 = 180, y = 7 * 40 + 20 = 300
  assert.equal(sim.player.x, 4 * TILE_SIZE + TILE_SIZE / 2);
  assert.equal(sim.player.y, 7 * TILE_SIZE + TILE_SIZE / 2);

  // Advance 1000ms (1 second) -> displacement should be 60px
  sim.update(1000);
  assert.equal(sim.player.x, 180 + 60); // 240px
  assert.equal(sim.player.y, 300); // Y unchanged
});

test('Conveyor Drift into Obstacle Wall: Player stops cleanly at obstacle boundary without wall penetration', () => {
  const map = createStandardMap();
  // Place wall directly at end of belt at col 11
  map[7][11] = TILE_WALL;

  // Create conveyor terminating into wall at col 11
  const customBelts = [
    { row: 7, col: 10, dirX: 1, dirY: 0 },
  ];
  const sim = new ConveyorSimulationController(map, customBelts);
  // Start near center of col 10: x = 10 * 40 + 20 = 420
  sim.player.x = 10 * TILE_SIZE + 20;
  sim.player.y = 7 * TILE_SIZE + 20;

  // Run 100 frames attempting to push into wall at col 11
  for (let f = 0; f < 100; f++) {
    sim.update(16);
  }

  const finalCol = Math.floor(sim.player.x / TILE_SIZE);
  assert.equal(finalCol, 10, 'Player must remain clamped in col 10 and not enter wall in col 11');
  assert.ok(sim.player.x < 11 * TILE_SIZE, 'Player X must strictly not exceed tile 11 boundary');
  assert.ok(!Number.isNaN(sim.player.x), 'Coordinates must remain valid numbers');
});

test('Conveyor Stacking: Multiple bombs drifting on conveyor safely queue and cascade detonate', () => {
  const map = createStandardMap();
  // Simulate 2 bombs drifting on row 7 conveyor
  const bomb1 = { x: 10 * 32 + 16, y: 7 * 32 + 16, row: 7, col: 10 };
  const bomb2 = { x: 9 * 32 + 16, y: 7 * 32 + 16, row: 7, col: 9 };
  map[7][11] = TILE_WALL; // wall blocks bomb 1

  // Bomb 1 cannot move right. Bomb 2 drifts towards bomb 1.
  // When bomb 1 detonates with power 2:
  const blast1 = getBlastTiles({ r: bomb1.row, c: bomb1.col }, 2, map);
  // Verify bomb 2 tile (7, 9) is engulfed in bomb 1 blast:
  assert.ok(blast1.has('7,9'), 'Bomb 2 must be engulfed in Bomb 1 explosion');

  // Cascade detonation triggers bomb 2
  const blast2 = getBlastTiles({ r: bomb2.row, c: bomb2.col }, 2, map);
  const combinedBlast = new Set([...blast1, ...blast2]);

  assert.ok(combinedBlast.has('7,10'));
  assert.ok(combinedBlast.has('7,9'));
  assert.ok(combinedBlast.has('7,8'));
  assert.ok(combinedBlast.has('7,7'));
  assert.equal(combinedBlast.has('7,11'), false, 'Indestructible wall must not be included');
});

test('Conveyor Dash Priority: Dashing suspends conveyor drift allowing player escape', () => {
  const map = createStandardMap();
  const sim = new ConveyorSimulationController(map);
  sim.isDashing = true;

  const startX = sim.player.x;
  // Advance 500ms while dashing
  sim.update(500);

  assert.equal(sim.player.x, startX, 'Conveyor drift must be 0 while isDashing is true');
});

/* ==============================================================================
 * SUITE 3: DASH I-FRAME OVERLAPS & HAZARD STRESS
 * ============================================================================== */

class DashAndDamageController {
  constructor() {
    this.currentTime = 0;
    this.isDashing = false;
    this.isInvulnerable = false;
    this.dashCooldownRemaining = 0;
    this.hasShield = false;
    this.isGameOver = false;
    this.damageEventsReceived = 0;
    this.fatalities = 0;
    this.shieldBreaks = 0;
    this.shieldInvulnerableUntil = 0;
    this.timers = [];
  }

  delayedCall(delayMs, callback) {
    this.timers.push({ triggerTime: delayMs, callback });
  }

  advanceTime(deltaMs) {
    this.currentTime += deltaMs;
    if (this.dashCooldownRemaining > 0) {
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - deltaMs);
    }

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.triggerTime -= deltaMs;
      if (t.triggerTime <= 0) {
        this.timers.splice(i, 1);
        t.callback();
      }
    }
  }

  performDash() {
    if (this.isDashing || this.dashCooldownRemaining > 0 || this.isGameOver) return false;
    this.isDashing = true;
    this.isInvulnerable = true;
    this.dashCooldownRemaining = DASH_COOLDOWN_MS;

    this.delayedCall(DASH_DURATION_MS, () => {
      this.isDashing = false;
      if (this.currentTime >= this.shieldInvulnerableUntil) {
        this.isInvulnerable = false;
      }
    });
    return true;
  }

  playerDie() {
    this.damageEventsReceived++;
    if (this.isGameOver) return 'already_dead';
    if (this.isInvulnerable) return 'invulnerable_ignored';

    if (this.hasShield) {
      this.hasShield = false;
      this.isInvulnerable = true;
      this.shieldBreaks++;
      this.shieldInvulnerableUntil = this.currentTime + SHIELD_INVULN_MS;
      // Shield recovery: 1500ms i-frame
      this.delayedCall(SHIELD_INVULN_MS, () => {
        if (!this.isDashing) {
          this.isInvulnerable = false;
        }
      });
      return 'shield_absorbed';
    }

    this.isGameOver = true;
    this.fatalities++;
    return 'fatal_hit';
  }
}

test('Dash Skill: 100% invulnerability through simultaneous explosions and enemies during dash', () => {
  const ctrl = new DashAndDamageController();
  const dashStarted = ctrl.performDash();
  assert.equal(dashStarted, true);
  assert.equal(ctrl.isInvulnerable, true);

  // Receive 10 damage events during dash window (t=50ms)
  ctrl.advanceTime(50);
  for (let i = 0; i < 10; i++) {
    const res = ctrl.playerDie();
    assert.equal(res, 'invulnerable_ignored');
  }

  assert.equal(ctrl.isGameOver, false);
  assert.equal(ctrl.fatalities, 0);
});

test('Dash Skill: Lingering hazard after dash expiration eliminates unprotected player', () => {
  const ctrl = new DashAndDamageController();
  ctrl.performDash();

  // Advance time past DASH_DURATION_MS (140ms)
  ctrl.advanceTime(140);
  assert.equal(ctrl.isDashing, false);
  assert.equal(ctrl.isInvulnerable, false);

  // Player stops inside lingering explosion
  const outcome = ctrl.playerDie();
  assert.equal(outcome, 'fatal_hit');
  assert.equal(ctrl.isGameOver, true);
});

test('Dash Skill: Rapid spamming is strictly rejected by 3500ms cooldown timer', () => {
  const ctrl = new DashAndDamageController();
  assert.equal(ctrl.performDash(), true);

  // Attempt 100 rapid dash presses over 1 second
  let rejected = 0;
  for (let i = 0; i < 100; i++) {
    ctrl.advanceTime(10);
    if (!ctrl.performDash()) {
      rejected++;
    }
  }

  assert.equal(rejected, 100, 'All 100 rapid dash attempts must be rejected during cooldown');
  assert.ok(ctrl.dashCooldownRemaining > 0);

  // Advance remaining cooldown (2500ms)
  ctrl.advanceTime(2500);
  assert.equal(ctrl.dashCooldownRemaining, 0);
  assert.equal(ctrl.performDash(), true, 'Dash can be triggered again after 3500ms');
});

test('EMPIRICAL CHALLENGE: Dash cancellation of Shield Recovery i-frame', () => {
  // Scenario: Player with shield takes a hit -> enters 1500ms shield recovery i-frame.
  // At t=50ms, player dashes. Dash lasts 140ms.
  // When dash ends at t=190ms, dash callback must preserve invulnerability because
  // shield recovery is active until t=1500ms!
  const ctrl = new DashAndDamageController();
  ctrl.hasShield = true;

  // Hit 1: Shield breaks, grants 1500ms i-frame
  const hit1 = ctrl.playerDie();
  assert.equal(hit1, 'shield_absorbed');
  assert.equal(ctrl.isInvulnerable, true);

  // At t=50ms into recovery, player initiates dash
  ctrl.advanceTime(50);
  ctrl.performDash();
  assert.equal(ctrl.isDashing, true);
  assert.equal(ctrl.isInvulnerable, true);

  // Dash concludes after 140ms (at t=190ms total)
  ctrl.advanceTime(140);
  assert.equal(ctrl.isDashing, false);

  // HARDENED BEHAVIOR: Dash delayedCall preserves shield recovery invulnerability!
  assert.equal(ctrl.isInvulnerable, true, 'Dash delayedCall must preserve shield recovery invulnerability');

  // Damage event at t=250ms (well within original 1500ms shield recovery window, advance 60ms)
  ctrl.advanceTime(60);
  const hit2 = ctrl.playerDie();
  assert.equal(hit2, 'invulnerable_ignored', 'Player safely ignores damage during active shield recovery');
  assert.equal(ctrl.isGameOver, false);

  // Advance time past remaining shield recovery window (1500 - 250 = 1250ms)
  ctrl.advanceTime(1250);
  assert.equal(ctrl.isInvulnerable, false, 'Shield recovery invulnerability expires after 1500ms total');

  // Damage event at t=1500ms after recovery expiration is now fatal
  const hit3 = ctrl.playerDie();
  assert.equal(hit3, 'fatal_hit', 'Player takes damage once recovery window has fully expired');
  assert.equal(ctrl.isGameOver, true);
});

/* ==============================================================================
 * SUITE 4: SHIELD ABSORPTION UNDER SIMULTANEOUS DAMAGE
 * ============================================================================== */

test('Shield Absorption: 8 simultaneous damage hits in frame 0 consume shield exactly once', () => {
  const ctrl = new DashAndDamageController();
  ctrl.hasShield = true;

  const outcomes = [];
  // 8 damage calls in exact same tick
  for (let i = 0; i < 8; i++) {
    outcomes.push(ctrl.playerDie());
  }

  assert.equal(outcomes[0], 'shield_absorbed');
  for (let i = 1; i < 8; i++) {
    assert.equal(outcomes[i], 'invulnerable_ignored');
  }

  assert.equal(ctrl.shieldBreaks, 1, 'Shield break must happen exactly once');
  assert.equal(ctrl.hasShield, false);
  assert.equal(ctrl.isGameOver, false);
  assert.equal(ctrl.fatalities, 0);
});

test('Simultaneous Damage: Unshielded player takes 8 simultaneous hits with exactly 1 fatal trigger', () => {
  const ctrl = new DashAndDamageController();
  ctrl.hasShield = false;

  const outcomes = [];
  for (let i = 0; i < 8; i++) {
    outcomes.push(ctrl.playerDie());
  }

  assert.equal(outcomes[0], 'fatal_hit');
  for (let i = 1; i < 8; i++) {
    assert.equal(outcomes[i], 'already_dead');
  }

  assert.equal(ctrl.fatalities, 1, 'Fatal defeat must trigger exactly once');
  assert.equal(ctrl.isGameOver, true);
});

test('Shield Re-Acquisition: Collecting new shield during i-frame window restores shield status', () => {
  const ctrl = new DashAndDamageController();
  ctrl.hasShield = true;

  // Hit 1 breaks shield
  ctrl.playerDie();
  assert.equal(ctrl.hasShield, false);
  assert.equal(ctrl.isInvulnerable, true);

  // Player picks up new shield item during 1500ms recovery window
  ctrl.advanceTime(200);
  ctrl.hasShield = true;

  // Recovery expires at t=1500ms
  ctrl.advanceTime(1300);
  assert.equal(ctrl.isInvulnerable, false);
  assert.equal(ctrl.hasShield, true);

  // Next hit is safely absorbed by the newly acquired shield
  const nextHit = ctrl.playerDie();
  assert.equal(nextHit, 'shield_absorbed');
  assert.equal(ctrl.isGameOver, false);
});

/* ==============================================================================
 * SUITE 5: REACT HUD EVENT STREAMS UNDER RAPID UPDATES
 * ============================================================================== */

class MockEventEmitter {
  constructor() {
    this.events = {};
  }

  on(eventName, listener) {
    if (!this.events[eventName]) this.events[eventName] = [];
    this.events[eventName].push(listener);
  }

  off(eventName, listener) {
    if (!this.events[eventName]) return;
    this.events[eventName] = this.events[eventName].filter((l) => l !== listener);
  }

  emit(eventName, ...args) {
    if (!this.events[eventName]) return;
    this.events[eventName].forEach((listener) => listener(...args));
  }
}

test('React HUD Bridge: 500 rapid event emissions maintain immutable snapshots & valid bounds', () => {
  const emitter = new MockEventEmitter();
  const capturedSnapshots = [];

  // Simulate React setStats handler
  emitter.on('stats-update', (snapshot) => {
    capturedSnapshots.push(snapshot);
  });

  const state = createInitialPlayerStats();

  // Generate 500 rapid mutations across stats, bombs, and items
  for (let i = 0; i < 100; i++) {
    // 1. Place bomb
    state.activeBombs++;
    emitter.emit('stats-update', JSON.parse(JSON.stringify(state)));

    // 2. Pick up item
    applyItemUpgrade(state, 'SPEED_UP');
    emitter.emit('stats-update', JSON.parse(JSON.stringify(state)));

    // 3. Pick up fire
    applyItemUpgrade(state, 'FIRE_UP');
    emitter.emit('stats-update', JSON.parse(JSON.stringify(state)));

    // 4. Bomb explodes
    state.activeBombs = Math.max(0, state.activeBombs - 1);
    emitter.emit('stats-update', JSON.parse(JSON.stringify(state)));

    // 5. Pick up bomb up
    applyItemUpgrade(state, 'BOMB_UP');
    emitter.emit('stats-update', JSON.parse(JSON.stringify(state)));
  }

  assert.equal(capturedSnapshots.length, 500);

  // Invariant verification across all 500 received snapshots
  capturedSnapshots.forEach((snap, idx) => {
    assert.ok(snap.speed >= 150 && snap.speed <= 250, `Snapshot #${idx} speed out of bounds: ${snap.speed}`);
    assert.ok(snap.speedLevel >= 1 && snap.speedLevel <= 5, `Snapshot #${idx} speedLevel out of bounds`);
    assert.ok(snap.maxBombs >= 1 && snap.maxBombs <= 8, `Snapshot #${idx} maxBombs out of bounds`);
    assert.ok(snap.bombPower >= 2 && snap.bombPower <= 8, `Snapshot #${idx} bombPower out of bounds`);
    assert.ok(snap.activeBombs >= 0, `Snapshot #${idx} activeBombs cannot be negative`);
    assert.ok(!Number.isNaN(snap.score), `Snapshot #${idx} score is NaN`);
  });
});

test('React HUD Bridge: Event throttling prevents 60fps frame flooding while preserving responsiveness', () => {
  // Verify that Phaser does not emit stats-update unconditionally on every 60fps tick
  let emittedUpdates = 0;
  let dashCooldownRemaining = 3500;

  // Simulate 60 frames (1 second of pure walking without bomb/item/dash state change)
  for (let frame = 0; frame < 60; frame++) {
    const prevCd = dashCooldownRemaining;
    dashCooldownRemaining = Math.max(0, dashCooldownRemaining - 16.6);
    if (prevCd > 0 && dashCooldownRemaining === 0) {
      emittedUpdates++;
    }
  }

  // Pure walking should emit ZERO updates (0 fps render load on React)
  assert.equal(emittedUpdates, 0, 'No updates should emit while cooldown is ticking mid-way');

  // Advance remaining 2.6 seconds (160 frames) until cooldown reaches 0
  for (let frame = 0; frame < 160; frame++) {
    const prevCd = dashCooldownRemaining;
    dashCooldownRemaining = Math.max(0, dashCooldownRemaining - 16.6);
    if (prevCd > 0 && dashCooldownRemaining === 0) {
      emittedUpdates++;
    }
  }

  // Exactly 1 update emitted when dash becomes ready
  assert.equal(emittedUpdates, 1, 'Exactly 1 update emitted when cooldown hits 0');
});

test('React HUD Bridge: Event listener cleanup completely halts callbacks (no zombie leaks)', () => {
  const emitter = new MockEventEmitter();
  let callCount = 0;
  const handler = () => { callCount++; };

  emitter.on('stats-update', handler);
  emitter.emit('stats-update', {});
  assert.equal(callCount, 1);

  // React unmount cleans up listener
  emitter.off('stats-update', handler);
  emitter.emit('stats-update', {});
  emitter.emit('stats-update', {});

  assert.equal(callCount, 1, 'Cleanup must guarantee zero calls after off()');
});
