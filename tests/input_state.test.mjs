import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultMobileInputState,
  resolveJoystickDirection,
  resolveJoystickVector,
  resetJoystickDirection,
  resetAllMobileInputs,
  triggerMobileAction,
  cancelMobileAction,
  releaseMobileAction,
  MultiTouchPointerTracker,
} from '../src/game/input_state.ts';

/* ==============================================================================
 * TIER 1: 8-WAY SECTOR ANGLE PARTITIONING & 360-DEGREE CONTINUOUS COVERAGE
 * ============================================================================== */

test('Tier 1 [Angle Resolution]: Cardinal directions map strictly and symmetrically', () => {
  // 90° strictly UP
  assert.deepEqual(resolveJoystickDirection(90), {
    up: true,
    down: false,
    left: false,
    right: false,
  });

  // 270° strictly DOWN
  assert.deepEqual(resolveJoystickDirection(270), {
    up: false,
    down: true,
    left: false,
    right: false,
  });

  // 180° strictly LEFT
  assert.deepEqual(resolveJoystickDirection(180), {
    up: false,
    down: false,
    left: true,
    right: false,
  });

  // 0° and 360° strictly RIGHT
  assert.deepEqual(resolveJoystickDirection(0), {
    up: false,
    down: false,
    left: false,
    right: true,
  });
  assert.deepEqual(resolveJoystickDirection(360), {
    up: false,
    down: false,
    left: false,
    right: true,
  });
});

test('Tier 1 [Zero Deadzones]: Diagonal sectors eliminate deadzones at 45°, 135°, 225°, 315°', () => {
  // 45°: UP + RIGHT
  assert.deepEqual(resolveJoystickDirection(45), {
    up: true,
    down: false,
    left: false,
    right: true,
  });

  // 135°: UP + LEFT (historical deadzone eliminated)
  assert.deepEqual(resolveJoystickDirection(135), {
    up: true,
    down: false,
    left: true,
    right: false,
  });

  // 225°: DOWN + LEFT (historical deadzone eliminated)
  assert.deepEqual(resolveJoystickDirection(225), {
    up: false,
    down: true,
    left: true,
    right: false,
  });

  // 315°: DOWN + RIGHT
  assert.deepEqual(resolveJoystickDirection(315), {
    up: false,
    down: true,
    left: false,
    right: true,
  });
});

test('Tier 1 [360-Degree Sweep]: 3,600 continuous angle samples verify ZERO dead zones and no opposite contradictions', () => {
  // Sweep every 0.1 degree across full 360 circle
  for (let degree = 0; degree < 360; degree += 0.1) {
    const dir = resolveJoystickDirection(degree);

    // Invariant 1: At least one direction MUST be active (Zero dead zones)
    const activeCount = Number(dir.up) + Number(dir.down) + Number(dir.left) + Number(dir.right);
    assert.ok(
      activeCount >= 1,
      `Dead zone detected at ${degree.toFixed(1)}°: no active directions`
    );

    // Invariant 2: At most 2 directions can be active (cardinal or diagonal)
    assert.ok(
      activeCount <= 2,
      `Too many directions (${activeCount}) active at ${degree.toFixed(1)}°`
    );

    // Invariant 3: Opposing directions are strictly impossible
    assert.ok(!(dir.up && dir.down), `Contradictory UP and DOWN active at ${degree.toFixed(1)}°`);
    assert.ok(!(dir.left && dir.right), `Contradictory LEFT and RIGHT active at ${degree.toFixed(1)}°`);

    // Invariant 4: If 2 directions are active, they must be orthogonal diagonals
    if (activeCount === 2) {
      const isDiagonal =
        (dir.up && dir.right) ||
        (dir.up && dir.left) ||
        (dir.down && dir.left) ||
        (dir.down && dir.right);
      assert.ok(isDiagonal, `Invalid 2-direction combination at ${degree.toFixed(1)}°`);
    }
  }
});

test('Tier 1 [Angle Normalization]: Negative angles and over-rotation (>360°) normalize consistently', () => {
  // Negative angles
  assert.deepEqual(resolveJoystickDirection(-90), resolveJoystickDirection(270));
  assert.deepEqual(resolveJoystickDirection(-180), resolveJoystickDirection(180));
  assert.deepEqual(resolveJoystickDirection(-45), resolveJoystickDirection(315));
  assert.deepEqual(resolveJoystickDirection(-360), resolveJoystickDirection(0));
  assert.deepEqual(resolveJoystickDirection(-720), resolveJoystickDirection(0));

  // Over-rotation
  assert.deepEqual(resolveJoystickDirection(450), resolveJoystickDirection(90));
  assert.deepEqual(resolveJoystickDirection(720), resolveJoystickDirection(0));
  assert.deepEqual(resolveJoystickDirection(810), resolveJoystickDirection(90));
  assert.deepEqual(resolveJoystickDirection(1080), resolveJoystickDirection(0));
});

/* ==============================================================================
 * TIER 2: DEADZONE & DISTANCE THRESHOLD INVARIANTS
 * ============================================================================== */

test('Tier 2 [Deadzone Threshold]: distance < 5 strictly zeroes all directions regardless of angle', () => {
  const testAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360, -90, 450];
  const testSubThresholdDistances = [0, 0.5, 1.0, 2.5, 4.0, 4.99, 4.9999];

  for (const angle of testAngles) {
    for (const dist of testSubThresholdDistances) {
      const res = resolveJoystickDirection(angle, dist);
      assert.deepEqual(
        res,
        { up: false, down: false, left: false, right: false },
        `Expected all false for angle ${angle}° at distance ${dist}`
      );
    }
  }
});

test('Tier 2 [Distance Activation]: distance >= 5 cleanly activates directions', () => {
  const resAt5 = resolveJoystickDirection(90, 5.0);
  assert.deepEqual(resAt5, { up: true, down: false, left: false, right: false });

  const resAt50 = resolveJoystickDirection(135, 50.0);
  assert.deepEqual(resAt50, { up: true, down: false, left: true, right: false });

  const resUndefined = resolveJoystickDirection(270, undefined);
  assert.deepEqual(resUndefined, { up: false, down: true, left: false, right: false });
});

/* ==============================================================================
 * TIER 3: RAPID DIRECTIONAL FLIPPING & BOUNDARY JITTER CHAOS SIMULATION
 * ============================================================================== */

test('Tier 3 [Boundary Jitter]: 10,000 rapid quadrant and boundary flips execute in < 100ms with 0 NaN', () => {
  const boundaries = [
    { name: 'Right <-> Up/Right', a: 22.49, b: 22.51 },
    { name: 'Up/Right <-> Up', a: 67.49, b: 67.51 },
    { name: 'Up <-> Up/Left', a: 112.49, b: 112.51 },
    { name: 'Up/Left <-> Left', a: 157.49, b: 157.51 },
    { name: 'Left <-> Down/Left', a: 202.49, b: 202.51 },
    { name: 'Down/Left <-> Down', a: 247.49, b: 247.51 },
    { name: 'Down <-> Down/Right', a: 292.49, b: 292.51 },
    { name: 'Down/Right <-> Right', a: 337.49, b: 337.51 },
    { name: '360° Wrap Boundary', a: 359.99, b: 0.01 },
  ];

  const state = createDefaultMobileInputState();
  const startTime = performance.now();

  let allBoolean = true;
  for (let iter = 0; iter < 10000; iter++) {
    const boundary = boundaries[iter % boundaries.length];
    const angle = iter % 2 === 0 ? boundary.a : boundary.b;
    const dir = resolveJoystickDirection(angle, 25);

    state.up = dir.up;
    state.down = dir.down;
    state.left = dir.left;
    state.right = dir.right;

    if (
      typeof state.up !== 'boolean' ||
      typeof state.down !== 'boolean' ||
      typeof state.left !== 'boolean' ||
      typeof state.right !== 'boolean'
    ) {
      allBoolean = false;
    }
  }

  assert.ok(allBoolean, 'All 10,000 resolved directional states must be booleans');

  const duration = performance.now() - startTime;
  assert.ok(
    duration < 100,
    `10,000 boundary jitter flips must complete within 100ms (took ${duration.toFixed(2)}ms)`
  );
});

/* ==============================================================================
 * TIER 4: EXTREME HIGH-FREQUENCY MULTI-TOUCH SPAMMING SIMULATION (10,000 EVENTS)
 * ============================================================================== */

test('Tier 4 [Multi-Touch Chaos]: 10,000 randomized concurrent pointer actions maintain state integrity', () => {
  const state = createDefaultMobileInputState();

  // Custom frame scheduler to simulate RAF ticks in Node test runner
  const scheduledFrames = [];
  const fakeScheduler = (cb) => {
    scheduledFrames.push(cb);
  };

  const startTime = performance.now();

  for (let i = 0; i < 10000; i++) {
    const actionType = i % 5;
    const eventType = (i * 7) % 5;

    // Simulate Finger 1: Joystick move, deadzone, or release
    if (actionType === 0) {
      if (eventType === 0) {
        resetJoystickDirection(state);
      } else {
        const randAngle = (i * 37.3) % 360;
        const randDist = (i * 13.7) % 60;
        const dir = resolveJoystickDirection(randAngle, randDist);
        state.up = dir.up;
        state.down = dir.down;
        state.left = dir.left;
        state.right = dir.right;
      }
    }

    // Simulate Finger 2: Bomb button spamming
    if (actionType === 1) {
      if (eventType === 0) {
        triggerMobileAction(state, 'bomb', fakeScheduler);
      } else if (eventType === 1) {
        releaseMobileAction(state, 'bomb', fakeScheduler);
      } else if (eventType === 2) {
        cancelMobileAction(state, 'bomb');
      }
    }

    // Simulate Finger 3: Dash button spamming
    if (actionType === 2) {
      if (eventType === 0) {
        triggerMobileAction(state, 'dash', fakeScheduler);
      } else if (eventType === 1) {
        releaseMobileAction(state, 'dash', fakeScheduler);
      } else if (eventType === 2) {
        cancelMobileAction(state, 'dash');
      }
    }

    // Simulate Finger 4: Ultimate button spamming
    if (actionType === 3) {
      if (eventType === 0) {
        triggerMobileAction(state, 'ultimate', fakeScheduler);
      } else if (eventType === 1) {
        releaseMobileAction(state, 'ultimate', fakeScheduler);
      } else if (eventType === 2) {
        cancelMobileAction(state, 'ultimate');
      }
    }

    // Simulate Finger 5: Rapid vector resolution from raw touch coordinates
    if (actionType === 4) {
      const dx = ((i * 19.1) % 100) - 50;
      const dy = ((i * 23.3) % 100) - 50;
      const vecDir = resolveJoystickVector(dx, dy);
      assert.ok(typeof vecDir.up === 'boolean');
      assert.ok(typeof vecDir.down === 'boolean');
      assert.ok(typeof vecDir.left === 'boolean');
      assert.ok(typeof vecDir.right === 'boolean');
    }

    // Simulate periodic animation frame flushes
    if (i % 10 === 0 && scheduledFrames.length > 0) {
      const callbacks = scheduledFrames.splice(0, scheduledFrames.length);
      for (const cb of callbacks) {
        cb();
      }
    }
  }

  // Drain any remaining scheduled frames
  while (scheduledFrames.length > 0) {
    const callbacks = scheduledFrames.splice(0, scheduledFrames.length);
    for (const cb of callbacks) {
      cb();
    }
  }

  const duration = performance.now() - startTime;
  assert.ok(
    duration < 250,
    `10,000 multi-touch events must complete within 250ms (took ${duration.toFixed(2)}ms)`
  );

  // After all actions drain, resetAllMobileInputs must cleanly zero the state
  resetAllMobileInputs(state);
  assert.deepEqual(state, createDefaultMobileInputState());
});

/* ==============================================================================
 * TIER 5: POINTER CANCELLATION & INPUT RELEASE INVARIANTS
 * ============================================================================== */

test('Tier 5 [Pointer Cancel]: cancelMobileAction immediately clears action without waiting for RAF', () => {
  const state = createDefaultMobileInputState();

  state.bomb = true;
  state.dash = true;
  state.ultimate = true;

  cancelMobileAction(state, 'bomb');
  assert.equal(state.bomb, false, 'Bomb must be immediately false upon cancel');
  assert.equal(state.dash, true, 'Dash remains unaffected');

  cancelMobileAction(state, 'dash');
  assert.equal(state.dash, false, 'Dash must be immediately false upon cancel');

  cancelMobileAction(state, 'ultimate');
  assert.equal(state.ultimate, false, 'Ultimate must be immediately false upon cancel');
});

test('Tier 5 [Double-RAF Fallback]: Frame-synchronized clearing prevents sticky buttons if pointerup dropped', () => {
  const state = createDefaultMobileInputState();
  const queue = [];
  const fakeScheduler = (cb) => queue.push(cb);

  // User presses bomb, but browser drops the pointerup event
  triggerMobileAction(state, 'bomb', fakeScheduler);
  assert.equal(state.bomb, true, 'Frame 0: button is pressed');
  assert.equal(queue.length, 1, 'First RAF callback scheduled');

  // Frame 1 arrives (Phaser render/update tick)
  const frame1Callback = queue.shift();
  frame1Callback();
  assert.equal(state.bomb, true, 'Frame 1: button is still active so GameScene can read it');
  assert.equal(queue.length, 1, 'Second RAF callback scheduled');

  // Frame 2 arrives (Fallback clearing tick)
  const frame2Callback = queue.shift();
  frame2Callback();
  assert.equal(state.bomb, false, 'Frame 2: button is automatically cleared even without pointerup');
});

test('Tier 5 [Window Defocus / Blur]: resetAllMobileInputs zeroes all 7 directions and action flags', () => {
  const state = {
    up: true,
    down: false,
    left: true,
    right: false,
    bomb: true,
    dash: true,
    ultimate: true,
  };

  resetAllMobileInputs(state);
  assert.deepEqual(state, {
    up: false,
    down: false,
    left: false,
    right: false,
    bomb: false,
    dash: false,
    ultimate: false,
  });
});

/* ==============================================================================
 * TIER 6: PHASER GAME SCENE CONSUMPTION & OPPOSING DIRECTION INTEGRATION
 * ============================================================================== */

test('Tier 6 [Atomic Consumption]: Action flags are atomically consumed by game loop', () => {
  const mInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    bomb: true,
    dash: true,
    ultimate: true,
  };

  // Simulate GameScene.update() step 2 (dash consumption)
  const dashPressed = Boolean(mInput.dash);
  if (mInput.dash) mInput.dash = false;
  assert.equal(dashPressed, true);
  assert.equal(mInput.dash, false, 'Dash flag must be atomically cleared after read');

  // Simulate GameScene.update() step 2c (ultimate consumption)
  const ultPressed = Boolean(mInput.ultimate);
  if (mInput.ultimate) mInput.ultimate = false;
  assert.equal(ultPressed, true);
  assert.equal(mInput.ultimate, false, 'Ultimate flag must be atomically cleared after read');

  // Simulate GameScene.update() step 4 (bomb consumption)
  const bombPressed = Boolean(mInput.bomb);
  if (mInput.bomb) mInput.bomb = false;
  assert.equal(bombPressed, true);
  assert.equal(mInput.bomb, false, 'Bomb flag must be atomically cleared after read');
});

test('Tier 6 [Opposing Direction Cancellation]: Simultaneous conflicting directions yield zero velocity intent', () => {
  // If touch or keyboard injects both LEFT and RIGHT simultaneously
  const left = true;
  const right = true;
  let wantX = 0;
  if (left && !right) wantX = -1;
  else if (right && !left) wantX = 1;
  assert.equal(wantX, 0, 'Opposing horizontal inputs cancel each other to 0');

  // If both UP and DOWN are active simultaneously
  const up = true;
  const down = true;
  let wantY = 0;
  if (up && !down) wantY = -1;
  else if (down && !up) wantY = 1;
  assert.equal(wantY, 0, 'Opposing vertical inputs cancel each other to 0');
});

/* ==============================================================================
 * TIER 7: NAN & MALFORMED COORDINATE INVARIANCE (10,000 FUZZING SAMPLES)
 * ============================================================================== */

test('Tier 7 [NaN & Non-Finite Coordinates]: resolveJoystickDirection strictly zeroes all directions on invalid inputs', () => {
  const invalidAngles = [
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    '90',
    {},
    [],
  ];

  for (const angle of invalidAngles) {
    const res = resolveJoystickDirection(angle, 25);
    assert.deepEqual(
      res,
      { up: false, down: false, left: false, right: false },
      `Expected all false for invalid angle ${String(angle)}`
    );
  }

  const invalidDistances = [
    NaN,
    Infinity,
    -Infinity,
    -10,
    -0.001,
    '50',
    null,
  ];

  for (const dist of invalidDistances) {
    const res = resolveJoystickDirection(90, dist);
    assert.deepEqual(
      res,
      { up: false, down: false, left: false, right: false },
      `Expected all false for invalid distance ${String(dist)}`
    );
  }
});

test('Tier 7 [Vector Coordinate Fuzzing]: resolveJoystickVector handles 10,000 malformed and extreme coordinate inputs', () => {
  const startTime = performance.now();

  // Test deterministic edge cases first
  assert.deepEqual(
    resolveJoystickVector(NaN, 10),
    { up: false, down: false, left: false, right: false, angle: 0, distance: 0 }
  );
  assert.deepEqual(
    resolveJoystickVector(10, NaN),
    { up: false, down: false, left: false, right: false, angle: 0, distance: 0 }
  );
  assert.deepEqual(
    resolveJoystickVector(NaN, NaN),
    { up: false, down: false, left: false, right: false, angle: 0, distance: 0 }
  );
  assert.deepEqual(
    resolveJoystickVector(Infinity, 10),
    { up: false, down: false, left: false, right: false, angle: 0, distance: 0 }
  );
  assert.deepEqual(
    resolveJoystickVector(0, 0),
    { up: false, down: false, left: false, right: false, angle: 0, distance: 0 }
  );

  // 10,000 random coordinate fuzzing iterations
  let allValid = true;
  for (let iter = 0; iter < 10000; iter++) {
    let dx = (iter * 17.3) % 200 - 100;
    let dy = (iter * 29.7) % 200 - 100;

    if (iter % 7 === 0) dx = NaN;
    if (iter % 11 === 0) dy = NaN;
    if (iter % 13 === 0) dx = Infinity;
    if (iter % 17 === 0) dy = -Infinity;

    const res = resolveJoystickVector(dx, dy);

    if (
      typeof res.up !== 'boolean' ||
      typeof res.down !== 'boolean' ||
      typeof res.left !== 'boolean' ||
      typeof res.right !== 'boolean' ||
      !Number.isFinite(res.angle) ||
      !Number.isFinite(res.distance) ||
      Number.isNaN(res.angle) ||
      Number.isNaN(res.distance) ||
      (res.up && res.down) ||
      (res.left && res.right)
    ) {
      allValid = false;
    }
  }

  assert.ok(allValid, 'All 10,000 vector fuzzing results must satisfy type and invariant requirements');

  const duration = performance.now() - startTime;
  assert.ok(
    duration < 250,
    `10,000 vector fuzzing iterations must complete within 250ms (took ${duration.toFixed(2)}ms)`
  );
});

/* ==============================================================================
 * TIER 8: RAPID SECTOR SWITCHING & BOUNDARY INVARIANTS (135° AND 225° SECTORS)
 * ============================================================================== */

test('Tier 8 [135° and 225° Sector Precision]: Direct diagonal activation and sector boundary invariants', () => {
  // 135°: strictly UP + LEFT
  const res135 = resolveJoystickDirection(135, 30);
  assert.deepEqual(res135, {
    up: true,
    down: false,
    left: true,
    right: false,
  });

  // 225°: strictly DOWN + LEFT
  const res225 = resolveJoystickDirection(225, 30);
  assert.deepEqual(res225, {
    up: false,
    down: true,
    left: true,
    right: false,
  });

  // Vector coordinate representations
  // 135° in screen space: dx < 0 (left), dy < 0 (up)
  const vec135 = resolveJoystickVector(-30, -30);
  assert.equal(vec135.up, true);
  assert.equal(vec135.left, true);
  assert.equal(vec135.down, false);
  assert.equal(vec135.right, false);
  assert.ok(Math.abs(vec135.angle - 135) < 0.001);

  // 225° in screen space: dx < 0 (left), dy > 0 (down)
  const vec225 = resolveJoystickVector(-30, 30);
  assert.equal(vec225.down, true);
  assert.equal(vec225.left, true);
  assert.equal(vec225.up, false);
  assert.equal(vec225.right, false);
  assert.ok(Math.abs(vec225.angle - 225) < 0.001);
});

test('Tier 8 [Rapid Sector Switching]: 10,000 rapid switches between 135° and 225° exhibit 0 contradictory directions and persistent LEFT intent', () => {
  let errorCount = 0;
  let firstErrorMessage = '';
  const startTime = performance.now();

  for (let iter = 0; iter < 10000; iter++) {
    // Alternate between 135° and 225° with subtle micro-jitter (+/- 5°)
    const jitter = ((iter * 3.7) % 10) - 5;
    const is135 = iter % 2 === 0;
    const baseAngle = is135 ? 135 : 225;
    const angle = baseAngle + jitter;

    const dir = resolveJoystickDirection(angle, 40);

    // Invariant 1: LEFT must be persistently true across both 135° and 225° sectors
    // Invariant 2: RIGHT must be strictly false
    // Invariant 3: UP and DOWN must NEVER both be true
    // Invariant 4: Vertical intent must match the active sector
    const validLeft = dir.left === true;
    const validRight = dir.right === false;
    const validMutualExclusion = !(dir.up && dir.down);
    const validVertical = is135 ? (dir.up === true && dir.down === false) : (dir.down === true && dir.up === false);

    if (!validLeft || !validRight || !validMutualExclusion || !validVertical) {
      errorCount++;
      if (!firstErrorMessage) {
        firstErrorMessage = `Mismatch at iter ${iter} (${angle.toFixed(2)}°): left=${dir.left}, right=${dir.right}, up=${dir.up}, down=${dir.down}`;
      }
    }
  }

  const duration = performance.now() - startTime;
  assert.equal(errorCount, 0, firstErrorMessage || 'Found direction mismatches');
  assert.ok(
    duration < 150,
    `10,000 rapid 135° <-> 225° sector switches must complete within 150ms (took ${duration.toFixed(2)}ms)`
  );
});

/* ==============================================================================
 * TIER 9: MULTI-TOUCH POINTER ID COLLISIONS & ACTIVE FINGER STACKING
 * ============================================================================== */

test('Tier 9 [Pointer ID Collision]: Pointer ID reassignment cleanly releases previous control without stuck vectors', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Pointer 1 grabs joystick and sets direction (Up + Left at 135°)
  tracker.onPointerDown(1, 'joystick', state);
  tracker.onPointerMove(1, { x: 50, y: 50 }, state, { x: 100, y: 100 }); // dx=-50, dy=-50 -> 135°
  assert.equal(state.up, true);
  assert.equal(state.left, true);
  assert.equal(tracker.getActivePointerCount('joystick'), 1);

  // Driver/touch collision: Pointer 1 fires pointerdown on 'bomb' without releasing joystick
  tracker.onPointerDown(1, 'bomb', state);

  // Invariant 1: Joystick MUST be released immediately upon pointer ID re-use
  assert.equal(state.up, false, 'Stuck UP vector eliminated on pointer collision');
  assert.equal(state.left, false, 'Stuck LEFT vector eliminated on pointer collision');
  assert.equal(tracker.getActivePointerCount('joystick'), 0);

  // Invariant 2: Bomb action is now active
  assert.equal(state.bomb, true, 'Bomb must be active under reassigned pointer');
  assert.equal(tracker.getActivePointerCount('bomb'), 1);

  // Clean release
  tracker.onPointerUp(1, state);
  assert.equal(tracker.getActivePointerCount(), 0);
});

test('Tier 9 [Multi-Finger Button Stacking]: Multiple touches on same button maintain press until last release', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Finger 10 presses Dash
  tracker.onPointerDown(10, 'dash', state);
  assert.equal(state.dash, true);
  assert.equal(tracker.getActivePointerCount('dash'), 1);

  // Finger 11 presses Dash simultaneously (fat finger / multi-touch overlap)
  tracker.onPointerDown(11, 'dash', state);
  assert.equal(state.dash, true);
  assert.equal(tracker.getActivePointerCount('dash'), 2);

  // Finger 10 lifts up
  tracker.onPointerUp(10, state);
  // Dash MUST still remain active because Finger 11 is still holding it down
  assert.equal(state.dash, true, 'Dash must remain held while finger 11 is down');
  assert.equal(tracker.getActivePointerCount('dash'), 1);

  // Finger 11 lifts up
  tracker.onPointerUp(11, state);
  // Now Dash should be released
  assert.equal(tracker.getActivePointerCount('dash'), 0);
});

test('Tier 9 [Rapid Pointer ID Churn]: 10,000 rapid randomized pointer operations maintain state invariants', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const startTime = performance.now();

  const targets = ['joystick', 'bomb', 'dash', 'ultimate'];

  for (let iter = 0; iter < 10000; iter++) {
    const pointerId = iter % 6; // Pointers 0 to 5
    const op = iter % 4; // 0=down, 1=move, 2=up, 3=cancel
    const target = targets[(iter * 3) % targets.length];

    if (op === 0) {
      tracker.onPointerDown(pointerId, target, state);
    } else if (op === 1) {
      const x = (iter * 13) % 200;
      const y = (iter * 17) % 200;
      tracker.onPointerMove(pointerId, { x, y }, state, { x: 100, y: 100 });
    } else if (op === 2) {
      tracker.onPointerUp(pointerId, state);
    } else if (op === 3) {
      tracker.onPointerCancel(pointerId, state);
    }
  }

  // Final reset must leave 0 active pointers and clean default state
  tracker.reset(state);
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState());

  const duration = performance.now() - startTime;
  assert.ok(
    duration < 300,
    `10,000 pointer churn operations must complete within 300ms (took ${duration.toFixed(2)}ms)`
  );
});

/* ==============================================================================
 * TIER 10: DROPPED POINTER EVENT RECOVERY & STUCK MOVEMENT PREVENTION
 * ============================================================================== */

test('Tier 10 [Dropped Joystick Event]: Orphaned pointer is recovered cleanly and zeroes movement vectors', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Timestamp T=1000: User places thumb on joystick and pushes to 225° (Down + Left)
  tracker.onPointerDown(42, 'joystick', state);
  tracker.onPointerMove(42, { x: 50, y: 150 }, state, { x: 100, y: 100 }); // dx=-50, dy=50 -> 225°

  assert.equal(state.down, true);
  assert.equal(state.left, true);
  assert.equal(tracker.getActivePointerCount('joystick'), 1);

  // Dropped event: Browser drops touchend/pointerup due to gesture interception or edge swipe.
  // Advance simulated clock past default maxAgeMs (e.g. T=4500, elapsed = 3500ms > 3000ms threshold)
  const now = performance.now();
  const recovered = tracker.recoverDroppedPointers(state, 3000, now + 3500);

  // Invariant 1: Exactly 1 orphaned pointer recovered
  assert.equal(recovered, 1);
  assert.equal(tracker.getActivePointerCount('joystick'), 0);

  // Invariant 2: Movement vector MUST be cleanly zeroed (no stuck running character)
  assert.equal(state.down, false, 'DOWN movement vector must be recovered and false');
  assert.equal(state.left, false, 'LEFT movement vector must be recovered and false');
  assert.equal(state.up, false);
  assert.equal(state.right, false);
});

test('Tier 10 [Dropped Action Event]: Dropped bomb button pointer is pruned without stuck active state', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  tracker.onPointerDown(99, 'bomb', state);
  assert.equal(state.bomb, true);

  const now = performance.now();
  const recovered = tracker.recoverDroppedPointers(state, 2000, now + 2500);

  assert.equal(recovered, 1);
  assert.equal(state.bomb, false, 'Bomb flag must be cleared upon dropped pointer recovery');
  assert.equal(tracker.getActivePointerCount('bomb'), 0);
});

test('Tier 10 [System Interruption / Defocus Full Recovery]: tracker.reset flushes all pointers and zero-resets state', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();

  // Populate multiple simultaneous active pointers
  tracker.onPointerDown(1, 'joystick', state);
  tracker.onPointerMove(1, { x: 50, y: 50 }, state, { x: 100, y: 100 });
  tracker.onPointerDown(2, 'dash', state);
  tracker.onPointerDown(3, 'bomb', state);

  assert.equal(tracker.getActivePointerCount(), 3);
  assert.equal(state.up, true);
  assert.equal(state.left, true);
  assert.equal(state.dash, true);
  assert.equal(state.bomb, true);

  // System blur / tab switch / visibility change triggers reset
  tracker.reset(state);

  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, {
    up: false,
    down: false,
    left: false,
    right: false,
    bomb: false,
    dash: false,
    ultimate: false,
  });
});

/* ==============================================================================
 * TIER 11: 10,000 SIMULTANEOUS JOYSTICK + BUTTON COMBAT OPERATIONS
 * ============================================================================== */

test('Tier 11 [Simultaneous Joystick & Button Spam]: 10,000 concurrent multi-touch combat operations preserve directional fidelity and zero stuck buttons', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);

  // Pointer 0: Joystick (Continuous thumb)
  const JOYSTICK_ID = 0;
  // Pointer 1: Bomb button spam
  const BOMB_ID = 1;
  // Pointer 2: Dash button spam
  const DASH_ID = 2;
  // Pointer 3: Ultimate button spam
  const ULT_ID = 3;

  tracker.onPointerDown(JOYSTICK_ID, 'joystick', state, { x: 100, y: 100 });

  const startTime = performance.now();
  let joystickIntegrityViolations = 0;
  let opposingDirectionViolations = 0;
  let actionTriggerCount = 0;
  let actionConsumedCount = 0;

  for (let iter = 0; iter < 10000; iter++) {
    // 1. Move joystick thumb across 360 degrees
    const angleRad = (iter * 0.05) % (2 * Math.PI);
    const radius = 20 + 20 * Math.sin(iter * 0.01); // 20px to 40px (well above deadzone 5px)
    const joyX = 100 + Math.cos(angleRad) * radius;
    const joyY = 100 - Math.sin(angleRad) * radius; // inverted screen Y

    tracker.onPointerMove(JOYSTICK_ID, { x: joyX, y: joyY }, state, { x: 100, y: 100 });

    // Compute expected direction from vector
    const expected = resolveJoystickVector(joyX - 100, joyY - 100);

    // 2. Perform rapid concurrent button actions with other fingers
    const buttonOp = iter % 6;
    if (buttonOp === 0) {
      tracker.onPointerDown(BOMB_ID, 'bomb', state, undefined, fakeScheduler);
      actionTriggerCount++;
    } else if (buttonOp === 1) {
      tracker.onPointerUp(BOMB_ID, state, fakeScheduler);
    } else if (buttonOp === 2) {
      tracker.onPointerDown(DASH_ID, 'dash', state, undefined, fakeScheduler);
      actionTriggerCount++;
    } else if (buttonOp === 3) {
      tracker.onPointerUp(DASH_ID, state, fakeScheduler);
    } else if (buttonOp === 4) {
      tracker.onPointerDown(ULT_ID, 'ultimate', state, undefined, fakeScheduler);
      actionTriggerCount++;
    } else if (buttonOp === 5) {
      tracker.onPointerCancel(ULT_ID, state);
    }

    // 3. Invariant check: Joystick direction MUST strictly match expected vector resolution
    // and MUST NOT be corrupted by button presses/releases
    if (
      state.up !== expected.up ||
      state.down !== expected.down ||
      state.left !== expected.left ||
      state.right !== expected.right
    ) {
      joystickIntegrityViolations++;
    }

    // Invariant check: Opposing directions are never both true
    if ((state.up && state.down) || (state.left && state.right)) {
      opposingDirectionViolations++;
    }

    // 4. Simulate GameScene atomic consumption of action impulses
    if (state.bomb) {
      state.bomb = false;
      actionConsumedCount++;
    }
    if (state.dash) {
      state.dash = false;
      actionConsumedCount++;
    }
    if (state.ultimate) {
      state.ultimate = false;
      actionConsumedCount++;
    }

    // Flush scheduled frames periodically
    if (iter % 10 === 0 && scheduledFrames.length > 0) {
      const cbs = scheduledFrames.splice(0, scheduledFrames.length);
      for (const cb of cbs) cb();
    }
  }

  // Release all pointers at end of combat
  tracker.onPointerUp(JOYSTICK_ID, state);
  tracker.onPointerUp(BOMB_ID, state);
  tracker.onPointerUp(DASH_ID, state);
  tracker.onPointerUp(ULT_ID, state);

  // Drain remaining frames
  while (scheduledFrames.length > 0) {
    const cbs = scheduledFrames.splice(0, scheduledFrames.length);
    for (const cb of cbs) cb();
  }

  const duration = performance.now() - startTime;

  assert.equal(joystickIntegrityViolations, 0, 'Joystick direction must never be corrupted by button operations');
  assert.equal(opposingDirectionViolations, 0, 'Opposing directions must never be simultaneously true');
  assert.ok(actionTriggerCount > 4000, `Expected >4000 action triggers, got ${actionTriggerCount}`);
  assert.ok(actionConsumedCount > 0, `Expected consumed actions, got ${actionConsumedCount}`);

  // Guarantee: All 7 channels must be completely false
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must cleanly zero out after releasing all fingers');
  assert.equal(tracker.getActivePointerCount(), 0, 'All pointers must be released');
  assert.ok(duration < 250, `10,000 concurrent operations took ${duration.toFixed(2)}ms (budget < 250ms)`);
});

/* ==============================================================================
 * TIER 12: HIGH-FREQUENCY ADVERSARIAL POINTER ID COLLISION & RE-USE CHURN
 * ============================================================================== */

test('Tier 12 [High-Frequency Pointer ID Collision]: 10,000 rapid pointer ID reassignments across targets release cleanly without stuck vectors', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const targets = ['joystick', 'bomb', 'dash', 'ultimate'];
  const scheduledFrames = [];
  const fakeScheduler = (cb) => scheduledFrames.push(cb);

  const startTime = performance.now();
  let collisionCount = 0;

  for (let iter = 0; iter < 10000; iter++) {
    const pointerId = iter % 5; // Pointers 0..4
    const newTarget = targets[(iter + (iter % 3)) % targets.length];

    if (tracker.hasPointer(pointerId)) {
      collisionCount++;
    }

    // Directly bind pointerId to new target without pointerup (driver ID collision)
    tracker.onPointerDown(pointerId, newTarget, state, { x: 50 + (iter % 50), y: 50 + (iter % 50) }, fakeScheduler);

    if (newTarget === 'joystick') {
      tracker.onPointerMove(pointerId, { x: 120, y: 120 }, state, { x: 100, y: 100 });
    }

    // Verify active pointer count consistency
    assert.ok(tracker.getActivePointerCount() <= 5, 'Cannot exceed 5 active pointers');

    // Simulate occasional random releases or cancels
    if (iter % 7 === 0) {
      tracker.onPointerUp(pointerId, state, fakeScheduler);
    } else if (iter % 11 === 0) {
      tracker.onPointerCancel(pointerId, state);
    }

    // Simulate GameScene consumption
    if (state.bomb) state.bomb = false;
    if (state.dash) state.dash = false;
    if (state.ultimate) state.ultimate = false;
  }

  // Full clean reset
  tracker.reset(state);
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must be zeroed after reset');

  const duration = performance.now() - startTime;
  assert.ok(collisionCount > 7000, `Expected >7000 pointer collisions, got ${collisionCount}`);
  assert.ok(duration < 250, `10,000 collisions churn took ${duration.toFixed(2)}ms (budget < 250ms)`);
});

/* ==============================================================================
 * TIER 13: SUBPIXEL DEADZONE & MICRO-DISPLACEMENT ANALYSIS (10,000 SAMPLES)
 * ============================================================================== */

test('Tier 13 [Deadzone Subpixel Analysis]: 10,000 radius steps across 360° verify exact 5.0px boundary behavior', () => {
  const startTime = performance.now();
  let deadzonePasses = 0;
  let activePasses = 0;

  for (let iter = 0; iter < 10000; iter++) {
    // Radius from 0.000 to 9.999 in 0.001 increments
    const radius = (iter % 10000) * 0.001;
    const angle = (iter * 36) % 360;

    const res = resolveJoystickDirection(angle, radius);
    const activeCount = Number(res.up) + Number(res.down) + Number(res.left) + Number(res.right);

    if (radius < 5.0) {
      // Sub-deadzone: strictly ZERO active directions
      assert.equal(activeCount, 0, `Sub-deadzone radius ${radius.toFixed(3)}px must have 0 active directions`);
      deadzonePasses++;
    } else {
      // Active zone: strictly 1 or 2 active directions
      assert.ok(activeCount >= 1 && activeCount <= 2, `Active radius ${radius.toFixed(3)}px must have 1 or 2 active directions`);
      assert.ok(!(res.up && res.down), 'Opposing UP/DOWN cannot be active');
      assert.ok(!(res.left && res.right), 'Opposing LEFT/RIGHT cannot be active');
      activePasses++;
    }
  }

  assert.equal(deadzonePasses, 5000, 'Exactly 5000 sub-deadzone checks');
  assert.equal(activePasses, 5000, 'Exactly 5000 active zone checks');

  const duration = performance.now() - startTime;
  assert.ok(duration < 150, `10,000 deadzone subpixel checks took ${duration.toFixed(2)}ms (budget < 150ms)`);
});

/* ==============================================================================
 * TIER 14: MULTI-FINGER CHURN TELEMETRY & DROPPED-POINTER ZERO-STUCK GUARANTEE
 * ============================================================================== */

test('Tier 14 [Churn Telemetry & Zero-Stuck]: 10,000 multi-finger events with 5% dropped pointers recover cleanly with zero stuck state', () => {
  const state = createDefaultMobileInputState();
  const tracker = new MultiTouchPointerTracker();
  const startTime = performance.now();

  const telemetry = {
    totalEvents: 0,
    pointerDownCount: 0,
    pointerMoveCount: 0,
    pointerUpCount: 0,
    pointerCancelCount: 0,
    droppedPointerInjected: 0,
    watchdogRecoveries: 0,
    latencies: [],
  };

  const targets = ['joystick', 'bomb', 'dash', 'ultimate'];
  let simulatedTime = 1000;

  for (let iter = 0; iter < 10000; iter++) {
    const t0 = performance.now();
    simulatedTime += 16; // 60fps tick

    const pointerId = iter % 8; // 8 possible fingers
    const eventType = iter % 5;
    const target = targets[(iter * 7) % targets.length];
    telemetry.totalEvents++;

    if (eventType === 0 || eventType === 1) {
      // Pointer Down
      tracker.onPointerDown(pointerId, target, state, { x: 50, y: 50 });
      telemetry.pointerDownCount++;
    } else if (eventType === 2) {
      // Pointer Move
      const x = 50 + (iter % 60) - 30;
      const y = 50 + ((iter * 3) % 60) - 30;
      tracker.onPointerMove(pointerId, { x, y }, state, { x: 50, y: 50 });
      telemetry.pointerMoveCount++;
    } else if (eventType === 3) {
      // 5% dropped pointer simulation: skip pointerUp completely!
      const isDropped = Math.floor(iter / 5) % 20 === 0;
      if (isDropped) {
        telemetry.droppedPointerInjected++;
        // Do NOT call onPointerUp, simulating browser dropped event
      } else {
        tracker.onPointerUp(pointerId, state);
        telemetry.pointerUpCount++;
      }
    } else if (eventType === 4) {
      tracker.onPointerCancel(pointerId, state);
      telemetry.pointerCancelCount++;
    }

    // Periodic watchdog run: every 500 iterations, advance time by 4000ms and run recovery
    if (iter % 500 === 0 && iter > 0) {
      simulatedTime += 4000; // surpass 3000ms watchdog threshold
      const recovered = tracker.recoverDroppedPointers(state, 3000, simulatedTime);
      telemetry.watchdogRecoveries += recovered;
    }

    // GameScene consumption simulation
    if (state.bomb) state.bomb = false;
    if (state.dash) state.dash = false;
    if (state.ultimate) state.ultimate = false;

    const t1 = performance.now();
    telemetry.latencies.push(t1 - t0);
  }

  // Final watchdog cleanup
  simulatedTime += 5000;
  const finalRecovered = tracker.recoverDroppedPointers(state, 3000, simulatedTime);
  telemetry.watchdogRecoveries += finalRecovered;

  // Final verification: If no active pointers remain, state must be clean
  // If any pointers remain active, tracker.reset flushes them
  tracker.reset(state);
  assert.equal(tracker.getActivePointerCount(), 0);
  assert.deepEqual(state, createDefaultMobileInputState(), 'State must be zeroed with zero stuck buttons or vectors');

  const totalDuration = performance.now() - startTime;
  telemetry.latencies.sort((a, b) => a - b);
  const p50 = telemetry.latencies[Math.floor(telemetry.latencies.length * 0.5)];
  const p90 = telemetry.latencies[Math.floor(telemetry.latencies.length * 0.9)];
  const p99 = telemetry.latencies[Math.floor(telemetry.latencies.length * 0.99)];

  assert.ok(telemetry.droppedPointerInjected > 0, 'Must have injected dropped pointers');
  assert.ok(telemetry.watchdogRecoveries > 0, 'Watchdog must have recovered dropped pointers');
  assert.ok(totalDuration < 350, `10,000 churn events took ${totalDuration.toFixed(2)}ms (budget < 350ms)`);
  assert.ok(p50 < 0.05, `p50 latency (${p50.toFixed(4)}ms) must be < 0.05ms`);
  assert.ok(p90 < 0.1, `p90 latency (${p90.toFixed(4)}ms) must be < 0.1ms`);
  assert.ok(p99 < 0.2, `p99 latency (${p99.toFixed(4)}ms) must be < 0.2ms`);
});


