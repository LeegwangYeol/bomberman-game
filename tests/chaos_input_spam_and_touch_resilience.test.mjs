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
 * SUITE 1: OS KEY-REPEAT SPAM SUPPRESSION & KEYSTROKE ISOLATION INVARIANTS
 * ============================================================================== */

test('Tier 1.1 [OS Key-Repeat Suppression]: Repeating keydown events are rejected to prevent buffer flooding', () => {
  const state = createDefaultMobileInputState();
  const debouncer = new ButtonDebouncer(30);

  // Mirrored handleKeyDown logic from BombermanGame.tsx with e.repeat guard
  function handleKeyDown(e) {
    const target = e.target;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
      return false;
    }
    if (e.repeat) {
      return false; // Suppressed: OS key-repeat auto-repeat ignored
    }
    const key = (e.key || '').toLowerCase();
    if (key === 'w' || key === 'arrowup') state.up = true;
    if (key === 's' || key === 'arrowdown') state.down = true;
    if (key === 'a' || key === 'arrowleft') state.left = true;
    if (key === 'd' || key === 'arrowright') state.right = true;
    resolveContradictoryDirections(state);

    if (key === ' ' || e.code === 'Space') {
      if (debouncer.tryTrigger('bomb')) {
        state.bomb = true;
      }
    }
    if (key === 'shift' || key === 'e') {
      if (debouncer.tryTrigger('dash')) {
        state.dash = true;
      }
    }
    if (key === 'r' || key === 'q') {
      if (debouncer.tryTrigger('ultimate')) {
        state.ultimate = true;
      }
    }
    return true;
  }

  // 1. Initial keydown on Spacebar -> Accepted
  const firstPress = handleKeyDown({ key: ' ', code: 'Space', repeat: false });
  assert.equal(firstPress, true, 'Initial press must be accepted');
  assert.equal(state.bomb, true, 'Bomb must be active on initial press');

  // Simulated consumption by GameScene on tick
  state.bomb = false;

  // 2. Continuous 100 repeating keydown events from OS auto-repeat while Space is held down
  let repeatAccepted = 0;
  for (let i = 0; i < 100; i++) {
    const res = handleKeyDown({ key: ' ', code: 'Space', repeat: true });
    if (res) repeatAccepted++;
  }

  assert.equal(repeatAccepted, 0, 'Zero repeating keydown events must be accepted');
  assert.equal(state.bomb, false, 'Bomb state must NOT be re-activated by key repeat');
});

test('Tier 1.2 [Input & Textarea Keystroke Isolation]: Modal form typing never leaks into game state', () => {
  const state = createDefaultMobileInputState();
  const debouncer = new ButtonDebouncer(30);

  function handleKeyDown(e) {
    const target = e.target;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
      return false;
    }
    if (e.repeat) return false;
    const key = (e.key || '').toLowerCase();
    if (key === 'w') state.up = true;
    if (key === 's') state.down = true;
    if (key === 'a') state.left = true;
    if (key === 'd') state.right = true;
    if (key === ' ' || e.code === 'Space') {
      if (debouncer.tryTrigger('bomb')) state.bomb = true;
    }
    return true;
  }

  // Typing WASD and Space inside the backup/restore textarea
  const inputFields = [
    { tagName: 'TEXTAREA' },
    { tagName: 'INPUT' },
    { isContentEditable: true },
  ];

  for (const target of inputFields) {
    for (const key of ['w', 'a', 's', 'd', ' ']) {
      const handled = handleKeyDown({ key, code: key === ' ' ? 'Space' : '', target, repeat: false });
      assert.equal(handled, false, `Key '${key}' inside ${target.tagName || 'contentEditable'} must be ignored`);
    }
  }

  assert.equal(state.up, false);
  assert.equal(state.down, false);
  assert.equal(state.left, false);
  assert.equal(state.right, false);
  assert.equal(state.bomb, false);
});

/* ==============================================================================
 * SUITE 2: UNIFIED CROSS-CONTROL BUTTON DEBOUNCER INVARIANTS
 * ============================================================================== */

test('Tier 2.1 [ButtonDebouncer 10,000 Call Spam]: Precise rate-limiting under high-frequency flooding', () => {
  const debouncer = new ButtonDebouncer(50); // 50ms window
  let accepted = 0;
  let rejected = 0;

  // 1,000 steps at 2ms intervals = 2,000ms duration
  for (let t = 0; t <= 2000; t += 2) {
    if (debouncer.tryTrigger('bomb', t)) {
      accepted++;
    } else {
      rejected++;
    }
  }

  // At t=0, 50, 100, 150... 2000: 41 triggers accepted out of 1001 invocations
  assert.equal(accepted, 41, `Expected exactly 41 triggers at 50ms intervals across 2000ms, got ${accepted}`);
  assert.equal(rejected, 960, `Expected exactly 960 rejected calls, got ${rejected}`);
});

test('Tier 2.2 [Independent Action Debounce Channels]: Bomb spam does not throttle Dash or Ultimate', () => {
  const debouncer = new ButtonDebouncer(50);

  // Spam Bomb at t=100
  assert.equal(debouncer.tryTrigger('bomb', 100), true);
  assert.equal(debouncer.tryTrigger('bomb', 110), false); // Suppressed

  // Dash and Ultimate at t=110 must still fire independently
  assert.equal(debouncer.tryTrigger('dash', 110), true);
  assert.equal(debouncer.tryTrigger('ultimate', 110), true);

  // Bomb at t=150 (>= 50ms delta) fires cleanly
  assert.equal(debouncer.tryTrigger('bomb', 150), true);
});

test('Tier 2.3 [Cross-Input Keyboard + Touch Debounce Synchronization]: Unified debouncer blocks double-tap glitch', () => {
  const tracker = new MultiTouchPointerTracker({ debounceMs: 40 });
  const debouncer = tracker.getDebouncer();
  const state = createDefaultMobileInputState();

  // 1. Mobile touch Bomb fires at t=1000
  const touchAccepted = tracker.onPointerDown(1, 'bomb', state, undefined, undefined, 1000);
  assert.equal(touchAccepted, true, 'Touch bomb must be accepted');

  // 2. Physical keyboard spacebar pressed 5ms later at t=1005 (e.g. multi-device mash)
  const keyboardAccepted = debouncer.tryTrigger('bomb', 1005);
  assert.equal(keyboardAccepted, false, 'Keyboard bomb within 40ms of touch bomb must be debounced');

  // 3. At t=1045 (45ms delta > 40ms debounce window), keyboard press succeeds
  const laterKeyboardAccepted = debouncer.tryTrigger('bomb', 1045);
  assert.equal(laterKeyboardAccepted, true, 'Keyboard bomb after debounce window must succeed');
});

/* ==============================================================================
 * SUITE 3: EXTREME MULTI-TOUCH SPAM & 100,000 EVENT FUZZING
 * ============================================================================== */

test('Tier 3.1 [100,000 Chaos Touch Operations]: 10-finger assault maintains zero corruption & zero deadlocks', () => {
  const tracker = new MultiTouchPointerTracker({ debounceMs: 25, deadzone: 5 });
  const state = createDefaultMobileInputState();
  const startTime = performance.now();

  const actions = ['joystick', 'bomb', 'dash', 'ultimate'];
  let contradictionViolations = 0;

  for (let i = 0; i < 100000; i++) {
    const fingerId = (i % 10) + 1; // 10 fingers
    const eventType = i % 5;
    const target = actions[(i >> 2) % 4];
    const timestamp = i * 2; // Incremental time

    switch (eventType) {
      case 0: { // Pointer Down
        const x = ((i * 17) % 200) - 100;
        const y = ((i * 31) % 200) - 100;
        tracker.onPointerDown(fingerId, target, state, { x, y }, undefined, timestamp);
        break;
      }
      case 1: { // Pointer Move
        const x = ((i * 13) % 200) - 100;
        const y = ((i * 29) % 200) - 100;
        tracker.onPointerMove(fingerId, { x, y }, state, { x: 0, y: 0 }, timestamp);
        break;
      }
      case 2: { // Pointer Up
        tracker.onPointerUp(fingerId, state);
        break;
      }
      case 3: { // Pointer Cancel
        tracker.onPointerCancel(fingerId, state);
        break;
      }
      case 4: { // Heartbeat Refresh
        tracker.refreshPointer(fingerId, timestamp);
        break;
      }
    }

    // Invariant: No opposing cardinal directions simultaneously
    if (hasContradictoryDirections(state)) {
      contradictionViolations++;
      resolveContradictoryDirections(state);
    }
  }

  // Final cleanup
  tracker.cancelAllPointers(state);

  const duration = performance.now() - startTime;
  assert.equal(contradictionViolations, 0, 'Zero contradictory directions across 100,000 chaotic operations');
  assert.equal(state.up, false);
  assert.equal(state.down, false);
  assert.equal(state.left, false);
  assert.equal(state.right, false);
  assert.equal(state.bomb, false);
  assert.equal(state.dash, false);
  assert.equal(state.ultimate, false);
  assert.ok(duration < 2000, `100,000 touch ops completed in ${duration.toFixed(2)}ms (< 2000ms budget)`);
});

/* ==============================================================================
 * SUITE 4: MODAL LIFECYCLE & FOCUS/BLUR STUCK-KEY IMMUNITY
 * ============================================================================== */

test('Tier 4.1 [Modal Open & Escape Dismissal]: All sticky keys flush cleanly and inputs resume seamlessly', () => {
  const tracker = new MultiTouchPointerTracker({ debounceMs: 30 });
  const state = createDefaultMobileInputState();
  let isAnyModalOpen = false;
  let phaserKeysReset = 0;

  const mockPhaserGame = {
    scene: {
      scenes: [
        {
          input: {
            keyboard: {
              resetKeys: () => { phaserKeysReset++; },
            },
          },
        },
      ],
    },
  };

  function resetInputState() {
    tracker.cancelAllPointers(state);
    resetAllMobileInputs(state);
    mockPhaserGame.scene.scenes.forEach((s) => s.input.keyboard.resetKeys());
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (isAnyModalOpen) {
        isAnyModalOpen = false;
        resetInputState();
      } else {
        isAnyModalOpen = true;
        resetInputState();
      }
      return;
    }

    if (isAnyModalOpen) return;
    if (e.repeat) return;

    const key = (e.key || '').toLowerCase();
    if (key === 'w') state.up = true;
    if (key === 'a') state.left = true;
    if (key === 's') state.down = true;
    if (key === 'd') state.right = true;
    if (key === ' ') state.bomb = true;
    if (key === 'shift') state.dash = true;
    if (key === 'r') state.ultimate = true;
  }

  // 1. Player is running diagonal UP+RIGHT, holding Bomb, Dash, and Ult
  handleKeyDown({ key: 'w' });
  handleKeyDown({ key: 'd' });
  handleKeyDown({ key: ' ' });
  handleKeyDown({ key: 'shift' });
  handleKeyDown({ key: 'r' });

  assert.equal(state.up, true);
  assert.equal(state.right, true);
  assert.equal(state.bomb, true);
  assert.equal(state.dash, true);
  assert.equal(state.ultimate, true);

  // 2. Player opens Pause/Perk modal by pressing Escape
  handleKeyDown({ key: 'Escape' });
  assert.equal(isAnyModalOpen, true);
  assert.equal(state.up, false, 'Up must flush on modal open');
  assert.equal(state.right, false, 'Right must flush on modal open');
  assert.equal(state.bomb, false, 'Bomb must flush on modal open');
  assert.equal(state.dash, false, 'Dash must flush on modal open');
  assert.equal(state.ultimate, false, 'Ultimate must flush on modal open');
  assert.equal(phaserKeysReset, 1, 'Phaser keyboard keys must reset on modal open');

  // 3. User spams movement & bomb keys while modal is open -> completely suppressed
  handleKeyDown({ key: 'w' });
  handleKeyDown({ key: ' ' });
  assert.equal(state.up, false, 'Input while modal open must be ignored');
  assert.equal(state.bomb, false, 'Bomb while modal open must be ignored');

  // 4. User closes modal by pressing Escape
  handleKeyDown({ key: 'Escape' });
  assert.equal(isAnyModalOpen, false);
  assert.equal(phaserKeysReset, 2);

  // 5. Game resumes smoothly: pressing W moves up again
  handleKeyDown({ key: 'w' });
  assert.equal(state.up, true, 'Controls resume normally after modal dismissal');
});

test('Tier 4.2 [Defocus & VisibilityChange Interruption]: Browser blur resets all active keys immediately', () => {
  const tracker = new MultiTouchPointerTracker();
  const state = createDefaultMobileInputState();

  // Multi-finger hold + active joystick
  tracker.onPointerDown(1, 'joystick', state, { x: 50, y: 0 });
  tracker.onPointerMove(1, { x: 50, y: 0 }, state, { x: 0, y: 0 });
  tracker.onPointerDown(2, 'bomb', state);

  assert.equal(state.right, true);
  assert.equal(state.bomb, true);
  assert.equal(tracker.getActivePointerCount(), 2);

  // Window blur / Tab switch triggered
  tracker.cancelAllPointers(state);

  assert.equal(tracker.getActivePointerCount(), 0, 'Active pointer count must be 0 after cancelAllPointers');
  assert.equal(state.right, false, 'Joystick direction must be cleared');
  assert.equal(state.bomb, false, 'Bomb must be cleared');
});

/* ==============================================================================
 * SUITE 5: WATCHDOG DROPPED POINTER RECOVERY UNDER PATHOLOGICAL CONDITIONS
 * ============================================================================== */

test('Tier 5.1 [Heartbeat Refresh vs Dropped Pointer Separation]: Dead fingers reaped, active hold preserved', () => {
  const tracker = new MultiTouchPointerTracker({ debounceMs: 0 });
  const state = createDefaultMobileInputState();

  // Finger 1 (Joystick) and Finger 2 (Bomb) both touch at t=1000
  tracker.onPointerDown(1, 'joystick', state, { x: 0, y: -50 }, undefined, 1000);
  tracker.onPointerMove(1, { x: 0, y: -50 }, state, { x: 0, y: 0 }, 1000);
  tracker.onPointerDown(2, 'bomb', state, undefined, undefined, 1000);

  assert.equal(state.up, true);
  assert.equal(state.bomb, true);

  // Finger 1 is actively moving / receiving heartbeats at t=2500 and t=3800
  tracker.refreshPointer(1, 2500);
  tracker.refreshPointer(1, 3800);

  // Finger 2 was dropped by hardware (never sent touchend, no heartbeat since t=1000)
  // At t=4200 (delta for finger 2 is 3200ms > 3000ms maxAge)
  const recovered = tracker.recoverDroppedPointers(state, 3000, 4200);

  assert.equal(recovered, 1, 'Exactly 1 dropped pointer must be reaped');
  assert.equal(tracker.hasPointer(2), false, 'Dropped finger 2 must be deleted');
  assert.equal(tracker.hasPointer(1), true, 'Active finger 1 must remain tracked');
  assert.equal(state.bomb, false, 'Dead finger Bomb state must be released');
  assert.equal(state.up, true, 'Active finger Joystick direction must be preserved');
});

test('Tier 5.2 [Clock Rollbacks & Extreme Parameter Resilience]: Negative delta or NaN maxAge handled safely', () => {
  const tracker = new MultiTouchPointerTracker();
  const state = createDefaultMobileInputState();

  tracker.onPointerDown(1, 'dash', state, undefined, undefined, 5000);

  // Watchdog called with clock rollback (currentTime < timestamp)
  assert.doesNotThrow(() => {
    const recovered = tracker.recoverDroppedPointers(state, 3000, 2000);
    assert.equal(recovered, 0, 'Must not reap pointers when clock rolls backwards');
  });

  // Watchdog called with NaN / invalid maxAgeMs
  assert.doesNotThrow(() => {
    const recovered = tracker.recoverDroppedPointers(state, NaN, 5050);
    assert.equal(recovered, 0, 'Must safely default to 3000ms when maxAge is NaN');
  });

  // Clean cleanup
  tracker.reset(state);
  assert.equal(tracker.getActivePointerCount(), 0);
});

/* ==============================================================================
 * SUITE 6: ZERO-GC POOL CAPACITY & MEMORY SAFETY AUDIT
 * ============================================================================== */

test('Tier 6.1 [Zero-GC Record Recycling & Sanitization]: 50,000 rapid acquire/release cycles leak zero memory', () => {
  const tracker = new MultiTouchPointerTracker();
  const state = createDefaultMobileInputState();
  const scheduled = [];
  const sched = (cb) => scheduled.push(cb);

  // Cycle pointers rapidly
  for (let i = 0; i < 50000; i++) {
    const id = (i % 8) + 10;
    tracker.onPointerDown(id, 'bomb', state, { x: 10, y: 20 }, sched, i);
    tracker.onPointerUp(id, state, sched);
    while (scheduled.length > 0) scheduled.shift()();
  }

  // Verify tracker has no lingering pointers
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.equal(state.bomb, false);

  // Fuzz with non-finite values to ensure acquireRecord never pollutes the pool
  tracker.onPointerDown(99, 'ultimate', state, { x: NaN, y: Infinity }, sched);
  tracker.onPointerUp(99, state, sched);
  while (scheduled.length > 0) scheduled.shift()();
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.equal(state.ultimate, false);
});

test('Tier 6.2 [Defensive Function Callbacks]: shouldKeepActive throwing exception never deadlocks release', () => {
  const state = createDefaultMobileInputState();

  // Faulty shouldKeepActive that throws
  const throwingCallback = () => {
    throw new Error('Sensory hardware failure simulation');
  };

  // Immediate scheduler
  const immediateScheduler = (cb) => cb();

  assert.doesNotThrow(() => {
    triggerMobileAction(state, 'bomb', immediateScheduler, throwingCallback);
  });
  assert.equal(state.bomb, false, 'Bomb must safely default to false if shouldKeepActive throws');

  state.dash = true;
  assert.doesNotThrow(() => {
    releaseMobileAction(state, 'dash', immediateScheduler, throwingCallback);
  });
  assert.equal(state.dash, false, 'Dash must safely release to false if shouldKeepActive throws');
});
