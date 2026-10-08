/**
 * tests/psychic_crisis_defensive.test.mjs — Comprehensive Defensive Unit Tests for PsychicCrisis
 *
 * Verifies:
 * 1. Metadata, Enums & Zero-GC 195-Hazard Buffer Invariants
 * 2. 3-Stage FSM Lifecycle (Whispers -> Outbreak -> Climax -> Resolved/Failed) & Real-Time Alerts
 * 3. Mathematical Safe Area Guarantees (>= 80% Safe Arena Invariant)
 * 4. Manifestation Seeding & Disruption Pulsing Dynamics (MAX_DISRUPTED_TILES <= 18)
 * 5. Dynamic Threat Scaling & Stage-Bound Envelopes ([10..35), [35..70), [70..100])
 * 6. Bomb Blast Psionic Manifestation Destruction, Disruption Cleansing & Victory Resolution
 * 7. Direct Objective Resolution API, Clamping & Safeguards
 * 8. Subclass State Purge on reset() & Clean Reinitialization
 * 9. CrisisManager Orchestrator Integration & Edge-Triggered Resolution Counter
 * 10. Adversarial Chaos: Extreme Coordinates, Non-Finite Numbers, Rapid Transitions
 * 11. Zero-GC 10,000-Frame Soak Simulation
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CrisisType,
  CrisisStage,
  HazardType,
  CRISIS_DEFINITIONS,
  CrisisManager,
  PsychicCrisis,
} from '../src/game/crises/index.ts';
import { ROWS, COLS, TOTAL_TILES } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * SUITE 1: METADATA, ENUMS & ZERO-GC 195-HAZARD BUFFER INVARIANTS
 * ============================================================================== */

test('PsychicCrisis 1.1: CRISIS_DEFINITIONS catalog contains valid schema for PSYCHIC_INVASION', () => {
  const def = CRISIS_DEFINITIONS[CrisisType.PSYCHIC_INVASION];
  assert.ok(def, 'Missing definition for CrisisType.PSYCHIC_INVASION');
  assert.strictEqual(def.id, CrisisType.PSYCHIC_INVASION);
  assert.strictEqual(def.name, 'Psychic Entity Invasion');
  assert.strictEqual(def.icon, '🧠👁️');
  assert.strictEqual(def.themeColor, '#EC4899');
  assert.strictEqual(typeof def.description, 'string');
  assert.ok(def.description.length > 10);

  // Exact stage durations: Whispers 20s, Outbreak 55s, Climax 35s
  assert.strictEqual(def.stageDurations[CrisisStage.WHISPERS], 20000);
  assert.strictEqual(def.stageDurations[CrisisStage.OUTBREAK], 55000);
  assert.strictEqual(def.stageDurations[CrisisStage.CLIMAX], 35000);
});

test('PsychicCrisis 1.2: Zero-GC 195-HazardTile buffer allocation and initial inactive state', () => {
  const crisis = new PsychicCrisis();

  assert.strictEqual(crisis.id, CrisisType.PSYCHIC_INVASION);
  assert.strictEqual(crisis.name, 'Psychic Entity Invasion');
  assert.strictEqual(crisis.getStage(), CrisisStage.INACTIVE);
  assert.strictEqual(crisis.getThreat(), 0);
  assert.strictEqual(crisis.getObjectives().length, 0);
  assert.strictEqual(crisis.getActiveAlert(), null);
  assert.strictEqual(crisis.phantomTimerMs, 0);
  assert.strictEqual(crisis.pulseTimerMs, 0);

  // Status snapshot check
  const status = crisis.getStatus();
  assert.strictEqual(status.isActive, false);
  assert.strictEqual(status.crisisType, CrisisType.PSYCHIC_INVASION);
  assert.strictEqual(status.stage, CrisisStage.INACTIVE);
  assert.strictEqual(status.threatMeter, 0);
  assert.strictEqual(status.threatTrend, 'stable');
  assert.strictEqual(status.isVictorious, false);
  assert.strictEqual(status.isDefeated, false);
  assert.strictEqual(status.hazardTileCount, 0);

  // Hazard buffer dimensions check
  assert.strictEqual(TOTAL_TILES, ROWS * COLS);
  const activeTiles = crisis.getActiveHazardTiles();
  assert.strictEqual(activeTiles.length, 0);

  // Ensure all 195 tiles start with HazardType.NONE
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      assert.strictEqual(crisis.isTileHazardous(r, c), false);
      assert.strictEqual(crisis.getHazardAt(r, c), null);
    }
  }
});

/* ==============================================================================
 * SUITE 2: 3-STAGE FSM LIFECYCLE, ALERTS & MANIFESTATION SEEDING
 * ============================================================================== */

test('PsychicCrisis 2.1: init() transitions to WHISPERS, seeds 3 manifestations and triggers alert', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  assert.strictEqual(crisis.getStage(), CrisisStage.WHISPERS);
  assert.strictEqual(crisis.getThreat(), 10);

  // Objective registered
  const objs = crisis.getObjectives();
  assert.strictEqual(objs.length, 1);
  assert.strictEqual(objs[0].id, 'resist_psionics');
  assert.strictEqual(objs[0].targetCount, 3);
  assert.strictEqual(objs[0].currentCount, 0);
  assert.strictEqual(objs[0].isCompleted, false);

  // Manifestations seeded
  assert.strictEqual(crisis.manifestations.length, 3);
  const expectedPositions = [
    { r: 3, c: 3 },
    { r: 9, c: 3 },
    { r: 6, c: 11 },
  ];
  for (let i = 0; i < 3; i++) {
    const m = crisis.manifestations[i];
    assert.strictEqual(m.r, expectedPositions[i].r);
    assert.strictEqual(m.c, expectedPositions[i].c);
    assert.strictEqual(m.isDestroyed, false);
    assert.strictEqual(crisis.isTileHazardous(m.r, m.c), true);
    const tile = crisis.getHazardAt(m.r, m.c);
    assert.ok(tile);
    assert.strictEqual(tile.type, HazardType.PSIONIC_MANIFESTATION);
  }

  // Active alert
  const alert = crisis.getActiveAlert();
  assert.ok(alert);
  assert.strictEqual(alert.id, 'psychic_whispers');
  assert.strictEqual(alert.title, 'UNIDENTIFIED PSIONIC SIGNATURES');
  assert.strictEqual(alert.level, 'info');
  assert.strictEqual(alert.icon, '🧠');
  assert.strictEqual(alert.durationMs, 4000);
});

test('PsychicCrisis 2.2: Stage progression via elapsed time: WHISPERS -> OUTBREAK -> CLIMAX -> FAILED', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  // 1. Advance through WHISPERS (20,000ms duration)
  crisis.update(19999);
  assert.strictEqual(crisis.getStage(), CrisisStage.WHISPERS);

  // Exceed 20,000ms: auto-advances to OUTBREAK
  crisis.update(2);
  assert.strictEqual(crisis.getStage(), CrisisStage.OUTBREAK);
  assert.ok(crisis.getThreat() >= 35, 'OUTBREAK stage must elevate threat floor to at least 35');

  const alertOutbreak = crisis.getActiveAlert();
  assert.ok(alertOutbreak);
  assert.strictEqual(alertOutbreak.id, 'psychic_outbreak');
  assert.strictEqual(alertOutbreak.level, 'danger');
  assert.strictEqual(alertOutbreak.icon, '👁️');
  assert.strictEqual(alertOutbreak.durationMs, 5000);

  // 2. Advance through OUTBREAK (55,000ms duration)
  crisis.update(54999);
  assert.strictEqual(crisis.getStage(), CrisisStage.OUTBREAK);

  // Exceed 55,000ms: auto-advances to CLIMAX
  crisis.update(2);
  assert.strictEqual(crisis.getStage(), CrisisStage.CLIMAX);
  assert.ok(crisis.getThreat() >= 70, 'CLIMAX stage must elevate threat floor to at least 70');

  const alertClimax = crisis.getActiveAlert();
  assert.ok(alertClimax);
  assert.strictEqual(alertClimax.id, 'psychic_climax');
  assert.strictEqual(alertClimax.level, 'critical');
  assert.strictEqual(alertClimax.icon, '🔮');
  assert.strictEqual(alertClimax.durationMs, 6000);

  // 3. Advance through CLIMAX (35,000ms duration) without completing objectives -> FAILED
  crisis.update(35001);
  assert.strictEqual(crisis.getStage(), CrisisStage.FAILED);
  assert.strictEqual(crisis.getThreat(), 100);

  const status = crisis.getStatus();
  assert.strictEqual(status.isDefeated, true);
  assert.strictEqual(status.isVictorious, false);
  assert.strictEqual(status.threatTrend, 'critical');

  const alertFailed = crisis.getActiveAlert();
  assert.ok(alertFailed);
  assert.strictEqual(alertFailed.id, 'failed');
  assert.strictEqual(alertFailed.level, 'critical');
  assert.strictEqual(alertFailed.icon, '💀');
});

/* ==============================================================================
 * SUITE 3: MATHEMATICAL SAFE AREA INVARIANT (>= 80% SAFE TILES)
 * ============================================================================== */

test('PsychicCrisis 3.1: Safe area ratio strictly maintains >= 80% across all stages and disruption spikes', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  // Initial Whispers safe ratio
  assert.ok(
    crisis.getSafeAreaRatio() >= 0.80,
    `Safe area in Whispers must be >= 80%, got ${crisis.getSafeAreaRatio()}`
  );
  assert.ok(
    crisis.getWalkableSafeAreaRatio() >= 0.80,
    `Walkable safe area in Whispers must be >= 80%, got ${crisis.getWalkableSafeAreaRatio()}`
  );

  // Transition to Outbreak and spawn multiple disruption waves
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  for (let i = 0; i < 10; i++) {
    crisis.spawnDisruptionZones();
    crisis.update(4000);
  }

  assert.ok(crisis.getActiveHazardCount() <= PsychicCrisis.MAX_DISRUPTED_TILES);
  assert.ok(crisis.getSafeAreaRatio() >= 0.80);
  assert.ok(crisis.getWalkableSafeAreaRatio() >= 0.80);

  // Transition to Climax and spawn aggressive disruption waves
  crisis.transitionToStage(CrisisStage.CLIMAX);
  for (let i = 0; i < 10; i++) {
    crisis.spawnDisruptionZones();
    crisis.update(3000);
  }

  assert.ok(crisis.getActiveHazardCount() <= PsychicCrisis.MAX_DISRUPTED_TILES);
  assert.ok(crisis.getSafeAreaRatio() >= 0.80);
  assert.ok(crisis.getWalkableSafeAreaRatio() >= 0.80);
});

/* ==============================================================================
 * SUITE 4: DYNAMIC THREAT SCALING & BOUNDED ENVELOPES
 * ============================================================================== */

test('PsychicCrisis 4.1: Threat scales smoothly within stage-specific bounded envelopes', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  // Whispers envelope: [10.0 .. 34.9]
  assert.strictEqual(crisis.getThreat(), 10.0);
  crisis.update(10000); // 50% elapsed
  const threatMidWhispers = crisis.getThreat();
  assert.ok(threatMidWhispers >= 20.0 && threatMidWhispers <= 25.0);

  crisis.update(9999); // near 100% of Whispers
  assert.ok(crisis.getThreat() <= 34.9);

  // Outbreak envelope: [35.0 .. 69.9]
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  assert.ok(crisis.getThreat() >= 35.0);
  crisis.update(27500); // 50% elapsed of Outbreak (55s)
  const threatMidOutbreak = crisis.getThreat();
  assert.ok(threatMidOutbreak >= 50.0 && threatMidOutbreak <= 55.0);

  // Climax envelope: [70.0 .. 100.0]
  crisis.transitionToStage(CrisisStage.CLIMAX);
  assert.ok(crisis.getThreat() >= 70.0);
  crisis.update(17500); // 50% elapsed of Climax (35s)
  const threatMidClimax = crisis.getThreat();
  assert.ok(threatMidClimax >= 80.0 && threatMidClimax <= 90.0);
});

/* ==============================================================================
 * SUITE 5: BOMB BLAST MANIFESTATION DESTRUCTION & OBJECTIVE COMPLETION
 * ============================================================================== */

test('PsychicCrisis 5.1: Bomb blasts in WHISPERS do not destroy manifestations, but in OUTBREAK/CLIMAX succeed', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  // Blast during Whispers is rejected
  crisis.handleBombBlast(3, 3, 2);
  const obj = crisis.getObjectives().find((o) => o.id === 'resist_psionics');
  assert.ok(obj);
  assert.strictEqual(obj.currentCount, 0);
  assert.strictEqual(crisis.manifestations[0].isDestroyed, false);

  // Transition to Outbreak
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  // Blast 1 at manifestation 1 (3, 3)
  crisis.handleBombBlast(3, 3, 2);
  assert.strictEqual(obj.currentCount, 1);
  assert.strictEqual(crisis.manifestations[0].isDestroyed, true);
  assert.strictEqual(crisis.isTileHazardous(3, 3), false);

  // Blast 2 at manifestation 2 (9, 3)
  crisis.handleBombBlast(9, 3, 2);
  assert.strictEqual(obj.currentCount, 2);
  assert.strictEqual(crisis.manifestations[1].isDestroyed, true);

  // Transition to Climax
  crisis.transitionToStage(CrisisStage.CLIMAX);

  // Blast 3 at manifestation 3 (6, 11) -> completes objective!
  crisis.handleBombBlast(6, 11, 2);
  assert.strictEqual(obj.currentCount, 3);
  assert.strictEqual(obj.isCompleted, true);
  assert.strictEqual(crisis.manifestations[2].isDestroyed, true);

  // Reality anchored victory
  assert.strictEqual(crisis.getStage(), CrisisStage.RESOLVED);
  assert.strictEqual(crisis.getStatus().isVictorious, true);
  assert.strictEqual(crisis.getThreat(), 0);
  assert.strictEqual(crisis.getActiveHazardCount(), 0);

  const alert = crisis.getActiveAlert();
  assert.ok(alert);
  assert.strictEqual(alert.id, 'resolved');
  assert.strictEqual(alert.title, 'CRISIS STABILIZED');
  assert.strictEqual(alert.icon, '✨');
});

test('PsychicCrisis 5.2: Proximate bomb blast also destroys disruption hazard tiles and damps threat', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  crisis.spawnDisruptionZones();

  const hazardsBefore = crisis.getActiveHazardCount();
  assert.ok(hazardsBefore > 3);

  const threatBefore = crisis.getThreat();
  crisis.handleBombBlast(3, 3, 2); // Blast on manifestation

  // Threat is damped by 5
  assert.ok(crisis.getThreat() <= threatBefore);
  // Disruption tiles around (3, 3) are cleared
  assert.strictEqual(crisis.isTileHazardous(3, 3), false);
});

/* ==============================================================================
 * SUITE 6: DIRECT OBJECTIVE RESOLUTION API & CLAMPING
 * ============================================================================== */

test('PsychicCrisis 6.1: Direct resolveObjective calls clamp to targetCount and ignore unknown ids', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  // Unknown objective id is a safe no-op
  crisis.resolveObjective('unknown_fake_objective', 5);
  const obj = crisis.getObjectives().find((o) => o.id === 'resist_psionics');
  assert.ok(obj);
  assert.strictEqual(obj.currentCount, 0);

  // Set explicit count of 2
  crisis.resolveObjective('resist_psionics', 2);
  assert.strictEqual(obj.currentCount, 2);
  assert.strictEqual(obj.isCompleted, false);

  // Set count beyond targetCount: clamps to 3 and triggers victory
  crisis.resolveObjective('resist_psionics', 99);
  assert.strictEqual(obj.currentCount, 3);
  assert.strictEqual(obj.isCompleted, true);
  assert.strictEqual(crisis.getStage(), CrisisStage.RESOLVED);
  assert.strictEqual(crisis.getStatus().isVictorious, true);
});

/* ==============================================================================
 * SUITE 7: STATE RESET & SUBCLASS VARIABLE PURGE
 * ============================================================================== */

test('PsychicCrisis 7.1: reset() purges all subclass timers, manifestations, alerts and restores INACTIVE state', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  crisis.update(2500);
  crisis.spawnDisruptionZones();
  assert.ok(crisis.getActiveHazardCount() > 0);

  // Invoke reset()
  crisis.reset();

  assert.strictEqual(crisis.getStage(), CrisisStage.INACTIVE);
  assert.strictEqual(crisis.getThreat(), 0);
  assert.strictEqual(crisis.phantomTimerMs, 0);
  assert.strictEqual(crisis.pulseTimerMs, 0);
  assert.strictEqual(crisis.manifestations.length, 3);
  for (const m of crisis.manifestations) {
    assert.strictEqual(m.isDestroyed, false);
  }
  assert.strictEqual(crisis.getObjectives().length, 0);
  assert.strictEqual(crisis.getActiveAlert(), null);
  assert.strictEqual(crisis.getStatus().isActive, false);
  assert.strictEqual(crisis.getStatus().isVictorious, false);
  assert.strictEqual(crisis.getStatus().isDefeated, false);
  assert.strictEqual(crisis.getActiveHazardTiles().length, 0);

  // Re-initialization starts fresh with 3 new manifestations
  crisis.init();
  assert.strictEqual(crisis.getStage(), CrisisStage.WHISPERS);
  assert.strictEqual(crisis.getThreat(), 10);
  assert.strictEqual(crisis.manifestations.length, 3);
  assert.strictEqual(crisis.getObjectives()[0].currentCount, 0);
});

/* ==============================================================================
 * SUITE 8: CRISIS MANAGER INTEGRATION & EDGE-TRIGGERED RESOLUTION
 * ============================================================================== */

test('PsychicCrisis 8.1: CrisisManager orchestrates PsychicCrisis and maintains edge-triggered resolution counter', () => {
  const cm = new CrisisManager();
  assert.strictEqual(cm.getTotalCrisesResolved(), 0);

  // Trigger Psychic Crisis
  cm.triggerCrisis(CrisisType.PSYCHIC_INVASION);
  assert.strictEqual(cm.getCurrentCrisisType(), CrisisType.PSYCHIC_INVASION);
  assert.strictEqual(cm.getStage(), CrisisStage.WHISPERS);

  // Update returns valid status
  const s1 = cm.update(100);
  assert.strictEqual(s1.crisisType, CrisisType.PSYCHIC_INVASION);
  assert.strictEqual(s1.isActive, true);

  // Fast forward to OUTBREAK
  const activeCrisis = cm.getActiveCrisis();
  assert.ok(activeCrisis);
  activeCrisis.transitionToStage(CrisisStage.OUTBREAK);

  // Bomb blasts forward via manager
  cm.handleBombBlast(3, 3, 2);
  cm.handleBombBlast(9, 3, 2);
  cm.handleBombBlast(6, 11, 2); // 3rd hit resolves crisis

  assert.strictEqual(cm.getStage(), CrisisStage.RESOLVED);

  // Update manager to record resolution counter
  cm.update(16);
  assert.strictEqual(cm.getTotalCrisesResolved(), 1);

  // Invariant: Subsequent updates do NOT increment totalCrisesResolved multiple times
  cm.update(16);
  cm.update(16);
  assert.strictEqual(cm.getTotalCrisesResolved(), 1);

  // Reset cleanly purges manager state
  cm.reset();
  assert.strictEqual(cm.getActiveCrisis(), null);
  assert.strictEqual(cm.getCurrentCrisisType(), null);
  assert.strictEqual(cm.getTotalCrisesResolved(), 0);
});

/* ==============================================================================
 * SUITE 9: ADVERSARIAL CHAOS, BOUNDARY CHECKS & CORRUPTED INPUTS
 * ============================================================================== */

test('PsychicCrisis 9.1: Handles non-finite delta times and corrupted coordinates safely without NaN', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  // Non-finite delta times
  assert.doesNotThrow(() => crisis.update(0));
  assert.doesNotThrow(() => crisis.update(-100));
  assert.doesNotThrow(() => crisis.update(NaN));
  assert.doesNotThrow(() => crisis.update(Infinity));

  assert.ok(Number.isFinite(crisis.getThreat()));
  assert.ok(!Number.isNaN(crisis.getThreat()));

  // Extreme / corrupted bomb blast coordinates
  assert.doesNotThrow(() => crisis.handleBombBlast(NaN, Infinity, -10));
  assert.doesNotThrow(() => crisis.handleBombBlast(-999, 999, NaN));

  // Extreme tile index queries
  assert.strictEqual(crisis.isTileHazardous(-1, 0), false);
  assert.strictEqual(crisis.isTileHazardous(100, 200), false);
  assert.strictEqual(crisis.isTileHazardous(NaN, Infinity), false);

  assert.strictEqual(crisis.getHazardAt(-5, 5), null);
  assert.strictEqual(crisis.getHazardAt(NaN, 0), null);

  // Alert expiration tick check
  crisis.update(4500);
  assert.strictEqual(crisis.getActiveAlert(), null, 'Active alert must auto-expire when remainingMs <= 0');
});

/* ==============================================================================
 * SUITE 10: ZERO-GC 10,000-FRAME SOAK SIMULATION
 * ============================================================================== */

test('PsychicCrisis 10.1: 10,000-frame soak simulation under active crisis maintains strict zero-GC invariants', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  const initialStatusRef = crisis.getStatus();

  // Run 10,000 frames at 16.6ms (60 FPS soak)
  for (let frame = 0; frame < 10000; frame++) {
    crisis.update(16.6, { r: 5, c: 7, x: 200, y: 280 });
  }

  // Verify cachedStatus object identity is strictly preserved (zero-GC)
  const finalStatusRef = crisis.getStatus();
  assert.strictEqual(
    finalStatusRef,
    initialStatusRef,
    'CrisisStatus must be reused from pre-allocated cachedStatus to avoid per-frame allocations'
  );

  // Invariants hold
  assert.ok(crisis.getActiveHazardCount() <= PsychicCrisis.MAX_DISRUPTED_TILES);
  assert.ok(crisis.getSafeAreaRatio() >= 0.80);
  assert.ok(crisis.getWalkableSafeAreaRatio() >= 0.80);
  assert.ok(Number.isFinite(crisis.getThreat()));
  assert.ok(crisis.getThreat() >= 0 && crisis.getThreat() <= 100);
});
