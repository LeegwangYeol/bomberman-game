/**
 * Milestone 2: Comprehensive Boss Subsystem Unit & Simulation Test Suite
 *
 * Directly exercises the deliverable implementation files from src/game/bosses/:
 * 1. BaseBoss 7-State FSM Transitions (INTRO, PHASE_1, INTERMISSION, PHASE_2, ENRAGED, STUNNED, DEFEATED)
 * 2. 150ms Multi-Bomb Combo Buffer Window & Stun Scaling (3.0s - 4.5s)
 * 3. 3-Tier Tile Telegraph Engine, Committed Trajectories & Fair Encounter Guarantee (>= 40% safe tiles)
 * 4. King Gummy Bear: Royal Leap, Sticky Pancake Stun (2.2s), Masterplay Lure (4.0s)
 * 5. Mecha Hamster Captain Nibbles: Kinetic Dash, Bank Shot, Head-On Collision Dizzy Stun (3.0s)
 * 6. Queen Bee Cupcake: Aerial Flight Immunity, Shield Popping, Dive-Bomb Crater Stun (2.5s)
 * 7. BossHUD State Synchronization & React Bridge Event Payloads
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  BossState,
  TelegraphTier,
  BaseBoss,
  GummyBearBoss,
  HamsterBoss,
  QueenBeeBoss,
  TelegraphEngine,
  BossHUD,
} from '../src/game/bosses/index.ts';
import { OrbitalCrisis } from '../src/game/crises/OrbitalCrisis.ts';
import { VoidCrisis } from '../src/game/crises/VoidCrisis.ts';
import { LavaCrisis } from '../src/game/crises/LavaCrisis.ts';
import { ClockworkCrisis } from '../src/game/crises/ClockworkCrisis.ts';
import { CrisisStage } from '../src/game/crises/CrisisTypes.ts';
import { ScalingEngine } from '../src/game/progression/ScalingEngine.ts';

/* ==============================================================================
 * TEST HARNESS CONCRETE SUBCLASS FOR ABSTRACT BaseBoss
 * ============================================================================== */

class TestFsmBoss extends BaseBoss {
  constructor(maxHp = 10) {
    super(
      {
        id: 'test_boss',
        name: 'Test Boss',
        title: 'FSM Test Dummy',
        avatarEmoji: '🤖',
        maxHp,
        footprintWidth: 80,
        footprintHeight: 80,
        colliderRadius: 35,
        baseSpeed: 80,
        phase2HpThreshold: 0.7,
        phase3HpThreshold: 0.33,
      },
      300,
      260
    );
  }

  canTakeDamage() {
    return true;
  }

  updatePhase1() {}
  updatePhase2() {}
  updateEnraged() {}
  onHitReceived() {}
  onDamageBlocked() {}
  onStateChanged() {}
  onDefeated() {}
}

/* ==============================================================================
 * SUITE 1: 7-STATE FSM TRANSITIONS & COMBAT PROGRESSION
 * ============================================================================== */

test('Boss 1.1: BaseBoss — 7-state FSM transitions strictly respect lifecycle rules and HP thresholds', () => {
  const boss = new TestFsmBoss(10);

  // 1. Initial state is INTRO
  assert.strictEqual(boss.bossState, BossState.INTRO);
  assert.strictEqual(boss.takeBombDamage(1), false, 'Boss must reject damage during INTRO state');

  // 2. Advance through INTRO (1500ms)
  boss.update(1500);
  assert.strictEqual(boss.bossState, BossState.PHASE_1, 'Boss must transition to PHASE_1 after intro timer');

  // 3. Take Phase 1 damage down to 70% threshold (10 HP -> 7 HP)
  // Deliver a 2-bomb chain to trigger combo stun and phase transition
  assert.strictEqual(boss.takeBombDamage(2), true);
  boss.update(50);
  assert.strictEqual(boss.takeBombDamage(1), true);

  // Complete combo window (150ms total)
  boss.update(120);
  assert.strictEqual(boss.currentHp, 7);
  // Combo hits >= 2 triggers STUNNED state
  assert.strictEqual(boss.bossState, BossState.STUNNED);

  // Advance through stun duration (3.75s)
  boss.update(4000);
  // Recovers from stun: because hpRatio <= 0.70, transitions to INTERMISSION
  assert.strictEqual(boss.bossState, BossState.INTERMISSION);
  assert.strictEqual(boss.phase, 2);

  // Advance through INTERMISSION (1800ms)
  boss.update(1800);
  assert.strictEqual(boss.bossState, BossState.PHASE_2, 'Boss must enter PHASE_2 after intermission');

  // 4. Take Phase 2 damage down to 33% threshold (7 HP -> 3 HP)
  boss.update(1500); // expire post-intermission i-frames
  assert.strictEqual(boss.takeBombDamage(4), true);
  boss.update(160); // resolve combo
  assert.strictEqual(boss.currentHp, 3);
  assert.strictEqual(boss.bossState, BossState.ENRAGED, 'Boss must enter ENRAGED state at <= 33% HP');
  assert.strictEqual(boss.phase, 3);

  // 5. Lethal damage transitions to DEFEATED
  boss.update(1500); // expire i-frames
  assert.strictEqual(boss.takeBombDamage(3), true);
  assert.strictEqual(boss.currentHp, 0);
  assert.strictEqual(boss.bossState, BossState.DEFEATED);
  assert.strictEqual(boss.takeBombDamage(1), false, 'Boss must reject damage when DEFEATED');
});

/* ==============================================================================
 * SUITE 2: 150MS MULTI-BOMB COMBO BUFFER & STUN SCALING
 * ============================================================================== */

test('Boss 1.2: 150ms Multi-Bomb Combo Buffer — Chain blasts accumulate damage and extend stun window', () => {
  const boss = new TestFsmBoss(9);
  boss.update(1500); // Complete intro -> PHASE_1

  // Bomb 1 lands at t = 0ms
  assert.strictEqual(boss.takeBombDamage(1), true);
  assert.strictEqual(boss.comboHits, 1);
  assert.strictEqual(boss.isComboActive, true);

  // Bomb 2 lands at t = 60ms (within 150ms window)
  boss.update(60);
  assert.strictEqual(boss.takeBombDamage(1), true);
  assert.strictEqual(boss.comboHits, 2);

  // Bomb 3 lands at t = 110ms (within 150ms window)
  boss.update(50);
  assert.strictEqual(boss.takeBombDamage(1), true);
  assert.strictEqual(boss.comboHits, 3);
  assert.strictEqual(boss.currentHp, 6, 'All 3 buffered bombs must register damage');

  // Advance 50ms (total 160ms): buffer window expires
  boss.update(50);
  assert.strictEqual(boss.isComboActive, false);
  assert.strictEqual(boss.isStunned, true);

  // Stun scaling formula in BaseBoss: 3.0s + min(1.5, (comboHits - 1) * 0.75)
  // For 3 hits: 3.0 + min(1.5, 2 * 0.75) = 3.0 + 1.5 = 4.5s (4500ms)
  assert.strictEqual(boss.stunRemainingMs, 4500, '3-bomb combo must grant 4.5s extended stun');

  // ARCH-02: Stun opens tactical vulnerability window — blasts arriving during stun must register damage!
  assert.strictEqual(
    boss.takeBombDamage(1),
    true,
    'Blasts arriving during tactical stun window must be accepted'
  );
  assert.strictEqual(boss.currentHp, 5);

  // Advance through remaining stun duration (4500ms) to trigger recovery
  boss.update(4500);
  assert.strictEqual(boss.isStunned, false);

  // Bomb 5 arrives during post-stun recovery i-frames: must be rejected
  assert.strictEqual(
    boss.takeBombDamage(1),
    false,
    'Blasts arriving during post-stun recovery i-frames must be rejected'
  );
  assert.strictEqual(boss.currentHp, 5);
});

/* ==============================================================================
 * SUITE 3: 3-TIER TELEGRAPHS & FAIR ENCOUNTER GUARANTEE (>= 40% SAFE TILES)
 * ============================================================================== */

test('Boss 1.3: 3-Tier Telegraphs — Stages progress correctly and guarantee >= 40% walkable arena safety', () => {
  const tg = new TelegraphEngine();
  const COLS = 15;

  // Test King Gummy Bear Royal Leap (2x2 landing = 4 tiles + 1-tile cross shockwave = 8 tiles)
  const leapTiles = [
    4 * COLS + 5,
    4 * COLS + 6,
    5 * COLS + 5,
    5 * COLS + 6,
    3 * COLS + 5,
    6 * COLS + 5,
    4 * COLS + 4,
    4 * COLS + 7,
  ];
  const reg = tg.registerAttack(1, leapTiles, 2000);
  assert.strictEqual(reg.success, true);

  // At 2000ms: Tier 1 (Yellow)
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.YELLOW, 'At 2.0s remaining, telegraph must be Tier 1 (Yellow)');
  assert.ok(tg.getSafeWalkableRatio() >= 0.4, 'Safe area must be >= 40%');

  // Advance 600ms (1400ms remaining): Tier 1 (Yellow)
  tg.update(600);
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.YELLOW);

  // Advance 500ms (900ms remaining): Tier 2 (Amber)
  tg.update(500);
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.AMBER, 'At 900ms remaining, telegraph must be Tier 2 (Amber)');
  assert.strictEqual(tg.isTrajectoryLocked(1), true, 'Trajectory locks at Amber stage (<= 1.0s)');

  // Advance 500ms (400ms remaining): Tier 3 (Flashing Red)
  tg.update(500);
  assert.strictEqual(tg.getTileTier(4, 5), TelegraphTier.RED_FLASH, 'At 400ms remaining, telegraph must be Tier 3 (Crimson)');
});

/* ==============================================================================
 * SUITE 4: KING GUMMY BEAR SPECIFIC MECHANICS
 * ============================================================================== */

test('Boss 1.4: King Gummy Bear — Royal Leap landing pancake stun (2.2s) and Masterplay Lure (4.0s)', () => {
  const gummy = new GummyBearBoss();
  gummy.update(1500); // Complete intro

  // Case 1: Standard landing without bomb
  gummy.initiateRoyalLeap(200, 200);
  const res1 = gummy.land(false);
  assert.strictEqual(res1, 'STANDARD_LANDING');
  assert.strictEqual(gummy.stunRemainingMs, 2200, 'Standard landing must grant 2.2s stun');

  // Recover from stun
  gummy.update(2200);
  assert.strictEqual(gummy.isStunned, false);

  // Case 2: Masterplay lure with bomb primed on landing tile
  gummy.initiateRoyalLeap(280, 280);
  const res2 = gummy.land(true);
  assert.strictEqual(res2, 'MASTERPLAY_LURE');
  assert.strictEqual(gummy.stunRemainingMs, 4000, 'Masterplay lure must double stun to 4.0s');
  assert.strictEqual(gummy.currentHp, 8, 'Masterplay lure must deal instant 1 damage');
});

/* ==============================================================================
 * SUITE 5: CAPTAIN NIBBLES SPECIFIC MECHANICS
 * ============================================================================== */

test('Boss 1.5: Captain Nibbles — Kinetic Dash momentum and Head-On Collision Dizzy Stun (3.0s)', () => {
  const hamster = new HamsterBoss();
  hamster.update(1500); // Complete intro

  hamster.startDash({ x: 1, y: 0 });
  assert.strictEqual(hamster.isDashing, true);

  const hit = hamster.collideWithBombHeadOn();
  assert.strictEqual(hit, true);
  assert.strictEqual(
    hamster.isDashing,
    false,
    'Dash must stop immediately upon head-on collision'
  );
  assert.strictEqual(
    hamster.stunRemainingMs,
    3000,
    'Head-on bomb collision must trigger 3.0s dizzy stun'
  );
  assert.strictEqual(hamster.currentHp, 9);
});

/* ==============================================================================
 * SUITE 6: QUEEN BEE CUPCAKE SPECIFIC MECHANICS
 * ============================================================================== */

test('Boss 1.6: Queen Bee Cupcake — Aerial flight immunity, flower shields, and dive-bomb crater stun', () => {
  const queen = new QueenBeeBoss();
  queen.update(1500); // Complete intro

  // 1. Floor bomb damage rejected while flying
  assert.strictEqual(
    queen.takeFloorBombDamage(),
    false,
    'Flying queen must be immune to ground bomb flames'
  );

  // 2. Pop 4 shields
  queen.popShield();
  queen.popShield();
  queen.popShield();
  assert.strictEqual(queen.isFlying, true);
  queen.popShield();
  assert.strictEqual(queen.shieldsRemaining, 0);
  assert.strictEqual(queen.isFlying, false, 'Popping all 4 shields must ground the boss');
  assert.strictEqual(queen.stunRemainingMs, 3000, 'Popping shields must grant 3.0s stun');

  // 3. Dodged dive-bomb
  queen.update(3000); // Recover from shield stun
  queen.isFlying = true;
  const diveRes = queen.executeDiveBomb(true);
  assert.strictEqual(diveRes, 'CRATER_STUN');
  assert.strictEqual(
    queen.stunRemainingMs,
    2500,
    'Dodged dive-bomb must lodge boss into floor for 2.5s stun'
  );
});

/* ==============================================================================
 * SUITE 7: BOSS HUD STATE SYNCHRONIZATION & EVENT BRIDGE
 * ============================================================================== */

test('Boss 1.7: BossHUD — Segmented HP calculations, enrage gauge, and threat alert event dispatch', () => {
  const fakeGame = { events: new EventEmitter() };
  const hud = new BossHUD(fakeGame);

  // Full HP (9/9) King Gummy Bear: 3 segments of 3 HP
  hud.initBoss('king_gummy_bear', 9);
  const s1 = hud.getState();
  assert.strictEqual(s1.activeSegmentIndex, 2); // 3rd segment active
  assert.strictEqual(s1.activeSegmentHp, 3);
  assert.strictEqual(s1.activeSegmentMaxHp, 3);

  // Damaged to 5/9: 2nd segment active (2/3)
  hud.setHp(5);
  const s2 = hud.getState();
  assert.strictEqual(s2.activeSegmentIndex, 1);
  assert.strictEqual(s2.activeSegmentHp, 2);
  assert.strictEqual(s2.activeSegmentMaxHp, 3);

  // Damaged to 1/9: 1st segment active (1/3)
  hud.setHp(1);
  const s3 = hud.getState();
  assert.strictEqual(s3.activeSegmentIndex, 0);
  assert.strictEqual(s3.activeSegmentHp, 1);

  // Event Bridge emitter test
  let receivedEvent = null;
  fakeGame.events.on('boss-hud-update', (payload) => {
    receivedEvent = payload;
  });

  hud.setHp(6);
  assert.ok(receivedEvent !== null);
  assert.strictEqual(receivedEvent.bossId, 'king_gummy_bear');
  assert.strictEqual(receivedEvent.currentHp, 6);
  assert.strictEqual(receivedEvent.phase, 1);
});

/* ==============================================================================
 * SUITE 8: ARCH-01 TELEGRAPH ENGINE IN-PLACE SWAP-AND-POP INTEGRITY
 * ============================================================================== */

test('Boss ARCH-01: TelegraphEngine in-place swap-and-pop maintains slot data integrity on cancelAttack', () => {
  const engine = new TelegraphEngine();

  // Register Attack 1 (3 tiles: 10, 11, 12)
  const ok1 = engine.registerAttack(1, [10, 11, 12], 2000);
  assert.strictEqual(ok1.success, true);
  assert.strictEqual(engine.activeCount, 3);

  // Register Attack 2 (2 tiles: 20, 21)
  const ok2 = engine.registerAttack(2, [20, 21], 3000);
  assert.strictEqual(ok2.success, true);
  assert.strictEqual(engine.activeCount, 5);

  // Cancel Attack 1 (swaps remaining Attack 2 slots into earlier indices)
  const removed = engine.cancelAttack(1);
  assert.strictEqual(removed, 3);
  assert.strictEqual(engine.activeCount, 2);

  // Verify remaining slots: should belong to Attack 2, tiles 20 and 21, with intact danger status
  assert.strictEqual(engine.isTileDangerous(20), true);
  assert.strictEqual(engine.isTileDangerous(21), true);

  // Cancel Attack 2
  const removed2 = engine.cancelAttack(2);
  assert.strictEqual(removed2, 2);
  assert.strictEqual(engine.activeCount, 0);
  assert.strictEqual(engine.isTileDangerous(20), false);
  assert.strictEqual(engine.isTileDangerous(21), false);
});

/* ==============================================================================
 * SUITE 9: ARCH-02 BASEBOSS STUN VULNERABILITY & DEATH ANIMATION COMPLETION
 * ============================================================================== */

test('Boss ARCH-02: BaseBoss allows damage during stun and delays dismissal until death animation completes', () => {
  const boss = new TestFsmBoss(6);
  boss.update(1500); // Complete intro -> PHASE_1

  // Manually apply stun
  boss.applyStun(3.0);
  assert.strictEqual(boss.isStunned, true);

  // ARCH-02: Blasts arriving while stunned must be accepted (tactical vulnerability window)
  const tookDamage = boss.takeBombDamage(2);
  assert.strictEqual(tookDamage, true, 'Stunned boss must take damage');
  assert.strictEqual(boss.currentHp, 4);

  // Deal lethal damage while still stunned
  boss.takeBombDamage(4);
  assert.strictEqual(boss.currentHp, 0);
  assert.strictEqual(boss.bossState, BossState.DEFEATED);

  // Boss should NOT be dismissible immediately; 1200ms death animation sequence must play out
  assert.strictEqual(boss.isDismissible, false, 'Boss must not be dismissed on frame 0 of defeat');
  assert.ok(boss.deathAnimationProgress < 1.0);

  // Advance 600ms (halfway through death animation)
  boss.update(600);
  assert.strictEqual(boss.isDismissible, false);
  assert.ok(boss.deathAnimationProgress >= 0.5);

  // Advance remaining 650ms to finish death animation
  boss.update(650);
  assert.strictEqual(boss.isDismissible, true, 'Boss must be dismissible after death duration');
  assert.strictEqual(boss.deathAnimationProgress, 1.0);
});

/* ==============================================================================
 * SUITE 10: ARCH-03 QUEEN BEE DIVE CADENCE & HAMSTER ARENA BOUNDS
 * ============================================================================== */

test('Boss ARCH-03: QueenBeeBoss periodic dive cadence triggers and HamsterBoss dashes stay within arena bounds', () => {
  // 1. QueenBee periodic dive cadence
  const queen = new QueenBeeBoss(300, 200);
  queen.update(1500); // Complete intro -> PHASE_1
  assert.strictEqual(queen.bossState, BossState.PHASE_1);
  assert.strictEqual(queen.isGrounded, false);

  // Advance through Queen Bee's automated dive cadence (5500ms)
  queen.update(5600);
  // Queen bee should have initiated dive or be in dive/crater state
  assert.ok(
    queen.targetDiveX > 0 || queen.isGrounded,
    'Queen bee flight loop must trigger automated dive cadence'
  );

  // 2. HamsterBoss arena boundaries clamp
  const hamster = new HamsterBoss(10, 10); // Spawning at out-of-bounds coords
  assert.ok(hamster.x >= hamster.minArenaX, 'Hamster X must clamp to minArenaX');
  assert.ok(hamster.y >= hamster.minArenaY, 'Hamster Y must clamp to minArenaY');

  // Trigger dash towards boundary and verify it stays bounded
  hamster.update(1500); // Complete intro
  hamster.isDashing = true;
  hamster.dashDirection = { x: -1, y: 0 };
  hamster.update(1000); // Dash into left wall
  assert.ok(hamster.x >= hamster.minArenaX, 'Dash must not breach left arena boundary');
});

/* ==============================================================================
 * SUITE 11: ARCH-04 BASECRISIS RESET CLEARS SUBCLASS STATE
 * ============================================================================== */

test('Boss ARCH-04: BaseCrisis reset() clears subclass-specific state cleanly', () => {
  const crisis = new OrbitalCrisis();
  crisis.init();

  // Simulate progress in subclass state
  crisis.salvosEvadedCount = 3;
  crisis.macrocannonCharge = 75;
  crisis.pendingCraters.push({ r: 3, c: 5, remainingMs: 1200 });

  // Reset crisis
  crisis.reset();

  assert.strictEqual(crisis.stage, CrisisStage.INACTIVE);
  assert.strictEqual(crisis.salvosEvadedCount, 0, 'Subclass salvosEvadedCount must reset');
  assert.strictEqual(crisis.macrocannonCharge, 0, 'Subclass macrocannonCharge must reset');
  assert.strictEqual(crisis.pendingCraters.length, 0, 'Subclass pendingCraters must reset');
  assert.strictEqual(crisis.objectives.length, 0, 'Objectives must be empty on reset');
});

/* ==============================================================================
 * SUITE 12: ARCH-02 MULTI-BOMB COMBO STUN & RECOVERY I-FRAME RE-ENGAGEMENT
 * ============================================================================== */

test('Boss ARCH-02: Multi-bomb combo triggers stun without i-frame overlap, and recovery re-engages i-frames', () => {
  const boss = new TestFsmBoss(10);
  boss.update(1500); // Intro -> PHASE_1

  // First bomb opens 150ms buffer window
  boss.takeBombDamage(1);
  assert.strictEqual(boss.comboHits, 1);
  assert.strictEqual(boss.isInvulnerable, true);

  // Second bomb within 150ms buffer window registers combo
  boss.takeBombDamage(1);
  assert.strictEqual(boss.comboHits, 2);
  assert.strictEqual(boss.currentHp, 8);

  // Buffer expires: resolveComboBuffer triggers stun (3.0s + 0.75s = 3.75s)
  boss.update(160);
  assert.strictEqual(boss.bossState, BossState.STUNNED);
  // ARCH-02: Stun is a vulnerability window, so post-combo i-frames must NOT be active!
  assert.strictEqual(boss.isInvulnerable, false, 'Boss must NOT have i-frames during tactical stun');
  assert.strictEqual(boss.iFrameTimerMs, 0);

  // Deliver 3rd bomb hit mid-stun: must be accepted without i-frame lockout
  const midStunHit = boss.takeBombDamage(1);
  assert.strictEqual(midStunHit, true, 'Mid-stun hit must be accepted');
  assert.strictEqual(boss.currentHp, 7);

  // Advance time through remaining stun (e.g. 3800ms)
  boss.update(3800);
  // Boss must recover from stun back into active combat
  assert.notStrictEqual(boss.bossState, BossState.STUNNED);
  // Boss MUST now have recovery i-frames engaged
  assert.strictEqual(boss.isInvulnerable, true, 'Recovery from stun must engage recovery i-frames');
  assert.ok(boss.iFrameTimerMs > 0, 'Recovery i-frame timer must be positive');
});

/* ==============================================================================
 * SUITE 13: ARCH-03 QUEEN BEE ALL GROUNDING MODES & HAMSTER CONTINUOUS CLAMP
 * ============================================================================== */

test('Boss ARCH-03: QueenBee all 3 grounding methods work and Hamster continuous clamp withstands extreme coordinates', () => {
  // 1. Queen Bee Grounding Mode 1: Corner Snipe
  const queen1 = new QueenBeeBoss(300, 200);
  queen1.update(1500); // Intro -> PHASE_1
  assert.strictEqual(queen1.isGrounded, false);
  assert.strictEqual(queen1.takeFloorBombDamage(1), false, 'Flying queen must be immune to floor bombs');
  queen1.snipeFromSky();
  assert.strictEqual(queen1.isGrounded, true);
  assert.strictEqual(queen1.bossState, BossState.STUNNED);
  assert.strictEqual(queen1.takeFloorBombDamage(1), true, 'Grounded stunned queen must take floor bomb damage');

  // 2. Queen Bee Grounding Mode 2: Shield Popping (4 shields)
  const queen2 = new QueenBeeBoss(300, 200);
  queen2.update(1500);
  queen2.activeShieldCount = 4;
  assert.strictEqual(queen2.popShield(), true);
  assert.strictEqual(queen2.popShield(), true);
  assert.strictEqual(queen2.popShield(), true);
  assert.strictEqual(queen2.isGrounded, false);
  assert.strictEqual(queen2.popShield(), true); // 4th shield breaks
  assert.strictEqual(queen2.isGrounded, true);
  assert.strictEqual(queen2.bossState, BossState.STUNNED);

  // 3. Queen Bee Grounding Mode 3: Royal Dive Crater Impact
  const queen3 = new QueenBeeBoss(300, 200);
  queen3.update(1500);
  queen3.initiateRoyalDive(200, 200);
  assert.strictEqual(queen3.isDiving, true);
  queen3.update(1300); // Complete dive timer (1200ms)
  assert.strictEqual(queen3.isDiving, false);
  assert.strictEqual(queen3.isGrounded, true);
  assert.strictEqual(queen3.bossState, BossState.STUNNED);

  // 4. Hamster Extreme Coordinate & Continuous Dash Clamp
  const extremeHamster = new HamsterBoss(-9999, 99999);
  assert.strictEqual(extremeHamster.x, extremeHamster.minArenaX);
  assert.strictEqual(extremeHamster.y, extremeHamster.maxArenaY);

  extremeHamster.update(1500);
  extremeHamster.isDashing = true;
  extremeHamster.dashSpeed = 1000; // Extreme speed test
  extremeHamster.dashDirection = { x: 1, y: 1 };
  for (let step = 0; step < 50; step++) {
    extremeHamster.update(50);
    assert.ok(extremeHamster.x >= extremeHamster.minArenaX && extremeHamster.x <= extremeHamster.maxArenaX);
    assert.ok(extremeHamster.y >= extremeHamster.minArenaY && extremeHamster.y <= extremeHamster.maxArenaY);
  }
});

/* ==============================================================================
 * SUITE 14: ARCH-04 BASECRISIS SUBCLASS STATE RESET ACROSS VOID, LAVA, CLOCKWORK
 * ============================================================================== */

test('Boss ARCH-04: BaseCrisis reset() purges subclass state across Void, Lava, and Clockwork crises', () => {
  // 1. VoidCrisis reset
  const voidCrisis = new VoidCrisis();
  voidCrisis.init();
  voidCrisis.voidCreepCount = 35;
  voidCrisis.avatarSpawned = true;
  voidCrisis.supernovaCleansed = true;
  voidCrisis.prisms[0].charge = 100;
  voidCrisis.prisms[0].isCharged = true;
  voidCrisis.reset();

  assert.strictEqual(voidCrisis.stage, CrisisStage.INACTIVE);
  assert.strictEqual(voidCrisis.voidCreepCount, 0, 'voidCreepCount must reset');
  assert.strictEqual(voidCrisis.avatarSpawned, false, 'avatarSpawned must reset');
  assert.strictEqual(voidCrisis.supernovaCleansed, false, 'supernovaCleansed must reset');
  assert.strictEqual(voidCrisis.prisms[0].isCharged, false, 'prisms must reset');
  assert.strictEqual(voidCrisis.objectives.length, 0);

  // 2. LavaCrisis reset
  const lavaCrisis = new LavaCrisis();
  lavaCrisis.init();
  lavaCrisis.lavaTilesCount = 15;
  lavaCrisis.obsidianSolidifiedCount = 4;
  lavaCrisis.currentLavaRing = 3;
  lavaCrisis.isCalderaSealed = true;
  lavaCrisis.reset();

  assert.strictEqual(lavaCrisis.stage, CrisisStage.INACTIVE);
  assert.strictEqual(lavaCrisis.lavaTilesCount, 0, 'lavaTilesCount must reset');
  assert.strictEqual(lavaCrisis.obsidianSolidifiedCount, 0, 'obsidianSolidifiedCount must reset');
  assert.strictEqual(lavaCrisis.currentLavaRing, 1, 'currentLavaRing must reset to 1');
  assert.strictEqual(lavaCrisis.isCalderaSealed, false, 'isCalderaSealed must reset to false');
  assert.strictEqual(lavaCrisis.objectives.length, 0);

  // 3. ClockworkCrisis reset
  const clockworkCrisis = new ClockworkCrisis();
  clockworkCrisis.init();
  clockworkCrisis.isOverloadWindowActive = true;
  clockworkCrisis.overloadWindowTimerMs = 4500;
  clockworkCrisis.reset();

  assert.strictEqual(clockworkCrisis.stage, CrisisStage.INACTIVE);
  assert.strictEqual(clockworkCrisis.isOverloadWindowActive, false, 'isOverloadWindowActive must reset');
  assert.strictEqual(clockworkCrisis.overloadWindowTimerMs, 0, 'overloadWindowTimerMs must reset');
  assert.strictEqual(clockworkCrisis.objectives.length, 0);
});

/* ==============================================================================
 * SUITE 15: SCALING ENGINE SOFT CAPS & NUMERICAL SANITIZATION DEFENSE
 * ============================================================================== */

test('ScalingEngine: Enforces HP soft caps and protects against NaN or corrupted inputs', () => {
  // 1. Enemy HP soft cap (baseHP + 5)
  assert.strictEqual(ScalingEngine.calculateEnemyHp(1, 1), 1);
  assert.strictEqual(ScalingEngine.calculateEnemyHp(5, 1), 2);
  assert.strictEqual(ScalingEngine.calculateEnemyHp(21, 1), 6);
  // High waves must not grow infinitely
  assert.strictEqual(ScalingEngine.calculateEnemyHp(50, 1), 6, 'Wave 50 enemy HP capped at 6');
  assert.strictEqual(ScalingEngine.calculateEnemyHp(100, 1), 6, 'Wave 100 enemy HP capped at 6');
  assert.strictEqual(ScalingEngine.calculateEnemyHp(1000, 1), 6, 'Wave 1000 enemy HP capped at 6');

  // 2. Boss HP soft cap (floor(baseBossHp * 2.5))
  assert.strictEqual(ScalingEngine.calculateBossHp(1, 10), 10);
  assert.strictEqual(ScalingEngine.calculateBossHp(5, 10), 16);
  assert.strictEqual(ScalingEngine.calculateBossHp(11, 10), 25);
  // Waves > 11 must be capped at 25 (10 * 2.5)
  assert.strictEqual(ScalingEngine.calculateBossHp(50, 10), 25, 'Wave 50 boss HP capped at 25');
  assert.strictEqual(ScalingEngine.calculateBossHp(100, 10), 25, 'Wave 100 boss HP capped at 25');
  assert.strictEqual(ScalingEngine.calculateBossHp(1000, 10), 25, 'Wave 1000 boss HP capped at 25');

  // 3. NaN & Malformed Input Safety Guards
  assert.strictEqual(ScalingEngine.calculateEnemySpeedMultiplier(NaN), 1.0);
  assert.strictEqual(ScalingEngine.calculateEnemyVelocity(NaN, NaN), 100);
  assert.strictEqual(ScalingEngine.calculateEnemyHp(NaN, NaN), 1);
  assert.strictEqual(ScalingEngine.calculateArmorChance(NaN), 0.0);
  assert.strictEqual(ScalingEngine.calculateActiveEnemyCount(NaN), 4);
  assert.strictEqual(ScalingEngine.calculateBombFuseMs(NaN), 2000);
  assert.strictEqual(ScalingEngine.calculateEnemyReactionMs(NaN), 600);
  assert.strictEqual(ScalingEngine.calculateScoreMultiplier(NaN, NaN), 1.0);
  assert.strictEqual(ScalingEngine.calculateBossHp(NaN, NaN), 10);
  assert.strictEqual(ScalingEngine.formatScore(NaN), '0');
  assert.strictEqual(ScalingEngine.formatScore(-500), '0');

  // Mutator generation with NaN seed or wave
  const mutators = ScalingEngine.generateWaveMutators(NaN, NaN);
  assert.ok(Array.isArray(mutators));
});

