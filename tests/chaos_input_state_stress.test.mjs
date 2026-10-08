import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultMobileInputState,
  resolveJoystickDirection,
  resolveJoystickVector,
  resetJoystickDirection,
  resetAllMobileInputs,
  resolveContradictoryDirections,
  hasContradictoryDirections,
  sanitizeMobileInputState,
  triggerMobileAction,
  cancelMobileAction,
  releaseMobileAction,
  ButtonDebouncer,
  triggerMobileActionDebounced,
  MultiTouchPointerTracker,
} from '../src/game/input_state.ts';

/* ==============================================================================
 * SECTION 1: 10,000+ RAPID SWIPE GESTURES & CONTINUOUS INPUT RESOLUTION
 * ============================================================================== */

test('Stress Section 1.1 [12,000 Continuous Swipe Steps]: High-velocity arc swipes across 360° maintain zero deadzones and zero contradictions', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const startTime = performance.now();

  const sectorCounts = {
    RIGHT: 0,
    UP_RIGHT: 0,
    UP: 0,
    UP_LEFT: 0,
    LEFT: 0,
    DOWN_LEFT: 0,
    DOWN: 0,
    DOWN_RIGHT: 0,
  };

  const POINTER_ID = 1;
  tracker.onPointerDown(POINTER_ID, 'joystick', state, { x: 200, y: 200 }, undefined, 1000);

  let contradictoryCount = 0;
  let nonBooleanCount = 0;
  let simulatedTime = 1000;

  for (let i = 0; i < 12000; i++) {
    simulatedTime += 8; // 120 FPS high refresh swipe
    // Complex Lissajous / Multi-arc curve to test rapid multi-directional swiping
    const angleRad = (i * 0.08) + Math.sin(i * 0.01) * 2;
    const radius = 25 + 15 * Math.cos(i * 0.005); // 10px to 40px (all above 5px deadzone)
    const touchX = 200 + Math.cos(angleRad) * radius;
    const touchY = 200 - Math.sin(angleRad) * radius; // inverted screen Y

    tracker.onPointerMove(POINTER_ID, { x: touchX, y: touchY }, state, { x: 200, y: 200 }, simulatedTime);

    // Verify boolean types
    if (
      typeof state.up !== 'boolean' ||
      typeof state.down !== 'boolean' ||
      typeof state.left !== 'boolean' ||
      typeof state.right !== 'boolean'
    ) {
      nonBooleanCount++;
    }

    // Verify mutual exclusion
    if ((state.up && state.down) || (state.left && state.right)) {
      contradictoryCount++;
    }

    // Classify active sector
    if (state.right && !state.up && !state.down) sectorCounts.RIGHT++;
    else if (state.right && state.up) sectorCounts.UP_RIGHT++;
    else if (state.up && !state.left && !state.right) sectorCounts.UP++;
    else if (state.left && state.up) sectorCounts.UP_LEFT++;
    else if (state.left && !state.up && !state.down) sectorCounts.LEFT++;
    else if (state.left && state.down) sectorCounts.DOWN_LEFT++;
    else if (state.down && !state.left && !state.right) sectorCounts.DOWN++;
    else if (state.right && state.down) sectorCounts.DOWN_RIGHT++;
  }

  tracker.onPointerUp(POINTER_ID, state);
  const elapsed = performance.now() - startTime;

  assert.equal(contradictoryCount, 0, 'Opposing directions must never be simultaneously active');
  assert.equal(nonBooleanCount, 0, 'All direction flags must strictly be booleans');
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must reset to all false on pointerup');

  // Verify full 360-degree sector coverage
  for (const [sector, count] of Object.entries(sectorCounts)) {
    assert.ok(count > 500, `Sector ${sector} had insufficient coverage: ${count} samples`);
  }

  assert.ok(elapsed < 200, `12,000 swipe resolution steps executed in ${elapsed.toFixed(2)}ms (budget < 200ms)`);
});

test('Stress Section 1.2 [10,000 High-Frequency Vector Conversions]: Precision euclidean mapping across subpixel coordinates', () => {
  const startTime = performance.now();
  let validVectors = 0;

  for (let iter = 0; iter < 10000; iter++) {
    const angleDeg = (iter * 0.036) % 360;
    const rad = (angleDeg * Math.PI) / 180;
    const dist = 5.0 + (iter % 95) * 0.5; // 5.0px to 52.5px
    const dx = Math.cos(rad) * dist;
    const dy = -Math.sin(rad) * dist; // screen Y inverted

    const vec = resolveJoystickVector(dx, dy);

    assert.ok(Number.isFinite(vec.angle), 'Angle must be finite');
    assert.ok(Number.isFinite(vec.distance), 'Distance must be finite');
    assert.ok(Math.abs(vec.distance - dist) < 0.001, `Distance mismatch: expected ${dist}, got ${vec.distance}`);
    assert.ok(!(vec.up && vec.down), 'UP and DOWN mutually exclusive');
    assert.ok(!(vec.left && vec.right), 'LEFT and RIGHT mutually exclusive');

    validVectors++;
  }

  const elapsed = performance.now() - startTime;
  assert.equal(validVectors, 10000);
  assert.ok(elapsed < 150, `10,000 vector conversions took ${elapsed.toFixed(2)}ms (budget < 150ms)`);
});

/* ==============================================================================
 * SECTION 2: 10,000+ RAPID TOUCH, CANCEL, AND RELEASE COMBAT SPAM
 * ============================================================================== */

test('Stress Section 2.1 [15,000 Chaos Touch, Swipe, and Cancel Interleavings]: Hardware interrupt & touchcancel resilience', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 25 });
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);

  const targets = ['joystick', 'bomb', 'dash', 'ultimate'];
  const startTime = performance.now();
  let cancelsCount = 0;
  let simulatedTime = 1000;

  for (let iter = 0; iter < 15000; iter++) {
    simulatedTime += 4;
    const ptr = iter % 6; // 6 concurrent fingers
    const target = targets[(iter * 3) % targets.length];
    const op = iter % 5;

    if (op === 0) {
      // Touch start
      tracker.onPointerDown(ptr, target, state, { x: 100, y: 100 }, fakeScheduler, simulatedTime);
    } else if (op === 1) {
      // Swipe / Move
      const moveAngle = (iter * 0.2) % (2 * Math.PI);
      const moveDist = 10 + (iter % 30);
      tracker.onPointerMove(
        ptr,
        { x: 100 + Math.cos(moveAngle) * moveDist, y: 100 + Math.sin(moveAngle) * moveDist },
        state,
        { x: 100, y: 100 },
        simulatedTime
      );
    } else if (op === 2) {
      // Touch cancel (simulating OS gesture intercept, alert popup, notification swipe)
      tracker.onPointerCancel(ptr, state);
      cancelsCount++;
    } else if (op === 3) {
      // Normal Touch release
      tracker.onPointerUp(ptr, state, fakeScheduler);
    } else if (op === 4) {
      // System wide cancel on modal / window interrupt
      if (iter % 150 === 0) {
        tracker.cancelAllPointers(state);
      }
    }

    // Flush frame fallbacks periodically
    if (scheduledFrames.length > 20) {
      const batch = scheduledFrames.splice(0, scheduledFrames.length);
      for (const cb of batch) cb();
    }
  }

  // Final flush and reset
  tracker.cancelAllPointers(state);
  while (scheduledFrames.length > 0) {
    const cb = scheduledFrames.shift();
    cb();
  }

  const elapsed = performance.now() - startTime;
  assert.equal(tracker.getActivePointerCount(), 0, 'No pointers should linger');
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must be fully zeroed');
  assert.ok(cancelsCount >= 2500, `Expected >= 2500 cancellations, got ${cancelsCount}`);
  assert.ok(elapsed < 250, `15,000 chaos touch operations completed in ${elapsed.toFixed(2)}ms (budget < 250ms)`);
});

/* ==============================================================================
 * SECTION 3: 15,000+ MALFORMED, NAN, AND NON-FINITE COORDINATE FUZZING
 * ============================================================================== */

test('Stress Section 3.1 [15,000 NaN & Malformed Coordinate Injections]: Zero crashes and zero state corruption', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const startTime = performance.now();

  const poisonousValues = [
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    'NaN',
    'undefined',
    {},
    [],
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    Number.MIN_VALUE,
    -Number.MIN_VALUE,
    1e308,
    -1e308,
    0 / 0,
    1 / 0,
    -1 / 0,
  ];

  let testedCases = 0;

  for (let i = 0; i < 15000; i++) {
    const val1 = poisonousValues[i % poisonousValues.length];
    const val2 = poisonousValues[(i * 3) % poisonousValues.length];
    const val3 = poisonousValues[(i * 7) % poisonousValues.length];

    // 1. Fuzz resolveJoystickVector
    const vec = resolveJoystickVector(val1, val2, val3);
    assert.ok(typeof vec.up === 'boolean');
    assert.ok(typeof vec.down === 'boolean');
    assert.ok(typeof vec.left === 'boolean');
    assert.ok(typeof vec.right === 'boolean');
    assert.ok(Number.isFinite(vec.angle));
    assert.ok(Number.isFinite(vec.distance));
    assert.ok(!(vec.up && vec.down));
    assert.ok(!(vec.left && vec.right));

    // 2. Fuzz resolveJoystickDirection
    const dir = resolveJoystickDirection(val1, val2);
    assert.ok(typeof dir.up === 'boolean');
    assert.ok(typeof dir.down === 'boolean');
    assert.ok(typeof dir.left === 'boolean');
    assert.ok(typeof dir.right === 'boolean');
    assert.ok(!(dir.up && dir.down));
    assert.ok(!(dir.left && dir.right));

    // 3. Fuzz tracker onPointerDown & onPointerMove with poisonous coordinates
    const ptr = i % 4;
    tracker.onPointerDown(ptr, 'joystick', state, { x: val1, y: val2 });
    tracker.onPointerMove(ptr, { x: val2, y: val1 }, state, { x: val3, y: val1 });
    tracker.onPointerUp(ptr, state);

    // 4. Verify state integrity
    assert.ok(typeof state.up === 'boolean');
    assert.ok(typeof state.down === 'boolean');
    assert.ok(typeof state.left === 'boolean');
    assert.ok(typeof state.right === 'boolean');
    assert.ok(!(state.up && state.down));
    assert.ok(!(state.left && state.right));

    testedCases++;
  }

  tracker.reset(state);
  assert.deepEqual(state, createDefaultMobileInputState());
  const elapsed = performance.now() - startTime;
  assert.equal(testedCases, 15000);
  assert.ok(elapsed < 300, `15,000 NaN injections completed in ${elapsed.toFixed(2)}ms (budget < 300ms)`);
});

/* ==============================================================================
 * SECTION 4: WATCHDOG TIMER DEEP VERIFICATION & DROPPED TOUCH RECOVERY
 * ============================================================================== */

test('Stress Section 4.1 [Continuous Swipe Immunity]: Active swiping updates timestamp and is NEVER dropped by watchdog', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  const POINTER_ID = 42;
  const START_TIME = 1000;
  tracker.onPointerDown(POINTER_ID, 'joystick', state, { x: 100, y: 100 }, undefined, START_TIME);

  // Player swipes continuously for 6 seconds (6000ms > 3000ms maxAgeMs)
  let currentTime = START_TIME;
  let watchdogCalls = 0;

  for (let step = 0; step < 600; step++) {
    currentTime += 10; // every 10ms (100Hz touch sampling)
    const angle = (step * 0.05) % (2 * Math.PI);
    const x = 100 + Math.cos(angle) * 30;
    const y = 100 - Math.sin(angle) * 30;

    // Dispatch move with current timestamp
    tracker.onPointerMove(POINTER_ID, { x, y }, state, { x: 100, y: 100 }, currentTime);

    // Watchdog runs every 1000ms
    if (step % 100 === 0 && step > 0) {
      const recovered = tracker.recoverDroppedPointers(state, 3000, currentTime);
      assert.equal(recovered, 0, `Active swipe must NOT be pruned by watchdog at ${currentTime}ms`);
      assert.equal(tracker.getActivePointerCount('joystick'), 1, 'Pointer must remain active');
      watchdogCalls++;
    }
  }

  assert.ok(watchdogCalls >= 5, 'Watchdog was checked multiple times during swipe');
  assert.equal(tracker.getActivePointerCount('joystick'), 1);

  // Now stop swiping (abandon finger) and advance time past 3000ms
  currentTime += 3500;
  const finalRecovered = tracker.recoverDroppedPointers(state, 3000, currentTime);
  assert.equal(finalRecovered, 1, 'Abandoned swipe pointer must now be recovered by watchdog');
  assert.equal(tracker.getActivePointerCount('joystick'), 0);
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must be reset upon watchdog recovery');
});

test('Stress Section 4.2 [Motionless Touch Heartbeat]: refreshPointer protects steady holds from watchdog pruning', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  const POINTER_ID = 7;
  const T0 = 2000;
  tracker.onPointerDown(POINTER_ID, 'dash', state, undefined, undefined, T0);
  assert.equal(state.dash, true);

  // User holds button motionless for 5 seconds without move events
  let t = T0;
  for (let tick = 0; tick < 5; tick++) {
    t += 1000;
    // Heartbeat sent by touch hold listener
    const refreshed = tracker.refreshPointer(POINTER_ID, t);
    assert.equal(refreshed, true, 'Heartbeat must successfully refresh pointer timestamp');

    // Watchdog check at this tick
    const recovered = tracker.recoverDroppedPointers(state, 3000, t);
    assert.equal(recovered, 0, 'Held button with heartbeat must NOT be dropped');
  }

  // Non-existent pointer refresh returns false
  assert.equal(tracker.refreshPointer(999, t), false);

  // If heartbeat ceases and 3500ms elapses, watchdog recovers it cleanly
  t += 3500;
  const recoveredAfterAbandon = tracker.recoverDroppedPointers(state, 3000, t);
  assert.equal(recoveredAfterAbandon, 1);
  assert.equal(tracker.getActivePointerCount('dash'), 0);
  assert.equal(state.dash, false);
});

test('Stress Section 4.3 [Partial Multi-Finger Drop Recovery]: Watchdog reaps only dead pointers, preserving active fingers', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  const T_BASE = 5000;

  // Finger 1 (Active Joystick thumb, started at T=5000)
  tracker.onPointerDown(1, 'joystick', state, { x: 100, y: 100 }, undefined, T_BASE);
  // Finger 2 (Active Bomb finger, started at T=7000)
  tracker.onPointerDown(2, 'bomb', state, undefined, undefined, T_BASE + 2000);
  // Finger 3 (Orphaned Dash finger, started at T=5000 and dropped)
  tracker.onPointerDown(3, 'dash', state, undefined, undefined, T_BASE);
  // Finger 4 (Orphaned Ultimate finger, started at T=5000 and dropped)
  tracker.onPointerDown(4, 'ultimate', state, undefined, undefined, T_BASE);

  // Keep Finger 1 and Finger 2 alive at T=8500
  tracker.onPointerMove(1, { x: 150, y: 100 }, state, { x: 100, y: 100 }, T_BASE + 3500); // Finger 1 moves
  tracker.refreshPointer(2, T_BASE + 3500); // Finger 2 heartbeat

  // At T=8500:
  // Finger 1 last active: T=8500 (age 0ms < 3000ms) -> KEEP
  // Finger 2 last active: T=8500 (age 0ms < 3000ms) -> KEEP
  // Finger 3 last active: T=5000 (age 3500ms > 3000ms) -> REAP
  // Finger 4 last active: T=5000 (age 3500ms > 3000ms) -> REAP

  const recovered = tracker.recoverDroppedPointers(state, 3000, T_BASE + 3500);

  assert.equal(recovered, 2, 'Exactly the 2 abandoned pointers (3 and 4) must be reaped');
  assert.equal(tracker.hasPointer(1), true, 'Finger 1 must still be active');
  assert.equal(tracker.hasPointer(2), true, 'Finger 2 must still be active');
  assert.equal(tracker.hasPointer(3), false, 'Finger 3 reaped');
  assert.equal(tracker.hasPointer(4), false, 'Finger 4 reaped');

  // Verify state integrity:
  assert.equal(state.right, true, 'Joystick RIGHT must remain active from Finger 1');
  assert.equal(state.dash, false, 'Dash must be cleared');
  assert.equal(state.ultimate, false, 'Ultimate must be cleared');

  // Clean finish
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);
  tracker.onPointerUp(1, state, fakeScheduler);
  tracker.onPointerUp(2, state, fakeScheduler);
  while (scheduledFrames.length > 0) scheduledFrames.shift()();
  assert.deepEqual(state, createDefaultMobileInputState());
});

test('Stress Section 4.4 [Malformed Watchdog Parameters & Clock Skews]: NaN maxAgeMs, negative elapsed times, and clock jumps', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  tracker.onPointerDown(10, 'bomb', state, undefined, undefined, 10000);

  // 1. NaN maxAgeMs safely defaults to 3000ms
  const recoveredNaN = tracker.recoverDroppedPointers(state, NaN, 10500); // age 500ms < 3000ms
  assert.equal(recoveredNaN, 0, 'Should not prune pointer at age 500ms even with NaN maxAge');

  // 2. Clock skew backwards: currentTime is 8000ms (before pointer down at 10000ms)
  const recoveredSkew = tracker.recoverDroppedPointers(state, 3000, 8000);
  assert.equal(recoveredSkew, 0, 'Negative elapsed time must not cause false reap');
  assert.equal(tracker.hasPointer(10), true);

  // 3. NaN currentTime falls back to performance.now() without throwing
  assert.doesNotThrow(() => tracker.recoverDroppedPointers(state, 3000, NaN));

  // 4. Past threshold at T=13500 (age 3500ms > 3000ms) with NaN maxAgeMs fallback
  const recoveredAfterNaN = tracker.recoverDroppedPointers(state, NaN, 13500);
  assert.equal(recoveredAfterNaN, 1, 'Should prune at age 3500ms using default 3000ms fallback');
  assert.equal(tracker.hasPointer(10), false);
});

/* ==============================================================================
 * SECTION 5: 10,000+ HIGH-FREQUENCY POINTER ID COLLISIONS & ARBITRATION
 * ============================================================================== */

test('Stress Section 5.1 [10,000 Pointer ID Collisions]: Instant reassignment across controls releases previous vectors cleanly', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const targets = ['joystick', 'bomb', 'dash', 'ultimate'];
  const startTime = performance.now();

  let reassignmentCount = 0;

  for (let i = 0; i < 10000; i++) {
    const pointerId = i % 4; // Same 4 pointer IDs constantly re-used across different targets
    const targetA = targets[i % targets.length];
    const targetB = targets[(i + 1) % targets.length];

    // Reset before pair test to ensure targetA is the sole controller
    tracker.reset(state);

    // Assign pointer to targetA
    tracker.onPointerDown(pointerId, targetA, state, { x: 50, y: 50 });
    if (targetA === 'joystick') {
      tracker.onPointerMove(pointerId, { x: 100, y: 50 }, state, { x: 50, y: 50 }); // dx=50 -> RIGHT
      assert.equal(state.right, true);
    }

    // Immediately re-assign same pointerId to targetB WITHOUT pointerup (collision / re-use)
    tracker.onPointerDown(pointerId, targetB, state, { x: 80, y: 80 });
    reassignmentCount++;

    // Invariant: If previous target was joystick, movement vector MUST be cleared immediately
    if (targetA === 'joystick' && targetB !== 'joystick') {
      assert.equal(state.right, false, 'Reassigning pointer away from joystick must instantly clear joystick directions');
      assert.equal(tracker.getActivePointerCount('joystick'), 0);
    }
  }

  tracker.reset(state);
  const elapsed = performance.now() - startTime;

  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState());
  assert.equal(reassignmentCount, 10000);
  assert.ok(elapsed < 500, `10,000 pointer reassignments took ${elapsed.toFixed(2)}ms (budget < 500ms)`);
});

/* ==============================================================================
 * SECTION 6: ZERO-GC OBJECT POOL RECYCLING & RESILIENCE SOAK
 * ============================================================================== */

test('Stress Section 6.1 [20,000 Pool Acquire/Release Cycles]: Zero memory leak and clean recycled records', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);
  const startTime = performance.now();

  for (let iter = 0; iter < 20000; iter++) {
    const ptr = iter % 8;
    tracker.onPointerDown(ptr, 'bomb', state, undefined, fakeScheduler);
    tracker.onPointerUp(ptr, state, fakeScheduler);
    if (scheduledFrames.length > 50) {
      while (scheduledFrames.length > 0) scheduledFrames.shift()();
    }
  }

  while (scheduledFrames.length > 0) scheduledFrames.shift()();
  tracker.reset(state);

  const elapsed = performance.now() - startTime;
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState());
  assert.ok(elapsed < 200, `20,000 acquire/release cycles completed in ${elapsed.toFixed(2)}ms (budget < 200ms)`);
});
