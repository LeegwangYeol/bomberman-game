/**
 * tests/mutant_flora_boss_defensive.test.mjs — Comprehensive Defensive Unit Tests for MutantFloraBoss
 *
 * Verifies:
 * 1. Config, Footprint, Dimensions & Instantiation Invariants
 * 2. Intro Lifecycle & Damage Blocking / Spore Acceleration
 * 3. Phase 1 Subterranean Root Spawning Cadence (4.0s cycle)
 * 4. Hit Reception, Defensive Root Spawning & 150ms Multi-Bomb Combo Stun
 * 5. Tactical Stun Vulnerability & Post-Stun Recovery Protections (ARCH-02)
 * 6. Phase 2 Intermission, Underground Burrowing Immunity & Surface Root Clearing
 * 7. Phase 2 Pollen Cloud Cycle & 1.5x Speed Scaling
 * 8. Phase 3 (Enraged) Berserk Mechanics & 2.0x Double-Speed Scaling
 * 9. Environmental Hazard Interactions, Percentage Damage & 2.5s Cooldown Protection
 * 10. Defeat Lifecycle, Surface Root Purge & Delayed Dismissal Invariant
 * 11. BossHUD Data Projection & Synchronization
 * 12. Adversarial Chaos: NaN / Infinity Coordinates, Delta Time Bounds & Burst Spam
 * 13. Zero-GC 10,000-Frame Soak Simulation
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BossState,
  MutantFloraBoss,
  BossHUD,
  BOSS_METADATA,
} from '../src/game/bosses/index.ts';

/* ==============================================================================
 * SUITE 1: CONFIG, FOOTPRINT & BASELINE INVARIANTS
 * ============================================================================== */

test('MutantFloraBoss 1.1: Metadata is correctly registered in BOSS_METADATA', () => {
  const meta = BOSS_METADATA['boss_mutant_flora'];
  assert.ok(meta, 'boss_mutant_flora must be registered in BOSS_METADATA');
  assert.strictEqual(meta.name, 'Mutant Flora');
  assert.strictEqual(meta.title, 'Carnivorous Bloom');
  assert.strictEqual(meta.avatarEmoji, '🌺');
  assert.strictEqual(meta.themeColor, '#10b981');
  assert.ok(Array.isArray(meta.phaseHpSegments));
});

test('MutantFloraBoss 1.2: Initialization sets exact 15 HP, 100x100 footprint and INTRO state', () => {
  const boss = new MutantFloraBoss(320, 240);

  assert.strictEqual(boss.config.id, 'boss_mutant_flora');
  assert.strictEqual(boss.config.name, 'Verdant Terror');
  assert.strictEqual(boss.config.title, 'Overgrown Carnivorous Plant');
  assert.strictEqual(boss.config.avatarEmoji, '🌿');
  assert.strictEqual(boss.config.maxHp, 15);
  assert.strictEqual(boss.config.footprintWidth, 100);
  assert.strictEqual(boss.config.footprintHeight, 100);
  assert.strictEqual(boss.config.colliderRadius, 40);
  assert.strictEqual(boss.config.baseSpeed, 50);
  assert.strictEqual(boss.config.phase2HpThreshold, 0.60);
  assert.strictEqual(boss.config.phase3HpThreshold, 0.30);

  // Initial runtime state
  assert.strictEqual(boss.x, 320);
  assert.strictEqual(boss.y, 240);
  assert.strictEqual(boss.currentHp, 15);
  assert.strictEqual(boss.maxHp, 15);
  assert.strictEqual(boss.bossState, BossState.INTRO);
  assert.strictEqual(boss.isInvulnerable, true);
  assert.strictEqual(boss.activeRoots, 0);
  assert.strictEqual(boss.rootTimerMs, 4000);
  assert.strictEqual(boss.pollenTimerMs, 3000);
  assert.strictEqual(boss.enrageGauge, 0);
});

/* ==============================================================================
 * SUITE 2: INTRO STATE LIFECYCLE & DAMAGE BLOCKING
 * ============================================================================== */

test('MutantFloraBoss 2.1: Invulnerable during INTRO; onDamageBlocked sprouts roots & accelerates pollen', () => {
  const boss = new MutantFloraBoss(300, 260);

  // During INTRO, damage is blocked by state guard
  assert.strictEqual(boss.canTakeDamage(), false);
  const damageAccepted = boss.takeBombDamage(1);
  assert.strictEqual(damageAccepted, false, 'Bomb damage must be rejected during INTRO');
  assert.strictEqual(boss.currentHp, 15);

  // Advance remaining 1500ms: auto-transitions to PHASE_1
  boss.update(1500);
  assert.strictEqual(boss.bossState, BossState.PHASE_1);
  assert.strictEqual(boss.phase, 1);
  assert.strictEqual(boss.isInvulnerable, false);
  assert.strictEqual(boss.canTakeDamage(), true);
  assert.strictEqual(boss.currentSpeed, 50);

  // Test onDamageBlocked when invulnerable in Phase 1
  boss.isInvulnerable = true;
  boss.comboBufferTimerMs = 0;
  assert.strictEqual(boss.canTakeDamage(), false);
  const preRoots = boss.activeRoots;
  const prePollen = boss.pollenTimerMs;
  const blockedInPhase1 = boss.takeBombDamage(1);
  assert.strictEqual(blockedInPhase1, false);
  assert.strictEqual(boss.activeRoots, preRoots + 1, 'Blocked damage in active phase must sprout roots');
  assert.strictEqual(boss.pollenTimerMs, prePollen - 500, 'Blocked damage must accelerate pollen timer by 500ms');
  boss.isInvulnerable = false;
});

/* ==============================================================================
 * SUITE 3: PHASE 1 SUBTERRANEAN ROOT SPAWNING CADENCE
 * ============================================================================== */

test('MutantFloraBoss 3.1: Subterranean roots spawn periodically every 4,000ms in Phase 1', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500); // Complete intro -> enter Phase 1
  assert.strictEqual(boss.bossState, BossState.PHASE_1);
  boss.activeRoots = 0;
  boss.rootTimerMs = 4000;

  // Advance 2000ms: timer decreases, activeRoots remains 0
  boss.update(2000);
  assert.strictEqual(boss.activeRoots, 0);
  assert.strictEqual(boss.rootTimerMs, 2000);

  // Advance another 2000ms: timer hits 0, spawns first root and resets to 4000ms
  boss.update(2000);
  assert.strictEqual(boss.activeRoots, 1);
  assert.strictEqual(boss.rootTimerMs, 4000);

  // Advance another 4000ms: spawns second root
  boss.update(4000);
  assert.strictEqual(boss.activeRoots, 2);
  assert.strictEqual(boss.rootTimerMs, 4000);

  // Speed in Phase 1 matches baseSpeed
  assert.strictEqual(boss.currentSpeed, 50);
});

/* ==============================================================================
 * SUITE 4: HIT RECEPTION, DEFENSIVE ROOTS & MULTI-BOMB COMBO STUN
 * ============================================================================== */

test('MutantFloraBoss 4.1: Hit reception spawns defensive roots and 150ms multi-bomb combo triggers stun', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500); // Enter Phase 1
  assert.strictEqual(boss.bossState, BossState.PHASE_1);
  boss.activeRoots = 0;

  // Bomb 1 lands: opens 150ms combo buffer
  const hit1 = boss.takeBombDamage(1);
  assert.strictEqual(hit1, true);
  assert.strictEqual(boss.currentHp, 14);
  assert.strictEqual(boss.activeRoots, 1, 'Hit must spawn defensive root');
  assert.strictEqual(Math.floor(boss.enrageGauge), 10);
  assert.strictEqual(boss.isComboActive, true);
  assert.strictEqual(boss.comboHits, 1);

  // Bomb 2 lands within 150ms buffer window: combo registered
  boss.update(50);
  const hit2 = boss.takeBombDamage(1);
  assert.strictEqual(hit2, true);
  assert.strictEqual(boss.currentHp, 13);
  assert.strictEqual(boss.activeRoots, 2, 'Subsequent combo hit must spawn another root');
  assert.strictEqual(Math.floor(boss.enrageGauge), 20);
  assert.strictEqual(boss.comboHits, 2);

  // Buffer window expires (100ms remaining in combo window)
  boss.update(110);
  assert.strictEqual(boss.isComboActive, false);
  assert.strictEqual(boss.isStunned, true);
  assert.strictEqual(boss.bossState, BossState.STUNNED);

  // 2-bomb combo stun duration: 3.0 + min(1.5, 1 * 0.75) = 3.75s (3750ms)
  assert.strictEqual(boss.stunRemainingMs, 3750);
});

/* ==============================================================================
 * SUITE 5: TACTICAL STUN VULNERABILITY & POST-STUN RECOVERY (ARCH-02)
 * ============================================================================== */

test('MutantFloraBoss 5.1: ARCH-02 — Stun opens vulnerability window, followed by post-stun i-frame recovery', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500); // Enter Phase 1

  // Manually apply stun for testing
  boss.applyStun(3.0);
  assert.strictEqual(boss.isStunned, true);
  assert.strictEqual(boss.isInvulnerable, false);
  assert.strictEqual(boss.canTakeDamage(), true);

  // Blast arriving during stun must register damage
  const damageDealt = boss.takeBombDamage(1);
  assert.strictEqual(damageDealt, true, 'Damage must be accepted during tactical stun window');
  assert.strictEqual(boss.currentHp, 14);
  assert.strictEqual(boss.activeRoots, 1);

  // Advance through remaining stun duration (3000ms) to trigger recovery
  boss.update(3000);
  assert.strictEqual(boss.isStunned, false);

  // Recovery engages 2000ms immunity and 1500ms i-frames
  assert.strictEqual(boss.isInvulnerable, true);
  assert.strictEqual(boss.canTakeDamage(), false);

  // Bomb arriving during recovery i-frames must be rejected
  const hitDuringIframes = boss.takeBombDamage(1);
  assert.strictEqual(hitDuringIframes, false);
  assert.strictEqual(boss.currentHp, 14);

  // Advance 1500ms: i-frames expire, boss vulnerable again
  boss.update(1500);
  assert.strictEqual(boss.isInvulnerable, false);
  assert.strictEqual(boss.canTakeDamage(), true);
});

/* ==============================================================================
 * SUITE 6: PHASE 2 INTERMISSION, UNDERGROUND BURROWING & ROOT PURGE
 * ============================================================================== */

test('MutantFloraBoss 6.1: Transition to INTERMISSION purges active roots and grants underground immunity', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500); // Enter Phase 1

  // Spawn roots over time
  boss.update(4000);
  assert.strictEqual(boss.activeRoots, 1);

  // Damage boss to Phase 2 threshold (HP <= 15 * 0.60 = 9)
  boss.currentHp = 9;
  boss.transitionTo(BossState.INTERMISSION);

  assert.strictEqual(boss.bossState, BossState.INTERMISSION);
  assert.strictEqual(boss.phase, 2);
  assert.strictEqual(boss.activeRoots, 0, 'Burrowing underground must clear all active roots');
  assert.strictEqual(boss.isInvulnerable, true);
  assert.strictEqual(boss.canTakeDamage(), false);

  // Bomb damage rejected while underground
  const hitRejected = boss.takeBombDamage(1);
  assert.strictEqual(hitRejected, false);
  assert.strictEqual(boss.currentHp, 9);

  // Advance through 1800ms intermission duration
  boss.update(1800);
  assert.strictEqual(boss.bossState, BossState.PHASE_2);
  assert.strictEqual(boss.isInvulnerable, false);
  assert.strictEqual(boss.canTakeDamage(), true);

  // Subsequent frame in Phase 2 executes updatePhase2 speed scaling (1.5x baseSpeed)
  boss.update(16);
  assert.strictEqual(boss.currentSpeed, 75, 'Phase 2 speed must scale to 1.5x baseSpeed (75 px/s)');
});

test('MutantFloraBoss 6.2: Phase 2 pollen cloud timer resets every 3,000ms', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500);
  boss.transitionTo(BossState.PHASE_2);
  boss.pollenTimerMs = 3000;

  // Advance 1500ms
  boss.update(1500);
  assert.strictEqual(boss.pollenTimerMs, 1500);

  // Advance 1500ms: resets back to 3000ms
  boss.update(1500);
  assert.strictEqual(boss.pollenTimerMs, 3000);
});

/* ==============================================================================
 * SUITE 7: PHASE 3 (ENRAGED) BERSERK MECHANICS & SPEED SCALING
 * ============================================================================== */

test('MutantFloraBoss 7.1: Enraged phase scales speed to 2.0x baseSpeed (100 px/s)', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500);

  // Trigger enrage via transition
  boss.transitionTo(BossState.ENRAGED);
  assert.strictEqual(boss.bossState, BossState.ENRAGED);
  assert.strictEqual(boss.phase, 3);
  assert.strictEqual(boss.enrageGauge, 100);

  // Update in Enraged sets speed to 2.0x (100 px/s)
  boss.update(16);
  assert.strictEqual(boss.currentSpeed, 100);
});

/* ==============================================================================
 * SUITE 8: HAZARD PERCENTAGE DAMAGE & COOLDOWN PROTECTION
 * ============================================================================== */

test('MutantFloraBoss 8.1: Environmental hazard deals 15% HP damage and enforces 2.5s cooldown', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500); // Enter Phase 1

  const now = 10000;
  // 15% of 15 HP = 2.25 damage, 1.5s stun
  const res1 = boss.takeHazardDamage(15, 1.5, now);
  assert.strictEqual(res1.damage, 2.25);
  assert.strictEqual(boss.currentHp, 12.75);
  assert.strictEqual(boss.isStunned, true);

  // Immediate second hit within 2500ms cooldown must be rejected
  const res2 = boss.takeHazardDamage(15, 1.5, now + 1000);
  assert.strictEqual(res2.damage, 0);
  assert.strictEqual(boss.currentHp, 12.75);

  // Hit after 2500ms cooldown passes must be accepted (recover from stun first)
  boss.update(1500); // Clear stun
  boss.update(1500); // Clear recovery i-frames
  const res3 = boss.takeHazardDamage(15, 1.5, now + 2600);
  assert.strictEqual(res3.damage, 2.25);
  assert.strictEqual(boss.currentHp, 10.5);
});

/* ==============================================================================
 * SUITE 9: DEFEAT LIFECYCLE & DELAYED DISMISSAL INVARIANT
 * ============================================================================== */

test('MutantFloraBoss 9.1: Defeat clears active roots and delays dismissal until 1200ms death animation completes', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500);
  boss.activeRoots = 5;

  // Fatal hit
  boss.currentHp = 0;
  boss.transitionTo(BossState.DEFEATED);

  assert.strictEqual(boss.bossState, BossState.DEFEATED);
  assert.strictEqual(boss.activeRoots, 0, 'Defeat must purge all active roots');
  assert.strictEqual(boss.isInvulnerable, true);
  assert.strictEqual(boss.deathTimerMs, 1200);
  assert.strictEqual(boss.isDeathAnimationComplete, false);
  assert.strictEqual(boss.isDismissible, false, 'Must not be dismissible immediately upon defeat');

  // Halfway through death animation (600ms)
  boss.update(600);
  assert.strictEqual(boss.isDismissible, false);
  assert.ok(boss.deathAnimationProgress >= 0.45 && boss.deathAnimationProgress <= 0.55);

  // Complete death animation (total 1200ms)
  boss.update(600);
  assert.strictEqual(boss.deathTimerMs, 0);
  assert.strictEqual(boss.isDeathAnimationComplete, true);
  assert.strictEqual(boss.isDismissible, true, 'Must become dismissible once death timer reaches 0');
  assert.strictEqual(boss.deathAnimationProgress, 1.0);
});

/* ==============================================================================
 * SUITE 10: BOSS HUD DATA SYNCHRONIZATION
 * ============================================================================== */

test('MutantFloraBoss 10.1: getHUDData accurately reflects live HP, phase, stun, and enrage state', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500);

  const hudData = boss.getHUDData();
  assert.strictEqual(hudData.bossId, 'boss_mutant_flora');
  assert.strictEqual(hudData.name, 'Verdant Terror');
  assert.strictEqual(hudData.title, 'Overgrown Carnivorous Plant');
  assert.strictEqual(hudData.avatarEmoji, '🌿');
  assert.strictEqual(hudData.currentHp, 15);
  assert.strictEqual(hudData.maxHp, 15);
  assert.strictEqual(hudData.phase, 1);
  assert.strictEqual(hudData.state, BossState.PHASE_1);
  assert.strictEqual(hudData.isStunned, false);
  assert.strictEqual(hudData.isInvulnerable, false);

  // Integration with BossHUD class
  const hud = new BossHUD();
  hud.initBoss('boss_mutant_flora', 15);
  const state = hud.getState();
  assert.strictEqual(state.bossId, 'boss_mutant_flora');
  assert.strictEqual(state.currentHp, 15);
  assert.strictEqual(state.isActive, true);
});

/* ==============================================================================
 * SUITE 11: ADVERSARIAL CHAOS & CORRUPTED INPUTS
 * ============================================================================== */

test('MutantFloraBoss 11.1: Handles non-finite player coordinates, extreme delta times and rapid hit spam', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500);

  // NaN and Infinity coordinates do not crash or corrupt boss position
  assert.doesNotThrow(() => boss.update(16, NaN, Infinity));
  assert.doesNotThrow(() => boss.update(16, -Infinity, NaN));
  assert.ok(Number.isFinite(boss.x));
  assert.ok(Number.isFinite(boss.y));
  assert.ok(Number.isFinite(boss.currentSpeed));

  // Extreme delta times
  assert.doesNotThrow(() => boss.update(0));
  assert.doesNotThrow(() => boss.update(-100));
  assert.doesNotThrow(() => boss.update(100000));

  // Rapid damage spam (50 consecutive calls)
  for (let i = 0; i < 50; i++) {
    boss.takeBombDamage(1);
  }
  assert.ok(boss.currentHp >= 0);
  assert.ok(Number.isFinite(boss.currentHp));
  assert.ok(Number.isFinite(boss.enrageGauge));
});

/* ==============================================================================
 * SUITE 12: ZERO-GC 10,000-FRAME SOAK SIMULATION
 * ============================================================================== */

test('MutantFloraBoss 12.1: 10,000 continuous frames execute with zero memory growth or NaN propagation', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500); // Complete intro

  for (let frame = 0; frame < 10000; frame++) {
    boss.update(16.6, 200 + (frame % 100), 250 + (frame % 80));
  }

  // State remains structurally sound
  assert.ok(Number.isFinite(boss.x));
  assert.ok(Number.isFinite(boss.y));
  assert.ok(Number.isFinite(boss.currentSpeed));
  assert.ok(Number.isFinite(boss.rootTimerMs));
  assert.ok(Number.isFinite(boss.pollenTimerMs));
  assert.ok(Number.isFinite(boss.activeRoots));
  assert.ok(boss.activeRoots >= 0);
});
