/**
 * tests/progression_crisis_persistence_429.test.mjs
 *
 * Exhaustive Verification Suite for Progression and Crisis State Persistence
 * under API 429 Quota Interruption & Circuit Breaker Recovery.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  GameStatePersistence,
  MemoryStorageAdapter,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  APIQuotaCircuitBreaker,
} from '../src/game/persistence/CircuitBreaker.ts';

import {
  CircuitBreakerState,
} from '../src/game/persistence/PersistenceTypes.ts';

import {
  CrisisType,
  CrisisStage,
  HazardType,
  CrisisManager,
  SituationLog,
} from '../src/game/crises/index.ts';

import {
  GameModeType,
  RelicId,
  GameModeManager,
  RelicManager,
  createDefaultRunProgressionState,
  sanitizeRunProgressionState,
  serializeRunProgressionState,
  deserializeRunProgressionState,
  reconcileProgressionOn429Recovery,
} from '../src/game/progression/index.ts';

import { ROWS, COLS } from '../src/game/pathfinding.ts';

/* ==============================================================================
 * SECTION 1: CRISIS STATE SERIALIZATION & DESERIALIZATION
 * ============================================================================== */

test('Crisis State: Serializes and deserializes active crisis with hazard tiles and objectives', () => {
  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.PASTEL_VOID);

  const active = cm.getActiveCrisis();
  assert.ok(active);

  // Transition to OUTBREAK
  active.transitionToStage(CrisisStage.OUTBREAK);
  active.setThreat(45);

  // Add hazard tiles
  active.setHazardTile(3, 4, HazardType.VOID_CREEP, 0.8, 15000);
  active.setHazardTile(5, 6, HazardType.PURIFICATION_PRISM, 1.0, 30000);
  active.setHazardTile(7, 8, HazardType.VOID_RIFT, 0.9, 20000);

  // Advance objective
  active.resolveObjective('charge_prisms', 1);

  // Serialize crisis state
  const serialized = cm.serialize();
  assert.ok(serialized);
  assert.equal(serialized.crisisType, CrisisType.PASTEL_VOID);
  assert.equal(serialized.stage, CrisisStage.OUTBREAK);
  assert.equal(serialized.threatMeter, 45);
  assert.ok(serialized.hazardTiles.length >= 3);

  const creepTile = serialized.hazardTiles.find((t) => t.r === 3 && t.c === 4);
  assert.ok(creepTile);
  assert.equal(creepTile.type, HazardType.VOID_CREEP);

  // Restore into a fresh CrisisManager
  const freshCm = new CrisisManager();
  const restoreSuccess = freshCm.deserialize(serialized);
  assert.equal(restoreSuccess, true);

  assert.equal(freshCm.getCurrentCrisisType(), CrisisType.PASTEL_VOID);
  assert.equal(freshCm.getStage(), CrisisStage.OUTBREAK);
  assert.equal(freshCm.getThreatMeter(), 45);

  // Verify hazard tiles restored
  assert.equal(freshCm.isTileHazardous(3, 4), true);
  const restoredTile = freshCm.getHazardAt(3, 4);
  assert.ok(restoredTile);
  assert.equal(restoredTile.type, HazardType.VOID_CREEP);

  // Verify objective state restored
  const restoredObjectives = freshCm.getActiveCrisis()?.getObjectives();
  assert.ok(restoredObjectives);
  const prismObj = restoredObjectives.find((o) => o.id === 'charge_prisms');
  assert.ok(prismObj);
  assert.equal(prismObj.currentCount, 1);
});

test('Crisis State: Deserialization handles null and inactive crisis cleanly', () => {
  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.CLOCKWORK_REBELLION);
  assert.ok(cm.getActiveCrisis());

  // Deserializing null resets active crisis
  const res = cm.deserialize(null);
  assert.equal(res, true);
  assert.equal(cm.getActiveCrisis(), null);
  assert.equal(cm.getCurrentCrisisType(), null);
});

test('Crisis State: Serializes and deserializes all crisis types seamlessly', () => {
  const types = [
    CrisisType.PASTEL_VOID,
    CrisisType.CLOCKWORK_REBELLION,
    CrisisType.ORBITAL_BOMBARDMENT,
    CrisisType.SOLAR_FLARES,
    CrisisType.CREEPING_LAVA,
    CrisisType.DIMENSIONAL_RIFTS,
    CrisisType.PSYCHIC_INVASION,
  ];

  for (const t of types) {
    const cm = new CrisisManager();
    cm.triggerCrisis(t);
    cm.getActiveCrisis()?.transitionToStage(CrisisStage.OUTBREAK);
    cm.getActiveCrisis()?.setThreat(60);

    const serialized = cm.serialize();
    assert.ok(serialized, `Failed to serialize ${t}`);
    assert.equal(serialized.crisisType, t);

    const restoredCm = new CrisisManager();
    const success = restoredCm.deserialize(serialized);
    assert.equal(success, true, `Failed to deserialize ${t}`);
    assert.equal(restoredCm.getCurrentCrisisType(), t);
    assert.equal(restoredCm.getStage(), CrisisStage.OUTBREAK);
  }
});

/* ==============================================================================
 * SECTION 2: SITUATION LOG HUD SERIALIZATION & DESERIALIZATION
 * ============================================================================== */

test('SituationLog: Serializes and deserializes log state with event emission', () => {
  const emitter = new EventEmitter();
  const mockGame = {
    events: {
      emit: (event, ...args) => emitter.emit(event, ...args),
    },
  };

  const sitLog = new SituationLog(mockGame);

  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.ORBITAL_BOMBARDMENT);
  cm.getActiveCrisis()?.transitionToStage(CrisisStage.CLIMAX);
  cm.getActiveCrisis()?.setThreat(85);

  sitLog.updateFromCrisisManager(cm, Date.now(), true);

  const serialized = sitLog.serialize();
  assert.equal(serialized.isActive, true);
  assert.equal(serialized.crisisId, CrisisType.ORBITAL_BOMBARDMENT);
  assert.equal(serialized.stage, CrisisStage.CLIMAX);
  assert.equal(serialized.threatLevel, 85);

  // Test JSON serialization
  const json = sitLog.serializeToJson();
  assert.ok(typeof json === 'string');

  // Fresh SituationLog listening to updates
  let updateReceived = false;
  emitter.on('situation-log-update', (state) => {
    updateReceived = true;
    assert.equal(state.crisisId, CrisisType.ORBITAL_BOMBARDMENT);
    assert.equal(state.threatLevel, 85);
  });

  const freshLog = new SituationLog(mockGame);
  const deserialized = freshLog.deserializeFromJson(json);
  assert.equal(deserialized, true);
  assert.equal(updateReceived, true);
  assert.equal(freshLog.getState().threatLevel, 85);
});

test('SituationLog: Defensively sanitizes corrupted inputs, NaNs, and negative numbers', () => {
  const sitLog = new SituationLog();

  const corruptedPayload = {
    isActive: true,
    crisisId: 'unknown_crisis',
    threatLevel: NaN,
    threatTrend: 'invalid_trend',
    elapsedMs: -5000,
    stageRemainingMs: Infinity,
    objectives: [
      { id: '__proto__', targetCount: -10, currentCount: NaN },
    ],
  };

  const ok = sitLog.deserialize(corruptedPayload);
  assert.equal(ok, true);

  const sanitized = sitLog.getState();
  assert.equal(sanitized.threatLevel, 0); // NaN clamped to 0
  assert.equal(sanitized.threatTrend, 'stable'); // Fallback
  assert.equal(sanitized.elapsedMs, 0); // Negative clamped to 0
  assert.equal(sanitized.stageRemainingMs, 0); // Infinity fallback
  assert.equal(sanitized.objectives[0].targetCount, 0);
  assert.equal(sanitized.objectives[0].currentCount, 0);
});

/* ==============================================================================
 * SECTION 3: PROGRESSION STATE SERIALIZATION & SANITIZATION
 * ============================================================================== */

test('Progression: GameModeManager and RelicManager serialize and deserialize', () => {
  const gmm = new GameModeManager(GameModeType.CRISIS_SURVIVAL);
  gmm.wave = 7;
  gmm.chamberNumber = 12;
  gmm.score = 45000;
  gmm.starCandies = 150;
  gmm.cosmicEssence = 80;
  gmm.survivalElapsedMs = 180000;
  gmm.crisesPurifiedCount = 3;

  const serializedGmm = gmm.serialize();
  assert.equal(serializedGmm.mode, GameModeType.CRISIS_SURVIVAL);
  assert.equal(serializedGmm.wave, 7);
  assert.equal(serializedGmm.score, 45000);
  assert.equal(serializedGmm.crisesPurifiedCount, 3);

  const freshGmm = new GameModeManager();
  freshGmm.deserialize(serializedGmm);
  assert.equal(freshGmm.currentMode, GameModeType.CRISIS_SURVIVAL);
  assert.equal(freshGmm.wave, 7);
  assert.equal(freshGmm.score, 45000);
  assert.equal(freshGmm.crisesPurifiedCount, 3);

  // RelicManager
  const rm = new RelicManager([RelicId.POCKET_CHRONOMETER], 2);
  rm.equipRelic(RelicId.SOLAR_CAPACITOR);
  rm.vampiricKillStreak = 4;
  rm.hasSolarShield = true;

  const serializedRm = rm.serialize();
  assert.equal(serializedRm.equippedRelics.length, 2);
  assert.equal(serializedRm.vampiricKillStreak, 4);
  assert.equal(serializedRm.hasSolarShield, true);

  const freshRm = new RelicManager([], 2);
  freshRm.deserialize(serializedRm);
  assert.equal(freshRm.isEquipped(RelicId.POCKET_CHRONOMETER), true);
  assert.equal(freshRm.isEquipped(RelicId.SOLAR_CAPACITOR), true);
  assert.equal(freshRm.vampiricKillStreak, 4);
  assert.equal(freshRm.hasSolarShield, true);
});

test('Progression: Sanitize rejects prototype pollution, NaN, and negative numbers', () => {
  const maliciousPayload = {
    __proto__: { hacked: true },
    constructor: { malicious: true },
    mode: 'INVALID_GAME_MODE',
    wave: -99,
    score: NaN,
    starCandiesEarned: Infinity,
    cosmicEssenceEarned: -50,
    equippedRelics: ['invalid_relic', '__proto__', RelicId.POCKET_CHRONOMETER],
  };

  const sanitized = sanitizeRunProgressionState(maliciousPayload);

  assert.equal(sanitized.mode, GameModeType.STANDARD);
  assert.equal(sanitized.wave, 1);
  assert.equal(sanitized.score, 0);
  assert.equal(sanitized.starCandiesEarned, 0);
  assert.equal(sanitized.cosmicEssenceEarned, 0);
  assert.deepEqual(sanitized.equippedRelics, [RelicId.POCKET_CHRONOMETER]);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'hacked'), false);
});

test('Progression: reconcileProgressionOn429Recovery syncs meta profile records accurately', () => {
  const savedProg = createDefaultRunProgressionState(GameModeType.CRISIS_SURVIVAL);
  savedProg.wave = 15;
  savedProg.survivalElapsedMs = 450000; // 450 seconds

  const currentMeta = {
    version: 1,
    lastUpdated: Date.now(),
    cosmicEssence: 100,
    starCandies: 50,
    perks: {},
    unlockedModes: [GameModeType.STANDARD, GameModeType.CRISIS_SURVIVAL],
    discoveredRelics: [],
    equippedRelics: [],
    highestWaveReached: {
      [GameModeType.STANDARD]: 5,
      [GameModeType.CRISIS_SURVIVAL]: 8,
      [GameModeType.BOSS_RUSH]: 1,
      [GameModeType.ENDLESS_GAUNTLET]: 1,
    },
    bestSurvivalTimesSeconds: {
      [GameModeType.STANDARD]: 120,
      [GameModeType.CRISIS_SURVIVAL]: 200,
      [GameModeType.BOSS_RUSH]: 0,
      [GameModeType.ENDLESS_GAUNTLET]: 0,
    },
    bestBossRushTimeSeconds: null,
    trophiesUnlocked: [],
  };

  const { reconciledProgression, reconciledMeta } = reconcileProgressionOn429Recovery(savedProg, currentMeta);

  assert.equal(reconciledMeta.highestWaveReached[GameModeType.CRISIS_SURVIVAL], 15);
  assert.equal(reconciledMeta.bestSurvivalTimesSeconds[GameModeType.CRISIS_SURVIVAL], 450);
  assert.equal(reconciledProgression.wave, 15);
});

/* ==============================================================================
 * SECTION 4: SEAMLESS API 429 QUOTA RECOVERY INTEGRATION
 * ============================================================================== */

test('API 429 Recovery: HTTP 429 emergency-saves progression, crisis, and situation log state', async () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const localAdapter = new MemoryStorageAdapter();
  const cb = new APIQuotaCircuitBreaker({ initialBackoffMs: 5000 });
  const persistence = new GameStatePersistence(sessionAdapter, localAdapter, cb);

  // Setup active crisis and progression
  const cm = new CrisisManager();
  cm.triggerCrisis(CrisisType.CREEPING_LAVA);
  cm.getActiveCrisis()?.transitionToStage(CrisisStage.OUTBREAK);
  cm.getActiveCrisis()?.setThreat(70);
  cm.getActiveCrisis()?.setHazardTile(4, 5, HazardType.LAVA_SURFACE, 1.0, 20000);

  const sitLog = new SituationLog();
  sitLog.updateFromCrisisManager(cm, Date.now(), true);

  const progState = createDefaultRunProgressionState(GameModeType.CRISIS_SURVIVAL);
  progState.wave = 5;
  progState.score = 25000;
  progState.starCandiesEarned = 120;
  progState.cosmicEssenceEarned = 35;

  const currentStateProvider = () => ({
    version: 1,
    timestamp: Date.now(),
    saveTrigger: 'manual',
    meta: {
      runId: 'test_run_429',
      stageIndex: 2,
      gameMode: GameModeType.CRISIS_SURVIVAL,
      score: 25000,
      elapsedTimeMs: 120000,
      activeCrisesCount: 1,
    },
    player: {
      x: 100,
      y: 100,
      gridRow: 2,
      gridCol: 2,
      facing: 'down',
      stats: {
        bombPower: 3,
        maxBombs: 4,
        speed: 150,
        hasKick: true,
        hasShield: true,
        shieldCharges: 1,
        hasWallPass: false,
        hasBombPass: false,
        score: 25000,
        enemiesDefeated: 12,
        extraLives: 2,
      },
      hp: 3,
    },
    board: {
      rows: ROWS,
      cols: COLS,
      mapRLE: '195x0',
    },
    activeBombs: [],
    activeEntities: [],
    activeItems: [],
    progression: progState,
    crisis: cm.serialize(),
    situationLog: sitLog.serialize(),
    checksum: '',
  });

  // Inject HTTP 429 Quota Exceeded error
  await persistence.handleApiError(
    { status: 429, message: 'RESOURCE_EXHAUSTED: Rate limit exceeded' },
    currentStateProvider
  );

  // Circuit breaker must trip OPEN
  assert.equal(cb.getState(), CircuitBreakerState.OPEN);

  // Verify state was saved to SessionStorage with saveTrigger 'quota_429'
  const restored = persistence.loadRunState();
  assert.ok(restored, 'Expected saved run state in storage');
  assert.equal(restored.saveTrigger, 'quota_429');
  assert.equal(restored.meta.score, 25000);

  // Verify progression survived intact
  assert.ok(restored.progression);
  assert.equal(restored.progression.wave, 5);
  assert.equal(restored.progression.starCandiesEarned, 120);
  assert.equal(restored.progression.cosmicEssenceEarned, 35);

  // Verify crisis survived intact
  assert.ok(restored.crisis);
  assert.equal(restored.crisis.crisisType, CrisisType.CREEPING_LAVA);
  assert.equal(restored.crisis.stage, CrisisStage.OUTBREAK);
  assert.equal(restored.crisis.threatMeter, 70);
  const lavaTile = restored.crisis.hazardTiles.find((t) => t.r === 4 && t.c === 5);
  assert.ok(lavaTile);
  assert.equal(lavaTile.type, HazardType.LAVA_SURFACE);

  // Verify situation log survived intact
  assert.ok(restored.situationLog);
  assert.equal(restored.situationLog.crisisId, CrisisType.CREEPING_LAVA);
  assert.equal(restored.situationLog.threatLevel, 70);

  // Verify clean resumption into fresh engines
  const freshCm = new CrisisManager();
  freshCm.deserialize(restored.crisis);
  assert.equal(freshCm.getCurrentCrisisType(), CrisisType.CREEPING_LAVA);
  assert.equal(freshCm.getStage(), CrisisStage.OUTBREAK);
  assert.equal(freshCm.isTileHazardous(4, 5), true);

  const freshSitLog = new SituationLog();
  freshSitLog.deserialize(restored.situationLog);
  assert.equal(freshSitLog.getState().threatLevel, 70);
  assert.equal(freshSitLog.getState().isActive, true);
});
