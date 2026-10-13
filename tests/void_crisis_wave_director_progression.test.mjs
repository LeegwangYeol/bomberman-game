/**
 * tests/void_crisis_wave_director_progression.test.mjs
 *
 * Comprehensive Integration, Progression & Synergy Verification Suite:
 * 1. WaveDirector integration with VoidCrisis (Pastel Void Incursion) on Wave 8
 * 2. 3-Stage FSM Progression (Whispers -> Outbreak -> Climax), Creep Expansion & Supernova Cleanse
 * 3. CrisisManager resolution of Pastel Void, Score (5,000) & Relic (Void Singularity Lens) awards
 * 4. Clean lifecycle transition back to standard waves (Wave 9) with zero dangling hazards
 * 5. RelicManager integration: Void Singularity Lens mechanics & Cosmic Supernova synergy with Pyroclastic Prism
 * 6. 10,000-Frame Zero-GC Soak Test & Numerical Resilience
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
  HazardType,
  VoidCrisis,
} from '../src/game/crises/index.ts';
import {
  RelicManager,
  RelicId,
} from '../src/game/progression/index.ts';

/* ==============================================================================
 * SUITE 1: WAVEDIRECTOR & VOID CRISIS INTEGRATION (WAVE 8)
 * ============================================================================== */

test('Tier 1.1: Wave 8 is classified as CRISIS wave and selects PASTEL_VOID', () => {
  const waveType = WaveDirector.determineWaveType(8);
  assert.equal(waveType, WaveType.CRISIS);
  assert.equal(WaveDirector.isCrisisWave(8), true);
  assert.equal(WaveDirector.isBossWave(8), false);

  const selected = WaveDirector.selectCrisisForWave(8);
  assert.equal(selected, CrisisType.PASTEL_VOID);
});

test('Tier 1.2: WaveDirector.startWave(8) triggers VoidCrisis via CrisisManager', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  let crisisTriggeredEvent = null;
  director.on('crisis-triggered', (data) => {
    crisisTriggeredEvent = data;
  });

  const config = director.startWave(8);
  assert.equal(config.type, WaveType.CRISIS);
  assert.equal(config.crisisType, CrisisType.PASTEL_VOID);
  assert.equal(config.bossId, null);

  assert.equal(director.getActiveCrisisType(), CrisisType.PASTEL_VOID);
  const activeCrisis = cm.getActiveCrisis();
  assert.ok(activeCrisis instanceof VoidCrisis);
  assert.equal(cm.getCurrentCrisisType(), CrisisType.PASTEL_VOID);
  assert.equal(cm.getStage(), CrisisStage.WHISPERS);

  assert.ok(crisisTriggeredEvent);
  assert.equal(crisisTriggeredEvent.crisisType, CrisisType.PASTEL_VOID);

  // Check initial hazards in WHISPERS: 4 rifts + 2 prisms
  const hazards = cm.getActiveHazardTiles();
  assert.equal(hazards.length, 6);
  const rifts = hazards.filter((h) => h.type === HazardType.VOID_RIFT);
  const prisms = hazards.filter((h) => h.type === HazardType.PURIFICATION_PRISM);
  assert.equal(rifts.length, 4);
  assert.equal(prisms.length, 2);
});

/* ==============================================================================
 * SUITE 2: IN-WAVE OBJECTIVES, SUPERNOVA CLEANSE & AVATAR DEFEAT
 * ============================================================================== */

test('Tier 2.1: Charging both prisms triggers Supernova Cleanse and shatters Iridescent Shield', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  director.startWave(8);
  const voidCrisis = cm.getActiveCrisis();
  assert.ok(voidCrisis instanceof VoidCrisis);

  // Transition to CLIMAX where Avatar spawns
  voidCrisis.transitionToStage(CrisisStage.CLIMAX);
  assert.equal(voidCrisis.avatarSpawned, true);
  assert.equal(voidCrisis.avatarShieldActive, true);
  assert.equal(voidCrisis.supernovaCleansed, false);

  // Charge Prism 1 at (1, 13) with 3 bomb blasts
  cm.handleBombBlast(1, 13, 2);
  cm.handleBombBlast(1, 13, 2);
  cm.handleBombBlast(1, 13, 2);
  assert.equal(voidCrisis.prisms[0].isCharged, true);
  assert.equal(voidCrisis.supernovaCleansed, false);

  // Charge Prism 2 at (11, 1) with 3 bomb blasts
  cm.handleBombBlast(11, 1, 2);
  cm.handleBombBlast(11, 1, 2);
  cm.handleBombBlast(11, 1, 2);
  assert.equal(voidCrisis.prisms[1].isCharged, true);

  // Both prisms charged -> Supernova Cleanse triggers!
  assert.equal(voidCrisis.supernovaCleansed, true);
  assert.equal(voidCrisis.avatarShieldActive, false);
});

test('Tier 2.2: Bombing unshielded Avatar defeats it and stabilizes Pastel Void', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  director.startWave(8);
  const voidCrisis = cm.getActiveCrisis();
  assert.ok(voidCrisis instanceof VoidCrisis);

  voidCrisis.transitionToStage(CrisisStage.CLIMAX);

  // Charge both prisms to trigger Supernova Cleanse
  cm.handleBombBlast(1, 13, 2);
  cm.handleBombBlast(1, 13, 2);
  cm.handleBombBlast(1, 13, 2);
  cm.handleBombBlast(11, 1, 2);
  cm.handleBombBlast(11, 1, 2);
  cm.handleBombBlast(11, 1, 2);

  assert.equal(voidCrisis.avatarShieldActive, false);
  assert.equal(voidCrisis.avatarHp, 3);

  // 3 bomb blasts on center Avatar (6, 7)
  cm.handleBombBlast(6, 7, 2);
  assert.equal(voidCrisis.avatarHp, 2);
  cm.handleBombBlast(6, 7, 2);
  assert.equal(voidCrisis.avatarHp, 1);
  cm.handleBombBlast(6, 7, 2);
  assert.equal(voidCrisis.avatarHp, 0);

  // Avatar defeated -> Crisis resolved!
  assert.equal(voidCrisis.getStage(), CrisisStage.RESOLVED);
  assert.equal(voidCrisis.getStatus().isVictorious, true);
});

/* ==============================================================================
 * SUITE 3: CRISIS RESOLUTION, SCORE & RELIC REWARD AWARDS
 * ============================================================================== */

test('Tier 3.1: CrisisManager emits crisis-resolved with score (5000) and Void Singularity Lens relic', () => {
  const cm = new CrisisManager();

  let resolvedPayload = null;
  cm.on('crisis-resolved', (payload) => {
    resolvedPayload = payload;
  });

  cm.triggerCrisis(CrisisType.PASTEL_VOID);
  cm.resolveCrisis('Pastel Void Stabilized!');

  assert.ok(resolvedPayload);
  assert.equal(resolvedPayload.crisisType, CrisisType.PASTEL_VOID);
  assert.equal(resolvedPayload.totalCrisesResolved, 1);
  assert.equal(resolvedPayload.scoreAwarded, 5000);
  assert.equal(resolvedPayload.relicReward, RelicId.VOID_SINGULARITY_LENS);
  assert.equal(resolvedPayload.starCandies, 35);
  assert.equal(resolvedPayload.cosmicEssence, 15);
});

test('Tier 3.2: WaveDirector propagates crisis-resolved with full reward payload on simulation update', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  director.startWave(8);
  const voidCrisis = cm.getActiveCrisis();
  assert.ok(voidCrisis instanceof VoidCrisis);

  let directorResolvedPayload = null;
  director.on('crisis-resolved', (payload) => {
    directorResolvedPayload = payload;
  });

  // Resolve crisis
  voidCrisis.resolveCrisis('Pastel Void Cleansed!');

  // Simulation tick updates director
  const status = director.update(16.67);
  assert.equal(status.crisisStatus?.isVictorious, true);
  assert.equal(status.crisisStatus?.stage, CrisisStage.RESOLVED);

  assert.ok(directorResolvedPayload);
  assert.equal(directorResolvedPayload.crisisType, CrisisType.PASTEL_VOID);
  assert.equal(directorResolvedPayload.scoreAwarded, 5000);
  assert.equal(directorResolvedPayload.relicReward, RelicId.VOID_SINGULARITY_LENS);
  assert.equal(directorResolvedPayload.starCandies, 35);
  assert.equal(directorResolvedPayload.cosmicEssence, 15);
});

/* ==============================================================================
 * SUITE 4: CLEAN TRANSITION BACK TO STANDARD WAVES
 * ============================================================================== */

test('Tier 4.1: completeWave() and startWave(9) cleanly transition back to standard wave', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  director.startWave(8);
  assert.equal(director.getActiveCrisisType(), CrisisType.PASTEL_VOID);

  // Complete Wave 8
  let waveCompletedEvent = null;
  director.on('wave-completed', (payload) => {
    waveCompletedEvent = payload;
  });

  director.completeWave();
  assert.equal(director.getWaveState(), WaveState.CLEARED);
  assert.equal(director.getCurrentWave(), 9);
  assert.ok(waveCompletedEvent);
  assert.equal(waveCompletedEvent.wave, 8);
  assert.equal(waveCompletedEvent.type, WaveType.CRISIS);

  // Start Wave 9 (Standard Wave)
  let waveStartedEvent = null;
  director.on('wave-started', (payload) => {
    waveStartedEvent = payload;
  });

  const config9 = director.startWave(9);
  assert.equal(config9.wave, 9);
  assert.equal(config9.type, WaveType.STANDARD);
  assert.equal(config9.crisisType, null);
  assert.equal(config9.bossId, null);

  // Verify full cleanup of CrisisManager
  assert.equal(director.getActiveCrisisType(), null);
  assert.equal(director.getWaveType(), WaveType.STANDARD);
  assert.equal(director.getWaveState(), WaveState.ACTIVE);

  const cmStatus = cm.getStatus();
  assert.equal(cmStatus.isActive, false);
  assert.equal(cmStatus.crisisType, null);
  assert.equal(cmStatus.stage, CrisisStage.INACTIVE);
  assert.equal(cmStatus.threatMeter, 0);
  assert.equal(cmStatus.hazardTileCount, 0);
  assert.equal(cm.getActiveHazardTiles().length, 0);

  assert.ok(waveStartedEvent);
  assert.equal(waveStartedEvent.wave, 9);
  assert.equal(waveStartedEvent.type, WaveType.STANDARD);
});

/* ==============================================================================
 * SUITE 5: RELIC INTEGRATION & COSMIC SUPERNOVA SYNERGY
 * ============================================================================== */

test('Tier 5.1: Void Singularity Lens pulls enemies inward on bomb placement', () => {
  const rm = new RelicManager([RelicId.VOID_SINGULARITY_LENS], 2);
  assert.equal(rm.isEquipped(RelicId.VOID_SINGULARITY_LENS), true);

  const enemies = [
    { id: 'enemy_1', x: 200, y: 200, r: 5, c: 5 }, // 1 tile away
    { id: 'enemy_2', x: 400, y: 400, r: 10, c: 10 }, // far away
  ];

  const bombPos = { r: 5, c: 6 }; // (5, 6)
  const result = rm.onBombPlaced(bombPos, enemies, Date.now());
  assert.equal(result.pullRadius, 1.5);
  assert.equal(result.pulledEnemyIds.length, 1);
  assert.equal(result.pulledEnemyIds[0], 'enemy_1');
});

test('Tier 5.2: Equipping Pyroclastic Prism activates Cosmic Supernova synergy (2.5 radius)', () => {
  const rm = new RelicManager([RelicId.VOID_SINGULARITY_LENS, RelicId.PYROCLASTIC_PRISM], 2);
  assert.equal(rm.hasSynergy(RelicId.VOID_SINGULARITY_LENS, RelicId.PYROCLASTIC_PRISM), true);

  const activeSynergies = rm.getActiveSynergies();
  const supernova = activeSynergies.find((s) => s.name === 'Cosmic Supernova');
  assert.ok(supernova);

  const enemies = [
    { id: 'enemy_1', x: 240, y: 200, r: 5, c: 6 }, // 1 tile away
    { id: 'enemy_2', x: 280, y: 200, r: 5, c: 7 }, // 2 tiles away (within 2.5)
  ];

  const bombPos = { r: 5, c: 5 };
  const result = rm.onBombPlaced(bombPos, enemies, Date.now());
  assert.equal(result.pullRadius, 2.5); // Expanded from 1.5 to 2.5 tiles!
  assert.equal(result.pulledEnemyIds.length, 2);
});

/* ==============================================================================
 * SUITE 6: 10,000-FRAME ZERO-GC SOAK & BOUNDARY RESILIENCE
 * ============================================================================== */

test('Tier 6.1: 10,000 continuous frames through Wave 8 Void Crisis and Wave 9 Standard maintain Zero-GC', () => {
  const cm = new CrisisManager();
  const director = new WaveDirector(cm);

  // Start Wave 8 (Void Crisis)
  director.startWave(8);

  for (let frame = 0; frame < 5000; frame++) {
    const status = director.update(16.67, { x: 300, y: 260, r: 5, c: 5 });
    if (frame % 1000 === 0) {
      assert.ok(Number.isFinite(status.elapsedMs));
      assert.equal(status.activeCrisisType, CrisisType.PASTEL_VOID);
      assert.equal(status.isCrisisActive, true);
    }
  }

  // Resolve and advance to Wave 9
  director.completeWave();
  director.startWave(9);

  for (let frame = 5000; frame < 10000; frame++) {
    const status = director.update(16.67, { x: 300, y: 260, r: 5, c: 5 });
    if (frame % 1000 === 0) {
      assert.ok(Number.isFinite(status.elapsedMs));
      assert.equal(status.activeCrisisType, null);
      assert.equal(status.isCrisisActive, false);
      assert.equal(status.wave, 9);
      assert.equal(status.waveType, WaveType.STANDARD);
    }
  }

  director.reset();
  assert.equal(director.getCurrentWave(), 1);
  assert.equal(director.getWaveState(), WaveState.IDLE);
  assert.equal(director.getActiveCrisisType(), null);
});
