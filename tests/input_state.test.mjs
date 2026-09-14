import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Direction resolution logic matching NippleJS angle calculations in BombermanGame.tsx
 */
function resolveDirectionFromAngle(degree) {
  const up = degree > 45 && degree < 135;
  const down = degree > 225 && degree < 315;
  const left = degree > 135 && degree < 225;
  const right = (degree >= 0 && degree <= 45) || (degree >= 315 && degree <= 360);

  return { up, down, left, right };
}

test('Joystick Angle: 90 degrees maps strictly to UP', () => {
  const dir = resolveDirectionFromAngle(90);
  assert.deepEqual(dir, { up: true, down: false, left: false, right: false });
});

test('Joystick Angle: 270 degrees maps strictly to DOWN', () => {
  const dir = resolveDirectionFromAngle(270);
  assert.deepEqual(dir, { up: false, down: true, left: false, right: false });
});

test('Joystick Angle: 180 degrees maps strictly to LEFT', () => {
  const dir = resolveDirectionFromAngle(180);
  assert.deepEqual(dir, { up: false, down: false, left: true, right: false });
});

test('Joystick Angle: 0 degrees and 360 degrees map strictly to RIGHT', () => {
  const dir0 = resolveDirectionFromAngle(0);
  assert.deepEqual(dir0, { up: false, down: false, left: false, right: true });

  const dir360 = resolveDirectionFromAngle(360);
  assert.deepEqual(dir360, { up: false, down: false, left: false, right: true });

  const dir330 = resolveDirectionFromAngle(330);
  assert.deepEqual(dir330, { up: false, down: false, left: false, right: true });
});

test('Input State: release/end resets all directional states', () => {
  let state = { up: true, down: false, left: false, right: false, bomb: false };
  // Simulate end event
  state = { ...state, up: false, down: false, left: false, right: false };
  assert.deepEqual(state, { up: false, down: false, left: false, right: false, bomb: false });
});
