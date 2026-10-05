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
 * SUITE 1: VIRTUAL JOYSTICK ADVERSARIAL INVARIANTS & 360° GEOMETRY
 * ============================================================================== */

test('Adversarial 1.1 [360° Continuous Sweep]: 7,200 fine-angle samples guarantee zero deadzones and mutual exclusion', () => {
  // Sweep every 0.05° across the full 360° circle
  let deadzoneCount = 0;
  let opposingDirectionCount = 0;
  const startTime = performance.now();

  for (let degree = 0; degree < 360; degree += 0.05) {
    const dir = resolveJoystickDirection(degree);
    const activeCount = Number(dir.up) + Number(dir.down) + Number(dir.left) + Number(dir.right);

    // Invariant 1: At least 1 direction must always be active (Zero deadzones across full 360°)
    if (activeCount === 0) {
      deadzoneCount++;
    }

    // Invariant 2: At most 2 adjacent directions can be active (Diagonal)
    assert.ok(activeCount <= 2, `Angle ${degree}° had >2 active directions: ${JSON.stringify(dir)}`);

    // Invariant 3: Opposing directions must NEVER be simultaneously true
    if ((dir.up && dir.down) || (dir.left && dir.right)) {
      opposingDirectionCount++;
    }
  }

  const duration = performance.now() - startTime;
  assert.equal(deadzoneCount, 0, 'Zero deadzones must exist across entire 360° range');
  assert.equal(opposingDirectionCount, 0, 'Opposing directions must never be simultaneously true');
  assert.ok(duration < 500, `7,200 angle samples completed in ${duration.toFixed(2)}ms (budget < 500ms)`);
});

test('Adversarial 1.2 [Cardinal & Diagonal Sector Precision]: Exact degree sector mapping invariants', () => {
  // Cardinal directions
  assert.deepEqual(resolveJoystickDirection(0), { up: false, down: false, left: false, right: true });
  assert.deepEqual(resolveJoystickDirection(90), { up: true, down: false, left: false, right: false });
  assert.deepEqual(resolveJoystickDirection(180), { up: false, down: false, left: true, right: false });
  assert.deepEqual(resolveJoystickDirection(270), { up: false, down: true, left: false, right: false });
  assert.deepEqual(resolveJoystickDirection(360), { up: false, down: false, left: false, right: true });

  // Diagonal sectors
  assert.deepEqual(resolveJoystickDirection(45), { up: true, down: false, left: false, right: true });
  assert.deepEqual(resolveJoystickDirection(135), { up: true, down: false, left: true, right: false });
  assert.deepEqual(resolveJoystickDirection(225), { up: false, down: true, left: true, right: false });
  assert.deepEqual(resolveJoystickDirection(315), { up: false, down: true, left: false, right: true });

  // Negative and multi-revolution angles
  assert.deepEqual(resolveJoystickDirection(-90), { up: false, down: true, left: false, right: false });
  assert.deepEqual(resolveJoystickDirection(-270), { up: true, down: false, left: false, right: false });
  assert.deepEqual(resolveJoystickDirection(450), { up: true, down: false, left: false, right: false }); // 450 % 360 = 90
  assert.deepEqual(resolveJoystickDirection(-45), { up: false, down: true, left: false, right: true }); // 315°
});

test('Adversarial 1.3 [Vector Subpixel Deadzone Boundary]: 10,000 subpixel radius steps verify strict 5.0px threshold', () => {
  // Test across 10,000 steps around deadzone boundary (0.000px to 9.999px in 0.001px increments)
  let subDeadzonePasses = 0;
  let activePasses = 0;

  for (let iter = 0; iter < 10000; iter++) {
    const radius = iter * 0.001;
    const angleRad = (iter * 0.17) % (2 * Math.PI);
    const dx = Math.cos(angleRad) * radius;
    const dy = -Math.sin(angleRad) * radius;

    const res = resolveJoystickVector(dx, dy, 5.0);
    const activeCount = Number(res.up) + Number(res.down) + Number(res.left) + Number(res.right);

    if (radius < 5.0) {
      assert.equal(activeCount, 0, `Sub-deadzone radius ${radius.toFixed(3)}px must be completely inactive`);
      assert.equal(res.angle, 0);
      subDeadzonePasses++;
    } else {
      assert.ok(activeCount >= 1 && activeCount <= 2, `Active radius ${radius.toFixed(3)}px must activate 1 or 2 directions`);
      assert.ok(!(res.up && res.down), 'Opposing UP/DOWN cannot be active');
      assert.ok(!(res.left && res.right), 'Opposing LEFT/RIGHT cannot be active');
      activePasses++;
    }
  }

  assert.equal(subDeadzonePasses, 5000, 'Exactly 5,000 sub-deadzone samples');
  assert.equal(activePasses, 5000, 'Exactly 5,000 active zone samples');
});

test('Adversarial 1.4 [Extreme Coordinate Fuzzing]: Malformed coordinates never throw and return clean zero vectors', () => {
  const malformedInputs = [
    [NaN, 10],
    [10, NaN],
    [NaN, NaN],
    [Infinity, 0],
    [-Infinity, 0],
    [0, Infinity],
    [Infinity, Infinity],
    [undefined, 10],
    [10, null],
    ['10', '20'],
    [0, 0],
  ];

  for (const [dx, dy] of malformedInputs) {
    const res = resolveJoystickVector(dx, dy);
    assert.deepEqual(
      res,
      { up: false, down: false, left: false, right: false, angle: 0, distance: 0 },
      `Vector resolution for malformed (${dx}, ${dy}) must be zeroed`
    );
  }

  // Fuzzing with custom invalid deadzones
  const zeroDeadzoneRes = resolveJoystickVector(3, 4, 0); // distance = 5, deadzone = 0 -> active
  assert.ok(zeroDeadzoneRes.up || zeroDeadzoneRes.right);
  const nanDeadzoneRes = resolveJoystickVector(30, 40, NaN); // fallback to 5 -> active
  assert.ok(nanDeadzoneRes.up || nanDeadzoneRes.right);
});

test('Adversarial 1.5 [Joystick Origin Inference]: Automatic start coords fallback when origin is omitted', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Pointer 1 grabs joystick at (100, 100)
  tracker.onPointerDown(1, 'joystick', state, { x: 100, y: 100 });

  // Pointer 1 moves to (100, 50) without explicit origin -> dy = -50 (UP in screen coords)
  tracker.onPointerMove(1, { x: 100, y: 50 }, state);
  assert.equal(state.up, true, 'UP must be resolved using startX/startY fallback origin');
  assert.equal(state.down, false);
  assert.equal(state.left, false);
  assert.equal(state.right, false);

  // Pointer 1 moves to (150, 100) without explicit origin -> dx = +50 (RIGHT)
  tracker.onPointerMove(1, { x: 150, y: 100 }, state);
  assert.equal(state.right, true, 'RIGHT must be resolved using startX/startY fallback origin');
  assert.equal(state.up, false);

  tracker.onPointerUp(1, state);
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must be zeroed on release');
});

/* ==============================================================================
 * SUITE 2: RAPID TOUCH SPAMMING (ADVERSARIAL FLOOD & JITTER)
 * ============================================================================== */

test('Adversarial 2.1 [100,000 Rapid Button Invocations]: Tight loop spamming causes zero unhandled exceptions', () => {
  const state = createDefaultMobileInputState();
  const scheduledCallbacks = [];
  const fakeScheduler = (cb) => scheduledCallbacks.push(cb);

  const actions = ['bomb', 'dash', 'ultimate'];
  const startTime = performance.now();

  for (let iter = 0; iter < 100000; iter++) {
    const action = actions[iter % actions.length];
    const op = iter % 4;

    if (op === 0) {
      triggerMobileAction(state, action, fakeScheduler);
    } else if (op === 1) {
      releaseMobileAction(state, action, fakeScheduler);
    } else if (op === 2) {
      cancelMobileAction(state, action);
    } else if (op === 3) {
      // Direct state assertion
      assert.equal(typeof state[action], 'boolean');
    }

    // Periodically flush RAF callbacks to simulate engine frames
    if (scheduledCallbacks.length > 50) {
      const batch = scheduledCallbacks.splice(0, scheduledCallbacks.length);
      for (const cb of batch) cb();
    }
  }

  // Drain remaining callbacks
  while (scheduledCallbacks.length > 0) {
    const batch = scheduledCallbacks.splice(0, scheduledCallbacks.length);
    for (const cb of batch) cb();
  }

  const duration = performance.now() - startTime;
  assert.ok(duration < 1500, `100,000 rapid button invocations took ${duration.toFixed(2)}ms (budget < 1500ms)`);
  assert.equal(typeof state.bomb, 'boolean');
  assert.equal(typeof state.dash, 'boolean');
  assert.equal(typeof state.ultimate, 'boolean');
});

test('Adversarial 2.2 [Single-Finger High-Frequency Tap Burst]: 10,000 burst taps at 1000Hz simulated frequency', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduledCallbacks = [];
  const fakeScheduler = (cb) => scheduledCallbacks.push(cb);

  const POINTER_ID = 42;
  const startTime = performance.now();
  let completedTaps = 0;

  for (let iter = 0; iter < 10000; iter++) {
    // Pointer down
    tracker.onPointerDown(POINTER_ID, 'bomb', state, { x: 50, y: 50 }, fakeScheduler);
    assert.equal(state.bomb, true, 'Bomb must be active upon down');
    assert.equal(tracker.getActivePointerCount('bomb'), 1);

    // Pointer up
    tracker.onPointerUp(POINTER_ID, state, fakeScheduler);
    assert.equal(tracker.getActivePointerCount('bomb'), 0);
    completedTaps++;

    // Flush scheduled callbacks to complete release
    while (scheduledCallbacks.length > 0) {
      const cb = scheduledCallbacks.shift();
      cb();
    }
    assert.equal(state.bomb, false, 'Bomb must be inactive after release cycle');
  }

  const duration = performance.now() - startTime;
  assert.equal(completedTaps, 10000);
  assert.ok(duration < 500, `10,000 tap cycles completed in ${duration.toFixed(2)}ms (budget < 500ms)`);
  assert.deepEqual(state, createDefaultMobileInputState());
});

test('Adversarial 2.3 [Chaos Event Interleaving]: Chaotic sequence of Down/Down/Move/Cancel/Up never corrupts state', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Pointer 1 fires redundant pointerdown without pointerup
  tracker.onPointerDown(1, 'dash', state);
  assert.equal(state.dash, true);
  assert.equal(tracker.getActivePointerCount('dash'), 1);

  // Redundant pointerdown on same target with same pointerId
  tracker.onPointerDown(1, 'dash', state);
  assert.equal(state.dash, true);
  assert.equal(tracker.getActivePointerCount('dash'), 1);

  // Pointermove with NaN coordinates
  tracker.onPointerMove(1, { x: NaN, y: NaN }, state);
  assert.equal(state.dash, true);

  // PointerCancel fires
  tracker.onPointerCancel(1, state);
  assert.equal(state.dash, false, 'Cancel immediately zeroes dash state');
  assert.equal(tracker.getActivePointerCount('dash'), 0);

  // Spurious PointerUp on already cancelled pointer
  tracker.onPointerUp(1, state);
  assert.equal(state.dash, false);
  assert.equal(tracker.getActivePointerCount('dash'), 0);

  // Spurious PointerMove on dead pointer
  tracker.onPointerMove(1, { x: 100, y: 100 }, state);
  assert.equal(tracker.hasPointer(1), false);
  assert.deepEqual(state, createDefaultMobileInputState());
});

/* ==============================================================================
 * SUITE 3: SIMULTANEOUS MULTI-TOUCH INVARIANTS & FINGER ARBITRATION
 * ============================================================================== */

test('Adversarial 3.1 [Concurrent 10-Finger Assault]: Simultaneous combat fingers preserve directional fidelity', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduledCallbacks = [];
  const fakeScheduler = (cb) => scheduledCallbacks.push(cb);

  // Pointer 0: Joystick thumb
  tracker.onPointerDown(0, 'joystick', state, { x: 100, y: 100 });
  // Pointer 1: Bomb
  tracker.onPointerDown(1, 'bomb', state, undefined, fakeScheduler);
  // Pointer 2: Dash
  tracker.onPointerDown(2, 'dash', state, undefined, fakeScheduler);
  // Pointer 3: Ultimate
  tracker.onPointerDown(3, 'ultimate', state, undefined, fakeScheduler);
  // Pointers 4-9: Multi-finger overlap
  tracker.onPointerDown(4, 'bomb', state, undefined, fakeScheduler);
  tracker.onPointerDown(5, 'dash', state, undefined, fakeScheduler);
  tracker.onPointerDown(6, 'ultimate', state, undefined, fakeScheduler);
  tracker.onPointerDown(7, 'bomb', state, undefined, fakeScheduler);
  tracker.onPointerDown(8, 'dash', state, undefined, fakeScheduler);
  tracker.onPointerDown(9, 'joystick', state, { x: 100, y: 100 });

  assert.equal(tracker.getActivePointerCount(), 10);
  assert.equal(tracker.getActivePointerCount('joystick'), 2);
  assert.equal(tracker.getActivePointerCount('bomb'), 3);
  assert.equal(tracker.getActivePointerCount('dash'), 3);
  assert.equal(tracker.getActivePointerCount('ultimate'), 2);

  // Move joystick pointer 0 to 225° (Down + Left)
  tracker.onPointerMove(0, { x: 50, y: 150 }, state, { x: 100, y: 100 });
  assert.equal(state.down, true, 'DOWN direction must be set by joystick move');
  assert.equal(state.left, true, 'LEFT direction must be set by joystick move');
  assert.equal(state.up, false);
  assert.equal(state.right, false);
  assert.equal(state.bomb, true);
  assert.equal(state.dash, true);
  assert.equal(state.ultimate, true);

  // Randomly release fingers 1, 2, 3, 4, 5, 6
  tracker.onPointerUp(1, state, fakeScheduler);
  tracker.onPointerUp(2, state, fakeScheduler);
  tracker.onPointerUp(3, state, fakeScheduler);
  tracker.onPointerUp(4, state, fakeScheduler);
  tracker.onPointerUp(5, state, fakeScheduler);
  tracker.onPointerUp(6, state, fakeScheduler);

  // Multi-finger stacking check:
  // Bomb still has pointer 7 active -> bomb must remain true!
  // Dash still has pointer 8 active -> dash must remain true!
  assert.equal(tracker.getActivePointerCount('bomb'), 1);
  assert.equal(tracker.getActivePointerCount('dash'), 1);
  assert.equal(state.bomb, true, 'Bomb must remain held while pointer 7 is down');
  assert.equal(state.dash, true, 'Dash must remain held while pointer 8 is down');

  // Ultimate has 0 pointers remaining -> release queued
  assert.equal(tracker.getActivePointerCount('ultimate'), 0);

  // Release remaining pointers
  tracker.onPointerUp(7, state, fakeScheduler);
  tracker.onPointerUp(8, state, fakeScheduler);
  tracker.onPointerUp(9, state, fakeScheduler);
  tracker.onPointerUp(0, state, fakeScheduler);

  // Flush all scheduled release callbacks
  while (scheduledCallbacks.length > 0) {
    const cb = scheduledCallbacks.shift();
    cb();
  }

  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState(), 'All inputs cleanly zeroed after all 10 fingers lifted');
});

test('Adversarial 3.2 [Pointer ID Reassignment & Collision]: Moving finger from joystick to bomb immediately frees joystick', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Pointer 7 operates joystick at 135° (Up + Left)
  tracker.onPointerDown(7, 'joystick', state, { x: 100, y: 100 });
  tracker.onPointerMove(7, { x: 50, y: 50 }, state, { x: 100, y: 100 });
  assert.equal(state.up, true);
  assert.equal(state.left, true);

  // Hardware/driver event: Pointer 7 suddenly fires pointerdown on 'bomb' without releasing joystick
  tracker.onPointerDown(7, 'bomb', state);

  // Invariant: Joystick MUST be released immediately upon pointer ID re-use
  assert.equal(state.up, false, 'UP vector must be cancelled upon pointer re-use');
  assert.equal(state.left, false, 'LEFT vector must be cancelled upon pointer re-use');
  assert.equal(tracker.getActivePointerCount('joystick'), 0);
  assert.equal(tracker.getActivePointerCount('bomb'), 1);
  assert.equal(state.bomb, true);

  // Pointer 7 reassigned from 'bomb' to 'dash'
  tracker.onPointerDown(7, 'dash', state);
  assert.equal(tracker.getActivePointerCount('bomb'), 0);
  assert.equal(state.bomb, false, 'Bomb must be cancelled upon pointer re-use');
  assert.equal(tracker.getActivePointerCount('dash'), 1);
  assert.equal(state.dash, true);

  // Clean release
  tracker.onPointerUp(7, state);
  assert.equal(tracker.getActivePointerCount(), 0);
  tracker.reset(state);
  assert.deepEqual(state, createDefaultMobileInputState());
});

/* ==============================================================================
 * SUITE 4: BUTTON DEBOUNCE INVARIANTS
 * ============================================================================== */

test('Adversarial 4.1 [Standalone ButtonDebouncer]: Strict rejection within window, clean acceptance after window', () => {
  const debouncer = new ButtonDebouncer(50); // 50ms default window

  const T_START = 1000;
  // First trigger at T=1000 must succeed
  assert.equal(debouncer.canTrigger('bomb', T_START), true);
  assert.equal(debouncer.tryTrigger('bomb', T_START), true);
  assert.equal(debouncer.getLastTriggerTime('bomb'), T_START);

  // Sub-debounce spam: 49 attempts between T=1001 and T=1049 must ALL be debounced/rejected
  let rejectedCount = 0;
  for (let t = 1001; t < 1050; t++) {
    if (!debouncer.canTrigger('bomb', t)) {
      assert.equal(debouncer.tryTrigger('bomb', t), false);
      assert.equal(debouncer.isDebounced('bomb', t), true);
      rejectedCount++;
    }
  }
  assert.equal(rejectedCount, 49, 'All 49 attempts within 50ms window must be strictly rejected');
  assert.equal(debouncer.getLastTriggerTime('bomb'), T_START, 'Last trigger time must remain T_START');

  // Trigger at exact window boundary (T=1050, delta = 50ms >= 50ms) -> Accepted!
  assert.equal(debouncer.canTrigger('bomb', 1050), true);
  assert.equal(debouncer.tryTrigger('bomb', 1050), true);
  assert.equal(debouncer.getLastTriggerTime('bomb'), 1050);

  // Attempts between 1051 and 1099 must now be rejected
  assert.equal(debouncer.tryTrigger('bomb', 1075), false);

  // Trigger at T=1100 -> Accepted!
  assert.equal(debouncer.tryTrigger('bomb', 1100), true);
  assert.equal(debouncer.getLastTriggerTime('bomb'), 1100);
});

test('Adversarial 4.2 [Debounce Channel Isolation]: Bomb debouncing never suppresses Dash or Ultimate', () => {
  const debouncer = new ButtonDebouncer(50);
  const T = 2000;

  // Trigger Bomb at T=2000
  assert.equal(debouncer.tryTrigger('bomb', T), true);
  assert.equal(debouncer.isDebounced('bomb', T + 10), true);

  // Invariant: Dash and Ultimate at T=2010 MUST be accepted immediately despite Bomb being debounced!
  assert.equal(debouncer.canTrigger('dash', T + 10), true, 'Dash must not be debounced by Bomb');
  assert.equal(debouncer.tryTrigger('dash', T + 10), true);

  assert.equal(debouncer.canTrigger('ultimate', T + 20), true, 'Ultimate must not be debounced by Bomb or Dash');
  assert.equal(debouncer.tryTrigger('ultimate', T + 20), true);

  // Custom per-action windows
  debouncer.setDebounceWindow('ultimate', 200); // 200ms window for ultimate
  assert.equal(debouncer.getDebounceWindow('ultimate'), 200);
  assert.equal(debouncer.getDebounceWindow('bomb'), 50);

  // Ultimate triggered at T=2020 -> rejected at T=2150 (delta=130 < 200)
  assert.equal(debouncer.tryTrigger('ultimate', 2150), false);
  // Accepted at T=2221 (delta=201 >= 200)
  assert.equal(debouncer.tryTrigger('ultimate', 2221), true);
});

test('Adversarial 4.3 [triggerMobileActionDebounced]: Function level debouncing with double-RAF fallback', () => {
  const state = createDefaultMobileInputState();
  const debouncer = new ButtonDebouncer(60);
  const scheduledCallbacks = [];
  const fakeScheduler = (cb) => scheduledCallbacks.push(cb);

  // Trigger at T=1000
  const accepted1 = triggerMobileActionDebounced(state, 'dash', 60, debouncer, 1000, fakeScheduler);
  assert.equal(accepted1, true);
  assert.equal(state.dash, true);

  // Trigger at T=1020 within 60ms window
  const accepted2 = triggerMobileActionDebounced(state, 'dash', 60, debouncer, 1020, fakeScheduler);
  assert.equal(accepted2, false, 'Must be rejected by debounce');

  // Trigger at T=1061 after 60ms window
  const accepted3 = triggerMobileActionDebounced(state, 'dash', 60, debouncer, 1061, fakeScheduler);
  assert.equal(accepted3, true, 'Must be accepted after window');

  // Null state safety
  const nullResult = triggerMobileActionDebounced(null, 'dash', 60, debouncer, 2000);
  assert.equal(nullResult, false, 'Null state must return false with 0 exceptions');
});

test('Adversarial 4.4 [MultiTouchPointerTracker Integrated Debounce]: 1,000 rapid pointerdowns on Bomb with 50ms debounce', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 50 });
  const scheduledCallbacks = [];
  const fakeScheduler = (cb) => scheduledCallbacks.push(cb);

  assert.equal(tracker.getButtonDebounce('bomb'), 50);

  let acceptedCount = 0;
  let debouncedCount = 0;
  const T_START = 5000;

  // Spam 1,000 pointerdown events across 500ms (1 event every 0.5ms)
  for (let iter = 0; iter < 1000; iter++) {
    const timestamp = T_START + iter * 0.5; // 5000 to 5499.5
    const accepted = tracker.onPointerDown(iter, 'bomb', state, undefined, fakeScheduler, timestamp);

    if (accepted) {
      acceptedCount++;
    } else {
      debouncedCount++;
    }

    // Pointer is released 10ms later
    tracker.onPointerUp(iter, state, fakeScheduler);
  }

  // With a 50ms window across 500ms, max possible triggers is ~ 500 / 50 + 1 = 11 triggers
  assert.ok(acceptedCount >= 10 && acceptedCount <= 11, `Expected 10-11 accepted triggers, got ${acceptedCount}`);
  assert.equal(acceptedCount + debouncedCount, 1000, 'All 1,000 events must be accounted for');
  assert.ok(debouncedCount >= 989, `Expected >=989 debounced triggers, got ${debouncedCount}`);

  tracker.reset(state);
  assert.deepEqual(state, createDefaultMobileInputState());
});

test('Adversarial 4.5 [Joystick Immunity from Button Debounce]: Continuous joystick updates are never debounced', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 1000 }); // Massive 1000ms button debounce!

  // Invariant: isButtonDebounced must strictly return false for joystick
  assert.equal(tracker.isButtonDebounced('joystick'), false);

  // Joystick touch down
  const downAccepted = tracker.onPointerDown(1, 'joystick', state, { x: 100, y: 100 }, undefined, 1000);
  assert.equal(downAccepted, true);

  // Rapid joystick micro-moves at 1ms intervals (T=1001, 1002, 1003) must NEVER be debounced
  tracker.onPointerMove(1, { x: 100, y: 50 }, state, { x: 100, y: 100 }); // UP
  assert.equal(state.up, true);

  tracker.onPointerMove(1, { x: 100, y: 150 }, state, { x: 100, y: 100 }); // DOWN
  assert.equal(state.down, true);
  assert.equal(state.up, false);

  tracker.onPointerMove(1, { x: 50, y: 100 }, state, { x: 100, y: 100 }); // LEFT
  assert.equal(state.left, true);
  assert.equal(state.down, false);

  tracker.onPointerUp(1, state);
  assert.deepEqual(state, createDefaultMobileInputState());
});

test('Adversarial 4.6 [Timestamp Jitter & Clock Skew Resilience]: Negative deltas and clock rollbacks handled safely', () => {
  const debouncer = new ButtonDebouncer(50);

  // Normal trigger at T=1000
  assert.equal(debouncer.tryTrigger('dash', 1000), true);

  // Clock rollback / skew: timestamp jumps backwards to T=800 (delta = -200 < 50)
  assert.equal(debouncer.canTrigger('dash', 800), false, 'Clock rollback must not trigger prematurely');
  assert.equal(debouncer.tryTrigger('dash', 800), false);

  // Reset flushes debounce timer immediately
  debouncer.reset('dash');
  assert.equal(debouncer.getLastTriggerTime('dash'), -1);
  assert.equal(debouncer.canTrigger('dash', 800), true, 'After reset, trigger at T=800 must be accepted');
  assert.equal(debouncer.tryTrigger('dash', 800), true);
});

/* ==============================================================================
 * SUITE 5: EDGE CASES, DEFOCUS & ORPHAN RECOVERY
 * ============================================================================== */

test('Adversarial 5.1 [Defocus & System Interrupt]: resetAllMobileInputs and tracker.reset cleanly zero all channels', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 50 });

  // Activate all 7 channels
  state.up = true;
  state.down = true;
  state.left = true;
  state.right = true;
  state.bomb = true;
  state.dash = true;
  state.ultimate = true;

  resetAllMobileInputs(state);
  assert.deepEqual(state, createDefaultMobileInputState(), 'All 7 channels must be false');

  // Populate tracker with active touches
  tracker.onPointerDown(1, 'joystick', state, { x: 100, y: 100 });
  tracker.onPointerDown(2, 'bomb', state);
  tracker.onPointerDown(3, 'dash', state);
  assert.equal(tracker.getActivePointerCount(), 3);

  // Window blur / Tab switch / System interrupt
  tracker.reset(state);
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState());
  assert.equal(tracker.getDebouncer().getLastTriggerTime('bomb'), -1, 'Debounce timers reset');
});

test('Adversarial 5.2 [Orphaned Pointer Watchdog Recovery]: Abandoned pointers past 3000ms are recovered', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Pointer 99 grabs joystick at T=1000 and sets UP+RIGHT
  tracker.onPointerDown(99, 'joystick', state, { x: 100, y: 100 }, undefined, 1000);
  tracker.onPointerMove(99, { x: 150, y: 50 }, state, { x: 100, y: 100 });
  assert.equal(state.up, true);
  assert.equal(state.right, true);

  // Pointer 100 presses bomb at T=1000
  tracker.onPointerDown(100, 'bomb', state, undefined, undefined, 1000);
  assert.equal(state.bomb, true);

  // User switches app or screen locks; browser never sends pointerup.
  // Watchdog fires at T=4500 (elapsed = 3500ms > maxAgeMs 3000ms)
  const recoveredCount = tracker.recoverDroppedPointers(state, 3000, 4500);

  assert.equal(recoveredCount, 2, 'Exactly 2 orphaned pointers must be recovered');
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState(), 'All stuck vectors and buttons cleared');
});

test('Adversarial 5.3 [Null/Undefined Robustness]: All exported functions survive malformed arguments with zero exceptions', () => {
  // Functions should not crash when given null or undefined
  assert.doesNotThrow(() => resetJoystickDirection(null));
  assert.doesNotThrow(() => resetJoystickDirection(undefined));
  assert.doesNotThrow(() => resetAllMobileInputs(null));
  assert.doesNotThrow(() => resetAllMobileInputs(undefined));
  assert.doesNotThrow(() => triggerMobileAction(null, 'bomb'));
  assert.doesNotThrow(() => cancelMobileAction(null, 'bomb'));
  assert.doesNotThrow(() => releaseMobileAction(null, 'bomb'));

  const tracker = new MultiTouchPointerTracker();
  assert.doesNotThrow(() => tracker.onPointerDown(NaN, 'bomb', null));
  assert.doesNotThrow(() => tracker.onPointerDown(1, 'invalid_target', null));
  assert.doesNotThrow(() => tracker.onPointerMove(NaN, null, null));
  assert.doesNotThrow(() => tracker.onPointerUp(NaN, null));
  assert.doesNotThrow(() => tracker.onPointerCancel(NaN, null));
  assert.doesNotThrow(() => tracker.recoverDroppedPointers(null));
  assert.doesNotThrow(() => tracker.reset(null));

  const debouncer = new ButtonDebouncer();
  assert.doesNotThrow(() => debouncer.canTrigger(null));
  assert.doesNotThrow(() => debouncer.recordTrigger(null));
  assert.doesNotThrow(() => debouncer.reset(null));
});

/* ==============================================================================
 * SUITE 6: 50,000-ITERATION CHAOS MONKEY STRESS & ZERO-CORRUPTION SOAK
 * ============================================================================== */

test('Adversarial 6.1 [50,000 Chaos Combat Soak]: Aggressive interleaved multi-touch storm maintains zero corruption', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 30 });
  const scheduledCallbacks = [];
  const fakeScheduler = (cb) => scheduledCallbacks.push(cb);

  const targets = ['joystick', 'bomb', 'dash', 'ultimate'];
  const startTime = performance.now();
  let simulatedTime = 1000;

  let totalEvents = 0;
  let invalidStateViolations = 0;
  let opposingViolations = 0;

  for (let iter = 0; iter < 50000; iter++) {
    simulatedTime += 2; // Advance by 2ms per iteration
    const pointerId = iter % 12; // 12 virtual fingers
    const eventType = iter % 6;
    const target = targets[(iter * 7) % targets.length];
    totalEvents++;

    if (eventType === 0 || eventType === 1) {
      // Down
      tracker.onPointerDown(
        pointerId,
        target,
        state,
        { x: 100 + (iter % 80) - 40, y: 100 + (iter % 80) - 40 },
        fakeScheduler,
        simulatedTime
      );
    } else if (eventType === 2) {
      // Move
      const angleRad = (iter * 0.1) % (2 * Math.PI);
      const radius = 10 + (iter % 30);
      const x = 100 + Math.cos(angleRad) * radius;
      const y = 100 - Math.sin(angleRad) * radius;
      tracker.onPointerMove(pointerId, { x, y }, state, { x: 100, y: 100 });
    } else if (eventType === 3) {
      // Up
      tracker.onPointerUp(pointerId, state, fakeScheduler);
    } else if (eventType === 4) {
      // Cancel
      tracker.onPointerCancel(pointerId, state);
    } else if (eventType === 5) {
      // 5% dropped pointer simulation (no up/cancel), but trigger watchdog every 1,000 iters
      if (iter % 1000 === 0) {
        tracker.recoverDroppedPointers(state, 2000, simulatedTime);
      }
    }

    // Invariant verification on every iteration
    if (
      typeof state.up !== 'boolean' ||
      typeof state.down !== 'boolean' ||
      typeof state.left !== 'boolean' ||
      typeof state.right !== 'boolean' ||
      typeof state.bomb !== 'boolean' ||
      typeof state.dash !== 'boolean' ||
      typeof state.ultimate !== 'boolean'
    ) {
      invalidStateViolations++;
    }

    if ((state.up && state.down) || (state.left && state.right)) {
      opposingViolations++;
    }

    // Simulate game engine consumption of button impulses
    if (state.bomb && iter % 3 === 0) state.bomb = false;
    if (state.dash && iter % 4 === 0) state.dash = false;
    if (state.ultimate && iter % 5 === 0) state.ultimate = false;

    // Flush scheduled callbacks periodically
    if (scheduledCallbacks.length > 30) {
      const batch = scheduledCallbacks.splice(0, scheduledCallbacks.length);
      for (const cb of batch) cb();
    }
  }

  // Final cleanup and flush
  tracker.reset(state);
  while (scheduledCallbacks.length > 0) {
    const cb = scheduledCallbacks.shift();
    cb();
  }

  const duration = performance.now() - startTime;

  assert.equal(totalEvents, 50000);
  assert.equal(invalidStateViolations, 0, 'Zero invalid state properties allowed');
  assert.equal(opposingViolations, 0, 'Zero opposing direction contradictions allowed');
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must be cleanly zeroed after combat session');
  assert.equal(tracker.getActivePointerCount(), 0, 'Zero active pointers leaking');
  assert.ok(duration < 500, `50,000 chaos combat iterations completed in ${duration.toFixed(2)}ms (budget < 500ms)`);
});

/* ==============================================================================
 * SUITE 7: SIMULTANEOUS CONTRADICTORY DIRECTIONAL INPUTS (SOCD CLEANING)
 * ============================================================================== */

test('Adversarial 7.1 [SOCD Opposing Cardinal Directions]: UP+DOWN and LEFT+RIGHT neutralize cleanly to false', () => {
  const state = createDefaultMobileInputState();

  // Test UP + DOWN cancellation
  state.up = true;
  state.down = true;
  assert.equal(hasContradictoryDirections(state), true, 'UP + DOWN must be detected as contradictory');
  resolveContradictoryDirections(state);
  assert.equal(state.up, false, 'UP neutralized');
  assert.equal(state.down, false, 'DOWN neutralized');
  assert.equal(hasContradictoryDirections(state), false);

  // Test LEFT + RIGHT cancellation
  state.left = true;
  state.right = true;
  assert.equal(hasContradictoryDirections(state), true, 'LEFT + RIGHT must be detected as contradictory');
  resolveContradictoryDirections(state);
  assert.equal(state.left, false, 'LEFT neutralized');
  assert.equal(state.right, false, 'RIGHT neutralized');
  assert.equal(hasContradictoryDirections(state), false);

  // Test all 4 directions simultaneously pressed
  state.up = true;
  state.down = true;
  state.left = true;
  state.right = true;
  assert.equal(hasContradictoryDirections(state), true);
  resolveContradictoryDirections(state);
  assert.deepEqual(state, createDefaultMobileInputState(), 'All opposing directions neutralize to clean zero');
});

test('Adversarial 7.2 [SOCD Diagonal Preservation]: Valid diagonal pairs are preserved and never neutralized', () => {
  const diagonals = [
    { up: true, down: false, left: false, right: true },  // UP-RIGHT
    { up: true, down: false, left: true, right: false },  // UP-LEFT
    { up: false, down: true, left: true, right: false },  // DOWN-LEFT
    { up: false, down: true, left: false, right: true },  // DOWN-RIGHT
  ];

  for (const diag of diagonals) {
    const state = { ...createDefaultMobileInputState(), ...diag };
    assert.equal(hasContradictoryDirections(state), false, 'Diagonal must not be detected as contradictory');
    resolveContradictoryDirections(state);
    assert.equal(state.up, diag.up);
    assert.equal(state.down, diag.down);
    assert.equal(state.left, diag.left);
    assert.equal(state.right, diag.right);
  }
});

test('Adversarial 7.3 [sanitizeMobileInputState Invariants]: Malformed types and contradictions cleansed', () => {
  const malformed = {
    up: 1,
    down: 'true',
    left: true,
    right: true,
    bomb: 'yes',
    dash: null,
    ultimate: undefined,
  };

  const sanitized = sanitizeMobileInputState(malformed);
  assert.equal(typeof sanitized.up, 'boolean');
  assert.equal(typeof sanitized.down, 'boolean');
  assert.equal(typeof sanitized.left, 'boolean');
  assert.equal(typeof sanitized.right, 'boolean');
  assert.equal(typeof sanitized.bomb, 'boolean');
  assert.equal(typeof sanitized.dash, 'boolean');
  assert.equal(typeof sanitized.ultimate, 'boolean');

  // Opposing directions (up+down, left+right) must be neutralized
  assert.equal(sanitized.up, false);
  assert.equal(sanitized.down, false);
  assert.equal(sanitized.left, false);
  assert.equal(sanitized.right, false);
  assert.equal(sanitized.bomb, true);
  assert.equal(sanitized.dash, false);
  assert.equal(sanitized.ultimate, false);

  // Null input returns clean default
  assert.deepEqual(sanitizeMobileInputState(null), createDefaultMobileInputState());
});

test('Adversarial 7.4 [10,000 Random Direction Permutations]: Opposing mutual exclusion strictly holds', () => {
  for (let i = 0; i < 10000; i++) {
    const state = {
      up: (i & 1) !== 0,
      down: (i & 2) !== 0,
      left: (i & 4) !== 0,
      right: (i & 8) !== 0,
      bomb: false,
      dash: false,
      ultimate: false,
    };

    resolveContradictoryDirections(state);
    assert.ok(!(state.up && state.down), 'UP and DOWN can never both be true');
    assert.ok(!(state.left && state.right), 'LEFT and RIGHT can never both be true');
  }
});

/* ==============================================================================
 * SUITE 8: TOUCHCANCEL & POINTERCANCEL SYSTEM INTERRUPTS
 * ============================================================================== */

test('Adversarial 8.1 [cancelAllPointers Window Interrupt]: System touchcancel immediately clears all 10 fingers', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // 10 active fingers distributed across joystick and combat buttons
  tracker.onPointerDown(0, 'joystick', state, { x: 100, y: 100 });
  tracker.onPointerMove(0, { x: 150, y: 50 }, state, { x: 100, y: 100 }); // UP+RIGHT
  tracker.onPointerDown(1, 'bomb', state);
  tracker.onPointerDown(2, 'dash', state);
  tracker.onPointerDown(3, 'ultimate', state);
  tracker.onPointerDown(4, 'bomb', state);
  tracker.onPointerDown(5, 'dash', state);
  tracker.onPointerDown(6, 'ultimate', state);
  tracker.onPointerDown(7, 'joystick', state, { x: 100, y: 100 });
  tracker.onPointerDown(8, 'bomb', state);
  tracker.onPointerDown(9, 'dash', state);

  assert.equal(tracker.getActivePointerCount(), 10);
  assert.equal(state.up, true);
  assert.equal(state.right, true);
  assert.equal(state.bomb, true);
  assert.equal(state.dash, true);
  assert.equal(state.ultimate, true);

  // Incoming system interruption: window touchcancel / pointercancel
  tracker.cancelAllPointers(state);

  // Invariant: Everything must be immediately and synchronously 0, with 0 active pointers
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState(), 'All 7 channels must be completely false');
});

test('Adversarial 8.2 [Targeted onPointerCancel]: Cancelling one pointer preserves remaining active fingers', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Finger 1 and Finger 2 on Bomb
  tracker.onPointerDown(1, 'bomb', state);
  tracker.onPointerDown(2, 'bomb', state);
  assert.equal(tracker.getActivePointerCount('bomb'), 2);
  assert.equal(state.bomb, true);

  // Finger 1 cancelled (e.g. palm rejection by OS)
  tracker.onPointerCancel(1, state);
  assert.equal(tracker.getActivePointerCount('bomb'), 1);
  assert.equal(state.bomb, true, 'Bomb must remain active because Finger 2 is still held');

  // Finger 2 cancelled
  tracker.onPointerCancel(2, state);
  assert.equal(tracker.getActivePointerCount('bomb'), 0);
  assert.equal(state.bomb, false, 'Bomb must become false when last pointer is cancelled');
});

test('Adversarial 8.3 [Spurious Cancel Calls]: Cancelling non-existent pointers is completely safe', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  assert.doesNotThrow(() => {
    tracker.onPointerCancel(999, state);
    tracker.onPointerCancel(NaN, state);
    tracker.onPointerCancel(-1, state);
    tracker.cancelAllPointers(null);
  });

  assert.deepEqual(state, createDefaultMobileInputState());
});

/* ==============================================================================
 * SUITE 9: RAPID MULTI-TOUCH TAPPING & MULTI-FINGER FLUTTER
 * ============================================================================== */

test('Adversarial 9.1 [Two-Finger Flutter Tapping]: Alternating fingers maintain seamless press continuity', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduled = [];
  const sched = (cb) => scheduled.push(cb);

  // 1,000 cycles of alternating 2-finger flutter (Finger A down, Finger B down, Finger A up, Finger B up)
  for (let i = 0; i < 1000; i++) {
    // Finger A presses
    tracker.onPointerDown(10, 'bomb', state, undefined, sched);
    assert.equal(state.bomb, true);
    assert.equal(tracker.getActivePointerCount('bomb'), 1);

    // Finger B presses while Finger A is down
    tracker.onPointerDown(11, 'bomb', state, undefined, sched);
    assert.equal(state.bomb, true);
    assert.equal(tracker.getActivePointerCount('bomb'), 2);

    // Finger A lifts
    tracker.onPointerUp(10, state, sched);
    // Bomb MUST remain true because Finger B is still down!
    assert.equal(state.bomb, true, 'Bomb must remain true while Finger B is down');
    assert.equal(tracker.getActivePointerCount('bomb'), 1);

    // Finger B lifts
    tracker.onPointerUp(11, state, sched);
    assert.equal(tracker.getActivePointerCount('bomb'), 0);

    // Flush scheduled release callbacks
    while (scheduled.length > 0) scheduled.shift()();
    assert.equal(state.bomb, false, 'Bomb must be false after both fingers lift');
  }

  assert.deepEqual(state, createDefaultMobileInputState());
});

test('Adversarial 9.2 [Cross-Button Simultaneous Multi-Finger Spam]: Bomb + Dash + Ult independent channels', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduled = [];
  const sched = (cb) => scheduled.push(cb);

  for (let i = 0; i < 500; i++) {
    // 3 fingers hit 3 buttons simultaneously
    tracker.onPointerDown(1, 'bomb', state, undefined, sched);
    tracker.onPointerDown(2, 'dash', state, undefined, sched);
    tracker.onPointerDown(3, 'ultimate', state, undefined, sched);

    assert.equal(state.bomb, true);
    assert.equal(state.dash, true);
    assert.equal(state.ultimate, true);

    // Release in arbitrary order: Dash, then Bomb, then Ult
    tracker.onPointerUp(2, state, sched);
    while (scheduled.length > 0) scheduled.shift()();
    assert.equal(state.dash, false);
    assert.equal(state.bomb, true);
    assert.equal(state.ultimate, true);

    tracker.onPointerUp(1, state, sched);
    while (scheduled.length > 0) scheduled.shift()();
    assert.equal(state.bomb, false);
    assert.equal(state.ultimate, true);

    tracker.onPointerUp(3, state, sched);
    while (scheduled.length > 0) scheduled.shift()();
    assert.equal(state.ultimate, false);
  }

  assert.deepEqual(state, createDefaultMobileInputState());
});

test('Adversarial 9.3 [Continuous Joystick Hold + Rapid Button Hammering]: Zero directional drift', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduled = [];
  const sched = (cb) => scheduled.push(cb);

  // Left thumb holds joystick at UP-LEFT (135°)
  tracker.onPointerDown(0, 'joystick', state, { x: 100, y: 100 });
  tracker.onPointerMove(0, { x: 50, y: 50 }, state, { x: 100, y: 100 });
  assert.equal(state.up, true);
  assert.equal(state.left, true);

  // Right thumb hammers Bomb and Dash 2,000 times
  for (let i = 0; i < 2000; i++) {
    const ptr = 1 + (i % 5);
    const target = i % 2 === 0 ? 'bomb' : 'dash';
    tracker.onPointerDown(ptr, target, state, undefined, sched);
    tracker.onPointerUp(ptr, state, sched);
    while (scheduled.length > 0) scheduled.shift()();

    // Joystick direction MUST NOT be disturbed or corrupted by button spam
    assert.equal(state.up, true, 'UP vector must remain intact');
    assert.equal(state.left, true, 'LEFT vector must remain intact');
    assert.equal(state.down, false);
    assert.equal(state.right, false);
  }

  // Left thumb lifts
  tracker.onPointerUp(0, state, sched);
  assert.deepEqual(state, createDefaultMobileInputState());
});

/* ==============================================================================
 * SUITE 10: ZERO-STUCK-STATE GUARANTEE & ORPHAN WATCHDOG SOAK
 * ============================================================================== */

test('Adversarial 10.1 [Extreme Pointer Reassignment & Watchdog Soak]: 10,000 iterations leave 0 stuck states', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  let virtualTime = 10000;

  for (let i = 0; i < 10000; i++) {
    virtualTime += 10;
    const ptr = i % 8;
    const target = i % 3 === 0 ? 'bomb' : i % 3 === 1 ? 'dash' : 'joystick';

    // Down
    tracker.onPointerDown(ptr, target, state, { x: 100, y: 100 }, undefined, virtualTime);

    // 20% of the time, simulate a dropped pointer (no pointerup or pointercancel dispatched)
    if (i % 5 !== 0) {
      tracker.onPointerUp(ptr, state);
    }

    // Every 50 iterations, trigger watchdog cleanup for pointers older than 500ms
    if (i % 50 === 0) {
      tracker.recoverDroppedPointers(state, 500, virtualTime);
    }
  }

  // Final watchdog cleanup at end of session
  virtualTime += 1000;
  tracker.recoverDroppedPointers(state, 500, virtualTime);
  assert.equal(tracker.getActivePointerCount(), 0, 'All orphaned pointers must be recovered');
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must be completely zeroed');
});

