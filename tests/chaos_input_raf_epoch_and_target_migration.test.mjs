/**
 * tests/chaos_input_raf_epoch_and_target_migration.test.mjs
 * 
 * Chaos QA & Input Resilience Suite:
 * 1. Frame-synchronized double-RAF fallback & actionEpochs token validation
 * 2. Stale double-RAF closure abort on rapid consecutive action triggers
 * 3. Rapid pointer ID target migration across action buttons without pointerup
 * 4. MultiTouchPointerTracker recovery watchdog isolating actions from joystick vectors
 * 5. High-frequency interleaved pointer down/move/up/cancel burst operations
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultMobileInputState,
  triggerMobileAction,
  cancelMobileAction,
  releaseMobileAction,
  MultiTouchPointerTracker,
  resolveContradictoryDirections,
} from '../src/game/input_state.ts';

/* ==============================================================================
 * TIER 1: ACTION EPOCHS & DOUBLE-RAF STALE CLOSURE ABORT
 * ============================================================================== */

test('Tier 1.1: triggerMobileAction executes double-RAF release cycle with mock scheduler', () => {
  const state = createDefaultMobileInputState();
  const queue = [];
  const mockScheduler = (cb) => queue.push(cb);

  // Trigger action
  triggerMobileAction(state, 'bomb', mockScheduler);
  assert.equal(state.bomb, true, 'Bomb must be immediately active');
  assert.equal(queue.length, 1, 'First RAF must be scheduled');

  // Flush 1st RAF
  const step1 = queue.shift();
  step1();
  assert.equal(state.bomb, true, 'Bomb remains active after 1st RAF');
  assert.equal(queue.length, 1, 'Second RAF must be scheduled');

  // Flush 2nd RAF
  const step2 = queue.shift();
  step2();
  assert.equal(state.bomb, false, 'Bomb must be released after 2nd RAF');
});

test('Tier 1.2: Stale double-RAF closure is aborted when a second trigger increments actionEpoch', () => {
  const state = createDefaultMobileInputState();
  const queue = [];
  const mockScheduler = (cb) => queue.push(cb);

  // 1st Trigger
  triggerMobileAction(state, 'dash', mockScheduler);
  assert.equal(state.dash, true);
  assert.equal(queue.length, 1);

  // Advance 1st trigger to 2nd RAF stage
  const step1 = queue.shift();
  step1();
  assert.equal(queue.length, 1);
  const staleReleaseCallback = queue[0];

  // 2nd Trigger arrives before 1st release callback runs (rapid re-trigger)
  triggerMobileAction(state, 'dash', mockScheduler);
  assert.equal(state.dash, true);
  assert.equal(queue.length, 2, 'Queue now holds stale 2nd RAF + new 1st RAF');

  // Execute the stale 2nd RAF callback from the 1st trigger
  const executedStale = queue.shift();
  assert.equal(executedStale, staleReleaseCallback);
  executedStale();

  // INVARIANT: dash must NOT be set to false by the stale callback!
  assert.equal(
    state.dash,
    true,
    'Stale closure must be aborted due to actionEpoch token mismatch'
  );

  // Now flush the 2nd trigger through its two stages
  const step2_1 = queue.shift();
  step2_1();
  const step2_2 = queue.shift();
  step2_2();

  assert.equal(state.dash, false, 'Dash is cleanly released after the latest trigger completes');
});

test('Tier 1.3: shouldKeepActive callback prevents release when pointer remains pressed', () => {
  const state = createDefaultMobileInputState();
  const queue = [];
  const mockScheduler = (cb) => queue.push(cb);

  let isHeld = true;
  triggerMobileAction(state, 'ultimate', mockScheduler, () => isHeld);

  // Flush both RAFs
  queue.shift()();
  queue.shift()();

  assert.equal(state.ultimate, true, 'Ultimate remains active because shouldKeepActive was true');

  // Once pointer releases
  isHeld = false;
  releaseMobileAction(state, 'ultimate', mockScheduler, () => isHeld);
  queue.shift()();

  assert.equal(state.ultimate, false, 'Ultimate releases when shouldKeepActive becomes false');
});

/* ==============================================================================
 * TIER 2: RAPID POINTER ID TARGET MIGRATION (NO INTERVENING POINTERUP)
 * ============================================================================== */

test('Tier 2.1: Re-used pointerId safely migrates targets without state corruption', () => {
  const tracker = new MultiTouchPointerTracker();
  const state = createDefaultMobileInputState();

  // Pointer 1 presses 'bomb'
  tracker.onPointerDown(1, 'bomb', state, { x: 100, y: 100 }, undefined, 1000);
  assert.equal(state.bomb, true);
  assert.equal(tracker.getActivePointerCount(), 1);

  // Same pointer 1 re-assigned to 'dash' without intervening pointerup (e.g. fast touch drift)
  tracker.onPointerDown(1, 'dash', state, { x: 150, y: 150 }, undefined, 1010);
  assert.equal(state.dash, true);
  assert.equal(tracker.getActivePointerCount(), 1, 'Pointer count must remain 1');

  // Releasing pointer 1 cancels/releases 'dash'
  tracker.onPointerCancel(1, state);
  assert.equal(state.dash, false);
  assert.equal(tracker.getActivePointerCount(), 0);
});

test('Tier 2.2: Pointer ID migration across all 3 actions in rapid sequence', () => {
  const tracker = new MultiTouchPointerTracker();
  const state = createDefaultMobileInputState();

  const actions = ['bomb', 'dash', 'ultimate', 'bomb'];
  for (let i = 0; i < actions.length; i++) {
    tracker.onPointerDown(42, actions[i], state, { x: 100 + i * 10, y: 100 }, undefined, 2000 + i * 10);
    assert.equal(tracker.getActivePointerCount(), 1);
  }

  tracker.onPointerCancel(42, state);
  assert.equal(state.bomb, false);
  assert.equal(state.dash, false);
  assert.equal(state.ultimate, false);
  assert.equal(tracker.getActivePointerCount(), 0);
});

/* ==============================================================================
 * TIER 3: WATCHDOG ORPHANED POINTER RECOVERY & JOYSTICK ISOLATION
 * ============================================================================== */

test('Tier 3.1: recoverDroppedPointers prunes stale action buttons but preserves joystick movement', () => {
  const tracker = new MultiTouchPointerTracker();
  const state = createDefaultMobileInputState();

  // Virtual joystick active on pointer 10, moving up/right
  tracker.onPointerDown(10, 'joystick', state, { x: 50, y: 50 }, undefined, 1000);
  state.up = true;
  state.right = true;

  // Action button pressed on pointer 20 at t=1000ms
  tracker.onPointerDown(20, 'bomb', state, { x: 300, y: 300 }, undefined, 1000);
  assert.equal(state.bomb, true);
  assert.equal(tracker.getActivePointerCount(), 2);

  // Pointer 20 touches move, but pointer 10 (joystick) moves up/right recently at t=4500ms
  tracker.onPointerMove(10, { x: 70, y: 30 }, state, undefined, 4500);

  // Watchdog checks at t=5000ms with timeout 3000ms: pointer 20 has been stale for 4000ms!
  const recovered = tracker.recoverDroppedPointers(state, 3000, 5000);
  assert.equal(recovered, 1, 'Must recover exactly 1 orphaned pointer');
  assert.equal(state.bomb, false, 'Orphaned bomb action must be cleared');
  assert.equal(state.up, true, 'Joystick up state must NOT be wiped');
  assert.equal(state.right, true, 'Joystick right state must NOT be wiped');
  assert.equal(tracker.getActivePointerCount(), 1, 'Active joystick pointer remains');
});

/* ==============================================================================
 * TIER 4: SOCD CONTRADICTION CLEANER & INPUT BOUNDS
 * ============================================================================== */

test('Tier 4.1: Opposing cardinal directions cancel out cleanly (SOCD cleaner)', () => {
  const state = createDefaultMobileInputState();
  state.up = true;
  state.down = true;
  state.left = true;
  state.right = true;

  resolveContradictoryDirections(state);

  assert.equal(state.up, false);
  assert.equal(state.down, false);
  assert.equal(state.left, false);
  assert.equal(state.right, false);
});
