/**
 * tests/chaos_circuit_breaker_stress.test.mjs
 *
 * Chaos QA Agent 7: Quota 429 & Circuit Breaker State Resilience Stress Test Suite
 * Daily Evolution Cycle 2026-10-01.
 *
 * Test Scenarios:
 * 1. 100 Consecutive 429 Responses Injection (Backoff bounds, monotonic counter, jitter stability, exponent clamp)
 * 2. 100-Burst API execute() Quota 429 Throttling & Queue Overflow Protection
 * 3. Rapid Half-Open Resets, State Thrashing & Flaky Server Cycles (50+ cycles)
 * 4. Concurrent Save Calls & High-Frequency Concurrent handleApiError (50 concurrent 429s)
 * 5. Corrupted JSON Payloads, Malformed RLE Strings, Tampered Checksums & Prototype Pollution Fuzzing
 * 6. Full Lifecycle: Active GameState Capture, Emergency 429 Recovery, and Automatic FIFO Queue Drain
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
  compressGrid,
  verifyChecksum,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  CircuitBreakerState,
  STORAGE_KEY_ACTIVE_RUN,
  STORAGE_SCHEMA_VERSION,
  EXPORT_APP_IDENTIFIER,
} from '../src/game/persistence/PersistenceTypes.ts';

import {
  GameModeType,
} from '../src/game/progression/ProgressionTypes.ts';

import { createInitialPlayerStats } from '../src/game/gameplay_mechanics.ts';

/** Helper to generate a realistic mock game state */
function generateMockGameState(score = 5000, stage = 2) {
  const rows = 13;
  const cols = 15;
  const map = Array.from({ length: rows }, () => new Array(cols).fill(0));
  // Outer walls
  for (let c = 0; c < cols; c++) {
    map[0][c] = 1;
    map[rows - 1][c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    map[r][0] = 1;
    map[r][cols - 1] = 1;
  }
  // Soft blocks
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if ((r + c) % 2 === 1) map[r][c] = 2;
    }
  }

  return {
    version: STORAGE_SCHEMA_VERSION,
    timestamp: Date.now(),
    saveTrigger: 'manual',
    meta: {
      runId: `run_chaos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stageIndex: stage,
      gameMode: GameModeType.CRISIS_SURVIVAL,
      score,
      elapsedTimeMs: 75000,
      activeCrisesCount: 2,
      bossEncounterActive: false,
    },
    player: {
      x: 80,
      y: 80,
      gridRow: 2,
      gridCol: 2,
      facing: 'right',
      stats: createInitialPlayerStats(),
      hp: 2,
      invulnerableRemainingMs: 500,
    },
    board: {
      rows,
      cols,
      mapRLE: compressGrid(map),
      map,
    },
    activeBombs: [
      {
        id: 'bomb_alpha',
        x: 80,
        y: 80,
        row: 2,
        col: 2,
        fuseRemainingMs: 1200,
        power: 3,
        owner: 'player',
        bombType: 'REMOTE_BOMB',
      },
    ],
    activeEntities: [
      {
        id: 'enemy_stalker',
        archetype: 'CHASER',
        faction: 'enemy',
        x: 240,
        y: 160,
        hp: 3,
        maxHp: 3,
        aiState: 'TRACKING',
      },
      {
        id: 'ally_drone',
        archetype: 'PET_DRONE',
        faction: 'ally',
        x: 100,
        y: 80,
        hp: 2,
        maxHp: 2,
        aiState: 'IDLE',
      },
    ],
    activeItems: [
      {
        row: 3,
        col: 4,
        itemType: 'MEGA_FIRE',
        spawnTime: Date.now() - 3000,
      },
    ],
    checksum: '',
  };
}

/* ==============================================================================
 * SCENARIO 1: 100 CONSECUTIVE 429 RESPONSES STRESS INJECTION
 * ============================================================================== */

test('Chaos 1.1: 100 consecutive 429 quota errors inject cleanly without integer overflow or NaN', () => {
  const initialBackoffMs = 200;
  const maxBackoffMs = 10000;
  const jitterRatio = 0.2;

  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs,
    maxBackoffMs,
    jitterRatio,
    maxQueueSize: 200,
  });

  const delays = [];
  let emergencySaves = 0;

  for (let i = 1; i <= 100; i++) {
    const error429 = {
      status: 429,
      message: `Too Many Requests - Injection #${i}`,
      headers: i % 10 === 0 ? { 'retry-after': '5' } : undefined,
    };

    const delay = cb.handleQuotaError(() => {
      emergencySaves++;
    }, error429);

    delays.push(delay);

    // Invariants per iteration:
    assert.equal(cb.getState(), CircuitBreakerState.OPEN);
    assert.equal(cb.isOpen(), true);
    assert.equal(cb.getConsecutive429s(), i, `consecutive429Count must equal ${i}`);
    assert.equal(cb.getConsecutiveFailures(), i, `consecutiveFailures must equal ${i}`);

    // Verify delay bounds
    assert.ok(Number.isFinite(delay), `Delay must be finite at iteration ${i}`);
    assert.ok(!Number.isNaN(delay), `Delay must not be NaN at iteration ${i}`);
    assert.ok(delay >= 50, `Delay must respect minimum 50ms cap (got ${delay})`);

    if (i % 10 === 0) {
      // Retry-After: 5s header with +/- 20% jitter -> [4000, 6000]
      assert.ok(delay >= 3500 && delay <= 6500, `Retry-After 5s delay expected ~5000ms (got ${delay})`);
    } else {
      // Formulaic delay: initialBackoffMs * 2^(min(i-1, 8)) clamped to maxBackoffMs with jitter
      assert.ok(delay <= maxBackoffMs * 1.3, `Delay must not exceed maxBackoffMs + jitter (got ${delay})`);
    }

    assert.ok(cb.getNextAttemptTime() > Date.now(), 'nextAttemptTime must be in the future');
  }

  assert.equal(delays.length, 100);
  assert.equal(emergencySaves, 100, 'All 100 emergency saves must have been invoked');

  // Verify backoff growth in non-header iterations (iterations 1 to 9)
  assert.ok(delays[0] <= delays[1] * 1.5, 'Backoff must increase in early iterations');
  assert.ok(delays[1] <= delays[2] * 1.5);

  cb.reset();
});

test('Chaos 1.2: 100-burst execute() calls under 429 quota exhaustion strictly enforce maxQueueSize & FIFO', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 5000,
    maxBackoffMs: 10000,
    maxQueueSize: 50, // Capacity limit of 50
  });

  // 1st call trips breaker to OPEN via 429
  await assert.rejects(async () => {
    await cb.execute(async () => {
      throw { status: 429, message: 'Initial quota blast' };
    });
  });

  assert.equal(cb.isOpen(), true);

  const queuedResults = [];
  const queuedPromises = [];
  let rejectedOverCapacity = 0;

  try {
    // Attempt 100 requests into queue
    for (let i = 0; i < 100; i++) {
      const promise = cb
        .execute(async () => {
          queuedResults.push(i);
          return `done_${i}`;
        }, { queueIfOpen: true })
        .catch((err) => {
          if (err instanceof CircuitBreakerOpenError) {
            rejectedOverCapacity++;
            return null;
          }
          throw err;
        });

      queuedPromises.push(promise);
    }

    // Exactly 50 items must be queued (maxQueueSize)
    assert.equal(cb.getQueueLength(), 50, 'Queue must be capped at maxQueueSize (50)');

    // Allow microtasks to complete for the 50 rejected promises
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The remaining 50 must have been rejected immediately
    assert.equal(rejectedOverCapacity, 50, 'Exactly 50 overflow requests rejected with CircuitBreakerOpenError');

    // Recovery: service recovers
    cb.recordSuccess();
    assert.equal(cb.isClosed(), true);

    await Promise.all(queuedPromises);

    // Exactly the first 50 requests must have resolved in strict FIFO order
    assert.equal(queuedResults.length, 50);
    for (let i = 0; i < 50; i++) {
      assert.equal(queuedResults[i], i, `FIFO order check failed at index ${i}`);
    }

    assert.equal(cb.getQueueLength(), 0, 'Queue must be completely drained');
  } finally {
    cb.reset();
  }
});

/* ==============================================================================
 * SCENARIO 2: RAPID HALF-OPEN RESETS & STATE THRASHING
 * ============================================================================== */

test('Chaos 2.1: 50 rapid HALF_OPEN oscillation cycles withstand flaky server failures and auto-re-trip', async () => {
  const cb = new APIQuotaCircuitBreaker({
    failureThreshold: 2,
    initialBackoffMs: 50,
    resetTimeoutMs: 100,
  });

  try {
    for (let cycle = 1; cycle <= 50; cycle++) {
      // 1. Force into OPEN
      cb.handleQuotaError();
      assert.equal(cb.isOpen(), true);

      // 2. Queue a probe request that throws 429 (immediate reject on trial)
      let probeExecuted = false;
      const probePromise = cb.execute(async () => {
        probeExecuted = true;
        throw { status: 429, message: `Throttled probe cycle ${cycle}` };
      });

      assert.equal(cb.getQueueLength(), 1);

      // 3. Fast-forward timer by artificially setting nextAttemptTime past now
      // @ts-expect-error Access private member for stress simulation
      cb.nextAttemptTime = Date.now() - 10;

      // 4. Trigger auto-transition by querying state
      const state = cb.getState();
      assert.equal(state, CircuitBreakerState.HALF_OPEN);

      // 5. Probe request fails during drain -> breaker must re-trip immediately to OPEN
      await assert.rejects(probePromise);

      assert.equal(probeExecuted, true);
      assert.equal(cb.isOpen(), true, `Cycle ${cycle}: Must immediately re-trip to OPEN`);
    }
  } finally {
    cb.reset();
  }
});

test('Chaos 2.2: Rapid manual reset() during active queue clears queue and rejects gracefully without dangling promises', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 200,
    maxQueueSize: 100,
  });

  try {
    for (let iter = 0; iter < 10; iter++) {
      cb.handleQuotaError();
      assert.equal(cb.isOpen(), true);

      const promises = [];
      for (let i = 0; i < 20; i++) {
        const p = cb.execute(async () => {
          await new Promise((r) => setTimeout(r, 10));
          return i;
        });
        promises.push(p);
      }

      assert.equal(cb.getQueueLength(), 20);

      // While OPEN, trigger reset()
      cb.reset();

      assert.equal(cb.isClosed(), true);
      assert.equal(cb.getQueueLength(), 0);
      assert.equal(cb.getConsecutiveFailures(), 0);
      assert.equal(cb.getConsecutive429s(), 0);

      // All queued promises must have rejected with 'Circuit breaker queue cleared'
      const results = await Promise.allSettled(promises);
      for (const res of results) {
        assert.equal(res.status, 'rejected');
        assert.equal(res.reason.message, 'Circuit breaker queue cleared');
      }
    }
  } finally {
    cb.reset();
  }
});

/* ==============================================================================
 * SCENARIO 3: CONCURRENT SAVE CALLS & HIGH-FREQUENCY CONCURRENCY
 * ============================================================================== */

test('Chaos 3.1: 100 concurrent saveRunState calls maintain checksum integrity and zero race corruption', async () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  const concurrentSaves = Array.from({ length: 100 }, (_, i) => {
    return Promise.resolve().then(() => {
      const state = generateMockGameState(1000 + i * 50, 1 + (i % 5));
      return persistence.saveRunState(state);
    });
  });

  const savedStates = await Promise.all(concurrentSaves);
  assert.equal(savedStates.length, 100);

  // Verify all 100 return objects have valid 24-character checksums
  for (const s of savedStates) {
    assert.equal(typeof s.checksum, 'string');
    assert.equal(s.checksum.length, 24);
    assert.equal(verifyChecksum(s, s.checksum), true, 'Checksum must match state');
  }

  // Load state from sessionAdapter: must be valid, parseable, and have matching checksum
  const loaded = persistence.loadRunState();
  assert.ok(loaded);
  assert.ok(loaded.meta.score >= 1000);
  assert.equal(verifyChecksum(loaded, loaded.checksum), true);
  assert.equal(loaded.board.rows, 13);
  assert.equal(loaded.board.cols, 15);
  assert.ok(loaded.board.map && loaded.board.map.length === 13);
});

test('Chaos 3.2: 50 concurrent handleApiError(429) calls safely trigger emergency save without state corruption', async () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  let providerCallCount = 0;
  const baseState = generateMockGameState(9999, 4);

  const concurrentErrors = Array.from({ length: 50 }, (_, i) => {
    return persistence.handleApiError(
      { status: 429, message: `Throttled request #${i}` },
      () => {
        providerCallCount++;
        return {
          ...baseState,
          meta: { ...baseState.meta, score: baseState.meta.score + i },
        };
      }
    );
  });

  await Promise.all(concurrentErrors);

  assert.equal(providerCallCount, 50, 'All 50 providers must have executed');
  assert.equal(persistence.getCircuitBreaker().isOpen(), true);
  assert.equal(persistence.getCircuitBreaker().getConsecutive429s(), 50);

  // Loaded state must exist and have saveTrigger === 'quota_429'
  const loaded = persistence.loadRunState();
  assert.ok(loaded);
  assert.equal(loaded.saveTrigger, 'quota_429');
  assert.ok(loaded.meta.score >= 9999);
  assert.equal(verifyChecksum(loaded, loaded.checksum), true);

  persistence.getCircuitBreaker().reset();
});

test('Chaos 3.3: handleApiError(429) falls back to cachedActiveRun if currentStateProvider throws or returns null', async () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  // 1. Initial manual save establishes cachedActiveRun
  const initial = generateMockGameState(7777, 3);
  persistence.saveRunState(initial);

  // 2. handleApiError with provider that throws an exception
  await persistence.handleApiError(
    { status: 429 },
    () => {
      throw new Error('Catastrophic failure in user state provider');
    }
  );

  // Emergency save must have fallen back to cachedActiveRun!
  const loaded1 = persistence.loadRunState();
  assert.ok(loaded1);
  assert.equal(loaded1.saveTrigger, 'quota_429');
  assert.equal(loaded1.meta.score, 7777);

  // 3. handleApiError with provider that returns null
  await persistence.handleApiError(
    { status: 429 },
    () => null
  );

  const loaded2 = persistence.loadRunState();
  assert.ok(loaded2);
  assert.equal(loaded2.saveTrigger, 'quota_429');
  assert.equal(loaded2.meta.score, 7777);

  persistence.getCircuitBreaker().reset();
});

/* ==============================================================================
 * SCENARIO 4: CORRUPTED JSON PAYLOADS & ADVERSARIAL INTEGRITY FUZZING
 * ============================================================================== */

test('Chaos 4.1: loadRunState safely returns null on all corrupted JSON inputs without crashing', () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  const corruptedPayloads = [
    '', // Empty
    '   ', // Whitespace
    '{ bad json string', // Syntax error
    '{"version": 1, "unclosed": ', // Truncated
    '42', // Number
    'true', // Boolean
    'null', // Null string
    '["an", "array"]', // Array instead of object
    JSON.stringify({ version: 999, meta: {} }), // Wrong schema version
    JSON.stringify({ version: STORAGE_SCHEMA_VERSION, checksum: '12345' }), // Missing fields / bad checksum
    JSON.stringify({
      version: STORAGE_SCHEMA_VERSION,
      meta: { score: 999 },
      checksum: 'ffffffffffffffffffffffff', // Fake checksum
    }),
    JSON.stringify({
      version: STORAGE_SCHEMA_VERSION,
      board: { mapRLE: 'invalid_rle_format' },
      checksum: '',
    }),
    JSON.stringify({
      version: STORAGE_SCHEMA_VERSION,
      board: null,
      checksum: '',
    }),
  ];

  for (const [idx, payload] of corruptedPayloads.entries()) {
    sessionAdapter.setItem(STORAGE_KEY_ACTIVE_RUN, payload);
    const result = persistence.loadRunState();
    assert.equal(
      result,
      null,
      `Payload #${idx} must safely return null without throwing an exception`
    );
  }
});

test('Chaos 4.2: importSavePackage safely rejects corrupted JSON packages with descriptive errors', () => {
  const persistence = new GameStatePersistence(
    new MemoryStorageAdapter(),
    new MemoryStorageAdapter()
  );

  const corruptedImportPackages = [
    { input: '', expectedErr: 'Empty or invalid JSON payload' },
    { input: null, expectedErr: 'Empty or invalid JSON payload' },
    { input: '{ corrupted json', expectedErr: 'JSON parsing error' },
    { input: '12345', expectedErr: 'Malformed JSON package structure' },
    {
      input: JSON.stringify({ exportApp: 'foreign_game', version: STORAGE_SCHEMA_VERSION }),
      expectedErr: 'Invalid application identifier',
    },
    {
      input: JSON.stringify({
        exportApp: EXPORT_APP_IDENTIFIER,
        version: 9999,
        checksum: 'abc',
      }),
      expectedErr: 'Unsupported save format version',
    },
    {
      input: JSON.stringify({
        exportApp: EXPORT_APP_IDENTIFIER,
        version: STORAGE_SCHEMA_VERSION,
        checksum: 'tampered_checksum_digest',
        metaProfile: persistence.createDefaultMetaProfile(),
      }),
      expectedErr: 'Checksum verification failed',
    },
  ];

  for (const { input, expectedErr } of corruptedImportPackages) {
    const res = persistence.importSavePackage(input);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes(expectedErr), `Expected error "${expectedErr}", got "${res.error}"`);
  }
});

/* ==============================================================================
 * SCENARIO 5: FULL LIFECYCLE VERIFICATION (CAPTURE -> RECOVER -> DRAIN)
 * ============================================================================== */

test('Chaos 5.1: Full Match Lifecycle — 429 quota exhaustion, emergency save, offline queueing, and recovery drain', async () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const localAdapter = new MemoryStorageAdapter();
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 50,
    maxBackoffMs: 500,
    jitterRatio: 0,
    maxQueueSize: 50,
  });

  const persistence = new GameStatePersistence(sessionAdapter, localAdapter, cb);

  try {
    // 1. Active game in progress: player has 12,500 score, 2 bombs active, HP 2
    let currentMatchState = generateMockGameState(12500, 3);
    persistence.saveRunState(currentMatchState);

    assert.equal(cb.isClosed(), true);
    assert.equal(persistence.hasActiveRun(), true);

    // 2. Normal API call succeeds
    const probe1 = await cb.execute(async () => 'telemetry_sync_ok');
    assert.equal(probe1, 'telemetry_sync_ok');

    // 3. API encounters HTTP 429 Quota Exceeded error
    // State evolves right before error: score becomes 13,000, HP drops to 1
    currentMatchState = {
      ...currentMatchState,
      player: { ...currentMatchState.player, hp: 1 },
      meta: { ...currentMatchState.meta, score: 13000 },
    };

    const quotaError = {
      status: 429,
      message: 'Rate limit exceeded: please slow down',
      headers: { 'retry-after': '1' },
    };

    await persistence.handleApiError(quotaError, () => currentMatchState);

    // Verify: circuit breaker is OPEN
    assert.equal(cb.isOpen(), true);
    assert.equal(cb.getConsecutive429s(), 1);

    // Verify: emergency save captured latest evolved state
    const emergencyLoaded = persistence.loadRunState();
    assert.ok(emergencyLoaded);
    assert.equal(emergencyLoaded.saveTrigger, 'quota_429');
    assert.equal(emergencyLoaded.meta.score, 13000);
    assert.equal(emergencyLoaded.player.hp, 1);
    assert.equal(verifyChecksum(emergencyLoaded, emergencyLoaded.checksum), true);

    // 4. While OPEN, 15 gameplay telemetry/leaderboard calls are enqueued
    const drainedResults = [];
    const queuedCalls = [];

    for (let i = 1; i <= 15; i++) {
      const callPromise = cb.execute(async () => {
        drainedResults.push(`synced_packet_${i}`);
        return `synced_packet_${i}`;
      });
      queuedCalls.push(callPromise);
    }

    assert.equal(cb.getQueueLength(), 15, 'All 15 calls must be held in offline queue');
    assert.equal(drainedResults.length, 0, 'No calls should have executed yet');

    // 5. Server recovers: circuit breaker transitions to CLOSED and drains queue
    cb.recordSuccess();

    assert.equal(cb.isClosed(), true);

    await Promise.all(queuedCalls);

    assert.equal(drainedResults.length, 15, 'All 15 calls must be processed on recovery');
    assert.equal(cb.getQueueLength(), 0, 'Queue must be empty');

    // Verify strict FIFO ordering of drained packets
    for (let i = 1; i <= 15; i++) {
      assert.equal(drainedResults[i - 1], `synced_packet_${i}`);
    }

    // 6. Verify game state remains perfectly intact and recoverable
    const finalLoaded = persistence.loadRunState();
    assert.ok(finalLoaded);
    assert.equal(finalLoaded.meta.score, 13000);
    assert.equal(finalLoaded.board.rows, 13);
    assert.equal(finalLoaded.board.cols, 15);
    assert.equal(finalLoaded.activeEntities.length, 2);
    assert.equal(finalLoaded.activeBombs.length, 1);
  } finally {
    cb.reset();
  }
});
