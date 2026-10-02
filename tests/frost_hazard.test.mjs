/**
 * tests/frost_hazard.test.mjs — Comprehensive Integration & Defensive Test Suite
 *
 * Cryo Glaciation Hazard Subsystem (FrostHazard.ts)
 *
 * Verification Architecture (9 Tiers):
 * - Tier 1: System Constants, Topography & Initial State Invariants
 * - Tier 2: 4-Stage Lifecycle State Machine & Hoarfrost Sub-Phase Transitions
 * - Tier 3: Zero-GC TypedArray Memory Layout & Scratch Container Recycling
 * - Tier 4: Surface Dynamic Friction & Drift Damping Physics
 * - Tier 5: Mathematical Safe Area Guarantees (>= 80.0% mandate, >= 85.128% observed)
 * - Tier 6: Tactical Bomb Cryo-Mechanics & Thermal Shock Shatter
 * - Tier 7: Player Combat Mastery & Cryo-Phasing Dash (I-Frames)
 * - Tier 8: Enemy Cryo-Shatter & Boss Deep Freeze Stasis with Single-Hit Anti-Exploit Guard
 * - Tier 9: 10,000-Frame Multi-Entity Zero-GC Soak Stress
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FrostHazard,
  FrostLifecycleState,
  HoarfrostPhase,
  FrostDangerValue,
  DURATION_CRYSTALLIZATION_MS,
  DURATION_PERMAFROST_CREEP_MS,
  DURATION_SUBLIMATION_FLASH_MS,
  DURATION_HOARFROST_SURGE_MS,
  DURATION_HOARFROST_TELEGRAPH_MS,
  DURATION_ABSOLUTE_ZERO_BURST_MS,
  DEFAULT_FROST_COOLDOWN_MS,
  CLIMAX_FROST_COOLDOWN_MS,
  WHISPERS_FROST_COOLDOWN_MS,
  FROST_RADIUS_TILES,
  MAX_RADIUS_PX,
  MIN_FROST_SAFE_AREA_RATIO,
  PLAYER_FROST_BURST_DAMAGE,
  ENEMY_FROST_BURST_DAMAGE,
  ENEMY_SHATTER_SCORE,
  ENEMY_SHATTER_ULTIMATE_CHARGE,
  BOSS_FROST_DAMAGE_RATIO,
  BOSS_DEEP_FREEZE_STUN_MS,
  CRYO_TUNNELING_WINDOW_MS,
  CRYO_PHASE_INVULN_MS,
  CRYO_PHASE_SPEED_BOOST,
  FROSTBITE_DURATION_MS,
  FROSTBITE_SLOW_RATIO,
  FROST_FUSE_EXTENSION_MS,
  THERMAL_SHOCK_EXTRA_POWER,
  THERMAL_SHOCK_BONUS_SCORE,
  KICK_SPEED_BONUS_RATIO,
  FLOATING_TEXT_CRYO_PHASED,
  FLOATING_TEXT_FROSTBITE,
  FLOATING_TEXT_THERMAL_SHOCK,
  FLOATING_TEXT_CRYO_SHATTERED,
  FLOATING_TEXT_DEEP_FREEZE,
} from '../src/game/hazards/FrostHazard.ts';
import { ROWS, COLS, TOTAL_TILES } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * TIER 1: SYSTEM CONSTANTS, TOPOGRAPHY & INITIAL STATE INVARIANTS
 * ============================================================================== */

test('Tier 1.1 [Constants & Definitions]: Lifecycle states, durations, and balance parameters are strictly calibrated', () => {
  assert.equal(FrostLifecycleState.DORMANT, 'DORMANT');
  assert.equal(FrostLifecycleState.HOARFROST_SURGE, 'HOARFROST_SURGE');
  assert.equal(FrostLifecycleState.ABSOLUTE_ZERO_BURST, 'ABSOLUTE_ZERO_BURST');
  assert.equal(FrostLifecycleState.THAW_COOLDOWN, 'THAW_COOLDOWN');

  assert.equal(HoarfrostPhase.NONE, 'NONE');
  assert.equal(HoarfrostPhase.CRYSTALLIZATION, 'CRYSTALLIZATION');
  assert.equal(HoarfrostPhase.PERMAFROST_CREEP, 'PERMAFROST_CREEP');
  assert.equal(HoarfrostPhase.SUBLIMATION_FLASH, 'SUBLIMATION_FLASH');

  assert.equal(FrostDangerValue.SAFE, 0);
  assert.equal(FrostDangerValue.HOARFROST, 1);
  assert.equal(FrostDangerValue.ABSOLUTE_ZERO, 2);
  assert.equal(FrostDangerValue.THAWING, 3);

  assert.equal(DURATION_CRYSTALLIZATION_MS, 1000);
  assert.equal(DURATION_PERMAFROST_CREEP_MS, 600);
  assert.equal(DURATION_SUBLIMATION_FLASH_MS, 400);
  assert.equal(DURATION_HOARFROST_SURGE_MS, 2000);
  assert.equal(DURATION_HOARFROST_TELEGRAPH_MS, 2000);
  assert.equal(DURATION_ABSOLUTE_ZERO_BURST_MS, 350);
  assert.equal(DEFAULT_FROST_COOLDOWN_MS, 5700);
  assert.equal(CLIMAX_FROST_COOLDOWN_MS, 3700);
  assert.equal(WHISPERS_FROST_COOLDOWN_MS, 9000);

  assert.equal(FROST_RADIUS_TILES, 3);
  assert.equal(MAX_RADIUS_PX, 120);
  assert.equal(MIN_FROST_SAFE_AREA_RATIO, 0.80);
  assert.equal(BOSS_FROST_DAMAGE_RATIO, 0.15);
  assert.equal(CRYO_TUNNELING_WINDOW_MS, 150);
  assert.equal(FROST_FUSE_EXTENSION_MS, 1500);
  assert.equal(THERMAL_SHOCK_EXTRA_POWER, 2);
});

test('Tier 1.2 [Epicenter Clamping]: Epicenter is safely clamped within playable arena interior', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(0, 0);
  assert.equal(hazard.centerRow, 1, 'Row clamped to minimum 1');
  assert.equal(hazard.centerCol, 1, 'Col clamped to minimum 1');

  hazard.setCenter(ROWS + 10, COLS + 10);
  assert.equal(hazard.centerRow, ROWS - 2, 'Row clamped to maximum ROWS - 2');
  assert.equal(hazard.centerCol, COLS - 2, 'Col clamped to maximum COLS - 2');

  hazard.setCenter(6, 7);
  assert.equal(hazard.centerRow, 6);
  assert.equal(hazard.centerCol, 7);
});

test('Tier 1.3 [Discrete Lattice Geometry]: Euclidean radius 3 closed ball produces exactly 29 tiles', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();

  assert.equal(hazard.getActiveFrostCount(), 29, 'Radius 3 circle centered at (6,7) must have exactly 29 tiles');

  let dangerCount = 0;
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (hazard.getDangerMask()[i] === FrostDangerValue.HOARFROST) {
      dangerCount++;
    }
  }
  assert.equal(dangerCount, 29);
});

/* ==============================================================================
 * TIER 2: 4-STAGE LIFECYCLE STATE MACHINE & SUB-PHASES
 * ============================================================================== */

test('Tier 2.1 [Deterministic 4-Stage FSM]: Progresses seamlessly through DORMANT -> SURGE -> BURST -> COOLDOWN -> SURGE', () => {
  const hazard = new FrostHazard();
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.DORMANT);

  hazard.start('OUTBREAK');
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.HOARFROST_SURGE);

  // Advance 1999ms: Still in surge
  hazard.update(1999);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.HOARFROST_SURGE);

  // Advance 1ms: Transitions to ABSOLUTE_ZERO_BURST
  hazard.update(1);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.ABSOLUTE_ZERO_BURST);

  // Advance 350ms: Transitions to THAW_COOLDOWN
  hazard.update(350);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.THAW_COOLDOWN);

  // Advance 5700ms: Loops back to HOARFROST_SURGE
  hazard.update(5700);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.HOARFROST_SURGE);
});

test('Tier 2.2 [Hoarfrost Sub-Phases]: Correctly transitions through Crystallization -> Creep -> Sublimation Flash', () => {
  const hazard = new FrostHazard();
  hazard.start();

  // 0ms - 1000ms: Crystallization
  hazard.update(500);
  assert.equal(hazard.getHoarfrostPhase(), HoarfrostPhase.CRYSTALLIZATION);

  // 1000ms - 1600ms: Permafrost Creep
  hazard.update(600); // 1100ms
  assert.equal(hazard.getHoarfrostPhase(), HoarfrostPhase.PERMAFROST_CREEP);

  // 1600ms - 2000ms: Sublimation Flash
  hazard.update(600); // 1700ms
  assert.equal(hazard.getHoarfrostPhase(), HoarfrostPhase.SUBLIMATION_FLASH);

  // In other states, HoarfrostPhase is NONE
  hazard.update(400); // 2100ms -> Burst
  assert.equal(hazard.getHoarfrostPhase(), HoarfrostPhase.NONE);
});

test('Tier 2.3 [Cascade Delta Handling]: Large time jumps cascade cleanly without desync', () => {
  const hazard = new FrostHazard();
  hazard.start('OUTBREAK'); // 2000ms surge + 350ms burst + 5700ms cooldown = 8050ms full cycle

  // Step 2000 + 350 + 100 = 2450ms -> Should be in THAW_COOLDOWN with stateTimerMs = 100
  hazard.update(2450);
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.THAW_COOLDOWN);
  assert.equal(hazard.getStateElapsedMs(), 100);
});

test('Tier 2.4 [Climax & Whispers Cooldown Tuning]: Cooldown adapts dynamically to crisis intensity', () => {
  const hazardClimax = new FrostHazard();
  hazardClimax.start('CLIMAX');
  assert.equal(hazardClimax.cooldownDurationMs, CLIMAX_FROST_COOLDOWN_MS);

  const hazardWhispers = new FrostHazard();
  hazardWhispers.start('WHISPERS');
  assert.equal(hazardWhispers.cooldownDurationMs, WHISPERS_FROST_COOLDOWN_MS);
});

/* ==============================================================================
 * TIER 3: ZERO-GC BUFFER STABILITY & SCRATCH RECYCLING
 * ============================================================================== */

test('Tier 3.1 [TypedArray Layout]: Buffers are pre-allocated 1D TypedArrays with zero runtime reallocation', () => {
  const hazard = new FrostHazard();
  const maskRef = hazard.getDangerMask();
  const frictionRef = hazard.getFrictionGrid();
  const tempRef = hazard.getTemperatureGrid();
  const intensityRef = hazard.getIntensityGrid();

  assert.equal(maskRef.byteLength, TOTAL_TILES);
  assert.equal(frictionRef.length, TOTAL_TILES);
  assert.equal(tempRef.length, TOTAL_TILES);
  assert.equal(intensityRef.length, TOTAL_TILES);

  hazard.start();
  hazard.update(2500);
  hazard.stop();

  assert.equal(hazard.getDangerMask(), maskRef, 'DangerMask reference must not change');
  assert.equal(hazard.getFrictionGrid(), frictionRef, 'FrictionGrid reference must not change');
  assert.equal(hazard.getTemperatureGrid(), tempRef, 'TemperatureGrid reference must not change');
  assert.equal(hazard.getIntensityGrid(), intensityRef, 'IntensityGrid reference must not change');
});

test('Tier 3.2 [Scratch Container Reuse]: Query methods return recycled scratch instances', () => {
  const hazard = new FrostHazard();
  hazard.start();
  hazard.update(2000); // ABSOLUTE_ZERO_BURST

  const p1 = hazard.evaluatePlayer(300, 260, false);
  const p2 = hazard.evaluatePlayer(300, 260, true);
  assert.equal(p1, p2, 'evaluatePlayer must recycle scratchPlayerResult');

  const e1 = hazard.evaluateEnemy(300, 260, false);
  const e2 = hazard.evaluateEnemy(300, 260, true);
  assert.equal(e1, e2, 'evaluateEnemy must recycle scratchEnemyResult');

  const b1 = hazard.onBombPlaced('b1', 6, 7);
  const b2 = hazard.onBombPlaced('b2', 6, 7);
  assert.equal(b1, b2, 'onBombPlaced must recycle scratchBombPlacedResult');

  const f1 = hazard.evaluateFriction(300, 260);
  const f2 = hazard.evaluateFriction(300, 260);
  assert.equal(f1, f2, 'evaluateFriction must recycle scratchFrictionResult');
});

test('Tier 3.3 [Safe Boundary Outlier Handling]: Non-finite and extreme coordinates return safe defaults', () => {
  const hazard = new FrostHazard();
  hazard.start();

  const fRes = hazard.evaluateFriction(NaN, Infinity);
  assert.equal(fRes.friction, 1.0);
  assert.equal(fRes.isGlaciated, false);

  const pRes = hazard.evaluatePlayer(-9999, 99999);
  assert.equal(pRes.hit, false);
  assert.equal(pRes.damage, 0);

  const eRes = hazard.evaluateEnemy(-10, -20);
  assert.equal(eRes.hit, false);
  assert.equal(eRes.damage, 0);
});

/* ==============================================================================
 * TIER 4: SURFACE DYNAMIC FRICTION & DRIFT DAMPING PHYSICS
 * ============================================================================== */

test('Tier 4.1 [Continuous Dynamic Friction]: Friction falls smoothly within [0.20, 1.00]', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();

  // At start of Crystallization (t = 100ms)
  hazard.update(100);
  const earlyFric = hazard.evaluateFriction(300, 260);
  assert.ok(earlyFric.isGlaciated);
  assert.ok(earlyFric.friction >= 0.20 && earlyFric.friction <= 1.0);

  // During Permafrost Creep (t = 1500ms)
  hazard.update(1400);
  const creepFric = hazard.evaluateFriction(300, 260);
  assert.ok(creepFric.friction < earlyFric.friction, 'Friction must decrease as ice sheet hardens');
  assert.ok(creepFric.friction >= 0.20);
});

test('Tier 4.2 [Drift Damping Decay]: Effective damping scales with friction γ = 25.0 * μ', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();
  hazard.update(1900); // Deep ice

  const fric = hazard.evaluateFriction(300, 260);
  assert.ok(Math.abs(fric.driftDamping - 25.0 * fric.friction) < 0.001);
});

test('Tier 4.3 [Thaw Friction Restoration]: Thaw completely restores friction to 1.0', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();
  hazard.update(2400); // In THAW_COOLDOWN

  const fric = hazard.evaluateFriction(300, 260);
  assert.equal(fric.friction, 1.0);
  assert.equal(fric.isGlaciated, false);
  assert.equal(fric.driftDamping, 25.0);
});

/* ==============================================================================
 * TIER 5: MATHEMATICAL SAFE AREA GUARANTEES
 * ============================================================================== */

test('Tier 5.1 [Safe Area Ratio Mandate]: Center epicenter yields exactly 85.128% safe area', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();

  const ratio = hazard.getSafeAreaRatio();
  const expectedRatio = (195 - 29) / 195; // 166 / 195 ≈ 0.851282
  assert.ok(Math.abs(ratio - expectedRatio) < 0.0001);
  assert.ok(ratio >= MIN_FROST_SAFE_AREA_RATIO, `Observed ${ratio} must be >= 0.80`);
});

test('Tier 5.2 [Full Grid Scan]: Safe area ratio >= 80% across all 195 grid epicenters', () => {
  const hazard = new FrostHazard();
  hazard.start();

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      hazard.setCenter(r, c);
      const ratio = hazard.getSafeAreaRatio();
      assert.ok(
        ratio >= MIN_FROST_SAFE_AREA_RATIO,
        `Epicenter (${r}, ${c}) ratio ${ratio} must satisfy >= ${MIN_FROST_SAFE_AREA_RATIO}`
      );
    }
  }
});

/* ==============================================================================
 * TIER 6: TACTICAL BOMB CRYO-MECHANICS & THERMAL SHOCK
 * ============================================================================== */

test('Tier 6.1 [Glacial Encapsulation]: Bombs on frost tiles receive +1500ms fuse extension and kick speed bonus', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();

  const res = hazard.onBombPlaced('bomb_1', 6, 7, 3000);
  assert.equal(res.isFrozen, true);
  assert.equal(res.modifiedFuseMs, 4500, '3000ms base + 1500ms extension = 4500ms');
  assert.equal(res.kickSpeedBonus, KICK_SPEED_BONUS_RATIO);

  const dryRes = hazard.onBombPlaced('bomb_2', 1, 1, 3000);
  assert.equal(dryRes.isFrozen, false);
  assert.equal(dryRes.modifiedFuseMs, 3000);
});

test('Tier 6.2 [Thermal Shock Shatter]: Detonations on frost tiles trigger +2 power and piercing blast', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();

  const detRes = hazard.onBombDetonated('bomb_1', 6, 7, 3);
  assert.equal(detRes.isThermalShock, true);
  assert.equal(detRes.modifiedPower, 5, '3 base + 2 bonus = 5 power');
  assert.equal(detRes.piercing, true);
  assert.equal(detRes.bonusScore, THERMAL_SHOCK_BONUS_SCORE);
  assert.equal(detRes.floatingText, FLOATING_TEXT_THERMAL_SHOCK);

  // Tactical counterplay: triggers localized thaw cooldown
  assert.equal(hazard.getLifecycleState(), FrostLifecycleState.THAW_COOLDOWN);
});

/* ==============================================================================
 * TIER 7: PLAYER COMBAT MASTERY & CRYO-PHASING DASH
 * ============================================================================== */

test('Tier 7.1 [Cryo-Phasing Dash Success]: Dashing within 150ms window grants 0 damage, 1000ms invuln, +30% speed', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();
  hazard.update(2050); // Inside ABSOLUTE_ZERO_BURST at stateTimerMs = 50ms (<= 150ms)

  const res = hazard.evaluatePlayer(300, 260, true, 2050);
  assert.equal(res.hit, true);
  assert.equal(res.cryoPhased, true);
  assert.equal(res.damage, 0);
  assert.equal(res.isLethal, false);
  assert.equal(res.invulnerabilityGrantedMs, CRYO_PHASE_INVULN_MS);
  assert.equal(res.speedBoostGranted, true);
  assert.equal(res.speedBoostRatio, CRYO_PHASE_SPEED_BOOST);
  assert.equal(res.floatingText, FLOATING_TEXT_CRYO_PHASED);
});

test('Tier 7.2 [Hypothermic Chill Direct Hit]: Non-dashing player takes 25 damage and 2500ms frostbite', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();
  hazard.update(2100); // Inside ABSOLUTE_ZERO_BURST

  const res = hazard.evaluatePlayer(300, 260, false, 2100);
  assert.equal(res.hit, true);
  assert.equal(res.cryoPhased, false);
  assert.equal(res.damage, PLAYER_FROST_BURST_DAMAGE);
  assert.equal(res.isLethal, true);
  assert.equal(res.frostbiteInflicted, true);
  assert.equal(res.frostbiteDurationMs, FROSTBITE_DURATION_MS);
  assert.equal(res.slowRatio, FROSTBITE_SLOW_RATIO);
  assert.equal(res.floatingText, FLOATING_TEXT_FROSTBITE);
});

test('Tier 7.3 [Late Dash Penalty]: Dashing after 150ms window expires fails cryo-phasing', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();
  hazard.update(2200); // Inside ABSOLUTE_ZERO_BURST at stateTimerMs = 200ms (> 150ms)

  const res = hazard.evaluatePlayer(300, 260, true, 2200);
  assert.equal(res.cryoPhased, false, 'Late dash must not grant cryo-phasing');
  assert.equal(res.damage, PLAYER_FROST_BURST_DAMAGE);
  assert.equal(res.frostbiteInflicted, true);
});

/* ==============================================================================
 * TIER 8: ENEMY CRYO-SHATTER & BOSS DEEP FREEZE STASIS
 * ============================================================================== */

test('Tier 8.1 [Minion Cryo-Shatter]: Minions take 120 damage, +120 score, and +6 ult charge', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();
  hazard.update(2100); // Inside ABSOLUTE_ZERO_BURST

  const res = hazard.evaluateEnemy(300, 260, false);
  assert.equal(res.hit, true);
  assert.equal(res.damage, ENEMY_FROST_BURST_DAMAGE);
  assert.equal(res.isShattered, true);
  assert.equal(res.scoreBonus, ENEMY_SHATTER_SCORE);
  assert.equal(res.ultimateChargeBonus, ENEMY_SHATTER_ULTIMATE_CHARGE);
  assert.equal(res.floatingText, FLOATING_TEXT_CRYO_SHATTERED);
});

test('Tier 8.2 [Boss Deep Freeze Stasis & Single-Hit Guard]: Boss takes 15% Max HP, 1.5s stun, and avoids multi-hits', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start();
  hazard.update(2100); // Inside ABSOLUTE_ZERO_BURST

  const hit1 = hazard.evaluateEnemy(300, 260, true, 2000);
  assert.equal(hit1.hit, true);
  assert.equal(hit1.damage, 300, '15% of 2000 HP = 300 dmg');
  assert.equal(hit1.isFrozenStunned, true);
  assert.equal(hit1.stunDurationMs, BOSS_DEEP_FREEZE_STUN_MS);
  assert.equal(hit1.floatingText, FLOATING_TEXT_DEEP_FREEZE);

  // Subsequent hit in the same burst window must be blocked by anti-exploit guard
  const hit2 = hazard.evaluateEnemy(300, 260, true, 2000);
  assert.equal(hit2.hit, false);
  assert.equal(hit2.damage, 0);
});

/* ==============================================================================
 * TIER 9: 10,000-FRAME MULTI-ENTITY ZERO-GC SOAK STRESS
 * ============================================================================== */

test('Tier 9.1 [10,000-Frame Zero-GC Soak]: High-throughput lifecycle soak with zero heap drift', () => {
  const hazard = new FrostHazard();
  hazard.setCenter(6, 7);
  hazard.start('OUTBREAK');

  // Warmup run to allow V8 JIT to compile methods
  for (let f = 0; f < 500; f++) {
    hazard.update(16.666);
    hazard.evaluateFriction(300, 260);
    hazard.evaluatePlayer(300, 260, f % 2 === 0, f * 16.666);
    hazard.evaluateEnemy(300, 260, f % 5 === 0);
  }

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  for (let f = 0; f < 10000; f++) {
    hazard.update(16.666);
    hazard.evaluateFriction(300, 260);
    hazard.evaluatePlayer(300, 260, f % 2 === 0, f * 16.666);
    hazard.evaluateEnemy(300, 260, f % 5 === 0);
  }

  const durationMs = performance.now() - startTime;
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;
  const driftMB = Math.max(0, (memAfter - memBefore) / (1024 * 1024));

  if (global.gc) {
    assert.ok(driftMB < 0.25, `Net heap drift ${driftMB.toFixed(4)} MB must be < 0.25 MB`);
  } else {
    assert.ok(driftMB < 5.0, `Net heap drift without GC ${driftMB.toFixed(4)} MB must be < 5.0 MB`);
  }
  assert.ok(durationMs < 250, `10,000 frames took ${durationMs.toFixed(2)} ms (budget < 250 ms)`);
});
