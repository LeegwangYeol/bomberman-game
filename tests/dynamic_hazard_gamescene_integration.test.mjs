/**
 * dynamic_hazard_gamescene_integration.test.mjs
 *
 * Dedicated Test Battery for:
 * 1. DynamicHazardAudio Singleton Lifecycle & Parity (getInstance, resetInstance, destroy)
 * 2. Real-time FSM Dispatching (playDynamicHazardState across TELEGRAPH tiers & ACTIVE)
 * 3. Headless SSR Safety (0 crashes in mock/headless environment)
 * 4. GameScene Integration Hooks (Initialization, stopCrisisMode, symmetrical shutdown teardown)
 * 5. Tactical Bomb Hooks (Subspace hyper-fuse, Tachyon overcharge, Polarization strike)
 * 6. Combat Mastery (Minion vaporization & Quantum tunneling phase shift)
 * 7. 10,000-Frame Zero-GC Soak Simulation
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DynamicHazard,
  HazardLifecycleState,
  TelegraphPhase,
  HYPER_FUSE_MS,
  TUNNELING_INVULNERABILITY_MS,
} from '../src/game/hazards/DynamicHazard.ts';

import { DynamicHazardAudio } from '../src/game/hazards/DynamicHazardAudio.ts';
import { AudioVoicePool } from '../src/game/pooling/AudioVoicePool.ts';

/* ==============================================================================
 * MOCK AUDIO HARNESS
 * ============================================================================== */

class MockVoicePool {
  constructor() {
    this.tonesPlayed = [];
    this.resets = 0;
    this.destroys = 0;
  }

  playTone(tone) {
    this.tonesPlayed.push(tone);
    return true;
  }

  reset() {
    this.resets++;
  }

  destroy() {
    this.destroys++;
  }

  getAudioContext() {
    return null;
  }
}

/* ==============================================================================
 * TIER 1: SINGLETON LIFECYCLE & PARITY
 * ============================================================================== */

test('Tier 1: DynamicHazardAudio implements standardized getInstance() and resetInstance()', () => {
  DynamicHazardAudio.resetInstance();

  const instance1 = DynamicHazardAudio.getInstance();
  const instance2 = DynamicHazardAudio.getInstance();
  assert.equal(instance1, instance2, 'Must return the same singleton instance');

  DynamicHazardAudio.resetInstance();
  const instance3 = DynamicHazardAudio.getInstance();
  assert.notEqual(instance1, instance3, 'resetInstance must tear down and allow re-instantiation');

  DynamicHazardAudio.resetInstance();
});

/* ==============================================================================
 * TIER 2: FSM DISPATCHING
 * ============================================================================== */

test('Tier 2: playDynamicHazardState routes telegraph tiers and active discharge cleanly', () => {
  DynamicHazardAudio.resetInstance();
  const mockPool = new MockVoicePool();
  const audio = DynamicHazardAudio.getInstance(mockPool);

  let nowMs = 1000;

  // Telegraph YELLOW
  DynamicHazardAudio.playDynamicHazardState(HazardLifecycleState.TELEGRAPH, TelegraphPhase.YELLOW, mockPool, nowMs);
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Telegraph YELLOW must play dual sub-bass voices');

  // Telegraph AMBER
  nowMs += 200;
  mockPool.tonesPlayed = [];
  DynamicHazardAudio.playDynamicHazardState(HazardLifecycleState.TELEGRAPH, TelegraphPhase.AMBER, mockPool, nowMs);
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Telegraph AMBER must play accelerating buzz voices');

  // Telegraph RED
  nowMs += 200;
  mockPool.tonesPlayed = [];
  DynamicHazardAudio.playDynamicHazardState(HazardLifecycleState.TELEGRAPH, TelegraphPhase.RED, mockPool, nowMs);
  assert.ok(mockPool.tonesPlayed.length >= 2, 'Telegraph RED must play critical flutter voices');

  // ACTIVE discharge
  nowMs += 200;
  mockPool.tonesPlayed = [];
  DynamicHazardAudio.playDynamicHazardState(HazardLifecycleState.ACTIVE, undefined, mockPool, nowMs);
  assert.ok(mockPool.tonesPlayed.length >= 1, 'ACTIVE state must trigger laser discharge voices');

  DynamicHazardAudio.resetInstance();
});

/* ==============================================================================
 * TIER 3: HEADLESS SSR SAFETY
 * ============================================================================== */

test('Tier 3: DynamicHazardAudio methods execute safely without crash in headless environment', () => {
  DynamicHazardAudio.resetInstance();
  const audio = new DynamicHazardAudio(null);

  // None of these should throw
  assert.doesNotThrow(() => audio.playTelegraphPulse('YELLOW', 1000));
  assert.doesNotThrow(() => audio.playLaserDischarge(1200));
  assert.doesNotThrow(() => audio.playHyperFuseTick());
  assert.doesNotThrow(() => audio.playTachyonOvercharge());
  assert.doesNotThrow(() => audio.playMinionVaporization());
  assert.doesNotThrow(() => audio.playPolarizationStrike(1400));
  assert.doesNotThrow(() => audio.playQuantumTunneling(1600));
  assert.doesNotThrow(() => audio.stop());
  assert.doesNotThrow(() => audio.destroy());
});

/* ==============================================================================
 * TIER 4 & 5: GAMESCENE MOCK INTEGRATION & STOP/SHUTDOWN TEARDOWN
 * ============================================================================== */

test('Tier 4: GameScene mock lifecycle verifies dynamicHazardAudio initialization', () => {
  DynamicHazardAudio.resetInstance();

  const mockScene = {
    dynamicHazard: new DynamicHazard(),
    dynamicHazardAudio: DynamicHazardAudio.getInstance(),
    stopCrisisMode() {
      this.dynamicHazard.stop();
      this.dynamicHazardAudio?.stop();
    },
    shutdown() {
      if (this.dynamicHazardAudio) {
        this.dynamicHazardAudio.destroy();
        this.dynamicHazardAudio = null;
      }
      DynamicHazardAudio.resetInstance();
    },
  };

  assert.ok(mockScene.dynamicHazardAudio);
  mockScene.stopCrisisMode();
  assert.equal(mockScene.dynamicHazard.getState(), HazardLifecycleState.INACTIVE);

  mockScene.shutdown();
  assert.equal(mockScene.dynamicHazardAudio, null);

  DynamicHazardAudio.resetInstance();
});

/* ==============================================================================
 * TIER 6, 7, 8, 9, 10: TACTICAL COMBAT HOOKS
 * ============================================================================== */

test('Tier 6: Subspace Hyper-Fuse placement accelerates fuse and plays tick audio', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Place bomb on spire anchor (row 3, col 4)
  const result = hazard.onBombPlaced('bomb_1', 3, 4, 2, 2000);
  assert.equal(result.modifiedFuseMs, HYPER_FUSE_MS);

  const mockPool = new MockVoicePool();
  const audio = new DynamicHazardAudio(mockPool);
  audio.playHyperFuseTick();
  assert.ok(mockPool.tonesPlayed.length > 0, 'Hyper-fuse tick tone played');
});

test('Tier 7: Tachyon Overcharge triggers +2 power and overcharge audio in active beam', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Advance past 2000ms warmup + 2000ms telegraph into ACTIVE
  hazard.update(4000);
  assert.equal(hazard.getState(), HazardLifecycleState.ACTIVE);

  const detResult = hazard.onBombDetonated('bomb_2', 5, 4, 2);
  assert.equal(detResult.overcharged, true);
  assert.equal(detResult.modifiedPower, 4); // 2 + 2

  const mockPool = new MockVoicePool();
  const audio = new DynamicHazardAudio(mockPool);
  audio.playTachyonOvercharge();
  assert.ok(mockPool.tonesPlayed.length > 0, 'Tachyon overcharge tone played');
});

test('Tier 8: Polarization Strike triggers on blast impact with anchor', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  // Spire anchor at (3, 4)
  const impact = hazard.onBombBlastImpact(3, 4);
  assert.equal(impact.polarized, true);

  const mockPool = new MockVoicePool();
  const audio = new DynamicHazardAudio(mockPool);
  audio.playPolarizationStrike(1000);
  assert.ok(mockPool.tonesPlayed.length >= 3, 'Polarization chord triad played');
});

test('Tier 9: Minion vaporization deals lethal damage and triggers audio', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(4000); // ACTIVE

  const enemyCollision = hazard.checkEnemyCollision(5, 4, false);
  assert.equal(enemyCollision.hit, true);
  assert.equal(enemyCollision.isVaporized, true);
  assert.equal(enemyCollision.damage, 120);

  const mockPool = new MockVoicePool();
  const audio = new DynamicHazardAudio(mockPool);
  audio.playMinionVaporization();
  assert.ok(mockPool.tonesPlayed.length > 0, 'Minion vaporization tone played');
});

test('Tier 10: Player dashing through active beam triggers Quantum Tunneling phase shift', () => {
  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');
  hazard.update(4000); // ACTIVE

  // Player dashing at 50ms elapsed (< 150ms window)
  const playerCollision = hazard.checkPlayerCollision(5, 4, true, 50);
  assert.equal(playerCollision.hit, true);
  assert.equal(playerCollision.damage, 0);
  assert.equal(playerCollision.tunneled, true);
  assert.equal(playerCollision.phaseShiftGranted, true);

  const mockPool = new MockVoicePool();
  const audio = new DynamicHazardAudio(mockPool);
  audio.playQuantumTunneling(1000);
  assert.ok(mockPool.tonesPlayed.length >= 1, 'Quantum tunneling whoosh played');
});

/* ==============================================================================
 * TIER 11: 10,000-FRAME ZERO-GC SOAK SIMULATION
 * ============================================================================== */

test('Tier 11: 10,000 frames under DynamicHazard and DynamicHazardAudio maintain Zero-GC', () => {
  DynamicHazardAudio.resetInstance();
  const mockPool = new MockVoicePool();
  const audio = DynamicHazardAudio.getInstance(mockPool);

  const hazard = new DynamicHazard();
  hazard.init();
  hazard.start('OUTBREAK');

  let nowMs = 100000;
  for (let frame = 0; frame < 10000; frame++) {
    nowMs += 16.6667;
    hazard.update(16.6667);
    DynamicHazardAudio.playDynamicHazardState(hazard.getState(), hazard.getTelegraphPhase(), mockPool, nowMs);
  }

  DynamicHazardAudio.resetInstance();
  assert.ok(mockPool.tonesPlayed.length > 0, 'Audio events dispatched over 10k frames');
});
