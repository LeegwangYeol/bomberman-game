/**
 * tests/gravity_hazard.test.mjs — Comprehensive Integration & Defensive Test Suite
 *
 * Gravitational Singularity Hazard Subsystem
 *
 * Test Architecture:
 * - Tier 1: System Constants, Topography & Initial State Invariants
 * - Tier 2: 4-Stage Lifecycle State Machine & Accretion Sub-Phase Transitions
 * - Tier 3: Zero-GC TypedArray Memory Layout & Scratch Container Recycling
 * - Tier 4: Gravitational Pull Vector Calculations, Symmetry & Distance Falloff
 * - Tier 5: Mathematical Safe Area Guarantees (>= 40% mandate, >= 85% observed)
 * - Tier 6: Tactical Bomb Interactions, Cosmic Fusion & Singularity Collapse Counterplay
 * - Tier 7: Player Gravitational Navigation, Crushing & Escape Velocity Dash
 * - Tier 8: Enemy Crushing & Boss Gravitational Stasis with Single-Hit Anti-Exploit Guard
 * - Tier 9: High-Throughput 10,000-Frame Multi-Entity Zero-GC Soak Stress
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GravityHazard,
  GravityLifecycleState,
  AccretionPhase,
  GravityDangerValue,
  DURATION_ACCRETION_FORMATION_MS,
  DURATION_ACCRETION_COMPRESSION_MS,
  DURATION_ACCRETION_COLLAPSE_MS,
  DURATION_ACCRETION_TELEGRAPH_MS,
  DURATION_SINGULARITY_BURST_MS,
  DEFAULT_GRAVITY_COOLDOWN_MS,
  CLIMAX_GRAVITY_COOLDOWN_MS,
  WHISPERS_COOLDOWN_MS,
  GRAVITY_PULL_RADIUS_TILES,
  GRAVITY_MAX_PULL_SPEED,
  PLAYER_GRAVITY_DRAG_RATIO,
  PLAYER_GRAVITY_PULL_RATIO,
  ESCAPE_VELOCITY_INVULN_MS,
  ESCAPE_VELOCITY_SPEED_BURST_RATIO,
  ESCAPE_VELOCITY_COOLDOWN_MS,
  SINGULARITY_BURST_PLAYER_DMG,
  SINGULARITY_BURST_ENEMY_DMG,
  SINGULARITY_BURST_BOSS_DMG_RATIO,
  SINGULARITY_BURST_BOSS_STUN_MS,
  FUSION_FUSE_REDUCTION_MS,
  FUSION_EXTRA_BLAST_RADIUS,
  FUSION_BONUS_SCORE,
  FUSION_CORE_RADIUS_PX,
  FLOATING_TEXT_GRAVITATIONAL_ESCAPE,
  FLOATING_TEXT_CRUSHED,
  FLOATING_TEXT_BOSS_STASIS,
  FLOATING_TEXT_COSMIC_FUSION,
  FLOATING_TEXT_SINGULARITY_COLLAPSED,
  MIN_SAFE_AREA_RATIO,
  CORE_RADIUS_PX,
  MAX_RADIUS_PX,
} from '../src/game/hazards/GravityHazard.ts';
import { ROWS, COLS, TOTAL_TILES, TILE_SIZE } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * TIER 1: SYSTEM CONSTANTS, TOPOGRAPHY & INITIAL STATE INVARIANTS
 * ============================================================================== */

test('Tier 1 [Constants & Definitions]: Lifecycle states, durations, and balance parameters are strictly calibrated', () => {
  // 4 Distinct Lifecycle States
  assert.equal(GravityLifecycleState.DORMANT, 'DORMANT');
  assert.equal(GravityLifecycleState.ACCRETION_SWIRL, 'ACCRETION_SWIRL');
  assert.equal(GravityLifecycleState.SINGULARITY_BURST, 'SINGULARITY_BURST');
  assert.equal(GravityLifecycleState.COOLDOWN, 'COOLDOWN');

  // 3-Tier Accretion Telegraph Phases
  assert.equal(AccretionPhase.NONE, 'NONE');
  assert.equal(AccretionPhase.FORMATION, 'FORMATION');
  assert.equal(AccretionPhase.COMPRESSION, 'COMPRESSION');
  assert.equal(AccretionPhase.CRITICAL_COLLAPSE, 'CRITICAL_COLLAPSE');

  // Danger Mask Values
  assert.equal(GravityDangerValue.SAFE, 0);
  assert.equal(GravityDangerValue.ACCRETION, 1);
  assert.equal(GravityDangerValue.EVENT_HORIZON, 2);
  assert.equal(GravityDangerValue.COLLAPSED, 3);

  // Timing Durations
  assert.equal(DURATION_ACCRETION_FORMATION_MS, 1000);
  assert.equal(DURATION_ACCRETION_COMPRESSION_MS, 600);
  assert.equal(DURATION_ACCRETION_COLLAPSE_MS, 400);
  assert.equal(DURATION_ACCRETION_TELEGRAPH_MS, 2000, 'Total accretion telegraph must equal 2000ms');
  assert.equal(DURATION_SINGULARITY_BURST_MS, 350, 'Singularity burst must be exactly 350ms');
  assert.equal(DEFAULT_GRAVITY_COOLDOWN_MS, 6000);
  assert.equal(CLIMAX_GRAVITY_COOLDOWN_MS, 4000);
  assert.equal(WHISPERS_COOLDOWN_MS, 9000);

  // Physics & Mechanics
  assert.equal(GRAVITY_PULL_RADIUS_TILES, 3, 'Gravity pull radius must be 3 tiles');
  assert.equal(GRAVITY_MAX_PULL_SPEED, 65, 'Max pull speed must be 65 px/s');
  assert.equal(PLAYER_GRAVITY_DRAG_RATIO, 0.25, 'Player drag ratio must be 0.25 (25% slower)');
  assert.equal(PLAYER_GRAVITY_PULL_RATIO, 0.20, 'Player pull ratio must be 0.20 (20% faster)');
  assert.equal(ESCAPE_VELOCITY_INVULN_MS, 1200, 'Escape velocity invulnerability must be 1200ms');
  assert.equal(ESCAPE_VELOCITY_SPEED_BURST_RATIO, 0.35, 'Escape speed boost must be +35%');
  assert.equal(ESCAPE_VELOCITY_COOLDOWN_MS, 1500, 'Escape notification cooldown must be 1500ms');

  // Damage & Stun
  assert.equal(SINGULARITY_BURST_PLAYER_DMG, 30, 'Player crushing damage must be 30 HP');
  assert.equal(SINGULARITY_BURST_ENEMY_DMG, 120, 'Minion crushing damage must be 120 HP');
  assert.equal(SINGULARITY_BURST_BOSS_DMG_RATIO, 0.15, 'Boss stasis damage must be 15% Max HP');
  assert.equal(SINGULARITY_BURST_BOSS_STUN_MS, 1500, 'Boss stasis stun must be 1500ms');

  // Fusion & Proximity
  assert.equal(FUSION_FUSE_REDUCTION_MS, 1200, 'Fusion fuse reduction must be 1200ms');
  assert.equal(FUSION_EXTRA_BLAST_RADIUS, 3, 'Fusion bonus blast radius must be +3 tiles');
  assert.equal(FUSION_BONUS_SCORE, 150, 'Fusion bonus score must be 150');
  assert.equal(FUSION_CORE_RADIUS_PX, 34, 'Fusion core radius must be 34px');
  assert.equal(CORE_RADIUS_PX, 30, 'Singularity core radius must be 30px');
  assert.equal(MAX_RADIUS_PX, 120, 'Maximum pull radius must be 120px');
  assert.equal(MIN_SAFE_AREA_RATIO, 0.40, 'Minimum safe area ratio must be 0.40');

  // Floating Text Identifiers
  assert.equal(FLOATING_TEXT_GRAVITATIONAL_ESCAPE, '✦ GRAVITATIONAL ESCAPE!');
  assert.equal(FLOATING_TEXT_CRUSHED, '⚡ CRUSHED!');
  assert.equal(FLOATING_TEXT_BOSS_STASIS, '⚡ GRAVITATIONAL STASIS!');
  assert.equal(FLOATING_TEXT_COSMIC_FUSION, '✦ COSMIC FUSION!');
  assert.equal(FLOATING_TEXT_SINGULARITY_COLLAPSED, '💥 SINGULARITY COLLAPSED!');
});

test('Tier 1 [Dormant Invariants]: Initial construction is DORMANT with 100% safe area and zero danger tiles', () => {
  const hazard = new GravityHazard();
  assert.equal(hazard.state, GravityLifecycleState.DORMANT);
  assert.equal(hazard.getLifecycleState(), GravityLifecycleState.DORMANT);
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.NONE);
  assert.equal(hazard.stateTimerMs, 0);
  assert.equal(hazard.centerRow, 6);
  assert.equal(hazard.centerCol, 7);
  assert.equal(hazard.cooldownDurationMs, DEFAULT_GRAVITY_COOLDOWN_MS);

  let nonZeroCount = 0;
  for (let i = 0; i < hazard.dangerMask.length; i++) {
    if (hazard.dangerMask[i] !== 0) nonZeroCount++;
  }
  assert.equal(nonZeroCount, 0, 'DORMANT state must have 0 danger tiles');
  assert.equal(hazard.getSafeAreaRatio(), 1.0, 'Safe area must be 100% when DORMANT');

  // Updating while DORMANT produces zero state changes
  hazard.update(1000);
  assert.equal(hazard.state, GravityLifecycleState.DORMANT);
  assert.equal(hazard.stateTimerMs, 0);
});

test('Tier 1 [Grid Bounds & Clamping]: init() and setCenter() safely clamp center within playable grid boundaries', () => {
  const hazard = new GravityHazard();

  // Test negative out-of-bounds coordinates
  hazard.setCenter(-10, -5);
  assert.equal(hazard.centerRow, 1, 'centerRow must clamp to min 1');
  assert.equal(hazard.centerCol, 1, 'centerCol must clamp to min 1');

  // Test excessively high out-of-bounds coordinates
  hazard.setCenter(ROWS + 50, COLS + 100);
  assert.equal(hazard.centerRow, ROWS - 2, `centerRow must clamp to max ${ROWS - 2}`);
  assert.equal(hazard.centerCol, COLS - 2, `centerCol must clamp to max ${COLS - 2}`);

  // Test init() re-centering
  hazard.init(5, 5);
  assert.equal(hazard.centerRow, 5);
  assert.equal(hazard.centerCol, 5);
  assert.equal(hazard.state, GravityLifecycleState.DORMANT);
});

/* ==============================================================================
 * TIER 2: 4-STAGE LIFECYCLE FSM STATE MACHINE & SEVERITY SCALING
 * ============================================================================== */

test('Tier 2 [FSM Transitions]: Deterministic 4-stage cycle (DORMANT -> ACCRETION -> BURST -> COOLDOWN -> loop)', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);

  // 1. Start OUTBREAK: starts in ACCRETION_SWIRL telegraph
  hazard.start('OUTBREAK');
  assert.equal(hazard.state, GravityLifecycleState.ACCRETION_SWIRL);
  assert.equal(hazard.stateTimerMs, 0);
  assert.equal(hazard.cooldownDurationMs, DEFAULT_GRAVITY_COOLDOWN_MS);

  // 2. Sub-millisecond tick before telegraph completion (1999ms)
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS - 1);
  assert.equal(hazard.state, GravityLifecycleState.ACCRETION_SWIRL);
  assert.equal(hazard.stateTimerMs, DURATION_ACCRETION_TELEGRAPH_MS - 1);

  // 3. Exactly at 2000ms -> transitions to SINGULARITY_BURST
  hazard.update(1);
  assert.equal(hazard.state, GravityLifecycleState.SINGULARITY_BURST);
  assert.equal(hazard.stateTimerMs, 0, 'stateTimerMs resets to 0 upon entering burst');

  // 4. Sub-millisecond tick before burst completion (349ms)
  hazard.update(DURATION_SINGULARITY_BURST_MS - 1);
  assert.equal(hazard.state, GravityLifecycleState.SINGULARITY_BURST);

  // 5. Exactly at 350ms -> transitions to COOLDOWN
  hazard.update(1);
  assert.equal(hazard.state, GravityLifecycleState.COOLDOWN);
  assert.equal(hazard.stateTimerMs, 0, 'stateTimerMs resets to 0 upon entering cooldown');
  assert.equal(hazard.getSafeAreaRatio(), 1.0, 'Safe area is 100% in cooldown');

  // 6. Sub-millisecond tick before cooldown completion (5999ms)
  hazard.update(DEFAULT_GRAVITY_COOLDOWN_MS - 1);
  assert.equal(hazard.state, GravityLifecycleState.COOLDOWN);

  // 7. Exactly at 6000ms -> loops back to ACCRETION_SWIRL
  hazard.update(1);
  assert.equal(hazard.state, GravityLifecycleState.ACCRETION_SWIRL);
  assert.equal(hazard.stateTimerMs, 0);
});

test('Tier 2 [Accretion Sub-Phase Progression]: FORMATION (0-1000ms) -> COMPRESSION (1000-1600ms) -> CRITICAL_COLLAPSE (1600-2000ms)', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Formation Phase: 0ms to 999ms
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.FORMATION);
  hazard.update(500);
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.FORMATION);
  hazard.update(499);
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.FORMATION);

  // Compression Phase: 1000ms to 1599ms
  hazard.update(1); // at 1000ms
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.COMPRESSION);
  hazard.update(300); // at 1300ms
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.COMPRESSION);
  hazard.update(299); // at 1599ms
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.COMPRESSION);

  // Critical Collapse Phase: 1600ms to 1999ms
  hazard.update(1); // at 1600ms
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.CRITICAL_COLLAPSE);
  hazard.update(200); // at 1800ms
  assert.equal(hazard.getAccretionPhase(), AccretionPhase.CRITICAL_COLLAPSE);
});

test('Tier 2 [Crisis Stage Scaling]: Stage-based cooldowns (WHISPERS=6s, OUTBREAK=6s, CLIMAX=4s)', () => {
  const hazard = new GravityHazard();

  // Outbreak stage (default 6000ms)
  hazard.start('OUTBREAK');
  assert.equal(hazard.cooldownDurationMs, DEFAULT_GRAVITY_COOLDOWN_MS);

  // Climax stage (compressed to 4000ms)
  hazard.start('CLIMAX');
  assert.equal(hazard.cooldownDurationMs, CLIMAX_GRAVITY_COOLDOWN_MS);

  // Whispers stage (default 6000ms)
  hazard.start('WHISPERS');
  assert.equal(hazard.cooldownDurationMs, DEFAULT_GRAVITY_COOLDOWN_MS);
});

test('Tier 2 [Stop and Reset Interruption]: stop() and reset() cleanly return FSM to DORMANT from any state', () => {
  const hazard = new GravityHazard();

  // Interruption from ACCRETION_SWIRL
  hazard.start('OUTBREAK');
  hazard.update(500);
  assert.equal(hazard.state, GravityLifecycleState.ACCRETION_SWIRL);
  hazard.stop();
  assert.equal(hazard.state, GravityLifecycleState.DORMANT);
  assert.equal(hazard.stateTimerMs, 0);
  assert.equal(hazard.getSafeAreaRatio(), 1.0);

  // Interruption from SINGULARITY_BURST
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS);
  assert.equal(hazard.state, GravityLifecycleState.SINGULARITY_BURST);
  hazard.stop();
  assert.equal(hazard.state, GravityLifecycleState.DORMANT);
  assert.equal(hazard.getSafeAreaRatio(), 1.0);

  // Interruption from COOLDOWN
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS);
  hazard.update(DURATION_SINGULARITY_BURST_MS);
  assert.equal(hazard.state, GravityLifecycleState.COOLDOWN);
  hazard.reset();
  assert.equal(hazard.state, GravityLifecycleState.DORMANT);
  assert.equal(hazard.getSafeAreaRatio(), 1.0);
});

test('Tier 2 [Danger Mask Progression]: dangerMask transitions reflect exact spatial threat tiers', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);

  const centerIdx = 6 * COLS + 7;
  const adjacentIdx = 6 * COLS + 8; // 1 tile east
  const distantIdx = 1 * COLS + 1;  // corner

  // 1. DORMANT: all zeros
  assert.equal(hazard.dangerMask[centerIdx], 0);
  assert.equal(hazard.dangerMask[adjacentIdx], 0);
  assert.equal(hazard.dangerMask[distantIdx], 0);

  // 2. ACCRETION_SWIRL: core is 2, accretion field is 1, distant is 0
  hazard.start('OUTBREAK');
  assert.equal(hazard.dangerMask[centerIdx], 2, 'Core is flagged 2 in telegraph');
  assert.equal(hazard.dangerMask[adjacentIdx], 1, 'Accretion zone is flagged 1 in telegraph');
  assert.equal(hazard.dangerMask[distantIdx], 0, 'Distant tile is 0 (safe)');

  // 3. SINGULARITY_BURST: core is 2, entire accretion field becomes 2 (lethal)
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS);
  assert.equal(hazard.dangerMask[centerIdx], 2);
  assert.equal(hazard.dangerMask[adjacentIdx], 2, 'Accretion zone becomes lethal 2 during burst');
  assert.equal(hazard.dangerMask[distantIdx], 0);

  // 4. COOLDOWN: all zeros
  hazard.update(DURATION_SINGULARITY_BURST_MS);
  assert.equal(hazard.dangerMask[centerIdx], 0);
  assert.equal(hazard.dangerMask[adjacentIdx], 0);
  assert.equal(hazard.dangerMask[distantIdx], 0);
});

/* ==============================================================================
 * TIER 3: ZERO-GC TYPEDARRAY MEMORY LAYOUT & SCRATCH OBJECT RECYCLING
 * ============================================================================== */

test('Tier 3 [TypedArray Buffer Stability]: TypedArray instances are never reallocated across lifecycle operations', () => {
  const hazard = new GravityHazard();

  // TypedArray layout validations
  assert.ok(hazard.dangerMask instanceof Uint8Array, 'dangerMask must be Uint8Array');
  assert.equal(hazard.dangerMask.length, TOTAL_TILES, `dangerMask must be length ${TOTAL_TILES}`);

  assert.ok(hazard.pullField instanceof Float32Array, 'pullField must be Float32Array');
  assert.equal(hazard.pullField.length, TOTAL_TILES * 2, `pullField must be length ${TOTAL_TILES * 2}`);

  // Retain buffer references
  const dangerBufferRef = hazard.dangerMask.buffer;
  const pullBufferRef = hazard.pullField.buffer;

  // Execute full lifecycle and configuration permutations
  hazard.init(3, 4);
  hazard.setCenter(8, 9);
  hazard.start('CLIMAX');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS);
  hazard.update(DURATION_SINGULARITY_BURST_MS);
  hazard.update(CLIMAX_GRAVITY_COOLDOWN_MS);
  hazard.stop();
  hazard.reset();

  // Verify memory address immutability
  assert.strictEqual(hazard.dangerMask.buffer, dangerBufferRef, 'dangerMask buffer must never be reallocated');
  assert.strictEqual(hazard.pullField.buffer, pullBufferRef, 'pullField buffer must never be reallocated');
});

test('Tier 3 [Scratch Object Recycling]: Evaluation queries reuse identical pre-allocated object instances', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Pull scratch reuse
  const pull1 = hazard.evaluatePull(100, 100);
  const pull2 = hazard.evaluatePull(200, 200);
  assert.strictEqual(pull1, pull2, 'evaluatePull must reuse scratchPullResult instance');

  // Player scratch reuse
  const player1 = hazard.evaluatePlayer(100, 100, false, 0);
  const player2 = hazard.evaluatePlayer(200, 200, true, 100);
  assert.strictEqual(player1, player2, 'evaluatePlayer must reuse scratchPlayerResult instance');

  // Enemy scratch reuse
  const enemy1 = hazard.evaluateEnemy(100, 100, false);
  const enemy2 = hazard.evaluateEnemy(200, 200, true);
  assert.strictEqual(enemy1, enemy2, 'evaluateEnemy must reuse scratchEnemyResult instance');

  // Fusion scratch reuse & array buffer recycling
  const bombsA = [{ x: 300, y: 260 }, { x: 302, y: 262 }];
  const bombsB = [{ x: 50, y: 50 }];
  const fusion1 = hazard.evaluateBombFusion(bombsA);
  const arrayRef = fusion1.fusedBombIndices;
  const fusion2 = hazard.evaluateBombFusion(bombsB);

  assert.strictEqual(fusion1, fusion2, 'evaluateBombFusion must reuse scratchFusionResult instance');
  assert.strictEqual(fusion2.fusedBombIndices, arrayRef, 'fusedBombIndices array must be recycled in-place');
});

test('Tier 3 [Re-entrancy & Field Cleanliness]: Sequential calls fully overwrite scratch fields without dirty residue', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS); // Enter SINGULARITY_BURST

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2; // 300
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2; // 260

  // 1. Call evaluatePlayer inside core (takes 30 damage)
  const p1 = hazard.evaluatePlayer(corePxX, corePxY, false, 1000);
  assert.equal(p1.damage, 30);
  assert.equal(p1.isCrushed, true);

  // 2. Call evaluatePlayer far away (outside accretion field)
  const p2 = hazard.evaluatePlayer(10, 10, false, 1016);
  assert.equal(p2.damage, 0, 'Damage must be cleaned to 0');
  assert.equal(p2.slowFactor, 1.0, 'slowFactor must reset to 1.0');
  assert.equal(p2.isCrushed, false, 'isCrushed must reset to false');
  assert.equal(p2.isEscaping, false, 'isEscaping must reset to false');

  // 3. Call evaluateEnemy on boss inside core
  const e1 = hazard.evaluateEnemy(corePxX, corePxY, true, 1000);
  assert.equal(e1.damage, 150);
  assert.equal(e1.isStunned, true);
  assert.equal(e1.stunDurationMs, 1500);

  // 4. Call evaluateEnemy on distant minion
  const e2 = hazard.evaluateEnemy(10, 10, false);
  assert.equal(e2.damage, 0, 'Damage must reset to 0');
  assert.equal(e2.isCrushed, false, 'isCrushed must reset to false');
  assert.equal(e2.isStunned, false, 'isStunned must reset to false');
  assert.equal(e2.stunDurationMs, 0, 'stunDurationMs must reset to 0');

  // 5. Call evaluateBombFusion with 2 bombs (triggers fusion)
  const f1 = hazard.evaluateBombFusion([{ x: corePxX, y: corePxY }, { x: corePxX + 1, y: corePxY + 1 }]);
  assert.equal(f1.triggered, true);
  assert.equal(f1.bonusRadius, 3);
  assert.equal(f1.fusedBombIndices.length, 2);

  // 6. Call evaluateBombFusion with 0 bombs
  const f2 = hazard.evaluateBombFusion([]);
  assert.equal(f2.triggered, false, 'triggered must reset to false');
  assert.equal(f2.bonusRadius, 0, 'bonusRadius must reset to 0');
  assert.equal(f2.fusedBombIndices.length, 0, 'fusedBombIndices must be cleared');
});

/* ==============================================================================
 * TIER 4: GRAVITATIONAL PULL VECTOR FIELD & CONTINUOUS PHYSICS
 * ============================================================================== */

test('Tier 4 [Vector Field Normalization]: Precomputed pullField contains normalized unit vectors pointing inward', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);

  const centerR = 6;
  const centerC = 7;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const vr = hazard.pullField[idx * 2];
      const vc = hazard.pullField[idx * 2 + 1];
      const dist = Math.hypot(centerR - r, centerC - c);

      if (dist === 0) {
        assert.equal(vr, 0, 'Center tile pull vr must be 0');
        assert.equal(vc, 0, 'Center tile pull vc must be 0');
      } else if (dist <= GRAVITY_PULL_RADIUS_TILES) {
        const length = Math.hypot(vr, vc);
        assert.ok(
          Math.abs(length - 1.0) < 1e-5,
          `Pull vector at (${r}, ${c}) must be normalized unit vector, got ${length}`
        );
        // Verify vector direction points toward (centerR, centerC)
        assert.ok((centerR - r) * vr >= 0, 'Vector component must point toward center row');
        assert.ok((centerC - c) * vc >= 0, 'Vector component must point toward center col');
      } else {
        assert.equal(vr, 0, 'Outside pull radius vr must be 0');
        assert.equal(vc, 0, 'Outside pull radius vc must be 0');
      }
    }
  }
});

test('Tier 4 [Continuous Pull Evaluation]: Continuous pixel pull vectors point inward with linear distance falloff', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2; // 300
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2; // 260
  const maxRadiusPx = MAX_RADIUS_PX; // 120px

  // Cardinal Direction 1: North of core (y < coreY) -> pull must be South (vy > 0)
  const pullNorth = hazard.evaluatePull(corePxX, corePxY - 60);
  assert.equal(pullNorth.inAccretionField, true);
  assert.equal(pullNorth.pullVx, 0);
  assert.ok(pullNorth.pullVy > 0, 'North point must be pulled South toward core');
  // Falloff: dist = 60 / 120 = 0.5 intensity -> 0.5 * 65 = 32.5 px/s
  assert.ok(Math.abs(pullNorth.pullVy - 32.5) < 0.1, `Expected ~32.5 px/s, got ${pullNorth.pullVy}`);

  // Cardinal Direction 2: South of core (y > coreY) -> pull must be North (vy < 0)
  const pullSouth = hazard.evaluatePull(corePxX, corePxY + 60);
  assert.equal(pullSouth.pullVx, 0);
  assert.ok(pullSouth.pullVy < 0, 'South point must be pulled North toward core');
  assert.ok(Math.abs(pullSouth.pullVy - (-32.5)) < 0.1);

  // Cardinal Direction 3: East of core (x > coreX) -> pull must be West (vx < 0)
  const pullEast = hazard.evaluatePull(corePxX + 60, corePxY);
  assert.ok(pullEast.pullVx < 0, 'East point must be pulled West toward core');
  assert.equal(pullEast.pullVy, 0);
  assert.ok(Math.abs(pullEast.pullVx - (-32.5)) < 0.1);

  // Cardinal Direction 4: West of core (x < coreX) -> pull must be East (vx > 0)
  const pullWest = hazard.evaluatePull(corePxX - 60, corePxY);
  assert.ok(pullWest.pullVx > 0, 'West point must be pulled East toward core');
  assert.equal(pullWest.pullVy, 0);
  assert.ok(Math.abs(pullWest.pullVx - 32.5) < 0.1);

  // Exact Boundary at 120px: inAccretionField = true, pull ~ 0
  const pullBoundary = hazard.evaluatePull(corePxX + maxRadiusPx, corePxY);
  assert.equal(pullBoundary.inAccretionField, true);
  assert.ok(Math.abs(pullBoundary.pullVx) < 0.01);

  // Outside boundary at 121px: inAccretionField = false, pull = 0
  const pullOutside = hazard.evaluatePull(corePxX + maxRadiusPx + 1, corePxY);
  assert.equal(pullOutside.inAccretionField, false);
  assert.equal(pullOutside.pullVx, 0);
  assert.equal(pullOutside.pullVy, 0);

  // Singularity Core threshold (<= 30px)
  const insideCore = hazard.evaluatePull(corePxX + 25, corePxY);
  assert.equal(insideCore.inSingularityCore, true);

  const outsideCore = hazard.evaluatePull(corePxX + 35, corePxY);
  assert.equal(outsideCore.inSingularityCore, false);
  assert.equal(outsideCore.inAccretionField, true);
});

test('Tier 4 [Dormant / Cooldown Suppression]: Gravity pull is completely inactive when DORMANT or in COOLDOWN', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. In DORMANT
  const pullDormant = hazard.evaluatePull(corePxX + 20, corePxY);
  assert.equal(pullDormant.inAccretionField, false);
  assert.equal(pullDormant.inSingularityCore, false);
  assert.equal(pullDormant.pullVx, 0);
  assert.equal(pullDormant.pullVy, 0);
  assert.equal(pullDormant.distToCorePx, 99999);

  // 2. In COOLDOWN
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS);
  hazard.update(DURATION_SINGULARITY_BURST_MS);
  assert.equal(hazard.state, GravityLifecycleState.COOLDOWN);

  const pullCooldown = hazard.evaluatePull(corePxX + 20, corePxY);
  assert.equal(pullCooldown.inAccretionField, false);
  assert.equal(pullCooldown.pullVx, 0);
  assert.equal(pullCooldown.pullVy, 0);
});

/* ==============================================================================
 * TIER 5: MATHEMATICAL SAFE AREA INVARIANT (>= 40% MANDATE)
 * ============================================================================== */

test('Tier 5 [Safe Area Guarantee]: Safe area ratio >= 40% holds exhaustively for EVERY grid coordinate', () => {
  const hazard = new GravityHazard();

  // Exhaustively test every playable tile as potential singularity center
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      hazard.setCenter(r, c);
      hazard.start('OUTBREAK');

      const safeRatioTelegraph = hazard.getSafeAreaRatio();
      assert.ok(
        safeRatioTelegraph >= MIN_SAFE_AREA_RATIO,
        `Safe area at (${r}, ${c}) in telegraph must be >= 0.40, got ${safeRatioTelegraph}`
      );
      assert.ok(
        safeRatioTelegraph >= 0.84,
        `Theoretical lower bound is ~85%, got ${safeRatioTelegraph} at (${r}, ${c})`
      );

      hazard.update(DURATION_ACCRETION_TELEGRAPH_MS);
      const safeRatioBurst = hazard.getSafeAreaRatio();
      assert.ok(
        safeRatioBurst >= MIN_SAFE_AREA_RATIO,
        `Safe area at (${r}, ${c}) in burst must be >= 0.40, got ${safeRatioBurst}`
      );
      assert.ok(
        safeRatioBurst >= 0.84,
        `Burst safe area lower bound is ~85%, got ${safeRatioBurst} at (${r}, ${c})`
      );

      hazard.update(DURATION_SINGULARITY_BURST_MS);
      assert.equal(
        hazard.getSafeAreaRatio(),
        1.0,
        `Safe area at (${r}, ${c}) in cooldown must be 1.0`
      );
    }
  }
});

test('Tier 5 [Mathematical Danger Upper Bound]: Maximum affected tiles never exceeds 29 tiles out of 195', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  let dangerCount = 0;
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (hazard.dangerMask[i] > 0) {
      dangerCount++;
    }
  }

  // A Euclidean circle of radius 3 contains exactly 29 lattice tiles
  assert.equal(dangerCount, 29, 'Radius 3 Euclidean circle in 2D lattice must span exactly 29 tiles');
  const safeRatio = (TOTAL_TILES - 29) / TOTAL_TILES;
  assert.ok(
    Math.abs(hazard.getSafeAreaRatio() - safeRatio) < 1e-5,
    `Calculated safe ratio ${hazard.getSafeAreaRatio()} must match exact fraction ${safeRatio}`
  );
  assert.ok(hazard.getSafeAreaRatio() > 0.85, 'Safe area strictly exceeds 85%');
});

/* ==============================================================================
 * TIER 6: COSMIC FUSION SUPER-BOMB MECHANICS & INWARD PULL PHYSICS
 * ============================================================================== */

test('Tier 6 [Fusion Trigger Conditions]: Cosmic Fusion triggers only when 2 or more bombs are within core threshold', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2; // 300
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2; // 260

  // 1. Zero bombs on board
  const res0 = hazard.evaluateBombFusion([]);
  assert.equal(res0.triggered, false);
  assert.equal(res0.bonusRadius, 0);
  assert.equal(res0.fusedBombIndices.length, 0);

  // 2. Single bomb at core
  const res1 = hazard.evaluateBombFusion([{ x: corePxX, y: corePxY }]);
  assert.equal(res1.triggered, false, '1 bomb cannot trigger Cosmic Fusion');
  assert.equal(res1.bonusRadius, 0);
  assert.equal(res1.fusedBombIndices.length, 1);

  // 3. Two bombs: 1 at core, 1 outside fusion core threshold (> 34px)
  const resSplit = hazard.evaluateBombFusion([
    { x: corePxX + 5, y: corePxY + 5 },
    { x: corePxX + 50, y: corePxY }, // 50px away
  ]);
  assert.equal(resSplit.triggered, false, 'Only 1 bomb inside fusion core');
  assert.equal(resSplit.fusedBombIndices.length, 1);
  assert.equal(resSplit.fusedBombIndices[0], 0);

  // 4. Two bombs inside core -> Cosmic Fusion triggers
  const res2 = hazard.evaluateBombFusion([
    { x: corePxX + 10, y: corePxY },
    { x: corePxX - 10, y: corePxY },
  ]);
  assert.equal(res2.triggered, true, '2 bombs inside core trigger Cosmic Fusion');
  assert.equal(res2.bonusRadius, FUSION_EXTRA_BLAST_RADIUS);
  assert.deepEqual(res2.fusedBombIndices, [0, 1]);

  // 5. Multi-bomb cluster (3 bombs at core, 1 distant)
  const resMulti = hazard.evaluateBombFusion([
    { x: corePxX + 5, y: corePxY + 5 },
    { x: 50, y: 50 }, // Distant
    { x: corePxX - 5, y: corePxY - 5 },
    { x: corePxX, y: corePxY + 10 },
  ]);
  assert.equal(resMulti.triggered, true);
  assert.equal(resMulti.bonusRadius, FUSION_EXTRA_BLAST_RADIUS);
  assert.deepEqual(resMulti.fusedBombIndices, [0, 2, 3]);
});

test('Tier 6 [Fusion State Filtering]: Cosmic Fusion is disabled when hazard is DORMANT or in COOLDOWN', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;
  const twoCoreBombs = [
    { x: corePxX, y: corePxY },
    { x: corePxX + 5, y: corePxY },
  ];

  // 1. In DORMANT
  const resDormant = hazard.evaluateBombFusion(twoCoreBombs);
  assert.equal(resDormant.triggered, false);

  // 2. In COOLDOWN
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS);
  hazard.update(DURATION_SINGULARITY_BURST_MS);
  assert.equal(hazard.state, GravityLifecycleState.COOLDOWN);

  const resCooldown = hazard.evaluateBombFusion(twoCoreBombs);
  assert.equal(resCooldown.triggered, false);
});

test('Tier 6 [Bomb Attraction Simulation]: Gravitational pull steadily drags loose bombs into core for fusion', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2; // 300
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2; // 260

  // Place Bomb 0 at core, Bomb 1 at 75px east of core
  const bombs = [
    { x: corePxX, y: corePxY },
    { x: corePxX + 75, y: corePxY },
  ];

  // Initially: 1 bomb at core, no fusion
  let fusion = hazard.evaluateBombFusion(bombs);
  assert.equal(fusion.triggered, false);

  // Simulate physics update steps (16ms per frame = 60fps)
  const dtSeconds = 0.016;
  let steps = 0;
  while (!fusion.triggered && steps < 200) {
    const pull = hazard.evaluatePull(bombs[1].x, bombs[1].y);
    assert.ok(pull.inAccretionField);
    bombs[1].x += pull.pullVx * dtSeconds;
    bombs[1].y += pull.pullVy * dtSeconds;

    fusion = hazard.evaluateBombFusion(bombs);
    steps++;
  }

  // Verify bomb 1 was pulled into core and triggered fusion
  assert.ok(fusion.triggered, 'Bomb 1 must be pulled into core threshold to trigger Cosmic Fusion');
  assert.ok(steps < 150, `Fusion should trigger within reasonable simulation frames (took ${steps} frames)`);
  assert.deepEqual(fusion.fusedBombIndices, [0, 1]);
});

test('Tier 6 [Singularity Collapse Counterplay]: Bomb detonation at core collapses singularity into cooldown', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  // Detonate bomb at epicenter (6, 7)
  const detRes = hazard.onBombDetonatedInSingularity(6, 7, 2);
  assert.equal(detRes.collapsed, true, 'Detonation at epicenter must collapse singularity');
  assert.equal(detRes.floatingText, FLOATING_TEXT_SINGULARITY_COLLAPSED);
  assert.equal(detRes.shockwaveRadiusTiles, 3);
  assert.equal(hazard.state, GravityLifecycleState.COOLDOWN, 'Collapsed hazard enters cooldown');

  // Detonate distant bomb during new cycle: does not collapse
  hazard.start('OUTBREAK');
  const detDistant = hazard.onBombDetonatedInSingularity(1, 1, 2);
  assert.equal(detDistant.collapsed, false);
  assert.equal(hazard.state, GravityLifecycleState.ACCRETION_SWIRL);
});

/* ==============================================================================
 * TIER 7: PLAYER DRAG, CRUSHING & ESCAPE VELOCITY DASH
 * ============================================================================== */

test('Tier 7 [Player Drag & Directional Mechanics]: Player receives drag or acceleration based on trajectory', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. Stationary non-dashing player in accretion field: receives 25% drag penalty (slowFactor = 0.75)
  const resStationary = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000);
  assert.equal(resStationary.damage, 0);
  assert.equal(resStationary.slowFactor, 1.0 - PLAYER_GRAVITY_DRAG_RATIO, 'Stationary player gets -25% drag');
  assert.equal(resStationary.isEscaping, false);
  assert.equal(resStationary.isCrushed, false);

  // 2. Moving away from core (player at coreX+60, moving East moveDirX = 1): gets -25% drag
  const resAway = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000, 1, 0);
  assert.equal(resAway.slowFactor, 1.0 - PLAYER_GRAVITY_DRAG_RATIO);

  // 3. Moving toward core (player at coreX+60, moving West moveDirX = -1): gets +20% pull acceleration
  const resToward = hazard.evaluatePlayer(corePxX + 60, corePxY, false, 1000, -1, 0);
  assert.equal(resToward.slowFactor, 1.0 + PLAYER_GRAVITY_PULL_RATIO);

  // 4. Player outside accretion field: slowFactor = 1.0
  const resOutside = hazard.evaluatePlayer(corePxX + 150, corePxY, false, 1000);
  assert.equal(resOutside.damage, 0);
  assert.equal(resOutside.slowFactor, 1.0, 'No drag outside accretion field');
});

test('Tier 7 [Singularity Core Crushing]: Player takes 30 damage in burst core unless dashing', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS); // Enter SINGULARITY_BURST

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // 1. Non-dashing player in core: takes 30 crushing damage
  const resCrushed = hazard.evaluatePlayer(corePxX + 5, corePxY, false, 2500);
  assert.equal(resCrushed.damage, SINGULARITY_BURST_PLAYER_DMG);
  assert.equal(resCrushed.isCrushed, true);
  assert.equal(resCrushed.hit, true);
  assert.equal(resCrushed.floatingText, FLOATING_TEXT_CRUSHED);
  assert.equal(resCrushed.isEscaping, false);

  // 2. Non-dashing player in field but outside core: 0 damage
  const resSafeField = hazard.evaluatePlayer(corePxX + 50, corePxY, false, 2516);
  assert.equal(resSafeField.damage, 0);
  assert.equal(resSafeField.isCrushed, false);

  // 3. Dashing player in core: breaks free with escape velocity, takes 0 damage
  const resDashCore = hazard.evaluatePlayer(corePxX + 5, corePxY, true, 4500);
  assert.equal(resDashCore.damage, 0, 'Dashing player evades crushing damage');
  assert.equal(resDashCore.isCrushed, false);
  assert.equal(resDashCore.isEscaping, true);
  assert.equal(resDashCore.floatingText, FLOATING_TEXT_GRAVITATIONAL_ESCAPE);
});

test('Tier 7 [Escape Velocity Cooldown]: Gravitational Escape triggers with 1500ms rate limiting', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // First dash at t = 1000ms: triggers escape
  const res1 = hazard.evaluatePlayer(corePxX + 40, corePxY, true, 1000);
  assert.equal(res1.isEscaping, true, 'First dash triggers escape');
  assert.equal(res1.slingshotGranted, true);
  assert.equal(res1.slingshotDurationMs, ESCAPE_VELOCITY_INVULN_MS);
  assert.equal(res1.speedBoostRatio, ESCAPE_VELOCITY_SPEED_BURST_RATIO);

  // Second dash at t = 1500ms (500ms later): within 1500ms cooldown -> isEscaping is false
  const res2 = hazard.evaluatePlayer(corePxX + 40, corePxY, true, 1500);
  assert.equal(res2.isEscaping, false, 'Dash within 1500ms does not re-trigger escape notification');
  assert.equal(res2.damage, 0, 'Damage is still negated while dashing');

  // Third dash at t = 2500ms (1500ms after first): triggers escape again
  const res3 = hazard.evaluatePlayer(corePxX + 40, corePxY, true, 2500);
  assert.equal(res3.isEscaping, true, 'Dash after 1500ms cooldown triggers escape again');
});

/* ==============================================================================
 * TIER 8: ENEMY CRUSHING & BOSS GRAVITATIONAL STASIS
 * ============================================================================== */

test('Tier 8 [Minion Crushing]: Minion enemies in Singularity Burst core suffer 120 damage and crushing', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS); // Enter SINGULARITY_BURST

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;

  // Minion in core
  const resCoreMinion = hazard.evaluateEnemy(corePxX + 10, corePxY, false);
  assert.equal(resCoreMinion.hit, true);
  assert.equal(resCoreMinion.damage, SINGULARITY_BURST_ENEMY_DMG);
  assert.equal(resCoreMinion.isCrushed, true);
  assert.equal(resCoreMinion.floatingText, FLOATING_TEXT_CRUSHED);
  assert.equal(resCoreMinion.isStunned, false);

  // Minion in accretion field but outside core
  const resFieldMinion = hazard.evaluateEnemy(corePxX + 50, corePxY, false);
  assert.equal(resFieldMinion.hit, false);
  assert.equal(resFieldMinion.damage, 0);
  assert.equal(resFieldMinion.isCrushed, false);

  // Minion outside field
  const resOutsideMinion = hazard.evaluateEnemy(10, 10, false);
  assert.equal(resOutsideMinion.hit, false);
  assert.equal(resOutsideMinion.damage, 0);
});

test('Tier 8 [Boss Stasis & Anti-Exploit Guard]: Boss takes 15% Max HP flat damage, 1.5s stun, and single-hit protection', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('OUTBREAK');
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS); // Enter SINGULARITY_BURST

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;
  const bossMaxHp = 2000;

  // 1. First hit on Boss: 15% flat damage (300 HP) + 1500ms stun
  const resBoss1 = hazard.evaluateEnemy(corePxX + 10, corePxY, true, bossMaxHp);
  assert.equal(resBoss1.hit, true);
  assert.equal(resBoss1.damage, 300, 'Boss takes exactly 15% of 2000 HP (300 DMG)');
  assert.equal(resBoss1.isStunned, true);
  assert.equal(resBoss1.stunDurationMs, SINGULARITY_BURST_BOSS_STUN_MS);
  assert.equal(resBoss1.floatingText, FLOATING_TEXT_BOSS_STASIS);

  // 2. Anti-Exploit Guard: Subsequent checks in the same burst phase deal 0 damage
  const resBoss2 = hazard.evaluateEnemy(corePxX + 10, corePxY, true, bossMaxHp);
  assert.equal(resBoss2.damage, 0, 'Subsequent hits in same burst must deal 0 damage');
  assert.equal(resBoss2.isStunned, false);
  assert.equal(resBoss2.hit, false);

  const resBoss3 = hazard.evaluateEnemy(corePxX, corePxY, true, bossMaxHp);
  assert.equal(resBoss3.damage, 0);

  // 3. Advance to NEXT cycle: COOLDOWN -> ACCRETION_SWIRL -> next SINGULARITY_BURST
  hazard.update(DURATION_SINGULARITY_BURST_MS); // to COOLDOWN
  hazard.update(DEFAULT_GRAVITY_COOLDOWN_MS);   // to ACCRETION_SWIRL
  hazard.update(DURATION_ACCRETION_TELEGRAPH_MS); // to new SINGULARITY_BURST

  // 4. Boss can now be hit again in the new cycle
  const resBossNewCycle = hazard.evaluateEnemy(corePxX + 10, corePxY, true, bossMaxHp);
  assert.equal(resBossNewCycle.hit, true);
  assert.equal(resBossNewCycle.damage, 300, 'Boss stasis damage resets on new burst cycle');
  assert.equal(resBossNewCycle.isStunned, true);
});

/* ==============================================================================
 * TIER 9: HIGH-THROUGHPUT ZERO-GC MULTI-ENTITY SOAK STRESS
 * ============================================================================== */

test('Tier 9 [10,000-Frame Zero-GC Soak]: Multi-entity full-lifecycle soak executes with zero heap drift', () => {
  const hazard = new GravityHazard();
  hazard.init(6, 7);
  hazard.start('CLIMAX');

  const corePxX = 7 * TILE_SIZE + TILE_SIZE / 2;
  const corePxY = 6 * TILE_SIZE + TILE_SIZE / 2;
  const bombs = [
    { x: corePxX, y: corePxY },
    { x: corePxX + 10, y: corePxY + 10 },
    { x: corePxX + 80, y: corePxY },
  ];

  const isGcExposed = typeof global.gc === 'function';
  if (isGcExposed) global.gc();
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const ITERATIONS = 10000;
  for (let i = 0; i < ITERATIONS; i++) {
    // 1. Advance lifecycle (16ms per frame = 60 FPS)
    hazard.update(16);

    // 2. Continuous pull queries
    hazard.evaluatePull(corePxX + (i % 60) - 30, corePxY + (i % 60) - 30);

    // 3. Player navigation & dash queries
    hazard.evaluatePlayer(
      corePxX + (i % 40) - 20,
      corePxY + (i % 40) - 20,
      i % 15 === 0,
      i * 16,
      (i % 3) - 1,
      ((i + 1) % 3) - 1
    );

    // 4. Multi-enemy evaluation
    hazard.evaluateEnemy(corePxX + (i % 20), corePxY + (i % 20), false);
    hazard.evaluateEnemy(corePxX + (i % 30), corePxY + (i % 30), true, 1000);

    // 5. Tactical bomb mechanics
    hazard.applyBombGravitationalPull(corePxX + (i % 50), corePxY + (i % 50), 16);
    hazard.evaluateBombFusion(bombs);
    if (i % 250 === 0) {
      hazard.onBombDetonatedInSingularity(6, 7, 2);
    }
  }

  const durationMs = performance.now() - t0;
  if (isGcExposed) global.gc();
  const memAfter = process.memoryUsage().heapUsed;

  const heapDriftMB = (memAfter - memBefore) / (1024 * 1024);
  if (isGcExposed) {
    assert.ok(
      heapDriftMB < 0.25,
      `Zero-GC heap drift ${heapDriftMB.toFixed(4)} MB must be strictly < 0.25 MB`
    );
  } else {
    assert.ok(
      heapDriftMB < 5.0,
      `Ambient heap drift ${heapDriftMB.toFixed(4)} MB must remain tightly bounded`
    );
  }

  assert.ok(
    durationMs < 250,
    `10,000 multi-entity hazard frames must complete in < 250ms (took ${durationMs.toFixed(2)}ms)`
  );
});
