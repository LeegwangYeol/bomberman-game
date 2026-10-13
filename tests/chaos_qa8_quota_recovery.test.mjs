/**
 * tests/chaos_qa8_quota_recovery.test.mjs
 *
 * [ChaosQA-8: Persistence & Quota Recovery Simulator]
 * Comprehensive Test Suite for Browser Storage Quota Exceeded Errors,
 * API 429 Circuit Breaker Throttling, Dual Quota Exhaustion, and Graceful Degradation.
 *
 * Invariants & Scenarios Verified:
 * 1. Browser Storage Quota Exceeded (sessionStorage QuotaExceededError / DOMException)
 *    - Graceful fallback to MemoryStorageAdapter without crashing the game
 *    - Lossless state capture with valid 24-character checksums
 * 2. Meta-Profile Storage Quota Exceeded (localStorage QuotaExceededError)
 *    - Fallback to in-memory store; subsequent reads return updated profile, not stale data
 * 3. Dual Quota Exhaustion (Simultaneous HTTP 429 + Browser Storage Quota Exceeded)
 *    - Emergency save triggers under 429 while storage throws QuotaExceededError
 *    - State tagged as 'quota_429' safely captured in in-memory fallback
 *    - Circuit breaker transitions to OPEN, queues offline requests, and preserves game loop
 * 4. Storage Quota Relief & Self-Healing Synchronization
 *    - When storage quota clears, subsequent writes persist to physical storage and purge memory override
 * 5. High-Frequency 1,000-Cycle Quota Recovery Stress Test
 *    - Rapid alternation of storage quota faults, API 429 throttles, and recovery drains
 *    - Zero uncaught exceptions, zero state corruptions, zero hanging promises
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APIQuotaCircuitBreaker,
  CircuitBreakerOpenError,
} from '../src/game/persistence/CircuitBreaker.ts';

import {
  GameStatePersistence,
  MemoryStorageAdapter,
  WebStorageAdapter,
  compressGrid,
  decompressGrid,
  calculateChecksum,
  verifyChecksum,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  CircuitBreakerState,
  STORAGE_KEY_ACTIVE_RUN,
  STORAGE_KEY_META_PROFILE,
  STORAGE_SCHEMA_VERSION,
} from '../src/game/persistence/PersistenceTypes.ts';

import {
  GameModeType,
  RelicId,
} from '../src/game/progression/ProgressionTypes.ts';

import { createInitialPlayerStats } from '../src/game/gameplay_mechanics.ts';

/**
 * Creates a mock DOMException resembling browser storage quota errors
 */
function createStorageQuotaError(message = 'The quota has been exceeded.') {
  const err = new Error(message);
  err.name = 'QuotaExceededError';
  // @ts-expect-error Mock DOMException properties
  err.code = 22;
  // @ts-expect-error Mock DOMException properties
  err.number = -2147024882;
  return err;
}

/**
 * Helper to generate a realistic mock game run state
 */
function createMockRunState(overrides = {}) {
  const rows = 13;
  const cols = 15;
  const map = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let c = 0; c < cols; c++) {
    map[0][c] = 1;
    map[rows - 1][c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    map[r][0] = 1;
    map[r][cols - 1] = 1;
  }
  for (let r = 2; r < rows - 2; r += 2) {
    for (let c = 2; c < cols - 2; c += 2) {
      map[r][c] = 1;
    }
  }

  const mapRLE = compressGrid(map);

  return {
    version: STORAGE_SCHEMA_VERSION,
    timestamp: Date.now(),
    saveTrigger: overrides.saveTrigger ?? 'manual',
    meta: {
      runId: overrides.runId ?? `run_qa8_${Date.now()}`,
      stageIndex: overrides.stageIndex ?? 3,
      gameMode: GameModeType.CRISIS_SURVIVAL,
      score: overrides.score ?? 18500,
      elapsedTimeMs: 145000,
      activeCrisesCount: 1,
      bossEncounterActive: false,
    },
    player: {
      x: 120,
      y: 80,
      gridRow: 2,
      gridCol: 3,
      facing: 'right',
      stats: createInitialPlayerStats(),
      hp: overrides.hp ?? 3,
      invulnerableRemainingMs: 0,
    },
    board: {
      rows,
      cols,
      mapRLE,
      map,
    },
    activeBombs: [
      {
        id: 'bomb_qa8_1',
        x: 120,
        y: 80,
        row: 2,
        col: 3,
        fuseRemainingMs: 1600,
        power: 3,
        owner: 'player',
        bombType: 'NORMAL',
      },
    ],
    activeEntities: [
      {
        id: 'stalker_1',
        archetype: 'CHASER',
        faction: 'enemy',
        x: 280,
        y: 160,
        hp: 2,
        maxHp: 2,
        aiState: 'TRACKING',
      },
    ],
    activeItems: [
      {
        row: 4,
        col: 6,
        itemType: 'SPEED_UP',
        spawnTime: Date.now() - 4000,
      },
    ],
    checksum: '',
  };
}

/* ==============================================================================
 * SCENARIO 1: BROWSER STORAGE QUOTA EXCEEDED DURING RUN STATE PERSISTENCE
 * ============================================================================== */

test('ChaosQA-8 1.1: WebStorageAdapter gracefully degrades to in-memory store upon sessionStorage QuotaExceededError', () => {
  let quotaFaultActive = true;
  const underlyingMap = new Map();

  const mockStorage = {
    getItem: (key) => underlyingMap.get(key) ?? null,
    setItem: (key, val) => {
      if (quotaFaultActive) {
        throw createStorageQuotaError('sessionStorage quota exceeded on mobile WebKit');
      }
      underlyingMap.set(key, String(val));
    },
    removeItem: (key) => underlyingMap.delete(key),
    clear: () => underlyingMap.clear(),
  };

  const sessionAdapter = new WebStorageAdapter('session');
  // @ts-expect-error Inject mock underlying storage
  sessionAdapter.storage = mockStorage;

  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  const runState = createMockRunState({ score: 22000, hp: 2 });

  // Saving must NOT throw any error despite QuotaExceededError
  assert.doesNotThrow(() => {
    const saved = persistence.saveRunState(runState);
    assert.ok(saved);
    assert.equal(saved.checksum.length, 24);
    assert.equal(verifyChecksum(saved, saved.checksum), true);
  });

  // Verify state is stored in memory fallback and loadRunState retrieves it losslessly
  const loaded = persistence.loadRunState();
  assert.ok(loaded, 'loadRunState must retrieve state from fallback store');
  assert.equal(loaded.meta.score, 22000);
  assert.equal(loaded.player.hp, 2);
  assert.equal(verifyChecksum(loaded, loaded.checksum), true);
  assert.deepEqual(loaded.board.map, runState.board.map);

  // Verify underlying physical storage remained empty due to quota rejection
  assert.equal(underlyingMap.has(STORAGE_KEY_ACTIVE_RUN), false);
});

test('ChaosQA-8 1.2: WebStorageAdapter gracefully degrades upon localStorage QuotaExceededError for Meta-Profile', () => {
  let quotaFaultActive = true;
  const underlyingMap = new Map();

  const mockStorage = {
    getItem: (key) => underlyingMap.get(key) ?? null,
    setItem: (key, val) => {
      if (quotaFaultActive) {
        throw createStorageQuotaError('localStorage quota exceeded on desktop Chrome');
      }
      underlyingMap.set(key, String(val));
    },
    removeItem: (key) => underlyingMap.delete(key),
    clear: () => underlyingMap.clear(),
  };

  const localAdapter = new WebStorageAdapter('local');
  // @ts-expect-error Inject mock underlying storage
  localAdapter.storage = mockStorage;

  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), localAdapter);

  const customProfile = {
    ...persistence.createDefaultMetaProfile(),
    cosmicEssence: 1250,
    starCandies: 450,
    perks: { sugar_spark: 3, quick_wick: 2 },
  };

  // Saving meta profile under quota fault must succeed without throwing
  assert.doesNotThrow(() => {
    const envelope = persistence.saveMetaProfile(customProfile);
    assert.ok(envelope);
    assert.equal(envelope.checksum.length, 24);
  });

  // Loading meta profile returns the updated in-memory profile, NOT stale default
  const loaded = persistence.loadMetaProfile();
  assert.equal(loaded.cosmicEssence, 1250);
  assert.equal(loaded.starCandies, 450);
  assert.equal(loaded.perks.sugar_spark, 3);
  assert.equal(loaded.perks.quick_wick, 2);
});

/* ==============================================================================
 * SCENARIO 2: DUAL QUOTA CRISIS (HTTP 429 + STORAGE QUOTA EXCEEDED)
 * ============================================================================== */

test('ChaosQA-8 2.1: Dual Quota Exhaustion: Simultaneous HTTP 429 and Browser QuotaExceededError preserves state without game crash', async () => {
  const sessionUnderlyingMap = new Map();

  // Storage that throws QuotaExceededError on all writes
  const failingStorage = {
    getItem: (key) => sessionUnderlyingMap.get(key) ?? null,
    setItem: () => {
      throw createStorageQuotaError('Disk space exhausted / Private Browsing Quota Reached');
    },
    removeItem: (key) => sessionUnderlyingMap.delete(key),
    clear: () => sessionUnderlyingMap.clear(),
  };

  const sessionAdapter = new WebStorageAdapter('session');
  // @ts-expect-error Inject failing storage
  sessionAdapter.storage = failingStorage;

  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 200,
    maxBackoffMs: 2000,
    maxQueueSize: 20,
  });

  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter(), cb);

  const activeMatch = createMockRunState({
    score: 35000,
    hp: 1,
    stageIndex: 4,
  });

  // External HTTP 429 Quota Exceeded error arrives
  const apiQuotaError = {
    status: 429,
    message: 'Google Gemini API quota exceeded (RESOURCE_EXHAUSTED)',
    headers: { 'retry-after': '2' },
  };

  // handleApiError must handle BOTH 429 AND storage QuotaExceededError without throwing
  await assert.doesNotReject(async () => {
    await persistence.handleApiError(apiQuotaError, () => activeMatch);
  });

  // Verify Circuit Breaker invariants:
  assert.equal(cb.isOpen(), true, 'Circuit Breaker must be in OPEN state');
  assert.equal(cb.getConsecutive429s(), 1);
  assert.ok(cb.getNextAttemptTime() > Date.now());

  // Verify Persistence invariants:
  const restored = persistence.loadRunState();
  assert.ok(restored, 'State must be recovered from memory fallback');
  assert.equal(restored.saveTrigger, 'quota_429', 'Save trigger must be tagged quota_429');
  assert.equal(restored.meta.score, 35000);
  assert.equal(restored.player.hp, 1);
  assert.equal(verifyChecksum(restored, restored.checksum), true);

  // Verify offline queueing during dual quota crisis:
  const executionLog = [];
  const queuedPromises = [];

  for (let i = 0; i < 10; i++) {
    const p = cb.execute(async () => {
      executionLog.push(i);
      return `queued_sync_${i}`;
    });
    queuedPromises.push(p);
  }

  assert.equal(cb.getQueueLength(), 10, 'All 10 requests must queue offline');
  assert.equal(executionLog.length, 0, 'No requests execute while OPEN');

  // Recovery: remote server quota clears
  cb.recordSuccess();
  assert.equal(cb.isClosed(), true);

  await Promise.all(queuedPromises);
  assert.equal(executionLog.length, 10);
  assert.equal(cb.getQueueLength(), 0);

  cb.reset();
});

test('ChaosQA-8 2.2: Dual Quota Exhaustion: Failsafe fallback to cachedActiveRun when currentStateProvider also throws', async () => {
  const sessionAdapter = new WebStorageAdapter('session');
  // @ts-expect-error Mock storage that always throws
  sessionAdapter.storage = {
    getItem: () => null,
    setItem: () => {
      throw createStorageQuotaError('Storage completely full');
    },
    removeItem: () => {},
    clear: () => {},
  };

  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  // Seed cachedActiveRun
  const cachedMatch = createMockRunState({ score: 14000, hp: 3 });
  persistence.saveRunState(cachedMatch);

  // Triple-fault scenario:
  // 1) Remote API returns 429
  // 2) currentStateProvider throws catastrophic runtime error
  // 3) Storage throws QuotaExceededError
  const catastrophicProvider = () => {
    throw new Error('GameStateProvider unhandled pointer exception!');
  };

  await assert.doesNotReject(async () => {
    await persistence.handleApiError({ status: 429 }, catastrophicProvider);
  });

  // State must fall back to cachedActiveRun and tagged quota_429
  const loaded = persistence.loadRunState();
  assert.ok(loaded);
  assert.equal(loaded.saveTrigger, 'quota_429');
  assert.equal(loaded.meta.score, 14000);
  assert.equal(verifyChecksum(loaded, loaded.checksum), true);

  persistence.getCircuitBreaker().reset();
});

/* ==============================================================================
 * SCENARIO 3: STORAGE QUOTA RELIEF & SELF-HEALING RECOVERY
 * ============================================================================== */

test('ChaosQA-8 3.1: Storage Quota Relief: Seamless transition back to physical storage when space is freed', () => {
  let quotaExceeded = true;
  const underlyingMap = new Map();

  const simulatedBrowserStorage = {
    getItem: (key) => underlyingMap.get(key) ?? null,
    setItem: (key, val) => {
      if (quotaExceeded) {
        throw createStorageQuotaError('QuotaExceededError');
      }
      underlyingMap.set(key, String(val));
    },
    removeItem: (key) => underlyingMap.delete(key),
    clear: () => underlyingMap.clear(),
  };

  const adapter = new WebStorageAdapter('local');
  // @ts-expect-error Inject simulated storage
  adapter.storage = simulatedBrowserStorage;

  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), adapter);

  // Phase 1: Storage quota is exceeded
  const profilePhase1 = {
    ...persistence.createDefaultMetaProfile(),
    cosmicEssence: 300,
  };
  persistence.saveMetaProfile(profilePhase1);

  // Must read phase 1 from memory fallback
  assert.equal(persistence.loadMetaProfile().cosmicEssence, 300);
  assert.equal(underlyingMap.has(STORAGE_KEY_META_PROFILE), false);

  // Phase 2: Browser frees space (quota relief)
  quotaExceeded = false;

  const profilePhase2 = {
    ...persistence.createDefaultMetaProfile(),
    cosmicEssence: 600,
  };
  persistence.saveMetaProfile(profilePhase2);

  // Must now exist in physical storage
  assert.equal(underlyingMap.has(STORAGE_KEY_META_PROFILE), true);

  // Loading returns the latest profile from healthy storage
  const loaded = persistence.loadMetaProfile();
  assert.equal(loaded.cosmicEssence, 600);
});

/* ==============================================================================
 * SCENARIO 4: 1,000-CYCLE HIGH-STRESS PERSISTENCE & QUOTA SIMULATION
 * ============================================================================== */

test('ChaosQA-8 4.1: 1,000-cycle high-stress quota recovery simulation executes with zero crashes and strict integrity', async () => {
  let storageQuotaFault = false;
  const storageMap = new Map();

  const flakyStorage = {
    getItem: (key) => storageMap.get(key) ?? null,
    setItem: (key, val) => {
      if (storageQuotaFault) {
        throw createStorageQuotaError('Flaky mobile browser quota exceeded');
      }
      storageMap.set(key, String(val));
    },
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  const sessionAdapter = new WebStorageAdapter('session');
  // @ts-expect-error Inject flaky storage
  sessionAdapter.storage = flakyStorage;

  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 20,
    maxBackoffMs: 100,
    jitterRatio: 0.1,
    maxQueueSize: 50,
  });

  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter(), cb);

  let quota429Events = 0;
  let normalSaves = 0;
  let drainedRequests = 0;

  for (let cycle = 1; cycle <= 1000; cycle++) {
    // Alternate storage quota condition every 10 cycles
    storageQuotaFault = (cycle % 10 < 4);

    const matchState = createMockRunState({
      score: 1000 + cycle * 5,
      stageIndex: (cycle % 5) + 1,
    });

    if (cycle % 7 === 0) {
      // Inject API 429 quota exhaustion
      quota429Events++;
      await persistence.handleApiError(
        { status: 429, message: `Throttled cycle #${cycle}` },
        () => matchState
      );
      assert.equal(cb.isOpen(), true);

      // Enqueue telemetry request while OPEN
      const p = cb.execute(async () => {
        drainedRequests++;
        return 'telemetry_ok';
      });

      // Advance breaker recovery
      cb.recordSuccess();
      assert.equal(cb.isClosed(), true);
      await p;
    } else {
      // Normal game state save
      normalSaves++;
      persistence.saveRunState(matchState);
    }

    // Load and verify state integrity every 50 cycles
    if (cycle % 50 === 0) {
      const current = persistence.loadRunState();
      assert.ok(current, `State must exist at cycle ${cycle}`);
      assert.ok(current.meta.score >= 1000);
      assert.equal(verifyChecksum(current, current.checksum), true, `Checksum must be valid at cycle ${cycle}`);
      assert.equal(current.board.rows, 13);
      assert.equal(current.board.cols, 15);
    }
  }

  assert.ok(quota429Events > 100, 'Must have injected >100 429 quota events');
  assert.ok(normalSaves > 800, 'Must have completed >800 normal saves');
  assert.equal(drainedRequests, quota429Events, 'All enqueued requests must have drained');

  cb.reset();
});
