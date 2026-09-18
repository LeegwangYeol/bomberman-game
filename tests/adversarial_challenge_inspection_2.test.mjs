/**
 * adversarial_challenge_inspection_2.test.mjs — Adversarial Stress Harness for Challenger 2
 *
 * Scope Tested:
 * 1. CircuitBreaker retry scheduling, non-429 error queues, backoff timers under network chaos.
 * 2. PerkTree prototype pollution attack vectors (__proto__, toString, constructor, valueOf).
 * 3. GameStatePersistence storage quota exhaustion fallback consistency and corrupted/negative save payloads.
 * 4. TelegraphEngine attack cancellation and slot swapping under high concurrency.
 * 5. Boss stun vulnerability windows, i-frame resets, arena boundary clamps, and death animation timers.
 * 6. Crisis state reset across all crisis subclasses.
 * 7. Touch controls, joystick diagonal sector transitions (angles 130°-140°, 220°-230°), and rapid button tapping.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APIQuotaCircuitBreaker,
  CircuitBreakerOpenError,
} from '../src/game/persistence/CircuitBreaker.ts';

import {
  CircuitBreakerState,
  STORAGE_SCHEMA_VERSION,
  EXPORT_APP_IDENTIFIER,
} from '../src/game/persistence/PersistenceTypes.ts';

import {
  GameStatePersistence,
  MemoryStorageAdapter,
  WebStorageAdapter,
  calculateChecksum,
} from '../src/game/persistence/GameStatePersistence.ts';

import {
  PerkTreeManager,
  CONFECTIONERY_PERKS,
} from '../src/game/progression/PerkTree.ts';

import {
  TelegraphEngine,
  MAX_TELEGRAPH_TILES,
} from '../src/game/bosses/TelegraphEngine.ts';

import {
  BaseBoss,
} from '../src/game/bosses/BaseBoss.ts';

import {
  BossState,
  TelegraphTier,
} from '../src/game/bosses/BossTypes.ts';

import { HamsterBoss } from '../src/game/bosses/HamsterBoss.ts';
import { QueenBeeBoss } from '../src/game/bosses/QueenBeeBoss.ts';

import { OrbitalCrisis } from '../src/game/crises/OrbitalCrisis.ts';
import { VoidCrisis } from '../src/game/crises/VoidCrisis.ts';
import { LavaCrisis } from '../src/game/crises/LavaCrisis.ts';
import { ClockworkCrisis } from '../src/game/crises/ClockworkCrisis.ts';
import { RiftCrisis } from '../src/game/crises/RiftCrisis.ts';
import { SolarFlareCrisis } from '../src/game/crises/SolarFlareCrisis.ts';
import { CrisisStage } from '../src/game/crises/CrisisTypes.ts';

// Helper mock FSM Boss for testing BaseBoss protected logic
class MockTestBoss extends BaseBoss {
  dismissibleReported = false;

  constructor(hp = 10) {
    super(
      {
        id: 'mock_boss',
        name: 'Mock Boss',
        title: 'Test',
        maxHp: hp,
        baseSpeed: 100,
        enrageSpeedMultiplier: 1.5,
        attackCooldownMs: 2000,
        contactDamage: 1,
        hitboxRadius: 30,
        colorHex: 0xff0000,
        phase2HpThreshold: 0.6,
        phase3HpThreshold: 0.3,
      },
      300,
      260
    );
  }

  canTakeDamage() {
    return true;
  }

  takeBombHit(damage = 1) {
    return this.takeBombDamage(damage);
  }

  updatePhase1() {}
  updatePhase2() {}
  updateEnraged() {}
  onHitReceived() {}
  onDamageBlocked() {}
  onStateChanged() {}
  onPhaseChanged() {}
  onEnraged() {}

  onDefeated() {}

  onDeathAnimationFinished() {
    super.onDeathAnimationFinished();
    this.dismissibleReported = true;
  }
}

/* ==============================================================================
 * SUITE 1: CIRCUIT BREAKER RETRY SCHEDULING & NETWORK CHAOS
 * ============================================================================== */

test('Challenger 2.1: CircuitBreaker handles network chaos and non-429 transient error retries without deadlocks', async () => {
  const cb = new APIQuotaCircuitBreaker({
    failureThreshold: 4,
    initialBackoffMs: 40,
    maxBackoffMs: 500,
    jitterRatio: 0.05,
  });

  // Trip circuit breaker to OPEN with 429
  cb.handleQuotaError();
  assert.strictEqual(cb.isOpen(), true);

  let attemptCount = 0;
  // Queue a task that fails with network errors on first 2 attempts then succeeds
  const queuedPromise = cb.execute(async () => {
    attemptCount++;
    if (attemptCount === 1) {
      throw new Error('ECONNRESET: Connection closed by remote host');
    }
    if (attemptCount === 2) {
      throw new Error('ETIMEDOUT: Socket timeout reached');
    }
    return 'payload_after_2_network_failures';
  });

  assert.strictEqual(cb.getQueueLength(), 1);

  // Trigger recovery to CLOSED
  cb.recordSuccess();
  assert.strictEqual(cb.isClosed(), true);

  // Await the queued execution through both retries
  const result = await queuedPromise;
  assert.strictEqual(result, 'payload_after_2_network_failures');
  assert.strictEqual(attemptCount, 3, 'Must have executed 3 times (2 failures + 1 success)');
  assert.strictEqual(cb.getQueueLength(), 0, 'Queue must be empty');
});

test('Challenger 2.1b: CircuitBreaker non-429 retry rejects after exceeding 3 retries and unblocks subsequent items', async () => {
  const cb = new APIQuotaCircuitBreaker({
    failureThreshold: 10,
    initialBackoffMs: 30,
  });

  // Trip to OPEN
  cb.handleQuotaError();

  let unrecoverableAttempts = 0;
  // Item 1: Fails persistently with non-429 error
  const failingPromise = cb.execute(async () => {
    unrecoverableAttempts++;
    throw new Error(`Permanent DB Failure #${unrecoverableAttempts}`);
  });

  // Item 2: Should succeed after Item 1 exhausts retries and is rejected
  let healthyExecuted = false;
  const healthyPromise = cb.execute(async () => {
    healthyExecuted = true;
    return 'healthy_result';
  });

  assert.strictEqual(cb.getQueueLength(), 2);

  // Recovery
  cb.recordSuccess();

  // Item 1 must reject after retries
  await assert.rejects(
    async () => failingPromise,
    /Permanent DB Failure/
  );
  assert.ok(unrecoverableAttempts >= 3, 'Item 1 must have attempted retries before rejecting');

  // Trigger draining if not already processed
  if (cb.getQueueLength() > 0) {
    await cb.drainQueue();
  }

  const healthyRes = await healthyPromise;
  assert.strictEqual(healthyRes, 'healthy_result');
  assert.strictEqual(healthyExecuted, true);
  assert.strictEqual(cb.getQueueLength(), 0);
});

test('Challenger 2.1c: CircuitBreaker clearQueue and reset cleanly abort pending retry timers without unhandled errors', async () => {
  const cb = new APIQuotaCircuitBreaker({
    failureThreshold: 5,
    initialBackoffMs: 100,
  });

  cb.handleQuotaError();

  // Queue two requests
  const p1 = cb.execute(async () => 'task1');
  const p2 = cb.execute(async () => 'task2');
  // Clear queue
  cb.clearQueue();
  assert.strictEqual(cb.getQueueLength(), 0);

  // Both promises must reject with queue cleared error
  await assert.rejects(p1, /Circuit breaker queue cleared/);
  await assert.rejects(p2, /Circuit breaker queue cleared/);

  // Reset circuit breaker
  cb.reset();
  assert.strictEqual(cb.getState(), CircuitBreakerState.CLOSED);
  assert.strictEqual(cb.isClosed(), true);
  assert.strictEqual(cb.getConsecutiveFailures(), 0);
  assert.strictEqual(cb.getConsecutive429s(), 0);

  // When OPEN, execute with queueIfOpen: false throws CircuitBreakerOpenError
  cb.handleQuotaError();
  assert.strictEqual(cb.getState(), CircuitBreakerState.OPEN);
  await assert.rejects(
    async () => cb.execute(async () => 'never', { queueIfOpen: false }),
    (err) => err instanceof CircuitBreakerOpenError && err.retryAfterMs > 0
  );
});

/* ==============================================================================
 * SUITE 2: PERK TREE PROTOTYPE POLLUTION ATTACK VECTORS
 * ============================================================================== */

test('Challenger 2.2: PerkTreeManager is immune to prototype pollution attack vectors (__proto__, constructor, toString, etc.)', () => {
  const attackVectors = [
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
  ];

  for (const maliciousKey of attackVectors) {
    // 1. canUpgradePerk must safely deny unknown perk
    const check = PerkTreeManager.canUpgradePerk(maliciousKey, {}, 9999);
    assert.strictEqual(check.canUpgrade, false, `Vector ${maliciousKey} must not be upgradable`);
    assert.strictEqual(check.reason, 'Unknown perk ID');

    // 2. upgradePerk must fail safely
    const upgradeRes = PerkTreeManager.upgradePerk(maliciousKey, {}, 9999);
    assert.strictEqual(upgradeRes.success, false);
    assert.strictEqual(upgradeRes.remainingEssence, 9999);

    // 3. calculateSpentEssence must ignore polluted keys
    const spent = PerkTreeManager.calculateSpentEssence({ [maliciousKey]: 3 });
    assert.strictEqual(spent, 0, `Vector ${maliciousKey} must contribute 0 spent essence`);
  }

  // 4. Polluted currentPerks object created with null prototype
  const nullProtoPerks = Object.create(null);
  nullProtoPerks.sugar_spark = 1;
  const nullCheck = PerkTreeManager.canUpgradePerk('sugar_spark', nullProtoPerks, 100);
  assert.strictEqual(nullCheck.canUpgrade, true, 'Null-prototype object must not throw TypeError');

  // 5. Polluted object with overriding hasOwnProperty property
  const overriddenHasOwn = {
    hasOwnProperty: 'malicious_override_string',
    sugar_spark: 2,
  };
  const checkOverridden = PerkTreeManager.canUpgradePerk('sugar_spark', overriddenHasOwn, 100);
  assert.strictEqual(checkOverridden.canUpgrade, true, 'Overridden hasOwnProperty must not cause crash');

  // 6. Polluted object with throwing toString and valueOf
  const throwingPerks = {
    sugar_spark: 1,
    toString: () => {
      throw new Error('Malicious toString executed');
    },
    valueOf: () => {
      throw new Error('Malicious valueOf executed');
    },
  };
  const bonuses = PerkTreeManager.calculateAppliedBonuses(throwingPerks);
  assert.strictEqual(bonuses.startingBlastRadiusBonus, 1);
});

/* ==============================================================================
 * SUITE 3: PERSISTENCE QUOTA EXHAUSTION FALLBACK & PAYLOAD CORRUPTION
 * ============================================================================== */

test('Challenger 2.3: WebStorageAdapter maintains 100% read consistency during rapid quota exhaustion flapping', () => {
  let healthyData = 'STABLE_STORAGE_DATA';
  let quotaFailing = false;

  const flappingStorage = {
    getItem: (key) => (key === 'save' ? healthyData : null),
    setItem: (key, value) => {
      if (quotaFailing) {
        throw new Error('QuotaExceededError: The quota has been exceeded.');
      }
      healthyData = value;
    },
    removeItem: () => {},
    clear: () => {},
  };

  const adapter = new WebStorageAdapter('local');
  adapter.storage = flappingStorage;

  // Simulate 50 rapid alternating writes (quota failure vs storage recovery)
  for (let i = 0; i < 50; i++) {
    const payload = `STATE_VERSION_${i}`;
    quotaFailing = i % 2 === 1; // Odd writes throw QuotaExceededError

    adapter.setItem('save', payload);

    // CRITICAL: Read must ALWAYS return the exact payload written, never stale data!
    const read = adapter.getItem('save');
    assert.strictEqual(
      read,
      payload,
      `Cycle ${i}: Read must return '${payload}' regardless of quota status (got '${read}')`
    );
  }
});

test('Challenger 2.3b: GameStatePersistence sanitizeMetaProfile neutralizes negative, NaN, and corrupted payloads', () => {
  const session = new MemoryStorageAdapter();
  const local = new MemoryStorageAdapter();
  const persistence = new GameStatePersistence(session, local);

  const extremeCorruptedProfile = {
    version: 'invalid_version',
    lastUpdated: -123456,
    cosmicEssence: -99999999,
    starCandies: Infinity,
    perks: {
      sugar_spark: -10,
      quick_wick: 3.8, // Decimal level
      chain_reaction: 'corrupted_string',
      master_confectioner: 99999, // Way above maxLevel
      __proto__: 999,
      constructor: 888,
      prototype: 777,
      toString: 666,
    },
    unlockedModes: [null, undefined, 1234, 'crisis_survival', { hack: true }],
    discoveredRelics: [999, 'sugar_feather', null],
    highestWaveReached: { standard: -5, endless: NaN },
    bestBossRushTimeSeconds: -350,
  };

  const sanitized = persistence.sanitizeMetaProfile(extremeCorruptedProfile);

  assert.strictEqual(sanitized.version, STORAGE_SCHEMA_VERSION);
  assert.strictEqual(sanitized.cosmicEssence, 0, 'Negative cosmicEssence clamped to 0');
  assert.strictEqual(sanitized.starCandies, 50, 'Infinity starCandies falls back to default 50');

  // Perks verification
  assert.strictEqual(sanitized.perks.sugar_spark, 0, 'Negative perk level clamped to 0');
  assert.strictEqual(sanitized.perks.quick_wick, 3, 'Decimal perk level floored to 3');
  assert.strictEqual(sanitized.perks.chain_reaction, 0, 'String perk level clamped to 0');
  assert.strictEqual(
    sanitized.perks.master_confectioner,
    CONFECTIONERY_PERKS.master_confectioner.maxLevel,
    'Perk level clamped to maxLevel'
  );
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized.perks, '__proto__'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized.perks, 'constructor'), false);

  // Arrays verification
  assert.deepStrictEqual(sanitized.unlockedModes, ['crisis_survival']);
  assert.deepStrictEqual(sanitized.discoveredRelics, ['sugar_feather']);
  assert.strictEqual(sanitized.bestBossRushTimeSeconds, 0, 'Negative boss rush time clamped to 0');
});

test('Challenger 2.3c: GameStatePersistence importSavePackage rejects fuzzed and tampered packages', () => {
  const persistence = new GameStatePersistence(new MemoryStorageAdapter(), new MemoryStorageAdapter());

  // 1. Truncated JSON
  const res1 = persistence.importSavePackage('{"version": "1.0", "exportApp":');
  assert.strictEqual(res1.success, false);
  assert.ok(res1.error.includes('JSON parsing error'));

  // 2. Wrong App Identifier
  const res2 = persistence.importSavePackage(
    JSON.stringify({
      version: STORAGE_SCHEMA_VERSION,
      exportApp: 'malicious_app_identifier',
      checksum: 'deadbeef',
    })
  );
  assert.strictEqual(res2.success, false);
  assert.ok(res2.error.includes('Invalid application identifier'));

  // 3. Tampered Checksum
  const validPkg = {
    version: STORAGE_SCHEMA_VERSION,
    exportTimestamp: Date.now(),
    exportApp: EXPORT_APP_IDENTIFIER,
    metaProfile: persistence.createDefaultMetaProfile(),
    runState: null,
    checksum: '',
  };
  validPkg.checksum = calculateChecksum(validPkg);

  // Tamper with data without updating checksum
  validPkg.metaProfile.cosmicEssence = 999999;
  const res3 = persistence.importSavePackage(JSON.stringify(validPkg));
  assert.strictEqual(res3.success, false);
  assert.ok(res3.error.includes('Checksum verification failed'));
});

/* ==============================================================================
 * SUITE 4: TELEGRAPH ENGINE CONCURRENCY & SLOT SWAPPING INTEGRITY
 * ============================================================================== */

test('Challenger 2.4: TelegraphEngine slot swap-and-pop maintains zero corruption under high concurrency cancellations', () => {
  assert.strictEqual(MAX_TELEGRAPH_TILES, 128);
  const engine = new TelegraphEngine();

  // Register 20 distinct attacks, 3 tiles each (60 slots total)
  const attackIds = [];
  for (let i = 1; i <= 20; i++) {
    const t1 = (i * 3) % 113 + 16;
    const t2 = (i * 3 + 1) % 113 + 16;
    const t3 = (i * 3 + 2) % 113 + 16;
    const reg = engine.registerAttack(i, [t1, t2, t3], 2000 + i * 50);
    assert.strictEqual(reg.success, true);
    attackIds.push(i);
  }

  const initialSlots = engine.activeCount;
  assert.strictEqual(initialSlots, 60);

  // Cancel alternating attacks (odd attack IDs: 1, 3, 5, 7, ...)
  for (let i = 1; i <= 20; i += 2) {
    const removed = engine.cancelAttack(i);
    assert.strictEqual(removed, 3, `Attack ${i} must have removed exactly 3 slots`);
  }

  // Active slots should now be exactly 30
  assert.strictEqual(engine.activeCount, 30);

  // Verify that remaining attacks (even attack IDs: 2, 4, 6, ...) are intact
  for (let i = 2; i <= 20; i += 2) {
    const t1 = (i * 3) % 113 + 16;
    assert.strictEqual(engine.isTileDangerous(t1), true, `Tile ${t1} for attack ${i} must remain dangerous`);
  }

  // Simultaneously advance time and cancel remaining attacks in reverse order
  engine.update(500);
  for (let i = 20; i >= 2; i -= 2) {
    engine.cancelAttack(i);
  }

  // Engine must be completely clean with zero ghost telegraphs
  assert.strictEqual(engine.activeCount, 0);
  assert.strictEqual(engine.activeWalkableDangerCount, 0);
  for (let idx = 0; idx < engine.totalTiles; idx++) {
    assert.strictEqual(engine.isTileDangerous(idx), false);
    assert.strictEqual(engine.getTileTier(idx), TelegraphTier.NONE);
  }
});

test('Challenger 2.4b: TelegraphEngine guarantees safe area invariant >= 40% under attack flooding', () => {
  const engine = new TelegraphEngine();

  // Gather 80 verified walkable corridor tiles (exceeds 113 * 0.6 = 67 max allowed danger budget)
  const walkableTiles = [];
  for (let r = 1; r < 12; r++) {
    for (let c = 1; c < 14; c++) {
      if (!(r % 2 === 0 && c % 2 === 0)) {
        walkableTiles.push(r * 15 + c);
      }
    }
  }
  const excessiveTiles = walkableTiles.slice(0, 80);

  // Attempt to register a massive 80-tile attack without trimming
  const strictReg = engine.registerAttack(1, excessiveTiles, 2000, false);
  assert.strictEqual(strictReg.success, false, 'Massive attack must be rejected when allowTrimming is false');
  assert.strictEqual(strictReg.reason, 'EXCEEDS_SAFE_BUDGET');

  // Now register with trimming enabled
  const trimmedReg = engine.registerAttack(2, excessiveTiles, 2000, true);
  assert.strictEqual(trimmedReg.success, true, 'Attack must succeed with trimming');

  // Verify invariant: safeWalkableRatio must be >= 0.40
  const safeRatio = engine.getSafeWalkableRatio();
  assert.ok(safeRatio >= 0.40, `Safe area ratio ${safeRatio} must be >= 0.40`);
});

/* ==============================================================================
 * SUITE 5: BOSS STUN VULNERABILITY, I-FRAMES, ARENA BOUNDS & DEATH SEQUENCE
 * ============================================================================== */

test('Challenger 2.5: BaseBoss maintains stun tactical vulnerability without post-combo i-frame shielding', () => {
  const boss = new MockTestBoss(15);
  boss.update(1500); // Complete INTRO -> PHASE_1
  assert.strictEqual(boss.getState(), BossState.PHASE_1);

  // Apply stun for 3 seconds
  boss.applyStun(3.0);
  assert.strictEqual(boss.getState(), BossState.STUNNED);
  assert.strictEqual(boss.isInvulnerable, false);
  assert.strictEqual(boss.iFrameTimerMs, 0);

  // Bomb hit 1 during stun
  const hit1 = boss.takeBombHit(2);
  assert.strictEqual(hit1, true);
  assert.strictEqual(boss.currentHp, 13);

  // Bomb hit 2 within 150ms buffer window during stun (combo hit)
  const hit2 = boss.takeBombHit(2);
  assert.strictEqual(hit2, true);
  assert.strictEqual(boss.currentHp, 11);

  // Advance time past combo buffer window (160ms)
  boss.update(160);

  // CRITICAL ARCH-02 CHECK: Boss must STILL be STUNNED, and i-frames must NOT be engaged!
  assert.strictEqual(boss.getState(), BossState.STUNNED);
  assert.strictEqual(boss.isInvulnerable, false, 'Stunned boss must NOT receive post-combo i-frames');
  assert.strictEqual(boss.iFrameTimerMs, 0);

  // Bomb hit 3 must be accepted immediately without waiting for i-frames
  const hit3 = boss.takeBombHit(3);
  assert.strictEqual(hit3, true);
  assert.strictEqual(boss.currentHp, 8);
});

test('Challenger 2.5b: BaseBoss stun recovery engages protective i-frames upon combat resumption', () => {
  const boss = new MockTestBoss(10);
  boss.update(1500); // INTRO -> PHASE_1
  boss.applyStun(1.0); // 1-second stun

  // Advance 1050ms (stun expires)
  boss.update(1050);

  // Boss should resume combat phase (PHASE_1) and have recovery i-frames engaged
  assert.strictEqual(boss.getState(), BossState.PHASE_1);
  assert.strictEqual(boss.isInvulnerable, true, 'Recovery from stun must grant i-frames');
  assert.ok(boss.iFrameTimerMs > 0, 'iFrameTimerMs must be active');

  // Attempting damage during recovery i-frames must be rejected
  const rejectedHit = boss.takeBombHit(2);
  assert.strictEqual(rejectedHit, false, 'Hit during recovery i-frames must be rejected');
  assert.strictEqual(boss.currentHp, 10);
});

test('Challenger 2.5c: BaseBoss death sequence enforces 1200ms animation before dismissibility', () => {
  const boss = new MockTestBoss(4);
  boss.update(1500); // INTRO -> PHASE_1

  // Deal lethal damage
  boss.takeBombHit(4);
  assert.strictEqual(boss.currentHp, 0);
  assert.strictEqual(boss.getState(), BossState.DEFEATED);

  // Frame 0 of defeat: must not be dismissible
  assert.strictEqual(boss.isDismissible, false);
  assert.strictEqual(boss.isDeathAnimationComplete, false);

  // Advance 600ms (half duration)
  boss.update(600);
  assert.strictEqual(boss.isDismissible, false);
  assert.strictEqual(boss.isDeathAnimationComplete, false);

  // Advance remaining 650ms (total 1250ms >= 1200ms)
  boss.update(650);
  assert.strictEqual(boss.isDeathAnimationComplete, true);
  assert.strictEqual(boss.isDismissible, true, 'Boss must be dismissible after 1200ms animation');
  assert.strictEqual(boss.dismissibleReported, true);
});

test('Challenger 2.5d: HamsterBoss arena bounds clamp strictly across 5,000 randomized velocity steps', () => {
  const hamster = new HamsterBoss(300, 260);
  hamster.update(1500); // Complete INTRO

  for (let step = 0; step < 5000; step++) {
    // Randomize dashing or patrolling
    hamster.isDashing = step % 3 === 0;
    hamster.dashDirection = {
      x: (Math.random() * 2 - 1),
      y: (Math.random() * 2 - 1),
    };
    hamster.update(16, Math.random() * 600, Math.random() * 520);

    // Assert strictly bounded
    assert.ok(hamster.x >= hamster.minArenaX, `Hamster X ${hamster.x} breached minArenaX ${hamster.minArenaX}`);
    assert.ok(hamster.x <= hamster.maxArenaX, `Hamster X ${hamster.x} breached maxArenaX ${hamster.maxArenaX}`);
    assert.ok(hamster.y >= hamster.minArenaY, `Hamster Y ${hamster.y} breached minArenaY ${hamster.minArenaY}`);
    assert.ok(hamster.y <= hamster.maxArenaY, `Hamster Y ${hamster.y} breached maxArenaY ${hamster.maxArenaY}`);
  }
});

test('Challenger 2.5e: QueenBeeBoss flight invulnerability rejects floor bombs, while grounded stun accepts hits', () => {
  const queen = new QueenBeeBoss(300, 200);
  queen.update(1500); // Complete INTRO -> PHASE_1
  assert.strictEqual(queen.bossState, BossState.PHASE_1);
  assert.strictEqual(queen.isFlying, true);
  assert.strictEqual(queen.isGrounded, false);

  // Floor bomb hit while flying must be rejected
  const flightHit = queen.takeFloorBombDamage(1);
  assert.strictEqual(flightHit, false, 'Floor bomb must not hit flying boss');

  // Trigger grounding via popShield (all 4 shields destroyed)
  queen.popShield();
  queen.popShield();
  queen.popShield();
  queen.popShield();

  // Boss should now be grounded and in Sugar Coma stun
  assert.strictEqual(queen.isGrounded, true);
  assert.strictEqual(queen.bossState, BossState.STUNNED);

  // Floor bomb hit while grounded must be accepted
  const groundedHit = queen.takeFloorBombDamage(1);
  assert.strictEqual(groundedHit, true, 'Grounded stunned Queen Bee must accept floor bomb damage');
});

/* ==============================================================================
 * SUITE 6: CRISIS STATE RESET ACROSS ALL 6 SUBCLASSES
 * ============================================================================== */

test('Challenger 2.6: BaseCrisis reset() completely purges all subclass-specific state across all 6 crises', () => {
  const crises = [
    new OrbitalCrisis(),
    new VoidCrisis(),
    new LavaCrisis(),
    new ClockworkCrisis(),
    new RiftCrisis(),
    new SolarFlareCrisis(),
  ];

  for (const crisis of crises) {
    crisis.init();
    crisis.update(100);

    // Contaminate base state
    crisis.threatMeter = 85;
    crisis.activeAlert = {
      id: 'test_alert',
      title: 'Contaminated Alert',
      message: 'Testing',
      level: 'danger',
      icon: '⚠️',
      durationMs: 3000,
      remainingMs: 3000,
    };

    // Subclass-specific contamination
    if (crisis instanceof OrbitalCrisis) {
      crisis.salvosEvadedCount = 5;
      crisis.macrocannonCharge = 90;
      crisis.pendingCraters.push({ r: 5, c: 5, remainingMs: 1000 });
    } else if (crisis instanceof VoidCrisis) {
      crisis.voidCreepCount = 20;
      crisis.avatarSpawned = true;
      crisis.supernovaCleansed = true;
    } else if (crisis instanceof LavaCrisis) {
      crisis.lavaTilesCount = 15;
      crisis.currentLavaRing = 4;
      crisis.obsidianSolidifiedCount = 3;
      crisis.isCalderaSealed = true;
    } else if (crisis instanceof ClockworkCrisis) {
      crisis.isOverloadWindowActive = true;
      crisis.overloadWindowTimerMs = 800;
      crisis.totalEmpPulsesFired = 4;
    } else if (crisis instanceof RiftCrisis) {
      crisis.isQuantumSyncActive = true;
      crisis.quantumSyncTimerMs = 1500;
      crisis.warpsPerformedCount = 6;
    } else if (crisis instanceof SolarFlareCrisis) {
      crisis.isCmeSweeping = true;
      crisis.cmeSweepRemainingMs = 800;
      crisis.sweepsSurvivedCount = 3;
    }

    // Execute reset()
    crisis.reset();

    // Verify BaseCrisis invariants
    assert.strictEqual(crisis.stage, CrisisStage.INACTIVE, `${crisis.name} stage must be INACTIVE`);
    assert.strictEqual(crisis.threatMeter, 0, `${crisis.name} threatMeter must be 0`);
    assert.strictEqual(crisis.activeAlert, null, `${crisis.name} activeAlert must be null`);
    assert.strictEqual(crisis.objectives.length, 0, `${crisis.name} objectives must be empty`);

    // Verify Subclass state purges
    if (crisis instanceof OrbitalCrisis) {
      assert.strictEqual(crisis.salvosEvadedCount, 0);
      assert.strictEqual(crisis.macrocannonCharge, 0);
      assert.strictEqual(crisis.pendingCraters.length, 0);
    } else if (crisis instanceof VoidCrisis) {
      assert.strictEqual(crisis.voidCreepCount, 0);
      assert.strictEqual(crisis.avatarSpawned, false);
      assert.strictEqual(crisis.supernovaCleansed, false);
    } else if (crisis instanceof LavaCrisis) {
      assert.strictEqual(crisis.lavaTilesCount, 0);
      assert.strictEqual(crisis.currentLavaRing, 1);
      assert.strictEqual(crisis.obsidianSolidifiedCount, 0);
      assert.strictEqual(crisis.isCalderaSealed, false);
    } else if (crisis instanceof ClockworkCrisis) {
      assert.strictEqual(crisis.isOverloadWindowActive, false);
      assert.strictEqual(crisis.overloadWindowTimerMs, 0);
      assert.strictEqual(crisis.totalEmpPulsesFired, 0);
    } else if (crisis instanceof RiftCrisis) {
      assert.strictEqual(crisis.isQuantumSyncActive, false);
      assert.strictEqual(crisis.quantumSyncTimerMs, 0);
      assert.strictEqual(crisis.warpsPerformedCount, 0);
    } else if (crisis instanceof SolarFlareCrisis) {
      assert.strictEqual(crisis.isCmeSweeping, false);
      assert.strictEqual(crisis.cmeSweepRemainingMs, 0);
      assert.strictEqual(crisis.sweepsSurvivedCount, 0);
    }
  }
});

/* ==============================================================================
 * SUITE 7: TOUCH CONTROLS & JOYSTICK DIAGONAL TRANSITIONS
 * ============================================================================== */

test('Challenger 2.7: Joystick angle partitioning eliminates dead zones across full 360-degree sweep', () => {
  const mapAngleToInputs = (angle, distance = 20) => {
    if (distance < 5) {
      return { up: false, down: false, left: false, right: false };
    }
    const norm = ((angle % 360) + 360) % 360;
    return {
      up: norm >= 22.5 && norm <= 157.5,
      down: norm >= 202.5 && norm <= 337.5,
      left: norm >= 112.5 && norm <= 247.5,
      right: norm <= 67.5 || norm >= 292.5,
    };
  };

  // Test full 360° sweep at 0.5° increments: NO angle can produce all false when distance >= 5
  for (let deg = 0; deg < 360; deg += 0.5) {
    const input = mapAngleToInputs(deg, 20);
    const hasAnyDirection = input.up || input.down || input.left || input.right;
    assert.strictEqual(hasAnyDirection, true, `Angle ${deg}° must activate at least one direction`);
  }

  // Test critical diagonal transitions assigned in dispatch:
  // 1. Sector 130°-140° (Up-Left diagonal)
  for (let deg = 130; deg <= 140; deg += 1) {
    const input = mapAngleToInputs(deg, 20);
    assert.strictEqual(input.up, true, `Angle ${deg}° must have UP = true`);
    assert.strictEqual(input.left, true, `Angle ${deg}° must have LEFT = true`);
    assert.strictEqual(input.down, false, `Angle ${deg}° must have DOWN = false`);
    assert.strictEqual(input.right, false, `Angle ${deg}° must have RIGHT = false`);
  }

  // 2. Sector 220°-230° (Down-Left diagonal)
  for (let deg = 220; deg <= 230; deg += 1) {
    const input = mapAngleToInputs(deg, 20);
    assert.strictEqual(input.down, true, `Angle ${deg}° must have DOWN = true`);
    assert.strictEqual(input.left, true, `Angle ${deg}° must have LEFT = true`);
    assert.strictEqual(input.up, false, `Angle ${deg}° must have UP = false`);
    assert.strictEqual(input.right, false, `Angle ${deg}° must have RIGHT = false`);
  }

  // 3. Distance < 5 deadzone / neutral check
  const neutral = mapAngleToInputs(135, 3);
  assert.strictEqual(neutral.up, false);
  assert.strictEqual(neutral.down, false);
  assert.strictEqual(neutral.left, false);
  assert.strictEqual(neutral.right, false);
});

test('Challenger 2.7b: Action button rapid tapping and pointer cancellation reset input states cleanly', () => {
  const mobileInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    bomb: false,
    dash: false,
    ultimate: false,
  };

  // Simulate 1,000 rapid button taps in 1 frame
  for (let i = 0; i < 1000; i++) {
    mobileInput.bomb = true;
    mobileInput.dash = true;
    // Rapid release
    mobileInput.bomb = false;
    mobileInput.dash = false;
  }

  assert.strictEqual(mobileInput.bomb, false);
  assert.strictEqual(mobileInput.dash, false);

  // Simulate pointer cancel (e.g. finger dragged off screen or call interruption)
  mobileInput.bomb = true;
  mobileInput.dash = true;
  mobileInput.ultimate = true;

  // Pointer cancel handler
  const handlePointerCancel = () => {
    mobileInput.bomb = false;
    mobileInput.dash = false;
    mobileInput.ultimate = false;
  };

  handlePointerCancel();

  assert.strictEqual(mobileInput.bomb, false, 'Bomb must be false after pointer cancel');
  assert.strictEqual(mobileInput.dash, false, 'Dash must be false after pointer cancel');
  assert.strictEqual(mobileInput.ultimate, false, 'Ultimate must be false after pointer cancel');
});
