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
 * Strictly returns all false for NaN, non-finite numbers, or distances below deadzone.
 *
 * @param angle Raw angle degree from NippleJS or touch event.
 * @param distance Optional distance/magnitude; if distance < 5 (deadzone), resets all directions.
 */
export function resolveJoystickDirection(
  angle: number,
  distance?: number
): { up: boolean; down: boolean; left: boolean; right: boolean } {
  // Guard against non-numeric, NaN, or non-finite angle values
  if (typeof angle !== 'number' || !Number.isFinite(angle) || Number.isNaN(angle)) {
    return { up: false, down: false, left: false, right: false };
  }

  // Guard against invalid, NaN, non-finite, or sub-deadzone distance (< 5px)
  if (
    distance !== undefined &&
    (typeof distance !== 'number' || !Number.isFinite(distance) || Number.isNaN(distance) || distance < 5)
  ) {
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
 * Resolves joystick direction directly from raw coordinate offsets (dx, dy).
 * Computes angle and euclidean distance while strictly handling (0,0), NaN, and non-finite values.
 */
export function resolveJoystickVector(
  dx: number,
  dy: number,
  deadzone: number = 5
): { up: boolean; down: boolean; left: boolean; right: boolean; angle: number; distance: number } {
  if (
    typeof dx !== 'number' ||
    typeof dy !== 'number' ||
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    Number.isNaN(dx) ||
    Number.isNaN(dy)
  ) {
    return { up: false, down: false, left: false, right: false, angle: 0, distance: 0 };
  }

  const distance = Math.hypot(dx, dy);
  if (distance < deadzone) {
    return { up: false, down: false, left: false, right: false, angle: 0, distance };
  }

  // Math.atan2(dy, dx) returns radians. In standard screen coordinates, dy points downwards.
  // Converting screen dy (inverted y) to standard mathematical angle (0=Right, 90=Up, 180=Left, 270=Down):
  let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (deg < 0) deg += 360;

  const dir = resolveJoystickDirection(deg, distance);
  return { ...dir, angle: deg, distance };
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

export type TouchControlTarget = 'joystick' | 'bomb' | 'dash' | 'ultimate';

export interface ActivePointerRecord {
  pointerId: number;
  target: TouchControlTarget;
  timestamp: number;
  startX?: number;
  startY?: number;
  currentX?: number;
  currentY?: number;
}

/**
 * Enterprise Multi-Touch Pointer Tracker & Collision Arbitrator.
 * Tracks concurrent touch pointer IDs, arbitrates pointer ID collisions / re-use,
 * isolates multi-finger control bindings, and recovers orphaned / dropped touch events cleanly.
 */
export class MultiTouchPointerTracker {
  private activePointers: Map<number, ActivePointerRecord> = new Map();
  private controlActivePointers: Map<TouchControlTarget, Set<number>> = new Map([
    ['joystick', new Set()],
    ['bomb', new Set()],
    ['dash', new Set()],
    ['ultimate', new Set()],
  ]);

  /**
   * Tracks a pointerdown / touchstart event.
   * If the pointerId is already registered to another control (ID collision or re-use without touchend),
   * the previous association is gracefully released first.
   */
  public onPointerDown(
    pointerId: number,
    target: TouchControlTarget,
    state: MobileInputState,
    coords?: { x: number; y: number },
    scheduler?: (cb: () => void) => void
  ): void {
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return;

    // Handle collision: if pointerId was already active on another target, clean it up
    const existing = this.activePointers.get(pointerId);
    if (existing && existing.target !== target) {
      this.releasePointerFromTarget(pointerId, existing.target, state);
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const record: ActivePointerRecord = {
      pointerId,
      target,
      timestamp: now,
      startX: coords?.x,
      startY: coords?.y,
      currentX: coords?.x,
      currentY: coords?.y,
    };

    this.activePointers.set(pointerId, record);
    this.controlActivePointers.get(target)!.add(pointerId);

    // Apply state change
    if (target !== 'joystick') {
      triggerMobileAction(state, target, scheduler);
    }
  }

  /**
   * Tracks pointermove / touchmove.
   * Updates coordinates, validates against NaN, and updates joystick direction if target is joystick.
   */
  public onPointerMove(
    pointerId: number,
    coords: { x: number; y: number },
    state: MobileInputState,
    origin?: { x: number; y: number }
  ): void {
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return;
    const record = this.activePointers.get(pointerId);
    if (!record) return;

    if (
      typeof coords?.x !== 'number' ||
      typeof coords?.y !== 'number' ||
      !Number.isFinite(coords.x) ||
      !Number.isFinite(coords.y)
    ) {
      // If coordinates are invalid or NaN, zero out joystick movement if this is the joystick
      if (record.target === 'joystick') {
        resetJoystickDirection(state);
      }
      return;
    }

    record.currentX = coords.x;
    record.currentY = coords.y;

    if (record.target === 'joystick' && origin) {
      const dx = coords.x - origin.x;
      const dy = coords.y - origin.y;
      const dir = resolveJoystickVector(dx, dy);
      state.up = dir.up;
      state.down = dir.down;
      state.left = dir.left;
      state.right = dir.right;
    }
  }

  /**
   * Tracks pointerup / touchend.
   * Removes pointer and clears target state if no other active pointers are touching that target.
   */
  public onPointerUp(
    pointerId: number,
    state: MobileInputState,
    scheduler?: (cb: () => void) => void
  ): void {
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return;
    const record = this.activePointers.get(pointerId);
    if (!record) return;

    this.activePointers.delete(pointerId);
    const targetSet = this.controlActivePointers.get(record.target);
    if (targetSet) {
      targetSet.delete(pointerId);
      // Only release control if NO OTHER pointer is pressing this control
      if (targetSet.size === 0) {
        if (record.target === 'joystick') {
          resetJoystickDirection(state);
        } else {
          releaseMobileAction(state, record.target, scheduler);
        }
      }
    }
  }

  /**
   * Tracks pointercancel / touchcancel.
   * Immediately clears action or joystick without waiting.
   */
  public onPointerCancel(pointerId: number, state: MobileInputState): void {
    if (typeof pointerId !== 'number' || !Number.isFinite(pointerId)) return;
    const record = this.activePointers.get(pointerId);
    if (!record) return;

    this.activePointers.delete(pointerId);
    const targetSet = this.controlActivePointers.get(record.target);
    if (targetSet) {
      targetSet.delete(pointerId);
      if (targetSet.size === 0) {
        if (record.target === 'joystick') {
          resetJoystickDirection(state);
        } else {
          cancelMobileAction(state, record.target);
        }
      }
    }
  }

  /**
   * Recovers dropped pointer events.
   * Any pointer older than maxAgeMs is deemed dropped/orphaned and pruned.
   * Returns count of recovered pointers.
   */
  public recoverDroppedPointers(
    state: MobileInputState,
    maxAgeMs: number = 3000,
    currentTime?: number
  ): number {
    const now = currentTime ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let recoveredCount = 0;

    for (const [pointerId, record] of this.activePointers.entries()) {
      if (now - record.timestamp > maxAgeMs) {
        this.activePointers.delete(pointerId);
        const targetSet = this.controlActivePointers.get(record.target);
        if (targetSet) {
          targetSet.delete(pointerId);
          if (targetSet.size === 0) {
            if (record.target === 'joystick') {
              resetJoystickDirection(state);
            } else {
              cancelMobileAction(state, record.target);
            }
          }
        }
        recoveredCount++;
      }
    }

    return recoveredCount;
  }

  /**
   * Resets all pointer tracking and zeroes the input state.
   */
  public reset(state: MobileInputState): void {
    this.activePointers.clear();
    for (const set of this.controlActivePointers.values()) {
      set.clear();
    }
    resetAllMobileInputs(state);
  }

  public getActivePointerCount(target?: TouchControlTarget): number {
    if (target) {
      return this.controlActivePointers.get(target)?.size ?? 0;
    }
    return this.activePointers.size;
  }

  public hasPointer(pointerId: number): boolean {
    return this.activePointers.has(pointerId);
  }

  private releasePointerFromTarget(
    pointerId: number,
    target: TouchControlTarget,
    state: MobileInputState
  ): void {
    const targetSet = this.controlActivePointers.get(target);
    if (targetSet) {
      targetSet.delete(pointerId);
      if (targetSet.size === 0) {
        if (target === 'joystick') {
          resetJoystickDirection(state);
        } else {
          cancelMobileAction(state, target);
        }
      }
    }
  }
}

