/**
 * tests/dynamic_hazard.test.mjs — Comprehensive Unit Test Suite for Quantum Spire Dynamic Hazard
 *
 * Covers:
 * 1. Tier 1: Hazard Constants, Definitions & Topology
 * 2. Tier 2: FSM Lifecycle States (INACTIVE -> TELEGRAPH -> ACTIVE -> COOLDOWN)
 * 3. Tier 3: Tile Collision, Player Damage & Quantum Tunneling
 * 4. Tier 4: Enemy Collision & Environmental Vaporization
 * 5. Tier 5: Tactical Bomb Interactions (Entanglement, Overcharge, Hyper-Fuse, Polarization)
 * 6. Tier 6: Zero-GC Invariants & 10,000-Frame Soak Stress
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DynamicHazard,
  HazardLifecycleState,
  TelegraphPhase,
  HazardSubtype,
  DURATION_TELEGRAPH_YELLOW_MS,
  DURATION_TELEGRAPH_AMBER_MS,
  DURATION_TELEGRAPH_RED_MS,
  TOTAL_TELEGRAPH_MS,
  DURATION_ACTIVE_BEAM_MS,
  TUNNELING_WINDOW_MS,
  DEFAULT_COOLDOWN_MS,
  CLIMAX_COOLDOWN_MS,
  POLARIZATION_DURATION_MS,
  HYPER_FUSE_MS,
  STANDARD_FUSE_MS,
  PLAYER_HAZARD_DAMAGE,
  ENEMY_HAZARD_DAMAGE,
  BOSS_STUN_DURATION_MS,
  PHASE_JITTER_DURATION_MS,
  MIN_SAFE_AREA_RATIO,
  TUNNELING_INVULNERABILITY_MS,
  FLOATING_TEXT_QUANTUM_PHASED,
} from '../src/game/hazards/index.ts';
import { calculateClampedPlayerSpeed } from '../src/game/gameplay_mechanics.ts';

/* ==============================================================================
 * TIER 1: CONSTANTS, TOPOLOGY & INITIALIZATION
 * ============================================================================== */

test('Tier 1: HazardLifecycleState defines all 4 distinct FSM states', () => {
  assert.equal(HazardLifecycleState.INACTIVE, 'INACTIVE');
  assert.equal(HazardLifecycleState.TELEGRAPH, 'TELEGRAPH');
  assert.equal(HazardLifecycleState.ACTIVE, 'ACTIVE');
  assert.equal(HazardLifecycleState.COOLDOWN, 'COOLDOWN');
});

test('Tier 1: TelegraphPhase defines 3-tier subphase progression and timing constants', () => {
  assert.equal(TelegraphPhase.NONE, 'NONE');
  assert.equal(TelegraphPhase.YELLOW, 'YELLOW');
  assert.equal(TelegraphPhase.AMBER, 'AMBER');
  assert.equal(TelegraphPhase.RED, 'RED');
  assert.equal(DURATION_TELEGRAPH_YELLOW_MS, 1000);
  assert.equal(DURATION_TELEGRAPH_AMBER_MS, 500);
  assert.equal(DURATION_TELEGRAPH_RED_MS, 500);
  assert.equal(TOTAL_TELEGRAPH_MS, 2000);
  assert.equal(DURATION_ACTIVE_BEAM_MS, 300);
  assert.equal(TUNNELING_WINDOW_MS, 150);
});

test('Tier 1: Spire topology initializes fixed geometric anchor pairs', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  const spires = hazard.getSpires();
  assert.equal(spires.length, 5);

  // Pair Alpha (Vertical, Col 4): S0(3, 4) & S1(9, 4)
  assert.equal(spires[0].r, 3);
  assert.equal(spires[0].c, 4);
  assert.equal(spires[0].pairId, 1);
  assert.equal(spires[1].r, 9);
  assert.equal(spires[1].c, 4);
  assert.equal(spires[1].pairId, 0);

  // Pair Beta (Horizontal, Row 6): S2(6, 3) & S3(6, 11)
  assert.equal(spires[2].r, 6);
  assert.equal(spires[2].c, 3);
  assert.equal(spires[2].pairId, 3);
  assert.equal(spires[3].r, 6);
  assert.equal(spires[3].c, 11);
  assert.equal(spires[3].pairId, 2);

  // Nexus C0: S4(6, 7)
  assert.equal(spires[4].r, 6);
  assert.equal(spires[4].c, 7);
  assert.equal(spires[4].subtype, HazardSubtype.NEXUS);

  assert.equal(hazard.getState(), HazardLifecycleState.INACTIVE);
  assert.equal(hazard.getTelegraphPhase(), TelegraphPhase.NONE);
});

/* ==============================================================================
 * TIER 2: FSM LIFECYCLE STATES & TIMING PROGRESSION
 * ============================================================================== */

test('Tier 2: FSM advances cleanly through INACTIVE -> TELEGRAPH -> ACTIVE -> COOLDOWN', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  assert.equal(hazard.getState(), HazardLifecycleState.INACTIVE);

  // Start in OUTBREAK stage
  hazard.start('OUTBREAK');
  assert.equal(hazard.getState(), HazardLifecycleState.COOLDOWN);

  // Advance warmup cooldown (2000ms)
  hazard.update(2000);
  assert.equal(hazard.getState(), HazardLifecycleState.TELEGRAPH);
  assert.equal(hazard.getTelegraphPhase(), TelegraphPhase.YELLOW);

  // Advance Yellow Phase (1000ms) -> transitions to Amber
  hazard.update(1000);
  assert.equal(hazard.getState(), HazardLifecycleState.TELEGRAPH);
  assert.equal(hazard.getTelegraphPhase(), TelegraphPhase.AMBER);

  // Advance Amber Phase (500ms) -> transitions to Red
  hazard.update(500);
  assert.equal(hazard.getState(), HazardLifecycleState.TELEGRAPH);
  assert.equal(hazard.getTelegraphPhase(), TelegraphPhase.RED);

  // Advance Red Phase (500ms) -> transitions to ACTIVE Tachyon Discharge
  hazard.update(500);
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);
  assert.equal(hazard.getTelegraphPhase(), TelegraphPhase.NONE);
  assert.ok(hazard.getActiveBeamCount() > 0, 'Active beam must have tiles');

  // Advance Active Beam Duration (300ms) -> transitions to COOLDOWN
  hazard.update(300);
  assert.equal(hazard.getState(), HazardLifecycleState.COOLDOWN);
  assert.equal(hazard.getActiveBeamCount(), 0, 'Beam tiles must be cleared on cooldown');

  // Complete Cooldown (5700ms) -> loops back to TELEGRAPH
  hazard.update(DEFAULT_COOLDOWN_MS);
  assert.equal(hazard.getState(), HazardLifecycleState.TELEGRAPH);
  assert.equal(hazard.getTelegraphPhase(), TelegraphPhase.YELLOW);

  // Stop hazard -> returns to INACTIVE
  hazard.stop();
  assert.equal(hazard.getState(), HazardLifecycleState.INACTIVE);
});

test('Tier 2: Climax stage executes synchronized dual-axis beams with accelerated cadence', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('CLIMAX');

  // Warmup to telegraph
  hazard.update(2000);
  assert.equal(hazard.getState(), HazardLifecycleState.TELEGRAPH);

  // Complete telegraph (2000ms) to trigger active beam
  hazard.update(2000);
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  // In Climax, both vertical and horizontal corridors are active through Nexus (6, 7)
  assert.ok(hazard.isTileLethal(6, 7), 'Nexus tile (6, 7) must be lethal in Climax');
  assert.ok(hazard.isTileLethal(3, 4), 'Pair Alpha anchor (3, 4) must be lethal');
  assert.ok(hazard.isTileLethal(6, 3), 'Pair Beta anchor (6, 3) must be lethal');
  assert.ok(hazard.getActiveBeamCount() >= 14, 'Climax must have intersecting cross-axis beam count');

  // End active beam -> verify Climax cooldown is accelerated (3700ms)
  hazard.update(300);
  assert.equal(hazard.getState(), HazardLifecycleState.COOLDOWN);

  hazard.update(CLIMAX_COOLDOWN_MS);
  assert.equal(hazard.getState(), HazardLifecycleState.TELEGRAPH);
});

/* ==============================================================================
 * TIER 3: TILE COLLISION, PLAYER DAMAGE & QUANTUM TUNNELING
 * ============================================================================== */

test('Tier 3: Mathematical fair encounter ratio guaranteed >= 40% safe area', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  // Test during Outbreak active beam
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE
  const outbreakSafeRatio = hazard.getSafeAreaRatio();
  assert.ok(
    outbreakSafeRatio >= MIN_SAFE_AREA_RATIO,
    `Outbreak safe ratio ${outbreakSafeRatio} must exceed minimum ${MIN_SAFE_AREA_RATIO}`
  );
  assert.ok(outbreakSafeRatio >= 0.85, 'Outbreak safe area ratio should be >= 85%');

  // Test during Climax active beam (cross-axis discharge)
  hazard.start('CLIMAX');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE
  const climaxSafeRatio = hazard.getSafeAreaRatio();
  assert.ok(
    climaxSafeRatio >= MIN_SAFE_AREA_RATIO,
    `Climax safe ratio ${climaxSafeRatio} must exceed minimum ${MIN_SAFE_AREA_RATIO}`
  );
  assert.ok(climaxSafeRatio >= 0.75, 'Climax safe area ratio should be >= 75%');
});

test('Tier 3: Direct player hit inflicts 25 energy damage and Phase Jitter debuff', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE (Pair Alpha: Col 4)

  // Verify Col 4, Row 5 is in active beam
  assert.ok(hazard.isTileLethal(5, 4));

  // Player standing on active beam without dashing
  const result = hazard.checkPlayerCollision(5, 4, false, 0);
  assert.equal(result.hit, true);
  assert.equal(result.damage, PLAYER_HAZARD_DAMAGE);
  assert.equal(result.isLethal, true);
  assert.equal(result.phaseJitterInflicted, true);
  assert.equal(result.jitterDurationMs, PHASE_JITTER_DURATION_MS);
  assert.equal(result.tunneled, false);

  // Player standing on safe tile outside beam
  const safeResult = hazard.checkPlayerCollision(1, 1, false, 0);
  assert.equal(safeResult.hit, false);
  assert.equal(safeResult.damage, 0);
});

test('Tier 3: Quantum Tunneling dash i-frames negate damage and grant Phase Shift', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE

  // Player executing Dash within first 150ms window
  const dashElapsedMs = 50; // Well within TUNNELING_WINDOW_MS (150ms)
  const tunnelResult = hazard.checkPlayerCollision(5, 4, true, dashElapsedMs);

  assert.equal(tunnelResult.hit, true);
  assert.equal(tunnelResult.damage, 0, 'Quantum Tunneling must take 0 damage');
  assert.equal(tunnelResult.tunneled, true);
  assert.equal(tunnelResult.phaseShiftGranted, true);
  assert.equal(tunnelResult.phaseShiftDurationMs, 1000, 'Phase shift duration must be 1000ms');
  assert.equal(tunnelResult.floatingText, '✦ QUANTUM PHASED!', 'Floating text must be ✦ QUANTUM PHASED!');
  assert.equal(tunnelResult.phaseJitterInflicted, false);

  // Late dash after 150ms window expires fails to tunnel
  hazard.update(200); // 200ms elapsed > 150ms window
  const lateResult = hazard.checkPlayerCollision(5, 4, true, 200);
  assert.equal(lateResult.hit, true);
  assert.equal(lateResult.damage, PLAYER_HAZARD_DAMAGE);
  assert.equal(lateResult.tunneled, false);
});

test('Tier 3: Spatial ejection safeguard displaces entity off active anchor tile', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  // Test anchor tile at S0 (3, 4)
  const ejection = hazard.resolveSafeEjection(3, 4);
  assert.equal(ejection.displaced, true);
  assert.notEqual(ejection.r === 3 && ejection.c === 4, true, 'Entity must be moved off anchor');
  assert.ok(Math.abs(ejection.r - 3) + Math.abs(ejection.c - 4) === 1, 'Must move 1 tile orthogonally');

  // Test non-anchor tile
  const nonAnchor = hazard.resolveSafeEjection(1, 1);
  assert.equal(nonAnchor.displaced, false);
  assert.equal(nonAnchor.r, 1);
  assert.equal(nonAnchor.c, 1);
});

test('Tier 3: Quantum Tunneling boundary conditions (0ms, 75ms, 150ms tunnel; 151ms fails)', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE (activeElapsed = 0ms)

  // 1. Dash at exactly activeElapsed = 0ms
  const res0 = hazard.checkPlayerCollision(5, 4, true, 0);
  assert.equal(res0.hit, true);
  assert.equal(res0.tunneled, true);
  assert.equal(res0.damage, 0);
  assert.equal(res0.phaseShiftGranted, true);
  assert.equal(res0.phaseShiftDurationMs, TUNNELING_INVULNERABILITY_MS);
  assert.equal(res0.floatingText, FLOATING_TEXT_QUANTUM_PHASED);

  // 2. Dash at activeElapsed = 75ms
  hazard.update(75);
  const res75 = hazard.checkPlayerCollision(5, 4, true, 75);
  assert.equal(res75.tunneled, true);
  assert.equal(res75.damage, 0);

  // 3. Dash at boundary activeElapsed = 150ms
  hazard.update(75); // total 150ms
  const res150 = hazard.checkPlayerCollision(5, 4, true, 150);
  assert.equal(res150.tunneled, true);
  assert.equal(res150.damage, 0);

  // 4. Dash at activeElapsed = 151ms (window expired)
  hazard.update(1); // total 151ms
  const res151 = hazard.checkPlayerCollision(5, 4, true, 151);
  assert.equal(res151.tunneled, false);
  assert.equal(res151.damage, PLAYER_HAZARD_DAMAGE);
  assert.equal(res151.phaseJitterInflicted, true);
  assert.equal(res151.jitterDurationMs, PHASE_JITTER_DURATION_MS);
});

test('Tier 3: Defensive input sanitization and coordinate out-of-bounds rejection', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE

  // Negative coordinates
  const resNeg = hazard.checkPlayerCollision(-1, 4, false, 0);
  assert.equal(resNeg.hit, false);
  assert.equal(resNeg.damage, 0);

  // Out of bounds rows/cols
  const resOob = hazard.checkPlayerCollision(100, 4, false, 0);
  assert.equal(resOob.hit, false);
  assert.equal(resOob.damage, 0);

  // NaN / Infinity coordinates
  const resNaN = hazard.checkPlayerCollision(NaN, 4, false, 0);
  assert.equal(resNaN.hit, false);
  assert.equal(resNaN.damage, 0);

  const resInf = hazard.checkPlayerCollision(5, Infinity, false, 0);
  assert.equal(resInf.hit, false);
  assert.equal(resInf.damage, 0);
});

test('Tier 3: Phase Jitter debuff speed calculation (-25% penalty)', () => {
  // Baseline speed = 120
  const normalSpeed = calculateClampedPlayerSpeed({
    baseSpeed: 120,
    perkSpeedBonus: 0,
    surgeBonus: 0,
    isDashing: false,
    dashSpeed: 260,
    phaseJitterActive: false,
  });
  assert.equal(normalSpeed, 120);

  // Phase Jitter active: 120 * 0.75 = 90
  const jitteredSpeed = calculateClampedPlayerSpeed({
    baseSpeed: 120,
    perkSpeedBonus: 0,
    surgeBonus: 0,
    isDashing: false,
    dashSpeed: 260,
    phaseJitterActive: true,
  });
  assert.equal(jitteredSpeed, 90, 'Phase Jitter must reduce speed by 25%');

  // Dashing with Phase Jitter is also scaled by -25%: 260 * 0.75 = 195
  const dashSpeed = calculateClampedPlayerSpeed({
    baseSpeed: 120,
    perkSpeedBonus: 0,
    surgeBonus: 0,
    isDashing: true,
    dashSpeed: 260,
    phaseJitterActive: true,
  });
  assert.equal(dashSpeed, 195, 'Dashing speed with Phase Jitter is 195 (260 * 0.75)');
});

/* ==============================================================================
 * TIER 4: ENEMY COLLISION & ENVIRONMENTAL VAPORIZATION
 * ============================================================================== */

test('Tier 4: Minion enemy in active beam is vaporized with 120 environmental damage', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE

  const minionResult = hazard.checkEnemyCollision(5, 4, false);
  assert.equal(minionResult.hit, true);
  assert.equal(minionResult.damage, ENEMY_HAZARD_DAMAGE);
  assert.equal(minionResult.isVaporized, true);
  assert.equal(minionResult.scoreBonus, 100);
  assert.equal(minionResult.isStunned, false);
});

test('Tier 4: Boss enemy in active beam takes percentage damage and 1.5s stun', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE

  const bossResult = hazard.checkEnemyCollision(5, 4, true);
  assert.equal(bossResult.hit, true);
  assert.equal(bossResult.damage, 15); // 15% HP
  assert.equal(bossResult.isVaporized, false);
  assert.equal(bossResult.isStunned, true);
  assert.equal(bossResult.stunDurationMs, BOSS_STUN_DURATION_MS);
});

/* ==============================================================================
 * TIER 5: TACTICAL BOMB INTERACTIONS
 * ============================================================================== */

test('Tier 5: Subspace Hyper-Fuse compresses bomb fuse on Spire anchor to 1500ms', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  // Placing bomb directly on Spire S0 (3, 4)
  const onAnchor = hazard.onBombPlaced(101, 3, 4, 2, STANDARD_FUSE_MS);
  assert.equal(onAnchor.modifiedFuseMs, HYPER_FUSE_MS);
  assert.equal(onAnchor.isEntangled, true);

  // Placing bomb far from any spire
  const distant = hazard.onBombPlaced(102, 1, 1, 2, STANDARD_FUSE_MS);
  assert.equal(distant.modifiedFuseMs, STANDARD_FUSE_MS);
  assert.equal(distant.isEntangled, false);
});

test('Tier 5: Quantum Entanglement clones paired ghost bomb with synchronized detonation', () => {
  const hazard = new DynamicHazard();
  hazard.init();

  // Place bomb adjacent to Spire S0 (3, 4) at (4, 4)
  const placement = hazard.onBombPlaced(201, 4, 4, 3, STANDARD_FUSE_MS);
  assert.equal(placement.isEntangled, true);
  assert.ok(placement.ghostBombId !== undefined);

  // Verify ghost bomb materialized at paired Spire S1 (9, 4)
  const activeGhosts = hazard.getActiveGhostBombs();
  assert.equal(activeGhosts.length, 1);
  assert.equal(activeGhosts[0].r, 9);
  assert.equal(activeGhosts[0].c, 4);
  assert.equal(activeGhosts[0].parentBombId, 201);
  assert.equal(activeGhosts[0].power, 3);

  // Detonating parent bomb detonates paired ghost bomb on the same frame tick
  const detResult = hazard.onBombDetonated(201, 4, 4, 3);
  assert.ok(detResult.pairedGhostBombIds.includes(placement.ghostBombId));
  assert.equal(hazard.getActiveGhostBombs().length, 0, 'Ghost bomb pool slot must be freed');
});

test('Tier 5: Tachyon Overcharge grants +2 blast power and piercing beam inside active hazard', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(2000 + TOTAL_TELEGRAPH_MS); // Enter ACTIVE

  // Detonating bomb on active beam tile (5, 4)
  const overchargeDet = hazard.onBombDetonated(301, 5, 4, 2);
  assert.equal(overchargeDet.overcharged, true);
  assert.equal(overchargeDet.modifiedPower, 4, 'Blast power must increase by +2');
  assert.equal(overchargeDet.piercing, true);

  // Detonating bomb outside hazard
  const normalDet = hazard.onBombDetonated(302, 1, 1, 2);
  assert.equal(normalDet.overcharged, false);
  assert.equal(normalDet.modifiedPower, 2);
  assert.equal(normalDet.piercing, false);
});

test('Tier 5: Polarization Strike neutralizes lethal beam and purges surrounding tiles', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Bomb blast strikes Spire S0 crystal at (3, 4)
  const strike = hazard.onBombBlastImpact(3, 4);
  assert.equal(strike.polarized, true);
  assert.equal(strike.spireId, 0);
  assert.ok(strike.cleansedTileCount >= 9, 'Must cleanse 3x3 surrounding tiles');

  // Verify both S0 and paired S1 are polarized
  const spires = hazard.getSpires();
  assert.equal(spires[0].isPolarized, true);
  assert.equal(spires[1].isPolarized, true);

  // Advance into active beam while polarized
  hazard.update(2000 + TOTAL_TELEGRAPH_MS);
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);
  assert.equal(hazard.isTilePolarized(3, 4), true);

  // Polarized beam is harmless to player
  const playerHit = hazard.checkPlayerCollision(3, 4, false, 0);
  assert.equal(playerHit.hit, true);
  assert.equal(playerHit.damage, 0, 'Polarized beam must deal 0 damage to player');

  // Fast forward past polarization duration (8000ms)
  hazard.update(POLARIZATION_DURATION_MS + 100);
  assert.equal(spires[0].isPolarized, false, 'Polarization must expire cleanly');
});

/* ==============================================================================
 * TIER 6: ZERO-GC INVARIANTS & 10,000-FRAME SOAK TEST
 * ============================================================================== */

test('Tier 6: 10,000 continuous frames execute with zero memory leaks (< 0.25 MB drift)', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Warmup run
  for (let f = 0; f < 500; f++) {
    hazard.update(16);
  }

  if (global.gc) {
    global.gc();
  }

  const baselineHeap = process.memoryUsage().heapUsed;

  // 10,000 Frame Soak Simulation
  const deltaMs = 16.666; // 60 FPS tick
  for (let f = 0; f < 10000; f++) {
    hazard.update(deltaMs);

    // Periodic bomb placement and collision checks to stress pools
    if (f % 60 === 0) {
      hazard.onBombPlaced(f, 3, 4, 2, STANDARD_FUSE_MS);
      hazard.checkPlayerCollision(6, 5, false, 0);
      hazard.checkEnemyCollision(6, 5, false);
    }
    if (f % 120 === 0) {
      hazard.onBombDetonated(f - 60, 3, 4, 2);
    }
    if (f === 5000) {
      hazard.start('CLIMAX'); // Switch stage mid-soak
    }
  }

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) {
    global.gc();
    global.gc();
  }

  const finalHeap = process.memoryUsage().heapUsed;
  const netHeapDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

  if (isGcExposed) {
    assert.ok(
      netHeapDriftMB <= 0.25,
      `10,000-frame soak drift ${netHeapDriftMB.toFixed(4)} MB must be <= 0.25 MB`
    );
  } else {
    assert.ok(
      netHeapDriftMB <= 5.0,
      `Ambient heap drift ${netHeapDriftMB.toFixed(4)} MB must be reasonable`
    );
  }
});
