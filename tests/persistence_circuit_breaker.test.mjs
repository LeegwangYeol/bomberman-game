/**
 * tests/persistence_circuit_breaker.test.mjs
 *
 * Dedicated Test Suite for Circuit Breaker & 429 Quota Hardening.
 * Daily Evolution Cycle 2026-10-02.
 *
 * Requirements & Invariants Verified:
 * 1. 100 Consecutive HTTP 429 Responses Fault Injection
 * 2. OPEN State Validation & Monotonic Backoff Invariants
 * 3. FIFO Request Queueing under OPEN State (with maxQueueSize enforcement)
 * 4. Atomic RLE State Persistence & Checksum Integrity during 429 Emergency Save
 * 5. State Recovery & Lossless Decompression Verification
 * 6. Half-Open Trial Probe & Sequential Auto-Drain on Recovery
 * 7. Graceful Queue Clearance & Promise Rejection on Manual reset()
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
 * Generates a realistic mock game state with complex 13x15 board topology
 */
function createMockMatchState(options = {}) {
  const rows = 13;
  const cols = 15;
  const map = Array.from({ length: rows }, () => new Array(cols).fill(0));

  // Outer indestructible walls
  for (let c = 0; c < cols; c++) {
    map[0][c] = 1;
    map[rows - 1][c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    map[r][0] = 1;
    map[r][cols - 1] = 1;
  }

  // Fixed pillar grid
  for (let r = 2; r < rows - 2; r += 2) {
    for (let c = 2; c < cols - 2; c += 2) {
      map[r][c] = 1;
    }
  }

  // Soft destructible blocks
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (map[r][c] === 0 && (r + c) % 3 === 1) {
        map[r][c] = 2;
      }
    }
  }

  // Safe starting area
  map[1][1] = 0;
  map[1][2] = 0;
  map[2][1] = 0;

  const mapRLE = compressGrid(map);

  return {
    version: STORAGE_SCHEMA_VERSION,
    timestamp: options.timestamp ?? Date.now(),
    saveTrigger: options.saveTrigger ?? 'manual',
    meta: {
      runId: options.runId ?? `run_cb_test_${Date.now()}`,
      stageIndex: options.stageIndex ?? 3,
      gameMode: GameModeType.CRISIS_SURVIVAL,
      score: options.score ?? 8450,
      elapsedTimeMs: 142000,
      activeCrisesCount: 1,
      bossEncounterActive: false,
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
    },
    board: {
      rows,
      cols,
      mapRLE,
      map,
    },
    activeBombs: [
      {
        id: 'bomb_test_1',
        x: 80,
        y: 80,
        row: 2,
        col: 2,
        fuseRemainingMs: 1800,
        power: 4,
        owner: 'player',
        bombType: 'NORMAL',
      },
    ],
    activeEntities: [
      {
        id: 'chaser_1',
        archetype: 'CHASER',
        faction: 'enemy',
        x: 320,
        y: 160,
        hp: 2,
        maxHp: 2,
        aiState: 'PURSUING',
      },
      {
        id: 'drone_helper',
        archetype: 'PET_DRONE',
        faction: 'ally',
        x: 120,
        y: 80,
        hp: 3,
        maxHp: 3,
        aiState: 'ESCORTING',
      },
    ],
    activeItems: [
      {
        row: 5,
        col: 7,
        itemType: 'SPEED_UP',
        spawnTime: Date.now() - 5000,
      },
    ],
    checksum: '',
  };
}

/* ==============================================================================
 * TEST 1: 100 CONSECUTIVE 429 RESPONSES INJECTION & BACKOFF BOUNDS
 * ============================================================================== */

test('CircuitBreaker Hardening: 100 consecutive HTTP 429 fault injections strictly maintain OPEN state and bounded backoff', () => {
  const initialBackoffMs = 150;
  const maxBackoffMs = 8000;
  const jitterRatio = 0.2;

  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs,
    maxBackoffMs,
    jitterRatio,
    maxQueueSize: 200,
  });

  const delays = [];
  let emergencySavesCount = 0;

  for (let i = 1; i <= 100; i++) {
    const error429 = {
      status: 429,
      statusCode: 429,
      message: `HTTP 429 Rate Limit Exceeded - Fault #${i}`,
      headers: i % 15 === 0 ? { 'retry-after': '3' } : undefined,
    };

    const reportedDelay = cb.handleQuotaError(() => {
      emergencySavesCount++;
    }, error429);

    delays.push(reportedDelay);

    // Invariant: Circuit must immediately be in OPEN state
    assert.equal(cb.getState(), CircuitBreakerState.OPEN, `Breaker must be OPEN at step ${i}`);
    assert.equal(cb.isOpen(), true);
    assert.equal(cb.isClosed(), false);

    // Invariant: Counters must increment monotonically
    assert.equal(cb.getConsecutive429s(), i, `Consecutive 429 count must be ${i}`);
    assert.equal(cb.getConsecutiveFailures(), i, `Consecutive failures must be ${i}`);

    // Invariant: Backoff delay must be finite, non-NaN, and respect bounds
    assert.ok(Number.isFinite(reportedDelay), `Delay must be finite at step ${i}`);
    assert.ok(!Number.isNaN(reportedDelay), `Delay must not be NaN at step ${i}`);
    assert.ok(reportedDelay >= 50, `Delay must satisfy minimum 50ms constraint (got ${reportedDelay})`);

    if (i % 15 === 0) {
      // Retry-After 3s -> 3000ms +/- 20% jitter = [2400, 3600]
      assert.ok(
        reportedDelay >= 2200 && reportedDelay <= 3800,
        `Expected Retry-After delay around 3000ms, got ${reportedDelay}`
      );
    } else {
      // Formulaic delay: initialBackoffMs * 2^(min(i-1, 8)) clamped to maxBackoffMs with jitter
      assert.ok(
        reportedDelay <= maxBackoffMs * 1.3,
        `Delay ${reportedDelay} exceeded maxBackoffMs cap`
      );
    }

    assert.ok(cb.getNextAttemptTime() > Date.now(), 'Next attempt time must be strictly in future');
  }

  assert.equal(delays.length, 100);
  assert.equal(emergencySavesCount, 100, 'All 100 emergency saves must have been invoked');

  // Verify exponential growth during initial non-header steps
  assert.ok(delays[0] <= delays[1] * 1.5, 'Step 1 delay should not exceed Step 2 delay');
  assert.ok(delays[1] <= delays[2] * 1.5, 'Step 2 delay should not exceed Step 3 delay');

  cb.reset();
  assert.equal(cb.isClosed(), true);
  assert.equal(cb.getConsecutive429s(), 0);
});

/* ==============================================================================
 * TEST 2: FIFO REQUEST QUEUEING UNDER OPEN STATE & CAPACITY ENFORCEMENT
 * ============================================================================== */

test('CircuitBreaker Hardening: FIFO request queueing under OPEN state enforces maxQueueSize and strict FIFO ordering', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 10000,
    maxBackoffMs: 20000,
    maxQueueSize: 25,
  });

  // Trip to OPEN with 429
  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  const executionLog = [];
  const promises = [];
  let overflowRejections = 0;

  // Attempt to enqueue 50 requests into a breaker with maxQueueSize = 25
  for (let i = 0; i < 50; i++) {
    const p = cb
      .execute(async () => {
        executionLog.push(i);
        return `result_${i}`;
      }, { queueIfOpen: true })
      .catch((err) => {
        if (err instanceof CircuitBreakerOpenError) {
          overflowRejections++;
          assert.ok(err.retryAfterMs >= 0, 'CircuitBreakerOpenError must provide retryAfterMs');
          return null;
        }
        throw err;
      });

    promises.push(p);
  }

  // Exactly 25 requests must be queued
  assert.equal(cb.getQueueLength(), 25, 'Offline queue must be capped at 25');

  // Wait a microtask tick for over-capacity rejections
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(overflowRejections, 25, '25 excess requests must be rejected immediately');

  // Now simulate successful recovery and queue drain
  cb.recordSuccess();
  assert.equal(cb.isClosed(), true);

  // Wait for queue drain to complete
  await Promise.all(promises);

  // Verify all 25 queued requests executed in strict FIFO order (0..24)
  assert.equal(executionLog.length, 25, 'All 25 queued requests must have executed');
  for (let k = 0; k < 25; k++) {
    assert.equal(executionLog[k], k, `Item at index ${k} must execute in strict FIFO order (was ${executionLog[k]})`);
  }

  assert.equal(cb.getQueueLength(), 0, 'Queue must be completely empty after drain');
});

/* ==============================================================================
 * TEST 3: ATOMIC RLE STATE PERSISTENCE DURING 429 EMERGENCY SAVE
 * ============================================================================== */

test('CircuitBreaker Hardening: Emergency save triggered by HTTP 429 persists atomic RLE state and verified checksum', async () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);

  const initialMatchState = createMockMatchState({
    score: 12500,
    stageIndex: 4,
    saveTrigger: 'manual',
  });

  // Cache initial state
  persistence.saveRunState(initialMatchState);

  // Updated state reflecting match progression
  const updatedMatchState = createMockMatchState({
    score: 15800,
    stageIndex: 4,
    saveTrigger: 'manual',
  });
  // Change player position and active bombs
  updatedMatchState.player.x = 120;
  updatedMatchState.player.y = 80;
  updatedMatchState.player.hp = 2;

  // Trigger HTTP 429 error via persistence engine
  const http429Error = {
    status: 429,
    message: 'Rate limit quota exceeded on telemetry batch',
    headers: { 'retry-after': '10' },
  };

  await persistence.handleApiError(http429Error, () => updatedMatchState);

  // Invariant 1: Circuit breaker must now be OPEN
  const cb = persistence.getCircuitBreaker();
  assert.equal(cb.isOpen(), true, 'Circuit breaker must be OPEN after 429');
  assert.equal(cb.getConsecutive429s(), 1);

  // Invariant 2: Storage must contain the emergency save marked with saveTrigger = 'quota_429'
  const rawSavedJson = storage.getItem(STORAGE_KEY_ACTIVE_RUN);
  assert.ok(rawSavedJson, 'Raw JSON must exist in storage');

  const parsed = JSON.parse(rawSavedJson);
  assert.equal(parsed.saveTrigger, 'quota_429', 'Save trigger must be tagged quota_429');
  assert.equal(parsed.meta.score, 15800, 'Score must reflect the emergency state');
  assert.equal(parsed.player.hp, 2, 'Player HP must reflect the emergency state');

  // Invariant 3: Board map must be compactly RLE-encoded and uncorrupted
  assert.ok(typeof parsed.board.mapRLE === 'string', 'mapRLE must be a string');
  assert.ok(parsed.board.mapRLE.includes('x'), 'mapRLE must contain run-length markers');

  const decompressedBoard = decompressGrid(parsed.board.mapRLE, parsed.board.rows, parsed.board.cols);
  assert.deepEqual(decompressedBoard, updatedMatchState.board.map, 'Decompressed grid must match original exactly');

  // Invariant 4: Checksum envelope must be valid (24-char hex digest)
  assert.ok(parsed.checksum && parsed.checksum.length === 24, 'Checksum must be 24-character hexadecimal digest');
  const isValid = verifyChecksum(parsed, parsed.checksum);
  assert.equal(isValid, true, 'Checksum verification must succeed on saved state');

  // Invariant 5: Clean state recovery via loadRunState()
  const recoveredState = persistence.loadRunState();
  assert.ok(recoveredState !== null, 'loadRunState must recover state without error');
  assert.equal(recoveredState.saveTrigger, 'quota_429');
  assert.equal(recoveredState.meta.score, 15800);
  assert.deepEqual(recoveredState.board.map, updatedMatchState.board.map);
});

/* ==============================================================================
 * TEST 4: TAMPER DETECTION & CHECKSUM REJECTION ON CORRUPTED RLE
 * ============================================================================== */

test('CircuitBreaker Hardening: Tampered RLE map or metadata in 429-saved state is safely detected and rejected', () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);

  const matchState = createMockMatchState({ score: 9999 });
  persistence.saveRunState(matchState);

  const rawJson = storage.getItem(STORAGE_KEY_ACTIVE_RUN);
  assert.ok(rawJson);

  // Attack 1: Modify mapRLE string directly in storage
  const tamperedRleObj = JSON.parse(rawJson);
  tamperedRleObj.board.mapRLE = '195x9'; // Tampered tile IDs
  storage.setItem(STORAGE_KEY_ACTIVE_RUN, JSON.stringify(tamperedRleObj));

  const resultRleTamper = persistence.loadRunState();
  assert.equal(resultRleTamper, null, 'Tampered RLE must be rejected with null state');

  // Attack 2: Modify player stats in storage
  const tamperedStatsObj = JSON.parse(rawJson);
  tamperedStatsObj.player.stats.bombPower = 999;
  storage.setItem(STORAGE_KEY_ACTIVE_RUN, JSON.stringify(tamperedStatsObj));

  const resultStatsTamper = persistence.loadRunState();
  assert.equal(resultStatsTamper, null, 'Tampered player stats must be rejected with null state');
});

/* ==============================================================================
 * TEST 5: HALF-OPEN AUTO-DRAIN & MANUAL RESET QUEUE PURGING
 * ============================================================================== */

test('CircuitBreaker Hardening: Half-Open probe transition auto-drains queue, and manual reset() flushes cleanly', async () => {
  // Sub-scenario A: Half-Open auto-transition and sequential drain
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 50,
    maxBackoffMs: 100,
    jitterRatio: 0,
    maxQueueSize: 10,
  });

  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  const results = [];
  const p1 = cb.execute(async () => {
    results.push('task_A');
    return 'A';
  }, { queueIfOpen: true });

  const p2 = cb.execute(async () => {
    results.push('task_B');
    return 'B';
  }, { queueIfOpen: true });

  assert.equal(cb.getQueueLength(), 2);

  // Wait for minimum backoff timeout (50ms) to trigger auto-transition to HALF_OPEN & drain
  const waitStart = Date.now();
  while (cb.getState() !== CircuitBreakerState.CLOSED && Date.now() - waitStart < 1500) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  // Accessing state or wakeup timer will trigger drain
  assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
  await Promise.all([p1, p2]);

  assert.deepEqual(results, ['task_A', 'task_B'], 'Tasks must drain sequentially upon transition to CLOSED');
  assert.equal(cb.getQueueLength(), 0);

  // Sub-scenario B: Manual reset() during active queue
  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  let p3Rejected = false;
  let p4Rejected = false;

  const p3 = cb
    .execute(async () => 'never_called_1', { queueIfOpen: true })
    .catch((err) => {
      p3Rejected = true;
      assert.equal(err.message, 'Circuit breaker queue cleared');
    });

  const p4 = cb
    .execute(async () => 'never_called_2', { queueIfOpen: true })
    .catch((err) => {
      p4Rejected = true;
      assert.equal(err.message, 'Circuit breaker queue cleared');
    });

  assert.equal(cb.getQueueLength(), 2);

  cb.reset();

  assert.equal(cb.isClosed(), true);
  assert.equal(cb.getQueueLength(), 0);

  await Promise.all([p3, p4]);
  assert.equal(p3Rejected, true, 'Queued promise 3 must be cleanly rejected upon reset()');
  assert.equal(p4Rejected, true, 'Queued promise 4 must be cleanly rejected upon reset()');
});

/* ==============================================================================
 * TEST 6: HIGH-CONCURRENCY ATOMIC STATE SAVES & CHECKSUM VERIFICATION (100 SAVES)
 * ============================================================================== */

test('CircuitBreaker Hardening: 100 concurrent saveRunState operations maintain atomic RLE checksum integrity', async () => {
  const storage = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(storage);

  const writePromises = [];
  const generatedStates = [];

  for (let i = 0; i < 100; i++) {
    const state = createMockMatchState({
      score: 1000 + i * 10,
      stageIndex: (i % 5) + 1,
      runId: `run_concurrency_${i}`,
    });
    generatedStates.push(state);

    writePromises.push(
      new Promise((resolve) => {
        // Stagger slightly with setImmediate/microtasks
        queueMicrotask(() => {
          const saved = persistence.saveRunState(state);
          resolve(saved);
        });
      })
    );
  }

  const results = await Promise.all(writePromises);
  assert.equal(results.length, 100, 'All 100 writes must succeed');

  // Verify all 100 returned states have valid 24-character checksums
  for (const s of results) {
    assert.equal(s.checksum.length, 24, 'Checksum must be 24-character hex');
    assert.equal(verifyChecksum(s, s.checksum), true, 'State checksum must be valid');
    assert.equal(calculateChecksum(s), s.checksum, 'Calculated checksum must match state checksum');
    assert.ok(s.board.mapRLE.length > 0, 'RLE map must not be empty');
  }

  // Verify stored state is valid and verifiable
  const loaded = persistence.loadRunState();
  assert.ok(loaded !== null, 'Final persisted state in storage must load cleanly');
  assert.equal(verifyChecksum(loaded, loaded.checksum), true, 'Loaded state checksum must be valid');
});

/* ==============================================================================
 * TEST 7: FLAKY HALF-OPEN OSCILLATION & IMMEDIATE RE-TRIP
 * ============================================================================== */

test('CircuitBreaker Hardening: Flaky server failure during HALF_OPEN immediately re-trips breaker to OPEN', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 50,
    maxBackoffMs: 200,
    jitterRatio: 0,
    maxQueueSize: 10,
  });

  // Trip to OPEN with initial 429
  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  // Queue a probe request that will fail with 429
  let probeExecuted = false;
  let probeRejected = false;

  const probe = cb
    .execute(async () => {
      probeExecuted = true;
      throw { status: 429, message: 'Server still throttled during probe' };
    }, { queueIfOpen: true })
    .catch((err) => {
      probeRejected = true;
      assert.ok(cb.isQuotaError(err), 'Caught error must be recognized as quota error');
    });

  // Wait for initial backoff to expire -> HALF_OPEN auto-transition & probe execution
  const probeWaitStart = Date.now();
  while (!probeExecuted && Date.now() - probeWaitStart < 1500) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await probe;

  assert.equal(probeExecuted, true, 'Probe request must have been attempted');
  assert.equal(probeRejected, true, 'Probe request must have been rejected');

  // Circuit breaker must have immediately re-tripped back to OPEN
  assert.equal(cb.getState(), CircuitBreakerState.OPEN, 'Circuit must re-trip to OPEN on probe failure');
  assert.equal(cb.isOpen(), true);
  assert.ok(cb.getConsecutive429s() >= 2, 'Consecutive 429 count must have incremented');
  assert.equal(cb.getQueueLength(), 0, 'Probe request must have been popped from queue');

  cb.reset();
});

