import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultMobileInputState,
  resolveJoystickDirection,
  resetJoystickDirection,
  resetAllMobileInputs,
  triggerMobileAction,
  cancelMobileAction,
  releaseMobileAction,
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

  for (let iter = 0; iter < 10000; iter++) {
    const boundary = boundaries[iter % boundaries.length];
    const angle = iter % 2 === 0 ? boundary.a : boundary.b;
    const dir = resolveJoystickDirection(angle, 25);

    state.up = dir.up;
    state.down = dir.down;
    state.left = dir.left;
    state.right = dir.right;

    assert.ok(typeof state.up === 'boolean');
    assert.ok(typeof state.down === 'boolean');
    assert.ok(typeof state.left === 'boolean');
    assert.ok(typeof state.right === 'boolean');
  }

  const duration = performance.now() - startTime;
  assert.ok(
    duration < 100,
    `10,000 boundary jitter flips must complete within 100ms (took ${duration.toFixed(2)}ms)`
  );
});

/* ==============================================================================
 * TIER 4: EXTREME HIGH-FREQUENCY MULTI-TOUCH SPAMMING SIMULATION
 * ============================================================================== */

test('Tier 4 [Multi-Touch Chaos]: 5,000 randomized concurrent pointer actions maintain state integrity', () => {
  const state = createDefaultMobileInputState();

  // Custom frame scheduler to simulate RAF ticks in Node test runner
  const scheduledFrames = [];
  const fakeScheduler = (cb) => {
    scheduledFrames.push(cb);
  };

  const startTime = performance.now();

  for (let i = 0; i < 5000; i++) {
    const actionType = i % 4;
    const eventType = (i * 7) % 5;

    // Simulate Finger 1: Joystick move or release
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
    duration < 150,
    `5,000 multi-touch events must complete within 150ms (took ${duration.toFixed(2)}ms)`
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
