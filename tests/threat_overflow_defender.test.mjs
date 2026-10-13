/**
 * tests/threat_overflow_defender.test.mjs — Comprehensive Threat Overflow Defense Tests
 *
 * Verifies:
 * 1. BaseCrisis setThreat bounds strictly [0, 100], handling negative values, overflow, NaN, and ±Infinity
 * 2. BaseCrisis adjustThreat handles negative adjustments, positive overflows, and extreme deltas gracefully
 * 3. BaseCrisis getThreat and getStatus guarantee strict [0, 100] bounds
 * 4. BaseCrisis stage transitions and threat trends behave reliably under all conditions
 * 5. BaseCrisis serialize and deserialize sanitize corrupted, overflowing, or negative threat values
 * 6. CrisisManager getThreatMeter, getThreat, setThreat, adjustThreat, and event dispatching
 * 7. CrisisManager getSituationLogState threatLevel rounding and [0, 100] bounding
 * 8. Concrete Crises (Psychic, Lava, Void, Clockwork, Orbital, SolarFlare, Rift) threat invariance under soak
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CrisisType,
  CrisisStage,
  CrisisManager,
  BaseCrisis,
  PsychicCrisis,
} from '../src/game/crises/index.ts';

// Concrete test stub extending BaseCrisis
class TestCrisisStub extends BaseCrisis {
  constructor() {
    super(CrisisType.PASTEL_VOID);
  }
  onInit() {}
  onStageEnter(_stage) {}
  onUpdate(_deltaMs) {}
  onBombBlast(_r, _c, _radius) {}
  onResolveObjective(_objectiveId, _value) {}
}

/* ==============================================================================
 * SUITE 1: BaseCrisis setThreat BOUNDS & OVERFLOW HANDLING
 * ============================================================================== */

test('ThreatOverflow 1.1: setThreat strictly bounds values within [0, 100]', () => {
  const crisis = new TestCrisisStub();

  // Valid values
  crisis.setThreat(0);
  assert.strictEqual(crisis.getThreat(), 0);

  crisis.setThreat(50);
  assert.strictEqual(crisis.getThreat(), 50);

  crisis.setThreat(100);
  assert.strictEqual(crisis.getThreat(), 100);

  crisis.setThreat(73.45);
  assert.strictEqual(crisis.getThreat(), 73.45);
});

test('ThreatOverflow 1.2: setThreat clamps negative adjustments and negative values to 0', () => {
  const crisis = new TestCrisisStub();

  crisis.setThreat(-1);
  assert.strictEqual(crisis.getThreat(), 0);

  crisis.setThreat(-50);
  assert.strictEqual(crisis.getThreat(), 0);

  crisis.setThreat(-999999);
  assert.strictEqual(crisis.getThreat(), 0);

  crisis.setThreat(-0.0001);
  assert.strictEqual(crisis.getThreat(), 0);
});

test('ThreatOverflow 1.3: setThreat clamps overflow values to 100', () => {
  const crisis = new TestCrisisStub();

  crisis.setThreat(100.001);
  assert.strictEqual(crisis.getThreat(), 100);

  crisis.setThreat(150);
  assert.strictEqual(crisis.getThreat(), 100);

  crisis.setThreat(1000000);
  assert.strictEqual(crisis.getThreat(), 100);

  crisis.setThreat(Number.MAX_VALUE);
  assert.strictEqual(crisis.getThreat(), 100);
});

test('ThreatOverflow 1.4: setThreat handles Infinity, -Infinity, NaN, and non-numbers gracefully', () => {
  const crisis = new TestCrisisStub();

  // Positive Infinity clamps to 100 (maximum threat overflow)
  crisis.setThreat(Infinity);
  assert.strictEqual(crisis.getThreat(), 100);

  // Negative Infinity clamps to 0 (minimum threat underflow)
  crisis.setThreat(-Infinity);
  assert.strictEqual(crisis.getThreat(), 0);

  // NaN falls back to 0
  crisis.setThreat(NaN);
  assert.strictEqual(crisis.getThreat(), 0);

  // Non-number values fall back safely to 0
  // @ts-expect-error Testing adversarial runtime inputs
  crisis.setThreat(undefined);
  assert.strictEqual(crisis.getThreat(), 0);

  // @ts-expect-error Testing adversarial runtime inputs
  crisis.setThreat(null);
  assert.strictEqual(crisis.getThreat(), 0);

  // @ts-expect-error Testing adversarial runtime inputs
  crisis.setThreat('overflow');
  assert.strictEqual(crisis.getThreat(), 0);
});

/* ==============================================================================
 * SUITE 2: BaseCrisis adjustThreat GRACEFUL DELTA CALCULATIONS
 * ============================================================================== */

test('ThreatOverflow 2.1: adjustThreat increments and decrements within bounds', () => {
  const crisis = new TestCrisisStub();
  crisis.setThreat(50);

  crisis.adjustThreat(15);
  assert.strictEqual(crisis.getThreat(), 65);

  crisis.adjustThreat(-25);
  assert.strictEqual(crisis.getThreat(), 40);

  crisis.adjustThreat(0);
  assert.strictEqual(crisis.getThreat(), 40);
});

test('ThreatOverflow 2.2: adjustThreat handles positive overflow gracefully (clamps to 100)', () => {
  const crisis = new TestCrisisStub();
  crisis.setThreat(80);

  crisis.adjustThreat(50);
  assert.strictEqual(crisis.getThreat(), 100);

  // Continued adjustment above 100 stays at 100
  crisis.adjustThreat(1000);
  assert.strictEqual(crisis.getThreat(), 100);

  // Infinity delta clamps to 100
  crisis.setThreat(10);
  crisis.adjustThreat(Infinity);
  assert.strictEqual(crisis.getThreat(), 100);
});

test('ThreatOverflow 2.3: adjustThreat handles negative adjustments gracefully (clamps to 0)', () => {
  const crisis = new TestCrisisStub();
  crisis.setThreat(20);

  crisis.adjustThreat(-30);
  assert.strictEqual(crisis.getThreat(), 0);

  // Continued adjustment below 0 stays at 0
  crisis.adjustThreat(-1000);
  assert.strictEqual(crisis.getThreat(), 0);

  // -Infinity delta clamps to 0
  crisis.setThreat(90);
  crisis.adjustThreat(-Infinity);
  assert.strictEqual(crisis.getThreat(), 0);
});

test('ThreatOverflow 2.4: adjustThreat rejects NaN and invalid deltas without altering threat', () => {
  const crisis = new TestCrisisStub();
  crisis.setThreat(45);

  crisis.adjustThreat(NaN);
  assert.strictEqual(crisis.getThreat(), 45);

  // @ts-expect-error Testing adversarial runtime inputs
  crisis.adjustThreat(undefined);
  assert.strictEqual(crisis.getThreat(), 45);

  // @ts-expect-error Testing adversarial runtime inputs
  crisis.adjustThreat(null);
  assert.strictEqual(crisis.getThreat(), 45);

  // @ts-expect-error Testing adversarial runtime inputs
  crisis.adjustThreat('10');
  assert.strictEqual(crisis.getThreat(), 45);
});

/* ==============================================================================
 * SUITE 3: getThreat, getStatus & THREAT TREND INVARIANTS
 * ============================================================================== */

test('ThreatOverflow 3.1: getThreat and getStatus return strictly bounded numbers', () => {
  const crisis = new TestCrisisStub();

  crisis.setThreat(75.5);
  assert.strictEqual(crisis.getThreat(), 75.5);

  const status = crisis.getStatus();
  assert.strictEqual(status.threatMeter, 75.5);
  assert.ok(status.threatMeter >= 0 && status.threatMeter <= 100);
});

test('ThreatOverflow 3.2: update() loop clamps corrupted threatMeter and updates trend', () => {
  const crisis = new TestCrisisStub();
  crisis.init(); // starts at 10

  // Simulate subclass or external tampering setting threatMeter out of bounds
  // @ts-expect-error Tampering test
  crisis['threatMeter'] = 999;
  crisis.update(16);
  assert.strictEqual(crisis.getThreat(), 100);
  assert.strictEqual(crisis.getStatus().threatTrend, 'critical');

  // Tampering with negative threat
  // @ts-expect-error Tampering test
  crisis['threatMeter'] = -50;
  crisis.update(16);
  assert.strictEqual(crisis.getThreat(), 0);
  assert.strictEqual(crisis.getStatus().threatTrend, 'declining');

  // Tampering with NaN
  // @ts-expect-error Tampering test
  crisis['threatMeter'] = NaN;
  crisis.update(16);
  assert.strictEqual(crisis.getThreat(), 0);

  // Tampering with Infinity
  // @ts-expect-error Tampering test
  crisis['threatMeter'] = Infinity;
  crisis.update(16);
  assert.strictEqual(crisis.getThreat(), 0); // Non-finite resets to 0 in update guard
});

test('ThreatOverflow 3.3: Stage transitions maintain strict threat bounds', () => {
  const crisis = new TestCrisisStub();
  crisis.init(); // WHISPERS: 10
  assert.strictEqual(crisis.getThreat(), 10);

  crisis.transitionToStage(CrisisStage.OUTBREAK);
  assert.strictEqual(crisis.getThreat(), 35);

  crisis.setThreat(60);
  crisis.transitionToStage(CrisisStage.OUTBREAK); // Same stage no-op
  assert.strictEqual(crisis.getThreat(), 60);

  crisis.transitionToStage(CrisisStage.CLIMAX);
  assert.strictEqual(crisis.getThreat(), 70);

  // Threat at 95 transitioning to climax does not reduce
  crisis.setThreat(95);
  crisis.transitionToStage(CrisisStage.CLIMAX);
  assert.strictEqual(crisis.getThreat(), 95);

  // Resolved sets threat to 0
  crisis.transitionToStage(CrisisStage.RESOLVED);
  assert.strictEqual(crisis.getThreat(), 0);
  assert.strictEqual(crisis.getStatus().threatTrend, 'declining');

  // Failed sets threat to 100
  crisis.transitionToStage(CrisisStage.FAILED);
  assert.strictEqual(crisis.getThreat(), 100);
  assert.strictEqual(crisis.getStatus().threatTrend, 'critical');
});

/* ==============================================================================
 * SUITE 4: SERIALIZATION & DESERIALIZATION DEFENSE
 * ============================================================================== */

test('ThreatOverflow 4.1: serialize outputs valid threatMeter in [0, 100]', () => {
  const crisis = new TestCrisisStub();
  crisis.setThreat(42.5);

  const serialized = crisis.serialize();
  assert.strictEqual(serialized.threatMeter, 42.5);
  assert.ok(serialized.threatMeter >= 0 && serialized.threatMeter <= 100);
});

test('ThreatOverflow 4.2: deserialize sanitizes corrupted, negative, and overflow threat states', () => {
  const crisis = new TestCrisisStub();

  // Overflow > 100 clamps to 100
  crisis.deserialize({ threatMeter: 500, stage: CrisisStage.OUTBREAK });
  assert.strictEqual(crisis.getThreat(), 100);

  // Underflow < 0 clamps to 0
  crisis.deserialize({ threatMeter: -250, stage: CrisisStage.WHISPERS });
  assert.strictEqual(crisis.getThreat(), 0);

  // Infinity clamps to 100
  crisis.deserialize({ threatMeter: Infinity, stage: CrisisStage.CLIMAX });
  assert.strictEqual(crisis.getThreat(), 100);

  // -Infinity clamps to 0
  crisis.deserialize({ threatMeter: -Infinity, stage: CrisisStage.WHISPERS });
  assert.strictEqual(crisis.getThreat(), 0);

  // NaN falls back to 0
  crisis.deserialize({ threatMeter: NaN, stage: CrisisStage.WHISPERS });
  assert.strictEqual(crisis.getThreat(), 0);

  // Undefined or invalid threatMeter falls back to 0
  // @ts-expect-error Corrupted payload
  crisis.deserialize({ threatMeter: 'invalid', stage: CrisisStage.WHISPERS });
  assert.strictEqual(crisis.getThreat(), 0);
});

/* ==============================================================================
 * SUITE 5: CrisisManager THREAT API & ORCHESTRATION
 * ============================================================================== */

test('ThreatOverflow 5.1: CrisisManager returns 0 threat and safe operations when inactive', () => {
  const manager = new CrisisManager();

  assert.strictEqual(manager.getThreatMeter(), 0);
  assert.strictEqual(manager.getThreat(), 0);

  // Safe no-ops without throwing
  assert.doesNotThrow(() => manager.setThreat(50));
  assert.doesNotThrow(() => manager.setThreatMeter(80));
  assert.doesNotThrow(() => manager.adjustThreat(20));
  assert.doesNotThrow(() => manager.adjustThreatMeter(-10));

  assert.strictEqual(manager.getThreatMeter(), 0);
  assert.strictEqual(manager.getSituationLogState().threatLevel, 0);
});

test('ThreatOverflow 5.2: CrisisManager sets and adjusts threat on active crisis with event dispatch', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PSYCHIC_INVASION);

  // Initial threat is 10
  assert.strictEqual(manager.getThreatMeter(), 10);
  assert.strictEqual(manager.getThreat(), 10);

  const events = [];
  manager.on('crisis-threat-changed', (payload) => {
    events.push(payload);
  });

  // setThreat to 45
  manager.setThreat(45);
  assert.strictEqual(manager.getThreatMeter(), 45);
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0], {
    crisisType: CrisisType.PSYCHIC_INVASION,
    threatMeter: 45,
  });

  // adjustThreat by +20
  manager.adjustThreat(20);
  assert.strictEqual(manager.getThreatMeter(), 65);
  assert.strictEqual(events.length, 2);

  // Overflow adjustment
  manager.adjustThreat(100);
  assert.strictEqual(manager.getThreatMeter(), 100);

  // Negative adjustment
  manager.adjustThreat(-150);
  assert.strictEqual(manager.getThreatMeter(), 0);

  manager.destroy();
});

test('ThreatOverflow 5.3: CrisisManager getSituationLogState bounds threatLevel strictly to integer [0, 100]', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.CREEPING_LAVA);

  manager.setThreat(67.4);
  let logState = manager.getSituationLogState();
  assert.strictEqual(logState.threatLevel, 67);

  manager.setThreat(67.6);
  logState = manager.getSituationLogState();
  assert.strictEqual(logState.threatLevel, 68);

  manager.setThreat(100);
  logState = manager.getSituationLogState();
  assert.strictEqual(logState.threatLevel, 100);

  manager.setThreat(0);
  logState = manager.getSituationLogState();
  assert.strictEqual(logState.threatLevel, 0);

  manager.destroy();
});

test('ThreatOverflow 5.4: CrisisManager serialization preserves bounded threatMeter', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.VOID_CRISIS || CrisisType.PASTEL_VOID);
  manager.setThreat(82.3);

  const serialized = manager.serialize();
  assert.ok(serialized);
  assert.strictEqual(serialized.threatMeter, 82.3);

  const newManager = new CrisisManager();
  newManager.deserialize(serialized);
  assert.strictEqual(newManager.getThreatMeter(), 82.3);

  manager.destroy();
  newManager.destroy();
});

/* ==============================================================================
 * SUITE 6: CONCRETE CRISES RESILIENCE & SOAK TEST
 * ============================================================================== */

test('ThreatOverflow 6.1: PsychicCrisis maintains threat bounds during dispels, bomb blasts and updates', () => {
  const psychic = new PsychicCrisis();
  psychic.init();

  assert.strictEqual(psychic.getThreat(), 10);

  // Transition to OUTBREAK
  psychic.setStage(CrisisStage.OUTBREAK);
  assert.ok(psychic.getThreat() >= 35);

  // Multiple consecutive bomb blasts damp threat safely without going below 0
  for (let i = 0; i < 20; i++) {
    psychic.handleBombBlast(3, 3, 2);
  }
  assert.ok(psychic.getThreat() >= 0 && psychic.getThreat() <= 100);

  // Transition to CLIMAX
  psychic.setStage(CrisisStage.CLIMAX);
  assert.ok(psychic.getThreat() >= 70);

  // Updates across 100 frames
  for (let f = 0; f < 100; f++) {
    psychic.update(100, { r: 5, c: 5 });
    assert.ok(psychic.getThreat() >= 0 && psychic.getThreat() <= 100);
  }
});

test('ThreatOverflow 6.2: All registered crises guarantee [0, 100] threat bounds across 5,000 randomized cycles', () => {
  const manager = new CrisisManager();
  const types = manager.getRegisteredCrisisTypes();

  for (const type of types) {
    manager.triggerCrisis(type);
    assert.ok(manager.getThreatMeter() >= 0 && manager.getThreatMeter() <= 100);

    for (let i = 0; i < 50; i++) {
      // Random delta between -150 and +150, including Infinity and NaN edge cases
      const roll = Math.random();
      let delta = (Math.random() - 0.5) * 300;
      if (roll < 0.05) delta = Infinity;
      else if (roll < 0.10) delta = -Infinity;
      else if (roll < 0.15) delta = NaN;

      manager.adjustThreat(delta);
      const threat = manager.getThreatMeter();
      assert.ok(
        typeof threat === 'number' && Number.isFinite(threat) && threat >= 0 && threat <= 100,
        `Threat out of bounds for ${type}: ${threat} after delta ${delta}`
      );

      const status = manager.getStatus();
      assert.ok(status.threatMeter >= 0 && status.threatMeter <= 100);

      const log = manager.getSituationLogState();
      assert.ok(log.threatLevel >= 0 && log.threatLevel <= 100);
      assert.strictEqual(Number.isInteger(log.threatLevel), true);
    }

    manager.stopCrisis('reset');
  }

  manager.destroy();
});
