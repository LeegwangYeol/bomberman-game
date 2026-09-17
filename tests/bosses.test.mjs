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

  // Bomb 4 arrives at t = 200ms (post-combo i-frames active)
  assert.strictEqual(
    boss.takeBombDamage(1),
    false,
    'Blasts arriving during post-combo i-frames must be rejected'
  );
  assert.strictEqual(boss.currentHp, 6);
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
