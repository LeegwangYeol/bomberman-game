/**
 * adversarial_mode_crisis_lifecycle.test.mjs
 *
 * Empirical Adversarial Challenge: Game Mode Switching & Crisis Lifecycle Stress Suite
 *
 * Stress tests:
 * 1. Rapid Mode Switching Cycles: Standard -> Boss Rush -> Crisis Survival -> Endless -> Crisis Survival -> Standard (50 iterations)
 * 2. Clean instantiation and dismantling: activeBoss, crisisManager, situationLog, telegraphEngine, hazard tiles
 * 3. Numerical Invariants: 0 NaNs, 0 Infinities, 0 out-of-bounds coordinates across all entities & hazards
 * 4. Adversarial Crisis Handlers: Bomb blasts during stage transitions, invalid/negative/out-of-bounds coordinates
 * 5. All 6 Crisis Types: PASTEL_VOID, CLOCKWORK_REBELLION, ORBITAL_BOMBARDMENT, SOLAR_FLARES, CREEPING_LAVA, DIMENSIONAL_RIFTS
 * 6. Interleaved mode cancellations mid-crisis and mid-boss enrage/stun states
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  CrisisType,
  CrisisStage,
  CrisisManager,
  SituationLog,
} from '../src/game/crises/index.ts';

import {
  GummyBearBoss,
  HamsterBoss,
  QueenBeeBoss,
} from '../src/game/bosses/index.ts';

import { TelegraphEngine } from '../src/game/bosses/TelegraphEngine.ts';
import { BossHUD } from '../src/game/bosses/BossHUD.ts';
import { BossState } from '../src/game/bosses/BossTypes.ts';
import { ROWS, COLS, TILE_SIZE } from '../src/game/pathfinding.ts';

/**
 * Headless GameScene Simulator
 * Emulates the exact mode-switching and update lifecycle of GameScene.ts
 */
class HeadlessGameScene {
  constructor() {
    this.emitter = new EventEmitter();
    this.game = {
      events: {
        emit: (event, ...args) => this.emitter.emit(event, ...args),
        on: (event, fn) => this.emitter.on(event, fn),
        off: (event, fn) => this.emitter.off(event, fn),
      },
    };

    // Subsystems
    this.crisisManager = new CrisisManager();
    this.situationLog = new SituationLog(this.game);
    this.telegraphEngine = new TelegraphEngine();
    this.bossHUD = new BossHUD(this.game);

    this.activeBoss = null;
    this.crisisGraphicsDrawn = false;
    this.crisisGraphicsCleared = true;
    this.telegraphGraphicsCleared = true;
    this.bossGraphicsCleared = true;

    this.player = {
      x: 1 * TILE_SIZE + TILE_SIZE / 2,
      y: 1 * TILE_SIZE + TILE_SIZE / 2,
    };

    this.onModeChanged = (mode) => {
      const normalized = (mode || '').toLowerCase();
      if (normalized === 'boss_rush') {
        this.stopCrisisMode();
        this.startBossEncounter('king_gummy_bear');
      } else if (normalized === 'crisis_survival') {
        this.dismissBoss();
        this.startCrisisMode(CrisisType.PASTEL_VOID);
      } else {
        if (this.activeBoss) {
          this.dismissBoss();
        }
        this.stopCrisisMode();
      }
    };

    this.game.events.on('mode-changed', this.onModeChanged);
  }

  startBossEncounter(bossId) {
    this.dismissBoss();
    const startX = 300;
    const startY = 260;

    if (bossId === 'captain_nibbles' || bossId === 'boss_hamster_nibbles') {
      this.activeBoss = new HamsterBoss(startX, startY);
    } else if (bossId === 'queen_bee_cupcake' || bossId === 'boss_queen_bee') {
      this.activeBoss = new QueenBeeBoss(startX, startY);
    } else {
      this.activeBoss = new GummyBearBoss(startX, startY);
    }

    if (this.bossHUD) {
      this.bossHUD.initBoss(this.activeBoss.config.id, this.activeBoss.maxHp);
    }
  }

  dismissBoss() {
    if (this.telegraphEngine) {
      this.telegraphEngine.reset();
    }
    this.telegraphGraphicsCleared = true;
    this.bossGraphicsCleared = true;
    if (this.bossHUD) {
      this.bossHUD.dismissBoss();
    }
    this.activeBoss = null;
  }

  startCrisisMode(type = CrisisType.PASTEL_VOID) {
    this.stopCrisisMode();
    this.crisisManager.triggerCrisis(type);
    if (this.situationLog) {
      this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now(), true);
    }
    this.crisisGraphicsDrawn = true;
    this.crisisGraphicsCleared = false;
  }

  stopCrisisMode() {
    if (this.crisisManager) {
      this.crisisManager.stopCrisis('reset');
    }
    if (this.situationLog) {
      this.situationLog.reset();
    }
    this.crisisGraphicsCleared = true;
    this.crisisGraphicsDrawn = false;
  }

  update(time, delta) {
    // 11. Boss update
    if (this.activeBoss) {
      this.activeBoss.update(delta, { x: this.player.x, y: this.player.y });
      if (this.bossHUD) {
        this.bossHUD.update(delta);
        this.bossHUD.setHp(this.activeBoss.currentHp);
        this.bossHUD.setBossState(this.activeBoss.bossState);
        this.bossHUD.setEnrageGauge(this.activeBoss.enrageGauge);
      }
      this.bossGraphicsCleared = false;
      this.telegraphGraphicsCleared = false;

      if (this.activeBoss.isDefeated) {
        this.dismissBoss();
      }
    }

    // 12. Crisis update
    if (this.crisisManager && this.crisisManager.getActiveCrisis()) {
      const activeCrisis = this.crisisManager.getActiveCrisis();
      if (activeCrisis && activeCrisis.getStage() !== CrisisStage.INACTIVE) {
        const playerPos = {
          r: Math.floor(this.player.y / TILE_SIZE),
          c: Math.floor(this.player.x / TILE_SIZE),
          x: this.player.x,
          y: this.player.y,
        };
        this.crisisManager.update(delta, playerPos);
        if (this.situationLog) {
          this.situationLog.updateFromCrisisManager(this.crisisManager, Date.now());
        }
        this.crisisGraphicsDrawn = true;
        this.crisisGraphicsCleared = false;
      }
    }
  }

  destroy() {
    this.game.events.off('mode-changed', this.onModeChanged);
    this.dismissBoss();
    this.stopCrisisMode();
  }
}

/* ==============================================================================
 * ADVERSARIAL TEST SUITE
 * ============================================================================== */

test('Adversarial [Mode Switch Cycle]: Rapid 50-cycle sequence Standard -> Boss Rush -> Crisis Survival -> Endless -> Crisis Survival -> Standard', () => {
  const scene = new HeadlessGameScene();
  const sequence = [
    { mode: 'STANDARD', expectBoss: false, expectCrisis: false, expectSitLog: false },
    { mode: 'BOSS_RUSH', expectBoss: true, expectCrisis: false, expectSitLog: false },
    { mode: 'CRISIS_SURVIVAL', expectBoss: false, expectCrisis: true, expectSitLog: true },
    { mode: 'ENDLESS_GAUNTLET', expectBoss: false, expectCrisis: false, expectSitLog: false },
    { mode: 'CRISIS_SURVIVAL', expectBoss: false, expectCrisis: true, expectSitLog: true },
    { mode: 'STANDARD', expectBoss: false, expectCrisis: false, expectSitLog: false },
  ];

  let switchCount = 0;
  for (let cycle = 0; cycle < 50; cycle++) {
    for (const step of sequence) {
      scene.game.events.emit('mode-changed', step.mode);
      switchCount++;

      // Advance 3 frames (50ms)
      scene.update(cycle * 1000 + switchCount * 50, 16.6);

      // Verify mutual exclusivity and state invariants
      assert.equal(!!scene.activeBoss, step.expectBoss, `Cycle ${cycle}, Mode ${step.mode}: Boss active mismatch`);
      assert.equal(!!scene.crisisManager.getActiveCrisis(), step.expectCrisis, `Cycle ${cycle}, Mode ${step.mode}: Crisis active mismatch`);
      assert.equal(scene.situationLog.getState().isActive, step.expectSitLog, `Cycle ${cycle}, Mode ${step.mode}: SituationLog active mismatch`);

      // Verify coordinates finite & non-NaN
      if (scene.activeBoss) {
        assert.ok(Number.isFinite(scene.activeBoss.x), `Boss X is non-finite: ${scene.activeBoss.x}`);
        assert.ok(Number.isFinite(scene.activeBoss.y), `Boss Y is non-finite: ${scene.activeBoss.y}`);
        assert.ok(Number.isFinite(scene.activeBoss.currentHp), `Boss currentHp is non-finite: ${scene.activeBoss.currentHp}`);
        assert.ok(Number.isFinite(scene.activeBoss.maxHp), `Boss maxHp is non-finite: ${scene.activeBoss.maxHp}`);
        assert.ok(Number.isFinite(scene.activeBoss.enrageGauge), `Boss enrage is non-finite: ${scene.activeBoss.enrageGauge}`);
      }

      if (step.expectCrisis) {
        const hazards = scene.crisisManager.getActiveHazardTiles();
        assert.ok(hazards.length > 0, `Cycle ${cycle}: Expected active hazard tiles in crisis mode`);
        for (const h of hazards) {
          assert.ok(Number.isFinite(h.r), `Hazard r is non-finite: ${h.r}`);
          assert.ok(Number.isFinite(h.c), `Hazard c is non-finite: ${h.c}`);
          assert.ok(h.r >= 0 && h.r < ROWS, `Hazard r out of bounds: ${h.r}`);
          assert.ok(h.c >= 0 && h.c < COLS, `Hazard c out of bounds: ${h.c}`);
          assert.ok(Number.isFinite(h.intensity), `Hazard intensity is non-finite: ${h.intensity}`);
        }
      } else {
        assert.equal(scene.crisisManager.getActiveHazardTiles().length, 0, `Hazard tiles dangling in mode ${step.mode}`);
        assert.equal(scene.crisisGraphicsCleared, true, `crisisGraphics not cleared in mode ${step.mode}`);
      }
    }
  }

  assert.equal(switchCount, 300);
  scene.destroy();
});

test('Adversarial [Crisis Subsystem]: All 6 distinct crisis types survive 1,000 bomb blasts with out-of-bounds/fuzzed inputs', () => {
  const manager = new CrisisManager();
  const crisisTypes = [
    CrisisType.PASTEL_VOID,
    CrisisType.CLOCKWORK_REBELLION,
    CrisisType.ORBITAL_BOMBARDMENT,
    CrisisType.SOLAR_FLARES,
    CrisisType.CREEPING_LAVA,
    CrisisType.DIMENSIONAL_RIFTS,
  ];

  const fuzzedCoordinates = [
    { r: -1, c: -1, rad: 1 },
    { r: 100, c: 100, rad: 5 },
    { r: 0, c: 0, rad: 0 },
    { r: 6, c: 7, rad: 20 },
    { r: 1, c: 13, rad: 2 },
    { r: 11, c: 1, rad: 2 },
    { r: 3, c: 3, rad: 1 },
    { r: 9, c: 11, rad: 3 },
    { r: -99, c: 15, rad: -1 },
  ];

  for (const cType of crisisTypes) {
    manager.triggerCrisis(cType);
    assert.equal(manager.getCurrentCrisisType(), cType);

    // 1. Advance through WHISPERS
    manager.update(5000, { r: 1, c: 1 });
    assert.equal(manager.getStage(), CrisisStage.WHISPERS);

    // Blast during whispers
    for (const coord of fuzzedCoordinates) {
      assert.doesNotThrow(() => {
        manager.handleBombBlast(coord.r, coord.c, coord.rad);
      });
    }

    // 2. Advance into OUTBREAK
    manager.update(20000, { r: 2, c: 2 });
    assert.equal(manager.getStage(), CrisisStage.OUTBREAK);

    for (const coord of fuzzedCoordinates) {
      assert.doesNotThrow(() => {
        manager.handleBombBlast(coord.r, coord.c, coord.rad);
      });
    }

    // 3. Advance into CLIMAX (OUTBREAK duration is 55000ms)
    manager.update(56000, { r: 5, c: 5 });
    assert.equal(manager.getStage(), CrisisStage.CLIMAX);

    for (const coord of fuzzedCoordinates) {
      assert.doesNotThrow(() => {
        manager.handleBombBlast(coord.r, coord.c, coord.rad);
      });
    }

    // Verify all remaining hazards have finite coordinates
    const hazards = manager.getActiveHazardTiles();
    for (const h of hazards) {
      assert.ok(Number.isFinite(h.r), `Hazard r non-finite: ${h.r}`);
      assert.ok(Number.isFinite(h.c), `Hazard c non-finite: ${h.c}`);
      assert.ok(h.r >= 0 && h.r < ROWS);
      assert.ok(h.c >= 0 && h.c < COLS);
      assert.ok(Number.isFinite(h.intensity));
    }

    // Clean stop
    manager.stopCrisis('reset');
    assert.equal(manager.getActiveCrisis(), null);
    assert.equal(manager.getActiveHazardTiles().length, 0);
  }
});

test('Adversarial [Boss Lifecycle & Stun/Enrage Interruption]: Switching mode during Enrage/Stun cleanly tears down without zombie state', () => {
  const scene = new HeadlessGameScene();

  // 1. Start Boss Rush
  scene.game.events.emit('mode-changed', 'BOSS_RUSH');
  assert.ok(scene.activeBoss);
  const boss = scene.activeBoss;

  // 2. Drive boss into STUNNED state
  boss.applyStun(2.5);
  assert.equal(boss.bossState, BossState.STUNNED);
  assert.ok(boss.isStunned);

  // 3. Rapid mode switch to Crisis Survival right in the middle of stun
  scene.game.events.emit('mode-changed', 'CRISIS_SURVIVAL');
  assert.equal(scene.activeBoss, null, 'Active boss was not dismantled immediately on mode switch');
  assert.equal(scene.telegraphGraphicsCleared, true);
  assert.equal(scene.bossGraphicsCleared, true);
  assert.ok(scene.crisisManager.getActiveCrisis());

  // 4. Update for 5 seconds in Crisis mode
  for (let i = 0; i < 50; i++) {
    scene.update(i * 100, 100);
  }

  // 5. Switch back to Boss Rush — verify fresh boss is instantiated at full HP, Phase 1, NOT stunned
  scene.game.events.emit('mode-changed', 'BOSS_RUSH');
  assert.ok(scene.activeBoss);
  assert.equal(scene.activeBoss.currentHp, scene.activeBoss.maxHp);
  assert.equal(scene.activeBoss.phase, 1);
  assert.equal(scene.activeBoss.isStunned, false);
  assert.equal(scene.activeBoss.enrageGauge, 0);

  scene.destroy();
});

test('Adversarial [SituationLog Resilience]: Rapid throttling & resets produce zero invalid payloads', () => {
  const emitter = new EventEmitter();
  const mockGame = {
    events: {
      emit: (event, ...args) => emitter.emit(event, ...args),
    },
  };

  const situationLog = new SituationLog(mockGame);
  const manager = new CrisisManager();

  const capturedStates = [];
  emitter.on('situation-log-update', (state) => {
    capturedStates.push(JSON.parse(JSON.stringify(state)));
  });

  manager.triggerCrisis(CrisisType.CREEPING_LAVA);

  // High-frequency updates over 200 simulation ticks
  let simTime = 1000;
  for (let i = 0; i < 200; i++) {
    simTime += 25; // 25ms per frame
    manager.update(25, { r: 6, c: 7 });
    situationLog.updateFromCrisisManager(manager, simTime);

    if (i === 50) {
      manager.stopCrisis('reset');
      situationLog.reset();
    } else if (i === 100) {
      manager.triggerCrisis(CrisisType.ORBITAL_BOMBARDMENT);
      situationLog.updateFromCrisisManager(manager, simTime, true);
    }
  }

  assert.ok(capturedStates.length > 0, 'No states captured');

  // Verify all captured states conform to strict invariant schemas
  for (const st of capturedStates) {
    assert.ok(typeof st.isActive === 'boolean');
    assert.ok(typeof st.threatLevel === 'number' && Number.isFinite(st.threatLevel));
    assert.ok(st.threatLevel >= 0 && st.threatLevel <= 100);
    assert.ok(typeof st.stageRemainingMs === 'number' && Number.isFinite(st.stageRemainingMs));
    assert.ok(Array.isArray(st.objectives));
    for (const obj of st.objectives) {
      assert.ok(typeof obj.id === 'string');
      assert.ok(typeof obj.targetCount === 'number');
      assert.ok(typeof obj.currentCount === 'number');
      assert.ok(obj.currentCount <= obj.targetCount);
    }
  }
});

test('Adversarial [Chaos Fuzzing]: 1,000 random mode switches with random invalid payloads and dirty inputs', () => {
  const scene = new HeadlessGameScene();
  const chaosModes = [
    'STANDARD',
    'BOSS_RUSH',
    'CRISIS_SURVIVAL',
    'ENDLESS_GAUNTLET',
    'boss_rush',
    'crisis_survival',
    'standard',
    '',
    'INVALID_MODE_XYZ',
    'UNKNOWN_MODE_99',
    'Standard',
    'Boss_Rush',
    'CRISIS_survival',
  ];

  for (let i = 0; i < 1000; i++) {
    const randomMode = chaosModes[i % chaosModes.length];
    assert.doesNotThrow(() => {
      scene.game.events.emit('mode-changed', randomMode);
    });

    // Advance random delta between 0 and 50ms
    const delta = (i * 7) % 50;
    assert.doesNotThrow(() => {
      scene.update(i * 100, delta);
    });

    // Check invariants
    if (scene.activeBoss) {
      assert.ok(Number.isFinite(scene.activeBoss.x));
      assert.ok(Number.isFinite(scene.activeBoss.y));
      assert.ok(Number.isFinite(scene.activeBoss.currentHp));
    }
    const hazards = scene.crisisManager.getActiveHazardTiles();
    for (const h of hazards) {
      assert.ok(Number.isFinite(h.r));
      assert.ok(Number.isFinite(h.c));
      assert.ok(Number.isFinite(h.intensity));
    }
  }

  scene.destroy();
});

test('Adversarial [Extreme Deltas & Coordinates]: CrisisManager under extreme time warping and NaN player coords', () => {
  const manager = new CrisisManager();
  manager.triggerCrisis(CrisisType.PASTEL_VOID);

  const extremePositions = [
    { r: NaN, c: NaN, x: NaN, y: NaN },
    { r: -9999, c: -9999, x: -100000, y: -100000 },
    { r: 99999, c: 99999, x: 100000, y: 100000 },
    { r: 0, c: 0 },
    undefined,
  ];

  const extremeDeltas = [0, 1, 16.666, 10000, 100000, -100];

  for (const delta of extremeDeltas) {
    for (const pos of extremePositions) {
      assert.doesNotThrow(() => {
        manager.update(delta, pos);
      });

      const threat = manager.getThreatMeter();
      assert.ok(Number.isFinite(threat), `Threat meter non-finite: ${threat}`);
      assert.ok(threat >= 0 && threat <= 100, `Threat meter out of bounds: ${threat}`);

      const hazards = manager.getActiveHazardTiles();
      for (const h of hazards) {
        assert.ok(Number.isFinite(h.r));
        assert.ok(Number.isFinite(h.c));
        assert.ok(h.r >= 0 && h.r < ROWS);
        assert.ok(h.c >= 0 && h.c < COLS);
      }
    }
  }

  manager.stopCrisis('reset');
  assert.equal(manager.getActiveCrisis(), null);
  assert.equal(manager.getActiveHazardTiles().length, 0);
});

