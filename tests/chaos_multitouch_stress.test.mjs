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
 * SUITE 1: 10,000-CYCLE DEADZONE BOUNDARY JITTER AT 5.0PX WITH SUBPIXEL COORDS
 * ============================================================================== */

test('Chaos MultiTouch 1.1 [10,000 Jitter Cycles at 5.0px Deadzone]: Strict thresholding and zero sticky directions', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ deadzone: 5.0 });
  const POINTER_ID = 101;
  const ORIGIN = { x: 300, y: 300 };

  tracker.onPointerDown(POINTER_ID, 'joystick', state, ORIGIN);

  let subDeadzoneCount = 0;
  let supraDeadzoneCount = 0;
  let contradictoryCount = 0;
  let nonBooleanCount = 0;
  const startTime = performance.now();

  for (let cycle = 0; cycle < 10000; cycle++) {
    // Oscillate distance between 4.9999px and 5.0001px with subpixel jitter
    const isBelow = cycle % 2 === 0;
    const jitter = (cycle % 100) * 0.000001; // micro-jitter
    const radius = isBelow ? (4.9999 - jitter) : (5.0001 + jitter);

    // Angle rotates continuously through 360 degrees
    const angleRad = (cycle * 0.037) % (2 * Math.PI);
    const touchX = ORIGIN.x + Math.cos(angleRad) * radius;
    const touchY = ORIGIN.y - Math.sin(angleRad) * radius;

    tracker.onPointerMove(POINTER_ID, { x: touchX, y: touchY }, state, ORIGIN);

    // Type checking
    if (
      typeof state.up !== 'boolean' ||
      typeof state.down !== 'boolean' ||
      typeof state.left !== 'boolean' ||
      typeof state.right !== 'boolean'
    ) {
      nonBooleanCount++;
    }

    // Mutual exclusion check
    if ((state.up && state.down) || (state.left && state.right)) {
      contradictoryCount++;
    }

    const activeCount = Number(state.up) + Number(state.down) + Number(state.left) + Number(state.right);

    if (isBelow) {
      assert.equal(
        activeCount,
        0,
        `Cycle ${cycle}: Sub-deadzone radius ${radius.toFixed(6)}px must yield zero active directions`
      );
      subDeadzoneCount++;
    } else {
      assert.ok(
        activeCount >= 1 && activeCount <= 2,
        `Cycle ${cycle}: Supra-deadzone radius ${radius.toFixed(6)}px must activate 1 or 2 directions`
      );
      supraDeadzoneCount++;
    }
  }

  tracker.onPointerUp(POINTER_ID, state);
  const elapsed = performance.now() - startTime;

  assert.equal(subDeadzoneCount, 5000, 'Exactly 5,000 sub-deadzone evaluations');
  assert.equal(supraDeadzoneCount, 5000, 'Exactly 5,000 supra-deadzone evaluations');
  assert.equal(contradictoryCount, 0, 'Zero contradictory directions');
  assert.equal(nonBooleanCount, 0, 'Zero non-boolean flags');
  assert.deepEqual(state, createDefaultMobileInputState(), 'State cleanly reset on pointerup');
  assert.ok(elapsed < 200, `10,000 deadzone boundary cycles completed in ${elapsed.toFixed(2)}ms (budget < 200ms)`);
});

test('Chaos MultiTouch 1.2 [10,000 Vector Conversions at Exact 5.0px Boundary]: Micro-stepping ±0.00005px verifies IEEE-754 precision', () => {
  const startTime = performance.now();
  let subCount = 0;
  let activeCount = 0;

  for (let i = 0; i < 10000; i++) {
    // Micro-step from 4.99975px to 5.00025px across 10,000 steps
    const delta = (i - 5000) * 0.00000005; // -0.00025 to +0.00025 around 5.0
    const r = 5.0 + delta;
    const angleRad = (i * 0.133) % (2 * Math.PI);
    const dx = Math.cos(angleRad) * r;
    const dy = -Math.sin(angleRad) * r;

    const vec = resolveJoystickVector(dx, dy, 5.0);
    const dirs = Number(vec.up) + Number(vec.down) + Number(vec.left) + Number(vec.right);

    assert.ok(!(vec.up && vec.down), 'No UP+DOWN collision');
    assert.ok(!(vec.left && vec.right), 'No LEFT+RIGHT collision');

    // Float tolerance threshold: r^2 >= 25.0 - 1e-7
    const distSq = dx * dx + dy * dy;
    if (distSq < 25.0 - 1e-7) {
      assert.equal(dirs, 0, `Sub-deadzone at step ${i} (distSq=${distSq}) must have zero active directions`);
      subCount++;
    } else {
      assert.ok(dirs >= 1 && dirs <= 2, `Active zone at step ${i} must have 1 or 2 directions`);
      activeCount++;
    }
  }

  const elapsed = performance.now() - startTime;
  assert.ok(subCount > 0, 'Sub-deadzone samples verified');
  assert.ok(activeCount > 0, 'Active samples verified');
  assert.equal(subCount + activeCount, 10000);
  assert.ok(elapsed < 150, `10,000 micro-stepping vector conversions took ${elapsed.toFixed(2)}ms (budget < 150ms)`);
});

/* ==============================================================================
 * SUITE 2: 10,000-CYCLE SUBPIXEL SECTOR BOUNDARY JITTER ACROSS 8 COMPASS AXES
 * ============================================================================== */

test('Chaos MultiTouch 2.1 [10,000 Boundary Jitter Steps Across 8 Sectors]: Micro-oscillations across 22.5°, 67.5°, 112.5°, etc.', () => {
  const boundaryAngles = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  const startTime = performance.now();
  let zeroContradictions = true;

  for (let i = 0; i < 10000; i++) {
    const baseAngle = boundaryAngles[i % boundaryAngles.length];
    // Jitter by ±0.0001° to ±0.01° around the exact boundary
    const jitterDeg = Math.sin(i * 1.7) * 0.01;
    const angle = baseAngle + jitterDeg;
    const distance = 25.0 + Math.cos(i) * 10; // Well outside deadzone

    const dir = resolveJoystickDirection(angle, distance);
    const activeDirs = Number(dir.up) + Number(dir.down) + Number(dir.left) + Number(dir.right);

    if (activeDirs < 1 || activeDirs > 2 || (dir.up && dir.down) || (dir.left && dir.right)) {
      zeroContradictions = false;
      break;
    }
  }

  const elapsed = performance.now() - startTime;
  assert.equal(zeroContradictions, true, 'Zero contradictions across 10,000 sector boundary jitter steps');
  assert.ok(elapsed < 100, `10,000 sector boundary jitter steps executed in ${elapsed.toFixed(2)}ms (budget < 100ms)`);
});

/* ==============================================================================
 * SUITE 3: RAPID TOUCH START / MOVE / END STATE MACHINE STRESS (RACE CONDITION IMMUNITY)
 * ============================================================================== */

test('Chaos MultiTouch 3.1 [10,000 Rapid Tap Re-press Cycles]: Scheduled release callback never swallows new touch', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);

  const actions = ['bomb', 'dash', 'ultimate'];
  const POINTER_ID = 55;
  const startTime = performance.now();
  let raceConditionCorruptions = 0;

  for (let cycle = 0; cycle < 10000; cycle++) {
    const action = actions[cycle % actions.length];

    // 1. Initial touch start
    tracker.onPointerDown(POINTER_ID, action, state, undefined, fakeScheduler);
    assert.equal(state[action], true, `Cycle ${cycle}: State must be true on pointerDown`);

    // 2. Rapid release: pointer up schedules release callback
    tracker.onPointerUp(POINTER_ID, state, fakeScheduler);

    // 3. RAPID RE-PRESS before scheduler callback runs!
    // A new pointer comes down on the same control immediately
    const NEXT_POINTER = (cycle % 2 === 0) ? POINTER_ID : POINTER_ID + 1;
    tracker.onPointerDown(NEXT_POINTER, action, state, undefined, fakeScheduler);
    assert.equal(state[action], true, `Cycle ${cycle}: Re-press must activate state`);

    // 4. Now execute the scheduled release callback from step 2!
    // Because NEXT_POINTER is active, the scheduled release callback MUST NOT clear state!
    if (scheduledFrames.length > 0) {
      const cb = scheduledFrames.shift();
      cb();
    }

    if (state[action] !== true) {
      raceConditionCorruptions++;
    }

    // 5. Release NEXT_POINTER cleanly
    tracker.onPointerUp(NEXT_POINTER, state, fakeScheduler);
    while (scheduledFrames.length > 0) {
      const cb = scheduledFrames.shift();
      cb();
    }
    assert.equal(state[action], false, `Cycle ${cycle}: After all pointers release, state must be false`);
  }

  const elapsed = performance.now() - startTime;
  assert.equal(raceConditionCorruptions, 0, 'Zero race conditions: active re-press was never swallowed');
  assert.deepEqual(state, createDefaultMobileInputState());
  assert.ok(elapsed < 200, `10,000 rapid tap re-press cycles completed in ${elapsed.toFixed(2)}ms (budget < 200ms)`);
});

test('Chaos MultiTouch 3.2 [10,000 Multi-Finger Button Stacking Cycles]: Button remains held until the LAST finger lifts', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);

  const actions = ['bomb', 'dash', 'ultimate'];
  const startTime = performance.now();
  let prematureReleaseCount = 0;

  for (let iter = 0; iter < 10000; iter++) {
    const action = actions[iter % actions.length];
    const fingerA = 10;
    const fingerB = 20;

    // Finger A presses button
    tracker.onPointerDown(fingerA, action, state, undefined, fakeScheduler);
    // Finger B also presses the same button
    tracker.onPointerDown(fingerB, action, state, undefined, fakeScheduler);

    assert.equal(state[action], true);

    // Finger A releases
    tracker.onPointerUp(fingerA, state, fakeScheduler);

    // Drain scheduled frames
    while (scheduledFrames.length > 0) {
      scheduledFrames.shift()();
    }

    // INVARIANT: Finger B is STILL touching the button, so state must remain true!
    if (state[action] !== true) {
      prematureReleaseCount++;
    }

    // Finger B releases
    tracker.onPointerUp(fingerB, state, fakeScheduler);
    while (scheduledFrames.length > 0) {
      scheduledFrames.shift()();
    }

    assert.equal(state[action], false);
  }

  const elapsed = performance.now() - startTime;
  assert.equal(prematureReleaseCount, 0, 'Zero premature button releases while a finger was still holding');
  assert.deepEqual(state, createDefaultMobileInputState());
  assert.ok(elapsed < 200, `10,000 multi-finger stacking cycles completed in ${elapsed.toFixed(2)}ms (budget < 200ms)`);
});

test('Chaos MultiTouch 3.3 [10,000 Multi-Finger Joystick Handoff Cycles]: Releasing primary thumb falls back to secondary thumb cleanly', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ deadzone: 5.0 });
  const ORIGIN = { x: 200, y: 200 };
  const startTime = performance.now();

  let stuckDirectionErrors = 0;

  for (let iter = 0; iter < 10000; iter++) {
    const thumbA = 1;
    const thumbB = 2;

    // Thumb A starts at center and moves RIGHT (dx = +30)
    tracker.onPointerDown(thumbA, 'joystick', state, ORIGIN);
    tracker.onPointerMove(thumbA, { x: 230, y: 200 }, state, ORIGIN);
    assert.equal(state.right, true);

    // Thumb B touches joystick at center (dx = 0, dy = 0)
    tracker.onPointerDown(thumbB, 'joystick', state, ORIGIN);
    tracker.onPointerMove(thumbB, { x: 200, y: 200 }, state, ORIGIN); // Center / deadzone

    // Thumb A lifts!
    // The tracker must fallback to Thumb B, which is at center (sub-deadzone), so RIGHT must clear!
    tracker.onPointerUp(thumbA, state);

    if (state.right !== false || state.up !== false || state.down !== false || state.left !== false) {
      stuckDirectionErrors++;
    }

    // Now Thumb B moves UP (dy = -30)
    tracker.onPointerMove(thumbB, { x: 200, y: 170 }, state, ORIGIN);
    assert.equal(state.up, true);

    // Thumb B lifts
    tracker.onPointerUp(thumbB, state);
    assert.deepEqual(state, createDefaultMobileInputState());
  }

  const elapsed = performance.now() - startTime;
  assert.equal(stuckDirectionErrors, 0, 'Zero stuck directions during multi-finger joystick handoffs');
  assert.ok(elapsed < 200, `10,000 joystick handoff cycles completed in ${elapsed.toFixed(2)}ms (budget < 200ms)`);
});

/* ==============================================================================
 * SUITE 4: 10,000 CYCLES OF CONCURRENT MULTI-TOUCH JOYSTICK DRAG & BUTTON SPAM
 * ============================================================================== */

test('Chaos MultiTouch 4.1 [10,000 Concurrent 5-Finger Combat Cycles]: Joystick drag with 5.0px boundary jitter while spamming all buttons', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 15, deadzone: 5.0 });
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);

  const JOYSTICK_PTR = 0;
  const BOMB_PTR = 1;
  const DASH_PTR = 2;
  const ULT_PTR = 3;
  const JOY_ORIGIN = { x: 150, y: 350 };

  const startTime = performance.now();
  let contradictoryCount = 0;
  let nonBooleanCount = 0;
  let simulatedTime = 1000;

  // Start continuous joystick drag
  tracker.onPointerDown(JOYSTICK_PTR, 'joystick', state, JOY_ORIGIN, fakeScheduler, simulatedTime);

  for (let cycle = 0; cycle < 10000; cycle++) {
    simulatedTime += 5; // 200Hz sampling

    // 1. Move joystick with subpixel coordinates and deadzone boundary jitter
    // Oscillate between 4.9px (deadzone) and 35px (active)
    const isDeadzone = (cycle % 7 === 0);
    const radius = isDeadzone ? 4.9999 : (15 + 15 * Math.sin(cycle * 0.05));
    const angleRad = (cycle * 0.08) % (2 * Math.PI);
    const jx = JOY_ORIGIN.x + Math.cos(angleRad) * radius;
    const jy = JOY_ORIGIN.y - Math.sin(angleRad) * radius;

    tracker.onPointerMove(JOYSTICK_PTR, { x: jx, y: jy }, state, JOY_ORIGIN, simulatedTime);

    // 2. High-frequency button spam: Bomb, Dash, Ultimate alternating down/up
    const buttonOp = cycle % 6;
    if (buttonOp === 0) {
      tracker.onPointerDown(BOMB_PTR, 'bomb', state, undefined, fakeScheduler, simulatedTime);
    } else if (buttonOp === 1) {
      tracker.onPointerUp(BOMB_PTR, state, fakeScheduler);
    } else if (buttonOp === 2) {
      tracker.onPointerDown(DASH_PTR, 'dash', state, undefined, fakeScheduler, simulatedTime);
    } else if (buttonOp === 3) {
      tracker.onPointerUp(DASH_PTR, state, fakeScheduler);
    } else if (buttonOp === 4) {
      tracker.onPointerDown(ULT_PTR, 'ultimate', state, undefined, fakeScheduler, simulatedTime);
    } else if (buttonOp === 5) {
      tracker.onPointerUp(ULT_PTR, state, fakeScheduler);
    }

    // 3. Flush scheduled frames periodically (e.g. 60 FPS frame ticks)
    if (scheduledFrames.length > 10) {
      const batch = scheduledFrames.splice(0, scheduledFrames.length);
      for (const cb of batch) cb();
    }

    // 4. Invariant verifications
    if (
      typeof state.up !== 'boolean' ||
      typeof state.down !== 'boolean' ||
      typeof state.left !== 'boolean' ||
      typeof state.right !== 'boolean' ||
      typeof state.bomb !== 'boolean' ||
      typeof state.dash !== 'boolean' ||
      typeof state.ultimate !== 'boolean'
    ) {
      nonBooleanCount++;
    }

    if ((state.up && state.down) || (state.left && state.right)) {
      contradictoryCount++;
    }

    if (isDeadzone) {
      assert.equal(state.up, false, 'Joystick must be inactive in deadzone');
      assert.equal(state.down, false);
      assert.equal(state.left, false);
      assert.equal(state.right, false);
    }
  }

  // Cleanup all pointers
  tracker.cancelAllPointers(state);
  while (scheduledFrames.length > 0) scheduledFrames.shift()();

  const elapsed = performance.now() - startTime;
  assert.equal(contradictoryCount, 0, 'Zero contradictory directions during 10,000 multi-touch combat cycles');
  assert.equal(nonBooleanCount, 0, 'Zero non-boolean flags');
  assert.equal(tracker.getActivePointerCount(), 0, 'All pointers cleanly released');
  assert.deepEqual(state, createDefaultMobileInputState(), 'State cleanly zeroed');
  assert.ok(elapsed < 250, `10,000 concurrent combat cycles executed in ${elapsed.toFixed(2)}ms (budget < 250ms)`);
});

/* ==============================================================================
 * SUITE 5: 10,000 CYCLES OF CHAOTIC LIFECYCLE INTERLEAVING & POINTER REASSIGNMENTS
 * ============================================================================== */

test('Chaos MultiTouch 5.1 [10,000 Chaotic Lifecycle Interleavings]: Hardware noise, out-of-order events, and instant reassignments', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 10, deadzone: 5.0 });
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);
  const targets = ['joystick', 'bomb', 'dash', 'ultimate'];
  const startTime = performance.now();
  let simulatedTime = 5000;

  for (let i = 0; i < 10000; i++) {
    simulatedTime += 2;
    const ptr = i % 8; // 8 distinct finger IDs
    const target = targets[(i * 3) % targets.length];
    const eventType = i % 7;

    switch (eventType) {
      case 0: // onPointerDown
        tracker.onPointerDown(
          ptr,
          target,
          state,
          { x: 100 + (i % 50), y: 100 + (i % 50) },
          fakeScheduler,
          simulatedTime
        );
        break;

      case 1: // onPointerMove with subpixel coordinates
        tracker.onPointerMove(
          ptr,
          { x: 100 + (Math.cos(i) * 20), y: 100 - (Math.sin(i) * 20) },
          state,
          { x: 100, y: 100 },
          simulatedTime
        );
        break;

      case 2: // onPointerUp
        tracker.onPointerUp(ptr, state, fakeScheduler);
        break;

      case 3: // onPointerCancel (OS interrupt / gesture bar trigger)
        tracker.onPointerCancel(ptr, state);
        break;

      case 4: // Pointer Reassignment: jump same pointerId directly to another target
        {
          const otherTarget = targets[(i + 1) % targets.length];
          tracker.onPointerDown(ptr, otherTarget, state, { x: 120, y: 120 }, fakeScheduler, simulatedTime);
        }
        break;

      case 5: // Periodic watchdog drop recovery
        if (i % 100 === 0) {
          tracker.recoverDroppedPointers(state, 500, simulatedTime);
        }
        break;

      case 6: // Periodic system blur/modal cancel
        if (i % 500 === 0) {
          tracker.cancelAllPointers(state);
        }
        break;
    }

    // Flush frames periodically
    if (scheduledFrames.length > 20) {
      const batch = scheduledFrames.splice(0, scheduledFrames.length);
      for (const cb of batch) cb();
    }

    // Continuous Invariants
    assert.ok(!(state.up && state.down), `Cycle ${i}: UP and DOWN cannot be simultaneously true`);
    assert.ok(!(state.left && state.right), `Cycle ${i}: LEFT and RIGHT cannot be simultaneously true`);
  }

  // Final reset
  tracker.cancelAllPointers(state);
  while (scheduledFrames.length > 0) scheduledFrames.shift()();

  const elapsed = performance.now() - startTime;
  assert.equal(tracker.getActivePointerCount(), 0, 'No active pointers remain');
  assert.deepEqual(state, createDefaultMobileInputState(), 'State cleanly zeroed after chaos soak');
  assert.ok(elapsed < 250, `10,000 chaotic lifecycle interleavings completed in ${elapsed.toFixed(2)}ms (budget < 250ms)`);
});
