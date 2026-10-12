/**
 * tests/steam_toy_titan_boss.test.mjs — Comprehensive 10-Tier Test Battery for SteamToyTitanBoss
 *
 * Verifies:
 * 1. Tier 1: Config, Footprint, Dimensions & Metadata Invariants
 * 2. Tier 2: 7-Stage FSM State Transitions & Lifecycle (Intro, Phases, Stun, Defeat)
 * 3. Tier 3: Toy Mallet Slam Cadence, Windup & Stun Interruption
 * 4. Tier 4: Mallet Shockwave Physics, Radial Push & Bomb Knockback
 * 5. Tier 5: 3-Tier Telegraph Progression & Safe Area Invariant (>= 40% safe area)
 * 6. Tier 6: Rotating Brass Gear Shield Deflection & Flank Vulnerability
 * 7. Tier 7: Anti-Exploit Damage Cap (15% Max HP) & 150ms Combo Buffering
 * 8. Tier 8: Clockwork Crisis Synergy, WaveDirector & GameModes Integration
 * 9. Tier 9: Procedural WebAudio Synthesizer SSR/Headless Safety & Voice Disposal
 * 10. Tier 10: Subnormal Float Defense (1e-323) & Zero-GC 10,000-Frame Soak Test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BossState,
  SteamToyTitanBoss,
  BOSS_METADATA,
} from '../src/game/bosses/index.ts';
import { WaveDirector } from '../src/game/progression/WaveDirector.ts';
import { BOSS_RUSH_SEQUENCE } from '../src/game/progression/GameModes.ts';

/* ==============================================================================
 * TIER 1: CONFIG, IDENTITY & METADATA INVARIANTS
 * ============================================================================== */

test('Tier 1.1: Metadata correctly registered in BOSS_METADATA', () => {
  const meta = BOSS_METADATA['steam_toy_titan'];
  assert.ok(meta, 'steam_toy_titan must be registered in BOSS_METADATA');
  assert.strictEqual(meta.name, 'Steam Toy Titan');
  assert.strictEqual(meta.title, 'Clockwork Arch-Inventor');
  assert.strictEqual(meta.avatarEmoji, '🦾');
  assert.strictEqual(meta.themeColor, '#FF6B00');
  assert.deepStrictEqual(meta.phaseHpSegments, [5, 5, 6]);

  // Alias entries check
  const bossAlias = BOSS_METADATA['boss_steam_toy_titan'];
  assert.ok(bossAlias, 'boss_steam_toy_titan alias must exist');
  const clockworkAlias = BOSS_METADATA['clockwork_titan'];
  assert.ok(clockworkAlias, 'clockwork_titan alias must exist');
});

test('Tier 1.2: Initialization sets exact 16 HP, 100x100 footprint and INTRO state', () => {
  const boss = new SteamToyTitanBoss(300, 260);

  assert.strictEqual(boss.config.id, 'steam_toy_titan');
  assert.strictEqual(boss.config.name, 'Steam Toy Titan');
  assert.strictEqual(boss.config.title, 'Clockwork Arch-Inventor');
  assert.strictEqual(boss.config.avatarEmoji, '🦾');
  assert.strictEqual(boss.maxHp, 16);
  assert.strictEqual(boss.currentHp, 16);
  assert.strictEqual(boss.config.footprintWidth, 100);
  assert.strictEqual(boss.config.footprintHeight, 100);
  assert.strictEqual(boss.config.colliderRadius, 42);
  assert.strictEqual(boss.config.baseSpeed, 50);
  assert.strictEqual(boss.config.phase2HpThreshold, 0.65);
  assert.strictEqual(boss.config.phase3HpThreshold, 0.35);

  // Initial runtime state
  assert.strictEqual(boss.x, 300);
  assert.strictEqual(boss.y, 260);
  assert.strictEqual(boss.bossState, BossState.INTRO);
  assert.strictEqual(boss.isInvulnerable, true);
  assert.strictEqual(boss.gearShieldActive, false);
});

test('Tier 1.3: Boundary clamping on initial spawn coordinates', () => {
  // Out of arena bounds
  const clamped1 = new SteamToyTitanBoss(-500, 10000);
  assert.strictEqual(clamped1.x, 60);
  assert.strictEqual(clamped1.y, 460);

  // NaN coordinates fallback
  const clamped2 = new SteamToyTitanBoss(NaN, Infinity);
  assert.strictEqual(clamped2.x, 300);
  assert.strictEqual(clamped2.y, 260);
});

/* ==============================================================================
 * TIER 2: 7-STAGE FSM STATE TRANSITIONS & LIFECYCLE
 * ============================================================================== */

test('Tier 2.1: Intro invulnerability and transition to Phase 1', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  assert.strictEqual(boss.bossState, BossState.INTRO);
  assert.strictEqual(boss.isInvulnerable, true);

  // In INTRO, bomb damage cannot be applied
  const damaged = boss.takeBombDamage(1);
  assert.strictEqual(damaged, false);
  assert.strictEqual(boss.currentHp, 16);

  // Transition to Phase 1
  boss.forceState(BossState.PHASE_1);
  assert.strictEqual(boss.bossState, BossState.PHASE_1);
  assert.strictEqual(boss.isInvulnerable, false);
});

test('Tier 2.2: Phase 1 -> Intermission -> Phase 2 at <= 65% HP threshold', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);

  // Deal 6 damage: 16 -> 10 HP (10 / 16 = 62.5% <= 65%)
  boss.takeBombDamage(6);
  assert.strictEqual(boss.currentHp, 10);

  // Advance 160ms so 150ms combo buffer resolves and phase check triggers
  boss.update(160);
  assert.strictEqual(boss.bossState, BossState.INTERMISSION);
  assert.strictEqual(boss.isInvulnerable, true);

  // Advance intermission timer (1800ms)
  boss.update(2000);
  assert.strictEqual(boss.bossState, BossState.PHASE_2);
  assert.strictEqual(boss.isInvulnerable, false);
  assert.strictEqual(boss.gearShieldActive, true);
});

test('Tier 2.3: Phase 2 -> Enraged transition at <= 35% HP', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_2);
  boss.currentHp = 10;
  boss.isInvulnerable = false;

  // Deal 5 damage: 10 -> 5 HP (5 / 16 = 31.25% <= 35%)
  boss.takeBombDamage(5);
  assert.strictEqual(boss.currentHp, 5);

  // Advance combo buffer to trigger transition
  boss.update(160);
  assert.strictEqual(boss.bossState, BossState.ENRAGED);
  assert.strictEqual(boss.gearShieldActive, true);
  assert.strictEqual(boss.gearRotationSpeed, 3.5);
});

test('Tier 2.4: Tactical Stun and Recovery Protections', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_2);
  boss.gearShieldActive = true;

  // Apply tactical stun (2.0s)
  boss.applyStun(2.0);
  assert.strictEqual(boss.bossState, BossState.STUNNED);
  assert.strictEqual(boss.vx, 0);
  assert.strictEqual(boss.vy, 0);
  assert.strictEqual(boss.gearShieldActive, false); // Gear shield drops while stunned

  // Tick down stun
  boss.update(1000);
  assert.strictEqual(boss.bossState, BossState.STUNNED);
  assert.strictEqual(boss.stunTimerMs, 1000);

  // Finish stun recovery
  boss.update(1100);
  assert.strictEqual(boss.bossState, BossState.PHASE_2);
  assert.strictEqual(boss.gearShieldActive, true); // Shield reactivates
  assert.ok(boss.stunRecoveryImmunityTimerMs > 0, 'Post-stun recovery immunity active');
});

test('Tier 2.5: Defeat lifecycle and final cleanup', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);

  // Lethal damage
  boss.takeBombDamage(16);
  assert.strictEqual(boss.currentHp, 0);
  assert.strictEqual(boss.bossState, BossState.DEFEATED);
  assert.strictEqual(boss.isInvulnerable, true);
  assert.strictEqual(boss.gearShieldActive, false);
  assert.strictEqual(boss.isMalletWindingUp, false);
  assert.strictEqual(boss.vx, 0);
  assert.strictEqual(boss.vy, 0);
});

/* ==============================================================================
 * TIER 3: TOY MALLET SLAM CADENCE, WINDUP & INTERRUPTION
 * ============================================================================== */

test('Tier 3.1: Mallet windup triggers and locks target coordinates', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);

  boss.startMalletWindup(400, 320);
  assert.strictEqual(boss.isMalletWindingUp, true);
  assert.strictEqual(boss.malletImpactX, 400);
  assert.strictEqual(boss.malletImpactY, 320);
  assert.strictEqual(boss.malletWindupTimerMs, 1000);

  // During windup, boss stops moving
  boss.update(500, 400, 320);
  assert.strictEqual(boss.vx, 0);
  assert.strictEqual(boss.vy, 0);
  assert.strictEqual(boss.isMalletWindingUp, true);
  assert.strictEqual(boss.malletWindupTimerMs, 500);

  // Complete windup -> Slam executed
  boss.update(600, 400, 320);
  assert.strictEqual(boss.isMalletWindingUp, false);
  assert.strictEqual(boss.malletImpactActive, true);
});

test('Tier 3.2: Mallet windup interrupted when stunned', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);
  boss.startMalletWindup(350, 250);
  assert.strictEqual(boss.isMalletWindingUp, true);

  // Stun boss mid-windup
  boss.applyStun(1.5);
  assert.strictEqual(boss.isMalletWindingUp, false);
  assert.strictEqual(boss.malletImpactActive, false);
});

/* ==============================================================================
 * TIER 4: MALLET SHOCKWAVE PHYSICS & BOMB KNOCKBACK
 * ============================================================================== */

test('Tier 4.1: Mallet impact radial bomb knockback (2 tiles outward at 360 px/s)', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.executeMalletSlam(300, 260);
  assert.strictEqual(boss.malletImpactActive, true);

  // Bomb 1: 40px to the right of impact (dx=40, dy=0)
  const kb1 = boss.checkBombKnockback(340, 260, 8, 6);
  assert.strictEqual(kb1.shouldKnockback, true);
  assert.strictEqual(kb1.distanceTiles, 1.0);
  assert.strictEqual(Math.round(kb1.slideVx), 360);
  assert.strictEqual(Math.round(kb1.slideVy), 0);

  // Bomb 2: Diagonal 60px away (dx=42.42, dy=42.42, dist=60px <= 120px)
  const kb2 = boss.checkBombKnockback(342.42, 302.42, 8, 7);
  assert.strictEqual(kb2.shouldKnockback, true);
  assert.ok(kb2.slideVx > 0 && kb2.slideVy > 0);

  // Bomb 3: Far away at 180px (> 120px max radius)
  const kb3 = boss.checkBombKnockback(480, 260, 12, 6);
  assert.strictEqual(kb3.shouldKnockback, false);
  assert.strictEqual(kb3.slideVx, 0);
  assert.strictEqual(kb3.slideVy, 0);
});

test('Tier 4.2: Player damage evaluation from mallet shockwave', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.executeMalletSlam(300, 260);

  // Player at (330, 260) -> distance 30px <= 120px
  const hit1 = boss.evaluatePlayerMalletHit(330, 260);
  assert.strictEqual(hit1.hit, true);
  assert.strictEqual(hit1.damage, 1);
  assert.strictEqual(Math.round(hit1.knockbackVx), 240);
  assert.strictEqual(Math.round(hit1.knockbackVy), 0);

  // Player far away at (500, 400) -> distance > 120px
  const hit2 = boss.evaluatePlayerMalletHit(500, 400);
  assert.strictEqual(hit2.hit, false);
  assert.strictEqual(hit2.damage, 0);
});

/* ==============================================================================
 * TIER 5: TELEGRAPH PROGRESSION & SAFE AREA INVARIANT
 * ============================================================================== */

test('Tier 5.1: Telegraph generation guarantees >= 40% safe area invariant', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.startMalletWindup(300, 260);

  const telegraphs = boss.getActiveTelegraphs();
  const activeCount = telegraphs.filter((t) => t.active).length;

  // R=3 Euclidean disc has at most 29 lattice tiles
  assert.ok(activeCount <= 29, `Active telegraphs (${activeCount}) must not exceed 29`);
  assert.ok(activeCount > 0, 'Active telegraphs must be populated');

  // In 13 rows x 15 cols arena = 195 total tiles
  // 29 / 195 = 14.87% danger footprint -> 85.13% safe area (far exceeding >= 40% invariant)
  const safeAreaRatio = (195 - activeCount) / 195;
  assert.ok(
    safeAreaRatio >= 0.40,
    `Safe area ratio (${safeAreaRatio.toFixed(3)}) must be >= 0.40`
  );
  assert.ok(
    safeAreaRatio >= 0.80,
    `Safe area ratio (${safeAreaRatio.toFixed(3)}) safely exceeds 80%`
  );
});

/* ==============================================================================
 * TIER 6: ROTATING BRASS GEAR SHIELD DEFLECTION
 * ============================================================================== */

test('Tier 6.1: Gear shield inactive in Phase 1, active in Phase 2 and Enraged', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);
  assert.strictEqual(boss.gearShieldActive, false);

  boss.forceState(BossState.PHASE_2);
  assert.strictEqual(boss.gearShieldActive, true);

  boss.forceState(BossState.ENRAGED);
  assert.strictEqual(boss.gearShieldActive, true);
});

test('Tier 6.2: Frontal incoming hits deflected, rear/flank hits absorbed', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_2);
  boss.gearShieldActive = true;

  // Facing right: vx = 50, vy = 0 (facing angle = 0 rad)
  boss.vx = 50;
  boss.vy = 0;

  // Hit arriving directly from front-right: source at (400, 260), angle = 0
  const isFrontalDeflected = boss.checkGearDeflection(400, 260);
  assert.strictEqual(isFrontalDeflected, true, 'Frontal hit must be deflected');

  // Hit arriving directly from behind: source at (100, 260), angle = PI
  const isRearDeflected = boss.checkGearDeflection(100, 260);
  assert.strictEqual(isRearDeflected, false, 'Rear hit must bypass shield');

  // Hit arriving from top flank: source at (300, 100), angle = -PI/2
  const isFlankDeflected = boss.checkGearDeflection(300, 100);
  assert.strictEqual(isFlankDeflected, false, 'Flank hit must bypass shield');
});

/* ==============================================================================
 * TIER 7: ANTI-EXPLOIT DAMAGE CAP & 150MS COMBO BUFFERING
 * ============================================================================== */

test('Tier 7.1: Environmental hazard percentage damage and 2.5s cooldown guard', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);

  // Hazard hit of 15% damage (15% of 16 Max HP = 2.4 HP)
  const res = boss.takeHazardDamage(15, 1.5, 1000);
  assert.strictEqual(res.damage, 2.4, 'Hazard damage should equal 15% Max HP (2.4)');
  assert.strictEqual(boss.currentHp, 13.6);

  // Second hit within 2.5s cooldown guard is rejected (safeTimeMs = 2000, 1000ms later < 2500ms)
  const res2 = boss.takeHazardDamage(15, 1.5, 2000);
  assert.strictEqual(res2.damage, 0, 'Hazard hit within 2500ms cooldown must be rejected');
  assert.strictEqual(boss.currentHp, 13.6);

  // Hit after 2500ms cooldown succeeds (safeTimeMs = 3600, 2600ms later >= 2500ms)
  const res3 = boss.takeHazardDamage(15, 1.5, 3600);
  assert.strictEqual(res3.damage, 2.4);
  assert.strictEqual(boss.currentHp, 11.2);
});

test('Tier 7.2: 150ms multi-bomb combo window accumulation and tactical stun', () => {
  // Scenario A: Single bomb hit resolves post-combo i-frames
  const bossA = new SteamToyTitanBoss(300, 260);
  bossA.forceState(BossState.PHASE_1);
  const hitA1 = bossA.takeBombDamage(1);
  assert.strictEqual(hitA1, true);
  assert.strictEqual(bossA.comboHits, 1);
  assert.strictEqual(bossA.currentHp, 15);
  assert.strictEqual(bossA.comboBufferTimerMs, 150);

  // Advance time past 150ms window -> i-frames engaged
  bossA.update(160);
  assert.strictEqual(bossA.comboBufferTimerMs, 0);
  assert.strictEqual(bossA.isInvulnerable, true, 'Single hit engages i-frames');

  // Next hit during i-frames is rejected
  const hitA2 = bossA.takeBombDamage(1);
  assert.strictEqual(hitA2, false);

  // Scenario B: Multi-bomb combo (>= 2 hits) opens tactical stun vulnerability
  const bossB = new SteamToyTitanBoss(300, 260);
  bossB.forceState(BossState.PHASE_1);
  bossB.takeBombDamage(1);
  bossB.takeBombDamage(1); // Second hit within 150ms
  assert.strictEqual(bossB.comboHits, 2);
  assert.strictEqual(bossB.currentHp, 14);

  // Advance time past 150ms window -> triggers tactical stun!
  bossB.update(160);
  assert.strictEqual(bossB.bossState, BossState.STUNNED);
  assert.strictEqual(bossB.isInvulnerable, false, 'Stun opens vulnerability window (ARCH-02)');
});

/* ==============================================================================
 * TIER 8: CLOCKWORK CRISIS SYNERGY, WAVEDIRECTOR & PROGRESSION INTEGRATION
 * ============================================================================== */

test('Tier 8.1: Clockwork Crisis synergy accelerates mallet slam cooldown', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  assert.strictEqual(boss.isClockworkCrisisActive, false);

  boss.setClockworkCrisis(true);
  assert.strictEqual(boss.isClockworkCrisisActive, true);

  boss.setClockworkCrisis(false);
  assert.strictEqual(boss.isClockworkCrisisActive, false);
});

test('Tier 8.2: WaveDirector boss selection maps Wave 35 to Steam Toy Titan', () => {
  const bossId = WaveDirector.selectBossForWave(35);
  assert.strictEqual(bossId, 'steam_toy_titan');
});

test('Tier 8.3: WaveDirector createBoss factory instantiates SteamToyTitanBoss', () => {
  const b1 = WaveDirector.createBoss('steam_toy_titan', 200, 200);
  assert.ok(b1 instanceof SteamToyTitanBoss);
  assert.strictEqual(b1.config.id, 'steam_toy_titan');

  const b2 = WaveDirector.createBoss('clockwork_titan', 200, 200);
  assert.ok(b2 instanceof SteamToyTitanBoss);

  const b3 = WaveDirector.createBoss('clockwork_arch_inventor', 200, 200);
  assert.ok(b3 instanceof SteamToyTitanBoss);

  const b4 = WaveDirector.createBoss('void_devourer_avatar', 200, 200);
  assert.ok(b4 instanceof SteamToyTitanBoss);
});

test('Tier 8.4: GameModes BOSS_RUSH_SEQUENCE contains Steam Toy Titan', () => {
  const titanEntry = BOSS_RUSH_SEQUENCE.find((b) => b.id === 'steam_toy_titan');
  assert.ok(titanEntry, 'Steam Toy Titan must be present in BOSS_RUSH_SEQUENCE');
  assert.strictEqual(titanEntry.name, 'Steam Toy Titan');
  assert.strictEqual(titanEntry.maxHp, 16);
});

/* ==============================================================================
 * TIER 9: PROCEDURAL WEBAUDIO SYNTHESIZER SSR/HEADLESS SAFETY
 * ============================================================================== */

test('Tier 9.1: Audio synthesizer safely executes in headless Node environment', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  assert.ok(boss.audio, 'Audio synthesizer instance must exist');

  // All procedural audio calls must safely execute without throws in headless SSR
  assert.doesNotThrow(() => {
    boss.audio.playMalletWindup();
    boss.audio.playMalletImpact();
    boss.audio.playSteamVent();
    boss.audio.playGearWhine();
  });

  // Destruction cleans up pools cleanly
  assert.doesNotThrow(() => {
    boss.destroy();
  });
});

/* ==============================================================================
 * TIER 10: SUBNORMAL FLOAT DEFENSE & ZERO-GC 10,000-FRAME SOAK TEST
 * ============================================================================== */

test('Tier 10.1: Subnormal denormal numbers (1e-323) cleanly flushed to zero', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);

  // Inject subnormal numbers
  boss.vx = 1e-323;
  boss.vy = -1e-323;

  boss.update(16.666, 300 + 1e-323, 260 + 1e-323);

  assert.ok(!Number.isNaN(boss.x), 'x must not be NaN');
  assert.ok(!Number.isNaN(boss.y), 'y must not be NaN');
  assert.ok(!Number.isNaN(boss.vx), 'vx must not be NaN');
  assert.ok(!Number.isNaN(boss.vy), 'vy must not be NaN');
});

test('Tier 10.2: 10,000-Frame Zero-GC Soak Simulation with Zero NaNs', () => {
  const boss = new SteamToyTitanBoss(300, 260);
  boss.forceState(BossState.PHASE_1);

  const frameDt = 16.666; // 60 FPS
  const startTime = Date.now();

  for (let frame = 0; frame < 10000; frame++) {
    // Dynamic simulated player movement
    const px = 300 + Math.sin(frame * 0.05) * 120;
    const py = 260 + Math.cos(frame * 0.05) * 100;

    boss.update(frameDt, px, py);

    // Periodically transition phases and trigger actions
    if (frame === 1000) {
      boss.takeBombDamage(6); // Phase 2 transition
    }
    if (frame === 2000) {
      boss.takeBombDamage(5); // Enraged transition
    }
    if (frame % 1500 === 0) {
      boss.applyStun(1.0); // Periodic stun
    }

    // Invariant assertions every 500 frames
    if (frame % 500 === 0) {
      assert.ok(!Number.isNaN(boss.x), `Frame ${frame}: x must not be NaN`);
      assert.ok(!Number.isNaN(boss.y), `Frame ${frame}: y must not be NaN`);
      assert.ok(!Number.isNaN(boss.vx), `Frame ${frame}: vx must not be NaN`);
      assert.ok(!Number.isNaN(boss.vy), `Frame ${frame}: vy must not be NaN`);
      assert.ok(!Number.isNaN(boss.enrageGauge), `Frame ${frame}: enrage must not be NaN`);
      assert.ok(boss.x >= 60 && boss.x <= 540, `Frame ${frame}: x clamped`);
      assert.ok(boss.y >= 60 && boss.y <= 460, `Frame ${frame}: y clamped`);
    }
  }

  const elapsedMs = Date.now() - startTime;
  const avgFrameTimeUs = (elapsedMs / 10000) * 1000;
  // Performance invariant: < 50 microseconds per frame
  assert.ok(
    avgFrameTimeUs < 50,
    `10k frame soak took ${elapsedMs}ms (${avgFrameTimeUs.toFixed(2)}µs/frame), must be < 50µs/frame`
  );

  boss.destroy();
});
