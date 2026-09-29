/**
 * Centralized Mobile & Touch Input State Management
 * Provides robust direction resolution, deadzone handling, zero-deadzone 8-way sector mapping,
 * and frame-synchronized fallback clearing to prevent stuck keys and input drops.
 */

export interface MobileInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  bomb: boolean;
  dash: boolean;
  ultimate: boolean;
}

/**
 * Creates a clean, zeroed MobileInputState object.
 */
export function createDefaultMobileInputState(): MobileInputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    bomb: false,
    dash: false,
    ultimate: false,
  };
}

/**
 * Multi-directional angle partitioning with 8-way sector coverage.
 * Resolves 360-degree joystick inputs without dead zones at 135° / 225° / 45° / 315°.
 *
 * @param angle Raw angle degree from NippleJS or touch event.
 * @param distance Optional distance/magnitude; if distance < 5 (deadzone), resets all directions.
 */
export function resolveJoystickDirection(
  angle: number,
  distance?: number
): { up: boolean; down: boolean; left: boolean; right: boolean } {
  if (distance !== undefined && distance < 5) {
    return { up: false, down: false, left: false, right: false };
  }
  const norm = ((angle % 360) + 360) % 360;
  return {
    up: norm >= 22.5 && norm <= 157.5,
    down: norm >= 202.5 && norm <= 337.5,
    left: norm >= 112.5 && norm <= 247.5,
    right: norm <= 67.5 || norm >= 292.5,
  };
}

/**
 * Resets directional movement flags on the given state in-place.
 */
export function resetJoystickDirection(state: MobileInputState): void {
  state.up = false;
  state.down = false;
  state.left = false;
  state.right = false;
}

/**
 * Resets all mobile input states immediately.
 */
export function resetAllMobileInputs(state: MobileInputState): void {
  state.up = false;
  state.down = false;
  state.left = false;
  state.right = false;
  state.bomb = false;
  state.dash = false;
  state.ultimate = false;
}

/**
 * High-reliability action button activation with frame-synchronized double-RAF fallback.
 * Prevents input drops and eliminates permanent "sticky button" state if pointer events are dropped.
 */
export function triggerMobileAction(
  state: MobileInputState,
  action: 'bomb' | 'dash' | 'ultimate',
  scheduler?: (cb: () => void) => void
): void {
  state[action] = true;
  const schedule =
    scheduler ??
    (typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16));

  schedule(() => {
    schedule(() => {
      if (state) {
        state[action] = false;
      }
    });
  });
}

/**
 * Immediate cancellation of an action input upon pointer cancel.
 */
export function cancelMobileAction(state: MobileInputState, action: 'bomb' | 'dash' | 'ultimate'): void {
  if (state) {
    state[action] = false;
  }
}

/**
 * Release handler for pointer up/leave.
 */
export function releaseMobileAction(
  state: MobileInputState,
  action: 'bomb' | 'dash' | 'ultimate',
  scheduler?: (cb: () => void) => void
): void {
  const schedule =
    scheduler ??
    (typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16));

  schedule(() => {
    if (state) {
      state[action] = false;
    }
  });
}
