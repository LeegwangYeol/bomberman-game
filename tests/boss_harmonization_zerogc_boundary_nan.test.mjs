import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  BossState,
  BaseBoss,
  MutantFloraBoss,
  BossHUD,
  BOSS_METADATA,
  BossAttackManager,
  BossProjectileType,
} from '../src/game/bosses/index.ts';

/* ==============================================================================
 * TEST SUITE: ZERO-GC POOLING, SAFE BOUNDARY COLLISION & NO-NAN VELOCITY HARMONIZATION
 * ============================================================================== */

test('Harmonization 1.1: BaseBoss — Strict NaN velocity protection and movement integration', () => {
  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500); // Complete intro -> Phase 1

  // 1. Pass NaN player coordinates into update: must not corrupt boss x, y, vx, vy
  boss.update(16, NaN, NaN);
  assert.strictEqual(Number.isFinite(boss.x), true);
  assert.strictEqual(Number.isFinite(boss.y), true);
  assert.strictEqual(Number.isFinite(boss.vx), true);
  assert.strictEqual(Number.isFinite(boss.vy), true);

  // 2. Pass infinite player coordinates: must clamp cleanly
  boss.update(16, Infinity, -Infinity);
  assert.strictEqual(Number.isFinite(boss.x), true);
  assert.strictEqual(Number.isFinite(boss.y), true);

  // 3. Test setVelocityTowards with exact same coordinate (dist === 0)
  boss.setVelocityTowards(boss.x, boss.y, 100);
  assert.strictEqual(boss.vx, 0, 'Velocity toward same position must resolve to 0, never NaN');
  assert.strictEqual(boss.vy, 0, 'Velocity toward same position must resolve to 0, never NaN');

  // 4. Test setVelocityTowards with NaN target
  boss.setVelocityTowards(NaN, 100, 100);
  assert.strictEqual(boss.vx, 0);
  assert.strictEqual(boss.vy, 0);

  // 5. Test setVelocityTowards with NaN speed
  boss.setVelocityTowards(400, 400, NaN);
  assert.strictEqual(boss.vx, 0);
  assert.strictEqual(boss.vy, 0);

  // 6. Test integrateMovement with NaN dt
  const oldX = boss.x;
  const oldY = boss.y;
  boss.integrateMovement(NaN);
  assert.strictEqual(boss.x, oldX);
  assert.strictEqual(boss.y, oldY);

  // 7. Test takeBombDamage with NaN and negative damage
  assert.strictEqual(boss.takeBombDamage(NaN), false, 'NaN damage must be rejected');
  assert.strictEqual(boss.takeBombDamage(-5), false, 'Negative damage must be rejected');
  assert.strictEqual(Number.isFinite(boss.currentHp), true);

  // 8. Test applyStun with NaN duration
  boss.applyStun(NaN);
  assert.strictEqual(boss.bossState, BossState.PHASE_1, 'NaN stun duration must be ignored');
});

test('Harmonization 1.2: BaseBoss & MutantFloraBoss — Safe boundary collision clamping', () => {
  // 1. Construction at extreme out-of-bounds coordinates
  const outBoss = new MutantFloraBoss(-9999, 99999);
  assert.strictEqual(outBoss.x, outBoss.minArenaX, 'X must clamp to minArenaX (60)');
  assert.strictEqual(outBoss.y, outBoss.maxArenaY, 'Y must clamp to maxArenaY (460)');

  // 2. Construction with NaN coordinates defaults safely to central spawn
  const nanBoss = new MutantFloraBoss(NaN, NaN);
  assert.ok(nanBoss.x >= nanBoss.minArenaX && nanBoss.x <= nanBoss.maxArenaX);
  assert.ok(nanBoss.y >= nanBoss.minArenaY && nanBoss.y <= nanBoss.maxArenaY);

  // 3. Driving velocity into outer walls must clamp position and reset outward velocity
  nanBoss.update(1500); // Complete intro
  nanBoss.vx = -500; // moving violently left
  nanBoss.vy = 0;
  for (let i = 0; i < 20; i++) {
    nanBoss.integrateMovement(100);
  }
  assert.strictEqual(nanBoss.x, nanBoss.minArenaX, 'Position must not penetrate left wall');
  assert.strictEqual(nanBoss.vx, 0, 'Leftward velocity must be zeroed upon wall impact');

  nanBoss.vx = 0;
  nanBoss.vy = 800; // moving violently down
  for (let i = 0; i < 20; i++) {
    nanBoss.integrateMovement(100);
  }
  assert.strictEqual(nanBoss.y, nanBoss.maxArenaY, 'Position must not penetrate bottom wall');
  assert.strictEqual(nanBoss.vy, 0, 'Downward velocity must be zeroed upon bottom wall impact');
});

test('Harmonization 1.3: MutantFloraBoss — Zero-GC Subterranean Root pooling and attack synchronization', () => {
  const boss = new MutantFloraBoss(300, 260);
  const attackMgr = new BossAttackManager();
  boss.attackManager = attackMgr;

  boss.update(1500); // Phase 1

  // Spawn subterranean root
  const root = boss.spawnSubterraneanRoot(350, 280);
  assert.ok(root !== null, 'Root should be acquired from pool');
  assert.strictEqual(root.active, true);
  assert.strictEqual(boss.activeRoots, 1);
  assert.strictEqual(boss.rootPool.activeCount, 1);
  assert.strictEqual(attackMgr.telegraphPool.activeCount, 1, 'Telegraph should sync with BossAttackManager');

  // Spawning beyond max capacity
  for (let i = 0; i < 10; i++) {
    boss.spawnSubterraneanRoot(300, 260);
  }
  assert.strictEqual(boss.activeRoots, boss.maxRoots, 'Must not exceed maxRoots');
  assert.strictEqual(boss.rootPool.activeCount, boss.maxRoots);

  // Advancing time expires pooled roots with Zero-GC
  boss.update(4000);
  assert.strictEqual(boss.rootPool.activeCount <= boss.maxRoots, true);

  // Intermission purges roots cleanly
  boss.transitionTo(BossState.INTERMISSION);
  assert.strictEqual(boss.activeRoots, 0);
  assert.strictEqual(boss.rootPool.activeCount, 0);
  assert.strictEqual(boss.isUnderground, true);

  boss.destroy();
  attackMgr.destroy();
});

test('Harmonization 1.4: BaseBoss & BossHUD — Zero-GC polling & event emission stability', () => {
  const emitter = new EventEmitter();
  const hud = new BossHUD({ events: emitter });
  hud.initBoss('boss_mutant_flora', 15);

  let updateEventsCount = 0;
  emitter.on('boss-hud-update', () => {
    updateEventsCount++;
  });

  const boss = new MutantFloraBoss(300, 260);
  boss.update(1500);

  // 1. BaseBoss.getHUDData() uses pre-allocated object and does not allocate per frame
  const data1 = boss.getHUDData();
  const data2 = boss.getHUDData();
  assert.strictEqual(data1, data2, 'getHUDData must return pre-allocated reusable object for Zero-GC');
  assert.strictEqual(data1.bossId, 'boss_mutant_flora');
  assert.strictEqual(data1.currentHp, 15);

  // 2. BossHUD defensive protection against NaN setters
  hud.setHp(NaN);
  assert.strictEqual(hud.getState().currentHp, 15, 'NaN HP must not alter HUD state');

  hud.setPhase(NaN);
  assert.strictEqual(hud.getState().phase, 1, 'NaN phase must not alter HUD phase');

  hud.setEnrageGauge(NaN);
  assert.strictEqual(hud.getState().enrageGauge, 0, 'NaN gauge must not alter HUD gauge');

  hud.triggerStun(NaN, 'Invalid Stun');
  assert.strictEqual(hud.getState().isStunned, false, 'NaN stun duration must not trigger stun');

  hud.registerComboHit(NaN, NaN);
  assert.strictEqual(hud.getState().comboHits, 0, 'NaN combo hits must not alter combo state');

  // 3. Valid stun triggers alert with static identifier
  hud.triggerStun(2.5, 'Spore Overgrowth');
  assert.strictEqual(hud.getState().isStunned, true);
  assert.strictEqual(hud.getState().stunDurationMs, 2500);
  assert.strictEqual(hud.getState().activeAlert?.id, 'stun_alert');
});

test('Harmonization 1.5: 10,000-Frame Soak Test — Zero-GC memory invariance and NaN resilience', () => {
  const boss = new MutantFloraBoss(300, 260);
  const attackMgr = new BossAttackManager();
  boss.attackManager = attackMgr;

  const emitter = new EventEmitter();
  const hud = new BossHUD({ events: emitter });
  hud.initBoss('boss_mutant_flora', 15);

  boss.update(1500); // Complete intro

  let playerX = 300;
  let playerY = 260;

  // Warmup 500 frames
  for (let frame = 0; frame < 500; frame++) {
    boss.update(16.6, playerX, playerY);
    attackMgr.update(16.6, playerX, playerY, () => {});
    hud.update(16.6);
  }

  // Force GC if available or record baseline
  if (global.gc) global.gc();
  const initialMem = process.memoryUsage().heapUsed;

  // Soak 10,000 frames under active combat, projectile firing, root spawning, and chaos input
  for (let frame = 0; frame < 10000; frame++) {
    // Dynamic player movement circling the arena
    playerX = 300 + Math.cos(frame * 0.05) * 150;
    playerY = 260 + Math.sin(frame * 0.05) * 120;

    // Periodic bomb hits & attacks
    if (frame % 200 === 0) {
      boss.takeBombDamage(1);
      hud.setHp(boss.currentHp);
      hud.setEnrageGauge(boss.enrageGauge);
    }

    if (frame % 150 === 0) {
      boss.emitPollenCloud(playerX, playerY);
    }

    if (frame % 300 === 0) {
      boss.executeVineWhip();
    }

    // Occasional hazard damage
    if (frame % 500 === 0) {
      boss.takeHazardDamage(15, 1.5);
    }

    // Fuzz with occasional NaN coordinates (simulating corrupt engine input)
    const testPx = frame % 70 === 0 ? NaN : playerX;
    const testPy = frame % 70 === 0 ? NaN : playerY;
    const testDt = frame % 100 === 0 ? NaN : 16.6;

    boss.update(testDt, testPx, testPy);
    attackMgr.update(16.6, playerX, playerY, () => {});
    hud.update(16.6);

    // Verify invariants every 1,000 frames
    if (frame % 1000 === 0) {
      assert.strictEqual(Number.isFinite(boss.x), true, `Frame ${frame}: Boss X must be finite`);
      assert.strictEqual(Number.isFinite(boss.y), true, `Frame ${frame}: Boss Y must be finite`);
      assert.strictEqual(Number.isFinite(boss.vx), true, `Frame ${frame}: Boss Vx must be finite`);
      assert.strictEqual(Number.isFinite(boss.vy), true, `Frame ${frame}: Boss Vy must be finite`);
      assert.ok(boss.x >= boss.minArenaX && boss.x <= boss.maxArenaX, `Frame ${frame}: Boss X within bounds`);
      assert.ok(boss.y >= boss.minArenaY && boss.y <= boss.maxArenaY, `Frame ${frame}: Boss Y within bounds`);
      assert.strictEqual(Number.isFinite(boss.currentHp), true);
      assert.strictEqual(Number.isFinite(hud.getState().currentHp), true);
    }
  }

  if (global.gc) global.gc();
  const finalMem = process.memoryUsage().heapUsed;
  const driftMb = (finalMem - initialMem) / (1024 * 1024);

  // Assert drift is within strict budget (< 2.5 MB under ambient GC over 10k frames)
  assert.ok(driftMb < 2.5, `Heap drift too high: ${driftMb.toFixed(2)} MB`);

  boss.destroy();
  attackMgr.destroy();
});
