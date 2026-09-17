/**
 * persistence.test.mjs — Comprehensive Test Suite for Game State Persistence,
 * RLE Grid Compression, Canonical Checksums, Tamper Resistance, Export/Import,
 * and API 429 Quota Recovery Circuit Breaker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compressGrid,
  decompressGrid,
  canonicalStringify,
  calculateChecksum,
  verifyChecksum,
  MemoryStorageAdapter,
  WebStorageAdapter,
  GameStatePersistence,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  APIQuotaCircuitBreaker,
  CircuitBreakerOpenError,
} from '../src/game/persistence/CircuitBreaker.ts';

import {
  CircuitBreakerState,
  STORAGE_KEY_ACTIVE_RUN,
  STORAGE_KEY_META_PROFILE,
  STORAGE_SCHEMA_VERSION,
  EXPORT_APP_IDENTIFIER,
} from '../src/game/persistence/PersistenceTypes.ts';

import {
  GameModeType,
  RelicId,
} from '../src/game/progression/ProgressionTypes.ts';

import { createInitialPlayerStats } from '../src/game/gameplay_mechanics.ts';

/* ==============================================================================
 * SECTION 1: RUN-LENGTH ENCODING (RLE) COMPRESSION & DECOMPRESSION
 * ============================================================================== */

test('RLE: compresses and decompresses uniform grids (all 0s, all 1s)', () => {
  const rows = 13;
  const cols = 15;
  const zeros = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const ones = Array.from({ length: rows }, () => new Array(cols).fill(1));

  const rleZeros = compressGrid(zeros);
  assert.equal(rleZeros, '195x0');
  const decompressedZeros = decompressGrid(rleZeros, rows, cols);
  assert.deepEqual(decompressedZeros, zeros);

  const rleOnes = compressGrid(ones);
  assert.equal(rleOnes, '195x1');
  const decompressedOnes = decompressGrid(rleOnes, rows, cols);
  assert.deepEqual(decompressedOnes, ones);
});

test('RLE: compresses and decompresses checkered and complex game maps losslessly', () => {
  const rows = 13;
  const cols = 15;
  const map = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        row.push(1); // Perimeter wall
      } else if (r % 2 === 0 && c % 2 === 0) {
        row.push(1); // Pillar
      } else if ((r + c) % 3 === 0) {
        row.push(2); // Soft block
      } else {
        row.push(0); // Empty
      }
    }
    map.push(row);
  }

  const rle = compressGrid(map);
  assert.ok(rle.length > 0);
  assert.ok(rle.includes('x'));

  const decompressed = decompressGrid(rle, rows, cols);
  assert.deepEqual(decompressed, map);
});

test('RLE: handles empty and single-cell edge cases', () => {
  assert.equal(compressGrid([]), '');
  assert.deepEqual(decompressGrid('', 3, 3), [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]);

  const single = [[42]];
  const rleSingle = compressGrid(single);
  assert.equal(rleSingle, '1x42');
  assert.deepEqual(decompressGrid(rleSingle, 1, 1), single);
});

test('RLE: detects corrupt or dimension-mismatched RLE payloads', () => {
  assert.throws(() => {
    decompressGrid('10x1,invalid_token', 5, 5);
  }, /Invalid RLE token/);

  assert.throws(() => {
    decompressGrid('10x1,5x0', 3, 3); // 15 elements into 9-element grid
  }, /exceeded expected grid size/);

  assert.throws(() => {
    decompressGrid('4x1', 3, 3); // Only 4 elements into 9-element grid
  }, /count mismatch/);
});

/* ==============================================================================
 * SECTION 2: CANONICAL SERIALIZATION & CANONICAL CHECKSUM
 * ============================================================================== */

test('Canonical: sorts object keys deterministically regardless of insertion order', () => {
  const objA = { zebra: 1, alpha: 'test', beta: [3, 2, 1], delta: { y: 20, x: 10 } };
  const objB = { alpha: 'test', delta: { x: 10, y: 20 }, beta: [3, 2, 1], zebra: 1 };

  const strA = canonicalStringify(objA);
  const strB = canonicalStringify(objB);

  assert.equal(strA, strB);
  assert.equal(calculateChecksum(objA), calculateChecksum(objB));
});

test('Checksum: produces consistent 24-character hexadecimal digest and verifies correctly', () => {
  const sample = { score: 12500, wave: 5, mode: 'STANDARD' };
  const checksum = calculateChecksum(sample);

  assert.equal(typeof checksum, 'string');
  assert.equal(checksum.length, 24);
  assert.ok(/^[0-9a-f]{24}$/.test(checksum));

  assert.equal(verifyChecksum(sample, checksum), true);
  assert.equal(verifyChecksum(sample, '000000000000000000000000'), false);
  assert.equal(verifyChecksum(sample, ''), false);
});

test('Checksum: single-field modification triggers avalanche effect and fails verification', () => {
  const original = {
    score: 1000,
    player: { hp: 3, speed: 150 },
    inventory: { BOMB_UP: 2 },
  };

  const checksum = calculateChecksum(original);

  // 1. Mutate score
  const tamperedScore = { ...original, score: 999999 };
  assert.notEqual(calculateChecksum(tamperedScore), checksum);
  assert.equal(verifyChecksum(tamperedScore, checksum), false);

  // 2. Mutate nested HP
  const tamperedHp = {
    ...original,
    player: { hp: 99, speed: 150 },
  };
  assert.notEqual(calculateChecksum(tamperedHp), checksum);
  assert.equal(verifyChecksum(tamperedHp, checksum), false);

  // 3. Mutate inventory item
  const tamperedInv = {
    ...original,
    inventory: { BOMB_UP: 3 },
  };
  assert.notEqual(calculateChecksum(tamperedInv), checksum);
  assert.equal(verifyChecksum(tamperedInv, checksum), false);
});

/* ==============================================================================
 * SECTION 3: ACTIVE RUN STATE PERSISTENCE & TAMPERING DETECTION
 * ============================================================================== */

function createMockRunState() {
  const stats = createInitialPlayerStats();
  const rows = 13;
  const cols = 15;
  const map = Array.from({ length: rows }, () => new Array(cols).fill(0));
  map[0].fill(1);
  map[rows - 1].fill(1);

  return {
    version: STORAGE_SCHEMA_VERSION,
    timestamp: Date.now(),
    saveTrigger: 'manual',
    meta: {
      runId: 'run_test_123',
      stageIndex: 3,
      gameMode: GameModeType.STANDARD,
      score: 4500,
      elapsedTimeMs: 120000,
      activeCrisesCount: 1,
      bossEncounterActive: false,
    },
    player: {
      x: 60,
      y: 60,
      gridRow: 1,
      gridCol: 1,
      facing: 'down',
      stats,
      hp: 3,
      invulnerableRemainingMs: 0,
    },
    board: {
      rows,
      cols,
      mapRLE: compressGrid(map),
      map,
    },
    activeBombs: [
      {
        id: 'bomb_1',
        x: 60,
        y: 60,
        row: 1,
        col: 1,
        fuseRemainingMs: 1800,
        power: 2,
        owner: 'player',
        bombType: 'REGULAR',
      },
    ],
    activeEntities: [
      {
        id: 'enemy_1',
        archetype: 'CHASER',
        faction: 'enemy',
        x: 300,
        y: 200,
        hp: 2,
        maxHp: 2,
        aiState: 'HUNTING',
      },
    ],
    activeItems: [
      {
        row: 5,
        col: 5,
        itemType: 'SPEED_UP',
        spawnTime: Date.now() - 5000,
      },
    ],
    checksum: '',
  };
}

test('Active Run: save and load round-trip succeeds via MemoryStorageAdapter', () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const localAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, localAdapter);

  const initial = createMockRunState();
  const saved = persistence.saveRunState(initial);

  assert.ok(saved.checksum.length === 24);
  assert.equal(persistence.hasActiveRun(), true);

  const loaded = persistence.loadRunState();
  assert.ok(loaded);
  assert.equal(loaded.meta.runId, 'run_test_123');
  assert.equal(loaded.meta.score, 4500);
  assert.equal(loaded.player.hp, 3);
  assert.equal(loaded.activeBombs.length, 1);
  assert.equal(loaded.activeBombs[0].fuseRemainingMs, 1800);
  assert.equal(loaded.board.rows, 13);
  assert.equal(loaded.board.cols, 15);
  assert.ok(loaded.board.map);
  assert.equal(loaded.board.map.length, 13);
});

test('Active Run: clearing run state purges from storage and memory cache', () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  persistence.saveRunState(createMockRunState());
  assert.equal(persistence.hasActiveRun(), true);

  persistence.clearRunState();
  assert.equal(persistence.hasActiveRun(), false);
  assert.equal(persistence.loadRunState(), null);
  assert.equal(sessionAdapter.getItem(STORAGE_KEY_ACTIVE_RUN), null);
});

test('Active Run: detects tampering in sessionStorage and rejects corrupted state', () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  const state = createMockRunState();
  persistence.saveRunState(state);

  // Directly tamper with raw JSON in storage
  const raw = sessionAdapter.getItem(STORAGE_KEY_ACTIVE_RUN);
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  parsed.meta.score = 9999999; // Malicious score modification
  sessionAdapter.setItem(STORAGE_KEY_ACTIVE_RUN, JSON.stringify(parsed));

  // Loading tampered state must be rejected (returns null)
  const loaded = persistence.loadRunState();
  assert.equal(loaded, null);
  assert.equal(persistence.hasActiveRun(), false);
});

/* ==============================================================================
 * SECTION 4: META-PROFILE STORAGE & INTEGRITY
 * ============================================================================== */

test('Meta-Profile: saves and loads meta-progression profile with checksum envelope', () => {
  const localAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), localAdapter);

  const customProfile = {
    ...persistence.createDefaultMetaProfile(),
    cosmicEssence: 750,
    starCandies: 300,
    perks: { BAKE_1: 2, SPEED_1: 1 },
    equippedRelics: [RelicId.POCKET_CHRONOMETER, RelicId.GELATINOUS_CORE],
    trophiesUnlocked: ['FIRST_BLOOD', 'CRISIS_SURVIVOR'],
  };

  const envelope = persistence.saveMetaProfile(customProfile);
  assert.ok(envelope.checksum.length === 24);

  const loaded = persistence.loadMetaProfile();
  assert.equal(loaded.cosmicEssence, 750);
  assert.equal(loaded.starCandies, 300);
  assert.equal(loaded.perks.BAKE_1, 2);
  assert.deepEqual(loaded.equippedRelics, [
    RelicId.POCKET_CHRONOMETER,
    RelicId.GELATINOUS_CORE,
  ]);
  assert.deepEqual(loaded.trophiesUnlocked, ['FIRST_BLOOD', 'CRISIS_SURVIVOR']);
});

test('Meta-Profile: detects tampering in localStorage and restores safe defaults', () => {
  const localAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), localAdapter);

  const profile = persistence.createDefaultMetaProfile();
  persistence.saveMetaProfile(profile);

  // Directly tamper with localStorage
  const raw = localAdapter.getItem(STORAGE_KEY_META_PROFILE);
  assert.ok(raw);
  const envelope = JSON.parse(raw);
  envelope.profile.cosmicEssence = 999999; // Malicious essence tampering
  localAdapter.setItem(STORAGE_KEY_META_PROFILE, JSON.stringify(envelope));

  // Must detect checksum mismatch and restore safe defaults
  const loaded = persistence.loadMetaProfile();
  assert.equal(loaded.cosmicEssence, 100); // Restored default
});

/* ==============================================================================
 * SECTION 5: EXPORT / IMPORT CONTROLS
 * ============================================================================== */

test('Export/Import: exports complete save package and restores cleanly', () => {
  const sessionAdapter1 = new MemoryStorageAdapter();
  const localAdapter1 = new MemoryStorageAdapter();
  const persistence1 = new GameStatePersistence(sessionAdapter1, localAdapter1);

  const runState = createMockRunState();
  persistence1.saveRunState(runState);

  const profile = {
    ...persistence1.createDefaultMetaProfile(),
    cosmicEssence: 500,
    starCandies: 250,
  };
  persistence1.saveMetaProfile(profile);

  const exportedJson = persistence1.exportSavePackage();
  assert.ok(typeof exportedJson === 'string');
  const parsedExport = JSON.parse(exportedJson);
  assert.equal(parsedExport.exportApp, EXPORT_APP_IDENTIFIER);
  assert.equal(parsedExport.version, STORAGE_SCHEMA_VERSION);
  assert.ok(parsedExport.checksum.length === 24);
  assert.ok(parsedExport.runState);
  assert.ok(parsedExport.metaProfile);

  // Import into a fresh persistence instance
  const sessionAdapter2 = new MemoryStorageAdapter();
  const localAdapter2 = new MemoryStorageAdapter();
  const persistence2 = new GameStatePersistence(sessionAdapter2, localAdapter2);

  const importResult = persistence2.importSavePackage(exportedJson);
  assert.equal(importResult.success, true);
  assert.equal(importResult.error, undefined);

  // Verify state restored
  const restoredRun = persistence2.loadRunState();
  assert.ok(restoredRun);
  assert.equal(restoredRun.meta.runId, 'run_test_123');

  const restoredProfile = persistence2.loadMetaProfile();
  assert.equal(restoredProfile.cosmicEssence, 500);
  assert.equal(restoredProfile.starCandies, 250);
});

test('Export/Import: rejects malformed JSON and corrupted package checksums', () => {
  const persistence = new GameStatePersistence(
    new MemoryStorageAdapter(),
    new MemoryStorageAdapter()
  );

  // 1. Malformed JSON
  const r1 = persistence.importSavePackage('not a valid json string');
  assert.equal(r1.success, false);
  assert.ok(r1.error?.includes('JSON parsing error'));

  // 2. Foreign application package
  const foreignPackage = {
    version: STORAGE_SCHEMA_VERSION,
    exportTimestamp: Date.now(),
    exportApp: 'other-game',
    runState: null,
    metaProfile: persistence.createDefaultMetaProfile(),
    checksum: '',
  };
  foreignPackage.checksum = calculateChecksum(foreignPackage);
  const r2 = persistence.importSavePackage(JSON.stringify(foreignPackage));
  assert.equal(r2.success, false);
  assert.ok(r2.error?.includes('Invalid application identifier'));

  // 3. Tampered checksum
  const exported = JSON.parse(persistence.exportSavePackage());
  exported.metaProfile.cosmicEssence = 888888; // Tampered without updating checksum
  const r3 = persistence.importSavePackage(JSON.stringify(exported));
  assert.equal(r3.success, false);
  assert.ok(r3.error?.includes('Checksum verification failed'));
});

/* ==============================================================================
 * SECTION 6: API 429 CIRCUIT BREAKER & QUOTA RECOVERY
 * ============================================================================== */

test('CircuitBreaker: starts CLOSED and executes successful requests without state change', async () => {
  const cb = new APIQuotaCircuitBreaker({ failureThreshold: 3 });
  assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
  assert.equal(cb.isClosed(), true);

  let executed = false;
  const res = await cb.execute(async () => {
    executed = true;
    return 42;
  });

  assert.equal(executed, true);
  assert.equal(res, 42);
  assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
  assert.equal(cb.getConsecutiveFailures(), 0);
});

test('CircuitBreaker: standard non-429 failures trip breaker upon reaching threshold', async () => {
  const cb = new APIQuotaCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });

  // 1st failure
  await assert.rejects(async () => {
    await cb.execute(async () => {
      throw new Error('Network timeout');
    });
  });
  assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
  assert.equal(cb.getConsecutiveFailures(), 1);

  // 2nd failure
  await assert.rejects(async () => {
    await cb.execute(async () => {
      throw new Error('Server 500');
    });
  });
  assert.equal(cb.getState(), CircuitBreakerState.CLOSED);
  assert.equal(cb.getConsecutiveFailures(), 2);

  // 3rd failure: trips to OPEN
  await assert.rejects(async () => {
    await cb.execute(async () => {
      throw new Error('Connection refused');
    });
  });
  assert.equal(cb.getState(), CircuitBreakerState.OPEN);
  assert.equal(cb.isOpen(), true);
});

test('CircuitBreaker: HTTP 429 immediately trips breaker to OPEN and triggers emergency save', async () => {
  let emergencySaved = false;
  const cb = new APIQuotaCircuitBreaker({ initialBackoffMs: 500 });

  const error429 = { status: 429, message: 'Too Many Requests' };
  const backoff = cb.handleQuotaError(() => {
    emergencySaved = true;
  }, error429);

  assert.equal(emergencySaved, true);
  assert.equal(cb.getState(), CircuitBreakerState.OPEN);
  assert.equal(cb.getConsecutive429s(), 1);
  assert.ok(backoff >= 400 && backoff <= 600); // 500ms +/- 20% jitter
});

test('CircuitBreaker: exponential backoff increases delay with consecutive 429s', () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 1000,
    maxBackoffMs: 16000,
    jitterRatio: 0.1, // 10%
  });

  const b1 = cb.handleQuotaError(); // 1st 429: ~2000ms
  const b2 = cb.handleQuotaError(); // 2nd 429: ~4000ms
  const b3 = cb.handleQuotaError(); // 3rd 429: ~8000ms
  const b4 = cb.handleQuotaError(); // 4th 429: ~16000ms (capped)

  assert.ok(b1 < b2, `Expected b1 (${b1}) < b2 (${b2})`);
  assert.ok(b2 < b3, `Expected b2 (${b2}) < b3 (${b3})`);
  assert.ok(b3 <= b4, `Expected b3 (${b3}) <= b4 (${b4})`);
  assert.ok(b4 <= 18000, `Delay capped near max backoff`);
});

test('CircuitBreaker: honors Retry-After header from 429 response', () => {
  const cb = new APIQuotaCircuitBreaker({ initialBackoffMs: 500, jitterRatio: 0 });

  const errorWithHeader = {
    status: 429,
    headers: { 'retry-after': '7' }, // 7 seconds
  };

  const backoff = cb.handleQuotaError(undefined, errorWithHeader);
  assert.equal(backoff, 7000);
});

test('CircuitBreaker: queues requests in OPEN state and drains on recovery', async () => {
  const cb = new APIQuotaCircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 100,
    initialBackoffMs: 100,
    jitterRatio: 0,
  });

  // Trip to OPEN
  cb.handleQuotaError();
  assert.equal(cb.isOpen(), true);

  // Execute with queueIfOpen: true
  let task1Executed = false;
  let task2Executed = false;

  const promise1 = cb.execute(async () => {
    task1Executed = true;
    return 'result1';
  });

  const promise2 = cb.execute(async () => {
    task2Executed = true;
    return 'result2';
  });

  assert.equal(cb.getQueueLength(), 2);
  assert.equal(task1Executed, false);
  assert.equal(task2Executed, false);

  // Recovery: recordSuccess resets to CLOSED and triggers queue drain
  cb.recordSuccess();
  assert.equal(cb.isClosed(), true);

  const [res1, res2] = await Promise.all([promise1, promise2]);
  assert.equal(res1, 'result1');
  assert.equal(res2, 'result2');
  assert.equal(task1Executed, true);
  assert.equal(task2Executed, true);
  assert.equal(cb.getQueueLength(), 0);
});

test('CircuitBreaker: rejects unqueued requests in OPEN state with CircuitBreakerOpenError', async () => {
  const cb = new APIQuotaCircuitBreaker({ initialBackoffMs: 1000 });
  cb.handleQuotaError();

  await assert.rejects(
    async () => {
      await cb.execute(async () => 'never', { queueIfOpen: false });
    },
    (err) => {
      assert.ok(err instanceof CircuitBreakerOpenError);
      assert.ok(err.retryAfterMs > 0);
      assert.ok(err.message.includes('API Circuit Breaker is OPEN'));
      return true;
    }
  );
});

test('GameStatePersistence: handleApiError triggers emergency state save on 429', async () => {
  const sessionAdapter = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(sessionAdapter, new MemoryStorageAdapter());

  const runState = createMockRunState();
  let stateProviderCalled = false;

  await persistence.handleApiError({ status: 429 }, () => {
    stateProviderCalled = true;
    return runState;
  });

  assert.equal(stateProviderCalled, true);
  const saved = persistence.loadRunState();
  assert.ok(saved);
  assert.equal(saved.saveTrigger, 'quota_429');
  assert.equal(persistence.getCircuitBreaker().isOpen(), true);
});

test('WebStorageAdapter: falls back cleanly to MemoryStorageAdapter in headless/SSR environments', () => {
  const sessionWeb = new WebStorageAdapter('session');
  const localWeb = new WebStorageAdapter('local');

  sessionWeb.setItem('k1', 'val1');
  assert.equal(sessionWeb.getItem('k1'), 'val1');
  sessionWeb.removeItem('k1');
  assert.equal(sessionWeb.getItem('k1'), null);

  localWeb.setItem('k2', 'val2');
  assert.equal(localWeb.getItem('k2'), 'val2');
  localWeb.clear();
  assert.equal(localWeb.getItem('k2'), null);
});
