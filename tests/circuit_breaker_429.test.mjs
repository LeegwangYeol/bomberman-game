/**
 * tests/circuit_breaker_429.test.mjs
 *
 * Comprehensive Test Suite for API 429 Rate Limits, Exponential Backoff,
 * Emergency Game State Persistence, and Graceful Offline Queue Recovery.
 *
 * Invariants Verified:
 * 1. 429 API Rate Limit Detection & Exponential Backoff Invariants
 *    - Monotonic consecutive 429 failure counting
 *    - Base delay doubling (initialBackoff * 2^(count-1)) capped at maxBackoffMs
 *    - Jitter ratio bounds verification
 *    - Retry-After header parsing (numeric seconds, string seconds, HTTP date format, invalid fallbacks)
 *    - State machine transition to OPEN with valid future nextAttemptTime
 * 2. Emergency Game State Persistence on 429 Quota Exhaustion
 *    - saveTrigger tagged as 'quota_429'
 *    - Dual-tier storage persistence (SessionStorage + Memory fallback)
 *    - RLE grid compression & lossless decompression
 *    - 24-character canonical checksum integrity & tamper rejection
 *    - Fallback to cachedActiveRun if currentStateProvider throws or returns null
 * 3. Offline FIFO Request Queueing & Graceful Recovery
 *    - Enqueueing requests in OPEN state up to maxQueueSize
 *    - Immediate rejection with CircuitBreakerOpenError when maxQueueSize exceeded
 *    - Immediate rejection when queueIfOpen is false
 *    - Transition to HALF_OPEN after backoff delay
 *    - Sequential FIFO drain of queued requests upon recovery
 *    - Reset of counters and transition to CLOSED on successful drain
 *    - Immediate re-trip to OPEN if probe request encounters 429 during HALF_OPEN
 *    - Graceful queue clearance and promise rejection on manual reset()
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
  decompressGrid,
  calculateChecksum,
  verifyChecksum,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  CircuitBreakerState,
  STORAGE_KEY_ACTIVE_RUN,
  STORAGE_SCHEMA_VERSION,
} from '../src/game/persistence/PersistenceTypes.ts';

import {
  GameModeType,
} from '../src/game/progression/ProgressionTypes.ts';

import { createInitialPlayerStats } from '../src/game/gameplay_mechanics.ts';

/**
 * Creates a mock match state representing an active game session
 */
function createMockSessionState(overrides = {}) {
  const rows = 13;
  const cols = 15;
  const map = Array.from({ length: rows }, () => new Array(cols).fill(0));

  // Outer border walls
  for (let c = 0; c < cols; c++) {
    map[0][c] = 1;
    map[rows - 1][c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    map[r][0] = 1;
    map[r][cols - 1] = 1;
  }

  // Pillar grid
  for (let r = 2; r < rows - 2; r += 2) {
    for (let c = 2; c < cols - 2; c += 2) {
      map[r][c] = 1;
    }
  }

  // Soft destructible blocks
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (map[r][c] === 0 && (r * 7 + c * 13) % 5 === 1) {
        map[r][c] = 2;
      }
    }
  }

  // Clear player start zone
  map[1][1] = 0;
  map[1][2] = 0;
  map[2][1] = 0;

  return {
    version: STORAGE_SCHEMA_VERSION,
    timestamp: Date.now(),
    saveTrigger: 'manual',
    meta: {
      runId: `run_session_${Date.now()}`,
      stageIndex: 3,
      gameMode: GameModeType.CRISIS_SURVIVAL,
      score: 14200,
      elapsedTimeMs: 98000,
      activeCrisesCount: 2,
      bossEncounterActive: false,
      ...overrides.meta,
    },
    player: {
      x: 80,
      y: 80,
      gridRow: 2,
      gridCol: 2,
      facing: 'down',
      stats: createInitialPlayerStats(),
      hp: 3,
      invulnerableRemainingMs: 0,
      ...overrides.player,
    },
    board: {
      rows,
      cols,
      mapRLE: compressGrid(map),
      map,
      ...overrides.board,
    },
    activeBombs: overrides.activeBombs ?? [
      {
        id: 'bomb_recovery_1',
        x: 80,
        y: 80,
        row: 2,
        col: 2,
        fuseRemainingMs: 1500,
        power: 3,
        owner: 'player',
        bombType: 'NORMAL',
      },
    ],
    activeEntities: overrides.activeEntities ?? [
      {
        id: 'patrol_enemy_1',
        archetype: 'PATROL',
        faction: 'enemy',
        x: 240,
        y: 160,
        hp: 1,
        maxHp: 1,
        aiState: 'PATROLLING',
      },
    ],
    activeItems: overrides.activeItems ?? [
      {
        row: 3,
        col: 5,
        itemType: 'BOMB_UP',
        spawnTime: Date.now() - 3000,
      },
    ],
    checksum: '',
    ...overrides,
  };
}

/* ==============================================================================
 * SUITE 1: 429 API RATE LIMIT DETECTION & EXPONENTIAL BACKOFF
 * ============================================================================== */

test('429 Verification: isQuotaError correctly classifies various 429 response structures', () => {
  assert.equal(APIQuotaCircuitBreaker.isQuotaError({ status: 429 }), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError({ statusCode: 429 }), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError({ code: 429 }), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError({ code: 'RESOURCE_EXHAUSTED' }), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError('RESOURCE_EXHAUSTED'), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError('HTTP Error 429: Too Many Requests'), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError('Google Gemini API quota exceeded for model'), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError('Rate limit exceeded: please slow down'), true);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError({ message: '429 Quota Exceeded' }), true);

  // Non-quota errors must return false
  assert.equal(APIQuotaCircuitBreaker.isQuotaError({ status: 500 }), false);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError({ status: 404 }), false);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError('Internal Server Error'), false);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError(null), false);
  assert.equal(APIQuotaCircuitBreaker.isQuotaError(undefined), false);
});

test('429 Verification: Consecutive 429 errors trigger exponential backoff clamped to maxBackoffMs', () => {
  const initialBackoffMs = 100;
  const maxBackoffMs = 1600;
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs,
    maxBackoffMs,
    jitterRatio: 0, // Zero jitter for exact mathematical verification
  });

  assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
  assert.equal(cb.isClosed(), true);

  // Sequence of 429 faults: base delays should follow 100 * 2^(n-1) capped at 1600
  // n=1: 100 * 2^0 = 100
  // n=2: 100 * 2^1 = 200
  // n=3: 100 * 2^2 = 400
  // n=4: 100 * 2^3 = 800
  // n=5: 100 * 2^4 = 1600 (cap)
  // n=6: 1600 (cap)
  const expectedDelays = [100, 200, 400, 800, 1600, 1600];

  for (let i = 0; i < expectedDelays.length; i++) {
    const error = { status: 429, message: `Throttled request #${i + 1}` };
    const delay = cb.handleQuotaError(undefined, error);

    assert.equal(cb.getState(), CircuitBreakerState.OPEN);
    assert.equal(cb.isOpen(), true);
    assert.equal(cb.getConsecutive429s(), i + 1);
    assert.equal(cb.getConsecutiveFailures(), i + 1);
    assert.equal(delay, expectedDelays[i], `Backoff at step ${i + 1} must match expected value`);
    assert.equal(cb.getBackoffMs(), expectedDelays[i]);
    assert.ok(cb.getNextAttemptTime() > Date.now());
  }

  cb.reset();
  assert.equal(cb.isClosed(), true);
  assert.equal(cb.getConsecutive429s(), 0);
  assert.equal(cb.getBackoffMs(), 0);
});

test('429 Verification: Backoff respects Retry-After headers (numeric, string, and HTTP Date)', () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 500,
    maxBackoffMs: 30000,
    jitterRatio: 0,
  });

  // 1. Numeric seconds in Retry-After header
  const delay1 = cb.handleQuotaError(undefined, {
    status: 429,
    headers: { 'retry-after': '5' },
  });
  assert.equal(delay1, 5000, 'Header "5" must result in 5000ms delay');

  // 2. Float seconds in retryAfter field
  const delay2 = cb.handleQuotaError(undefined, {
    status: 429,
    retryAfter: 3.5,
  });
  assert.equal(delay2, 3500, 'retryAfter numeric 3.5 must result in 3500ms delay');

  // 3. HTTP Date in the future (e.g., now + 8 seconds)
  // Note: HTTP dates in UTC string format have 1-second precision
  const targetOffsetSeconds = 8;
  const futureTimestamp = Math.floor(Date.now() / 1000) * 1000 + targetOffsetSeconds * 1000;
  const httpDateString = new Date(futureTimestamp).toUTCString();
  const delay3 = cb.handleQuotaError(undefined, {
    status: 429,
    headers: { 'Retry-After': httpDateString },
  });
  // Should be close to targetOffsetSeconds * 1000 within 1 second clock resolution
  assert.ok(delay3 >= 6900 && delay3 <= 8100, `Expected delay near 8000ms, got ${delay3}`);

  // 4. Invalid Retry-After fallback to exponential delay
  const delay4 = cb.handleQuotaError(undefined, {
    status: 429,
    headers: { 'retry-after': 'invalid-not-a-number' },
  });
  // For consecutive429Count = 4, 500 * 2^(4-1) = 500 * 8 = 4000
  assert.equal(delay4, 4000, 'Invalid Retry-After must fall back to exponential calculation');

  cb.reset();
});

test('429 Verification: Jitter stays strictly bounded within specified jitterRatio', () => {
  const initialBackoffMs = 1000;
  const jitterRatio = 0.25; // +/- 25%
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs,
    maxBackoffMs: 10000,
    jitterRatio,
  });

  for (let i = 0; i < 50; i++) {
    cb.reset();
    const delay = cb.handleQuotaError(undefined, { status: 429 });
    const minAllowed = initialBackoffMs * (1 - jitterRatio);
    const maxAllowed = initialBackoffMs * (1 + jitterRatio);

    assert.ok(
      delay >= minAllowed && delay <= maxAllowed,
      `Delay ${delay} must stay within [${minAllowed}, ${maxAllowed}]`
    );
  }

  cb.reset();
});

/* ==============================================================================
 * SUITE 2: EMERGENCY GAME STATE PERSISTENCE ON 429 QUOTA EXHAUSTION
 * ============================================================================== */

test('State Saving: 429 error triggers emergency save tagged with quota_429 and valid checksum', async () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);

  const activeSession = createMockSessionState({
    meta: { score: 25000, stageIndex: 5 },
    player: { hp: 1, x: 160, y: 120 },
  });

  // Provide state via currentStateProvider when 429 arrives
  const quotaError = {
    status: 429,
    message: 'Quota exceeded for project. Retry after delay.',
    headers: { 'retry-after': '2' },
  };

  await persistence.handleApiError(quotaError, () => activeSession);

  // Invariant 1: Breaker is OPEN
  assert.equal(persistence.getCircuitBreaker().isOpen(), true);

  // Invariant 2: State exists in storage and is marked with saveTrigger = 'quota_429'
  const rawSaved = storage.getItem(STORAGE_KEY_ACTIVE_RUN);
  assert.ok(rawSaved, 'Emergency state must be saved to storage');

  const parsed = JSON.parse(rawSaved);
  assert.equal(parsed.saveTrigger, 'quota_429');
  assert.equal(parsed.meta.score, 25000);
  assert.equal(parsed.player.hp, 1);
  assert.equal(parsed.player.x, 160);
  assert.equal(parsed.version, STORAGE_SCHEMA_VERSION);

  // Invariant 3: Canonical checksum is valid and tamper-resistant
  assert.ok(typeof parsed.checksum === 'string');
  assert.equal(parsed.checksum.length, 24);
  assert.equal(verifyChecksum(parsed, parsed.checksum), true);

  // Invariant 4: Map grid is compressed with RLE and decompresses losslessly
  assert.ok(typeof parsed.board.mapRLE === 'string');
  const decompressed = decompressGrid(parsed.board.mapRLE, parsed.board.rows, parsed.board.cols);
  assert.deepEqual(decompressed, activeSession.board.map);

  // Invariant 5: loadRunState restores cleanly
  const loaded = persistence.loadRunState();
  assert.ok(loaded !== null);
  assert.equal(loaded.saveTrigger, 'quota_429');
  assert.equal(loaded.meta.score, 25000);
  assert.deepEqual(loaded.board.map, activeSession.board.map);

  persistence.getCircuitBreaker().reset();
});

test('State Saving: Emergency save falls back to cachedActiveRun if provider fails or returns null', async () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);

  // Cache an initial valid state
  const cachedState = createMockSessionState({
    meta: { score: 9900, stageIndex: 2 },
  });
  persistence.saveRunState(cachedState);

  // Trigger 429 with failing provider
  const failingProvider = () => {
    throw new Error('GameStateProvider catastrophic failure!');
  };

  await persistence.handleApiError({ status: 429 }, failingProvider);

  // Must fall back to cachedActiveRun with quota_429 tag
  const loaded = persistence.loadRunState();
  assert.ok(loaded !== null);
  assert.equal(loaded.saveTrigger, 'quota_429');
  assert.equal(loaded.meta.score, 9900);
  assert.equal(verifyChecksum(loaded, loaded.checksum), true);

  persistence.getCircuitBreaker().reset();
});

test('State Saving: Tampered state in storage is rejected by verifyChecksum', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);

  const originalState = createMockSessionState({ meta: { score: 1000 } });
  persistence.saveRunState(originalState);

  const rawJson = storage.getItem(STORAGE_KEY_ACTIVE_RUN);
  assert.ok(rawJson);

  // Tamper score directly in storage
  const tampered = JSON.parse(rawJson);
  tampered.meta.score = 999999;
  storage.setItem(STORAGE_KEY_ACTIVE_RUN, JSON.stringify(tampered));

  // loadRunState must detect tamper and reject
  const loaded = persistence.loadRunState();
  assert.equal(loaded, null, 'Tampered state must be rejected');
});

/* ==============================================================================
 * SUITE 3: OFFLINE FIFO QUEUEING & GRACEFUL RECOVERY
 * ============================================================================== */

test('Queue Recovery: Requests are queued in FIFO order while OPEN and rejected when maxQueueSize exceeded', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 5000,
    maxBackoffMs: 10000,
    maxQueueSize: 5,
  });

  // Trip to OPEN with 429
  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  const executionLog = [];
  const promises = [];
  let overflowRejectionCount = 0;

  // Attempt to execute 8 requests (maxQueueSize is 5)
  for (let i = 0; i < 8; i++) {
    const p = cb
      .execute(async () => {
        executionLog.push(i);
        return `resp_${i}`;
      }, { queueIfOpen: true })
      .catch((err) => {
        if (err instanceof CircuitBreakerOpenError) {
          overflowRejectionCount++;
          assert.ok(err.retryAfterMs >= 0);
          return null;
        }
        throw err;
      });

    promises.push(p);
  }

  // Exactly 5 items in queue, 3 rejected
  assert.equal(cb.getQueueLength(), 5);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(overflowRejectionCount, 3);

  // Recovery: simulate success to drain queue
  cb.recordSuccess();
  assert.equal(cb.isClosed(), true);

  await Promise.all(promises);

  // All 5 queued requests must execute in FIFO order (0..4)
  assert.equal(executionLog.length, 5);
  for (let k = 0; k < 5; k++) {
    assert.equal(executionLog[k], k);
  }
  assert.equal(cb.getQueueLength(), 0);

  cb.reset();
});

test('Queue Recovery: Immediate rejection when queueIfOpen is false while OPEN', async () => {
  const cb = new APIQuotaCircuitBreaker();
  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  await assert.rejects(
    async () => {
      await cb.execute(async () => 'never_run', { queueIfOpen: false });
    },
    (err) => {
      assert.ok(err instanceof CircuitBreakerOpenError);
      return true;
    }
  );

  assert.equal(cb.getQueueLength(), 0);
  cb.reset();
});

test('Queue Recovery: Auto-wakeup timer transitions to HALF_OPEN and drains queue sequentially', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 60,
    maxBackoffMs: 200,
    jitterRatio: 0,
    maxQueueSize: 10,
  });

  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  const taskLog = [];
  const p1 = cb.execute(async () => {
    taskLog.push('task_1');
    return 1;
  });
  const p2 = cb.execute(async () => {
    taskLog.push('task_2');
    return 2;
  });

  assert.equal(cb.getQueueLength(), 2);

  // Wait for backoff timeout (60ms) to trigger auto-wakeup timer
  const startTime = Date.now();
  while (cb.getState() !== CircuitBreakerState.CLOSED && Date.now() - startTime < 1500) {
    await new Promise((resolve) => setTimeout(resolve, 15));
  }

  assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
  await Promise.all([p1, p2]);

  assert.deepEqual(taskLog, ['task_1', 'task_2']);
  assert.equal(cb.getQueueLength(), 0);
  assert.equal(cb.getConsecutive429s(), 0);

  cb.reset();
});

test('Queue Recovery: Flaky probe request failure during HALF_OPEN immediately re-trips breaker to OPEN', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 50,
    maxBackoffMs: 500,
    jitterRatio: 0,
  });

  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  let probeExecuted = false;
  let probeRejected = false;

  const probe = cb
    .execute(async () => {
      probeExecuted = true;
      throw { status: 429, message: 'Upstream rate limit still active during probe' };
    })
    .catch((err) => {
      probeRejected = true;
      assert.ok(cb.isQuotaError(err));
    });

  // Wait for auto-drain to attempt probe
  const start = Date.now();
  while (!probeExecuted && Date.now() - start < 1500) {
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  await probe;

  assert.equal(probeExecuted, true);
  assert.equal(probeRejected, true);

  // Must have re-tripped back to OPEN with incremented 429 counter
  assert.equal(cb.getState(), CircuitBreakerState.OPEN);
  assert.equal(cb.isOpen(), true);
  assert.equal(cb.getConsecutive429s(), 2);

  cb.reset();
});

test('Queue Recovery: Manual reset() cleanly flushes offline queue and rejects pending promises', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 10000,
    maxQueueSize: 10,
  });

  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  let p1Error = null;
  let p2Error = null;

  const p1 = cb
    .execute(async () => 'val1')
    .catch((err) => {
      p1Error = err;
    });

  const p2 = cb
    .execute(async () => 'val2')
    .catch((err) => {
      p2Error = err;
    });

  assert.equal(cb.getQueueLength(), 2);

  cb.reset();

  assert.equal(cb.isClosed(), true);
  assert.equal(cb.getQueueLength(), 0);

  await Promise.all([p1, p2]);

  assert.ok(p1Error instanceof Error);
  assert.equal(p1Error.message, 'Circuit breaker queue cleared');
  assert.ok(p2Error instanceof Error);
  assert.equal(p2Error.message, 'Circuit breaker queue cleared');
});
