import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiTouchPointerTracker, createDefaultMobileInputState, resolveJoystickVector, resolveContradictoryDirections } from '../src/game/input_state.ts';
import { MutantFloraBoss, BossState } from '../src/game/bosses/index.ts';
import { PsychicCrisis, CrisisManager, CrisisType, CrisisStage, CRISIS_DEFINITIONS } from '../src/game/crises/index.ts';
import { ObjectPool } from '../src/game/pooling/ObjectPool.ts';

/* ==============================================================================
 * TIER 1: MUTANT FLORA BOSS TESTS
 * ============================================================================== */

test('MutantFloraBoss: constructor sets correct default properties and config', () => {
  const boss = new MutantFloraBoss(320, 240);
  assert.equal(boss.id, 'boss_mutant_flora');
  assert.equal(boss.name, 'Verdant Terror');
  assert.equal(boss.maxHp, 15);
  assert.equal(boss.currentHp, 15);
  assert.equal(boss.x, 320);
  assert.equal(boss.y, 240);
  assert.equal(boss.activeRoots, 0);
  assert.equal(boss.bossState, BossState.INTRO);
  assert.equal(boss.isInvulnerable, true);
});

test('MutantFloraBoss: canTakeDamage obeys state and invulnerability invariants', () => {
  const boss = new MutantFloraBoss();
  // In INTRO: immune to damage
  assert.equal(boss.canTakeDamage(), false);
  assert.equal(boss.takeBombDamage(1), false);

  // Advance past intro
  boss.update(1600); // Exit intro -> PHASE_1
  assert.equal(boss.bossState, BossState.PHASE_1);
  assert.equal(boss.canTakeDamage(), true);

  // Transition to INTERMISSION: immune
  boss.transitionTo(BossState.INTERMISSION);
  assert.equal(boss.canTakeDamage(), false);
  assert.equal(boss.takeBombDamage(1), false);
});

test('MutantFloraBoss: Phase 1 updates speed and root timer spawning roots', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600); // Exit intro -> PHASE_1
  assert.equal(boss.currentSpeed, 50);

  const initialRoots = boss.activeRoots;
  // Advance time by 4500ms -> should spawn root
  boss.update(4500, 300, 260);
  assert.ok(boss.activeRoots > initialRoots);
});

test('MutantFloraBoss: Phase 2 scales speed by 1.5x and pollen timer updates', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600);
  boss.transitionTo(BossState.PHASE_2);
  boss.update(100, 200, 200);

  assert.equal(boss.currentSpeed, 75); // 50 * 1.5
});

test('MutantFloraBoss: Enraged phase scales speed by 2.0x', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600);
  boss.transitionTo(BossState.ENRAGED);
  boss.update(100, 200, 200);

  assert.equal(boss.currentSpeed, 100); // 50 * 2.0
});

test('MutantFloraBoss: onHitReceived spawns defensive roots', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600); // Exit intro -> PHASE_1
  const initialRoots = boss.activeRoots;

  const hit = boss.takeBombDamage(2);
  assert.equal(hit, true);
  // Combo window processes hit when resolved
  boss.update(200);
  assert.ok(boss.activeRoots > initialRoots);
});

test('MutantFloraBoss: onStateChanged clears active roots on INTERMISSION', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600);
  boss.activeRoots = 5;

  boss.transitionTo(BossState.INTERMISSION);
  assert.equal(boss.activeRoots, 0);
});

test('MutantFloraBoss: onDefeated clears active roots', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600);
  boss.activeRoots = 7;

  boss.transitionTo(BossState.DEFEATED);
  assert.equal(boss.activeRoots, 0);
});

test('MutantFloraBoss: combo hit processing applies damage and stun', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600); // In PHASE_1
  assert.equal(boss.currentHp, 15);

  // Hit with 3 combo bombs within window
  boss.takeBombDamage(1);
  boss.takeBombDamage(1);
  boss.takeBombDamage(1);

  // Advance past combo buffer window (150ms)
  boss.update(200);
  assert.equal(boss.currentHp, 12);
  assert.equal(boss.bossState, BossState.STUNNED);
  assert.ok(boss.stunTimerMs > 0);
});

test('MutantFloraBoss: handles NaN and Infinity player coordinates safely', () => {
  const boss = new MutantFloraBoss();
  boss.update(1600);

  // Should not crash or produce NaN
  assert.doesNotThrow(() => {
    boss.update(16, NaN, Infinity);
  });
  assert.ok(Number.isFinite(boss.x));
  assert.ok(Number.isFinite(boss.y));
  assert.ok(Number.isFinite(boss.currentSpeed));
});

/* ==============================================================================
 * TIER 2: PSYCHIC INVASION CRISIS TESTS
 * ============================================================================== */

test('PsychicCrisis: registers in CRISIS_DEFINITIONS with valid metadata', () => {
  const def = CRISIS_DEFINITIONS[CrisisType.PSYCHIC_INVASION];
  assert.ok(def);
  assert.equal(def.id, CrisisType.PSYCHIC_INVASION);
  assert.equal(def.name, 'Psychic Entity Invasion');
  assert.equal(def.themeColor, '#EC4899');
  assert.ok(def.stageDurations[CrisisStage.WHISPERS] > 0);
  assert.ok(def.stageDurations[CrisisStage.OUTBREAK] > 0);
  assert.ok(def.stageDurations[CrisisStage.CLIMAX] > 0);
});

test('PsychicCrisis: initializes with resist_psionics objective', () => {
  const crisis = new PsychicCrisis();
  assert.equal(crisis.id, CrisisType.PSYCHIC_INVASION);
  assert.equal(crisis.getStage(), CrisisStage.INACTIVE);

  crisis.init();
  const status = crisis.getStatus();
  assert.equal(status.objectives.length, 1);
  assert.equal(status.objectives[0].id, 'resist_psionics');
  assert.equal(status.objectives[0].targetCount, 3);
  assert.equal(status.objectives[0].currentCount, 0);
  assert.equal(status.objectives[0].isCompleted, false);
});

test('PsychicCrisis: stage transitions trigger alerts for WHISPERS, OUTBREAK, CLIMAX', () => {
  const crisis = new PsychicCrisis();
  crisis.init();

  crisis.transitionToStage(CrisisStage.WHISPERS);
  let status = crisis.getStatus();
  assert.ok(status.activeAlert);
  assert.equal(status.activeAlert?.id, 'psychic_whispers');

  crisis.transitionToStage(CrisisStage.OUTBREAK);
  status = crisis.getStatus();
  assert.ok(status.activeAlert);
  assert.equal(status.activeAlert?.id, 'psychic_outbreak');

  crisis.transitionToStage(CrisisStage.CLIMAX);
  status = crisis.getStatus();
  assert.ok(status.activeAlert);
  assert.equal(status.activeAlert?.id, 'psychic_climax');
});

test('PsychicCrisis: onUpdate increases threatMeter in OUTBREAK and CLIMAX', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  const initialThreat = crisis.getThreat();
  assert.ok(initialThreat >= 35);

  crisis.update(5100);
  assert.ok(crisis.getThreat() > initialThreat);

  const midThreat = crisis.getThreat();
  crisis.update(5100);
  assert.ok(crisis.getThreat() > midThreat);
});

test('PsychicCrisis: handleBombBlast progresses resist_psionics objective in OUTBREAK', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);

  crisis.handleBombBlast(5, 5, 2);
  let status = crisis.getStatus();
  assert.equal(status.objectives[0].currentCount, 1);

  crisis.handleBombBlast(6, 6, 2);
  status = crisis.getStatus();
  assert.equal(status.objectives[0].currentCount, 2);

  // 3rd hit completes objective and resolves crisis
  crisis.handleBombBlast(7, 7, 2);
  status = crisis.getStatus();
  assert.equal(status.objectives[0].currentCount, 3);
  assert.equal(status.objectives[0].isCompleted, true);
  assert.equal(crisis.getStage(), CrisisStage.RESOLVED);
});

test('PsychicCrisis: reset() cleanly restores initial state', () => {
  const crisis = new PsychicCrisis();
  crisis.init();
  crisis.transitionToStage(CrisisStage.OUTBREAK);
  crisis.handleBombBlast(5, 5, 2);
  crisis.update(6000);

  crisis.reset();
  assert.equal(crisis.getStage(), CrisisStage.INACTIVE);
  assert.equal(crisis.getThreat(), 0);
  assert.equal(crisis.phantomTimerMs, 0);
  assert.equal(crisis.manifestations.length, 3);
  assert.equal(crisis.manifestations.every(m => !m.isDestroyed), true);
});

test('PsychicCrisis: CrisisManager manages Psychic Invasion lifecycle', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PSYCHIC_INVASION);

  let state = manager.getSituationLogState();
  assert.equal(state.isActive, true);
  assert.equal(state.crisisId, CrisisType.PSYCHIC_INVASION);
  assert.equal(state.stage, CrisisStage.WHISPERS);

  // Advance time past whispers duration (20000ms)
  manager.update(21000);
  state = manager.getSituationLogState();
  assert.equal(state.stage, CrisisStage.OUTBREAK);

  // Blast bombs
  manager.handleBombBlast(4, 4, 2);
  manager.handleBombBlast(4, 5, 2);
  manager.handleBombBlast(4, 6, 2);

  state = manager.getSituationLogState();
  assert.equal(state.stage, CrisisStage.RESOLVED);
  assert.equal(state.isVictorious, true);
});

/* ==============================================================================
 * TIER 3: CHAOS QA & DEFENSIVE TESTS
 * ============================================================================== */

test('Chaos QA: 10,000 multi-touch spam cycles with NaN and Infinity coordinates', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({
    debounceMs: 50,
    actionDebounceMs: { bomb: 20, dash: 30, ultimate: 40 }
  });

  for (let i = 0; i < 10000; i++) {
    const id = i % 10;
    tracker.onPointerDown(id, 'bomb', state, { x: 10, y: 20 });
    tracker.onPointerMove(id, { x: NaN, y: Infinity }, state);
    tracker.onPointerUp(id, state);
  }
  
  assert.strictEqual(tracker.getActivePointerCount(), 0);

  const out = resolveJoystickVector(NaN, Infinity, -10);
  assert.strictEqual(out.up, false);
  assert.strictEqual(out.down, false);
});

test('Chaos QA: Contradictory directions resolution under rapid toggle', () => {
  const state1 = createDefaultMobileInputState();
  state1.up = true;
  state1.down = true;
  resolveContradictoryDirections(state1);
  assert.strictEqual(state1.up, false);
  assert.strictEqual(state1.down, false);

  const state2 = createDefaultMobileInputState();
  state2.left = true;
  state2.right = true;
  resolveContradictoryDirections(state2);
  assert.strictEqual(state2.left, false);
  assert.strictEqual(state2.right, false);

  const state3 = createDefaultMobileInputState();
  state3.up = true;
  state3.right = true;
  resolveContradictoryDirections(state3);
  assert.strictEqual(state3.up, true);
  assert.strictEqual(state3.right, true);
});

test('Chaos QA: ObjectPool zero-GC 10,000 acquire/release stress without leaks', () => {
  class TestItem {
    constructor() {
      this.id = 0;
      this.active = false;
    }
    reset() {
      this.active = false;
    }
  }

  const pool = new ObjectPool({
    factory: () => new TestItem(),
    capacity: 50,
    reset: (item) => item.reset(),
  });

  assert.equal(pool.capacity, 50);
  assert.equal(pool.freeCount, 50);
  assert.equal(pool.activeCount, 0);

  for (let cycle = 0; cycle < 10000; cycle++) {
    const acquired = [];
    const count = 10 + (cycle % 40);
    for (let i = 0; i < count; i++) {
      const item = pool.acquire();
      assert.ok(item);
      item.active = true;
      acquired.push(item);
    }
    assert.equal(pool.activeCount, count);

    for (const item of acquired) {
      pool.release(item);
    }
    assert.equal(pool.activeCount, 0);
    assert.equal(pool.freeCount, 50);
  }

  pool.destroy();
});
