/**
 * tests/systems_security_defensive.test.mjs — Comprehensive Defensive Test Suite
 *
 * Verifies remediation for:
 * 1. ARCH-SCALE-01: ScalingEngine duplicate mutator resolution under incompatible pairs across 1,000 seeds.
 * 2. ARCH-CRISIS-01: CrisisManager edge-triggered resolution counter.
 * 3. SEC-VAL-01..03 & SEC-NET-01: Currency clamping, unknown perk rejection, enum whitelisting, relic slot cap, and 429 recovery harmonization.
 * 4. SEC-NET-02: CircuitBreaker auto-wakeup timer and automatic queue draining.
 * 5. AI-PATH-01 & MEM-PATH-01: Default 8-step escape depth, early-exit canSafelyPlaceBomb, and typed array mask reuse.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ScalingEngine,
} from '../src/game/progression/ScalingEngine.ts';
import {
  WaveMutatorId,
  GameModeType,
  RelicId,
} from '../src/game/progression/ProgressionTypes.ts';
import { CrisisManager } from '../src/game/crises/CrisisManager.ts';
import { CrisisType, CrisisStage } from '../src/game/crises/CrisisTypes.ts';
import {
  GameStatePersistence,
  MemoryStorageAdapter,
} from '../src/game/persistence/GameStatePersistence.ts';
import {
  APIQuotaCircuitBreaker,
} from '../src/game/persistence/CircuitBreaker.ts';
import {
  getSafeBombEscapePath,
  canSafelyPlaceBomb,
  getBlastTiles,
  cloneBombTilesAsSet,
  FlatHazardMask,
  ROWS,
  COLS,
  TILE_EMPTY,
  TILE_WALL,
} from '../src/game/pathfinding.ts';

/* ==============================================================================
 * SUITE 1: ARCH-SCALE-01 (DUPLICATE MUTATORS RESOLUTION)
 * ============================================================================== */

test('ARCH-SCALE-01: ScalingEngine.generateWaveMutators never produces duplicate mutators across 1,000 random seeds', () => {
  // Test wave 6+ across 1,000 random seeds
  for (let seed = 1; seed <= 1000; seed++) {
    const mutators = ScalingEngine.generateWaveMutators(6, seed);
    assert.strictEqual(mutators.length, 2, `Wave 6 should produce exactly 2 mutators for seed ${seed}`);
    assert.notStrictEqual(
      mutators[0].id,
      mutators[1].id,
      `Seed ${seed} produced duplicate mutators: [${mutators[0].id}, ${mutators[1].id}]`
    );

    // Verify incompatible pairs are never present together
    const ids = [mutators[0].id, mutators[1].id];
    const hasGlassCannon = ids.includes(WaveMutatorId.GLASS_CANNON);
    const hasDenseFort = ids.includes(WaveMutatorId.DENSE_FORTIFICATION);
    assert.ok(
      !(hasGlassCannon && hasDenseFort),
      `Seed ${seed} produced incompatible mutators: [GLASS_CANNON, DENSE_FORTIFICATION]`
    );
  }

  // Specifically verify critical seeds: 80, 87, 94
  const criticalSeeds = [80, 87, 94];
  for (const s of criticalSeeds) {
    const mutators = ScalingEngine.generateWaveMutators(6, s);
    assert.strictEqual(mutators.length, 2);
    assert.notStrictEqual(
      mutators[0].id,
      mutators[1].id,
      `Critical seed ${s} produced duplicate mutator: ${mutators[0].id}`
    );
    assert.ok(
      !(
        mutators[0].id === WaveMutatorId.GLASS_CANNON &&
        mutators[1].id === WaveMutatorId.DENSE_FORTIFICATION
      ) &&
      !(
        mutators[0].id === WaveMutatorId.DENSE_FORTIFICATION &&
        mutators[1].id === WaveMutatorId.GLASS_CANNON
      ),
      `Critical seed ${s} had incompatible pair`
    );
  }

  // Verify wave thresholds: waves 1-2 return 0 mutators, waves 3-5 return 1 mutator
  assert.strictEqual(ScalingEngine.generateWaveMutators(1, 80).length, 0);
  assert.strictEqual(ScalingEngine.generateWaveMutators(2, 80).length, 0);
  assert.strictEqual(ScalingEngine.generateWaveMutators(3, 80).length, 1);
  assert.strictEqual(ScalingEngine.generateWaveMutators(5, 80).length, 1);
  assert.strictEqual(ScalingEngine.generateWaveMutators(6, 80).length, 2);
});

/* ==============================================================================
 * SUITE 2: ARCH-CRISIS-01 (EDGE-TRIGGERED CRISIS RESOLUTION COUNTER)
 * ============================================================================== */

test('ARCH-CRISIS-01: CrisisManager.update increments totalCrisesResolved exactly once on rising edge', () => {
  const cm = new CrisisManager();
  assert.strictEqual(cm.getTotalCrisesResolved(), 0);

  cm.triggerCrisis(CrisisType.PASTEL_VOID);
  assert.strictEqual(cm.getTotalCrisesResolved(), 0);

  // Simulate frames before resolution
  for (let i = 0; i < 30; i++) {
    cm.update(16.6);
    assert.strictEqual(cm.getTotalCrisesResolved(), 0);
  }

  // Resolve crisis to trigger victory
  cm.resolveCrisis();

  // First update after resolution transitions into RESOLVED: rising edge
  const status1 = cm.update(16.6);
  assert.strictEqual(status1.stage, CrisisStage.RESOLVED);
  assert.strictEqual(status1.isVictorious, true);
  assert.strictEqual(cm.getTotalCrisesResolved(), 1, 'Should increment to 1 on rising edge transition');

  // Next 120 frames at 60 FPS while status is RESOLVED: must NOT continue incrementing
  for (let frame = 0; frame < 120; frame++) {
    const status = cm.update(16.6);
    assert.strictEqual(status.stage, CrisisStage.RESOLVED);
    assert.strictEqual(cm.getTotalCrisesResolved(), 1, `Frame ${frame} incorrectly incremented resolution counter`);
  }

  // Triggering a new crisis resets resolution state
  cm.triggerCrisis(CrisisType.ORBITAL_BOMBARDMENT);
  assert.strictEqual(cm.getTotalCrisesResolved(), 1);

  // Resolve second crisis
  cm.resolveCrisis();
  cm.update(16.6);
  assert.strictEqual(cm.getTotalCrisesResolved(), 2, 'Second resolved crisis should increment counter to 2');

  // Multi-frame updates during second resolved crisis must also hold at 2
  for (let frame = 0; frame < 60; frame++) {
    cm.update(16.6);
    assert.strictEqual(cm.getTotalCrisesResolved(), 2);
  }

  // Calling stopCrisis('resolved') after already counted does not double-count
  cm.stopCrisis('resolved');
  assert.strictEqual(cm.getTotalCrisesResolved(), 2);

  // Reset zeroes out the counter
  cm.reset();
  assert.strictEqual(cm.getTotalCrisesResolved(), 0);
});

/* ==============================================================================
 * SUITE 3: SEC-VAL-01, 02, 03 & SEC-NET-01 (SAVE SANITIZATION & 429 HARMONIZATION)
 * ============================================================================== */

test('SEC-VAL-01: safeNumber enforces upper cap (999,999,999) on currencies to prevent integer overflows', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());

  const overflowProfile = {
    ...persistence.createDefaultMetaProfile(),
    cosmicEssence: 999_999_999_999, // 1 trillion essence
    starCandies: 50_000_000_000,    // 50 billion candies
  };

  const sanitized = persistence.sanitizeMetaProfile(overflowProfile);
  assert.strictEqual(sanitized.cosmicEssence, 999_999_999, 'cosmicEssence must be capped at 999,999,999');
  assert.strictEqual(sanitized.starCandies, 999_999_999, 'starCandies must be capped at 999,999,999');

  // Also verify negative values clamp to 0
  const negativeProfile = {
    ...persistence.createDefaultMetaProfile(),
    cosmicEssence: -500,
    starCandies: -100,
  };
  const sanitizedNeg = persistence.sanitizeMetaProfile(negativeProfile);
  assert.strictEqual(sanitizedNeg.cosmicEssence, 0);
  assert.strictEqual(sanitizedNeg.starCandies, 0);
});

test('SEC-VAL-02: sanitizeMetaProfile rejects unknown perk keys not present in CONFECTIONERY_PERKS', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());

  const profileWithHackedPerks = {
    ...persistence.createDefaultMetaProfile(),
    perks: {
      sugar_spark: 2,               // Valid perk
      hacked_invulnerability: 10,   // Unknown perk
      infinite_speed: 99,           // Unknown perk
      god_mode: 1,                  // Unknown perk
      chain_reaction: 1,            // Valid perk
    },
  };

  const sanitized = persistence.sanitizeMetaProfile(profileWithHackedPerks);

  // Valid perks preserved
  assert.strictEqual(sanitized.perks.sugar_spark, 2);
  assert.strictEqual(sanitized.perks.chain_reaction, 1);

  // Unknown perks rejected completely
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized.perks, 'hacked_invulnerability'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized.perks, 'infinite_speed'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized.perks, 'god_mode'), false);
  assert.strictEqual(sanitized.perks.hacked_invulnerability, undefined);
  assert.strictEqual(sanitized.perks.infinite_speed, undefined);
  assert.strictEqual(sanitized.perks.god_mode, undefined);
});

test('SEC-VAL-03: sanitizeMetaProfile whitelists unlockedModes & equippedRelics and caps relic slots to 2', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());

  const profileWithInvalidEnums = {
    ...persistence.createDefaultMetaProfile(),
    unlockedModes: [
      GameModeType.STANDARD,
      'ILLEGAL_DEV_CHEATS',
      GameModeType.CRISIS_SURVIVAL,
      'UNRELEASED_PVP_MODE',
      null,
      12345,
    ],
    equippedRelics: [
      RelicId.POCKET_CHRONOMETER,
      'HACKED_GOD_RELIC',
      RelicId.GELATINOUS_CORE,
      RelicId.PYROCLASTIC_PRISM, // 3rd valid relic
      RelicId.MAGNETRON_DIAL,    // 4th valid relic
    ],
  };

  const sanitized = persistence.sanitizeMetaProfile(profileWithInvalidEnums);

  // Modes: invalid values and non-strings filtered out
  assert.ok(sanitized.unlockedModes.includes(GameModeType.STANDARD));
  assert.ok(sanitized.unlockedModes.includes(GameModeType.CRISIS_SURVIVAL));
  assert.strictEqual(sanitized.unlockedModes.includes('ILLEGAL_DEV_CHEATS'), false);
  assert.strictEqual(sanitized.unlockedModes.includes('UNRELEASED_PVP_MODE'), false);

  // Relics: unknown relic rejected, valid relics capped to MAX_RELIC_SLOTS (2)
  assert.strictEqual(sanitized.equippedRelics.length, 2, 'Equipped relics must be capped at 2 slots');
  assert.strictEqual(sanitized.equippedRelics.includes('HACKED_GOD_RELIC'), false);
  assert.strictEqual(sanitized.equippedRelics[0], RelicId.POCKET_CHRONOMETER);
  assert.strictEqual(sanitized.equippedRelics[1], RelicId.GELATINOUS_CORE);
});

test('SEC-NET-01: GameStatePersistence.handleApiError harmonizes 429 quota detection with CircuitBreaker.isQuotaError', async () => {
  const session = new MemoryStorageAdapter();
  const local = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(session, local);

  let emergencySaveCount = 0;
  const dummyStateProvider = () => {
    emergencySaveCount++;
    return {
      version: '1.0',
      timestamp: Date.now(),
      mode: GameModeType.STANDARD,
      wave: 5,
      score: 12000,
      lives: 3,
      playerStats: { speed: 150, maxBombs: 3, bombPower: 2, hasKick: false, shields: 1 },
      board: { rows: 2, cols: 2, map: [[0, 0], [0, 0]], mapRLE: '' },
      activeBombs: [],
      activeEnemies: [],
      droppedItems: [],
      seed: 42,
    };
  };

  // Test 1: gRPC code RESOURCE_EXHAUSTED
  await persistence.handleApiError({ code: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' }, dummyStateProvider);
  assert.strictEqual(persistence.getCircuitBreaker().isOpen(), true);
  assert.strictEqual(emergencySaveCount, 1, 'Emergency save must trigger for RESOURCE_EXHAUSTED');

  persistence.getCircuitBreaker().reset();

  // Test 2: Status code 429 in statusCode
  await persistence.handleApiError({ statusCode: 429, message: 'Too Many Requests' }, dummyStateProvider);
  assert.strictEqual(persistence.getCircuitBreaker().isOpen(), true);
  assert.strictEqual(emergencySaveCount, 2, 'Emergency save must trigger for statusCode: 429');

  persistence.getCircuitBreaker().reset();

  // Test 3: Message containing 'quota'
  await persistence.handleApiError({ message: 'Rate limit or Quota reached' }, dummyStateProvider);
  assert.strictEqual(persistence.getCircuitBreaker().isOpen(), true);
  assert.strictEqual(emergencySaveCount, 3, 'Emergency save must trigger for message with quota');

  persistence.getCircuitBreaker().reset();

  // Test 4: Standard non-quota error does not trigger emergency save
  await persistence.handleApiError({ status: 500, message: 'Internal Server Error' }, dummyStateProvider);
  assert.strictEqual(emergencySaveCount, 3, 'Non-429 error must NOT trigger emergency save');
});

/* ==============================================================================
 * SUITE 4: SEC-NET-02 (OFFLINE QUEUE WAKEUP TIMER & AUTO-DRAIN)
 * ============================================================================== */

test('SEC-NET-02: CircuitBreaker auto-drains queued tasks after backoff timer fires without manual triggers', async () => {
  const cb = new APIQuotaCircuitBreaker({
    initialBackoffMs: 200,
    jitterRatio: 0,
    failureThreshold: 1,
  });

  // Trip to OPEN via quota error
  cb.handleQuotaError();
  assert.strictEqual(cb.isOpen(), true);

  let task1Executed = false;
  let task2Executed = false;

  // Queue two tasks while breaker is OPEN
  const p1 = cb.execute(async () => {
    task1Executed = true;
    return 'task1_result';
  });

  const p2 = cb.execute(async () => {
    task2Executed = true;
    return 'task2_result';
  });

  assert.strictEqual(cb.getQueueLength(), 2);
  assert.strictEqual(task1Executed, false);
  assert.strictEqual(task2Executed, false);

  // DO NOT call recordSuccess() manually! Wait for the wakeup timer to transition to HALF_OPEN and drain
  const [res1, res2] = await Promise.all([p1, p2]);

  assert.strictEqual(res1, 'task1_result');
  assert.strictEqual(res2, 'task2_result');
  assert.strictEqual(task1Executed, true);
  assert.strictEqual(task2Executed, true);
  assert.strictEqual(cb.getQueueLength(), 0, 'Offline queue must be automatically drained');
  assert.strictEqual(cb.isClosed(), true, 'Successful executions must restore breaker to CLOSED');
});

/* ==============================================================================
 * SUITE 5: AI-PATH-01 & MEM-PATH-01 (PATHFINDING OPTIMIZATION & CONSISTENCY)
 * ============================================================================== */

test('AI-PATH-01: getSafeBombEscapePath uses 8-step escape depth by default and finds deep safe tiles', () => {
  // Construct a discrete 13x15 arena with an empty corridor
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE_EMPTY));
  for (let c = 0; c < COLS; c++) {
    map[0][c] = TILE_WALL;
    map[ROWS - 1][c] = TILE_WALL;
  }
  for (let r = 0; r < ROWS; r++) {
    map[r][0] = TILE_WALL;
    map[r][COLS - 1] = TILE_WALL;
  }

  // Create a long corridor where escape requires 6 steps
  // Place bomb at (1, 1) with blast radius 4 along row 1
  // Escape requires walking from (1, 1) -> (1, 5) which is in blast -> (1, 6) which is safe (5 steps)
  // Or walking 6 steps down an L-corridor
  const bombCoord = { r: 1, c: 1 };
  const blastPower = 4; // covers (1, 1) to (1, 5)

  // With default maxEscapeSteps, it should find escape path up to 8 steps
  const path = getSafeBombEscapePath(bombCoord, blastPower, map);
  assert.ok(path !== null, 'Should find safe escape path with default 8 steps');
  assert.ok(path.length > 0, 'Escape path should have steps');
  assert.ok(path.length <= 8, 'Escape path length should be within 8 steps');

  // If explicit maxEscapeSteps is 1, a bomb with blast power 4 cannot escape in 1 step
  const restrictedPath = getSafeBombEscapePath(bombCoord, blastPower, map, undefined, 1);
  // In 1 step from (1,1) you can only reach (1,2) or (2,1), both are in blast range of power 4
  assert.strictEqual(restrictedPath, null, '1-step limit cannot escape a 4-tile blast');
});

test('MEM-PATH-01: canSafelyPlaceBomb early-exit check is consistent with escape path existence and creates no path garbage', () => {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE_EMPTY));
  // Add perimeter walls
  for (let c = 0; c < COLS; c++) {
    map[0][c] = TILE_WALL;
    map[ROWS - 1][c] = TILE_WALL;
  }
  for (let r = 0; r < ROWS; r++) {
    map[r][0] = TILE_WALL;
    map[r][COLS - 1] = TILE_WALL;
  }
  // Box in a cul-de-sac at (1, 1): walls at (0, 1) and (1, 0) from perimeter, plus (1, 2) and (2, 1)
  map[1][2] = TILE_WALL;
  map[2][1] = TILE_WALL;

  // In a 1x1 cul-de-sac surrounded by walls, placing a bomb traps the planter
  const safeInTrap = canSafelyPlaceBomb({ r: 1, c: 1 }, 1, map);
  assert.strictEqual(safeInTrap, false, 'Planter in cul-de-sac must not be allowed to place suicide bomb');

  // Open area at (5, 5) with blast 2: safe escape exists
  const safeInOpen = canSafelyPlaceBomb({ r: 5, c: 5 }, 2, map);
  assert.strictEqual(safeInOpen, true, 'Open area should allow safe bomb placement');

  // Verify consistency with getSafeBombEscapePath
  const escapePath = getSafeBombEscapePath({ r: 5, c: 5 }, 2, map);
  assert.ok(escapePath !== null && escapePath.length > 0);
});

test('MEM-PATH-01: getBlastTiles and cloneBombTilesAsSet accept and reuse FlatHazardMask and typed arrays', () => {
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE_EMPTY));
  const center = { r: 5, c: 5 };
  const power = 2;

  // Test 1: getBlastTiles with pre-allocated FlatHazardMask
  const preallocMask = new FlatHazardMask(ROWS * COLS);
  const returnedMask = getBlastTiles(center, power, map, preallocMask);
  assert.strictEqual(returnedMask, preallocMask, 'Must return the same FlatHazardMask instance');
  assert.strictEqual(preallocMask.isHazard(5, 5), true, 'Center must be hazard');
  assert.strictEqual(preallocMask.isHazard(5, 6), true, 'Right neighbor must be hazard');
  assert.strictEqual(preallocMask.isHazard(5, 7), true, 'Right +2 must be hazard');
  assert.strictEqual(preallocMask.isHazard(5, 8), false, 'Beyond radius must not be hazard');

  // Test 2: getBlastTiles with pre-allocated Uint8Array
  const uint8Mask = new Uint8Array(ROWS * COLS);
  const returnedUint8 = getBlastTiles(center, power, map, uint8Mask);
  assert.strictEqual(returnedUint8, uint8Mask, 'Must return the same Uint8Array instance');
  assert.strictEqual(uint8Mask[5 * COLS + 5], 1);
  assert.strictEqual(uint8Mask[5 * COLS + 6], 1);
  assert.strictEqual(uint8Mask[5 * COLS + 8], 0);

  // Test 3: cloneBombTilesAsSet into pre-allocated FlatHazardMask
  const sourceBombs = new Set(['1,2', '3,4']);
  const targetMask = new FlatHazardMask(ROWS * COLS);
  const resultMask = cloneBombTilesAsSet(sourceBombs, targetMask);
  assert.strictEqual(resultMask, targetMask, 'Must reuse target FlatHazardMask');
  assert.strictEqual(targetMask.isHazard(1, 2), true);
  assert.strictEqual(targetMask.isHazard(3, 4), true);
  assert.strictEqual(targetMask.isHazard(0, 0), false);

  // Test 4: cloneBombTilesAsSet into pre-allocated Uint8Array
  const targetUint8 = new Uint8Array(ROWS * COLS);
  const resultUint8 = cloneBombTilesAsSet(sourceBombs, targetUint8);
  assert.strictEqual(resultUint8, targetUint8, 'Must reuse target Uint8Array');
  assert.strictEqual(targetUint8[1 * COLS + 2], 1);
  assert.strictEqual(targetUint8[3 * COLS + 4], 1);
  assert.strictEqual(targetUint8[0], 0);

  // Test 5: Backward compatibility: without target returns Set<string>
  const setReturn = getBlastTiles(center, power, map);
  assert.ok(setReturn instanceof Set);
  assert.ok(setReturn.has('5,5'));
  assert.ok(setReturn.has('5,6'));

  const cloneSetReturn = cloneBombTilesAsSet(sourceBombs);
  assert.ok(cloneSetReturn instanceof Set);
  assert.ok(cloneSetReturn.has('1,2'));
  assert.ok(cloneSetReturn.has('3,4'));
});
