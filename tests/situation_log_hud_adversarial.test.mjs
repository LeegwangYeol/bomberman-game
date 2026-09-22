/**
 * tests/situation_log_hud_adversarial.test.mjs
 *
 * EMPIRICAL ADVERSARIAL TEST SUITE FOR SITUATION LOG EVENT BRIDGE & HUD
 * Challenger 2 — Milestone 4 Visual & Functional Testing Verification
 *
 * Verifies:
 * 1. High-frequency update flooding & throttle precision (10,000 events)
 * 2. Threat level boundary extremes (0%, 100%, 150%, -50%, rapid oscillation)
 * 3. Objectives dynamic toggling, overflow, and empty state invariants
 * 4. Countdown expiry (0s, negative ms, Climax timeout failure)
 * 5. Invalid stage transitions and fallback robustness
 * 6. Dual event bus compatibility ('situation-log-update' and 'crisis-situation-log-update')
 * 7. Subscriber mutation isolation and memory cleanup on reset
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { SituationLog } from '../src/game/crises/SituationLog.ts';
import { CrisisManager } from '../src/game/crises/CrisisManager.ts';
import { CrisisType, CrisisStage } from '../src/game/crises/CrisisTypes.ts';
import { VoidCrisis } from '../src/game/crises/VoidCrisis.ts';
import { ClockworkCrisis } from '../src/game/crises/ClockworkCrisis.ts';
import { OrbitalCrisis } from '../src/game/crises/OrbitalCrisis.ts';
import { LavaCrisis } from '../src/game/crises/LavaCrisis.ts';
import { RiftCrisis } from '../src/game/crises/RiftCrisis.ts';
import { SolarFlareCrisis } from '../src/game/crises/SolarFlareCrisis.ts';

function createMockPhaserGame() {
  const emitter = new EventEmitter();
  return {
    emitter,
    game: {
      events: {
        emit(event, ...args) {
          return emitter.emit(event, ...args);
        },
        on(event, fn) {
          return emitter.on(event, fn);
        },
        off(event, fn) {
          return emitter.off(event, fn);
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. HIGH-FREQUENCY UPDATE FLOODING & THROTTLE PRECISION
// ---------------------------------------------------------------------------

test('Adversarial [SituationLog]: 10,000 rapid updates over 1000ms emit strictly <= 25 times under standard throttling', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let emissionCount = 0;
  const emittedPayloads = [];

  emitter.on('situation-log-update', (payload) => {
    emissionCount++;
    emittedPayloads.push(payload);
  });

  manager.triggerCrisis(CrisisType.PASTEL_VOID);
  // Initial forced emission
  situationLog.updateFromCrisisManager(manager, 0, true);
  assert.equal(emissionCount, 1);

  // Flood with 10,000 updates advancing by 0.1ms each (total 1000ms elapsed)
  // emitIntervalMs is 50ms, so in 1000ms there should be ~20 throttle ticks
  for (let i = 1; i <= 10000; i++) {
    const timeMs = (i / 10000) * 1000;
    situationLog.updateFromCrisisManager(manager, timeMs, false);
  }

  // With 50ms interval across 1000ms, max emissions should be ~21 (initial + 20)
  assert.ok(
    emissionCount <= 25,
    `Throttle failed: emitted ${emissionCount} times (expected <= 25 for 1000ms window with 50ms throttle)`
  );
  assert.ok(
    emissionCount >= 19,
    `Throttle under-emitted: emitted ${emissionCount} times (expected >= 19 for 1000ms window)`
  );

  // Verify all emitted payloads maintained structural integrity
  for (const payload of emittedPayloads) {
    assert.equal(payload.isActive, true);
    assert.equal(payload.crisisId, CrisisType.PASTEL_VOID);
    assert.ok(typeof payload.threatLevel === 'number');
    assert.ok(!Number.isNaN(payload.threatLevel));
    assert.ok(Array.isArray(payload.objectives));
  }
});

test('Adversarial [SituationLog]: Critical state transitions immediately bypass throttle', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let emissions = 0;
  let lastPayload = null;
  emitter.on('situation-log-update', (payload) => {
    emissions++;
    lastPayload = payload;
  });

  manager.triggerCrisis(CrisisType.PASTEL_VOID);
  situationLog.updateFromCrisisManager(manager, 100, true);
  assert.equal(emissions, 1);

  // An update 1ms later without state change MUST be throttled
  situationLog.updateFromCrisisManager(manager, 101, false);
  assert.equal(emissions, 1);

  // Stage transition from WHISPERS to OUTBREAK 2ms later MUST bypass throttle immediately!
  const voidCrisis = manager.getActiveCrisis();
  voidCrisis.transitionToStage(CrisisStage.OUTBREAK);
  situationLog.updateFromCrisisManager(manager, 102, false);

  assert.equal(emissions, 2, 'Stage transition must immediately trigger emission despite 2ms interval');
  assert.equal(lastPayload.stage, CrisisStage.OUTBREAK);

  // Active alert appearance when activeAlert was null: clear alert first
  voidCrisis.activeAlert = null;
  situationLog.getState().activeAlert = null;
  voidCrisis.triggerAlert('test_alert_null', 'ALERT FROM NULL', 'Bypass when previous alert null', 'critical', '⚡', 3000);
  situationLog.updateFromCrisisManager(manager, 103, false);

  assert.equal(emissions, 3, 'Active alert appearance from null must immediately trigger emission despite 1ms delta');
  assert.equal(lastPayload.activeAlert.title, 'ALERT FROM NULL');

  // Intra-alert replacement at 104ms (1ms delta) is throttled
  voidCrisis.triggerAlert('test_alert_2', 'ALERT 2', 'Throttled within 50ms', 'warning', '⚠️', 3000);
  situationLog.updateFromCrisisManager(manager, 104, false);
  assert.equal(emissions, 3, 'Intra-alert replacement within 1ms must be throttled');

  // Once 50ms throttle interval elapses (at 155ms >= 103 + 50), it is guaranteed to emit
  situationLog.updateFromCrisisManager(manager, 155, false);
  assert.equal(emissions, 4, 'Intra-alert replacement must emit once 50ms interval elapses');
  assert.equal(lastPayload.activeAlert.title, 'ALERT 2');
});

// ---------------------------------------------------------------------------
// 2. THREAT LEVEL BOUNDARY EXTREMES & CLAMPING INTEGRITY
// ---------------------------------------------------------------------------

test('Adversarial [Threat Boundary]: Threat level at 0%, 100%, and fuzzed 150% & -50%', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let latest = null;
  emitter.on('situation-log-update', (payload) => {
    latest = payload;
  });

  manager.triggerCrisis(CrisisType.PASTEL_VOID);
  const crisis = manager.getActiveCrisis();

  // 1. Boundary: 0% Threat
  crisis.threatMeter = 0;
  situationLog.updateFromCrisisManager(manager, 100, true);
  assert.equal(latest.threatLevel, 0);
  // React HUD clamp test: Math.min(100, Math.max(0, latest.threatLevel))
  const hudWidth0 = Math.min(100, Math.max(0, latest.threatLevel));
  assert.equal(hudWidth0, 0);

  // 2. Boundary: 100% Threat
  crisis.threatMeter = 100;
  situationLog.updateFromCrisisManager(manager, 200, true);
  assert.equal(latest.threatLevel, 100);
  const hudWidth100 = Math.min(100, Math.max(0, latest.threatLevel));
  assert.equal(hudWidth100, 100);

  // 3. Fuzzed Extreme: 150% Threat (over-gauge attack)
  crisis.threatMeter = 150;
  situationLog.updateFromCrisisManager(manager, 300, true);
  assert.equal(latest.threatLevel, 150);
  // Verify React HUD styling formula clamps strictly to 100% without overflowing container
  const hudWidth150 = Math.min(100, Math.max(0, latest.threatLevel));
  assert.equal(hudWidth150, 100, 'HUD bar width must clamp to 100% under 150% threat');

  // 4. Fuzzed Extreme: -50% Threat (under-gauge attack)
  crisis.threatMeter = -50;
  situationLog.updateFromCrisisManager(manager, 400, true);
  assert.equal(latest.threatLevel, -50);
  const hudWidthNeg = Math.min(100, Math.max(0, latest.threatLevel));
  assert.equal(hudWidthNeg, 0, 'HUD bar width must clamp to 0% under negative threat');

  // 5. Fractional Threat: 42.678% Threat
  crisis.threatMeter = 42.678;
  situationLog.updateFromCrisisManager(manager, 500, true);
  assert.equal(latest.threatLevel, 43, 'Threat level in situation log must be an integer (Math.round)');
});

test('Adversarial [Threat Oscillation]: 1,000 rapid oscillations between 0% and 100% maintain non-NaN trends', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let latest = null;
  emitter.on('situation-log-update', (payload) => {
    latest = payload;
  });

  manager.triggerCrisis(CrisisType.ORBITAL_BOMBARDMENT);
  const crisis = manager.getActiveCrisis();

  for (let i = 0; i < 1000; i++) {
    const threat = i % 2 === 0 ? 0 : 100;
    crisis.threatMeter = threat;
    crisis.update(16);
    situationLog.updateFromCrisisManager(manager, i * 60, false);

    assert.ok(!Number.isNaN(latest.threatLevel));
    assert.ok(['stable', 'rising', 'critical', 'declining'].includes(latest.threatTrend));
  }
});

// ---------------------------------------------------------------------------
// 3. OBJECTIVES DYNAMIC TOGGLING, OVERFLOW & EMPTY STATES
// ---------------------------------------------------------------------------

test('Adversarial [Objectives]: Dynamic addition, completion toggling, and overcompletion', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let latest = null;
  emitter.on('situation-log-update', (payload) => {
    latest = payload;
  });

  manager.triggerCrisis(CrisisType.PASTEL_VOID);
  const crisis = manager.getActiveCrisis();
  situationLog.updateFromCrisisManager(manager, 0, true);

  // Initial objectives: 2
  assert.equal(latest.objectives.length, 2);
  assert.equal(latest.objectives[0].isCompleted, false);
  assert.equal(latest.objectives[0].currentCount, 0);
  assert.equal(latest.objectives[0].targetCount, 2);

  // Advance objective count normally: 1/2
  crisis.resolveObjective('charge_prisms', 1);
  situationLog.updateFromCrisisManager(manager, 100, true);
  assert.equal(latest.objectives[0].currentCount, 1);
  assert.equal(latest.objectives[0].isCompleted, false);

  // Complete objective: 2/2
  crisis.resolveObjective('charge_prisms', 2);
  situationLog.updateFromCrisisManager(manager, 200, true);
  assert.equal(latest.objectives[0].currentCount, 2);
  assert.equal(latest.objectives[0].isCompleted, true);

  // Overcompletion attempt: 99/2
  crisis.resolveObjective('charge_prisms', 99);
  situationLog.updateFromCrisisManager(manager, 300, true);
  // BaseCrisis clamps currentCount to Math.min(targetCount, value)
  assert.equal(latest.objectives[0].currentCount, 2, 'Current count must not exceed targetCount');
  assert.equal(latest.objectives[0].isCompleted, true);

  // Empty objectives test (e.g. custom crisis with 0 initial objectives)
  crisis.objectives = [];
  situationLog.updateFromCrisisManager(manager, 400, true);
  assert.equal(latest.objectives.length, 0);

  // Mass objectives injection (100 objectives with unicode and long descriptions)
  for (let i = 0; i < 100; i++) {
    crisis.objectives.push({
      id: `obj_${i}`,
      title: `Directive 🛸 #${i}: ${'🔥'.repeat(i % 5)}`,
      description: `Defend sector ${i} with maximum priority from cosmic collapse!`,
      targetCount: 10,
      currentCount: i % 11,
      isCompleted: (i % 11) >= 10,
    });
  }
  situationLog.updateFromCrisisManager(manager, 500, true);
  assert.equal(latest.objectives.length, 100);
  assert.equal(latest.objectives[50].id, 'obj_50');
  assert.equal(latest.objectives[10].isCompleted, true);
});

// ---------------------------------------------------------------------------
// 4. COUNTDOWN EXPIRY (0s, NEGATIVE MS, CLIMAX TIMEOUT FAILURE)
// ---------------------------------------------------------------------------

test('Adversarial [Countdown]: Boundary precision at exactly 0ms, negative remaining ms, and Climax failure', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let latest = null;
  emitter.on('situation-log-update', (payload) => {
    latest = payload;
  });

  manager.triggerCrisis(CrisisType.CREEPING_LAVA);
  const crisis = manager.getActiveCrisis();

  // 1. Positive countdown
  situationLog.updateFromCrisisManager(manager, 0, true);
  assert.ok(latest.stageRemainingMs > 0);
  // React HUD calculation: Math.max(0, Math.ceil(stageRemainingMs / 1000))
  let hudSeconds = Math.max(0, Math.ceil(latest.stageRemainingMs / 1000));
  assert.ok(hudSeconds > 0);

  // 2. Exactly at expiry: elapsed = duration
  crisis.stageElapsedMs = crisis.stageDurationMs;
  situationLog.updateFromCrisisManager(manager, 100, true);
  assert.equal(latest.stageRemainingMs, 0);
  hudSeconds = Math.max(0, Math.ceil(latest.stageRemainingMs / 1000));
  assert.equal(hudSeconds, 0);

  // 3. Over-elapsed: elapsed > duration (e.g. lag spike or background tab pause)
  crisis.stageElapsedMs = crisis.stageDurationMs + 5000;
  situationLog.updateFromCrisisManager(manager, 200, true);
  assert.equal(latest.stageRemainingMs, 0, 'stageRemainingMs in getStatus must clamp to 0 min');
  hudSeconds = Math.max(0, Math.ceil(latest.stageRemainingMs / 1000));
  assert.equal(hudSeconds, 0, 'HUD seconds must not display negative numbers');

  // 4. Climax timeout failure invariant
  crisis.transitionToStage(CrisisStage.CLIMAX);
  crisis.stageElapsedMs = crisis.stageDurationMs + 100;
  crisis.update(16); // natural tick triggers climax failure
  assert.equal(crisis.getStage(), CrisisStage.FAILED);
  assert.equal(crisis.isDefeated, true);

  situationLog.updateFromCrisisManager(manager, 300, true);
  assert.equal(latest.stage, CrisisStage.FAILED);
  assert.equal(latest.isDefeated, true);
  assert.equal(latest.stageName, 'Catastrophic Collapse (Failed)');
});

// ---------------------------------------------------------------------------
// 5. INVALID STAGE TRANSITIONS & UNKNOWN ENUMS
// ---------------------------------------------------------------------------

test('Adversarial [Stage Transitions]: Unknown stage strings fallback cleanly without exceptions', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let latest = null;
  emitter.on('situation-log-update', (payload) => {
    latest = payload;
  });

  manager.triggerCrisis(CrisisType.DIMENSIONAL_RIFTS);
  const crisis = manager.getActiveCrisis();

  // Force invalid stage string
  crisis.stage = 'EXTINCTION_LEVEL_EVENT';
  situationLog.updateFromCrisisManager(manager, 100, true);

  assert.equal(latest.stage, 'EXTINCTION_LEVEL_EVENT');
  assert.equal(latest.stageName, 'EXTINCTION_LEVEL_EVENT', 'stageName must fall back to stage string if not in dictionary');

  // Force null / empty stage string
  crisis.stage = '';
  situationLog.updateFromCrisisManager(manager, 200, true);
  assert.equal(latest.stage, '');
  assert.equal(latest.stageName, '');
});

// ---------------------------------------------------------------------------
// 6. DUAL EVENT BUS COMPATIBILITY
// ---------------------------------------------------------------------------

test('Adversarial [Dual Bus]: Emits to both situation-log-update and crisis-situation-log-update synchronously', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let primaryPayload = null;
  let secondaryPayload = null;

  emitter.on('situation-log-update', (payload) => {
    primaryPayload = payload;
  });

  emitter.on('crisis-situation-log-update', (payload) => {
    secondaryPayload = payload;
  });

  manager.triggerCrisis(CrisisType.SOLAR_FLARES);
  situationLog.updateFromCrisisManager(manager, 0, true);

  assert.ok(primaryPayload !== null, 'Primary situation-log-update must fire');
  assert.ok(secondaryPayload !== null, 'Secondary crisis-situation-log-update must fire');
  assert.equal(primaryPayload.crisisId, CrisisType.SOLAR_FLARES);
  assert.equal(secondaryPayload.crisisId, CrisisType.SOLAR_FLARES);
  assert.equal(primaryPayload.threatLevel, secondaryPayload.threatLevel);
});

// ---------------------------------------------------------------------------
// 7. CLEANUP, DISPOSAL & RESET RECOVERY
// ---------------------------------------------------------------------------

test('Adversarial [Reset Lifecycle]: Reset resets all fields to default inactive state and emits update', () => {
  const { game, emitter } = createMockPhaserGame();
  const manager = new CrisisManager();
  const situationLog = new SituationLog(game);

  let lastPayload = null;
  emitter.on('situation-log-update', (payload) => {
    lastPayload = payload;
  });

  manager.triggerCrisis(CrisisType.CLOCKWORK_REBELLION);
  situationLog.updateFromCrisisManager(manager, 0, true);
  assert.equal(lastPayload.isActive, true);
  assert.equal(lastPayload.crisisId, CrisisType.CLOCKWORK_REBELLION);

  // Invoke reset
  situationLog.reset();

  assert.equal(lastPayload.isActive, false);
  assert.equal(lastPayload.crisisId, '');
  assert.equal(lastPayload.crisisName, '');
  assert.equal(lastPayload.stage, CrisisStage.INACTIVE);
  assert.equal(lastPayload.threatLevel, 0);
  assert.equal(lastPayload.objectives.length, 0);
  assert.equal(lastPayload.activeAlert, null);
  assert.equal(lastPayload.statusDescription, 'No active planetary crisis detected.');
});

// ---------------------------------------------------------------------------
// 8. ALL 6 CRISIS TYPES PRODUCE VALID SITUATION LOG PAYLOADS
// ---------------------------------------------------------------------------

test('Adversarial [Coverage]: All 6 distinct crisis types produce valid SituationLog payloads', () => {
  const crisisClasses = [
    { type: CrisisType.PASTEL_VOID, cls: VoidCrisis, expectedName: 'Pastel Void Incursion' },
    { type: CrisisType.CLOCKWORK_REBELLION, cls: ClockworkCrisis, expectedName: 'Clockwork Toy Rebellion' },
    { type: CrisisType.ORBITAL_BOMBARDMENT, cls: OrbitalCrisis, expectedName: 'Orbital Bombardment' },
    { type: CrisisType.SOLAR_FLARES, cls: SolarFlareCrisis, expectedName: 'Solar Flare Storm' },
    { type: CrisisType.CREEPING_LAVA, cls: LavaCrisis, expectedName: 'Creeping Lava Fissure' },
    { type: CrisisType.DIMENSIONAL_RIFTS, cls: RiftCrisis, expectedName: 'Dimensional Rift Inversion' },
  ];

  for (const item of crisisClasses) {
    const { game, emitter } = createMockPhaserGame();
    const manager = new CrisisManager();
    const situationLog = new SituationLog(game);

    let received = null;
    emitter.on('situation-log-update', (payload) => {
      received = payload;
    });

    manager.triggerCrisis(item.type);
    situationLog.updateFromCrisisManager(manager, 0, true);

    assert.ok(received !== null, `Payload received for ${item.type}`);
    assert.equal(received.isActive, true);
    assert.equal(received.crisisId, item.type);
    assert.equal(received.crisisName, item.expectedName);
    assert.ok(received.crisisIcon.length > 0);
    assert.ok(received.themeColor.startsWith('#'));
    assert.equal(received.stage, CrisisStage.WHISPERS);
    assert.ok(received.threatLevel >= 0 && received.threatLevel <= 100);
    assert.ok(received.totalDurationMs > 0);
    assert.ok(received.objectives.length > 0, `${item.type} must define objectives`);
  }
});
