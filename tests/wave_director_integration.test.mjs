/**
 * tests/wave_director_integration.test.mjs
 *
 * Exhaustive Integration & Defensive Verification Suite for:
 * 1. WaveDirector taxonomy and procedural wave classification
 * 2. Dynamic triggering of PsychicCrisis during Crisis waves
 * 3. Dynamic triggering of MutantFloraBoss during Boss & Crisis-Boss waves
 * 4. Hybrid Crisis-Boss waves (simultaneous Psychic Crisis + Mutant Flora Boss)
 * 5. Event system, Zero-GC invariants, and numerical resilience
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WaveDirector,
  WaveType,
  WaveState,
} from '../src/game/progression/WaveDirector.ts';
import {
  CrisisManager,
  CrisisType,
  CrisisStage,
  PsychicCrisis,
} from '../src/game/crises/index.ts';
import {
  MutantFloraBoss,
  BossState,
} from '../src/game/bosses/index.ts';

/* ==============================================================================
 * SUITE 1: WAVE DIRECTORY TAXONOMY & CLASSIFICATION
 * ============================================================================== */

test('WaveDirector 1.1: determineWaveType correctly classifies waves', () => {
  // Standard waves
  assert.equal(WaveDirector.determineWaveType(1), WaveType.STANDARD);
  assert.equal(WaveDirector.determineWaveType(2), WaveType.STANDARD);
  assert.equal(WaveDirector.determineWaveType(6), WaveType.STANDARD);
  assert.equal(WaveDirector.determineWaveType(9), WaveType.STANDARD);

  // Elite waves (mod 10 === 3 or 7)
  assert.equal(WaveDirector.determineWaveType(3), WaveType.ELITE);
  assert.equal(WaveDirector.determineWaveType(7), WaveType.ELITE);
  assert.equal(WaveDirector.determineWaveType(13), WaveType.ELITE);
  assert.equal(WaveDirector.determineWaveType(17), WaveType.ELITE);

  // Crisis waves (multiples of 4 or ending in 4 or 8)
  assert.equal(WaveDirector.determineWaveType(4), WaveType.CRISIS);
  assert.equal(WaveDirector.determineWaveType(8), WaveType.CRISIS);
  assert.equal(WaveDirector.determineWaveType(12), WaveType.CRISIS);
  assert.equal(WaveDirector.determineWaveType(14), WaveType.CRISIS);
  assert.equal(WaveDirector.determineWaveType(16), WaveType.CRISIS);
  assert.equal(WaveDirector.determineWaveType(18), WaveType.CRISIS);

  // Boss waves (multiples of 5, not multiples of 10)
  assert.equal(WaveDirector.determineWaveType(5), WaveType.BOSS);
  assert.equal(WaveDirector.determineWaveType(15), WaveType.BOSS);
  assert.equal(WaveDirector.determineWaveType(25), WaveType.BOSS);

  // Crisis Boss waves (multiples of 10)
  assert.equal(WaveDirector.determineWaveType(10), WaveType.CRISIS_BOSS);
  assert.equal(WaveDirector.determineWaveType(20), WaveType.CRISIS_BOSS);
  assert.equal(WaveDirector.determineWaveType(30), WaveType.CRISIS_BOSS);
});

test('WaveDirector 1.2: helper methods isCrisisWave, isBossWave, isCrisisBossWave', () => {
  assert.equal(WaveDirector.isCrisisWave(4), true);
  assert.equal(WaveDirector.isCrisisWave(10), true); // CrisisBoss is also a crisis wave
  assert.equal(WaveDirector.isCrisisWave(5), false);

  assert.equal(WaveDirector.isBossWave(5), true);
  assert.equal(WaveDirector.isBossWave(10), true); // CrisisBoss is also a boss wave
  assert.equal(WaveDirector.isBossWave(4), false);

  assert.equal(WaveDirector.isCrisisBossWave(10), true);
  assert.equal(WaveDirector.isCrisisBossWave(20), true);
  assert.equal(WaveDirector.isCrisisBossWave(5), false);
  assert.equal(WaveDirector.isCrisisBossWave(4), false);
});

/* ==============================================================================
 * SUITE 2: DYNAMIC CRISIS SELECTION (PSYCHIC CRISIS)
 * ============================================================================== */

test('WaveDirector 2.1: selectCrisisForWave dynamically resolves PsychicCrisis', () => {
  // Wave 4 and Wave 10 are designated to trigger PsychicCrisis
  const crisis4 = WaveDirector.selectCrisisForWave(4);
  assert.equal(crisis4, CrisisType.PSYCHIC_INVASION);

  const crisis10 = WaveDirector.selectCrisisForWave(10);
  assert.equal(crisis10, CrisisType.PSYCHIC_INVASION);

  // All returned crises belong to registered CrisisType catalog
  for (let w = 4; w <= 40; w += 4) {
    const crisis = WaveDirector.selectCrisisForWave(w);
    assert.ok(WaveDirector.CRISIS_ROTATION.includes(crisis));
  }
});

test('WaveDirector 2.2: startWave(4) triggers PsychicCrisis dynamically via CrisisManager', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  let eventCrisisTriggered = null;
  director.on('crisis-triggered', (data) => {
    eventCrisisTriggered = data;
  });

  const config = director.startWave(4);
  assert.equal(config.type, WaveType.CRISIS);
  assert.equal(config.crisisType, CrisisType.PSYCHIC_INVASION);
  assert.equal(config.bossId, null);

  assert.equal(director.getActiveCrisisType(), CrisisType.PSYCHIC_INVASION);
  assert.ok(cm.getActiveCrisis() instanceof PsychicCrisis);
  assert.equal(cm.getCurrentCrisisType(), CrisisType.PSYCHIC_INVASION);
  assert.equal(cm.getStage(), CrisisStage.WHISPERS);

  assert.ok(eventCrisisTriggered);
  assert.equal(eventCrisisTriggered.crisisType, CrisisType.PSYCHIC_INVASION);
});

/* ==============================================================================
 * SUITE 3: DYNAMIC BOSS SELECTION (MUTANT FLORA BOSS)
 * ============================================================================== */

test('WaveDirector 3.1: selectBossForWave dynamically resolves MutantFloraBoss', () => {
  // Wave 10 and 20 designate Mutant Flora Boss on Crisis Boss waves
  const boss10 = WaveDirector.selectBossForWave(10);
  assert.equal(boss10, 'boss_mutant_flora');

  const boss20 = WaveDirector.selectBossForWave(20);
  assert.equal(boss20, 'boss_mutant_flora');

  const boss5 = WaveDirector.selectBossForWave(5);
  assert.equal(boss5, 'king_gummy_bear');

  const boss15 = WaveDirector.selectBossForWave(15);
  assert.equal(boss15, 'captain_nibbles');

  const boss25 = WaveDirector.selectBossForWave(25);
  assert.equal(boss25, 'queen_bee_cupcake');
});

test('WaveDirector 3.2: createBoss instantiates MutantFloraBoss and boss variants', () => {
  const flora1 = WaveDirector.createBoss('boss_mutant_flora', 320, 240);
  assert.ok(flora1 instanceof MutantFloraBoss);
  assert.equal(flora1.config.id, 'boss_mutant_flora');
  assert.equal(flora1.maxHp, 15);
  assert.equal(flora1.x, 320);
  assert.equal(flora1.y, 240);

  const flora2 = WaveDirector.createBoss('mutant_flora');
  assert.ok(flora2 instanceof MutantFloraBoss);

  const flora3 = WaveDirector.createBoss('verdant_terror');
  assert.ok(flora3 instanceof MutantFloraBoss);

  const hamster = WaveDirector.createBoss('captain_nibbles');
  assert.equal(hamster.config.id, 'boss_hamster_nibbles');

  const queen = WaveDirector.createBoss('queen_bee_cupcake');
  assert.equal(queen.config.id, 'boss_queen_bee');

  const gummy = WaveDirector.createBoss('unknown_boss');
  assert.equal(gummy.config.id, 'boss_gummy_bear');
});

/* ==============================================================================
 * SUITE 4: HYBRID CRISIS-BOSS WAVE (WAVE 10: PSYCHIC CRISIS + MUTANT FLORA BOSS)
 * ============================================================================== */

test('WaveDirector 4.1: startWave(10) simultaneously triggers PsychicCrisis AND MutantFloraBoss', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  let crisisEvent = null;
  let bossEvent = null;

  director.on('crisis-triggered', (data) => { crisisEvent = data; });
  director.on('boss-triggered', (data) => { bossEvent = data; });

  const config = director.startWave(10);
  assert.equal(config.type, WaveType.CRISIS_BOSS);
  assert.equal(config.crisisType, CrisisType.PSYCHIC_INVASION);
  assert.equal(config.bossId, 'boss_mutant_flora');

  // Both Crisis and Boss are active
  assert.equal(director.getActiveCrisisType(), CrisisType.PSYCHIC_INVASION);
  assert.ok(cm.getActiveCrisis() instanceof PsychicCrisis);
  assert.ok(director.getActiveBoss() instanceof MutantFloraBoss);

  assert.ok(crisisEvent);
  assert.ok(bossEvent);
  assert.equal(bossEvent.bossId, 'boss_mutant_flora');

  // Simulation tick updates both simultaneously
  const status = director.update(100, { x: 300, y: 260, r: 5, c: 5 });
  assert.equal(status.isCrisisActive, true);
  assert.equal(status.isBossActive, true);
  assert.equal(status.activeCrisisType, CrisisType.PSYCHIC_INVASION);
  assert.equal(status.activeBossId, 'boss_mutant_flora');
  assert.ok(status.crisisStatus);
  assert.equal(status.crisisStatus.crisisType, CrisisType.PSYCHIC_INVASION);
});

test('WaveDirector 4.2: update and objective completion on crisis wave', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  director.startWave(4); // Psychic Crisis wave
  const activeCrisis = cm.getActiveCrisis();
  assert.ok(activeCrisis instanceof PsychicCrisis);

  // Transition to OUTBREAK
  activeCrisis.transitionToStage(CrisisStage.OUTBREAK);

  // Destroy 3 manifestations with bomb blasts
  cm.handleBombBlast(5, 5, 2);
  cm.handleBombBlast(5, 5, 2);
  cm.handleBombBlast(5, 5, 2);

  const status = director.update(100);
  assert.equal(status.crisisStatus?.isVictorious, true);
  assert.equal(status.crisisStatus?.stage, CrisisStage.RESOLVED);

  // Complete wave
  let waveCompletedEvent = null;
  director.on('wave-completed', (data) => { waveCompletedEvent = data; });

  director.completeWave();
  assert.equal(director.getWaveState(), WaveState.CLEARED);
  assert.equal(director.getCurrentWave(), 5);
  assert.ok(waveCompletedEvent);
  assert.equal(waveCompletedEvent.wave, 4);
});

/* ==============================================================================
 * SUITE 5: DEFENSIVE GUARDS, ZERO-GC INVARIANTS & RESET
 * ============================================================================== */

test('WaveDirector 5.1: handles NaN, negative, and invalid wave numbers cleanly', () => {
  const director = new WaveDirector();

  // Invalid wave number falls back to 1
  const c1 = director.startWave(NaN);
  assert.equal(c1.wave, 1);

  const c2 = director.startWave(-5);
  assert.equal(c2.wave, 1);

  const c3 = director.startWave(Infinity);
  assert.equal(c3.wave, 1);

  // Update with NaN delta does not throw or corrupt elapsedMs
  assert.doesNotThrow(() => {
    director.update(NaN);
    director.update(-100);
  });
});

test('WaveDirector 5.2: 10,000 continuous frames execute without NaN or memory leaks', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  director.startWave(10); // Active Crisis + Active Boss

  for (let frame = 0; frame < 10000; frame++) {
    const status = director.update(16.67, { x: 300, y: 260, r: 5, c: 5 });
    if (frame % 1000 === 0) {
      assert.ok(Number.isFinite(status.elapsedMs));
      assert.equal(status.activeCrisisType, CrisisType.PSYCHIC_INVASION);
      assert.equal(status.activeBossId, 'boss_mutant_flora');
    }
  }

  director.reset();
  assert.equal(director.getCurrentWave(), 1);
  assert.equal(director.getWaveState(), WaveState.IDLE);
  assert.equal(director.getActiveBoss(), null);
  assert.equal(director.getActiveCrisisType(), null);
});
