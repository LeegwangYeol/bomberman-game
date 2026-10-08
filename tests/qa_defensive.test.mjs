import test from 'node:test';
import assert from 'node:assert';
import {
  MultiTouchPointerTracker,
  createDefaultMobileInputState,
  resolveContradictoryDirections,
  hasContradictoryDirections,
  sanitizeMobileInputState,
  resetJoystickDirection,
  resetAllMobileInputs,
  ButtonDebouncer,
  resolveJoystickDirection,
  resolveJoystickVector,
  triggerMobileAction,
  cancelMobileAction,
  releaseMobileAction,
  triggerMobileActionDebounced,
} from '../src/game/input_state.ts';

test('Defensive QA: Multi-Touch Spam & Boundary Breaking', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({
    debounceMs: 50,
    actionDebounceMs: { bomb: 20, dash: 30, ultimate: 40 }
  });

  assert.strictEqual(tracker.getButtonDebounce('bomb'), 20);
  assert.strictEqual(tracker.getButtonDebounce('dash'), 30);
  assert.strictEqual(tracker.getButtonDebounce('ultimate'), 40);

  tracker.setButtonDebounce('ultimate', 50);
  assert.strictEqual(tracker.getButtonDebounce('ultimate'), 50);

  // Spam Pointer Down on the same pointer ID but different targets
  tracker.onPointerDown(1, 'bomb', state);
  tracker.onPointerDown(1, 'dash', state);
  assert.strictEqual(tracker.getActivePointerCount('bomb'), 0);
  assert.strictEqual(tracker.getActivePointerCount('dash'), 1);

  // Boundary breaking: undefined coords, negative coords, etc.
  tracker.onPointerMove(1, { x: -9999, y: Infinity }, state);
  tracker.onPointerDown(2, 'joystick', state, { x: NaN, y: NaN });
  tracker.onPointerMove(2, { x: 100, y: 100 }, state, { x: NaN, y: NaN });

  tracker.cancelAllPointers(state);
  assert.strictEqual(tracker.getActivePointerCount(), 0);

  // Additional defensive assertions for corner-cases:
  // 1. Ghost pointer up/cancel (lifting pointers that were never registered)
  tracker.onPointerUp(999, state);
  tracker.onPointerCancel(888, state);
  tracker.onPointerMove(777, { x: 50, y: 50 }, state);
  assert.strictEqual(tracker.getActivePointerCount(), 0);
  assert.strictEqual(tracker.hasPointer(999), false);

  // 2. Invalid pointer ID types (NaN, Infinity, -Infinity, non-numbers)
  assert.strictEqual(tracker.onPointerDown(NaN, 'bomb', state), false);
  assert.strictEqual(tracker.onPointerDown(Infinity, 'bomb', state), false);
  assert.strictEqual(tracker.onPointerDown(-Infinity, 'bomb', state), false);
  assert.strictEqual(tracker.getActivePointerCount(), 0);

  // 3. Invalid target strings
  assert.strictEqual(tracker.onPointerDown(1, 'invalid_target', state), false);
  assert.strictEqual(tracker.getActivePointerCount(), 0);

  // 4. Repeated pointer down on the same target with same pointerId (touch bounce)
  const ok1 = tracker.onPointerDown(10, 'dash', state, { x: 10, y: 10 }, undefined, 1000);
  assert.strictEqual(ok1, true);
  assert.strictEqual(tracker.getActivePointerCount('dash'), 1);
  assert.strictEqual(tracker.hasPointer(10), true);

  // Second press on same target within debounce window (30ms for dash)
  const ok2 = tracker.onPointerDown(10, 'dash', state, { x: 15, y: 15 }, undefined, 1010);
  assert.strictEqual(ok2, false); // Debounced
  assert.strictEqual(tracker.getActivePointerCount('dash'), 1); // Pointer still tracked for release integrity

  // Third press after debounce window expires (timestamp delta = 40ms >= 30ms)
  const ok3 = tracker.onPointerDown(10, 'dash', state, { x: 20, y: 20 }, undefined, 1050);
  assert.strictEqual(ok3, true);
  assert.strictEqual(tracker.getActivePointerCount('dash'), 1);

  tracker.onPointerUp(10, state);
  assert.strictEqual(tracker.getActivePointerCount(), 0);
});

test('Defensive QA: Multi-Finger Overlapping Chording & Target Isolation', () => {
  const syncScheduler = (cb) => cb();
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({
    debounceMs: 0,
    actionDebounceMs: { bomb: 0, dash: 0, ultimate: 0 }
  });

  // Scenario: Two fingers press the 'bomb' button simultaneously (fat-finger overlap)
  tracker.onPointerDown(1, 'bomb', state, undefined, syncScheduler, 100);
  tracker.onPointerDown(2, 'bomb', state, undefined, syncScheduler, 105);
  assert.strictEqual(tracker.getActivePointerCount('bomb'), 2);
  assert.strictEqual(state.bomb, true);

  // First finger lifts: state.bomb MUST REMAIN TRUE because pointer 2 is still holding it down
  tracker.onPointerUp(1, state, syncScheduler);
  assert.strictEqual(tracker.getActivePointerCount('bomb'), 1);
  assert.strictEqual(state.bomb, true, 'Bomb must remain held while secondary finger is still on button');

  // Second finger lifts: now state.bomb releases cleanly
  tracker.onPointerUp(2, state, syncScheduler);
  assert.strictEqual(tracker.getActivePointerCount('bomb'), 0);
  assert.strictEqual(state.bomb, false, 'Bomb must release once all fingers have lifted');

  // Concurrent cross-button isolation: Pointer 1 on 'bomb', Pointer 2 on 'dash', Pointer 3 on 'ultimate'
  tracker.onPointerDown(1, 'bomb', state, undefined, syncScheduler, 200);
  tracker.onPointerDown(2, 'dash', state, undefined, syncScheduler, 200);
  tracker.onPointerDown(3, 'ultimate', state, undefined, syncScheduler, 200);

  assert.strictEqual(state.bomb, true);
  assert.strictEqual(state.dash, true);
  assert.strictEqual(state.ultimate, true);
  assert.strictEqual(tracker.getActivePointerCount('bomb'), 1);
  assert.strictEqual(tracker.getActivePointerCount('dash'), 1);
  assert.strictEqual(tracker.getActivePointerCount('ultimate'), 1);

  // Releasing dash must not disturb bomb or ultimate
  tracker.onPointerUp(2, state, syncScheduler);
  assert.strictEqual(state.dash, false);
  assert.strictEqual(state.bomb, true);
  assert.strictEqual(state.ultimate, true);

  // Canceling ultimate immediately
  tracker.onPointerCancel(3, state);
  assert.strictEqual(state.ultimate, false);
  assert.strictEqual(state.bomb, true);

  // Cleanup
  tracker.cancelAllPointers(state);
  assert.strictEqual(state.bomb, false);
  assert.strictEqual(tracker.getActivePointerCount(), 0);
});

test('Defensive QA: Dropped/Orphaned Pointer Lifecycle & Garbage Collection', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 0 });

  // Simulate dropped pointers (user dragged off screen or OS interrupted event delivery)
  tracker.onPointerDown(1, 'bomb', state, undefined, undefined, 1000);
  tracker.onPointerDown(2, 'joystick', state, { x: 50, y: 50 }, undefined, 1000);
  tracker.onPointerDown(3, 'dash', state, undefined, undefined, 2500);

  assert.strictEqual(tracker.getActivePointerCount(), 3);

  // At t=3500 with maxAge=2000:
  // pointer 1 age = 2500ms > 2000ms -> dropped
  // pointer 2 age = 2500ms > 2000ms -> dropped
  // pointer 3 age = 1000ms < 2000ms -> retained
  const recovered = tracker.recoverDroppedPointers(state, 2000, 3500);
  assert.strictEqual(recovered, 2);
  assert.strictEqual(tracker.getActivePointerCount(), 1);
  assert.strictEqual(tracker.hasPointer(3), true);
  assert.strictEqual(tracker.hasPointer(1), false);
  assert.strictEqual(tracker.hasPointer(2), false);

  // Recovering with stale currentTime or NaN: must not crash or falsely drop
  const invalidRecover = tracker.recoverDroppedPointers(state, 2000, NaN);
  // Default fallback uses performance.now() or Date.now() safely
  assert.strictEqual(typeof invalidRecover, 'number');

  // Purge remaining pointer
  const finalRecover = tracker.recoverDroppedPointers(state, 100, 10000);
  assert.strictEqual(finalRecover, 1);
  assert.strictEqual(tracker.getActivePointerCount(), 0);
  assert.strictEqual(state.dash, false);
  assert.strictEqual(state.bomb, false);

  // Recover on empty tracker returns 0 cleanly
  assert.strictEqual(tracker.recoverDroppedPointers(state, 1000, 15000), 0);
});

test('Defensive QA: ButtonDebouncer Timing & Clock Jitter Resilience', () => {
  const debouncer = new ButtonDebouncer(50);

  // Default window is 50ms
  assert.strictEqual(debouncer.getDebounceWindow('bomb'), 50);

  // Reject negative, NaN, or non-finite debounce windows
  debouncer.setDebounceWindow('bomb', -20);
  assert.strictEqual(debouncer.getDebounceWindow('bomb'), 50); // unchanged
  debouncer.setDebounceWindow('bomb', NaN);
  assert.strictEqual(debouncer.getDebounceWindow('bomb'), 50); // unchanged
  debouncer.setDebounceWindow('bomb', Infinity);
  assert.strictEqual(debouncer.getDebounceWindow('bomb'), 50); // unchanged

  // Valid window update
  debouncer.setDebounceWindow('bomb', 30);
  assert.strictEqual(debouncer.getDebounceWindow('bomb'), 30);

  // Initial trigger always passes
  assert.strictEqual(debouncer.canTrigger('bomb', 100), true);
  assert.strictEqual(debouncer.tryTrigger('bomb', 100), true);
  assert.strictEqual(debouncer.getLastTriggerTime('bomb'), 100);

  // Rapid trigger before window expires (delta 15 < 30)
  assert.strictEqual(debouncer.canTrigger('bomb', 115), false);
  assert.strictEqual(debouncer.isDebounced('bomb', 115), true);
  assert.strictEqual(debouncer.tryTrigger('bomb', 115), false);

  // Trigger at exact boundary (delta 30 == 30)
  assert.strictEqual(debouncer.canTrigger('bomb', 130), true);
  assert.strictEqual(debouncer.tryTrigger('bomb', 130), true);
  assert.strictEqual(debouncer.getLastTriggerTime('bomb'), 130);

  // Non-monotonic clock skew / jitter (currentTime < lastTriggerTime)
  assert.strictEqual(debouncer.canTrigger('bomb', 120), false);
  assert.strictEqual(debouncer.tryTrigger('bomb', 120), false);

  // Per-action independence: triggering 'bomb' must not lock out 'dash'
  assert.strictEqual(debouncer.canTrigger('dash', 130), true);
  assert.strictEqual(debouncer.tryTrigger('dash', 130), true);

  // Single action reset vs full reset
  debouncer.reset('bomb');
  assert.strictEqual(debouncer.getLastTriggerTime('bomb'), -1);
  assert.strictEqual(debouncer.getLastTriggerTime('dash'), 130);
  debouncer.reset();
  assert.strictEqual(debouncer.getLastTriggerTime('dash'), -1);
});

test('Defensive QA: Neutral SOCD Resolution & State Sanitization', () => {
  const state = createDefaultMobileInputState();

  // 1. Direct Opposing Vertical: UP + DOWN
  state.up = true;
  state.down = true;
  assert.strictEqual(hasContradictoryDirections(state), true);
  resolveContradictoryDirections(state);
  assert.strictEqual(state.up, false);
  assert.strictEqual(state.down, false);
  assert.strictEqual(hasContradictoryDirections(state), false);

  // 2. Direct Opposing Horizontal: LEFT + RIGHT
  state.left = true;
  state.right = true;
  assert.strictEqual(hasContradictoryDirections(state), true);
  resolveContradictoryDirections(state);
  assert.strictEqual(state.left, false);
  assert.strictEqual(state.right, false);
  assert.strictEqual(hasContradictoryDirections(state), false);

  // 3. All 4 directions active simultaneously
  state.up = true;
  state.down = true;
  state.left = true;
  state.right = true;
  resolveContradictoryDirections(state);
  assert.strictEqual(state.up, false);
  assert.strictEqual(state.down, false);
  assert.strictEqual(state.left, false);
  assert.strictEqual(state.right, false);

  // 4. Valid diagonals must NOT be neutralized
  state.up = true;
  state.right = true;
  resolveContradictoryDirections(state);
  assert.strictEqual(state.up, true, 'Up-Right diagonal UP must be preserved');
  assert.strictEqual(state.right, true, 'Up-Right diagonal RIGHT must be preserved');
  assert.strictEqual(hasContradictoryDirections(state), false);

  // 5. sanitizeMobileInputState handles malformed truthy/falsy types safely
  const corruptedState = {
    up: 1,
    down: 1,
    left: 'true',
    right: 0,
    bomb: 1,
    dash: null,
    ultimate: undefined,
  };
  const sanitized = sanitizeMobileInputState(corruptedState);
  assert.strictEqual(typeof sanitized.up, 'boolean');
  assert.strictEqual(typeof sanitized.down, 'boolean');
  assert.strictEqual(typeof sanitized.left, 'boolean');
  assert.strictEqual(typeof sanitized.right, 'boolean');
  assert.strictEqual(typeof sanitized.bomb, 'boolean');
  assert.strictEqual(typeof sanitized.dash, 'boolean');
  assert.strictEqual(typeof sanitized.ultimate, 'boolean');
  // UP and DOWN were both truthy (1), so SOCD cleaner neutralized both to false
  assert.strictEqual(sanitized.up, false);
  assert.strictEqual(sanitized.down, false);
  assert.strictEqual(sanitized.left, true);
  assert.strictEqual(sanitized.right, false);
  assert.strictEqual(sanitized.bomb, true);
  assert.strictEqual(sanitized.dash, false);
  assert.strictEqual(sanitized.ultimate, false);

  // 6. sanitizeMobileInputState with null/undefined returns fresh default state
  const fallbackState = sanitizeMobileInputState(null);
  assert.deepStrictEqual(fallbackState, createDefaultMobileInputState());
});

test('Defensive QA: Joystick Direction Sector & Distance Boundaries', () => {
  // Sector transitions at 22.5° steps
  // [0, 22.5) -> RIGHT
  assert.deepStrictEqual(resolveJoystickDirection(0), { up: false, down: false, left: false, right: true });
  assert.deepStrictEqual(resolveJoystickDirection(22.4), { up: false, down: false, left: false, right: true });

  // [22.5, 67.5] -> UP_RIGHT
  assert.deepStrictEqual(resolveJoystickDirection(22.5), { up: true, down: false, left: false, right: true });
  assert.deepStrictEqual(resolveJoystickDirection(45), { up: true, down: false, left: false, right: true });
  assert.deepStrictEqual(resolveJoystickDirection(67.5), { up: true, down: false, left: false, right: true });

  // (67.5, 112.5) -> UP
  assert.deepStrictEqual(resolveJoystickDirection(67.6), { up: true, down: false, left: false, right: false });
  assert.deepStrictEqual(resolveJoystickDirection(90), { up: true, down: false, left: false, right: false });
  assert.deepStrictEqual(resolveJoystickDirection(112.4), { up: true, down: false, left: false, right: false });

  // Negative angles wrap around cleanly
  assert.deepStrictEqual(resolveJoystickDirection(-90), { up: false, down: true, left: false, right: false }); // 270° DOWN
  assert.deepStrictEqual(resolveJoystickDirection(-180), { up: false, down: false, left: true, right: false }); // 180° LEFT
  assert.deepStrictEqual(resolveJoystickDirection(720), { up: false, down: false, left: false, right: true }); // 0° RIGHT

  // Distance deadzone defense (< 5px)
  assert.deepStrictEqual(resolveJoystickDirection(90, 4.999), { up: false, down: false, left: false, right: false });
  assert.deepStrictEqual(resolveJoystickDirection(90, 5.0), { up: true, down: false, left: false, right: false });

  // Non-finite and NaN inputs return all false (DIR_NONE)
  assert.deepStrictEqual(resolveJoystickDirection(NaN), { up: false, down: false, left: false, right: false });
  assert.deepStrictEqual(resolveJoystickDirection(Infinity), { up: false, down: false, left: false, right: false });
  assert.deepStrictEqual(resolveJoystickDirection(-Infinity), { up: false, down: false, left: false, right: false });
  assert.deepStrictEqual(resolveJoystickDirection(90, NaN), { up: false, down: false, left: false, right: false });
  assert.deepStrictEqual(resolveJoystickDirection(90, -10), { up: false, down: false, left: false, right: false });
});

test('Defensive QA: Object Pool Allocation & Swap-and-Pop Zero-GC Cycle', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker({ debounceMs: 0 });

  // Rapidly acquire and release 100 pointers sequentially
  for (let cycle = 0; cycle < 100; cycle++) {
    for (let p = 0; p < 10; p++) {
      tracker.onPointerDown(p, 'bomb', state, { x: p, y: p });
    }
    assert.strictEqual(tracker.getActivePointerCount(), 10);

    for (let p = 0; p < 10; p++) {
      tracker.onPointerUp(p, state);
    }
    assert.strictEqual(tracker.getActivePointerCount(), 0);
  }

  // Verify internal pool reuse did not leak or corrupt
  tracker.cancelAllPointers(state);
  assert.strictEqual(tracker.getActivePointerCount(), 0);
  assert.strictEqual(state.bomb, false);
});
