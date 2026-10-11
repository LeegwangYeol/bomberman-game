import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultMobileInputState,
  resolveJoystickDirection,
  resolveJoystickVector,
  MultiTouchPointerTracker,
} from '../src/game/input_state.ts';

/* ==============================================================================
 * DEADZONE BOUNDARY TOLERANCE & (3, 4) ZERO-JITTER VERIFICATION SUITE
 * ============================================================================== */

test('Boundary Tolerance 1.1: Exact Pythagorean (3, 4) boundary points resolve with ZERO dropped inputs', () => {
  // Pythagorean triples with hypotenuse = 5 (3^2 + 4^2 = 25)
  // In screen coordinates: positive dy is downward, negative dy is upward
  const boundaryCases = [
    { dx: 3, dy: 4, expected: { up: false, down: true, left: false, right: true }, name: '(3, 4) Down-Right' },
    { dx: 3, dy: -4, expected: { up: true, down: false, left: false, right: true }, name: '(3, -4) Up-Right' },
    { dx: -3, dy: 4, expected: { up: false, down: true, left: true, right: false }, name: '(-3, 4) Down-Left' },
    { dx: -3, dy: -4, expected: { up: true, down: false, left: true, right: false }, name: '(-3, -4) Up-Left' },
    { dx: 4, dy: 3, expected: { up: false, down: true, left: false, right: true }, name: '(4, 3) Down-Right' },
    { dx: 4, dy: -3, expected: { up: true, down: false, left: false, right: true }, name: '(4, -3) Up-Right' },
    { dx: -4, dy: 3, expected: { up: false, down: true, left: true, right: false }, name: '(-4, 3) Down-Left' },
    { dx: -4, dy: -3, expected: { up: true, down: false, left: true, right: false }, name: '(-4, -3) Up-Left' },
    { dx: 0, dy: 5, expected: { up: false, down: true, left: false, right: false }, name: '(0, 5) Cardinal Down' },
    { dx: 0, dy: -5, expected: { up: true, down: false, left: false, right: false }, name: '(0, -5) Cardinal Up' },
    { dx: 5, dy: 0, expected: { up: false, down: false, left: false, right: true }, name: '(5, 0) Cardinal Right' },
    { dx: -5, dy: 0, expected: { up: false, down: false, left: true, right: false }, name: '(-5, 0) Cardinal Left' },
  ];

  for (const { dx, dy, expected, name } of boundaryCases) {
    const res = resolveJoystickVector(dx, dy, 5.0);
    assert.equal(res.distance, 5.0, `${name}: distance must be exactly 5.0`);
    assert.deepEqual(
      { up: res.up, down: res.down, left: res.left, right: res.right },
      expected,
      `${name}: must resolve to expected directional state without dropping`
    );

    const activeCount = Number(res.up) + Number(res.down) + Number(res.left) + Number(res.right);
    assert.ok(activeCount >= 1 && activeCount <= 2, `${name}: must have 1 or 2 active directions`);
    assert.ok(!(res.up && res.down), `${name}: UP and DOWN must not be active simultaneously`);
    assert.ok(!(res.left && res.right), `${name}: LEFT and RIGHT must not be active simultaneously`);
  }
});

test('Boundary Tolerance 1.2: 10,000 micro-noise steps around (3, 4) verify ZERO jitter and ZERO input drops', () => {
  const baseDx = 3.0;
  const baseDy = 4.0;
  let sampleCount = 0;

  for (let i = 0; i < 10000; i++) {
    // Inject micro-epsilon noise between -1e-12 and +1e-12
    const noiseX = (Math.sin(i * 1.7) * 1e-12);
    const noiseY = (Math.cos(i * 2.3) * 1e-12);
    const dx = baseDx + noiseX;
    const dy = baseDy + noiseY;

    const res = resolveJoystickVector(dx, dy, 5.0);
    assert.equal(res.up, false, `Iter ${i}: UP must be false`);
    assert.equal(res.down, true, `Iter ${i}: DOWN must be true (zero jitter)`);
    assert.equal(res.left, false, `Iter ${i}: LEFT must be false`);
    assert.equal(res.right, true, `Iter ${i}: RIGHT must be true (zero jitter)`);
    sampleCount++;
  }

  assert.equal(sampleCount, 10000, 'All 10,000 micro-noise samples must maintain strictly solid state');
});

test('Boundary Tolerance 1.3: 36,000 fine-angle boundary points on exact R = 5.0 circle have ZERO dropped inputs', () => {
  let droppedVectorCount = 0;
  let droppedDirectionCount = 0;

  for (let deg = 0; deg < 360; deg += 0.01) {
    const rad = (deg * Math.PI) / 180;
    const dx = 5.0 * Math.cos(rad);
    const dy = -5.0 * Math.sin(rad); // Screen coordinates

    // Test resolveJoystickVector
    const vecRes = resolveJoystickVector(dx, dy, 5.0);
    const vecActive = Number(vecRes.up) + Number(vecRes.down) + Number(vecRes.left) + Number(vecRes.right);
    if (vecActive === 0) {
      droppedVectorCount++;
    }

    // Test resolveJoystickDirection with computed distance
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirRes = resolveJoystickDirection(deg, dist);
    const dirActive = Number(dirRes.up) + Number(dirRes.down) + Number(dirRes.left) + Number(dirRes.right);
    if (dirActive === 0) {
      droppedDirectionCount++;
    }
  }

  assert.equal(droppedVectorCount, 0, 'resolveJoystickVector must have 0 dropped inputs on R=5.0 boundary');
  assert.equal(droppedDirectionCount, 0, 'resolveJoystickDirection must have 0 dropped inputs on R=5.0 boundary');
});

test('Boundary Tolerance 1.4: MultiTouchPointerTracker with (3, 4) boundary coordinates maintains active state', () => {
  const tracker = new MultiTouchPointerTracker();
  const state = createDefaultMobileInputState();

  // Pointerdown at joystick origin (200, 200)
  tracker.onPointerDown(10, 'joystick', state, { x: 200, y: 200 });

  // Move exactly to (203, 204) -> dx = 3, dy = 4 (boundary radius 5.0)
  tracker.onPointerMove(10, { x: 203, y: 204 }, state, { x: 200, y: 200 });
  assert.equal(state.down, true, 'DOWN must be active at (3, 4) boundary');
  assert.equal(state.right, true, 'RIGHT must be active at (3, 4) boundary');
  assert.equal(state.up, false, 'UP must be false');
  assert.equal(state.left, false, 'LEFT must be false');

  // Soak 1,000 frames at (203, 204) to verify zero state decay or jitter
  for (let f = 0; f < 1000; f++) {
    tracker.onPointerMove(10, { x: 203, y: 204 }, state, { x: 200, y: 200 });
    assert.equal(state.down, true);
    assert.equal(state.right, true);
  }

  // Move to (-3, -4) -> dx = -3, dy = -4 -> Up-Left
  tracker.onPointerMove(10, { x: 197, y: 196 }, state, { x: 200, y: 200 });
  assert.equal(state.up, true, 'UP must be active at (-3, -4) boundary');
  assert.equal(state.left, true, 'LEFT must be active at (-3, -4) boundary');
  assert.equal(state.down, false, 'DOWN must be false');
  assert.equal(state.right, false, 'RIGHT must be false');

  // Move back into deadzone (dx = 1, dy = 1, distSq = 2 < 25 - 1e-7)
  tracker.onPointerMove(10, { x: 201, y: 201 }, state, { x: 200, y: 200 });
  assert.equal(state.up, false, 'Inside deadzone must reset UP');
  assert.equal(state.down, false, 'Inside deadzone must reset DOWN');
  assert.equal(state.left, false, 'Inside deadzone must reset LEFT');
  assert.equal(state.right, false, 'Inside deadzone must reset RIGHT');
});

test('Boundary Tolerance 1.5: Strict separation between sub-deadzone rejection and boundary acceptance', () => {
  // Test points slightly inside deadzone vs on boundary vs slightly outside
  // Inside: radius 4.999px -> distSq ~ 24.990 < 25 - 1e-7 -> MUST be inactive
  const insideRes = resolveJoystickVector(3.0 * (4.999 / 5.0), 4.0 * (4.999 / 5.0), 5.0);
  const insideActive = Number(insideRes.up) + Number(insideRes.down) + Number(insideRes.left) + Number(insideRes.right);
  assert.equal(insideActive, 0, 'Sub-deadzone point (4.999px) must be 100% inactive');

  // Exactly on boundary: radius 5.000px -> (3, 4) -> MUST be active
  const boundaryRes = resolveJoystickVector(3.0, 4.0, 5.0);
  const boundaryActive = Number(boundaryRes.up) + Number(boundaryRes.down) + Number(boundaryRes.left) + Number(boundaryRes.right);
  assert.equal(boundaryActive, 2, 'Boundary point (5.000px) must be active (2 directions)');

  // Outside: radius 5.001px -> MUST be active
  const outsideRes = resolveJoystickVector(3.0 * (5.001 / 5.0), 4.0 * (5.001 / 5.0), 5.0);
  const outsideActive = Number(outsideRes.up) + Number(outsideRes.down) + Number(outsideRes.left) + Number(outsideRes.right);
  assert.equal(outsideActive, 2, 'Outside deadzone point (5.001px) must be active (2 directions)');
});
